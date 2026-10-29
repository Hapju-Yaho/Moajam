import type { Score, ScoreFragment } from './score';

export function scoreNotesInBeatRange(score: Score, parts: string[], from: number, to: number) {
  const first = Math.min(from, to),
    end = Math.max(from, to) + 4 / (score.timeSignature?.beatType ?? 4);
  const positions = new Map<string, number>();
  return score.notes
    .filter((note) => {
      if (!parts.includes(note.part)) return false;
      const start = positions.get(note.part) ?? 0;
      positions.set(note.part, start + note.beats);
      return (
        !note.blank &&
        (note.graceBeats !== undefined
          ? start >= first - 1e-7 && start < end - 1e-7
          : start < end - 1e-7 && start + note.beats > first + 1e-7)
      );
    })
    .map((note) => note.id);
}

/** A beat selects all sounding notes occupying it, across pitches and drum voices. */
export function scoreBeatSelectionGroups(fragments: ScoreFragment[], beats: number, beatSize = 1) {
  return Array.from({ length: Math.ceil(beats / beatSize) }, (_, index) => {
    const offset = index * beatSize;
    return {
      offset,
      ids: [
        ...new Set(
          fragments
            .filter(
              (f) =>
                !f.note.rest &&
                !f.note.blank &&
                (f.note.graceBeats !== undefined
                  ? f.offset >= offset - 1e-7 && f.offset < offset + beatSize - 1e-7
                  : f.offset < offset + beatSize - 1e-7 && f.offset + f.beats > offset + 1e-7),
            )
            .map((f) => f.note.id),
        ),
      ],
    };
  });
}
