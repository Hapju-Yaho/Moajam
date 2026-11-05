# 화면별 컴포넌트와 디자인 수정 위치

화면 진입 파일은 [screens 안내](../screens/README.md)를 참고하세요. 개인·밴드 홈은 [home 안내](home/README.md)에서 함께 관리합니다.

| 화면         | 관련 컴포넌트                  |
| ------------ | ------------------------------ |
| 개인·밴드 홈 | [home/](home/README.md)        |
| 연습·녹음    | [practice/](practice/)         |
| 곡 상세      | [song-detail/](song-detail/)   |
| 악보 편집    | [score-editor/](score-editor/) |
| 설정         | [settings/](settings/)         |

개인 홈 데이터·필터는 [PersonalScreen](../screens/personal/PersonalScreen.tsx), 밴드 홈 데이터·관리 동작은 [HomeScreen](../screens/band/HomeScreen.tsx)에서 준비합니다. 공통 홈 컴포넌트의 표시 데이터는 props로 전달합니다.

MainLayout의 메뉴·모달·도움말을 수정할 때는 [MainLayout 모듈 안내](shared/layout/main-layout/README.md)를 참고하세요.

## 공통 요소

| 폴더                                           | 내용                                                                          |
| ---------------------------------------------- | ----------------------------------------------------------------------------- |
| [shared/layout/](shared/layout/)               | 상단바·사이드바·드로워·하단 메뉴, 밴드 전환·생성·가입, 서버 새로고침          |
| [shared/ui/](shared/ui/)                       | `ProductUI`의 카드·버튼·타이포그래피, 프로필 사진, 파트 선택, 공통 다이얼로그 |
| [shared/icons/](shared/icons/)                 | 웹·네이티브 아이콘                                                            |
| [shared/schedule/](shared/schedule/)           | 달력, 일정 목록·등록·수정, 날짜·시간 입력                                     |
| [shared/notifications/](shared/notifications/) | 최근 알림 목록과 상단 알림 패널                                               |
| [shared/media/](shared/media/)                 | 영상·음원·가사·PDF·악보 뷰어와 자료·클립 보관함                               |
| [shared/discussion/](shared/discussion/)       | 의견·댓글 입력, 댓글 영상 첨부                                                |
| [shared/band/](shared/band/)                   | 밴드 설정과 멤버 초대                                                         |
| [shared/songs/](shared/songs/)                 | 곡 카드와 순서 변경 목록                                                      |
| [shared/help/](shared/help/)                   | 화면 도움말 버튼·컨텍스트와 가이드 투어                                       |

## 스타일 파일과 플랫폼 구분

- `.web.tsx`는 웹 전용 구현, 같은 이름의 `.tsx`는 네이티브/기본 구현입니다. 두 파일이 있으면 플랫폼별 변경 범위를 확인하세요.
- 컴포넌트의 `.web.css`는 해당 컴포넌트와 같은 폴더에 두었습니다. 여러 컴포넌트가 공유하는 CSS도 함께 옮기고 import를 연결했습니다.
- `screens/`에 있던 화면 전용 CSS는 해당 화면 파일 옆에 유지했습니다.
- 전체 페이지 여백과 기본 레이아웃은 [styles/layout.ts](../styles/layout.ts), 앱 셸 배치는 [MainLayout.tsx](shared/layout/MainLayout.tsx)에서 확인합니다.
- 웹 전역 스타일은 `apps/web/src/styles.css`, 웹 음악 도구의 모바일 보정은 `apps/web/src/mobile.css`에 있습니다.
- 공통 테마는 `packages/ui/src/`에 있습니다.

현재 공통 메뉴 기준은 모바일 `<768px`, 태블릿 `768~1024px`, 데스크톱 `>1024px`입니다.

새 컴포넌트는 전용 화면 폴더에 두고, 다른 화면에서도 동일한 역할로 사용하게 되면 `shared/`의 해당 기능 폴더로 옮깁니다. `.web` 구현을 일반 파일로 다시 내보내는 통합 barrel은 추가하지 않아 플랫폼별 모듈 선택을 유지합니다.

## 스타일 작성 규칙

- React Native 요소와 공통 UI는 `@emotion/native`의 styled 컴포넌트로 작성합니다. 웹 전용 HTML·SVG는 `@emotion/styled`를 사용합니다.
- styled 선언은 렌더 함수 밖에 두고, 화면 크기·선택·열림 상태는 타입이 있는 `$` props로 전달합니다. Native에서는 `shouldForwardProp`으로 스타일 전용 props를 제외합니다.
- JSX 안에서 스타일 객체를 만들지 않습니다. 컴포넌트별 styled 선언은 해당 파일에, 공유 배치와 홈 규격은 `styles/layout.ts`, `home/home.styles.ts`에 있습니다.
- 기존 기본 스타일을 확장할 때 여백·테두리는 방향별 속성을 사용합니다. React Native Web에서 shorthand와 longhand의 우선순위가 달라지는 것을 방지합니다.
- `contentContainerStyle`은 Emotion Native의 `css` 선언을 연결합니다. 재사용 컴포넌트의 `style={style}` 전달, 네이티브 Animated 값, 실제 좌표 측정·드래그 보정은 런타임 바인딩으로 유지합니다.
- 눌림 상태가 필요한 컴포넌트는 `withPressFeedback`으로 `$pressed`를 받고, 사용자 이벤트 핸들러와 ref를 전달합니다.
