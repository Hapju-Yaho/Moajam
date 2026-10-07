import {
  noteTones,
  tabTones,
  spellScoreTone,
  writtenScoreBeats,
  scoreDrums,
  type ScoreNote,
} from '../lib/score';
import { NoteFlags } from './NoteFlags.web';
import { DrumNotehead } from './DrumNotehead.web';
import { scoreConnectionArc } from '../lib/scoreLayout';

export function GraceNote({
  note,
  x,
  nextX,
  nextY,
  nextNote,
  staffY,
  tabTop,
  tuning,
  selected,
  onSelect,
  fifths,
  percussion = false,
  connectionHandled = false,
}: {
  note: ScoreNote;
  x: number;
  nextX: number;
  nextY: number;
  nextNote?: ScoreNote;
  staffY: (pitch: number, naturalPitch?: number) => number;
  tabTop?: number;
  tuning: readonly number[];
  selected: boolean;
  onSelect: (row: number) => void;
  fifths?: number;
  percussion?: boolean;
  connectionHandled?: boolean;
}) {
  const tones = tabTones(note, tuning),
    y = staffY(note.pitch, noteTones(note)[0]?.naturalPitch);
  const selectedRow = percussion
    ? Math.max(1, scoreDrums.findIndex((drum) => drum.pitch === note.pitch) + 1)
    : (tones[0]?.string ?? 1);
  const drumYs = percussion ? noteTones(note).map((tone) => staffY(tone.pitch)) : [y];
  const stemBottom = Math.max(...drumYs),
    stemTop = Math.min(...drumYs) - 21;
  const flags = [1, 0.5, 0.25, 0.125].filter((n) => writtenScoreBeats(note, 0) < n).length;
  const label =
    note.connection?.type === 'hammer' ? 'H' : note.connection?.type === 'pull' ? 'P' : 'S';
  const color = selected ? '#c77830' : '#293e34';
  const connection = (fromY: number, toY: number, tab = false) => {
    if (!note.connection || connectionHandled) return null;
    // Grace stems point up. Put the link below, ending before the following
    // note's possible down-stem instead of crossing it at the note center.
    const arc = scoreConnectionArc(
      [
        { x, y: fromY },
        { x: nextX - 8, y: toY },
      ],
      1,
    );
    return (
      <g aria-label={`꾸밈음 ${label} 연결`} data-connection-side="below" pointerEvents="none">
        {note.connection.type !== 'glissando' && <path d={arc.d} stroke="none" />}
        {note.connection.type === 'slide' || note.connection.type === 'glissando' ? (
          <path
            d={`M${x + 5} ${fromY + (tab ? Math.sign((nextNote?.pitch ?? note.pitch) - note.pitch) * 3 : 0)}L${nextX - 12} ${toY - (tab ? Math.sign((nextNote?.pitch ?? note.pitch) - note.pitch) * 3 : 0)}`}
            fill="none"
            strokeWidth="1.2"
          />
        ) : null}
        {note.connection.type !== 'tie' && (
          <text
            x={arc.labelX}
            y={note.connection.type === 'glissando' ? Math.min(fromY, toY) - 8 : arc.labelY + 3}
            textAnchor="middle"
            fontSize="10"
            stroke="none"
            fontStyle={label === 'S' ? 'italic' : undefined}
          >
            {label === 'S' ? 'sl.' : label}
          </text>
        )}
      </g>
    );
  };
  return (
    <g
      data-grace-note={note.id}
      data-percussion-grace={percussion || undefined}
      data-score-note={note.id}
      color={color}
      fill="currentColor"
      stroke="currentColor"
    >
      <g
        role="button"
        tabIndex={0}
        aria-label={`꾸밈음 ${note.id} 오선 음표`}
        onClick={() => onSelect(selectedRow)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            onSelect(selectedRow);
          }
        }}
      >
        <rect
          x={x - 14}
          y={stemTop - 14}
          width="22"
          height={stemBottom - stemTop + 27}
          fill="transparent"
          stroke="none"
        />
        {noteTones(note).map((tone, i) => {
          const at = staffY(tone.pitch, tone.naturalPitch),
            alter = spellScoreTone(tone, fifths).alter;
          const ledgers = [];
          for (let line = 72; line >= at; line -= 10) ledgers.push(line);
          if (!percussion) for (let line = 132; line <= at; line += 10) ledgers.push(line);
          return (
            <g
              key={i}
              style={percussion ? { pointerEvents: 'auto' } : undefined}
              onClick={
                percussion
                  ? (event) => {
                      event.stopPropagation();
                      onSelect(
                        Math.max(1, scoreDrums.findIndex((drum) => drum.pitch === tone.pitch) + 1),
                      );
                    }
                  : undefined
              }
            >
              {percussion && (
                <rect
                  x={x - 6}
                  y={at - 5}
                  width="12"
                  height="10"
                  fill="transparent"
                  stroke="none"
                />
              )}
              {ledgers.map((line) => (
                <path key={line} d={`M${x - 6} ${line}h12`} strokeWidth="0.8" />
              ))}
              {!percussion && (
                <text x={x - 7} y={at + 3} fontSize="9" textAnchor="end" stroke="none">
                  {alter > 0 ? '♯' : alter < 0 ? '♭' : '♮'}
                </text>
              )}
              {percussion ? (
                <g transform={`translate(${x} ${at}) scale(0.65)`}>
                  <DrumNotehead
                    tone={tone}
                    x={0}
                    y={0}
                    beats={0.5}
                    stemEnd={(stemTop - at) / 0.65}
                    color="currentColor"
                  />
                </g>
              ) : tone.dead ? (
                <path d={`M${x - 3} ${at - 3}l6 6m0 -6l-6 6`} strokeWidth="1.2" />
              ) : (
                <ellipse cx={x} cy={at} rx="3.2" ry="2.3" transform={`rotate(-18 ${x} ${at})`} />
              )}
              {tone.ghost && (
                <text x={x} y={at + 3} fontSize="10" textAnchor="middle" stroke="none">
                  {'(\u2002)'}
                </text>
              )}
            </g>
          );
        })}
        <path d={`M${x + 3} ${stemBottom}V${stemTop}m-7 14l10 -7`} fill="none" strokeWidth="1" />
        <NoteFlags
          x={x + 3}
          y={stemTop}
          count={flags}
          direction={-1}
          scale={0.65}
          color="currentColor"
        />
        {note.staccato && <circle cx={x} cy={y + 8} r="1.2" />}
        {note.accent && (
          <text x={x} y={y - 27} fontSize="10" textAnchor="middle" stroke="none">
            &gt;
          </text>
        )}
        {connection(y, nextY)}
      </g>
      {tabTop !== undefined &&
        tones
          .filter((t) => t.string)
          .map((tone) => {
            const at = tabTop + (tone.string! - 1) * 20;
            return (
              <g
                key={tone.string}
                role="button"
                tabIndex={0}
                aria-label={`꾸밈음 ${tone.string}번 줄 ${tone.dead ? 'X' : tone.fret}프렛`}
                onClick={() => onSelect(tone.string!)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    onSelect(tone.string!);
                  }
                }}
              >
                <rect
                  x={x - 13}
                  y={at - 24}
                  width="21"
                  height="54"
                  fill="transparent"
                  stroke="none"
                />
                <path d={`M${x + 3} ${at - 5}v-19m-6 13l9 -6`} fill="none" strokeWidth="1" />
                <NoteFlags
                  x={x + 3}
                  y={at - 24}
                  count={flags}
                  direction={-1}
                  scale={0.65}
                  color="currentColor"
                />
                <text
                  x={x}
                  y={at + 3}
                  fontSize="9"
                  textAnchor="middle"
                  stroke="#fffefb"
                  strokeWidth="3"
                  paintOrder="stroke"
                >
                  {tone.dead ? 'X' : tone.ghost ? `(${tone.fret})` : tone.fret}
                </text>
                {note.staccato && <circle cx={x} cy={at + 31} r="1.2" />}
                {connection(
                  at,
                  tabTop +
                    ((tabTones(nextNote ?? note, tuning)[0]?.string ?? tone.string!) - 1) * 20,
                  true,
                )}
              </g>
            );
          })}
    </g>
  );
}
