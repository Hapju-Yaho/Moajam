import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pdfPlaybackTimeline, pdfTimelinePosition, pdfMeasureBeat } from '../packages/app/src/lib/pdf-playback-timeline.ts';
const bar = (number, restCount = 1, meter = [4, 4]) => ({ number, restCount, meter });
const repeat = (end = null, ending = null, start = false) => ({ start, end, ending });
test('repeat signs unfold visits without copying source measure objects', () => {
  const measures = [bar(1), bar(2), { ...bar(3), repeat: repeat({ target: 1, times: 2 }) }, bar(4)];
  const timeline = pdfPlaybackTimeline(measures);
  assert.deepEqual(timeline.map((entry) => entry.measure.number), [1, 2, 3, 1, 2, 3, 4]);
  assert.equal(timeline[0].measure, timeline[3].measure);
  assert.equal(timeline.at(-1).end, 28);
  assert.equal(pdfMeasureBeat(timeline, 2, 19), 16);
  assert.equal(pdfMeasureBeat(timeline, 2, 0), 4);
});
test('first and second endings follow their pass and skip the other bracket', () => {
  const timeline = pdfPlaybackTimeline([bar(1), bar(2),
    { ...bar(3), repeat: repeat({ target: 1, times: 2 }, { passes: [1], end: 3 }) },
    { ...bar(4), repeat: repeat(null, { passes: [2], end: 4 }) }, bar(5)]);
  assert.deepEqual(timeline.map((entry) => entry.measure.number), [1, 2, 3, 1, 2, 4, 5]);
});
test('a short printed first-ending bracket skips the full branch through its repeat end', () => {
  const measures = Array.from({ length: 60 }, (_, i) => bar(i + 1));
  measures[8].repeat = repeat(null, null, true);
  measures[16].repeat = repeat(null, { passes: [1], end: 17 });
  measures[55].repeat = repeat({ target: 9, times: 2 });
  measures[56].repeat = repeat(null, { passes: [2], end: 57 });
  const timeline = pdfPlaybackTimeline(measures);
  const order = timeline.map((entry) => entry.measure.number);
  assert.deepEqual(order, [...Array.from({ length: 56 }, (_, i) => i + 1), ...Array.from({ length: 8 }, (_, i) => i + 9), 57, 58, 59, 60]);
  const second16 = timeline.filter((entry) => entry.measure.number === 16)[1];
  assert.equal(pdfTimelinePosition(timeline, second16.end).active.measure.number, 57);
  assert.equal(order.filter((number) => number === 17).length, 1);
});
test('nested repeats reset the inner repeat on the next outer pass', () => {
  const timeline = pdfPlaybackTimeline([bar(1), bar(2),
    { ...bar(3), repeat: repeat({ target: 2, times: 2 }) },
    { ...bar(4), repeat: repeat({ target: 1, times: 2 }) }]);
  assert.deepEqual(timeline.map((entry) => entry.measure.number), [1, 2, 3, 2, 3, 4, 1, 2, 3, 2, 3, 4]);
});
test('a repeat can return to an unprinted bar, retaining silent waiting time', () => {
  const timeline = pdfPlaybackTimeline([bar(1), { ...bar(5), repeat: repeat({ target: 2, times: 2 }) }, bar(6)]);
  assert.equal(timeline[2].measure.number, 5);
  assert.equal(timeline[2].gapBars, 3);
  assert.equal(timeline[2].start, 32);
  assert.equal(pdfTimelinePosition(timeline, 20).remainingBars, 3);
  assert.equal(pdfMeasureBeat(timeline, 2, 21), 20);
});
test('multi-measure rests remain grouped on each visit', () => {
  const timeline = pdfPlaybackTimeline([{ ...bar(1, 3), repeat: repeat({ target: 1, times: 2 }) }, bar(4)]);
  assert.deepEqual(timeline.map((entry) => entry.measure.number), [1, 1, 4]);
  assert.equal(timeline[0].restBars, 3);
  assert.equal(timeline[1].end, 24);
});
test('loop boundaries include individual bars in rests and unprinted gaps', () => {
  const timeline = pdfPlaybackTimeline([bar(1, 4), bar(8, 1, [3, 4])]);
  assert.equal(pdfMeasureBeat(timeline, 3), 8);
  assert.equal(pdfMeasureBeat(timeline, 6), 20);
  assert.equal(pdfMeasureBeat(timeline, 8), 28);
  assert.equal(pdfMeasureBeat(timeline, 9), 31);
});
test('missing measures 17–20 occupy four full bars before measure 21', () => {
  const timeline = pdfPlaybackTimeline([bar(16), bar(21)]);
  assert.equal(timeline[1].start, 20);
  assert.equal(timeline[1].end, 24);
  assert.equal(pdfTimelinePosition(timeline, 3.99).active.measure.number, 16);
  assert.equal(pdfTimelinePosition(timeline, 4).active, undefined);
  assert.equal(pdfTimelinePosition(timeline, 4).remainingBars, 4);
  assert.equal(pdfTimelinePosition(timeline, 16).remainingBars, 1);
  assert.equal(pdfTimelinePosition(timeline, 20).active.measure.number, 21);
  assert.equal(pdfTimelinePosition(timeline, 20).remainingBars, 0);
});
test('combined rests are counted once and gaps use the preceding meter', () => {
  const timeline = pdfPlaybackTimeline([bar(1, 4), bar(5), bar(8, 1, [3, 4]), bar(10)]);
  assert.equal(timeline[1].gapBars, 0);
  assert.equal(timeline[2].gapBars, 2);
  assert.equal(timeline[2].start, 28);
  assert.equal(timeline[3].gapBarLength, 3);
  assert.equal(timeline[3].start, 34);
});
