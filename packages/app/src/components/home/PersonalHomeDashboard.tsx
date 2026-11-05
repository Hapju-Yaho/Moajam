import styledNative from '@emotion/native';
import type { ReactNode } from 'react';
import { useWindowDimensions, View, type ViewStyle } from 'react-native';
import type { ScreenProps } from '@app/navigation';
import type { CalendarEvent } from '@component/shared/schedule/RehearsalCalendar';
import { Meta } from '@component/shared/ui/ProductUI';
import { HomeSummary } from './HomeSummary';
import { HomeBandsSection } from './HomeBandsSection';
import { HomeUpcomingCard } from './HomeUpcomingCard';
import { HomeSongsCard } from './HomeSongsCard';
import { HomeScheduleSection } from './HomeScheduleSection';
import { homeLayout, homeCardStyle } from './home.styles';
import type { HomeBand, HomeSong, HomeStat } from './home.types';

export interface HomeNotificationLayout {
  height?: number;
  maxHeight?: number;
  headerMinHeight: number;
  style: ViewStyle;
}

export function PersonalHomeDashboard({
  bands,
  stats,
  upcoming,
  songs,
  filters,
  navigate,
  onOpenBand,
  onCreateBand,
  onOpenSong,
  onViewAllSongs,
  renderCalendar,
  renderNotifications,
}: {
  bands: HomeBand[];
  stats: HomeStat[];
  upcoming: CalendarEvent[];
  songs: HomeSong[];
  filters: ReactNode;
  navigate: ScreenProps['navigate'];
  onOpenBand: (id: string) => void;
  onCreateBand: () => void;
  onOpenSong: (song: HomeSong) => void;
  onViewAllSongs: () => void;
  renderCalendar: (style: ViewStyle) => ReactNode;
  renderNotifications: (layout: HomeNotificationLayout) => ReactNode;
}) {
  const { width } = useWindowDimensions();
  const mobile = width < homeLayout.mobileBreakpoint;
  const cardGap = homeLayout.cardGap;
  const cardPadding = mobile ? homeLayout.mobilePadding : homeLayout.desktopPadding;
  const cardStyle = homeCardStyle(mobile);

  return (
    <PersonalHomeDashboard2 nativeID="personal-home-dashboard">
      <HomeSummary stats={stats} mobile={mobile} />
      <HomeBandsSection
        bands={bands}
        onOpenBand={onOpenBand}
        onCreateBand={onCreateBand}
        mobile={mobile}
        cardGap={cardGap}
        cardPadding={cardPadding}
      />
      <PersonalHomeFilter nativeID="personal-home-filter">
        <Meta>일정·곡 모아보기</Meta>
        {filters}
      </PersonalHomeFilter>
      <PersonalHomeActivityRow
        nativeID="personal-home-activity-row"
        $mobile={mobile}
        $cardGap={cardGap}
      >
        <PersonalHomeUpcoming
          nativeID="personal-home-upcoming"
          events={upcoming}
          navigate={navigate}
          mobile={mobile}
          $cardPadding={cardPadding}
          $mobile={mobile}
        />
        <PersonalHomeDashboardHomeSongsCard
          songs={songs}
          onOpenSong={onOpenSong}
          onViewAll={onViewAllSongs}
          $cardPadding={cardPadding}
          $mobile={mobile}
        />
      </PersonalHomeActivityRow>
      <HomeScheduleSection
        nativeID="personal-home-calendar-area"
        sidebarID="personal-home-notifications"
        stacked={mobile}
        sidebarFirst
        calendar={renderCalendar(cardStyle)}
        renderSidebar={(calendarHeight, stacked) =>
          renderNotifications({
            height: stacked ? undefined : calendarHeight,
            maxHeight: stacked ? 340 : undefined,
            headerMinHeight: 34,
            style: cardStyle,
          })
        }
      />
    </PersonalHomeDashboard2>
  );
}

const PersonalHomeDashboard2 = styledNative(View)({
  rowGap: homeLayout.sectionGap,
  columnGap: homeLayout.sectionGap,
});

const PersonalHomeFilter = styledNative(View)({ rowGap: 8, columnGap: 8 });

const PersonalHomeActivityRow = styledNative(View, {
  shouldForwardProp: (prop) => !prop.startsWith('$') && prop !== 'theme',
})<{ $mobile: boolean; $cardGap: 16 }>(({ $mobile, $cardGap }) => ({
  flexDirection: $mobile ? 'column' : 'row',
  alignItems: 'stretch',
  rowGap: $cardGap,
  columnGap: $cardGap,
}));

const PersonalHomeUpcoming = styledNative(HomeUpcomingCard, {
  shouldForwardProp: (prop) => !prop.startsWith('$') && prop !== 'theme',
})<{ $cardPadding: 16 | 12; $mobile: boolean }>(({ $cardPadding, $mobile }) => ({
  ...{
    paddingTop: $cardPadding,
    paddingRight: $cardPadding,
    paddingBottom: $cardPadding,
    paddingLeft: $cardPadding,
    rowGap: homeLayout.contentGap,
    columnGap: homeLayout.contentGap,
    borderTopLeftRadius: homeLayout.cardRadius,
    borderTopRightRadius: homeLayout.cardRadius,
    borderBottomRightRadius: homeLayout.cardRadius,
    borderBottomLeftRadius: homeLayout.cardRadius,
  },
  width: $mobile ? '100%' : undefined,
  flex: $mobile ? undefined : 1,
}));

const PersonalHomeDashboardHomeSongsCard = styledNative(HomeSongsCard, {
  shouldForwardProp: (prop) => !prop.startsWith('$') && prop !== 'theme',
})<{ $cardPadding: 16 | 12; $mobile: boolean }>(({ $cardPadding, $mobile }) => ({
  ...{
    paddingTop: $cardPadding,
    paddingRight: $cardPadding,
    paddingBottom: $cardPadding,
    paddingLeft: $cardPadding,
    rowGap: homeLayout.contentGap,
    columnGap: homeLayout.contentGap,
    borderTopLeftRadius: homeLayout.cardRadius,
    borderTopRightRadius: homeLayout.cardRadius,
    borderBottomRightRadius: homeLayout.cardRadius,
    borderBottomLeftRadius: homeLayout.cardRadius,
  },
  width: $mobile ? '100%' : undefined,
  flex: $mobile ? undefined : 1,
}));
