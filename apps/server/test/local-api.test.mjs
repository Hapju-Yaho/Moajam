import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { ConfigService } from '@nestjs/config';

test('SQLite HTTP: authentication, isolation, atomic sync, conflicts, invitations, files and persistence', async () => {
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
  let app = await createApplication();
  await app.listen(0, '127.0.0.1');
  let base = (await app.getUrl()) + '/v1';
  app.get(ConfigService).set('PUBLIC_API_URL', base);
  const call = async (path, method = 'GET', body, token, status = 200) => {
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
    assert.equal((await call('/config')).authMode, 'temporary');
    await call('/workspaces', 'GET', undefined, undefined, 401);
    const a = await call('/auth/temporary', 'POST', {}, undefined, 201);
    const b = await call('/auth/temporary', 'POST', {}, undefined, 201);
    assert.notEqual(a.user.id, b.user.id);
    await call('/me/onboarding', 'GET', undefined, undefined, 401);
    assert.equal((await call('/me/onboarding', 'GET', undefined, a.token)).completed, false);
    await call(
      '/me/onboarding',
      'PUT',
      { displayName: 'First musician', photo: '', parts: ['DRUMS'] },
      a.token,
    );
    assert.equal((await call('/me/onboarding', 'GET', undefined, b.token)).completed, false);
    assert.equal((await call('/auth/session', 'GET', undefined, a.token)).provider, 'temporary');
    await call('/auth/temporary', 'POST', { resumeKey: 'x'.repeat(43) }, undefined, 401);
    const invalid = await call('/auth/temporary', 'POST', { resumeKey: 'invalid' }, undefined, 422);
    assert.ok(!invalid.detail.includes('[object Object]'));
    for (const route of ['signup', 'signin', 'password'])
      await call('/local-auth/' + route, 'POST', {}, undefined, 404);
    const spec = await (await fetch(base.replace('/v1', '') + '/docs-json')).json();
    assert.ok(spec.paths['/v1/auth/temporary']);
    assert.ok(!spec.paths['/v1/local-auth/signin']);
    const band = await call(
      '/workspaces',
      'POST',
      { name: 'Integration Band', description: 'Band description', photo: '' },
      a.token,
      201,
    );
    await call(`/workspaces/${band.id}/documents`, 'GET', undefined, b.token, 403);
    const invite = await call(
      `/workspaces/${band.id}/invitations`,
      'POST',
      undefined,
      a.token,
      201,
    );
    await call('/invitations/accept', 'POST', { token: invite.token }, b.token, 201);
    const bandProfile = (
      await call(`/workspaces/${band.id}/documents`, 'GET', undefined, b.token)
    ).find((doc) => doc.key === 'band/profile');
    assert.equal(bandProfile.value.data.description, 'Band description');
    await call(
      `/workspaces/${band.id}`,
      'PATCH',
      { name: 'Forbidden', description: '', photo: '' },
      b.token,
      403,
    );
    await call(
      `/workspaces/${band.id}`,
      'PATCH',
      {
        name: 'Renamed band',
        description: 'Updated description',
        photo: 'data:image/png;base64,aA==',
      },
      a.token,
    );
    assert.equal(
      (await call('/workspaces', 'GET', undefined, b.token)).find((item) => item.id === band.id)
        .name,
      'Renamed band',
    );
    const updatedProfile = (
      await call(`/workspaces/${band.id}/documents`, 'GET', undefined, b.token)
    ).find((doc) => doc.key === 'band/profile');
    assert.equal(updatedProfile.value.data.photo, 'data:image/png;base64,aA==');
    assert.equal(updatedProfile.value.data.description, 'Updated description');
    await call(`/workspaces/${band.id}`, 'PATCH', { name: '   ' }, a.token, 400);
    await call(
      `/workspaces/${band.id}`,
      'PATCH',
      { name: 'Band', photo: 'javascript:alert(1)' },
      a.token,
      422,
    );
    const sync = (documents, members = []) => ({ documents, members, removedMemberIds: [] });
    await call(
      `/workspaces/${band.id}/sync`,
      'PUT',
      sync([{ key: 'songs', revision: 0, value: { data: [] } }]),
      a.token,
    );
    await call(
      `/workspaces/${band.id}/sync`,
      'PUT',
      sync([
        { key: 'rehearsals', revision: 0, value: { data: [] } },
        { key: 'songs', revision: 0, value: { data: [] } },
      ]),
      a.token,
      409,
    );
    const documents = await call(`/workspaces/${band.id}/documents`, 'GET', undefined, b.token);
    assert.deepEqual(
      documents.map((doc) => doc.key).sort(),
      ['band/profile', 'songs'],
      'all writes must roll back on conflict',
    );
    await call(
      `/workspaces/${band.id}/sync`,
      'PUT',
      sync([], [{ userId: a.user.id, role: 'MEMBER', part: '' }]),
      a.token,
      409,
    );
    await call(
      `/workspaces/${band.id}/sync`,
      'PUT',
      sync([], [{ userId: b.user.id, role: 'OWNER', part: '' }]),
      b.token,
      403,
    );
    const prefs = {
      name: 'Owner renamed',
      bio: 'test',
      photo: '',
      push: true,
      email: false,
      reminder: true,
      bpm: 120,
      countIn: 0,
      metronome: false,
      volume: 0.8,
    };
    await call('/me/preferences', 'PUT', { revision: 1, value: prefs }, a.token);
    assert.equal((await call('/me', 'GET', undefined, a.token)).displayName, prefs.name);
    assert.equal(await call('/me/preferences', 'GET', undefined, b.token), null);
    await call('/me/preferences', 'PUT', { revision: 0, value: prefs }, a.token, 409);
    const scorePath = '/me/documents/' + encodeURIComponent('score/personal');
    await call(scorePath, 'PUT', { revision: 0, value: { title: 'My score', notes: [] } }, a.token);
    assert.equal(await call(scorePath, 'GET', undefined, b.token), null);
    await call(
      '/me/schedules/test',
      'PUT',
      {
        value: {
          id: 'test',
          title: 'Practice',
          date: '2026-09-29',
          start: '19:00',
          end: '20:00',
          place: 'Home',
          goal: '',
        },
      },
      a.token,
    );
    assert.equal((await call('/me/schedules', 'GET', undefined, b.token)).length, 0);
    await call(
      `/workspaces/${band.id}/reminders`,
      'POST',
      { message: 'Practice soon' },
      a.token,
      201,
    );
    const notifications = await call('/notifications', 'GET', undefined, b.token);
    assert.equal(notifications.length, 1);
    await call(`/notifications/${notifications[0].id}/read`, 'POST', undefined, b.token, 201);
    const recommendation = {
      id: 'notification-song',
      title: 'New song',
      artist: 'Artist',
      authorId: b.user.id,
      likes: 0,
      votes: 0,
    };
    await call(
      `/workspaces/${band.id}/sync`,
      'PUT',
      sync([{ key: 'recommendations', revision: 0, value: { data: [recommendation] } }]),
      b.token,
    );
    const newSongAlerts = await call('/notifications', 'GET', undefined, a.token);
    const songAlert = newSongAlerts.find((item) => item.kind === 'RECOMMENDATION');
    assert.equal(songAlert.entityId, recommendation.id);
    assert.equal(songAlert.readAt, null);
    await call(`/notifications/${songAlert.id}/read`, 'POST', undefined, b.token, 201);
    assert.equal(
      (await call('/notifications', 'GET', undefined, a.token)).find(
        (item) => item.id === songAlert.id,
      ).readAt,
      null,
    );
    await call(`/notifications/${songAlert.id}/read`, 'POST', undefined, a.token, 201);
    assert.ok(
      (await call('/notifications', 'GET', undefined, a.token)).find(
        (item) => item.id === songAlert.id,
      ).readAt,
    );
    await call(
      `/workspaces/${band.id}/sync`,
      'PUT',
      sync([
        {
          key: 'recommendations',
          revision: 1,
          value: { data: [{ ...recommendation, title: 'Edited title' }] },
        },
      ]),
      b.token,
    );
    assert.equal(
      (await call('/notifications', 'GET', undefined, a.token)).filter(
        (item) => item.kind === 'RECOMMENDATION',
      ).length,
      1,
    );
    const session = {
      id: 'notification-session',
      title: 'New rehearsal',
      date: '2026-10-01',
      start: '18:00',
      end: '20:00',
      place: 'Studio',
      goal: '',
    };
    const docs = await call(`/workspaces/${band.id}/documents`, 'GET', undefined, a.token);
    const revision = docs.find((item) => item.key === 'rehearsals')?.revision ?? 0;
    await call(
      `/workspaces/${band.id}/sync`,
      'PUT',
      sync([{ key: 'rehearsals', revision, value: { data: [session] } }]),
      a.token,
    );
    assert.equal(
      (await call('/notifications', 'GET', undefined, b.token)).find(
        (item) => item.kind === 'REHEARSAL',
      ).entityId,
      session.id,
    );
    await call(
      `/workspaces/${band.id}/sync`,
      'PUT',
      sync([
        {
          key: 'rehearsals',
          revision,
          value: { data: [session, { ...session, id: 'conflict-session' }] },
        },
      ]),
      a.token,
      409,
    );
    assert.equal(
      (await call('/notifications', 'GET', undefined, b.token)).filter(
        (item) => item.kind === 'REHEARSAL',
      ).length,
      1,
    );
    await call(
      `/workspaces/${band.id}/sync`,
      'PUT',
      sync([{ key: 'rehearsals', revision: revision + 1, value: { data: [] } }]),
      a.token,
    );
    for (const member of [a, b]) {
      const cancellations = (await call('/notifications', 'GET', undefined, member.token)).filter(
        (item) => item.kind === 'REHEARSAL_CANCELLED',
      );
      assert.equal(cancellations.length, 1);
      assert.equal(cancellations[0].entityId, session.id);
      assert.ok(cancellations[0].message.includes(session.title));
    }
    const beforeBulk = await call('/notifications', 'GET', undefined, b.token);
    assert.ok(beforeBulk.some((item) => !item.readAt));
    await call(`/notifications/read-all?workspaceId=${band.id}`, 'POST', undefined, a.token, 201);
    assert.ok(
      (await call('/notifications', 'GET', undefined, a.token)).every((item) => item.readAt),
    );
    assert.deepEqual(await call('/notifications', 'GET', undefined, b.token), beforeBulk);
    await call(`/notifications?workspaceId=${band.id}`, 'DELETE', undefined, a.token);
    assert.equal((await call('/notifications', 'GET', undefined, a.token)).length, 0);
    assert.deepEqual(await call('/notifications', 'GET', undefined, b.token), beforeBulk);
    await call('/notifications/read-all', 'POST', undefined, b.token, 201);
    assert.ok(
      (await call('/notifications', 'GET', undefined, b.token)).every((item) => item.readAt),
    );
    await call('/notifications', 'DELETE', undefined, b.token);
    assert.equal((await call('/notifications', 'GET', undefined, b.token)).length, 0);
    const blob = new Blob(['test audio payload'], { type: 'audio/wav' });
    const asset = await call(
      '/assets/uploads',
      'POST',
      {
        name: 'test.wav',
        mime: blob.type,
        size: blob.size,
        scope: 'song/' + band.id + '/test',
        workspaceId: band.id,
      },
      a.token,
      201,
    );
    const form = new FormData();
    form.append('cacheControl', '3600');
    form.append('', blob, 'test.wav');
    const uploaded = await fetch(asset.signedUrl, { method: 'PUT', body: form });
    assert.equal(uploaded.status, 200, await uploaded.text());
    await call(`/assets/${asset.assetId}/complete`, 'POST', undefined, a.token, 201);
    await call(`/assets/${asset.assetId}/download`, 'GET', undefined, b.token, 403);
    await call(
      `/assets/${asset.assetId}/visibility`,
      'PATCH',
      { visibility: 'WORKSPACE' },
      a.token,
    );
    await call(`/assets/${asset.assetId}/name`, 'PATCH', { name: 'Not allowed' }, b.token, 403);
    const renamedAsset = await call(
      `/assets/${asset.assetId}/name`,
      'PATCH',
      { name: 'Renamed clip.wav' },
      a.token,
    );
    assert.equal(renamedAsset.name, 'Renamed clip.wav');
    await call(`/assets/${asset.assetId}/name`, 'PATCH', { name: '  ' }, a.token, 400);
    await call(`/assets/${asset.assetId}/visibility`, 'PATCH', { visibility: 'PRIVATE' }, a.token);
    const practicePath = `/workspaces/${band.id}/practice/test`;
    const legacyKey = `practice/${band.id}/test`;
    const legacySession = {
      tracks: [
        {
          id: 'track',
          name: 'Shared track',
          volume: 0.8,
          clips: [
            {
              id: 'clip',
              name: 'Shared clip',
              offset: 2,
              duration: 4,
              sourceStart: 1,
              blob: { __moajamAssetId: asset.assetId },
            },
          ],
        },
      ],
      notes: [],
      bpm: 132,
      signature: '3/4',
      metronome: true,
      clickVolume: 0.3,
    };
    await call(
      '/me/documents/' + encodeURIComponent(legacyKey),
      'PUT',
      { revision: 0, value: legacySession },
      a.token,
    );
    const migrated = await call(practicePath, 'GET', undefined, b.token);
    assert.equal(migrated.value.data.bpm, 132);
    assert.equal(migrated.value.data.signature, '3/4');
    assert.deepEqual(migrated.value.data.tracks, legacySession.tracks);
    assert.equal('metronome' in migrated.value.data, false);
    assert.equal('clickVolume' in migrated.value.data, false);
    assert.deepEqual(await call(practicePath, 'GET', undefined, a.token), migrated);
    const changedSession = { ...migrated.value.data, bpm: 144, signature: '6/8' };
    const changed = await call(
      practicePath,
      'PUT',
      { revision: migrated.revision, value: { data: changedSession } },
      b.token,
    );
    assert.deepEqual(
      (await call(practicePath, 'GET', undefined, a.token)).value.data,
      changedSession,
    );
    await call(`/assets/${asset.assetId}/visibility`, 'PATCH', { visibility: 'PRIVATE' }, a.token);
    await call(
      practicePath,
      'PUT',
      { revision: changed.revision, value: { data: changedSession } },
      b.token,
      400,
    );
    await call(
      `/assets/${asset.assetId}/visibility`,
      'PATCH',
      { visibility: 'WORKSPACE' },
      a.token,
    );

    await call(
      practicePath,
      'PUT',
      { revision: migrated.revision, value: { data: migrated.value.data } },
      a.token,
      409,
    );
    const outsider = await call('/auth/temporary', 'POST', {}, undefined, 201);
    await call(practicePath, 'GET', undefined, outsider.token, 403);
    await call(
      practicePath,
      'PUT',
      { revision: changed.revision, value: { data: changedSession } },
      outsider.token,
      403,
    );
    await call(`/assets/${asset.assetId}/download`, 'GET', undefined, outsider.token, 403);
    assert.deepEqual(
      (await call('/me/documents/' + encodeURIComponent(legacyKey), 'GET', undefined, a.token))
        .value,
      legacySession,
    );
    const download = await call(`/assets/${asset.assetId}/download`, 'GET', undefined, b.token);
    assert.equal(await (await fetch(download.url)).text(), 'test audio payload');
    const segment = await fetch(download.url, { headers: { Range: 'bytes=5-9' } });
    assert.equal(segment.status, 206);
    assert.equal(segment.headers.get('content-range'), 'bytes 5-9/18');
    assert.equal(await segment.text(), 'audio');
    const suffix = await fetch(download.url, { headers: { Range: 'bytes=-7' } });
    assert.equal(suffix.status, 206);
    assert.equal(await suffix.text(), 'payload');
    assert.equal((await fetch(download.url, { headers: { Range: 'bytes=99-' } })).status, 416);

    await call(
      '/me/documents/' + encodeURIComponent('practice/personal'),
      'PUT',
      { revision: 0, value: { tracks: [{ blob: { __moajamAssetId: asset.assetId } }] } },
      b.token,
      400,
    );
    await call(
      '/separation-jobs',
      'POST',
      { sourceId: asset.assetId, instrument: 'guitar' },
      a.token,
      503,
    );
    await app.close();
    app = await createApplication();
    await app.listen(0, '127.0.0.1');
    base = (await app.getUrl()) + '/v1';
    app.get(ConfigService).set('PUBLIC_API_URL', base);
    assert.equal((await call(scorePath, 'GET', undefined, a.token)).value.title, 'My score');
    assert.equal((await call('/me/onboarding', 'GET', undefined, a.token)).completed, true);
    assert.equal((await call('/workspaces', 'GET', undefined, b.token)).length, 1);
    await call('/auth/temporary/logout', 'POST', undefined, b.token, 201);
    await call('/workspaces', 'GET', undefined, b.token, 401);
    const resumed = await call(
      '/auth/temporary',
      'POST',
      { resumeKey: b.resumeKey },
      undefined,
      201,
    );
    assert.equal(resumed.user.id, b.user.id);
    assert.equal((await call('/workspaces', 'GET', undefined, resumed.token)).length, 1);
    const authDb = new DatabaseSync(resolve(directory, 'auth.db'));
    assert.ok(
      !JSON.stringify(authDb.prepare('SELECT * FROM temporary_users').all()).includes(b.resumeKey),
    );
    authDb.exec('UPDATE temporary_sessions SET expires=0');
    authDb.close();
    await call('/auth/session', 'GET', undefined, resumed.token, 401);
    app.get(ConfigService).set('AUTH_MODE', 'kakao');
    await call('/auth/temporary', 'POST', {}, undefined, 404);
    await call('/auth/session', 'GET', undefined, a.token, 401);
    const config = app.get(ConfigService);
    config.set('KAKAO_LOGIN_ENABLED', true);
    config.set('KAKAO_REST_API_KEY', 'test-key');
    config.set('AUTH_JWT_SECRET', 'integration-test-secret-with-at-least-32-bytes');
    config.set('AUTH_ACCESS_TOKEN_TTL_SECONDS', 3600);
    const redirectUri = 'http://localhost:5173/auth/kakao/callback';
    config.set('KAKAO_ALLOWED_REDIRECT_URIS', [redirectUri]);
    const { KakaoClient } = await import('../dist/common/auth/kakao.client.js');
    const { PrismaService } = await import('../dist/common/database/prisma.service.js');
    const { UnauthorizedException } = await import('@nestjs/common');
    let exchanges = 0;
    app.get(KakaoClient).exchangeCode = async (code, uri) => {
      exchanges++;
      assert.equal(uri, redirectUri);
      if (code === 'invalid') throw new UnauthorizedException('Invalid Kakao code');
      return { id: code === 'another-user' ? '654321' : '123456', displayName: 'Kakao musician' };
    };
    const authorization = await call('/auth/kakao/authorize', 'POST', { redirectUri });
    const url = new URL(authorization.authorizationUrl);
    assert.equal(url.origin, 'https://kauth.kakao.com');
    assert.equal(url.searchParams.get('state'), authorization.state);
    assert.equal(url.searchParams.get('redirect_uri'), redirectUri);
    await call(
      '/auth/kakao',
      'POST',
      { code: 'ok', redirectUri: 'https://untrusted.example/callback' },
      undefined,
      400,
    );
    assert.equal(exchanges, 0);
    await call('/auth/kakao', 'POST', { redirectUri }, undefined, 422);
    await call('/auth/kakao', 'POST', { code: 'invalid', redirectUri }, undefined, 401);
    const kakao = await call('/auth/kakao', 'POST', { code: 'ok', redirectUri });
    assert.equal(kakao.tokenType, 'Bearer');
    assert.equal(kakao.expiresIn, 3600);
    assert.equal(kakao.user.provider, 'kakao');
    assert.notEqual(kakao.user.id, a.user.id);
    assert.deepEqual(await call('/auth/session', 'GET', undefined, kakao.accessToken), kakao.user);
    assert.equal(
      (await call('/me', 'GET', undefined, kakao.accessToken)).displayName,
      'Kakao musician',
    );
    assert.equal((await call('/workspaces', 'GET', undefined, kakao.accessToken)).length, 0);
    const setup = await call('/me/onboarding', 'GET', undefined, kakao.accessToken);
    assert.equal(setup.completed, false);
    assert.equal(setup.displayName, 'Kakao musician');
    const draft = { displayName: '  New name  ', photo: '', parts: ['VOCAL', 'GUITAR'] };
    for (const parts of [[], ['VOCAL', 'VOCAL'], ['INVALID']])
      await call('/me/onboarding', 'PUT', { ...draft, parts }, kakao.accessToken, 422);
    await call('/me/onboarding', 'PUT', { ...draft, displayName: '   ' }, kakao.accessToken, 400);
    await call(
      '/me/onboarding',
      'PUT',
      { ...draft, photo: 'data:image/svg+xml;base64,PHN2Zz4=' },
      kakao.accessToken,
      400,
    );
    await call('/me/onboarding', 'PUT', { ...draft, userId: b.user.id }, kakao.accessToken, 422);
    assert.equal(
      (await call('/me/onboarding', 'GET', undefined, kakao.accessToken)).completed,
      false,
    );
    const photo =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a6z8AAAAASUVORK5CYII=';
    const complete = await call('/me/onboarding', 'PUT', { ...draft, photo }, kakao.accessToken);
    assert.equal(complete.completed, true);
    assert.equal(complete.displayName, 'New name');
    assert.deepEqual(complete.parts, ['VOCAL', 'GUITAR']);
    assert.match(complete.photo, /^\/v1\/profile-photos\/[a-f0-9-]{36}$/);
    const storedPhoto = await app
      .get(PrismaService)
      .profile.findUnique({ where: { id: kakao.user.id } });
    assert.equal(storedPhoto.avatarUrl, complete.photo);
    const image = await fetch(base.replace(/\/v1$/, '') + complete.photo);
    assert.equal(image.status, 200);
    assert.equal(image.headers.get('content-type'), 'image/png');
    assert.deepEqual(
      Buffer.from(await image.arrayBuffer()),
      Buffer.from(photo.split(',')[1], 'base64'),
    );
    const preferences = await call('/me/preferences', 'GET', undefined, kakao.accessToken);
    assert.equal(preferences.value.photo, complete.photo);
    assert.equal(preferences.value.name, 'New name');
    const fileCount = await app.get(PrismaService).mediaAsset.count();
    await call(
      '/me/preferences',
      'PUT',
      {
        revision: preferences.revision - 1,
        value: { ...preferences.value, photo },
      },
      kakao.accessToken,
      409,
    );
    assert.equal(
      await app.get(PrismaService).mediaAsset.count(),
      fileCount,
      'conflict cleans up newly uploaded photo',
    );
    assert.equal(
      (await call('/me/onboarding', 'GET', undefined, kakao.accessToken)).photo,
      complete.photo,
    );
    await call(
      '/assets/uploads',
      'POST',
      { name: 'bypass.png', mime: 'image/png', size: 10, scope: 'profile-photo' },
      kakao.accessToken,
      400,
    );
    await call(
      '/me/preferences',
      'PUT',
      {
        revision: preferences.revision,
        value: { ...preferences.value, bio: 'Keep my bio', parts: ['BASS'] },
      },
      kakao.accessToken,
    );
    assert.deepEqual((await call('/me/onboarding', 'GET', undefined, kakao.accessToken)).parts, [
      'BASS',
    ]);
    const resaved = await call('/me/onboarding', 'PUT', draft, kakao.accessToken);
    assert.equal(resaved.completedAt, complete.completedAt);
    assert.equal(resaved.photo, '');
    assert.equal(
      (await fetch(base.replace(/\/v1$/, '') + complete.photo, { redirect: 'manual' })).status,
      404,
    );
    assert.equal(
      (await call('/me/preferences', 'GET', undefined, kakao.accessToken)).value.bio,
      'Keep my bio',
    );
    // Existing installations stored data URLs in both tables. Migrate once without changing other settings.
    const db = app.get(PrismaService);
    await db.profile.update({ where: { id: kakao.user.id }, data: { avatarUrl: photo } });
    const legacyPrefs = await db.personalDocument.findUnique({
      where: { ownerId_key: { ownerId: kakao.user.id, key: 'preferences' } },
    });
    await db.personalDocument.update({
      where: { ownerId_key: { ownerId: kakao.user.id, key: 'preferences' } },
      data: { value: { ...legacyPrefs.value, photo } },
    });
    const { ProfilePhotoService } = await import('../dist/personal/profile-photo.service.js');
    assert.deepEqual(await app.get(ProfilePhotoService).migrateLegacy(), { found: 1, migrated: 1 });
    assert.deepEqual(await app.get(ProfilePhotoService).migrateLegacy(), { found: 0, migrated: 0 });
    const migratedProfile = await call('/me/onboarding', 'GET', undefined, kakao.accessToken);
    assert.match(migratedProfile.photo, /^\/v1\/profile-photos\//);
    const migratedPrefs = await call('/me/preferences', 'GET', undefined, kakao.accessToken);
    assert.equal(migratedPrefs.value.photo, migratedProfile.photo);
    assert.equal(migratedPrefs.value.bio, 'Keep my bio');
    assert.equal(migratedPrefs.revision, legacyPrefs.revision + 1);
    assert.equal((await fetch(base.replace(/\/v1$/, '') + migratedProfile.photo)).status, 200);
    const other = await call('/auth/kakao', 'POST', { code: 'another-user', redirectUri });
    await call(
      '/me/onboarding',
      'PUT',
      { ...draft, photo: complete.photo },
      other.accessToken,
      400,
    );
    assert.equal(
      (await call('/me/onboarding', 'GET', undefined, other.accessToken)).completed,
      false,
    );
    await call('/auth/session', 'GET', undefined, kakao.accessToken + 'tampered', 401);
    const again = await call('/auth/kakao', 'POST', { code: 'second-code', redirectUri });
    assert.equal(again.user.id, kakao.user.id);
    assert.equal(await app.get(PrismaService).authIdentity.count(), 2);
    assert.equal(
      (await call('/me/onboarding', 'GET', undefined, again.accessToken)).completed,
      true,
    );
    await call('/auth/logout', 'POST', undefined, kakao.accessToken);
    await call('/auth/session', 'GET', undefined, kakao.accessToken, 401);
    await call('/auth/session', 'GET', undefined, again.accessToken);
    await app.get(PrismaService).authSession.updateMany({ data: { expiresAt: new Date(0) } });
    await call('/auth/session', 'GET', undefined, again.accessToken, 401);
    assert.ok(spec.paths['/v1/auth/kakao']);
    assert.ok(spec.paths['/v1/auth/kakao/authorize']);
    assert.ok(spec.paths['/v1/auth/logout']);
    assert.ok(spec.paths['/v1/me/onboarding'].get);
    assert.ok(spec.paths['/v1/me/onboarding'].put);
  } finally {
    await app.close();
    assert.ok(directory.startsWith(dataRoot + sep + 'api-test-'));
    rmSync(directory, { recursive: true, force: true });
  }
});
