import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
export function ClipMenu({ label, children }: { label: string; children: ReactNode }) {
  const trigger = useRef<HTMLButtonElement>(null),
    menu = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  useLayoutEffect(() => {
    if (!open || !trigger.current || !menu.current) return;
    const anchor = trigger.current.getBoundingClientRect(),
      size = menu.current.getBoundingClientRect();
    setPosition({
      left: Math.max(8, Math.min(anchor.right - size.width, window.innerWidth - size.width - 8)),
      top: Math.max(
        8,
        anchor.bottom + size.height + 8 > window.innerHeight
          ? anchor.top - size.height - 4
          : anchor.bottom + 4,
      ),
    });
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (
        !menu.current?.contains(event.target as Node) &&
        !trigger.current?.contains(event.target as Node)
      )
        setOpen(false);
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        trigger.current?.focus();
      }
    };
    const close = () => setOpen(false);
    document.addEventListener('pointerdown', outside, true);
    document.addEventListener('keydown', key);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('pointerdown', outside, true);
      document.removeEventListener('keydown', key);
      window.removeEventListener('resize', close);
    };
  }, [open]);
  return (
    <>
      <button
        ref={trigger}
        aria-label={label}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen(!open)}
        style={{
          background: 'transparent',
          border: 0,
          fontSize: 22,
          padding: '0 8px',
          cursor: 'pointer',
        }}
      >
        ⋮
      </button>
      {open &&
        createPortal(
          <div
            ref={menu}
            role="menu"
            aria-label={label}
            onClick={(event) => {
              const button = (event.target as HTMLElement).closest('button');
              if (button && !button.disabled) setOpen(false);
            }}
            style={{
              position: 'fixed',
              ...position,
              zIndex: 10000,
              minWidth: 160,
              maxHeight: 'calc(100dvh - 16px)',
              overflowY: 'auto',
              background: 'white',
              border: '1px solid #dce4ef',
              borderRadius: 8,
              padding: 8,
              boxShadow: '0 4px 16px #0002',
              display: 'grid',
              gap: 8,
            }}
          >
            {children}
          </div>,
          trigger.current?.closest('dialog') ?? document.body,
        )}
    </>
  );
}
