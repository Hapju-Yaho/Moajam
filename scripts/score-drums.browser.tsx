// In-memory fixture: no account, stored scores, or external audio is touched.
import React, { Profiler, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { GuitarTabEditor } from '../packages/app/src/components/GuitarTabEditor.web';
import {
  scoreToMusicXml,
  scoreDrums,
  type Score,
  type ScoreClipboardNote,
} from '../packages/app/src/lib/score';
import { scoreFromMusicXml } from '../packages/app/src/lib/scoreImport.web';
import { serializeScoreFile, parseScoreFile } from '../packages/app/src/lib/scoreFile';
import { prepareDrumKit } from '../packages/app/src/lib/drumKit.web';
import { scorePartOwner } from '../packages/app/src/lib/scoreParts';
const ignore = () => {};
const renderDurations: number[] = [];
Object.assign(window, { scoreRenderDurations: renderDurations });
export function Fixture() {
  const [score, setScore] = useState<Score>(() => {
    const count = Math.min(
      2000,
      Math.max(0, Number(new URLSearchParams(location.search).get('performance-notes')) || 0),
    );
    return {
      title: '드럼 입력 연습',
      bpm: 124,
      parts: ['Drums'],
      sync: {},
      ...(count ? { instruments: { Drums: 'guitar' } } : {}),
      notes: Array.from({ length: count }, (_, i) => ({
        id: `perf-${i}`,
        part: 'Drums',
        pitch: 55 + (i % 5),
        beats: i % 16 === 0 ? 0 : 0.5,
        ...(i % 16 === 0 ? { graceBeats: 0.5 } : {}),
        tones: [{ pitch: 55 + (i % 5), string: 3, fret: i % 5 }],
        rest: false,
        accent: false,
        chord: '',
        lyric: '',
      })),
    };
  });
  const [selected, setSelected] = useState<string | null>(null);
  const [part, setPart] = useState('Drums');
  const [history, setHistory] = useState<Score[]>([]);
  const [future, setFuture] = useState<Score[]>([]);
  const [clipboard, setClipboard] = useState<ScoreClipboardNote[]>([]);
  const [result, setResult] = useState('');
  const [playbackBeat, setPlaybackBeat] = useState<number | null>(null);
  const playbackPosition = useRef<(() => number | null) | null>(null);
  useEffect(() => {
    Object.assign(window, {
      scorePlaybackTest: {
        seek(beat: number, render = true) {
          playbackPosition.current = () => beat;
          if (render) setPlaybackBeat(beat);
        },
        stop() {
          playbackPosition.current = null;
          setPlaybackBeat(null);
        },
      },
    });
  }, []);
  return (
    <main style={{ maxWidth: 1100, margin: 'auto', padding: 20 }}>
      <Profiler
        id="editor"
        onRender={(_, __, duration) => {
          renderDurations.push(duration);
          if (renderDurations.length > 100) renderDurations.shift();
        }}
      >
        <GuitarTabEditor
          key={scorePartOwner(score, part)}
          score={score}
          part={part}
          onPartSelect={(next, id) => {
            setPart(next);
            setSelected(id ?? null);
          }}
          selected={selected}
          cursor={null}
          playbackBeat={playbackBeat}
          playbackPosition={playbackPosition}
          playing={playbackBeat !== null}
          loaded={true}
          onEdit={(next) => {
            setHistory([...history, score]);
            setFuture([]);
            setScore(next);
          }}
          onSelect={setSelected}
          onPlay={ignore}
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
          volume={0.8}
          onVolumeChange={ignore}
          clipboard={clipboard}
          onCopy={setClipboard}
          onEditComplete={ignore}
          onAudition={ignore}
        />
      </Profiler>
      <button
        onClick={async () => {
          try {
            const xml = scoreFromMusicXml(scoreToMusicXml(score));
            const file = await parseScoreFile(
              await serializeScoreFile({ score, referenceAudio: null, instrumentSample: null }),
            );
            const kit = prepareDrumKit();
            const hits = (s: Score) =>
              s.parts
                .map((part) =>
                  s.notes
                    .filter((n) => n.part === part)
                    .filter((n) => !n.rest && !n.blank)
                    .map((n) =>
                      n.tones
                        ?.map((t) => `${t.pitch}:${!!t.dead}:${t.drumTechnique ?? 'normal'}`)
                        .join(','),
                    )
                    .join('|'),
                )
                .join(' / ');
            if (
              JSON.stringify(xml.drumVoices ?? {}) !== JSON.stringify(score.drumVoices ?? {}) ||
              JSON.stringify(file.score.drumVoices ?? {}) !== JSON.stringify(score.drumVoices ?? {})
            )
              throw new Error('voice grouping mismatch');
            if (
              JSON.stringify(xml.multiMeasureRests ?? {}) !==
                JSON.stringify(score.multiMeasureRests ?? {}) ||
              JSON.stringify(file.score.multiMeasureRests ?? {}) !==
                JSON.stringify(score.multiMeasureRests ?? {})
            )
              throw new Error('multi-measure rest setting mismatch');
            if (hits(xml) !== hits(score) || hits(file.score) !== hits(score))
              throw new Error('roundtrip mismatch');
            for (const key of ['directions', 'navigation'] as const)
              for (const restored of [xml, file.score])
                if (JSON.stringify(restored[key] ?? {}) !== JSON.stringify(score[key] ?? {}))
                  throw new Error(`${key} roundtrip mismatch`);
            for (const part of score.parts) {
              const expected = score.notes
                .filter((n) => n.part === part && !n.blank && !n.rest)
                .map((n) => `${!!n.accent}:${!!n.marcato}:${!!n.slash}:${n.sticking ?? ''}`);
              for (const restored of [xml, file.score]) {
                const actual = restored.notes
                  .filter((n) => n.part === part && !n.blank && !n.rest)
                  .map((n) => `${!!n.accent}:${!!n.marcato}:${!!n.slash}:${n.sticking ?? ''}`);
                if (JSON.stringify(actual) !== JSON.stringify(expected))
                  throw new Error('note expression mismatch');
              }
            }
            if (!('kind' in kit) || kit.samples.size !== scoreDrums.length)
              throw new Error('kit missing');
            setResult(`PASS: XML / 파일 왕복 · ${scoreDrums.length}개 드럼 음원`);
          } catch (error) {
            setResult(`FAIL: ${(error as Error).message}`);
          }
        }}
      >
        저장 및 음원 검증
      </button>
      <output aria-label="검증 결과">{result}</output>
      <pre aria-label="악보 데이터" style={{ overflow: 'auto', maxWidth: '100%' }}>
        {JSON.stringify(score)}
      </pre>
    </main>
  );
}
createRoot(document.getElementById('root')!).render(<Fixture />);
