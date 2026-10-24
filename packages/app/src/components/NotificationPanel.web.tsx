import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Notifications } from './Notifications';
import type { ScreenProps } from '../navigation';
import './NotificationPanel.web.css';
export function NotificationPanel({
  onClose,
  navigate,
}: {
  onClose: () => void;
  navigate: ScreenProps['navigate'];
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    element?.showModal();
    return () => {
      element?.close();
      previous?.focus();
    };
  }, []);
  return createPortal(
    <dialog
      ref={dialog}
      className="notification-dialog"
      aria-label="알림"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <div className="notification-backdrop" aria-hidden="true" onClick={onClose} />
      <section className="notification-panel">
        <Notifications panel navigate={navigate} onClose={onClose} />
      </section>
    </dialog>,
    document.body,
  );
}
