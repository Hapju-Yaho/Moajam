import styledNative from '@emotion/native';
import { ScreenHelpButton } from '@component/shared/help/ScreenHelpButton';
import { useIdentity } from '@state/Identity';
import { loadPreferences, savePreferences } from '@state/preferencesStorage';
import { useEffect, useRef } from 'react';
import { PracticeSongList } from '@component/practice/PracticeSongList';
import { orderPracticeSongs } from '@lib/practiceSongOrder';
import {
  ActionButton,
  FlexBetween,
  FlexRow,
  Heading,
  Meta,
  PageHeading,
  Surface,
} from '@component/shared/ui/ProductUI';
import { SongPractice } from '@component/practice/SongPractice';
import { useMockAppState, useWorkspaceValue } from '@state/MockAppState';
import type { ScreenProps } from '@app/navigation';

export function BandPracticeScreen({ navigate, entityId, feedback }: ScreenProps) {
  const { adoptedSongs, workspaceId } = useMockAppState();
  const [order, setOrder] = useWorkspaceValue<string[]>('practice/order', []);
  const songs = orderPracticeSongs(
    adoptedSongs.filter((song) => !song.archived || song.id === entityId),
    order,
  );
  const user = useIdentity();
  const selectionKey = `last-practice/${user}/${workspaceId}`;
  const restored = loadPreferences(selectionKey).songId;
  const initialSelection = useRef({
    selectionKey,
    id: typeof restored === 'string' ? restored : songs[0]?.id,
  });
  if (
    initialSelection.current.selectionKey !== selectionKey ||
    !songs.some((song) => song.id === initialSelection.current.id)
  )
    initialSelection.current = {
      selectionKey,
      id: songs.some((song) => song.id === restored) ? (restored as string) : songs[0]?.id,
    };
  const song = songs.find((item) => item.id === (entityId ?? initialSelection.current.id));
  const selectedSongId = song?.id;
  useEffect(() => {
    if (selectedSongId) {
      initialSelection.current = { selectionKey, id: selectedSongId };
      try {
        savePreferences({ songId: selectedSongId }, selectionKey);
      } catch {
        /* Keep the in-memory selection when storage is unavailable. */
      }
    }
  }, [selectedSongId, selectionKey]);
  return (
    <>
      <FlexRow>
        <PageHeading>연습실</PageHeading>
        <ScreenHelpButton />
      </FlexRow>
      <PracticeSongList2 nativeID="practice-song-list">
        <FlexBetween>
          <Heading>연습할 곡</Heading>{' '}
          <ActionButton
            secondary
            compact
            onPress={() => navigate(song ? 'song' : 'songs', { id: song?.id, workspaceId })}
          >
            {song ? '곡 상세 보기' : '참여 곡 보기'}
          </ActionButton>
        </FlexBetween>
        <PracticeSongList
          songs={songs}
          selectedId={song?.id}
          onSelect={(id) => navigate('practice', { id, workspaceId })}
          onReorder={(ids) => setOrder([...ids, ...order.filter((id) => !ids.includes(id))])}
        />
        {!song && (
          <Meta>
            {entityId
              ? '곡을 찾을 수 없어요. 다른 곡을 선택해주세요.'
              : '참여 곡에서 함께 연습할 곡을 먼저 채택해주세요.'}
          </Meta>
        )}
      </PracticeSongList2>
      {song && <SongPractice key={song.id} song={song} feedback={feedback} navigate={navigate} />}
    </>
  );
}

const PracticeSongList2 = styledNative(Surface)({
  paddingTop: 12,
  paddingRight: 12,
  paddingBottom: 12,
  paddingLeft: 12,
  rowGap: 8,
  columnGap: 8,
});
