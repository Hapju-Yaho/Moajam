import {
  useEffect,
  useLayoutEffect,
  useId,
  useRef,
  useState,
  type PropsWithChildren,
  type ReactNode,
} from 'react';
import './ScoreEditorViewport.web.css';
import { ScoreEditorLayoutContext, type ScoreInspectorTab } from './ScoreEditorLayout.web';

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
      [
        'Delete / Backspace',
        '선택한 음 삭제 · 빈 박은 쉼표로 · 쉼표는 삭제하고 같은 마디 안에서 당기기',
      ],
      ['Shift + Delete / Backspace', '선택한 박을 삭제하고 뒤 음표 당기기'],
    ],
  ],
  [
    '주법과 연결',
    [
      ['S', '스타카토 · 드럼은 선택한 타격의 초크'],
      ['X', '데드노트 · 선택한 음'],
      ['O', '고스트노트 · 선택한 음'],
      ['H 또는 P', '선택 구간 해머링·풀링 자동 연결 / 해제'],
      ['J / T', '레가토 슬라이드 / 붙임줄'],
      ['L', '선택 구간의 이음줄(슬러) 켜기·끄기'],
    ],
  ],
  [
    '복사와 재생',
    [
      ['Ctrl + C / V', '선택 구간 복사 / 선택 위치에 삽입'],
      ['Ctrl + Z', '실행 취소'],
      ['Ctrl + Shift + Z / Ctrl + Y', '다시 실행'],
      ['Space', '재생 / 정지 · 선택 구간 반복 체크 시 드래그한 구간 반복'],
    ],
  ],
] as const;

export function ScoreEditorViewport({
  children,
  heading,
  title = '나의 악보',
  shared = false,
  status,
  initiallyExpanded = false,
}: PropsWithChildren<{
  heading?: ReactNode;
  title?: string;
  shared?: boolean;
  status?: string;
  initiallyExpanded?: boolean;
}>) {
  const root = useRef<HTMLDivElement>(null);
  const fullscreenButton = useRef<HTMLButtonElement>(null);
  const helpButton = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const [expanded, setExpanded] = useState(initiallyExpanded);
  const titleId = useId();
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [inspector, setInspector] = useState<ScoreInspectorTab>('notes');
  const [filePanel, setFilePanel] = useState<'file' | null>(null);
  // ScrollView uses translateZ(0), which contains fixed descendants. The top layer
  // escapes that containing block without remounting the editor or using fullscreen.
  useLayoutEffect(() => {
    if (expanded) root.current?.showPopover();
  }, [expanded]);

  useEffect(() => {
    if (!expanded) return;
    const previousOverflow = document.body.style.overflow;
    const previousRootOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    // Hide the app shell and keep keyboard focus inside the expanded editor.
    const siblings: { node: HTMLElement; inert: boolean; visibility: string }[] = [];
    let branch: HTMLElement | null = root.current;
    while (branch && branch !== document.body) {
      for (const sibling of branch.parentElement?.children ?? []) {
        if (sibling !== branch && sibling instanceof HTMLElement) {
          siblings.push({
            node: sibling,
            inert: sibling.inert,
            visibility: sibling.style.visibility,
          });
          sibling.inert = true;
          sibling.style.visibility = 'hidden';
        }
      }
      branch = branch.parentElement;
    }
    const escape = (event: KeyboardEvent) => {
      if (
        event.key !== 'Escape' ||
        dialog.current?.open ||
        root.current?.querySelector('.score-measure-menu') ||
        (event.target instanceof HTMLElement && event.target.closest('.score-editable-title input'))
      )
        return;
      event.preventDefault();
      event.stopPropagation();
      if (filePanel) {
        setFilePanel(null);
        return;
      }
      setExpanded(false);
      fullscreenButton.current?.focus({ preventScroll: true });
    };
    window.addEventListener('keydown', escape, true);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.documentElement.style.overflow = previousRootOverflow;
      siblings.forEach(({ node, inert, visibility }) => {
        node.inert = inert;
        node.style.visibility = visibility;
      });
      window.removeEventListener('keydown', escape, true);
    };
  }, [expanded, filePanel]);

  const toggleFullscreen = () => setExpanded((value) => !value);

  return (
    <ScoreEditorLayoutContext.Provider
      value={{
        expanded,
        inspector,
        setInspector,
        filePanel,
        setFilePanel,
        inspectorOpen,
        setInspectorOpen,
      }}
    >
      <div
        ref={root}
        className="score-editor-viewport"
        data-expanded={expanded}
        data-inspector-open={inspectorOpen}
        data-inspector={inspector}
        data-file-panel={filePanel ?? 'closed'}
        popover={expanded ? 'manual' : undefined}
      >
        <header className="score-editor-viewbar">
          <div className="score-expanded-heading">
            <span className="score-expanded-brand">
              <svg viewBox="0 0 30 26" aria-hidden="true">
                <path d="M3 22 6 4l9 12L24 4l3 18" />
              </svg>{' '}
              Moajam
            </span>
            <strong>{title || '제목 없는 악보'}</strong>
            <span className="score-expanded-badge">{shared ? '밴드 악보' : '개인 악보'}</span>
            {status && (
              <span className="score-expanded-save" role="status">
                {status}
              </span>
            )}
          </div>
          <div className="score-normal-heading">{heading}</div>
          <div className="score-editor-view-actions" role="toolbar" aria-label="악보 화면과 도움말">
            <div className="score-expanded-file-buttons">
              <button
                aria-expanded={filePanel === 'file'}
                onClick={() => setFilePanel(filePanel === 'file' ? null : 'file')}
              >
                파일 · 내보내기⌄
              </button>
            </div>
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
              {expanded ? '원래 화면' : '악보 크게 보기'}
            </button>
          </div>
        </header>
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
            악보의 칸을 클릭한 뒤 사용하세요. 텍스트 입력 중에는 적용되지 않아요. Mac에서는 Ctrl
            대신 ⌘를 사용해요.
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
    </ScoreEditorLayoutContext.Provider>
  );
}
