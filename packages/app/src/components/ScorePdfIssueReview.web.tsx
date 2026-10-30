import { useEffect, useRef, useState } from 'react';
import type { PdfStructure } from './ScorePdfStructureReview.web';

export type PdfReviewIssue = {
  part: string;
  page: number;
  measure: number;
  code: string;
  message: string;
  kind?: string;
  bounds?: number[];
  eventIndex?: number;
  source?: 'model';
  blocking?: boolean;
};
const labels: Record<string, string> = {
  drum: '드럼 악기·음표 머리',
  pitch: '음높이·임시표',
  fret: '프렛 숫자',
  string: '줄 번호',
  rhythm: '리듬',
  tuplet: '잇단음표',
  tie: '붙임줄',
  technique: '주법',
  other: '기타',
};
const pdfIssueKey = (v: { part: string; page: number; measure: number }) =>
  JSON.stringify([v.part, v.page, v.measure]);

export function ScorePdfIssueReview({
  file,
  structure,
  issues,
  recognizedHits = [],
  selected,
  onToggle,
  onRetry,
  onForceInference,
  busy,
}: {
  file: File | null;
  structure: PdfStructure;
  issues: PdfReviewIssue[];
  recognizedHits?: {
    part: string;
    page: number;
    measure: number;
    voice: string;
    pitch: number;
    x: number;
    y: number;
  }[];
  selected: string[];
  onToggle: (key: string, checked: boolean) => void;
  onRetry: () => void;
  onForceInference: () => void;
  busy: boolean;
}) {
  const groups = issues.reduce<
    { key: string; part: string; page: number; measure: number; issues: PdfReviewIssue[] }[]
  >((all, issue) => {
    const key = pdfIssueKey(issue),
      group = all.find((g) => g.key === key);
    if (group) group.issues.push(issue);
    else
      all.push({
        key,
        part: issue.part,
        page: issue.page,
        measure: issue.measure,
        issues: [issue],
      });
    return all;
  }, []);
  if (recognizedHits.length) {
    for (const p of structure.parts.filter((p) => p.instrument === 'drums'))
      for (const m of p.measures) {
        const key = pdfIssueKey({ part: p.id, page: m.page, measure: m.number });
        if (!groups.some((g) => g.key === key))
          groups.push({ key, part: p.id, page: m.page, measure: m.number, issues: [] });
      }
  }
  const problemGroups = groups.filter((g) => g.issues.length);
  const [showHits, setShowHits] = useState(true);
  const [active, setActive] = useState(groups[0]?.key ?? '');
  const [page, setPage] = useState(groups[0]?.page ?? 1);
  const [ratio, setRatio] = useState(1);
  const [error, setError] = useState('');
  const canvas = useRef<HTMLCanvasElement>(null);
  const marks = useRef<SVGSVGElement>(null);
  const issueList = useRef<HTMLDivElement>(null);
  const pageCount = Math.max(1, ...structure.parts.flatMap((p) => p.measures.map((m) => m.page)));
  const activeGroup = groups.find((g) => g.key === active);
  const focus = (key: string, targetPage: number) => {
    setActive(key);
    setPage(targetPage);
    // Clicking the already-active measure should also reveal a list item that
    // the user has subsequently scrolled away from.
    issueList.current?.querySelectorAll('article').forEach((article) => {
      if (article.dataset.issueKey === key)
        article.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    });
  };
  useEffect(() => {
    const node = marks.current?.querySelector('[data-active="true"]');
    node?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    issueList.current
      ?.querySelector('[data-active="true"]')
      ?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [active, page, ratio]);
  useEffect(() => {
    if (!file) return;
    let alive = true,
      dispose: (() => void) | undefined;
    setError('');
    void (async () => {
      const engine = await import('pdfjs-dist');
      engine.GlobalWorkerOptions.workerSrc = new URL(
        'pdfjs-dist/build/pdf.worker.min.mjs',
        import.meta.url,
      ).toString();
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (!alive) return;
      const task = engine.getDocument({ data: bytes });
      dispose = () => {
        void task.destroy();
      };
      try {
        const pdf = await task.promise,
          sheet = await pdf.getPage(page);
        if (!alive || !canvas.current) return;
        const original = sheet.getViewport({ scale: 1 }),
          viewport = sheet.getViewport({ scale: Math.min(2, 1800 / original.width) });
        setRatio(viewport.width / viewport.height);
        const target = canvas.current;
        target.width = viewport.width;
        target.height = viewport.height;
        const context = target.getContext('2d');
        if (!context) throw Error('PDF를 표시하지 못했어요.');
        const render = sheet.render({ canvas: target, canvasContext: context, viewport });
        dispose = () => {
          render.cancel();
          void task.destroy();
        };
        await render.promise;
      } finally {
        await task.destroy();
      }
    })().catch((e) => {
      if (alive) setError(e instanceof Error ? e.message : 'PDF를 표시하지 못했어요.');
    });
    return () => {
      alive = false;
      dispose?.();
    };
  }, [file, page]);
  const blockedGroups = groups.filter((g) => g.issues.some((i) => i.blocking !== false));
  const count = groups.filter((g) => selected.includes(g.key)).length;
  return (
    <section className="score-pdf-issue-review" aria-label="PDF 불확실한 마디 검토">
      <h3>인식 결과·불확실한 마디 확인</h3>
      <small>
        파란색은 오류 없이 인식된 마디, 주황색은 추정·경고가 있는 편집 가능한 마디, 빨간색은 편집
        불가 마디입니다. 선택한 마디는 파란 테두리로 강조합니다. 점선 상자는 모델이 추정한 의심 기호
        위치입니다.
      </small>
      {!!recognizedHits.length && (
        <label
          style={{
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'flex-start',
            gap: 6,
          }}
        >
          <input
            type="checkbox"
            style={{ width: 'auto', flex: '0 0 auto' }}
            checked={showHits}
            onChange={(e) => setShowHits(e.target.checked)}
          />
          인식한 드럼 타격 위치 표시 · 초록색 원은 모델의 추정 위치입니다. 표시가 없는 곳도 직접
          확인해주세요.
        </label>
      )}
      <div className="score-pdf-issue-layout">
        <div className="score-pdf-issue-left">
          <label>
            PDF 페이지{' '}
            <input
              aria-label="오류 PDF 페이지"
              type="number"
              min={1}
              max={pageCount}
              value={page}
              onChange={(e) =>
                setPage(Math.max(1, Math.min(pageCount, Number(e.target.value) || 1)))
              }
            />
          </label>
          <div className="score-pdf-issue-pages">
            {!file ? (
              <p>원본 PDF가 없어 위치를 표시할 수 없어요.</p>
            ) : (
              <div className="score-pdf-structure-page" style={{ aspectRatio: ratio }}>
                <canvas ref={canvas} />
                <svg
                  ref={marks}
                  viewBox="0 0 1000 1000"
                  preserveAspectRatio="none"
                  aria-label="PDF 오류 위치"
                >
                  {structure.parts.flatMap((p) =>
                    p.measures
                      .filter((m) => m.page === page)
                      .map((m) => {
                        const key = pdfIssueKey({ part: p.id, page: m.page, measure: m.number }),
                          group = groups.find((g) => g.key === key),
                          isActive = activeGroup?.key === key,
                          isSelected = selected.includes(key),
                          editable = !group || group.issues.every((i) => i.blocking === false),
                          color = !group?.issues.length
                            ? '#2764bd'
                            : editable
                              ? '#cb7415'
                              : '#c74343';
                        const b = m.bounds;
                        return (
                          <g
                            key={key}
                            role="button"
                            tabIndex={0}
                            aria-label={`${p.name} ${m.number}마디 ${group?.issues.length ? '검토 필요' : '검출된 오류 없음'}`}
                            onClick={() => focus(key, m.page)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                focus(key, m.page);
                              }
                            }}
                          >
                            <rect
                              data-active={isActive}
                              x={b[0]}
                              y={b[1]}
                              width={Math.max(0, b[2] - b[0])}
                              height={Math.max(0, b[3] - b[1])}
                              fill={
                                !group?.issues.length
                                  ? `rgba(39,100,189,${isSelected || isActive ? '.22' : '.09'})`
                                  : editable
                                    ? `rgba(225,135,30,${isSelected || isActive ? '.24' : '.10'})`
                                    : `rgba(210,50,50,${isSelected || isActive ? '.22' : '.10'})`
                              }
                              stroke={color}
                              strokeWidth={isSelected || isActive ? 4 : 1.5}
                              data-selected={isSelected}
                              data-editable={editable}
                              vectorEffect="non-scaling-stroke"
                            />
                            {(isSelected || isActive) && (
                              <rect
                                x={b[0] + 3}
                                y={b[1] + 3}
                                width={Math.max(0, b[2] - b[0] - 6)}
                                height={Math.max(0, b[3] - b[1] - 6)}
                                fill="none"
                                stroke="#2764bd"
                                strokeWidth={2}
                                strokeDasharray={isSelected ? undefined : '5 3'}
                                vectorEffect="non-scaling-stroke"
                                pointerEvents="none"
                              />
                            )}
                            <text x={b[0] + 3} y={b[1] + 16} fontSize={14} fill={color}>
                              {p.name} ·{' '}
                              {m.restCount
                                ? `${m.number}~${m.number + m.restCount - 1} · ${m.restCount}마디 쉼표`
                                : m.number}
                            </text>
                            {showHits &&
                              recognizedHits
                                .filter(
                                  (hit) =>
                                    hit.part === p.id &&
                                    hit.page === m.page &&
                                    hit.measure === m.number,
                                )
                                .map((hit, index) => (
                                  <circle
                                    key={`hit-${index}`}
                                    cx={hit.x}
                                    cy={hit.y}
                                    r={4}
                                    fill="rgba(30,180,120,.35)"
                                    stroke="#12855c"
                                    strokeWidth={1.5}
                                    vectorEffect="non-scaling-stroke"
                                    pointerEvents="none"
                                  >
                                    <title>{`GM ${hit.pitch} / ${hit.voice}`}</title>
                                  </circle>
                                ))}
                            {group?.issues
                              .filter((i) => i.bounds?.length === 4)
                              .map((issue, index) => {
                                const r = issue.bounds!;
                                return (
                                  <rect
                                    key={index}
                                    x={r[0]}
                                    y={r[1]}
                                    width={r[2] - r[0]}
                                    height={r[3] - r[1]}
                                    fill="rgba(220,60,60,.22)"
                                    stroke="#b92f2f"
                                    strokeWidth={2}
                                    strokeDasharray="4 3"
                                    vectorEffect="non-scaling-stroke"
                                  >
                                    <title>{issue.message}</title>
                                  </rect>
                                );
                              })}
                          </g>
                        );
                      }),
                  )}
                </svg>
              </div>
            )}
          </div>
          {error && <p role="alert">{error}</p>}
        </div>
        <div className="score-pdf-issue-right">
          <div className="score-pdf-issue-selection-tools">
            <button
              type="button"
              disabled={busy || !problemGroups.length || problemGroups.length > 128}
              onClick={() =>
                problemGroups.forEach((g) =>
                  onToggle(g.key, !problemGroups.every((v) => selected.includes(v.key))),
                )
              }
            >
              {problemGroups.length > 0 && problemGroups.every((g) => selected.includes(g.key))
                ? '선택 해제'
                : '문제 마디 전체 선택'}
            </button>
            <button
              type="button"
              disabled={busy || !blockedGroups.length || blockedGroups.length > 128}
              onClick={() => groups.forEach((g) => onToggle(g.key, blockedGroups.includes(g)))}
            >
              편집 불가 마디 선택
            </button>
          </div>
          <div className="score-pdf-issue-list" ref={issueList}>
            {groups.map((group) => (
              <article
                data-editable={group.issues.every((i) => i.blocking === false)}
                data-issue-key={group.key}
                data-active={activeGroup?.key === group.key}
                key={group.key}
                className={activeGroup?.key === group.key ? 'active' : undefined}
              >
                <div className="score-pdf-issue-heading">
                  <input
                    type="checkbox"
                    aria-label={`${group.part} ${group.measure}마디 일괄 재분석 선택`}
                    checked={selected.includes(group.key)}
                    disabled={busy || (!selected.includes(group.key) && count >= 128)}
                    onChange={(e) => {
                      onToggle(group.key, e.target.checked);
                      focus(group.key, group.page);
                    }}
                  />
                  <button type="button" onClick={() => focus(group.key, group.page)}>
                    {structure.parts.find((p) => p.id === group.part)?.name ?? group.part} ·{' '}
                    {group.measure}마디
                  </button>
                </div>
                <small>{group.page}페이지</small>
                {!!recognizedHits.length && (
                  <p>
                    인식 위치{' '}
                    {
                      recognizedHits.filter(
                        (hit) =>
                          hit.part === group.part &&
                          hit.page === group.page &&
                          hit.measure === group.measure,
                      ).length
                    }
                    개 · 원본의 타격과 비교해주세요.
                  </p>
                )}
                {group.issues.map((issue, i) => (
                  <p key={i}>
                    {issue.blocking === false && <strong>편집 가능한 참고 항목 · </strong>}
                    {issue.kind && <strong>{labels[issue.kind] ?? issue.kind} · </strong>}
                    {issue.eventIndex && <span>{issue.eventIndex}번째 이벤트(모델 추정) · </span>}
                    {issue.message}
                    <small>
                      {issue.bounds
                        ? '모델 추정 기호 위치 표시'
                        : '기호 위치 미제공 · 마디 전체 표시'}
                    </small>
                  </p>
                ))}
              </article>
            ))}
          </div>
          <div className="score-pdf-issue-actions">
            <button type="button" disabled={busy || !count || count > 128} onClick={onRetry}>
              선택한 마디 재분석 ({count})
            </button>
            <button
              type="button"
              disabled={busy || !count || count > 128}
              onClick={onForceInference}
              title="불확실한 음높이·박자(타브는 줄·프렛)를 추정하고 주법과 연결 기호는 생략합니다."
            >
              강제 추론
            </button>
          </div>
        </div>
      </div>
      <small>강제 추론은 임의 추정이 포함됩니다. 추출한 악보를 원본과 비교해 수정해주세요.</small>
      <small>
        전체 PDF 대신 선택 마디 확대 이미지와 악기·박자·범례 문맥을 보내 재분석합니다. 이미지 입력
        토큰과 API 1회 호출 비용이 발생합니다. 원본에 범례가 없으면 악기 식별은 추정일 수 있습니다.
      </small>
    </section>
  );
}
