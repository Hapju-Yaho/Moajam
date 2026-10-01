import { ActionButton, FlexRow, Copy } from './ProductUI';
import { movePracticeSong, type PracticeSongListProps } from '../lib/practiceSongOrder';
export function PracticeSongList({ songs, onSelect, onReorder }: PracticeSongListProps) {
  const ids = songs.map((song) => song.id);
  return (
    <>
      {songs.map((song, index) => (
        <FlexRow key={song.id}>
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
          <ActionButton secondary onPress={() => onSelect(song.id)}>
            <Copy>
              {song.title} · {song.artist}
            </Copy>
          </ActionButton>
        </FlexRow>
      ))}
    </>
  );
}
