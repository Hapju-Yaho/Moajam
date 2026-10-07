export {
  scoreDrums,
  drumForPitch,
  drumAtRow,
  drumLabel,
  setScoreDrum,
  drumNotation,
  drumTechniques,
  drumTechniqueLabels,
  type DrumTechnique,
} from './score';

import { scoreDrums, drumTechniques, drumLabel, type DrumTechnique } from './score';

export const drumArticulations = [
  { technique: 'choke', label: '초크' },
  { technique: 'flam', label: '플램' },
  { technique: 'drag', label: '드래그' },
  { technique: 'double', label: '더블 스트로크' },
  { technique: 'roll2', label: '사선 2개' },
  { technique: 'roll3', label: '사선 3개' },
  { technique: 'buzz', label: '버즈 롤' },
] as const;
export const isDrumArticulation = (technique: DrumTechnique) =>
  drumArticulations.some((item) => item.technique === technique);

export type DrumInputChoice = {
  row: number;
  pitch: number;
  technique: DrumTechnique;
  label: string;
};
export const drumInputRows = [...new Set(scoreDrums.map((drum) => drum.y))].map((y) => {
  const drums = scoreDrums.filter((drum) => drum.y === y);
  const choices: DrumInputChoice[] = drums.flatMap((drum) =>
    drumTechniques(drum.pitch)
      .filter((technique) => !isDrumArticulation(technique))
      .map((technique) => ({
        row: scoreDrums.indexOf(drum) + 1,
        pitch: drum.pitch,
        technique,
        label: drumLabel(drum.pitch, technique),
      })),
  );
  // Main instruments first, then their techniques. Keep snare 1/2/3 familiar.
  if (y === 67)
    choices.sort((a, b) => Number(a.technique !== 'normal') - Number(b.technique !== 'normal'));
  if (y === 97)
    choices.sort((a, b) => {
      const order = (choice: DrumInputChoice) =>
        choice.pitch === 37 ? 2 : choice.technique === 'rimshot' ? 1 : 0;
      return order(a) - order(b);
    });
  // Keep the most common hi-hat articulation on 1, open on 2, half-open on 3.
  if (y === 77)
    choices.sort((a, b) => {
      const priority = (choice: DrumInputChoice) =>
        choice.pitch === 42
          ? choice.technique === 'normal'
            ? 0
            : 3
          : choice.technique === 'normal'
            ? 1
            : 2;
      return priority(a) - priority(b);
    });
  return { y, label: drums.map((drum) => drum.label).join(' / '), choices };
});

export function drumInputRow(row: number) {
  return drumInputRows.find((group) => group.y === scoreDrums[row - 1]?.y) ?? drumInputRows[0];
}
export function moveDrumInputRow(row: number, direction: number): number {
  const index = drumInputRows.indexOf(drumInputRow(row));
  return drumInputRows[Math.max(0, Math.min(drumInputRows.length - 1, index + direction))]
    .choices[0].row;
}
