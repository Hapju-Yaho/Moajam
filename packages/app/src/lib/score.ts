export type ScoreNote = {
  id: string;
  pitch: number;
  beats: number;
  rest: boolean;
  part: string;
  chord: string;
  lyric: string;
  accent: boolean;
};
export type Score = {
  title: string;
  bpm: number;
  notes: ScoreNote[];
  parts: string[];
  sync: Record<string, number>;
};
export const pitchName = (pitch: number) =>
  ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'][pitch % 12] +
  (Math.floor(pitch / 12) - 1);

export function renameScorePart(score: Score, previous: string | null, input: string): Score {
  const name = input.trim();
  if (!name || name.length > 40) throw new Error('파트 이름은 1~40자로 입력해주세요.');
  if (score.parts.some((part) => part === name && part !== previous))
    throw new Error('이미 같은 이름의 파트가 있어요.');
  if (previous !== null && !score.parts.includes(previous))
    throw new Error('파트를 찾을 수 없어요.');
  if (previous === null && score.parts.length >= 16)
    throw new Error('파트는 최대 16개까지 추가할 수 있어요.');
  return {
    ...score,
    parts:
      previous === null
        ? [...score.parts, name]
        : score.parts.map((part) => (part === previous ? name : part)),
    notes: score.notes.map((note) => (note.part === previous ? { ...note, part: name } : note)),
  };
}

export function removeScoreNotes(score: Score, ids: string[]): Score {
  const removed = new Set(ids);
  return {
    ...score,
    notes: score.notes.filter((note) => !removed.has(note.id)),
    sync: Object.fromEntries(Object.entries(score.sync).filter(([id]) => !removed.has(id))),
  };
}

export function removeScorePart(score: Score, part: string): Score {
  if (score.parts.length <= 1) throw new Error('최소 한 개의 파트가 필요해요.');
  return {
    ...removeScoreNotes(
      score,
      score.notes.filter((note) => note.part === part).map((note) => note.id),
    ),
    parts: score.parts.filter((name) => name !== part),
  };
}

export function insertScoreNote(score: Score, note: ScoreNote, after?: string | null): Score {
  if (score.notes.length >= 2000) throw new Error('음표는 최대 2,000개까지 입력할 수 있어요.');
  const index = after
    ? score.notes.findIndex((item) => item.id === after && item.part === note.part)
    : -1;
  const notes = [...score.notes];
  notes.splice(index < 0 ? notes.length : index + 1, 0, note);
  return { ...score, notes };
}

export function moveScoreNote(score: Score, id: string, direction: -1 | 1): Score {
  const current = score.notes.find((note) => note.id === id);
  if (!current) return score;
  const part = score.notes.filter((note) => note.part === current.part);
  const other = part[part.indexOf(current) + direction];
  if (!other) return score;
  const notes = [...score.notes];
  const from = notes.indexOf(current);
  const to = notes.indexOf(other);
  [notes[from], notes[to]] = [notes[to], notes[from]];
  return { ...score, notes };
}

export type ScoreFragment = {
  note: ScoreNote;
  beats: number;
  offset: number;
  continued: boolean;
  continues: boolean;
};
export function scoreMeasures(score: Score, part: string): ScoreFragment[][] {
  const measures: ScoreFragment[][] = [];
  let measure: ScoreFragment[] = [];
  let used = 0;
  for (const note of score.notes.filter((item) => item.part === part)) {
    if (
      !Number.isFinite(note.beats) ||
      note.beats <= 0 ||
      note.beats > 64 ||
      !Number.isInteger(note.beats * 4)
    )
      throw new Error('음표 길이는 16분음표 단위로 입력해주세요.');
    let remaining = note.beats;
    let continued = false;
    while (remaining > 0) {
      const beats = Math.min(4 - used, remaining);
      remaining -= beats;
      measure.push({ note, beats, offset: used, continued, continues: remaining > 0 });
      used += beats;
      continued = true;
      if (used === 4) {
        measures.push(measure);
        measure = [];
        used = 0;
      }
    }
  }
  if (measure.length || !measures.length) measures.push(measure);
  return measures;
}

// Diatonic steps from E4 (bottom line of the treble staff), with sharps on the same staff step.
export function staffPosition(pitch: number): number {
  const steps = [0, 0, 1, 1, 2, 3, 3, 4, 4, 5, 5, 6];
  return (Math.floor(pitch / 12) - 5) * 7 + steps[pitch % 12] - 2;
}
const escape = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');

// Quarter-note divisions are 4; split notes at 4/4 bar lines and tie pitched fragments.
export function scoreToMusicXml(score: Score): string {
  const parts = score.parts
    .map(
      (name, i) => `<score-part id="P${i + 1}"><part-name>${escape(name)}</part-name></score-part>`,
    )
    .join('');
  const bodies = score.parts
    .map((name, i) => {
      const measures: string[] = [];
      let contents = '';
      let used = 0;
      const finish = () => {
        measures.push(contents);
        contents = '';
        used = 0;
      };
      for (const note of score.notes.filter((item) => item.part === name)) {
        if (
          !Number.isFinite(note.beats) ||
          note.beats <= 0 ||
          note.beats > 64 ||
          !Number.isInteger(note.beats * 4) ||
          !Number.isInteger(note.pitch) ||
          note.pitch < 0 ||
          note.pitch > 127
        )
          throw new Error('음표의 음정과 길이를 확인해주세요.');
        let remaining = Math.round(note.beats * 4);
        let continued = false;
        while (remaining > 0) {
          const duration = Math.min(16 - used, remaining);
          remaining -= duration;
          const ties = note.rest
            ? ''
            : `${continued ? '<tie type="stop"/>' : ''}${remaining ? '<tie type="start"/>' : ''}`;
          const notation = `${!note.rest && continued ? '<tied type="stop"/>' : ''}${!note.rest && remaining ? '<tied type="start"/>' : ''}${note.accent && !continued ? '<articulations><accent/></articulations>' : ''}`;
          if (note.chord && !continued)
            contents += `<direction><direction-type><words>${escape(note.chord)}</words></direction-type></direction>`;
          const pitch = pitchName(note.pitch);
          contents += `<note>${note.rest ? '<rest/>' : `<pitch><step>${pitch[0]}</step>${pitch.includes('♯') ? '<alter>1</alter>' : ''}<octave>${Math.floor(note.pitch / 12) - 1}</octave></pitch>`}<duration>${duration}</duration>${ties}${notation ? `<notations>${notation}</notations>` : ''}${note.lyric && !continued ? `<lyric><text>${escape(note.lyric)}</text></lyric>` : ''}</note>`;
          used += duration;
          continued = true;
          if (used === 16) finish();
        }
      }
      if (used || !measures.length) {
        if (used < 16) contents += `<note><rest/><duration>${16 - used}</duration></note>`;
        finish();
      }
      return `<part id="P${i + 1}">${measures.map((measure, index) => `<measure number="${index + 1}">${index === 0 ? `<attributes><divisions>4</divisions><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes><direction><sound tempo="${score.bpm}"/></direction>` : ''}${measure}</measure>`).join('')}</part>`;
    })
    .join('');
  return `<?xml version="1.0" encoding="UTF-8"?><score-partwise version="4.0"><work><work-title>${escape(score.title)}</work-title></work><part-list>${parts}</part-list>${bodies}</score-partwise>`;
}
