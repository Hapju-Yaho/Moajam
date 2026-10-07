import { Children, isValidElement, useId, type ButtonHTMLAttributes, type ReactNode } from 'react';

import { ScoreDrumTechniqueIcon } from './ScoreDrumTechniqueIcon.web';

function textOf(node: ReactNode): string {
  return Children.toArray(node)
    .map((child): string => {
      if (typeof child === 'string' || typeof child === 'number') return String(child);
      return isValidElement<{ children?: ReactNode }>(child) ? textOf(child.props.children) : '';
    })
    .join('');
}

// Use the same notation and accessible names in every instrument's toolbar.
function symbolFor(label: string) {
  if (/마디 쉼표/.test(label)) return '𝄻';
  if (/쉼표/.test(label)) return '𝄽';
  if (/셋잇단/.test(label)) return '③';
  if (/점음표/.test(label)) return '♩·';
  if (/꾸밈음/.test(label))
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <ellipse cx="8" cy="18" rx="3" ry="2" fill="currentColor" transform="rotate(-20 8 18)" />
        <path d="M11 18V3c8 3 8 6 4 9M6 13l12-7" />
      </svg>
    );
  if (/악센트/.test(label)) return '>';
  if (/스타카토|초크/.test(label))
    return (
      <svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="1.5">
        <ellipse cx="9" cy="14" rx="4" ry="2.6" transform="rotate(-20 9 14)" />
        <path d="M13 14V2" />
        <circle cx="9" cy="21" r="1.3" />
      </svg>
    );
  if (/데드노트/.test(label)) return '×';
  if (/고스트/.test(label)) return '(♩)';
  if (/슬러/.test(label)) return '⌒';
  if (/붙임줄/.test(label)) return '♩⌢♩';
  if (/해머/.test(label)) return 'H⌒';
  if (/풀링|풀오프/.test(label)) return 'P⌒';
  if (/슬라이드 아웃/.test(label)) return label.includes('↗') ? '↗' : '↘';
  if (/글리산도|지판 슬라이드/.test(label)) return '∿';
  if (/슬라이드/.test(label)) return '╱';
  if (/해제|삭제/.test(label)) return '⊘';
  if (/리듬 슬래시|슬래시 기보/.test(label))
    return (
      <svg
        data-rhythm-slash-icon="true"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      >
        <path d="M3 10H21M3 15H21M3 20H21" opacity=".2" strokeWidth="1" />
        <path d="M7 19L13 11H17L11 19Z" fill="currentColor" strokeLinejoin="round" />
        <path d="M17 11V3" />
      </svg>
    );
  if (/슬래시/.test(label)) return '╱';
  if (/입력/.test(label)) return '↵';
  if (/마르카토/.test(label)) return '^';
  if (/플램/.test(label)) return <ScoreDrumTechniqueIcon type="flam" />;
  if (/드래그/.test(label)) return <ScoreDrumTechniqueIcon type="drag" />;
  if (/버즈/.test(label)) return <ScoreDrumTechniqueIcon type="buzz" />;
  if (/림샷/.test(label)) return '⊗';
  if (/사이드/.test(label)) return '×';
  if (/하프/.test(label)) return '⦶';
  if (/오픈/.test(label)) return '○';
  if (/클로즈/.test(label)) return '+';
  if (/더블 스트로크/.test(label)) return <ScoreDrumTechniqueIcon type="double" />;
  if (/사선 2개/.test(label)) return <ScoreDrumTechniqueIcon type="roll2" />;
  if (/사선 3개/.test(label)) return <ScoreDrumTechniqueIcon type="roll3" />;
  if (/롤/.test(label)) return label.includes('3') ? '≡' : label.includes('2') ? '〓' : '╱';
  if (/크레셴도/.test(label)) return '〈';
  if (/앞 마디 반복/.test(label)) return '%';
  return '♩';
}

export function ScoreToolButton({
  children,
  icon,
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { icon?: ReactNode }) {
  const label = props['aria-label'] ?? textOf(children).replace(/\s+/g, ' ').trim();
  const hintId = useId();
  const hint =
    props.title && !props.title.includes(label)
      ? `${label} · ${props.title}`
      : (props.title ?? label);
  return (
    <span className="score-tool-wrap">
      <button
        {...props}
        type={props.type ?? 'button'}
        aria-label={label}
        aria-describedby={hintId}
        className={`score-tool-button ${className}`}
      >
        <span className="score-tool-icon" aria-hidden="true">
          {icon ?? symbolFor(label)}
        </span>
        <span className="score-tool-text" aria-hidden="true">
          {label}
        </span>
      </button>
      <span id={hintId} className="score-tool-tooltip" role="tooltip">
        {hint}
      </span>
    </span>
  );
}
