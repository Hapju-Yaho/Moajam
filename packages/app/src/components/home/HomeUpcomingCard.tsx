import styledNative from '@emotion/native';
import { ScrollView, View, type StyleProp, type ViewStyle } from 'react-native';
import type { ScreenProps } from '@app/navigation';
import { EventRow, type CalendarEvent } from '@component/shared/schedule/RehearsalCalendar';
import {
  ActionButton,
  Copy,
  FlexBetween,
  Heading,
  Meta,
  PageHeading,
  Pill,
  PillText,
  Surface,
} from '@component/shared/ui/ProductUI';

export function HomeUpcomingCard({
  events,
  navigate,
  mobile = false,
  style,
  nativeID,
  title = '다가오는 일정',
  emptyMessage = '예정된 일정이 없어요. 캘린더에서 개인 일정을 등록해보세요.',
  featured = false,
  height,
  onOpenEvent,
  onCreateEvent,
}: {
  events: CalendarEvent[];
  navigate: ScreenProps['navigate'];
  mobile?: boolean;
  style?: StyleProp<ViewStyle>;
  nativeID?: string;
  title?: string;
  emptyMessage?: string;
  featured?: boolean;
  height?: number;
  onOpenEvent?: (event: CalendarEvent) => void;
  onCreateEvent?: () => void;
}) {
  const event = events[0];
  if (featured)
    return (
      <Surface nativeID={nativeID} style={style}>
        <FlexBetween>
          <Heading>{title}</Heading>
          {event && (
            <Pill tone="amber">
              <PillText tone="amber">예정</PillText>
            </Pill>
          )}
        </FlexBetween>
        {event ? (
          <>
            <HomeUpcomingCardPageHeading>{event.date}</HomeUpcomingCardPageHeading>
            <Copy>
              {event.title} · {event.start}–{event.end}
            </Copy>
            <Meta>{event.place}</Meta>
            <Meta>{event.goal}</Meta>
            <ActionButton secondary onPress={() => onOpenEvent?.(event)}>
              일정 보기 →
            </ActionButton>
          </>
        ) : (
          <>
            <Copy>{emptyMessage}</Copy>
            <ActionButton secondary onPress={onCreateEvent}>
              첫 합주 만들기
            </ActionButton>
          </>
        )}
      </Surface>
    );
  return (
    <HomeUpcomingCardPanel nativeID={nativeID} $height={height} style={style}>
      <HomeUpcomingCardContainer>
        <Heading>{title}</Heading>
      </HomeUpcomingCardContainer>
      <HomeUpcomingCardScroll $height={height} $mobile={mobile} nestedScrollEnabled>
        {events.map((event) => (
          <EventRow key={`${event.workspaceId}/${event.id}`} event={event} navigate={navigate} />
        ))}
        {!events.length && <Meta>{emptyMessage}</Meta>}
      </HomeUpcomingCardScroll>
    </HomeUpcomingCardPanel>
  );
}

const HomeUpcomingCardPageHeading = styledNative(PageHeading)({ fontSize: 24 });

const HomeUpcomingCardContainer = styledNative(View)({ minHeight: 34, justifyContent: 'center' });

const HomeUpcomingCardScroll = styledNative(ScrollView, {
  shouldForwardProp: (prop) => !prop.startsWith('$') && prop !== 'theme',
})<{ $height: number | undefined; $mobile: boolean }>(({ $height, $mobile }) =>
  $height !== undefined
    ? { flex: 1, minHeight: 0 }
    : { maxHeight: $mobile ? 284 : 340, flexGrow: $mobile ? 0 : 1 },
);

const HomeUpcomingCardPanel = styledNative(Surface, {
  shouldForwardProp: (prop) => !prop.startsWith('$') && prop !== 'theme',
})<{ $height: number | undefined }>(({ $height }) => [
  $height !== undefined && { height: $height },
]);
