import {
  isScoreBeat,
  scoreRhythmFeels,
  scoreBeat,
  noteTones,
  connectionError,
  type ScoreConnectionType,
  scoreInstruments,
  SCORE_DIVISIONS,
  type Score,
  type ScoreNote,
  type ScoreTone,
} from './score';

// One rhythmic voice per part; all pitches of a chord share duration and ties.
export function scoreFromMusicXml(text: string, makeId = () => crypto.randomUUID()): Score {
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  const invalid = () =>
    new Error(
      '일정한 조표·박자표의 MusicXML을 선택해주세요. 같은 박의 코드는 지원하며, 셋잇단음표(3:2)를 지원하며 다성부·꾸밈음·다른 잇단음표는 아직 지원하지 않습니다.',
    );
  if (
    doc.doctype ||
    doc.querySelector('parsererror') ||
    !doc.querySelector('score-partwise') ||
    doc.querySelector('backup,forward,grace')
  )
    throw invalid();
  const times = [...doc.querySelectorAll('time')].map((time) => ({
    beats: Number(time.querySelector('beats')?.textContent),
    beatType: Number(time.querySelector('beat-type')?.textContent),
  }));
  const timeSignature = times[0] ?? { beats: 4, beatType: 4 };
  if (
    times.some(
      (time) =>
        !Number.isInteger(time.beats) ||
        time.beats < 1 ||
        time.beats > 16 ||
        ![2, 4, 8, 16].includes(time.beatType) ||
        time.beats !== timeSignature.beats ||
        time.beatType !== timeSignature.beatType,
    )
  )
    throw invalid();
  const keys = [...doc.querySelectorAll('key fifths')].map((key) => Number(key.textContent));
  const keySignature = keys[0] ?? 0;
  if (keys.some((key) => !Number.isInteger(key) || Math.abs(key) > 7 || key !== keySignature))
    throw invalid();
  const barBeats = (timeSignature.beats * 4) / timeSignature.beatType;
  const feels = [...doc.querySelectorAll('sound > swing')].map((node) => {
    if (node.querySelector('straight')) return 'straight' as const;
    const first = Number(node.querySelector('first')?.textContent);
    const second = Number(node.querySelector('second')?.textContent);
    const type = node.querySelector('swing-type')?.textContent;
    const unit = type === 'eighth' ? 0.5 : type === '16th' ? 0.25 : null;
    const match = Object.entries(scoreRhythmFeels).find(
      ([, feel]) =>
        feel.unit === unit &&
        first > 0 &&
        second > 0 &&
        feel.first / feel.second === first / second,
    );
    const measure = node.closest('measure');
    if (
      !match ||
      node.querySelector('swing-style') ||
      (measure && measure !== measure.parentElement?.querySelector('measure'))
    )
      throw new Error('곡 전체에 같은 8분·16분음표 리듬 느낌을 적용한 악보만 가져올 수 있어요.');
    return match[0] as NonNullable<Score['rhythmFeel']>;
  });
  if (new Set(feels).size > 1)
    throw new Error('곡 중간에 바뀌는 리듬 느낌은 아직 지원하지 않아요.');
  const measureLengths: NonNullable<Score['measureLengths']> = {};
  const measureWidths: NonNullable<Score['measureWidths']> = {};
  const repeats: NonNullable<Score['repeats']> = {};
  const barlines: NonNullable<Score['barlines']> = {};
  const tempos = [...doc.querySelectorAll('sound[tempo]')].map((node) =>
    Number(node.getAttribute('tempo')),
  );
  for (const metronome of doc.querySelectorAll('metronome')) {
    if (
      metronome.querySelector('beat-unit')?.textContent !== 'quarter' ||
      metronome.querySelector('beat-unit-dot')
    )
      throw new Error('4분음표 기준 템포만 가져올 수 있어요.');
    tempos.push(Number(metronome.querySelector('per-minute')?.textContent));
  }
  if (tempos.some((tempo) => !Number.isFinite(tempo) || tempo <= 0) || new Set(tempos).size > 1)
    throw new Error(
      '곡 중간의 템포 변화는 아직 지원하지 않아요. 일정한 BPM의 악보를 선택해주세요.',
    );
  if (tempos.some((tempo) => !Number.isInteger(tempo) || tempo < 30 || tempo > 300))
    throw new Error('BPM은 30~300 사이의 정수만 가져올 수 있어요.');
  const harmonyName = (harmony: Element): string => {
    if (
      harmony.querySelector('degree,inversion,numeral,function') ||
      harmony.querySelectorAll('kind').length !== 1
    )
      throw new Error('이 MusicXML에는 아직 지원하지 않는 코드 구성이나 전위 표기가 있어요.');
    const kind = harmony.querySelector('kind')!;
    const suffixes: Record<string, string> = {
      major: '',
      minor: 'm',
      augmented: 'aug',
      diminished: 'dim',
      dominant: '7',
      'major-seventh': 'maj7',
      'minor-seventh': 'm7',
      'diminished-seventh': 'dim7',
      'augmented-seventh': 'aug7',
      'half-diminished': 'm7♭5',
      'major-minor': 'm(maj7)',
      'major-sixth': '6',
      'minor-sixth': 'm6',
      'dominant-ninth': '9',
      'major-ninth': 'maj9',
      'minor-ninth': 'm9',
      'dominant-11th': '11',
      'major-11th': 'maj11',
      'minor-11th': 'm11',
      'dominant-13th': '13',
      'major-13th': 'maj13',
      'minor-13th': 'm13',
      'suspended-second': 'sus2',
      'suspended-fourth': 'sus4',
      power: '5',
    };
    if (kind.textContent?.trim() === 'none') return 'N.C.';
    const rootName = (type: 'root' | 'bass') => {
      const step = harmony.querySelector(`${type}-step`)?.textContent?.trim() ?? '';
      const alter = Number(harmony.querySelector(`${type}-alter`)?.textContent ?? 0);
      if (!/^[A-G]$/.test(step) || !Number.isInteger(alter) || Math.abs(alter) > 2) throw invalid();
      return step + (alter > 0 ? '♯'.repeat(alter) : '♭'.repeat(-alter));
    };
    const suffix = kind.getAttribute('text') || suffixes[kind.textContent?.trim() ?? ''];
    if (suffix === undefined) throw new Error('이 MusicXML의 코드 종류는 아직 지원하지 않아요.');
    const name =
      rootName('root') + suffix + (harmony.querySelector('bass') ? `/${rootName('bass')}` : '');
    if (name.length > 40) throw new Error('코드 이름은 40자까지 가져올 수 있어요.');
    return name;
  };
  const definitions = [...doc.querySelectorAll('score-part')];
  const parts = definitions.map(
    (node) => node.querySelector('part-name')?.textContent?.trim() || 'Part',
  );
  if (!parts.length || parts.length > 16 || new Set(parts).size !== parts.length) throw invalid();
  const instruments: Record<string, string> = {};
  const notes: ScoreNote[] = [];
  const measureChords: NonNullable<Score['measureChords']> = {};
  const beatChords: NonNullable<Score['beatChords']> = {};
  const bodies = [...doc.querySelectorAll('score-partwise > part')];
  if (bodies.length !== parts.length) throw invalid();
  const definitionIds = definitions.map((node) => node.getAttribute('id'));
  const bodyIds = bodies.map((node) => node.getAttribute('id'));
  if (
    definitionIds.some((id) => !id) ||
    new Set(definitionIds).size !== parts.length ||
    new Set(bodyIds).size !== parts.length
  )
    throw invalid();
  for (const element of bodies) {
    const index = definitions.findIndex(
      (node) => node.getAttribute('id') === element.getAttribute('id'),
    );
    if (index < 0) throw invalid();
    const part = parts[index];
    const instrument = definitions[index].querySelector('instrument-name')?.textContent;
    if (instrument && instrument in scoreInstruments) instruments[part] = instrument;
    const voices = new Set(
      [...element.querySelectorAll('note voice')].map((node) => node.textContent),
    );
    if (voices.size > 1) throw invalid();
    let division = 1,
      tied: ScoreNote | undefined;
    let pendingConnection: { note: ScoreNote; type: ScoreConnectionType } | undefined;
    let measureIndex = 0,
      measureStart = 0;
    const pendingSlurs = new Map<string, ScoreNote>();
    for (const measure of element.querySelectorAll('measure')) {
      const marker: { start?: boolean; end?: boolean; times?: number } = {};
      if (measure.querySelector('repeat[direction="forward"]')) marker.start = true;
      const repeatEnd = measure.querySelector('repeat[direction="backward"]');
      if (repeatEnd) {
        marker.end = true;
        marker.times = Number(repeatEnd.getAttribute('times') ?? 2);
        if (!Number.isInteger(marker.times) || marker.times < 2 || marker.times > 8)
          throw invalid();
      }
      if (index === 0 && (marker.start || marker.end)) repeats[measureIndex] = marker;
      if (index > 0 && JSON.stringify(repeats[measureIndex] ?? {}) !== JSON.stringify(marker))
        throw new Error('파트별 도돌이표가 다른 악보는 아직 지원하지 않아요.');
      const doubleBar = [...measure.querySelectorAll('barline')].some(
        (line) =>
          (line.getAttribute('location') ?? 'right') === 'right' &&
          line.querySelector('bar-style')?.textContent === 'light-light',
      );
      if (index === 0 && doubleBar) barlines[measureIndex] = 'double';
      if (index > 0 && doubleBar !== (barlines[measureIndex] === 'double'))
        throw new Error('파트별 겹세로선 위치가 다른 악보는 아직 지원하지 않아요.');
      const width = Number(measure.getAttribute('width') ?? 100);
      if (Number.isFinite(width) && width >= 10 && width <= 500)
        (measureWidths[part] ??= {})[measureIndex] = Math.round(width);
      const divisions = measure.querySelector('divisions');
      if (divisions) division = Number(divisions.textContent);
      if (
        !Number.isFinite(division) ||
        division <= 0 ||
        measure.querySelectorAll('divisions').length > 1
      )
        throw invalid();
      const capacity =
        measure.getAttribute('implicit') === 'yes'
          ? [...measure.querySelectorAll('note')]
              .filter((node) => !node.querySelector('chord'))
              .reduce(
                (sum, node) =>
                  scoreBeat(sum + Number(node.querySelector('duration')?.textContent) / division),
                0,
              ) || barBeats
          : barBeats;
      if (
        !Number.isFinite(capacity) ||
        capacity < 1 / SCORE_DIVISIONS ||
        capacity > 128000 ||
        !isScoreBeat(capacity)
      )
        throw invalid();
      if (capacity !== barBeats) (measureLengths[part] ??= {})[measureIndex] = capacity;
      let position = 0;
      for (const child of measure.children) {
        if (child.tagName === 'harmony') {
          const at = position + Number(child.querySelector('offset')?.textContent ?? 0) / division;
          if (!Number.isFinite(at) || at < 0 || at >= capacity || !isScoreBeat(at)) throw invalid();
          (beatChords[part] ??= {})[measureStart + at] = harmonyName(child);
        } else if (child.tagName === 'note' && !child.querySelector('chord')) {
          position += Number(child.querySelector('duration')?.textContent) / division;
        }
      }
      for (const direction of measure.querySelectorAll('direction[id^="moajam-beat-chord-"]')) {
        const offset = Number(direction.querySelector('offset')?.textContent ?? 0) / division;
        if (!Number.isFinite(offset) || offset < 0 || offset >= capacity || !isScoreBeat(offset))
          throw invalid();
        const chord = direction.querySelector('words')?.textContent;
        if (chord?.trim()) (beatChords[part] ??= {})[measureStart + offset] = chord.slice(0, 40);
      }
      const chord = measure.querySelector(
        'direction[id^="moajam-measure-chord-"] words',
      )?.textContent;
      if (chord?.trim()) (measureChords[part] ??= {})[measureIndex] = chord.slice(0, 40);
      measureIndex++;
      const groups: {
        note: ScoreNote;
        start: boolean;
        stop: boolean;
        incoming?: ScoreConnectionType;
        outgoing?: ScoreConnectionType;
        slurStarts?: string[];
        slurStops?: string[];
      }[] = [];
      for (const node of measure.querySelectorAll('note')) {
        const rest = !!node.querySelector('rest');
        if (!rest && (!node.querySelector('pitch step') || !node.querySelector('pitch octave')))
          throw invalid();
        const step = node.querySelector('pitch step')?.textContent ?? 'C';
        const octave = Number(node.querySelector('pitch octave')?.textContent ?? 4);
        const pitch =
          (octave + 1) * 12 +
          ({ C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[step as 'C'] ?? NaN) +
          Number(node.querySelector('pitch alter')?.textContent ?? 0);
        const beats = Number(node.querySelector('duration')?.textContent) / division;
        const modification = node.querySelector('time-modification');
        if (
          modification &&
          (Number(modification.querySelector('actual-notes')?.textContent) !== 3 ||
            Number(modification.querySelector('normal-notes')?.textContent) !== 2)
        )
          throw invalid();
        const tuplet = modification ? (3 as const) : undefined;
        if (
          !Number.isFinite(beats) ||
          beats <= 0 ||
          beats > 4 ||
          !isScoreBeat(beats) ||
          !Number.isInteger(pitch) ||
          pitch < 0 ||
          pitch > 127
        )
          throw invalid();
        const tone: ScoreTone = {
          pitch,
          ghost: !rest && node.querySelector('notehead')?.getAttribute('parentheses') === 'yes',
          dead: !rest && node.querySelector('notehead')?.textContent?.trim() === 'x',
        };
        const string = node.querySelector('technical string'),
          fret = node.querySelector('technical fret');
        if (string && fret) {
          tone.string = Number(string.textContent);
          tone.fret = Number(fret.textContent);
          if (
            !Number.isInteger(tone.string) ||
            tone.string < 1 ||
            tone.string > 6 ||
            !Number.isInteger(tone.fret) ||
            tone.fret < 0 ||
            tone.fret > 24
          )
            throw invalid();
        }
        const connectionAt = (edge: 'start' | 'stop'): ScoreConnectionType | undefined => {
          const types: ScoreConnectionType[] = [];
          if (node.querySelector(`hammer-on[type="${edge}"]`)) types.push('hammer');
          if (node.querySelector(`pull-off[type="${edge}"]`)) types.push('pull');
          if (node.querySelector(`slide[type="${edge}"]`)) types.push('slide');
          if (node.querySelector(`glissando[type="${edge}"]`)) types.push('glissando');
          if (node.querySelector(`tied[id^="moajam-manual-tie-${edge}-"]`)) types.push('tie');
          if (types.length > 1)
            throw new Error('한 음표에 겹친 연결 주법은 아직 가져올 수 없어요.');
          return types[0];
        };
        const incoming = connectionAt('stop'),
          outgoing = connectionAt('start');
        const start = !!node.querySelector('tie[type="start"]') && outgoing !== 'tie',
          stop = !!node.querySelector('tie[type="stop"]') && incoming !== 'tie';
        if (node.querySelector('chord')) {
          const group = groups.at(-1);
          if (
            !group ||
            rest ||
            group.note.rest ||
            group.note.beats !== scoreBeat(beats) ||
            group.note.tuplet !== tuplet ||
            group.start !== start ||
            group.stop !== stop ||
            group.incoming !== incoming ||
            group.outgoing !== outgoing
          )
            throw invalid();
          group.note.tones!.push(tone);
          if (group.note.tones!.length > 16) throw invalid();
        } else
          groups.push({
            slurStarts: [...node.querySelectorAll('slur[type="start"]')]
              .filter(
                (slur) =>
                  slur.id.startsWith('moajam-slur-') || !node.querySelector('hammer-on,pull-off'),
              )
              .map((slur) => slur.getAttribute('number') ?? '1'),
            slurStops: [...node.querySelectorAll('slur[type="stop"]')]
              .filter(
                (slur) =>
                  slur.id.startsWith('moajam-slur-') || !node.querySelector('hammer-on,pull-off'),
              )
              .map((slur) => slur.getAttribute('number') ?? '1'),
            incoming,
            outgoing,
            start,
            stop,
            note: {
              id: makeId(),
              part,
              pitch,
              beats: scoreBeat(beats),
              tuplet,
              rest,
              blank: rest && node.getAttribute('print-object') === 'no',
              tones: rest ? [] : [tone],
              chord:
                node.previousElementSibling?.id.startsWith('moajam-measure-chord-') ||
                node.previousElementSibling?.id.startsWith('moajam-beat-chord-')
                  ? ''
                  : (node.previousElementSibling?.querySelector('direction-type words')
                      ?.textContent ?? ''),
              lyric: node.querySelector('lyric text')?.textContent ?? '',
              accent: !!node.querySelector('accent'),
              staccato: !rest && !!node.querySelector('staccato'),
              slideOut:
                !rest && node.querySelector('doit')
                  ? 'up'
                  : !rest && node.querySelector('falloff')
                    ? 'down'
                    : undefined,
            },
          });
      }
      const used = groups.reduce((sum, group) => scoreBeat(sum + group.note.beats), 0);
      if (used > capacity) throw invalid();
      for (const group of groups) {
        let item = group.note;
        if (group.stop) {
          if (
            !tied ||
            item.rest ||
            noteTones(tied)
              .map((t) => t.pitch)
              .sort()
              .join(',') !==
              noteTones(item)
                .map((t) => t.pitch)
                .sort()
                .join(',')
          )
            throw invalid();
          tied.beats = scoreBeat(tied.beats + item.beats);
          if (item.slideOut) tied.slideOut = item.slideOut;
          item = tied;
        } else {
          if (tied) throw invalid();
          notes.push(item);
        }
        for (const number of group.slurStops ?? []) {
          const from = pendingSlurs.get(number);
          if (!from || from.id === item.id) throw invalid();
          from.slurTo = item.id;
          pendingSlurs.delete(number);
        }
        for (const number of group.slurStarts ?? []) {
          if (pendingSlurs.has(number)) throw invalid();
          pendingSlurs.set(number, item);
        }
        tied = group.start ? item : undefined;
        if (group.incoming) {
          if (
            !pendingConnection ||
            pendingConnection.type !== group.incoming ||
            notes.at(-2)?.id !== pendingConnection.note.id ||
            connectionError(pendingConnection.note, item, group.incoming)
          )
            throw new Error('연결 주법의 두 음표와 줄·음높이를 확인해주세요.');
          pendingConnection.note.connection = { type: group.incoming, targetId: item.id };
          pendingConnection = undefined;
        } else if (pendingConnection && pendingConnection.note !== item) {
          throw new Error('연결 주법은 이어지는 두 음표에서만 가져올 수 있어요.');
        }
        if (group.outgoing) pendingConnection = { note: item, type: group.outgoing };
        if (item.beats > 64) throw invalid();
      }
      if (used < capacity) {
        if (tied) throw invalid();
        notes.push({
          id: makeId(),
          part,
          pitch: 60,
          beats: scoreBeat(capacity - used),
          rest: true,
          blank: true,
          tones: [],
          chord: '',
          lyric: '',
          accent: false,
        });
      }
      measureStart = scoreBeat(measureStart + capacity);
    }
    if (tied || pendingConnection || pendingSlurs.size) throw invalid();
  }
  if (notes.length > 2000) throw invalid();
  return {
    title: doc.querySelector('work-title')?.textContent || '가져온 악보',
    bpm: tempos[0] ?? 120,
    timeSignature,
    keySignature,
    ...(feels.length ? { rhythmFeel: feels[0] } : {}),
    measureLengths,
    measureWidths,
    repeats,
    barlines,
    parts,
    instruments,
    measureChords,
    beatChords,
    notes,
    sync: {},
  };
}
