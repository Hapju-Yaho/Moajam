import { tabTones, writtenScoreBeats, type ScoreFragment } from '../lib/score';
import { scoreBeamGroups } from '../lib/scoreLayout';
import { NoteFlags } from './NoteFlags.web';

/** Attach rhythm to the lowest fret, with a shared stem end for each beat group. */
export function TabRhythm({
  fragments,
  tuning,
  y,
  xAt,
}: {
  fragments: ScoreFragment[];
  tuning: readonly number[];
  y: number;
  xAt: (offset: number) => number;
}) {
  const notes = fragments.filter(({ note }) => note.graceBeats === undefined);
  const playable = ({ note }: ScoreFragment) =>
    !note.rest && !note.blank && !note.slash && tabTones(note, tuning).some((t) => t.string);
  const flags = (index: number) =>
    [1, 0.5, 0.25, 0.125].filter(
      (limit) => writtenScoreBeats(notes[index].note, notes[index].beats) < limit,
    ).length;
  const groups = scoreBeamGroups(
    notes.map((fragment) =>
      playable(fragment) ? fragment : { ...fragment, note: { ...fragment.note, rest: true } },
    ),
  );
  const fretY = (index: number) =>
    y + (Math.max(...tabTones(notes[index].note, tuning).map((t) => t.string ?? 1)) - 1) * 20;
  const end = (indices: number[]) =>
    Math.max(...indices.map(fretY)) + 31 + Math.max(0, ...indices.map((i) => flags(i) - 2)) * 5;
  return (
    <g pointerEvents="none" stroke="#293e34" fill="none">
      {notes.map((fragment, index) => {
        if (!playable(fragment) || writtenScoreBeats(fragment.note, fragment.beats) >= 4)
          return null;
        const group = groups.find((indices) => indices.includes(index));
        const x = xAt(fragment.offset),
          bottom = end(group ?? [index]);
        return (
          <g key={index} data-tab-rhythm={fragment.note.id}>
            <line x1={x} x2={x} y1={fretY(index) + 7} y2={bottom} strokeWidth="1.1" />
            {!group && <NoteFlags x={x} y={bottom} count={flags(index)} direction={1} />}
          </g>
        );
      })}
      {groups.map((indices, groupIndex) => (
        <g key={groupIndex} data-tab-beam="true" strokeWidth="2.4">
          {[0, 1, 2, 3].flatMap((level) =>
            indices.flatMap((index, position) => {
              if (flags(index) <= level) return [];
              const next = indices[position + 1],
                previous = indices[position - 1];
              const hasNext = next !== undefined && flags(next) > level;
              if (!hasNext && previous !== undefined && flags(previous) > level) return [];
              const x = xAt(notes[index].offset);
              return [
                <line
                  key={`${level}/${index}`}
                  x1={x}
                  x2={
                    hasNext
                      ? xAt(notes[next].offset)
                      : x + (position === indices.length - 1 ? -8 : 8)
                  }
                  y1={end(indices) - level * 7}
                  y2={end(indices) - level * 7}
                />,
              ];
            }),
          )}
        </g>
      ))}
    </g>
  );
}
