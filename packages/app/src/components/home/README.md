# 홈 공통 컴포넌트

개인·밴드 홈 UI를 이 폴더에서 함께 관리합니다. 화면 데이터는 screens/personal/PersonalScreen.tsx와 screens/band/HomeScreen.tsx에서 준비해 props로 전달합니다.

| 수정할 부분                   | 파일                                               | 입력                                                        |
| ----------------------------- | -------------------------------------------------- | ----------------------------------------------------------- |
| 제목·설명·사진·상단 버튼      | [HomeHeader](HomeHeader.tsx)                       | title, description, photo, actions                          |
| 다가오는 일정·다음 합주       | [HomeUpcomingCard](HomeUpcomingCard.tsx)           | events, featured, title, 탐색·등록 콜백                     |
| 연습할 곡                     | [HomeSongsCard](HomeSongsCard.tsx)                 | songs, title, onOpenSong, onViewAll                         |
| 달력·보조 카드 배치와 높이    | [HomeScheduleSection](HomeScheduleSection.tsx)     | calendar, renderSidebar, stacked, sidebarFirst              |
| 개인 홈 섹션 순서·반응형 배치 | [PersonalHomeDashboard](PersonalHomeDashboard.tsx) | bands, stats, upcoming, songs, filters, 달력·알림 렌더 함수 |
| 내 밴드                       | [HomeBandsSection](HomeBandsSection.tsx)           | bands, onOpenBand, onCreateBand                             |
| 요약 통계                     | [HomeSummary](HomeSummary.tsx)                     | stats                                                       |
| 여백·간격·모서리              | [home.styles.ts](home.styles.ts)                   | homeLayout                                                  |
| 표시용 데이터 타입            | [home.types.ts](home.types.ts)                     | HomeBand, HomeSong, HomeStat                                |

공통 컴포넌트는 표시·배치만 담당합니다. 화면에 표시할 곡 수, 일정 필터, 밴드 멤버 수와 내 파트, 통계 값은 screen에서 결정합니다. 컴포넌트 내부에는 화면 폭·측정 높이 같은 UI 상태만 둡니다.

개인 홈은 내 밴드가 다가오는 일정 위에 있으며, 모바일에서는 최근 알림을 달력보다 먼저 배치합니다. 밴드 홈의 다음 합주 강조 카드와 일정 목록은 같은 HomeUpcomingCard의 featured 속성으로 구분합니다.

달력의 일정 등록·수정과 알림의 읽음 처리 기능은 기존 shared/schedule, shared/notifications 컴포넌트를 사용합니다. screen이 이 컴포넌트에 데이터·workspaceId를 연결해 공통 배치에 전달합니다.
