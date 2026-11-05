import styledNative from '@emotion/native';
import { useState, type ReactNode } from 'react';
import { SortableSongList } from '@component/shared/songs/SortableSongList';
import { RecommendationsScreen } from '@screens/band/songs/recommendations/RecommendationsScreen';
import { Pressable, useWindowDimensions, View } from 'react-native';
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
} from '@component/shared/ui/ProductUI';
import type { ScreenProps } from '@app/navigation';
import { useMockAppState, type AdoptedSong } from '@state/MockAppState';
import { Avatar, AvatarText } from '@styles/layout';

export function SongsScreen({ navigate }: ScreenProps) {
  const [reorderingWorkspace, setReorderingWorkspace] = useState<string | null>(null);
  const { adoptedSongs, reorderAdoptedSongs, workspaceId } = useMockAppState();
  return (
    <>
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
          {reorderingWorkspace === workspaceId ? '변경 완료' : '순서 변경'}
        </ActionButton>
      </FlexBetween>
      <Stack gap={16}>
        <SortableSongList
          key={workspaceId}
          songs={adoptedSongs}
          handleInside
          reorderEnabled={reorderingWorkspace === workspaceId}
          onReorder={reorderAdoptedSongs}
          renderSong={(song, handle) => (
            <SongTile song={song} navigate={navigate} dragHandle={handle} />
          )}
        />
        {!adoptedSongs.length && (
          <Surface>
            <Heading>아직 채택한 곡이 없어요</Heading>
            <Meta>아래 곡 추천에서 함께 연습할 곡을 채택해주세요.</Meta>
          </Surface>
        )}
      </Stack>
      <SongsScreenContainer />
      <RecommendationsScreen navigate={navigate} embedded />
    </>
  );
}

function SongTile({
  song,
  navigate,
  dragHandle,
}: {
  song: AdoptedSong;
  navigate: ScreenProps['navigate'];
  dragHandle?: ReactNode;
}) {
  const { members, rehearsals, workspaceId } = useMockAppState();
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
    <SongTilePanel>
      <SongTileRow gap={12}>
        {dragHandle}
        <SongTileButton
          accessibilityRole="button"
          accessibilityLabel={`${song.title} 상세 보기`}
          onPress={() => navigate('song', { id: song.id, workspaceId })}
        >
          <SongTileRow2 gap={16}>
            <View>
              <SongCover
                id={song.id}
                thumbnailUrl={song.thumbnailUrl}
                referenceUrl={song.referenceUrl}
                size={width < 650 ? 64 : 80}
              />
            </View>
            <SongTileContainer>
              <FlexBetween>
                <SongTileContainer2>
                  <Heading>{song.title}</Heading>
                </SongTileContainer2>
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
            </SongTileContainer>
          </SongTileRow2>
          {nextSession && (
            <Meta>
              다음 합주 · {nextSession.date} {nextSession.start}
            </Meta>
          )}
        </SongTileButton>
      </SongTileRow>
    </SongTilePanel>
  );
}

const SongsScreenContainer = styledNative(View)({
  alignSelf: 'stretch',
  height: 1,
  backgroundColor: '#cbd5e1',
  marginTop: 12,
  marginBottom: 12,
});

const SongTilePanel = styledNative(Surface)({
  width: '100%',
  alignSelf: 'stretch',
  minWidth: 0,
  rowGap: 8,
  columnGap: 8,
  paddingTop: 12,
  paddingBottom: 12,
});

const SongTileRow = styledNative(FlexRow)({ alignItems: 'stretch' });

const SongTileButton = styledNative(Pressable)({ flex: 1, minWidth: 0, rowGap: 8, columnGap: 8 });

const SongTileRow2 = styledNative(FlexRow)({ alignItems: 'flex-start' });

const SongTileContainer = styledNative(View)({ flex: 1, minWidth: 0, rowGap: 7, columnGap: 7 });

const SongTileContainer2 = styledNative(View)({ flex: 1, minWidth: 0 });
