import { useEffect, useRef, useState } from 'react';
export function ScoreRepeatDialog({
  maxBars,
  initial,
  onApply,
  onClose,
}: {
  maxBars: number;
  initial: { start: number; end: number };
  onApply: (range: { start: number; end: number }) => void;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [start, setStart] = useState(String(initial.start)),
    [end, setEnd] = useState(String(initial.end));
  const a = Number(start),
    b = Number(end),
    valid = Number.isInteger(a) && Number.isInteger(b) && a >= 1 && a <= b && b <= maxBars;
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="score-repeat-dialog"
      aria-label="반복 마디 설정"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (valid) onApply({ start: a, end: b });
        }}
      >
        <h3>구간 반복</h3>
        <div>
          <label>
            시작 마디
            <input
              autoFocus
              aria-label="반복 시작 마디"
              type="number"
              min={1}
              max={maxBars}
              value={start}
              onChange={(event) => setStart(event.target.value)}
            />
          </label>
          <span>부터</span>
          <label>
            끝 마디
            <input
              aria-label="반복 끝 마디"
              type="number"
              min={1}
              max={maxBars}
              value={end}
              onChange={(event) => setEnd(event.target.value)}
            />
          </label>
          <span>까지</span>
        </div>
        {!valid && <p role="alert">1~{maxBars}마디 안에서 시작과 끝을 순서대로 입력해주세요.</p>}
        <footer>
          <button type="button" onClick={onClose}>
            취소
          </button>
          <button disabled={!valid}>적용</button>
        </footer>
      </form>
    </dialog>
  );
}
