import { pitchName, scoreMeasures, staffPosition, type Score } from '../lib/score';

export function ScoreStaff({
  score,
  part,
  selected,
  cursor,
  zoom,
  onSelect,
}: {
  score: Score;
  part: string;
  selected: string | null;
  cursor: string | null;
  zoom: number;
  onSelect: (id: string) => void;
}) {
  let measures;
  try {
    measures = scoreMeasures(score, part);
  } catch (error) {
    return (
      <div role="alert">{error instanceof Error ? error.message : '악보를 표시하지 못했어요.'}</div>
    );
  }
  return (
    <div
      aria-label={`${part} 악보`}
      style={{
        overflowX: 'auto',
        background: '#fffdfa',
        border: '1px solid #e6e8ed',
        borderRadius: 12,
        padding: 16,
      }}
    >
      {measures.map((fragments, index) => {
        const width = Math.max(330, fragments.length * 64 + 120);
        const positions = fragments
          .filter(({ note }) => !note.rest)
          .map(({ note }) => 125 - staffPosition(note.pitch) * 5);
        const top = Math.min(0, ...positions.map((y) => y - 50));
        const bottom = Math.max(250, ...positions.map((y) => y + 35));
        return (
          <svg
            key={index}
            aria-label={`${index + 1}마디`}
            width={(width * zoom) / 100}
            height={((bottom - top) * zoom) / 100}
            viewBox={`0 ${top} ${width} ${bottom - top}`}
            style={{ verticalAlign: 'top', maxWidth: 'none' }}
          >
            <text x="12" y="20" fill="#738097" fontSize="12">
              {index + 1}마디 · 4/4
            </text>
            {[85, 95, 105, 115, 125].map((y) => (
              <line key={y} x1="8" x2={width - 8} y1={y} y2={y} stroke="#9da5b3" />
            ))}
            <line x1={width - 8} x2={width - 8} y1="85" y2="125" stroke="#637086" />
            <text x="12" y="121" fontSize="46">
              𝄞
            </text>
            {fragments.map(({ note, beats, continued, continues }, position) => {
              const x = 76 + (position * (width - 100)) / Math.max(1, fragments.length);
              const y = 125 - staffPosition(note.pitch) * 5;
              const ledgers: number[] = [];
              if (!note.rest) {
                for (let line = 135; line <= y; line += 10) ledgers.push(line);
                for (let line = 75; line >= y; line -= 10) ledgers.push(line);
              }
              const label = `${index + 1}마디 ${position + 1}번째 ${note.rest ? '쉼표' : pitchName(note.pitch)}, ${beats}박`;
              return (
                <g
                  key={`${note.id}/${position}`}
                  role="button"
                  tabIndex={0}
                  aria-label={label}
                  aria-pressed={selected === note.id}
                  onClick={() => onSelect(note.id)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      onSelect(note.id);
                    }
                  }}
                  style={{ cursor: 'pointer' }}
                >
                  <rect
                    x={x - 23}
                    y="24"
                    width="53"
                    height="210"
                    rx="7"
                    fill={
                      cursor === note.id
                        ? '#d4e6ff'
                        : selected === note.id
                          ? '#edf3ff'
                          : 'transparent'
                    }
                  />
                  {!continued && (
                    <text x={x - 15} y="45" fontSize="12" fill="#334155">
                      {note.chord.slice(0, 8)}
                    </text>
                  )}
                  {note.rest ? (
                    <text x={x - 8} y="119" fontSize="29">
                      {beats >= 4
                        ? '𝄻'
                        : beats >= 2
                          ? '𝄼'
                          : beats >= 1
                            ? '𝄽'
                            : beats >= 0.5
                              ? '𝄾'
                              : '𝄿'}
                    </text>
                  ) : (
                    <>
                      {ledgers.map((line) => (
                        <line
                          key={line}
                          x1={x - 12}
                          x2={x + 13}
                          y1={line}
                          y2={line}
                          stroke="#637086"
                        />
                      ))}
                      {pitchName(note.pitch).includes('♯') && (
                        <text x={x - 22} y={y + 5} fontSize="18">
                          ♯
                        </text>
                      )}
                      <ellipse
                        cx={x}
                        cy={y}
                        rx="7"
                        ry="4.5"
                        transform={`rotate(-18 ${x} ${y})`}
                        fill={beats >= 2 ? '#fffdfa' : '#34415a'}
                        stroke="#34415a"
                        strokeWidth="1.5"
                      />
                      {beats < 4 && (
                        <line
                          x1={x + 6}
                          x2={x + 6}
                          y1={y}
                          y2={y - 29}
                          stroke="#34415a"
                          strokeWidth="1.5"
                        />
                      )}
                      {beats < 1 && (
                        <path
                          d={`M ${x + 6} ${y - 29} q 18 10 7 20`}
                          fill="none"
                          stroke="#34415a"
                          strokeWidth="2"
                        />
                      )}
                      {beats < 0.5 && (
                        <path
                          d={`M ${x + 6} ${y - 22} q 18 10 7 20`}
                          fill="none"
                          stroke="#34415a"
                          strokeWidth="2"
                        />
                      )}
                      {(beats === 1.5 || beats === 3 || beats === 0.75) && (
                        <circle cx={x + 16} cy={y - 2} r="2" fill="#34415a" />
                      )}
                      {note.accent && !continued && (
                        <text x={x - 5} y={Math.max(58, y - 36)} fontSize="18">
                          &gt;
                        </text>
                      )}
                      {continues && (
                        <path d={`M ${x} ${y + 10} q 20 14 35 0`} fill="none" stroke="#637086" />
                      )}
                      {continued && (
                        <path
                          d={`M ${x - 25} ${y + 10} q 12 10 25 0`}
                          fill="none"
                          stroke="#637086"
                        />
                      )}
                    </>
                  )}
                  <text x={x - 15} y="196" fontSize="11" fill="#64748b">
                    {note.rest ? '쉼표' : pitchName(note.pitch)}
                  </text>
                  <text x={x - 15} y="213" fontSize="10" fill="#64748b">
                    {beats}박
                  </text>
                  {!continued && (
                    <text x={x - 15} y="232" fontSize="11">
                      {note.lyric.slice(0, 6)}
                    </text>
                  )}
                </g>
              );
            })}
            {!fragments.length && (
              <text x="90" y="163" fill="#8b96a6" fontSize="12">
                첫 음표를 추가해보세요
              </text>
            )}
          </svg>
        );
      })}
    </div>
  );
}
