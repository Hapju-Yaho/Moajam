import { useEffect, useRef, useState } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import './PerformanceReader.web.css';

export function PdfScoreReader({
  url,
  name,
  onClose,
}: {
  url: string;
  name: string;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState(100);
  const [width, setWidth] = useState(600);
  const [error, setError] = useState('');
  const [rendering, setRendering] = useState(true);
  useEffect(() => {
    dialog.current?.showModal();
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const observer = new ResizeObserver(([entry]) =>
      setWidth(Math.max(100, entry.contentRect.width - 32)),
    );
    if (stage.current) observer.observe(stage.current);
    return () => {
      observer.disconnect();
      document.body.style.overflow = previous;
    };
  }, []);
  useEffect(() => {
    let active = true;
    let destroy: (() => void) | undefined;
    setError('');
    setPdf(null);
    setPage(1);
    void import('pdfjs-dist')
      .then(async (engine) => {
        engine.GlobalWorkerOptions.workerSrc = new URL(
          'pdfjs-dist/build/pdf.worker.min.mjs',
          import.meta.url,
        ).toString();
        if (!active) return;
        const task = engine.getDocument({ url });
        destroy = () => {
          void task.destroy();
        };
        const document = await task.promise;
        if (active) setPdf(document);
      })
      .catch(() => {
        if (active)
          setError('PDF를 읽지 못했어요. 암호가 없는 PDF인지 확인하거나 새 창에서 열어주세요.');
      });
    return () => {
      active = false;
      destroy?.();
    };
  }, [url]);
  useEffect(() => {
    if (!pdf) return;
    let active = true;
    let cancel: (() => void) | undefined;
    setRendering(true);
    setError('');
    void pdf
      .getPage(page)
      .then(async (sheet) => {
        if (!active || !canvas.current) return;
        const original = sheet.getViewport({ scale: 1 });
        const scale = (Math.min(width / original.width, 2) * zoom) / 100;
        const ratio = Math.min(window.devicePixelRatio || 1, 2);
        const viewport = sheet.getViewport({ scale: scale * ratio });
        const target = canvas.current;
        target.width = viewport.width;
        target.height = viewport.height;
        target.style.width = `${viewport.width / ratio}px`;
        target.style.height = `${viewport.height / ratio}px`;
        const task = sheet.render({ canvas: target, viewport });
        cancel = () => task.cancel();
        await task.promise;
        if (active) {
          setRendering(false);
          stage.current?.scrollTo(0, 0);
        }
      })
      .catch(() => {
        if (active) {
          setRendering(false);
          setError('이 페이지를 표시하지 못했어요.');
        }
      });
    return () => {
      active = false;
      cancel?.();
    };
  }, [pdf, page, width, zoom]);
  return (
    <dialog
      ref={dialog}
      className="performance-reader"
      aria-label={name + ' PDF 뷰어'}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onKeyDown={(e) => {
        if ((e.target as HTMLElement).matches('input,select,textarea')) return;
        if (e.key === 'ArrowRight' || e.key === 'PageDown') {
          e.preventDefault();
          setPage((p) => Math.min(pdf?.numPages ?? 1, p + 1));
        }
        if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
          e.preventDefault();
          setPage((p) => Math.max(1, p - 1));
        }
      }}
    >
      <div className="performance-reader-content">
        <header>
          <h2>{name}</h2>
          <div className="performance-reader-settings">
            <label>
              확대{' '}
              <select value={zoom} onChange={(e) => setZoom(Number(e.target.value))}>
                {[75, 100, 125, 150, 200].map((n) => (
                  <option key={n} value={n}>
                    {n}%
                  </option>
                ))}
              </select>
            </label>
            <a href={url} target="_blank" rel="noopener noreferrer">
              새 창에서 열기
            </a>
            <button onClick={onClose}>닫기</button>
          </div>
        </header>
        {error && (
          <p role="alert" className="performance-reader-error">
            {error}
          </p>
        )}
        <div className="performance-reader-stage" ref={stage} aria-busy={rendering}>
          {!pdf && !error && <p>PDF를 불러오는 중…</p>}
          <canvas ref={canvas} aria-label={`${page}페이지`} />
        </div>
        <footer>
          <button disabled={!pdf || page <= 1} onClick={() => setPage(page - 1)}>
            ← 이전
          </button>
          <label>
            페이지{' '}
            <input
              aria-label="PDF 페이지"
              type="number"
              min={1}
              max={pdf?.numPages ?? 1}
              value={page}
              style={{ width: 60 }}
              onChange={(e) =>
                setPage(Math.max(1, Math.min(pdf?.numPages ?? 1, Number(e.target.value) || 1)))
              }
            />{' '}
            / {pdf?.numPages ?? '–'}
          </label>
          <button disabled={!pdf || page >= pdf.numPages} onClick={() => setPage(page + 1)}>
            다음 →
          </button>
        </footer>
      </div>
    </dialog>
  );
}
