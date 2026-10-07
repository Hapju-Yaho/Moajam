export const scoreBeatX = (offset: number, width: number) => 24 + (offset / 4) * (width - 40);

// Match the 12px semibold TAB label, including its small staff-line knockout.
export function scoreTabLabel(fret: number | undefined, dead = false, parenthesized = false) {
  const label = dead ? 'X' : parenthesized ? `(${fret})` : String(fret ?? '');
  const width = [...label].reduce((sum, char) => sum + (char === '(' || char === ')' ? 4 : 7), 0);
  return { label, halfWidth: width / 2 + 1.5 };
}

export function scoreSlidePath(x1: number, y1: number, x2: number, y2: number) {
  const dx = x2 - x1,
    dy = y2 - y1;
  const length = Math.max(1, Math.hypot(dx, dy));
  const waves = Math.max(1, Math.round(length / 7));
  const steps = waves * 8;
  return Array.from({ length: steps + 1 }, (_, index) => {
    const t = index / steps;
    const wave = Math.sin(t * waves * Math.PI * 2) * Math.min(1.3, length / 10);
    return `${index ? 'L' : 'M'} ${x1 + dx * t - (dy / length) * wave} ${y1 + dy * t + (dx / length) * wave}`;
  }).join(' ');
}

// A filled ribbon shares pointed endpoints and has a subtly thicker middle.
// Anchors use note centers; vertical clearance keeps heads/fret numbers readable.
export function scoreConnectionArc(points: { x: number; y: number }[], side: -1 | 1) {
  const first = points[0],
    last = points.at(-1)!;
  const width = Math.max(1, last.x - first.x);
  const y1 = first.y + side * 7,
    y2 = last.y + side * 7;
  let bend = Math.max(5, Math.min(24, width * 0.18));
  for (const point of points.slice(1, -1)) {
    const t = (point.x - first.x) / width;
    if (t <= 0 || t >= 1) continue;
    const mix = 3 * t * t - 2 * t * t * t;
    const baseline = y1 + (y2 - y1) * mix;
    bend = Math.max(bend, (side * (point.y - baseline) + 8) / (3 * t * (1 - t)));
  }
  const thickness = Math.min(1.4, width / 12);
  const a = first.x + width / 3,
    b = last.x - width / 3;
  return {
    d: `M ${first.x} ${y1} C ${a} ${y1 + side * (bend + thickness)}, ${b} ${y2 + side * (bend + thickness)}, ${last.x} ${y2} C ${b} ${y2 + side * (bend - thickness)}, ${a} ${y1 + side * (bend - thickness)}, ${first.x} ${y1} Z`,
    labelX: (first.x + last.x) / 2,
    labelY: (y1 + y2) / 2 + side * (bend * 0.75 + 8),
  };
}

// The note farthest from the middle staff line decides a chord/beam's direction.
// On the middle line (or an equal distance on both sides), stems point down.
export function scoreStemDirection(positions: number[], middle = 102): -1 | 1 {
  return middle - Math.min(...positions) >= Math.max(...positions) - middle ? 1 : -1;
}

// Use the rendered stems (including a beam's shared direction), not pitch/string height.
// Mixed stems prefer the source's opposite side; endpoints can then be inset away
// from the destination stem on that side.
export function scoreConnectionSide(directions: number[]): -1 | 1 {
  const stems = directions.filter((direction) => direction !== 0);
  const balance = stems.reduce((sum, direction) => sum + direction, 0);
  return (balance || stems[0] || 1) > 0 ? -1 : 1;
}

// Midpoints partition the full measure into contiguous note selection regions.
export function scoreBeatHitRegions(
  offsets: number[],
  width: number,
  xAt = (offset: number) => scoreBeatX(offset, width),
) {
  const positions = [...new Set(offsets)]
    .sort((a, b) => a - b)
    .map((offset) => ({ offset, x: xAt(offset) }));
  return new Map(
    positions.map(({ offset, x }, index) => [
      offset,
      {
        left: index ? (positions[index - 1].x + x) / 2 : 0,
        right: index + 1 < positions.length ? (x + positions[index + 1].x) / 2 : width,
      },
    ]),
  );
}

// Use one horizontal scale per measure, including the final note-to-barline span.
// Glyph clearance sets the minimum scale; zero-time grace notes get separate space.
export function scoreMeasureLayout(
  points: { offset: number; space: number; leading?: number }[],
  requestedWidth: number,
) {
  const spaces = new Map<number, number>([
    [0, 8],
    [4, 0],
  ]);
  for (const point of points)
    if (point.offset >= 0 && point.offset < 4)
      spaces.set(point.offset, Math.max(spaces.get(point.offset) ?? 8, point.space));
  const beats = [...spaces.keys()].sort((a, b) => a - b);
  const leading = (beat: number) =>
    Math.max(0, ...points.filter((p) => p.offset === beat).map((p) => p.leading ?? 0));
  const leadingWidth = beats.reduce((sum, b) => sum + leading(b), 0);
  const baseSpace = Math.min(...beats.slice(0, -1).map((beat) => spaces.get(beat)!));
  // Wider glyphs (accidentals, chords, lyrics) get only their extra clearance.
  // Ordinary notes share a time scale instead of paying a fixed gap per note.
  const clearance = (beat: number) => Math.max(0, spaces.get(beat)! - baseSpace);
  const clearanceWidth = beats.slice(0, -1).reduce((sum, beat) => sum + clearance(beat), 0);
  const minimumPerBeat = Math.max(
    ...beats.slice(0, -1).map((beat, index) => baseSpace / (beats[index + 1] - beat)),
  );
  const width = Math.max(requestedWidth, minimumPerBeat * 4 + leadingWidth + clearanceWidth + 40);
  const perBeat = (width - leadingWidth - clearanceWidth - 40) / 4;
  const positions = [24 + leading(0)];
  for (let i = 1; i < beats.length; i++)
    positions.push(
      positions[i - 1] +
        clearance(beats[i - 1]) +
        leading(beats[i]) +
        perBeat * (beats[i] - beats[i - 1]),
    );
  return {
    width,
    xAt(offset: number) {
      const at = Math.max(0, Math.min(4, offset));
      const right = beats.findIndex((beat) => beat >= at);
      if (right <= 0) return positions[0];
      return (
        positions[right - 1] +
        ((positions[right] - positions[right - 1]) * (at - beats[right - 1])) /
          (beats[right] - beats[right - 1])
      );
    },
  };
}

export function scoreSystemLayouts(
  measures: { offset: number; space: number; minSpace?: number; leading?: number }[][],
  availableWidth: number,
  equalWidths = false,
  weights: number[] = [],
  durations: number[] = [],
) {
  measures = measures.map((points, index) =>
    points.map((point) => ({ ...point, offset: (point.offset * 4) / (durations[index] ?? 4) })),
  );
  const minimums = measures.map((points) => scoreMeasureLayout(points, 0).width);
  const total = minimums.reduce((sum, width) => sum + width, 0);
  const extra = Math.max(0, availableWidth - total);
  const scale = total > 0 ? Math.min(1, Math.max(0, availableWidth) / total) : 1;
  const preferred = minimums.map(
    (minimum, index) =>
      ((equalWidths
        ? Math.max(0, availableWidth) / measures.length
        : (minimum + extra / measures.length) * scale) *
        (weights[index] ?? 100)) /
      100,
  );
  const preferredTotal = preferred.reduce((sum, width) => sum + width, 0);
  return measures
    .map((points, index) => {
      const layout = scoreMeasureLayout(points, minimums[index] + extra / measures.length);
      const width =
        preferredTotal > 0 ? (preferred[index] / preferredTotal) * Math.max(0, availableWidth) : 0;
      if (width >= layout.width) return scoreMeasureLayout(points, width);
      const compact = scoreMeasureLayout(
        points.map((point) => ({ ...point, space: point.minSpace ?? point.space })),
        0,
      );
      if (compact.width < layout.width && width >= compact.width) {
        const ratio = (width - compact.width) / (layout.width - compact.width);
        return {
          width,
          xAt: (offset: number) =>
            compact.xAt(offset) + (layout.xAt(offset) - compact.xAt(offset)) * ratio,
        };
      }
      // Keep the chosen measures on this line. Dense measures receive proportionally
      // more width; when space is tight, compress positions without shrinking glyphs.
      return { width, xAt: (offset: number) => compact.xAt(offset) * (width / compact.width) };
    })
    .map((layout, index) => ({
      ...layout,
      xAt: (offset: number) => layout.xAt((offset * 4) / (durations[index] ?? 4)),
    }));
}

export function scoreBeamGroups(
  fragments: {
    offset: number;
    beats: number;
    note: { rest: boolean; blank?: boolean; tuplet?: 3 };
  }[],
) {
  const groups: number[][] = [];
  let group: number[] = [];
  const finish = () => {
    if (group.length > 1) groups.push(group);
    group = [];
  };
  fragments.forEach((fragment, index) => {
    if (
      fragment.note.rest ||
      fragment.note.blank ||
      fragment.beats === 0 ||
      fragment.beats * (fragment.note.tuplet ? 1.5 : 1) >= 1
    ) {
      finish();
      return;
    }
    const previous = group.length ? fragments[group.at(-1)!] : null;
    if (
      previous &&
      (Math.floor(previous.offset) !== Math.floor(fragment.offset) ||
        Math.abs(previous.offset + previous.beats - fragment.offset) > 1e-7 ||
        !!previous.note.tuplet !== !!fragment.note.tuplet ||
        (fragment.note.tuplet === 3 && group.length === 3))
    )
      finish();
    group.push(index);
  });
  finish();
  return groups;
}
// Adjacent seconds share a stem but alternate its sides. Unisons need distinct
// heads too, so a third simultaneous alteration can occupy a third lane.
export function scoreChordHeadOffsets(ys: number[], direction: number): number[] {
  const offsets = ys.map(() => 0);
  const lanes: number[][] = [];
  const order = ys.map((y, index) => ({ y, index })).sort((a, b) => direction * (a.y - b.y));
  for (const { y, index } of order) {
    let lane = lanes.findIndex((taken) => taken.every((other) => Math.abs(other - y) > 5.1));
    if (lane < 0) lane = lanes.length;
    (lanes[lane] ??= []).push(y);
    offsets[index] = -direction * lane * 9;
  }
  return offsets;
}

export function scoreAccidentalColumns(ys: number[], marks: string[]): number[] {
  const columns: number[][] = [];
  const result = ys.map(() => 0);
  ys.map((y, index) => ({ y, index }))
    .sort((a, b) => a.y - b.y)
    .forEach(({ y, index }) => {
      if (!marks[index]) return;
      let column = columns.findIndex((taken) => taken.every((other) => Math.abs(other - y) >= 22));
      if (column < 0) column = columns.length;
      (columns[column] ??= []).push(y);
      result[index] = column * 12;
    });
  return result;
}
