import {
  validateRecognition,
  supportedDrumPitches,
  type RecognitionData,
} from './convert-recognition.js';
import { RecognitionError } from './pdf-recognition.client.js';
import type { TabScoreType } from './recognition-request.js';

export type ReviewIssue = {
  voice?: 'upper' | 'lower';
  part: string;
  page: number;
  measure: number;
  code: string;
  message: string;
  bounds?: number[];
  eventIndex?: number;
  kind?: string;
  source?: 'model';
  blocking?: boolean;
};
export type ScoreStructure = ReturnType<typeof readStructure>;

export function normalizeRecognitionPartNames(
  value: unknown,
  type: TabScoreType,
  fixed?: ScoreStructure,
): unknown {
  if (!['vocal-staff', 'keyboard', 'drums'].includes(type))
    return normalizeGuitarPartNames(value, fixed);
  const raw = value as RecognitionData;
  if (!raw || !Array.isArray(raw.parts)) return value;
  const parts = fixed?.parts ?? raw.parts;
  return {
    ...raw,
    ...(type === 'drums' ? { key: 0 } : {}),
    ...(type === 'keyboard'
      ? {
          key: fixed ? (fixed.key ?? 0) : (raw.key ?? 0),
          warnings: [
            ...(raw.warnings ?? []),
            ...(!fixed && raw.key === null && !raw.warnings?.some((w) => w.code === 'KEY_DEFAULT_C')
              ? [{ part: '', measure: 0, code: 'KEY_DEFAULT_C' }]
              : []),
          ],
        }
      : {}),
    parts: raw.parts.map((p) => {
      const i = parts.findIndex((n) => n.id === p.id);
      // General pitched staves retain the printed instrument/part name.
      if (type === 'vocal-staff') return p;
      if (
        i < 0 ||
        p.instrument !== (type === 'drums' ? 'drums' : type === 'keyboard' ? 'piano' : 'standard')
      )
        return p;
      const number = /^\s*(?:vocal|보컬|keyboard|piano|키보드|drums?|드럼)\s*(\d+)\s*$/i.exec(
        p.name,
      )?.[1];
      if (fixed && number && Number(number) !== i + 1) return p;
      return {
        ...p,
        name: `${type === 'drums' ? '드럼' : type === 'keyboard' ? '키보드' : '보컬'} ${i + 1}`,
      };
    }),
  };
}

export function normalizeGuitarPartNames(value: unknown, fixed?: ScoreStructure): unknown {
  const raw = value as RecognitionData;
  if (!raw || !Array.isArray(raw.parts)) return value;
  const all = fixed?.parts ?? raw.parts;
  return {
    ...raw,
    parts: raw.parts.map((p) => {
      const bass = p.instrument.startsWith('bass');
      const guitars = all.filter((n) =>
        bass
          ? n.instrument.startsWith('bass')
          : ['guitar', 'dropD', 'guitarHalfDown'].includes(n.instrument),
      );
      const index = guitars.findIndex((g) => g.id === p.id);
      if (index < 0) return p;
      // A clearly different numbered part is an identity error, not an alias.
      const number = /^\s*(?:guitar|기타|bass|베이스)\s*(\d+)\s*$/i.exec(p.name)?.[1];
      if (fixed && number && Number(number) !== index + 1) return p;
      return { ...p, name: `${bass ? '베이스' : '기타'} ${index + 1}` };
    }),
  };
}

export function readStructure(value: unknown, pages: number, requireBounds = true) {
  const raw = value as RecognitionData;
  if (!raw || !Array.isArray(raw.parts))
    throw new RecognitionError('STRUCTURE_VALIDATION', '파트 구조가 올바르지 않아요.');
  const data = validateRecognition(
    {
      ...raw,
      parts: raw.parts.map((p) => ({
        ...p,
        measures: Array.isArray(p.measures)
          ? p.measures.map((m) => ({ ...m, events: [] }))
          : p.measures,
      })),
    },
    pages,
  );
  if (!data.parts.length || data.parts.some((p) => !p.measures.length))
    throw new RecognitionError('STRUCTURE_VALIDATION', '인식된 파트·마디 구조가 없어요.');
  const ids = new Set<string>();
  for (const p of data.parts) {
    const lines = (p as typeof p & { tabLines?: number | null }).tabLines;
    if (lines != null && (!Number.isInteger(lines) || lines < 1 || lines > 12))
      throw new RecognitionError('STRUCTURE_VALIDATION', '타브 줄 수가 올바르지 않아요.');
    if (
      lines != null &&
      ((p.instrument.startsWith('bass') && lines !== 4) ||
        (['guitar', 'dropD', 'guitarHalfDown'].includes(p.instrument) && lines !== 6))
    )
      throw new RecognitionError(
        'STRUCTURE_VALIDATION',
        '타브 줄 수와 지원 악기가 일치하지 않아요.',
      );
    if (ids.has(p.id)) throw new RecognitionError('STRUCTURE_VALIDATION', '파트 ID가 중복됐어요.');
    ids.add(p.id);
    const numbers = p.measures.map((m) => m.number);
    const tablature = [
      'guitar',
      'dropD',
      'guitarHalfDown',
      'bass',
      'bassHalfDown',
      'bassDropD',
    ].includes(p.instrument);
    if (
      new Set(numbers).size !== numbers.length ||
      numbers.some(
        (n, i) =>
          i > 0 &&
          (tablature
            ? n < numbers[i - 1] + (p.measures[i - 1].restCount ?? 1)
            : n !== numbers[i - 1] + (p.measures[i - 1].restCount ?? 1)),
      )
    )
      throw new RecognitionError(
        'STRUCTURE_VALIDATION',
        '마디 번호가 중복되거나 누락됐어요. 구조를 다시 분석해주세요.',
      );
    const previousByRow = new Map<string, number[]>();
    let previousPage = 0,
      previousSystem = 0;
    for (const m of p.measures) {
      const geometry = m as typeof m & { system?: number; bounds?: number[] };
      const bounds = geometry.bounds;
      if (!requireBounds) continue;
      if (
        !Number.isInteger(geometry.system) ||
        geometry.system! < 1 ||
        geometry.system! > 128 ||
        !Array.isArray(bounds) ||
        bounds.length !== 4 ||
        bounds.some((n) => !Number.isInteger(n) || n < 0 || n > 1000) ||
        bounds[0] >= bounds[2] ||
        bounds[1] >= bounds[3]
      )
        throw new RecognitionError(
          'STRUCTURE_VALIDATION',
          `${m.number}마디의 페이지 영역 좌표를 확인해주세요.`,
        );
      if (m.page < previousPage || (m.page === previousPage && geometry.system! < previousSystem))
        throw new RecognitionError(
          'STRUCTURE_VALIDATION',
          '페이지·악보 줄의 순서가 올바르지 않아요.',
        );
      const key = `${m.page}:${geometry.system}`;
      const before = previousByRow.get(key);
      if (before && bounds[0] < before[2] - 2)
        throw new RecognitionError(
          'STRUCTURE_VALIDATION',
          `${m.number}마디의 경계가 앞 마디와 겹치거나 역순입니다.`,
        );
      for (const [otherKey, other] of previousByRow) {
        if (
          otherKey.startsWith(`${m.page}:`) &&
          otherKey !== key &&
          Math.min(other[3], bounds[3]) > Math.max(other[1], bounds[1]) + 2
        )
          throw new RecognitionError(
            'STRUCTURE_VALIDATION',
            `${m.number}마디의 악보 줄 영역이 다른 줄과 겹칩니다.`,
          );
      }
      previousByRow.set(key, bounds);
      previousPage = m.page;
      previousSystem = geometry.system!;
    }
  }
  return {
    scoreContext:
      typeof (raw as typeof raw & { scoreContext?: unknown }).scoreContext === 'string'
        ? (raw as typeof raw & { scoreContext: string }).scoreContext.slice(0, 6000)
        : '',
    bpm: data.bpm,
    key: data.key,
    warnings: data.warnings,
    parts: data.parts.map((p) => ({
      id: p.id,
      name: p.name,
      instrument: p.instrument,
      capo: p.capo,
      tabLines: (p as typeof p & { tabLines?: number | null }).tabLines ?? null,
      measures: p.measures.map((m) => ({
        number: m.number,
        ...(m.restCount != null ? { restCount: m.restCount } : {}),
        page: m.page,
        meter: m.meter,
        system: (m as typeof m & { system?: number }).system ?? 1,
        bounds: (m as typeof m & { bounds?: number[] }).bounds ?? [0, 0, 1000, 1000],
      })),
    })),
  };
}

/** Inspect timing before conversion can fill gaps with generated rests. */
export function markForcedEstimate(value: unknown): unknown {
  const raw = value as RecognitionData;
  if (!raw || !Array.isArray(raw.parts)) return value;
  return {
    ...raw,
    warnings: [
      ...(raw.warnings ?? []),
      ...raw.parts.flatMap((p) =>
        (p.measures ?? []).map((m) => ({
          part: p.id,
          measure: m.number,
          code: 'FORCED_INFERENCE',
        })),
      ),
    ],
    parts: raw.parts.map((p) => ({
      ...p,
      measures: (p.measures ?? []).map((m) => ({
        ...m,
        reading: m.events?.length ? 'estimated' : (m as typeof m & { reading?: string }).reading,
        events: m.events?.map((e) => ({
          ...e,
          tie: 'none',
          techniques: [],
          notes: e.notes.map((n) => ({
            ...n,
            drum:
              typeof n.drum === 'string' ? n.drum.replace(/-(?:rimshot|roll[23])$/, '') : n.drum,
          })),
        })),
      })),
    })),
  };
}

export function reviewRecognition(
  raw: unknown,
  structure: ScoreStructure,
  forcedTargets: { part: string; page: number; measure: number }[] = [],
  requireDrumCoverage = false,
): ReviewIssue[] {
  const issues: ReviewIssue[] = [];
  const root = raw as RecognitionData;
  if (!root || !Array.isArray(root.parts))
    return [
      {
        part: '',
        page: 1,
        measure: 1,
        code: 'INVALID_RESULT',
        message: '음표 인식 결과 구조가 올바르지 않아요.',
      },
    ];
  const ratio = (v: number[]) =>
    Array.isArray(v) && v.length === 2 && v[1] > 0 ? v[0] / v[1] : NaN;
  for (const p of structure.parts) {
    const matches = root.parts.filter((n) => n.id === p.id);
    const actual = matches[0];
    for (const m of p.measures) {
      const add = (code: string, message: string) =>
        issues.push({ part: p.id, page: m.page, measure: m.number, code, message });
      const bars = actual?.measures?.filter((n) => n.number === m.number) ?? [];
      const bar = bars[0];
      if (
        matches.length !== 1 ||
        bars.length !== 1 ||
        !bar ||
        bar.page !== m.page ||
        (bar.restCount ?? null) !== (m.restCount ?? null) ||
        actual.instrument !== p.instrument ||
        actual.capo !== p.capo ||
        JSON.stringify(bar.meter) !== JSON.stringify(m.meter)
      ) {
        add('STRUCTURE_MISMATCH', '확정한 파트·마디 구조와 음표 결과가 다릅니다.');
        continue;
      }
      const detailItems = (bar as typeof bar & { uncertainties?: unknown }).uncertainties;
      if (
        m.restCount &&
        (!Array.isArray(bar.events) ||
          bar.events.length ||
          (bar as typeof bar & { reading?: string }).reading !== 'complete')
      ) {
        add('REST_GROUP_REVIEW', '확정한 여러 마디 쉼표에는 음표 없이 전체 쉼표가 필요합니다.');
        continue;
      }
      if (actual.name !== p.name) {
        add(
          'PART_IDENTITY_MISMATCH',
          '응답의 파트 ID와 악기 이름이 확정한 파트와 다릅니다. 다른 파트의 오류가 섞이지 않도록 재분석이 필요해요.',
        );
        continue;
      }
      const estimated = (bar as typeof bar & { reading?: string }).reading === 'estimated';
      const knownDrumHits =
        p.instrument === 'drums' &&
        Array.isArray(bar.events) &&
        bar.events.some((e) => e.notes?.length) &&
        bar.events.every(
          (e) =>
            Array.isArray(e.notes) &&
            e.notes.every(
              (n) =>
                n.pitch !== null &&
                supportedDrumPitches.includes(n.pitch) &&
                n.string === null &&
                n.fret === null &&
                !n.dead,
            ),
        );
      if (p.instrument === 'drums' && requireDrumCoverage && !m.restCount) {
        const coverage = (bar as typeof bar & { drumCoverage?: unknown }).drumCoverage as
          Record<string, { status?: unknown; visibleHits?: unknown }> | undefined;
        for (const voice of ['upper', 'lower'] as const) {
          const info = coverage?.[voice],
            events = Array.isArray(bar.events)
              ? bar.events.filter((e) =>
                  voice === 'lower'
                    ? e.staff === 'lower'
                    : e.staff === 'upper' || e.staff === 'main',
                )
              : [];
          const captured = events.reduce((sum, e) => sum + (e.notes?.length ?? 0), 0),
            label = voice === 'upper' ? '위 성부' : '아래 성부';
          const validCount =
            typeof info?.visibleHits === 'number' &&
            Number.isInteger(info.visibleHits) &&
            info.visibleHits >= 0;
          const confirmedRest = info?.status === 'rest' && info.visibleHits === 0 && captured === 0;
          if (
            !confirmedRest &&
            (!info ||
              !validCount ||
              info.status !== 'complete' ||
              info.visibleHits !== captured ||
              (!captured && !events.length))
          ) {
            issues.push({
              part: p.id,
              page: m.page,
              measure: m.number,
              voice,
              code: !info ? 'DRUM_COVERAGE_MISSING' : 'DRUM_HIT_OMISSION',
              kind: 'drum',
              blocking: false,
              message: !info
                ? `${label}의 타격 확인 정보가 없어 누락 여부를 확인할 수 없어요. 보완된 쉼표는 원본 쉼표로 확정된 것이 아닙니다.`
                : `${label} 타격 누락 가능성: ${validCount ? `모델이 원본에서 센 타격 ${info.visibleHits}개` : '원본 타격 수 미확인'}, 반환된 타격 ${captured}개입니다. 미인식 구간의 쉼표는 편집용 보완입니다.`,
            });
          }
        }
      }
      const forced = forcedTargets.some(
        (t) => t.part === p.id && t.page === m.page && t.measure === m.number,
      );
      if (forced && estimated)
        issues.push({
          part: p.id,
          page: m.page,
          measure: m.number,
          code: 'FORCED_INFERENCE',
          message:
            '강제 추론한 음표입니다. 음높이·박자와 타브의 줄·프렛을 원본과 비교해주세요. 주법과 연결 기호는 생략했어요.',
          blocking: false,
        });
      const knownFrets =
        Array.isArray(bar.events) &&
        bar.events.every(
          (e) =>
            Array.isArray(e.notes) &&
            e.notes.every((n) => (Number.isInteger(n.fret) && n.fret !== null) || n.dead),
        );
      const tieOmitted =
        Array.isArray(bar.events) &&
        bar.events.every((e) => e.tie === 'none') &&
        root.warnings?.some(
          (w) => w.part === p.id && w.measure === m.number && w.code === 'TIE_OMITTED',
        );
      const details = Array.isArray(detailItems) ? detailItems.slice(0, 16) : [];
      const beforeDetails = issues.length;
      for (const value of details) {
        const d = value as {
          reason?: unknown;
          kind?: unknown;
          bounds?: unknown;
          eventIndex?: unknown;
        };
        if (!d || typeof d !== 'object') continue;
        // Do not display another part's symbol diagnosis under this part.
        if (
          Array.isArray(d.bounds) &&
          d.bounds.length === 4 &&
          d.bounds.every((n) => typeof n === 'number' && Number.isFinite(n))
        ) {
          const [left, top, right, bottom] = d.bounds as number[];
          const x = (left + right) / 2,
            y = (top + bottom) / 2;
          const contains = (b: number[]) => x >= b[0] && x <= b[2] && y >= b[1] && y <= b[3];
          if (
            left < right &&
            top < bottom &&
            !contains(m.bounds) &&
            structure.parts.some(
              (other) =>
                other.id !== p.id &&
                other.measures.some((b) => b.page === m.page && contains(b.bounds)),
            )
          ) {
            add(
              'ISSUE_PART_MISMATCH',
              '모델이 다른 파트 영역의 기호를 이 마디의 오류로 반환했어요. 해당 설명은 제외했으니 이 마디를 다시 분석해주세요.',
            );
            continue;
          }
        }
        const kind =
          typeof d.kind === 'string' &&
          [
            'drum',
            'pitch',
            'fret',
            'string',
            'rhythm',
            'tuplet',
            'tie',
            'technique',
            'other',
          ].includes(d.kind)
            ? d.kind
            : 'other';
        const bounds =
          Array.isArray(d.bounds) &&
          d.bounds.length === 4 &&
          d.bounds.every(
            (n) => typeof n === 'number' && Number.isInteger(n) && n >= 0 && n <= 1000,
          ) &&
          d.bounds[0] < d.bounds[2] &&
          d.bounds[1] < d.bounds[3] &&
          d.bounds[0] >= m.bounds[0] &&
          d.bounds[2] <= m.bounds[2] &&
          d.bounds[1] >= m.bounds[1] &&
          d.bounds[3] <= m.bounds[3]
            ? d.bounds
            : undefined;
        issues.push({
          part: p.id,
          page: m.page,
          measure: m.number,
          code: 'MODEL_UNCERTAINTY',
          kind,
          source: 'model',
          ...((estimated &&
            (forced ||
              (kind === 'drum' && knownDrumHits) ||
              kind === 'rhythm' ||
              kind === 'tuplet' ||
              (kind === 'string' && knownFrets))) ||
          (kind === 'tie' && tieOmitted)
            ? { blocking: false }
            : {}),
          message:
            typeof d.reason === 'string' && d.reason.trim()
              ? d.reason.trim().slice(0, 240)
              : '구체적인 미인식 사유를 반환하지 않았어요.',
          ...(bounds ? { bounds } : {}),
          ...(typeof d.eventIndex === 'number' &&
          Number.isInteger(d.eventIndex) &&
          d.eventIndex >= 1 &&
          d.eventIndex <= 2000
            ? { eventIndex: d.eventIndex }
            : {}),
        });
      }
      if (
        (!estimated && (bar as typeof bar & { reading?: string }).reading !== 'complete') ||
        (details.length > 0 &&
          (issues.length === beforeDetails ||
            issues.slice(beforeDetails).some((i) => i.blocking !== false))) ||
        root.warnings?.some(
          (w) =>
            w.part === p.id &&
            w.measure === m.number &&
            /UNREADABLE|UNCERTAIN|UNCLEAR/.test(w.code) &&
            !(
              estimated &&
              (forced || knownDrumHits || (knownFrets && w.code === 'UNCLEAR_STRING_FRET'))
            ),
        )
      ) {
        if (issues.slice(beforeDetails).every((i) => i.blocking === false))
          add(
            'UNREADABLE_MEASURE',
            '읽지 못했거나 불확실한 마디입니다. 구체적인 위치·이유는 응답에 없습니다.',
          );
        continue;
      }
      if (estimated && issues.length === beforeDetails)
        issues.push({
          part: p.id,
          page: m.page,
          measure: m.number,
          code: 'RHYTHM_ESTIMATED',
          kind: 'rhythm',
          source: 'model',
          blocking: false,
          message: '읽힌 음표에 맞춰 리듬을 추정했어요. 원본과 비교해 수정해주세요.',
        });
      if (!Array.isArray(bar.events)) {
        add('INVALID_EVENTS', '음표 목록이 올바르지 않습니다.');
        continue;
      }
      if (estimated && !bar.events.length)
        add('ESTIMATE_EMPTY', '음표가 없는 마디를 리듬 추정 결과로 출력할 수 없어요.');
      const capacity = (m.meter[0] * 4) / m.meter[1];
      const lanes = new Map<string, typeof bar.events>();
      for (const e of bar.events) {
        if (
          p.instrument === 'drums' &&
          e.notes?.some(
            (n) =>
              n.pitch === null ||
              !supportedDrumPitches.includes(n.pitch) ||
              n.string !== null ||
              n.fret !== null ||
              n.dead,
          )
        )
          add(
            'DRUM_MAPPING_REVIEW',
            '지원하는 드럼 악기 번호를 확인하지 못했어요. 타브 줄·프렛이나 선율 음높이 대신 드럼 타격 정보가 필요해요.',
          );
        if (
          ['standard', 'piano'].includes(p.instrument) &&
          e.notes?.some(
            (n) =>
              !Number.isInteger(n.pitch) ||
              n.pitch === null ||
              n.pitch < 0 ||
              n.pitch > 127 ||
              n.string !== null ||
              n.fret !== null ||
              n.drum !== null ||
              n.dead,
          )
        )
          add(
            'INVALID_PITCH',
            '오선 음표의 음높이가 없거나 올바르지 않습니다. 타브 줄·프렛 대신 MIDI 음높이가 필요해요.',
          );
        const start = ratio(e.onset),
          duration = ratio(e.duration);
        if (
          !Number.isFinite(start) ||
          !Number.isFinite(duration) ||
          start < 0 ||
          duration <= 0 ||
          !Number.isInteger(start * 48) ||
          !Number.isInteger(duration * 48)
        ) {
          add('INVALID_RHYTHM', '음표 시작·길이가 1/48박 격자에 맞지 않습니다.');
          continue;
        }
        if (start + duration > capacity + 1e-8) {
          const message = `음표가 마디 끝을 ${Number((start + duration - capacity).toFixed(4))}박 초과합니다.`;
          if (estimated)
            issues.push({
              part: p.id,
              page: m.page,
              measure: m.number,
              code: 'ESTIMATED_BAR_OVERFLOW',
              kind: 'rhythm',
              blocking: false,
              message: message + ' 음표를 보존해 마디 길이를 늘린 편집용 결과로 출력합니다.',
            });
          else add('BAR_OVERFLOW', message);
        }
        const strings = e.notes?.filter((n) => n.string !== null).map((n) => n.string) ?? [];
        if (new Set(strings).size !== strings.length)
          add('DUPLICATE_STRING', '동시에 같은 줄에 여러 노트가 있습니다.');
        if (e.notes?.some((n) => n.dead && n.string === null))
          add('DEAD_STRING_MISSING', '고스트노트의 줄 번호가 없습니다.');
        const key = `${e.staff}:${e.voice}`;
        lanes.set(key, [...(lanes.get(key) ?? []), e]);
      }
      for (const events of lanes.values()) {
        const sorted = [...events].sort((a, b) => ratio(a.onset) - ratio(b.onset));
        let end = 0;
        for (let i = 0; i < sorted.length; i++) {
          const e = sorted[i],
            start = ratio(e.onset),
            duration = ratio(e.duration);
          if (start < end - 1e-8)
            add('EVENT_OVERLAP', '앞 음표가 끝나기 전에 다음 음표가 시작합니다.');
          if (start > end + 1e-8) {
            if (p.instrument === 'drums')
              issues.push({
                part: p.id,
                page: m.page,
                measure: m.number,
                code: 'DRUM_HIT_OMISSION',
                kind: 'drum',
                blocking: false,
                message:
                  '드럼 타격 사이에 미인식 가능성이 있는 빈 박자가 있습니다. 편집용 쉼표로 보완하며 실제 쉼표로 확정하지 않습니다.',
              });
            else add('UNEXPLAINED_GAP', '음표 사이에 확인되지 않은 빈 박자가 있습니다.');
          }
          end = Math.max(end, start + duration);
          // A consecutive run of equal triplet subdivisions must form groups of 3.
          const ticks = Math.round(duration * 48);
          const previous = sorted[i - 1];
          const continuing =
            previous &&
            Math.abs(ratio(previous.duration) - duration) < 1e-8 &&
            Math.abs(ratio(previous.onset) + duration - start) < 1e-8;
          if ([8, 16, 32, 64, 128].includes(ticks) && !continuing) {
            let count = 1;
            while (
              i + count < sorted.length &&
              Math.abs(ratio(sorted[i + count].duration) - duration) < 1e-8 &&
              Math.abs(ratio(sorted[i + count].onset) - (start + count * duration)) < 1e-8
            )
              count++;
            if (count % 3 !== 0)
              add('TUPLET_GROUP_REVIEW', '셋잇단 그룹의 길이와 개수를 확인해주세요.');
          }
        }
        if (end < capacity - 1e-8)
          issues.push({
            part: p.id,
            page: m.page,
            measure: m.number,
            code: p.instrument === 'drums' ? 'DRUM_HIT_OMISSION' : 'INCOMPLETE_BAR',
            kind: 'rhythm',
            blocking: false,
            message:
              p.instrument === 'drums'
                ? `타격 누락 가능성: 드럼 성부에 ${Number((capacity - end).toFixed(4))}박이 부족합니다. 남은 박의 쉼표는 원본에서 확인된 쉼표가 아닌 편집용 보완입니다.`
                : `마디에 ${Number((capacity - end).toFixed(4))}박이 부족합니다. 편집용 악보에서는 남은 박을 쉼표로 채우므로 원본과 비교해 수정해주세요.`,
          });
      }
    }
  }
  for (const p of root.parts) {
    const expected = structure.parts.find((n) => n.id === p.id);
    for (const m of p.measures ?? [])
      if (!expected?.measures.some((n) => n.number === m.number && n.page === m.page))
        issues.push({
          part: p.id,
          page: m.page,
          measure: m.number,
          code: 'EXTRA_MEASURE',
          message: '확정된 구조에 없는 파트·마디입니다.',
        });
  }
  return issues
    .filter(
      (v, i, a) =>
        a.findIndex(
          (n) =>
            n.part === v.part &&
            n.measure === v.measure &&
            n.code === v.code &&
            n.voice === v.voice &&
            (v.source !== 'model' ||
              (n.message === v.message &&
                JSON.stringify(n.bounds) === JSON.stringify(v.bounds) &&
                n.kind === v.kind &&
                n.eventIndex === v.eventIndex)),
        ) === i,
    )
    .slice(0, 512);
}

export type RecognizedHit = {
  part: string;
  page: number;
  measure: number;
  voice: string;
  pitch: number;
  x: number;
  y: number;
};
/** Model-reported head centers only; reject malformed/outside-measure coordinates. */
export function recognizedDrumHits(raw: unknown, structure: ScoreStructure): RecognizedHit[] {
  const result: RecognizedHit[] = [];
  const parts = (raw as { parts?: unknown[] } | null)?.parts;
  if (!Array.isArray(parts)) return result;
  for (const source of parts) {
    if (!source || typeof source !== 'object') continue;
    const p = source as { id: string; instrument: string; measures?: unknown[] };
    const fixed = structure.parts.find((v) => v.id === p.id && v.instrument === 'drums');
    if (!fixed || !Array.isArray(p.measures)) continue;
    for (const sourceBar of p.measures) {
      if (!sourceBar || typeof sourceBar !== 'object') continue;
      const bar = sourceBar as { page: number; number: number; events?: unknown[] };
      const m = fixed.measures.find((v) => v.page === bar.page && v.number === bar.number);
      if (!m || !Array.isArray(bar.events)) continue;
      for (const sourceEvent of bar.events) {
        if (!sourceEvent || typeof sourceEvent !== 'object') continue;
        const event = sourceEvent as { staff: string; notes?: unknown[] };
        if (!Array.isArray(event.notes)) continue;
        for (const sourceNote of event.notes) {
          if (!sourceNote || typeof sourceNote !== 'object') continue;
          const note = sourceNote as { pitch: number; position?: number[] };
          const point = note.position;
          if (
            !Array.isArray(point) ||
            point.length !== 2 ||
            !point.every(Number.isFinite) ||
            !supportedDrumPitches.includes(note.pitch)
          )
            continue;
          const [x, y] = point,
            b = m.bounds;
          if (x < b[0] || x > b[2] || y < b[1] || y > b[3]) continue;
          result.push({
            part: p.id,
            page: bar.page,
            measure: bar.number,
            voice: event.staff,
            pitch: note.pitch,
            x,
            y,
          });
          if (result.length >= 20000) return result;
        }
      }
    }
  }
  return result;
}
