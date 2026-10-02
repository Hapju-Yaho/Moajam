import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import {
  beatSeconds,
  musicalPosition,
  signatures,
  snapOffset,
  snapClipEdges,
  type ClipSnap,
  waveformPeaks,
  type TimeSignature,
} from '../lib/practiceTimeline';
import { trackParts, trackPartLabel, type TrackPart } from '../lib/trackParts';
import { trackClips, type TimelineClip, type TimelineTrack } from '../lib/practiceClips';
export type { TimelineTrack } from '../lib/practiceClips';
import './TrackTimeline.web.css';
type Transport = {
  position: number;
  duration: number;
  playing: boolean;
  recording: boolean;
  requesting: boolean;
  preparing: boolean;
  countdown: number;
  bpm: number;
  signature: TimeSignature;
  metronome: boolean;
  standalone: boolean;
  clickVolume: number;
  countInBars: number;
  masterVolume: number;
  beat: number;
  onPlay: () => void;
  onStop: () => void;
  onRewind: () => void;
  onRecord: () => void;
  onSeek: (time: number) => void;
  onBpm: (bpm: number) => void;
  onSignature: (value: TimeSignature) => void;
  onMetronome: () => void;
  onStandalone: () => void;
  onClickVolume: (volume: number) => void;
  onCountIn: (bars: number) => void;
  onMasterVolume: (volume: number) => void;
  loop: boolean;
  loopStart: number;
  loopEnd: number;
  onLoop: () => void;
  onLoopStart: () => void;
  onLoopEnd: () => void;
};
const clock = (time: number) =>
  `${Math.floor(time / 60)}:${String(Math.floor(time % 60)).padStart(2, '0')}`;
type IconName =
  | 'play'
  | 'pause'
  | 'stop'
  | 'record'
  | 'rewind'
  | 'upload'
  | 'plus'
  | 'trash'
  | 'volume'
  | 'metronome'
  | 'expand'
  | 'download';
function Icon({ name }: { name: IconName }) {
  const paths: Record<IconName, string> = {
    play: 'm8 4 12 8-12 8Z',
    pause: 'M8 5v14M16 5v14',
    stop: 'M6 6h12v12H6Z',
    record: 'M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16',
    rewind: 'M5 5v14M19 5 7 12l12 7Z',
    upload: 'M12 16V3m-5 5 5-5 5 5M4 15v5h16v-5',
    plus: 'M12 5v14M5 12h14',
    trash: 'M4 6h16M9 6V3h6v3M7 6l1 15h8l1-15M10 10v7M14 10v7',
    volume: 'M4 9h4l5-5v16l-5-5H4ZM17 8c3 2 3 6 0 8',
    metronome: 'm7 20 4-17h2l4 17ZM12 14l7-9M6 20h12',
    expand: 'M8 3H3v5M16 3h5v5M3 16v5h5M21 16v5h-5',
    download: 'M12 3v13m-5-5 5 5 5-5M4 17v4h16v-4',
  };
  return (
    <svg
      aria-hidden="true"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={paths[name]} />
    </svg>
  );
}

type WaveData = { peaks: number[]; duration: number };
const waveCache = new WeakMap<Blob, Promise<WaveData>>();
let decodeQueue: Promise<unknown> = Promise.resolve();
function decodeWave(blob: Blob) {
  let task = waveCache.get(blob);
  if (!task) {
    task = decodeQueue
      .catch(() => {})
      .then(async () => {
        const context = new AudioContext();
        try {
          const buffer = await context.decodeAudioData(await blob.arrayBuffer());
          return {
            peaks: waveformPeaks(
              Array.from({ length: buffer.numberOfChannels }, (_, channel) =>
                buffer.getChannelData(channel),
              ),
            ),
            duration: buffer.duration,
          };
        } finally {
          await context.close();
        }
      });
    decodeQueue = task;
    waveCache.set(blob, task);
  }
  return task;
}
function Waveform({
  blob,
  sourceStart,
  duration,
  onDuration,
}: {
  blob: Blob;
  sourceStart: number;
  duration: number;
  onDuration: (duration: number) => void;
}) {
  const [data, setData] = useState<WaveData | null>(null);
  const [failed, setFailed] = useState(false);
  const callback = useRef(onDuration);
  callback.current = onDuration;
  useEffect(() => {
    let active = true;
    setData(null);
    setFailed(false);
    void decodeWave(blob)
      .then((value) => {
        if (active) {
          setData(value);
          callback.current(value.duration);
        }
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, [blob]);
  const path = useMemo(
    () => data?.peaks.map((peak, index) => `M${index} ${25 - peak * 24}v${peak * 48}`).join(' '),
    [data],
  );
  if (!data)
    return (
      <span className="studio-wave-status">
        {failed ? '파형을 표시할 수 없어요' : '파형 분석 중…'}
      </span>
    );
  return (
    <svg
      className="studio-wave"
      aria-label="오디오 파형"
      viewBox={`${(sourceStart / data.duration) * data.peaks.length} 0 ${Math.max(1, ((duration || data.duration) / data.duration) * data.peaks.length)} 50`}
      preserveAspectRatio="none"
    >
      <line x1="0" x2={data.peaks.length} y1="25" y2="25" stroke="currentColor" opacity=".4" />
      <path d={path} stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}

export function TrackTimeline({
  tracks,
  loaded,
  saveLabel,
  error,
  onUpload,
  onAdd,
  onReorder,
  onPatch,
  onPatchClip,
  onClipDuration,
  onMoveClip,
  onMoveToNewTrack,
  onSave,
  onRefresh,
  refreshing,
  saving,
  dirty,
  onSplitClip,
  onRemoveClip,
  onRemove,
  solo,
  onSolo,
  armed,
  onArm,
  onPublish,
  onImportClip,
  publishing,
  transport: t,
}: {
  tracks: TimelineTrack[];
  loaded: boolean;
  saveLabel: string;
  error: string;
  onUpload: (files: File[], targetId: string) => void;
  onAdd: () => void;
  onReorder: (ids: string[]) => void;
  onPatch: (id: string, changes: Partial<TimelineTrack>) => void;
  onPatchClip: (id: string, changes: Partial<TimelineClip>) => void;
  onClipDuration: (id: string, duration: number) => void;
  onMoveToNewTrack: (id: string, offset: number) => void;
  onSave: () => void;
  onRefresh: () => void;
  refreshing: boolean;
  saving: boolean;
  dirty: boolean;
  onMoveClip: (id: string, targetId: string, offset: number) => void;
  onSplitClip: (id: string, position: number) => void;
  onRemoveClip: (id: string) => void;
  onRemove: (id: string) => void;
  solo: string | null;
  onSolo: (id: string) => void;
  armed: string | null;
  onArm: (id: string) => void;
  onPublish?: (clip: TimelineClip) => void;
  onImportClip: (trackId: string) => void;
  publishing: string | null;
  transport: Transport;
}) {
  const [trackOrder, setTrackOrder] = useState<string[] | null>(null);
  const movingTrack = useRef<{
    id: string;
    ids: string[];
    startY: number;
    top: number;
    scrollTop: number;
  } | null>(null);
  const [liftedTrack, setLiftedTrack] = useState<{ id: string; delta: number } | null>(null);
  const trackRows = useRef(new Map<string, HTMLDivElement>());
  const rowPositions = useRef(new Map<string, number>());
  useLayoutEffect(() => {
    const next = new Map<string, number>();
    trackRows.current.forEach((row, id) => {
      const top = row.offsetTop;
      next.set(id, top);
      if (liftedTrack?.id === id)
        row.style.transform = `translateY(${liftedTrack.delta + (movingTrack.current?.top ?? top) - top}px)`;
      const old = rowPositions.current.get(id);
      if (
        old !== undefined &&
        old !== top &&
        id !== liftedTrack?.id &&
        !window.matchMedia('(prefers-reduced-motion: reduce)').matches
      )
        row.animate([{ transform: `translateY(${old - top}px)` }, { transform: 'translateY(0)' }], {
          duration: 180,
          easing: 'ease-out',
        });
    });
    rowPositions.current = next;
  });
  const reorderTrack = (id: string, target: string) => {
    const ids = trackOrder ?? tracks.map((track) => track.id);
    const from = ids.indexOf(id),
      to = ids.indexOf(target);
    if (from < 0 || to < 0 || from === to) return ids;
    const next = [...ids];
    next.splice(from, 1);
    next.splice(to, 0, id);
    return next;
  };
  const finishTrackDrag = (commit: boolean) => {
    const current = movingTrack.current;
    if (!current) return;
    const row = trackRows.current.get(current.id);
    if (row && !window.matchMedia('(prefers-reduced-motion: reduce)').matches)
      row.animate([{ transform: row.style.transform }, { transform: 'translateY(0)' }], {
        duration: 160,
        easing: 'ease-out',
      });
    movingTrack.current = null;
    setLiftedTrack(null);
    setTrackOrder(null);
    if (commit && !locked && current.ids.some((id, index) => id !== tracks[index]?.id))
      onReorder(current.ids);
  };
  const [zoom, setZoom] = useState(48);
  const [zoomDraft, setZoomDraft] = useState('100');
  useEffect(() => setZoomDraft(String(Math.round((zoom / 48) * 100))), [zoom]);
  const rulerDrag = useRef<{ x: number; y: number; zoom: number; moved: boolean } | null>(null);
  const [nameSize, setNameSize] = useState({ width: 160, height: 28 });
  const [clipName, setClipName] = useState('');
  const [naming, setNaming] = useState(false);
  const [bpmDraft, setBpmDraft] = useState(String(t.bpm));
  useEffect(() => setBpmDraft(String(t.bpm)), [t.bpm]);
  const [snap, setSnap] = useState(true);
  const [magnetic, setMagnetic] = useState(true);
  const [follow, setFollow] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [filter, setFilter] = useState('ALL');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = tracks.flatMap(trackClips).find((clip) => clip.id === selectedId);
  const canSplit =
    !!selected &&
    t.position > selected.offset + 0.01 &&
    t.position < selected.offset + selected.duration - 0.01;
  const [drag, setDrag] = useState<{
    id: string;
    x: number;
    y: number;
    scrollLeft: number;
    targetId: string;
    original: number;
    offset: number;
    guide?: ClipSnap;
  } | null>(null);
  const addRow = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const uploadTarget = useRef<string | undefined>(undefined);
  const viewport = useRef<HTMLDivElement>(null);
  const [viewportWidth, setViewportWidth] = useState(660);
  useEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const resize = () => setViewportWidth(element.clientWidth);
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    return () => observer.disconnect();
  }, [expanded]);
  const lanes = useRef(new Map<string, HTMLDivElement>());
  const locked = !loaded || refreshing || t.playing || t.recording || t.requesting;
  const step = beatSeconds(t.bpm, t.signature);
  const perBar = Number(t.signature.split('/')[0]);
  const barSeconds = step * perBar;
  const seconds = Math.max(
    16 * barSeconds,
    t.duration + 2 * barSeconds,
    t.position + 2 * barSeconds,
  );
  const timelineWidth = Math.max(660, seconds * zoom);
  const rulerStride = Math.max(
    1,
    Math.ceil(34 / (barSeconds * zoom)),
    Math.ceil(seconds / barSeconds / 400),
  );
  const markers = Array.from(
    { length: Math.ceil(seconds / barSeconds / rulerStride) },
    (_, index) => index * rulerStride,
  );
  const place = musicalPosition(t.position, t.bpm, t.signature);
  const orderedTracks = trackOrder
    ? trackOrder.flatMap((id) => tracks.find((track) => track.id === id) ?? [])
    : tracks;
  const visible = orderedTracks.filter(
    (track) => filter === 'ALL' || (track.part ?? 'UNASSIGNED') === filter,
  );
  const openFile = (id: string) => {
    if (!loaded || locked || !tracks.some((track) => track.id === id)) return;
    uploadTarget.current = id;
    fileInput.current?.click();
  };
  const dragTarget = (x: number, y: number) => {
    const addBounds = addRow.current?.getBoundingClientRect();
    if (
      addBounds &&
      x >= addBounds.left &&
      x <= addBounds.right &&
      y >= addBounds.top &&
      y <= addBounds.bottom
    )
      return '__new-track__';
    for (const [id, lane] of lanes.current) {
      const rect = lane.getBoundingClientRect();
      if (
        y >= rect.top &&
        y < rect.bottom &&
        x >= Math.max(rect.left, viewport.current?.getBoundingClientRect().left ?? 0) &&
        x <= rect.right
      )
        return id;
    }
    return undefined;
  };
  const dragPlacement = (clientX: number, targetId: string, free = false) => {
    if (!drag) return { offset: 0, guide: undefined };
    const delta = clientX - drag.x + (viewport.current?.scrollLeft ?? 0) - drag.scrollLeft;
    if (Math.abs(delta) < 3) return { offset: drag.original, guide: undefined };
    const raw = Math.max(0, drag.original + delta / zoom);
    if (raw === 0) return { offset: 0, guide: undefined };
    const moving = tracks.flatMap(trackClips).find((clip) => clip.id === drag.id);
    // Prefer the destination lane only when two candidate edges are equally close.
    const targets = [...visible]
      .sort((a, b) => Number(b.id === targetId) - Number(a.id === targetId))
      .flatMap(trackClips);
    const guide =
      magnetic && !free && moving
        ? snapClipEdges({ ...moving, offset: raw }, targets, zoom)
        : undefined;
    return { offset: guide?.offset ?? snapOffset(raw, t.bpm, t.signature, snap && !free), guide };
  };
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setExpanded(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);
  useEffect(() => {
    const element = viewport.current;
    if (!element || !follow || !t.playing) return;
    const x = t.position * zoom;
    const available = element.clientWidth - 214;
    if (x > element.scrollLeft + available - 45 || x < element.scrollLeft)
      element.scrollLeft = Math.max(0, x - available * 0.25);
  }, [t.position, t.playing, follow, zoom]);
  const seekPosition = (value: number, free = false) =>
    t.onSeek(snapOffset(value, t.bpm, t.signature, snap && !free));
  const seekAt = (event: React.MouseEvent<HTMLElement>) => {
    if (t.recording || t.requesting) return;
    const x = event.clientX - event.currentTarget.getBoundingClientRect().left;
    seekPosition(x / zoom, event.altKey);
  };
  const editor = (
    <section className={`track-studio ${expanded ? 'is-expanded' : ''}`} aria-label="트랙 편집기">
      <header className="studio-heading">
        <div>
          <h2>
            사운드 트랙 <span>{tracks.length}</span>
          </h2>
          <p aria-live="polite">{saveLabel}</p>
        </div>
        <input
          ref={fileInput}
          aria-label="트랙 음원 파일"
          type="file"
          accept="audio/*"
          multiple
          hidden
          onChange={(event) => {
            setFilter('ALL');
            if (uploadTarget.current)
              onUpload(Array.from(event.target.files ?? []), uploadTarget.current);
            event.target.value = '';
            uploadTarget.current = undefined;
          }}
        />
        <div style={{ display: 'flex', gap: 8, marginLeft: 'auto' }}>
          <button
            type="button"
            disabled={!loaded || saving || refreshing || locked}
            onClick={onRefresh}
          >
            {refreshing ? '새로고침 중…' : '새로고침'}
          </button>
          <button
            type="button"
            className="studio-share"
            onClick={onSave}
            disabled={!loaded || saving || refreshing || !dirty || t.recording || t.requesting}
          >
            {saving ? '저장 중…' : '변경사항 공유하기'}
          </button>
        </div>
      </header>
      <div className="studio-console">
        <div className="studio-transport">
          <div className="studio-transport-buttons">
            <button
              title="처음으로"
              aria-label="처음으로"
              disabled={t.recording || t.requesting}
              onClick={t.onRewind}
            >
              <Icon name="rewind" />
            </button>
            <button title="정지" aria-label="정지" onClick={t.onStop}>
              <Icon name="stop" />
            </button>
            <button
              className="studio-play"
              title={t.playing ? '일시정지' : '함께 재생'}
              aria-label={t.playing ? '일시정지' : '함께 재생'}
              disabled={!loaded || !t.duration || t.recording || t.requesting}
              onClick={t.onPlay}
            >
              <Icon name={t.playing ? 'pause' : 'play'} />
            </button>
            <button
              className={`studio-record ${t.recording ? 'active' : ''}`}
              title={t.recording ? '녹음 완료' : '녹음 시작'}
              aria-label={t.recording ? '녹음 완료' : '녹음 시작'}
              disabled={!loaded || t.requesting || (t.playing && !t.recording)}
              onClick={t.onRecord}
            >
              <Icon name="record" />
            </button>
          </div>
          <div className="studio-time" aria-label="현재 재생 시간">
            <strong>
              {clock(t.position)}
              <small>.{String(Math.floor(t.position * 100) % 100).padStart(2, '0')}</small>
            </strong>
            <span>
              {String(place.bar).padStart(3, '0')} : {place.beat} 마디 · 박
            </span>
          </div>
          <span className={`studio-status ${t.recording ? 'recording' : ''}`}>
            ●{' '}
            {t.countdown
              ? `녹음까지 ${t.countdown}박`
              : t.preparing
                ? '음원 준비 중'
                : t.requesting
                  ? '마이크 연결 중'
                  : t.recording
                    ? '녹음 중'
                    : t.playing
                      ? '재생 중'
                      : '정지'}
          </span>
          <div className="studio-length">
            <span>전체 길이</span>
            <strong>
              {clock(t.duration)}.{String(Math.floor((t.duration % 1) * 100)).padStart(2, '0')}
            </strong>
          </div>
        </div>
        <div className="studio-clickbar">
          <button
            className={t.metronome ? 'active' : ''}
            aria-label="메트로놈"
            aria-pressed={t.metronome}
            onClick={t.onMetronome}
          >
            <Icon name="metronome" />
            메트로놈
            <span className="studio-switch" />
          </button>
          <label>
            <input
              aria-label="메트로놈 BPM"
              type="number"
              min="30"
              max="300"
              value={bpmDraft}
              disabled={t.recording || t.requesting}
              onChange={(event) => {
                setBpmDraft(event.target.value);
                const value = Number(event.target.value);
                if (value >= 30 && value <= 300) t.onBpm(value);
              }}
              onBlur={() => {
                const value = Math.max(30, Math.min(300, Number(bpmDraft) || 120));
                setBpmDraft(String(value));
                t.onBpm(value);
              }}
            />{' '}
            BPM
          </label>
          <select
            aria-label="박자표"
            value={t.signature}
            disabled={t.recording || t.requesting}
            onChange={(event) => t.onSignature(event.target.value as TimeSignature)}
          >
            {signatures.map((signature) => (
              <option key={signature}>{signature}</option>
            ))}
          </select>
          <div className="studio-beats" aria-label={`${perBar}박 표시`}>
            {Array.from({ length: perBar }, (_, index) => (
              <i key={index} className={t.beat === index ? 'lit' : ''} />
            ))}
          </div>
          <button
            aria-label={t.standalone ? '메트로놈 독립 재생 정지' : '메트로놈만 재생'}
            title="메트로놈만 재생"
            aria-pressed={t.standalone}
            disabled={t.playing || t.recording || t.requesting}
            onClick={t.onStandalone}
          >
            <Icon name={t.standalone ? 'stop' : 'play'} />
          </button>
          <label title="메트로놈 음량">
            <Icon name="volume" />
            <input
              aria-label="메트로놈 음량"
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={t.clickVolume}
              onChange={(event) => t.onClickVolume(Number(event.target.value))}
            />
          </label>
          <label>
            카운트인{' '}
            <select
              aria-label="녹음 전 카운트인"
              value={t.countInBars}
              disabled={t.requesting || t.recording}
              onChange={(event) => t.onCountIn(Number(event.target.value))}
            >
              <option value="0">없음</option>
              <option value="1">1마디</option>
              <option value="2">2마디</option>
            </select>
          </label>
          <label className="studio-master">
            전체 음량{' '}
            <input
              aria-label="전체 음량"
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={t.masterVolume}
              onChange={(event) => t.onMasterVolume(Number(event.target.value))}
            />
          </label>
        </div>
        <div className="studio-tools">
          <span className="studio-track-count">≋ {tracks.length} TRACKS</span>
          <select
            aria-label="표시할 세션"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
          >
            <option value="ALL">모든 세션</option>
            {trackParts.map((part) => (
              <option key={part.value} value={part.value}>
                {part.label}
              </option>
            ))}
          </select>
          <div className="studio-tools-end">
            <button
              className={follow ? 'active' : ''}
              aria-label="커서 따라가기"
              aria-pressed={follow}
              title="재생 시 커서가 화면 밖으로 나가면 타임라인이 자동으로 커서를 따라갑니다."
              onClick={() => setFollow(!follow)}
            >
              커서 따라가기
            </button>
            <button
              className={magnetic ? 'active' : ''}
              aria-label="클립 붙이기"
              aria-pressed={magnetic}
              title="드래그하는 클립의 시작 끝을 가까운 다른 클립의 시작 끝에 맞춥니다."
              onClick={() => setMagnetic(!magnetic)}
            >
              클립 붙이기
            </button>
            <button
              className={snap ? 'active' : ''}
              aria-label="박자에 맞추기"
              aria-pressed={snap}
              title="클립 및 커서 이동 위치를 박자 단위 위치로 맞춥니다."
              onClick={() => setSnap(!snap)}
            >
              박자 맞춤
            </button>
            <button
              aria-label="타임라인 축소"
              disabled={zoom <= 12}
              onClick={() => setZoom(Math.max(12, zoom / 1.5))}
            >
              −
            </button>
            <label>
              <input
                aria-label="타임라인 배율"
                type="number"
                min="25"
                max="500"
                value={zoomDraft}
                onChange={(event) => setZoomDraft(event.target.value)}
                onBlur={() => {
                  const value = Number(zoomDraft);
                  if (value > 0) setZoom(Math.max(12, Math.min(240, (value * 48) / 100)));
                  else setZoomDraft(String(Math.round((zoom / 48) * 100)));
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') event.currentTarget.blur();
                }}
                style={{ width: 56 }}
              />
              %
            </label>
            <button
              aria-label="타임라인 확대"
              disabled={zoom >= 240}
              onClick={() => setZoom(Math.min(240, zoom * 1.5))}
            >
              ＋
            </button>
            <button
              aria-label={expanded ? '편집기 원래 크기' : '편집기 크게 보기'}
              title="편집기 크게 보기"
              onClick={() => setExpanded(!expanded)}
            >
              <Icon name="expand" />
            </button>
          </div>
        </div>
        <div className="studio-clip-tools">
          {selected ? (
            naming ? (
              <input
                aria-label="클립 이름"
                className="studio-clip-name-input"
                style={{ ...nameSize, flexShrink: 0, boxSizing: 'border-box' }}
                autoFocus
                value={clipName}
                onChange={(event) => setClipName(event.target.value)}
                onBlur={() => {
                  if (clipName.trim()) onPatchClip(selected.id, { name: clipName.trim() });
                  setNaming(false);
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') event.currentTarget.blur();
                  if (event.key === 'Escape') setNaming(false);
                }}
              />
            ) : (
              <button
                disabled={locked}
                title="클립 이름 수정"
                onClick={(event) => {
                  const { width, height } = event.currentTarget.getBoundingClientRect();
                  setNameSize({ width, height });
                  setClipName(selected.name);
                  setNaming(true);
                }}
              >
                {selected.name}
              </button>
            )
          ) : (
            <span>편집할 클립을 선택하세요</span>
          )}
          <button
            disabled={locked || !canSplit}
            onClick={() => selected && onSplitClip(selected.id, t.position)}
            title="클립 안에 재생 커서를 놓고 자르세요"
          >
            ✂ 커서에서 자르기
          </button>
          <button
            disabled={locked || !selected}
            onClick={() => selected && onRemoveClip(selected.id)}
          >
            클립 삭제
          </button>
          {selected && (
            <label>
              시작{' '}
              <input
                aria-label="선택한 클립 시작 위치"
                type="number"
                min="0"
                max="600"
                step="0.01"
                value={Math.round(selected.offset * 100) / 100}
                disabled={locked}
                onChange={(event) => {
                  const offset = Number(event.target.value);
                  if (Number.isFinite(offset))
                    onPatchClip(selected.id, {
                      offset: snapOffset(offset, t.bpm, t.signature, false),
                    });
                }}
              />{' '}
              초
            </label>
          )}
          {selected && onPublish && (
            <button disabled={!!publishing} onClick={() => onPublish(selected)}>
              {publishing === selected.id ? '보관 중…' : '클립 보관하기'}
            </button>
          )}
        </div>
        <div
          className="studio-timeline"
          ref={viewport}
          tabIndex={0}
          aria-label="트랙 타임라인"
          onPointerMove={(event) => {
            const current = movingTrack.current;
            const container = viewport.current;
            if (!current || !container || locked) return;
            const bounds = container.getBoundingClientRect();
            if (event.clientY < bounds.top + 28) container.scrollTop -= 12;
            if (event.clientY > bounds.bottom - 28) container.scrollTop += 12;
            setLiftedTrack({
              id: current.id,
              delta: event.clientY - current.startY + container.scrollTop - current.scrollTop,
            });
            // Use layout coordinates: animated bounds can swap the target back and forth.
            const grid = container.querySelector<HTMLElement>('.studio-grid');
            if (!grid) return;
            const y = event.clientY - grid.getBoundingClientRect().top;
            for (const [id, row] of trackRows.current) {
              if (id === current.id) continue;
              const down = current.ids.indexOf(current.id) < current.ids.indexOf(id);
              const midpoint = row.offsetTop + row.offsetHeight / 2;
              if (
                y < row.offsetTop ||
                y > row.offsetTop + row.offsetHeight ||
                (down ? y < midpoint : y > midpoint)
              )
                continue;
              const ids = [...current.ids];
              ids.splice(ids.indexOf(current.id), 1);
              ids.splice(current.ids.indexOf(id), 0, current.id);
              current.ids = ids;
              setTrackOrder(ids);
              break;
            }
          }}
          onPointerUp={() => finishTrackDrag(true)}
          onPointerCancel={() => finishTrackDrag(false)}
          onLostPointerCapture={() => finishTrackDrag(false)}
        >
          <div
            className="studio-grid"
            style={
              {
                width: timelineWidth + 214,
                '--beat-width': `${step * zoom}px`,
                '--bar-width': `${barSeconds * zoom}px`,
              } as CSSProperties
            }
          >
            <div className="studio-ruler-row">
              <div className="studio-track-head">세션 / 트랙</div>
              <div
                className="studio-ruler"
                onPointerDown={(event) => {
                  if (event.button !== 0) return;
                  event.currentTarget.setPointerCapture(event.pointerId);
                  rulerDrag.current = { x: event.clientX, y: event.clientY, zoom, moved: false };
                }}
                onPointerMove={(event) => {
                  const drag = rulerDrag.current;
                  if (!drag) return;
                  const delta = event.clientY - drag.y;
                  if (Math.abs(delta) > 3) drag.moved = true;
                  if (drag.moved)
                    setZoom(Math.max(12, Math.min(240, drag.zoom * Math.exp(delta / 150))));
                }}
                onPointerUp={(event) => {
                  if (rulerDrag.current && !rulerDrag.current.moved) seekAt(event);
                  rulerDrag.current = null;
                }}
                onPointerCancel={() => {
                  rulerDrag.current = null;
                }}
                style={{ width: timelineWidth }}
              >
                {markers.map((bar) => (
                  <div key={bar} style={{ left: bar * barSeconds * zoom }}>
                    <b>{bar + 1}</b>
                    <span>{clock(bar * barSeconds)}</span>
                  </div>
                ))}
              </div>
            </div>
            {visible.map((track) => {
              const index = orderedTracks.indexOf(track);
              const clips = trackClips(track);
              const slotEnds: number[] = [];
              const slots = new Map<string, number>();
              [...clips]
                .sort((a, b) => a.offset - b.offset)
                .forEach((clip) => {
                  let slot = slotEnds.findIndex((end) => end <= clip.offset + 0.001);
                  if (slot < 0) slot = slotEnds.length;
                  slotEnds[slot] = clip.offset + clip.duration;
                  slots.set(clip.id, slot);
                });
              const color = ['#9ec7af', '#9bb9dc', '#c1afd7', '#d3bf8f', '#c99191'][index % 5];
              return (
                <div
                  className={`studio-track-row ${armed === track.id ? 'armed' : ''}`}
                  key={track.id}
                  ref={(row) => {
                    if (row) trackRows.current.set(track.id, row);
                    else trackRows.current.delete(track.id);
                  }}
                  style={
                    {
                      '--clip-color': color,
                      position: 'relative',
                      zIndex: liftedTrack?.id === track.id ? 7 : undefined,
                      pointerEvents: liftedTrack?.id === track.id ? 'none' : undefined,
                      boxShadow: liftedTrack?.id === track.id ? '0 6px 16px #0006' : undefined,
                      transform:
                        liftedTrack?.id === track.id
                          ? `translateY(${liftedTrack.delta + (movingTrack.current?.top ?? 0) - (rowPositions.current.get(track.id) ?? 0)}px)`
                          : undefined,
                    } as CSSProperties
                  }
                >
                  <div className="studio-track-head">
                    <div className="studio-track-title">
                      <button
                        type="button"
                        disabled={locked}
                        aria-label={`${track.name} 트랙 순서 변경`}
                        title="드래그 또는 위·아래 방향키로 순서 변경"
                        style={{
                          cursor: locked ? 'default' : 'grab',
                          padding: '2px 4px',
                          flexShrink: 0,
                          touchAction: 'none',
                        }}
                        onPointerDown={(event) => {
                          if (locked || event.button !== 0) return;
                          event.preventDefault();
                          const row = trackRows.current.get(track.id)!;
                          row.getAnimations().forEach((animation) => animation.cancel());
                          movingTrack.current = {
                            id: track.id,
                            ids: tracks.map((item) => item.id),
                            startY: event.clientY,
                            top: row.offsetTop,
                            scrollTop: viewport.current?.scrollTop ?? 0,
                          };
                          setLiftedTrack({ id: track.id, delta: 0 });
                          viewport.current?.setPointerCapture(event.pointerId);
                        }}
                        onKeyDown={(event) => {
                          if (locked || !['ArrowUp', 'ArrowDown'].includes(event.key)) return;
                          event.preventDefault();
                          const target = orderedTracks[index + (event.key === 'ArrowUp' ? -1 : 1)];
                          if (target) onReorder(reorderTrack(track.id, target.id));
                        }}
                      >
                        ⠿
                      </button>
                      <span>{String(index + 1).padStart(2, '0')}</span>
                      <input
                        aria-label={`${track.name} 트랙 이름`}
                        value={track.name}
                        maxLength={120}
                        disabled={locked}
                        onChange={(event) => onPatch(track.id, { name: event.target.value })}
                        onBlur={() => {
                          if (!track.name.trim())
                            onPatch(track.id, { name: trackPartLabel(track.part) });
                        }}
                      />
                      <button
                        aria-label={`${track.name} 트랙 삭제`}
                        title="트랙 삭제"
                        disabled={locked}
                        onClick={() => onRemove(track.id)}
                      >
                        <Icon name="trash" />
                      </button>
                    </div>
                    <select
                      aria-label={`${track.name} 세션`}
                      value={track.part ?? 'UNASSIGNED'}
                      disabled={t.recording || t.requesting}
                      onChange={(event) =>
                        onPatch(track.id, { part: event.target.value as TrackPart })
                      }
                    >
                      {trackParts.map((part) => (
                        <option key={part.value} value={part.value}>
                          {part.label}
                        </option>
                      ))}
                    </select>
                    <div className="studio-track-mix">
                      <button
                        className={armed === track.id ? 'record-active' : ''}
                        aria-label={`${track.name} 녹음 대상`}
                        aria-pressed={armed === track.id}
                        title="녹음 대상"
                        disabled={locked}
                        onClick={() => onArm(track.id)}
                      >
                        <Icon name="record" />
                      </button>
                      <button
                        className={track.muted ? 'active' : ''}
                        aria-label={`${track.name} 음소거`}
                        aria-pressed={track.muted}
                        title="음소거"
                        onClick={() => onPatch(track.id, { muted: !track.muted })}
                      >
                        M
                      </button>
                      <button
                        className={solo === track.id ? 'solo-active' : ''}
                        aria-label={`${track.name} 솔로`}
                        aria-pressed={solo === track.id}
                        title="솔로"
                        onClick={() => onSolo(track.id)}
                      >
                        S
                      </button>
                      <input
                        aria-label={`${track.name} 볼륨`}
                        title="트랙 볼륨"
                        type="range"
                        min="0"
                        max="1"
                        step="0.01"
                        value={track.volume}
                        onChange={(event) =>
                          onPatch(track.id, { volume: Number(event.target.value) })
                        }
                      />
                    </div>
                    <div className="studio-track-offset">
                      <span>{clips.length}개 클립</span>
                      <button
                        aria-label={`${track.name} 파일 추가`}
                        title="파일 추가"
                        disabled={locked}
                        onClick={() => openFile(track.id)}
                      >
                        <Icon name="upload" />
                        파일 추가
                      </button>
                      <button
                        disabled={locked}
                        onClick={() => onImportClip(track.id)}
                        title="클립 보관함에서 가져오기"
                      >
                        클립 가져오기
                      </button>
                    </div>
                  </div>
                  <div
                    className={`studio-lane ${drag?.targetId === track.id ? 'drop-target' : ''}`}
                    ref={(element) => {
                      if (element) lanes.current.set(track.id, element);
                      else lanes.current.delete(track.id);
                    }}
                    style={{
                      width: timelineWidth,
                      minHeight: Math.max(116, slotEnds.length * 100 + 16),
                    }}
                    onClick={seekAt}
                    onDragOver={(event) => {
                      if (loaded && !locked) event.preventDefault();
                    }}
                    onDrop={(event) => {
                      event.preventDefault();
                      if (loaded && !locked)
                        onUpload(Array.from(event.dataTransfer.files), track.id);
                    }}
                  >
                    {clips.map((clip) => (
                      <div
                        key={clip.id}
                        className={`studio-clip ${selectedId === clip.id ? 'selected' : ''} ${drag?.id === clip.id ? 'dragging' : ''} ${drag?.guide?.targetId === clip.id ? 'snap-target' : ''} ${track.muted || (solo && solo !== track.id) ? 'is-muted' : ''}`}
                        role="button"
                        tabIndex={0}
                        aria-label={`${clip.name} 오디오 클립`}
                        aria-pressed={selectedId === clip.id}
                        title="좌우로 위치 이동 · 위아래로 트랙 이동 · 커서를 놓고 자르기"
                        style={{
                          left: (drag?.id === clip.id ? drag.offset : clip.offset) * zoom,
                          top: 12 + (slots.get(clip.id) ?? 0) * 100,
                          width: Math.max(4, clip.duration * zoom),
                        }}
                        onFocus={() => setSelectedId(clip.id)}
                        onPointerDown={(event) => {
                          event.stopPropagation();
                          setSelectedId(clip.id);
                          if (locked || event.button !== 0) return;
                          event.currentTarget.setPointerCapture(event.pointerId);
                          setDrag({
                            id: clip.id,
                            x: event.clientX,
                            y: event.clientY,
                            scrollLeft: viewport.current?.scrollLeft ?? 0,
                            targetId: track.id,
                            original: clip.offset,
                            offset: clip.offset,
                          });
                        }}
                        onPointerMove={(event) => {
                          if (drag?.id === clip.id) {
                            const view = viewport.current;
                            if (view) {
                              const bounds = view.getBoundingClientRect();
                              if (event.clientY < bounds.top + 65) view.scrollTop -= 14;
                              if (event.clientY > bounds.bottom - 30) view.scrollTop += 14;
                              if (event.clientX > bounds.right - 35) view.scrollLeft += 14;
                              if (event.clientX < bounds.left + 235) view.scrollLeft -= 14;
                            }
                            const targetId =
                              dragTarget(event.clientX, event.clientY) ?? drag.targetId;
                            setDrag({
                              ...drag,
                              targetId,
                              ...dragPlacement(event.clientX, targetId, event.altKey),
                            });
                          }
                        }}
                        onPointerUp={(event) => {
                          if (drag?.id !== clip.id) return;
                          const targetId =
                            dragTarget(event.clientX, event.clientY) ?? drag.targetId;
                          if (Math.hypot(event.clientX - drag.x, event.clientY - drag.y) >= 3) {
                            if (targetId === '__new-track__')
                              onMoveToNewTrack(
                                clip.id,
                                dragPlacement(event.clientX, targetId, event.altKey).offset,
                              );
                            else if (targetId)
                              onMoveClip(
                                clip.id,
                                targetId,
                                dragPlacement(event.clientX, targetId, event.altKey).offset,
                              );
                          } else if (!locked)
                            seekPosition(
                              Math.max(
                                0,
                                clip.offset +
                                  (event.clientX -
                                    event.currentTarget.getBoundingClientRect().left) /
                                    zoom,
                              ),
                            );
                          setDrag(null);
                        }}
                        onPointerCancel={() => setDrag(null)}
                        onClick={(event) => event.stopPropagation()}
                        onKeyDown={(event) => {
                          if (locked) return;
                          if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
                            event.preventDefault();
                            onPatchClip(clip.id, {
                              offset: snapOffset(
                                clip.offset +
                                  (event.key === 'ArrowRight' ? 1 : -1) * (snap ? step : 0.01),
                                t.bpm,
                                t.signature,
                                snap,
                              ),
                            });
                          }
                          if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
                            event.preventDefault();
                            const destination =
                              visible[visible.indexOf(track) + (event.key === 'ArrowUp' ? -1 : 1)];
                            if (destination) onMoveClip(clip.id, destination.id, clip.offset);
                          }
                          if (
                            event.key.toLowerCase() === 's' &&
                            canSplit &&
                            selectedId === clip.id
                          ) {
                            event.preventDefault();
                            onSplitClip(clip.id, t.position);
                          }
                        }}
                      >
                        <div className="studio-clip-label">
                          <span>{clip.name}</span>
                          <small>
                            {clip.duration < 60
                              ? `${clip.duration.toFixed(2)}초`
                              : clock(clip.duration)}
                          </small>
                        </div>
                        <Waveform
                          blob={clip.blob}
                          sourceStart={clip.sourceStart}
                          duration={clip.duration}
                          onDuration={(duration) => {
                            if (!clip.trimmed && !(clip.duration > 0))
                              onClipDuration(clip.id, duration);
                          }}
                        />
                      </div>
                    ))}
                    {drag &&
                      drag.targetId === track.id &&
                      !clips.some((clip) => clip.id === drag.id) && (
                        <div
                          className="studio-drop-preview"
                          style={{
                            left: drag.offset * zoom,
                            width: Math.max(50, (selected?.duration ?? 1) * zoom),
                          }}
                        >
                          여기로 이동
                        </div>
                      )}
                    {!clips.length && (
                      <button
                        className="studio-empty-clip"
                        disabled={locked}
                        onClick={(event) => {
                          event.stopPropagation();
                          openFile(track.id);
                        }}
                      >
                        <Icon name="plus" />
                        음원 파일을 놓거나 추가하세요
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
            <div
              ref={addRow}
              className={`studio-add-track-row ${drag?.targetId === '__new-track__' ? 'drop-target' : ''}`}
              style={{ width: viewportWidth }}
            >
              <div className="studio-add-track-control">
                <button
                  type="button"
                  aria-label="트랙 추가"
                  title="트랙 추가"
                  disabled={!loaded || locked}
                  onClick={() => {
                    setFilter('ALL');
                    onAdd();
                  }}
                >
                  <Icon name="plus" />
                </button>
              </div>
              <div className="studio-add-track-message">
                {!visible.length
                  ? tracks.length
                    ? '이 세션의 트랙이 없어요'
                    : '트랙을 추가해 주세요'
                  : ''}
              </div>
            </div>
            {drag?.guide && (
              <div className="studio-snap-guide" style={{ left: 214 + drag.guide.time * zoom }}>
                <span role="status">
                  {drag.guide.edge === 'start' ? '클립 시작에 맞춤' : '클립 끝에 맞춤'}
                </span>
              </div>
            )}
            {t.loop && t.loopEnd > t.loopStart && (
              <div
                className="studio-loop-region"
                style={{ left: 214 + t.loopStart * zoom, width: (t.loopEnd - t.loopStart) * zoom }}
              />
            )}
            <div className="studio-playhead" style={{ left: 214 + t.position * zoom }}>
              <span />
            </div>
          </div>
        </div>
        <footer className="studio-footer">
          <div>
            <button disabled={!t.duration || t.recording} onClick={t.onLoopStart}>
              A {clock(t.loopStart)}
            </button>
            <button disabled={!t.duration || t.recording} onClick={t.onLoopEnd}>
              B {clock(t.loopEnd)}
            </button>
            <button
              className={t.loop ? 'active' : ''}
              aria-pressed={t.loop}
              disabled={t.loopEnd <= t.loopStart || t.recording}
              onClick={t.onLoop}
            >
              구간 반복
            </button>
          </div>
        </footer>
        <input
          className="studio-accessible-seek"
          aria-label="재생 위치"
          type="range"
          min="0"
          max={t.duration || 1}
          step="0.01"
          value={Math.min(t.position, t.duration)}
          disabled={!t.duration || t.recording || t.requesting}
          onChange={(event) => seekPosition(Number(event.target.value))}
        />
      </div>
      {!!error && (
        <p className="studio-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
  return expanded ? createPortal(editor, document.body) : editor;
}
