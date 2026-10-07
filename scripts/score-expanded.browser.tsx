import { scorePartOwner } from '../packages/app/src/lib/scoreParts';
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ScoreEditorViewport } from '../packages/app/src/components/ScoreEditorViewport.web';
import { GuitarTabEditor } from '../packages/app/src/components/GuitarTabEditor.web';
import { ScoreParts } from '../packages/app/src/components/ScoreParts.web';
import { ScoreFileActions } from '../packages/app/src/components/ScoreFileActions.web';
import type { Score, ScoreClipboardNote } from '../packages/app/src/lib/score';
const noop = () => {};
export function Fixture() {
  const [score, setScore] = useState<Score>({
    title: '나의 악보',
    bpm: 120,
    parts: ['Guitar', 'Vocal', 'Bass', 'Drums'],
    sync: {},
    instruments: { Guitar: 'guitar', Vocal: 'standard', Bass: 'bass', Drums: 'drums' },
    notes: Array.from({ length: 48 }, (_, i) => ({
      id: `n${i}`,
      part: 'Guitar',
      pitch: 64 + [0, 2, 4, 0][i % 4],
      tones: [{ pitch: 64 + [0, 2, 4, 0][i % 4], string: 1, fret: [0, 2, 4, 0][i % 4] }],
      beats: 1,
      rest: false,
      chord: i % 4 === 0 ? ['C', 'G', 'Am', 'F'][Math.floor(i / 4) % 4] : '',
      lyric: '',
    })),
  });
  const [part, setPart] = useState('Guitar'),
    [selected, setSelected] = useState<string | null>('n4'),
    [history, setHistory] = useState<Score[]>([]),
    [future, setFuture] = useState<Score[]>([]),
    [volume, setVolume] = useState(0.8),
    [ensemble, setEnsemble] = useState(false),
    [playAll, setPlayAll] = useState(false),
    [playing, setPlaying] = useState(false),
    [clip, setClip] = useState<ScoreClipboardNote[]>([]);
  const [playRequest, setPlayRequest] = useState<{
    from?: number;
    loopEnd?: number;
    repeatAll?: boolean;
  }>({});
  const edit = (next: Score) => {
    setHistory([...history, score]);
    setFuture([]);
    setScore(next);
  };
  return (
    <main
      style={{ maxWidth: 1200, margin: 'auto', padding: 24, fontFamily: 'Segoe UI, sans-serif' }}
    >
      <ScoreEditorViewport title={score.title} status="저장됨" heading={<h1>악보 편집</h1>}>
        <ScoreFileActions
          document={{ score, referenceAudio: null, instrumentSample: null }}
          part={part}
          disabled={playing}
          onLoad={(doc) => edit(doc.score)}
          onBusyChange={noop}
        />
        <GuitarTabEditor
          resetKey={scorePartOwner(score, part)}
          score={score}
          part={part}
          selected={selected}
          onSelect={setSelected}
          cursor={null}
          playbackBeat={playing ? 4 : null}
          playing={playing}
          loaded={true}
          onEdit={edit}
          onEditComplete={noop}
          onAudition={noop}
          onPlay={(from, loopEnd, repeatAll) => {
            setPlayRequest({ from, loopEnd, repeatAll });
            setPlaying(!playing);
          }}
          onUndo={() => {
            if (history.length) {
              setFuture([...future, score]);
              setScore(history.at(-1)!);
              setHistory(history.slice(0, -1));
            }
          }}
          onRedo={() => {
            if (future.length) {
              setHistory([...history, score]);
              setScore(future.at(-1)!);
              setFuture(future.slice(0, -1));
            }
          }}
          canUndo={!!history.length}
          canRedo={!!future.length}
          volume={volume}
          onVolumeChange={setVolume}
          backingPlayback={{
            enabled: score.referenceAudioEnabled !== false,
            disabled: playing,
            onChange: (enabled) => edit({ ...score, referenceAudioEnabled: enabled }),
          }}
          clipboard={clip}
          onCopy={setClip}
          ensemble={ensemble}
          onEnsembleChange={setEnsemble}
          playAll={playAll}
          onPartSelect={setPart}
          partControls={
            <ScoreParts
              attached
              score={score}
              part={part}
              disabled={playing}
              ensemble={ensemble}
              onEnsembleChange={setEnsemble}
              onSelect={(name) => {
                setPart(name);
                setSelected(null);
              }}
              onEdit={edit}
              playAll={playAll}
              onPlayAllChange={setPlayAll}
            />
          }
          settings={
            <>
              <div className="score-sound-settings">
                <label>
                  음색
                  <select aria-label="검증용 음색">
                    <option>어쿠스틱 기타</option>
                    <option>일렉트릭 기타</option>
                  </select>
                </label>
              </div>
              <div className="score-tool-panel score-backing-panel">
                <label>
                  <input
                    type="checkbox"
                    aria-label="설정 반주 함께 재생"
                    checked={score.referenceAudioEnabled !== false}
                    onChange={(event) =>
                      edit({ ...score, referenceAudioEnabled: event.target.checked })
                    }
                  />
                  악보와 함께 재생
                </label>
                <label>
                  반주 음량
                  <input aria-label="검증용 반주 음량" type="range" defaultValue="57" />
                </label>
                <audio data-persistent-media="true" controls />
              </div>
            </>
          }
        />
      </ScoreEditorViewport>
      <pre aria-label="검증 재생 요청">{JSON.stringify(playRequest)}</pre>
      <pre aria-label="검증 악보">{JSON.stringify(score)}</pre>
    </main>
  );
}
createRoot(document.getElementById('root')!).render(<Fixture />);
