import { AppShell } from '../components/AppShell';
import {
  ActionButton,
  FlexRow,
  Heading,
  Meta,
  PageHeading,
  Pill,
  PillText,
  Surface,
} from '../components/ProductUI';
import { SongPractice } from '../components/song/SongPractice';
import { useMockAppState } from '../state/MockAppState';
import type { ScreenProps } from '../navigation';

export function BandPracticeScreen({ navigate, entityId }: ScreenProps) {
  const { adoptedSongs, workspaceId } = useMockAppState();
  const songs = adoptedSongs.filter((song) => !song.archived || song.id === entityId);
  const song = entityId ? songs.find((item) => item.id === entityId) : songs[0];
  return (
    <AppShell activeRoute="practice" onNavigate={navigate}>
      <PageHeading>연습실</PageHeading>
      <Surface>
        <Heading>연습할 곡</Heading>
        <FlexRow wrap>
          {songs.map((item) => (
            <Pill
              key={item.id}
              active={item.id === song?.id}
              accessibilityRole="button"
              accessibilityState={{ selected: item.id === song?.id }}
              onPress={() => navigate('practice', { id: item.id, workspaceId })}
            >
              <PillText active={item.id === song?.id}>
                {item.title} · {item.artist}
              </PillText>
            </Pill>
          ))}
        </FlexRow>
        {song ? (
          <Meta>
            {song.title} · {song.artist}
          </Meta>
        ) : (
          <Meta>
            {entityId
              ? '곡을 찾을 수 없어요. 다른 곡을 선택해주세요.'
              : '참여 곡에서 함께 연습할 곡을 먼저 채택해주세요.'}
          </Meta>
        )}
        <ActionButton
          secondary
          onPress={() => navigate(song ? 'song' : 'songs', { id: song?.id, workspaceId })}
        >
          {song ? '곡 상세 보기' : '참여 곡 보기'}
        </ActionButton>
      </Surface>
      {song && <SongPractice key={song.id} song={song} />}
    </AppShell>
  );
}
