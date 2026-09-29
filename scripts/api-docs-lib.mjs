import { readFileSync } from 'node:fs';
import { URL } from 'node:url';
import yaml from 'js-yaml';

export const specPath = new URL('../apps/server/openapi.yaml', import.meta.url);
export const catalogPath = new URL('../apps/server/docs/api-catalog.md', import.meta.url);
export const methods = new Set([
  'get',
  'post',
  'put',
  'patch',
  'delete',
  'options',
  'head',
  'trace',
]);

export function readSpec() {
  return yaml.load(readFileSync(specPath, 'utf8'));
}

export function operations(spec) {
  return Object.entries(spec.paths).flatMap(([path, item]) =>
    Object.entries(item)
      .filter(([method]) => methods.has(method))
      .map(([method, operation]) => ({ path, method, operation })),
  );
}

export function renderCatalog(spec) {
  const rows = operations(spec);
  const model = (schema) => schema?.$ref?.split('/').at(-1) ?? '—';
  const lines = [
    '# API 전체 목록',
    '',
    `기준: ${spec.info.version}. 총 **${rows.length}개 operation**. 모든 경로 앞에 \`/v1\`이 붙는다.`,
    '',
    '**목표 계약**이며 현재 구현 여부는 [구현 현황](./implementation-status.md)을 참고한다.',
    '요청·응답 필드, 필수값, 예시, HTTP 상태는 [OpenAPI](../openapi.yaml)와 Swagger에 정의한다.',
    '이 목록은 OpenAPI에서 생성한다. 수정 후 `npm run docs:catalog`, 검사는 `npm run docs:check`.',
    '',
    '## 화면과 API 연결',
    '',
    '| 화면/흐름 | API 그룹 | 주요 데이터 |',
    '| --- | --- | --- |',
    '| 카카오 로그인·임시 로그인 | 카카오 코드 교환·서비스 JWT / 개발 임시 인증 + Me | Auth 사용자, Profile |',
    '| 개인 홈·참여 곡 | Me | 밴드·일정·배정 곡 통합 조회 |',
    '| 개인 일정·전체 캘린더 | Schedules | PersonalSchedule + Rehearsal |',
    '| 밴드 홈·멤버·초대 | Workspaces | Workspace, Member, Invitation |',
    '| 추천 목록·상세 | Recommendations | Recommendation, Reaction, Comment |',
    '| 채택곡 목록·개요 | Songs | Song, SongPart, 준비 집계 |',
    '| 곡 의견·결정·할 일 | Opinions | Opinion, Decision, ChecklistItem |',
    '| 자료·레퍼런스 | Resources | Asset, UploadSession, SongResource, Reference |',
    '| 연습실·악보 Sync·녹음 | Practice, Jobs | Timeline, Take, SyncPoint, StemJob |',
    '| 합주 일정·기록 | Rehearsals, Resources | Session, Attendance, Setlist, Recording |',
    '| 알림함·리마인드 | Notifications | Notification |',
    '| 내 악기 추출 | PersonalTools | AudioProject, ExtractionJob |',
    '| 악보 편집·복원·내보내기 | Scores | EditableScore, Revision, ExportJob |',
    '| 도움말·ICS 내보내기·Player 조작 | 초기에는 클라이언트 | 별도 서버 API 불필요 |',
    '',
    'P0는 기반·협업, P1은 연습·미디어, P2는 개인 도구 확장이다. 구현 순서이며 기능 제외가 아니다.',
    '권한 약어는 [공통 계약](./api-design.md)을 따른다. 파생 조회 모델에는 쓰기 API를 만들지 않는다.',
    '',
  ];
  for (const tag of spec.tags) {
    lines.push(
      `## ${tag.name} — ${tag.description}`,
      '',
      '| Method | 경로 | 동작 | 요청 | 응답 | 권한 |',
      '| --- | --- | --- | --- | --- | --- |',
    );
    for (const { path, method, operation: op } of rows.filter((row) =>
      row.operation.tags.includes(tag.name),
    )) {
      const response = Object.entries(op.responses).find(([code]) => /^2\d\d$/.test(code));
      const request = model(op.requestBody?.content?.['application/json']?.schema);
      const result = model(response?.[1]?.content?.['application/json']?.schema);
      lines.push(
        `| ${method.toUpperCase()} | \`${path}\` | ${op.summary} | ${request} | ${response?.[0]} ${result} | ${op['x-permission']} |`,
      );
    }
    lines.push('');
  }
  return `${lines.join('\n')}\n`;
}
