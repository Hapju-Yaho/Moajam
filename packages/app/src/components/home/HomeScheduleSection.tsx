import styledNative from '@emotion/native';
import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { homeLayout } from './home.styles';

/** Keeps composition/layout local; screens supply calendar data and notification scope. */
export function HomeScheduleSection({
  calendar,
  renderSidebar,
  stacked,
  sidebarFirst = false,
  calendarFlex = 1,
  nativeID,
  sidebarID,
}: {
  calendar: ReactNode;
  renderSidebar: (calendarHeight: number, stacked: boolean) => ReactNode;
  stacked: boolean;
  sidebarFirst?: boolean;
  calendarFlex?: number;
  nativeID?: string;
  sidebarID?: string;
}) {
  const [calendarHeight, setCalendarHeight] = useState(450);
  const calendarPanel = (
    <TourHomeCalendar
      key="calendar"
      nativeID="tour-home-calendar"
      $stacked={stacked}
      $calendarFlex={calendarFlex}
    >
      <View onLayout={(event) => setCalendarHeight(event.nativeEvent.layout.height)}>
        {calendar}
      </View>
    </TourHomeCalendar>
  );
  const sidebar = (
    <HomeScheduleSectionContainer key="sidebar" nativeID={sidebarID} $stacked={stacked}>
      {renderSidebar(calendarHeight, stacked)}
    </HomeScheduleSectionContainer>
  );
  return (
    <HomeScheduleSectionContainer2 nativeID={nativeID} $stacked={stacked}>
      {stacked && sidebarFirst ? [sidebar, calendarPanel] : [calendarPanel, sidebar]}
    </HomeScheduleSectionContainer2>
  );
}

const TourHomeCalendar = styledNative(View, {
  shouldForwardProp: (prop) => !prop.startsWith('$') && prop !== 'theme',
})<{ $stacked: boolean; $calendarFlex: number }>(({ $stacked, $calendarFlex }) => ({
  flex: $stacked ? undefined : $calendarFlex,
  minWidth: 0,
}));

const HomeScheduleSectionContainer = styledNative(View, {
  shouldForwardProp: (prop) => !prop.startsWith('$') && prop !== 'theme',
})<{ $stacked: boolean }>(({ $stacked }) => ({
  flex: $stacked ? undefined : 1,
  minWidth: 0,
  rowGap: homeLayout.cardGap,
  columnGap: homeLayout.cardGap,
}));

const HomeScheduleSectionContainer2 = styledNative(View, {
  shouldForwardProp: (prop) => !prop.startsWith('$') && prop !== 'theme',
})<{ $stacked: boolean }>(({ $stacked }) => ({
  flexDirection: $stacked ? 'column' : 'row',
  alignItems: 'stretch',
  rowGap: homeLayout.cardGap,
  columnGap: homeLayout.cardGap,
}));
