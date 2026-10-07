import { createPortal } from 'react-dom';
import { ScoreVoiceIcon } from './ScoreVoiceIcon.web';
import { ScoreToolbarHelp } from './ScoreToolbarHelp.web';
import { ScoreMeasureIcon } from './ScoreMeasureIcon.web';
import { useScoreEditorLayout } from './ScoreEditorLayout.web';
import {
  scoreNaturalPitch,
  nextScoreNaturalPitch,
  deleteScorePitch,
  scoreKeyboardInputAlters,
} from '../lib/score';
import { directionAt, resolveHiHat } from '../lib/scoreExpression';
import {
  guitarToneAt,
  guitarToneLabels,
  setGuitarToneChange,
  type GuitarTone,
} from '../lib/scoreGuitar';
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode,
  type KeyboardEvent,
} from 'react';
import { GuitarStaff } from './GuitarStaff.web';
import type { ScorePlaybackPosition } from '../lib/scorePlaybackDisplay.web';
import { ScoreExpressionTools } from './ScoreExpressionTools.web';
import { DrumNotehead } from './DrumNotehead.web';
import { ScoreConnectionIcon } from './ScoreConnectionIcon.web';
import { ScoreToolButton } from './ScoreToolButton.web';
import { DrumNotationGuide } from './DrumNotationGuide.web';
import {
  inputScoreMeasureRest,
  deleteScoreMeasureRest,
  scoreMeasureRestBars,
  scoreRestSystems,
} from '../lib/scoreMeasureRests';
import { ScoreEnsemble } from './ScoreEnsemble.web';
import {
  enableKeyboardPart,
  enableDrumVoices,
  scorePartStaves,
  scorePartOwner,
  scoreVoiceCursor,
  partInstrumentLabel,
} from '../lib/scoreParts';
import {
  scoreBeat,
  setScoreRhythmSlash,
  scoreRhythmFeels,
  scoreMeasureDuration,
  editScoreMeasure,
  scoreMeasureEntry,
  scoreMeasures,
  appendScoreMeasureNote,
  writtenScoreBeats,
  setScoreTriplet,
  scoreMeasureAtBeat,
  scoreMeasureStart,
  scoreBarBeats,
  scoreTimeSignature,
  setScoreTimeSignature,
  setScoreMeasureWidth,
  setScoreRepeat,
  setScoreSlur,
  scoreHammerPullSelection,
  setScoreHammerPull,
  setScoreSlideOut,
  setScoreSlideIn,
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
  setScoreCapo,
  setScoreGraceNote,
  setScoreDuration,
  setScoreDotted,
  setScoreDurations,
  setScoreArticulation,
  setScoreToneArticulation,
  selectedScoreTone,
  moveScoreNote,
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
import {
  scoreDrums,
  drumAtRow,
  drumLabel,
  setScoreDrum,
  drumTechniques,
  drumArticulations,
  isDrumArticulation,
  type DrumTechnique,
  drumInputRows,
  drumInputRow,
  moveDrumInputRow,
  type DrumInputChoice,
} from '../lib/scoreDrums';

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
  partControls,
  onEnsembleChange,
  settings,
  resetKey,
  ...props
}: Omit<
  ComponentProps<typeof GuitarTabEditorContent>,
  'toolTab' | 'voiceToolsHost' | 'settingsHost' | 'onViewToolsHost'
> & {
  partControls?: ReactNode;
  onEnsembleChange?: (value: boolean) => void;
  settings?: ReactNode;
  resetKey?: string;
}) {
  // Keep shared media mounted while the part-specific editor resets.
  const [toolTab, setToolTab] = useState('notes');
  const [settingsHost, setSettingsHost] = useState<HTMLDivElement | null>(null);
  const [voiceToolsHost, setVoiceToolsHost] = useState<HTMLDivElement | null>(null);
  const [viewToolsHost, setViewToolsHost] = useState<HTMLDivElement | null>(null);
  const layout = useScoreEditorLayout();
  const tabs = [
    ['notes', '음표·주법'],
    ['measures', '마디·표현'],
    ['settings', '악보 설정'],
  ] as const;
  const viewTools = (
    <div className="score-edit-view-tools">
      <div className="score-voice-tools-host" ref={setVoiceToolsHost} />
      {onEnsembleChange && (
        <div className="score-view-switch" role="group" aria-label="악보 보기 방식">
          <button
            type="button"
            aria-pressed={!props.ensemble}
            onClick={() => onEnsembleChange(false)}
          >
            개별 악보
          </button>
          <button
            type="button"
            aria-pressed={!!props.ensemble}
            onClick={() => onEnsembleChange(true)}
          >
            합주 악보
          </button>
        </div>
      )}
    </div>
  );
  return (
    <div className="score-editor-tools-host">
      {partControls}
      <nav className="score-expanded-inspector-tabs" aria-label="사이드 패널">
        <button
          className="score-mobile-inspector-close"
          aria-label="악보로 돌아가기"
          onClick={() => layout.setInspectorOpen(false)}
        >
          ← 악보
        </button>
        {tabs.map(([tab, label]) => (
          <button
            key={tab}
            aria-pressed={toolTab === tab}
            onClick={() => {
              setToolTab(tab);
              layout.setInspector(tab);
              layout.setInspectorOpen(true);
            }}
          >
            {label}
          </button>
        ))}
      </nav>
      <div className="score-edit-toolbar">
        <nav className="score-edit-tabs" aria-label="편집 도구">
          {tabs.map(([id, label]) => (
            <button
              type="button"
              key={id}
              aria-label={label}
              aria-pressed={toolTab === id}
              onClick={() => {
                setToolTab(id);
                layout.setInspector(id);
              }}
            >
              <span className="score-edit-tab-full">{label}</span>
              <span className="score-edit-tab-short">{label}</span>
            </button>
          ))}
        </nav>
        {layout.expanded && viewToolsHost ? createPortal(viewTools, viewToolsHost) : viewTools}
      </div>
      <div
        className="score-editor-backing-settings score-section-body"
        hidden={toolTab !== 'settings'}
      >
        {settings}
        <div className="score-extra-settings" ref={setSettingsHost} />
      </div>
      <GuitarTabEditorContent
        key={resetKey}
        {...props}
        toolTab={toolTab}
        voiceToolsHost={voiceToolsHost}
        settingsHost={settingsHost}
        onViewToolsHost={setViewToolsHost}
      />
    </div>
  );
}

function GuitarTabEditorContent({
  toolTab,
  voiceToolsHost,
  settingsHost,
  onViewToolsHost,
  score,
  part,
  selected,
  cursor,
  playbackBeat,
  playbackPosition,
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
  backingPlayback,
  clipboard,
  onCopy,
  onEditComplete,
  onAudition: auditionNote,
  ensemble = false,
  onPartSelect,
  playAll = false,
  readOnly = false,
}: {
  toolTab: string;
  voiceToolsHost: HTMLDivElement | null;
  settingsHost: HTMLDivElement | null;
  onViewToolsHost: (host: HTMLDivElement | null) => void;
  readOnly?: boolean;
  ensemble?: boolean;
  playAll?: boolean;
  onPartSelect?: (part: string, note?: string) => void;
  score: Score;
  part: string;
  selected: string | null;
  cursor: string | null;
  playbackBeat: number | null;
  playbackPosition?: ScorePlaybackPosition;
  playing: boolean;
  loaded: boolean;
  onEdit: (score: Score, group?: string) => void;
  onEditComplete: () => void;
  onAudition: (note: ScoreNote) => void;
  onSelect: (id: string | null) => void;
  onPlay: (from?: number, loopEnd?: number, repeatAll?: boolean) => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  volume: number;
  onVolumeChange: (value: number) => void;
  backingPlayback?: { enabled: boolean; disabled: boolean; onChange: (enabled: boolean) => void };
  clipboard: ScoreClipboardNote[];
  onCopy: (notes: ScoreClipboardNote[]) => void;
}) {
  const layout = useScoreEditorLayout();
  const renderSettings = (children: ReactNode) =>
    layout.expanded && settingsHost ? createPortal(children, settingsHost) : children;
  const displayParts = ensemble ? score.parts : scorePartStaves(score, part);
  const StaffView =
    ensemble || (displayParts.length > 1 && scoreInstrument(score, part).id !== 'drums')
      ? ScoreEnsemble
      : GuitarStaff;
  const [string, setString] = useState(1),
    [beats, setBeats] = useState(1);
  const [inputTriplet, setInputTriplet] = useState(false);
  const [drumTechnique, setDrumTechnique] = useState<DrumTechnique>('normal');
  const [voiceMultiMode, setVoiceMultiMode] = useState(false);
  const [fret, setFret] = useState('0'),
    [pitch, setPitch] = useState(60);
  const [keyboardInput, setKeyboardInput] = useState<'default' | 'alternate' | number>('default');
  const voicePitches = useRef(new Map<string, number>());
  const [zoom, setZoom] = useState(100),
    [showTab, setShowTab] = useState(true);
  const [message, setMessage] = useState('');
  const [titleDraft, setTitleDraft] = useState<string | null>(null);
  const cancelTitle = useRef(false);
  const titleInput = useRef<HTMLInputElement>(null);
  const editingTitle = titleDraft !== null;
  useEffect(() => {
    if (editingTitle) {
      titleInput.current?.focus({ preventScroll: true });
      titleInput.current?.select();
    }
  }, [editingTitle]);
  const [measureMenu, setMeasureMenu] = useState<{
    line: number;
    bar: number;
    x: number;
    y: number;
  } | null>(null);
  const menuButton = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (!measureMenu || !menu.current) return;
    menu.current.showPopover();
    const bounds = menu.current.getBoundingClientRect();
    menu.current.style.left = `${Math.max(8, Math.min(measureMenu.x, window.innerWidth - bounds.width - 8))}px`;
    menu.current.style.top = `${Math.max(8, Math.min(measureMenu.y, window.innerHeight - bounds.height - 8))}px`;
  }, [measureMenu]);
  useEffect(() => {
    if (!measureMenu) return;
    menuButton.current?.focus({ preventScroll: true });
    const close = () => setMeasureMenu(null);
    const scroll = (event: Event) => {
      if (event.target instanceof Node && menu.current?.contains(event.target)) return;
      close();
    };
    const key = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        close();
        editor.current?.focus({ preventScroll: true });
      }
    };
    window.addEventListener('pointerdown', close);
    window.addEventListener('scroll', scroll, true);
    window.addEventListener('keydown', key);
    return () => {
      window.removeEventListener('pointerdown', close);
      window.removeEventListener('scroll', scroll, true);
      window.removeEventListener('keydown', key);
    };
  }, [measureMenu]);
  const [range, setRange] = useState<{ anchor: string; end: string } | null>(null);
  const [repeatSelection, setRepeatSelection] = useState(false);
  const [selectedAt, setSelectedAt] = useState<{ id: string; beat: number } | null>(null);
  const [emptyBeat, setEmptyBeat] = useState<number | null>(null);
  const [emptyMeasure, setEmptyMeasure] = useState<number | undefined>(undefined);
  const [articulation, setArticulation] = useState({
    staccato: false,
    ghost: false,
    accent: false,
  });
  const endBeat = score.notes
    .filter((item) => item.part === part)
    .reduce((sum, item) => scoreBeat(sum + item.beats), 0);
  const audibleVolume = useRef(volume || 0.8);
  const editor = useRef<HTMLDivElement>(null);
  const measureChordInput = useRef<HTMLInputElement>(null);
  const digits = useRef<{ id: string; string: number; value: string; time: number } | null>(null);
  const instrument = scoreInstrument(score, part);
  const isDrums = instrument.id === 'drums';
  const voiceOwner = scorePartOwner(score, part);
  const isKeyboard = instrument.id === 'piano' || !!score.keyboardStaves?.[voiceOwner];
  const isPitchedStaff = !isDrums && !instrument.tuning.length;
  const keyboardAlters = scoreKeyboardInputAlters(pitch, score.keySignature);
  const keyboardAlter =
    keyboardInput === 'default'
      ? keyboardAlters[0]
      : keyboardInput === 'alternate'
        ? keyboardAlters[1]
        : keyboardInput;
  const selectKeyboardAlter = (alter: number, naturalPitch = pitch) => {
    const [base, alternate] = scoreKeyboardInputAlters(naturalPitch, score.keySignature);
    setKeyboardInput(alter === base ? 'default' : alter === alternate ? 'alternate' : alter);
  };
  const multiDrums = isDrums && voiceMultiMode;
  const multiKeyboard = isKeyboard && voiceMultiMode;
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
  const hammerPull = (() => {
    try {
      return {
        plan: scoreHammerPullSelection(
          score,
          copiedSelection.map((n) => n.id),
        ),
        error: '',
      };
    } catch (error) {
      return { plan: null, error: (error as Error).message };
    }
  })();
  const copiedNotes = copyScoreNotes(
    score,
    part,
    copiedSelection.map((item) => item.id),
  );
  const multiple = rangeNotes.length > 1;
  const soundingSelection = copiedSelection.filter((item) => !item.rest && !item.blank);
  const activeString = Math.min(
    string,
    isDrums
      ? scoreDrums.length
      : instrument.tuning.length || (note ? noteTones(note).length : 1) || 1,
  );
  const selectedTone = note ? selectedScoreTone(score, note, activeString) : undefined;
  const activeDrumTechniques = drumTechniques(drumAtRow(activeString).pitch);
  const writtenDrumTone = note && !note.rest && !note.blank ? selectedTone : undefined;
  const chosenDrumTechnique = writtenDrumTone
    ? (writtenDrumTone.drumTechnique ?? 'normal')
    : drumTechnique;
  const activeDrumTechnique = activeDrumTechniques.includes(chosenDrumTechnique)
    ? chosenDrumTechnique
    : 'normal';
  const currentDrumRow = drumInputRow(activeString);
  const currentDrumBaseChoice =
    currentDrumRow.choices.find(
      (choice) => choice.row === activeString && choice.technique === activeDrumTechnique,
    ) ??
    currentDrumRow.choices.find(
      (choice) => choice.row === activeString && choice.technique === 'normal',
    ) ??
    currentDrumRow.choices[0];
  const currentDrumChoice = isDrumArticulation(activeDrumTechnique)
    ? {
        ...currentDrumBaseChoice,
        technique: activeDrumTechnique,
        label: drumLabel(currentDrumBaseChoice.pitch, activeDrumTechnique),
      }
    : currentDrumBaseChoice;
  const toneSelection = soundingSelection.filter((item) =>
    selectedScoreTone(score, item, activeString),
  );
  const articulationPressed = (key: 'accent' | 'staccato' | 'ghost' | 'dead') =>
    key === 'ghost' || key === 'dead'
      ? toneSelection.length > 0 &&
        toneSelection.every((item) => selectedScoreTone(score, item, activeString)?.[key])
      : soundingSelection.length > 0 && soundingSelection.every((item) => item[key]);
  const selectedBeat = note && !note.blank ? (note.graceBeats ?? note.beats) : beats;
  const triplet = note && !note.blank ? note.tuplet === 3 : inputTriplet;
  const writtenBeat = writtenScoreBeats({ tuplet: triplet ? 3 : undefined }, selectedBeat);
  const dotted = DOTTED_SCORE_BEATS.includes(writtenBeat);
  const base = dotted ? writtenBeat / 1.5 : writtenBeat;
  const noteStart = note
    ? rows.slice(0, rows.indexOf(note)).reduce((sum, item) => scoreBeat(sum + item.beats), 0)
    : endBeat;
  const before = note
    ? selectedAt?.id === note.id &&
      selectedAt.beat >= noteStart &&
      selectedAt.beat < noteStart + note.beats
      ? selectedAt.beat
      : noteStart
    : (emptyBeat ?? endBeat);
  const disabled = !loaded || playing || readOnly;
  const hasSelection = !!note || emptyBeat !== null;
  const loopStart = rangeNotes.length
    ? rows
        .slice(0, Math.min(rangeStart, rangeEnd))
        .reduce((sum, item) => scoreBeat(sum + item.beats), 0)
    : 0;
  const loopEnd =
    repeatSelection && rangeNotes.length
      ? rangeNotes.reduce((sum, item) => scoreBeat(sum + item.beats), loopStart)
      : undefined;
  const repeatAll = repeatSelection && !rangeNotes.length;
  const playFrom = repeatSelection ? loopStart : note || emptyBeat !== null ? before : 0;
  const canPlaySelection =
    (playAll
      ? score.notes.length > 0
      : rows.length > 0 || displayParts.some((p) => score.notes.some((n) => n.part === p))) &&
    playFrom <
      Math.max(...(playAll ? score.parts : displayParts).map((p) => scorePlaybackBeats(score, p)));
  const focus = () => editor.current?.focus({ preventScroll: true });
  const onAudition = (played: ScoreNote) =>
    auditionNote({ ...played, guitarTone: guitarToneAt(score, part, before) });
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
  const select = (id: string | null, row = activeString, at?: number, bar?: number) => {
    setEmptyMeasure(id ? undefined : bar);
    setRange(null);
    setEmptyBeat(id ? null : (at ?? endBeat));
    setSelectedAt(id && at !== undefined ? { id, beat: at } : null);
    onSelect(id);
    setString(row);
    const selectedNote = rows.find((item) => item.id === id);
    if (isDrums)
      setDrumTechnique(
        selectedNote
          ? (selectedScoreTone(score, selectedNote, row)?.drumTechnique ?? 'normal')
          : 'normal',
      );
    if (selectedNote) {
      const tone = selectedScoreTone(score, selectedNote, row);
      setFret(String(tone?.fret ?? 0));
      const selectedPitch = tone ?? { pitch: selectedNote.pitch };
      const base = isKeyboard
        ? scoreNaturalPitch(selectedPitch, score.keySignature)
        : selectedPitch.pitch;
      setPitch(base);
      if (isKeyboard) selectKeyboardAlter(selectedPitch.pitch - base, base);
      if (!selectedNote.blank && selectedNote.beats <= 4) {
        setBeats(selectedNote.graceBeats ?? selectedNote.beats);
        setInputTriplet(selectedNote.tuplet === 3);
      }
    }
    digits.current = null;
    focus();
  };
  const deselect = () => {
    setEmptyMeasure(undefined);
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
      start = scoreBeat(start + item.beats);
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
      const end = scoreBeat(
        (note && !note.blank ? noteStart : before) +
          copied.reduce((sum, item) => sum + item.beats, 0),
      );
      let at = 0;
      const following = result.score.notes
        .filter((n) => n.part === part)
        .find((n) => {
          const contains = at <= end && end < at + n.beats;
          at = scoreBeat(at + n.beats);
          return contains;
        });
      onSelect(following?.id ?? null);
      setSelectedAt(following ? { id: following.id, beat: end } : null);
      setEmptyBeat(following ? null : end);
      setEmptyMeasure(following ? undefined : scoreMeasureAtBeat(result.score, part, end).bar);
      setRange(null);
      setMessage(`${result.ids.length}개 박을 붙여넣었어요. 뒤의 음표는 그만큼 뒤로 이동했어요.`);
      digits.current = null;
      focus();
    } catch (error) {
      setMessage((error as Error).message);
    }
  };
  const toggleArticulation = (key: 'staccato' | 'ghost' | 'accent') => {
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
  const slurNotes = () => {
    if (isDrums) return;
    try {
      commit(
        setScoreSlur(
          score,
          copiedSelection.map((item) => item.id),
        ),
        true,
      );
    } catch (error) {
      setMessage((error as Error).message);
    }
    focus();
  };
  const connectHammerPull = () => {
    if (disabled || !instrument.tuning.length) return;
    try {
      commit(
        setScoreHammerPull(
          score,
          copiedSelection.map((n) => n.id),
        ),
        true,
      );
    } catch (error) {
      setMessage((error as Error).message);
    }
    focus();
  };
  const connectNotes = (type: ScoreConnectionType | null) => {
    if (disabled || isDrums) return;
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
    tuplet: inputTriplet ? 3 : undefined,
    rest,
    blank: rest,
    chord: '',
    lyric: '',
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
  const prepareInput = (item: ScoreNote) => {
    const prepared = note?.blank
      ? setScoreDuration(score, note.id, beats, () => crypto.randomUUID(), before - noteStart)
      : note
        ? score
        : emptyMeasure !== undefined
          ? appendScoreMeasureNote(
              score,
              item,
              emptyMeasure,
              scoreBeat(before - scoreMeasureStart(score, part, emptyMeasure)),
              () => crypto.randomUUID(),
            )
          : appendScoreNoteAt(score, item, before, () => crypto.randomUUID());
    return !note || note.blank
      ? {
          ...prepared,
          notes: prepared.notes.map((n) =>
            n.id === item.id ? { ...n, tuplet: inputTriplet ? (3 as const) : undefined } : n,
          ),
        }
      : prepared;
  };
  const toggleDeadNote = () => {
    if (disabled || isDrums || !hasSelection) return;
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
  const inputPitchOrRest = (asRest: boolean, alter = keyboardAlter) => {
    const enteredPitch = isKeyboard ? pitch + alter : pitch;
    const enteredTone = { pitch: enteredPitch, ...(isKeyboard ? { naturalPitch: pitch } : {}) };
    const matches = (tone: { pitch: number; naturalPitch?: number }) =>
      tone.pitch === enteredPitch &&
      (!isKeyboard || scoreNaturalPitch(tone, score.keySignature) === pitch);
    if (disabled) return;
    if (multiple) {
      setMessage('음정을 입력하려면 한 박을 선택해주세요.');
      return;
    }
    try {
      if (
        !asRest &&
        note &&
        !note.blank &&
        noteTones(note).length >= 16 &&
        !noteTones(note).some(matches)
      )
        throw new Error('한 박에 최대 16개 음을 넣을 수 있어요.');
      const item = note ?? create();
      const next = prepareInput(item);
      const result = {
        ...next,
        notes: next.notes.map((entry) =>
          entry.id === item.id
            ? {
                ...entry,
                pitch: enteredPitch,
                tones: asRest
                  ? []
                  : !item.rest && !item.blank
                    ? noteTones(item).some(matches)
                      ? noteTones(item)
                      : [...noteTones(item), enteredTone]
                    : [enteredTone],
                rest: asRest,
                blank: false,
                dead: false,
                ...((!note || note.blank) && !asRest ? articulation : {}),
              }
            : entry,
        ),
      };
      if (isKeyboard && !asRest) selectKeyboardAlter(alter);
      commit(result);
      if (!asRest) onAudition(result.notes.find((entry) => entry.id === item.id)!);
      onSelect(item.id);
      if (!asRest) {
        const entered = result.notes.find((entry) => entry.id === item.id)!;
        setString(noteTones(entered).findIndex(matches) + 1);
      }
      digits.current = null;
      focus();
    } catch (error) {
      setMessage((error as Error).message);
    }
  };
  const inputDrum = (choice: DrumInputChoice = currentDrumChoice) => {
    if (disabled) return;
    if (multiple) {
      setMessage('드럼을 입력하려면 한 박을 선택해주세요.');
      return;
    }
    try {
      const item = note ?? create();
      let entered = setScoreDrum(
        prepareInput(item),
        item.id,
        choice.pitch,
        false,
        choice.technique,
        true,
      );
      if (!note || note.blank)
        entered = {
          ...entered,
          notes: entered.notes.map((n) =>
            n.id === item.id
              ? { ...n, accent: articulation.accent, staccato: articulation.staccato }
              : n,
          ),
        };
      commit(entered);
      onSelect(item.id);
      setString(choice.row);
      setDrumTechnique(choice.technique);
      // Audition only the newly entered kit piece, not every simultaneous hit.
      const performed = directionAt(score, part, location.bar + location.offset / location.beats);
      onAudition({
        ...entered.notes.find((n) => n.id === item.id)!,
        playbackGain: performed.gain / 0.7,
        percussionImplement: performed.implement,
        tones: [
          resolveHiHat({ pitch: choice.pitch, drumTechnique: choice.technique }, performed.hiHat),
        ],
      });
      focus();
    } catch (error) {
      setMessage((error as Error).message);
    }
  };
  const inputNumberedDrum = (choice: DrumInputChoice) =>
    inputDrum(
      choice.technique === 'normal' &&
        isDrumArticulation(activeDrumTechnique) &&
        drumTechniques(choice.pitch).includes(activeDrumTechnique)
        ? { ...choice, technique: activeDrumTechnique }
        : choice,
    );
  const inputRhythmSlash = () => {
    if (disabled || multiple) return;
    try {
      const item = note ?? create(false);
      const next = setScoreRhythmSlash(prepareInput(item), item.id, !note?.slash);
      commit(next);
      onSelect(item.id);
      if (!note?.slash) onAudition(next.notes.find((n) => n.id === item.id)!);
    } catch (error) {
      setMessage((error as Error).message);
    }
    focus();
  };
  const toggleDrumArticulation = (technique: DrumTechnique) => {
    if (disabled || multiple || !activeDrumTechniques.includes(technique)) return;
    const next = activeDrumTechnique === technique ? 'normal' : technique;
    if (writtenDrumTone) inputDrum({ ...currentDrumBaseChoice, technique: next });
    else {
      setDrumTechnique(next);
      focus();
    }
  };
  const toggleGrace = () => {
    if (isDrums || disabled || multiple || !note || note.rest || note.blank) return;
    try {
      commit(setScoreGraceNote(score, note.id, note.graceBeats === undefined));
      setSelectedAt(null);
    } catch (error) {
      setMessage((error as Error).message);
    }
    focus();
  };
  const duration = (value: number) => {
    value = scoreBeat(value * (triplet ? 2 / 3 : 1));
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
      setBeats(scoreBeat((dotted ? base : base * 1.5) * (triplet ? 2 / 3 : 1)));
      setSelectedAt(null);
      setMessage('');
    } catch (error) {
      setMessage((error as Error).message);
    }
    digits.current = null;
    focus();
  };
  const toggleTriplet = () => {
    if (copiedSelection.some((n) => n.graceBeats !== undefined)) {
      setMessage('꾸밈음은 박자를 차지하지 않아 셋잇단음표로 묶지 않습니다.');
      return;
    }
    try {
      if (note && !note.blank) {
        const next = setScoreTriplet(
          score,
          copiedSelection.map((item) => item.id),
          !triplet,
        );
        commit(next, true);
        setBeats(next.notes.find((item) => item.id === note.id)!.beats);
      } else setBeats(scoreBeat(writtenBeat * (!triplet ? 2 / 3 : 1)));
      setInputTriplet(!triplet);
      setSelectedAt(null);
      setMessage('');
    } catch (error) {
      setMessage((error as Error).message);
    }
    focus();
  };
  const insert = (item: ScoreNote) => {
    if (multiple) {
      setMessage('빈 박을 삽입할 위치를 한 박만 선택해주세요.');
      return;
    }
    try {
      commit(note ? insertScoreNote(score, item, selected) : prepareInput(item));
      onSelect(item.id);
      digits.current = null;
      focus();
    } catch (error) {
      setMessage((error as Error).message);
    }
  };
  const rest = () => {
    if (copiedSelection.some((n) => n.graceBeats !== undefined)) {
      setMessage('꾸밈음을 일반 음표로 전환한 뒤 쉼표로 바꿔주세요.');
      return;
    }
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
    const bar =
      !note && emptyMeasure !== undefined
        ? emptyMeasure
        : scoreMeasureAtBeat(score, part, before).bar;
    const start = scoreMeasureStart(score, part, bar);
    const fragments = scoreMeasures(score, part)[bar] ?? [];
    const entry = scoreMeasureEntry(score, part, bar);
    const limit = Math.max(scoreBarBeats(score), scoreMeasureDuration(score, part, bar));
    const targets: { id: string | null; beat: number }[] = fragments
      .filter((item) => !item.note.blank)
      .map((item) => ({ id: item.note.id, beat: scoreBeat(start + item.offset) }));
    if (entry.offset < limit) targets.push({ id: entry.id, beat: entry.beat });
    targets.sort((a, b) => a.beat - b.beat);
    const currentIndex = targets.findIndex(
      (item) => item.id === note?.id && Math.abs(item.beat - before) < 1e-7,
    );
    const candidate =
      currentIndex >= 0 && targets[currentIndex + direction]
        ? targets[currentIndex + direction]
        : direction > 0
          ? targets.find((item) => item.beat > before)
          : targets.filter((item) => item.beat < before).at(-1);
    if (candidate) {
      select(candidate.id, activeString, candidate.beat, bar);
      return;
    }
    const nextBar = bar + direction;
    if (nextBar < 0 || nextBar >= 32000) return;
    const nextStart = scoreMeasureStart(score, part, nextBar);
    const nextFragments = (scoreMeasures(score, part)[nextBar] ?? []).filter(
      (item) => !item.note.blank,
    );
    const target = direction > 0 ? nextFragments[0] : nextFragments.at(-1);
    const empty = scoreMeasureEntry(score, part, nextBar);
    select(
      target?.note.id ?? empty.id,
      activeString,
      target ? scoreBeat(nextStart + target.offset) : empty.beat,
      nextBar,
    );
  };
  const location =
    !note && emptyMeasure !== undefined
      ? {
          bar: emptyMeasure,
          start: scoreMeasureStart(score, part, emptyMeasure),
          beats: scoreMeasureDuration(score, part, emptyMeasure),
          offset: scoreBeat(before - scoreMeasureStart(score, part, emptyMeasure)),
        }
      : scoreMeasureAtBeat(score, part, before);
  const currentLocation =
    playbackBeat === null ? location : scoreMeasureAtBeat(score, part, playbackBeat);
  const time = scoreTimeSignature(score);
  const layoutPart = isDrums || isKeyboard ? voiceOwner : part;
  const measureCount = Math.max(
    scoreMeasureCount(score, part),
    ...displayParts.map((name) => scoreMeasureCount(score, name)),
    hasSelection ? location.bar + 1 : 1,
  );
  const measure = Math.min(measureCount - 1, location.bar);
  const systems = scoreRestSystems(
    score,
    displayParts,
    measureCount,
    hasSelection && playbackBeat === null ? location.bar : undefined,
  );
  const lineIndex = systems.findIndex(
    (row) => measure >= row.start && measure < row.start + row.count,
  );
  const canMoveNext = hasSelection && measure > systems[lineIndex].start;
  const canMovePrevious =
    hasSelection &&
    lineIndex > 0 &&
    systems[lineIndex - 1].capacity + measure - systems[lineIndex].start + 1 <= 16;
  const moveMeasure = (direction: -1 | 1) => {
    const next = moveScoreMeasureToRow(
      score,
      layoutPart,
      measure,
      direction,
      measureCount,
      systems,
    );
    if (next !== score) commit(next);
    focus();
  };
  const navigateMeasure = (bar: number, offset = 0) => {
    if (bar < 0 || bar >= 32000) return;
    const start = scoreMeasureStart(score, part, bar);
    const fragment = (scoreMeasures(score, part)[bar] ?? []).find(
      (item) => item.offset <= offset && offset < item.offset + item.beats,
    );
    const entry = scoreMeasureEntry(score, part, bar);
    select(
      fragment?.note.id ?? entry.id,
      activeString,
      fragment ? scoreBeat(start + (fragment.note.blank ? offset : fragment.offset)) : entry.beat,
      bar,
    );
  };
  const deleteMeasureRests = (bars: number[]) => {
    if (disabled) return false;
    try {
      const next = bars.reduce((next, bar) => deleteScoreMeasureRest(next, part, bar), score);
      if (next === score) return false;
      commit(next);
      const bar = Math.min(...bars);
      const entry = scoreMeasureEntry(next, part, bar);
      select(entry.id, activeString, entry.beat, bar);
    } catch (error) {
      setMessage((error as Error).message);
    }
    return true;
  };
  const deleteMeasureRest = (bar: number) => deleteMeasureRests([bar]);
  const deleteSelectedMeasureRests = () => {
    if (!multiple) return deleteMeasureRest(location.bar);
    const marked = scoreMeasureRestBars(score, part);
    const bars = scoreMeasures(score, part).flatMap((fragments, bar) =>
      marked.has(bar) && fragments.some((f) => copiedSelection.some((n) => n.id === f.note.id))
        ? [bar]
        : [],
    );
    const ids = new Set(
      bars.flatMap((bar) => scoreMeasures(score, part)[bar].map((f) => f.note.id)),
    );
    return copiedSelection.every((n) => ids.has(n.id)) && deleteMeasureRests(bars);
  };
  const navigateSystem = (direction: -1 | 1) => {
    const cursorSystems = systems;
    const index = cursorSystems.findIndex(
      (row) => location.bar >= row.start && location.bar < row.start + row.count,
    );
    const current = cursorSystems[index],
      target = cursorSystems[index + direction];
    if (!current || !target) return;
    const column = location.bar - current.start;
    navigateMeasure(target.start + Math.min(column, target.count - 1), location.offset);
  };
  const addMeasure = () => {
    try {
      const firstBeat = scoreMeasureStart(score, part, measureCount);
      const item = { ...create(), beats: Math.min(1, scoreBarBeats(score)) };
      const next = appendScoreNoteAt(
        score,
        item,
        firstBeat + scoreBarBeats(score) - item.beats,
        () => crypto.randomUUID(),
      );
      let at = 0;
      const first = next.notes
        .filter((note) => note.part === part)
        .find((note) => {
          const matches = at === firstBeat;
          at = scoreBeat(at + note.beats);
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
  const changeMeasure = (bar: number, action: 'insert' | 'delete') => {
    try {
      if (
        action === 'delete' &&
        bar >= Math.max(...score.parts.map((name) => scoreMeasureCount(score, name)))
      ) {
        setMeasureMenu(null);
        deselect();
        return;
      }
      const next = editScoreMeasure(score, bar, action);
      commit(next);
      setMeasureMenu(null);
      const target = Math.min(bar, scoreMeasureCount(next, part) - 1);
      const fragment = (scoreMeasures(next, part)[target] ?? []).find((item) => !item.note.blank);
      const entry = scoreMeasureEntry(next, part, target);
      select(
        fragment?.note.id ?? entry.id,
        activeString,
        fragment ? scoreMeasureStart(next, part, target) + fragment.offset : entry.beat,
        target,
      );
    } catch (error) {
      setMessage((error as Error).message);
    }
  };
  const selectVoice = (index: number, multi = false, position = location) => {
    if (disabled || !onPartSelect) return;
    try {
      const next = isDrums ? enableDrumVoices(score, part) : enableKeyboardPart(score, voiceOwner);
      if (next !== score) commit(next);
      const voice = scorePartStaves(next, part)[index];
      const target = scoreVoiceCursor(next, voice, position.bar, position.offset);
      if (isKeyboard) {
        voicePitches.current.set(part, pitch);
        const targetNote = next.notes.find((n) => n.id === target.id && !n.blank && !n.rest);
        const targetTone = targetNote ? noteTones(targetNote)[0] : undefined;
        const base = targetTone
          ? scoreNaturalPitch(targetTone, score.keySignature)
          : (voicePitches.current.get(voice) ?? (voice === voiceOwner ? 60 : 48));
        setPitch(base);
        if (targetTone) selectKeyboardAlter(targetTone.pitch - base, base);
        else setKeyboardInput('default');
        setString(1);
      }
      setVoiceMultiMode(multi);
      onPartSelect(voice, target.id);
      setEmptyBeat(target.id ? null : target.beat);
      setEmptyMeasure(target.id ? undefined : target.bar);
      setSelectedAt(target.id ? { id: target.id, beat: target.beat } : null);
      setRange(null);
      focus();
    } catch (error) {
      setMessage((error as Error).message);
    }
  };
  const toggleVoice = (index: number) => {
    const both = multiDrums || multiKeyboard;
    const activeIndex = part === voiceOwner ? 0 : 1;
    if (both) selectVoice(index === 0 ? 1 : 0);
    else if (index !== activeIndex) selectVoice(index, true);
    // Keep the last active voice on; clicking it again cannot leave an empty editing mode.
  };
  const selectStaffPart = (voice: string, id?: string) => {
    if ((isDrums || isKeyboard) && scorePartOwner(score, voice) === voiceOwner) {
      const bars = scoreMeasures(score, voice);
      const bar = id
        ? bars.findIndex((fragments) => fragments.some((f) => f.note.id === id))
        : location.bar;
      const offset = bars[bar]?.find((f) => f.note.id === id)?.offset ?? location.offset;
      selectVoice(voice === voiceOwner ? 0 : 1, multiDrums || multiKeyboard, {
        ...location,
        bar: Math.max(0, bar),
        offset,
      });
    } else onPartSelect?.(voice, id);
  };
  const keys = (event: KeyboardEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    if (
      target.closest('input,select,textarea,button,a,summary') ||
      event.nativeEvent.isComposing ||
      event.altKey
    )
      return;
    const ctrl = event.ctrlKey || event.metaKey;
    if (
      ctrl &&
      !event.shiftKey &&
      ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)
    ) {
      event.preventDefault();
      if (!disabled) {
        if (event.key === 'ArrowLeft' || event.key === 'ArrowRight')
          navigateMeasure(location.bar + (event.key === 'ArrowRight' ? 1 : -1));
        else navigateSystem(event.key === 'ArrowDown' ? 1 : -1);
      }
      return;
    }
    if (
      ctrl &&
      (isDrums || isKeyboard) &&
      !event.shiftKey &&
      ['1', '2', 'm'].includes(event.key.toLowerCase())
    ) {
      event.preventDefault();
      if (!event.repeat) {
        if (event.key.toLowerCase() === 'm') selectVoice(0, !(multiDrums || multiKeyboard));
        else selectVoice(Number(event.key) - 1);
      }
      return;
    }
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
      if (!event.repeat && loaded && (playing || canPlaySelection))
        onPlay(playFrom, loopEnd, repeatAll);
      return;
    }
    if (disabled || ctrl) return;
    if (
      isPitchedStaff &&
      (event.key === 'Enter' || event.key === '1' || (isKeyboard && event.key === '2'))
    ) {
      event.preventDefault();
      if (!event.repeat)
        inputPitchOrRest(
          false,
          event.key === 'Enter'
            ? keyboardAlter
            : isKeyboard
              ? keyboardAlters[event.key === '2' ? 1 : 0]
              : 0,
        );
      return;
    }
    if (event.code === 'KeyG' || event.key.toLowerCase() === 'g') {
      event.preventDefault();
      if (!event.repeat) toggleGrace();
      return;
    }
    if (isDrums && (event.key === 'Enter' || /^[1-9]$/.test(event.key))) {
      event.preventDefault();
      const choice =
        event.key === 'Enter' ? currentDrumChoice : currentDrumRow.choices[Number(event.key) - 1];
      if (!event.repeat && choice) {
        if (event.key === 'Enter') inputDrum(choice);
        else inputNumberedDrum(choice);
      }
      return;
    }
    if (event.key.toLowerCase() === 'l') {
      event.preventDefault();
      slurNotes();
      return;
    }
    const connectionKey = ({ h: 'hammer', p: 'pull', j: 'slide', t: 'tie' } as const)[
      event.key.toLowerCase() as 'h'
    ];
    if (connectionKey) {
      event.preventDefault();
      if (connectionKey === 'hammer' || connectionKey === 'pull') connectHammerPull();
      else connectNotes(connectionKey);
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
      if (isPitchedStaff) {
        if (!hasSelection) select(null, 1, before, location.bar);
        setPitch((value) =>
          isKeyboard
            ? nextScoreNaturalPitch(value, event.key === 'ArrowUp' ? 1 : -1)
            : Math.max(24, Math.min(96, value + (event.key === 'ArrowUp' ? 1 : -1))),
        );
        return;
      }
      // A short bar's empty tail shares a beat with the next bar's start.
      // Changing strings must preserve the selected bar as well as that beat.
      select(
        selected,
        isDrums
          ? moveDrumInputRow(activeString, event.key === 'ArrowDown' ? 1 : -1)
          : Math.max(
              1,
              Math.min(
                isDrums ? scoreDrums.length : instrument.tuning.length || 1,
                activeString + (event.key === 'ArrowDown' ? 1 : -1),
              ),
            ),
        before,
        location.bar,
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
      if (isDrums && event.key.toLowerCase() === 's') toggleDrumArticulation('choke');
      else toggleArticulation(event.key.toLowerCase() === 's' ? 'staccato' : 'ghost');
    } else if (event.key.toLowerCase() === 'a') {
      event.preventDefault();
      toggleArticulation('accent');
    } else if (event.key.toLowerCase() === 'r') {
      event.preventDefault();
      rest();
    } else if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      if (deleteSelectedMeasureRests()) return;
      if (note) {
        if (multiple) {
          commit(
            removeScoreNotes(
              score,
              rangeNotes.map((item) => item.id),
            ),
          );
          deselect();
        } else if (!event.shiftKey) {
          if (isDrums && !note.rest && !note.blank) {
            commit(
              setScoreDrum(score, note.id, drumAtRow(activeString).pitch, true, 'normal', true),
            );
            return;
          }
          if (isKeyboard && !note.rest && !note.blank) {
            commit(deleteScorePitch(score, note.id, pitch, keyboardAlter));
            return;
          }
          const next = deleteScorePosition(
            score,
            note.id,
            instrument.tuning.length ? activeString : undefined,
            before,
          );
          commit(next);
          if (note.rest && !note.blank) {
            const bar = scoreMeasureAtBeat(score, part, before).bar;
            const start = scoreMeasureStart(next, part, bar);
            const following = (scoreMeasures(next, part)[bar] ?? []).find(
              (item) => !item.note.blank && start + item.offset >= before,
            );
            const entry = scoreMeasureEntry(next, part, bar);
            select(
              following?.note.id ?? entry.id,
              activeString,
              following ? start + following.offset : entry.beat,
              bar,
            );
          }
        } else {
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
      aria-label="악보 입력 영역"
      onKeyDown={keys}
      data-tool-tab={toolTab}
      data-expanded={layout.expanded}
    >
      <div className="score-expanded-scorebar">
        <strong>{scorePartOwner(score, part)}</strong>
        <span>
          {instrument.label} {instrument.capo ? `· 카포 ${instrument.capo}` : ''}
        </span>
        <div className="score-expanded-view-controls">
          <div className="score-expanded-view-tools-host" ref={onViewToolsHost} />
          {instrument.tuning.length > 0 && (
            <button aria-pressed={showTab} onClick={() => setShowTab(!showTab)}>
              {showTab ? '오선 + TAB' : '오선'}
            </button>
          )}
          <button aria-label="악보 축소" onClick={() => setZoom(Math.max(60, zoom - 10))}>
            −
          </button>
          <span>{zoom}%</span>
          <button aria-label="악보 확대" onClick={() => setZoom(Math.min(160, zoom + 10))}>
            ＋
          </button>
        </div>
      </div>
      <div className="guitar-toolbar score-transport">
        <div className="score-expanded-transport-position">
          <strong>
            {currentLocation.bar + 1}마디 · {Number((currentLocation.offset + 1).toFixed(2))}박
          </strong>
          <span>
            {Math.floor(((playbackBeat ?? before) * 60) / score.bpm / 60)}:
            {String(Math.floor(((playbackBeat ?? before) * 60) / score.bpm) % 60).padStart(2, '0')}
          </span>
        </div>
        <button
          className="score-play"
          aria-label={playing ? '■ 정지' : repeatSelection ? '▶ 구간 반복' : '▶ 선택 위치부터'}
          title={playing ? '정지 · Space' : '선택 위치부터 재생 · Space'}
          disabled={!loaded || (!playing && !canPlaySelection)}
          onClick={() => {
            onPlay(playFrom, loopEnd, repeatAll);
            focus();
          }}
        >
          <svg
            className="score-transport-play-icon"
            viewBox="0 0 24 24"
            aria-hidden="true"
            fill="currentColor"
          >
            <path d={playing ? 'M6 6h12v12H6z' : 'M7 4l14 8-14 8z'} />
          </svg>
          <span className="score-transport-play-text">
            {playing ? '■ 정지' : repeatSelection ? '▶ 구간 반복' : '▶ 선택 위치부터'}
          </span>
        </button>
        <button
          disabled={
            disabled ||
            !(playAll ? score.notes.length : score.notes.some((n) => displayParts.includes(n.part)))
          }
          onClick={() => {
            onPlay(0, undefined, repeatSelection);
            focus();
          }}
          aria-label="처음부터"
          title="처음부터"
          className="score-play-from-start"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
            <path d="M5 4h2v16H5zm14 0L8 12l11 8z" />
          </svg>
        </button>
        <label
          className="score-check"
          title="선택 구간 반복 · 구간을 선택하지 않으면 처음부터 끝까지 반복"
        >
          <input
            type="checkbox"
            checked={repeatSelection}
            disabled={disabled}
            onChange={(event) => {
              setRepeatSelection(event.target.checked);
              focus();
            }}
          />
          구간 반복
        </label>
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
        {backingPlayback && (
          <label className="score-transport-backing" title="연결된 반주를 악보와 함께 재생">
            <input
              type="checkbox"
              aria-label="반주 악보와 함께 재생"
              checked={backingPlayback.enabled}
              disabled={backingPlayback.disabled}
              onChange={(event) => backingPlayback.onChange(event.target.checked)}
            />
            <span>반주 함께 재생</span>
          </label>
        )}
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
            <svg
              className="score-transport-volume-icon"
              viewBox="0 0 24 24"
              aria-hidden="true"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M4 9h4l5-4v14l-5-4H4z" />
              <path
                d={volume === 0 ? 'M17 9l5 6m0-6-5 6' : 'M17 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14'}
              />
            </svg>
            <span className="score-transport-volume-text">
              {volume === 0 ? '음소거 해제' : '음소거'}
            </span>
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
        <div className="score-expanded-timeline">
          <input
            type="range"
            aria-label="재생 시작 위치"
            min="0"
            max={Math.max(1, endBeat)}
            step="0.25"
            value={Math.min(endBeat, playbackBeat ?? before)}
            disabled={playing || !loaded || !endBeat}
            onChange={(event) => selectChordPosition(Number(event.target.value))}
          />
        </div>
      </div>
      <div className="guitar-toolbar score-note-tools" role="group" aria-label="길이와 쉼표">
        <div className="score-expanded-history">
          <button
            aria-label="크게 보기 실행 취소"
            disabled={!canUndo || disabled}
            onClick={() => {
              onUndo();
              focus();
            }}
          >
            ↶
          </button>
          <button
            aria-label="크게 보기 다시 실행"
            disabled={!canRedo || disabled}
            onClick={() => {
              onRedo();
              focus();
            }}
          >
            ↷
          </button>
          <span>음표 입력</span>
        </div>
        <span className="score-tool-group-label">길이 · 쉼표</span>
        {lengths.map((length) => (
          <ScoreToolButton
            key={length.value}
            className="note-length"
            icon={length.glyph}
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
          </ScoreToolButton>
        ))}
        <ScoreToolButton
          aria-label="점음표"
          aria-pressed={dotted}
          title="점음표 · 원래 길이의 절반을 더함 (.)"
          disabled={disabled || base < 0.125 || base > 4}
          onClick={toggleDot}
        >
          • 점
        </ScoreToolButton>
        <ScoreToolButton
          type="button"
          aria-label="셋잇단음표"
          aria-pressed={triplet}
          title="같은 길이의 세 음을 선택하거나 첫 음을 선택해 적용 · 빈 칸에서는 셋잇단음표 입력 모드"
          disabled={disabled || dotted}
          onClick={toggleTriplet}
        >
          셋잇단음표 3
        </ScoreToolButton>
        <ScoreToolButton
          aria-pressed={!!note?.rest && !note.blank}
          disabled={disabled}
          onClick={rest}
        >
          𝄽 쉼표
        </ScoreToolButton>
        <ScoreToolButton
          disabled={disabled}
          title="현재 악기의 마디 전체를 쉼표로 바꾸고 다음 마디로 이동"
          onClick={() => {
            try {
              const next = inputScoreMeasureRest(score, part, location.bar);
              const bar = location.bar + 1,
                at = scoreMeasureStart(next, part, bar);
              commit(next);
              select(null, activeString, at, bar);
              focus();
            } catch (error) {
              setMessage((error as Error).message);
            }
          }}
        >
          마디 쉼표 입력
        </ScoreToolButton>
      </div>
      <div className="score-detail-inspector">
        {renderSettings(
          <>
            <div
              className="guitar-inputbar score-instrument-settings"
              role="group"
              aria-label="파트 악기 설정"
            >
              <label>
                악기 · 튜닝{' '}
                <select
                  aria-label="파트 악기와 튜닝"
                  value={instrument.id}
                  disabled={disabled || scorePartStaves(score, part).length > 1}
                  onChange={(event) => {
                    try {
                      commit(
                        event.target.value === 'piano'
                          ? enableKeyboardPart(score, part)
                          : {
                              ...score,
                              instruments: { ...score.instruments, [part]: event.target.value },
                            },
                      );
                    } catch (error) {
                      setMessage((error as Error).message);
                    }
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

              {instrument.tuning.length > 0 && (
                <label className="score-check">
                  <input
                    type="checkbox"
                    checked={showTab}
                    onChange={(event) => setShowTab(event.target.checked)}
                  />
                  TAB 표시
                </label>
              )}
            </div>
            <div className="guitar-inputbar score-layout-settings">
              <label>
                줄 간격{' '}
                <input
                  key={score.systemGap ?? 14}
                  type="number"
                  aria-label="악보 줄 간격"
                  min="0"
                  max="160"
                  step="2"
                  defaultValue={score.systemGap ?? 14}
                  disabled={disabled}
                  onBlur={(event) => {
                    const value = event.currentTarget.valueAsNumber;
                    if (!Number.isFinite(value)) {
                      event.currentTarget.value = String(score.systemGap ?? 14);
                      return;
                    }
                    const gap = Math.max(0, Math.min(160, Math.round(value)));
                    event.currentTarget.value = String(gap);
                    if (gap !== (score.systemGap ?? 14)) commit({ ...score, systemGap: gap });
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      event.currentTarget.blur();
                    }
                  }}
                />{' '}
                px
              </label>
              <button
                disabled={disabled || (score.systemGap ?? 14) === 14}
                onClick={() => commit({ ...score, systemGap: 14 })}
              >
                기본 줄 간격
              </button>
              <small>
                줄 사이 여백을 0~160으로 조절합니다. Enter로 적용 · 저장·인쇄·PDF에도 반영됩니다.
              </small>
            </div>
          </>,
        )}
        <div className="guitar-inputbar score-document-settings">
          <label>
            조표{' '}
            <select
              aria-label="조표"
              value={score.keySignature ?? 0}
              disabled={disabled}
              onChange={(event) => commit({ ...score, keySignature: Number(event.target.value) })}
            >
              {[
                'C♭ / A♭m (♭7)',
                'G♭ / E♭m (♭6)',
                'D♭ / B♭m (♭5)',
                'A♭ / Fm (♭4)',
                'E♭ / Cm (♭3)',
                'B♭ / Gm (♭2)',
                'F / Dm (♭1)',
                'C / Am (없음)',
                'G / Em (♯1)',
                'D / Bm (♯2)',
                'A / F♯m (♯3)',
                'E / C♯m (♯4)',
                'B / G♯m (♯5)',
                'F♯ / D♯m (♯6)',
                'C♯ / A♯m (♯7)',
              ].map((name, index) => (
                <option key={name} value={index - 7}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <label>
            박자표{' '}
            <span className="score-meter-controls">
              <select
                aria-label="박자표 분자"
                value={time.beats}
                disabled={disabled}
                onChange={(event) =>
                  commit(setScoreTimeSignature(score, Number(event.target.value), time.beatType))
                }
              >
                {Array.from({ length: 16 }, (_, index) => (
                  <option key={index} value={index + 1}>
                    {index + 1}
                  </option>
                ))}
              </select>{' '}
              /{' '}
              <select
                aria-label="박자표 분모"
                value={time.beatType}
                disabled={disabled}
                onChange={(event) =>
                  commit(setScoreTimeSignature(score, time.beats, Number(event.target.value)))
                }
              >
                {[2, 4, 8, 16].map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            </span>
          </label>
          <label>
            곡 전체 리듬{' '}
            <select
              aria-label="곡 전체 셋잇단음표 느낌"
              value={score.rhythmFeel ?? 'straight'}
              disabled={disabled}
              onChange={(event) =>
                commit({ ...score, rhythmFeel: event.target.value as Score['rhythmFeel'] })
              }
            >
              {Object.entries(scoreRhythmFeels).map(([value, feel]) => (
                <option key={value} value={value}>
                  {feel.label}
                </option>
              ))}
            </select>
          </label>
          <div className="score-document-chord">
            <label className="score-measure-chord-input">
              코드
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
            <ScoreToolbarHelp label="조표·박자·코드 도움말">
              조표는 표기를 바꾸며 음높이는 유지합니다. 박자보다 길거나 짧은 마디도 입력한 길이대로
              재생합니다. 악보의 위치를 선택한 뒤 코드를 입력하세요.
            </ScoreToolbarHelp>
          </div>
          <ScoreExpressionTools
            mode="instructions"
            score={score}
            part={part}
            bar={location.bar}
            ids={copiedSelection.map((n) => n.id)}
            disabled={disabled || !hasSelection}
            onEdit={(next) => commit(next, true)}
            onError={setMessage}
            toneControls={
              !isDrums && instrument.tuning.length > 0 ? (
                <>
                  <label className="score-tone-field" title="현재 커서부터 다음 톤 변경까지 적용">
                    연주 톤{' '}
                    <span className="score-tone-controls">
                      <select
                        aria-label="현재 커서부터 연주 톤"
                        disabled={disabled || !hasSelection}
                        value={guitarToneAt(score, part, before)}
                        onChange={(e) => {
                          commit(
                            setGuitarToneChange(score, part, before, e.target.value as GuitarTone),
                          );
                          focus();
                        }}
                      >
                        {Object.entries(guitarToneLabels).map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                            {value === 'clean' ? ' · 드라이브 해제' : ''}
                          </option>
                        ))}
                      </select>
                      <ScoreToolButton
                        type="button"
                        disabled={
                          disabled || !hasSelection || !score.guitarToneChanges?.[part]?.[before]
                        }
                        onClick={() => {
                          commit(setGuitarToneChange(score, part, before, null));
                          focus();
                        }}
                      >
                        이 위치의 톤 지시 삭제
                      </ScoreToolButton>
                    </span>
                  </label>
                </>
              ) : undefined
            }
          />
        </div>
        <div className="guitar-inputbar score-pitch-tools" role="group" aria-label="음 입력">
          <span className="score-tool-group-label">음 입력</span>
          {instrument.tuning.length > 0 && (
            <label>
              카포{' '}
              <select
                aria-label="카포 프렛"
                title="TAB 숫자는 유지하고 실제 음높이를 카포 위치만큼 바꿉니다. 0프렛은 카포 위치입니다."
                value={instrument.capo}
                disabled={disabled}
                onChange={(event) => {
                  try {
                    commit(setScoreCapo(score, part, Number(event.target.value)));
                  } catch (error) {
                    setMessage((error as Error).message);
                  }
                  digits.current = null;
                  focus();
                }}
              >
                <option value={0}>없음</option>
                {Array.from({ length: 12 }, (_, i) => (
                  <option key={i + 1} value={i + 1}>
                    {i + 1}프렛
                  </option>
                ))}
              </select>
            </label>
          )}
          {isDrums ? (
            <>
              <label>
                오선 위치{' '}
                <select
                  aria-label="드럼 입력 위치"
                  value={currentDrumRow.y}
                  disabled={disabled}
                  onChange={(event) =>
                    select(
                      selected,
                      drumInputRows.find((row) => row.y === Number(event.target.value))!.choices[0]
                        .row,
                      before,
                      location.bar,
                    )
                  }
                >
                  {drumInputRows.map((row) => (
                    <option key={row.y} value={row.y}>
                      {row.label}
                    </option>
                  ))}
                </select>
              </label>
              <div className="drum-number-choices" aria-label="현재 위치의 드럼 숫자키">
                {currentDrumRow.choices.map((choice, index) => (
                  <ScoreToolButton
                    key={index}
                    icon={
                      <>
                        <kbd>{index + 1}</kbd>
                        <svg viewBox="-10 -43 27 57" aria-hidden="true">
                          <DrumNotehead
                            tone={{ pitch: choice.pitch, drumTechnique: choice.technique }}
                            x={0}
                            y={0}
                            beats={1}
                            stemEnd={-22}
                            color="currentColor"
                          />
                        </svg>
                      </>
                    }
                    disabled={disabled || multiple}
                    aria-pressed={choice === currentDrumBaseChoice}
                    onClick={() => inputNumberedDrum(choice)}
                  >
                    <kbd>{index + 1}</kbd> {choice.label}
                  </ScoreToolButton>
                ))}
              </div>
              <ScoreToolButton disabled={disabled || multiple} onClick={() => inputDrum()}>
                현재 기호 입력 · Enter
              </ScoreToolButton>
              <DrumNotationGuide />
            </>
          ) : instrument.tuning.length ? (
            <>
              <label>
                줄{' '}
                <select
                  aria-label="입력할 줄"
                  value={activeString}
                  onChange={(event) => {
                    select(selected, Number(event.target.value), before, location.bar);
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
              <ScoreToolButton
                disabled={disabled || multiple || fret === ''}
                onClick={() => inputFret(Number(fret))}
              >
                프렛 입력
              </ScoreToolButton>
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
                  {Array.from({ length: 73 }, (_, i) => i + 24)
                    .filter((p) => !isKeyboard || [0, 2, 4, 5, 7, 9, 11].includes(p % 12))
                    .map((p) => (
                      <option key={p} value={p}>
                        {pitchName(p)}
                      </option>
                    ))}
                </select>
              </label>
              <ScoreToolButton
                disabled={disabled}
                onClick={() => {
                  inputPitchOrRest(false);
                }}
              >
                {isKeyboard ? '현재 음 입력 · Enter' : '음정 입력 · Enter / 1'}
              </ScoreToolButton>
              {isKeyboard &&
                keyboardAlters.map((alter, index) => (
                  <ScoreToolButton
                    key={alter}
                    icon={alter < 0 ? '♭' : alter > 0 ? '♯' : '♮'}
                    disabled={disabled}
                    aria-pressed={keyboardAlter === alter}
                    onClick={() => inputPitchOrRest(false, alter)}
                  >
                    {index + 1}{' '}
                    {index === 0
                      ? `기본 ${alter < 0 ? '♭' : alter > 0 ? '♯' : '♮'}`
                      : alter === 0
                        ? '제자리 ♮'
                        : '샵 ♯'}
                  </ScoreToolButton>
                ))}
              {isKeyboard && (
                <select
                  aria-label="변화음 직접 입력"
                  value=""
                  disabled={disabled}
                  onChange={(event) => inputPitchOrRest(false, Number(event.target.value))}
                >
                  <option value="" disabled>
                    다른 변화음…
                  </option>
                  <option value="-1">플랫 ♭</option>
                  <option value="0">제자리 ♮</option>
                  <option value="1">샵 ♯</option>
                </select>
              )}
              {note && !note.rest && noteTones(note).length > 1 && (
                <span className="score-chord-tones">
                  {noteTones(note).map((tone, index) => (
                    <ScoreToolButton
                      key={index}
                      disabled={disabled}
                      aria-label={`${pitchName(tone.pitch)} 화음에서 삭제`}
                      onClick={() => {
                        const tones = noteTones(note).filter((_, i) => i !== index);
                        commit({
                          ...score,
                          notes: score.notes.map((n) =>
                            n.id === note.id ? { ...n, pitch: tones[0].pitch, tones } : n,
                          ),
                        });
                      }}
                    >
                      {pitchName(tone.pitch)} ×
                    </ScoreToolButton>
                  ))}
                </span>
              )}
            </>
          )}
        </div>
        <div className="guitar-inputbar score-connections" role="group" aria-label="주법">
          <span className="score-tool-group-label">주법</span>
          <ScoreToolButton
            disabled={disabled || (!!note?.rest && !note.blank)}
            aria-label="악센트"
            title="악센트 · A · 선택한 박을 강조하거나 다음 입력에 적용"
            aria-pressed={note && !note.blank ? articulationPressed('accent') : articulation.accent}
            onClick={() => toggleArticulation('accent')}
          >
            &gt; 악센트
          </ScoreToolButton>
          <ScoreToolButton
            disabled={disabled || !soundingSelection.length}
            aria-pressed={
              soundingSelection.length > 0 && soundingSelection.every((item) => item.marcato)
            }
            onClick={() =>
              commit(
                {
                  ...score,
                  notes: score.notes.map((item) =>
                    soundingSelection.includes(item)
                      ? { ...item, marcato: !soundingSelection.every((n) => n.marcato) }
                      : item,
                  ),
                },
                true,
              )
            }
          >
            ^ 마르카토
          </ScoreToolButton>
          {isDrums ? (
            <ScoreToolButton
              disabled={disabled || multiple || !activeDrumTechniques.includes('choke')}
              aria-label="초크"
              aria-keyshortcuts="S"
              aria-pressed={activeDrumTechnique === 'choke'}
              title={
                activeDrumTechniques.includes('choke')
                  ? '초크 · S · 선택한 타격의 울림을 짧게 끊음 · 다시 누르면 해제'
                  : `${drumAtRow(activeString).label}에는 초크를 적용할 수 없어요.`
              }
              onClick={() => toggleDrumArticulation('choke')}
            >
              초크
            </ScoreToolButton>
          ) : (
            <ScoreToolButton
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
            </ScoreToolButton>
          )}
          {!isDrums && (
            <ScoreToolButton
              disabled={disabled || !hasSelection || (multiple && !toneSelection.length)}
              aria-label="데드노트 (뮤트)"
              title="데드노트 · X · 선택한 음만 뮤트"
              aria-pressed={articulationPressed('dead')}
              onClick={toggleDeadNote}
            >
              X 데드노트
            </ScoreToolButton>
          )}
          <ScoreToolButton
            disabled={
              disabled ||
              (multiple ? !toneSelection.length : !!note && !note.blank && !selectedTone)
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
          </ScoreToolButton>

          {!isDrums && (
            <ScoreToolButton
              type="button"
              disabled={disabled || multiple || !note || note.rest || note.blank}
              aria-label="꾸밈음 (박자 제외)"
              aria-keyshortcuts="G"
              title="꾸밈음 전환·해제 (G) · 뒤의 일반 음표 앞에서 짧게 재생하며 박자에 포함하지 않음"
              aria-pressed={note?.graceBeats !== undefined}
              onClick={toggleGrace}
            >
              꾸밈음 · 박자 제외 (G)
            </ScoreToolButton>
          )}
          {!isDrums && instrument.tuning.length > 0 && (
            <ScoreToolButton
              type="button"
              aria-label="리듬 슬래시 입력"
              title={
                instrument.id === 'bass'
                  ? '앞의 베이스 음을 선택한 길이로 다시 연주'
                  : '앞 코드를 선택한 길이로 다시 연주'
              }
              aria-pressed={!!note?.slash}
              disabled={disabled || multiple || !hasSelection || note?.graceBeats !== undefined}
              onClick={inputRhythmSlash}
            >
              / 리듬 슬래시
            </ScoreToolButton>
          )}
          {isDrums && (
            <ScoreToolButton
              disabled={disabled || !soundingSelection.length}
              aria-pressed={
                soundingSelection.length > 0 && soundingSelection.every((item) => item.slash)
              }
              onClick={() =>
                commit(
                  {
                    ...score,
                    notes: score.notes.map((item) =>
                      soundingSelection.includes(item)
                        ? { ...item, slash: !soundingSelection.every((n) => n.slash) }
                        : item,
                    ),
                  },
                  true,
                )
              }
            >
              / 슬래시 기보
            </ScoreToolButton>
          )}
          {isDrums && (
            <>
              {drumArticulations
                .filter(({ technique }) => technique !== 'choke')
                .map(({ technique, label }) => (
                  <ScoreToolButton
                    key={technique}
                    disabled={disabled || multiple || !activeDrumTechniques.includes(technique)}
                    aria-pressed={activeDrumTechnique === technique}
                    title={
                      activeDrumTechniques.includes(technique)
                        ? '선택한 타격에 적용 · 다시 누르면 해제'
                        : `${drumAtRow(activeString).label}에는 적용할 수 없어요.`
                    }
                    onClick={() => toggleDrumArticulation(technique)}
                  >
                    {label}
                  </ScoreToolButton>
                ))}
              <label>
                스티킹{' '}
                <select
                  aria-label="선택 음표 스티킹"
                  disabled={disabled || !soundingSelection.length}
                  value={soundingSelection[0]?.sticking ?? ''}
                  onChange={(e) =>
                    commit(
                      {
                        ...score,
                        notes: score.notes.map((item) =>
                          soundingSelection.includes(item)
                            ? {
                                ...item,
                                sticking: (e.target.value || undefined) as 'R' | 'L' | undefined,
                              }
                            : item,
                        ),
                      },
                      true,
                    )
                  }
                >
                  <option value="">없음</option>
                  <option>R</option>
                  <option>L</option>
                </select>
              </label>
            </>
          )}
        </div>
        {!isDrums && (
          <div className="guitar-inputbar score-connections" role="group" aria-label="연결">
            <span className="score-tool-group-label">연결</span>
            <ScoreToolButton
              icon={<ScoreConnectionIcon type="tie" />}
              disabled={disabled || !note || copiedSelection.length > 2}
              aria-label="붙임줄"
              aria-pressed={copiedSelection[0]?.connection?.type === 'tie'}
              title="붙임줄 · T · 같은 높이의 음을 다시 타격하지 않고 이어 연주 · 다시 누르면 해제"
              onClick={() => connectNotes('tie')}
            >
              붙임줄
            </ScoreToolButton>
            <ScoreToolButton
              disabled={disabled || isDrums || !note}
              icon={<ScoreConnectionIcon type="slur" />}
              aria-pressed={!!copiedSelection[0]?.slurTo}
              title="이음줄 · L · 두 음 이상의 구간을 부드럽게 이어 연주 · 붙임줄처럼 음 길이를 합치지 않음"
              onClick={slurNotes}
            >
              이음줄(슬러)
            </ScoreToolButton>
            {instrument.tuning.length > 0 && (
              <ScoreToolButton
                aria-label="해머링·풀링 (H/P)"
                icon={
                  <ScoreConnectionIcon type="hammerPull" label={hammerPull.plan?.label ?? 'H/P'} />
                }
                disabled={disabled || !hammerPull.plan}
                aria-pressed={hammerPull.plan?.applied ?? false}
                title={
                  hammerPull.error ||
                  `${hammerPull.plan?.label} · 같은 줄의 선택 구간에 자동 적용 · H/P 키 · 다시 누르면 해제`
                }
                onClick={connectHammerPull}
              >
                해머링·풀링 (H/P)
              </ScoreToolButton>
            )}
            {(Object.entries(scoreConnectionLabels) as [ScoreConnectionType, string][])
              .filter(
                ([type]) =>
                  type !== 'hammer' &&
                  type !== 'pull' &&
                  type !== 'tie' &&
                  instrument.tuning.length > 0,
              )
              .map(([type, label]) => (
                <ScoreToolButton
                  key={type}
                  icon={<ScoreConnectionIcon type={type} />}
                  disabled={disabled || isDrums || !note || copiedSelection.length > 2}
                  aria-label={label}
                  aria-pressed={copiedSelection[0]?.connection?.type === type}
                  title={`${label} · ${type === 'slide' ? '도착음을 다시 튕기지 않고 이어 연주 · J' : '도착음을 다시 튕겨 연주'} · 다른 줄도 가능 · 다시 누르면 해제`}
                  onClick={() => connectNotes(type)}
                >
                  {label}
                </ScoreToolButton>
              ))}
            {instrument.tuning.length > 0 &&
              (['in-up', 'in-down', 'out-up', 'out-down'] as const).map((variant) => {
                const edge = variant.startsWith('in') ? 'slideIn' : 'slideOut';
                const direction = variant.endsWith('up') ? 'up' : 'down';
                const label = `슬라이드 ${edge === 'slideIn' ? '인' : '아웃'} ${direction === 'up' ? '위로' : '아래로'}`;
                return (
                  <ScoreToolButton
                    key={variant}
                    icon={<ScoreConnectionIcon type={edge} direction={direction} />}
                    aria-label={label}
                    disabled={disabled || isDrums || !note}
                    aria-pressed={
                      copiedSelection.length > 0 &&
                      copiedSelection.every((item) => item[edge] === direction)
                    }
                    title={`${edge === 'slideIn' ? '목표 음으로 미끄러져 들어오기' : '목표 음에서 미끄러져 나가기'} · 다시 누르면 해제`}
                    onClick={() => {
                      try {
                        commit(
                          (edge === 'slideIn' ? setScoreSlideIn : setScoreSlideOut)(
                            score,
                            copiedSelection.map((item) => item.id),
                            direction,
                          ),
                          true,
                        );
                      } catch (error) {
                        setMessage((error as Error).message);
                      }
                      focus();
                    }}
                  >
                    {label}
                  </ScoreToolButton>
                );
              })}
            <ScoreToolButton
              disabled={disabled || !copiedSelection.some((n) => n.connection)}
              onClick={() => connectNotes(null)}
            >
              연결 해제
            </ScoreToolButton>
          </div>
        )}

        {isDrums && (
          <div className="score-measure-tools">
            <ScoreExpressionTools
              mode="percussion"
              score={score}
              part={part}
              bar={location.bar}
              ids={copiedSelection.map((n) => n.id)}
              disabled={disabled}
              onEdit={(next) => commit(next, true)}
              onError={setMessage}
            />
          </div>
        )}
        <div className="score-measure-tools">
          {' '}
          <ScoreExpressionTools
            score={score}
            part={part}
            bar={location.bar}
            ids={copiedSelection.map((n) => n.id)}
            disabled={disabled}
            onEdit={(next) => commit(next, true)}
            onError={setMessage}
          />
        </div>
        <div className="score-measure-tools">
          {' '}
          <ScoreExpressionTools
            mode="navigation"
            score={score}
            part={part}
            bar={location.bar}
            ids={copiedSelection.map((n) => n.id)}
            disabled={disabled || !hasSelection}
            onEdit={(next) => commit(next, true)}
            onError={setMessage}
          />
        </div>
        <div className="guitar-inputbar score-measure-tools score-measure-actions">
          <span className="score-tool-group-label">마디</span>
          <ScoreToolButton
            icon={<ScoreMeasureIcon name="beat" />}
            disabled={disabled || multiple}
            onClick={() => insert(create())}
          >
            빈 박 삽입
          </ScoreToolButton>
          <ScoreToolButton
            icon={<ScoreMeasureIcon name="fill" />}
            disabled={disabled || score.notes.length >= 2000}
            onClick={() => {
              try {
                const bar = hasSelection
                  ? location.bar
                  : scoreMeasureAtBeat(score, part, endBeat).bar;
                const used = (scoreMeasures(score, part)[bar] ?? []).reduce(
                  (sum, item) => scoreBeat(sum + item.beats),
                  0,
                );
                const remaining = scoreBeat(scoreBarBeats(score) - used);
                if (remaining <= 0) {
                  setMessage('이 마디는 이미 기준 박자만큼 채워져 있어요.');
                  return;
                }
                const item = {
                  ...create(),
                  blank: false,
                  rest: true,
                  tuplet: undefined,
                  beats: remaining,
                };
                commit(appendScoreMeasureNote(score, item, bar, used, () => crypto.randomUUID()));
                select(item.id);
              } catch (error) {
                setMessage((error as Error).message);
              }
            }}
          >
            쉼표로 마디 채우기
          </ScoreToolButton>
          <ScoreToolButton
            icon={<ScoreMeasureIcon name="append" />}
            disabled={disabled || score.notes.length >= 2000}
            onClick={addMeasure}
          >
            마디 추가
          </ScoreToolButton>
          <ScoreToolButton
            icon={<ScoreMeasureIcon name="insert" />}
            disabled={disabled || !hasSelection}
            onClick={() => changeMeasure(measure, 'insert')}
            title="선택 마디 앞에 모든 파트의 빈 마디 삽입"
          >
            마디 삽입
          </ScoreToolButton>
          <ScoreToolButton
            icon={<ScoreMeasureIcon name="delete" />}
            disabled={disabled || !hasSelection}
            onClick={() => changeMeasure(measure, 'delete')}
            title="선택 마디를 모든 파트에서 삭제 · 실행 취소 가능"
          >
            마디 삭제
          </ScoreToolButton>
          <ScoreToolButton
            icon={<ScoreMeasureIcon name="end" />}
            disabled={disabled}
            onClick={() => select(null)}
          >
            맨 끝에 입력
          </ScoreToolButton>
          <span className="score-toolbar-divider" aria-hidden="true" />
          <div className="score-measure-nav" role="group" aria-label="마디 줄 배치">
            <ScoreToolButton
              icon={<ScoreMeasureIcon name="up" />}
              disabled={disabled || !canMovePrevious}
              onClick={() => moveMeasure(-1)}
              title="선택 마디까지 이전 줄에 붙이기 · Page Up"
            >
              ↑ 이전 줄로
            </ScoreToolButton>
            <ScoreToolButton
              icon={<ScoreMeasureIcon name="down" />}
              disabled={disabled || !canMoveNext}
              onClick={() => moveMeasure(1)}
              title="선택 마디부터 다음 줄에 배치 · Page Down"
            >
              ↓ 다음 줄로
            </ScoreToolButton>
            <ScoreToolButton
              icon={<ScoreMeasureIcon name="reset" />}
              disabled={disabled || !score.systemLayout?.[layoutPart]?.length}
              onClick={() =>
                commit({ ...score, systemLayout: { ...score.systemLayout, [layoutPart]: [] } })
              }
            >
              기본 줄 배치
            </ScoreToolButton>
          </div>
          <span className="score-toolbar-divider" aria-hidden="true" />
          <ScoreToolButton
            icon={<ScoreMeasureIcon name="settings" />}
            disabled={disabled}
            onClick={(event) => {
              const bounds = event.currentTarget.getBoundingClientRect();
              setMeasureMenu({
                line: lineIndex,
                bar: measure,
                x: Math.max(8, Math.min(bounds.left, window.innerWidth - 290)),
                y: Math.max(8, Math.min(bounds.bottom, window.innerHeight - 360)),
              });
            }}
          >
            마디 설정
          </ScoreToolButton>
        </div>
        <div className="score-range-status" role="status">
          {' '}
          <strong className="score-location-readout" aria-label="현재 마디와 박">
            {playbackBeat !== null || hasSelection
              ? `${currentLocation.bar + 1}마디 · ${playbackBeat !== null ? Math.floor(currentLocation.offset) + 1 : Number((currentLocation.offset + 1).toFixed(3))}박`
              : ''}
          </strong>
          {multiple
            ? `${rangeNotes.length}개 박 선택 · ${rangeNotes.reduce((sum, item) => scoreBeat(sum + item.beats), 0)}박 길이 · 모든 줄 포함`
            : isDrums
              ? '↑↓로 오선 위치를 고르고 숫자키로 기호를 입력·변경하세요. Enter는 현재 기호 입력 · [ ] 길이 · R 선택 성부 쉼표'
              : isPitchedStaff
                ? isKeyboard
                  ? '↑↓ 오선 위치 · 1 조표 기본 · 2 변화음(샵/제자리) · Enter 현재 음 입력 · 같은 박에 입력하면 화음 · Delete 현재 위치 삭제'
                  : '↑↓ 음높이(반음) · ←→ 박 이동 · Enter / 1 입력 · 같은 박에 입력하면 화음 · [ ] 길이 · R 쉼표'
                : '악보의 칸을 선택해 음표를 입력하세요. Ctrl+←→ 마디 이동 · Ctrl+↑↓ 악보 줄 이동 · 드래그로 여러 박 선택'}
          <button onClick={deselect} style={{ visibility: multiple ? 'visible' : 'hidden' }}>
            선택 해제
          </button>
        </div>
        <div className="score-note-inspector">
          <strong>
            {multiple
              ? `${rangeNotes.length}개 박 선택 · ${rangeNotes.reduce((sum, item) => scoreBeat(sum + item.beats), 0)}박 길이`
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
              if (deleteSelectedMeasureRests()) return;
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
      </div>
      <div className="score-workspace">
        {voiceToolsHost &&
          (isDrums || isKeyboard) &&
          createPortal(
            <section className="score-voice-toggle" aria-label="악보 성부 선택">
              {[0, 1].map((index) => {
                const label = isDrums
                  ? index === 0
                    ? '위 성부 · 손'
                    : '아래 성부 · 발'
                  : index === 0
                    ? '오른손 성부'
                    : '왼손 성부';
                const enabled =
                  multiDrums || multiKeyboard || (part === voiceOwner ? index === 0 : index === 1);
                return (
                  <ScoreToolButton
                    key={index}
                    aria-label={label}
                    aria-pressed={enabled}
                    disabled={disabled || !onPartSelect}
                    title={`${label} · Ctrl+${index + 1} 단독 선택 · Ctrl+M 모두 켜기/해제 · 최소 한 성부 유지`}
                    icon={<ScoreVoiceIcon drums={isDrums} lower={index === 1} />}
                    onClick={() => toggleVoice(index)}
                  >
                    {label}
                  </ScoreToolButton>
                );
              })}
            </section>,
            voiceToolsHost,
          )}

        <div className="score-page">
          <header>
            <span>MOAJAM SCORE</span>
            <h2 className="score-editable-title">
              {titleDraft === null ? (
                <button
                  type="button"
                  aria-label="악보 이름 변경"
                  disabled={disabled}
                  onClick={() => {
                    cancelTitle.current = false;
                    setTitleDraft(score.title);
                  }}
                >
                  {score.title || '제목 없는 악보'}
                </button>
              ) : (
                <input
                  ref={titleInput}
                  aria-label="악보 이름"
                  maxLength={1000}
                  value={titleDraft}
                  onChange={(event) => setTitleDraft(event.target.value)}
                  onKeyDown={(event) => {
                    event.stopPropagation();
                    if (event.key === 'Escape') {
                      cancelTitle.current = true;
                      event.currentTarget.blur();
                    }
                    if (event.key === 'Enter' && !event.nativeEvent.isComposing)
                      event.currentTarget.blur();
                  }}
                  onBlur={() => {
                    if (!cancelTitle.current && titleDraft !== score.title)
                      commit({ ...score, title: titleDraft }, true, 'title');
                    setTitleDraft(null);
                    onEditComplete();
                  }}
                />
              )}
            </h2>
            <p>
              {ensemble
                ? '합주 악보'
                : `${scorePartOwner(score, part)} · ${partInstrumentLabel(score, part)}`}
            </p>
            {instrument.tuning.length > 0 && (
              <small>
                튜닝 {[...instrument.openTuning].reverse().map(pitchName).join(' – ')} ·{' '}
                {instrument.capo
                  ? `카포 ${instrument.capo}프렛 · TAB 숫자는 카포 기준입니다`
                  : '음높이를 유지하며 운지를 표시합니다'}
              </small>
            )}
          </header>
          <StaffView
            parts={displayParts}
            onPartSelect={selectStaffPart}
            activeVoice={
              (isDrums && !multiDrums) || (isKeyboard && !multiKeyboard) ? part : undefined
            }
            otherVoiceOpacity={0.3}
            onMeasureContextMenu={(bar, x, y) => {
              const line = systems.findIndex(
                (row) => bar >= row.start && bar < row.start + row.count,
              );
              setMeasureMenu({
                line,
                bar,
                x,
                y,
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
            playbackPosition={playbackPosition}
            zoom={zoom}
            onSelect={select}
            onDeleteMeasureRest={deleteMeasureRest}
            onAppend={(row, at, bar) => select(null, row, at, bar)}
            onChordSelect={selectChordPosition}
            emptyBeat={before}
            emptyMeasure={note ? undefined : emptyMeasure}
            inputBeats={selectedBeat}
            inputPitch={isPitchedStaff ? pitch : undefined}
            inputDrumNote={
              isDrums
                ? {
                    tone: {
                      ...writtenDrumTone,
                      pitch: currentDrumChoice.pitch,
                      drumTechnique: currentDrumChoice.technique,
                    },
                    beats: writtenBeat,
                    accent: note && !note.blank ? note.accent : articulation.accent,
                    staccato: note && !note.blank ? note.staccato : articulation.staccato,
                    marcato: note?.marcato,
                    slash: note?.slash,
                  }
                : undefined
            }
            showTab={showTab}
          />
        </div>
      </div>
      {measureMenu && !disabled && (
        <div
          className="score-measure-menu"
          ref={menu}
          popover="manual"
          role="dialog"
          aria-label={`${measureMenu.bar + 1}마디 설정`}
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
          <strong>{measureMenu.bar + 1}마디 설정</strong>
          <button onClick={() => changeMeasure(measureMenu.bar, 'insert')}>앞에 마디 삽입</button>
          <button onClick={() => changeMeasure(measureMenu.bar + 1, 'insert')}>
            뒤에 마디 삽입
          </button>
          <button onClick={() => changeMeasure(measureMenu.bar, 'delete')}>이 마디 삭제</button>
          <small>모든 파트에 적용돼요. Ctrl+Z로 되돌릴 수 있어요.</small>
          <label>
            마디 너비 비중{' '}
            <input
              type="number"
              aria-label="마디 너비 비중"
              min="10"
              max="500"
              step="1"
              key={`${part}/${measureMenu.bar}/${score.measureWidths?.[part]?.[measureMenu.bar] ?? 100}`}
              defaultValue={score.measureWidths?.[part]?.[measureMenu.bar] ?? 100}
              onKeyDown={(event) => {
                if (event.key === 'Enter') event.currentTarget.blur();
              }}
              onBlur={(event) => {
                try {
                  commit(
                    setScoreMeasureWidth(
                      score,
                      part,
                      measureMenu.bar,
                      Number(event.currentTarget.value),
                    ),
                  );
                } catch (error) {
                  setMessage((error as Error).message);
                  event.currentTarget.value = String(
                    score.measureWidths?.[part]?.[measureMenu.bar] ?? 100,
                  );
                }
              }}
            />
          </label>
          <small>기본 100 · 10~500 정수. 같은 줄 안에서 다른 마디와 너비를 나눠 가져요.</small>
          <label>
            마디 끝선
            <select
              aria-label="마디 끝선"
              value={score.barlines?.[measureMenu.bar] ?? 'single'}
              onChange={(event) => {
                const barlines = { ...score.barlines };
                if (event.target.value === 'double') barlines[measureMenu.bar] = 'double';
                else delete barlines[measureMenu.bar];
                commit({ ...score, barlines }, true);
              }}
            >
              <option value="single">세로선</option>
              <option value="double">겹세로선</option>
            </select>
          </label>
          <label>
            <input
              type="checkbox"
              checked={score.repeats?.[measureMenu.bar]?.start ?? false}
              onChange={(event) =>
                commit(
                  setScoreRepeat(score, measureMenu.bar, {
                    ...score.repeats?.[measureMenu.bar],
                    start: event.target.checked,
                  }),
                )
              }
            />{' '}
            도돌이표 시작
          </label>
          <label>
            <input
              type="checkbox"
              checked={score.repeats?.[measureMenu.bar]?.end ?? false}
              onChange={(event) =>
                commit(
                  setScoreRepeat(score, measureMenu.bar, {
                    ...score.repeats?.[measureMenu.bar],
                    end: event.target.checked,
                  }),
                )
              }
            />{' '}
            도돌이표 끝
          </label>
          <label>
            총 재생 횟수{' '}
            <select
              aria-label="도돌이표 총 재생 횟수"
              disabled={!score.repeats?.[measureMenu.bar]?.end}
              value={score.repeats?.[measureMenu.bar]?.times ?? 2}
              onChange={(event) =>
                commit(
                  setScoreRepeat(score, measureMenu.bar, {
                    ...score.repeats?.[measureMenu.bar],
                    times: Number(event.target.value),
                  }),
                )
              }
            >
              {[2, 3, 4, 5, 6, 7, 8].map((count) => (
                <option key={count}>{count}</option>
              ))}
            </select>
          </label>
          <small>
            시작 표시가 없으면 앞 구간 시작부터 반복해요. 도돌이표는 모든 파트에 적용돼요.
          </small>
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
                  measureWidths: {
                    ...score.measureWidths,
                    [part]: Object.fromEntries(
                      Object.entries(score.measureWidths?.[part] ?? {}).filter(
                        ([bar]) =>
                          Number(bar) < systems[measureMenu.line].start ||
                          Number(bar) >=
                            systems[measureMenu.line].start + systems[measureMenu.line].count,
                      ),
                    ),
                  },
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
      {message && (
        <p className="score-message" role="alert">
          {message}
        </p>
      )}
    </div>
  );
}
