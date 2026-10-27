import { createPortal } from 'react-dom';
import { useEffect, useState } from 'react';
import {
  scorePartMix,
  scorePartStaves,
  scoreVisibleParts,
  partInstrumentLabel,
} from '../lib/scoreParts';
import { scoreMeasureAtBeat, scoreMeasureCount, scoreMeasures, type Score } from '../lib/score';
import { useScoreEditorLayout } from './ScoreEditorLayout.web';
import { AppIcon } from './icons';

export function ScorePartMixer({
  score,
  part,
  playing,
  playbackBeat,
  disabled,
  onSelect,
  onEdit,
  volume,
  onVolumeChange,
  onMeasureSelect,
}: {
  score: Score;
  part: string;
  playing: boolean;
  playbackBeat: number | null;
  disabled: boolean;
  onSelect: (part: string) => void;
  onEdit: (score: Score) => void;
  volume: number;
  onVolumeChange: (value: number) => void;
  onMeasureSelect: (part: string, bar: number) => void;
}) {
  const layout = useScoreEditorLayout();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const media = window.matchMedia('(max-width:760px)');
    const compact = () => {
      if (layout.expanded && media.matches) setOpen(false);
    };
    compact();
    media.addEventListener('change', compact);
    return () => media.removeEventListener('change', compact);
  }, [layout.expanded]);
  useEffect(() => {
    if (layout.projectActionsOpen) setOpen(false);
  }, [layout.projectActionsOpen]);
  useEffect(() => {
    setOpen(false);
  }, [layout.expanded]);
  const parts = scoreVisibleParts(score);
  const bars = Math.max(...parts.map((name) => scoreMeasureCount(score, name)), 1);
  const mixer = (
    <section className="score-part-mixer" data-open={open} aria-label="파트 믹서">
      {
        <div className="score-mixer-scroll">
          <div className="score-mixer-table" style={{ minWidth: 460 + Math.min(bars, 160) * 22 }}>
            <div className="score-mixer-table-heading">
              <span>악기 · 파트</span>
              <span>M / S</span>
              <span>음량</span>
              <span className="score-mixer-progress-heading">
                <span>마디 진행</span>
                <button
                  className="score-mixer-collapse"
                  onClick={() => setOpen(!open)}
                  aria-expanded={open}
                >
                  {open ? '간략히' : '자세히 보기'}
                  <span
                    aria-hidden="true"
                    style={{
                      display: 'inline-flex',
                      transform: open ? 'rotate(180deg)' : undefined,
                    }}
                  >
                    <AppIcon name="chevron-down" size={16} color="currentColor" />
                  </span>
                </button>
              </span>
            </div>
            {parts
              .filter((name) => open || scorePartStaves(score, name).includes(part))
              .map((name) => {
                const mix = scorePartMix(score, name),
                  staves = scorePartStaves(score, name),
                  measures = staves.map((staff) => scoreMeasures(score, staff));
                const current =
                  playbackBeat === null ? -1 : scoreMeasureAtBeat(score, name, playbackBeat).bar;
                const update = (change: Partial<typeof mix>) =>
                  onEdit({
                    ...score,
                    partMix: { ...score.partMix, [name]: { ...mix, ...change } },
                  });
                return (
                  <div className="score-mixer-row" key={name} data-selected={staves.includes(part)}>
                    <button
                      className="score-mixer-name"
                      title={`${name} · ${partInstrumentLabel(score, name)}`}
                      disabled={disabled || playing}
                      onClick={() => onSelect(name)}
                    >
                      <span aria-hidden="true">
                        {partInstrumentLabel(score, name).includes('드럼')
                          ? '◉'
                          : partInstrumentLabel(score, name).includes('키보드')
                            ? '♬'
                            : '♫'}
                      </span>
                      <span>{name}</span>
                    </button>
                    <div>
                      <button
                        className="score-mixer-toggle score-mixer-mute"
                        disabled={disabled}
                        aria-label={`${name} 믹서 음소거`}
                        aria-pressed={mix.muted}
                        onClick={() => update({ muted: !mix.muted })}
                      >
                        M
                      </button>
                      <button
                        className="score-mixer-toggle score-mixer-solo"
                        disabled={disabled}
                        aria-label={`${name} 믹서 솔로`}
                        aria-pressed={mix.solo}
                        onClick={() => update({ solo: !mix.solo })}
                      >
                        S
                      </button>
                    </div>
                    <label>
                      <input
                        aria-label={`${name} 믹서 음량`}
                        disabled={disabled}
                        type="range"
                        min={0}
                        max={1}
                        step={0.01}
                        value={mix.volume}
                        onChange={(e) => update({ volume: Number(e.target.value) })}
                      />
                      <small>{Math.round(mix.volume * 100)}%</small>
                    </label>
                    <div className="score-mixer-bars" aria-label={`${name} 마디별 연주 구간`}>
                      {Array.from({ length: Math.min(bars, 160) }, (_, index) => (
                        <button
                          type="button"
                          aria-label={`${name} ${index + 1}마디로 이동`}
                          disabled={disabled || playing}
                          onClick={() => onMeasureSelect(name, index)}
                          key={index}
                          title={`${index + 1}마디`}
                          data-notes={measures.some((rows) =>
                            rows[index]?.some(({ note }) => !note.rest && !note.blank),
                          )}
                          data-current={current === index}
                        >
                          {index + 1}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            {open && (
              <div className="score-mixer-row score-mixer-master">
                <strong>Master</strong>
                <span />
                <label>
                  <input
                    aria-label="Master 음량"
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    disabled={disabled}
                    value={volume}
                    onChange={(event) => onVolumeChange(Number(event.target.value))}
                  />
                  <small>{Math.round(volume * 100)}%</small>
                </label>
                <span />
              </div>
            )}
          </div>
        </div>
      }
    </section>
  );
  return layout.mixerHost ? createPortal(mixer, layout.mixerHost) : mixer;
}
