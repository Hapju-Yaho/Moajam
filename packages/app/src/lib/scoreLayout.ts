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

// Justify actual notation, not empty input placeholders. Reserve enough horizontal
// space for glyphs and chord names, then share remaining space by musical time.
export function scoreMeasureLayout(
  points: { offset: number; space: number }[],
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
  const minimum = [...spaces.values()].reduce((sum, value) => sum + value, 0);
  const width = Math.max(requestedWidth, minimum + 40);
  const extra = width - 40 - minimum;
  const positions = [24];
  for (let i = 1; i < beats.length; i++)
    positions.push(
      positions[i - 1] + spaces.get(beats[i - 1])! + (extra * (beats[i] - beats[i - 1])) / 4,
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
  measures: { offset: number; space: number; minSpace?: number }[][],
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
