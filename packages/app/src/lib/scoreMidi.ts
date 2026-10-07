import { drumStrikes } from './scoreExpression';
import { guitarToneAt } from './scoreGuitar';
import {
  scorePerformance,
  cleanScoreConnections,
  noteTones,
  scoreBeat,
  scoreInstrument,
  scoreMeasureCount,
  scoreMeasureStart,
  scorePlaybackFrom,
  scoreTimeSignature,
  type Score,
  type ScoreNote,
  type ScoreTone,
} from './score';
import { ensemblePlaybackScore } from './scoreParts';
import { defaultSoundfontInstrument, type SoundfontInstrumentId } from './soundfontCatalog';

// General MIDI program numbers are zero-based on the wire.
const programs: Record<SoundfontInstrumentId, number> = {
  acoustic_guitar_nylon: 24,
  acoustic_guitar_steel: 25,
  electric_guitar_clean: 27,
  overdriven_guitar: 29,
  acoustic_bass: 32,
  electric_bass_finger: 33,
  electric_bass_pick: 34,
  slap_bass_1: 36,
  acoustic_grand_piano: 0,
  electric_piano_1: 4,
  string_ensemble_1: 48,
  choir_aahs: 52,
  synth_drum: 118,
  drum_kit: 0,
};
const PPQ = 960; // Exactly represents the score's 1/48-beat grid and triplets.
type Event = { tick: number; order: number; bytes: number[] };
type ToneEvent = { start: number; end: number; pitch: number; velocity: number };
const text = (value: string) => [...new TextEncoder().encode(value)];
function variable(value: number) {
  if (!Number.isSafeInteger(value) || value < 0 || value > 0x0fffffff)
    throw new Error('MIDI로 저장하기에는 악보의 재생 길이가 너무 길어요.');
  const bytes = [value & 127];
  while ((value = Math.floor(value / 128))) bytes.unshift((value & 127) | 128);
  return bytes;
}
const meta = (type: number, data: number[]) => [255, type, ...variable(data.length), ...data];
const u32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
function chunk(name: string, bytes: number[]) {
  return [...text(name), ...u32(bytes.length), ...bytes];
}
function track(events: Event[], end: number) {
  events.push({ tick: end, order: 100, bytes: meta(47, []) });
  events.sort((a, b) => a.tick - b.tick || a.order - b.order);
  const bytes: number[] = [];
  let previous = 0;
  for (const event of events) {
    bytes.push(...variable(event.tick - previous), ...event.bytes);
    previous = event.tick;
  }
  return chunk('MTrk', bytes);
}

/** Standard MIDI format 1: conductor track, then one track/channel per part. */
export function scoreToMidi(
  input: Score,
  selectedParts: string[] = input.parts,
): Uint8Array<ArrayBuffer> {
  const parts = [...new Set(selectedParts)].filter((part) => input.parts.includes(part));
  if (!parts.length) throw new Error('MIDI로 저장할 파트를 선택해주세요.');
  if (parts.length > 15)
    throw new Error(
      'MIDI는 한 파일에 최대 15개 파트를 저장할 수 있어요. 현재 파트로 나누어 저장해주세요.',
    );
  const tempo = Math.round(60000000 / input.bpm);
  if (!Number.isFinite(tempo) || tempo < 1 || tempo > 0xffffff)
    throw new Error('BPM을 확인해주세요.');
  let score = cleanScoreConnections(input);
  if (parts.length > 1) score = ensemblePlaybackScore(score, parts, parts[0]).score;
  // Empty/short parts still traverse every shared repeat and finish with the song.
  const lastBar = Math.max(...parts.map((part) => scoreMeasureCount(score, part)));
  const padding = parts.flatMap((part) => {
    const used = score.notes
      .filter((note) => note.part === part)
      .reduce((sum, note) => scoreBeat(sum + note.beats), 0);
    const end = scoreMeasureStart(score, part, lastBar);
    const notes: ScoreNote[] = [];
    for (let left = scoreBeat(end - used); left > 0; left = scoreBeat(left - Math.min(64, left)))
      notes.push({
        id: `midi-padding-${part}-${notes.length}`,
        part,
        pitch: 60,
        beats: Math.min(64, left),
        rest: true,
        blank: true,
        accent: false,
        chord: '',
        lyric: '',
      });
    return notes;
  });
  score = { ...score, notes: [...score.notes, ...padding] };
  let total = 0;
  const tracks = parts.map((part, index) => {
    const isDrums = scoreInstrument(score, part).id === 'drums';
    const channel = isDrums ? 9 : index < 9 ? index : index + 1; // Channel 10 is GM percussion.
    const instrument = score.playbackInstruments?.[part] as SoundfontInstrumentId | undefined;
    const program =
      (instrument && programs[instrument]) ??
      programs[defaultSoundfontInstrument(part, scoreInstrument(score, part).id)];
    const events: Event[] = [
      { tick: 0, order: -3, bytes: meta(3, text(part)) },
      { tick: 0, order: -2, bytes: [192 | channel, isDrums ? 0 : program] },
    ];
    const plan = scorePlaybackFrom(score, part);
    if (!isDrums && score.guitarToneChanges?.[part]) {
      const performance = scorePerformance(score, part);
      for (const segment of plan.segments) {
        const initial = guitarToneAt(score, part, performance.toWritten(segment.startBeat));
        const changes = [
          { beat: segment.startBeat, tone: initial },
          ...Object.entries(score.guitarToneChanges[part])
            .map(([beat, tone]) => ({ beat: performance.toPerformed(+beat), tone }))
            .filter((c) => c.beat > segment.startBeat && c.beat < segment.endBeat),
        ];
        for (const change of changes)
          events.push({
            tick: Math.round((segment.offset + change.beat - segment.startBeat) * PPQ),
            order: -1,
            bytes: [
              192 | channel,
              change.tone === 'overdrive' ? 29 : change.tone === 'distortion' ? 30 : program,
            ],
          });
      }
    }
    const end = Math.round((plan.endBeat - plan.startBeat) * PPQ);
    total = Math.max(total, end);
    const tones: ToneEvent[] = [];
    let previous: { note: ScoreNote; tone: ScoreTone; event: ToneEvent; end: number }[] = [];
    let segment = -1;
    for (const item of plan.events) {
      let currentSegment = Math.max(0, segment);
      while (
        currentSegment + 1 < plan.segments.length &&
        plan.segments[currentSegment + 1].offset <= item.offset + 1e-7
      )
        currentSegment++;
      if (currentSegment !== segment) previous = [];
      segment = currentSegment;
      const start = Math.round(item.offset * PPQ);
      const finish = Math.round((item.offset + item.beats) * PPQ);
      const { note } = item;
      if (note.lyric) events.push({ tick: start, order: -1, bytes: meta(5, text(note.lyric)) });
      if (note.rest || note.blank) {
        previous = [];
        continue;
      }
      const used = new Set<ToneEvent>();
      const current: typeof previous = [];
      for (const tone of noteTones(note)) {
        if (!Number.isInteger(tone.pitch) || tone.pitch < 0 || tone.pitch > 127)
          throw new Error('MIDI 음높이 범위를 벗어난 음표가 있어요.');
        if (
          isDrums &&
          ['double', 'buzz', 'flam', 'drag', 'roll2', 'roll3'].includes(tone.drumTechnique ?? '')
        ) {
          for (const strike of drumStrikes(tone.drumTechnique, item.beats, score.bpm)) {
            const at = start + Math.round(strike.offset * PPQ);
            tones.push({
              start: at,
              end: Math.max(at + 1, at + Math.round(strike.beats * PPQ * 0.8)),
              pitch: tone.pitch,
              velocity: Math.min(
                127,
                Math.round(
                  (tone.ghost ? 40 : 90) *
                    (note.accent ? 1.25 : 1) *
                    (note.marcato ? 1.4 : 1) *
                    (note.playbackGain ?? 1) *
                    strike.gain,
                ),
              ),
            });
          }
          continue;
        }
        const graceTicks = note.graceSlide
          ? Math.max(
              1,
              Math.min(
                Math.floor((finish - start) / 4),
                Math.round(((0.12 * score.bpm) / 60) * PPQ),
              ),
            )
          : 0;
        if (note.graceSlide)
          tones.push({
            start,
            end: start + graceTicks,
            pitch: note.graceSlide.pitch,
            velocity: 70,
          });
        const prior =
          note.graceSlide || note.slideIn
            ? undefined
            : previous.find(
                (p) =>
                  !used.has(p.event) &&
                  p.end === start &&
                  p.tone.pitch === tone.pitch &&
                  !p.tone.dead &&
                  !tone.dead &&
                  !p.note.staccato &&
                  !note.staccato &&
                  !p.note.slideOut &&
                  ((p.note.connection?.type === 'tie' && p.note.connection.targetId === note.id) ||
                    (!isDrums &&
                      !p.note.connection &&
                      tone.ghost &&
                      p.tone.string === tone.string)),
              );
        const duration = Math.min(
          finish - start,
          (finish - start) * (note.staccato || tone.drumTechnique === 'choke' ? 0.45 : 1),
          tone.dead ? ((PPQ * score.bpm) / 60) * 0.065 : Infinity,
          tone.drumTechnique === 'half-open' ? ((PPQ * score.bpm) / 60) * 0.18 : Infinity,
        );
        const event = prior?.event ?? {
          start: start + graceTicks,
          end: start + graceTicks,
          pitch: tone.pitch,
          velocity: Math.min(
            127,
            Math.round(
              (tone.ghost ? 40 : tone.dead ? 50 : 90) *
                (note.accent ? 1.25 : 1) *
                (note.marcato ? 1.4 : 1) *
                (note.playbackGain ?? 1),
            ),
          ),
        };
        event.end = Math.max(start + 1, start + Math.round(duration));
        if (!prior) {
          tones.push(event);
          if (isDrums && tone.drumTechnique === 'rimshot')
            tones.push({
              ...event,
              pitch: 37,
              velocity: Math.max(1, Math.round(event.velocity * 0.32)),
            });
        }
        used.add(event);
        current.push({ note, tone, event, end: finish });
      }
      previous = current;
    }
    // Unisons on different strings share one MIDI pitch/channel; union overlapping
    // voices so one string's note-off cannot silence another still-sounding string.
    const merged: ToneEvent[] = [];
    for (const tone of tones.sort((a, b) => a.pitch - b.pitch || a.start - b.start)) {
      const last = merged.at(-1);
      if (last?.pitch === tone.pitch && tone.start < last.end)
        last.end = Math.max(last.end, tone.end);
      else merged.push({ ...tone });
    }
    for (const tone of merged) {
      events.push({
        tick: tone.start,
        order: 1,
        bytes: [144 | channel, tone.pitch, tone.velocity],
      });
      events.push({ tick: tone.end, order: 0, bytes: [128 | channel, tone.pitch, 0] });
    }
    return track(events, end);
  });
  const meter = scoreTimeSignature(score);
  const conductor = track(
    [
      { tick: 0, order: 0, bytes: meta(3, text(score.title || '나의 악보')) },
      {
        tick: 0,
        order: 1,
        bytes: meta(81, [(tempo >> 16) & 255, (tempo >> 8) & 255, tempo & 255]),
      },
      { tick: 0, order: 2, bytes: meta(88, [meter.beats, Math.log2(meter.beatType), 24, 8]) },
      { tick: 0, order: 3, bytes: meta(89, [(score.keySignature ?? 0) & 255, 0]) },
    ],
    total,
  );
  return new Uint8Array([
    ...chunk('MThd', [0, 1, 0, tracks.length + 1, PPQ >> 8, PPQ & 255]),
    ...conductor,
    ...tracks.flat(),
  ]);
}
