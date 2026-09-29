import {
  createElement,
  useEffect,
  useRef,
  type PropsWithChildren,
  type SyntheticEvent,
} from 'react';

export function ScheduleDialog({
  visible,
  onClose,
  children,
}: PropsWithChildren<{ visible: boolean; onClose: () => void }>) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    if (visible) element?.showModal();
    else element?.close();
    return () => element?.close();
  }, [visible]);
  // The browser top layer handles focus trapping and avoids the web Modal portal's
  // StrictMode cleanup removing a newly opened form.
  return createElement(
    'dialog',
    {
      ref: dialog,
      'aria-label': '일정 등록 및 수정',
      onCancel: (event: SyntheticEvent<HTMLDialogElement>) => {
        event.preventDefault();
        onClose();
      },
      style: {
        display: visible ? 'flex' : 'none',
        position: 'fixed',
        inset: 0,
        width: '100%',
        height: '100dvh',
        maxWidth: 'none',
        maxHeight: 'none',
        margin: 0,
        padding: 0,
        border: 0,
        background: 'transparent',
      },
    },
    children,
  );
}
