// Isolated in-memory editor: browser checks never modify a user's saved score.
import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ScoreEditorViewport } from '../packages/app/src/components/ScoreEditorViewport.web';
import { GuitarTabEditor } from '../packages/app/src/components/GuitarTabEditor.web';
import { ScoreFileActions } from '../packages/app/src/components/ScoreFileActions.web';
import {
  cleanScoreConnections,
  setScoreSlur,
  scorePlaybackFrom,
  scorePlaybackPosition,
  type Score,
  type ScoreClipboardNote,
} from '../packages/app/src/lib/score';
import { createScorePlaybackClock } from '../packages/app/src/lib/scorePlaybackClock';
import { scheduleScorePassage } from '../packages/app/src/lib/scoreAudio.web';
import {
  ScoreYouTubeBacking,
  type ScoreYouTubeHandle,
} from '../packages/app/src/components/ScoreYouTubeBacking.web';
const ignoreBusy = () => {};

export function Fixture() {
  const [score, setScore] = useState<Score>({
    title: '밴드 연습 악보',
    bpm: 120,
    parts: ['Bass'],
    sync: {},
    instruments: { Bass: 'bass' },
    notes: Array.from({ length: 16 }, (_, index) => ({
      id: `note-${index}`,
      part: 'Bass',
      pitch: 40 + (index % 5),
      beats: 1,
      rest: false,
      chord: '',
      lyric: '',
      accent: false,
      tones: [{ pitch: 40 + (index % 5), string: 4, fret: index % 5 }],
    })),
  });
  const [selected, select] = useState<string | null>(null);
  const [playbackBeat, setPlaybackBeat] = useState<number | null>(null);
  const [clipboard, copy] = useState<ScoreClipboardNote[]>([]);
  const [history, setHistory] = useState<Score[]>([]);
  const [future, setFuture] = useState<Score[]>([]);
  const [playRequest, setPlayRequest] = useState('');
  const youtube = useRef<ScoreYouTubeHandle | null>(null);
  const [youtubeReady, setYoutubeReady] = useState(false);
  const [youtubeMessage, setYoutubeMessage] = useState('');
  const player = useRef<{ context: AudioContext; timer: ReturnType<typeof setInterval> } | null>(
    null,
  );
  useEffect(
    () => () => {
      if (player.current) {
        clearInterval(player.current.timer);
        void player.current.context.close();
      }
    },
    [],
  );
  return (
    <div
      style={{
        display: 'flex',
        minHeight: '100vh',
        fontFamily: 'Arial, sans-serif',
        background: '#f5f7fc',
      }}
    >
      <aside style={{ width: 210, padding: 20, flexShrink: 0 }}>모아잼 · 검증용 개인 공간</aside>
      <main
        style={{
          padding: 16,
          flex: 1,
          minWidth: 0,
          transform: 'translateZ(0)',
          height: '100vh',
          overflow: 'auto',
        }}
      >
        <button
          type="button"
          onClick={() =>
            setScore({
              ...score,
              notes: Array.from({ length: 128 }, (_, index) => ({
                ...score.notes[index % score.notes.length],
                id: `long-${index}`,
              })),
            })
          }
        >
          검증용 긴 악보
        </button>
        <button
          type="button"
          onClick={() => {
            select(null);
            setScore({
              ...score,
              measureLengths: { Bass: { 19: 3 } },
              notes: Array.from({ length: 20 }, (_, index) => ({
                id: `rest-${index}`,
                part: 'Bass',
                pitch: 40,
                beats: index === 19 ? 3 : 4,
                rest: true,
                chord: '',
                lyric: '',
                accent: false,
              })),
            });
          }}
        >
          검증용 짧은 마디
        </button>
        <button
          type="button"
          onClick={() => {
            select(null);
            setScore({
              title: '해머링 · 슬라이드 · 이음줄',
              bpm: 120,
              parts: ['Bass'],
              sync: {},
              instruments: { Bass: 'bass' },
              notes: Array.from({ length: 64 }, (_, i) => {
                const string = (Math.floor(i / 16) % 4) + 1;
                const fret = [1, 3, 3, 5, 5, 3, 3, 3][i % 8];
                const pitch = [43, 38, 33, 28][string - 1] + fret;
                return {
                  id: `curve-${i}`,
                  part: 'Bass',
                  pitch,
                  beats: 0.25,
                  rest: false,
                  accent: false,
                  chord: '',
                  lyric: '',
                  tones: [{ pitch, string, fret }],
                  ...(i % 8 === 6 ? { slurTo: `curve-${i + 1}` } : {}),
                  ...(i % 8 === 0 || i % 8 === 2 || i % 8 === 4
                    ? {
                        connection: {
                          type: (i % 8 === 0 ? 'hammer' : i % 8 === 2 ? 'slide' : 'pull') as
                            'hammer' | 'slide' | 'pull',
                          targetId: `curve-${i + 1}`,
                        },
                      }
                    : {}),
                };
              }),
            });
          }}
        >
          검증용 연결 표시
        </button>
        <button
          type="button"
          onClick={() => {
            select(null);
            const demo: Score = {
              title: '같은 음 연결 · 지판 슬라이드 · 슬라이드 아웃',
              bpm: 120,
              parts: ['Bass'],
              sync: {},
              instruments: { Bass: 'bass' },
              notes: [3, 3, 3, 10, 10, 3, 5, 5, 3, 10, 10, 3, 5, 5, 3, 3].map((fret, i) => ({
                id: `slide-${i}`,
                part: 'Bass',
                pitch: 33 + fret,
                beats: 1,
                rest: false,
                accent: false,
                chord: '',
                lyric: '',
                tones: [{ pitch: 33 + fret, string: 3, fret }],
                ...([2, 4, 8, 10].includes(i)
                  ? { connection: { type: 'glissando' as const, targetId: `slide-${i + 1}` } }
                  : {}),
                ...([6, 12].includes(i) ? { slideOut: 'up' as const } : {}),
                ...([7, 13].includes(i) ? { slideOut: 'down' as const } : {}),
              })),
            };
            setScore(setScoreSlur(demo, ['slide-0']));
          }}
        >
          검증용 슬라이드
        </button>
        <button
          type="button"
          onClick={() => {
            select(null);
            setScore({
              title: '촘촘한 고스트 노트 · 슬라이드',
              bpm: 120,
              parts: ['Bass'],
              sync: {},
              instruments: { Bass: 'bass' },
              notes: Array.from({ length: 48 }, (_, i) => {
                const fret = [8, 8, 5, 5, 10, 11, 12, 12][i % 8];
                const pitch = 28 + fret;
                return {
                  id: `dense-${i}`,
                  part: 'Bass',
                  pitch,
                beats: 1 / 3,
                tuplet: 3,
                  rest: false,
                  accent: false,
                  chord: '',
                  lyric: '',
                  tones: [{ pitch, string: 4, fret, ghost: i % 8 === 3 || i % 8 === 7 }],
                  ...(i % 8 === 2 ? { slurTo: `dense-${i + 1}` } : {}),
                  ...(i % 8 === 3
                    ? { connection: { type: 'glissando' as const, targetId: `dense-${i + 1}` } }
                    : {}),
                  ...(i % 8 === 7 ? { slideOut: 'down' as const } : {}),
                };
              }),
            });
          }}
        >
          검증용 촘촘한 괄호
        </button>
        <label>
          검증용 재생 위치
          <input
            aria-label="검증용 재생 위치"
            type="number"
            step="any"
            value={playbackBeat ?? ''}
            onChange={(event) =>
              setPlaybackBeat(event.target.value === '' ? null : Number(event.target.value))
            }
          />
        </label>
        <ScoreEditorViewport>
          <ScoreFileActions
            document={{ score }}
            part="Bass"
            disabled={playbackBeat !== null}
            onLoad={(document) => setScore(document.score)}
            onBusyChange={ignoreBusy}
          />
          <div className="score-editor-host" style={{ display: 'contents' }}>
            <section
              className={`score-backing${score.referenceYoutubeId ? ' score-backing--youtube' : ''}`}
              aria-label="검증용 음원 도구"
            >
              <strong>함께 재생할 음원</strong>
              <ScoreYouTubeBacking
                ref={youtube}
                videoId={score.referenceYoutubeId}
                suggestedUrl="https://www.youtube.com/watch?v=M7lc1UVf-VE"
                disabled={playbackBeat !== null}
                volume={score.referenceAudioVolume ?? 0.8}
                onReadyChange={setYoutubeReady}
                onAlign={(seconds) => setScore({ ...score, referenceAudioOffset: seconds })}
                onChange={(id) =>
                  setScore({ ...score, referenceAudioSource: 'youtube', referenceYoutubeId: id })
                }
                onFailure={(message) => {
                  setYoutubeMessage(message);
                  if (player.current) {
                    clearInterval(player.current.timer);
                    void player.current.context.close();
                    player.current = null;
                    setPlaybackBeat(null);
                  }
                }}
              />
              <label>
                첫 박의 음원 위치{' '}
                <input
                  aria-label="검증용 영상 시작 위치"
                  type="number"
                  value={score.referenceAudioOffset ?? 0}
                  disabled={playbackBeat !== null}
                  onChange={(event) =>
                    setScore({ ...score, referenceAudioOffset: Number(event.target.value) })
                  }
                />
                초
              </label>
              <label>
                음원 음량{' '}
                <input
                  aria-label="검증용 영상 음량"
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={score.referenceAudioVolume ?? 0.8}
                  onChange={(event) =>
                    setScore({ ...score, referenceAudioVolume: Number(event.target.value) })
                  }
                />
              </label>
              <p role="status">{youtubeMessage}</p>
            </section>
            <GuitarTabEditor
              score={score}
              part="Bass"
              selected={selected}
              cursor={null}
              playbackBeat={playbackBeat}
              playing={playbackBeat !== null}
              loaded
              onEdit={(next) => {
                setHistory([...history, score]);
                setFuture([]);
                setScore(cleanScoreConnections(next));
              }}
              onSelect={select}
              onPlay={(from = 0, loopEnd) => {
                if (player.current) {
                  clearInterval(player.current.timer);
                  void player.current.context.close();
                  player.current = null;
                  setPlaybackBeat(null);
                  youtube.current?.pause();
                  return;
                }
                if (score.referenceYoutubeId && !youtubeReady) return;
                const context = new AudioContext();
                void context.resume();
                const plan = scorePlaybackFrom(score, 'Bass', from, loopEnd);
                setPlayRequest(JSON.stringify({ from, loopEnd }));
                const update = createScorePlaybackClock(
                  context.currentTime + 0.04,
                  ((plan.endBeat - plan.startBeat) * 60) / score.bpm,
                  loopEnd !== undefined,
                  (when) => {
                    for (const segment of plan.segments)
                      scheduleScorePassage(
                        context,
                        context.destination,
                        score,
                        'Bass',
                        when + (segment.offset * 60) / score.bpm,
                        segment.startBeat,
                        segment.endBeat,
                      );
                  },
                );
                update(context.currentTime);
                if (score.referenceYoutubeId)
                  youtube.current?.sync(
                    (score.referenceAudioOffset ?? 0) + (plan.startBeat * 60) / score.bpm,
                    context.currentTime,
                    true,
                  );
                setPlaybackBeat(from);
                const timer = setInterval(() => {
                  const state = update(context.currentTime);
                  if (state.ended) {
                    clearInterval(timer);
                    void context.close();
                    player.current = null;
                    setPlaybackBeat(null);
                    youtube.current?.pause();
                  } else {
                    if (score.referenceYoutubeId)
                      youtube.current?.sync(
                        (score.referenceAudioOffset ?? 0) +
                          (scorePlaybackPosition(plan.segments, (state.elapsed * score.bpm) / 60) *
                            60) /
                            score.bpm,
                        context.currentTime,
                      );
                    setPlaybackBeat(
                      plan.toWritten(
                        scorePlaybackPosition(plan.segments, (state.elapsed * score.bpm) / 60),
                      ),
                    );
                  }
                }, 40);
                player.current = { context, timer };
              }}
              onUndo={() => {
                if (!history.length) return;
                setFuture([score, ...future]);
                setScore(history.at(-1)!);
                setHistory(history.slice(0, -1));
              }}
              onRedo={() => {
                if (!future.length) return;
                setHistory([...history, score]);
                setScore(future[0]);
                setFuture(future.slice(1));
              }}
              canUndo={!!history.length}
              canRedo={!!future.length}
              volume={0.8}
              onVolumeChange={() => {}}
              clipboard={clipboard}
              onCopy={copy}
              onEditComplete={() => {}}
              onAudition={() => {}}
            />
          </div>
        </ScoreEditorViewport>
        <output aria-label="검증용 악보 상태">{JSON.stringify(score)}</output>
        <output aria-label="검증용 재생 요청">{playRequest}</output>
      </main>
    </div>
  );
}
createRoot(document.getElementById('root')!).render(<Fixture />);
