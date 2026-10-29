import { useScoreFilePanel } from './useScoreFilePanel.web';
import { ScoreImportOverwrite } from './ScoreImportOverwrite.web';
import { useEffect, useRef, useState } from 'react';
import { scoreMeasureCount, scoreBarBeats, type Score } from '../lib/score';
import { scoreVisibleParts } from '../lib/scoreParts';
import {
  readScoreMidi,
  midiInsertionRange,
  insertScoreMidi,
  type MidiImportData,
} from '../lib/scoreMidiImport';

export function ScoreMidiImport({
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
  useScoreFilePanel(dialog);
  const [data, setData] = useState<MidiImportData | null>(null),
    [error, setError] = useState('');
  const [track, setTrack] = useState(0),
    [target, setTarget] = useState(part),
    [bar, setBar] = useState('1'),
    [grid, setGrid] = useState(0.25);
  const [confirm, setConfirm] = useState(false),
    [applied, setApplied] = useState(false);
  useEffect(() => {
    dialog.current?.show();
    let active = true;
    if (file.size > 10 * 1024 * 1024) {
      setError('10MB 이하 MIDI 파일을 선택해주세요.');
      return;
    }
    void file
      .arrayBuffer()
      .then((buffer) => {
        if (active) setData(readScoreMidi(buffer));
      })
      .catch((e) => {
        if (active) setError(e instanceof Error ? e.message : 'MIDI를 읽지 못했어요.');
      });
    return () => {
      active = false;
    };
  }, [file]);
  const max = Math.min(32000, Math.max(...score.parts.map((p) => scoreMeasureCount(score, p))) + 1);
  const start = () =>
    Math.max(
      1,
      Math.min(max, Number.isFinite(Number(bar)) && bar.trim() ? Math.round(Number(bar)) : 1),
    );
  const apply = (overwrite = false) => {
    if (!data) return;
    try {
      setError('');
      setBar(String(start()));
      if (!overwrite && midiInsertionRange(score, data, target, start()).conflicts) {
        setConfirm(true);
        return;
      }
      onApply(insertScoreMidi(score, data, track, target, start(), grid));
      setConfirm(false);
      setApplied(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'MIDI를 삽입하지 못했어요.');
      setConfirm(false);
    }
  };
  return (
    <dialog
      ref={dialog}
      className="score-export-dialog score-midi-import score-file-floating"
      aria-labelledby="score-midi-import-title"
      onCancel={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section>
        <header>
          <h2 id="score-midi-import-title">MIDI 가져오기</h2>
          <button type="button" aria-label="MIDI 가져오기 닫기" onClick={onClose}>
            ×
          </button>
        </header>
        <p>{file.name}</p>
        {!data && !error && <p role="status">MIDI 파일을 읽고 있어요…</p>}
        {data && (
          <>
            <div className="score-midi-summary">
              <strong>총 {data.bars}마디</strong>
              <p>
                {data.meter.beats}/{data.meter.beatType}박자 · {data.tracks.length}개 트랙 ·{' '}
                {data.tracks.reduce((n, t) => n + t.notes.length, 0)}개 음표 · 원본 {data.bpm} BPM
              </p>
            </div>
            <fieldset disabled={confirm || applied}>
              <label>
                가져올 트랙
                <select
                  aria-label="가져올 MIDI 트랙"
                  value={track}
                  onChange={(e) => setTrack(Number(e.target.value))}
                >
                  {data.tracks.map((t, i) => (
                    <option key={i} value={i}>
                      {t.name} · {t.notes.length}개 음표{t.channel === 9 ? ' · 드럼' : ''}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                박자 정렬
                <select
                  aria-label="MIDI 박자 정렬"
                  value={grid}
                  onChange={(e) => setGrid(Number(e.target.value))}
                >
                  <option value={0.5}>8분음표</option>
                  <option value={0.25}>16분음표</option>
                  <option value={0.125}>32분음표</option>
                  <option value={1 / 3}>8분 셋잇단음표</option>
                  <option value={1 / 6}>16분 셋잇단음표</option>
                </select>
              </label>
              <hr />
              <label>
                대상 파트
                <select
                  aria-label="MIDI 삽입 파트"
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
                  aria-label="MIDI 삽입 시작 마디"
                  value={bar}
                  onChange={(e) => setBar(e.target.value)}
                  onBlur={() => setBar(String(start()))}
                />
              </label>
              <p>
                현재 악보의 {score.timeSignature?.beats ?? 4}/{score.timeSignature?.beatType ?? 4}
                박자 기준 약 {Math.ceil(data.beats / scoreBarBeats(score))}마디를 채웁니다. BPM과
                다른 파트는 유지해요.
              </p>
            </fieldset>
            {data.warnings.map((w) => (
              <p key={w}>{w}</p>
            ))}
            <p>
              빈 박은 쉼표로 채우고 겹치는 음은 구간별 화음으로 변환해요. 기타·베이스 운지와 키보드
              양손은 자동 배치하므로 가져온 뒤 확인해주세요.
            </p>
          </>
        )}
        {error && <p role="alert">{error}</p>}
        {applied && <p role="status">MIDI 악보를 삽입했어요. 프로젝트를 저장해주세요.</p>}
        {confirm && (
          <ScoreImportOverwrite
            format="MIDI"
            target={target}
            bar={start()}
            onCancel={() => setConfirm(false)}
            onConfirm={() => apply(true)}
          />
        )}
        {
          <footer>
            <button type="button" onClick={onClose}>
              닫기
            </button>
            {!applied && (
              <button type="button" disabled={!data} onClick={() => apply()}>
                악보에 삽입
              </button>
            )}
          </footer>
        }
      </section>
    </dialog>
  );
}
