import { serverConfigured } from '../lib/remote';
import { RemoteMediaLibrary } from './RemoteMediaLibrary.web';
import { useEffect, useRef, useState } from 'react';
import { ActionButton, Copy, FlexRow, Heading, Meta, Surface } from './ProductUI';
import { readMedia, writeMedia } from '../lib/mediaStore';

type Asset = { id: string; name: string; type: string; blob: Blob; createdAt: string };
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
  const [preview, setPreview] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const urls = useRef(new Map<string, string>());
  useEffect(() => {
    let alive = true;
    const links = urls.current;
    void readMedia<Asset[]>(`library/${scopeKey}`)
      .then((saved) => {
        if (alive) {
          setFiles(saved ?? []);
          setReady(true);
        }
      })
      .catch(() => {
        if (alive)
          setError('파일 보관함을 열지 못했어요. 브라우저 저장 권한을 확인하고 새로고침해주세요.');
      });
    return () => {
      alive = false;
      links.forEach((url) => URL.revokeObjectURL(url));
      links.clear();
    };
  }, [scopeKey]);
  const save = async (next: Asset[]) => {
    setBusy(true);
    try {
      await writeMedia(`library/${scopeKey}`, next);
      setFiles(next);
      setError('');
    } catch {
      setError('파일을 저장하지 못했어요. 저장 공간을 확인해주세요.');
    } finally {
      setBusy(false);
    }
  };
  const url = (file: Asset) => {
    let link = urls.current.get(file.id);
    if (!link) {
      link = URL.createObjectURL(file.blob);
      urls.current.set(file.id, link);
    }
    return link;
  };
  const active = files.find((file) => file.id === preview);
  return (
    <Surface>
      <Heading>자료 보관함</Heading>
      <Meta>
        이 브라우저에 파일을 보관합니다. 새로고침 후에도 유지되며 다른 기기와 자동 공유되지
        않습니다.
      </Meta>
      <input
        aria-label="자료 검색"
        placeholder="파일 이름 검색"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        style={{ padding: 12, border: '1px solid #dce4ef', borderRadius: 8 }}
      />
      <input
        aria-label="자료 파일 추가"
        type="file"
        multiple
        accept="audio/*,image/*,application/pdf,.musicxml,.xml,.mxl"
        disabled={!ready || busy}
        onChange={(event) => {
          const chosen = Array.from(event.target.files ?? []);
          event.target.value = '';
          if (chosen.some((file) => file.size > 100 * 1024 * 1024)) {
            setError('파일당 100MB 이하로 추가해주세요.');
            return;
          }
          void save([
            ...files,
            ...chosen.map((file) => ({
              id: crypto.randomUUID(),
              name: file.name,
              type: file.type,
              blob: file,
              createdAt: new Date().toISOString(),
            })),
          ]);
        }}
      />
      {error ? <Copy accessibilityRole="alert">{error}</Copy> : null}
      {!ready ? (
        <Meta>보관함 불러오는 중…</Meta>
      ) : !files.length ? (
        <Meta>첫 악보나 녹음을 추가해보세요.</Meta>
      ) : null}
      {files
        .filter((file) => file.name.toLowerCase().includes(query.toLowerCase()))
        .map((file) => (
          <FlexRow wrap key={file.id}>
            <Copy style={{ flex: 1 }}>{file.name}</Copy>
            <Meta>{(file.blob.size / 1024 / 1024).toFixed(1)} MB</Meta>
            <ActionButton
              compact
              secondary
              onPress={() => setPreview(preview === file.id ? null : file.id)}
            >
              미리보기
            </ActionButton>
            <a href={url(file)} download={file.name}>
              다운로드
            </a>
            <ActionButton
              compact
              secondary
              onPress={() => {
                void save(files.filter((item) => item.id !== file.id));
                if (preview === file.id) setPreview(null);
              }}
              disabled={busy}
            >
              삭제
            </ActionButton>
          </FlexRow>
        ))}
      {active?.type.startsWith('audio/') ? (
        <audio controls src={url(active)} style={{ width: '100%' }} />
      ) : active?.type.startsWith('image/') ? (
        <img
          alt={active.name}
          src={url(active)}
          style={{ maxWidth: '100%', maxHeight: 600, objectFit: 'contain' }}
        />
      ) : active?.type === 'application/pdf' ? (
        <iframe
          title={active.name}
          src={url(active)}
          style={{ width: '100%', height: 580, border: 0 }}
        />
      ) : active ? (
        <Meta>이 파일은 다운로드해서 열어주세요.</Meta>
      ) : null}
    </Surface>
  );
}
