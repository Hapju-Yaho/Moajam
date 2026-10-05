import { UnprocessableEntityException, ValidationPipe } from '@nestjs/common';
import type { ValidationError } from 'class-validator';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module.js';
import { ProblemDetailsFilter } from './common/errors/problem-details.filter.js';
import multipart from '@fastify/multipart';

export async function createApplication() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({
      bodyLimit: 1024 * 1024,
      routerOptions: { maxParamLength: 2048 },
      trustProxy: true,
    }),
  );

  app.setGlobalPrefix('v1');
  await app.register(multipart);
  app.enableShutdownHooks();
  app.useGlobalFilters(new ProblemDetailsFilter());
  app.useGlobalPipes(
    new ValidationPipe({
      exceptionFactory: (errors) => {
        const messages = (items: ValidationError[]): string[] =>
          items.flatMap((item) => [
            ...Object.values(item.constraints ?? {}),
            ...messages(item.children ?? []),
          ]);
        return new UnprocessableEntityException(messages(errors));
      },
      forbidNonWhitelisted: true,
      transform: true,
      whitelist: true,
    }),
  );

  const corsOrigins = app
    .get(ConfigService)
    .get<string>('CORS_ORIGINS')
    ?.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  app.enableCors({
    credentials: true,
    origin: corsOrigins?.length ? corsOrigins : false,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Moajam API')
    .setDescription(
      '밴드 Workspace API. 기본 인증은 카카오 로그인이다. POST /v1/auth/kakao/authorize로 인가 URL을 받고, 프론트 콜백의 code와 redirectUri를 POST /v1/auth/kakao에 보내 Moajam JWT를 발급받는다. API 요청에는 서비스 JWT를 Bearer로 전달한다. POST /v1/auth/logout은 현재 세션을 폐기한다. 상세 설정: docs/authentication.md',
    )
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
  const documentFactory = () =>
    SwaggerModule.createDocument(app, swaggerConfig, {
      operationIdFactory: (controllerKey, methodKey) => `${controllerKey}_${methodKey}`,
    });

  SwaggerModule.setup('docs', app, documentFactory, {
    jsonDocumentUrl: 'docs-json',
  });

  return app;
}
