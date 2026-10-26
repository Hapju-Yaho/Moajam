import type { ReactNode } from 'react';
export type SortableSongListProps<T extends { id: string; title: string }> = {
  songs: T[];
  reorderEnabled?: boolean;
  handleInside?: boolean;
  onDragStateChange?: (dragging: boolean) => void;
  onReorder: (ids: string[]) => void;
  renderSong: (song: T, handle?: ReactNode) => ReactNode;
};
