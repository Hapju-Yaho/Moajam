import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Platform, View } from 'react-native';
import { Input } from '../styles/layout';
import { ActionButton, Copy, FlexRow, Meta, Surface } from './ProductUI';
import { ScheduleDialog } from './ScheduleDialog';
import { useIdentity } from '../state/Identity';
import { listBandProjects, manageBandProject, type BandDawProject } from '../lib/bandDawProjects';

export function BandDawProjects({
  workspaceId,
  songId,
  title,
  requestedId,
  renderStudio,
}: {
  workspaceId: string;
  songId: string;
  title: string;
  requestedId?: string;
  renderStudio: (
    project: BandDawProject,
    generation: number,
    navigation: {
      focusTime?: number;
      onSeekProject: (time: number, projectId?: string) => void;
      registerGuard: (guard: (action: () => void) => void) => void;
    },
  ) => ReactNode;
}) {
  const user = useIdentity();
  const nativeGuard = useRef<((action: () => void) => void) | undefined>(undefined);
  const registerGuard = useCallback((guard: (action: () => void) => void) => {
    nativeGuard.current = guard;
  }, []);
  const [projects, setProjects] = useState<BandDawProject[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [generation, setGeneration] = useState(0);
  const [seekTarget, setSeekTarget] = useState<{ id: string; time: number }>();
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<'create' | 'rename' | 'duplicate' | 'delete' | 'select' | null>(
    null,
  );
  const [name, setName] = useState('');
  const selected = projects.find((item) => item.id === selectedId);
  const storageKey = `moajam-daw-selected/${user}/${workspaceId}/${songId}`;
  useEffect(() => {
    let active = true;
    setError('');
    void listBandProjects(workspaceId, songId, title, user)
      .then((rows) => {
        if (!active) return;
        setProjects(rows);
        let remembered = '';
        try {
          if (Platform.OS === 'web') remembered = localStorage.getItem(storageKey) ?? '';
        } catch {
          /* storage is optional */
        }
        setSelectedId((current) => {
          const id = requestedId ?? (current || remembered);
          if (requestedId && !rows.some((row) => row.id === requestedId)) return '';
          return rows.some((row) => row.id === id) ? id : (rows[0]?.id ?? '');
        });
        if (requestedId && !rows.some((row) => row.id === requestedId))
          setError('연결된 프로젝트가 삭제되었거나 접근할 수 없어요.');
        setLoaded(true);
      })
      .catch((failure) => {
        if (active) {
          setLoaded(true);
          setError(failure instanceof Error ? failure.message : '프로젝트를 불러오지 못했어요.');
        }
      });
    return () => {
      active = false;
    };
  }, [workspaceId, songId, title, user, storageKey, attempt, requestedId]);
  useEffect(() => {
    if (selectedId && Platform.OS === 'web') {
      try {
        localStorage.setItem(storageKey, selectedId);
      } catch {
        /* storage is optional */
      }
    }
  }, [selectedId, storageKey]);
  const guarded = (action: () => void) => {
    if (Platform.OS !== 'web') {
      if (nativeGuard.current) nativeGuard.current(action);
      else action();
      return;
    }
    const event = new CustomEvent('moajam:before-navigate', { cancelable: true, detail: action });
    if (window.dispatchEvent(event)) action();
  };
  const run = async () => {
    if (!mode || mode === 'select' || busy) return;
    setBusy(true);
    setError('');
    try {
      const result = await manageBandProject(
        mode,
        workspaceId,
        songId,
        user,
        selected,
        name.trim(),
      );
      // Commit local selection before a fresh list request so a completed operation is never repeated on retry.
      setProjects((rows) =>
        mode === 'delete'
          ? rows.filter((row) => row.id !== selected?.id)
          : mode === 'rename'
            ? rows.map((row) => (row.id === result!.id ? result! : row))
            : [...rows, result!],
      );
      if (mode === 'delete')
        setSelectedId(projects.find((row) => row.id !== selected?.id)?.id ?? '');
      else if (result) setSelectedId(result.id);
      setGeneration((value) => value + 1);
      setMode(null);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : '프로젝트 작업에 실패했어요.');
    } finally {
      setBusy(false);
    }
  };
  const open = (next: 'create' | 'rename' | 'duplicate' | 'delete') =>
    guarded(() => {
      setName(next === 'create' ? `${title} 새 프로젝트`.slice(0, 160) : (selected?.name ?? ''));
      setError('');
      setMode(next);
    });
  return (
    <>
      <Surface>
        <FlexRow wrap style={{ justifyContent: 'space-between' }}>
          <View style={{ flex: 1, minWidth: 150, gap: 4 }}>
            <Copy>프로젝트 · {selected?.name ?? '프로젝트 선택'}</Copy>
            <Meta>곡마다 여러 작업을 따로 저장하고 밴드 멤버와 공유해요.</Meta>
          </View>
          <FlexRow wrap>
            <ActionButton
              secondary
              compact
              disabled={!loaded || busy}
              onPress={() => setMode('select')}
            >
              프로젝트 선택
            </ActionButton>
            <ActionButton compact disabled={!loaded || busy} onPress={() => open('create')}>
              새 프로젝트
            </ActionButton>
            <ActionButton
              secondary
              compact
              disabled={!selected || busy}
              onPress={() => open('rename')}
            >
              이름 변경
            </ActionButton>
            <ActionButton
              secondary
              compact
              disabled={!selected || busy}
              onPress={() => open('duplicate')}
            >
              복제
            </ActionButton>
            <ActionButton
              secondary
              compact
              danger
              disabled={!selected || busy}
              onPress={() => open('delete')}
            >
              삭제
            </ActionButton>
          </FlexRow>
        </FlexRow>
        {!loaded && <Meta>프로젝트를 불러오는 중…</Meta>}
        {!!error && !mode && (
          <>
            <Meta accessibilityRole="alert">{error}</Meta>
            <ActionButton
              secondary
              compact
              onPress={() =>
                guarded(() => {
                  setAttempt((value) => value + 1);
                  setGeneration((value) => value + 1);
                })
              }
            >
              다시 불러오기
            </ActionButton>
          </>
        )}
        {loaded && !selected && !error && <Meta>새 프로젝트를 만들어 작업을 시작하세요.</Meta>}
      </Surface>
      {selected &&
        renderStudio(selected, generation, {
          registerGuard,
          focusTime: seekTarget?.id === selected.id ? seekTarget.time : undefined,
          onSeekProject: (time, id) => {
            const target = id
              ? projects.find((project) => project.id === id)
              : projects.find((project) => project.legacyKey);
            if (!target) {
              setError('이 의견에 연결된 프로젝트가 삭제되었어요.');
              return;
            }
            guarded(() => {
              setSelectedId(target.id);
              setSeekTarget({ id: target.id, time });
            });
          },
        })}
      <ScheduleDialog
        visible={!!mode}
        label="작업실 프로젝트 관리"
        onClose={() => {
          if (!busy) setMode(null);
        }}
      >
        {mode && (
          <View
            style={{
              flex: 1,
              width: '100%',
              justifyContent: 'center',
              alignItems: 'center',
              backgroundColor: '#0f172a80',
              padding: 20,
            }}
          >
            <Surface style={{ width: '100%', maxWidth: 520, maxHeight: '85%', overflow: 'scroll' }}>
              <Copy>
                {mode === 'select'
                  ? '프로젝트 선택'
                  : mode === 'create'
                    ? '새 프로젝트'
                    : mode === 'rename'
                      ? '프로젝트 이름 변경'
                      : mode === 'duplicate'
                        ? '프로젝트를 복제할까요?'
                        : '프로젝트를 삭제할까요?'}
              </Copy>
              {mode === 'select' && (
                <ActionButton
                  secondary
                  compact
                  onPress={() => {
                    setMode(null);
                    guarded(() => {
                      setAttempt((value) => value + 1);
                      setMode('select');
                    });
                  }}
                >
                  목록 새로고침
                </ActionButton>
              )}
              {mode === 'select' ? (
                projects.map((project) => (
                  <ActionButton
                    key={project.id}
                    secondary={project.id !== selectedId}
                    onPress={() => {
                      if (project.id === selectedId) {
                        setMode(null);
                        return;
                      }
                      setMode(null);
                      guarded(() => setSelectedId(project.id));
                    }}
                  >
                    {project.name}
                  </ActionButton>
                ))
              ) : mode === 'create' || mode === 'rename' ? (
                <Input
                  accessibilityLabel="프로젝트 이름"
                  value={name}
                  onChangeText={setName}
                  maxLength={160}
                  placeholder="프로젝트 이름"
                />
              ) : (
                <Meta>
                  {mode === 'delete'
                    ? '선택한 프로젝트가 목록에서 삭제됩니다. 다른 프로젝트와 공유하는 음원 파일은 유지됩니다.'
                    : '마지막으로 공유한 트랙·클립을 복제합니다. 원본 음원 파일은 함께 참조합니다.'}
                </Meta>
              )}
              {!!error && <Meta accessibilityRole="alert">{error}</Meta>}
              <FlexRow style={{ justifyContent: 'flex-end' }}>
                <ActionButton secondary disabled={busy} onPress={() => setMode(null)}>
                  {mode === 'select' ? '닫기' : '취소'}
                </ActionButton>
                {mode !== 'select' && (
                  <ActionButton
                    danger={mode === 'delete'}
                    disabled={busy || ((mode === 'create' || mode === 'rename') && !name.trim())}
                    onPress={() => void run()}
                  >
                    {busy
                      ? '처리 중…'
                      : mode === 'delete'
                        ? '삭제'
                        : mode === 'duplicate'
                          ? '복제'
                          : '저장'}
                  </ActionButton>
                )}
              </FlexRow>
            </Surface>
          </View>
        )}
      </ScheduleDialog>
    </>
  );
}
