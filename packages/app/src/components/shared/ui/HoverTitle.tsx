import type { PropsWithChildren } from 'react';

export function HoverTitle({ children }: PropsWithChildren<{ title: string }>) {
  return <>{children}</>;
}
