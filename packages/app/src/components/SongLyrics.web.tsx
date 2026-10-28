import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ActionButton } from './ProductUI';
import { useWorkspaceValue } from '../state/MockAppState';
import { useIdentity } from '../state/Identity';
import { loadPreferences, savePreferences } from '../state/preferencesStorage';
import './PerformanceReader.web.css';

export function SongLyrics({ songId, title }: { songId: string; title: string }) {
  const [lyrics, setLyrics] = useWorkspaceValue<string>(`song/${songId}/lyrics`, '');
  const [open, setOpen] = useState(false);
  const user = useIdentity();
  return (
    <>
      <ActionButton secondary compact onPress={() => setOpen(true)}>
        가사 보기
      </ActionButton>
      {open &&
        createPortal(
          <LyricsReader
            preferenceKey={`lyrics-reader/${user}`}
            title={title}
            lyrics={lyrics}
            onSave={setLyrics}
            onClose={() => setOpen(false)}
          />,
          document.body,
        )}
    </>
  );
}
export function SongLyricsPanel({
  songId,
  title,
  preferenceScope = 'personal',
}: {
  songId: string;
  title: string;
  preferenceScope?: 'personal' | 'band';
}) {
  const [lyrics, setLyrics] = useWorkspaceValue<string>(`song/${songId}/lyrics`, '');
  const user = useIdentity();
  return (
    <LyricsReader
      embedded
      title={title}
      lyrics={lyrics}
      preferenceKey={
        preferenceScope === 'band'
          ? `lyrics-reader/${user}`
          : `personal-practice/lyrics-reader/${user}`
      }
      onSave={setLyrics}
      onClose={() => {}}
    />
  );
}
function LyricsReader({
  title,
  lyrics,
  preferenceKey,
  onSave,
  onClose,
  embedded = false,
}: {
  title: string;
  lyrics: string;
  preferenceKey: string;
  onSave: (value: string) => void;
  onClose: () => void;
  embedded?: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const ownsFullscreen = useRef(false);
  const [expanded, setExpanded] = useState(false);
  const inline = embedded && !expanded;
  const [lyricsWidth, setLyricsWidth] = useState(1000);
  const [draft, setDraft] = useState(lyrics);
  const [editing, setEditing] = useState(!lyrics);
  const [playing, setPlaying] = useState(false);
  const [settings] = useState(() => loadPreferences(preferenceKey));
  const [size, setSize] = useState(
    typeof settings.size === 'number' && settings.size >= 20 && settings.size <= 80
      ? settings.size
      : 40,
  );
  const [speed, setSpeed] = useState(
    typeof settings.speed === 'number' && settings.speed >= 5 && settings.speed <= 120
      ? settings.speed
      : 30,
  );
  const [error, setError] = useState('');
  const dirty = editing && draft !== lyrics;
  useEffect(() => {
    const target = stage.current;
    if (!target) return;
    const observer = new ResizeObserver(([entry]) => setLyricsWidth(entry.contentRect.width));
    observer.observe(target);
    return () => observer.disconnect();
  }, [inline]);
  useEffect(() => {
    try {
      savePreferences({ size, speed }, preferenceKey);
    } catch {
      /* Reading remains available if device storage is full. */
    }
  }, [size, speed, preferenceKey]);
  const close = () => {
    if (embedded && expanded) {
      setExpanded(false);
      return;
    }
    if (!dirty || window.confirm('수정 중인 가사를 저장하지 않고 닫을까요?')) onClose();
  };
  useEffect(() => {
    if (inline) return;
    dialog.current?.showModal();
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
      if (ownsFullscreen.current && document.fullscreenElement)
        void document.exitFullscreen().catch(() => {});
    };
  }, [inline]);
  useEffect(() => {
    if (!embedded || !dirty) return;
    const warn = (event: Event) => {
      if (!window.confirm('수정 중인 가사를 저장하지 않고 이동할까요?')) event.preventDefault();
    };
    const unload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('moajam:before-navigate', warn);
    window.addEventListener('beforeunload', unload);
    return () => {
      window.removeEventListener('moajam:before-navigate', warn);
      window.removeEventListener('beforeunload', unload);
    };
  }, [embedded, dirty]);
  useEffect(() => {
    if (!playing || editing) return;
    let frame = 0,
      previous = 0,
      position = stage.current?.scrollTop ?? 0;
    const tick = (now: number) => {
      const target = stage.current;
      if (!target) return;
      if (previous) position += (Math.min(now - previous, 100) / 1000) * speed;
      previous = now;
      target.scrollTop = position;
      if (target.scrollTop >= target.scrollHeight - target.clientHeight - 1) {
        setPlaying(false);
        return;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, editing, speed]);
  const content = (
    <div className="performance-reader-content">
      <header>
        <div className="lyrics-reader-title">
          <h2>{title} · 가사</h2>
          <div className="performance-reader-settings">
            {editing ? (
              <>
                <button
                  onClick={() => {
                    onSave(draft);
                    setEditing(false);
                    setError('');
                  }}
                >
                  가사 적용
                </button>
                <button
                  onClick={() => {
                    setDraft(lyrics);
                    setEditing(false);
                  }}
                >
                  편집 취소
                </button>
              </>
            ) : (
              <button
                onClick={() => {
                  setPlaying(false);
                  setDraft(lyrics);
                  setEditing(true);
                }}
              >
                가사 편집
              </button>
            )}
          </div>
        </div>
        <div className="performance-reader-settings">
          {inline && (
            <button
              onClick={() => {
                setPlaying(false);
                setExpanded(true);
              }}
            >
              크게 보기
            </button>
          )}
          {!inline && (
            <button
              onClick={() => {
                if (!document.documentElement.requestFullscreen)
                  setError('이 브라우저에서는 전체 화면을 지원하지 않아요.');
                else
                  void (
                    document.fullscreenElement
                      ? document.exitFullscreen()
                      : document.documentElement.requestFullscreen().then(() => {
                          ownsFullscreen.current = true;
                        })
                  ).catch(() => setError('이 브라우저에서는 전체 화면을 지원하지 않아요.'));
              }}
            >
              전체 화면 전환
            </button>
          )}
          {!inline && <button onClick={close}>{embedded ? '작게 보기' : '닫기'}</button>}
        </div>
      </header>
      {error && <p role="alert">{error}</p>}
      <div
        ref={stage}
        className={'performance-reader-stage' + (editing ? ' is-editing' : '')}
        onWheel={() => setPlaying(false)}
        onTouchStart={() => setPlaying(false)}
      >
        {editing ? (
          <textarea
            aria-label="곡 가사"
            placeholder="가사를 입력해주세요. 빈 줄로 절과 후렴을 구분할 수 있어요."
            value={draft}
            maxLength={50000}
            onChange={(e) => setDraft(e.target.value)}
          />
        ) : (
          <div
            className="lyrics-paper"
            style={{ fontSize: Math.max(12, (size * lyricsWidth) / 1000) }}
          >
            {lyrics || '가사 편집을 눌러 가사를 등록해주세요.'}
          </div>
        )}
      </div>
      <footer>
        <div className="performance-reader-settings">
          <button disabled={editing || !lyrics.trim()} onClick={() => setPlaying(!playing)}>
            {playing ? '일시 정지' : '자동 스크롤'}
          </button>
          <button
            disabled={editing}
            onClick={() => {
              setPlaying(false);
              stage.current?.scrollTo(0, 0);
            }}
          >
            처음으로
          </button>
        </div>
        <div className="performance-reader-settings">
          <label>
            글자 {size}
            <input
              aria-label="가사 글자 크기"
              type="range"
              min={20}
              max={80}
              value={size}
              onChange={(e) => setSize(Number(e.target.value))}
            />
          </label>
          <label>
            속도 {speed}
            <input
              aria-label="가사 스크롤 속도"
              type="range"
              min={5}
              max={120}
              value={speed}
              onChange={(e) => setSpeed(Number(e.target.value))}
            />
          </label>
        </div>
      </footer>
    </div>
  );
  const reader = inline ? (
    <section
      className="performance-reader performance-reader-embedded"
      aria-label={title + ' 가사 프롬프터'}
    >
      {content}
    </section>
  ) : (
    <dialog
      ref={dialog}
      className="performance-reader"
      aria-label={title + ' 가사 프롬프터'}
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
    >
      {content}
    </dialog>
  );
  return embedded && expanded ? createPortal(reader, document.body) : reader;
}
