import { useCallback, useEffect, useRef, useState } from 'react';
import { AppShell } from '../components/AppShell';
import { ActionButton, FlexBetween, Meta, PageHeading, Surface } from '../components/ProductUI';
import { ClipLibrary } from '../components/ClipLibrary.web';
import { AppIcon } from '../components/icons';
import './WorkManagementScreen.web.css';
import { createScoreProject, listScoreProjects, type ScoreProject } from '../lib/scoreProjects.web';
import { listPersonalDawProjects, managePersonalDawProject } from '../lib/personalDawProjects.web';
import { useIdentity } from '../state/Identity';
import type { ScreenProps } from '../navigation';

export function WorkManagementScreen({ navigate }: ScreenProps) {
  const user = useIdentity();
  const [scores, setScores] = useState<ScoreProject[]>([]);
  const [recordings, setRecordings] = useState<ScoreProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [version, setVersion] = useState(0);
  const refresh = useCallback(() => setVersion((value) => value + 1), []);
  const [creating, setCreating] = useState<'score-editor' | 'track-editor' | null>(null);
  const [draft, setDraft] = useState('');
  const [createError, setCreateError] = useState('');
  const [saving, setSaving] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const currentUser = useRef(user);
  currentUser.current = user;
  useEffect(() => {
    if (creating) dialog.current?.showModal();
    else dialog.current?.close();
  }, [creating]);
  useEffect(() => {
    setCreating(null);
    setDraft('');
    setCreateError('');
  }, [user]);
  const duplicate = (creating === 'score-editor' ? scores : recordings).some((project) =>
    creating === 'score-editor'
      ? project.name.toLowerCase() === draft.trim().toLowerCase()
      : project.name === draft.trim(),
  );
  useEffect(() => {
    let active = true;
    setLoading(true);
    setScores([]);
    setRecordings([]);
    setError('');
    void Promise.allSettled([
      listScoreProjects(`local-recording/score/${user}`, 'personal', '나의 악보'),
      listPersonalDawProjects(user),
    ]).then(([scoreResult, recordingResult]) => {
      if (!active) return;
      if (scoreResult.status === 'fulfilled') setScores(scoreResult.value);
      if (recordingResult.status === 'fulfilled') setRecordings(recordingResult.value);
      const failed = [scoreResult, recordingResult].find((result) => result.status === 'rejected');
      if (failed?.status === 'rejected')
        setError(
          failed.reason instanceof Error ? failed.reason.message : '프로젝트를 불러오지 못했어요.',
        );
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [user, version]);
  const sections = [
    {
      title: '내 악보 프로젝트',
      rows: scores,
      route: 'score-editor' as const,
      empty: '저장된 악보 프로젝트가 없어요.',
    },
    {
      title: '내 녹음 프로젝트',
      rows: recordings,
      route: 'track-editor' as const,
      empty: '저장된 녹음 프로젝트가 없어요.',
    },
  ];
  return (
    <AppShell activeRoute="work-management" onNavigate={navigate}>
      <FlexBetween>
        <PageHeading>작업실</PageHeading>
        <ActionButton secondary compact onPress={refresh} disabled={loading}>
          새로고침
        </ActionButton>
      </FlexBetween>
      <Meta>이 기기에 저장한 개인 프로젝트와 클립을 관리해요.</Meta>
      {error && <p role="alert">{error}</p>}
      {sections.map((section) => (
        <Surface key={section.route}>
          <FlexBetween>
            <h2 className="work-project-section-title">{section.title}</h2>
            <div className="work-project-section-actions">
              <Meta>{section.rows.length}개</Meta>
              <ActionButton
                secondary
                compact
                disabled={loading || saving}
                onPress={() => {
                  setDraft('');
                  setCreateError('');
                  setCreating(section.route);
                }}
              >
                ＋ 프로젝트 추가
              </ActionButton>
            </div>
          </FlexBetween>
          {loading ? (
            <Meta>프로젝트를 불러오는 중…</Meta>
          ) : section.rows.length ? (
            <div className="work-project-list">
              {section.rows.map((project) => (
                <div key={project.id} className="work-project-card">
                  <FlexBetween>
                    <div className="work-project-summary">
                      <span className="work-project-icon" data-kind={section.route}>
                        <AppIcon
                          name={section.route === 'score-editor' ? 'rehearsal' : 'microphone'}
                          size={24}
                        />
                      </span>
                      <div className="work-project-label">
                        <strong className="work-project-name">{project.name}</strong>
                        <span className="work-project-kind">
                          {section.route === 'score-editor' ? '악보 프로젝트' : '녹음 프로젝트'}
                        </span>
                      </div>
                    </div>
                    <ActionButton
                      secondary
                      compact
                      onPress={() => navigate(section.route, { projectId: project.id })}
                    >
                      열기
                    </ActionButton>
                  </FlexBetween>
                </div>
              ))}
            </div>
          ) : (
            <Meta>{section.empty}</Meta>
          )}
        </Surface>
      ))}
      <Surface>
        <h2 className="work-project-section-title">보관중인 클립</h2>
        <ClipLibrary key={user} version={version} expanded />
      </Surface>
      <dialog
        ref={dialog}
        className="work-project-create"
        aria-label="개인 프로젝트 추가"
        onCancel={(event) => {
          event.preventDefault();
          if (!saving) setCreating(null);
        }}
        onClick={(event) => {
          if (event.target === event.currentTarget && !saving) setCreating(null);
        }}
      >
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            if (!creating || saving || duplicate || !draft.trim() || draft.trim().length > 160)
              return;
            const owner = user,
              route = creating,
              name = draft.trim();
            setSaving(true);
            setCreateError('');
            try {
              const project =
                route === 'score-editor'
                  ? await createScoreProject(`local-recording/score/${owner}`, 'personal', name, {
                      title: '나의 악보',
                      bpm: 120,
                      notes: [],
                      parts: ['Guitar', 'Vocal', 'Bass', 'Drums'],
                      sync: {},
                    })
                  : await managePersonalDawProject('create', owner, undefined, name);
              if (currentUser.current !== owner) return;
              if (!project) throw new Error('프로젝트를 생성하지 못했어요.');
              setCreating(null);
              refresh();
              navigate(route, { projectId: project.id });
            } catch (error) {
              if (currentUser.current === owner)
                setCreateError(
                  error instanceof Error ? error.message : '프로젝트를 생성하지 못했어요.',
                );
            } finally {
              setSaving(false);
            }
          }}
        >
          <h2>{creating === 'score-editor' ? '악보' : '녹음'} 프로젝트 추가</h2>
          <label>
            프로젝트 이름
            <input
              autoFocus
              value={draft}
              maxLength={160}
              disabled={saving}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="프로젝트 이름을 입력해주세요"
            />
          </label>
          {duplicate && <p role="alert">같은 이름 프로젝트가 존재합니다.</p>}
          {createError && <p role="alert">{createError}</p>}
          <footer>
            <button type="button" disabled={saving} onClick={() => setCreating(null)}>
              취소
            </button>
            <button type="submit" disabled={saving || duplicate || !draft.trim()}>
              {saving ? '생성 중…' : '생성'}
            </button>
          </footer>
        </form>
      </dialog>
    </AppShell>
  );
}
