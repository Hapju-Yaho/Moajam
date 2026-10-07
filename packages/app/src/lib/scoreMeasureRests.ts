import { scorePartStaves } from './scoreParts';
import {
  scoreBeat,
  scoreBarBeats,
  scoreMeasureDuration,
  scoreMeasures,
  scoreChordPositions,
  scoreMeasureStart,
  scoreSystemRows,
  spliceScorePartTime,
  type Score,
} from './score';

export function scoreSilentMeasures(score: Score, parts: string[], count: number) {
  const measures = parts.map((part) => scoreMeasures(score, part));
  return Array.from({ length: count }, (_, bar) => {
    if (
      score.repeats?.[bar] ||
      score.barlines?.[bar] ||
      Object.keys(score.navigation?.[bar] ?? {}).length ||
      parts.some((part) => Object.keys(score.directions?.[part]?.[bar] ?? {}).length)
    )
      return false;
    let written = false;
    return (
      parts.every((part, index) => {
        const fragments = measures[index][bar] ?? [];
        const duration = scoreMeasureDuration(score, part, bar);
        const start = scoreMeasureStart(score, part, bar);
        if (
          duration !== scoreBarBeats(score) ||
          Object.keys(score.guitarToneChanges?.[part] ?? {}).some(
            (beat) => +beat >= start && +beat < start + duration,
          ) ||
          Object.keys(scoreChordPositions(score, part)).some(
            (beat) => +beat >= start && +beat < start + duration,
          )
        )
          return false;
        if (!fragments.length) return true;
        written = true;
        return (
          fragments.every((f) => f.note.rest && !f.note.blank && !f.note.lyric && !f.note.chord) &&
          scoreBeat(fragments.reduce((sum, f) => sum + f.beats, 0)) === duration
        );
      }) && written
    );
  });
}

export function scoreCompactSystems(
  silent: boolean[],
  expandedBar?: number,
  configured: Record<number, number> = {},
  layout?: ReturnType<typeof scoreSystemRows>,
) {
  const units: { bar: number; span: number }[] = [];
  const marked = new Set<number>();
  for (const [start, count] of Object.entries(configured))
    for (let i = 0; i < count; i++) marked.add(Number(start) + i);
  for (let bar = 0; bar < silent.length;) {
    let end = bar + 1;
    if (silent[bar] && marked.has(bar))
      while (
        end < silent.length &&
        silent[end] &&
        marked.has(end) &&
        !layout?.some((row) => row.start === end)
      )
        end++;
    units.push({ bar, span: end - bar });
    bar = end;
  }
  // Keep the original line boundaries. Only the selected bar opens; both sides
  // remain compact and regroup as the cursor moves through the silent passage.
  const expandSelection = (row: typeof units) =>
    row.flatMap((unit) => {
      if (
        expandedBar === undefined ||
        expandedBar < unit.bar ||
        expandedBar >= unit.bar + unit.span
      )
        return [unit];
      const left = expandedBar - unit.bar,
        right = unit.span - left - 1;
      return [
        ...(left ? [{ bar: unit.bar, span: left }] : []),
        { bar: expandedBar, span: 1 },
        ...(right ? [{ bar: expandedBar + 1, span: right }] : []),
      ];
    });
  if (layout)
    return layout.map((row) => ({
      ...row,
      units: expandSelection(
        units.filter((unit) => unit.bar >= row.start && unit.bar < row.start + row.count),
      ),
    }));
  const systems: { start: number; count: number; capacity: number; units: typeof units }[] = [];
  for (let i = 0; i < units.length;) {
    // A long introduction and its pickup share the first line, like a printed drum chart.
    const row = units.slice(i, i + (units[i].span > 1 ? 2 : 4));
    systems.push({
      start: row[0].bar,
      count: row.at(-1)!.bar + row.at(-1)!.span - row[0].bar,
      capacity: row.some((unit) => unit.span > 1)
        ? row.at(-1)!.bar + row.at(-1)!.span - row[0].bar
        : 4,
      units: expandSelection(row),
    });
    i += row.length;
  }
  return systems;
}

/** Explicit measure-rest input replaces this bar in every staff of this instrument, preserving later time. */
export function inputScoreMeasureRest(
  score: Score,
  part: string,
  bar: number,
  makeId = () => crypto.randomUUID(),
): Score {
  if (!score.parts.includes(part)) throw new Error('입력할 악기를 선택해주세요.');
  const pair = scorePartStaves(score, part);
  if (!Number.isInteger(bar) || bar < 0 || bar >= 32000)
    throw new Error('입력할 마디를 선택해주세요.');
  let next = score;
  for (const voice of pair) {
    const start = scoreMeasureStart(next, voice, bar),
      duration = scoreMeasureDuration(next, voice, bar);
    next = spliceScorePartTime(next, voice, start, start + duration, duration, makeId);
    let position = 0;
    next = {
      ...next,
      notes: next.notes.map((n) => {
        if (n.part !== voice) return n;
        const at = position;
        position = scoreBeat(position + n.beats);
        return at === start && n.blank && n.beats === duration
          ? { ...n, blank: false, rest: true }
          : n;
      }),
    };
  }
  const groups = measureRestFlags(next.multiMeasureRests?.[pair[0]]);
  groups[bar] = 1;
  return { ...next, multiMeasureRests: { ...next.multiMeasureRests, [pair[0]]: groups } };
}

function measureRestFlags(groups: Record<number, number> = {}) {
  const flags: Record<number, number> = {};
  for (const [start, count] of Object.entries(groups))
    for (let i = 0; i < count; i++) flags[Number(start) + i] = 1;
  return flags;
}

export function clearScoreMeasureRest(score: Score, part: string, bar: number): Score {
  const owner = scorePartStaves(score, part)[0];
  const groups = measureRestFlags(score.multiMeasureRests?.[owner]);
  delete groups[bar];
  return { ...score, multiMeasureRests: { ...score.multiMeasureRests, [owner]: groups } };
}

export function scoreMeasureRestBars(score: Score, part: string): Set<number> {
  const pair = scorePartStaves(score, part);
  const measures = pair.map((voice) => scoreMeasures(score, voice));
  return new Set(
    Object.keys(measureRestFlags(score.multiMeasureRests?.[pair[0]]))
      .map(Number)
      .filter(
        (bar) =>
          measures.some((rows) => rows[bar]?.length) &&
          measures.every((rows, index) => {
            const fragments = rows[bar] ?? [];
            return (
              !fragments.length ||
              (fragments.every((f) => f.note.rest && !f.note.blank) &&
                scoreBeat(fragments.reduce((sum, f) => sum + f.beats, 0)) ===
                  scoreMeasureDuration(score, pair[index], bar))
            );
          }),
      ),
  );
}

/** Delete the rest symbol in every staff of this instrument, retaining the bar and every later beat. */
export function deleteScoreMeasureRest(
  score: Score,
  part: string,
  bar: number,
  makeId = () => crypto.randomUUID(),
): Score {
  if (!scoreMeasureRestBars(score, part).has(bar)) return score;
  const pair = scorePartStaves(score, part);
  let next = clearScoreMeasureRest(score, part, bar);
  for (const voice of pair) {
    const start = scoreMeasureStart(next, voice, bar),
      duration = scoreMeasureDuration(next, voice, bar);
    next = spliceScorePartTime(next, voice, start, start + duration, duration, makeId);
  }
  return next;
}

export function scoreRestSystems(
  score: Score,
  pair: string[],
  count: number,
  expandedBar?: number,
) {
  const marked = pair.map((part) => scoreMeasureRestBars(score, part));
  return scoreCompactSystems(
    scoreSilentMeasures(score, pair, count),
    expandedBar,
    Object.fromEntries(
      Array.from({ length: count }, (_, bar) => bar)
        .filter((bar) => marked.every((bars) => bars.has(bar)))
        .map((bar) => [bar, 1]),
    ),
    score.systemLayout?.[pair[0]]?.length ? scoreSystemRows(score, pair[0], count) : undefined,
  );
}
