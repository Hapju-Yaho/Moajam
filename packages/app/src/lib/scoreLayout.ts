export const scoreBeatX = (offset: number, width: number) => 24 + (offset / 4) * (width - 40);

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
) {
  const minimums = measures.map((points) => scoreMeasureLayout(points, 0).width);
  const total = minimums.reduce((sum, width) => sum + width, 0);
  const extra = Math.max(0, availableWidth - total);
  const scale = total > 0 ? Math.min(1, Math.max(0, availableWidth) / total) : 1;
  return measures.map((points, index) => {
    const layout = scoreMeasureLayout(points, minimums[index] + extra / measures.length);
    const width = equalWidths
      ? Math.max(0, availableWidth) / measures.length
      : layout.width * scale;
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
  });
}

export function scoreBeamGroups(
  fragments: { offset: number; beats: number; note: { rest: boolean; blank?: boolean } }[],
) {
  const groups: number[][] = [];
  let group: number[] = [];
  const finish = () => {
    if (group.length > 1) groups.push(group);
    group = [];
  };
  fragments.forEach((fragment, index) => {
    if (fragment.note.rest || fragment.note.blank || fragment.beats >= 1) {
      finish();
      return;
    }
    const previous = group.length ? fragments[group.at(-1)!] : null;
    if (
      previous &&
      (Math.floor(previous.offset) !== Math.floor(fragment.offset) ||
        previous.offset + previous.beats !== fragment.offset)
    )
      finish();
    group.push(index);
  });
  finish();
  return groups;
}
