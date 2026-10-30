export function parseScorePdfPages(
  text: string,
  total: number,
): { pages: number[]; error: string } {
  const invalid = {
    pages: [],
    error: `1~${total} 범위의 페이지를 입력해주세요. 예: 1,3,4 또는 1-3`,
  };
  if (!text.trim()) return { pages: [], error: '추출할 페이지를 입력해주세요.' };
  const pages = new Set<number>();
  for (const item of text.split(',')) {
    const match = /^\s*(\d+)\s*(?:-\s*(\d+)\s*)?$/.exec(item);
    if (!match) return invalid;
    const start = Number(match[1]),
      end = Number(match[2] ?? match[1]);
    if (
      !Number.isSafeInteger(start) ||
      !Number.isSafeInteger(end) ||
      start < 1 ||
      end < start ||
      end > total
    )
      return invalid;
    for (let page = start; page <= end; page++) pages.add(page);
  }
  return { pages: [...pages].sort((a, b) => a - b), error: '' };
}
