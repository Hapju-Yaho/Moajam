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
  assert.equal(url.pathname, '/workspaces/band%202/songs/song%20%2F%201');
  assert.equal(url.searchParams.get('tab'), 'tracks');
});
test('workshop menu opens blank recording and the practice song picker without inheriting a song', () => {
  const context = { route: 'song', workspaceId: 'band', entityId: 'old-song' };
  assert.equal(buildAppPath('track-editor', undefined, context), '/tools/tracks');
  assert.equal(buildAppPath('personal-practice', undefined, context), '/me/practice');
  assert.equal(
    buildAppPath('personal-practice', { id: 'chosen', workspaceId: 'other' }, context),
    '/workspaces/other/songs/chosen?tab=tracks',
  );
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
    '/workspaces/b/songs/same-song?tab=tracks',
  );
  assert.equal(
    buildAppPath('song', undefined, { route: 'practice', workspaceId: 'b', entityId: 'same-song' }),
    '/workspaces/b/songs/same-song',
  );
});
test('a practice link without a selected song opens music tools', () => {
  assert.equal(buildAppPath('practice', undefined, { route: 'home', workspaceId: 'b' }), '/tools');
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

test('feedback links retain the selected band and song and target the feedback section', () => {
  assert.equal(
    buildAppPath(
      'practice',
      { id: 'song-a', workspaceId: 'band-a', feedback: true },
      { route: 'song', workspaceId: 'band-b' },
    ),
    '/workspaces/band-a/songs/song-a?tab=tracks&feedback=true',
  );
});

test('tool links retain explicit band/song context and return to the correct detail tab', () => {
  const context = { route: 'song', workspaceId: 'other band', entityId: 'other song' };
  for (const [route, pathname] of [
    ['band-score-editor', '/workspaces/band%20%2F%20a/songs/song%20%2F%20b/score'],
    ['track-editor', '/tools/tracks'],
    ['score-editor', '/tools/scores/personal'],
  ]) {
    const url = new URL(
      buildAppPath(route, { workspaceId: 'band / a', id: 'song / b' }, context),
      'https://example.test',
    );
    assert.equal(url.pathname, pathname);
    if (route !== 'band-score-editor') {
      assert.equal(url.searchParams.get('workspaceId'), 'band / a');
      assert.equal(url.searchParams.get('songId'), 'song / b');
    }
    const back = new URL(
      buildAppPath(
        'song',
        {
          workspaceId:
            route === 'band-score-editor'
              ? decodeURIComponent(url.pathname.split('/')[2])
              : url.searchParams.get('workspaceId'),
          id:
            route === 'band-score-editor'
              ? decodeURIComponent(url.pathname.split('/')[4])
              : url.searchParams.get('songId'),
          songTab: route === 'track-editor' ? 'tracks' : 'scores',
        },
        { route, workspaceId: 'other' },
      ),
      'https://example.test',
    );
    assert.equal(back.pathname, '/workspaces/band%20%2F%20a/songs/song%20%2F%20b');
    assert.equal(back.searchParams.get('tab'), route === 'track-editor' ? 'tracks' : 'scores');
  }
});

test('tool picker clears the previous edit target and personal work stays separate', () => {
  const context = { route: 'track-editor', workspaceId: 'band', entityId: 'song' };
  assert.equal(buildAppPath('track-editor', undefined, context), '/tools/tracks');
  assert.equal(buildAppPath('tools', undefined, context), '/tools');
  assert.equal(buildAppPath('score-editor', undefined, context), '/tools/scores/personal');
});

test('score viewer opens the selected part and retains expanded view on reload', () => {
  const path = buildAppPath(
    'band-score-editor',
    { id: 'song', workspaceId: 'band', scorePart: 'Bass / 베이스', scoreView: 'expanded' },
    { route: 'song', workspaceId: 'other' },
  );
  const url = new URL(path, 'https://example.test');
  assert.equal(url.searchParams.get('part'), 'Bass / 베이스');
  assert.equal(url.searchParams.get('view'), 'expanded');
});

test('notification deep links retain exact opinion, PDF and track timestamp targets', () => {
  const url = new URL(
    buildAppPath(
      'song',
      {
        workspaceId: 'band',
        id: 'song',
        songTab: 'tracks',
        focusId: 'feedback-1',
        focusTime: 42.5,
        projectId: 'project-1',
        assetId: 'pdf-1',
        feedback: true,
      },
      { route: 'song', workspaceId: 'band' },
    ),
    'http://localhost',
  );
  assert.equal(url.searchParams.get('focus'), 'feedback-1');
  assert.equal(url.searchParams.get('at'), '42.5');
  assert.equal(url.searchParams.get('project'), 'project-1');
  assert.equal(url.searchParams.get('asset'), 'pdf-1');
  assert.equal(url.searchParams.get('tab'), 'tracks');
  for (const focusTime of [-1, NaN, Infinity]) {
    const invalid = new URL(
      buildAppPath(
        'song',
        { id: 'song', workspaceId: 'band', focusTime },
        { route: 'song', workspaceId: 'band' },
      ),
      'http://localhost',
    );
    assert.equal(invalid.searchParams.has('at'), false);
  }
});
