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
    `${process.env.SCORE_TEST_URL || 'http://127.0.0.1:4182'}/scripts/score-ensemble.browser.html`,
  );
  const button = (name) => page.getByRole('button', { name, exact: true });
  const state = async () => JSON.parse(await page.getByLabel('악보 데이터').innerText());
  const tabNames = () =>
    page
      .locator('.score-part-chip')
      .evaluateAll((nodes) => nodes.map((node) => node.dataset.partName));
  const partName = (name) =>
    page.locator('.score-part-name').filter({ hasText: new RegExp('^' + name + '$') });
  assert.equal(await page.locator('.score-part-grip').count(), 0);
  await button('파트 관리').click();
  assert.equal(await page.locator('.score-part-grip').count(), 3);
  assert.ok(
    (await button('파트 관리').boundingBox()).x < (await partName('기타 1').boundingBox()).x,
  );
  assert.deepEqual(await tabNames(), ['기타 1', '베이스', '키보드']);
  const original = await state();
  const selected = await page.getByLabel('선택 파트').innerText();
  await partName('기타 1').click();
  assert.equal(
    await page.getByLabel('선택 파트').innerText(),
    selected,
    'management must not select a part',
  );
  assert.equal(
    await page.getByRole('textbox', { name: '기타 1 파트 이름', exact: true }).count(),
    0,
  );
  await button('기타 1 이름 변경').click();
  await page.getByLabel('기타 1 파트 이름', { exact: true }).fill('리드 기타');
  await page.getByLabel('기타 1 파트 이름', { exact: true }).press('Enter');
  assert.deepEqual(await tabNames(), ['리드 기타', '베이스', '키보드']);
  const renamed = await state();
  assert.equal(renamed.instruments['리드 기타'], 'guitar');
  assert.deepEqual(
    renamed.notes.filter((n) => n.part === '리드 기타').map((n) => ({ ...n, part: '기타 1' })),
    original.notes.filter((n) => n.part === '기타 1'),
  );
  await button('리드 기타 이름 변경').click();
  await page.getByLabel('리드 기타 파트 이름', { exact: true }).fill('베이스');
  await page.getByLabel('리드 기타 파트 이름', { exact: true }).press('Enter');
  assert.match(await page.getByRole('alert').innerText(), /같은 이름/);
  assert.deepEqual(await state(), renamed);
  await page.getByLabel('리드 기타 파트 이름', { exact: true }).fill('');
  await page.getByLabel('리드 기타 파트 이름', { exact: true }).press('Enter');
  assert.match(await page.getByRole('alert').innerText(), /1~40/);
  await page.getByLabel('리드 기타 파트 이름', { exact: true }).press('Escape');
  assert.deepEqual(await state(), renamed, 'Escape must discard invalid draft');
  await button('베이스 이름 변경').click();
  const bassInput = page.getByLabel('베이스 파트 이름', { exact: true });
  await bassInput.fill('Bass');
  await bassInput.press('Tab');
  assert.deepEqual(await tabNames(), ['리드 기타', 'Bass', '키보드'], 'blur saves inline name');
  assert.equal(await page.getByLabel('선택 파트').innerText(), selected);
  await button('Bass 이름 변경').click();
  await page.getByLabel('Bass 파트 이름', { exact: true }).fill('베이스');
  await page.getByLabel('Bass 파트 이름', { exact: true }).press('Enter');
  // Editing a paired instrument while its left hand is selected keeps that hand selected.
  await page
    .getByRole('region', { name: '악보 성부 선택' })
    .getByRole('button', { name: '왼손 성부', exact: true })
    .click();
  const left = renamed.keyboardStaves['키보드'];
  assert.equal(await page.getByLabel('선택 파트').innerText(), left);
  await button('키보드 이름 변경').click();
  await page.getByLabel('키보드 파트 이름', { exact: true }).fill('피아노');
  await button('키보드 이름 저장').click();
  assert.equal(await page.getByLabel('선택 파트').innerText(), left);
  const beforeMove = await state();
  const grip = await button('피아노 순서 이동').boundingBox();
  const target = await partName('리드 기타').boundingBox();
  await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
  await page.mouse.down();
  await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 12 });
  await page.mouse.up();
  assert.deepEqual(await tabNames(), ['피아노', '리드 기타', '베이스']);
  const moved = await state();
  assert.deepEqual(moved.parts, ['피아노', left, '리드 기타', '베이스']);
  assert.deepEqual(moved.notes, beforeMove.notes);
  const textDrag = await partName('리드 기타').boundingBox();
  const textTarget = await partName('베이스').boundingBox();
  await page.mouse.move(textDrag.x + textDrag.width / 2, textDrag.y + textDrag.height / 2);
  await page.mouse.down();
  await page.mouse.move(textTarget.x + textTarget.width / 2, textTarget.y + textTarget.height / 2, {
    steps: 12,
  });
  await page.mouse.up();
  assert.equal(
    await page.getByLabel('선택 파트').innerText(),
    left,
    'dragging name must not select part',
  );
  assert.deepEqual(await tabNames(), ['피아노', '베이스', '리드 기타']);
  await button('리드 기타 순서 이동').focus();
  await page.keyboard.press('ArrowLeft');
  assert.deepEqual(await tabNames(), ['피아노', '리드 기타', '베이스']);
  await page.keyboard.press('ArrowRight');
  assert.deepEqual(await tabNames(), ['피아노', '베이스', '리드 기타']);
  const cancelGrip = await button('피아노 순서 이동').boundingBox();
  const cancelTarget = await partName('리드 기타').boundingBox();
  const beforeCancel = await state();
  await page.mouse.move(cancelGrip.x + cancelGrip.width / 2, cancelGrip.y + cancelGrip.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    cancelTarget.x + cancelTarget.width / 2,
    cancelTarget.y + cancelTarget.height / 2,
    { steps: 12 },
  );
  assert.deepEqual(await state(), beforeCancel, 'preview must not commit until release');
  await page.keyboard.press('Escape');
  await page.mouse.up();
  assert.deepEqual(await state(), beforeCancel, 'Escape must cancel drag');
  if (process.env.SCORE_TEST_OUTPUT)
    await page
      .locator('.score-parts-top')
      .screenshot({ path: `${process.env.SCORE_TEST_OUTPUT}/part-drag-handles.png` });
  await button('파트 관리').click();
  assert.equal(await page.locator('.score-part-grip').count(), 0);
  await button('베이스').click();
  assert.equal(
    await page.getByLabel('선택 파트').innerText(),
    '베이스',
    'normal mode must select parts',
  );
  await button('합주 악보').click();
  const names = await page
    .locator('.score-ensemble-system')
    .first()
    .locator('.score-staff-name')
    .allTextContents();
  assert.ok(
    names[0].includes('피아노') &&
      names[1].includes('피아노') &&
      names[2].includes('베이스') &&
      names[3].includes('리드 기타'),
  );
  await button('검증 XML 왕복').click();
  assert.match(await page.getByLabel('검증 결과').innerText(), /^XML 확인/);
  if (process.env.SCORE_TEST_OUTPUT)
    await page
      .locator('.score-parts')
      .screenshot({ path: `${process.env.SCORE_TEST_OUTPUT}/score-part-names-order.png` });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(
    await page.locator('.score-parts').evaluate((node) => node.scrollWidth <= node.clientWidth),
    true,
  );
  assert.deepEqual(errors, []);
  console.log(
    'PASS: settings position, selection lock, name/handle drag, keyboard grouped reordering, inline rename validation, active hand preservation, ensemble/XML and mobile layout',
  );
} finally {
  await browser.close();
}
