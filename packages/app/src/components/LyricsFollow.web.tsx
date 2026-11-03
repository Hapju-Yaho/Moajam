import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { useMockAppState, useWorkspaceValue } from '../state/MockAppState';
import {
  activeLyricsSection,
  addLyricsCue,
  moveLyricsCue,
  recordLyricsCue,
  lyricsSections,
  lyricsCueLabel,
  type LyricsCue,
  type LyricsTimingDocument,
  type LyricsTransport,
} from '../lib/lyricsTiming';
import { LyricsReferencePlayer } from './LyricsReferencePlayer.web';
import { ScoreTransportIcon } from './ScoreTransportIcon.web';
import { songAudioBlob, type SongAudio } from '../lib/songAudio';
import { useIdentity } from '../state/Identity';
import './LyricsFollow.web.css';

export function LyricsFollow({
  songId,
  lyrics,
  size,
  onDirtyChange,
  settingsOpen,
  followEnabled,
  onCloseSettings,
  closeRequestRef,
  saveRequestRef,
  toolbarHost,
  autoScroll = false,
  scrollSpeed = 30,
}: {
  songId: string;
  lyrics: string;
  size: number;
  onDirtyChange: (value: boolean) => void;
  settingsOpen: boolean;
  followEnabled: boolean;
  onCloseSettings?: () => void;
  closeRequestRef?: { current: (() => void) | null };
  saveRequestRef?: { current: (() => boolean) | null };
  toolbarHost?: HTMLElement | null;
  autoScroll?: boolean;
  scrollSpeed?: number;
}) {
  const { actionError, storageError, workspaceId } = useMockAppState();
  const user = useIdentity();
  const [document, setDocument] = useWorkspaceValue<LyricsTimingDocument>(
    `song/${songId}/lyrics-timing`,
    { version: 1, lyrics: '', tracks: {} },
  );
  const [bpm, setBpm] = useState(120),
    [meter, setMeter] = useState<[number, number]>([4, 4]);
  const [countdownEnabled, setCountdownEnabled] = useState(true);
  const [metronomeVolume, setMetronomeVolume] = useState(0.5);
  const [listenAlong, setListenAlong] = useState(false);
  const [songVolume, setSongVolume] = useState(1);
  const audioPreferencesKey = `moajam/lyrics-audio/${user}/${workspaceId}/${songId}`;
  const [audioPreferencesReady, setAudioPreferencesReady] = useState('');
  useEffect(() => {
    let enabled = false;
    let volume = 1;
    try {
      const saved = JSON.parse(localStorage.getItem(audioPreferencesKey) ?? 'null');
      if (typeof saved?.enabled === 'boolean') enabled = saved.enabled;
      if (typeof saved?.volume === 'number' && Number.isFinite(saved.volume)) volume = Math.max(0, Math.min(1, saved.volume));
    } catch { /* Device storage is optional. */ }
    setListenAlong(enabled); setSongVolume(volume); setAudioPreferencesReady(audioPreferencesKey);
  }, [audioPreferencesKey]);
  useEffect(() => {
    if (audioPreferencesReady !== audioPreferencesKey) return;
    try { localStorage.setItem(audioPreferencesKey, JSON.stringify({ enabled: listenAlong, volume: songVolume })); } catch { /* Keep playback available. */ }
  }, [audioPreferencesReady, audioPreferencesKey, listenAlong, songVolume]);
  const [songAudio] = useWorkspaceValue<SongAudio | null>(`song/${songId}/audio`, null);
  const [audioUrl, setAudioUrl] = useState('');
  const [audioDuration, setAudioDuration] = useState(0);
  const [audioSeekRevision, setAudioSeekRevision] = useState(0);
  const linkedAudio = useRef<HTMLAudioElement>(null);
  const [audioError, setAudioError] = useState('');
  useEffect(() => {
    let active = true;
    let url = '';
    setAudioUrl(''); setAudioError(''); setAudioDuration(0);
    if (songAudio) void songAudioBlob(songAudio).then((blob) => {
      if (!active) return;
      url = URL.createObjectURL(blob); setAudioUrl(url);
    }).catch(() => { if (active) setAudioError('곡 음원을 불러오지 못했어요.'); });
    return () => { active = false; linkedAudio.current?.pause(); if (url) URL.revokeObjectURL(url); };
  }, [songAudio?.id, songId]);
  const [countdownBeats, setCountdownBeats] = useState(4);
  const [countdownText, setCountdownText] = useState('4');
  const [transport, setTransport] = useState<LyricsTransport | null>(null);
  const receive = useCallback((value: LyricsTransport | null) => setTransport(value), []);
  useEffect(() => {
    const audio = linkedAudio.current;
    if (!audio) return;
    audio.volume = songVolume;
  }, [songVolume, audioUrl]);
  useEffect(() => {
    const audio = linkedAudio.current;
    if (!audio || !audioUrl || !listenAlong || !transport?.playing) { audio?.pause(); return; }
    audio.currentTime = (songAudio?.start ?? 0) + transport.readBeat() * 60 / transport.bpm;
    void audio.play().catch(() => setAudioError('곡 음원을 재생하지 못했어요.'));
    return () => audio.pause();
  }, [audioUrl, listenAlong, transport?.playing, transport?.bpm, songAudio?.start, audioSeekRevision]);
  const [cues, setCues] = useState<LyricsCue[]>([]),
    [dirty, setDirty] = useState(false),
    [beat, setBeat] = useState(0),
    [message, setMessage] = useState('');
  const sectionNodes = useRef(new Map<number, HTMLElement>());
  const root = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!settingsOpen) return;
    const frame = requestAnimationFrame(() => root.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [settingsOpen]);
  const [selectedSection, setSelectedSection] = useState<number | null>(null);
  const [redoSection, setRedoSection] = useState<number | null>(null);
  useEffect(() => setRedoSection(null), [settingsOpen, lyrics]);
  useEffect(() => setSelectedSection(null), [settingsOpen]);
  useEffect(() => {
    if (selectedSection !== null && !cues.some((cue) => cue.section === selectedSection))
      setSelectedSection(null);
  }, [cues, redoSection, selectedSection]);
  const [paper, setPaper] = useState<HTMLDivElement | null>(null);
  const [lyricsArea, setLyricsArea] = useState<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!autoScroll || !transport?.playing || settingsOpen || followEnabled || !paper) return;
    let frame = 0;
    let previous = performance.now();
    let offset = paper.scrollTop;
    const tick = (now: number) => {
      offset += Math.min(now - previous, 100) / 1000 * scrollSpeed;
      previous = now;
      paper.scrollTop = offset;
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [autoScroll, transport?.playing, settingsOpen, followEnabled, paper, scrollSpeed]);
  const [paperHeight, setPaperHeight] = useState(0);
  const sections = lyricsSections(lyrics);
  const key = 'metronome';
  const saved = document.lyrics === lyrics ? document.tracks[key] : undefined;
  const savedCues = JSON.stringify(saved?.cues ?? []);
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  useEffect(() => {
    setCues(saved?.cues ?? []);
    setDirty(false);
    setBeat(0);
    if (saved) {
      setBpm(saved.bpm);
      setMeter(saved.meter);
    }
  }, [key, lyrics]);
  useEffect(() => {
    if (settingsOpen && transport?.playing) transport.toggle();
    if (!settingsOpen) {
      setCues(saved?.cues ?? []);
      setDirty(false);
      setMessage('');
    }
  }, [settingsOpen]);
  useEffect(() => {
    if (!paper) return;
    const resize = new ResizeObserver(() => setPaperHeight(paper.clientHeight));
    resize.observe(paper);
    setPaperHeight(paper.clientHeight);
    return () => resize.disconnect();
  }, [paper]);
  useEffect(() => {
    if (!dirtyRef.current) {
      setCues(JSON.parse(savedCues));
      if (saved) {
        setBpm(saved.bpm);
        setMeter(saved.meter);
      }
    }
  }, [savedCues, saved?.bpm, saved?.meter?.join('/')]);
  useEffect(() => {
    onDirtyChange(dirty);
  }, [dirty, onDirtyChange]);
  useEffect(() => {
    if (!transport) return;
    let frame = 0,
      last = -1;
    const update = (now: number) => {
      if (now - last >= 32) {
        setBeat(transport.readBeat());
        last = now;
      }
      frame = requestAnimationFrame(update);
    };
    frame = requestAnimationFrame(update);
    return () => cancelAnimationFrame(frame);
  }, [transport]);
  const active = activeLyricsSection(cues, beat);
  const lastRecorded = !transport?.playing && redoSection !== null ? redoSection : active;
  const redoNext = redoSection === null ? undefined : cues.find((cue) => cue.section > redoSection);
  const redoExpired = Boolean(redoNext && beat >= redoNext.beat);
  useEffect(() => {
    if (!settingsOpen) return;
    const node = sectionNodes.current.get(lastRecorded),
      parent = node?.parentElement;
    if (node && parent)
      parent.scrollTo({
        top: Math.max(0, node.offsetTop + node.offsetHeight / 2 - parent.clientHeight / 2),
        behavior: 'smooth',
      });
  }, [lastRecorded, settingsOpen]);
  const playbackEnd = audioDuration > 0 ? Math.max(0, audioDuration - (songAudio?.start ?? 0)) * bpm / 60 : cues.at(-1)?.beat ?? 0;
  const progressEnd = settingsOpen ? Math.max(playbackEnd, meter[0] * 4 / meter[1], Math.ceil(beat / (meter[0] * 4 / meter[1])) * (meter[0] * 4 / meter[1])) : playbackEnd;
  useEffect(() => {
    if (
      !settingsOpen &&
      (followEnabled || audioDuration > 0) &&
      transport?.playing &&
      playbackEnd > 0 &&
      beat >= playbackEnd
    ) {
      transport.seek(playbackEnd);
      setBeat(playbackEnd);
    }
  }, [beat, playbackEnd, settingsOpen, followEnabled, transport, audioDuration]);
  useEffect(() => {
    if (!followEnabled || settingsOpen) return;
    const node = sectionNodes.current.get(active);
    const parent = node?.parentElement;
    if (node && parent)
      parent.scrollTo({
        top: Math.max(0, node.offsetTop + node.offsetHeight / 2 - parent.clientHeight / 2),
        behavior: 'smooth',
      });
  }, [active, paperHeight, followEnabled, settingsOpen, size]);
  const capture = () => {
    if (!settingsOpen || !transport?.playing || transport.key !== key) {
      setMessage('재생을 시작한 뒤 Enter로 가사의 시작 박자를 기록해주세요.');
      return;
    }
    try {
      const position = transport.readBeat();
      if (redoSection !== null) {
        setCues(recordLyricsCue(cues, redoSection, position));
        setRedoSection(null);
      } else setCues(addLyricsCue(cues, position, sections.length));
      setSelectedSection(redoSection);
      setDirty(true);
      setMessage('');
    } catch (e) {
      setMessage(e instanceof Error ? e.message : '타이밍을 입력하지 못했어요.');
    }
  };
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (
        e.defaultPrevented ||
        e.repeat ||
        e.isComposing ||
        e.ctrlKey ||
        e.metaKey ||
        e.altKey ||
        !(e.target instanceof Element) ||
        e.target.closest('input,textarea,select,[contenteditable="true"],iframe')
      )
        return;
      // Limit shortcuts to the lyrics reader.
      if (!e.target.closest('.performance-reader')) return;
      if (e.key === 'Enter' && settingsOpen) {
        e.preventDefault();
        e.stopPropagation();
        capture();
      } else if (e.code === 'Space' || e.key === ' ') {
        e.preventDefault();
        e.stopPropagation();
        transport?.toggle();
      }
    };
    window.addEventListener('keydown', down, true);
    return () => window.removeEventListener('keydown', down, true);
  });
  const save = () => {
    if (!transport?.ready || !key || key.endsWith(':')) return false;
    if (cues.length > 3000) {
      setMessage('한 재생 기준에는 최대 3,000개 구분절을 저장할 수 있어요.');
      return false;
    }
    if (
      document.lyrics === lyrics &&
      !document.tracks[key] &&
      Object.keys(document.tracks).length >= 50
    ) {
      setMessage('한 곡에는 최대 50개의 재생 기준을 저장할 수 있어요.');
      return false;
    }
    setDocument((previous) => ({
      version: 1,
      lyrics,
      selectedSource: key,
      tracks: {
        ...(previous.lyrics === lyrics ? previous.tracks : {}),
        [key]: { bpm: transport.bpm, meter: transport.meter, cues },
      },
    }));
    setDirty(false);
    setMessage('가사 타이밍을 저장 요청했어요.');
    return true;
  };
  const closeSettings = () => {
    if (dirty && !save()) return;
    transport?.seek(transport.readBeat());
    onDirtyChange(false);
    onCloseSettings?.();
  };
  useEffect(() => {
    if (!saveRequestRef) return;
    saveRequestRef.current = () => !dirty || save();
    return () => { saveRequestRef.current = null; };
  });
  useEffect(() => {
    if (!closeRequestRef) return;
    closeRequestRef.current = closeSettings;
    return () => {
      closeRequestRef.current = null;
    };
  });
  const recordControls = (
        <div className="lyrics-toolbar-record">
        <div className="lyrics-playback-buttons">
          <button
            aria-label="처음으로"
            title="처음으로"
            disabled={!transport}
            onClick={() => {
              transport?.seek(0);
              setBeat(0);
            }}
          >
            <LyricsPlaybackIcon path="M6 5v14M18 5l-10 7 10 7Z" />
          </button>
          <button
            className="lyrics-play"
            aria-label={transport?.playing ? '일시 정지' : '재생'}
            title="재생 / 일시 정지 · Space"
            disabled={!transport?.ready}
            onClick={() => transport?.toggle()}
          >
            <LyricsPlaybackIcon path={transport?.playing ? 'M8 5v14M16 5v14' : 'M7 4l14 8-14 8Z'} />
          </button>
          {(
            <button
              aria-label="끝으로"
              title="끝으로"
              disabled={!transport?.ready || progressEnd <= 0}
              onClick={() => {
                transport?.seek(progressEnd);
                setBeat(progressEnd);
              }}
            >
              <LyricsPlaybackIcon path="M18 5v14M6 5l10 7-10 7Z" />
            </button>
          )}
        </div>
        </div>
  );
  const recordingActions = (<div className="lyrics-recording-actions">
        {settingsOpen && (
          <button
            className="lyrics-cue-capture"
            disabled={
              !transport?.playing ||
              redoExpired ||
              (redoSection === null && cues.length >= sections.length)
            }
            onClick={capture}
          >
            박자 기록 · Enter
          </button>
        )}
        {settingsOpen && (
          <button className="lyrics-timing-undo"
            disabled={!cues.length}
            onClick={() => {
              setCues((value) => value.slice(0, -1));
              setRedoSection(null);
              setDirty(true);
            }}
          >
            마지막 입력 취소
          </button>
        )}
        {settingsOpen && (
            <button className="lyrics-timing-reset"
              disabled={!cues.length}
              onClick={() => {
                setCues([]);
                setRedoSection(null);
                setDirty(true);
              }}
            >
              초기화
            </button>
        )}
  </div>);
  const toolbar = (
      <div className="lyrics-follow-toolbar">
        <div className="lyrics-toolbar-settings">
        <LyricsReferencePlayer
          video=""
          bpm={bpm}
          meter={meter}
          onVideo={() => {}}
          onBpm={(value) => {
            if (value !== bpm) {
              setBpm(value);
              setDirty(true);
            }
          }}
          onMeter={(value) => {
            if (value.join('/') !== meter.join('/')) {
              setMeter(value);
              setDirty(true);
            }
          }}
          onTransport={receive}
          metronomeOnly
          compactControls
          countIn={countdownEnabled}
          countInBeats={countdownBeats}
          metronomeVolume={metronomeVolume}
          countdownHost={lyricsArea}
        />
        {(
          <div className="lyrics-metronome-controls">
            <button type="button" className="lyrics-audio-switch" role="switch" aria-label="메트로놈" aria-checked={transport?.metronome ?? false}
              disabled={!transport} onClick={() => transport?.setMetronome(!transport.metronome)}><span /></button>
            <ScoreTransportIcon name="metronome" />
            <input type="range" aria-label="메트로놈 음량" min={0} max={1} step={0.01} value={metronomeVolume} onChange={(e) => setMetronomeVolume(Number(e.target.value))} />
          </div>
        )}
        {(
          <div className="lyrics-countdown-settings">
            <button type="button" className="lyrics-setting-button" aria-pressed={countdownEnabled}
              onClick={() => setCountdownEnabled((value) => !value)}>
              카운트다운
            </button>
            <input
              type="number"
              aria-label="카운트다운 박 수"
              min={1}
              max={32}
              step={1}
              disabled={!countdownEnabled || transport?.playing}
              value={countdownText}
              onChange={(event) => setCountdownText(event.target.value)}
              onBlur={() => {
                const value = Math.max(1, Math.min(32, Math.round(Number(countdownText)) || 4));
                setCountdownBeats(value);
                setCountdownText(String(value));
              }}
            />
          </div>
        )}
        {<span className="lyrics-toolbar-divider" aria-hidden="true" />}
        {<div className="lyrics-listen-controls">
          <button type="button" className="lyrics-audio-switch" role="switch" aria-label="음원 같이 듣기" aria-checked={listenAlong}
            disabled={!audioUrl} onClick={() => setListenAlong((value) => !value)}><span /></button>
          <span>음원 같이 듣기</span>
          <input type="range" aria-label="곡 음원 음량" min={0} max={1} step={0.01} value={songVolume} disabled={!listenAlong || !audioUrl} onChange={(e) => setSongVolume(Number(e.target.value))} />
        </div>}
        {!settingsOpen && <span className="lyrics-toolbar-position">{lyricsCueLabel(Math.floor(beat / (4 / meter[1])) * (4 / meter[1]), meter)} / {lyricsCueLabel(Math.floor(playbackEnd / (4 / meter[1])) * (4 / meter[1]), meter)}</span>}
        {settingsOpen && recordingActions}
        </div>
      </div>
  );
  const playbackControls = (<>
      {(settingsOpen || Boolean(songAudio) || followEnabled) && (
        <div className="lyrics-follow-progress">
          <input
            type="range"
            aria-label="가사 재생 위치"
            style={{ '--seek-progress': `${Math.max(0, Math.min(100, beat / Math.max(0.5, progressEnd) * 100))}%` } as CSSProperties}
            aria-valuetext={lyricsCueLabel(beat, meter)}
            min={0}
            max={Math.max(0.5, progressEnd)}
            step={0.01}
            value={Math.min(beat, progressEnd)}
            disabled={!transport?.ready || progressEnd <= 0}
            onChange={(event) => {
              const position = Number(event.target.value);
              transport?.seek(position, true);
              setBeat(position);
              setAudioSeekRevision((value) => value + 1);
            }}
          />
          <div className="lyrics-progress-times">
            <span>{lyricsPlaybackTime(Math.min(beat, progressEnd) * 60 / bpm)}</span>
            <span>{lyricsPlaybackTime(progressEnd * 60 / bpm)}</span>
          </div>
        </div>
      )}
      {recordControls}
  </>);
  return (
    <section
      ref={root}
      className="lyrics-follow"
      data-settings={settingsOpen}
      data-source="metronome"
      tabIndex={0}
      aria-label={settingsOpen ? '가사 박자 설정' : '가사 따라가기 재생'}
    >
      {toolbarHost ? createPortal(toolbar, toolbarHost) : toolbar}
      <audio ref={linkedAudio} src={audioUrl || undefined} preload="metadata" onLoadedMetadata={() => setAudioDuration(Number.isFinite(linkedAudio.current?.duration) ? linkedAudio.current!.duration : 0)} />
      {audioError && <p role="alert">{audioError}</p>}
      {message && <p role="status">{message}</p>}
      {(actionError || storageError) && (
        <p role="alert">{actionError || '이 기기에 가사 타이밍을 저장하지 못했어요.'}</p>
      )}
      {document.lyrics && document.lyrics !== lyrics && (
        <p>가사가 변경되어 이전 타이밍을 적용하지 않았어요. 구분절을 확인하고 다시 지정해주세요.</p>
      )}
      {settingsOpen && (
        <LyricsCueTimeline
          selectedSection={selectedSection}
          cues={cues}
          beat={beat}
          meter={meter}
          playing={transport?.playing ?? false}
          onMove={(section, position) => {
            const updated = moveLyricsCue(cues, section, position);
            setCues(updated);
            setDirty(true);
            setRedoSection(null);
            const moved = updated.find((cue) => cue.section === section)!;
            transport?.seek(moved.beat);
            setBeat(moved.beat);
            setSelectedSection(section);
          }}
          onSelect={(position, section) => {
            transport?.seek(position);
            setBeat(position);
            setSelectedSection(section ?? activeLyricsSection(cues, position));
          }}
        />
      )}
      {settingsOpen && playbackControls}
      <div className="lyrics-follow-layout" ref={setLyricsArea}>
        {!settingsOpen && followEnabled && !cues.length && <div className="lyrics-missing-timing" role="status">
          저장된 가사 박자가 없어요. ‘가사 박자 설정’에서 시작 박자를 지정해주세요.
        </div>}
        {settingsOpen ? (
          <div className="lyrics-follow-queue">
            <ol className="lyrics-cue-list" aria-label="가사 박자 입력 목록">
              {sections.map((text, index) => {
                const cue = cues.find((cue) => cue.section === index);
                return (
                  <li
                    key={index}
                    data-current={index === lastRecorded}
                    aria-current={index === lastRecorded ? 'true' : undefined}
                    data-recorded={Boolean(cue)}
                    onClick={(event) => {
                      if (!cue || (event.target as Element).closest('.lyrics-cue-redo')) return;
                      transport?.seek(cue.beat);
                      setBeat(cue.beat);
                      setSelectedSection(index);
                    }}
                    ref={(node) => {
                      if (node) sectionNodes.current.set(index, node);
                      else sectionNodes.current.delete(index);
                    }}
                  >
                    <span className="lyrics-cue-number">{index + 1}.</span>
                    {cue ? (
                      <button
                        type="button"
                        className="lyrics-cue-text lyrics-cue-select"
                        aria-label={`${index + 1}번 가사 시작 박자 선택`}
                      >
                        {text}
                      </button>
                    ) : (
                      <span className="lyrics-cue-text">{text}</span>
                    )}
                    {cue && (
                      <button
                        className="lyrics-cue-redo"
                        title={`${index + 1}번째 가사만 다시 입력`}
                        onClick={() => {
                          if (transport?.playing) transport.toggle();
                          setRedoSection(index);
                          setCues((value) => value.filter((item) => item.section !== index));
                          setDirty(true);
                          setSelectedSection(index);
                          setMessage(
                            `${index + 1}번 가사의 시작만 다시 입력합니다. 다음 가사의 박자가 오면 기존 기록으로 넘어갑니다.`,
                          );
                          transport?.seek(cue.beat);
                          setBeat(cue.beat);
                        }}
                      >
                        다시 입력
                      </button>
                    )}
                    <span
                      className="lyrics-cue-position"
                      aria-label={`${index + 1}번째 가사의 기록된 박자`}
                      data-beat={cue?.beat}
                    >
                      {cue ? lyricsCueLabel(cue.beat, meter) : '미지정'}
                    </span>
                  </li>
                );
              })}
            </ol>
          </div>
        ) : (
          <div
            className="lyrics-reading-paper"
            ref={setPaper}
            aria-label="박자에 맞춰 따라가는 가사"
          >
            <div aria-hidden="true" style={{ height: paperHeight / 2 }} />
            {sections.map((text, index) => (
              <div
                key={index}
                data-lyric-section={index}
                data-current={followEnabled && active === index}
                aria-current={followEnabled && active === index ? 'true' : undefined}
                role="button"
                tabIndex={0}
                onClick={() => {
                  if (transport?.playing) return;
                  const position = cues.find((cue) => cue.section === index)?.beat ?? playbackEnd;
                  transport?.seek(position);
                  setBeat(position);
                }}
                onKeyDown={(event) => {
                  if (event.key !== 'Enter' || transport?.playing) return;
                  event.preventDefault();
                  const position = cues.find((cue) => cue.section === index)?.beat ?? playbackEnd;
                  transport?.seek(position);
                  setBeat(position);
                }}
                ref={(node) => {
                  if (node) sectionNodes.current.set(index, node);
                  else sectionNodes.current.delete(index);
                }}
                style={{ fontSize: `clamp(12px, ${size / 10}cqw, ${size * 1.8}px)` }}
              >
                {text}
              </div>
            ))}
            <div aria-hidden="true" style={{ height: paperHeight / 2 }} />
          </div>
        )}
      </div>
      {!settingsOpen && playbackControls}
    </section>
  );
}

function lyricsPlaybackTime(seconds: number) {
  const value = Math.max(0, Math.floor(seconds));
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}`;
}

function LyricsPlaybackIcon({ path }: { path: string }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={path} />
    </svg>
  );
}

function LyricsCueTimeline({
  selectedSection,
  cues,
  beat,
  meter,
  playing,
  onSelect,
  onMove,
}: {
  selectedSection: number | null;
  cues: LyricsCue[];
  beat: number;
  meter: [number, number];
  playing: boolean;
  onSelect: (beat: number, section?: number) => void;
  onMove: (section: number, beat: number) => void;
}) {
  const viewport = useRef<HTMLDivElement>(null);
  const drag = useRef<{
    section: number;
    x: number;
    scroll: number;
    beat: number;
    pointer: number;
    moved: boolean;
  } | null>(null);
  const suppressClick = useRef(false);
  const [preview, setPreview] = useState<{ section: number; beat: number } | null>(null);
  const barLength = (meter[0] * 4) / meter[1];
  useEffect(() => {
    const move = (event: PointerEvent) => {
      const start = drag.current;
      const node = viewport.current;
      if (!start || !node || event.pointerId !== start.pointer) return;
      if (Math.abs(event.clientX - start.x) > 3) start.moved = true;
      if (!start.moved) return;
      event.preventDefault();
      const rect = node.getBoundingClientRect();
      if (event.clientX > rect.right - 20) node.scrollLeft += 12;
      if (event.clientX < rect.left + 20) node.scrollLeft -= 12;
      const position =
        start.beat + ((event.clientX - start.x + node.scrollLeft - start.scroll) / 72) * barLength;
      const updated = moveLyricsCue(cues, start.section, position);
      setPreview({
        section: start.section,
        beat: updated.find((cue) => cue.section === start.section)!.beat,
      });
    };
    const end = (event: PointerEvent) => {
      const start = drag.current;
      if (!start || start.pointer !== event.pointerId) return;
      drag.current = null;
      suppressClick.current = start.moved;
      if (event.type === 'pointerup' && start.moved && preview) onMove(start.section, preview.beat);
      setPreview(null);
    };
    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
    };
  }, [cues, barLength, onMove, preview]);
  const currentBar = Math.floor(beat / barLength);
  const recordedCount = cues.length ? Math.floor(cues[cues.length - 1].beat / barLength) + 1 : 1;
  const count = playing ? Math.max(recordedCount, currentBar + 2) : recordedCount;
  useEffect(() => {
    const node = viewport.current;
    if (!node) return;
    const left = Math.max(0, Math.min(currentBar, count - 1)) * 72;
    if (left < node.scrollLeft || left + 72 > node.scrollLeft + node.clientWidth)
      node.scrollTo({ left: Math.max(0, left - node.clientWidth + 72), behavior: 'smooth' });
  }, [currentBar, count]);
  const byBar = new Map<number, LyricsCue[]>();
  for (const cue of cues) {
    const bar = Math.floor(cue.beat / barLength);
    byBar.set(bar, [...(byBar.get(bar) ?? []), cue]);
  }
  return (
    <div className="lyrics-cue-timeline" ref={viewport} aria-label="마디별 가사 박자 기록">
      <div className="lyrics-cue-timeline-track">
        <div
          className="lyrics-timeline-cursor"
          role="img"
          aria-label={`현재 재생 위치 ${lyricsCueLabel(beat, meter)}`}
          style={{ left: Math.min(Math.max(0, (beat / barLength) * 72), count * 72 - 1) }}
        />
        {Array.from({ length: count }, (_, bar) => {
          const markers = byBar.get(bar) ?? [];
          return (
            <div className="lyrics-cue-bar" key={bar} data-current={bar === currentBar}>
              <div
                className="lyrics-cue-markers"
                style={{ height: 24 }}
              >
                {markers.map((cue) => (
                  <button
                    type="button"
                    key={cue.section}
                    className="lyrics-cue-marker"
                    aria-pressed={cue.section === activeLyricsSection(cues, beat)}
                    title={`${cue.section + 1}번 가사 · ${lyricsCueLabel(cue.beat, meter)}`}
                    onPointerDown={(event) => {
                      if (event.button !== 0) return;
                      suppressClick.current = false;
                      event.currentTarget.setPointerCapture(event.pointerId);
                      drag.current = {
                        section: cue.section,
                        x: event.clientX,
                        scroll: viewport.current?.scrollLeft ?? 0,
                        beat: cue.beat,
                        pointer: event.pointerId,
                        moved: false,
                      };
                    }}
                    onClick={() => {
                      if (!suppressClick.current) onSelect(cue.beat, cue.section);
                    }}
                    style={{
                      left: `${(((preview?.section === cue.section ? preview.beat : cue.beat) - bar * barLength) / barLength) * 100}%`,
                      top: 3,
                      zIndex: cue.section === (playing ? activeLyricsSection(cues, beat) : selectedSection ?? activeLyricsSection(cues, beat)) ? 10000 : cue.section + 1,
                    }}
                  >
                    {cue.section + 1}
                  </button>
                ))}
              </div>
              <button
                type="button"
                className="lyrics-cue-bar-beats"
                aria-label={`${bar + 1}마디 선택`}
                aria-pressed={bar === currentBar}
                onClick={(event) => {
                  const bounds = event.currentTarget.getBoundingClientRect();
                  const fraction = event.detail === 0 || !bounds.width ? 0 : Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width));
                  const beatIndex = Math.min(meter[0], Math.round(fraction * meter[0]));
                  onSelect(bar * barLength + beatIndex * (4 / meter[1]));
                }}
                style={{ gridTemplateColumns: `repeat(${meter[0]}, 1fr)` }}
              >
                {Array.from({ length: meter[0] }, (_, index) => (
                  <span key={index} />
                ))}
              </button>
              <span className="lyrics-cue-bar-label">{bar + 1}마디</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
