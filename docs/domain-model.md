# 도메인 모델

백엔드의 상세 필드·ERD·제약·현재 저장 구조와 목표 구조는
[백엔드 데이터 모델](./backend-data-model.md)을 참고한다. 아래는 제품 도메인 개요이며,
모든 엔터티가 현재 Prisma 테이블로 구현됐다는 뜻은 아니다.

## 관계

```text
User ─< WorkspaceMember >─ Workspace
                              ├─ Recommendation
                              ├─ Song
                              │   ├─ SongPart
                              │   ├─ PreparationStatus
                              │   ├─ Opinion
                              │   ├─ Decision ─> Opinion / TimelineComment
                              │   ├─ Checklist ─> Decision
                              │   ├─ Resource / Reference
                              │   ├─ ScoreAsset ─< ScoreSyncPoint
                              │   ├─ StemJob ─< Stem
                              │   ├─ PracticeTake
                              │   └─ TimelineSource
                              │       ├─ Stem / Recording
                              │       └─ TimelineComment
                              └─ RehearsalSession
User ── PersonalWorkspace
          ├─ PersonalAudioProject ─< DominantInstrumentExtractionJob
          │                           └─ ExtractedInstrumentTrack
          └─ EditableScore ─< ScoreRevision
```

## 주요 상태

- 역할: `OWNER`, `MEMBER`
- 기본 파트: `VOCAL`, `GUITAR`, `BASS`, `DRUMS`, `KEYBOARD`, `OTHER`
- 준비: `NOT_READY`, `PRACTICING`, `READY`
- 추천: `RECOMMENDED`, `CANDIDATE`, `ADOPTED`, `HOLD`
- 업로드/처리: `UPLOADING`, `UPLOADED`, `QUEUED`, `PROCESSING`, `PREPARING_AUDIO`,
  `COMPLETED`, `FAILED`

## 불변 조건

1. 좋아요와 채택 추천은 서로 독립적이다.
2. 곡 채택과 공식 Decision 변경은 Owner 권한을 확인한다.
3. 준비도는 임의 퍼센트가 아니라 실제 담당 파트의 상태를 집계한다.
4. Timeline Comment는 항상 `timelineSourceId`를 가진다.
5. Sync Offset 변경은 공통 Timeline Comment 시각을 변경하지 않는다.
6. Stem 캐시는 `workspaceId + source SHA-256 + separation configuration`으로 격리한다.
7. 실패한 처리 Job은 사용량을 소비하지 않는다.
8. ScoreSyncPoint의 `timeMs`는 Song의 공통 Timeline을 기준으로 한다.
9. PracticeTake의 Offset 변경은 원본 Source와 ScoreSyncPoint를 변경하지 않는다.
10. `PRIVATE` PracticeTake는 작성자 외의 Workspace Member에게 노출하지 않는다.
11. 한 User는 여러 Workspace의 Member가 될 수 있고, 파트와 역할은 Workspace별로 독립적이다.
12. 개인 일정·참여 곡 목록은 소속 Workspace 데이터의 통합 조회이며 별도 사본을 생성하지 않는다.
13. 곡 상세와 연습실 이동에는 Workspace와 Song 식별자를 함께 전달한다. 같은 곡 식별자가 있어도
    다른 Workspace의 자료나 준비 상태를 변경하지 않는다.

## 미디어 엔터티

- `ScoreAsset`: PDF, 이미지, Guitar Pro 등 악보 자료와 파트·지원 기능 메타데이터
- `ScoreSyncPoint`: 악보 페이지·구간과 공통 Timeline 시각의 연결
- `StemJob`: 원본 Source에 대한 분리 요청과 처리 상태
- `Stem`: StemJob에서 생성된 Vocal, Drums, Bass, Other TimelineSource
- `PracticeTake`: 멤버의 개인 녹음, 담당 파트, 기준 Source, Offset, 공개 범위
- `RehearsalRecording`: RehearsalSession에 속하며 공통 연습 Timeline과 분리된 별도 TimelineSource

## 개인 작업실 엔터티

- `PersonalAudioProject`: 개인 원본 음원, 분석 설정, 최근 분석 결과
- `DominantInstrumentExtractionJob`: Target Instrument, 우세도 분석, 분리 설정과 처리 상태
- `ExtractedInstrumentTrack`: 원본에서 분리된 대상 악기, 품질 지표, 누음 경고와 출력 설정
- `EditableScore`: 파트·마디·음표를 가진 구조화 악보 문서와 기준 음원 연결
- `ScoreRevision`: 자동 저장과 별도로 복원 가능한 악보 Snapshot
- `ScoreInstrumentSample`: 악보당 하나의 비공개 단음 녹음 Blob, 파일명, 기준 MIDI 음높이
  (미세 조율 포함), 사용 여부와 지속음 반복 설정. 기존 개인 미디어 저장 경로에 악보와 함께
  저장하고 MusicXML에는 포함하지 않는다. 감지 실패 시 기준 음을 직접 지정하기 전에는 사용하지
  않는다. 교체 실패 시 기존 샘플을 보존하며, 반복 여부와 피치 변환은 악보의 박자를 바꾸지 않는다.

개인 엔터티에는 `workspaceId`를 강제하지 않는다. Workspace로 보낼 때 새 Resource를 생성하며 개인
원본과 자동 동기화하지 않는다.

# 개인 일정과 의견 첨부

- 개인 일정은 밴드 문서와 분리하여 소유자 ID로 저장·조회·수정·삭제한다. 다른 멤버에게 개인 일정 데이터가 전달되지 않는다.
- 팀 일정은 기존 밴드 공유 문서를 사용하며 취소된 일정은 캘린더에서 제외한다.
- 의견과 답글은 선택적 videoUrl을 가진다. 첨부 수정 권한은 기존 작성자 권한을 따른다. 재생 주소는 허용된 영상 서비스 또는 HTTP(S) 영상 파일에서만 생성한다.
- 채택곡의 선택적 `goal`은 추천 이유와 구분되는 밴드 연주 목표다.
- 곡 할 일은 기존 `song/:id/checks` 문서에 선택적 `assigneeId`, `sourceOpinionId`를 추가한다. 의견 연결은 곡 안에서 중복 생성하지 않는다.
- 레퍼런스 링크는 `authorId`를 기록하며 작성자/관리자만 수정·삭제한다. 작성자가 없는 기존 링크는 관리자만 수정·삭제한다.
- 곡별 합주 회고는 `song/:songId/session/:sessionId/memo` 공유 문서다. 합주 전체 메모와 별개로 보관하며 다른 곡의 회고와 섞이지 않는다.
- 연습 BPM은 개인 연습 화면에만 적용하며 공유 편곡 BPM을 변경하지 않는다. 자료 음원 가져오기는 연습 트랙에 사본을 생성한다.
