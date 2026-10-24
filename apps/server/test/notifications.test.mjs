import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';

test('notification inbox: full counts, pagination, isolation, event transactions and PDF sharing', async () => {
  const root = fileURLToPath(new URL('../../../', import.meta.url));
  const dataRoot = resolve(root, 'data');
  mkdirSync(dataRoot, { recursive: true });
  const directory = mkdtempSync(resolve(dataRoot, 'api-test-'));
  Object.assign(process.env, {
    NODE_ENV: 'test',
    AUTH_MODE: 'temporary',
    DATABASE_URL: '',
    STORAGE_PROVIDER: 'local',
    DIRECT_URL: '',
    MOAJAM_TEST_DATA_DIRECTORY: directory,
    ENABLE_MEDIA_WORKER: 'false',
    SUPABASE_URL: '',
    SUPABASE_PUBLISHABLE_KEY: '',
    CORS_ORIGINS: 'https://moajam.netlify.app',
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

  const app = await createApplication();
  await app.init();
  const fastify = app.getHttpAdapter().getInstance();
  await fastify.ready();
  const { PrismaService } = await import('../dist/common/database/prisma.service.js');
  const db = app.get(PrismaService);
  const call = async (path, method = 'GET', body, token, status = 200) => {
    const response = await fastify.inject({
      method,
      url: '/v1' + path,
      headers: token ? { authorization: `Bearer ${token}` } : {},
      ...(body === undefined ? {} : { payload: body }),
    });
    assert.equal(response.statusCode, status, `${method} ${path}: ${response.body}`);
    return response.body ? JSON.parse(response.body) : null;
  };
  try {
    const a = await call('/auth/temporary', 'POST', {}, undefined, 201);
    const b = await call('/auth/temporary', 'POST', {}, undefined, 201);
    const outsider = await call('/auth/temporary', 'POST', {}, undefined, 201);
    const band = await call('/workspaces', 'POST', { name: 'Notification Band' }, a.token, 201);
    const other = await call('/workspaces', 'POST', { name: 'Other Band' }, a.token, 201);
    const invite = await call(
      `/workspaces/${band.id}/invitations`,
      'POST',
      undefined,
      a.token,
      201,
    );
    await call('/invitations/accept', 'POST', { token: invite.token }, b.token, 201);
    const timestamp = new Date('2026-10-24T00:00:00Z');
    await db.notification.createMany({
      data: [
        ...Array.from({ length: 65 }, (_, i) => ({
          userId: a.user.id,
          workspaceId: band.id,
          message: `Notice ${i}`,
          createdAt: timestamp,
        })),
        { userId: a.user.id, workspaceId: other.id, message: 'Other band' },
        { userId: b.user.id, workspaceId: band.id, message: 'Private recipient' },
        { userId: b.user.id, workspaceId: other.id, message: 'No membership' },
      ],
    });
    assert.equal((await call('/notifications/summary', 'GET', undefined, a.token)).unreadCount, 66);
    assert.equal((await call('/notifications/summary', 'GET', undefined, b.token)).unreadCount, 1);
    const ids = [];
    let cursor;
    do {
      const page = await call(
        `/notifications/inbox?workspaceId=${band.id}${cursor ? `&cursor=${cursor}` : ''}`,
        'GET',
        undefined,
        a.token,
      );
      ids.push(...page.items.map((item) => item.id));
      assert.ok(
        page.items.every((item) => item.workspaceId === band.id && item.userId === a.user.id),
      );
      cursor = page.nextCursor;
    } while (cursor);
    assert.equal(ids.length, 65);
    assert.equal(new Set(ids).size, 65, 'identical timestamps must not skip or duplicate rows');
    await call('/notifications/inbox?cursor=bad', 'GET', undefined, a.token, 400);
    await call(`/notifications/${ids[0]}/target`, 'GET', undefined, b.token, 404);
    await call(`/notifications/${ids[0]}/read`, 'POST', undefined, b.token, 201);
    assert.equal((await db.notification.findUnique({ where: { id: ids[0] } })).readAt, null);
    await call(`/notifications/${ids[0]}/read`, 'POST', undefined, a.token, 201);
    await call(`/notifications/${ids[0]}/read`, 'POST', undefined, a.token, 201);
    assert.equal((await call('/notifications/summary', 'GET', undefined, a.token)).unreadCount, 65);
    await call(`/notifications/read-all?workspaceId=${band.id}`, 'POST', undefined, a.token, 201);
    assert.equal((await call('/notifications/summary', 'GET', undefined, a.token)).unreadCount, 1);
    assert.equal(
      (
        await call(
          `/notifications/inbox?workspaceId=${band.id}&unread=true`,
          'GET',
          undefined,
          a.token,
        )
      ).items.length,
      0,
    );
    assert.equal(
      (await call('/notifications/inbox', 'GET', undefined, outsider.token)).items.length,
      0,
    );
    await db.notification.deleteMany({});
    const song = {
      id: 'notification-song',
      title: 'Test Song',
      participants: { [a.user.id]: 'GUITAR', [b.user.id]: 'BASS' },
    };
    await db.workspaceDocument.create({
      data: { workspaceId: band.id, key: 'songs', value: { data: [song] }, updatedBy: a.user.id },
    });
    const sync = (documents) => ({ documents, members: [], removedMemberIds: [] });
    const opinion = {
      id: 'opinion-one',
      text: 'Try this arrangement',
      authorId: a.user.id,
      replies: [],
    };
    const doc = { key: `song/${song.id}/discussion`, revision: 0, value: { data: [opinion] } };
    await call(`/workspaces/${band.id}/sync`, 'PUT', sync([doc]), a.token);
    const inbox = await call('/notifications/inbox', 'GET', undefined, b.token);
    assert.equal(inbox.items.length, 1);
    assert.equal(inbox.items[0].kind, 'SONG_OPINION');
    assert.equal(inbox.items[0].metadata.focusId, opinion.id);
    assert.equal(inbox.items[0].metadata.title, song.title);
    assert.equal((await call('/notifications/summary', 'GET', undefined, a.token)).unreadCount, 0);
    await call(`/workspaces/${band.id}/sync`, 'PUT', sync([doc]), a.token, 409);
    assert.equal(await db.notification.count(), 1, 'retry cannot emit another event');
    const second = { ...opinion, id: 'opinion-two' };
    await call(
      `/workspaces/${band.id}/sync`,
      'PUT',
      sync([
        { ...doc, revision: 1, value: { data: [opinion, second] } },
        { key: 'songs', revision: 0, value: { data: [song] } },
      ]),
      a.token,
      409,
    );
    assert.equal(
      await db.notification.count(),
      1,
      'failed batch must roll back both document and event',
    );
    const reply = { id: 'reply-one', text: 'Agreed', authorId: b.user.id };
    await call(
      `/workspaces/${band.id}/sync`,
      'PUT',
      sync([{ ...doc, revision: 1, value: { data: [{ ...opinion, replies: [reply] }] } }]),
      b.token,
    );
    const replyAlert = (await call('/notifications/inbox', 'GET', undefined, a.token)).items[0];
    assert.equal(replyAlert.kind, 'SONG_REPLY');
    assert.equal(replyAlert.metadata.focusId, reply.id);
    assert.deepEqual(
      await call(`/notifications/${replyAlert.id}/target`, 'GET', undefined, a.token),
      { available: true },
    );
    const asset = await db.mediaAsset.create({
      data: {
        ownerId: a.user.id,
        workspaceId: band.id,
        scope: `song/${band.id}/${song.id}`,
        objectKey: 'notification-test.pdf',
        name: 'Chart.pdf',
        mime: 'application/pdf',
        size: 10,
        ready: true,
      },
    });
    await call(`/assets/${asset.id}/visibility`, 'PATCH', { visibility: 'WORKSPACE' }, a.token);
    await call(`/assets/${asset.id}/visibility`, 'PATCH', { visibility: 'WORKSPACE' }, a.token);
    const pdfAlerts = await db.notification.findMany({ where: { kind: 'PDF_SHARED' } });
    assert.equal(pdfAlerts.length, 1);
    assert.equal(pdfAlerts[0].metadata.assetId, asset.id);
    assert.equal(pdfAlerts[0].userId, b.user.id);
    await db.workspaceDocument.update({
      where: { workspaceId_key: { workspaceId: band.id, key: 'songs' } },
      data: { value: { data: [] } },
    });
    assert.deepEqual(
      await call(`/notifications/${replyAlert.id}/target`, 'GET', undefined, a.token),
      { available: false },
    );
    await db.workspaceMember.delete({
      where: { workspaceId_userId: { workspaceId: band.id, userId: b.user.id } },
    });
    assert.equal((await call('/notifications/summary', 'GET', undefined, b.token)).unreadCount, 0);
    await call(`/notifications/${inbox.items[0].id}/target`, 'GET', undefined, b.token, 404);
  } finally {
    await app.close();
    assert.ok(directory.startsWith(dataRoot + sep + 'api-test-'));
    rmSync(directory, { recursive: true, force: true });
  }
});
