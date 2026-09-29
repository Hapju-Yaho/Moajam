import type { Workspace } from '../mocks/workspaces';
import { api, currentIdentity } from './remote-client';
type RemoteBand = {
  id: string;
  name: string;
  members: { userId: string; role: string; part: string; user: { displayName: string } }[];
};
type Document = { key: string; value: { data: unknown }; revision: number };
const revisions = new Map<string, number>();
export async function loadRemoteWorkspaces(
  accept: () => boolean = () => true,
): Promise<Workspace[] | null> {
  const user = await currentIdentity();
  if (!user) throw new Error('로그인이 필요합니다.');
  const bands = await api<RemoteBand[]>('/workspaces', 'GET', undefined, user);
  const nextRevisions = new Map<string, number>();
  const result = await Promise.all(
    bands.map(async (band) => {
      const docs = await api<Document[]>(
        `/workspaces/${band.id}/documents`,
        'GET',
        undefined,
        user,
      );
      const documents: Record<string, unknown> = {};
      docs.forEach((doc) => {
        documents[doc.key] = doc.value.data;
        nextRevisions.set(`${user}/${band.id}/${doc.key}`, doc.revision);
      });
      return {
        id: band.id,
        name: band.name,
        description: '함께 만드는 밴드',
        color: '#4f75d8',
        members: band.members.map((member) => ({
          id: member.userId,
          name: member.user.displayName,
          role: member.role,
          part: member.part,
          initials: member.user.displayName.slice(-2),
          color: '#d7e8ff',
        })),
        recommendations: (documents.recommendations ?? []) as Workspace['recommendations'],
        adoptedSongs: (documents.songs ?? []) as Workspace['adoptedSongs'],
        rehearsals: (documents.rehearsals ?? []) as Workspace['rehearsals'],
        documents: Object.fromEntries(
          Object.entries(documents).filter(
            ([key]) => !['recommendations', 'songs', 'rehearsals'].includes(key),
          ),
        ),
      };
    }),
  );
  if (!accept()) return null;
  for (const key of revisions.keys()) if (key.startsWith(`${user}/`)) revisions.delete(key);
  nextRevisions.forEach((revision, key) => revisions.set(key, revision));
  return result;
}
export async function saveRemoteWorkspace(
  previous: Workspace,
  next: Workspace,
  expectedUser?: string,
) {
  const before = {
    ...previous.documents,
    recommendations: previous.recommendations,
    songs: previous.adoptedSongs,
    rehearsals: previous.rehearsals,
  };
  const after = {
    ...next.documents,
    recommendations: next.recommendations,
    songs: next.adoptedSongs,
    rehearsals: next.rehearsals,
  };
  const user = await currentIdentity();
  if (!user) throw new Error('로그인이 필요합니다.');
  if (expectedUser && user !== expectedUser)
    throw new Error('계정이 변경되어 저장을 중단했습니다.');
  const documents = Object.entries(after)
    .filter(
      ([key, data]) => JSON.stringify(before[key as keyof typeof before]) !== JSON.stringify(data),
    )
    .map(([key, data]) => ({
      key,
      revision: revisions.get(`${user}/${next.id}/${key}`) ?? 0,
      value: { data },
    }));
  const members = next.members
    .filter((member) => {
      const old = previous.members.find((item) => item.id === member.id);
      return old && (old.role !== member.role || old.part !== member.part);
    })
    .map((member) => ({ userId: member.id, role: member.role, part: member.part }));
  const removedMemberIds = previous.members
    .filter((member) => !next.members.some((item) => item.id === member.id))
    .map((member) => member.id);
  if (!documents.length && !members.length && !removedMemberIds.length) return;
  const result = await api<{ documents: Document[] }>(
    `/workspaces/${next.id}/sync`,
    'PUT',
    { documents, members, removedMemberIds },
    user,
  );
  result.documents.forEach((doc) => revisions.set(`${user}/${next.id}/${doc.key}`, doc.revision));
}

export async function createRemoteWorkspace(name: string) {
  return api<{ id: string }>('/workspaces', 'POST', { name });
}
