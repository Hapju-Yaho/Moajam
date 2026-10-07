import type { BandPhotoService } from './band-photo.service.js';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { WorkspacesController } from './workspaces.controller.js';
import type { PrismaService } from '../common/database/prisma.service.js';
import type { StorageService } from '../media/storage.service.js';
import type { SeparationService } from '../media/separation.service.js';
import type { AuthenticatedUser } from '../common/auth/auth.service.js';
import { isBandScore } from './score-policy.js';
import { canWriteDocument } from './document-policy.js';

describe('band photo save failures', () => {
  for (const operation of ['create', 'update'] as const) {
    it(`${operation}: leaves the band unchanged when upload fails and discards new files when DB save fails`, async () => {
      const user = { id: 'owner' } as AuthenticatedUser;
      const draft = { name: 'Band', photo: 'new image' };
      const prepared = { value: '/v1/band-photos/new', created: { id: 'new', key: 'owner/new' } };
      let uploadFails = true;
      let transactions = 0;
      const discarded: unknown[] = [];
      const controller = new WorkspacesController(
        {
          workspaceMember: { findUnique: async () => ({ role: 'OWNER' }) },
          $transaction: async () => {
            transactions++;
            throw new Error('DB unavailable');
          },
        } as unknown as PrismaService,
        {} as StorageService,
        {} as SeparationService,
        {
          prepare: async () => {
            if (uploadFails) throw new Error('R2 unavailable');
            return prepared;
          },
          discard: async (_workspaceId: string, photo: unknown) => {
            discarded.push(photo);
          },
        } as unknown as BandPhotoService,
      );
      const save = () =>
        operation === 'create'
          ? controller.create(user, draft)
          : controller.updateBand(user, 'band', draft);
      await assert.rejects(save(), /R2 unavailable/);
      assert.equal(transactions, 0);
      uploadFails = false;
      await assert.rejects(save(), /DB unavailable/);
      assert.deepEqual(discarded, [prepared]);
    });
  }
});

function fixture(memberCount: number, role = 'OWNER', storageFails = false) {
  const calls: string[] = [];
  const asset = { id: 'asset', objectKey: 'owner/file' };
  const tx = {
    workspaceMember: {
      findUnique: async () => ({ role }),
      count: async ({ where }: { where: { role?: string } }) => (where.role ? 1 : memberCount),
      delete: async () => {
        calls.push('member');
      },
    },
    mediaAsset: {
      findMany: async () => [asset],
      deleteMany: async () => {
        calls.push('assets');
      },
    },
    separationJob: {
      findMany: async () => [],
      deleteMany: async () => {
        calls.push('jobs');
      },
    },
    notification: {
      deleteMany: async () => {
        calls.push('notifications');
      },
    },
    workspace: {
      delete: async () => {
        calls.push('workspace');
      },
    },
  };
  const db = {
    ...tx,
    $transaction: async (action: (client: typeof tx) => Promise<unknown>) => action(tx),
  };
  const storage = {
    bucket: () => ({
      remove: async (keys: string[]) => {
        assert.deepEqual(keys, ['owner/file']);
        calls.push('files');
        return { error: storageFails ? new Error('offline') : null };
      },
    }),
  };
  const separation = {
    stopForSources: async () => {
      calls.push('stop');
    },
  };
  return {
    calls,
    controller: new WorkspacesController(
      db as unknown as PrismaService,
      storage as unknown as StorageService,
      separation as unknown as SeparationService,
      {} as BandPhotoService,
    ),
  };
}
const user = { id: 'user' } as AuthenticatedUser;

describe('band scores', () => {
  const score = { title: '공용 악보', bpm: 120, parts: ['Bass'], notes: [], sync: {} };
  function scoreFixture() {
    let document: { revision: number; value: unknown; updatedBy: string } | null = null;
    const tx = {
      workspaceMember: {
        findUnique: async ({
          where,
        }: {
          where: { workspaceId_userId: { workspaceId: string; userId: string } };
        }) =>
          where.workspaceId_userId.workspaceId === 'band' &&
          ['user', 'member'].includes(where.workspaceId_userId.userId)
            ? { role: 'MEMBER' }
            : null,
      },
      mediaAsset: {
        count: async ({
          where,
        }: {
          where: { id: { in: string[] }; workspaceId: string; visibility: string };
        }) => {
          assert.equal(where.workspaceId, 'band');
          assert.equal(where.visibility, 'WORKSPACE');
          return where.id.in.filter((id) => id === 'shared-audio').length;
        },
      },
      workspaceDocument: {
        findUnique: async ({ where }: { where: { workspaceId_key: { key: string } } }) =>
          where.workspaceId_key.key === 'songs' ? { value: { data: [{ id: 'song' }] } } : document,
        findUniqueOrThrow: async () => document,
        create: async ({ data }: { data: { value: unknown; updatedBy: string } }) => {
          if (document) throw { code: 'P2002' };
          document = { revision: 1, value: data.value, updatedBy: data.updatedBy };
          return document;
        },
        updateMany: async ({
          where,
          data,
        }: {
          where: { revision: number };
          data: { value: unknown; updatedBy: string };
        }) => {
          if (!document || where.revision !== document.revision) return { count: 0 };
          document = {
            revision: document.revision + 1,
            value: data.value,
            updatedBy: data.updatedBy,
          };
          return { count: 1 };
        },
      },
    };
    const db = {
      ...tx,
      $transaction: async (action: (client: typeof tx) => Promise<unknown>) => action(tx),
    };
    return new WorkspacesController(
      db as unknown as PrismaService,
      {} as StorageService,
      {} as SeparationService,
      {} as BandPhotoService,
    );
  }
  it('lets ordinary members save and read one shared score', async () => {
    const controller = scoreFixture();
    assert.equal(await controller.score(user, 'band', 'song'), null);
    await controller.saveScore(user, 'band', 'song', { revision: 0, value: { data: score } });
    const member = { id: 'member' } as AuthenticatedUser;
    const saved = await controller.score(member, 'band', 'song');
    assert.equal(saved?.revision, 1);
    const updated = await controller.saveScore(member, 'band', 'song', {
      revision: 1,
      value: { data: { ...score, title: '멤버 수정' } },
    });
    assert.equal(updated.revision, 2);
    assert.equal(updated.updatedBy, 'member');
  });
  it('saves and reads zero-beat grace notes without dropping their techniques', async () => {
    const controller = scoreFixture();
    const grace = {
      id: 'grace',
      part: score.parts[0],
      pitch: 60,
      beats: 0,
      graceBeats: 0.5,
      rest: false,
      accent: false,
      chord: '',
      lyric: '',
      staccato: true,
      connection: { type: 'slide', targetId: 'main' },
    };
    const data = {
      ...score,
      notes: [
        grace,
        {
          ...grace,
          id: 'main',
          pitch: 62,
          beats: 1,
          graceBeats: undefined,
          connection: undefined,
        },
      ],
    };
    await controller.saveScore(user, 'band', 'song', { revision: 0, value: { data } });
    assert.deepEqual((await controller.score(user, 'band', 'song'))?.value, { data });
    for (const patch of [
      { graceBeats: undefined },
      { graceBeats: 0 },
      { graceBeats: -1 },
      { graceBeats: 0.1 },
      { graceBeats: Infinity },
      { graceBeats: '0.5' },
      { beats: 1 },
      { rest: true },
      { blank: true },
      { tuplet: 3 },
    ]) {
      await assert.rejects(
        controller.saveScore(user, 'band', 'song', {
          revision: 1,
          value: { data: { ...data, notes: [{ ...grace, ...patch }, data.notes[1]] } },
        }),
        /악보 데이터/,
      );
    }
    assert.equal((await controller.score(user, 'band', 'song'))?.revision, 1);
  });
  it('rejects both stale edits and concurrent first saves without changing the winner', async () => {
    const controller = scoreFixture();
    await controller.saveScore(user, 'band', 'song', { revision: 0, value: { data: score } });
    await assert.rejects(
      controller.saveScore(user, 'band', 'song', { revision: 0, value: { data: score } }),
      /다른 멤버/,
    );
    await controller.saveScore(user, 'band', 'song', {
      revision: 1,
      value: { data: { ...score, title: 'winner' } },
    });
    await assert.rejects(
      controller.saveScore(user, 'band', 'song', { revision: 1, value: { data: score } }),
      /다른 멤버/,
    );
    assert.equal((await controller.score(user, 'band', 'song'))?.revision, 2);
  });
  it('denies outsiders, another band and nonexistent songs', async () => {
    const controller = scoreFixture();
    const outsider = { id: 'outsider' } as AuthenticatedUser;
    await assert.rejects(controller.score(outsider, 'band', 'song'), /권한/);
    await assert.rejects(
      controller.saveScore(outsider, 'band', 'song', { revision: 0, value: { data: score } }),
      /권한/,
    );
    await assert.rejects(controller.score(user, 'other-band', 'song'), /권한/);
    await assert.rejects(
      controller.saveScore(user, 'band', 'missing', { revision: 0, value: { data: score } }),
      /곡을 찾을/,
    );
  });
  it('rejects malformed scores and private or foreign attachments', async () => {
    const controller = scoreFixture();
    await assert.rejects(
      controller.saveScore(user, 'band', 'song', {
        revision: 0,
        value: { data: { ...score, bpm: -1 } },
      }),
      /악보 데이터/,
    );
    await assert.rejects(
      controller.saveScore(user, 'band', 'song', {
        revision: 0,
        value: { data: { ...score, referenceAudio: { __moajamAssetId: 'private-audio' } } },
      }),
      /공유된 파일/,
    );
    const saved = await controller.saveScore(user, 'band', 'song', {
      revision: 0,
      value: { data: { ...score, referenceAudio: { __moajamAssetId: 'shared-audio' } } },
    });
    assert.equal(saved.revision, 1);
  });
});
describe('leaving a workspace', () => {
  it('requires explicit deletion confirmation for the last member', async () => {
    const { controller, calls } = fixture(1);
    await assert.rejects(controller.remove(user, 'band', 'user'), /삭제를 확인/);
    assert.deepEqual(calls, []);
  });
  it('allows a sole owner to leave and deletes files and all related records', async () => {
    const { controller, calls } = fixture(1);
    assert.deepEqual(await controller.remove(user, 'band', 'user', 'true'), {
      removed: true,
      workspaceDeleted: true,
    });
    assert.deepEqual(calls, ['stop', 'files', 'jobs', 'assets', 'notifications', 'workspace']);
  });
  it('still prevents leaving other members without an owner', async () => {
    const { controller, calls } = fixture(2);
    await assert.rejects(controller.remove(user, 'band', 'user', 'true'), /권한을 이전/);
    assert.deepEqual(calls, []);
  });
  it('removes only the membership when other members remain', async () => {
    const { controller, calls } = fixture(2, 'MEMBER');
    assert.deepEqual(await controller.remove(user, 'band', 'user'), { removed: true });
    assert.deepEqual(calls, ['member']);
  });
  it('does not delete database records when file deletion fails', async () => {
    const { controller, calls } = fixture(1, 'OWNER', true);
    await assert.rejects(controller.remove(user, 'band', 'user', 'true'), /파일을 삭제하지 못/);
    assert.deepEqual(calls, ['stop', 'files']);
  });
});

describe('personal schedule isolation', () => {
  const event = {
    id: 'event-1',
    title: '개인 연습',
    date: '2026-09-28',
    start: '18:00',
    end: '19:00',
    place: '',
    goal: '',
  };
  function schedules() {
    const records = new Map<string, unknown>();
    const db = {
      personalSchedule: {
        findMany: async ({ where }: { where: { ownerId: string } }) =>
          [...records.entries()]
            .filter(([key]) => key.startsWith(`${where.ownerId}/`))
            .map(([, value]) => ({ value })),
        upsert: async ({ create }: { create: { ownerId: string; id: string; value: unknown } }) => {
          records.set(`${create.ownerId}/${create.id}`, create.value);
          return create;
        },
        deleteMany: async ({ where }: { where: { ownerId: string; id: string } }) => ({
          count: Number(records.delete(`${where.ownerId}/${where.id}`)),
        }),
      },
    };
    return new WorkspacesController(
      db as unknown as PrismaService,
      {} as StorageService,
      {} as SeparationService,
      {} as BandPhotoService,
    );
  }
  it('uses authenticated ownership for reads, updates and deletion, even for matching IDs', async () => {
    const controller = schedules();
    const other = { id: 'other' } as AuthenticatedUser;
    await controller.savePersonalSchedule(user, event.id, {
      value: { ...event, ownerId: other.id, workspaceId: 'band' },
    });
    assert.deepEqual(await controller.personalSchedules(user), [event]);
    assert.deepEqual(await controller.personalSchedules(other), []);
    await controller.savePersonalSchedule(other, event.id, {
      value: { ...event, title: '다른 개인 일정' },
    });
    await controller.deletePersonalSchedule(other, event.id);
    assert.deepEqual(await controller.personalSchedules(user), [event]);
    await controller.savePersonalSchedule(user, event.id, { value: { ...event, title: '수정됨' } });
    assert.deepEqual(await controller.personalSchedules(user), [{ ...event, title: '수정됨' }]);
    await controller.deletePersonalSchedule(user, event.id);
    assert.deepEqual(await controller.personalSchedules(user), []);
  });
  it('rejects invalid dates, reversed times, mismatched IDs and empty titles', async () => {
    const controller = schedules();
    for (const change of [
      { date: '2026-02-30' },
      { end: '17:00' },
      { id: 'different' },
      { title: ' ' },
    ])
      await assert.rejects(
        controller.savePersonalSchedule(user, event.id, { value: { ...event, ...change } }),
        /확인/,
      );
  });
});

describe('discussion video permissions', () => {
  const opinion = {
    id: 'opinion',
    authorId: 'author',
    text: '',
    videoUrl: 'https://youtu.be/dQw4w9WgXcQ',
    likes: [],
    replies: [],
    resolved: false,
  };
  for (const key of ['recommendation/one/comments', 'song/one/discussion']) {
    it(`${key}: supports attachment-only posts and author edits without allowing other members to replace attachments`, () => {
      assert.equal(canWriteDocument(key, [], [opinion], 'author', false), true);
      const changed = { ...opinion, videoUrl: 'https://example.com/video.mp4' };
      assert.equal(canWriteDocument(key, [opinion], [changed], 'author', false), true);
      assert.equal(canWriteDocument(key, [opinion], [changed], 'other', false), false);
      assert.equal(
        canWriteDocument(
          key,
          [],
          [{ ...opinion, videoUrl: 'javascript:alert(1)' }],
          'author',
          false,
        ),
        false,
      );
      assert.equal(
        canWriteDocument(
          key,
          [opinion],
          [
            {
              ...opinion,
              replies: [{ id: 'reply', authorId: 'other', text: '', videoUrl: changed.videoUrl }],
            },
          ],
          'other',
          false,
        ),
        true,
      );
    });
  }
});

describe('band home notifications', () => {
  it('filters by band before the limit and still requires membership and notification ownership', async () => {
    const memberships = ['band-a', 'band-b'];
    const records = [
      ...Array.from({ length: 55 }, (_, i) => ({
        id: `b-${i}`,
        userId: 'user',
        workspaceId: 'band-b',
      })),
      { id: 'a', userId: 'user', workspaceId: 'band-a' },
      { id: 'private', userId: 'other', workspaceId: 'band-a' },
      { id: 'outside', userId: 'user', workspaceId: 'band-c' },
    ];
    const db = {
      workspaceMember: {
        findMany: async ({ where }: { where: { userId: string; workspaceId?: string } }) =>
          memberships
            .filter(
              (id) => where.userId === 'user' && (!where.workspaceId || id === where.workspaceId),
            )
            .map((workspaceId) => ({ workspaceId })),
      },
      notification: {
        findMany: async ({
          where,
          take,
        }: {
          where: { userId: string; workspaceId: { in: string[] } };
          take: number;
        }) =>
          records
            .filter(
              (item) =>
                item.userId === where.userId && where.workspaceId.in.includes(item.workspaceId),
            )
            .slice(0, take),
      },
    };
    const controller = new WorkspacesController(
      db as unknown as PrismaService,
      {} as StorageService,
      {} as SeparationService,
      {} as BandPhotoService,
    );
    assert.deepEqual(
      (await controller.notifications(user, 'band-a')).map((item) => item.id),
      ['a'],
    );
    assert.deepEqual(await controller.notifications(user, 'band-c'), []);
    assert.equal((await controller.notifications(user)).length, 50);
  });
});

describe('band score notation settings', () => {
  it('accepts shared notation settings and rejects malformed meter, length and repeat metadata', () => {
    const score = {
      title: 'Band score',
      rhythmFeel: 'triplet-sixteenth',
      bpm: 120,
      parts: ['Bass'],
      sync: {},
      notes: [],
      timeSignature: { beats: 6, beatType: 8 },
      keySignature: -2,
      measureLengths: { Bass: { 0: 5 } },
      measureWidths: { Bass: { 0: 150 } },
      repeats: { 0: { start: true, end: true, times: 3 } },
      barlines: { 0: 'double' },
    };
    assert.equal(isBandScore(score), true);
    const triplet = {
      id: 'triplet',
      part: 'Bass',
      pitch: 40,
      beats: 1 / 3,
      tuplet: 3,
      rest: false,
      accent: false,
      chord: '',
      lyric: '',
    };
    assert.equal(isBandScore({ ...score, notes: [triplet] }), true);
    for (const slideIn of ['up', 'down'])
      assert.equal(
        isBandScore({ ...score, notes: [{ ...triplet, slideIn, slideOut: 'down' }] }),
        true,
      );
    assert.equal(isBandScore({ ...score, notes: [{ ...triplet, slideIn: 'sideways' }] }), false);
    assert.equal(isBandScore({ ...score, notes: [{ ...triplet, tuplet: 5 }] }), false);
    for (const patch of [
      { timeSignature: { beats: 0, beatType: 4 } },
      { timeSignature: { beats: 4, beatType: 3 } },
      { measureLengths: { Bass: { 0: 0 } } },
      { measureLengths: { Bass: { 0: 1.1 } } },
      { measureWidths: { Other: { 0: 150 } } },
      { repeats: { 0: { end: true, times: 100000 } } },
      { barlines: { 0: 'invalid' } },
      { rhythmFeel: 'unknown' },
    ])
      assert.equal(isBandScore({ ...score, ...patch }), false);
  });
});
