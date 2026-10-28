import { useId, useLayoutEffect, useRef, useState, type PropsWithChildren } from 'react';
import { createPortal } from 'react-dom';

/** Keep help outside scroll clipping, inside the expanded editor's top layer. */
export function ScoreHelpPopover({ label, children }: PropsWithChildren<{ label: string }>) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [point, setPoint] = useState<{ left: number; top: number } | null>(null);
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      if (!trigger.current || !panel.current) return;
      const anchor = trigger.current.getBoundingClientRect();
      const bounds = panel.current.getBoundingClientRect();
      const preferred =
        anchor.right + 8 + bounds.width <= window.innerWidth - 8
          ? anchor.right + 8
          : anchor.left - bounds.width - 8;
      const left = Math.max(8, Math.min(preferred, window.innerWidth - bounds.width - 8));
      const top = Math.max(8, Math.min(anchor.top, window.innerHeight - bounds.height - 8));
      setPoint((previous) =>
        previous?.left === left && previous.top === top ? previous : { left, top },
      );
    };
    const outside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!trigger.current?.contains(target) && !panel.current?.contains(target)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      trigger.current?.focus({ preventScroll: true });
    };
    place();
    window.addEventListener('resize', place);
    document.addEventListener('scroll', place, true);
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape, true);
    return () => {
      window.removeEventListener('resize', place);
      document.removeEventListener('scroll', place, true);
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape, true);
    };
  }, [open]);
  const host =
    trigger.current?.closest('.score-editor-viewport[data-expanded="true"]') ?? document.body;
  return (
    <>
      <button
        ref={trigger}
        type="button"
        className="score-backing-help-trigger"
        aria-label={label}
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => {
          setPoint(null);
          setOpen((value) => !value);
        }}
      >
        도움말 ⓘ
      </button>
      {open &&
        createPortal(
          <div
            ref={panel}
            id={id}
            role="dialog"
            aria-label={label}
            className="score-backing-disclosure-content score-backing-help-content"
            style={{
              position: 'fixed',
              zIndex: 1200,
              right: 'auto',
              bottom: 'auto',
              left: point?.left ?? 8,
              top: point?.top ?? 8,
              visibility: point ? 'visible' : 'hidden',
            }}
          >
            {children}
          </div>,
          host,
        )}
    </>
  );
}
