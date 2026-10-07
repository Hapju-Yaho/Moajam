/* global document */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import process from 'node:process';
import console from 'node:console';
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_PACKAGE || 'playwright');
const browser = await chromium.launch({ headless: true, channel: 'msedge' });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 1050 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(
    `${process.env.SCORE_TEST_URL || 'http://127.0.0.1:4182'}/scripts/score-drums.browser.html`,
  );
  await page.getByRole('button', { name: '악보 설정', exact: true }).click();
  await page.getByLabel('파트 악기와 튜닝', { exact: true }).selectOption('guitar');
  await page.getByRole('button', { name: '음표·주법', exact: true }).click();
  const state = async () => JSON.parse(await page.getByLabel('악보 데이터').innerText());
  const key = async (k) => {
    await page.getByLabel('악보 입력 영역', { exact: true }).focus();
    await page.keyboard.press(k);
  };
  await page.getByLabel('입력할 줄', { exact: true }).selectOption('1');
  await key('1');
  await key('2');
  await key('ArrowRight');
  await key('1');
  await key('4');
  await key('ArrowRight');
  await key('1');
  await key('0');
  await key('ArrowLeft');
  await key('ArrowLeft');
  await key('g');
  assert.deepEqual(
    (await state()).notes.map((n) => n.beats),
    [0, 1, 1],
  );
  await key('j');
  assert.equal((await state()).notes[0].connection.type, 'slide');
  await key('s');
  await key('x');
  assert.equal((await state()).notes[0].staccato, true);
  assert.equal((await state()).notes[0].tones[0].dead, true);
  assert.equal((await state()).notes[0].connection.type, 'slide');
  await key('x');
  await key('s');
  await key('ArrowRight');
  await key('s');
  assert.equal((await state()).notes[1].staccato, true);
  await key('s');
  await key('ArrowLeft');
  assert.equal(
    await page
      .getByRole('button', { name: '꾸밈음 (박자 제외)', exact: true })
      .getAttribute('aria-pressed'),
    'true',
  );
  assert.equal(await page.locator('[data-grace-note]').count(), 1);
  assert.equal(await page.locator('[data-tab-rhythm]').count(), 2);
  // Select the actual glyph with the mouse, without forcing through another note's hit area.
  const graceId = (await state()).notes[0].id;
  for (const surface of ['tab', 'staff']) {
    await key('ArrowRight');
    const glyph =
      surface === 'tab'
        ? page
            .getByRole('button', { name: '꾸밈음 1번 줄 12프렛', exact: true })
            .locator('text')
            .first()
        : page
            .getByRole('button', { name: `꾸밈음 ${graceId} 오선 음표`, exact: true })
            .locator('ellipse')
            .first();
    await glyph.click();
    assert.equal(
      await page
        .getByRole('button', { name: '꾸밈음 (박자 제외)', exact: true })
        .getAttribute('aria-pressed'),
      'true',
    );
    await key('s');
    assert.equal((await state()).notes[0].staccato, true);
    assert.ok(!(await state()).notes[1].staccato);
    await key('s');
  }
  const checked = await page.evaluate(async () => {
    const score = JSON.parse(document.querySelector('[aria-label="악보 데이터"]').textContent);
    const { scoreToMusicXml } = await import('/packages/app/src/lib/score.ts');
    const { scoreFromMusicXml } = await import('/packages/app/src/lib/scoreImport.web.ts');
    const { scheduleScorePassage } = await import('/packages/app/src/lib/scoreAudio.web.ts');
    const xml = scoreFromMusicXml(scoreToMusicXml(score));
    const voices = [];
    const param = () => ({
      setValueAtTime(value, time) {
        this.events.push({ value, time, ramp: false });
      },
      linearRampToValueAtTime(value, time) {
        this.events.push({ value, time, ramp: true });
      },
      exponentialRampToValueAtTime() {},
      events: [],
    });
    const context = {
      createGain() {
        return {
          gain: param(),
          connect() {
            return this;
          },
          disconnect() {},
        };
      },
      createOscillator() {
        const voice = {
          frequency: param(),
          type: 'triangle',
          connect() {
            return this;
          },
          disconnect() {},
          start(time) {
            this.startTime = time;
          },
          stop(time) {
            this.stopTime = time;
          },
        };
        voices.push(voice);
        return voice;
      },
    };
    scheduleScorePassage(context, {}, score, 'Drums', 0, 0, 2);
    return {
      notes: xml.notes.filter((n) => !n.rest),
      voices: voices.map((v) => ({
        start: v.startTime,
        stop: v.stopTime,
        points: v.frequency.events,
      })),
      bpm: score.bpm,
    };
  });
  assert.equal(checked.notes.length, 3);
  assert.deepEqual(
    checked.notes.map((n) => n.beats),
    [0, 1, 1],
  );
  assert.equal(checked.notes[0].graceBeats, 1);
  assert.equal(checked.notes[0].connection.type, 'slide');
  assert.equal(checked.voices.length, 2);
  assert.equal(checked.voices[0].start, 0);
  assert.ok(
    checked.voices[0].points.some(
      (p) => p.ramp && Math.abs(p.value - 440 * 2 ** ((78 - 69) / 12)) < 0.01,
    ),
  );
  assert.equal(checked.voices[1].start, 60 / checked.bpm);
  if (process.env.SCORE_TEST_OUTPUT)
    await page
      .locator('.score-systems')
      .screenshot({ path: `${process.env.SCORE_TEST_OUTPUT}/guitar-grace-slide-preview.png` });
  await key('g');
  assert.deepEqual(
    (await state()).notes.map((n) => n.beats),
    [1, 1, 1],
  );
  await key('Control+z');
  assert.deepEqual(
    (await state()).notes.map((n) => n.beats),
    [0, 1, 1],
  );
  await key('h');
  assert.equal((await state()).notes[0].connection.type, 'hammer');
  await key('Delete');
  assert.deepEqual(
    (await state()).notes.map((n) => n.beats),
    [1, 1],
  );
  // A dense bar with a grace note between eighth notes: beams stay compact and the
  // grace remains clickable even when the preceding note has a wide hit region.
  await page.reload();
  await page.getByRole('button', { name: '악보 설정', exact: true }).click();
  await page.getByLabel('파트 악기와 튜닝', { exact: true }).selectOption('guitar');
  await page.getByRole('button', { name: '음표·주법', exact: true }).click();
  await page.getByLabel('입력할 줄', { exact: true }).selectOption('3');
  await page.getByRole('button', { name: '8분음표', exact: true }).click();
  for (let i = 0; i < 9; i++) {
    await key('1');
    await key(i === 3 ? '2' : '0');
    if (i < 8) await key('ArrowRight');
  }
  for (let i = 0; i < 5; i++) await key('ArrowLeft');
  await page.getByRole('button', { name: '꾸밈음 (박자 제외)', exact: true }).click();
  await key('h');
  await key('ArrowRight');
  await page
    .getByRole('button', { name: '꾸밈음 3번 줄 12프렛', exact: true })
    .locator('text')
    .first()
    .click();
  assert.equal(
    await page
      .getByRole('button', { name: '꾸밈음 (박자 제외)', exact: true })
      .getAttribute('aria-pressed'),
    'true',
  );
  assert.equal(await page.locator('[data-tab-beam]').count(), 4);
  assert.equal(await page.locator('[data-tab-rhythm] path').count(), 0);
  assert.equal(await page.locator('[data-tab-rhythm]').count(), 8);
  const spacing = await page.locator('[data-grace-note]').evaluate((grace) => {
    const small = grace.querySelector('[aria-label*="프렛"] text');
    const main = grace.parentElement.querySelectorAll('[data-tab-rhythm] line')[3];
    return Number(main.getAttribute('x1')) - Number(small.getAttribute('x'));
  });
  assert.equal(spacing, 16);
  // A rest before an eighth note must leave a proper standalone flag, not a
  // detached curve; neighboring beamed notes retain stems attached to frets.
  for (let i = 0; i < 3; i++) await key('ArrowLeft');
  await key('r');
  const tabFlag = page.locator('[data-tab-rhythm] [data-note-flags] path');
  assert.equal(await tabFlag.count(), 1);
  assert.equal(await tabFlag.getAttribute('d'), 'M0 0q12 -7 6 -15');
  if (process.env.SCORE_TEST_OUTPUT)
    await page
      .locator('.score-systems')
      .screenshot({ path: `${process.env.SCORE_TEST_OUTPUT}/guitar-tab-beams-grace.png` });
  // Low-string techniques used to follow the string height and collide with
  // down-stems. The staff has up-stems here, so it must choose the other side.
  await page.reload();
  await page.getByRole('button', { name: '악보 설정', exact: true }).click();
  await page.getByLabel('파트 악기와 튜닝', { exact: true }).selectOption('guitar');
  await page.getByRole('button', { name: '음표·주법', exact: true }).click();
  await page.getByLabel('입력할 줄', { exact: true }).selectOption('6');
  await page.getByRole('button', { name: '8분음표', exact: true }).click();
  await key('2');
  await key('ArrowRight');
  await key('4');
  await key('ArrowLeft');
  for (const technique of ['h', 'j']) {
    await key(technique);
    assert.equal(
      await page
        .getByLabel(technique === 'h' ? 'H TAB 연결' : 'TAB 연결 곡선', { exact: true })
        .getAttribute('data-connection-side'),
      'above',
    );
    assert.equal(
      await page
        .getByLabel(technique === 'h' ? 'H 오선 연결' : '오선 연결 곡선', { exact: true })
        .getAttribute('data-connection-side'),
      'below',
    );
  }
  await key('l');
  assert.equal(
    await page.getByLabel('TAB 이음줄(슬러)', { exact: true }).getAttribute('data-connection-side'),
    'above',
  );
  if (process.env.SCORE_TEST_OUTPUT)
    await page
      .locator('.score-systems')
      .screenshot({ path: `${process.env.SCORE_TEST_OUTPUT}/guitar-connection-directions.png` });
  await key('l');
  await key('g');
  const graceLinks = page.locator('[data-grace-note] [data-connection-side]');
  assert.equal(await graceLinks.count(), 2);
  assert.deepEqual(
    await graceLinks.evaluateAll((items) =>
      items.map((el) => el.getAttribute('data-connection-side')),
    ),
    ['below', 'below'],
  );
  const clearance = await graceLinks
    .last()
    .locator('path')
    .first()
    .evaluate((el) => {
      const link = el.getBoundingClientRect();
      const stem = document.querySelector('[data-tab-rhythm] line').getBoundingClientRect();
      return stem.left - link.right;
    });
  assert.ok(clearance > 3, 'grace link ends before the next down-stem');
  if (process.env.SCORE_TEST_OUTPUT)
    await page.locator('.score-systems').screenshot({
      path: `${process.env.SCORE_TEST_OUTPUT}/guitar-grace-connection-clearance.png`,
    });
  await page.reload();
  await page.getByRole('button', { name: '악보 설정', exact: true }).click();
  await page.getByLabel('파트 악기와 튜닝', { exact: true }).selectOption('guitar');
  await page.getByRole('button', { name: '음표·주법', exact: true }).click();
  await page.getByLabel('입력할 줄', { exact: true }).selectOption('3');
  await page.getByRole('button', { name: '8분음표', exact: true }).click();
  for (let i = 0; i < 4; i++) {
    await key('1');
    await key('0');
    await key('ArrowRight');
  }
  await page.getByRole('button', { name: '2분음표', exact: true }).click();
  await key('1');
  await key('0');
  assert.deepEqual(
    (await state()).notes.map((n) => n.beats),
    [0.5, 0.5, 0.5, 0.5, 2],
  );
  const measured = await page.locator('.score-systems').evaluate((root) => {
    const stems = [...root.querySelectorAll('[data-tab-rhythm] line')];
    const xs = stems.map((stem) => stem.getBoundingClientRect().left);
    const scale = stems[0].getScreenCTM().a;
    const barline = root.querySelector('[data-barline="tab"]').getBoundingClientRect().left;
    const svg = root.querySelector('svg').getBoundingClientRect();
    return {
      ratio: (barline - xs[4] - 16 * scale) / (xs[1] - xs[0]),
      first: (xs[0] - svg.left) / scale,
    };
  });
  assert.ok(Math.abs(measured.ratio - 4) < 0.02);
  assert.ok(measured.first < 90, 'first note has a compact clef/meter prefix');
  if (process.env.SCORE_TEST_OUTPUT)
    await page
      .locator('.score-systems')
      .screenshot({ path: `${process.env.SCORE_TEST_OUTPUT}/guitar-proportional-spacing.png` });
  assert.deepEqual(errors, []);
  console.log(
    'PASS: independent grace note, S/H, staccato/dead, keyboard selection, TAB stems, one-beat timing, XML, restore/undo/delete',
  );
} finally {
  await browser.close();
}
