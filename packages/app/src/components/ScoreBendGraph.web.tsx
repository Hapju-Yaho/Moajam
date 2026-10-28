import { useRef, useState } from 'react';
import type { GuitarTechniqueFields } from '../lib/scoreGuitarTechniques';

type Bend = NonNullable<GuitarTechniqueFields['bend']>;
type Handle = 'bendStart' | 'bendEnd' | 'releaseStart' | 'releaseEnd' | 'height';

export function ScoreBendGraph({
  bend,
  beats,
  disabled,
  onChange,
}: {
  bend: Bend;
  beats: number;
  disabled: boolean;
  onChange: (bend: Bend) => void;
}) {
  const [draft, setDraft] = useState<Bend | null>(null);
  const dragOffset = useRef(0);
  const current = draft ?? bend;
  const pre = current.kind.startsWith('prebend');
  const release = current.kind.includes('release');
  const start = current.bendStart ?? 0;
  const end = current.bendEnd ?? beats * 0.45;
  const fall = current.releaseStart ?? (pre ? 0 : beats * 0.6);
  const finish = current.releaseEnd ?? (pre ? beats * 0.8 : beats);
  const x = (beat: number) => 34 + (beat / beats) * 226;
  const y = (amount: number) => 130 - amount * 25;
  const points: { key: Handle; beat: number; height: number; label: string }[] = [
    ...(pre
      ? [{ key: 'height' as const, beat: 0, height: current.amount, label: '벤딩 높이' }]
      : [
          { key: 'bendStart' as const, beat: start, height: 0, label: '벤딩 시작' },
          { key: 'bendEnd' as const, beat: end, height: current.amount, label: '벤딩 끝' },
        ]),
    ...(release
      ? [
          {
            key: 'releaseStart' as const,
            beat: fall,
            height: current.amount,
            label: '릴리즈 시작',
          },
          { key: 'releaseEnd' as const, beat: finish, height: 0, label: '릴리즈 끝' },
        ]
      : []),
  ];
  // Separate overlapping handles visually without changing the stored beat positions.
  const handleX = new Map<Handle, number>();
  for (const height of [...new Set(points.map((point) => point.height))]) {
    const sorted = points
      .filter((point) => point.height === height)
      .sort((a, b) => a.beat - b.beat);
    for (let i = 0; i < sorted.length;) {
      let end = i + 1;
      while (end < sorted.length && x(sorted[end].beat) - x(sorted[end - 1].beat) < 14) end++;
      const group = sorted.slice(i, end),
        span = (group.length - 1) * 14;
      const left = Math.max(
        34,
        Math.min(260 - span, (x(group[0].beat) + x(group[group.length - 1].beat) - span) / 2),
      );
      group.forEach((point, index) => handleX.set(point.key, left + index * 14));
      i = end;
    }
  }
  // Display-only curves: the stored timing and audio interpolation stay unchanged.
  const curve = (from: number, to: number, fromHeight: number, toHeight: number) => {
    const right = x(to);
    // Match the notation's bend/release arc: leave horizontally, finish vertically.
    return `Q${right},${y(fromHeight)} ${right},${y(toHeight)}`;
  };
  const path = [
    `M${x(0)},${y(pre ? current.amount : 0)}`,
    ...(!pre ? [`H${x(start)}`, curve(start, end, 0, current.amount)] : []),
    ...(release
      ? [`H${x(fall)}`, curve(fall, finish, current.amount, 0), `H${x(beats)}`]
      : [`H${x(beats)}`]),
  ].join(' ');
  const update = (key: Handle, beat: number, height: number) => {
    const gap = Math.min(0.125, beats / 16);
    const next = { ...current };
    if (key === 'height' || key === 'bendEnd' || key === 'releaseStart')
      next.amount = Math.max(1, Math.min(4, Math.round(height))) as Bend['amount'];
    if (key !== 'height') {
      let at = Math.max(0, Math.min(beats, Math.round(beat / gap) * gap));
      if (key === 'bendStart') at = Math.min(at, end - gap);
      if (key === 'bendEnd')
        at = Math.min(beats, Math.max(start + gap, Math.min(at, release ? fall : beats)));
      if (key === 'releaseStart') at = Math.max(pre ? 0 : end, Math.min(at, finish - gap));
      if (key === 'releaseEnd') at = Math.min(beats, Math.max(fall + gap, at));
      next[key] = Number(at.toFixed(6));
      if (!pre) {
        next.bendStart ??= start;
        next.bendEnd ??= end;
      }
      if (release) {
        next.releaseStart ??= fall;
        next.releaseEnd ??= finish;
      }
    }
    return next;
  };
  return (
    <div className="score-bend-graph">
      <small>점을 드래그해 높이와 박자를 조절하세요.</small>
      <svg
        viewBox="0 0 280 164"
        aria-label="벤딩 높이와 박자 그래프"
        style={{ width: '100%', touchAction: 'none', opacity: disabled ? 0.5 : 1 }}
      >
        {[0, 1, 2, 3, 4].map((n) => (
          <g key={n}>
            <line x1={34} x2={260} y1={y(n)} y2={y(n)} stroke="#d6dedb" />
            <text x={28} y={y(n) + 3} textAnchor="end" fontSize={10} fill="#52665b">
              {['0', '½', 'Full', '1½', '2'][n]}
            </text>
          </g>
        ))}
        {[0, 1, 2, 3, 4].map((n) => (
          <g key={n}>
            <line
              x1={x((beats * n) / 4)}
              x2={x((beats * n) / 4)}
              y1={25}
              y2={130}
              stroke="#d6dedb"
            />
            <text x={x((beats * n) / 4)} y={148} textAnchor="middle" fontSize={10} fill="#52665b">
              {Number(((beats * n) / 4).toFixed(3))}
            </text>
          </g>
        ))}
        <text x={260} y={162} textAnchor="end" fontSize={10} fill="#52665b">
          박 · 음 시작 기준
        </text>
        <path d={path} fill="none" stroke="#426b53" strokeWidth={2} />
        {points.map((point) => (
          <circle
            key={point.key}
            cx={handleX.get(point.key)}
            cy={y(point.height)}
            r={6}
            fill="#426b53"
            stroke="white"
            strokeWidth={2}
            tabIndex={disabled ? -1 : 0}
            role="button"
            aria-label={`${point.label}: ${Number(point.beat.toFixed(3))}박, ${point.height / 2}음`}
            style={{ cursor: disabled ? 'default' : 'grab' }}
            onPointerDown={(event) => {
              if (disabled) return;
              event.preventDefault();
              dragOffset.current = (handleX.get(point.key) ?? x(point.beat)) - x(point.beat);
              event.currentTarget.setPointerCapture(event.pointerId);
              setDraft({ ...bend });
            }}
            onPointerMove={(event) => {
              if (disabled || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
              const svg = event.currentTarget.ownerSVGElement!;
              const matrix = svg.getScreenCTM();
              if (!matrix) return;
              const p = new DOMPoint(event.clientX, event.clientY).matrixTransform(
                matrix.inverse(),
              );
              setDraft(
                update(
                  point.key,
                  ((p.x - dragOffset.current - 34) / 226) * beats,
                  (130 - p.y) / 25,
                ),
              );
            }}
            onPointerUp={(event) => {
              if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
              event.currentTarget.releasePointerCapture(event.pointerId);
              if (draft) onChange(draft);
              setDraft(null);
            }}
            onPointerCancel={() => setDraft(null)}
            onKeyDown={(event) => {
              if (
                disabled ||
                !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)
              )
                return;
              event.preventDefault();
              onChange(
                update(
                  point.key,
                  point.beat +
                    (event.key === 'ArrowRight' ? 0.125 : event.key === 'ArrowLeft' ? -0.125 : 0),
                  point.height + (event.key === 'ArrowUp' ? 1 : event.key === 'ArrowDown' ? -1 : 0),
                ),
              );
            }}
          >
            <title>
              {point.label} · {Number(point.beat.toFixed(3))}박 · {point.height / 2}음
            </title>
          </circle>
        ))}
        <g
          fill="none"
          stroke="#426b53"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          pointerEvents="none"
          aria-hidden="true"
        >
          {!pre && (
            <path
              data-bend-arrow="up"
              d={`M${x(end) - 5},${y(current.amount) + 9}L${x(end)},${y(current.amount)}L${x(end) + 5},${y(current.amount) + 9}`}
            />
          )}
          {release && (
            <path
              data-bend-arrow="down"
              d={`M${x(finish) - 5},${y(0) - 9}L${x(finish)},${y(0)}L${x(finish) + 5},${y(0) - 9}`}
            />
          )}
        </g>
      </svg>
    </div>
  );
}
