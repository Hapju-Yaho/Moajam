import { api, currentIdentity } from './remote';
type Document<T> = { value: T; revision: number };
const revisions = new Map<string, number>();
const queues = new Map<string, Promise<unknown>>();
const failures = new Map<string, Error>();
async function ownerScope(key: string, expected?: string) {
  const user = await currentIdentity();
  if (!user || (expected && expected !== user))
    throw new Error('계정이 변경되어 저장을 중단했습니다.');
  return {
    user,
    ref: `${user}/${key}`,
    path: key === 'preferences' ? '/me/preferences' : `/me/documents/${encodeURIComponent(key)}`,
  };
}
export async function readPersonal<T>(key: string, owner?: string): Promise<T | undefined> {
  const { user, ref, path } = await ownerScope(key, owner);
  await queues.get(ref)?.catch(() => {});
  const document = await api<Document<T> | null>(path, 'GET', undefined, user);
  revisions.set(ref, document?.revision ?? 0);
  failures.delete(ref);
  return document?.value;
}
export async function assertPersonalUnchanged(key: string, owner?: string): Promise<void> {
  const { user, ref, path } = await ownerScope(key, owner);
  await queues.get(ref)?.catch(() => {});
  const document = await api<Document<unknown> | null>(path, 'GET', undefined, user);
  if ((document?.revision ?? 0) !== (revisions.get(ref) ?? 0))
    throw new Error('서버에 변경사항이 존재합니다. 새로고침 후 공유하기를 눌러주세요.');
}
export async function writePersonal<T>(key: string, value: T, owner?: string): Promise<void> {
  const { user, ref, path } = await ownerScope(key, owner);
  const next = (queues.get(ref) ?? Promise.resolve())
    .catch(() => {})
    .then(async () => {
      const failure = failures.get(ref);
      if (failure) throw failure;
      // Never fetch the latest revision here: an unobserved update must cause a conflict.
      const result = await api<Document<T>>(
        path,
        'PUT',
        { revision: revisions.get(ref) ?? 0, value },
        user,
      );
      revisions.set(ref, result.revision);
    })
    .catch((error: Error) => {
      failures.set(ref, error);
      throw error;
    });
  queues.set(ref, next);
  try {
    await next;
  } finally {
    if (queues.get(ref) === next) queues.delete(ref);
  }
}
