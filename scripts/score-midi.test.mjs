import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Buffer } from 'node:buffer';
import { URL } from 'node:url';
import test from 'node:test';
import ts from 'typescript';
const cache = new Map();
function moduleUrl(path) {
  if (cache.has(path.href)) return cache.get(path.href);
  const { outputText } = ts.transpileModule(readFileSync(path, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  });
  const linked = outputText.replace(
    /from ['"](.+?)['"]/g,
    (_, relative) => `from '${moduleUrl(new URL(relative + '.ts', path))}'`,
  );
  const url = `data:text/javascript;base64,${Buffer.from(linked).toString('base64')}`;
  cache.set(path.href, url);
  return url;
}
const { scoreToMidi } = await import(
  moduleUrl(new URL('../packages/app/src/lib/scoreMidi.ts', import.meta.url))
);
// Decode the actual binary format, independently of the encoder's event model.
function read(bytes) {
  const buffer = Buffer.from(bytes);
  assert.equal(buffer.subarray(0, 4).toString(), 'MThd');
  assert.equal(buffer.readUInt32BE(4), 6);
  assert.equal(buffer.readUInt16BE(8), 1);
  assert.equal(buffer.readUInt16BE(12), 960);
  let p = 14;
  const tracks = [];
  const vlq = () => {
    let result = 0,
      byte,
      count = 0;
    do {
      byte = buffer[p++];
      result = result * 128 + (byte & 127);
      assert.ok(++count <= 4);
    } while (byte & 128);
    return result;
  };
  while (p < buffer.length) {
    assert.equal(buffer.subarray(p, p + 4).toString(), 'MTrk');
    const end = p + 8 + buffer.readUInt32BE(p + 4);
    p += 8;
    const events = [];
    let tick = 0;
    while (p < end) {
      tick += vlq();
      const status = buffer[p++];
      let type, data;
      if (status === 255) {
        type = buffer[p++];
        const length = vlq();
        data = [...buffer.subarray(p, p + length)];
        p += length;
      } else {
        const length = (status & 240) === 192 ? 1 : 2;
        data = [...buffer.subarray(p, p + length)];
        p += length;
        assert.ok(data.every((v) => v < 128));
      }
      events.push({ tick, status, type, data });
    }
    assert.equal(p, end);
    assert.equal(events.at(-1).type, 47);
    tracks.push(events);
  }
  assert.equal(tracks.length, buffer.readUInt16BE(10));
  return tracks;
}
const note = (id, pitch = 60, beats = 1, extra = {}) => ({
  id,
  pitch,
  beats,
  part: 'Guitar',
  rest: false,
  accent: false,
  chord: '',
  lyric: '',
  ...extra,
});
const score = (notes, extra = {}) => ({
  title: '나의 곡',
  bpm: 120,
  parts: ['Guitar'],
  sync: {},
  notes,
  ...extra,
});
const ons = (track) => track.filter((e) => (e.status & 240) === 144);
const offs = (track) => track.filter((e) => (e.status & 240) === 128);

test('guitar tone changes export GM programs at exact beats and slash chords export every pitch', () => {
  const input = score(
    [
      note('chord', 60, 1, { tones: [{ pitch: 60 }, { pitch: 64 }, { pitch: 67 }] }),
      note('slash', 60, 1, { slash: true }),
      note('end', 62, 2),
    ],
    { guitarToneChanges: { Guitar: { 0.5: 'overdrive', 1.5: 'distortion', 2: 'clean' } } },
  );
  const track = read(scoreToMidi(input))[1];
  assert.deepEqual(
    track.filter((e) => (e.status & 240) === 192 && e.tick > 0).map((e) => [e.tick, e.data[0]]),
    [
      [480, 29],
      [1440, 30],
      [1920, 25],
    ],
  );
  assert.deepEqual(
    ons(track)
      .filter((e) => e.tick === 960)
      .map((e) => e.data[0]),
    [60, 64, 67],
  );
});

test('independent grace notes share their destination beat in MIDI and preserve next beat', () => {
  const input = score([
    note('grace', 76, 0, {
      graceBeats: 1,
      tones: [{ pitch: 76, string: 1, fret: 12 }],
      connection: { type: 'slide', targetId: 'main' },
    }),
    note('main', 78, 1, { tones: [{ pitch: 78, string: 1, fret: 14 }] }),
    note('next', 74, 1),
  ]);
  const track = read(scoreToMidi(input))[1];
  assert.deepEqual(
    ons(track).map((e) => e.data[0]),
    [76, 78, 74],
  );
  assert.equal(ons(track)[0].tick, 0);
  assert.ok(ons(track)[1].tick > 0 && ons(track)[1].tick < 960);
  assert.equal(ons(track)[2].tick, 960);
});

test('grace slide source and destination share one beat without delaying the following note', () => {
  const input = score([
    note('slide', 78, 1, {
      tones: [{ pitch: 78, string: 1, fret: 14 }],
      graceSlide: { pitch: 76, string: 1, fret: 12 },
    }),
    note('next', 74, 1),
  ]);
  const events = read(scoreToMidi(input))[1];
  assert.deepEqual(
    ons(events).map((e) => e.data[0]),
    [76, 78, 74],
  );
  assert.equal(ons(events)[0].tick, 0);
  assert.ok(ons(events)[1].tick > 0 && ons(events)[1].tick < 960);
  assert.equal(ons(events)[2].tick, 960);
  assert.ok(offs(events).find((e) => e.data[0] === 78).tick <= 960);
});

test('capo MIDI sounds at the transposed pitch exactly once', async () => {
  const { setScoreCapo, setScoreFret } = await import(
    moduleUrl(new URL('../packages/app/src/lib/score.ts', import.meta.url))
  );
  const input = setScoreFret(score([note('g', 64)]), 'g', 1, 0);
  const capo = setScoreCapo(input, 'Guitar', 3);
  assert.deepEqual(
    ons(read(scoreToMidi(capo))[1]).map((e) => e.data[0]),
    [67],
  );
});

test('drum kits export simultaneous GM hits on channel 10 while melodic parts retain their channel', () => {
  const input = score(
    [
      note('g', 64, 1),
      note('d', 36, 0.5, { part: 'Drums', tones: [{ pitch: 36 }, { pitch: 42 }] }),
    ],
    { parts: ['Guitar', 'Drums'], playbackInstruments: { Drums: 'drum_kit' } },
  );
  const [, guitar, drums] = read(scoreToMidi(input));
  assert.equal(ons(guitar)[0].status & 15, 0);
  assert.deepEqual(
    ons(drums)
      .map((e) => e.data[0])
      .sort(),
    [36, 42],
  );
  assert.ok(ons(drums).every((e) => (e.status & 15) === 9 && e.tick === 0));
  assert.ok(offs(drums).every((e) => (e.status & 15) === 9));
  assert.deepEqual(drums.find((e) => (e.status & 240) === 192).data, [0]);
});

test('MIDI bytes contain tempo, meter, key, UTF-8 names/lyrics and separate GM instrument tracks', () => {
  const input = score([note('a', 64, 1, { lyric: '노래' }), note('b', 40, 2, { part: 'Bass' })], {
    parts: ['Guitar', 'Bass'],
    timeSignature: { beats: 6, beatType: 8 },
    keySignature: -2,
    playbackInstruments: { Guitar: 'electric_guitar_clean' },
  });
  const before = JSON.stringify(input);
  const [conductor, guitar, bass] = read(scoreToMidi(input));
  assert.equal(Buffer.from(conductor[0].data).toString(), '나의 곡');
  assert.deepEqual(conductor.find((e) => e.type === 81).data, [7, 161, 32]);
  assert.deepEqual(conductor.find((e) => e.type === 88).data, [6, 3, 24, 8]);
  assert.deepEqual(conductor.find((e) => e.type === 89).data, [254, 0]);
  assert.deepEqual(guitar.find((e) => (e.status & 240) === 192).data, [27]);
  assert.deepEqual(bass.find((e) => (e.status & 240) === 192).data, [33]);
  assert.equal(Buffer.from(guitar.find((e) => e.type === 5).data).toString(), '노래');
  assert.equal(ons(bass)[0].status & 15, 1);
  assert.equal(JSON.stringify(input), before);
  assert.equal(read(scoreToMidi(input, ['Bass'])).length, 2);
});

test('ghost drum hits retrigger at reduced velocity instead of sustaining the previous hit', () => {
  const [, drums] = read(
    scoreToMidi(
      score(
        [note('a', 38, 0.5, { part: 'Drums' }), note('b', 38, 0.5, { part: 'Drums', ghost: true })],
        { parts: ['Drums'] },
      ),
    ),
  );
  assert.deepEqual(
    ons(drums).map((e) => e.tick),
    [0, 480],
  );
  assert.ok(ons(drums)[1].data[1] < ons(drums)[0].data[1]);
});
test('MIDI preserves rests, chords, dotted/triplet durations and note-off before a retrigger', () => {
  const track = read(
    scoreToMidi(
      score([
        note('rest', 60, 0.5, { rest: true }),
        note('a', 60, 1.5, { tones: [{ pitch: 60 }, { pitch: 64 }] }),
        note('b', 60, 1 / 3, { tuplet: 3 }),
        note('c', 62, 1 / 3, { tuplet: 3 }),
      ]),
    ),
  )[1];
  assert.deepEqual(
    ons(track).map((e) => [e.tick, e.data[0]]),
    [
      [480, 60],
      [480, 64],
      [1920, 60],
      [2240, 62],
    ],
  );
  const at = track.filter((e) => e.tick === 1920);
  assert.deepEqual(
    at.map((e) => e.status & 240),
    [128, 128, 144],
  );
  assert.equal(track.at(-1).tick, 3840);
});
test('MIDI expands repeats and swing without retriggering tied/ghost continuations', () => {
  const tied = note('a', 60, 1, { connection: { type: 'tie', targetId: 'b' } });
  const track = read(
    scoreToMidi(
      score(
        [tied, note('b'), note('c', 60, 1, { ghost: true }), note('r', 60, 1, { rest: true })],
        { repeats: { 0: { start: true, end: true, times: 2 } } },
      ),
    ),
  )[1];
  assert.deepEqual(
    ons(track).map((e) => e.tick),
    [0, 3840],
  );
  assert.deepEqual(
    offs(track).map((e) => e.tick),
    [2880, 6720],
  );
  assert.equal(track.at(-1).tick, 7680);
  const swing = read(
    scoreToMidi(score([note('a', 60, 0.5), note('b', 62, 0.5)], { rhythmFeel: 'triplet-eighth' })),
  )[1];
  assert.deepEqual(
    ons(swing).map((e) => e.tick),
    [0, 640],
  );
});
test('MIDI ghost continuation is per string, with velocity and short articulation lengths', () => {
  const track = read(
    scoreToMidi(
      score([
        note('a', 60, 1, {
          tones: [
            { pitch: 60, string: 1 },
            { pitch: 64, string: 2 },
          ],
        }),
        note('b', 60, 1, {
          tones: [
            { pitch: 60, string: 1, ghost: true },
            { pitch: 67, string: 2 },
          ],
        }),
        note('c', 60, 1, { ghost: true, staccato: true }),
        note('d', 60, 1, { dead: true }),
      ]),
    ),
  )[1];
  assert.deepEqual(
    ons(track).map((e) => [e.tick, e.data[0], e.data[1]]),
    [
      [0, 60, 90],
      [0, 64, 90],
      [960, 67, 90],
      [1920, 60, 40],
      [2880, 60, 50],
    ],
  );
  assert.ok(offs(track).some((e) => e.tick === 2352));
  assert.ok(offs(track).some((e) => e.tick === 3005));
});
test('MIDI pads short parts through later repeat sections and keeps all tracks aligned', () => {
  const tracks = read(
    scoreToMidi(
      score([note('a', 64, 8), note('b', 40, 1, { part: 'Bass' })], {
        parts: ['Guitar', 'Bass'],
        repeats: { 1: { start: true, end: true, times: 3 } },
      }),
    ),
  );
  assert.deepEqual(
    tracks.map((track) => track.at(-1).tick),
    [15360, 15360, 15360],
  );
  assert.equal(ons(tracks[2]).length, 1);
});
test('MIDI avoids percussion channel, limits part count and supports an empty score', () => {
  const parts = Array.from({ length: 15 }, (_, i) => `Part${i}`);
  const tracks = read(scoreToMidi(score([], { parts })));
  assert.deepEqual(
    tracks.slice(1).map((t) => t.find((e) => (e.status & 240) === 192).status & 15),
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 10, 11, 12, 13, 14, 15],
  );
  assert.throws(() => scoreToMidi(score([], { parts: [...parts, 'extra'] })));
  assert.equal(ons(read(scoreToMidi(score([])))[1]).length, 0);
  assert.throws(() => scoreToMidi(score([]), ['missing']));
});

test('drum choke shortens its cymbal only and rolls export individual MIDI strikes', () => {
  const input = score(
    [
      note('a', 49, 1, {
        part: 'Drums',
        tones: [{ pitch: 49, drumTechnique: 'choke' }, { pitch: 36 }],
      }),
      note('b', 38, 1, { part: 'Drums', tones: [{ pitch: 38, drumTechnique: 'double' }] }),
      note('c', 38, 1, { part: 'Drums', tones: [{ pitch: 38, drumTechnique: 'buzz' }] }),
    ],
    { parts: ['Drums'] },
  );
  const [, drums] = read(scoreToMidi(input));
  assert.equal(offs(drums).find((e) => e.data[0] === 49).tick, 432);
  assert.equal(offs(drums).find((e) => e.data[0] === 36).tick, 960);
  assert.deepEqual(
    ons(drums)
      .filter((e) => e.data[0] === 38)
      .map((e) => e.tick),
    [960, 1440, 1920, 2160, 2400, 2640],
  );
});

test('MIDI expands navigation with hi-hat defaults, grace attacks, accents and dynamic changes', () => {
  const input = score(
    [
      note('a', 42, 4, { part: 'Drums', tones: [{ pitch: 42 }], accent: true }),
      note('b', 38, 4, {
        part: 'Drums',
        tones: [{ pitch: 38, drumTechnique: 'flam' }],
        marcato: true,
      }),
    ],
    {
      parts: ['Drums'],
      directions: { Drums: { 0: { hiHat: 'open', dynamic: 'p' }, 1: { dynamic: 'f' } } },
      navigation: { 0: { fine: true }, 1: { jump: 'dc-fine' } },
    },
  );
  const [, track] = read(scoreToMidi(input)),
    hits = ons(track);
  assert.deepEqual(
    hits.map((e) => e.data[0]),
    [46, 38, 38, 46],
  );
  assert.ok(hits[1].data[1] < hits[2].data[1]);
  assert.ok(hits[0].data[1] < hits[2].data[1]);
  assert.equal(hits.at(-1).tick, 8 * 960);
});
