import { isRedCalendarDate } from '../lib/koreanHolidays';
import { ScheduleModal } from './ScheduleModal';
import { usePersonalSchedules } from '../state/personalSchedules';
import { useState } from 'react';
import { Pressable, useWindowDimensions, View } from 'react-native';
import { ActionButton, Copy, FlexBetween, FlexRow, Heading, Meta, Surface } from './ProductUI';
import { dateKey } from '../mocks/workspaces';
import { useMockAppState } from '../state/MockAppState';
import type { ScreenProps } from '../navigation';

export type CalendarEvent = ReturnType<typeof useMockAppState>['allRehearsals'][number] & {
  personal?: boolean;
};
export function RehearsalCalendar({
  events,
  navigate,
  compact = false,
  workspaceId,
  onSelectEvent,
  onSelectDate,
  initialDate,
  allowPersonal = false,
}: {
  events: CalendarEvent[];
  navigate: ScreenProps['navigate'];
  compact?: boolean;
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
    <Surface>
      <FlexBetween style={{ flexWrap: 'wrap' }}>
        <Heading>
          {month.getFullYear()}년 {month.getMonth() + 1}월
        </Heading>
        <FlexRow wrap>
          {allowPersonal && (
            <Pressable
              accessibilityRole="switch"
              accessibilityState={{ checked: showPersonal }}
              onPress={() => setShowPersonal(!showPersonal)}
              style={{
                padding: 8,
                borderRadius: 8,
                backgroundColor: showPersonal ? '#2563eb' : '#e5e7eb',
              }}
            >
              <Meta style={{ color: showPersonal ? '#fff' : '#64748b' }}>개인일정 표기</Meta>
            </Pressable>
          )}
          <ActionButton secondary compact onPress={() => shift(-1)}>
            이전 달
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
          <ActionButton secondary compact onPress={() => shift(1)}>
            다음 달
          </ActionButton>
        </FlexRow>
      </FlexBetween>
      {allowPersonal && showPersonal && personal.error && (
        <Meta>개인 일정을 불러오지 못했어요.</Meta>
      )}
      <View style={{ flexDirection: 'row' }}>
        {['일', '월', '화', '수', '목', '금', '토'].map((day) => (
          <Meta
            key={day}
            style={{
              width: `${100 / 7}%`,
              textAlign: 'center',
              color: day === '일' ? '#d56e71' : day === '토' ? '#416bd1' : '#72819a',
            }}
          >
            {day}
          </Meta>
        ))}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {cells.map((day, index) => {
          const valid = day > 0 && day <= days;
          const key = valid ? dateKey(new Date(month.getFullYear(), month.getMonth(), day)) : '';
          const daily = calendarEvents.filter((event) => event.date === key);
          return (
            <Pressable
              key={index}
              disabled={!valid}
              accessibilityRole="button"
              accessibilityLabel={valid ? `${key} 일정 ${daily.length}건` : undefined}
              accessibilityState={{ selected: selected === key }}
              onPress={() => {
                setSelected(key);
                onSelectDate?.(key);
              }}
              style={{
                width: `${100 / 7}%`,
                minHeight: compact || narrow ? 64 : 96,
                padding: narrow ? 3 : 6,
                gap: 4,
                borderTopWidth: 1,
                borderTopColor: '#e8edf4',
                borderRadius: 6,
                backgroundColor: selected === key ? '#edf3ff' : 'white',
              }}
            >
              {valid && (
                <Copy
                  style={{
                    fontSize: 12,
                    fontWeight: key === today ? '600' : '500',
                    color: isRedCalendarDate(key)
                      ? '#c83c4c'
                      : new Date(`${key}T12:00:00`).getDay() === 6 || key === today
                        ? '#416bd1'
                        : '#475569',
                  }}
                >
                  {day}
                </Copy>
              )}
              {daily.slice(0, compact || narrow ? 2 : 3).map((event) => (
                <View
                  key={`${event.workspaceId}/${event.id}`}
                  style={{
                    paddingHorizontal: 4,
                    paddingVertical: 2,
                    borderRadius: 4,
                    backgroundColor: `${event.bandColor}18`,
                    borderLeftWidth: 2,
                    borderLeftColor: event.bandColor,
                  }}
                >
                  <Meta
                    numberOfLines={1}
                    style={{ fontSize: narrow ? 9 : 10, color: event.bandColor }}
                  >
                    {event.cancelled ? '[취소] ' : ''}
                    {narrow ? event.start : event.title}
                  </Meta>
                </View>
              ))}
              {daily.length > (compact || narrow ? 2 : 3) && (
                <Meta>+{daily.length - (compact || narrow ? 2 : 3)}</Meta>
              )}
            </Pressable>
          );
        })}
      </View>
      <FlexBetween style={{ flexWrap: 'wrap' }}>
        <Heading style={{ fontSize: 15 }}>{selected} 일정</Heading>
        <ActionButton compact onPress={() => setRegistering(true)}>
          + 일정 등록
        </ActionButton>
      </FlexBetween>
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
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${event.bandName} ${event.title} 보기`}
        onPress={() => (onSelect && !event.personal ? onSelect(event) : setEditing(true))}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 }}
      >
        <View
          style={{
            width: 48,
            paddingVertical: 9,
            borderRadius: 10,
            backgroundColor: '#f1f5fb',
            alignItems: 'center',
          }}
        >
          <Meta>{Number(event.date.slice(5, 7))}월</Meta>
          <Heading>{Number(event.date.slice(8))}</Heading>
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Meta style={{ color: event.bandColor, fontWeight: '500' }}>{event.bandName}</Meta>
          <Copy style={{ fontWeight: '500' }}>
            {event.title} · {event.start}–{event.end}
          </Copy>
          <Meta>{event.place}</Meta>
          {!!event.goal && <Meta>{event.goal}</Meta>}
        </View>
        <Meta>→</Meta>
      </Pressable>
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
