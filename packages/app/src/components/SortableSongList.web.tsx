import { useLayoutEffect, useRef, useState } from 'react';
import { movePracticeSong, orderPracticeSongs } from '../lib/practiceSongOrder';
import type { SortableSongListProps } from './SortableSongList.types';

export function SortableSongList<T extends { id: string; title: string }>({
  songs,
  onReorder,
  renderSong,
}: SortableSongListProps<T>) {
  const list = useRef<HTMLDivElement>(null);
  const drag = useRef<{
    id: string;
    ids: string[];
    startY: number;
    top: number;
    scrollY: number;
    pointerId: number;
  } | null>(null);
  const [preview, setPreview] = useState<string[] | null>(null);
  const [lifted, setLifted] = useState<{ id: string; delta: number } | null>(null);
  const scrollContainer = useRef<HTMLElement | null>(null);
  const positions = useRef(new Map<string, number>());
  const animations = useRef(new Map<string, Animation>());
  useLayoutEffect(() => {
    const next = new Map<string, number>();
    list.current?.querySelectorAll<HTMLElement>('[data-sortable-song]').forEach((row) => {
      const id = row.dataset.sortableSong!;
      const top = row.offsetTop;
      next.set(id, top);
      if (lifted?.id === id)
        row.style.transform = `translateY(${lifted.delta + (drag.current?.top ?? top) - top}px)`;
      const old = positions.current.get(id);
      if (
        old !== undefined &&
        old !== top &&
        id !== lifted?.id &&
        !window.matchMedia('(prefers-reduced-motion: reduce)').matches
      ) {
        const transform = getComputedStyle(row).transform;
        const visualDelta = transform === 'none' ? 0 : new DOMMatrixReadOnly(transform).m42;
        animations.current.get(id)?.cancel();
        animations.current.set(
          id,
          row.animate(
            [
              { transform: `translateY(${old - top + visualDelta}px)` },
              { transform: 'translateY(0)' },
            ],
            { duration: 180, easing: 'ease-out' },
          ),
        );
      }
    });
    positions.current = next;
  });
  const finish = (commit: boolean) => {
    const current = drag.current;
    if (!current) return;
    const row = Array.from(
      list.current?.querySelectorAll<HTMLElement>('[data-sortable-song]') ?? [],
    ).find((row) => row.dataset.sortableSong === current.id);
    if (row && !window.matchMedia('(prefers-reduced-motion: reduce)').matches)
      row.animate([{ transform: row.style.transform }, { transform: 'translateY(0)' }], {
        duration: 160,
        easing: 'ease-out',
      });
    drag.current = null;
    setLifted(null);
    setPreview(null);
    if (list.current?.hasPointerCapture(current.pointerId))
      list.current.releasePointerCapture(current.pointerId);
    if (commit && current.ids.some((id, index) => id !== songs[index]?.id)) onReorder(current.ids);
  };
  const shown = preview ? orderPracticeSongs(songs, preview) : songs;
  return (
    <div
      ref={list}
      style={{ display: 'flex', flexDirection: 'column', gap: 16, position: 'relative' }}
      onPointerMove={(event) => {
        const current = drag.current;
        if (!current || !list.current) return;
        const edge = 60;
        const scroller = scrollContainer.current;
        const bounds = scroller?.getBoundingClientRect();
        const scrollBy = (amount: number) =>
          scroller ? scroller.scrollBy(0, amount) : window.scrollBy(0, amount);
        if (event.clientY < (bounds?.top ?? 0) + edge) scrollBy(-12);
        if (event.clientY > (bounds?.bottom ?? window.innerHeight) - edge) scrollBy(12);
        setLifted({
          id: current.id,
          delta:
            event.clientY -
            current.startY +
            (scrollContainer.current?.scrollTop ?? window.scrollY) -
            current.scrollY,
        });
        const y = event.clientY - list.current.getBoundingClientRect().top;
        // Layout coordinates stay stable while neighboring cards animate.
        for (const row of list.current.querySelectorAll<HTMLElement>('[data-sortable-song]')) {
          const id = row.dataset.sortableSong!;
          if (id === current.id) continue;
          const down = current.ids.indexOf(current.id) < current.ids.indexOf(id);
          const midpoint = row.offsetTop + row.offsetHeight / 2;
          if (
            y < row.offsetTop ||
            y > row.offsetTop + row.offsetHeight ||
            (down ? y < midpoint : y > midpoint)
          )
            continue;
          current.ids = movePracticeSong(current.ids, current.id, id);
          setPreview(current.ids);
          break;
        }
      }}
      onPointerUp={() => finish(true)}
      onPointerCancel={() => finish(false)}
      onLostPointerCapture={() => finish(false)}
    >
      {shown.map((song) => (
        <div
          key={song.id}
          data-sortable-song={song.id}
          style={{
            display: 'flex',
            alignItems: 'stretch',
            gap: 8,
            position: 'relative',
            zIndex: lifted?.id === song.id ? 2 : 0,
            pointerEvents: lifted?.id === song.id ? 'none' : undefined,
            transform:
              lifted?.id === song.id
                ? `translateY(${lifted.delta + (drag.current?.top ?? 0) - (positions.current.get(song.id) ?? 0)}px)`
                : undefined,
            boxShadow: lifted?.id === song.id ? '0 6px 16px #0003' : undefined,
            borderRadius: 12,
          }}
        >
          <button
            type="button"
            aria-label={`${song.title} 순서 변경`}
            title="드래그 또는 위·아래 방향키로 순서 변경"
            style={{
              width: 28,
              flexShrink: 0,
              alignSelf: 'center',
              padding: '8px 0',
              border: 0,
              background: 'transparent',
              color: '#64748b',
              fontSize: 20,
              cursor: lifted?.id === song.id ? 'grabbing' : 'grab',
              touchAction: 'none',
            }}
            onPointerDown={(event) => {
              if (event.button !== 0) return;
              event.preventDefault();
              const row = event.currentTarget.parentElement!;
              animations.current.get(song.id)?.cancel();
              let parent = list.current?.parentElement ?? null;
              while (parent && !/(auto|scroll)/.test(getComputedStyle(parent).overflowY))
                parent = parent.parentElement;
              scrollContainer.current = parent;
              drag.current = {
                id: song.id,
                ids: songs.map((item) => item.id),
                startY: event.clientY,
                top: row.offsetTop,
                scrollY: scrollContainer.current?.scrollTop ?? window.scrollY,
                pointerId: event.pointerId,
              };
              setLifted({ id: song.id, delta: 0 });
              list.current?.setPointerCapture(event.pointerId);
            }}
            onKeyDown={(event) => {
              if (!['ArrowUp', 'ArrowDown'].includes(event.key)) return;
              event.preventDefault();
              const ids = songs.map((item) => item.id);
              const target = ids[ids.indexOf(song.id) + (event.key === 'ArrowUp' ? -1 : 1)];
              if (target) onReorder(movePracticeSong(ids, song.id, target));
            }}
          >
            ⠿
          </button>
          <div style={{ flex: 1, minWidth: 0 }}>{renderSong(song)}</div>
        </div>
      ))}
    </div>
  );
}
