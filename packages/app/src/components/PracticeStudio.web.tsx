import { useEffect, useRef, useState } from 'react';
import { useIdentity } from '../state/Identity';
import { View } from 'react-native';
import { useMockAppState } from '../state/MockAppState';
import { api, serverConfigured, uploadRemoteFile } from '../lib/remote';
import { usePreferences } from '../state/preferences';
import { readMedia, writeMedia } from '../lib/mediaStore';
import { ActionButton, Copy, FlexBetween, FlexRow, Heading, Meta, Surface } from './ProductUI';
import { PracticeSources } from './PracticeSources.web';

type Track = {
  blob: Blob;
  offset: number;
  id: string;
  name: string;
  url: string;
  volume: number;
  muted: boolean;
  duration: number;
};
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
};
const timeLabel = (value: number) =>
  `${Math.floor(value / 60)}:${String(Math.floor(value % 60)).padStart(2, '0')}`;
export function PracticeStudio({ scopeKey, bpm }: { scopeKey: string; bpm?: number }) {
  const userId = useIdentity();
  const urls = useRef(new Set<string>());
  const preferences = usePreferences();
  const initialMetronome = useRef(preferences.metronome);
  const beatBpm = bpm ?? preferences.bpm;
  const { workspaceId } = useMockAppState();
  const [publishing, setPublishing] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(0);
  const [metronome, setMetronome] = useState(preferences.metronome);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [loaded, setLoaded] = useState(false);
  const loadedScope = useRef('');
  const sessionExtras = useRef<{ memo?: string }>({});
  const [saved, setSaved] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [solo, setSolo] = useState<string | null>(null);
  const [loop, setLoop] = useState(false);
  const [loopStart, setLoopStart] = useState(0);
  const [loopEnd, setLoopEnd] = useState(0);
  const [recording, setRecording] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [error, setError] = useState('');
  const [draft, setDraft] = useState('');
  const players = useRef(new Map<string, HTMLAudioElement>());
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const alive = useRef(true);
  const duration = Math.max(0, ...tracks.map((track) => track.duration + track.offset));
  const positionRef = useRef(0);
  useEffect(() => {
    let active = true;
    loadedScope.current = '';
    setLoaded(false);
    setError('');
    setPlaying(false);
    setPosition(0);
    void readMedia<Session>(`practice/${scopeKey}`)
      .then((session) => {
        if (!active) return;
        setTracks(
          (session?.tracks ?? []).map((track) => ({
            ...track,
            offset: track.offset ?? 0,
            volume: track.volume ?? 1,
            muted: track.muted ?? false,
            duration: track.duration ?? 0,
            url: (() => {
              const url = URL.createObjectURL(track.blob);
              urls.current.add(url);
              return url;
            })(),
          })),
        );
        setNotes(session?.notes ?? []);
        sessionExtras.current = { memo: session?.memo };
        setLoop(session?.loop ?? false);
        setLoopStart(session?.loopStart ?? 0);
        setLoopEnd(session?.loopEnd ?? 0);
        setSolo(session?.solo ?? null);
        setMetronome(session?.metronome ?? initialMetronome.current);
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
  }, [scopeKey]);
  useEffect(() => {
    if (!loaded || loadedScope.current !== scopeKey) return;
    setSaved(false);
    void writeMedia(`practice/${scopeKey}`, {
      tracks: tracks.map((track) => ({ ...track, url: '' })),
      notes,
      ...sessionExtras.current,
      loop,
      loopStart,
      loopEnd,
      solo,
      metronome,
    })
      .then(() => {
        if (alive.current) setSaved(true);
      })
      .catch(() => {
        if (alive.current)
          setError('저장 공간이 부족하거나 저장 권한이 없습니다. 파일을 내려받아 보관하세요.');
      });
  }, [scopeKey, tracks, notes, loaded, loop, loopStart, loopEnd, solo, metronome]);
  useEffect(() => {
    alive.current = true;
    const audio = players.current;
    const ownedUrls = urls.current;
    return () => {
      alive.current = false;
      audio.forEach((player) => player.pause());
      if (recorder.current?.state === 'recording') recorder.current.stop();
      stream.current?.getTracks().forEach((track) => track.stop());
      ownedUrls.forEach((url) => URL.revokeObjectURL(url));
      ownedUrls.clear();
    };
  }, []);
  useEffect(() => {
    tracks.forEach((track) => {
      const player = players.current.get(track.id);
      if (player)
        player.volume = track.muted || (solo !== null && solo !== track.id) ? 0 : track.volume;
    });
  }, [tracks, solo]);
  const seek = (value: number) => {
    const target = Math.max(0, Math.min(duration, value));
    positionRef.current = target;
    setPosition(target);
    players.current.forEach((player) => {
      const offset = tracks.find((track) => players.current.get(track.id) === player)?.offset ?? 0;
      if (Number.isFinite(player.duration))
        player.currentTime = Math.max(0, Math.min(target - offset, player.duration));
    });
  };
  useEffect(() => {
    if (!playing) return;
    let frame: number;
    let last = performance.now();
    const tick = (now: number) => {
      let next = positionRef.current + (now - last) / 1000;
      last = now;
      if (loop && loopEnd > loopStart && next >= loopEnd) {
        next = loopStart;
      }
      if (next >= duration) {
        players.current.forEach((player) => player.pause());
        setPlaying(false);
        next = duration;
      }
      tracks.forEach((track) => {
        const player = players.current.get(track.id);
        if (!player) return;
        const time = next - track.offset;
        if (time < 0 || time >= track.duration) {
          player.pause();
          return;
        }
        if (Math.abs(player.currentTime - time) > 0.15) player.currentTime = time;
        if (player.paused)
          void player.play().catch(() => setError('트랙 재생을 시작하지 못했어요.'));
      });
      positionRef.current = next;
      setPosition(next);
      if (next < duration) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, duration, loop, loopStart, loopEnd, tracks]);
  const togglePlay = async () => {
    if (playing) {
      players.current.forEach((player) => player.pause());
      setPlaying(false);
      return;
    }
    setError('');
    if (positionRef.current >= duration) seek(0);
    try {
      await Promise.all(
        tracks.map(async (track) => {
          const player = players.current.get(track.id);
          if (!player) return;
          const time = positionRef.current - track.offset;
          if (time >= 0 && time < track.duration) {
            player.currentTime = time;
            await player.play();
          }
        }),
      );
      if (alive.current) setPlaying(true);
    } catch {
      players.current.forEach((player) => player.pause());
      if (alive.current)
        setError('재생할 수 없는 파일이에요. 다른 오디오 파일로 다시 시도해주세요.');
    }
  };
  const addBlob = (blob: Blob, name: string, recordedDuration = 0) => {
    const track = {
      blob,
      offset: 0,
      id: crypto.randomUUID(),
      name,
      url: URL.createObjectURL(blob),
      volume: preferences.volume,
      muted: false,
      duration: recordedDuration,
    };
    if (alive.current) {
      urls.current.add(track.url);
      setTracks((all) => [...all, track]);
    } else {
      URL.revokeObjectURL(track.url);
      void readMedia<Session>(`practice/${scopeKey}`, userId)
        .then((session) =>
          writeMedia(
            `practice/${scopeKey}`,
            {
              tracks: [...(session?.tracks ?? []), { ...track, url: '' }],
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
      return;
    }
    setError('');
    setRequesting(true);
    try {
      if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder)
        throw new Error('unsupported');
      const mic = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!alive.current) {
        mic.getTracks().forEach((track) => track.stop());
        return;
      }
      stream.current = mic;
      if (preferences.countIn) {
        const context = new AudioContext();
        for (let beat = preferences.countIn; beat > 0; beat--) {
          if (!alive.current) {
            await context.close();
            mic.getTracks().forEach((track) => track.stop());
            return;
          }
          setCountdown(beat);
          const oscillator = context.createOscillator();
          const gain = context.createGain();
          gain.gain.value = 0.12;
          oscillator.frequency.value = 880;
          oscillator.connect(gain).connect(context.destination);
          oscillator.start();
          oscillator.stop(context.currentTime + 0.05);
          await new Promise((resolve) => setTimeout(resolve, 60000 / beatBpm));
        }
        await context.close();
        setCountdown(0);
      }
      const instance = new MediaRecorder(mic);
      recorder.current = instance;
      const chunks: Blob[] = [];
      const startedAt = performance.now();
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
          );
        if (alive.current) setRecording(false);
      };
      instance.onerror = () => {
        mic.getTracks().forEach((track) => track.stop());
        if (alive.current) {
          setRecording(false);
          setError('녹음 중 오류가 발생했어요. 마이크를 확인해주세요.');
        }
      };
      instance.start();
      setRecording(true);
    } catch {
      stream.current?.getTracks().forEach((track) => track.stop());
      if (alive.current)
        setError('마이크를 사용할 수 없어요. 브라우저의 마이크 권한을 확인해주세요.');
    } finally {
      if (alive.current) setRequesting(false);
    }
  };
  useEffect(() => {
    if (!playing || !metronome) return;
    const context = new AudioContext();
    const tick = () => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      gain.gain.value = 0.08;
      oscillator.frequency.value = 880;
      oscillator.connect(gain).connect(context.destination);
      oscillator.start();
      oscillator.stop(context.currentTime + 0.04);
    };
    tick();
    const timer = setInterval(tick, 60000 / beatBpm);
    return () => {
      clearInterval(timer);
      void context.close();
    };
  }, [playing, metronome, beatBpm]);
  return (
    <>
      <Surface>
        <FlexBetween>
          <Heading>트랙 연습</Heading>
          <Meta>
            {loaded
              ? saved
                ? serverConfigured
                  ? '서버에 저장됨 · 비공개'
                  : '이 브라우저에 저장됨 · 비공개'
                : '저장 중…'
              : '불러오는 중…'}
          </Meta>
        </FlexBetween>
        <Meta>
          오디오 파일을 올려 함께 재생하거나 내 파트를 녹음해보세요. 트랙과 메모는 이 브라우저에
          저장되어 새로고침 후에도 유지됩니다. 다른 기기에서는 파일을 따로 가져와야 합니다.
        </Meta>
        {!scopeKey.startsWith('session/') && (
          <PracticeSources
            scopeKey={scopeKey}
            workspaceId={workspaceId}
            disabled={!loaded || recording || requesting}
            onAdd={addBlob}
          />
        )}
        <label
          style={{
            display: 'block',
            border: '1px dashed #a9bce5',
            borderRadius: 12,
            padding: 20,
            background: '#f7f9fe',
            color: '#334155',
            fontSize: 14,
          }}
        >
          연습할 오디오 추가{' '}
          <input
            aria-label="연습할 오디오 추가"
            type="file"
            accept="audio/*"
            multiple
            disabled={!loaded || playing || recording}
            style={{ display: 'block', marginTop: 12, maxWidth: '100%' }}
            onChange={(event) => {
              for (const file of Array.from(event.target.files ?? [])) {
                if (file.size > 100 * 1024 * 1024) {
                  setError('파일당 100MB 이하로 추가해주세요.');
                  continue;
                }
                addBlob(file, file.name);
              }
              event.target.value = '';
            }}
          />
        </label>
        <FlexRow wrap>
          <ActionButton secondary compact onPress={() => setMetronome(!metronome)}>
            {metronome ? '메트로놈 켜짐' : '메트로놈 꺼짐'} · {beatBpm} BPM
          </ActionButton>
          {countdown ? <Copy>녹음까지 {countdown}박</Copy> : null}
        </FlexRow>
        <FlexRow wrap>
          <ActionButton
            disabled={!loaded || !duration || recording}
            onPress={() => void togglePlay()}
          >
            {playing ? '일시정지' : '▶ 함께 재생'}
          </ActionButton>
          <ActionButton
            secondary
            disabled={!loaded || !duration || recording}
            onPress={() => {
              players.current.forEach((player) => player.pause());
              setPlaying(false);
              seek(0);
            }}
          >
            처음으로
          </ActionButton>
          <ActionButton
            secondary
            disabled={!loaded || requesting || playing}
            onPress={() => void record()}
          >
            {requesting ? '마이크 연결 중…' : recording ? '■ 녹음 완료' : '● 내 파트 녹음'}
          </ActionButton>
          <Copy>
            {timeLabel(position)} / {timeLabel(duration)}
          </Copy>
        </FlexRow>
        <input
          aria-label="재생 위치"
          type="range"
          min={0}
          max={duration || 1}
          step={0.1}
          value={position}
          disabled={!duration}
          onChange={(event) => seek(Number(event.target.value))}
          style={{ width: '100%', accentColor: '#4f75d8' }}
        />
        <FlexRow wrap>
          <ActionButton
            secondary
            compact
            disabled={!duration}
            onPress={() => setLoopStart(position)}
          >
            A 지정 {timeLabel(loopStart)}
          </ActionButton>
          <ActionButton secondary compact disabled={!duration} onPress={() => setLoopEnd(position)}>
            B 지정 {timeLabel(loopEnd)}
          </ActionButton>
          <ActionButton
            secondary
            compact
            disabled={loopEnd <= loopStart}
            onPress={() => setLoop(!loop)}
          >
            {loop ? '구간 반복 켜짐 ✓' : 'A–B 구간 반복'}
          </ActionButton>
        </FlexRow>
        {error && (
          <Copy accessibilityRole="alert" style={{ color: '#be3b4b' }}>
            {error}
          </Copy>
        )}
        {!tracks.length && (
          <Meta>아직 트랙이 없어요. 원곡이나 파트 음원을 추가해 연습을 시작하세요.</Meta>
        )}
        {tracks.map((track) => (
          <View
            key={track.id}
            style={{ gap: 10, padding: 14, borderRadius: 12, backgroundColor: '#f5f7fb' }}
          >
            <audio
              ref={(element) => {
                if (element) players.current.set(track.id, element);
                else players.current.delete(track.id);
              }}
              src={track.url}
              preload="metadata"
              onLoadedMetadata={(event) => {
                const length = event.currentTarget.duration;
                if (Number.isFinite(length))
                  setTracks((all) =>
                    all.map((item) =>
                      item.id === track.id ? { ...item, duration: length } : item,
                    ),
                  );
              }}
              onError={() => setError(`${track.name} 파일을 읽을 수 없어요.`)}
            />
            <Copy style={{ fontWeight: '500' }}>{track.name}</Copy>
            <label style={{ fontSize: 12, color: '#64748b' }}>
              시작 위치(초){' '}
              <input
                aria-label={`${track.name} 시작 위치`}
                type="number"
                min="-60"
                max="600"
                step="0.01"
                value={track.offset}
                disabled={playing || recording}
                onChange={(event) => {
                  const value = Number(event.target.value);
                  if (Number.isFinite(value))
                    setTracks((all) =>
                      all.map((item) =>
                        item.id === track.id
                          ? { ...item, offset: Math.max(-60, Math.min(600, value)) }
                          : item,
                      ),
                    );
                }}
              />
            </label>
            <FlexRow wrap>
              <ActionButton
                secondary
                compact
                onPress={() =>
                  setTracks((all) =>
                    all.map((item) =>
                      item.id === track.id ? { ...item, muted: !item.muted } : item,
                    ),
                  )
                }
              >
                {track.muted ? '음소거 해제' : '음소거'}
              </ActionButton>
              <ActionButton
                secondary
                compact
                onPress={() => setSolo(solo === track.id ? null : track.id)}
              >
                {solo === track.id ? '솔로 해제' : '솔로'}
              </ActionButton>
              <label style={{ color: '#64748b', fontSize: 12 }}>
                볼륨{' '}
                <input
                  aria-label={`${track.name} 볼륨`}
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={track.volume}
                  style={{ width: 110 }}
                  onChange={(event) =>
                    setTracks((all) =>
                      all.map((item) =>
                        item.id === track.id
                          ? { ...item, volume: Number(event.target.value) }
                          : item,
                      ),
                    )
                  }
                />
              </label>
              {serverConfigured &&
              workspaceId &&
              (scopeKey.startsWith(`${workspaceId}/`) ||
                scopeKey.startsWith(`session/${workspaceId}/`)) ? (
                <ActionButton
                  secondary
                  compact
                  disabled={!!publishing}
                  onPress={() => {
                    setPublishing(track.id);
                    void uploadRemoteFile(
                      track.blob,
                      track.name,
                      scopeKey.startsWith('session/') ? scopeKey : `song/${scopeKey}`,
                      workspaceId,
                    )
                      .then((id) =>
                        api(`/assets/${id}/visibility`, 'PATCH', { visibility: 'WORKSPACE' }),
                      )
                      .then(() => setError('밴드 자료 보관함에 공개했습니다.'))
                      .catch((error: Error) => setError(error.message))
                      .finally(() => setPublishing(null));
                  }}
                >
                  {publishing === track.id ? '공개 중…' : '밴드에 공개'}
                </ActionButton>
              ) : null}
              <a href={track.url} download={track.name} style={{ color: '#416bd1', fontSize: 12 }}>
                내려받기
              </a>
              <ActionButton
                secondary
                compact
                disabled={!loaded || playing || recording}
                onPress={() => {
                  players.current.get(track.id)?.pause();
                  URL.revokeObjectURL(track.url);
                  setTracks((all) => all.filter((item) => item.id !== track.id));
                  if (solo === track.id) setSolo(null);
                  seek(0);
                }}
              >
                삭제
              </ActionButton>
            </FlexRow>
          </View>
        ))}
      </Surface>
      <Surface>
        <Heading>구간 메모</Heading>
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
