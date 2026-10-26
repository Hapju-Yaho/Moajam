import assert from 'node:assert/strict';
import { test } from 'node:test';
import { documentEvents, writeNotificationEvents } from './notification-events.js';
import type { Prisma } from '../generated/prisma/client.js';

test('opinions, replies and feedback only notify on additions, retaining precise targets', () => {
  const timedOpinion = documentEvents(
    'song/song/discussion',
    [],
    [{ id: 'timed', text: 'intro', time: 12 }],
  )[0];
  assert.equal(timedOpinion.kind, 'TRACK_FEEDBACK');
  assert.equal(timedOpinion.metadata.time, 12);
  assert.equal(timedOpinion.metadata.focusId, 'timed');
  const opinion = { id: 'opinion', authorId: 'a', text: 'chorus', replies: [] };
  assert.equal(
    documentEvents('song/song/discussion', [], [opinion])[0].metadata.focusId,
    'opinion',
  );
  assert.deepEqual(
    documentEvents('song/song/discussion', [opinion], [{ ...opinion, text: 'edited' }]),
    [],
  );
  assert.deepEqual(documentEvents('song/song/discussion', [opinion], []), []);
  const replied = { ...opinion, replies: [{ id: 'reply', authorId: 'b', text: 'yes' }] };
  const events = documentEvents('song/song/discussion', [opinion], [replied]);
  assert.equal(events.length, 1);
  assert.deepEqual(events[0].recipientIds, ['a']);
  assert.equal(events[0].metadata.focusId, 'reply');
  assert.deepEqual(documentEvents('song/song/discussion', [replied], [replied]), []);
  assert.equal(
    documentEvents('song/song/feedback', [], [{ id: 'f', text: 'solo', time: 73 }])[0].metadata
      .time,
    73,
  );
  assert.deepEqual(documentEvents('personal/score', undefined, {}), []);
});
test('rehearsal updates ignore unrelated fields and cancellation retains a snapshot', () => {
  const before = { id: 'r', title: 'Friday', date: '2026-10-30', start: '18:00', place: 'A' };
  assert.equal(documentEvents('rehearsals', [], [before])[0].kind, 'REHEARSAL');
  assert.deepEqual(documentEvents('rehearsals', [before], [{ ...before, goal: 'practice' }]), []);
  assert.deepEqual(
    documentEvents('rehearsals', [before], [{ ...before, place: 'B' }])[0].metadata.changed,
    ['place'],
  );
  assert.equal(documentEvents('rehearsals', [before], [])[0].metadata.place, 'A');
  assert.deepEqual(documentEvents('rehearsals', [{ ...before, cancelled: true }], []), []);
});
test('recipients exclude the actor and nonmembers, target song participants and rehearsal assignments, and deduplicate', async () => {
  const saved: Prisma.NotificationCreateManyInput[] = [];
  const tx = {
    workspaceMember: { findMany: async () => ['a', 'b', 'c'].map((userId) => ({ userId })) },
    profile: { findUnique: async () => ({ displayName: 'Actor' }) },
    workspaceDocument: {
      findUnique: async ({ where }: { where: { workspaceId_key: { key: string } } }) => ({
        value: {
          data:
            where.workspaceId_key.key === 'songs'
              ? [{ id: 'song', title: 'Track', participants: { a: {}, b: {}, departed: {} } }]
              : ['c'],
        },
      }),
    },
    notification: {
      createMany: async ({ data }: { data: Prisma.NotificationCreateManyInput[] }) => {
        saved.push(...data);
      },
    },
  } as unknown as Prisma.TransactionClient;
  const opinion = documentEvents('song/song/discussion', [], [{ id: 'o', text: 'Hi' }]);
  await writeNotificationEvents(tx, 'band', 'a', [...opinion, ...opinion]);
  assert.deepEqual(
    saved.map((item) => item.userId),
    ['b'],
  );
  saved.length = 0;
  await writeNotificationEvents(
    tx,
    'band',
    'a',
    documentEvents('rehearsals', [], [{ id: 'r', title: 'Jam' }]),
  );
  assert.deepEqual(
    saved.map((item) => item.userId),
    ['c'],
  );
});
test('track playback preferences do not generate sharing events', () => {
  const tracks = [{ id: 't', clips: [] }];
  assert.deepEqual(
    documentEvents('song/song/soundtrack', { tracks, loop: false }, { tracks, loop: true }),
    [],
  );
  assert.equal(
    documentEvents('song/song/soundtrack', { tracks }, { tracks: [...tracks, { id: 'new' }] })[0]
      .kind,
    'TRACKS_SHARED',
  );
});
