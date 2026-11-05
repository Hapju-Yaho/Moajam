import { useEffect, useState } from 'react';
import type { AppRoute } from '@app/navigation';
import { activeGroup, getShellRouteState } from './mainLayout.navigation';
export function useShellMenuState(activeRoute: AppRoute, entityId?: string, workspaceId?: string) {
  const [songsOpen, setSongsOpen] = useState(activeGroup(activeRoute, 'songs'));
  const [toolsOpen, setToolsOpen] = useState(
    getShellRouteState(activeRoute).toolsPage || activeRoute === 'band-score-editor',
  );
  useEffect(() => {
    setSongsOpen(activeGroup(activeRoute, 'songs'));
    if (getShellRouteState(activeRoute).toolsPage || activeRoute === 'band-score-editor')
      setToolsOpen(true);
  }, [activeRoute, entityId, workspaceId]);
  return { songsOpen, setSongsOpen, toolsOpen, setToolsOpen };
}
