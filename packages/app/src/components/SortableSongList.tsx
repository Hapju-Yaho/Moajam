import { View } from 'react-native';
import { ActionButton, FlexRow, Stack } from './ProductUI';
import { movePracticeSong } from '../lib/practiceSongOrder';
import type { SortableSongListProps } from './SortableSongList.types';
export function SortableSongList<T extends { id: string; title: string }>({
  songs,
  onReorder,
  renderSong,
}: SortableSongListProps<T>) {
  const ids = songs.map((song) => song.id);
  return (
    <Stack gap={16}>
      {songs.map((song, index) => (
        <FlexRow key={song.id}>
          <Stack gap={8}>
            <ActionButton
              secondary
              compact
              disabled={index === 0}
              onPress={() => onReorder(movePracticeSong(ids, song.id, ids[index - 1]))}
            >
              ↑
            </ActionButton>
            <ActionButton
              secondary
              compact
              disabled={index === songs.length - 1}
              onPress={() => onReorder(movePracticeSong(ids, song.id, ids[index + 1]))}
            >
              ↓
            </ActionButton>
          </Stack>
          <View style={{ flex: 1, minWidth: 0 }}>{renderSong(song)}</View>
        </FlexRow>
      ))}
    </Stack>
  );
}
