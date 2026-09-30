import type { TrackPart } from './trackParts';

export type TimelineClip = {
  id: string;
  name: string;
  blob: Blob;
  url: string;
  offset: number;
  duration: number;
  sourceStart: number;
  trimmed?: boolean;
};

export type TimelineTrack = {
  id: string;
  name: string;
  part?: TrackPart;
  volume: number;
  muted: boolean;
  clips?: TimelineClip[];
  // Legacy single-clip fields remain readable during migration.
  blob?: Blob;
  url: string;
  offset: number;
  duration: number;
};

export function trackClips(track: TimelineTrack): TimelineClip[] {
  return (
    track.clips ??
    (track.blob
      ? [
          {
            id: track.id,
            name: track.name,
            blob: track.blob,
            url: track.url,
            offset: track.offset ?? 0,
            duration: track.duration ?? 0,
            sourceStart: 0,
          },
        ]
      : [])
  );
}

export function withClips(track: TimelineTrack, clips: TimelineClip[]): TimelineTrack {
  const next = { ...track, clips, url: '', duration: 0, offset: 0 };
  delete next.blob;
  return next;
}

export function moveClip(tracks: TimelineTrack[], id: string, targetId: string, offset: number) {
  const source = tracks.find((track) => trackClips(track).some((clip) => clip.id === id));
  const clip = source && trackClips(source).find((item) => item.id === id);
  if (!clip || !Number.isFinite(offset) || !tracks.some((track) => track.id === targetId))
    return tracks;
  return tracks.map((track) => {
    if (track.id !== source.id && track.id !== targetId) return track;
    const clips = trackClips(track).filter((item) => item.id !== id);
    if (track.id === targetId) clips.push({ ...clip, offset: Math.max(0, offset) });
    return withClips(
      track,
      clips.sort((a, b) => a.offset - b.offset),
    );
  });
}

export function splitClip(tracks: TimelineTrack[], id: string, position: number, rightId: string) {
  if (!Number.isFinite(position)) return tracks;
  return tracks.map((track) => {
    const clips = trackClips(track);
    const clip = clips.find((item) => item.id === id);
    if (!clip || position <= clip.offset + 0.01 || position >= clip.offset + clip.duration - 0.01)
      return track;
    const leftDuration = position - clip.offset;
    return withClips(
      track,
      clips.flatMap((item) =>
        item.id !== id
          ? [item]
          : [
              { ...clip, duration: leftDuration, trimmed: true },
              {
                ...clip,
                id: rightId,
                offset: position,
                sourceStart: clip.sourceStart + leftDuration,
                duration: clip.duration - leftDuration,
                trimmed: true,
              },
            ],
      ),
    );
  });
}

export function clipSourceTime(clip: TimelineClip, position: number) {
  return clip.sourceStart + Math.max(0, Math.min(clip.duration, position - clip.offset));
}

export function nextTrackName(tracks: Pick<TimelineTrack, 'name'>[], prefix = '트랙') {
  const names = new Set(tracks.map((track) => track.name));
  let number = 1;
  while (names.has(`${prefix}${number}`)) number++;
  return `${prefix}${number}`;
}
export function moveClipToNewTrack(
  tracks: TimelineTrack[],
  clipId: string,
  newId: string,
  offset: number,
) {
  const source = tracks.find((track) => trackClips(track).some((clip) => clip.id === clipId));
  if (!source || !Number.isFinite(offset)) return tracks;
  const target = withClips(
    { ...source, id: newId, name: nextTrackName(tracks, `${source.name}_`) },
    [],
  );
  return moveClip([...tracks, target], clipId, newId, offset);
}
