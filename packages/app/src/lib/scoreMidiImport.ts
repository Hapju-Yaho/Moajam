import {
  alignScoreMeasures,
  cleanScoreConnections,
  scoreBeat,
  scoreInstrument,
  scoreMeasureDuration,
  scoreMeasureStart,
  spliceScorePartTime,
  tabTones,
  type Score,
  type ScoreNote,
} from './score';
import { scorePartStaves } from './scoreParts';
import { clientId } from './clientId';

export type MidiImportNote = { pitch: number; start: number; end: number };
export type MidiImportTrack = {
  name: string;
  channel: number;
  program: number;
  notes: MidiImportNote[];
};
export type MidiImportData = {
  tracks: MidiImportTrack[];
  bpm: number;
  meter: { beats: number; beatType: number };
  beats: number;
  bars: number;
  warnings: string[];
};

/** Read Standard MIDI Files (format 0/1, PPQ). Times are quarter-note beats, not seconds. */
export function readScoreMidi(buffer: ArrayBuffer): MidiImportData {
  if (buffer.byteLength > 10 * 1024 * 1024) throw new Error('10MB 이하 MIDI 파일을 선택해주세요.');
  const bytes = new Uint8Array(buffer),
    view = new DataView(buffer);
  let at = 0;
  const need = (n: number) => {
    if (at + n > bytes.length) throw new Error('MIDI 파일이 잘렸거나 손상됐어요.');
  };
  const u16 = () => {
    need(2);
    const n = view.getUint16(at);
    at += 2;
    return n;
  };
  const u32 = () => {
    need(4);
    const n = view.getUint32(at);
    at += 4;
    return n;
  };
  const tag = () => {
    need(4);
    const s = String.fromCharCode(...bytes.slice(at, at + 4));
    at += 4;
    return s;
  };
  if (tag() !== 'MThd') throw new Error('표준 MIDI 파일(.mid, .midi)을 선택해주세요.');
  const header = u32(),
    format = u16(),
    count = u16(),
    division = u16();
  if (header < 6 || format > 1 || !count || count > 256 || !division || division & 0x8000)
    throw new Error('박자 기반의 MIDI 형식 0·1 파일을 사용해주세요.');
  at = 8 + header;
  need(0);
  let bpm = 120,
    meter = { beats: 4, beatType: 4 },
    total = 0,
    noteCount = 0;
  const warnings = new Set<string>(),
    tracks: MidiImportTrack[] = [];
  let tempoSeen = false,
    meterSeen = false;
  for (let t = 0; t < count; t++) {
    if (tag() !== 'MTrk') throw new Error('MIDI 트랙 정보를 읽지 못했어요.');
    const length = u32(),
      end = at + length;
    need(length);
    let tick = 0,
      running = 0,
      name = `트랙 ${t + 1}`;
    const channels = new Map<number, MidiImportTrack>(),
      programs = new Map<number, number>();
    const held = new Map<string, { tick: number; pitch: number; channel: number }[]>();
    const ended = new Map<string, number>();
    const channel = (n: number) => {
      if (!channels.has(n))
        channels.set(n, { name, channel: n, program: programs.get(n) ?? 0, notes: [] });
      return channels.get(n)!;
    };
    const byte = () => {
      if (at >= end) throw new Error('MIDI 이벤트가 잘렸어요.');
      return bytes[at++];
    };
    const vlq = () => {
      let n = 0;
      for (let i = 0; i < 4; i++) {
        const b = byte();
        n = (n << 7) | (b & 127);
        if (!(b & 128)) return n;
      }
      throw new Error('MIDI 시간 값이 올바르지 않아요.');
    };
    while (at < end) {
      tick += vlq();
      total = Math.max(total, tick);
      let status = byte();
      if (status < 128) {
        if (!running) throw new Error('MIDI 이벤트 상태가 올바르지 않아요.');
        at--;
        status = running;
      }
      if (status === 255) {
        running = 0;
        const type = byte(),
          size = vlq();
        if (at + size > end) throw new Error('MIDI 메타 정보가 잘렸어요.');
        const data = bytes.slice(at, at + size);
        at += size;
        if (type === 3) name = new TextDecoder().decode(data).replace(/\0/g, '').trim() || name;
        if (type === 81 && size === 3) {
          const tempo = (data[0] << 16) | (data[1] << 8) | data[2];
          if (!tempo) throw new Error('MIDI 템포 값이 올바르지 않아요.');
          if (!tempoSeen) {
            bpm = Math.round(60000000 / tempo);
            tempoSeen = true;
          } else if (tick)
            warnings.add('중간 템포 변경은 가져오지 않으며 현재 프로젝트 BPM을 유지해요.');
        }
        if (type === 88 && size >= 2) {
          if (!data[0] || data[1] > 5) throw new Error('지원하지 않는 MIDI 박자표예요.');
          if (!meterSeen) {
            meter = { beats: data[0], beatType: 2 ** data[1] };
            meterSeen = true;
          } else if (tick) warnings.add('박자표가 바뀌는 MIDI는 첫 박자표로 미리보기를 계산해요.');
        }
        if (type === 47) {
          at = end;
          break;
        }
        continue;
      }
      if (status === 240 || status === 247) {
        running = 0;
        const size = vlq();
        if (at + size > end) throw new Error('MIDI 시스템 정보가 잘렸어요.');
        at += size;
        continue;
      }
      if (status < 128 || status >= 240) throw new Error('지원하지 않는 MIDI 이벤트예요.');
      running = status;
      const kind = status & 240,
        ch = status & 15,
        a = byte(),
        b = kind === 192 || kind === 208 ? 0 : byte();
      if (a > 127 || b > 127) throw new Error('MIDI 음표 값이 올바르지 않아요.');
      if (kind === 192) {
        programs.set(ch, a);
        if (channels.has(ch)) channels.get(ch)!.program = a;
      }
      if (kind === 144 && b > 0) {
        if (++noteCount > 100000) throw new Error('음표가 너무 많은 MIDI 파일이에요.');
        const key = `${ch}/${a}`,
          queue = held.get(key) ?? [];
        queue.push({ tick, pitch: a, channel: ch });
        held.set(key, queue);
        channel(ch);
      }
      if (kind === 128 || (kind === 144 && b === 0)) {
        const key = `${ch}/${a}`;
        const index = ended.get(key) ?? 0;
        const start = held.get(key)?.[index];
        if (start) ended.set(key, index + 1);
        if (start)
          channel(ch).notes.push({
            pitch: a,
            start: start.tick / division,
            end: Math.max(start.tick + 1, tick) / division,
          });
      }
      if (kind === 176 && a === 64 && b > 0)
        warnings.add('서스테인 페달은 음표 길이에 합치지 않아요.');
    }
    for (const [key, queue] of held)
      for (const n of queue.slice(ended.get(key) ?? 0))
        channel(n.channel).notes.push({
          pitch: n.pitch,
          start: n.tick / division,
          end: Math.max(tick, n.tick + division) / division,
        });
    for (const tr of channels.values())
      if (tr.notes.length) {
        tr.name = channels.size > 1 ? `${name} · 채널 ${tr.channel + 1}` : name;
        tr.notes.sort((a, b) => a.start - b.start || a.pitch - b.pitch);
        tracks.push(tr);
      }
    at = end;
  }
  if (!tracks.length) throw new Error('MIDI 파일에 가져올 음표가 없어요.');
  const beats = Math.max(total / division, ...tracks.flatMap((tr) => tr.notes.map((n) => n.end)));
  return {
    tracks,
    bpm,
    meter,
    beats,
    bars: Math.ceil(beats / ((meter.beats * 4) / meter.beatType)),
    warnings: [...warnings],
  };
}

export function midiInsertionRange(
  score: Score,
  data: Pick<MidiImportData, 'beats'>,
  target: string,
  startBar: number,
  selectedParts?: string[],
) {
  if (
    !score.parts.includes(target) ||
    !Number.isInteger(startBar) ||
    startBar < 1 ||
    startBar > 32000
  )
    throw new Error('대상 파트와 시작 마디를 확인해주세요.');
  const start = scoreMeasureStart(score, target, startBar - 1);
  let span = 0,
    bars = 0;
  while (span + 1e-7 < data.beats) {
    if (startBar + bars > 32000) throw new Error('가져올 악보가 최대 마디 수를 초과해요.');
    span = scoreBeat(span + scoreMeasureDuration(score, target, startBar - 1 + bars++));
  }
  const parts = selectedParts ?? scorePartStaves(score, target);
  const conflicts = parts.some((part) => {
    let at = 0;
    const left = scoreMeasureStart(score, part, startBar - 1),
      right = scoreMeasureStart(score, part, startBar - 1 + bars);
    return score.notes
      .filter((n) => n.part === part)
      .some((n) => {
        const from = at;
        at += n.beats;
        return !n.rest && !n.blank && from < right - 1e-7 && at > left + 1e-7;
      });
  });
  return { start, span, bars, parts, conflicts };
}
export function insertScoreMidi(
  score: Score,
  data: MidiImportData,
  track: number,
  target: string,
  startBar: number,
  grid = 0.25,
  makeId = () => clientId(),
): Score {
  if (
    !data.tracks[track] ||
    ![1, 0.5, 0.25, 0.125, 1 / 3, 1 / 6].some((n) => Math.abs(n - grid) < 1e-7)
  )
    throw new Error('가져올 트랙과 박자 정렬 단위를 확인해주세요.');
  const range = midiInsertionRange(score, data, target, startBar);
  if (data.tracks[track].notes.length > 2000 || range.bars > 2000)
    throw new Error('MIDI 트랙이 너무 길어요. 더 짧은 트랙을 선택해주세요.');
  const quantized = data.tracks[track].notes.map((n) => ({
    ...n,
    start: scoreBeat(Math.max(0, Math.round(n.start / grid) * grid)),
    end: scoreBeat(
      Math.max(Math.round(n.start / grid) * grid + grid, Math.round(n.end / grid) * grid),
    ),
  }));
  const owner = target,
    lower = score.keyboardStaves?.[owner] ?? score.drumVoices?.[owner];
  let next = score;
  for (const part of range.parts) {
    const start = scoreMeasureStart(score, part, startBar - 1),
      end = scoreMeasureStart(score, part, startBar - 1 + range.bars),
      span = scoreBeat(end - start);
    const notes = quantized.filter(
      (n) =>
        !lower ||
        (score.drumVoices?.[owner] ? [35, 36, 44].includes(n.pitch) : n.pitch < 60) ===
          (part === lower),
    );
    const boundaries = [
      ...new Set([
        0,
        span,
        ...notes.flatMap((n) => [Math.min(span, n.start), Math.min(span, n.end)]),
        ...Array.from(
          { length: range.bars },
          (_, i) => scoreMeasureStart(score, part, startBar + i) - start,
        ),
      ]),
    ].sort((a, b) => a - b);
    const imported: ScoreNote[] = [];
    for (let i = 0; i < boundaries.length - 1; i++) {
      const at = boundaries[i],
        beats = scoreBeat(boundaries[i + 1] - at);
      if (!beats) continue;
      const pitches = [
        ...new Set(
          notes.filter((n) => n.start <= at + 1e-7 && n.end > at + 1e-7).map((n) => n.pitch),
        ),
      ].sort((a, b) => a - b);
      if (pitches.length > 16)
        throw new Error('한 박에 16개를 넘는 음이 겹쳐 있어요. 다른 트랙을 선택해주세요.');
      let remaining = beats,
        position = at;
      const durations = [
        6,
        4,
        3,
        2,
        1.5,
        1,
        0.75,
        0.5,
        0.375,
        0.25,
        0.1875,
        0.125,
        8 / 3,
        4 / 3,
        2 / 3,
        1 / 3,
        1 / 6,
        1 / 12,
        1 / 24,
      ].sort((a, b) => b - a);
      while (remaining > 1e-7) {
        const duration = durations.find((d) => d <= remaining + 1e-7);
        if (!duration) throw new Error('MIDI 음표 길이를 악보로 변환하지 못했어요.');
        let note: ScoreNote = {
          id: makeId(),
          part,
          pitch: pitches[0] ?? 60,
          beats: scoreBeat(duration),
          rest: !pitches.length,
          accent: false,
          chord: '',
          lyric: '',
          tones: pitches.map((pitch) => ({ pitch })),
          ...(![6, 4, 3, 2, 1.5, 1, 0.75, 0.5, 0.375, 0.25, 0.1875, 0.125].some(
            (d) => Math.abs(d - duration) < 1e-7,
          )
            ? { tuplet: 3 as const }
            : {}),
        };
        if (scoreInstrument(score, part).tuning.length)
          note = { ...note, tones: tabTones(note, scoreInstrument(score, part).tuning) };
        const previous = imported.at(-1);
        if (
          previous &&
          !note.rest &&
          !previous.rest &&
          !notes.some((n) => Math.abs(n.start - position) < 1e-7) &&
          previous.tones?.map((t) => t.pitch).join() === pitches.join()
        )
          previous.connection = { type: 'tie', targetId: note.id };
        imported.push(note);
        remaining = scoreBeat(remaining - duration);
        position = scoreBeat(position + duration);
        if (imported.length > 2000) throw new Error('MIDI 음표가 너무 많아요. 더 짧은 트랙을 선택해주세요.');
      }
    }
    const prepared = spliceScorePartTime(next, part, start, end, span, makeId);
    let at = 0,
      inserted = false;
    const replaced = prepared.notes.flatMap((n) => {
      if (n.part !== part) return [n];
      const from = at;
      at += n.beats;
      if (from >= start - 1e-7 && from < start + span - 1e-7) {
        if (!inserted) {
          inserted = true;
          return imported;
        }
        return [];
      }
      return [n];
    });
    next = { ...prepared, notes: replaced };
  }
  if (next.notes.length > 2000)
    throw new Error('삽입 후 음표가 2,000개를 넘어요. 더 짧은 MIDI 트랙을 사용해주세요.');
  // The project meter and BPM remain unchanged; only selected staves are replaced.
  return cleanScoreConnections(alignScoreMeasures(next, makeId));
}
