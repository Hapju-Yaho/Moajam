import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Buffer, Blob } from 'node:buffer';
import { randomUUID } from 'node:crypto';
import { URL } from 'node:url';
import test from 'node:test';
import ts from 'typescript';
const { queueMicrotask, structuredClone } = globalThis;

function storageFixture() {
  const records = new Map();
  const attachments = new Map();
  let full = false;
  const localStorage = {
    getItem: (key) => records.get(key) ?? null,
    setItem: (key, value) => {
      if (full) throw new Error('QuotaExceededError');
      records.set(key, value);
    },
    removeItem: (key) => records.delete(key),
    key: (index) => [...records.keys()][index] ?? null,
    get length() {
      return records.size;
    },
  };
  const indexedDB = {
    open: () => {
      const request = {};
      queueMicrotask(() => {
        request.result = {
          transaction: () => {
            const transaction = {};
            transaction.objectStore = () => ({
              get: (key) => {
                const read = {};
                queueMicrotask(() => {
                  read.result = structuredClone(attachments.get(key));
                  read.onsuccess?.();
                });
                return read;
              },
              put: (value, key) => {
                attachments.set(key, structuredClone(value));
                queueMicrotask(() => transaction.oncomplete?.());
              },
            });
            return transaction;
          },
        };
        request.onsuccess?.();
      });
      return request;
    },
  };
  return {
    records,
    attachments,
    localStorage,
    indexedDB,
    fill: () => {
      full = true;
    },
  };
}
async function load(path, fixture) {
  const id = randomUUID();
  globalThis[id] = {
    ...fixture,
    Blob,
    crypto: { randomUUID },
    clientId: randomUUID,
    serverConfigured: false,
    currentIdentity: async () => 'm1',
    readRemoteMedia: () => {
      throw new Error('unexpected API');
    },
    writeRemoteMedia: () => {
      throw new Error('unexpected API');
    },
  };
  const source = readFileSync(new URL(path, import.meta.url), 'utf8').replace(
    /import[\s\S]*?from '[^']+';/g,
    '',
  );
  const setup =
    'const { localStorage, indexedDB, Blob, crypto, clientId, serverConfigured, currentIdentity, readRemoteMedia, writeRemoteMedia } = globalThis[' +
    JSON.stringify(id) +
    '];\n';
  const { outputText } = ts.transpileModule(setup + source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  });
  const module = await import(
    'data:text/javascript;base64,' + Buffer.from(outputText).toString('base64')
  );
  delete globalThis[id];
  return module;
}
const mediaPath = '../packages/app/src/lib/mediaStore.web.ts';

test('workspace CRUD persists across reload, including deleting every workspace', async () => {
  const f = storageFixture();
  const storage = await load('../packages/app/src/state/workspaceStorage.web.ts', f);
  const band = {
    id: 'test-band',
    name: 'New band',
    description: '',
    color: '#123456',
    members: [],
    recommendations: [],
    adoptedSongs: [],
    rehearsals: [],
  };
  const state = { version: 1, workspaces: [band], selectedWorkspaceId: band.id };
  assert.equal(storage.saveWorkspaceState(state), true);
  assert.equal(storage.loadWorkspaceState().workspaces[0].name, 'New band');
  band.name = 'Updated band';
  band.recommendations.push({ id: 'test-song', title: 'New song', artist: 'Test' });
  storage.saveWorkspaceState(state);
  const reloaded = await load('../packages/app/src/state/workspaceStorage.web.ts', f);
  assert.equal(reloaded.loadWorkspaceState().workspaces[0].name, 'Updated band');
  assert.equal(reloaded.loadWorkspaceState().workspaces[0].recommendations.length, 1);
  band.recommendations = [];
  storage.saveWorkspaceState(state);
  assert.equal(reloaded.loadWorkspaceState().workspaces[0].recommendations.length, 0);
  storage.saveWorkspaceState({ ...state, workspaces: [] });
  assert.deepEqual(reloaded.loadWorkspaceState().workspaces, []);
});

test('mock document add, rapid edits and delete persist in localStorage without API calls', async () => {
  const f = storageFixture();
  const store = await load(mediaPath, f);
  await store.writeMedia('score/personal', { title: 'First', notes: [60] });
  await Promise.all([
    store.writeMedia('score/personal', { title: 'Second', notes: [60] }),
    store.writeMedia('score/personal', { title: 'Last', notes: [] }),
  ]);
  const reloaded = await load(mediaPath, f);
  assert.deepEqual(await reloaded.readMedia('score/personal'), { title: 'Last', notes: [] });
  assert.equal(f.attachments.size, 0);
  await reloaded.writeMedia('score/personal', { title: 'Last', notes: [] });
  assert.ok(f.records.has('moajam-mock-document/m1/score/personal'));
});

test('attachment bytes remain in IndexedDB while metadata and deletion live in localStorage', async () => {
  const f = storageFixture();
  const store = await load(mediaPath, f);
  const blob = new Blob(['audio-fixture'], { type: 'audio/wav' });
  await store.writeMedia('practice/personal', { tracks: [{ name: 'Take', blob }] });
  const saved = JSON.parse(f.records.get('moajam-mock-document/m1/practice/personal'));
  assert.equal(saved.value.tracks[0].name, 'Take');
  assert.equal(typeof saved.value.tracks[0].blob.__moajamMockBlob, 'string');
  const reloaded = await load(mediaPath, f);
  const result = await reloaded.readMedia('practice/personal');
  assert.equal(await result.tracks[0].blob.text(), 'audio-fixture');
  assert.equal(result.tracks[0].blob.type, 'audio/wav');
  await reloaded.writeMedia('practice/personal', { tracks: [] });
  assert.deepEqual(await store.readMedia('practice/personal'), { tracks: [] });
});

test('legacy records migrate without deleting originals and cleared records never resurrect', async () => {
  const f = storageFixture();
  f.attachments.set('m1/library/personal', [{ id: 'old', name: 'Original' }]);
  const store = await load(mediaPath, f);
  assert.equal((await store.readMedia('library/personal'))[0].id, 'old');
  assert.ok(f.records.has('moajam-mock-document/m1/library/personal'));
  assert.ok(f.attachments.has('m1/library/personal'));
  await store.writeMedia('library/personal', []);
  const reloaded = await load(mediaPath, f);
  assert.deepEqual(await reloaded.readMedia('library/personal'), []);
});

test('score instrument sample restores tuning and bytes, stays private, and can be detached', async () => {
  const f = storageFixture();
  const store = await load(mediaPath, f);
  const instrumentSample = {
    file: new Blob(['single-note'], { type: 'audio/wav' }),
    name: 'guitar.wav',
    rootMidi: 57.15,
    enabled: true,
    sustain: true,
    trimStart: 0.25,
    trimEnd: 1.5,
    autoRoot: true,
  };
  await store.writeMedia('score/personal', { title: 'Sample score', instrumentSample }, 'm1');
  const reloaded = await load(mediaPath, f);
  const restored = await reloaded.readMedia('score/personal', 'm1');
  assert.equal(await restored.instrumentSample.file.text(), 'single-note');
  assert.equal(restored.instrumentSample.rootMidi, 57.15);
  assert.equal(restored.instrumentSample.sustain, true);
  assert.equal(restored.instrumentSample.trimStart, 0.25);
  assert.equal(restored.instrumentSample.trimEnd, 1.5);
  assert.equal(restored.instrumentSample.autoRoot, true);
  assert.equal(await reloaded.readMedia('score/personal', 'm2'), undefined);
  await reloaded.writeMedia(
    'score/personal',
    { ...restored, instrumentSample: { ...restored.instrumentSample, enabled: false } },
    'm1',
  );
  assert.equal(f.attachments.size, 1, 'changing settings reuses the saved attachment');
  await reloaded.writeMedia('score/personal', { ...restored, instrumentSample: null }, 'm1');
  assert.equal((await store.readMedia('score/personal', 'm1')).instrumentSample, null);
});

test('storage quota failure surfaces and preserves the last acknowledged document', async () => {
  const f = storageFixture();
  const store = await load(mediaPath, f);
  await store.writeMedia('score/personal', { title: 'Preserved' });
  f.fill();
  await assert.rejects(store.writeMedia('score/personal', { title: 'Unsaved' }), /Quota/);
  assert.deepEqual(await store.readMedia('score/personal'), { title: 'Preserved' });
});
