import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { Buffer, Blob } from 'node:buffer';
import { URL } from 'node:url';
import test from 'node:test';
import ts from 'typescript';

const cache = new Map();
function moduleUrl(path) {
  if (cache.has(path.href)) return cache.get(path.href);
  const { outputText } = ts.transpileModule(readFileSync(path, 'utf8'), {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      jsx: ts.JsxEmit.ReactJSX,
    },
  });
  const linked = outputText.replace(/from ['"](.+?)['"]/g, (_, relative) => {
    if (!relative.startsWith('.')) return `from '${import.meta.resolve(relative)}'`;
    const candidate = new URL(relative + '.ts', path);
    return `from '${moduleUrl(existsSync(candidate) ? candidate : new URL(relative + '.tsx', path))}'`;
  });
  const url = `data:text/javascript;base64,${Buffer.from(linked).toString('base64')}`;
  cache.set(path.href, url);
  return url;
}
const { serializeScoreFile, parseScoreFile, validateScoreDocument, scoreFileName } = await import(
  moduleUrl(new URL('../packages/app/src/lib/scoreFile.ts', import.meta.url))
);
const { scorePdfMarkup, fitPdfSystem } = await import(
  moduleUrl(new URL('../packages/app/src/lib/scorePdf.web.tsx', import.meta.url))
);
const note = (id, overrides = {}) => ({
  id,
  part: 'Guitar',
  pitch: 64,
  beats: 1,
  rest: false,
  accent: false,
  chord: '',
  lyric: '가사',
  ...overrides,
});
const score = () => ({
  title: '나의 기타 악보',
  rhythmFeel: 'triplet-eighth',
  bpm: 120,
  timeSignature: { beats: 6, beatType: 8 },
  keySignature: -2,
  measureLengths: { Guitar: { 0: 2 } },
  measureWidths: { Guitar: { 0: 150 } },
  barlines: { 0: 'double' },
  repeats: { 0: { start: true, end: true, times: 3 } },
  parts: ['Guitar', 'Bass'],
  notes: [
    note('a', {
      tones: [{ pitch: 64, string: 1, fret: 0 }],
      connection: { type: 'tie', targetId: 'b' },
      slurTo: 'b',
    }),
    note('b'),
    note('c', { part: 'Bass', pitch: 40, ghost: true, beats: 1 / 3, tuplet: 3 }),
  ],
  sync: { a: 1.5 },
  instruments: { Guitar: 'guitar', Bass: 'bass' },
  systemLayout: { Guitar: [1, 3] },
  equalWidthRows: { Guitar: [1] },
  playbackVolume: 0.7,
  playbackInstruments: { Guitar: 'acoustic_guitar_steel', Bass: 'electric_bass_finger' },
  measureChords: { Guitar: { 0: 'C' } },
  beatChords: { Guitar: { 0.5: 'G' } },
  referenceAudioName: '반주.wav',
  referenceAudioOffset: -2,
  referenceAudioEnabled: true,
  referenceAudioVolume: 0.4,
});
const document = () => ({
  score: score(),
  referenceAudio: new Blob(['backing'], { type: 'audio/wav' }),
  instrumentSample: {
    file: new Blob(['instrument'], { type: 'audio/wav' }),
    name: '기타.wav',
    rootMidi: 64.17,
    enabled: true,
    sustain: false,
  },
});

test('portable score roundtrip preserves all parts, notation, settings and attachment bytes', async () => {
  const original = document();
  const restored = parseScoreFile(await serializeScoreFile(original));
  assert.deepEqual(restored.score, original.score);
  assert.equal(await restored.referenceAudio.text(), 'backing');
  assert.equal(await restored.instrumentSample.file.text(), 'instrument');
  assert.equal(restored.instrumentSample.rootMidi, 64.17);
  assert.equal(restored.instrumentSample.file.type, 'audio/wav');
  restored.score.notes[0].pitch = 48;
  assert.equal(original.score.notes[0].pitch, 64);
});
test('glissando and slide-out survive files and share staff/TAB PDF notation', async () => {
  const source = {
    title: '슬라이드',
    bpm: 120,
    parts: ['Guitar'],
    sync: {},
    notes: [
      note('a', {
        tones: [{ pitch: 64, string: 1, fret: 0 }],
        connection: { type: 'glissando', targetId: 'b' },
      }),
      note('b', { pitch: 71, tones: [{ pitch: 71, string: 1, fret: 7 }], slideOut: 'up' }),
      note('c', { pitch: 67, tones: [{ pitch: 67, string: 1, fret: 3 }], slideOut: 'down' }),
    ],
  };
  const result = parseScoreFile(await serializeScoreFile({ score: source }));
  assert.deepEqual(result.score, source);
  const markup = scorePdfMarkup(result.score, 'Guitar', true);
  assert.equal((markup.match(/aria-label="시프트 슬라이드 사선"/g) ?? []).length, 2);
  assert.match(markup, /aria-label="슬라이드 아웃 위로"/);
  assert.match(markup, /aria-label="슬라이드 아웃 아래로"/);
  assert.throws(() =>
    validateScoreDocument({ ...source, notes: [note('bad', { slideOut: 'left' })] }),
  );
});

test('empty scores and samples awaiting manual root selection roundtrip', async () => {
  const original = {
    score: { title: '', bpm: 120, parts: ['Guitar'], notes: [], sync: {} },
    referenceAudio: null,
    instrumentSample: null,
  };
  assert.deepEqual(parseScoreFile(await serializeScoreFile(original)), original);
  const sample = document();
  sample.instrumentSample.rootMidi = null;
  assert.equal(parseScoreFile(await serializeScoreFile(sample)).instrumentSample.rootMidi, null);
});

test('YouTube reference, source, sync offset and volume survive file save/load alongside a retained audio file', async () => {
  const input = document();
  Object.assign(input.score, {
    referenceAudioSource: 'youtube',
    referenceYoutubeId: 'M7lc1UVf-VE',
    referenceAudioOffset: 12.5,
  });
  const saved = await serializeScoreFile(input);
  const restored = parseScoreFile(saved);
  assert.deepEqual(restored.score, input.score);
  assert.equal(await restored.referenceAudio.text(), 'backing');
  for (const patch of [{ referenceYoutubeId: '<iframe>' }, { referenceAudioSource: 'bad' }]) {
    const invalid = JSON.parse(saved);
    Object.assign(invalid.score, patch);
    assert.throws(() => parseScoreFile(JSON.stringify(invalid)));
  }
});
test('sample boundaries roundtrip while older documents keep automatic trimming', async () => {
  const original = document();
  assert.equal(
    parseScoreFile(await serializeScoreFile(original)).instrumentSample.trimStart,
    undefined,
  );
  original.instrumentSample.trimStart = 0.25;
  original.instrumentSample.trimEnd = 1.75;
  original.instrumentSample.autoRoot = true;
  const restored = parseScoreFile(await serializeScoreFile(original));
  assert.equal(restored.instrumentSample.trimStart, 0.25);
  assert.equal(restored.instrumentSample.trimEnd, 1.75);
  assert.equal(restored.instrumentSample.autoRoot, true);
  for (const [trimStart, trimEnd] of [
    [-1, 1],
    [0, 16],
    [1, 0.5],
    [0, 0.01],
    [0, undefined],
  ]) {
    const input = JSON.parse(await serializeScoreFile(original));
    Object.assign(input.instrumentSample, { trimStart, trimEnd });
    assert.throws(() => parseScoreFile(JSON.stringify(input)));
  }
});
test('rejects malformed JSON, unrelated files and unsupported versions', async () => {
  for (const input of ['', '{', 'null', '[]', '{"format":"other"}'])
    assert.throws(() => parseScoreFile(input));
  const saved = JSON.parse(await serializeScoreFile(document()));
  saved.version = 99;
  assert.throws(() => parseScoreFile(JSON.stringify(saved)), /버전/);
});
test('validates pitches, durations, identities, part ownership, optional maps and connections', () => {
  const edits = [
    (s) => (s.notes[0].pitch = 128),
    (s) => (s.notes[0].beats = 0),
    (s) => (s.notes[0].beats = 0.01),
    (s) => (s.notes[0].part = 'Unknown'),
    (s) => (s.notes[1].id = 'a'),
    (s) => s.parts.push('Guitar'),
    (s) => (s.notes[0].connection.targetId = 'missing'),
    (s) => (s.notes[0].tones[0].string = 8),
    (s) => (s.bpm = 0),
    (s) => (s.sync = { missing: 1 }),
    (s) => (s.instruments.Guitar = 'unknown'),
    (s) => (s.systemLayout.Guitar = [0]),
    (s) => (s.equalWidthRows.Guitar = [-1]),
    (s) => (s.beatChords.Guitar = { '-1': 'C' }),
    (s) => (s.referenceAudioVolume = 2),
  ];
  for (const edit of edits) {
    const input = score();
    edit(input);
    assert.throws(() => validateScoreDocument(input));
  }
});
test('rejects invalid attachments, bad sample settings and prototype keys atomically', async () => {
  const content = await serializeScoreFile(document());
  for (const edit of [
    (f) => (f.referenceAudio.data = '%%!!'),
    (f) => (f.referenceAudio.type = 'text/html'),
    (f) => (f.instrumentSample.rootMidi = 999),
    (f) => (f.instrumentSample.sustain = 'true'),
    (f) => (f.instrumentSample.autoRoot = 'true'),
    (f) => (f.instrumentSample.file = null),
  ]) {
    const file = JSON.parse(content);
    edit(file);
    assert.throws(() => parseScoreFile(JSON.stringify(file)));
  }
  assert.throws(() => parseScoreFile(content.replace('"version":1', '"version":1,"__proto__":{}')));
  assert.equal(document().score.title, '나의 기타 악보');
});
test('download names strip path characters while preserving Korean titles', () => {
  assert.equal(scoreFileName('기타/연습:1?', 'pdf'), '기타_연습_1_.pdf');
  assert.equal(scoreFileName(' ', 'moajam'), '나의 악보.moajam');
});

test('score files and PDF keep mixed chord effects on individual tones', async () => {
  const input = document();
  input.score.notes = [
    note('mixed', {
      staccato: true,
      tones: [
        { pitch: 64, string: 1, fret: 0, ghost: true },
        { pitch: 59, string: 2, fret: 0, dead: true },
        { pitch: 55, string: 3, fret: 0 },
      ],
    }),
  ];
  input.score.sync = {};
  const result = parseScoreFile(await serializeScoreFile(input));
  assert.deepEqual(result.score.notes[0].tones, input.score.notes[0].tones);
  const markup = scorePdfMarkup(result.score, 'Guitar', true);
  assert.match(markup, /1번 줄 0프렛 고스트노트 스타카토/);
  assert.match(markup, /2번 줄 X 데드노트 스타카토/);
  assert.match(markup, /3번 줄 0프렛 스타카토/);
  assert.equal((markup.match(/aria-label="뮤트 X 음표"/g) ?? []).length, 1);
});
test('PDF renders actual notation without editor selections and supports TAB choice', () => {
  const tab = scorePdfMarkup(score(), 'Guitar', true);
  assert.match(tab, /<svg/);
  assert.match(tab, /Guitar 오선보와 TAB/);
  assert.match(tab, /붙임줄/);
  assert.match(tab, /가사/);
  assert.doesNotMatch(tab, /score-range-highlight|data-playback-active="true"/);
  assert.doesNotMatch(scorePdfMarkup(score(), 'Guitar', false), /줄 시작 TAB/);
  assert.match(scorePdfMarkup(score(), 'Bass', true), /Bass 오선보와 TAB/);
});
test('PDF systems fit both page width and height without clipping extreme notes', () => {
  for (const [width, height] of [
    [800, 350],
    [2400, 500],
    [400, 1800],
  ]) {
    const size = fitPdfSystem(width, height);
    assert.ok(size.width <= 182 && size.height <= 224);
    assert.ok(Math.abs(size.width / size.height - width / height) < 1e-10);
  }
  assert.throws(() => fitPdfSystem(0, 30));
});

test('screen/PDF renderer uses labeled tapered curves on both staves, including row boundaries', () => {
  const source = {
    title: 'Connections',
    bpm: 120,
    parts: ['Guitar'],
    sync: {},
    systemLayout: { Guitar: [1, 1] },
    notes: Array.from({ length: 32 }, (_, i) =>
      note(`arc-${i}`, {
        pitch: 64 + (i % 2) * 2,
        beats: 0.25,
        lyric: '',
        tones: [{ pitch: 64 + (i % 2) * 2, string: 1, fret: (i % 2) * 2 }],
        ...(i === 6 ? { slurTo: 'arc-9' } : {}),
        ...([0, 2, 15].includes(i)
          ? {
              connection: { type: i === 0 ? 'hammer' : 'slide', targetId: `arc-${i + 1}` },
            }
          : {}),
      }),
    ),
  };
  for (const width of [620, 1080]) {
    const markup = scorePdfMarkup(source, 'Guitar', true, width);
    assert.doesNotMatch(markup, /NaN|Infinity/);
    assert.equal((markup.match(/data-hammer-pull-label="H"/g) ?? []).length, 2);
    assert.equal(
      (markup.match(/aria-label="레가토 슬라이드 사선"/g) ?? []).length,
      6,
      'two slides, one split across systems, on two staves',
    );
    assert.equal((markup.match(/>sl\.<\/text>/g) ?? []).length, 6);
    assert.match(markup, /aria-label="H TAB 연결"[^>]*d="[^"]+ Z"/);
    assert.match(markup, /aria-label="TAB 이음줄\(슬러\)"[^>]*d="[^"]+ Z"/);
  }
});

test('PDF uses the live drawing width, shared fonts and separate staff/TAB barlines', () => {
  for (const width of [620, 1080, 1600]) {
    const markup = scorePdfMarkup(score(), 'Guitar', true, width);
    assert.match(markup, new RegExp(`data-layout-width="${width}"`));
    const drawingWidth = Number(markup.match(/viewBox="0 [-\d.]+ ([\d.]+) /)[1]);
    assert.ok(Math.abs(drawingWidth - width) < 0.01);
    assert.match(markup, /font-family="Segoe UI Symbol, Malgun Gothic, sans-serif"/);
    assert.match(markup, /data-barline="staff"[^>]*y1="82" y2="122"/);
    assert.match(markup, /data-barline="tab"[^>]*y1="190" y2="290"/);
  }
  assert.doesNotMatch(scorePdfMarkup(score(), 'Guitar', false), /data-barline="tab"/);
});

test('staff keeps rests while TAB omits rest glyphs and centers its label on the strings', () => {
  const source = { ...score(), notes: [note('rest', { part: 'Bass', rest: true, beats: 1 })] };
  const markup = scorePdfMarkup(source, 'Bass', true);
  assert.equal((markup.match(/𝄽/g) ?? []).length, 1, 'only the staff displays a rest glyph');
  assert.match(markup, /aria-label="오선 쉼표"/);
  const label = markup.match(/<g aria-label="줄 시작 TAB"[^>]*>(.*?)<\/g>/)?.[1];
  const ys = [...label.matchAll(/ y="([\d.]+)"/g)].map((match) => Number(match[1]));
  assert.deepEqual(ys, [203, 220, 237]);
  assert.equal((ys[0] + ys[2]) / 2, (190 + 250) / 2);
  assert.match(markup, /class="score-measure-number" x="2" y="74"/);
});

test('rejects invalid meter, bar lengths, width weights, repeat counts and slur targets', () => {
  for (const patch of [
    { timeSignature: { beats: 0, beatType: 4 } },
    { timeSignature: { beats: 4, beatType: 3 } },
    { rhythmFeel: 'unknown' },
    { rhythmFeel: '__proto__' },
    { keySignature: 8 },
    { keySignature: 1.5 },
    { measureLengths: { Guitar: { 0: 0 } } },
    { measureLengths: { Guitar: { 0: 0.1 } } },
    { measureWidths: { Guitar: { 0: 501 } } },
    { measureWidths: { Other: { 0: 100 } } },
    { repeats: { 0: { end: true, times: 100000 } } },
  ])
    assert.throws(() => validateScoreDocument({ ...score(), ...patch }));
  const invalid = score();
  invalid.notes[0].slurTo = 'missing';
  assert.throws(() => validateScoreDocument(invalid));
});

test('PDF prints a note equation above BPM only when a global feel is enabled', () => {
  for (const rhythmFeel of [
    'triplet-eighth',
    'triplet-sixteenth',
    'dotted-eighth',
    'dotted-sixteenth',
    'scottish-eighth',
    'scottish-sixteenth',
  ]) {
    const markup = scorePdfMarkup({ ...score(), rhythmFeel }, 'Guitar', true);
    assert.match(markup, new RegExp('data-rhythm-feel="' + rhythmFeel + '"'));
    assert.match(markup, /d="M43 18h10m-10 5h10"/);
    if (rhythmFeel.startsWith('triplet')) assert.match(markup, />3<\/text>/);
  }
  for (const rhythmFeel of [undefined, 'straight']) {
    const markup = scorePdfMarkup({ ...score(), rhythmFeel }, 'Guitar', true);
    assert.doesNotMatch(markup, /data-rhythm-feel=/);
  }
});
