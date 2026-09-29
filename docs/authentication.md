# 카카오 로그인

기본 인증은 카카오 로그인이다. 프론트가 카카오에서 받은 **인가 코드**와 해당 요청에 사용한 **redirect URI**를 백엔드에 보내면, 백엔드가 카카오 토큰 교환·사용자 조회 후 **Moajam access token(JWT)**을 발급한다. Supabase는 외부 DB/Storage 선택지이며 로그인에는 사용하지 않는다.

## 설정과 실행

`apps/server/.env.local`에 다음을 설정한다. 이 파일은 Git에서 제외된다.

```dotenv
AUTH_MODE=kakao
KAKAO_REST_API_KEY=카카오_REST_API_키
KAKAO_CLIENT_SECRET=카카오_Client_Secret
KAKAO_ALLOWED_REDIRECT_URIS=http://localhost:5173/auth/kakao/callback,http://127.0.0.1:5173/auth/kakao/callback
AUTH_JWT_SECRET=충분히_긴_무작위_비밀값_최소_32바이트
AUTH_ACCESS_TOKEN_TTL_SECONDS=3600
DATABASE_URL=
```

`AUTH_JWT_SECRET`은 카카오에서 받는 값이 아니라 직접 생성하는 서버 서명 키다. 예시 문구를 그대로 사용하지 않는다. 저장소 루트에서 `node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"`로 생성할 수 있다. 프론트에 넣지 않는다.

1. Kakao Developers 앱에서 카카오 로그인을 활성화한다.
2. REST API 키와 활성화한 Client Secret을 서버 env에 입력한다. JavaScript 키나 Admin 키를 넣지 않는다.
3. 카카오 Redirect URI 설정에 위 콜백 주소를 각각 등록한다. 실제로 사용하는 주소만 서버 허용 목록에도 등록한다.
4. 닉네임을 사용하려면 프로필 동의 항목을 설정한다. 응답에 닉네임이 없어도 기본 이름으로 가입하며, 이메일은 요구하지 않는다.
5. 웹 `apps/web/.env.local`은 아래와 같이 설정하고 서버·프론트를 재시작한다.

```dotenv
VITE_USE_MOCK_DATA=false
VITE_API_URL=/api/v1
```

```sh
npm run dev:server
npm run dev:web
```

웹은 **현재 `window.location.origin` + `/auth/kakao/callback`**을 사용한다. 포트가 5174로 바뀌면 `http://localhost:5174/auth/kakao/callback`도 카카오와 서버 양쪽에 등록해야 한다. 배포 시 실제 HTTPS 주소를 등록하고 호스팅 서버가 이 경로에 웹 앱을 제공하도록 SPA fallback을 설정한다. API와 웹 도메인이 다르면 서버 `CORS_ORIGINS`도 설정한다.

개발 환경에서 키가 비어 있어도 서버와 로그인 화면은 열린다. 로그인 요청은 설정 필요 오류(503)를 표시한다. 운영에서는 필수 설정 누락 시 서버 시작을 거부한다. `AUTH_MODE=temporary`는 명시적 개발 옵션이며 운영에서는 사용할 수 없다. 목데이터 모드가 true이면 기존처럼 서버 로그인 없이 샘플을 사용한다.

## API 계약

공통 prefix는 `/v1`. 실행 가능한 요청·응답 모델은 [Swagger](http://localhost:3000/docs)에 있다.

| Method | 경로                  | 동작                                                                                               |
| ------ | --------------------- | -------------------------------------------------------------------------------------------------- |
| GET    | /config               | authMode, authProvider, kakaoLoginEnabled, temporaryLoginEnabled, mediaWorkerEnabled. 비밀 키 제외 |
| POST   | /auth/kakao/authorize | `{ redirectUri }` → `{ authorizationUrl, state, expiresIn: 600 }`                                  |
| POST   | /auth/kakao           | `{ code, redirectUri }` → 서비스 JWT·사용자, 최초 로그인 시 프로필 생성                            |
| GET    | /auth/session         | Bearer 인증 → `{ id, provider: "kakao" }`                                                          |
| POST   | /auth/logout          | Bearer 인증 → 현재 서비스 세션 폐기, `{ ok: true }`                                                |

로그인 요청:

```http
POST /v1/auth/kakao
Content-Type: application/json

{
  "code": "카카오_콜백의_일회용_인가_코드",
  "redirectUri": "http://localhost:5173/auth/kakao/callback"
}
```

200 응답:

```json
{
  "accessToken": "Moajam_JWT",
  "tokenType": "Bearer",
  "expiresIn": 3600,
  "expiresAt": 1790650000000,
  "user": { "id": "서비스_사용자_UUID", "provider": "kakao" }
}
```

이후 요청은 `Authorization: Bearer <accessToken>`을 사용한다. `expiresAt`은 Unix milliseconds, `expiresIn`은 초다. 카카오 자체 access/refresh token은 프론트로 반환하거나 DB에 저장하지 않는다.

오류: 400은 허용되지 않은 redirect URI, 401은 잘못되거나 만료된 코드/서비스 토큰, 422는 요청 필드 검증 실패, 503은 로그인 미설정·카카오 통신 실패다. 카카오 취소·state 불일치·10분 경과 시 프론트에서 교환을 중단하고 다시 로그인하게 한다.

## 로그인 흐름과 저장

1. 프론트는 현재 콜백 주소로 `/auth/kakao/authorize`를 호출한다.
2. 반환된 state와 redirect URI를 웹 sessionStorage(탭별), 모바일 AsyncStorage에 보관하고 카카오 인가 URL을 연다.
3. 콜백에서 주소·state·만료를 검사하고 저장한 요청을 소모한다. 코드와 원래 redirect URI를 `/auth/kakao`에 한 번만 보낸다. 콜백 처리 후 URL에서 코드와 state를 제거한다.
4. 서버는 허용된 redirect URI만 사용해 카카오 토큰 API와 사용자 API를 호출한다. `(provider, providerUserId)`로 사용자를 찾고, 처음이면 UUID 프로필을 생성한다.
5. 서버는 HS256 JWT와 DB 세션을 생성한다. API마다 서명·issuer·audience·만료·DB 세션을 확인한다.
6. 프론트는 서비스 세션을 웹 localStorage 또는 모바일 AsyncStorage에 저장한다. 로그아웃 시 서버 세션과 클라이언트 세션을 삭제한다. 카카오 계정 자체의 로그인 상태는 유지된다.

토큰 기본 수명은 1시간이며 현재 refresh API는 제공하지 않는다. 만료/401이면 로그인 화면으로 돌아간다. 같은 카카오 사용자로 다시 로그인하면 기존 서비스 데이터에 접근한다. 탭을 새로 열거나 새로고침해도 유효한 서비스 세션은 유지된다.

`auth_identities`는 카카오 사용자 ID와 Profile UUID의 대응, `auth_sessions`는 세션 ID·사용자·만료를 저장한다. 두 테이블은 선택된 주 DB(SQLite 또는 PostgreSQL)에 있다. 기존 임시/Supabase 인증 계정과 자동 병합하지 않는다. 기존 데이터는 삭제하지 않는다.

## 모바일

`apps/mobile/.env.local`의 `EXPO_PUBLIC_KAKAO_REDIRECT_URI`에 웹이 제공하는 **HTTPS `/auth/kakao/mobile-callback` 주소**를 넣는다. 서버 허용 목록과 카카오에도 동일하게 등록한다. 이 웹 페이지는 code/state를 고정된 `moajam://auth/callback`으로 돌려주고 앱이 위 API 교환을 수행한다. 서버에는 원래 HTTPS redirect URI를 보낸다.

`moajam` scheme이 등록된 개발/배포 앱 빌드와 접근 가능한 HTTPS 웹 주소가 필요하다. Expo Go 대신 해당 빌드에서 확인한다. 실제 카카오 키를 넣은 웹 로그인과 모바일 실기기 리다이렉트는 별도 검증이 필요하다.

## 개발용 임시 계정

명시적 `AUTH_MODE=temporary`에서는 기존 자동 임시 로그인을 유지한다. `POST /auth/temporary`는 `{}`로 새 계정을, `{ resumeKey }`로 기존 계정의 7일 세션을 발급한다. `POST /auth/temporary/logout` 또는 공통 `/auth/logout`으로 폐기한다. 카카오 모드에서 임시 로그인은 404다. 복구 키·토큰은 서버 `data/auth.db`에 hash로 저장하며, 브라우저의 복구 키는 로그아웃 후에도 유지한다.

공식 참고: [카카오 로그인 REST API](https://developers.kakao.com/docs/ko/kakaologin/rest-api), [카카오 로그인 설정](https://developers.kakao.com/docs/ko/kakaologin/prerequisite).

## 첫 로그인 프로필 설정

로그인 후 프론트는 `GET /v1/me/onboarding`으로 완료 여부를 확인한다. `completed=false`이면 서비스 화면 대신 이름·사진·담당 세션 설정을 표시한다. 완료 기록이 없는 기존 사용자도 한 번 설정하며, 완료 후 재로그인·새로고침 시 생략한다. 목데이터 모드는 기존처럼 바로 진입한다.

`PUT /v1/me/onboarding`은 Bearer 인증으로 본인의 프로필을 저장한다.

```json
{
  "displayName": "민지",
  "photo": "",
  "parts": ["VOCAL", "GUITAR"]
}
```

이름은 공백을 제거한 1~~80자이며, 세션은 VOCAL·GUITAR·BASS·DRUMS·KEYBOARD·OTHER 중 중복 없이 1~~6개를 선택한다. 사진은 선택 사항으로 빈 문자열 또는 PNG/JPEG/WebP의 base64 data URL이다. 최대 500KB이며 MIME과 파일 헤더를 확인한다. 웹과 모바일 파일 선택기에서 사진을 선택·미리보기·제거할 수 있다. 사진은 기존 프로필 설정 저장 방식에 맞춰 주 DB에 보관한다.

GET/PUT 응답은 `{ displayName, photo, parts, completed, completedAt }`이다. PUT은 프로필과 preferences를 하나의 트랜잭션으로 저장하고 최초 완료 시각을 유지한다. 본문에 사용자 ID를 받지 않는다. 이름·사진·세션은 이후 설정 화면에서 수정할 수 있으며 밴드별 배정 파트는 별도로 유지한다.
