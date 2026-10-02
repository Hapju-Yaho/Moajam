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
    const { readRemoteMedia, writeRemoteMedia } = await import(dataUrl(source));
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
  } finally {
    delete globalThis.__mediaTest;
  }
});
