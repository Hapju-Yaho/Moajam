import styledNative from '@emotion/native';
import { isRedCalendarDate } from '@lib/koreanHolidays';
import { ScheduleModal } from './ScheduleModal';
import { usePersonalSchedules } from '@state/personalSchedules';
import { useState } from 'react';
import { Pressable, useWindowDimensions, View, type StyleProp, type ViewStyle } from 'react-native';
import {
  ActionButton,
  Copy,
  FlexBetween,
  FlexRow,
  Heading,
  Meta,
  Surface,
} from '@component/shared/ui/ProductUI';
import { AppIcon } from '@component/shared/icons';
import { dateKey } from '@mocks/workspaces';
import { useMockAppState } from '@state/MockAppState';
import type { ScreenProps } from '@app/navigation';

export type CalendarEvent = ReturnType<typeof useMockAppState>['allRehearsals'][number] & {
  personal?: boolean;
};
export function RehearsalCalendar({
  events,
  navigate,
  compact = false,
  overview = false,
  title,
  style,
  workspaceId,
  onSelectEvent,
  onSelectDate,
  initialDate,
  allowPersonal = false,
}: {
  events: CalendarEvent[];
  navigate: ScreenProps['navigate'];
  compact?: boolean;
  overview?: boolean;
  title?: string;
  style?: StyleProp<ViewStyle>;
  workspaceId?: string;
  onSelectEvent?: (event: CalendarEvent) => void;
  onSelectDate?: (date: string) => void;
  initialDate?: string;
  allowPersonal?: boolean;
}) {
  const personal = usePersonalSchedules();
  const [showPersonal, setShowPersonal] = useState(false);
  const calendarEvents =
    allowPersonal && showPersonal
      ? [
          ...events,
          ...personal.events.map((event) => ({
            ...event,
            personal: true,
            workspaceId: 'personal',
            bandName: '개인 일정',
            bandColor: '#8b5cf6',
          })),
        ]
      : events;
  const [registering, setRegistering] = useState(false);
  const today = dateKey(new Date());
  const [month, setMonth] = useState(() =>
    initialDate
      ? new Date(`${initialDate.slice(0, 7)}-01T00:00:00`)
      : new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  );
  const [selected, setSelected] = useState(initialDate ?? today);
  const { width } = useWindowDimensions();
  const narrow = width < 650;
  const offset = month.getDay();
  const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cells = Array.from(
    { length: Math.ceil((offset + days) / 7) * 7 },
    (_, index) => index - offset + 1,
  );
  const shift = (step: number) => {
    const next = new Date(month.getFullYear(), month.getMonth() + step, 1);
    setMonth(next);
    setSelected(dateKey(next));
  };
  const selectedEvents = calendarEvents.filter((event) => event.date === selected);
  return (
    <Surface style={style}>
      {title && (
        <RehearsalCalendarContainer>
          <Heading>{title}</Heading>
        </RehearsalCalendarContainer>
      )}
      <RehearsalCalendarHeader>
        <RehearsalCalendarHeading $overview={overview}>
          {month.getFullYear()}년 {month.getMonth() + 1}월
        </RehearsalCalendarHeading>
        <FlexRow wrap>
          {allowPersonal && (
            <RehearsalCalendarButton
              accessibilityRole="switch"
              accessibilityState={{ checked: showPersonal }}
              onPress={() => setShowPersonal(!showPersonal)}
              $showPersonal={showPersonal}
            >
              <RehearsalCalendarMeta $showPersonal={showPersonal}>
                개인일정 표기
              </RehearsalCalendarMeta>
            </RehearsalCalendarButton>
          )}
          <ActionButton secondary compact accessibilityLabel="이전 달" onPress={() => shift(-1)}>
            {overview ? (
              <RehearsalCalendarContainer2>
                <AppIcon name="chevron-right" size={16} color="#2563eb" />
              </RehearsalCalendarContainer2>
            ) : (
              '이전 달'
            )}
          </ActionButton>
          <ActionButton
            secondary
            compact
            onPress={() => {
              setMonth(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
              setSelected(today);
            }}
          >
            오늘
          </ActionButton>
          <ActionButton secondary compact accessibilityLabel="다음 달" onPress={() => shift(1)}>
            {overview ? <AppIcon name="chevron-right" size={16} color="#2563eb" /> : '다음 달'}
          </ActionButton>
        </FlexRow>
      </RehearsalCalendarHeader>
      {allowPersonal && showPersonal && personal.error && (
        <Meta>개인 일정을 불러오지 못했어요.</Meta>
      )}
      <RehearsalCalendarContainer3>
        {['일', '월', '화', '수', '목', '금', '토'].map((day) => (
          <RehearsalCalendarMeta2 key={day} $day={day}>
            {day}
          </RehearsalCalendarMeta2>
        ))}
      </RehearsalCalendarContainer3>
      <RehearsalCalendarContainer4>
        {cells.map((day, index) => {
          const valid = day > 0 && day <= days;
          const key = valid ? dateKey(new Date(month.getFullYear(), month.getMonth(), day)) : '';
          const daily = calendarEvents.filter((event) => event.date === key);
          return (
            <RehearsalCalendarButton2
              key={index}
              disabled={!valid}
              accessibilityRole="button"
              accessibilityLabel={valid ? `${key} 일정 ${daily.length}건` : undefined}
              accessibilityState={{ selected: selected === key }}
              onPress={() => {
                setSelected(key);
                onSelectDate?.(key);
              }}
              $overview={overview}
              $compact={compact}
              $narrow={narrow}
              $selected={selected}
              $key={key}
            >
              {valid && (
                <RehearsalCalendarCopy
                  $key={key}
                  $today={today}
                  $color={
                    isRedCalendarDate(key)
                      ? '#c83c4c'
                      : new Date(`${key}T12:00:00`).getDay() === 6 || key === today
                        ? '#416bd1'
                        : '#475569'
                  }
                >
                  {day}
                </RehearsalCalendarCopy>
              )}
              {overview ? (
                <RehearsalCalendarContainer5>
                  {daily.slice(0, 3).map((event) => (
                    <RehearsalCalendarContainer6
                      key={`${event.workspaceId}/${event.id}`}
                      $backgroundColor={event.cancelled ? '#cbd5e1' : event.bandColor}
                    />
                  ))}
                </RehearsalCalendarContainer5>
              ) : (
                daily.slice(0, compact || narrow ? 2 : 3).map((event) => (
                  <RehearsalCalendarContainer7
                    key={`${event.workspaceId}/${event.id}`}
                    $eventBandColor={event.bandColor}
                  >
                    <RehearsalCalendarMeta3
                      numberOfLines={1}
                      $narrow={narrow}
                      $eventBandColor={event.bandColor}
                    >
                      {event.cancelled ? '[취소] ' : ''}
                      {narrow ? event.start : event.title}
                    </RehearsalCalendarMeta3>
                  </RehearsalCalendarContainer7>
                ))
              )}
              {!overview && daily.length > (compact || narrow ? 2 : 3) && (
                <Meta>+{daily.length - (compact || narrow ? 2 : 3)}</Meta>
              )}
            </RehearsalCalendarButton2>
          );
        })}
      </RehearsalCalendarContainer4>
      <RehearsalCalendarHeader>
        <RehearsalCalendarHeading2>{selected} 일정</RehearsalCalendarHeading2>
        <ActionButton compact onPress={() => setRegistering(true)}>
          + 일정 등록
        </ActionButton>
      </RehearsalCalendarHeader>
      {selectedEvents.length ? (
        selectedEvents.map((event) => (
          <EventRow
            key={`${event.workspaceId}/${event.id}`}
            event={event}
            navigate={navigate}
            onSelect={onSelectEvent}
          />
        ))
      ) : (
        <Meta>이날은 등록된 일정이 없어요.</Meta>
      )}
      <ScheduleModal
        visible={registering}
        date={selected}
        workspaceId={workspaceId}
        onClose={() => setRegistering(false)}
      />
    </Surface>
  );
}
export function EventRow({
  event,
  navigate,
  onSelect,
}: {
  event: CalendarEvent;
  onSelect?: (event: CalendarEvent) => void;
  navigate: ScreenProps['navigate'];
}) {
  const [editing, setEditing] = useState(false);
  return (
    <>
      <EventRowButton
        accessibilityRole="button"
        accessibilityLabel={`${event.bandName} ${event.title} 보기`}
        onPress={() => (onSelect && !event.personal ? onSelect(event) : setEditing(true))}
      >
        <EventRowContainer>
          <Meta>{Number(event.date.slice(5, 7))}월</Meta>
          <Heading>{Number(event.date.slice(8))}</Heading>
        </EventRowContainer>
        <EventRowContainer2>
          <EventRowMeta $eventBandColor={event.bandColor}>{event.bandName}</EventRowMeta>
          <EventRowCopy>
            {event.title} · {event.start}–{event.end}
          </EventRowCopy>
          <Meta>{event.place}</Meta>
          {!!event.goal && <Meta>{event.goal}</Meta>}
        </EventRowContainer2>
        <Meta>→</Meta>
      </EventRowButton>
      <ScheduleModal
        visible={editing}
        date={event.date}
        event={event}
        workspaceId={event.personal ? undefined : event.workspaceId}
        onClose={() => setEditing(false)}
        onOpenRehearsal={
          event.personal
            ? undefined
            : () => {
                setEditing(false);
                navigate('rehearsals', { workspaceId: event.workspaceId, id: event.id });
              }
        }
      />
    </>
  );
}

const RehearsalCalendarContainer = styledNative(View)({ minHeight: 34, justifyContent: 'center' });

const RehearsalCalendarHeader = styledNative(FlexBetween)({ flexWrap: 'wrap' });

const RehearsalCalendarHeading = styledNative(Heading, {
  shouldForwardProp: (prop) => !prop.startsWith('$') && prop !== 'theme',
})<{ $overview: boolean }>(({ $overview }) => ($overview ? { fontSize: 16 } : undefined));

const RehearsalCalendarButton = styledNative(Pressable, {
  shouldForwardProp: (prop) => !prop.startsWith('$') && prop !== 'theme',
})<{ $showPersonal: boolean }>(({ $showPersonal }) => ({
  paddingTop: 8,
  paddingRight: 8,
  paddingBottom: 8,
  paddingLeft: 8,
  borderTopLeftRadius: 8,
  borderTopRightRadius: 8,
  borderBottomRightRadius: 8,
  borderBottomLeftRadius: 8,
  backgroundColor: $showPersonal ? '#2563eb' : '#e5e7eb',
}));

const RehearsalCalendarMeta = styledNative(Meta, {
  shouldForwardProp: (prop) => !prop.startsWith('$') && prop !== 'theme',
})<{ $showPersonal: boolean }>(({ $showPersonal }) => ({
  color: $showPersonal ? '#fff' : '#64748b',
}));

const RehearsalCalendarContainer2 = styledNative(View)({ transform: [{ rotate: '180deg' }] });

const RehearsalCalendarContainer3 = styledNative(View)({ flexDirection: 'row' });

const RehearsalCalendarMeta2 = styledNative(Meta, {
  shouldForwardProp: (prop) => !prop.startsWith('$') && prop !== 'theme',
})<{ $day: string }>(({ $day }) => ({
  width: `${100 / 7}%`,
  textAlign: 'center',
  color: $day === '일' ? '#d56e71' : $day === '토' ? '#416bd1' : '#72819a',
}));

const RehearsalCalendarContainer4 = styledNative(View)({ flexDirection: 'row', flexWrap: 'wrap' });

const RehearsalCalendarButton2 = styledNative(Pressable, {
  shouldForwardProp: (prop) => !prop.startsWith('$') && prop !== 'theme',
})<{ $overview: boolean; $compact: boolean; $narrow: boolean; $selected: string; $key: string }>(
  ({ $overview, $compact, $narrow, $selected, $key }) => ({
    width: `${100 / 7}%`,
    minHeight: $overview ? 44 : $compact || $narrow ? 64 : 96,
    alignItems: $overview ? 'center' : undefined,
    paddingTop: $narrow ? 3 : 6,
    paddingRight: $narrow ? 3 : 6,
    paddingBottom: $narrow ? 3 : 6,
    paddingLeft: $narrow ? 3 : 6,
    rowGap: 4,
    columnGap: 4,
    borderTopWidth: 1,
    borderTopColor: '#e8edf4',
    borderTopLeftRadius: 6,
    borderTopRightRadius: 6,
    borderBottomRightRadius: 6,
    borderBottomLeftRadius: 6,
    backgroundColor: $selected === $key ? '#edf3ff' : 'white',
  }),
);

const RehearsalCalendarCopy = styledNative(Copy, {
  shouldForwardProp: (prop) => !prop.startsWith('$') && prop !== 'theme',
})<{ $key: string; $today: string; $color: '#c83c4c' | '#416bd1' | '#475569' }>(
  ({ $key, $today, $color }) => ({
    fontSize: 12,
    fontWeight: $key === $today ? '600' : '500',
    color: $color,
  }),
);

const RehearsalCalendarContainer5 = styledNative(View)({
  flexDirection: 'row',
  rowGap: 3,
  columnGap: 3,
  minHeight: 5,
});

const RehearsalCalendarContainer6 = styledNative(View, {
  shouldForwardProp: (prop) => !prop.startsWith('$') && prop !== 'theme',
})<{ $backgroundColor: string }>(({ $backgroundColor }) => ({
  width: 4,
  height: 4,
  borderTopLeftRadius: 2,
  borderTopRightRadius: 2,
  borderBottomRightRadius: 2,
  borderBottomLeftRadius: 2,
  backgroundColor: $backgroundColor,
}));

const RehearsalCalendarContainer7 = styledNative(View, {
  shouldForwardProp: (prop) => !prop.startsWith('$') && prop !== 'theme',
})<{ $eventBandColor: string }>(({ $eventBandColor }) => ({
  paddingLeft: 4,
  paddingRight: 4,
  paddingTop: 2,
  paddingBottom: 2,
  borderTopLeftRadius: 4,
  borderTopRightRadius: 4,
  borderBottomRightRadius: 4,
  borderBottomLeftRadius: 4,
  backgroundColor: `${$eventBandColor}18`,
  borderLeftWidth: 2,
  borderLeftColor: $eventBandColor,
}));

const RehearsalCalendarMeta3 = styledNative(Meta, {
  shouldForwardProp: (prop) => !prop.startsWith('$') && prop !== 'theme',
})<{ $narrow: boolean; $eventBandColor: string }>(({ $narrow, $eventBandColor }) => ({
  fontSize: $narrow ? 9 : 10,
  color: $eventBandColor,
}));

const RehearsalCalendarHeading2 = styledNative(Heading)({ fontSize: 15 });

const EventRowButton = styledNative(Pressable)({
  flexDirection: 'row',
  alignItems: 'center',
  rowGap: 12,
  columnGap: 12,
  paddingTop: 10,
  paddingBottom: 10,
});

const EventRowContainer = styledNative(View)({
  width: 48,
  paddingTop: 9,
  paddingBottom: 9,
  borderTopLeftRadius: 10,
  borderTopRightRadius: 10,
  borderBottomRightRadius: 10,
  borderBottomLeftRadius: 10,
  backgroundColor: '#f1f5fb',
  alignItems: 'center',
});

const EventRowContainer2 = styledNative(View)({ flex: 1, rowGap: 2, columnGap: 2 });

const EventRowMeta = styledNative(Meta, {
  shouldForwardProp: (prop) => !prop.startsWith('$') && prop !== 'theme',
})<{ $eventBandColor: string }>(({ $eventBandColor }) => ({
  color: $eventBandColor,
  fontWeight: '500',
}));

const EventRowCopy = styledNative(Copy)({ fontWeight: '500' });
