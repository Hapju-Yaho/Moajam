export type PersonalClip = {
  id: string;
  ownerId: string;
  name: string;
  blob: Blob;
  type: string;
  memo?: string;
  kind?: 'audio' | 'midi';
};

export const clipLibraryChanged = 'moajam-personal-clip-library-changed';
let database: Promise<IDBDatabase> | undefined;
function openLibrary() {
  database ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('moajam-personal-clips', 1);
    request.onupgradeneeded = () => {
      const store = request.result.createObjectStore('clips', { keyPath: ['ownerId', 'id'] });
      store.createIndex('ownerId', 'ownerId');
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      database = undefined;
      reject(request.error);
    };
  });
  return database;
}
function requireOwner(ownerId: string) {
  if (!ownerId) throw new Error('로그인이 필요합니다.');
}
export async function listPersonalClips(ownerId: string): Promise<PersonalClip[]> {
  requireOwner(ownerId);
  const db = await openLibrary();
  return new Promise((resolve, reject) => {
    const request = db.transaction('clips').objectStore('clips').index('ownerId').getAll(ownerId);
    request.onsuccess = () => resolve(request.result as PersonalClip[]);
    request.onerror = () => reject(request.error);
  });
}
async function mutate(ownerId: string, action: (store: IDBObjectStore) => void) {
  requireOwner(ownerId);
  const db = await openLibrary();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction('clips', 'readwrite');
    action(transaction.objectStore('clips'));
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
  window.dispatchEvent(new Event(clipLibraryChanged));
}
export async function savePersonalClip(clip: PersonalClip) {
  if (!(clip.blob instanceof Blob) || !clip.blob.size || clip.blob.size > 104857600)
    throw new Error('100MB 이하의 오디오·미디 클립만 보관할 수 있어요.');
  await mutate(clip.ownerId, (store) => store.add(clip));
}
export async function updatePersonalClip(
  ownerId: string,
  id: string,
  patch: { name?: string; memo?: string },
) {
  await mutate(ownerId, (store) => {
    const request = store.get([ownerId, id]);
    request.onsuccess = () => {
      if (request.result) store.put({ ...request.result, ...patch });
    };
  });
}
export async function deletePersonalClip(ownerId: string, id: string) {
  await mutate(ownerId, (store) => store.delete([ownerId, id]));
}
