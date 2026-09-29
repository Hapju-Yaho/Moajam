import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Buffer } from 'node:buffer';
import { URL } from 'node:url';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import ts from 'typescript';
async function fixture() {
  let user = 'a';
  let reject = false;
  const records = new Map();
  const writes = [];
  const key = randomUUID();
  globalThis[key] = {
    currentIdentity: async () => user,
    api: async (path, method, body, expected) => {
      assert.equal(expected, user, 'writes must preserve the account captured at enqueue');
      const id = `${user}/${path}`;
      const before = records.get(id);
      if (method === 'GET') return before ?? null;
      writes.push({ user, revision: body.revision, value: body.value });
      if (reject || body.revision !== (before?.revision ?? 0)) throw new Error('conflict');
      const after = { revision: body.revision + 1, value: body.value };
      records.set(id, after);
      return after;
    },
  };
  const source = readFileSync(
    new URL('../packages/app/src/lib/personal-store.ts', import.meta.url),
    'utf8',
  ).replace(
    /import[^;]+from '\.\/remote';/,
    `const {api,currentIdentity}=globalThis[${JSON.stringify(key)}];`,
  );
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  });
  const store = await import(
    `data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`
  );
  delete globalThis[key];
  return {
    store,
    writes,
    user: (value) => {
      user = value;
    },
    reject: (value) => {
      reject = value;
    },
  };
}
test('personal autosave serializes rapid edits using the latest acknowledged revision', async () => {
  const { store, writes } = await fixture();
  await store.readPersonal('score/personal');
  await Promise.all([1, 2, 3].map((value) => store.writePersonal('score/personal', { value })));
  assert.deepEqual(
    writes.map((write) => write.revision),
    [0, 1, 2],
  );
  assert.deepEqual(await store.readPersonal('score/personal'), { value: 3 });
});
test('a conflict stops later writes until explicit reload; accounts remain isolated', async () => {
  const f = await fixture();
  await f.store.readPersonal('score/personal');
  f.reject(true);
  await assert.rejects(f.store.writePersonal('score/personal', { value: 1 }), /conflict/);
  f.reject(false);
  await assert.rejects(f.store.writePersonal('score/personal', { value: 2 }), /conflict/);
  assert.equal(f.writes.length, 1, 'failed state must not silently overwrite newer remote content');
  f.user('b');
  await f.store.readPersonal('score/personal', 'b');
  await f.store.writePersonal('score/personal', { value: 3 }, 'b');
  f.user('a');
  assert.equal(await f.store.readPersonal('score/personal', 'a'), undefined);
  await f.store.writePersonal('score/personal', { value: 4 }, 'a');
  await assert.rejects(f.store.writePersonal('score/personal', { value: 5 }, 'b'), /계정이 변경/);
});
