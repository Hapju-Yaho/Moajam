# API 전체 목록

기준: 0.2.0-design. 총 **167개 operation**. 모든 경로 앞에 `/v1`이 붙는다.

**목표 계약**이며 현재 구현 여부는 [구현 현황](./implementation-status.md)을 참고한다.
요청·응답 필드, 필수값, 예시, HTTP 상태는 [OpenAPI](../openapi.yaml)와 Swagger에 정의한다.
이 목록은 OpenAPI에서 생성한다. 수정 후 `npm run docs:catalog`, 검사는 `npm run docs:check`.

## 화면과 API 연결

| 화면/흐름                       | API 그룹                                          | 주요 데이터                                   |
| ------------------------------- | ------------------------------------------------- | --------------------------------------------- |
| 카카오 로그인·임시 로그인       | 카카오 코드 교환·서비스 JWT / 개발 임시 인증 + Me | Auth 사용자, Profile                          |
| 개인 홈·참여 곡                 | Me                                                | 밴드·일정·배정 곡 통합 조회                   |
| 개인 일정·전체 캘린더           | Schedules                                         | PersonalSchedule + Rehearsal                  |
| 밴드 홈·멤버·초대               | Workspaces                                        | Workspace, Member, Invitation                 |
| 추천 목록·상세                  | Recommendations                                   | Recommendation, Reaction, Comment             |
| 채택곡 목록·개요                | Songs                                             | Song, SongPart, 준비 집계                     |
| 곡 의견·결정·할 일              | Opinions                                          | Opinion, Decision, ChecklistItem              |
| 자료·레퍼런스                   | Resources                                         | Asset, UploadSession, SongResource, Reference |
| 연습실·악보 Sync·녹음           | Practice, Jobs                                    | Timeline, Take, SyncPoint, StemJob            |
| 합주 일정·기록                  | Rehearsals, Resources                             | Session, Attendance, Setlist, Recording       |
| 알림함·리마인드                 | Notifications                                     | Notification                                  |
| 내 악기 추출                    | PersonalTools                                     | AudioProject, ExtractionJob                   |
| 악보 편집·복원·내보내기         | Scores                                            | EditableScore, Revision, ExportJob            |
| 도움말·ICS 내보내기·Player 조작 | 초기에는 클라이언트                               | 별도 서버 API 불필요                          |

P0는 기반·협업, P1은 연습·미디어, P2는 개인 도구 확장이다. 구현 순서이며 기능 제외가 아니다.
권한 약어는 [공통 계약](./api-design.md)을 따른다. 파생 조회 모델에는 쓰기 API를 만들지 않는다.

## System — P0 · 상태 확인

| Method | 경로            | 동작              | 요청 | 응답          | 권한   |
| ------ | --------------- | ----------------- | ---- | ------------- | ------ |
| GET    | `/health`       | API 프로세스 상태 | —    | 200 Health    | PUBLIC |
| GET    | `/health/ready` | DB 연결 준비 상태 | —    | 200 Readiness | PUBLIC |

## Me — P0 · 계정·개인 홈·설정

| Method | 경로              | 동작                  | 요청         | 응답                 | 권한 |
| ------ | ----------------- | --------------------- | ------------ | -------------------- | ---- |
| GET    | `/me`             | 내 프로필             | —            | 200 Profile          | SELF |
| PUT    | `/me`             | 내 프로필 초기화·수정 | ProfileWrite | 200 Profile          | SELF |
| GET    | `/me/preferences` | 내 설정               | —            | 200 Preference       | SELF |
| PUT    | `/me/preferences` | 내 설정 저장          | Preference   | 200 Preference       | SELF |
| GET    | `/me/overview`    | 개인 홈 요약          | —            | 200 PersonalOverview | SELF |
| GET    | `/me/songs`       | 내 밴드 참여 곡       | —            | 200 SongPage         | SELF |

## Workspaces — P0 · 밴드·초대·멤버

| Method | 경로                                                   | 동작                     | 요청             | 응답                  | 권한          |
| ------ | ------------------------------------------------------ | ------------------------ | ---------------- | --------------------- | ------------- |
| GET    | `/workspaces`                                          | 내 밴드 목록             | —                | 200 WorkspacePage     | AUTHENTICATED |
| POST   | `/workspaces`                                          | 밴드 생성                | WorkspaceCreate  | 201 Workspace         | AUTHENTICATED |
| GET    | `/workspaces/{workspaceId}`                            | 밴드 상세                | —                | 200 Workspace         | MEMBER        |
| PATCH  | `/workspaces/{workspaceId}`                            | 밴드 이름 변경           | WorkspacePatch   | 200 Workspace         | OWNER         |
| POST   | `/workspaces/{workspaceId}/deletion-jobs`              | 밴드 삭제 접수           | RevisionCommand  | 202 DeletionJob       | OWNER         |
| GET    | `/me/workspace-deletion-jobs/{jobId}`                  | 내 밴드 삭제 진행        | —                | 200 DeletionJob       | SELF          |
| GET    | `/workspaces/{workspaceId}/overview`                   | 밴드 홈 요약             | —                | 200 WorkspaceOverview | MEMBER        |
| GET    | `/workspaces/{workspaceId}/members`                    | 밴드 멤버 목록           | —                | 200 MemberPage        | MEMBER        |
| PATCH  | `/workspaces/{workspaceId}/members/{userId}`           | 멤버 역할·파트 변경      | MemberPatch      | 200 Member            | OWNER         |
| DELETE | `/workspaces/{workspaceId}/members/{userId}`           | 멤버 제거 또는 본인 탈퇴 | —                | 204 —                 | OWNER_OR_SELF |
| POST   | `/workspaces/{workspaceId}/invitations`                | 초대 발급                | —                | 201 InvitationIssued  | OWNER         |
| GET    | `/workspaces/{workspaceId}/invitations`                | 초대 목록                | —                | 200 InvitationPage    | OWNER         |
| DELETE | `/workspaces/{workspaceId}/invitations/{invitationId}` | 초대 철회                | —                | 204 —                 | OWNER         |
| POST   | `/invitations/accept`                                  | 초대 수락                | InvitationAccept | 200 WorkspaceJoined   | AUTHENTICATED |

## Recommendations — P0 · 추천·반응·댓글·채택

| Method | 경로                                                                                     | 동작                | 요청                     | 응답                   | 권한            |
| ------ | ---------------------------------------------------------------------------------------- | ------------------- | ------------------------ | ---------------------- | --------------- |
| GET    | `/workspaces/{workspaceId}/recommendations`                                              | Recommendation 목록 | —                        | 200 RecommendationPage | MEMBER          |
| POST   | `/workspaces/{workspaceId}/recommendations`                                              | Recommendation 생성 | RecommendationCreate     | 201 Recommendation     | MEMBER          |
| GET    | `/workspaces/{workspaceId}/recommendations/{recommendationId}`                           | Recommendation 상세 | —                        | 200 Recommendation     | MEMBER          |
| PATCH  | `/workspaces/{workspaceId}/recommendations/{recommendationId}`                           | Recommendation 수정 | RecommendationPatch      | 200 Recommendation     | AUTHOR_OR_OWNER |
| DELETE | `/workspaces/{workspaceId}/recommendations/{recommendationId}`                           | Recommendation 삭제 | —                        | 204 —                  | AUTHOR_OR_OWNER |
| PUT    | `/workspaces/{workspaceId}/recommendations/{recommendationId}/like`                      | 추천 좋아요 설정    | BooleanState             | 200 ReactionState      | MEMBER          |
| PUT    | `/workspaces/{workspaceId}/recommendations/{recommendationId}/adoption-vote`             | 채택 추천 설정      | BooleanState             | 200 ReactionState      | MEMBER          |
| PUT    | `/workspaces/{workspaceId}/recommendations/{recommendationId}/status`                    | 후보·보류·재논의    | RecommendationTransition | 200 Recommendation     | OWNER           |
| POST   | `/workspaces/{workspaceId}/recommendations/{recommendationId}/adoption`                  | 추천 채택·곡 생성   | RevisionCommand          | 201 Song               | OWNER           |
| GET    | `/workspaces/{workspaceId}/recommendations/{recommendationId}/comments`                  | Comment 목록        | —                        | 200 CommentPage        | MEMBER          |
| POST   | `/workspaces/{workspaceId}/recommendations/{recommendationId}/comments`                  | Comment 생성        | CommentCreate            | 201 Comment            | MEMBER          |
| GET    | `/workspaces/{workspaceId}/recommendations/{recommendationId}/comments/{commentId}`      | Comment 상세        | —                        | 200 Comment            | MEMBER          |
| PATCH  | `/workspaces/{workspaceId}/recommendations/{recommendationId}/comments/{commentId}`      | Comment 수정        | CommentPatch             | 200 Comment            | AUTHOR_OR_OWNER |
| DELETE | `/workspaces/{workspaceId}/recommendations/{recommendationId}/comments/{commentId}`      | Comment 삭제        | —                        | 204 —                  | AUTHOR_OR_OWNER |
| PUT    | `/workspaces/{workspaceId}/recommendations/{recommendationId}/comments/{commentId}/like` | 댓글 좋아요 설정    | BooleanState             | 200 ReactionState      | MEMBER          |

## Songs — P0 · 곡·배정·준비

| Method | 경로                                                                  | 동작              | 요청             | 응답             | 권한          |
| ------ | --------------------------------------------------------------------- | ----------------- | ---------------- | ---------------- | ------------- |
| GET    | `/workspaces/{workspaceId}/songs`                                     | 채택곡 목록       | —                | 200 SongPage     | MEMBER        |
| GET    | `/workspaces/{workspaceId}/songs/{songId}`                            | 곡 상세           | —                | 200 Song         | MEMBER        |
| PATCH  | `/workspaces/{workspaceId}/songs/{songId}`                            | 곡·편곡 정보 수정 | SongPatch        | 200 Song         | OWNER         |
| GET    | `/workspaces/{workspaceId}/songs/{songId}/overview`                   | 곡 메인 요약      | —                | 200 SongOverview | MEMBER        |
| PUT    | `/workspaces/{workspaceId}/songs/{songId}/archive-state`              | 곡 보관·복원      | ArchiveState     | 200 Song         | OWNER         |
| GET    | `/workspaces/{workspaceId}/songs/{songId}/parts`                      | 곡 파트 배정      | —                | 200 SongPartPage | MEMBER        |
| POST   | `/workspaces/{workspaceId}/songs/{songId}/parts`                      | 파트 배정         | PartCreate       | 201 SongPart     | OWNER         |
| PATCH  | `/workspaces/{workspaceId}/songs/{songId}/parts/{partId}`             | 파트 정보 변경    | PartPatch        | 200 SongPart     | OWNER         |
| DELETE | `/workspaces/{workspaceId}/songs/{songId}/parts/{partId}`             | 파트 배정 해제    | —                | 204 —            | OWNER         |
| PUT    | `/workspaces/{workspaceId}/songs/{songId}/parts/{partId}/preparation` | 본인 준비 상태    | PreparationWrite | 200 SongPart     | ASSIGNEE_SELF |

## Opinions — P0 · 의견·결정·할 일

| Method | 경로                                                                           | 동작               | 요청            | 응답                  | 권한              |
| ------ | ------------------------------------------------------------------------------ | ------------------ | --------------- | --------------------- | ----------------- |
| GET    | `/workspaces/{workspaceId}/songs/{songId}/opinions`                            | Opinion 목록       | —               | 200 OpinionPage       | MEMBER            |
| POST   | `/workspaces/{workspaceId}/songs/{songId}/opinions`                            | Opinion 생성       | OpinionCreate   | 201 Opinion           | MEMBER            |
| GET    | `/workspaces/{workspaceId}/songs/{songId}/opinions/{opinionId}`                | Opinion 상세       | —               | 200 Opinion           | MEMBER            |
| PATCH  | `/workspaces/{workspaceId}/songs/{songId}/opinions/{opinionId}`                | Opinion 수정       | CommentPatch    | 200 Opinion           | AUTHOR_OR_OWNER   |
| DELETE | `/workspaces/{workspaceId}/songs/{songId}/opinions/{opinionId}`                | Opinion 삭제       | —               | 204 —                 | AUTHOR_OR_OWNER   |
| PUT    | `/workspaces/{workspaceId}/songs/{songId}/opinions/{opinionId}/like`           | 의견 좋아요        | BooleanState    | 200 ReactionState     | MEMBER            |
| GET    | `/workspaces/{workspaceId}/songs/{songId}/decisions`                           | 공식 결정 목록     | —               | 200 DecisionPage      | MEMBER            |
| POST   | `/workspaces/{workspaceId}/songs/{songId}/decisions`                           | 공식 결정 등록     | DecisionCreate  | 201 Decision          | OWNER             |
| POST   | `/workspaces/{workspaceId}/songs/{songId}/decisions/{decisionId}/revocation`   | 공식 결정 무효화   | RevisionCommand | 200 Decision          | OWNER             |
| GET    | `/workspaces/{workspaceId}/songs/{songId}/checklist-items`                     | ChecklistItem 목록 | —               | 200 ChecklistItemPage | MEMBER            |
| POST   | `/workspaces/{workspaceId}/songs/{songId}/checklist-items`                     | ChecklistItem 생성 | ChecklistCreate | 201 ChecklistItem     | MEMBER            |
| GET    | `/workspaces/{workspaceId}/songs/{songId}/checklist-items/{itemId}`            | ChecklistItem 상세 | —               | 200 ChecklistItem     | MEMBER            |
| PATCH  | `/workspaces/{workspaceId}/songs/{songId}/checklist-items/{itemId}`            | ChecklistItem 수정 | TaskPatch       | 200 ChecklistItem     | MEMBER            |
| DELETE | `/workspaces/{workspaceId}/songs/{songId}/checklist-items/{itemId}`            | ChecklistItem 삭제 | —               | 204 —                 | MEMBER            |
| PUT    | `/workspaces/{workspaceId}/songs/{songId}/checklist-items/{itemId}/completion` | 할 일 완료 상태    | CompletionWrite | 200 ChecklistItem     | ASSIGNEE_OR_OWNER |

## Schedules — P0 · 개인 일정·통합 캘린더

| Method | 경로                         | 동작                  | 요청           | 응답                     | 권한 |
| ------ | ---------------------------- | --------------------- | -------------- | ------------------------ | ---- |
| GET    | `/me/calendar`               | 개인·밴드 통합 캘린더 | —              | 200 CalendarEntryPage    | SELF |
| GET    | `/me/schedules`              | PersonalSchedule 목록 | —              | 200 PersonalSchedulePage | SELF |
| POST   | `/me/schedules`              | PersonalSchedule 생성 | ScheduleCreate | 201 PersonalSchedule     | SELF |
| GET    | `/me/schedules/{scheduleId}` | PersonalSchedule 상세 | —              | 200 PersonalSchedule     | SELF |
| PATCH  | `/me/schedules/{scheduleId}` | PersonalSchedule 수정 | SchedulePatch  | 200 PersonalSchedule     | SELF |
| DELETE | `/me/schedules/{scheduleId}` | PersonalSchedule 삭제 | —              | 204 —                    | SELF |

## Rehearsals — P0 · 합주·참석·세트리스트

| Method | 경로                                                                         | 동작                    | 요청                | 응답                  | 권한              |
| ------ | ---------------------------------------------------------------------------- | ----------------------- | ------------------- | --------------------- | ----------------- |
| GET    | `/workspaces/{workspaceId}/rehearsals`                                       | 합주 목록               | —                   | 200 RehearsalPage     | MEMBER            |
| POST   | `/workspaces/{workspaceId}/rehearsals`                                       | 합주 일정 생성          | RehearsalCreate     | 201 Rehearsal         | OWNER             |
| GET    | `/workspaces/{workspaceId}/rehearsals/{sessionId}`                           | 합주 상세               | —                   | 200 Rehearsal         | MEMBER            |
| PATCH  | `/workspaces/{workspaceId}/rehearsals/{sessionId}`                           | 합주 일정 수정          | RehearsalPatch      | 200 Rehearsal         | OWNER             |
| PUT    | `/workspaces/{workspaceId}/rehearsals/{sessionId}/status`                    | 합주 완료·취소·복원     | RehearsalTransition | 200 Rehearsal         | OWNER             |
| GET    | `/workspaces/{workspaceId}/rehearsals/{sessionId}/attendance`                | 참석 응답 목록          | —                   | 200 AttendancePage    | MEMBER            |
| PUT    | `/workspaces/{workspaceId}/rehearsals/{sessionId}/attendance/me`             | 내 참석 응답            | AttendanceWrite     | 200 Attendance        | SELF_MEMBER       |
| GET    | `/workspaces/{workspaceId}/rehearsals/{sessionId}/songs`                     | 세트리스트              | —                   | 200 Setlist           | MEMBER            |
| PUT    | `/workspaces/{workspaceId}/rehearsals/{sessionId}/songs`                     | 세트리스트 교체·정렬    | SetlistWrite        | 200 Setlist           | OWNER             |
| GET    | `/workspaces/{workspaceId}/songs/{songId}/rehearsals`                        | 이 곡의 합주 기록       | —                   | 200 RehearsalPage     | MEMBER            |
| PUT    | `/workspaces/{workspaceId}/rehearsals/{sessionId}/songs/{songId}/memo`       | 완료된 합주의 곡별 회고 | MemoWrite           | 200 RehearsalSong     | MEMBER            |
| PUT    | `/workspaces/{workspaceId}/rehearsals/{sessionId}/notes`                     | 합주 공통 메모 저장     | MemoWrite           | 200 Rehearsal         | MEMBER            |
| GET    | `/workspaces/{workspaceId}/rehearsals/{sessionId}/tasks`                     | RehearsalTask 목록      | —                   | 200 RehearsalTaskPage | MEMBER            |
| POST   | `/workspaces/{workspaceId}/rehearsals/{sessionId}/tasks`                     | RehearsalTask 생성      | RehearsalTaskCreate | 201 RehearsalTask     | MEMBER            |
| GET    | `/workspaces/{workspaceId}/rehearsals/{sessionId}/tasks/{taskId}`            | RehearsalTask 상세      | —                   | 200 RehearsalTask     | MEMBER            |
| PATCH  | `/workspaces/{workspaceId}/rehearsals/{sessionId}/tasks/{taskId}`            | RehearsalTask 수정      | TaskPatch           | 200 RehearsalTask     | MEMBER            |
| DELETE | `/workspaces/{workspaceId}/rehearsals/{sessionId}/tasks/{taskId}`            | RehearsalTask 삭제      | —                   | 204 —                 | MEMBER            |
| PUT    | `/workspaces/{workspaceId}/rehearsals/{sessionId}/tasks/{taskId}/completion` | 합주 할 일 완료         | CompletionWrite     | 200 RehearsalTask     | ASSIGNEE_OR_OWNER |

## Notifications — P0 · 앱 내 알림

| Method | 경로                                         | 동작           | 요청           | 응답                 | 권한  |
| ------ | -------------------------------------------- | -------------- | -------------- | -------------------- | ----- |
| GET    | `/notifications`                             | 내 알림함      | —              | 200 NotificationPage | SELF  |
| PUT    | `/notifications/{notificationId}/read-state` | 알림 읽음 설정 | ReadStateWrite | 200 Notification     | SELF  |
| POST   | `/workspaces/{workspaceId}/reminders`        | 밴드 리마인드  | ReminderCreate | 202 ReminderResult   | OWNER |

## Resources — P1 · 자료·레퍼런스·업로드

| Method | 경로                                                                                                     | 동작                    | 요청                  | 응답                       | 권한            |
| ------ | -------------------------------------------------------------------------------------------------------- | ----------------------- | --------------------- | -------------------------- | --------------- |
| POST   | `/workspaces/{workspaceId}/songs/{songId}/upload-sessions`                                               | 직접 업로드 세션 생성   | ResourceUploadCreate  | 201 UploadSession          | MEMBER          |
| POST   | `/workspaces/{workspaceId}/songs/{songId}/upload-sessions/{uploadSessionId}/complete`                    | 업로드 검증·리소스 확정 | —                     | 201 SongResource           | MEMBER          |
| GET    | `/workspaces/{workspaceId}/songs/{songId}/resources`                                                     | SongResource 목록       | —                     | 200 SongResourcePage       | MEMBER          |
| GET    | `/workspaces/{workspaceId}/songs/{songId}/resources/{resourceId}`                                        | SongResource 상세       | —                     | 200 SongResource           | MEMBER          |
| PATCH  | `/workspaces/{workspaceId}/songs/{songId}/resources/{resourceId}`                                        | SongResource 수정       | ResourcePatch         | 200 SongResource           | AUTHOR_OR_OWNER |
| DELETE | `/workspaces/{workspaceId}/songs/{songId}/resources/{resourceId}`                                        | SongResource 삭제       | —                     | 204 —                      | AUTHOR_OR_OWNER |
| GET    | `/workspaces/{workspaceId}/songs/{songId}/resources/{resourceId}/download`                               | 자료 다운로드 URL       | —                     | 200 Download               | MEMBER          |
| GET    | `/workspaces/{workspaceId}/songs/{songId}/resources/{resourceId}/deletion-impact`                        | 자료 삭제 영향          | —                     | 200 DeletionImpact         | MEMBER          |
| GET    | `/workspaces/{workspaceId}/songs/{songId}/references`                                                    | Reference 목록          | —                     | 200 ReferencePage          | MEMBER          |
| POST   | `/workspaces/{workspaceId}/songs/{songId}/references`                                                    | Reference 생성          | ReferenceCreate       | 201 Reference              | MEMBER          |
| GET    | `/workspaces/{workspaceId}/songs/{songId}/references/{referenceId}`                                      | Reference 상세          | —                     | 200 Reference              | MEMBER          |
| PATCH  | `/workspaces/{workspaceId}/songs/{songId}/references/{referenceId}`                                      | Reference 수정          | ReferencePatch        | 200 Reference              | AUTHOR_OR_OWNER |
| DELETE | `/workspaces/{workspaceId}/songs/{songId}/references/{referenceId}`                                      | Reference 삭제          | —                     | 204 —                      | AUTHOR_OR_OWNER |
| POST   | `/workspaces/{workspaceId}/rehearsals/{sessionId}/recordings/upload-sessions`                            | 직접 업로드 세션 생성   | RecordingUploadCreate | 201 UploadSession          | MEMBER          |
| POST   | `/workspaces/{workspaceId}/rehearsals/{sessionId}/recordings/upload-sessions/{uploadSessionId}/complete` | 업로드 검증·리소스 확정 | —                     | 201 RehearsalRecording     | MEMBER          |
| GET    | `/workspaces/{workspaceId}/rehearsals/{sessionId}/recordings`                                            | 합주 녹음 목록          | —                     | 200 RehearsalRecordingPage | MEMBER          |
| GET    | `/workspaces/{workspaceId}/rehearsals/{sessionId}/recordings/{recordingId}/download`                     | 합주 녹음 재생          | —                     | 200 Download               | MEMBER          |
| DELETE | `/workspaces/{workspaceId}/rehearsals/{sessionId}/recordings/{recordingId}`                              | 합주 녹음 삭제          | —                     | 204 —                      | AUTHOR_OR_OWNER |

## Practice — P1 · 타임라인·악보 Sync·녹음

| Method | 경로                                                                                                   | 동작                    | 요청                  | 응답                    | 권한            |
| ------ | ------------------------------------------------------------------------------------------------------ | ----------------------- | --------------------- | ----------------------- | --------------- |
| GET    | `/workspaces/{workspaceId}/songs/{songId}/timeline-sources`                                            | 타임라인 소스           | —                     | 200 TimelineSourcePage  | MEMBER          |
| GET    | `/workspaces/{workspaceId}/songs/{songId}/timeline-sources/{timelineSourceId}/comments`                | TimelineComment 목록    | —                     | 200 TimelineCommentPage | MEMBER          |
| POST   | `/workspaces/{workspaceId}/songs/{songId}/timeline-sources/{timelineSourceId}/comments`                | TimelineComment 생성    | TimelineCommentCreate | 201 TimelineComment     | MEMBER          |
| GET    | `/workspaces/{workspaceId}/songs/{songId}/timeline-sources/{timelineSourceId}/comments/{commentId}`    | TimelineComment 상세    | —                     | 200 TimelineComment     | MEMBER          |
| PATCH  | `/workspaces/{workspaceId}/songs/{songId}/timeline-sources/{timelineSourceId}/comments/{commentId}`    | TimelineComment 수정    | TimelineCommentPatch  | 200 TimelineComment     | AUTHOR_OR_OWNER |
| DELETE | `/workspaces/{workspaceId}/songs/{songId}/timeline-sources/{timelineSourceId}/comments/{commentId}`    | TimelineComment 삭제    | —                     | 204 —                   | AUTHOR_OR_OWNER |
| GET    | `/workspaces/{workspaceId}/songs/{songId}/score-resources/{scoreResourceId}/sync-points`               | ScoreSyncPoint 목록     | —                     | 200 ScoreSyncPointPage  | MEMBER          |
| POST   | `/workspaces/{workspaceId}/songs/{songId}/score-resources/{scoreResourceId}/sync-points`               | ScoreSyncPoint 생성     | SyncPointCreate       | 201 ScoreSyncPoint      | MEMBER          |
| GET    | `/workspaces/{workspaceId}/songs/{songId}/score-resources/{scoreResourceId}/sync-points/{syncPointId}` | ScoreSyncPoint 상세     | —                     | 200 ScoreSyncPoint      | MEMBER          |
| PATCH  | `/workspaces/{workspaceId}/songs/{songId}/score-resources/{scoreResourceId}/sync-points/{syncPointId}` | ScoreSyncPoint 수정     | SyncPointPatch        | 200 ScoreSyncPoint      | AUTHOR_OR_OWNER |
| DELETE | `/workspaces/{workspaceId}/songs/{songId}/score-resources/{scoreResourceId}/sync-points/{syncPointId}` | ScoreSyncPoint 삭제     | —                     | 204 —                   | AUTHOR_OR_OWNER |
| POST   | `/workspaces/{workspaceId}/songs/{songId}/practice-takes/upload-sessions`                              | 직접 업로드 세션 생성   | TakeUploadCreate      | 201 UploadSession       | TAKE_AUTHOR     |
| POST   | `/workspaces/{workspaceId}/songs/{songId}/practice-takes/upload-sessions/{uploadSessionId}/complete`   | 업로드 검증·리소스 확정 | —                     | 201 PracticeTake        | TAKE_AUTHOR     |
| GET    | `/workspaces/{workspaceId}/songs/{songId}/practice-takes`                                              | PracticeTake 목록       | —                     | 200 PracticeTakePage    | MEMBER          |
| GET    | `/workspaces/{workspaceId}/songs/{songId}/practice-takes/{takeId}`                                     | PracticeTake 상세       | —                     | 200 PracticeTake        | MEMBER          |
| PATCH  | `/workspaces/{workspaceId}/songs/{songId}/practice-takes/{takeId}`                                     | PracticeTake 수정       | TakePatch             | 200 PracticeTake        | TAKE_AUTHOR     |
| DELETE | `/workspaces/{workspaceId}/songs/{songId}/practice-takes/{takeId}`                                     | PracticeTake 삭제       | —                     | 204 —                   | TAKE_AUTHOR     |
| GET    | `/workspaces/{workspaceId}/songs/{songId}/practice-takes/{takeId}/download`                            | Take 재생·다운로드 URL  | —                     | 200 Download            | MEMBER          |
| GET    | `/me/practice-settings/{songId}`                                                                       | 내 곡별 연습 설정       | —                     | 200 PracticeSetting     | SELF_MEMBER     |
| PUT    | `/me/practice-settings/{songId}`                                                                       | 개인 연습 설정 저장     | PracticeSettingWrite  | 200 PracticeSetting     | SELF_MEMBER     |
| GET    | `/workspaces/{workspaceId}/rehearsals/{sessionId}/recordings/{recordingId}/comments`                   | TimelineComment 목록    | —                     | 200 TimelineCommentPage | MEMBER          |
| POST   | `/workspaces/{workspaceId}/rehearsals/{sessionId}/recordings/{recordingId}/comments`                   | TimelineComment 생성    | TimelineCommentCreate | 201 TimelineComment     | MEMBER          |
| GET    | `/workspaces/{workspaceId}/rehearsals/{sessionId}/recordings/{recordingId}/comments/{commentId}`       | TimelineComment 상세    | —                     | 200 TimelineComment     | MEMBER          |
| PATCH  | `/workspaces/{workspaceId}/rehearsals/{sessionId}/recordings/{recordingId}/comments/{commentId}`       | TimelineComment 수정    | TimelineCommentPatch  | 200 TimelineComment     | AUTHOR_OR_OWNER |
| DELETE | `/workspaces/{workspaceId}/rehearsals/{sessionId}/recordings/{recordingId}/comments/{commentId}`       | TimelineComment 삭제    | —                     | 204 —                   | AUTHOR_OR_OWNER |

## Jobs — P1 · 일반 Stem 작업

| Method | 경로                                                                | 동작               | 요청          | 응답            | 권한               |
| ------ | ------------------------------------------------------------------- | ------------------ | ------------- | --------------- | ------------------ |
| GET    | `/workspaces/{workspaceId}/songs/{songId}/stem-jobs`                | 곡 Stem 작업 목록  | —             | 200 StemJobPage | MEMBER             |
| POST   | `/workspaces/{workspaceId}/songs/{songId}/stem-jobs`                | 4-Stem 분리 요청   | StemJobCreate | 202 StemJob     | MEMBER             |
| GET    | `/workspaces/{workspaceId}/songs/{songId}/stem-jobs/{jobId}`        | Stem 작업 상태     | —             | 200 StemJob     | MEMBER             |
| POST   | `/workspaces/{workspaceId}/songs/{songId}/stem-jobs/{jobId}/cancel` | Stem 작업 취소     | —             | 200 StemJob     | REQUESTER_OR_OWNER |
| GET    | `/workspaces/{workspaceId}/songs/{songId}/stems/{stemId}/download`  | Stem 재생·다운로드 | —             | 200 Download    | MEMBER             |

## PersonalTools — P2 · 개인 음원 추출

| Method | 경로                                                            | 동작                         | 요청               | 응답                  | 권한                   |
| ------ | --------------------------------------------------------------- | ---------------------------- | ------------------ | --------------------- | ---------------------- |
| POST   | `/me/assets/upload-sessions`                                    | 직접 업로드 세션 생성        | UploadCreate       | 201 UploadSession     | SELF                   |
| POST   | `/me/assets/upload-sessions/{uploadSessionId}/complete`         | 업로드 검증·리소스 확정      | —                  | 201 Asset             | SELF                   |
| GET    | `/me/assets`                                                    | 내 개인 파일                 | —                  | 200 AssetPage         | SELF                   |
| GET    | `/me/assets/{assetId}/download`                                 | 개인 파일 다운로드           | —                  | 200 Download          | SELF                   |
| DELETE | `/me/assets/{assetId}`                                          | 미참조 개인 파일 삭제        | —                  | 204 —                 | SELF                   |
| GET    | `/me/audio-projects`                                            | AudioProject 목록            | —                  | 200 AudioProjectPage  | SELF                   |
| POST   | `/me/audio-projects`                                            | AudioProject 생성            | AudioProjectCreate | 201 AudioProject      | SELF                   |
| GET    | `/me/audio-projects/{projectId}`                                | AudioProject 상세            | —                  | 200 AudioProject      | SELF                   |
| PATCH  | `/me/audio-projects/{projectId}`                                | AudioProject 수정            | AudioProjectPatch  | 200 AudioProject      | SELF                   |
| DELETE | `/me/audio-projects/{projectId}`                                | AudioProject 삭제            | —                  | 204 —                 | SELF                   |
| GET    | `/me/audio-projects/{projectId}/extraction-jobs`                | 개인 추출 작업 목록          | —                  | 200 ExtractionJobPage | SELF                   |
| POST   | `/me/audio-projects/{projectId}/extraction-jobs`                | 개인 악기 추출 요청          | ExtractionCreate   | 202 ExtractionJob     | SELF                   |
| GET    | `/me/audio-projects/{projectId}/extraction-jobs/{jobId}`        | 개인 추출 상태·분석          | —                  | 200 ExtractionJob     | SELF                   |
| POST   | `/me/audio-projects/{projectId}/extraction-jobs/{jobId}/cancel` | 개인 추출 취소               | —                  | 200 ExtractionJob     | SELF                   |
| POST   | `/me/audio-projects/{projectId}/exports`                        | 추출 오디오 내보내기         | AudioExportCreate  | 202 ExportJob         | SELF                   |
| POST   | `/me/audio-projects/{projectId}/workspace-copies`               | 개인 결과를 밴드 자료로 복사 | CopyToWorkspace    | 201 SongResource      | SELF_AND_TARGET_MEMBER |

## Scores — P2 · 개인 구조화 악보

| Method | 경로                                                  | 동작                       | 요청                 | 응답                  | 권한                   |
| ------ | ----------------------------------------------------- | -------------------------- | -------------------- | --------------------- | ---------------------- |
| GET    | `/me/scores`                                          | EditableScore 목록         | —                    | 200 EditableScorePage | SELF                   |
| POST   | `/me/scores`                                          | EditableScore 생성         | ScoreCreate          | 201 EditableScore     | SELF                   |
| GET    | `/me/scores/{scoreId}`                                | EditableScore 상세         | —                    | 200 EditableScore     | SELF                   |
| PATCH  | `/me/scores/{scoreId}`                                | EditableScore 수정         | ScorePatch           | 200 EditableScore     | SELF                   |
| DELETE | `/me/scores/{scoreId}`                                | EditableScore 삭제         | —                    | 204 —                 | SELF                   |
| POST   | `/me/scores/imports`                                  | MusicXML에서 악보 생성     | ScoreImport          | 201 EditableScore     | SELF                   |
| GET    | `/me/scores/{scoreId}/revisions`                      | 악보 snapshot 목록         | —                    | 200 ScoreRevisionPage | SELF                   |
| POST   | `/me/scores/{scoreId}/revisions`                      | 악보 snapshot 생성         | SnapshotCreate       | 201 ScoreRevision     | SELF                   |
| GET    | `/me/scores/{scoreId}/revisions/{revisionId}`         | 악보 snapshot 상세         | —                    | 200 ScoreRevision     | SELF                   |
| POST   | `/me/scores/{scoreId}/revisions/{revisionId}/restore` | 악보 snapshot 복원         | RevisionCommand      | 200 EditableScore     | SELF                   |
| POST   | `/me/scores/{scoreId}/exports`                        | 악보 PDF·MusicXML 내보내기 | ScoreExportCreate    | 202 ExportJob         | SELF                   |
| POST   | `/me/scores/{scoreId}/workspace-copies`               | 악보를 밴드 자료로 복사    | ScoreCopyToWorkspace | 202 ExportJob         | SELF_AND_TARGET_MEMBER |
| GET    | `/me/export-jobs/{jobId}`                             | 내보내기 상태              | —                    | 200 ExportJob         | SELF                   |
| GET    | `/me/export-jobs/{jobId}/download`                    | 내보내기 결과 URL          | —                    | 200 Download          | SELF                   |
