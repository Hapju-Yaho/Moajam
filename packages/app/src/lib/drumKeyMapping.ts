export const defaultDrumKeys = [
  { pitch: 46, label: '열린 하이햇', key: 'r' },
  { pitch: 42, label: '닫힌 하이햇', key: 't' },
  { pitch: 38, label: '스네어', key: 'g' },
  { pitch: 36, label: '킥', key: 'b' },
  { pitch: 50, label: '하이 탐', key: 'y' },
  { pitch: 47, label: '미들 탐', key: 'u' },
  { pitch: 43, label: '플로어 탐', key: 'j' },
];
export type DrumKeyMap = Record<number, string>;
export function readDrumKeys(value: unknown): DrumKeyMap {
  const result = Object.fromEntries(defaultDrumKeys.map((item) => [item.pitch, item.key]));
  if (!value || typeof value !== 'object') return result;
  const candidate = Object.fromEntries(
    defaultDrumKeys.map((item) => [
      item.pitch,
      String((value as DrumKeyMap)[item.pitch] ?? item.key).toLowerCase(),
    ]),
  );
  return validDrumKeys(candidate) ? candidate : result;
}
export function validDrumKeys(map: DrumKeyMap) {
  const keys = defaultDrumKeys.map((item) => map[item.pitch]);
  return keys.every((key) => /^[a-z]$/.test(key)) && new Set(keys).size === keys.length;
}
