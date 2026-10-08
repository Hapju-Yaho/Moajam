import { ScheduleDialog } from './ScheduleDialog';
import './StudioConfirm.web.css';
import './SongPdfLibrary.web.css';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ActionButton } from './ProductUI';
import { api, serverConfigured, uploadRemoteFile } from '../lib/remote';
import { readMedia, writeMedia } from '../lib/mediaStore';
import { trackParts, trackPartLabel } from '../lib/trackParts';
import { useMockAppState, useWorkspaceValue } from '../state/MockAppState';
type FileEntry = {
  id: string;
  name: string;
  mime?: string;
  type?: string;
  blob?: Blob;
  ownerId?: string;
};
export function SongPdfLibrary({ songId, title }: { songId: string; title: string }) {
  const { workspaceId, currentUserId } = useMockAppState();
  const [parts, setParts] = useWorkspaceValue<Record<string, string>>(
    'song/' + songId + '/pdf-parts',
    {},
  );
  const scope = 'song/' + workspaceId + '/' + songId;
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState<FileEntry | null>(null);
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const generation = useRef(0);
  const urls = useRef<string[]>([]);
  useEffect(() => {
    const requests = generation;
    const ownedUrls = urls.current;
    return () => {
      requests.current++;
      ownedUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, []);
  useEffect(() => {
    if (!open) return;
    dialog.current?.showModal();
    const request = ++generation.current;
    setBusy(true);
    setError('');
    setFiles([]);
    const pending = serverConfigured
      ? api<FileEntry[]>('/assets?' + new URLSearchParams({ scope, workspaceId }))
      : readMedia<FileEntry[]>('library/' + scope).then((items) => items ?? []);
    void pending
      .then((items) => {
        if (generation.current === request) setFiles(items);
      })
      .catch((e: Error) => {
        if (generation.current === request) setError(e.message);
      })
      .finally(() => {
        if (generation.current === request) setBusy(false);
      });
    const requests = generation;
    return () => {
      requests.current++;
    };
  }, [open, scope, workspaceId]);
  const pdfs = files.filter(
    (file) =>
      file.mime === 'application/pdf' ||
      file.type === 'application/pdf' ||
      /\.pdf$/i.test(file.name),
  );
  const upload = async (file: File, part: string) => {
    if (!file.size || file.size > 104857600 || !/\.pdf$/i.test(file.name)) {
      setError('100MB 이하의 PDF 파일을 선택해주세요.');
      return;
    }
    const request = generation.current;
    setBusy(true);
    setError('');
    try {
      let id: string;
      if (serverConfigured) {
        id = await uploadRemoteFile(file, file.name, scope, workspaceId, currentUserId);
        await api('/assets/' + id + '/visibility', 'PATCH', { visibility: 'WORKSPACE' });
      } else {
        id = crypto.randomUUID();
        await writeMedia('library/' + scope, [
          ...files,
          { id, name: file.name, type: 'application/pdf', blob: file },
        ]);
      }
      if (request !== generation.current) return;
      setParts((current) => ({ ...current, [id]: part }));
      setFiles((current) => [
        ...current,
        {
          id,
          name: file.name,
          mime: 'application/pdf',
          blob: serverConfigured ? undefined : file,
          ownerId: currentUserId,
        },
      ]);
    } catch (e) {
      if (request === generation.current)
        setError(e instanceof Error ? e.message : 'PDF를 등록하지 못했어요.');
    } finally {
      if (request === generation.current) setBusy(false);
    }
  };
  const removePdf = async (file: FileEntry) => {
    if (busy) return;
    const request = generation.current;
    setBusy(true);
    setError('');
    try {
      if (serverConfigured) await api('/assets/' + file.id, 'DELETE');
      else
        await writeMedia(
          'library/' + scope,
          files.filter((item) => item.id !== file.id),
        );
      if (request !== generation.current) return;
      setDeleting(null);
      setFiles((current) => current.filter((item) => item.id !== file.id));
      setParts((current) => {
        const next = { ...current };
        delete next[file.id];
        return next;
      });
    } catch (e) {
      if (request === generation.current)
        setError(e instanceof Error ? e.message : 'PDF를 삭제하지 못했어요.');
    } finally {
      if (request === generation.current) setBusy(false);
    }
  };
  const showPdf = async (file: FileEntry) => {
    const viewer = window.open('', '_blank', 'popup,width=1100,height=850');
    if (!viewer) {
      setError('PDF를 열려면 브라우저 팝업을 허용해주세요.');
      return;
    }
    viewer.opener = null;
    try {
      let url: string;
      if (serverConfigured)
        url = (await api<{ url: string }>('/assets/' + file.id + '/download')).url;
      else {
        if (!file.blob) throw Error('PDF 파일을 찾을 수 없어요.');
        url = URL.createObjectURL(file.blob);
        urls.current.push(url);
      }
      if (!viewer.closed) viewer.location.replace(url);
    } catch (e) {
      viewer.close();
      setError(e instanceof Error ? e.message : 'PDF를 열지 못했어요.');
    }
  };
  return (
    <>
      <ActionButton secondary compact onPress={() => setOpen(true)}>
        악보 열기
      </ActionButton>
      {open &&
        createPortal(
          <dialog
            ref={dialog}
            aria-label={title + ' PDF 악보'}
            onCancel={(event) => {
              if (event.target !== event.currentTarget) return;
              event.preventDefault();
              if (!busy) setOpen(false);
            }}
            className="song-pdf-dialog"
          >
            <div
              className="song-pdf-backdrop"
              onClick={() => {
                if (!busy) setOpen(false);
              }}
            />
            <div className="song-pdf-card">
              <header className="song-pdf-header">
                <h2>{title} · PDF 악보</h2>
                <ActionButton secondary compact disabled={busy} onPress={() => setOpen(false)}>
                  닫기
                </ActionButton>
              </header>
              <div className="song-pdf-body">
                <p className="song-pdf-description">세션별 악보를 선택하면 새 창에서 열립니다.</p>
                {error && <p role="alert">{error}</p>}
                {busy && <p>파일 처리 중…</p>}
                <div className="song-pdf-sessions">
                  {trackParts
                    .filter(
                      (item) =>
                        item.value !== 'MIX' &&
                        (item.value !== 'UNASSIGNED' ||
                          pdfs.some((file) => !parts[file.id] || parts[file.id] === 'UNASSIGNED')),
                    )
                    .map((item) => {
                      const group = pdfs.filter(
                        (file) => (parts[file.id] ?? 'UNASSIGNED') === item.value,
                      );
                      return (
                        <section key={item.value} style={{ marginBottom: 16 }}>
                          <h3>
                            {item.value === 'UNASSIGNED' ? '기존 악보' : trackPartLabel(item.value)}
                          </h3>
                          <div
                            className={group.length ? 'song-pdf-files' : 'song-pdf-files is-empty'}
                          >
                            {group.length ? (
                              group.map((file) => (
                                <div
                                  key={file.id}
                                  style={{ position: 'relative', marginBottom: 10 }}
                                >
                                  <button
                                    disabled={busy}
                                    onClick={() => void showPdf(file)}
                                    style={{
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: 12,
                                      width: '100%',
                                      minHeight: 64,
                                      padding: '12px 48px 12px 14px',
                                      border: '1px solid #dce4f0',
                                      borderRadius: 12,
                                      background: '#f7f9ff',
                                      color: '#20354a',
                                      textAlign: 'left',
                                    }}
                                  >
                                    <svg
                                      width="32"
                                      height="38"
                                      viewBox="0 0 32 38"
                                      aria-hidden="true"
                                      style={{ flexShrink: 0 }}
                                    >
                                      <path
                                        d="M5 1h15l7 7v28H5z"
                                        fill="white"
                                        stroke="#cc5964"
                                        strokeWidth="1.5"
                                      />
                                      <path
                                        d="M20 1v8h7"
                                        fill="none"
                                        stroke="#cc5964"
                                        strokeWidth="1.5"
                                      />
                                      <rect
                                        x="1"
                                        y="18"
                                        width="30"
                                        height="13"
                                        rx="3"
                                        fill="#cc5964"
                                      />
                                      <text
                                        x="16"
                                        y="27.5"
                                        textAnchor="middle"
                                        fill="white"
                                        fontSize="10"
                                        fontWeight="600"
                                      >
                                        PDF
                                      </text>
                                    </svg>
                                    <span style={{ overflowWrap: 'anywhere', fontWeight: 500 }}>
                                      {file.name}
                                    </span>
                                  </button>
                                  {(!serverConfigured || file.ownerId === currentUserId) && (
                                    <button
                                      type="button"
                                      aria-label={file.name + ' 삭제'}
                                      title="PDF 악보 삭제"
                                      disabled={busy}
                                      onClick={() => setDeleting(file)}
                                      style={{
                                        position: 'absolute',
                                        top: 6,
                                        right: 6,
                                        width: 30,
                                        height: 30,
                                        border: 'none',
                                        borderRadius: 8,
                                        background: '#fff1f2',
                                        color: '#be4b55',
                                        fontSize: 22,
                                        lineHeight: '24px',
                                        cursor: 'pointer',
                                      }}
                                    >
                                      ×
                                    </button>
                                  )}
                                </div>
                              ))
                            ) : (
                              <p style={{ color: '#7b8795' }}>등록된 PDF 악보가 없어요.</p>
                            )}
                          </div>
                          {item.value !== 'UNASSIGNED' && (
                            <label className={busy ? 'song-pdf-add is-disabled' : 'song-pdf-add'}>
                              <span className="song-pdf-add-icon" aria-hidden="true">
                                <svg
                                  width="14"
                                  height="14"
                                  viewBox="0 0 16 16"
                                  aria-hidden="true"
                                  style={{ display: 'block' }}
                                >
                                  <path
                                    d="M8 2v12M2 8h12"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="1.5"
                                    strokeLinecap="round"
                                  />
                                </svg>
                              </span>
                              <span>악보 추가</span>
                              <input
                                type="file"
                                accept="application/pdf,.pdf"
                                aria-label={trackPartLabel(item.value) + ' 악보 추가'}
                                disabled={busy}
                                onChange={(event) => {
                                  const file = event.target.files?.[0];
                                  event.target.value = '';
                                  if (file) void upload(file, item.value);
                                }}
                              />
                            </label>
                          )}
                        </section>
                      );
                    })}
                </div>
              </div>
            </div>
          </dialog>,
          document.body,
        )}
      <ScheduleDialog
        visible={!!deleting}
        label="악보 삭제 확인"
        onClose={() => {
          if (!busy) setDeleting(null);
        }}
      >
        {deleting && (
          <div className="studio-confirm-overlay">
            <div className="studio-confirm-card">
              <h2>악보를 삭제할까요?</h2>
              <p>「{deleting.name}」 악보를 삭제합니다.</p>
              {error && <p role="alert">{error}</p>}
              <div>
                <button disabled={busy} onClick={() => setDeleting(null)}>
                  취소
                </button>
                <button
                  className="song-pdf-delete"
                  disabled={busy}
                  onClick={() => void removePdf(deleting)}
                >
                  {busy ? '삭제 중…' : '삭제'}
                </button>
              </div>
            </div>
          </div>
        )}
      </ScheduleDialog>
    </>
  );
}
