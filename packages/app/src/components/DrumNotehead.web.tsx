import { drumNotation, drumLabel, type ScoreTone } from '../lib/score';
import { drumStrokeLayout } from '../lib/drumStroke';

export function DrumNotehead({
  tone,
  x,
  y,
  beats,
  stemEnd,
  stemBase = y,
  flags = 0,
  beamed = false,
  showLedger = false,
  stemX = x + 5,
  color = '#293e34',
}: {
  tone: ScoreTone;
  x: number;
  y: number;
  beats: number;
  stemEnd: number;
  stemBase?: number;
  flags?: number;
  beamed?: boolean;
  showLedger?: boolean;
  stemX?: number;
  color?: string;
}) {
  const { head, mark, hollow, rimshot, roll } = drumNotation(tone);
  const strokeLayout = drumStrokeLayout(tone, flags, beamed);
  const direction = stemEnd < stemBase ? -1 : 1;
  const strokeCenter = (stemEnd - direction * strokeLayout.tipGap + stemBase + direction * 10) / 2;
  const markY = tone.pitch === 44 ? y + 13 : Math.min(y - 13, stemEnd - 9);
  const markX = mark === 'open' || mark === 'half-open' ? stemX : x;
  return (
    <g
      aria-label={`${drumLabel(tone.pitch, tone.drumTechnique)} 음표`}
      data-drum-head={head}
      stroke={color}
      strokeWidth="1.2"
      fill="none"
    >
      {Array.from({ length: showLedger ? Math.max(0, Math.floor((82 - y) / 10)) : 0 }, (_, i) => (
        <path key={i} d={`M${x - 8} ${72 - i * 10}h16`} data-drum-ledger="true" />
      ))}
      {head === 'normal' ? (
        <ellipse
          cx={x}
          cy={y}
          rx="5"
          ry="3.3"
          transform={`rotate(-18 ${x} ${y})`}
          fill={hollow || beats >= 2 ? '#fffefb' : color}
        />
      ) : head === 'diamond' ? (
        <path d={`M${x} ${y - 5}l5 5 -5 5 -5 -5Z`} fill={beats >= 2 ? '#fffefb' : color} />
      ) : head === 'triangle' ? (
        <path d={`M${x} ${y - 5}l5 9h-10Z`} fill={beats >= 2 ? '#fffefb' : color} />
      ) : (
        <>
          <path d={`M${x - 4} ${y - 4}l8 8m-8 0l8 -8`} />
          {head === 'circle-x' && <circle cx={x} cy={y} r="5.5" />}
        </>
      )}
      {rimshot && <path data-drum-rimshot="true" d={`M${x - 6} ${y - 5}l12 10m-12 0l12 -10`} />}
      {(tone.drumTechnique === 'flam' || tone.drumTechnique === 'drag') && (
        <g aria-label={tone.drumTechnique === 'flam' ? '플램 장식음' : '드래그 장식음'}>
          {Array.from({ length: tone.drumTechnique === 'flam' ? 1 : 2 }, (_, i) => (
            <g key={i}>
              <ellipse cx={x - 15 - i * 11} cy={y} rx="3" ry="2" fill={color} />
              <path d={`M${x - 12 - i * 11} ${y}v-20q8 4 3 10m-8 3l9 -7`} />
            </g>
          ))}
        </g>
      )}
      {roll && (
        <g data-drum-roll={roll}>
          {roll !== 'buzz' ? (
            Array.from({ length: strokeLayout.count }, (_, i) => {
              const center = strokeCenter + (i - (strokeLayout.count - 1) / 2) * 5;
              return (
                <path
                  key={i}
                  d={`M${stemX - 6} ${center + 2}l12 -4`}
                  strokeWidth="2.2"
                  strokeLinecap="butt"
                />
              );
            })
          ) : (
            <path
              d={`M${stemX - 5} ${strokeCenter - 5}h10l-10 10h10`}
              strokeWidth="1.8"
              strokeLinejoin="round"
            />
          )}
        </g>
      )}
      {mark && (
        <g
          data-drum-mark={mark}
          aria-label={
            mark === 'open'
              ? '열림 표시'
              : mark === 'closed'
                ? '닫힘 표시'
                : mark === 'half-open'
                  ? '하프 오픈 표시'
                  : '초크 표시'
          }
        >
          {(mark === 'open' || mark === 'half-open') && <circle cx={markX} cy={markY} r="3" />}
          {mark === 'half-open' && <path d={`M${markX - 4} ${markY + 4}l8 -8`} />}
          {mark === 'closed' && <path d={`M${x - 3} ${markY}h6m-3 -3v6`} />}
          {mark === 'choke' && (
            <circle aria-label="초크 스타카토 표시" cx={x} cy={markY} r="1.8" fill={color} />
          )}
        </g>
      )}
    </g>
  );
}
