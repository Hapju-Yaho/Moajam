import { readNoteExpression, readScoreDirections, readScoreNavigation } from './scoreExpression';
import { readGuitarToneChanges } from './scoreGuitar';
import {
  readScoreMultiMeasureRests,
  readScoreCapos,
  isScoreBeat,
  scoreRhythmFeels,
  scoreBeat,
  noteTones,
  validDrumTechnique,
  validNaturalPitch,
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
      '일정한 조표·박자표의 MusicXML을 선택해주세요. 같은 박의 코드는 지원하며, 셋잇단음표(3:2)를 지원하며 다성부·다른 잇단음표는 아직 지원하지 않습니다.',
    );
  // Our compact slide is a grace note plus one timed destination; it never consumes another beat.
  const graceSlides = new Map<Element, NonNullable<ScoreNote['graceSlide']>>();
  for (const node of doc.querySelectorAll('note[id^="moajam-grace-slide-"]')) {
    const target = node.nextElementSibling;
    const stop = target?.querySelector('slide[type="stop"][number="6"]');
    if (
      !node.querySelector('grace') ||
      node.querySelector('duration') ||
      !target ||
      target.tagName !== 'note' ||
      !stop ||
      !node.querySelector('slide[type="start"][number="6"]')
    )
      throw invalid();
    const step = node.querySelector('pitch step')?.textContent ?? '';
    const octave = Number(node.querySelector('pitch octave')?.textContent);
    const pitch =
      (octave + 1) * 12 +
      ({ C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[step as 'C'] ?? NaN) +
      Number(node.querySelector('pitch alter')?.textContent ?? 0);
    const metadata = readNoteExpression({
      graceSlide: {
        pitch,
        string: Number(node.querySelector('technical string')?.textContent),
        fret: Number(node.querySelector('technical fret')?.textContent),
      },
    });
    graceSlides.set(target, metadata.graceSlide!);
    stop.remove();
    node.remove();
  }
  if (
    doc.doctype ||
    doc.querySelector('parsererror') ||
    !doc.querySelector('score-partwise') ||
    doc.querySelector('backup,forward')
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
  const keyboardStaves: Record<string, string> = {};
  const keyboardMetadata = doc.querySelector(
    'miscellaneous-field[name="moajam-keyboard-staves"]',
  )?.textContent;
  if (keyboardMetadata) {
    const value: unknown = JSON.parse(keyboardMetadata);
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalid();
    for (const [right, left] of Object.entries(value)) {
      if (
        typeof left !== 'string' ||
        !parts.includes(right) ||
        !parts.includes(left) ||
        right === left ||
        Object.hasOwn(value, left) ||
        Object.values(keyboardStaves).includes(left)
      )
        throw invalid();
      keyboardStaves[right] = left;
    }
  }
  const instruments: Record<string, string> = {};
  const drumVoices: Record<string, string> = {};
  const drumMetadata = doc.querySelector(
    'miscellaneous-field[name="moajam-drum-voices"]',
  )?.textContent;
  if (drumMetadata) {
    const value: unknown = JSON.parse(drumMetadata);
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalid();
    const occupied = new Set(Object.entries(keyboardStaves).flat());
    for (const [upper, lower] of Object.entries(value)) {
      if (
        typeof lower !== 'string' ||
        !parts.includes(upper) ||
        !parts.includes(lower) ||
        upper === lower ||
        occupied.has(upper) ||
        occupied.has(lower)
      )
        throw invalid();
      occupied.add(upper);
      occupied.add(lower);
      drumVoices[upper] = lower;
    }
  }
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
    const percussionPitches = new Map(
      [...definitions[index].querySelectorAll('midi-instrument')]
        .filter((node) => node.querySelector('midi-unpitched'))
        .map((node) => [
          node.getAttribute('id'),
          Number(node.querySelector('midi-unpitched')!.textContent) - 1,
        ]),
    );
    if (element.querySelector('unpitched')) instruments[part] = 'drums';
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
        const unpitched = !!node.querySelector('unpitched');
        if (
          !rest &&
          !unpitched &&
          (!node.querySelector('pitch step') || !node.querySelector('pitch octave'))
        )
          throw invalid();
        const step = node.querySelector('pitch step')?.textContent ?? 'C';
        const octave = Number(node.querySelector('pitch octave')?.textContent ?? 4);
        const pitch = unpitched
          ? (percussionPitches.get(node.querySelector('instrument')?.getAttribute('id') ?? null) ??
            NaN)
          : (octave + 1) * 12 +
            ({ C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[step as 'C'] ?? NaN) +
            Number(node.querySelector('pitch alter')?.textContent ?? 0);
        const grace = !!node.querySelector('grace');
        const beats = grace ? 0 : Number(node.querySelector('duration')?.textContent) / division;
        const graceBeats = grace
          ? Number(
              (node.id.startsWith('moajam-grace-note-')
                ? Number(node.id.split('-').at(-1)) / SCORE_DIVISIONS
                : undefined) ??
                {
                  whole: 4,
                  half: 2,
                  quarter: 1,
                  eighth: 0.5,
                  '16th': 0.25,
                  '32nd': 0.125,
                  '64th': 0.0625,
                }[node.querySelector('type')?.textContent ?? 'eighth'] ??
                0.5,
            )
          : undefined;
        if (
          grace &&
          (rest ||
            node.querySelector('duration') ||
            !Number.isFinite(graceBeats) ||
            graceBeats! <= 0 ||
            graceBeats! > 64)
        )
          throw invalid();
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
          (beats <= 0 && !grace) ||
          beats > 4 ||
          !isScoreBeat(beats) ||
          !Number.isInteger(pitch) ||
          pitch < 0 ||
          pitch > 127
        )
          throw invalid();
        const naturalPitch = pitch - Number(node.querySelector('pitch alter')?.textContent ?? 0);
        const tone: ScoreTone = {
          pitch,
          ...(!rest &&
          !unpitched &&
          !node.querySelector('technical string') &&
          validNaturalPitch(pitch, naturalPitch)
            ? { naturalPitch }
            : {}),
          ghost: !rest && node.querySelector('notehead')?.getAttribute('parentheses') === 'yes',
          dead: !rest && !unpitched && node.querySelector('notehead')?.textContent?.trim() === 'x',
        };
        if (unpitched) {
          const technique = node.querySelector('technical half-muted')
            ? 'half-open'
            : node.querySelector('technical stopped')
              ? 'closed'
              : pitch === 44 && node.querySelector('technical open')
                ? 'open'
                : pitch === 38 && node.querySelector('notehead')?.textContent?.trim() === 'x'
                  ? 'rimshot'
                  : ([...node.querySelectorAll('technical other-technical')]
                      .map((item) => item.textContent)
                      .find((value) =>
                        [
                          'choke',
                          'rimshot',
                          'double',
                          'buzz',
                          'flam',
                          'drag',
                          'roll2',
                          'roll3',
                        ].includes(value ?? ''),
                      ) ?? undefined);
          if (technique) {
            if (!validDrumTechnique(pitch, technique)) throw invalid();
            tone.drumTechnique = technique;
          }
        }
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
              ...(graceSlides.has(node) ? { graceSlide: graceSlides.get(node) } : {}),
              beats: scoreBeat(beats),
              ...(grace ? { graceBeats } : {}),
              tuplet,
              rest,
              blank: rest && node.getAttribute('print-object') === 'no',
              tones: rest ? [] : [tone],
              chord:
                node.previousElementSibling?.id.startsWith('moajam-measure-chord-') ||
                node.previousElementSibling?.id.startsWith('moajam-beat-chord-') ||
                node.previousElementSibling?.id.startsWith('moajam-capo-') ||
                node.previousElementSibling?.id.startsWith('moajam-expression-') ||
                node.previousElementSibling?.id.startsWith('moajam-guitar-tone-')
                  ? ''
                  : (node.previousElementSibling?.querySelector('direction-type words')
                      ?.textContent ?? ''),
              lyric: node.querySelector('lyric text')?.textContent ?? '',
              accent: !!node.querySelector('accent'),
              marcato: !!node.querySelector('strong-accent'),
              staccato:
                !rest &&
                (tone.drumTechnique !== 'choke' ||
                  [...node.querySelectorAll('technical other-technical')].some(
                    (item) => item.textContent === 'moajam-beat-staccato',
                  )) &&
                !!node.querySelector('staccato'),
              slideIn:
                !rest && node.querySelector('scoop')
                  ? 'up'
                  : !rest && node.querySelector('plop')
                    ? 'down'
                    : undefined,
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
  for (const [upper, lower] of Object.entries(drumVoices))
    if (instruments[upper] !== 'drums' || instruments[lower] !== 'drums') throw invalid();
  const expression = JSON.parse(
    doc.querySelector('miscellaneous-field[name="moajam-expression"]')?.textContent || '{}',
  );
  const directions = readScoreDirections(expression.directions ?? {}, parts),
    navigation = readScoreNavigation(expression.navigation ?? {});
  if (expression.notes !== undefined) {
    if (!Array.isArray(expression.notes) || expression.notes.length !== parts.length)
      throw invalid();
    parts.forEach((part, index) => {
      const metadata = expression.notes[index];
      if (!Array.isArray(metadata) || metadata.length > 2000) throw invalid();
      let beat = 0;
      const graceEntries = metadata.filter((e) => e?.beats === 0 && e?.graceBeats !== undefined);
      for (const note of notes.filter((n) => n.part === part)) {
        const entry =
          note.graceBeats !== undefined
            ? graceEntries.shift()
            : metadata.find(
                (e) =>
                  e &&
                  typeof e.beat === 'number' &&
                  typeof e.beats === 'number' &&
                  e.beat <= beat &&
                  beat < e.beat + e.beats,
              );
        if (entry) Object.assign(note, readNoteExpression(entry));
        beat = scoreBeat(beat + note.beats);
      }
    });
  }
  if (
    expression.systemGap !== undefined &&
    (!Number.isInteger(expression.systemGap) ||
      expression.systemGap < 0 ||
      expression.systemGap > 160)
  )
    throw invalid();
  return {
    title: doc.querySelector('work-title')?.textContent || '가져온 악보',
    ...(expression.systemGap === undefined ? {} : { systemGap: expression.systemGap }),
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
    capos: readScoreCapos(
      JSON.parse(
        doc.querySelector('miscellaneous-field[name="moajam-capos"]')?.textContent || '{}',
      ),
      parts,
    ),
    keyboardStaves,
    drumVoices,
    multiMeasureRests: readScoreMultiMeasureRests(
      JSON.parse(
        doc.querySelector('miscellaneous-field[name="moajam-multi-measure-rests"]')?.textContent ||
          '{}',
      ),
      parts,
    ),
    measureChords,
    beatChords,
    directions,
    navigation,
    guitarToneChanges: readGuitarToneChanges(expression.guitarToneChanges ?? {}, parts),
    notes,
    sync: {},
  };
}
