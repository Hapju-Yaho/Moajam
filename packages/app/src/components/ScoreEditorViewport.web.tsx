import { useEffect, useId, useRef, useState, type PropsWithChildren } from 'react';
import './ScoreEditorViewport.web.css';

const shortcuts = [
  [
    '선택과 이동',
    [
      ['← / →', '이전·다음 박으로 이동'],
      ['↑ / ↓', 'TAB의 줄 이동'],
      ['Shift + ← / →', '여러 박 선택 (마우스 드래그도 가능)'],
      ['Esc', '선택 해제 · 전체화면에서는 전체화면 종료'],
      ['Page Up / Page Down', '선택 마디를 이전·다음 악보 줄로 배치'],
    ],
  ],
  [
    '음표 입력',
    [
      ['0–9', 'TAB 프렛 입력 · 두 자리 숫자는 빠르게 연속 입력'],
      ['[ / ]', '음표 길게 / 짧게'],
      ['.', '점음표 켜기·끄기 (원래 길이의 절반 추가)'],
      ['R', '쉼표 입력·전환'],
      ['Insert', '현재 위치에 새 박 삽입'],
      ['Delete / Backspace', '선택한 음 삭제 · 빈 박은 쉼표로 · 쉼표는 빈 박으로'],
      ['Shift + Delete / Backspace', '선택한 박을 삭제하고 뒤 음표 당기기'],
    ],
  ],
  [
    '주법과 연결',
    [
      ['S', '스타카토 · 같은 박 전체'],
      ['X', '데드노트 · 선택한 음'],
      ['O', '고스트노트 · 선택한 음'],
      ['H / P / J / T', '해머링 / 풀링 / 슬라이드 / 붙임줄'],
    ],
  ],
  [
    '복사와 재생',
    [
      ['Ctrl + C / V', '선택 구간 복사 / 선택 위치에 삽입'],
      ['Ctrl + Z', '실행 취소'],
      ['Ctrl + Shift + Z / Ctrl + Y', '다시 실행'],
      ['Space', '선택 위치부터 재생 / 정지'],
    ],
  ],
] as const;

export function ScoreEditorViewport({ children }: PropsWithChildren) {
  const root = useRef<HTMLDivElement>(null);
  const fullscreenButton = useRef<HTMLButtonElement>(null);
  const helpButton = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const nativeFullscreen = useRef(false);
  const [expanded, setExpanded] = useState(false);
  const titleId = useId();

  useEffect(() => {
    const node = root.current;
    const changed = () => {
      if (document.fullscreenElement === node) {
        nativeFullscreen.current = true;
        setExpanded(true);
      } else if (nativeFullscreen.current) {
        nativeFullscreen.current = false;
        setExpanded(false);
        fullscreenButton.current?.focus({ preventScroll: true });
      }
    };
    document.addEventListener('fullscreenchange', changed);
    return () => {
      document.removeEventListener('fullscreenchange', changed);
      if (document.fullscreenElement === node) void document.exitFullscreen().catch(() => {});
    };
  }, []);

  useEffect(() => {
    if (!expanded) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    // Keep keyboard focus inside the editor in browsers using the in-page fallback.
    const siblings: { node: HTMLElement; inert: boolean }[] = [];
    let branch: HTMLElement | null = root.current;
    while (branch && branch !== document.body) {
      for (const sibling of branch.parentElement?.children ?? []) {
        if (sibling !== branch && sibling instanceof HTMLElement) {
          siblings.push({ node: sibling, inert: sibling.inert });
          sibling.inert = true;
        }
      }
      branch = branch.parentElement;
    }
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || dialog.current?.open) return;
      event.preventDefault();
      event.stopPropagation();
      if (document.fullscreenElement === root.current)
        void document.exitFullscreen().catch(() => {});
      setExpanded(false);
      fullscreenButton.current?.focus({ preventScroll: true });
    };
    window.addEventListener('keydown', escape, true);
    return () => {
      document.body.style.overflow = previousOverflow;
      siblings.forEach(({ node, inert }) => {
        node.inert = inert;
      });
      window.removeEventListener('keydown', escape, true);
    };
  }, [expanded]);

  const toggleFullscreen = async () => {
    if (expanded) {
      if (document.fullscreenElement === root.current)
        await document.exitFullscreen().catch(() => {});
      setExpanded(false);
    } else {
      setExpanded(true);
      // Unsupported/denied native fullscreen still expands the editor to fill the window.
      try {
        await root.current?.requestFullscreen?.();
      } catch {
        /* Use the in-page view. */
      }
    }
  };

  return (
    <div ref={root} className="score-editor-viewport" data-expanded={expanded}>
      <div className="score-editor-viewbar" role="toolbar" aria-label="악보 화면과 도움말">
        <span>{expanded ? '전체화면 악보 편집' : '악보 편집 도구'}</span>
        <button
          ref={helpButton}
          type="button"
          aria-haspopup="dialog"
          onClick={() => dialog.current?.showModal()}
        >
          단축키
        </button>
        <button
          ref={fullscreenButton}
          type="button"
          aria-pressed={expanded}
          onClick={() => void toggleFullscreen()}
        >
          {expanded ? '전체화면 종료' : '전체화면'}
        </button>
      </div>
      <div className="score-editor-content">{children}</div>
      <dialog
        ref={dialog}
        className="score-shortcuts-dialog"
        aria-labelledby={titleId}
        onClose={() => helpButton.current?.focus({ preventScroll: true })}
        onClick={(event) => {
          const bounds = event.currentTarget.getBoundingClientRect();
          if (
            event.target === event.currentTarget &&
            (event.clientX < bounds.left ||
              event.clientX > bounds.right ||
              event.clientY < bounds.top ||
              event.clientY > bounds.bottom)
          )
            dialog.current?.close();
        }}
      >
        <header>
          <h2 id={titleId}>악보 편집 단축키</h2>
          <button
            type="button"
            onClick={() => dialog.current?.close()}
            aria-label="단축키 안내 닫기"
          >
            닫기
          </button>
        </header>
        <p>
          악보의 칸을 클릭한 뒤 사용하세요. 텍스트 입력 중에는 적용되지 않아요. Mac에서는 Ctrl 대신
          ⌘를 사용해요.
        </p>
        <div className="score-shortcuts-groups">
          {shortcuts.map(([title, items]) => (
            <section key={title}>
              <h3>{title}</h3>
              <dl>
                {items.map(([key, description]) => (
                  <div key={key}>
                    <dt>
                      <kbd>{key}</kbd>
                    </dt>
                    <dd>{description}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
        <p>
          여러 박을 선택한 상태에서 Delete를 누르면 선택 구간이 삭제되고 뒤 음표가 당겨져요. 연결
          주법은 첫 음표를 선택한 뒤 적용하세요.
        </p>
      </dialog>
    </div>
  );
}
