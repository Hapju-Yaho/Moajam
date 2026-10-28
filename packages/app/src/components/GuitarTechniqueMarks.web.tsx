import type { ScoreTone } from '../lib/score';

export function GuitarTechniqueMarks({
  tone,
  x,
  y,
  tabY,
  footerY,
  width,
  beats,
  showStaff = true,
}: {
  tone: ScoreTone;
  x: number;
  y: number;
  tabY?: number;
  footerY?: number;
  width: number;
  beats: number;
  showStaff?: boolean;
}) {
  if (!tone.bend && !tone.harmonic) return null;
  const label = [tone.harmonic === 'natural' ? 'N.H.' : tone.harmonic === 'pinch' ? 'P.H.' : '']
    .filter(Boolean)
    .join(' ');
  return (
    <g data-guitar-technique="true" pointerEvents="none" fill="#344b3e" stroke="#344b3e">
      {label && (
        <>
          {showStaff && (
            <text x={x} y={y - 48} stroke="none" fontSize="10" textAnchor="middle">
              {label}
            </text>
          )}
          {footerY !== undefined && (
            <g>
              <text x={x} y={footerY} stroke="none" fontSize="10">
                {label}
              </text>
              {tone.palmMute && (
                <path d={`M${x} ${footerY + 5}h${width}v-5`} fill="none" strokeDasharray="3 3" />
              )}
            </g>
          )}
        </>
      )}
      {tone.bend &&
        [...(showStaff ? [y] : []), ...(tabY === undefined ? [] : [tabY])].map((base, index) => {
          const kind = tone.bend!.kind,
            release = kind === 'release' || kind === 'prebend-release';
          const pre = kind === 'prebend' || kind === 'prebend-release';
          const b = tone.bend!;
          const at = (beat: number) =>
            x + 8 + Math.max(0, Math.min(1, beat / beats)) * Math.max(24, width - 8);
          const riseStart = at(b.bendStart ?? 0);
          const peak = pre ? at(0) : at(b.bendEnd ?? beats * 0.45);
          const fallStart = at(b.releaseStart ?? beats * 0.6);
          const fallEnd = at(b.releaseEnd ?? beats);

          return (
            <g key={index} data-guitar-bend={kind}>
              <path
                d={
                  pre
                    ? `M${x + 8} ${base - 6}v-26`
                    : `M${riseStart} ${base - 6}Q${peak} ${base - 6} ${peak} ${base - 32}`
                }
                fill="none"
              />
              <path d={`m${peak - 3} ${base - 26} 3 -6 3 6`} fill="none" />
              {release && (
                <path
                  d={`M${peak} ${base - 32}H${fallStart}Q${fallEnd} ${base - 32} ${fallEnd} ${base - 6}l-4 -4m4 4 2 -6`}
                  fill="none"
                />
              )}
              <text x={peak} y={base - 38} stroke="none" textAnchor="middle" fontSize="10">
                {({ 1: '½', 2: 'Full', 3: '1½', 4: '2' } as const)[tone.bend!.amount]}
              </text>
            </g>
          );
        })}
    </g>
  );
}
