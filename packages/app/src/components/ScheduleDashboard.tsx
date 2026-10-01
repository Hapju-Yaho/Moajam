import { useState } from 'react';
import { ScrollView, useWindowDimensions, View } from 'react-native';
import type { ScreenProps } from '../navigation';
import { EventRow, RehearsalCalendar, type CalendarEvent } from './RehearsalCalendar';
import { Notifications } from './Notifications';
import { Heading, Meta, ResponsiveGrid, Stack, Surface } from './ProductUI';

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
      <View
        style={{
          flex: stacked ? undefined : 1.65,
          minWidth: 0,
          alignSelf: 'flex-start',
          width: stacked ? '100%' : undefined,
        }}
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
      </View>
      <Stack gap={16} style={{ flex: stacked ? undefined : 1, minWidth: 0 }}>
        <Surface style={{ height: cardHeight }}>
          <Heading>다가오는 일정</Heading>
          <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator>
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
          </ScrollView>
        </Surface>
        {showNotifications && (
          <Notifications
            navigate={navigate}
            key={workspaceId ?? 'personal'}
            title="최근 알림"
            height={cardHeight}
            workspaceId={workspaceId}
          />
        )}
      </Stack>
    </ResponsiveGrid>
  );
}
