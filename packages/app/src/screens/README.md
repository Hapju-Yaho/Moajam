# 화면 폴더 안내

화면은 서비스 영역과 하위 화면 깊이로 묶습니다. 파일 이름, export, 공개 URL은 유지하며 플랫폼별 파일과 CSS는 같은 폴더에 둡니다.

| 영역                | 폴더                                                   | 화면 / 경로                                                     |
| ------------------- | ------------------------------------------------------ | --------------------------------------------------------------- |
| 개인 홈·일정        | personal/                                              | PersonalScreen: /me, /me/rehearsals                             |
| 개인 연습           | personal/practice/                                     | PersonalPracticeScreen: /me/practice                            |
| 팀 관리             | personal/teams/                                        | TeamManagementScreen: /me/songs                                 |
| 밴드 홈             | band/                                                  | HomeScreen: /workspaces/:workspaceId                            |
| 멤버·일정           | band/members/, band/rehearsals/                        | /workspaces/:workspaceId/members, /rehearsals                   |
| 참여 곡             | band/songs/                                            | SongsScreen: /workspaces/:workspaceId/songs                     |
| 곡 상세             | band/songs/detail/                                     | SongWorkspaceScreen: /workspaces/:workspaceId/songs/:songId     |
| 곡 악보·연습        | band/songs/detail/score/, band/songs/detail/practice/  | BandScoreEditorScreen, PracticeScreen                           |
| 추천·추천 상세      | band/songs/recommendations/, recommendations/detail/   | RecommendationsScreen, RecommendationDetailScreen               |
| 밴드 연습           | band/practice/                                         | BandPracticeScreen                                              |
| 작업실·음악 도구    | tools/, tools/projects/                                | MusicToolsScreen, WorkManagementScreen: /tools, /tools/projects |
| 트랙·악기 추출      | tools/tracks/, tools/instrument-extractor/             | /tools/tracks, /tools/instrument-extractor                      |
| 개인 악보           | tools/scores/                                          | PersonalScoreEditorScreen: /tools/scores/personal               |
| 공통 악보 편집 화면 | shared/score-editor/                                   | 개인·밴드 악보에서 함께 쓰는 ScoreEditorScreen                  |
| 계정                | account/login/, account/onboarding/, account/settings/ | 로그인·온보딩·설정                                              |
| 도움말              | help/                                                  | HelpScreen: /help                                               |

폴더는 코드 소유 영역을 나타냅니다. URL을 변경하거나 새 라우트를 만들지 않습니다. 현재 추천 목록은 SongsScreen으로 연결되고, 곡 연습은 SongWorkspaceScreen의 tracks 탭으로 연결됩니다. 기존 보조 화면 파일도 해당 영역에 보존했습니다.

## 홈 데이터 흐름

[개인 홈](personal/PersonalScreen.tsx)과 [밴드 홈](band/HomeScreen.tsx)이 상태 조회, 필터링·정렬·집계, 탐색 콜백을 담당합니다. 공통 UI는 [components/home](../components/home/README.md)에 있습니다.

개인 홈의 밴드 생성 연결은 MainLayout의 BandCreateContext 아래에서 실행하는 PersonalHomeContent가 담당합니다. 공통 홈 카드에는 조회 훅을 넣지 않습니다. 달력과 알림은 각 screen에서 데이터와 범위를 연결한 뒤 홈 배치 컴포넌트에 전달합니다.

.web.tsx, 기본 .tsx와 .web.css는 함께 이동합니다. 플랫폼 모듈 선택을 유지하기 위해 웹 구현을 일반 파일에서 재노출하는 barrel은 사용하지 않습니다.

## 공통 레이아웃

`AppRouter`의 `ScopedLayout`이 `MainLayout`을 한 번만 렌더링합니다. 각 screen은 본문만 반환하며, 자체적으로 `MainLayout`을 감싸지 않습니다. 페이지 초기화용 key는 본문과 스크롤 영역에만 적용하므로 사이드바·상단바·프로필 이미지는 페이지 이동 중 유지됩니다. 메뉴·브레드크럼·동기화 버튼의 화면별 설정은 `components/shared/layout/main-layout/screenLayout.ts`에서 관리합니다.
