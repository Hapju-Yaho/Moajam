import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiProperty,
  ApiPropertyOptional,
  ApiTags,
} from '@nestjs/swagger';
import {
  Body,
  Controller,
  Get,
  Headers,
  Post,
  HttpCode,
  UnprocessableEntityException,
} from '@nestjs/common';
import { IsOptional, IsString, Matches, MinLength, MaxLength } from 'class-validator';
import { Public } from './public.decorator.js';
import { CurrentUser } from './current-user.decorator.js';
import { AuthService, type AuthenticatedUser } from './auth.service.js';
import { TemporaryAuthService } from './temporary-auth.service.js';

class TemporaryLoginDto {
  @ApiPropertyOptional({
    description: '이전에 발급된 임시 계정 복구 키. 생략 시 새 계정 생성. 비밀번호처럼 비밀로 보관.',
    pattern: '^[A-Za-z0-9_-]{43}$',
  })
  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{43}$/)
  resumeKey?: string;
}
class KakaoAuthorizeDto {
  @ApiProperty({
    example: 'http://localhost:5173/auth/kakao/callback',
    description: '현재 프론트의 콜백 주소. 서버 허용 목록 및 카카오 등록 URI와 정확히 일치해야 함',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(2048)
  redirectUri!: string;
}
class KakaoLoginDto extends KakaoAuthorizeDto {
  @ApiProperty({ description: '카카오 콜백에서 받은 일회용 인가 코드. 카카오 access token이 아님' })
  @IsString()
  @MinLength(1)
  @MaxLength(2048)
  code!: string;
}
class SessionUserDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ enum: ['temporary', 'kakao'] }) provider!: string;
  @ApiPropertyOptional() email?: string;
  @ApiPropertyOptional() role?: string;
}
class TemporarySessionDto {
  @ApiProperty() token!: string;
  @ApiProperty() resumeKey!: string;
  @ApiProperty({ description: '만료 시각 (Unix milliseconds)' }) expiresAt!: number;
  @ApiProperty({ type: SessionUserDto }) user!: SessionUserDto;
}
class KakaoSessionDto {
  @ApiProperty({ description: '서비스 API에 사용하는 Moajam JWT' }) accessToken!: string;
  @ApiProperty({ example: 'Bearer' }) tokenType!: string;
  @ApiProperty({ example: 3600 }) expiresIn!: number;
  @ApiProperty({ description: '만료 시각 (Unix milliseconds)' }) expiresAt!: number;
  @ApiProperty({ type: SessionUserDto }) user!: SessionUserDto;
}
class KakaoAuthorizationDto {
  @ApiProperty() authorizationUrl!: string;
  @ApiProperty({ description: '프론트에서 보관한 뒤 콜백 state와 비교' }) state!: string;
  @ApiProperty({ example: 600 }) expiresIn!: number;
}
@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly temporary: TemporaryAuthService,
    private readonly auth: AuthService,
  ) {}
  @Public()
  @Post('kakao/authorize')
  @HttpCode(200)
  @ApiOperation({ summary: '카카오 인가 URL과 CSRF state 발급' })
  @ApiOkResponse({ type: KakaoAuthorizationDto })
  authorize(@Body() dto: KakaoAuthorizeDto) {
    if (!dto) throw new UnprocessableEntityException('redirectUri가 필요합니다.');
    return this.auth.authorize(dto.redirectUri);
  }
  @Public()
  @Post('kakao')
  @HttpCode(200)
  @ApiOperation({
    summary: '카카오 인가 코드 교환 및 서비스 로그인',
    description:
      '프론트가 code와 인가 요청 때 사용한 redirectUri를 전달한다. 서버가 카카오에서 토큰과 사용자 정보를 확인하고 자체 JWT를 발급한다. 400: 미허용 URI, 401: 코드 오류/만료, 422: DTO 오류, 503: 설정 또는 카카오 통신 오류.',
  })
  @ApiOkResponse({ type: KakaoSessionDto })
  kakaoLogin(@Body() dto: KakaoLoginDto) {
    if (!dto) throw new UnprocessableEntityException('code와 redirectUri가 필요합니다.');
    return this.auth.login(dto.code, dto.redirectUri);
  }
  @Public()
  @Post('temporary')
  @ApiOperation({
    summary: '개발용 임시 로그인',
    description:
      '명시적 개발 모드 AUTH_MODE=temporary일 때만 제공. 정식 인증은 POST /auth/kakao 사용.',
  })
  @ApiCreatedResponse({ type: TemporarySessionDto })
  login(@Body() dto: TemporaryLoginDto) {
    if (!dto)
      throw new UnprocessableEntityException('요청 본문에 빈 객체 또는 복구 키를 전달해주세요.');
    return this.temporary.login(dto.resumeKey);
  }

  @Get('session')
  @ApiBearerAuth()
  @ApiOperation({ summary: '현재 임시 또는 카카오 인증 사용자 확인' })
  @ApiOkResponse({ type: SessionUserDto })
  session(@CurrentUser() user: AuthenticatedUser) {
    return {
      id: user.id,
      provider: user.provider,
      ...(user.email ? { email: user.email } : {}),
      ...(user.role ? { role: user.role } : {}),
    };
  }

  @Post('logout')
  @HttpCode(200)
  @ApiBearerAuth()
  @ApiOperation({
    summary: '서비스 로그아웃',
    description:
      '현재 서비스 세션을 즉시 폐기한다. 카카오 계정 자체의 로그인 상태는 변경하지 않는다.',
  })
  serviceLogout(@CurrentUser() user: AuthenticatedUser, @Headers('authorization') token = '') {
    return this.auth.logout(user, token.replace(/^Bearer /i, ''));
  }

  @Post('temporary/logout')
  @ApiBearerAuth()
  @ApiOperation({
    summary: '현재 임시 세션 폐기',
    description: '개발용 임시 세션 폐기. 정식 서비스 로그아웃은 POST /auth/logout을 사용한다.',
  })
  logout(@Headers('authorization') token = '') {
    return this.temporary.logout(token.replace(/^Bearer /i, ''));
  }
}
