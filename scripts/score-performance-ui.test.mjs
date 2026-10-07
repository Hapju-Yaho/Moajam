/* global window, requestAnimationFrame, Event */
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
  for (const count of [256, 1024, 2000]) {
    await page.goto(
      `http://127.0.0.1:4182/scripts/score-drums.browser.html?performance-notes=${count}`,
    );
    const editor = page.getByLabel('악보 입력 영역', { exact: true });
    await page
      .locator('[data-score-note="perf-1"] .score-position-cell[aria-label*="3번 줄"] text')
      .click();
    await editor.focus();
    await page.keyboard.press('ArrowRight');
    const durations = async () =>
      page.evaluate(() => {
        const values = [...window.scoreRenderDurations];
        window.scoreRenderDurations.length = 0;
        return values;
      });
    await durations();
    const selection = [],
      edits = [];
    for (let i = 0; i < 3; i++) {
      await editor.focus();
      await page.keyboard.press('ArrowRight');
      await page.evaluate(
        () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
      );
      selection.push(...(await durations()));
      await page.keyboard.press('a');
      edits.push(...(await durations()));
    }
    const state = JSON.parse(await page.getByLabel('악보 데이터').innerText());
    assert.equal(state.notes.length, count);
    assert.equal(state.notes.filter((n) => n.accent).length, 3);
    const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
    console.log(
      JSON.stringify({
        notes: count,
        selectionMs: median(selection),
        editMs: median(edits),
        elements: await page.locator('svg *').count(),
      }),
    );
    if (count === 2000) {
      const rows = page.locator('[data-score-system-viewport]');
      const totalRows = await rows.count();
      assert.ok(totalRows > 50);
      assert.ok((await page.locator('.score-system').count()) < totalRows / 2);
      // Keyboard movement must materialize a previously offscreen destination.
      for (let i = 0; i < 5; i++) {
        await editor.focus();
        await page.keyboard.press('Control+ArrowDown');
      }
      const selected = await page
        .locator('.score-position-cell[aria-pressed="true"]')
        .first()
        .evaluate((cell) => cell.closest('[data-score-note]').getAttribute('data-score-note'));
      assert.ok(Number(selected.replace('perf-', '')) > 100);
      // Scrolling, direct editing at the end, and undo must use fresh data/handlers.
      await rows.last().scrollIntoViewIfNeeded();
      const last = page.locator(
        '[data-score-note="perf-1999"] .score-position-cell[aria-label*="3번 줄"] text',
      );
      await last.click();
      await editor.focus();
      await page.keyboard.press('a');
      assert.equal(
        JSON.parse(await page.getByLabel('악보 데이터').innerText()).notes.at(-1).accent,
        true,
      );
      await page.keyboard.press('Control+z');
      assert.equal(
        JSON.parse(await page.getByLabel('악보 데이터').innerText()).notes.at(-1).accent,
        false,
      );
      await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
      assert.equal(await page.locator('.score-system').count(), totalRows);
      await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
      assert.ok((await page.locator('.score-system').count()) < totalRows / 2);
    }
  }
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
}
