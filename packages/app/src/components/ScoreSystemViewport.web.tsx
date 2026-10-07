import { useEffect, useRef, useState, type ReactNode } from 'react';

/** Keep row geometry in the document while avoiding thousands of offscreen SVG nodes. */
export function ScoreSystemViewport({
  enabled,
  active,
  initialVisible,
  width,
  height,
  children,
}: {
  enabled: boolean;
  active: boolean;
  initialVisible: boolean;
  width: number;
  height: number;
  children: () => ReactNode;
}) {
  const root = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(initialVisible);
  useEffect(() => {
    if (!enabled || !root.current || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), {
      rootMargin: '1000px 0px',
    });
    observer.observe(root.current);
    return () => observer.disconnect();
  }, [enabled]);
  if (!enabled || typeof IntersectionObserver === 'undefined') return children();
  return (
    <div ref={root} data-score-system-viewport="true" style={{ width, height, flexShrink: 0 }}>
      {(visible || active) && children()}
    </div>
  );
}
