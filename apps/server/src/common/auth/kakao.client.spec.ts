import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import { ConfigService } from '@nestjs/config';
import { HttpException } from '@nestjs/common';
import { KakaoClient } from './kakao.client.js';

test('Kakao code exchange uses server secret, exact redirect and provider token only upstream', async (t) => {
  const config = new ConfigService({
    KAKAO_REST_API_KEY: 'rest-key',
    KAKAO_CLIENT_SECRET: 'private-secret',
  });
  const calls: Array<{ url: string; init: RequestInit }> = [];
  t.mock.method(globalThis, 'fetch', async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return url.endsWith('/oauth/token')
      ? Response.json({ access_token: 'provider-token', refresh_token: 'private-refresh' })
      : Response.json({ id: 12345, kakao_account: { profile: { nickname: '카카오 사용자' } } });
  });
  const result = await new KakaoClient(config).exchangeCode(
    'one-time-code',
    'http://localhost:5173/auth/kakao/callback',
  );
  assert.deepEqual(result, { id: '12345', displayName: '카카오 사용자' });
  assert.deepEqual(Object.fromEntries(new URLSearchParams(String(calls[0].init.body))), {
    grant_type: 'authorization_code',
    client_id: 'rest-key',
    client_secret: 'private-secret',
    redirect_uri: 'http://localhost:5173/auth/kakao/callback',
    code: 'one-time-code',
  });
  assert.equal(calls[0].url, 'https://kauth.kakao.com/oauth/token');
  assert.equal(calls[1].url, 'https://kapi.kakao.com/v2/user/me');
  assert.equal(new Headers(calls[1].init.headers).get('Authorization'), 'Bearer provider-token');
  assert.ok(!JSON.stringify(result).includes('token'));
});

test('Kakao failures return safe errors without echoing upstream secrets', async (t) => {
  const config = new ConfigService({ KAKAO_REST_API_KEY: 'key', KAKAO_CLIENT_SECRET: 'secret' });
  const client = new KakaoClient(config);
  const fetchMock = t.mock.method(globalThis, 'fetch', async () =>
    Response.json({ error_description: 'sensitive-detail' }, { status: 400 }),
  );
  await assert.rejects(
    client.exchangeCode('bad', 'https://app.example/callback'),
    (error: unknown) => {
      assert.ok(error instanceof HttpException && !error.message.includes('sensitive-detail'));
      return error.getStatus() === 401;
    },
  );
  fetchMock.mock.mockImplementation(async () => {
    throw new Error('sensitive-network-error');
  });
  await assert.rejects(
    client.exchangeCode('code', 'https://app.example/callback'),
    (error: unknown) => (error as { getStatus(): number }).getStatus() === 503,
  );
  fetchMock.mock.mockImplementation(async () => Response.json({ access_token: 'token', id: 1.5 }));
  await assert.rejects(
    client.exchangeCode('code', 'https://app.example/callback'),
    (error: unknown) => (error as { getStatus(): number }).getStatus() === 401,
  );
});
