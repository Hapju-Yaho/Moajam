import type { SavedWorkspaceState } from './workspaceStorage';
import type { Workspace } from '@mocks/workspaces';
const key = 'moajam-workspaces-v1';
function validWorkspace(value: unknown): value is Workspace {
  if (!value || typeof value !== 'object') return false;
  const band = value as Workspace;
  return (
    typeof band.id === 'string' &&
    typeof band.name === 'string' &&
    typeof band.color === 'string' &&
    typeof band.description === 'string' &&
    Array.isArray(band.members) &&
    band.members.every(
      (member) =>
        member &&
        ['id', 'name', 'part', 'role', 'initials', 'color'].every(
          (field) => typeof member[field as keyof typeof member] === 'string',
        ),
    ) &&
    Array.isArray(band.recommendations) &&
    band.recommendations.every(
      (song) =>
        song &&
        typeof song.id === 'string' &&
        typeof song.title === 'string' &&
        typeof song.artist === 'string',
    ) &&
    Array.isArray(band.adoptedSongs) &&
    band.adoptedSongs.every(
      (song) =>
        song &&
        typeof song.id === 'string' &&
        typeof song.title === 'string' &&
        typeof song.artist === 'string' &&
        typeof song.myPart === 'string' &&
        ['NOT_READY', 'PRACTICING', 'READY'].includes(song.myStatus) &&
        Number.isFinite(song.ready) &&
        Number.isFinite(song.total),
    ) &&
    Array.isArray(band.rehearsals) &&
    band.rehearsals.every(
      (event) =>
        event &&
        ['id', 'title', 'date', 'start', 'end', 'place', 'goal'].every(
          (field) => typeof event[field as keyof typeof event] === 'string',
        ),
    )
  );
}
export function loadWorkspaceState(): SavedWorkspaceState | null {
  try {
    const value = JSON.parse(localStorage.getItem(key) ?? 'null') as SavedWorkspaceState | null;
    if (
      value?.version !== 1 ||
      !Array.isArray(value.workspaces) ||
      !value.workspaces.every(validWorkspace)
    )
      return null;
    return {
      ...value,
      selectedWorkspaceId: value.workspaces.some((band) => band.id === value.selectedWorkspaceId)
        ? value.selectedWorkspaceId
        : (value.workspaces[0]?.id ?? ''),
    };
  } catch {
    return null;
  }
}
export function saveWorkspaceState(value: SavedWorkspaceState): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}
