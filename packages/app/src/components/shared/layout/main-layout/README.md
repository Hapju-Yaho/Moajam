# MainLayout 수정 위치

MainLayout.tsx는 데이터 조회, 모달 열림 상태, 반응형 조건, 화면 조합과 Context 연결을 담당합니다. 외부에서 사용하는 MainLayout props와 경로는 유지했습니다.

| 수정할 대상                         | 파일                                                                         |
| ----------------------------------- | ---------------------------------------------------------------------------- |
| 전체 조합·반응형 기준·페이지 여백   | [MainLayout.tsx](../MainLayout.tsx)                                          |
| 상단바·브레드크럼·알림 버튼         | [MainLayoutTopbar.tsx](MainLayoutTopbar.tsx)                                 |
| 사이드바 섹션 배치                  | [MainLayoutSidebar.tsx](MainLayoutSidebar.tsx)                               |
| 개인·밴드 메뉴와 곡 하위 목록       | [ShellNavList.tsx](ShellNavList.tsx)                                         |
| 작업실 접기·펼치기 메뉴             | [ShellToolsMenu.tsx](ShellToolsMenu.tsx)                                     |
| 밴드 선택·밴드 목록                 | [ShellWorkspaceMenu.tsx](ShellWorkspaceMenu.tsx)                             |
| 로고·프로필                         | [ShellBrand.tsx](ShellBrand.tsx), [ShellProfile.tsx](ShellProfile.tsx)       |
| 밴드 생성·참여 버튼과 빈 상태       | [BandActions.tsx](BandActions.tsx), [EmptyBandState.tsx](EmptyBandState.tsx) |
| 모바일 하단 메뉴                    | [MainLayoutBottomNav.tsx](MainLayoutBottomNav.tsx)                           |
| 공유 스타일                         | [MainLayout.styles.ts](MainLayout.styles.ts)                                 |
| 메뉴 정의·활성 판정·브레드크럼 구성 | [mainLayout.navigation.ts](mainLayout.navigation.ts)                         |
| 메뉴 펼침 상태                      | [useShellMenuState.ts](useShellMenuState.ts)                                 |
| 도움말 표시와 방문·완료 상태        | [MainLayoutHelp.tsx](MainLayoutHelp.tsx), [useShellTour.ts](useShellTour.ts) |

## 모달

| 대상                          | 파일                                                    |
| ----------------------------- | ------------------------------------------------------- |
| 밴드 생성 폼·입력값·저장·오류 | [BandCreateModal.tsx](modals/BandCreateModal.tsx)       |
| 모바일 공간 선택              | [SpaceSwitcherModal.tsx](modals/SpaceSwitcherModal.tsx) |
| 밴드 참여                     | [BandJoinModal.tsx](modals/BandJoinModal.tsx)           |
| 태블릿 메뉴 드로워            | [NavigationDrawer.tsx](modals/NavigationDrawer.tsx)     |
| 생성·선택 모달 공통 틀        | [ShellModalFrame.tsx](modals/ShellModalFrame.tsx)       |

알림 패널은 기존 shared/notifications/NotificationPanel을 계속 사용합니다. 메뉴 데이터와 콜백은 MainLayout에서 전달하며, 생성 입력값은 BandCreateModal에 보관합니다. 모달을 닫아도 작성 중인 입력값은 유지하고 성공 시 초기화합니다. 메뉴 펼침 상태는 드로워가 닫힐 때 사라지지 않도록 MainLayout에서 useShellMenuState를 사용합니다.

모바일은 768px 미만, 태블릿은 768~1024px, 데스크톱은 1024px 초과입니다. 도움말에서 참조하는 nativeID와 기존 탐색 동작도 유지합니다.
