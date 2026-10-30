import { downloadBlob } from '../lib/platformActions.web';

export type PdfDiagnostics = {
  boundaryAlignment?: {
    part: string;
    page: number;
    system: number;
    before: number[][];
    after: number[][];
  }[];
  measureCrops?: {
    measures?: { number: number; bounds: number[] }[];
    part: string;
    page: number;
    measure: number;
    width: number;
    height: number;
    bounds: number[];
  }[];
  stages?: PdfDiagnostics[];
  outcome?: 'completed' | 'failed' | 'review';
  phase: string;
  model?: string;
  responseId?: string;
  requestId?: string;
  httpStatus?: number;
  providerStatus?: string;
  incompleteReason?: string;
  elapsedMs?: number;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  reasoningTokens?: number;
  outputTextCharacters?: number;
  jsonParsed?: boolean;
  parts?: { id: string; name: string; measures: number; events: number }[];
  warnings?: { part: string; measure: number | null; code: string }[];
  outputExcerpt?: string;
  excerptTruncated?: boolean;
  networkCode?: string;
  errorType?: string;
  signalAborted?: boolean;
  outputJson?: string;
  conversion?: {
    logicalParts: number;
    staves: number;
    measures: {
      part: string;
      measure: number;
      sourceMeasure: number;
      expectedBeats: number;
      actualBeats: number;
      events: number;
      rests: number;
      tuplets: number;
      ghosts: number;
    }[];
  };
  conversionWarnings?: { part: string; measure: number; code: string }[];
};
export function ScorePdfDiagnostics({ value }: { value: PdfDiagnostics }) {
  const phases: Record<string, string> = {
    request: '연결 요청',
    response: '응답 해석',
    conversion: '악보 검증·변환',
  };
  return (
    <details className="score-pdf-diagnostics">
      <summary>
        {value.outcome === 'review'
          ? '구조 분석 진단 정보 (임시)'
          : value.outcome === 'completed'
            ? '추출 성공 진단 정보 (임시)'
            : '실패 응답 진단 정보 (임시)'}
      </summary>
      <p>최근 시도의 정보입니다. 서버 재시작 또는 작업 만료 시 사라집니다.</p>
      {!!value.boundaryAlignment?.length && (
        <p>
          PDF의 실제 오선·타브와 마디선을 확인해 {value.boundaryAlignment.length}개 악보 줄의 좌우
          경계를 보정했어요. 보정 전후 좌표는 진단 JSON에 포함됩니다.
        </p>
      )}
      {!!value.measureCrops?.length && (
        <p>
          마디 확대 이미지 {value.measureCrops.length}개를 함께 전송했어요. 진단에는 이미지
          크기·좌표만 보관합니다.
        </p>
      )}
      {!!value.stages?.length && (
        <p>
          이번 시도 {value.stages.length}단계 응답 · 입력{' '}
          {value.stages.reduce((n, s) => n + (s.inputTokens ?? 0), 0).toLocaleString()} / 출력{' '}
          {value.stages.reduce((n, s) => n + (s.outputTokens ?? 0), 0).toLocaleString()} 토큰.
          단계별 응답은 다운로드한 진단 JSON의 stages에 포함됩니다.
        </p>
      )}
      <dl>
        <dt>처리 단계</dt>
        <dd>{phases[value.phase] ?? value.phase}</dd>
        <dt>모델 / 처리 시간</dt>
        <dd>
          {value.model ?? '—'} /{' '}
          {value.elapsedMs === undefined ? '—' : `${(value.elapsedMs / 1000).toFixed(1)}초`}
        </dd>
        <dt>응답 상태 / HTTP</dt>
        <dd>
          {value.providerStatus ?? '응답 없음'} / {value.httpStatus ?? '—'}
        </dd>
        <dt>중단 사유</dt>
        <dd>
          {value.incompleteReason ?? value.networkCode ?? value.errorType ?? '—'}
          {value.signalAborted ? ' · 요청 중단됨' : ''}
        </dd>
        <dt>이 시도 토큰</dt>
        <dd>
          입력 {value.inputTokens?.toLocaleString() ?? '—'} / 출력{' '}
          {value.outputTokens?.toLocaleString() ?? '—'} / 추론{' '}
          {value.reasoningTokens?.toLocaleString() ?? '—'}
        </dd>
        <dt>출력 / JSON 해석</dt>
        <dd>
          {value.outputTextCharacters?.toLocaleString() ?? '—'}자 /{' '}
          {value.jsonParsed === undefined
            ? '확인 불가'
            : value.jsonParsed
              ? '성공'
              : '완료하지 못함'}
        </dd>
        <dt>인식 파트</dt>
        <dd>
          {value.parts?.length ?? 0}개
          {value.parts?.map((p, i) => (
            <div key={i}>
              {p.name || p.id || '(이름 없음)'} · {p.measures}마디 · {p.events}이벤트
            </div>
          ))}
        </dd>
        <dt>GPT 경고</dt>
        <dd>
          {value.warnings?.length
            ? value.warnings.map((w, i) => (
                <div key={i}>
                  {w.part} {w.measure ?? ''} · {w.code}
                </div>
              ))
            : '없음'}
        </dd>
        <dt>응답 ID</dt>
        <dd>{value.responseId ?? '—'}</dd>
        <dt>요청 ID</dt>
        <dd>{value.requestId ?? '—'}</dd>
        {value.conversion && (
          <>
            <dt>변환 결과</dt>
            <dd>
              {value.conversion.logicalParts}개 파트 · {value.conversion.staves}개 보표 · 셋잇단{' '}
              {value.conversion.measures.reduce((n, m) => n + m.tuplets, 0)}개 · 고스트{' '}
              {value.conversion.measures.reduce((n, m) => n + m.ghosts, 0)}개
            </dd>
            <dt>변환 경고</dt>
            <dd>{value.conversionWarnings?.length ?? 0}개</dd>
          </>
        )}
      </dl>
      <strong>GPT 출력 내용{value.excerptTruncated ? ' (앞부분만 표시)' : ''}</strong>
      <pre>{value.outputExcerpt || '반환된 출력 텍스트가 없습니다.'}</pre>
      {value.outputJson && value.excerptTruncated && (
        <p>전체 인식 JSON과 마디별 변환 통계는 진단 파일에 포함됩니다.</p>
      )}
      <button
        type="button"
        onClick={() =>
          downloadBlob(
            value.outcome === 'completed'
              ? 'pdf-success-diagnostics.json'
              : 'pdf-failure-diagnostics.json',
            new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }),
          )
        }
      >
        진단 정보 다운로드
      </button>
    </details>
  );
}
