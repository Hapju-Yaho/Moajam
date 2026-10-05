const validBeat = (value: number) => Math.abs(value * 48 - Math.round(value * 48)) < 1e-7;
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
  if (
    value.referenceAudioSource !== undefined &&
    value.referenceAudioSource !== 'file' &&
    value.referenceAudioSource !== 'youtube'
  )
    return false;
  if (
    value.referenceYoutubeId !== undefined &&
    (typeof value.referenceYoutubeId !== 'string' ||
      !/^[a-zA-Z0-9_-]{11}$/.test(value.referenceYoutubeId))
  )
    return false;
  if (
    value.rhythmFeel !== undefined &&
    (typeof value.rhythmFeel !== 'string' ||
      ![
        'straight',
        'triplet-eighth',
        'triplet-sixteenth',
        'dotted-eighth',
        'dotted-sixteenth',
        'scottish-eighth',
        'scottish-sixteenth',
      ].includes(value.rhythmFeel))
  )
    return false;
  if (
    value.timeSignature !== undefined &&
    (!object(value.timeSignature) ||
      !number(value.timeSignature.beats, 1, 16) ||
      !Number.isInteger(value.timeSignature.beats) ||
      typeof value.timeSignature.beatType !== 'number' ||
      ![2, 4, 8, 16].includes(value.timeSignature.beatType))
  )
    return false;
  if (
    value.keySignature !== undefined &&
    (!number(value.keySignature, -7, 7) || !Number.isInteger(value.keySignature))
  )
    return false;
  if (
    value.barlines !== undefined &&
    (!object(value.barlines) ||
      Object.entries(value.barlines).some(
        ([bar, style]) => !/^\d+$/.test(bar) || Number(bar) >= 32000 || style !== 'double',
      ))
  )
    return false;
  const validBar = (key: string) => /^\d+$/.test(key) && Number(key) < 32000;
  for (const name of ['measureWidths', 'measureLengths'] as const) {
    const map = value[name];
    if (map === undefined) continue;
    if (
      !object(map) ||
      Object.entries(map).some(
        ([part, bars]) =>
          !parts.includes(part) ||
          !object(bars) ||
          Object.entries(bars).some(
            ([bar, amount]) =>
              !validBar(bar) ||
              !(name === 'measureWidths'
                ? number(amount, 10, 500) && Number.isInteger(amount)
                : number(amount, 1 / 48, 128000) && validBeat(Number(amount))),
          ),
      )
    )
      return false;
  }
  if (
    value.repeats !== undefined &&
    (!object(value.repeats) ||
      Object.entries(value.repeats).some(
        ([bar, marker]) =>
          !validBar(bar) ||
          !object(marker) ||
          (marker.start !== undefined && typeof marker.start !== 'boolean') ||
          (marker.end !== undefined && typeof marker.end !== 'boolean') ||
          (marker.times !== undefined &&
            (!number(marker.times, 2, 8) || !Number.isInteger(marker.times))),
      ))
  )
    return false;
  const ids = new Set<string>();
  const valid = value.notes.every((note: unknown) => {
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
      !number(note.beats, 1 / 48, 64) ||
      !validBeat(Number(note.beats)) ||
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
    if (note.tuplet !== undefined && note.tuplet !== 3) return false;
    if (note.slideOut !== undefined && note.slideOut !== 'up' && note.slideOut !== 'down')
      return false;
    if (note.slurTo !== undefined && (typeof note.slurTo !== 'string' || note.slurTo.length > 200))
      return false;
    return true;
  });
  if (!valid) return false;
  const notes = value.notes as Record<string, unknown>[];
  return notes.every((note, index) => {
    if (note.slurTo === undefined) return true;
    const end = notes.findIndex((item) => item.id === note.slurTo && item.part === note.part);
    return (
      end > index &&
      notes
        .slice(index, end + 1)
        .filter((item) => item.part === note.part)
        .every((item) => !item.rest && !item.blank)
    );
  });
}
