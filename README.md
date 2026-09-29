# Moajam

> 각자의 소리를 모아, 우리의 음악으로.

밴드와 합주팀이 곡 추천부터 개인 연습, 합주 결정 기록까지 하나의 곡 중심
Workspace에서 관리하는 협업 플랫폼입니다.

## 시작하기

```bash
npm install
# 각각 다른 터미널에서 실행
npm run dev:server
npm run dev:web
# 모바일을 사용할 때
npm run dev:mobile
```

서버는 기본 `http://localhost:3000`에서 실행되고, [Swagger](http://localhost:3000/docs)에서 API를 확인할 수 있습니다.
별도 DB 설정이 없으면 `data/moajam.db` SQLite를 자동으로 준비합니다.
기본 인증은 카카오 로그인입니다. [카카오 키·Redirect URI 설정](./docs/authentication.md)을 완료한 뒤 이용하세요.

백엔드 없이 목데이터로 프론트만 실행하려면 `apps/web/.env.local`에 다음 값을 넣고 `npm run dev:web`을 실행하세요.
환경변수를 바꾼 뒤에는 프론트 개발 서버를 재시작해야 합니다.

```dotenv
VITE_USE_MOCK_DATA=true
```

`false` 또는 미설정이면 실제 API를 사용합니다. 목데이터 변경은 브라우저에 보관되며 실제 DB에 저장되지 않습니다.
모바일은 `apps/mobile/.env.local`에 `EXPO_PUBLIC_USE_MOCK_DATA=true`를 설정합니다.

전체 타입 검사와 코드 품질 검사는 다음 명령으로 실행합니다.

```bash
npm run typecheck
npm run lint
npm run format:check
```

구조와 개발 원칙은 [`docs`](./docs/README.md)에서 확인할 수 있습니다.

백엔드 개발 전 데이터 구조와 API는 [백엔드 설계 안내](./docs/backend-design.md)를 참고하세요.
`npm run docs:api`로 DB 없이 [설계 Swagger](http://127.0.0.1:3001)를 열 수 있습니다.
`npm run docs:check`는 명세와 API 목록의 일치를 확인합니다.

기본 DB는 `data/moajam.db`의 SQLite입니다. 서버 `DATABASE_URL`이 있으면 Supabase PostgreSQL을 사용합니다.
[환경 설정·화면/API 연결·검증 안내](./docs/runtime-storage.md)를 참고하세요.

각 환경변수에 넣을 값은 [환경변수 안내](./docs/environment.md), 목데이터 원본과 저장 방식은
[mocks 폴더 안내](./packages/app/src/mocks/README.md)에 정리되어 있습니다.
