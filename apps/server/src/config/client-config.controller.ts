import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../common/auth/public.decorator.js';
@ApiTags('Configuration')
@Controller('config')
export class ClientConfigController {
  constructor(private readonly config: ConfigService) {}
  @Get()
  @Public()
  @ApiOperation({ summary: '공개 클라이언트 설정 (DB 주소·서버 비밀 키 제외)' })
  get() {
    return {
      authMode: this.config.get<string>('AUTH_MODE'),
      authProvider: 'kakao',
      temporaryLoginEnabled: this.config.get('AUTH_MODE') === 'temporary',
      kakaoLoginEnabled: this.config.get<boolean>('KAKAO_LOGIN_ENABLED'),
      mediaWorkerEnabled: this.config.get<string>('ENABLE_MEDIA_WORKER') === 'true',
    };
  }
}
