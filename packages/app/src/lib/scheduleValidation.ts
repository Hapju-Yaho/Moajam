export function scheduleErrors(
  draft: { title: string; date: string; start: string; end: string },
  teamAllowed = true,
) {
  const errors: string[] = [];
  if (!teamAllowed)
    errors.push('일정을 등록할 팀을 선택해주세요. 팀 일정은 해당 밴드 관리자만 등록할 수 있어요.');
  if (!draft.title.trim()) errors.push('일정 이름을 입력해주세요.');
  const date = new Date(`${draft.date}T00:00:00Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(draft.date) ||
    Number.isNaN(date.getTime()) ||
    date.toISOString().slice(0, 10) !== draft.date
  )
    errors.push('올바른 날짜를 선택해주세요.');
  const time = /^([01]\d|2[0-3]):[0-5]\d$/;
  if (!time.test(draft.start)) errors.push('합주 시작 시간을 확인해주세요.');
  if (!time.test(draft.end)) errors.push('합주 종료 시간을 확인해주세요.');
  if (time.test(draft.start) && time.test(draft.end) && draft.end <= draft.start)
    errors.push('합주 종료 시간은 시작 시간 이후로 선택해주세요.');
  return errors;
}
