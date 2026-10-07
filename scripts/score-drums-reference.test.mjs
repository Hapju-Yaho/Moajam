/* global document, OfflineAudioContext, btoa */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
import { Buffer } from 'node:buffer';
import process from 'node:process';
import console from 'node:console';
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_PACKAGE || 'playwright');
const browser = await chromium.launch({ headless: true, channel: 'msedge' });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 1100 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('http://127.0.0.1:4182/scripts/score-drums.browser.html');
  const editor = page.getByLabel('악보 입력 영역', { exact: true });
  const key = async (value) => {
    await editor.focus();
    await page.keyboard.press(value);
  };
  const length = async (beats) =>
    page
      .getByRole('button', {
        name: { 4: '온음표', 1: '4분음표', 0.5: '8분음표', 0.25: '16분음표' }[beats],
        exact: true,
      })
      .click();
  const hit = async (beats, pieces = []) => {
    await length(beats);
    if (!pieces.length) await key('r');
    for (const [y, number] of pieces) {
      await page.getByLabel('드럼 입력 위치', { exact: true }).selectOption(String(y));
      await key(String(number));
    }
    await key('ArrowRight');
  };
  await key('Control+1');
  for (let i = 0; i < 7; i++) await hit(4);
  // Reference measure 8, entered through the same keyboard and duration controls.
  await hit(1);
  await hit(0.5);
  await hit(0.5, [[72, 1]]);
  await hit(0.25);
  await hit(0.25, [[97, 1]]);
  await hit(0.5, [[77, 2]]);
  await hit(0.5, [[97, 1]]);
  await hit(0.25, [[97, 1]]);
  await hit(0.25, [[97, 1]]);
  for (let i = 0; i < 8; i++)
    await hit(
      0.5,
      i === 2 || i === 6
        ? [
            [77, 1],
            [97, 1],
          ]
        : [[77, 1]],
    );
  await page.getByRole('button', { name: '아래 성부 · 발', exact: true }).click();
  await page.getByRole('button', { name: '1마디 선택', exact: true }).focus();
  await page.keyboard.press('Enter');
  for (let i = 0; i < 7; i++) await hit(4);
  await hit(1);
  await hit(0.5);
  await hit(0.5, [[117, 1]]);
  await hit(0.5);
  await hit(0.5, [[117, 1]]);
  // Four separately entered sixteenth rests must remain four visible rests.
  for (let i = 0; i < 4; i++) await hit(0.25);
  for (let i = 0; i < 8; i++) await hit(0.5, i === 0 || i === 5 ? [[117, 1]] : []);
  await key('Escape');
  assert.equal(await page.locator('[data-multirest]').count(), 0);
  await page.getByRole('button', { name: '1마디 선택', exact: true }).focus();
  await page.keyboard.press('Enter');
  assert.equal(
    await page.getByRole('button', { name: '이 마디 묶음 해제', exact: true }).count(),
    0,
  );
  for (let i = 0; i < 7; i++) {
    await page.getByRole('button', { name: '마디 쉼표 입력', exact: true }).click();
    if (i === 0) {
      const rest = page.locator('[data-multirest="1"]');
      assert.equal(await rest.count(), 1);
      assert.equal(await rest.locator('text').textContent(), '1');
      assert.ok(
        (await rest
          .locator('path')
          .last()
          .evaluate((node) => node.getBBox().width)) > 100,
      );
    }
  }
  await key('Escape');
  assert.equal(await page.locator('[data-multirest="7"]').count(), 1);
  const m8 = page.getByLabel('8마디', { exact: true });
  assert.deepEqual(
    await m8
      .getByLabel('아래 성부 쉼표', { exact: true })
      .evaluateAll((nodes) => nodes.map((n) => Number(n.getAttribute('data-rest-beats')))),
    [1, 0.5, 0.5, 0.25, 0.25, 0.25, 0.25],
  );
  assert.deepEqual(
    await m8
      .getByLabel('위 성부 쉼표', { exact: true })
      .evaluateAll((nodes) => nodes.map((n) => Number(n.getAttribute('data-rest-beats')))),
    [1, 0.5, 0.25],
  );
  assert.ok(await m8.locator('[data-stem-direction="up"]').count());
  assert.ok(await m8.locator('[data-stem-direction="down"]').count());
  // Select a collapsed rest and verify it can still be edited without changing timing.
  const before = await page.getByLabel('악보 데이터').innerText();
  const restSpans = () =>
    page
      .locator('[data-multirest]')
      .evaluateAll((nodes) => nodes.map((n) => Number(n.getAttribute('data-multirest'))));
  const lineCount = await page.locator('.score-system').count();
  await page.getByRole('button', { name: '7마디 쉼표', exact: true }).click();
  assert.deepEqual(await restSpans(), [1, 6]);
  await key('Control+ArrowRight');
  await key('Control+ArrowRight');
  assert.deepEqual(await restSpans(), [2, 1, 4]);
  assert.equal(await page.locator('.score-system').count(), lineCount);
  assert.equal(await page.getByLabel('현재 마디와 박', { exact: true }).innerText(), '3마디 · 1박');
  if (process.env.SCORE_TEST_OUTPUT)
    await page
      .locator('.score-systems')
      .screenshot({ path: `${process.env.SCORE_TEST_OUTPUT}/drum-rest-cursor-groups.png` });
  await key('Control+ArrowRight');
  assert.deepEqual(await restSpans(), [3, 1, 3]);
  await key('Control+ArrowLeft');
  assert.deepEqual(await restSpans(), [2, 1, 4]);
  await key('Escape');
  assert.deepEqual(await restSpans(), [7]);
  assert.equal(await page.getByLabel('악보 데이터').innerText(), before);
  await page.getByRole('button', { name: '7마디 쉼표', exact: true }).click();
  for (let i = 0; i < 3; i++) await key('Control+ArrowRight');
  const beforeDelete = JSON.parse(await page.getByLabel('악보 데이터').innerText());
  await key('Delete');
  const deleted = JSON.parse(await page.getByLabel('악보 데이터').innerText());
  for (const part of deleted.parts) {
    assert.equal(
      deleted.notes.filter((n) => n.part === part).reduce((a, n) => a + n.beats, 0),
      beforeDelete.notes.filter((n) => n.part === part).reduce((a, n) => a + n.beats, 0),
    );
    let at = 0;
    const erased = deleted.notes
      .filter((n) => n.part === part)
      .find((n) => {
        const start = at;
        at += n.beats;
        return start === 12;
      });
    assert.equal(erased.blank, true);
  }
  assert.equal(deleted.multiMeasureRests.Drums[3], undefined);
  await key('Control+z');
  assert.deepEqual(JSON.parse(await page.getByLabel('악보 데이터').innerText()), beforeDelete);
  await key('Control+Shift+z');
  await key('Escape');
  assert.equal(await page.locator('[data-multirest="3"]').count(), 2);
  await page.getByRole('button', { name: '4마디 선택', exact: true }).focus();
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: '마디 쉼표 입력', exact: true }).click();
  await key('Escape');
  assert.equal(await page.locator('[data-multirest="7"]').count(), 1);
  await page.getByRole('button', { name: '저장 및 음원 검증', exact: true }).click();
  await page
    .getByLabel('검증 결과')
    .filter({ hasText: /PASS|FAIL/ })
    .waitFor();
  assert.match(await page.getByLabel('검증 결과').innerText(), /^PASS/);
  const result = await page.evaluate(async () => {
    const score = JSON.parse(document.querySelector('[aria-label="악보 데이터"]').textContent);
    const { scheduleScorePassage } = await import('/packages/app/src/lib/scoreAudio.web.ts');
    const { prepareDrumKit } = await import('/packages/app/src/lib/drumKit.web.ts');
    const rate = 44100,
      seconds = (8 * 60) / score.bpm;
    const context = new OfflineAudioContext(1, Math.ceil(rate * seconds), rate);
    const gain = context.createGain();
    gain.gain.value = 0.8;
    gain.connect(context.destination);
    for (const part of score.parts)
      scheduleScorePassage(context, gain, score, part, 0, 28, 36, prepareDrumKit());
    const audio = await context.startRendering(),
      pcm = audio.getChannelData(0);
    let peak = 0,
      sum = 0;
    for (const value of pcm) {
      peak = Math.max(peak, Math.abs(value));
      sum += value * value;
    }
    const bytes = new Uint8Array(44 + pcm.length * 2),
      view = new DataView(bytes.buffer);
    const text = (at, value) => [...value].forEach((c, i) => (bytes[at + i] = c.charCodeAt(0)));
    text(0, 'RIFF');
    view.setUint32(4, 36 + pcm.length * 2, true);
    text(8, 'WAVE');
    text(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, rate, true);
    view.setUint32(28, rate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    text(36, 'data');
    view.setUint32(40, pcm.length * 2, true);
    pcm.forEach((v, i) =>
      view.setInt16(44 + i * 2, Math.round(Math.max(-1, Math.min(1, v)) * 32767), true),
    );
    let binary = '';
    for (let i = 0; i < bytes.length; i += 8192)
      binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
    return { peak, rms: Math.sqrt(sum / pcm.length), wav: btoa(binary) };
  });
  assert.ok(result.peak < 0.98 && result.peak > 0.2, `mix peak ${result.peak}`);
  assert.ok(result.rms > 0.025);
  const notesBeforeLayout = JSON.parse(await page.getByLabel('악보 데이터').innerText()).notes;
  const rowOf = (bar) =>
    page
      .getByLabel(`${bar}마디`, { exact: true })
      .evaluate((node) =>
        [...document.querySelectorAll('.score-system')].indexOf(node.closest('.score-system')),
      );
  const selectBar = async (bar) => {
    await page.getByRole('button', { name: `${bar}마디 선택`, exact: true }).focus();
    await page.keyboard.press('Enter');
  };
  await selectBar(8);
  await page.getByRole('button', { name: '마디·표현', exact: true }).click();
  assert.equal(await rowOf(8), 0);
  // The foot voice changes the same shared layout that the renderer uses.
  await page.getByRole('button', { name: '↓ 다음 줄로', exact: true }).click();
  assert.equal(await rowOf(8), 1);
  assert.equal(await page.locator('[data-multirest="7"]').count(), 1);
  await key('Control+1');
  await key('PageUp');
  assert.equal(await rowOf(8), 0);
  await key('PageDown');
  assert.equal(await rowOf(8), 1);
  await key('Control+2');
  await page.getByRole('button', { name: '↑ 이전 줄로', exact: true }).click();
  assert.equal(await rowOf(8), 0);
  await key('Control+z');
  assert.equal(await rowOf(8), 1);
  await key('Control+Shift+z');
  assert.equal(await rowOf(8), 0);
  await page.getByRole('button', { name: '기본 줄 배치', exact: true }).click();
  const afterLayout = JSON.parse(await page.getByLabel('악보 데이터').innerText());
  assert.deepEqual(afterLayout.systemLayout.Drums, []);
  assert.equal(afterLayout.systemLayout[afterLayout.drumVoices.Drums], undefined);
  assert.deepEqual(afterLayout.notes, notesBeforeLayout);
  await key('Escape');
  if (process.env.SCORE_TEST_OUTPUT) {
    writeFileSync(
      `${process.env.SCORE_TEST_OUTPUT}/drum-reference-demo.wav`,
      Buffer.from(result.wav, 'base64'),
    );
    await page
      .locator('.score-systems')
      .screenshot({ path: `${process.env.SCORE_TEST_OUTPUT}/drum-reference-review.png` });
  }
  assert.deepEqual(errors, []);
  // One-bar rest stays a numbered H-bar when selected and can be removed from its focused symbol.
  await page.reload();
  await key('Control+1');
  await page.getByRole('button', { name: '마디 쉼표 입력', exact: true }).click();
  await page.getByRole('button', { name: '1마디 쉼표', exact: true }).click();
  assert.equal(await page.locator('[data-multirest="1"]').count(), 1);
  if (process.env.SCORE_TEST_OUTPUT)
    await page
      .locator('.score-systems')
      .screenshot({ path: `${process.env.SCORE_TEST_OUTPUT}/drum-single-measure-rest.png` });
  await page.getByRole('button', { name: '1마디 쉼표', exact: true }).focus();
  await page.keyboard.press('Backspace');
  assert.equal(await page.locator('[data-multirest]').count(), 0);
  await key('Control+z');
  assert.equal(await page.locator('[data-multirest="1"]').count(), 1);
  await page.getByRole('button', { name: '1마디 쉼표', exact: true }).click();
  await page.getByRole('button', { name: '선택 삭제', exact: true }).click();
  assert.equal(await page.locator('[data-multirest]').count(), 0);
  await page.getByLabel('드럼 입력 위치', { exact: true }).selectOption('97');
  await page.getByRole('button', { name: '4분음표', exact: true }).click();
  await key('1');
  const entered = JSON.parse(await page.getByLabel('악보 데이터').innerText());
  assert.equal(entered.notes.find((n) => n.part === 'Drums').pitch, 38);
  await page.reload();
  await key('Control+1');
  for (let i = 0; i < 3; i++)
    await page.getByRole('button', { name: '마디 쉼표 입력', exact: true }).click();
  for (let i = 0; i < 3; i++) await key('Control+ArrowLeft');
  await key('Shift+ArrowRight');
  await key('Delete');
  const rangeDeleted = JSON.parse(await page.getByLabel('악보 데이터').innerText());
  assert.deepEqual(rangeDeleted.multiMeasureRests.Drums, { 2: 1 });
  for (const part of rangeDeleted.parts) {
    const notes = rangeDeleted.notes.filter((n) => n.part === part);
    assert.deepEqual(
      notes.map((n) => !!n.blank),
      [true, true, false],
    );
    assert.equal(
      notes.reduce((sum, n) => sum + n.beats, 0),
      12,
    );
  }
  assert.deepEqual(errors, []);
  console.log(
    `PASS: individually entered rests, explicit multi-measure rests, shared hand/foot row moves, PageUp/Down, undo/redo/reset, XML/file roundtrip; mix peak=${result.peak.toFixed(3)}, RMS=${result.rms.toFixed(3)}`,
  );
} finally {
  await browser.close();
}
