/* global getComputedStyle, document */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import process from 'node:process';
import console from 'node:console';
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_PACKAGE || 'playwright');
const browser = await chromium.launch({ headless: true, channel: 'msedge' });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 1050 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(
    `${process.env.SCORE_TEST_URL || 'http://127.0.0.1:4182'}/scripts/score-drums.browser.html`,
  );
  await page.getByRole('button', { name: '악보 설정', exact: true }).click();
  await page.getByLabel('파트 악기와 튜닝', { exact: true }).selectOption('piano');
  await page.getByRole('button', { name: '음표·주법', exact: true }).click();
  const state = async () => JSON.parse(await page.getByLabel('악보 데이터').innerText());
  const initial = await state();
  const right = initial.parts[0],
    left = initial.keyboardStaves[right];
  const notes = async (part) => (await state()).notes.filter((n) => n.part === part && !n.blank);
  const key = (value) => page.keyboard.press(value);
  const current = () => page.getByLabel('현재 마디와 박').innerText();
  const opacity = () =>
    page
      .locator('.score-ensemble-staff')
      .evaluateAll((staves) =>
        staves.map((staff) => getComputedStyle(staff.querySelector('.score-systems')).opacity),
      );
  await page.getByLabel('악보 입력 영역', { exact: true }).focus();
  await key('Enter');
  assert.equal((await notes(right))[0].pitch, 60);
  await key('ArrowRight');
  await key('ArrowUp');
  await key('1');
  assert.deepEqual(
    (await notes(right)).map((n) => n.pitch),
    [60, 62],
  );
  await key('ArrowUp');
  await key('ArrowUp');
  await key('Enter');
  assert.deepEqual(
    (await notes(right))[1].tones.map((t) => t.pitch),
    [62, 65],
  );
  assert.equal((await notes(right)).length, 2);
  await key('1');
  assert.deepEqual(
    (await notes(right))[1].tones.map((tone) => tone.pitch),
    [62, 65],
  );
  assert.equal(await page.getByRole('button', { name: /화음에 추가/ }).count(), 0);
  await key('Control+2');
  assert.equal(
    await page.getByLabel('왼손 성부', { exact: true }).getAttribute('aria-pressed'),
    'true',
  );
  assert.match(await current(), /1마디 · 1박/);
  await key('Enter');
  assert.equal((await notes(left))[0].pitch, 48);
  assert.deepEqual(await opacity(), ['0.3', '1']);
  await key('Control+1');
  await key('ArrowRight');
  assert.match(await current(), /1마디 · 2박/);
  await key('Control+2');
  assert.match(await current(), /1마디 · 2박/);
  await key('1');
  assert.equal((await notes(left)).length, 2);
  assert.deepEqual(
    (await notes(left)).map((n) => n.pitch),
    [48, 48],
  );
  // Switching hands must preserve cursor and keyboard focus without re-opening the editor.
  assert.equal(
    await page
      .getByLabel('악보 입력 영역', { exact: true })
      .evaluate((node) => node === document.activeElement),
    true,
  );
  await key('Control+m');
  assert.equal(
    await page.getByRole('button', { name: '왼손 성부', exact: true }).getAttribute('aria-pressed'),
    'true',
  );
  assert.deepEqual(await opacity(), ['1', '1']);
  await key('ArrowRight');
  await key('1');
  assert.equal((await notes(right)).length, 3);
  assert.equal((await notes(left)).length, 2);
  await key('Control+2');
  await key('r');
  assert.equal((await notes(left)).at(-1).rest, true);
  await key('Control+ArrowRight');
  assert.match(await current(), /2마디 · 1박/);
  await key('Control+1');
  assert.match(await current(), /2마디 · 1박/);
  await key('Enter');
  assert.equal((await notes(right)).length, 4);
  await key('Control+2');
  assert.match(await current(), /2마디 · 1박/);
  await key('1');
  assert.equal((await notes(left)).length, 4);
  await key('Control+z');
  assert.equal((await notes(left)).length, 3);
  await key('Control+y');
  assert.equal((await notes(left)).length, 4);
  const roundtrip = await page.evaluate(async () => {
    const score = JSON.parse(document.querySelector('pre[aria-label="악보 데이터"]').textContent);
    const { scoreToMusicXml } = await import('/packages/app/src/lib/score.ts');
    const { scoreFromMusicXml } = await import('/packages/app/src/lib/scoreImport.web.ts');
    const restored = scoreFromMusicXml(scoreToMusicXml(score));
    return {
      staves: restored.keyboardStaves,
      notes: restored.notes.filter((n) => !n.blank).length,
    };
  });
  assert.deepEqual(roundtrip.staves, { [right]: left });
  assert.equal(roundtrip.notes, 8);
  // Fresh measure: natural/sharp at the same written position, plus an adjacent second.
  await page.reload();
  await page.getByRole('button', { name: '악보 설정', exact: true }).click();
  await page.getByLabel('파트 악기와 튜닝', { exact: true }).selectOption('piano');
  await page.getByRole('button', { name: '음표·주법', exact: true }).click();
  await page.getByLabel('입력 음정', { exact: true }).selectOption('72');
  await page.getByLabel('악보 입력 영역', { exact: true }).focus();
  await key('1');
  await key('2');
  let chord = (await notes(right))[0];
  assert.deepEqual(
    chord.tones.map((tone) => [tone.pitch, tone.naturalPitch]),
    [
      [72, 72],
      [73, 72],
    ],
  );
  assert.equal(await page.getByRole('button', { name: /플랫/ }).count(), 0);
  await key('3');
  assert.equal((await notes(right))[0].tones.length, 2, '3 no longer inputs a sharp');
  await key('ArrowUp');
  await key('1');
  chord = (await notes(right))[0];
  assert.deepEqual(
    chord.tones.map((tone) => [tone.pitch, tone.naturalPitch]),
    [
      [72, 72],
      [73, 72],
      [74, 74],
    ],
  );
  const group = () =>
    page
      .locator(`[data-score-note="${chord.id}"]`)
      .filter({ has: page.locator('[data-staff-tone]') })
      .first();
  const geometry = await group().evaluate((node) =>
    [...node.querySelectorAll('[data-staff-tone]')].map((tone) => {
      const head = tone.querySelector('ellipse');
      const accidental = tone.querySelector('[data-tone-accidental]');
      return {
        x: +head.getAttribute('cx'),
        y: +head.getAttribute('cy'),
        sign: accidental?.textContent ?? '',
        signX: accidental ? +accidental.getAttribute('x') : null,
      };
    }),
  );
  assert.equal(geometry[0].y, geometry[1].y);
  assert.equal(Math.abs(geometry[0].x - geometry[1].x), 9);
  assert.equal(Math.abs(geometry[0].y - geometry[2].y), 5);
  assert.notEqual(geometry[0].x, geometry[2].x);
  assert.notEqual(geometry[1].x, geometry[2].x);
  assert.deepEqual(
    geometry.map((item) => item.sign),
    ['♮', '♯', ''],
  );
  assert.ok(Math.abs(geometry[0].signX - geometry[1].signX) >= 12);
  await page.screenshot({ path: `${process.env.TEMP}/moajam-keyboard-chord.png`, fullPage: true });
  const spellingRoundtrip = await page.evaluate(async () => {
    const score = JSON.parse(document.querySelector('pre[aria-label="악보 데이터"]').textContent);
    const model = await import('/packages/app/src/lib/score.ts');
    const { scoreFromMusicXml } = await import('/packages/app/src/lib/scoreImport.web.ts');
    const { validateScoreDocument } = await import('/packages/app/src/lib/scoreFile.ts');
    const compact = (notes) =>
      notes
        .filter((n) => !n.blank && !n.rest)
        .map((n) => n.tones.map((t) => [t.pitch, t.naturalPitch]));
    return [
      compact(scoreFromMusicXml(model.scoreToMusicXml(score)).notes),
      compact(validateScoreDocument(score).notes),
      compact(
        model.readScoreClipboard(
          JSON.stringify({
            type: 'moajam-score',
            version: 1,
            notes: model.copyScoreNotes(score, score.parts[0], [score.notes[0].id]),
          }),
        ),
      ),
    ];
  });
  for (const restored of spellingRoundtrip)
    assert.deepEqual(restored, [
      [
        [72, 72],
        [73, 72],
        [74, 74],
      ],
    ]);
  // Click the displaced sharp head, delete just it, then delete its natural sibling.
  await group().locator('[data-midi-pitch="73"] ellipse').click();
  assert.equal(await page.getByLabel('입력 음정', { exact: true }).inputValue(), '72');
  assert.equal(
    await page.getByRole('button', { name: '2 샵 ♯', exact: true }).getAttribute('aria-pressed'),
    'true',
  );
  await key('Delete');
  assert.deepEqual(
    (await notes(right))[0].tones.map((t) => t.pitch),
    [72, 74],
  );
  await key('Delete');
  assert.deepEqual(
    (await notes(right))[0].tones.map((t) => t.pitch),
    [74],
  );
  await key('Control+z');
  await key('Control+z');
  assert.equal((await notes(right))[0].tones.length, 3);
  await key('ArrowDown'); // B below the chord: empty staff position clears only this beat.
  await key('Delete');
  assert.equal((await state()).notes[0].blank, true);
  assert.equal((await state()).notes[0].beats, 1);
  await key('Control+z');
  await key('Control+2');
  await key('2');
  assert.deepEqual(
    (await notes(left))[0].tones.map((t) => [t.pitch, t.naturalPitch]),
    [[49, 48]],
  );
  await key('Enter');
  assert.equal(
    (await notes(left))[0].tones.length,
    1,
    'Enter keeps current sharp without duplicating',
  );
  await key('1');
  assert.deepEqual(
    (await notes(left))[0].tones.map((t) => t.pitch),
    [49, 48],
  );
  await key('Delete');
  assert.deepEqual(
    (await notes(left))[0].tones.map((t) => t.pitch),
    [49],
  );
  assert.equal((await notes(right))[0].tones.length, 3, 'other hand is unchanged');
  for (const { fifths, natural, sounding, symbol } of [
    { fifths: 1, natural: 65, sounding: 66, symbol: '♯' },
    { fifths: -1, natural: 71, sounding: 70, symbol: '♭' },
  ]) {
    await page.reload();
    await page.getByRole('button', { name: '악보 설정', exact: true }).click();
    await page.getByLabel('파트 악기와 튜닝', { exact: true }).selectOption('piano');
    await page.getByRole('button', { name: '음표·주법', exact: true }).click();
    await page.getByRole('button', { name: '마디·표현', exact: true }).click();
    await page.getByLabel('조표', { exact: true }).selectOption(String(fifths));
    await page.getByRole('button', { name: '음표·주법', exact: true }).click();
    await page.getByLabel('입력 음정', { exact: true }).selectOption(String(natural));
    assert.equal(
      await page.getByRole('button', { name: `1 기본 ${symbol}`, exact: true }).count(),
      1,
    );
    assert.equal(await page.getByRole('button', { name: '2 제자리 ♮', exact: true }).count(), 1);
    await page.getByLabel('악보 입력 영역', { exact: true }).focus();
    await key('Enter'); // initial default mode must follow the key before any numbered input
    assert.equal((await notes(right))[0].pitch, sounding);
    const signs = async (n) =>
      page.locator(`[data-score-note="${n.id}"] [data-tone-accidental]`).allTextContents();
    assert.deepEqual(await signs((await notes(right))[0]), []);
    await key('ArrowRight');
    await key('2');
    assert.equal((await notes(right))[1].pitch, natural);
    assert.deepEqual(await signs((await notes(right))[1]), ['♮']);
    await key('ArrowRight');
    await key('Enter');
    assert.equal((await notes(right))[2].pitch, natural);
    assert.deepEqual(
      await signs((await notes(right))[2]),
      [],
      'same-measure accidental is not repeated',
    );
    await key('ArrowRight');
    await key('1');
    assert.equal((await notes(right))[3].pitch, sounding);
    assert.deepEqual(
      await signs((await notes(right))[3]),
      [symbol],
      'returning to key default cancels the natural',
    );
    await key('Control+ArrowRight');
    await key('1');
    assert.equal((await notes(right))[4].pitch, sounding);
    assert.deepEqual(await signs((await notes(right))[4]), [], 'bar line resets accidental state');
    await key('ArrowUp');
    await key('Enter');
    const nextNatural = natural === 65 ? 67 : 72;
    assert.equal(
      (await notes(right))[4].tones.at(-1).pitch,
      nextNatural,
      'default mode follows the new staff position',
    );
    assert.equal(await page.getByRole('button', { name: '2 샵 ♯', exact: true }).count(), 1);
    await key('Control+2');
    await page.getByLabel('입력 음정', { exact: true }).selectOption(String(natural - 12));
    await page.getByRole('button', { name: `1 기본 ${symbol}`, exact: true }).click();
    await page.getByRole('button', { name: '2 제자리 ♮', exact: true }).click();
    assert.deepEqual(
      (await notes(left)).at(-1).tones.map((t) => t.pitch),
      [sounding - 12, natural - 12],
    );
    await page
      .getByLabel('변화음 직접 입력', { exact: true })
      .selectOption(fifths === 1 ? '-1' : '1');
    assert.deepEqual(
      (await notes(left)).at(-1).tones.map((t) => t.pitch),
      [sounding - 12, natural - 12, natural - 12 + (fifths === 1 ? -1 : 1)],
    );
    await key('Delete');
    assert.equal(
      (await notes(left)).at(-1).tones.length,
      2,
      'explicit alteration can be deleted individually',
    );
  }
  assert.deepEqual(errors, []);
  console.log(
    'PASS: piano key-aware 1 / 2 / Enter, sharp/flat key signatures, accidental carry/reset, explicit alterations, displaced heads, targeted Delete, both hands, file/clipboard/XML, undo/redo',
  );
} finally {
  await browser.close();
}
