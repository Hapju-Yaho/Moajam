import styledWeb from '@emotion/styled';
import { useEffect, useId, useRef } from 'react';

export function TimeWheel({
  label,
  values,
  index,
  onChange,
}: {
  label: string;
  values: string[];
  index: number;
  onChange: (index: number) => void;
}) {
  const id = useId();
  const scroll = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const change = useRef(onChange);
  change.current = onChange;
  useEffect(() => {
    scroll.current?.scrollTo({ top: index * 44, behavior: 'instant' });
  }, [index]);
  useEffect(() => () => clearTimeout(timer.current), []);
  return (
    <TimeWheelContainer>
      <TimeWheelContainer2>{label}</TimeWheelContainer2>
      <TimeWheelContainer3
        ref={scroll}
        role="listbox"
        aria-label={label}
        tabIndex={0}
        aria-activedescendant={`${id}-${index}`}
        onKeyDown={(event) => {
          const steps: Record<string, number> = {
            ArrowUp: -1,
            ArrowDown: 1,
            PageUp: -5,
            PageDown: 5,
          };
          if (event.key in steps || event.key === 'Home' || event.key === 'End') {
            event.preventDefault();
            const next =
              event.key === 'Home'
                ? 0
                : event.key === 'End'
                  ? values.length - 1
                  : index + steps[event.key];
            onChange(Math.max(0, Math.min(values.length - 1, next)));
          }
        }}
        onScroll={() => {
          clearTimeout(timer.current);
          timer.current = setTimeout(() => {
            const next = Math.max(
              0,
              Math.min(values.length - 1, Math.round((scroll.current?.scrollTop ?? 0) / 44)),
            );
            change.current(next);
          }, 160);
        }}
      >
        <TimeWheelContainer4 aria-hidden />
        {values.map((value, item) => (
          <TimeWheelContainer5
            key={value}
            id={`${id}-${item}`}
            role="option"
            aria-selected={index === item}
            onClick={() => onChange(item)}
            $label={label}
            $index={index}
            $item={item}
          >
            {value}
          </TimeWheelContainer5>
        ))}
        <TimeWheelContainer4 aria-hidden />
      </TimeWheelContainer3>
    </TimeWheelContainer>
  );
}

const TimeWheelContainer = styledWeb('div')({ '&&&&': { flex: 1, minWidth: 0 } });

const TimeWheelContainer2 = styledWeb('div')({
  '&&&&': { textAlign: 'center', fontSize: 12, color: '#72819a', marginBottom: 8 },
});

const TimeWheelContainer3 = styledWeb('div')({
  '&&&&': {
    height: 220,
    overflowY: 'auto',
    scrollSnapType: 'y mandatory',
    scrollbarWidth: 'none',
    overscrollBehavior: 'contain',
    borderRadius: 12,
    outlineOffset: -2,
    background:
      'linear-gradient(to bottom, transparent 88px, #eaf0ff 88px, #eaf0ff 132px, transparent 132px)',
  },
});

const TimeWheelContainer4 = styledWeb('div')({ '&&&&': { height: 88 } });

const TimeWheelContainer5 = styledWeb('div')<{ $label: string; $index: number; $item: number }>(
  ({ $label, $index, $item }) => ({
    '&&&&': {
      height: 44,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      scrollSnapAlign: 'center',
      cursor: 'pointer',
      fontSize: $label === '오전 / 오후' ? 23 : 30,
      fontWeight: $index === $item ? 600 : 400,
      color: $index === $item ? '#315ccc' : '#9ba8bd',
      fontVariantNumeric: 'tabular-nums',
    },
  }),
);
