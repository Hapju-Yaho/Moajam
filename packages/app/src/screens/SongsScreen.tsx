import { theme } from '@moajam/ui';
import { useState } from 'react';
import { Pressable, useWindowDimensions, View } from 'react-native';
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
  Progress,
  ProgressValue,
  ResponsiveGrid,
  SongCover,
  Stack,
  StatTile,
  Surface,
} from '../components/ProductUI';
import type { ScreenProps } from '../navigation';
import { useMockAppState, type AdoptedSong } from '../state/MockAppState';
import { Avatar, AvatarText, Input } from '../styles/layout';

export function SongsScreen({ navigate }: ScreenProps) {
  const { width } = useWindowDimensions();
  const { adoptedSongs } = useMockAppState();
  const [tab, setTab] = useState('전체');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('기본순');
  const visible = adoptedSongs
    .filter(
      (song) =>
        (tab === '보관함'
          ? song.archived
          : !song.archived &&
            (tab === '전체' ||
              (tab === '연습 중' ? song.status === 'PRACTICING' : song.status === 'READY'))) &&
        `${song.title} ${song.artist}`.toLowerCase().includes(query.trim().toLowerCase()),
    )
    .sort((a, b) =>
      sort === '곡 이름순'
        ? a.title.localeCompare(b.title, 'ko')
        : sort === '준비 낮은순'
          ? (a.total ? a.ready / a.total : 0) - (b.total ? b.ready / b.total : 0)
          : 0,
    );
  return (
    <AppShell activeRoute="songs" onNavigate={navigate}>
      <FlexBetween
        style={width < 650 ? { flexDirection: 'column', alignItems: 'stretch' } : undefined}
      >
        <PageTop>
          <PageHeading>채택곡</PageHeading>
          <PageDescription>
            우리 팀이 함께 완성해갈 곡과 준비 상태를 한눈에 확인하세요.
          </PageDescription>
        </PageTop>
        <ActionButton onPress={() => navigate('recommendations')}>+ 곡 추가</ActionButton>
      </FlexBetween>
      <FlexRow wrap>
        <StatTile
          icon="songs"
          label="활동 중인 곡"
          value={`${adoptedSongs.filter((song) => !song.archived).length}곡`}
        />
        <StatTile
          icon="rehearsal"
          label="연습 중"
          value={`${adoptedSongs.filter((song) => !song.archived && song.status === 'PRACTICING').length}곡`}
          color="#e49a13"
        />
        <StatTile
          icon="users"
          label="준비 완료"
          value={`${adoptedSongs.filter((song) => !song.archived && song.status === 'READY').length}곡`}
          color="#16a36a"
        />
        <StatTile
          icon="songs"
          label="보관 중"
          value={`${adoptedSongs.filter((song) => song.archived).length}곡`}
        />
      </FlexRow>
      <FlexBetween
        style={width < 650 ? { flexDirection: 'column', alignItems: 'stretch' } : undefined}
      >
        <FlexRow wrap>
          {['전체', '연습 중', '준비 완료', '보관함'].map((item) => (
            <Pill
              key={item}
              accessibilityRole="button"
              accessibilityState={{ selected: tab === item }}
              active={tab === item}
              onPress={() => setTab(item)}
            >
              <PillText active={tab === item}>{item}</PillText>
            </Pill>
          ))}
        </FlexRow>
        <View style={{ width: width < 650 ? '100%' : Math.min(300, width * 0.4) }}>
          <Input value={query} onChangeText={setQuery} placeholder="곡 또는 아티스트 검색" />
        </View>
      </FlexBetween>
      <FlexRow wrap>
        <Meta>{visible.length}곡</Meta>
        {['기본순', '곡 이름순', '준비 낮은순'].map((value) => (
          <Pill
            key={value}
            accessibilityRole="button"
            accessibilityState={{ selected: sort === value }}
            active={sort === value}
            onPress={() => setSort(value)}
          >
            <PillText active={sort === value}>{value}</PillText>
          </Pill>
        ))}
      </FlexRow>
      {visible.length === 0 ? (
        <Surface>
          <Heading>
            {adoptedSongs.length ? '조건에 맞는 곡이 없어요' : '아직 채택한 곡이 없어요'}
          </Heading>
          <Meta>
            {adoptedSongs.length
              ? '검색어나 준비 상태 필터를 바꿔보세요.'
              : '곡 추천에서 함께 연습할 곡을 채택해보세요.'}
          </Meta>
          <ActionButton
            secondary
            onPress={() => {
              if (!adoptedSongs.length) navigate('recommendations');
              else {
                setQuery('');
                setTab('전체');
              }
            }}
          >
            {adoptedSongs.length ? '검색과 필터 초기화' : '추천곡 보러가기'}
          </ActionButton>
        </Surface>
      ) : null}
      <ResponsiveGrid stacked={width < 920}>
        <Stack gap={16} style={width < 920 ? undefined : { flex: 1 }}>
          {visible
            .filter((_, index) => width < 920 || index % 2 === 0)
            .map((song) => (
              <SongTile key={song.id} song={song} navigate={navigate} />
            ))}
        </Stack>
        <Stack gap={16} style={width < 920 ? undefined : { flex: 1 }}>
          {visible
            .filter((_, index) => width >= 920 && index % 2 === 1)
            .map((song) => (
              <SongTile key={song.id} song={song} navigate={navigate} />
            ))}
          <Pressable onPress={() => navigate('recommendations')}>
            <Surface
              tint="#f7f9ff"
              style={{ minHeight: 180, alignItems: 'center', justifyContent: 'center' }}
            >
              <Heading>다음 연습곡을 찾고 있나요?</Heading>
              <Meta>멤버가 추천한 곡을 보고 함께 투표해보세요.</Meta>
              <ActionButton secondary onPress={() => navigate('recommendations')}>
                곡 추천 보러가기
              </ActionButton>
            </Surface>
          </Pressable>
        </Stack>
      </ResponsiveGrid>
    </AppShell>
  );
}

function SongTile({ song, navigate }: { song: AdoptedSong; navigate: ScreenProps['navigate'] }) {
  const { members, rehearsals } = useMockAppState();
  const participants = members.filter((member) => song.participants?.[member.id]);
  const nextSession = rehearsals
    .filter(
      (event) =>
        event.songIds?.includes(song.id) &&
        !event.cancelled &&
        new Date(`${event.date}T${event.end}`) >= new Date(),
    )
    .sort((a, b) => `${a.date}${a.start}`.localeCompare(`${b.date}${b.start}`))[0];
  const { width } = useWindowDimensions();
  return (
    <Surface>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${song.title} 상세 보기`}
        onPress={() => navigate('song', { id: song.id })}
      >
        <FlexRow gap={16}>
          <SongCover id={song.id} thumbnailUrl={song.thumbnailUrl} size={width < 650 ? 72 : 104} />
          <View style={{ flex: 1, minWidth: 0, gap: 7 }}>
            <FlexBetween>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Heading>{song.title}</Heading>
                <Meta>
                  {song.artist} · {song.year}
                </Meta>
              </View>
              <Pill tone={song.status === 'READY' ? 'green' : 'amber'}>
                <PillText tone={song.status === 'READY' ? 'green' : 'amber'}>
                  {song.archived
                    ? '보관 중'
                    : !song.total
                      ? '파트 미배정'
                      : song.status === 'READY'
                        ? '준비 완료'
                        : '연습 중'}
                </PillText>
              </Pill>
            </FlexBetween>
            <FlexBetween>
              <Meta>파트 준비도</Meta>
              <Copy style={{ fontWeight: '600' }}>
                {song.ready} / {song.total}
              </Copy>
            </FlexBetween>
            <Progress>
              <ProgressValue
                value={song.total ? (song.ready / song.total) * 100 : 0}
                color={song.status === 'READY' ? '#16a36a' : theme.colors.primary}
              />
            </Progress>
            <FlexBetween>
              <FlexRow>
                {participants.slice(0, 3).map((member) => (
                  <Avatar key={member.id} size={28} color={member.color}>
                    <AvatarText>{member.initials}</AvatarText>
                  </Avatar>
                ))}
                {participants.length > 3 && <Meta>+{participants.length - 3}</Meta>}
                {!participants.length && <Meta>참여자 미배정</Meta>}
              </FlexRow>
              <Meta>의견 {song.comments}</Meta>
            </FlexBetween>
          </View>
        </FlexRow>
      </Pressable>
      <Meta>
        {nextSession ? `다음 합주 · ${nextSession.date} ${nextSession.start}` : '예정된 합주 없음'}
      </Meta>
      <FlexBetween>
        <Meta>내 파트 · {song.myPart || '미배정'}</Meta>
        <ActionButton
          compact
          onPress={() =>
            navigate('song', { id: song.id, songTab: song.archived ? 'overview' : 'practice' })
          }
        >
          {song.archived ? '보관곡 보기' : '연습 시작'}
        </ActionButton>
      </FlexBetween>
    </Surface>
  );
}
