import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readMeasureRepeat } from './measure-repeats.js';
import { prepareStructureRequest, applyTabProfile } from './recognition-request.js';

test('legacy boundaries have no repeats; targets may be unprinted bars within the part', () => {
  assert.equal(readMeasureRepeat(undefined, 10, 20, 1), null);
  const repeat = { start: false, end: { target: 5, times: 2 }, ending: { passes: [1], end: 10 } };
  assert.deepEqual(readMeasureRepeat(repeat, 10, 20, 1), repeat);
  for (const patch of [{ target: 11, times: 2 }, { target: 0, times: 2 }, { target: 1, times: 100 }]) {
    assert.throws(() => readMeasureRepeat({ ...repeat, end: patch }, 10, 20, 1));
  }
  assert.throws(() => readMeasureRepeat({ ...repeat, ending: { passes: [0], end: 10 } }, 10, 20, 1));
  assert.throws(() => readMeasureRepeat({ ...repeat, ending: { passes: [1], end: 21 } }, 10, 20, 1));
});

test('all instrument profiles request repeat and volta metadata in the same structure call', () => {
  for (const type of ['guitar-tab', 'bass-tab', 'vocal-staff', 'keyboard', 'drums'] as const) {
    const request = applyTabProfile(prepareStructureRequest('test.pdf', Buffer.from('%PDF-1.7')), type);
    const measure = request.text.format.schema.properties.parts.items.properties.measures.items;
    assert.ok(measure.required.includes('repeat'));
    assert.ok(measure.properties.repeat);
    const text = request.input[0].content.filter((item: any) => item.type === 'input_text').map((item: any) => item.text).join('\n');
    assert.match(text, /WRITTEN REPEAT RULES/);
    assert.match(text, /NEVER unfold/);
  }
});
