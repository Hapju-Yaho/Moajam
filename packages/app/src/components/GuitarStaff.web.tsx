import { scoreBeatSelectionGroups, scoreNotesInBeatRange } from '../lib/scoreSelection';
import { drumStemLength } from '../lib/drumStroke';
import { GuitarTechniqueMarks } from './GuitarTechniqueMarks.web';
import { drumMeasureComplete } from '../lib/scoreDrumEntry';
import { spellScoreTone, type ScoreTone } from '../lib/score';

function KeyboardInputPreview({ x, y, beats }: { x: number; y: number; beats: number }) {
  const ledgers: number[] = [];
  for (let line = 132; line <= y; line += 10) ledgers.push(line);
  for (let line = 72; line >= y; line -= 10) ledgers.push(line);
  return (
    <g data-keyboard-preview="true" aria-hidden="true" opacity="0.5" pointerEvents="none">
      {ledgers.map((line) => (
        <line key={line} x1={x - 9} x2={x + 9} y1={line} y2={line} stroke="#344b3e" />
      ))}
      <ellipse
        cx={x}
        cy={y}
        rx="6"
        ry="4"
        transform={`rotate(-18 ${x} ${y})`}
        fill={beats >= 2 ? '#fffcf4' : '#344b3e'}
        stroke="#344b3e"
        strokeWidth="1.3"
      />
      {beats < 4 && (
        <line x1={x + 5} x2={x + 5} y1={y} y2={y - 30} stroke="#344b3e" strokeWidth="1.3" />
      )}
      {beats < 1 && <path d={`M${x + 5} ${y - 30}q13 8 4 17q4-9-4-10`} fill="#344b3e" />}
    </g>
  );
}
import { scoreChordHeadOffsets, scoreAccidentalColumns } from '../lib/scoreLayout';
import { guitarToneLabels } from '../lib/scoreGuitar';
import { ScoreStrumMark } from './ScoreStrumMark.web';
import { RhythmSlash } from './RhythmSlash.web';
import { TabRhythm } from './TabRhythm.web';
import { NoteFlags } from './NoteFlags.web';
import { ScoreSystemViewport } from './ScoreSystemViewport.web';
import {
  useScorePlaybackDisplay,
  type ScorePlaybackPosition,
} from '../lib/scorePlaybackDisplay.web';
import { ScoreDirectionMarks } from './ScoreDirectionMarks.web';
import { directionOwner, directionWords, navigationWords } from '../lib/scoreExpression';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal, flushSync } from 'react-dom';
import { ScoreRhythmFeel } from './ScoreRhythmFeel.web';
import { DrumNotehead } from './DrumNotehead.web';
import { GraceNote } from './GraceNote.web';
import { GraceSlide } from './GraceSlide.web';
import { DrumInputPreview, type DrumInputNote } from './DrumInputPreview.web';
import { DrumRest } from './DrumRest.web';
import { drumRestGroups } from '../lib/drumNotation';
import { scoreRestSystems, scoreMeasureRestBars } from '../lib/scoreMeasureRests';
import { scorePartStaves, scorePartOwner } from '../lib/scoreParts';
import { drumAtRow, drumForPitch, drumLabel, scoreDrums } from '../lib/scoreDrums';
import {
  scoreSystemLayouts,
  scoreBeamGroups,
  scoreBeatHitRegions,
  scoreStemDirection,
  scoreConnectionArc,
  scoreConnectionSide,
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
  drumNotation,
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
  scoreHammerPullGroups,
  scoreHammerPullLabel,
  scoreAccidentalMarks,
  type Score,
  type ScoreFragment,
} from '../lib/score';

const GRACE_SPACING = 16;

function graceOffset(
  fragments: ScoreFragment[],
  fragment: ScoreFragment,
  tuning: readonly number[],
  fifths: number | undefined,
  hasTab: boolean,
  renderStaff = true,
) {
  if (fragment.note.graceBeats === undefined) return 0;
  const group = fragments.filter(
    (f) => f.offset === fragment.offset && f.note.graceBeats !== undefined,
  );
  const remaining = group.length - group.findIndex((f) => f.note.id === fragment.note.id);
  const destination = fragments.find(
    (f) => f.offset === fragment.offset && f.note.graceBeats === undefined,
  )?.note;
  const marks = renderStaff ? scoreAccidentalMarks(fragments, fifths) : [];
  const extra = Math.max(
    0,
    ...(hasTab && destination
      ? tabTones(destination, tuning).map(
          (t) => scoreTabLabel(t.fret, t.dead, t.ghost, t.harmonic === 'natural').halfWidth - 8.5,
        )
      : []),
    ...(destination
      ? (marks[fragments.findIndex((f) => f.note.id === destination.id)] ?? []).map((mark) =>
          mark ? 5 : 0,
        )
      : []),
  );
  return remaining * GRACE_SPACING + extra;
}

export function GuitarStaff({
  score,
  part,
  selected,
  hasSelection,
  onDeselect,
  selectedString,
  cursor,
  playbackBeat,
  playbackPosition,
  zoom,
  onSelect: selectNote,
  onPartSelect,
  onAppend,
  onChordSelect,
  emptyBeat,
  emptyMeasure,
  inputBeats,
  inputPitch,
  inputPreview = false,
  showBeatMarkers = false,
  inputDrumNote,
  showTab,
  tabOnly = false,
  rangeIds,
  onRangeSelect,
  onBoxSelect,
  editable,
  onMeasureContextMenu,
  onDeleteMeasureRest,
  layoutWidth,
  systemOverride,
  alignedParts,
  showTempo = true,
  activeVoice,
  otherVoiceOpacity = 0.3,
}: {
  score: Score;
  part: string;
  selected: string | null;
  hasSelection: boolean;
  onDeselect: () => void;
  selectedString: number;
  cursor: string | null;
  playbackBeat: number | null;
  playbackPosition?: ScorePlaybackPosition;
  zoom: number;
  onSelect: (id: string, string?: number, beat?: number, inputPitch?: number) => void;
  onPartSelect?: (
    part: string,
    note?: string,
    position?: { beat: number; bar?: number; pitch?: number },
  ) => void;
  onAppend: (string: number, beat: number, bar?: number, inputPitch?: number) => void;
  onChordSelect: (beat: number) => void;
  emptyBeat: number;
  emptyMeasure?: number;
  inputBeats: number;
  inputPitch?: number;
  inputPreview?: boolean;
  showBeatMarkers?: boolean;
  inputDrumNote?: DrumInputNote;
  showTab: boolean;
  tabOnly?: boolean;
  rangeIds: string[];
  onRangeSelect: (anchor: string, end: string) => void;
  onBoxSelect?: (ids: string[]) => void;
  editable: boolean;
  onMeasureContextMenu?: (measure: number, x: number, y: number) => void;
  onDeleteMeasureRest?: (bar: number) => void;
  layoutWidth?: number;
  systemOverride?: { start: number; count: number; units?: { bar: number; span: number }[] }[];
  alignedParts?: string[];
  showTempo?: boolean;
  activeVoice?: string;
  otherVoiceOpacity?: number;
}) {
  const systems = useRef<HTMLDivElement>(null);
  const drag = useRef<{
    anchor: string;
    end: string;
    x: number;
    y: number;
    moved: boolean;
    beat?: number;
  } | null>(null);
  const suppressClick = useRef(false);
  const [selectionBox, setSelectionBox] = useState<
    { left: number; top: number; width: number; height: number }[] | null
  >(null);
  const [measuredWidth, setSystemWidth] = useState(800);
  const [printing, setPrinting] = useState(false);
  useEffect(() => {
    const before = () => flushSync(() => setPrinting(true)),
      after = () => setPrinting(false);
    window.addEventListener('beforeprint', before);
    window.addEventListener('afterprint', after);
    return () => {
      window.removeEventListener('beforeprint', before);
      window.removeEventListener('afterprint', after);
    };
  }, []);
  const systemWidth = layoutWidth ?? measuredWidth;
  // A score snapshot is immutable. Cursor/hover changes can reuse its fragments;
  // edits build a new snapshot, so duration, pitch and grace changes stay fresh.
  const indexed = useMemo(() => {
    const measures = new Map<string, ScoreFragment[][] | Error>();
    const notes = new Map(score.notes.map((note) => [note.id, note]));
    const partNotes = new Map(
      score.parts.map((name) => [name, score.notes.filter((note) => note.part === name)]),
    );
    const chords = new Map(score.parts.map((name) => [name, scoreChordPositions(score, name)]));
    for (const name of score.parts) {
      try {
        measures.set(name, scoreMeasures(score, name));
      } catch (error) {
        measures.set(name, error instanceof Error ? error : new Error(String(error)));
      }
    }
    return { measures, notes, partNotes, chords };
  }, [score]);
  useScorePlaybackDisplay(systems, playbackPosition, playbackBeat);
  const measuresFor = (name: string) => {
    const result = indexed.measures.get(name);
    if (result instanceof Error) throw result;
    return result ?? [];
  };
  const selectedBar = emptyMeasure ?? scoreMeasureAtBeat(score, part, emptyBeat).bar;
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
  const isDrums = instrument.id === 'drums';
  const drumPair = Object.entries(score.drumVoices ?? {}).find(
    ([upper, lower]) => upper === part || lower === part,
  );
  const peerPart = drumPair?.find((name) => name !== part);
  const measureRestBars = scoreMeasureRestBars(score, part);
  const restParts = scorePartStaves(score, part);
  const voiceOpacity = (voice: string) =>
    activeVoice && drumPair?.includes(activeVoice) && voice !== activeVoice
      ? Math.max(0, Math.min(1, otherVoiceOpacity))
      : 1;
  const peerMeasures = peerPart ? measuresFor(peerPart) : [];
  const compactRests =
    !systemOverride && (!alignedParts || alignedParts.every((name) => restParts.includes(name)));
  if (drumPair && !alignedParts) alignedParts = drumPair;
  const onSelect = (id: string, row?: number, beat?: number, inputPitch?: number) => {
    const owner = indexed.notes.get(id)?.part;
    if (owner && owner !== part)
      onPartSelect?.(owner, id, beat === undefined ? undefined : { beat, pitch: inputPitch });
    else selectNote(id, row, beat, inputPitch);
  };
  const tuning = instrument.tuning;
  const hasTab = showTab && tuning.length > 0;
  const renderStaff = !(tabOnly && hasTab);
  const tabSpacing = renderStaff ? 20 : 16;
  const chordPositions = indexed.chords.get(part) ?? {};
  const connectedNotes = score.notes.filter(
    (n) =>
      n.part === part &&
      n.connection &&
      !['hammer', 'pull'].includes(n.connection.type) &&
      n.graceBeats === undefined,
  );
  const connectionSpans = [
    ...score.notes
      .filter((note) => note.part === part && note.slurTo)
      .map((from) => ({ from, targetId: from.slurTo!, label: undefined as string | undefined })),
    ...scoreHammerPullGroups(indexed.partNotes.get(part) ?? []).map((notes) => ({
      from: notes[0],
      targetId: notes.at(-1)!.id,
      label: scoreHammerPullLabel(notes) as string | undefined,
    })),
  ];
  const tieTargets = new Set(
    connectedNotes.filter((n) => n.connection?.type === 'tie').map((n) => n.connection!.targetId),
  );
  let measures;
  try {
    measures = measuresFor(part);
  } catch (error) {
    return (
      <div role="alert">{error instanceof Error ? error.message : '악보를 표시하지 못했어요.'}</div>
    );
  }
  const count = Math.max(
    1,
    scoreMeasureCount(score, part),
    ...(alignedParts ?? []).map((name) => scoreMeasureCount(score, name)),
    hasSelection && selected === null ? selectedBar + 1 : 0,
  );
  while (measures.length < count) measures = [...measures, []];
  const notationSystems = compactRests
    ? scoreRestSystems(
        score,
        restParts,
        count,
        hasSelection && playbackBeat === null ? selectedBar : undefined,
      )
    : (systemOverride ?? scoreSystemRows(score, drumPair?.[0] ?? part, count)).map((system) => ({
        ...system,
        units:
          ('units' in system ? system.units : undefined) ??
          Array.from({ length: system.count }, (_, i) => ({ bar: system.start + i, span: 1 })),
      }));
  const staffY = (pitch: number, naturalPitch?: number) => {
    if (isDrums) return drumForPitch(pitch)?.y ?? 102;
    const shift = instrument.clef === 'bass8' || instrument.clef === 'treble8' ? 12 : 0;
    const position = spellScoreTone(
      {
        pitch: pitch + shift,
        naturalPitch: naturalPitch === undefined ? undefined : naturalPitch + shift,
      },
      score.keySignature,
    ).position;
    return (
      122 -
      (position -
        (instrument.clef === 'bass8' || instrument.clef === 'bass' ? staffPosition(43) : 0)) *
        5
    );
  };
  const toneY = (tone: ScoreTone) => staffY(tone.pitch, tone.naturalPitch);
  const inputY = (pitch: number) =>
    staffY(
      pitch,
      instrument.id === 'piano' || score.keyboardStaves?.[scorePartOwner(score, part)]
        ? pitch
        : undefined,
    );
  const chordPadding = (note: ScoreFragment['note']) => {
    const strumWidth = noteTones(note).some((t) => t.strum) ? 18 : 0;
    if (!renderStaff || isDrums) return strumWidth;
    const ys = noteTones(note).map(toneY);
    const columns = scoreAccidentalColumns(
      ys,
      ys.map(() => '♯'),
    );
    return strumWidth + Math.max(0, ...columns) + Math.max(0, ...scoreChordHeadOffsets(ys, -1));
  };
  const clickPitch = (element: SVGGraphicsElement, clientX: number, clientY: number) => {
    const matrix = element.getScreenCTM();
    if (!matrix) return inputPitch ?? 60;
    const point = new DOMPoint(clientX, clientY).matrixTransform(matrix.inverse());
    if (isDrums)
      return scoreDrums.reduce(
        (best, drum) =>
          Math.abs(drum.y - point.y) < Math.abs((drumForPitch(best)?.y ?? 102) - point.y)
            ? drum.pitch
            : best,
        scoreDrums[0].pitch,
      );
    const naturals = Array.from({ length: 128 }, (_, pitch) => pitch).filter((pitch) =>
      [0, 2, 4, 5, 7, 9, 11].includes(pitch % 12),
    );
    return naturals.reduce(
      (nearest, pitch) =>
        Math.abs(inputY(pitch) - point.y) < Math.abs(inputY(nearest) - point.y) ? pitch : nearest,
      naturals[0],
    );
  };
  const dragMarkers = () => [
    ...(systems.current?.querySelectorAll<SVGGraphicsElement>('[data-selection-position]') ?? []),
  ];
  const nearestDragBeat = (x: number, y: number) => {
    let best = Infinity,
      beat: number | undefined;
    for (const marker of dragMarkers()) {
      const box = marker.getBoundingClientRect(),
        row = marker.closest('svg')!.getBoundingClientRect();
      const dy = Math.max(row.top - y, 0, y - row.bottom),
        distance = dy * 100000 + Math.abs((box.left + box.right) / 2 - x);
      if (distance < best) {
        best = distance;
        beat = Number(marker.getAttribute('data-selection-position'));
      }
    }
    return beat;
  };
  return (
    <div
      ref={systems}
      className="score-systems"
      style={{
        userSelect: editable ? 'none' : undefined,
        gap: ((score.systemGap ?? 14) * zoom) / 100,
        opacity:
          score.keyboardStaves?.[scorePartOwner(score, part)] &&
          activeVoice &&
          scorePartOwner(score, activeVoice) === scorePartOwner(score, part) &&
          part !== activeVoice
            ? otherVoiceOpacity
            : undefined,
      }}
      data-layout-width={systemWidth / (zoom / 100)}
      aria-label={`${part} ${renderStaff ? `오선보${hasTab ? '와 TAB' : ''}` : 'TAB'}`}
      onDragStart={(event) => event.preventDefault()}
      onPointerDownCapture={(event) => {
        suppressClick.current = false;
        if (!editable || event.button !== 0 || event.pointerType === 'touch') return;
        event.preventDefault();
        const id = (event.target as Element)
          .closest('[data-score-note]')
          ?.getAttribute('data-score-note');
        if (id && ![...(drumPair ?? [part])].includes(indexed.notes.get(id)?.part ?? '')) return;
        drag.current = {
          anchor: id ?? '',
          end: id ?? '',
          x: event.clientX,
          y: event.clientY,
          moved: false,
          beat: nearestDragBeat(event.clientX, event.clientY),
        };
      }}
      onPointerMoveCapture={(event) => {
        const current = drag.current;
        if (event.buttons !== 1) {
          setSelectionBox(null);
          drag.current = null;
          return;
        }
        if (!current || !editable) return;
        if (!current.moved && Math.hypot(event.clientX - current.x, event.clientY - current.y) < 5)
          return;
        if (!current.moved) event.currentTarget.setPointerCapture(event.pointerId);
        const end = nearestDragBeat(event.clientX, event.clientY);
        const start = current.beat;
        if (start === undefined || end === undefined) return;
        const first = Math.min(start, end),
          last = Math.max(start, end);
        onBoxSelect?.(scoreNotesInBeatRange(score, drumPair ?? [part], first, last));
        const rows = new Map<SVGSVGElement, SVGGraphicsElement[]>();
        for (const marker of dragMarkers()) {
          const svg = marker.closest('svg')!;
          const list = rows.get(svg) ?? [];
          list.push(marker);
          rows.set(svg, list);
        }
        const boxes: { left: number; top: number; width: number; height: number }[] = [];
        for (const [svg, markers] of rows) {
          const positions = markers.map((m) => ({
            beat: Number(m.getAttribute('data-selection-position')),
            rect: m.getBoundingClientRect(),
          }));
          const low = Math.min(...positions.map((p) => p.beat)),
            high = Math.max(...positions.map((p) => p.beat));
          if (last < low || first > high) continue;
          const included = positions.filter((p) => p.beat >= first - 1e-7 && p.beat <= last + 1e-7);
          if (!included.length) continue;
          const row = svg.getBoundingClientRect();
          const left =
            first <= low
              ? Math.min(...positions.map((p) => p.rect.left)) - 8
              : Math.min(...included.map((p) => p.rect.left)) - 8;
          const right =
            last >= high ? row.right : Math.max(...included.map((p) => p.rect.right)) + 8;
          const top = Math.min(...positions.map((p) => p.rect.top)),
            bottom = Math.max(...positions.map((p) => p.rect.bottom));
          boxes.push({ left, top, width: right - left, height: bottom - top });
        }
        setSelectionBox(boxes);
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
        setSelectionBox(null);
        if (event.currentTarget.hasPointerCapture(event.pointerId))
          event.currentTarget.releasePointerCapture(event.pointerId);
      }}
      onPointerCancel={() => {
        setSelectionBox(null);
        drag.current = null;
        suppressClick.current = false;
      }}
      onLostPointerCapture={() => {
        setSelectionBox(null);
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
      onClick={(event) => {
        if (
          editable &&
          event.target instanceof Element &&
          !event.target.closest('[role="button"], button, input, select, textarea, a')
        )
          onDeselect();
      }}
    >
      {selectionBox &&
        createPortal(
          <>
            {selectionBox.map((box, index) => (
              <div
                key={index}
                aria-hidden="true"
                data-score-selection-box="true"
                style={{
                  position: 'fixed',
                  ...box,
                  border: '1px solid #397dd9',
                  background: '#397dd912',
                  pointerEvents: 'none',
                  zIndex: 2147483000,
                  boxSizing: 'border-box',
                }}
              />
            ))}
          </>,
          document.body,
        )}

      {notationSystems.map((system, line) => {
        const bars = system.units.map(({ bar, span }) => {
          let fragments = measures[bar] ?? [];
          const barStart = scoreMeasureStart(score, part, bar);
          const barBeats = scoreMeasureDuration(score, part, bar);
          const used = fragments.reduce((sum, fragment) => scoreBeat(sum + fragment.beats), 0);
          const firstBlank = fragments.find((fragment) => fragment.note.blank);
          const entryOffset = firstBlank?.offset ?? used;
          const displayBeats = Math.max(
            barBeats,
            scoreBarBeats(score),
            ...(alignedParts ?? []).map((name) => scoreMeasureDuration(score, name, bar)),
          );
          const activeBar = hasSelection && playbackBeat === null && selectedBar === bar;
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
              !fragment.note.blank ||
              (editable &&
                ((entryActive && fragment === firstBlank) ||
                  (activeBar && fragment.note.id === selected))),
          );
          if (peerPart)
            fragments = [
              ...fragments,
              ...(peerMeasures[bar] ?? []).filter(({ note }) => !note.blank),
            ].sort((a, b) => a.offset - b.offset);
          return { fragments, bar, span, emptyOffsets, barStart, barBeats, displayBeats };
        });
        const keySpacing = 6;
        const keyWidth =
          !renderStaff || isDrums ? 0 : Math.abs(score.keySignature ?? 0) * keySpacing;
        const meter = scoreTimeSignature(score);
        const meterExtra =
          Math.max(String(meter.beats).length, String(meter.beatType).length) > 1 ? 8 : 0;
        const prefix = (isDrums && !alignedParts ? 42 : keyWidth ? 61 : 58) + keyWidth + meterExtra;
        const timeSignatureX = isDrums ? 35 : (keyWidth ? 54 : 51) + keyWidth;
        const layouts = scoreSystemLayouts(
          alignedParts
            ? bars.map(({ bar, displayBeats }) =>
                alignedParts.flatMap((name) => {
                  const duration = displayBeats;
                  const start = scoreMeasureStart(score, name, bar);
                  return [
                    ...(measuresFor(name)[bar] ?? [])
                      .filter(({ note }) => !note.blank)
                      .map(({ offset, note }) => ({
                        offset: (offset * 4) / duration,
                        leading:
                          chordPadding(note) +
                          (note.graceSlide ? 30 : 0) +
                          (note.slideIn ? 32 : 0) +
                          measuresFor(note.part)[bar]!.filter(
                            (f) => f.offset === offset && f.note.graceBeats !== undefined,
                          ).length *
                            GRACE_SPACING,
                        space:
                          Math.max(44, note.lyric.length * 7 + 10) + (note.graceSlide ? 34 : 0),
                        minSpace: noteTones(note).some((t) => t.drumTechnique === 'drag')
                          ? 62
                          : noteTones(note).some((t) => t.drumTechnique === 'flam')
                            ? 50
                            : 34,
                      })),
                    ...Object.entries(indexed.chords.get(name) ?? {})
                      .filter(([beat]) => Number(beat) >= start && Number(beat) < start + duration)
                      .map(([beat, chord]) => ({
                        offset: ((Number(beat) - start) * 4) / duration,
                        space: chord.length * 10 + 14,
                        minSpace: chord.length * 8 + 10,
                      })),
                  ];
                }),
              )
            : bars.map(({ fragments, bar, barStart, barBeats }) => {
                const notation = fragments.filter(({ note }) => !note.blank);
                const marks = renderStaff ? scoreAccidentalMarks(notation, score.keySignature) : [];
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
                              tone.harmonic === 'natural',
                            ).halfWidth,
                        ),
                      )
                    : 0,
                );
                return [
                  ...notation.map(({ offset, note, beats }, index) => ({
                    offset,
                    leading:
                      chordPadding(note) +
                      (note.graceSlide ? 30 : 0) +
                      (note.slideIn ? 32 : 0) +
                      measuresFor(note.part)[bar]!.filter(
                        (f) => f.offset === offset && f.note.graceBeats !== undefined,
                      ).length *
                        GRACE_SPACING,
                    space:
                      Math.max(40, Math.min(10, note.lyric.length) * 7 + 10) +
                      (note.graceSlide ? 34 : 0),
                    minSpace: Math.max(
                      18 +
                        (note.graceSlide ? 34 : 0) +
                        (noteTones(note).some((t) => t.drumTechnique === 'drag')
                          ? 30
                          : noteTones(note).some((t) => t.drumTechnique === 'flam')
                            ? 18
                            : 0) +
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
                    .filter(
                      ([beat]) => Number(beat) >= barStart && Number(beat) < barStart + barBeats,
                    )
                    .map(([beat, chord]) => ({
                      offset: Number(beat) - barStart,
                      space: chord.length * 10 + 14,
                    })),
                ];
              }),
          systemWidth / (zoom / 100) - prefix - 1,
          alignedParts ? false : score.equalWidthRows?.[part]?.includes(line),
          bars.map(
            ({ bar, span }) =>
              (score.measureWidths?.[alignedParts?.[0] ?? part]?.[bar] ?? 100) * span,
          ),
          bars.map(({ displayBeats }) => (alignedParts ? 4 : displayBeats)),
        ).map((layout, index) =>
          alignedParts
            ? {
                ...layout,
                xAt: (offset: number) => layout.xAt((offset * 4) / bars[index].displayBeats),
              }
            : layout,
        );
        const drawingWidth = prefix + layouts.reduce((sum, layout) => sum + layout.width, 0) + 1;
        const positions = !renderStaff
          ? []
          : bars.flatMap(({ fragments }) =>
              fragments.flatMap(({ note }) => [
                ...noteTones(note).map((tone) => toneY(tone)),
                ...(note.graceSlide ? [staffY(note.graceSlide.pitch)] : []),
              ]),
            );
        const barBeams = bars.map(({ fragments }) => {
          if (!renderStaff) return [];
          const beamGroups = drumPair
            ? drumPair.flatMap((voice) => {
                const indices = fragments.flatMap((fragment, index) =>
                  fragment.note.part === voice ? [index] : [],
                );
                return scoreBeamGroups(indices.map((index) => fragments[index])).map((group) =>
                  group.map((index) => indices[index]),
                );
              })
            : scoreBeamGroups(fragments);
          const beams = beamGroups.map((indices) => {
            const ys = indices.flatMap((index) =>
              noteTones(fragments[index].note).map((tone) => toneY(tone)),
            );
            const direction = drumPair
              ? fragments[indices[0]].note.part === drumPair[0]
                ? -1
                : 1
              : scoreStemDirection(ys);
            const extension = Math.max(
              ...indices.map((index) => {
                const flags = [1, 0.5, 0.25, 0.125].filter(
                  (limit) =>
                    writtenScoreBeats(fragments[index].note, fragments[index].beats) < limit,
                ).length;
                return isDrums
                  ? drumStemLength(noteTones(fragments[index].note), flags, true)
                  : 25 + Math.max(0, flags - 2) * 5;
              }),
            );
            return {
              indices,
              direction,
              top: (direction === -1 ? Math.min(...ys) : Math.max(...ys)) + direction * extension,
            };
          });
          return beams;
        });
        const noteLayouts = bars.map(({ fragments }, column) =>
          !renderStaff
            ? []
            : fragments.map(({ note, beats: actualBeats }, index) => {
                const beats = writtenScoreBeats(note, actualBeats);
                const ys = note.slash && !isDrums ? [102] : noteTones(note).map((t) => toneY(t));
                const beam = barBeams[column].find((b) => b.indices.includes(index));
                const flags = [1, 0.5, 0.25, 0.125].filter((limit) => beats < limit).length;
                const direction =
                  beam?.direction ??
                  (drumPair ? (note.part === drumPair[0] ? -1 : 1) : scoreStemDirection(ys));
                const stemStart = direction === -1 ? Math.max(...ys) : Math.min(...ys);
                const stemEnd =
                  beam?.top ??
                  (direction === -1 ? Math.min(...ys) : Math.max(...ys)) +
                    direction *
                      (isDrums
                        ? drumStemLength(noteTones(note), flags, false)
                        : 25 + Math.max(0, flags - 2) * 5);
                const hasMark =
                  isDrums && noteTones(note).some((t) => !!drumNotation(t).mark && t.pitch !== 44);
                const end =
                  beats < 4 ? stemEnd : direction === -1 ? Math.min(...ys) : Math.max(...ys);
                const accentY = end + (direction === -1 ? -8 - (hasMark ? 12 : 0) : 18);
                const stickingY = accentY + (note.accent || note.marcato ? direction * 16 : 0);
                const top = !renderStaff
                  ? 0
                  : Math.min(
                      ...ys.map((y) => y - 6),
                      direction === -1 && beats < 4 ? stemEnd : Infinity,
                      hasMark ? stemEnd - 13 : Infinity,
                      note.accent || note.marcato ? accentY - 13 : Infinity,
                      note.sticking ? stickingY - 12 : Infinity,
                      note.slurTo || note.tuplet ? Math.min(...ys) - 65 : Infinity,
                    );
                return { ys, flags, direction, stemStart, stemEnd, accentY, stickingY, top };
              }),
        );
        const directionCounts = bars.map(
          ({ bar }) =>
            directionWords(score.directions?.[directionOwner(score, part)]?.[bar]).length +
            navigationWords(score.navigation?.[bar]).length +
            (Object.keys(score.guitarToneChanges?.[part] ?? {}).some(
              (b) =>
                +b >= scoreMeasureStart(score, part, bar) &&
                +b < scoreMeasureStart(score, part, bar) + scoreMeasureDuration(score, part, bar),
            )
              ? 1
              : 0),
        );
        const directionBaselines = bars.map(
          ({ fragments, bar }, column) =>
            Math.min(
              70,
              score.navigation?.[bar]?.ending ? 22 : Infinity,
              ...noteLayouts[column]
                .filter((_, index) => !fragments[index].note.rest && !fragments[index].note.blank)
                .map((n) => n.top),
            ) - 14,
        );
        const hasChords = bars.some(({ barStart, barBeats }) =>
          Object.entries(chordPositions).some(
            ([beat, chord]) => chord && +beat >= barStart && +beat < barStart + barBeats,
          ),
        );
        const hasGuitarTechniques = bars.some(({ fragments }) =>
          fragments.some(({ note }) =>
            noteTones(note).some(
              (tone) =>
                tone.bend || tone.harmonic || tone.palmMute || tone.bassTechnique || tone.vibrato,
            ),
          ),
        );
        const top = !renderStaff
          ? Math.min(
              line === 0 && showTempo && system.start === 0 ? 0 : 54,
              ...directionCounts.map((count, column) =>
                count ? directionBaselines[column] - (count - 1) * 16 - 16 : Infinity,
              ),
              ...bars.map(({ bar }) => (score.navigation?.[bar]?.ending ? 6 : 54)),
            )
          : Math.min(
              hasGuitarTechniques ? -20 : Infinity,
              // Reserve space for high cymbals and their marks without shifting rows as the cursor moves.
              isDrums && editable ? -24 : Infinity,
              ...directionCounts.map((count, column) =>
                count ? directionBaselines[column] - (count - 1) * 16 - 16 : Infinity,
              ),
              ...noteLayouts.flat().map((n) => n.top - 6),
              line === 0 && showTempo && system.start === 0 ? 0 : hasChords ? 40 : 54,
              ...positions.map(
                (y) =>
                  y -
                  (bars.some(({ fragments }) =>
                    fragments.some(({ note }) => note.slurTo || note.tuplet),
                  )
                    ? 65
                    : 48),
              ),
            );
        const tabTop = renderStaff
          ? Math.max(210, ...positions.map((y) => y + 80))
          : 110 + Math.max(0, ...directionCounts) * 16;
        const chordY = hasTab ? tabTop - 12 : hasChords ? top + 36 : Math.min(top + 36, 62);
        const metronomeY = hasTab ? tabTop - (hasChords ? 44 : 30) : 52;
        // A zero system gap should not retain a fixed empty footer. Reserve only
        // the room actually needed below the last TAB line (stems, grace links,
        // tuplets and lyrics), then add the user's gap outside the SVG.
        const hasLyrics = bars.some(({ fragments }) => fragments.some(({ note }) => !!note.lyric));
        const tabBottom = tabTop + (tuning.length - 1) * tabSpacing;
        const tabInkBottom = hasTab
          ? Math.max(
              tabBottom + 4,
              ...bars.flatMap(({ fragments }) =>
                fragments.flatMap(({ note, beats: duration }) => {
                  if (note.rest || note.blank) return [];
                  const beats = writtenScoreBeats(note, duration);
                  const flags = [1, 0.5, 0.25, 0.125].filter((limit) => beats < limit).length;
                  return [
                    ...(note.tuplet ? [tabBottom + 30] : []),
                    ...tabTones(note, tuning).map((tone) => {
                      const y = tabTop + ((tone.string ?? 1) - 1) * tabSpacing;
                      return (
                        y +
                        (note.graceBeats !== undefined
                          ? 45
                          : beats < 4
                            ? 31 + Math.max(0, flags - 2) * 5
                            : 18)
                      );
                    }),
                  ];
                }),
              ),
            )
          : 0;
        const techniqueFooter = renderStaff
          ? hasGuitarTechniques
            ? 86
            : 0
          : bars.some(({ fragments }) =>
                fragments.some(({ note }) =>
                  noteTones(note).some((t) => t.palmMute || t.harmonic === 'pinch'),
                ),
              )
            ? 50
            : 0;
        const bottom = hasTab
          ? Math.max(tabInkBottom + 8, tabBottom + techniqueFooter) + (hasLyrics ? 24 : 0)
          : Math.max(190, ...positions.map((y) => y + 55));
        const visibleTop = top;
        const measureBottom = Math.max(bottom - 18, hasTab ? tabInkBottom + 4 : 140);
        return (
          <ScoreSystemViewport
            key={system.start}
            enabled={
              (editable || playbackBeat !== null) && notationSystems.length > 12 && !printing
            }
            initialVisible={line < 2}
            playbackPosition={playbackPosition}
            playing={playbackBeat !== null}
            playbackStart={scoreMeasureStart(score, part, Math.max(0, system.start - 1))}
            playbackEnd={scoreMeasureStart(score, part, system.start + system.count)}
            active={
              (hasSelection &&
                selectedBar >= system.start &&
                selectedBar < system.start + system.count) ||
              (playbackBar !== null &&
                playbackBar >= system.start - 1 &&
                playbackBar < system.start + system.count)
            }
            width={(drawingWidth * zoom) / 100}
            height={((bottom - visibleTop) * zoom) / 100}
          >
            {() => (
              <svg
                key={line}
                className="score-system"
                fontFamily="Segoe UI Symbol, Malgun Gothic, sans-serif"
                aria-label={`${system.start + 1}–${system.start + system.count}마디 악보 줄`}
                width={(drawingWidth * zoom) / 100}
                height={((bottom - visibleTop) * zoom) / 100}
                viewBox={`0 ${visibleTop} ${drawingWidth} ${bottom - visibleTop}`}
              >
                {line === 0 && showTempo && system.start === 0 && (
                  <text
                    x="8"
                    y={renderStaff ? top + 60 : 20}
                    fontSize="16"
                    fontWeight="600"
                    fill="#344b3e"
                    aria-label={`악보 템포 ${score.bpm} BPM`}
                  >
                    ♩ = {score.bpm}
                  </text>
                )}
                {system.start === 0 && instrument.capo > 0 && (
                  <text
                    x={hasTab ? 8 : prefix + 12}
                    y={hasTab ? tabTop - 24 : top + 60}
                    fontSize="16"
                    fontWeight="600"
                    fill="#344b3e"
                    aria-label={`카포 ${instrument.capo}프렛`}
                  >
                    Capo = {instrument.capo} fret
                  </text>
                )}
                {line === 0 && showTempo && system.start === 0 && (
                  <ScoreRhythmFeel feel={score.rhythmFeel ?? 'straight'} x={8} y={top + 2} />
                )}
                {renderStaff && (
                  <>
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
                      {isDrums ? (
                        <g aria-label="드럼 음자리표" fill="#293e34">
                          <rect x="10" y="92" width="6" height="20" />
                          <rect x="19" y="92" width="6" height="20" />
                        </g>
                      ) : (
                        <text x="10" y="116" fontSize="44">
                          {instrument.clef === 'bass8' || instrument.clef === 'bass' ? '𝄢' : '𝄞'}
                        </text>
                      )}
                      {(instrument.clef === 'bass8' || instrument.clef === 'treble8') && (
                        <text x="23" y="137" fontSize="9">
                          8
                        </text>
                      )}
                      <text x={timeSignatureX} y="99" fontSize="18" fontWeight="700">
                        {scoreTimeSignature(score).beats}
                      </text>
                      <text x={timeSignatureX} y="119" fontSize="18" fontWeight="700">
                        {scoreTimeSignature(score).beatType}
                      </text>
                      {Array.from(
                        { length: isDrums ? 0 : Math.abs(score.keySignature ?? 0) },
                        (_, index) => {
                          const sharp = (score.keySignature ?? 0) > 0;
                          const steps = sharp
                            ? [0, 15, -5, 10, 25, 5, 20]
                            : [20, 5, 25, 10, 30, 15, 35];
                          return (
                            <text
                              key={index}
                              x={48 + index * keySpacing}
                              y={
                                82 +
                                steps[index] +
                                (instrument.clef === 'bass8' || instrument.clef === 'bass'
                                  ? 10
                                  : 0) +
                                5
                              }
                              fontSize="22"
                              aria-label={sharp ? '조표 샵' : '조표 플랫'}
                            >
                              {sharp ? '♯' : '♭'}
                            </text>
                          );
                        },
                      )}
                    </g>
                  </>
                )}
                {hasTab && (
                  <g aria-label="타브 줄 시작 세로선" pointerEvents="none" stroke="#293e34" fill="none">
                    <line x1="45" x2="45" y1={tabTop} y2={tabBottom} strokeWidth="1" />
                    <path
                      d={`M 45 ${tabTop - 3} L 41 ${tabTop + 1} L 41 ${tabBottom - 1} L 45 ${tabBottom + 3}`}
                      strokeWidth="2"
                      strokeLinejoin="round"
                    />
                  </g>
                )}
                {hasTab &&
                  tuning.map((open, i) => (
                    <g key={i}>
                      <line
                        x1="45"
                        x2={drawingWidth - 1}
                        y1={tabTop + i * tabSpacing}
                        y2={tabTop + i * tabSpacing}
                        stroke="#9aa49f"
                        strokeWidth=".8"
                      />
                      <text x="31" y={tabTop + i * tabSpacing + 4} fontSize="10" fill="#82908c">
                        {pitchName(open).replace(/\d/g, '')}
                      </text>
                    </g>
                  ))}
                {!renderStaff && (
                  <g aria-label="TAB 박자표" fontSize="14" fontWeight="700">
                    <text x={44} y={tabTop + 16}>
                      {meter.beats}
                    </text>
                    <text x={44} y={tabTop + 34}>
                      {meter.beatType}
                    </text>
                  </g>
                )}
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
                {bars.map(({ fragments, bar, span, emptyOffsets, barStart, barBeats }, column) => {
                  const { width, xAt } = layouts[column];
                  const beams = barBeams[column];
                  const endBeat = barStart + barBeats * span;
                  const marks = renderStaff
                    ? scoreAccidentalMarks(fragments, score.keySignature)
                    : [];
                  const hitRegions = scoreBeatHitRegions(
                    [...fragments.map(({ offset }) => offset), ...emptyOffsets],
                    width,
                    xAt,
                  );
                  const staffHitTop = Math.min(82, top + 42);
                  const staffHitBottom = hasTab ? tabTop - 10 : bottom - 20;
                  const previewHere =
                    hasSelection &&
                    indexed.notes.get(selected ?? '')?.graceBeats === undefined &&
                    playbackBeat === null &&
                    selectedBar === bar;
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
                    .filter(({ note }) => !note.blank && note.part === part)
                    .reduce((sum, fragment) => scoreBeat(sum + fragment.beats), 0);
                  const invalid =
                    !score.directions?.[directionOwner(score, part)]?.[bar]?.measureRepeat &&
                    fragments.some(({ note }) => !note.blank) &&
                    (isDrums
                      ? !drumMeasureComplete(fragments, scoreBarBeats(score))
                      : written !== scoreBarBeats(score) || barBeats !== scoreBarBeats(score));
                  const selectedHere =
                    hasSelection &&
                    (selectedBar === bar ||
                      fragments.some(
                        ({ note }) => note.id === selected || rangeIds.includes(note.id),
                      ));
                  const showWarning = invalid && !selectedHere;
                  const repeatPattern =
                    !!score.directions?.[directionOwner(score, part)]?.[bar]?.measureRepeat &&
                    !selectedHere;
                  const repeat = score.repeats?.[bar];
                  const selectInputPosition = (
                    element: SVGGraphicsElement,
                    clientX: number,
                    clientY: number,
                  ) => {
                    const matrix = element.getScreenCTM();
                    const point = matrix
                      ? new DOMPoint(clientX, clientY).matrixTransform(matrix.inverse())
                      : new DOMPoint(0, 102);
                    const pitch = !renderStaff ? undefined : clickPitch(element, clientX, clientY);
                    const inputVoice =
                      isDrums && drumPair
                        ? drumPair[[35, 36, 44].includes(pitch ?? 60) ? 1 : 0]
                        : part;
                    const inputFragments = fragments.filter((f) => f.note.part === inputVoice);
                    const anchors = [
                      ...new Set([...chordOffsets, ...inputFragments.map((f) => f.offset)]),
                    ];
                    const clickedOffset = anchors.reduce(
                      (nearest, value) =>
                        Math.abs(xAt(value) - point.x) < Math.abs(xAt(nearest) - point.x)
                          ? value
                          : nearest,
                      0,
                    );
                    const lastEnd = inputFragments.reduce(
                      (end, fragment) =>
                        fragment.note.blank ? end : Math.max(end, fragment.offset + fragment.beats),
                      0,
                    );
                    const nearNote = inputFragments.find(
                      (f) => !f.note.blank && f.offset === clickedOffset,
                    );
                    const afterNote =
                      nearNote && point.x > xAt(nearNote.offset) + 10
                        ? nearNote.offset + nearNote.beats
                        : clickedOffset;
                    const offset =
                      lastEnd < barBeats && point.x >= xAt(lastEnd)
                        ? lastEnd
                        : afterNote < barBeats
                          ? afterNote
                          : clickedOffset;
                    const target = inputFragments.find(
                      (fragment) =>
                        fragment.offset <= offset && fragment.offset + fragment.beats > offset,
                    );
                    const row =
                      hasTab && point.y >= tabTop - 12
                        ? Math.max(
                            1,
                            Math.min(
                              tuning.length,
                              Math.round((point.y - tabTop) / tabSpacing) + 1,
                            ),
                          )
                        : isDrums
                          ? scoreDrums.findIndex((drum) => drum.pitch === pitch) + 1
                          : selectedString;
                    const previewPitch =
                      !renderStaff || (hasTab && point.y >= tabTop - 12) ? undefined : pitch;
                    if (target) onSelect(target.note.id, row, barStart + offset, previewPitch);
                    else onAppend(row, barStart + offset, bar, previewPitch);
                  };
                  const selectRestMeasure = (event?: {
                    currentTarget: SVGGraphicsElement;
                    clientX: number;
                    clientY: number;
                  }) => {
                    if (event) {
                      selectInputPosition(event.currentTarget, event.clientX, event.clientY);
                      return;
                    }
                    if (!editable) return;
                    const target = measures[bar]?.[0];
                    if (target) onSelect(target.note.id, selectedString, barStart);
                    else onAppend(selectedString, barStart, bar);
                  };
                  return (
                    <g
                      key={bar}
                      className="score-measure"
                      data-invalid={invalid ? 'true' : undefined}
                      data-warning-visible={showWarning ? 'true' : undefined}
                      aria-label={span > 1 ? `${bar + 1}–${bar + span}마디` : `${bar + 1}마디`}
                      onContextMenu={(event) => {
                        if (!editable || !onMeasureContextMenu) return;
                        event.preventDefault();
                        onMeasureContextMenu(bar, event.clientX, event.clientY);
                      }}
                      transform={`translate(${prefix + layouts.slice(0, column).reduce((sum, layout) => sum + layout.width, 0)}, 0)`}
                      data-playback-start={barStart}
                      data-playback-bar-index={bar}
                      data-playback-end={endBeat}
                      data-playback-bars={
                        span > 1
                          ? JSON.stringify(
                              Array.from({ length: span }, (_, i) =>
                                scoreMeasureStart(score, part, bar + i),
                              ),
                            )
                          : undefined
                      }
                      data-playback-measure="true"
                    >
                      {editable &&
                        scoreBeatSelectionGroups(fragments, barBeats, 4 / meter.beatType).flatMap(
                          (group) => {
                            const surfaces = [
                              ...(renderStaff ? [{ top: 82, bottom: 122 }] : []),
                              ...(hasTab ? [{ top: tabTop - 8, bottom: tabBottom + 8 }] : []),
                            ];
                            return surfaces.map((surface, index) => (
                              <rect
                                key={`beat-select/${group.offset}/${index}`}
                                data-selection-beat={JSON.stringify(group.ids)}
                                data-selection-position={barStart + group.offset}
                                x={xAt(group.offset) - 0.5}
                                y={surface.top}
                                width={1}
                                height={surface.bottom - surface.top}
                                fill="none"
                                pointerEvents="none"
                              />
                            ));
                          },
                        )}
                      {showBeatMarkers && (
                        <g
                          aria-label="마디 박자 표시"
                          className="score-metronome-indicator"
                          data-preview={
                            playbackBeat === null && bar > (hasSelection ? selectedBar : 0)
                              ? 'true'
                              : undefined
                          }
                          visibility={
                            playbackBeat === null &&
                            (hasSelection
                              ? selectedBar >= bar - 1 && selectedBar < bar + span
                              : bar <= 1)
                              ? 'visible'
                              : 'hidden'
                          }
                          data-metronome-unit={4 / (score.timeSignature?.beatType ?? 4)}
                          pointerEvents="none"
                        >
                          {Array.from({ length: score.timeSignature?.beats ?? 4 }, (_, i) => (
                            <circle
                              key={i}
                              className="score-metronome-dot"
                              data-metronome-beat={i}
                              cx={xAt(i * (4 / (score.timeSignature?.beatType ?? 4)))}
                              cy={metronomeY}
                              r={i === 0 ? 5 : 3.5}
                            />
                          ))}
                        </g>
                      )}
                      {previewHere && (
                        <rect
                          data-editing-measure-background="true"
                          x="0"
                          y={Math.max(65, visibleTop)}
                          width={width}
                          height={measureBottom - Math.max(65, visibleTop)}
                          fill="#94a3b8"
                          fillOpacity=".14"
                          pointerEvents="none"
                        />
                      )}
                      <rect
                        data-playback-measure-background
                        x="0"
                        y="65"
                        width={width}
                        height={measureBottom - 65}
                        fill="#facc15"
                        opacity="0.18"
                        visibility="hidden"
                        pointerEvents="none"
                      />
                      <rect
                        data-measure-scroll-target
                        x="0"
                        y="65"
                        width={width}
                        height={measureBottom - 65}
                        fill="none"
                        pointerEvents="none"
                        aria-hidden="true"
                      />
                      {editable && (
                        <rect
                          x="0"
                          y="65"
                          width={width}
                          height={measureBottom - 65}
                          fill="transparent"
                          role="button"
                          tabIndex={0}
                          aria-label={`${bar + 1}마디 선택`}
                          onClick={(event) => {
                            if (editable) {
                              selectInputPosition(
                                event.currentTarget,
                                event.clientX,
                                event.clientY,
                              );
                              return;
                            }
                            const target = fragments.find(
                              (item) => !item.note.blank && item.note.part === part,
                            );
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
                            event.stopPropagation();
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
                            height={measureBottom - 65}
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
                              ...(renderStaff ? [{ id: 'staff', top: 82, bottom: 122 }] : []),
                              ...(hasTab
                                ? [
                                    {
                                      id: 'tab',
                                      top: tabTop,
                                      bottom: tabTop + (tuning.length - 1) * tabSpacing,
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
                            ...(renderStaff ? [{ top: 82, bottom: 122 }] : []),
                            ...(hasTab
                              ? [{ top: tabTop, bottom: tabTop + (tuning.length - 1) * tabSpacing }]
                              : []),
                          ].map((surface, i) => (
                            <g
                              key={i}
                              aria-label={!renderStaff || i ? 'TAB 겹세로선' : '오선 겹세로선'}
                            >
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
                      {chordOffsets
                        .filter((offset) => !!chordPositions[barStart + offset])
                        .map((offset) => {
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
                                y={chordY - 16}
                                width={hit.right - hit.left}
                                height="22"
                                fill="transparent"
                              />
                              <title>{`${bar + 1}마디 ${offset + 1}박 코드 편집`}</title>
                              <text
                                x={xAt(offset)}
                                y={chordY}
                                textAnchor="middle"
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
                      {Object.entries(score.guitarToneChanges?.[part] ?? {})
                        .filter(([beat]) => +beat >= barStart && +beat < barStart + barBeats)
                        .map(([beat, tone]) => (
                          <text
                            key={beat}
                            data-guitar-tone={tone}
                            x={xAt(+beat - barStart)}
                            y={
                              directionBaselines[column] -
                              Math.max(0, directionCounts[column] - 1) * 16
                            }
                            fontSize="13"
                            fontWeight="600"
                            fill="#293e34"
                          >
                            {guitarToneLabels[tone]} →
                          </text>
                        ))}
                      <ScoreDirectionMarks
                        score={score}
                        part={part}
                        bar={bar}
                        width={width}
                        baseline={directionBaselines[column]}
                        repeatPattern={repeatPattern}
                        xAt={xAt}
                        barBeats={barBeats}
                      />
                      {renderStaff && (
                        <line
                          data-barline="staff"
                          x1={width}
                          x2={width}
                          y1="82"
                          y2="122"
                          stroke="#5f6c65"
                        />
                      )}
                      {hasTab && (
                        <line
                          data-barline="tab"
                          x1={width}
                          x2={width}
                          y1={tabTop}
                          y2={tabTop + (tuning.length - 1) * tabSpacing}
                          stroke="#5f6c65"
                        />
                      )}
                      {fragments.map(
                        ({ note, beats: actualBeats, offset, continued, continues }, index) => {
                          const beats = writtenScoreBeats(note, actualBeats);
                          const beam = beams.find(({ indices }) => indices.includes(index));
                          const { flags, ys, direction, stemStart, stemEnd, accentY, stickingY } =
                            noteLayouts[column][index] ?? {
                              flags: 0,
                              ys: [],
                              direction: -1,
                              stemStart: 0,
                              stemEnd: 0,
                              accentY: 0,
                              stickingY: 0,
                            };
                          if (note.graceBeats !== undefined) return null;
                          const x = xAt(offset),
                            tones = tabTones(note, tuning);
                          const headOffsets = !renderStaff
                            ? []
                            : isDrums
                              ? ys.map(() => 0)
                              : scoreChordHeadOffsets(ys, direction);
                          const accidentalColumns = renderStaff
                            ? scoreAccidentalColumns(ys, marks[index])
                            : [];
                          const accidentalX = x + Math.min(0, ...headOffsets) - 9;
                          const hit = hitRegions.get(offset)!;
                          const cursorWidth = Math.min(
                            28,
                            2 * Math.min(x - hit.left, hit.right - x),
                          );
                          const upperVoice = !drumPair || note.part === drumPair[0];
                          const restY = drumPair ? (upperVoice ? 81 : 147) : 113;
                          const noteHitTop = drumPair && !upperVoice ? 103 : staffHitTop;
                          const noteHitBottom = drumPair && upperVoice ? 103 : staffHitBottom;

                          const chosen =
                            selected === note.id &&
                            emptyBeat >= barStart + offset &&
                            emptyBeat < scoreBeat(barStart + offset + actualBeats);
                          return (
                            <g
                              key={`${note.id}/${index}`}
                              data-score-note={note.id}
                              opacity={repeatPattern ? 0 : voiceOpacity(note.part)}
                              data-drum-voice={
                                drumPair ? (upperVoice ? 'upper' : 'lower') : undefined
                              }
                            >
                              {rangeIds.includes(note.id) && (
                                <rect
                                  className="score-range-highlight"
                                  aria-label="복사 구간 선택"
                                  x={hit.left}
                                  y={staffHitTop}
                                  width={hit.right - hit.left}
                                  height={measureBottom - staffHitTop}
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
                              {renderStaff && (
                                <g
                                  role="button"
                                  tabIndex={0}
                                  aria-label={`${drumPair ? (upperVoice ? '위 성부 ' : '아래 성부 ') : ''}${bar + 1}마디 ${offset + 1}박 ${
                                    note.blank
                                      ? '빈 박'
                                      : note.rest
                                        ? '쉼표'
                                        : noteTones(note)
                                            .map(
                                              (tone) =>
                                                `${isDrums ? drumLabel(tone.pitch, tone.drumTechnique) : pitchName(tone.pitch)}${tone.dead ? ' 데드노트' : tone.ghost ? ' 고스트노트' : ''}`,
                                            )
                                            .join(' ')
                                  } ${Number(actualBeats.toFixed(3))}박 길이${note.tuplet ? ' 셋잇단음표' : ''}${note.staccato && !note.rest ? ' 스타카토' : ''}`}
                                  aria-pressed={chosen || rangeIds.includes(note.id)}
                                  onClick={(event) => {
                                    if (note.blank) {
                                      selectInputPosition(
                                        event.currentTarget,
                                        event.clientX,
                                        event.clientY,
                                      );
                                      return;
                                    }
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
                                        Math.hypot(
                                          toneY(tone) - point.y,
                                          x + headOffsets[i] - point.x,
                                        ) <
                                        Math.hypot(
                                          toneY(pitches[nearest]) - point.y,
                                          x + headOffsets[nearest] - point.x,
                                        )
                                          ? i
                                          : nearest,
                                      0,
                                    );
                                    if (
                                      Math.abs(toneY(pitches[index]) - point.y) > 7 ||
                                      Math.abs(x + headOffsets[index] - point.x) > 10
                                    ) {
                                      selectInputPosition(
                                        event.currentTarget,
                                        event.clientX,
                                        event.clientY,
                                      );
                                      return;
                                    }
                                    onSelect(
                                      note.id,
                                      isDrums
                                        ? Math.max(
                                            1,
                                            scoreDrums.findIndex(
                                              (drum) => drum.pitch === pitches[index].pitch,
                                            ) + 1,
                                          )
                                        : tuning.length
                                          ? (tones[index]?.string ?? 1)
                                          : index + 1,
                                      barStart + offset,
                                    );
                                  }}
                                  onKeyDown={(event) => {
                                    if (event.key === 'Enter') {
                                      event.preventDefault();
                                      event.stopPropagation();
                                      onSelect(note.id, undefined, barStart + offset);
                                    }
                                  }}
                                >
                                  <rect
                                    x={hit.left}
                                    y={noteHitTop}
                                    width={hit.right - hit.left}
                                    height={noteHitBottom - noteHitTop}
                                    fill="transparent"
                                  />
                                  {note.graceSlide && !continued && !note.rest && !note.blank && (
                                    <GraceSlide
                                      x={x}
                                      y={staffY(note.graceSlide.pitch)}
                                      targetY={staffY(note.pitch)}
                                    />
                                  )}
                                  {note.blank ||
                                  measureRestBars.has(bar) ||
                                  (note.rest && drumPair) ? null : note.rest ? (
                                    <g>
                                      <text
                                        aria-label={
                                          drumPair
                                            ? upperVoice
                                              ? '위 성부 쉼표'
                                              : '아래 성부 쉼표'
                                            : '오선 쉼표'
                                        }
                                        x={x - 7}
                                        y={restY}
                                        fontSize="24"
                                      >
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
                                          cy={restY - 10}
                                          r="1.6"
                                          fill="#293e34"
                                        />
                                      )}
                                    </g>
                                  ) : note.slash && !isDrums ? (
                                    <RhythmSlash
                                      x={x}
                                      y={102}
                                      beats={beats}
                                      stemEnd={stemEnd}
                                      direction={direction}
                                      beamed={!!beam}
                                      staccato={note.staccato}
                                      accent={note.accent}
                                    />
                                  ) : (
                                    noteTones(note).map((tone, toneIndex) => {
                                      const y = toneY(tone),
                                        ledgers: number[] = [];
                                      const drumSelected =
                                        isDrums && chosen && drumAtRow(selectedString).y === y;
                                      const stemX = x - direction * 4.5;
                                      const headX = x + headOffsets[toneIndex];
                                      for (let line = 132; line <= y; line += 10)
                                        ledgers.push(line);
                                      for (let line = 72; line >= y; line -= 10) ledgers.push(line);
                                      return (
                                        <g
                                          key={toneIndex}
                                          data-drum-selected={drumSelected ? 'true' : undefined}
                                          style={drumSelected ? { color: '#c77830' } : undefined}
                                          data-keyboard-selected={
                                            !isDrums &&
                                            !hasTab &&
                                            !inputPreview &&
                                            chosen &&
                                            selectedString === toneIndex + 1
                                              ? true
                                              : undefined
                                          }
                                          data-staff-tone={toneIndex}
                                          data-midi-pitch={tone.pitch}
                                          data-natural-pitch={tone.naturalPitch}
                                        >
                                          <rect
                                            data-selection-note={note.id}
                                            x={headX - 6}
                                            y={y - 5}
                                            width={12}
                                            height={10}
                                            fill="transparent"
                                            pointerEvents="none"
                                          />
                                          {(isDrums ? [] : ledgers).map((line) => (
                                            <line
                                              key={line}
                                              x1={headX - 9}
                                              x2={headX + 9}
                                              y1={line}
                                              y2={line}
                                              stroke="#536159"
                                            />
                                          ))}
                                          {!isDrums && marks[index][toneIndex] && (
                                            <text
                                              data-tone-accidental={toneIndex}
                                              x={accidentalX - accidentalColumns[toneIndex]}
                                              y={y + 4}
                                              fontSize="14"
                                              textAnchor="end"
                                            >
                                              {marks[index][toneIndex]}
                                            </text>
                                          )}
                                          {isDrums && note.slash ? (
                                            <path
                                              aria-label="슬래시 기보"
                                              d={`M${x - 5} ${y + 7}l10 -14`}
                                              stroke="currentColor"
                                              strokeWidth="3"
                                            />
                                          ) : isDrums ? (
                                            <DrumNotehead
                                              showLedger
                                              color={drumSelected ? '#c77830' : undefined}
                                              stemX={stemX}
                                              tone={tone}
                                              x={x}
                                              y={y}
                                              beats={beats}
                                              stemEnd={stemEnd}
                                              stemBase={
                                                direction === -1 ? Math.min(...ys) : Math.max(...ys)
                                              }
                                              flags={flags}
                                              beamed={!!beam}
                                            />
                                          ) : tone.dead ? (
                                            <path
                                              aria-label={
                                                isDrums
                                                  ? `${drumLabel(tone.pitch)} X 음표`
                                                  : '뮤트 X 음표'
                                              }
                                              d={`M${headX - 4} ${y - 4}l8 8m-8 0l8 -8`}
                                              stroke="#293e34"
                                              strokeWidth="1.4"
                                              fill="none"
                                            />
                                          ) : tone.harmonic === 'natural' ? (
                                            <path
                                              d={`M${headX} ${y - 5}l6 5 -6 5 -6 -5Z`}
                                              fill="var(--score-paper-color, #fffefb)"
                                              stroke="#293e34"
                                            />
                                          ) : (
                                            <ellipse
                                              cx={headX}
                                              cy={y}
                                              rx="5"
                                              ry="3.3"
                                              transform={`rotate(-18 ${headX} ${y})`}
                                              fill={
                                                beats >= 2
                                                  ? 'var(--score-paper-color, #fffefb)'
                                                  : '#293e34'
                                              }
                                              stroke="#293e34"
                                              strokeWidth="1.1"
                                            />
                                          )}
                                          <GuitarTechniqueMarks
                                            tone={tone}
                                            beats={note.beats}
                                            x={headX}
                                            y={y}
                                            tabY={
                                              hasTab && tone.string
                                                ? tabTop + (tone.string - 1) * tabSpacing
                                                : undefined
                                            }
                                            footerY={hasTab ? tabBottom + 40 : undefined}
                                            width={Math.max(14, xAt(offset + actualBeats) - x - 6)}
                                          />
                                          {beats < 4 && Math.abs(headOffsets[toneIndex]) > 9 && (
                                            <line
                                              x1={stemX}
                                              x2={headX}
                                              y1={y}
                                              y2={y}
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
                                          <NoteFlags
                                            x={stemX}
                                            y={stemEnd}
                                            count={beam || toneIndex !== 0 ? 0 : flags}
                                            direction={direction}
                                          />
                                          {DOTTED_SCORE_BEATS.includes(beats) && (
                                            <circle
                                              aria-label="점음표 점"
                                              cx={headX + (tone.ghost ? 14 : 8.5)}
                                              cy={(y - 82) % 10 === 0 ? y - 5 : y}
                                              r="1.3"
                                              fill="#293e34"
                                            />
                                          )}
                                          {tone.ghost && !tone.dead && (
                                            <g aria-label="약하게 연주 괄호" fill="#65786c">
                                              <text x={headX - 11} y={y + 4} fontSize="14">
                                                (
                                              </text>
                                              <text x={headX + 7} y={y + 4} fontSize="14">
                                                )
                                              </text>
                                            </g>
                                          )}
                                          {note.staccato &&
                                            !continued &&
                                            toneIndex === 0 &&
                                            tone.drumTechnique !== 'choke' && (
                                              <circle
                                                aria-label="스타카토 표시"
                                                cx={headX}
                                                cy={
                                                  isDrums && [49, 57, 52, 55].includes(tone.pitch)
                                                    ? stemEnd - 9
                                                    : direction === -1
                                                      ? Math.max(...ys) + 12
                                                      : Math.min(...ys) - 12
                                                }
                                                r="1.8"
                                                fill="#293e34"
                                              />
                                            )}
                                          {(continued || continues) && (
                                            <path
                                              d={`M${x - (continued ? 20 : 0)} ${y - direction * 10}q15 ${-direction * 12} 30 0`}
                                              fill="none"
                                              stroke="#536159"
                                            />
                                          )}
                                        </g>
                                      );
                                    })
                                  )}
                                  {note.sticking && !continued && (
                                    <text
                                      aria-label="스티킹"
                                      x={x}
                                      y={stickingY}
                                      textAnchor="middle"
                                      fontSize="12"
                                    >
                                      {note.sticking}
                                    </text>
                                  )}
                                  {(note.accent || note.marcato) && !continued && (
                                    <text
                                      x={x}
                                      aria-label={note.marcato ? '마르카토 표시' : '악센트 표시'}
                                      y={accentY}
                                      textAnchor="middle"
                                      fontSize="17"
                                    >
                                      {note.marcato ? '^' : '>'}
                                    </text>
                                  )}
                                </g>
                              )}
                              {hasTab &&
                                tuning.map((_, row) => {
                                  const tone = tones.find((item) => item.string === row + 1);
                                  const tabLabel = tone
                                    ? scoreTabLabel(
                                        tone.fret,
                                        tone.dead,
                                        !!tone.ghost || continued || tieTargets.has(note.id),
                                        tone.harmonic === 'natural',
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
                                        (!rangeIds.length &&
                                          chosen &&
                                          selectedString === row + 1) ||
                                        rangeIds.includes(note.id)
                                      }
                                      onClick={(event) => {
                                        const matrix = event.currentTarget.getScreenCTM();
                                        const point = matrix
                                          ? new DOMPoint(
                                              event.clientX,
                                              event.clientY,
                                            ).matrixTransform(matrix.inverse())
                                          : null;
                                        if (point && point.x > x + 12) {
                                          selectInputPosition(
                                            event.currentTarget,
                                            event.clientX,
                                            event.clientY,
                                          );
                                          return;
                                        }
                                        onSelect(note.id, row + 1, barStart + offset);
                                      }}
                                      onKeyDown={(event) => {
                                        if (event.key === 'Enter') {
                                          event.preventDefault();
                                          onSelect(note.id, row + 1, barStart + offset);
                                        }
                                      }}
                                    >
                                      <rect
                                        x={hit.left}
                                        y={tabTop + row * tabSpacing - tabSpacing / 2}
                                        width={hit.right - hit.left}
                                        height={tabSpacing}
                                        fill="transparent"
                                      />
                                      {rangeIds.length === 0 && (
                                        <rect
                                          className="score-cell-cursor"
                                          x={x - cursorWidth / 2}
                                          y={
                                            tabTop +
                                            row * tabSpacing -
                                            Math.min(18, tabSpacing - 2) / 2
                                          }
                                          width={cursorWidth}
                                          height={Math.min(18, tabSpacing - 2)}
                                          rx="1"
                                          fill={
                                            !rangeIds.length && chosen && selectedString === row + 1
                                              ? '#fff2df'
                                              : 'transparent'
                                          }
                                          stroke={
                                            !rangeIds.length && chosen && selectedString === row + 1
                                              ? '#c77830'
                                              : 'none'
                                          }
                                        />
                                      )}
                                      {tone && (
                                        <rect
                                          data-selection-note={note.id}
                                          x={x - 7}
                                          y={tabTop + row * tabSpacing - 7}
                                          width={14}
                                          height={14}
                                          fill="transparent"
                                          pointerEvents="none"
                                        />
                                      )}
                                      {!renderStaff && tone && (
                                        <GuitarTechniqueMarks
                                          tone={tone}
                                          showStaff={false}
                                          tabY={tabTop + row * tabSpacing}
                                          x={x}
                                          y={tabTop + row * tabSpacing}
                                          footerY={tabBottom + 40}
                                          beats={note.beats}
                                          width={Math.max(14, xAt(offset + actualBeats) - x - 6)}
                                        />
                                      )}
                                      {tone && !note.slash && (
                                        <>
                                          {note.graceSlide &&
                                            !continued &&
                                            tone.string === note.graceSlide.string && (
                                              <GraceSlide
                                                x={x}
                                                y={tabTop + row * tabSpacing}
                                                targetY={tabTop + row * tabSpacing}
                                                fret={note.graceSlide.fret}
                                              />
                                            )}
                                          <text
                                            x={x}
                                            y={tabTop + row * tabSpacing + 4}
                                            textAnchor="middle"
                                            fontSize="12"
                                            fontWeight="600"
                                            paintOrder="stroke"
                                            stroke={
                                              !rangeIds.length &&
                                              chosen &&
                                              selectedString === row + 1
                                                ? '#fff2df'
                                                : 'var(--score-paper-color, #fffefb)'
                                            }
                                            strokeWidth="3"
                                            strokeLinejoin="round"
                                          >
                                            {tabLabel!.label}
                                          </text>
                                        </>
                                      )}
                                      {tone && !note.slash && note.staccato && !continued && (
                                        <circle
                                          cx={x}
                                          cy={tabTop + row * tabSpacing + 10}
                                          r="1.3"
                                          fill="#293e34"
                                        />
                                      )}
                                    </g>
                                  );
                                })}
                              {hasTab && note.slash && !note.rest && !note.blank && (
                                <g
                                  role="button"
                                  tabIndex={0}
                                  aria-label={`${bar + 1}마디 ${offset + 1}박 리듬 슬래시`}
                                  onClick={() =>
                                    onSelect(note.id, selectedString, barStart + offset)
                                  }
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                      e.preventDefault();
                                      onSelect(note.id, selectedString, barStart + offset);
                                    }
                                  }}
                                >
                                  <rect
                                    x={x - 13}
                                    y={tabTop + (tuning.length - 1) * 10 - 15}
                                    width="26"
                                    height="60"
                                    fill="transparent"
                                  />
                                  <RhythmSlash
                                    x={x}
                                    y={tabTop + (tuning.length - 1) * 10}
                                    beats={beats}
                                    staccato={note.staccato}
                                    accent={note.accent}
                                  />
                                </g>
                              )}
                              {hasTab && !note.slash && tones.some((tone) => !tone.string) && (
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
                      {!repeatPattern &&
                        (measureRestBars.has(bar) ? (
                          <g
                            aria-label={`${span}마디 쉼표`}
                            data-multirest={span}
                            role={editable ? 'button' : undefined}
                            tabIndex={editable ? 0 : undefined}
                            onClick={selectRestMeasure}
                            onKeyDown={(event) => {
                              if (
                                editable &&
                                (event.key === 'Delete' || event.key === 'Backspace')
                              ) {
                                event.preventDefault();
                                event.stopPropagation();
                                onDeleteMeasureRest?.(bar);
                              }
                              if (event.key === 'Enter') {
                                event.preventDefault();
                                event.stopPropagation();
                                selectRestMeasure();
                              }
                            }}
                          >
                            <rect
                              x="0"
                              y="65"
                              width={width}
                              height={bottom - 65}
                              fill="transparent"
                            />
                            {[
                              ...(renderStaff ? [102] : []),
                              ...(hasTab ? [tabTop + (tuning.length - 1) * 10] : []),
                            ].map((center) => (
                              <g
                                key={center}
                                data-measure-rest-staff={center === 102 ? 'standard' : 'tab'}
                              >
                                <path
                                  d={`M${width * 0.1} ${center - 5}v10M${width * 0.9} ${center - 5}v10`}
                                  stroke="currentColor"
                                  strokeWidth="1.5"
                                />
                                <path
                                  d={`M${width * 0.1} ${center}H${width * 0.9}`}
                                  stroke="currentColor"
                                  strokeWidth="6"
                                />
                                <text
                                  x={width / 2}
                                  y={center - 25}
                                  textAnchor="middle"
                                  fontSize="22"
                                  fontWeight="600"
                                >
                                  {span}
                                </text>
                                {span > 1 && (
                                  <text
                                    data-rest-progress="true"
                                    x={width / 2 + String(span).length * 7 + 10}
                                    y={center - 25}
                                    textAnchor="start"
                                    fontSize="11"
                                    fill="#85918c"
                                    stroke="none"
                                    visibility="hidden"
                                  />
                                )}
                              </g>
                            ))}
                          </g>
                        ) : (
                          drumPair?.flatMap((voice, voiceIndex) =>
                            drumRestGroups(
                              fragments.filter((f) => f.note.part === voice),
                              scoreMeasureDuration(score, voice, bar),
                              Object.entries(score.multiMeasureRests?.[drumPair[0]] ?? {}).some(
                                ([start, count]) => +start <= bar && +start + count > bar,
                              ),
                            ).map((rest, i) => (
                              <g
                                key={`${voice}/${i}`}
                                opacity={voiceOpacity(voice)}
                                data-drum-rest-voice={voice}
                              >
                                <DrumRest
                                  x={rest.whole ? width / 2 : xAt(rest.offset)}
                                  y={
                                    rest.whole
                                      ? voiceIndex === 0
                                        ? 82
                                        : 122
                                      : voiceIndex === 0
                                        ? 81
                                        : 147
                                  }
                                  beats={rest.beats}
                                  whole={rest.whole}
                                  label={voiceIndex === 0 ? '위 성부 쉼표' : '아래 성부 쉼표'}
                                />
                              </g>
                            )),
                          )
                        ))}
                      {!renderStaff &&
                        hasTab &&
                        fragments
                          .filter(
                            (f) =>
                              !f.note.rest &&
                              !f.note.blank &&
                              !f.continued &&
                              f.note.accent &&
                              tabTones(f.note, tuning).length >= 3,
                          )
                          .map((f) => (
                            <text
                              key={`strum-accent/${f.note.id}`}
                              data-strum-accent="true"
                              x={xAt(f.offset)}
                              y={tabTop - (hasChords ? 30 : 20)}
                              textAnchor="middle"
                              fontSize="16"
                              fill="#344b3e"
                              pointerEvents="none"
                            >
                              &gt;
                            </text>
                          ))}
                      {fragments.map((f) => {
                        if (f.note.rest || f.note.blank || f.continued || !tuning.length)
                          return null;
                        const tones = tabTones(f.note, tuning),
                          direction = tones.find((t) => t.strum)?.strum;
                        if (
                          !direction ||
                          new Set(tones.map((t) => t.string).filter(Boolean)).size < 3
                        )
                          return null;
                        const ys = renderStaff ? tones.map(toneY) : [],
                          strings = hasTab
                            ? tones.map((t) => tabTop + ((t.string ?? 1) - 1) * tabSpacing)
                            : [];
                        return (
                          <g key={`strum/${f.note.id}/${f.offset}`} color="#344b3e">
                            {renderStaff && (
                              <ScoreStrumMark
                                direction={direction}
                                x={xAt(f.offset) - 18}
                                top={Math.min(...ys) - 5}
                                bottom={Math.max(...ys) + 5}
                              />
                            )}
                            {hasTab && (
                              <ScoreStrumMark
                                direction={direction}
                                x={xAt(f.offset) - 18}
                                top={Math.min(...strings) - 5}
                                bottom={Math.max(...strings) + 5}
                              />
                            )}
                          </g>
                        );
                      })}
                      {hasTab &&
                        fragments
                          .filter(
                            (f) =>
                              !f.note.rest &&
                              !f.note.blank &&
                              noteTones(f.note).some((t) => t.vibrato),
                          )
                          .map((f) => (
                            <path
                              key={`vibrato/${f.note.id}/${f.offset}`}
                              data-vibrato="true"
                              d={scoreSlidePath(
                                xAt(f.offset),
                                tabTop - (hasChords ? 26 : 14),
                                Math.min(width - 3, xAt(Math.min(barBeats, f.offset + f.beats))),
                                tabTop - (hasChords ? 26 : 14),
                              )}
                              stroke="#344b3e"
                              fill="none"
                              strokeWidth="1.2"
                              pointerEvents="none"
                            />
                          ))}
                      {hasTab &&
                        fragments
                          .filter((f) => !f.note.rest && !f.note.blank && !f.continued)
                          .map((f) => {
                            const techniques = [
                              ...new Set(
                                noteTones(f.note)
                                  .map((t) => t.bassTechnique)
                                  .filter(Boolean),
                              ),
                            ];
                            return techniques.length ? (
                              <text
                                key={`bass-technique/${f.note.id}`}
                                data-bass-technique={techniques.join(',')}
                                x={
                                  xAt(f.offset) -
                                  (noteTones(f.note).some((t) => t.vibrato) ? 16 : 0)
                                }
                                y={tabTop - 30}
                                textAnchor="middle"
                                fontSize="11"
                                fontWeight="600"
                                fill="#344b3e"
                                pointerEvents="none"
                              >
                                {techniques.map((t) => (t === 'thumb' ? 'T' : 'P')).join('/')}
                              </text>
                            ) : null;
                          })}
                      {(() => {
                        const ranges: {
                          start: number;
                          end: number;
                          first: number;
                          last: number;
                        }[] = [];
                        for (const f of fragments) {
                          if (
                            !noteTones(f.note).some((t) => t.palmMute) ||
                            f.note.rest ||
                            f.note.blank
                          )
                            continue;
                          const start = Math.max(0, Math.floor(f.offset + 1e-7));
                          const end = Math.min(barBeats, Math.ceil(f.offset + f.beats - 1e-7));
                          const last = ranges[ranges.length - 1];
                          if (last && start <= last.end + 1e-7) {
                            last.end = Math.max(last.end, end);
                            last.first = Math.min(last.first, f.offset);
                            last.last = Math.max(last.last, f.offset);
                          } else ranges.push({ start, end, first: f.offset, last: f.offset });
                        }
                        const palmEdge = (index: number, end: boolean) => {
                          if (index < 0) return false;
                          const duration = scoreMeasureDuration(score, part, index);
                          return (measures[index] ?? []).some(
                            (f) =>
                              !f.note.rest &&
                              !f.note.blank &&
                              noteTones(f.note).some((t) => t.palmMute) &&
                              (end ? f.offset + f.beats >= duration - 1e-7 : f.offset <= 1e-7),
                          );
                        };
                        return ranges.map((r) => {
                          const fromPrevious = r.start === 0 && palmEdge(bar - 1, true);
                          const intoNext = r.end >= barBeats - 1e-7 && palmEdge(bar + 1, false);
                          const left = fromPrevious ? 0 : Math.max(0, xAt(r.first) - 8),
                            right = intoNext ? width : Math.min(width, xAt(r.last) + 8);
                          const y = hasTab ? tabBottom + 40 : top + 18;
                          return (
                            <g
                              key={`pm/${r.start}`}
                              data-palm-mute-range="true"
                              pointerEvents="none"
                              fill="#344b3e"
                              stroke="#344b3e"
                            >
                              {(!fromPrevious || column === 0) && (
                                <text x={left} y={y} fontSize="10" stroke="none">
                                  P.M.
                                </text>
                              )}
                              <path
                                d={`M${left} ${y + 5}H${right}${intoNext ? '' : 'v-5'}`}
                                fill="none"
                                strokeDasharray="3 3"
                              />
                            </g>
                          );
                        });
                      })()}
                      {hasTab && (
                        <TabRhythm
                          fragments={fragments}
                          tuning={tuning}
                          y={tabTop}
                          xAt={xAt}
                          stringSpacing={tabSpacing}
                        />
                      )}
                      {renderStaff &&
                        beams.map(({ indices, top, direction }, groupIndex) => (
                          <g
                            key={`beams/${groupIndex}`}
                            opacity={
                              repeatPattern ? 0 : voiceOpacity(fragments[indices[0]].note.part)
                            }
                            aria-label="박 단위 음표 묶음"
                            pointerEvents="none"
                            stroke="#293e34"
                            strokeWidth="2.4"
                          >
                            {[0, 1, 2, 3].flatMap((level) =>
                              indices.flatMap((index, position) => {
                                const flags = [1, 0.5, 0.25, 0.125].filter(
                                  (limit) =>
                                    writtenScoreBeats(
                                      fragments[index].note,
                                      fragments[index].beats,
                                    ) < limit,
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
                                  writtenScoreBeats(
                                    fragments[previous].note,
                                    fragments[previous].beats,
                                  ) < [1, 0.5, 0.25, 0.125][level];
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
                          <g
                            key={`empty/${offset}`}
                            data-empty-active={active ? 'true' : undefined}
                          >
                            {renderStaff && hasTab && (
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
                              const y = hasTab
                                ? tabTop + row * tabSpacing
                                : isDrums
                                  ? drumAtRow(selectedString).y
                                  : inputPitch === undefined
                                    ? 102
                                    : inputY(inputPitch);
                              const focused =
                                active && (hasTab ? selectedString === row + 1 : true);
                              return (
                                <g
                                  key={row}
                                  role="button"
                                  tabIndex={0}
                                  className="score-empty-cell score-position-cell"
                                  aria-label={`${bar + 1}마디 ${offset + 1}박 ${hasTab ? `${row + 1}번 줄 ` : ''}빈 칸`}
                                  aria-pressed={focused}
                                  onClick={(event) =>
                                    editable
                                      ? selectInputPosition(
                                          event.currentTarget,
                                          event.clientX,
                                          event.clientY,
                                        )
                                      : focused
                                        ? onDeselect()
                                        : onAppend(
                                            isDrums ? selectedString : row + 1,
                                            barStart + offset,
                                            bar,
                                          )
                                  }
                                  onKeyDown={(event) => {
                                    if (event.key === 'Enter') {
                                      event.preventDefault();
                                      event.stopPropagation();
                                      onAppend(
                                        isDrums ? selectedString : row + 1,
                                        barStart + offset,
                                        bar,
                                      );
                                    }
                                  }}
                                >
                                  <rect
                                    x={hit.left}
                                    y={hasTab ? y - tabSpacing / 2 : staffHitTop}
                                    width={hit.right - hit.left}
                                    height={hasTab ? tabSpacing : staffHitBottom - staffHitTop}
                                    fill="transparent"
                                  />
                                  {hasTab && (
                                    <rect
                                      className="score-cell-cursor"
                                      x={x - cursorWidth / 2}
                                      y={y - Math.min(18, tabSpacing - 2) / 2}
                                      width={cursorWidth}
                                      height={Math.min(18, tabSpacing - 2)}
                                      rx="1"
                                      fill={focused ? '#fff2df' : 'transparent'}
                                      stroke={focused ? '#c77830' : 'none'}
                                      strokeWidth="1.4"
                                    />
                                  )}
                                </g>
                              );
                            })}
                          </g>
                        );
                      })}
                      {previewHere &&
                        isDrums &&
                        editable &&
                        inputDrumNote &&
                        (() => {
                          const index = fragments.findIndex(
                            ({ note, offset, beats }) =>
                              note.id === selected &&
                              emptyBeat >= barStart + offset &&
                              emptyBeat < barStart + offset + beats,
                          );
                          const fragment = fragments[index];
                          const containsPitch =
                            fragment &&
                            !fragment.note.rest &&
                            !fragment.note.blank &&
                            noteTones(fragment.note).some(
                              (tone) => tone.pitch === inputDrumNote.tone.pitch,
                            );
                          if (containsPitch) return null;
                          const direction = drumPair
                            ? part === drumPair[0]
                              ? -1
                              : 1
                            : scoreStemDirection([staffY(inputDrumNote.tone.pitch)]);
                          return (
                            <DrumInputPreview
                              note={inputDrumNote}
                              x={previewX}
                              direction={direction}
                            />
                          );
                        })()}
                      {previewHere &&
                        hasTab &&
                        (!selected || indexed.notes.get(selected)?.blank) && (
                          <rect
                            data-tab-input-preview="true"
                            x={previewX - 12}
                            y={tabTop + (selectedString - 1) * tabSpacing - tabSpacing / 2}
                            width={24}
                            height={tabSpacing}
                            rx={2}
                            fill="#cbd5e1"
                            fillOpacity=".65"
                            stroke="#7b8794"
                            pointerEvents="none"
                          />
                        )}
                      {renderStaff &&
                        previewHere &&
                        (!hasTab || inputPreview) &&
                        !isDrums &&
                        (inputPreview || !selected || indexed.notes.get(selected)?.blank) && (
                          <KeyboardInputPreview
                            x={previewX}
                            y={inputY(inputPitch ?? 60)}
                            beats={inputBeats}
                          />
                        )}
                      {fragments.map(({ note, offset }, index) => {
                        if (note.graceBeats === undefined) return null;
                        const group = fragments.filter(
                          (f) => f.offset === offset && f.note.graceBeats !== undefined,
                        );
                        const remaining =
                          group.length - group.findIndex((f) => f.note.id === note.id);
                        const graceX =
                          xAt(offset) -
                          graceOffset(
                            fragments,
                            fragments[index],
                            tuning,
                            score.keySignature,
                            hasTab,
                            renderStaff,
                          );
                        const next = fragments[index + 1]?.note;
                        return (
                          <GraceNote
                            key={note.id}
                            percussion={isDrums}
                            connectionHandled={['hammer', 'pull'].includes(
                              note.connection?.type ?? '',
                            )}
                            note={note}
                            x={graceX}
                            nextX={remaining === 1 ? xAt(offset) : graceX + GRACE_SPACING}
                            tabOnly={!renderStaff}
                            tabSpacing={tabSpacing}
                            nextY={
                              renderStaff
                                ? toneY(
                                    noteTones(next ?? note)[0] ?? {
                                      pitch: next?.pitch ?? note.pitch,
                                    },
                                  )
                                : 0
                            }
                            nextNote={next}
                            staffY={staffY}
                            tuning={tuning}
                            tabTop={hasTab ? tabTop : undefined}
                            selected={selected === note.id}
                            fifths={score.keySignature}
                            onSelect={(row) => onSelect(note.id, row, barStart + offset)}
                          />
                        );
                      })}
                    </g>
                  );
                })}
                {connectionSpans.map(({ from, targetId, label }) => {
                  const partNotes = indexed.partNotes.get(part) ?? [];
                  const first = partNotes.indexOf(from),
                    last = partNotes.findIndex((note) => note.id === targetId);
                  if (last <= first) return null;
                  const ids = new Set(partNotes.slice(first, last + 1).map((note) => note.id));
                  const located = bars.flatMap(({ fragments }, column) =>
                    fragments
                      .filter((fragment) => ids.has(fragment.note.id))
                      .map((fragment) => ({
                        ...fragment,
                        engraving: noteLayouts[column][fragments.indexOf(fragment)] ?? {
                          direction: 1 as const,
                          stemEnd: 0,
                        },
                        x:
                          prefix +
                          layouts.slice(0, column).reduce((sum, layout) => sum + layout.width, 0) +
                          layouts[column].xAt(fragment.offset) -
                          graceOffset(
                            fragments,
                            fragment,
                            tuning,
                            score.keySignature,
                            hasTab,
                            renderStaff,
                          ),
                      })),
                  );
                  if (!located.length) return null;
                  const a = located.find(
                    (fragment) => fragment.note.id === from.id && !fragment.continued,
                  );
                  const b = located.find(
                    (fragment) => fragment.note.id === targetId && !fragment.continues,
                  );
                  const x1 = a ? a.x : prefix + 2,
                    x2 = b ? b.x : drawingWidth - 5;
                  const side = scoreConnectionSide(
                    located.map((f) =>
                      f.note.graceBeats !== undefined ? -1 : f.engraving.direction,
                    ),
                  );
                  const edge = (ys: number[], direction: -1 | 1) =>
                    direction === -1 ? Math.min(...ys) : Math.max(...ys);
                  const staffPoints = !renderStaff
                    ? []
                    : located.map(({ x, note, engraving }, index) => {
                        const sameSide = engraving.direction === side;
                        const endpoint = index === 0 || index === located.length - 1;
                        return {
                          x: x + (sameSide && endpoint ? (index === 0 ? 8 : -8) : 0),
                          y: edge(
                            [
                              ...noteTones(note).map((tone) => toneY(tone)),
                              ...(!endpoint && sameSide ? [engraving.stemEnd] : []),
                            ],
                            side,
                          ),
                        };
                      });
                  const tabSide = scoreConnectionSide(
                    located.map((f) => (f.note.graceBeats !== undefined ? -1 : 1)),
                  );
                  const tabPoints = located.map(({ x, note }) => ({
                    x,
                    y: edge(
                      tabTones(note, tuning).map(
                        (tone) => tabTop + ((tone.string ?? 1) - 1) * tabSpacing,
                      ),
                      tabSide,
                    ),
                  }));
                  const extend = (points: { x: number; y: number }[]) => [
                    ...(!a ? [{ x: x1, y: points[0].y }] : []),
                    ...points,
                    ...(!b ? [{ x: x2, y: points.at(-1)!.y }] : []),
                  ];
                  const staffArc = renderStaff
                    ? scoreConnectionArc(extend(staffPoints), side)
                    : null;
                  const tabArc = hasTab ? scoreConnectionArc(extend(tabPoints), tabSide) : null;
                  return (
                    <g
                      key={`${label ?? 'slur'}/${from.id}`}
                      data-hammer-pull={label}
                      pointerEvents="none"
                      fill="#385f4a"
                      stroke="none"
                    >
                      {staffArc && (
                        <path
                          aria-label={label ? `${label} 오선 연결` : '이음줄(슬러)'}
                          data-connection-side={side === -1 ? 'above' : 'below'}
                          d={staffArc.d}
                        />
                      )}
                      {hasTab && (
                        <path
                          aria-label={label ? `${label} TAB 연결` : 'TAB 이음줄(슬러)'}
                          data-connection-side={tabSide === -1 ? 'above' : 'below'}
                          d={tabArc!.d}
                        />
                      )}
                      {label &&
                        [...(staffArc ? [staffArc] : []), ...(tabArc ? [tabArc] : [])].map(
                          (arc, i) => (
                            <text
                              key={i}
                              data-hammer-pull-label={label}
                              x={arc.labelX}
                              y={arc.labelY}
                              textAnchor="middle"
                              dominantBaseline="central"
                              fontSize="10"
                              paintOrder="stroke"
                              stroke="var(--score-paper-color, #fffefb)"
                              strokeWidth="3"
                            >
                              {label}
                            </text>
                          ),
                        )}
                    </g>
                  );
                })}
                {(drumPair ?? [part])
                  .flatMap((voice) => scoreTupletGroups(indexed.partNotes.get(voice) ?? []))
                  .map((group) => {
                    const located = bars.flatMap(({ fragments }, column) =>
                      fragments
                        .filter((f) => group.some((note) => note.id === f.note.id))
                        .map((fragment) => ({
                          ...fragment,
                          x:
                            prefix +
                            layouts
                              .slice(0, column)
                              .reduce((sum, layout) => sum + layout.width, 0) +
                            layouts[column].xAt(fragment.offset),
                        })),
                    );
                    if (!located.length) return null;
                    const x1 = located[0].x - 8,
                      x2 = located.at(-1)!.x + 12;
                    const y = !renderStaff
                      ? 0
                      : drumPair && group[0].part === drumPair[1]
                        ? 171
                        : Math.min(
                            ...located.flatMap(({ note }) =>
                              note.rest ? [82] : noteTones(note).map((tone) => toneY(tone)),
                            ),
                          ) - 53;
                    return (
                      <g
                        key={`tuplet/${group[0].id}`}
                        opacity={voiceOpacity(group[0].part)}
                        pointerEvents="none"
                        aria-label="셋잇단음표 묶음"
                      >
                        {[
                          ...(renderStaff ? [y] : []),
                          ...(hasTab ? [tabTop + (tuning.length - 1) * tabSpacing + 23] : []),
                        ].map((top, i) => (
                          <g
                            key={i}
                            aria-label={!renderStaff || i ? 'TAB 셋잇단음표' : '오선 셋잇단음표'}
                          >
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
                        ))}
                      </g>
                    );
                  })}
                {connectedNotes.map((from) => {
                  const connection = from.connection!;
                  const to = indexed.notes.get(connection.targetId);
                  if (!to) return null;
                  const located = bars.flatMap(({ fragments }, column) =>
                    fragments.map((fragment, index) => ({
                      ...fragment,
                      engraving: noteLayouts[column][index] ?? {
                        direction: 1 as const,
                        stemEnd: 0,
                      },
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
                  const side = !renderStaff
                    ? 1
                    : scoreConnectionSide([
                        a?.engraving.direction ??
                          scoreStemDirection(noteTones(from).map((t) => toneY(t))),
                        b?.engraving.direction ??
                          scoreStemDirection(noteTones(to).map((t) => toneY(t))),
                      ]);
                  const staffEdge = (note: typeof from) =>
                    side === -1
                      ? Math.min(...noteTones(note).map((t) => toneY(t)))
                      : Math.max(...noteTones(note).map((t) => toneY(t)));
                  const staffFrom = renderStaff ? staffEdge(from) : 0,
                    staffTo = renderStaff ? staffEdge(to) : 0;
                  const surfaces = [
                    ...(renderStaff
                      ? [
                          {
                            key: 'staff',
                            y1: staffFrom,
                            y2: staffTo,
                            side,
                            inset1: noteTones(from).some((tone) => tone.ghost) ? 16 : 7,
                            inset2: noteTones(to).some((tone) => tone.ghost) ? 16 : 8,
                          },
                        ]
                      : []),
                    ...(hasTab
                      ? fromTones.map((tone) => ({
                          key: `tab-${tone.string}`,
                          inset1:
                            scoreTabLabel(
                              tone.fret,
                              tone.dead,
                              !!tone.ghost || !!a?.continued || tieTargets.has(from.id),
                              tone.harmonic === 'natural',
                            ).halfWidth + 2,
                          inset2:
                            scoreTabLabel(
                              toTones[0]?.fret,
                              toTones[0]?.dead,
                              !!toTones[0]?.ghost || tieTargets.has(to.id),
                              toTones[0]?.harmonic === 'natural',
                            ).halfWidth + 2,
                          side: scoreConnectionSide([1, 1]),
                          y1: tabTop + ((tone.string ?? 1) - 1) * tabSpacing,
                          y2:
                            tabTop +
                            ((toTones.find((t) => t.pitch === tone.pitch)?.string ??
                              toTones[0]?.string ??
                              1) -
                              1) *
                              tabSpacing,
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
                            {
                              x: x1 + (key === 'staff' && a?.engraving.direction === side ? 8 : 0),
                              y: a ? y1 : y2,
                            },
                            {
                              x: x2 - (key === 'staff' && b?.engraving.direction === side ? 8 : 0),
                              y: b ? y2 : y1,
                            },
                          ],
                          side,
                        );
                        return (
                          <g
                            key={key}
                            aria-label={key === 'staff' ? '오선 연결 곡선' : 'TAB 연결 곡선'}
                            data-connection-side={side === -1 ? 'above' : 'below'}
                          >
                            {(connection.type === 'glissando' || connection.type === 'slide') &&
                              x2 - (b ? inset2 : 0) > x1 + (a ? inset1 : 0) && (
                                <path
                                  aria-label={`${scoreConnectionLabels[connection.type]} 사선`}
                                  fill="none"
                                  stroke="#385f4a"
                                  strokeWidth="1.5"
                                  strokeLinecap="round"
                                  d={`M${x1 + (a ? inset1 : 0)} ${(a ? y1 : y2) + (key !== 'staff' ? Math.sign(to.pitch - from.pitch) * 5 : 0)}L${x2 - (b ? inset2 : 0)} ${(b ? y2 : y1) - (key !== 'staff' ? Math.sign(to.pitch - from.pitch) * 5 : 0)}`}
                                />
                              )}
                            {connection.type !== 'glissando' && <path d={arc.d} />}
                            {connection.type !== 'tie' && (
                              <text
                                x={connection.type === 'glissando' ? (x1 + x2) / 2 : arc.labelX}
                                y={
                                  connection.type === 'glissando'
                                    ? Math.min(y1, y2) - 13
                                    : arc.labelY
                                }
                                fill="#385f4a"
                                fontSize="10"
                                fontStyle={
                                  connection.type === 'slide' || connection.type === 'glissando'
                                    ? 'italic'
                                    : undefined
                                }
                                textAnchor="middle"
                                dominantBaseline="central"
                                paintOrder="stroke"
                                stroke="var(--score-paper-color, #fffefb)"
                                strokeWidth="3"
                              >
                                {connection.type === 'hammer'
                                  ? 'H'
                                  : connection.type === 'pull'
                                    ? 'P'
                                    : 'sl.'}
                              </text>
                            )}
                          </g>
                        );
                      })}
                    </g>
                  );
                })}
                {bars.flatMap(({ fragments }, column) =>
                  fragments.flatMap((fragment, index) =>
                    (['slideIn', 'slideOut'] as const).map((edge) => {
                      const { note, continues, continued } = fragment;
                      const entering = edge === 'slideIn';
                      if (
                        !note[edge] ||
                        note.rest ||
                        note.blank ||
                        (entering ? continued : continues)
                      )
                        return null;
                      const baseX =
                        prefix +
                        layouts.slice(0, column).reduce((sum, layout) => sum + layout.width, 0);
                      const x = baseX + layouts[column].xAt(fragment.offset);
                      const next = fragments[index + 1];
                      const end = Math.min(
                        x + 32,
                        next
                          ? baseX + layouts[column].xAt(next.offset) - 8
                          : baseX + layouts[column].width - 3,
                      );
                      const direction = note[edge] === 'up' ? -1 : 1;
                      const positions = [
                        ...(renderStaff
                          ? [
                              {
                                y: staffY(note.pitch),
                                inset: noteTones(note).some((tone) => tone.ghost) ? 16 : 8,
                              },
                            ]
                          : []),
                        ...(hasTab
                          ? tabTones(note, tuning).map((tone) => ({
                              y: tabTop + ((tone.string ?? 1) - 1) * tabSpacing,
                              inset:
                                scoreTabLabel(
                                  tone.fret,
                                  tone.dead,
                                  !!tone.ghost || continued || tieTargets.has(note.id),
                                  tone.harmonic === 'natural',
                                ).halfWidth + 2,
                            }))
                          : []),
                      ];
                      return (
                        <g
                          key={edge + '/' + note.id}
                          data-slide-edge={edge}
                          aria-label={`슬라이드 ${entering ? '인' : '아웃'} ${note[edge] === 'up' ? '위로' : '아래로'}`}
                          pointerEvents="none"
                          fill="none"
                          stroke="#385f4a"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                        >
                          {positions.map(({ y, inset }, i) =>
                            entering ? (
                              <path
                                key={i}
                                d={scoreSlidePath(x - inset - 24, y - direction * 14, x - inset, y)}
                              />
                            ) : (
                              end > x + inset && (
                                <path
                                  key={i}
                                  d={scoreSlidePath(x + inset, y, end, y + direction * 14)}
                                />
                              )
                            ),
                          )}
                        </g>
                      );
                    }),
                  ),
                )}
              </svg>
            )}
          </ScoreSystemViewport>
        );
      })}
    </div>
  );
}
