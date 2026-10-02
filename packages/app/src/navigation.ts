export type AppRoute =
  | 'personal-home'
  | 'personal-rehearsals'
  | 'personal-songs'
  | 'personal-practice'
  | 'home'
  | 'recommendations'
  | 'recommendation'
  | 'songs'
  | 'song'
  | 'practice'
  | 'rehearsals'
  | 'members'
  | 'instrument'
  | 'score-editor'
  | 'band-score-editor'
  | 'settings'
  | 'help';

export const songTabs = [
  'main',
  'overview',
  'discussion',
  'resources',
  'practice',
  'history',
] as const;
export type SongTab = (typeof songTabs)[number];
export function parseSongTab(value?: string | null): SongTab {
  return songTabs.includes(value as SongTab) ? (value as SongTab) : 'main';
}
export interface NavigationOptions {
  id?: string;
  workspaceId?: string;
  songTab?: SongTab;
  feedback?: boolean;
}

export interface ScreenProps {
  navigate: (route: AppRoute, options?: NavigationOptions) => void;
  entityId?: string;
  songTab?: SongTab;
  feedback?: boolean;
}

export function buildAppPath(
  next: AppRoute,
  options: NavigationOptions | undefined,
  context: { route: AppRoute; workspaceId: string; entityId?: string },
) {
  const bandId = options?.workspaceId ?? context.workspaceId;
  const base = `/workspaces/${encodeURIComponent(bandId)}`;
  const id =
    options?.id ??
    (['song', 'practice', 'personal-practice'].includes(context.route)
      ? context.entityId
      : undefined);
  const personalPaths: Partial<Record<AppRoute, string>> = {
    'personal-home': '/me',
    'personal-rehearsals': '/me/rehearsals',
    'personal-songs': '/me/songs',
    instrument: '/me/instrument-extractor',
    'score-editor': id
      ? `/me/score-editor?${new URLSearchParams({ workspaceId: bandId, songId: id })}`
      : '/me/score-editor',
    settings: '/settings',
    help: '/help',
  };
  if (personalPaths[next]) return personalPaths[next]!;
  if (next === 'personal-practice')
    return id
      ? `/me/practice?${new URLSearchParams({ workspaceId: bandId, songId: id })}`
      : '/me/practice';
  const paths: Partial<Record<AppRoute, string>> = {
    'band-score-editor': id ? `${base}/songs/${encodeURIComponent(id)}/score` : `${base}/practice`,
    home: base,
    recommendations: `${base}/songs`,
    songs: `${base}/songs`,
    rehearsals: `${base}/rehearsals${options?.id ? `?sessionId=${encodeURIComponent(options.id)}` : ''}`,
    members: `${base}/members`,
    recommendation: options?.id
      ? `${base}/recommendations/${encodeURIComponent(options.id)}`
      : `${base}/recommendations`,
    song: id
      ? `${base}/songs/${encodeURIComponent(id)}${options?.songTab && options.songTab !== 'main' ? `?tab=${options.songTab}` : ''}`
      : `${base}/songs`,
    practice: id
      ? `${base}/songs/${encodeURIComponent(id)}/practice${options?.feedback ? '?feedback=true' : ''}`
      : `${base}/practice`,
  };
  return paths[next] ?? '/me';
}
