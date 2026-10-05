import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import process from 'node:process';
import { URL } from 'node:url';
import prettier from 'prettier';
import { readSpec, operations, renderCatalog, catalogPath } from './api-docs-lib.mjs';

const spec = readSpec();
assert.equal(spec.openapi, '3.1.0');
const resolve = (pointer) => {
  assert.ok(pointer.startsWith('#/'), `외부 참조는 이 검사에서 지원하지 않음: ${pointer}`);
  return pointer
    .slice(2)
    .split('/')
    .reduce((value, key) => {
      const decoded = key.replaceAll('~1', '/').replaceAll('~0', '~');
      assert.ok(value && Object.hasOwn(value, decoded), `누락된 참조: ${pointer}`);
      return value[decoded];
    }, spec);
};
function walk(node) {
  if (!node || typeof node !== 'object') return;
  if (node.$ref) resolve(node.$ref);
  if (node.type === 'object' && node.required && node.properties) {
    for (const field of node.required)
      assert.ok(Object.hasOwn(node.properties, field), `required 필드 누락: ${field}`);
  }
  for (const value of Object.values(node)) walk(value);
}
walk(spec);
const seen = new Set();
const normalizedPaths = new Set();
for (const path of Object.keys(spec.paths)) {
  const normalized = path.replace(/\{[^}]+\}/g, '{}');
  assert.ok(!normalizedPaths.has(normalized), `동일 경로 템플릿 중복: ${path}`);
  normalizedPaths.add(normalized);
}
for (const { path, method, operation: op } of operations(spec)) {
  assert.ok(op.operationId && !seen.has(op.operationId), `operationId 누락/중복: ${path}`);
  seen.add(op.operationId);
  assert.ok(op.summary && op.description && op['x-permission']);
  assert.ok(['P0', 'P1', 'P2'].includes(op['x-phase']));
  assert.equal(op['x-implementation-status'], 'planned');
  assert.ok(op.tags.every((tag) => spec.tags.some((entry) => entry.name === tag)));
  const expected = [...path.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();
  const params = (op.parameters ?? []).map((p) => (p.$ref ? resolve(p.$ref) : p));
  assert.deepEqual(
    params
      .filter((p) => p.in === 'path')
      .map((p) => p.name)
      .sort(),
    expected,
    `경로 매개변수: ${path}`,
  );
  assert.ok(params.filter((p) => p.in === 'path').every((p) => p.required));
  assert.equal(new Set(params.map((p) => `${p.in}:${p.name}`)).size, params.length);
  assert.ok(Object.keys(op.responses).some((code) => /^2\d\d$/.test(code)));
  if (op.responses['204']) assert.equal(op.responses['204'].content, undefined);
  if (['patch', 'put'].includes(method)) assert.ok(op.requestBody, `수정 body 누락: ${path}`);
  if (!(op.security?.length === 0)) assert.ok(op.responses['401']);
  for (const response of Object.values(op.responses)) {
    const value = response.$ref ? resolve(response.$ref) : response;
    assert.ok(value.description);
    for (const content of Object.values(value.content ?? {})) assert.ok(content.schema);
  }
}
// Keep the current route inventory tied to the real controllers, without initializing the app/DB.
const inventory = readFileSync(
  new URL('../apps/server/docs/implementation-status.md', import.meta.url),
  'utf8',
);
const inventoryRoutes = new Set(
  inventory.split('\n').map((line) => {
    const cells = line.split('|').map((cell) => cell.trim());
    return `${cells[1]} ${cells[2]?.replaceAll('`', '')}`;
  }),
);
let currentCount = 0;
for (const file of [
  'health/health.controller.ts',
  'workspaces/workspaces.controller.ts',
  'media/media.controller.ts',
  'config/client-config.controller.ts',
  'personal/personal.controller.ts',
  'personal/profile-photo.controller.ts',
  'workspaces/band-photo.controller.ts',
  'workspaces/workspace-sync.controller.ts',
  'media/local-files.controller.ts',
  'media/youtube.controller.ts',
  'common/auth/auth.controller.ts',
]) {
  const code = readFileSync(new URL(`../apps/server/src/${file}`, import.meta.url), 'utf8');
  const prefix = code.match(/@Controller\((?:'([^']*)')?\)/)?.[1] ?? '';
  for (const match of code.matchAll(/@(Get|Post|Put|Patch|Delete)\((?:'([^']*)')?\)/g)) {
    const route = `/${[prefix, match[2]].filter(Boolean).join('/')}`.replace(/:(\w+)/g, '{$1}');
    assert.ok(
      inventoryRoutes.has(`${match[1].toUpperCase()} ${route}`),
      `현재 구현 목록 누락: ${match[1]} ${route}`,
    );
    currentCount++;
  }
}
const catalog = await prettier.format(renderCatalog(spec), { parser: 'markdown', printWidth: 100 });
if (process.argv.includes('--write-catalog')) writeFileSync(catalogPath, catalog);
else
  assert.equal(
    readFileSync(catalogPath, 'utf8').replaceAll('\r\n', '\n'),
    catalog,
    'API 목록 불일치. npm run docs:catalog 실행',
  );
process.stdout.write(
  `문서 검사 통과: 목표 API ${seen.size}개, schema ${Object.keys(spec.components.schemas).length}개, 현재 경로 ${currentCount}개\n`,
);
