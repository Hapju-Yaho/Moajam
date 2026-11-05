import type { AppRoute, SongTab } from '@app/navigation';

// Route aliases share the same screen and must also share its menu and breadcrumbs.
export function getScreenLayout({
  route,
  entityId,
  songTab = 'main',
  hasSong,
  web,
}: {
  route: AppRoute;
  entityId?: string;
  songTab?: SongTab;
  hasSong: boolean;
  web: boolean;
}): { activeRoute: AppRoute; entityId?: string; songTab?: SongTab; hideSyncControls?: boolean } {
  if (route === 'song' || ((route === 'practice' || route === 'track-editor') && entityId)) {
    const tab = route === 'song' ? songTab : 'tracks';
    return {
      activeRoute: 'song',
      entityId: hasSong ? entityId : undefined,
      songTab: hasSong
        ? tab === 'resources'
          ? 'scores'
          : tab === 'practice'
            ? 'tracks'
            : tab === 'history'
              ? 'overview'
              : tab
        : undefined,
      hideSyncControls: hasSong,
    };
  }
  if (route === 'recommendations') return { activeRoute: 'songs' };
  if (route === 'practice') return { activeRoute: 'personal-practice' };
  if (route === 'band-score-editor')
    return { activeRoute: entityId ? route : 'tools', entityId: hasSong ? entityId : undefined };
  if (route === 'tools' || route === 'score-editor')
    return { activeRoute: 'score-editor', entityId: web ? undefined : entityId };
  return { activeRoute: route, hideSyncControls: web && route === 'personal-practice' };
}
