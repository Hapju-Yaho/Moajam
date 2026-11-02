type Measure = { number?: number; meter: number[]; restCount?: number | null };
export function pdfPlaybackTimeline<T extends Measure>(measures: T[]) {
  let cursor = 0;
  return measures.map((measure, index) => {
    const previous = measures[index - 1];
    const gapBars = previous && previous.number !== undefined && measure.number !== undefined
      ? Math.max(0, measure.number - previous.number - (previous.restCount ?? 1)) : 0;
    const gapBarLength = previous ? previous.meter[0] * 4 / previous.meter[1] : 0;
    const gapStart = cursor;
    cursor += gapBars * gapBarLength;
    const start = cursor;
    cursor += measure.meter[0] * 4 / measure.meter[1] * (measure.restCount ?? 1);
    return { measure, start, end: cursor, gapStart, gapBars, gapBarLength };
  });
}
export function pdfTimelinePosition<T extends Measure>(timeline: ReturnType<typeof pdfPlaybackTimeline<T>>, position: number) {
  const last = timeline.at(-1);
  const active = timeline.find((entry) => position >= entry.start && position < entry.end)
    ?? (last && position >= last.end ? last : undefined);
  const waiting = timeline.find((entry) => position >= entry.gapStart && position < entry.start);
  const remainingBars = waiting ? Math.max(1, Math.ceil((waiting.start - position) / waiting.gapBarLength - 1e-8)) : 0;
  return { active, waiting, remainingBars };
}
