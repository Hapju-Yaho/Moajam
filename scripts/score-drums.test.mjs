import assert from 'node:assert/strict';
import { URL } from 'node:url';
import test from 'node:test';
import { moduleUrl } from './load-typescript.mjs';

const {
  setScoreDrum,
  scoreInstrument,
  scoreToMusicXml,
  setScoreToneArticulation,
  selectedScoreTone,
  drumAtRow,
  scoreDrums,
  drumNotation,
  readScoreClipboard,
  copyScoreNotes,
} = await import(moduleUrl(new URL('../packages/app/src/lib/score.ts', import.meta.url)));
const base = () => ({
  title: '드럼 연습',
  bpm: 124,
  parts: ['Drums'],
  sync: {},
  notes: [
    {
      id: 'a',
      part: 'Drums',
      pitch: 60,
      beats: 0.5,
      rest: true,
      blank: true,
      accent: false,
      chord: '',
      lyric: '',
    },
    {
      id: 'b',
      part: 'Drums',
      pitch: 38,
      beats: 0.5,
      rest: false,
      accent: false,
      chord: '',
      lyric: '',
    },
  ],
});

test('drum parts infer percussion but preserve explicit notation; lanes clamp at both ends', () => {
  assert.equal(scoreInstrument(base(), 'Drums').clef, 'percussion');
  assert.equal(
    scoreInstrument({ ...base(), instruments: { Drums: 'standard' } }, 'Drums').clef,
    'treble',
  );
  assert.equal(drumAtRow(-2).label, '스플래시');
  assert.equal(drumAtRow(500).label, '페달 하이햇');
});

test('repeated Enter/1 is idempotent and simultaneous hits preserve time and following notes', () => {
  const original = base();
  const first = setScoreDrum(original, 'a', 42);
  const both = setScoreDrum(first, 'a', 36);
  assert.deepEqual(
    both.notes[0].tones.map((tone) => tone.pitch),
    [42, 36],
  );
  assert.equal(both.notes[0].beats, 0.5);
  assert.equal(both.notes[0].rest, false);
  assert.equal(both.notes[0].blank, false);
  assert.equal(both.notes[1], original.notes[1]);
  assert.equal(setScoreDrum(both, 'a', 36), both);
  assert.equal(original.notes[0].blank, true);
});

test('Delete removes only the selected piece; removing the last hit leaves a timed rest', () => {
  const both = setScoreDrum(setScoreDrum(base(), 'a', 42), 'a', 36);
  assert.equal(setScoreDrum(both, 'a', 38, true), both);
  const single = setScoreDrum(both, 'a', 36, true);
  assert.deepEqual(
    single.notes[0].tones.map((tone) => tone.pitch),
    [42],
  );
  const rest = setScoreDrum(single, 'a', 42, true);
  assert.equal(rest.notes[0].rest, true);
  assert.equal(rest.notes[0].blank, false);
  assert.equal(rest.notes[0].beats, 0.5);
  assert.equal(rest.notes[1], both.notes[1]);
  assert.throws(() => setScoreDrum(rest, 'a', 60));
});

test('Delete at an empty staff position clears that beat without moving later notes or changing another voice', () => {
  const both = setScoreDrum(setScoreDrum(base(), 'a', 42), 'a', 36);
  const foot = { ...both.notes[1], id: 'foot', part: 'Drums / feet', pitch: 36 };
  const score = { ...both, parts: ['Drums', foot.part], notes: [...both.notes, foot] };
  const cleared = setScoreDrum(score, 'a', 38, true, 'normal', true);
  assert.equal(cleared.notes[0].rest, true);
  assert.equal(cleared.notes[0].blank, false);
  assert.deepEqual(cleared.notes[0].tones, []);
  assert.equal(cleared.notes[0].beats, score.notes[0].beats);
  assert.deepEqual(cleared.notes.slice(1), score.notes.slice(1));
  assert.equal(setScoreDrum(cleared, 'a', 38, true, 'normal', true), cleared);
  assert.deepEqual(
    score.notes[0].tones.map((tone) => tone.pitch),
    [42, 36],
  );
});

test('ghost hits follow the selected kit lane, not a chord tone index', () => {
  const both = setScoreDrum(setScoreDrum(base(), 'a', 36), 'a', 38);
  const snare = scoreDrums.findIndex((drum) => drum.pitch === 38) + 1;
  const kick = scoreDrums.findIndex((drum) => drum.pitch === 36) + 1;
  const result = setScoreToneArticulation(both, ['a', 'b'], snare, 'ghost');
  assert.equal(selectedScoreTone(result, result.notes[0], snare).ghost, true);
  assert.equal(!!selectedScoreTone(result, result.notes[0], kick).ghost, false);
  assert.equal(selectedScoreTone(result, result.notes[1], snare).ghost, true);
});

test('MusicXML exports percussion clef, unpitched positions, kit instrument IDs and one-based GM numbers', () => {
  const score = setScoreDrum(setScoreDrum(base(), 'a', 46), 'a', 36);
  const xml = scoreToMusicXml({ ...score, keySignature: 3 });
  assert.match(xml, /<sign>percussion<\/sign>/);
  assert.match(
    xml,
    /<unpitched><display-step>G<\/display-step><display-octave>5<\/display-octave>/,
  );
  assert.match(xml, /<instrument id="I1D46"\/>/);
  assert.match(xml, /<midi-unpitched>47<\/midi-unpitched>/);
  assert.match(xml, /<notehead>x<\/notehead>/);
  assert.match(xml, /<technical><open\/><\/technical>/);
  assert.match(xml, /<fifths>0<\/fifths>/);
  assert.doesNotMatch(xml, /<pitch>/);
});

test('reference techniques replace the same hit and survive clipboard without changing GM pitch or timing', () => {
  const normal = setScoreDrum(base(), 'a', 38);
  const rim = setScoreDrum(normal, 'a', 38, false, 'rimshot');
  assert.equal(rim.notes[0].tones.length, 1);
  assert.equal(rim.notes[0].tones[0].drumTechnique, 'rimshot');
  assert.equal(rim.notes[0].beats, normal.notes[0].beats);
  assert.equal(setScoreDrum(rim, 'a', 38, false, 'rimshot'), rim);
  assert.equal(drumNotation(rim.notes[0].tones[0]).rimshot, true);
  assert.equal(drumNotation({ pitch: 37 }).hollow, true);
  assert.equal(drumNotation({ pitch: 53 }).head, 'diamond');
  assert.equal(drumNotation({ pitch: 56 }).head, 'triangle');
  const copied = readScoreClipboard(
    JSON.stringify({
      type: 'moajam-score',
      version: 1,
      notes: copyScoreNotes(rim, 'Drums', ['a']),
    }),
  );
  assert.equal(copied[0].tones[0].drumTechnique, 'rimshot');
  assert.throws(() => setScoreDrum(normal, 'a', 36, false, 'rimshot'));
  for (const [pitch, technique, tag] of [
    [42, 'closed', 'stopped'],
    [46, 'half-open', 'half-muted'],
    [44, 'open', 'open'],
  ]) {
    assert.ok(
      scoreToMusicXml(setScoreDrum(base(), 'a', pitch, false, technique)).includes(`<${tag}/>`),
    );
  }
});

test('numbered changes replace only hits at the same staff position, including Delete', () => {
  const both = setScoreDrum(setScoreDrum(base(), 'a', 42), 'a', 36);
  const open = setScoreDrum(both, 'a', 46, false, 'normal', true);
  assert.deepEqual(open.notes[0].tones.map((tone) => tone.pitch).sort(), [36, 46]);
  const half = setScoreDrum(open, 'a', 46, false, 'half-open', true);
  assert.equal(half.notes[0].tones.find((tone) => tone.pitch === 46).drumTechnique, 'half-open');
  assert.equal(half.notes[1], both.notes[1]);
  const removed = setScoreDrum(half, 'a', 42, true, 'normal', true);
  assert.deepEqual(
    removed.notes[0].tones.map((tone) => tone.pitch),
    [36],
  );
  assert.equal(removed.notes[0].beats, both.notes[0].beats);
});

test('reference legend separates crashes and ride, and exports choke as staccato', () => {
  const kit = (pitch) => scoreDrums.find((d) => d.pitch === pitch);
  assert.deepEqual(
    [52, 55, 56, 57, 49, 42, 51, 53].map((p) => kit(p).y),
    [67, 57, 62, 67, 72, 77, 82, 82],
  );
  assert.equal(kit(49).head, 'x');
  assert.equal(drumNotation({ pitch: 44, drumTechnique: 'open' }).head, 'circle-x');
  assert.equal(drumNotation({ pitch: 44, drumTechnique: 'open' }).mark, undefined);
  const score = setScoreDrum(setScoreDrum(base(), 'a', 36), 'a', 49, false, 'choke');
  assert.equal(
    !!score.notes[0].staccato,
    false,
    'choke must not shorten the kick sharing this beat',
  );
  const xml = scoreToMusicXml(score);
  assert.match(xml, /<staccato\/>/);
  assert.match(xml, /<other-technical>choke<\/other-technical>/);
  for (const technique of ['double', 'buzz']) {
    const changed = setScoreDrum(base(), 'a', 38, false, technique);
    assert.equal(drumNotation(changed.notes[0].tones[0]).roll, technique);
    assert.match(
      scoreToMusicXml(changed),
      new RegExp(`<other-technical>${technique}</other-technical>`),
    );
  }
});
