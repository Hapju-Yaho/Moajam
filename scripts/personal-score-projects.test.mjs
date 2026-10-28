import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const url = (source) => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const records = new Map();
globalThis.__personalScoreRecords = records;
Object.defineProperty(globalThis, 'navigator', {
  configurable: true,
  value: { locks: { request: async (_key, fn) => fn() } },
});
const stubs = {
  './clientId': url('export const clientId = () => crypto.randomUUID();'),
  './remote': url(
    'export const serverConfigured = true; export const currentIdentity = async () => "alice"; export const api = () => { throw new Error("Personal project used server API"); };',
  ),
  './remote-media.web': url(
    'export const encode = () => { throw new Error("Personal project encoded remotely"); };',
  ),
  './mediaStore.web': url(
    `export async function readMedia(key, owner) { if (!key.startsWith('local-recording/')) throw new Error('Nonlocal key'); return structuredClone(globalThis.__personalScoreRecords.get(owner + key)); } export async function writeMedia(key, value, owner) { if (!key.startsWith('local-recording/')) throw new Error('Nonlocal key'); globalThis.__personalScoreRecords.set(owner + key, structuredClone(value)); }`,
  ),
};
const source = ts
  .transpileModule(
    readFileSync(new URL('../packages/app/src/lib/scoreProjects.web.ts', import.meta.url), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } },
  )
  .outputText.replace(/from ['"](.+?)['"]/g, (_, path) => `from '${stubs[path]}'`);
const projects = await import(url(source));

test('plain HTTP without Web Locks supports concurrent creation and duplicate rejection', async () => {
  const locks = navigator.locks;
  navigator.locks = undefined;
  try {
    const workspace = 'local-recording/score/http';
    const data = { title: 'HTTP', bpm: 120, notes: [], parts: ['Guitar'], sync: {} };
    assert.deepEqual(await projects.listScoreProjects(workspace, 'personal', ''), []);
    const results = await Promise.allSettled([
      projects.createScoreProject(workspace, 'personal', 'Same', data),
      projects.createScoreProject(workspace, 'personal', 'Same', data),
      projects.createScoreProject(workspace, 'personal', 'Other', data),
    ]);
    assert.equal(results.filter((item) => item.status === 'fulfilled').length, 2);
    const rows = await projects.listScoreProjects(workspace, 'personal', '');
    assert.equal(rows.length, 2);
    await projects.writeScoreProject(workspace, 'personal', rows[0].id, 1, data, 'Renamed');
    assert.equal(
      (await projects.readScoreProject(workspace, 'personal', rows[0].id)).name,
      'Renamed',
    );
    await projects.deleteScoreProject(workspace, 'personal', rows[0].id, 2);
    assert.equal((await projects.listScoreProjects(workspace, 'personal', '')).length, 1);
  } finally {
    navigator.locks = locks;
  }
});

test('personal score projects remain local with server enabled and support CRUD, copies and user isolation', async () => {
  const workspace = 'local-recording/score/alice';
  const data = { title: 'My score', bpm: 120, notes: [], parts: ['Guitar'], sync: {} };
  assert.deepEqual(await projects.listScoreProjects(workspace, 'personal', 'My score'), []);
  const created = await projects.createScoreProject(workspace, 'personal', 'First', data);
  await assert.rejects(projects.createScoreProject(workspace, 'personal', 'First', data));
  await projects.writeScoreProject(
    workspace,
    'personal',
    created.id,
    1,
    { ...data, bpm: 90 },
    'Renamed',
  );
  const loaded = await projects.readScoreProject(workspace, 'personal', created.id);
  assert.equal(loaded.value.data.bpm, 90);
  assert.equal(loaded.name, 'Renamed');
  await projects.createScoreProject(workspace, 'personal', 'Copy', loaded.value.data);
  assert.equal((await projects.listScoreProjects(workspace, 'personal', '')).length, 2);
  assert.deepEqual(
    await projects.listScoreProjects('local-recording/score/bob', 'personal', ''),
    [],
  );
  await assert.rejects(projects.writeScoreProject(workspace, 'personal', created.id, 1, data));
  await projects.deleteScoreProject(workspace, 'personal', created.id, 2);
  assert.equal((await projects.listScoreProjects(workspace, 'personal', '')).length, 1);
});
