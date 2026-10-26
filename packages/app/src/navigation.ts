export type AppRoute =
  | 'tools'
  | 'track-editor'
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
  'scores',
  'tracks',
] as const;
export type SongTab = (typeof songTabs)[number];
export function parseSongTab(value?: string | null): SongTab {
  return songTabs.includes(value as SongTab) ? (value as SongTab) : 'main';
}
export interface NavigationOptions {
  focusId?: string;
  focusTime?: number;
  assetId?: string;
  projectId?: string;
  scoreView?: 'applied' | 'expanded';
  scorePart?: string;
  id?: string;
  workspaceId?: string;
  songTab?: SongTab;
  feedback?: boolean;
}

export interface ScreenProps {
  focusId?: string;
  focusTime?: number;
  assetId?: string;
  projectId?: string;
  scoreView?: 'applied' | 'expanded';
  scorePart?: string;
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
  const params = id
    ? new URLSearchParams({ workspaceId: bandId, songId: id })
    : new URLSearchParams();
  if (id && options?.scorePart) params.set('part', options.scorePart);
  if (id && options?.scoreView) params.set('view', options.scoreView);
  const query = id ? `?${params}` : '';
  const personalPaths: Partial<Record<AppRoute, string>> = {
    'personal-home': '/me',
    'personal-rehearsals': '/me/rehearsals',
    'personal-songs': '/me/songs',
    tools: '/tools',
    'track-editor': `/tools/tracks${query}`,
    instrument: '/tools/instrument-extractor',
    'score-editor': `/tools/scores/personal${query}`,
    'band-score-editor': id ? `/tools/scores${query}` : '/tools',
    settings: '/settings',
    help: '/help',
  };
  if (personalPaths[next]) return personalPaths[next]!;
  if (next === 'practice' || next === 'personal-practice')
    return id
      ? `${base}/songs/${encodeURIComponent(id)}?tab=tracks${options?.feedback ? '&feedback=true' : ''}`
      : '/tools';
  const songParams = new URLSearchParams();
  if (options?.songTab && options.songTab !== 'main') songParams.set('tab', options.songTab);
  if (options?.feedback) songParams.set('feedback', 'true');
  if (options?.focusId) songParams.set('focus', options.focusId);
  if (
    options?.focusTime !== undefined &&
    Number.isFinite(options.focusTime) &&
    options.focusTime >= 0
  )
    songParams.set('at', String(options.focusTime));
  if (options?.assetId) songParams.set('asset', options.assetId);
  if (options?.projectId) songParams.set('project', options.projectId);
  const songQuery = songParams.size ? `?${songParams}` : '';
  const paths: Partial<Record<AppRoute, string>> = {
    home: base,
    recommendations: `${base}/songs`,
    songs: `${base}/songs`,
    rehearsals: `${base}/rehearsals${options?.id ? `?sessionId=${encodeURIComponent(options.id)}` : ''}`,
    members: `${base}/members`,
    recommendation: options?.id
      ? `${base}/recommendations/${encodeURIComponent(options.id)}`
      : `${base}/recommendations`,
    song: id ? `${base}/songs/${encodeURIComponent(id)}${songQuery}` : `${base}/songs`,
  };
  return paths[next] ?? '/me';
}
