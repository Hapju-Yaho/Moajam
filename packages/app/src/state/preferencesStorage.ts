import { readNative, writeNative } from '@lib/nativeStorage';
export function loadPreferences(scope = 'm1'): Record<string, unknown> {
  try {
    return readNative(`preferences/${scope}`) ?? {};
  } catch {
    return {};
  }
}
export function savePreferences(value: unknown, scope = 'm1') {
  writeNative(`preferences/${scope}`, value);
}
