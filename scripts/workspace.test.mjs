import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Buffer } from 'node:buffer';
import { URL } from 'node:url';
import test from 'node:test';
import ts from 'typescript';

async function loadTypeScript(path) {
  const source = readFileSync(new URL(path, import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  });
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
}
const { buildAppPath, parseSongTab, songTabs } = await loadTypeScript(
  '../packages/app/src/navigation.ts',
);
test('song deep links preserve band, song and each tab across reloads', () => {
  for (const songTab of songTabs) {
    const path = buildAppPath(
      'song',
      { id: 'same song', workspaceId: 'band b', songTab },
      { route: 'song', workspaceId: 'band a' },
    );
    const url = new URL(path, 'http://localhost');
    assert.equal(url.pathname, '/workspaces/band%20b/songs/same%20song');
    assert.equal(parseSongTab(url.searchParams.get('tab')), songTab);
  }
  assert.equal(parseSongTab('unknown'), 'main');
});
const { personalSongs, personalRehearsals, setSongPreparation } = await loadTypeScript(
  '../packages/app/src/state/workspaceModel.ts',
);
const fixture = () => [
  {
    id: 'a',
    name: 'Band A',
    color: '#123456',
    adoptedSongs: [
      {
        id: 'same-song',
        title: 'Same song',
        ready: 1,
        total: 3,
        status: 'PRACTICING',
        myStatus: 'PRACTICING',
      },
    ],
    recommendations: [{ id: 'not-adopted' }],
    rehearsals: [{ id: 'later', date: '2026-09-20', start: '18:00' }],
  },
  {
    id: 'b',
    name: 'Band B',
    color: '#987654',
    adoptedSongs: [
      {
        id: 'same-song',
        title: 'Same song',
        ready: 2,
        total: 4,
        status: 'PRACTICING',
        myStatus: 'READY',
      },
    ],
    recommendations: [],
    rehearsals: [{ id: 'earlier', date: '2026-09-20', start: '14:00' }],
  },
];
test('personal songs retain band identity even when song IDs are identical', () => {
  const songs = personalSongs(fixture());
  assert.deepEqual(
    songs.map((song) => [song.workspaceId, song.id]),
    [
      ['a', 'same-song'],
      ['b', 'same-song'],
    ],
  );
  assert.equal(
    songs.some((song) => song.id === 'not-adopted'),
    false,
  );
});
test('personal rehearsals sort across bands by actual date and time', () => {
  assert.deepEqual(
    personalRehearsals(fixture()).map((event) => [event.workspaceId, event.id]),
    [
      ['b', 'earlier'],
      ['a', 'later'],
    ],
  );
});
test('preparation updates change only the original band and do not mutate source data', () => {
  const bands = fixture();
  const changed = setSongPreparation(bands[0], 'same-song', 'READY');
  assert.equal(changed.adoptedSongs[0].ready, 2);
  assert.equal(bands[0].adoptedSongs[0].ready, 1);
  assert.equal(bands[1].adoptedSongs[0].ready, 2);
  assert.equal(bands[1].adoptedSongs[0].myStatus, 'READY');
});
test('repeated ready updates are idempotent and can be reversed', () => {
  const first = setSongPreparation(fixture()[0], 'same-song', 'READY');
  const repeated = setSongPreparation(first, 'same-song', 'READY');
  assert.equal(repeated.adoptedSongs[0].ready, 2);
  assert.equal(setSongPreparation(repeated, 'same-song', 'PRACTICING').adoptedSongs[0].ready, 1);
});
test('unknown songs never silently change the first song', () => {
  const original = fixture()[0];
  assert.deepEqual(setSongPreparation(original, 'missing', 'READY'), original);
});
test('personal lists support empty workspaces', () => {
  assert.deepEqual(personalSongs([]), []);
  assert.deepEqual(personalRehearsals([]), []);
});
test('personal song links use the row band instead of the last selected band', () => {
  assert.equal(
    buildAppPath(
      'song',
      { workspaceId: 'a', id: 'same-song' },
      { route: 'personal-songs', workspaceId: 'b' },
    ),
    '/workspaces/a/songs/same-song',
  );
});
test('practice links retain both song and band on reload', () => {
  const path = buildAppPath(
    'personal-practice',
    { id: 'song / 1', workspaceId: 'band 2' },
    { route: 'personal-songs', workspaceId: 'a' },
  );
  const url = new URL(path, 'https://example.test');
  assert.equal(url.pathname, '/me/practice');
  assert.equal(url.searchParams.get('workspaceId'), 'band 2');
  assert.equal(url.searchParams.get('songId'), 'song / 1');
});
test('band switching clears previous entity context', () => {
  assert.equal(
    buildAppPath(
      'home',
      { workspaceId: 'b' },
      { route: 'song', workspaceId: 'a', entityId: 'same-song' },
    ),
    '/workspaces/b',
  );
});
test('practice entered from a song preserves that song and has a return path', () => {
  assert.equal(
    buildAppPath('practice', undefined, { route: 'song', workspaceId: 'b', entityId: 'same-song' }),
    '/workspaces/b/songs/same-song/practice',
  );
  assert.equal(
    buildAppPath('song', undefined, { route: 'practice', workspaceId: 'b', entityId: 'same-song' }),
    '/workspaces/b/songs/same-song',
  );
});
test('a practice link without a selected song opens the song picker', () => {
  assert.equal(
    buildAppPath('practice', undefined, { route: 'home', workspaceId: 'b' }),
    '/me/practice',
  );
});
test('personal home never inherits the band URL', () => {
  assert.equal(
    buildAppPath('personal-home', undefined, {
      route: 'song',
      workspaceId: 'b',
      entityId: 'same-song',
    }),
    '/me',
  );
});
