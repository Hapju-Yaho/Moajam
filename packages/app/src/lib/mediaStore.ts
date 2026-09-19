import { readNative, writeNative } from './nativeStorage';
import { deleteNativeWorkspaceMedia } from './nativeStorage';
export async function deleteWorkspaceMedia(workspaceId: string): Promise<void> {
  deleteNativeWorkspaceMedia(workspaceId);
}
export async function readMedia<T>(key: string, owner = 'm1'): Promise<T | undefined> {
  return readNative<T>(`media/${owner}/${key}`);
}
export async function writeMedia<T>(key: string, value: T, owner = 'm1'): Promise<void> {
  writeNative(`media/${owner}/${key}`, value);
}
