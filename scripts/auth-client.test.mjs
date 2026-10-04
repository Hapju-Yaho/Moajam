import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Buffer } from 'node:buffer';
import { URL } from 'node:url';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import ts from 'typescript';
const { Response, Blob, FormData } = globalThis;

async function fixture({
  mode = 'temporary',
  preview = false,
  store = new Map(),
  failure = false,
  uploadFormat,
  uploadFailure = false,
} = {}) {
  const calls = [];
  let denied = false;

  const key = randomUUID();
  globalThis[key] = {
    fetch: async (url, init = {}) => {
      if (url === 'https://files.example/upload') {
        calls.push({ url, body: init.body, headers: init.headers, method: init.method });
        return new Response('', { status: uploadFailure ? 403 : 200 });
      }
      const body = init.body ? JSON.parse(init.body) : undefined;
      calls.push({ url, body, headers: init.headers });
      if (failure) throw new Error('offline');
      if (url.endsWith('/assets/uploads'))
        return Response.json({
          assetId: 'uploaded-file',
          signedUrl: 'https://files.example/upload',
          uploadFormat,
          ...(uploadFormat === 'raw'
            ? { headers: { 'Content-Type': body.mime, 'If-None-Match': '*' } }
            : {}),
        });
      if (url.endsWith('/config'))
        return Response.json({
          authMode: mode,
          supabaseUrl: 'https://example.supabase.co',
          supabasePublishableKey: 'public-key',
        });
      if (url.endsWith('/auth/temporary')) {
        assert.equal(mode, 'temporary');
        return Response.json({
          token: 'temporary_token',
          resumeKey: 'resume-secret',
          expiresAt: Date.now() + 100000,
          user: { id: 'a', provider: 'temporary' },
        });
      }
      if (url.endsWith('/auth/kakao/authorize'))
        return Response.json({
          authorizationUrl: 'https://kauth.kakao.com/oauth/authorize?state=test-state',
          state: 'test-state',
          expiresIn: 600,
        });
      if (
        url.endsWith('/auth/kakao') ||
        url.endsWith('/auth/refresh') ||
        url.endsWith('/auth/renew')
      )
        return Response.json({
          accessToken: 'service-jwt',
          refreshToken: 'refresh-secret',
          expiresAt: Date.now() + 100000,
          user: { id: 'k', provider: 'kakao' },
        });
      if (url.endsWith('/me/documents/empty')) return new Response('', { status: 200 });
      if (url.endsWith('/profile-photo-test'))
        return Response.json({
          photo: '/v1/profile-photos/11111111-1111-4111-8111-111111111111',
          members: [
            { user: { avatarUrl: '/v1/profile-photos/11111111-1111-4111-8111-111111111111' } },
          ],
          unrelated: '/v1/profile-photos/11111111-1111-4111-8111-111111111111',
        });
      if (url.endsWith('/me/documents/null')) return Response.json(null);
      if (url.endsWith('/auth/logout')) return Response.json({ ok: true });
      return denied
        ? Response.json({ detail: 'expired' }, { status: 401 })
        : Response.json({ id: 'a' });
    },
  };
  const source =
    `const { fetch } = globalThis[${JSON.stringify(key)}];\n` +
    readFileSync(new URL('../packages/app/src/lib/remote-client.ts', import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  });
  const client = await import(
    `data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`
  );
  delete globalThis[key];
  const options = {
    apiUrl: 'http://example.test/v1',
    loginPreview: preview,
    authRedirect: 'https://example.test/auth/kakao/mobile-callback',
    nativeCallback: 'moajam://auth/callback',
    openAuthSession: async () => 'moajam://auth/callback?code=test-code&state=test-state',
    storage: {
      getItem: async (key) => store.get(key) ?? null,
      setItem: async (key, value) => {
        store.set(key, value);
      },
      removeItem: async (key) => {
        store.delete(key);
      },
    },
  };
  client.configureRemote(options);
  return {
    client,
    calls,
    store,
    options,
    deny: () => {
      denied = true;
    },
  };
}

test('profile photo paths use the current web proxy or mobile API, including nested band members', async () => {
  for (const base of ['/api/v1', 'http://10.0.2.2:3000/v1', 'https://api.example/v1']) {
    const f = await fixture();
    f.client.configureRemote({ ...f.options, apiUrl: base });
    await f.client.currentIdentity();
    const result = await f.client.api('/profile-photo-test');
    assert.equal(result.photo, base + '/profile-photos/11111111-1111-4111-8111-111111111111');
    assert.equal(result.members[0].user.avatarUrl, result.photo);
    assert.equal(result.unrelated, '/v1/profile-photos/11111111-1111-4111-8111-111111111111');
  }
});

test('R2 sends original bytes with signed MIME headers and only completes successful uploads', async () => {
  for (const [mime, name] of [
    ['image/png', 'photo.png'],
    ['audio/webm;codecs=opus', 'recording.webm'],
    ['', 'recording.m4a'],
  ]) {
    const f = await fixture({ uploadFormat: 'raw' });
    const blob = new Blob([new Uint8Array([0, 10, 200, 255])], { type: mime });
    assert.equal(await f.client.uploadRemoteFile(blob, name, 'practice'), 'uploaded-file');
    const uploaded = f.calls.find((c) => c.url === 'https://files.example/upload');
    assert.equal(uploaded.method, 'PUT');
    assert.ok(uploaded.body instanceof Blob);
    assert.deepEqual(await uploaded.body.arrayBuffer(), await blob.arrayBuffer());
    assert.equal(uploaded.headers['Content-Type'], mime.split(';')[0] || 'audio/mp4');
    assert.equal(uploaded.headers['If-None-Match'], '*');
    assert.ok(f.calls.at(-1).url.endsWith('/assets/uploaded-file/complete'));
  }
  const f = await fixture({ uploadFormat: 'raw', uploadFailure: true });
  await assert.rejects(
    f.client.uploadRemoteFile(new Blob(['audio'], { type: 'audio/wav' }), 'audio.wav', 'practice'),
    /업로드/,
  );
  assert.equal(
    f.calls.some((c) => c.url.endsWith('/complete')),
    false,
  );
});

test('local and Supabase uploads keep multipart compatibility including older server responses', async () => {
  for (const uploadFormat of [undefined, 'multipart']) {
    const f = await fixture({ uploadFormat });
    await f.client.uploadRemoteFile(
      new Blob(['audio'], { type: 'audio/wav' }),
      'audio.wav',
      'practice',
    );
    const uploaded = f.calls.find((c) => c.url === 'https://files.example/upload');
    assert.ok(uploaded.body instanceof FormData);
    assert.equal(await uploaded.body.get('').text(), 'audio');
    assert.equal(uploaded.headers, undefined);
  }
});

test('automatic temporary login deduplicates startup; logout pauses entry and resume survives reload', async () => {
  const f = await fixture();
  assert.deepEqual(await Promise.all([f.client.currentIdentity(), f.client.currentIdentity()]), [
    'a',
    'a',
  ]);
  assert.equal(f.calls.filter((call) => call.url.endsWith('/auth/temporary')).length, 1);
  await f.client.signOut();
  assert.equal(await f.client.currentIdentity(), null);
  await f.client.signInTemporary();
  assert.equal(f.calls.at(-1).body.resumeKey, 'resume-secret');
  await f.client.signOut();
  const reloaded = await fixture({ store: f.store });
  assert.equal(await reloaded.client.currentIdentity(), 'a');
  assert.equal(reloaded.calls.at(-1).body.resumeKey, 'resume-secret');
});

test('login preview waits for the temporary button and 401 never silently creates a new account', async () => {
  const f = await fixture({ preview: true });
  assert.equal(await f.client.currentIdentity(), null);
  assert.equal(f.calls.length, 0);
  await f.client.signInTemporary();
  f.deny();
  await assert.rejects(f.client.api('/me'), /expired/);
  assert.equal(await f.client.currentIdentity(), null);
  assert.equal(f.calls.filter((call) => call.url.endsWith('/auth/temporary')).length, 1);
});

test('server failure never falls back to a fabricated or demo identity', async () => {
  const f = await fixture({ failure: true });
  await assert.rejects(f.client.currentIdentity(), /서버/);
  assert.equal(f.store.size, 0);
});

test('explicit mock mode uses the sample identity and blocks backend requests even when offline', async () => {
  const f = await fixture({ failure: true });
  f.client.configureRemote({ ...f.options, demo: true });
  assert.equal(f.client.serverConfigured, false);
  assert.equal(await f.client.currentIdentity(), 'm1');
  await assert.rejects(f.client.api('/workspaces'), /목데이터 모드/);
  await assert.rejects(f.client.signInTemporary(), /목데이터 모드/);
  assert.equal(f.calls.length, 0);
  assert.equal(f.store.size, 0);
});

test('Kakao exchanges code and original HTTPS redirect URI for a service JWT; persisted session survives reload', async () => {
  const f = await fixture({ mode: 'kakao' });
  assert.equal(await f.client.currentIdentity(), null);
  await f.client.signInWithKakao();
  const exchange = f.calls.find((call) => call.url.endsWith('/auth/kakao'));
  assert.deepEqual(exchange.body, {
    code: 'test-code',
    redirectUri: 'https://example.test/auth/kakao/mobile-callback',
  });
  assert.equal(await f.client.currentIdentity(), 'k');
  await f.client.api('/me');
  assert.equal(f.calls.at(-1).headers.Authorization, 'Bearer service-jwt');
  const reload = await fixture({ mode: 'kakao', store: f.store });
  assert.equal(await reload.client.currentIdentity(), 'k');
  await assert.rejects(f.client.signInTemporary(), /사용할 수 없습니다/);
  await f.client.signOut();
  assert.equal(await f.client.currentIdentity(), null);
});
test('mobile rejects wrong callback and wrong state before exchanging code', async () => {
  for (const callback of [
    'other://auth/callback?code=x&state=test-state',
    'moajam://auth/callback?code=x&state=wrong',
  ]) {
    const f = await fixture({ mode: 'kakao' });
    f.options.openAuthSession = async () => callback;
    await assert.rejects(f.client.signInWithKakao());
    assert.ok(!f.calls.some((call) => call.url.endsWith('/auth/kakao')));
    assert.equal(await f.client.currentIdentity(), null);
  }
});
test('web callback runs only once on concurrent startup and consumes state', async () => {
  const f = await fixture({ mode: 'kakao' });
  f.options.openAuthSession = undefined;
  f.options.nativeCallback = undefined;
  f.options.authRedirect = 'https://example.test/auth/kakao/callback';
  let navigated;
  f.options.navigateToAuthorization = (url) => {
    navigated = url;
  };
  await f.client.signInWithKakao();
  assert.match(navigated, /^https:\/\/kauth.kakao.com/);
  f.options.getAuthCallback = () =>
    'https://example.test/auth/kakao/callback?code=test-code&state=test-state';
  f.options.clearAuthCallback = () => {
    f.options.getAuthCallback = () => null;
  };
  assert.deepEqual(await Promise.all([f.client.currentIdentity(), f.client.currentIdentity()]), [
    'k',
    'k',
  ]);
  assert.equal(f.calls.filter((call) => call.url.endsWith('/auth/kakao')).length, 1);
  assert.ok(![...f.store.keys()].some((key) => key.startsWith('moajam.kakao-request:')));
});
test('denied Kakao consent and expired attempts never create a session', async () => {
  for (const expired of [false, true]) {
    const f = await fixture({ mode: 'kakao' });
    f.options.openAuthSession = async () => {
      if (expired)
        for (const [key, value] of f.store)
          if (key.startsWith('moajam.kakao-request:'))
            f.store.set(key, JSON.stringify({ ...JSON.parse(value), expiresAt: 0 }));
      return 'moajam://auth/callback?error=access_denied&state=test-state';
    };
    await assert.rejects(f.client.signInWithKakao());
    assert.ok(!f.calls.some((call) => call.url.endsWith('/auth/kakao')));
  }
});

test('missing practice documents accept empty 200 and JSON null responses', async () => {
  const { client } = await fixture();
  await client.currentIdentity();
  assert.equal(await client.api('/me/documents/empty'), null);
  assert.equal(await client.api('/me/documents/null'), null);
});

test('expired Kakao access token renews once for concurrent requests without losing identity', async () => {
  const store = new Map([
    [
      'moajam.auth-session:http://example.test/v1',
      JSON.stringify({
        token: 'expired',
        refreshToken: 'refresh-secret',
        expiresAt: Date.now() - 100,
        user: { id: 'k', provider: 'kakao' },
      }),
    ],
  ]);
  const f = await fixture({ mode: 'kakao', store });
  assert.deepEqual(await Promise.all([f.client.currentIdentity(), f.client.currentIdentity()]), [
    'k',
    'k',
  ]);
  assert.equal(f.calls.filter((call) => call.url.endsWith('/auth/refresh')).length, 1);
  assert.equal(
    JSON.parse(store.get('moajam.auth-session:http://example.test/v1')).token,
    'service-jwt',
  );
});
test('expired temporary session resumes the existing account rather than creating a new account', async () => {
  const store = new Map([
    [
      'moajam.auth-session:http://example.test/v1',
      JSON.stringify({
        token: 'expired',
        expiresAt: Date.now() - 100,
        user: { id: 'a', provider: 'temporary' },
      }),
    ],
    ['moajam.temporary-resume:http://example.test/v1', 'resume-secret'],
  ]);
  const f = await fixture({ store });
  assert.equal(await f.client.currentIdentity(), 'a');
  assert.equal(
    f.calls.find((call) => call.url.endsWith('/auth/temporary')).body.resumeKey,
    'resume-secret',
  );
});
