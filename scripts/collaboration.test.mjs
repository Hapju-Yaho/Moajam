import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Buffer } from 'node:buffer';
import { URL } from 'node:url';
import test from 'node:test';
import ts from 'typescript';
async function source(path) {
  const { outputText } = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  });
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
}
const { canWriteDocument, isWorkspaceDocumentKey } = await source(
  '../apps/server/src/workspaces/document-policy.ts',
);
test('song references protect authorship, including older links without an author', () => {
  const link = { id: 'a', authorId: 'u', title: 'Live', url: 'https://example.com/live' };
  const old = { id: 'legacy', title: 'Score', url: 'https://example.com/score' };
  const key = 'song/s/links';
  assert.equal(canWriteDocument(key, [], [link], 'u', false), true);
  assert.equal(canWriteDocument(key, [], [link], 'v', true), false);
  assert.equal(canWriteDocument(key, [link], [{ ...link, title: 'Edit' }], 'u', false), true);
  assert.equal(canWriteDocument(key, [link], [{ ...link, title: 'Edit' }], 'v', false), false);
  assert.equal(canWriteDocument(key, [link], [], 'v', false), false);
  assert.equal(canWriteDocument(key, [old], [old, link], 'u', false), true);
  assert.equal(canWriteDocument(key, [old], [], 'u', false), false);
  assert.equal(canWriteDocument(key, [old], [{ ...old, title: 'Updated' }], 'owner', true), true);
  assert.equal(
    canWriteDocument(key, [], [{ ...link, url: 'javascript:alert(1)' }], 'u', false),
    false,
  );
});
test('song session reflections have scoped keys and bounded content', () => {
  assert.equal(isWorkspaceDocumentKey('song/s-1/session/r-1/memo'), true);
  assert.equal(isWorkspaceDocumentKey('song/s-1/session/../memo'), false);
  assert.equal(isWorkspaceDocumentKey('song/s-1/session/r-1/admin'), false);
  assert.equal(canWriteDocument('song/s/session/r/memo', '', '곡별 회고', 'u', false), true);
  assert.equal(canWriteDocument('song/s/session/r/memo', '', 'x'.repeat(50001), 'u', false), false);
});
const { scoreToMusicXml } = await source('../packages/app/src/lib/score.ts');
test('MusicXML splits notes crossing bar lines with ties and escapes metadata', () => {
  const notes = [3, 2].map((beats, index) => ({
    id: String(index),
    pitch: 60,
    beats,
    part: 'Guitar',
    rest: false,
    chord: index ? 'Dm' : '',
    lyric: '<&',
    accent: false,
  }));
  const xml = scoreToMusicXml({ title: 'A & B', bpm: 120, parts: ['Guitar'], notes, sync: {} });
  assert.match(xml, /<work-title>A &amp; B<\/work-title>/);
  assert.equal((xml.match(/<measure /g) ?? []).length, 2);
  assert.match(xml, /<tie type="start"\/>/);
  assert.match(xml, /<tie type="stop"\/>/);
  assert.match(xml, /<words>Dm<\/words>/);
  assert.match(xml, /<text>&lt;&amp;<\/text>/);
  const measures = [...xml.matchAll(/<measure[^>]*>(.*?)<\/measure>/g)].map((m) =>
    [...m[1].matchAll(/<duration>(\d+)<\/duration>/g)].reduce((sum, n) => sum + Number(n[1]), 0),
  );
  assert.deepEqual(measures, [16, 16]);
});
test('new opinions cannot forge another user’s reaction or reply', () => {
  const row = { id: 'a', authorId: 'u', text: 'Hello', likes: ['v'] };
  assert.equal(canWriteDocument('song/s/discussion', [], [row], 'u', false), false);
  assert.equal(
    canWriteDocument(
      'song/s/discussion',
      [],
      [{ ...row, likes: [], replies: [{ id: 'b', authorId: 'v', text: 'fake' }] }],
      'u',
      false,
    ),
    false,
  );
});
test('invalid calendar dates are rejected without throwing', () => {
  for (const date of ['2026-99-99', '2026-02-30'])
    assert.equal(
      canWriteDocument(
        'rehearsals',
        [],
        [{ id: 'r', date, start: '12:00', end: '13:00' }],
        'u',
        true,
      ),
      false,
    );
});
test('members can edit their own recommendation content but cannot change adoption decisions', () => {
  const old = {
    id: 'r',
    authorId: 'u',
    title: 'Old',
    artist: 'Artist',
    reason: 'a',
    likes: 0,
    votes: 0,
  };
  assert.equal(
    canWriteDocument('recommendations', [old], [{ ...old, title: 'New' }], 'u', false),
    true,
  );
  assert.equal(
    canWriteDocument('recommendations', [old], [{ ...old, deferred: true }], 'u', false),
    false,
  );
});
const {
  normalizeWorkspace,
  setSongPreparation,
  personalSongs,
  personalRehearsals,
  conflictingRehearsals,
} = await source('../packages/app/src/state/workspaceModel.ts');
test('members cannot change rehearsal schedules', () =>
  assert.equal(
    canWriteDocument(
      'rehearsals',
      [],
      [{ id: 'r', date: '2026-10-01', start: '12:00', end: '13:00' }],
      'u',
      false,
    ),
    false,
  ));
test('owners must still provide well formed schedules', () =>
  assert.equal(
    canWriteDocument(
      'rehearsals',
      [],
      [{ id: 'r', date: 'x', start: '13:00', end: '12:00' }],
      'u',
      true,
    ),
    false,
  ));
test('a member may create their own recommendation, but not impersonate another user', () => {
  const row = { id: 'r', title: 'Song', artist: 'Artist', likes: 0, votes: 0, authorId: 'u' };
  assert.equal(canWriteDocument('recommendations', [], [row], 'u', false), true);
  assert.equal(
    canWriteDocument('recommendations', [], [{ ...row, authorId: 'other' }], 'u', false),
    false,
  );
});
test('reactions may only add or remove the current user with the corresponding count', () => {
  const before = {
    id: 'r',
    title: 'Song',
    artist: 'Artist',
    authorId: 'other',
    likes: 1,
    votes: 0,
    likedBy: ['other'],
  };
  assert.equal(
    canWriteDocument(
      'recommendations',
      [before],
      [{ ...before, likes: 2, likedBy: ['other', 'u'] }],
      'u',
      false,
    ),
    true,
  );
  assert.equal(
    canWriteDocument(
      'recommendations',
      [before],
      [{ ...before, likes: 1, likedBy: ['u'] }],
      'u',
      false,
    ),
    false,
  );
  assert.equal(
    canWriteDocument(
      'recommendations',
      [before],
      [{ ...before, likes: 99, likedBy: ['other', 'u'] }],
      'u',
      false,
    ),
    false,
  );
});
test('members cannot remove or edit someone else’s opinion', () => {
  const original = [{ id: '1', authorId: 'other', text: 'original', likes: [], replies: [] }];
  assert.equal(canWriteDocument('song/s/discussion', original, [], 'u', false), false);
  assert.equal(
    canWriteDocument(
      'song/s/discussion',
      original,
      [{ ...original[0], text: 'changed' }],
      'u',
      false,
    ),
    false,
  );
  assert.equal(
    canWriteDocument('song/s/discussion', original, [{ ...original[0], likes: ['u'] }], 'u', false),
    true,
  );
});
test('new replies must identify the requesting author', () => {
  const original = [{ id: '1', authorId: 'other', text: 'original', likes: [], replies: [] }];
  assert.equal(
    canWriteDocument(
      'song/s/discussion',
      original,
      [{ ...original[0], replies: [{ id: '2', authorId: 'u', text: 'reply' }] }],
      'u',
      false,
    ),
    true,
  );
  assert.equal(
    canWriteDocument(
      'song/s/discussion',
      original,
      [{ ...original[0], replies: [{ id: '2', authorId: 'other', text: 'reply' }] }],
      'u',
      false,
    ),
    false,
  );
});
test('members can only change their own attendance', () => {
  assert.equal(canWriteDocument('session/r/members', ['other'], ['other', 'u'], 'u', false), true);
  assert.equal(canWriteDocument('session/r/members', ['other'], ['u'], 'u', false), false);
});
test('members can only change their own preparation', () => {
  const row = {
    id: 's',
    title: 'Song',
    participants: {
      u: { part: 'Bass', status: 'NOT_READY' },
      other: { part: 'Drums', status: 'NOT_READY' },
    },
  };
  assert.equal(
    canWriteDocument(
      'songs',
      [row],
      [{ ...row, participants: { ...row.participants, u: { part: 'Bass', status: 'READY' } } }],
      'u',
      false,
    ),
    true,
  );
  assert.equal(
    canWriteDocument(
      'songs',
      [row],
      [
        {
          ...row,
          participants: { ...row.participants, other: { part: 'Drums', status: 'READY' } },
        },
      ],
      'u',
      false,
    ),
    false,
  );
});
test('duplicate identifiers and malformed collaboration documents are rejected', () => {
  assert.equal(
    canWriteDocument('song/s/checks', [], [{ id: 'same' }, { id: 'same' }], 'u', true),
    false,
  );
  assert.equal(canWriteDocument('session/r/memo', '', 'x'.repeat(50001), 'u', true), false);
  assert.equal(canWriteDocument('unknown', {}, {}, 'u', true), false);
});
const band = () => ({
  id: 'band',
  name: 'Band',
  color: '#123',
  members: [
    { id: 'u', part: 'Bass' },
    { id: 'other', part: 'Drums' },
  ],
  adoptedSongs: [
    {
      id: 'song',
      title: 'Song',
      ready: 0,
      total: 2,
      myPart: 'Bass',
      myStatus: 'NOT_READY',
      participants: {
        u: { part: 'Bass', status: 'NOT_READY' },
        other: { part: 'Drums', status: 'READY' },
      },
    },
  ],
  rehearsals: [],
});
test('preparation uses authenticated identity, is idempotent, and keeps other members unchanged', () => {
  const original = normalizeWorkspace(band(), 'u');
  const changed = setSongPreparation(original, 'song', 'READY', 'u');
  assert.equal(changed.adoptedSongs[0].ready, 2);
  assert.equal(original.adoptedSongs[0].ready, 1);
  assert.equal(changed.adoptedSongs[0].participants.other.status, 'READY');
  assert.equal(setSongPreparation(changed, 'song', 'READY', 'u').adoptedSongs[0].ready, 2);
});
test('removed members no longer inflate readiness totals', () => {
  const original = band();
  original.members = original.members.filter((member) => member.id === 'u');
  const changed = normalizeWorkspace(original, 'u');
  assert.equal(changed.adoptedSongs[0].total, 1);
  assert.equal(changed.adoptedSongs[0].ready, 0);
});
test('personal songs exclude unassigned and archived songs', () => {
  const original = band();
  assert.equal(personalSongs([original], 'missing').length, 0);
  original.adoptedSongs[0].archived = true;
  assert.equal(personalSongs([original], 'u').length, 0);
});
test('cancelled sessions are excluded; adjacent sessions do not conflict', () => {
  const original = band();
  original.rehearsals = [
    { id: 'a', date: '2026-10-01', start: '12:00', end: '13:00' },
    { id: 'b', date: '2026-10-01', start: '13:00', end: '14:00' },
    { id: 'c', date: '2026-10-01', start: '12:00', end: '14:00', cancelled: true },
  ];
  assert.equal(personalRehearsals([original]).length, 2);
  assert.equal(conflictingRehearsals(personalRehearsals([original])).length, 0);
  original.rehearsals[1].start = '12:30';
  assert.equal(conflictingRehearsals(personalRehearsals([original])).length, 2);
});

test('band practice feedback shares time and text while protecting each author', () => {
  const key = 'song/song-1/feedback';
  const note = { id: 'n1', authorId: 'member-a', time: 12.5, text: 'Listen here' };
  assert.equal(isWorkspaceDocumentKey(key), true);
  assert.equal(canWriteDocument(key, [], [note], 'member-a', false), true);
  assert.equal(canWriteDocument(key, [], [note], 'member-b', false), false);
  assert.equal(
    canWriteDocument(
      key,
      [note],
      [note, { ...note, id: 'n2', authorId: 'member-b' }],
      'member-b',
      false,
    ),
    true,
  );
  assert.equal(canWriteDocument(key, [note], [{ ...note, time: 20 }], 'member-b', false), false);
  assert.equal(canWriteDocument(key, [note], [], 'member-b', false), false);
  assert.equal(canWriteDocument(key, [note], [], 'member-a', false), true);
  assert.equal(canWriteDocument(key, [note], [], 'owner', true), true);
  assert.equal(canWriteDocument(key, [], [{ ...note, time: -1 }], 'member-a', false), false);
  assert.equal(canWriteDocument(key, [], [{ ...note, time: Infinity }], 'member-a', false), false);
});
