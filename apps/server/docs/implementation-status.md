# 구현 현황과 설계 차이

기준일: 2026-09-29, 현재 Controller·Prisma 코드 기준.
SQLite HTTP 통합 테스트로 임시 로그인·계정 복구·개인 데이터 격리·초대·revision 충돌·트랜잭션 롤백·파일 공유·재시작 후 보존을 검증했다. 외부 Supabase와 모바일 실기기는 별도 검증이 필요하다.
카카오 코드 교환은 외부 응답을 대체한 테스트로 검증했다. 실제 카카오 키와 모바일 리다이렉트는 별도 검증이 필요하다.
공통 prefix는 `/v1`. 목표 계약은 [OpenAPI](../openapi.yaml)를 따른다.

## 실제 등록된 API

| Method | 경로                                         | 현재 동작 / 차이                                                  |
| ------ | -------------------------------------------- | ----------------------------------------------------------------- |
| GET    | `/health`                                    | 공개 프로세스 상태. DB 준비 상태 아님                             |
| GET    | `/me/onboarding`                             | 첫 로그인 프로필과 완료 여부 조회                                 |
| PUT    | `/me/onboarding`                             | 이름·사진·복수 세션과 완료 시각 저장, 개인 설정 동시 반영         |
| GET    | `/me`                                        | Profile 또는 null. 목표는 초기화 전 404                           |
| PUT    | `/me`                                        | displayName upsert                                                |
| GET    | `/me/schedules`                              | 개인 일정 value 배열, 날짜 범위·cursor 없음                       |
| PUT    | `/me/schedules/{id}`                         | 클라이언트 ID JSON upsert. 목표 POST/PATCH와 다름                 |
| DELETE | `/me/schedules/{id}`                         | count 반환. 목표 204와 다름                                       |
| GET    | `/notifications`                             | 현재 멤버십 기준 최근 50개 배열                                   |
| POST   | `/notifications/{id}/read`                   | count 반환. 목표 PUT read-state와 다름                            |
| POST   | `/workspaces/{workspaceId}/reminders`        | Owner 앱 내 알림, 동일 문구 1분 제한                              |
| GET    | `/workspaces`                                | 밴드 배열과 멤버·프로필                                           |
| POST   | `/workspaces`                                | Profile + Workspace/OWNER 생성 트랜잭션                           |
| PATCH  | `/workspaces/{workspaceId}/members/{userId}` | role/part 함께 변경, 마지막 Owner 보호                            |
| DELETE | `/workspaces/{workspaceId}/members/{userId}` | 본인 탈퇴/Owner 제거, 아래 삭제 예외                              |
| GET    | `/workspaces/{workspaceId}/documents`        | 모든 밴드 JSON 문서                                               |
| PUT    | `/workspaces/{workspaceId}/documents/{key}`  | revision/value 저장, 충돌 409                                     |
| POST   | `/workspaces/{workspaceId}/invitations`      | 7일 토큰 발급, 원문 1회 응답                                      |
| GET    | `/workspaces/{workspaceId}/invitations`      | 안전한 초대 필드 조회                                             |
| DELETE | `/workspaces/{workspaceId}/invitations/{id}` | revoked=true, count 반환                                          |
| POST   | `/invitations/accept`                        | 토큰 검증·멤버십 upsert, workspaceId                              |
| POST   | `/assets/uploads`                            | name/mime/size/scope/workspaceId로 서명 URL                       |
| POST   | `/assets/{id}/complete`                      | 크기/MIME 확인 후 ready=true                                      |
| GET    | `/assets`                                    | scope/workspaceId, 본인·공유 파일                                 |
| GET    | `/assets/{id}/download`                      | 권한 확인 후 5분 URL                                              |
| PATCH  | `/assets/{id}/visibility`                    | 소유자 PRIVATE/WORKSPACE 변경                                     |
| DELETE | `/assets/{id}`                               | 소유자 soft delete, 영구 정리 없음                                |
| POST   | `/separation-jobs`                           | sourceId/instrument, worker 활성화 필요                           |
| GET    | `/separation-jobs`                           | 본인 최근 30개                                                    |
| POST   | `/separation-jobs/{id}/cancel`               | 본인 진행 중 작업 취소                                            |
| GET    | `/config`                                    | 인증 방식·로그인 준비 여부·worker 상태. DB 주소와 비밀 키 제외    |
| POST   | `/auth/kakao/authorize`                      | 허용된 redirect URI로 인가 URL·state 발급                         |
| POST   | `/auth/kakao`                                | code·redirectUri를 받아 카카오 사용자 확인 후 Moajam JWT 발급     |
| POST   | `/auth/logout`                               | 현재 서비스 세션 즉시 폐기                                        |
| POST   | `/auth/temporary`                            | 개발용 임시 계정 생성/복구, 7일 세션 발급                         |
| GET    | `/auth/session`                              | 검증된 임시 또는 카카오 사용자 정보                               |
| POST   | `/auth/temporary/logout`                     | 현재 임시 세션 폐기, 복구 키 유지                                 |
| GET    | `/me/documents/{key}`                        | 개인 악보·연습 세션, 없는 기록 null                               |
| PUT    | `/me/documents/{key}`                        | 개인 JSON + 소유 파일 참조, revision 충돌 409                     |
| GET    | `/me/preferences`                            | 개인 프로필·환경·알림 선호                                        |
| PUT    | `/me/preferences`                            | 설정·프로필 이름 동시 저장                                        |
| PUT    | `/workspaces/{workspaceId}/sync`             | 여러 문서·멤버 변경을 원자적으로 저장                             |
| PUT    | `/local-files/{token}`                       | 로컬 서명 업로드, 100MB·크기/MIME 검증                            |
| GET    | `/local-files/{token}`                       | 로컬 서명 다운로드, 5분 만료                                      |
| GET    | `/integrations/youtube/{videoId}`            | 인증된 사용자의 제목·채널 조회, 고정 upstream·8초 제한·1시간 캐시 |

## JSON 문서에 들어 있는 기능

밴드 연습실 전용 경로:

| Method | 경로                                          | 현재 동작 / 차이                                                     |
| ------ | --------------------------------------------- | -------------------------------------------------------------------- |
| GET    | `/workspaces/{workspaceId}/practice/{songId}` | 밴드 공용 연습 트랙 조회                                             |
| PUT    | `/workspaces/{workspaceId}/practice/{songId}` | 밴드 멤버가 revision으로 트랙 저장                                   |
| GET    | `/workspaces/{workspaceId}/scores/{songId}`   | 밴드 멤버만 곡별 공용 악보 조회, 없으면 null                         |
| PUT    | `/workspaces/{workspaceId}/scores/{songId}`   | 모든 밴드 멤버 편집, 해당 곡 확인, 공유 파일 검증, revision 충돌 409 |

악보는 `song/{songId}/score`에 저장하며 개인 악보와 분리한다. 전용 경로를 사용하므로 일반 문서 쓰기나 `/sync`로 악보 권한·첨부 검증을 우회할 수 없다.

기존 목록에서 누락되어 있던 경로:

| Method | 경로                        | 현재 동작 / 차이                                     |
| ------ | --------------------------- | ---------------------------------------------------- |
| POST   | `/notifications/read-all`   | 본인 알림 일괄 읽음 처리                             |
| PATCH  | `/workspaces/{workspaceId}` | Owner가 밴드 이름·소개·사진 변경                     |
| DELETE | `/notifications`            | 현재 소속 밴드의 본인 알림 일괄 삭제, 밴드 필터 지원 |
| PATCH  | `/assets/{id}/name`         | 파일 소유자 이름 변경                                |
| POST   | `/auth/refresh`             | refreshToken으로 세션 갱신                           |
| POST   | `/auth/renew`               | 인증된 사용자의 세션 갱신                            |

추천·곡·합주 목록, 추천 댓글, 곡 의견·편곡·할 일·링크, 합주 메모·참석자·할 일,
곡별 합주 회고는 현재 화면에서는 `/sync`에 모아 저장하고 `/documents`로 읽는다. 기존 단일 `/documents/{key}` 쓰기도 유지한다.
UI가 동작하더라도 목표 `/recommendations`, `/songs`, `/rehearsals` 경로가 이미 있다는 뜻은 아니다.
기존 권한·필드·revision 검사를 개별 DTO·DB 제약·업무 트랜잭션으로 옮겨야 한다.

## 중요한 차이와 결정 목록

| 주제        | 현재                                                   | 목표 / 후속 작업                                    |
| ----------- | ------------------------------------------------------ | --------------------------------------------------- |
| Swagger     | 실행 중 Controller/DTO의 UI/JSON                       | 모든 DTO·정상/오류 응답·권한                        |
| 목록        | 배열/고정 개수                                         | cursor 기반 items/nextCursor                        |
| 일정        | date/start/end JSON                                    | 시간대 포함 시각, 종일 날짜                         |
| 프로필      | 생성/가입/PUT me에서 upsert                            | 서버 초기화 책임 통일. Auth trigger 중복 도입 안 함 |
| 마지막 멤버 | confirmDelete=true이면 밴드·파일 삭제                  | 탈퇴와 명시적 밴드 삭제 명령 분리 제안              |
| 파일 삭제   | 밴드 DB 트랜잭션 중 Storage I/O                        | 외부 삭제는 롤백 불가. 작업 상태·재시도로 분리      |
| 파일 검증   | 메타데이터 크기/MIME                                   | checksum·내용·세션 만료·참조 검증                   |
| 작업        | QUEUED/RUNNING/SUCCEEDED/FAILED/CANCELLED; 악기+나머지 | 4-Stem / 개인 분석·추출 구분                        |
| 작업 실행   | 단일 순차 큐                                           | 다중 worker 전 lease·중복 방지 필요                 |
| 멱등성      | 일반 구현 없음                                         | 키 저장·body hash·unique·재시도 테스트              |
| 오류        | status 기반 code/detail/traceId                        | 업무 code·구조화 필드 오류, validation 직렬화 개선  |
| API 패키지  | overview에 demo 데이터                                 | 계약 기반 query와 타입                              |
| 악보        | 개인 본문 서버 저장/브라우저 출력                      | 서버 본문·snapshot·export·복사                      |
| 모바일      | 공통 인증/API, 파일 업로드, 연습·악보 서버 저장        | 실기기 재생·녹음 검증                               |

개인 참여 곡은 이전 기획의 ‘모든 밴드 곡’과 최신 구현의 ‘실제 배정 곡’ 차이를
`GET /me/songs?assignedToMe=true|false`로 표현한다. 기본은 true 제안이다.
제품 명세의 4-Stem과 현재 two-stem을 동일한 완료 기능으로 표시하지 않는다.
Guitar Pro·고급 악보·품질 분석·자동 알림은 제품 목표와 실제 지원을 구분한다.

## 점진 전환

1. 로컬 DB 테스트로 기존 동작을 고정한다.
2. 기능별 새 테이블/API를 구현하고 이전 JSON 쓰기는 전환 전까지 유지한다.
3. 이관·ID 매핑을 검증하고 해당 화면의 API adapter를 바꾼다.
4. 생성 Swagger와 목표 계약을 비교·검증한 뒤 구현 상태를 갱신한다.
5. 기존 클라이언트가 없어지면 호환 경로를 제거한다.

로컬 실행과 화면별 API 연결은 [실행 안내](../../../docs/runtime-storage.md)를 참고한다.
