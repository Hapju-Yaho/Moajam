import { useEffect, useRef, useState } from 'react';
import { api, ApiError } from '../lib/remote-client';
import './ScorePdfImport.web.css';
import { validateScoreDocument, serializeScoreFile } from '../lib/scoreFile';
import { scoreMeasureCount, scoreToMusicXml, type Score } from '../lib/score';
import { scorePartStaves, scoreVisibleParts } from '../lib/scoreParts';
import { insertScoreXml, xmlInsertionRange } from '../lib/scoreXmlInsertion';
import { downloadBlob } from '../lib/platformActions.web';
import { ScoreImportOverwrite } from './ScoreImportOverwrite.web';
import { ScorePdfPreview } from './ScorePdfPreview.web';
import { scorePdfWarningLabel } from '../lib/scorePdfWarnings';
import { scorePdfExportFiles, isolateScorePdfPart } from '../lib/scorePdfExport';
import { ScorePdfDiagnostics, type PdfDiagnostics } from './ScorePdfDiagnostics.web';
import { ScorePdfStructureReview, type PdfStructure } from './ScorePdfStructureReview.web';
import { ScorePdfIssueReview, type PdfReviewIssue } from './ScorePdfIssueReview.web';
import { PdfAnalysisLoading } from './PdfAnalysisLoading.web';
import { parseScorePdfPages } from '../lib/scorePdfPageSelection';

type Prepared = {
  id: string;
  name: string;
  size: number;
  pages: number;
  scoreType?: string;
  expiresAt: string;
  message: string;
  status: 'prepared' | 'analyzing' | 'structure_review' | 'completed' | 'failed';
  revision?: number;
  error?: { code: string; message: string };
  usage?: { inputTokens: number; outputTokens: number; totalTokens: number };
  model?: string;
  analysisStartedAt?: number;
  phase?: 'structure' | 'events' | 'validation';
  progress?: {
    status: 'starting' | 'queued' | 'in_progress' | 'checking' | 'delayed' | 'received';
    startedAt: number;
    checkedAt?: number;
  };
  diagnostics?: PdfDiagnostics;
  canReanalyze?: boolean;
  structure?: PdfStructure;
  recognizedHits?: {
    part: string;
    page: number;
    measure: number;
    voice: string;
    pitch: number;
    x: number;
    y: number;
  }[];
  issues?: PdfReviewIssue[];
};
type Result = Prepared & {
  result: { score: unknown; measures: number; sourceStartMeasure?: number } | null;
  warnings: { part: string; measure: number; code: string }[];
};
type BandPdf = { id: string; name: string; size: number; bandName: string };
export function ScorePdfImport({
  open,
  onClose,
  score,
  part,
  onApply,
}: {
  open: boolean;
  onClose: () => void;
  score?: Score;
  part?: string;
  onApply?: (score: Score) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [showPdfContent, setShowPdfContent] = useState(false);
  const [pdfContentUrl, setPdfContentUrl] = useState('');
  useEffect(() => {
    setShowPdfContent(false);
  }, [file]);
  useEffect(() => {
    if (!file || !showPdfContent) return;
    const url = URL.createObjectURL(file);
    setPdfContentUrl(url);
    return () => {
      URL.revokeObjectURL(url);
      setPdfContentUrl('');
    };
  }, [file, showPdfContent]);
  const [job, setJob] = useState<Prepared | null>(null);
  const [working, setBusy] = useState(false);
  const busy = working || job?.status === 'analyzing';
  const [error, setError] = useState('');
  const [statusCheckDelayed, setStatusCheckDelayed] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [temporaryJobs, setTemporaryJobs] = useState<Prepared[]>([]);
  const [temporaryError, setTemporaryError] = useState('');
  useEffect(() => {
    if (!open) return;
    let active = true;
    const refresh = async () => {
      try {
        const items = await api<Prepared[]>('/score-pdf/jobs');
        if (active) {
          setTemporaryJobs(items);
          setTemporaryError('');
        }
      } catch {
        if (active) setTemporaryError('임시 작업 목록을 불러오지 못했어요.');
      }
    };
    void refresh();
    const timer = setInterval(() => void refresh(), 5000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [open, job?.id, job?.status]);
  const [dragging, setDragging] = useState(false);
  const [format, setFormat] = useState('moajam');
  const [scoreType, setScoreType] = useState('guitar-tab');
  const [name, setName] = useState('');
  const [pages, setPages] = useState<number | null>(null);
  const [pageMode, setPageMode] = useState<'all' | 'specific'>('all');
  const [pageText, setPageText] = useState('');
  const pageSelection =
    pageMode === 'all'
      ? { pages: Array.from({ length: pages ?? 0 }, (_, index) => index + 1), error: '' }
      : parseScorePdfPages(pageText, pages ?? 0);
  const selectedPages = pageSelection.pages;
  const [analysisFile, setAnalysisFile] = useState<File | null>(null);
  useEffect(() => {
    setPageMode('all');
    setPageText('');
  }, [pages, file]);
  const [reading, setReading] = useState(false);
  const [bandOpen, setBandOpen] = useState(false);
  const [bandFiles, setBandFiles] = useState<BandPdf[]>([]);
  const [bandLoading, setBandLoading] = useState(false);
  const [bandError, setBandError] = useState('');
  const [bandPicking, setBandPicking] = useState(false);
  const selection = useRef(0);
  const bandRequest = useRef(0);
  const cleanupRequest = useRef<Promise<unknown>>(Promise.resolve());
  const [source, setSource] = useState<Score | null>(null);
  const [sourceStartMeasure, setSourceStartMeasure] = useState(1);
  const [downloadParts, setDownloadParts] = useState<string[] | null>(null);
  const outputFiles = source ? scorePdfExportFiles(source, name, format) : [];
  const selectedFiles = outputFiles.filter(
    (entry) => downloadParts === null || downloadParts.includes(entry.owner),
  );
  const [warnings, setWarnings] = useState<Result['warnings']>([]);
  const [from, setFrom] = useState('');
  const [bar, setBar] = useState('1');
  const [target, setTarget] = useState(part ?? '');
  const [previewBar, setPreviewBar] = useState(1);
  const [confirm, setConfirm] = useState(false);
  const [applied, setApplied] = useState(false);
  const [retryPage, setRetryPage] = useState('1');
  const [retryMeasure, setRetryMeasure] = useState('');
  const [showRetry, setShowRetry] = useState(false);
  const [selectedIssues, setSelectedIssues] = useState<string[]>([]);
  const [showIssueReview, setShowIssueReview] = useState(true);
  const hasIssueReview =
    (job?.status === 'failed' || job?.status === 'completed') &&
    job.canReanalyze &&
    job.structure &&
    (!!job.issues?.length || !!job.recognizedHits?.length);
  const viewingIssues = !!hasIssueReview && showIssueReview;
  const issueKey = (issue: { part: string; page: number; measure: number }) =>
    JSON.stringify([issue.part, issue.page, issue.measure]);
  const problemMeasures = (job?.issues ?? []).filter(
    (issue, i, all) =>
      issue.part && all.findIndex((other) => issueKey(other) === issueKey(issue)) === i,
  );
  const batchTargets = problemMeasures
    .filter((issue) => selectedIssues.includes(issueKey(issue)))
    .map(({ part, page, measure }) => ({ part, page, measure }));
  const jobId = job?.id;
  const jobStatus = job?.status;
  useEffect(() => {
    if (!open || !jobId || jobStatus === 'prepared') return;
    let active = true,
      timer: ReturnType<typeof setTimeout>;
    const read = async () => {
      try {
        const next = await api<Result>(`/score-pdf/jobs/${jobId}/result`);
        if (!active) return;
        setStatusCheckDelayed(false);
        setJob(next);
        if (next.status === 'completed')
          setShowIssueReview(
            next.issues?.some((i) =>
              ['DRUM_HIT_OMISSION', 'DRUM_COVERAGE_MISSING'].includes(i.code),
            ) ?? false,
          );
        if (next.result) {
          const converted = validateScoreDocument(next.result.score);
          setSource(converted);
          setSourceStartMeasure(next.result.sourceStartMeasure ?? 1);
          setWarnings(next.warnings);
          setFrom((previous) =>
            converted.parts.includes(previous) ? previous : converted.parts[0],
          );
          setPreviewBar((previous) =>
            Math.min(
              previous,
              Math.max(...converted.parts.map((p) => scoreMeasureCount(converted, p))),
            ),
          );
        }
        if (next.status === 'analyzing') timer = setTimeout(() => void read(), 1200);
      } catch (e) {
        if (active) {
          setStatusCheckDelayed(true);
          if (e instanceof ApiError && e.status === 404) setJob(null);
          else timer = setTimeout(() => void read(), 5000);
        }
      }
    };
    void read();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [open, jobId, jobStatus]);
  useEffect(
    () => () => {
      selection.current++;
      bandRequest.current++;
    },
    [],
  );
  useEffect(() => {
    if (!open) {
      setBandOpen(false);
      bandRequest.current++;
      setBandPicking(false);
    }
  }, [open]);
  useEffect(() => {
    if (open && !dialog.current?.open) dialog.current?.showModal();
    else if (!open) dialog.current?.close();
  }, [open]);
  const clearJob = () => {
    setStatusCheckDelayed(false);
    setAnalysisFile(null);
    setShowIssueReview(true);
    setSelectedIssues([]);
    if (job) cleanupRequest.current = api(`/score-pdf/jobs/${job.id}`, 'DELETE').catch(() => {});
    setJob(null);
    setSource(null);
    setDownloadParts(null);
    setWarnings([]);
    setApplied(false);
    setConfirm(false);
    setPreviewBar(1);
  };
  const cancelAnalysis = async () => {
    if (!job || cancelling) return;
    setCancelling(true);
    try {
      await api(`/score-pdf/jobs/${job.id}`, 'DELETE');
      clearJob();
      setError('');
    } catch {
      setError('취소 요청을 전달하지 못했어요. 다시 시도해주세요.');
    } finally {
      setCancelling(false);
    }
  };
  const choose = async (value?: File) => {
    if (!value || busy) return;
    setError('');
    if (!/\.pdf$/i.test(value.name) || !value.size || value.size > 20 * 1024 * 1024) {
      setError('20MB 이하의 PDF 파일을 선택해주세요.');
      return;
    }
    clearJob();
    setFile(value);
    setName(value.name.replace(/\.pdf$/i, ''));
    const request = ++selection.current;
    setPages(null);
    setReading(true);
    try {
      const engine = await import('pdfjs-dist');
      engine.GlobalWorkerOptions.workerSrc = new URL(
        'pdfjs-dist/build/pdf.worker.min.mjs',
        import.meta.url,
      ).toString();
      const task = engine.getDocument({
        data: new Uint8Array(await value.arrayBuffer()),
        stopAtErrors: true,
      });
      task.onPassword = () => {
        void task.destroy();
      };
      try {
        const pdf = await task.promise;
        if (selection.current === request) {
          if (!pdf.numPages || pdf.numPages > 40) setError('1~40페이지의 PDF를 선택해주세요.');
          else setPages(pdf.numPages);
        }
      } finally {
        await task.destroy();
      }
    } catch {
      if (selection.current === request)
        setError('PDF를 읽지 못했어요. 손상되지 않은 암호 없는 PDF를 선택해주세요.');
    } finally {
      if (selection.current === request) setReading(false);
    }
  };
  const loadBands = async () => {
    setBandOpen(true);
    setBandLoading(true);
    setBandError('');
    setBandFiles([]);
    const request = ++bandRequest.current;
    try {
      const files = await api<BandPdf[]>('/assets/band-pdfs');
      if (bandRequest.current === request) setBandFiles(files);
    } catch (e) {
      if (bandRequest.current === request)
        setBandError(e instanceof Error ? e.message : 'PDF 목록을 불러오지 못했어요.');
    } finally {
      if (bandRequest.current === request) setBandLoading(false);
    }
  };
  const pickBand = async (entry: BandPdf) => {
    if (bandPicking) return;
    setBandPicking(true);
    setBandError('');
    const request = ++bandRequest.current;
    try {
      const { url } = await api<{ url: string }>(`/assets/${entry.id}/download`);
      const response = await fetch(url, { signal: AbortSignal.timeout(20000) });
      if (!response.ok) throw new Error('PDF 파일을 내려받지 못했어요.');
      const blob = await response.blob();
      if (bandRequest.current !== request) return;
      setBandOpen(false);
      await choose(new File([blob], entry.name, { type: 'application/pdf' }));
    } catch (e) {
      if (bandRequest.current === request)
        setBandError(e instanceof Error ? e.message : 'PDF를 가져오지 못했어요.');
    } finally {
      if (bandRequest.current === request) setBandPicking(false);
    }
  };
  const prepare = async () => {
    if (!file || busy || reading || !pages || !selectedPages.length) return;
    setBusy(true);
    setError('');
    try {
      const data = new FormData();
      await cleanupRequest.current;
      let extracted = file;
      if (selectedPages.length !== pages) {
        const { selectScorePdfPages } = await import('../lib/scorePdfPages');
        extracted = new File(
          [await selectScorePdfPages(await file.arrayBuffer(), selectedPages)],
          file.name,
          { type: 'application/pdf' },
        );
      }
      setAnalysisFile(extracted);
      data.append('file', extracted);
      const previous = job;
      const next = await api<Prepared>(`/score-pdf/jobs?scoreType=${scoreType}`, 'POST', data);
      setJob(next);
      const started = await api<Prepared>(`/score-pdf/jobs/${next.id}/analyze`, 'POST', {
        retry: next.status === 'failed',
      });
      setJob(started);
      setApplied(false);
      if (previous && previous.id !== next.id)
        cleanupRequest.current = api(`/score-pdf/jobs/${previous.id}`, 'DELETE').catch(() => {});
    } catch (e) {
      setError(e instanceof Error ? e.message : 'PDF를 준비하지 못했어요.');
    } finally {
      setBusy(false);
    }
  };
  const reanalyze = async () => {
    if (!job || busy) return;
    setBusy(true);
    setError('');
    try {
      const page = Number(retryPage),
        measure = retryMeasure.trim() ? Number(retryMeasure) : undefined;
      if (
        !Number.isInteger(page) ||
        page < 1 ||
        page > job.pages ||
        (measure !== undefined && (!Number.isInteger(measure) || measure < 1 || measure > 32000))
      )
        throw new Error('페이지와 마디 번호를 확인해주세요.');
      const next = await api<Prepared>(`/score-pdf/jobs/${job.id}/reanalyze`, 'POST', {
        page,
        ...(measure === undefined ? {} : { measure }),
      });
      setJob(next);
      setShowRetry(false);
      setApplied(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : '재분석을 요청하지 못했어요.');
    } finally {
      setBusy(false);
    }
  };
  const confirmStructure = async (structure: PdfStructure) => {
    if (!job || busy) return;
    setBusy(true);
    setError('');
    try {
      const next = await api<Prepared>(`/score-pdf/jobs/${job.id}/structure/confirm`, 'POST', {
        structure,
        revision: job.revision,
      });
      setSource(null);
      setWarnings([]);
      setJob(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : '구조를 확인하지 못했어요.');
    } finally {
      setBusy(false);
    }
  };
  const reanalyzeSelected = async (forceInference = false) => {
    if (!job || busy || !batchTargets.length || batchTargets.length > 128) return;
    setBusy(true);
    setError('');
    try {
      const next = await api<Prepared>(`/score-pdf/jobs/${job.id}/reanalyze-batch`, 'POST', {
        measures: batchTargets,
        forceInference,
      });
      setJob(next);
      setSelectedIssues([]);
      setShowRetry(false);
      setApplied(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : '선택한 마디를 재분석하지 못했어요.');
    } finally {
      setBusy(false);
    }
  };
  const normalizedBar = () =>
    Math.max(
      1,
      Math.min(
        score ? Math.max(...score.parts.map((p) => scoreMeasureCount(score, p))) + 1 : 1,
        Math.round(Number(bar) || 1),
      ),
    );
  const apply = (overwrite = false) => {
    if (!source || !score || !onApply || busy) return;
    try {
      if (
        !overwrite &&
        (target === '__all__'
          ? score.notes.some((n) => !n.rest)
          : xmlInsertionRange(score, source, from, target, normalizedBar()).conflicts)
      ) {
        setConfirm(true);
        return;
      }
      onApply(
        target === '__all__'
          ? source
          : insertScoreXml(score, source, from, target, normalizedBar()),
      );
      setConfirm(false);
      setApplied(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : '악보를 적용하지 못했어요.');
    }
  };
  const download = async () => {
    if (!source || busy || !selectedFiles.length) return;
    setBusy(true);
    setError('');
    try {
      for (const entry of selectedFiles) {
        const output = {
          ...isolateScorePdfPart(source, entry.owner),
          title: name.trim() || source.title,
        };
        let blob: Blob;
        if (format === 'moajam')
          blob = new Blob(
            [
              await serializeScoreFile({
                score: output,
                referenceAudio: null,
                instrumentSample: null,
              }),
            ],
            { type: 'application/json' },
          );
        else if (format === 'musicxml')
          blob = new Blob([scoreToMusicXml(output)], {
            type: 'application/vnd.recordare.musicxml+xml',
          });
        else {
          const { scoreToMidi } = await import('../lib/scoreMidi');
          blob = new Blob([scoreToMidi(output)], { type: 'audio/midi' });
        }
        downloadBlob(entry.name, blob);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '파일을 만들지 못했어요.');
    } finally {
      setBusy(false);
    }
  };
  const openTemporary = async (id: string) => {
    if (working || cancelling) return;
    setBusy(true);
    try {
      const [result, original] = await Promise.all([
        api<Result>(`/score-pdf/jobs/${id}/result`),
        api<{ name: string; base64: string }>(`/score-pdf/jobs/${id}/source`),
      ]);
      const bytes = Uint8Array.from(atob(original.base64), (char) => char.charCodeAt(0));
      const restored = new File([bytes], original.name, { type: 'application/pdf' });
      selection.current++;
      setFile(restored);
      setAnalysisFile(restored);
      setPages(result.pages);
      setReading(false);
      setName(result.name.replace(/\.pdf$/i, ''));
      if (result.scoreType) setScoreType(result.scoreType);
      setSource(result.result ? validateScoreDocument(result.result.score) : null);
      setSourceStartMeasure(result.result?.sourceStartMeasure ?? 1);
      setWarnings(result.warnings ?? []);
      setDownloadParts(null);
      setPreviewBar(1);
      setSelectedIssues([]);
      setShowIssueReview(true);
      setShowRetry(false);
      setApplied(false);
      setConfirm(false);
      setError('');
      setJob(result);
    } catch {
      setTemporaryError('임시 작업을 열지 못했어요. 만료되었거나 서버 연결이 끊겼을 수 있어요.');
    } finally {
      setBusy(false);
    }
  };
  const temporaryList = (
    <div className="score-pdf-temporary-jobs">
      {temporaryJobs.length > 0 && (
        <>
          <strong>남아있는 임시 작업이 있습니다.</strong>
          <ul>
            {temporaryJobs.map((item) => (
              <li key={item.id} data-current={job?.id === item.id}>
                <button
                  type="button"
                  disabled={working || cancelling}
                  onClick={() => void openTemporary(item.id)}
                  aria-current={job?.id === item.id ? 'true' : undefined}
                >
                  <strong>{item.name}</strong>
                  <small>
                    {item.pages}페이지 ·{' '}
                    {
                      {
                        prepared: '준비됨',
                        analyzing: '분석 중',
                        structure_review: '마디 확인',
                        completed: '완료',
                        failed: '실패',
                      }[item.status]
                    }
                  </small>
                </button>
                <button
                  type="button"
                  disabled={working || cancelling}
                  aria-label={`${item.name} 임시 작업 삭제`}
                  title="임시 작업 삭제"
                  onClick={async () => {
                    setBusy(true);
                    try {
                      await api(`/score-pdf/jobs/${item.id}`, 'DELETE');
                      if (job?.id === item.id) clearJob();
                      setTemporaryJobs((items) => items.filter((value) => value.id !== item.id));
                      setTemporaryError('');
                    } catch {
                      setTemporaryError('임시 작업을 삭제하지 못했어요. 다시 시도해주세요.');
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      {temporaryError && <small role="alert">{temporaryError}</small>}
    </div>
  );
  return (
    <dialog
      ref={dialog}
      className="score-pdf-import"
      aria-labelledby="score-pdf-title"
      onCancel={(e) => {
        // React also forwards a file input's cancel event to its parent dialog.
        e.stopPropagation();
        if (e.target !== e.currentTarget) return;
        e.preventDefault();
        onClose();
      }}
      onKeyDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section>
        <header>
          <h2 id="score-pdf-title">PDF 악보 변환</h2>
          <button type="button" onClick={onClose} aria-label="PDF 악보 변환 닫기">
            ×
          </button>
        </header>
        <p>선택한 PDF 페이지를 읽어 편집 가능한 악보로 변환합니다.</p>
        {job?.status === 'structure_review' && job.structure && (
          <>
            <ScorePdfStructureReview
              key={`${job.id}:${job.revision}`}
              file={analysisFile ?? file}
              structure={job.structure}
              pages={job.pages}
              busy={busy}
              onConfirm={(value) => void confirmStructure(value)}
            />
            {job.diagnostics && <ScorePdfDiagnostics value={job.diagnostics} />}
            {error && <p role="alert">{error}</p>}
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                void api<Prepared>(`/score-pdf/jobs/${job.id}/analyze`, 'POST', { retry: true })
                  .then(setJob)
                  .catch((e) => setError(e.message));
              }}
            >
              구조 다시 분석 (API 1회)
            </button>
            <button type="button" disabled={busy} onClick={clearJob}>
              취소
            </button>
          </>
        )}
        {viewingIssues && job?.structure && job.issues && (
          <>
            {job.error && (
              <p role="alert">
                {job.error.code} · {job.error.message}
              </p>
            )}
            <ScorePdfIssueReview
              key={job.id}
              file={analysisFile ?? file}
              structure={job.structure}
              issues={job.issues ?? []}
              recognizedHits={job.recognizedHits}
              selected={selectedIssues}
              busy={busy}
              onToggle={(key, checked) =>
                setSelectedIssues((previous) =>
                  checked ? [...new Set([...previous, key])] : previous.filter((k) => k !== key),
                )
              }
              onRetry={() => void reanalyzeSelected()}
              onForceInference={() => void reanalyzeSelected(true)}
            />
            {job.diagnostics && <ScorePdfDiagnostics value={job.diagnostics} />}
            {error && <p role="alert">{error}</p>}
            <button type="button" onClick={() => setShowIssueReview(false)}>
              추출 결과·다운로드 보기
            </button>
          </>
        )}
        {hasIssueReview && !showIssueReview && (
          <button type="button" onClick={() => setShowIssueReview(true)}>
            PDF에서 불확실한 마디 보기
          </button>
        )}
        <div
          className="score-pdf-workspace"
          style={
            job?.status === 'structure_review' || viewingIssues ? { display: 'none' } : undefined
          }
        >
          <div className="score-pdf-source">
            <fieldset className="score-pdf-output">
              <legend>추출 파일</legend>
              <div className="score-pdf-output-row">
                <label>
                  파일 형식{' '}
                  <select value={format} onChange={(e) => setFormat(e.target.value)}>
                    <option value="moajam">.moajam</option>
                    <option value="musicxml">.musicxml</option>
                    <option value="mid">.mid</option>
                  </select>
                </label>
                <label className="score-pdf-filename">
                  파일 이름{' '}
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="악보 이름"
                  />{' '}
                  .{format}
                </label>
              </div>
              {source && (
                <div className="score-pdf-download-selection">
                  <div className="score-pdf-download-heading">
                    <strong>다운로드할 파일</strong>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        setDownloadParts(
                          selectedFiles.length === outputFiles.length
                            ? []
                            : outputFiles.map((f) => f.owner),
                        )
                      }
                    >
                      {selectedFiles.length === outputFiles.length ? '전체 해제' : '전체 선택'}
                    </button>
                  </div>
                  <div className="score-pdf-download-list">
                    {outputFiles.map((entry) => (
                      <label
                        key={entry.owner}
                        data-selected={selectedFiles.some((f) => f.owner === entry.owner)}
                      >
                        <input
                          type="checkbox"
                          disabled={busy}
                          checked={selectedFiles.some((f) => f.owner === entry.owner)}
                          onChange={(e) =>
                            setDownloadParts(
                              e.target.checked
                                ? [...selectedFiles.map((f) => f.owner), entry.owner]
                                : selectedFiles
                                    .filter((f) => f.owner !== entry.owner)
                                    .map((f) => f.owner),
                            )
                          }
                        />
                        <span>
                          <strong>{entry.owner}</strong>
                          <small>{entry.name}</small>
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </fieldset>
            <div
              className="score-pdf-drop"
              data-dragging={dragging}
              data-has-file={!!file}
              data-preview={showPdfContent}
              aria-busy={busy}
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                if (e.dataTransfer.files.length !== 1) setError('PDF 한 개를 선택해주세요.');
                else void choose(e.dataTransfer.files[0]);
              }}
            >
              {file && showPdfContent && (
                <div className="score-pdf-upload-preview">
                  <div className="score-pdf-upload-preview-heading">
                    <strong>{file.name}</strong>
                    <button
                      type="button"
                      onClick={() => setShowPdfContent(false)}
                      aria-label="PDF 내용 보기 닫기"
                    >
                      닫기 ×
                    </button>
                  </div>
                  {pdfContentUrl && (
                    <iframe
                      title="업로드한 PDF 내용"
                      src={`${pdfContentUrl}#toolbar=0&navpanes=0&view=FitH`}
                    />
                  )}
                </div>
              )}
              {file ? (
                <div className="score-pdf-file-column">
                  <div className="score-pdf-file-card">
                    <svg aria-hidden="true" viewBox="0 0 220 190" preserveAspectRatio="none">
                      <path
                        d="M2 2H182L218 38V188H2Z"
                        fill="#ffffff"
                        stroke="#d78484"
                        strokeWidth="2"
                      />
                      <path d="M182 2V38H218" fill="#f8dada" stroke="#d78484" strokeWidth="2" />
                    </svg>
                    <div className="score-pdf-file-info">
                      <span className="score-pdf-file-type">PDF</span>
                      <strong>{file.name}</strong>
                      <span>{(file.size / 1024 / 1024).toFixed(2)}MB</span>
                      <span>
                        {reading
                          ? '페이지 확인 중…'
                          : pages
                            ? `${pages}페이지`
                            : '페이지 확인 불가'}
                      </span>
                    </div>
                    <button
                      className="score-pdf-remove"
                      type="button"
                      aria-label="PDF 파일 제거"
                      title="파일 제거"
                      disabled={busy}
                      onClick={() => {
                        clearJob();
                        selection.current++;
                        setFile(null);
                        setPages(null);
                        setReading(false);
                        setError('');
                      }}
                    >
                      ×
                    </button>
                  </div>
                  <button
                    type="button"
                    className="score-pdf-view-content"
                    onClick={() => setShowPdfContent(true)}
                  >
                    내용 보기
                  </button>
                </div>
              ) : (
                <div className="score-pdf-empty">
                  <strong>PDF를 여기에 끌어다 놓으세요</strong>
                  <p>PDF 한 개 · 최대 20MB / 40페이지</p>
                </div>
              )}
              <div className="score-pdf-upload-actions">
                <button
                  type="button"
                  disabled={busy || bandPicking}
                  onClick={() => input.current?.click()}
                >
                  파일 선택
                </button>
                <button
                  type="button"
                  disabled={busy || bandPicking}
                  onClick={() => void loadBands()}
                >
                  내 밴드에서 가져오기
                </button>
              </div>
              <input
                ref={input}
                type="file"
                hidden
                accept=".pdf,application/pdf"
                onChange={(e) => {
                  void choose(e.target.files?.[0]);
                  e.target.value = '';
                }}
              />
            </div>
            <label className="score-pdf-score-type">
              <span>악보 종류</span>
              <select
                aria-label="악보 종류"
                value={scoreType}
                onChange={(e) => {
                  clearJob();
                  setScoreType(e.target.value);
                }}
                disabled={busy || bandPicking}
              >
                <option value="guitar-tab">기타 타브</option>
                <option value="bass-tab">베이스 타브 (4현)</option>
                <option value="drums">드럼</option>
                <option value="keyboard">키보드 (양손)</option>
                <option value="vocal-staff">일반 오선 (보컬·기타 악기)</option>
              </select>
              <small>선택한 종류의 악보만 인식해요.</small>
            </label>
            {pages !== null && pages > 1 && (
              <fieldset
                className="score-pdf-page-selection"
                disabled={busy || reading || bandPicking}
              >
                <legend>추출 페이지</legend>
                <div>
                  <button
                    type="button"
                    aria-pressed={pageMode === 'all'}
                    onClick={() => {
                      clearJob();
                      setPageMode('all');
                    }}
                  >
                    전체 페이지
                  </button>
                  <button
                    type="button"
                    aria-pressed={pageMode === 'specific'}
                    onClick={() => {
                      clearJob();
                      setPageMode('specific');
                    }}
                  >
                    특정 페이지
                  </button>
                  <input
                    type="text"
                    aria-label="추출할 특정 페이지"
                    placeholder="예: 1,3,4 또는 1-3"
                    value={pageText}
                    disabled={pageMode !== 'specific'}
                    aria-invalid={pageMode === 'specific' && Boolean(pageSelection.error)}
                    onChange={(event) => {
                      clearJob();
                      setPageMode('specific');
                      setPageText(event.target.value);
                    }}
                  />
                </div>
                {pageMode === 'specific' && pageSelection.error && (
                  <small role="alert">{pageSelection.error}</small>
                )}
                <small>
                  {selectedPages.length} / {pages}페이지 선택 · 분석 화면에서는 선택한 순서대로
                  페이지 번호를 표시합니다.
                </small>
              </fieldset>
            )}
            {bandOpen && (
              <section className="score-pdf-bands" aria-label="내 밴드 PDF 목록">
                <header>
                  <h3>내 밴드 PDF</h3>
                  <button
                    type="button"
                    aria-label="내 밴드 PDF 목록 닫기"
                    onClick={() => {
                      setBandOpen(false);
                      bandRequest.current++;
                      setBandPicking(false);
                    }}
                  >
                    ×
                  </button>
                </header>
                {bandLoading ? (
                  <p role="status">PDF 목록을 불러오는 중…</p>
                ) : (
                  <div className="score-pdf-band-list">
                    {!bandFiles.length && !bandError && <p>밴드에 등록된 PDF가 없습니다.</p>}
                    {bandFiles.map((entry) => (
                      <button
                        key={entry.id}
                        type="button"
                        disabled={bandPicking || entry.size > 20 * 1024 * 1024}
                        onClick={() => void pickBand(entry)}
                      >
                        <strong>{entry.name}</strong>
                        <small>
                          {entry.bandName} · {(entry.size / 1024 / 1024).toFixed(2)}MB
                          {entry.size > 20 * 1024 * 1024 ? ' · 용량 초과' : ''}
                        </small>
                      </button>
                    ))}
                  </div>
                )}
                {bandPicking && <p role="status">PDF를 가져오는 중…</p>}
                {bandError && <p role="alert">{bandError}</p>}
              </section>
            )}
            <p className="score-pdf-notice">
              전체 추출은 구조·음표 분석으로 2회, 마디 재분석은 1회 API를 호출합니다. 자동 재시도는
              하지 않습니다. 다운로드·악보 적용에는 추가 호출이 없습니다.
            </p>
            <button
              className="score-pdf-extract"
              type="button"
              disabled={!file || busy || reading || !pages || !selectedPages.length || bandPicking}
              onClick={() => void prepare()}
            >
              {busy
                ? '악보를 분석하고 있어요…'
                : job?.status === 'failed'
                  ? '다시 추출'
                  : job?.status === 'completed'
                    ? '추출 결과 불러오기'
                    : '악보 추출'}
            </button>
            {error && <p role="alert">{error}</p>}
            {error.includes('준비') && (
              <div>
                <small>
                  이 화면에서 사용하지 않는 이전 PDF 임시 작업을 정리할 수 있어요. 분석 중인 작업과
                  저장한 악보는 유지됩니다.
                </small>
                <button
                  type="button"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      const result = await api<{ removed: number }>(
                        `/score-pdf/jobs${job ? `?keepId=${encodeURIComponent(job.id)}` : ''}`,
                        'DELETE',
                      );
                      setError(
                        result.removed
                          ? '이전 PDF 준비 작업을 정리했어요. 악보 추출을 다시 눌러주세요.'
                          : '정리할 이전 작업이 없어요. 진행 중인 분석이 있다면 완료 후 다시 시도해주세요.',
                      );
                    } catch {
                      setError('이전 준비 작업을 정리하지 못했어요. 서버 연결을 확인해주세요.');
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  이전 PDF 준비 작업 정리
                </button>
              </div>
            )}
          </div>
          <div className="score-pdf-preview-column">
            <section
              className="score-pdf-result"
              aria-label="결과와 경고 미리보기"
              aria-live="polite"
            >
              <h3>결과·경고 미리보기</h3>
              {job?.status === 'analyzing' && (
                <PdfAnalysisLoading
                  job={job}
                  delayed={statusCheckDelayed}
                  cancelling={cancelling}
                  onCancel={() => void cancelAnalysis()}
                />
              )}
              {job ? (
                <>
                  <strong>{job.message}</strong>
                  <p>
                    {job.name} · {job.pages}페이지
                  </p>
                  {job.structure && (
                    <small>
                      구조 인식 ·{' '}
                      {job.structure.parts
                        .map((p) => `${p.name} ${p.measures.length}마디`)
                        .join(' / ')}
                    </small>
                  )}
                  {job.error && (
                    <p role="alert">
                      {job.error.code} · {job.error.message}
                    </p>
                  )}
                  {job.diagnostics && <ScorePdfDiagnostics value={job.diagnostics} />}
                  {!!job.issues?.length && (
                    <details open className="score-pdf-warnings">
                      <summary>확인이 필요한 항목 {job.issues.length}개</summary>
                      {job.canReanalyze && !!problemMeasures.length && (
                        <div className="score-pdf-batch-tools">
                          <button
                            type="button"
                            disabled={
                              busy || job.status === 'analyzing' || problemMeasures.length > 128
                            }
                            onClick={() =>
                              setSelectedIssues(
                                batchTargets.length === problemMeasures.length
                                  ? []
                                  : problemMeasures.map(issueKey),
                              )
                            }
                          >
                            {batchTargets.length === problemMeasures.length
                              ? '선택 해제'
                              : '문제 마디 전체 선택'}
                          </button>
                          <button
                            type="button"
                            disabled={
                              busy ||
                              job.status === 'analyzing' ||
                              !batchTargets.length ||
                              batchTargets.length > 128
                            }
                            onClick={() => void reanalyzeSelected()}
                          >
                            선택한 마디 재분석 ({batchTargets.length})
                          </button>
                          <button
                            type="button"
                            disabled={
                              busy ||
                              job.status === 'analyzing' ||
                              !batchTargets.length ||
                              batchTargets.length > 128
                            }
                            onClick={() => void reanalyzeSelected(true)}
                            title="음높이·박자(타브는 줄·프렛)를 추정하고 주법과 연결 기호는 생략합니다."
                          >
                            강제 추론
                          </button>
                          <small>
                            선택한 파트·마디만 묶어 API를 1회 호출합니다. 최대 128개까지 선택할 수
                            있어요.
                          </small>
                        </div>
                      )}
                      {job.issues.map((issue, i) => (
                        <p key={i}>
                          {job.canReanalyze && issue.part && (
                            <input
                              type="checkbox"
                              aria-label={`${issue.part} ${issue.page}페이지 ${issue.measure}마디 재분석 선택`}
                              checked={selectedIssues.includes(issueKey(issue))}
                              disabled={
                                busy ||
                                job.status === 'analyzing' ||
                                (!selectedIssues.includes(issueKey(issue)) &&
                                  batchTargets.length >= 128)
                              }
                              onChange={(e) =>
                                setSelectedIssues((previous) =>
                                  e.target.checked
                                    ? [...new Set([...previous, issueKey(issue)])]
                                    : previous.filter((key) => key !== issueKey(issue)),
                                )
                              }
                            />
                          )}{' '}
                          {issue.part} · {issue.page}페이지 {issue.measure}마디 · {issue.message}{' '}
                          <button
                            type="button"
                            disabled={busy || job.status === 'analyzing'}
                            onClick={() => {
                              setRetryPage(String(issue.page));
                              setRetryMeasure(String(issue.measure));
                              setShowRetry(true);
                            }}
                          >
                            이 마디 재분석 설정
                          </button>
                        </p>
                      ))}
                    </details>
                  )}
                  {job.status === 'failed' && source && (
                    <small>재분석에 실패해 이전 변환 결과를 표시하고 있어요.</small>
                  )}
                  {job.usage && (
                    <small>
                      {job.model} · 입력 {job.usage.inputTokens.toLocaleString()} / 출력{' '}
                      {job.usage.outputTokens.toLocaleString()} 토큰 (누적)
                    </small>
                  )}
                </>
              ) : (
                <p>PDF를 올리고 악보 추출을 눌러주세요.</p>
              )}
              {source && (
                <>
                  {sourceStartMeasure !== 1 && (
                    <small>원본 {sourceStartMeasure}마디부터 → 편집 악보 1마디부터</small>
                  )}
                  <div className="score-pdf-preview-tools">
                    <select
                      aria-label="미리보기 파트"
                      value={from}
                      onChange={(e) => {
                        setFrom(e.target.value);
                        setPreviewBar(1);
                      }}
                    >
                      {scoreVisibleParts(source).map((p) => (
                        <option key={p}>{p}</option>
                      ))}
                    </select>
                    <button
                      type="button"
                      disabled={previewBar <= 1}
                      onClick={() => setPreviewBar((p) => p - 1)}
                    >
                      ‹
                    </button>
                    <span>
                      {previewBar} / {scoreMeasureCount(source, from)}마디
                    </span>
                    <button
                      type="button"
                      disabled={previewBar >= scoreMeasureCount(source, from)}
                      onClick={() => setPreviewBar((p) => p + 1)}
                    >
                      ›
                    </button>
                  </div>
                  <ScorePdfPreview score={source} part={from} bar={previewBar} />
                  <details className="score-pdf-warnings">
                    <summary>확인할 항목 {warnings.length}개</summary>
                    {warnings.map((w, i) => (
                      <p key={i}>
                        {w.part} {w.measure ? `${w.measure}마디` : ''} ·{' '}
                        {scorePdfWarningLabel(w.code)}
                      </p>
                    ))}
                  </details>
                </>
              )}
              {job?.canReanalyze && job.status !== 'analyzing' && (
                <>
                  <button type="button" disabled={busy} onClick={() => setShowRetry(!showRetry)}>
                    특정 페이지·마디 재분석
                  </button>
                  {showRetry && (
                    <div className="score-pdf-retry">
                      <label>
                        페이지
                        <input
                          type="number"
                          value={retryPage}
                          onChange={(e) => setRetryPage(e.target.value)}
                        />
                      </label>
                      <label>
                        원본 마디(선택)
                        <input
                          type="number"
                          value={retryMeasure}
                          onChange={(e) => setRetryMeasure(e.target.value)}
                        />
                      </label>
                      <button type="button" onClick={() => void reanalyze()}>
                        재분석
                      </button>
                      <small>
                        전체 PDF 대신 선택 마디 확대 이미지와 악기·박자·범례 문맥을 전송합니다.
                        이미지 입력 토큰과 API 비용이 발생합니다.
                      </small>
                    </div>
                  )}
                </>
              )}
              {temporaryList}
            </section>
            <button
              type="button"
              disabled={!source || busy || !selectedFiles.length}
              onClick={() => void download()}
            >
              {source ? `선택한 파일 다운로드 (${selectedFiles.length})` : '다운로드'}
            </button>
          </div>
        </div>
        {(job?.status === 'structure_review' || viewingIssues) && temporaryList}
        <fieldset
          className="score-pdf-apply"
          style={
            job?.status === 'structure_review' || viewingIssues ? { display: 'none' } : undefined
          }
          disabled={!source || busy || applied || !score || !onApply}
        >
          <legend>악보에 적용</legend>
          <div className="score-pdf-apply-options">
            <label>
              대상 파트
              <select value={target} onChange={(e) => setTarget(e.target.value)}>
                <option value="__all__">전체 악보로 교체</option>
                {score?.parts.map((p) => (
                  <option key={p}>{p}</option>
                ))}
              </select>
            </label>
            {target !== '__all__' && (
              <label>
                시작 마디
                <input
                  type="number"
                  value={bar}
                  onChange={(e) => setBar(e.target.value)}
                  onBlur={() => setBar(String(normalizedBar()))}
                />
              </label>
            )}
            {source &&
              score &&
              target !== '__all__' &&
              scorePartStaves(source, from).length > scorePartStaves(score, target).length && (
                <small>
                  대상 보표 수가 적어 첫 보표만 삽입됩니다. 양손·전체 파트는 전체 악보로 교체를
                  선택해주세요.
                </small>
              )}
            <small>
              {applied
                ? '악보를 적용했어요. 프로젝트를 저장해주세요.'
                : target === '__all__'
                  ? '현재 프로젝트의 모든 파트와 음표를 변환 결과로 교체합니다.'
                  : '미리보기에서 선택한 파트를 삽입합니다. 대상 프로젝트의 악기·BPM 설정은 유지합니다.'}
            </small>
          </div>
          <button type="button" onClick={() => apply()}>
            악보에 적용
          </button>
        </fieldset>
        {confirm && (
          <ScoreImportOverwrite
            format="PDF"
            target={target === '__all__' ? '전체 악보' : target}
            bar={target === '__all__' ? 1 : normalizedBar()}
            onCancel={() => setConfirm(false)}
            onConfirm={() => apply(true)}
          />
        )}
      </section>
    </dialog>
  );
}
