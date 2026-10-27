import assert from 'node:assert/strict';
import test from 'node:test';
import { moduleUrl } from './load-typescript.mjs';
const { alignScoreMeasures, scoreMeasureCount } = await import(
  moduleUrl(new URL('../packages/app/src/lib/score.ts', import.meta.url))
);
const note = (id, part, beats) => ({
  id,
  part,
  beats,
  pitch: 60,
  rest: false,
  accent: false,
  chord: '',
  lyric: '',
});
const base = {
  title: 'Alignment',
  bpm: 120,
  parts: ['Guitar', 'Bass', 'Drums'],
  notes: [note('g', 'Guitar', 9), note('b', 'Bass', 2)],
};
test('extends shorter and empty parts to the longest measure without adding audible notes', () => {
  let id = 0;
  const result = alignScoreMeasures(base, () => `blank-${++id}`);
  assert.deepEqual(
    result.parts.map((part) => scoreMeasureCount(result, part)),
    [3, 3, 3],
  );
  assert.deepEqual(
    result.notes.filter((n) => !n.blank),
    base.notes,
  );
  assert.ok(result.notes.filter((n) => n.blank).every((n) => n.rest));
  assert.equal(base.notes.length, 2);
  assert.equal(alignScoreMeasures(result), result);
});
test('respects each part custom measure lengths when padding', () => {
  const input = {
    ...base,
    measureLengths: { Bass: { 0: 2 } },
    notes: [note('g', 'Guitar', 9), note('b', 'Bass', 2)],
  };
  const result = alignScoreMeasures(input);
  assert.deepEqual(
    result.parts.map((part) => scoreMeasureCount(result, part)),
    [3, 3, 3],
  );
  assert.equal(
    result.notes.filter((n) => n.part === 'Bass').reduce((sum, n) => sum + n.beats, 0),
    10,
  );
});
const versions = await import(
  moduleUrl(new URL('../packages/app/src/lib/scoreVersions.ts', import.meta.url))
);
const instruments = await import(
  moduleUrl(new URL('../packages/app/src/lib/scoreParts.ts', import.meta.url))
);
test('new instruments including both keyboard staves inherit the longest editable timeline', () => {
  const result = instruments.addInstrumentPart({ ...base, sync: {} }, 'Keys', 'piano');
  assert.ok(result.parts.includes('Keys'));
  assert.equal(result.parts.length, 5);
  assert.ok(result.parts.every((part) => scoreMeasureCount(result, part) === 3));
});
test('project save persists changes to every part together and reloads aligned measures', () => {
  const original = { score: { ...base, sync: {} }, referenceAudio: null, instrumentSample: null };
  const library = versions.createScoreVersionLibrary(original);
  const edited = {
    ...original,
    score: alignScoreMeasures({
      ...original.score,
      notes: original.score.notes.map((n) => ({ ...n, pitch: n.part === 'Bass' ? 45 : 67 })),
    }),
  };
  const saved = versions.saveScoreProjectDocument(library, edited);
  const loaded = versions.readScoreVersionLibrary(versions.storeScoreVersionLibrary(saved));
  assert.equal(loaded.applied.score.notes.find((n) => n.id === 'g').pitch, 67);
  assert.equal(loaded.applied.score.notes.find((n) => n.id === 'b').pitch, 45);
  assert.ok(
    loaded.applied.score.parts.every((part) => scoreMeasureCount(loaded.applied.score, part) === 3),
  );
  for (const group of loaded.parts) {
    const current = group.versions.find((v) => v.id === group.appliedVersionId);
    assert.deepEqual(
      current.content.notes,
      loaded.applied.score.notes.filter((n) =>
        instruments.scorePartStaves(loaded.applied.score, group.part).includes(n.part),
      ),
    );
  }
});

test('instrument creation works when randomUUID is unavailable on an HTTP origin', () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis.crypto, 'randomUUID');
  Object.defineProperty(globalThis.crypto, 'randomUUID', { value: undefined, configurable: true });
  try {
    for (const instrument of ['guitar', 'piano', 'drums']) {
      const score = instruments.addInstrumentPart(
        { ...base, sync: {} },
        `New ${instrument}`,
        instrument,
      );
      assert.ok(score.parts.every((part) => scoreMeasureCount(score, part) === 3));
      assert.equal(new Set(score.notes.map((note) => note.id)).size, score.notes.length);
      assert.ok(score.notes.every((note) => typeof note.id === 'string' && note.id.length > 0));
    }
  } finally {
    if (descriptor) Object.defineProperty(globalThis.crypto, 'randomUUID', descriptor);
    else delete globalThis.crypto.randomUUID;
  }
});
