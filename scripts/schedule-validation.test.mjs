import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Buffer } from 'node:buffer';
import { URL } from 'node:url';
import test from 'node:test';
import ts from 'typescript';
async function source(path) {
  let { outputText } = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  });
  outputText = outputText.replaceAll(
    "'@hyunbinseo/holidays-kr/all'",
    JSON.stringify(import.meta.resolve('@hyunbinseo/holidays-kr/all')),
  );
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
}
const { scheduleErrors } = await source('../packages/app/src/lib/scheduleValidation.ts');
const valid = { title: 'Practice', date: '2026-10-01', start: '18:00', end: '21:00' };
test('schedule accepts omitted memo and place, and explains each invalid field', () => {
  assert.deepEqual(scheduleErrors(valid), []);
  assert.match(scheduleErrors({ ...valid, title: ' ' })[0], /이름/);
  assert.match(scheduleErrors({ ...valid, date: '2026-02-30' })[0], /날짜/);
  assert.match(scheduleErrors({ ...valid, start: '25:00' })[0], /시작/);
  assert.match(scheduleErrors({ ...valid, end: '' })[0], /종료/);
  assert.match(scheduleErrors({ ...valid, end: '17:00' })[0], /시작 시간 이후/);
  assert.match(scheduleErrors(valid, false)[0], /팀/);
  assert.equal(scheduleErrors({ title: '', date: '', start: '', end: '' }, false).length, 5);
});
const { isRedCalendarDate, holidayNames } = await source(
  '../packages/app/src/lib/koreanHolidays.ts',
);
test('calendar marks Sundays, lunar holidays and substitute holidays red', () => {
  assert.equal(isRedCalendarDate('2026-10-04'), true);
  assert.equal(isRedCalendarDate('2026-10-05'), true);
  assert.equal(isRedCalendarDate('2026-09-25'), true);
  assert.equal(isRedCalendarDate('2026-10-07'), false);
  assert.ok(holidayNames('2026-10-05').length);
});
