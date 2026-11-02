import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dragWaveformZoom, waveformTimeTicks, waveformContentWidth, waveformBarTicks } from '../packages/app/src/lib/audioWaveformView.ts';
test('vertical ruler dragging follows DAW zoom direction and limits', () => {
  assert.ok(dragWaveformZoom(2, 50) > 2);
  assert.ok(dragWaveformZoom(2, -50) < 2);
  assert.equal(dragWaveformZoom(1, -10000), 0.25);
  assert.equal(dragWaveformZoom(5, 10000), 5);
});
test('initial waveform scale matches DAW 48 pixels per second', () => {
  assert.equal(waveformContentWidth(60, 400, 1), 2880);
  assert.equal(waveformContentWidth(60, 400, 2), 5760);
  assert.equal(waveformContentWidth(1, 400, 1), 660);
});
test('measure ruler follows BPM and starts at the configured audio offset', () => {
  const ticks = waveformBarTicks(60, 2880, 120, 0.9);
  assert.deepEqual(ticks[0], { bar: 1, time: 0.9 });
  assert.deepEqual(ticks[1], { bar: 2, time: 2.9 });
  assert.deepEqual(waveformBarTicks(60, 2880, 60)[1], { bar: 2, time: 4 });
  assert.deepEqual(waveformBarTicks(60, 2880, 120, 0, '3/4')[1], { bar: 2, time: 1.5 });
  assert.deepEqual(waveformBarTicks(60, 2880, 120, 0, '6/8')[1], { bar: 2, time: 1.5 });
  assert.deepEqual(waveformBarTicks(0, 400, 120), []);
});
test('zoomed time ruler shows more ticks within the audio duration', () => {
  const base = waveformTimeTicks(180, 400);
  const zoomed = waveformTimeTicks(180, 1600);
  assert.ok(zoomed.length > base.length);
  assert.equal(zoomed[0], 0);
  assert.ok(zoomed.at(-1) <= 180);
  assert.deepEqual(waveformTimeTicks(0, 400), []);
});
