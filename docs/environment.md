# 환경변수와 실행 모드

현재 웹 설정은 실제 API, 서버 기본값은 SQLite + 카카오 로그인이다. 실제 키는 사용자가 입력한다. 각 앱의 `.env.local`은 Git에서 제외된다. 다른 PC에서는 `.env.example`을 복사하고, 변경 후 개발 서버를 재시작한다.

## 웹

`apps/web/.env.local`:

```dotenv
VITE_USE_MOCK_DATA=false
VITE_API_URL=/api/v1
```

`VITE_USE_MOCK_DATA=true`이면 백엔드와 로그인 없이 목데이터를 사용하고 추가·수정·삭제를 브라우저에 저장한다. false 또는 생략하면 실제 API를 사용한다. [mocks 폴더 안내](../packages/app/src/mocks/README.md)를 참고한다. 두 모드의 데이터는 자동 이관되지 않는다.

`VITE_API_URL` 기본값은 `/api/v1`이며 개발 Vite가 `localhost:3000/v1`로 전달한다. 배포 시 API 주소 또는 같은 도메인의 역방향 프록시 경로를 사용한다. 카카오 키·DB 비밀번호·서비스 서명 키는 프론트에 넣지 않는다. 웹 콜백은 현재 origin + `/auth/kakao/callback`으로 계산된다.

## 서버

`apps/server/.env.local`:

```dotenv
NODE_ENV=development
PORT=3000
DATABASE_URL=
AUTH_MODE=kakao
KAKAO_REST_API_KEY=
KAKAO_CLIENT_SECRET=
KAKAO_ALLOWED_REDIRECT_URIS=http://localhost:5173/auth/kakao/callback,http://127.0.0.1:5173/auth/kakao/callback
AUTH_JWT_SECRET=
AUTH_ACCESS_TOKEN_TTL_SECONDS=3600
CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
ENABLE_MEDIA_WORKER=false
```

| 변수                          | 입력할 값                                                                   |
| ----------------------------- | --------------------------------------------------------------------------- |
| KAKAO_REST_API_KEY            | Kakao Developers 앱의 REST API 키                                           |
| KAKAO_CLIENT_SECRET           | 해당 REST API 키의 활성화된 Client Secret                                   |
| KAKAO_ALLOWED_REDIRECT_URIS   | 카카오에도 등록한 정확한 프론트 콜백 URL. 여러 개는 쉼표 구분. 운영은 HTTPS |
| AUTH_JWT_SECRET               | 직접 생성한 최소 32바이트 무작위 비밀값. 서버에만 저장                      |
| AUTH_ACCESS_TOKEN_TTL_SECONDS | 서비스 토큰 수명. 기본 3600초, 허용 60~86400초                              |
| AUTH_MODE                     | 기본 kakao. temporary는 명시적인 개발용 임시 인증                           |
| DATABASE_URL                  | 비어 있으면 data/moajam.db SQLite. 설정하면 외부 PostgreSQL 연결 문자열     |
| DIRECT_URL                    | 외부 DB migration용 연결 문자열. 생략하면 DATABASE_URL                      |
| SUPABASE_URL                  | 외부 파일 Storage 사용 시 https://PROJECT.supabase.co                       |
| SUPABASE_SECRET_KEY           | 외부 Storage의 서버 전용 secret/service-role 키                             |
| MEDIA_BUCKET                  | 외부 비공개 버킷. 기본 moajam-private                                       |
| CORS_ORIGINS                  | 허용할 프론트 origin을 쉼표로 구분                                          |
| PUBLIC_API_URL                | 로컬 파일 링크를 외부 기기에서 열 때 도달 가능한 전체 API 주소              |
| ENABLE_MEDIA_WORKER           | 실제 음원 분리를 할 때 true. Python·FFmpeg·Demucs 필요                      |
| MEDIA_PYTHON                  | 미디어 처리용 Python 실행 파일. 기본 python                                 |

`SUPABASE_PUBLISHABLE_KEY`는 카카오 로그인에 필요 없다. DB 선택과 인증 선택은 독립적이다. SQLite에서도 카카오 로그인이 동작한다. 개발에서 키가 비어 있으면 로그인 화면은 표시되고 로그인 시 설정 오류가 안내된다. 운영에서는 필수 인증 설정 누락과 temporary 모드를 거부한다.

카카오 개발자 콘솔 등록 방법, 서명 키 생성, 요청/응답은 [인증 안내](./authentication.md)를 따른다.

## 실행

두 터미널에서 각각 실행한다.

```sh
npm run dev:server
npm run dev:web
```

서버 시작 시 로컬 스키마를 준비한다. SQLite와 카카오 계정·세션은 `data/moajam.db`, 파일은 `data/files/`, 명시적 임시 인증 데이터는 `data/auth.db`에 저장된다. `data/`는 Git에서 제외된다. [실행 Swagger](http://localhost:3000/docs)에서 API를 확인한다.

목데이터를 사용할 때는 `VITE_USE_MOCK_DATA=true`로 변경하고 `npm run dev:web`만 실행한다.

## 모바일

`apps/mobile/.env.local`에는 `EXPO_PUBLIC_USE_MOCK_DATA=false`, 기기에서 접근할 수 있는 `EXPO_PUBLIC_API_URL`, 카카오에 등록한 `EXPO_PUBLIC_KAKAO_REDIRECT_URI=https://웹주소/auth/kakao/mobile-callback`을 설정한다. HTTPS 콜백 웹 페이지와 `moajam` scheme이 등록된 앱 빌드가 필요하다. 실제 리다이렉트 흐름은 [인증 안내](./authentication.md#모바일)를 참고한다. 목데이터는 `EXPO_PUBLIC_USE_MOCK_DATA=true`이며 저장에는 기기 저장소를 사용한다.
