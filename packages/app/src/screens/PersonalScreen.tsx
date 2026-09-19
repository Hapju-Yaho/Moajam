import { useState } from 'react';
import { useIdentity } from '../state/Identity';
import { Pressable, ScrollView, useWindowDimensions, View } from 'react-native';
import { Notifications } from '../components/Notifications';
import { AppShell } from '../components/AppShell';
import {
  ActionButton,
  Copy,
  FlexBetween,
  FlexRow,
  Heading,
  Meta,
  PageDescription,
  PageHeading,
  PageTop,
  Pill,
  PillText,
  ResponsiveGrid,
  SongCover,
  Stack,
  StatTile,
  Surface,
} from '../components/ProductUI';
import { EventRow, RehearsalCalendar } from '../components/RehearsalCalendar';
import { useMockAppState } from '../state/MockAppState';
import type { AppRoute, ScreenProps } from '../navigation';
import { Input } from '../styles/layout';
import { conflictingRehearsals } from '../state/workspaceModel';
import { downloadText } from '../lib/platformActions';
import { dateKey } from '../mocks/workspaces';

export function PersonalScreen({ navigate, route }: ScreenProps & { route: AppRoute }) {
  const { workspaces, allSongs, allRehearsals, updatePreparation } = useMockAppState();
  const currentUserId = useIdentity();
  const { width } = useWindowDimensions();
  const [bandWidth, setBandWidth] = useState(900);
  const [calendarHeight, setCalendarHeight] = useState(600);
  const [bandFilter, setBandFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [preparationFilter, setPreparationFilter] = useState('all');
  const home = route === 'personal-home';
  const calendar = route === 'personal-rehearsals';
  const songs = allSongs
    .filter(
      (song) =>
        (bandFilter === 'all' || song.workspaceId === bandFilter) &&
        (preparationFilter === 'all' || song.myStatus === preparationFilter) &&
        `${song.title} ${song.artist}`.toLowerCase().includes(query.toLowerCase()),
    )
    .sort((a, b) => Number(a.myStatus === 'READY') - Number(b.myStatus === 'READY'));
  const events = allRehearsals.filter(
    (event) => bandFilter === 'all' || event.workspaceId === bandFilter,
  );
  const upcoming = events.filter((event) => new Date(`${event.date}T${event.end}`) >= new Date());
  const title = home ? '우리의 다음 합주' : calendar ? '합주 일정' : '참여 곡';
  const filtered = (
    <FlexRow wrap>
      <Pill active={bandFilter === 'all'} onPress={() => setBandFilter('all')}>
        <PillText active={bandFilter === 'all'}>모든 밴드</PillText>
      </Pill>
      {workspaces.map((band) => (
        <Pill key={band.id} active={bandFilter === band.id} onPress={() => setBandFilter(band.id)}>
          <PillText active={bandFilter === band.id}>{band.name}</PillText>
        </Pill>
      ))}
    </FlexRow>
  );
  const songRows = (home ? songs.slice(0, 4) : songs).map((song) => (
    <View
      key={`${song.workspaceId}/${song.id}`}
      style={{ paddingVertical: 14, borderTopWidth: 1, borderTopColor: '#edf1f6', gap: 10 }}
    >
      <FlexRow gap={12} style={{ alignItems: 'flex-start' }}>
        <SongCover id={song.id} size={52} />
        <View style={{ flex: 1, gap: 3 }}>
          <Meta style={{ color: song.bandColor, fontWeight: '500' }}>{song.bandName}</Meta>
          <Pressable
            accessibilityRole="button"
            onPress={() => navigate('song', { id: song.id, workspaceId: song.workspaceId })}
          >
            <Copy style={{ fontWeight: '500' }}>{song.title}</Copy>
          </Pressable>
          <Meta>
            {song.artist} · 내 파트 {song.myPart || '미배정'}
          </Meta>
        </View>
        {width >= 650 && (
          <ActionButton
            secondary
            compact
            onPress={() =>
              navigate('personal-practice', { id: song.id, workspaceId: song.workspaceId })
            }
          >
            연습하기 →
          </ActionButton>
        )}
      </FlexRow>
      <FlexRow wrap>
        <Meta>내 준비 상태</Meta>
        {(['NOT_READY', 'PRACTICING', 'READY'] as const).map((status, index) => (
          <Pill
            key={status}
            active={song.myStatus === status}
            onPress={() => updatePreparation(song.workspaceId, song.id, status)}
          >
            <PillText active={song.myStatus === status}>
              {['준비 전', '연습 중', '준비 완료'][index]}
            </PillText>
          </Pill>
        ))}
        {width < 650 && (
          <ActionButton
            secondary
            compact
            onPress={() =>
              navigate('personal-practice', { id: song.id, workspaceId: song.workspaceId })
            }
          >
            연습하기
          </ActionButton>
        )}
      </FlexRow>
    </View>
  ));
  return (
    <AppShell activeRoute={route} onNavigate={navigate}>
      <FlexBetween
        style={width < 650 ? { flexDirection: 'column', alignItems: 'stretch' } : undefined}
      >
        <PageTop>
          <PageHeading>{title}</PageHeading>
          <PageDescription>
            {home
              ? '함께할 밴드, 함께 맞출 곡. 나의 음악 활동을 한곳에서.'
              : calendar
                ? '내가 속한 모든 밴드의 합주를 한눈에 확인해요.'
                : '밴드마다 맡은 파트와 연습할 곡을 모아봐요.'}
          </PageDescription>
        </PageTop>
        {home && (
          <ActionButton onPress={() => navigate('personal-practice')}>연습하러 가기 →</ActionButton>
        )}
      </FlexBetween>
      {conflictingRehearsals(upcoming).length ? (
        <Surface tint="#fff7ed">
          <Heading>겹치는 합주 일정</Heading>
          {conflictingRehearsals(upcoming).map((event) => (
            <Meta key={`${event.workspaceId}/${event.id}`}>
              {event.date} {event.start}–{event.end} · {event.bandName}
            </Meta>
          ))}
        </Surface>
      ) : null}
      {calendar ? (
        <ActionButton
          secondary
          onPress={() => {
            const escape = (text: string) =>
              text
                .replaceAll('\\', '\\\\')
                .replaceAll(';', '\\;')
                .replaceAll(',', '\\,')
                .replaceAll('\n', '\\n');
            const lines = [
              'BEGIN:VCALENDAR',
              'VERSION:2.0',
              'PRODID:-//Moajam//Rehearsals//KO',
              ...events.flatMap((event) => [
                'BEGIN:VEVENT',
                `UID:${event.workspaceId}-${event.id}@moajam`,
                `DTSTAMP:${new Date()
                  .toISOString()
                  .replace(/[-:]/g, '')
                  .replace(/\.\d{3}/, '')}`,
                `DTSTART:${event.date.replaceAll('-', '')}T${event.start.replace(':', '')}00`,
                `DTEND:${event.date.replaceAll('-', '')}T${event.end.replace(':', '')}00`,
                `SUMMARY:${escape(event.bandName + ' · ' + event.title)}`,
                `LOCATION:${escape(event.place)}`,
                'END:VEVENT',
              ]),
              'END:VCALENDAR',
            ];
            downloadText('moajam-calendar.ics', lines.join('\r\n'), 'text/calendar');
          }}
        >
          캘린더 파일 내보내기
        </ActionButton>
      ) : null}
      {!calendar && !home ? (
        <FlexRow wrap>
          {['all', 'NOT_READY', 'PRACTICING', 'READY'].map((status, index) => (
            <Pill
              key={status}
              active={preparationFilter === status}
              onPress={() => setPreparationFilter(status)}
            >
              <PillText active={preparationFilter === status}>
                {['전체 곡', '준비 전', '연습 중', '준비 완료'][index]}
              </PillText>
            </Pill>
          ))}
        </FlexRow>
      ) : null}
      {home && (
        <>
          <FlexRow wrap>
            <StatTile icon="users" label="함께하는 밴드" value={`${workspaces.length}개`} />
            <StatTile icon="calendar" label="다가오는 합주" value={`${upcoming.length}회`} />
            <StatTile icon="songs" label="참여 곡" value={`${allSongs.length}곡`} />
          </FlexRow>
          <Heading>내 밴드</Heading>
          <View onLayout={(event) => setBandWidth(event.nativeEvent.layout.width)}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator
              contentContainerStyle={{ gap: 16, paddingBottom: 16 }}
            >
              {workspaces.map((band) => (
                <Pressable
                  key={band.id}
                  accessibilityRole="button"
                  accessibilityLabel={`${band.name} 밴드 홈`}
                  onPress={() => navigate('home', { workspaceId: band.id })}
                  style={{
                    width: width < 650 ? Math.max(240, bandWidth - 24) : (bandWidth - 32) / 3,
                    flexShrink: 0,
                  }}
                >
                  <Surface
                    style={{ borderTopWidth: 4, borderTopColor: band.color, minHeight: 150 }}
                  >
                    <Meta style={{ color: band.color, fontWeight: '500' }}>MY BAND</Meta>
                    <FlexBetween>
                      <Heading>{band.name}</Heading>
                      <Copy>↗</Copy>
                    </FlexBetween>
                    <Meta>{band.description}</Meta>
                    <Meta>
                      멤버 {band.members.length}명 · 내 파트{' '}
                      {band.members.find((member) => member.id === currentUserId)?.part}
                    </Meta>
                  </Surface>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </>
      )}
      {filtered}
      {home || calendar ? (
        <ResponsiveGrid stacked={width < 1100}>
          <View
            style={{
              flex: 1.65,
              minWidth: 0,
              alignSelf: 'flex-start',
              width: width < 1100 ? '100%' : undefined,
            }}
            onLayout={(event) => setCalendarHeight(event.nativeEvent.layout.height)}
          >
            <RehearsalCalendar events={events} navigate={navigate} compact={home} />
          </View>
          <Stack style={{ flex: 1, minWidth: 0 }}>
            <Surface style={{ height: calendarHeight / 2, minHeight: 230 }}>
              <Heading>다가오는 합주</Heading>
              <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator>
                {upcoming.map((event) => (
                  <EventRow
                    key={`${event.workspaceId}/${event.id}`}
                    event={event}
                    navigate={navigate}
                  />
                ))}
                {!upcoming.length && (
                  <Meta>예정된 합주가 없어요. 캘린더에서 다음 일정을 등록해보세요.</Meta>
                )}
              </ScrollView>
            </Surface>
            <Notifications title="최근 알림" height={Math.max(230, calendarHeight / 2 - 16)} />
          </Stack>
        </ResponsiveGrid>
      ) : null}
      {!calendar && (
        <Surface>
          <FlexBetween>
            <Heading>{home ? '연습할 곡' : `전체 ${songs.length}곡`}</Heading>
            {home && (
              <ActionButton secondary compact onPress={() => navigate('personal-songs')}>
                전체 보기 →
              </ActionButton>
            )}
          </FlexBetween>
          {!home && (
            <Input
              accessibilityLabel="참여 곡 검색"
              placeholder="곡 제목 또는 아티스트 검색"
              value={query}
              onChangeText={setQuery}
            />
          )}
          {songRows}
          {!songs.length && (
            <Meta>
              {query
                ? '검색 결과가 없어요.'
                : '아직 채택된 곡이 없어요. 밴드에서 연주할 곡을 함께 골라보세요.'}
            </Meta>
          )}
        </Surface>
      )}
      {home && (
        <Meta>오늘 {dateKey(new Date())} · 밴드에서 변경한 일정과 곡이 함께 반영됩니다.</Meta>
      )}
    </AppShell>
  );
}
