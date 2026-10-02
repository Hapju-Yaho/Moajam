import { api, serverConfigured } from './remote';
import { encode, decode } from './remote-media.web';
import { readMedia, writeMedia } from './mediaStore.web';
import { validateScoreDocument, type ScoreDocument } from './scoreFile';

export type StoredScore = ScoreDocument['score'] & {
  referenceAudio?: ScoreDocument['referenceAudio'];
  instrumentSample?: ScoreDocument['instrumentSample'];
};
type RevisionDocument = { revision: number; value: { data: StoredScore } };
export const scoreConflictMessage =
  '다른 멤버가 악보를 수정했어요. 내 작업을 파일로 저장한 뒤 최신 악보를 불러와주세요.';

// Each open editor owns its revision. Reading in another editor must never advance it.
export function createBandScoreStore(workspaceId: string, songId: string, user: string) {
  const key = `band-score/${workspaceId}/${songId}`;
  const path = `/workspaces/${encodeURIComponent(workspaceId)}/scores/${encodeURIComponent(songId)}`;
  let revision: number | undefined;
  let saving = false;
  let loadRequest = 0;
  return {
    async load(): Promise<StoredScore | undefined> {
      if (saving) throw new Error('저장이 끝난 뒤 다시 불러와주세요.');
      const request = ++loadRequest;
      const document = serverConfigured
        ? await api<RevisionDocument | null>(path, 'GET', undefined, user)
        : await readMedia<RevisionDocument>(key, 'band-shared');
      const value = serverConfigured
        ? ((await decode(document?.value.data, user, key)) as StoredScore | undefined)
        : document?.value.data;
      // Refuse corrupt documents instead of opening and overwriting them with an empty score.
      if (value) validateScoreDocument(value);
      if (request !== loadRequest) throw new Error('새로운 불러오기 요청이 시작됐어요.');
      revision = document?.revision ?? 0;
      return value;
    },
    async save(value: StoredScore): Promise<void> {
      if (revision === undefined) throw new Error('악보를 먼저 불러와주세요.');
      if (saving) throw new Error('저장 중이에요. 잠시 기다려주세요.');
      validateScoreDocument(value);
      saving = true;
      try {
        if (serverConfigured) {
          const result = await api<RevisionDocument>(
            path,
            'PUT',
            {
              revision,
              value: { data: await encode(value, key, user) },
            },
            user,
          );
          revision = result.revision;
        } else {
          // Web Locks also serialize saves from different mock users/browser tabs.
          await navigator.locks.request(key, async () => {
            const current = await readMedia<RevisionDocument>(key, 'band-shared');
            if ((current?.revision ?? 0) !== revision) throw new Error(scoreConflictMessage);
            const next = revision! + 1;
            await writeMedia(key, { revision: next, value: { data: value } }, 'band-shared');
            revision = next;
          });
        }
      } finally {
        saving = false;
      }
    },
  };
}
