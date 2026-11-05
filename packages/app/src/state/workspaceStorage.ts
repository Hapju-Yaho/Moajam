import type { Workspace } from '@mocks/workspaces';
import { readNative, writeNative } from '@lib/nativeStorage';
export type SavedWorkspaceState = {
  version: 1;
  workspaces: Workspace[];
  selectedWorkspaceId: string;
};
export function loadWorkspaceState(): SavedWorkspaceState | null {
  try {
    const state = readNative<SavedWorkspaceState>('workspaces');
    return state?.version === 1 && Array.isArray(state.workspaces) ? state : null;
  } catch {
    return null;
  }
}
export function saveWorkspaceState(state: SavedWorkspaceState): boolean {
  try {
    writeNative('workspaces', state);
    return true;
  } catch {
    return false;
  }
}
