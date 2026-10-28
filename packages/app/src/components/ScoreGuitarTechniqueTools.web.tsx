import {
  noteTones,
  canSetScoreNaturalHarmonics,
  setScoreNaturalHarmonics,
  scoreInstrument,
  selectedScoreTone,
  setScoreGuitarTechnique,
  type Score,
} from '../lib/score';
import { supportsNaturalHarmonic, type GuitarTechniqueFields } from '../lib/scoreGuitarTechniques';
import { ScoreToolButton } from './ScoreToolButton.web';
import { ScoreBendGraph } from './ScoreBendGraph.web';

export function ScoreGuitarTechniqueTools({
  score,
  part,
  ids,
  string,
  disabled,
  onEdit,
  onError,
  onGhost,
  ghostPressed,
  ghostDisabled,
  allTones,
}: {
  score: Score;
  part: string;
  ids: string[];
  string: number;
  disabled: boolean;
  onEdit: (score: Score) => void;
  onError: (message: string) => void;
  onGhost: () => void;
  ghostPressed: boolean;
  ghostDisabled: boolean;
  allTones: boolean;
}) {
  const instrument = scoreInstrument(score, part);
  if (!instrument.tuning.length || instrument.id.startsWith('bass')) return null;
  const note = score.notes.find((n) => n.id === ids[0]);
  const tone = note ? selectedScoreTone(score, note, string) : undefined;
  const locked = disabled || !tone || tone.dead || !note || note.rest || note.blank;
  const bendingLocked =
    locked ||
    ids.some((id) => {
      const selected = score.notes.find((n) => n.id === id);
      return (
        !!selected && noteTones(selected).some((t) => t.dead || t.ghost || t.harmonic || t.palmMute)
      );
    });
  const apply = (patch: Partial<GuitarTechniqueFields>) => {
    try {
      onEdit(setScoreGuitarTechnique(score, ids, string, patch));
      onError('');
    } catch (error) {
      onError((error as Error).message);
    }
  };
  const kinds = [
    ['bend', '벤드', '↗'],
    ['release', '벤드 릴리즈', '↗↘'],
    ['prebend', '프리벤드', '↑'],
    ['prebend-release', '프리벤드 릴리즈', '↑↘'],
  ] as const;
  return (
    <>
      <span className="score-tool-group-label">주법</span>
      <div className="score-guitar-technique-grid">
        <ScoreToolButton
          icon="×"
          aria-label="고스트노트"
          disabled={ghostDisabled || !!tone?.bend}
          aria-pressed={ghostPressed}
          onClick={onGhost}
        >
          고스트노트
        </ScoreToolButton>
        {(
          [
            ['natural', 'N.H.', '내추럴 하모닉스'],
            ['pinch', 'P.H.', '피킹 하모닉스'],
          ] as const
        ).map(([harmonic, icon, label]) => (
          <ScoreToolButton
            key={harmonic}
            icon={icon}
            disabled={
              harmonic === 'natural' && allTones
                ? disabled || !canSetScoreNaturalHarmonics(score, ids)
                : locked ||
                  !!tone?.bend ||
                  (harmonic === 'natural' &&
                    ids.some((id) => {
                      const selected = score.notes.find((n) => n.id === id);
                      return (
                        !selected ||
                        !supportsNaturalHarmonic(selectedScoreTone(score, selected, string)?.fret)
                      );
                    }))
            }
            aria-pressed={
              harmonic === 'natural' && allTones
                ? ids.length > 0 &&
                  ids.every((id) => {
                    const n = score.notes.find((n) => n.id === id);
                    return !!n && noteTones(n).every((t) => t.harmonic === 'natural');
                  })
                : tone?.harmonic === harmonic
            }
            title={
              harmonic === 'natural'
                ? '3·4·5·7·9·12·16·19·24프렛의 배음'
                : '높은 배음을 강조한 근사 재생'
            }
            onClick={() => {
              if (harmonic === 'natural' && allTones) {
                try {
                  onEdit(
                    setScoreNaturalHarmonics(
                      score,
                      ids,
                      !ids.every((id) =>
                        noteTones(score.notes.find((n) => n.id === id)!).every(
                          (t) => t.harmonic === 'natural',
                        ),
                      ),
                    ),
                  );
                  onError('');
                } catch (error) {
                  onError((error as Error).message);
                }
              } else apply({ harmonic: tone?.harmonic === harmonic ? undefined : harmonic });
            }}
          >
            {label}
          </ScoreToolButton>
        ))}
        <ScoreToolButton
          icon="P.M."
          disabled={locked || !!tone?.bend}
          aria-pressed={!!tone?.palmMute}
          onClick={() => apply({ palmMute: !tone?.palmMute })}
        >
          팜뮤트
        </ScoreToolButton>
      </div>
      <span className="score-tool-group-label">벤딩</span>
      <div className="score-bend-selectors">
        <label>
          종류
          <select
            aria-label="벤딩 종류"
            disabled={bendingLocked && !tone?.bend}
            value={tone?.bend?.kind ?? ''}
            onChange={(e) => {
              const kind = e.target.value as NonNullable<GuitarTechniqueFields['bend']>['kind'];
              apply({ bend: kind ? { kind, amount: tone?.bend?.amount ?? 2 } : undefined });
            }}
          >
            <option value="">없음</option>
            {kinds.map(([kind, label]) => (
              <option key={kind} value={kind}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>
      {tone?.bend && note && (
        <ScoreBendGraph
          key={`${note.id}/${tone.bend.kind}`}
          bend={tone.bend}
          beats={note.beats}
          disabled={disabled || bendingLocked}
          onChange={(bend) => apply({ bend })}
        />
      )}
    </>
  );
}
