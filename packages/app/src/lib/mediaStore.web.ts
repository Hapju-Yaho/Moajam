import { currentIdentity } from './remote';
let database: Promise<IDBDatabase> | undefined;
export async function deleteWorkspaceMedia(workspaceId: string): Promise<void> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('entries', 'readwrite');
    const request = transaction.objectStore('entries').openCursor();
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) return;
      if (String(cursor.key).split('/').includes(workspaceId)) cursor.delete();
      cursor.continue();
    };
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}
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
export async function readMedia<T>(key: string, owner?: string): Promise<T | undefined> {
  const user = owner ?? (await currentIdentity());
  if (!user) throw new Error('로그인이 필요합니다.');
  key = `${user}/${key}`;
  const db = await open();
  return new Promise((resolve, reject) => {
    const request = db.transaction('entries').objectStore('entries').get(key);
    request.onsuccess = () => resolve(request.result as T | undefined);
    request.onerror = () => reject(request.error);
  });
}
export async function writeMedia<T>(key: string, value: T, owner?: string): Promise<void> {
  const user = owner ?? (await currentIdentity());
  if (!user) throw new Error('로그인이 필요합니다.');
  key = `${user}/${key}`;
  const db = await open();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('entries', 'readwrite');
    transaction.objectStore('entries').put(value, key);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}
