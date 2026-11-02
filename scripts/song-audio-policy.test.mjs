import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canWriteDocument, isWorkspaceDocumentKey } from '../apps/server/src/workspaces/document-policy.ts';

test('song audio references can only be changed by band managers', () => {
  const key = 'song/song-1/audio';
  const value = { id: 'asset-1', name: 'practice.mp3' };
  assert.equal(isWorkspaceDocumentKey(key), true);
  assert.equal(canWriteDocument(key, null, value, 'owner', true), true);
  assert.equal(canWriteDocument(key, value, { ...value, start: 12.5 }, 'owner', true), true);
  assert.equal(canWriteDocument(key, value, { ...value, start: 12.5, bpm: 124 }, 'owner', true), true);
  assert.equal(canWriteDocument(key, value, { ...value, signature: '6/8' }, 'owner', true), true);
  assert.equal(canWriteDocument(key, value, { ...value, signature: 'invalid' }, 'owner', true), false);
  assert.equal(canWriteDocument(key, value, { ...value, bpm: 0 }, 'owner', true), false);
  assert.equal(canWriteDocument(key, value, null, 'owner', true), true);
  assert.equal(canWriteDocument(key, null, value, 'member', false), false);
  assert.equal(canWriteDocument(key, value, null, 'member', false), false);
});
test('song audio references reject malformed asset IDs and injected metadata', () => {
  const key = 'song/song-1/audio';
  for (const value of [{ id: '../asset', name: 'x' }, { id: 'asset', name: '' }, { id: 'asset', name: 'x', url: 'https://elsewhere' }, { id: 'asset', name: 'x', start: -1 }, { id: 'asset', name: 'x', start: Infinity }]) {
    assert.equal(canWriteDocument(key, null, value, 'owner', true), false);
  }
});
