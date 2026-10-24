import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ActionButton, FlexBetween, Heading, Meta, Surface } from './ProductUI';
import { useIdentity } from '../state/Identity';
import { useMockAppState } from '../state/MockAppState';
import { createBandScoreStore } from '../lib/bandScoreStore.web';
import { readScoreVersionLibrary, type ScoreVersionLibrary } from '../lib/scoreVersions';
import { scorePartStaves } from '../lib/scoreParts';
import { ScoreEnsemble } from './ScoreEnsemble.web';
import type { ScreenProps } from '../navigation';
import './GuitarTabEditor.web.css';
import './SongScoreViewer.web.css';

const noop = () => {};
export function SongScoreViewer({
  songId,
  navigate,
}: {
  songId: string;
  navigate: ScreenProps['navigate'];
}) {
  const userId = useIdentity();
  const { workspaceId } = useMockAppState();
  const [library, setLibrary] = useState<ScoreVersionLibrary | null>(null);
  const [part, setPart] = useState('');
  const [zoom, setZoom] = useState(100);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [expanded, setExpanded] = useState(false);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    setLibrary(null);
    void createBandScoreStore(workspaceId, songId, userId)
      .load()
      .then((value) => {
        if (!active) return;
        const next = value ? readScoreVersionLibrary(value) : null;
        setLibrary(next);
        setPart(next?.parts[0]?.part ?? '');
      })
      .catch((reason: unknown) => {
        if (active)
          setError(reason instanceof Error ? reason.message : '악보를 불러오지 못했어요.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [workspaceId, songId, userId, attempt]);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const expandButton = useRef<HTMLButtonElement>(null);
  const wasExpanded = useRef(false);
  useEffect(() => {
    if (!expanded) {
      if (wasExpanded.current) expandButton.current?.focus();
      wasExpanded.current = false;
      return;
    }
    wasExpanded.current = true;
    const dialog = dialogRef.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog?.showModal();
    return () => {
      dialog?.close();
      document.body.style.overflow = previousOverflow;
    };
  }, [expanded]);
  const score = library?.applied.score;
  const reader =
    score && library ? (
      <div className="song-score-reader">
        <div className="song-score-toolbar">
          <label className="song-score-control">
            <span>파트</span>
            <select
              aria-label="볼 악보 파트"
              value={part}
              onChange={(event) => setPart(event.target.value)}
            >
              <option value="all">전체 파트</option>
              {library.parts.map((group) => (
                <option key={group.part} value={group.part}>
                  {group.part}
                </option>
              ))}
            </select>
          </label>
          <label className="song-score-control">
            <span>확대</span>
            <select
              aria-label="악보 확대"
              value={zoom}
              onChange={(event) => setZoom(Number(event.target.value))}
            >
              {[75, 100, 125, 150].map((value) => (
                <option key={value} value={value}>
                  {value}%
                </option>
              ))}
            </select>
          </label>
          <button
            ref={expanded ? undefined : expandButton}
            type="button"
            className="song-score-expand"
            onClick={() => setExpanded(!expanded)}
            autoFocus={expanded}
          >
            <svg
              aria-hidden="true"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
            >
              <path
                d={
                  expanded
                    ? 'M8 3v5H3m13-5v5h5M3 16h5v5m8 0v-5h5'
                    : 'M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5'
                }
              />
            </svg>
            {expanded ? '전체화면 닫기' : '전체화면'}
          </button>
        </div>
        <div className="song-score-canvas">
          <article className="song-score-paper">
            <header className="song-score-title">
              <span>MOAJAM SCORE</span>
              <h2>{score.title || '제목 없는 악보'}</h2>
              <p>
                {part === 'all' ? '전체 파트' : part} · {score.bpm} BPM
              </p>
            </header>
            <ScoreEnsemble
              score={score}
              part={part === 'all' ? score.parts[0] : part}
              parts={part === 'all' ? score.parts : scorePartStaves(score, part)}
              showPartLabels={false}
              selected={null}
              hasSelection={false}
              onDeselect={noop}
              selectedString={1}
              cursor={null}
              playbackBeat={null}
              zoom={zoom}
              onSelect={noop}
              onAppend={noop}
              onChordSelect={noop}
              emptyBeat={0}
              inputBeats={1}
              showTab
              rangeIds={[]}
              onRangeSelect={noop}
              editable={false}
              otherVoiceOpacity={1}
            />
          </article>
        </div>
      </div>
    ) : null;
  return (
    <Surface>
      <FlexBetween>
        <Heading>제작 악보</Heading>
        <ActionButton
          onPress={() =>
            navigate('band-score-editor', {
              id: songId,
              workspaceId,
              scorePart: part === 'all' ? undefined : part,
            })
          }
        >
          악보 편집
        </ActionButton>
      </FlexBetween>
      <Meta>곡에 적용된 악보 · 읽기 전용</Meta>
      {loading && <Meta>악보 불러오는 중…</Meta>}
      {!!error && (
        <>
          <Meta accessibilityRole="alert">{error}</Meta>
          <ActionButton secondary onPress={() => setAttempt((value) => value + 1)}>
            다시 불러오기
          </ActionButton>
        </>
      )}
      {!loading && !error && !score && (
        <Meta>
          아직 제작 악보가 없어요. 악보 편집에서 만들거나 개인 악보를 가져와 밴드에 저장해주세요.
        </Meta>
      )}
      {expanded
        ? createPortal(
            <dialog
              ref={dialogRef}
              className="song-score-fullscreen"
              aria-label="악보 전체화면"
              onCancel={(event) => {
                event.preventDefault();
                setExpanded(false);
              }}
            >
              {reader}
            </dialog>,
            document.body,
          )
        : reader}
    </Surface>
  );
}
