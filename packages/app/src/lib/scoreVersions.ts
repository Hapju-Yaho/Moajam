import { validateScoreDocument, type ScoreDocument } from './scoreFile';
import { scorePartOwner, scorePartStaves, scoreVisibleParts } from './scoreParts';
import { renameScorePart, type Score, type ScoreNote } from './score';

export const PART_VERSION_FIELDS = [
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
] as const;
type PartSettings = Pick<Score, (typeof PART_VERSION_FIELDS)[number]>;
export type ScorePartSnapshot = { notes: ScoreNote[]; sync: Score['sync']; settings: PartSettings };
export type ScoreVersion = {
  id: string;
  name: string;
  revision: number;
  content: ScorePartSnapshot;
};
export type ScorePartVersions = {
  part: string;
  appliedVersionId: string;
  appliedRevision: number;
  versions: ScoreVersion[];
};
export type ScoreVersionLibrary = { applied: ScoreDocument; parts: ScorePartVersions[] };
type StoredPartVersions = Omit<ScorePartVersions, 'versions'> & {
  versions: (Omit<ScoreVersion, 'content'> & { content?: ScorePartSnapshot })[];
};
export type StoredScore = Score & {
  referenceAudio?: ScoreDocument['referenceAudio'];
  instrumentSample?: ScoreDocument['instrumentSample'];
  scoreVersions?: { schemaVersion: 2; parts: StoredPartVersions[] };
};
export const MAX_SCORE_VERSIONS = 12;
const invalid = () => new Error('저장된 파트 버전 정보를 확인해주세요. 원본을 덮어쓰지 않았어요.');
export function scoreDocumentFromStored(value: StoredScore): ScoreDocument {
  if (value.referenceAudio != null && !(value.referenceAudio instanceof Blob)) throw invalid();
  return {
    score: validateScoreDocument(value),
    referenceAudio: value.referenceAudio ?? null,
    instrumentSample: value.instrumentSample ?? null,
  };
}
export function captureScorePart(score: Score, part: string): ScorePartSnapshot {
  const staves = scorePartStaves(score, part);
  const notes = score.notes.filter((note) => staves.includes(note.part));
  const ids = new Set(notes.map((note) => note.id));
  const settings = Object.fromEntries(
    PART_VERSION_FIELDS.flatMap((field) => {
      const values = Object.entries(score[field] ?? {}).filter(([name]) => staves.includes(name));
      return values.length ? [[field, Object.fromEntries(values)]] : [];
    }),
  ) as PartSettings;
  return {
    notes,
    sync: Object.fromEntries(Object.entries(score.sync).filter(([id]) => ids.has(id))),
    settings,
  };
}
export function replaceScorePart(score: Score, part: string, content: ScorePartSnapshot): Score {
  const staves = scorePartStaves(score, part);
  const previousIds = new Set(
    score.notes.filter((note) => staves.includes(note.part)).map((note) => note.id),
  );
  const next: Score = {
    ...score,
    notes: [...score.notes.filter((note) => !staves.includes(note.part)), ...content.notes],
    sync: {
      ...Object.fromEntries(Object.entries(score.sync).filter(([id]) => !previousIds.has(id))),
      ...content.sync,
    },
  };
  for (const field of PART_VERSION_FIELDS) {
    const map = {
      ...Object.fromEntries(
        Object.entries(score[field] ?? {}).filter(([name]) => !staves.includes(name)),
      ),
      ...content.settings[field],
    };
    Object.assign(next, { [field]: Object.keys(map).length ? map : undefined });
  }
  return next;
}
const basePart = (score: Score, part: string): ScorePartVersions => ({
  part,
  appliedVersionId: 'original',
  appliedRevision: 1,
  versions: [{ id: 'original', name: '기본', revision: 1, content: captureScorePart(score, part) }],
});
export function createScoreVersionLibrary(document: ScoreDocument): ScoreVersionLibrary {
  return {
    applied: document,
    parts: scoreVisibleParts(document.score).map((part) => basePart(document.score, part)),
  };
}
export function readScoreVersionLibrary(value: StoredScore): ScoreVersionLibrary {
  const applied = scoreDocumentFromStored(value);
  const data = value.scoreVersions;
  if (data === undefined) return createScoreVersionLibrary(applied);
  if (!data || data.schemaVersion !== 2 || !Array.isArray(data.parts)) throw invalid();
  const visible = scoreVisibleParts(applied.score);
  if (data.parts.length !== visible.length) throw invalid();
  const owners = new Set<string>();
  const parts = data.parts.map((group) => {
    if (
      !group ||
      !visible.includes(group.part) ||
      owners.has(group.part) ||
      !Array.isArray(group.versions) ||
      !group.versions.length ||
      group.versions.length > MAX_SCORE_VERSIONS ||
      !Number.isSafeInteger(group.appliedRevision) ||
      group.appliedRevision < 1
    )
      throw invalid();
    owners.add(group.part);
    const ids = new Set<string>(),
      names = new Set<string>();
    const staves = scorePartStaves(applied.score, group.part);
    const versions = group.versions.map((version) => {
      if (
        !version ||
        typeof version.id !== 'string' ||
        !/^[\w-]{1,80}$/.test(version.id) ||
        ids.has(version.id) ||
        typeof version.name !== 'string' ||
        !version.name.trim() ||
        version.name.length > 40 ||
        names.has(version.name.trim()) ||
        !Number.isSafeInteger(version.revision) ||
        version.revision < 1
      )
        throw invalid();
      ids.add(version.id);
      names.add(version.name.trim());
      const content =
        version.content ??
        (version.id === group.appliedVersionId && version.revision === group.appliedRevision
          ? captureScorePart(applied.score, group.part)
          : null);
      if (
        !content ||
        !Array.isArray(content.notes) ||
        !content.sync ||
        !content.settings ||
        content.notes.some((note) => !staves.includes(note.part)) ||
        Object.keys(content.sync).some((id) => !content.notes.some((note) => note.id === id)) ||
        Object.keys(content.settings).some(
          (field) => !PART_VERSION_FIELDS.includes(field as (typeof PART_VERSION_FIELDS)[number]),
        ) ||
        Object.values(content.settings).some(
          (map) =>
            !map ||
            typeof map !== 'object' ||
            Object.keys(map).some((name) => !staves.includes(name)),
        )
      )
        throw invalid();
      const combined = validateScoreDocument(replaceScorePart(applied.score, group.part, content));
      return {
        id: version.id,
        name: version.name.trim(),
        revision: version.revision,
        content: captureScorePart(combined, group.part),
      };
    });
    const active = versions.find((version) => version.id === group.appliedVersionId);
    if (!active || active.revision < group.appliedRevision) throw invalid();
    return {
      part: group.part,
      appliedVersionId: group.appliedVersionId,
      appliedRevision: group.appliedRevision,
      versions,
    };
  });
  return { applied, parts };
}
export function storeScoreVersionLibrary(library: ScoreVersionLibrary): StoredScore {
  return {
    ...library.applied.score,
    referenceAudio: library.applied.referenceAudio,
    instrumentSample: library.applied.instrumentSample,
    scoreVersions: {
      schemaVersion: 2,
      parts: library.parts.map((group) => ({
        ...group,
        // The applied revision already exists in the root score; do not store its notes twice.
        versions: group.versions.map(({ content, ...version }) =>
          version.id === group.appliedVersionId && version.revision === group.appliedRevision
            ? version
            : { ...version, content },
        ),
      })),
    },
  };
}
export function partVersionGroup(library: ScoreVersionLibrary, part: string): ScorePartVersions {
  const group = library.parts.find(
    (item) => item.part === scorePartOwner(library.applied.score, part),
  );
  if (!group) throw invalid();
  return group;
}
export function scoreVersionName(group: ScorePartVersions, name: string, except?: string) {
  const trimmed = name.trim();
  if (!trimmed || trimmed.length > 40) throw new Error('버전 이름은 1~40자로 입력해주세요.');
  if (group.versions.some((version) => version.id !== except && version.name === trimmed))
    throw new Error('이 파트에 같은 이름의 버전이 있어요. 다른 이름을 입력해주세요.');
  return trimmed;
}
const changeGroup = (
  library: ScoreVersionLibrary,
  part: string,
  transform: (group: ScorePartVersions) => ScorePartVersions,
): ScoreVersionLibrary => ({
  ...library,
  parts: library.parts.map((group) => (group.part === part ? transform(group) : group)),
});
export function saveScoreVersion(
  library: ScoreVersionLibrary,
  part: string,
  id: string,
  document: ScoreDocument,
): ScoreVersionLibrary {
  return changeGroup(library, part, (group) => {
    if (!group.versions.some((version) => version.id === id)) throw invalid();
    const content = captureScorePart(document.score, part);
    if (
      JSON.stringify(group.versions.find((version) => version.id === id)!.content) ===
      JSON.stringify(content)
    )
      return group;
    return {
      ...group,
      versions: group.versions.map((version) =>
        version.id === id
          ? {
              ...version,
              content,
              revision: version.revision + 1,
            }
          : version,
      ),
    };
  });
}
export function addScoreVersion(
  library: ScoreVersionLibrary,
  part: string,
  id: string,
  name: string,
  content: ScorePartSnapshot,
): ScoreVersionLibrary {
  return changeGroup(library, part, (group) => {
    if (group.versions.length >= MAX_SCORE_VERSIONS)
      throw new Error(`파트마다 최대 ${MAX_SCORE_VERSIONS}개 버전을 저장할 수 있어요.`);
    if (group.versions.some((version) => version.id === id)) throw invalid();
    return {
      ...group,
      versions: [
        ...group.versions,
        { id, name: scoreVersionName(group, name), revision: 1, content },
      ],
    };
  });
}
export function renameScoreVersion(
  library: ScoreVersionLibrary,
  part: string,
  id: string,
  name: string,
): ScoreVersionLibrary {
  return changeGroup(library, part, (group) => ({
    ...group,
    versions: group.versions.map((version) =>
      version.id === id ? { ...version, name: scoreVersionName(group, name, id) } : version,
    ),
  }));
}
export function removeScoreVersion(
  library: ScoreVersionLibrary,
  part: string,
  id: string,
): ScoreVersionLibrary {
  return changeGroup(library, part, (group) => {
    if (id === group.appliedVersionId)
      throw new Error('이 파트에 적용된 버전은 삭제할 수 없어요. 먼저 다른 버전을 적용해주세요.');
    return { ...group, versions: group.versions.filter((version) => version.id !== id) };
  });
}
export function applyScoreVersion(
  library: ScoreVersionLibrary,
  part: string,
  id: string,
): ScoreVersionLibrary {
  const group = partVersionGroup(library, part),
    version = group.versions.find((item) => item.id === id);
  if (!version) throw invalid();
  const next = changeGroup(library, group.part, (item) => ({
    ...item,
    appliedVersionId: id,
    appliedRevision: version.revision,
  }));
  return {
    ...next,
    applied: {
      ...next.applied,
      score: replaceScorePart(next.applied.score, group.part, version.content),
    },
  };
}
// Part structure and shared song settings are saved once. Existing applied notes remain untouched.
export function reconcileScoreVersions(
  library: ScoreVersionLibrary,
  document: ScoreDocument,
): ScoreVersionLibrary {
  const score = document.score;
  let applied = library.applied.score;
  let groups = library.parts;
  const before = scoreVisibleParts(applied),
    after = scoreVisibleParts(score);
  const removed = before.filter((name) => !after.includes(name));
  const added = after.filter((name) => !before.includes(name));
  if (removed.length === 1 && added.length === 1 && score.parts.length === applied.parts.length) {
    const oldName = removed[0],
      newName = added[0];
    const oldStaves = scorePartStaves(applied, oldName),
      newStaves = scorePartStaves(score, newName);
    const rename = (source: Score) =>
      oldStaves.reduce(
        (next, old, index) =>
          old === newStaves[index] ? next : renameScorePart(next, old, newStaves[index]),
        source,
      );
    groups = groups.map((group) =>
      group.part !== oldName
        ? group
        : {
            ...group,
            part: newName,
            versions: group.versions.map((version) => ({
              ...version,
              content: captureScorePart(
                rename(replaceScorePart(applied, oldName, version.content)),
                newName,
              ),
            })),
          },
    );
    applied = rename(applied);
  }
  let next = {
    ...score,
    notes: applied.notes.filter((note) => score.parts.includes(note.part)),
    sync: {},
  };
  for (const field of PART_VERSION_FIELDS) Object.assign(next, { [field]: undefined });
  const parts = after.map((part) => {
    const existing = groups.find((group) => group.part === part);
    const staves = scorePartStaves(score, part);
    const content = existing ? captureScorePart(applied, part) : captureScorePart(score, part);
    // Hidden hands/voices may be added while editing. The group's saved versions retain both timelines.
    const clean = { ...content, notes: content.notes.filter((note) => staves.includes(note.part)) };
    next = replaceScorePart(next, part, clean);
    return existing ?? basePart(score, part);
  });
  return {
    applied: {
      score: next,
      referenceAudio: document.referenceAudio,
      instrumentSample: document.instrumentSample,
    },
    parts,
  };
}
export function importScorePart(
  target: Score,
  part: string,
  source: Score,
  sourcePart: string,
): ScorePartSnapshot {
  const from = scorePartStaves(source, sourcePart),
    to = scorePartStaves(target, part);
  if (from.length > to.length)
    throw new Error('양손·손발 악보는 같은 성부 구조의 파트로 가져와주세요.');
  const snapshot = captureScorePart(source, sourcePart);
  const ids = new Map(snapshot.notes.map((note) => [note.id, crypto.randomUUID()]));
  return {
    notes: snapshot.notes.map((note) => ({
      ...note,
      id: ids.get(note.id)!,
      part: to[from.indexOf(note.part)],
      connection: note.connection
        ? { ...note.connection, targetId: ids.get(note.connection.targetId)! }
        : undefined,
      slurTo: note.slurTo ? ids.get(note.slurTo) : undefined,
    })),
    sync: Object.fromEntries(
      Object.entries(snapshot.sync).map(([id, time]) => [ids.get(id)!, time]),
    ),
    settings: Object.fromEntries(
      Object.entries(snapshot.settings).map(([field, map]) => [
        field,
        Object.fromEntries(
          Object.entries(map).map(([name, value]) => [to[from.indexOf(name)], value]),
        ),
      ]),
    ) as PartSettings,
  };
}
