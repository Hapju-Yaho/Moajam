import { useEffect, useRef, useState } from 'react';
import type { InstrumentSample } from '../lib/samplePitch';
import { importInstrumentSample, prepareInstrumentSample } from '../lib/instrumentSample.web';
import { createScoreOutput, scheduleScoreNote } from '../lib/scoreAudio.web';
import { pitchName } from '../lib/score';

export function ScoreInstrumentSample({
  sample,
  disabled,
  onChange,
  onBusyChange,
}: {
  sample: InstrumentSample | null;
  disabled: boolean;
  onChange: (sample: InstrumentSample | null) => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [previewing, setPreviewing] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const request = useRef(0);
  const context = useRef<AudioContext | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stopPreview = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    void context.current?.close();
    context.current = null;
    setPreviewing(false);
  };
  useEffect(
    () => () => {
      request.current++;
      if (timer.current) clearTimeout(timer.current);
      void context.current?.close();
      context.current = null;
      onBusyChange(false);
    },
    [onBusyChange],
  );
  useEffect(() => {
    if (disabled) stopPreview();
  }, [disabled]);
  const load = async (file: File) => {
    stopPreview();
    const current = ++request.current;
    setBusy(true);
    onBusyChange(true);
    setMessage('녹음에서 기준 음을 찾고 있어요…');
    try {
      const next = await importInstrumentSample(file);
      if (request.current !== current) return;
      onChange(next);
      setMessage(
        next.rootMidi === null
          ? '기준 음을 확실하게 감지하지 못했어요. 녹음한 음을 직접 선택해주세요.'
          : `기준 음을 ${pitchName(Math.round(next.rootMidi))}로 감지했어요. 녹음한 음과 맞는지 확인해주세요.`,
      );
    } catch (error) {
      if (request.current === current)
        setMessage(error instanceof Error ? error.message : '녹음을 불러오지 못했어요.');
    } finally {
      if (request.current === current) {
        setBusy(false);
        onBusyChange(false);
      }
    }
  };
  const preview = async () => {
    if (context.current) {
      stopPreview();
      return;
    }
    if (!sample || sample.rootMidi === null) return;
    let ctx: AudioContext | null = null;
    try {
      ctx = new AudioContext();
      context.current = ctx;
      setPreviewing(true);
      await ctx.resume();
      const prepared = await prepareInstrumentSample(sample);
      if (context.current !== ctx) return;
      const output = createScoreOutput(ctx, 0.8);
      const start = ctx.currentTime + 0.02;
      for (const [index, interval] of [0, 4, 7, 12].entries()) {
        scheduleScoreNote(
          ctx,
          output.input,
          {
            id: 'preview',
            part: '',
            pitch: Math.round(sample.rootMidi) + interval,
            beats: 1,
            rest: false,
            accent: false,
            chord: '',
            lyric: '',
          },
          start + index * 0.65,
          100,
          1,
          prepared,
        );
      }
      timer.current = setTimeout(stopPreview, 2700);
    } catch (error) {
      if (ctx && context.current === ctx) {
        stopPreview();
        setMessage(error instanceof Error ? error.message : '미리 듣기를 시작하지 못했어요.');
      }
    }
  };
  const update = (changes: Partial<InstrumentSample>) => {
    if (!sample) return;
    stopPreview();
    onChange({ ...sample, ...changes });
  };
  const locked = disabled || busy;
  const root = sample?.rootMidi == null ? '' : Math.round(sample.rootMidi);
  const cents =
    sample?.rootMidi == null
      ? 0
      : Math.round((sample.rootMidi - Math.round(sample.rootMidi)) * 100);
  return (
    <section
      className="score-backing score-sample"
      aria-label="내 악기 소리로 재생"
      aria-busy={busy}
    >
      <div className="score-backing-row">
        <strong>내 악기 소리로 재생</strong>
        <button type="button" disabled={locked} onClick={() => input.current?.click()}>
          {busy ? '기준 음 분석 중…' : sample ? '녹음 교체' : '＋ 악기 녹음 올리기'}
        </button>
        <input
          ref={input}
          type="file"
          hidden
          disabled={locked}
          accept="audio/*,.wav,.mp3,.m4a,.ogg,.flac,.webm"
          aria-label="악기 단음 녹음 파일"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (file) void load(file);
          }}
        />
        <span className="score-backing-name">
          {sample?.name ?? '한 음을 1~3초 녹음해주세요 · 최대 15초 / 10MB'}
        </span>
      </div>
      {sample && (
        <div className="score-backing-row">
          <label>
            재생 음색
            <select
              aria-label="악보 재생 음색"
              value={sample.enabled ? 'sample' : 'basic'}
              disabled={locked}
              onChange={(event) => update({ enabled: event.target.value === 'sample' })}
            >
              <option value="basic">기본 음색</option>
              <option value="sample">내 악기 소리</option>
            </select>
          </label>
          <label>
            기준 음
            <select
              aria-label="녹음의 기준 음"
              value={root}
              disabled={locked}
              onChange={(event) => {
                update({ rootMidi: Number(event.target.value) });
                setMessage('기준 음을 변경했어요. 미리 듣기로 확인해주세요.');
              }}
            >
              <option value="" disabled>
                직접 선택
              </option>
              {Array.from({ length: 128 }, (_, midi) => (
                <option key={midi} value={midi}>
                  {pitchName(midi)}
                </option>
              ))}
            </select>
          </label>
          <label>
            미세 조율
            <input
              type="number"
              aria-label="기준 음 미세 조율 센트"
              min="-50"
              max="49"
              step="1"
              value={cents}
              disabled={locked || root === ''}
              onChange={(event) => {
                const value = event.target.valueAsNumber;
                if (root !== '' && Number.isFinite(value))
                  update({
                    rootMidi: Math.max(
                      0,
                      Math.min(127, root + Math.max(-50, Math.min(49, value)) / 100),
                    ),
                  });
              }}
            />
            센트
          </label>
          <label>
            <input
              type="checkbox"
              checked={sample.sustain}
              disabled={locked}
              onChange={(event) => update({ sustain: event.target.checked })}
            />
            긴 음 반복 유지
          </label>
          <button type="button" disabled={locked || root === ''} onClick={() => void preview()}>
            {previewing ? '미리 듣기 정지' : '음색 미리 듣기'}
          </button>
          <button
            type="button"
            disabled={locked}
            onClick={() => {
              stopPreview();
              onChange(null);
              setMessage('기본 음색으로 돌아왔어요.');
            }}
          >
            녹음 연결 해제
          </button>
        </div>
      )}
      <p>
        이 악보의 모든 파트에 사용할 음색이에요. 한 음만 또렷하게 녹음해주세요. 기준 음에서
        멀어질수록 음색이 달라질 수 있어요.
      </p>
      {sample && (
        <p>
          긴 음 반복 유지를 끄면 녹음이 끝날 때 소리도 잦아듭니다. 켜면 소리 일부를 반복하므로 연결
          부분이 들릴 수 있어요. 녹음은 악보와 함께 비공개로 자동 저장되며 MusicXML에는 포함되지
          않아요.
        </p>
      )}
      {sample?.enabled && sample.rootMidi === null && (
        <p role="alert">
          내 악기 소리로 재생하려면 기준 음을 선택해주세요. 기본 음색으로 전환해도 돼요.
        </p>
      )}
      {message && <p role="status">{message}</p>}
    </section>
  );
}
