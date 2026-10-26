import { Directory, File, Paths } from 'expo-file-system';
import { api, currentIdentity } from './remote';
import { readPersonal, writePersonal } from './personal-store';
import { uploadNativeFile } from './native-upload';
const uploads = new Map<string, Promise<string>>();
const queues = new Map<string, Promise<unknown>>();
const revisions = new Map<string, number>();
function projectSession(key: string) {
  const match = /^daw-project\/([0-9a-f-]{36})\/([0-9a-f-]{36})$/i.exec(key);
  return match
    ? { workspaceId: match[1], path: `/workspaces/${match[1]}/daw-projects/${match[2]}` }
    : undefined;
}
async function encode(value: unknown, key: string, user: string): Promise<unknown> {
  if (Array.isArray(value)) return Promise.all(value.map((item) => encode(item, key, user)));
  if (!value || typeof value !== 'object') return value;
  const row = { ...value } as Record<string, unknown>;
  if (typeof row.uri === 'string' && /^(file|content):/.test(row.uri)) {
    const band = projectSession(key);
    const ref = `${user}/${band?.workspaceId ?? 'personal'}/${row.uri}`;
    let task = uploads.get(ref);
    if (!task) {
      task = uploadNativeFile(
        row.uri,
        String(row.name ?? 'recording.m4a'),
        band ? key : `personal/${key}`,
        band?.workspaceId,
        undefined,
        user,
      );
      if (band)
        task = task.then(async (id) => {
          await api(`/assets/${id}/visibility`, 'PATCH', { visibility: 'WORKSPACE' }, user);
          return id;
        });
      uploads.set(ref, task);
      task.catch(() => uploads.delete(ref));
    }
    row.blob = { __moajamAssetId: await task };
    delete row.uri;
  }
  return Object.fromEntries(
    await Promise.all(Object.entries(row).map(async ([k, v]) => [k, await encode(v, key, user)])),
  );
}
async function decode(value: unknown, user: string, key: string): Promise<unknown> {
  if (Array.isArray(value)) return Promise.all(value.map((item) => decode(item, user, key)));
  if (!value || typeof value !== 'object') return value;
  const row = value as Record<string, unknown>;
  const blob = row.blob as { __moajamAssetId?: string } | undefined;
  if (blob?.__moajamAssetId) {
    const id = blob.__moajamAssetId;
    const { url } = await api<{ url: string }>(`/assets/${id}/download`, 'GET', undefined, user);
    const dir = new Directory(Paths.cache, 'moajam', user);
    dir.create({ intermediates: true, idempotent: true });
    const path = new File(dir, id);
    if (!path.exists) await File.downloadFileAsync(url, path, { idempotent: true });
    uploads.set(
      `${user}/${projectSession(key)?.workspaceId ?? 'personal'}/${path.uri}`,
      Promise.resolve(id),
    );
    return { ...row, uri: path.uri };
  }
  return Object.fromEntries(
    await Promise.all(Object.entries(row).map(async ([k, v]) => [k, await decode(v, user, key)])),
  );
}
export async function readRemoteMedia<T>(key: string, owner?: string): Promise<T | undefined> {
  const user = owner ?? (await currentIdentity());
  if (!user) throw new Error('로그인이 필요합니다.');
  await queues.get(`${user}/${key}`)?.catch(() => {});
  const project = projectSession(key);
  if (project) {
    const document = await api<{ revision: number; value: { data: unknown } }>(
      project.path,
      'GET',
      undefined,
      user,
    );
    const result = await decode(document.value.data, user, key);
    revisions.set(`${user}/${key}`, document.revision);
    return result as T;
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
      const project = projectSession(key);
      if (project) {
        const revision = revisions.get(ref);
        if (!revision) throw new Error('프로젝트를 다시 불러온 후 저장해주세요.');
        const result = await api<{ revision: number }>(
          project.path,
          'PUT',
          { revision, value: { data: await encode(value, key, user) } },
          user,
        );
        revisions.set(ref, result.revision);
        return;
      }
      return writePersonal(key, await encode(value, key, user), user);
    });
  queues.set(ref, task);
  try {
    await task;
  } finally {
    if (queues.get(ref) === task) queues.delete(ref);
  }
}
