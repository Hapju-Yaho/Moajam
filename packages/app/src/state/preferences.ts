import { useSyncExternalStore } from 'react';
import { loadPreferences, savePreferences } from './preferencesStorage';
import { api, serverConfigured } from '../lib/remote';
import { readPersonal, writePersonal } from '../lib/personal-store';
import { mockProfile } from '../mocks/preferences';
import type { MemberPart } from '@moajam/domain';
export type Preferences = {
  name: string;
  bio: string;
  photo: string;
  parts: MemberPart[];
  push: boolean;
  email: boolean;
  reminder: boolean;
  bpm: number;
  countIn: number;
  metronome: boolean;
  volume: number;
};
const defaults: Preferences = {
  name: '뮤지션',
  bio: '',
  photo: '',
  parts: [],
  push: true,
  email: false,
  reminder: true,
  bpm: 120,
  countIn: 0,
  metronome: false,
  volume: 0.8,
};
let scope = 'm1';
let value: Preferences = {
  ...defaults,
  ...(!serverConfigured ? { ...mockProfile, ...loadPreferences() } : {}),
};
const listeners = new Set<() => void>();
export function activatePreferences(user: string, displayName?: string) {
  if (scope === user && !displayName) return;
  scope = user;
  value = {
    ...defaults,
    ...(user === 'm1' ? mockProfile : {}),
    ...loadPreferences(user),
    ...(displayName ? { name: displayName } : {}),
  };
  listeners.forEach((listener) => listener());
}
export async function loadRemotePreferences(
  user: string,
  displayName?: string,
  apply: () => boolean = () => true,
) {
  const stored = await readPersonal<Preferences>('preferences', user);
  if (!stored) {
    await api('/me', 'PUT', { displayName: displayName || '뮤지션' }, user);
  }
  if (!apply()) return;
  scope = user;
  value = { ...defaults, name: displayName || '뮤지션', bio: '', ...stored };
  listeners.forEach((listener) => listener());
}
export async function persistPreferences(next: Preferences) {
  const owner = scope;
  if (serverConfigured) {
    await writePersonal('preferences', next, owner);
    next = { ...next, ...(await readPersonal<Preferences>('preferences', owner)) };
  }
  if (owner !== scope) throw new Error('계정이 변경되었습니다.');
  updatePreferences(next);
  return next;
}
export function updatePreferences(next: Partial<Preferences>) {
  const updated = { ...value, ...next };
  if (!serverConfigured) savePreferences(updated, scope);
  value = updated;
  listeners.forEach((listener) => listener());
}
export function usePreferences() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    () => value,
    () => value,
  );
}
