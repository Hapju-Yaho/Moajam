import { trackClips, withClips, type TimelineTrack } from './practiceClips';
export type PracticeDocument = {
  tracks: TimelineTrack[];
  notes: { id: string; time: number; text: string }[];
  [key: string]: unknown;
};
const audioBytes = new WeakMap<Blob, Uint8Array>();
export async function identifyAudio(value: unknown): Promise<void> {
  if (value instanceof Blob) {
    if (!audioBytes.has(value)) audioBytes.set(value, new Uint8Array(await value.arrayBuffer()));
    return;
  }
  if (Array.isArray(value)) {
    await Promise.all(value.map(identifyAudio));
    return;
  }
  if (value && typeof value === 'object')
    await Promise.all(Object.values(value).map(identifyAudio));
}
export function samePractice(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a instanceof Blob && b instanceof Blob) {
    if (a.size !== b.size || a.type !== b.type) return false;
    const left = audioBytes.get(a),
      right = audioBytes.get(b);
    return !!left && !!right && left.every((value, index) => value === right[index]);
  }
  if (Array.isArray(a) && Array.isArray(b))
    return a.length === b.length && a.every((item, index) => samePractice(item, b[index]));
  if (
    a &&
    b &&
    typeof a === 'object' &&
    typeof b === 'object' &&
    !Array.isArray(a) &&
    !Array.isArray(b)
  ) {
    const left = a as Record<string, unknown>,
      right = b as Record<string, unknown>;
    return [...new Set([...Object.keys(left), ...Object.keys(right)])]
      .filter((key) => key !== 'url')
      .every((key) => samePractice(left[key], right[key]));
  }
  return false;
}
export function mergePractice(
  base: PracticeDocument,
  local: PracticeDocument,
  remote: PracticeDocument,
) {
  let conflict = false;
  const merge = (b: unknown, l: unknown, r: unknown): unknown => {
    if (samePractice(l, b)) return r;
    if (samePractice(r, b) || samePractice(l, r)) return l;
    if (
      Array.isArray(l) &&
      Array.isArray(r) &&
      [...l, ...r].every((item) => item && typeof item.id === 'string')
    ) {
      const before = Array.isArray(b) ? b : [];
      const ids = new Set([...l, ...r, ...before].map((item) => item.id));
      return [...ids]
        .map((id) =>
          merge(
            before.find((x) => x.id === id),
            l.find((x) => x.id === id),
            r.find((x) => x.id === id),
          ),
        )
        .filter((x) => x !== undefined);
    }
    if (
      b &&
      l &&
      r &&
      typeof b === 'object' &&
      typeof l === 'object' &&
      typeof r === 'object' &&
      !Array.isArray(l) &&
      !(l instanceof Blob)
    ) {
      const before = b as Record<string, unknown>,
        current = l as Record<string, unknown>,
        next = r as Record<string, unknown>;
      return Object.fromEntries(
        [...new Set([...Object.keys(before), ...Object.keys(current), ...Object.keys(next)])]
          .filter((key) => key !== 'url')
          .map((key) => [key, merge(before[key], current[key], next[key])]),
      );
    }
    conflict = true;
    return l;
  };
  // Clip IDs are global so moving a clip between tracks cannot duplicate it.
  const flatten = (doc: PracticeDocument) => ({
    ...doc,
    trackOrder: doc.tracks.map((track) => track.id),
    tracks: doc.tracks.map((track) => withClips(track, [])),
    clips: doc.tracks.flatMap((track) =>
      trackClips(track).map((clip) => ({ ...clip, trackId: track.id })),
    ),
  });
  const result = merge(flatten(base), flatten(local), flatten(remote)) as PracticeDocument & {
    trackOrder: string[];
    clips: (ReturnType<typeof trackClips>[number] & { trackId: string })[];
  };
  const { clips, trackOrder, ...document } = result;
  for (const clip of clips)
    if (!document.tracks.some((track) => track.id === clip.trackId)) {
      const parent =
        local.tracks.find((track) => track.id === clip.trackId) ??
        remote.tracks.find((track) => track.id === clip.trackId);
      if (parent) {
        document.tracks.push(withClips(parent, []));
        conflict = true;
      }
    }
  return {
    document: {
      ...document,
      tracks: [...document.tracks]
        .sort((a, b) => {
          const left = trackOrder.indexOf(a.id),
            right = trackOrder.indexOf(b.id);
          return (left < 0 ? Infinity : left) - (right < 0 ? Infinity : right);
        })
        .map((track) =>
          withClips(
            track,
            clips
              .filter((clip) => clip.trackId === track.id)
              .map((item) => {
                const clip = { ...item };
                delete (clip as { trackId?: string }).trackId;
                return clip;
              }),
          ),
        ),
    } as PracticeDocument,
    conflict,
  };
}
