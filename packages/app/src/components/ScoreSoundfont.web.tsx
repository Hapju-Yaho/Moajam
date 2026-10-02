import { useCallback, useEffect, useRef, useState } from 'react';
import { soundfontInstruments, type SoundfontInstrumentId } from '../lib/soundfontCatalog';
import { prepareSoundfontInstrument } from '../lib/soundfont.web';
import { createScoreOutput, scheduleScoreNote } from '../lib/scoreAudio.web';

export function ScoreSoundfont({
  part,
  instrument,
  disabled,
  volume,
  usingRecording,
  hasRecording,
  onChange,
  onBusyChange,
}: {
  part: string;
  instrument: SoundfontInstrumentId;
  disabled: boolean;
  volume: number;
  usingRecording: boolean;
  hasRecording: boolean;
  onChange: (value: SoundfontInstrumentId | 'recording') => void;
  onBusyChange: (value: boolean) => void;
}) {
  const [previewing, setPreviewing] = useState(false);
  const [message, setMessage] = useState('');
  const context = useRef<AudioContext | null>(null);
  const output = useRef<ReturnType<typeof createScoreOutput> | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestVolume = useRef(volume);
  latestVolume.current = volume;
  useEffect(() => {
    output.current?.setVolume(volume);
  }, [volume]);
  const stop = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    void context.current?.close();
    context.current = null;
    output.current = null;
    setPreviewing(false);
    onBusyChange(false);
  }, [onBusyChange]);
  useEffect(() => {
    stop();
    setMessage('');
    return () => {
      if (timer.current) clearTimeout(timer.current);
      void context.current?.close();
      context.current = null;
      onBusyChange(false);
    };
  }, [instrument, part, disabled, usingRecording, onBusyChange, stop]);
  const preview = async () => {
    if (context.current) {
      stop();
      return;
    }
    const ctx = new AudioContext();
    context.current = ctx;
    setPreviewing(true);
    onBusyChange(true);
    setMessage('악기 소리를 준비하고 있어요…');
    try {
      await ctx.resume();
      if (context.current !== ctx) return;
      const root = instrument.includes('bass') ? 40 : 60;
      const pitches = [root, root + 4, root + 7];
      const bank = await prepareSoundfontInstrument(instrument, pitches);
      if (context.current !== ctx) return;
      output.current = createScoreOutput(ctx, latestVolume.current);
      pitches.forEach((pitch, index) =>
        scheduleScoreNote(
          ctx,
          output.current!.input,
          {
            id: 'preview',
            part,
            pitch,
            beats: 1,
            rest: false,
            accent: false,
            chord: '',
            lyric: '',
          },
          ctx.currentTime + 0.04 + index * 0.65,
          100,
          1,
          bank,
        ),
      );
      setMessage('');
      timer.current = setTimeout(stop, 2100);
    } catch (error) {
      if (context.current !== ctx) return;
      stop();
      setMessage(error instanceof Error ? error.message : '악기 소리를 불러오지 못했어요.');
    }
  };
  return (
    <section className="score-backing" aria-label="악보 재생 악기">
      <div className="score-backing-row">
        <strong>{part} 재생 악기</strong>
        <label>
          악기 선택
          <select
            aria-label="악보 재생 악기 선택"
            value={usingRecording ? 'recording' : instrument}
            disabled={disabled}
            onChange={(event) => {
              stop();
              onChange(event.target.value as SoundfontInstrumentId | 'recording');
            }}
          >
            {['기타', '베이스', '건반·기타 악기'].map((group) => (
              <optgroup key={group} label={group}>
                {soundfontInstruments
                  .filter((item) => item.group === group)
                  .map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.label}
                    </option>
                  ))}
              </optgroup>
            ))}
            {hasRecording && <option value="recording">내 녹음 소리</option>}
          </select>
        </label>
        <button type="button" disabled={disabled || usingRecording} onClick={() => void preview()}>
          {previewing ? '미리 듣기 정지' : '악기 미리 듣기'}
        </button>
      </div>
      <p>
        {usingRecording
          ? '내 녹음은 모든 파트에 적용돼요. 위에서 악기를 선택하면 가상악기로 전환돼요.'
          : '파트마다 다른 악기를 선택할 수 있어요. 미리 듣기에는 악보 재생 볼륨이 적용돼요.'}
      </p>
      <p>
        음원: FluidR3 · Frank Wen / MIDI.js Soundfonts · Benjamin Gleitzman ·{' '}
        <a href="/soundfonts/fluidr3/NOTICE.txt" target="_blank" rel="noreferrer">
          출처 및 라이선스
        </a>
      </p>
      {message && <p role="status">{message}</p>}
    </section>
  );
}
