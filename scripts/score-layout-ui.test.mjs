/* global document */
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
    `${process.env.SCORE_TEST_URL || 'http://127.0.0.1:4182'}/scripts/score-drums.browser.html?performance-notes=64`,
  );
  await page.getByRole('button', { name: '악보 설정', exact: true }).click();
  const gap = page.getByLabel('악보 줄 간격', { exact: true });
  assert.equal(await gap.inputValue(), '14');
  const measuredGap = () =>
    page.locator('.score-systems').evaluate((root) => {
      const rows = root.querySelectorAll('.score-system');
      return rows[1].getBoundingClientRect().top - rows[0].getBoundingClientRect().bottom;
    });
  assert.ok(Math.abs((await measuredGap()) - 14) < 0.1);
  await gap.fill('60');
  await gap.press('Enter');
  assert.ok(Math.abs((await measuredGap()) - 60) < 0.1);
  const restored = await page.evaluate(async () => {
    const score = JSON.parse(document.querySelector('pre[aria-label="악보 데이터"]').textContent);
    const { scoreToMusicXml } = await import('/packages/app/src/lib/score.ts');
    const { scoreFromMusicXml } = await import('/packages/app/src/lib/scoreImport.web.ts');
    const { serializeScoreFile, parseScoreFile } =
      await import('/packages/app/src/lib/scoreFile.ts');
    return {
      stored: score.systemGap,
      xml: scoreFromMusicXml(scoreToMusicXml(score)).systemGap,
      file: (
        await parseScoreFile(
          await serializeScoreFile({ score, referenceAudio: null, instrumentSample: null }),
        )
      ).score.systemGap,
    };
  });
  assert.deepEqual(restored, { stored: 60, xml: 60, file: 60 });
  await page.getByLabel('악보 입력 영역', { exact: true }).focus();
  await page.keyboard.press('Control+z');
  assert.ok(Math.abs((await measuredGap()) - 14) < 0.1);
  await gap.fill('0');
  await gap.press('Enter');
  assert.ok(Math.abs(await measuredGap()) < 0.1);
  await page.getByRole('button', { name: '기본 줄 간격', exact: true }).click();
  assert.ok(Math.abs((await measuredGap()) - 14) < 0.1);
  const geometry = [];
  for (const instrument of ['guitar', 'bass']) {
    await page.getByRole('button', { name: '음표·주법', exact: true }).click();
    await page.getByRole('button', { name: '악보 설정', exact: true }).click();
    await page.getByLabel('파트 악기와 튜닝', { exact: true }).selectOption(instrument);
    await page.getByRole('button', { name: '음표·주법', exact: true }).click();
    await page.getByRole('button', { name: '마디·표현', exact: true }).click();
    for (const fifths of [-7, 7]) {
      await page.getByLabel('조표', { exact: true }).selectOption(String(fifths));
      const result = await page
        .locator('.score-system')
        .first()
        .getByLabel('줄 시작 음자리표와 박자표')
        .evaluate((group) => {
          const keys = [
            ...group.querySelectorAll('[aria-label="조표 플랫"], [aria-label="조표 샵"]'),
          ];
          const last = keys.at(-1).getBBox();
          const meter = [...group.children]
            .filter((node) => node.getAttribute('font-weight') === '700')[0]
            .getBBox();
          return {
            size: keys[0].getAttribute('font-size'),
            spacing: Number(keys[1].getAttribute('x')) - Number(keys[0].getAttribute('x')),
            gap: meter.x - last.x - last.width,
          };
        });
      assert.equal(result.size, '22');
      assert.equal(result.spacing, 6);
      assert.ok(result.gap >= -0.1, `key signature overlaps meter: ${result.gap}px`);
      geometry.push({ instrument, fifths, ...result });
      if (process.env.SCORE_LAYOUT_OUTPUT)
        await page
          .locator('.score-system')
          .first()
          .screenshot({ path: `${process.env.SCORE_LAYOUT_OUTPUT}-${instrument}-${fifths}.png` });
    }
  }
  const compact = await page.evaluate(async () => {
    const { scorePdfMarkup } = await import('/packages/app/src/lib/scorePdf.web.tsx');
    const host = document.createElement('div');
    host.id = 'compact-score-check';
    host.style.cssText = 'width:900px;background:white;padding:12px';
    const score = {
      title: '베이스 줄 간격',
      bpm: 124,
      parts: ['Bass'],
      sync: {},
      instruments: { Bass: 'bass' },
      keySignature: -1,
      systemGap: 0,
      notes: Array.from({ length: 32 }, (_, i) => ({
        id: `space-${i}`,
        part: 'Bass',
        pitch: 36,
        beats: 1,
        rest: i < 28,
        accent: false,
        chord: '',
        lyric: '',
        tones: [{ pitch: 36, string: 4, fret: 8 }],
        ...(i === 28 ? { slurTo: 'space-30' } : {}),
      })),
    };
    host.innerHTML = scorePdfMarkup(score, 'Bass', true, 900);
    document.body.append(host);
    const rows = host.querySelectorAll('.score-system');
    const first = rows[0].getBoundingClientRect(),
      second = rows[1].getBoundingClientRect();
    // Bass TAB ends at y=250; the next standard staff starts at y=82.
    const lastTabY = rows[0].getScreenCTM().f + 250;
    const nextStaffY = rows[1].getScreenCTM().f + 82;
    const gap = nextStaffY - lastTabY;
    const dense = {
      ...score,
      notes: Array.from({ length: 64 }, (_, i) => ({
        id: `dense-${i}`,
        part: 'Bass',
        pitch: 36,
        beats: 0.0625,
        rest: false,
        accent: i === 0,
        chord: '',
        lyric: i === 0 ? '가사 확인' : '',
        tones: [{ pitch: 36, string: 4, fret: 8 }],
      })),
    };
    const denseHost = document.createElement('div');
    denseHost.innerHTML = scorePdfMarkup(dense, 'Bass', true, 900);
    host.append(denseHost);
    const overflows = [...host.querySelectorAll('[data-score-note], [data-tab-rhythm]')]
      .filter((note) => {
        const bounds = note.getBoundingClientRect(),
          row = note.closest('svg').getBoundingClientRect();
        return bounds.top < row.top - 1 || bounds.bottom > row.bottom + 1;
      })
      .map((node) => node.getAttribute('data-score-note') ?? node.getAttribute('data-tab-rhythm'));
    return { gap, firstRowHeight: first.height, secondRowHeight: second.height, overflows };
  });
  assert.ok(compact.gap < 80, `zero gap still leaves ${compact.gap}px`);
  assert.deepEqual(compact.overflows, []);
  if (process.env.SCORE_LAYOUT_OUTPUT)
    await page
      .locator('#compact-score-check')
      .screenshot({ path: `${process.env.SCORE_LAYOUT_OUTPUT}-compact.png` });
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify({ settings: 'gap, undo, reset, file/XML roundtrip passed', geometry, compact }),
  );
} finally {
  await browser.close();
}
