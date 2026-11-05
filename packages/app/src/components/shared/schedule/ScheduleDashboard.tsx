import styledNative from '@emotion/native';
import { useState } from 'react';
import { ScrollView, useWindowDimensions, View } from 'react-native';
import type { ScreenProps } from '@app/navigation';
import { EventRow, RehearsalCalendar, type CalendarEvent } from './RehearsalCalendar';
import { Notifications } from '@component/shared/notifications/Notifications';
import { Heading, Meta, ResponsiveGrid, Stack, Surface } from '@component/shared/ui/ProductUI';

export function ScheduleDashboard({
  events,
  navigate,
  compact = false,
  workspaceId,
  showNotifications = true,
  allowPersonal = !!workspaceId,
  initialDate,
  onSelectEvent,
  onSelectDate,
}: {
  events: CalendarEvent[];
  navigate: ScreenProps['navigate'];
  compact?: boolean;
  workspaceId?: string;
  showNotifications?: boolean;
  allowPersonal?: boolean;
  initialDate?: string;
  onSelectEvent?: (event: CalendarEvent) => void;
  onSelectDate?: (date: string) => void;
}) {
  const { width } = useWindowDimensions();
  const stacked = width < 1100;
  const [calendarHeight, setCalendarHeight] = useState(600);
  const upcoming = events
    .filter((event) => !event.cancelled && new Date(`${event.date}T${event.end}`) >= new Date())
    .sort((a, b) => `${a.date}T${a.start}`.localeCompare(`${b.date}T${b.start}`));
  const cardHeight = stacked
    ? 270
    : Math.max(230, showNotifications ? (calendarHeight - 16) / 2 : calendarHeight);
  return (
    <ResponsiveGrid stacked={stacked}>
      <ScheduleDashboardContainer
        $stacked={stacked}
        onLayout={(event) => setCalendarHeight(event.nativeEvent.layout.height)}
      >
        <RehearsalCalendar
          allowPersonal={allowPersonal}
          initialDate={initialDate}
          onSelectEvent={onSelectEvent}
          onSelectDate={onSelectDate}
          events={events}
          navigate={navigate}
          compact={compact}
          workspaceId={workspaceId}
        />
      </ScheduleDashboardContainer>
      <ScheduleDashboardStack gap={16} $stacked={stacked}>
        <ScheduleDashboardPanel $cardHeight={cardHeight}>
          <Heading>다가오는 일정</Heading>
          <ScheduleDashboardScroll showsVerticalScrollIndicator>
            {upcoming.map((event) => (
              <EventRow
                key={`${event.workspaceId}/${event.id}`}
                event={event}
                onSelect={onSelectEvent}
                navigate={navigate}
              />
            ))}
            {!upcoming.length && (
              <Meta>예정된 일정이 없어요. 캘린더에서 다음 일정을 등록해보세요.</Meta>
            )}
          </ScheduleDashboardScroll>
        </ScheduleDashboardPanel>
        {showNotifications && (
          <Notifications
            navigate={navigate}
            key={workspaceId ?? 'personal'}
            title="최근 알림"
            height={cardHeight}
            workspaceId={workspaceId}
          />
        )}
      </ScheduleDashboardStack>
    </ResponsiveGrid>
  );
}

const ScheduleDashboardContainer = styledNative(View, {
  shouldForwardProp: (prop) => !prop.startsWith('$') && prop !== 'theme',
})<{ $stacked: boolean }>(({ $stacked }) => ({
  flex: $stacked ? undefined : 1.65,
  minWidth: 0,
  alignSelf: 'flex-start',
  width: $stacked ? '100%' : undefined,
}));

const ScheduleDashboardStack = styledNative(Stack, {
  shouldForwardProp: (prop) => !prop.startsWith('$') && prop !== 'theme',
})<{ $stacked: boolean }>(({ $stacked }) => ({ flex: $stacked ? undefined : 1, minWidth: 0 }));

const ScheduleDashboardPanel = styledNative(Surface, {
  shouldForwardProp: (prop) => !prop.startsWith('$') && prop !== 'theme',
})<{ $cardHeight: number }>(({ $cardHeight }) => ({ height: $cardHeight }));

const ScheduleDashboardScroll = styledNative(ScrollView)({ flex: 1 });
