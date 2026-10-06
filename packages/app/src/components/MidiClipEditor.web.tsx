import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { clientId } from '../lib/clientId';
import type { MidiNote, MidiSequence } from '../lib/midi';

export function MidiClipEditor({
  name,
  sequence,
  bpm,
  onClose,
  onSave,
}: {
  name: string;
  sequence: MidiSequence;
  bpm: number;
  onClose: () => void;
  onSave: (sequence: MidiSequence) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const initialSequence = useRef(sequence);
  const rollRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const scrollFrame = useRef<number | null>(null);
  const suppressCreateClick = useRef(false);
  const [drawing, setDrawing] = useState(false);
  const gesture = useRef<{
    pointerId: number;
    mode: 'move' | 'create';
    note: MidiNote;
    x: number;
    y: number;
    clientX: number;
    clientY: number;
  } | null>(null);
  const [notes, setNotes] = useState(() => sequence.notes.map((note) => ({ ...note })));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [length, setLength] = useState(Math.max(sequence.duration, (60 / bpm) * 4));
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
  const selected = notes.find((note) => note.id === selectedId);
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
    return note;
  };
  const point = (event: ReactPointerEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left - 54, y: event.clientY - rect.top - 24 };
  };
  const beginGesture = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (event.button !== 0 || gesture.current) return;
    suppressCreateClick.current = false;
    const { x, y } = point(event);
    if (x < 0 || y < 0 || y >= height) return;
    const target = event.target as SVGElement;
    const existing = notes.find((note) => note.id === target.dataset.noteId);
    if (!existing && !drawing) {
      setSelectedId(null);
      return;
    }
    const note =
      existing ??
      add(Math.max(0, (Math.round(x / (pixels / 4)) * beat) / 4), high - Math.floor(y / row));
    if (!note) return;
    event.preventDefault();
    setSelectedId(existing ? note.id : null);
    gesture.current = {
      pointerId: event.pointerId,
      mode: existing ? 'move' : 'create',
      note: { ...note },
      x,
      y,
      clientX: event.clientX,
      clientY: event.clientY,
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
      next.start = Math.max(
        0,
        Math.min(
          600 - next.duration,
          current.note.start + (Math.round((x - current.x) / (pixels / 4)) * beat) / 4,
        ),
      );
      next.pitch = Math.max(
        0,
        Math.min(127, current.note.pitch - Math.round((y - current.y) / row)),
      );
    } else {
      const endpoint = Math.max(0, Math.min(600, (Math.round(x / (pixels / 4)) * beat) / 4));
      next.start = Math.min(current.note.start, endpoint);
      next.duration = Math.min(
        600 - next.start,
        Math.max(beat / 4, Math.abs(endpoint - current.note.start)),
      );
    }
    setNotes((all) => all.map((note) => (note.id === next.id ? next : note)));
  };
  const moveGesture = (event: ReactPointerEvent<SVGSVGElement>) => {
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
    const current = gesture.current;
    if (!current || current.pointerId !== event.pointerId) return;
    if (cancel) {
      setNotes((all) =>
        current.mode === 'create'
          ? all.filter((note) => note.id !== current.note.id)
          : all.map((note) => (note.id === current.note.id ? current.note : note)),
      );
      if (current.mode === 'create') setSelectedId(null);
    }
    suppressCreateClick.current = current.mode === 'create';
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
    setNotes((all) => all.map((note) => (note.id === next.id ? next : note)));
  };
  const pitchName = (pitch: number) =>
    ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'][pitch % 12] +
    (Math.floor(pitch / 12) - 1);
  return createPortal(
    <dialog
      className="studio-midi-editor"
      ref={dialog}
      aria-labelledby="midi-editor-title"
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
          disabled={!selected}
          onClick={() => {
            setNotes((all) => all.filter((note) => note.id !== selectedId));
            setSelectedId(null);
          }}
        >
          음표 삭제
        </button>
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
      <div className="studio-midi-roll" ref={rollRef}>
        <div className="studio-midi-ruler" style={{ width: width + 54 }} aria-hidden="true">
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
            touchAction: drawing ? 'none' : 'pan-x pan-y',
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
          {notes.map((note) => (
            <rect
              key={note.id}
              data-note-id={note.id}
              style={{ touchAction: 'none' }}
              role="button"
              tabIndex={0}
              aria-label={`${pitchName(note.pitch)}, ${Math.round((note.start / beat) * 100) / 100}박 시작`}
              x={54 + (note.start / beat) * pixels}
              y={24 + (high - note.pitch) * row + 2}
              width={Math.max(4, (note.duration / beat) * pixels)}
              height={row - 4}
              rx="3"
              fill={note.id === selectedId ? '#f4d890' : '#9fd1b0'}
              stroke="#20382a"
              onClick={(event) => {
                event.stopPropagation();
                if (suppressCreateClick.current) return;
                setSelectedId(note.id);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  setSelectedId(note.id);
                }
                if (event.key === 'Delete' || event.key === 'Backspace') {
                  event.preventDefault();
                  setNotes((all) => all.filter((item) => item.id !== note.id));
                }
              }}
            />
          ))}
        </svg>
      </div>
      {error && <p role="alert">{error}</p>}
      <footer>
        <button onClick={onClose}>취소</button>
        <button onClick={() => onSave({ notes, duration: end })}>클립에 적용</button>
      </footer>
    </dialog>,
    document.body,
  );
}
