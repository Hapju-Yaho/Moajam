// In-memory fixture; never reads or changes a user's stored score.
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ScoreEditorViewport } from '../packages/app/src/components/ScoreEditorViewport.web';
import { ScoreParts } from '../packages/app/src/components/ScoreParts.web';
import { GuitarTabEditor } from '../packages/app/src/components/GuitarTabEditor.web';
import { ScoreFileActions } from '../packages/app/src/components/ScoreFileActions.web';
import { addInstrumentPart, scorePartOwner } from '../packages/app/src/lib/scoreParts';
import { scoreFromMusicXml } from '../packages/app/src/lib/scoreImport.web';
import { createScorePdf } from '../packages/app/src/lib/scorePdf.web';
import { scoreToMusicXml } from '../packages/app/src/lib/score';
import type { Score, ScoreClipboardNote } from '../packages/app/src/lib/score';
const ignore = () => {};
export function Fixture() {
  const [score, setScore] = useState<Score>(() => {
    let s: Score = {
      title: '우리의 첫 합주',
      bpm: 112,
      parts: ['기타 1'],
      notes: [],
      sync: {},
      instruments: { '기타 1': 'guitar' },
    };
    s = addInstrumentPart(s, '베이스', 'bass');
    s = addInstrumentPart(s, '키보드', 'piano');
    s.notes = s.parts.flatMap((part, index) =>
      Array.from({ length: index === 3 ? 4 : 16 }, (_, i) => ({
        id: `${index}-${i}`,
        part,
        pitch: [64, 40, 72, 36][index] + (i % 4),
        beats: index === 3 ? 4 : 1,
        rest: false,
        chord: '',
        lyric: '',
        accent: false,
      })),
    );
    return s;
  });
  const [part, setPart] = useState('키보드'),
    [selected, setSelected] = useState<string | null>(null),
    [ensemble, setEnsemble] = useState(false),
    [all, setAll] = useState(false),
    [panel, setPanel] = useState(false);
  const [verification, setVerification] = useState('');
  const [clipboard, setClipboard] = useState<ScoreClipboardNote[]>([]);
  return (
    <main
      style={{
        maxWidth: 1200,
        margin: 'auto',
        padding: 20,
        fontFamily: 'Arial, sans-serif',
        background: '#f5f7fc',
      }}
    >
      <div style={{ marginBottom: 8 }}>
        <button
          onClick={() => {
            try {
              const restored = scoreFromMusicXml(scoreToMusicXml(score));
              setVerification(
                `XML 확인: ${Object.keys(restored.keyboardStaves ?? {}).length}개 양손 파트 · ${restored.notes.length}개 음표`,
              );
            } catch (error) {
              setVerification(`실패: ${(error as Error).message}`);
            }
          }}
        >
          검증 XML 왕복
        </button>
        <button
          onClick={async () => {
            try {
              const pdf = await createScorePdf(score, score.parts, true, 900, true);
              const header = await pdf.slice(0, 5).text();
              setVerification(`PDF 확인: ${header} · ${pdf.size} bytes`);
            } catch (error) {
              setVerification(`실패: ${(error as Error).message}`);
            }
          }}
        >
          검증 합주 PDF
        </button>
        <output aria-label="검증 결과">{verification}</output>
      </div>
      <ScoreEditorViewport>
        <ScoreParts
          score={score}
          part={part}
          disabled={false}
          ensemble={ensemble}
          onEnsembleChange={setEnsemble}
          playAll={all}
          onPlayAllChange={setAll}
          onSelect={(p) => {
            setPart(p);
            setSelected(null);
          }}
          onEdit={setScore}
        />
        <nav className="score-panel-tabs">
          <button onClick={() => setPanel(!panel)}>파일 · PDF · MIDI</button>
          <span>파트를 고르고 악보에 바로 입력하세요</span>
        </nav>
        <div className="score-tool-panel" hidden={!panel}>
          <ScoreFileActions
            document={{ score, referenceAudio: null, instrumentSample: null }}
            part={part}
            disabled={false}
            onLoad={(d) => {
              setScore(d.score);
              setPart(d.score.parts[0]);
            }}
            onBusyChange={ignore}
          />
        </div>
        <GuitarTabEditor
          key={scorePartOwner(score, part)}
          score={score}
          part={part}
          ensemble={ensemble}
          playAll={all}
          onPartSelect={(p, n) => {
            setPart(p);
            setSelected(n ?? null);
          }}
          selected={selected}
          cursor={null}
          playbackBeat={null}
          playing={false}
          loaded
          onEdit={setScore}
          onSelect={setSelected}
          onPlay={ignore}
          onUndo={ignore}
          onRedo={ignore}
          canUndo={false}
          canRedo={false}
          volume={0.8}
          onVolumeChange={ignore}
          clipboard={clipboard}
          onCopy={setClipboard}
          onEditComplete={ignore}
          onAudition={ignore}
        />
      </ScoreEditorViewport>
      <pre aria-label="악보 데이터">{JSON.stringify(score)}</pre>
      <output aria-label="선택 파트">{part}</output>
    </main>
  );
}
createRoot(document.getElementById('root')!).render(<Fixture />);
