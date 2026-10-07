export function ScoreFileIcon({ name }: { name: 'import' | 'export' | 'chevron' }) {
  return (
    <svg
      className={`score-file-icon score-file-icon--${name}`}
      width={name === 'chevron' ? 16 : 20}
      height={name === 'chevron' ? 16 : 20}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {name === 'chevron' ? (
        <path d="m7 10 5 5 5-5" />
      ) : (
        <>
          <path d="M4 15v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4" />
          {name === 'import' ? (
            <path d="M12 3v12m-4-4 4 4 4-4" />
          ) : (
            <path d="M12 15V3m-4 4 4-4 4 4" />
          )}
        </>
      )}
    </svg>
  );
}
