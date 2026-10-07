import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { drumArticulations, drumInputRows } from '../lib/scoreDrums';
import { DrumNotehead } from './DrumNotehead.web';

export function DrumNotationGuide() {
  const [open, setOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    if (open) dialog.current?.showModal();
    else dialog.current?.close();
  }, [open]);
  return (
    <>
      <button
        type="button"
        aria-label="드럼 도움말"
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
      >
        <span aria-hidden="true">ⓘ</span> 도움말
      </button>
      {createPortal(
        <dialog
          ref={dialog}
          className="drum-notation-guide"
          aria-labelledby={titleId}
          onCancel={() => setOpen(false)}
          onClose={() => setOpen(false)}
          onClick={(event) => {
            if (event.target === event.currentTarget) setOpen(false);
          }}
          onKeyDown={(event) => event.stopPropagation()}
        >
          <header className="drum-guide-heading">
            <h2 id={titleId}>드럼 기호 · 숫자키 안내</h2>
            <button type="button" onClick={() => setOpen(false)}>
              닫기
            </button>
          </header>
          <p>
            ↑↓로 오선 위치를 선택하고 숫자키로 기호를 입력하거나 바꿉니다. 같은 위치의 기존 기호는
            교체하고, 다른 높이의 타격은 유지합니다. Enter는 현재 고른 기호를 입력합니다.
          </p>
          <table>
            <thead>
              <tr>
                <th>오선 위치</th>
                <th>숫자키와 기호</th>
              </tr>
            </thead>
            <tbody>
              {drumInputRows.map((group) => (
                <tr key={group.y}>
                  <th>{group.label}</th>
                  <td>
                    {group.choices.map((choice, index) => (
                      <span
                        className="drum-guide-choice"
                        key={`${choice.pitch}/${choice.technique}`}
                      >
                        <kbd>{index + 1}</kbd>
                        <svg viewBox="-24 -22 50 56" width="50" height="56" aria-hidden="true">
                          <path d="M17 18V-6" stroke="currentColor" />
                          <DrumNotehead
                            tone={{ pitch: choice.pitch, drumTechnique: choice.technique }}
                            x={12}
                            y={18}
                            beats={1}
                            stemEnd={-6}
                          />
                        </svg>
                        {choice.label}
                      </span>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div aria-label="드럼 주법 기호">
            {drumArticulations.map(({ technique, label }) => (
              <span className="drum-guide-choice" key={technique}>
                <svg viewBox="-24 -22 50 56" width="50" height="56" aria-hidden="true">
                  <path d="M17 18V-6" stroke="currentColor" />
                  <DrumNotehead
                    tone={{ pitch: technique === 'choke' ? 49 : 38, drumTechnique: technique }}
                    x={12}
                    y={18}
                    beats={1}
                    stemEnd={-6}
                  />
                </svg>
                {label}
              </span>
            ))}
          </div>
          <p>
            ●는 드럼·탐, ×는 하이햇·심벌, 원형 ×는 차이나·풋 하이햇 스플래시, ◆는 라이드
            벨·스플래시, ▲는 카우벨입니다. 높이와 모양을 함께 읽습니다. ○는 열림, +는 닫힘, 빗금
            원은 하프 오픈, (음표)는 고스트노트(O)입니다. 크로스 스틱은 빈 음표, 림샷은 음표에 X를
            겹쳐 표시합니다. 기둥의 빗금은 더블 스트로크, Z는 버즈 롤입니다. 크래시 초크는 스타카토
            점으로 표시하며 해당 심벌만 짧게 끊어 재생합니다.
          </p>
          <p>
            초크·플램·드래그·더블 스트로크·사선 2·3개·버즈 롤은 별도 주법 버튼으로 설정합니다.
            입력된 음표에서는 바로 적용되며, 빈 위치에서는 주법을 고른 뒤 1 또는 Enter로 입력합니다.
            켜진 주법 버튼을 다시 누르면 해제합니다. 초크는 크래시·차이나·스플래시에서, 나머지
            주법은 스네어·탐에서 사용할 수 있으며 다른 악기에서는 버튼이 비활성화됩니다.
          </p>
          <p>
            플램은 작은 음표 1개, 드래그는 2개이며 고스트 노트와 다릅니다. 더블 스트로크는 사선 1개,
            더 빠른 롤은 사선 2·3개로 표시합니다. 롤의 타수는 음표 길이에도 달려 있습니다.
          </p>
          <p>
            ‘음표·주법’에서 악센트(A), 마르카토(^), 초크(S), 스티킹(R/L)을 설정합니다. 강약·강약
            변화, 연주 지시, 기본 하이햇, 브러시·말렛과 반복·이동은 ‘마디·표현’에서 설정합니다.
          </p>
          <p>
            하이햇 1키는 기본 음표입니다. 마디의 Closed H.H/Open H.H/Half-open H.H 지시가 다음
            변경까지 적용되고 개별 ○·+ 표시는 우선합니다. 지시가 없으면 닫힌 소리가 기본입니다.
          </p>
          <p>
            플램·드래그는 입력된 박의 앞부분에 약한 타격 후 본음을 배치합니다. 버즈 롤과 브러시·말렛
            음색은 합성음으로 근사합니다. MIDI의 브러시·말렛 음색은 재생기의 드럼 음원에 따라
            달라집니다.
          </p>
          <p>
            범례 참고:{' '}
            <a
              href="https://s3.amazonaws.com/drumeosecure/00-archive/pdfs/the-drumeo-notation-key.pdf"
              target="_blank"
              rel="noreferrer"
            >
              Drumeo
            </a>{' '}
            ·{' '}
            <a
              href="https://blogs.berklee.edu/wp-content/uploads/2010/05/DrumsetLegend.pdf"
              target="_blank"
              rel="noreferrer"
            >
              Berklee
            </a>
            . 드럼 기호는 악보마다 다를 수 있습니다.
          </p>
          <p>
            4분음표를 1박으로 셀 때: 온음표 4박 · 2분 2박 · 4분 1박 · 8분 ½박 · 16분 ¼박 · 32분 ⅛박.
            점은 원래 길이의 절반을 더합니다. 쉼표도 같은 길이이며 R로 입력합니다.
          </p>
          <p>
            Ctrl+1은 1성부, Ctrl+2는 2성부 편집입니다. 선택하지 않은 성부는 30% 진하기로 표시합니다.
            상단 성부 버튼으로 두 성부를 함께 켤 수 있으며, 편집할 위치를 클릭해 입력할 성부를
            고릅니다. Ctrl+M으로 두 성부를 함께 켜거나 1성부 편집으로 돌아갈 수 있습니다.
          </p>
          <p>
            위 성부는 기둥이 위로, 아래 성부는 아래로 향합니다. 두 성부의 쉼표는 각각 그 성부만
            쉬라는 뜻입니다. 위에 쉼표가 있어도 아래 성부의 킥은 연주할 수 있습니다.
          </p>
          <p>
            쉼표는 각 성부에 입력한 길이와 개수대로 표시하며 자동으로 합치지 않습니다. 여러 마디
            쉼표(멀티레스트)는 ‘마디 쉼표 입력’으로 두 성부 전체를 쉬도록 입력한 마디들이 연속될 때
            표시합니다. 선택한 마디만 1마디로 펼치고 양옆의 연속된 쉼표는 각각 묶어서 표시합니다.
          </p>
        </dialog>,
        document.body,
      )}
    </>
  );
}
