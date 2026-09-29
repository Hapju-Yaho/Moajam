import { useEffect, useRef, useState } from 'react';
import { scoreSystemLayouts, scoreBeamGroups, scoreBeatHitRegions } from '../lib/scoreLayout';
import {
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
  inputBeats,
  showTab,
  rangeIds,
  onRangeSelect,
  editable,
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
  onAppend: (string: number, beat: number) => void;
  onChordSelect: (beat: number) => void;
  emptyBeat: number;
  inputBeats: number;
  showTab: boolean;
  rangeIds: string[];
  onRangeSelect: (anchor: string, end: string) => void;
  editable: boolean;
}) {
  const systems = useRef<HTMLDivElement>(null);
  const drag = useRef<{ anchor: string; end: string; x: number; y: number; moved: boolean } | null>(
    null,
  );
  const suppressClick = useRef(false);
  const [systemWidth, setSystemWidth] = useState(800);
  useEffect(() => {
    if (!systems.current) return;
    const observer = new ResizeObserver(([entry]) =>
      setSystemWidth(Math.max(320, entry.contentRect.width)),
    );
    observer.observe(systems.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const active = cursor ?? selected;
    if (drag.current?.moved) return;
    const cell =
      playbackBeat !== null
        ? systems.current?.querySelector('[data-playback-active="true"]')
        : active
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
  }, [selected, cursor, emptyBeat, playbackBeat, score.systemLayout, systemWidth]);
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
    hasSelection && selected === null ? Math.floor(emptyBeat / 4) + 1 : 0,
  );
  while (measures.length < count) measures = [...measures, []];
  const staffY = (pitch: number) =>
    122 -
    (instrument.clef === 'bass8'
      ? staffPosition(pitch + 12) - staffPosition(43)
      : staffPosition(pitch + (instrument.clef === 'treble8' ? 12 : 0))) *
      5;
  return (
    <div
      ref={systems}
      className="score-systems"
      style={{ width: `${zoom}%`, minWidth: `${(640 * zoom) / 100}px` }}
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
            const used = fragments.reduce((sum, fragment) => sum + fragment.beats, 0);
            const emptyOffsets: number[] = [];
            for (let at = used; at < 4; at += Math.min(1, inputBeats)) emptyOffsets.push(at);
            const activeOffset = emptyBeat - bar * 4;
            if (
              hasSelection &&
              selected === null &&
              activeOffset >= used &&
              activeOffset < 4 &&
              !emptyOffsets.includes(activeOffset)
            )
              emptyOffsets.push(activeOffset);
            emptyOffsets.sort((a, b) => a - b);
            return { fragments, bar, emptyOffsets };
          });
        const prefix = 76;
        const layouts = scoreSystemLayouts(
          bars.map(({ fragments, bar }) => [
            ...fragments
              .filter(({ note }) => !note.blank)
              .map(({ offset, note }) => ({
                offset,
                space: Math.max(40, Math.min(10, note.lyric.length) * 7 + 10),
              })),
            ...Object.entries(chordPositions)
              .filter(([beat]) => Math.floor(Number(beat) / 4) === bar)
              .map(([beat, chord]) => ({
                offset: Number(beat) % 4,
                space: chord.length * 10 + 14,
              })),
          ]),
          systemWidth / (zoom / 100) - prefix - 1,
        );
        const drawingWidth = prefix + layouts.reduce((sum, layout) => sum + layout.width, 0) + 1;
        const positions = bars.flatMap(({ fragments }) =>
          fragments.flatMap(({ note }) => noteTones(note).map((tone) => staffY(tone.pitch))),
        );
        const top = Math.min(0, ...positions.map((y) => y - 48));
        const tabTop = Math.max(190, ...positions.map((y) => y + 55));
        const bottom = hasTab
          ? tabTop + (tuning.length - 1) * 20 + 45
          : Math.max(190, ...positions.map((y) => y + 55));
        return (
          <svg
            key={line}
            className="score-system"
            aria-label={`${system.start + 1}–${system.start + system.count}마디 악보 줄`}
            width={(drawingWidth * zoom) / 100}
            height={((bottom - top) * zoom) / 100}
            viewBox={`0 ${top} ${drawingWidth} ${bottom - top}`}
          >
            {line === 0 && (
              <text
                x="8"
                y={top + 32}
                fontSize="16"
                fontWeight="600"
                fill="#344b3e"
                aria-label={`악보 템포 ${score.bpm} BPM`}
              >
                ♩ = {score.bpm}
              </text>
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
              <text x="51" y="99" fontSize="18" fontWeight="700">
                4
              </text>
              <text x="51" y="119" fontSize="18" fontWeight="700">
                4
              </text>
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
              <text aria-label="줄 시작 TAB" x="9" y={tabTop + 28} fontSize="14" fontWeight="700">
                T
                <tspan x="9" dy="17">
                  A
                </tspan>
                <tspan x="9" dy="17">
                  B
                </tspan>
              </text>
            )}
            {bars.map(({ fragments, bar, emptyOffsets }, column) => {
              const { width, xAt } = layouts[column];
              const beams = scoreBeamGroups(fragments).map((indices) => ({
                indices,
                top: Math.min(
                  ...indices.flatMap((index) =>
                    noteTones(fragments[index].note).map(
                      (tone) =>
                        staffY(tone.pitch) -
                        29 -
                        Math.max(
                          0,
                          [1, 0.5, 0.25, 0.125].filter((limit) => fragments[index].beats < limit)
                            .length - 2,
                        ) *
                          5,
                    ),
                  ),
                ),
              }));
              const accidentals = new Map<number, boolean>();
              const marks = fragments.map(({ note }) =>
                noteTones(note).map((tone) => {
                  if (note.dead) return '';
                  const step = staffPosition(tone.pitch);
                  const sharp = pitchName(tone.pitch).includes('♯');
                  const previous = accidentals.get(step) ?? false;
                  accidentals.set(step, sharp);
                  return sharp ? '♯' : previous ? '♮' : '';
                }),
              );
              const hitRegions = scoreBeatHitRegions(
                [...fragments.map(({ offset }) => offset), ...emptyOffsets],
                width,
                xAt,
              );
              const staffHitTop = top + 42;
              const staffHitBottom = hasTab ? tabTop - 10 : bottom - 20;
              const playHere = playbackBeat !== null && Math.floor(playbackBeat / 4) === bar;
              const previewHere =
                hasSelection && playbackBeat === null && Math.floor(emptyBeat / 4) === bar;
              const previewX = xAt(emptyBeat % 4);
              const chordOffsets = [
                ...new Set([
                  0,
                  1,
                  2,
                  3,
                  ...Object.keys(chordPositions)
                    .map(Number)
                    .filter((beat) => Math.floor(beat / 4) === bar)
                    .map((beat) => beat % 4),
                ]),
              ].sort((a, b) => a - b);
              const chordHits = scoreBeatHitRegions(chordOffsets, width, xAt);
              return (
                <g
                  key={bar}
                  className="score-measure"
                  aria-label={`${bar + 1}마디`}
                  transform={`translate(${prefix + layouts.slice(0, column).reduce((sum, layout) => sum + layout.width, 0)}, 0)`}
                  data-playback-active={playHere ? 'true' : undefined}
                >
                  <text x="8" y={top + 18} fill="#82908c" fontSize="11">
                    {bar + 1}
                  </text>
                  {chordOffsets.map((offset) => {
                    const chord = chordPositions[bar * 4 + offset];
                    const hit = chordHits.get(offset)!;
                    return (
                      <g
                        key={`chord/${offset}`}
                        role="button"
                        tabIndex={0}
                        className="score-chord-slot"
                        aria-label={`${bar + 1}마디 ${offset + 1}박 코드 ${chord || '설정'}`}
                        onClick={() => onChordSelect(bar * 4 + offset)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            event.preventDefault();
                            onChordSelect(bar * 4 + offset);
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
                        <title>
                          {bar + 1}마디 {offset + 1}박 코드 편집
                        </title>
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
                    x1={width}
                    x2={width}
                    y1="82"
                    y2={hasTab ? tabTop + (tuning.length - 1) * 20 : 122}
                    stroke="#5f6c65"
                  />
                  {playHere && (
                    <line
                      x1={xAt(playbackBeat! % 4)}
                      x2={xAt(playbackBeat! % 4)}
                      y1="65"
                      y2={bottom - 18}
                      stroke="#52946d"
                      strokeWidth="2"
                    />
                  )}
                  {fragments.map(({ note, beats, offset, continued, continues }, index) => {
                    const beam = beams.find(({ indices }) => indices.includes(index));
                    const x = xAt(offset),
                      tones = tabTones(note, tuning);
                    const hit = hitRegions.get(offset)!;
                    const cursorWidth = Math.min(28, 2 * Math.min(x - hit.left, hit.right - x));

                    const chosen =
                      selected === note.id &&
                      emptyBeat >= bar * 4 + offset &&
                      emptyBeat < bar * 4 + offset + beats;
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
                                    .map((tone) => pitchName(tone.pitch))
                                    .join(' ')
                          } ${beats}박 길이${note.staccato && !note.rest ? ' 스타카토' : ''}${note.dead && !note.rest ? ' 고스트/뮤트 노트' : note.ghost && !note.rest ? ' 약하게' : ''}`}
                          aria-pressed={chosen || rangeIds.includes(note.id)}
                          onClick={() =>
                            chosen ? onDeselect() : onSelect(note.id, undefined, bar * 4 + offset)
                          }
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') {
                              event.preventDefault();
                              onSelect(note.id, undefined, bar * 4 + offset);
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
                              y="92"
                              width={cursorWidth}
                              height="20"
                              fill="none"
                              stroke="#c77830"
                            />
                          )}
                          {note.blank ? null : note.rest ? (
                            <g>
                              <text x={x - 9} y="116" fontSize="29">
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
                                <circle cx={x + 13} cy="103" r="2" fill="#293e34" />
                              )}
                            </g>
                          ) : (
                            noteTones(note).map((tone, toneIndex) => {
                              const y = staffY(tone.pitch),
                                ledgers: number[] = [];
                              const flags = [1, 0.5, 0.25, 0.125].filter(
                                (limit) => beats < limit,
                              ).length;
                              const stemHeight = 29 + Math.max(0, flags - 2) * 5;
                              for (let line = 132; line <= y; line += 10) ledgers.push(line);
                              for (let line = 72; line >= y; line -= 10) ledgers.push(line);
                              return (
                                <g key={toneIndex}>
                                  {ledgers.map((line) => (
                                    <line
                                      key={line}
                                      x1={x - 12}
                                      x2={x + 12}
                                      y1={line}
                                      y2={line}
                                      stroke="#536159"
                                    />
                                  ))}
                                  {marks[index][toneIndex] && (
                                    <text x={x - 22} y={y + 5} fontSize="17">
                                      {marks[index][toneIndex]}
                                    </text>
                                  )}
                                  {note.dead ? (
                                    <path
                                      aria-label="뮤트 X 음표"
                                      d={`M${x - 5} ${y - 5}l10 10m-10 0l10 -10`}
                                      stroke="#293e34"
                                      strokeWidth="1.8"
                                      fill="none"
                                    />
                                  ) : (
                                    <ellipse
                                      cx={x}
                                      cy={y}
                                      rx="6.5"
                                      ry="4.2"
                                      transform={`rotate(-18 ${x} ${y})`}
                                      fill={beats >= 2 ? '#fffefb' : '#293e34'}
                                      stroke="#293e34"
                                      strokeWidth="1.4"
                                    />
                                  )}
                                  {beats < 4 && (
                                    <line
                                      x1={x + 6}
                                      x2={x + 6}
                                      y1={y}
                                      y2={beam?.top ?? y - stemHeight}
                                      stroke="#293e34"
                                      strokeWidth="1.4"
                                    />
                                  )}
                                  {Array.from({ length: beam ? 0 : flags }, (_, flag) => (
                                    <path
                                      key={flag}
                                      d={`M${x + 6} ${y - stemHeight + flag * 7}q15 9 7 18`}
                                      fill="none"
                                      stroke="#293e34"
                                      strokeWidth="2"
                                    />
                                  ))}
                                  {DOTTED_SCORE_BEATS.includes(beats) && (
                                    <circle cx={x + 15} cy={y - 2} r="2" fill="#293e34" />
                                  )}
                                  {note.ghost && !note.dead && (
                                    <g aria-label="약하게 연주 괄호" fill="#65786c">
                                      <text x={x - 14} y={y + 5} fontSize="17">
                                        (
                                      </text>
                                      <text x={x + 9} y={y + 5} fontSize="17">
                                        )
                                      </text>
                                    </g>
                                  )}
                                  {note.staccato && !continued && toneIndex === 0 && (
                                    <circle
                                      aria-label="스타카토 표시"
                                      cx={x}
                                      cy={
                                        Math.max(...noteTones(note).map((t) => staffY(t.pitch))) +
                                        15
                                      }
                                      r="2.3"
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
                            return (
                              <g
                                key={row}
                                role="button"
                                className="score-position-cell"
                                tabIndex={0}
                                aria-label={`${bar + 1}마디 ${offset + 1}박 ${row + 1}번 줄 ${tone ? `${note.dead ? 'X 고스트/뮤트 노트' : `${tone.fret}프렛`}${note.ghost && !note.dead ? ' 약하게' : ''}${note.staccato ? ' 스타카토' : ''}` : note.blank ? '빈 박' : note.rest ? '쉼표' : '빈 줄'}`}
                                aria-pressed={
                                  (chosen && selectedString === row + 1) ||
                                  rangeIds.includes(note.id)
                                }
                                onClick={() =>
                                  chosen && selectedString === row + 1
                                    ? onDeselect()
                                    : onSelect(note.id, row + 1, bar * 4 + offset)
                                }
                                onKeyDown={(event) => {
                                  if (event.key === 'Enter') {
                                    event.preventDefault();
                                    onSelect(note.id, row + 1, bar * 4 + offset);
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
                                    chosen && selectedString === row + 1 ? '#fff2df' : 'transparent'
                                  }
                                  stroke={chosen && selectedString === row + 1 ? '#c77830' : 'none'}
                                />
                                {tone && (
                                  <>
                                    <rect
                                      x={
                                        x -
                                        (note.ghost || continued || tieTargets.has(note.id)
                                          ? 15
                                          : 9)
                                      }
                                      y={tabTop + row * 20 - 8}
                                      width={
                                        note.ghost || continued || tieTargets.has(note.id) ? 30 : 18
                                      }
                                      height="16"
                                      fill={
                                        chosen && selectedString === row + 1 ? '#fff2df' : '#fffefb'
                                      }
                                    />
                                    <text
                                      x={x}
                                      y={tabTop + row * 20 + 5}
                                      textAnchor="middle"
                                      fontSize="14"
                                      fontWeight="600"
                                    >
                                      {note.dead
                                        ? 'X'
                                        : continued || note.ghost || tieTargets.has(note.id)
                                          ? `(${tone.fret})`
                                          : tone.fret}
                                    </text>
                                  </>
                                )}
                                {tone && note.staccato && !continued && (
                                  <circle
                                    cx={x}
                                    cy={tabTop + row * 20 + 8}
                                    r="1.6"
                                    fill="#293e34"
                                  />
                                )}
                                {note.rest && !note.blank && row === 0 && (
                                  <text x={x} y={tabTop + 5} textAnchor="middle" fontSize="16">
                                    𝄽
                                  </text>
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
                  })}
                  {beams.map(({ indices, top }, groupIndex) => (
                    <g
                      key={`beams/${groupIndex}`}
                      aria-label="박 단위 음표 묶음"
                      pointerEvents="none"
                      stroke="#293e34"
                      strokeWidth="3"
                    >
                      {[0, 1, 2, 3].flatMap((level) =>
                        indices.flatMap((index, position) => {
                          const flags = [1, 0.5, 0.25, 0.125].filter(
                            (limit) => fragments[index].beats < limit,
                          ).length;
                          if (flags <= level) return [];
                          const next = indices[position + 1],
                            previous = indices[position - 1];
                          const hasNext =
                            next !== undefined &&
                            fragments[next].beats < [1, 0.5, 0.25, 0.125][level];
                          const hasPrevious =
                            previous !== undefined &&
                            fragments[previous].beats < [1, 0.5, 0.25, 0.125][level];
                          if (!hasNext && hasPrevious) return [];
                          const x = xAt(fragments[index].offset) + 6;
                          return [
                            <line
                              key={`${level}/${index}`}
                              x1={x}
                              x2={
                                hasNext
                                  ? xAt(fragments[next].offset) + 6
                                  : x + (position === indices.length - 1 ? -8 : 8)
                              }
                              y1={top + level * 7}
                              y2={top + level * 7}
                            />,
                          ];
                        }),
                      )}
                    </g>
                  ))}
                  {emptyOffsets.map((offset) => {
                    const active =
                      hasSelection && selected === null && emptyBeat === bar * 4 + offset;
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
                              active ? onDeselect() : onAppend(selectedString, bar * 4 + offset)
                            }
                            onKeyDown={(event) => {
                              if (event.key === 'Enter') {
                                event.preventDefault();
                                onAppend(selectedString, bar * 4 + offset);
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
                                focused ? onDeselect() : onAppend(row + 1, bar * 4 + offset)
                              }
                              onKeyDown={(event) => {
                                if (event.key === 'Enter') {
                                  event.preventDefault();
                                  onAppend(row + 1, bar * 4 + offset);
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
                          xAt(Math.min(4, (emptyBeat % 4) + inputBeats)) - previewX,
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
              const x1 = a ? a.x + 10 : prefix + 2;
              const x2 = b ? b.x - 10 : drawingWidth - 5;
              const fromTones = tabTones(from, tuning),
                toTones = tabTones(to, tuning);
              const staffFrom = Math.max(...noteTones(from).map((t) => staffY(t.pitch))) + 9;
              const staffTo = Math.max(...noteTones(to).map((t) => staffY(t.pitch))) + 9;
              const surfaces = [
                { key: 'staff', y1: staffFrom, y2: staffTo },
                ...(hasTab
                  ? fromTones.map((tone) => ({
                      key: `tab-${tone.string}`,
                      y1: tabTop + ((tone.string ?? 1) - 1) * 20 + 7,
                      y2:
                        tabTop +
                        ((toTones.find((t) => t.pitch === tone.pitch)?.string ??
                          toTones[0]?.string ??
                          1) -
                          1) *
                          20 +
                        7,
                    }))
                  : []),
              ];
              return (
                <g
                  key={`connection/${from.id}`}
                  aria-label={`${scoreConnectionLabels[connection.type]} 연결${!a || !b ? ' · 다음 줄로 이어짐' : ''}`}
                  pointerEvents="none"
                  fill="none"
                  stroke="#385f4a"
                  strokeWidth="1.5"
                >
                  {surfaces.map(({ key, y1, y2 }) => (
                    <g key={key}>
                      {connection.type === 'slide' ? (
                        <path
                          d={`M ${x1} ${y1 + (from.pitch < to.pitch ? 0 : -10)} L ${x2} ${y2 + (from.pitch < to.pitch ? -10 : 0)}`}
                        />
                      ) : (
                        <path
                          d={`M ${x1} ${y1} C ${x1 + (x2 - x1) / 3} ${Math.max(y1, y2) + 14}, ${x2 - (x2 - x1) / 3} ${Math.max(y1, y2) + 14}, ${x2} ${y2}`}
                        />
                      )}
                      {(connection.type === 'hammer' || connection.type === 'pull') && (
                        <text
                          x={(x1 + x2) / 2}
                          y={Math.max(y1, y2) + 21}
                          fill="#385f4a"
                          stroke="none"
                          fontSize="10"
                          textAnchor="middle"
                        >
                          {connection.type === 'hammer' ? 'H' : 'P'}
                        </text>
                      )}
                    </g>
                  ))}
                </g>
              );
            })}
          </svg>
        );
      })}
    </div>
  );
}
