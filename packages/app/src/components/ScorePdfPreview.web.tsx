import { GuitarStaff } from './GuitarStaff.web';
import type { Score } from '../lib/score';
const noop = () => {};
export function ScorePdfPreview({ score, part, bar }: { score: Score; part: string; bar: number }) {
  return (
    <div className="score-pdf-score-preview">
      <GuitarStaff
        score={score}
        part={part}
        selected={null}
        cursor={null}
        hasSelection={false}
        onDeselect={noop}
        selectedString={1}
        playbackBeat={null}
        zoom={85}
        onSelect={noop}
        onAppend={noop}
        onChordSelect={noop}
        emptyBeat={0}
        inputBeats={1}
        showTab={true}
        rangeIds={[]}
        onRangeSelect={noop}
        editable={false}
        layoutWidth={420}
        systemOverride={[{ start: bar - 1, count: 1 }]}
      />
    </div>
  );
}
