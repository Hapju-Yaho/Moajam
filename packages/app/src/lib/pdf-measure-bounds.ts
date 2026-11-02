type Measure = { page: number; system: number; bounds: number[] };

/** Translate a whole staff system without resizing or leaving the PDF page. */
export function moveMeasureRow<T extends Measure>(rows: T[], selected: number, dx: number, dy: number): T[] {
  const selectedRow = rows[selected];
  if (!selectedRow) return rows;
  const peers = rows.filter((m) => m.page === selectedRow.page && m.system === selectedRow.system);
  const x = Math.max(-Math.min(...peers.map((m) => m.bounds[0])), Math.min(dx, 1000 - Math.max(...peers.map((m) => m.bounds[2]))));
  const y = Math.max(-Math.min(...peers.map((m) => m.bounds[1])), Math.min(dy, 1000 - Math.max(...peers.map((m) => m.bounds[3]))));
  return rows.map((m) => m.page === selectedRow.page && m.system === selectedRow.system
    ? { ...m, bounds: [m.bounds[0] + x, m.bounds[1] + y, m.bounds[2] + x, m.bounds[3] + y] } : m);
}

/** Each staff system has one shared vertical extent. */
export function normalizeMeasureRows<T extends Measure>(rows: T[]): T[] {
  return rows.map((m) => {
    const peers = rows.filter((p) => p.page === m.page && p.system === m.system);
    return { ...m, bounds: [m.bounds[0], Math.min(...peers.map((p) => p.bounds[1])),
      m.bounds[2], Math.max(...peers.map((p) => p.bounds[3]))] };
  });
}

/** Move shared barlines together, retaining at least one coordinate unit per bar. */
export function changeMeasureBounds<T extends Measure>(rows: T[], selected: number, bounds: number[]): T[] {
  const target = rows[selected];
  if (!target) return rows;
  const peers = rows.map((m, i) => ({ m, i }))
    .filter(({ m }) => m.page === target.page && m.system === target.system)
    .sort((a, b) => a.m.bounds[0] - b.m.bounds[0]);
  const position = peers.findIndex(({ i }) => i === selected);
  const previous = peers[position - 1], next = peers[position + 1];
  const left = Math.max(previous ? previous.m.bounds[0] + 1 : 0,
    Math.min(bounds[0], target.bounds[2] - 1));
  const right = Math.min(next ? next.m.bounds[2] - 1 : 1000, Math.max(bounds[2], left + 1));
  const top = Math.max(0, Math.min(bounds[1], bounds[3] - 1));
  const bottom = Math.min(1000, Math.max(top + 1, bounds[3]));
  return rows.map((m, i) => {
    if (m.page !== target.page || m.system !== target.system) return m;
    const b = [...m.bounds];
    b[1] = top; b[3] = bottom;
    if (i === selected) { b[0] = left; b[2] = right; }
    if (previous?.i === i && left !== target.bounds[0]) b[2] = left;
    if (next?.i === i && right !== target.bounds[2]) b[0] = right;
    return { ...m, bounds: b };
  });
}
