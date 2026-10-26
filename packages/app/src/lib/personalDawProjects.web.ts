import { readMedia, writeMedia } from './mediaStore.web';
import { clientId } from './clientId';
import type { BandDawProject } from './bandDawProjects';

const indexKey = 'local-recording/projects';
export const personalProjectMediaKey = (id: string) => `local-recording/project/${id}`;
const queues = new Map<string, Promise<unknown>>();
function queued<T>(user: string, action: () => Promise<T>): Promise<T> {
  const task = (queues.get(user) ?? Promise.resolve()).catch(() => {}).then(action);
  queues.set(user, task);
  void task
    .finally(() => {
      if (queues.get(user) === task) queues.delete(user);
    })
    .catch(() => {});
  return task;
}
async function load(user: string): Promise<BandDawProject[]> {
  const existing = await readMedia<BandDawProject[]>(indexKey, user);
  if (existing) return existing;
  // Keep recordings saved before personal projects were introduced.
  const legacy = await readMedia('local-recording/default', user);
  const projects: BandDawProject[] = legacy
    ? [
        {
          id: clientId(),
          workspaceId: 'personal',
          songId: 'recording',
          name: '내 녹음',
          revision: 1,
        },
      ]
    : [];
  if (projects[0]) await writeMedia(personalProjectMediaKey(projects[0].id), legacy, user);
  await writeMedia(indexKey, projects, user);
  return projects;
}
export const listPersonalDawProjects = (user: string) => queued(user, () => load(user));
export function managePersonalDawProject(
  action: 'create' | 'rename' | 'delete',
  user: string,
  project?: BandDawProject,
  name?: string,
  initialData?: unknown,
): Promise<BandDawProject | undefined> {
  return queued(user, async () => {
    const projects = await load(user);
    if (action === 'delete') {
      await writeMedia(
        indexKey,
        projects.filter((row) => row.id !== project?.id),
        user,
      );
      return;
    }
    const trimmed = name?.trim() ?? '';
    if (!trimmed || trimmed.length > 160) throw Error('프로젝트 이름은 1~160자로 입력해주세요.');
    if (projects.some((row) => row.name === trimmed && row.id !== project?.id))
      throw Error('같은 이름 프로젝트가 존재합니다.');
    if (action === 'rename') {
      const current = projects.find((row) => row.id === project?.id);
      if (!current) throw Error('프로젝트를 찾을 수 없어요.');
      const updated = { ...current, name: trimmed, revision: current.revision + 1 };
      await writeMedia(
        indexKey,
        projects.map((row) => (row.id === updated.id ? updated : row)),
        user,
      );
      return updated;
    }
    const created = {
      id: clientId(),
      workspaceId: 'personal',
      songId: 'recording',
      name: trimmed,
      revision: 1,
    };
    await writeMedia(
      personalProjectMediaKey(created.id),
      initialData ?? { tracks: [], notes: [] },
      user,
    );
    await writeMedia(indexKey, [...projects, created], user);
    return created;
  });
}
