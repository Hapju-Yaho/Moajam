import { useCallback, useEffect, useState } from 'react';
import { loadPreferences, savePreferences } from './preferencesStorage';
export function useLocalMetronome(scope: string, defaultEnabled: boolean) {
  const key = `metronome/${scope}`;
  const read = useCallback(() => {
    const stored = loadPreferences(key);
    return {
      key,
      metronome: typeof stored.metronome === 'boolean' ? stored.metronome : defaultEnabled,
      clickVolume:
        typeof stored.clickVolume === 'number' && Number.isFinite(stored.clickVolume)
          ? Math.max(0, Math.min(1, stored.clickVolume))
          : 0.65,
    };
  }, [key, defaultEnabled]);
  const [settings, setSettings] = useState(read);
  useEffect(() => {
    setSettings(read());
  }, [read]);
  useEffect(() => {
    if (settings.key === key) {
      try {
        savePreferences({ metronome: settings.metronome, clickVolume: settings.clickVolume }, key);
      } catch {
        /* Keep in-memory preferences when browser storage is unavailable. */
      }
    }
  }, [key, settings]);
  return {
    metronome: settings.metronome,
    clickVolume: settings.clickVolume,
    setMetronome: (metronome: boolean) => setSettings((current) => ({ ...current, metronome })),
    setClickVolume: (clickVolume: number) =>
      setSettings((current) => ({ ...current, clickVolume })),
  };
}
