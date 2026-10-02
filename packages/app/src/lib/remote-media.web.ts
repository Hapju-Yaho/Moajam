import { api, currentIdentity, uploadRemoteFile } from './remote';
import { readPersonal, writePersonal, assertPersonalUnchanged } from './personal-store';
const assets = new WeakMap<Blob, { user: string; scope?: string; id: Promise<string> }>();
const bandRevisions = new Map<string, number>();
function bandSession(key: string) {
  const score = /^band-score\/([0-9a-f]{8}-[0-9a-f-]{27})\/([\w-]+)$/i.exec(key);
  if (score)
    return {
      workspaceId: score[1],
      path: `/workspaces/${score[1]}/scores/${encodeURIComponent(score[2])}`,
    };
  const match = /^practice\/([0-9a-f]{8}-[0-9a-f-]{27})\/([\w-]+)$/i.exec(key);
  return match
    ? {
        workspaceId: match[1],
        path: `/workspaces/${match[1]}/practice/${encodeURIComponent(match[2])}`,
      }
    : undefined;
}
type BandDocument = { revision: number; value: { data: unknown } };
const queues = new Map<string, Promise<unknown>>();
type AssetRef = { __moajamAssetId: string };
export async function encode(
  value: unknown,
  key: string,
  user: string,
  name = 'recording.webm',
): Promise<unknown> {
  if (value instanceof Blob) {
    const band = bandSession(key);
    let cached = assets.get(value);
    if (!cached || cached.user !== user || cached.scope !== key) {
      const uploaded = uploadRemoteFile(
        value,
        value instanceof File ? value.name : name,
        band ? key : `personal/${key}`,
        band?.workspaceId,
        user,
      );
      const ready = uploaded.then(async (id) => {
        if (band) await api(`/assets/${id}/visibility`, 'PATCH', { visibility: 'WORKSPACE' }, user);
        return id;
      });
      cached = { user, scope: key, id: ready };
      assets.set(value, cached);
      ready.catch(() => assets.delete(value));
    }
    return { __moajamAssetId: await cached.id };
  }
  if (Array.isArray(value)) return Promise.all(value.map((item) => encode(item, key, user, name)));
  if (value && typeof value === 'object') {
    const row = value as Record<string, unknown>;
    return Object.fromEntries(
      await Promise.all(
        Object.entries(row).map(async ([field, item]) => [
          field,
          await encode(item, key, user, typeof row.name === 'string' ? row.name : name),
        ]),
      ),
    );
  }
  return value;
}
export async function decode(value: unknown, user: string, key: string): Promise<unknown> {
  if (Array.isArray(value)) return Promise.all(value.map((item) => decode(item, user, key)));
  if (value && typeof value === 'object') {
    if ('__moajamAssetId' in value) {
      const id = (value as AssetRef).__moajamAssetId;
      const { url } = await api<{ url: string }>(`/assets/${id}/download`, 'GET', undefined, user);
      const result = await fetch(url);
      if (!result.ok) throw new Error('개인 파일을 불러오지 못했습니다.');
      const blob = await result.blob();
      assets.set(blob, { user, scope: key, id: Promise.resolve(id) });
      return blob;
    }
    return Object.fromEntries(
      await Promise.all(
        Object.entries(value).map(async ([k, v]) => [k, await decode(v, user, key)]),
      ),
    );
  }
  return value;
}
export async function readRemoteMedia<T>(key: string, owner?: string): Promise<T | undefined> {
  const user = owner ?? (await currentIdentity());
  if (!user) throw new Error('로그인이 필요합니다.');
  await queues.get(`${user}/${key}`)?.catch(() => {});
  const band = bandSession(key);
  if (band) {
    const document = await api<BandDocument | null>(band.path, 'GET', undefined, user);
    const decoded = await decode(document?.value.data, user, key);
    bandRevisions.set(`${user}/${key}`, document?.revision ?? 0);
    return decoded as T | undefined;
  }
  return (await decode(await readPersonal(key, user), user, key)) as T | undefined;
}
export async function writeRemoteMedia(key: string, value: unknown, owner?: string) {
  const user = owner ?? (await currentIdentity());
  if (!user) throw new Error('로그인이 필요합니다.');
  const ref = `${user}/${key}`;
  const task = (queues.get(ref) ?? Promise.resolve())
    .catch(() => {})
    .then(async () => {
      const band = bandSession(key);
      if (band) {
        const revision = bandRevisions.get(ref) ?? 0;
        const current = await api<BandDocument | null>(band.path, 'GET', undefined, user);
        if ((current?.revision ?? 0) !== revision)
          throw new Error('서버에 변경사항이 존재합니다. 새로고침 후 공유하기를 눌러주세요.');
        const result = await api<BandDocument>(
          band.path,
          'PUT',
          { revision, value: { data: await encode(value, key, user) } },
          user,
        );
        bandRevisions.set(ref, result.revision);
        return;
      }
      if (key.startsWith('practice/')) await assertPersonalUnchanged(key, user);
      return writePersonal(key, await encode(value, key, user), user);
    });
  queues.set(ref, task);
  try {
    await task;
  } finally {
    if (queues.get(ref) === task) queues.delete(ref);
  }
}
