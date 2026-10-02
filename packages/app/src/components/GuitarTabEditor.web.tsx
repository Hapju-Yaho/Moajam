import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { GuitarStaff } from './GuitarStaff.web';
import {
  insertScoreNote,
  pasteScoreNotes,
  readScoreClipboard,
  appendScoreNoteAt,
  noteTones,
  pitchName,
  removeScoreNotes,
  removeScoreString,
  deleteScorePosition,
  scoreInstrument,
  scoreInstruments,
  setScoreFret,
  setScoreDuration,
  setScoreDotted,
  setScoreDurations,
  setScoreArticulation,
  setScoreToneArticulation,
  selectedScoreTone,
  moveScoreNote,
  scoreSystemRows,
  moveScoreMeasureToRow,
  scorePlaybackBeats,
  DOTTED_SCORE_BEATS,
  scoreMeasureCount,
  setScoreBeatChord,
  scoreChordPositions,
  copyScoreNotes,
  setScoreConnection,
  scoreConnectionLabels,
  type ScoreConnectionType,
  type ScoreClipboardNote,
  type Score,
  type ScoreNote,
} from '../lib/score';
import './GuitarTabEditor.web.css';

const lengths = [
  { value: 4, label: '온음표', glyph: '𝅝' },
  { value: 2, label: '2분음표', glyph: '𝅗𝅥' },
  { value: 1, label: '4분음표', glyph: '♩' },
  { value: 0.5, label: '8분음표', glyph: '♪' },
  { value: 0.25, label: '16분음표', glyph: '♬' },
  { value: 0.125, label: '32분음표 · 1/8박', glyph: '𝅘𝅥𝅰' },
  { value: 0.0625, label: '64분음표 · 1/16박', glyph: '𝅘𝅥𝅱' },
];
export function GuitarTabEditor({
  score,
  part,
  selected,
  cursor,
  playbackBeat,
  playing,
  loaded,
  onEdit,
  onSelect,
  onPlay,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  volume,
  onVolumeChange,
  clipboard,
  onCopy,
  onEditComplete,
  onAudition,
}: {
  score: Score;
  part: string;
  selected: string | null;
  cursor: string | null;
  playbackBeat: number | null;
  playing: boolean;
  loaded: boolean;
  onEdit: (score: Score, group?: string) => void;
  onEditComplete: () => void;
  onAudition: (note: ScoreNote) => void;
  onSelect: (id: string | null) => void;
  onPlay: (from?: number) => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  volume: number;
  onVolumeChange: (value: number) => void;
  clipboard: ScoreClipboardNote[];
  onCopy: (notes: ScoreClipboardNote[]) => void;
}) {
  const [string, setString] = useState(1),
    [beats, setBeats] = useState(1);
  const [fret, setFret] = useState('0'),
    [pitch, setPitch] = useState(60);
  const [zoom, setZoom] = useState(100),
    [showTab, setShowTab] = useState(true);
  const [message, setMessage] = useState('');
  const [measureMenu, setMeasureMenu] = useState<{ line: number; x: number; y: number } | null>(
    null,
  );
  const menuButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!measureMenu) return;
    menuButton.current?.focus();
    const close = () => setMeasureMenu(null);
    const key = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        close();
        editor.current?.focus({ preventScroll: true });
      }
    };
    window.addEventListener('pointerdown', close);
    window.addEventListener('scroll', close, true);
    window.addEventListener('keydown', key);
    return () => {
      window.removeEventListener('pointerdown', close);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('keydown', key);
    };
  }, [measureMenu]);
  const [range, setRange] = useState<{ anchor: string; end: string } | null>(null);
  const [selectedAt, setSelectedAt] = useState<{ id: string; beat: number } | null>(null);
  const [emptyBeat, setEmptyBeat] = useState<number | null>(null);
  const [articulation, setArticulation] = useState({ staccato: false, ghost: false });
  const endBeat = score.notes
    .filter((item) => item.part === part)
    .reduce((sum, item) => sum + item.beats, 0);
  const audibleVolume = useRef(volume || 0.8);
  const editor = useRef<HTMLDivElement>(null);
  const measureChordInput = useRef<HTMLInputElement>(null);
  const digits = useRef<{ id: string; string: number; value: string; time: number } | null>(null);
  const instrument = scoreInstrument(score, part);
  const rows = score.notes.filter((note) => note.part === part);
  const chordPositions = scoreChordPositions(score, part);
  const note = rows.find((item) => item.id === selected);
  const rangeStart = range ? rows.findIndex((item) => item.id === range.anchor) : -1;
  const rangeEnd = range ? rows.findIndex((item) => item.id === range.end) : -1;
  const rangeNotes =
    rangeStart >= 0 && rangeEnd >= 0
      ? rows.slice(Math.min(rangeStart, rangeEnd), Math.max(rangeStart, rangeEnd) + 1)
      : [];
  const copiedSelection = rangeNotes.length ? rangeNotes : note ? [note] : [];
  const copiedNotes = copyScoreNotes(
    score,
    part,
    copiedSelection.map((item) => item.id),
  );
  const multiple = rangeNotes.length > 1;
  const soundingSelection = copiedSelection.filter((item) => !item.rest && !item.blank);
  const activeString = Math.min(
    string,
    instrument.tuning.length || (note ? noteTones(note).length : 1) || 1,
  );
  const selectedTone = note ? selectedScoreTone(score, note, activeString) : undefined;
  const toneSelection = soundingSelection.filter((item) =>
    selectedScoreTone(score, item, activeString),
  );
  const articulationPressed = (key: 'accent' | 'staccato' | 'ghost' | 'dead') =>
    key === 'ghost' || key === 'dead'
      ? toneSelection.length > 0 &&
        toneSelection.every((item) => selectedScoreTone(score, item, activeString)?.[key])
      : soundingSelection.length > 0 && soundingSelection.every((item) => item[key]);
  const selectedBeat = note && !note.blank ? note.beats : beats;
  const dotted = DOTTED_SCORE_BEATS.includes(selectedBeat);
  const base = dotted ? selectedBeat / 1.5 : selectedBeat;
  const noteStart = note
    ? rows.slice(0, rows.indexOf(note)).reduce((sum, item) => sum + item.beats, 0)
    : endBeat;
  const before = note
    ? selectedAt?.id === note.id &&
      selectedAt.beat >= noteStart &&
      selectedAt.beat < noteStart + note.beats
      ? selectedAt.beat
      : noteStart
    : Math.max(endBeat, emptyBeat ?? endBeat);
  const disabled = !loaded || playing;
  const hasSelection = !!note || emptyBeat !== null;
  const playFrom = note || emptyBeat !== null ? before : 0;
  const canPlaySelection = rows.length > 0 && playFrom < scorePlaybackBeats(score, part);
  const focus = () => editor.current?.focus({ preventScroll: true });
  const commit = (next: Score, keepRange = false, group?: string) => {
    if (disabled) return;
    if (next !== score) onEdit(next, group);
    if (!keepRange) setRange(null);
    setMessage('');
  };
  const update = (changes: Partial<ScoreNote>, group?: string) => {
    if (note)
      commit(
        {
          ...score,
          notes: score.notes.map((item) => (item.id === note.id ? { ...item, ...changes } : item)),
        },
        false,
        group,
      );
  };
  const select = (id: string | null, row = activeString, at?: number) => {
    setRange(null);
    setEmptyBeat(id ? null : (at ?? endBeat));
    setSelectedAt(id && at !== undefined ? { id, beat: at } : null);
    onSelect(id);
    setString(row);
    const selectedNote = rows.find((item) => item.id === id);
    if (selectedNote) {
      const tone = selectedScoreTone(score, selectedNote, row);
      setFret(String(tone?.fret ?? 0));
      setPitch(tone?.pitch ?? selectedNote.pitch);
      if (!selectedNote.blank && selectedNote.beats <= 4) setBeats(selectedNote.beats);
    }
    digits.current = null;
    focus();
  };
  const deselect = () => {
    setRange(null);
    onSelect(null);
    setSelectedAt(null);
    setEmptyBeat(null);
    digits.current = null;
    focus();
  };
  const selectChordPosition = (at: number) => {
    let start = 0;
    const target = rows.find((item) => {
      const contains = start <= at && at < start + item.beats;
      start += item.beats;
      return contains;
    });
    select(target?.id ?? null, activeString, at);
    measureChordInput.current?.focus({ preventScroll: true });
  };
  const selectRange = (anchor: string, end: string) => {
    if (disabled) return;
    const first = rows.findIndex((item) => item.id === anchor);
    const last = rows.findIndex((item) => item.id === end);
    if (first < 0 || last < 0) return;
    select(rows[Math.min(first, last)].id);
    setRange({ anchor, end });
  };
  const copySelection = (writeToSystem = false) => {
    if (!copiedSelection.length) return;
    onCopy(copiedNotes);
    setMessage(
      `${copiedSelection.length}개 박을 복사했어요. 붙여넣을 위치를 선택하고 Ctrl+V를 누르세요.`,
    );
    if (writeToSystem) {
      const text = JSON.stringify({ type: 'moajam-score', version: 1, notes: copiedNotes });
      void navigator.clipboard?.writeText(text).catch(() => {
        setMessage(
          '구간을 복사했어요. 브라우저가 클립보드 접근을 제한하면 붙여넣기 버튼을 이용해주세요.',
        );
      });
    }
    focus();
  };
  const pasteSelection = (copied = clipboard) => {
    if (disabled || !copied.length || !hasSelection) return;
    try {
      const result = pasteScoreNotes(
        score,
        part,
        copied,
        note && !note.blank ? noteStart : before,
        () => crypto.randomUUID(),
      );
      commit(result.score);
      onSelect(result.ids[0]);
      setSelectedAt(null);
      setEmptyBeat(null);
      setRange({ anchor: result.ids[0], end: result.ids.at(-1)! });
      setMessage(`${result.ids.length}개 박을 붙여넣었어요. 뒤의 음표는 그만큼 뒤로 이동했어요.`);
      digits.current = null;
      focus();
    } catch (error) {
      setMessage((error as Error).message);
    }
  };
  const toggleArticulation = (key: 'staccato' | 'ghost') => {
    if (disabled) return;
    if (copiedSelection.some((item) => !item.blank))
      commit(
        key === 'ghost'
          ? setScoreToneArticulation(
              score,
              copiedSelection.map((item) => item.id),
              activeString,
              key,
            )
          : setScoreArticulation(
              score,
              copiedSelection.map((item) => item.id),
              key,
            ),
        true,
      );
    else setArticulation((current) => ({ ...current, [key]: !current[key] }));
    focus();
  };
  const connectNotes = (type: ScoreConnectionType | null) => {
    if (disabled) return;
    try {
      commit(
        setScoreConnection(
          score,
          copiedSelection.map((n) => n.id),
          type,
        ),
        true,
      );
    } catch (error) {
      setMessage((error as Error).message);
    }
    focus();
  };
  const create = (rest = true): ScoreNote => ({
    id: crypto.randomUUID(),
    part,
    pitch,
    beats,
    rest,
    blank: rest,
    chord: '',
    lyric: '',
    accent: false,
    ...articulation,
  });
  const inputFret = (value: number, digit?: string) => {
    if (disabled) return;
    if (multiple) {
      setMessage('프렛을 입력하려면 한 박을 선택해주세요.');
      return;
    }
    try {
      const item = note ?? create();
      const next = prepareInput(item);
      const fretted = setScoreFret(next, item.id, activeString, value);
      const entered = {
        ...fretted,
        notes: fretted.notes.map((entry) =>
          entry.id === item.id ? { ...entry, dead: false } : entry,
        ),
      };
      const result =
        !note || note.blank
          ? {
              ...entered,
              notes: entered.notes.map((entry) =>
                entry.id === item.id
                  ? {
                      ...entry,
                      staccato: articulation.staccato,
                      ghost: false,
                      tones: entry.tones?.map((tone) =>
                        tone.string === activeString
                          ? { ...tone, ghost: articulation.ghost }
                          : tone,
                      ),
                    }
                  : entry,
              ),
            }
          : entered;
      commit(result);
      const changed = result.notes.find((entry) => entry.id === item.id)!;
      const tone = selectedScoreTone(result, changed, activeString);
      if (tone) onAudition({ ...changed, pitch: tone.pitch, tones: [tone] });
      onSelect(item.id);
      setFret(String(value));
      digits.current =
        digit === undefined
          ? null
          : { id: item.id, string: activeString, value: digit, time: Date.now() };
      focus();
    } catch (error) {
      setMessage((error as Error).message);
    }
  };
  const prepareInput = (item: ScoreNote) =>
    note?.blank
      ? setScoreDuration(score, note.id, beats, () => crypto.randomUUID(), before - noteStart)
      : note
        ? score
        : appendScoreNoteAt(score, item, before, () => crypto.randomUUID());
  const toggleDeadNote = () => {
    if (disabled || !hasSelection) return;
    if (multiple || selectedTone) {
      commit(
        setScoreToneArticulation(
          score,
          copiedSelection.map((item) => item.id),
          activeString,
          'dead',
        ),
        true,
      );
    } else {
      try {
        const item = note ?? create();
        const prepared = prepareInput(item);
        const entered = instrument.tuning.length
          ? setScoreFret(prepared, item.id, activeString, 0)
          : prepared;
        commit(
          setScoreToneArticulation(
            {
              ...entered,
              notes: entered.notes.map((entry) =>
                entry.id === item.id
                  ? {
                      ...entry,
                      dead: false,
                      ghost: false,
                      rest: false,
                      blank: false,
                      tones: instrument.tuning.length ? entry.tones : [{ pitch }],
                    }
                  : entry,
              ),
            },
            [item.id],
            activeString,
            'dead',
          ),
        );
        onSelect(item.id);
      } catch (error) {
        setMessage((error as Error).message);
      }
    }
    digits.current = null;
    focus();
  };
  const inputPitchOrRest = (asRest: boolean) => {
    if (multiple) {
      setMessage('음정을 입력하려면 한 박을 선택해주세요.');
      return;
    }
    try {
      const item = note ?? create();
      const next = prepareInput(item);
      const result = {
        ...next,
        notes: next.notes.map((entry) =>
          entry.id === item.id
            ? {
                ...entry,
                pitch,
                tones: asRest ? [] : [{ pitch }],
                rest: asRest,
                blank: false,
                dead: false,
                ...((!note || note.blank) && !asRest ? articulation : {}),
              }
            : entry,
        ),
      };
      commit(result);
      if (!asRest) onAudition(result.notes.find((entry) => entry.id === item.id)!);
      onSelect(item.id);
      digits.current = null;
      focus();
    } catch (error) {
      setMessage((error as Error).message);
    }
  };
  const duration = (value: number) => {
    try {
      if (multiple) {
        commit(
          setScoreDurations(
            score,
            rangeNotes.map((item) => item.id),
            value,
            () => crypto.randomUUID(),
          ),
          true,
        );
        setSelectedAt(null);
      } else if (note && !note.blank && note.beats !== value) {
        commit(setScoreDuration(score, note.id, value, () => crypto.randomUUID()));
        setSelectedAt(null);
      }
      setBeats(value);
      setMessage('');
    } catch (error) {
      setMessage((error as Error).message);
    }
    digits.current = null;
    focus();
  };
  const toggleDot = () => {
    if (disabled || base < 0.125 || base > 4) return;
    try {
      if (note && !note.blank)
        commit(
          setScoreDotted(
            score,
            copiedSelection.map((item) => item.id),
            !dotted,
          ),
          multiple,
        );
      setBeats(dotted ? base : base * 1.5);
      setSelectedAt(null);
      setMessage('');
    } catch (error) {
      setMessage((error as Error).message);
    }
    digits.current = null;
    focus();
  };
  const insert = (item: ScoreNote) => {
    if (multiple) {
      setMessage('빈 박을 삽입할 위치를 한 박만 선택해주세요.');
      return;
    }
    try {
      commit(
        note
          ? insertScoreNote(score, item, selected)
          : appendScoreNoteAt(score, item, before, () => crypto.randomUUID()),
      );
      onSelect(item.id);
      digits.current = null;
      focus();
    } catch (error) {
      setMessage((error as Error).message);
    }
  };
  const rest = () => {
    if (multiple) {
      const asRest = !rangeNotes.every((item) => item.rest && !item.blank);
      const ids = new Set(rangeNotes.map((item) => item.id));
      commit(
        {
          ...score,
          notes: score.notes.map((item) =>
            ids.has(item.id) ? { ...item, rest: asRest, blank: false } : item,
          ),
        },
        true,
      );
    } else if (!note || note.blank) inputPitchOrRest(true);
    else update({ rest: !note.rest, blank: false });
    focus();
  };
  const navigate = (direction: number) => {
    if (note) {
      const index = rows.indexOf(note);
      const next = index + direction;
      if (next < 0) return;
      select(rows[next]?.id ?? null);
    } else if (direction < 0 && before <= endBeat) {
      if (rows.length) select(rows.at(-1)!.id);
    } else
      select(
        null,
        activeString,
        Math.max(endBeat, Math.min(endBeat + 64, before + direction * Math.min(1, beats))),
      );
  };
  const measureCount = Math.max(
    scoreMeasureCount(score, part),
    hasSelection ? Math.floor(before / 4) + 1 : 1,
  );
  const measure = Math.min(measureCount - 1, Math.floor(before / 4));
  const systems = scoreSystemRows(score, part, measureCount);
  const lineIndex = systems.findIndex(
    (row) => measure >= row.start && measure < row.start + row.count,
  );
  const canMoveNext = hasSelection && measure > systems[lineIndex].start;
  const canMovePrevious =
    hasSelection &&
    lineIndex > 0 &&
    systems[lineIndex - 1].capacity + measure - systems[lineIndex].start + 1 <= 16;
  const moveMeasure = (direction: -1 | 1) => {
    const next = moveScoreMeasureToRow(score, part, measure, direction, measureCount);
    if (next !== score) commit(next);
    focus();
  };
  const addMeasure = () => {
    try {
      const firstBeat = measureCount * 4;
      const item = { ...create(), beats: 1 };
      const next = appendScoreNoteAt(score, item, firstBeat + 3, () => crypto.randomUUID());
      let at = 0;
      const first = next.notes
        .filter((note) => note.part === part)
        .find((note) => {
          const matches = at === firstBeat;
          at += note.beats;
          return matches;
        });
      commit(next);
      onSelect(first?.id ?? item.id);
      setSelectedAt(null);
      focus();
    } catch (error) {
      setMessage((error as Error).message);
    }
  };
  const keys = (event: KeyboardEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    if (
      target.closest('input,select,textarea,button,a') ||
      event.nativeEvent.isComposing ||
      event.altKey
    )
      return;
    const ctrl = event.ctrlKey || event.metaKey;
    if (ctrl && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      if (!disabled) {
        if (event.shiftKey) onRedo();
        else onUndo();
      }
      return;
    }
    if (ctrl && event.key.toLowerCase() === 'y') {
      event.preventDefault();
      if (!disabled) onRedo();
      return;
    }
    if (event.code === 'Space') {
      event.preventDefault();
      if (loaded && (playing || canPlaySelection)) onPlay(playFrom);
      return;
    }
    if (disabled || ctrl) return;
    const connectionKey = ({ h: 'hammer', p: 'pull', j: 'slide', t: 'tie' } as const)[
      event.key.toLowerCase() as 'h'
    ];
    if (connectionKey) {
      event.preventDefault();
      connectNotes(connectionKey);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      deselect();
    } else if (event.key === 'PageUp' || event.key === 'PageDown') {
      event.preventDefault();
      moveMeasure(event.key === 'PageUp' ? -1 : 1);
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      if (event.shiftKey && note) {
        const anchor = range?.anchor ?? note.id;
        const edge = rows.findIndex((item) => item.id === (range?.end ?? note.id));
        const next = Math.max(
          0,
          Math.min(rows.length - 1, edge + (event.key === 'ArrowRight' ? 1 : -1)),
        );
        selectRange(anchor, rows[next].id);
      } else navigate(event.key === 'ArrowRight' ? 1 : -1);
    } else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault();
      select(
        selected,
        Math.max(
          1,
          Math.min(
            instrument.tuning.length || 1,
            activeString + (event.key === 'ArrowDown' ? 1 : -1),
          ),
        ),
        before,
      );
      digits.current = null;
    } else if (/^\d$/.test(event.key) && instrument.tuning.length) {
      event.preventDefault();
      const previous = digits.current;
      const combined =
        previous &&
        previous.id === note?.id &&
        previous.string === activeString &&
        Date.now() - previous.time < 900
          ? previous.value + event.key
          : event.key;
      const text = Number(combined) <= 24 && combined.length <= 2 ? combined : event.key;
      inputFret(Number(text), text);
    } else if (
      ['+', '=', '-', '[', ']'].includes(event.key) ||
      ['BracketLeft', 'BracketRight'].includes(event.code)
    ) {
      event.preventDefault();
      const index = Math.max(
        0,
        lengths.findIndex((item) => item.value === base),
      );
      duration(
        lengths[
          Math.max(
            0,
            Math.min(
              lengths.length - 1,
              index +
                (event.key === '-' || event.key === '[' || event.code === 'BracketLeft' ? -1 : 1),
            ),
          )
        ].value,
      );
    } else if (event.key === '.') {
      event.preventDefault();
      toggleDot();
    } else if (event.key.toLowerCase() === 'x') {
      event.preventDefault();
      toggleDeadNote();
    } else if (event.key.toLowerCase() === 's' || event.key.toLowerCase() === 'o') {
      event.preventDefault();
      toggleArticulation(event.key.toLowerCase() === 's' ? 'staccato' : 'ghost');
    } else if (event.key.toLowerCase() === 'r') {
      event.preventDefault();
      rest();
    } else if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      if (note) {
        if (multiple) {
          commit(
            removeScoreNotes(
              score,
              rangeNotes.map((item) => item.id),
            ),
          );
          deselect();
        } else if (!event.shiftKey)
          commit(
            deleteScorePosition(
              score,
              note.id,
              instrument.tuning.length ? activeString : undefined,
            ),
          );
        else {
          commit(removeScoreNotes(score, [note.id]));
          onSelect(null);
        }
      } else if (hasSelection && !event.shiftKey) inputPitchOrRest(true);
    } else if (event.key === 'Insert') {
      event.preventDefault();
      insert(create());
    }
  };
  return (
    <div
      className="guitar-editor"
      onCopy={(event) => {
        if (
          (event.target as HTMLElement).closest('input,textarea,[contenteditable="true"]') ||
          !copiedSelection.length
        )
          return;
        event.preventDefault();
        const text = JSON.stringify({ type: 'moajam-score', version: 1, notes: copiedNotes });
        event.clipboardData.setData('text/plain', text);
        copySelection();
      }}
      onPaste={(event) => {
        if ((event.target as HTMLElement).closest('input,textarea,[contenteditable="true"]'))
          return;
        event.preventDefault();
        if (disabled) return;
        const copied = readScoreClipboard(event.clipboardData.getData('text/plain'));
        if (copied) {
          onCopy(copied);
          pasteSelection(copied);
        } else setMessage('악보에서 복사한 구간을 붙여넣어주세요.');
      }}
      ref={editor}
      tabIndex={0}
      role="region"
      aria-label="TAB 악보 입력 영역"
      onKeyDown={keys}
    >
      <div className="guitar-toolbar">
        <button
          className="score-play"
          disabled={!loaded || (!playing && !canPlaySelection)}
          onClick={() => {
            onPlay(playFrom);
            focus();
          }}
        >
          {playing ? '■ 정지' : '▶ 선택 위치부터'}
        </button>
        <button
          disabled={disabled || !rows.length}
          onClick={() => {
            onPlay(0);
            focus();
          }}
        >
          처음부터
        </button>
        <label className="score-bpm">
          BPM
          <input
            key={score.bpm}
            aria-label="악보 BPM"
            type="number"
            min="30"
            max="300"
            step="1"
            defaultValue={score.bpm}
            disabled={disabled}
            onBlur={(event) => {
              const raw = Number(event.currentTarget.value);
              const bpm =
                event.currentTarget.value.trim() && Number.isFinite(raw)
                  ? Math.max(30, Math.min(300, Math.round(raw)))
                  : score.bpm;
              event.currentTarget.value = String(bpm);
              if (bpm !== score.bpm) commit({ ...score, bpm });
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === 'Escape') {
                event.preventDefault();
                if (event.key === 'Escape') event.currentTarget.value = String(score.bpm);
                event.currentTarget.blur();
                focus();
              }
            }}
          />
        </label>
        <button
          aria-label="악보 실행 취소"
          disabled={!canUndo || disabled}
          onClick={() => {
            onUndo();
            focus();
          }}
        >
          ↶
        </button>
        <button
          aria-label="악보 다시 실행"
          disabled={!canRedo || disabled}
          onClick={() => {
            onRedo();
            focus();
          }}
        >
          ↷
        </button>
        <span className="score-divider" />
        <button
          aria-label="선택 구간 복사"
          disabled={!copiedSelection.length}
          onClick={() => copySelection(true)}
          title="Ctrl+C"
        >
          복사
        </button>
        <button
          aria-label="선택 위치에 붙여넣기"
          disabled={disabled || !clipboard.length || !hasSelection}
          onClick={() => pasteSelection()}
          title="Ctrl+V · 선택 위치에 삽입"
        >
          붙여넣기
        </button>
        {lengths.map((length) => (
          <button
            key={length.value}
            className="note-length"
            aria-label={length.label}
            title={length.label}
            aria-pressed={base === length.value}
            disabled={disabled}
            onClick={() => duration(length.value)}
          >
            <b>{length.glyph}</b>
            <small>
              {length.value === 0.125 ? '1/8' : length.value === 0.0625 ? '1/16' : length.value}박
            </small>
          </button>
        ))}
        <button
          aria-label="점음표"
          aria-pressed={dotted}
          title="점음표 · 원래 길이의 절반을 더함 (.)"
          disabled={disabled || base < 0.125 || base > 4}
          onClick={toggleDot}
        >
          • 점
        </button>
        <button aria-pressed={!!note?.rest && !note.blank} disabled={disabled} onClick={rest}>
          𝄽 쉼표
        </button>
        <button
          disabled={disabled || !soundingSelection.length}
          aria-pressed={articulationPressed('accent')}
          onClick={() => {
            commit(
              setScoreArticulation(
                score,
                copiedSelection.map((item) => item.id),
                'accent',
              ),
              true,
            );
            focus();
          }}
        >
          &gt; 악센트
        </button>
        <button
          disabled={
            disabled || (multiple ? !soundingSelection.length : !!note?.rest && !note.blank)
          }
          aria-label="스타카토"
          title="스타카토 · S · 같은 박의 모든 음을 짧게 끊어 연주"
          aria-pressed={
            multiple
              ? articulationPressed('staccato')
              : note && !note.blank
                ? !!note.staccato
                : articulation.staccato
          }
          onClick={() => toggleArticulation('staccato')}
        >
          • 스타카토
        </button>
        <button
          disabled={disabled || !hasSelection || (multiple && !toneSelection.length)}
          aria-label="데드노트 (뮤트)"
          title="데드노트 · X · 선택한 음만 뮤트"
          aria-pressed={articulationPressed('dead')}
          onClick={toggleDeadNote}
        >
          X 데드노트
        </button>
        <button
          disabled={
            disabled || (multiple ? !toneSelection.length : !!note && !note.blank && !selectedTone)
          }
          aria-label="고스트노트 (약하게)"
          title="고스트노트 · O · 선택한 음만 약하게 연주하고 괄호로 표시"
          aria-pressed={
            multiple
              ? articulationPressed('ghost')
              : note && !note.blank
                ? !!selectedTone?.ghost
                : articulation.ghost
          }
          onClick={() => toggleArticulation('ghost')}
        >
          ( ) 고스트노트
        </button>
        <div className="score-volume">
          <button
            aria-label={volume === 0 ? '악보 음소거 해제' : '악보 음소거'}
            onClick={() => {
              if (volume > 0) {
                audibleVolume.current = volume;
                onVolumeChange(0);
              } else onVolumeChange(audibleVolume.current);
            }}
            disabled={!loaded}
          >
            {volume === 0 ? '음소거 해제' : '음소거'}
          </button>
          <input
            type="range"
            aria-label="악보 재생 음량"
            min="0"
            max="1"
            step="0.01"
            value={volume}
            aria-valuetext={`${Math.round(volume * 100)}%`}
            disabled={!loaded}
            onChange={(event) => {
              const value = Number(event.target.value);
              if (value > 0) audibleVolume.current = value;
              onVolumeChange(value);
            }}
          />
          <output>{Math.round(volume * 100)}%</output>
        </div>
        <div className="score-zoom">
          <button aria-label="악보 축소" onClick={() => setZoom(Math.max(60, zoom - 10))}>
            −
          </button>
          <span>{zoom}%</span>
          <button aria-label="악보 확대" onClick={() => setZoom(Math.min(160, zoom + 10))}>
            +
          </button>
        </div>
      </div>
      <div className="guitar-inputbar">
        <span>음표 연결</span>
        {(Object.entries(scoreConnectionLabels) as [ScoreConnectionType, string][]).map(
          ([type, label]) => (
            <button
              key={type}
              disabled={disabled || !note || copiedSelection.length > 2}
              aria-label={label}
              aria-pressed={copiedSelection[0]?.connection?.type === type}
              title={`${label} · ${{ hammer: 'H', pull: 'P', slide: 'J', tie: 'T' }[type]} · 다시 누르면 해제`}
              onClick={() => connectNotes(type)}
            >
              {label}
            </button>
          ),
        )}
        <button
          disabled={disabled || !copiedSelection[0]?.connection || copiedSelection.length > 2}
          onClick={() => connectNotes(null)}
        >
          연결 해제
        </button>
        <small>첫 음표 → 다음 음표 연결 · 두 음표 선택도 가능</small>
      </div>
      <div className="guitar-inputbar">
        <label>
          악기{' '}
          <select
            aria-label="파트 악기와 튜닝"
            value={instrument.id}
            disabled={disabled}
            onChange={(event) => {
              commit({
                ...score,
                instruments: { ...score.instruments, [part]: event.target.value },
              });
              digits.current = null;
              setString(1);
            }}
          >
            {Object.entries(scoreInstruments).map(([id, item]) => (
              <option key={id} value={id}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        {instrument.tuning.length ? (
          <>
            <label>
              줄{' '}
              <select
                aria-label="입력할 줄"
                value={activeString}
                onChange={(event) => {
                  select(selected, Number(event.target.value), before);
                }}
              >
                {instrument.tuning.map((open, index) => (
                  <option key={index} value={index + 1}>
                    {index + 1}번 · {pitchName(open)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              프렛{' '}
              <input
                aria-label="입력 프렛"
                type="number"
                min="0"
                max="24"
                value={fret}
                onChange={(event) => setFret(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') inputFret(Number(fret));
                }}
              />
            </label>
            <button
              disabled={disabled || multiple || fret === ''}
              onClick={() => inputFret(Number(fret))}
            >
              프렛 입력
            </button>
            <label className="score-check">
              <input
                type="checkbox"
                checked={showTab}
                onChange={(event) => setShowTab(event.target.checked)}
              />
              TAB 표시
            </label>
          </>
        ) : (
          <>
            <label>
              음정{' '}
              <select
                aria-label="입력 음정"
                value={pitch}
                onChange={(event) => setPitch(Number(event.target.value))}
              >
                {Array.from({ length: 73 }, (_, i) => i + 24).map((p) => (
                  <option key={p} value={p}>
                    {pitchName(p)}
                  </option>
                ))}
              </select>
            </label>
            <button
              disabled={disabled}
              onClick={() => {
                inputPitchOrRest(false);
              }}
            >
              음정 입력
            </button>
          </>
        )}
        <button disabled={disabled || multiple} onClick={() => insert(create())}>
          빈 박 삽입
        </button>
        <button
          disabled={disabled || score.notes.length >= 2000}
          onClick={() => {
            const used = rows.reduce((sum, item) => sum + item.beats, 0) % 4;
            const item = { ...create(), blank: false, beats: used ? 4 - used : 4 };
            commit(insertScoreNote(score, item));
            select(item.id);
          }}
        >
          쉼표로 마디 채우기
        </button>
        <button disabled={disabled || score.notes.length >= 2000} onClick={addMeasure}>
          마디 추가
        </button>
        <button disabled={disabled} onClick={() => select(null)}>
          맨 끝에 입력
        </button>
      </div>
      <div className="guitar-location">
        <div className="score-measure-nav" role="group" aria-label="마디 줄 배치">
          <button
            disabled={disabled || !canMovePrevious}
            onClick={() => moveMeasure(-1)}
            title="선택 마디까지 이전 줄에 붙이기 · Page Up"
          >
            ↑ 이전 줄로
          </button>
          <button
            disabled={disabled || !canMoveNext}
            onClick={() => moveMeasure(1)}
            title="선택 마디부터 다음 줄에 배치 · Page Down"
          >
            ↓ 다음 줄로
          </button>
          <button
            disabled={disabled || !score.systemLayout?.[part]?.length}
            onClick={() =>
              commit({ ...score, systemLayout: { ...score.systemLayout, [part]: [] } })
            }
          >
            기본 줄 배치
          </button>
        </div>
        <strong>
          {playbackBeat !== null || hasSelection
            ? `${Math.floor((playbackBeat ?? before) / 4) + 1}마디 · ${((playbackBeat ?? before) % 4) + 1}박`
            : '선택 없음'}
        </strong>
        <label className="score-measure-chord-input">
          {hasSelection ? `${measure + 1}마디 ${(before % 4) + 1}박 코드` : '박 위치 코드'}
          <input
            ref={measureChordInput}
            aria-label="선택 위치 코드"
            placeholder="예: Am7, D/F♯"
            maxLength={40}
            value={hasSelection ? (chordPositions[before] ?? '') : ''}
            disabled={disabled || !hasSelection}
            onChange={(event) =>
              commit(
                setScoreBeatChord(score, part, before, event.target.value),
                false,
                `chord/${part}/${before}`,
              )
            }
            onBlur={onEditComplete}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                focus();
              }
            }}
          />
        </label>
        <label>
          코드 위치{' '}
          <select
            aria-label="코드 박 위치"
            disabled={disabled || !hasSelection}
            value={before % 4}
            onChange={(event) => selectChordPosition(measure * 4 + Number(event.target.value))}
          >
            {[...new Set([0, 1, 2, 3, before % 4])]
              .sort((a, b) => a - b)
              .map((offset) => (
                <option key={offset} value={offset}>
                  {offset + 1}박
                </option>
              ))}
          </select>
        </label>
        <span>
          {instrument.tuning.length ? `${activeString}번 줄 · ` : ''}
          {note
            ? `${selectedBeat}박 ${note.blank ? '입력 예정' : '길이'} · ${
                note.blank
                  ? '빈 박'
                  : note.rest
                    ? '쉼표'
                    : noteTones(note)
                        .map((tone) => pitchName(tone.pitch))
                        .join(' / ')
              }`
            : hasSelection
              ? '빈 박 · 숫자로 입력'
              : '칸을 클릭해 선택하세요'}
        </span>
        <span>4/4 · ♩ = {score.bpm}</span>
      </div>
      <div className="score-range-status" role="status">
        {multiple
          ? `${rangeNotes.length}개 박 선택 · ${rangeNotes.reduce((sum, item) => sum + item.beats, 0)}박 길이 · 모든 줄 포함`
          : '악보의 칸을 선택해 음표를 입력하세요. 드래그하면 여러 박을 선택할 수 있어요.'}
        <button onClick={deselect} style={{ visibility: multiple ? 'visible' : 'hidden' }}>
          선택 해제
        </button>
      </div>
      <div className="score-workspace">
        <div className="score-page">
          <header>
            <span>MOAJAM SCORE</span>
            <h2>{score.title || '제목 없는 악보'}</h2>
            <p>
              {part} · {instrument.label}
            </p>
            {instrument.tuning.length > 0 && (
              <small>
                튜닝 {[...instrument.tuning].reverse().map(pitchName).join(' – ')} · 음높이를
                유지하며 운지를 표시합니다
              </small>
            )}
          </header>
          <GuitarStaff
            onMeasureContextMenu={(bar, x, y) => {
              const line = systems.findIndex(
                (row) => bar >= row.start && bar < row.start + row.count,
              );
              setMeasureMenu({
                line,
                x: Math.max(8, Math.min(x, window.innerWidth - 248)),
                y: Math.max(8, Math.min(y, window.innerHeight - 110)),
              });
            }}
            rangeIds={rangeNotes.map((item) => item.id)}
            onRangeSelect={selectRange}
            editable={!disabled}
            score={score}
            part={part}
            selected={selected}
            hasSelection={hasSelection}
            onDeselect={deselect}
            selectedString={activeString}
            cursor={cursor}
            playbackBeat={playbackBeat}
            zoom={zoom}
            onSelect={select}
            onAppend={(row, at) => select(null, row, at)}
            onChordSelect={selectChordPosition}
            emptyBeat={before}
            inputBeats={selectedBeat}
            showTab={showTab}
          />
        </div>
      </div>
      {measureMenu && !disabled && (
        <div
          className="score-measure-menu"
          role="menu"
          aria-label="마디 줄 너비"
          style={{ left: measureMenu.x, top: measureMenu.y }}
          onPointerDown={(event) => event.stopPropagation()}
          onKeyDown={(event) => {
            event.stopPropagation();
            if (event.key === 'Escape') {
              setMeasureMenu(null);
              focus();
            }
          }}
        >
          {[true, false].map((equal) => (
            <button
              key={String(equal)}
              ref={equal ? menuButton : undefined}
              role="menuitem"
              onClick={() => {
                const rows = new Set(score.equalWidthRows?.[part] ?? []);
                if (equal) rows.add(measureMenu.line);
                else rows.delete(measureMenu.line);
                commit({
                  ...score,
                  equalWidthRows: { ...score.equalWidthRows, [part]: [...rows] },
                });
                setMeasureMenu(null);
                focus();
              }}
            >
              {equal ? '이 줄의 마디 너비 균등하게' : '이 줄의 마디 너비 자동 배분'}
            </button>
          ))}
        </div>
      )}
      <div className="score-note-inspector">
        <strong>
          {multiple
            ? `${rangeNotes.length}개 박 선택 · ${rangeNotes.reduce((sum, item) => sum + item.beats, 0)}박 길이`
            : note
              ? '선택한 박'
              : '새 음표'}
        </strong>
        <label>
          가사{' '}
          <input
            aria-label="선택 음표 가사"
            placeholder="가사"
            value={note?.lyric ?? ''}
            disabled={disabled || !note || multiple}
            onChange={(event) => update({ lyric: event.target.value }, `lyric/${note?.id}`)}
            onBlur={onEditComplete}
          />
        </label>
        <button
          disabled={!copiedSelection.length}
          onClick={() => copySelection(true)}
          title="Ctrl+C · 선택한 박의 모든 줄 복사"
        >
          선택 복사
        </button>
        <button
          disabled={!clipboard.length || disabled || !hasSelection}
          onClick={() => pasteSelection()}
          title="Ctrl+V · 선택 위치 앞에 삽입하고 뒤 음표 이동"
        >
          여기에 붙여넣기
        </button>
        <button
          disabled={disabled || multiple || !note || rows[0]?.id === note.id}
          onClick={() => note && commit(moveScoreNote(score, note.id, -1))}
        >
          앞으로 이동
        </button>
        <button
          disabled={disabled || multiple || !note || rows.at(-1)?.id === note.id}
          onClick={() => note && commit(moveScoreNote(score, note.id, 1))}
        >
          뒤로 이동
        </button>
        <button
          disabled={!note || disabled}
          onClick={() => {
            if (note)
              commit(
                removeScoreNotes(
                  score,
                  copiedSelection.map((item) => item.id),
                ),
              );
            deselect();
          }}
        >
          선택 삭제
        </button>
        {note && !multiple && instrument.tuning.length > 0 && (
          <button
            disabled={disabled}
            onClick={() => commit(removeScoreString(score, note.id, activeString))}
          >
            선택 줄 지우기
          </button>
        )}
      </div>
      {message && (
        <p className="score-message" role="alert">
          {message}
        </p>
      )}
    </div>
  );
}
