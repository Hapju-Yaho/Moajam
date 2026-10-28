// In-memory playback fixture: no accounts, DB, media storage or audio output.
import React, { Profiler, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { GuitarTabEditor } from '../packages/app/src/components/GuitarTabEditor.web';
import { ScorePartMixer } from '../packages/app/src/components/ScorePartMixer.web';
import { ScoreReferencePosition } from '../packages/app/src/components/ScoreReferencePosition.web';
import type { Score } from '../packages/app/src/lib/score';

const ignore = () => {};
const durations: number[] = [];
let parentRenders = 0;
const params = new URLSearchParams(location.search);
const score: Score = {
  title: 'Playback regression',
  bpm: 120,
  parts: ['Guitar'],
  instruments: { Guitar: 'guitar' },
  sync: {},
  notes: Array.from({ length: 2000 }, (_, i) => ({
    id: `clock-${i}`,
    part: 'Guitar',
    pitch: 55,
    beats: 0.5,
    tones: [{ pitch: 55, string: 3, fret: 0 }],
    rest: false,
    accent: false,
    chord: '',
    lyric: '',
  })),
};

export function Fixture() {
  parentRenders++;
  const [start, setStart] = useState<number | null>(null);
  const position = useRef<(() => number | null) | null>(null);
  const reference = useRef<(() => number | null) | null>(() => (position.current?.() ?? 0) / 2);
  const [selected, setSelected] = useState<string | null>(null);
  useEffect(() => {
    Object.assign(window, {
      scorePlaybackClockTest: {
        durations,
        renders: () => parentRenders,
        start(beat = 0, loop = false) {
          const began = performance.now();
          position.current = () => {
            const elapsed = (performance.now() - began) / 500;
            return beat + (loop ? elapsed % 8 : elapsed);
          };
          setStart(beat);
        },
        seek(beat: number) {
          position.current = () => beat;
          setStart((previous) => previous ?? beat);
        },
        stop() {
          position.current = null;
          setStart(null);
        },
      },
    });
  }, []);
  return (
    <main style={{ maxWidth: 1100, margin: 'auto' }}>
      <Profiler id="score" onRender={(_, __, duration) => durations.push(duration)}>
        <ScorePartMixer
          score={score}
          part="Guitar"
          playing={start !== null}
          playbackBeat={start}
          playbackPosition={position}
          disabled={false}
          selectedMeasure={null}
          onSelect={ignore}
          onEdit={ignore}
          volume={1}
          onVolumeChange={ignore}
          onMeasureSelect={ignore}
          onAddInstrument={ignore}
          onRemoveInstrument={ignore}
          onRenameInstrument={ignore}
          onMoveInstrument={ignore}
        />
        <GuitarTabEditor
          score={score}
          part="Guitar"
          selected={selected}
          cursor={null}
          playbackBeat={start}
          playbackPosition={position}
          playing={start !== null}
          loaded
          showBeatMarkers
          onEdit={ignore}
          onSelect={setSelected}
          onPlay={ignore}
          onUndo={ignore}
          onRedo={ignore}
          canUndo={false}
          canRedo={false}
          volume={1}
          onVolumeChange={ignore}
          clipboard={[]}
          onCopy={ignore}
          onEditComplete={ignore}
          onAudition={ignore}
        />
        {params.has('backing') && (
          <ScoreReferencePosition clock={reference} playing={start !== null} fallback={0}>
            {(seconds) => <output data-reference-time>{seconds}</output>}
          </ScoreReferencePosition>
        )}
      </Profiler>
    </main>
  );
}
createRoot(document.getElementById('root')!).render(<Fixture />);
