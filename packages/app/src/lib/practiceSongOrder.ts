export type PracticeSong = { id: string; title: string; artist: string };
export type PracticeSongListProps = {
  songs: PracticeSong[];
  selectedId?: string;
  onSelect: (id: string) => void;
  onReorder: (ids: string[]) => void;
};
export function orderPracticeSongs<T extends { id: string }>(songs: T[], order: string[]) {
  const rank = new Map(order.map((id, index) => [id, index]));
  return [...songs].sort(
    (a, b) => (rank.get(a.id) ?? order.length) - (rank.get(b.id) ?? order.length),
  );
}
export function movePracticeSong(ids: string[], source: string, target: string) {
  const from = ids.indexOf(source),
    to = ids.indexOf(target);
  if (from < 0 || to < 0 || from === to) return ids;
  const next = [...ids];
  next.splice(from, 1);
  next.splice(to, 0, source);
  return next;
}
