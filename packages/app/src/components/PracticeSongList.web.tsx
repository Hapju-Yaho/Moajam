import { useLayoutEffect, useRef, useState } from 'react';
import {
  movePracticeSong,
  orderPracticeSongs,
  type PracticeSongListProps,
} from '../lib/practiceSongOrder';
export function PracticeSongList({
  songs,
  selectedId,
  onSelect,
  onReorder,
}: PracticeSongListProps) {
  const drag = useRef<{ id: string; ids: string[] } | null>(null);
  const [preview, setPreview] = useState<string[] | null>(null);
  const list = useRef<HTMLDivElement>(null);
  const [lifted, setLifted] = useState<{
    id: string;
    y: number;
    startY: number;
    top: number;
  } | null>(null);
  const positions = useRef(new Map<string, number>());
  useLayoutEffect(() => {
    const next = new Map<string, number>();
    list.current?.querySelectorAll<HTMLElement>('[data-practice-song]').forEach((row) => {
      const id = row.dataset.practiceSong!;
      const top = row.offsetTop;
      next.set(id, top);
      if (lifted?.id === id)
        row.style.transform = `translateY(${lifted.y - lifted.startY + lifted.top - top}px)`;
      const previous = positions.current.get(id);
      if (
        previous !== undefined &&
        previous !== top &&
        id !== lifted?.id &&
        !window.matchMedia('(prefers-reduced-motion: reduce)').matches
      )
        row.animate(
          [{ transform: `translateY(${previous - top}px)` }, { transform: 'translateY(0)' }],
          { duration: 180, easing: 'ease-out' },
        );
    });
    positions.current = next;
  });
  const release = () => {
    if (lifted) {
      const row = Array.from(
        list.current?.querySelectorAll<HTMLElement>('[data-practice-song]') ?? [],
      ).find((row) => row.dataset.practiceSong === lifted.id);
      if (row && !window.matchMedia('(prefers-reduced-motion: reduce)').matches)
        row.animate([{ transform: row.style.transform }, { transform: 'translateY(0)' }], {
          duration: 160,
          easing: 'ease-out',
        });
    }
    setLifted(null);
  };
  const shown = preview ? orderPracticeSongs(songs, preview) : songs;
  return (
    <div
      onPointerMove={(event) => {
        const current = drag.current;
        if (!current) return;
        const viewport = list.current?.getBoundingClientRect();
        if (viewport && list.current) {
          if (event.clientY < viewport.top + 28) list.current.scrollTop -= 12;
          if (event.clientY > viewport.bottom - 28) list.current.scrollTop += 12;
        }
        setLifted((value) => (value ? { ...value, y: event.clientY } : value));
        const target = document
          .elementFromPoint(event.clientX, event.clientY)
          ?.closest<HTMLElement>('[data-practice-song]');
        if (!target || !list.current?.contains(target)) return;
        const bounds = target.getBoundingClientRect();
        const movingDown =
          current.ids.indexOf(current.id) < current.ids.indexOf(target.dataset.practiceSong!);
        if (
          movingDown
            ? event.clientY < bounds.top + bounds.height / 2
            : event.clientY > bounds.top + bounds.height / 2
        )
          return;
        current.ids = movePracticeSong(current.ids, current.id, target.dataset.practiceSong!);
        setPreview(current.ids);
      }}
      onPointerUp={() => {
        const current = drag.current;
        release();
        drag.current = null;
        setPreview(null);
        if (current && current.ids.some((id, i) => id !== songs[i]?.id)) onReorder(current.ids);
      }}
      onPointerCancel={() => {
        release();
        drag.current = null;
        setPreview(null);
      }}
      onLostPointerCapture={() => {
        release();
        drag.current = null;
        setPreview(null);
      }}
      ref={list}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        position: 'relative',
        maxHeight: songs.length > 6 ? 236 : undefined,
        overflowY: songs.length > 6 ? 'auto' : undefined,
      }}
    >
      {shown.map((song) => (
        <div
          key={song.id}
          data-practice-song={song.id}
          style={{
            flexShrink: 0,
            height: 36,
            boxSizing: 'border-box',
            position: 'relative',
            zIndex: lifted?.id === song.id ? 2 : 0,
            pointerEvents: lifted?.id === song.id ? 'none' : 'auto',
            transform:
              lifted?.id === song.id
                ? `translateY(${lifted.y - lifted.startY + lifted.top - (positions.current.get(song.id) ?? lifted.top)}px)`
                : undefined,
            boxShadow: lifted?.id === song.id ? '0 6px 16px #0003' : undefined,
            display: 'flex',
            alignItems: 'stretch',
            border: '1px solid #dce4ef',
            borderRadius: 10,
            background: song.id === selectedId ? '#e8f3ff' : '#fff',
          }}
        >
          <button
            type="button"
            aria-label={`${song.title} 순서 변경`}
            title="드래그 또는 위·아래 방향키로 순서 변경"
            style={{
              cursor: 'grab',
              touchAction: 'none',
              width: 30,
              flexShrink: 0,
              border: 0,
              background: 'transparent',
              color: '#64748b',
              fontSize: 17,
            }}
            onPointerDown={(event) => {
              if (event.button !== 0) return;
              drag.current = { id: song.id, ids: songs.map((item) => item.id) };
              const row = event.currentTarget.closest<HTMLElement>('[data-practice-song]')!;
              setLifted({
                id: song.id,
                y: event.clientY,
                startY: event.clientY,
                top: row.offsetTop,
              });
              list.current?.setPointerCapture(event.pointerId);
            }}
            onKeyDown={(event) => {
              if (!['ArrowUp', 'ArrowDown'].includes(event.key)) return;
              event.preventDefault();
              const ids = songs.map((item) => item.id);
              const index = ids.indexOf(song.id) + (event.key === 'ArrowUp' ? -1 : 1);
              if (ids[index]) onReorder(movePracticeSong(ids, song.id, ids[index]));
            }}
          >
            ⠿
          </button>
          <button
            type="button"
            aria-pressed={song.id === selectedId}
            onClick={() => onSelect(song.id)}
            style={{
              flex: 1,
              minWidth: 0,
              textAlign: 'left',
              padding: '6px 8px',
              fontSize: 13,
              border: 0,
              background: 'transparent',
              color: '#26364a',
              fontFamily: 'inherit',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {song.title} · {song.artist}
          </button>
        </div>
      ))}
    </div>
  );
}
