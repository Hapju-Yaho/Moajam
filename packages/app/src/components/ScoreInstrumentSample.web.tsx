import { useCallback, useEffect, useRef, useState, type PointerEvent } from 'react';
import { ScoreSettingsIcon } from './ScoreSettingsIcon.web';
import {
  MIN_SAMPLE_REGION,
  usesAutomaticSampleRoot,
  type InstrumentSample,
} from '../lib/samplePitch';
import {
  importInstrumentSample,
  prepareInstrumentSample,
  inspectInstrumentSample,
  prepareInstrumentSampleRegion,
  detectInstrumentSampleRoot,
  instrumentSampleGain,
} from '../lib/instrumentSample.web';
import { createScoreOutput, scheduleScoreNote } from '../lib/scoreAudio.web';
import { pitchName } from '../lib/score';
import { prepareSoundfontInstrument } from '../lib/soundfont.web';
import type { SoundfontInstrumentId } from '../lib/soundfontCatalog';
import { ScoreBackingDisclosure } from './ScoreBackingDisclosure.web';

export function ScoreInstrumentSample({
  sample,
  disabled,
  onChange,
  onBusyChange,
  defaultInstrument,
  shared = false,
  compact = false,
}: {
  sample: InstrumentSample | null;
  disabled: boolean;
  onChange: (sample: InstrumentSample | null) => void;
  onBusyChange: (busy: boolean) => void;
  defaultInstrument: SoundfontInstrumentId;
  shared?: boolean;
  compact?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [previewing, setPreviewing] = useState<'tone' | 'region' | 'check' | null>(null);
  const [regionVolume, setRegionVolume] = useState(100);
  const regionLevel = useRef(1);
  const regionBoost = useRef(1);
  const regionGain = useRef<GainNode | null>(null);
  const [outputMessage, setOutputMessage] = useState('');
  const [audioDetails, setAudioDetails] = useState<
    (Awaited<ReturnType<typeof inspectInstrumentSample>> & { file: Blob }) | null
  >(null);
  const input = useRef<HTMLInputElement>(null);
  const request = useRef(0);
  const context = useRef<AudioContext | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const drag = useRef<{ boundary: 'start' | 'end'; pointerId: number } | null>(null);
  const stopPreview = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    void context.current?.close();
    context.current = null;
    regionGain.current = null;
    setPreviewing(null);
    onBusyChange(false);
  }, [onBusyChange]);
  useEffect(
    () => () => {
      request.current++;
      if (timer.current) clearTimeout(timer.current);
      void context.current?.close();
      context.current = null;
      regionGain.current = null;
      onBusyChange(false);
    },
    [onBusyChange],
  );
  useEffect(() => {
    if (disabled) stopPreview();
  }, [disabled, stopPreview]);
  const sampleFile = sample?.file;
  useEffect(() => {
    let cancelled = false;
    stopPreview();
    if (sampleFile)
      void inspectInstrumentSample(sampleFile)
        .then((details) => {
          if (!cancelled) setAudioDetails({ ...details, file: sampleFile });
        })
        .catch((error: unknown) => {
          if (!cancelled)
            setMessage(error instanceof Error ? error.message : '녹음을 읽을 수 없어요.');
        });
    return () => {
      cancelled = true;
    };
  }, [sampleFile, stopPreview]);
  const automaticRoot = sample ? usesAutomaticSampleRoot(sample) : false;
  useEffect(() => {
    if (!sample || !usesAutomaticSampleRoot(sample)) return;
    let cancelled = false;
    const pending = setTimeout(() => {
      void detectInstrumentSampleRoot(sample)
        .then((rootMidi) => {
          if (cancelled) return;
          if (sample.rootMidi !== rootMidi || sample.autoRoot !== true)
            onChange({ ...sample, rootMidi, autoRoot: true });
          setMessage(
            rootMidi === null
              ? '선택 구간의 기준 음을 찾지 못했어요. 구간을 넓히거나 실제 연주한 음을 직접 선택해주세요.'
              : `선택 구간의 기준 음을 ${pitchName(Math.round(rootMidi))}로 감지했어요.`,
          );
        })
        .catch((error: unknown) => {
          if (!cancelled)
            setMessage(error instanceof Error ? error.message : '기준 음을 찾지 못했어요.');
        });
    }, 180);
    return () => {
      cancelled = true;
      clearTimeout(pending);
    };
  }, [sample, onChange]);
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
      setSettingsOpen(true);
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
  const preview = async (mode: 'tone' | 'region' | 'check' = 'tone') => {
    if (context.current) {
      stopPreview();
      if (previewing === mode) return;
    }
    if (
      mode !== 'check' &&
      (!sample || (mode === 'tone' && sample.rootMidi === null && !automaticRoot))
    )
      return;
    let ctx: AudioContext | null = null;
    try {
      ctx = new AudioContext();
      context.current = ctx;
      setPreviewing(mode);
      onBusyChange(true);
      if (mode === 'check') setOutputMessage('확인음을 준비하고 있어요…');
      await ctx.resume();
      if (context.current !== ctx) return;
      if (mode === 'check') {
        const pitch = defaultInstrument.includes('bass') ? 40 : 60;
        const bank = await prepareSoundfontInstrument(defaultInstrument, [pitch]);
        if (context.current !== ctx) return;
        const output = createScoreOutput(ctx, 0.8);
        const start = ctx.currentTime + 0.03;
        for (const offset of [0, 0.45]) {
          scheduleScoreNote(
            ctx,
            output.input,
            {
              id: 'check',
              part: '',
              pitch,
              beats: 0.5,
              rest: false,
              accent: false,
              chord: '',
              lyric: '',
            },
            start + offset,
            100,
            0.5,
            bank,
          );
        }
        setOutputMessage('확인음 두 번을 재생해요. 악보 음량과 녹음 설정은 사용하지 않아요.');
        timer.current = setTimeout(() => {
          if (context.current !== ctx) return;
          stopPreview();
          setOutputMessage(
            '확인음도 안 들리면 브라우저 탭의 음소거, 컴퓨터 음량, 연결된 이어폰·스피커를 확인해주세요. 확인음만 들리면 녹음 파일과 선택 구간을 더 확인해야 해요.',
          );
        }, 850);
        return;
      }
      if (!sample) return;
      if (mode === 'region') {
        const buffer = await prepareInstrumentSampleRegion(sample);
        if (context.current !== ctx) return;
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        // Use the same fixed recording gain as score playback.
        const gain = ctx.createGain();
        regionBoost.current = instrumentSampleGain(buffer);
        gain.gain.value = regionLevel.current * regionBoost.current;
        regionGain.current = gain;
        source.connect(gain).connect(ctx.destination);
        source.onended = () => {
          if (context.current === ctx) stopPreview();
        };
        source.start();
        return;
      }
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
            pitch: Math.round(prepared.rootMidi) + interval,
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
        const detail = error instanceof Error ? error.message : '미리 듣기를 시작하지 못했어요.';
        if (mode === 'check') setOutputMessage(`소리 출력을 시작하지 못했어요. ${detail}`);
        else setMessage(detail);
      }
    }
  };
  const update = (changes: Partial<InstrumentSample>) => {
    if (!sample) return;
    stopPreview();
    onChange({ ...sample, ...changes });
  };
  const locked = disabled || busy;
  const details = audioDetails?.file === sampleFile ? audioDetails : null;
  const waveformPeak = details ? Math.max(...details.peaks, 0.001) : 1;
  const trimStart = sample?.trimStart ?? details?.trimStart ?? 0;
  const trimEnd = sample?.trimEnd ?? details?.trimEnd ?? 0;
  const setBoundary = (boundary: 'start' | 'end', value: number) => {
    if (!details || !Number.isFinite(value)) return;
    update(
      boundary === 'start'
        ? { trimStart: Math.max(0, Math.min(trimEnd - MIN_SAMPLE_REGION, value)), trimEnd }
        : {
            trimStart,
            trimEnd: Math.min(details.duration, Math.max(trimStart + MIN_SAMPLE_REGION, value)),
          },
    );
  };
  const pointerTime = (event: PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return details
      ? Math.max(
          0,
          Math.min(details.duration, ((event.clientX - rect.left) / rect.width) * details.duration),
        )
      : 0;
  };
  const startDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (locked || !details || event.button !== 0 || drag.current) return;
    const time = pointerTime(event);
    const handle = (event.target as Element).closest<HTMLElement>('[data-boundary]');
    const boundary =
      handle?.dataset.boundary === 'start'
        ? 'start'
        : handle?.dataset.boundary === 'end'
          ? 'end'
          : Math.abs(time - trimStart) <= Math.abs(time - trimEnd)
            ? 'start'
            : 'end';
    event.preventDefault();
    drag.current = { boundary, pointerId: event.pointerId };
    event.currentTarget.setPointerCapture(event.pointerId);
    handle?.focus();
    if (!handle) setBoundary(boundary, time);
  };
  const endDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (drag.current?.pointerId !== event.pointerId) return;
    drag.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
  };
  const root = sample?.rootMidi == null ? '' : Math.round(sample.rootMidi);
  const cents =
    sample?.rootMidi == null
      ? 0
      : Math.round((sample.rootMidi - Math.round(sample.rootMidi)) * 100);
  return (
    <section
      className={`score-backing score-sample${compact ? ' score-sample--compact' : ''}`}
      aria-label="내 악기 소리로 재생"
      aria-busy={busy}
    >
      <div className="score-backing-row score-sample-header">
        <strong>
          {compact ? (
            <>
              <ScoreSettingsIcon kind="microphone" /> 내 악기 소리
            </>
          ) : (
            '내 악기 소리로 재생'
          )}
        </strong>
        {compact && <span className="score-sample-scope">전체 파트 공통</span>}
        <button type="button" disabled={locked} onClick={() => input.current?.click()}>
          {busy
            ? '기준 음 분석 중…'
            : sample
              ? '녹음 교체'
              : compact
                ? '＋ 녹음 올리기'
                : '＋ 악기 녹음 올리기'}
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
          {sample?.name ??
            (compact
              ? '한 음을 1~3초 녹음한 파일'
              : '한 음을 1~3초 녹음해주세요 · 최대 15초 / 10MB')}
        </span>
        {compact && sample && (
          <>
            <label>
              <input
                type="checkbox"
                checked={sample.enabled}
                disabled={locked}
                onChange={(event) => update({ enabled: event.target.checked })}
              />
              내 녹음 사용
            </label>
            <button
              type="button"
              aria-expanded={settingsOpen}
              onClick={() => {
                stopPreview();
                setSettingsOpen((value) => !value);
              }}
            >
              녹음 편집
            </button>
          </>
        )}
        <button type="button" disabled={locked} onClick={() => void preview('check')}>
          {previewing === 'check' ? '확인음 정지' : '소리 출력 확인'}
        </button>
        {compact && (
          <ScoreBackingDisclosure label="내 녹음 도움말" help>
            <strong>내 녹음으로 재생</strong>
            <p>
              한 음을 1~3초 녹음한 파일을 올리세요. 최대 15초 / 10MB이며, 사용하면 전체 파트에
              공통으로 적용됩니다.
            </p>
            <p>
              녹음 편집에서 사용할 구간과 기준 음을 조정할 수 있어요. 기준 음에서 멀어질수록 음색이
              달라질 수 있습니다.
            </p>
            <p>
              {shared
                ? '녹음은 밴드에 저장할 때 공유됩니다.'
                : '녹음은 악보와 함께 비공개로 저장됩니다.'}{' '}
              MusicXML에는 포함되지 않습니다.
            </p>
          </ScoreBackingDisclosure>
        )}
      </div>
      <div className="score-sample-settings" hidden={compact && (!sample || !settingsOpen)}>
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
                <option value="basic">선택한 가상악기</option>
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
                  if (!event.target.value) return;
                  update({ rootMidi: Number(event.target.value), autoRoot: false });
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
                      autoRoot: false,
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
                checked={automaticRoot}
                disabled={locked}
                onChange={(event) => update({ autoRoot: event.target.checked })}
              />
              기준 음 자동 감지
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
            <button
              type="button"
              disabled={locked || (root === '' && !automaticRoot)}
              onClick={() => void preview()}
            >
              {previewing === 'tone' ? '미리 듣기 정지' : '음색 미리 듣기'}
            </button>
            <button
              type="button"
              disabled={locked}
              onClick={() => {
                stopPreview();
                onChange(null);
                setMessage('가상악기으로 돌아왔어요.');
              }}
            >
              녹음 연결 해제
            </button>
          </div>
        )}
        {sample && details && (
          <div className="score-sample-region" aria-label="악기 소리 재생 구간">
            <div className="score-backing-row">
              <strong>사용할 소리 구간</strong>
              <span>
                선택 {(trimEnd - trimStart).toFixed(2)}초 / 전체 {details.duration.toFixed(2)}초
              </span>
              <button type="button" disabled={locked} onClick={() => void preview('region')}>
                {previewing === 'region' ? '선택 구간 듣기 정지' : '선택 구간 듣기'}
              </button>
              <button
                type="button"
                disabled={locked}
                onClick={() => update({ trimStart: 0, trimEnd: details.duration })}
              >
                전체 구간
              </button>
              <label className="score-volume">
                미리 듣기 볼륨
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="1"
                  aria-label="선택 구간 미리 듣기 볼륨"
                  value={regionVolume}
                  disabled={locked}
                  onChange={(event) => {
                    const value = event.target.valueAsNumber;
                    setRegionVolume(value);
                    regionLevel.current = value / 100;
                    const gain = regionGain.current;
                    if (gain && context.current) {
                      const now = context.current.currentTime;
                      gain.gain.cancelScheduledValues(now);
                      gain.gain.setTargetAtTime(
                        regionLevel.current * regionBoost.current,
                        now,
                        0.01,
                      );
                    }
                  }}
                />
                <output>{regionVolume}</output>
              </label>
            </div>
            <div
              className="score-sample-wave-editor"
              role="group"
              aria-label="녹음 파형에서 구간 조절"
              aria-disabled={locked}
              onPointerDown={startDrag}
              onPointerMove={(event) => {
                if (!locked && drag.current?.pointerId === event.pointerId)
                  setBoundary(drag.current.boundary, pointerTime(event));
              }}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
              onLostPointerCapture={() => {
                drag.current = null;
              }}
            >
              <svg
                className="score-sample-waveform"
                viewBox="0 0 720 88"
                preserveAspectRatio="none"
                role="img"
                aria-label={`녹음 파형, 시작 ${trimStart.toFixed(2)}초, 끝 ${trimEnd.toFixed(2)}초`}
              >
                <rect width="720" height="88" fill="#edf1ee" />
                <rect
                  x={(trimStart / details.duration) * 720}
                  width={((trimEnd - trimStart) / details.duration) * 720}
                  height="88"
                  fill="#d7eddf"
                />
                {details.peaks.map((peak, index) => {
                  const height = Math.max(1, (peak / waveformPeak) * 36);
                  return (
                    <line
                      key={index}
                      x1={index * 3 + 1}
                      x2={index * 3 + 1}
                      y1={44 - height}
                      y2={44 + height}
                      stroke="#527c63"
                      strokeWidth="2"
                    />
                  );
                })}
                {[trimStart, trimEnd].map((time, index) => (
                  <line
                    key={index}
                    x1={(time / details.duration) * 720}
                    x2={(time / details.duration) * 720}
                    y1="0"
                    y2="88"
                    stroke="#147849"
                    strokeWidth="3"
                  />
                ))}
              </svg>
              {(['start', 'end'] as const).map((boundary) => {
                const value = boundary === 'start' ? trimStart : trimEnd;
                const min = boundary === 'start' ? 0 : trimStart + MIN_SAMPLE_REGION;
                const max = boundary === 'start' ? trimEnd - MIN_SAMPLE_REGION : details.duration;
                return (
                  <button
                    key={boundary}
                    type="button"
                    role="slider"
                    data-boundary={boundary}
                    className={`score-sample-handle score-sample-handle-${boundary}`}
                    style={{ left: `${(value / details.duration) * 100}%` }}
                    disabled={locked}
                    aria-label={`파형 ${boundary === 'start' ? '시작' : '끝'} 경계`}
                    aria-valuemin={min}
                    aria-valuemax={max}
                    aria-valuenow={value}
                    aria-valuetext={`${value.toFixed(3)}초`}
                    onKeyDown={(event) => {
                      const step = event.shiftKey ? 0.01 : 0.001;
                      const next =
                        event.key === 'Home'
                          ? min
                          : event.key === 'End'
                            ? max
                            : ['ArrowRight', 'ArrowUp'].includes(event.key)
                              ? value + step
                              : ['ArrowLeft', 'ArrowDown'].includes(event.key)
                                ? value - step
                                : null;
                      if (next !== null) {
                        event.preventDefault();
                        setBoundary(boundary, next);
                      }
                    }}
                  >
                    <span>{boundary === 'start' ? '시작' : '끝'}</span>
                  </button>
                );
              })}
            </div>
            <div className="score-sample-times">
              {(['start', 'end'] as const).map((boundary) => {
                const label = boundary === 'start' ? '시작' : '끝';
                const value = boundary === 'start' ? trimStart : trimEnd;
                const min = boundary === 'start' ? 0 : trimStart + MIN_SAMPLE_REGION;
                const max = boundary === 'start' ? trimEnd - MIN_SAMPLE_REGION : details.duration;
                return (
                  <div className="score-sample-boundary" key={boundary}>
                    <label>
                      {label}
                      <input
                        type="number"
                        aria-label={`악기 소리 ${label} 시간`}
                        min={min}
                        max={max}
                        step="0.001"
                        value={Number(value.toFixed(3))}
                        disabled={locked}
                        onChange={(event) => setBoundary(boundary, event.target.valueAsNumber)}
                      />
                      초
                    </label>
                  </div>
                );
              })}
            </div>
            <p>
              파형 안의 시작·끝 손잡이를 끌어 조절하세요. 초 입력으로 미세 조정할 수 있어요. 최소
              구간은 0.05초이며 원본은 보관돼요.
            </p>
          </div>
        )}
        <p>
          기준 음은 녹음에서 실제 연주한 음이에요. 미세 조율은 그 음이 정확한 음높이에서 얼마나
          높거나 낮은지 나타내며, 100센트가 반음이에요. 자동 감지가 맞으면 직접 바꾸지 않아도 돼요.
          이 값을 기준으로 악보의 음높이에 맞춰 재생하므로, 기준 음에서 멀어질수록 음색이 달라질 수
          있어요.
        </p>
        {sample && (
          <p>
            긴 음 반복 유지를 끄면 녹음이 끝날 때 소리도 잦아듭니다. 켜면 소리 일부를 반복하므로
            연결 부분이 들릴 수 있어요.{' '}
            {shared
              ? '녹음은 밴드에 저장할 때 멤버들에게 공유되며'
              : '녹음은 악보와 함께 비공개로 자동 저장되며'}{' '}
            MusicXML에는 포함되지 않아요.
          </p>
        )}
      </div>
      {sample?.enabled && sample.rootMidi === null && (
        <p role="alert">
          내 악기 소리로 재생하려면 기준 음을 선택해주세요. 가상악기으로 전환해도 돼요.
        </p>
      )}
      {sample && details && trimEnd - trimStart < 0.4 && !sample.sustain && (
        <p>
          선택 구간이 짧아 음이 빨리 끝날 수 있어요. 악보의 음 길이만큼 듣고 싶으면 ‘긴 음 반복
          유지’를 켜주세요.
        </p>
      )}
      {sample && !automaticRoot && sample.rootMidi !== null && sample.rootMidi < 24 && (
        <p role="alert">
          기준 음이 매우 낮아 악보 재생 시 소리가 짧은 틱처럼 들릴 수 있어요. ‘기준 음 자동 감지’를
          켜거나 실제 녹음한 음을 선택해주세요.
        </p>
      )}
      {message && <p role="status">{message}</p>}
      {outputMessage && <p role="status">{outputMessage}</p>}
    </section>
  );
}
