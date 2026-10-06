import { useState } from 'react';
import { SortableSongList } from '../components/SortableSongList';
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
  SongCover,
  Stack,
  Surface,
} from '../components/ProductUI';
import type { ScreenProps } from '../navigation';
import { useMockAppState, type AdoptedSong } from '../state/MockAppState';
import { Avatar, AvatarText } from '../styles/layout';

export function SongsScreen({ navigate }: ScreenProps) {
  const [reorderingWorkspace, setReorderingWorkspace] = useState<string | null>(null);
  const { adoptedSongs, reorderAdoptedSongs, workspaceId } = useMockAppState();
  return (
    <AppShell activeRoute="songs" onNavigate={navigate}>
      <FlexBetween>
        <PageHeading>참여 곡</PageHeading>
        <ActionButton
          compact
          secondary={reorderingWorkspace !== workspaceId}
          disabled={adoptedSongs.length < 2}
          accessibilityState={{ selected: reorderingWorkspace === workspaceId }}
          onPress={() =>
            setReorderingWorkspace(reorderingWorkspace === workspaceId ? null : workspaceId)
          }
        >
          {reorderingWorkspace === workspaceId ? '순서 변경 완료' : '순서 변경'}
        </ActionButton>
      </FlexBetween>
      <Stack gap={16}>
        <SortableSongList
          key={workspaceId}
          songs={adoptedSongs}
          reorderEnabled={reorderingWorkspace === workspaceId}
          onReorder={reorderAdoptedSongs}
          renderSong={(song) => <SongTile song={song} navigate={navigate} />}
        />
        {!adoptedSongs.length && (
          <Surface>
            <Heading>아직 채택한 곡이 없어요</Heading>
            <Meta>아래 곡 추천에서 함께 연습할 곡을 채택해주세요.</Meta>
          </Surface>
        )}
      </Stack>
      <View
        style={{
          alignSelf: 'stretch',
          height: 1,
          backgroundColor: '#cbd5e1',
          marginVertical: 12,
        }}
      />
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
    <Surface style={{ gap: 8, paddingVertical: 12 }}>
      <FlexRow gap={16} style={{ alignItems: 'flex-start' }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${song.title} 상세 보기`}
          onPress={() => navigate('song', { id: song.id })}
        >
          <SongCover
            id={song.id}
            thumbnailUrl={song.thumbnailUrl}
            referenceUrl={song.referenceUrl}
            size={width < 650 ? 64 : 80}
          />
        </Pressable>
        <View style={{ flex: 1, minWidth: 0, gap: 7 }}>
          <FlexBetween>
            <Pressable
              style={{ flex: 1, minWidth: 0 }}
              accessibilityRole="button"
              accessibilityLabel={`${song.title} 상세 보기`}
              onPress={() => navigate('song', { id: song.id })}
            >
              <Heading>{song.title}</Heading>
            </Pressable>
            <ActionButton
              compact
              onPress={() =>
                navigate(song.archived ? 'song' : 'practice', { id: song.id, songTab: 'overview' })
              }
            >
              {song.archived ? '보관곡 보기' : '연습하기'}
            </ActionButton>
          </FlexBetween>
          <Meta>
            {song.artist} · {song.year}
          </Meta>
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
      {nextSession && (
        <Meta>
          다음 합주 · {nextSession.date} {nextSession.start}
        </Meta>
      )}
    </Surface>
  );
}
