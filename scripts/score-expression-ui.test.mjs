/* global document, OfflineAudioContext */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import process from 'node:process';
import console from 'node:console';
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_PACKAGE || 'playwright');
const browser = await chromium.launch({ headless: true, channel: 'msedge' });
try {
  const page = await browser.newPage({ viewport: { width: 1360, height: 1100 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(
    `${process.env.SCORE_TEST_URL || 'http://127.0.0.1:4182'}/scripts/score-drums.browser.html`,
  );
  const state = async () => JSON.parse(await page.getByLabel('악보 데이터').innerText());
  const key = async (k) => {
    await page.getByLabel('악보 입력 영역', { exact: true }).focus();
    await page.keyboard.press(k);
  };
  const choose = async (y) =>
    page.getByLabel('드럼 입력 위치', { exact: true }).selectOption(String(y));
  const button = (name) => page.getByRole('button', { name, exact: true });
  await button('음표·주법').waitFor();
  assert.equal(await page.locator('.score-edit-tabs button').count(), 3);
  assert.equal(await page.locator('.score-note-tools').first().isVisible(), true);
  assert.equal(await page.locator('.score-connections').isVisible(), true);
  await button('마디·표현').click();
  assert.equal(await page.locator('.score-document-settings').isVisible(), true);
  assert.equal(await page.locator('.score-measure-tools').first().isVisible(), true);
  await button('음표·주법').click();
  await key('Control+1');
  await choose(97);
  await button('악센트').click();
  await button('플램').click();
  await key('1');
  assert.equal((await state()).notes[0].accent, true);
  assert.equal((await state()).notes[0].tones[0].drumTechnique, 'flam');
  await key('ArrowRight');
  await button('드래그').click();
  await key('Enter');
  await key('ArrowRight');
  await button('사선 2개').click();
  await key('1');
  await key('ArrowRight');
  await button('사선 3개').click();
  await key('Enter');
  assert.deepEqual(
    (await state()).notes.filter((n) => n.part === 'Drums').map((n) => n.tones[0].drumTechnique),
    ['flam', 'drag', 'roll2', 'roll3'],
  );
  await button('마디·표현').click();
  await page.getByLabel('마디 기본 하이햇', { exact: true }).selectOption('closed');
  await button('음표·주법').click();
  await button('마디·표현').click();
  await button('p 강약').click();
  await button('크레셴도').click();
  await button('음표·주법').click();
  await button('^ 마르카토').click();
  await page.getByLabel('선택 음표 스티킹', { exact: true }).selectOption('R');
  await button('마디·표현').click();
  await page.getByLabel('마디 연주 지시', { exact: true }).fill('Fill');
  await page.getByLabel('마디 연주 지시', { exact: true }).press('Enter');
  assert.equal((await state()).directions.Drums[0].text, 'Fill');
  await button('음표·주법').click();
  const last = (await state()).notes.filter((n) => n.part === 'Drums').at(-1);
  assert.equal(last.marcato, true);
  assert.equal(last.sticking, 'R');
  // Pasting advances to the end of the inserted passage so the next entry cannot overwrite it.
  await button('선택 복사').click();
  await key('ArrowRight');
  await button('여기에 붙여넣기').click();
  await choose(77);
  await key('1');
  const pasted = (await state()).notes.filter((n) => n.part === 'Drums');
  assert.equal(pasted.length, 6);
  assert.equal(pasted[4].tones[0].drumTechnique, 'roll3');
  assert.equal(pasted[5].pitch, 42);
  // An empty destination voice keeps the measure and goes to that measure's first input slot.
  await key('Control+2');
  await choose(117);
  await key('1');
  const lower = (await state()).drumVoices.Drums;
  const feet = (await state()).notes.filter((n) => n.part === lower);
  assert.equal(feet.filter((n) => !n.blank && !n.rest).length, 1);
  assert.equal(feet.at(-1).pitch, 36);
  assert.equal(
    feet.slice(0, -1).reduce((a, n) => a + n.beats, 0),
    4,
  );
  await key('Control+1');
  await button('마디·표현').click();
  await page.getByLabel('마디 기본 하이햇', { exact: true }).selectOption('open');
  await page.getByLabel('드럼 연주 도구', { exact: true }).selectOption('brushes');
  await button('마디·표현').click();
  assert.equal(await page.getByLabel('악보 진행 설정 마디', { exact: true }).count(), 0);
  await button('% 앞 마디 반복').click();
  await page.getByLabel('마디 반복 괄호', { exact: true }).selectOption('2');
  await page.getByLabel('마디 이동 지시', { exact: true }).selectOption('dc-fine');
  assert.equal((await state()).navigation[1].jump, 'dc-fine');
  await key('Control+ArrowLeft');
  await button('Fine').click();
  assert.equal((await state()).navigation[0].fine, true);
  assert.equal((await state()).navigation[1].fine, undefined);
  await button('저장 및 음원 검증').click();
  await page
    .getByLabel('검증 결과')
    .filter({ hasText: /PASS|FAIL/ })
    .waitFor();
  assert.match(await page.getByLabel('검증 결과').innerText(), /^PASS/);
  const audio = await page.evaluate(async () => {
    const score = JSON.parse(document.querySelector('[aria-label="악보 데이터"]').textContent);
    const { scorePlaybackFrom } = await import('/packages/app/src/lib/score.ts');
    const { scheduleScorePassage } = await import('/packages/app/src/lib/scoreAudio.web.ts');
    const { prepareDrumKit } = await import('/packages/app/src/lib/drumKit.web.ts');
    const { scoreToMidi } = await import('/packages/app/src/lib/scoreMidi.ts');
    // Test notation with a meaningful jump route and a repeated bar in both voices.
    delete score.navigation[1].ending;
    const plan = scorePlaybackFrom(score, 'Drums');
    const context = new OfflineAudioContext(1, 44100 * 8, 44100);
    for (const part of score.parts)
      for (const segment of plan.segments)
        scheduleScorePassage(
          context,
          context.destination,
          score,
          part,
          (segment.offset * 60) / score.bpm,
          segment.startBeat,
          segment.endBeat,
          prepareDrumKit(),
        );
    const pcm = (await context.startRendering()).getChannelData(0);
    return {
      rms: Math.sqrt(pcm.reduce((a, v) => a + v * v, 0) / pcm.length),
      peak: pcm.reduce((a, v) => Math.max(a, Math.abs(v)), 0),
      route: plan.segments.map((s) => s.startBeat),
      midi: scoreToMidi(score).length,
    };
  });
  assert.ok(audio.rms > 0.005 && Number.isFinite(audio.peak));
  assert.ok(audio.midi > 100);
  await key('Escape');
  if (process.env.SCORE_TEST_OUTPUT)
    await page
      .locator('.score-systems')
      .screenshot({ path: `${process.env.SCORE_TEST_OUTPUT}/drum-expression-review.png` });
  assert.deepEqual(errors, []);
  // Check actual SVG coordinates for a cymbal/hi-hat beam and a downward kick stem.
  await page.reload();
  await key('Control+1');
  await button('8분음표').click();
  await button('악센트').click();
  await choose(72);
  await key('1');
  await key('ArrowRight');
  await choose(77);
  await key('1');
  await key('ArrowRight');
  await key('2');
  await key('ArrowRight');
  await key('1');
  await button('마디·표현').click();
  await page.getByLabel('마디 기본 하이햇', { exact: true }).selectOption('closed');
  await button('음표·주법').click();
  await key('Control+2');
  await choose(117);
  await key('1');
  if ((await button('악센트').getAttribute('aria-pressed')) !== 'true')
    await button('악센트').click();
  await key('Escape');
  const placement = await page
    .locator('.score-system')
    .first()
    .evaluate((svg) => {
      const accents = [...svg.querySelectorAll('[aria-label="악센트 표시"]')].map((accent) => {
        const note = accent.closest('[data-score-note]'),
          stem = note.querySelector('[data-stem-direction]');
        return {
          x: Number(accent.getAttribute('x')),
          y: Number(accent.getAttribute('y')),
          anchor: accent.getAttribute('text-anchor'),
          stemX: Number(stem.getAttribute('x1')),
          stemY: Number(stem.getAttribute('y2')),
          up: stem.getAttribute('data-stem-direction') === 'up',
          top: accent.getBBox().y,
        };
      });
      const label = svg.querySelector('[data-score-directions="0"] text'),
        box = label.getBBox();
      return { accents, labelBottom: box.y + box.height };
    });
  assert.equal(placement.accents.length, 5);
  for (const a of placement.accents) {
    assert.equal(a.anchor, 'middle');
    assert.equal(a.x, a.stemX + (a.up ? -4.5 : 4.5));
    assert.ok(a.up ? a.y < a.stemY : a.y > a.stemY);
    assert.ok(Math.abs(a.y - a.stemY) <= 20);
  }
  const gap =
    Math.min(...placement.accents.filter((a) => a.up).map((a) => a.top)) - placement.labelBottom;
  assert.ok(gap >= 3 && gap <= 20, `hi-hat label gap: ${gap}`);
  if (process.env.SCORE_TEST_OUTPUT)
    await page
      .locator('.score-systems')
      .screenshot({ path: `${process.env.SCORE_TEST_OUTPUT}/drum-accent-position.png` });
  assert.deepEqual(errors, []);
  console.log(
    'PASS: combined tabs, accent/grace/roll input, paste cursor, voice fallback, directions/dynamics/navigation, XML/file roundtrip, audio and MIDI',
    audio,
  );
} finally {
  await browser.close();
}
