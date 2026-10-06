import { useEffect, useRef, useState, type RefObject, type PointerEvent } from 'react';
export function useMarquee(
  container: RefObject<HTMLElement | null>,
  selector: string,
  onSelect: (ids: string[], additive: boolean) => void,
  inset = 0,
) {
  const [box, setBox] = useState<{
    left: number;
    top: number;
    width: number;
    height: number;
  } | null>(null);
  const select = useRef(onSelect);
  useEffect(() => {
    select.current = onSelect;
  }, [onSelect]);
  const lastTouch = useRef({ time: 0, x: 0, y: 0 });
  const drag = useRef<{
    pointerId: number;
    x: number;
    y: number;
    clientX: number;
    clientY: number;
    additive: boolean;
    moved: boolean;
  } | null>(null);
  const frame = useRef<number | null>(null);
  const captured = useRef<Element | null>(null);
  const suppressClick = useRef(false);
  const refresh = () => {
    const element = container.current,
      current = drag.current;
    if (!element || !current) return;
    const rect = element.getBoundingClientRect();
    const x = Math.max(
      inset + element.scrollLeft,
      current.clientX - rect.left + element.scrollLeft,
    );
    const y = current.clientY - rect.top + element.scrollTop;
    if (Math.hypot(x - current.x, y - current.y) < 4 && !current.moved) return;
    current.moved = true;
    const next = {
      left: Math.min(x, current.x),
      top: Math.min(y, current.y),
      width: Math.abs(x - current.x),
      height: Math.abs(y - current.y),
    };
    setBox(next);
    const ids = [...element.querySelectorAll<HTMLElement>(selector)]
      .filter((item) => {
        const b = item.getBoundingClientRect();
        const left = b.left - rect.left + element.scrollLeft,
          top = b.top - rect.top + element.scrollTop;
        return (
          left <= next.left + next.width &&
          left + b.width >= next.left &&
          top <= next.top + next.height &&
          top + b.height >= next.top
        );
      })
      .map((item) => item.dataset.selectionId!)
      .filter(Boolean);
    select.current(ids, current.additive);
  };
  const tick = () => {
    const element = container.current,
      current = drag.current;
    if (!element || !current) return;
    const rect = element.getBoundingClientRect();
    const speed = (p: number, min: number, max: number) =>
      p < min + 30
        ? -Math.min(18, (min + 30 - p) / 3)
        : p > max - 30
          ? Math.min(18, (p - max + 30) / 3)
          : 0;
    if (current.moved) {
      element.scrollLeft += speed(current.clientX, rect.left + inset, rect.right);
      element.scrollTop += speed(current.clientY, rect.top + 24, rect.bottom);
      refresh();
    }
    frame.current = requestAnimationFrame(tick);
  };
  const start = (event: PointerEvent<Element>) => {
    if (event.button !== 0 || drag.current || !container.current) return false;
    if (event.pointerType === 'touch') {
      const last = lastTouch.current;
      const twice =
        Date.now() - last.time < 400 &&
        Math.hypot(event.clientX - last.x, event.clientY - last.y) < 30;
      lastTouch.current = { time: twice ? 0 : Date.now(), x: event.clientX, y: event.clientY };
      if (!twice) return false;
    }
    const element = container.current,
      rect = element.getBoundingClientRect();
    drag.current = {
      pointerId: event.pointerId,
      x: event.clientX - rect.left + element.scrollLeft,
      y: event.clientY - rect.top + element.scrollTop,
      clientX: event.clientX,
      clientY: event.clientY,
      additive: event.ctrlKey || event.metaKey,
      moved: false,
    };
    suppressClick.current = false;
    event.preventDefault();
    captured.current = event.currentTarget;
    event.currentTarget.setPointerCapture(event.pointerId);
    frame.current = requestAnimationFrame(tick);
    return true;
  };
  const move = (event: PointerEvent<Element>) => {
    const current = drag.current;
    if (!current || event.pointerId !== current.pointerId) return;
    current.clientX = event.clientX;
    current.clientY = event.clientY;
    refresh();
  };
  const finish = (event: PointerEvent<Element>) => {
    const current = drag.current;
    if (!current || event.pointerId !== current.pointerId) return;
    suppressClick.current = current.moved;
    drag.current = null;
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
    setBox(null);
    if (captured.current?.hasPointerCapture(event.pointerId))
      captured.current.releasePointerCapture(event.pointerId);
    captured.current = null;
  };
  useEffect(
    () => () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    },
    [],
  );
  return {
    box,
    start,
    move,
    finish,
    active: () => !!drag.current,
    consumeClick: () => {
      const value = suppressClick.current;
      suppressClick.current = false;
      return value;
    },
  };
}
