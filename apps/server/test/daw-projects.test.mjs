import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

test('band projects preserve old DAW data, isolate projects and bands, reuse assets and enforce revisions', async () => {
  const root = fileURLToPath(new URL('../../../', import.meta.url));
  const dataRoot = resolve(root, 'data');
  mkdirSync(dataRoot, { recursive: true });
  const directory = mkdtempSync(resolve(dataRoot, 'daw-project-test-'));
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
  const { StorageService } = await import('../dist/media/storage.service.js');
  const { DawProjectsService } = await import('../dist/workspaces/daw-projects.service.js');
  const app = await createApplication();
  await app.listen(0, '127.0.0.1');
  const base = (await app.getUrl()) + '/v1';
  const db = app.get(PrismaService);
  const call = async (path, method, body, token, status = 200) => {
    const response = await fetch(base + path, {
      method,
      headers: {
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const text = await response.text();
    assert.equal(response.status, status, `${method} ${path}: ${text}`);
    return text ? JSON.parse(text) : null;
  };
  try {
    const owner = await call('/auth/temporary', 'POST', {}, undefined, 201);
    const member = await call('/auth/temporary', 'POST', {}, undefined, 201);
    const outsider = await call('/auth/temporary', 'POST', {}, undefined, 201);
    for (const [index, session] of [owner, member, outsider].entries())
      await db.profile.upsert({
        where: { id: session.user.id },
        create: { id: session.user.id, displayName: `User ${index}` },
        update: {},
      });
    const band = await db.workspace.create({
      data: {
        name: 'DAW band',
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
    const second = await db.workspace.create({
      data: {
        name: 'Another team',
        createdById: owner.user.id,
        members: { create: { userId: owner.user.id, role: 'OWNER' } },
      },
    });
    assert.deepEqual(await call('/me/workspace-order', 'GET', undefined, owner.token), {
      ids: [],
      initialized: false,
    });
    await call('/me/workspace-order', 'PUT', { ids: [second.id, band.id] }, owner.token);
    // The same authenticated user receives the stored order on a fresh request/device.
    assert.deepEqual((await call('/me/workspace-order', 'GET', undefined, owner.token)).ids, [
      second.id,
      band.id,
    ]);
    assert.deepEqual((await call('/me/workspace-order', 'GET', undefined, member.token)).ids, []);
    await call(
      '/me/workspace-order',
      'PUT',
      { ids: [band.id, second.id], initializeOnly: true },
      owner.token,
    );
    assert.deepEqual((await call('/me/workspace-order', 'GET', undefined, owner.token)).ids, [
      second.id,
      band.id,
    ]);
    await call('/me/workspace-order', 'PUT', { ids: [other.id] }, owner.token, 400);
    await call('/me/workspace-order', 'PUT', { ids: [band.id, band.id] }, owner.token, 422);
    await call('/me/workspace-order', 'PUT', { ids: ['invalid-id'] }, owner.token, 422);
    await call('/me/workspace-order', 'PUT', { ids: [] }, undefined, 401);
    assert.deepEqual(
      (
        await db.personalDocument.findUnique({
          where: { ownerId_key: { ownerId: owner.user.id, key: 'workspace-order' } },
        })
      ).value,
      { ids: [second.id, band.id] },
    );
    const songs = [
      { id: 'song', title: 'Original Song' },
      { id: 'empty', title: 'Empty Song' },
      { id: 'legacy', title: 'Legacy Song' },
      { id: 'invalid', title: 'Bad asset' },
    ];
    for (const workspace of [band, other])
      await db.workspaceDocument.create({
        data: {
          workspaceId: workspace.id,
          key: 'songs',
          value: { data: songs },
          updatedBy: workspace.createdById,
        },
      });
    const assetId = randomUUID(),
      objectKey = `${owner.user.id}/${randomUUID()}`;
    await app.get(StorageService).write(objectKey, Buffer.from('audio'), 'audio/wav');
    await db.mediaAsset.create({
      data: {
        id: assetId,
        ownerId: owner.user.id,
        workspaceId: band.id,
        objectKey,
        scope: `practice/${band.id}/song`,
        name: 'audio.wav',
        mime: 'audio/wav',
        size: 5,
        visibility: 'WORKSPACE',
        ready: true,
      },
    });
    const original = {
      tracks: [
        {
          id: 't',
          name: 'Original',
          clips: [
            {
              id: 'c',
              name: 'audio.wav',
              offset: 1.25,
              duration: 3,
              blob: { __moajamAssetId: assetId },
            },
          ],
        },
      ],
      notes: [],
      bpm: 93,
      metronome: true,
      loopStart: 1,
      loopEnd: 3,
      loop: true,
    };
    await db.workspaceDocument.create({
      data: {
        workspaceId: band.id,
        key: 'song/song/soundtrack',
        value: { data: original },
        updatedBy: owner.user.id,
      },
    });
    const listPath = `/workspaces/${band.id}/songs/song/daw-projects`;
    let rows = await call(listPath, 'GET', undefined, member.token);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].name, 'Original Song');
    const initial = rows[0],
      path = `/workspaces/${band.id}/daw-projects/${initial.id}`;
    let saved = await call(path, 'GET', undefined, member.token);
    assert.equal(saved.value.data.bpm, 93);
    assert.equal(saved.value.data.metronome, undefined);
    assert.equal(saved.value.data.tracks[0].clips[0].blob.__moajamAssetId, assetId);
    assert.ok(
      await db.workspaceDocument.findUnique({
        where: { workspaceId_key: { workspaceId: band.id, key: 'song/song/soundtrack' } },
      }),
    );
    rows = await call(listPath, 'GET', undefined, owner.token);
    assert.equal(rows[0].id, initial.id);
    await call(listPath, 'GET', undefined, outsider.token, 403);
    await call(path, 'GET', undefined, outsider.token, 403);
    await call(
      `/workspaces/${other.id}/daw-projects/${initial.id}`,
      'GET',
      undefined,
      outsider.token,
      404,
    );
    await call(
      `/workspaces/${band.id}/songs/missing/daw-projects`,
      'GET',
      undefined,
      owner.token,
      404,
    );
    const clone = await call(path + '/duplicate', 'POST', undefined, member.token, 201);
    assert.equal(await db.mediaAsset.count(), 1);
    const cloned = await call(
      `/workspaces/${band.id}/daw-projects/${clone.id}`,
      'GET',
      undefined,
      owner.token,
    );
    assert.deepEqual(cloned.value.data, saved.value.data);
    const changed = { ...saved.value.data, bpm: 140, tracks: [] };
    saved = await call(
      path,
      'PUT',
      { revision: saved.revision, name: 'Saved with tracks', value: { data: changed } },
      member.token,
    );
    assert.equal(saved.name, 'Saved with tracks');
    assert.equal(saved.value.data.bpm, 140);
    await call(
      path,
      'PUT',
      { revision: saved.revision, name: null, value: { data: changed } },
      owner.token,
      422,
    );
    await call(
      path,
      'PUT',
      { revision: initial.revision, value: { data: changed } },
      owner.token,
      409,
    );
    assert.equal(
      (
        await call(
          `/workspaces/${band.id}/daw-projects/${clone.id}`,
          'GET',
          undefined,
          member.token,
        )
      ).value.data.bpm,
      93,
    );
    await call(path, 'PATCH', { revision: saved.revision, name: '   ' }, member.token, 400);
    const renamed = await call(
      path,
      'PATCH',
      { revision: saved.revision, name: 'New name' },
      member.token,
    );
    await call(path, 'PATCH', { revision: saved.revision, name: 'Conflict' }, owner.token, 409);
    await call(
      path,
      'PUT',
      {
        revision: renamed.revision,
        value: { data: { tracks: [{ blob: { __moajamAssetId: randomUUID() } }] } },
      },
      member.token,
      400,
    );
    await call(path, 'PUT', { revision: renamed.revision, value: {} }, member.token, 400);
    const created = await call(listPath, 'POST', { name: 'Fresh' }, member.token, 201);
    assert.deepEqual(
      (
        await call(
          `/workspaces/${band.id}/daw-projects/${created.id}`,
          'GET',
          undefined,
          member.token,
        )
      ).value.data,
      { tracks: [], notes: [] },
    );
    await call(path, 'DELETE', { revision: renamed.revision }, member.token);
    await call(path, 'GET', undefined, member.token, 404);
    rows = await call(listPath, 'GET', undefined, member.token);
    assert.equal(
      rows.some((row) => row.id === initial.id),
      false,
    );
    assert.equal(rows.length, 2);
    assert.equal(await db.mediaAsset.count(), 1);
    const emptyPath = `/workspaces/${band.id}/songs/empty/daw-projects`;
    assert.deepEqual(await call(emptyPath, 'GET', undefined, owner.token), []);
    const saveAs = await call(
      emptyPath,
      'POST',
      { name: 'Unsaved snapshot', data: cloned.value.data },
      member.token,
      201,
    );
    const saveAsPath = `/workspaces/${band.id}/daw-projects/${saveAs.id}`;
    assert.deepEqual(
      (await call(saveAsPath, 'GET', undefined, owner.token)).value.data,
      cloned.value.data,
    );
    assert.equal(await db.mediaAsset.count(), 1);
    await call(
      emptyPath,
      'POST',
      { name: 'Invalid snapshot', data: { tracks: [{ blob: { __moajamAssetId: randomUUID() } }] } },
      owner.token,
      400,
    );
    await call(saveAsPath, 'DELETE', { revision: 1 }, owner.token);
    // An empty song stays empty; an actual legacy document migrates exactly once under concurrent requests.
    await db.workspaceDocument.create({
      data: {
        workspaceId: band.id,
        key: 'song/empty/soundtrack',
        value: { data: { tracks: [], notes: [] } },
        updatedBy: owner.user.id,
      },
    });
    const defaults = await Promise.all([
      call(emptyPath, 'GET', undefined, owner.token),
      call(emptyPath, 'GET', undefined, member.token),
    ]);
    assert.equal(defaults[0][0].id, defaults[1][0].id);
    await call(
      `/workspaces/${band.id}/daw-projects/${defaults[0][0].id}`,
      'DELETE',
      { revision: 1 },
      owner.token,
    );
    assert.deepEqual(await call(emptyPath, 'GET', undefined, member.token), []);
    await db.personalDocument.create({
      data: {
        ownerId: owner.user.id,
        key: `practice/${band.id}/legacy`,
        value: { tracks: [], notes: [{ text: 'private' }], bpm: 88 },
      },
    });
    const recovered = (
      await call(`/workspaces/${band.id}/songs/legacy/daw-projects`, 'GET', undefined, owner.token)
    )[0];
    const recoveredData = await call(
      `/workspaces/${band.id}/daw-projects/${recovered.id}`,
      'GET',
      undefined,
      member.token,
    );
    assert.equal(recovered.name, 'Legacy Song');
    assert.equal(recoveredData.value.data.bpm, 88);
    assert.deepEqual(recoveredData.value.data.notes, []);
    await db.workspaceDocument.create({
      data: {
        workspaceId: other.id,
        key: 'song/invalid/soundtrack',
        value: { data: original },
        updatedBy: outsider.user.id,
      },
    });
    await call(
      `/workspaces/${other.id}/songs/invalid/daw-projects`,
      'GET',
      undefined,
      outsider.token,
      400,
    );
    assert.equal(await db.dawProject.count({ where: { workspaceId: other.id } }), 0);
    // Repeat migration without resurrecting a removed default or overwriting renamed work.
    await db.workspaceDocument.delete({
      where: { workspaceId_key: { workspaceId: other.id, key: 'song/invalid/soundtrack' } },
    });
    await app.get(DawProjectsService).migrate();
    await app.get(DawProjectsService).migrate();
    assert.equal((await db.dawProject.findUnique({ where: { id: initial.id } })).name, 'New name');
    assert.ok((await db.dawProject.findUnique({ where: { id: initial.id } })).deletedAt);
  } finally {
    await app.close();
    const checked = resolve(directory);
    assert.ok(checked.startsWith(dataRoot + sep));
    rmSync(checked, { recursive: true, force: true });
  }
});
