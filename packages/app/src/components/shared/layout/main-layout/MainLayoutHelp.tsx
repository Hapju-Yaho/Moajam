import type { ComponentProps } from 'react';
import type { AppRoute } from '@app/navigation';
import { PracticeHelp } from '@component/practice/PracticeHelp';
import { HomeTour } from '@component/shared/help/HomeTour';
export function MainLayoutHelp({
  open,
  activeRoute,
  ...props
}: ComponentProps<typeof HomeTour> & { open: boolean; activeRoute: AppRoute }) {
  if (!open) return null;
  if (activeRoute === 'practice')
    return <PracticeHelp onClose={props.onClose} onComplete={props.onComplete} />;
  return <HomeTour {...props} />;
}
