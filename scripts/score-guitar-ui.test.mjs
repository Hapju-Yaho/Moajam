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
  for (const [row, fret] of [
    [4, 0],
    [3, 2],
    [2, 3],
    [1, 2],
  ]) {
    await page.getByLabel('입력할 줄', { exact: true }).selectOption(String(row));
    await key(String(fret));
  }
  assert.equal((await state()).notes[0].tones.length, 4);
  await key('ArrowRight');
  const tone = page.getByLabel('현재 커서부터 연주 톤', { exact: true });
  await page.getByRole('button', { name: '마디·표현', exact: true }).click();
  await tone.selectOption('overdrive');
  assert.deepEqual((await state()).guitarToneChanges.Drums, { 1: 'overdrive' });
  await page.getByRole('button', { name: '음표·주법', exact: true }).click();
  await page.getByRole('button', { name: '리듬 슬래시 입력', exact: true }).click();
  await key('ArrowRight');
  await page.getByRole('button', { name: '음표·주법', exact: true }).click();
  await page.getByRole('button', { name: '리듬 슬래시 입력', exact: true }).click();
  assert.equal(await tone.inputValue(), 'overdrive');
  await key('ArrowRight');
  await page.getByRole('button', { name: '마디·표현', exact: true }).click();
  await tone.selectOption('clean');
  await page.getByRole('button', { name: '음표·주법', exact: true }).click();
  await page.getByRole('button', { name: '리듬 슬래시 입력', exact: true }).click();
  assert.deepEqual(
    (await state()).notes.map((n) => n.beats),
    [1, 1, 1, 1],
  );
  assert.equal(await page.locator('[data-rhythm-slash="true"]').count(), 6);
  assert.equal(await page.locator('[data-guitar-tone="overdrive"]').count(), 1);
  assert.equal(await page.locator('[data-guitar-tone="clean"]').count(), 1);
  const result = await page.evaluate(async () => {
    const score = JSON.parse(document.querySelector('[aria-label="악보 데이터"]').textContent);
    const { scoreToMusicXml, scoreExpressionPerformance } =
      await import('/packages/app/src/lib/score.ts');
    const { scoreFromMusicXml } = await import('/packages/app/src/lib/scoreImport.web.ts');
    const { scheduleScorePassage } = await import('/packages/app/src/lib/scoreAudio.web.ts');
    const restored = scoreFromMusicXml(scoreToMusicXml(score));
    const performance = scoreExpressionPerformance(score, 'Drums');
    const render = async (input, from = 0, to = 4) => {
      const ctx = new OfflineAudioContext(
        1,
        Math.ceil((((to - from) * 60) / score.bpm) * 22050) + 5000,
        22050,
      );
      scheduleScorePassage(ctx, ctx.destination, input, 'Drums', 0, from, to);
      return (await ctx.startRendering()).getChannelData(0);
    };
    const dry = await render({ ...score, guitarToneChanges: {} }),
      wet = await render(score),
      seconds = 60 / score.bpm;
    const difference = (beat) => {
      const begin = Math.floor((beat + 0.2) * seconds * 22050),
        end = Math.floor((beat + 0.7) * seconds * 22050);
      let sum = 0;
      for (let i = begin; i < end; i++) sum += (dry[i] - wet[i]) ** 2;
      return Math.sqrt(sum / (end - begin));
    };
    const middle = await render(score, 2, 3);
    let middleEnergy = 0;
    for (const n of middle) middleEnergy += n * n;
    return {
      tones: restored.guitarToneChanges,
      slashes: restored.notes.filter((n) => n.slash).length,
      chords: restored.notes.map((n) => n.chord),
      pitches: performance.notes.map((n) => n.tones.map((t) => t.pitch)),
      difference: [0, 1, 2, 3].map(difference),
      middleEnergy,
      peak: wet.reduce((m, x) => Math.max(m, Math.abs(x)), 0),
    };
  });
  assert.deepEqual(result.tones.Drums, { 1: 'overdrive', 3: 'clean' });
  assert.equal(result.slashes, 3);
  assert.ok(result.chords.every((c) => !c.includes('Drive') && !c.includes('Clean')));
  for (const chord of result.pitches.slice(1)) assert.deepEqual(chord, result.pitches[0]);
  assert.ok(result.difference[0] < 1e-6 && result.difference[3] < 1e-6);
  assert.ok(result.difference[1] > 0.01 && result.difference[2] > 0.01);
  assert.ok(result.peak < 1 && result.middleEnergy > 0.1);
  if (process.env.SCORE_TEST_OUTPUT)
    await page
      .locator('.score-systems')
      .screenshot({ path: `${process.env.SCORE_TEST_OUTPUT}/guitar-overdrive-slash.png` });
  await page.getByRole('button', { name: '마디·표현', exact: true }).click();
  await page.getByRole('button', { name: '이 위치의 톤 지시 삭제', exact: true }).click();
  assert.equal(await tone.inputValue(), 'overdrive');
  await key('Control+z');
  assert.equal(await tone.inputValue(), 'clean');
  await page.getByRole('button', { name: '음표·주법', exact: true }).click();
  await page.getByRole('button', { name: '리듬 슬래시 입력', exact: true }).click();
  assert.equal((await state()).notes[3].slash, false);
  assert.deepEqual(errors, []);
  console.log(
    'PASS: D chord/slash entry, exact cursor tone change/clean/delete/undo, SVG, XML, chord pitches and actual offline overdrive waveform',
  );
} finally {
  await browser.close();
}
