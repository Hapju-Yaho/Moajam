// DAW starts at 48 px/second and permits 12–240 px/second.
export const clampWaveformZoom = (value: number) => Math.max(0.25, Math.min(5, value));
export const waveformContentWidth = (duration: number, viewportWidth: number, zoom: number) =>
  Math.max(660, viewportWidth, duration * 48 * zoom);
export const dragWaveformZoom = (initial: number, deltaY: number) => clampWaveformZoom(initial * Math.exp(deltaY / 150));
export function waveformBarTicks(duration: number, width: number, bpm: number, start = 0, signature = '4/4') {
  if (!Number.isFinite(duration) || duration <= 0 || width <= 0 || !Number.isFinite(bpm) || bpm <= 0) return [];
  const [beats, unit] = signature.split('/').map(Number);
  const quarters = Number.isFinite(beats) && Number.isFinite(unit) && beats > 0 && unit > 0 ? beats * 4 / unit : 4;
  const barSeconds = quarters * 60 / bpm;
  const step = Math.max(1, 2 ** Math.ceil(Math.log2(60 / (barSeconds * width / duration))));
  const count = Math.max(0, Math.floor((duration - start) / barSeconds));
  return Array.from({ length: Math.floor(count / step) + 1 }, (_, index) => ({
    bar: index * step + 1, time: start + index * step * barSeconds,
  })).filter((tick) => tick.time <= duration);
}
export function waveformTimeTicks(duration: number, width: number): number[] {
  if (!Number.isFinite(duration) || duration <= 0 || width <= 0) return [];
  const desired = duration * 65 / width;
  const magnitude = 10 ** Math.floor(Math.log10(desired));
  const step = [1, 2, 5, 10].map((value) => value * magnitude).find((value) => value >= desired) ?? magnitude * 10;
  return Array.from({ length: Math.floor(duration / step) + 1 }, (_, i) => Number((i * step).toFixed(4)));
}
