import {
  renameScorePart,
  removeScorePart,
  scoreInstrument,
  scoreMeasures,
  scoreMeasureCount,
  scoreMeasureAtBeat,
  scoreMeasureStart,
  scoreMeasureDuration,
  scoreBarBeats,
  scoreBeat,
  noteTones,
  type Score,
  type ScoreNote,
} from './score';

export function scorePartOwner(score: Score, staff: string): string {
  return (
    Object.entries({ ...score.keyboardStaves, ...score.drumVoices }).find(
      ([, left]) => left === staff,
    )?.[0] ?? staff
  );
}

export function scoreVoiceCursor(score: Score, voice: string, bar: number, offset: number) {
  const fragments = scoreMeasures(score, voice)[bar] ?? [];
  const target = fragments.find(
    (f) => !f.note.blank && f.offset <= offset && f.offset + f.beats > offset,
  );
  const start = scoreMeasureStart(score, voice, bar);
  if (target) return { id: target.note.id, beat: scoreBeat(start + target.offset), bar };
  const lastWritten = fragments.filter((f) => !f.note.blank).at(-1);
  const used = lastWritten ? scoreBeat(lastWritten.offset + lastWritten.beats) : 0;
  const capacity = Math.max(scoreBarBeats(score), scoreMeasureDuration(score, voice, bar));
  const gap =
    used < capacity
      ? {
          offset: used,
          note: fragments.find((f) => f.note.blank && f.offset <= used && f.offset + f.beats > used)
            ?.note,
        }
      : fragments.filter((f) => f.note.blank).at(-1);
  if (gap) return { id: gap.note?.id, beat: scoreBeat(start + gap.offset), bar };
  const last = fragments.at(-1);
  return { id: last?.note.id, beat: scoreBeat(start + (last?.offset ?? 0)), bar };
}
export const drumVoiceCursor = scoreVoiceCursor;
export function scoreVisibleParts(score: Score): string[] {
  const lefts = new Set(Object.values({ ...score.keyboardStaves, ...score.drumVoices }));
  return score.parts.filter((part) => !lefts.has(part));
}
export function scorePartStaves(score: Score, part: string): string[] {
  const owner = scorePartOwner(score, part);
  const other = score.keyboardStaves?.[owner] ?? score.drumVoices?.[owner];
  return other ? [owner, other] : [owner];
}
export function addInstrumentPart(score: Score, name: string, instrument: string): Score {
  if (instrument === 'piano' && score.parts.length > 14)
    throw new Error(
      '키보드는 양손을 위해 두 개의 보표 공간이 필요해요. 최대 16개 보표까지 지원해요.',
    );
  let next = renameScorePart(score, null, name);
  const right = name.trim();
  next = { ...next, instruments: { ...next.instruments, [right]: instrument } };
  if (instrument === 'drums') return enableDrumVoices(next, right);
  if (instrument !== 'piano') return next;
  return enableKeyboardPart(next, right);
}
export function enableKeyboardPart(score: Score, right: string): Score {
  if (score.keyboardStaves?.[right]) return score;
  if (score.parts.length >= 16) throw new Error('키보드 왼손을 추가할 보표 공간이 부족해요.');
  let next: Score = { ...score, instruments: { ...score.instruments, [right]: 'piano' } };
  let left = `${right.slice(0, 30)} · 왼손`;
  for (let i = 2; next.parts.includes(left); i++) left = `${right.slice(0, 28)} · 왼손 ${i}`;
  next = renameScorePart(next, null, left);
  return {
    ...next,
    instruments: { ...next.instruments, [left]: 'pianoBass' },
    keyboardStaves: { ...next.keyboardStaves, [right]: left },
    playbackInstruments: {
      ...next.playbackInstruments,
      [right]: 'acoustic_grand_piano',
      [left]: 'acoustic_grand_piano',
    },
  };
}
export function enableDrumVoices(
  score: Score,
  part: string,
  makeId = () => crypto.randomUUID(),
): Score {
  const upper = scorePartOwner(score, part);
  if (score.drumVoices?.[upper]) return score;
  if (score.keyboardStaves?.[upper]) throw new Error('키보드 파트는 드럼 성부로 바꿀 수 없어요.');
  if (score.parts.length >= 16) throw new Error('드럼 아래 성부를 추가할 공간이 부족해요.');
  const source = score.notes.filter((note) => note.part === upper);
  if (score.notes.length + source.length > 2000)
    throw new Error('드럼 성부를 나누면 최대 음표 수를 넘어요.');
  let lower = `${upper.slice(0, 30)} · 발`;
  for (let i = 2; score.parts.includes(lower); i++) lower = `${upper.slice(0, 28)} · 발 ${i}`;
  let next = renameScorePart(score, null, lower);
  const foot = new Set([35, 36, 44]);
  const split = (note: ScoreNote, feet: boolean): ScoreNote => {
    const tones = noteTones(note).filter((tone) => foot.has(tone.pitch) === feet);
    return {
      ...note,
      id: feet ? makeId() : note.id,
      part: feet ? lower : upper,
      tones,
      pitch: tones[0]?.pitch ?? 60,
      rest: !tones.length,
      blank: note.blank,
      chord: feet ? '' : note.chord,
      lyric: feet ? '' : note.lyric,
      connection: undefined,
      slurTo: undefined,
      slideOut: undefined,
      slideIn: undefined,
    };
  };
  next = {
    ...next,
    notes: [
      ...next.notes.map((note) => (note.part === upper ? split(note, false) : note)),
      ...source.map((note) => split(note, true)),
    ],
    drumVoices: { ...next.drumVoices, [upper]: lower },
    instruments: { ...next.instruments, [upper]: 'drums', [lower]: 'drums' },
    measureLengths: { ...next.measureLengths, [lower]: { ...next.measureLengths?.[upper] } },
    playbackInstruments: { ...next.playbackInstruments, [upper]: 'drum_kit', [lower]: 'drum_kit' },
  };
  return next;
}
export function removeInstrumentPart(score: Score, part: string): Score {
  if (scoreVisibleParts(score).length <= 1) throw new Error('최소 한 개의 파트가 필요해요.');
  return scorePartStaves(score, part).reduce(removeScorePart, score);
}
export function moveInstrumentPart(score: Score, part: string, direction: -1 | 1): Score {
  const visible = scoreVisibleParts(score);
  const from = visible.indexOf(scorePartOwner(score, part));
  if (from < 0) throw new Error('파트를 찾을 수 없어요.');
  const to = from + direction;
  if (to < 0 || to >= visible.length) return score;
  [visible[from], visible[to]] = [visible[to], visible[from]];
  // Keep the instrument's hands/voices adjacent when changing its display order.
  return { ...score, parts: visible.flatMap((name) => scorePartStaves(score, name)) };
}
export function scorePartMix(score: Score, part: string) {
  return score.partMix?.[scorePartOwner(score, part)] ?? { volume: 1, muted: false, solo: false };
}
export function audibleScoreParts(score: Score, selected: string, ensemble: boolean) {
  const candidates = ensemble ? score.parts : scorePartStaves(score, selected);
  const solo = candidates.some((p) => scorePartMix(score, p).solo);
  return candidates.filter((p) => {
    const mix = scorePartMix(score, p);
    return !mix.muted && mix.volume > 0 && (!solo || mix.solo);
  });
}
export function partInstrumentLabel(score: Score, part: string) {
  if (score.drumVoices?.[scorePartOwner(score, part)]) return '드럼 · 손·발 독립 성부';
  return score.keyboardStaves?.[scorePartOwner(score, part)]
    ? '키보드 · 양손'
    : scoreInstrument(score, part).label;
}

// A shared measure clock keeps a short hand or an incomplete bar from pulling
// subsequent measures ahead of the other instruments. The saved notation stays intact.
export function ensemblePlaybackScore(score: Score, parts: string[], selected: string) {
  const names = [...new Set([selected, ...parts])];
  const count = Math.max(1, ...names.map((name) => scoreMeasureCount(score, name)));
  const lengths = Array.from({ length: count }, (_, bar) =>
    Math.max(scoreBarBeats(score), ...names.map((name) => scoreMeasureDuration(score, name, bar))),
  );
  const starts = [0];
  for (const length of lengths) starts.push(scoreBeat(starts.at(-1)! + length));
  const notes: ScoreNote[] = [];
  const measureLengths: NonNullable<Score['measureLengths']> = {};
  const usedIds = new Set(score.notes.map((n) => n.id));
  let sequence = 0;
  const id = () => {
    let value: string;
    do {
      value = `ensemble-${sequence++}`;
    } while (usedIds.has(value));
    usedIds.add(value);
    return value;
  };
  for (const name of names) {
    const measures = scoreMeasures(score, name);
    measureLengths[name] = Object.fromEntries(lengths.map((length, bar) => [bar, length]));
    let sustained: ScoreNote | undefined;
    for (let bar = 0; bar < count; bar++) {
      const fragments = measures[bar] ?? [];
      let used = 0;
      for (const fragment of fragments) {
        const note: ScoreNote = {
          ...fragment.note,
          id: fragment.continued ? id() : fragment.note.id,
          beats: fragment.beats,
        };
        if (fragment.continued && sustained && !note.rest)
          sustained.connection = { type: 'tie', targetId: note.id };
        if (fragment.continues) {
          delete note.connection;
          delete note.slideOut;
          delete note.slideIn;
        }
        if (fragment.continued) {
          delete note.slurTo;
          note.lyric = '';
          note.chord = '';
        }
        notes.push(note);
        sustained = fragment.continues ? note : undefined;
        used = scoreBeat(used + fragment.beats);
      }
      if (used < lengths[bar])
        notes.push({
          id: id(),
          part: name,
          pitch: 60,
          beats: scoreBeat(lengths[bar] - used),
          rest: true,
          blank: true,
          chord: '',
          lyric: '',
          accent: false,
        });
    }
  }
  return {
    score: {
      ...score,
      notes,
      measureLengths,
      ...(score.guitarToneChanges
        ? {
            guitarToneChanges: Object.fromEntries(
              Object.entries(score.guitarToneChanges).map(([name, changes]) => [
                name,
                Object.fromEntries(
                  Object.entries(changes).map(([beat, tone]) => {
                    const location = scoreMeasureAtBeat(score, name, +beat);
                    return [
                      scoreBeat((starts[location.bar] ?? starts.at(-1)!) + location.offset),
                      tone,
                    ];
                  }),
                ),
              ]),
            ),
          }
        : {}),
    },
    toShared(beat: number) {
      const location = scoreMeasureAtBeat(score, selected, beat);
      return scoreBeat((starts[location.bar] ?? starts.at(-1)!) + location.offset);
    },
    toSelected(beat: number) {
      const bar = Math.max(
        0,
        starts.findIndex((start, i) => i < count && beat >= start && beat < starts[i + 1]),
      );
      return scoreBeat(
        scoreMeasureStart(score, selected, bar) +
          Math.min(scoreMeasureDuration(score, selected, bar) - 1 / 48, beat - starts[bar]),
      );
    },
  };
}
