import { useDawProject } from '../lib/dawProjectContext';
import './DawProjectControls.web.css';
export function DawProjectToolbar() {
  return useDawProject()?.toolbar ?? null;
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
