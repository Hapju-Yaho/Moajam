import { api, serverConfigured } from './remote';
import { loadPreferences, savePreferences } from '../state/preferencesStorage';

export function localWorkspaceOrder(user: string): string[] {
  const ids = loadPreferences(`team-order/${user}`)?.ids;
  return Array.isArray(ids)
    ? [...new Set(ids.filter((id): id is string => typeof id === 'string'))]
    : [];
}
export async function loadWorkspaceOrder(user: string, workspaceIds: string[]) {
  if (!serverConfigured) return localWorkspaceOrder(user);
  let saved = await api<{ ids: string[]; initialized: boolean }>(
    '/me/workspace-order',
    'GET',
    undefined,
    user,
  );
  if (!saved.initialized) {
    const allowed = new Set(workspaceIds);
    const legacy = localWorkspaceOrder(user).filter((id) => allowed.has(id));
    if (legacy.length)
      saved = await api('/me/workspace-order', 'PUT', { ids: legacy, initializeOnly: true }, user);
  }
  return saved.ids;
}
export async function saveWorkspaceOrder(user: string, ids: string[]) {
  if (serverConfigured)
    return (await api<{ ids: string[] }>('/me/workspace-order', 'PUT', { ids }, user)).ids;
  savePreferences({ ids }, `team-order/${user}`);
  return ids;
}
