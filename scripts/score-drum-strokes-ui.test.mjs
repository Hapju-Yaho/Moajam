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
  const button = (name) => page.getByRole('button', { name, exact: true });
  const key = async (value) => {
    await page.getByLabel('악보 입력 영역', { exact: true }).focus();
    await page.keyboard.press(value);
  };
  for (const voice of [1, 2]) {
    for (const duration of ['4분음표', '16분음표', '32분음표']) {
      await page.goto(`${process.env.SCORE_TEST_URL}/scripts/score-drums.browser.html`);
      await key(`Control+${voice}`);
      await page.getByLabel('드럼 입력 위치', { exact: true }).selectOption('97');
      await button(duration === '32분음표' ? '32분음표 · 1/8박' : duration).click();
      for (const technique of ['더블 스트로크', '사선 2개', '사선 3개', '버즈 롤']) {
        await button(technique).click();
        await key('Enter');
        await key('ArrowRight');
      }
      const marks = await page
        .locator('.score-system [data-staff-tone] [data-drum-roll]')
        .evaluateAll((nodes) =>
          nodes.map((node) => {
            const tone = node.closest('[data-staff-tone]');
            const stem = tone.querySelector('[data-stem-direction]');
            const box = node.getBBox();
            return {
              type: node.dataset.drumRoll,
              x: box.x,
              y: box.y,
              width: box.width,
              height: box.height,
              stemX: Number(stem.getAttribute('x1')),
              base: Number(stem.getAttribute('y1')),
              end: Number(stem.getAttribute('y2')),
            };
          }),
        );
      assert.equal(marks.length, 4);
      for (const mark of marks) {
        const top = Math.min(mark.base, mark.end),
          bottom = Math.max(mark.base, mark.end);
        assert.ok(Math.abs(mark.x + mark.width / 2 - mark.stemX) < 0.1, 'centered on stem');
        assert.ok(
          mark.y > top + 3 && mark.y + mark.height < bottom - 3,
          'inside stem with clearance',
        );
        const levels = duration === '16분음표' ? 2 : duration === '32분음표' ? 3 : 0;
        if (levels) {
          const innerBeam = mark.end + (voice === 1 ? 1 : -1) * (levels - 1) * 7;
          assert.ok(
            voice === 1 ? mark.y > innerBeam + 3 : mark.y + mark.height < innerBeam - 3,
            'clear of innermost beam',
          );
        }
      }
      if (process.env.SCORE_TEST_OUTPUT)
        await page.locator('.score-systems').screenshot({
          path: `${process.env.SCORE_TEST_OUTPUT}/drum-strokes-${voice}-${duration}.png`,
        });
    }
  }
  assert.deepEqual(errors, []);
  console.log(
    'PASS: stroke/buzz marks centered on up/down stems, quarter/16th/32nd notes, clear of beams',
  );
} finally {
  await browser.close();
}
