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
  const [download, setDownload] = useState<{ url: string; name: string } | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const root = useRef<HTMLElement>(null);
  const generation = useRef(0);
  useEffect(
    () => () => {
      if (download) URL.revokeObjectURL(download.url);
    },
    [download],
  );
  const deliver = (name: string, file: Blob) => {
    setDownload({ url: URL.createObjectURL(file), name });
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
      if (active()) setPending(parsed);
    });
  const pdf = () =>
    run(async (active) => {
      setMessage('PDF를 만들고 있어요…');
      const { createScorePdf } = await import('../lib/scorePdf.web');
      if (!active()) return;
      const staff = root.current
        ?.closest('.score-editor-viewport')
        ?.querySelector('.score-systems');
      const layoutWidth = Number(staff?.getAttribute('data-layout-width')) || 800;
      const file = await createScorePdf(
        document.score,
        scope !== 'current' ? document.score.parts : scorePartStaves(document.score, part),
        showTab,
        layoutWidth,
        scope === 'ensemble',
      );
      if (!active()) return;
      deliver(
        scoreFileName(
          `${document.score.title}${scope !== 'current' ? '' : ` - ${scorePartOwner(document.score, part)}`}`,
          'pdf',
        ),
        file,
      );
      setMessage('PDF 다운로드를 시작했어요.');
    });
  const locked = disabled || busy;
  const midi = () =>
    run(async (active) => {
      const { scoreToMidi } = await import('../lib/scoreMidi');
      if (!active()) return;
      const parts =
        midiScope === 'all' ? document.score.parts : scorePartStaves(document.score, part);
      deliver(
        scoreFileName(`${document.score.title}${midiScope === 'all' ? '' : ` - ${part}`}`, 'mid'),
        new Blob([scoreToMidi(document.score, parts)], { type: 'audio/midi' }),
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
                if (file) void load(file);
              }}
            />
            {xmlImport}
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
