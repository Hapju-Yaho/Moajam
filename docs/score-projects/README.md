# 악보 프로젝트 운영 DB 적용

## 화면 사용

곡 상세의 **PDF 악보 보기**는 등록한 파일을 열고, **악보 프로젝트 열기**는 밴드 안에서 해당 곡의 프로젝트를 엽니다. 기본 화면은 상단 파트 믹서와 악보 확인·재생용이며, **악보 편집**을 누르면 좌측의 악보·음표·주법 도구로 편집합니다. 모바일에서는 도구가 하단 패널로 열립니다. 가져오기·내보내기는 넓은 편집 화면의 기존 파일 패널에서 사용할 수 있습니다.

프로젝트 이름은 클릭해 수정하고 **서버에 저장**해야 반영됩니다. 새 프로젝트·다른 이름으로 저장·삭제와 저장되지 않은 변경사항 확인을 지원합니다. 프로젝트가 없으면 생성 안내가 표시됩니다. 파트 믹서는 악기별 M/S와 음량을 한 줄로 표시하며, 재생 중에도 음소거·솔로·음량을 조절할 수 있습니다. 메트로놈은 재생 도구의 BPM 왼쪽에 있습니다.

## 변경 사항

`score_projects` 테이블을 추가합니다. 악보 프로젝트에는 곡 ID, 이름, 전체 악보 데이터(파트별 버전·반주 연결 포함), 저장 충돌 검사용 revision, 이전 문서 키, 생성·수정·삭제 정보를 보관합니다. 기존 `workspace_documents` 악보 문서는 삭제하지 않습니다.

곡의 기존 `song/<곡ID>/score` 문서는 곡 이름의 프로젝트 하나로 이전합니다. 데이터 전체를 그대로 복사하므로 파트별 버전도 유지됩니다. 이전은 재실행해도 중복 생성되지 않으며, 삭제한 기본 프로젝트를 복구하지 않습니다. 악보가 없던 곡에는 빈 프로젝트를 자동 생성하지 않습니다.

DAW 프로젝트와 등록된 PDF·가사 데이터는 변경하지 않습니다.

## PostgreSQL을 사용하는 운영 서버

먼저 운영 DB와 파일 저장소를 백업하고, 서버의 기존 배포 방식에 따라 점검 시간을 확보하세요. 아래 명령은 **운영 서버의 저장소 루트**에서 실행합니다. 해당 서버의 `.env.local` 또는 배포 환경변수가 운영 DB를 가리키는지 확인하세요. 개발 PC의 DB를 복사해서 운영 DB를 덮어쓰지 않습니다.

```powershell
npm ci
npm run prisma:generate --workspace @moajam/server
npm run prisma:deploy --workspace @moajam/server
npm run build:server
npm run score-projects:migrate --workspace @moajam/server
npm run build
```

`prisma:deploy`는 커밋된 `20261027120000_score_projects` 마이그레이션을 운영 DB에 적용합니다. 이후 기존 방식으로 서버·웹을 함께 배포하고 재시작합니다. 운영 환경에서 `prisma migrate dev`, `db push --accept-data-loss`, `migrate reset`은 사용하지 마세요.

프로젝트 목록에 처음 접근할 때도 해당 곡이 자동 이전되지만, 배포 시 명령으로 미리 이전하면 오류를 먼저 확인할 수 있습니다. 이전 중 오류가 발생하면 원본은 유지되므로 원인을 확인하고 같은 명령을 재실행하세요.

## SQLite를 사용하는 서버

서버를 중지하고 `data/moajam.db`와 파일 저장소를 백업한 뒤 다음을 실행합니다.

```powershell
npm ci
npm run prisma:generate --workspace @moajam/server
npm run db:local --workspace @moajam/server
npm run build:server
npm run score-projects:migrate --workspace @moajam/server
npm run build
```

`DATABASE_URL`이 비어 있을 때만 로컬 SQLite 경로를 사용합니다. 외부 DB 설정을 임의로 지우지 말고 실제 운영 모드에 맞는 절차를 선택하세요.

## 배포 후 확인

1. 기존 악보가 있던 곡에서 곡 이름의 프로젝트가 하나 생성되고, 음표·주법·파트별 버전이 유지되는지 확인합니다.
2. 새 프로젝트와 다른 이름으로 저장이 서로 독립적인지 확인합니다.
3. 다른 브라우저에서 동시에 저장하면 뒤의 저장이 충돌 안내를 표시하는지 확인합니다.
4. 밴드 외 사용자는 목록과 프로젝트에 접근할 수 없는지 확인합니다.
5. PDF 악보 보기, DAW, 가사 기능이 유지되는지 확인합니다.

기존 웹 클라이언트가 원본 문서를 계속 수정하지 않도록 서버와 웹을 함께 배포하세요. 이전 후 편집 결과는 새 프로젝트에 저장됩니다. 이전 파일 원본을 삭제하거나 DB 마이그레이션을 되돌리는 작업은 이 절차에 포함하지 않습니다.

## 검증

```powershell
npm run test:score-projects --workspace @moajam/server
```

테스트는 저장소 `data` 하위에 독립적인 임시 DB를 만들고 제거하며, 실행 중인 개발·운영 DB에는 접근하지 않습니다.
