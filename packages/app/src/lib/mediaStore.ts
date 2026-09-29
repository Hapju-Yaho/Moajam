import { readNative, writeNative } from './nativeStorage';
import { deleteNativeWorkspaceMedia } from './nativeStorage';
import { serverConfigured } from './remote';
import { readRemoteMedia, writeRemoteMedia } from './remote-media';
export async function deleteWorkspaceMedia(workspaceId: string): Promise<void> {
  deleteNativeWorkspaceMedia(workspaceId);
}
export async function readMedia<T>(key: string, owner?: string): Promise<T | undefined> {
  if (serverConfigured) return readRemoteMedia<T>(key, owner);
  return readNative<T>(`media/${owner ?? 'm1'}/${key}`);
}
export async function writeMedia<T>(key: string, value: T, owner?: string): Promise<void> {
  if (serverConfigured) return writeRemoteMedia(key, value, owner);
  writeNative(`media/${owner ?? 'm1'}/${key}`, value);
}
