import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { ScoreSectionToggle } from '../components/ScoreSectionToggle.web';
import { ScoreSettingsIcon } from '../components/ScoreSettingsIcon.web';
import { AppShell } from '../components/AppShell';
import { ActionButton, FlexRow, Meta, PageHeading } from '../components/ProductUI';
import { readMedia, writeMedia } from '../lib/mediaStore';
import { downloadText } from '../lib/platformActions';
import { useMockAppState, useWorkspaceValue } from '../state/MockAppState';
import type { ScreenProps } from '../navigation';
import {
  scoreToMusicXml,
  cleanScoreConnections,
  scorePlaybackFrom,
  scorePlaybackPosition,
  scoreMeasureAtBeat,
  noteTones,
  type Score,
  type ScoreClipboardNote,
  type ScoreNote,
} from '../lib/score';
import {
  createScoreOutput,
  scheduleScorePassage,
  scheduleScoreBacking,
  scheduleScoreNote,
} from '../lib/scoreAudio.web';
import { validateAudioFile } from '../lib/trackParts';
import { ScoreParts } from '../components/ScoreParts.web';
import {
  audibleScoreParts,
  scorePartMix,
  scorePartStaves,
  scorePartOwner,
  ensemblePlaybackScore,
} from '../lib/scoreParts';
import { scoreInstrument } from '../lib/score';
import { GuitarTabEditor } from '../components/GuitarTabEditor.web';
import { ScoreEditorViewport } from '../components/ScoreEditorViewport.web';
import { scoreFromMusicXml } from '../lib/scoreImport.web';
import { useIdentity } from '../state/Identity';
import { ScoreInstrumentSample } from '../components/ScoreInstrumentSample.web';
import type { InstrumentSample } from '../lib/samplePitch';
import { prepareInstrumentSample } from '../lib/instrumentSample.web';
import { ScoreVersionControls } from '../components/ScoreVersionControls.web';
import {
  createScoreVersionLibrary,
  readScoreVersionLibrary,
  storeScoreVersionLibrary,
  saveScoreVersion,
  addScoreVersion,
  applyScoreVersion,
  renameScoreVersion,
  removeScoreVersion,
  scoreDocumentFromStored,
  scoreVersionName,
  reconcileScoreVersions,
  partVersionGroup,
  captureScorePart,
  replaceScorePart,
  importScorePart,
  type ScoreVersionLibrary,
} from '../lib/scoreVersions';
import { ScoreFileMenu } from '../components/ScoreFileMenu.web';
import { ScoreFileActions } from '../components/ScoreFileActions.web';
import { ScoreBackingDisclosure } from '../components/ScoreBackingDisclosure.web';
import { ScoreAudioFile } from '../components/ScoreAudioFile.web';
import type { ScoreDocument } from '../lib/scoreFile';
import { ScoreSoundfont } from '../components/ScoreSoundfont.web';
import { defaultSoundfontInstrument, isSoundfontInstrument } from '../lib/soundfontCatalog';
import { prepareSoundfontInstrument } from '../lib/soundfont.web';
import { createBandScoreStore, type StoredScore } from '../lib/bandScoreStore.web';
import { createScorePlaybackClock } from '../lib/scorePlaybackClock';
import type { ScorePlaybackPosition } from '../lib/scorePlaybackDisplay.web';
import {
  ScoreYouTubeBacking,
  type ScoreYouTubeHandle,
} from '../components/ScoreYouTubeBacking.web';
export function ScoreEditorScreen({
  navigate,
  entityId,
  bandScore = false,
  scoreView,
}: ScreenProps & { bandScore?: boolean }) {
  const userId = useIdentity();
  const { workspaceId, adoptedSongs } = useMockAppState();
  const song = adoptedSongs.find((item) => item.id === entityId);
  const defaultTitle = useRef('나의 악보');
  defaultTitle.current = song?.title ?? '나의 악보';
  const [arrangement] = useWorkspaceValue(`song/${entityId}/arrangement`, {
    key: '',
    bpm: '',
    structure: '',
  });
  const key = bandScore
    ? `band-score/${workspaceId}/${entityId}`
    : `score/${entityId ? workspaceId + '/' + entityId : 'personal'}`;
  const bandStore = useMemo(
    () => (bandScore ? createBandScoreStore(workspaceId, entityId ?? '', userId) : null),
    [bandScore, workspaceId, entityId, userId],
  );
  const [reload, setReload] = useState(0);
  const [bandSaving, setBandSaving] = useState(false);
  const [savedDocument, setSavedDocument] = useState<ScoreDocument | null>(null);
  const [versionLibrary, setVersionLibrary] = useState<ScoreVersionLibrary | null>(null);
  const libraryRef = useRef<ScoreVersionLibrary | null>(null);
  const versionWrites = useRef<Promise<unknown>>(Promise.resolve());
  const [selectedVersionId, setVersionId] = useState('original');
  const selectedVersionRef = useRef('original');
  const [previewApplied, setPreviewApplied] = useState(scoreView === 'applied');
  const [pendingVersion, setPendingVersion] = useState<{ id: string; part: string } | null>(null);
  const [importedVersion, setImportedVersion] = useState<ScoreDocument | null>(null);
  const partStructureEdit = useRef<Score | null>(null);
  const [personalSource, setPersonalSource] = useState('song');
  const [personalCopy, setPersonalCopy] = useState<ScoreDocument | null>(null);
  const [copyMessage, setCopyMessage] = useState('');
  const [score, setScore] = useState<Score>({
    title: song?.title ?? '나의 악보',
    bpm: 120,
    notes: [],
    parts: ['Guitar', 'Vocal', 'Bass', 'Drums'],
    sync: {},
  });
  const [history, setHistory] = useState<Score[]>([]);
  const editGroup = useRef<string | null>(null);
  const pendingSave = useRef<(() => void) | null>(null);
  const [future, setFuture] = useState<Score[]>([]);
  const [loaded, setLoaded] = useState(false);
  const loadedKey = useRef('');
  const [status, setStatus] = useState('악보 불러오는 중…');
  const [part, setPart] = useState('Guitar');
  const [selected, setSelected] = useState<string | null>(null);
  const [clipboard, setClipboard] = useState<ScoreClipboardNote[]>([]);
  const [playing, setPlaying] = useState(false);
  const [playbackBeat, setPlaybackBeat] = useState<number | null>(null);
  const playbackPosition = useRef<ScorePlaybackPosition['current']>(null);
  const playbackTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const output = useRef<ReturnType<typeof createScoreOutput> | null>(null);
  const volume = Math.max(0, Math.min(1, score.playbackVolume ?? 0.8));
  const changeVolume = (value: number) => {
    const next = Math.max(0, Math.min(1, value));
    output.current?.setVolume(next);
    setScore((current) => ({ ...current, playbackVolume: next }));
  };
  const context = useRef<AudioContext | null>(null);
  const auditionContext = useRef<AudioContext | null>(null);
  const auditionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stopAudition = useCallback(() => {
    if (auditionTimer.current) clearTimeout(auditionTimer.current);
    auditionTimer.current = null;
    void auditionContext.current?.close();
    auditionContext.current = null;
  }, []);
  const alive = useRef(true);
  const audio = useRef<HTMLAudioElement | null>(null);
  const youtube = useRef<ScoreYouTubeHandle | null>(null);
  const [youtubeReady, setYoutubeReady] = useState(false);
  const [audioUrl, setAudioUrl] = useState('');
  const [referenceAudio, setReferenceAudio] = useState<Blob | null>(null);
  const [instrumentSample, setInstrumentSample] = useState<InstrumentSample | null>(null);
  const [recordingSetup, setRecordingSetup] = useState(false);
  const recordingMode = instrumentSample ? instrumentSample.enabled : recordingSetup;
  const changeInstrumentSample = useCallback((sample: InstrumentSample | null) => {
    if (!sample) setRecordingSetup(true);
    setInstrumentSample(sample);
  }, []);
  const bandDirty =
    !previewApplied &&
    loaded &&
    savedDocument !== null &&
    (score !== savedDocument.score ||
      referenceAudio !== savedDocument.referenceAudio ||
      instrumentSample !== savedDocument.instrumentSample);
  const workingLibrary = useMemo(
    () =>
      versionLibrary
        ? reconcileScoreVersions(versionLibrary, { score, referenceAudio, instrumentSample })
        : null,
    [versionLibrary, score, referenceAudio, instrumentSample],
  );
  const versionPart = scorePartOwner(score, part);
  const versionGroup = workingLibrary?.parts.find((item) => item.part === versionPart);
  const versionId =
    previewApplied && versionGroup
      ? versionGroup.appliedVersionId
      : versionGroup?.versions.some((item) => item.id === selectedVersionId)
        ? selectedVersionId
        : (versionGroup?.appliedVersionId ?? 'original');
  selectedVersionRef.current = versionId;
  useEffect(() => {
    if (!bandDirty && !bandSaving) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    const navigateAway = (event: Event) => {
      if (
        !window.confirm(
          bandSaving
            ? '악보를 저장 중이에요. 지금 나가면 저장 결과를 확인할 수 없어요. 나갈까요?'
            : '밴드에 저장하지 않은 악보 변경사항이 있어요. 저장하지 않고 나갈까요?',
        )
      )
        event.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    window.addEventListener('moajam:before-navigate', navigateAway);
    return () => {
      window.removeEventListener('beforeunload', warn);
      window.removeEventListener('moajam:before-navigate', navigateAway);
    };
  }, [bandDirty, bandSaving]);
  const [sampleLoading, setSampleLoading] = useState(false);
  const [soundfontBusy, setSoundfontBusy] = useState(false);
  const savedInstrument = score.playbackInstruments?.[part];
  const playbackInstrument = isSoundfontInstrument(savedInstrument)
    ? savedInstrument
    : defaultSoundfontInstrument(part, score.instruments?.[part]);
  const [fileBusy, setFileBusy] = useState(false);
  const xmlInput = useRef<HTMLInputElement>(null);
  const [documentVersion, setDocumentVersion] = useState(0);
  useEffect(
    () => stopAudition,
    [
      stopAudition,
      part,
      instrumentSample,
      playbackInstrument,
      playing,
      documentVersion,
      key,
      sampleLoading,
      soundfontBusy,
      fileBusy,
    ],
  );
  const [audioPosition, setAudioPosition] = useState(0);
  const [audioMessage, setAudioMessage] = useState('');
  const [audioLoading, setAudioLoading] = useState(false);
  const audioLoadRequest = useRef(0);
  const decodedAudio = useRef<{ file: Blob; buffer: AudioBuffer } | null>(null);
  const referenceOutput = useRef<ReturnType<typeof createScoreOutput> | null>(null);
  const referenceVolume = score.referenceAudioVolume ?? 0.8;
  const referenceOffset = score.referenceAudioOffset ?? 0;
  const referenceEnabled = score.referenceAudioEnabled ?? true;
  const youtubeSource = score.referenceAudioSource === 'youtube';
  const hasReference = youtubeSource ? !!score.referenceYoutubeId : !!referenceAudio;
  const latestVolumes = useRef({ score: volume, reference: referenceVolume });
  latestVolumes.current = { score: volume, reference: referenceVolume };
  const changeReferenceVolume = (value: number) => {
    referenceOutput.current?.setVolume(value);
    setScore((current) => ({ ...current, referenceAudioVolume: value }));
  };
  const loadAudio = async (file: File) => {
    const request = ++audioLoadRequest.current;
    audio.current?.pause();
    setAudioMessage('');
    setAudioLoading(true);
    try {
      validateAudioFile(file);
      const decoder = new OfflineAudioContext(1, 1, 44100);
      const buffer = await decoder.decodeAudioData(await file.arrayBuffer());
      if (!alive.current || request !== audioLoadRequest.current || loadedKey.current !== key)
        return;
      decodedAudio.current = { file, buffer };
      setReferenceAudio(file);
      setAudioUrl(URL.createObjectURL(file));
      setAudioPosition(0);
      setScore((current) => ({
        ...current,
        referenceAudioName: file.name,
        referenceAudioSource: 'file',
        referenceAudioEnabled: true,
        referenceAudioOffset: 0,
        sync: {},
      }));
    } catch (error) {
      if (alive.current && request === audioLoadRequest.current)
        setAudioMessage(
          error instanceof Error && error.name !== 'EncodingError'
            ? error.message
            : '재생할 수 없는 음원이에요. 다른 MP3 또는 WAV 파일을 선택해주세요.',
        );
    } finally {
      if (alive.current && request === audioLoadRequest.current) setAudioLoading(false);
    }
  };
  const [ensemble, setEnsemble] = useState(false);
  const [playAll, setPlayAll] = useState(false);
  const [backingExpanded, setBackingExpanded] = useState(true);
  const backingBodyId = useId();
  const [saveFailed, setSaveFailed] = useState(false);
  useEffect(() => {
    alive.current = true;
    let active = true;
    loadedKey.current = '';
    setLoaded(false);
    setSavedDocument(null);
    setSaveFailed(false);
    setStatus('악보 불러오는 중…');
    setPersonalCopy(null);
    setHistory([]);
    setFuture([]);
    setSelected(null);
    setPlaying(false);
    setPlaybackBeat(null);
    audioLoadRequest.current++;
    decodedAudio.current = null;
    setAudioLoading(false);
    setAudioMessage('');
    setInstrumentSample(null);
    setSampleLoading(false);
    void versionWrites.current
      .catch(() => {})
      .then(() => (bandStore ? bandStore.load() : readMedia<StoredScore>(key, userId)))
      .then((value) => {
        if (active) {
          const library = value
            ? readScoreVersionLibrary(value)
            : createScoreVersionLibrary({
                score: {
                  title: defaultTitle.current,
                  bpm: 120,
                  notes: [],
                  parts: ['Guitar', 'Vocal', 'Bass', 'Drums'],
                  sync: {},
                },
                referenceAudio: null,
                instrumentSample: null,
              });
          libraryRef.current = library;
          setVersionLibrary(library);
          setVersionId(library.parts[0].appliedVersionId);
          setPreviewApplied(scoreView === 'applied');
          setPendingVersion(null);
          setImportedVersion(null);
          const first = library.parts[0];
          const document =
            scoreView === 'applied'
              ? library.applied
              : {
                  ...library.applied,
                  score: replaceScorePart(
                    library.applied.score,
                    first.part,
                    first.versions.find((version) => version.id === first.appliedVersionId)!
                      .content,
                  ),
                };
          setInstrumentSample(document.instrumentSample);
          setRecordingSetup(false);
          setReferenceAudio(document.referenceAudio);
          setAudioUrl(document.referenceAudio ? URL.createObjectURL(document.referenceAudio) : '');
          setAudioPosition(0);
          setScore(document.score);
          setPart(document.score.parts[0]);
          setSavedDocument(document);
          loadedKey.current = key;
          setLoaded(true);
          setStatus(
            value
              ? '저장된 악보를 불러왔어요.'
              : bandScore
                ? '새 악보 · 편집 후 밴드에 저장해주세요.'
                : '저장됨',
          );
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setSaveFailed(true);
          setStatus(
            error instanceof Error
              ? error.message
              : '악보를 불러오지 못했습니다. 새로고침해주세요.',
          );
        }
      });
    return () => {
      active = false;
      alive.current = false;
      if (playbackTimer.current !== null) clearInterval(playbackTimer.current);
      void context.current?.close();
      context.current = null;
    };
  }, [key, userId, bandStore, bandScore, reload, scoreView]);
  useEffect(() => {
    const flush = () => pendingSave.current?.();
    window.addEventListener('pagehide', flush);
    return () => {
      flush();
      window.removeEventListener('pagehide', flush);
    };
  }, [key, userId]);
  useEffect(() => {
    if (bandScore || previewApplied || !loaded || loadedKey.current !== key || !bandDirty) return;
    let active = true;
    let started = false;
    const document = { score, referenceAudio, instrumentSample };
    const save = () => {
      if (started) return;
      started = true;
      if (pendingSave.current === save) pendingSave.current = null;
      void persistVersions(
        (library) =>
          saveScoreVersion(
            reconcileScoreVersions(library, document),
            versionPart,
            versionId,
            document,
          ),
        true,
      ).then((next) => {
        if (next && active && selectedVersionRef.current === versionId) {
          setSavedDocument(document);
          setStatus('버전 자동 저장됨 · 연습 적용은 별도예요.');
        }
      });
    };
    pendingSave.current = save;
    const timer = setTimeout(save, 300);
    return () => {
      active = false;
      clearTimeout(timer);
      if (pendingSave.current === save) pendingSave.current = null;
    };
    // The document snapshot and version identity determine each autosave.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    key,
    score,
    loaded,
    referenceAudio,
    instrumentSample,
    userId,
    bandScore,
    previewApplied,
    versionId,
    versionPart,
    bandDirty,
  ]);
  useEffect(() => {
    if (!score.parts.includes(part)) setPart(score.parts[0] ?? 'Guitar');
    if (selected && !score.notes.some((note) => note.id === selected && note.part === part))
      setSelected(null);
  }, [score, part, selected]);
  useEffect(
    () => () => {
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    },
    [audioUrl],
  );
  const finishEdit = () => {
    editGroup.current = null;
    pendingSave.current?.();
  };
  const edit = (next: Score, group?: string) => {
    if (!loaded || playing || fileBusy || previewApplied) return;
    if (!group || editGroup.current !== group) setHistory((all) => [...all.slice(-49), score]);
    editGroup.current = group ?? null;
    setFuture([]);
    setScore(cleanScoreConnections(next));
  };
  const visible = score.notes.filter((note) => note.part === part);
  const syncNoteIndex = visible.findIndex((note) => note.id === selected);
  const syncBeat = visible
    .slice(0, Math.max(0, syncNoteIndex))
    .reduce((sum, note) => sum + note.beats, 0);
  const syncLocation = syncNoteIndex >= 0 ? scoreMeasureAtBeat(score, part, syncBeat) : null;
  const syncUnavailable = !hasReference
    ? '먼저 음원 파일이나 유튜브 영상을 추가하세요.'
    : audioLoading || (youtubeSource && !youtubeReady)
      ? '음원을 준비하고 있어요. 준비가 끝나면 위치를 맞출 수 있어요.'
      : playing
        ? '악보 재생을 정지한 뒤 위치를 맞추세요.'
        : !syncLocation
          ? '악보에서 기준이 될 음표를 선택하세요.'
          : '';
  const audition = async (note: ScoreNote) => {
    if (!loaded || playing || fileBusy || sampleLoading || soundfontBusy || note.rest || note.blank)
      return;
    stopAudition();
    const ctx = new AudioContext();
    auditionContext.current = ctx;
    try {
      await ctx.resume();
      if (auditionContext.current !== ctx) return;
      const instrument = instrumentSample?.enabled
        ? await prepareInstrumentSample(instrumentSample)
        : await prepareSoundfontInstrument(
            playbackInstrument,
            noteTones(note).map((tone) => tone.pitch),
          );
      if (auditionContext.current !== ctx) return;
      const destination = createScoreOutput(ctx, latestVolumes.current.score);
      scheduleScoreNote(
        ctx,
        destination.input,
        { ...note, beats: 0.7 },
        ctx.currentTime + 0.01,
        120,
        0.7,
        instrument,
      );
      auditionTimer.current = setTimeout(stopAudition, 420);
    } catch (error) {
      if (auditionContext.current !== ctx) return;
      stopAudition();
      setAudioMessage(error instanceof Error ? error.message : '입력한 음을 재생하지 못했어요.');
    }
  };
  const stop = () => {
    if (playbackTimer.current !== null) clearInterval(playbackTimer.current);
    playbackTimer.current = null;
    playbackPosition.current = null;
    setPlaybackBeat(null);
    void context.current?.close();
    context.current = null;
    output.current = null;
    referenceOutput.current = null;
    setPlaying(false);
    setCursor(null);
    setAudioMessage('');
    audio.current?.pause();
    youtube.current?.pause();
  };
  const play = async (from = 0, loopEnd?: number, repeatAll = false) => {
    const looping = repeatAll || loopEnd !== undefined;
    stopAudition();
    if (context.current) {
      stop();
      return;
    }
    if (!loaded || audioLoading || sampleLoading || soundfontBusy || fileBusy) return;
    if (youtubeSource && referenceEnabled && score.referenceYoutubeId && !youtubeReady) {
      setAudioMessage(
        '유튜브 영상이 준비된 뒤 재생해주세요. 연결되지 않으면 영상 다시 연결을 눌러주세요.',
      );
      return;
    }
    const playbackParts = audibleScoreParts(score, part, playAll);
    if (
      !playbackParts.some((name) =>
        score.notes.some((note) => note.part === name && !note.blank && !note.rest),
      )
    ) {
      setAudioMessage('재생할 음표가 없거나 모든 파트가 음소거되어 있어요.');
      return;
    }
    const ensemblePlayback =
      playAll || scorePartStaves(score, part).length > 1
        ? ensemblePlaybackScore(score, playAll ? score.parts : scorePartStaves(score, part), part)
        : null;
    const playbackScore = ensemblePlayback?.score ?? score;
    const playbackFrom = ensemblePlayback ? ensemblePlayback.toShared(from) : from;
    const playbackEnd =
      loopEnd === undefined
        ? undefined
        : ensemblePlayback
          ? ensemblePlayback.toShared(loopEnd)
          : loopEnd;
    const { startBeat, endBeat, segments, toWritten } = scorePlaybackFrom(
      playbackScore,
      part,
      playbackFrom,
      playbackEnd,
    );
    if (startBeat >= endBeat) return;
    const ctx = new AudioContext();
    context.current = ctx;
    setPlaying(true);
    setAudioMessage('');
    audio.current?.pause();
    youtube.current?.pause();
    try {
      await ctx.resume();
      if (context.current !== ctx) return;
      setAudioMessage('악기 소리를 준비하고 있어요…');
      const samples = new Map(
        await Promise.all(
          playbackParts.map(async (name) => {
            const chosen = score.playbackInstruments?.[name];
            const instrument = isSoundfontInstrument(chosen)
              ? chosen
              : defaultSoundfontInstrument(name, scoreInstrument(score, name).id);
            const sample = instrumentSample?.enabled
              ? await prepareInstrumentSample(instrumentSample)
              : await prepareSoundfontInstrument(
                  instrument,
                  score.notes
                    .filter((n) => n.part === name && !n.rest && !n.blank)
                    .flatMap((n) => noteTones(n).map((t) => t.pitch)),
                );
            return [name, sample] as const;
          }),
        ),
      );
      if (context.current !== ctx) return;
      let backing: AudioBuffer | null = null;
      if (!youtubeSource && referenceAudio && referenceEnabled) {
        setAudioMessage('함께 재생할 음원 준비 중…');
        backing =
          decodedAudio.current?.file === referenceAudio
            ? decodedAudio.current.buffer
            : await ctx.decodeAudioData(await referenceAudio.arrayBuffer());
        if (context.current !== ctx) return;
        decodedAudio.current = { file: referenceAudio, buffer: backing };
      }
      if (context.current !== ctx) return;
      setAudioMessage('');
      const destination = createScoreOutput(ctx, latestVolumes.current.score);
      output.current = destination;
      const partOutputs = new Map(
        playbackParts.map((name) => {
          const gain = ctx.createGain();
          gain.gain.value = scorePartMix(score, name).volume;
          gain.connect(destination.input);
          return [name, gain] as const;
        }),
      );
      const startAt = ctx.currentTime + 0.04;
      if (backing) {
        referenceOutput.current = createScoreOutput(ctx, latestVolumes.current.reference);
        setAudioPosition(
          Math.max(0, Math.min(backing.duration, referenceOffset + (startBeat * 60) / score.bpm)),
        );
      }
      const backingOutput = referenceOutput.current;
      const updateClock = createScorePlaybackClock(
        startAt,
        ((endBeat - startBeat) * 60) / score.bpm,
        looping,
        (cycleAt) => {
          for (const name of playbackParts) {
            const passage = scorePlaybackFrom(playbackScore, name, playbackFrom, playbackEnd);
            for (const segment of passage.segments)
              scheduleScorePassage(
                ctx,
                partOutputs.get(name)!,
                playbackScore,
                name,
                cycleAt + (segment.offset * 60) / score.bpm,
                segment.startBeat,
                segment.endBeat,
                samples.get(name)!,
              );
          }
          for (const segment of segments) {
            const when = cycleAt + (segment.offset * 60) / score.bpm;
            if (backing && backingOutput)
              scheduleScoreBacking(
                ctx,
                backingOutput.input,
                backing,
                when,
                segment.startBeat,
                segment.endBeat,
                score.bpm,
                referenceOffset,
              );
          }
        },
      );
      updateClock(ctx.currentTime);
      const withYoutube = youtubeSource && referenceEnabled && !!score.referenceYoutubeId;
      if (withYoutube)
        youtube.current?.sync(
          referenceOffset + (startBeat * 60) / score.bpm,
          ctx.currentTime,
          true,
        );
      setPlaybackBeat(
        ensemblePlayback ? ensemblePlayback.toSelected(toWritten(startBeat)) : toWritten(startBeat),
      );
      setCursor(null);
      playbackPosition.current = () => {
        if (context.current !== ctx) return null;
        const duration = ((endBeat - startBeat) * 60) / score.bpm;
        const elapsed = Math.max(0, ctx.currentTime - startAt);
        if (!looping && elapsed >= duration) return null;
        const beat = scorePlaybackPosition(
          segments,
          ((looping ? elapsed % duration : elapsed) * score.bpm) / 60,
        );
        const written = toWritten(beat);
        return ensemblePlayback ? ensemblePlayback.toSelected(written) : written;
      };
      let lastPositionUpdate = -Infinity;
      playbackTimer.current = setInterval(() => {
        if (context.current !== ctx) return;
        const clock = updateClock(ctx.currentTime);
        if (clock.ended) {
          stop();
          return;
        }
        const elapsedBeats = (clock.elapsed * score.bpm) / 60;
        const beat = scorePlaybackPosition(segments, elapsedBeats);
        const writtenBeat = ensemblePlayback
          ? ensemblePlayback.toSelected(toWritten(beat))
          : toWritten(beat);
        const location = scoreMeasureAtBeat(score, part, writtenBeat);
        // React updates the toolbar/visible systems once per written beat. The
        // playhead reads the unrounded audio position directly every animation frame.
        setPlaybackBeat(location.start + Math.floor(location.offset));
        if (withYoutube) {
          const seconds = referenceOffset + (beat * 60) / score.bpm;
          youtube.current?.sync(seconds, ctx.currentTime);
        }
        // The reference-audio time label does not need a full editor render
        // at the audio scheduler's 40 ms cadence.
        if ((backing || withYoutube) && ctx.currentTime - lastPositionUpdate >= 0.25) {
          lastPositionUpdate = ctx.currentTime;
          setAudioPosition(
            Math.max(
              0,
              Math.min(backing?.duration ?? Infinity, referenceOffset + (beat * 60) / score.bpm),
            ),
          );
        }
      }, 40);
    } catch (error) {
      if (context.current === ctx) {
        stop();
        setAudioMessage(
          error instanceof Error
            ? error.message
            : '재생하지 못했어요. 녹음과 연결된 음원을 확인해주세요.',
        );
      }
    }
  };
  const exportXml = () => {
    try {
      downloadText(
        `${score.title}.musicxml`,
        scoreToMusicXml(score),
        'application/vnd.recordare.musicxml+xml',
      );
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '내보내기에 실패했습니다.');
    }
  };
  const loadDocument = (document: ScoreDocument) => {
    stop();
    pendingSave.current?.();
    audioLoadRequest.current++;
    decodedAudio.current = null;
    setAudioLoading(false);
    setReferenceAudio(document.referenceAudio);
    setAudioUrl(document.referenceAudio ? URL.createObjectURL(document.referenceAudio) : '');
    setAudioPosition(0);
    setInstrumentSample(document.instrumentSample);
    setRecordingSetup(false);
    setScore(document.score);
    setPart(document.score.parts[0]);
    setSelected(null);
    setHistory([]);
    setFuture([]);
    setClipboard([]);
    editGroup.current = null;
    setDocumentVersion((value) => value + 1);
  };
  const persistVersions = async (
    transform: (library: ScoreVersionLibrary) => ScoreVersionLibrary,
    quiet = false,
  ) => {
    if (!quiet) setBandSaving(true);
    setSaveFailed(false);
    const task = versionWrites.current
      .catch(() => {})
      .then(async () => {
        if (!libraryRef.current || loadedKey.current !== key || !alive.current) return null;
        const next = transform(libraryRef.current);
        const value = storeScoreVersionLibrary(next);
        if (bandStore) await bandStore.save(value);
        else await writeMedia(key, value, userId);
        if (!alive.current || loadedKey.current !== key) return null;
        libraryRef.current = next;
        setVersionLibrary(next);
        return next;
      });
    versionWrites.current = task;
    try {
      return await task;
    } catch (error) {
      if (alive.current && loadedKey.current === key) {
        setSaveFailed(true);
        setStatus(error instanceof Error ? error.message : '버전을 저장하지 못했어요.');
      }
      return null;
    } finally {
      if (!quiet && alive.current && loadedKey.current === key) setBandSaving(false);
    }
  };
  const saveCurrentVersion = async (apply = false) => {
    if (!loaded || bandSaving || fileBusy || previewApplied) return false;
    const document = { score, referenceAudio, instrumentSample };
    setStatus(apply ? '저장하고 연습에 적용 중…' : '버전 저장 중…');
    const next = await persistVersions((library) => {
      const reconciled = reconcileScoreVersions(library, document);
      const saved = bandDirty
        ? saveScoreVersion(reconciled, versionPart, versionId, document)
        : reconciled;
      return apply ? applyScoreVersion(saved, versionPart, versionId) : saved;
    });
    if (!next) return false;
    setSavedDocument(document);
    setStatus(apply ? '이 버전을 연습에 적용했어요.' : '버전 변경사항을 저장했어요.');
    return true;
  };
  const openVersion = (library: ScoreVersionLibrary, id: string, targetPart = versionPart) => {
    const preview = id === '@applied';
    // Discarding an unsaved part rename restores the original staff name as well.
    if (!library.applied.score.parts.includes(targetPart))
      targetPart =
        library.applied.score.parts[Math.max(0, score.parts.indexOf(targetPart))] ??
        library.applied.score.parts[0];
    const group = partVersionGroup(library, targetPart);
    const selectedId = preview ? group.appliedVersionId : id;
    const version = group.versions.find((item) => item.id === selectedId)!;
    const document = preview
      ? library.applied
      : {
          ...library.applied,
          score: replaceScorePart(library.applied.score, group.part, version.content),
        };
    pendingSave.current = null;
    loadDocument(document);
    setPart(targetPart);
    setSavedDocument(document);
    setVersionId(selectedId);
    setPreviewApplied(preview);
    setPendingVersion(null);
    setStatus(
      preview
        ? '파트별로 연습에 적용된 악보를 불러왔어요.'
        : group.part + ' 파트의 버전을 불러왔어요.',
    );
  };
  const requestVersion = (id: string, targetPart = part) => {
    if (!libraryRef.current || bandSaving || fileBusy || playing) return;
    if (bandDirty) {
      setPendingVersion({ id, part: targetPart });
      return;
    }
    openVersion(libraryRef.current, id, targetPart);
  };
  const requestPart = (name: string) => {
    if (!score.parts.includes(name)) {
      if (bandDirty) {
        setPendingVersion({ id: 'original', part: name });
        return;
      }
      setPart(name);
      setVersionId('original');
      setSelected(null);
      return;
    }
    if (previewApplied || scorePartOwner(score, name) === versionPart) {
      setPart(name);
      setSelected(null);
      return;
    }
    const group = workingLibrary?.parts.find((item) => item.part === scorePartOwner(score, name));
    if (group) requestVersion(group.appliedVersionId, name);
  };
  const finishVersionSwitch = async (action: 'save' | 'discard' | 'cancel') => {
    if (action === 'cancel') {
      setPendingVersion(null);
      return;
    }
    if (!pendingVersion || !libraryRef.current) return;
    if (action === 'save' && !(await saveCurrentVersion())) return;
    openVersion(libraryRef.current, pendingVersion.id, pendingVersion.part);
  };
  const createVersion = async (name: string, imported?: ScoreDocument, sourcePart?: string) => {
    if (!workingLibrary || !versionGroup) return false;
    scoreVersionName(versionGroup, name);
    const id = crypto.randomUUID();
    const document = { score, referenceAudio, instrumentSample };
    const content = imported
      ? importScorePart(score, versionPart, imported.score, sourcePart ?? imported.score.parts[0])
      : captureScorePart(score, versionPart);
    const next = await persistVersions((library) => {
      const reconciled = reconcileScoreVersions(library, document);
      const saved = bandDirty
        ? saveScoreVersion(reconciled, versionPart, versionId, document)
        : reconciled;
      return addScoreVersion(saved, versionPart, id, name, content);
    });
    if (!next) return false;
    setImportedVersion(null);
    openVersion(next, id);
    setStatus(versionPart + ' 파트에 새 버전을 저장했어요. 다른 파트는 그대로예요.');
    return true;
  };
  const preparePersonalCopy = async () => {
    setFileBusy(true);
    setCopyMessage('개인 악보를 불러오는 중…');
    setPersonalCopy(null);
    try {
      const value = await readMedia<StoredScore>(
        personalSource === 'song' ? `score/${workspaceId}/${entityId}` : 'score/personal',
        userId,
      );
      if (!alive.current) return;
      if (!value) {
        setCopyMessage('저장된 개인 악보가 없어요. 다른 항목이나 악보 파일을 선택해주세요.');
        return;
      }
      setPersonalCopy({
        score: scoreDocumentFromStored(value).score,
        referenceAudio: value.referenceAudio ?? null,
        instrumentSample: value.instrumentSample ?? null,
      });
      setCopyMessage('');
    } catch (error) {
      if (alive.current)
        setCopyMessage(error instanceof Error ? error.message : '개인 악보를 불러오지 못했어요.');
    } finally {
      if (alive.current) setFileBusy(false);
    }
  };
  return (
    <AppShell activeRoute={bandScore ? 'band-score-editor' : 'score-editor'} onNavigate={navigate}>
      <ScoreEditorViewport
        title={score.title}
        shared={bandScore}
        status={bandDirty ? '저장하지 않은 변경사항' : status}
        heading={
          <div className="score-editor-heading">
            <PageHeading>{bandScore ? '밴드 악보 편집' : '악보 편집'}</PageHeading>
            {song && (
              <ActionButton
                secondary
                compact
                onPress={() =>
                  navigate(bandScore ? 'practice' : 'song', {
                    id: song.id,
                    workspaceId,
                    songTab: 'resources',
                  })
                }
              >
                ← {song.title} {bandScore ? '연습실' : '자료'}로 돌아가기
              </ActionButton>
            )}
          </div>
        }
      >
        <ScoreFileActions
          shared={bandScore}
          key={`${userId}/${key}`}
          document={{ score, referenceAudio, instrumentSample }}
          part={part}
          disabled={
            !loaded ||
            playing ||
            audioLoading ||
            sampleLoading ||
            soundfontBusy ||
            bandSaving ||
            fileBusy
          }
          onLoad={setImportedVersion}
          importAsVersion
          onBusyChange={setFileBusy}
          header={
            <header className="score-file-header">
              <div className="score-file-heading">
                <div className="score-file-title">
                  <h2>저장 · 파일</h2>
                  <span role="status" data-error={saveFailed}>
                    {previewApplied ? '연습본 미리보기 · 읽기 전용' : status}
                    {bandDirty ? ' · 저장하지 않은 변경사항 있음' : ''}
                  </span>
                </div>
                <p>
                  {bandScore
                    ? '버전을 저장하면 연결한 음원과 녹음도 밴드 멤버에게 공유돼요.'
                    : '편집 중인 버전은 자동 저장돼요. 연습용 악보는 적용 버튼으로 바꿀 수 있어요.'}
                </p>
              </div>
              {(bandScore || versionLibrary) && (
                <div className="score-file-header-actions">
                  <button
                    type="button"
                    disabled={
                      bandSaving ||
                      fileBusy ||
                      playing ||
                      audioLoading ||
                      sampleLoading ||
                      soundfontBusy
                    }
                    onClick={() => {
                      if (
                        bandDirty &&
                        !window.confirm(
                          '내 변경사항을 버리고 최신 밴드 악보를 불러올까요? 필요한 작업은 먼저 파일로 저장해주세요.',
                        )
                      )
                        return;
                      setReload((value) => value + 1);
                    }}
                  >
                    최신 악보 불러오기
                  </button>

                  <button
                    type="button"
                    className="score-file-primary"
                    disabled={
                      !loaded ||
                      bandSaving ||
                      fileBusy ||
                      playing ||
                      audioLoading ||
                      sampleLoading ||
                      soundfontBusy
                    }
                    onClick={() => {
                      if (previewApplied) requestVersion(versionId);
                      else void saveCurrentVersion();
                    }}
                  >
                    {bandSaving ? '저장 중…' : previewApplied ? '이 버전 편집' : '변경사항 저장'}
                  </button>
                </div>
              )}
            </header>
          }
          versions={
            versionGroup && (
              <ScoreVersionControls
                library={versionGroup}
                selectedId={versionId}
                preview={previewApplied}
                dirty={bandDirty}
                disabled={
                  !loaded ||
                  playing ||
                  fileBusy ||
                  bandSaving ||
                  audioLoading ||
                  sampleLoading ||
                  soundfontBusy
                }
                pendingSwitch={pendingVersion !== null}
                imported={importedVersion}
                onSelect={requestVersion}
                onSwitch={finishVersionSwitch}
                onCreate={createVersion}
                onApply={() => void saveCurrentVersion(true)}
                onCancelImport={() => setImportedVersion(null)}
                onRename={async (name) => {
                  scoreVersionName(versionGroup, name, versionId);
                  const next = await persistVersions((library) =>
                    renameScoreVersion(
                      reconcileScoreVersions(library, { score, referenceAudio, instrumentSample }),
                      versionPart,
                      versionId,
                      name,
                    ),
                  );
                  if (next) setStatus('버전 이름을 변경했어요.');
                  return !!next;
                }}
                onDelete={async () => {
                  const next = await persistVersions((library) =>
                    removeScoreVersion(library, versionPart, versionId),
                  );
                  if (next) openVersion(next, partVersionGroup(next, versionPart).appliedVersionId);
                  return !!next;
                }}
              />
            )
          }
          personalImport={
            bandScore && (
              <ScoreFileMenu
                label="개인 악보"
                disabled={
                  !loaded ||
                  playing ||
                  fileBusy ||
                  bandSaving ||
                  audioLoading ||
                  sampleLoading ||
                  soundfontBusy
                }
              >
                <label>
                  가져올 개인 악보{' '}
                  <select
                    aria-label="가져올 개인 악보"
                    value={personalSource}
                    onChange={(event) => setPersonalSource(event.target.value)}
                    disabled={fileBusy || bandSaving}
                  >
                    <option value="song">이 곡의 개인 악보</option>
                    <option value="personal">개인 연습실의 나의 악보</option>
                  </select>
                </label>
                <button
                  type="button"
                  disabled={
                    !loaded ||
                    bandSaving ||
                    fileBusy ||
                    playing ||
                    audioLoading ||
                    sampleLoading ||
                    soundfontBusy
                  }
                  onClick={() => void preparePersonalCopy()}
                >
                  가져올 악보 확인
                </button>
              </ScoreFileMenu>
            )
          }
          importFeedback={
            bandScore && (
              <div className="score-personal-import-feedback">
                {copyMessage && <Meta accessibilityLiveRegion="polite">{copyMessage}</Meta>}
                {personalCopy && (
                  <>
                    <Meta>
                      ‘{personalCopy.score.title}’ · {personalCopy.score.parts.length}개 파트 ·{' '}
                      {personalCopy.score.notes.length}개 음표. 새 버전으로 추가하며 현재 악보는
                      유지됩니다. 개인 원본은 유지되며, 밴드에 저장할 때 연결된 녹음도 함께
                      공유됩니다.
                    </Meta>
                    <FlexRow wrap>
                      <ActionButton
                        disabled={bandSaving || fileBusy || playing}
                        onPress={() => {
                          setImportedVersion(personalCopy);
                          setPersonalCopy(null);
                          setCopyMessage('버전 이름을 지정해서 가져와주세요.');
                        }}
                      >
                        새 버전으로 가져오기
                      </ActionButton>
                      <ActionButton secondary onPress={() => setPersonalCopy(null)}>
                        취소
                      </ActionButton>
                    </FlexRow>
                  </>
                )}
              </div>
            )
          }
          xmlImport={
            <>
              <button
                type="button"
                disabled={
                  !loaded ||
                  playing ||
                  fileBusy ||
                  bandSaving ||
                  audioLoading ||
                  sampleLoading ||
                  soundfontBusy
                }
                onClick={() => xmlInput.current?.click()}
              >
                MusicXML 가져오기
              </button>
              <input
                type="file"
                ref={xmlInput}
                hidden
                accept=".musicxml,.xml"
                aria-label="MusicXML 파일 가져오기"
                disabled={
                  !loaded ||
                  playing ||
                  fileBusy ||
                  bandSaving ||
                  audioLoading ||
                  sampleLoading ||
                  soundfontBusy
                }
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = '';
                  if (!file) return;
                  if (file.size > 5 * 1024 * 1024) {
                    setStatus('5MB 이하 MusicXML 파일을 선택해주세요.');
                    return;
                  }
                  void file
                    .text()
                    .then((text) => {
                      if (!alive.current || loadedKey.current !== key) return;
                      try {
                        const imported = scoreFromMusicXml(text);
                        setImportedVersion({
                          score: imported,
                          referenceAudio: null,
                          instrumentSample: null,
                        });
                        setStatus('MusicXML을 새 버전으로 가져올 준비가 됐어요.');
                      } catch (error) {
                        setStatus(
                          error instanceof Error ? error.message : 'MusicXML 파일을 읽지 못했어요.',
                        );
                      }
                    })
                    .catch(() => setStatus('파일을 읽지 못했어요. 다시 선택해주세요.'));
                }}
              />
            </>
          }
          xmlExport={
            <button
              type="button"
              disabled={
                !loaded ||
                playing ||
                fileBusy ||
                bandSaving ||
                audioLoading ||
                sampleLoading ||
                soundfontBusy
              }
              onClick={exportXml}
            >
              MusicXML 저장
            </button>
          }
        />
        <div
          className="score-editor-host"
          inert={fileBusy || bandSaving}
          style={{ display: 'contents' }}
        >
          {audioMessage && (
            <p className="score-playback-status" role="status">
              {audioMessage}
            </p>
          )}
          <div className="score-band-tempo">
            {!!arrangement.bpm && song && (
              <ActionButton
                secondary
                compact
                disabled={!loaded || playing || fileBusy || bandSaving}
                onPress={() =>
                  edit({
                    ...score,
                    bpm: Math.max(30, Math.min(300, Number(arrangement.bpm) || 120)),
                  })
                }
              >
                밴드 기준 {arrangement.bpm} BPM 가져오기
              </ActionButton>
            )}
          </div>
          <GuitarTabEditor
            partControls={
              <ScoreParts
                attached
                readOnly={previewApplied}
                score={score}
                part={part}
                disabled={!loaded || playing || fileBusy || bandSaving}
                ensemble={ensemble}
                onEnsembleChange={setEnsemble}
                playAll={playAll}
                onPlayAllChange={setPlayAll}
                onSelect={(name) => {
                  stop();
                  const next = partStructureEdit.current;
                  partStructureEdit.current = null;
                  if (next && !next.parts.includes(part) && next.parts.includes(name)) {
                    // Part rename/deletion already owns this selection change.
                    setPart(name);
                    setSelected(null);
                    return;
                  }
                  requestPart(name);
                }}
                onEdit={(next) => {
                  partStructureEdit.current = next;
                  edit(next);
                }}
              />
            }
            onEnsembleChange={setEnsemble}
            settings={
              <>
                <div className="score-sound-settings" aria-label="음색과 내 악기 소리 설정">
                  <ScoreSoundfont
                    compact
                    part={scorePartOwner(score, part)}
                    instrument={playbackInstrument}
                    volume={volume}
                    disabled={!loaded || playing || fileBusy || sampleLoading || previewApplied}
                    usingRecording={recordingMode}
                    onBusyChange={setSoundfontBusy}
                    onChange={(value) => {
                      if (value === 'recording') {
                        setRecordingSetup(true);
                        if (instrumentSample)
                          setInstrumentSample({ ...instrumentSample, enabled: true });
                      } else {
                        setRecordingSetup(false);
                        edit({
                          ...score,
                          playbackInstruments: {
                            ...score.playbackInstruments,
                            ...Object.fromEntries(
                              scorePartStaves(score, part).map((name) => [name, value]),
                            ),
                          },
                        });
                        if (instrumentSample?.enabled)
                          setInstrumentSample({ ...instrumentSample, enabled: false });
                      }
                    }}
                  />

                  <div
                    className="score-recording-settings score-section-body"
                    hidden={!recordingMode}
                  >
                    <ScoreInstrumentSample
                      compact
                      shared={bandScore}
                      key={`${userId}/${key}/${documentVersion}`}
                      sample={instrumentSample}
                      disabled={
                        !recordingMode ||
                        !loaded ||
                        playing ||
                        fileBusy ||
                        soundfontBusy ||
                        previewApplied
                      }
                      defaultInstrument={playbackInstrument}
                      onChange={changeInstrumentSample}
                      onBusyChange={setSampleLoading}
                    />
                  </div>
                </div>
                <div className="score-tool-panel score-backing-panel">
                  <div className="score-backing-section-header">
                    <div>
                      <ScoreSettingsIcon />
                      <strong>반주</strong>
                      <div className="score-backing-row score-backing-mix score-backing-mix--header">
                        <label>
                          <input
                            type="checkbox"
                            checked={referenceEnabled}
                            disabled={
                              !loaded || !hasReference || playing || audioLoading || previewApplied
                            }
                            onChange={(event) =>
                              edit({ ...score, referenceAudioEnabled: event.target.checked })
                            }
                          />
                          악보와 함께 재생
                        </label>
                        <label>
                          음량
                          <input
                            type="range"
                            min="0"
                            max="1"
                            step="0.01"
                            aria-label="음원 재생 음량"
                            disabled={!loaded || !hasReference || audioLoading}
                            value={referenceVolume}
                            onChange={(event) => changeReferenceVolume(Number(event.target.value))}
                          />
                          <output>{Math.round(referenceVolume * 100)}%</output>
                        </label>
                      </div>
                    </div>
                    <ScoreSectionToggle
                      label="반주"
                      expanded={backingExpanded}
                      controls={backingBodyId}
                      onClick={() => setBackingExpanded(!backingExpanded)}
                    />
                  </div>
                  <div id={backingBodyId} className="score-section-body" hidden={!backingExpanded}>
                    <section
                      className={`score-backing score-backing--compact${youtubeSource && score.referenceYoutubeId ? ' score-backing--youtube' : ''}${!youtubeSource ? ' score-backing--file' : ''}`}
                      aria-label="음원과 함께 재생"
                    >
                      <div className="score-backing-row score-backing-header">
                        <label>
                          <select
                            aria-label="함께 재생할 음원 종류"
                            value={youtubeSource ? 'youtube' : 'file'}
                            disabled={!loaded || playing || audioLoading}
                            onChange={(event) => {
                              audio.current?.pause();
                              youtube.current?.pause();
                              setAudioPosition(0);
                              setAudioMessage('');
                              edit({
                                ...score,
                                referenceAudioSource: event.target.value as 'file' | 'youtube',
                                referenceAudioOffset: 0,
                                sync: {},
                              });
                            }}
                          >
                            <option value="file">음원 파일</option>
                            <option value="youtube">유튜브 영상</option>
                          </select>
                        </label>
                        {!youtubeSource && referenceAudio && (
                          <ScoreBackingDisclosure label="음원 반주 관리">
                            <button
                              disabled={playing || audioLoading}
                              onClick={() => {
                                audioLoadRequest.current++;
                                decodedAudio.current = null;
                                audio.current?.pause();
                                setReferenceAudio(null);
                                setAudioUrl('');
                                setAudioPosition(0);
                                setAudioMessage('');
                                setScore((current) => ({
                                  ...current,
                                  referenceAudioName: undefined,
                                  referenceAudioOffset: 0,
                                  referenceAudioVolume: undefined,
                                  referenceAudioEnabled: undefined,
                                  sync: {},
                                }));
                              }}
                            >
                              음원 연결 해제
                            </button>
                          </ScoreBackingDisclosure>
                        )}
                      </div>
                      {youtubeSource && (
                        <ScoreYouTubeBacking
                          compact
                          ref={youtube}
                          videoId={score.referenceYoutubeId}
                          suggestedUrl={song?.referenceUrl}
                          disabled={!loaded || playing || audioLoading || fileBusy}
                          volume={referenceVolume}
                          onReadyChange={setYoutubeReady}
                          onFailure={(message) => {
                            if (context.current) stop();
                            setAudioMessage(message);
                          }}
                          onTimeChange={!playing ? setAudioPosition : undefined}
                          onChange={(videoId) => {
                            youtube.current?.pause();
                            setAudioMessage('');
                            setAudioPosition(0);
                            edit({
                              ...score,
                              referenceYoutubeId: videoId,
                              referenceAudioSource: 'youtube',
                              referenceAudioEnabled: true,
                              referenceAudioOffset: 0,
                              sync: {},
                            });
                          }}
                        />
                      )}
                      {!youtubeSource && (
                        <ScoreAudioFile
                          key={audioUrl || 'empty'}
                          audioRef={audio}
                          src={audioUrl}
                          name={score.referenceAudioName || '연결된 음원'}
                          position={audioPosition}
                          volume={referenceVolume}
                          disabled={!loaded || playing || audioLoading || fileBusy || bandSaving}
                          loading={audioLoading}
                          scorePlaying={playing}
                          onFile={(file) => void loadAudio(file)}
                          onError={setAudioMessage}
                          onPositionChange={(time) => {
                            if (playing) return;
                            setAudioPosition(time);
                            const current = Object.entries(score.sync)
                              .filter(([, value]) => value <= time)
                              .sort((a, b) => b[1] - a[1])[0];
                            if (current) setCursor(current[0]);
                          }}
                        />
                      )}
                      <section className="score-backing-sync" aria-label="악보와 음원 맞추기">
                        <strong>악보와 음원 맞추기</strong>
                        <div className="score-backing-sync-targets">
                          <div>
                            <span>선택한 위치</span>
                            <strong>
                              {syncLocation
                                ? `${syncLocation.bar + 1}마디 · ${Number((syncLocation.offset + 1).toFixed(3))}박`
                                : '선택한 음표 없음'}
                            </strong>
                          </div>
                          <span aria-hidden="true">↔</span>
                          <div>
                            <span>음원 현재 위치</span>
                            <strong>
                              {hasReference && (!youtubeSource || youtubeReady)
                                ? `${Math.floor(audioPosition / 60)
                                    .toString()
                                    .padStart(
                                      2,
                                      '0',
                                    )}:${(audioPosition % 60).toFixed(2).padStart(5, '0')}`
                                : '—'}
                            </strong>
                          </div>
                          <button
                            type="button"
                            disabled={!!syncUnavailable || !loaded || fileBusy || bandSaving}
                            aria-describedby="score-sync-help"
                            onClick={() => {
                              if (!selected || !syncLocation) return;
                              const time = youtubeSource
                                ? (youtube.current?.currentTime() ?? audioPosition)
                                : (audio.current?.currentTime ?? audioPosition);
                              audio.current?.pause();
                              youtube.current?.pause();
                              setAudioPosition(time);
                              edit({
                                ...score,
                                sync: { ...score.sync, [selected]: time },
                                referenceAudioOffset: time - (syncBeat * 60) / score.bpm,
                              });
                            }}
                          >
                            현재 위치로 맞추기
                          </button>
                        </div>
                        <p id="score-sync-help">
                          {syncUnavailable ||
                            '음원을 듣고 기준 시점에 멈춘 뒤, 선택한 음표와 맞추세요.'}
                        </p>
                        {hasReference && (
                          <>
                            <div className="score-backing-sync-manual">
                              <label>
                                첫 박의 음원 위치
                                <input
                                  key={referenceOffset}
                                  type="number"
                                  min="-36000"
                                  max="36000"
                                  step="0.01"
                                  aria-label="악보 첫 박의 음원 위치"
                                  defaultValue={referenceOffset}
                                  disabled={playing || audioLoading}
                                  onBlur={(event) => {
                                    const raw = Number(event.currentTarget.value);
                                    const value =
                                      event.currentTarget.value.trim() && Number.isFinite(raw)
                                        ? Math.max(-36000, Math.min(36000, raw))
                                        : referenceOffset;
                                    event.currentTarget.value = String(value);
                                    if (value !== referenceOffset)
                                      edit({ ...score, referenceAudioOffset: value });
                                  }}
                                  onKeyDown={(event) => {
                                    if (event.key === 'Enter') event.currentTarget.blur();
                                  }}
                                />
                                초
                              </label>
                              <span
                                className="score-backing-sync-result"
                                role="status"
                                aria-label={
                                  referenceOffset < 0
                                    ? `악보 첫 박이 음원 시작보다 ${Math.abs(referenceOffset).toFixed(2)}초 앞서요.`
                                    : `악보 첫 박이 음원 ${referenceOffset.toFixed(2)}초에 맞춰졌어요.`
                                }
                              >
                                ✓ 적용됨
                              </span>
                            </div>
                          </>
                        )}
                      </section>
                      <footer className="score-backing-footer">
                        <span>Space로 함께 재생 · BPM은 음원 템포에 맞춰주세요.</span>
                        <ScoreBackingDisclosure label="반주 도움말" help>
                          <strong>악보와 음원 맞추기</strong>
                          <p>
                            시작 위치만 조정하므로 BPM은 음원 템포에 맞춰주세요. 전주가 5초면 첫
                            박의 음원 위치를 5초로 입력하세요. 음수가 되면 악보가 음원보다 먼저
                            시작합니다.
                          </p>
                          {youtubeSource && (
                            <p>
                              영상 로딩·광고·버퍼링에 따라 싱크가 어긋날 수 있어요. 관리 메뉴에서
                              영상을 다시 연결할 수 있습니다.
                            </p>
                          )}
                          <p>
                            {youtubeSource
                              ? '유튜브 영상은 주소와 시작 위치만 악보에 저장됩니다.'
                              : bandScore
                                ? '기준 음원도 밴드에 저장할 때 멤버들에게 공유됩니다.'
                                : '기준 음원도 비공개로 저장됩니다.'}
                          </p>
                        </ScoreBackingDisclosure>
                      </footer>
                    </section>
                  </div>
                </div>
              </>
            }
            readOnly={previewApplied}
            ensemble={ensemble}
            playAll={playAll}
            onPartSelect={(name, note) => {
              if (playing) return;
              if (scorePartOwner(score, name) === versionPart || previewApplied) {
                setPart(name);
                setSelected(note ?? null);
              } else requestPart(name);
            }}
            onAudition={audition}
            onEditComplete={finishEdit}
            clipboard={clipboard}
            onCopy={setClipboard}
            resetKey={`${scorePartOwner(score, part)}/${documentVersion}`}
            score={score}
            part={part}
            selected={selected}
            cursor={cursor}
            playbackBeat={playbackBeat}
            playbackPosition={playbackPosition}
            loaded={loaded && !audioLoading && !sampleLoading && !soundfontBusy}
            playing={playing}
            onSelect={setSelected}
            onEdit={edit}
            onPlay={play}
            volume={volume}
            onVolumeChange={changeVolume}
            backingPlayback={{
              enabled: referenceEnabled,
              disabled: !loaded || !hasReference || playing || audioLoading || previewApplied,
              onChange: (enabled) => edit({ ...score, referenceAudioEnabled: enabled }),
            }}
            canUndo={!!history.length}
            canRedo={!!future.length}
            onUndo={() => {
              editGroup.current = null;
              if (!history.length || playing) return;
              setFuture((all) => [score, ...all]);
              setScore(history[history.length - 1]);
              setHistory(history.slice(0, -1));
            }}
            onRedo={() => {
              editGroup.current = null;
              if (!future.length || playing) return;
              setHistory((all) => [...all, score]);
              setScore(future[0]);
              setFuture(future.slice(1));
            }}
          />
        </div>
      </ScoreEditorViewport>
    </AppShell>
  );
}
