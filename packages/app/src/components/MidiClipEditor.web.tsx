import {
  useEffect,
  useRef,
  useState,
  type SetStateAction,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { createPortal } from 'react-dom';
import { clientId } from '../lib/clientId';
import type { MidiNote, MidiSequence } from '../lib/midi';
import type { SoundfontInstrumentId } from '../lib/soundfontCatalog';
import { prepareSoundfontInstrument } from '../lib/soundfont.web';
import { scheduleScoreNote } from '../lib/scoreAudio.web';
import { useUndoState } from '../lib/useUndoState';
import { useMarquee } from '../lib/useMarquee.web';

export function MidiClipEditor({
  name,
  sequence,
  bpm,
  instrument = 'acoustic_grand_piano',
  onClose,
  onSave,
}: {
  name: string;
  sequence: MidiSequence;
  bpm: number;
  instrument?: SoundfontInstrumentId;
  onClose: () => void;
  onSave: (sequence: MidiSequence) => void;
}) {
  const previewContext = useRef<AudioContext | null>(null);
  const previewOutput = useRef<GainNode | null>(null);
  const previewRequest = useRef(0);
  const [previewError, setPreviewError] = useState('');
  const preview = (pitch: number, velocity: number) => {
    const request = ++previewRequest.current;
    void (async () => {
      const context = previewContext.current ?? new AudioContext();
      previewContext.current = context;
      await context.resume();
      const bank = await prepareSoundfontInstrument(instrument, [pitch]);
      if (request !== previewRequest.current || previewContext.current !== context) return;
      previewOutput.current?.disconnect();
      const output = context.createGain();
      output.gain.value = (velocity / 127) * 0.7;
      output.connect(context.destination);
      previewOutput.current = output;
      scheduleScoreNote(
        context,
        output,
        {
          id: 'midi-preview',
          part: 'MIDI',
          pitch,
          beats: 0.7,
          rest: false,
          accent: false,
          chord: '',
          lyric: '',
        },
        context.currentTime + 0.01,
        120,
        0.7,
        bank,
      );
      setPreviewError('');
    })().catch(() => {
      if (request === previewRequest.current)
        setPreviewError('음표 미리듣기를 재생하지 못했어요. 음표를 다시 눌러주세요.');
    });
  };
  const dialog = useRef<HTMLDialogElement>(null);
  const initialSequence = useRef(sequence);
  const rollRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const scrollFrame = useRef<number | null>(null);
  const suppressCreateClick = useRef(false);
  const pan = useRef<{ pointerId: number; clientX: number; clientY: number } | null>(null);
  const [drawing, setDrawing] = useState(false);
  const gesture = useRef<{
    pointerId: number;
    mode: 'move' | 'create' | 'resize-start' | 'resize-end';
    note: MidiNote;
    group: MidiNote[];
    x: number;
    y: number;
    clientX: number;
    clientY: number;
    previewPitch: number;
  } | null>(null);
  const [edit, setEdit, history] = useUndoState({
    notes: sequence.notes.map((note) => ({ ...note })),
    length: Math.max(sequence.duration, (60 / bpm) * 4),
  });
  const notes = edit.notes;
  const length = edit.length;
  const setNotes = (value: SetStateAction<MidiNote[]>) =>
    setEdit((current) => ({
      ...current,
      notes: typeof value === 'function' ? value(current.notes) : value,
    }));
  const setLength = (value: SetStateAction<number>) =>
    setEdit((current) => ({
      ...current,
      length: typeof value === 'function' ? value(current.length) : value,
    }));
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const setSelectedId = (id: string | null) => setSelectedIds(id ? [id] : []);
  const selectionBase = useRef<string[]>([]);
  const marquee = useMarquee(
    rollRef,
    '[data-selection-id]',
    (ids, additive) =>
      setSelectedIds(additive ? [...new Set([...selectionBase.current, ...ids])] : ids),
    54,
  );
  const [clipboard, setClipboard] = useState<MidiNote[]>([]);
  const [cell, setCell] = useState<{ start: number; pitch: number } | null>(null);
  const cellPress = useRef<{
    x: number;
    y: number;
    start: number;
    pitch: number;
    moved: boolean;
  } | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    const element = dialog.current!;
    const previous = document.activeElement as HTMLElement | null;
    element.showModal();
    const roll = element.querySelector<HTMLDivElement>('.studio-midi-roll')!;
    const pitches = initialSequence.current.notes.map((note) => note.pitch);
    const highest = 127;
    const center = pitches.length ? (Math.min(...pitches) + Math.max(...pitches)) / 2 : 60;
    roll.scrollTop = Math.max(0, (highest - center) * 16 + 24 - roll.clientHeight / 2);
    return () => {
      if (scrollFrame.current !== null) cancelAnimationFrame(scrollFrame.current);
      previewRequest.current = -1;
      previewOutput.current?.disconnect();
      previewOutput.current = null;
      void previewContext.current?.close();
      previewContext.current = null;
      element.close();
      previous?.focus();
    };
  }, []);
  const beat = 60 / bpm,
    pixels = 48,
    row = 16;
  const low = 0;
  const high = 127;
  const end = Math.max(length, ...notes.map((note) => note.start + note.duration));
  const width = Math.max(768, Math.ceil(end / beat) * pixels);
  const height = (high - low + 1) * row;
  const selectedNotes = notes.filter((note) => selectedIds.includes(note.id));
  const selected = selectedNotes.length === 1 ? selectedNotes[0] : undefined;
  const displayNote = selected ?? { pitch: 60, start: 0, duration: beat, velocity: 100 };
  const add = (start = 0, pitch = 60) => {
    if (notes.length >= 2000) {
      setError('한 클립에는 2,000개까지 음표를 추가할 수 있어요.');
      return;
    }
    const note: MidiNote = {
      id: clientId(),
      pitch,
      start: Math.min(600 - beat, start),
      duration: beat,
      velocity: 100,
      channel: 0,
    };
    setNotes((all) => [...all, note]);
    preview(note.pitch, note.velocity);
    return note;
  };
  const point = (event: ReactPointerEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left - 54, y: event.clientY - rect.top - 24 };
  };
  const beginGesture = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (event.button !== 0 || gesture.current || pan.current) return;
    suppressCreateClick.current = false;
    const { x, y } = point(event);
    if (x < 0 || y < 0) {
      if (event.pointerType === 'touch') {
        event.preventDefault();
        pan.current = {
          pointerId: event.pointerId,
          clientX: event.clientX,
          clientY: event.clientY,
        };
        event.currentTarget.setPointerCapture(event.pointerId);
      }
      return;
    }
    if (y >= height) return;
    const target = event.target as SVGElement;
    const existing = notes.find((note) => note.id === target.dataset.noteId);
    if (!existing && !drawing) {
      if (!event.ctrlKey && !event.metaKey) setSelectedId(null);
      selectionBase.current = selectedIds;
      cellPress.current = {
        x: event.clientX,
        y: event.clientY,
        start: Math.max(0, Math.min(599.99, Math.floor(x / pixels) * beat)),
        pitch: high - Math.floor(y / row),
        moved: false,
      };
      if (!marquee.start(event) && event.pointerType === 'touch') {
        event.preventDefault();
        pan.current = {
          pointerId: event.pointerId,
          clientX: event.clientX,
          clientY: event.clientY,
        };
        event.currentTarget.setPointerCapture(event.pointerId);
      }
      return;
    }
    if (existing && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      setSelectedIds((ids) =>
        ids.includes(existing.id) ? ids.filter((id) => id !== existing.id) : [...ids, existing.id],
      );
      preview(existing.pitch, existing.velocity);
      return;
    }
    history.begin();
    const note =
      existing ?? add(Math.max(0, Math.floor(x / pixels) * beat), high - Math.floor(y / row));
    if (!note) {
      history.end();
      return;
    }
    event.preventDefault();
    let mode: 'move' | 'create' | 'resize-start' | 'resize-end' = existing ? 'move' : 'create';
    if (existing) {
      const left = (existing.start / beat) * pixels;
      const noteWidth = Math.max(4, (existing.duration / beat) * pixels);
      const handle = Math.min(event.pointerType === 'touch' ? 12 : 7, noteWidth / 3);
      if (x - left <= handle) mode = 'resize-start';
      else if (left + noteWidth - x <= handle) mode = 'resize-end';
    }
    if (!existing) setSelectedId(null);
    else if (!selectedIds.includes(note.id)) setSelectedId(note.id);
    if (existing) preview(note.pitch, note.velocity);
    gesture.current = {
      pointerId: event.pointerId,
      mode,
      note: { ...note },
      group:
        existing && mode === 'move' && selectedIds.includes(note.id)
          ? selectedNotes.map((item) => ({ ...item }))
          : [{ ...note }],
      x,
      y,
      clientX: event.clientX,
      clientY: event.clientY,
      previewPitch: note.pitch,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    scrollFrame.current = requestAnimationFrame(autoScroll);
  };
  const updateGesture = (x: number, y: number) => {
    const current = gesture.current;
    if (!current) return;
    if (Math.abs(x - current.x) < 4 && Math.abs(y - current.y) < 4) return;
    const next = { ...current.note };
    if (current.mode === 'move') {
      const delta = Math.max(
        -Math.min(...current.group.map((note) => note.start)),
        Math.min(
          600 - Math.max(...current.group.map((note) => note.start + note.duration)),
          (Math.round((x - current.x) / (pixels / 4)) * beat) / 4,
        ),
      );
      const pitchDelta = Math.max(
        -Math.min(...current.group.map((note) => note.pitch)),
        Math.min(
          127 - Math.max(...current.group.map((note) => note.pitch)),
          -Math.round((y - current.y) / row),
        ),
      );
      next.start = current.note.start + delta;
      next.pitch = current.note.pitch + pitchDelta;
    } else if (current.mode === 'resize-start' || current.mode === 'resize-end') {
      const step = beat / 4;
      const delta = Math.round((x - current.x) / (pixels / 4)) * step;
      const end = current.note.start + current.note.duration;
      const minimum = Math.min(step, current.note.duration);
      if (current.mode === 'resize-start') {
        next.start = Math.max(0, Math.min(end - minimum, current.note.start + delta));
        next.duration = end - next.start;
      } else {
        next.duration = Math.max(
          minimum,
          Math.min(600 - next.start, current.note.duration + delta),
        );
      }
    } else {
      const endpoint = Math.max(0, Math.min(600, Math.round(x / pixels) * beat));
      next.start = Math.min(current.note.start, endpoint);
      next.duration = Math.min(
        600 - next.start,
        Math.max(beat, Math.abs(endpoint - current.note.start)),
      );
    }
    if (next.pitch !== current.previewPitch) {
      current.previewPitch = next.pitch;
      preview(next.pitch, next.velocity);
    }
    setNotes((all) =>
      all.map((note) => {
        if (current.mode === 'move') {
          const original = current.group.find((item) => item.id === note.id);
          return original
            ? {
                ...original,
                start: original.start + next.start - current.note.start,
                pitch: original.pitch + next.pitch - current.note.pitch,
              }
            : note;
        }
        return note.id === next.id ? next : note;
      }),
    );
  };
  const moveGesture = (event: ReactPointerEvent<SVGSVGElement>) => {
    marquee.move(event);
    if (
      cellPress.current &&
      Math.hypot(event.clientX - cellPress.current.x, event.clientY - cellPress.current.y) > 4
    )
      cellPress.current.moved = true;
    const dragging = pan.current;
    if (dragging && dragging.pointerId === event.pointerId) {
      const roll = rollRef.current;
      if (roll) {
        roll.scrollLeft += dragging.clientX - event.clientX;
        roll.scrollTop += dragging.clientY - event.clientY;
      }
      dragging.clientX = event.clientX;
      dragging.clientY = event.clientY;
      return;
    }
    const current = gesture.current;
    if (!current || current.pointerId !== event.pointerId) return;
    current.clientX = event.clientX;
    current.clientY = event.clientY;
    const { x, y } = point(event);
    updateGesture(x, y);
  };
  const autoScroll = () => {
    const current = gesture.current;
    const roll = rollRef.current;
    const svg = svgRef.current;
    if (!current || !roll || !svg) return;
    const bounds = roll.getBoundingClientRect();
    const edge = 40;
    const speed = (position: number, min: number, max: number) =>
      position < min + edge
        ? -Math.min(18, (min + edge - position) / 3)
        : position > max - edge
          ? Math.min(18, (position - max + edge) / 3)
          : 0;
    const dx = speed(current.clientX, bounds.left, bounds.right);
    const dy = speed(current.clientY, bounds.top + 24, bounds.bottom);
    if (dx > 0 && roll.scrollLeft + roll.clientWidth >= roll.scrollWidth - edge) {
      setLength((value) =>
        Math.min(600, Math.max(value, ((roll.scrollWidth - 54) / pixels) * beat) + beat * 4),
      );
    }
    roll.scrollLeft += dx;
    roll.scrollTop += dy;
    if (dx || dy) {
      const rect = svg.getBoundingClientRect();
      updateGesture(current.clientX - rect.left - 54, current.clientY - rect.top - 24);
    }
    scrollFrame.current = requestAnimationFrame(autoScroll);
  };
  const finishGesture = (event: ReactPointerEvent<SVGSVGElement>, cancel = false) => {
    marquee.finish(event);
    const pressed = cellPress.current;
    cellPress.current = null;
    if (pressed && !pressed.moved && !cancel) {
      setCell({ start: pressed.start, pitch: pressed.pitch });
      preview(pressed.pitch, 100);
    }
    if (pan.current?.pointerId === event.pointerId) {
      pan.current = null;
      if (event.currentTarget.hasPointerCapture(event.pointerId))
        event.currentTarget.releasePointerCapture(event.pointerId);
      return;
    }
    const current = gesture.current;
    if (!current || current.pointerId !== event.pointerId) return;
    if (cancel) {
      setNotes((all) =>
        current.mode === 'create'
          ? all.filter((note) => note.id !== current.note.id)
          : all.map((note) => current.group.find((item) => item.id === note.id) ?? note),
      );
      if (current.mode === 'create') setSelectedId(null);
    }
    suppressCreateClick.current = current.mode === 'create';
    if (cancel) history.cancel();
    else history.end();
    gesture.current = null;
    if (scrollFrame.current !== null) cancelAnimationFrame(scrollFrame.current);
    scrollFrame.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
  };
  const patch = (field: 'pitch' | 'start' | 'duration' | 'velocity', value: number) => {
    if (!selected || !Number.isFinite(value)) return;
    const next = { ...selected, [field]: value };
    next.pitch = Math.max(0, Math.min(127, Math.round(next.pitch)));
    next.velocity = Math.max(1, Math.min(127, Math.round(next.velocity)));
    next.start = Math.max(0, Math.min(599.99, next.start));
    next.duration = Math.max(0.01, Math.min(600 - next.start, next.duration));
    if (field === 'pitch' && next.pitch !== selected.pitch) preview(next.pitch, next.velocity);
    setNotes((all) => all.map((note) => (note.id === next.id ? next : note)));
  };
  const copyNotes = () => setClipboard(selectedNotes.map((note) => ({ ...note })));
  const pasteNotes = () => {
    if (!cell) return;
    if (notes.length + clipboard.length > 2000) {
      setError('한 클립에는 2,000개까지 음표를 추가할 수 있어요.');
      return;
    }
    const first = Math.min(...clipboard.map((note) => note.start));
    const root = [...clipboard].sort((a, b) => a.start - b.start || a.pitch - b.pitch)[0].pitch;
    const pitchDelta = Math.max(
      -Math.min(...clipboard.map((note) => note.pitch)),
      Math.min(127 - Math.max(...clipboard.map((note) => note.pitch)), cell.pitch - root),
    );
    const span = Math.max(...clipboard.map((note) => note.start + note.duration)) - first;
    const start = Math.min(cell.start, 600 - span);
    const copies = clipboard.map((note) => ({
      ...note,
      id: clientId(),
      start: start + note.start - first,
      pitch: note.pitch + pitchDelta,
    }));
    setNotes((all) => [...all, ...copies]);
    setSelectedIds(copies.map((note) => note.id));
    preview(copies[0].pitch, copies[0].velocity);
  };
  const pitchName = (pitch: number) =>
    ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'][pitch % 12] +
    (Math.floor(pitch / 12) - 1);
  return createPortal(
    <dialog
      className="studio-midi-editor"
      ref={dialog}
      aria-labelledby="midi-editor-title"
      onKeyDown={(event) => {
        if (event.repeat || gesture.current) return;
        if ((event.target as Element).closest('input, textarea, select, [contenteditable="true"]'))
          return;
        if (event.key === 'Delete' && !event.ctrlKey && !event.metaKey && selectedNotes.length) {
          event.preventDefault();
          event.stopPropagation();
          setNotes((all) => all.filter((note) => !selectedIds.includes(note.id)));
          setSelectedId(null);
          return;
        }
        if (!(event.ctrlKey || event.metaKey) || event.shiftKey) return;
        const key = event.key.toLowerCase();
        if ((key === 'c' || key === 'x') && selectedNotes.length) {
          event.preventDefault();
          event.stopPropagation();
          copyNotes();
          if (key === 'x') {
            setNotes((all) => all.filter((note) => !selectedIds.includes(note.id)));
            setSelectedId(null);
          }
        }
        if (key === 'v' && clipboard.length && cell) {
          event.preventDefault();
          event.stopPropagation();
          pasteNotes();
        }
        if (key === 'z' && history.canUndo) {
          event.preventDefault();
          event.stopPropagation();
          history.undo();
          setSelectedId(null);
        }
      }}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <header>
        <h2 id="midi-editor-title">미디 악보 편집 · {name}</h2>
        <button autoFocus onClick={onClose} aria-label="미디 악보 편집 닫기">
          닫기
        </button>
      </header>
      <p>
        음표 추가를 켜고 빈 칸을 클릭하거나 드래그해 음표를 그리세요. 기존 음표를 누르면 상세 정보를
        확인하고 드래그해 이동할 수 있어요.
      </p>
      <div className="studio-midi-controls">
        <button
          aria-pressed={drawing}
          onClick={() => {
            setDrawing((value) => !value);
            setSelectedId(null);
          }}
          style={
            drawing
              ? { background: '#9fd1b0', color: '#20382a', borderColor: '#9fd1b0' }
              : undefined
          }
        >
          + 음표 추가
        </button>
        <button
          disabled={!selectedNotes.length}
          onClick={() => {
            setNotes((all) => all.filter((note) => !selectedIds.includes(note.id)));
            setSelectedId(null);
          }}
        >
          음표 삭제
        </button>
        <button disabled={!selectedNotes.length} onClick={copyNotes}>
          음표 복사하기
        </button>
        <button disabled={!clipboard.length || !cell} onClick={pasteNotes}>
          음표 붙여넣기
        </button>
        {selectedNotes.length > 1 && <span>{selectedNotes.length}개 음표 선택</span>}
        <label>
          클립 길이 (박)
          <input
            type="number"
            min="1"
            max={600 / beat}
            value={Math.round((length / beat) * 100) / 100}
            onChange={(event) => {
              const next = Number(event.target.value);
              if (Number.isFinite(next)) setLength(Math.max(beat, Math.min(600, next * beat)));
            }}
          />
        </label>
        <span>{bpm} BPM</span>
      </div>
      <div className="studio-midi-controls" style={{ visibility: selected ? 'visible' : 'hidden' }}>
        <label>
          음높이 ({pitchName(displayNote.pitch)})
          <input
            aria-label="음높이 MIDI 번호"
            type="number"
            min="0"
            max="127"
            value={displayNote.pitch}
            onChange={(event) => patch('pitch', Number(event.target.value))}
          />
        </label>
        <label>
          시작 박
          <input
            aria-label="음표 시작 박"
            type="number"
            min="0"
            step="0.25"
            value={Math.round((displayNote.start / beat) * 1000) / 1000}
            onChange={(event) => patch('start', Number(event.target.value) * beat)}
          />
        </label>
        <label>
          길이 (박)
          <input
            aria-label="음표 길이 박"
            type="number"
            min="0.01"
            step="0.25"
            value={Math.round((displayNote.duration / beat) * 1000) / 1000}
            onChange={(event) => patch('duration', Number(event.target.value) * beat)}
          />
        </label>
        <label>
          세기
          <input
            aria-label="음표 세기"
            type="number"
            min="1"
            max="127"
            value={displayNote.velocity}
            onChange={(event) => patch('velocity', Number(event.target.value))}
          />
        </label>
      </div>
      <div className="studio-midi-roll" ref={rollRef} style={{ position: 'relative' }}>
        {marquee.box && <div className="studio-selection-box" style={marquee.box} />}
        <div
          className="studio-midi-ruler"
          style={{ width: width + 54, touchAction: 'pan-x pan-y' }}
          aria-hidden="true"
        >
          {Array.from({ length: Math.ceil(width / pixels) + 1 }, (_, index) => (
            <span key={index} style={{ width: pixels }}>
              {index + 1}
            </span>
          ))}
        </div>
        <svg
          ref={svgRef}
          style={{
            display: 'block',
            marginTop: -24,
            touchAction: 'none',
            userSelect: 'none',
            cursor: drawing ? 'crosshair' : 'default',
          }}
          width={width + 54}
          height={height + 24}
          role="group"
          aria-label="미디 피아노 롤"
          onPointerDown={beginGesture}
          onPointerMove={moveGesture}
          onPointerUp={(event) => finishGesture(event)}
          onPointerCancel={(event) => finishGesture(event, true)}
          onLostPointerCapture={(event) => finishGesture(event, true)}
        >
          {Array.from({ length: high - low + 1 }, (_, i) => (
            <g key={i}>
              <rect
                x="54"
                y={24 + i * row}
                width={width}
                height={row}
                fill={[1, 3, 6, 8, 10].includes((high - i) % 12) ? '#26322e' : '#34443c'}
                stroke="#4a5a51"
              />
              <text x="4" y={36 + i * row} fill="#dbe8df" fontSize="10">
                {pitchName(high - i)}
              </text>
            </g>
          ))}
          {Array.from({ length: Math.ceil(width / pixels) + 1 }, (_, i) => (
            <g key={i}>
              <line
                x1={54 + i * pixels}
                x2={54 + i * pixels}
                y1="24"
                y2={height + 24}
                stroke={i % 4 ? '#51645a' : '#9baea0'}
              />
              <text x={58 + i * pixels} y="16" fill="#e2eee5" fontSize="10">
                {i + 1}
              </text>
            </g>
          ))}
          {cell && (
            <rect
              x={54 + (cell.start / beat) * pixels}
              y={24 + (high - cell.pitch) * row}
              width={pixels}
              height={row}
              fill="none"
              stroke="#c8e1d1"
              strokeWidth="2"
              pointerEvents="none"
            />
          )}
          {notes.map((note) => (
            <rect
              key={note.id}
              data-note-id={note.id}
              data-selection-id={note.id}
              style={{ touchAction: 'none', cursor: 'move' }}
              onPointerMove={(event) => {
                if (gesture.current) return;
                const rect = event.currentTarget.getBoundingClientRect();
                const handle = Math.min(event.pointerType === 'touch' ? 12 : 7, rect.width / 3);
                const offset = event.clientX - rect.left;
                event.currentTarget.style.cursor =
                  offset <= handle || rect.width - offset <= handle ? 'ew-resize' : 'move';
              }}
              role="button"
              tabIndex={0}
              aria-label={`${pitchName(note.pitch)}, ${Math.round((note.start / beat) * 100) / 100}박 시작`}
              x={54 + (note.start / beat) * pixels}
              y={24 + (high - note.pitch) * row + 2}
              width={Math.max(4, (note.duration / beat) * pixels)}
              height={row - 4}
              rx="3"
              fill={selectedIds.includes(note.id) ? '#f4d890' : '#9fd1b0'}
              stroke="#20382a"
              onClick={(event) => {
                event.stopPropagation();
                if (suppressCreateClick.current) return;
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  setSelectedId(note.id);
                  preview(note.pitch, note.velocity);
                }
                if (event.key === 'Backspace') {
                  event.preventDefault();
                  setNotes((all) =>
                    all.filter((item) => !selectedIds.includes(item.id) && item.id !== note.id),
                  );
                  setSelectedId(null);
                }
              }}
            />
          ))}
        </svg>
      </div>
      {error && <p role="alert">{error}</p>}
      {previewError && <p role="status">{previewError}</p>}
      <footer>
        <button onClick={onClose}>취소</button>
        <button onClick={() => onSave({ notes, duration: end })}>클립에 적용</button>
      </footer>
    </dialog>,
    document.body,
  );
}
