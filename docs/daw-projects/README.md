# 밴드 DAW 프로젝트 적용 안내

개인 프로젝트는 이번 변경에 포함하지 않는다. 아래 명령은 저장소 루트에서 실행한다.
로컬 개발 DB와 메인 서버 DB는 별개이며, 커밋·푸시만으로 메인 DB가 변경되지 않는다.
실제 서버에서 해당 환경의 설정을 사용해 별도로 적용해야 한다. DB 접속 정보와 저장소 비밀 키를 Git에 넣지 않는다.

## 서버 DB 변경 사항

- `daw_projects` 테이블 추가: ID, 밴드 ID, 곡 ID, 이름, DAW JSON, revision, 생성·수정자/시각, 삭제 시각, 기존 문서 키.
- 밴드 삭제 시 프로젝트도 함께 삭제하는 FK와 밴드·곡 조회 인덱스 추가.
- `(workspace_id, legacy_key)` 고유 제약으로 기본 프로젝트 중복 이전 방지.
- 기존 `workspace_documents`, `personal_documents`, `media_assets`는 삭제하지 않는다.
- 파일 저장소의 음원을 복사하거나 재인코딩하지 않고, 기존 파일 ID를 프로젝트 JSON에서 참조한다.
- 기본 프로젝트 이름은 기존 참여곡 제목이다. 이후 곡 제목을 수정해도 사용자가 정한 프로젝트 이름을 덮어쓰지 않는다.

관련 PostgreSQL 마이그레이션: `20261026090000_daw_projects`.
SQLite는 기존 프로젝트 실행 방식대로 Prisma 스키마를 `db push`로 반영한다. 데이터 삭제가 필요한 경우 명령이 중단되며, `--accept-data-loss`를 추가하지 않는다.

## 적용 전 준비

1. 사용자에게 작업실 변경사항을 저장하도록 안내하고 구 버전 웹/서버의 쓰기를 중단한다.
2. 서버에서 코드 버전을 확정하고 해당 서버의 `.env.local` 또는 환경변수를 확인한다. DB URL을 터미널 로그에 출력하지 않는다.
3. DB와 음원 저장소를 모두 백업한다. 외부 R2/Supabase 저장소를 사용하면 해당 저장소의 백업/스냅샷도 별도로 확보한다.
4. 스테이징 DB에서 먼저 동일 절차를 검증한다.

### SQLite 백업

서버를 정지한 상태에서 실행한다. 아래 명령은 외부 DB가 설정되어 있으면 중단한다.

```sh
node apps/server/scripts/backup-local-daw.mjs
```

`data/backups/before-daw-projects-<시각>/`에 SQLite 일관성 백업과 `data/files` 복사본을 만든다. 백업을 별도 안전한 위치에도 보관한다.

### PostgreSQL 백업

`pg_dump`가 설치된 서버에서 실제 접속 설정을 사용한다. `DATABASE_URL`은 운영 환경에 이미 설정돼 있어야 한다. `.env.local`에만 있는 값은 쉘에 자동으로 로드되지 않으므로 운영의 비밀 관리 방식으로 주입한다.

PowerShell:

```powershell
pg_dump --dbname $env:DATABASE_URL --format=custom --file before-daw-projects.dump
```

Linux:

```sh
pg_dump --dbname "$DATABASE_URL" --format=custom --file before-daw-projects.dump
```

접속 URL이 Prisma 전용 옵션을 포함하거나 풀링 주소인 경우 백업 도구용 직접 연결 주소를 사용한다. 마이그레이션은 프로젝트의 `DIRECT_URL` 설정을 따른다.

## SQLite 적용 순서

`DATABASE_URL`이 비어 있는 기존 로컬 SQLite 환경에만 사용한다.

```sh
npm ci
npm run db:local --workspace @moajam/server
npm run build --workspace @moajam/server
npm run daw-projects:migrate --workspace @moajam/server
npm run build --workspace @moajam/web
```

이후 기존 방식으로 서버와 웹을 시작/배포한다. 예를 들어 개발 환경에서는 `npm run dev:server`, `npm run dev:web`를 사용한다.

## PostgreSQL 적용 순서

메인 서버의 PostgreSQL 환경변수가 설정된 상태에서 실행한다. 운영 DB에서 `prisma migrate dev`나 SQLite용 `db push`를 실행하지 않는다.

```sh
npm ci
npm run prisma:deploy --workspace @moajam/server
npm run build --workspace @moajam/server
npm run daw-projects:migrate --workspace @moajam/server
npm run build --workspace @moajam/web
```

적용 후 기존 프로세스 관리자/배포 방식으로 서버를 재시작하고 새 웹 빌드를 배포한다. 구 웹을 계속 쓰면 기존 곡별 저장 API로 데이터가 분기될 수 있으므로 새로고침하도록 안내한다.

## 데이터 이전 동작

- 기존 DAW 기록이 있는 참여곡은 곡 제목의 기본 프로젝트로 이전한다.
- 우선 `workspace_documents`의 `song/<곡ID>/soundtrack`을 복사한다.
- 해당 문서가 없으면 밴드 멤버의 기존 `personal_documents` 중 `practice/<밴드ID>/<곡ID>`의 최신 기록을 복구한다. 개인 메모는 공유하지 않는다.
- 둘 다 없으면 프로젝트를 자동으로 만들지 않는다. 작업실의 ‘새 프로젝트’로 시작한다.
- 원본 문서는 보존한다. 기본 프로젝트가 이미 있으면 수정하지 않으므로 명령을 재실행할 수 있다.
- 삭제한 기본 프로젝트는 삭제 기록을 남겨 원본 데이터가 다시 나타나지 않게 한다.
- 파일이 없거나 다른 밴드 파일을 참조하면 해당 이전은 중단된다. 원인을 확인하고 다시 실행한다. 이미 이전된 프로젝트는 덮어쓰지 않는다.
- 새 API로 목록을 열 때도 같은 이전 검사를 수행하지만, 배포 전 일괄 이전 명령을 실행해 오류를 먼저 확인하는 것을 권장한다.

## 적용 확인

DB 관리 도구에서 다음 읽기 전용 쿼리를 실행한다.

```sql
SELECT workspace_id, song_id, name, revision, legacy_key, deleted_at
FROM daw_projects
ORDER BY workspace_id, song_id, created_at;
```

화면에서 아래를 확인한다.

- 기존 곡 제목의 프로젝트에서 트랙·클립·미디와 원본 음원이 정상 복원된다.
- 새 프로젝트를 만들고 공유한 뒤 새로고침해도 기존 프로젝트와 데이터가 섞이지 않는다.
- 복제 프로젝트는 같은 파일을 재사용하며 수정해도 원본 배치에 영향을 주지 않는다.
- 다른 멤버가 먼저 저장하면 충돌 안내가 나오고 덮어쓰지 않는다.
- 프로젝트를 전환할 때 미저장 변경 확인이 표시되고 녹음 중에는 전환이 차단된다.
- 프로젝트 삭제가 다른 프로젝트의 파일을 지우지 않는다.
- 다른 밴드의 프로젝트 API에 접근할 수 없다.
- 프로젝트가 없으면 빈 작업실 안내가 나오며 자동 생성하지 않는다.
- 이름 수정은 ‘저장’ 시 트랙 내용과 함께 반영된다. ‘다른 이름으로 저장’은 미저장 내용을 포함해 새 프로젝트를 만들고, 기존 작업 저장 여부를 선택할 수 있다.

## 실패 및 복구

서버를 중단한 상태로 유지하고 오류를 해결한 뒤 마이그레이션/이전 명령을 재실행한다. 실패한 PostgreSQL 마이그레이션을 임의로 완료 처리하거나 테이블을 삭제하지 않는다.

완전 복구가 필요하면 새 DB를 만들어 검증된 백업을 복원하고 서버 연결을 그 DB로 전환하는 것이 안전하다.

```sh
# PostgreSQL: 미리 생성한 비어 있는 복구 DB에 복원
pg_restore --no-owner --dbname <복구DB연결주소> before-daw-projects.dump
```

SQLite는 서버를 정지한 후 현재 `data/moajam.db` 및 WAL/SHM 파일을 별도 보관하고, 백업한 `moajam.db`와 `files`를 복원한다. 기존 파일 위에 불완전하게 섞지 말고 별도 디렉터리에서 검증한다.

백업 복구는 백업 이후의 변경을 되돌린다. 새 프로젝트에서 작업한 데이터가 있다면 먼저 현재 DB와 파일을 추가 백업한다. 구 코드로만 되돌리면 새 프로젝트 변경이 예전 곡별 DAW에 자동 반영되지는 않는다.
