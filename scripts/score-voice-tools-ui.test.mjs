/* global getComputedStyle */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import process from 'node:process';
import console from 'node:console';
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_PACKAGE || 'playwright');
const browser = await chromium.launch({ headless: true, channel: 'msedge' });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const button = (name) => page.getByRole('button', { name, exact: true });
  const key = async (k) => {
    await page.getByLabel('악보 입력 영역', { exact: true }).focus();
    await page.keyboard.press(k);
  };
  const state = async () => JSON.parse(await page.getByLabel('악보 데이터').innerText());
  for (const instrument of ['drums', 'piano']) {
    await page.goto(
      `${process.env.SCORE_TEST_URL || 'http://127.0.0.1:4182'}/scripts/score-drums.browser.html`,
    );
    await button('악보 설정').click();
    await page.getByLabel('파트 악기와 튜닝', { exact: true }).selectOption(instrument);
    await button('음표·주법').click();
    const controls = page.getByRole('region', { name: '악보 성부 선택' });
    const upper = button(instrument === 'drums' ? '위 성부 · 손' : '오른손 성부'),
      lower = button(instrument === 'drums' ? '아래 성부 · 발' : '왼손 성부');
    const pressed = () =>
      controls
        .getByRole('button')
        .evaluateAll((nodes) => nodes.map((n) => n.getAttribute('aria-pressed')));
    assert.equal(
      await page
        .locator('.score-edit-toolbar')
        .getByRole('region', { name: '악보 성부 선택' })
        .count(),
      1,
    );
    assert.equal(await page.locator('.score-voice-bar').count(), 0);
    assert.equal(await page.getByLabel('다른 성부 진하기', { exact: true }).count(), 0);
    assert.equal(await controls.locator('[data-voice-icon]').count(), 2);
    assert.deepEqual(await pressed(), ['true', 'false']);
    await upper.click();
    assert.deepEqual(await pressed(), ['true', 'false'], 'last enabled voice cannot be turned off');
    await lower.click();
    assert.deepEqual(await pressed(), ['true', 'true']);
    await upper.click();
    assert.deepEqual(await pressed(), ['false', 'true']);
    await lower.click();
    assert.deepEqual(await pressed(), ['false', 'true']);
    await key('1');
    const paired = (await state()).drumVoices?.Drums ?? (await state()).keyboardStaves.Drums;
    assert.ok((await state()).notes.some((n) => n.part === paired && !n.rest && !n.blank));
    await upper.click();
    assert.deepEqual(await pressed(), ['true', 'true']);
    await lower.click();
    assert.deepEqual(await pressed(), ['true', 'false']);
    await key('1');
    if (instrument === 'drums')
      assert.equal(
        await page.locator('[data-drum-voice="lower"]').first().getAttribute('opacity'),
        '0.3',
      );
    else
      assert.deepEqual(
        await page
          .locator('.score-ensemble-staff')
          .evaluateAll((nodes) =>
            nodes.map((n) => getComputedStyle(n.querySelector('.score-systems')).opacity),
          ),
        ['1', '0.3'],
      );
    await key('Control+m');
    assert.deepEqual(await pressed(), ['true', 'true']);
    await key('Control+2');
    assert.deepEqual(await pressed(), ['false', 'true']);
    for (const tab of ['마디·표현', '악보 설정', '음표·주법']) {
      await button(tab).click();
      assert.equal(await controls.isVisible(), true);
    }
    await page.setViewportSize({ width: 390, height: 950 });
    assert.equal(
      await page
        .locator('.score-editor-tools-host')
        .evaluate((e) => e.scrollWidth <= e.clientWidth + 1),
      true,
    );
    await page.setViewportSize({ width: 1280, height: 1000 });
    if (process.env.SCORE_TEST_OUTPUT)
      await page
        .locator('.score-edit-toolbar')
        .screenshot({ path: `${process.env.SCORE_TEST_OUTPUT}/voice-tools-${instrument}.png` });
  }
  await page.goto(
    `${process.env.SCORE_TEST_URL || 'http://127.0.0.1:4182'}/scripts/score-expanded.browser.html`,
  );
  await button('Drums').click();
  await button('아래 성부 · 발').click();
  for (const expanded of [false, true]) {
    if (expanded) await button('악보 크게 보기').click();
    const voices = page.getByRole('region', { name: '악보 성부 선택' });
    const v = await voices.boundingBox(),
      views = await page.getByRole('group', { name: '악보 보기 방식', exact: true }).boundingBox();
    assert.ok(
      v.x + v.width <= views.x && Math.abs(v.y - views.y) < 10,
      'voice icons beside view switch',
    );
    assert.deepEqual(
      await voices
        .getByRole('button')
        .evaluateAll((nodes) => nodes.map((n) => n.getAttribute('aria-pressed'))),
      ['true', 'true'],
    );
    if (process.env.SCORE_TEST_OUTPUT)
      await page.screenshot({
        path: `${process.env.SCORE_TEST_OUTPUT}/voice-header-${expanded ? 'expanded' : 'normal'}.png`,
      });
  }
  await page.setViewportSize({ width: 390, height: 950 });
  assert.equal(await page.getByRole('region', { name: '악보 성부 선택' }).isVisible(), true);
  assert.deepEqual(errors, []);
  console.log(
    'PASS: drum/piano icon toggles in header, nonempty enabled set, both-on editing, fixed 30% opacity, shortcuts, tabs and mobile fit',
  );
} finally {
  await browser.close();
}
