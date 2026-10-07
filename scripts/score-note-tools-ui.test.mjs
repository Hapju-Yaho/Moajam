/* global document, OfflineAudioContext */
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
  const url = process.env.SCORE_TEST_URL || 'http://127.0.0.1:4182';
  const button = (name) => page.getByRole('button', { name, exact: true });
  const state = async () => JSON.parse(await page.getByLabel('악보 데이터').innerText());
  for (const id of ['guitar', 'dropD', 'bass', 'standard', 'piano', 'pianoBass', 'drums']) {
    await page.goto(`${url}/scripts/score-drums.browser.html`);
    await button('악보 설정').click();
    await page.getByLabel('파트 악기와 튜닝', { exact: true }).selectOption(id);
    const fretted = ['guitar', 'dropD', 'bass'].includes(id);
    assert.equal(await page.getByLabel('TAB 표시', { exact: true }).isVisible(), fretted, id);
    await button('음표·주법').click();
    assert.equal(await page.getByLabel('파트 악기와 튜닝', { exact: true }).isVisible(), false, id);
    assert.equal(await page.getByLabel('TAB 표시', { exact: true }).isVisible(), false, id);
    assert.equal(await page.getByLabel('카포 프렛', { exact: true }).isVisible(), fretted, id);
    const groups = await page
      .locator(
        '[aria-label="길이와 쉼표"], [aria-label="음 입력"], [aria-label="주법"], [aria-label="연결"]',
      )
      .evaluateAll((nodes) => nodes.map((n) => n.getAttribute('aria-label')));
    assert.deepEqual(groups, [
      '길이와 쉼표',
      '음 입력',
      '주법',
      ...(id === 'drums' ? [] : ['연결']),
    ]);
    assert.equal(await button('해머링·풀링 (H/P)').isVisible(), fretted, id);
    assert.equal(await button('붙임줄').isVisible(), id !== 'drums', id);
    assert.equal(await button('꾸밈음 (박자 제외)').isVisible(), id !== 'drums', id);
    if (id !== 'drums') assert.equal(await button('꾸밈음 (박자 제외)').isDisabled(), true, id);
    const accent = button('악센트');
    assert.equal(await accent.locator('.score-tool-text').isVisible(), false, id);
    await accent.hover();
    assert.equal(await accent.locator('..').getByRole('tooltip').isVisible(), true, id);
    await accent.focus();
    await page.mouse.move(1, 1);
    assert.equal(
      await accent.locator('..').getByRole('tooltip').isVisible(),
      true,
      id + ' keyboard hint',
    );
    await accent.click();
    assert.equal(
      await accent.locator('.score-tool-text').isVisible(),
      false,
      id + ' selected icon',
    );
    await accent.click();
    assert.equal(await button('pp 강약').isVisible(), false, id);
    assert.equal(await page.getByLabel('마디 기본 하이햇', { exact: true }).isVisible(), false, id);
    assert.equal(await page.getByLabel('마디 연주 지시', { exact: true }).isVisible(), false, id);
    assert.equal(
      await page.getByLabel('현재 커서부터 연주 톤', { exact: true }).isVisible(),
      false,
      id,
    );
    if (fretted) {
      assert.equal(
        await page
          .getByRole('group', { name: '주법', exact: true })
          .getByRole('button', { name: '리듬 슬래시 입력', exact: true })
          .isVisible(),
        true,
        id,
      );
      assert.equal(await button('리듬 슬래시 입력').locator('[data-rhythm-slash-icon]').count(), 1);
      for (const name of [
        '슬라이드 인 위로',
        '슬라이드 인 아래로',
        '슬라이드 아웃 위로',
        '슬라이드 아웃 아래로',
      ])
        assert.equal(
          await page
            .getByRole('group', { name: '연결', exact: true })
            .getByRole('button', { name, exact: true })
            .isVisible(),
          true,
          id,
        );
    }
    await button('마디·표현').click();
    assert.equal(
      await page.getByLabel('마디 기본 하이햇', { exact: true }).isVisible(),
      id === 'drums',
    );
    assert.equal(
      await page.getByLabel('드럼 연주 도구', { exact: true }).isVisible(),
      id === 'drums',
    );
    assert.equal(await button('pp 강약').isVisible(), true, id);
    assert.equal(await button('크레셴도').isVisible(), true, id);
    assert.equal(await page.getByLabel('마디 연주 지시', { exact: true }).isVisible(), true, id);
    assert.equal(
      await page.getByLabel('현재 커서부터 연주 톤', { exact: true }).isVisible(),
      fretted,
      id,
    );
    if (fretted)
      assert.equal(
        await page
          .locator('.score-performance-instructions')
          .getByLabel('현재 커서부터 연주 톤', { exact: true })
          .count(),
        1,
      );

    if (fretted) {
      const toneBox = await page.getByLabel('현재 커서부터 연주 톤', { exact: true }).boundingBox();
      const textBox = await page.getByLabel('마디 연주 지시', { exact: true }).boundingBox();
      assert.ok(Math.abs(toneBox.y - textBox.y) < 4, id + ' tone and instruction share a row');
      assert.ok(textBox.x < toneBox.x, id + ' instruction precedes tone');
    }
    assert.equal(await page.getByLabel('코드 박 위치', { exact: true }).count(), 0);
    assert.equal(
      await page
        .locator('.score-document-settings')
        .getByLabel('마디 연주 지시', { exact: true })
        .count(),
      1,
    );
    if (fretted)
      assert.equal(
        await page
          .locator('.score-document-settings')
          .getByLabel('현재 커서부터 연주 톤', { exact: true })
          .count(),
        1,
      );
    assert.equal(
      await page
        .locator('.score-measure-chord-input')
        .evaluate((e) => e.firstChild.textContent.trim()),
      '코드',
    );
    assert.equal(await page.getByLabel('악보 진행 설정 마디', { exact: true }).count(), 0);
    assert.equal(await page.locator('.score-dynamics-row small').count(), 0);
    assert.equal(await button('𝄆 반복 시작').isDisabled(), true);
    const nav = page.getByRole('group', { name: '반복·이동', exact: true });
    assert.equal(await nav.getByRole('button', { name: 'Fine', exact: true }).isVisible(), true);
    assert.equal(await page.locator('.guitar-location').count(), 0);
    assert.equal(await page.locator('.score-expression-help').count(), 0);
    assert.equal(
      await page
        .locator('.score-document-settings')
        .getByLabel('선택 위치 코드', { exact: true })
        .count(),
      1,
    );
    const firstAction = await button('빈 박 삽입').boundingBox();
    const repeatStart = await button('𝄆 반복 시작').boundingBox();
    const dynamicStart = await button('pp 강약').boundingBox();
    const repeatFirst = id === 'drums' ? await button('% 앞 마디 반복').boundingBox() : repeatStart;
    assert.ok(Math.abs(repeatFirst.x - firstAction.x) < 2, 'repeat and measure actions align');
    assert.ok(
      Math.abs(repeatFirst.x - dynamicStart.x) < 2,
      `repeat and dynamics align ${id}: ${repeatFirst.x} vs ${dynamicStart.x}`,
    );
    for (const name of [
      '맨 끝에 입력',
      '↑ 이전 줄로',
      '↓ 다음 줄로',
      '기본 줄 배치',
      '마디 설정',
    ]) {
      assert.ok(
        Math.abs((await button(name).boundingBox()).y - firstAction.y) < 4,
        name + ' same action row',
      );
      assert.equal(await button(name).locator('[data-measure-icon]').count(), 1);
    }
    assert.ok(
      Math.abs(
        (await button('𝄆 반복 시작').boundingBox()).y - (await button('Fine').boundingBox()).y,
      ) < 4,
      'repeat and navigation share a row',
    );
    const help = page.getByLabel('반복·이동 도움말', { exact: true });
    await help.click();
    assert.equal(await help.locator('..').getAttribute('open'), '');
    await help.press('Escape');
    assert.equal(await help.locator('..').getAttribute('open'), null);
    if (process.env.SCORE_TEST_OUTPUT && id === 'bass')
      await page
        .locator('.score-editor-tools-host')
        .screenshot({ path: `${process.env.SCORE_TEST_OUTPUT}/measure-performance-controls.png` });
    assert.equal(await page.getByLabel('마디 이동 지시', { exact: true }).isVisible(), true, id);
    assert.equal(await page.locator('[aria-label="드럼 주법"]').isVisible(), false, id);
    await page.setViewportSize({ width: 390, height: 950 });
    assert.equal(
      await page.locator('.guitar-editor').evaluate((e) => e.scrollWidth <= e.clientWidth + 1),
      true,
      id + ' mobile measure fit',
    );
    await button('음표·주법').click();
    await page.setViewportSize({ width: 390, height: 950 });
    assert.equal(
      await page.locator('.guitar-editor').evaluate((e) => e.scrollWidth <= e.clientWidth + 1),
      true,
      id + ' mobile fit',
    );
    await page.setViewportSize({ width: 1280, height: 1000 });
    if (process.env.SCORE_TEST_OUTPUT)
      await page
        .locator('.score-editor-tools-host')
        .screenshot({ path: `${process.env.SCORE_TEST_OUTPUT}/note-tools-${id}.png` });
  }
  // Drum grace input is replaced by flam/drag; G must not create a hidden grace note.
  const editor = page.getByLabel('악보 입력 영역', { exact: true });
  await page.getByLabel('드럼 입력 위치', { exact: true }).selectOption('77');
  await editor.focus();
  await page.keyboard.press('Enter');
  const beforeGraceKey = await state();
  await page.keyboard.press('g');
  assert.deepEqual(await state(), beforeGraceKey);
  assert.equal(await button('꾸밈음 (박자 제외)').count(), 0);
  // Scores saved with generic drum grace notes still render both hits correctly.
  const rendered = await page.evaluate(async () => {
    const score = JSON.parse(document.querySelector('[aria-label="악보 데이터"]').textContent);
    const grace = score.notes[0];
    grace.graceBeats = grace.beats;
    grace.beats = 0;
    score.notes.push({
      ...grace,
      id: 'grace-audio-main',
      pitch: 38,
      tones: [{ pitch: 38 }],
      beats: 1,
      graceBeats: undefined,
    });
    const { scorePlaybackFrom } = await import('/packages/app/src/lib/score.ts');
    const { scheduleScorePassage } = await import('/packages/app/src/lib/scoreAudio.web.ts');
    const { prepareDrumKit } = await import('/packages/app/src/lib/drumKit.web.ts');
    const plan = scorePlaybackFrom(score, grace.part);
    const context = new OfflineAudioContext(1, 44100, 44100);
    scheduleScorePassage(
      context,
      context.destination,
      score,
      grace.part,
      0,
      0,
      1,
      prepareDrumKit(),
    );
    const pcm = (await context.startRendering()).getChannelData(0);
    const rms = (start, end) => {
      const data = pcm.slice(Math.floor(start * 44100), Math.floor(end * 44100));
      return Math.sqrt(data.reduce((sum, value) => sum + value * value, 0) / data.length);
    };
    return {
      events: plan.events.map(({ note, offset, beats }) => ({ pitch: note.pitch, offset, beats })),
      graceRms: rms(0, 0.03),
      mainRms: rms(0.13, 0.2),
    };
  });
  assert.deepEqual(
    rendered.events.map((event) => event.pitch),
    [42, 38],
  );
  assert.ok(rendered.events[1].offset > 0);
  assert.ok(
    rendered.graceRms > 0.001 && rendered.mainRms > 0.001,
    'grace and main hit both render audio',
  );
  assert.deepEqual(errors, []);
  console.log(
    'PASS: all seven instrument types, shared layout, settings, icon hints, mobile and legacy drum grace playback',
  );
} finally {
  await browser.close();
}
