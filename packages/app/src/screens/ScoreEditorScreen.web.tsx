import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppShell } from '../components/AppShell';
import {
  ActionButton,
  FlexRow,
  Heading,
  Meta,
  PageHeading,
  Pill,
  PillText,
  Surface,
} from '../components/ProductUI';
import { Input } from '../styles/layout';
import { readMedia, writeMedia } from '../lib/mediaStore';
import { downloadText } from '../lib/platformActions';
import { useMockAppState, useWorkspaceValue } from '../state/MockAppState';
import type { ScreenProps } from '../navigation';
import {
  scoreToMusicXml,
  cleanScoreConnections,
  scorePlaybackFrom,
  scorePlaybackPosition,
  renameScorePart,
  removeScorePart,
  SCORE_DIVISIONS,
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
import { GuitarTabEditor } from '../components/GuitarTabEditor.web';
import { ScoreEditorViewport } from '../components/ScoreEditorViewport.web';
import { scoreFromMusicXml } from '../lib/scoreImport.web';
import { useIdentity } from '../state/Identity';
import { ScoreInstrumentSample } from '../components/ScoreInstrumentSample.web';
import type { InstrumentSample } from '../lib/samplePitch';
import { prepareInstrumentSample } from '../lib/instrumentSample.web';
import { ScoreFileActions } from '../components/ScoreFileActions.web';
import type { ScoreDocument } from '../lib/scoreFile';
import { ScoreSoundfont } from '../components/ScoreSoundfont.web';
import { defaultSoundfontInstrument, isSoundfontInstrument } from '../lib/soundfontCatalog';
import { prepareSoundfontInstrument } from '../lib/soundfont.web';
import { createBandScoreStore, type StoredScore } from '../lib/bandScoreStore.web';
import { validateScoreDocument } from '../lib/scoreFile';
import { createScorePlaybackClock } from '../lib/scorePlaybackClock';
import {
  ScoreYouTubeBacking,
  type ScoreYouTubeHandle,
} from '../components/ScoreYouTubeBacking.web';
export function ScoreEditorScreen({
  navigate,
  entityId,
  bandScore = false,
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
  const bandDirty =
    bandScore &&
    loaded &&
    savedDocument !== null &&
    (score !== savedDocument.score ||
      referenceAudio !== savedDocument.referenceAudio ||
      instrumentSample !== savedDocument.instrumentSample);
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
  const audioFileInput = useRef<HTMLInputElement>(null);
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
  const [partName, setPartName] = useState('');
  const [partMessage, setPartMessage] = useState('');
  const [confirmPartDelete, setConfirmPartDelete] = useState(false);
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
    void (bandStore ? bandStore.load() : readMedia<StoredScore>(key, userId))
      .then((value) => {
        if (active) {
          setInstrumentSample(value?.instrumentSample ?? null);
          setReferenceAudio(value?.referenceAudio ?? null);
          setAudioUrl(value?.referenceAudio ? URL.createObjectURL(value.referenceAudio) : '');
          setAudioPosition(0);
          let nextScore: Score;
          if (value) {
            // Keep attachments out of undo snapshots and imported score metadata.
            const document = { ...value };
            delete document.referenceAudio;
            delete document.instrumentSample;
            nextScore = cleanScoreConnections(document);
            setPart(value.parts[0] ?? 'Guitar');
          } else
            nextScore = {
              title: defaultTitle.current,
              bpm: 120,
              notes: [],
              parts: ['Guitar', 'Vocal', 'Bass', 'Drums'],
              sync: {},
            };
          setScore(nextScore);
          setSavedDocument({
            score: nextScore,
            referenceAudio: value?.referenceAudio ?? null,
            instrumentSample: value?.instrumentSample ?? null,
          });
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
  }, [key, userId, bandStore, bandScore, reload]);
  useEffect(() => {
    const flush = () => pendingSave.current?.();
    window.addEventListener('pagehide', flush);
    return () => {
      flush();
      window.removeEventListener('pagehide', flush);
    };
  }, [key, userId]);
  useEffect(() => {
    if (bandScore || !loaded || loadedKey.current !== key) return;
    let active = true;
    let started = false;
    setSaveFailed(false);
    setStatus('저장 중…');
    const save = () => {
      if (started) return;
      started = true;
      if (pendingSave.current === save) pendingSave.current = null;
      void writeMedia(key, { ...score, referenceAudio, instrumentSample }, userId)
        .then(() => {
          if (active) setStatus('자동 저장됨');
        })
        .catch((error: unknown) => {
          if (active) {
            setSaveFailed(true);
            setStatus(
              error instanceof Error ? error.message : '저장 실패 · 내보내기로 보관해주세요.',
            );
          }
        });
    };
    pendingSave.current = save;
    const timer = setTimeout(save, 300);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [key, score, loaded, referenceAudio, instrumentSample, userId, bandScore]);
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
    if (!loaded || playing || fileBusy) return;
    if (!group || editGroup.current !== group) setHistory((all) => [...all.slice(-49), score]);
    editGroup.current = group ?? null;
    setFuture([]);
    setScore(cleanScoreConnections(next));
  };
  const visible = score.notes.filter((note) => note.part === part);
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
  const play = async (from = 0, loopEnd?: number) => {
    stopAudition();
    if (context.current) {
      stop();
      return;
    }
    if (!loaded || audioLoading || sampleLoading || soundfontBusy || fileBusy || !visible.length)
      return;
    if (youtubeSource && referenceEnabled && score.referenceYoutubeId && !youtubeReady) {
      setAudioMessage(
        '유튜브 영상이 준비된 뒤 재생해주세요. 연결되지 않으면 영상 다시 연결을 눌러주세요.',
      );
      return;
    }
    const { startBeat, endBeat, events, segments, toWritten } = scorePlaybackFrom(
      score,
      part,
      from,
      loopEnd,
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
      const sample = instrumentSample?.enabled
        ? await prepareInstrumentSample(instrumentSample)
        : await prepareSoundfontInstrument(
            playbackInstrument,
            score.notes
              .filter((note) => note.part === part && !note.rest && !note.blank)
              .flatMap((note) => noteTones(note).map((tone) => tone.pitch)),
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
        loopEnd !== undefined,
        (cycleAt) => {
          for (const segment of segments) {
            const when = cycleAt + (segment.offset * 60) / score.bpm;
            scheduleScorePassage(
              ctx,
              destination.input,
              score,
              part,
              when,
              segment.startBeat,
              segment.endBeat,
              sample,
            );
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
      setPlaybackBeat(toWritten(startBeat));
      setCursor(events[0]?.note.id ?? null);
      playbackTimer.current = setInterval(() => {
        if (context.current !== ctx) return;
        const clock = updateClock(ctx.currentTime);
        if (clock.ended) {
          stop();
          return;
        }
        const elapsedBeats = (clock.elapsed * score.bpm) / 60;
        const beat = scorePlaybackPosition(segments, elapsedBeats);
        setPlaybackBeat(Math.floor(toWritten(beat) * SCORE_DIVISIONS) / SCORE_DIVISIONS);
        const active = events.find(
          (event) => elapsedBeats >= event.offset && elapsedBeats < event.offset + event.beats,
        );
        setCursor(active?.note.id ?? null);
        if (withYoutube) {
          const seconds = referenceOffset + (beat * 60) / score.bpm;
          youtube.current?.sync(seconds, ctx.currentTime);
          setAudioPosition(Math.max(0, seconds));
        }
        if (backing)
          setAudioPosition(
            Math.max(0, Math.min(backing.duration, referenceOffset + (beat * 60) / score.bpm)),
          );
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
    setScore(document.score);
    setPart(document.score.parts[0]);
    setSelected(null);
    setHistory([]);
    setFuture([]);
    setClipboard([]);
    editGroup.current = null;
    setPartName('');
    setPartMessage('');
    setConfirmPartDelete(false);
    setDocumentVersion((value) => value + 1);
  };
  const saveBand = async () => {
    if (!bandStore || !loaded || bandSaving || fileBusy) return;
    const document = { score, referenceAudio, instrumentSample };
    setBandSaving(true);
    setSaveFailed(false);
    setStatus('밴드에 저장 중…');
    try {
      await bandStore.save({ ...score, referenceAudio, instrumentSample });
      if (!alive.current) return;
      setSavedDocument(document);
      setCopyMessage('');
      setStatus('밴드에 저장됨');
    } catch (error) {
      if (!alive.current) return;
      setSaveFailed(true);
      setStatus(
        error instanceof Error
          ? error.message
          : '저장하지 못했어요. 파일로 보관한 뒤 다시 시도해주세요.',
      );
    } finally {
      if (alive.current) setBandSaving(false);
    }
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
        score: validateScoreDocument(value),
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
      <ScoreEditorViewport>
        <FlexRow wrap>
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
        </FlexRow>
        <Meta
          accessibilityLiveRegion="polite"
          style={saveFailed ? { color: '#be3b4b' } : undefined}
        >
          {bandScore ? '밴드 공용 악보' : '개인 악보'} · {status}
          {bandDirty ? ' · 저장하지 않은 변경사항 있음' : ''} · TAB의 줄을 선택하고 숫자로 프렛을
          입력하세요. 같은 박의 다른 줄에 입력하면 코드가 됩니다.
        </Meta>
        {bandScore && (
          <Surface>
            <Meta>
              모든 밴드 멤버가 열람·편집·재생할 수 있어요. ‘밴드에 저장’을 누르면 연결한 음원과 악기
              녹음도 멤버들에게 공유됩니다.
            </Meta>
            <FlexRow wrap>
              <ActionButton
                disabled={
                  !loaded ||
                  bandSaving ||
                  fileBusy ||
                  playing ||
                  audioLoading ||
                  sampleLoading ||
                  soundfontBusy
                }
                onPress={() => void saveBand()}
              >
                {bandSaving ? '저장 중…' : '밴드에 저장'}
              </ActionButton>
              <ActionButton
                secondary
                disabled={
                  bandSaving ||
                  fileBusy ||
                  playing ||
                  audioLoading ||
                  sampleLoading ||
                  soundfontBusy
                }
                onPress={() => {
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
              </ActionButton>
            </FlexRow>
            <FlexRow wrap>
              <label>
                개인 악보 가져오기{' '}
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
              <ActionButton
                secondary
                disabled={
                  !loaded ||
                  bandSaving ||
                  fileBusy ||
                  playing ||
                  audioLoading ||
                  sampleLoading ||
                  soundfontBusy
                }
                onPress={() => void preparePersonalCopy()}
              >
                가져올 악보 확인
              </ActionButton>
            </FlexRow>
            {copyMessage && <Meta accessibilityLiveRegion="polite">{copyMessage}</Meta>}
            {personalCopy && (
              <>
                <Meta>
                  ‘{personalCopy.score.title}’ · {personalCopy.score.parts.length}개 파트 ·{' '}
                  {personalCopy.score.notes.length}개 음표. 현재 편집 내용을 이 악보로 바꿉니다.
                  개인 원본은 유지되며, 밴드에 저장할 때 연결된 녹음도 함께 공유됩니다.
                </Meta>
                <FlexRow wrap>
                  <ActionButton
                    disabled={bandSaving || fileBusy || playing}
                    onPress={() => {
                      loadDocument(personalCopy);
                      setPersonalCopy(null);
                      setCopyMessage('복사했어요. 확인 후 밴드에 저장해주세요.');
                    }}
                  >
                    현재 악보에 복사 적용
                  </ActionButton>
                  <ActionButton secondary onPress={() => setPersonalCopy(null)}>
                    취소
                  </ActionButton>
                </FlexRow>
              </>
            )}
          </Surface>
        )}
        <ScoreFileActions
          shared={bandScore}
          key={`${userId}/${key}`}
          document={{ score, referenceAudio, instrumentSample }}
          part={part}
          disabled={
            !loaded || playing || audioLoading || sampleLoading || soundfontBusy || bandSaving
          }
          onLoad={loadDocument}
          onBusyChange={setFileBusy}
        />
        <div
          className="score-editor-host"
          inert={fileBusy || bandSaving}
          style={{ display: 'contents' }}
        >
          <FlexRow wrap>
            {score.parts.map((name) => (
              <Pill
                key={name}
                accessibilityRole="button"
                accessibilityState={{ selected: part === name }}
                active={part === name}
                onPress={() => {
                  stop();
                  setPart(name);
                  setSelected(null);
                }}
              >
                <PillText active={part === name}>{name}</PillText>
              </Pill>
            ))}
          </FlexRow>
          <ScoreSoundfont
            part={part}
            instrument={playbackInstrument}
            volume={volume}
            disabled={!loaded || playing || fileBusy || sampleLoading}
            usingRecording={!!instrumentSample?.enabled}
            hasRecording={!!instrumentSample}
            onBusyChange={setSoundfontBusy}
            onChange={(value) => {
              if (value === 'recording') {
                if (instrumentSample) setInstrumentSample({ ...instrumentSample, enabled: true });
              } else {
                edit({
                  ...score,
                  playbackInstruments: { ...score.playbackInstruments, [part]: value },
                });
                if (instrumentSample?.enabled)
                  setInstrumentSample({ ...instrumentSample, enabled: false });
              }
            }}
          />
          <ScoreInstrumentSample
            shared={bandScore}
            key={`${userId}/${key}/${documentVersion}`}
            sample={instrumentSample}
            disabled={!loaded || playing || fileBusy || soundfontBusy}
            defaultInstrument={playbackInstrument}
            onChange={setInstrumentSample}
            onBusyChange={setSampleLoading}
          />
          <section
            className={`score-backing${youtubeSource && score.referenceYoutubeId ? ' score-backing--youtube' : ''}`}
            aria-label="음원과 함께 재생"
          >
            <div className="score-backing-row">
              <strong>함께 재생할 음원</strong>
              <label>
                반주 종류
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
              {!youtubeSource && (
                <>
                  <button
                    type="button"
                    disabled={!loaded || playing || audioLoading}
                    onClick={() => audioFileInput.current?.click()}
                  >
                    {audioLoading ? '음원 준비 중…' : referenceAudio ? '음원 교체' : '＋ 음원 추가'}
                  </button>
                  <input
                    ref={audioFileInput}
                    type="file"
                    hidden
                    accept="audio/*,.mp3,.wav,.m4a,.flac,.ogg"
                    aria-label="함께 재생할 음원 파일"
                    disabled={!loaded || playing || audioLoading}
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      event.target.value = '';
                      if (file) void loadAudio(file);
                    }}
                  />
                  <span className="score-backing-name">
                    {referenceAudio
                      ? score.referenceAudioName || '연결된 음원'
                      : 'MP3, WAV 등 · 최대 100MB'}
                  </span>
                  {referenceAudio && (
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
                  )}
                </>
              )}
            </div>
            {youtubeSource && (
              <ScoreYouTubeBacking
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
                onAlign={(seconds) =>
                  edit({ ...score, referenceAudioOffset: Number(seconds.toFixed(2)) })
                }
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
            {hasReference && (
              <>
                <div className="score-backing-row">
                  <label>
                    <input
                      type="checkbox"
                      checked={referenceEnabled}
                      disabled={playing || audioLoading}
                      onChange={(event) =>
                        edit({ ...score, referenceAudioEnabled: event.target.checked })
                      }
                    />
                    악보와 함께 재생
                  </label>
                  <label>
                    음원 음량
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.01"
                      aria-label="음원 재생 음량"
                      value={referenceVolume}
                      onChange={(event) => changeReferenceVolume(Number(event.target.value))}
                    />
                  </label>
                  <output>{Math.round(referenceVolume * 100)}%</output>
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
                  {playing && referenceEnabled && (
                    <span role="status">음원 {audioPosition.toFixed(2)}초</span>
                  )}
                </div>
                <p>
                  아래 악보의 재생 버튼이나 Space로 함께 재생합니다. 전주가 5초면 첫 박의 음원
                  위치를 5초로 맞추세요. 음원 속도는 그대로이므로 BPM을 음원 템포에 맞춰주세요.
                </p>
              </>
            )}
            {audioMessage && <p role="status">{audioMessage}</p>}
          </section>
          <GuitarTabEditor
            onAudition={audition}
            onEditComplete={finishEdit}
            clipboard={clipboard}
            onCopy={setClipboard}
            key={`${part}/${documentVersion}`}
            score={score}
            part={part}
            selected={selected}
            cursor={cursor}
            playbackBeat={playbackBeat}
            loaded={loaded && !audioLoading && !sampleLoading && !soundfontBusy}
            playing={playing}
            onSelect={setSelected}
            onEdit={edit}
            onPlay={play}
            volume={volume}
            onVolumeChange={changeVolume}
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
          <details className="score-advanced">
            <summary>악보 설정 · 파트 관리 · MusicXML 가져오기 / 내보내기</summary>
            <Surface>
              <FlexRow wrap>
                {!!arrangement.bpm && song && (
                  <ActionButton
                    secondary
                    compact
                    disabled={!loaded || playing}
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
                <ActionButton
                  secondary
                  disabled={!history.length || playing}
                  onPress={() => {
                    editGroup.current = null;
                    setFuture((all) => [score, ...all]);
                    setScore(history[history.length - 1]);
                    setHistory(history.slice(0, -1));
                  }}
                >
                  되돌리기
                </ActionButton>
                <ActionButton
                  secondary
                  disabled={!future.length || playing}
                  onPress={() => {
                    editGroup.current = null;
                    setHistory((all) => [...all, score]);
                    setScore(future[0]);
                    setFuture(future.slice(1));
                  }}
                >
                  다시 실행
                </ActionButton>
                <ActionButton secondary disabled={!loaded} onPress={exportXml}>
                  MusicXML 내보내기
                </ActionButton>
                <ActionButton
                  secondary
                  disabled={!loaded || playing}
                  onPress={() => window.print()}
                >
                  현재 화면 인쇄
                </ActionButton>
              </FlexRow>
              <label>
                MusicXML 가져오기{' '}
                <input
                  type="file"
                  accept=".musicxml,.xml"
                  aria-label="MusicXML 가져오기"
                  disabled={!loaded || playing}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
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
                          edit(imported);
                          setPart(imported.parts[0]);
                          setSelected(null);
                        } catch (error) {
                          setStatus(
                            error instanceof Error
                              ? error.message
                              : 'MusicXML 파일을 읽지 못했어요.',
                          );
                        }
                      })
                      .catch(() => setStatus('파일을 읽지 못했어요. 다시 선택해주세요.'));
                    event.target.value = '';
                  }}
                />
              </label>
            </Surface>
            <Surface>
              <FlexRow wrap>
                {score.parts.map((name) => (
                  <Pill
                    key={name}
                    accessibilityRole="button"
                    accessibilityState={{ selected: part === name }}
                    active={part === name}
                    onPress={() => {
                      stop();
                      setPart(name);
                      setSelected(null);
                      setConfirmPartDelete(false);
                      setPartName('');
                    }}
                  >
                    <PillText active={part === name}>{name}</PillText>
                  </Pill>
                ))}
              </FlexRow>
              <FlexRow wrap>
                <Input
                  accessibilityLabel="파트 이름"
                  placeholder="예: 리드 기타"
                  value={partName}
                  maxLength={40}
                  editable={loaded && !playing}
                  onChangeText={setPartName}
                  style={{ minWidth: 160, flex: 1 }}
                />
                <ActionButton
                  secondary
                  disabled={!loaded || playing || !partName.trim()}
                  onPress={() => {
                    try {
                      const next = renameScorePart(score, null, partName);
                      edit(next);
                      setPart(partName.trim());
                      setPartName('');
                      setPartMessage('');
                      setConfirmPartDelete(false);
                    } catch (error) {
                      setPartMessage((error as Error).message);
                    }
                  }}
                >
                  파트 추가
                </ActionButton>
                <ActionButton
                  secondary
                  disabled={!loaded || playing || !partName.trim()}
                  onPress={() => {
                    try {
                      edit(renameScorePart(score, part, partName));
                      setPart(partName.trim());
                      setPartName('');
                      setPartMessage('');
                    } catch (error) {
                      setPartMessage((error as Error).message);
                    }
                  }}
                >
                  이름 변경
                </ActionButton>
                <ActionButton
                  secondary
                  danger
                  disabled={!loaded || playing || score.parts.length <= 1}
                  onPress={() => setConfirmPartDelete(!confirmPartDelete)}
                >
                  파트 삭제
                </ActionButton>
              </FlexRow>
              {!!partMessage && <Meta accessibilityRole="alert">{partMessage}</Meta>}
              {confirmPartDelete && (
                <FlexRow wrap>
                  <Meta>
                    {part}의 음표 {visible.length}개도 삭제됩니다. 되돌리기로 복원할 수 있어요.
                  </Meta>
                  <ActionButton
                    danger
                    disabled={!loaded || playing}
                    onPress={() => {
                      edit(removeScorePart(score, part));
                      setConfirmPartDelete(false);
                    }}
                  >
                    삭제 적용
                  </ActionButton>
                  <ActionButton secondary onPress={() => setConfirmPartDelete(false)}>
                    취소
                  </ActionButton>
                </FlexRow>
              )}
            </Surface>
          </details>
          <details className="score-advanced">
            <summary>기준 음원과 악보 싱크</summary>
            <Surface>
              <Heading>기준 음원과 싱크</Heading>
              <Meta>상단에서 추가한 음원을 미리 듣고 악보의 시작 위치를 맞출 수 있어요.</Meta>
              {audioUrl && !youtubeSource ? (
                <audio
                  ref={audio}
                  controls={!playing}
                  src={audioUrl}
                  onPlay={(event) => {
                    if (playing) event.currentTarget.pause();
                  }}
                  onTimeUpdate={(event) => {
                    if (playing) return;
                    const time = event.currentTarget.currentTime;
                    setAudioPosition(time);
                    const current = Object.entries(score.sync)
                      .filter(([, value]) => value <= time)
                      .sort((a, b) => b[1] - a[1])[0];
                    if (current) setCursor(current[0]);
                  }}
                  style={{ width: '100%' }}
                />
              ) : null}
              <Meta>
                {audioPosition.toFixed(2)}초 · 음표를 선택해 현재 음원 위치와 연결하세요.
                {youtubeSource
                  ? ' 유튜브 영상은 주소와 시작 위치만 악보에 저장됩니다.'
                  : bandScore
                    ? ' 기준 음원도 밴드에 저장할 때 멤버들에게 공유됩니다.'
                    : ' 기준 음원도 비공개로 저장됩니다.'}
              </Meta>
              <ActionButton
                secondary
                disabled={
                  !selected ||
                  !hasReference ||
                  (youtubeSource && !youtubeReady) ||
                  playing ||
                  audioLoading
                }
                onPress={() => {
                  const index = visible.findIndex((item) => item.id === selected);
                  if (index >= 0 && selected) {
                    const beat = visible.slice(0, index).reduce((sum, note) => sum + note.beats, 0);
                    const time = youtubeSource
                      ? (youtube.current?.currentTime() ?? audioPosition)
                      : (audio.current?.currentTime ?? audioPosition);
                    edit({
                      ...score,
                      sync: { ...score.sync, [selected]: time },
                      referenceAudioOffset: time - (beat * 60) / score.bpm,
                    });
                  }
                }}
              >
                선택 음표와 음원 위치 맞추기
              </ActionButton>
              <ActionButton
                secondary
                onPress={() =>
                  navigate(
                    bandScore ? 'practice' : 'personal-practice',
                    entityId ? { id: entityId, workspaceId } : undefined,
                  )
                }
              >
                연습실로 이동
              </ActionButton>
            </Surface>
          </details>
        </div>
      </ScoreEditorViewport>
    </AppShell>
  );
}
