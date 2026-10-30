import { useScoreFilePanel } from './useScoreFilePanel.web';
import { scoreInstrument, type Score } from '../lib/score';
import { scoreVisibleParts } from '../lib/scoreParts';
import {
  clampScoreExportRange,
  scoreExportMeasureCount,
  type ScoreExportOptions,
} from '../lib/scoreExport';
import { ScoreMixerInstrumentIcon } from './ScoreMixerInstrumentIcon.web';
import { cloneElement, isValidElement, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import './ScoreExportMenu.web.css';

export function ScoreExportMenu({
  disabled,
  message,
  downloads,
  part,
  score,
  onSave,
  onImport,
  onXmlImport,
  onMidiImport,
  onPdfImport,
  onPdf,
  onMidi,
  xmlExport,
}: {
  disabled: boolean;
  message: string;
  downloads: { url: string; name: string }[];
  part: string;
  score: Score;
  onSave: () => void;
  onImport: () => void;
  onXmlImport?: () => void;
  onMidiImport?: () => void;
  onPdfImport?: () => void;
  onPdf: (options: ScoreExportOptions) => void;
  onMidi: (options: ScoreExportOptions) => void;
  xmlExport?: ReactNode;
}) {
  const root = useRef<HTMLDivElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const submenu = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: 0, top: 0 });
  const [open, setOpen] = useState<'import' | 'export' | null>(null);
  const [format, setFormat] = useState<'PDF' | 'MIDI' | null>(null);
  useScoreFilePanel(dialog, !!format);
  const parts = scoreVisibleParts(score);
  const count = scoreExportMeasureCount(score);
  const [selectedParts, setSelectedParts] = useState<string[]>([part]);
  const [from, setFrom] = useState('1');
  const [to, setTo] = useState(String(count));
  const ensemble = true;
  const normalize = (changed: 'from' | 'to') => {
    const range = clampScoreExportRange(from, to, count, changed);
    setFrom(String(range.from));
    setTo(String(range.to));
    return range;
  };
  const [tab, setTab] = useState(true);
  const [tabOnly, setTabOnly] = useState(false);
  const [fileName, setFileName] = useState(score.title);
  const hasTab = selectedParts.some((name) => scoreInstrument(score, name).tuning.length > 0);
  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !root.current?.contains(event.target) &&
        !submenu.current?.contains(event.target)
      )
        setOpen(null);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open]);
  useEffect(() => {
    if (format && !dialog.current?.open) dialog.current?.show();
  }, [format]);
  const close = () => {
    dialog.current?.close();
    setFormat(null);
  };
  const choose = (value: 'PDF' | 'MIDI') => {
    setOpen(null);
    setSelectedParts(value === 'MIDI' ? parts : [part]);
    setFrom('1');
    setTo(String(count));
    setFileName(score.title);
    setFormat(value);
  };
  const xml = isValidElement<{ children: ReactNode }>(xmlExport)
    ? cloneElement(xmlExport, {}, 'MusicXML')
    : xmlExport;
  return (
    <>
      <div
        className="score-export-menu"
        ref={root}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && open) {
            event.stopPropagation();
            setOpen(null);
            root.current?.querySelector('button')?.focus();
          }
        }}
      >
        {(['import', 'export'] as const).map((kind) => (
          <button
            key={kind}
            type="button"
            disabled={disabled}
            aria-expanded={open === kind}
            aria-haspopup="menu"
            onClick={(event) => {
              const r = event.currentTarget.getBoundingClientRect();
              setPosition({ left: r.right + 2, top: r.top });
              setOpen(open === kind ? null : kind);
            }}
          >
            {kind === 'import' ? '가져오기' : '내보내기'}
            <svg
              aria-hidden="true"
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
            >
              <path d="m8 4 8 8-8 8" />
            </svg>
          </button>
        ))}
        {open &&
          root.current &&
          createPortal(
            <div
              ref={submenu}
              style={{ ...position, position: 'fixed' }}
              className="score-export-submenu"
              role="menu"
              aria-label={open === 'import' ? '가져오기 형식' : '내보내기 형식'}
            >
              {open === 'import' ? (
                <>
                  <button
                    type="button"
                    role="menuitem"
                    disabled={disabled}
                    onClick={() => {
                      setOpen(null);
                      onImport();
                    }}
                  >
                    .moajam
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    disabled={disabled || !onPdfImport}
                    onClick={() => {
                      setOpen(null);
                      onPdfImport?.();
                    }}
                  >
                    PDF
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    disabled={disabled || !onMidiImport}
                    onClick={() => {
                      setOpen(null);
                      onMidiImport?.();
                    }}
                  >
                    MIDI
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    disabled={disabled || !onXmlImport}
                    onClick={() => {
                      setOpen(null);
                      onXmlImport?.();
                    }}
                  >
                    MusicXML
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    role="menuitem"
                    disabled={disabled}
                    onClick={() => {
                      setOpen(null);
                      onSave();
                    }}
                  >
                    .moajam
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    disabled={disabled}
                    onClick={() => choose('PDF')}
                  >
                    PDF
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    disabled={disabled}
                    onClick={() => choose('MIDI')}
                  >
                    MIDI
                  </button>
                  <div role="none" onClick={() => setOpen(null)}>
                    {xml}
                  </div>
                </>
              )}
            </div>,
            root.current.closest('.score-editor-viewport') ?? document.body,
          )}
      </div>
      {format &&
        root.current &&
        createPortal(
          <dialog
            className="score-export-dialog score-file-floating"
            ref={dialog}
            aria-labelledby="score-export-dialog-title"
            onCancel={() => setFormat(null)}
            onClick={(event) => {
              if (event.target === event.currentTarget && !disabled) close();
            }}
          >
            <section>
              <header>
                <h2 id="score-export-dialog-title">{format} 내보내기</h2>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={close}
                  aria-label="내보내기 설정 닫기"
                >
                  ×
                </button>
              </header>
              <section className="score-export-part-section" aria-label="출력 파트">
                <div className="score-export-parts-heading">
                  <strong>출력 파트</strong>
                  <button
                    type="button"
                    className="score-export-select-all"
                    disabled={disabled}
                    aria-pressed={parts.every((name) => selectedParts.includes(name))}
                    onClick={() =>
                      setSelectedParts(
                        parts.every((name) => selectedParts.includes(name)) ? [] : parts,
                      )
                    }
                  >
                    전체 선택
                  </button>
                </div>
                <div className="score-export-parts" role="group" aria-label="출력할 파트 선택">
                  {parts.map((name) => (
                    <button
                      type="button"
                      key={name}
                      disabled={disabled}
                      aria-pressed={selectedParts.includes(name)}
                      onClick={() =>
                        setSelectedParts(
                          selectedParts.includes(name)
                            ? selectedParts.filter((p) => p !== name)
                            : [...selectedParts, name],
                        )
                      }
                    >
                      <ScoreMixerInstrumentIcon score={score} part={name} />
                      {name}
                    </button>
                  ))}
                </div>
              </section>
              <section className="score-export-measures" aria-label="출력 마디">
                <strong>출력 마디</strong>
                <div>
                  <label>
                    <input
                      type="number"
                      aria-label="출력 시작 마디"
                      disabled={disabled}
                      value={from}
                      onChange={(e) => setFrom(e.target.value)}
                      onBlur={() => normalize('from')}
                    />
                    마디
                  </label>
                  <span>~</span>
                  <label>
                    <input
                      type="number"
                      aria-label="출력 끝 마디"
                      disabled={disabled}
                      value={to}
                      onChange={(e) => setTo(e.target.value)}
                      onBlur={() => normalize('to')}
                    />
                    마디
                  </label>
                  {format === 'PDF' && (
                    <fieldset
                      className="score-export-tab-options"
                      disabled={disabled || !hasTab}
                      aria-label="TAB 출력 옵션"
                    >
                      <label>
                        <input
                          type="checkbox"
                          checked={hasTab && tab}
                          onChange={(e) => {
                            setTab(e.target.checked);
                            if (e.target.checked) setTabOnly(false);
                          }}
                        />
                        TAB 포함
                      </label>
                      <label>
                        <input
                          type="checkbox"
                          checked={hasTab && tabOnly}
                          onChange={(e) => {
                            setTabOnly(e.target.checked);
                            if (e.target.checked) setTab(false);
                          }}
                        />
                        TAB만 출력
                      </label>
                    </fieldset>
                  )}
                </div>
              </section>

              <label className="score-export-name">
                파일 이름
                <span>
                  <input
                    aria-label="출력 파일 이름"
                    disabled={disabled}
                    value={fileName}
                    onChange={(e) => setFileName(e.target.value)}
                  />
                  <span>{format === 'PDF' ? '.pdf' : '.midi'}</span>
                </span>
              </label>
              {format === 'MIDI' && (
                <p>음표와 악기 정보를 저장하며, 녹음·유튜브 음원은 포함하지 않아요.</p>
              )}
              {selectedParts.length > 1 && (
                <p>파트별로 파일 이름 뒤에 _파트이름을 붙여 저장해요.</p>
              )}
              {message && <p role="status">{message}</p>}
              {downloads.map((file) => (
                <a
                  className="score-export-download"
                  key={file.url}
                  href={file.url}
                  download={file.name}
                >
                  {file.name}
                </a>
              ))}
              <footer>
                <button type="button" disabled={disabled} onClick={close}>
                  닫기
                </button>
                <button
                  type="button"
                  disabled={disabled || !selectedParts.length || !fileName.trim()}
                  onClick={() => {
                    const range = normalize('to');
                    const options = {
                      parts: selectedParts,
                      ...range,
                      tab: hasTab && (tab || tabOnly),
                      tabOnly: hasTab && tabOnly,
                      name: fileName,
                      ensemble,
                    };
                    if (format === 'PDF') onPdf(options);
                    else onMidi(options);
                  }}
                >
                  {disabled ? '처리 중…' : `${format} 내보내기`}
                </button>
              </footer>
            </section>
          </dialog>,
          root.current.closest('.score-editor-viewport') ?? document.body,
        )}
    </>
  );
}
