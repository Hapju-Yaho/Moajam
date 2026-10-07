import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import process from 'node:process';
import console from 'node:console';
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_PACKAGE || 'playwright');
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1586, height: 992 } }),
    errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${process.env.SCORE_TEST_URL}/scripts/score-expanded.browser.html`);
  const button = (name) => page.getByRole('button', { name, exact: true });
  const state = async () => JSON.parse(await page.getByLabel('검증 악보').textContent());
  await page.locator('[data-persistent-media]').evaluate((e) => (e.dataset.marker = 'mounted'));
  await button('악보 크게 보기').click();
  assert.equal(await page.locator('.score-editor-viewport').getAttribute('data-expanded'), 'true');
  const boxes = await Promise.all(
    ['.score-parts', '.score-workspace', '.score-detail-inspector', '.score-transport'].map((s) =>
      page.locator(s).boundingBox(),
    ),
  );
  assert.ok(boxes[0].x + boxes[0].width <= boxes[1].x + 1);
  assert.ok(boxes[1].x + boxes[1].width <= boxes[2].x + 1);
  assert.ok(boxes[1].y + boxes[1].height <= boxes[3].y + 1);
  await page.getByLabel('악보 입력 영역', { exact: true }).focus();
  await page.keyboard.press('5');
  assert.equal((await state()).notes[4].tones[0].fret, 5);
  await button('크게 보기 실행 취소').click();
  assert.equal((await state()).notes[4].tones[0].fret, 0);
  assert.equal(await page.locator('.score-expanded-selection').count(), 0);
  assert.equal(await page.getByLabel('선택 음표 길이').count(), 0);
  const technique = page
    .getByRole('group', { name: '주법', exact: true })
    .getByRole('button', { name: '악센트', exact: true });
  await technique.click();
  assert.equal(await technique.getAttribute('aria-pressed'), 'true');
  assert.equal(await technique.locator('.score-tool-text').isVisible(), false);
  await technique.hover();
  assert.equal(await technique.locator('..').getByRole('tooltip').isVisible(), true);
  await technique.click();
  await technique.focus();
  await page.mouse.move(0, 0);
  assert.equal(await technique.locator('..').getByRole('tooltip').isVisible(), true);
  await button('Guitar 빠른 음소거').click();
  assert.equal((await state()).partMix.Guitar.muted, true);
  await button('Guitar 빠른 음소거').click();
  await button('믹서').click();
  const mixer = page.locator('.score-mixer');
  const nameBox = await mixer.locator('strong').first().boundingBox();
  const muteBox = await button('Guitar 음소거').boundingBox();
  const soloBox = await button('Guitar 솔로').boundingBox();
  assert.ok(Math.abs(muteBox.y - soloBox.y) < 2);
  assert.ok(nameBox.y >= muteBox.y && nameBox.y < muteBox.y + muteBox.height);
  const levelBox = await page.getByLabel('Guitar 음량', { exact: true }).boundingBox();
  assert.ok(levelBox.y > muteBox.y + muteBox.height);
  await button('Guitar 음소거').click();
  assert.equal((await state()).partMix.Guitar.muted, true);
  await button('Guitar 음소거').click();
  await button('Guitar 솔로').click();
  assert.equal((await state()).partMix.Guitar.solo, true);
  await button('Guitar 솔로').click();
  await page.getByLabel('Guitar 음량', { exact: true }).fill('0.65');
  assert.equal((await state()).partMix.Guitar.volume, 0.65);
  const backing = page.getByLabel('반주 악보와 함께 재생', { exact: true });
  await backing.uncheck();
  assert.equal((await state()).referenceAudioEnabled, false);
  await button('악보 설정').click();
  await page.getByLabel('검증용 음색').selectOption('일렉트릭 기타');
  assert.equal(await page.getByLabel('파트 악기와 튜닝', { exact: true }).isVisible(), true);
  assert.equal(await page.getByLabel('악보 줄 간격', { exact: true }).isVisible(), true);
  assert.equal(await page.getByLabel('설정 반주 함께 재생').isChecked(), false);
  await page.getByLabel('설정 반주 함께 재생').check();
  assert.equal(await backing.isChecked(), true);
  assert.equal(
    await page.locator('[data-persistent-media]').getAttribute('data-marker'),
    'mounted',
  );
  await button('음표·주법').click();
  const sideTabs = page.getByRole('navigation', { name: '사이드 패널' });
  assert.deepEqual(await sideTabs.getByRole('button').allTextContents(), [
    '음표·주법',
    '마디·표현',
    '악보 설정',
  ]);
  await button('마디·표현').click();
  const measureTool = page.getByRole('button', { name: '𝄆 반복 시작', exact: true });
  assert.equal(await measureTool.locator('.score-tool-text').isVisible(), false);
  await measureTool.hover();
  assert.equal(await measureTool.locator('..').getByRole('tooltip').isVisible(), true);
  await button('음표·주법').click();
  await button('파일 · 내보내기⌄').click();
  assert.equal(await page.locator('summary[aria-label="PDF"]').isVisible(), true);
  assert.equal(await button('파일 불러오기').isVisible(), true);
  assert.equal(await button('내보내기⌄').count(), 0);
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('.score-editor-viewport').getAttribute('data-expanded'), 'true');
  await button('단축키').click();
  assert.equal(await page.getByRole('dialog').isVisible(), true);
  await button('단축키 안내 닫기').click();
  await button('악보 설정').click();
  await button('Vocal').click();
  assert.equal(await page.getByLabel('파트 악기와 튜닝', { exact: true }).isVisible(), true);
  assert.equal(
    await page.locator('[data-persistent-media]').getAttribute('data-marker'),
    'mounted',
  );
  await button('음표·주법').click();
  assert.equal(await page.locator('.score-expanded-scorebar > strong').textContent(), 'Vocal');
  await button('Guitar').click();
  await button('합주 악보').click();
  assert.equal(await button('합주 악보').getAttribute('aria-pressed'), 'true');
  await button('개별 악보').click();
  await page.getByLabel('재생 시작 위치').fill('8');
  assert.match(
    await page.locator('.score-expanded-transport-position > strong').textContent(),
    /3마디/,
  );
  await button('▶ 선택 위치부터').click();
  assert.equal(await backing.isDisabled(), true);
  assert.equal(await button('■ 정지').isVisible(), true);
  await button('■ 정지').click();
  const request = async () => JSON.parse(await page.getByLabel('검증 재생 요청').textContent());
  const loop = page.getByRole('checkbox', { name: '구간 반복', exact: true });
  await loop.check();
  assert.equal(
    await page.getByText('드래그로 반복할 구간을 선택하세요.', { exact: true }).count(),
    0,
  );
  await button('▶ 구간 반복').click();
  assert.deepEqual(await request(), { from: 0, repeatAll: true });
  await button('■ 정지').click();
  const editor = page.getByLabel('악보 입력 영역', { exact: true });
  await editor.focus();
  await page.keyboard.press('Space');
  assert.deepEqual(await request(), { from: 0, repeatAll: true });
  await page.keyboard.press('Space');
  await page.keyboard.press('Shift+ArrowRight');
  await button('▶ 구간 반복').click();
  const rangeRequest = await request();
  assert.equal(rangeRequest.repeatAll, false);
  assert.ok(rangeRequest.loopEnd > rangeRequest.from);
  await button('■ 정지').click();
  await loop.uncheck();
  await button('▶ 선택 위치부터').click();
  assert.equal((await request()).repeatAll, false);
  assert.equal((await request()).loopEnd, undefined);
  await button('■ 정지').click();
  const checkTimelineGap = async () => {
    const track = await page.getByLabel('재생 시작 위치', { exact: true }).boundingBox();
    const controls = await Promise.all(
      [
        '.score-play',
        '.score-play-from-start',
        '.score-bpm',
        '.score-volume',
        '.score-transport-backing',
      ].map((s) => page.locator('.score-transport ' + s).boundingBox()),
    );
    assert.ok(
      track.y - Math.max(...controls.filter(Boolean).map((b) => b.y + b.height)) >= 12,
      `timeline separated from controls: ${track.y} / ${controls
        .filter(Boolean)
        .map((b) => b.y + b.height)
        .join(',')}`,
    );
  };
  await checkTimelineGap();
  await page.mouse.move(0, 0);
  if (process.env.SCORE_TEST_OUTPUT)
    await page.screenshot({ path: `${process.env.SCORE_TEST_OUTPUT}/expanded-desktop.png` });
  await button('원래 화면').click();
  assert.equal(await page.locator('.score-editor-viewport').getAttribute('data-expanded'), 'false');
  assert.equal(
    await page.locator('[data-persistent-media]').getAttribute('data-marker'),
    'mounted',
  );
  await button('악보 설정').click();
  assert.equal(await page.getByLabel('검증용 음색').inputValue(), '일렉트릭 기타');
  await button('악보 크게 보기').click();
  await button('음표·주법').click();
  await page.setViewportSize({ width: 390, height: 844 });
  await button('음표·주법').click();
  assert.equal(await page.getByLabel('선택 음표 길이').count(), 0);
  assert.equal(await page.getByRole('group', { name: '주법', exact: true }).isVisible(), true);
  await button('악보로 돌아가기').click();
  assert.equal(await page.locator('.score-workspace').isVisible(), true);
  await button('악보 확대').click();
  assert.equal(await page.locator('.score-expanded-view-controls > span').textContent(), '110%');
  assert.equal(
    await page
      .locator('.score-editor-viewport')
      .evaluate((e) => e.scrollWidth <= e.clientWidth + 1),
    true,
  );
  assert.equal(await backing.isVisible(), true);
  await checkTimelineGap();
  assert.equal(
    await page.locator('.score-transport').evaluate((e) => e.scrollWidth <= e.clientWidth + 1),
    true,
  );
  if (process.env.SCORE_TEST_OUTPUT)
    await page.screenshot({ path: `${process.env.SCORE_TEST_OUTPUT}/expanded-mobile.png` });
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('.score-editor-viewport').getAttribute('data-expanded'), 'false');
  assert.deepEqual(errors, []);
  console.log(
    'PASS expanded layout geometry, editing/undo, part mix, file menus, help, persistent media, exit and mobile inspector',
  );
} finally {
  await browser.close();
}
