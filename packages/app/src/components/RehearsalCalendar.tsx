import { ScheduleDialog } from './ScheduleDialog';
import { ScheduleModal } from './ScheduleModal';
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
  initialDate,
}: {
  events: CalendarEvent[];
  navigate: ScreenProps['navigate'];
  compact?: boolean;
  workspaceId?: string;
  onSelectEvent?: (event: CalendarEvent) => void;
  initialDate?: string;
}) {
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
  const selectedEvents = events.filter((event) => event.date === selected);
  return (
    <Surface>
      <FlexBetween style={{ flexWrap: 'wrap' }}>
        <Heading>
          {month.getFullYear()}년 {month.getMonth() + 1}월
        </Heading>
        <FlexRow>
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
      <View style={{ flexDirection: 'row' }}>
        {['일', '월', '화', '수', '목', '금', '토'].map((day) => (
          <Meta
            key={day}
            style={{
              width: `${100 / 7}%`,
              textAlign: 'center',
              color: day === '일' ? '#d56e71' : '#72819a',
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
          const daily = events.filter((event) => event.date === key);
          return (
            <Pressable
              key={index}
              disabled={!valid}
              accessibilityRole="button"
              accessibilityLabel={valid ? `${key} 일정 ${daily.length}건` : undefined}
              accessibilityState={{ selected: selected === key }}
              onPress={() => setSelected(key)}
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
                    color: key === today ? '#416bd1' : '#475569',
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
        onPress={() => (onSelect ? onSelect(event) : setEditing(true))}
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
      {!event.personal && (
        <ScheduleDialog visible={editing} onClose={() => setEditing(false)}>
          <View
            style={{
              flex: 1,
              padding: 20,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: 'rgba(16,29,53,0.48)',
            }}
          >
            <Surface style={{ width: '100%', maxWidth: 520 }}>
              <Heading>{event.title}</Heading>
              <Meta>{event.bandName}</Meta>
              <Copy>
                {event.date} · {event.start}–{event.end}
              </Copy>
              <Copy>{event.place || '장소 미정'}</Copy>
              <Copy>{event.goal || '등록된 메모가 없어요.'}</Copy>
              {event.cancelled && <Meta>취소된 합주입니다.</Meta>}
              <ActionButton
                secondary
                onPress={() => {
                  setEditing(false);
                  navigate('rehearsals', { workspaceId: event.workspaceId, id: event.id });
                }}
              >
                합주 상세 보기
              </ActionButton>
              <ActionButton onPress={() => setEditing(false)}>닫기</ActionButton>
            </Surface>
          </View>
        </ScheduleDialog>
      )}
      {event.personal && (
        <ScheduleModal
          visible={editing}
          date={event.date}
          event={event}
          onClose={() => setEditing(false)}
        />
      )}
    </>
  );
}
