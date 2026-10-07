import type { ReactNode } from 'react';

export function ScoreToolbarHelp({ label, children }: { label: string; children: ReactNode }) {
  return (
    <details
      className="score-toolbar-help"
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.currentTarget.open = false;
          event.currentTarget.querySelector('summary')?.focus();
        }
      }}
    >
      <summary aria-label={label} title={label}>
        ⓘ
      </summary>
      <div role="note">{children}</div>
    </details>
  );
}
