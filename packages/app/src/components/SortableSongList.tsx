import { View } from 'react-native';
import { ActionButton, FlexRow, Stack } from './ProductUI';
import { movePracticeSong } from '../lib/practiceSongOrder';
import type { SortableSongListProps } from './SortableSongList.types';
export function SortableSongList<T extends { id: string; title: string }>({
  songs,
  onReorder,
  renderSong,
  reorderEnabled = true,
  handleInside = false,
}: SortableSongListProps<T>) {
  const ids = songs.map((song) => song.id);
  const renderHandle = (song: T) => {
    const index = ids.indexOf(song.id);
    return reorderEnabled ? (
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
    ) : null;
  };
  return (
    <Stack gap={16}>
      {songs.map((song) => (
        <FlexRow key={song.id}>
          {!handleInside && renderHandle(song)}
          <View style={{ flex: 1, minWidth: 0 }}>
            {renderSong(song, handleInside ? renderHandle(song) : undefined)}
          </View>
        </FlexRow>
      ))}
    </Stack>
  );
}
