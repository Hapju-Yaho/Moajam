import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { defaultDrumKeys, validDrumKeys, type DrumKeyMap } from '../lib/drumKeyMapping';

export function DrumKeyMapping({
  mapping,
  onSave,
  onClose,
}: {
  mapping: DrumKeyMap;
  onSave: (map: DrumKeyMap) => void;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [draft, setDraft] = useState(mapping);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  return createPortal(
    <dialog
      ref={dialog}
      className="score-project-dialog drum-key-dialog"
      aria-label="드럼 키 매핑"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section>
        <h2>드럼 키 매핑</h2>
        <p>
          드럼 키 입력을 켜면 아래 문자 키로 입력해요.
          <br />
          같은 박에 겹쳐 입력할 수 있고, 방향키로 입력 위치를 옮길 수 있어요.
          <br />
          켜진 동안에는 해당 문자의 기존 주법 단축키 대신 드럼을 입력해요.
        </p>
        {defaultDrumKeys.map((item) => (
          <label className="drum-key-row" key={item.pitch}>
            <span>{item.label}</span>
            <input
              aria-label={`${item.label} 입력 키`}
              value={draft[item.pitch]}
              maxLength={1}
              onChange={(e) => setDraft({ ...draft, [item.pitch]: e.target.value.toLowerCase() })}
            />
          </label>
        ))}
        {!validDrumKeys(draft) && <p role="alert">서로 다른 영문자 한 글자씩 지정해주세요.</p>}
        <footer>
          <button onClick={onClose}>취소</button>
          <button disabled={!validDrumKeys(draft)} onClick={() => onSave(draft)}>
            적용
          </button>
        </footer>
      </section>
    </dialog>,
    document.body,
  );
}
