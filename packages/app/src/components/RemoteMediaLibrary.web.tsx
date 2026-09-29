import { useEffect, useState, useCallback } from 'react';
import { api, uploadRemoteFile } from '../lib/remote';
import { useMockAppState } from '../state/MockAppState';
import { ActionButton, Copy, FlexRow, Heading, Meta, Surface } from './ProductUI';
type Asset = {
  id: string;
  name: string;
  mime: string;
  size: number;
  ownerId: string;
  visibility: string;
};
export function RemoteMediaLibrary({ scopeKey }: { scopeKey: string }) {
  const { currentUserId } = useMockAppState();
  const band =
    scopeKey.startsWith('song/') || scopeKey.startsWith('session/')
      ? scopeKey.split('/')[1]
      : undefined;
  const [files, setFiles] = useState<Asset[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<{ url: string; file: Asset } | null>(null);
  const [query, setQuery] = useState('');
  const reload = useCallback(
    async () =>
      setFiles(
        await api(
          `/assets?${new URLSearchParams({ scope: scopeKey, ...(band ? { workspaceId: band } : {}) })}`,
        ),
      ),
    [scopeKey, band],
  );
  useEffect(() => {
    void reload().catch((error: Error) => setError(error.message));
  }, [reload]);
  const perform = async (action: () => Promise<void>) => {
    setBusy(true);
    setError('');
    try {
      await action();
      await reload();
    } catch (error) {
      setError(error instanceof Error ? error.message : '파일 작업에 실패했습니다.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Surface>
      <Heading>자료 보관함</Heading>
      <Meta>새 파일은 비공개로 저장됩니다. 밴드에 공개한 파일만 멤버가 열 수 있습니다.</Meta>
      <input
        aria-label="자료 검색"
        value={query}
        placeholder="파일 이름 검색"
        onChange={(event) => setQuery(event.target.value)}
      />
      <input
        type="file"
        multiple
        accept="audio/*,image/png,image/jpeg,image/webp,application/pdf,.musicxml,.xml"
        aria-label="자료 파일 추가"
        disabled={busy}
        onChange={(event) => {
          const list = Array.from(event.target.files ?? []);
          event.target.value = '';
          void perform(async () => {
            for (const file of list)
              await uploadRemoteFile(file, file.name, scopeKey, band, currentUserId);
          });
        }}
      />
      {busy ? <Meta>파일 처리 중…</Meta> : null}
      {error ? <Meta accessibilityRole="alert">{error}</Meta> : null}
      {!files.length && !busy ? <Meta>아직 자료가 없어요.</Meta> : null}
      {files
        .filter((file) => file.name.toLowerCase().includes(query.toLowerCase()))
        .map((file) => (
          <Surface key={file.id} tint="#f7f9ff">
            <Copy>{file.name}</Copy>
            <Meta>
              {(file.size / 1048576).toFixed(1)} MB ·{' '}
              {file.visibility === 'PRIVATE' ? '나만 보기' : '밴드 공개'}
            </Meta>
            <FlexRow wrap>
              <ActionButton
                secondary
                compact
                onPress={() =>
                  void api<{ url: string }>(`/assets/${file.id}/download`)
                    .then((result) => setPreview({ ...result, file }))
                    .catch((error: Error) => setError(error.message))
                }
              >
                열기 / 다운로드
              </ActionButton>
              {file.ownerId === currentUserId ? (
                <>
                  <ActionButton
                    secondary
                    compact
                    disabled={!band || busy}
                    onPress={() =>
                      void perform(async () => {
                        await api(`/assets/${file.id}/visibility`, 'PATCH', {
                          visibility: file.visibility === 'PRIVATE' ? 'WORKSPACE' : 'PRIVATE',
                        });
                      })
                    }
                  >
                    {file.visibility === 'PRIVATE' ? '밴드에 공개' : '비공개로 변경'}
                  </ActionButton>
                  <ActionButton
                    secondary
                    compact
                    disabled={busy}
                    onPress={() =>
                      void perform(async () => {
                        await api(`/assets/${file.id}`, 'DELETE');
                        setPreview(null);
                      })
                    }
                  >
                    삭제
                  </ActionButton>
                </>
              ) : null}
            </FlexRow>
          </Surface>
        ))}
      {preview ? (
        <Surface>
          <Heading>{preview.file.name}</Heading>
          {preview.file.mime.startsWith('audio/') ? (
            <audio controls src={preview.url} style={{ width: '100%' }} />
          ) : preview.file.mime.startsWith('image/') ? (
            <img
              alt={preview.file.name}
              src={preview.url}
              style={{ maxWidth: '100%', maxHeight: 500, objectFit: 'contain' }}
            />
          ) : preview.file.mime === 'application/pdf' ? (
            <iframe
              title={preview.file.name}
              src={preview.url}
              style={{ width: '100%', height: 500, border: 0 }}
            />
          ) : null}
          <a href={preview.url} target="_blank" rel="noreferrer">
            파일 다운로드
          </a>
          <Meta>파일 링크는 5분 뒤 만료됩니다. 만료되면 다시 열어주세요.</Meta>
        </Surface>
      ) : null}
    </Surface>
  );
}
