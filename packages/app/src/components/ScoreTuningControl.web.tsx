import { scoreInstrument, scoreInstruments, type Score } from '../lib/score';
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
    <div className="score-tuning-control">
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
