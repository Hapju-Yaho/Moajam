import { Injectable, UnauthorizedException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class KakaoClient {
  constructor(private readonly config: ConfigService) {}
  private async call(url: string, init: RequestInit) {
    let response: Response;
    try {
      response = await fetch(url, {
        ...init,
        redirect: 'error',
        signal: AbortSignal.timeout(10000),
      });
    } catch {
      throw new ServiceUnavailableException(
        '카카오 인증 서버에 연결하지 못했습니다. 다시 시도해주세요.',
      );
    }
    if (response.status === 400 || response.status === 401)
      throw new UnauthorizedException(
        '카카오 인증 코드가 유효하지 않습니다. 로그인을 다시 시작해주세요.',
      );
    if (!response.ok)
      throw new ServiceUnavailableException(
        '카카오 인증 요청을 처리하지 못했습니다. 잠시 후 다시 시도해주세요.',
      );
    try {
      return (await response.json()) as Record<string, unknown>;
    } catch {
      throw new ServiceUnavailableException('카카오 인증 응답을 확인하지 못했습니다.');
    }
  }
  async exchangeCode(code: string, redirectUri: string) {
    const tokens = await this.call('https://kauth.kakao.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: this.config.getOrThrow('KAKAO_REST_API_KEY'),
        client_secret: this.config.getOrThrow('KAKAO_CLIENT_SECRET'),
        redirect_uri: redirectUri,
        code,
      }).toString(),
    });
    if (typeof tokens.access_token !== 'string' || !tokens.access_token)
      throw new UnauthorizedException('카카오 인증 토큰을 확인하지 못했습니다.');
    const user = await this.call('https://kapi.kakao.com/v2/user/me', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    const id =
      typeof user.id === 'number' && Number.isSafeInteger(user.id) ? String(user.id) : user.id;
    if (typeof id !== 'string' || !/^[1-9]\d{0,127}$/.test(id))
      throw new UnauthorizedException('카카오 사용자 정보를 확인하지 못했습니다.');
    const account = user.kakao_account as
      { profile?: { nickname?: unknown; profile_image_url?: unknown } } | undefined;
    const nickname = account?.profile?.nickname;
    return {
      id,
      displayName:
        typeof nickname === 'string' && nickname.trim() ? nickname.trim().slice(0, 80) : '뮤지션',
    };
  }
}
