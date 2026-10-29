import assert from 'node:assert/strict';
import test from 'node:test';
import { URL } from 'node:url';
import { moduleUrl } from './load-typescript.mjs';
const { scoreBeatSelectionGroups, scoreNotesInBeatRange } = await import(
  moduleUrl(new URL('../packages/app/src/lib/scoreSelection.ts', import.meta.url))
);
const fragment = (id, offset, beats, extra = {}) => ({
  offset,
  beats,
  note: { id, part: 'Drums', rest: false, blank: false, ...extra },
});

test('beat selection groups subdivisions, pitches and both drum voices, excluding rests', () => {
  const groups = scoreBeatSelectionGroups(
    [
      fragment('hi-hat', 0, 0.5),
      fragment('snare', 0.5, 0.5),
      fragment('kick', 0, 1, { part: 'Foot' }),
      fragment('next', 1, 1),
      fragment('rest', 0, 1, { rest: true }),
      fragment('blank', 0, 1, { blank: true }),
    ],
    2,
  );
  assert.deepEqual(groups, [
    { offset: 0, ids: ['hi-hat', 'snare', 'kick'] },
    { offset: 1, ids: ['next'] },
  ]);
});
test('sustained notes occupy later beats, grace notes belong to their onset and meter sets beat size', () => {
  assert.deepEqual(
    scoreBeatSelectionGroups(
      [fragment('hold', 0, 2), fragment('grace', 1, 0, { graceBeats: 0.25 })],
      2,
    ),
    [
      { offset: 0, ids: ['hold'] },
      { offset: 1, ids: ['hold', 'grace'] },
    ],
  );
  assert.deepEqual(
    scoreBeatSelectionGroups([fragment('a', 0, 0.5), fragment('b', 0.5, 0.5)], 1, 0.5),
    [
      { offset: 0, ids: ['a'] },
      { offset: 0.5, ids: ['b'] },
    ],
  );
});

test('drag endpoints select every intervening beat across systems and voices in either direction', () => {
  const score = {
    timeSignature: { beats: 4, beatType: 4 },
    notes: ['Upper', 'Lower'].flatMap((part) =>
      Array.from({ length: 16 }, (_, i) => ({
        id: `${part}/${i}`,
        part,
        beats: 2,
        rest: false,
        blank: false,
      })),
    ),
  };
  const expected = ['Upper', 'Lower'].flatMap((part) =>
    Array.from({ length: 9 }, (_, i) => `${part}/${i + 4}`),
  );
  assert.deepEqual(scoreNotesInBeatRange(score, ['Upper', 'Lower'], 8, 24), expected);
  assert.deepEqual(scoreNotesInBeatRange(score, ['Upper', 'Lower'], 24, 8), expected);
});

test('continuous selection retains intervening rests as part of the musical range', () => {
  const score = {
    notes: [
      { id: 'a', part: 'Guitar', beats: 1 },
      { id: 'rest', part: 'Guitar', beats: 1, rest: true },
      { id: 'b', part: 'Guitar', beats: 1 },
    ],
  };
  assert.deepEqual(scoreNotesInBeatRange(score, ['Guitar'], 0, 2), ['a', 'rest', 'b']);
});
