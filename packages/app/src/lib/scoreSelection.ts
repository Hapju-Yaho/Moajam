import type { ScoreFragment } from './score';

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
