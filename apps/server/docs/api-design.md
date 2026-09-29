# API 설계 기준

기준일: 2026-09-28. [OpenAPI 설계 명세](../openapi.yaml)의 공통 규칙이다.
**목표 계약이며 현재 서버의 모든 응답이 이 규칙을 따르는 것은 아니다.**
현재 동작은 [구현 현황](./implementation-status.md), 전체 경로는 [API 목록](./api-catalog.md),
엔터티는 [데이터 모델](../../../docs/backend-data-model.md)을 참고한다.

## 1. Swagger와 계약의 원본

- 설계 중: `openapi.yaml`을 검토 기준으로 사용. `npm run docs:api`로 DB 없이 열람.
- 구현 후: Controller·요청/응답 DTO에서 생성한 `/docs-json`을 해당 API의 최종 계약으로 사용.
- `/docs`는 실제 서버 API 실행용 Swagger다. 설계 Viewer는 요청 실행을 비활성화한다.
- 구현 완료 시 응답 schema·예시와 실제 동작을 테스트하고 YAML의 차이를 정리한다.
- `planned`는 **이 목표 계약의 구현·검증이 남았다**는 뜻이다. 같은 URL의 기존 코드가 있을 수도 있다.
- Swagger 문서는 런타임 응답 검증을 대신하지 않는다. 요청 DTO와 공개 응답 DTO를 따로 정의한다.

## 2. 인증과 권한

정식 로그인은 `POST /auth/kakao`에 `{ code, redirectUri }`를 보내는 카카오 코드 교환이다. 서버가 자체 JWT와 DB 세션을 발급하고 `POST /auth/logout`으로 폐기한다.
이메일·비밀번호 인증과 refresh API는 제공하지 않는다. 만료 시 재로그인한다. 기본값은 kakao이며 명시적 개발 모드에서만 임시 로그인을 사용한다.
`GET /auth/session`으로 현재 사용자를 확인한다.
인증 모드와 DB 선택은 별개이며 자세한 계약은 [인증 안내](../../../docs/authentication.md)를 따른다.
카카오 최초 로그인은 프로필을 생성한다. `PUT /me`로 수정한다. 초기화 전 `GET /me`는 목표 계약에서 404다.

```http
Authorization: Bearer <moajam-access-token>
```

서버가 토큰 유효성을 확인하고 `sub`를 사용자 ID로 사용한다. 작성자·소유자 ID는 서버가 채운다.
매 요청마다 현재 Membership과 하위 리소스의 같은 밴드·곡 소속을 확인한다.

| 권한                   | 범위                                                                               |
| ---------------------- | ---------------------------------------------------------------------------------- |
| AUTHENTICATED          | 내 프로필·밴드 목록·초대 수락·개인 통합 조회                                       |
| SELF                   | 본인 일정·설정·알림·개인 프로젝트·PRIVATE 녹음                                     |
| MEMBER                 | 해당 밴드 조회, 추천·댓글·의견·자료 등록, 본인 반응·참석·준비 상태                 |
| AUTHOR_OR_OWNER        | 본인 추천·댓글·의견·레퍼런스 편집 또는 밴드 Owner 관리                             |
| OWNER                  | 밴드·초대·역할, 추천 상태·채택, 곡 정보·파트 배정, 공식 결정, 합주 일정·세트리스트 |
| TAKE_AUTHOR            | Take 이름·Offset·공개 범위·삭제. Owner도 타인의 PRIVATE Take 접근 불가             |
| SELF_MEMBER            | 본인 데이터이면서 현재 대상 밴드 멤버                                              |
| ASSIGNEE_SELF          | 해당 곡 파트에 배정된 본인                                                         |
| ASSIGNEE_OR_OWNER      | 할 일 담당자 또는 밴드 Owner. 미배정이면 멤버 허용                                 |
| REQUESTER_OR_OWNER     | 작업 요청자 또는 밴드 Owner                                                        |
| OWNER_OR_SELF          | 밴드 Owner의 멤버 제거 또는 본인 탈퇴                                              |
| SELF_AND_TARGET_MEMBER | 개인 원본 소유자이면서 복사 대상 밴드의 현재 멤버                                  |
| PUBLIC                 | 인증 없는 공개 상태 확인                                                           |

할 일 기본안: 멤버가 생성·내용 수정, 완료는 담당자 또는 Owner(미배정이면 멤버),
담당자 변경은 Owner 또는 생성자. 악보 Sync는 멤버가 생성하고 작성자/Owner가 수정한다.
합주 메모와 완료된 합주의 곡별 회고는 멤버가 수정하되 revision을 검사한다.

인증 누락/만료는 401. 멤버십 없는 밴드·타인 개인 리소스는 404.
접근 가능한 밴드 안에서 권한이 부족하면 403. 현재 일부 서버 응답과는 다르다.

## 3. 요청·응답과 동시성

- Base URL `/v1`, JSON UTF-8. ID 형식은 OpenAPI를 따르되 클라이언트가 내부 의미를 해석하지 않는다.
- 단건은 리소스 자체, 목록은 `{items,nextCursor?}`. 마지막 페이지는 cursor 생략.
- 기본 limit 30, 최대 100. cursor는 서버 발급이며 필터·정렬과 함께 사용한다.
- 기본 정렬 `createdAt DESC, id DESC`. 일정은 `startsAt ASC, id ASC`, 세트리스트는 position 순.
- 시각은 UTC ISO 8601, Timeline/Offset은 정수 ms. Offset은 음수 허용.
- 일정은 IANA timeZone을 함께 저장. 기본 Asia/Seoul. 날짜 범위는 시작 포함·끝 미포함.
- 시간 일정은 endsAt > startsAt. 종일 일정은 startDate/endDateExclusive, UTC 자정 변환 금지.
- 생성 201, 작업 접수 202, 조회/수정 200, 본문 없는 삭제 204.
- objectKey·tokenHash·비밀 키와 Prisma 객체를 공개 응답으로 직접 노출하지 않는다.

일반 수정·상태 전이는 현재 `revision`을 body로 보낸다. 불일치는 409 REVISION_CONFLICT,
성공 시 증가한 revision 반환. 조건부 삭제는 `If-Match: "3"` 형태이며 오래된 값은
412 PRECONDITION_FAILED, 누락은 428 PRECONDITION_REQUIRED다.
멤버 제거·초대 철회는 별도 revision 없이 현재 권한과 상태를 트랜잭션에서 검사한다.

좋아요·채택 추천·참석 응답·읽음은 최종값을 PUT으로 보내며 revision이 필요 없다.
할 일 완료는 업무 충돌 검사를 위해 revision을 함께 받는다.

### 멱등성

생성·채택·업로드 세션·작업·복사 요청은 Idempotency-Key를 받는다.
범위는 사용자 + method + 경로, 보존 기본안 24시간. 같은 키·body는 최초 성공 status/body,
다른 body는 409 IDEMPOTENCY_KEY_REUSED, 진행 중은 409 REQUEST_IN_PROGRESS.
권한/유효성 실패는 성공으로 캐시하지 않는다. 영구 중복은 DB unique와 트랜잭션으로 막는다.

## 4. 오류 계약

Content-Type은 `application/problem+json`, 추적 헤더는 X-Trace-Id.

```json
{
  "type": "https://api.moajam.app/problems/revision-conflict",
  "title": "다른 사용자의 변경이 있습니다.",
  "status": 409,
  "code": "REVISION_CONFLICT",
  "detail": "최신 내용을 불러온 후 다시 저장해주세요.",
  "traceId": "local-request-42"
}
```

| HTTP      | code 예시                                                                | 클라이언트 처리                       |
| --------- | ------------------------------------------------------------------------ | ------------------------------------- |
| 400       | BAD_REQUEST                                                              | 깨진 JSON·cursor 수정                 |
| 401       | UNAUTHORIZED                                                             | 토큰 갱신 후 1회 재시도               |
| 403 / 404 | FORBIDDEN / NOT_FOUND                                                    | 권한 부족/접근 불가 안내              |
| 409       | REVISION_CONFLICT, LAST_OWNER_REQUIRED, ALREADY_ADOPTED, RESOURCE_IN_USE | 입력 보존 후 충돌 해결                |
| 412 / 428 | PRECONDITION_FAILED / PRECONDITION_REQUIRED                              | 최신 revision 확인                    |
| 413 / 415 | PAYLOAD_TOO_LARGE / UNSUPPORTED_MEDIA_TYPE                               | 파일 조건 안내                        |
| 422       | VALIDATION_FAILED                                                        | errors: [{field,reason,message}] 표시 |
| 429       | RATE_LIMITED                                                             | Retry-After 후 재시도                 |
| 503       | DEPENDENCY_UNAVAILABLE                                                   | DB·Storage·worker 오류 안내           |

## 5. 사용자 흐름

### 밴드 생성·가입

Auth 로그인 → PUT /me → POST /workspaces.
Owner가 초대 발급 → 상대가 로그인 후 POST /invitations/accept.
토큰은 기본 7일, 해시 저장, 원문은 발급 응답만 포함.
프로필·멤버십을 원자적으로 준비하며 중복 가입은 기존 workspaceId를 반환한다.

### 추천·채택

추천 생성 → 독립적인 좋아요·채택 추천 → 댓글·답글.
Owner가 CANDIDATE 지정 후 adoption 요청.
추천 revision·상태를 검사하고 ADOPTED 전환·Song 생성·Activity/알림 이벤트를 한 트랜잭션으로 처리.
같은 멱등 키는 같은 Song, 다른 요청으로 이미 채택된 추천은 409.
자동 채택은 없다. HOLD에서 CANDIDATE로 재논의할 수 있다.

### 파일

목적별 세션 생성 → 응답 URL/method/headers로 Storage 직접 업로드 → complete.
서버가 크기·MIME·실제 내용·SHA-256·소유 scope를 확인한 뒤 READY와 도메인 연결 확정.
권한 확인 후 다운로드 URL 발급(기본 5분). 미완료 세션 만료는 기본 1시간 제안.
현재 코드는 메타데이터 크기/MIME 검사까지이며 전체 검증 완료로 간주하지 않는다.

초기 원본 업로드 최대 100 MiB. MPEG/WAV/WebM/Ogg/MP4/AAC/FLAC, PNG/JPEG/WebP,
PDF/MusicXML 기본 허용안. Guitar Pro는 형식 판별·지원 범위 확정 후 추가.
HTML/SVG 제외. 분리 결과 WAV 한도는 별도 정책.
참조 중인 음원은 삭제 영향 조회 후 409 또는 참조 해제 절차를 요구한다.

### 연습·작업

곡 타임라인과 악보 Sync 조회 → Player 선택 → Take 업로드·Offset 설정.
Take 목록은 본인 PRIVATE + 밴드 공개 Take. 개인 BPM/Loop/Mixer는 곡 편곡에 쓰지 않는다.
원곡·Stem·정렬된 Take는 기준 타임라인 공유. 영상/합주 녹음은 별도 기준.

작업 생성 202 → ID로 polling → 결과 조회. 측정할 수 없는 progress는 생략한다.
취소는 진행 중만 가능, 재시도는 새 Job. 실제 결과 준비 전 완료를 반환하지 않는다.
일반 4-Stem과 개인 근접 녹음 추출을 구분한다.
현재 단일 프로세스 separation-jobs를 두 기능이 완성된 것으로 취급하지 않는다.

### 개인 악보

새 악보/MusicXML 가져오기 → revision 저장 → 명시적 snapshot → 필요 시 복원.
복원은 새 revision 생성. PDF/MusicXML 내보내기는 서버 ExportJob 목표이며 기존 브라우저 인쇄와 다르다.
밴드 복사는 대상 곡에 새 Asset/Resource를 만들고 원본과 동기화하지 않는다.

## 6. 구현 전에 확인할 기본안

| 항목                  | 기본안                                   | 시점              |
| --------------------- | ---------------------------------------- | ----------------- |
| 개인 참여 곡          | 배정 곡 기본, 전체 밴드 곡은 옵션        | 통합 조회         |
| 추천 URL              | 같은 밴드 활성 추천 중복 409             | 추천              |
| 탈퇴                  | 과거 작성 기록 유지, 현재 배정 해제      | 멤버              |
| 밴드 삭제             | 탈퇴와 별도 명령, 외부 파일 비동기 정리  | 삭제              |
| 종일                  | 개인 일정 지원, 합주는 시간 필수         | 일정              |
| 파일 보존/사용량      | 즉시 접근 차단, 영구 보존 기간·한도 미정 | 운영 파일 오픈 전 |
| 악보                  | schemaVersion, 미지원 입력 422           | 악보 서버 저장    |
| 이메일·푸시·예약 알림 | 앱 내 알림 우선                          | 별도 기능 착수    |

## 7. 검증 기준

실제 로컬 DB migration/bootstrap, 두 계정·두 밴드 격리, 채택 중복, 마지막 Owner 동시 변경,
수정 충돌, 업로드 완료 재시도, PRIVATE 접근 차단, 작업 취소·재시작·실패를 검증한다.
Swagger 필드·optional/null·enum·오류 예시를 실제 응답과 대조한다.
서버 모드의 실패를 데모 저장 성공으로 대체하지 않는다.
