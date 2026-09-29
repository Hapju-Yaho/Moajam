import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthGuard } from './auth.guard.js';
import { AuthService } from './auth.service.js';
import { TemporaryAuthService } from './temporary-auth.service.js';
import { KakaoClient } from './kakao.client.js';
import { AuthController } from './auth.controller.js';

@Module({
  controllers: [AuthController],
  providers: [
    AuthService,
    KakaoClient,
    TemporaryAuthService,
    {
      provide: APP_GUARD,
      useClass: AuthGuard,
    },
  ],
  exports: [AuthService],
})
export class AuthModule {}
