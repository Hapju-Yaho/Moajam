import { useScorePlaybackValue } from '../lib/scorePlaybackSubscription.web';
import type { ScorePlaybackPosition } from '../lib/scorePlaybackDisplay.web';
import { mixerInstrumentAppearance } from '../lib/scoreMixerAppearance';
import { createPortal } from 'react-dom';
import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import {
  scorePartMix,
  scorePartStaves,
  scoreVisibleParts,
  partInstrumentLabel,
} from '../lib/scoreParts';
import { scoreMeasureAtBeat, scoreMeasureCount, scoreMeasures, type Score } from '../lib/score';
import { useScoreEditorLayout } from './ScoreEditorLayout.web';
import { AppIcon } from './icons';
import { ScoreMixerInstrumentIcon } from './ScoreMixerInstrumentIcon.web';
import { ScoreInstrumentDialog } from './ScoreInstrumentDialog.web';

export function ScorePartMixer({
  score,
  part,
  playing,
  playbackBeat,
  playbackPosition,
  disabled,
  onSelect,
  onEdit,
  volume,
  onVolumeChange,
  onMeasureSelect,
  onAddInstrument,
  onRemoveInstrument,
  onRenameInstrument,
  onMoveInstrument,
  selectedMeasure,
}: {
  score: Score;
  part: string;
  playing: boolean;
  playbackBeat: number | null;
  playbackPosition?: ScorePlaybackPosition;
  disabled: boolean;
  onSelect: (part: string) => void;
  onEdit: (score: Score) => void;
  volume: number;
  onVolumeChange: (value: number) => void;
  onMeasureSelect: (part: string, bar: number) => void;
  onAddInstrument: (instrument: string, name: string) => void;
  onRemoveInstrument: () => void;
  onRenameInstrument: (part: string, name: string) => void;
  onMoveInstrument: (part: string, target: number) => void;
  selectedMeasure: number | null;
}) {
  const root = useRef<HTMLElement>(null);
  const scrollPosition = useRef(0);
  const syncScroll = useCallback((left: number) => {
    scrollPosition.current = left;
    root.current?.querySelectorAll<HTMLElement>('[data-mixer-lane]').forEach((lane) => {
      lane.scrollLeft = left;
    });
  }, []);
  const layout = useScoreEditorLayout();
  const [open, setOpen] = useState(false);
  const [instrumentDialog, setInstrumentDialog] = useState<'add' | 'remove' | 'rename' | null>(
    null,
  );
  const [renamingPart, setRenamingPart] = useState('');
  const drag = useRef<{ name: string; target: number } | null>(null);
  const dragGhost = useRef<HTMLDivElement>(null);
  const [dragPreview, setDragPreview] = useState<{ name: string; x: number; y: number } | null>(
    null,
  );
  useEffect(() => {
    if (dragPreview && dragGhost.current && !dragGhost.current.matches(':popover-open'))
      dragGhost.current.showPopover();
  }, [dragPreview]);
  const [dragTarget, setDragTarget] = useState<string | null>(null);
  useEffect(() => {
    const media = window.matchMedia('(max-width:760px)');
    const compact = () => {
      if (layout.expanded && media.matches) setOpen(false);
    };
    compact();
    media.addEventListener('change', compact);
    return () => media.removeEventListener('change', compact);
  }, [layout.expanded]);
  useEffect(() => {
    if (layout.projectActionsOpen) setOpen(false);
  }, [layout.projectActionsOpen]);
  useEffect(() => {
    setOpen(false);
  }, [layout.expanded]);
  const parts = scoreVisibleParts(score);
  const bars = Math.max(
    ...parts
      .flatMap((name) => scorePartStaves(score, name))
      .map((name) => scoreMeasureCount(score, name)),
    1,
  );
  useEffect(() => {
    syncScroll(scrollPosition.current);
  }, [open, bars, part, syncScroll]);
  const mixer = (
    <section
      ref={root}
      className="score-part-mixer"
      data-open={open}
      data-playing={playing}
      aria-label="파트 믹서"
    >
      {
        <div className="score-mixer-scroll">
          <div className="score-mixer-table">
            <div className="score-mixer-table-heading">
              <span className="score-mixer-part-heading">
                <button
                  className="score-mixer-part-collapse"
                  aria-label={open ? '믹서 접기' : '믹서 펼치기'}
                  aria-expanded={open}
                  onClick={() => setOpen(!open)}
                >
                  <span
                    aria-hidden="true"
                    style={{
                      display: 'inline-flex',
                      transform: open ? 'rotate(180deg)' : undefined,
                    }}
                  >
                    <AppIcon name="chevron-down" size={16} color="currentColor" />
                  </span>
                </button>
                <button
                  type="button"
                  className="score-mixer-part-label"
                  aria-expanded={open}
                  onClick={() => setOpen(!open)}
                >
                  악기 · 파트
                </button>
                {layout.expanded && (
                  <span className="score-mixer-actions-heading">
                    <button
                      aria-label="악기 추가"
                      title="악기 추가"
                      disabled={disabled || playing}
                      onClick={() => setInstrumentDialog('add')}
                    >
                      +
                    </button>
                    <button
                      aria-label="선택한 악기 삭제"
                      title="선택한 악기 삭제"
                      disabled={disabled || playing || parts.length <= 1}
                      onClick={() => setInstrumentDialog('remove')}
                    >
                      ×
                    </button>
                  </span>
                )}
              </span>
              <span className="score-mixer-ms-heading">
                <span>M</span>
                <span>S</span>
              </span>
              <span>음량</span>
              <span className="score-mixer-progress-heading">
                <span className="score-mixer-ruler" data-mixer-lane>
                  {Array.from({ length: bars }, (_, index) => (
                    <span key={index}>{index === 0 || (index + 1) % 4 === 0 ? index + 1 : ''}</span>
                  ))}
                </span>
                <button
                  className="score-mixer-collapse"
                  onClick={() => setOpen(!open)}
                  aria-expanded={open}
                >
                  {open ? '간략히' : '자세히 보기'}
                  <span
                    aria-hidden="true"
                    style={{
                      display: 'inline-flex',
                      transform: open ? 'rotate(180deg)' : undefined,
                    }}
                  >
                    <AppIcon name="chevron-down" size={16} color="currentColor" />
                  </span>
                </button>
              </span>
            </div>
            <div className="score-mixer-instrument-rows">
              {parts
                .filter((name) => open || scorePartStaves(score, name).includes(part))
                .map((name) => {
                  const mix = scorePartMix(score, name),
                    staves = scorePartStaves(score, name),
                    measures = staves.map((staff) => scoreMeasures(score, staff));
                  const update = (change: Partial<typeof mix>) =>
                    onEdit({
                      ...score,
                      partMix: { ...score.partMix, [name]: { ...mix, ...change } },
                    });
                  return (
                    <div
                      className="score-mixer-row"
                      key={name}
                      data-mixer-part={name}
                      data-drag-target={dragTarget === name}
                      data-selected={staves.includes(part)}
                      style={
                        {
                          '--score-part-color': mixerInstrumentAppearance(score, name).color,
                        } as CSSProperties
                      }
                    >
                      <div className="score-mixer-name-cell">
                        <button
                          className="score-mixer-drag"
                          aria-label={`${name} 순서 변경`}
                          disabled={disabled || playing || !open}
                          onPointerDown={(event) => {
                            if (event.button !== 0) return;
                            event.preventDefault();
                            event.currentTarget.setPointerCapture(event.pointerId);
                            drag.current = { name, target: parts.indexOf(name) };
                            setDragPreview({ name, x: event.clientX, y: event.clientY });
                          }}
                          onPointerMove={(event) => {
                            if (!drag.current) return;
                            setDragPreview({
                              name: drag.current.name,
                              x: event.clientX,
                              y: event.clientY,
                            });
                            const rows = [
                              ...(root.current?.querySelectorAll<HTMLElement>(
                                '[data-mixer-part]',
                              ) ?? []),
                            ];
                            const target = rows.reduce<HTMLElement | null>(
                              (best, row) =>
                                !best ||
                                Math.abs(
                                  row.getBoundingClientRect().top +
                                    row.offsetHeight / 2 -
                                    event.clientY,
                                ) <
                                  Math.abs(
                                    best.getBoundingClientRect().top +
                                      best.offsetHeight / 2 -
                                      event.clientY,
                                  )
                                  ? row
                                  : best,
                              null,
                            );
                            if (target) {
                              drag.current.target = parts.indexOf(target.dataset.mixerPart!);
                              setDragTarget(target.dataset.mixerPart!);
                            }
                            const body = root.current?.querySelector(
                              '.score-mixer-instrument-rows',
                            );
                            if (body) {
                              const r = body.getBoundingClientRect();
                              if (event.clientY < r.top + 15) body.scrollTop -= 8;
                              else if (event.clientY > r.bottom - 15) body.scrollTop += 8;
                            }
                          }}
                          onPointerUp={() => {
                            const moving = drag.current;
                            drag.current = null;
                            setDragTarget(null);
                            setDragPreview(null);
                            if (moving) onMoveInstrument(moving.name, moving.target);
                          }}
                          onPointerCancel={() => {
                            drag.current = null;
                            setDragTarget(null);
                            setDragPreview(null);
                          }}
                          onKeyDown={(event) => {
                            if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
                              event.preventDefault();
                              onMoveInstrument(
                                name,
                                Math.max(
                                  0,
                                  Math.min(
                                    parts.length - 1,
                                    parts.indexOf(name) + (event.key === 'ArrowUp' ? -1 : 1),
                                  ),
                                ),
                              );
                            }
                          }}
                        >
                          <svg
                            width="12"
                            height="16"
                            viewBox="0 0 12 16"
                            fill="currentColor"
                            aria-hidden="true"
                          >
                            {[4, 8, 12].flatMap((y) =>
                              [3, 8].map((x) => <circle key={`${x}-${y}`} cx={x} cy={y} r="1.2" />),
                            )}
                          </svg>
                        </button>
                        <button
                          className="score-mixer-name"
                          title={`${name} · ${partInstrumentLabel(score, name)}`}
                          disabled={disabled || playing}
                          onClick={() => onSelect(name)}
                          onDoubleClick={() => {
                            setRenamingPart(name);
                            setInstrumentDialog('rename');
                          }}
                        >
                          <ScoreMixerInstrumentIcon score={score} part={name} />
                          <span>{name}</span>
                        </button>
                      </div>
                      <div>
                        <button
                          className="score-mixer-toggle score-mixer-mute"
                          disabled={disabled}
                          aria-label={`${name} 믹서 음소거`}
                          aria-pressed={mix.muted}
                          onClick={() => update({ muted: !mix.muted })}
                        >
                          M
                        </button>
                        <button
                          className="score-mixer-toggle score-mixer-solo"
                          disabled={disabled}
                          aria-label={`${name} 믹서 솔로`}
                          aria-pressed={mix.solo}
                          onClick={() => update({ solo: !mix.solo })}
                        >
                          S
                        </button>
                      </div>
                      <label>
                        <input
                          aria-label={`${name} 믹서 음량`}
                          disabled={disabled}
                          type="range"
                          min={0}
                          max={1}
                          step={0.01}
                          value={mix.volume}
                          onChange={(e) => update({ volume: Number(e.target.value) })}
                        />
                        <small>{Math.round(mix.volume * 100)}%</small>
                      </label>
                      <MixerMeasures
                        score={score}
                        part={part}
                        name={name}
                        bars={bars}
                        measures={measures}
                        active={staves.includes(part)}
                        playing={playing}
                        playbackBeat={playbackBeat}
                        playbackPosition={playbackPosition}
                        selectedMeasure={selectedMeasure}
                        disabled={disabled}
                        onMeasureSelect={onMeasureSelect}
                      />
                    </div>
                  );
                })}
            </div>
            <div className="score-mixer-row score-mixer-master" data-compact={!open}>
              {open ? (
                <>
                  <strong>Master</strong>
                  <span />
                  <label>
                    <input
                      aria-label="Master 음량"
                      type="range"
                      min={0}
                      max={1}
                      step={0.01}
                      disabled={disabled}
                      value={volume}
                      onChange={(event) => onVolumeChange(Number(event.target.value))}
                    />
                    <small>{Math.round(volume * 100)}%</small>
                  </label>
                </>
              ) : (
                <>
                  <span />
                  <span />
                  <span />
                </>
              )}
              <div
                className="score-mixer-timeline-scroll"
                onScroll={(event) => syncScroll(event.currentTarget.scrollLeft)}
              >
                <div style={{ width: bars * 22, height: 1 }} />
              </div>
            </div>
          </div>
        </div>
      }
      {dragPreview && (
        <div
          ref={dragGhost}
          popover="manual"
          className="score-mixer-drag-preview"
          aria-hidden="true"
          style={{ transform: `translate3d(${dragPreview.x + 14}px, ${dragPreview.y - 12}px, 0)` }}
        >
          <ScoreMixerInstrumentIcon score={score} part={dragPreview.name} />
          <span>{dragPreview.name}</span>
        </div>
      )}
      {instrumentDialog && (
        <ScoreInstrumentDialog
          mode={instrumentDialog}
          part={instrumentDialog === 'rename' ? renamingPart : part}
          onRename={(name) => onRenameInstrument(renamingPart, name)}
          onClose={() => setInstrumentDialog(null)}
          onAdd={onAddInstrument}
          onRemove={onRemoveInstrument}
        />
      )}
    </section>
  );
  return layout.mixerHost ? createPortal(mixer, layout.mixerHost) : mixer;
}

function MixerMeasures({
  score,
  part,
  name,
  bars,
  measures,
  active,
  playing,
  playbackBeat,
  playbackPosition,
  selectedMeasure,
  disabled,
  onMeasureSelect,
}: {
  score: Score;
  part: string;
  name: string;
  bars: number;
  measures: ReturnType<typeof scoreMeasures>[];
  active: boolean;
  playing: boolean;
  playbackBeat: number | null;
  playbackPosition?: ScorePlaybackPosition;
  selectedMeasure: number | null;
  disabled: boolean;
  onMeasureSelect: (part: string, bar: number) => void;
}) {
  const current = useScorePlaybackValue(playbackPosition, active && playing, (beat) =>
    !active
      ? -1
      : playing && playbackBeat !== null
        ? scoreMeasureAtBeat(score, part, beat ?? playbackBeat).bar
        : (selectedMeasure ?? -1),
  );
  return (
    <div data-mixer-lane className="score-mixer-bars" aria-label={`${name} 마디별 연주 구간`}>
      {Array.from({ length: bars }, (_, index) => (
        <button
          type="button"
          aria-label={`${name} ${index + 1}마디로 이동`}
          disabled={disabled || playing}
          onClick={() => onMeasureSelect(name, index)}
          key={index}
          title={`${index + 1}마디`}
          data-notes={measures.some((rows) =>
            rows[index]?.some(({ note }) => !note.rest && !note.blank),
          )}
          data-current={current === index}
        />
      ))}
    </div>
  );
}
