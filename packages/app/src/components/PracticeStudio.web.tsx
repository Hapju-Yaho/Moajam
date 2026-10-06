import { MidiClipEditor } from './MidiClipEditor.web';
import { parseMidi, encodeMidi, cropMidi, isMidiFile, type MidiSequence } from '../lib/midi';
import { renderMidi } from '../lib/midiAudio.web';
import { useLocalMetronome } from '../state/localMetronome';
import { sharedPracticeSettings } from '../lib/sharedPracticeSettings';
import { ScheduleDialog } from './ScheduleDialog';
import {
  identifyAudio,
  mergePractice,
  samePractice,
  type PracticeDocument,
} from '../lib/practiceMerge';
import { clientId } from '../lib/clientId';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useIdentity } from '../state/Identity';
import { useMockAppState, useWorkspaceValue } from '../state/MockAppState';
import { serverConfigured } from '../lib/remote';
import { savePersonalClip } from '../lib/personalClipLibrary.web';
import { usePreferences } from '../state/preferences';
import { readMedia, writeMedia } from '../lib/mediaStore';
import { ActionButton, Copy, FlexRow, Heading, Meta, Surface } from './ProductUI';
import { ClipLibrary } from './ClipLibrary.web';
import { archiveClipAudio } from '../lib/clipArchive.web';
import { validateAudioFile, type TrackPart } from '../lib/trackParts';
import { TrackTimeline, type TimelineTrack as Track } from './TrackTimeline.web';
import { beatSeconds, signatures, type TimeSignature } from '../lib/practiceTimeline';
import { countIn, startMetronome } from '../lib/metronome.web';
import {
  trackClips,
  hydrateClipDuration,
  withClips,
  moveClip,
  moveClipToNewTrack,
  nextTrackName,
  splitClip,
  type TimelineClip,
} from '../lib/practiceClips';
import { ClipPlayback } from '../lib/clipPlayback.web';

type Note = { id: string; time: number; text: string };
type Session = {
  tracks: Track[];
  notes: Note[];
  loop?: boolean;
  loopStart?: number;
  loopEnd?: number;
  solo?: string | null;
  memo?: string;
  bpm?: number;
  signature?: TimeSignature;
  countInBars?: number;
  masterVolume?: number;
};
const timeLabel = (value: number) =>
  `${Math.floor(value / 60)}:${String(Math.floor(value % 60)).padStart(2, '0')}`;
export function PracticeStudio({
  scopeKey,
  bpm,
  feedback,
}: {
  scopeKey: string;
  bpm?: number;
  feedback?: boolean;
}) {
  const feedbackRef = useRef<HTMLDivElement>(null);
  const userId = useIdentity();
  const urls = useRef(new Set<string>());
  const preferences = usePreferences();
  const { metronome, clickVolume, setMetronome, setClickVolume } = useLocalMetronome(
    `${userId}/${scopeKey}`,
    preferences.metronome,
  );
  const initialBpm = useRef(bpm ?? preferences.bpm);
  const [beatBpm, setBeatBpm] = useState(bpm ?? preferences.bpm);
  const [signature, setSignature] = useState<TimeSignature>('4/4');
  const [countInBars, setCountInBars] = useState(Math.min(2, Math.ceil(preferences.countIn / 4)));
  const initialCountIn = useRef(Math.min(2, Math.ceil(preferences.countIn / 4)));
  const [masterVolume, setMasterVolume] = useState(1);
  const [standalone, setStandalone] = useState(false);
  const [activeBeat, setActiveBeat] = useState(-1);
  const [clickEpoch, setClickEpoch] = useState(0);
  const [armed, setArmed] = useState<string | null>(null);
  const clickContext = useRef<AudioContext | null>(null);
  const countAbort = useRef<AbortController | null>(null);
  const { workspaceId, members, canManage } = useMockAppState();
  const [sharedNotes, setSharedNotes] = useWorkspaceValue<(Note & { authorId: string })[]>(
    `song/${scopeKey.split('/').at(-1)}/feedback`,
    [],
  );
  const [libraryVersion, setLibraryVersion] = useState(0);
  const [editingMidi, setEditingMidi] = useState<TimelineClip | null>(null);
  const [importTrack, setImportTrack] = useState<string | null>(null);
  const [publishing, setPublishing] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(0);
  const [tracks, setTracks] = useState<Track[]>([]);
  const uploadPart: TrackPart = 'UNASSIGNED';
  const [notes, setNotes] = useState<Note[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  useEffect(() => {
    if (feedback && loaded)
      feedbackRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }, [feedback, loaded]);
  const loadedScope = useRef('');
  const sessionExtras = useRef<{ memo?: string }>({});
  const [savedSnapshot, setSavedSnapshot] = useState<Session | null>(null);
  const [refreshRequired, setRefreshRequired] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [dialog, setDialog] = useState<{
    title: string;
    message?: string;
    choices: { label: string; run: () => void }[];
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [solo, setSolo] = useState<string | null>(null);
  const [loop, setLoop] = useState(false);
  const [loopStart, setLoopStart] = useState(0);
  const [loopEnd, setLoopEnd] = useState(0);
  const [recording, setRecording] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [error, setError] = useState('');
  const [draft, setDraft] = useState('');
  const playback = useRef<ClipPlayback | null>(null);
  const mix = useRef({ tracks, solo, masterVolume });
  mix.current = { tracks, solo, masterVolume };
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const alive = useRef(true);
  const playbackRequest = useRef(0);
  const clips = useMemo(
    () =>
      tracks.flatMap((track) => trackClips(track).map((clip) => ({ ...clip, trackId: track.id }))),
    [tracks],
  );
  const duration = Math.max(0, ...clips.map((clip) => clip.duration + clip.offset));
  const positionRef = useRef(0);
  useEffect(() => {
    let active = true;
    loadedScope.current = '';
    setLoaded(false);
    setSavedSnapshot(null);
    setLoadFailed(false);
    setError('');
    setPlaying(false);
    setPosition(0);
    void readMedia<Session>(`practice/${scopeKey}`, userId)
      .then((session) => {
        if (!active) return;
        setTracks(
          (session?.tracks ?? []).map((track) =>
            withClips(
              {
                ...track,
                offset: track.offset ?? 0,
                volume: track.volume ?? 1,
                muted: track.muted ?? false,
                duration: track.duration ?? 0,
              },
              trackClips(track).map((clip) => {
                const url = URL.createObjectURL(clip.blob);
                urls.current.add(url);
                return { ...clip, sourceStart: clip.sourceStart ?? 0, url };
              }),
            ),
          ),
        );
        setNotes(session?.notes ?? []);
        sessionExtras.current = { memo: session?.memo };
        setLoop(session?.loop ?? false);
        setLoopStart(session?.loopStart ?? 0);
        setLoopEnd(session?.loopEnd ?? 0);
        setSolo(session?.solo ?? null);
        setBeatBpm(Math.max(30, Math.min(300, session?.bpm ?? initialBpm.current)));
        setSignature(
          session?.signature && signatures.includes(session.signature) ? session.signature : '4/4',
        );
        setCountInBars(session?.countInBars ?? initialCountIn.current);
        setMasterVolume(session?.masterVolume ?? 1);
        loadedScope.current = scopeKey;
        setLoaded(true);
      })
      .catch((failure: unknown) => {
        if (active) {
          setLoadFailed(true);
          setError(
            failure instanceof Error
              ? `연습 데이터를 불러오지 못했어요: ${failure.message}`
              : '연습 데이터를 불러오지 못했어요. 다시 시도해주세요.',
          );
        }
      });
    return () => {
      active = false;
    };
  }, [scopeKey, userId, loadAttempt]);
  const snapshot = useMemo<Session>(
    () => ({
      tracks: tracks.map((track) =>
        withClips(
          track,
          trackClips(track).map((clip) => ({ ...clip, url: '' })),
        ),
      ),
      notes,
      ...sessionExtras.current,
      loop,
      loopStart,
      loopEnd,
      solo,
      bpm: beatBpm,
      signature,
      countInBars,
      masterVolume,
    }),
    [tracks, notes, loop, loopStart, loopEnd, solo, beatBpm, signature, countInBars, masterVolume],
  );
  useEffect(() => {
    if (loaded && savedSnapshot === null) setSavedSnapshot(snapshot);
  }, [loaded, savedSnapshot, snapshot]);
  const decodedDurations = useRef(new WeakMap<Blob, number>());
  const withDecodedDurations = (document: Session | null) => {
    if (!document) return document;
    let next = document.tracks;
    for (const track of document.tracks)
      for (const clip of trackClips(track)) {
        const duration = decodedDurations.current.get(clip.blob);
        if (duration) next = hydrateClipDuration(next, clip.id, duration);
      }
    return next === document.tracks ? document : { ...document, tracks: next };
  };
  const saved = samePractice(withDecodedDurations(savedSnapshot), withDecodedDurations(snapshot));
  const dirty = loaded && savedSnapshot !== null && !saved;
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  const applyDocument = (document: Session) => {
    setTracks(
      document.tracks.map((track) =>
        withClips(
          track,
          trackClips(track).map((clip) => {
            const url = URL.createObjectURL(clip.blob);
            urls.current.add(url);
            return { ...clip, url };
          }),
        ),
      ),
    );
    setNotes(document.notes ?? []);
    sessionExtras.current = { memo: document.memo };
    setLoop(document.loop ?? false);
    setLoopStart(document.loopStart ?? 0);
    setLoopEnd(document.loopEnd ?? 0);
    setSolo(document.solo ?? null);
    setBeatBpm(document.bpm ?? initialBpm.current);
    setSignature(document.signature ?? '4/4');
    setCountInBars(document.countInBars ?? initialCountIn.current);
    setMasterVolume(document.masterVolume ?? 1);
    setError('');
    setSaveFailed(false);
  };
  const refreshChanges = async (shareAfter = false) => {
    if (refreshing || saving || recording || requesting || preparing || playing) return;
    setRefreshing(true);
    setRefreshRequired(true);
    try {
      const stored = await readMedia<Session>(`practice/${scopeKey}`, userId);
      const remote: Session = {
        tracks: (stored?.tracks ?? []).map((track) =>
          withClips(
            track,
            trackClips(track).map((clip) => ({
              ...clip,
              sourceStart: clip.sourceStart ?? 0,
              url: '',
            })),
          ),
        ),
        notes: stored?.notes ?? [],
        memo: stored?.memo,
        loop: stored?.loop ?? false,
        loopStart: stored?.loopStart ?? 0,
        loopEnd: stored?.loopEnd ?? 0,
        solo: stored?.solo ?? null,
        bpm: stored?.bpm ?? initialBpm.current,
        signature: stored?.signature ?? '4/4',
        countInBars: stored?.countInBars ?? initialCountIn.current,
        masterVolume: stored?.masterVolume ?? 1,
      };
      await Promise.all([
        identifyAudio(savedSnapshot),
        identifyAudio(snapshot),
        identifyAudio(remote),
      ]);
      const result = mergePractice(
        (withDecodedDurations(savedSnapshot) ?? { tracks: [], notes: [] }) as PracticeDocument,
        withDecodedDurations(snapshot) as PracticeDocument,
        remote as PracticeDocument,
      );
      const apply = (next: Session) => {
        applyDocument(next);
        setSavedSnapshot(remote);
        setRefreshRequired(false);
        setDialog(null);
        setRefreshing(false);
        if (shareAfter) void persistChanges(next);
      };
      if (result.conflict)
        setDialog({
          title: '현재 작업과 충돌하는 변경사항이 있습니다.',
          choices: [
            {
              label: '현재 작업에 영향을 주지 않고 새로고침 하기',
              run: () => apply(result.document as Session),
            },
            { label: '전체 새로고침', run: () => apply(remote) },
          ],
        });
      else apply(result.document as Session);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : '새로고침하지 못했어요.');
      setRefreshing(false);
    }
  };
  const requestRefresh = () => {
    void refreshChanges();
  };
  const leaveAction = useRef<(() => Promise<void>) | null>(null);
  leaveAction.current = async () => {
    setRefreshing(true);
    try {
      const remote = await readMedia<Session>(`practice/${scopeKey}`, userId);
      const document = sharedPracticeSettings(remote ?? { tracks: [], notes: [] });
      applyDocument(document);
      setSavedSnapshot(document);
      setDialog(null);
    } catch (failure) {
      const message = failure instanceof Error ? failure.message : '서버 정보를 불러오지 못했어요.';
      setError(message);
      setDialog((current) => (current ? { ...current, message } : current));
      throw failure;
    } finally {
      setRefreshing(false);
    }
  };
  useEffect(() => {
    if (!dirty) return;
    const listener = (event: Event) => {
      event.preventDefault();
      const proceed = (event as CustomEvent<() => void>).detail;
      setDialog({
        title: '떠나실건가요?',
        message:
          '연습실 사운드 트랙 변경사항이 서버에 저장되지 않았습니다. 변경사항을 서버에 저장하려면 변경사항 공유하기 버튼을 눌러주세요.',
        choices: [
          { label: '계속 작업하기', run: () => setDialog(null) },
          {
            label: '떠나기',
            run: () => {
              void leaveAction
                .current?.()
                .then(proceed)
                .catch(() => {});
            },
          },
        ],
      });
    };
    window.addEventListener('moajam:before-navigate', listener);
    return () => window.removeEventListener('moajam:before-navigate', listener);
  }, [dirty]);
  const saveChanges = async () => {
    if (
      !loaded ||
      refreshing ||
      dialog ||
      savingRef.current ||
      recording ||
      requesting ||
      preparing
    )
      return;
    if (refreshRequired) {
      showRefreshPrompt();
      return;
    }
    await persistChanges(snapshot);
  };
  const showRefreshPrompt = () =>
    setDialog({
      title: '서버에 변경사항이 존재합니다. 새로고침 후 공유하기를 눌러주세요.',
      choices: [
        { label: '취소', run: () => setDialog(null) },
        {
          label: '새로고침 후 공유하기',
          run: () => {
            setDialog(null);
            void refreshChanges(true);
          },
        },
      ],
    });
  const persistChanges = async (pending: Session) => {
    pending = sharedPracticeSettings(pending);
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setSaveFailed(false);
    setError('');
    try {
      await writeMedia(`practice/${scopeKey}`, pending, userId);
      if (alive.current) setSavedSnapshot(pending);
    } catch (failure) {
      if (alive.current) {
        setSaveFailed(true);
        const message =
          (failure as { status?: number })?.status === 409 ||
          (failure instanceof Error && failure.message.includes('서버에 변경사항'))
            ? '서버에 변경사항이 존재합니다. 새로고침 후 공유하기를 눌러주세요.'
            : undefined;
        if (message) showRefreshPrompt();
        setError(
          failure instanceof Error
            ? failure.message
            : '변경사항 저장에 실패했어요. 다시 시도해주세요.',
        );
      }
    } finally {
      savingRef.current = false;
      if (alive.current) setSaving(false);
    }
  };
  useEffect(() => {
    alive.current = true;
    const ownedUrls = urls.current;
    return () => {
      alive.current = false;
      countAbort.current?.abort();
      playback.current?.dispose();
      playback.current = null;
      void clickContext.current?.close();
      clickContext.current = null;
      if (recorder.current?.state === 'recording') recorder.current.stop();
      stream.current?.getTracks().forEach((track) => track.stop());
      ownedUrls.forEach((url) => URL.revokeObjectURL(url));
      ownedUrls.clear();
    };
  }, []);
  useEffect(() => {
    playback.current?.setMix(tracks, solo, masterVolume);
  }, [tracks, solo, masterVolume]);
  const seek = (value: number) => {
    const target = Math.max(
      0,
      Math.min(
        Math.max(duration, beatSeconds(beatBpm, signature) * Number(signature.split('/')[0]) * 16),
        value,
      ),
    );
    positionRef.current = target;
    setPosition(target);
    setClickEpoch((value) => value + 1);
    if (playing)
      playback.current?.start(target, {
        loop:
          !recording && loop && loopEnd > loopStart
            ? { start: loopStart, end: loopEnd }
            : undefined,
        keepAlive: recording,
      });
  };
  useEffect(() => {
    if (!playing) return;
    let frame: number;
    const tick = () => {
      const next = playback.current?.position() ?? positionRef.current;
      if (next < positionRef.current) setClickEpoch((value) => value + 1);
      positionRef.current = next;
      setPosition(next);
      if (playback.current?.finished()) {
        playback.current.stop();
        setPlaying(false);
      } else frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing]);
  const loopConfig = useRef('');
  useEffect(() => {
    const key = `${loop}/${loopStart}/${loopEnd}/${recording}`;
    if (playing && key !== loopConfig.current) {
      playback.current?.start(positionRef.current, {
        loop:
          !recording && loop && loopEnd > loopStart
            ? { start: loopStart, end: loopEnd }
            : undefined,
        keepAlive: recording,
      });
      setClickEpoch((value) => value + 1);
    }
    loopConfig.current = key;
  }, [loop, loopStart, loopEnd, recording, playing]);
  const ensureClickContext = async () => {
    if (!clickContext.current || clickContext.current.state === 'closed')
      clickContext.current = new AudioContext();
    await clickContext.current.resume();
    if (!playback.current) playback.current = new ClipPlayback(clickContext.current);
    return clickContext.current;
  };
  const togglePlay = async () => {
    const request = ++playbackRequest.current;
    if (playing) {
      positionRef.current = playback.current?.position() ?? positionRef.current;
      setPosition(positionRef.current);
      playback.current?.stop();
      setPlaying(false);
      return;
    }
    setError('');
    setPreparing(true);
    if (positionRef.current >= duration) seek(0);
    try {
      await ensureClickContext();
      if (!alive.current || request !== playbackRequest.current) return;
      setStandalone(false);
      await playback.current!.prepare(clips, (clip) =>
        renderMidi(
          clip.midi!,
          mix.current.tracks.find((track) => track.id === clip.trackId)?.instrument ??
            'acoustic_grand_piano',
        ),
      );
      if (alive.current && request === playbackRequest.current) {
        playback.current!.setMix(mix.current.tracks, mix.current.solo, mix.current.masterVolume);
        playback.current!.start(positionRef.current, {
          loop: loop && loopEnd > loopStart ? { start: loopStart, end: loopEnd } : undefined,
        });
        setPlaying(true);
      }
    } catch {
      if (alive.current && request === playbackRequest.current) {
        playback.current?.stop();
        setError('클립 또는 가상악기 음원을 불러오지 못했어요. 다시 시도해주세요.');
      }
    } finally {
      if (alive.current && request === playbackRequest.current) setPreparing(false);
    }
  };
  const addBlob = (
    blob: Blob,
    name: string,
    recordedDuration = 0,
    targetId?: string,
    offset = 0,
    midi?: MidiSequence,
  ) => {
    const target = tracks.find((track) => track.id === targetId);
    const clip: TimelineClip = {
      blob,
      offset,
      sourceStart: 0,
      id: clientId(),
      name,
      url: URL.createObjectURL(blob),
      duration: midi?.duration ?? recordedDuration,
      ...(midi ? { midi } : {}),
    };
    const track: Track = {
      id: clientId(),
      name,
      url: '',
      offset: 0,
      duration: 0,
      volume: preferences.volume,
      muted: false,
      part: target?.part ?? uploadPart,
      kind: midi ? 'midi' : 'audio',
      ...(midi ? { instrument: target?.instrument ?? 'acoustic_grand_piano' } : {}),
      clips: [clip],
    };
    const append = (all: Track[], savedClip: TimelineClip) =>
      all.some((item) => item.id === targetId)
        ? all.map((item) =>
            item.id === targetId ? withClips(item, [...trackClips(item), savedClip]) : item,
          )
        : [...all, { ...track, clips: [savedClip] }];
    if (alive.current) {
      urls.current.add(clip.url);
      setTracks((all) => append(all, clip));
    } else {
      URL.revokeObjectURL(clip.url);
    }
    return clip;
  };
  const importMedia = async (blob: Blob, name: string, targetId: string) => {
    const target = mix.current.tracks.find((track) => track.id === targetId);
    if (!target) throw new Error('트랙을 찾을 수 없어요.');
    const midiFile = isMidiFile({ name, type: blob.type });
    if ((target.kind === 'midi') !== midiFile)
      throw new Error(
        target.kind === 'midi'
          ? '미디 트랙에는 .mid 또는 .midi 파일을 추가해주세요.'
          : '오디오 트랙에는 오디오 클립을 추가해주세요.',
      );
    if (!blob.size || blob.size > 104857600) throw new Error('100MB 이하의 파일을 선택해주세요.');
    const midi = midiFile ? parseMidi(await blob.arrayBuffer(), clientId) : undefined;
    if (!midiFile) validateAudioFile({ name, type: blob.type, size: blob.size });
    if (!alive.current || !mix.current.tracks.some((track) => track.id === targetId)) return;
    addBlob(midi ? new Blob([blob], { type: 'audio/midi' }) : blob, name, 0, targetId, 0, midi);
  };
  const createMidiClip = (trackId: string) => {
    const midi: MidiSequence = {
      notes: [],
      duration:
        ((60 / beatBpm) * Number(signature.split('/')[0]) * 4 * 4) /
        Number(signature.split('/')[1]),
    };
    const clip = addBlob(encodeMidi(midi), '미디 클립.mid', 0, trackId, positionRef.current, midi);
    setEditingMidi(clip);
  };
  const record = async () => {
    if (recording) {
      recorder.current?.stop();
      playback.current?.stop();
      setPlaying(false);
      return;
    }
    if (requesting || preparing || saving || refreshing || !loaded) return;
    playbackRequest.current++;
    // Freeze the backing transport during microphone permission and count-in.
    if (playing) positionRef.current = playback.current?.position() ?? positionRef.current;
    setPosition(positionRef.current);
    playback.current?.stop();
    setPlaying(false);
    setError('');
    setRequesting(true);
    const abort = new AbortController();
    countAbort.current = abort;
    try {
      const context = await ensureClickContext();
      if (!alive.current || abort.signal.aborted) return;
      setStandalone(false);
      setPreparing(true);
      await playback.current!.prepare(clips, (clip) =>
        renderMidi(
          clip.midi!,
          mix.current.tracks.find((track) => track.id === clip.trackId)?.instrument ??
            'acoustic_grand_piano',
        ),
      );
      if (!alive.current || abort.signal.aborted) return;
      playback.current!.setMix(mix.current.tracks, mix.current.solo, mix.current.masterVolume);
      setPreparing(false);
      if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder)
        throw new Error('unsupported');
      const mic = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
      if (!alive.current || abort.signal.aborted) {
        mic.getTracks().forEach((track) => track.stop());
        return;
      }
      stream.current = mic;
      const completed = await countIn(context, {
        bpm: beatBpm,
        signature,
        bars: countInBars,
        volume: clickVolume,
        signal: abort.signal,
        onBeat: (remaining) => {
          if (alive.current) setCountdown(remaining);
        },
      });
      if (!completed || !alive.current) {
        mic.getTracks().forEach((track) => track.stop());
        return;
      }
      await context.resume();
      if (!alive.current || abort.signal.aborted) {
        mic.getTracks().forEach((track) => track.stop());
        return;
      }
      setCountdown(0);
      const instance = new MediaRecorder(mic);
      recorder.current = instance;
      const chunks: Blob[] = [];
      const startedAt = performance.now();
      const recordStart = positionRef.current;
      instance.ondataavailable = (event) => {
        if (event.data.size) chunks.push(event.data);
      };
      instance.onstop = () => {
        mic.getTracks().forEach((track) => track.stop());
        if (chunks.length)
          addBlob(
            new Blob(chunks, { type: instance.mimeType }),
            `내 녹음 ${new Date().toISOString().replaceAll(':', '-')}.${instance.mimeType.includes('mp4') ? 'm4a' : 'webm'}`,
            (performance.now() - startedAt) / 1000,
            armed ?? undefined,
            recordStart,
          );
        if (alive.current) {
          setRecording(false);
          setPlaying(false);
          playback.current?.stop();
        }
      };
      instance.onerror = () => {
        mic.getTracks().forEach((track) => track.stop());
        if (alive.current) {
          setRecording(false);
          setPlaying(false);
          playback.current?.stop();
          setError('녹음 중 오류가 발생했어요. 마이크를 확인해주세요.');
        }
      };
      instance.start();
      playback.current!.start(recordStart, { keepAlive: true, leadIn: 0 });
      loopConfig.current = `${loop}/${loopStart}/${loopEnd}/true`;
      setRecording(true);
      setPlaying(true);
    } catch {
      stream.current?.getTracks().forEach((track) => track.stop());
      if (alive.current)
        setError('마이크를 사용할 수 없어요. 브라우저의 마이크 권한을 확인해주세요.');
    } finally {
      if (alive.current) {
        setRequesting(false);
        setPreparing(false);
        setCountdown(0);
      }
    }
  };
  useEffect(() => {
    if ((!standalone && !(playing && metronome)) || !clickContext.current) {
      setActiveBeat(-1);
      return;
    }
    return startMetronome(clickContext.current, {
      bpm: beatBpm,
      signature,
      volume: clickVolume,
      position: standalone ? 0 : (playback.current?.clockPosition() ?? positionRef.current),
      leadIn: standalone ? 0.025 : 0,
      onBeat: setActiveBeat,
    });
  }, [playing, metronome, standalone, beatBpm, signature, clickVolume, clickEpoch]);
  const stop = () => {
    playbackRequest.current++;
    countAbort.current?.abort();
    if (recorder.current?.state === 'recording') recorder.current.stop();
    playback.current?.stop();
    setPreparing(false);
    setPlaying(false);
    setStandalone(false);
  };
  const hydrateDuration = (id: string, duration: number) => {
    const clip = clips.find((item) => item.id === id);
    if (!clip || !Number.isFinite(duration) || duration <= 0) return;
    decodedDurations.current.set(clip.blob, duration);
    setTracks((current) => hydrateClipDuration(current, id, duration));
    setSavedSnapshot((current) => {
      if (!current) return current;
      const next = hydrateClipDuration(current.tracks, id, duration);
      return next === current.tracks ? current : { ...current, tracks: next };
    });
  };
  const patchTrack = (id: string, changes: Partial<Track>) =>
    setTracks((all) => all.map((track) => (track.id === id ? { ...track, ...changes } : track)));
  const patchClip = (id: string, changes: Partial<TimelineClip>) =>
    setTracks((all) =>
      all.map((track) =>
        trackClips(track).some((clip) => clip.id === id)
          ? withClips(
              track,
              trackClips(track).map((clip) => (clip.id === id ? { ...clip, ...changes } : clip)),
            )
          : track,
      ),
    );
  return (
    <>
      {loadFailed && (
        <ActionButton secondary onPress={() => setLoadAttempt((value) => value + 1)}>
          연습 데이터 다시 불러오기
        </ActionButton>
      )}
      <ScheduleDialog
        label={dialog?.title}
        visible={!!dialog}
        onClose={() => {
          if (!refreshing) setDialog(null);
        }}
      >
        {dialog && (
          <div
            role="dialog"
            aria-modal="true"
            aria-label={dialog.title}
            className="studio-confirm-overlay"
          >
            <div className="studio-confirm-card">
              <h2>{dialog.title}</h2>
              {dialog.message && <p>{dialog.message}</p>}
              <div>
                {dialog.choices.map((choice) => (
                  <button key={choice.label} onClick={choice.run}>
                    {choice.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </ScheduleDialog>
      <div inert={!!dialog || refreshing} style={{ display: 'contents' }}>
        <TrackTimeline
          tracks={tracks}
          loaded={loaded && !refreshing && !dialog}
          saveLabel={
            !loaded
              ? loadFailed
                ? '불러오기 실패'
                : '불러오는 중…'
              : saveFailed
                ? '저장 실패 · 파일을 내려받아 보관해주세요'
                : saving
                  ? '저장 중…'
                  : !saved
                    ? '저장하지 않은 변경사항 · 이동 전에 변경사항 공유하기를 눌러주세요'
                    : serverConfigured
                      ? '서버에 저장됨'
                      : '이 브라우저에 저장됨 · 비공개'
          }
          error={error}
          onUpload={(files, targetId) => {
            void (async () => {
              const failures: string[] = [];
              for (const file of files) {
                try {
                  await importMedia(file, file.name, targetId);
                } catch (failure) {
                  failures.push(
                    file.name +
                      ': ' +
                      (failure instanceof Error ? failure.message : '파일을 추가하지 못했어요.'),
                  );
                }
              }
              if (alive.current) setError(failures.join('\n'));
            })();
          }}
          onEditMidi={setEditingMidi}
          onCreateMidi={createMidiClip}
          onAdd={(kind) => {
            const id = clientId();
            setTracks((all) => [
              ...all,
              {
                id,
                name: nextTrackName(all, kind === 'midi' ? '미디 트랙' : '트랙'),
                kind,
                ...(kind === 'midi' ? { instrument: 'acoustic_grand_piano' as const } : {}),
                part: kind === 'midi' ? 'KEYBOARD' : uploadPart,
                offset: 0,
                duration: 0,
                volume: preferences.volume,
                muted: false,
                url: '',
                clips: [],
              },
            ]);
            if (kind === 'audio') setArmed(id);
          }}
          onReorder={(ids) =>
            setTracks((current) => [
              ...ids.flatMap((id) => current.find((track) => track.id === id) ?? []),
              ...current.filter((track) => !ids.includes(track.id)),
            ])
          }
          onPatch={patchTrack}
          onPatchClip={patchClip}
          onClipDuration={hydrateDuration}
          onMoveClip={(id, targetId, offset) =>
            setTracks((all) => moveClip(all, id, targetId, offset))
          }
          onMoveToNewTrack={(id, offset) => {
            const newId = clientId();
            const source = tracks.find((track) => trackClips(track).some((clip) => clip.id === id));
            setTracks((all) => moveClipToNewTrack(all, id, newId, offset));
            if (source && solo === source.id) setSolo(newId);
            if (source && armed === source.id) setArmed(newId);
          }}
          onRefresh={requestRefresh}
          refreshing={refreshing}
          onSave={() => void saveChanges()}
          saving={saving}
          dirty={dirty}
          onSplitClip={(id, position) =>
            setTracks((all) => splitClip(all, id, position, clientId()))
          }
          onRemoveClip={(id) =>
            setTracks((all) =>
              all.map((track) =>
                withClips(
                  track,
                  trackClips(track).filter((clip) => clip.id !== id),
                ),
              ),
            )
          }
          onRemove={(id) => {
            setTracks((all) => all.filter((item) => item.id !== id));
            if (solo === id) setSolo(null);
            if (armed === id) setArmed(null);
          }}
          solo={solo}
          onSolo={(id) => setSolo(solo === id ? null : id)}
          armed={armed}
          onArm={(id) => setArmed(armed === id ? null : id)}
          publishing={publishing}
          onImportClip={setImportTrack}
          onPublish={
            workspaceId &&
            (scopeKey.startsWith(`${workspaceId}/`) ||
              scopeKey.startsWith(`session/${workspaceId}/`))
              ? (track) => {
                  if (!track.blob) return;
                  setPublishing(track.id);
                  void (
                    track.midi
                      ? Promise.resolve(
                          encodeMidi(cropMidi(track.midi, track.sourceStart, track.duration)),
                        )
                      : archiveClipAudio(track)
                  )
                    .then(async (blob) => {
                      const name = `${track.name.replace(/\.[^.]+$/, '')}.${track.midi ? 'mid' : 'wav'}`;
                      await savePersonalClip({
                        id: clientId(),
                        ownerId: userId,
                        name,
                        blob,
                        type: blob.type,
                        kind: track.midi ? 'midi' : 'audio',
                      });
                    })
                    .then(() => {
                      if (alive.current) {
                        setLibraryVersion((value) => value + 1);
                        setError('클립 보관함에 추가했습니다.');
                      }
                    })
                    .catch((error: Error) => {
                      if (alive.current) setError(error.message);
                    })
                    .finally(() => {
                      if (alive.current) setPublishing(null);
                    });
                }
              : undefined
          }
          transport={{
            position,
            duration,
            playing,
            recording,
            requesting: requesting || preparing,
            preparing,
            countdown,
            bpm: beatBpm,
            signature,
            metronome,
            standalone,
            clickVolume,
            countInBars,
            masterVolume,
            beat: activeBeat,
            onPlay: () => void togglePlay(),
            onStop: stop,
            onRewind: () => {
              stop();
              seek(0);
            },
            onRecord: () => void record(),
            onSeek: seek,
            onBpm: setBeatBpm,
            onSignature: setSignature,
            onMetronome: () => {
              setMetronome(!metronome);
              if (metronome) setStandalone(false);
            },
            onStandalone: () => {
              const request = ++playbackRequest.current;
              if (standalone) {
                setStandalone(false);
                return;
              }
              void ensureClickContext()
                .then(() => {
                  if (alive.current && request === playbackRequest.current) {
                    setMetronome(true);
                    setStandalone(true);
                  }
                })
                .catch(() => setError('메트로놈을 시작하지 못했어요. 다시 눌러주세요.'));
            },
            onClickVolume: setClickVolume,
            onCountIn: setCountInBars,
            onMasterVolume: setMasterVolume,
            loop,
            loopStart,
            loopEnd,
            onLoop: () => setLoop(!loop),
            onLoopStart: () => setLoopStart(position),
            onLoopEnd: () => setLoopEnd(Math.min(position, duration)),
          }}
        />
        {clips
          .filter((clip) => !clip.midi)
          .map((clip) => (
            <audio
              key={clip.id}
              src={clip.url}
              preload="metadata"
              onError={() => setError(`${clip.name} 파일을 읽을 수 없어요.`)}
            />
          ))}
        {editingMidi?.midi && (
          <MidiClipEditor
            key={editingMidi.id}
            name={editingMidi.name}
            sequence={cropMidi(editingMidi.midi, editingMidi.sourceStart, editingMidi.duration)}
            bpm={beatBpm}
            onClose={() => setEditingMidi(null)}
            onSave={(midi) => {
              try {
                const blob = encodeMidi(midi),
                  url = URL.createObjectURL(blob);
                urls.current.add(url);
                patchClip(editingMidi.id, {
                  midi,
                  blob,
                  url,
                  sourceStart: 0,
                  duration: midi.duration,
                  trimmed: false,
                });
                setEditingMidi(null);
              } catch (failure) {
                setError(
                  failure instanceof Error ? failure.message : '미디 클립을 저장하지 못했어요.',
                );
              }
            }}
          />
        )}
        <ClipLibrary version={libraryVersion} />
        <ScheduleDialog
          visible={!!importTrack}
          label="클립 가져오기"
          onClose={() => setImportTrack(null)}
        >
          {importTrack && (
            <div className="studio-confirm-overlay" onClick={() => setImportTrack(null)}>
              <div
                className="studio-confirm-card"
                style={{ maxHeight: '85vh', overflowY: 'auto', width: 'min(760px, 95vw)' }}
                onClick={(event) => event.stopPropagation()}
              >
                <h2>클립 가져오기 · {tracks.find((track) => track.id === importTrack)?.name}</h2>
                <ClipLibrary
                  version={libraryVersion}
                  kind={tracks.find((track) => track.id === importTrack)?.kind ?? 'audio'}
                  onChoose={async (blob, name) => {
                    await importMedia(blob, name, importTrack);
                    if (alive.current) setImportTrack(null);
                  }}
                />
                <button onClick={() => setImportTrack(null)}>닫기</button>
              </div>
            </div>
          )}
        </ScheduleDialog>
        <div ref={feedbackRef} tabIndex={-1} aria-label="세부 피드백">
          <Surface>
            <FlexRow>
              <Heading>세부 피드백</Heading>
              <Meta>원하는 시간대로 커서를 올려두고, 해당 부분에 대한 의견을 남겨보아요.</Meta>
            </FlexRow>
            <FlexRow>
              <Meta>현재 구간 {timeLabel(position)}</Meta>
              <input
                aria-label="연습 메모"
                value={draft}
                placeholder="이 구간에서 기억할 것"
                onChange={(event) => setDraft(event.target.value)}
                style={{
                  flex: 1,
                  minWidth: 0,
                  padding: 12,
                  border: '1px solid #dce4ef',
                  borderRadius: 8,
                }}
              />
              <ActionButton
                secondary
                disabled={!loaded || !draft.trim()}
                onPress={() => {
                  if (!draft.trim()) return;
                  setSharedNotes((all) => [
                    ...all,
                    { id: clientId(), time: position, text: draft.trim(), authorId: userId },
                  ]);
                  setDraft('');
                }}
              >
                피드백 등록
              </ActionButton>
            </FlexRow>
            {notes.length > 0 && (
              <details>
                <summary>기존 개인 메모 (나만 보기)</summary>
                {notes.map((note) => (
                  <FlexRow key={note.id}>
                    <ActionButton secondary compact onPress={() => seek(note.time)}>
                      {timeLabel(note.time)}
                    </ActionButton>
                    <Copy>{note.text}</Copy>
                  </FlexRow>
                ))}
              </details>
            )}
            {sharedNotes.map((note) => {
              const member = members.find((item) => item.id === note.authorId);
              const name = member?.name ?? '탈퇴한 멤버';
              const photo = note.authorId === userId ? preferences.photo : member?.photo;
              return (
                <FlexRow key={note.id}>
                  <span
                    title={name}
                    aria-label={name}
                    style={{
                      width: 28,
                      height: 28,
                      flexShrink: 0,
                      borderRadius: '50%',
                      overflow: 'hidden',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      background: member?.color ?? '#e2e8f0',
                      fontSize: 11,
                    }}
                  >
                    {photo ? (
                      <img
                        src={photo}
                        alt={name}
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                    ) : (
                      name.slice(-2)
                    )}
                  </span>
                  <ActionButton secondary compact onPress={() => seek(note.time)}>
                    {timeLabel(note.time)}
                  </ActionButton>
                  <Copy style={{ flex: 1 }}>{note.text}</Copy>
                  <Meta>{name}</Meta>
                  <ActionButton
                    secondary
                    compact
                    disabled={note.authorId !== userId && !canManage}
                    onPress={() =>
                      setSharedNotes((all) => all.filter((item) => item.id !== note.id))
                    }
                  >
                    삭제
                  </ActionButton>
                </FlexRow>
              );
            })}
          </Surface>
        </div>
      </div>
    </>
  );
}
