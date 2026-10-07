import { useEffect, useRef, useState, type ComponentProps } from 'react';
import { GuitarStaff } from './GuitarStaff.web';
import { scoreMeasureCount, scoreMeasureAtBeat } from '../lib/score';
import { scoreRestSystems } from '../lib/scoreMeasureRests';
import { scorePartOwner } from '../lib/scoreParts';

export function ScoreEnsemble({
  parts,
  onPartSelect,
  ...props
}: ComponentProps<typeof GuitarStaff> & {
  parts: string[];
  onPartSelect?: (part: string, note?: string) => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(800);
  useEffect(() => {
    if (!root.current || props.layoutWidth) return;
    const observer = new ResizeObserver(([entry]) =>
      setWidth(Math.max(200, entry.contentRect.width)),
    );
    observer.observe(root.current);
    return () => observer.disconnect();
  }, [props.layoutWidth]);
  const expanded =
    props.hasSelection && props.playbackBeat === null
      ? (props.emptyMeasure ?? scoreMeasureAtBeat(props.score, props.part, props.emptyBeat).bar)
      : undefined;
  const count = Math.max(
    1,
    ...parts.map((part) => scoreMeasureCount(props.score, part)),
    (expanded ?? -1) + 1,
  );
  const rows = scoreRestSystems(props.score, parts, count, expanded);
  return (
    <div className="score-ensemble" ref={root} aria-label="합주 악보">
      {rows.map((row) => (
        <section
          className="score-ensemble-system"
          key={row.start}
          data-ensemble-system={row.start}
          style={{ marginBottom: ((props.score.systemGap ?? 14) * props.zoom) / 100 }}
        >
          {parts
            .filter((part) => !Object.values(props.score.drumVoices ?? {}).includes(part))
            .map((part, index) => {
              const drumLower = props.score.drumVoices?.[part];
              const active = part === props.part || drumLower === props.part;
              const displayedPart = active && drumLower ? props.part : part;
              const owner = scorePartOwner(props.score, part);
              const label = props.score.keyboardStaves?.[owner]
                ? `${owner} · ${part === owner ? '오른손' : '왼손'}`
                : part;
              return (
                <div
                  key={part}
                  className="score-ensemble-staff"
                  data-active={active}
                  data-keyboard={!!props.score.keyboardStaves?.[owner]}
                >
                  <button
                    className="score-staff-name"
                    disabled={!onPartSelect || !props.editable}
                    onClick={() => onPartSelect?.(part)}
                  >
                    {label}
                    {active && onPartSelect ? ' · 편집 중' : ''}
                  </button>
                  <GuitarStaff
                    {...props}
                    part={displayedPart}
                    onPartSelect={onPartSelect}
                    layoutWidth={props.layoutWidth ?? width}
                    alignedParts={parts}
                    systemOverride={[row]}
                    showTempo={index === 0}
                    selected={active ? props.selected : null}
                    hasSelection={active && props.hasSelection}
                    playbackBeat={active ? props.playbackBeat : null}
                    cursor={active ? props.cursor : null}
                    rangeIds={active ? props.rangeIds : []}
                    editable={props.editable && active}
                    onSelect={
                      active
                        ? props.onSelect
                        : (id) => {
                            if (props.editable) onPartSelect?.(part, id);
                          }
                    }
                    onChordSelect={
                      active
                        ? props.onChordSelect
                        : () => {
                            if (props.editable) onPartSelect?.(part);
                          }
                    }
                    onAppend={
                      active
                        ? props.onAppend
                        : () => {
                            if (props.editable) onPartSelect?.(part);
                          }
                    }
                    onDeselect={active ? props.onDeselect : () => {}}
                    onMeasureContextMenu={active ? props.onMeasureContextMenu : undefined}
                  />
                </div>
              );
            })}
        </section>
      ))}
    </div>
  );
}
