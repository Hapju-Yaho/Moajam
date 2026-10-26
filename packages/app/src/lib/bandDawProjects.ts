import { api, serverConfigured } from './remote';
import { readMedia, writeMedia } from './mediaStore';
import { clientId } from './clientId';

export type BandDawProject = {
  id: string;
  workspaceId: string;
  songId: string;
  name: string;
  revision: number;
  legacyKey?: string | null;
};
const indexKey = (workspace: string, song: string) => `daw-project-list/${workspace}/${song}`;
export const projectMediaKey = (workspace: string, id: string) => `daw-project/${workspace}/${id}`;
const pendingLists = new Map<string, Promise<BandDawProject[]>>();
export function listBandProjects(
  workspace: string,
  song: string,
  title: string,
  user: string,
): Promise<BandDawProject[]> {
  const key = `${user}/${workspace}/${song}`;
  const existing = pendingLists.get(key);
  if (existing) return existing;
  const task = loadBandProjects(workspace, song, title, user).finally(() => {
    if (pendingLists.get(key) === task) pendingLists.delete(key);
  });
  pendingLists.set(key, task);
  return task;
}
async function loadBandProjects(
  workspace: string,
  song: string,
  title: string,
  user: string,
): Promise<BandDawProject[]> {
  if (serverConfigured)
    return api(
      `/workspaces/${workspace}/songs/${encodeURIComponent(song)}/daw-projects`,
      'GET',
      undefined,
      user,
    );
  const existing = await readMedia<BandDawProject[]>(indexKey(workspace, song), user);
  if (existing) return existing;
  const project = {
    id: clientId(),
    workspaceId: workspace,
    songId: song,
    name: title,
    revision: 1,
    legacyKey: `song/${song}/soundtrack`,
  };
  const legacy = await readMedia(`practice/${workspace}/${song}`, user);
  if (!legacy) {
    await writeMedia(indexKey(workspace, song), [], user);
    return [];
  }
  await writeMedia(
    projectMediaKey(workspace, project.id),
    legacy ?? { tracks: [], notes: [] },
    user,
  );
  await writeMedia(indexKey(workspace, song), [project], user);
  return [project];
}
export async function manageBandProject(
  action: 'create' | 'rename' | 'duplicate' | 'delete',
  workspace: string,
  song: string,
  user: string,
  project?: BandDawProject,
  name?: string,
  initialData?: unknown,
): Promise<BandDawProject | undefined> {
  if (serverConfigured) {
    const base = `/workspaces/${workspace}`;
    if (action === 'create')
      return api(
        `${base}/songs/${encodeURIComponent(song)}/daw-projects`,
        'POST',
        { name, ...(initialData === undefined ? {} : { data: initialData }) },
        user,
      );
    if (!project) throw Error('프로젝트를 선택해주세요.');
    const path = `${base}/daw-projects/${project.id}`;
    if (action === 'duplicate') return api(`${path}/duplicate`, 'POST', undefined, user);
    const current = await api<BandDawProject>(path, 'GET', undefined, user);
    if (action === 'rename') return api(path, 'PATCH', { name, revision: current.revision }, user);
    await api(path, 'DELETE', { revision: current.revision }, user);
    return;
  }
  const rows = (await readMedia<BandDawProject[]>(indexKey(workspace, song), user)) ?? [];
  if (action === 'delete') {
    await writeMedia(
      indexKey(workspace, song),
      rows.filter((item) => item.id !== project?.id),
      user,
    );
    return;
  }
  if (action === 'rename') {
    const updated = { ...project!, name: name!, revision: project!.revision + 1 };
    await writeMedia(
      indexKey(workspace, song),
      rows.map((item) => (item.id === updated.id ? updated : item)),
      user,
    );
    return updated;
  }
  const created = {
    id: clientId(),
    workspaceId: workspace,
    songId: song,
    name: action === 'duplicate' ? `${project?.name} 복사본` : name!,
    revision: 1,
  };
  const data =
    action === 'duplicate'
      ? await readMedia(projectMediaKey(workspace, project!.id), user)
      : (initialData ?? { tracks: [], notes: [] });
  await writeMedia(projectMediaKey(workspace, created.id), data, user);
  await writeMedia(indexKey(workspace, song), [...rows, created], user);
  return created;
}
