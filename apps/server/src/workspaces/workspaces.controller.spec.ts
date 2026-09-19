import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { WorkspacesController } from './workspaces.controller.js';
import type { PrismaService } from '../common/database/prisma.service.js';
import type { StorageService } from '../media/storage.service.js';
import type { SeparationService } from '../media/separation.service.js';
import type { AuthenticatedUser } from '../common/auth/supabase.service.js';

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
