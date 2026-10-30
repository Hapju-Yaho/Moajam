import { useEffect, useRef, useState } from 'react';
import type { LyricsTransport } from '../lib/lyricsTiming';
import { scheduleClick } from '../lib/metronome.web';
import { ScoreYouTubeBacking, type ScoreYouTubeHandle } from './ScoreYouTubeBacking.web';

export function LyricsReferencePlayer({
  video,
  bpm,
  meter,
  onVideo,
  onBpm,
  onMeter,
  onTransport,
  metronomeOnly = false,
  compactControls = false,
  countIn = false,
}: {
  video: string;
  bpm: number;
  meter: [number, number];
  onVideo: (id: string) => void;
  onBpm: (value: number) => void;
  onMeter: (value: [number, number]) => void;
  onTransport: (transport: LyricsTransport | null) => void;
  metronomeOnly?: boolean;
  compactControls?: boolean;
  countIn?: boolean;
}) {
  const player = useRef<ScoreYouTubeHandle | null>(null),
    audio = useRef<AudioContext | null>(null);
  const [ready, setReady] = useState(false),
    [playing, setPlaying] = useState(false),
    [metronome, setMetronome] = useState(true),
    [error, setError] = useState('');
  const [tempo, setTempo] = useState(String(bpm));
  const cursor = useRef(0),
    startedAt = useRef(0),
    base = useRef(0);
  const running = useRef(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const counting = useRef(false);
  const generation = useRef(0);
  useEffect(() => () => {
    generation.current += 1;
    counting.current = false;
    setCountdown(null);
  }, [countIn]);
  useEffect(() => setTempo(String(bpm)), [bpm]);
  const read = () =>
    running.current
      ? metronomeOnly
        ? base.current +
          (Math.max(0, (audio.current?.currentTime ?? startedAt.current) - startedAt.current) *
            bpm) /
            60
        : ((player.current?.currentTime() ?? 0) * bpm) / 60
      : cursor.current;
  const pause = () => {
    generation.current += 1;
    counting.current = false;
    setCountdown(null);
    cursor.current = read();
    running.current = false;
    setPlaying(false);
    player.current?.pause();
  };
  const toggle = async () => {
    if (running.current || counting.current) {
      pause();
      return;
    }
    if (!metronomeOnly && !ready) {
      setError('유튜브 연결이 완료된 뒤 재생해주세요.');
      return;
    }
    try {
      const attempt = ++generation.current;
      counting.current = true;
      audio.current ??= new AudioContext();
      await audio.current.resume();
      if (attempt !== generation.current) return;
      if (countIn) {
        const start = performance.now();
        const interval = 60000 / bpm;
        for (let index = 0; index < 4; index += 1) {
          if (attempt !== generation.current) return;
          setCountdown(4 - index);
          if (metronome)
            scheduleClick(audio.current, audio.current.currentTime + 0.025, index === 0, 0.5);
          await new Promise<void>((resolve) =>
            setTimeout(resolve, Math.max(0, start + (index + 1) * interval - performance.now())),
          );
        }
        if (attempt !== generation.current) return;
      }
      counting.current = false;
      setCountdown(null);
      base.current = cursor.current;
      startedAt.current = audio.current.currentTime;
      if (
        metronomeOnly &&
        metronome &&
        Math.abs(cursor.current / (4 / meter[1]) - Math.round(cursor.current / (4 / meter[1]))) <
          1e-5
      )
        scheduleClick(
          audio.current,
          audio.current.currentTime + 0.025,
          Math.round(cursor.current / (4 / meter[1])) % meter[0] === 0,
          0.5,
        );
      if (!metronomeOnly)
        player.current?.sync((cursor.current * 60) / bpm, audio.current.currentTime, true);
      running.current = true;
      setPlaying(true);
      setError('');
    } catch (e) {
      counting.current = false;
      setCountdown(null);
      setError(e instanceof Error ? e.message : '재생을 시작하지 못했어요.');
    }
  };
  useEffect(() => {
    onTransport({
      key: metronomeOnly ? 'metronome' : `youtube:${video}`,
      ready: metronomeOnly || ready,
      playing,
      bpm,
      meter,
      metronome,
      setMetronome,
      readBeat: read,
      toggle: () => {
        void toggle();
      },
      seek: (beat) => {
        pause();
        cursor.current = Math.max(0, beat);
      },
      location: (beat) => {
        const length = (meter[0] * 4) / meter[1];
        return { bar: Math.floor(beat / length), offset: beat % length };
      },
    });
  }, [onTransport, metronomeOnly, video, ready, playing, bpm, meter, metronome, countIn]);
  useEffect(() => {
    if (!playing) return;
    let next = -1,
      sounded = false;
    const timer = setInterval(() => {
      if (!metronomeOnly) {
        const state = player.current?.state();
        if (state === 1) sounded = true;
        if (state === 0 && sounded) {
          pause();
          return;
        }
        if (state !== 1) return;
      }
      if (!metronome || !audio.current) return;
      const beat = read(),
        unit = 4 / meter[1],
        index = Math.ceil((beat - 1e-5) / unit);
      if (index !== next) {
        const wait = ((index * unit - beat) * 60) / bpm;
        if (wait >= -0.015 && wait < 0.12) {
          scheduleClick(
            audio.current,
            audio.current.currentTime + Math.max(0, wait),
            index % meter[0] === 0,
            0.5,
          );
          next = index;
        }
      }
    }, 25);
    return () => clearInterval(timer);
  }, [playing, bpm, meter, metronome, metronomeOnly]);
  useEffect(
    () => () => {
      running.current = false;
      generation.current += 1;
      counting.current = false;
      player.current?.pause();
      void audio.current?.close();
      audio.current = null;
      onTransport(null);
    },
    [onTransport],
  );
  return (
    <div className={`lyrics-reference-player${compactControls ? ' is-inline' : ''}`}>
      {countdown !== null && (
        <div className="lyrics-count-in" role="status" aria-label={`재생 준비 ${countdown}`}>
          <strong>{countdown}</strong>
        </div>
      )}
      <div className="lyrics-timing-fields">
        <label>
          BPM{' '}
          <input
            aria-label="가사 기준 BPM"
            type="number"
            min={20}
            max={300}
            disabled={playing || countdown !== null}
            value={tempo}
            onChange={(e) => setTempo(e.target.value)}
            onBlur={() => {
              const value = Math.max(20, Math.min(300, Number(tempo) || 120));
              setTempo(String(value));
              onBpm(value);
            }}
          />
        </label>
        <label>
          박자{' '}
          <select
            aria-label="가사 기준 박자"
            disabled={playing || countdown !== null}
            value={meter.join('/')}
            onChange={(e) => onMeter(e.target.value.split('/').map(Number) as [number, number])}
          >
            {['4/4', '3/4', '2/4', '6/8', '12/8'].map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
      </div>
      {!metronomeOnly && (
        <ScoreYouTubeBacking
          ref={player}
          videoId={video || undefined}
          disabled={playing}
          volume={1}
          onChange={(id) => {
            pause();
            cursor.current = 0;
            onVideo(id ?? '');
          }}
          onReadyChange={setReady}
          onFailure={(message) => {
            pause();
            setError(message);
          }}
        />
      )}
      {metronomeOnly && !compactControls && (
        <p>메트로놈을 들으며 Enter로 가사 시작을 지정하세요.</p>
      )}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
