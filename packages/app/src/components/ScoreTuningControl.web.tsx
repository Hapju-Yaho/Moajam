import { scoreInstrument, scoreInstruments, setScoreCapo, type Score } from '../lib/score';
import { scorePartOwner } from '../lib/scoreParts';
import {
  scoreTuningChoices,
  setScoreKeyboardKey,
  setScoreTuning,
  keyboardKeyIsWritten,
} from '../lib/scoreTuning';
import { useState } from 'react';

export function ScoreTuningControl({
  score,
  part,
  disabled,
  onEdit,
}: {
  score: Score;
  part: string;
  disabled: boolean;
  onEdit: (score: Score) => void;
}) {
  const [error, setError] = useState('');
  const instrument = scoreInstrument(score, part),
    choices = scoreTuningChoices(score, part);
  const keyboard = ['piano', 'pianoBass'].includes(instrument.id);
  if (!choices.length && !keyboard) return null;
  const apply = (next: () => Score) => {
    try {
      onEdit(next());
      setError('');
    } catch (error) {
      setError((error as Error).message);
    }
  };
  return (
    <div
      className="score-tuning-control"
      data-fretted={instrument.tuning.length > 0 ? 'true' : undefined}
    >
      <label>
        {keyboard ? '키 변경' : '튜닝'}
        {keyboard ? (
          <input
            key={`${part}/${score.keyboardTranspositions?.[scorePartOwner(score, part)] ?? 0}`}
            aria-label="키 변경"
            type="number"
            min={-12}
            max={12}
            step={1}
            defaultValue={score.keyboardTranspositions?.[scorePartOwner(score, part)] ?? 0}
            disabled={disabled}
            onBlur={(event) => {
              const value = event.currentTarget.valueAsNumber;
              if (Number.isInteger(value)) apply(() => setScoreKeyboardKey(score, part, value));
              else
                event.currentTarget.value = String(
                  score.keyboardTranspositions?.[scorePartOwner(score, part)] ?? 0,
                );
            }}
          />
        ) : (
          <select
            aria-label="튜닝"
            value={instrument.id}
            disabled={disabled}
            onChange={(event) => apply(() => setScoreTuning(score, part, event.target.value))}
          >
            {choices.map((id) => (
              <option key={id} value={id}>
                {id === 'guitar' || id === 'bass'
                  ? '표준 튜닝'
                  : scoreInstruments[id as keyof typeof scoreInstruments].label.replace(
                      /^(기타|베이스) · /,
                      '',
                    )}
              </option>
            ))}
          </select>
        )}
      </label>
      {instrument.tuning.length > 0 && (
        <label className="score-capo-control">
          카포
          <select
            aria-label="카포 프렛"
            value={instrument.capo}
            disabled={disabled}
            onChange={(event) => apply(() => setScoreCapo(score, part, Number(event.target.value)))}
          >
            <option value={0}>없음</option>
            {Array.from({ length: 12 }, (_, i) => (
              <option key={i + 1} value={i + 1}>
                {i + 1}프렛
              </option>
            ))}
          </select>
        </label>
      )}
      {keyboard && (
        <button
          type="button"
          className="score-key-notation-toggle"
          role="switch"
          aria-checked={keyboardKeyIsWritten(score, part)}
          disabled={disabled}
          onClick={() =>
            apply(() =>
              setScoreKeyboardKey(
                score,
                part,
                score.keyboardTranspositions?.[scorePartOwner(score, part)] ?? 0,
                !keyboardKeyIsWritten(score, part),
              ),
            )
          }
        >
          악보에 반영 <span className="score-metronome-switch" aria-hidden="true" />
        </button>
      )}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
