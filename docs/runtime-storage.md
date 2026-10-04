# 화면 API 연결과 DB 실행

## 로컬에서 실행

환경변수별 값과 목데이터/실제 API 전환은 [환경변수 안내](./environment.md)를 참고한다.

Node 22.13 이상을 사용한다. Docker나 Supabase 계정은 필요 없다.
저장소 루트에서 설치 후 두 터미널로 실행한다.

```sh
npm install
npm run dev:server
npm run dev:web
```

서버는 `apps/server/.env.local`, `.env` 순서로 읽는다. 파일이 없어도 로컬로 실행한다.
`DATABASE_URL`이 없거나 빈 문자열/공백이면 SQLite를 사용한다.
개발 서버 시작 시 두 Prisma Client를 생성하고 로컬 스키마를 적용한다.
데이터 손실을 허용하는 옵션은 사용하지 않으므로 파괴적인 스키마 변경은 자동 적용되지 않는다.

- `data/moajam.db`: 밴드, 멤버, 문서, 개인 악보·연습 세션·설정·일정, 자료와 작업 메타데이터, 카카오 계정 매핑과 서비스 세션
- `data/auth.db`: 브라우저/기기별 임시 계정과 만료 가능한 세션. 계정 복구 키·세션 토큰은 hash로 저장
- `data/files/`: 업로드한 실제 파일과 크기/MIME 메타데이터
- `data/` 전체는 Git ignore 대상이다. 서버를 끈 뒤 폴더 전체를 백업한다.

처음 접속하면 카카오 로그인 화면을 표시한다. `AUTH_MODE=kakao`가 기본값이며 키 설정은 DB 선택과 별개다.
명시적 개발 모드 `AUTH_MODE=temporary`에서만 자동 임시 로그인을 사용한다. [인증 안내](./authentication.md)를 참고한다.
웹은 기본 `/api/v1`을 Vite 프록시를 통해 서버 `3000` 포트로 전달한다.

## Supabase를 사용할 때

아래는 Supabase DB와 Supabase Storage를 함께 사용하는 구성이다. **Supabase DB + Cloudflare R2**를 사용하려면 [R2 연결 안내](./cloudflare-r2.md)의 저장소 환경변수와 CORS 설정을 적용한다.

`apps/server/.env.local`에 실제 PostgreSQL 연결 문자열을 설정하고 서버를 재시작한다.

```dotenv
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/postgres?sslmode=require
DIRECT_URL=postgresql://USER:PASSWORD@DIRECT_HOST:5432/postgres?sslmode=require
SUPABASE_URL=https://PROJECT.supabase.co
STORAGE_PROVIDER=supabase
SUPABASE_SECRET_KEY=...
MEDIA_BUCKET=moajam-private
```

`DATABASE_URL`은 PostgreSQL 주소이고 `SUPABASE_URL`은 Storage HTTPS 주소다.
`DIRECT_URL`은 외부 DB의 migration에만 적용하며 생략하면 DATABASE_URL을 쓴다.
DATABASE_URL이 비어 있으면 남아 있는 DIRECT_URL이나 Supabase 키로 외부 DB를 선택하지 않는다.
잘못된 URL이나 외부 연결 실패 시 오류를 표시하며 SQLite로 자동 전환하지 않는다.

빈 외부 개발 DB에 기존 migration을 적용한다. 이미 테이블이 있는 DB는 먼저 baseline을 확인한다.

```sh
npm run prisma:deploy --workspace @moajam/server
```

Supabase에 `moajam-private` 비공개 버킷을 만든다. 카카오 인증을 사용할 때는 별도로 서버 키와 Kakao Developers의 Redirect URI를 설정한다.
`AUTH_MODE=temporary`는 외부 DB에서도 개발용 임시 계정을 사용한다. 운영에서는 임시 인증을 허용하지 않는다.
웹과 모바일은 `/v1/config`에서 공개 설정을 읽는다. DB 주소와 secret/service-role 키는 내려가지 않는다.
배포한 웹은 `/api/v1` 역방향 프록시 또는 `VITE_API_URL`과 `CORS_ORIGINS`를 설정한다.
로컬 계정·파일·레코드를 Supabase로 자동 이관하지 않는다. DB 전환은 기존 데이터를 복사하지 않으며, 카카오 전환은 별도의 계정으로 로그인한다.

YouTube 제목 자동 입력도 API 서버를 거친다. 외부 조회가 실패하면 제목·아티스트를 직접 입력할 수 있다.

## 연결된 화면과 API

| 화면 / 기능                                | 조회                                | 변경 / 저장                                                  |
| ------------------------------------------ | ----------------------------------- | ------------------------------------------------------------ |
| 로그인·로그아웃                            | `/config`, `/auth/session`          | `POST /auth/kakao/authorize`, `/auth/kakao`, `/auth/logout`  |
| 프로필·오디오·알림 수신 선호               | `/me`, `/me/preferences`            | `PUT /me/preferences`, 이름도 같은 트랜잭션에서 반영         |
| 밴드 생성·전환·목록                        | `GET /workspaces`                   | `POST /workspaces`                                           |
| 초대 발급·참여·취소                        | `/workspaces/{id}/invitations`      | POST/DELETE 초대, `POST /invitations/accept`                 |
| 멤버 역할·파트·제거·탈퇴                   | 밴드 목록에 멤버 포함               | `PUT /workspaces/{id}/sync`, 본인 탈퇴 DELETE members        |
| 추천·좋아요·댓글·채택·곡 배정·준비 상태    | `/workspaces/{id}/documents`        | `PUT /workspaces/{id}/sync`                                  |
| 곡 의견·결정·편곡·체크·레퍼런스            | 같은 documents 조회                 | 같은 sync에 바뀐 문서를 함께 저장                            |
| 합주 일정·참석·메모·할 일·회고             | 같은 documents 조회                 | 같은 sync, 관리자/본인 권한 검사                             |
| 개인 일정                                  | `GET /me/schedules`                 | `PUT/DELETE /me/schedules/{id}`                              |
| 앱 내 알림·읽음·관리자 알림                | `GET /notifications`                | 읽음 POST, 밴드 reminders POST                               |
| 악보 편집                                  | `GET /me/documents/{encoded key}`   | PUT 본문·revision·기준 음원 참조. MusicXML 생성은 클라이언트 |
| 개인 연습 트랙·녹음·메모·웹 믹서/루프 설정 | 같은 개인 documents                 | 파일은 assets 업로드, 문서에는 파일 ID 참조만 저장           |
| 자료 추가·목록·다운로드·밴드 공개·삭제     | `/assets`, `/assets/{id}/download`  | uploads → 서명 업로드 → complete, visibility PATCH, DELETE   |
| 악기 추출 요청·상태·취소·재요청·결과       | `/separation-jobs`, assets download | POST 작업·cancel, 재요청은 새 작업 생성                      |

현재 밴드 저장 형식은 호환 JSON 문서다. 목표 OpenAPI의 정규화된 167개 API를 모두 구현했다는 뜻은 아니다.
실제 호출 가능한 문서는 [실행 Swagger](http://localhost:3000/docs), 경로 목록은
[구현 현황](../apps/server/docs/implementation-status.md)에 있다.

밴드 변경은 문서와 멤버 변경을 한 트랜잭션에 저장한다. 문서 revision이 오래되면 409로 거절한다.
화면에 미저장 변경이 없을 때 15초마다 밴드를 갱신하며, 수정 중에는 결과를 덮어쓰지 않는다.
개인 저장은 사용자·문서별 순서대로 처리하고 충돌 후 쓰기를 중단한다. 현재 내용을 보관한 뒤 다시 불러온다.
파일은 기본 비공개다. 밴드 공개는 별도 선택이고 다운로드 URL은 5분 후 만료된다.

## 모바일과 데모

`apps/mobile/.env.example`을 참고한다. Android 에뮬레이터에서는 `http://10.0.2.2:3000/v1`,
실기기에서는 PC의 LAN 주소를 `EXPO_PUBLIC_API_URL`로 설정한다. PC 서버 접근이 가능해야 한다.
모바일도 로그인·설정·일정·협업·자료·개인 악보·녹음·추출 API를 사용한다.
플랫폼별 편집·재생 UI의 범위는 다르며 실기기 녹음·재생은 별도 검증 대상이다.

샘플 데이터만 볼 때는 웹 `apps/web/.env.local`에 `VITE_USE_MOCK_DATA=true`,
모바일 `apps/mobile/.env.local`에 `EXPO_PUBLIC_USE_MOCK_DATA=true`를 지정한다.
이때 백엔드는 실행하지 않아도 된다. 웹은 `npm run dev:web`만 실행한다.
목데이터 모드에서는 샘플 밴드·곡을 사용하고 변경 내용을 기기/브라우저에 보관한다.
서버 초대·리마인드 전송·음원 분리 기능은 실제 서버 모드에서만 제공한다.
`false` 또는 미설정이면 실제 API를 사용한다. 환경변수 변경 후 개발 서버를 재시작한다.
기존 `VITE_DEMO_MODE` / `EXPO_PUBLIC_DEMO_MODE`도 호환용으로 유지하지만 새 변수가 있으면 새 값이 우선한다.
환경변수가 없다는 이유로 샘플 모드에 들어가지 않는다. 기존 브라우저 샘플 기록은 자동 업로드하지 않는다.

## 검증과 추가 실행 요건

```sh
npm run typecheck
npm run test --workspace @moajam/server
npm run test:integration --workspace @moajam/server
node --test scripts/collaboration.test.mjs scripts/workspace.test.mjs scripts/personal-store.test.mjs scripts/auth-client.test.mjs
node --test scripts/mock-storage.test.mjs
npm run build
npm run docs:check
```

통합 테스트는 `data/api-test-*` 아래 독립 DB를 만들고 완료 후 제거한다. 두 계정 격리, 초대,
마지막 Owner 보호, 일괄 저장 롤백, 개인 기록 충돌, 파일 권한, 재시작 후 보존을 검사한다.
Supabase 운영 프로젝트를 건드리지 않는다.

음원 분리 API는 연결되어 있으나 실제 처리는 Python·FFmpeg·Demucs와 `ENABLE_MEDIA_WORKER=true`가 필요하다.
기본 false일 때 503과 설명을 반환한다. 현재는 선택 악기+나머지의 two-stem 처리다.
푸시·이메일·자동 예약 알림은 수신 선호 저장까지 연결했으며 발송 서비스는 아직 없다.
이메일·비밀번호 인증은 제공하지 않는다. 외부 Supabase 실연동과 모바일 실기기는 아직 검증하지 않았다.

SQLite 연결 구현은 [Prisma SQLite 안내](https://www.prisma.io/docs/orm/v7/core-concepts/supported-databases/sqlite)를 참고했다.
