# 백엔드 설계 안내

기준일: 2026-09-28. 이 문서 묶음은 백엔드 개발을 시작하기 위한 **목표 설계**다.
기존 코드가 존재한다는 것과 로컬 DB·인증·파일 저장소를 연결해 검증했다는 것은 구분한다.
이번 문서화에서는 DB 구조나 서비스 데이터를 변경하지 않는다.

## 읽는 순서

1. [데이터 모델·관계·제약](./backend-data-model.md): 현재 DB, 목표 ERD, 필드, 소유권, 삭제와 전환 계획
2. [API 공통 계약·권한·흐름](../apps/server/docs/api-design.md): 인증, 오류, 동시성, 파일과 작업 흐름
3. [API 전체 목록](../apps/server/docs/api-catalog.md): 화면별 API, 우선순위, 요청·응답 모델
4. [OpenAPI 설계 명세](../apps/server/openapi.yaml): Swagger로 읽을 수 있는 상세 계약
5. [현재 구현과 차이](../apps/server/docs/implementation-status.md): 실제 등록된 경로와 목표 계약의 차이

## Swagger 실행

저장소 루트에서 실행한다.

```sh
npm install
npm run docs:api
```

[설계 Swagger](http://127.0.0.1:3001)는 DB, Supabase 키, 백엔드 실행 없이 열린다.
명세를 수정한 뒤 브라우저를 새로 고치면 반영된다. 설계 API는 아직 구현 계약이 아니므로
이 화면에서는 요청 실행을 제공하지 않는다. CSS와 JavaScript도 로컬 패키지에서 제공한다.

실제 서버를 실행했을 때의 [구현 Swagger](http://localhost:3000/docs)와
`http://localhost:3000/docs-json`은 Controller·DTO에서 생성한다. 현재는 일부 DTO와 응답 설명이
부족하다. 앞으로 각 API를 구현할 때 설계 명세와 일치시키고 계약 검증 후 해당 API의 최종 기준을
생성 문서로 전환한다. YAML과 구현 문서를 서로 다른 최종 계약으로 관리하지 않는다.

```sh
npm run docs:check
```

위 검사는 로컬 참조, 경로 매개변수, operationId, 문서 목록의 일치 등 저장소의 계약 규칙을
검사한다. 실제 서버 응답을 검증하는 통합 테스트나 OpenAPI 표준 전체 검증을 대체하지 않는다.

## 확정된 방향과 설계 기본값

| 구분                 | 내용                                                                                                        |
| -------------------- | ----------------------------------------------------------------------------------------------------------- |
| 사용자 요청으로 확정 | Swagger 사용, 서비스 전체 데이터/API 문서화 우선, 로컬 백엔드는 로컬 DB 사용                                |
| 기존 코드 유지       | NestJS + Fastify, Prisma + PostgreSQL, 카카오 코드 교환·서비스 JWT, Supabase Storage                        |
| 문서의 설계 기본값   | 로컬 SQLite, 핵심 협업 데이터의 개별 테이블화, 요청별 서버 권한 검증                                        |
| 문서의 설계 기본값   | 웹 협업 우선, 모바일은 같은 API 재사용, 음원 처리와 악보 동기화는 후속 단계                                 |
| 구현 전에 확인       | 초기 데이터 보존·이관 대상, 카카오 앱·리다이렉트 설정, 파일 보존 기간·사용량 한도, 악보 편집 상세 지원 범위 |

기본값은 구현을 위한 제안이며 제품의 모든 정책이 이미 승인됐다는 의미는 아니다.
기존 UI에서 제공하던 기능을 삭제하거나 현재 DB를 초기화하는 근거로 사용하지 않는다.

## 기능 단계

| 단계           | 범위                                                                                         | 완료 기준                                                   |
| -------------- | -------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| P0 기반·협업   | 로컬 환경, 계정, 밴드·초대, 추천·채택, 곡·담당 파트, 의견·결정·할 일, 개인·합주 일정, 알림함 | 두 계정으로 협업·권한·동시 수정 검증                        |
| P1 연습·미디어 | 파일 업로드·다운로드, 레퍼런스, 타임라인, 악보 Sync, 개인 Take, 4-Stem 분리                  | 비공개 접근 차단, 완료 검증, 실패·취소·재시도와 재시작 검증 |
| P2 개인 도구   | 근접 녹음 악기 추출, 구조화 악보 저장·Revision·내보내기·밴드 복사                            | 개인 데이터 격리, 문서 충돌, 복사본 독립성 검증             |

P0/P1/P2는 구현 순서다. 뒤 단계가 제품 범위에서 제외된다는 뜻은 아니다.
이메일·푸시 알림, 결제, 실시간 공동 악보 편집, 외부 영상 다운로드는 이번 API 계약에 넣지 않는다.

## 실행 환경

| 구성          | 로컬                        | 운영 방향                                   |
| ------------- | --------------------------- | ------------------------------------------- |
| 웹 / API      | Vite / NestJS를 PC에서 실행 | 정적 웹 / 장기 실행 API 프로세스            |
| 데이터베이스  | data/moajam.db SQLite       | 운영 Supabase DB                            |
| 로그인 / 파일 | 임시 계정 / data/files      | 카카오 Auth / 비공개 Storage                |
| 스키마        | Prisma db push              | 검증한 migration 배포                       |
| 작업 처리     | 필요 시 로컬 단일 worker    | 작업 lease·재시도 가능한 별도 worker로 확장 |

현재 로컬 환경은 SQLite와 카카오 인증·로컬 파일 저장을 사용한다. `DATABASE_URL`이 있으면 Supabase PostgreSQL/Storage로 전환한다. 인증은 별도 `AUTH_MODE=temporary|kakao`로 선택한다.
구체적인 실행·검증 절차는 [실행 안내](./runtime-storage.md)에 있다.

## 문서 유지 원칙

- 각 API의 구현 완료 기준: 요청·응답 DTO, Swagger 예시, 권한 검사, 핵심 통합 테스트.
- OpenAPI의 `x-implementation-status: planned`는 목표 계약이 아직 검증되지 않았음을 뜻한다.
- `x-phase`, `x-permission`은 구현 순서와 권한을 나타낸다.
- 현재 구현 목록은 실제 경로 기준으로 유지한다. 기존 경로와 동일해도 응답이 다르면 완료로 표시하지 않는다.
- 기존 제품 문서와 충돌하는 정책은 [차이·결정 목록](../apps/server/docs/implementation-status.md)에 기록한다.
- DB 엔터티와 API 응답은 같지 않다. 비밀 키·초대 토큰 해시·저장소 object key는 공개 DTO에서 제외한다.

## 참고

- [NestJS OpenAPI](https://docs.nestjs.com/openapi/introduction)
- [NestJS DTO 문서화](https://docs.nestjs.com/openapi/types-and-parameters)
- [Swagger UI 설정](https://swagger.io/docs/open-source-tools/swagger-ui/usage/configuration/)
- [Supabase 로컬 개발](https://supabase.com/docs/guides/local-development/cli/getting-started)
