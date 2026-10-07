import { scoreVisibleParts } from '../lib/scoreParts';
import { useEffect, useRef, useState } from 'react';
import { ScoreFileMenu } from './ScoreFileMenu.web';
import type { ScoreDocument } from '../lib/scoreFile';
import { MAX_SCORE_VERSIONS, type ScorePartVersions } from '../lib/scoreVersions';

export function ScoreVersionControls({
  library,
  selectedId,
  preview,
  dirty,
  disabled,
  pendingSwitch,
  imported,
  onSelect,
  onSwitch,
  onCreate,
  onRename,
  onDelete,
  onApply,
  onCancelImport,
}: {
  library: ScorePartVersions;
  selectedId: string;
  preview: boolean;
  dirty: boolean;
  disabled: boolean;
  pendingSwitch: boolean;
  imported: ScoreDocument | null;
  onSelect: (id: string) => void;
  onSwitch: (action: 'save' | 'discard' | 'cancel') => Promise<void>;
  onCreate: (name: string, document?: ScoreDocument, sourcePart?: string) => Promise<boolean>;
  onRename: (name: string) => Promise<boolean>;
  onDelete: () => Promise<boolean>;
  onApply: () => void;
  onCancelImport: () => void;
}) {
  const [action, setAction] = useState<'duplicate' | 'rename' | 'delete' | null>(null);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [sourcePart, setSourcePart] = useState('');
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const selected = library.versions.find((version) => version.id === selectedId)!;
  const applied = library.versions.find((version) => version.id === library.appliedVersionId)!;
  const isApplied =
    selectedId === library.appliedVersionId &&
    selected.revision === library.appliedRevision &&
    !dirty;
  const open = !!action || !!imported || pendingSwitch;
  useEffect(() => {
    if (open) {
      if (!dialog.current?.open) dialog.current?.showModal();
      input.current?.focus();
      input.current?.select();
    } else dialog.current?.close();
  }, [open]);
  useEffect(() => {
    if (imported) {
      setName('가져온 악보');
      setSourcePart(scoreVisibleParts(imported.score)[0]);
      setError('');
    }
  }, [imported]);
  const close = () => {
    if (disabled) return;
    setAction(null);
    setError('');
    onCancelImport();
    void onSwitch('cancel');
  };
  const begin = (next: typeof action) => {
    setName(
      next === 'rename'
        ? selected.name
        : !library.versions.some((item) => item.name === '이지')
          ? '이지'
          : !library.versions.some((item) => item.name === '하드')
            ? '하드'
            : `${selected.name} 복사`,
    );
    setError('');
    setAction(next);
  };
  return (
    <div className="score-versions" aria-label="악보 버전 관리">
      <div className="score-version-bar">
        <label>
          {library.part} 버전
          <select
            aria-label="편집할 파트 버전"
            value={selectedId}
            disabled={disabled}
            onChange={(event) => onSelect(event.target.value)}
          >
            {library.versions.map((version) => (
              <option key={version.id} value={version.id}>
                {version.name}
                {version.id === library.appliedVersionId
                  ? version.revision === library.appliedRevision
                    ? ' · 연습에 적용됨'
                    : ' · 적용 후 수정됨'
                  : ''}
              </option>
            ))}
          </select>
        </label>
        {!preview && (
          <ScoreFileMenu label="버전 관리" disabled={disabled}>
            <button type="button" disabled={disabled} onClick={() => begin('rename')}>
              버전 이름 변경
            </button>
            <button
              type="button"
              disabled={disabled || selectedId === library.appliedVersionId}
              onClick={() => begin('delete')}
            >
              이 버전 삭제
            </button>
            {selectedId === library.appliedVersionId && (
              <p>이 파트에 다른 버전을 적용한 뒤 삭제할 수 있어요.</p>
            )}
          </ScoreFileMenu>
        )}
        <button
          type="button"
          disabled={disabled || library.versions.length >= MAX_SCORE_VERSIONS}
          onClick={() => begin('duplicate')}
        >
          다른 버전으로 복제
        </button>
        <div className="score-version-applied">
          <span>
            {library.part} 연습: <strong>{applied.name}</strong>
            {applied.revision !== library.appliedRevision ? ' (이전 저장본)' : ''}
          </span>
          {!preview && (
            <button type="button" disabled={disabled} onClick={() => onSelect('@applied')}>
              연습본 미리보기
            </button>
          )}
          {!preview && (
            <button
              type="button"
              className="score-version-apply"
              disabled={disabled || isApplied}
              onClick={onApply}
            >
              {isApplied ? '적용됨' : dirty ? '저장하고 적용' : '연습에 적용'}
            </button>
          )}
        </div>
      </div>
      <p className="score-version-hint">
        {preview
          ? '연습에 적용한 시점의 악보를 읽기 전용으로 보고 있어요. 상단의 ‘이 버전 편집’을 누르면 최신 저장 버전을 수정할 수 있어요.'
          : '선택한 파트만 저장·적용해요. 음원·녹음·BPM·박자는 모든 버전에서 함께 사용해요.'}
      </p>
      <dialog
        ref={dialog}
        className="score-version-dialog"
        aria-labelledby="score-version-dialog-title"
        onCancel={(event) => {
          event.preventDefault();
          close();
        }}
      >
        <h3 id="score-version-dialog-title">
          {pendingSwitch
            ? '변경사항을 저장할까요?'
            : imported
              ? '새 버전으로 가져오기'
              : action === 'rename'
                ? '버전 이름 변경'
                : action === 'delete'
                  ? '버전을 삭제할까요?'
                  : '다른 버전으로 복제'}
        </h3>
        {pendingSwitch ? (
          <>
            <p>
              ‘{selected.name}’에 저장하지 않은 수정이 있어요. 저장해도 연습에 적용된 악보는 바뀌지
              않아요.
            </p>
            <div className="score-version-dialog-actions">
              <button type="button" disabled={disabled} onClick={() => void onSwitch('save')}>
                저장 후 이동
              </button>
              <button type="button" disabled={disabled} onClick={() => void onSwitch('discard')}>
                수정 취소 후 이동
              </button>
              <button type="button" disabled={disabled} onClick={close}>
                계속 편집
              </button>
            </div>
          </>
        ) : (
          <form
            onSubmit={async (event) => {
              event.preventDefault();
              if (disabled) return;
              try {
                const success =
                  action === 'delete'
                    ? await onDelete()
                    : action === 'rename'
                      ? await onRename(name)
                      : await onCreate(name, imported ?? undefined, sourcePart);
                if (success) {
                  setAction(null);
                  setError('');
                } else
                  setError('저장하지 못했어요. 상단의 저장 상태를 확인하고 다시 시도해주세요.');
              } catch (cause) {
                setError(cause instanceof Error ? cause.message : '버전을 저장하지 못했어요.');
              }
            }}
          >
            {action === 'delete' ? (
              <p>
                ‘{selected.name}’과 저장하지 않은 수정을 삭제합니다. 다른 버전과 연습용 악보는
                유지됩니다.
              </p>
            ) : (
              <>
                {imported && (
                  <label>
                    가져올 파트
                    <select
                      aria-label="가져올 악보 파트"
                      value={sourcePart}
                      disabled={disabled}
                      onChange={(event) => setSourcePart(event.target.value)}
                    >
                      {scoreVisibleParts(imported.score).map((name) => (
                        <option key={name} value={name}>
                          {name}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <label>
                  버전 이름
                  <input
                    ref={input}
                    aria-label="악보 버전 이름"
                    value={name}
                    maxLength={40}
                    disabled={disabled}
                    onChange={(event) => setName(event.target.value)}
                  />
                </label>
                {action !== 'rename' && (
                  <p>
                    이 파트의 음표와 악보 설정만 저장해요. 피아노 양손·드럼 손발은 함께 묶이며, 다른
                    파트와 공통 음원은 복사하지 않아요.
                  </p>
                )}
              </>
            )}
            {error && <p role="alert">{error}</p>}
            <div className="score-version-dialog-actions">
              <button type="submit" disabled={disabled}>
                {action === 'delete'
                  ? '버전 삭제 확인'
                  : action === 'rename'
                    ? '이름 저장'
                    : '새 버전 만들기'}
              </button>
              <button type="button" disabled={disabled} onClick={close}>
                취소
              </button>
            </div>
          </form>
        )}
      </dialog>
    </div>
  );
}
