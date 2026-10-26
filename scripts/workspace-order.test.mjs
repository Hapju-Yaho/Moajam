import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const url = (source) => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
async function fixture(serverConfigured) {
  const records = new Map();
  const local = new Map();
  const calls = [];
  globalThis.__workspaceOrder = {
    serverConfigured,
    api: async (path, method, body, user) => {
      calls.push({ path, method, body, user });
      if (method === 'PUT' && (!body.initializeOnly || !records.has(user)))
        records.set(user, body.ids);
      return { ids: records.get(user) ?? [], initialized: records.has(user) };
    },
    loadPreferences: (scope) => local.get(scope) ?? {},
    savePreferences: (value, scope) => local.set(scope, value),
  };
  const remote = url(
    `export const { api, serverConfigured } = globalThis.__workspaceOrder; // ${serverConfigured}`,
  );
  const preferences = url(
    `export const { loadPreferences, savePreferences } = globalThis.__workspaceOrder; // ${serverConfigured}`,
  );
  const source = ts
    .transpileModule(
      readFileSync(new URL('../packages/app/src/lib/workspaceOrder.ts', import.meta.url), 'utf8'),
      { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } },
    )
    .outputText.replaceAll("'./remote'", JSON.stringify(remote))
    .replaceAll("'../state/preferencesStorage'", JSON.stringify(preferences));
  return { ...(await import(url(source))), records, local, calls };
}
test('server workspace order is per-user, migrates local order once and wins on other devices', async () => {
  const f = await fixture(true);
  f.local.set('team-order/alice', { ids: ['b', 'a', 'removed', 'b'] });
  assert.deepEqual(await f.loadWorkspaceOrder('alice', ['a', 'b']), ['b', 'a']);
  assert.deepEqual(f.calls.find((call) => call.method === 'PUT').body, {
    ids: ['b', 'a'],
    initializeOnly: true,
  });
  f.local.clear();
  assert.deepEqual(await f.loadWorkspaceOrder('alice', ['a', 'b']), ['b', 'a']);
  assert.deepEqual(await f.loadWorkspaceOrder('bob', ['a', 'b']), []);
  await f.saveWorkspaceOrder('alice', ['a', 'b']);
  assert.deepEqual(f.records.get('alice'), ['a', 'b']);
  assert.equal(f.local.size, 0);
  f.local.set('team-order/alice', { ids: ['b', 'a'] });
  assert.deepEqual(await f.loadWorkspaceOrder('alice', ['a', 'b']), ['a', 'b']);
  delete globalThis.__workspaceOrder;
});
test('demo mode keeps ordering available without a server', async () => {
  const f = await fixture(false);
  await f.saveWorkspaceOrder('demo', ['b', 'a']);
  assert.deepEqual(await f.loadWorkspaceOrder('demo', ['a', 'b']), ['b', 'a']);
  assert.equal(f.calls.length, 0);
  delete globalThis.__workspaceOrder;
});
