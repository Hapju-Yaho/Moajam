import { ScoreFileIcon } from './ScoreFileIcon.web';
import type { PropsWithChildren } from 'react';

export function ScoreFileMenu({
  label,
  disabled = false,
  children,
}: PropsWithChildren<{ label: string; disabled?: boolean }>) {
  return (
    <details
      className="score-file-menu"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null))
          event.currentTarget.open = false;
      }}
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return;
        event.stopPropagation();
        event.currentTarget.open = false;
        event.currentTarget.querySelector('summary')?.focus();
      }}
      onClick={(event) => {
        if ((event.target as HTMLElement).closest('button, a')) {
          event.currentTarget.open = false;
          event.currentTarget.querySelector('summary')?.focus();
        }
      }}
    >
      <summary
        aria-label={label}
        aria-disabled={disabled}
        onClick={(event) => {
          if (disabled) event.preventDefault();
        }}
      >
        {label} <ScoreFileIcon name="chevron" />
      </summary>
      <div className="score-file-menu-content">{children}</div>
    </details>
  );
}
