import { clientId } from './clientId';
import { currentIdentity, serverConfigured } from './remote';
import { readRemoteMedia, writeRemoteMedia } from './remote-media.web';

const prefix = 'moajam-mock-document/';
let database: Promise<IDBDatabase> | undefined;
const queues = new Map<string, Promise<void>>();
const blobs = new WeakMap<Blob, Map<string, string>>();
type BlobRef = { __moajamMockBlob: string };

function open() {
  database ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('moajam-media', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('entries');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      database = undefined;
      reject(request.error);
    };
  });
  return database;
}
async function readEntry<T>(key: string): Promise<T | undefined> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const request = db.transaction('entries').objectStore('entries').get(key);
    request.onsuccess = () => resolve(request.result as T | undefined);
    request.onerror = () => reject(request.error);
  });
}
async function saveBlob(key: string, value: Blob) {
  const db = await open();
  return new Promise<void>((resolve, reject) => {
    const transaction = db.transaction('entries', 'readwrite');
    transaction.objectStore('entries').put(value, key);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}
async function encode(value: unknown, scope: string): Promise<unknown> {
  if (value instanceof Blob) {
    const cached = blobs.get(value)?.get(scope);
    if (cached) return { __moajamMockBlob: cached };
    const key = 'blob/' + scope + '/' + clientId();
    await saveBlob(key, value);
    const refs = blobs.get(value) ?? new Map<string, string>();
    refs.set(scope, key);
    blobs.set(value, refs);
    return { __moajamMockBlob: key };
  }
  if (Array.isArray(value)) return Promise.all(value.map((item) => encode(item, scope)));
  if (value && typeof value === 'object')
    return Object.fromEntries(
      await Promise.all(
        Object.entries(value).map(async ([key, item]) => [key, await encode(item, scope)]),
      ),
    );
  return value;
}
async function decode(value: unknown, scope: string): Promise<unknown> {
  if (Array.isArray(value)) return Promise.all(value.map((item) => decode(item, scope)));
  if (value && typeof value === 'object') {
    if ('__moajamMockBlob' in value) {
      const key = (value as BlobRef).__moajamMockBlob;
      if (typeof key !== 'string' || !key.startsWith('blob/' + scope + '/'))
        throw new Error('첨부파일 참조가 올바르지 않습니다.');
      const blob = await readEntry<Blob>(key);
      if (!(blob instanceof Blob)) throw new Error('저장된 첨부파일을 찾을 수 없습니다.');
      blobs.set(blob, new Map([[scope, key]]));
      return blob;
    }
    return Object.fromEntries(
      await Promise.all(
        Object.entries(value).map(async ([key, item]) => [key, await decode(item, scope)]),
      ),
    );
  }
  return value;
}
async function saveDocument(scope: string, value: unknown) {
  const previous = queues.get(scope) ?? Promise.resolve();
  const task = previous
    .catch(() => {})
    .then(async () => {
      const encoded = await encode(value, scope);
      // Commit the document only after attachments are saved. Quota failures preserve the old document.
      localStorage.setItem(prefix + scope, JSON.stringify({ version: 1, value: encoded }));
    });
  queues.set(scope, task);
  try {
    await task;
  } finally {
    if (queues.get(scope) === task) queues.delete(scope);
  }
}
export async function readMedia<T>(key: string, owner?: string): Promise<T | undefined> {
  if (serverConfigured) return readRemoteMedia<T>(key, owner);
  const user = owner ?? (await currentIdentity());
  if (!user) throw new Error('로그인이 필요합니다.');
  const scope = user + '/' + key;
  await queues.get(scope)?.catch(() => {});
  const stored = localStorage.getItem(prefix + scope);
  if (stored !== null) {
    const record = JSON.parse(stored) as { version: number; value: unknown };
    if (record.version !== 1) throw new Error('저장된 목데이터 형식을 확인해주세요.');
    return (await decode(record.value, scope)) as T;
  }
  // Read-through migration preserves the previous mock records and their original Blob objects.
  const legacy = await readEntry<T>(scope);
  if (queues.has(scope) || localStorage.getItem(prefix + scope) !== null)
    return readMedia<T>(key, owner);
  if (legacy !== undefined) await saveDocument(scope, legacy);
  return legacy;
}
export async function writeMedia<T>(key: string, value: T, owner?: string): Promise<void> {
  if (serverConfigured) return writeRemoteMedia(key, value, owner);
  const user = owner ?? (await currentIdentity());
  if (!user) throw new Error('로그인이 필요합니다.');
  await saveDocument(user + '/' + key, value);
}
export async function deleteWorkspaceMedia(workspaceId: string): Promise<void> {
  const belongs = (key: string) => key.split('/').includes(workspaceId);
  await Promise.all(
    [...queues].filter(([key]) => belongs(key)).map(([, task]) => task.catch(() => {})),
  );
  const db = await open();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction('entries', 'readwrite');
    const request = transaction.objectStore('entries').openCursor();
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) return;
      if (belongs(String(cursor.key))) cursor.delete();
      cursor.continue();
    };
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
  for (let index = localStorage.length - 1; index >= 0; index--) {
    const key = localStorage.key(index);
    if (key?.startsWith(prefix) && belongs(key.slice(prefix.length))) localStorage.removeItem(key);
  }
}
