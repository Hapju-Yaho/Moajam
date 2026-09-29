# Moajam 문서

이 디렉터리는 제품과 구현의 기준 문서를 모읍니다.

- [실행 환경·화면/API 연결](./runtime-storage.md): SQLite 기본값, Supabase 전환, 파일 저장, 검증 방법
- [백엔드 설계·Swagger 시작 안내](./backend-design.md): 전체 문서 읽는 순서, 실행 방법, 구현 단계
- [백엔드 데이터 모델](./backend-data-model.md): 현재/목표 구조, ERD, 필드, 관계·제약, 이관 계획
- [API 전체 목록](../apps/server/docs/api-catalog.md): 기능별 API와 요청·응답 모델
- [API 공통 계약](../apps/server/docs/api-design.md): 권한, 오류, 동시성, 미디어·작업 흐름
- [현재 API 구현 현황](../apps/server/docs/implementation-status.md): 실제 경로와 목표 계약의 차이

- [제품 요구사항](./product-requirements.md): MVP 목적, 사용자 흐름, 기능 범위
- [도메인 모델](./domain-model.md): 핵심 엔터티, 상태, 데이터 불변 조건
- [아키텍처](./architecture.md): 모노레포와 플랫폼 공유 전략
- [개발 가이드](./development.md): 실행, 검사, 환경 변수, 코드 규칙
- [MVP 로드맵](./roadmap.md): 구현 순서와 완료 기준
- [화면별 기능 명세·보완 목록](./interaction-spec.md): 전체 화면 역할, 실제 동작·저장 범위, 미연결 기능, 다음 개발 순서
- [채택곡 기능 구조·UX 검토](./adopted-songs-ux-review.md): 현재 기능 구조, 사용 흐름의 단절, 미구현 항목과 개선 우선순위
- [협업 환경 설정](./collaboration-setup.md): Supabase·DB·비공개 파일·음원 분리 연결과 검증 절차
- [연습 미디어와 악보 동기화](./practice-media-spec.md): Stem, 개인 Take, 악보 동기 재생 기준
- [개인 작업실](./personal-tools-spec.md): 내 악기 추출과 구조화 악보 편집 기준
- [개인·밴드 워크스페이스 구조 기획](./workspace-structure-spec.md): legacy 화면 채용, 다중 밴드 전환, 개인 통합 조회

## 화면 시안

- [홈](./home-dashboard-concept.png)
- [곡 추천](./song-recommendations-concept.png)
- [곡 추천 상세](./recommendation-detail-concept.png)
- [채택곡](./adopted-songs-concept.png)
- [채택곡 상세 Overview](./adopted-song-detail-concept.png)
- [의견](./song-opinions-concept.png)
- [자료](./song-resources-concept.png)
- [연습](./song-practice-concept.png)
- [합주 기록](./song-rehearsal-history-concept.png)
- [합주](./rehearsals-concept.png)
- [멤버](./members-concept.png)
- [개인 내 악기 추출](./personal-instrument-extractor-concept.png)
- [개인 악보 편집](./personal-score-editor-concept.png)
- [설정](./settings-concept.png)
- [도움말](./help-center-concept.png)

기능을 추가하기 전에 제품 요구사항과 도메인 불변 조건을 먼저 갱신합니다.
