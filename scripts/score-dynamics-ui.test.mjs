/* global document, requestAnimationFrame */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import process from 'node:process';
import console from 'node:console';
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_PACKAGE || 'playwright');
const browser = await chromium.launch({ headless: true, channel: 'msedge' });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 1100 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const button = (name) => page.getByRole('button', { name, exact: true });
  const state = async () => JSON.parse(await page.getByLabel('악보 데이터').innerText());
  const key = async (value) => {
    await page.getByLabel('악보 입력 영역', { exact: true }).focus();
    await page.keyboard.press(value);
  };
  await page.goto(
    `${process.env.SCORE_TEST_URL || 'http://127.0.0.1:4182'}/scripts/score-drums.browser.html`,
  );
  await button('악보 설정').click();
  await page.getByLabel('파트 악기와 튜닝', { exact: true }).selectOption('guitar');
  await button('음표·주법').click();
  assert.equal(await button('처음부터').locator('svg').count(), 1);
  assert.equal((await button('처음부터').innerText()).trim(), '');
  assert.equal(await page.getByRole('checkbox', { name: '구간 반복', exact: true }).count(), 1);
  assert.equal(await button('pp 강약').isVisible(), false);
  await button('마디·표현').click();
  const ppBox = await button('pp 강약').boundingBox(),
    swellBox = await button('크레셴도').boundingBox();
  assert.ok(Math.abs(ppBox.y - swellBox.y) < 4, 'dynamics and hairpins share one desktop row');
  for (const value of ['pp', 'p', 'mp', 'mf', 'f', 'ff'])
    assert.equal(await button(value + ' 강약').isVisible(), true);
  assert.equal(await page.getByLabel('강약 변화 끝 마디').count(), 0);
  assert.equal(await page.locator('.score-expression-tools.drum-notation-guide').count(), 0);
  assert.equal(await button('크레셴도').isDisabled(), true);
  await button('음표·주법').click();
  for (let i = 0; i < 8; i++) {
    if (i) await key('ArrowRight');
    await key('0');
  }
  await button('마디·표현').click();
  await button('p 강약').click();
  await button('크레셴도').click();
  assert.deepEqual((await state()).directions.Drums[1].swells, [
    { startOffset: 0, endBar: 2, endOffset: 0, from: 0.35, to: 'mp' },
  ]);
  await button('강약 변화 해제').click();
  assert.equal((await state()).directions.Drums[1].swells.length, 0);
  await button('음표·주법').click();
  for (let i = 0; i < 5; i++) await key('ArrowLeft');
  await key('Shift+ArrowLeft');
  await button('마디·표현').click();
  await button('크레셴도').click();
  assert.deepEqual((await state()).directions.Drums[0].swells, [
    { startOffset: 0.25, endBar: 0, endOffset: 0.75, from: 0.7, to: 'f' },
  ]);
  const hairpin = page.locator('path[data-swell-start="0.25"][data-swell-end="0.75"]');
  assert.equal(await hairpin.count(), 1);
  const span = await hairpin.getAttribute('d');
  assert.ok(Number(span.match(/^M([\d.]+)/)[1]) > 2, 'partial range starts inside the measure');
  // Applying again must keep the same multi-note selection.
  await button('디크레셴도').click();
  assert.equal((await state()).directions.Drums[0].swells[0].to, 'mp');
  assert.equal((await state()).directions.Drums[0].swells[0].startOffset, 0.25);
  await button('악보 실행 취소').click();
  assert.equal((await state()).directions.Drums[0].swells[0].to, 'f');
  await button('악보 다시 실행').click();
  assert.equal((await state()).directions.Drums[0].swells[0].to, 'mp');
  const exported = await page.evaluate(async () => {
    const score = JSON.parse(document.querySelector('[aria-label="악보 데이터"]').textContent);
    const { scoreToMusicXml, scorePerformance } = await import('/packages/app/src/lib/score.ts');
    const { scoreFromMusicXml } = await import('/packages/app/src/lib/scoreImport.web.ts');
    const restored = scoreFromMusicXml(scoreToMusicXml(score));
    return {
      directions: restored.directions,
      gains: scorePerformance(restored, 'Drums').score.notes.map((n) => n.playbackGain),
    };
  });
  assert.deepEqual(exported.directions, (await state()).directions);
  assert.ok(exported.gains[2] < exported.gains[1]);
  if (process.env.SCORE_TEST_OUTPUT) {
    await page.mouse.move(0, 0);
    await page
      .locator('.score-editor-tools-host')
      .screenshot({ path: `${process.env.SCORE_TEST_OUTPUT}/dynamics-tools.png` });
    await button('마디·표현').click();
    await page
      .locator('.score-editor-tools-host')
      .screenshot({ path: `${process.env.SCORE_TEST_OUTPUT}/navigation-tools.png` });
    await button('음표·주법').click();
  }
  await button('마디·표현').click();
  await page.setViewportSize({ width: 390, height: 1000 });
  assert.equal(
    await page.locator('.guitar-editor').evaluate((e) => e.scrollWidth <= e.clientWidth + 1),
    true,
  );
  await page.getByLabel('선택 위치 코드', { exact: true }).fill('Am7');
  await page.getByLabel('선택 위치 코드', { exact: true }).press('Enter');
  assert.ok(Object.values((await state()).beatChords.Drums).includes('Am7'));
  await button('마디 설정').scrollIntoViewIfNeeded();
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
  await button('마디 설정').click();
  await page.getByRole('dialog').waitFor({ state: 'visible' });
  await page.keyboard.press('Escape');
  await button('마디 추가').click();
  assert.deepEqual(errors, []);
  console.log(
    'PASS: flat expression rows, dynamic buttons, single/multi-note hairpins, retained selection, undo, XML, playback gains and mobile fit',
  );
} finally {
  await browser.close();
}
