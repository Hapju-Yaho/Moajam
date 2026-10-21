import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { HomeTour } from '../packages/app/src/components/HomeTour.web';
export function App() {
  const [open, setOpen] = useState(true);
  const [band, setBand] = useState(false);
  return (
    <>
      <button
        id="restart"
        onClick={() => {
          setBand(true);
          setOpen(true);
        }}
      >
        restart
      </button>
      {[
        'tour-personal-space',
        'tour-personal-menu',
        'tour-band-space',
        'tour-band-actions',
        'tour-band-switcher',
        'tour-band-menu',
        'tour-home-bands',
        'tour-home-calendar',
        'tour-home-songs',
        'tour-help',
      ].map((id) => (
        <div id={id} key={id} style={{ width: 200, height: 30 }}>
          {id}
        </div>
      ))}
      {open && (
        <HomeTour
          hasBand={band}
          bandHome={false}
          onClose={() => setOpen(false)}
          onStep={(target) => {
            document.getElementById('target')!.textContent = target;
          }}
          onCreate={() => setOpen(false)}
          onJoin={() => setOpen(false)}
          onHelp={() => setOpen(false)}
        />
      )}
    </>
  );
}
createRoot(document.getElementById('root')!).render(<App />);
setTimeout(async () => {
  const wait = () => new Promise((r) => setTimeout(r, 90));
  const check = (v: unknown, m: string) => {
    if (!v) throw Error(m);
  };
  const click = (label: string) => {
    const button = [...document.querySelectorAll<HTMLButtonElement>('.home-tour button')].find(
      (b) => b.textContent?.trim() === label,
    );
    check(button, 'button ' + label);
    button!.click();
  };
  try {
    await wait();
    check(document.querySelector('dialog')?.open, 'auto welcome');
    click('함께 둘러보기');
    await wait();
    check(
      document.getElementById('target')!.textContent === 'tour-personal-space',
      'personal first',
    );
    click('다음');
    await wait();
    check(
      document.getElementById('target')!.textContent === 'tour-personal-menu',
      'personal menus next',
    );
    click('이전');
    await wait();
    check(document.getElementById('target')!.textContent === 'tour-personal-space', 'previous');
    click('건너뛰기');
    await wait();
    check(!document.querySelector('dialog'), 'skip closes');
    document.getElementById('restart')!.click();
    await wait();
    click('함께 둘러보기');
    await wait();
    for (let i = 0; i < 3; i++) {
      click('다음');
      await wait();
    }
    check(
      document.getElementById('target')!.textContent === 'tour-band-actions',
      'band create join',
    );
    click('다음');
    await wait();
    check(document.getElementById('target')!.textContent === 'tour-band-switcher', 'switch band');
    click('다음');
    await wait();
    check(document.getElementById('target')!.textContent === 'tour-band-menu', 'band menus');
    while (
      ![...document.querySelectorAll('.home-tour button')].some((b) => b.textContent === '시작하기')
    ) {
      click('다음');
      await wait();
    }
    click('시작하기');
    await wait();
    check(!document.querySelector('dialog'), 'finish');
    document.getElementById('result')!.textContent =
      'PASS: welcome, order, previous, skip, replay, band actions and finish';
  } catch (e) {
    document.getElementById('result')!.textContent = 'FAIL: ' + String(e);
  }
}, 100);
