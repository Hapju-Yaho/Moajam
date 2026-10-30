import { useEffect, useState } from 'react';

export function PdfAnalysisLoading({
  job,
  delayed,
  cancelling,
  onCancel,
}: {
  job: {
    analysisStartedAt?: number;
    phase?: string;
    progress?: { status: string; startedAt: number; checkedAt?: number };
  };
  delayed: boolean;
  cancelling: boolean;
  onCancel: () => void;
}) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const progress = job.progress;
  const seconds = Math.max(
    0,
    Math.floor((now - (job.analysisStartedAt ?? progress?.startedAt ?? now)) / 1000),
  );
  const stale =
    delayed ||
    progress?.status === 'delayed' ||
    (progress?.status !== 'received' && !!progress?.checkedAt && now - progress.checkedAt > 15000);
  const title = stale
    ? '분석 상태를 확인하고 있어요'
    : progress?.status === 'queued'
      ? '분석 순서를 기다리고 있어요'
      : progress?.status === 'starting'
        ? 'OpenAI에 분석을 요청하고 있어요'
        : progress?.status === 'received'
          ? '분석 결과를 확인하고 있어요'
          : 'OpenAI가 PDF를 분석 중이에요';
  return (
    <div className="score-pdf-analysis-loading">
      <div role="status">
        <span className="score-pdf-loading-spinner" aria-hidden="true" />
        <strong>{title}</strong>
      </div>
      <small>
        {job.phase === 'structure'
          ? '파트·마디 구분'
          : job.phase === 'validation'
            ? '결과 검증'
            : '음표 분석'}
      </small>
      <small>
        경과 시간 {Math.floor(seconds / 60)}분 {seconds % 60}초
      </small>
      <small>
        {progress?.checkedAt
          ? `마지막 상태 확인 ${Math.max(0, Math.floor((now - progress.checkedAt) / 1000))}초 전`
          : '첫 상태 확인을 기다리고 있어요.'}
      </small>
      {stale && (
        <small>확인이 지연되고 있어요. 분석을 새로 요청하지 않고 기존 작업을 확인합니다.</small>
      )}
      <button type="button" disabled={cancelling} onClick={onCancel}>
        {cancelling ? '취소 요청 중…' : '분석 취소'}
      </button>
    </div>
  );
}
