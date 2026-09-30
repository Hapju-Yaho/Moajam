type Row = Record<string, unknown>;
export const isWorkspaceDocumentKey = (key: string) =>
  /^(recommendations|songs|rehearsals|song\/[\w-]+\/(discussion|feedback|checks|arrangement|links|session\/[\w-]+\/memo)|session\/[\w-]+\/(memo|members|checks|tasks)|recommendation\/[\w-]+\/comments)$/.test(
    key,
  );
const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const object = (value: unknown): value is Row =>
  !!value && typeof value === 'object' && !Array.isArray(value);
const rows = (value: unknown): value is Row[] =>
  Array.isArray(value) &&
  value.length <= 3000 &&
  value.every((row) => object(row) && typeof row.id === 'string') &&
  new Set(value.map((row) => row.id)).size === value.length;
const omit = (row: Row, keys: string[]) =>
  Object.fromEntries(Object.entries(row).filter(([key]) => !keys.includes(key)));
const ownReaction = (before: unknown, after: unknown, user: string) =>
  Array.isArray(after) &&
  after.every((id) => typeof id === 'string') &&
  new Set(after).size === after.length &&
  equal(
    (Array.isArray(before) ? before : []).filter((id) => id !== user),
    after.filter((id) => id !== user),
  );
function authored(before: unknown, after: unknown, user: string, owner: boolean): boolean {
  if (!rows(after)) return false;
  const previous = rows(before) ? before : [];
  if (
    previous.some(
      (row) => !after.some((next) => next.id === row.id) && row.authorId !== user && !owner,
    )
  )
    return false;
  return after.every((next) => {
    if (
      next.videoUrl !== undefined &&
      (typeof next.videoUrl !== 'string' ||
        next.videoUrl.length > 4000 ||
        !/^https?:\/\//.test(next.videoUrl))
    )
      return false;
    const old = previous.find((row) => row.id === next.id);
    if (!old)
      return (
        next.authorId === user &&
        typeof next.text === 'string' &&
        String(next.text).length <= 20000 &&
        (owner || !next.resolved) &&
        (next.likes === undefined || ownReaction([], next.likes, user)) &&
        (next.replies === undefined || authored([], next.replies, user, owner))
      );
    if (next.authorId !== old.authorId || typeof next.text !== 'string' || next.text.length > 20000)
      return false;
    if (!owner && next.resolved !== old.resolved) return false;
    if (
      (next.likes !== undefined || old.likes !== undefined) &&
      !ownReaction(old.likes, next.likes ?? [], user)
    )
      return false;
    if (
      (next.replies !== undefined || old.replies !== undefined) &&
      !authored(old.replies, next.replies ?? [], user, owner)
    )
      return false;
    if (owner || old.authorId === user) return true;
    return (
      equal(omit(old, ['likes', 'replies']), omit(next, ['likes', 'replies'])) &&
      (next.likes === undefined || ownReaction(old.likes, next.likes, user)) &&
      (next.replies === undefined || authored(old.replies, next.replies, user, false))
    );
  });
}
export function canWriteDocument(
  key: string,
  before: unknown,
  after: unknown,
  user: string,
  owner: boolean,
): boolean {
  if (key === 'recommendations') {
    if (!rows(after)) return false;
    const previous = rows(before) ? before : [];
    if (
      previous.some(
        (row) => !after.some((next) => next.id === row.id) && row.authorId !== user && !owner,
      )
    )
      return false;
    return after.every((next) => {
      if (typeof next.title !== 'string' || typeof next.artist !== 'string') return false;
      const old = previous.find((row) => row.id === next.id);
      if (!old)
        return (
          next.authorId === user &&
          next.likes === 0 &&
          next.votes === 0 &&
          (next.likedBy === undefined || equal(next.likedBy, [])) &&
          (next.votedBy === undefined || equal(next.votedBy, []))
        );
      if (next.authorId !== old.authorId) return false;
      const editable = owner
        ? ['title', 'artist', 'reason', 'referenceUrl', 'deferred', 'deferredReason']
        : old.authorId === user
          ? ['title', 'artist', 'reason', 'referenceUrl']
          : [];
      if (
        !equal(
          omit(old, [
            ...editable,
            'likedBy',
            'votedBy',
            'likedByMe',
            'votedByMe',
            'likes',
            'votes',
          ]),
          omit(next, [
            ...editable,
            'likedBy',
            'votedBy',
            'likedByMe',
            'votedByMe',
            'likes',
            'votes',
          ]),
        )
      )
        return false;
      return (
        ['likedBy', 'votedBy'].every((field) => ownReaction(old[field], next[field] ?? [], user)) &&
        (['likes', 'votes'] as const).every((field, index) => {
          const people = index ? 'votedBy' : 'likedBy';
          const delta =
            Number((next[people] as string[] | undefined)?.includes(user) ?? false) -
            Number((old[people] as string[] | undefined)?.includes(user) ?? false);
          return next[field] === Number(old[field]) + delta;
        })
      );
    });
  }
  if (key === 'songs') {
    if (!rows(after)) return false;
    if (owner) return true;
    if (!rows(before) || before.length !== after.length) return false;
    return before.every((old) => {
      const next = after.find((row) => row.id === old.id);
      if (equal(old, next)) return true;
      if (!next || !object(old.participants) || !object(next.participants)) return false;
      if (
        !equal(
          omit(old, ['participants', 'ready', 'total', 'status', 'myStatus', 'myPart']),
          omit(next, ['participants', 'ready', 'total', 'status', 'myStatus', 'myPart']),
        )
      )
        return false;
      if (!equal(omit(old.participants, [user]), omit(next.participants, [user]))) return false;
      const previous = old.participants[user];
      const current = next.participants[user];
      return (
        object(previous) &&
        object(current) &&
        equal(omit(previous, ['status']), omit(current, ['status'])) &&
        ['NOT_READY', 'PRACTICING', 'READY'].includes(String(current.status))
      );
    });
  }
  if (key === 'rehearsals')
    return (
      owner &&
      rows(after) &&
      after.every(
        (row) =>
          typeof row.date === 'string' &&
          /^\d{4}-\d{2}-\d{2}$/.test(row.date) &&
          Number.isFinite(Date.parse(`${row.date}T00:00:00Z`)) &&
          new Date(`${row.date}T00:00:00Z`).toISOString().slice(0, 10) === row.date &&
          typeof row.start === 'string' &&
          typeof row.end === 'string' &&
          /^([01]\d|2[0-3]):[0-5]\d$/.test(row.start) &&
          /^([01]\d|2[0-3]):[0-5]\d$/.test(row.end) &&
          row.start < row.end,
      )
    );
  if (key.endsWith('/feedback'))
    return (
      rows(after) &&
      after.every(
        (note) => typeof note.time === 'number' && Number.isFinite(note.time) && note.time >= 0,
      ) &&
      authored(before, after, user, owner)
    );
  if (key.endsWith('/comments') || key.endsWith('/discussion'))
    return authored(before, after, user, owner);
  if (key.endsWith('/members'))
    return (
      Array.isArray(after) &&
      after.every((id) => typeof id === 'string') &&
      (owner || ownReaction(before, after, user))
    );
  if (key.endsWith('/arrangement'))
    return (
      owner &&
      object(after) &&
      typeof after.key === 'string' &&
      typeof after.structure === 'string' &&
      typeof after.bpm === 'string' &&
      /^\d{0,3}$/.test(after.bpm)
    );
  if (key.endsWith('/memo')) return typeof after === 'string' && after.length <= 50000;
  if (key.endsWith('/checks') || key.endsWith('/tasks'))
    return (
      rows(after) &&
      after.every(
        (row) =>
          typeof row.label === 'string' &&
          row.label.length <= 2000 &&
          typeof row.done === 'boolean' &&
          (!key.endsWith('/tasks') || typeof row.assigneeId === 'string') &&
          (row.assigneeId === undefined || typeof row.assigneeId === 'string') &&
          (row.sourceOpinionId === undefined || typeof row.sourceOpinionId === 'string'),
      )
    );
  if (key.endsWith('/links')) {
    if (!rows(after)) return false;
    const previous = rows(before) ? before : [];
    if (
      previous.some(
        (old) => !after.some((next) => next.id === old.id) && !owner && old.authorId !== user,
      )
    )
      return false;
    return after.every((next) => {
      if (
        typeof next.title !== 'string' ||
        !next.title.trim() ||
        next.title.length > 300 ||
        typeof next.url !== 'string' ||
        next.url.length > 4000
      )
        return false;
      try {
        const url = new URL(next.url);
        if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password)
          return false;
      } catch {
        return false;
      }
      const old = previous.find((row) => row.id === next.id);
      if (!old) return next.authorId === user;
      if (next.authorId !== old.authorId) return false;
      return owner || old.authorId === user || equal(old, next);
    });
  }
  return false;
}
