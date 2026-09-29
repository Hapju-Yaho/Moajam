import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { dateKey } from '../mocks/workspaces';
import { Label } from '../styles/layout';
import { ActionButton, Copy, FlexBetween, FlexRow, Heading, Meta } from './ProductUI';
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
    <View style={{ gap: 14 }}>
      <View style={{ gap: 7 }}>
        <Label>날짜</Label>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`날짜 선택 ${date}`}
          accessibilityState={{ expanded: open === 'date' }}
          onPress={() => {
            setMonth(new Date(selected.getFullYear(), selected.getMonth(), 1));
            setOpen(open === 'date' ? null : 'date');
          }}
          style={{
            padding: 14,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: open === 'date' ? '#7395ef' : '#dce4ef',
            backgroundColor: '#f8faff',
          }}
        >
          <FlexBetween>
            <Copy style={{ fontWeight: '500' }}>
              {selected.getFullYear()}년 {selected.getMonth() + 1}월 {selected.getDate()}일 (
              {weekdays[selected.getDay()]})
            </Copy>
            <Meta>{open === 'date' ? '접기 ∧' : '달력 ∨'}</Meta>
          </FlexBetween>
        </Pressable>
      </View>
      {open === 'date' && (
        <View
          style={{ gap: 12, padding: 10, borderRadius: 16, borderWidth: 1, borderColor: '#e3e9f5' }}
        >
          <FlexBetween>
            <ActionButton
              secondary
              compact
              onPress={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}
            >
              이전 달
            </ActionButton>
            <Heading style={{ fontSize: 16 }}>
              {month.getFullYear()}년 {month.getMonth() + 1}월
            </Heading>
            <ActionButton
              secondary
              compact
              onPress={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}
            >
              다음 달
            </ActionButton>
          </FlexBetween>
          <View style={{ flexDirection: 'row' }}>
            {weekdays.map((day) => (
              <Meta
                key={day}
                style={{
                  width: `${100 / 7}%`,
                  textAlign: 'center',
                  color: day === '일' ? '#be5665' : '#72819a',
                }}
              >
                {day}
              </Meta>
            ))}
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            {Array.from({ length: Math.ceil((first + count) / 7) * 7 }, (_, i) => {
              const day = i - first + 1;
              if (day < 1 || day > count)
                return <View key={i} style={{ width: `${100 / 7}%`, height: 44 }} />;
              const key = dateKey(new Date(month.getFullYear(), month.getMonth(), day));
              const chosen = key === date;
              const today = key === dateKey(new Date());
              return (
                <Pressable
                  key={i}
                  accessibilityRole="button"
                  accessibilityLabel={`${key}${today ? ' 오늘' : ''}`}
                  accessibilityState={{ selected: chosen }}
                  onPress={() => {
                    onChange({ date: key });
                    setOpen(null);
                  }}
                  style={{
                    width: `${100 / 7}%`,
                    height: 44,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <View
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 18,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: chosen ? '#416bd1' : today ? '#edf3ff' : 'transparent',
                    }}
                  >
                    <Copy
                      style={{
                        color: chosen ? 'white' : i % 7 === 0 ? '#be5665' : '#27374e',
                        fontWeight: chosen || today ? '600' : '400',
                      }}
                    >
                      {day}
                    </Copy>
                  </View>
                </Pressable>
              );
            })}
          </View>
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
        </View>
      )}
      <FlexRow gap={12}>
        {(['start', 'end'] as const).map((field) => (
          <View key={field} style={{ flex: 1, gap: 7 }}>
            <Label>{field === 'start' ? '시작 시간' : '종료 시간'}</Label>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${field === 'start' ? '시작' : '종료'} 시간 선택 ${timeLabel(field === 'start' ? start : end)}`}
              accessibilityState={{ expanded: open === field }}
              onPress={() => setOpen(open === field ? null : field)}
              style={{
                padding: 14,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: open === field ? '#7395ef' : '#dce4ef',
                backgroundColor: open === field ? '#edf3ff' : '#f8faff',
              }}
            >
              <Copy
                style={{
                  fontSize: 20,
                  lineHeight: 28,
                  color: open === field ? '#315ccc' : '#27374e',
                  fontWeight: '500',
                }}
              >
                {timeLabel(field === 'start' ? start : end)}
              </Copy>
            </Pressable>
          </View>
        ))}
      </FlexRow>
      {(open === 'start' || open === 'end') && (
        <View style={{ gap: 12, padding: 14, backgroundColor: '#f8faff', borderRadius: 16 }}>
          <FlexBetween>
            <Heading style={{ fontSize: 16 }}>{active === 'start' ? '시작' : '종료'} 시간</Heading>
            <Meta>위아래로 넘겨 선택하세요</Meta>
          </FlexBetween>
          <FlexRow gap={8} style={{ alignItems: 'flex-start' }}>
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
          </FlexRow>
          <ActionButton secondary compact onPress={() => setOpen(null)}>
            시간 선택 완료
          </ActionButton>
        </View>
      )}
      <Meta
        accessibilityLiveRegion="polite"
        style={duration <= 0 ? { color: '#be3b4b' } : undefined}
      >
        {duration <= 0
          ? '종료 시간은 시작 시간 이후로 선택해주세요. (같은 날 기준)'
          : `총 ${Math.floor(duration / 60) ? `${Math.floor(duration / 60)}시간 ` : ''}${duration % 60 ? `${duration % 60}분` : ''}`}
      </Meta>
    </View>
  );
}
