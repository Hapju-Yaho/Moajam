export type MidiNote = {
  id: string;
  pitch: number;
  start: number;
  duration: number;
  velocity: number;
  channel: number;
};
export type MidiSequence = { notes: MidiNote[]; duration: number };
export function isMidiFile(file: { name: string; type: string }) {
  return (
    /\.(mid|midi)$/i.test(file.name) ||
    /^(audio\/(x-)?midi|application\/(x-)?midi)$/i.test(file.type)
  );
}
const invalid = () => new Error('올바른 MIDI 파일을 선택해주세요.');
export function parseMidi(
  bytes: ArrayBuffer,
  makeId: () => string = () => crypto.randomUUID(),
): MidiSequence {
  const data = new Uint8Array(bytes);
  let at = 0,
    limit = data.length;
  const byte = () => {
    if (at >= limit) throw invalid();
    return data[at++];
  };
  const u16 = () => (byte() << 8) | byte();
  const u32 = () => byte() * 0x1000000 + (byte() << 16) + (byte() << 8) + byte();
  const tag = () => String.fromCharCode(byte(), byte(), byte(), byte());
  const vlq = () => {
    let result = 0;
    for (let i = 0; i < 4; i++) {
      const b = byte();
      result = result * 128 + (b & 127);
      if (!(b & 128)) return result;
    }
    throw invalid();
  };
  if (tag() !== 'MThd') throw invalid();
  const header = u32(),
    format = u16(),
    tracks = u16(),
    division = u16();
  if (
    header < 6 ||
    header > data.length - 8 ||
    format > 1 ||
    !tracks ||
    tracks > 256 ||
    !division ||
    (format === 0 && tracks !== 1)
  )
    throw invalid();
  if (division & 0x8000)
    throw new Error('SMPTE 시간 형식 MIDI는 지원하지 않아요. 박자 기준 MIDI 파일을 선택해주세요.');
  at = 8 + header;
  const raw: { pitch: number; start: number; end: number; velocity: number; channel: number }[] =
    [];
  const tempos = [{ tick: 0, microseconds: 500000 }];
  let lastTick = 0,
    events = 0;
  for (let track = 0; track < tracks; track++) {
    limit = data.length;
    if (tag() !== 'MTrk') throw invalid();
    const size = u32();
    limit = at + size;
    if (limit > data.length) throw invalid();
    const active = new Map<number, { tick: number; velocity: number }[]>();
    const sustain = Array<boolean>(16).fill(false);
    const held: { pitch: number; start: number; velocity: number; channel: number }[] = [];
    const releasePedal = (channel: number, end: number) => {
      for (let i = held.length - 1; i >= 0; i--)
        if (held[i].channel === channel) {
          const note = held.splice(i, 1)[0];
          if (end > note.start) raw.push({ ...note, end });
        }
    };
    let tick = 0,
      running = 0;
    while (at < limit) {
      if (++events > 200000) throw new Error('MIDI 이벤트가 너무 많아요.');
      tick += vlq();
      lastTick = Math.max(lastTick, tick);
      let status = byte();
      if (status < 128) {
        if (!running) throw invalid();
        at--;
        status = running;
      }
      if (status === 255) {
        const type = byte(),
          length = vlq(),
          end = at + length;
        if (end > limit) throw invalid();
        if (type === 81 && length === 3) {
          const microseconds = (byte() << 16) | (byte() << 8) | byte();
          if (!microseconds) throw invalid();
          tempos.push({ tick, microseconds });
        }
        at = end;
        running = 0;
        if (type === 47) break;
        continue;
      }
      if (status === 240 || status === 247) {
        const length = vlq();
        at += length;
        if (at > limit) throw invalid();
        running = 0;
        continue;
      }
      if (status < 128 || status >= 240) throw invalid();
      running = status;
      const type = status >> 4,
        channel = status & 15,
        pitch = byte();
      const value = type === 12 || type === 13 ? 0 : byte();
      if (pitch > 127 || value > 127) throw invalid();
      const key = channel * 128 + pitch;
      if (type === 11 && pitch === 64) {
        sustain[channel] = value >= 64;
        if (!sustain[channel]) releasePedal(channel, tick);
      }
      if (type === 9 && value) {
        const queue = active.get(key) ?? [];
        queue.push({ tick, velocity: value });
        active.set(key, queue);
      }
      if (type === 8 || (type === 9 && !value)) {
        const note = active.get(key)?.shift();
        if (note && tick > note.tick) {
          if (sustain[channel])
            held.push({ pitch, start: note.tick, velocity: note.velocity, channel });
          else raw.push({ pitch, start: note.tick, end: tick, velocity: note.velocity, channel });
        }
      }
    }
    for (const [key, queue] of active)
      for (const note of queue)
        if (tick > note.tick)
          raw.push({
            pitch: key % 128,
            channel: Math.floor(key / 128),
            start: note.tick,
            end: tick,
            velocity: note.velocity,
          });
    for (let channel = 0; channel < 16; channel++) releasePedal(channel, tick);
    at = limit;
  }
  if (raw.length > 2000)
    throw new Error('한 클립에는 2,000개 이하의 MIDI 음표를 가져올 수 있어요.');
  tempos.sort((a, b) => a.tick - b.tick);
  const timeline: { tick: number; seconds: number; microseconds: number }[] = [];
  let seconds = 0,
    previous = 0,
    tempo = 500000;
  for (const change of tempos) {
    seconds += (((change.tick - previous) / division) * tempo) / 1000000;
    timeline.push({ ...change, seconds });
    previous = change.tick;
    tempo = change.microseconds;
  }
  const time = (tick: number) => {
    let lo = 0,
      hi = timeline.length - 1;
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      if (timeline[mid].tick <= tick) lo = mid;
      else hi = mid - 1;
    }
    const point = timeline[lo];
    return point.seconds + (((tick - point.tick) / division) * point.microseconds) / 1000000;
  };
  const notes = raw
    .map((note) => ({
      id: makeId(),
      pitch: note.pitch,
      start: time(note.start),
      duration: time(note.end) - time(note.start),
      velocity: note.velocity,
      channel: note.channel,
    }))
    .sort((a, b) => a.start - b.start || a.pitch - b.pitch);
  const duration = Math.max(time(lastTick), ...notes.map((note) => note.start + note.duration), 0);
  if (duration > 600) throw new Error('10분 이하의 MIDI 클립을 선택해주세요.');
  return { notes, duration };
}
export function cropMidi(sequence: MidiSequence, start: number, duration: number): MidiSequence {
  const end = start + duration;
  return {
    duration,
    notes: sequence.notes
      .filter((n) => n.start < end && n.start + n.duration > start)
      .map((n) => {
        const begin = Math.max(start, n.start);
        return {
          ...n,
          start: begin - start,
          duration: Math.min(end, n.start + n.duration) - begin,
        };
      }),
  };
}
export function encodeMidi(sequence: MidiSequence): Blob {
  if (
    !Number.isFinite(sequence.duration) ||
    sequence.duration < 0 ||
    sequence.duration > 600 ||
    sequence.notes.length > 2000
  )
    throw invalid();
  const events = [{ tick: 0, bytes: [255, 81, 3, 7, 161, 32] }];
  for (const n of sequence.notes) {
    if (
      ![n.pitch, n.velocity, n.channel].every(Number.isInteger) ||
      n.pitch < 0 ||
      n.pitch > 127 ||
      n.velocity < 1 ||
      n.velocity > 127 ||
      n.channel < 0 ||
      n.channel > 15 ||
      !Number.isFinite(n.start) ||
      !Number.isFinite(n.duration) ||
      n.start < 0 ||
      n.duration <= 0 ||
      n.start + n.duration > 600
    )
      throw invalid();
    events.push(
      { tick: Math.round(n.start * 960), bytes: [144 + n.channel, n.pitch, n.velocity] },
      {
        tick: Math.max(Math.round(n.start * 960) + 1, Math.round((n.start + n.duration) * 960)),
        bytes: [128 + n.channel, n.pitch, 0],
      },
    );
  }
  events.sort((a, b) => a.tick - b.tick || (a.bytes[0] >> 4) - (b.bytes[0] >> 4));
  const vlq = (value: number) => {
    const bytes = [value & 127];
    while ((value = Math.floor(value / 128))) bytes.unshift((value & 127) | 128);
    return bytes;
  };
  const track: number[] = [];
  let tick = 0;
  for (const event of events) {
    track.push(...vlq(event.tick - tick), ...event.bytes);
    tick = event.tick;
  }
  track.push(...vlq(Math.max(tick, Math.round(sequence.duration * 960)) - tick), 255, 47, 0);
  const bytes = new Uint8Array(22 + track.length),
    view = new DataView(bytes.buffer);
  bytes.set([77, 84, 104, 100, 0, 0, 0, 6, 0, 0, 0, 1, 1, 224, 77, 84, 114, 107]);
  view.setUint32(18, track.length);
  bytes.set(track, 22);
  return new Blob([bytes], { type: 'audio/midi' });
}
