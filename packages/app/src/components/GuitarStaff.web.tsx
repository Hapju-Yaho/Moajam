import { useEffect, useRef, useState } from 'react';
import { ScoreRhythmFeel } from './ScoreRhythmFeel.web';
import {
  scoreSystemLayouts,
  scoreBeamGroups,
  scoreBeatHitRegions,
  scoreStemDirection,
  scoreConnectionArc,
  scoreSlidePath,
  scoreTabLabel,
} from '../lib/scoreLayout';
import {
  scoreBeat,
  writtenScoreBeats,
  scoreTupletGroups,
  scoreMeasureAtBeat,
  scoreMeasureStart,
  scoreMeasureDuration,
  scoreBarBeats,
  scoreTimeSignature,
  noteTones,
  pitchName,
  scoreInstrument,
  scoreMeasures,
  scoreSystemRows,
  staffPosition,
  tabTones,
  DOTTED_SCORE_BEATS,
  scoreMeasureCount,
  scoreChordPositions,
  scoreConnectionLabels,
  scoreAccidentalMarks,
  type Score,
} from '../lib/score';

export function GuitarStaff({
  score,
  part,
  selected,
  hasSelection,
  onDeselect,
  selectedString,
  cursor,
  playbackBeat,
  zoom,
  onSelect,
  onAppend,
  onChordSelect,
  emptyBeat,
  emptyMeasure,
  inputBeats,
  showTab,
  rangeIds,
  onRangeSelect,
  editable,
  onMeasureContextMenu,
  layoutWidth,
}: {
  score: Score;
  part: string;
  selected: string | null;
  hasSelection: boolean;
  onDeselect: () => void;
  selectedString: number;
  cursor: string | null;
  playbackBeat: number | null;
  zoom: number;
  onSelect: (id: string, string?: number, beat?: number) => void;
  onAppend: (string: number, beat: number, bar?: number) => void;
  onChordSelect: (beat: number) => void;
  emptyBeat: number;
  emptyMeasure?: number;
  inputBeats: number;
  showTab: boolean;
  rangeIds: string[];
  onRangeSelect: (anchor: string, end: string) => void;
  editable: boolean;
  onMeasureContextMenu?: (measure: number, x: number, y: number) => void;
  layoutWidth?: number;
}) {
  const systems = useRef<HTMLDivElement>(null);
  const drag = useRef<{ anchor: string; end: string; x: number; y: number; moved: boolean } | null>(
    null,
  );
  const suppressClick = useRef(false);
  const [measuredWidth, setSystemWidth] = useState(800);
  const systemWidth = layoutWidth ?? measuredWidth;
  const playbackBar =
    playbackBeat === null ? null : scoreMeasureAtBeat(score, part, playbackBeat).bar;
  useEffect(() => {
    if (!systems.current || layoutWidth !== undefined) return;
    const observer = new ResizeObserver(([entry]) =>
      setSystemWidth(Math.max(1, entry.contentRect.width)),
    );
    observer.observe(systems.current);
    return () => observer.disconnect();
  }, [layoutWidth]);
  useEffect(() => {
    if (playbackBar === null) return;
    const measure = systems.current?.querySelector(
      '[data-playback-active="true"] [data-measure-scroll-target]',
    );
    if (!measure) return;
    // Bring the workspace into view before centering its measure, otherwise an
    // offscreen nested viewport can leave half the measure clipped at its edge.
    const scrollers: { element: HTMLElement; vertical: boolean; horizontal: boolean }[] = [];
    let parent = measure.parentElement;
    while (parent) {
      const expanded = parent.matches('.score-editor-viewport[data-expanded="true"]');
      const style = getComputedStyle(parent);
      const vertical =
        /(auto|scroll)/.test(style.overflowY) && parent.scrollHeight > parent.clientHeight;
      const horizontal =
        /(auto|scroll)/.test(style.overflowX) && parent.scrollWidth > parent.clientWidth;
      if (vertical || horizontal) scrollers.unshift({ element: parent, vertical, horizontal });
      // Fullscreen lives in the top layer; never scroll its inert app ancestors.
      if (expanded) break;
      parent = parent.parentElement;
    }
    scrollers.forEach(({ element, vertical, horizontal }, index) => {
      const bounds = (scrollers[index + 1]?.element ?? measure).getBoundingClientRect();
      const viewport = element.getBoundingClientRect();
      if (vertical) {
        const expanded = element.matches('.score-editor-viewport[data-expanded="true"]');
        const toolbar = expanded
          ? (element.querySelector('.score-editor-viewbar')?.getBoundingClientRect().height ?? 0)
          : 0;
        const top = Math.max(0, viewport.top + element.clientTop) + toolbar;
        const bottom = Math.min(
          window.innerHeight,
          viewport.top + element.clientTop + element.clientHeight,
        );
        element.scrollBy({
          top: (bounds.top + bounds.bottom - top - bottom) / 2,
          behavior: 'instant',
        });
      }
      if (horizontal) {
        element.scrollBy({
          left:
            (bounds.left + bounds.right) / 2 -
            viewport.left -
            element.clientLeft -
            element.clientWidth / 2,
          behavior: 'instant',
        });
      }
    });
  }, [playbackBar, part, score.systemLayout, systemWidth, zoom, showTab]);
  useEffect(() => {
    if (playbackBar !== null) return;
    const active = cursor ?? selected;
    if (drag.current?.moved) return;
    const cell = active
      ? [...(systems.current?.querySelectorAll('[data-score-note]') ?? [])].find(
          (element) => element.getAttribute('data-score-note') === active,
        )
      : systems.current?.querySelector('[data-empty-active="true"]');
    const workspace = systems.current?.closest<HTMLElement>('.score-workspace');
    if (!cell || !workspace) return;
    const bounds = cell.getBoundingClientRect(),
      viewport = workspace.getBoundingClientRect();
    workspace.scrollBy({
      top:
        bounds.top < viewport.top
          ? bounds.top - viewport.top - 12
          : Math.max(0, bounds.bottom - viewport.bottom + 12),
      left:
        bounds.left < viewport.left
          ? bounds.left - viewport.left - 12
          : Math.max(0, bounds.right - viewport.right + 12),
    });
  }, [selected, cursor, emptyBeat, playbackBar, score.systemLayout, systemWidth]);
  const instrument = scoreInstrument(score, part);
  const tuning = instrument.tuning;
  const hasTab = showTab && tuning.length > 0;
  const chordPositions = scoreChordPositions(score, part);
  const connectedNotes = score.notes.filter((n) => n.part === part && n.connection);
  const tieTargets = new Set(
    connectedNotes.filter((n) => n.connection?.type === 'tie').map((n) => n.connection!.targetId),
  );
  let measures;
  try {
    measures = scoreMeasures(score, part);
  } catch (error) {
    return (
      <div role="alert">{error instanceof Error ? error.message : '악보를 표시하지 못했어요.'}</div>
    );
  }
  const count = Math.max(
    1,
    scoreMeasureCount(score, part),
    hasSelection && selected === null
      ? (emptyMeasure ?? scoreMeasureAtBeat(score, part, emptyBeat).bar) + 1
      : 0,
  );
  while (measures.length < count) measures = [...measures, []];
  const staffY = (pitch: number) =>
    122 -
    (instrument.clef === 'bass8'
      ? staffPosition(pitch + 12, score.keySignature) - staffPosition(43)
      : staffPosition(pitch + (instrument.clef === 'treble8' ? 12 : 0), score.keySignature)) *
      5;
  return (
    <div
      ref={systems}
      className="score-systems"
      data-layout-width={systemWidth / (zoom / 100)}
      aria-label={`${part} 오선보${hasTab ? '와 TAB' : ''}`}
      onPointerDown={(event) => {
        suppressClick.current = false;
        if (!editable || event.button !== 0 || event.pointerType === 'touch') return;
        const id = (event.target as Element)
          .closest('[data-score-note]')
          ?.getAttribute('data-score-note');
        if (!id) return;
        drag.current = { anchor: id, end: id, x: event.clientX, y: event.clientY, moved: false };
      }}
      onPointerMove={(event) => {
        const current = drag.current;
        if (event.buttons !== 1) {
          drag.current = null;
          return;
        }
        if (!current || !editable) return;
        if (!current.moved && Math.hypot(event.clientX - current.x, event.clientY - current.y) < 5)
          return;
        if (!current.moved) event.currentTarget.setPointerCapture(event.pointerId);
        const cell = document
          .elementFromPoint(event.clientX, event.clientY)
          ?.closest('[data-score-note]');
        const id =
          cell && systems.current?.contains(cell) ? cell.getAttribute('data-score-note') : null;
        if (id) {
          if (!current.moved || current.end !== id) onRangeSelect(current.anchor, id);
          current.end = id;
        }
        current.moved = true;
        const workspace = systems.current?.closest<HTMLElement>('.score-workspace');
        if (workspace) {
          const bounds = workspace.getBoundingClientRect();
          if (event.clientY < bounds.top + 32) workspace.scrollBy(0, -24);
          else if (event.clientY > bounds.bottom - 32) workspace.scrollBy(0, 24);
        }
      }}
      onPointerUp={(event) => {
        suppressClick.current = !!drag.current?.moved;
        drag.current = null;
        if (event.currentTarget.hasPointerCapture(event.pointerId))
          event.currentTarget.releasePointerCapture(event.pointerId);
      }}
      onPointerCancel={() => {
        drag.current = null;
        suppressClick.current = false;
      }}
      onLostPointerCapture={() => {
        drag.current = null;
      }}
      onClickCapture={(event) => {
        if (suppressClick.current) {
          event.preventDefault();
          event.stopPropagation();
          suppressClick.current = false;
        } else if (event.shiftKey && selected && editable) {
          const id = (event.target as Element)
            .closest('[data-score-note]')
            ?.getAttribute('data-score-note');
          if (id) {
            event.stopPropagation();
            onRangeSelect(selected, id);
          }
        }
      }}
    >
      {scoreSystemRows(score, part, count).map((system, line) => {
        const bars = measures
          .slice(system.start, system.start + system.count)
          .map((fragments, column) => {
            const bar = system.start + column;
            const barStart = scoreMeasureStart(score, part, bar);
            const barBeats = scoreMeasureDuration(score, part, bar);
            const used = fragments.reduce((sum, fragment) => scoreBeat(sum + fragment.beats), 0);
            const firstBlank = fragments.find((fragment) => fragment.note.blank);
            const entryOffset = firstBlank?.offset ?? used;
            const displayBeats = Math.max(barBeats, scoreBarBeats(score));
            const activeBar =
              hasSelection &&
              playbackBeat === null &&
              (emptyMeasure ?? scoreMeasureAtBeat(score, part, emptyBeat).bar) === bar;
            const entryActive =
              activeBar &&
              emptyBeat === scoreBeat(barStart + entryOffset) &&
              (firstBlank ? selected === firstBlank.note.id : selected === null);
            const emptyOffsets =
              !firstBlank && editable && entryActive && entryOffset < displayBeats
                ? [entryOffset]
                : [];
            fragments = fragments.filter(
              (fragment) =>
                !fragment.note.blank || (editable && entryActive && fragment === firstBlank),
            );
            return { fragments, bar, emptyOffsets, barStart, barBeats, displayBeats };
          });
        const prefix = 76 + Math.abs(score.keySignature ?? 0) * 7;
        const layouts = scoreSystemLayouts(
          bars.map(({ fragments, barStart, barBeats }) => {
            const notation = fragments.filter(({ note }) => !note.blank);
            const marks = scoreAccidentalMarks(notation, score.keySignature);
            const tabWidths = notation.map(({ note, continued }) =>
              hasTab
                ? Math.max(
                    0,
                    ...tabTones(note, tuning).map(
                      (tone) =>
                        scoreTabLabel(
                          tone.fret,
                          tone.dead,
                          !!tone.ghost || continued || tieTargets.has(note.id),
                        ).halfWidth,
                    ),
                  )
                : 0,
            );
            return [
              ...notation.map(({ offset, note, beats }, index) => ({
                offset,
                space: Math.max(40, Math.min(10, note.lyric.length) * 7 + 10),
                minSpace: Math.max(
                  18 +
                    (note.slideOut ? 22 : note.connection?.type === 'glissando' ? 12 : 0) +
                    (marks[index + 1]?.some(Boolean) ? 10 : 0) +
                    (DOTTED_SCORE_BEATS.includes(writtenScoreBeats(note, beats)) ? 8 : 0),
                  Math.min(10, note.lyric.length) * 7 + 10,
                  tabWidths[index] +
                    (tabWidths[index + 1] ?? 0) +
                    (note.connection?.type === 'glissando' ? 12 : 4) +
                    (note.slideOut ? 24 : 0),
                ),
              })),
              ...Object.entries(chordPositions)
                .filter(([beat]) => Number(beat) >= barStart && Number(beat) < barStart + barBeats)
                .map(([beat, chord]) => ({
                  offset: Number(beat) - barStart,
                  space: chord.length * 10 + 14,
                })),
            ];
          }),
          systemWidth / (zoom / 100) - prefix - 1,
          score.equalWidthRows?.[part]?.includes(line),
          bars.map(({ bar }) => score.measureWidths?.[part]?.[bar] ?? 100),
          bars.map(({ displayBeats }) => displayBeats),
        );
        const drawingWidth = prefix + layouts.reduce((sum, layout) => sum + layout.width, 0) + 1;
        const positions = bars.flatMap(({ fragments }) =>
          fragments.flatMap(({ note }) => noteTones(note).map((tone) => staffY(tone.pitch))),
        );
        const top = Math.min(
          line === 0 ? 0 : 24,
          ...positions.map(
            (y) =>
              y -
              (bars.some(({ fragments }) =>
                fragments.some(({ note }) => note.slurTo || note.tuplet),
              )
                ? 100
                : 48),
          ),
        );
        const tabTop = Math.max(190, ...positions.map((y) => y + 55));
        const bottom = hasTab
          ? tabTop + (tuning.length - 1) * 20 + 35
          : Math.max(190, ...positions.map((y) => y + 55));
        return (
          <svg
            key={line}
            className="score-system"
            fontFamily="Segoe UI Symbol, Malgun Gothic, sans-serif"
            aria-label={`${system.start + 1}–${system.start + system.count}마디 악보 줄`}
            width={(drawingWidth * zoom) / 100}
            height={((bottom - top) * zoom) / 100}
            viewBox={`0 ${top} ${drawingWidth} ${bottom - top}`}
          >
            {line === 0 && (
              <text
                x="8"
                y={top + 60}
                fontSize="16"
                fontWeight="600"
                fill="#344b3e"
                aria-label={`악보 템포 ${score.bpm} BPM`}
              >
                ♩ = {score.bpm}
              </text>
            )}
            {line === 0 && (
              <ScoreRhythmFeel feel={score.rhythmFeel ?? 'straight'} x={8} y={top + 2} />
            )}
            {[82, 92, 102, 112, 122].map((y) => (
              <line
                key={y}
                x1="0"
                x2={drawingWidth - 1}
                y1={y}
                y2={y}
                stroke="#9aa49f"
                strokeWidth=".8"
              />
            ))}
            <g aria-label="줄 시작 음자리표와 박자표">
              <text x="10" y="116" fontSize="44">
                {instrument.clef === 'bass8' ? '𝄢' : '𝄞'}
              </text>
              {instrument.clef !== 'treble' && (
                <text x="23" y="137" fontSize="9">
                  8
                </text>
              )}
              <text x={prefix - 25} y="99" fontSize="18" fontWeight="700">
                {scoreTimeSignature(score).beats}
              </text>
              <text x={prefix - 25} y="119" fontSize="18" fontWeight="700">
                {scoreTimeSignature(score).beatType}
              </text>
              {Array.from({ length: Math.abs(score.keySignature ?? 0) }, (_, index) => {
                const sharp = (score.keySignature ?? 0) > 0;
                const steps = sharp ? [0, 15, -5, 10, 25, 5, 20] : [20, 5, 25, 10, 30, 15, 35];
                return (
                  <text
                    key={index}
                    x={48 + index * 7}
                    y={82 + steps[index] + (instrument.clef === 'bass8' ? 10 : 0) + 5}
                    fontSize="18"
                    aria-label={sharp ? '조표 샵' : '조표 플랫'}
                  >
                    {sharp ? '♯' : '♭'}
                  </text>
                );
              })}
            </g>
            {hasTab &&
              tuning.map((open, i) => (
                <g key={i}>
                  <line
                    x1="45"
                    x2={drawingWidth - 1}
                    y1={tabTop + i * 20}
                    y2={tabTop + i * 20}
                    stroke="#9aa49f"
                    strokeWidth=".8"
                  />
                  <text x="31" y={tabTop + i * 20 + 4} fontSize="10" fill="#82908c">
                    {pitchName(open).replace(/\d/g, '')}
                  </text>
                </g>
              ))}
            {hasTab && (
              <g aria-label="줄 시작 TAB" fontSize="13" fontWeight="700">
                {['T', 'A', 'B'].map((letter, index) => (
                  <text
                    key={letter}
                    x="9"
                    y={tabTop + (tuning.length - 1) * 10 + (index - 1) * 17}
                    dominantBaseline="central"
                  >
                    {letter}
                  </text>
                ))}
              </g>
            )}
            {bars.map(({ fragments, bar, emptyOffsets, barStart, barBeats }, column) => {
              const { width, xAt } = layouts[column];
              const beams = scoreBeamGroups(fragments).map((indices) => {
                const ys = indices.flatMap((index) =>
                  noteTones(fragments[index].note).map((tone) => staffY(tone.pitch)),
                );
                const direction = scoreStemDirection(ys);
                const extension = Math.max(
                  ...indices.map((index) => {
                    const flags = [1, 0.5, 0.25, 0.125].filter(
                      (limit) =>
                        writtenScoreBeats(fragments[index].note, fragments[index].beats) < limit,
                    ).length;
                    return 25 + Math.max(0, flags - 2) * 5;
                  }),
                );
                return {
                  indices,
                  direction,
                  top:
                    (direction === -1 ? Math.min(...ys) : Math.max(...ys)) + direction * extension,
                };
              });
              const marks = scoreAccidentalMarks(fragments, score.keySignature);
              const hitRegions = scoreBeatHitRegions(
                [...fragments.map(({ offset }) => offset), ...emptyOffsets],
                width,
                xAt,
              );
              const staffHitTop = top + 42;
              const staffHitBottom = hasTab ? tabTop - 10 : bottom - 20;
              const playHere =
                playbackBeat !== null && scoreMeasureAtBeat(score, part, playbackBeat).bar === bar;
              const previewHere =
                hasSelection &&
                playbackBeat === null &&
                (emptyMeasure ?? scoreMeasureAtBeat(score, part, emptyBeat).bar) === bar;
              const previewX = xAt(emptyBeat - barStart);
              const chordOffsets = [
                ...new Set([
                  ...Array.from({ length: Math.ceil(barBeats) }, (_, index) => index),
                  ...Object.keys(chordPositions)
                    .map(Number)
                    .filter((beat) => beat >= barStart && beat < barStart + barBeats)
                    .map((beat) => beat - barStart),
                ]),
              ].sort((a, b) => a - b);
              const chordHits = scoreBeatHitRegions(chordOffsets, width, xAt);
              const written = fragments
                .filter(({ note }) => !note.blank)
                .reduce((sum, fragment) => scoreBeat(sum + fragment.beats), 0);
              const invalid =
                fragments.some(({ note }) => !note.blank) &&
                (written !== scoreBarBeats(score) || barBeats !== scoreBarBeats(score));
              const selectedHere =
                hasSelection &&
                ((emptyMeasure ?? scoreMeasureAtBeat(score, part, emptyBeat).bar) === bar ||
                  fragments.some(({ note }) => note.id === selected || rangeIds.includes(note.id)));
              const showWarning = invalid && !selectedHere;
              const repeat = score.repeats?.[bar];
              return (
                <g
                  key={bar}
                  className="score-measure"
                  data-invalid={invalid ? 'true' : undefined}
                  data-warning-visible={showWarning ? 'true' : undefined}
                  aria-label={`${bar + 1}마디`}
                  onContextMenu={(event) => {
                    if (!editable || !onMeasureContextMenu) return;
                    event.preventDefault();
                    onMeasureContextMenu(bar, event.clientX, event.clientY);
                  }}
                  transform={`translate(${prefix + layouts.slice(0, column).reduce((sum, layout) => sum + layout.width, 0)}, 0)`}
                  data-playback-active={playHere ? 'true' : undefined}
                >
                  <rect
                    data-measure-scroll-target
                    x="0"
                    y="65"
                    width={width}
                    height={bottom - 80}
                    fill="none"
                    pointerEvents="none"
                    aria-hidden="true"
                  />
                  {editable && (
                    <rect
                      x="0"
                      y="65"
                      width={width}
                      height={bottom - 80}
                      fill="transparent"
                      role="button"
                      tabIndex={0}
                      aria-label={`${bar + 1}마디 선택`}
                      onClick={() => {
                        const target = fragments.find((item) => !item.note.blank);
                        if (target)
                          onSelect(target.note.id, selectedString, barStart + target.offset);
                        else {
                          const blank = measures[bar]?.find((item) => item.note.blank);
                          if (blank)
                            onSelect(blank.note.id, selectedString, barStart + blank.offset);
                          else onAppend(selectedString, barStart, bar);
                        }
                      }}
                      onKeyDown={(event) => {
                        if (event.key !== 'Enter') return;
                        event.preventDefault();
                        const target = measures[bar]?.[0];
                        if (target)
                          onSelect(target.note.id, selectedString, barStart + target.offset);
                        else onAppend(selectedString, barStart, bar);
                      }}
                    />
                  )}
                  {showWarning && (
                    <g
                      pointerEvents="none"
                      aria-label={`박자 불일치: ${written}박 / 기준 ${scoreBarBeats(score)}박`}
                    >
                      <rect
                        x="0"
                        y="65"
                        width={width}
                        height={bottom - 80}
                        fill="#dc262610"
                        stroke="#dc2626"
                        strokeWidth="1"
                        rx="3"
                      />
                      <title>{`${written}박 / 기준 ${scoreBarBeats(score)}박 · 입력된 길이대로 재생됩니다.`}</title>
                    </g>
                  )}
                  {[repeat?.start ? 0 : null, repeat?.end ? width - 5 : null]
                    .filter((x): x is number => x !== null)
                    .map((x, index) => (
                      <g
                        key={index}
                        aria-label={x === 0 ? '반복 시작' : '반복 끝'}
                        pointerEvents="none"
                      >
                        {[
                          { id: 'staff', top: 82, bottom: 122 },
                          ...(hasTab
                            ? [
                                {
                                  id: 'tab',
                                  top: tabTop,
                                  bottom: tabTop + (tuning.length - 1) * 20,
                                },
                              ]
                            : []),
                        ].map((surface) => (
                          <g
                            key={surface.id}
                            aria-label={`${surface.id === 'tab' ? 'TAB ' : ''}${x === 0 ? '도돌이표 시작' : '도돌이표 끝'}`}
                          >
                            <line
                              x1={x}
                              x2={x}
                              y1={surface.top}
                              y2={surface.bottom}
                              stroke="#293e34"
                              strokeWidth="3"
                            />
                            <line
                              x1={x === 0 ? 5 : x - 5}
                              x2={x === 0 ? 5 : x - 5}
                              y1={surface.top}
                              y2={surface.bottom}
                              stroke="#293e34"
                            />
                            {[-5, 5].map((dy) => (
                              <circle
                                key={dy}
                                cx={x === 0 ? 11 : x - 11}
                                cy={(surface.top + surface.bottom) / 2 + dy}
                                r="2"
                                fill="#293e34"
                              />
                            ))}
                          </g>
                        ))}
                      </g>
                    ))}
                  {score.barlines?.[bar] === 'double' && !repeat?.end && (
                    <g aria-label="겹세로선" pointerEvents="none" stroke="#293e34">
                      {[
                        { top: 82, bottom: 122 },
                        ...(hasTab
                          ? [{ top: tabTop, bottom: tabTop + (tuning.length - 1) * 20 }]
                          : []),
                      ].map((surface, i) => (
                        <g key={i} aria-label={i ? 'TAB 겹세로선' : '오선 겹세로선'}>
                          {[width - 5, width - 1].map((x) => (
                            <line
                              key={x}
                              x1={x}
                              x2={x}
                              y1={surface.top}
                              y2={surface.bottom}
                              strokeWidth="1"
                            />
                          ))}
                        </g>
                      ))}
                    </g>
                  )}
                  {repeat?.end && (
                    <text x={width - 3} y="62" fontSize="10" textAnchor="end">
                      {repeat.times ?? 2}회
                    </text>
                  )}
                  <text
                    className="score-measure-number"
                    x="2"
                    y="74"
                    fill={showWarning ? '#dc2626' : '#82908c'}
                    fontSize="10"
                  >
                    {bar + 1}
                  </text>
                  {chordOffsets.map((offset) => {
                    const chord = chordPositions[barStart + offset];
                    const hit = chordHits.get(offset)!;
                    return (
                      <g
                        key={`chord/${offset}`}
                        role="button"
                        tabIndex={0}
                        className="score-chord-slot"
                        aria-label={`${bar + 1}마디 ${offset + 1}박 코드 ${chord || '설정'}`}
                        onClick={() => onChordSelect(barStart + offset)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            event.preventDefault();
                            onChordSelect(barStart + offset);
                          }
                        }}
                      >
                        <rect
                          x={hit.left}
                          y={top + 20}
                          width={hit.right - hit.left}
                          height="22"
                          fill="transparent"
                        />
                        <title>{`${bar + 1}마디 ${offset + 1}박 코드 편집`}</title>
                        <text
                          x={xAt(offset)}
                          y={top + 36}
                          fill="#345648"
                          fontSize="14"
                          fontWeight="600"
                          className={chord ? undefined : 'score-chord-placeholder'}
                        >
                          {chord || `${offset + 1}박 코드`}
                        </text>
                      </g>
                    );
                  })}
                  <line
                    data-barline="staff"
                    x1={width}
                    x2={width}
                    y1="82"
                    y2="122"
                    stroke="#5f6c65"
                  />
                  {hasTab && (
                    <line
                      data-barline="tab"
                      x1={width}
                      x2={width}
                      y1={tabTop}
                      y2={tabTop + (tuning.length - 1) * 20}
                      stroke="#5f6c65"
                    />
                  )}
                  {playHere && (
                    <line
                      x1={xAt(playbackBeat! - barStart)}
                      x2={xAt(playbackBeat! - barStart)}
                      y1="65"
                      y2={bottom - 18}
                      stroke="#52946d"
                      strokeWidth="2"
                    />
                  )}
                  {fragments.map(
                    ({ note, beats: actualBeats, offset, continued, continues }, index) => {
                      const beats = writtenScoreBeats(note, actualBeats);
                      const beam = beams.find(({ indices }) => indices.includes(index));
                      const x = xAt(offset),
                        tones = tabTones(note, tuning);
                      const hit = hitRegions.get(offset)!;
                      const cursorWidth = Math.min(28, 2 * Math.min(x - hit.left, hit.right - x));

                      const chosen =
                        selected === note.id &&
                        emptyBeat >= barStart + offset &&
                        emptyBeat < scoreBeat(barStart + offset + actualBeats);
                      return (
                        <g key={`${note.id}/${index}`} data-score-note={note.id}>
                          {rangeIds.includes(note.id) && (
                            <rect
                              className="score-range-highlight"
                              aria-label="복사 구간 선택"
                              x={hit.left}
                              y={staffHitTop}
                              width={hit.right - hit.left}
                              height={bottom - staffHitTop - 20}
                              fill="#93b6ef"
                              fillOpacity="0.25"
                              pointerEvents="none"
                            />
                          )}
                          {playbackBeat === null && cursor === note.id && (
                            <rect
                              x={x - 16}
                              y="30"
                              width="32"
                              height={bottom - 38}
                              rx="4"
                              fill="#e0eee5"
                            />
                          )}
                          <g
                            role="button"
                            tabIndex={0}
                            aria-label={`${bar + 1}마디 ${offset + 1}박 ${
                              note.blank
                                ? '빈 박'
                                : note.rest
                                  ? '쉼표'
                                  : noteTones(note)
                                      .map(
                                        (tone) =>
                                          `${pitchName(tone.pitch)}${tone.dead ? ' 데드노트' : tone.ghost ? ' 고스트노트' : ''}`,
                                      )
                                      .join(' ')
                            } ${Number(actualBeats.toFixed(3))}박 길이${note.tuplet ? ' 셋잇단음표' : ''}${note.staccato && !note.rest ? ' 스타카토' : ''}`}
                            aria-pressed={chosen || rangeIds.includes(note.id)}
                            onClick={(event) => {
                              const matrix = event.currentTarget.getScreenCTM();
                              const pitches = noteTones(note);
                              if (!matrix || !pitches.length) {
                                onSelect(note.id, undefined, barStart + offset);
                                return;
                              }
                              const point = new DOMPoint(
                                event.clientX,
                                event.clientY,
                              ).matrixTransform(matrix.inverse());
                              const index = pitches.reduce(
                                (nearest, tone, i) =>
                                  Math.abs(staffY(tone.pitch) - point.y) <
                                  Math.abs(staffY(pitches[nearest].pitch) - point.y)
                                    ? i
                                    : nearest,
                                0,
                              );
                              onSelect(
                                note.id,
                                tuning.length ? (tones[index]?.string ?? 1) : index + 1,
                                barStart + offset,
                              );
                            }}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter') {
                                event.preventDefault();
                                onSelect(note.id, undefined, barStart + offset);
                              }
                            }}
                          >
                            <rect
                              x={hit.left}
                              y={staffHitTop}
                              width={hit.right - hit.left}
                              height={staffHitBottom - staffHitTop}
                              fill="transparent"
                            />
                            {!hasTab && chosen && (
                              <rect
                                x={x - cursorWidth / 2}
                                y={
                                  staffY(noteTones(note)[selectedString - 1]?.pitch ?? note.pitch) -
                                  10
                                }
                                width={cursorWidth}
                                height="20"
                                fill="none"
                                stroke="#c77830"
                              />
                            )}
                            {note.blank ? null : note.rest ? (
                              <g>
                                <text aria-label="오선 쉼표" x={x - 7} y="113" fontSize="24">
                                  {beats >= 4
                                    ? '𝄻'
                                    : beats >= 2
                                      ? '𝄼'
                                      : beats >= 1
                                        ? '𝄽'
                                        : beats >= 0.5
                                          ? '𝄾'
                                          : beats >= 0.25
                                            ? '𝄿'
                                            : beats >= 0.125
                                              ? '\u{1D140}'
                                              : '\u{1D141}'}
                                </text>
                                {DOTTED_SCORE_BEATS.includes(beats) && (
                                  <circle
                                    aria-label="점음표 점"
                                    cx={x + 11}
                                    cy="103"
                                    r="1.6"
                                    fill="#293e34"
                                  />
                                )}
                              </g>
                            ) : (
                              noteTones(note).map((tone, toneIndex) => {
                                const y = staffY(tone.pitch),
                                  ledgers: number[] = [];
                                const flags = [1, 0.5, 0.25, 0.125].filter(
                                  (limit) => beats < limit,
                                ).length;
                                const stemHeight = 25 + Math.max(0, flags - 2) * 5;
                                const ys = noteTones(note).map((t) => staffY(t.pitch));
                                const direction = beam?.direction ?? scoreStemDirection(ys);
                                const stemX = x - direction * 4.5;
                                const stemStart =
                                  direction === -1 ? Math.max(...ys) : Math.min(...ys);
                                const stemEnd =
                                  beam?.top ??
                                  (direction === -1 ? Math.min(...ys) : Math.max(...ys)) +
                                    direction * stemHeight;
                                for (let line = 132; line <= y; line += 10) ledgers.push(line);
                                for (let line = 72; line >= y; line -= 10) ledgers.push(line);
                                return (
                                  <g key={toneIndex}>
                                    {ledgers.map((line) => (
                                      <line
                                        key={line}
                                        x1={x - 9}
                                        x2={x + 9}
                                        y1={line}
                                        y2={line}
                                        stroke="#536159"
                                      />
                                    ))}
                                    {marks[index][toneIndex] && (
                                      <text x={x - 9} y={y + 4} fontSize="14" textAnchor="end">
                                        {marks[index][toneIndex]}
                                      </text>
                                    )}
                                    {tone.dead ? (
                                      <path
                                        aria-label="뮤트 X 음표"
                                        d={`M${x - 4} ${y - 4}l8 8m-8 0l8 -8`}
                                        stroke="#293e34"
                                        strokeWidth="1.4"
                                        fill="none"
                                      />
                                    ) : (
                                      <ellipse
                                        cx={x}
                                        cy={y}
                                        rx="5"
                                        ry="3.3"
                                        transform={`rotate(-18 ${x} ${y})`}
                                        fill={beats >= 2 ? '#fffefb' : '#293e34'}
                                        stroke="#293e34"
                                        strokeWidth="1.1"
                                      />
                                    )}
                                    {beats < 4 && toneIndex === 0 && (
                                      <line
                                        data-stem-direction={direction === -1 ? 'up' : 'down'}
                                        x1={stemX}
                                        x2={stemX}
                                        y1={stemStart}
                                        y2={stemEnd}
                                        stroke="#293e34"
                                        strokeWidth="1.1"
                                      />
                                    )}
                                    {Array.from(
                                      { length: beam || toneIndex !== 0 ? 0 : flags },
                                      (_, flag) => (
                                        <path
                                          key={flag}
                                          d={`M${stemX} ${stemEnd - direction * flag * 6}q12 ${-direction * 7} 6 ${-direction * 15}`}
                                          fill="none"
                                          stroke="#293e34"
                                          strokeWidth="1.6"
                                        />
                                      ),
                                    )}
                                    {DOTTED_SCORE_BEATS.includes(beats) && (
                                      <circle
                                        aria-label="점음표 점"
                                        cx={x + (tone.ghost ? 14 : 8.5)}
                                        cy={(y - 82) % 10 === 0 ? y - 5 : y}
                                        r="1.3"
                                        fill="#293e34"
                                      />
                                    )}
                                    {tone.ghost && !tone.dead && (
                                      <g aria-label="약하게 연주 괄호" fill="#65786c">
                                        <text x={x - 11} y={y + 4} fontSize="14">
                                          (
                                        </text>
                                        <text x={x + 7} y={y + 4} fontSize="14">
                                          )
                                        </text>
                                      </g>
                                    )}
                                    {note.staccato && !continued && toneIndex === 0 && (
                                      <circle
                                        aria-label="스타카토 표시"
                                        cx={x}
                                        cy={
                                          direction === -1
                                            ? Math.max(...ys) + 12
                                            : Math.min(...ys) - 12
                                        }
                                        r="1.8"
                                        fill="#293e34"
                                      />
                                    )}
                                    {(continued || continues) && (
                                      <path
                                        d={`M${x - (continued ? 20 : 0)} ${y + 10}q15 12 30 0`}
                                        fill="none"
                                        stroke="#536159"
                                      />
                                    )}
                                  </g>
                                );
                              })
                            )}
                            {note.accent && !continued && (
                              <text x={x} y="66" textAnchor="middle" fontSize="17">
                                &gt;
                              </text>
                            )}
                          </g>
                          {hasTab &&
                            tuning.map((_, row) => {
                              const tone = tones.find((item) => item.string === row + 1);
                              const tabLabel = tone
                                ? scoreTabLabel(
                                    tone.fret,
                                    tone.dead,
                                    !!tone.ghost || continued || tieTargets.has(note.id),
                                  )
                                : undefined;
                              return (
                                <g
                                  key={row}
                                  role="button"
                                  className="score-position-cell"
                                  tabIndex={0}
                                  aria-label={`${bar + 1}마디 ${offset + 1}박 ${row + 1}번 줄 ${tone ? `${tone.dead ? 'X 데드노트' : `${tone.fret}프렛`}${tone.ghost && !tone.dead ? ' 고스트노트' : ''}${note.staccato ? ' 스타카토' : ''}` : note.blank ? '빈 박' : note.rest ? '쉼표' : '빈 줄'}`}
                                  aria-pressed={
                                    (chosen && selectedString === row + 1) ||
                                    rangeIds.includes(note.id)
                                  }
                                  onClick={() =>
                                    chosen && selectedString === row + 1
                                      ? onDeselect()
                                      : onSelect(note.id, row + 1, barStart + offset)
                                  }
                                  onKeyDown={(event) => {
                                    if (event.key === 'Enter') {
                                      event.preventDefault();
                                      onSelect(note.id, row + 1, barStart + offset);
                                    }
                                  }}
                                >
                                  <rect
                                    x={hit.left}
                                    y={tabTop + row * 20 - 10}
                                    width={hit.right - hit.left}
                                    height="20"
                                    fill="transparent"
                                  />
                                  <rect
                                    className="score-cell-cursor"
                                    x={x - cursorWidth / 2}
                                    y={tabTop + row * 20 - 9}
                                    width={cursorWidth}
                                    height="18"
                                    rx="1"
                                    fill={
                                      chosen && selectedString === row + 1
                                        ? '#fff2df'
                                        : 'transparent'
                                    }
                                    stroke={
                                      chosen && selectedString === row + 1 ? '#c77830' : 'none'
                                    }
                                  />
                                  {tone && (
                                    <>
                                      <text
                                        x={x}
                                        y={tabTop + row * 20 + 4}
                                        textAnchor="middle"
                                        fontSize="12"
                                        fontWeight="600"
                                        paintOrder="stroke"
                                        stroke={
                                          chosen && selectedString === row + 1
                                            ? '#fff2df'
                                            : '#fffefb'
                                        }
                                        strokeWidth="3"
                                        strokeLinejoin="round"
                                      >
                                        {tabLabel!.label}
                                      </text>
                                    </>
                                  )}
                                  {tone && note.staccato && !continued && (
                                    <circle
                                      cx={x}
                                      cy={tabTop + row * 20 + 10}
                                      r="1.3"
                                      fill="#293e34"
                                    />
                                  )}
                                </g>
                              );
                            })}
                          {hasTab && tones.some((tone) => !tone.string) && (
                            <text
                              x={x}
                              y={tabTop - 15}
                              fontSize="9"
                              textAnchor="middle"
                              fill="#a65a32"
                            >
                              범위 밖
                            </text>
                          )}
                          {!continued && (
                            <text
                              x={x}
                              y={bottom - 12}
                              fontSize="11"
                              textAnchor="middle"
                              fill="#77857d"
                            >
                              {note.lyric.slice(0, 10)}
                            </text>
                          )}
                        </g>
                      );
                    },
                  )}
                  {beams.map(({ indices, top, direction }, groupIndex) => (
                    <g
                      key={`beams/${groupIndex}`}
                      aria-label="박 단위 음표 묶음"
                      pointerEvents="none"
                      stroke="#293e34"
                      strokeWidth="2.4"
                    >
                      {[0, 1, 2, 3].flatMap((level) =>
                        indices.flatMap((index, position) => {
                          const flags = [1, 0.5, 0.25, 0.125].filter(
                            (limit) =>
                              writtenScoreBeats(fragments[index].note, fragments[index].beats) <
                              limit,
                          ).length;
                          if (flags <= level) return [];
                          const next = indices[position + 1],
                            previous = indices[position - 1];
                          const hasNext =
                            next !== undefined &&
                            writtenScoreBeats(fragments[next].note, fragments[next].beats) <
                              [1, 0.5, 0.25, 0.125][level];
                          const hasPrevious =
                            previous !== undefined &&
                            writtenScoreBeats(fragments[previous].note, fragments[previous].beats) <
                              [1, 0.5, 0.25, 0.125][level];
                          if (!hasNext && hasPrevious) return [];
                          const x = xAt(fragments[index].offset) - direction * 4.5;
                          return [
                            <line
                              key={`${level}/${index}`}
                              x1={x}
                              x2={
                                hasNext
                                  ? xAt(fragments[next].offset) - direction * 4.5
                                  : x + (position === indices.length - 1 ? -8 : 8)
                              }
                              y1={top - direction * level * 7}
                              y2={top - direction * level * 7}
                            />,
                          ];
                        }),
                      )}
                    </g>
                  ))}
                  {emptyOffsets.map((offset) => {
                    const active =
                      hasSelection &&
                      selected === null &&
                      emptyBeat === barStart + offset &&
                      (emptyMeasure === undefined || emptyMeasure === bar);
                    const x = xAt(offset);
                    const hit = hitRegions.get(offset)!;
                    const cursorWidth = Math.min(28, 2 * Math.min(x - hit.left, hit.right - x));
                    return (
                      <g key={`empty/${offset}`} data-empty-active={active ? 'true' : undefined}>
                        {hasTab && (
                          <g
                            role="button"
                            tabIndex={0}
                            aria-label={`${bar + 1}마디 ${offset + 1}박 오선보 빈 칸`}
                            onClick={() =>
                              active
                                ? onDeselect()
                                : onAppend(selectedString, barStart + offset, bar)
                            }
                            onKeyDown={(event) => {
                              if (event.key === 'Enter') {
                                event.preventDefault();
                                onAppend(selectedString, barStart + offset, bar);
                              }
                            }}
                          >
                            <rect
                              x={hit.left}
                              y={staffHitTop}
                              width={hit.right - hit.left}
                              height={staffHitBottom - staffHitTop}
                              fill="transparent"
                            />
                          </g>
                        )}
                        {(hasTab ? tuning : [0]).map((_, row) => {
                          const y = hasTab ? tabTop + row * 20 : 102;
                          const focused = active && (hasTab ? selectedString === row + 1 : true);
                          return (
                            <g
                              key={row}
                              role="button"
                              tabIndex={0}
                              className="score-empty-cell score-position-cell"
                              aria-label={`${bar + 1}마디 ${offset + 1}박 ${hasTab ? `${row + 1}번 줄 ` : ''}빈 칸`}
                              aria-pressed={focused}
                              onClick={() =>
                                focused ? onDeselect() : onAppend(row + 1, barStart + offset, bar)
                              }
                              onKeyDown={(event) => {
                                if (event.key === 'Enter') {
                                  event.preventDefault();
                                  onAppend(row + 1, barStart + offset, bar);
                                }
                              }}
                            >
                              <rect
                                x={hit.left}
                                y={hasTab ? y - 10 : staffHitTop}
                                width={hit.right - hit.left}
                                height={hasTab ? 20 : staffHitBottom - staffHitTop}
                                fill="transparent"
                              />
                              <rect
                                className="score-cell-cursor"
                                x={x - cursorWidth / 2}
                                y={y - 9}
                                width={cursorWidth}
                                height="18"
                                rx="1"
                                fill={focused ? '#fff2df' : 'transparent'}
                                stroke={focused ? '#c77830' : 'none'}
                                strokeWidth="1.4"
                              />
                            </g>
                          );
                        })}
                      </g>
                    );
                  })}
                  {previewHere && (
                    <g
                      className="score-duration-preview"
                      role="img"
                      aria-label={`입력 미리보기 ${inputBeats}박`}
                      data-preview-beats={inputBeats}
                      fill="#b96a23"
                      stroke="#b96a23"
                      opacity="0.48"
                      pointerEvents="none"
                    >
                      <rect
                        x={previewX - 3}
                        y={hasTab ? tabTop + (selectedString - 1) * 20 + 8 : 126}
                        width={Math.max(
                          6,
                          xAt(
                            Math.min(
                              Math.max(barBeats, scoreBarBeats(score)),
                              emptyBeat - barStart + inputBeats,
                            ),
                          ) - previewX,
                        )}
                        height="3"
                        rx="1.5"
                        stroke="none"
                      />
                    </g>
                  )}
                </g>
              );
            })}
            {score.notes
              .filter((note) => note.part === part && note.slurTo)
              .map((from) => {
                const partNotes = score.notes.filter((note) => note.part === part);
                const first = partNotes.indexOf(from),
                  last = partNotes.findIndex((note) => note.id === from.slurTo);
                if (last <= first) return null;
                const ids = new Set(partNotes.slice(first, last + 1).map((note) => note.id));
                const located = bars.flatMap(({ fragments }, column) =>
                  fragments
                    .filter((fragment) => ids.has(fragment.note.id))
                    .map((fragment) => ({
                      ...fragment,
                      x:
                        prefix +
                        layouts.slice(0, column).reduce((sum, layout) => sum + layout.width, 0) +
                        layouts[column].xAt(fragment.offset),
                    })),
                );
                if (!located.length) return null;
                const a = located.find(
                  (fragment) => fragment.note.id === from.id && !fragment.continued,
                );
                const b = located.find(
                  (fragment) => fragment.note.id === from.slurTo && !fragment.continues,
                );
                const x1 = a ? a.x : prefix + 2,
                  x2 = b ? b.x : drawingWidth - 5;
                const staffPositions = located.flatMap(({ note }) =>
                  noteTones(note).map((tone) => staffY(tone.pitch)),
                );
                const side = -scoreStemDirection(staffPositions) as -1 | 1;
                const edge = (ys: number[], direction: -1 | 1) =>
                  direction === -1 ? Math.min(...ys) : Math.max(...ys);
                const staffPoints = located.map(({ x, note }) => ({
                  x,
                  y: edge(
                    noteTones(note).map((tone) => staffY(tone.pitch)),
                    side,
                  ),
                }));
                const tabPositions = located.flatMap(({ note }) =>
                  tabTones(note, tuning).map((tone) => tabTop + ((tone.string ?? 1) - 1) * 20),
                );
                const tabSide: -1 | 1 =
                  tabPositions.reduce((sum, y) => sum + y, 0) / tabPositions.length >=
                  tabTop + (tuning.length - 1) * 10
                    ? 1
                    : -1;
                const tabPoints = located.map(({ x, note }) => ({
                  x,
                  y: edge(
                    tabTones(note, tuning).map((tone) => tabTop + ((tone.string ?? 1) - 1) * 20),
                    tabSide,
                  ),
                }));
                const extend = (points: { x: number; y: number }[]) => [
                  ...(!a ? [{ x: x1, y: points[0].y }] : []),
                  ...points,
                  ...(!b ? [{ x: x2, y: points.at(-1)!.y }] : []),
                ];
                return (
                  <g key={`slur/${from.id}`} pointerEvents="none" fill="#385f4a" stroke="none">
                    <path
                      aria-label="이음줄(슬러)"
                      d={scoreConnectionArc(extend(staffPoints), side).d}
                    />
                    {hasTab && (
                      <path
                        aria-label="TAB 이음줄(슬러)"
                        d={scoreConnectionArc(extend(tabPoints), tabSide).d}
                      />
                    )}
                  </g>
                );
              })}
            {scoreTupletGroups(score.notes.filter((note) => note.part === part)).map((group) => {
              const located = bars.flatMap(({ fragments }, column) =>
                fragments
                  .filter((f) => group.some((note) => note.id === f.note.id))
                  .map((fragment) => ({
                    ...fragment,
                    x:
                      prefix +
                      layouts.slice(0, column).reduce((sum, layout) => sum + layout.width, 0) +
                      layouts[column].xAt(fragment.offset),
                  })),
              );
              if (!located.length) return null;
              const x1 = located[0].x - 8,
                x2 = located.at(-1)!.x + 12;
              const y =
                Math.min(
                  ...located.flatMap(({ note }) =>
                    note.rest ? [82] : noteTones(note).map((tone) => staffY(tone.pitch)),
                  ),
                ) - 53;
              return (
                <g key={`tuplet/${group[0].id}`} pointerEvents="none" aria-label="셋잇단음표 묶음">
                  {[y, ...(hasTab ? [tabTop + (tuning.length - 1) * 20 + 23] : [])].map(
                    (top, i) => (
                      <g key={i} aria-label={i ? 'TAB 셋잇단음표' : '오선 셋잇단음표'}>
                        <path
                          d={`M ${x1} ${top + 5} v -5 H ${(x1 + x2) / 2 - 8} M ${(x1 + x2) / 2 + 8} ${top} H ${x2} v 5`}
                          stroke="#385f4a"
                          fill="none"
                        />
                        <text
                          x={(x1 + x2) / 2}
                          y={top + 4}
                          textAnchor="middle"
                          fontSize="12"
                          fontStyle="italic"
                        >
                          3
                        </text>
                      </g>
                    ),
                  )}
                </g>
              );
            })}
            {connectedNotes.map((from) => {
              const connection = from.connection!;
              const to = score.notes.find((n) => n.id === connection.targetId);
              if (!to) return null;
              const located = bars.flatMap(({ fragments }, column) =>
                fragments.map((fragment) => ({
                  ...fragment,
                  x:
                    prefix +
                    layouts.slice(0, column).reduce((sum, layout) => sum + layout.width, 0) +
                    layouts[column].xAt(fragment.offset),
                })),
              );
              const a = located.find((f) => f.note.id === from.id && !f.continues);
              const b = located.find((f) => f.note.id === to.id && !f.continued);
              if (!a && !b) return null;
              const x1 = a ? a.x : prefix + 2;
              const x2 = b ? b.x : drawingWidth - 5;
              const fromTones = tabTones(from, tuning),
                toTones = tabTones(to, tuning);
              const staffPositions = [from, to].flatMap((note) =>
                noteTones(note).map((tone) => staffY(tone.pitch)),
              );
              const side = -scoreStemDirection(staffPositions) as -1 | 1;
              const staffEdge = (note: typeof from) =>
                side === -1
                  ? Math.min(...noteTones(note).map((t) => staffY(t.pitch)))
                  : Math.max(...noteTones(note).map((t) => staffY(t.pitch)));
              const staffFrom = staffEdge(from),
                staffTo = staffEdge(to);
              const surfaces = [
                {
                  key: 'staff',
                  y1: staffFrom,
                  y2: staffTo,
                  side,
                  inset1: noteTones(from).some((tone) => tone.ghost) ? 16 : 7,
                  inset2: noteTones(to).some((tone) => tone.ghost) ? 16 : 8,
                },
                ...(hasTab
                  ? fromTones.map((tone) => ({
                      key: `tab-${tone.string}`,
                      inset1:
                        scoreTabLabel(
                          tone.fret,
                          tone.dead,
                          !!tone.ghost || !!a?.continued || tieTargets.has(from.id),
                        ).halfWidth + 2,
                      inset2:
                        scoreTabLabel(
                          toTones[0]?.fret,
                          toTones[0]?.dead,
                          !!toTones[0]?.ghost || tieTargets.has(to.id),
                        ).halfWidth + 2,
                      side: ((tone.string ?? 1) > (tuning.length + 1) / 2 ? 1 : -1) as -1 | 1,
                      y1: tabTop + ((tone.string ?? 1) - 1) * 20,
                      y2:
                        tabTop +
                        ((toTones.find((t) => t.pitch === tone.pitch)?.string ??
                          toTones[0]?.string ??
                          1) -
                          1) *
                          20,
                    }))
                  : []),
              ];
              return (
                <g
                  key={`connection/${from.id}`}
                  aria-label={`${scoreConnectionLabels[connection.type]} 연결${!a || !b ? ' · 다음 줄로 이어짐' : ''}`}
                  pointerEvents="none"
                  fill="#385f4a"
                  stroke="none"
                >
                  {surfaces.map(({ key, y1, y2, side, inset1, inset2 }) => {
                    const arc = scoreConnectionArc(
                      [
                        { x: x1, y: a ? y1 : y2 },
                        { x: x2, y: b ? y2 : y1 },
                      ],
                      side,
                    );
                    return (
                      <g
                        key={key}
                        aria-label={key === 'staff' ? '오선 연결 곡선' : 'TAB 연결 곡선'}
                      >
                        {connection.type === 'glissando' ? (
                          x2 - (b ? inset2 : 0) > x1 + (a ? inset1 : 0) && (
                            <path
                              aria-label="지판 슬라이드 물결선"
                              fill="none"
                              stroke="#385f4a"
                              strokeWidth="1.5"
                              strokeLinecap="round"
                              d={scoreSlidePath(
                                x1 + (a ? inset1 : 0),
                                (a ? y1 : y2) +
                                  (key !== 'staff' ? Math.sign(to.pitch - from.pitch) * 5 : 0),
                                x2 - (b ? inset2 : 0),
                                (b ? y2 : y1) -
                                  (key !== 'staff' ? Math.sign(to.pitch - from.pitch) * 5 : 0),
                              )}
                            />
                          )
                        ) : (
                          <path d={arc.d} />
                        )}
                        {connection.type !== 'tie' && connection.type !== 'glissando' && (
                          <text
                            x={arc.labelX}
                            y={arc.labelY}
                            fill="#385f4a"
                            fontSize="10"
                            textAnchor="middle"
                            dominantBaseline="central"
                            paintOrder="stroke"
                            stroke="#fffefb"
                            strokeWidth="3"
                          >
                            {connection.type === 'hammer'
                              ? 'H'
                              : connection.type === 'pull'
                                ? 'P'
                                : 'S'}
                          </text>
                        )}
                      </g>
                    );
                  })}
                </g>
              );
            })}
            {bars.flatMap(({ fragments }, column) =>
              fragments.map((fragment, index) => {
                const { note, continues, continued } = fragment;
                if (!note.slideOut || note.rest || note.blank || continues) return null;
                const baseX =
                  prefix + layouts.slice(0, column).reduce((sum, layout) => sum + layout.width, 0);
                const x = baseX + layouts[column].xAt(fragment.offset);
                const next = fragments[index + 1];
                const end = Math.min(
                  x + 32,
                  next
                    ? baseX + layouts[column].xAt(next.offset) - 8
                    : baseX + layouts[column].width - 3,
                );
                const direction = note.slideOut === 'up' ? -1 : 1;
                const positions = [
                  {
                    y: staffY(note.pitch),
                    inset: noteTones(note).some((tone) => tone.ghost) ? 16 : 8,
                  },
                  ...(hasTab
                    ? tabTones(note, tuning).map((tone) => ({
                        y: tabTop + ((tone.string ?? 1) - 1) * 20,
                        inset:
                          scoreTabLabel(
                            tone.fret,
                            tone.dead,
                            !!tone.ghost || continued || tieTargets.has(note.id),
                          ).halfWidth + 2,
                      }))
                    : []),
                ];
                return (
                  <g
                    key={`slide-out/${note.id}`}
                    aria-label={`슬라이드 아웃 ${note.slideOut === 'up' ? '위로' : '아래로'}`}
                    pointerEvents="none"
                    fill="none"
                    stroke="#385f4a"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  >
                    {positions.map(
                      ({ y, inset }, index) =>
                        end > x + inset && (
                          <path
                            key={index}
                            d={scoreSlidePath(x + inset, y, end, y + direction * 14)}
                          />
                        ),
                    )}
                  </g>
                );
              }),
            )}
          </svg>
        );
      })}
    </div>
  );
}
