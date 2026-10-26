import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { PersonalController } from './personal.controller.js';
import type { PrismaService } from '../common/database/prisma.service.js';
import type { ProfilePhotoService } from './profile-photo.service.js';
function fixture() {
  const records = new Map<string, { visitedAt: string }>();
  const controller = new PersonalController(
    {
      personalDocument: {
        findUnique: async ({
          where,
        }: {
          where: { ownerId_key: { ownerId: string; key: string } };
        }) => {
          const value = records.get(where.ownerId_key.ownerId + '/' + where.ownerId_key.key);
          return value ? { value } : null;
        },
        create: async ({
          data,
        }: {
          data: { ownerId: string; key: string; value: { visitedAt: string } };
        }) => {
          const key = data.ownerId + '/' + data.key;
          if (records.has(key)) throw Object.assign(new Error('unique'), { code: 'P2002' });
          records.set(key, data.value);
          return { value: data.value };
        },
      },
    } as unknown as PrismaService,
    {} as ProfilePhotoService,
  );
  return { controller, records };
}
describe('help first visits', () => {
  it('keeps showing incomplete tours until completion is recorded', async () => {
    const { controller, records } = fixture();
    for (const screen of ['main-home', 'band-home', 'practice']) {
      assert.equal((await controller.readHelpVisit({ id: 'alice' }, screen)).firstVisit, true);
      assert.equal((await controller.readHelpVisit({ id: 'alice' }, screen)).firstVisit, true);
      assert.equal(records.has('alice/help-visit/' + screen), false);
      await controller.visitHelp({ id: 'alice' }, screen);
      assert.equal((await controller.readHelpVisit({ id: 'alice' }, screen)).firstVisit, false);
      assert.equal((await controller.readHelpVisit({ id: 'bob' }, screen)).firstVisit, true);
    }
    await assert.rejects(controller.readHelpVisit({ id: 'alice' }, 'other'));
  });
  it('records each screen separately for each user', async () => {
    const { controller, records } = fixture();
    for (const screen of ['main-home', 'band-home', 'practice']) {
      const first = await controller.visitHelp({ id: 'alice' }, screen);
      assert.equal(first.firstVisit, true);
      assert.ok(first.visitedAt && !Number.isNaN(Date.parse(first.visitedAt)));
      assert.equal((await controller.visitHelp({ id: 'alice' }, screen)).firstVisit, false);
      assert.equal((await controller.visitHelp({ id: 'bob' }, screen)).firstVisit, true);
    }
    assert.equal(records.size, 6);
  });
  it('only one concurrent entry receives the automatic tour', async () => {
    const { controller } = fixture();
    const results = await Promise.all([
      controller.visitHelp({ id: 'alice' }, 'band-home'),
      controller.visitHelp({ id: 'alice' }, 'band-home'),
    ]);
    assert.equal(results.filter((r) => r.firstVisit).length, 1);
  });
  it('rejects unknown screens without writing a visit', async () => {
    const { controller, records } = fixture();
    await assert.rejects(controller.visitHelp({ id: 'alice' }, 'other'));
    assert.equal(records.size, 0);
  });
  it('propagates database failures rather than reporting an existing visit', async () => {
    const controller = new PersonalController(
      {
        personalDocument: {
          create: async () => {
            throw Error('DB unavailable');
          },
        },
      } as unknown as PrismaService,
      {} as ProfilePhotoService,
    );
    await assert.rejects(controller.visitHelp({ id: 'alice' }, 'practice'), /DB unavailable/);
  });
});
