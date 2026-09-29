# 목데이터 원본

웹 `apps/web/.env.local`의 `VITE_USE_MOCK_DATA=true`일 때 사용한다.
모바일은 `EXPO_PUBLIC_USE_MOCK_DATA=true`로 선택한다. 환경변수 변경 후 개발 서버를 재시작한다.

| 파일           | 내용                                   |
| -------------- | -------------------------------------- |
| data.ts        | 추천곡·채택곡·멤버 등 기본 샘플        |
| workspaces.ts  | 샘플 밴드 구성과 상대 날짜의 합주 일정 |
| preferences.ts | 샘플 사용자 프로필                     |

이 폴더는 최초 데이터 원본이다. 화면에서 추가·수정·삭제해도 이 파일을 수정하지 않는다.
저장된 데이터가 있으면 원본보다 우선해서 읽고, 전체 삭제로 빈 배열이 되어도 샘플을 다시 채우지 않는다.

웹 저장 위치:

- `moajam-workspaces-v1`: 밴드·곡·추천·멤버·합주·댓글·할 일 등의 상태
- `moajam-preferences/m1`: 프로필·설정
- `moajam-preferences/schedules/m1`: 개인 일정
- `moajam-mock-document/m1/<문서 경로>`: 악보·연습·자료 목록 등 문서

일반 데이터의 추가·수정·삭제 결과는 localStorage에 저장한다.
오디오·첨부파일 Blob은 IndexedDB `moajam-media`에 저장하고 localStorage에는 참조를 저장한다.
기존 IndexedDB 문서는 처음 읽을 때 localStorage로 옮기며 원본은 보존한다.
원본 샘플을 다시 적용하려면 개발자 도구에서 해당 목데이터 저장 키를 삭제한 뒤 새로고침한다.
서버 모드의 계정·세션·실제 DB 데이터와는 별개이며 서버로 자동 업로드하지 않는다.
