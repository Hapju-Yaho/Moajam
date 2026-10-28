export type GuitarTechniqueFields = {
  palmMute?: boolean;
  harmonic?: 'natural' | 'pinch';
  bend?: {
    kind: 'bend' | 'release' | 'prebend' | 'prebend-release';
    amount: 1 | 2 | 3 | 4;
    bendStart?: number;
    bendEnd?: number;
    releaseStart?: number;
    releaseEnd?: number;
  };
};
export function validGuitarTechniques(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const t = value as GuitarTechniqueFields;
  return (
    (t.palmMute === undefined || typeof t.palmMute === 'boolean') &&
    (t.harmonic === undefined || ['natural', 'pinch'].includes(t.harmonic)) &&
    (t.bend === undefined ||
      (!!t.bend &&
        ['bend', 'release', 'prebend', 'prebend-release'].includes(t.bend.kind) &&
        [1, 2, 3, 4].includes(t.bend.amount) &&
        ['bendStart', 'bendEnd', 'releaseStart', 'releaseEnd'].every((key) => {
          const value = t.bend![key as 'bendStart'];
          return value === undefined || (Number.isFinite(value) && value >= 0);
        }) &&
        (t.bend.bendEnd === undefined || t.bend.bendEnd >= (t.bend.bendStart ?? 0)) &&
        (t.bend.releaseEnd === undefined || t.bend.releaseEnd >= (t.bend.releaseStart ?? 0)) &&
        (t.bend.releaseStart === undefined ||
          t.bend.bendEnd === undefined ||
          t.bend.releaseStart >= t.bend.bendEnd)))
  );
}
export function clampGuitarBend(bend: GuitarTechniqueFields['bend'], beats: number) {
  if (!bend) return bend;
  const result = { ...bend };
  for (const key of ['bendStart', 'bendEnd', 'releaseStart', 'releaseEnd'] as const)
    if (result[key] !== undefined) result[key] = Math.min(result[key], beats);
  return result;
}
const naturalIntervals: Record<number, number> = {
  3: 31,
  4: 28,
  5: 24,
  7: 19,
  9: 28,
  12: 12,
  16: 28,
  19: 19,
  24: 24,
};
export function guitarHarmonicShift(tone: GuitarTechniqueFields & { fret?: number }) {
  if (tone.harmonic === 'pinch') return 24;
  return tone.harmonic === 'natural' && tone.fret !== undefined
    ? (naturalIntervals[tone.fret] ?? tone.fret) - tone.fret
    : 0;
}
export function supportsNaturalHarmonic(fret: number | undefined) {
  return fret !== undefined && Object.hasOwn(naturalIntervals, fret);
}
export function guitarBendOffset(tone: GuitarTechniqueFields, progress: number, beats = 1) {
  const b = tone.bend;
  if (!b) return 0;
  const p = Math.max(0, Math.min(1, progress));
  if (b.bendEnd !== undefined || b.releaseEnd !== undefined) {
    const at = p * beats;
    const ramp = (start: number, end: number) =>
      at >= end ? 1 : Math.max(0, Math.min(1, (at - start) / Math.max(0.001, end - start)));
    const raised = b.kind.startsWith('prebend')
      ? 1
      : ramp(b.bendStart ?? 0, b.bendEnd ?? beats * 0.45);
    const released =
      b.kind === 'release' || b.kind === 'prebend-release'
        ? ramp(b.releaseStart ?? beats * 0.6, b.releaseEnd ?? beats)
        : 0;
    return b.amount * raised * (1 - released);
  }
  if (b.kind === 'prebend') return b.amount;
  if (b.kind === 'prebend-release') return b.amount * Math.max(0, 1 - p / 0.8);
  const rise = Math.min(1, p / 0.45);
  return b.amount * (b.kind === 'release' && p > 0.6 ? Math.max(0, (1 - p) / 0.4) : rise);
}
