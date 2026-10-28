import { useCallback, useEffect, useRef, useState, type ComponentProps } from 'react';
import type { BandDawProjects as NativeProjects } from './BandDawProjects';
import { useIdentity } from '../state/Identity';
import { serverConfigured } from '../lib/remote';
import { listBandProjects, manageBandProject, type BandDawProject } from '../lib/bandDawProjects';
import {
  DawProjectToolbar,
  DawProjectPanel,
  ProjectRefreshIcon,
  ProjectPencilIcon,
} from './DawProjectControls.web';
import { useMockAppState } from '../state/MockAppState';
import { PracticeSectionTitle } from './PracticeSectionHeading.web';
import { DawProjectContext, type ProjectBridge } from '../lib/dawProjectContext';
import { ClipLibrary } from './ClipLibrary.web';
import { ScheduleDialog } from './ScheduleDialog';
import { listPersonalDawProjects, managePersonalDawProject } from '../lib/personalDawProjects.web';

export function BandDawProjects({
  workspaceId,
  songId,
  title,
  requestedId,
  renderStudio,
  localOnly = false,
}: ComponentProps<typeof NativeProjects> & { localOnly?: boolean }) {
  const user = useIdentity();
  const { workspace } = useMockAppState();
  const fetchProjects = useCallback(
    () =>
      localOnly
        ? listPersonalDawProjects(user)
        : listBandProjects(workspaceId, songId, title, user),
    [localOnly, user, workspaceId, songId, title],
  );
  const manageProject = useCallback(
    (action: 'create' | 'rename' | 'delete', project?: BandDawProject, name?: string) =>
      localOnly
        ? managePersonalDawProject(action, user, project, name)
        : manageBandProject(action, workspaceId, songId, user, project, name),
    [localOnly, user, workspaceId, songId],
  );
  const [projects, setProjects] = useState<BandDawProject[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [generation, setGeneration] = useState(0);
  const [mode, setMode] = useState<'create' | 'select' | 'saveAs' | 'confirm' | 'delete' | null>(
    null,
  );
  const [deleting, setDeleting] = useState<BandDawProject>();
  const [name, setName] = useState('');
  const [draft, setDraft] = useState('');
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [studioBusy, setStudioBusy] = useState(false);
  const [studioDirty, setStudioDirty] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [libraryVersion, setLibraryVersion] = useState(0);
  const working = busy || studioBusy;
  const [seekTarget, setSeekTarget] = useState<{ id: string; time: number }>();
  const bridge = useRef<ProjectBridge | null>(null);
  const selected = projects.find((row) => row.id === selectedId);
  const storageKey = localOnly
    ? `moajam-daw-selected/${user}/personal-recording`
    : `moajam-daw-selected/${user}/${workspaceId}/${songId}`;
  const alive = useRef(true);
  const overlay = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!mode || busy) return;
    const dismiss = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !overlay.current
          ?.querySelector(mode === 'delete' ? '.daw-project-delete-dialog' : '.daw-project-dialog')
          ?.contains(event.target)
      )
        setMode(mode === 'delete' ? 'select' : null);
    };
    document.addEventListener('pointerdown', dismiss, true);
    return () => document.removeEventListener('pointerdown', dismiss, true);
  }, [mode, busy]);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    if (!mode) return;
    const previous = document.activeElement as HTMLElement | null;
    const frame = requestAnimationFrame(() =>
      overlay.current
        ?.querySelector<HTMLElement>(
          mode === 'delete'
            ? '.daw-project-delete-dialog button:not(:disabled)'
            : 'input, button:not(:disabled)',
        )
        ?.focus({ preventScroll: true }),
    );
    return () => {
      cancelAnimationFrame(frame);
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, [mode]);
  const load = async () => {
    const rows = await fetchProjects();
    if (alive.current) {
      const current = rows.find((row) => row.id === selectedId);
      if (selected && !current) {
        // Keep the mounted editor and unsaved media available for Save As.
        setProjects([...rows, selected]);
        setError(
          `현재 프로젝트가 ${localOnly ? '이 기기' : '서버'}에서 삭제되었어요. 다른 이름으로 저장하여 작업을 보관해주세요.`,
        );
      } else {
        setProjects(rows);
        if (current && draft.trim() === selected?.name) setDraft(current.name);
      }
    }
    return rows;
  };
  useEffect(() => {
    let active = true;
    void fetchProjects()
      .then((rows) => {
        if (!active) return;
        setProjects(rows);
        let remembered = '';
        try {
          remembered = localStorage.getItem(storageKey) ?? '';
        } catch {
          /* optional */
        }
        const id = requestedId ?? remembered;
        const next = rows.find((row) => row.id === id) ?? (requestedId ? undefined : rows[0]);
        setSelectedId(next?.id ?? '');
        setDraft(next?.name ?? '');
        if (requestedId && !next) setError('연결된 프로젝트를 찾을 수 없어요.');
        setLoaded(true);
      })
      .catch((failure) => {
        if (active) {
          setError(String(failure));
          setLoaded(true);
        }
      });
    return () => {
      active = false;
    };
  }, [fetchProjects, requestedId, storageKey]);
  const choose = (project: BandDawProject) => {
    setStudioDirty(false);
    bridge.current = null;
    setSelectedId(project.id);
    setDraft(project.name);
    setEditing(false);
    setGeneration((value) => value + 1);
    setMode(null);
    setError('');
    try {
      localStorage.setItem(storageKey, project.id);
    } catch {
      /* optional */
    }
  };
  const guarded = (action: () => void) => {
    const event = new CustomEvent('moajam:before-navigate', { cancelable: true, detail: action });
    if (window.dispatchEvent(event)) action();
  };
  const nameDirty = !!selected && draft.trim() !== selected.name;
  const dirty = nameDirty || studioDirty;
  const duplicateName =
    !!name.trim() && projects.some((project) => project.name.trim() === name.trim());
  const onSaved = async () => {
    if ((localOnly || !serverConfigured) && selected && nameDirty)
      await manageProject('rename', selected, draft.trim());
    if (alive.current) {
      setEditing(false);
      setProjects((rows) =>
        rows.map((row) => (row.id === selectedId ? { ...row, name: draft.trim() } : row)),
      );
    }
  };
  const save = async () => {
    if (!bridge.current || !draft.trim() || busy || !dirty) return false;
    setBusy(true);
    try {
      return await bridge.current.save(draft.trim());
    } finally {
      if (alive.current) setBusy(false);
    }
  };
  const perform = async (saveExisting = false) => {
    if (busy || !name.trim() || duplicateName) return;
    setBusy(true);
    setError('');
    try {
      const session = bridge.current;
      if (saveExisting && !(await session?.save(draft.trim()))) {
        setError('기존 프로젝트를 저장하지 못했어요. 오류를 확인한 후 다시 시도해주세요.');
        return;
      }
      const project =
        mode === 'create'
          ? await manageProject('create', undefined, name.trim())
          : await session?.copy(name.trim());
      if (!project) throw Error('프로젝트를 만들지 못했어요.');
      setProjects((rows) => [...rows, project]);
      choose(project);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : '저장하지 못했어요.');
    } finally {
      if (alive.current) setBusy(false);
    }
  };
  const open = (next: 'create' | 'saveAs') => {
    setError('');
    setName(next === 'create' ? title.slice(0, 160) : `${draft} 복사본`.slice(0, 160));
    setMode(next);
  };
  const submit = () => {
    if (duplicateName || busy || !name.trim()) return;
    if (mode === 'saveAs' && (bridge.current?.dirty || nameDirty)) setMode('confirm');
    else if (mode === 'create') guarded(() => void perform());
    else void perform();
  };
  const toolbar = (
    <div className="daw-project-toolbar">
      <div className="daw-project-identity">
        <small className="daw-project-meta">
          {localOnly ? '개인 녹음 · 이 기기에 저장' : `${workspace?.name ?? ''} · ${title}`}
        </small>
        <div className="daw-project-title">
          {selected ? (
            editing ? (
              <input
                autoFocus
                aria-label="현재 프로젝트 이름"
                value={draft}
                maxLength={160}
                disabled={working}
                onChange={(event) => setDraft(event.target.value)}
                onBlur={() => {
                  if (!draft.trim()) setDraft(selected.name);
                  setEditing(false);
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') event.currentTarget.blur();
                  if (event.key === 'Escape') {
                    setDraft(selected.name);
                    setEditing(false);
                  }
                }}
              />
            ) : (
              <span className="daw-project-name">
                {draft || selected.name}
                {dirty ? ' *' : ''}
              </span>
            )
          ) : (
            <span className="daw-project-name">녹음 프로젝트</span>
          )}
          {editing && dirty && <span aria-label="저장하지 않은 변경사항">*</span>}
          {selected && !editing && (
            <button
              className="project-name-pencil"
              aria-label="녹음 프로젝트 이름 수정"
              title="이름 수정"
              disabled={working}
              onClick={() => setEditing(true)}
            >
              <ProjectPencilIcon />
            </button>
          )}
        </div>
      </div>
      <div className="daw-project-actions">
        <button disabled={!loaded || working} onClick={() => open('create')}>
          새 프로젝트
        </button>
        <button
          disabled={!loaded || working}
          onClick={() => {
            setError('');
            setMode('select');
          }}
        >
          프로젝트 선택
        </button>
        <button disabled={!selected || working} onClick={() => open('saveAs')}>
          다른 이름으로 저장
        </button>
        <button
          className="daw-project-save"
          disabled={!selected || working || !draft.trim() || !dirty}
          onClick={() => void save()}
        >
          {localOnly ? '이 기기에 저장' : '서버에 저장'}
        </button>
        <button
          aria-label="새로고침"
          title="새로고침"
          disabled={!loaded || working}
          onClick={() => {
            setBusy(true);
            void (async () => {
              await bridge.current?.refresh();
              await load();
            })()
              .catch((failure) => setError(String(failure)))
              .finally(() => setBusy(false));
          }}
        >
          <ProjectRefreshIcon />
        </button>
      </div>
    </div>
  );
  const isSelection = mode === 'select' || mode === 'delete';
  const panel = mode && (
    <div
      ref={overlay}
      className="daw-project-overlay"
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === 'Escape' && !busy) setMode(mode === 'delete' ? 'select' : null);
        if (event.key === 'Tab') {
          const elements = [
            ...(mode === 'delete'
              ? event.currentTarget.querySelector('.daw-project-delete-dialog')!
              : event.currentTarget
            ).querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled)'),
          ];
          const first = elements[0],
            last = elements[elements.length - 1];
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last?.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first?.focus();
          }
        }
      }}
    >
      <section
        className={`daw-project-dialog${isSelection ? ' daw-project-select-dialog' : ''}`}
        inert={mode === 'delete'}
        aria-hidden={mode === 'delete'}
        role="dialog"
        aria-modal={mode !== 'delete'}
        aria-label={
          isSelection ? '프로젝트 선택' : mode === 'create' ? '새 프로젝트' : '다른 이름으로 저장'
        }
      >
        <header>
          <h3>
            {isSelection
              ? '프로젝트 선택'
              : mode === 'create'
                ? '새 프로젝트'
                : mode === 'confirm'
                  ? '기존 작업을 저장하시겠습니까?'
                  : '다른 이름으로 저장'}
          </h3>
          {isSelection && (
            <button
              aria-label="프로젝트 목록 새로고침"
              title="목록 새로고침"
              disabled={busy}
              onClick={() => {
                setBusy(true);
                void load()
                  .catch((failure) => setError(String(failure)))
                  .finally(() => setBusy(false));
              }}
            >
              <ProjectRefreshIcon />
            </button>
          )}
        </header>
        {isSelection ? (
          <div className="daw-project-list">
            {projects.length ? (
              projects.map((project) => (
                <div
                  className={`daw-project-row ${project.id === selectedId ? 'active' : ''}`}
                  key={project.id}
                >
                  <button
                    key={project.id}
                    className={project.id === selectedId ? 'active' : ''}
                    onClick={() => {
                      if (project.id === selectedId) setMode(null);
                      else {
                        setMode(null);
                        guarded(() => choose(project));
                      }
                    }}
                  >
                    {project.name}
                  </button>
                  <button
                    className="daw-project-delete"
                    aria-label={`${project.name} 삭제`}
                    title="프로젝트 삭제"
                    disabled={working}
                    onClick={() => {
                      setDeleting(project);
                      setError('');
                      setMode('delete');
                    }}
                  >
                    ×
                  </button>
                </div>
              ))
            ) : (
              <p>등록된 프로젝트가 없어요.</p>
            )}
          </div>
        ) : mode === 'confirm' ? (
          <p>현재 내용을 새 프로젝트로 복사합니다. 기존 프로젝트에도 변경사항을 저장할까요?</p>
        ) : (
          <label>
            프로젝트 이름
            <input
              autoFocus
              aria-label="프로젝트 이름"
              maxLength={160}
              value={name}
              disabled={busy}
              aria-invalid={duplicateName}
              aria-describedby={duplicateName ? 'daw-project-name-error' : undefined}
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && name.trim()) {
                  event.preventDefault();
                  submit();
                }
              }}
            />
            {duplicateName && (
              <span id="daw-project-name-error" className="daw-project-name-error">
                같은 이름 프로젝트가 존재합니다.
              </span>
            )}
          </label>
        )}
        {!!error && mode !== 'delete' && <p role="alert">{error}</p>}
        <footer>
          <button disabled={busy} onClick={() => setMode(mode === 'delete' ? 'select' : null)}>
            {isSelection ? '닫기' : '취소'}
          </button>
          {mode === 'confirm' ? (
            <>
              <button disabled={busy || duplicateName} onClick={() => void perform(false)}>
                저장하지 않고 계속
              </button>
              <button
                disabled={busy || duplicateName || !draft.trim()}
                onClick={() => void perform(true)}
              >
                저장 후 계속
              </button>
            </>
          ) : (
            !isSelection && (
              <button disabled={busy || duplicateName || !name.trim()} onClick={submit}>
                {busy ? '저장 중…' : mode === 'create' ? '생성' : '저장'}
              </button>
            )
          )}
        </footer>
      </section>
      {mode === 'delete' && (
        <div className="daw-project-delete-overlay">
          <section
            className="daw-project-dialog daw-project-delete-dialog"
            role="dialog"
            aria-modal="true"
            aria-label="프로젝트 삭제"
          >
            <header>
              <h3>프로젝트를 정말 삭제할까요?</h3>
            </header>
            <p>
              ‘{deleting?.name}’ 프로젝트를 삭제합니다.
              {deleting?.id === selectedId && dirty ? ' 저장하지 않은 변경사항도 사라집니다.' : ''}
            </p>
            {!!error && <p role="alert">{error}</p>}
            <footer>
              <button disabled={busy} onClick={() => setMode('select')}>
                취소
              </button>
              <button
                className="daw-project-confirm-delete"
                disabled={busy || !deleting}
                onClick={() => {
                  if (!deleting || busy) return;
                  setBusy(true);
                  void manageProject('delete', deleting)
                    .then(() => {
                      const remaining = projects.filter((project) => project.id !== deleting.id);
                      setProjects(remaining);
                      if (deleting.id === selectedId) {
                        if (remaining[0]) choose(remaining[0]);
                        else {
                          bridge.current = null;
                          setSelectedId('');
                          setDraft('');
                          setStudioDirty(false);
                          setStudioBusy(false);
                          try {
                            localStorage.removeItem(storageKey);
                          } catch {
                            /* optional */
                          }
                        }
                      }
                      setMode('select');
                      setDeleting(undefined);
                    })
                    .catch((failure) =>
                      setError(failure instanceof Error ? failure.message : '삭제하지 못했어요.'),
                    )
                    .finally(() => setBusy(false));
                }}
              >
                삭제
              </button>
            </footer>
          </section>
        </div>
      )}
    </div>
  );
  return (
    <DawProjectContext.Provider
      value={{
        name: draft.trim(),
        nameDirty,
        onSaved,
        onBusy: setStudioBusy,
        onDirty: setStudioDirty,
        bridge,
        toolbar,
        panel,
      }}
    >
      {!!error && !mode && <p role="alert">{error}</p>}
      {selected ? (
        renderStudio(selected, generation, {
          registerGuard: () => {},
          focusTime: seekTarget?.id === selected.id ? seekTarget.time : undefined,
          onSeekProject: (time, id) => {
            const target = id
              ? projects.find((row) => row.id === id)
              : projects.find((row) => row.legacyKey);
            if (!target) {
              setError('연결된 프로젝트를 찾을 수 없어요.');
              return;
            }
            guarded(() => {
              if (target.id !== selectedId) choose(target);
              setSeekTarget({ id: target.id, time });
            });
          },
        })
      ) : (
        <section className="track-studio">
          <header className="studio-heading">
            <div className="studio-heading-info">
              <PracticeSectionTitle title="녹음 프로젝트" />
            </div>
            <div className="studio-heading-actions">
              <button onClick={() => setLibraryOpen(true)}>클립 보관함</button>
            </div>
          </header>
          <div className="studio-console daw-project-empty">
            <DawProjectToolbar />
            <div className="daw-project-empty-message">
              {loaded ? '새 프로젝트를 생성해 주세요.' : '프로젝트를 불러오는 중…'}
            </div>
            <DawProjectPanel />
          </div>
          <ScheduleDialog
            visible={libraryOpen}
            label="클립 보관함"
            onClose={() => setLibraryOpen(false)}
          >
            <div className="studio-confirm-overlay" onClick={() => setLibraryOpen(false)}>
              <div
                className="studio-confirm-card"
                style={{
                  width: 'min(880px, 100%)',
                  maxWidth: 880,
                  maxHeight: '85vh',
                  overflowY: 'auto',
                }}
                onClick={(event) => event.stopPropagation()}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 12,
                  }}
                >
                  <h2>클립 보관함</h2>
                  <div
                    style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto' }}
                  >
                    <button
                      type="button"
                      className="clip-library-refresh-icon"
                      aria-label="클립 보관함 새로고침"
                      title="새로고침"
                      onClick={() => setLibraryVersion((value) => value + 1)}
                    >
                      <ProjectRefreshIcon />
                    </button>
                    <button
                      type="button"
                      className="clip-library-dialog-button"
                      onClick={() => setLibraryOpen(false)}
                    >
                      닫기
                    </button>
                  </div>
                </div>
                <ClipLibrary version={libraryVersion} expanded />
              </div>
            </div>
          </ScheduleDialog>
        </section>
      )}
    </DawProjectContext.Provider>
  );
}
