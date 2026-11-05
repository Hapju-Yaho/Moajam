import styledNative from '@emotion/native';
import { ScreenHelpButton } from '@component/shared/help/ScreenHelpButton';
import { useContext, useState, type ComponentProps } from 'react';
import { useIdentity } from '@state/Identity';
import { BandCreateContext } from '@component/shared/layout/BandCreateContext';
import { HomeHeader } from '@component/home/HomeHeader';
import { RehearsalCalendar } from '@component/shared/schedule/RehearsalCalendar';
import { Notifications } from '@component/shared/notifications/Notifications';
import { Pressable, useWindowDimensions, View } from 'react-native';
import { PersonalHomeDashboard } from '@component/home/PersonalHomeDashboard';
import { ScheduleDashboard } from '@component/shared/schedule/ScheduleDashboard';
import {
  ActionButton,
  Copy,
  FlexRow,
  Heading,
  Meta,
  Pill,
  PillText,
  SongCover,
  Surface,
} from '@component/shared/ui/ProductUI';
import { useMockAppState } from '@state/MockAppState';
import type { AppRoute, ScreenProps } from '@app/navigation';
import { Input } from '@styles/layout';
import { conflictingRehearsals } from '@state/workspaceModel';
import { downloadText } from '@lib/platformActions';
import { dateKey } from '@mocks/workspaces';
import { usePersonalSchedules } from '@state/personalSchedules';

export function PersonalScreen({ navigate, route }: ScreenProps & { route: AppRoute }) {
  const { workspaces, allSongs, allRehearsals } = useMockAppState();
  const personal = usePersonalSchedules();
  const currentUserId = useIdentity();
  const { width } = useWindowDimensions();
  const [bandFilter, setBandFilter] = useState('all');
  const [query, setQuery] = useState('');
  const home = route === 'personal-home';
  const calendar = route === 'personal-rehearsals';
  const songs = allSongs.filter(
    (song) =>
      (bandFilter === 'all' || bandFilter === 'personal' || song.workspaceId === bandFilter) &&
      `${song.title} ${song.artist}`.toLowerCase().includes(query.toLowerCase()),
  );
  const personalEvents = personal.events.map((event) => ({
    ...event,
    personal: true,
    workspaceId: 'personal',
    bandName: '개인 일정',
    bandColor: '#8963bd',
  }));
  const events = [...allRehearsals, ...personalEvents]
    .filter((event) => bandFilter === 'all' || event.workspaceId === bandFilter)
    .sort((a, b) => `${a.date}T${a.start}`.localeCompare(`${b.date}T${b.start}`));
  const upcoming = events.filter((event) => new Date(`${event.date}T${event.end}`) >= new Date());
  const title = home ? '나의 음악 활동' : calendar ? '내 캘린더' : '연습하기';
  const filtered = (
    <FlexRow wrap>
      <Pill
        accessibilityRole="button"
        accessibilityState={{ selected: bandFilter === 'all' }}
        active={bandFilter === 'all'}
        onPress={() => setBandFilter('all')}
      >
        <PillText active={bandFilter === 'all'}>
          {home || calendar ? '전체 일정' : '모든 밴드'}
        </PillText>
      </Pill>
      {(home || calendar) && (
        <Pill
          accessibilityRole="button"
          accessibilityState={{ selected: bandFilter === 'personal' }}
          active={bandFilter === 'personal'}
          onPress={() => setBandFilter('personal')}
        >
          <PillText active={bandFilter === 'personal'}>개인 일정</PillText>
        </Pill>
      )}
      {workspaces.map((band) => (
        <Pill
          key={band.id}
          accessibilityRole="button"
          accessibilityState={{ selected: bandFilter === band.id }}
          active={bandFilter === band.id}
          onPress={() => setBandFilter(band.id)}
        >
          <PillText active={bandFilter === band.id}>{band.name}</PillText>
        </Pill>
      ))}
    </FlexRow>
  );
  const songRows = (!home && !calendar ? songs : []).map((song) => (
    <PersonalScreenButton
      accessibilityRole="button"
      accessibilityLabel={`${song.bandName} ${song.title} 상세 보기`}
      onPress={() => navigate('song', { id: song.id, workspaceId: song.workspaceId })}
      key={`${song.workspaceId}/${song.id}`}
    >
      <PersonalScreenRow gap={12}>
        <SongCover
          id={song.id}
          thumbnailUrl={song.thumbnailUrl}
          referenceUrl={song.referenceUrl}
          size={52}
        />
        <PersonalScreenContainer>
          <PersonalScreenMeta $songBandColor={song.bandColor}>{song.bandName}</PersonalScreenMeta>

          <PersonalScreenCopy>{song.title}</PersonalScreenCopy>

          <Meta>
            {song.artist} · 내 파트 {song.myPart || '미배정'}
          </Meta>
        </PersonalScreenContainer>
      </PersonalScreenRow>
    </PersonalScreenButton>
  ));
  return (
    <>
      <HomeHeader
        title={title}
        stackAt={home ? 768 : 650}
        smallTitle={home}
        description={
          home
            ? '밴드 소식부터 합주 일정, 연습할 곡까지 한곳에서 확인하세요.'
            : calendar
              ? '나만의 개인 일정과 밴드에 공유된 팀 일정을 한눈에 확인해요.'
              : '밴드마다 맡은 파트와 연습할 곡을 모아봐요.'
        }
        actions={
          home && (
            <FlexRow wrap={false}>
              <ScreenHelpButton />
              <PersonalScreenContainer2 $width={width}>
                <ActionButton onPress={() => navigate('personal-practice')}>
                  연습하러 가기 →
                </ActionButton>
              </PersonalScreenContainer2>
            </FlexRow>
          )
        }
      />
      {conflictingRehearsals(upcoming).length ? (
        <Surface tint="#fff7ed">
          <Heading>겹치는 일정</Heading>
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
      {home && (
        <PersonalHomeContent
          bands={workspaces.map((band) => ({
            id: band.id,
            name: band.name,
            description: band.description,
            photo: band.photo,
            color: band.color,
            memberCount: band.members.length,
            myPart: band.members.find((member) => member.id === currentUserId)?.part || '미배정',
          }))}
          stats={[
            { icon: 'users', label: '함께하는 밴드', value: workspaces.length + '개' },
            {
              icon: 'calendar',
              label: '다가오는 일정',
              value: upcoming.filter((event) => !event.cancelled).length + '건',
            },
            { icon: 'songs', label: '참여 곡', value: allSongs.length + '곡' },
          ]}
          upcoming={upcoming.filter((event) => !event.cancelled)}
          songs={songs.slice(0, 4).map((song) => ({ ...song, myPart: song.myPart || '미배정' }))}
          onOpenBand={(id) => navigate('home', { workspaceId: id })}
          onOpenSong={(song) => navigate('song', { id: song.id, workspaceId: song.workspaceId })}
          onViewAllSongs={() => navigate('personal-practice')}
          renderCalendar={(style) => (
            <RehearsalCalendar
              title="합주 캘린더"
              style={style}
              events={events}
              navigate={navigate}
              compact
              overview
            />
          )}
          renderNotifications={(layout) => (
            <Notifications title="최근 알림" navigate={navigate} {...layout} />
          )}
          filters={filtered}
          navigate={navigate}
        />
      )}
      {!home && filtered}
      {(home || calendar) && personal.error && (
        <Meta accessibilityRole="alert">
          개인 일정을 불러오지 못했어요. 새로고침 후 다시 시도해주세요.
        </Meta>
      )}
      {calendar ? (
        <View nativeID="tour-home-calendar">
          <ScheduleDashboard events={events} navigate={navigate} />
        </View>
      ) : null}
      {!home && !calendar && (
        <Surface nativeID="tour-home-songs">
          <Heading>{`전체 ${songs.length}곡`}</Heading>
          <Input
            accessibilityLabel="참여 곡 검색"
            placeholder="곡 제목 또는 아티스트 검색"
            value={query}
            onChangeText={setQuery}
          />
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
    </>
  );
}

function PersonalHomeContent(
  props: Omit<ComponentProps<typeof PersonalHomeDashboard>, 'onCreateBand'>,
) {
  const onCreateBand = useContext(BandCreateContext);
  return <PersonalHomeDashboard {...props} onCreateBand={onCreateBand} />;
}

const PersonalScreenButton = styledNative(Pressable)({
  width: '100%',
  alignSelf: 'stretch',
  paddingTop: 14,
  paddingBottom: 14,
  borderTopWidth: 1,
  borderTopColor: '#edf1f6',
  rowGap: 10,
  columnGap: 10,
});

const PersonalScreenRow = styledNative(FlexRow)({ alignItems: 'flex-start' });

const PersonalScreenContainer = styledNative(View)({ flex: 1, rowGap: 3, columnGap: 3 });

const PersonalScreenMeta = styledNative(Meta, {
  shouldForwardProp: (prop) => !prop.startsWith('$') && prop !== 'theme',
})<{ $songBandColor: string }>(({ $songBandColor }) => ({
  color: $songBandColor,
  fontWeight: '500',
}));

const PersonalScreenCopy = styledNative(Copy)({ fontWeight: '500' });

const PersonalScreenContainer2 = styledNative(View, {
  shouldForwardProp: (prop) => !prop.startsWith('$') && prop !== 'theme',
})<{ $width: number }>(({ $width }) => ($width < 768 ? { flex: 1 } : undefined));
