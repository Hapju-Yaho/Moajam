import { bandHomeTourSteps } from '../lib/bandHomeTour';
import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { HomeTourProps } from './HomeTour';
import './HomeTour.web.css';
type Rect = { x: number; y: number; width: number; height: number };
export function HomeTour({
  onComplete,
  onReady,
  initialStep = 0,
  customSteps,
  tourTitle,
  hasBand,
  bandHome,
  bandInfo,
  onClose,
  onStep,
  onCreate,
  onJoin,
  onHelp,
}: HomeTourProps) {
  const steps: NonNullable<HomeTourProps['customSteps']> =
    customSteps ??
    (bandHome
      ? bandHomeTourSteps(
          bandInfo ?? { canManage: false, hasNext: true, hasSongs: true, hasCandidates: true },
        )
      : [
          {
            title: '모아잼에 오신 것을 환영해요!',
            body: '함께 연주할 곡을 고르고, 합주 일정을 잡고, 악보와 연습을 공유하는 공간이에요. 화면을 함께 둘러볼까요?',
            target: '',
          },
          {
            title: '나의 활동을 모아 보는 개인 공간',
            body: '여러 밴드에 참여해도 내 일정과 참여곡을 한곳에서 확인할 수 있어요. 혼자 연습할 때도 여기서 시작하세요.',
            target: 'tour-personal-space',
          },
          {
            title: '개인 공간의 메뉴를 살펴보세요',
            body: '합주 일정에서 일정을, 팀 관리에서 참여 팀을 확인해요. 연습할 곡은 작업실의 연습하기에서 찾아보세요.',
            target: 'tour-personal-menu',
          },
          {
            title: '함께 만드는 밴드 공간',
            body: '각 밴드에는 멤버들과 함께 쓰는 공간이 있어요. 곡을 정하고 일정을 잡으며 연습 자료를 공유할 수 있어요.',
            target: 'tour-band-space',
          },
          {
            title: '밴드를 만들거나 참여해보세요',
            body: hasBand
              ? '밴드 선택 메뉴를 펼치면 밴드 만들기와 밴드 참여하기를 찾을 수 있어요. 새 밴드를 만들거나 받은 초대 코드로 다른 밴드에 참여하세요.'
              : '밴드 만들기로 새 공간을 만들거나, 밴드 참여하기에서 받은 초대 코드를 입력하세요.',
            target: hasBand ? 'tour-band-actions' : 'tour-band-switcher',
          },
          ...(hasBand
            ? [
                {
                  title: '밴드를 선택하고 이동하세요',
                  body: '이 목록에서 활동할 밴드를 선택해요. 밴드를 바꾸면 해당 밴드의 홈과 곡·일정으로 이동합니다.',
                  target: 'tour-band-switcher',
                },
                {
                  title: '밴드의 활동은 이 메뉴에서',
                  body: '곡 선택부터 연습, 합주 일정과 멤버 관리까지. 밴드 활동에 필요한 기능을 이 메뉴에서 찾을 수 있어요.',
                  target: 'tour-band-menu',
                },
              ]
            : []),
          ...(!bandHome
            ? [
                {
                  title: '내 밴드를 한눈에 확인해요',
                  body: '참여한 밴드 카드에서 밴드별 소식을 확인하고, 카드를 누르면 해당 밴드 홈으로 이동해요.',
                  target: 'tour-home-bands',
                },
              ]
            : []),
          {
            title: '캘린더에서 일정을 확인하세요',
            body: bandHome
              ? '밴드 합주 일정을 확인하고 날짜나 일정을 눌러 내용을 살펴보세요.'
              : '여러 밴드의 합주와 개인 일정을 모아 볼 수 있어요. 날짜나 일정을 누르면 자세히 확인할 수 있습니다.',
            target: 'tour-home-calendar',
          },
          {
            title: '곡을 고르고 연습을 시작해요',
            body: bandHome
              ? '곡을 누르면 상세에서 의견을 나누고 악보와 트랙을 이용할 수 있어요.'
              : '연습할 곡에서 내 참여곡을 찾고 연습을 시작하세요. 아직 곡이 없다면 밴드에 참여해 함께할 곡을 정해보세요.',
            target: 'tour-home-songs',
          },
          {
            title: '언제든 다시 둘러볼 수 있어요',
            body: '화면의 물음표 버튼을 누르면 이 안내를 다시 볼 수 있어요. 더 자세한 내용은 도움말 모음에서 확인하세요. 이제 함께 시작해볼까요?',
            target: 'tour-help',
          },
        ]);
  const [index, setIndex] = useState(initialStep);
  const step = steps[Math.min(index, steps.length - 1)];
  const [rects, setRects] = useState<Rect[]>([]);
  const rect =
    step.placement === 'bottom'
      ? rects.reduce<Rect | null>(
          (last, area) => (!last || area.y + area.height > last.y + last.height ? area : last),
          null,
        )
      : (rects[0] ?? null);
  const [size, setSize] = useState({ width: window.innerWidth, height: window.innerHeight });
  const dialog = useRef<HTMLDialogElement>(null);
  const card = useRef<HTMLElement>(null);
  const callback = useRef(onStep);
  const readyCallback = useRef(onReady);
  callback.current = onStep;
  const mask = useId().replaceAll(':', '');
  useEffect(() => {
    const element = dialog.current;
    const previous = document.activeElement;
    element?.showModal();
    readyCallback.current?.();
    return () => {
      element?.close();
      if (
        previous instanceof HTMLElement &&
        previous.isConnected &&
        !document.querySelector('dialog[open]')
      )
        previous.focus({ preventScroll: true });
    };
  }, []);
  useEffect(() => {
    callback.current(step.target);
    let frame: number;
    let count = 0;
    const measure = () => {
      const byId = step.target ? document.getElementById(step.target) : null;
      const elements = byId
        ? [byId]
        : step.target.startsWith('.')
          ? [...document.querySelectorAll(step.target)]
          : [];
      const element = elements[0];
      if (element && step.scroll !== false && count++ === 2)
        element.scrollIntoView({
          block:
            step.target === '.studio-console' || step.placement === 'bottom' ? 'start' : 'nearest',
          inline: 'nearest',
          behavior: 'instant',
        });
      let next = elements
        .map((element) => {
          const bounds = element.getBoundingClientRect();
          let left = 4,
            top = 4,
            right = window.innerWidth - 4,
            bottom = window.innerHeight - 4;
          let parent = element.parentElement;
          while (parent) {
            const style = getComputedStyle(parent);
            const clip = parent.getBoundingClientRect();
            if (/(auto|scroll|hidden|clip)/.test(style.overflowX)) {
              left = Math.max(left, clip.left);
              right = Math.min(right, clip.right);
            }
            if (/(auto|scroll|hidden|clip)/.test(style.overflowY)) {
              top = Math.max(top, clip.top);
              bottom = Math.min(bottom, clip.bottom);
            }
            parent = parent.parentElement;
          }
          const daw = element.closest('.studio-console')?.getBoundingClientRect();
          if (daw) {
            left = Math.max(left, daw.left);
            right = Math.min(right, daw.right);
            top = Math.max(top, daw.top);
            bottom = Math.min(bottom, daw.bottom);
          }
          if (element.matches('.studio-ruler')) {
            const header = element.parentElement
              ?.querySelector('.studio-track-head')
              ?.getBoundingClientRect();
            if (header) left = Math.max(left, header.right);
          }
          const x = Math.max(left, bounds.left - 6);
          const y = Math.max(top, bounds.top - 6);
          return {
            x,
            y,
            width: Math.max(0, Math.min(right, bounds.right + 6) - x),
            height: Math.max(0, Math.min(bottom, bounds.bottom + 6) - y),
          };
        })
        .filter((area) => area.width > 0 && area.height > 0);
      if (step.groupHighlight && next.length) {
        const x = Math.min(...next.map((area) => area.x));
        const y = Math.min(...next.map((area) => area.y));
        next = [
          {
            x,
            y,
            width: Math.max(...next.map((area) => area.x + area.width)) - x,
            height: Math.max(...next.map((area) => area.y + area.height)) - y,
          },
        ];
      }
      setRects((old) => (JSON.stringify(old) === JSON.stringify(next) ? old : next));
      setSize((old) =>
        old.width === window.innerWidth && old.height === window.innerHeight
          ? old
          : { width: window.innerWidth, height: window.innerHeight },
      );
      frame = requestAnimationFrame(measure);
    };
    frame = requestAnimationFrame(measure);
    card.current?.focus({ preventScroll: true });
    return () => cancelAnimationFrame(frame);
  }, [step.target, step.groupHighlight, step.placement, step.scroll]);
  const last = index === steps.length - 1;
  const width = Math.min(step.width ?? (step.wide ? 1280 : 380), size.width - 32);
  const height = card.current?.offsetHeight ?? 310;
  const right = rect && rect.x + rect.width + width + 28 < size.width;
  const placeLeft = step.target === 'tour-band-candidates' && rect && rect.x - width - 18 >= 16;
  const left = placeLeft
    ? rect!.x - width - 18
    : right
      ? rect!.x + rect!.width + 18
      : Math.max(16, Math.min(rect?.x ?? (size.width - width) / 2, size.width - width - 16));
  const below = step.placement === 'bottom' && rect && rect.y + rect.height + 160 < size.height;
  const top = step.wide
    ? 16
    : below
      ? rect!.y + rect!.height + 18
      : !rect
        ? Math.max(16, (size.height - height) / 2)
        : right || placeLeft
          ? Math.max(16, Math.min(rect.y, size.height - height - 16))
          : rect.y + rect.height + height + 24 < size.height
            ? rect.y + rect.height + 18
            : Math.max(16, rect.y - height - 18);
  return createPortal(
    <dialog
      ref={dialog}
      className="home-tour"
      aria-labelledby="home-tour-title"
      aria-describedby="home-tour-description"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <svg className="home-tour-shade" width="100%" height="100%" aria-hidden="true">
        <defs>
          <mask id={mask}>
            <rect width="100%" height="100%" fill="white" />
            {rects.map((area, index) => (
              <rect key={index} {...area} rx="12" fill="black" />
            ))}
          </mask>
        </defs>
        <rect
          width="100%"
          height="100%"
          fill="#101d53"
          fillOpacity="0.65"
          mask={'url(#' + mask + ')'}
        />
        {rects.map((area, index) => (
          <rect key={index} {...area} rx="12" fill="none" stroke="#84b0ff" strokeWidth="3" />
        ))}
      </svg>
      <section
        ref={card}
        tabIndex={-1}
        className="home-tour-card"
        style={{
          width,
          left: step.wide ? (size.width - width) / 2 : left,
          top,
          ...(step.wide
            ? { maxHeight: size.height - 32 }
            : below
              ? { maxHeight: size.height - top - 16 }
              : {}),
        }}
      >
        <div className="home-tour-progress">
          <span>
            {tourTitle ?? (bandHome ? '밴드 홈 둘러보기' : '모아잼 둘러보기')} · {index + 1} /{' '}
            {steps.length}
          </span>
          <button onClick={onClose} aria-label="도움말 건너뛰기">
            ×
          </button>
        </div>
        <div aria-live="polite">
          <h2 id="home-tour-title">{step.title}</h2>
          <p id="home-tour-description" style={{ whiteSpace: 'pre-line' }}>
            {step.body}
          </p>
          {step.example}
          {step.action && <button onClick={step.action}>{step.actionLabel}</button>}
        </div>
        {last && !customSteps && !hasBand && (
          <div className="home-tour-start">
            <button onClick={onCreate}>밴드 만들기</button>
            <button onClick={onJoin}>초대 코드로 참여하기</button>
          </div>
        )}
        {last && !customSteps && (
          <button className="home-tour-link" onClick={onHelp}>
            도움말 모음 보기
          </button>
        )}
        <footer>
          <button className="home-tour-link" onClick={onClose}>
            {index === 0 ? '나중에 보기' : '건너뛰기'}
          </button>
          <div>
            {index > 0 && <button onClick={() => setIndex(index - 1)}>이전</button>}
            <button
              className="home-tour-next"
              onClick={() => (last ? (onComplete ?? onClose)() : setIndex(index + 1))}
            >
              {last ? (customSteps ? '완료' : '시작하기') : index === 0 ? '함께 둘러보기' : '다음'}
            </button>
          </div>
        </footer>
      </section>
    </dialog>,
    document.body,
  );
}
