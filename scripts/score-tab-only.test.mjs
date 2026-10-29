import assert from 'node:assert/strict';
import test from 'node:test';
import { URL } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { moduleUrl } from './load-typescript.mjs';

const { GuitarStaff } = await import(
  moduleUrl(new URL('../packages/app/src/components/GuitarStaff.web.tsx', import.meta.url))
);
const score = {
  title: 'TAB',
  bpm: 120,
  parts: ['Guitar'],
  instruments: { Guitar: 'guitar' },
  sync: {},
  notes: [
    {
      id: 'a',
      part: 'Guitar',
      beats: 4,
      pitch: 64,
      rest: false,
      accent: false,
      chord: '',
      lyric: '',
      tones: [{ pitch: 64, string: 1, fret: 0 }],
    },
  ],
};
const render = (data = score, tabOnly = true, rangeIds = []) =>
  renderToStaticMarkup(
    createElement(GuitarStaff, {
      score: data,
      part: 'Guitar',
      selected: 'a',
      hasSelection: true,
      onDeselect() {},
      selectedString: 1,
      cursor: null,
      playbackBeat: null,
      zoom: 100,
      onSelect() {},
      onAppend() {},
      onChordSelect() {},
      emptyBeat: 0,
      inputBeats: 1,
      showTab: true,
      tabOnly,
      rangeIds,
      onRangeSelect() {},
      editable: true,
      layoutWidth: 800,
    }),
  );

test('TAB only omits staff SVG, uses its own coordinates and retains editing/playback targets', () => {
  const tab = render(),
    combined = render(score, false);
  assert.doesNotMatch(tab, /data-staff-tone|data-barline="staff"|줄 시작 음자리표/);
  assert.match(tab, /data-barline="tab"/);
  assert.match(tab, /data-selection-note="a"/);
  assert.match(tab, /data-playback-measure="true"/);
  assert.match(tab, /viewBox="0 0 /);
  assert.match(combined, /data-staff-tone/);
  assert.ok(tab.length < combined.length);
  const stringYs = (html) =>
    [...html.matchAll(/<line x1="45"[^>]*y1="([^"]+)"/g)].map((m) => Number(m[1]));
  assert.equal(stringYs(tab)[1] - stringYs(tab)[0], 16);
  assert.equal(stringYs(combined)[1] - stringYs(combined)[0], 20);

  const high = JSON.parse(JSON.stringify(score));
  high.notes[0].tones[0].pitch = 110;
  const svgSize = (html) => html.match(/<svg[^>]*viewBox="([^"]+)"/)[1];
  assert.equal(svgSize(render(high)), svgSize(tab));
});

test('TAB only retains bends, harmonics, tuplets and grace notes without staff copies', () => {
  const data = JSON.parse(JSON.stringify(score));
  data.notes[0].tones[0].bend = { kind: 'release', amount: 2 };
  let html = render(data);
  assert.equal((html.match(/data-guitar-bend="release"/g) || []).length, 1);
  data.notes[0].pitch = 76;
  data.notes[0].tones[0] = { pitch: 76, string: 1, fret: 12, harmonic: 'natural' };
  html = render(data);
  assert.doesNotMatch(html, /N\.H\./);
  assert.match(html, /&lt;12&gt;/);
  data.notes.unshift({ ...data.notes[0], id: 'grace', beats: 0, graceBeats: 0.25 });
  html = render(data);
  assert.match(html, /data-grace-note="grace"/);
  assert.doesNotMatch(html, /오선 음표|data-staff-tone/);
});

test('TAB-only triplets, repeat bars and slides keep only their TAB notation', () => {
  const data = JSON.parse(JSON.stringify(score));
  const template = data.notes[0];
  data.notes = [0, 1, 2].map((i) => ({ ...template, id: `n${i}`, beats: 1 / 3, tuplet: 3 }));
  let html = render(data);
  assert.match(html, /TAB 셋잇단음표/);
  assert.doesNotMatch(html, /오선 셋잇단음표/);
  data.notes = [{ ...template, slideIn: 'up' }];
  data.repeats = { 0: { start: true, end: true, times: 2 } };
  html = render(data);
  assert.match(html, /data-slide-edge="slideIn"/);
  assert.doesNotMatch(html, /data-staff-tone|data-barline="staff"/);
});

test('palm mute crosses adjacent bar boundaries without an end cap or repeated label', () => {
  const data = JSON.parse(JSON.stringify(score));
  data.notes = Array.from({ length: 8 }, (_, i) => ({
    ...data.notes[0],
    id: `p${i}`,
    beats: 1,
    tones: [{ pitch: 64, string: 1, fret: 0, palmMute: true }],
  }));
  const html = render(data);
  const lines = [...html.matchAll(/data-palm-mute-range="true"[\s\S]*?<path d="([^"]+)"/g)].map(
    (m) => m[1],
  );
  assert.equal(lines.length, 2);
  assert.doesNotMatch(lines[0], /v-5/);
  assert.match(lines[1], /^M0 /);
  assert.match(lines[1], /v-5$/);
  assert.equal((html.match(/P\.M\./g) || []).length, 1);
});

test('TAB region selection hides the single-note cursor box', () => {
  assert.match(render(), /class="score-cell-cursor"/);
  assert.doesNotMatch(render(score, true, ['a']), /class="score-cell-cursor"/);
  assert.match(render(score, true, ['a']), /score-range-highlight/);
});

test('palm mute on a sustained note ends near its fret rather than at the end of its beat duration', () => {
  const data = JSON.parse(JSON.stringify(score));
  data.notes[0].tones[0].palmMute = true;
  const html = render(data);
  const fret = Number(html.match(/data-selection-note="a" x="([^"]+)"/)[1]) + 7;
  const line = html.match(/data-palm-mute-range="true"[\s\S]*?<path d="M([\d.]+) [\d.]+H([\d.]+)v-5/);
  const left = Number(line[1]), right = Number(line[2]);
  assert.ok(left < fret && right > fret);
  assert.ok(right - left < 30);
});
