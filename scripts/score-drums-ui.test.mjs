/* global document */
// In-memory browser fixture. PLAYWRIGHT_PACKAGE can use a bundled installation.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import process from 'node:process';
import console from 'node:console';
const loadPackage = createRequire(import.meta.url);
const { chromium } = loadPackage(process.env.PLAYWRIGHT_PACKAGE || 'playwright');

(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(
      `${process.env.SCORE_TEST_URL || 'http://127.0.0.1:4182'}/scripts/score-drums.browser.html`,
    );
    const editor = page.getByLabel('악보 입력 영역', { exact: true });
    const state = async () => JSON.parse(await page.getByLabel('악보 데이터').innerText());
    const notes = async (part = 'Drums') => (await state()).notes.filter((n) => n.part === part);
    const pitches = async (index = 0, part = 'Drums') =>
      (await notes(part))[index].tones.map((t) => t.pitch).sort((a, b) => a - b);
    const moveTo = async (y) => {
      const input = page.getByLabel('드럼 입력 위치', { exact: true });
      await input.waitFor();
      const rows = await input
        .locator('option')
        .evaluateAll((options) => options.map((option) => Number(option.value)));
      const target = rows.indexOf(y),
        current = rows.indexOf(Number(await input.inputValue()));
      assert.ok(target >= 0);
      await editor.focus();
      for (let i = 0; i < Math.abs(target - current); i++)
        await page.keyboard.press(target > current ? 'ArrowDown' : 'ArrowUp');
      assert.equal(Number(await input.inputValue()), y);
    };
    const key = async (value) => {
      await editor.focus();
      await page.keyboard.press(value);
    };
    const techniques = page.getByRole('group', { name: '주법', exact: true });
    const technique = (name) => techniques.getByRole('button', { name, exact: true });
    const drumTechniqueNames = [
      '초크',
      '플램',
      '드래그',
      '더블 스트로크',
      '사선 2개',
      '사선 3개',
      '버즈 롤',
    ];
    const availableTechniques = async () =>
      (
        await techniques
          .locator('button:enabled')
          .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('aria-label')))
      ).filter((label) => drumTechniqueNames.includes(label));
    // The cursor previews the actual drum head, rhythm and technique without writing a note.
    await key('Control+1');
    await moveTo(57);
    const preview = page.locator('[data-drum-input-preview]');
    const unedited = await state();
    assert.equal(await preview.count(), 1);
    assert.equal(await preview.getAttribute('data-drum-input-preview'), '55');
    assert.equal(await preview.locator('[data-drum-ledger]').count(), 2);
    assert.equal(await preview.locator('[data-drum-head]').getAttribute('stroke'), '#c77830');
    assert.equal(
      await preview.locator('[data-preview-stem]').getAttribute('data-preview-stem'),
      'up',
    );
    await technique('초크').click();
    assert.equal(await preview.locator('[data-drum-mark="choke"]').count(), 1);
    await key(']');
    assert.equal(await preview.locator('[data-preview-flag]').count(), 1);
    assert.deepEqual(await state(), unedited);
    if (process.env.SCORE_TEST_OUTPUT)
      await page
        .locator('.score-systems')
        .screenshot({ path: `${process.env.SCORE_TEST_OUTPUT}/drum-note-cursor.png` });
    await key('Enter');
    assert.equal((await notes())[0].tones[0].drumTechnique, 'choke');
    assert.equal((await notes())[0].beats, 0.5);
    await key('s');
    assert.equal((await notes())[0].tones[0].drumTechnique, undefined);
    assert.ok(!(await notes())[0].staccato);
    await key('s');
    assert.equal((await notes())[0].tones[0].drumTechnique, 'choke');
    await technique('초크').click();
    assert.equal((await notes())[0].tones[0].drumTechnique, undefined);
    await technique('초크').click();

    assert.equal(await preview.count(), 1);
    assert.equal(await page.locator('.score-systems rect[stroke="#c77830"]').count(), 0);
    await moveTo(62);
    assert.equal(
      await preview.locator('[data-drum-head]').getAttribute('data-drum-head'),
      'triangle',
    );
    assert.equal(await preview.locator('[data-drum-ledger]').count(), 2);
    await moveTo(97);
    await technique('드래그').click();
    assert.equal(await preview.getByLabel('드래그 장식음', { exact: true }).count(), 1);
    await key('Control+2');
    await moveTo(117);
    assert.equal(
      await preview.locator('[data-preview-stem]').getAttribute('data-preview-stem'),
      'down',
    );
    assert.equal(await preview.locator('[data-drum-ledger]').count(), 0);
    await key('Escape');
    assert.equal(await preview.count(), 0);
    await page.reload();
    await editor.waitFor();
    // Techniques are independent controls, gated by the actual instrument at a shared staff height.
    await moveTo(117);
    assert.equal(await techniques.getByRole('button', { name: '초크', exact: true }).count(), 1);
    assert.equal(
      await techniques.getByRole('button', { name: '스타카토', exact: true }).count(),
      0,
    );
    assert.equal(await page.getByRole('group', { name: '드럼 주법', exact: true }).count(), 0);
    assert.deepEqual(await availableTechniques(), []);
    await key('1');
    await key('2'); // Tom 4 shares the kick's staff position.
    assert.deepEqual(await pitches(), [41]);
    assert.deepEqual(await availableTechniques(), [
      '플램',
      '드래그',
      '더블 스트로크',
      '사선 2개',
      '사선 3개',
      '버즈 롤',
    ]);
    await technique('플램').click();
    assert.equal((await notes())[0].tones[0].drumTechnique, 'flam');
    await key('1');
    assert.deepEqual(await pitches(), [36]);
    assert.deepEqual(await availableTechniques(), []);
    assert.equal((await notes())[0].tones[0].drumTechnique, undefined);
    await moveTo(97);
    const beforeArming = await state();
    await technique('드래그').click();
    assert.deepEqual(await state(), beforeArming); // No note until Enter/1, even in an existing chord.
    await key('Enter');
    assert.deepEqual(await pitches(), [36, 38]);
    const drumTone = async () => (await notes())[0].tones.find((t) => t.pitch === 38);
    assert.equal((await drumTone()).drumTechnique, 'drag');
    const existingBeats = (await notes())[0].beats;
    await technique('사선 3개').click();
    assert.equal((await drumTone()).drumTechnique, 'roll3');
    assert.deepEqual(await pitches(), [36, 38]);
    assert.equal((await notes())[0].beats, existingBeats);
    await key('Control+z');
    assert.equal((await drumTone()).drumTechnique, 'drag');
    assert.equal(await technique('드래그').getAttribute('aria-pressed'), 'true');
    await key('Control+Shift+z');
    assert.equal(await technique('사선 3개').getAttribute('aria-pressed'), 'true');
    await technique('사선 3개').click();
    assert.equal((await drumTone()).drumTechnique, undefined);
    await key('3'); // Cross stick, at the same height, cannot use snare articulations.
    assert.deepEqual(await availableTechniques(), []);
    await key('1');
    const beforeUnusedKeys = await state();
    assert.equal(await technique('초크').isDisabled(), true);
    await key('s');
    await key('g');
    assert.deepEqual(await state(), beforeUnusedKeys);
    for (const digit of ['4', '5', '6', '7', '8', '9']) await key(digit);
    assert.deepEqual(await state(), beforeUnusedKeys);
    for (const y of [57, 67, 72]) {
      await moveTo(y);
      assert.deepEqual(await availableTechniques(), ['초크']);
    }
    for (const y of [62, 77, 82, 122, 127]) {
      await moveTo(y);
      assert.deepEqual(await availableTechniques(), []);
    }
    await moveTo(97);
    if (process.env.SCORE_TEST_OUTPUT)
      await techniques.screenshot({
        path: `${process.env.SCORE_TEST_OUTPUT}/drum-technique-controls.png`,
      });
    await page.reload();
    await editor.waitFor();
    await moveTo(77);
    await key('1');
    assert.deepEqual(await pitches(), [42]);
    await key('2');
    assert.deepEqual(await pitches(), [46]);
    const openMark = await page
      .locator('.score-systems [data-score-note]')
      .first()
      .evaluate((node) => ({
        circle: node.querySelector('[data-drum-mark="open"] circle')?.getAttribute('cx'),
        stem: node.querySelector('[data-stem-direction]')?.getAttribute('x1'),
      }));
    assert.ok(openMark.stem);
    assert.equal(openMark.circle, openMark.stem);
    await key('3');
    assert.equal((await notes())[0].tones[0].drumTechnique, 'half-open');
    await key('4');
    assert.equal((await notes())[0].tones[0].drumTechnique, 'closed');
    await key('1');
    await moveTo(117);
    await key('Enter');
    assert.deepEqual(await pitches(), [36, 42]);
    await moveTo(77);
    await key('2');
    assert.deepEqual(await pitches(), [36, 46]);
    await key('Delete');
    assert.deepEqual(await pitches(), [36]);
    await key('Control+z');
    assert.deepEqual(await pitches(), [36, 46]);
    await key('Control+Shift+z');
    assert.deepEqual(await pitches(), [36]);
    // The hi-hat position is empty: Delete now removes the remaining kick at this beat.
    const beforeEmptyDelete = await notes();
    await key('Delete');
    assert.equal((await notes())[0].rest, true);
    assert.deepEqual((await notes())[0].tones, []);
    assert.equal((await notes())[0].beats, beforeEmptyDelete[0].beats);
    await key('Control+z');
    assert.deepEqual(await notes(), beforeEmptyDelete);
    await key('1');
    await moveTo(97);
    await key('Backspace');
    assert.deepEqual((await notes())[0].tones, []);
    await key('Control+z');
    assert.deepEqual(await pitches(), [36, 42]);
    await moveTo(77);
    await key(']');
    assert.equal((await notes())[0].beats, 0.5);
    await key('ArrowRight');
    await moveTo(97);
    await key('2');
    assert.equal((await notes())[1].tones[0].drumTechnique, 'rimshot');
    await key('3');
    assert.deepEqual(await pitches(1), [37]);
    await key('1');
    assert.deepEqual(await pitches(1), [38]);
    await key('Control+1');
    const lower = (await state()).drumVoices.Drums;
    assert.deepEqual(await pitches(0, lower), [36]);
    assert.equal((await notes(lower))[1].rest, true);
    assert.equal(await page.locator('.score-system').count(), 1);
    // The voice switch stays at beat 0.5. R affects only the upper voice.
    await key('Control+2');
    await moveTo(117);
    await key('1');
    assert.deepEqual(await pitches(1, lower), [36]);
    await key('Control+1');
    await key('r');
    assert.equal((await notes())[1].rest, true);
    assert.equal((await notes(lower))[1].rest, false);
    assert.equal(await page.getByLabel('위 성부 쉼표', { exact: true }).getAttribute('y'), '81');
    // At beat zero, the foot may rest while the hand continues.
    await key('ArrowLeft');
    await key('Control+2');
    await key('r');
    assert.equal((await notes(lower))[0].rest, true);
    assert.equal((await notes())[0].rest, false);
    assert.equal(await page.getByLabel('아래 성부 쉼표', { exact: true }).getAttribute('y'), '147');
    const hands = await notes();
    await key('[');
    assert.equal((await notes(lower))[0].beats, 1);
    assert.deepEqual(await notes(), hands);
    await key('Control+z');
    const before = await state();
    const bpm = page.getByLabel('악보 BPM', { exact: true });
    await bpm.focus();
    await page.keyboard.press('1');
    await page.keyboard.press('Enter');
    assert.deepEqual((await state()).notes, before.notes);
    await page.getByRole('button', { name: '드럼 도움말', exact: true }).click();
    assert.ok(await page.locator('.drum-notation-guide table').isVisible());
    for (const head of ['circle-x', 'diamond', 'triangle'])
      assert.ok(await page.locator(`[data-drum-head="${head}"]`).count());
    for (const mark of ['closed', 'half-open', 'open', 'choke'])
      assert.ok(await page.locator(`[data-drum-mark="${mark}"]`).count());
    await page.getByRole('dialog', { name: '드럼 기호 · 숫자키 안내' }).press('Escape');
    assert.equal(await page.getByRole('dialog').isVisible(), false);
    assert.equal(
      await page
        .getByRole('button', { name: '드럼 도움말', exact: true })
        .evaluate((e) => e === document.activeElement),
      true,
    );
    await key('Control+1');
    await moveTo(72);
    await page.getByRole('button', { name: '초크', exact: true }).click();
    await key('1');
    assert.equal((await notes())[0].tones.find((t) => t.pitch === 49).drumTechnique, 'choke');
    assert.ok(await page.locator('.score-system [aria-label="초크 스타카토 표시"]').count());
    await key('ArrowRight');
    await moveTo(97);
    await page.getByRole('button', { name: '더블 스트로크', exact: true }).click();
    await key('1');
    assert.equal((await notes())[1].tones[0].drumTechnique, 'double');
    await key('ArrowRight');
    await page.getByRole('button', { name: '버즈 롤', exact: true }).click();
    await key('Enter');
    assert.equal((await notes())[2].tones[0].drumTechnique, 'buzz');
    for (const roll of ['double', 'buzz'])
      assert.ok(await page.locator(`.score-system [data-drum-roll="${roll}"]`).count());
    await page.getByRole('button', { name: '저장 및 음원 검증', exact: true }).click();
    await page
      .getByLabel('검증 결과')
      .filter({ hasText: /PASS|FAIL/ })
      .waitFor();
    assert.match(await page.getByLabel('검증 결과').innerText(), /^PASS/);
    if (process.env.SCORE_TEST_SCREENSHOT)
      await page.screenshot({ path: process.env.SCORE_TEST_SCREENSHOT, fullPage: true });
    await page.reload();
    await editor.waitFor();
    // Ctrl+2 also enables independent voices for a legacy single-voice drum part.
    await key('Control+2');
    const footPart = (await state()).drumVoices.Drums;
    await moveTo(117);
    await key('1');
    assert.deepEqual(await pitches(0, footPart), [36]);
    await key('Control+1');
    await moveTo(77);
    await key('1');
    assert.deepEqual(await pitches(), [42]);
    assert.equal(
      await page.locator('[data-drum-voice="lower"]').first().getAttribute('opacity'),
      '0.3',
    );
    assert.equal(await page.getByLabel('다른 성부 진하기', { exact: true }).count(), 0);
    await key('Control+2');
    assert.equal(
      await page.locator('[data-drum-voice="upper"]').first().getAttribute('opacity'),
      '0.3',
    );
    await key('Control+m');
    assert.equal(
      await page
        .getByRole('button', { name: '아래 성부 · 발', exact: true })
        .getAttribute('aria-pressed'),
      'true',
    );
    assert.equal(
      await page.locator('[data-drum-voice="lower"]').first().getAttribute('opacity'),
      '1',
    );
    // Both enabled voices remain editable; clicking voice 2 keeps both enabled.
    await page.getByRole('button', { name: /아래 성부 1마디 1박 킥/ }).click();
    await moveTo(97);
    await key('1');
    assert.deepEqual(await pitches(), [42]);
    assert.deepEqual(
      (await pitches(0, footPart)).sort((a, b) => a - b),
      [36, 38],
    );
    await key('Control+m');
    assert.equal(
      await page
        .getByRole('button', { name: '위 성부 · 손', exact: true })
        .getAttribute('aria-pressed'),
      'true',
    );
    assert.equal(
      await page.locator('[data-drum-voice="lower"]').first().getAttribute('opacity'),
      '0.3',
    );
    await page.reload();
    await editor.waitFor();
    await key('Control+1');
    const lengthNames = {
      '.5': '8분음표',
      '.25': '16분음표',
      1: '4분음표',
      2: '2분음표',
      4: '온음표',
    };
    for (const [duration, y] of [
      ['.5', 77],
      ['.25', null],
      ['.25', 97],
      ['1', null],
      ['2', 77],
      ['4', null],
    ]) {
      await page.getByRole('button', { name: lengthNames[duration], exact: true }).click();
      if (y === null) await key('r');
      else {
        await moveTo(y);
        await key('1');
      }
      await key('ArrowRight');
    }
    const originalRests = await notes();
    const keepRest = originalRests[3],
      nextBarRest = originalRests[5];
    await page
      .getByRole('button', { name: '위 성부 1마디 1.5박 쉼표 0.25박 길이', exact: true })
      .click();
    await key('Delete');
    assert.deepEqual(
      (await notes()).find((n) => n.id === keepRest.id),
      keepRest,
    );
    assert.deepEqual(
      (await notes()).find((n) => n.id === nextBarRest.id),
      nextBarRest,
    );
    assert.deepEqual(
      await page
        .getByLabel('1마디', { exact: true })
        .getByLabel('위 성부 쉼표', { exact: true })
        .evaluateAll((nodes) => nodes.map((n) => Number(n.getAttribute('data-rest-beats')))),
      [1],
    );
    await key('Control+z');
    assert.deepEqual(await notes(), originalRests);
    await key('Control+Shift+z');
    assert.equal(
      await page
        .getByLabel('1마디', { exact: true })
        .getByLabel('위 성부 쉼표', { exact: true })
        .count(),
      1,
    );
    assert.deepEqual(errors, []);
    await page.reload();
    await moveTo(57);
    await key('1');
    assert.deepEqual(await pitches(), [55]);
    assert.equal(
      await page.locator('.score-systems [data-score-note] [data-drum-ledger]').count(),
      2,
    );
    await moveTo(62);
    await key('1');
    assert.deepEqual(await pitches(), [55, 56]);
    assert.equal(
      await page.locator('.score-systems [data-score-note] [data-drum-ledger]').count(),
      4,
    );
    await moveTo(72);
    assert.equal(await page.getByRole('button', { name: /초크.*스타카토/ }).count(), 0);
    await key('ArrowRight');
    await moveTo(77);
    await key('2');
    await key('Escape');
    if (process.env.SCORE_TEST_OUTPUT)
      await page
        .locator('.score-systems')
        .screenshot({ path: `${process.env.SCORE_TEST_OUTPUT}/drum-symbol-alignment.png` });
    assert.deepEqual(errors, []);
    // Ctrl+arrows move only the cursor, including custom lines and an unwritten voice.
    await page.reload();
    await key('Control+1');
    await page.getByRole('button', { name: '온음표', exact: true }).click();
    for (let i = 0; i < 9; i++) {
      await key('r');
      if (i < 8) await key('ArrowRight');
    }
    const position = () => page.getByLabel('현재 마디와 박', { exact: true }).innerText();
    const selectBar = async (bar) => {
      await page.getByRole('button', { name: `${bar}마디 선택`, exact: true }).focus();
      await page.keyboard.press('Enter');
    };
    await selectBar(2);
    const untouched = await state();
    await key('Control+ArrowRight');
    assert.equal(await position(), '3마디 · 1박');
    await key('Control+ArrowLeft');
    assert.equal(await position(), '2마디 · 1박');
    await key('Control+ArrowDown');
    assert.equal(await position(), '6마디 · 1박');
    await key('Control+ArrowDown');
    assert.equal(await position(), '9마디 · 1박');
    await key('Control+ArrowDown');
    assert.equal(await position(), '9마디 · 1박');
    await key('Control+ArrowUp');
    assert.equal(await position(), '5마디 · 1박');
    await key('Control+ArrowUp');
    assert.equal(await position(), '1마디 · 1박');
    await key('Control+ArrowUp');
    await key('Control+ArrowLeft');
    assert.equal(await position(), '1마디 · 1박');
    assert.deepEqual(await state(), untouched);
    await selectBar(3);
    await key('PageDown');
    const custom = await state();
    await key('Control+ArrowUp');
    assert.equal(await position(), '1마디 · 1박');
    await key('Control+ArrowDown');
    assert.equal(await position(), '3마디 · 1박');
    assert.deepEqual(await state(), custom);
    await key('Control+2');
    await key('Control+ArrowRight');
    assert.equal(await position(), '4마디 · 1박');
    await moveTo(117);
    await page.getByRole('button', { name: '4분음표', exact: true }).click();
    await key('1');
    const footNotes = await notes((await state()).drumVoices.Drums);
    assert.equal(footNotes.at(-1).pitch, 36);
    assert.equal(
      footNotes.slice(0, -1).reduce((sum, n) => sum + n.beats, 0),
      12,
    );
    const beforeField = await position();
    await page.getByLabel('악보 BPM', { exact: true }).focus();
    await page.keyboard.press('Control+ArrowRight');
    assert.equal(await position(), beforeField);
    // TAB uses the same shortcuts and keeps the selected string.
    await page.reload();
    await page.getByRole('button', { name: '악보 설정', exact: true }).click();
    await page.getByLabel('파트 악기와 튜닝', { exact: true }).selectOption('guitar');
    await page.getByRole('button', { name: '음표·주법', exact: true }).click();
    await page.getByRole('button', { name: '온음표', exact: true }).click();
    for (let i = 0; i < 5; i++) {
      await key('r');
      if (i < 4) await key('ArrowRight');
    }
    await page.getByLabel('입력할 줄', { exact: true }).selectOption('3');
    await selectBar(1);
    await key('Control+ArrowDown');
    assert.equal(await position(), '5마디 · 1박');
    assert.equal(await page.getByLabel('입력할 줄', { exact: true }).inputValue(), '3');
    await key('7');
    assert.equal((await notes()).at(-1).tones[0].fret, 7);
    // Measure rests are available for every score type, and grouped piano staves stay aligned.
    for (const instrument of ['guitar', 'bass', 'standard', 'piano']) {
      await page.reload();
      await page.getByRole('button', { name: '악보 설정', exact: true }).click();
      await page.getByLabel('파트 악기와 튜닝', { exact: true }).selectOption(instrument);
      await page.getByRole('button', { name: '음표·주법', exact: true }).click();
      const restInput = page.getByRole('button', { name: '마디 쉼표 입력', exact: true });
      assert.equal(await restInput.isEnabled(), true);
      for (let bar = 0; bar < 7; bar++) await restInput.click();
      const score = await state();
      const staffCount = instrument === 'piano' ? 2 : 1;
      assert.equal(await page.locator('[data-multirest="7"]').count(), staffCount);
      for (let i = 0; i < 5; i++) await key('Control+ArrowLeft');
      const firstStaff =
        instrument === 'piano'
          ? page.locator('.score-ensemble-staff').first()
          : page.locator('.score-systems');
      assert.deepEqual(
        await firstStaff
          .locator('[data-multirest]')
          .evaluateAll((nodes) => nodes.map((n) => n.getAttribute('data-multirest'))),
        ['2', '1', '4'],
      );
      if (instrument === 'guitar' || instrument === 'bass')
        assert.equal(await firstStaff.locator('[data-measure-rest-staff="tab"]').count(), 3);
      assert.deepEqual(await state(), score);
      if (process.env.SCORE_TEST_OUTPUT)
        await (instrument === 'piano' ? page.locator('.score-ensemble') : firstStaff).screenshot({
          path: `${process.env.SCORE_TEST_OUTPUT}/${instrument}-measure-rests.png`,
        });
      await key('Delete');
      const cleared = await state();
      assert.equal(cleared.multiMeasureRests.Drums[2], undefined);
      for (const part of cleared.parts) {
        const deletedNotes = cleared.notes.filter((n) => n.part === part);
        assert.equal(deletedNotes[2].blank, true);
        assert.deepEqual(
          deletedNotes.slice(3),
          score.notes.filter((n) => n.part === part).slice(3),
        );
      }
      await key('Control+z');
      assert.deepEqual(await state(), score);
      await page.getByRole('button', { name: '저장 및 음원 검증', exact: true }).click();
      await page
        .getByLabel('검증 결과')
        .filter({ hasText: /PASS|FAIL/ })
        .waitFor();
      assert.match(await page.getByLabel('검증 결과').innerText(), /^PASS/);
    }
    assert.deepEqual(errors, []);
    console.log(
      'PASS: position navigation, numbered replacements, Enter, Delete, undo/redo, independent voice rhythms/rests, symbol guide, file/XML roundtrip and kit generation',
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
