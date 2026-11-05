import styledNative from '@emotion/native';
import { isRedCalendarDate } from '@lib/koreanHolidays';
import { useState } from 'react';
import { Pressable, View, useWindowDimensions } from 'react-native';
import { dateKey } from '@mocks/workspaces';
import { Label } from '@styles/layout';
import {
  ActionButton,
  Copy,
  FlexBetween,
  FlexRow,
  Heading,
  Meta,
} from '@component/shared/ui/ProductUI';
import { TimeWheel } from './TimeWheel';

const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
const hours = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0'));
const minutes = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'));
function timeLabel(time: string) {
  const [hour, minute] = time.split(':').map(Number);
  return `${hour < 12 ? '오전' : '오후'} ${hour % 12 || 12}:${String(minute).padStart(2, '0')}`;
}

export function ScheduleDateTime({
  date,
  start,
  end,
  onChange,
}: {
  date: string;
  start: string;
  end: string;
  onChange: (change: Partial<{ date: string; start: string; end: string }>) => void;
}) {
  const { width } = useWindowDimensions();
  const compact = width < 480;
  const [open, setOpen] = useState<'date' | 'start' | 'end' | null>(null);
  const selected = new Date(`${date}T00:00:00`);
  const [month, setMonth] = useState(
    () => new Date(selected.getFullYear(), selected.getMonth(), 1),
  );
  const first = month.getDay();
  const count = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const active = open === 'end' ? 'end' : 'start';
  const [hour, minute] = (active === 'start' ? start : end).split(':').map(Number);
  const period = hour >= 12 ? 1 : 0;
  const changeTime = (h: number, m: number, p: number) =>
    onChange({
      [active]: `${String((h % 12) + p * 12).padStart(2, '0')}:${String(m).padStart(2, '0')}`,
    });
  const duration =
    Number(end.slice(0, 2)) * 60 +
    Number(end.slice(3)) -
    Number(start.slice(0, 2)) * 60 -
    Number(start.slice(3));
  return (
    <ScheduleDateTimeContainer>
      <ScheduleDateTimeContainer2>
        <Label>날짜</Label>
        <ScheduleDateTimeButton
          accessibilityRole="button"
          accessibilityLabel={`날짜 선택 ${date}`}
          accessibilityState={{ expanded: open === 'date' }}
          onPress={() => {
            setMonth(new Date(selected.getFullYear(), selected.getMonth(), 1));
            setOpen(open === 'date' ? null : 'date');
          }}
          $open={open}
        >
          <FlexBetween>
            <ScheduleDateTimeCopy>
              {selected.getFullYear()}년 {selected.getMonth() + 1}월 {selected.getDate()}일 (
              {weekdays[selected.getDay()]})
            </ScheduleDateTimeCopy>
            <Meta>{open === 'date' ? '접기 ∧' : '달력 ∨'}</Meta>
          </FlexBetween>
        </ScheduleDateTimeButton>
      </ScheduleDateTimeContainer2>
      {open === 'date' && (
        <ScheduleDateTimeContainer3>
          <ScheduleDateTimeHeader>
            <ActionButton
              accessibilityLabel="이전 달"
              secondary
              compact
              onPress={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}
            >
              {compact ? '‹' : '이전 달'}
            </ActionButton>
            <ScheduleDateTimeHeading>
              {month.getFullYear()}년 {month.getMonth() + 1}월
            </ScheduleDateTimeHeading>
            <ActionButton
              accessibilityLabel="다음 달"
              secondary
              compact
              onPress={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}
            >
              {compact ? '›' : '다음 달'}
            </ActionButton>
          </ScheduleDateTimeHeader>
          <ScheduleDateTimeContainer4>
            {weekdays.map((day) => (
              <ScheduleDateTimeMeta key={day} $day={day}>
                {day}
              </ScheduleDateTimeMeta>
            ))}
          </ScheduleDateTimeContainer4>
          <ScheduleDateTimeContainer5>
            {Array.from({ length: Math.ceil((first + count) / 7) * 7 }, (_, i) => {
              const day = i - first + 1;
              if (day < 1 || day > count) return <ScheduleDateTimeContainer6 key={i} />;
              const key = dateKey(new Date(month.getFullYear(), month.getMonth(), day));
              const chosen = key === date;
              const today = key === dateKey(new Date());
              return (
                <ScheduleDateTimeButton2
                  key={i}
                  accessibilityRole="button"
                  accessibilityLabel={`${key}${today ? ' 오늘' : ''}`}
                  accessibilityState={{ selected: chosen }}
                  onPress={() => {
                    onChange({ date: key });
                    setOpen(null);
                  }}
                >
                  <ScheduleDateTimeContainer7 $chosen={chosen} $today={today}>
                    <ScheduleDateTimeCopy2
                      $color={
                        isRedCalendarDate(key)
                          ? '#c83c4c'
                          : new Date(`${key}T12:00:00`).getDay() === 6 || chosen
                            ? '#416bd1'
                            : '#27374e'
                      }
                      $chosen={chosen}
                      $today={today}
                    >
                      {day}
                    </ScheduleDateTimeCopy2>
                  </ScheduleDateTimeContainer7>
                </ScheduleDateTimeButton2>
              );
            })}
          </ScheduleDateTimeContainer5>
          <ActionButton
            secondary
            compact
            onPress={() => {
              onChange({ date: dateKey(new Date()) });
              setOpen(null);
            }}
          >
            오늘 선택
          </ActionButton>
        </ScheduleDateTimeContainer3>
      )}
      <ScheduleDateTimeRow gap={12} $compact={compact}>
        {(['start', 'end'] as const).map((field) => (
          <ScheduleDateTimeContainer8 key={field} $compact={compact}>
            <Label>{field === 'start' ? '시작 시간' : '종료 시간'}</Label>
            <ScheduleDateTimeButton3
              accessibilityRole="button"
              accessibilityLabel={`${field === 'start' ? '시작' : '종료'} 시간 선택 ${timeLabel(field === 'start' ? start : end)}`}
              accessibilityState={{ expanded: open === field }}
              onPress={() => setOpen(open === field ? null : field)}
              $open={open}
              $field={field}
            >
              <ScheduleDateTimeCopy3 $open={open} $field={field}>
                {timeLabel(field === 'start' ? start : end)}
              </ScheduleDateTimeCopy3>
            </ScheduleDateTimeButton3>
          </ScheduleDateTimeContainer8>
        ))}
      </ScheduleDateTimeRow>
      {(open === 'start' || open === 'end') && (
        <ScheduleDateTimeContainer9>
          <FlexBetween>
            <ScheduleDateTimeHeading2>
              {active === 'start' ? '시작' : '종료'} 시간
            </ScheduleDateTimeHeading2>
            <Meta>위아래로 넘겨 선택하세요</Meta>
          </FlexBetween>
          <ScheduleDateTimeRow2 wrap={false} gap={8}>
            <TimeWheel
              key={`${active}-period`}
              label="오전 / 오후"
              values={['오전', '오후']}
              index={period}
              onChange={(p) => changeTime(hour % 12 || 12, minute, p)}
            />
            <TimeWheel
              key={`${active}-hour`}
              label="시"
              values={hours}
              index={(hour % 12 || 12) - 1}
              onChange={(h) => changeTime(h + 1, minute, period)}
            />
            <TimeWheel
              key={`${active}-minute`}
              label="분"
              values={minutes}
              index={minute}
              onChange={(m) => changeTime(hour % 12 || 12, m, period)}
            />
          </ScheduleDateTimeRow2>
          <ActionButton secondary compact onPress={() => setOpen(null)}>
            시간 선택 완료
          </ActionButton>
        </ScheduleDateTimeContainer9>
      )}
      <ScheduleDateTimeMeta2 accessibilityLiveRegion="polite" $duration={duration}>
        {duration <= 0
          ? '종료 시간은 시작 시간 이후로 선택해주세요. (같은 날 기준)'
          : `총 ${Math.floor(duration / 60) ? `${Math.floor(duration / 60)}시간 ` : ''}${duration % 60 ? `${duration % 60}분` : ''}`}
      </ScheduleDateTimeMeta2>
    </ScheduleDateTimeContainer>
  );
}

const ScheduleDateTimeContainer = styledNative(View)({ rowGap: 14, columnGap: 14 });

const ScheduleDateTimeContainer2 = styledNative(View)({ rowGap: 7, columnGap: 7 });

const ScheduleDateTimeButton = styledNative(Pressable, {
  shouldForwardProp: (prop) => !prop.startsWith('$') && prop !== 'theme',
})<{ $open: 'end' | 'start' | 'date' | null }>(({ $open }) => ({
  paddingTop: 14,
  paddingRight: 14,
  paddingBottom: 14,
  paddingLeft: 14,
  borderTopLeftRadius: 12,
  borderTopRightRadius: 12,
  borderBottomRightRadius: 12,
  borderBottomLeftRadius: 12,
  borderTopWidth: 1,
  borderRightWidth: 1,
  borderBottomWidth: 1,
  borderLeftWidth: 1,
  borderTopColor: $open === 'date' ? '#7395ef' : '#dce4ef',
  borderRightColor: $open === 'date' ? '#7395ef' : '#dce4ef',
  borderBottomColor: $open === 'date' ? '#7395ef' : '#dce4ef',
  borderLeftColor: $open === 'date' ? '#7395ef' : '#dce4ef',
  backgroundColor: '#f8faff',
}));

const ScheduleDateTimeCopy = styledNative(Copy)({ fontWeight: '500' });

const ScheduleDateTimeContainer3 = styledNative(View)({
  rowGap: 12,
  columnGap: 12,
  paddingTop: 10,
  paddingRight: 10,
  paddingBottom: 10,
  paddingLeft: 10,
  borderTopLeftRadius: 16,
  borderTopRightRadius: 16,
  borderBottomRightRadius: 16,
  borderBottomLeftRadius: 16,
  borderTopWidth: 1,
  borderRightWidth: 1,
  borderBottomWidth: 1,
  borderLeftWidth: 1,
  borderTopColor: '#e3e9f5',
  borderRightColor: '#e3e9f5',
  borderBottomColor: '#e3e9f5',
  borderLeftColor: '#e3e9f5',
});

const ScheduleDateTimeHeader = styledNative(FlexBetween)({
  flexWrap: 'nowrap',
  rowGap: 4,
  columnGap: 4,
});

const ScheduleDateTimeHeading = styledNative(Heading)({
  fontSize: 16,
  flex: 1,
  textAlign: 'center',
});

const ScheduleDateTimeContainer4 = styledNative(View)({ flexDirection: 'row' });

const ScheduleDateTimeMeta = styledNative(Meta, {
  shouldForwardProp: (prop) => !prop.startsWith('$') && prop !== 'theme',
})<{ $day: string }>(({ $day }) => ({
  width: `${100 / 7}%`,
  textAlign: 'center',
  color: $day === '일' ? '#be5665' : $day === '토' ? '#416bd1' : '#72819a',
}));

const ScheduleDateTimeContainer5 = styledNative(View)({ flexDirection: 'row', flexWrap: 'wrap' });

const ScheduleDateTimeContainer6 = styledNative(View)({ width: `${100 / 7}%`, height: 44 });

const ScheduleDateTimeButton2 = styledNative(Pressable)({
  width: `${100 / 7}%`,
  height: 44,
  alignItems: 'center',
  justifyContent: 'center',
});

const ScheduleDateTimeContainer7 = styledNative(View, {
  shouldForwardProp: (prop) => !prop.startsWith('$') && prop !== 'theme',
})<{ $chosen: boolean; $today: boolean }>(({ $chosen, $today }) => ({
  width: 36,
  maxWidth: '100%',
  height: 36,
  borderTopLeftRadius: 18,
  borderTopRightRadius: 18,
  borderBottomRightRadius: 18,
  borderBottomLeftRadius: 18,
  alignItems: 'center',
  justifyContent: 'center',
  backgroundColor: $chosen ? '#edf3ff' : $today ? '#edf3ff' : 'transparent',
}));

const ScheduleDateTimeCopy2 = styledNative(Copy, {
  shouldForwardProp: (prop) => !prop.startsWith('$') && prop !== 'theme',
})<{ $color: '#c83c4c' | '#416bd1' | '#27374e'; $chosen: boolean; $today: boolean }>(
  ({ $color, $chosen, $today }) => ({
    color: $color,
    fontWeight: $chosen || $today ? '600' : '400',
  }),
);

const ScheduleDateTimeRow = styledNative(FlexRow, {
  shouldForwardProp: (prop) => !prop.startsWith('$') && prop !== 'theme',
})<{ $compact: boolean }>(({ $compact }) =>
  $compact ? { flexDirection: 'column', alignItems: 'stretch' } : undefined,
);

const ScheduleDateTimeContainer8 = styledNative(View, {
  shouldForwardProp: (prop) => !prop.startsWith('$') && prop !== 'theme',
})<{ $compact: boolean }>(({ $compact }) => ({
  flex: $compact ? undefined : 1,
  minWidth: 0,
  rowGap: 7,
  columnGap: 7,
}));

const ScheduleDateTimeButton3 = styledNative(Pressable, {
  shouldForwardProp: (prop) => !prop.startsWith('$') && prop !== 'theme',
})<{ $open: 'end' | 'start' | 'date' | null; $field: 'end' | 'start' }>(({ $open, $field }) => ({
  paddingTop: 14,
  paddingRight: 14,
  paddingBottom: 14,
  paddingLeft: 14,
  borderTopLeftRadius: 12,
  borderTopRightRadius: 12,
  borderBottomRightRadius: 12,
  borderBottomLeftRadius: 12,
  borderTopWidth: 1,
  borderRightWidth: 1,
  borderBottomWidth: 1,
  borderLeftWidth: 1,
  borderTopColor: $open === $field ? '#7395ef' : '#dce4ef',
  borderRightColor: $open === $field ? '#7395ef' : '#dce4ef',
  borderBottomColor: $open === $field ? '#7395ef' : '#dce4ef',
  borderLeftColor: $open === $field ? '#7395ef' : '#dce4ef',
  backgroundColor: $open === $field ? '#edf3ff' : '#f8faff',
}));

const ScheduleDateTimeCopy3 = styledNative(Copy, {
  shouldForwardProp: (prop) => !prop.startsWith('$') && prop !== 'theme',
})<{ $open: 'end' | 'start' | 'date' | null; $field: 'end' | 'start' }>(({ $open, $field }) => ({
  fontSize: 20,
  lineHeight: 28,
  color: $open === $field ? '#315ccc' : '#27374e',
  fontWeight: '500',
}));

const ScheduleDateTimeContainer9 = styledNative(View)({
  rowGap: 12,
  columnGap: 12,
  paddingTop: 14,
  paddingRight: 14,
  paddingBottom: 14,
  paddingLeft: 14,
  backgroundColor: '#f8faff',
  borderTopLeftRadius: 16,
  borderTopRightRadius: 16,
  borderBottomRightRadius: 16,
  borderBottomLeftRadius: 16,
});

const ScheduleDateTimeHeading2 = styledNative(Heading)({ fontSize: 16 });

const ScheduleDateTimeRow2 = styledNative(FlexRow)({ alignItems: 'flex-start' });

const ScheduleDateTimeMeta2 = styledNative(Meta, {
  shouldForwardProp: (prop) => !prop.startsWith('$') && prop !== 'theme',
})<{ $duration: number }>(({ $duration }) => ($duration <= 0 ? { color: '#be3b4b' } : undefined));
