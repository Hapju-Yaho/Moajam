import { Buffer, Blob } from 'node:buffer';
import { URL } from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const dataUrl = (source) => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
test('band media uses shared revisions and uploads; personal media remains personal', async () => {
  const band = '12345678-1234-1234-1234-123456789abc';
  const key = `practice/${band}/song`;
  let document = null;
  const calls = [];
  globalThis.__mediaTest = {
    currentIdentity: async () => 'member-b',
    uploadRemoteFile: async (...args) => {
      calls.push(['upload', ...args]);
      return 'asset';
    },
    api: async (path, method, body) => {
      calls.push([method, path, body]);
      if (path.includes('/visibility')) return {};
      if (method === 'GET') return document;
      assert.equal(body.revision, document?.revision ?? 0);
      document = { revision: (document?.revision ?? 0) + 1, value: body.value };
      return document;
    },
    readPersonal: async () => {
      calls.push(['personal-read']);
      return { tracks: [] };
    },
    assertPersonalUnchanged: async () => {},
    writePersonal: async () => {
      calls.push(['personal-write']);
    },
  };
  try {
    const remote = dataUrl(
      'export const { api, currentIdentity, uploadRemoteFile } = globalThis.__mediaTest;',
    );
    const personal = dataUrl(
      'export const { readPersonal, writePersonal, assertPersonalUnchanged } = globalThis.__mediaTest;',
    );
    const source = ts
      .transpileModule(
        readFileSync(
          new URL('../packages/app/src/lib/remote-media.web.ts', import.meta.url),
          'utf8',
        ),
        { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } },
      )
      .outputText.replaceAll("'./remote'", JSON.stringify(remote))
      .replaceAll("'./personal-store'", JSON.stringify(personal));
    const { readRemoteMedia, writeRemoteMedia, encode } = await import(dataUrl(source));
    assert.equal(await readRemoteMedia(key), undefined);
    await writeRemoteMedia(key, {
      tracks: [{ blob: new Blob(['audio'], { type: 'audio/wav' }) }],
      bpm: 132,
      signature: '3/4',
    });
    assert.equal(document.value.data.bpm, 132);
    assert.equal(calls.find((call) => call[0] === 'upload')[4], band);
    assert.ok(calls.some((call) => call[0] === 'PATCH' && call[1] === '/assets/asset/visibility'));
    assert.ok(!calls.some((call) => call[0].startsWith('personal')));
    document.revision++;
    await assert.rejects(writeRemoteMedia(key, { tracks: [] }));
    await readRemoteMedia('practice/personal');
    await writeRemoteMedia('practice/personal', { tracks: [] });
    assert.ok(calls.some((call) => call[0] === 'personal-read'));
    assert.ok(calls.some((call) => call[0] === 'personal-write'));
    const projectId = 'aaaaaaaa-1234-1234-1234-123456789abc';
    const projectKey = `daw-project/${band}/${projectId}`;
    document = { revision: 1, value: { data: { tracks: [] } } };
    const previousCalls = calls.length;
    await readRemoteMedia(projectKey);
    const projectBlob = new Blob(['project audio'], { type: 'audio/wav' });
    await writeRemoteMedia(projectKey, { tracks: [{ blob: projectBlob }] }, undefined, {
      name: 'Edited project name',
    });
    const projectCalls = calls.slice(previousCalls);
    assert.ok(
      projectCalls.some(
        (call) => call[0] === 'PUT' && call[1] === `/workspaces/${band}/daw-projects/${projectId}`,
      ),
    );
    assert.equal(projectCalls.find((call) => call[0] === 'upload')[4], band);
    assert.equal(projectCalls.find((call) => call[0] === 'PUT')[2].name, 'Edited project name');
    const uploadCount = calls.filter((call) => call[0] === 'upload').length;
    const snapshot = await encode({ tracks: [{ blob: projectBlob }] }, projectKey, 'member-b');
    assert.deepEqual(snapshot.tracks[0].blob, { __moajamAssetId: 'asset' });
    assert.equal(calls.filter((call) => call[0] === 'upload').length, uploadCount);
    const scoreKey = `score-project/${band}/${projectId}`;
    const scoreSnapshot = await encode({ referenceAudio: projectBlob }, scoreKey, 'member-b');
    assert.deepEqual(scoreSnapshot.referenceAudio, { __moajamAssetId: 'asset' });
    assert.equal(calls.filter((call) => call[0] === 'upload').length, uploadCount);
    const newScoreAudio = new Blob(['score audio'], { type: 'audio/wav' });
    await encode({ referenceAudio: newScoreAudio }, scoreKey, 'member-b');
    assert.equal(calls.filter((call) => call[0] === 'upload').at(-1)[4], band);
    document = { revision: 1, value: { data: { notes: [] } } };
    await readRemoteMedia(scoreKey);
    await writeRemoteMedia(scoreKey, { notes: [] });
    assert.ok(
      calls.some(
        (call) =>
          call[0] === 'PUT' && call[1] === `/workspaces/${band}/score-projects/${projectId}`,
      ),
    );
    assert.equal(
      projectCalls.some((call) => call[0].startsWith('personal')),
      false,
    );
    document.revision++;
    await assert.rejects(writeRemoteMedia(projectKey, { tracks: [] }));
  } finally {
    delete globalThis.__mediaTest;
  }
});
