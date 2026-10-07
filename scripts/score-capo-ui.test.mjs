/* global document */
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
  await key('0');
  assert.equal((await state()).notes[0].pitch, 64);
  const capo = page.getByLabel('카포 프렛', { exact: true });
  await capo.selectOption('3');
  assert.equal((await state()).notes[0].tones[0].fret, 0);
  assert.equal((await state()).notes[0].pitch, 67);
  assert.equal(await page.getByLabel('카포 3프렛', { exact: true }).count(), 1);
  await key('Control+z');
  assert.equal(await capo.inputValue(), '0');
  assert.equal((await state()).notes[0].pitch, 64);
  await key('Control+Shift+z');
  await key('ArrowRight');
  await key('5');
  assert.equal((await state()).notes[1].pitch, 72);
  const restored = await page.evaluate(async () => {
    const score = JSON.parse(document.querySelector('[aria-label="악보 데이터"]').textContent);
    const { scoreToMusicXml, scoreInstrument, tabTones } =
      await import('/packages/app/src/lib/score.ts');
    const { scoreFromMusicXml } = await import('/packages/app/src/lib/scoreImport.web.ts');
    const { serializeScoreFile, parseScoreFile } =
      await import('/packages/app/src/lib/scoreFile.ts');
    const xml = scoreFromMusicXml(scoreToMusicXml(score));
    const file = (
      await parseScoreFile(
        await serializeScoreFile({ score, referenceAudio: null, instrumentSample: null }),
      )
    ).score;
    return [xml, file].map((s) => ({
      capo: s.capos.Drums,
      pitches: s.notes.filter((n) => !n.rest).map((n) => n.pitch),
      frets: s.notes
        .filter((n) => !n.rest)
        .map((n) => tabTones(n, scoreInstrument(s, 'Drums').tuning)[0].fret),
      chords: s.notes.map((n) => n.chord),
    }));
  });
  for (const r of restored) {
    assert.equal(r.capo, 3);
    assert.deepEqual(r.pitches, [67, 72]);
    assert.deepEqual(r.frets, [0, 5]);
    assert.ok(r.chords.every((c) => !c.includes('Capo')));
  }
  if (process.env.SCORE_TEST_OUTPUT)
    await page
      .locator('.score-systems')
      .screenshot({ path: `${process.env.SCORE_TEST_OUTPUT}/guitar-capo-preview.png` });
  await page.getByRole('button', { name: '악보 설정', exact: true }).click();
  await page.getByLabel('TAB 표시', { exact: true }).uncheck();
  await page.getByRole('button', { name: '음표·주법', exact: true }).click();
  assert.equal(await page.getByLabel('카포 3프렛', { exact: true }).count(), 1);
  await capo.selectOption('0');
  assert.equal(await page.getByLabel('카포 3프렛', { exact: true }).count(), 0);
  assert.deepEqual(
    (await state()).notes.map((n) => n.pitch),
    [64, 69],
  );
  await page.getByRole('button', { name: '악보 설정', exact: true }).click();
  await page.getByLabel('파트 악기와 튜닝', { exact: true }).selectOption('drums');
  await page.getByRole('button', { name: '음표·주법', exact: true }).click();
  assert.equal(await capo.count(), 0);
  assert.deepEqual(errors, []);
  console.log(
    'PASS: capo label, preserved frets, raised pitches, input, undo/redo, remove, file/XML roundtrip',
  );
} finally {
  await browser.close();
}
