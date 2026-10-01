import * as presets from '@hyunbinseo/holidays-kr/all';
// Official almanac-based datasets; update the package when a new year is published.
export function holidayNames(date: string): readonly string[] {
  const year = (presets as Record<string, Record<string, readonly string[]>>)[
    `y${date.slice(0, 4)}`
  ];
  return year?.[date] ?? [];
}
export function isRedCalendarDate(date: string) {
  return new Date(`${date}T00:00:00`).getDay() === 0 || holidayNames(date).length > 0;
}
