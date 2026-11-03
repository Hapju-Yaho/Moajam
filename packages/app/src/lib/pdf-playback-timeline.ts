export type PdfMeasureRepeat = {
  start: boolean;
  end: { target: number; times: number } | null;
  ending: { passes: number[]; end: number } | null;
};
type Measure = { number?: number; meter: number[]; restCount?: number | null; repeat?: PdfMeasureRepeat | null };
export type PdfTimelineEntry<T extends Measure> = {
  measure: T; start: number; end: number; gapStart: number; gapBars: number; gapBarLength: number;
  restOffset?: number; restBars?: number; visit?: number;
};
export function pdfPlaybackTimeline<T extends Measure>(measures: T[]): PdfTimelineEntry<T>[] {
  if (measures.some((m) => m.repeat?.end || m.repeat?.ending)) return unfoldedTimeline(measures);
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

export function pdfMeasureBeat<T extends Measure>(timeline: PdfTimelineEntry<T>[], number: number, reference = 0, end = false) {
  const candidates: number[] = [];
  for (const entry of timeline) {
    const first = (entry.measure.number ?? 1) + (entry.restOffset ?? 0);
    const length = entry.measure.meter[0] * 4 / entry.measure.meter[1];
    if (number >= first && number < first + (entry.restBars ?? entry.measure.restCount ?? 1)) candidates.push(entry.start + (number - first + (end ? 1 : 0)) * length);
    if (number >= first - entry.gapBars && number < first && entry.gapBars) candidates.push(entry.start - (first - number - (end ? 1 : 0)) * entry.gapBarLength);
  }
  return candidates.sort((a, b) => Math.abs(a - reference) - Math.abs(b - reference) || a - b)[0] ?? timeline.at(-1)?.end ?? 0;
}

function unfoldedTimeline<T extends Measure>(measures: T[]): PdfTimelineEntry<T>[] {
  const first = measures[0]?.number ?? 1;
  const lastMeasure = measures.at(-1);
  if (!lastMeasure) return [];
  const last = (lastMeasure.number ?? first) + (lastMeasure.restCount ?? 1) - 1;
  const bars = new Map<number, { measure?: T; length: number }>();
  let index = 0;
  let meter = measures[0].meter;
  for (let number = first; number <= last; number++) {
    while (index + 1 < measures.length && (measures[index + 1].number ?? 1) <= number) index++;
    const candidate = measures[index];
    const visible = number < (candidate.number ?? 1) + (candidate.restCount ?? 1);
    if (visible) meter = candidate.meter;
    bars.set(number, { measure: visible ? candidate : undefined, length: meter[0] * 4 / meter[1] });
  }
  const ends = measures.filter((m) => m.repeat?.end).map((m) => ({ number: (m.number ?? 1) + (m.restCount ?? 1) - 1, ...m.repeat!.end! }));
  const endings = measures.filter((m) => m.repeat?.ending).map((m) => {
    const start = m.number ?? 1;
    const ending = m.repeat!.ending!;
    const owner = ends.filter((e) => e.target <= start && e.number >= start).sort((a, b) => a.number - b.number)[0]
      ?? ends.filter((e) => e.number < start).at(-1);
    return { start, ...ending, owner };
  });
  const passes = new Map<number, number>();
  const visits = new Map<T, number>();
  const result: PdfTimelineEntry<T>[] = [];
  let number = first;
  let time = 0;
  let gapStart = 0;
  let gapBars = 0;
  let gapLength = 0;
  let steps = 0;
  while (number <= last) {
    if (++steps > 65536) throw new Error('반복 재생 순서가 너무 길어요. 반복 횟수와 괄호 범위를 확인해주세요.');
    const ending = endings.find((e) => e.start === number);
    if (ending?.owner && !ending.passes.includes(passes.get(ending.owner.number) ?? 1)) {
      // The printed bracket line can stop early or at a system break. Its first
      // ending branch still extends to the associated repeat-end barline.
      const branchEnd = ending.start <= ending.owner.number ? Math.max(ending.end, ending.owner.number) : ending.end;
      number = branchEnd + 1;
      continue;
    }
    const bar = bars.get(number);
    if (!bar) throw new Error('반복 시작 마디가 악보 범위를 벗어났어요.');
    if (!bar.measure) {
      if (!gapBars) gapStart = time;
      gapBars++; gapLength = bar.length; time += bar.length;
    } else {
      const previous = result.at(-1);
      const offset = number - (bar.measure.number ?? 1);
      if (!gapBars && previous?.measure === bar.measure && (previous.restOffset ?? 0) + (previous.restBars ?? 1) === offset) {
        previous.end += bar.length;
        previous.restBars = (previous.restBars ?? 1) + 1;
      } else {
        const visit = (visits.get(bar.measure) ?? 0) + 1;
        visits.set(bar.measure, visit);
        result.push({ measure: bar.measure, start: time, end: time + bar.length,
          gapStart: gapBars ? gapStart : time, gapBars, gapBarLength: gapLength,
          restOffset: offset, restBars: 1, visit });
      }
      time += bar.length; gapBars = 0;
    }
    const end = ends.find((e) => e.number === number);
    if (end && (passes.get(number) ?? 1) < end.times) {
      if (end.target < first || end.target > number) throw new Error('돌아갈 마디를 확인해주세요.');
      passes.set(number, (passes.get(number) ?? 1) + 1);
      for (const inner of ends) if (inner.target >= end.target && inner.number < end.number) passes.delete(inner.number);
      number = end.target;
    } else number++;
  }
  return result;
}
