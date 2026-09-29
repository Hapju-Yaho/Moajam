import { useEffect, useState } from 'react';
import { Share } from 'react-native';
import { getDocumentAsync } from 'expo-document-picker';
import { ActionButton, Meta, Surface, Heading, FlexRow } from './ProductUI';
import { readMedia, writeMedia } from '../lib/mediaStore';
import { keepNativeFile } from '../lib/nativeStorage';
import { serverConfigured } from '../lib/remote';
import { RemoteMediaLibrary } from './RemoteMediaLibrary';
type Asset = { id: string; uri: string; name: string };
export function MediaLibrary({ scopeKey }: { scopeKey: string }) {
  return serverConfigured ? (
    <RemoteMediaLibrary key={scopeKey} scopeKey={scopeKey} />
  ) : (
    <LocalMediaLibrary key={scopeKey} scopeKey={scopeKey} />
  );
}
function LocalMediaLibrary({ scopeKey }: { scopeKey: string }) {
  const [files, setFiles] = useState<Asset[]>([]);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    let alive = true;
    setReady(false);
    void readMedia<Asset[]>(`library/${scopeKey}`)
      .then((value) => {
        if (alive) {
          setFiles(value ?? []);
          setReady(true);
        }
      })
      .catch(() => {
        if (alive) setError('자료를 읽지 못했습니다.');
      });
    return () => {
      alive = false;
    };
  }, [scopeKey]);
  async function save(next: Asset[]) {
    await writeMedia(`library/${scopeKey}`, next);
    setFiles(next);
  }
  async function upload() {
    setBusy(true);
    setError('');
    try {
      const result = await getDocumentAsync({
        type: ['audio/*', 'image/*', 'application/pdf', 'application/xml', 'text/xml'],
        copyToCacheDirectory: true,
      });
      if (result.canceled) return;
      const file = result.assets[0];
      if ((file.size ?? 0) > 104857600) throw new Error('100MB 이하 파일을 선택해주세요.');
      const uri = keepNativeFile(file.uri, file.name);
      await save([...files, { id: uri, uri, name: file.name }]);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : '파일 저장에 실패했습니다.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <Surface>
      <Heading>자료 보관함</Heading>
      <Meta>이 기기에 파일을 보관합니다.</Meta>
      <ActionButton disabled={!ready || busy} onPress={() => void upload()}>
        파일 추가
      </ActionButton>
      {error ? <Meta accessibilityRole="alert">{error}</Meta> : null}
      {files.map((file) => (
        <FlexRow key={file.id} wrap>
          <Meta style={{ flex: 1 }}>{file.name}</Meta>
          <ActionButton
            secondary
            onPress={() =>
              void Share.share({ url: file.uri, message: file.name }).catch(() =>
                setError('파일을 공유하지 못했습니다.'),
              )
            }
          >
            공유
          </ActionButton>
          <ActionButton
            secondary
            disabled={busy}
            onPress={() => {
              setBusy(true);
              void save(files.filter((item) => item.id !== file.id))
                .catch(() => setError('삭제하지 못했습니다.'))
                .finally(() => setBusy(false));
            }}
          >
            목록에서 삭제
          </ActionButton>
        </FlexRow>
      ))}
    </Surface>
  );
}
