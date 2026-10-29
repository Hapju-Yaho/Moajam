import { useCallback, useEffect, useRef, useState, type PropsWithChildren } from 'react';
import { ScoreEditorScreen } from './ScoreEditorScreen.web';
import type { ScoreViewActions } from '../components/ScoreEditorViewport.web';
import type { ScreenProps } from '../navigation';
import { useIdentity } from '../state/Identity';
import { useMockAppState } from '../state/MockAppState';
import { AppShell } from '../components/AppShell';
import { ActionButton, Meta, Surface } from '../components/ProductUI';
import {
  createScoreProject,
  deleteScoreProject,
  listScoreProjects,
  readScoreProject,
  type ScoreProject,
  type ScoreProjectEditorHandle,
} from '../lib/scoreProjects.web';
import '../components/ScoreProjectWorkspace.web.css';
import { ProjectPencilIcon } from '../components/DawProjectControls.web';

export function BandScoreEditorScreen(props: ScreenProps) {
  const { adoptedSongs, workspaceId } = useMockAppState();
  const song = adoptedSongs.find((item) => item.id === props.entityId);
  if (!song)
    return (
      <AppShell activeRoute="band-score-editor" onNavigate={props.navigate}>
        <Surface>
          <Meta>이 밴드에서 곡을 찾을 수 없어요.</Meta>
          <ActionButton onPress={() => props.navigate('songs', { workspaceId })}>
            참여곡 목록
          </ActionButton>
        </Surface>
      </AppShell>
    );
  return (
    <BandScoreProjects
      key={`${workspaceId}/${song.id}`}
      {...props}
      songId={song.id}
      title={song.title}
    />
  );
}
export function BandScoreProjects(
  props: ScreenProps & { songId: string; title: string; personal?: boolean; embedded?: boolean },
) {
  const state = useMockAppState();
  const user = useIdentity();
  const workspaceId = props.personal ? `local-recording/score/${user}` : state.workspaceId;
  const selectionKey = `moajam/score-project-selection/${user}/${workspaceId}/${props.songId}`;
  const workspace = state.workspace;
  const [projects, setProjects] = useState<ScoreProject[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [editingName, setEditingName] = useState(false);
  const nameInput = useRef<HTMLInputElement>(null);
  const nameBeforeEdit = useRef('');
  useEffect(() => {
    if (editingName) {
      nameInput.current?.focus();
      nameInput.current?.select();
    }
  }, [editingName]);
  const [savedName, setSavedName] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const [entryView, setEntryView] = useState(props.scoreView);
  const [mode, setMode] = useState<'new' | 'select' | 'saveas' | null>(null);
  const [draft, setDraft] = useState('');
  const [pending, setPending] = useState<null | (() => Promise<void>)>(null);
  const editor = useRef<ScoreProjectEditorHandle | null>(null);
  const [editorState, setEditorState] = useState({ dirty: false, busy: false });
  const panel = useRef<HTMLDialogElement>(null);
  const confirm = useRef<HTMLDialogElement>(null);
  const deleteDialog = useRef<HTMLDialogElement>(null);
  const [deleting, setDeleting] = useState<ScoreProject | null>(null);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const refresh = useCallback(async () => {
    const rows = await listScoreProjects(workspaceId, props.songId, props.title);
    if (alive.current) setProjects(rows);
    return rows;
  }, [workspaceId, props.songId, props.title]);
  useEffect(() => {
    void refresh()
      .then((rows) => {
        if (!alive.current) return;
        let remembered: string | null = null;
        try {
          remembered = sessionStorage.getItem(selectionKey);
        } catch {
          /* Browser storage is optional. */
        }
        const selected = props.projectId
          ? rows.find((item) => item.id === props.projectId)
          : (rows.find((item) => item.id === remembered) ?? rows[0]);
        if (props.projectId && !selected)
          setError(
            '요청한 악보 프로젝트가 삭제되었거나 존재하지 않아요. 프로젝트 선택에서 다른 프로젝트를 열어주세요.',
          );
        if (selected) {
          setActive(selected.id);
          setName(selected.name);
          setSavedName(selected.name);
        }
      })
      .catch((e) => {
        if (alive.current)
          setError(e instanceof Error ? e.message : '프로젝트를 불러오지 못했어요.');
      })
      .finally(() => {
        if (alive.current) setLoading(false);
      });
  }, [refresh, props.projectId, selectionKey]);
  useEffect(() => {
    if (!active) return;
    try {
      sessionStorage.setItem(selectionKey, active);
    } catch {
      /* Browser storage is optional. */
    }
  }, [active, selectionKey]);
  useEffect(() => {
    if (mode) panel.current?.showModal();
    else panel.current?.close();
  }, [mode]);
  useEffect(() => {
    if (pending) confirm.current?.showModal();
    else confirm.current?.close();
  }, [pending]);
  useEffect(() => {
    if (deleting) deleteDialog.current?.showModal();
    else deleteDialog.current?.close();
  }, [deleting]);
  const onState = useCallback(
    (state: { dirty: boolean; busy: boolean }) => setEditorState(state),
    [],
  );
  const onSaved = useCallback(
    (next: string) => {
      setSavedName(next);
      setName(next);
      void refresh().catch(() => {});
    },
    [refresh],
  );
  const dirty = editorState.dirty || name.trim() !== savedName;
  const locked = busy || loading || editorState.busy;
  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError('');
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : '작업을 완료하지 못했어요.');
    } finally {
      if (alive.current) setBusy(false);
    }
  };
  const request = async (action: () => Promise<void>) => {
    if (active && dirty) {
      setPending(() => action);
      return;
    }
    await run(action);
  };
  const choose = async (project: ScoreProject) => {
    project = await readScoreProject(workspaceId, props.songId, project.id);
    setActive(project.id);
    setName(project.name);
    setSavedName(project.name);
    setEditorState({ dirty: false, busy: true });
    setMode(null);
    setReload((n) => n + 1);
  };
  const reloadCurrent = async () => {
    const rows = await refresh();
    const current = rows.find((project) => project.id === active) ?? rows[0];
    if (current) await choose(current);
    else {
      setActive(null);
      setName('');
      setSavedName('');
      setEditorState({ dirty: false, busy: false });
    }
  };
  const removeProject = async (project: ScoreProject) => {
    const current = await readScoreProject(workspaceId, props.songId, project.id);
    await deleteScoreProject(workspaceId, props.songId, project.id, current.revision);
    setDeleting(null);
    const rows = await refresh();
    if (active === project.id) {
      if (rows[0]) await choose(rows[0]);
      else {
        setActive(null);
        setName('');
        setSavedName('');
        setEditorState({ dirty: false, busy: false });
      }
    }
  };
  const duplicate = projects.some(
    (project) => project.name.toLowerCase() === draft.trim().toLowerCase(),
  );
  const open = (next: NonNullable<typeof mode>) => {
    setError('');
    setDraft(next === 'saveas' ? `${name.slice(0, 156)} 복사본` : props.title.slice(0, 160));
    setMode(next);
  };
  const toolbar = (status?: string, actions?: ScoreViewActions) => (
    <div className="score-project-bar" data-actions-open={actions?.menuOpen ?? actionsOpen}>
      <div className="score-project-identity">
        <div className="score-project-meta">
          <small>
            {props.personal ? '개인 악보 · 이 기기에 저장' : `${workspace?.name} · ${props.title}`}
          </small>
          {status && !status.includes('불러왔어요') && (
            <span className="score-project-status" role="status">
              {status}
            </span>
          )}
        </div>
        {active ? (
          <label>
            <input
              ref={nameInput}
              readOnly={!editingName}
              aria-label="악보 프로젝트 이름"
              value={name}
              style={{
                width: `${Math.max(
                  1,
                  Array.from(name).reduce(
                    (width, char) => width + (char.charCodeAt(0) > 255 ? 1 : 0.58),
                    0,
                  ),
                )}em`,
                maxWidth: 'calc(100% - 18px)',
              }}
              maxLength={160}
              disabled={locked}
              onChange={(e) => setName(e.target.value)}
              onBlur={() => setEditingName(false)}
              onKeyDown={(e) => {
                if (e.nativeEvent.isComposing) return;
                if (e.key === 'Enter') e.currentTarget.blur();
                if (e.key === 'Escape') {
                  setName(nameBeforeEdit.current);
                  setEditingName(false);
                }
              }}
            />
            <span aria-label={dirty ? '저장하지 않은 변경사항' : ''}>{dirty ? '*' : ''}</span>
            {!editingName && (
              <button
                type="button"
                className="project-name-pencil"
                aria-label="악보 프로젝트 이름 수정"
                title="이름 수정"
                disabled={locked}
                onClick={(e) => {
                  e.preventDefault();
                  nameBeforeEdit.current = name;
                  setEditingName(true);
                }}
              >
                <ProjectPencilIcon />
              </button>
            )}
          </label>
        ) : (
          <strong>악보 프로젝트</strong>
        )}
      </div>
      {active && actions?.expanded && (
        <button
          type="button"
          className="score-project-quick-save"
          aria-label={props.personal ? '이 기기에 저장' : '서버에 저장'}
          title={props.personal ? '이 기기에 저장' : '서버에 저장'}
          disabled={locked || !dirty || !name.trim()}
          onClick={() =>
            void run(async () => {
              await editor.current?.save();
            })
          }
        >
          <svg
            viewBox="0 0 24 24"
            width="18"
            height="18"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M4 3h13l4 4v14H3V3h1Z" />
            <path d="M7 3v6h9V3M7 21v-8h10v8M13 4v3" />
          </svg>
        </button>
      )}
      {active && (
        <button
          className="score-project-actions-toggle"
          aria-label="프로젝트 작업 메뉴"
          aria-expanded={actions?.menuOpen ?? actionsOpen}
          onClick={() => {
            setActionsOpen(!actionsOpen);
            actions?.toggleMenu?.();
          }}
        >
          <svg
            viewBox="0 0 24 24"
            width="18"
            height="18"
            aria-hidden="true"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
          >
            <path d={(actions?.menuOpen ?? actionsOpen) ? 'm5 15 7-7 7 7' : 'm5 9 7 7 7-7'} />
          </svg>
        </button>
      )}
      <div
        className="score-project-actions"
        hidden={!!active && !(actions?.menuOpen ?? actionsOpen)}
      >
        {actions?.file}
        <hr className="score-project-menu-divider" />
        {actions?.shortcuts}
        <hr className="score-project-menu-divider" />
        <button disabled={locked} onClick={() => open('new')}>
          새 프로젝트
        </button>
        <button disabled={locked} onClick={() => open('select')}>
          프로젝트 선택
        </button>
        <button disabled={!active || locked} onClick={() => open('saveas')}>
          다른 이름으로 저장
        </button>
        <button
          className="score-project-save"
          disabled={!active || locked || !dirty || !name.trim()}
          onClick={() =>
            void run(async () => {
              await editor.current?.save();
            })
          }
        >
          {props.personal ? '이 기기에 저장' : '서버에 저장'}
        </button>
        <button
          aria-label="악보 프로젝트 새로고침"
          title="새로고침"
          disabled={locked}
          onClick={() =>
            void request(async () => {
              await reloadCurrent();
            })
          }
        >
          ↻
        </button>
      </div>
    </div>
  );
  return (
    <ScoreProjectShell
      embedded={props.embedded}
      activeRoute={props.personal ? 'score-editor' : 'band-score-editor'}
      entityId={props.songId}
      onNavigate={props.navigate}
      hideSyncControls
    >
      {!props.personal && !props.embedded && (
        <ActionButton
          secondary
          compact
          onPress={() => props.navigate('song', { id: props.songId, workspaceId })}
        >
          곡으로 돌아가기
        </ActionButton>
      )}
      {error && (
        <p role="alert" className="score-project-error">
          {error}
        </p>
      )}
      {active ? (
        <ScoreEditorScreen
          key={`${active}/${reload}`}
          {...props}
          entityId={props.personal ? undefined : props.songId}
          scoreView={entryView === 'expanded' ? 'expanded' : undefined}
          bandScore={!props.personal}
          projectWorkspaceId={workspaceId}
          embedded
          scoreProjectId={active}
          scoreProjectName={name.trim()}
          projectNameDirty={name.trim() !== savedName}
          projectControls={toolbar}
          projectBridge={editor}
          onProjectState={onState}
          onProjectSaved={onSaved}
          onRequestEditClose={(close) =>
            void request(async () => {
              close();
              setEntryView(undefined);
              await reloadCurrent();
            })
          }
        />
      ) : (
        <section className="score-project-empty">
          {toolbar()}
          <div>
            {loading
              ? '악보 프로젝트를 불러오는 중…'
              : props.personal
                ? '새 악보를 생성해주세요.'
                : '새 악보를 생성해주세요'}
          </div>
        </section>
      )}
      <dialog
        ref={panel}
        className="score-project-dialog"
        aria-label={
          mode === 'select'
            ? '악보 프로젝트 선택'
            : mode === 'saveas'
              ? '다른 이름으로 저장'
              : '새 악보 프로젝트'
        }
        onCancel={(e) => {
          e.preventDefault();
          if (!busy) setMode(null);
        }}
        onClick={(e) => {
          if (e.target === e.currentTarget && !busy) setMode(null);
        }}
      >
        <section>
          <header>
            <h2>
              {mode === 'select'
                ? '프로젝트 선택'
                : mode === 'saveas'
                  ? '다른 이름으로 저장'
                  : '새 프로젝트'}
            </h2>
            {mode === 'select' && (
              <button
                aria-label="악보 프로젝트 목록 새로고침"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    await refresh();
                  })
                }
              >
                ↻
              </button>
            )}
            <button disabled={busy} onClick={() => setMode(null)}>
              닫기
            </button>
          </header>
          {mode === 'select' ? (
            <div className="score-project-list">
              {projects.length ? (
                projects.map((project) => (
                  <div key={project.id}>
                    <button disabled={locked} onClick={() => void request(() => choose(project))}>
                      {project.name}
                    </button>
                    <button
                      aria-label={`${project.name} 프로젝트 삭제`}
                      disabled={locked}
                      onClick={() => setDeleting(project)}
                    >
                      ×
                    </button>
                  </div>
                ))
              ) : (
                <p>등록된 프로젝트가 없어요.</p>
              )}
            </div>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (duplicate || !draft.trim() || locked) return;
                const snapshot = mode === 'saveas' ? editor.current?.snapshot() : undefined;
                void request(async () => {
                  const data = snapshot ?? {
                    title: props.title,
                    bpm: 120,
                    notes: [],
                    parts: ['Guitar', 'Vocal', 'Bass', 'Drums'],
                    sync: {},
                  };
                  const created = await createScoreProject(
                    workspaceId,
                    props.songId,
                    draft.trim(),
                    data,
                  );
                  await refresh();
                  await choose(created);
                });
              }}
            >
              <label>
                프로젝트 이름
                <input
                  autoFocus
                  aria-label="새 악보 프로젝트 이름"
                  maxLength={160}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                />
              </label>
              {duplicate && <p role="alert">같은 이름 프로젝트가 존재합니다.</p>}
              <footer>
                <button type="button" disabled={busy} onClick={() => setMode(null)}>
                  취소
                </button>
                <button disabled={locked || duplicate || !draft.trim()}>
                  {mode === 'saveas' ? '저장' : '생성'}
                </button>
              </footer>
            </form>
          )}
          {error && <p role="alert">{error}</p>}
        </section>
      </dialog>
      <dialog
        ref={deleteDialog}
        className="score-project-dialog"
        aria-label="악보 프로젝트 삭제 확인"
        onCancel={(event) => {
          event.preventDefault();
          if (!busy) setDeleting(null);
        }}
      >
        <section>
          <h2>프로젝트를 삭제할까요?</h2>
          <p>「{deleting?.name}」 프로젝트를 삭제합니다.</p>
          {error && <p role="alert">{error}</p>}
          <footer>
            <button disabled={busy} onClick={() => setDeleting(null)}>
              취소
            </button>
            <button
              className="score-project-delete"
              disabled={busy}
              onClick={() => {
                if (deleting) void request(() => removeProject(deleting));
              }}
            >
              삭제
            </button>
          </footer>
        </section>
      </dialog>
      <dialog
        ref={confirm}
        className="score-project-dialog"
        aria-label="악보 변경사항 저장 확인"
        onCancel={(e) => {
          e.preventDefault();
          if (!busy) setPending(null);
        }}
      >
        <section>
          <h2>기존 작업을 저장하시겠습니까?</h2>
          <p>저장하지 않은 변경사항이 있어요.</p>
          {error && <p role="alert">{error}</p>}
          <footer>
            <button disabled={busy} onClick={() => setPending(null)}>
              취소
            </button>
            <button
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  const action = pending;
                  setPending(null);
                  await action?.();
                })
              }
            >
              저장하지 않고 진행
            </button>
            <button
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  if (await editor.current?.save()) {
                    const action = pending;
                    setPending(null);
                    await action?.();
                  }
                })
              }
            >
              저장 후 진행
            </button>
          </footer>
        </section>
      </dialog>
    </ScoreProjectShell>
  );
}

function ScoreProjectShell({
  embedded,
  children,
  ...props
}: PropsWithChildren<React.ComponentProps<typeof AppShell> & { embedded?: boolean }>) {
  return embedded ? <>{children}</> : <AppShell {...props}>{children}</AppShell>;
}
