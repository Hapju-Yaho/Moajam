import test from 'node:test';
import assert from 'node:assert/strict';
import { moduleUrl } from './load-typescript.mjs';
const { lyricsSections, snapLyricsBeat, addLyricsCue, activeLyricsSection, lyricsCueLabel, moveLyricsCue } = await import(
  moduleUrl(new URL('../packages/app/src/lib/lyricsTiming.ts', import.meta.url))
);

test('moving or re-recording one lyric preserves later cues and snaps within neighbours', () => {
  const original = [{ section: 0, beat: 1 }, { section: 1, beat: 4 }, { section: 2, beat: 8 }];
  const moved = moveLyricsCue(original, 1, 5.26);
  assert.deepEqual(moved, [original[0], { section: 1, beat: 5.5 }, original[2]]);
  assert.equal(original[1].beat, 4);
  assert.equal(moveLyricsCue(original, 1, 20)[1].beat, 7.5);
  assert.equal(moveLyricsCue(original, 1, 0)[1].beat, 1.5);
  assert.equal(moveLyricsCue(original, 0, -2)[0].beat, 0);
  assert.equal(moveLyricsCue(original, 2, 130000)[2].beat, 128000);
});
test('blank lines form sections, preserving individual lyric line breaks', () => {
  assert.deepEqual(lyricsSections(' A\r\nB\r\n \r\nC\n\n\nD '), ['A\nB', 'C', 'D']);
  assert.deepEqual(lyricsSections(' \n\n'), []);
});
test('Enter captures only section starts on the nearest eighth-note grid', () => {
  assert.equal(snapLyricsBeat(0.24), 0);
  assert.equal(snapLyricsBeat(0.26), 0.5);
  assert.equal(snapLyricsBeat(1.77), 2);
  const first = addLyricsCue([], 0.26, 2),
    second = addLyricsCue(first, 8.24, 2);
  assert.deepEqual(second, [
    { section: 0, beat: 0.5 },
    { section: 1, beat: 8 },
  ]);
  assert.equal(first.length, 1);
  assert.throws(() => addLyricsCue(first, 0.51, 2));
  assert.throws(() => addLyricsCue(second, 12, 2));
});
test('following handles prelude, seek backwards and the last section without an explicit end', () => {
  const cues = [
    { section: 0, beat: 4 },
    { section: 1, beat: 12 },
  ];
  assert.equal(activeLyricsSection(cues, 3.9), -1);
  assert.equal(activeLyricsSection(cues, 4), 0);
  assert.equal(activeLyricsSection(cues, 12), 1);
  assert.equal(activeLyricsSection(cues, 10000), 1);
  assert.equal(activeLyricsSection(cues, 5), 0);
});

test('recorded beats display bar and fractional beat labels for the chosen meter',()=>{
 assert.equal(lyricsCueLabel(.5,[4,4]),'1\uB9C8\uB514 \u00B7 1.5\uBC15');
 assert.equal(lyricsCueLabel(4,[4,4]),'2\uB9C8\uB514 \u00B7 1\uBC15');
 assert.equal(lyricsCueLabel(.5,[6,8]),'1\uB9C8\uB514 \u00B7 2\uBC15');
 assert.equal(lyricsCueLabel(3,[6,8]),'2\uB9C8\uB514 \u00B7 1\uBC15');
});
