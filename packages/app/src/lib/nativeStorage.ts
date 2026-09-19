import { Directory, File, Paths } from 'expo-file-system';
const directory = new Directory(Paths.document, 'moajam');
export function deleteNativeWorkspaceMedia(workspaceId: string) {
  if (!directory.exists) return;
  for (const entry of directory.list()) {
    if (!(entry instanceof File) || !entry.name.endsWith('.json')) continue;
    const key = decodeURIComponent(entry.name.slice(0, -5));
    if (!key.startsWith('media/') || !key.split('/').includes(workspaceId)) continue;
    const removeAttachments = (value: unknown) => {
      if (typeof value === 'string' && value.startsWith(directory.uri.replace(/\/$/, '') + '/')) {
        const file = new File(value);
        if (file.parentDirectory.uri === directory.uri && file.exists) file.delete();
      } else if (value && typeof value === 'object')
        Object.values(value).forEach(removeAttachments);
    };
    removeAttachments(JSON.parse(entry.textSync()));
    entry.delete();
  }
}
export function readNative<T>(key: string): T | undefined {
  const file = new File(directory, `${encodeURIComponent(key)}.json`);
  return file.exists ? (JSON.parse(file.textSync()) as T) : undefined;
}
export function writeNative(key: string, value: unknown) {
  directory.create({ intermediates: true, idempotent: true });
  new File(directory, `${encodeURIComponent(key)}.json`).write(JSON.stringify(value));
}
export function keepNativeFile(uri: string, name: string) {
  directory.create({ intermediates: true, idempotent: true });
  const target = new File(
    directory,
    `${Date.now()}-${Math.random().toString(36).slice(2)}-${name.replace(/[^\w.-]/g, '_')}`,
  );
  new File(uri).copy(target);
  return target.uri;
}
