import { useEffect, useRef } from 'react';

export function ScoreImportOverwrite({
  format,
  target,
  bar,
  onCancel,
  onConfirm,
}: {
  format: string;
  target: string;
  bar: number;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="score-export-dialog score-import-overwrite"
      role="alertdialog"
      aria-label={`${format} 덮어쓰기 확인`}
      onKeyDown={(event) => event.stopPropagation()}
      onCancel={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onCancel();
      }}
      onClick={(event) => {
        event.stopPropagation();
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <section>
        <h2>기존 음표를 덮어쓸까요?</h2>
        <p>
          {target}의 {bar}마디부터 삽입할 구간에 음표가 있어요. 해당 구간의 기존 음표를 지우고{' '}
          {format} 악보로 바꿔요.
        </p>
        <footer>
          <button type="button" autoFocus onClick={onCancel}>
            취소
          </button>
          <button type="button" onClick={onConfirm}>
            덮어쓰기
          </button>
        </footer>
      </section>
    </dialog>
  );
}
