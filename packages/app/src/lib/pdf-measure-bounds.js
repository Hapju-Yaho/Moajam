/** Each staff system has one shared vertical extent. */
export function normalizeMeasureRows(rows) {
    return rows.map((m) => {
        const peers = rows.filter((p) => p.page === m.page && p.system === m.system);
        return { ...m, bounds: [m.bounds[0], Math.min(...peers.map((p) => p.bounds[1])),
                m.bounds[2], Math.max(...peers.map((p) => p.bounds[3]))] };
    });
}
/** Move shared barlines together, retaining at least one coordinate unit per bar. */
export function changeMeasureBounds(rows, selected, bounds) {
    const target = rows[selected];
    if (!target)
        return rows;
    const peers = rows.map((m, i) => ({ m, i }))
        .filter(({ m }) => m.page === target.page && m.system === target.system)
        .sort((a, b) => a.m.bounds[0] - b.m.bounds[0]);
    const position = peers.findIndex(({ i }) => i === selected);
    const previous = peers[position - 1], next = peers[position + 1];
    const left = Math.max(previous ? previous.m.bounds[0] + 1 : 0, Math.min(bounds[0], target.bounds[2] - 1));
    const right = Math.min(next ? next.m.bounds[2] - 1 : 1000, Math.max(bounds[2], left + 1));
    const top = Math.max(0, Math.min(bounds[1], bounds[3] - 1));
    const bottom = Math.min(1000, Math.max(top + 1, bounds[3]));
    return rows.map((m, i) => {
        if (m.page !== target.page || m.system !== target.system)
            return m;
        const b = [...m.bounds];
        b[1] = top;
        b[3] = bottom;
        if (i === selected) {
            b[0] = left;
            b[2] = right;
        }
        if (previous?.i === i && left !== target.bounds[0])
            b[2] = left;
        if (next?.i === i && right !== target.bounds[2])
            b[0] = right;
        return { ...m, bounds: b };
    });
}
//# sourceMappingURL=pdf-measure-bounds.js.map