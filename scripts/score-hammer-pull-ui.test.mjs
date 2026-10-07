/* global document, OfflineAudioContext */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import process from 'node:process';
import console from 'node:console';
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_PACKAGE || 'playwright');
const browser = await chromium.launch({ headless: true, channel: 'msedge' });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 1100 } }),
    errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const button = (name) => page.getByRole('button', { name, exact: true });
  const key = async (value) => {
    await page.getByLabel('악보 입력 영역', { exact: true }).focus();
    await page.keyboard.press(value);
  };
  const state = async () => JSON.parse(await page.getByLabel('악보 데이터').innerText());
  for (const [frets, label, types] of [
    [[0, 2, 4, 5], 'H', ['hammer', 'hammer', 'hammer']],
    [[7, 5, 3, 0], 'P', ['pull', 'pull', 'pull']],
    [[0, 4, 2, 5], 'H/P', ['hammer', 'pull', 'hammer']],
  ]) {
    await page.goto(
      `${process.env.SCORE_TEST_URL || 'http://127.0.0.1:4182'}/scripts/score-drums.browser.html`,
    );
    await button('악보 설정').click();
    await page.getByLabel('파트 악기와 튜닝', { exact: true }).selectOption('guitar');
    await button('음표·주법').click();
    for (let i = 0; i < frets.length; i++) {
      if (i) await key('ArrowRight');
      await key(String(frets[i]));
    }
    for (let i = 0; i < 3; i++) await key('Shift+ArrowLeft');
    const hp = button('해머링·풀링 (H/P)');
    assert.equal(await hp.isEnabled(), true);
    assert.equal(await button('해머링').count(), 0);
    assert.equal(await button('풀링').count(), 0);
    await hp.click();
    assert.deepEqual(
      (await state()).notes.slice(0, -1).map((n) => n.connection.type),
      types,
    );
    assert.equal(await hp.getAttribute('aria-pressed'), 'true');
    assert.equal(await hp.locator('[data-connection-icon="hammerPull"]').textContent(), label);
    assert.deepEqual(await page.locator('[data-hammer-pull-label]').allTextContents(), [
      label,
      label,
    ]);
    await hp.click();
    assert.ok((await state()).notes.every((n) => !n.connection));
    await key('h');
    assert.deepEqual(
      (await state()).notes.slice(0, -1).map((n) => n.connection.type),
      types,
    );
    await button('연결 해제').click();
    assert.ok((await state()).notes.every((n) => !n.connection));
    await key('p');
    assert.deepEqual(
      (await state()).notes.slice(0, -1).map((n) => n.connection.type),
      types,
    );
    if (process.env.SCORE_TEST_OUTPUT) {
      await page.mouse.move(0, 0);
      await page.locator('.score-editor-tools-host').screenshot({
        path: `${process.env.SCORE_TEST_OUTPUT}/hammer-pull-${label.replace('/', '-')}.png`,
      });
    }
  }
  const audio = await page.evaluate(async () => {
    const score = JSON.parse(document.querySelector('[aria-label="악보 데이터"]').textContent);
    const { scheduleScorePassage } = await import('/packages/app/src/lib/scoreAudio.web.ts');
    const { scoreToMusicXml } = await import('/packages/app/src/lib/score.ts');
    const { scoreFromMusicXml } = await import('/packages/app/src/lib/scoreImport.web.ts');
    const restored = scoreFromMusicXml(scoreToMusicXml(score));
    const context = new OfflineAudioContext(1, 44100 * 3, 44100);
    let attacks = 0;
    const make = context.createOscillator.bind(context);
    context.createOscillator = () => {
      attacks++;
      return make();
    };
    scheduleScorePassage(context, context.destination, score, score.parts[0], 0, 0, 4);
    const pcm = (await context.startRendering()).getChannelData(0);
    return {
      attacks,
      types: restored.notes.slice(0, -1).map((n) => n.connection.type),
      rms: Math.sqrt(pcm.reduce((sum, v) => sum + v * v, 0) / pcm.length),
    };
  });
  assert.equal(audio.attacks, 1);
  assert.ok(audio.rms > 0.001);
  assert.deepEqual(audio.types, ['hammer', 'pull', 'hammer']);
  await button('악보 실행 취소').click();
  assert.ok((await state()).notes.every((n) => !n.connection));
  await button('악보 다시 실행').click();
  assert.equal(await page.locator('[data-hammer-pull-label="H/P"]').count(), 2);
  assert.deepEqual(errors, []);
  console.log(
    'PASS: one H/P button, multi-beat ascending/descending/mixed phrases, group labels, shortcuts, clear/undo, XML and single-attack audio',
  );
} finally {
  await browser.close();
}
