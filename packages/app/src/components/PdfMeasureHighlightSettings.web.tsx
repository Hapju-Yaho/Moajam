import { useEffect, useRef, useState } from 'react';

export type PdfMeasureHighlight = {
  border: string; fill: string; opacity: number; width: number;
  beatRadius: number; beatIdleRadius: number; beatColor: string; beatIdleColor: string; beatPreviewColor: string; beatOpacity: number;
};
export const defaultPdfMeasureHighlight: PdfMeasureHighlight = {
  border: '#d29a26', fill: '#f7b934', opacity: 0.22, width: 1.5,
  beatRadius: 4, beatIdleRadius: 4, beatColor: '#42ae65', beatIdleColor: '#bcc8bf', beatPreviewColor: '#c7cbce', beatOpacity: 1,
};
export function PdfMeasureHighlightSettings({ value, onApply, onClose, busy = false, error = '' }: {
  value: PdfMeasureHighlight;
  onApply: (value: PdfMeasureHighlight) => void;
  onClose: () => void;
  busy?: boolean;
  error?: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [draftState, setDraft] = useState(value);
  const draft = { ...defaultPdfMeasureHighlight, ...draftState };
  const [category, setCategory] = useState<'measure' | 'metronome'>('measure');
  useEffect(() => {
    const node = dialog.current;
    node?.showModal();
    return () => node?.close();
  }, []);
  return <dialog ref={dialog} className="pdf-highlight-settings" aria-label="강조 설정"
    onKeyDown={(e) => e.stopPropagation()}
    onCancel={(e) => { e.preventDefault(); e.stopPropagation(); if (!busy) onClose(); }}>
    <header><h2>강조 설정</h2><button type="button" disabled={busy} aria-label="강조 설정 닫기" onClick={onClose}>×</button></header>
    <section>
      <fieldset disabled={busy}><legend className="pdf-highlight-categories">
        <button type="button" aria-pressed={category === 'measure'} onClick={() => setCategory('measure')}>마디</button>
        <button type="button" aria-pressed={category === 'metronome'} onClick={() => setCategory('metronome')}>메트로놈</button>
      </legend>
      {category === 'measure' ? <>
      <label>테두리 색<input type="color" value={draft.border} onChange={(e) => setDraft({ ...draft, border: e.target.value })} /></label>
      <label>테두리 두께<input type="number" min={0} max={6} step={0.5} value={draft.width} onChange={(e) => setDraft({ ...draft, width: Math.max(0, Math.min(6, Number(e.target.value) || 0)) })} /></label>
      <label>영역 색<input type="color" value={draft.fill} onChange={(e) => setDraft({ ...draft, fill: e.target.value })} /></label>
      <label>영역 투명도<input type="range" min={0} max={100} value={Math.round((1 - draft.opacity) * 100)} onChange={(e) => setDraft({ ...draft, opacity: 1 - Number(e.target.value) / 100 })} /><span>{Math.round((1 - draft.opacity) * 100)}%</span></label>
      <svg viewBox="0 0 300 80" role="img" aria-label="마디 강조 미리보기" className="pdf-highlight-preview">
        {[20, 30, 40, 50, 60].map((y) => <path key={y} d={`M10 ${y}H290`} stroke="#b9bfbd" />)}
        <rect x={12} y={10} width={276} height={60} fill={draft.fill} fillOpacity={draft.opacity} stroke={draft.border} strokeWidth={draft.width} />
        <text x={150} y={45} textAnchor="middle" fill="#39414a" fontSize={13}>마디 강조 미리보기</text>
      </svg>
      </> : <>
        <label>원 크기<input type="range" min={2} max={12} step={0.5} value={draft.beatRadius}
          onChange={(e) => setDraft({ ...draft, beatRadius: Number(e.target.value) })} /><span>{draft.beatRadius}</span></label>
        <label>현재 박 색<input type="color" value={draft.beatColor} onChange={(e) => setDraft({ ...draft, beatColor: e.target.value })} /></label>
        <hr className="pdf-metronome-divider" />
        <label>대기 원 크기<input type="range" min={2} max={12} step={0.5} value={draft.beatIdleRadius}
          onChange={(e) => setDraft({ ...draft, beatIdleRadius: Number(e.target.value) })} /><span>{draft.beatIdleRadius}</span></label>
        <label>대기 박 색<input type="color" value={draft.beatIdleColor} onChange={(e) => setDraft({ ...draft, beatIdleColor: e.target.value })} /></label>
        <label>다음 마디 미리보기 색<input type="color" value={draft.beatPreviewColor} onChange={(e) => setDraft({ ...draft, beatPreviewColor: e.target.value })} /></label>
        <label>투명도<input type="range" min={0} max={100} value={Math.round((1 - draft.beatOpacity) * 100)}
          onChange={(e) => setDraft({ ...draft, beatOpacity: 1 - Number(e.target.value) / 100 })} /><span>{Math.round((1 - draft.beatOpacity) * 100)}%</span></label>
        <svg viewBox="0 0 300 50" role="img" aria-label="메트로놈 미리보기" className="pdf-highlight-preview">
          {[0, 1, 2, 3].map((beat) => <circle key={beat} cx={40 + beat * 73} cy={25}
            r={(beat === 0 ? draft.beatRadius * 1.25 : draft.beatIdleRadius)} fillOpacity={draft.beatOpacity} fill={beat === 0 ? draft.beatColor : beat === 3 ? draft.beatPreviewColor : draft.beatIdleColor} />)}
        </svg>
      </>}
      </fieldset>
    </section>
    {error && <p role="alert" className="pdf-highlight-save-error">{error}</p>}
    <footer><button type="button" disabled={busy} onClick={() => setDraft(defaultPdfMeasureHighlight)}>기본값</button><div><button type="button" disabled={busy} onClick={onClose}>취소</button><button type="button" disabled={busy} onClick={() => onApply(draft)}>{busy ? '저장 중…' : '적용'}</button></div></footer>
  </dialog>;
}
