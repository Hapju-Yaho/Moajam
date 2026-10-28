import assert from 'node:assert/strict';
import test from 'node:test';
import { moduleUrl } from './load-typescript.mjs';
const { defaultDrumKeys, readDrumKeys, validDrumKeys } = await import(
  moduleUrl(new URL('../packages/app/src/lib/drumKeyMapping.ts', import.meta.url))
);
test('drum key defaults use separate hand/foot kit pieces and support customized letters', () => {
  const mapping = readDrumKeys(null);
  assert.equal(mapping[46], 'r');
  assert.equal(mapping[36], 'b');
  assert.equal(new Set(defaultDrumKeys.map((item) => item.pitch)).size, 7);
  assert.equal(readDrumKeys({ ...mapping, 46: 'Q' })[46], 'q');
});
test('duplicate, empty and nonletter assignments cannot replace valid defaults', () => {
  const mapping = readDrumKeys(null);
  for (const key of ['t', '', '7']) {
    const bad = { ...mapping, 46: key };
    assert.equal(validDrumKeys(bad), false);
    assert.deepEqual(readDrumKeys(bad), mapping);
  }
});
