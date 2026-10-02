import type { ReactNode } from 'react';
export type SortableSongListProps<T extends { id: string; title: string }> = {
  songs: T[];
  onReorder: (ids: string[]) => void;
  renderSong: (song: T) => ReactNode;
};
