import { ScoreToolbarHelp } from './ScoreToolbarHelp.web';
import type { ReactNode } from 'react';
import { ScoreToolButton } from './ScoreToolButton.web';
import {
  scoreInstrument,
  scoreBeat,
  scoreMeasureCount,
  scoreMeasureDuration,
  scoreMeasures,
  scoreBarBeats,
  appendScoreMeasureNote,
  setScoreRepeat,
  setScoreSwell,
  scoreSwellSelection,
  type Score,
} from '../lib/score';
import {
  directionOwner,
  directionAt,
  hiHatLabels,
  dynamicLevels,
  jumpLabels,
  readScoreDirections,
  readScoreNavigation,
  type ScoreDirection,
  type ScoreNavigation,
  type Dynamic,
} from '../lib/scoreExpression';

export function ScoreExpressionTools({
  score,
  mode = 'expression',
  part,
  bar,
  ids,
  disabled,
  onEdit,
  onError,
  toneControls,
}: {
  score: Score;
  mode?: 'expression' | 'navigation' | 'percussion' | 'instructions';
  part: string;
  bar: number;
  ids: string[];
  disabled: boolean;
  onEdit: (score: Score) => void;
  onError: (message: string) => void;
  toneControls?: ReactNode;
}) {
  const isDrums = scoreInstrument(score, part).id === 'drums';
  const owner = directionOwner(score, part),
    at = bar,
    d = score.directions?.[owner]?.[at] ?? {},
    n = score.navigation?.[at] ?? {};
  const run = (update: () => Score) => {
    try {
      if (
        !Number.isInteger(at) ||
        at < 0 ||
        at >= Math.max(...score.parts.map((p) => scoreMeasureCount(score, p)))
      )
        throw new Error('악보에서 적용할 마디를 선택해주세요.');
      onEdit(update());
      onError('');
    } catch (error) {
      onError((error as Error).message);
    }
  };
  const direction = (patch: Partial<ScoreDirection>) =>
    run(() => {
      const directions = readScoreDirections(
        {
          ...score.directions,
          [owner]: { ...score.directions?.[owner], [at]: { ...d, ...patch } },
        },
        score.parts,
      );
      return { ...score, directions };
    });
  const navigation = (patch: Partial<ScoreNavigation>) =>
    run(() => ({
      ...score,
      navigation: readScoreNavigation({ ...score.navigation, [at]: { ...n, ...patch } }),
    }));
  let selection: ReturnType<typeof scoreSwellSelection> | undefined;
  try {
    selection = scoreSwellSelection(score, part, ids);
  } catch {
    // An empty or non-contiguous selection cannot define a hairpin.
  }
  const hasSwell =
    selection &&
    Object.entries(score.directions?.[owner] ?? {}).some(
      ([key, entry]) =>
        (entry.swell && +key < selection.end && entry.swell.endBar > selection.start) ||
        entry.swells?.some(
          (s) => +key + s.startOffset < selection.end && s.endBar + s.endOffset > selection.start,
        ),
    );
  const selectedSwell =
    selection &&
    score.directions?.[owner]?.[Math.floor(selection.start)]?.swells?.find(
      (range) =>
        Math.floor(selection.start) + range.startOffset === selection.start &&
        range.endBar + range.endOffset === selection.end,
    );
  const repeatPrevious = () =>
    run(() => {
      if (at === 0) throw new Error('첫 마디에는 앞 마디 반복을 넣을 수 없어요.');
      let next = score;
      // Ensure both voices have timed space for the repeated pattern, without replacing written notes.
      for (const voice of [owner, score.drumVoices?.[owner]].filter((v): v is string => !!v)) {
        if (d.measureRepeat) break;
        const measures = scoreMeasures(next, voice),
          previous = measures[at - 1] ?? [];
        if (!previous.length && !score.directions?.[owner]?.[at - 1]?.measureRepeat) continue;
        if (scoreMeasureDuration(next, voice, at) !== scoreMeasureDuration(next, voice, at - 1))
          throw new Error('앞 마디와 같은 박자 길이에서 마디 반복을 사용해주세요.');
        const used = (measures[at] ?? []).reduce((sum, f) => sum + f.beats, 0);
        if (used < scoreBarBeats(next)) {
          next = appendScoreMeasureNote(
            next,
            {
              id: crypto.randomUUID(),
              part: voice,
              pitch: 60,
              beats: scoreBeat(scoreBarBeats(next) - used),
              rest: true,
              blank: true,
              accent: false,
              chord: '',
              lyric: '',
            },
            at,
            used,
            () => crypto.randomUUID(),
          );
        }
      }
      return {
        ...next,
        directions: readScoreDirections(
          {
            ...next.directions,
            [owner]: {
              ...next.directions?.[owner],
              [at]: { ...d, measureRepeat: !d.measureRepeat },
            },
          },
          next.parts,
        ),
      };
    });
  return (
    <section
      className={`score-expression-tools${mode === 'instructions' ? ' score-inline-instructions' : ''}`}
      aria-label={
        mode === 'navigation' || mode === 'instructions'
          ? '연주 지시 · 반복 · 악보 진행'
          : mode === 'percussion'
            ? '드럼 연주 설정'
            : '강약'
      }
    >
      <fieldset disabled={disabled} style={{ border: 0, padding: 0 }}>
        {mode === 'percussion' && isDrums && (
          <div className="guitar-inputbar">
            <label>
              기본 하이햇{' '}
              <select
                aria-label="마디 기본 하이햇"
                value={d.hiHat ?? ''}
                onChange={(e) =>
                  direction({
                    hiHat: (e.target.value || undefined) as ScoreDirection['hiHat'],
                  })
                }
              >
                <option value="">이 마디에서 변경 안 함</option>
                {Object.entries(hiHatLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label} →
                  </option>
                ))}
              </select>
            </label>
            <label>
              도구{' '}
              <select
                aria-label="드럼 연주 도구"
                value={d.implement ?? ''}
                onChange={(e) =>
                  direction({
                    implement: (e.target.value || undefined) as ScoreDirection['implement'],
                  })
                }
              >
                <option value="">변경 안 함</option>
                <option value="sticks">Sticks · 스틱</option>
                <option value="brushes">Brushes · 브러시</option>
                <option value="mallets">Mallets · 말렛</option>
              </select>
            </label>
            <small>이후 기본 하이햇: {hiHatLabels[directionAt(score, part, at).hiHat]}</small>
          </div>
        )}
        {mode === 'expression' && (
          <>
            <div className="guitar-inputbar score-dynamics-row">
              <div className="score-dynamics-group" role="group" aria-label="강약 선택">
                <strong className="score-tool-group-label">강약</strong>
                {(Object.keys(dynamicLevels) as Dynamic[]).map((value) => (
                  <ScoreToolButton
                    key={value}
                    icon={<em className="score-dynamic-symbol">{value}</em>}
                    aria-label={`${value} 강약`}
                    aria-pressed={d.dynamic === value}
                    onClick={() => direction({ dynamic: d.dynamic === value ? undefined : value })}
                  >
                    {value} 강약
                  </ScoreToolButton>
                ))}
              </div>
              <div
                className="score-dynamics-group score-dynamics-change"
                role="group"
                aria-label="강약 변화"
              >
                <strong className="score-tool-group-label">강약 변화</strong>
                {(['crescendo', 'decrescendo'] as const).map((kind) => (
                  <ScoreToolButton
                    key={kind}
                    disabled={!selection}
                    aria-pressed={
                      !!selectedSwell &&
                      (dynamicLevels[selectedSwell.to] > selectedSwell.from
                        ? 'crescendo'
                        : 'decrescendo') === kind
                    }
                    title="한 박 선택: 마디 전체 · 여러 박 선택: 선택 구간"
                    icon={
                      <svg viewBox="0 0 32 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <path d={kind === 'crescendo' ? 'M29 4L3 12L29 20' : 'M3 4L29 12L3 20'} />
                      </svg>
                    }
                    onClick={() => run(() => setScoreSwell(score, part, ids, kind))}
                  >
                    {kind === 'crescendo' ? '크레셴도' : '디크레셴도'}
                  </ScoreToolButton>
                ))}
                <ScoreToolButton
                  disabled={!hasSwell}
                  onClick={() => run(() => setScoreSwell(score, part, ids, null))}
                >
                  강약 변화 해제
                </ScoreToolButton>

                <ScoreToolbarHelp label="강약 도움말">
                  강약은 다음 변경 지점까지 유지됩니다. 한 박을 선택하면 해당 마디 전체, 여러 박을
                  선택하면 선택 구간에 강약 변화를 적용합니다.
                </ScoreToolbarHelp>
              </div>
            </div>
          </>
        )}
        {mode === 'instructions' && (
          <div className="score-performance-instructions">
            <label className="score-instruction-field">
              연주 지시{' '}
              <input
                aria-label="마디 연주 지시"
                key={`${part}/${at}/${d.text ?? ''}`}
                defaultValue={d.text ?? ''}
                maxLength={120}
                placeholder="Fill / Time / Groove"
                onBlur={(e) => {
                  if (e.target.value !== (d.text ?? ''))
                    direction({ text: e.target.value || undefined });
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') e.currentTarget.blur();
                }}
              />
            </label>
            {toneControls}
          </div>
        )}
        {mode === 'navigation' && (
          <>
            <div
              className="guitar-inputbar score-navigation-row"
              role="group"
              aria-label="반복·이동"
            >
              <strong className="score-tool-group-label">반복·이동</strong>

              {isDrums && (
                <ScoreToolButton aria-pressed={!!d.measureRepeat} onClick={repeatPrevious}>
                  % 앞 마디 반복
                </ScoreToolButton>
              )}
              <ScoreToolButton
                icon="𝄆"
                aria-pressed={!!score.repeats?.[at]?.start}
                onClick={() =>
                  run(() => setScoreRepeat(score, at, { start: !score.repeats?.[at]?.start }))
                }
              >
                𝄆 반복 시작
              </ScoreToolButton>
              <ScoreToolButton
                icon="𝄇"
                aria-pressed={!!score.repeats?.[at]?.end}
                onClick={() =>
                  run(() => setScoreRepeat(score, at, { end: !score.repeats?.[at]?.end }))
                }
              >
                𝄇 반복 끝
              </ScoreToolButton>
              <label>
                반복 괄호{' '}
                <select
                  aria-label="마디 반복 괄호"
                  value={n.ending ?? ''}
                  onChange={(e) =>
                    navigation({
                      ending: e.target.value ? (Number(e.target.value) as 1 | 2) : undefined,
                    })
                  }
                >
                  <option value="">없음</option>
                  <option value="1">1.</option>
                  <option value="2">2.</option>
                </select>
              </label>
              <span className="score-toolbar-divider" aria-hidden="true" />

              {(['segno', 'coda', 'toCoda', 'fine'] as const).map((key) => (
                <ScoreToolButton
                  key={key}
                  icon={{ segno: '𝄋', coda: '𝄌', toCoda: '→𝄌', fine: 'Fine' }[key]}
                  aria-pressed={!!n[key]}
                  onClick={() => navigation({ [key]: !n[key] })}
                >
                  {{ segno: '𝄋 Segno', coda: '𝄌 Coda', toCoda: 'To Coda', fine: 'Fine' }[key]}
                </ScoreToolButton>
              ))}
              <label>
                돌아가기{' '}
                <select
                  aria-label="마디 이동 지시"
                  value={n.jump ?? ''}
                  onChange={(e) =>
                    navigation({ jump: (e.target.value || undefined) as ScoreNavigation['jump'] })
                  }
                >
                  <option value="">없음</option>
                  {Object.entries(jumpLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <ScoreToolbarHelp label="반복·이동 도움말">
                연주 지시는 현재 성부에 적용됩니다. 반복·진행은 전체 악보에 적용하며 앞 마디 반복은
                현재 파트에 적용됩니다. D.C./D.S.는 한 번만 돌아가며 돌아간 뒤에는 도돌이표를 다시
                반복하지 않습니다. Fine/To Coda는 해당 복귀 지시 이후 작동합니다. 1·2번 괄호는 해당
                마디에 적용하며 여러 마디 구간은 각 마디에 같은 번호를 설정합니다.
              </ScoreToolbarHelp>
            </div>
          </>
        )}
      </fieldset>
    </section>
  );
}
