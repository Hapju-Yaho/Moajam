import { ScoreXmlImport } from './ScoreXmlImport.web';
import { ScorePdfImport } from './ScorePdfImport.web';
import { ScoreMidiImport } from './ScoreMidiImport.web';
import type { Score } from '../lib/score';
import { prepareScoreExport, scoreExportFiles, type ScoreExportOptions } from '../lib/scoreExport';
import { createPortal } from 'react-dom';
import { ScoreExportMenu } from './ScoreExportMenu.web';
import { useScoreEditorLayout } from './ScoreEditorLayout.web';
import { scorePartStaves, scorePartOwner } from '../lib/scoreParts';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { ScoreSectionToggle } from './ScoreSectionToggle.web';
import { ScoreFileIcon } from './ScoreFileIcon.web';
import { ScoreFileMenu } from './ScoreFileMenu.web';
import './ScoreFileActions.web.css';
import { downloadBlob } from '../lib/platformActions.web';
import {
  MAX_SCORE_FILE_BYTES,
  parseScoreFile,
  scoreFileName,
  serializeScoreFile,
  type ScoreDocument,
} from '../lib/scoreFile';

export function ScoreFileActions({
  document,
  part,
  disabled,
  onLoad,
  onMidiApply,
  onXmlApply,
  onBusyChange,
  shared = false,
  header,
  personalImport,
  importFeedback,
  xmlImport,
  xmlExport,
  versions,
  importAsVersion = false,
}: {
  document: ScoreDocument;
  part: string;
  disabled: boolean;
  onLoad: (document: ScoreDocument) => void;
  onMidiApply?: (score: Score) => void;
  onXmlApply?: (score: Score) => void;
  onBusyChange: (busy: boolean) => void;
  shared?: boolean;
  header?: ReactNode;
  personalImport?: ReactNode;
  importFeedback?: ReactNode;
  xmlImport?: ReactNode;
  xmlExport?: ReactNode;
  versions?: ReactNode;
  importAsVersion?: boolean;
}) {
  const layout = useScoreEditorLayout();
  const [expanded, setExpanded] = useState(false);
  const bodyId = useId();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [pending, setPending] = useState<ScoreDocument | null>(null);
  const [previous, setPrevious] = useState<ScoreDocument | null>(null);
  const [scope, setScope] = useState('current');
  const [midiScope, setMidiScope] = useState('all');
  const [showTab, setShowTab] = useState(true);
  const [downloads, setDownloads] = useState<{ url: string; name: string }[]>([]);
  const urls = useRef<string[]>([]);
  const download = downloads.at(-1);
  const input = useRef<HTMLInputElement>(null);
  const xmlInput = useRef<HTMLInputElement>(null);
  const [xmlFile, setXmlFile] = useState<File | null>(null);
  const [moajamFile, setMoajamFile] = useState<File | null>(null);
  const midiInput = useRef<HTMLInputElement>(null);
  const [midiFile, setMidiFile] = useState<File | null>(null);
  const [pdfImportOpen, setPdfImportOpen] = useState(false);
  const root = useRef<HTMLElement>(null);
  const generation = useRef(0);
  useEffect(
    () => () => {
      urls.current.forEach((url) => URL.revokeObjectURL(url));
    },
    [],
  );
  const deliver = (name: string, file: Blob) => {
    const url = URL.createObjectURL(file);
    urls.current.push(url);
    setDownloads((previous) => [...previous, { url, name }]);
    downloadBlob(name, file);
  };
  useEffect(
    () => () => {
      generation.current++;
      onBusyChange(false);
    },
    [onBusyChange],
  );
  const run = async (work: (active: () => boolean) => Promise<void>) => {
    const request = ++generation.current;
    const active = () => request === generation.current;
    setBusy(true);
    onBusyChange(true);
    setMessage('');
    urls.current.forEach((url) => URL.revokeObjectURL(url));
    urls.current = [];
    setDownloads([]);
    try {
      await work(active);
    } catch (error) {
      if (active())
        setMessage(error instanceof Error ? error.message : '파일을 처리하지 못했어요.');
    } finally {
      if (active()) {
        setBusy(false);
        onBusyChange(false);
      }
    }
  };
  const save = () =>
    run(async (active) => {
      const content = await serializeScoreFile(document);
      if (!active()) return;
      deliver(
        scoreFileName(document.score.title, 'moajam'),
        new Blob([content], { type: 'application/json' }),
      );
      setMessage('악보 파일 다운로드를 시작했어요. 모든 파트와 연결된 녹음이 포함돼요.');
    });
  const load = (file: File) =>
    run(async (active) => {
      setPending(null);
      if (file.size > MAX_SCORE_FILE_BYTES)
        throw new Error('160MB 이하의 악보 파일을 선택해주세요.');
      if (!file.size) throw new Error('비어 있는 파일은 불러올 수 없어요.');
      const parsed = parseScoreFile(await file.text());
      if (active()) {
        setPending(parsed);
        layout.setFilePanel('file');
      }
    });
  const pdf = (pdfScope = scope, pdfTab = showTab, options?: ScoreExportOptions) =>
    run(async (active) => {
      setMessage('PDF를 만들고 있어요…');
      const { createScorePdf } = await import('../lib/scorePdf.web');
      if (!active()) return;
      const staff = root.current
        ?.closest('.score-editor-viewport')
        ?.querySelector('.score-systems');
      const layoutWidth = Number(staff?.getAttribute('data-layout-width')) || 800;
      const prepared = options ? prepareScoreExport(document.score, options) : null;
      if (options && prepared) {
        for (const entry of scoreExportFiles(document.score, options, 'pdf')) {
          const file = await createScorePdf(
            prepared.score,
            entry.parts,
            options.tab,
            layoutWidth,
            false,
            options.tabOnly,
          );
          if (!active()) return;
          deliver(entry.name, file);
        }
        setMessage('PDF 파일 다운로드를 시작했어요.');
        return;
      }
      const file = await createScorePdf(
        prepared?.score ?? document.score,
        prepared?.parts ??
          (pdfScope !== 'current' ? document.score.parts : scorePartStaves(document.score, part)),
        pdfTab,
        layoutWidth,
        options?.ensemble ?? pdfScope === 'ensemble',
      );
      if (!active()) return;
      deliver(
        scoreFileName(
          `${document.score.title}${pdfScope !== 'current' ? '' : ` - ${scorePartOwner(document.score, part)}`}`,
          'pdf',
        ),
        file,
      );
      setMessage('PDF 다운로드를 시작했어요.');
    });
  const locked = disabled || busy;
  const midi = (exportScope = midiScope, options?: ScoreExportOptions) =>
    run(async (active) => {
      const { scoreToMidi } = await import('../lib/scoreMidi');
      if (!active()) return;
      const prepared = options ? prepareScoreExport(document.score, options) : null;
      const parts =
        prepared?.parts ??
        (exportScope === 'all' ? document.score.parts : scorePartStaves(document.score, part));
      if (options && prepared) {
        for (const entry of scoreExportFiles(document.score, options, 'midi'))
          deliver(
            entry.name,
            new Blob([scoreToMidi(prepared.score, entry.parts)], { type: 'audio/midi' }),
          );
        setMessage('MIDI 파일 다운로드를 시작했어요.');
        return;
      }
      deliver(
        scoreFileName(`${document.score.title}${exportScope === 'all' ? '' : ` - ${part}`}`, 'mid'),
        new Blob([scoreToMidi(prepared?.score ?? document.score, parts)], { type: 'audio/midi' }),
      );
      setMessage('MIDI 다운로드를 시작했어요. 파트별 음표·BPM·반복 순서를 저장했어요.');
    });
  return (
    <section
      ref={root}
      className="score-file-actions"
      aria-label="악보 파일 저장과 불러오기"
      aria-busy={busy}
      data-collapsed={!expanded && !layout.expanded}
    >
      {createPortal(
        <ScorePdfImport
          open={pdfImportOpen}
          onClose={() => setPdfImportOpen(false)}
          score={document.score}
          part={part}
          onApply={onXmlApply ?? onMidiApply}
        />,
        window.document.body,
      )}
      {layout.exportHost &&
        createPortal(
          <ScoreExportMenu
            disabled={locked}
            message={message}
            downloads={downloads}
            score={document.score}
            part={scorePartOwner(document.score, part)}
            onSave={() => void save()}
            onImport={() => input.current?.click()}
            onPdfImport={() => setPdfImportOpen(true)}
            onMidiImport={onMidiApply ? () => midiInput.current?.click() : undefined}
            onXmlImport={
              onXmlApply
                ? () => xmlInput.current?.click()
                : xmlImport
                  ? () =>
                      root.current
                        ?.querySelector<HTMLInputElement>('input[accept=".musicxml,.xml"]')
                        ?.click()
                  : undefined
            }
            onPdf={(options) => void pdf('all', options.tab, options)}
            onMidi={(options) => void midi('all', options)}
            xmlExport={xmlExport}
          />,
          layout.exportHost,
        )}
      <input
        ref={xmlInput}
        hidden
        type="file"
        accept=".musicxml,.xml"
        aria-label="MusicXML 파일 가져오기"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (file) setXmlFile(file);
        }}
      />
      {xmlFile &&
        root.current &&
        onXmlApply &&
        createPortal(
          <ScoreXmlImport
            file={xmlFile}
            score={document.score}
            part={scorePartOwner(document.score, part)}
            onApply={onXmlApply}
            onClose={() => setXmlFile(null)}
          />,
          root.current.closest('.score-editor-viewport') ?? window.document.body,
        )}
      {moajamFile &&
        root.current &&
        onXmlApply &&
        createPortal(
          <ScoreXmlImport
            format=".moajam"
            file={moajamFile}
            score={document.score}
            part={scorePartOwner(document.score, part)}
            onApply={onXmlApply}
            onClose={() => setMoajamFile(null)}
          />,
          root.current.closest('.score-editor-viewport') ?? window.document.body,
        )}
      <input
        ref={midiInput}
        hidden
        type="file"
        accept=".mid,.midi,audio/midi"
        aria-label="MIDI 파일 가져오기"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (file) setMidiFile(file);
        }}
      />
      {midiFile &&
        root.current &&
        onMidiApply &&
        createPortal(
          <ScoreMidiImport
            key={midiFile.name + '/' + midiFile.lastModified}
            file={midiFile}
            score={document.score}
            part={scorePartOwner(document.score, part)}
            onApply={onMidiApply}
            onClose={() => setMidiFile(null)}
          />,
          root.current.closest('.score-editor-viewport') ?? window.document.body,
        )}
      {layout.expanded && (
        <button className="score-file-close" onClick={() => layout.setFilePanel(null)}>
          닫기
        </button>
      )}
      <div className="score-file-section-header">
        <ScoreSectionToggle
          label="저장 · 파일"
          expanded={expanded}
          controls={bodyId}
          onClick={() => setExpanded(!expanded)}
        />
        {header || <strong>저장 · 파일</strong>}
      </div>
      <div id={bodyId} className="score-file-section-body">
        {versions}
        <div className="score-file-row score-file-import-row">
          <strong className="score-file-row-label">
            <ScoreFileIcon name="import" /> 가져오기
          </strong>
          <div className="score-file-row-actions">
            <button type="button" disabled={locked} onClick={() => setPdfImportOpen(true)}>
              PDF
            </button>
            {personalImport}
            <button type="button" disabled={locked} onClick={() => input.current?.click()}>
              파일 불러오기
            </button>
            <input
              type="file"
              ref={input}
              hidden
              accept=".moajam,.json"
              aria-label="모아잼 악보 파일 불러오기"
              disabled={locked}
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = '';
                if (file) {
                  if (onXmlApply) setMoajamFile(file);
                  else void load(file);
                }
              }}
            />
            {onXmlApply ? (
              <button type="button" disabled={locked} onClick={() => xmlInput.current?.click()}>
                MusicXML 가져오기
              </button>
            ) : (
              xmlImport
            )}
          </div>
        </div>
        <div className="score-file-row score-file-export-row">
          <strong className="score-file-row-label">
            <ScoreFileIcon name="export" /> 내보내기
          </strong>
          <div className="score-file-row-actions">
            <button type="button" disabled={locked} onClick={() => void save()}>
              .moajam 저장
            </button>
            <ScoreFileMenu label="PDF" disabled={locked}>
              <strong>PDF로 저장</strong>
              <label>
                PDF 범위
                <select
                  aria-label="PDF 저장 범위"
                  value={scope}
                  disabled={locked}
                  onChange={(event) => setScope(event.target.value)}
                >
                  <option value="current">
                    현재 파트 · {scorePartOwner(document.score, part)}
                  </option>
                  <option value="ensemble">전체 합주 악보</option>
                  <option value="all">전체 파트 · 각각</option>
                </select>
              </label>
              <label className="score-file-checkbox">
                <input
                  type="checkbox"
                  checked={showTab}
                  disabled={locked}
                  onChange={(event) => setShowTab(event.target.checked)}
                />
                PDF에 TAB 포함
              </label>
              <button type="button" disabled={locked} onClick={() => void pdf()}>
                PDF로 저장
              </button>
            </ScoreFileMenu>
            <ScoreFileMenu label="MIDI" disabled={locked}>
              <strong>MIDI로 저장</strong>
              <label>
                MIDI 범위
                <select
                  aria-label="MIDI 저장 범위"
                  value={midiScope}
                  disabled={locked}
                  onChange={(event) => setMidiScope(event.target.value)}
                >
                  <option value="all">전체 파트</option>
                  <option value="current">
                    현재 파트 · {scorePartOwner(document.score, part)}
                  </option>
                </select>
              </label>
              <p>음표와 악기 정보를 저장하며, 녹음·유튜브 음원은 포함하지 않아요.</p>
              <button type="button" disabled={locked} onClick={() => void midi()}>
                MIDI로 저장
              </button>
            </ScoreFileMenu>
            {xmlExport}
            <button type="button" disabled={locked} onClick={() => window.print()}>
              인쇄
            </button>
          </div>
          <div className="score-file-guide">
            <ScoreFileMenu label="파일 안내">
              <strong>파일 형식 안내</strong>
              <p>
                .moajam 파일에는 모든 파트와 연결된 음원이 포함돼요. 파일을 전달하면 녹음도 함께
                전달됩니다.
              </p>
              <p>PDF는 감상·인쇄용이며, 편집하려면 .moajam 파일을 사용해주세요.</p>
              <p>
                MIDI는 음표와 악기 정보를 저장해요. 녹음·유튜브 음원은 포함되지 않으며, 재생 음색은
                사용하는 프로그램에 따라 달라져요. 슬라이드·해머링·풀링은 음높이와 박자로,
                데드노트는 짧은 음으로 저장돼요.
              </p>
              <p>MusicXML은 다른 악보 프로그램과 악보를 주고받을 때 사용해요.</p>
            </ScoreFileMenu>
          </div>
        </div>
        {importFeedback}
        {pending && (
          <div className="score-file-preview">
            <strong>불러올 악보: {pending.score.title || '제목 없는 악보'}</strong>
            <p>
              {pending.score.parts.join(' · ')} · {pending.score.notes.length}개 음표/쉼표 ·{' '}
              {pending.score.bpm} BPM{pending.instrumentSample ? ' · 악기 녹음 포함' : ''}
              {pending.referenceAudio ? ' · 함께 재생할 음원 포함' : ''}
            </p>
            <p>
              {importAsVersion
                ? '가져올 파트를 골라 현재 파트의 새 버전으로 추가합니다. 음원·녹음과 곡 전체 설정은 유지됩니다.'
                : '적용하면 현재 악보와 연결된 녹음이 바뀝니다.'}{' '}
              {!importAsVersion &&
                (shared ? '확인 후 밴드에 저장해주세요.' : '개인 악보에 자동 저장돼요.')}
            </p>
            <div className="score-backing-row">
              <button
                type="button"
                disabled={locked}
                onClick={() => {
                  if (!importAsVersion) setPrevious(document);
                  onLoad(pending);
                  setPending(null);
                  setMessage(
                    importAsVersion ? '' : '악보를 불러왔어요. 직전 작업으로 돌아갈 수 있어요.',
                  );
                }}
              >
                {importAsVersion ? '새 버전으로 가져오기' : '이 악보 불러오기'}
              </button>
              <button type="button" disabled={locked} onClick={() => setPending(null)}>
                취소
              </button>
            </div>
          </div>
        )}
        {previous && (
          <button
            type="button"
            disabled={locked}
            onClick={() => {
              onLoad(previous);
              setPrevious(null);
              setPending(null);
              setMessage('불러오기 전 악보와 녹음을 복원했어요.');
            }}
          >
            불러오기 전 작업으로 복원
          </button>
        )}
        {message && <p role="status">{message}</p>}
        {download && (
          <p>
            <a href={download.url} download={download.name}>
              다운로드 다시 하기 · {download.name}
            </a>
          </p>
        )}
      </div>
    </section>
  );
}
