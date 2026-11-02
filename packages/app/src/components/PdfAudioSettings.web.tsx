import { useEffect, useRef, useState } from 'react';
import { AudioSettingsWaveform } from './AudioSettingsWaveform.web';
import { ScoreTransportIcon } from './ScoreTransportIcon.web';
import { startMetronome } from '../lib/metronome.web';
import { signatures, type TimeSignature } from '../lib/practiceTimeline';

export function PdfAudioSettings({ file, start, onApply, onClose, fixedFile = false, bpm = 120, signature = '4/4' }: {
  file: File | null;
  start: number;
  onApply: (file: File | null, start: number, bpm: number, signature: string) => void;
  onClose: () => void;
  fixedFile?: boolean;
  bpm?: number;
  signature?: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const audio = useRef<HTMLAudioElement>(null);
  const [selected, setSelected] = useState(file);
  const [url, setUrl] = useState('');
  const [offset, setOffset] = useState(start);
  const [draftBpm, setDraftBpm] = useState(bpm);
  const [draftSignature, setDraftSignature] = useState(signature);
  const [duration, setDuration] = useState(0);
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState('');
  const [dragging, setDragging] = useState(false);
  const [volume, setVolume] = useState(1);
  const [metronome, setMetronome] = useState(false);
  const [clickVolume, setClickVolume] = useState(0.5);
  const [clickEpoch, setClickEpoch] = useState(0);
  const clickContext = useRef<AudioContext | null>(null);
  useEffect(() => () => { void clickContext.current?.close(); }, []);
  useEffect(() => {
    if (!metronome || !playing || !clickContext.current || !audio.current) return;
    const position = audio.current.currentTime - offset;
    return startMetronome(clickContext.current, {
      bpm: draftBpm,
      signature: signatures.includes(draftSignature as TimeSignature) ? draftSignature as TimeSignature : '4/4',
      volume: clickVolume, position: Math.max(0, position), leadIn: Math.max(0, -position) + 0.025,
      onBeat: () => {},
    });
  }, [metronome, playing, draftBpm, draftSignature, clickVolume, clickEpoch, offset]);
  const toggleMetronome = async () => {
    if (metronome) { setMetronome(false); return; }
    try {
      clickContext.current ??= new AudioContext();
      await clickContext.current.resume();
      setMetronome(true);
    } catch { setError('메트로놈을 재생하지 못했어요.'); }
  };
  useEffect(() => {
    const node = dialog.current;
    node?.showModal();
    return () => node?.close();
  }, []);
  useEffect(() => {
    if (!selected) { setUrl(''); return; }
    const next = URL.createObjectURL(selected);
    setUrl(next);
    setDuration(0);
    return () => URL.revokeObjectURL(next);
  }, [selected]);
  const choose = (next?: File) => {
    if (!next) return;
    if (!next.type.startsWith('audio/') && !/\.(mp3|wav|webm|ogg|m4a|aac|flac|opus)$/i.test(next.name)) {
      setError('음원 파일을 선택해주세요.'); return;
    }
    audio.current?.pause();
    setSelected(next); setOffset(0); setError('');
  };
  return <dialog ref={dialog} className={`pdf-audio-settings${fixedFile ? ' song-audio-settings' : ''}`} aria-label="음원 설정"
    onKeyDown={(e) => e.stopPropagation()}
    onCancel={(e) => { e.preventDefault(); e.stopPropagation(); onClose(); }}>
    <header><h2>음원 설정</h2><button type="button" onClick={onClose} aria-label="음원 설정 닫기">×</button></header>
    {fixedFile ? <p className="pdf-audio-filename">{selected?.name}</p> : <div className={`pdf-audio-drop${dragging ? ' is-dragging' : ''}`}
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => { e.preventDefault(); setDragging(false); choose(e.dataTransfer.files[0]); }}>
      <p>{selected ? selected.name : '함께 재생할 음원 파일을 여기에 놓아주세요.'}</p>
      <button type="button" onClick={() => input.current?.click()}>파일에서 가져오기</button>
      <input ref={input} type="file" accept="audio/*,.webm" hidden onChange={(e) => { choose(e.target.files?.[0]); e.target.value = ''; }} />
    </div>}
    {url && <section className="pdf-audio-preview">
      <audio ref={audio} src={url} controls={!fixedFile} preload="metadata"
        onTimeUpdate={() => setTime(audio.current?.currentTime ?? 0)}
        onSeeked={() => setClickEpoch((value) => value + 1)}
        onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)}
        onLoadedMetadata={() => {
          const length = audio.current?.duration ?? 0;
          setDuration(Number.isFinite(length) ? length : 0);
          if (Number.isFinite(length)) setOffset((value) => Math.min(value, length));
          if (audio.current) audio.current.currentTime = Math.min(offset, Number.isFinite(length) ? length : offset);
        }} onError={() => setError('이 음원 형식을 재생할 수 없어요. 다른 파일을 선택해주세요.')} />
      {fixedFile && selected && <>
        <AudioSettingsWaveform file={selected} duration={duration} time={time} start={offset} bpm={draftBpm} onBpmChange={setDraftBpm}
          signature={draftSignature} onSignatureChange={setDraftSignature}
          metronomeControls={<div className="audio-settings-metronome-controls">
            <button type="button" className="audio-settings-metronome-toggle" role="switch" aria-label="메트로놈" aria-checked={metronome}
              onClick={() => void toggleMetronome()}>
              <ScoreTransportIcon name="metronome" /><span className="audio-settings-switch"><span /></span>
            </button>
            <input type="range" aria-label="메트로놈 음량" title="메트로놈 음량" min={0} max={1} step={0.01} value={clickVolume} onChange={(e) => setClickVolume(Number(e.target.value))} />
          </div>}
          onSeek={(value) => {
          const next = Math.max(0, Math.min(duration, value));
          if (audio.current) audio.current.currentTime = next;
          setTime(next);
        }} />
        <div className="audio-settings-progress">
          <input type="range" aria-label="음원 재생 위치" min={0} max={duration || 1} step={0.01} value={time} disabled={!duration}
            onChange={(e) => { const next = Number(e.target.value); if (audio.current) audio.current.currentTime = next; setTime(next); }} />
          <div><span>{audioTime(time)}</span><span>{audioTime(duration)}</span></div>
        </div>
        <div className="audio-settings-transport">
          <button type="button" aria-label="처음으로" disabled={!duration} onClick={() => { if (audio.current) audio.current.currentTime = 0; setTime(0); }}>│◀</button>
          <button type="button" aria-label={playing ? '일시정지' : '재생'} onClick={() => {
            if (playing) audio.current?.pause();
            else void audio.current?.play().catch(() => setError('음원을 재생하지 못했어요.'));
          }}>{playing ? 'Ⅱ' : '▶'}</button>
          <button type="button" aria-label="끝으로" disabled={!duration} onClick={() => {
            if (audio.current) { audio.current.currentTime = duration; audio.current.pause(); }
            setTime(duration);
          }}>▶│</button>
          <label className="audio-settings-volume" title="음원 음량">음량
            <input type="range" aria-label="음원 음량" min={0} max={1} step={0.01} value={volume}
              onChange={(e) => { const next = Number(e.target.value); setVolume(next); if (audio.current) audio.current.volume = next; }} />
          </label>
        </div>
      </>}
      <label>음원 시작 위치 <input type="number" min={0} max={duration || undefined} step="0.1" value={offset}
        onChange={(e) => {
          const next = Math.min(duration || Infinity, Math.max(0, Number(e.target.value) || 0));
          setOffset(next); if (audio.current) audio.current.currentTime = next;
        }} /> 초</label>
      <button type="button" onClick={() => setOffset(audio.current?.currentTime ?? 0)}>현재 위치를 시작 위치로 설정</button>
      <small>PDF 첫 박부터 재생할 때 이 시간부터 음원을 함께 재생해요.</small>
    </section>}
    {error && <p role="alert">{error}</p>}
    <footer><button type="button" onClick={onClose}>취소</button><button type="button" disabled={!selected || !!error}
      onClick={() => { audio.current?.pause(); onApply(selected, offset, draftBpm, draftSignature); }}>적용</button></footer>
  </dialog>;
}
function audioTime(value: number) {
  const seconds = Math.max(0, Math.floor(value));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}
