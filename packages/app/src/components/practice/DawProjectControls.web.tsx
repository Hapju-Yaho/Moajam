import { useDawProject } from '@lib/dawProjectContext';
import { createContext, useContext } from 'react';
import './DawProjectControls.web.css';
const LibraryAction = createContext<(() => void) | undefined>(undefined);
export function DawProjectToolbar({ onOpenLibrary }: { onOpenLibrary?: () => void }) {
  return <LibraryAction.Provider value={onOpenLibrary}>{useDawProject()?.toolbar ?? null}</LibraryAction.Provider>;
}
export function DawLibraryButton() {
  const open = useContext(LibraryAction);
  return open ? <button type="button" onClick={open}>클립 보관함</button> : null;
}
export function DawProjectPanel() {
  return useDawProject()?.panel ?? null;
}
export function ProjectRefreshIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      aria-hidden="true"
    >
      <path d="M20 7v5h-5M4 17v-5h5M19 11a7 7 0 0 0-12-5L4 9m1 4a7 7 0 0 0 12 5l3-3" />
    </svg>
  );
}
export function ProjectPencilIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      aria-hidden="true"
    >
      <path d="m15 5 4 4M4 20l4-1L20 7a2.8 2.8 0 0 0-4-4L4 15z" />
    </svg>
  );
}
