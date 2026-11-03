import { LyricsFollow } from './LyricsFollow.web';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ActionButton } from './ProductUI';
import { useWorkspaceValue } from '../state/MockAppState';
import { useIdentity } from '../state/Identity';
import { loadPreferences, savePreferences } from '../state/preferencesStorage';
import { updateLyricsTimingText, type LyricsTimingDocument } from '../lib/lyricsTiming';
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
            songId={songId}
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
      songId={songId}
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
  songId,
  title,
  lyrics,
  preferenceKey,
  onSave,
  onClose,
  embedded = false,
}: {
  songId: string;
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
  const timingClose = useRef<(() => void) | null>(null);
  const timingSave = useRef<(() => boolean) | null>(null);
  const [, setTimingDocument] = useWorkspaceValue<LyricsTimingDocument>(`song/${songId}/lyrics-timing`, { version: 1, lyrics: '', tracks: {} });
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
  const [follow, setFollow] = useState(false);
  const [timingSettings, setTimingSettings] = useState(false);
  const editReturn = useRef({ timing: false, follow: false });
  const inline = embedded && !expanded;
  const [toolbarHost, setToolbarHost] = useState<HTMLDivElement | null>(null);
  const [timingDirty, setTimingDirty] = useState(false);
  const dirty = (editing && draft !== lyrics) || timingDirty;
  useEffect(() => {
    try {
      savePreferences({ size, speed }, preferenceKey);
    } catch {
      /* Reading remains available if device storage is full. */
    }
  }, [size, speed, preferenceKey]);
  const close = () => {
    if (timingSettings) {
      timingClose.current?.();
      return;
    }
    if (embedded && expanded) {
      if (timingDirty && !window.confirm('가사 타이밍을 저장하지 않고 작게 보기로 전환할까요?'))
        return;
      setTimingDirty(false);
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
    if (!dirty) return;
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
  const content = (
    <div className="performance-reader-content">
      <header>
        <div className="lyrics-reader-title">
          <h2>{title} · 가사</h2><span className="lyrics-header-divider" aria-hidden="true" />
          <div className="performance-reader-settings">
            {editing ? (
              <>
                <button
                  onClick={() => {
                    setTimingDocument((previous) => updateLyricsTimingText(previous, draft));
                    onSave(draft);
                    setEditing(false);
                    setTimingSettings(editReturn.current.timing);
                    setFollow(editReturn.current.follow);
                    setError('');
                  }}
                >
                  가사 적용
                </button>
                <button
                  onClick={() => {
                    setDraft(lyrics);
                    setEditing(false);
                    setTimingSettings(editReturn.current.timing);
                    setFollow(editReturn.current.follow);
                  }}
                >
                  편집 취소
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => {
                    if (timingDirty && !timingSave.current?.()) return;
                    setTimingDirty(false);
                    editReturn.current = { timing: timingSettings, follow };
                    setTimingSettings(false);
                    setFollow(false);
                    setPlaying(false);
                    setDraft(lyrics);
                    setEditing(true);
                  }}
                >
                  가사 편집
                </button>
                <div className="lyrics-mode-switch" role="group" aria-label="가사 이동 방식">
                  <button type="button" aria-pressed={follow} disabled={!lyrics.trim()}
                    onClick={() => { setPlaying(false); setFollow(true); }}>박자 맞춤</button>
                  <button type="button" aria-pressed={!follow} disabled={timingSettings || !lyrics.trim()}
                    onClick={() => { setPlaying(false); setFollow(false); }}>자동 스크롤</button>
                </div>
                {follow && (<>
                <button
                  aria-pressed={timingSettings}
                  onClick={() => {
                    if (timingSettings) { timingClose.current?.(); return; }
                    setPlaying(false);
                    setTimingDirty(false);
                    setTimingSettings((value) => !value);
                  }}
                >
                  가사 박자 설정
                </button>
                </>)}
          {!follow && (
            <label>
              스크롤 속도 {speed}
              <input disabled={follow || timingSettings}

                aria-label="가사 스크롤 속도"
                type="range"
                min={5}
                max={120}
                value={speed}
                onChange={(e) => setSpeed(Number(e.target.value))}
              />
            </label>
          )}


              </>
            )}
          </div>
        </div>
        <div className="performance-reader-settings">
          <div className="lyrics-zoom-controls" role="group" aria-label="가사 배율">
            <button type="button" aria-label="가사 축소" disabled={size <= 20} onClick={() => setSize((value) => Math.max(20, value - 4))}>−</button>
            <span>{Math.round(size / 40 * 100)}%</span>
            <button type="button" aria-label="가사 확대" disabled={size >= 80} onClick={() => setSize((value) => Math.min(80, value + 4))}>+</button>
          </div>
          {inline && (
            <button
              onClick={() => {
                if (
                  timingDirty &&
                  !window.confirm('가사 타이밍을 저장하지 않고 크게 보기로 전환할까요?')
                )
                  return;
                setTimingDirty(false);
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
      <div ref={setToolbarHost} className="lyrics-follow lyrics-view-toolbar-host" data-toolbar-settings={timingSettings} />
      {error && <p role="alert">{error}</p>}
      <div
        ref={stage}
        className={
          'performance-reader-stage' +
          (editing ? ' is-editing' : '') +
          (timingSettings && !editing ? ' is-timing-settings' : '') +
          (!timingSettings && !editing ? ' is-following' : '')
        }
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
          <LyricsFollow
            songId={songId}
            lyrics={lyrics}
            size={size}
            onDirtyChange={setTimingDirty}
            settingsOpen={timingSettings}
            followEnabled={follow}
            toolbarHost={toolbarHost}
            autoScroll={!follow}
            scrollSpeed={speed}
            closeRequestRef={timingClose}
            saveRequestRef={timingSave}
            onCloseSettings={() => {
              setTimingSettings(false);
              setTimingDirty(false);
            }}
          />
        )}
      </div>

    </div>
  );
  const reader = inline ? (
    <section
      className="performance-reader performance-reader-embedded lyrics-reader"
      aria-label={title + ' 가사 프롬프터'}
    >
      {content}
    </section>
  ) : (
    <dialog
      ref={dialog}
      className="performance-reader lyrics-reader"
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
