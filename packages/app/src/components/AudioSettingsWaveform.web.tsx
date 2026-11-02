import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { waveformPeaks } from '../lib/practiceTimeline';
import { signatures } from '../lib/practiceTimeline';
import { clampWaveformZoom, dragWaveformZoom, waveformBarTicks, waveformContentWidth } from '../lib/audioWaveformView';

export function AudioSettingsWaveform({ file, duration, time, start, onSeek, bpm, onBpmChange, signature, onSignatureChange }: {
  file: File; duration: number; time: number; start: number; onSeek: (time: number) => void;
  bpm: number; onBpmChange: (bpm: number) => void;
  signature: string; onSignatureChange: (signature: string) => void;
}) {
  const [path, setPath] = useState('');
  const [error, setError] = useState('');
  const viewport = useRef<HTMLDivElement>(null);
  const [baseWidth, setBaseWidth] = useState(400);
  const [zoom, setZoom] = useState(1);
  const drag = useRef<{ y: number; zoom: number; anchor: number; pixel: number; moved: boolean } | null>(null);
  const anchor = useRef<{ fraction: number; pixel: number } | null>(null);
  const contentWidth = waveformContentWidth(duration, baseWidth, zoom);
  const ticks = waveformBarTicks(duration, contentWidth, bpm, start, signature);
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => setBaseWidth(Math.max(1, entry.contentRect.width)));
    if (viewport.current) observer.observe(viewport.current);
    return () => observer.disconnect();
  }, []);
  useLayoutEffect(() => {
    if (anchor.current && viewport.current) viewport.current.scrollLeft = anchor.current.fraction * contentWidth - anchor.current.pixel;
    anchor.current = null;
  }, [contentWidth]);
  const changeZoom = (next: number) => {
    const node = viewport.current;
    anchor.current = { fraction: node ? (node.scrollLeft + baseWidth / 2) / contentWidth : 0.5, pixel: baseWidth / 2 };
    setZoom(clampWaveformZoom(next));
  };
  useEffect(() => {
    let active = true;
    const context = new AudioContext();
    setPath(''); setError('');
    setZoom(1);
    void file.arrayBuffer().then((bytes) => context.decodeAudioData(bytes)).then((buffer) => {
      if (!active) return;
      const channels = Array.from({ length: buffer.numberOfChannels }, (_, i) => buffer.getChannelData(i));
      const peaks = waveformPeaks(channels, 6000);
      setPath(peaks.map((peak, i) => {
        const x = i * 1000 / peaks.length;
        const height = Math.max(0.5, peak * 55);
        return `M${x},${70 - height}V${70 + height}`;
      }).join(''));
    }).catch(() => { if (active) setError('파형을 표시하지 못했어요. 음원 재생은 사용할 수 있어요.'); })
      .finally(() => { void context.close(); });
    return () => { active = false; };
  }, [file]);
  return <div className="audio-settings-waveform-editor">
    <div className="audio-settings-waveform-heading">
      <div className="audio-settings-waveform-caption"><span>음원 파형</span>
        <label>BPM <input type="number" min={20} max={300} value={bpm}
          onChange={(e) => onBpmChange(Math.max(20, Math.min(300, Number(e.target.value) || 120)))} /></label>
        <label>박자 <select value={signature} onChange={(e) => onSignatureChange(e.target.value)}>
          {signatures.map((value) => <option key={value} value={value}>{value}</option>)}
        </select></label>
      </div>
      <div role="group" aria-label="음원 파형 배율">
        <button type="button" aria-label="파형 축소" disabled={zoom <= 0.25} onClick={() => changeZoom(zoom / 1.25)}>−</button>
        <span>{Math.round(zoom * 100)}%</span>
        <button type="button" aria-label="파형 확대" disabled={zoom >= 5} onClick={() => changeZoom(zoom * 1.25)}>+</button>
      </div>
    </div>
    <div className="audio-settings-waveform-scroll" ref={viewport}>
      <div style={{ width: contentWidth }}>
        <div className="audio-settings-waveform-ruler" aria-label="음원 타임라인" title="아래로 드래그하면 확대, 위로 드래그하면 축소해요. 클릭하면 해당 시간으로 이동해요."
          onPointerDown={(e) => {
            if (e.button !== 0) return;
            e.currentTarget.setPointerCapture(e.pointerId);
            const pixel = e.clientX - (viewport.current?.getBoundingClientRect().left ?? 0);
            drag.current = { y: e.clientY, zoom, anchor: ((viewport.current?.scrollLeft ?? 0) + pixel) / contentWidth, pixel, moved: false };
          }}
          onPointerMove={(e) => {
            const current = drag.current;
            if (!current) return;
            const delta = e.clientY - current.y;
            if (Math.abs(delta) > 3) current.moved = true;
            if (!current.moved) return;
            anchor.current = { fraction: current.anchor, pixel: current.pixel };
            setZoom(dragWaveformZoom(current.zoom, delta));
          }}
          onPointerUp={(e) => {
            if (drag.current && !drag.current.moved && duration) {
              const rect = e.currentTarget.getBoundingClientRect(); onSeek((e.clientX - rect.left) / rect.width * duration);
            }
            drag.current = null;
          }}
          onPointerCancel={() => { drag.current = null; }} onLostPointerCapture={() => { drag.current = null; }}>
          {ticks.map((tick) => <span key={tick.bar} style={{ left: `${tick.time / duration * 100}%` }}><b>{tick.bar}</b><small>{formatTick(tick.time)}</small></span>)}
        </div>
        <div className="audio-settings-waveform" role="slider" tabIndex={0} aria-label="음원 파형 재생 위치"
    aria-valuemin={0} aria-valuemax={duration || 0} aria-valuenow={Math.min(time, duration)}
    onKeyDown={(e) => {
      if (!duration) return;
      if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) {
        e.preventDefault(); onSeek(e.key === 'Home' ? 0 : e.key === 'End' ? duration : time + (e.key === 'ArrowRight' ? 1 : -1));
      }
    }}
    onPointerDown={(e) => {
      if (e.button !== 0 || !duration) return;
      e.currentTarget.setPointerCapture(e.pointerId);
      const rect = e.currentTarget.getBoundingClientRect();
      onSeek((e.clientX - rect.left) / rect.width * duration);
    }}
    onPointerMove={(e) => {
      if (!e.currentTarget.hasPointerCapture(e.pointerId) || !duration) return;
      const rect = e.currentTarget.getBoundingClientRect(); onSeek((e.clientX - rect.left) / rect.width * duration);
    }}>
    <svg viewBox="0 0 1000 140" preserveAspectRatio="none" aria-hidden="true">
      <path d="M0 70H1000" stroke="#718898" strokeWidth=".5" />
      {ticks.map((tick) => <path key={tick.bar} d={`M${tick.time / duration * 1000} 0V140`} stroke="#546772" strokeWidth=".5" />)}
      <path d={path} stroke="#afcadc" strokeWidth="1" vectorEffect="non-scaling-stroke" />
      {duration > 0 && <>
        <path d={`M${start / duration * 1000} 0V140`} stroke="#edbc64" strokeWidth="2" strokeDasharray="5 4" vectorEffect="non-scaling-stroke" />
        <path d={`M${time / duration * 1000} 0V140`} stroke="#f3f7fa" strokeWidth="2" vectorEffect="non-scaling-stroke" />
      </>}
    </svg>
    {!path && <span>{error || '파형 분석 중…'}</span>}
        </div>
      </div>
    </div>
  </div>;
}
function formatTick(seconds: number) {
  const whole = Math.floor(seconds);
  const fraction = seconds - whole;
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}${fraction > 0.001 ? fraction.toFixed(2).slice(1) : ''}`;
}
