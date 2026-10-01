import { RecommendationsScreen } from './RecommendationsScreen';
import { Pressable, useWindowDimensions, View } from 'react-native';
import { AppShell } from '../components/AppShell';
import {
  ActionButton,
  FlexBetween,
  FlexRow,
  Heading,
  Meta,
  PageHeading,
  Pill,
  PillText,
  SongCover,
  Stack,
  Surface,
} from '../components/ProductUI';
import type { ScreenProps } from '../navigation';
import { useMockAppState, type AdoptedSong } from '../state/MockAppState';
import { Avatar, AvatarText } from '../styles/layout';

export function SongsScreen({ navigate }: ScreenProps) {
  const { adoptedSongs } = useMockAppState();
  return (
    <AppShell activeRoute="songs" onNavigate={navigate}>
      <PageHeading>참여 곡</PageHeading>
      <Stack gap={16}>
        {adoptedSongs.map((song) => (
          <SongTile key={song.id} song={song} navigate={navigate} />
        ))}
        {!adoptedSongs.length && (
          <Surface>
            <Heading>아직 채택한 곡이 없어요</Heading>
            <Meta>아래 곡 추천에서 함께 연습할 곡을 채택해주세요.</Meta>
          </Surface>
        )}
      </Stack>
      <RecommendationsScreen navigate={navigate} embedded />
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
            navigate(song.archived ? 'song' : 'practice', { id: song.id, songTab: 'overview' })
          }
        >
          {song.archived ? '보관곡 보기' : '연습하기'}
        </ActionButton>
      </FlexBetween>
    </Surface>
  );
}
