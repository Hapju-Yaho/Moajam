import { useEffect, useRef, useState } from 'react';
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
}: {
  document: ScoreDocument;
  part: string;
  disabled: boolean;
  onLoad: (document: ScoreDocument) => void;
  onBusyChange: (busy: boolean) => void;
  shared?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [pending, setPending] = useState<ScoreDocument | null>(null);
  const [previous, setPrevious] = useState<ScoreDocument | null>(null);
  const [scope, setScope] = useState('current');
  const [showTab, setShowTab] = useState(true);
  const [download, setDownload] = useState<{ url: string; name: string } | null>(null);
  const input = useRef<HTMLInputElement>(null);
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
      const file = await createScorePdf(
        document.score,
        scope === 'all' ? document.score.parts : [part],
        showTab,
      );
      if (!active()) return;
      deliver(
        scoreFileName(`${document.score.title}${scope === 'all' ? '' : ` - ${part}`}`, 'pdf'),
        file,
      );
      setMessage('PDF 다운로드를 시작했어요.');
    });
  const locked = disabled || busy;
  return (
    <section className="score-backing" aria-label="악보 파일 저장과 불러오기" aria-busy={busy}>
      <div className="score-backing-row">
        <strong>악보 파일</strong>
        <button type="button" disabled={locked} onClick={() => void save()}>
          파일로 저장
        </button>
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
        <label>
          PDF 범위
          <select
            aria-label="PDF 저장 범위"
            value={scope}
            disabled={locked}
            onChange={(event) => setScope(event.target.value)}
          >
            <option value="current">현재 파트 · {part}</option>
            <option value="all">전체 파트</option>
          </select>
        </label>
        <label>
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
      </div>
      <p>
        .moajam 파일에는 모든 파트와 연결된 음원이 포함돼요. 파일을 전달하면 녹음도 함께 전달됩니다.
        PDF는 감상·인쇄용이며 편집하려면 .moajam 파일을 사용해주세요.
      </p>
      {pending && (
        <div className="score-file-preview">
          <strong>불러올 악보: {pending.score.title || '제목 없는 악보'}</strong>
          <p>
            {pending.score.parts.join(' · ')} · {pending.score.notes.length}개 음표/쉼표 ·{' '}
            {pending.score.bpm} BPM{pending.instrumentSample ? ' · 악기 녹음 포함' : ''}
            {pending.referenceAudio ? ' · 함께 재생할 음원 포함' : ''}
          </p>
          <p>
            적용하면 현재 악보와 연결된 녹음이 바뀝니다.{' '}
            {shared ? '확인 후 밴드에 저장해주세요.' : '개인 악보에 자동 저장돼요.'} 필요한 작업은
            먼저 ‘파일로 저장’으로 보관해주세요.
          </p>
          <div className="score-backing-row">
            <button
              type="button"
              disabled={locked}
              onClick={() => {
                setPrevious(document);
                onLoad(pending);
                setPending(null);
                setMessage('악보를 불러왔어요. 직전 작업으로 돌아갈 수 있어요.');
              }}
            >
              이 악보 불러오기
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
    </section>
  );
}
