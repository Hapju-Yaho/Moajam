import assert from 'node:assert/strict';
import { test } from 'node:test';
import { databaseUrl, LOCAL_DATABASE_URL } from './database-url.js';
import { validateEnvironment } from './environment.js';
test('empty or whitespace DATABASE_URL selects local for runtime and migrations', () => {
  for (const value of [undefined, '', '   ']) {
    assert.equal(databaseUrl({ DATABASE_URL: value }), LOCAL_DATABASE_URL);
    assert.equal(
      databaseUrl({ DATABASE_URL: value, DIRECT_URL: 'postgresql://old.example/db' }, true),
      LOCAL_DATABASE_URL,
    );
  }
});
test('explicit remote URL stays remote; DIRECT_URL applies only to remote migrations', () => {
  const config = {
    DATABASE_URL: ' postgresql://runtime.example/db ',
    DIRECT_URL: 'postgresql://direct.example/db',
  };
  assert.equal(databaseUrl(config), config.DATABASE_URL.trim());
  assert.equal(databaseUrl(config, true), config.DIRECT_URL);
  assert.equal(
    databaseUrl({ DATABASE_URL: config.DATABASE_URL, DIRECT_URL: ' ' }, true),
    config.DATABASE_URL.trim(),
  );
});
test('rejects invalid and HTTP URLs; ignores obsolete local PostgreSQL override', () => {
  for (const value of ['broken', 'https://project.supabase.co'])
    assert.throws(() => databaseUrl({ DATABASE_URL: value }));
  assert.equal(
    databaseUrl({ LOCAL_DATABASE_URL: 'postgresql://remote.example/db' }),
    LOCAL_DATABASE_URL,
  );
  assert.match(LOCAL_DATABASE_URL, /\/data\/moajam\.db$/);
});

test('authentication selection is independent from SQLite or external DB selection', () => {
  for (const DATABASE_URL of ['', 'postgresql://runtime.example/db']) {
    assert.equal(validateEnvironment({ DATABASE_URL }).AUTH_MODE, 'kakao');
    assert.equal(
      validateEnvironment({ DATABASE_URL, AUTH_MODE: 'temporary' }).AUTH_MODE,
      'temporary',
    );
    const result = validateEnvironment({
      DATABASE_URL,
      AUTH_MODE: 'kakao',
      KAKAO_REST_API_KEY: 'rest-key',
      KAKAO_CLIENT_SECRET: 'secret',
      AUTH_JWT_SECRET: 'a'.repeat(32),
      KAKAO_ALLOWED_REDIRECT_URIS: 'https://app.example/auth/kakao/callback',
    });
    assert.equal(result.AUTH_MODE, 'kakao');
    assert.equal(result.DATABASE_MODE, DATABASE_URL ? 'postgresql' : 'sqlite');
  }
});

test('production never enables temporary auth and Kakao requires explicit credentials', () => {
  assert.throws(
    () => validateEnvironment({ NODE_ENV: 'production', AUTH_MODE: 'temporary' }),
    /not allowed/,
  );
  assert.throws(() => validateEnvironment({ NODE_ENV: 'production' }), /requires/);
  assert.throws(() => validateEnvironment({ AUTH_MODE: 'password' }), /AUTH_MODE/);
  const config = validateEnvironment({
    NODE_ENV: 'production',
    KAKAO_REST_API_KEY: 'rest-key',
    KAKAO_CLIENT_SECRET: 'secret',
    AUTH_JWT_SECRET: 'a'.repeat(32),
    KAKAO_ALLOWED_REDIRECT_URIS: 'https://app.example/auth/kakao/callback',
  });
  assert.equal(config.AUTH_MODE, 'kakao');
});

test('invalid secrets, redirect URI and TTL are rejected; unconfigured development stays gated', () => {
  assert.equal(validateEnvironment({}).KAKAO_LOGIN_ENABLED, false);
  for (const config of [
    { AUTH_JWT_SECRET: 'short' },
    { AUTH_ACCESS_TOKEN_TTL_SECONDS: '0' },
    { KAKAO_ALLOWED_REDIRECT_URIS: 'https://app.example/*' },
    { KAKAO_ALLOWED_REDIRECT_URIS: 'javascript:alert(1)' },
    { NODE_ENV: 'production', KAKAO_ALLOWED_REDIRECT_URIS: 'http://app.example/callback' },
  ])
    assert.throws(() => validateEnvironment(config));
});
