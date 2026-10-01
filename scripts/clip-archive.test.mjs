import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Buffer } from 'node:buffer';
import { URL } from 'node:url';
import test from 'node:test';
import ts from 'typescript';
const { outputText } = ts.transpileModule(
  readFileSync(new URL('../packages/app/src/lib/clipArchive.web.ts', import.meta.url), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } },
);
const { encodeClipWav } = await import(
  `data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`
);
const left = new Float32Array([0, 0.5, -0.5, 1]);
const right = new Float32Array([1, -1, 0, 0.25]);
const audio = {
  sampleRate: 4,
  length: 4,
  numberOfChannels: 2,
  getChannelData: (channel) => [left, right][channel],
};
test('archive contains only the selected source segment, preserving stereo channel order', async () => {
  const blob = encodeClipWav(audio, 0.25, 0.5);
  assert.equal(blob.type, 'audio/wav');
  const bytes = await blob.arrayBuffer();
  assert.equal(bytes.byteLength, 52);
  const data = new DataView(bytes);
  assert.equal(data.getUint16(22, true), 2);
  assert.equal(data.getUint32(24, true), 4);
  assert.equal(data.getUint32(40, true), 8);
  assert.deepEqual(
    [44, 46, 48, 50].map((offset) => data.getInt16(offset, true)),
    [16384, -32768, -16384, 0],
  );
  assert.deepEqual([...left], [0, 0.5, -0.5, 1]);
});
test('archive clamps to source boundaries and rejects empty or oversized clips', async () => {
  assert.equal((await encodeClipWav(audio, 0.75, 8).arrayBuffer()).byteLength, 48);
  assert.equal((await encodeClipWav(audio, 0, 0).arrayBuffer()).byteLength, 60);
  assert.throws(() => encodeClipWav(audio, 2, 1), /비어/);
  assert.throws(() => encodeClipWav({ ...audio, length: 100000000 }, 0, 0), /100MB/);
});
