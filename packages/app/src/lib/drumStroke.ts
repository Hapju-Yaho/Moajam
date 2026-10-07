import { drumNotation, type ScoreTone } from './score';

export function drumStrokeLayout(tone: ScoreTone, flags: number, beamed: boolean) {
  const { roll } = drumNotation(tone);
  const count = roll === 'roll3' ? 3 : roll === 'roll2' ? 2 : 1;
  const height = roll === 'buzz' ? 10 : 6 + (count - 1) * 5;
  // Leave space below the innermost beam or the full curved flag.
  const tipGap = flags ? (beamed ? (flags - 1) * 7 + 6 : (flags - 1) * 6 + 17) : 5;
  return { roll, count, height, tipGap, stemLength: tipGap + height + 10 };
}

export function drumStemLength(tones: ScoreTone[], flags: number, beamed: boolean) {
  return Math.max(
    25 + Math.max(0, flags - 2) * 5,
    ...tones.map((tone) => {
      const layout = drumStrokeLayout(tone, flags, beamed);
      return layout.roll ? layout.stemLength : 0;
    }),
  );
}
