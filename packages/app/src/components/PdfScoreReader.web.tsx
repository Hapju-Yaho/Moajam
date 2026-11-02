import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ScorePdfImport } from './ScorePdfImport.web';
import { songAudioBlob, type SongAudio } from '../lib/songAudio';
import type { PdfStructure } from './ScorePdfStructureReview.web';
import { api } from '../lib/remote-client';
import { nearestPdfPartPosition } from '../lib/pdf-part-position';
import { pdfMeasureProgress } from '../lib/pdf-measure-progress';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import './PerformanceReader.web.css';

export function PdfScoreReader({
  url,
  name,
  onClose,
  embedded = false,
  songAudio = null,
}: {
  url: string;
  name: string;
  onClose: () => void;
  embedded?: boolean;
  songAudio?: SongAudio | null;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const activeRegion = useRef<SVGRectElement>(null);
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [zoom, setZoom] = useState(100);
  const [width, setWidth] = useState(600);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState(false);
  const [following, setFollowing] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [bpm, setBpm] = useState(120);
  const [countEnabled, setCountEnabled] = useState(true);
  const [countBeats, setCountBeats] = useState(4);
  const [position, setPosition] = useState(0);
  const [countdown, setCountdown] = useState(0);
  const [showBeats, setShowBeats] = useState(true);
  const [listenAlong, setListenAlong] = useState(false);
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [audioStart, setAudioStart] = useState(0);
  const [audioUrl, setAudioUrl] = useState('');
  const [loadingSongAudio, setLoadingSongAudio] = useState(false);
  const linkedAudio = useRef<HTMLAudioElement>(null);
  const audioConfig = useRef({ enabled: listenAlong, start: audioStart });
  audioConfig.current = { enabled: listenAlong, start: audioStart };
  useEffect(() => {
    if (!audioFile) { setAudioUrl(''); return; }
    const objectUrl = URL.createObjectURL(audioFile);
    setAudioUrl(objectUrl);
    return () => { linkedAudio.current?.pause(); URL.revokeObjectURL(objectUrl); };
  }, [audioFile]);
  const [seekRevision, setSeekRevision] = useState(0);
  const skipCountIn = useRef(false);
  const [analysisFile, setAnalysisFile] = useState<File | null>(null);
  const [forceStructureAnalysis, setForceStructureAnalysis] = useState(false);
  const [preparingAnalysis, setPreparingAnalysis] = useState(false);
  const [savedChoices, setSavedChoices] = useState<{ name: string; structure: PdfStructure }[] | null>(null);
  const [selectedPart, setSelectedPart] = useState<PdfStructure['parts'][number] | null>(null);
  const [layoutRevision, setLayoutRevision] = useState(0);
  useEffect(() => {
    let active = true;
    setPlaying(false);
    setAudioFile(null);
    setAudioStart(songAudio?.start ?? 0);
    if (!songAudio) { setLoadingSongAudio(false); return; }
    setLoadingSongAudio(true);
    void songAudioBlob(songAudio).then((blob) => {
      if (active) setAudioFile(new File([blob], songAudio.name, { type: blob.type }));
    }).catch((e) => {
      if (active) setError(e instanceof Error ? e.message : '곡 음원을 불러오지 못했어요.');
    }).finally(() => { if (active) setLoadingSongAudio(false); });
    return () => { active = false; };
  }, [songAudio?.id, songAudio?.start]);
  const lookupSaved = async () => {
    if (!pdf || preparingAnalysis) return;
    setPreparingAnalysis(true);
    try {
      const data = new FormData();
      data.append('file', new File([new Uint8Array(await pdf.getData())], name, { type: 'application/pdf' }));
      const saved = await api<{ name: string; structure: PdfStructure }[]>('/score-pdf/jobs/saved/lookup', 'POST', data);
      setSavedChoices(saved);
      const first = saved[0]?.structure.parts[0] ?? null;
      setSelectedPart(first);
      setBpm(saved[0]?.structure.bpm ?? 120);
      setPosition(0);
    } catch (e) {
      setError(e instanceof Error ? e.message : '저장된 마디 정보를 불러오지 못했어요.');
    } finally { setPreparingAnalysis(false); }
  };
  const parts = (savedChoices ?? []).flatMap((choice) => choice.structure.parts.map((part) => ({ part, bpm: choice.structure.bpm ?? 120 })));
  let totalBeats = 0;
  const timeline = (selectedPart?.measures ?? []).map((measure) => {
    const start = totalBeats;
    const length = (measure.meter[0] * 4 / measure.meter[1]) * (measure.restCount ?? 1);
    totalBeats += length;
    return { measure, start, end: totalBeats };
  });
  const activeEntry = timeline.find((entry) => position >= entry.start && position < entry.end) ?? timeline.at(-1);
  const activeMeasure = activeEntry?.measure;
  const measureProgress = activeEntry ? pdfMeasureProgress(position, activeEntry.start,
    activeEntry.measure.meter, activeEntry.measure.restCount ?? 1) : null;
  const nextMeasure = activeEntry && measureProgress?.previewNext
    ? timeline[timeline.indexOf(activeEntry) + 1]?.measure : undefined;
  const seekMeasure = (measure: PdfStructure['parts'][number]['measures'][number]) => {
    const entry = timeline.find((entry) => entry.measure === measure);
    if (!entry) return;
    skipCountIn.current = playing;
    setPosition(entry.start);
    setCountdown(0);
    setSeekRevision((revision) => revision + 1);
  };
  const openAnalysis = async () => {
    if (!pdf || preparingAnalysis) return;
    setPlaying(false);
    setPreparingAnalysis(true);
    try {
      setAnalysisFile(new File([new Uint8Array(await pdf.getData())], /\.pdf$/i.test(name) ? name : `${name}.pdf`, { type: 'application/pdf' }));
      setForceStructureAnalysis(true);
    } catch { setError('분석할 PDF를 준비하지 못했어요.'); }
    finally { setPreparingAnalysis(false); }
  };
  useEffect(() => {
    if (!playing) { setCountdown(0); return; }
    const initial = position;
    const lead = countEnabled && !skipCountIn.current ? countBeats : 0;
    skipCountIn.current = false;
    const start = performance.now();
    let frame = 0;
    let audioStarted = false;
    const tick = () => {
      const elapsed = (performance.now() - start) * bpm / 60000;
      setCountdown(Math.max(0, Math.ceil(lead - elapsed)));
      if (elapsed >= lead) {
        const next = Math.min(totalBeats, initial + elapsed - lead);
        const audio = linkedAudio.current;
        if (!audioConfig.current.enabled) { audio?.pause(); audioStarted = false; }
        else if (audio?.getAttribute('src') && !audioStarted) {
          audioStarted = true;
          audio.currentTime = audioConfig.current.start + next * 60 / bpm;
          void audio.play().catch(() => setError('음원을 재생하지 못했어요. 곡 정보 수정에서 등록된 음원을 확인해주세요.'));
        }
        setPosition(next);
        if (next >= totalBeats) { setPlaying(false); return; }
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(frame); linkedAudio.current?.pause(); };
  }, [playing, bpm, countEnabled, countBeats, totalBeats, seekRevision]);
  useEffect(() => {
    if (!following || !activeMeasure) return;
    const frame = requestAnimationFrame(() => activeRegion.current?.scrollIntoView({
      block: 'center', inline: 'nearest', behavior: 'smooth',
    }));
    return () => cancelAnimationFrame(frame);
  }, [following, selectedPart, activeMeasure?.number, activeMeasure?.page, width, zoom, expanded, layoutRevision]);
  const inline = embedded && !expanded;
  useEffect(() => {
    if (!inline) dialog.current?.showModal();
    const previous = document.body.style.overflow;
    if (!inline) document.body.style.overflow = 'hidden';
    const observer = new ResizeObserver(([entry]) =>
      setWidth(Math.max(100, entry.contentRect.width - 32)),
    );
    if (stage.current) observer.observe(stage.current);
    return () => {
      observer.disconnect();
      if (!inline) document.body.style.overflow = previous;
    };
  }, [inline]);
  useEffect(() => {
    let active = true;
    let destroy: (() => void) | undefined;
    setError('');
    setPdf(null);
    setFollowing(false);
    setPlaying(false);
    setSelectedPart(null);
    setSavedChoices(null);
    void import('pdfjs-dist')
      .then(async (engine) => {
        engine.GlobalWorkerOptions.workerSrc = new URL(
          'pdfjs-dist/build/pdf.worker.min.mjs',
          import.meta.url,
        ).toString();
        if (!active) return;
        const task = engine.getDocument({ url });
        destroy = () => {
          void task.destroy();
        };
        const document = await task.promise;
        if (active) setPdf(document);
      })
      .catch(() => {
        if (active)
          setError('PDF를 읽지 못했어요. 암호가 없는 PDF인지 확인하거나 새 창에서 열어주세요.');
      });
    return () => {
      active = false;
      destroy?.();
    };
  }, [url]);
  const reader = (
    <dialog
      ref={dialog}
      open={inline || undefined}
      tabIndex={inline ? 0 : undefined}
      className={
        'performance-reader' +
        (following ? ' pdf-following' : '') +
        (inline ? ' performance-reader-embedded performance-pdf-embedded' : '')
      }
      aria-label={name + ' PDF 뷰어'}
      onKeyDownCapture={(e) => {
        if (e.code !== 'Space' || !following || analysisFile) return;
        const target = e.target as HTMLElement;
        if (target.closest('textarea,select,input:not([type="checkbox"]),[contenteditable="true"]')) return;
        e.preventDefault();
        e.stopPropagation();
        if (e.repeat || !selectedPart || preparingAnalysis) return;
        if (!playing && position >= totalBeats) setPosition(0);
        setPlaying((value) => !value);
      }}
      onCancel={(e) => {
        e.stopPropagation();
        if (e.target !== e.currentTarget) return;
        e.preventDefault();
        if (embedded && expanded) setExpanded(false);
        else onClose();
      }}

    >
      <div className="performance-reader-content">
        <div className="performance-pdf-navigation">
        <header>
          <div className="performance-pdf-title">
            <h2>{name}</h2>
            <button onClick={onClose}>악보 목록</button>
          </div>
          <div className="performance-reader-settings">
            <button
              type="button"
              disabled={!pdf || preparingAnalysis}
              title="마디 분석 후 박자에 맞춰 연습해요"
              aria-pressed={following}
              onClick={() => { setFollowing(!following); setPlaying(false); if (!following) void lookupSaved(); }}
            >
              박자 따라가기
            </button>
            <div className="performance-pdf-zoom" role="group" aria-label="PDF 배율 조정">
              <button
                type="button"
                aria-label="PDF 축소"
                disabled={zoom <= 30}
                onClick={() => setZoom((value) => Math.max(30, value - 10))}
              >
                −
              </button>
              <span aria-live="polite">{zoom}%</span>
              <button
                type="button"
                aria-label="PDF 확대"
                disabled={zoom >= 200}
                onClick={() => setZoom((value) => Math.min(200, value + 10))}
              >
                +
              </button>
            </div>
            <a href={url} target="_blank" rel="noopener noreferrer">
              새 창에서 열기
            </a>
            {embedded ? (
              <button onClick={() => setExpanded((value) => !value)}>
                {expanded ? '작게 보기' : '전체화면'}
              </button>
            ) : (
              <button onClick={onClose}>닫기</button>
            )}
          </div>
        </header>
        {following && <div className="pdf-follow-toolbar" aria-label="박자 따라가기 도구">
          {preparingAnalysis ? <span>마디 정보를 불러오는 중…</span> : parts.length ? <>
            <div className="pdf-follow-source">
            <select aria-label="따라갈 파트" value={parts.findIndex((entry) => entry.part === selectedPart)} onChange={(e) => {
              const entry = parts[Number(e.target.value)];
              setPlaying(false);
              setPosition(nearestPdfPartPosition(activeMeasure, entry.part.measures));
              setSelectedPart(entry.part);
              setBpm(entry.bpm);
            }}>{parts.map((entry, i) => <option key={i} value={i}>{entry.part.name}</option>)}</select>
            <label>BPM <input type="number" min={20} max={300} value={bpm} onChange={(e) => { setPlaying(false); setBpm(Math.max(20, Math.min(300, Number(e.target.value) || 120))); }} /></label>
            <label><input type="checkbox" checked={showBeats} onChange={(e) => setShowBeats(e.target.checked)} /> 악보에 박자 표시하기</label>
            <label><input type="checkbox" checked={countEnabled} onChange={(e) => { setPlaying(false); setCountEnabled(e.target.checked); }} /> 카운트다운</label>
            <input aria-label="카운트다운 박 수" type="number" min={1} max={32} disabled={!countEnabled} value={countBeats} onChange={(e) => { setPlaying(false); setCountBeats(Math.max(1, Math.min(32, Number(e.target.value) || 4))); }} />
            </div>
            <div className="pdf-follow-transport">
              <button title="처음으로" aria-label="처음으로" onClick={() => { setPlaying(false); setPosition(0); }}>│◀</button>
              <button title={playing ? '일시정지' : '재생'} aria-label={playing ? '일시정지' : '재생'} onClick={() => {
                if (!playing && position >= totalBeats) setPosition(0); setPlaying(!playing);
              }}>{playing ? 'Ⅱ' : '▶'}</button>
              <button title="끝으로" aria-label="끝으로" onClick={() => { setPlaying(false); setPosition(totalBeats); }}>▶│</button>
            </div>
            <div className="pdf-follow-settings">
            <label className="pdf-listen-along">
              <button type="button" role="switch" aria-checked={listenAlong} aria-label="음원 같이 듣기" className="pdf-listen-switch" onClick={() => setListenAlong((value) => !value)}><span /></button>
              음원 같이 듣기
            </label>
            <span className="pdf-follow-audio-name" title={songAudio?.name}>
              {loadingSongAudio ? '음원 불러오는 중…' : songAudio?.name ?? '등록된 음원 없음'}
            </span>
            <button className="pdf-follow-analyze" disabled={preparingAnalysis || !pdf} onClick={() => void openAnalysis()}>마디 다시 분석하기</button>
            </div>
          </> : <span>마디를 분석한 기록이 없습니다.</span>}
          {!parts.length && <button className="pdf-follow-analyze" disabled={preparingAnalysis || !pdf} onClick={() => void openAnalysis()}>마디 분석하기</button>}
        </div>}
        {following && selectedPart && <div className="pdf-follow-progress">
          <input type="range" aria-label="PDF 악보 재생 위치" min={0} max={totalBeats || 1} step={0.01}
            value={position} disabled={!totalBeats} onChange={(e) => {
              skipCountIn.current = playing;
              setPosition(Number(e.target.value));
              setCountdown(0);
              setSeekRevision((revision) => revision + 1);
            }} />
          <div><span>{Math.floor(position * 60 / bpm / 60)}:{String(Math.floor(position * 60 / bpm) % 60).padStart(2, '0')}</span>
            <span>{Math.floor(totalBeats * 60 / bpm / 60)}:{String(Math.floor(totalBeats * 60 / bpm) % 60).padStart(2, '0')}</span></div>
        </div>}
        </div>
        {error && (
          <p role="alert" className="performance-reader-error">
            {error}
          </p>
        )}
        <div className="pdf-follow-stage-wrap" style={inline ? { flex: 'none', height: `clamp(420px, ${width * Math.SQRT2}px, 85dvh)` } : undefined}>
        <div className="performance-reader-stage" ref={stage}>
          {!pdf && !error && <p>PDF를 불러오는 중…</p>}
          {pdf && Array.from({ length: pdf.numPages }, (_, i) => i + 1).map((page) => (
          <PdfContinuousPage key={`${url}:${page}`} pdf={pdf} page={page} width={width} zoom={zoom} inline={inline}
            onLayout={() => setLayoutRevision((value) => value + 1)}>
            {following && selectedPart && <svg
              viewBox="0 0 1000 1000" preserveAspectRatio="none"
              aria-label={`${selectedPart.name} ${page}페이지`}
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
              {selectedPart.measures.filter((m) => m.page === page).map((m) => <g key={m.number}>
                <rect x={m.bounds[0]} y={m.bounds[1]} width={m.bounds[2] - m.bounds[0]} height={m.bounds[3] - m.bounds[1]}
                  ref={activeMeasure === m ? activeRegion : undefined}
                  role="button" tabIndex={0} aria-label={`${m.number}마디 첫 박으로 이동`}
                  style={{ pointerEvents: 'all', cursor: 'pointer' }}
                  onClick={() => seekMeasure(m)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); seekMeasure(m); }
                  }}
                  fill={activeMeasure === m ? 'rgba(247,185,52,.22)' : 'transparent'} stroke={activeMeasure === m ? '#d29a26' : 'transparent'} strokeWidth="1.5" />
                {showBeats && (activeMeasure === m || nextMeasure === m) && Array.from({ length: m.meter[0] }, (_, beat) => <circle key={beat}
                  cx={m.bounds[0] + (m.bounds[2] - m.bounds[0]) * (beat + 0.5) / m.meter[0]}
                  cy={Math.max(8, m.bounds[1] - 10)} r={beat === 0 ? 5 : 4}
                  fill={activeMeasure === m && Math.floor((position - (activeEntry?.start ?? 0)) / (4 / m.meter[1])) % m.meter[0] === beat ? '#42ae65' : nextMeasure === m ? '#c7cbce' : '#bcc8bf'} />)}
                {activeMeasure === m && (m.restCount ?? 1) > 1 && <text
                  x={(m.bounds[0] + m.bounds[2]) / 2 + 18}
                  y={m.bounds[1] + (m.bounds[3] - m.bounds[1]) * 0.28}
                  fill="#737b79" fontSize={13}>
                  {measureProgress?.ordinal} / {m.restCount}마디 진행 중
                </text>}
                {activeMeasure === m && countdown > 0 && <g role="status" aria-label={`재생 시작까지 ${countdown}박`}>
                  <rect x={(m.bounds[0] + m.bounds[2]) / 2 - 28} y={Math.max(0, m.bounds[1] - 60)} width={56} height={54} rx={12} fill="rgba(43,71,51,.94)" />
                  <text x={(m.bounds[0] + m.bounds[2]) / 2} y={Math.max(0, m.bounds[1] - 60) + 39} textAnchor="middle" fill="white" fontSize={42} fontWeight="bold">{countdown}</text>
                </g>}
                <text x={m.bounds[0] + 3} y={m.bounds[1] + 15} fill="#226aa8" fontSize="13">{m.number}</text>
              </g>)}
            </svg>}
          </PdfContinuousPage>
          ))}
        </div>
        </div>

      </div>
      {analysisFile && (
        <ScorePdfImport
          open
          mode="measures"
          initialFile={analysisFile}
          forceStructureAnalysis={forceStructureAnalysis}
          onClose={() => { setAnalysisFile(null); setForceStructureAnalysis(false); if (following) void lookupSaved(); }}
        />
      )}
      <audio ref={linkedAudio} src={audioUrl || undefined} preload="metadata" />
    </dialog>
  );
  return embedded && expanded ? createPortal(reader, document.body) : reader;
}

function PdfContinuousPage({ pdf, page, width, zoom, inline, children, onLayout }: {
  pdf: PDFDocumentProxy;
  page: number;
  width: number;
  zoom: number;
  inline: boolean;
  children: ReactNode;
  onLayout: () => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const reportLayout = useRef(onLayout);
  reportLayout.current = onLayout;
  const [size, setSize] = useState({ width: width * zoom / 100, height: width * zoom / 100 * Math.SQRT2 });
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { rootMargin: '800px' });
    if (host.current) observer.observe(host.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    let active = true;
    void pdf.getPage(page).then((sheet) => {
      const original = sheet.getViewport({ scale: 1 });
      const scale = Math.min(width / original.width, 2) * zoom * (inline ? 1 : 0.9) / 100;
      const viewport = sheet.getViewport({ scale });
      if (active) {
        setSize({ width: viewport.width, height: viewport.height });
        reportLayout.current();
      }
    }).catch(() => { if (active) setError('페이지를 불러오지 못했어요.'); });
    return () => { active = false; };
  }, [pdf, page, width, zoom, inline]);
  useEffect(() => {
    if (!visible) return;
    let active = true;
    let cancel: (() => void) | undefined;
    const target = canvas.current;
    setError('');
    void pdf.getPage(page).then(async (sheet) => {
      if (!active || !target) return;
      const original = sheet.getViewport({ scale: 1 });
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      const scale = Math.min(width / original.width, 2) * zoom * (inline ? 1 : 0.9) / 100;
      const viewport = sheet.getViewport({ scale: scale * ratio });
      target.width = viewport.width;
      target.height = viewport.height;
      const task = sheet.render({ canvas: target, viewport });
      cancel = () => task.cancel();
      await task.promise;
    }).catch(() => { if (active) setError('이 페이지를 표시하지 못했어요.'); });
    return () => {
      active = false;
      cancel?.();
      if (target) { target.width = 0; target.height = 0; }
    };
  }, [pdf, page, visible, width, zoom, inline]);
  return <div ref={host} className="pdf-continuous-page" style={{ width: size.width, height: size.height }} aria-label={`${page}페이지`}>
    <canvas ref={canvas} style={{ width: '100%', height: '100%' }} />
    {error && <p role="alert" className="pdf-continuous-page-error">{error}</p>}
    {children}
  </div>;
}
