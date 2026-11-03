import { BpmInput } from './BpmInput.web';
import { ScoreTransportIcon } from './ScoreTransportIcon.web';
import { scheduleClick } from '../lib/metronome.web';
import { useEffect, useMemo, useRef, useState, type ReactNode, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { ScorePdfImport } from './ScorePdfImport.web';
import { PdfMeasureHighlightSettings, defaultPdfMeasureHighlight } from './PdfMeasureHighlightSettings.web';
import { songAudioBlob, type SongAudio } from '../lib/songAudio';
import type { PdfStructure } from './ScorePdfStructureReview.web';
import { api } from '../lib/remote-client';
import { serverConfigured } from '../lib/remote';
import { readPersonal, writePersonal } from '../lib/personal-store';
import { useIdentity } from '../state/Identity';
import { nearestPdfPartPosition } from '../lib/pdf-part-position';
import { pdfMeasureProgress } from '../lib/pdf-measure-progress';
import { pdfPlaybackTimeline, pdfTimelinePosition, pdfMeasureBeat } from '../lib/pdf-playback-timeline';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import './PerformanceReader.web.css';

export function PdfScoreReader({
  url,
  name,
  onClose,
  embedded = false,
  songAudio = null,
  songKey,
}: {
  url: string;
  name: string;
  onClose: () => void;
  embedded?: boolean;
  songAudio?: SongAudio | null;
  songKey: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const embeddedAnchor = useRef<HTMLDivElement>(null);
  const wasExpanded = useRef(false);
  const user = useIdentity();
  const activeUser = useRef(user);
  activeUser.current = user;
  const stage = useRef<HTMLDivElement>(null);
  const activeRegion = useRef<SVGRectElement>(null);
  const lastFocusedMeasure = useRef<{ part: string; number: number; nextNumber?: number } | null>(null);
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [externalPdfUrl, setExternalPdfUrl] = useState('');
  const [zoom, setZoom] = useState(100);
  const [zoomReady, setZoomReady] = useState(false);
  const zoomRef = useRef(100);
  useEffect(() => {
    let active = true;
    setZoomReady(false);
    setZoom(100); zoomRef.current = 100;
    const load = async () => {
      const saved = serverConfigured
        ? await readPersonal<{ zoom?: number }>('practice/pdf-view-settings', user)
        : JSON.parse(localStorage.getItem(`moajam/pdf-view/${user}`) ?? 'null');
      if (!active) return;
      const value = typeof saved?.zoom === 'number' && Number.isFinite(saved.zoom)
        ? Math.max(30, Math.min(200, Math.round(saved.zoom / 10) * 10)) : 100;
      zoomRef.current = value; setZoom(value); setZoomReady(true);
    };
    void load().catch(() => {
      if (active) setError('PDF 배율 설정을 불러오지 못했어요. PDF를 다시 열어주세요.');
    });
    return () => { active = false; };
  }, [user]);
  const changeZoom = (delta: number) => {
    if (!zoomReady) return;
    const owner = user;
    const value = Math.max(30, Math.min(200, zoomRef.current + delta));
    zoomRef.current = value; setZoom(value);
    const save = async () => {
      if (serverConfigured) await writePersonal('practice/pdf-view-settings', { zoom: value }, owner);
      else localStorage.setItem(`moajam/pdf-view/${owner}`, JSON.stringify({ zoom: value }));
    };
    void save().catch(() => {
      if (activeUser.current === owner) setError('PDF 배율을 저장하지 못했어요. PDF를 다시 열고 설정해주세요.');
    });
  };
  const [width, setWidth] = useState(600);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState(false);
  useEffect(() => {
    const returning = embedded && wasExpanded.current && !expanded;
    wasExpanded.current = expanded;
    if (!returning) return;
    const frame = requestAnimationFrame(() => embeddedAnchor.current?.scrollIntoView({ block: 'start', behavior: 'instant' }));
    return () => cancelAnimationFrame(frame);
  }, [embedded, expanded]);
  const following = true;
  const [playing, setPlaying] = useState(false);
  const [bpm, setBpm] = useState(120);
  const [bpmReady, setBpmReady] = useState(false);
  const bpmPreference = useRef<{ key: string; value: number | null }>({ key: '', value: null });
  useEffect(() => {
    let active = true;
    setBpmReady(false);
    const key = pdf ? `practice/pdf-song-tempo/${songKey}` : '';
    bpmPreference.current = { key, value: null };
    if (!key) return;
    const load = async () => {
      let saved = serverConfigured ? await readPersonal<{ bpm?: number }>(key, user)
        : JSON.parse(localStorage.getItem(`moajam/${user}/${key}`) ?? 'null');
      if (!saved && pdf?.fingerprints[0]) {
        const oldKey = `practice/pdf-tempo/${pdf.fingerprints[0]}`;
        saved = serverConfigured ? await readPersonal<{ bpm?: number }>(oldKey, user)
          : JSON.parse(localStorage.getItem(`moajam/${user}/${oldKey}`) ?? 'null');
        if (!active) return;
        if (typeof saved?.bpm === 'number' && Number.isFinite(saved.bpm)) {
          const migrated = { bpm: Math.max(20, Math.min(300, saved.bpm)) };
          if (serverConfigured) await writePersonal(key, migrated, user);
          else localStorage.setItem(`moajam/${user}/${key}`, JSON.stringify(migrated));
        }
      }
      if (!active) return;
      if (typeof saved?.bpm === 'number' && Number.isFinite(saved.bpm)) {
        const value = Math.max(20, Math.min(300, saved.bpm));
        bpmPreference.current = { key, value };
        setBpm(value);
      }
      setBpmReady(true);
    };
    void load().catch(() => { if (active) setError('PDF BPM 설정을 불러오지 못했어요. PDF를 다시 열어주세요.'); });
    return () => { active = false; };
  }, [pdf, user, name, songKey]);
  const changeBpm = (value: number) => {
    const key = bpmPreference.current.key;
    if (!bpmReady || !key) return;
    setPlaying(false);
    setBpm(value);
    bpmPreference.current = { key, value };
    const owner = user;
    const save = async () => {
      if (serverConfigured) await writePersonal(key, { bpm: value }, owner);
      else localStorage.setItem(`moajam/${owner}/${key}`, JSON.stringify({ bpm: value }));
    };
    void save().catch(() => { if (activeUser.current === owner && bpmPreference.current.key === key) setError('PDF BPM을 저장하지 못했어요. PDF를 다시 열고 설정해주세요.'); });
  };
  const [countEnabled, setCountEnabled] = useState(true);
  const [countBeats, setCountBeats] = useState(4);
  const [loopEnabled, setLoopEnabled] = useState(false);
  const [loopFrom, setLoopFrom] = useState('');
  const [loopTo, setLoopTo] = useState('');
  const loopStorageKey = `moajam/pdf-loop/${user}/${songKey}`;
  const [loopReadyKey, setLoopReadyKey] = useState('');
  useEffect(() => {
    let enabled = false;
    let from = '';
    let to = '';
    try {
      const saved = JSON.parse(localStorage.getItem(loopStorageKey) ?? 'null');
      if (typeof saved?.enabled === 'boolean') enabled = saved.enabled;
      if (Number.isInteger(saved?.from) && saved.from > 0) from = String(saved.from);
      if (Number.isInteger(saved?.to) && saved.to > 0) to = String(saved.to);
    } catch { /* Use defaults when device storage is unavailable. */ }
    setLoopEnabled(enabled);
    setLoopFrom(from);
    setLoopTo(to);
    setLoopReadyKey(loopStorageKey);
  }, [loopStorageKey]);
  useEffect(() => {
    if (loopReadyKey !== loopStorageKey || !loopFrom || !loopTo) return;
    const from = Number(loopFrom);
    const to = Number(loopTo);
    if (!Number.isInteger(from) || !Number.isInteger(to) || from < 1 || to < from) return;
    try { localStorage.setItem(loopStorageKey, JSON.stringify({ enabled: loopEnabled, from, to })); } catch { /* Optional device preferences. */ }
  }, [loopReadyKey, loopStorageKey, loopEnabled, loopFrom, loopTo]);
  const [position, setPosition] = useState(0);
  const [clickedMeasure, setClickedMeasure] = useState<number | null>(null);
  useEffect(() => {
    const clearMeasureNotice = (event: MouseEvent) => {
      if (event.target instanceof Element && event.target.closest('[data-pdf-measure-hit]')) return;
      setClickedMeasure(null);
    };
    document.addEventListener('click', clearMeasureNotice, true);
    return () => document.removeEventListener('click', clearMeasureNotice, true);
  }, []);
  const [countdown, setCountdown] = useState(0);
  const [showBeats, setShowBeats] = useState(true);
  const [highlightSettingsOpen, setHighlightSettingsOpen] = useState(false);
  const [highlightState, setHighlight] = useState(defaultPdfMeasureHighlight);
  const highlight = { ...defaultPdfMeasureHighlight, ...highlightState };
  const [highlightReady, setHighlightReady] = useState(false);
  const [highlightSaving, setHighlightSaving] = useState(false);
  const [highlightError, setHighlightError] = useState('');
  useEffect(() => {
    let active = true;
    setHighlightReady(false);
    setHighlightSaving(false);
    setHighlightSettingsOpen(false);
    setHighlight(defaultPdfMeasureHighlight);
    setHighlightError('');
    const load = async () => {
      const saved = serverConfigured
        ? await readPersonal<Partial<typeof defaultPdfMeasureHighlight>>('practice/pdf-highlight-settings', user)
        : JSON.parse(localStorage.getItem(`moajam/pdf-highlight/${user}`) ?? 'null');
      if (active && saved && typeof saved === 'object') setHighlight({ ...defaultPdfMeasureHighlight, ...saved });
    };
    void load().then(() => { if (active) setHighlightReady(true); }).catch(() => {
      if (active) setError('강조 설정을 불러오지 못했어요. PDF를 다시 열어주세요.');
    });
    return () => { active = false; };
  }, [user]);
  const saveHighlight = async (value: typeof defaultPdfMeasureHighlight) => {
    if (!highlightReady || highlightSaving) return;
    const owner = user;
    setHighlightSaving(true); setHighlightError('');
    try {
      if (serverConfigured) await writePersonal('practice/pdf-highlight-settings', value, owner);
      else localStorage.setItem(`moajam/pdf-highlight/${owner}`, JSON.stringify(value));
      if (activeUser.current !== owner) return;
      setHighlight(value); setHighlightSettingsOpen(false);
    } catch (e) {
      if (activeUser.current === owner) setHighlightError(e instanceof Error ? e.message : '강조 설정을 저장하지 못했어요.');
    } finally { if (activeUser.current === owner) setHighlightSaving(false); }
  };
  const [listenAlong, setListenAlong] = useState(false);
  const [metronome, setMetronome] = useState(false);
  const [metronomeVolume, setMetronomeVolume] = useState(0.5);
  const metronomeContext = useRef<AudioContext | null>(null);
  useEffect(() => {
    let enabled = false;
    let volume = 0.5;
    try {
      const saved = JSON.parse(localStorage.getItem(`moajam/pdf-metronome/${user}`) ?? 'null');
      if (typeof saved?.enabled === 'boolean') enabled = saved.enabled;
      if (typeof saved?.volume === 'number' && Number.isFinite(saved.volume)) volume = Math.max(0, Math.min(1, saved.volume));
    } catch { /* Keep defaults when storage is unavailable. */ }
    setMetronome(enabled);
    setMetronomeVolume(volume);
  }, [user]);
  const saveMetronome = (enabled: boolean, volume: number) => {
    try { localStorage.setItem(`moajam/pdf-metronome/${user}`, JSON.stringify({ enabled, volume })); } catch { /* Optional device preferences. */ }
  };
  const resumeMetronome = () => {
    if (!metronomeConfig.current.enabled) return;
    try {
      metronomeContext.current ??= new AudioContext();
      void metronomeContext.current.resume().catch(() => {});
    } catch { setError('메트로놈을 재생하지 못했어요.'); }
  };
  const metronomeConfig = useRef({ enabled: false, volume: 0.5 });
  metronomeConfig.current = { enabled: metronome, volume: metronomeVolume };
  useEffect(() => () => { void metronomeContext.current?.close(); }, []);
  const toggleMetronome = async () => {
    if (metronome) { setMetronome(false); saveMetronome(false, metronomeVolume); return; }
    try {
      metronomeContext.current ??= new AudioContext();
      await metronomeContext.current.resume();
      setMetronome(true);
      saveMetronome(true, metronomeVolume);
    } catch { setError('메트로놈을 재생하지 못했어요.'); }
  };
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [audioStart, setAudioStart] = useState(0);
  const [audioUrl, setAudioUrl] = useState('');
  const [audioVolume, setAudioVolume] = useState(1);
  useEffect(() => {
    let enabled = false;
    let volume = 1;
    try {
      const saved = JSON.parse(localStorage.getItem(`moajam/pdf-audio/${user}`) ?? 'null');
      if (typeof saved?.listenAlong === 'boolean') enabled = saved.listenAlong;
      if (typeof saved?.volume === 'number' && Number.isFinite(saved.volume)) volume = Math.max(0, Math.min(1, saved.volume));
    } catch { /* Use defaults when browser storage is unavailable or invalid. */ }
    setListenAlong(enabled);
    setAudioVolume(volume);
  }, [user]);
  const saveAudioPreferences = (enabled: boolean, volume: number) => {
    try {
      localStorage.setItem(`moajam/pdf-audio/${user}`, JSON.stringify({ listenAlong: enabled, volume }));
    } catch { /* Playback remains available when browser storage is unavailable. */ }
  };
  const [loadingSongAudio, setLoadingSongAudio] = useState(false);
  const linkedAudio = useRef<HTMLAudioElement>(null);
  useEffect(() => {
    if (linkedAudio.current) linkedAudio.current.volume = audioVolume;
  }, [audioVolume, audioUrl]);
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
  const [analysisScoreType, setAnalysisScoreType] = useState('guitar-tab');
  const [preparingAnalysis, setPreparingAnalysis] = useState(false);
  const [savedChoices, setSavedChoices] = useState<{ name: string; scoreType?: string; structure: PdfStructure }[] | null>(null);
  const [selectedPart, setSelectedPart] = useState<PdfStructure['parts'][number] | null>(null);
  useEffect(() => setClickedMeasure(null), [url, selectedPart?.id]);
  const [layoutRevision, setLayoutRevision] = useState(0);
  useEffect(() => {
    let active = true;
    let objectUrl = '';
    setExternalPdfUrl('');
    if (pdf) void pdf.getData().then((bytes) => {
      if (!active) return;
      objectUrl = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: 'application/pdf' }));
      setExternalPdfUrl(objectUrl);
    }).catch(() => {
      if (active) setError('새 창에서 열 PDF를 준비하지 못했어요. PDF를 다시 열어주세요.');
    });
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [pdf]);
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
      const saved = await api<{ name: string; scoreType?: string; structure: PdfStructure }[]>('/score-pdf/jobs/saved/lookup', 'POST', data);
      setSavedChoices(saved);
      const first = saved[0]?.structure.parts[0] ?? null;
      setSelectedPart(first);
      setBpm(bpmPreference.current.value ?? saved[0]?.structure.bpm ?? 120);
      setPosition(0);
    } catch (e) {
      setError(e instanceof Error ? e.message : '저장된 마디 정보를 불러오지 못했어요.');
    } finally { setPreparingAnalysis(false); }
  };
  const parts = (savedChoices ?? []).flatMap((choice) => choice.structure.parts.map((part) => ({ part, bpm: choice.structure.bpm ?? 120 })));
  const playback = useMemo(() => {
    try { return { timeline: pdfPlaybackTimeline(selectedPart?.measures ?? []), error: '' }; }
    catch (cause) { return { timeline: [] as ReturnType<typeof pdfPlaybackTimeline<PdfStructure['parts'][number]['measures'][number]>>, error: cause instanceof Error ? cause.message : '반복 설정을 확인해주세요.' }; }
  }, [selectedPart]);
  const timeline = playback.timeline;
  const totalBeats = timeline.at(-1)?.end ?? 0;
  const firstBar = timeline[0]?.measure.number ?? 1;
  const lastMeasure = selectedPart?.measures.at(-1);
  const lastBar = lastMeasure ? lastMeasure.number + (lastMeasure.restCount ?? 1) - 1 : firstBar;
  const loopStartBar = Math.max(firstBar, Math.min(lastBar, Math.round(Number(loopFrom) || firstBar)));
  const loopEndBar = Math.max(loopStartBar, Math.min(lastBar, Math.round(Number(loopTo) || lastBar)));
  const loopStart = pdfMeasureBeat(timeline, loopStartBar);
  const loopEnd = pdfMeasureBeat(timeline, loopEndBar, loopStart, true);
  useEffect(() => {
    if (!selectedPart || loopReadyKey !== loopStorageKey) return;
    setLoopFrom((value) => value || String(firstBar));
    setLoopTo((value) => value || String(lastBar));
  }, [selectedPart?.id, firstBar, lastBar, loopReadyKey, loopStorageKey]);
  const { active: activeEntry, waiting: waitingEntry, remainingBars } = pdfTimelinePosition(timeline, position);
  const activeMeasure = activeEntry?.measure;
  const focusMeasure = activeMeasure ?? waitingEntry?.measure;
  const measureProgress = activeEntry ? pdfMeasureProgress(position, activeEntry.start - (activeEntry.restOffset ?? 0) * activeEntry.measure.meter[0] * 4 / activeEntry.measure.meter[1],
    activeEntry.measure.meter, activeEntry.measure.restCount ?? 1) : null;
  const nextMeasure = activeEntry && measureProgress?.previewNext
    ? (timeline[timeline.indexOf(activeEntry) + 1]?.gapBars === 0 ? timeline[timeline.indexOf(activeEntry) + 1]?.measure : undefined)
    : remainingBars === 1 ? waitingEntry?.measure : undefined;
  const seekMeasure = (measure: PdfStructure['parts'][number]['measures'][number]) => {
    if (!timeline.some((entry) => entry.measure === measure)) return;
    setClickedMeasure(measure.number);
    skipCountIn.current = playing;
    setPosition(pdfMeasureBeat(timeline, measure.number, position));
    setCountdown(0);
    setSeekRevision((revision) => revision + 1);
  };
  const openAnalysis = async () => {
    if (!pdf || preparingAnalysis) return;
    setPlaying(false);
    setPreparingAnalysis(true);
    try {
      setAnalysisFile(new File([new Uint8Array(await pdf.getData())], /\.pdf$/i.test(name) ? name : `${name}.pdf`, { type: 'application/pdf' }));
      setForceStructureAnalysis(false);
      setAnalysisScoreType(savedChoices?.find((choice) => choice.structure.parts.includes(selectedPart!))?.scoreType ?? savedChoices?.[0]?.scoreType ?? 'guitar-tab');
    } catch { setError('분석할 PDF를 준비하지 못했어요.'); }
    finally { setPreparingAnalysis(false); }
  };
  useEffect(() => {
    if (!playing) { setCountdown(0); return; }
    const initial = loopEnabled && (position < loopStart || position >= loopEnd) ? loopStart : position;
    if (initial !== position) setPosition(initial);
    const lead = countEnabled && !skipCountIn.current ? countBeats : 0;
    skipCountIn.current = false;
    const start = performance.now();
    let frame = 0;
    let audioStarted = false;
    let lastClick = '';
    let previousCycle = 0;
    const tick = () => {
      const elapsed = (performance.now() - start) * bpm / 60000;
      const rawPosition = initial + Math.max(0, elapsed - lead);
      const repeatLead = countEnabled ? countBeats : 0;
      const repeatElapsed = Math.max(0, elapsed - lead - (loopEnd - initial));
      const cycleLength = loopEnd - loopStart + repeatLead;
      const cycle = loopEnabled && loopEnd > loopStart && rawPosition >= loopEnd
        ? 1 + Math.floor(repeatElapsed / cycleLength) : 0;
      const phase = cycle ? repeatElapsed % cycleLength : 0;
      const counting = cycle ? phase < repeatLead : elapsed < lead;
      const remaining = cycle ? repeatLead - phase : lead - elapsed;
      const clickPosition = cycle ? loopStart + Math.max(0, phase - repeatLead) : rawPosition;
      if (cycle !== previousCycle) { audioStarted = false; lastClick = ''; previousCycle = cycle; }
      const clickEntry = pdfTimelinePosition(timeline, clickPosition).active;
      const meter = clickEntry?.measure.meter ?? [4, 4];
      const beatLength = 4 / meter[1];
      const clickBeat = counting ? Math.floor(cycle ? phase : elapsed) : Math.floor((clickPosition - (clickEntry?.start ?? 0)) / beatLength);
      const clickKey = counting ? `count:${cycle}:${clickBeat}` : `${clickEntry?.start ?? 'gap'}:${clickBeat}`;
      if (clickKey !== lastClick) {
        lastClick = clickKey;
        const context = metronomeContext.current;
        if (metronomeConfig.current.enabled && context && context.state === 'running') {
          scheduleClick(context, context.currentTime, clickBeat % meter[0] === 0, metronomeConfig.current.volume);
        }
      }
      setCountdown(counting ? Math.ceil(remaining) : 0);
      if (counting) {
        linkedAudio.current?.pause();
        audioStarted = false;
        setPosition(Math.min(totalBeats, clickPosition));
      } else {
        const next = Math.min(totalBeats, clickPosition);
        const audio = linkedAudio.current;
        if (!audioConfig.current.enabled) { audio?.pause(); audioStarted = false; }
        else if (audio?.getAttribute('src') && !audioStarted) {
          audioStarted = true;
          audio.currentTime = audioConfig.current.start + next * 60 / bpm;
          void audio.play().catch(() => setError('음원을 재생하지 못했어요. 곡 정보 수정에서 등록된 음원을 확인해주세요.'));
        }
        setPosition(next);
        if (!loopEnabled && next >= totalBeats) { setPlaying(false); return; }
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(frame); linkedAudio.current?.pause(); };
  }, [playing, bpm, countEnabled, countBeats, totalBeats, seekRevision, loopEnabled, loopStart, loopEnd]);
  useEffect(() => {
    if (!following || !focusMeasure) return;
    const frame = requestAnimationFrame(() => {
      const container = stage.current;
      const region = activeRegion.current;
      if (!container || !region) return;
      const viewport = container.getBoundingClientRect();
      const bounds = region.getBoundingClientRect();
      const previous = lastFocusedMeasure.current;
      const jumped = previous !== null && previous.part === selectedPart?.id &&
        (focusMeasure.number < previous.number || (focusMeasure.number !== previous.number && focusMeasure.number !== previous.nextNumber));
      const sourceIndex = selectedPart?.measures.indexOf(focusMeasure) ?? -1;
      lastFocusedMeasure.current = { part: selectedPart?.id ?? '', number: focusMeasure.number,
        nextNumber: sourceIndex >= 0 ? selectedPart?.measures[sourceIndex + 1]?.number : undefined };
      container.scrollTo({
        top: container.scrollTop + bounds.top - viewport.top - (container.clientHeight - bounds.height) / 2,
        left: Math.max(0, container.scrollLeft + bounds.left - viewport.left - (container.clientWidth - bounds.width) / 2),
        behavior: jumped ? 'instant' : 'smooth',
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [following, selectedPart, focusMeasure?.number, focusMeasure?.page, width, zoom, expanded, layoutRevision]);
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
    setPlaying(false);
    setSelectedPart(null);
    setSavedChoices(null);
    void import('pdfjs-dist/legacy/build/pdf.mjs')
      .then(async (engine) => {
        engine.GlobalWorkerOptions.workerSrc = new URL(
          'pdfjs-dist/legacy/build/pdf.worker.min.mjs',
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
      .catch((cause: unknown) => {
        if (!active) return;
        console.error('PDF loading failed', cause);
        const reason = cause instanceof Error ? cause.message : '';
        setError(`PDF를 읽지 못했어요. 암호가 없는 PDF인지 확인하거나 새 창에서 열어주세요.${reason ? ` (${reason})` : ''}`);
      });
    return () => {
      active = false;
      destroy?.();
    };
  }, [url]);
  useEffect(() => { if (pdf) void lookupSaved(); }, [pdf]);
  const reader = (
    <dialog
      ref={dialog}
      open={inline || undefined}
      tabIndex={inline ? 0 : undefined}
      className={
        'performance-reader performance-pdf-reader' +
        (following ? ' pdf-following' : '') +
        (inline ? ' performance-reader-embedded performance-pdf-embedded' : '')
      }
      aria-label={name + ' PDF 뷰어'}
      onKeyDownCapture={(e) => {
        if (e.code !== 'Space' || !following || analysisFile || highlightSettingsOpen) return;
        const target = e.target as HTMLElement;
        if (target.closest('textarea,select,input:not([type="checkbox"]),[contenteditable="true"]')) return;
        e.preventDefault();
        e.stopPropagation();
        if (e.repeat || !selectedPart || preparingAnalysis) return;
        if (!playing) resumeMetronome();
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
            <div className="pdf-library-actions">
            <button className="pdf-back-to-list" onClick={onClose}>← 악보 목록</button>

            </div>
            <div className="pdf-title-controls">
            <h2 title={name}>{name}</h2>
            <span className="pdf-title-divider" aria-hidden="true" />
            <div className="pdf-playback-part-label">
            <span>재생 마디 선택</span>
            <div className="pdf-playback-part-controls">
            {parts.length ? <>
            <select aria-label="따라갈 파트" disabled={preparingAnalysis || !parts.length} value={parts.findIndex((entry) => entry.part === selectedPart)} onChange={(e) => {
              const entry = parts[Number(e.target.value)];
              setPlaying(false);
              if (!entry) { setSelectedPart(null); setPosition(0); return; }
              const physical = pdfPlaybackTimeline(entry.part.measures.map((measure) => ({ ...measure, repeat: null })));
              const nearest = nearestPdfPartPosition(focusMeasure, entry.part.measures);
              const target = physical.find((bar) => bar.start === nearest)?.measure ?? entry.part.measures[0];
              try { setPosition(target ? pdfMeasureBeat(pdfPlaybackTimeline(entry.part.measures), target.number, position) : 0); }
              catch { setPosition(0); }
              setSelectedPart(entry.part);
              setBpm(bpmPreference.current.value ?? entry.bpm);
            }}><option value={-1}>선택 안함</option>{parts.map((entry, i) => <option key={i} value={i}>{entry.part.name}</option>)}</select>
            <button className="pdf-follow-analyze" disabled={preparingAnalysis || !pdf} onClick={() => void openAnalysis()}>마디 설정</button>
            </> : <button className="pdf-follow-analyze pdf-start-measure-analysis" disabled={preparingAnalysis || !pdf} onClick={() => void openAnalysis()}>
              {preparingAnalysis ? '분석 기록 확인 중…' : '악보 마디 분석'}
            </button>}
            </div>
            </div>
            <button className="pdf-follow-analyze" type="button" disabled={!highlightReady} onClick={() => { setHighlightError(''); setHighlightSettingsOpen(true); }}>강조 설정</button>
            </div>
          </div>
          <div className="pdf-view-area">
            <a href={externalPdfUrl || undefined} target="_blank" rel="noopener noreferrer"
              aria-disabled={!externalPdfUrl} onClick={(event) => { if (!externalPdfUrl) event.preventDefault(); }}>
              새 창에서 열기
            </a>
          <div className="performance-reader-settings pdf-view-controls">
            <div className="performance-pdf-zoom" role="group" aria-label="PDF 배율 조정">
              <button
                type="button"
                aria-label="PDF 축소"
                disabled={!zoomReady || zoom <= 30}
                onClick={() => changeZoom(-10)}
              >
                −
              </button>
              <span aria-live="polite">{zoom}%</span>
              <button
                type="button"
                aria-label="PDF 확대"
                disabled={!zoomReady || zoom >= 200}
                onClick={() => changeZoom(10)}
              >
                +
              </button>
            </div>

            {embedded ? (
              <button onClick={() => setExpanded((value) => !value)}>
                {expanded ? '작게 보기' : '전체화면'}
              </button>
            ) : (
              <button onClick={onClose}>닫기</button>
            )}
          </div>
          </div>
        </header>
        {following && <div className="pdf-follow-toolbar" aria-label="박자 따라가기 도구">
            <div className="pdf-follow-source">

            <label>BPM <BpmInput value={bpm} onChange={changeBpm} disabled={!bpmReady} /></label>
            <div className="pdf-setting-toggle pdf-metronome-controls">
              <button type="button" className="pdf-listen-switch" role="switch" aria-label="메트로놈" aria-checked={metronome} onClick={() => void toggleMetronome()}><span /></button>
              <span title="메트로놈" style={{ display: 'flex' }}><ScoreTransportIcon name="metronome" /></span>
              <input type="range" aria-label="메트로놈 음량" min={0} max={1} step={0.01} value={metronomeVolume}
                style={{ width: 58, minWidth: 58 }} onChange={(e) => { const volume = Number(e.target.value); setMetronomeVolume(volume); saveMetronome(metronome, volume); }} />
            </div>
            {!!parts.length && <>
            <button type="button" className="pdf-setting-button" aria-pressed={showBeats} onClick={() => setShowBeats((value) => !value)}>악보에 표기</button>
            <button type="button" className="pdf-setting-button" aria-pressed={countEnabled} onClick={() => { setPlaying(false); setCountEnabled((value) => !value); }}>카운트다운</button>
            <input className="pdf-countdown-input" aria-label="카운트다운 박 수" type="number" min={1} max={32} disabled={!countEnabled} value={countBeats} onChange={(e) => { setPlaying(false); setCountBeats(Math.max(1, Math.min(32, Number(e.target.value) || 4))); }} />
            <span aria-hidden="true" style={{ width: 1, height: 20, background: '#717b89', margin: '0 4px', flexShrink: 0 }} />
            <button type="button" className="pdf-setting-button" aria-pressed={loopEnabled} disabled={!selectedPart}
              onClick={() => { setPlaying(false); setLoopEnabled((value) => !value); }}>구간 반복</button>
            <div className="pdf-loop-range">
              <input type="number" aria-label="반복 시작 마디" min={firstBar} max={lastBar} value={loopFrom}
                onChange={(e) => { setPlaying(false); setLoopFrom(e.target.value); }}
                onBlur={() => { setLoopFrom(String(loopStartBar)); setLoopTo(String(loopEndBar)); }}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); } }} />
              <span>~</span>
              <input type="number" aria-label="반복 끝 마디" min={loopStartBar} max={lastBar} value={loopTo}
                onChange={(e) => { setPlaying(false); setLoopTo(e.target.value); }}
                onBlur={() => setLoopTo(String(loopEndBar))}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); } }} />
              <span>마디</span>
            </div>
            </>}
            </div>
          {preparingAnalysis ? <span>마디 정보를 불러오는 중…</span> : parts.length ? <>
            <div className="pdf-follow-settings">
            <label className="pdf-listen-along">
              <button type="button" role="switch" aria-checked={listenAlong} aria-label="음원 같이 듣기" className="pdf-listen-switch" onClick={() => { const enabled = !listenAlong; setListenAlong(enabled); saveAudioPreferences(enabled, audioVolume); }}><span /></button>
              음원 같이 듣기
            </label>
            <label className="pdf-follow-volume">음량
              <input type="range" aria-label="함께 듣는 음원 음량" min={0} max={1} step={0.01} value={audioVolume}
                disabled={!listenAlong || !audioUrl || loadingSongAudio} onChange={(e) => {
                  const value = Number(e.target.value); setAudioVolume(value); saveAudioPreferences(listenAlong, value);
                  if (linkedAudio.current) linkedAudio.current.volume = value;
                }} />
            </label>

            </div>
          </> : <span>마디를 분석한 기록이 없습니다.</span>}
        </div>}
        {following && selectedPart && <div className="pdf-follow-progress">
          <input type="range" aria-label="PDF 악보 재생 위치" min={0} max={totalBeats || 1} step={0.01}
            style={{ '--seek-progress': `${Math.max(0, Math.min(100, totalBeats ? position / totalBeats * 100 : 0))}%` } as CSSProperties}
            value={position} disabled={!totalBeats} onChange={(e) => {
              skipCountIn.current = playing;
              setPosition(Number(e.target.value));
              setCountdown(0);
              setSeekRevision((revision) => revision + 1);
            }} />
          <div><span>{Math.floor(position * 60 / bpm / 60)}:{String(Math.floor(position * 60 / bpm) % 60).padStart(2, '0')}</span>
            <span>{Math.floor(totalBeats * 60 / bpm / 60)}:{String(Math.floor(totalBeats * 60 / bpm) % 60).padStart(2, '0')}</span></div>
            <div className="pdf-follow-transport">
              <button disabled={!selectedPart} title="처음으로" aria-label="처음으로" onClick={() => { setPlaying(false); setPosition(0); }}>│◀</button>
              <button disabled={!selectedPart} title={playing ? '일시정지' : '재생'} aria-label={playing ? '일시정지' : '재생'} onClick={() => {
                if (!playing) resumeMetronome();
                if (!playing && position >= totalBeats) setPosition(0); setPlaying(!playing);
              }}>{playing ? 'Ⅱ' : '▶'}</button>
              <button disabled={!selectedPart} title="끝으로" aria-label="끝으로" onClick={() => { setPlaying(false); setPosition(totalBeats); }}>▶│</button>
            </div>
        </div>}
        </div>
        {(error || playback.error) && (
          <p role="alert" className="performance-reader-error">
            {error || playback.error}
          </p>
        )}
        <div className="pdf-follow-stage-wrap">
        {clickedMeasure !== null && <div className="pdf-clicked-measure" role="status">{clickedMeasure}마디</div>}
        {loopEnabled && selectedPart && <div className="pdf-loop-status" role="status">{loopStartBar}~{loopEndBar} 구간반복 진행중</div>}
        <div className="performance-reader-stage" ref={stage}>
          {!pdf && !error && <p>PDF를 불러오는 중…</p>}
          {pdf && Array.from({ length: pdf.numPages }, (_, i) => i + 1).map((page) => (
          <PdfContinuousPage key={`${url}:${page}`} pdf={pdf} page={page} width={width} zoom={zoom} inline={inline}
            onLayout={() => setLayoutRevision((value) => value + 1)}>
            {(pageRatio) => <>
            {following && selectedPart && <svg
              viewBox="0 0 1000 1000" preserveAspectRatio="none"
              aria-label={`${selectedPart.name} ${page}페이지`}
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
              {selectedPart.measures.filter((m) => m.page === page).map((m) => <g key={m.number}>
                <rect x={m.bounds[0]} y={m.bounds[1]} width={m.bounds[2] - m.bounds[0]} height={m.bounds[3] - m.bounds[1]}
                  ref={focusMeasure === m ? activeRegion : undefined}
                  data-pdf-measure-hit="true"
                  role="button" tabIndex={0} aria-label={`${m.number}마디 첫 박으로 이동`}
                  style={{ pointerEvents: 'all', cursor: 'pointer' }}
                  onClick={() => seekMeasure(m)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); seekMeasure(m); }
                  }}
                  fill={activeMeasure === m ? highlight.fill : 'transparent'} fillOpacity={activeMeasure === m ? highlight.opacity : 0}
                  stroke={activeMeasure === m ? highlight.border : 'transparent'} strokeWidth={highlight.width} />
                {showBeats && (activeMeasure === m || nextMeasure === m) && Array.from({ length: m.meter[0] }, (_, beat) => {
                  const active = activeMeasure === m && Math.floor((position - (activeEntry?.start ?? 0)) / (4 / m.meter[1])) % m.meter[0] === beat;
                  const radius = (active ? highlight.beatRadius : highlight.beatIdleRadius) * (beat === 0 ? 1.25 : 1);
                  const x = m.bounds[0] + (m.bounds[2] - m.bounds[0]) * (beat + 0.5) / m.meter[0];
                  const y = Math.max(Math.max(highlight.beatRadius, highlight.beatIdleRadius) * 1.25, m.bounds[1] - 10);
                  return <ellipse key={beat} cx={x} cy={y} rx={radius} ry={radius * pageRatio}
                    fillOpacity={highlight.beatOpacity}
                    fill={active ? highlight.beatColor : nextMeasure === m ? highlight.beatPreviewColor : highlight.beatIdleColor} />;
                })}
                {((activeMeasure === m && (m.restCount ?? 1) > 1) || waitingEntry?.measure === m) && <g>
                  <g transform={`translate(${(m.bounds[0] + m.bounds[2]) / 2}, ${waitingEntry?.measure === m ? m.bounds[1] + 14 * pageRatio : m.bounds[3] - 14 * pageRatio}) scale(1, ${pageRatio})`}>
                  <rect x={waitingEntry?.measure === m ? -48 : -82} y={-12}
                    width={waitingEntry?.measure === m ? 96 : 164} height={24} rx={3} fill="#343b43" fillOpacity={0.8} />
                  <text x={0} y={0} dominantBaseline="middle" textAnchor="middle" fill="#fff" fontSize={13} fontWeight="600">
                    {waitingEntry?.measure === m ? `${remainingBars}마디 다음` : `${measureProgress?.ordinal} / ${m.restCount}마디 진행 중`}
                  </text>
                  </g>
                </g>}
                {focusMeasure === m && countdown > 0 && <g role="status" aria-label={`재생 시작까지 ${countdown}박`}>
                  <rect x={m.bounds[0]} y={Math.max(0, m.bounds[1] - 60)} width={56} height={54} rx={12} fill="rgba(52,56,62,.72)" />
                  <text x={m.bounds[0] + 28} y={Math.max(0, m.bounds[1] - 60) + 39} textAnchor="middle" fill="white" fontSize={42} fontWeight="bold">{countdown}</text>
                </g>}
                <text x={m.bounds[0] + 3} y={m.bounds[1] + 15} fill="#226aa8" fontSize="13">{m.number}</text>
                {loopEnabled && loopStartBar >= m.number && loopStartBar < m.number + (m.restCount ?? 1) && <g>
                  <line x1={m.bounds[0]} x2={m.bounds[0]} y1={m.bounds[1] - 6 * pageRatio} y2={m.bounds[3] + 6 * pageRatio}
                    stroke="#2674cc" strokeWidth={3} vectorEffect="non-scaling-stroke" />
                  <g transform={`translate(${m.bounds[0]}, ${m.bounds[3] + 7 * pageRatio}) scale(1, ${pageRatio})`}>
                    <rect width={106} height={23} rx={3} fill="#343b43" fillOpacity={0.8} />
                    <text x={53} y={12} dominantBaseline="middle" textAnchor="middle" fill="white" fontSize={12} fontWeight="600">구간 반복 시작</text>
                  </g>
                </g>}
                {loopEnabled && loopEndBar >= m.number && loopEndBar < m.number + (m.restCount ?? 1) && <g>
                  <line x1={m.bounds[2]} x2={m.bounds[2]} y1={m.bounds[1] - 6 * pageRatio} y2={m.bounds[3] + 6 * pageRatio}
                    stroke="#2674cc" strokeWidth={3} vectorEffect="non-scaling-stroke" />
                  <g transform={`translate(${m.bounds[2] - 106}, ${m.bounds[3] + 7 * pageRatio}) scale(1, ${pageRatio})`}>
                    <rect width={106} height={23} rx={3} fill="#343b43" fillOpacity={0.8} />
                    <text x={53} y={12} dominantBaseline="middle" textAnchor="middle" fill="white" fontSize={12} fontWeight="600">구간 반복 끝</text>
                  </g>
                </g>}
              </g>)}
            </svg>}
            </>}
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
          loadSavedStructure={parts.length > 0}
          initialScoreType={analysisScoreType}
          onClose={() => { setAnalysisFile(null); setForceStructureAnalysis(false); if (following) void lookupSaved(); }}
        />
      )}
      {highlightSettingsOpen && <PdfMeasureHighlightSettings value={highlight} onClose={() => setHighlightSettingsOpen(false)}
        busy={highlightSaving} error={highlightError} onApply={(value) => void saveHighlight(value)} />}
    </dialog>
  );
  return <>
    {embedded && <div ref={embeddedAnchor} className="pdf-reader-anchor" />}
    {embedded && expanded ? createPortal(reader, document.body) : reader}
    {createPortal(<audio ref={linkedAudio} src={audioUrl || undefined} preload="metadata" hidden />, document.body, 'pdf-linked-audio')}
  </>;
}

function PdfContinuousPage({ pdf, page, width, zoom, inline, children, onLayout }: {
  pdf: PDFDocumentProxy;
  page: number;
  width: number;
  zoom: number;
  inline: boolean;
  children: (pageRatio: number) => ReactNode;
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
    {children(size.width / size.height)}
  </div>;
}
