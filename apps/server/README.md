# Moajam Server

Moajam의 HTTP API와 비동기 미디어 작업을 담당하는 서버 애플리케이션이다.

NestJS, Fastify, Prisma와 Supabase를 사용한다.

## 설계 문서부터 보기

저장소 루트에서 `npm run docs:api`를 실행하면
[설계 Swagger](http://127.0.0.1:3001)를 DB나 환경변수 없이 열 수 있다.
전체 데이터 구조와 읽는 순서는 [백엔드 설계 안내](../../docs/backend-design.md)를 참고한다.
`npm run docs:check`로 명세 참조·API 목록·현재 구현 경로의 문서 누락을 검사한다.
목표 API는 읽기 전용 설계이며 현재 서버의 실행 가능한 API와 구분한다.

## 시작하기

별도 환경변수 없이 로컬 SQLite로 실행한다. Docker는 필요 없다.

```sh
npm run dev:server
```

개발 서버가 Prisma Client와 SQLite 스키마를 준비한다.
`DATABASE_URL`이 비어 있으면 저장소 `data/moajam.db`, 값이 있으면 외부 PostgreSQL을 사용한다.
파일은 로컬 모드에서 `data/files`, 외부 모드에서 Supabase 비공개 Storage에 저장한다.
기본 인증은 카카오 로그인이다. 인가 코드와 redirect URI를 받아 자체 JWT를 발급한다. 카카오 키와 서명 키를 env에 설정해야 로그인할 수 있다. 계정 매핑·서비스 세션은 선택된 주 DB에 저장한다.
[카카오 연결·인증 API 안내](../../docs/authentication.md)를 참고한다. `data/` 전체가 Git ignore 대상이다.

- API 상태: http://localhost:3000/v1/health
- 실행 Swagger: http://localhost:3000/docs
- OpenAPI JSON: http://localhost:3000/docs-json

외부 DB 설정과 실행 방법은 [실행 안내](../../docs/runtime-storage.md)를 참고한다.
`prisma/schema.prisma`가 공통 모델의 원본이다. SQLite 스키마는 생성 스크립트가 native DB 타입만 제거해 만든다.
PostgreSQL migration은 외부 DB에만 배포한다. SQLite 개발 DB는 데이터 손실 옵션 없이 db push한다.

## API 문서

- 실행 중인 `/docs`: Controller와 DTO에서 생성되는 최종 Swagger 문서
- 실행 중인 `/docs-json`: 클라이언트 생성과 CI 검증에 사용하는 OpenAPI JSON
- [`openapi.yaml`](./openapi.yaml): 전체 목표 API 계약과 요청·응답 schema
- [`docs/api-design.md`](./docs/api-design.md): API 공통 규칙, 권한, 주요 흐름과 구현 순서
- [`docs/api-catalog.md`](./docs/api-catalog.md): 기능별 API 전체 목록
- [`docs/implementation-status.md`](./docs/implementation-status.md): 현재 경로와 설계 차이

설계 중에는 `openapi.yaml`로 검토하고, API 구현·계약 검증을 마치면 Controller와 DTO에서 생성되는
문서를 해당 API의 최종 계약으로 사용한다. 현재 생성 문서에는 일부 DTO·응답 설명이 부족하다.
YAML과 코드를 서로 다른 최종 계약으로 관리하지 않는다.

## 명령

```bash
npm run dev:server
npm run build:server
npm run typecheck --workspace @moajam/server
npm run test --workspace @moajam/server
npm run prisma:studio --workspace @moajam/server
```

## 구현 원칙

- 모든 공개 API는 `/v1` 아래에 둔다.
- Workspace 데이터 경로에는 항상 `workspaceId`를 포함한다.
- 서버는 토큰의 사용자와 Workspace Membership을 모두 검증한다.
- 파일 데이터는 API 서버를 경유하지 않고 업로드 세션으로 Object Storage에 직접 전송한다.
- Stem 분리 같은 장시간 작업은 Job 리소스로 만들고 조회한다.
- 클라이언트가 재시도할 수 있는 생성·명령 API는 `Idempotency-Key`를 지원한다.
