type Measure = { page: number; system: number; bounds: number[] };

/** Include every measure's annotations in the shared staff-system height. */
export function normalizeMeasureRows<T extends Measure>(rows: T[]): T[] {
  const extents = new Map<string, [number, number]>();
  for (const measure of rows) {
    const key = `${measure.page}:${measure.system}`;
    const previous = extents.get(key);
    extents.set(key, [
      Math.min(previous?.[0] ?? measure.bounds[1], measure.bounds[1]),
      Math.max(previous?.[1] ?? measure.bounds[3], measure.bounds[3]),
    ]);
  }
  return rows.map((measure) => {
    const [top, bottom] = extents.get(`${measure.page}:${measure.system}`)!;
    return { ...measure, bounds: [measure.bounds[0], top, measure.bounds[2], bottom] };
  });
}
