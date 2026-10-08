import { useEffect, useRef, useState } from 'react';
import type { PDFDocumentLoadingTask } from 'pdfjs-dist';
import { api, serverConfigured } from '../lib/remote';
export function PdfThumbnail({ id, name, blob }: { id: string; name: string; blob?: Blob }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'failed'>('loading');
  useEffect(() => {
    let active = true;
    let task: PDFDocumentLoadingTask | undefined;
    const controller = new AbortController();
    setStatus('loading');
    void (async () => {
      const [pdfjs, worker] = await Promise.all([
        import('pdfjs-dist'),
        import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
      ]);
      if (!active) return;
      pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
      let data: ArrayBuffer;
      if (blob) data = await blob.arrayBuffer();
      else {
        if (!serverConfigured) throw Error('PDF 파일 없음');
        const { url } = await api<{ url: string }>('/assets/' + id + '/download');
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok) throw Error('PDF를 불러오지 못했어요.');
        data = await response.arrayBuffer();
      }
      if (!active) return;
      task = pdfjs.getDocument({ data });
      const pdf = await task.promise;
      const page = await pdf.getPage(1);
      if (!active || !canvas.current) return;
      const original = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({
        scale: Math.min(240 / original.width, 320 / original.height),
      });
      canvas.current.width = Math.ceil(viewport.width);
      canvas.current.height = Math.ceil(viewport.height);
      await page.render({ canvas: canvas.current, viewport }).promise;
      if (active) setStatus('ready');
      await task.destroy();
      task = undefined;
    })().catch(() => {
      if (active) setStatus('failed');
    });
    return () => {
      active = false;
      controller.abort();
      void task?.destroy();
    };
  }, [id, blob]);
  return (
    <span
      style={{
        width: 80,
        height: 106,
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'white',
        border: '1px solid #dce4f0',
        borderRadius: 6,
        overflow: 'hidden',
      }}
    >
      <canvas
        ref={canvas}
        role="img"
        aria-label={name + ' 첫 페이지 미리보기'}
        style={{
          display: status === 'ready' ? 'block' : 'none',
          maxWidth: '100%',
          maxHeight: '100%',
        }}
      />
      {status !== 'ready' && (
        <span style={{ color: '#8a6970', fontSize: 12 }}>
          {status === 'loading' ? '미리보기…' : 'PDF'}
        </span>
      )}
    </span>
  );
}
