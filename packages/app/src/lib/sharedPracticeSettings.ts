/** Local listening preferences never participate in shared session changes. */
export function sharedPracticeSettings<T extends object>(document: T): T {
  const shared = { ...document } as T & { metronome?: unknown; clickVolume?: unknown };
  delete shared.metronome;
  delete shared.clickVolume;
  return shared;
}
