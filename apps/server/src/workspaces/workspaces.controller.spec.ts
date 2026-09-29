import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { WorkspacesController } from './workspaces.controller.js';
import type { PrismaService } from '../common/database/prisma.service.js';
import type { StorageService } from '../media/storage.service.js';
import type { SeparationService } from '../media/separation.service.js';
import type { AuthenticatedUser } from '../common/auth/auth.service.js';
import { canWriteDocument } from './document-policy.js';

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
    ),
  };
}
const user = { id: 'user' } as AuthenticatedUser;
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
    );
    assert.deepEqual(
      (await controller.notifications(user, 'band-a')).map((item) => item.id),
      ['a'],
    );
    assert.deepEqual(await controller.notifications(user, 'band-c'), []);
    assert.equal((await controller.notifications(user)).length, 50);
  });
});
