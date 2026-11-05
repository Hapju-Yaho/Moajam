import { useEffect, useRef, useState } from 'react';
import { useWorkspaceValue } from '@state/MockAppState';
import { songAudioBlob, type SongAudio } from '@lib/songAudio';
import './SongAudioPlayer.web.css';

export function SongAudioPlayer({ songId }: { songId: string }) {
  const [source] = useWorkspaceValue<SongAudio | null>(`song/${songId}/audio`, null);
  const audio = useRef<HTMLAudioElement>(null);
  const [url, setUrl] = useState('');
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    let objectUrl = '';
    setUrl(''); setTime(0); setDuration(0); setPlaying(false); setError('');
    if (source) void songAudioBlob(source).then((blob) => {
      if (!active) return;
      objectUrl = URL.createObjectURL(blob); setUrl(objectUrl);
    }).catch((e) => { if (active) setError(e instanceof Error ? e.message : '음원을 불러오지 못했어요.'); });
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [source?.id]);
  if (!source) return null;
  const seek = (next: number) => {
    const value = Math.max(0, Math.min(duration, next));
    if (audio.current) audio.current.currentTime = value;
    setTime(value);
  };
  return <div className="song-audio-player" aria-label="곡 음원 재생">
    <audio ref={audio} src={url || undefined} preload="metadata"
      onLoadedMetadata={() => { const value = audio.current?.duration ?? 0; setDuration(Number.isFinite(value) ? value : 0); }}
      onTimeUpdate={() => setTime(audio.current?.currentTime ?? 0)} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)}
      onEnded={() => setPlaying(false)} onError={() => { if (url) setError('음원을 재생할 수 없어요.'); }} />
    <input type="range" aria-label="곡 음원 재생 위치" min={0} max={duration || 1} step={0.01} value={time} disabled={!duration} onChange={(e) => seek(Number(e.target.value))} />
    <div className="song-audio-time"><span>{formatAudioTime(time)}</span><span>{formatAudioTime(duration)}</span></div>
    <div className="song-audio-controls">
      <button disabled={!duration} onClick={() => seek(0)} aria-label="처음으로">│◀</button>
      <button disabled={!duration} onClick={() => seek(time - 5)}>−5초</button>
      <button disabled={!url} aria-label={playing ? '일시정지' : '재생'} onClick={() => {
        if (playing) audio.current?.pause();
        else void audio.current?.play().catch(() => setError('음원을 재생할 수 없어요.'));
      }}>{playing ? 'Ⅱ' : '▶'}</button>
      <button disabled={!duration} onClick={() => seek(time + 5)}>+5초</button>
      <button disabled={!duration} onClick={() => { seek(duration); audio.current?.pause(); }} aria-label="끝으로">▶│</button>
    </div>
    {error && <small role="alert">{error}</small>}
  </div>;
}
export function formatAudioTime(seconds: number) {
  const value = Math.max(0, Math.floor(seconds));
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}`;
}
