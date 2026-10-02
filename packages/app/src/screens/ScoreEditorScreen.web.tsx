import { useCallback, useEffect, useRef, useState } from 'react';
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
  renameScorePart,
  removeScorePart,
  MIN_SCORE_BEATS,
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
export function ScoreEditorScreen({ navigate, entityId }: ScreenProps) {
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
  const key = `score/${entityId ? workspaceId + '/' + entityId : 'personal'}`;
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
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const alive = useRef(true);
  const audio = useRef<HTMLAudioElement | null>(null);
  const [audioUrl, setAudioUrl] = useState('');
  const [referenceAudio, setReferenceAudio] = useState<Blob | null>(null);
  const [instrumentSample, setInstrumentSample] = useState<InstrumentSample | null>(null);
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
    void readMedia<Score & { referenceAudio?: Blob; instrumentSample?: InstrumentSample }>(
      key,
      userId,
    )
      .then((value) => {
        if (active) {
          setInstrumentSample(value?.instrumentSample ?? null);
          setReferenceAudio(value?.referenceAudio ?? null);
          setAudioUrl(value?.referenceAudio ? URL.createObjectURL(value.referenceAudio) : '');
          setAudioPosition(0);
          if (value) {
            // Keep attachments out of undo snapshots and imported score metadata.
            const document = { ...value };
            delete document.referenceAudio;
            delete document.instrumentSample;
            setScore(cleanScoreConnections(document));
            setPart(value.parts[0] ?? 'Guitar');
          } else
            setScore({
              title: defaultTitle.current,
              bpm: 120,
              notes: [],
              parts: ['Guitar', 'Vocal', 'Bass', 'Drums'],
              sync: {},
            });
          loadedKey.current = key;
          setLoaded(true);
          setStatus('저장됨');
        }
      })
      .catch(() => {
        if (active) setStatus('악보를 불러오지 못했습니다. 새로고침해주세요.');
      });
    return () => {
      active = false;
      alive.current = false;
      timers.current.forEach(clearTimeout);
      if (playbackTimer.current !== null) clearInterval(playbackTimer.current);
      void context.current?.close();
      context.current = null;
    };
  }, [key, userId]);
  useEffect(() => {
    const flush = () => pendingSave.current?.();
    window.addEventListener('pagehide', flush);
    return () => {
      flush();
      window.removeEventListener('pagehide', flush);
    };
  }, [key, userId]);
  useEffect(() => {
    if (!loaded || loadedKey.current !== key) return;
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
  }, [key, score, loaded, referenceAudio, instrumentSample, userId]);
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
    timers.current.forEach(clearTimeout);
    timers.current = [];
    void context.current?.close();
    context.current = null;
    output.current = null;
    referenceOutput.current = null;
    setPlaying(false);
    setCursor(null);
    setAudioMessage('');
    audio.current?.pause();
  };
  const play = async (from = 0) => {
    stopAudition();
    if (context.current) {
      stop();
      return;
    }
    if (!loaded || audioLoading || sampleLoading || soundfontBusy || fileBusy || !visible.length)
      return;
    const { startBeat, endBeat, events } = scorePlaybackFrom(score, part, from);
    if (startBeat >= endBeat) return;
    const ctx = new AudioContext();
    context.current = ctx;
    setPlaying(true);
    setAudioMessage('');
    audio.current?.pause();
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
      if (referenceAudio && referenceEnabled) {
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
        scheduleScoreBacking(
          ctx,
          referenceOutput.current.input,
          backing,
          startAt,
          startBeat,
          endBeat,
          score.bpm,
          referenceOffset,
        );
        setAudioPosition(
          Math.max(0, Math.min(backing.duration, referenceOffset + (startBeat * 60) / score.bpm)),
        );
      }
      setPlaybackBeat(startBeat);
      playbackTimer.current = setInterval(() => {
        const beat = Math.min(
          endBeat - MIN_SCORE_BEATS,
          startBeat + Math.max(0, ((ctx.currentTime - startAt) * score.bpm) / 60),
        );
        setPlaybackBeat(Math.floor(beat * SCORE_DIVISIONS) / SCORE_DIVISIONS);
        if (backing)
          setAudioPosition(
            Math.max(
              0,
              Math.min(
                backing.duration,
                referenceOffset +
                  (startBeat * 60) / score.bpm +
                  Math.max(0, ctx.currentTime - startAt),
              ),
            ),
          );
        if (ctx.currentTime >= startAt + ((endBeat - startBeat) * 60) / score.bpm) stop();
      }, 40);
      scheduleScorePassage(
        ctx,
        destination.input,
        score,
        part,
        startAt,
        startBeat,
        endBeat,
        sample,
      );
      for (const { note: item, offset } of events) {
        const elapsed = (offset * 60) / score.bpm;
        timers.current.push(setTimeout(() => setCursor(item.id), (elapsed + 0.04) * 1000));
      }
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
  return (
    <AppShell activeRoute="score-editor" onNavigate={navigate}>
      <FlexRow wrap>
        <PageHeading>악보 편집</PageHeading>
        {song && (
          <ActionButton
            secondary
            compact
            onPress={() => navigate('song', { id: song.id, workspaceId, songTab: 'resources' })}
          >
            ← {song.title} 자료로 돌아가기
          </ActionButton>
        )}
      </FlexRow>
      <Meta accessibilityLiveRegion="polite" style={saveFailed ? { color: '#be3b4b' } : undefined}>
        개인 악보 · {status} · TAB의 줄을 선택하고 숫자로 프렛을 입력하세요. 같은 박의 다른 줄에
        입력하면 코드가 됩니다.
      </Meta>
      <ScoreFileActions
        key={`${userId}/${key}`}
        document={{ score, referenceAudio, instrumentSample }}
        part={part}
        disabled={!loaded || playing || audioLoading || sampleLoading || soundfontBusy}
        onLoad={loadDocument}
        onBusyChange={setFileBusy}
      />
      <div inert={fileBusy} style={{ display: 'contents' }}>
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
          key={`${userId}/${key}/${documentVersion}`}
          sample={instrumentSample}
          disabled={!loaded || playing || fileBusy || soundfontBusy}
          defaultInstrument={playbackInstrument}
          onChange={setInstrumentSample}
          onBusyChange={setSampleLoading}
        />
        <section className="score-backing" aria-label="음원과 함께 재생">
          <div className="score-backing-row">
            <strong>함께 재생할 음원</strong>
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
          </div>
          {referenceAudio && (
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
                아래 악보의 재생 버튼이나 Space로 함께 재생합니다. 전주가 5초면 첫 박의 음원 위치를
                5초로 맞추세요. 음원 속도는 그대로이므로 BPM을 음원 템포에 맞춰주세요.
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
            <Input
              accessibilityLabel="악보 제목"
              value={score.title}
              editable={loaded && !playing}
              onChangeText={(title) => edit({ ...score, title }, 'title')}
              onBlur={finishEdit}
            />
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
              <ActionButton secondary disabled={!loaded || playing} onPress={() => window.print()}>
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
                          error instanceof Error ? error.message : 'MusicXML 파일을 읽지 못했어요.',
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
            {audioUrl ? (
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
              {audioPosition.toFixed(2)}초 · 음표를 선택해 현재 음원 위치와 연결하세요. 기준 음원도
              비공개로 저장됩니다.
            </Meta>
            <ActionButton
              secondary
              disabled={!selected || !audioUrl || playing || audioLoading}
              onPress={() => {
                const index = visible.findIndex((item) => item.id === selected);
                if (index >= 0 && selected) {
                  const beat = visible.slice(0, index).reduce((sum, note) => sum + note.beats, 0);
                  const time = audio.current?.currentTime ?? audioPosition;
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
                navigate('personal-practice', entityId ? { id: entityId, workspaceId } : undefined)
              }
            >
              연습실로 이동
            </ActionButton>
          </Surface>
        </details>
      </div>
    </AppShell>
  );
}
