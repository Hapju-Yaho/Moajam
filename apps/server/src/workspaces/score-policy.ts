const validBeat = (value: number) => Math.abs(value * 48 - Math.round(value * 48)) < 1e-7;
const object = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
const number = (value: unknown, min: number, max: number) =>
  typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;

export function isBandScore(value: unknown): boolean {
  if (!isSingleBandScore(value) || !object(value)) return false;
  const data = value.scoreVersions;
  if (data === undefined) return true;
  const paired = {
    ...(object(value.keyboardStaves) ? value.keyboardStaves : {}),
    ...(object(value.drumVoices) ? value.drumVoices : {}),
  };
  const visible = (value.parts as string[]).filter((part) => !Object.values(paired).includes(part));
  if (
    !object(data) ||
    data.schemaVersion !== 2 ||
    !Array.isArray(data.parts) ||
    data.parts.length !== visible.length
  )
    return false;
  const owners = new Set<string>();
  const fields = [
    'measureLengths',
    'measureWidths',
    'multiMeasureRests',
    'directions',
    'guitarToneChanges',
    'capos',
    'systemLayout',
    'equalWidthRows',
    'playbackInstruments',
    'measureChords',
    'beatChords',
  ];
  for (const group of data.parts) {
    if (
      !object(group) ||
      typeof group.part !== 'string' ||
      !visible.includes(group.part) ||
      owners.has(group.part) ||
      !Array.isArray(group.versions) ||
      !group.versions.length ||
      group.versions.length > 12 ||
      !Number.isSafeInteger(group.appliedRevision) ||
      !number(group.appliedRevision, 1, Number.MAX_SAFE_INTEGER)
    )
      return false;
    owners.add(group.part);
    const staves = [group.part, paired[group.part]].filter(Boolean);
    const ids = new Set<string>(),
      names = new Set<string>();
    for (const version of group.versions) {
      if (
        !object(version) ||
        typeof version.id !== 'string' ||
        !/^[\w-]{1,80}$/.test(version.id) ||
        ids.has(version.id) ||
        typeof version.name !== 'string' ||
        !version.name.trim() ||
        version.name.length > 40 ||
        names.has(version.name.trim()) ||
        !Number.isSafeInteger(version.revision) ||
        !number(version.revision, 1, Number.MAX_SAFE_INTEGER)
      )
        return false;
      ids.add(version.id);
      names.add(version.name.trim());
      if (version.content === undefined) {
        if (version.id !== group.appliedVersionId || version.revision !== group.appliedRevision)
          return false;
      } else {
        const content = version.content;
        if (
          !object(content) ||
          !Array.isArray(content.notes) ||
          !object(content.sync) ||
          !object(content.settings) ||
          content.notes.some((note) => !object(note) || !staves.includes(note.part)) ||
          Object.keys(content.settings).some((field) => !fields.includes(field)) ||
          Object.values(content.settings).some(
            (map) => !object(map) || Object.keys(map).some((part) => !staves.includes(part)),
          )
        )
          return false;
        const noteIds = new Set(
          (content.notes as Record<string, unknown>[]).map((note) => note.id),
        );
        if (
          Object.entries(content.sync).some(
            ([id, time]) => !noteIds.has(id) || !number(time, 0, 36000),
          )
        )
          return false;
        const composed: Record<string, unknown> = {
          ...value,
          scoreVersions: undefined,
          notes: [
            ...(value.notes as Record<string, unknown>[]).filter(
              (note) => !staves.includes(note.part),
            ),
            ...content.notes,
          ],
        };
        for (const field of fields) {
          composed[field] = {
            ...Object.fromEntries(
              Object.entries(object(value[field]) ? value[field] : {}).filter(
                ([part]) => !staves.includes(part),
              ),
            ),
            ...(object(content.settings[field]) ? content.settings[field] : {}),
          };
        }
        if (!isSingleBandScore(composed)) return false;
      }
    }
    if (
      !group.versions.some(
        (version: Record<string, unknown>) =>
          version.id === group.appliedVersionId &&
          Number(version.revision) >= Number(group.appliedRevision),
      )
    )
      return false;
  }
  return true;
}

function isSingleBandScore(value: unknown): boolean {
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
  if (
    value.systemGap !== undefined &&
    (!number(value.systemGap, 0, 160) || !Number.isInteger(value.systemGap))
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
    const grace = note.graceBeats !== undefined;
    if (
      grace &&
      (!number(note.graceBeats, 1 / 48, 64) ||
        !validBeat(Number(note.graceBeats)) ||
        note.beats !== 0 ||
        note.rest ||
        note.blank ||
        note.tuplet !== undefined)
    )
      return false;
    if (
      !parts.includes(note.part) ||
      !number(note.pitch, 0, 127) ||
      !Number.isInteger(note.pitch) ||
      !number(note.beats, grace ? 0 : 1 / 48, grace ? 0 : 64) ||
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
            object(tone) &&
            typeof tone.pitch === 'number' &&
            number(tone.pitch, 0, 127) &&
            Number.isInteger(tone.pitch) &&
            (tone.naturalPitch === undefined ||
              (typeof tone.naturalPitch === 'number' &&
                number(tone.naturalPitch, 0, 127) &&
                Number.isInteger(tone.naturalPitch) &&
                [0, 2, 4, 5, 7, 9, 11].includes(tone.naturalPitch % 12) &&
                Math.abs(tone.pitch - tone.naturalPitch) <= 1)),
        ))
    )
      return false;
    if (note.tuplet !== undefined && note.tuplet !== 3) return false;
    if (note.slideIn !== undefined && note.slideIn !== 'up' && note.slideIn !== 'down')
      return false;
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
