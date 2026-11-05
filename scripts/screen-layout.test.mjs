import test from 'node:test';
import assert from 'node:assert/strict';
import { URL } from 'node:url';
import { moduleUrl } from './load-typescript.mjs';

const { getScreenLayout } = await import(
  moduleUrl(
    new URL(
      '../packages/app/src/components/shared/layout/main-layout/screenLayout.ts',
      import.meta.url,
    ),
  )
);
const layout = (route, extra = {}) =>
  getScreenLayout({ route, hasSong: false, web: true, ...extra });

test('legacy routes select the menu of their rendered screen', () => {
  assert.equal(layout('recommendations').activeRoute, 'songs');
  assert.equal(layout('tools').activeRoute, 'score-editor');
  assert.equal(layout('practice').activeRoute, 'personal-practice');
  assert.equal(layout('band-score-editor').activeRoute, 'tools');
});

test('song-backed practice and recording routes retain song breadcrumbs', () => {
  for (const route of ['practice', 'track-editor']) {
    assert.deepEqual(layout(route, { entityId: 'creep', hasSong: true }), {
      activeRoute: 'song',
      entityId: 'creep',
      songTab: 'tracks',
      hideSyncControls: true,
    });
  }
  assert.equal(layout('track-editor').activeRoute, 'track-editor');
});

test('legacy song tabs use the same breadcrumb as their visible tab', () => {
  for (const [songTab, expected] of [
    ['resources', 'scores'],
    ['practice', 'tracks'],
    ['history', 'overview'],
  ]) {
    assert.equal(layout('song', { entityId: 'creep', hasSong: true, songTab }).songTab, expected);
  }
});

test('missing songs keep the fallback screen sync controls and no stale song metadata', () => {
  assert.deepEqual(layout('song', { entityId: 'missing', songTab: 'scores' }), {
    activeRoute: 'song',
    entityId: undefined,
    songTab: undefined,
    hideSyncControls: false,
  });
});

test('only the web personal practice screen owns its sync controls', () => {
  assert.equal(layout('personal-practice').hideSyncControls, true);
  assert.equal(layout('personal-practice', { web: false }).hideSyncControls, false);
  assert.equal(layout('practice').hideSyncControls, undefined);
});
