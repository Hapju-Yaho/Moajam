export function ScoreTransportIcon({
  name,
}: {
  name: 'first' | 'previous' | 'play' | 'stop' | 'next' | 'last' | 'loop' | 'metronome';
}) {
  const paths = {
    first: 'M5 5v14M19 5 7 12l12 7Z',
    previous: 'm11 5-8 7 8 7Zm10 0-10 7 10 7Z',
    play: 'm8 4 12 8-12 8Z',
    stop: 'M6 6h12v12H6Z',
    next: 'm3 5 10 7-10 7Zm10 0 10 7-10 7Z',
    last: 'M19 5v14M5 5l12 7-12 7Z',
    loop: 'M19 8H7a4 4 0 0 0-4 4m2 4h12a4 4 0 0 0 4-4M16 5l3 3-3 3M8 13l-3 3 3 3',
    metronome: 'm7 20 4-17h2l4 17ZM12 14l7-9M6 20h12',
  };
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill={
        ['first', 'previous', 'play', 'stop', 'next', 'last'].includes(name)
          ? 'currentColor'
          : 'none'
      }
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={paths[name]} />
    </svg>
  );
}
