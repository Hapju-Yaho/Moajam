const object = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
const number = (value: unknown, min: number, max: number) =>
  typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;

export function isBandScore(value: unknown): boolean {
  if (!object(value) || JSON.stringify(value).length > 950000) return false;
  if (typeof value.title !== 'string' || value.title.length > 1000 || !number(value.bpm, 30, 300))
    return false;
  const parts = value.parts;
  if (
    !Array.isArray(parts) ||
    !parts.length ||
    parts.length > 16 ||
    new Set(parts).size !== parts.length ||
    parts.some((part) => typeof part !== 'string' || !part.trim() || part.length > 40)
  )
    return false;
  if (!object(value.sync) || !Array.isArray(value.notes) || value.notes.length > 2000) return false;
  const ids = new Set<string>();
  return value.notes.every((note: unknown) => {
    if (
      !object(note) ||
      typeof note.id !== 'string' ||
      !note.id ||
      note.id.length > 200 ||
      ids.has(note.id)
    )
      return false;
    ids.add(note.id);
    if (
      !parts.includes(note.part) ||
      !number(note.pitch, 0, 127) ||
      !Number.isInteger(note.pitch) ||
      !number(note.beats, 1 / 16, 64) ||
      !Number.isInteger(Number(note.beats) * 16) ||
      typeof note.rest !== 'boolean' ||
      typeof note.accent !== 'boolean' ||
      typeof note.chord !== 'string' ||
      note.chord.length > 1000 ||
      typeof note.lyric !== 'string' ||
      note.lyric.length > 10000
    )
      return false;
    if (
      note.tones !== undefined &&
      (!Array.isArray(note.tones) ||
        note.tones.length > 16 ||
        !note.tones.every(
          (tone: unknown) =>
            object(tone) && number(tone.pitch, 0, 127) && Number.isInteger(tone.pitch),
        ))
    )
      return false;
    return true;
  });
}
