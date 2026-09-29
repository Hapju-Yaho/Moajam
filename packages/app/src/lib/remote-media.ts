import { Directory, File, Paths } from 'expo-file-system';
import { api, currentIdentity } from './remote';
import { readPersonal, writePersonal } from './personal-store';
import { uploadNativeFile } from './native-upload';
const uploads = new Map<string, Promise<string>>();
const queues = new Map<string, Promise<unknown>>();
async function encode(value: unknown, key: string, user: string): Promise<unknown> {
  if (Array.isArray(value)) return Promise.all(value.map((item) => encode(item, key, user)));
  if (!value || typeof value !== 'object') return value;
  const row = { ...value } as Record<string, unknown>;
  if (typeof row.uri === 'string' && /^(file|content):/.test(row.uri)) {
    const ref = `${user}/${row.uri}`;
    let task = uploads.get(ref);
    if (!task) {
      task = uploadNativeFile(
        row.uri,
        String(row.name ?? 'recording.m4a'),
        `personal/${key}`,
        undefined,
        undefined,
        user,
      );
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
async function decode(value: unknown, user: string): Promise<unknown> {
  if (Array.isArray(value)) return Promise.all(value.map((item) => decode(item, user)));
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
    uploads.set(`${user}/${path.uri}`, Promise.resolve(id));
    return { ...row, uri: path.uri };
  }
  return Object.fromEntries(
    await Promise.all(Object.entries(row).map(async ([k, v]) => [k, await decode(v, user)])),
  );
}
export async function readRemoteMedia<T>(key: string, owner?: string): Promise<T | undefined> {
  const user = owner ?? (await currentIdentity());
  if (!user) throw new Error('로그인이 필요합니다.');
  await queues.get(`${user}/${key}`)?.catch(() => {});
  return (await decode(await readPersonal(key, user), user)) as T | undefined;
}
export async function writeRemoteMedia(key: string, value: unknown, owner?: string) {
  const user = owner ?? (await currentIdentity());
  if (!user) throw new Error('로그인이 필요합니다.');
  const ref = `${user}/${key}`;
  const task = (queues.get(ref) ?? Promise.resolve())
    .catch(() => {})
    .then(async () => writePersonal(key, await encode(value, key, user), user));
  queues.set(ref, task);
  try {
    await task;
  } finally {
    if (queues.get(ref) === task) queues.delete(ref);
  }
}
