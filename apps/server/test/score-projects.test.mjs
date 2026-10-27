import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

test('score projects preserve legacy versions, isolate bands, enforce revisions and do not resurrect deleted defaults', async () => {
  const root = fileURLToPath(new URL('../../../', import.meta.url));
  const dataRoot = resolve(root, 'data');
  mkdirSync(dataRoot, { recursive: true });
  const directory = mkdtempSync(resolve(dataRoot, 'score-project-test-'));
  Object.assign(process.env, {
    NODE_ENV: 'test',
    AUTH_MODE: 'temporary',
    DATABASE_URL: '',
    DIRECT_URL: '',
    STORAGE_PROVIDER: 'local',
    MOAJAM_TEST_DATA_DIRECTORY: directory,
    ENABLE_MEDIA_WORKER: 'false',
  });
  const sql = execFileSync(
    process.execPath,
    [
      resolve(root, 'node_modules/prisma/build/index.js'),
      'migrate',
      'diff',
      '--from-empty',
      '--to-schema',
      'prisma/sqlite.prisma',
      '--script',
    ],
    { cwd: resolve(root, 'apps/server'), encoding: 'utf8', windowsHide: true },
  );
  const sqlite = new DatabaseSync(resolve(directory, 'moajam.db'));
  sqlite.exec(sql);
  sqlite.close();
  const { createApplication } = await import('../dist/app.js');
  const { PrismaService } = await import('../dist/common/database/prisma.service.js');
  const { ScoreProjectsService } = await import('../dist/workspaces/score-projects.service.js');
  const app = await createApplication();
  await app.listen(0, '127.0.0.1');
  const db = app.get(PrismaService),
    base = (await app.getUrl()) + '/v1';
  const call = async (path, method = 'GET', body, token, status = 200) => {
    const response = await fetch(base + path, {
      method,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const text = await response.text();
    assert.equal(response.status, status, `${method} ${path}: ${text}`);
    return text ? JSON.parse(text) : null;
  };
  try {
    const owner = await call('/auth/temporary', 'POST', {}, undefined, 201),
      member = await call('/auth/temporary', 'POST', {}, undefined, 201),
      outsider = await call('/auth/temporary', 'POST', {}, undefined, 201);
    for (const [i, user] of [owner, member, outsider].entries())
      await db.profile.upsert({
        where: { id: user.user.id },
        create: { id: user.user.id, displayName: `User ${i}` },
        update: {},
      });
    const band = await db.workspace.create({
      data: {
        name: 'Score band',
        createdById: owner.user.id,
        members: { create: [{ userId: owner.user.id, role: 'OWNER' }, { userId: member.user.id }] },
      },
    });
    const other = await db.workspace.create({
      data: {
        name: 'Other band',
        createdById: outsider.user.id,
        members: { create: [{ userId: outsider.user.id, role: 'OWNER' }] },
      },
    });
    for (const workspace of [band, other])
      await db.workspaceDocument.create({
        data: {
          workspaceId: workspace.id,
          key: 'songs',
          value: {
            data: [
              { id: 'song-one', title: 'Original song' },
              { id: 'empty-song', title: 'Empty song' },
            ],
          },
          updatedBy: owner.user.id,
        },
      });
    const legacy = {
      title: 'Original song',
      bpm: 120,
      parts: ['Guitar'],
      notes: [
        {
          id: 'legacy-note',
          part: 'Guitar',
          pitch: 64,
          beats: 1,
          string: 1,
          fret: 0,
          rest: false,
          accent: false,
          chord: '',
          lyric: '',
        },
      ],
      sync: {},
      scoreVersions: {
        schemaVersion: 2,
        parts: [
          {
            part: 'Guitar',
            appliedVersionId: 'original',
            appliedRevision: 1,
            versions: [
              { id: 'original', name: '기본', revision: 1 },
              {
                id: 'alternate',
                name: '대안',
                revision: 1,
                content: {
                  notes: [
                    {
                      id: 'alternate-note',
                      part: 'Guitar',
                      pitch: 67,
                      beats: 2,
                      string: 1,
                      fret: 3,
                      rest: false,
                      accent: false,
                      chord: '',
                      lyric: '',
                    },
                  ],
                  sync: {},
                  settings: {},
                },
              },
            ],
          },
        ],
      },
    };
    await db.workspaceDocument.create({
      data: {
        workspaceId: band.id,
        key: 'song/song-one/score',
        value: { data: legacy },
        updatedBy: owner.user.id,
      },
    });
    const listPath = `/workspaces/${band.id}/songs/song-one/score-projects`;
    await call(listPath, 'GET', undefined, outsider.token, 403);
    await call(listPath, 'GET', undefined, undefined, 401);
    const defaults = await call(listPath, 'GET', undefined, member.token);
    assert.equal(defaults.length, 1);
    assert.equal(defaults[0].name, 'Original song');
    const path = `/workspaces/${band.id}/score-projects/${defaults[0].id}`;
    const original = await call(path, 'GET', undefined, owner.token);
    assert.deepEqual(original.value.data, legacy);
    assert.equal((await call(listPath, 'GET', undefined, owner.token)).length, 1);
    assert.deepEqual(
      await call(
        `/workspaces/${band.id}/songs/empty-song/score-projects`,
        'GET',
        undefined,
        owner.token,
      ),
      [],
    );
    await call(
      `/workspaces/${band.id}/songs/missing/score-projects`,
      'GET',
      undefined,
      owner.token,
      404,
    );
    const created = await call(
      listPath,
      'POST',
      { name: 'Acoustic', data: legacy },
      member.token,
      201,
    );
    await call(listPath, 'POST', { name: ' acoustic ', data: legacy }, owner.token, 409);
    await call(listPath, 'POST', { name: 'Invalid', data: { notes: [] } }, owner.token, 400);
    const asset = await db.mediaAsset.create({
      data: {
        ownerId: owner.user.id,
        workspaceId: band.id,
        scope: 'test',
        objectKey: 'test-private',
        name: 'private.wav',
        mime: 'audio/wav',
        size: 10,
        ready: true,
        visibility: 'PRIVATE',
      },
    });
    await call(
      listPath,
      'POST',
      { name: 'Private audio', data: { ...legacy, referenceAudio: { __moajamAssetId: asset.id } } },
      owner.token,
      400,
    );
    const saved = await call(
      path,
      'PUT',
      { revision: original.revision, name: 'Edited', value: { data: { ...legacy, bpm: 140 } } },
      member.token,
    );
    assert.equal(saved.revision, original.revision + 1);
    await call(
      path,
      'PUT',
      { revision: original.revision, value: { data: legacy } },
      owner.token,
      409,
    );
    await call(
      path,
      'PUT',
      { revision: saved.revision, name: 'Acoustic', value: { data: legacy } },
      owner.token,
      409,
    );
    await call(
      `/workspaces/${other.id}/score-projects/${defaults[0].id}`,
      'GET',
      undefined,
      outsider.token,
      404,
    );
    const copy = await call(
      `/workspaces/${band.id}/score-projects/${created.id}`,
      'GET',
      undefined,
      owner.token,
    );
    assert.equal(copy.value.data.bpm, 120);
    await call(path, 'DELETE', { revision: original.revision }, owner.token, 409);
    await call(path, 'DELETE', { revision: saved.revision }, owner.token);
    await call(path, 'GET', undefined, owner.token, 404);
    assert.equal((await call(listPath, 'GET', undefined, owner.token)).length, 1);
    await app.get(ScoreProjectsService).migrate();
    assert.equal((await call(listPath, 'GET', undefined, owner.token)).length, 1);
    assert.deepEqual(
      (
        await db.workspaceDocument.findUnique({
          where: { workspaceId_key: { workspaceId: band.id, key: 'song/song-one/score' } },
        })
      ).value.data,
      legacy,
    );
    await call(listPath, 'POST', { name: 'Edited', data: legacy }, owner.token, 201);
  } finally {
    await app.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
