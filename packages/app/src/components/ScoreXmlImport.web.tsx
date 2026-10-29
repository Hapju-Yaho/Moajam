import { useEffect, useRef, useState } from 'react';
import { scoreMeasureCount, type Score } from '../lib/score';
import { scoreVisibleParts, scorePartStaves } from '../lib/scoreParts';
import { scoreFromMusicXml } from '../lib/scoreImport.web';
import { insertScoreXml, xmlInsertionRange } from '../lib/scoreXmlInsertion';

export function ScoreXmlImport({
  file,
  score,
  part,
  onApply,
  onClose,
}: {
  file: File;
  score: Score;
  part: string;
  onApply: (score: Score) => void;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [source, setSource] = useState<Score | null>(null),
    [from, setFrom] = useState(''),
    [target, setTarget] = useState(part),
    [bar, setBar] = useState('1');
  const [error, setError] = useState(''),
    [confirm, setConfirm] = useState(false),
    [applied, setApplied] = useState(false);
  useEffect(() => {
    dialog.current?.showModal();
    let active = true;
    if (file.size > 5 * 1024 * 1024) {
      setError('5MB 이하 MusicXML 파일을 선택해주세요.');
      return;
    }
    void file
      .text()
      .then((text) => {
        const parsed = scoreFromMusicXml(text);
        if (active) {
          setSource(parsed);
          setFrom(scoreVisibleParts(parsed)[0] ?? parsed.parts[0]);
        }
      })
      .catch((e) => {
        if (active) setError(e instanceof Error ? e.message : 'MusicXML을 읽지 못했어요.');
      });
    return () => {
      active = false;
    };
  }, [file]);
  const max = Math.min(32000, Math.max(...score.parts.map((p) => scoreMeasureCount(score, p))) + 1);
  const start = () =>
    Math.max(
      1,
      Math.min(max, bar.trim() && Number.isFinite(Number(bar)) ? Math.round(Number(bar)) : 1),
    );
  const apply = (overwrite = false) => {
    if (!source) return;
    try {
      setError('');
      setBar(String(start()));
      if (!overwrite && xmlInsertionRange(score, source, from, target, start()).conflicts) {
        setConfirm(true);
        return;
      }
      onApply(insertScoreXml(score, source, from, target, start()));
      setConfirm(false);
      setApplied(true);
    } catch (e) {
      setConfirm(false);
      setError(e instanceof Error ? e.message : '악보를 삽입하지 못했어요.');
    }
  };
  return (
    <dialog
      ref={dialog}
      className="score-export-dialog score-midi-import"
      aria-labelledby="score-xml-import-title"
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section>
        <header>
          <h2 id="score-xml-import-title">MusicXML 가져오기</h2>
          <button type="button" aria-label="MusicXML 가져오기 닫기" onClick={onClose}>
            ×
          </button>
        </header>
        <p>{file.name}</p>
        {!source && !error && <p role="status">MusicXML 파일을 읽고 있어요…</p>}
        {source && (
          <>
            <div className="score-midi-summary">
              <strong>
                {source.title} · 총{' '}
                {Math.max(...source.parts.map((p) => scoreMeasureCount(source, p)))}마디
              </strong>
              <p>
                {source.timeSignature?.beats ?? 4}/{source.timeSignature?.beatType ?? 4}박자 ·{' '}
                {scoreVisibleParts(source).length}개 파트 ·{' '}
                {source.notes.filter((n) => !n.rest).length}개 음표 · 원본 {source.bpm} BPM
              </p>
            </div>
            <fieldset disabled={confirm || applied}>
              <label>
                가져올 파트
                <select
                  aria-label="가져올 MusicXML 파트"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                >
                  {source.parts.map((p) => (
                    <option key={p} value={p}>
                      {p} · {scoreMeasureCount(source, p)}마디
                    </option>
                  ))}
                </select>
              </label>
              <label>
                대상 파트
                <select
                  aria-label="MusicXML 삽입 파트"
                  value={target}
                  onChange={(e) => setTarget(e.target.value)}
                >
                  {scoreVisibleParts(score).map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                시작 마디
                <input
                  type="number"
                  aria-label="MusicXML 삽입 시작 마디"
                  value={bar}
                  onChange={(e) => setBar(e.target.value)}
                  onBlur={() => setBar(String(start()))}
                />
              </label>
              <p>
                현재 프로젝트의 BPM·박자·악기 설정과 다른 파트는 유지해요. 음표와 쉼표를 원본
                길이대로 삽입해요.
              </p>
              {scorePartStaves(source, from).length > scorePartStaves(score, target).length && (
                <p>
                  대상 파트에는 첫 번째 보표만 삽입해요. 다른 보표는 가져올 파트에서 따로 선택할 수
                  있어요.
                </p>
              )}
            </fieldset>
          </>
        )}
        {error && <p role="alert">{error}</p>}
        {applied && <p role="status">MusicXML 악보를 삽입했어요. 프로젝트를 저장해주세요.</p>}
        {confirm ? (
          <section
            className="score-midi-overwrite"
            role="alertdialog"
            aria-label="MusicXML 덮어쓰기 확인"
          >
            <strong>기존 음표를 덮어쓸까요?</strong>
            <p>
              {target}의 {start()}마디부터 삽입할 구간에 음표가 있어요. 해당 구간의 기존 음표를
              지우고 바꿔요.
            </p>
            <footer>
              <button type="button" onClick={() => setConfirm(false)}>
                취소
              </button>
              <button type="button" onClick={() => apply(true)}>
                덮어쓰기
              </button>
            </footer>
          </section>
        ) : (
          <footer>
            <button type="button" onClick={onClose}>
              닫기
            </button>
            {!applied && (
              <button type="button" disabled={!source} onClick={() => apply()}>
                악보에 삽입
              </button>
            )}
          </footer>
        )}
      </section>
    </dialog>
  );
}
