import { useEffect, type RefObject } from 'react';

// File settings stay nonmodal so the score remains available for scrolling.
export function useScoreFilePanel(ref: RefObject<HTMLDialogElement | null>, active = true) {
  useEffect(() => {
    const panel = ref.current;
    if (!active || !panel) return;
    const viewport = panel.closest('.score-editor-viewport');
    if (!viewport) return;
    const shades = Array.from({ length: 4 }, () => {
      const shade = document.createElement('div');
      shade.className = 'score-file-panel-shade';
      shade.setAttribute('aria-hidden', 'true');
      viewport.append(shade);
      return shade;
    });
    const position = () => {
      const score = viewport.querySelector('.score-workspace')?.getBoundingClientRect();
      const menu = viewport.querySelector('.score-detail-inspector')?.getBoundingClientRect();
      const tabs = viewport.querySelector('.score-left-tools-header')?.getBoundingClientRect();
      if (menu && menu.width > 0) {
        panel.style.left = `${menu.left}px`;
        panel.style.width = `${menu.width}px`;
        panel.style.top = `${Math.max(8, tabs && tabs.height > 0 ? tabs.top : menu.top)}px`;
      }
      const bounds = viewport.getBoundingClientRect();
      const left = Math.max(0, bounds.left),
        top = Math.max(0, bounds.top);
      const right = Math.min(innerWidth, bounds.right),
        bottom = Math.min(innerHeight, bounds.bottom);
      const x = Math.max(left, Math.min(right, score?.left ?? right));
      const y = Math.max(top, Math.min(bottom, score?.top ?? bottom));
      const endX = Math.max(x, Math.min(right, score?.right ?? right));
      const endY = Math.max(y, Math.min(bottom, score?.bottom ?? bottom));
      const rectangles = [
        [left, top, right - left, y - top],
        [left, y, x - left, endY - y],
        [endX, y, right - endX, endY - y],
        [left, endY, right - left, bottom - endY],
      ];
      shades.forEach((shade, i) => {
        const [x, y, width, height] = rectangles[i];
        Object.assign(shade.style, {
          left: `${x}px`,
          top: `${y}px`,
          width: `${width}px`,
          height: `${height}px`,
        });
      });
    };
    position();
    const observer = new ResizeObserver(position);
    observer.observe(viewport);
    const workspace = viewport.querySelector('.score-workspace');
    if (workspace) observer.observe(workspace);
    window.addEventListener('resize', position);
    window.addEventListener('scroll', position, true);
    return () => {
      observer.disconnect();
      shades.forEach((shade) => shade.remove());
      window.removeEventListener('resize', position);
      window.removeEventListener('scroll', position, true);
    };
  }, [ref, active]);
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      const panel = ref.current;
      if (event.key !== 'Escape' || !panel?.open || document.querySelector('dialog:modal')) return;
      event.preventDefault();
      event.stopPropagation();
      panel.dispatchEvent(new Event('cancel', { cancelable: true }));
    };
    window.addEventListener('keydown', escape);
    return () => window.removeEventListener('keydown', escape);
  }, [ref]);
}
