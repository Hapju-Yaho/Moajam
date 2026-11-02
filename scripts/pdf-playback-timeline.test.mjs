import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pdfPlaybackTimeline, pdfTimelinePosition } from '../packages/app/src/lib/pdf-playback-timeline.ts';
const bar = (number, restCount = 1, meter = [4, 4]) => ({ number, restCount, meter });
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
