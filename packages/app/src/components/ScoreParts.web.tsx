import { useScoreEditorLayout } from './ScoreEditorLayout.web';
import { useId, useRef, useState, type ReactNode } from 'react';
import { ScoreSectionToggle } from './ScoreSectionToggle.web';
import { renameScorePart, type Score } from '../lib/score';
import {
  addInstrumentPart,
  moveInstrumentPart,
  partInstrumentLabel,
  removeInstrumentPart,
  scorePartMix,
  scorePartOwner,
  scoreVisibleParts,
} from '../lib/scoreParts';

export function ScoreParts({
  score,
  part,
  disabled,
  ensemble,
  onEnsembleChange,
  onSelect,
  onEdit,
  playAll,
  onPlayAllChange,
  sound,
  recording,
  readOnly = false,
  attached = false,
}: {
  score: Score;
  part: string;
  disabled: boolean;
  ensemble: boolean;
  playAll: boolean;
  onEnsembleChange: (value: boolean) => void;
  onPlayAllChange: (value: boolean) => void;
  onSelect: (part: string) => void;
  onEdit: (score: Score) => void;
  sound?: ReactNode;
  recording?: ReactNode;
  readOnly?: boolean;
  attached?: boolean;
}) {
  const layout = useScoreEditorLayout();
  const [expanded, setExpanded] = useState(true);
  const bodyId = useId();
  const [panel, setPanel] = useState<'add' | 'manage' | 'mix' | null>(null);
  const [name, setName] = useState('');
  const [instrument, setInstrument] = useState('guitar');
  const [message, setMessage] = useState('');
  const [deleting, setDeleting] = useState(false);
  const tabs = useRef<HTMLDivElement>(null);
  const [editingPart, setEditingPart] = useState<string | null>(null);
  const renaming = useRef<string | null>(null);
  const finishRename = (previous: string, value: string) => {
    if (disabled || renaming.current !== previous) return;
    run(() => {
      const next = renameScorePart(score, previous, value);
      renaming.current = null;
      setEditingPart(null);
      onEdit(next);
      if (part === previous) onSelect(value.trim());
      setDeleting(false);
    });
  };
  const drag = useRef<{
    name: string;
    pointerId: number;
    x: number;
    y: number;
    target: number;
    moved: boolean;
  } | null>(null);
  const [dragTarget, setDragTarget] = useState<{ name: string; index: number } | null>(null);
  const [orderMessage, setOrderMessage] = useState('');
  const owner = scorePartOwner(score, part);
  const parts = scoreVisibleParts(score);
  const displayParts = [...parts];
  if (dragTarget && parts.includes(dragTarget.name)) {
    displayParts.splice(displayParts.indexOf(dragTarget.name), 1);
    displayParts.splice(dragTarget.index, 0, dragTarget.name);
  }
  const run = (work: () => void) => {
    try {
      work();
      setMessage('');
    } catch (error) {
      setMessage((error as Error).message);
    }
  };
  const select = (next: string) => {
    onSelect(next);
    setDeleting(false);
    setName('');
  };
  const moveTo = (name: string, target: number) => {
    if (disabled) return;
    const from = parts.indexOf(name);
    if (from < 0 || target < 0 || target >= parts.length || target === from) return;
    run(() => {
      let next = score;
      const direction = target > from ? 1 : -1;
      for (let index = from; index !== target; index += direction)
        next = moveInstrumentPart(next, name, direction);
      onEdit(next);
      setOrderMessage(`${name} 파트를 ${target + 1}번째로 이동했어요.`);
    });
  };
  const cancelDrag = () => {
    drag.current = null;
    setDragTarget(null);
  };
  const playbackControls = (
    <div className="score-part-playback">
      <label>
        재생 범위{' '}
        <select
          aria-label="악보 재생 범위"
          value={playAll ? 'all' : 'part'}
          disabled={disabled}
          onChange={(event) => onPlayAllChange(event.target.value === 'all')}
        >
          <option value="part">현재 파트</option>
          <option value="all">전체 합주</option>
        </select>
      </label>
      <button
        aria-expanded={panel === 'mix'}
        disabled={readOnly}
        onClick={() => setPanel(panel === 'mix' ? null : 'mix')}
      >
        믹서
      </button>
    </div>
  );
  return (
    <section
      className={`score-parts${sound ? ' score-parts--sound' : ''}${attached ? ' score-parts--attached' : ''}`}
      aria-label="악기별 파트"
    >
      <h2 className="score-expanded-parts-title">파트</h2>
      <div className="score-parts-top">
        <div className="score-part-picker">
          <button
            type="button"
            className="score-part-settings"
            aria-label="파트 관리"
            title="파트 관리"
            aria-expanded={panel === 'manage'}
            disabled={disabled || readOnly}
            onClick={() => {
              setExpanded(true);
              cancelDrag();
              renaming.current = null;
              setEditingPart(null);
              setPanel(panel === 'manage' ? null : 'manage');
              setDeleting(false);
            }}
          >
            <svg
              width="19"
              height="19"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="m9 3-.5 2-1.8 1-2-.5-2 3.5 1.5 1.5v3l-1.5 1.5 2 3.5 2-.5 1.8 1 .5 2h4l.5-2 1.8-1 2 .5 2-3.5-1.5-1.5v-3L20.3 9l-2-3.5-2 .5-1.8-1-.5-2z" />
              <circle cx="11.5" cy="12" r="3" />
            </svg>
          </button>
          <div
            ref={tabs}
            className="score-part-tabs"
            aria-label="파트 선택"
            onPointerMove={(event) => {
              const current = drag.current;
              if (!current || current.pointerId !== event.pointerId || disabled) return;
              if (
                !current.moved &&
                Math.hypot(event.clientX - current.x, event.clientY - current.y) < 5
              )
                return;
              current.moved = true;
              const host = tabs.current;
              if (!host) return;
              const bounds = host.getBoundingClientRect();
              if (layout.expanded) {
                if (event.clientY < bounds.top + 28) host.scrollTop -= 18;
                if (event.clientY > bounds.bottom - 28) host.scrollTop += 18;
              }
              if (event.clientX < bounds.left + 28) host.scrollLeft -= 18;
              if (event.clientX > bounds.right - 28) host.scrollLeft += 18;
              const target = Array.from(host.querySelectorAll<HTMLElement>('[data-part-name]'))
                .map((element) => ({ element, rect: element.getBoundingClientRect() }))
                .filter(({ rect }) => rect.right > bounds.left && rect.left < bounds.right)
                .sort(
                  (a, b) =>
                    Math.hypot(
                      event.clientX - (a.rect.left + a.rect.width / 2),
                      event.clientY - (a.rect.top + a.rect.height / 2),
                    ) -
                    Math.hypot(
                      event.clientX - (b.rect.left + b.rect.width / 2),
                      event.clientY - (b.rect.top + b.rect.height / 2),
                    ),
                )[0];
              if (target && target.element.dataset.partName !== current.name)
                current.target = displayParts.indexOf(target.element.dataset.partName!);
              setDragTarget({ name: current.name, index: current.target });
            }}
            onPointerUp={(event) => {
              const current = drag.current;
              if (!current || current.pointerId !== event.pointerId) return;
              if (current.moved) moveTo(current.name, current.target);
              cancelDrag();
              if (event.currentTarget.hasPointerCapture(event.pointerId))
                event.currentTarget.releasePointerCapture(event.pointerId);
            }}
            onPointerCancel={cancelDrag}
            onLostPointerCapture={cancelDrag}
            data-managing={panel === 'manage'}
          >
            {displayParts.map((p) => (
              <div
                key={p}
                className="score-part-chip"
                data-active={owner === p}
                onPointerDown={(event) => {
                  if (
                    panel !== 'manage' ||
                    disabled ||
                    event.button !== 0 ||
                    (event.target as HTMLElement).closest('input, .score-part-edit')
                  )
                    return;
                  event.preventDefault();
                  event.currentTarget
                    .querySelector<HTMLButtonElement>('.score-part-grip')
                    ?.focus({ preventScroll: true });
                  tabs.current?.setPointerCapture(event.pointerId);
                  drag.current = {
                    name: p,
                    pointerId: event.pointerId,
                    x: event.clientX,
                    y: event.clientY,
                    target: parts.indexOf(p),
                    moved: false,
                  };
                }}
                data-part-name={p}
                data-dragging={dragTarget?.name === p}
              >
                {panel === 'manage' && (
                  <button
                    type="button"
                    className="score-part-grip"
                    aria-label={`${p} 순서 이동`}
                    title="끌어서 순서 변경 · 방향키로도 이동할 수 있어요"
                    disabled={disabled}
                    onKeyDown={(event) => {
                      if (event.key === 'Escape') {
                        event.preventDefault();
                        cancelDrag();
                        return;
                      }
                      const direction = ['ArrowLeft', 'ArrowUp'].includes(event.key)
                        ? -1
                        : ['ArrowRight', 'ArrowDown'].includes(event.key)
                          ? 1
                          : 0;
                      if (direction) {
                        event.preventDefault();
                        moveTo(p, parts.indexOf(p) + direction);
                      }
                    }}
                  >
                    <svg
                      width="12"
                      height="18"
                      viewBox="0 0 12 18"
                      fill="currentColor"
                      aria-hidden="true"
                    >
                      {[4, 9, 14].map((y) => (
                        <g key={y}>
                          <circle cx="3" cy={y} r="1.3" />
                          <circle cx="9" cy={y} r="1.3" />
                        </g>
                      ))}
                    </svg>
                  </button>
                )}
                {panel === 'manage' ? (
                  <>
                    {editingPart === p ? (
                      <input
                        className="score-part-name-input"
                        aria-label={`${p} 파트 이름`}
                        defaultValue={p}
                        maxLength={40}
                        disabled={disabled}
                        autoFocus
                        onFocus={(event) => event.currentTarget.select()}
                        onBlur={(event) => finishRename(p, event.currentTarget.value)}
                        onKeyDown={(event) => {
                          if (event.nativeEvent.isComposing) return;
                          if (event.key === 'Enter') {
                            event.preventDefault();
                            finishRename(p, event.currentTarget.value);
                          } else if (event.key === 'Escape') {
                            event.preventDefault();
                            renaming.current = null;
                            setEditingPart(null);
                            setMessage('');
                          }
                        }}
                      />
                    ) : (
                      <span className="score-part-name" title={partInstrumentLabel(score, p)}>
                        {p}
                      </span>
                    )}
                    <button
                      type="button"
                      className="score-part-edit"
                      aria-label={`${p} 이름 ${editingPart === p ? '저장' : '변경'}`}
                      title={editingPart === p ? '이름 저장' : '이름 변경'}
                      disabled={disabled}
                      onPointerDown={(event) => {
                        if (editingPart === p) event.preventDefault();
                      }}
                      onClick={(event) => {
                        cancelDrag();
                        if (editingPart === p) {
                          const input = event.currentTarget.parentElement?.querySelector('input');
                          if (input) finishRename(p, input.value);
                          return;
                        }
                        renaming.current = p;
                        setEditingPart(p);
                        setMessage('');
                      }}
                    >
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.7"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        {editingPart === p ? (
                          <path d="m5 12 4 4L19 6" />
                        ) : (
                          <path d="m16 3 5 5-12 12-6 1 1-6zM14 5l5 5" />
                        )}
                      </svg>
                    </button>
                  </>
                ) : (
                  <button
                    aria-label={p}
                    aria-pressed={owner === p}
                    disabled={disabled}
                    onClick={() => select(p)}
                    title={partInstrumentLabel(score, p)}
                  >
                    <span className="score-expanded-part-icon" aria-hidden="true">
                      ♫
                    </span>
                    <span>
                      {p}
                      <small className="score-expanded-part-instrument">
                        {partInstrumentLabel(score, p)}
                      </small>
                    </span>
                  </button>
                )}
                {layout.expanded && panel !== 'manage' && (
                  <div className="score-expanded-part-mix">
                    {(['muted', 'solo'] as const).map((key) => (
                      <button
                        key={key}
                        aria-label={`${p} 빠른 ${key === 'muted' ? '음소거' : '솔로'}`}
                        aria-pressed={scorePartMix(score, p)[key]}
                        disabled={disabled || readOnly}
                        onClick={() =>
                          onEdit({
                            ...score,
                            partMix: {
                              ...score.partMix,
                              [p]: {
                                ...scorePartMix(score, p),
                                [key]: !scorePartMix(score, p)[key],
                              },
                            },
                          })
                        }
                      >
                        {key === 'muted' ? 'M' : 'S'}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
            <button
              aria-expanded={panel === 'add'}
              disabled={disabled || readOnly}
              onClick={() => {
                setExpanded(true);
                setPanel(panel === 'add' ? null : 'add');
                setName('');
              }}
            >
              ＋ 파트
            </button>
          </div>
        </div>
        {attached ? (
          playbackControls
        ) : (
          <div className="score-view-switch">
            <button aria-pressed={!ensemble} onClick={() => onEnsembleChange(false)}>
              개별 악보
            </button>
            <button aria-pressed={ensemble} onClick={() => onEnsembleChange(true)}>
              합주 악보
            </button>
            <ScoreSectionToggle
              label="파트 · 음색 · 내 녹음"
              expanded={expanded}
              controls={bodyId}
              onClick={() => {
                setExpanded(!expanded);
                cancelDrag();
                setPanel(null);
              }}
            />
          </div>
        )}
      </div>
      <div id={bodyId} className="score-section-body" hidden={!attached && !expanded}>
        {panel === 'manage' && (
          <p className="score-part-drag-hint">
            이름이나 손잡이를 끌어 순서를 바꾸고, 연필을 눌러 이름을 수정하세요. 손잡이에서
            방향키로도 이동할 수 있어요.
          </p>
        )}
        <span className="score-part-order-status" role="status">
          {orderMessage}
        </span>
        {!attached && (
          <div className="score-part-options">
            {sound ? (
              <>
                <div className="score-part-identity">
                  <span aria-hidden="true">♫</span>
                  <div>
                    <strong>{owner}</strong>
                    <small>선택한 파트</small>
                  </div>
                </div>
                {sound}
              </>
            ) : (
              <span>{partInstrumentLabel(score, part)}</span>
            )}
            {playbackControls}
          </div>
        )}
        {recording}
        {panel === 'add' && (
          <form
            className="score-part-panel"
            onSubmit={(e) => {
              e.preventDefault();
              run(() => {
                const base =
                  {
                    guitar: '기타',
                    bass: '베이스',
                    piano: '키보드',
                    drums: '드럼',
                    standard: '오선보',
                  }[instrument] ?? '악기';
                let suggested = `${base} 1`;
                for (let i = 2; score.parts.includes(suggested); i++) suggested = `${base} ${i}`;
                const next = addInstrumentPart(score, name.trim() || suggested, instrument);
                onEdit(next);
                select(next.parts[score.parts.length]);
                setPanel(null);
              });
            }}
          >
            <label>
              악기{' '}
              <select
                aria-label="추가할 악기"
                value={instrument}
                onChange={(e) => setInstrument(e.target.value)}
              >
                <option value="guitar">기타</option>
                <option value="bass">베이스</option>
                <option value="piano">키보드 · 양손</option>
                <option value="drums">드럼</option>
                <option value="standard">보컬 / 일반 오선보</option>
              </select>
            </label>
            <label>
              파트 이름{' '}
              <input
                aria-label="새 파트 이름"
                placeholder="비워두면 자동으로 이름을 붙여요"
                maxLength={40}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <button type="submit" disabled={disabled}>
              추가하기
            </button>
            <small>
              같은 악기도 여러 파트로 추가할 수 있어요. 키보드는 양손의 리듬을 따로 입력해요.
            </small>
          </form>
        )}
        {panel === 'mix' && (
          <div className="score-part-panel score-mixer-panel">
            <div className="score-mixer">
              {parts.map((p) => {
                const mix = scorePartMix(score, p);
                const update = (value: Partial<typeof mix>) =>
                  onEdit({ ...score, partMix: { ...score.partMix, [p]: { ...mix, ...value } } });
                return (
                  <div key={p}>
                    <strong>{p}</strong>
                    <button
                      className="score-mixer-mute"
                      aria-label={`${p} 음소거`}
                      aria-pressed={mix.muted}
                      disabled={disabled}
                      onClick={() => update({ muted: !mix.muted })}
                    >
                      음소거
                    </button>
                    <button
                      className="score-mixer-solo"
                      aria-label={`${p} 솔로`}
                      aria-pressed={mix.solo}
                      disabled={disabled}
                      onClick={() => update({ solo: !mix.solo })}
                    >
                      솔로
                    </button>
                    <input
                      aria-label={`${p} 음량`}
                      type="range"
                      min="0"
                      max="1"
                      step="0.01"
                      value={mix.volume}
                      disabled={disabled}
                      onChange={(e) => update({ volume: Number(e.target.value) })}
                    />
                    <output>{Math.round(mix.volume * 100)}%</output>
                  </div>
                );
              })}
            </div>
            <button disabled={disabled || parts.length <= 1} onClick={() => setDeleting(true)}>
              파트 삭제
            </button>
            {deleting && (
              <div role="alert">
                {owner}의 음표{score.keyboardStaves?.[owner] ? '와 양손 악보' : ''}를 삭제할까요?{' '}
                <button
                  disabled={disabled}
                  onClick={() =>
                    run(() => {
                      const next = removeInstrumentPart(score, owner);
                      onEdit(next);
                      select(scoreVisibleParts(next)[0]);
                    })
                  }
                >
                  삭제 확인
                </button>
                <button onClick={() => setDeleting(false)}>취소</button>
              </div>
            )}
          </div>
        )}
        {message && <p role="alert">{message}</p>}
      </div>
    </section>
  );
}
