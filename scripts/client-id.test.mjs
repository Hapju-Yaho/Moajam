import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Buffer } from 'node:buffer';
import { URL } from 'node:url';
import { webcrypto } from 'node:crypto';
import test from 'node:test';
import ts from 'typescript';
const source = readFileSync(
  new URL('../packages/app/src/lib/clientId.ts', import.meta.url),
  'utf8',
);
async function load(crypto) {
  globalThis.__idTestCrypto = crypto;
  const { outputText } = ts.transpileModule(source.replace('globalThis.crypto', 'testCrypto'), {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  });
  const result = await import(
    `data:text/javascript;base64,${Buffer.from('const testCrypto = globalThis.__idTestCrypto;\n' + outputText + `\n// ${Math.random()}`).toString('base64')}`
  );
  delete globalThis.__idTestCrypto;
  return result;
}
test('track IDs work on HTTP without randomUUID and remain unique', async () => {
  const { clientId } = await load({
    getRandomValues: (values) => webcrypto.getRandomValues(values),
  });
  const ids = Array.from({ length: 1000 }, clientId);
  assert.equal(new Set(ids).size, 1000);
  assert.ok(
    ids.every((id) =>
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id),
    ),
  );
});
test('local entity IDs still work when crypto is unavailable', async () => {
  const { clientId } = await load(undefined);
  assert.equal(new Set(Array.from({ length: 1000 }, clientId)).size, 1000);
});
