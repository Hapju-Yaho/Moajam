import { api, serverConfigured } from './remote';
export type HelpScreen = 'main-home' | 'band-home' | 'practice';
const visited = new Set<string>();
const pending = new Map<string, Promise<boolean>>();
export function claimFirstHelpVisit(screen: HelpScreen, user: string): Promise<boolean> {
  const key = user + '/' + screen;
  const active = pending.get(key);
  if (active) return active;
  if (visited.has(key)) return Promise.resolve(false);
  const request = (
    serverConfigured
      ? api<{ firstVisit: boolean }>('/me/help-visits/' + screen, 'GET', undefined, user)
      : Promise.resolve({ firstVisit: true })
  )
    .then((result) => {
      if (!result.firstVisit) visited.add(key);
      return result.firstVisit;
    })
    .finally(() => {
      if (pending.get(key) === request) pending.delete(key);
    });
  pending.set(key, request);
  return request;
}
export async function completeHelpVisit(screen: HelpScreen, user: string): Promise<void> {
  if (serverConfigured) await api('/me/help-visits/' + screen, 'PUT', undefined, user);
  visited.add(user + '/' + screen);
}
