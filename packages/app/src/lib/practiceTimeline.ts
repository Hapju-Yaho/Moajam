export const signatures = ['4/4', '3/4', '2/4', '6/8'] as const;
export type TimeSignature = (typeof signatures)[number];

export function beatSeconds(bpm: number, signature: TimeSignature) {
  return (60 / Math.max(30, Math.min(300, bpm))) * (4 / Number(signature.split('/')[1]));
}

export function musicalPosition(seconds: number, bpm: number, signature: TimeSignature) {
  const beats = Math.max(0, seconds) / beatSeconds(bpm, signature);
  const perBar = Number(signature.split('/')[0]);
  return { bar: Math.floor(beats / perBar) + 1, beat: Math.floor(beats % perBar) + 1 };
}

export function snapOffset(seconds: number, bpm: number, signature: TimeSignature, snap: boolean) {
  const step = snap ? beatSeconds(bpm, signature) : 0.01;
  return Math.max(0, Math.min(600, Math.round(seconds / step) * step));
}

type ClipEdge = { id: string; offset: number; duration: number };
export type ClipSnap = { offset: number; time: number; targetId: string; edge: 'start' | 'end' };

// Use screen distance so magnetic snapping feels the same at every zoom level.
export function snapClipEdges(
  moving: ClipEdge,
  targets: ClipEdge[],
  pixelsPerSecond: number,
  threshold = 10,
): ClipSnap | undefined {
  if (!Number.isFinite(pixelsPerSecond) || pixelsPerSecond <= 0) return;
  let nearest: ClipSnap | undefined;
  let distance = Infinity;
  for (const target of targets) {
    if (target.id === moving.id || target.duration <= 0) continue;
    for (const edge of ['start', 'end'] as const) {
      const time = target.offset + (edge === 'end' ? target.duration : 0);
      for (const movingEdge of [0, moving.duration]) {
        const offset = time - movingEdge;
        const delta = Math.abs(offset - moving.offset) * pixelsPerSecond;
        if (offset >= 0 && offset <= 600 && delta <= threshold && delta < distance) {
          distance = delta;
          nearest = { offset, time, targetId: target.id, edge };
        }
      }
    }
  }
  return nearest;
}

// Read every sample so transients and silence remain visible, including in stereo files.
export function waveformPeaks(channels: Float32Array[], count = 1000): number[] {
  const length = channels[0]?.length ?? 0;
  if (!length) return [];
  const buckets = Math.min(count, length);
  return Array.from({ length: buckets }, (_, index) => {
    const start = Math.floor((index * length) / buckets);
    const end = Math.floor(((index + 1) * length) / buckets);
    let peak = 0;
    for (const channel of channels)
      for (let sample = start; sample < end; sample++)
        peak = Math.max(peak, Math.abs(channel[sample] ?? 0));
    return Math.min(1, peak);
  });
}
