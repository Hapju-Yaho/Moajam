import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { PrismaClient } from '../dist/generated/sqlite/client.js';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';

test('actual SQLite db push backfills valid JSON, fixes blank legacy values and preserves selected parts', async () => {
  const root = fileURLToPath(new URL('../../../', import.meta.url));
  const dataRoot = resolve(root, 'data');
  mkdirSync(dataRoot, { recursive: true });
  const directory = mkdtempSync(resolve(dataRoot, 'sqlite-default-test-'));
  const path = resolve(directory, 'moajam.db');
  let sql = new DatabaseSync(path);
  let client;
  const ids = [
    '11111111-1111-4111-8111-111111111111',
    '22222222-2222-4222-8222-222222222222',
    '33333333-3333-4333-8333-333333333333',
  ];
  const push = () =>
    execFileSync(process.execPath, ['scripts/database.mjs'], {
      cwd: resolve(root, 'apps/server'),
      encoding: 'utf8',
      windowsHide: true,
      env: {
        ...process.env,
        NODE_ENV: 'test',
        DATABASE_URL: '',
        DIRECT_URL: '',
        MOAJAM_TEST_DATA_DIRECTORY: directory,
      },
    });
  try {
    // This schema predates onboarding. Exercise db push, not just migrate diff.
    sql.exec(`CREATE TABLE profiles (
      id TEXT NOT NULL PRIMARY KEY, display_name TEXT NOT NULL, avatar_url TEXT,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME NOT NULL
    )`);
    const insert = sql.prepare(
      "INSERT INTO profiles(id, display_name, updated_at) VALUES (?, 'Test musician', '2026-09-29T00:00:00.000Z')",
    );
    insert.run(ids[0]);
    insert.run(ids[1]);
    sql.close();
    sql = undefined;
    push();
    sql = new DatabaseSync(path);
    assert.equal(
      sql
        .prepare("SELECT count(*) AS count FROM profiles WHERE json_valid(parts) AND parts = '[]'")
        .get().count,
      2,
    );
    // New users created without explicit parts must also receive valid JSON.
    sql
      .prepare(
        "INSERT INTO profiles(id, display_name, updated_at) VALUES (?, 'New musician', '2026-09-29T00:00:00.000Z')",
      )
      .run(ids[2]);
    assert.equal(sql.prepare('SELECT parts FROM profiles WHERE id=?').get(ids[2]).parts, '[]');
    sql.prepare('UPDATE profiles SET parts=? WHERE id=?').run('["GUITAR","VOCAL"]', ids[0]);
    sql.prepare("UPDATE profiles SET parts='' WHERE id=?").run(ids[1]);
    sql.close();
    sql = undefined;
    assert.match(push(), /Repaired 1 empty profile/);
    assert.doesNotMatch(push(), /Repaired/);
    client = new PrismaClient({
      adapter: new PrismaBetterSqlite3({ url: `file:${path.replaceAll('\\', '/')}` }),
    });
    const profiles = await client.profile.findMany({ orderBy: { id: 'asc' } });
    assert.deepEqual(
      profiles.map((profile) => profile.parts),
      [['GUITAR', 'VOCAL'], [], []],
    );
    assert.ok(profiles.every((profile) => profile.onboardingCompletedAt === null));
  } finally {
    sql?.close();
    await client?.$disconnect();
    assert.ok(directory.startsWith(dataRoot + sep + 'sqlite-default-test-'));
    rmSync(directory, { recursive: true, force: true });
  }
});
