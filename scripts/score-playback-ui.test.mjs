/* global window, document, requestAnimationFrame, getComputedStyle, performance */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import process from 'node:process';
import console from 'node:console';
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_PACKAGE || 'playwright');
const browser = await chromium.launch({ headless: true, channel: 'msedge' });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('http://127.0.0.1:4182/scripts/score-drums.browser.html?performance-notes=2000');
  await page.waitForFunction(() => !!window.scorePlaybackTest);
  const seek = async (beat, render = true) => {
    await page.evaluate(
      ([beat, render]) => window.scorePlaybackTest.seek(beat, render),
      [beat, render],
    );
    await page.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    );
  };
  const playing = () => page.locator('[data-playing-measure="true"]');
  const lineX = () =>
    page
      .locator('[data-playback-cursor][visibility="visible"]')
      .evaluate((line) => line.transform.baseVal.getItem(0).matrix.e);
  await seek(0.01);
  assert.equal(await playing().count(), 1);
  assert.equal(await playing().getAttribute('aria-label'), '1마디');
  const background = await playing()
    .locator('[data-playback-measure-background]')
    .evaluate((rect) => ({
      fill: getComputedStyle(rect).fill,
      opacity: getComputedStyle(rect).opacity,
      visibility: getComputedStyle(rect).visibility,
      width: rect.width.baseVal.value,
      height: rect.height.baseVal.value,
    }));
  assert.equal(background.fill, 'rgb(250, 204, 21)');
  assert.equal(background.opacity, '0.18');
  assert.equal(background.visibility, 'visible');
  assert.ok(background.width > 50 && background.height > 100);
  assert.equal(await page.locator('[data-playing]').count(), 0);
  assert.equal(
    await page.locator('[data-playback-cursor][visibility="visible"]').getAttribute('stroke'),
    '#52946d',
  );
  assert.equal(
    await page
      .locator('[data-grace-note="perf-0"] ellipse')
      .first()
      .evaluate((node) => getComputedStyle(node).fill),
    'rgb(41, 62, 52)',
  );
  await seek(0.3, false);
  assert.equal(await page.locator('[data-grace-note="perf-0"][data-playing="true"]').count(), 0);
  assert.equal(await page.locator('[data-score-note="perf-1"][data-playing="true"]').count(), 0);
  assert.equal(
    await page
      .locator('[data-score-note="perf-1"] ellipse')
      .first()
      .evaluate((node) => getComputedStyle(node).fill),
    'rgb(41, 62, 52)',
  );
  assert.equal(
    await page
      .locator('[data-tab-rhythm="perf-1"]')
      .evaluate((node) => getComputedStyle(node).stroke),
    'rgb(41, 62, 52)',
  );
  // Adjacent measures share a continuous endpoint, including the leading inset.
  await seek(3.999, false);
  const before = await lineX();
  await seek(4.001, false);
  const after = await lineX();
  assert.ok(after >= before && after - before < 2, `measure transition jumped ${after - before}px`);
  assert.equal(await playing().count(), 1);
  assert.equal(await playing().getAttribute('aria-label'), '2마디');
  // Audio-clock samples animate without a single React commit between beat updates.
  await seek(0.3);
  await page.waitForTimeout(150);
  const frames = await page.evaluate(async () => {
    window.scoreRenderDurations.length = 0;
    const samples = [];
    let previous = performance.now();
    for (let i = 0; i < 60; i++) {
      window.scorePlaybackTest.seek(0.3 + i * 0.002, false);
      await new Promise(requestAnimationFrame);
      const now = performance.now();
      samples.push(now - previous);
      previous = now;
    }
    return { commits: window.scoreRenderDurations.length, samples };
  });
  assert.equal(frames.commits, 0);
  // An offscreen jump/repeat must materialize its row while retaining virtualization.
  await seek(300.2);
  assert.equal(await playing().getAttribute('aria-label'), '76마디');
  assert.equal(await page.locator('[data-playback-cursor][visibility="visible"]').count(), 1);
  const rows = await page.locator('[data-score-system-viewport]').count();
  assert.ok(rows > 50);
  assert.ok((await page.locator('.score-system').count()) < rows / 2);
  await seek(0.3);
  assert.equal(await playing().getAttribute('aria-label'), '1마디');
  if (process.env.SCORE_TEST_OUTPUT)
    await page.locator('.score-system').first().screenshot({ path: process.env.SCORE_TEST_OUTPUT });
  await page.evaluate(() => window.scorePlaybackTest.stop());
  await page.waitForFunction(
    () =>
      document.querySelectorAll(
        '[data-playing], [data-playing-measure], [data-playback-cursor][visibility="visible"]',
      ).length === 0,
  );
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify({
      notes: 2000,
      animationReactCommits: frames.commits,
      medianFrameMs: [...frames.samples].sort((a, b) => a - b)[30],
      measureBoundaryJumpPx: after - before,
      yellowMeasure: background,
      virtualizedRows: rows,
    }),
  );
} finally {
  await browser.close();
}
