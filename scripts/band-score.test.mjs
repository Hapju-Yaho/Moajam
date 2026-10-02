import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Buffer } from 'node:buffer';
import { URL } from 'node:url';
import test from 'node:test';
import ts from 'typescript';

const url = (source) => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const modules = new Map();
function moduleUrl(path, replacements = {}) {
  if (modules.has(path.href)) return modules.get(path.href);
  const { outputText } = ts.transpileModule(readFileSync(path, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  });
  const linked = outputText.replace(
    /from ['"](.+?)['"]/g,
    (_, relative) =>
      `from '${replacements[relative] ?? moduleUrl(new URL(relative + '.ts', path))}'`,
  );
  const result = url(linked);
  modules.set(path.href, result);
  return result;
}
const remoteUrl = url(`
  export let serverConfigured = false;
  export const records = new Map();
  export const calls = [];
  export function reset(remote) { serverConfigured = remote; records.clear(); calls.length = 0; }
  export async function api(path, method, body, user) {
    calls.push({path, method, user});
    const current = records.get(path);
    if (method === 'GET') return structuredClone(current ?? null);
    if ((current?.revision ?? 0) !== body.revision) throw new Error('conflict');
    const next = {revision: body.revision + 1, value: structuredClone(body.value)};
    records.set(path, next);
    return next;
  }
`);
const mediaUrl = url(`
  export const records = new Map();
  export async function readMedia(key, user) { return structuredClone(records.get(user + '/' + key)); }
  export async function writeMedia(key, value, user) { records.set(user + '/' + key, structuredClone(value)); }
`);
const codecUrl = url(
  'export async function encode(value) { return value; } export async function decode(value) { return value; }',
);
const { createBandScoreStore } = await import(
  moduleUrl(new URL('../packages/app/src/lib/bandScoreStore.web.ts', import.meta.url), {
    './remote': remoteUrl,
    './mediaStore.web': mediaUrl,
    './remote-media.web': codecUrl,
  })
);
const remote = await import(remoteUrl);
const media = await import(mediaUrl);
// Model browser Web Locks so simultaneous mock saves run atomically.
let lock = Promise.resolve();
Object.defineProperty(globalThis, 'navigator', {
  configurable: true,
  value: {
    locks: {
      request: (_key, callback) => {
        const task = lock.catch(() => {}).then(callback);
        lock = task;
        return task;
      },
    },
  },
});
const score = { title: 'Bass score', bpm: 120, parts: ['Bass'], notes: [], sync: {} };

for (const mode of [false, true]) {
  test(`${mode ? 'server' : 'mock'}: shares between members, isolates songs, and preserves personal scores`, async () => {
    remote.reset(mode);
    media.records.clear();
    await media.writeMedia('score/band/song', score, 'alice');
    const alice = createBandScoreStore('band', 'song', 'alice');
    const bob = createBandScoreStore('band', 'song', 'bob');
    assert.equal(await alice.load(), undefined);
    await alice.save({ ...score, title: 'Shared' });
    assert.equal((await bob.load()).title, 'Shared');
    assert.equal(await createBandScoreStore('band', 'other', 'bob').load(), undefined);
    assert.equal((await media.readMedia('score/band/song', 'alice')).title, 'Bass score');
  });
  test(`${mode ? 'server' : 'mock'}: stale editors cannot overwrite newer revisions`, async () => {
    remote.reset(mode);
    media.records.clear();
    const a = createBandScoreStore('band', 'song', 'alice');
    const b = createBandScoreStore('band', 'song', 'bob');
    await Promise.all([a.load(), b.load()]);
    const results = await Promise.allSettled([a.save(score), b.save({ ...score, title: 'loser' })]);
    assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
    await b.load();
    await b.save({ ...score, title: 'latest' });
    await assert.rejects(a.save({ ...score, title: 'stale' }));
    // Another editor (even the same user) reading must not advance a's revision.
    assert.equal((await createBandScoreStore('band', 'song', 'alice').load()).title, 'latest');
    await assert.rejects(a.save(score));
    assert.equal((await a.load()).title, 'latest');
  });
  test(`${mode ? 'server' : 'mock'}: does not save before load or accept corrupt data`, async () => {
    remote.reset(mode);
    media.records.clear();
    const editor = createBandScoreStore('band', 'song', 'alice');
    await assert.rejects(editor.save(score), /먼저/);
    await editor.load();
    await assert.rejects(editor.save({ ...score, notes: [{}] }));
    assert.equal(await editor.load(), undefined);
  });
}

const { buildAppPath } = await import(
  moduleUrl(new URL('../packages/app/src/navigation.ts', import.meta.url))
);
test('band and personal editor links remain separate and preserve song context', () => {
  const context = { route: 'practice', workspaceId: 'band', entityId: 'song' };
  assert.equal(
    buildAppPath('band-score-editor', undefined, context),
    '/workspaces/band/songs/song/score',
  );
  assert.equal(
    buildAppPath('score-editor', undefined, context),
    '/me/score-editor?workspaceId=band&songId=song',
  );
  assert.equal(
    buildAppPath('practice', { workspaceId: 'band', id: 'song' }, context),
    '/workspaces/band/songs/song/practice',
  );
});
