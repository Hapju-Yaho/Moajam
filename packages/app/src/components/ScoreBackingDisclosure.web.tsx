import type { PropsWithChildren } from 'react';

export function ScoreBackingDisclosure({
  label,
  help = false,
  children,
}: PropsWithChildren<{ label: string; help?: boolean }>) {
  return (
    <details
      className={`score-backing-disclosure${help ? ' score-backing-help' : ''}`}
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
      <summary aria-label={label}>{help ? '도움말 ⓘ' : '⋮'}</summary>
      <div className="score-backing-disclosure-content">{children}</div>
    </details>
  );
}
