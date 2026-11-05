import './ScoreSectionToggle.web.css';

export function ScoreSectionToggle({
  label,
  expanded,
  controls,
  onClick,
}: {
  label: string;
  expanded: boolean;
  controls: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="score-section-toggle"
      aria-label={`${label} ${expanded ? '접기' : '펼치기'}`}
      title={`${label} ${expanded ? '접기' : '펼치기'}`}
      aria-expanded={expanded}
      aria-controls={controls}
      onClick={onClick}
    >
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="m6 9 6 6 6-6" />
      </svg>
    </button>
  );
}
