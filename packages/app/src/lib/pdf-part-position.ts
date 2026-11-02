type Measure = { page: number; bounds: number[]; meter: number[]; restCount?: number | null };

/** Locate the target part nearest to the current measure on the PDF. */
export function nearestPdfPartPosition(source: Measure | undefined, measures: Measure[]): number {
  if (!source || !measures.length) return 0;
  const distance = (measure: Measure) => {
    const page = Math.abs(measure.page - source.page);
    const y = Math.abs((measure.bounds[1] + measure.bounds[3] - source.bounds[1] - source.bounds[3]) / 2);
    const x = Math.abs((measure.bounds[0] + measure.bounds[2] - source.bounds[0] - source.bounds[2]) / 2);
    return page * 1_000_000 + y * 1000 + x;
  };
  let nearest = 0;
  for (let i = 1; i < measures.length; i++) {
    if (distance(measures[i]) < distance(measures[nearest])) nearest = i;
  }
  return measures.slice(0, nearest).reduce((beats, measure) =>
    beats + measure.meter[0] * 4 / measure.meter[1] * (measure.restCount ?? 1), 0);
}
