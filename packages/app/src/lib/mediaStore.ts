import { readNative, writeNative } from './nativeStorage';
import { deleteNativeWorkspaceMedia } from './nativeStorage';
import { currentIdentity, serverConfigured } from './remote';
import { readRemoteMedia, writeRemoteMedia } from './remote-media';
export async function deleteWorkspaceMedia(workspaceId: string): Promise<void> {
  deleteNativeWorkspaceMedia(workspaceId);
}
export async function readMedia<T>(key: string, owner?: string): Promise<T | undefined> {
  if (serverConfigured && !key.startsWith('local-recording/'))
    return readRemoteMedia<T>(key, owner);
  const localOwner = owner ?? (key.startsWith('local-recording/') ? await currentIdentity() : 'm1');
  if (!localOwner) throw new Error('로그인이 필요합니다.');
  return readNative<T>(`media/${localOwner}/${key}`);
}
export async function writeMedia<T>(key: string, value: T, owner?: string): Promise<void> {
  if (serverConfigured && !key.startsWith('local-recording/'))
    return writeRemoteMedia(key, value, owner);
  const localOwner = owner ?? (key.startsWith('local-recording/') ? await currentIdentity() : 'm1');
  if (!localOwner) throw new Error('로그인이 필요합니다.');
  writeNative(`media/${localOwner}/${key}`, value);
}
