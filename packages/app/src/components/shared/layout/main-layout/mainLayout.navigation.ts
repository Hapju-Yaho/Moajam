import type { AppRoute, ScreenProps, SongTab } from '@app/navigation';
import type { AppIconName } from '@component/shared/icons';
import type { ShellWorkspace, ShellSong } from './mainLayout.types';
export const bandItems: Array<{ icon: AppIconName; label: string; route: AppRoute }> = [
  { icon: 'home', label: '홈', route: 'home' },
  { icon: 'calendar', label: '합주', route: 'rehearsals' },
  { icon: 'songs', label: '참여 곡', route: 'songs' },
  { icon: 'users', label: '멤버', route: 'members' },
];

export const personalItems: typeof bandItems = [
  { icon: 'home', label: '홈', route: 'personal-home' },
  { icon: 'calendar', label: '합주 일정', route: 'personal-rehearsals' },
  { icon: 'users', label: '팀 관리', route: 'personal-songs' },
];

export const toolItems: typeof bandItems = [
  { icon: 'rehearsal', label: '악보 편집', route: 'score-editor' },
  { icon: 'microphone', label: '녹음실', route: 'track-editor' },
  { icon: 'headphones', label: '연습하기', route: 'personal-practice' },
];

export const pageTitles: Record<AppRoute, string> = {
  tools: '악보 편집',
  'track-editor': '녹음실',
  'work-management': '작업실',
  'personal-home': '홈',
  'personal-rehearsals': '합주 일정',
  'personal-songs': '팀 관리',
  'personal-practice': '연습하기',
  home: '홈',
  recommendations: '곡 추천',
  recommendation: '곡 추천 상세',
  songs: '참여 곡',
  song: '곡 상세',
  practice: '연습실',
  rehearsals: '합주',
  members: '멤버',
  instrument: '내 악기 추출',
  'score-editor': '악보 편집',
  'band-score-editor': '악보 프로젝트',
  settings: '설정',
  help: '도움말',
};

export const activeGroup = (current: AppRoute, target: AppRoute) => {
  if (target === 'tools' || target === 'score-editor')
    return ['tools', 'score-editor'].includes(current);
  if (target === 'track-editor') return ['track-editor', 'instrument'].includes(current);
  if (target === 'recommendations') return current === target || current === 'recommendation';
  if (target === 'songs')
    return ['songs', 'song', 'recommendations', 'recommendation', 'band-score-editor'].includes(
      current,
    );
  if (target === 'personal-practice') return current === 'personal-practice';
  return current === target;
};
export function getShellRouteState(activeRoute: AppRoute) {
  const personal = activeRoute.startsWith('personal-');
  const toolsPage = [
    'tools',
    'track-editor',
    'work-management',
    'instrument',
    'score-editor',
    'personal-practice',
  ].includes(activeRoute);
  const accountPage = activeRoute === 'settings' || activeRoute === 'help';
  const bandSpace = !personal && !toolsPage && !accountPage;
  const scoreEditorPage = activeRoute === 'score-editor' || activeRoute === 'band-score-editor';

  return { personal, toolsPage, accountPage, bandSpace, scoreEditorPage };
}
export function getShellCrumbs({
  activeRoute,
  workspace,
  adoptedSongs,
  entityId,
  songTab,
  onNavigate,
}: {
  activeRoute: AppRoute;
  workspace?: ShellWorkspace;
  adoptedSongs: ShellSong[];
  entityId?: string;
  songTab?: SongTab;
  onNavigate: ScreenProps['navigate'];
}) {
  const { personal, toolsPage, accountPage } = getShellRouteState(activeRoute);
  const spaceLabel = accountPage
    ? 'Moajam'
    : toolsPage
      ? '작업실'
      : personal
        ? '개인 공간'
        : (workspace?.name ?? '밴드 공간');
  const currentSong = adoptedSongs.find((song) => song.id === entityId);
  const crumbs: Array<{ label: string; onPress?: () => void }> = [];
  if (toolsPage) {
    crumbs.push({ label: '개인 공간', onPress: () => onNavigate('personal-home') });
    crumbs.push({ label: '작업실', onPress: () => onNavigate('work-management') });
  } else {
    crumbs.push({
      label: spaceLabel,
      onPress: () =>
        onNavigate(personal || accountPage ? 'personal-home' : 'home', {
          workspaceId: workspace?.id,
        }),
    });
  }
  if (activeRoute === 'song' || activeRoute === 'band-score-editor') {
    crumbs.push({
      label: '참여 곡',
      onPress: () => onNavigate('songs', { workspaceId: workspace?.id }),
    });
    crumbs.push({
      label: currentSong?.title ?? '곡 상세',
      onPress: songTab
        ? () => onNavigate('song', { id: entityId, workspaceId: workspace?.id, songTab: 'main' })
        : undefined,
    });
    const tabLabels: Partial<Record<SongTab, string>> = {
      discussion: '곡 의견',
      scores: '악보 보기',
      tracks: '작업실',
      overview: '곡 정보·합주 기록',
    };
    if (songTab && tabLabels[songTab]) crumbs.push({ label: tabLabels[songTab]! });
  } else {
    if (activeRoute === 'recommendations' || activeRoute === 'recommendation')
      crumbs.push({ label: '참여 곡', onPress: () => onNavigate('songs') });
    if (activeRoute === 'recommendation')
      crumbs.push({ label: '곡 추천', onPress: () => onNavigate('recommendations') });
    crumbs.push({
      label: pageTitles[activeRoute],
      onPress:
        toolsPage && currentSong
          ? () => onNavigate(activeRoute === 'track-editor' ? 'track-editor' : 'tools')
          : undefined,
    });
    if (toolsPage && currentSong) crumbs.push({ label: currentSong.title });
  }

  return crumbs;
}
