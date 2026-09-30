import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import { ConfigService } from '@nestjs/config';
import { SignJWT, decodeJwt } from 'jose';
import { AuthService } from './auth.service.js';
import type { PrismaService } from '../database/prisma.service.js';
import type { TemporaryAuthService } from './temporary-auth.service.js';
import type { KakaoClient } from './kakao.client.js';

test('Kakao refresh survives access expiry, rejects access tokens as refresh, and respects logout', async () => {
  const secret = 'test-session-secret-at-least-thirty-two-characters';
  const sessions = new Map<string, { id: string; userId: string; expiresAt: Date }>();
  const db = {
    authIdentity: { findUnique: async () => ({ userId: 'user-a' }) },
    authSession: {
      create: async ({ data }: { data: { id: string; userId: string; expiresAt: Date } }) => {
        sessions.set(data.id, data);
        return data;
      },
      findUnique: async ({ where }: { where: { id: string } }) => sessions.get(where.id) ?? null,
      updateMany: async ({
        where,
        data,
      }: {
        where: { id: string; userId: string; expiresAt: { gt: Date } };
        data: { expiresAt: Date };
      }) => {
        const current = sessions.get(where.id);
        if (!current || current.userId !== where.userId || current.expiresAt <= where.expiresAt.gt)
          return { count: 0 };
        sessions.set(where.id, { ...current, ...data });
        return { count: 1 };
      },
      deleteMany: async ({ where }: { where: { id: string; userId: string } }) => {
        const current = sessions.get(where.id);
        if (current?.userId === where.userId) sessions.delete(where.id);
        return { count: 1 };
      },
    },
  };
  const service = new AuthService(
    new ConfigService({
      AUTH_MODE: 'kakao',
      KAKAO_LOGIN_ENABLED: true,
      AUTH_JWT_SECRET: secret,
      AUTH_ACCESS_TOKEN_TTL_SECONDS: 3600,
      KAKAO_ALLOWED_REDIRECT_URIS: ['http://localhost/callback'],
    }),
    db as unknown as PrismaService,
    {} as TemporaryAuthService,
    {
      exchangeCode: async () => ({ id: 'provider-user', displayName: 'Test' }),
    } as unknown as KakaoClient,
  );
  const login = await service.login('code', 'http://localhost/callback');
  const user = await service.verifyAccessToken(login.accessToken);
  assert.equal(user.id, 'user-a');
  await assert.rejects(service.verifyAccessToken(login.refreshToken));
  await assert.rejects(service.refresh(login.accessToken));
  const expired = await new SignJWT({
    ...(decodeJwt(login.accessToken) as Record<string, unknown>),
    exp: Math.floor(Date.now() / 1000) - 1,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .sign(new TextEncoder().encode(secret));
  await assert.rejects(service.verifyAccessToken(expired));
  const refreshed = await service.refresh(login.refreshToken);
  assert.equal((await service.verifyAccessToken(refreshed.accessToken)).id, 'user-a');
  await service.logout(user, login.accessToken);
  await assert.rejects(service.refresh(refreshed.refreshToken));
  await assert.rejects(service.verifyAccessToken(refreshed.accessToken));
  assert.equal(sessions.size, 0);
});
