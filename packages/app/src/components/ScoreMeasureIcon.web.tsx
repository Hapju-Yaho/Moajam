export function ScoreMeasureIcon({
  name,
}: {
  name:
    'beat' | 'fill' | 'append' | 'insert' | 'delete' | 'end' | 'up' | 'down' | 'reset' | 'settings';
}) {
  return (
    <svg
      data-measure-icon={name}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {name === 'beat' && (
        <>
          <path d="M9 17V4M15 9h7M18.5 5.5v7" />
          <ellipse cx="6" cy="17" rx="3" ry="2" fill="currentColor" />
        </>
      )}
      {name === 'fill' && (
        <>
          <path d="M3 4v16M21 4v16M3 9h18M9 9v4h6V9" />
          <path d="M9 11h6" strokeWidth="4" />
        </>
      )}
      {['append', 'insert', 'delete'].includes(name) && (
        <>
          <path d="M3 5v14M15 5v14M3 7h12M3 12h8M3 17h12M14 12h8" />
          {name !== 'delete' && <path d="M18 8v8" />}
          {name === 'insert' && <path d="M8 4v16" strokeDasharray="2 3" />}
        </>
      )}
      {name === 'end' && (
        <>
          <path d="M20 4v16M4 12h12m-5-5 5 5-5 5" />
        </>
      )}
      {(name === 'up' || name === 'down') && (
        <>
          <path d="M3 5h10M3 9h10M3 15h10M3 19h10M19 5v14" />
          <path d={name === 'up' ? 'm16 8 3-3 3 3' : 'm16 16 3 3 3-3'} />
        </>
      )}
      {name === 'reset' && (
        <>
          <path d="M4 7h16M4 12h10M4 17h8M17 12a4 4 0 1 1-2 6M14 15v4h4" />
        </>
      )}
      {name === 'settings' && (
        <>
          <path d="M4 5h16M4 12h16M4 19h16" />
          <path d="M9 3v4M16 10v4M8 17v4" strokeWidth="3" />
        </>
      )}
    </svg>
  );
}
