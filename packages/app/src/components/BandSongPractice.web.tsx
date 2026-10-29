import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { BandSongPracticeProps } from './BandSongPractice';
import { PracticeStudio } from './PracticeStudio';
import { SongPdfLibrary } from './SongPdfLibrary.web';
import { SongLyricsPanel } from './SongLyrics.web';
import { BandScoreProjects } from '../screens/BandScoreEditorScreen.web';
import './BandSongPractice.web.css';
import { PracticeSectionHeading } from './PracticeSectionHeading.web';
import { useIdentity } from '../state/Identity';

type PracticeView = 'recording' | 'score' | 'pdf' | 'lyrics';
function readPracticeView(key: string, initial: PracticeView): PracticeView {
  if (initial === 'pdf') return initial;
  try {
    const saved = sessionStorage.getItem(key);
    if (saved === 'recording' || saved === 'score' || saved === 'pdf' || saved === 'lyrics')
      return saved;
  } catch {
    /* Browser storage is optional. */
  }
  return initial;
}

export function BandSongPractice({
  songId,
  title,
  workspaceId,
  navigate,
  assetId,
  initialView,
  studioProps,
}: BandSongPracticeProps) {
  const user = useIdentity();
  const viewKey = `moajam/song-practice-view/${user}/${workspaceId}/${songId}`;
  const [view, setView] = useState<PracticeView>(() => readPracticeView(viewKey, initialView));
  const [toolbarHost, setToolbarHost] = useState<HTMLElement | null>(null);
  useEffect(() => setToolbarHost(document.getElementById('band-song-practice-toolbar')), []);
  useEffect(() => setView(readPracticeView(viewKey, initialView)), [initialView, viewKey]);
  const choose = (next: typeof view) => {
    if (next === view) return;
    const action = () => {
      try {
        sessionStorage.setItem(viewKey, next);
      } catch {
        /* Browser storage is optional. */
      }
      setView(next);
    };
    if (
      window.dispatchEvent(
        new CustomEvent('moajam:before-navigate', { cancelable: true, detail: action }),
      )
    )
      action();
  };
  const toolbar = (
    <div className="band-song-practice-tabs" role="group" aria-label="연습 화면 선택">
      <button aria-pressed={view === 'recording'} onClick={() => choose('recording')}>
        녹음 프로젝트
      </button>
      <button aria-pressed={view === 'score'} onClick={() => choose('score')}>
        악보 프로젝트
      </button>
      <button id="practice-pdf-open" aria-pressed={view === 'pdf'} onClick={() => choose('pdf')}>
        PDF 악보
      </button>
      <button aria-pressed={view === 'lyrics'} onClick={() => choose('lyrics')}>
        가사 보기
      </button>
    </div>
  );
  return (
    <section className="band-song-practice" aria-label="곡 연습">
      {toolbarHost ? createPortal(toolbar, toolbarHost) : toolbar}
      <div className="band-song-practice-content">
        {view !== 'recording' && (
          <PracticeSectionHeading
            title={view === 'score' ? '악보 프로젝트' : view === 'pdf' ? 'PDF 악보' : '가사 보기'}
          />
        )}
        {view === 'recording' ? (
          <PracticeStudio {...studioProps} />
        ) : view === 'score' ? (
          <BandScoreProjects
            key={`${workspaceId}/${songId}`}
            embedded
            songId={songId}
            entityId={songId}
            title={title}
            navigate={navigate}
          />
        ) : view === 'pdf' ? (
          <SongPdfLibrary embedded songId={songId} title={title} assetId={assetId} />
        ) : (
          <SongLyricsPanel songId={songId} title={title} preferenceScope="band" />
        )}
      </div>
    </section>
  );
}
