import { useEffect, useRef, useState } from 'react';

const instruments = [
  ['guitar', '통기타'],
  ['electric', '일렉기타'],
  ['bass', '베이스'],
  ['piano', '키보드 · 양손'],
  ['drums', '드럼'],
  ['standard', '보컬 / 일반 오선보'],
] as const;

export function ScoreInstrumentDialog({
  mode,
  part,
  onClose,
  onAdd,
  onRemove,
  onRename,
}: {
  mode: 'add' | 'remove' | 'rename';
  part: string;
  onClose: () => void;
  onAdd: (instrument: string, name: string) => void;
  onRemove: () => void;
  onRename?: (name: string) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [instrument, setInstrument] = useState('guitar');
  const [name, setName] = useState(mode === 'rename' ? part : '');
  const [error, setError] = useState('');
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="score-repeat-dialog score-instrument-dialog"
      aria-label={mode === 'add' ? '악기 추가' : mode === 'rename' ? '악기 이름 변경' : '악기 삭제'}
      onClick={(event) => {
        if (event.target !== event.currentTarget) return;
        const rect = event.currentTarget.getBoundingClientRect();
        if (
          event.clientX < rect.left ||
          event.clientX > rect.right ||
          event.clientY < rect.top ||
          event.clientY > rect.bottom
        )
          onClose();
      }}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          try {
            if (mode === 'add') onAdd(instrument, name.trim());
            else if (mode === 'rename') onRename?.(name.trim());
            else onRemove();
            onClose();
          } catch (error) {
            setError(error instanceof Error ? error.message : '악기를 변경하지 못했어요.');
          }
        }}
      >
        <h3>{mode === 'add' ? '악기 추가' : mode === 'rename' ? '악기 이름 변경' : '악기 삭제'}</h3>
        {mode === 'add' ? (
          <div className="score-instrument-fields">
            <label>
              악기
              <select
                aria-label="추가할 악기"
                value={instrument}
                onChange={(event) => setInstrument(event.target.value)}
              >
                {instruments.map(([id, label]) => (
                  <option key={id} value={id}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              파트 이름
              <input
                aria-label="새 악기 이름"
                value={name}
                maxLength={40}
                placeholder="비워두면 자동으로 이름을 붙여요"
                onChange={(event) => setName(event.target.value)}
              />
            </label>
          </div>
        ) : mode === 'rename' ? (
          <div className="score-instrument-fields">
            <label>
              파트 이름
              <input
                autoFocus
                aria-label="악기 이름"
                maxLength={40}
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </label>
          </div>
        ) : (
          <p>‘{part}’ 악기와 악보를 정말 삭제할까요?</p>
        )}
        {error && <p role="alert">{error}</p>}
        <footer data-mode={mode}>
          <button type="button" onClick={onClose}>
            취소
          </button>
          <button className={mode === 'remove' ? 'score-instrument-delete' : undefined}>
            {mode === 'add' ? '추가' : mode === 'rename' ? '변경' : '삭제'}
          </button>
        </footer>
      </form>
    </dialog>
  );
}
