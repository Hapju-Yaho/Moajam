import { drumStemLength } from '../lib/drumStroke';
import {
  DOTTED_SCORE_BEATS,
  drumForPitch,
  drumLabel,
  drumNotation,
  type ScoreTone,
} from '../lib/score';
import { DrumNotehead } from './DrumNotehead.web';

export type DrumInputNote = {
  tone: ScoreTone;
  beats: number;
  accent?: boolean;
  marcato?: boolean;
  staccato?: boolean;
  slash?: boolean;
};

export function DrumInputPreview({
  note,
  x,
  direction,
  layout,
}: {
  note: DrumInputNote;
  x: number;
  direction: number;
  layout?: { stemStart: number; stemEnd: number; beamed: boolean; ys: number[] };
}) {
  const { tone, beats } = note;
  const color = '#c77830';
  const y = drumForPitch(tone.pitch)?.y ?? 102;
  const flags = [1, 0.5, 0.25, 0.125].filter((limit) => beats < limit).length;
  const stemX = x - direction * 4.5;
  const stemEnd = layout?.stemEnd ?? y + direction * drumStemLength([tone], flags, false);
  const hasMark = !!drumNotation(tone).mark && tone.pitch !== 44;
  const accentY = (beats < 4 ? stemEnd : y) + (direction === -1 ? -8 - (hasMark ? 12 : 0) : 18);
  return (
    <g
      role="img"
      aria-label={`드럼 입력 음표 미리보기 ${drumLabel(tone.pitch, tone.drumTechnique)}`}
      data-drum-input-preview={tone.pitch}
      data-preview-written-beats={beats}
      pointerEvents="none"
      fill={color}
      stroke={color}
    >
      {note.slash ? (
        <path d={`M${x - 5} ${y + 7}l10 -14`} strokeWidth="3" />
      ) : (
        <DrumNotehead
          showLedger
          color={color}
          tone={tone}
          x={x}
          y={y}
          beats={beats}
          stemX={stemX}
          stemEnd={stemEnd}
          stemBase={
            layout ? (direction === -1 ? Math.min(...layout.ys) : Math.max(...layout.ys)) : y
          }
          flags={flags}
          beamed={layout?.beamed}
        />
      )}
      {beats < 4 && (
        <line
          data-preview-stem={direction === -1 ? 'up' : 'down'}
          x1={stemX}
          x2={stemX}
          y1={layout?.stemStart ?? y}
          y2={stemEnd}
          strokeWidth="1.4"
        />
      )}
      {Array.from({ length: layout?.beamed ? 0 : flags }, (_, flag) => (
        <path
          key={flag}
          data-preview-flag
          d={`M${stemX} ${stemEnd - direction * flag * 6}q12 ${-direction * 7} 6 ${-direction * 15}`}
          fill="none"
          strokeWidth="1.6"
        />
      ))}
      {DOTTED_SCORE_BEATS.includes(beats) && (
        <circle
          data-preview-dot
          cx={x + (tone.ghost ? 14 : 8.5)}
          cy={(y - 82) % 10 === 0 ? y - 5 : y}
          r="1.3"
          stroke="none"
        />
      )}
      {tone.ghost && !tone.dead && (
        <g stroke="none" fontSize="14">
          <text x={x - 11} y={y + 4}>
            (
          </text>
          <text x={x + 7} y={y + 4}>
            )
          </text>
        </g>
      )}
      {(note.accent || note.marcato) && (
        <text x={x} y={accentY} textAnchor="middle" stroke="none" fontSize="17">
          {note.marcato ? '^' : '>'}
        </text>
      )}
      {note.staccato && tone.drumTechnique !== 'choke' && (
        <circle
          cx={x}
          cy={[49, 57, 52, 55].includes(tone.pitch) ? stemEnd - 9 : y - direction * 12}
          r="1.8"
          stroke="none"
        />
      )}
    </g>
  );
}
