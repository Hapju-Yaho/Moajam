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

const { hydrateClipDuration } = await import(url('../packages/app/src/lib/practiceClips.ts'));
test('saved lengths survive repeated decode, refresh, share and reopening without dirty changes', async () => {
  const remote = {
    ...base,
    tracks: [{ ...track, clips: [{ ...clip, blob: new Blob(['audio']), url: 'blob:remote' }] }],
  };
  await Promise.all([identifyAudio(base), identifyAudio(remote)]);
  let current = mergePractice(base, base, remote).document;
  for (const decoded of [10.023, 10.001, 9.98]) {
    current = { ...current, tracks: hydrateClipDuration(current.tracks, 'c', decoded) };
    assert.equal(current.tracks[0].clips[0].duration, 10);
    assert.equal(samePractice(current, remote), true);
  }
  const edited = { ...base, tracks: [{ ...track, clips: [{ ...clip, offset: 3 }] }] };
  const pending = mergePractice(base, edited, remote).document;
  const shared = { ...pending, tracks: hydrateClipDuration(pending.tracks, 'c', 10.03) };
  assert.equal(samePractice(pending, shared), true);
  assert.equal(
    samePractice(remote, { ...remote, tracks: hydrateClipDuration(remote.tracks, 'c', 9.99) }),
    true,
  );
});
test('missing lengths hydrate once without hiding edits or changing trimmed clips', () => {
  const unknown = [{ ...track, clips: [{ ...clip, duration: 0 }] }];
  const hydrated = hydrateClipDuration(unknown, 'c', 10.02);
  assert.equal(hydrated[0].clips[0].duration, 10.02);
  assert.equal(hydrateClipDuration(hydrated, 'c', 10.08), hydrated);
  assert.equal(hydrateClipDuration(unknown, 'c', Infinity), unknown);
  const trimmed = [{ ...track, clips: [{ ...clip, duration: 0, trimmed: true }] }];
  assert.equal(hydrateClipDuration(trimmed, 'c', 10), trimmed);
  const edited = [{ ...unknown[0], clips: [{ ...unknown[0].clips[0], offset: 3 }] }];
  assert.equal(samePractice(hydrateClipDuration(edited, 'c', 10.02), hydrated), false);
});
const { movePracticeSong, orderPracticeSongs } = await import(
  url('../packages/app/src/lib/practiceSongOrder.ts')
);
test('practice song ordering preserves unique songs and appends newly adopted songs', () => {
  const songs = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  assert.deepEqual(movePracticeSong(['a', 'b', 'c'], 'a', 'c'), ['b', 'c', 'a']);
  assert.deepEqual(movePracticeSong(['a', 'b', 'c'], 'c', 'a'), ['c', 'a', 'b']);
  assert.deepEqual(
    orderPracticeSongs(songs, ['c', 'missing', 'a']).map((song) => song.id),
    ['c', 'a', 'b'],
  );
});

const { sharedPracticeSettings } = await import(
  url('../packages/app/src/lib/sharedPracticeSettings.ts')
);
test('local metronome preferences are excluded while tempo and meter stay shared', () => {
  const original = {
    tracks: [],
    notes: [],
    bpm: 120,
    signature: '4/4',
    metronome: true,
    clickVolume: 0.8,
  };
  const shared = sharedPracticeSettings(original);
  assert.equal('metronome' in shared, false);
  assert.equal('clickVolume' in shared, false);
  assert.equal(original.metronome, true);
  assert.ok(
    samePractice(
      shared,
      sharedPracticeSettings({ ...original, metronome: false, clickVolume: 0.1 }),
    ),
  );
  assert.equal(samePractice(shared, sharedPracticeSettings({ ...original, bpm: 140 })), false);
  assert.equal(
    samePractice(shared, sharedPracticeSettings({ ...original, signature: '3/4' })),
    false,
  );
});

test('remote track reordering survives independent local track edits', () => {
  const first = { ...track, id: 'first' },
    second = { ...track, id: 'second' };
  const base = { tracks: [first, second], notes: [] };
  const local = { ...base, tracks: [{ ...first, name: 'edited' }, second] };
  const remote = { ...base, tracks: [second, first] };
  const result = mergePractice(base, local, remote);
  assert.equal(result.conflict, false);
  assert.deepEqual(
    result.document.tracks.map((track) => track.id),
    ['second', 'first'],
  );
  assert.equal(result.document.tracks[1].name, 'edited');
});
