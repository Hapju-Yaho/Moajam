import { cleanScoreConnections, noteTones, type Score, type ScoreNote } from './score';
import { scoreBackingSegment } from './scoreBacking';
import { samplePlaybackRate } from './samplePitch';
import { createSampleVoice, type PreparedInstrumentSample } from './instrumentSample.web';

function sampleOffset(sample: PreparedInstrumentSample, consumed: number) {
  if (sample.sustain && consumed >= sample.loopEnd)
    return sample.loopStart + ((consumed - sample.loopStart) % (sample.loopEnd - sample.loopStart));
  return consumed < sample.buffer.duration ? consumed : null;
}

export function scheduleScoreBacking(
  context: BaseAudioContext,
  destination: AudioNode,
  buffer: AudioBuffer,
  when: number,
  startBeat: number,
  endBeat: number,
  bpm: number,
  offset: number,
) {
  const segment = scoreBackingSegment(startBeat, endBeat, bpm, offset, buffer.duration);
  if (!segment) return null;
  const source = context.createBufferSource();
  source.buffer = buffer;
  source.connect(destination);
  source.start(when + segment.delay, segment.offset, segment.duration);
  source.onended = () => source.disconnect();
  return source;
}

export function scheduleScoreNote(
  context: BaseAudioContext,
  destination: AudioNode,
  note: ScoreNote,
  start: number,
  bpm: number,
  remainingBeats = note.beats,
  sample?: PreparedInstrumentSample,
) {
  if (note.rest || note.blank) return;
  const tones = noteTones(note);
  const soundBeats = Math.max(
    0,
    note.beats * (note.staccato ? 0.45 : 1) - (note.beats - remainingBeats),
  );
  if (!tones.length || !soundBeats) return;
  if (note.dead) {
    // A muted string is a brief, unpitched attack; its rhythmic slot stays unchanged.
    const hitDuration = Math.min(0.065, (note.beats * (note.staccato ? 0.45 : 1) * 60) / bpm);
    const elapsed = ((note.beats - remainingBeats) * 60) / bpm;
    if (elapsed >= hitDuration) return;
    const buffer = context.createBuffer(
      1,
      Math.max(1, Math.ceil(hitDuration * context.sampleRate)),
      context.sampleRate,
    );
    const samples = buffer.getChannelData(0);
    let seed = 1729;
    for (let i = 0; i < samples.length; i++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      const progress = i / samples.length;
      samples[i] =
        (seed / 0x80000000 - 1) *
        Math.min(1, i / (context.sampleRate * 0.002)) *
        Math.pow(1 - progress, 3);
    }
    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    source.buffer = buffer;
    filter.type = 'bandpass';
    filter.frequency.value = 900;
    filter.Q.value = 0.65;
    gain.gain.value = 0.45 * (note.accent ? 1.25 : 1);
    source.connect(filter).connect(gain).connect(destination);
    source.start(start, elapsed, hitDuration - elapsed);
    source.onended = () => {
      source.disconnect();
      filter.disconnect();
      gain.disconnect();
    };
    return;
  }
  const duration = (soundBeats * 60) / bpm;
  const level =
    (0.12 * (note.ghost ? 0.35 : 1) * (note.accent ? 1.25 : 1)) / Math.sqrt(tones.length);
  for (const tone of tones) {
    if (sample) {
      const rate = samplePlaybackRate(tone.pitch, sample.rootMidi);
      const offset = sampleOffset(sample, ((note.beats - remainingBeats) * 60 * rate) / bpm);
      if (offset === null) continue;
      const source = createSampleVoice(context, sample);
      const gain = context.createGain();
      source.playbackRate.value = rate;
      const audible = sample.sustain
        ? duration
        : Math.min(duration, (sample.buffer.duration - offset) / rate);
      const attack = Math.min(0.004, audible / 4);
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(level * 3, start + attack);
      gain.gain.setValueAtTime(level * 3, start + audible - Math.min(0.025, audible / 4));
      gain.gain.linearRampToValueAtTime(0, start + audible);
      source.connect(gain).connect(destination);
      source.start(start, offset);
      source.stop(start + audible);
      source.onended = () => {
        source.disconnect();
        gain.disconnect();
      };
      continue;
    }
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = 'triangle';
    oscillator.frequency.value = 440 * Math.pow(2, (tone.pitch - 69) / 12);
    gain.gain.setValueAtTime(level, start);
    gain.gain.exponentialRampToValueAtTime(0.001, start + duration * 0.95);
    oscillator.connect(gain).connect(destination);
    oscillator.start(start);
    oscillator.stop(start + duration);
    oscillator.onended = () => {
      oscillator.disconnect();
      gain.disconnect();
    };
  }
}

// Connected notes share oscillators: ties never re-attack, H/P change pitch without
// another pluck, and slides glide during the end of the source note.
export function scheduleScorePassage(
  context: BaseAudioContext,
  destination: AudioNode,
  score: Score,
  part: string,
  start: number,
  startBeat: number,
  endBeat: number,
  sample?: PreparedInstrumentSample,
) {
  const notes = cleanScoreConnections(score).notes.filter((n) => n.part === part);
  const seconds = 60 / score.bpm;
  const hz = (pitch: number) => 440 * Math.pow(2, (pitch - 69) / 12);
  let at = 0;
  for (let i = 0; i < notes.length; i++) {
    const chain = [notes[i]];
    while (notes[i].connection && notes[i + 1]?.id === notes[i].connection?.targetId)
      chain.push(notes[++i]);
    const length = chain.reduce((sum, n) => sum + n.beats, 0);
    const chainStart = at;
    at += length;
    if (at <= startBeat || chainStart >= endBeat) continue;
    const elapsed = Math.max(0, startBeat - chainStart);
    const when = start + Math.max(0, chainStart - startBeat) * seconds;
    if (chain.length === 1) {
      scheduleScoreNote(
        context,
        destination,
        chain[0],
        when,
        score.bpm,
        chain[0].beats - elapsed,
        sample,
      );
      continue;
    }
    const tones = noteTones(chain[0])
      .slice()
      .sort((a, b) => a.pitch - b.pitch);
    const duration = (Math.min(at, endBeat) - Math.max(startBeat, chainStart)) * seconds;
    tones.forEach((_, toneIndex) => {
      const points: { beat: number; frequency: number; ramp: boolean }[] = [];
      let beat = 0;
      chain.forEach((note, index) => {
        const pitch = noteTones(note)
          .slice()
          .sort((a, b) => a.pitch - b.pitch)[toneIndex].pitch;
        points.push({
          beat,
          frequency: hz(pitch),
          ramp: index > 0 && chain[index - 1].connection?.type === 'slide',
        });
        if (note.connection?.type === 'slide')
          points.push({
            beat: beat + note.beats - Math.min(note.beats / 2, 0.15 / seconds),
            frequency: hz(pitch),
            ramp: false,
          });
        beat += note.beats;
      });
      const before = points.filter((p) => p.beat <= elapsed).length - 1;
      const left = points[Math.max(0, before)],
        right = points[before + 1];
      const frequency = right?.ramp
        ? left.frequency +
          ((right.frequency - left.frequency) * (elapsed - left.beat)) / (right.beat - left.beat)
        : left.frequency;
      const voice = sample ? createSampleVoice(context, sample) : context.createOscillator();
      const gain = context.createGain();
      const parameter = 'playbackRate' in voice ? voice.playbackRate : voice.frequency;
      const convert = (value: number) => (sample ? value / hz(sample.rootMidi) : value);
      if ('type' in voice) voice.type = 'triangle';
      parameter.setValueAtTime(convert(frequency), when);
      for (const p of points.filter(
        (p) => p.beat > elapsed && p.beat < elapsed + duration / seconds,
      )) {
        const time = when + (p.beat - elapsed) * seconds;
        if (p.ramp) parameter.linearRampToValueAtTime(convert(p.frequency), time);
        else parameter.setValueAtTime(convert(p.frequency), time);
      }
      let offset = 0;
      const active =
        chain.find((n) => {
          offset += n.beats;
          return offset > elapsed;
        }) ?? chain[0];
      const levelFor = (n: ScoreNote) =>
        ((sample ? 0.36 : 0.12) * (n.ghost ? 0.35 : 1) * (n.accent ? 1.25 : 1)) /
        Math.sqrt(tones.length);
      let level = levelFor(active);
      gain.gain.setValueAtTime(sample ? 0 : level, when);
      if (sample) gain.gain.linearRampToValueAtTime(level, when + Math.min(0.004, duration / 4));
      let boundary = 0;
      for (const n of chain) {
        if (boundary > elapsed && boundary < elapsed + duration / seconds) {
          const time = when + (boundary - elapsed) * seconds;
          gain.gain.setValueAtTime(level, time);
          level = levelFor(n);
          gain.gain.linearRampToValueAtTime(level, time + Math.min(0.003, (n.beats * seconds) / 8));
        }
        boundary += n.beats;
      }
      gain.gain.setValueAtTime(level, when + Math.max(0, duration - Math.min(0.025, duration / 4)));
      gain.gain.linearRampToValueAtTime(0, when + duration);
      voice.connect(gain).connect(destination);
      if (sample && 'playbackRate' in voice) {
        let consumed = 0;
        for (let index = 0; index < points.length; index++) {
          const point = points[index],
            next = points[index + 1];
          const end = Math.min(elapsed, next?.beat ?? elapsed);
          if (end <= point.beat) break;
          const rightFrequency = next?.ramp
            ? point.frequency +
              (next.frequency - point.frequency) * ((end - point.beat) / (next.beat - point.beat))
            : point.frequency;
          consumed +=
            (end - point.beat) * seconds * convert((point.frequency + rightFrequency) / 2);
        }
        const offset = sampleOffset(sample, consumed);
        if (offset === null) {
          voice.disconnect();
          gain.disconnect();
          return;
        }
        voice.start(when, offset);
      } else voice.start(when);
      voice.stop(when + duration);
      voice.onended = () => {
        voice.disconnect();
        gain.disconnect();
      };
    });
  }
}

export function createScoreOutput(context: BaseAudioContext, volume: number) {
  const input = context.createGain();
  const clamp = (value: number) => (Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0.8);
  input.gain.value = clamp(volume);
  input.connect(context.destination);
  return {
    input,
    setVolume(value: number) {
      input.gain.cancelScheduledValues(context.currentTime);
      input.gain.setTargetAtTime(clamp(value), context.currentTime, 0.01);
    },
  };
}
