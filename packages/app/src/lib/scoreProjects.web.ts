import { clientId } from './clientId';
import { api, serverConfigured, currentIdentity } from './remote';
import { readMedia, writeMedia } from './mediaStore.web';
import type { StoredScore } from './scoreVersions';
import { encode } from './remote-media.web';
export type ScoreProject = {
  id: string;
  name: string;
  revision: number;
  workspaceId: string;
  songId: string;
};
type LocalProject = ScoreProject & { data: StoredScore; legacy?: boolean; deleted?: boolean };
const indexKey = (workspace: string, song: string) => `score-projects/${workspace}/${song}`;
export async function listScoreProjects(
  workspace: string,
  song: string,
  title: string,
): Promise<ScoreProject[]> {
  if (serverConfigured)
    return api(`/workspaces/${workspace}/songs/${encodeURIComponent(song)}/score-projects`);
  return navigator.locks.request(indexKey(workspace, song), async () => {
    const rows = (await readMedia<LocalProject[]>(indexKey(workspace, song), 'band-shared')) ?? [];
    if (!rows.some((item) => item.legacy)) {
      const previous = await readMedia<{ value: { data: StoredScore } }>(
        `band-score/${workspace}/${song}`,
        'band-shared',
      );
      if (previous?.value.data) {
        rows.unshift({
          id: clientId(),
          name: title.slice(0, 160),
          revision: 1,
          workspaceId: workspace,
          songId: song,
          data: previous.value.data,
          legacy: true,
        });
        await writeMedia(indexKey(workspace, song), rows, 'band-shared');
      }
    }
    return rows
      .filter((item) => !item.deleted)
      .map(({ data: _data, ...item }) => {
        void _data;
        return item;
      });
  });
}
export async function createScoreProject(
  workspace: string,
  song: string,
  name: string,
  data: StoredScore,
): Promise<ScoreProject> {
  if (serverConfigured) {
    const user = await currentIdentity();
    if (!user) throw new Error('로그인이 필요합니다.');
    const encoded = await encode(data, `band-score/${workspace}/${song}`, user);
    return api(
      `/workspaces/${workspace}/songs/${encodeURIComponent(song)}/score-projects`,
      'POST',
      { name, data: encoded },
      user,
    );
  }
  return navigator.locks.request(indexKey(workspace, song), async () => {
    const rows = (await readMedia<LocalProject[]>(indexKey(workspace, song), 'band-shared')) ?? [];
    if (rows.some((item) => !item.deleted && item.name.toLowerCase() === name.trim().toLowerCase()))
      throw new Error('같은 이름 프로젝트가 존재합니다.');
    const project = {
      id: clientId(),
      workspaceId: workspace,
      songId: song,
      name: name.trim(),
      revision: 1,
      data,
    };
    await writeMedia(indexKey(workspace, song), [...rows, project], 'band-shared');
    return project;
  });
}
export async function readScoreProject(
  workspace: string,
  song: string,
  id: string,
): Promise<ScoreProject & { value: { data: StoredScore } }> {
  if (serverConfigured) return api(`/workspaces/${workspace}/score-projects/${id}`);
  const row = (await readMedia<LocalProject[]>(indexKey(workspace, song), 'band-shared'))?.find(
    (item) => item.id === id && !item.deleted,
  );
  if (!row) throw new Error('악보 프로젝트를 찾을 수 없어요.');
  return { ...row, value: { data: row.data } };
}
export async function writeScoreProject(
  workspace: string,
  song: string,
  id: string,
  revision: number,
  data: StoredScore,
  name?: string,
) {
  if (serverConfigured)
    return api<ScoreProject>(`/workspaces/${workspace}/score-projects/${id}`, 'PUT', {
      revision,
      value: { data },
      name,
    });
  return navigator.locks.request(indexKey(workspace, song), async () => {
    const rows = (await readMedia<LocalProject[]>(indexKey(workspace, song), 'band-shared')) ?? [];
    const row = rows.find((item) => item.id === id && !item.deleted);
    if (!row || row.revision !== revision)
      throw new Error('다른 멤버가 프로젝트를 수정했어요. 새로고침해주세요.');
    if (
      name &&
      rows.some(
        (item) =>
          item.id !== id && !item.deleted && item.name.toLowerCase() === name.trim().toLowerCase(),
      )
    )
      throw new Error('같은 이름 프로젝트가 존재합니다.');
    Object.assign(row, { data, name: name?.trim() ?? row.name, revision: revision + 1 });
    await writeMedia(indexKey(workspace, song), rows, 'band-shared');
    return row;
  });
}
export async function deleteScoreProject(
  workspace: string,
  song: string,
  id: string,
  revision: number,
) {
  if (serverConfigured)
    return api(`/workspaces/${workspace}/score-projects/${id}`, 'DELETE', { revision });
  return navigator.locks.request(indexKey(workspace, song), async () => {
    const rows = (await readMedia<LocalProject[]>(indexKey(workspace, song), 'band-shared')) ?? [];
    const row = rows.find((item) => item.id === id && !item.deleted);
    if (!row || row.revision !== revision)
      throw new Error('프로젝트가 변경됐어요. 새로고침해주세요.');
    row.deleted = true;
    row.revision++;
    await writeMedia(indexKey(workspace, song), rows, 'band-shared');
  });
}
export type ScoreProjectEditorHandle = {
  dirty: boolean;
  busy: boolean;
  save: () => Promise<boolean>;
  snapshot: () => StoredScore;
};
