import { useLayoutEffect, useRef, type PropsWithChildren } from 'react';

const previousVisibility = new Map<string, boolean>();
export function SpaceMenuReveal({
  id,
  visible,
  children,
}: PropsWithChildren<{ id: string; visible: boolean }>) {
  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const lastVisible = useRef(previousVisibility.get(id));
  useLayoutEffect(() => {
    const previous = lastVisible.current;
    previousVisibility.set(id, visible);
    if (
      previous === undefined ||
      previous === visible ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      lastVisible.current = visible;
      return;
    }
    const height = inner.current?.getBoundingClientRect().height ?? 0;
    const animation = outer.current?.animate(
      [
        { height: `${previous ? height : 0}px`, opacity: previous ? 1 : 0 },
        { height: `${visible ? height : 0}px`, opacity: visible ? 1 : 0 },
      ],
      { duration: 260, easing: 'cubic-bezier(0.2, 0, 0, 1)' },
    );
    if (animation)
      animation.onfinish = () => {
        lastVisible.current = visible;
      };
    return () => animation?.cancel();
  }, [id, visible]);
  return (
    <div
      ref={outer}
      aria-hidden={!visible}
      inert={!visible}
      style={{ height: visible ? 'auto' : 0, overflow: 'hidden' }}
    >
      <div ref={inner}>{children}</div>
    </div>
  );
}
