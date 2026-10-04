import { File } from 'expo-file-system';
import { fetch as expoFetch } from 'expo/fetch';
import { api, currentIdentity } from './remote';
import type { UploadRequest } from './remote-client';
export async function uploadNativeFile(
  uri: string,
  name: string,
  scope: string,
  workspaceId?: string,
  mime?: string,
  expectedUser?: string,
) {
  const file = new File(uri);
  const extension = uri.split('.').at(-1)?.toLowerCase() ?? '';
  const type =
    mime ||
    file.type ||
    {
      m4a: 'audio/mp4',
      mp3: 'audio/mpeg',
      wav: 'audio/wav',
      xml: 'application/xml',
      pdf: 'application/pdf',
      png: 'image/png',
      jpg: 'image/jpeg',
    }[extension] ||
    'application/octet-stream';
  if (!file.size || file.size > 104857600) throw new Error('100MB 이하 파일을 선택해주세요.');
  const user = await currentIdentity();
  if (!user) throw new Error('로그인이 필요합니다.');
  if (expectedUser && user !== expectedUser)
    throw new Error('계정이 변경되어 업로드를 중단했습니다.');
  const upload = await api<UploadRequest>(
    '/assets/uploads',
    'POST',
    { name, mime: type, size: file.size, scope, ...(workspaceId ? { workspaceId } : {}) },
    user,
  );
  let response: { ok: boolean };
  if (upload.uploadFormat === 'raw') {
    response = await expoFetch(upload.signedUrl, {
      method: 'PUT',
      body: file,
      headers: upload.headers,
    });
  } else {
    const form = new FormData();
    form.append('cacheControl', '3600');
    form.append('', { uri, name, type } as unknown as Blob);
    response = await fetch(upload.signedUrl, { method: 'PUT', body: form });
  }
  if (!response.ok) throw new Error('파일을 업로드하지 못했습니다.');
  await api(`/assets/${upload.assetId}/complete`, 'POST', undefined, user);
  return upload.assetId;
}
