import { useEffect } from 'react';
export function useNotificationFocus(id?: string, ready = true) {
  useEffect(() => {
    if (!id || !ready) return;
    const frame = requestAnimationFrame(() => {
      const element = document.getElementById(id);
      element?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      element?.setAttribute('tabindex', '-1');
      element?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [id, ready]);
}
