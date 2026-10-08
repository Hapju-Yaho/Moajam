import { URL } from 'node:url';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Buffer } from 'node:buffer';
import test from 'node:test';
import ts from 'typescript';
const { outputText } = ts.transpileModule(
  readFileSync(
    new URL('../apps/server/src/workspaces/document-policy.ts', import.meta.url),
    'utf8',
  ),
  { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } },
);
const { isWorkspaceDocumentKey, canWriteDocument } = await import(
  'data:text/javascript;base64,' + Buffer.from(outputText).toString('base64')
);
const key = 'song/song-1/pdf-parts';
test('PDF session mapping is a supported shared document and survives serialization', () => {
  assert.equal(isWorkspaceDocumentKey(key), true);
  const saved = JSON.parse(JSON.stringify({ 'asset-1': 'GUITAR', 'asset-2': 'DRUMS' }));
  assert.equal(canWriteDocument(key, undefined, saved, 'member', false), true);
  assert.equal(canWriteDocument(key, saved, { 'asset-2': 'DRUMS' }, 'member', false), true);
});
test('PDF session mapping rejects invalid data', () => {
  for (const value of [[], null, { bad: 'UNKNOWN' }, { bad: 42 }, { 'invalid/id': 'GUITAR' }])
    assert.equal(canWriteDocument(key, undefined, value, 'member', true), false);
});
