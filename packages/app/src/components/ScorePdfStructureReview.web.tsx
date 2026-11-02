import type { PDFDocumentProxy } from 'pdfjs-dist';
import { createPortal } from 'react-dom';
import { changeMeasureBounds, moveMeasureRow } from '../lib/pdf-measure-bounds';
import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from 'react';

export type PdfStructure = {
  bpm: number | null;
  key: number | null;
  warnings: { part: string; measure: number; code: string }[];
  parts: {
    id: string;
    name: string;
    instrument: string;
    capo: number;
    tabLines: number | null;
    measures: {
      restCount?: number | null;
      number: number;
      page: number;
      meter: number[];
      system: number;
      bounds: number[];
    }[];
  }[];
};
export function ScorePdfStructureReview({
  file,
  structure,
  pages,
  busy,
  onConfirm,
  confirmLabel = '확인 후 음표 분석',
  confirmHost,
  measureOnly = false,
  onReanalyze,
}: {
  file: File | null;
  structure: PdfStructure;
  pages: number;
  busy: boolean;
  onConfirm: (value: PdfStructure) => void;
  confirmLabel?: string;
  confirmHost?: HTMLElement | null;
  measureOnly?: boolean;
  onReanalyze?: () => void;
}) {
  const [draft, setDraft] = useState(structure);
  const [part, setPart] = useState(0);
  const [selected, setSelected] = useState(0);
  const [page, setPage] = useState(structure.parts[0]?.measures[0]?.page ?? 1);
  const [mode, setMode] = useState<'select' | 'draw' | 'add'>('select');
  const [error, setError] = useState('');
  const [drawing, setDrawing] = useState<number[] | null>(null);
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const pageElements = useRef(new Map<number, HTMLDivElement>());
  const origin = useRef<number[] | null>(null);
  const drawingPage = useRef(1);
  const edgeDrag = useRef<{ selected: number; edge: number } | null>(null);
  const repeatTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pointerClick = useRef(false);
  const stopRepeat = () => {
    if (repeatTimer.current !== null) clearTimeout(repeatTimer.current);
    repeatTimer.current = null;
  };
  useEffect(() => {
    stopRepeat();
    const stop = () => stopRepeat();
    window.addEventListener('blur', stop);
    document.addEventListener('visibilitychange', stop);
    return () => {
      stopRepeat();
      window.removeEventListener('blur', stop);
      document.removeEventListener('visibilitychange', stop);
    };
  }, [part, selected, page, busy]);
  useEffect(() => {
    if (!file) return;
    let active = true;
    let dispose: (() => void) | undefined;
    setError('');
    setPdf(null);
    void (async () => {
      const engine = await import('pdfjs-dist');
      engine.GlobalWorkerOptions.workerSrc = new URL(
        'pdfjs-dist/build/pdf.worker.min.mjs',
        import.meta.url,
      ).toString();
      if (!active) return;
      const task = engine.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
      dispose = () => {
        void task.destroy();
      };
      try {
        const pdf = await task.promise;
        if (active) setPdf(pdf);
        else await task.destroy();
      } catch (error) {
        await task.destroy();
        throw error;
      }
    })().catch((e) => {
      if (active) setError(e instanceof Error ? e.message : 'PDF를 표시하지 못했어요.');
    });
    return () => {
      active = false;
      dispose?.();
    };
  }, [file]);
  useEffect(() => {
    pageElements.current.get(page)?.scrollIntoView({ block: 'nearest' });
  }, [page]);
  const current = draft.parts[part];
  const bar = current?.measures[selected];
  const update = (
    change: (
      rows: PdfStructure['parts'][number]['measures'],
    ) => PdfStructure['parts'][number]['measures'],
  ) => {
    setDraft((prev) => ({
      ...prev,
      parts: prev.parts.map((p, i) => (i === part ? { ...p, measures: change(p.measures) } : p)),
    }));
  };
  const renumber = (rows: PdfStructure['parts'][number]['measures']) => {
    let number = current.measures[0]?.number ?? 1;
    return rows.map((m) => {
      const value = { ...m, number };
      number += m.restCount ?? 1;
      return value;
    });
  };
  const point = (e: PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return [
      Math.round(Math.max(0, Math.min(1000, ((e.clientX - rect.left) / rect.width) * 1000))),
      Math.round(Math.max(0, Math.min(1000, ((e.clientY - rect.top) / rect.height) * 1000))),
    ];
  };
  const errors: string[] = [];
  for (const p of draft.parts) {
    if (!p.measures.length) errors.push(`${p.name}: 마디가 필요합니다.`);
    p.measures.forEach((m, i) => {
      const b = m.bounds;
      if (
        m.page < 1 ||
        m.page > pages ||
        !Number.isInteger(m.page) ||
        !Number.isInteger(m.system) ||
        m.system < 1 ||
        b.length !== 4 ||
        b.some((n) => !Number.isInteger(n) || n < 0 || n > 1000) ||
        b[0] >= b[2] ||
        b[1] >= b[3]
      )
        errors.push(`${p.name} ${m.number}마디: 좌표·페이지를 확인해주세요.`);
      const before = p.measures[i - 1];
      if (
        before &&
        (m.page < before.page ||
          (m.page === before.page &&
            (m.system < before.system ||
              (m.system === before.system && b[0] < before.bounds[2] - 2))))
      )
        errors.push(`${p.name} ${m.number}마디: 앞 마디와 겹치거나 순서가 다릅니다.`);
    });
  }
  return (
    <section className="score-pdf-structure-review">
      <h3>마디 경계 확인</h3>
      <p>
        상자는 한 마디의 오선·타브 전체를 감싸야 합니다. 잘못 나뉜 마디를 합치거나 나누고
        확인해주세요. 오른쪽 조절판의 화살표로 선택 마디의 각 경계를 넓히거나 좁힐 수 있어요.
      </p>
      <div className="score-pdf-structure-tools">
        <label>
          파트{' '}
          <select
            value={part}
            onChange={(e) => {
              setPart(Number(e.target.value));
              setSelected(0);
              setPage(draft.parts[Number(e.target.value)].measures[0]?.page ?? 1);
            }}
          >
            {draft.parts.map((p, i) => (
              <option key={p.id} value={i}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          페이지{' '}
          <input
            type="number"
            min={1}
            max={pages}
            value={page}
            onChange={(e) => setPage(Math.max(1, Math.min(pages, Number(e.target.value) || 1)))}
          />
        </label>
        <button type="button" aria-pressed={mode === 'select'} onClick={() => setMode('select')}>
          선택
        </button>
        <button
          type="button"
          disabled={!bar}
          aria-pressed={mode === 'draw'}
          onClick={() => setMode('draw')}
        >
          선택 마디 다시 그리기
        </button>
        <button type="button" aria-pressed={mode === 'add'} onClick={() => setMode('add')}>
          마디 그려서 추가
        </button>
        {onReanalyze && <button type="button" className="score-pdf-structure-reanalyze" disabled={busy} onClick={onReanalyze}>
          마디 다시 분석 (API 다시 호출)
        </button>}
      </div>
      <div className="score-pdf-structure-layout">
        <div className="score-pdf-structure-pages">
          {!file ? (
            <p role="alert">원본 PDF를 다시 선택해주세요.</p>
          ) : (
            Array.from({ length: pages }, (_, i) => i + 1).map((pageNumber) => {
              const page = pageNumber;
              return <div key={page} ref={(node) => { if (node) pageElements.current.set(page, node); else pageElements.current.delete(page); }}>
              <p className="score-pdf-page-label">{page}페이지</p>
              <StructurePage pdf={pdf} page={page}>

              <svg
                viewBox="0 0 1000 1000"
                preserveAspectRatio="none"
                aria-label="PDF 마디 경계"
                style={{ touchAction: mode === 'select' ? 'auto' : 'none' }}
                onPointerDown={(e) => {
                  if (mode === 'select') return;
                  if (mode === 'draw' && bar?.page !== page) return;
                  drawingPage.current = page;
                  origin.current = point(e);
                  setDrawing([...origin.current, ...origin.current]);
                  e.currentTarget.setPointerCapture(e.pointerId);
                }}
                onPointerMove={(e) => {
                  if (!origin.current) return;
                  const p = point(e);
                  setDrawing([
                    Math.min(origin.current[0], p[0]),
                    Math.min(origin.current[1], p[1]),
                    Math.max(origin.current[0], p[0]),
                    Math.max(origin.current[1], p[1]),
                  ]);
                }}
                onPointerCancel={() => {
                  origin.current = null;
                  setDrawing(null);
                }}
                onPointerUp={(e) => {
                  if (!origin.current) return;
                  const p = point(e),
                    o = origin.current;
                  origin.current = null;
                  setDrawing(null);
                  const bounds = [
                    Math.min(o[0], p[0]),
                    Math.min(o[1], p[1]),
                    Math.max(o[0], p[0]),
                    Math.max(o[1], p[1]),
                  ];
                  if (bounds[2] - bounds[0] < 5 || bounds[3] - bounds[1] < 5) return;
                  if (mode === 'draw')
                    update((rows) =>
                      changeMeasureBounds(rows, selected, bounds),
                    );
                  else
                    update((rows) =>
                      renumber(
                        [
                          ...rows,
                          {
                            number: 1,
                            page,
                            system: bar?.system ?? 1,
                            meter: bar?.meter ?? [4, 4],
                            bounds,
                          },
                        ].sort(
                          (a, b) =>
                            a.page - b.page || a.system - b.system || a.bounds[0] - b.bounds[0],
                        ),
                      ),
                    );
                  setMode('select');
                }}
              >
                {current?.measures.map(
                  (m, i) =>
                    m.page === page && (
                      <g
                        key={`${i}:${m.number}`}
                        onClick={() => {
                          if (mode === 'select') { setSelected(i); setPage(page); }
                        }}
                      >
                        <rect
                          x={m.bounds[0]}
                          y={m.bounds[1]}
                          width={Math.max(0, m.bounds[2] - m.bounds[0])}
                          height={Math.max(0, m.bounds[3] - m.bounds[1])}
                          fill={i === selected ? 'rgba(255,170,30,.2)' : 'rgba(20,110,255,.1)'}
                          stroke={i === selected ? '#e79318' : '#2674cc'}
                          strokeWidth={2}
                          vectorEffect="non-scaling-stroke"
                        />
                        <text x={m.bounds[0] + 4} y={m.bounds[1] + 20} fill="#174d81" fontSize={20}>
                          {m.restCount
                            ? `${m.number}~${m.number + m.restCount - 1} · ${m.restCount}마디 쉼표`
                            : m.number}
                        </text>
                        {mode === 'select' && [
                          { edge: 0, x1: m.bounds[0], y1: m.bounds[1], x2: m.bounds[0], y2: m.bounds[3], label: '왼쪽' },
                          { edge: 2, x1: m.bounds[2], y1: m.bounds[1], x2: m.bounds[2], y2: m.bounds[3], label: '오른쪽' },
                          { edge: 1, x1: m.bounds[0], y1: m.bounds[1], x2: m.bounds[2], y2: m.bounds[1], label: '위쪽' },
                          { edge: 3, x1: m.bounds[0], y1: m.bounds[3], x2: m.bounds[2], y2: m.bounds[3], label: '아래쪽' },
                        ].map(({ edge, x1, y1, x2, y2, label }) => <line key={edge}
                          x1={x1} y1={y1} x2={x2} y2={y2} stroke="transparent" strokeWidth={12}
                          vectorEffect="non-scaling-stroke" aria-label={`${m.number}마디 ${label} 경계 드래그`}
                          style={{ pointerEvents: busy ? 'none' : 'stroke', cursor: edge % 2 === 0 ? 'ew-resize' : 'ns-resize', touchAction: 'none' }}
                          onPointerDown={(e) => {
                            if (busy || e.button !== 0 || !e.isPrimary) return;
                            e.preventDefault(); e.stopPropagation();
                            setSelected(i); setPage(page);
                            stopRepeat(); origin.current = null; setDrawing(null);
                            edgeDrag.current = { selected: i, edge };
                            e.currentTarget.setPointerCapture(e.pointerId);
                          }}
                          onPointerMove={(e) => {
                            const dragging = edgeDrag.current;
                            if (!dragging || !e.currentTarget.hasPointerCapture(e.pointerId)) return;
                            e.preventDefault(); e.stopPropagation();
                            const rect = e.currentTarget.ownerSVGElement?.getBoundingClientRect();
                            if (!rect || !rect.width || !rect.height) return;
                            const coordinate = Math.round(dragging.edge % 2 === 0
                              ? (e.clientX - rect.left) / rect.width * 1000
                              : (e.clientY - rect.top) / rect.height * 1000);
                            update((rows) => changeMeasureBounds(rows, dragging.selected,
                              rows[dragging.selected].bounds.map((value, index) => index === dragging.edge ? coordinate : value)));
                          }}
                          onPointerUp={(e) => { e.stopPropagation(); edgeDrag.current = null; }}
                          onPointerCancel={(e) => { e.stopPropagation(); edgeDrag.current = null; }}
                          onLostPointerCapture={() => { edgeDrag.current = null; }}
                          onClick={(e) => e.stopPropagation()}>
                          <title>{label} 경계를 드래그해 조절하세요.</title>
                        </line>)}
                      </g>
                    ),
                )}
                {drawing && page === drawingPage.current && (
                  <rect
                    x={drawing[0]}
                    y={drawing[1]}
                    width={drawing[2] - drawing[0]}
                    height={drawing[3] - drawing[1]}
                    fill="rgba(20,110,255,.15)"
                    stroke="#2674cc"
                    strokeWidth={2}
                    vectorEffect="non-scaling-stroke"
                  />
                )}
              </svg>
              </StructurePage>
            </div>;
            })
          )}
        </div>
        <div className="score-pdf-structure-fields">
          {bar && (
            <>
              <div className="score-pdf-row-move-group">
                <span className="score-pdf-boundary-title">영역 위치 이동</span>
                <div className="score-pdf-row-move" role="group" aria-label="선택한 줄의 마디 영역 이동">
                  <div className="score-pdf-row-move-box">영역</div>
                  {([
                    { direction: 'up', label: '위로', dx: 0, dy: -1 },
                    { direction: 'left', label: '왼쪽으로', dx: -1, dy: 0 },
                    { direction: 'right', label: '오른쪽으로', dx: 1, dy: 0 },
                    { direction: 'down', label: '아래로', dx: 0, dy: 1 },
                  ] as const).map(({ direction, label, dx, dy }) => {
                    const move = () => update((rows) => moveMeasureRow(rows, selected, dx, dy));
                    const peers = current.measures.filter((m) => m.page === bar.page && m.system === bar.system);
                    const blocked = peers.some((m) => m.bounds[0] + dx < 0 || m.bounds[2] + dx > 1000 || m.bounds[1] + dy < 0 || m.bounds[3] + dy > 1000);
                    return <button key={direction} type="button" data-direction={direction} title={`선택 줄 ${label} 이동`}
                      aria-label={`선택 줄 ${label} 이동`} disabled={busy || blocked}
                      onPointerDown={(e) => {
                        if (e.button !== 0 || !e.isPrimary) return;
                        stopRepeat(); pointerClick.current = true;
                        e.currentTarget.setPointerCapture(e.pointerId); move();
                        const repeat = () => { move(); repeatTimer.current = setTimeout(repeat, 60); };
                        repeatTimer.current = setTimeout(repeat, 350);
                      }}
                      onPointerUp={stopRepeat} onPointerCancel={stopRepeat} onLostPointerCapture={stopRepeat}
                      onClick={(e) => { if (e.detail === 0 || !pointerClick.current) move(); pointerClick.current = false; }}>
                      <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"
                        style={{ transform: `rotate(${direction === 'up' ? -90 : direction === 'down' ? 90 : direction === 'left' ? 180 : 0}deg)` }}>
                        <path d="m6 3 5 5-5 5" />
                      </svg>
                    </button>;
                  })}
                </div>
              </div>
              <div className="score-pdf-boundary-group">
                <span className="score-pdf-boundary-title">영역 크기 조정</span>
                <div
                  className="score-pdf-boundary-control"
                  role="group"
                  aria-label="선택 마디 경계 조정"
                >
                  <div className="score-pdf-boundary-box" />
                  <span className="score-pdf-boundary-center">영역</span>
                  {[
                    {
                      index: 0,
                      label: '왼쪽',
                      direction: 'left',
                      delta: -1,
                      row: 3,
                      column: 1,
                      expand: true,
                    },
                    {
                      index: 0,
                      label: '왼쪽',
                      direction: 'right',
                      delta: 1,
                      row: 3,
                      column: 2,
                      expand: false,
                    },
                    {
                      index: 1,
                      label: '위쪽',
                      direction: 'up',
                      delta: -1,
                      row: 1,
                      column: 3,
                      expand: true,
                    },
                    {
                      index: 1,
                      label: '위쪽',
                      direction: 'down',
                      delta: 1,
                      row: 2,
                      column: 3,
                      expand: false,
                    },
                    {
                      index: 2,
                      label: '오른쪽',
                      direction: 'left',
                      delta: -1,
                      row: 3,
                      column: 4,
                      expand: false,
                    },
                    {
                      index: 2,
                      label: '오른쪽',
                      direction: 'right',
                      delta: 1,
                      row: 3,
                      column: 5,
                      expand: true,
                    },
                    {
                      index: 3,
                      label: '아래쪽',
                      direction: 'up',
                      delta: -1,
                      row: 4,
                      column: 3,
                      expand: false,
                    },
                    {
                      index: 3,
                      label: '아래쪽',
                      direction: 'down',
                      delta: 1,
                      row: 5,
                      column: 3,
                      expand: true,
                    },
                  ].map(({ index, label, direction, delta, expand }) => {
                    const minimum = index < 2 ? 0 : bar.bounds[index - 2] + 1;
                    const maximum = index < 2 ? bar.bounds[index + 2] - 1 : 1000;
                    const description = `${label} 경계 ${expand ? '바깥으로 확장' : '안쪽으로 축소'}`;
                    const adjust = () =>
                      update((rows) =>
                        changeMeasureBounds(rows, selected, rows[selected].bounds.map((n, j) =>
                          j === index ? n + delta : n)),
                      );
                    return (
                      <button
                        key={`${index}:${delta}`}
                        type="button"
                        aria-label={description}
                        title={description}
                        data-edge={index}
                        data-expand={expand}
                        disabled={
                          busy ||
                          (delta < 0 ? bar.bounds[index] <= minimum : bar.bounds[index] >= maximum)
                        }
                        onPointerDown={(e) => {
                          if (e.button !== 0 || !e.isPrimary) return;
                          stopRepeat();
                          pointerClick.current = true;
                          e.currentTarget.setPointerCapture(e.pointerId);
                          adjust();
                          const repeat = () => {
                            adjust();
                            repeatTimer.current = setTimeout(repeat, 60);
                          };
                          repeatTimer.current = setTimeout(repeat, 350);
                        }}
                        onPointerUp={stopRepeat}
                        onPointerCancel={stopRepeat}
                        onLostPointerCapture={stopRepeat}
                        onContextMenu={(e) => e.preventDefault()}
                        onClick={(e) => {
                          if (e.detail === 0 || !pointerClick.current) adjust();
                          pointerClick.current = false;
                        }}
                      >
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden="true"
                          style={{
                            transform: `rotate(${{ right: 0, down: 90, left: 180, up: 270 }[direction]}deg)`,
                          }}
                        >
                          <path d="m9 6 6 6-6 6" />
                        </svg>
                      </button>
                    );
                  })}
                </div>
                <small className="score-pdf-boundary-hint">
                  안쪽 화살표는 축소, 바깥쪽은 확장
                  <br />한 번에 1씩 · 길게 누르면 연속 조정
                </small>
              </div>
              <button
                type="button"
                disabled={!!bar.restCount}
                onClick={() =>
                  update((rows) =>
                    renumber(
                      rows.flatMap((m, i) =>
                        i !== selected
                          ? [m]
                          : [
                              {
                                ...m,
                                bounds: [
                                  m.bounds[0],
                                  m.bounds[1],
                                  Math.round((m.bounds[0] + m.bounds[2]) / 2),
                                  m.bounds[3],
                                ],
                              },
                              {
                                ...m,
                                bounds: [
                                  Math.round((m.bounds[0] + m.bounds[2]) / 2),
                                  m.bounds[1],
                                  m.bounds[2],
                                  m.bounds[3],
                                ],
                              },
                            ],
                      ),
                    ),
                  )
                }
              >
                마디 나누기
              </button>
              <button
                type="button"
                disabled={
                  !!bar.restCount ||
                  !!current.measures[selected + 1]?.restCount ||
                  !current.measures[selected + 1] ||
                  current.measures[selected + 1].page !== bar.page ||
                  current.measures[selected + 1].system !== bar.system
                }
                onClick={() =>
                  update((rows) =>
                    renumber(
                      rows.flatMap((m, i) =>
                        i === selected
                          ? [
                              {
                                ...m,
                                bounds: [
                                  m.bounds[0],
                                  Math.min(m.bounds[1], rows[i + 1].bounds[1]),
                                  rows[i + 1].bounds[2],
                                  Math.max(m.bounds[3], rows[i + 1].bounds[3]),
                                ],
                              },
                            ]
                          : i === selected + 1
                            ? []
                            : [m],
                      ),
                    ),
                  )
                }
              >
                다음 마디와 합치기
              </button>
              <button
                type="button"
                onClick={() => {
                  update((rows) => renumber(rows.filter((_, i) => i !== selected)));
                  setSelected(Math.max(0, selected - 1));
                }}
              >
                선택 마디 삭제
              </button>
            </>
          )}
        </div>
      </div>
      {error && <p role="alert">{error}</p>}
      {!!errors.length && <p role="alert">{errors[0]}</p>}
      <ConfirmationFooter host={confirmHost}>
      <button
        className="score-pdf-structure-save"
        type="button"
        disabled={busy || !!errors.length || !file || !!error}
        onClick={() => onConfirm(draft)}
      >
        {confirmLabel}
      </button>
      </ConfirmationFooter>
      {!measureOnly && <small>확인하면 전체 PDF와 수정한 구조를 전송하며 API를 1회 호출합니다.</small>}
    </section>
  );
}
function ConfirmationFooter({ host, children }: { host?: HTMLElement | null; children: ReactNode }) {
  return host ? createPortal(children, host) : <>{children}</>;
}
function StructurePage({ pdf, page, children }: { pdf: PDFDocumentProxy | null; page: number; children: ReactNode }) {
  const container = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [ratio, setRatio] = useState(0.707);
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { rootMargin: '600px' });
    if (container.current) observer.observe(container.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!pdf) return;
    let active = true;
    void pdf.getPage(page).then((sheet) => {
      if (active) { const viewport = sheet.getViewport({ scale: 1 }); setRatio(viewport.width / viewport.height); }
    }).catch(() => { if (active) setError('PDF 페이지를 불러오지 못했어요.'); });
    return () => { active = false; };
  }, [pdf, page]);
  useEffect(() => {
    if (!pdf || !visible) return;
    let active = true;
    let cancel: (() => void) | undefined;
    void (async () => {
      const sheet = await pdf.getPage(page);
      if (!active || !canvas.current) return;
      const original = sheet.getViewport({ scale: 1 });
      const viewport = sheet.getViewport({ scale: Math.min(2, 1600 / original.width) });
      const target = canvas.current;
      target.width = viewport.width; target.height = viewport.height;
      const render = sheet.render({ canvas: target, viewport });
      cancel = () => render.cancel();
      await render.promise;
    })().catch((error) => { if (active) setError(error instanceof Error ? error.message : 'PDF 페이지를 표시하지 못했어요.'); });
    return () => { active = false; cancel?.(); if (canvas.current) { canvas.current.width = 0; canvas.current.height = 0; } };
  }, [pdf, page, visible]);
  return <div ref={container} className="score-pdf-structure-page" style={{ aspectRatio: ratio }}>
    {error && <p role="alert">{error}</p>}
    <canvas ref={canvas} aria-label={`${page}페이지`} />
    {children}
  </div>;
}
