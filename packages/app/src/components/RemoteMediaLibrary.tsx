import { useEffect, useState } from 'react';
import { Linking } from 'react-native';
import { getDocumentAsync } from 'expo-document-picker';
import { api } from '../lib/remote';
import { uploadNativeFile } from '../lib/native-upload';
import { useIdentity } from '../state/Identity';
import { ActionButton, Heading, Meta, Surface, FlexRow } from './ProductUI';
type Asset = { id: string; name: string; ownerId: string; visibility: string };
export function RemoteMediaLibrary({ scopeKey }: { scopeKey: string }) {
  const user = useIdentity();
  const workspaceId = /^(song|session)\//.test(scopeKey) ? scopeKey.split('/')[1] : undefined;
  const [files, setFiles] = useState<Asset[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const path = `/assets?scope=${encodeURIComponent(scopeKey)}${workspaceId ? `&workspaceId=${workspaceId}` : ''}`;
  useEffect(() => {
    let active = true;
    setFiles([]);
    void api<Asset[]>(path)
      .then((rows) => {
        if (active) setFiles(rows);
      })
      .catch((error) => {
        if (active) setError(error.message);
      });
    return () => {
      active = false;
    };
  }, [path]);
  async function action(work: () => Promise<unknown>) {
    setBusy(true);
    setError('');
    try {
      await work();
      setFiles(await api<Asset[]>(path));
    } catch (error) {
      setError(error instanceof Error ? error.message : '처리하지 못했습니다.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <Surface>
      <Heading>자료 보관함</Heading>
      <Meta>내 파일은 비공개로 저장되며, 직접 선택한 자료만 밴드에 공유됩니다.</Meta>
      <ActionButton
        disabled={busy}
        onPress={() =>
          void action(async () => {
            const result = await getDocumentAsync({
              type: ['audio/*', 'image/*', 'application/pdf', 'application/xml', 'text/xml'],
              copyToCacheDirectory: true,
            });
            if (!result.canceled) {
              const file = result.assets[0];
              await uploadNativeFile(file.uri, file.name, scopeKey, workspaceId, file.mimeType);
            }
          })
        }
      >
        파일 추가
      </ActionButton>
      {error ? <Meta accessibilityRole="alert">{error}</Meta> : null}
      {files.map((file) => (
        <FlexRow key={file.id} wrap>
          <Meta>
            {file.name} · {file.visibility === 'WORKSPACE' ? '밴드 공유' : '비공개'}
          </Meta>
          <ActionButton
            secondary
            disabled={busy}
            onPress={() =>
              void action(async () => {
                const { url } = await api<{ url: string }>(`/assets/${file.id}/download`);
                await Linking.openURL(url);
              })
            }
          >
            열기 / 다운로드
          </ActionButton>
          {file.ownerId === user && (
            <>
              {workspaceId && (
                <ActionButton
                  secondary
                  disabled={busy}
                  onPress={() =>
                    void action(() =>
                      api(`/assets/${file.id}/visibility`, 'PATCH', {
                        visibility: file.visibility === 'WORKSPACE' ? 'PRIVATE' : 'WORKSPACE',
                      }),
                    )
                  }
                >
                  {file.visibility === 'WORKSPACE' ? '공유 해제' : '밴드에 공유'}
                </ActionButton>
              )}
              <ActionButton
                secondary
                disabled={busy}
                onPress={() => void action(() => api(`/assets/${file.id}`, 'DELETE'))}
              >
                삭제
              </ActionButton>
            </>
          )}
        </FlexRow>
      ))}
    </Surface>
  );
}
