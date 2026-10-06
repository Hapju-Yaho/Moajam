import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes, randomUUID } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';
import { PrismaService } from '../database/prisma.service.js';
import { TemporaryAuthService } from './temporary-auth.service.js';
import { KakaoClient } from './kakao.client.js';

export interface AuthenticatedUser {
  id: string;
  email?: string;
  role?: string;
  provider?: 'temporary' | 'kakao';
  sessionId?: string;
}
const issuer = 'moajam';
const audience = 'moajam-api';
@Injectable()
export class AuthService {
  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly temporary: TemporaryAuthService,
    private readonly kakao: KakaoClient,
  ) {}
  private ready() {
    if (this.config.get('AUTH_MODE') !== 'kakao' || !this.config.get('KAKAO_LOGIN_ENABLED'))
      throw new ServiceUnavailableException(
        '카카오 로그인 설정이 필요합니다. 서버 환경변수를 확인해주세요.',
      );
  }
  private secret() {
    return new TextEncoder().encode(this.config.getOrThrow<string>('AUTH_JWT_SECRET'));
  }
  private redirect(uri: string) {
    const allowed = this.config.get<string[]>('KAKAO_ALLOWED_REDIRECT_URIS') ?? [];
    if (!allowed.includes(uri)) throw new BadRequestException('허용되지 않은 redirect URI입니다.');
  }
  authorize(redirectUri: string) {
    this.ready();
    this.redirect(redirectUri);
    const state = randomBytes(32).toString('base64url');
    const url = new URL('https://kauth.kakao.com/oauth/authorize');
    url.search = new URLSearchParams({
      response_type: 'code',
      prompt: 'login',
      client_id: this.config.getOrThrow('KAKAO_REST_API_KEY'),
      redirect_uri: redirectUri,
      state,
    }).toString();
    return { authorizationUrl: url.toString(), state, expiresIn: 600 };
  }
  async login(code: string, redirectUri: string) {
    this.ready();
    this.redirect(redirectUri);
    const kakao = await this.kakao.exchangeCode(code, redirectUri);
    const where = { provider_providerUserId: { provider: 'kakao', providerUserId: kakao.id } };
    let identity = await this.prisma.authIdentity.findUnique({ where });
    if (!identity) {
      try {
        identity = await this.prisma.authIdentity.create({
          data: {
            provider: 'kakao',
            providerUserId: kakao.id,
            user: { create: { id: randomUUID(), displayName: kakao.displayName } },
          },
        });
      } catch (error) {
        // Concurrent first logins may race on the provider ID. Nested create rolls back the loser.
        identity = await this.prisma.authIdentity.findUnique({ where });
        if (!identity) throw error;
      }
    }
    const sessionId = randomUUID();
    await this.prisma.authSession.create({
      data: {
        id: sessionId,
        userId: identity.userId,
        expiresAt: new Date(Date.now() + 30 * 86400000),
      },
    });
    return this.tokens(identity.userId, sessionId);
  }
  private async tokens(userId: string, sessionId: string) {
    const now = Math.floor(Date.now() / 1000);
    const expiresIn = this.config.getOrThrow<number>('AUTH_ACCESS_TOKEN_TTL_SECONDS');
    const sign = (target: string, seconds: number) =>
      new SignJWT({ provider: 'kakao', sid: sessionId })
        .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
        .setIssuer(issuer)
        .setAudience(target)
        .setSubject(userId)
        .setJti(sessionId)
        .setIssuedAt(now)
        .setExpirationTime(now + seconds)
        .sign(this.secret());
    return {
      accessToken: await sign(audience, expiresIn),
      refreshToken: await sign('moajam-refresh', 30 * 86400),
      tokenType: 'Bearer' as const,
      expiresIn,
      expiresAt: (now + expiresIn) * 1000,
      user: { id: userId, provider: 'kakao' as const },
    };
  }
  async refresh(refreshToken: string) {
    this.ready();
    let payload;
    try {
      ({ payload } = await jwtVerify(refreshToken, this.secret(), {
        algorithms: ['HS256'],
        issuer,
        audience: 'moajam-refresh',
        requiredClaims: ['sub', 'sid', 'exp', 'iat', 'jti'],
      }));
    } catch {
      throw new UnauthorizedException('로그인 갱신 정보가 만료되었습니다. 다시 로그인해주세요.');
    }
    if (
      payload.provider !== 'kakao' ||
      typeof payload.sid !== 'string' ||
      typeof payload.sub !== 'string' ||
      payload.jti !== payload.sid
    )
      throw new UnauthorizedException('유효하지 않은 갱신 정보입니다.');
    return this.renewSession(payload.sub, payload.sid);
  }
  async renew(user: AuthenticatedUser) {
    if (user.provider !== 'kakao' || !user.sessionId)
      throw new UnauthorizedException('카카오 세션이 필요합니다.');
    return this.renewSession(user.id, user.sessionId);
  }
  private async renewSession(userId: string, sessionId: string) {
    const changed = await this.prisma.authSession.updateMany({
      where: { id: sessionId, userId, expiresAt: { gt: new Date() } },
      data: { expiresAt: new Date(Date.now() + 30 * 86400000) },
    });
    if (!changed.count) throw new UnauthorizedException('로그아웃되었거나 만료된 세션입니다.');
    return this.tokens(userId, sessionId);
  }
  async verifyAccessToken(token: string): Promise<AuthenticatedUser> {
    if (this.config.get('AUTH_MODE') === 'temporary') return this.temporary.verify(token);
    if (token.startsWith('temporary_'))
      throw new UnauthorizedException('임시 로그인 토큰은 사용할 수 없습니다.');
    this.ready();
    let userId: string;
    let sessionId: string;
    try {
      const { payload } = await jwtVerify(token, this.secret(), {
        algorithms: ['HS256'],
        issuer,
        audience,
        requiredClaims: ['sub', 'exp', 'iat', 'jti'],
      });
      if (
        payload.provider !== 'kakao' ||
        typeof payload.sub !== 'string' ||
        typeof payload.sid !== 'string' ||
        payload.jti !== payload.sid
      )
        throw new Error();
      userId = payload.sub;
      sessionId = payload.sid;
    } catch {
      throw new UnauthorizedException('유효하지 않거나 만료된 Access Token입니다.');
    }
    const session = await this.prisma.authSession.findUnique({ where: { id: sessionId } });
    if (!session || session.userId !== userId || session.expiresAt.getTime() <= Date.now())
      throw new UnauthorizedException('로그인이 만료되었거나 로그아웃된 세션입니다.');
    return { id: userId, provider: 'kakao', sessionId };
  }
  async logout(user: AuthenticatedUser, token: string) {
    if (user.provider === 'temporary') return this.temporary.logout(token);
    if (!user.sessionId) throw new UnauthorizedException('로그인 세션을 확인하지 못했습니다.');
    await this.prisma.authSession.deleteMany({ where: { id: user.sessionId, userId: user.id } });
    return { ok: true };
  }
}
