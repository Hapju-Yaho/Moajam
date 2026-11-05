import { useState, useEffect } from 'react';
import type { AppRoute, ScreenProps } from '@app/navigation';
import { claimFirstHelpVisit, completeHelpVisit, type HelpScreen } from '@lib/helpVisits';
import { consumeHomeTourReplay, requestHomeTourReplay } from '@lib/homeTourSession';
export function useShellTour({
  contentKey,
  activeRoute,
  currentUserId,
  workspaceId,
  onNavigate,
  onCloseSwitcher,
}: {
  contentKey?: string;
  activeRoute: AppRoute;
  currentUserId: string;
  workspaceId?: string;
  onNavigate: ScreenProps['navigate'];
  onCloseSwitcher: () => void;
}) {
  const [tourOpen, setTourOpen] = useState(false);
  const [tourSidebar, setTourSidebar] = useState(false);
  useEffect(() => {
    setTourOpen(false);
    setTourSidebar(false);
    let active = true;
    const screen: HelpScreen | undefined =
      activeRoute === 'personal-home'
        ? 'main-home'
        : activeRoute === 'home'
          ? 'band-home'
          : activeRoute === 'practice'
            ? 'practice'
            : undefined;
    if (!screen || !currentUserId || (screen !== 'main-home' && !workspaceId)) return;
    if (activeRoute === 'personal-home' && consumeHomeTourReplay(currentUserId)) setTourOpen(true);
    void claimFirstHelpVisit(screen, currentUserId)
      .then((first) => {
        if (active && first) setTourOpen(true);
      })
      .catch(() => {
        // A failed visit request must not block the page or mark it as visited.
      });
    return () => {
      active = false;
    };
  }, [activeRoute, currentUserId, workspaceId, contentKey]);

  const closeTour = () => {
    setTourOpen(false);
    onCloseSwitcher();
  };
  const completeTour = () => {
    const screen: HelpScreen =
      activeRoute === 'practice' ? 'practice' : activeRoute === 'home' ? 'band-home' : 'main-home';
    void completeHelpVisit(screen, currentUserId).catch((error) => {
      console.error('도움말 완료 기록을 저장하지 못했습니다.', error);
    });
    closeTour();
  };
  const requestTour = () => {
    if (activeRoute !== 'personal-home' && activeRoute !== 'home' && activeRoute !== 'practice') {
      requestHomeTourReplay(currentUserId);
      onNavigate('personal-home');
    } else setTourOpen(true);
  };
  const onTourStep = (target: string) => {
    setTourSidebar(
      target.startsWith('tour-personal-') ||
        target.startsWith('tour-band-nav-') ||
        ['tour-band-space', 'tour-band-actions', 'tour-band-switcher', 'tour-band-menu'].includes(
          target,
        ),
    );
  };
  return { tourOpen, tourSidebar, closeTour, completeTour, requestTour, onTourStep };
}
