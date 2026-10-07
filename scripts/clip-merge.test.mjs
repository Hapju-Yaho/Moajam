import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { URL } from 'node:url';
import { Blob, Buffer } from 'node:buffer';
import test from 'node:test';
import ts from 'typescript';
const moduleUrl = (path) =>
  'data:text/javascript;base64,' +
  Buffer.from(
    ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    }).outputText,
  ).toString('base64');
const midiUrl = moduleUrl('../packages/app/src/lib/midi.ts');
const archiveUrl = moduleUrl('../packages/app/src/lib/clipArchive.web.ts');
const compiled = ts
  .transpileModule(
    readFileSync(new URL('../packages/app/src/lib/clipMerge.web.ts', import.meta.url), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } },
  )
  .outputText.replace("'./midi'", JSON.stringify(midiUrl))
  .replace("'./clipArchive.web'", JSON.stringify(archiveUrl));
const { contiguousClips, mergeClips } = await import(
  'data:text/javascript;base64,' + Buffer.from(compiled).toString('base64')
);
const { parseMidi } = await import(midiUrl);
let serial = 0;
const id = () => String(++serial);
const clip = (overrides = {}) => ({
  id: id(),
  name: 'a.wav',
  blob: new Blob(['audio']),
  url: '',
  offset: 0,
  sourceStart: 0,
  duration: 1,
  ...overrides,
});
test('merge rejects gaps, overlaps, empty selection and mixed media kinds', async () => {
  assert.equal(contiguousClips([clip(), clip({ offset: 1 })]), true);
  assert.equal(contiguousClips([clip(), clip({ offset: 1.05 })]), false);
  assert.equal(contiguousClips([clip(), clip({ offset: 0.5 })]), false);
  assert.equal(contiguousClips([clip()]), false);
  assert.equal(
    contiguousClips([clip(), clip({ offset: 1, midi: { notes: [], duration: 1 } })]),
    false,
  );
  await assert.rejects(mergeClips([clip(), clip({ offset: 3 })], id), /붙어/);
});
test('MIDI merge crops source segments and preserves relative timing, velocity and silent tail', async () => {
  const sequence = {
    duration: 4,
    notes: [{ id: 'n', pitch: 60, start: 0.5, duration: 2, velocity: 77, channel: 3 }],
  };
  const left = clip({ name: 'test.mid', offset: 5, sourceStart: 1, duration: 1, midi: sequence });
  const right = clip({ name: 'test.mid', offset: 6, sourceStart: 2, duration: 2, midi: sequence });
  const merged = await mergeClips([right, left], id);
  assert.equal(merged.offset, 5);
  assert.equal(merged.duration, 3);
  assert.equal(merged.sourceStart, 0);
  assert.deepEqual(
    merged.midi.notes.map((n) => [n.start, n.duration, n.pitch, n.velocity, n.channel]),
    [
      [0, 1, 60, 77, 3],
      [1, 0.5, 60, 77, 3],
    ],
  );
  assert.equal(new Set(merged.midi.notes.map((n) => n.id)).size, 2);
  const parsed = parseMidi(await merged.blob.arrayBuffer());
  assert.equal(parsed.duration, 3);
  assert.equal(parsed.notes.length, 2);
});
test('adjacent cuts from the same audio source merge without re-encoding bytes', async () => {
  const bytes = new Blob(['original']);
  const merged = await mergeClips(
    [
      clip({ blob: bytes, offset: 3, sourceStart: 1 }),
      clip({ blob: bytes, offset: 4, sourceStart: 2 }),
    ],
    id,
  );
  assert.equal(merged.blob, bytes);
  assert.equal(merged.sourceStart, 1);
  assert.equal(merged.duration, 2);
  assert.equal(merged.offset, 3);
});
test('different audio sources schedule their trimmed segments on one output timeline', async () => {
  const previous = globalThis.OfflineAudioContext;
  const starts = [];
  globalThis.OfflineAudioContext = class {
    destination = {};
    async decodeAudioData(bytes) {
      return { bytes };
    }
    createBufferSource() {
      return {
        connect() {},
        start(...args) {
          starts.push(args);
        },
      };
    }
    async startRendering() {
      return {
        sampleRate: 4,
        length: 8,
        numberOfChannels: 2,
        getChannelData: () => new Float32Array(8),
      };
    }
  };
  try {
    const merged = await mergeClips(
      [clip({ offset: 3, sourceStart: 0.25 }), clip({ offset: 4, sourceStart: 0.5 })],
      id,
    );
    assert.deepEqual(starts, [
      [0, 0.25, 1],
      [1, 0.5, 1],
    ]);
    assert.equal(merged.blob.type, 'audio/wav');
    assert.equal(merged.sourceStart, 0);
    assert.equal(merged.duration, 2);
  } finally {
    globalThis.OfflineAudioContext = previous;
  }
});
