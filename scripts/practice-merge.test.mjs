import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Buffer, Blob } from 'node:buffer';
import { URL } from 'node:url';
import test from 'node:test';
import ts from 'typescript';
const url = (path, imports = {}) => {
  let { outputText } = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  });
  for (const [name, value] of Object.entries(imports))
    outputText = outputText.replaceAll(`'${name}'`, `'${value}'`);
  return `data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`;
};
const { mergePractice, identifyAudio, samePractice } = await import(
  url('../packages/app/src/lib/practiceMerge.ts', {
    './practiceClips': url('../packages/app/src/lib/practiceClips.ts'),
  })
);
const clip = {
  id: 'c',
  name: 'audio',
  offset: 0,
  sourceStart: 0,
  duration: 10,
  url: '',
  blob: new Blob(['audio']),
};
const track = {
  id: 't',
  name: 'track',
  volume: 1,
  muted: false,
  offset: 0,
  duration: 0,
  url: '',
  clips: [clip],
};
const base = { tracks: [track], notes: [] };
test('refresh merges independent fields and server-added tracks and clips without discarding local work', () => {
  const local = { ...base, tracks: [{ ...track, name: 'local', clips: [{ ...clip, offset: 2 }] }] };
  const remote = {
    ...base,
    tracks: [
      { ...track, volume: 0.5, clips: [clip, { ...clip, id: 'new' }] },
      { ...track, id: 'new-track', clips: [] },
    ],
  };
  const result = mergePractice(base, local, remote);
  assert.equal(result.conflict, false);
  assert.equal(result.document.tracks[0].name, 'local');
  assert.equal(result.document.tracks[0].volume, 0.5);
  assert.equal(result.document.tracks[0].clips[0].offset, 2);
  assert.equal(result.document.tracks[0].clips.length, 2);
  assert.equal(result.document.tracks.length, 2);
});
test('conflicting clip changes preserve local fields and detect server deletion', () => {
  const local = { ...base, tracks: [{ ...track, clips: [{ ...clip, offset: 2 }] }] };
  const remote = { ...base, tracks: [{ ...track, clips: [{ ...clip, offset: 5 }] }] };
  const result = mergePractice(base, local, remote);
  assert.equal(result.conflict, true);
  assert.equal(result.document.tracks[0].clips[0].offset, 2);
  const deleted = mergePractice(base, local, { tracks: [], notes: [] });
  assert.equal(deleted.conflict, true);
  assert.equal(deleted.document.tracks[0].clips[0].id, 'c');
});
test('remote clip move plus local clip rename produces only one clip in destination', () => {
  const local = { ...base, tracks: [{ ...track, clips: [{ ...clip, name: 'renamed' }] }] };
  const remote = {
    ...base,
    tracks: [
      { ...track, clips: [] },
      { ...track, id: 'target' },
    ],
  };
  const result = mergePractice(base, local, remote);
  assert.equal(result.conflict, false);
  assert.equal(result.document.tracks[0].clips.length, 0);
  assert.equal(result.document.tracks[1].clips[0].name, 'renamed');
});
test('audio comparison distinguishes same-sized replacements and ignores transient URLs', async () => {
  const first = new Blob(['abc']),
    same = new Blob(['abc']),
    different = new Blob(['xyz']);
  await identifyAudio([first, same, different]);
  assert.equal(samePractice({ blob: first, url: 'one' }, { blob: same, url: 'two' }), true);
  assert.equal(samePractice(first, different), false);
});
