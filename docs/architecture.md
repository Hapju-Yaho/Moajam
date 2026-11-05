# 프런트엔드 아키텍처

## 모노레포

```text
apps/
  web/       Vite, React Router DOM, react-native-web
  mobile/    React Native, Expo
packages/
  app/       공유 Provider와 Screen 조합
    src/
      components/  화면별 UI와 shared/ 공통 컴포넌트
      screens/     영역·하위 화면 깊이별 웹·모바일 공통 화면
      styles/      화면 레이아웃과 공통 스타일
      mocks/       API 연결 전 목 데이터
  api/       API 경계, TanStack Query 설정과 query options
  domain/    플랫폼 독립 도메인 타입과 규칙
  ui/        Emotion Native 기반 디자인 토큰과 공통 컴포넌트
docs/        제품·도메인·기술 기준 문서
```

## 공유 원칙

- Screen과 기능 컴포넌트는 기본적으로 `packages/app`에 작성한다.
- Button, Card, Badge와 디자인 토큰은 `packages/ui`에 작성한다.
- 서버 데이터 접근은 `packages/api`의 query options를 통한다.
- 웹은 `react-native`를 `react-native-web`으로 치환하므로 공통 UI를 그대로 렌더링한다.
- 브라우저 URL, 파일 선택, 오디오 엔진 등 플랫폼 API만 `apps/*` 또는 `.web/.native` 파일에 둔다.
- `packages/domain`은 React와 네트워크 라이브러리에 의존하지 않는다.

## 오디오·악보 경계

- `packages/app`은 Player, Mixer, 악보 Viewer, Take 목록의 공통 상태와 화면 조합을 가진다.
- 실제 재생·녹음·마이크 권한·파일 선택은 `AudioEngine`과 `RecordingEngine` 인터페이스 뒤에서
  `.web/.native` 구현으로 분리한다.
- 공통 Player 상태는 `timelineSourceId`, `timeMs`, `durationMs`, `playbackRate`, `loopRange`를
  기준으로 하며 악보, Waveform, Comment, Take가 같은 시각을 구독한다.
- 악보 렌더러는 페이지 표시와 Sync Point 탐색만 담당하고 오디오 재생 상태를 직접 소유하지 않는다.
- Stem 분리는 비동기 서버 Job이다. 클라이언트는 TanStack Query로 진행 상태를 polling하고 완료 후
  Source 목록을 무효화한다.
- 대용량 음원과 녹음 파일은 화면 state에 보관하지 않고 업로드 세션과 서버 메타데이터로 관리한다.

## 개인 작업실 경계

- 개인 작업실 Query key에는 `userId + personalProjectId`를 포함하고 Workspace 캐시와 분리한다.
- 내 악기 추출은 서버 Job으로 처리한다. 클라이언트는 저용량 Preview와 Waveform, 악기별 우세도,
  Clipping·Noise·Bleed 품질 지표를 받는다.
- 자동 감지 결과보다 사용자가 선택한 Target Instrument를 우선하며, 재처리는 원본 Object를 재사용한다.
- 악보 편집 UI는 `packages/app`에 두되, Canvas 입력·인쇄·파일 내보내기 구현은 `.web/.native` 경계로
  분리한다.
- 구조화 악보 Document는 화면 컴포넌트가 직접 변경하지 않고 Command와 Revision 계층을 거친다.
- 기준 음원 재생은 공통 `AudioEngine`을 재사용하고 Score Cursor가 같은 `timeMs`를 구독한다.
- Workspace 복사는 개인 프로젝트를 연결하는 동기화가 아니라 새 Resource를 만드는 API 명령이다.

## 상태 구분

- 서버 상태: TanStack Query
- 화면 내부의 짧은 상호작용 상태: React state
- URL로 표현할 수 있는 웹 화면 상태: React Router DOM
- 전역 클라이언트 상태 저장소는 실제 교차 화면 요구가 생길 때만 도입한다.

## API 방향

현재 API 패키지는 화면 개발을 위한 mock gateway를 사용한다. 백엔드가 준비되면 같은 함수 계약을
HTTP 구현으로 교체한다. Query key는 Workspace와 Song 식별자를 항상 포함해 팀 간 캐시가 섞이지
않도록 한다.

화면별 컴포넌트와 디자인 수정 위치는 [컴포넌트 안내](../packages/app/src/components/README.md)를 참고하세요.

화면 폴더 깊이와 진입 파일은 [Screen 안내](../packages/app/src/screens/README.md), 홈 공통 UI와 데이터 경계는 [홈 컴포넌트 안내](../packages/app/src/components/home/README.md)를 참고하세요.

## Import alias

| Alias          | 실제 경로                       |
| -------------- | ------------------------------- |
| `@component/*` | `packages/app/src/components/*` |
| `@lib/*`       | `packages/app/src/lib/*`        |
| `@mocks/*`     | `packages/app/src/mocks/*`      |
| `@screens/*`   | `packages/app/src/screens/*`    |
| `@state/*`     | `packages/app/src/state/*`      |
| `@styles/*`    | `packages/app/src/styles/*`     |
| `@assets/*`    | `packages/app/assets/*`         |

예: `import { HomeHeader } from '@component/home/HomeHeader';`, `import logo from '@assets/logo.png';`

다른 폴더의 파일은 위 별칭을 사용하고, 같은 폴더 파일은 `./HomeHeader`처럼 상대 경로를 유지합니다. src 루트의 navigation.ts 같은 파일은 `@app/navigation`을 사용합니다. `@moajam/ui`, `@moajam/domain` 등 워크스페이스 패키지 이름은 유지합니다.

웹 DOM의 이미지 URL이 필요한 경우 `@assets/help/audio-track.png?url`처럼 가져옵니다. React Native Image의 source에는 `@assets/logo.png`를 그대로 사용합니다. Expo app.json의 icon 등 설정 파일 경로는 Metro import가 아니므로 기존 상대 경로를 유지합니다.

TypeScript는 루트 tsconfig.base.json, 웹은 apps/web/vite.config.ts, 모바일은 apps/mobile/metro.config.js에서 해석합니다. 확장자 없는 import는 기존 플랫폼별 선택 규칙을 따릅니다. scripts/load-typescript.mjs의 단위 테스트 로더는 tsconfig의 paths를 읽습니다. Metro 설정 변경 후에는 실행 중인 Expo 개발 서버를 재시작합니다.
