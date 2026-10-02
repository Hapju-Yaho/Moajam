import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  useRef,
  useCallback,
  type PropsWithChildren,
  type Dispatch,
  type SetStateAction,
} from 'react';
import { type RecommendationItem, members as initialMembers } from '../mocks/data';
import {
  createWorkspaces,
  type Workspace,
  type WorkspaceSong,
  type Rehearsal,
} from '../mocks/workspaces';

import {
  personalSongs,
  personalRehearsals,
  normalizeWorkspace,
  summarizeSong,
} from './workspaceModel';
import { useIdentity } from './Identity';
import { deleteWorkspaceMedia } from '../lib/mediaStore';
import {
  api,
  serverConfigured,
  loadRemoteWorkspaces,
  saveRemoteWorkspace,
  createRemoteWorkspace,
} from '../lib/remote';
import { usePreferences } from './preferences';
import { loadWorkspaceState, saveWorkspaceState } from './workspaceStorage';

export type MockMember = (typeof initialMembers)[number];
export type AdoptedSong = WorkspaceSong;
interface Store {
  workspaces: Workspace[];
  setWorkspaces: React.Dispatch<React.SetStateAction<Workspace[]>>;
  selectedWorkspaceId: string;
  selectWorkspace: (id: string) => void;
  storageError: boolean;
  actionError: string;
  setActionError: (message: string) => void;
  syncStatus: string;
  reloadRemote: () => Promise<void>;
  leaveWorkspace: (id: string, confirmDelete?: boolean) => Promise<void>;
}
const StoreContext = createContext<Store | null>(null);
const WorkspaceScope = createContext<string | undefined>(undefined);
export function WorkspaceScopeProvider({ id, children }: PropsWithChildren<{ id?: string }>) {
  return <WorkspaceScope.Provider value={id}>{children}</WorkspaceScope.Provider>;
}
export function MockAppStateProvider({ children }: PropsWithChildren) {
  const identity = useIdentity();
  const [saved] = useState(() => (serverConfigured ? null : loadWorkspaceState()));
  const [workspaces, setWorkspaces] = useState(() =>
    (saved?.workspaces ?? (serverConfigured ? [] : createWorkspaces())).map((band) =>
      normalizeWorkspace(band, identity),
    ),
  );
  const [selectedWorkspaceId, selectWorkspace] = useState(saved?.selectedWorkspaceId ?? 'ws-demo');
  const [storageError, setStorageError] = useState(false);
  const [actionError, setActionError] = useState('');
  const [syncStatus, setSyncStatus] = useState(
    serverConfigured ? '서버 데이터 불러오는 중…' : '브라우저에 보관',
  );
  const remoteReady = useRef(false);
  const failed = useRef(false);
  const acknowledged = useRef<Workspace[]>([]);
  const queue = useRef(Promise.resolve());
  const currentWorkspaces = useRef(workspaces);
  currentWorkspaces.current = workspaces;
  const refreshing = useRef(false);
  const reloadRemote = useCallback(
    async (background = false) => {
      if (refreshing.current) return;
      refreshing.current = true;
      try {
        await queue.current;
        if (
          background &&
          (failed.current ||
            JSON.stringify(currentWorkspaces.current) !== JSON.stringify(acknowledged.current))
        )
          return;
        const snapshot = currentWorkspaces.current;
        const remote = await loadRemoteWorkspaces(() => currentWorkspaces.current === snapshot);
        if (!remote) return;
        const bands = remote.map((band) => normalizeWorkspace(band, identity));
        acknowledged.current = bands;
        remoteReady.current = true;
        failed.current = false;
        setWorkspaces(bands);
        selectWorkspace((selected) =>
          bands.some((band) => band.id === selected) ? selected : (bands[0]?.id ?? ''),
        );
        setSyncStatus('서버 저장됨');
        setActionError('');
      } catch (error) {
        setActionError(error instanceof Error ? error.message : '서버에 연결하지 못했습니다.');
        setSyncStatus('서버 연결 실패');
        if (!background) throw error;
      } finally {
        refreshing.current = false;
      }
    },
    [identity],
  );
  useEffect(() => {
    if (!serverConfigured) return;
    void reloadRemote().catch(() => {});
    const timer = setInterval(() => void reloadRemote(true), 15000);
    return () => clearInterval(timer);
  }, [reloadRemote]);

  useEffect(() => {
    if (!serverConfigured) {
      setStorageError(!saveWorkspaceState({ version: 1, workspaces, selectedWorkspaceId }));
      return;
    }
    if (!remoteReady.current || failed.current) return;
    const snapshot = workspaces;
    queue.current = queue.current.then(async () => {
      if (failed.current) return;
      for (const band of snapshot) {
        const previous = acknowledged.current.find((item) => item.id === band.id);
        if (!previous || JSON.stringify(previous) === JSON.stringify(band)) continue;
        setSyncStatus('서버에 저장 중…');
        try {
          await saveRemoteWorkspace(previous, band, identity);
          acknowledged.current = acknowledged.current.map((item) =>
            item.id === band.id ? band : item,
          );
        } catch (error) {
          failed.current = true;
          setSyncStatus('서버 저장 실패');
          setActionError(
            (error instanceof Error ? error.message : '서버 저장 실패') +
              ' 현재 변경 내용은 화면에 남아 있습니다. 기록을 백업한 뒤 서버 기록을 새로 불러와주세요.',
          );
          return;
        }
      }
      setSyncStatus('서버 저장됨');
    });
  }, [workspaces, selectedWorkspaceId, identity]);
  const leaveWorkspace = useCallback(
    async (id: string, confirmDelete = false) => {
      const band = workspaces.find((item) => item.id === id);
      const member = band?.members.find((item) => item.id === identity);
      if (!band || !member) throw new Error('참여 중인 밴드를 찾을 수 없습니다.');
      if (
        band.members.length > 1 &&
        member.role === 'OWNER' &&
        band.members.filter((item) => item.role === 'OWNER').length <= 1
      ) {
        throw new Error('탈퇴하려면 다른 멤버를 먼저 관리자로 지정해주세요.');
      }
      if (band.members.length === 1 && !confirmDelete)
        throw new Error('마지막 멤버입니다. 밴드와 모든 데이터 삭제를 확인해주세요.');
      if (serverConfigured) {
        await queue.current;
        await api(
          `/workspaces/${id}/members/${identity}${confirmDelete ? '?confirmDelete=true' : ''}`,
          'DELETE',
        );
        acknowledged.current = acknowledged.current.filter((item) => item.id !== id);
      }
      await deleteWorkspaceMedia(id);
      setWorkspaces((all) => all.filter((item) => item.id !== id));
      selectWorkspace((selected) =>
        selected === id ? (workspaces.find((item) => item.id !== id)?.id ?? '') : selected,
      );
    },
    [identity, workspaces],
  );
  const value = useMemo(
    () => ({
      workspaces,
      setWorkspaces,
      selectedWorkspaceId,
      selectWorkspace,
      storageError,
      actionError,
      setActionError,
      syncStatus,
      reloadRemote,
      leaveWorkspace,
    }),
    [
      workspaces,
      selectedWorkspaceId,
      storageError,
      actionError,
      syncStatus,
      reloadRemote,
      leaveWorkspace,
    ],
  );
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useMockAppState() {
  const currentUserId = useIdentity();
  const preferences = usePreferences();
  const store = useContext(StoreContext);
  const scopeId = useContext(WorkspaceScope);
  const [selectedRecommendationId, selectRecommendation] = useState('creep');
  if (!store) throw new Error('useMockAppState must be used inside MockAppStateProvider.');
  const { workspaces, setWorkspaces, selectedWorkspaceId, selectWorkspace } = store;
  const workspaceId = scopeId ?? selectedWorkspaceId;
  const workspace = workspaces.find((item) => item.id === workspaceId);
  const update = (fn: (workspace: Workspace) => Workspace, id = workspaceId) =>
    setWorkspaces((all) => all.map((item) => (item.id === id ? fn(item) : item)));
  const recommendations = (workspace?.recommendations ?? []).map((song) => ({
    ...song,
    likedByMe: song.likedBy?.includes(currentUserId) ?? song.likedByMe,
    votedByMe: song.votedBy?.includes(currentUserId) ?? song.votedByMe,
    comments:
      (workspace?.documents?.[`recommendation/${song.id}/comments`] as unknown[] | undefined)
        ?.length ?? 0,
  }));
  const adoptedSongs = (workspace?.adoptedSongs ?? []).map((song) => ({
    ...summarizeSong(song, currentUserId),
    comments:
      (workspace?.documents?.[`song/${song.id}/discussion`] as unknown[] | undefined)?.length ?? 0,
  }));
  const members = (workspace?.members ?? []).map((member) =>
    member.id === currentUserId
      ? { ...member, name: preferences.name, initials: preferences.name.slice(-2) }
      : member,
  );
  const canManage = members.find((member) => member.id === currentUserId)?.role === 'OWNER';
  return {
    workspaces,
    workspace,
    workspaceId,
    selectedWorkspaceId,
    selectWorkspace,
    storageError: store.storageError,
    currentUserId,
    serverConfigured,
    syncStatus: store.syncStatus,
    reloadRemote: store.reloadRemote,
    leaveWorkspace: (confirmDelete = false) => store.leaveWorkspace(workspaceId, confirmDelete),
    actionError: store.actionError,
    clearActionError: () => store.setActionError(''),
    setDocument: <T,>(key: string, value: T | ((previous: T) => T), initial: T) =>
      update((band) => ({
        ...band,
        documents: {
          ...band.documents,
          [key]:
            typeof value === 'function'
              ? (value as (previous: T) => T)((band.documents?.[key] as T | undefined) ?? initial)
              : value,
        },
      })),
    deleteSong: (id: string) => {
      if (!canManage) return;
      update((band) => ({
        ...band,
        adoptedSongs: band.adoptedSongs.filter((song) => song.id !== id),
        rehearsals: band.rehearsals.map((event) => ({
          ...event,
          songIds: event.songIds?.filter((songId) => songId !== id),
        })),
      }));
    },
    updateSong: (id: string, changes: Partial<WorkspaceSong>) => {
      if (!canManage) return;
      update((band) => ({
        ...band,
        adoptedSongs: band.adoptedSongs.map((song) =>
          song.id === id
            ? summarizeSong({ ...song, ...changes, id: song.id }, currentUserId)
            : song,
        ),
      }));
    },
    toggleReaction: (id: string, kind: 'like' | 'vote') =>
      update((band) => ({
        ...band,
        recommendations: band.recommendations.map((song) => {
          if (song.id !== id) return song;
          const flag = kind === 'like' ? 'likedByMe' : 'votedByMe';
          const count = kind === 'like' ? 'likes' : 'votes';
          const people = kind === 'like' ? 'likedBy' : 'votedBy';
          const active = song[people]?.includes(currentUserId) ?? false;
          return {
            ...song,
            [people]: active
              ? (song[people] ?? []).filter((id) => id !== currentUserId)
              : [...(song[people] ?? []), currentUserId],
            [flag]: !active,
            [count]: Math.max(0, song[count] + (active ? -1 : 1)),
          };
        }),
      })),
    deferRecommendation: (id: string, reason: string) => {
      if (!canManage) return;
      update((band) => ({
        ...band,
        recommendations: band.recommendations.map((song) =>
          song.id === id
            ? { ...song, deferred: !song.deferred, deferredReason: reason.trim() }
            : song,
        ),
      }));
    },
    deleteRecommendation: (id: string) => {
      const song = recommendations.find((item) => item.id === id);
      if (!canManage && song?.authorId !== currentUserId) return;
      update((band) => ({
        ...band,
        recommendations: band.recommendations.filter((item) => item.id !== id),
      }));
    },
    recommendations,
    editRecommendation: (
      id: string,
      changes: Pick<RecommendationItem, 'title' | 'artist' | 'reason' | 'referenceUrl'>,
    ) => {
      const song = recommendations.find((item) => item.id === id);
      if (
        !song ||
        (!canManage && song.authorId !== currentUserId) ||
        !changes.title.trim() ||
        !changes.artist.trim()
      )
        return false;
      if (changes.referenceUrl && !/^https?:\/\//.test(changes.referenceUrl)) return false;
      if (
        changes.referenceUrl &&
        recommendations.some((item) => item.id !== id && item.referenceUrl === changes.referenceUrl)
      )
        return false;
      update((band) => ({
        ...band,
        recommendations: band.recommendations.map((item) =>
          item.id === id ? { ...item, ...changes } : item,
        ),
      }));
      return true;
    },
    adoptedSongs,
    members,
    canManage,
    rehearsals: workspace?.rehearsals ?? [],
    allSongs: personalSongs(workspaces, currentUserId),
    allRehearsals: personalRehearsals(workspaces),
    selectedRecommendationId,
    selectRecommendation,
    addRecommendation: (song: RecommendationItem) => {
      if (
        recommendations.some((item) => item.referenceUrl && item.referenceUrl === song.referenceUrl)
      ) {
        store.setActionError('이미 추천된 링크입니다. 기존 추천곡을 확인해주세요.');
        return false;
      }
      update((band) => ({
        ...band,
        recommendations: [{ ...song, authorId: currentUserId }, ...band.recommendations],
      }));
      return true;
    },
    adoptSong: (id: string) => {
      if (!canManage) return;
      update((band) => {
        const song = band.recommendations.find((item) => item.id === id);
        if (!song || band.adoptedSongs.some((item) => item.id === id)) return band;
        return {
          ...band,
          adoptedSongs: [
            ...band.adoptedSongs,
            {
              ...song,
              ready: 0,
              total: band.members.length,
              status: 'PRACTICING',
              myStatus: 'NOT_READY',
              myPart: band.members.find((member) => member.id === currentUserId)?.part ?? '',
              participants: Object.fromEntries(
                band.members.map((member) => [
                  member.id,
                  { part: member.part, status: 'NOT_READY' as const },
                ]),
              ),
            },
          ],
        };
      });
    },
    isAdopted: (id: string) => adoptedSongs.some((song) => song.id === id),
    saveRehearsal: (event: Rehearsal, bandId = workspaceId) => {
      const target = store.workspaces.find((band) => band.id === bandId);
      if (
        !target?.members.some((member) => member.id === currentUserId && member.role === 'OWNER')
      ) {
        store.setActionError('합주 일정은 Owner가 변경할 수 있습니다.');
        return;
      }
      update(
        (band) => ({
          ...band,
          rehearsals: [...band.rehearsals.filter((item) => item.id !== event.id), event],
        }),
        bandId,
      );
    },
    cancelRehearsal: (id: string) => {
      if (!canManage) return;
      update((band) => ({
        ...band,
        rehearsals: band.rehearsals.filter((event) => event.id !== id),
      }));
    },
    updateMember: (id: string, changes: Pick<MockMember, 'part' | 'role'>) => {
      if (!canManage) return;
      if (
        changes.role !== 'OWNER' &&
        members.find((member) => member.id === id)?.role === 'OWNER' &&
        members.filter((member) => member.role === 'OWNER').length === 1
      ) {
        store.setActionError(
          '마지막 Owner는 변경할 수 없습니다. 다른 멤버를 먼저 Owner로 지정해주세요.',
        );
        return false;
      }
      update((band) => ({
        ...band,
        members: band.members.map((member) =>
          member.id === id ? { ...member, ...changes } : member,
        ),
        adoptedSongs: band.adoptedSongs.map((song) =>
          song.participants?.[id]
            ? summarizeSong(
                {
                  ...song,
                  participants: {
                    ...song.participants,
                    [id]: { ...song.participants[id], part: changes.part },
                  },
                },
                currentUserId,
              )
            : song,
        ),
      }));
      return true;
    },
    removeMember: (id: string) => {
      if (!canManage || id === currentUserId) return;
      update((band) =>
        normalizeWorkspace(
          { ...band, members: band.members.filter((member) => member.id !== id) },
          currentUserId,
        ),
      );
    },
    updateWorkspaceProfile: async (name: string, description: string, photo: string) => {
      if (!canManage) throw new Error('밴드 관리자만 설정을 수정할 수 있어요.');
      if (serverConfigured) {
        await api(`/workspaces/${workspaceId}`, 'PATCH', { name, description, photo });
        await store.reloadRemote();
      } else update((band) => ({ ...band, name: name.trim(), description, photo }));
    },
    createWorkspace: async (name: string, description = '', photo = '') => {
      if (serverConfigured) {
        const created = await createRemoteWorkspace(name, description, photo);
        await store.reloadRemote();
        selectWorkspace(created.id);
        return created.id;
      }
      const id = `ws-${Date.now()}`;
      setWorkspaces((all) => [
        ...all,
        {
          id,
          name: name.trim(),
          description,
          photo,
          color: '#43896b',
          members: [{ ...initialMembers[0] }],
          recommendations: [],
          adoptedSongs: [],
          rehearsals: [],
        },
      ]);
      selectWorkspace(id);
      return id;
    },
  };
}

// eslint-disable-next-line react-refresh/only-export-components
export function useWorkspaceValue<T>(key: string, initial: T): [T, Dispatch<SetStateAction<T>>] {
  const { workspace, setDocument } = useMockAppState();
  const value = (workspace?.documents?.[key] as T | undefined) ?? initial;
  return [value, (next) => setDocument(key, next, initial)];
}
