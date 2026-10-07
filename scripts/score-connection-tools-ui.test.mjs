/* global document, OfflineAudioContext */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import process from 'node:process';
import console from 'node:console';
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_PACKAGE || 'playwright');
const browser = await chromium.launch({ headless: true, channel: 'msedge' });
try {
  const page = await browser.newPage({ viewport: { width: 1380, height: 1050 } }),
    errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const button = (name) => page.getByRole('button', { name, exact: true });
  const state = async () => JSON.parse(await page.getByLabel('악보 데이터').innerText());
  const key = async (value) => {
    await page.getByLabel('악보 입력 영역', { exact: true }).focus();
    await page.keyboard.press(value);
  };
  const setup = async (instrument) => {
    await page.goto(
      `${process.env.SCORE_TEST_URL || 'http://127.0.0.1:4182'}/scripts/score-drums.browser.html`,
    );
    await button('악보 설정').click();
    await page.getByLabel('파트 악기와 튜닝', { exact: true }).selectOption(instrument);
    await button('음표·주법').click();
  };
  await setup('bass');
  await key('3');
  await key('ArrowRight');
  await button('리듬 슬래시 입력').click();
  let score = await state();
  assert.equal(score.notes[1].slash, true);
  assert.equal(score.notes[1].pitch, score.notes[0].pitch);
  assert.ok(await page.locator('[data-rhythm-slash="true"]').count());
  await setup('guitar');
  await key('0');
  await key('ArrowRight');
  await page.getByLabel('입력할 줄', { exact: true }).selectOption('2');
  await key('7');
  await key('ArrowLeft');
  await button('시프트 슬라이드').click();
  const techniqueRow = page.getByRole('group', { name: '주법', exact: true });
  const connectionRow = page.getByRole('group', { name: '연결', exact: true });
  assert.ok((await connectionRow.boundingBox()).y > (await techniqueRow.boundingBox()).y);
  assert.deepEqual(
    (await connectionRow.getByRole('button').allTextContents()).slice(0, 2).map((s) => s.trim()),
    ['붙임줄', '이음줄(슬러)'],
  );
  assert.equal(await button('붙임줄').locator('[data-tie-continuation]').count(), 1);
  assert.equal(await button('레가토 슬라이드').locator('[data-legato-arc]').count(), 1);
  assert.equal(await button('시프트 슬라이드').locator('[data-legato-arc]').count(), 0);
  assert.equal(await button('슬라이드').count(), 0);
  assert.equal(await button('지판 슬라이드').count(), 0);
  await button('레가토 슬라이드').click();
  assert.equal((await state()).notes[0].connection.type, 'slide');
  assert.equal(await page.getByLabel('레가토 슬라이드 사선', { exact: true }).count(), 2);
  assert.equal(
    await page.locator('[aria-label="레가토 슬라이드 연결"] text').first().textContent(),
    'sl.',
  );
  if (process.env.SCORE_TEST_OUTPUT)
    await page
      .locator('.score-editor-tools-host')
      .screenshot({ path: `${process.env.SCORE_TEST_OUTPUT}/legato-slide.png` });
  await button('레가토 슬라이드').click();
  await button('시프트 슬라이드').click();
  score = await state();
  assert.equal(score.notes[0].connection.type, 'glissando');
  assert.notEqual(score.notes[0].tones[0].string, score.notes[1].tones[0].string);
  assert.equal(await page.getByLabel('시프트 슬라이드 사선', { exact: true }).count(), 2);
  await button('시프트 슬라이드').click();
  for (const edge of ['인', '아웃'])
    for (const direction of ['위로', '아래로']) {
      const b = button(`슬라이드 ${edge} ${direction}`);
      await b.click();
      assert.equal(
        (await state()).notes[0][edge === '인' ? 'slideIn' : 'slideOut'],
        direction === '위로' ? 'up' : 'down',
      );
      assert.equal(
        await page
          .locator(`[data-slide-edge="${edge === '인' ? 'slideIn' : 'slideOut'}"] path`)
          .count(),
        2,
      );
      assert.equal(await b.locator('svg[data-connection-icon]').count(), 1);
      await b.click();
    }
  assert.equal(await button('이음줄(슬러)').locator('[data-connection-icon="slur"]').count(), 1);
  assert.equal(await button('붙임줄').locator('[data-connection-icon="tie"]').count(), 1);
  assert.equal(
    await button('해머링·풀링 (H/P)').locator('[data-connection-icon="hammerPull"]').count(),
    1,
  );
  await button('슬라이드 인 위로').click();
  await button('슬라이드 아웃 아래로').click();
  if (process.env.SCORE_TEST_OUTPUT)
    await page
      .locator('.score-editor-tools-host')
      .screenshot({ path: `${process.env.SCORE_TEST_OUTPUT}/connections-and-slides.png` });
  const checks = await page.evaluate(async () => {
    const m = await import('/packages/app/src/lib/score.ts');
    const { scoreFromMusicXml } = await import('/packages/app/src/lib/scoreImport.web.ts');
    const { scheduleScorePassage } = await import('/packages/app/src/lib/scoreAudio.web.ts');
    const score = JSON.parse(document.querySelector('[aria-label="악보 데이터"]').textContent);
    const restored = scoreFromMusicXml(m.scoreToMusicXml(score));
    const base = {
      ...score,
      notes: score.notes.map((n, i) => ({
        ...n,
        pitch: 64,
        tones: [{ pitch: 64, string: 1, fret: 0 }],
        slideIn: undefined,
        slideOut: undefined,
        connection: undefined,
        slurTo: undefined,
        id: `test-${i}`,
      })),
    };
    const slur = m.setScoreSlur(base, ['test-0', 'test-1']),
      tie = m.setScoreConnection(base, ['test-0', 'test-1'], 'tie');
    const render = async (input) => {
      const context = new OfflineAudioContext(1, 44100 * 2, 44100),
        create = context.createOscillator.bind(context);
      let attacks = 0;
      const frequencies = [];
      context.createOscillator = () => {
        attacks++;
        const node = create();
        const set = node.frequency.setValueAtTime.bind(node.frequency);
        node.frequency.setValueAtTime = (v, t) => {
          frequencies.push(v);
          return set(v, t);
        };
        return node;
      };
      scheduleScorePassage(context, context.destination, input, input.parts[0], 0, 0, 2);
      const pcm = (await context.startRendering()).getChannelData(0);
      return {
        attacks,
        frequencies,
        rms: Math.sqrt(pcm.reduce((sum, v) => sum + v * v, 0) / pcm.length),
      };
    };
    const up = await render(m.setScoreSlideIn(base, ['test-0'], 'up')),
      down = await render(m.setScoreSlideIn(base, ['test-0'], 'down'));
    const ascending = {
      ...base,
      notes: base.notes.map((n, i) => ({
        ...n,
        pitch: 64 + i * 2,
        tones: [{ pitch: 64 + i * 2, string: 1, fret: i * 2 }],
      })),
    };
    const slides = [];
    for (const type of ['slide', 'glissando']) {
      const connected = m.setScoreConnection(ascending, ['test-0', 'test-1'], type);
      slides.push({
        audio: await render(connected),
        restored: scoreFromMusicXml(m.scoreToMusicXml(connected)).notes[0].connection.type,
      });
    }
    return {
      slides,
      restored: restored.notes[0],
      slurGhost: slur.notes.some((n) => m.noteTones(n).some((t) => t.ghost)),
      slur: await render(slur),
      tie: await render(tie),
      up,
      down,
    };
  });
  assert.equal(checks.restored.slideIn, 'up');
  assert.deepEqual(
    checks.slides.map((s) => s.audio.attacks),
    [1, 2],
  );
  assert.deepEqual(
    checks.slides.map((s) => s.restored),
    ['slide', 'glissando'],
  );
  assert.equal(checks.restored.slideOut, 'down');
  assert.equal(checks.slurGhost, false);
  assert.ok(
    checks.slur.attacks > checks.tie.attacks,
    'only ties merge repeated pitches into one attack',
  );
  assert.ok(
    checks.up.frequencies[0] < checks.down.frequencies[0],
    'entry slides start on opposite sides of the written pitch',
  );
  assert.ok(checks.up.rms > 0.001 && checks.down.rms > 0.001);
  await page.setViewportSize({ width: 390, height: 950 });
  await page.mouse.move(0, 0);
  if (process.env.SCORE_TEST_OUTPUT)
    await page.screenshot({
      path: process.env.SCORE_TEST_OUTPUT + '/connection-mobile.png',
      fullPage: true,
    });
  assert.equal(
    await page.locator('.guitar-editor').evaluate((e) => e.scrollWidth <= e.clientWidth + 1),
    true,
  );
  assert.deepEqual(errors, []);
  console.log(
    'PASS: bass slash entry, cross-string glissando, four slide icons/notation/XML/audio, and independent slur/tie attacks',
  );
} finally {
  await browser.close();
}
