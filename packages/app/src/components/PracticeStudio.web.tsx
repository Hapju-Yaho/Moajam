import { useEffect, useMemo, useRef, useState } from 'react';
import { useIdentity } from '../state/Identity';
import { useMockAppState } from '../state/MockAppState';
import { api, serverConfigured, uploadRemoteFile } from '../lib/remote';
import { usePreferences } from '../state/preferences';
import { readMedia, writeMedia } from '../lib/mediaStore';
import { ActionButton, Copy, FlexRow, Heading, Meta, Surface } from './ProductUI';
import { PracticeSources } from './PracticeSources.web';
import { trackPartLabel, validateAudioFile, type TrackPart } from '../lib/trackParts';
import { TrackTimeline, type TimelineTrack as Track } from './TrackTimeline.web';
import { beatSeconds, signatures, type TimeSignature } from '../lib/practiceTimeline';
import { countIn, startMetronome } from '../lib/metronome.web';
import {
  trackClips,
  withClips,
  moveClip,
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
  metronome?: boolean;
  memo?: string;
  bpm?: number;
  signature?: TimeSignature;
  clickVolume?: number;
  countInBars?: number;
  masterVolume?: number;
};
const timeLabel = (value: number) =>
  `${Math.floor(value / 60)}:${String(Math.floor(value % 60)).padStart(2, '0')}`;
export function PracticeStudio({ scopeKey, bpm }: { scopeKey: string; bpm?: number }) {
  const userId = useIdentity();
  const urls = useRef(new Set<string>());
  const preferences = usePreferences();
  const initialMetronome = useRef(preferences.metronome);
  const initialBpm = useRef(bpm ?? preferences.bpm);
  const [beatBpm, setBeatBpm] = useState(bpm ?? preferences.bpm);
  const [signature, setSignature] = useState<TimeSignature>('4/4');
  const [clickVolume, setClickVolume] = useState(0.65);
  const [countInBars, setCountInBars] = useState(Math.min(2, Math.ceil(preferences.countIn / 4)));
  const initialCountIn = useRef(Math.min(2, Math.ceil(preferences.countIn / 4)));
  const [masterVolume, setMasterVolume] = useState(1);
  const [standalone, setStandalone] = useState(false);
  const [activeBeat, setActiveBeat] = useState(-1);
  const [clickEpoch, setClickEpoch] = useState(0);
  const [armed, setArmed] = useState<string | null>(null);
  const clickContext = useRef<AudioContext | null>(null);
  const countAbort = useRef<AbortController | null>(null);
  const { workspaceId } = useMockAppState();
  const [publishing, setPublishing] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(0);
  const [metronome, setMetronome] = useState(preferences.metronome);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [uploadPart, setUploadPart] = useState<TrackPart>('UNASSIGNED');
  const [notes, setNotes] = useState<Note[]>([]);
  const [loaded, setLoaded] = useState(false);
  const loadedScope = useRef('');
  const sessionExtras = useRef<{ memo?: string }>({});
  const [saved, setSaved] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const saveVersion = useRef(0);
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
        setMetronome(session?.metronome ?? initialMetronome.current);
        setBeatBpm(Math.max(30, Math.min(300, session?.bpm ?? initialBpm.current)));
        setSignature(
          session?.signature && signatures.includes(session.signature) ? session.signature : '4/4',
        );
        setClickVolume(session?.clickVolume ?? 0.65);
        setCountInBars(session?.countInBars ?? initialCountIn.current);
        setMasterVolume(session?.masterVolume ?? 1);
        loadedScope.current = scopeKey;
        setLoaded(true);
      })
      .catch(() => {
        if (active)
          setError('연습 데이터를 불러오지 못했습니다. 저장 권한을 확인하고 새로고침해주세요.');
      });
    return () => {
      active = false;
    };
  }, [scopeKey, userId]);
  useEffect(() => {
    if (!loaded || loadedScope.current !== scopeKey) return;
    setSaved(false);
    setSaveFailed(false);
    const version = ++saveVersion.current;
    void writeMedia(
      `practice/${scopeKey}`,
      {
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
        metronome,
        bpm: beatBpm,
        signature,
        clickVolume,
        countInBars,
        masterVolume,
      },
      userId,
    )
      .then(() => {
        if (alive.current && version === saveVersion.current) setSaved(true);
      })
      .catch((failure: unknown) => {
        if (alive.current && version === saveVersion.current) {
          setSaveFailed(true);
          setError(
            failure instanceof Error
              ? failure.message
              : '트랙 저장에 실패했어요. 파일을 내려받아 보관해주세요.',
          );
        }
      });
  }, [
    scopeKey,
    tracks,
    notes,
    loaded,
    loop,
    loopStart,
    loopEnd,
    solo,
    metronome,
    userId,
    beatBpm,
    signature,
    clickVolume,
    countInBars,
    masterVolume,
  ]);
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
      await playback.current!.prepare(clips);
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
        setError('재생할 수 없는 파일이에요. 다른 오디오 파일로 다시 시도해주세요.');
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
  ) => {
    const target = tracks.find((track) => track.id === targetId);
    const clip: TimelineClip = {
      blob,
      offset,
      sourceStart: 0,
      id: crypto.randomUUID(),
      name,
      url: URL.createObjectURL(blob),
      duration: recordedDuration,
    };
    const track: Track = {
      id: crypto.randomUUID(),
      name,
      url: '',
      offset: 0,
      duration: 0,
      volume: preferences.volume,
      muted: false,
      part: target?.part ?? uploadPart,
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
      void readMedia<Session>(`practice/${scopeKey}`, userId)
        .then((session) =>
          writeMedia(
            `practice/${scopeKey}`,
            {
              ...session,
              tracks: append(session?.tracks ?? [], { ...clip, url: '' }),
              notes: session?.notes ?? [],
            },
            userId,
          ),
        )
        .catch(() => {
          /* The active page reports storage errors; the recorder has already stopped. */
        });
    }
  };
  const record = async () => {
    if (recording) {
      recorder.current?.stop();
      playback.current?.stop();
      setPlaying(false);
      return;
    }
    setError('');
    setRequesting(true);
    const abort = new AbortController();
    countAbort.current = abort;
    try {
      const context = await ensureClickContext();
      if (!alive.current || abort.signal.aborted) return;
      setStandalone(false);
      setPreparing(true);
      await playback.current!.prepare(clips);
      if (!alive.current || abort.signal.aborted) return;
      playback.current!.setMix(mix.current.tracks, mix.current.solo, mix.current.masterVolume);
      setPreparing(false);
      if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder)
        throw new Error('unsupported');
      const mic = await navigator.mediaDevices.getUserMedia({ audio: true });
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
      <TrackTimeline
        tracks={tracks}
        loaded={loaded}
        saveLabel={
          !loaded
            ? '불러오는 중…'
            : saveFailed
              ? '저장 실패 · 파일을 내려받아 보관해주세요'
              : !saved
                ? '저장 중…'
                : serverConfigured
                  ? '서버에 저장됨 · 비공개'
                  : '이 브라우저에 저장됨 · 비공개'
        }
        error={error}
        uploadPart={uploadPart}
        onUploadPart={setUploadPart}
        onUpload={(files, targetId) => {
          const failures: string[] = [];
          files.forEach((file) => {
            try {
              validateAudioFile(file);
              addBlob(file, file.name, 0, targetId);
            } catch (failure) {
              failures.push(
                `${file.name}: ${failure instanceof Error ? failure.message : '파일을 추가하지 못했어요.'}`,
              );
            }
          });
          setError(failures.join('\n'));
        }}
        onAdd={() => {
          const id = crypto.randomUUID();
          setTracks((all) => [
            ...all,
            {
              id,
              name: `${trackPartLabel(uploadPart)} ${all.length + 1}`,
              part: uploadPart,
              offset: 0,
              duration: 0,
              volume: preferences.volume,
              muted: false,
              url: '',
            },
          ]);
          setArmed(id);
        }}
        onPatch={patchTrack}
        onPatchClip={patchClip}
        onMoveClip={(id, targetId, offset) =>
          setTracks((all) => moveClip(all, id, targetId, offset))
        }
        onSplitClip={(id, position) =>
          setTracks((all) => splitClip(all, id, position, crypto.randomUUID()))
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
        onPublish={
          serverConfigured &&
          workspaceId &&
          (scopeKey.startsWith(`${workspaceId}/`) || scopeKey.startsWith(`session/${workspaceId}/`))
            ? (track) => {
                if (!track.blob) return;
                setPublishing(track.id);
                void uploadRemoteFile(
                  track.blob,
                  track.name,
                  scopeKey.startsWith('session/') ? scopeKey : `song/${scopeKey}`,
                  workspaceId,
                  userId,
                )
                  .then((id) =>
                    api(`/assets/${id}/visibility`, 'PATCH', { visibility: 'WORKSPACE' }, userId),
                  )
                  .then(() => {
                    if (alive.current) setError('밴드 자료 보관함에 공개했습니다.');
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
      {clips.map((clip) => (
        <audio
          key={clip.id}
          src={clip.url}
          preload="metadata"
          onLoadedMetadata={(event) => {
            const length = event.currentTarget.duration;
            if (!clip.trimmed && Number.isFinite(length) && Math.abs(clip.duration - length) > 0.01)
              patchClip(clip.id, { duration: length });
          }}
          onError={() => setError(`${clip.name} 파일을 읽을 수 없어요.`)}
        />
      ))}
      {!scopeKey.startsWith('session/') && (
        <details style={{ fontSize: 12, color: '#66786c' }}>
          <summary style={{ cursor: 'pointer', padding: '6px 0' }}>
            곡 자료에서 음원 가져오기
          </summary>
          <PracticeSources
            scopeKey={scopeKey}
            workspaceId={workspaceId}
            disabled={!loaded || playing || recording || requesting || preparing}
            onAdd={addBlob}
          />
        </details>
      )}
      <Surface>
        <FlexRow>
          <Heading>구간 메모</Heading>
          <Meta>현재 구간 {timeLabel(position)}</Meta>
        </FlexRow>
        <Meta>메모의 시간을 누르면 해당 구간으로 이동해요. 이 메모는 나만 볼 수 있어요.</Meta>
        <FlexRow>
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
            onPress={() => {
              if (!draft.trim()) return;
              setNotes((all) => [
                ...all,
                { id: crypto.randomUUID(), time: position, text: draft.trim() },
              ]);
              setDraft('');
            }}
          >
            메모 추가
          </ActionButton>
        </FlexRow>
        {notes.map((note) => (
          <FlexRow key={note.id}>
            <ActionButton secondary compact onPress={() => seek(note.time)}>
              {timeLabel(note.time)}
            </ActionButton>
            <Copy style={{ flex: 1 }}>{note.text}</Copy>
            <ActionButton
              secondary
              compact
              onPress={() => setNotes((all) => all.filter((item) => item.id !== note.id))}
            >
              삭제
            </ActionButton>
          </FlexRow>
        ))}
      </Surface>
    </>
  );
}
