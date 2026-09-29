// Offset is the audio timestamp corresponding to the first score beat.
export function scoreBackingSegment(
  startBeat: number,
  endBeat: number,
  bpm: number,
  offset: number,
  audioDuration: number,
) {
  if (
    ![startBeat, endBeat, bpm, offset, audioDuration].every(Number.isFinite) ||
    bpm <= 0 ||
    endBeat <= startBeat ||
    audioDuration <= 0
  )
    return null;
  const audioStart = offset + (startBeat * 60) / bpm;
  const delay = Math.max(0, -audioStart);
  const sourceOffset = Math.max(0, audioStart);
  const duration = Math.min(
    ((endBeat - startBeat) * 60) / bpm - delay,
    audioDuration - sourceOffset,
  );
  return duration > 0 ? { delay, offset: sourceOffset, duration } : null;
}
