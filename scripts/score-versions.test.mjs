import assert from 'node:assert/strict';
import test from 'node:test';
import { URL } from 'node:url';
import { Blob } from 'node:buffer';
import { moduleUrl } from './load-typescript.mjs';
const v = await import(
  moduleUrl(new URL('../packages/app/src/lib/scoreVersions.ts', import.meta.url))
);
const { isBandScore } = await import(
  moduleUrl(new URL('../apps/server/src/workspaces/score-policy.ts', import.meta.url))
);
const { renameScorePart } = await import(
  moduleUrl(new URL('../packages/app/src/lib/score.ts', import.meta.url))
);
const note = (id, part, pitch = 60) => ({
  id,
  part,
  pitch,
  beats: 1,
  rest: false,
  accent: false,
  chord: '',
  lyric: '',
});
const document = () => ({
  score: {
    title: '곡',
    bpm: 90,
    parts: ['Guitar', 'Bass', 'Piano', 'Piano L'],
    keyboardStaves: { Piano: 'Piano L' },
    instruments: { Guitar: 'guitar', Bass: 'bass', Piano: 'piano', 'Piano L': 'pianoBass' },
    notes: [
      note('g', 'Guitar', 64),
      note('b', 'Bass', 40),
      note('pr', 'Piano', 60),
      note('pl', 'Piano L', 48),
    ],
    sync: { g: 2 },
    referenceAudioOffset: 2.5,
  },
  referenceAudio: new Blob(['audio']),
  instrumentSample: null,
});
const group = (lib, part) => v.partVersionGroup(lib, part);
test('legacy migration creates a base version per logical part and stores no duplicate baseline notes or audio', () => {
  const doc = document(),
    lib = v.createScoreVersionLibrary(doc),
    stored = v.storeScoreVersionLibrary(lib);
  assert.deepEqual(
    lib.parts.map((g) => g.part),
    ['Guitar', 'Bass', 'Piano'],
  );
  assert.ok(
    stored.scoreVersions.parts.every((g) => g.versions.every((x) => x.content === undefined)),
  );
  assert.equal(stored.referenceAudio, doc.referenceAudio);
  assert.equal(JSON.stringify(stored.scoreVersions).includes('referenceAudio'), false);
  const read = v.readScoreVersionLibrary(stored);
  assert.equal(group(read, 'Piano').versions[0].content.notes.length, 2);
  assert.equal(read.applied.referenceAudio, doc.referenceAudio);
});
test('part versions mix independently; drafts and subsequent saves cannot replace applied notes', () => {
  const doc = document();
  let lib = v.createScoreVersionLibrary(doc);
  const hard = {
    ...doc,
    score: {
      ...doc.score,
      notes: doc.score.notes.map((n) => (n.part === 'Guitar' ? { ...n, pitch: 70 } : n)),
    },
  };
  lib = v.addScoreVersion(lib, 'Guitar', 'hard', '하드', v.captureScorePart(hard.score, 'Guitar'));
  assert.deepEqual(
    group(lib, 'Guitar').versions[1].content.notes.map((n) => n.part),
    ['Guitar'],
  );
  lib = v.applyScoreVersion(lib, 'Guitar', 'hard');
  assert.equal(lib.applied.score.notes.find((n) => n.id === 'g').pitch, 70);
  assert.equal(lib.applied.score.notes.find((n) => n.id === 'b').pitch, 40);
  const updated = {
    ...hard,
    score: {
      ...hard.score,
      notes: hard.score.notes.map((n) => (n.id === 'g' ? { ...n, pitch: 72 } : n)),
    },
  };
  lib = v.saveScoreVersion(lib, 'Guitar', 'hard', updated);
  assert.equal(lib.applied.score.notes.find((n) => n.id === 'g').pitch, 70);
  assert.equal(group(lib, 'Guitar').versions[1].content.notes[0].pitch, 72);
  const stored = v.storeScoreVersionLibrary(lib);
  assert.equal(
    v.readScoreVersionLibrary(stored).applied.score.notes.find((n) => n.id === 'g').pitch,
    70,
  );
  assert.equal(isBandScore(JSON.parse(JSON.stringify(stored))), true);
});
test('shared tempo/audio are stored once while piano versions include both hands', () => {
  const doc = document();
  let lib = v.createScoreVersionLibrary(doc);
  lib = v.addScoreVersion(lib, 'Piano', 'easy', '이지', v.captureScorePart(doc.score, 'Piano'));
  lib = v.reconcileScoreVersions(lib, {
    ...doc,
    score: { ...doc.score, bpm: 130, referenceAudioOffset: 4 },
  });
  assert.equal(lib.applied.score.bpm, 130);
  assert.equal(lib.applied.score.referenceAudioOffset, 4);
  assert.equal(group(lib, 'Piano').versions[1].content.notes.length, 2);
  assert.equal('bpm' in group(lib, 'Piano').versions[1].content, false);
  assert.equal(lib.applied.referenceAudio, doc.referenceAudio);
  lib = v.applyScoreVersion(lib, 'Piano', 'easy');
  assert.equal(lib.applied.score.bpm, 130);
});
test('part rename, reorder and deletion retain the right version histories', () => {
  const doc = document();
  let lib = v.createScoreVersionLibrary(doc);
  lib = v.addScoreVersion(lib, 'Guitar', 'hard', '하드', v.captureScorePart(doc.score, 'Guitar'));
  lib = v.reconcileScoreVersions(lib, {
    ...doc,
    score: renameScorePart(doc.score, 'Guitar', 'Lead'),
  });
  assert.equal(group(lib, 'Lead').versions[1].content.notes[0].part, 'Lead');
  assert.equal(group(lib, 'Bass').versions.length, 1);
  assert.throws(() => v.removeScoreVersion(lib, 'Lead', 'original'), /적용된/);
  assert.throws(() => v.renameScoreVersion(lib, 'Lead', 'hard', '기본'), /같은 이름/);
  lib = v.removeScoreVersion(lib, 'Lead', 'hard');
  assert.equal(group(lib, 'Lead').versions.length, 1);
});
test('client and server reject broken pointers, cross-part content and corrupt version notes', () => {
  const doc = document();
  let lib = v.addScoreVersion(
    v.createScoreVersionLibrary(doc),
    'Guitar',
    'hard',
    '하드',
    v.captureScorePart(doc.score, 'Guitar'),
  );
  const stored = v.storeScoreVersionLibrary(lib),
    bad = [];
  let value = globalThis.structuredClone(stored);
  value.scoreVersions.parts[0].appliedVersionId = 'missing';
  bad.push(value);
  value = globalThis.structuredClone(stored);
  value.scoreVersions.parts[0].versions[1].content.notes[0].pitch = -1;
  bad.push(value);
  value = globalThis.structuredClone(stored);
  value.scoreVersions.parts[0].versions[1].content.notes[0].part = 'Bass';
  bad.push(value);
  value = globalThis.structuredClone(stored);
  delete value.scoreVersions.parts[0].versions[1].content;
  bad.push(value);
  value = globalThis.structuredClone(stored);
  value.scoreVersions.parts[0].versions[1].content.settings.referenceAudio = {};
  bad.push(value);
  for (const item of bad) {
    assert.throws(() => v.readScoreVersionLibrary(item));
    assert.equal(isBandScore(item), false);
  }
});
