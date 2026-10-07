import { drumStrikes } from './scoreExpression';
import { createGuitarToneRoute } from './guitarTone.web';
import {
  scorePerformance,
  scoreGracePerformance,
  cleanScoreConnections,
  noteTones,
  scoreInstrument,
  type Score,
  type ScoreNote,
} from './score';
import { scoreBackingSegment } from './scoreBacking';
import { samplePlaybackRate } from './samplePitch';
import {
  createSampleVoice,
  playbackSample,
  type PreparedPlaybackInstrument,
  type PreparedInstrumentSample,
} from './instrumentSample.web';

// Reserve accent headroom and average simultaneous voices instead of amplifying
// a chord. This changes level only, without compression or waveform shaping.
function sampleLevel(ghost: boolean | undefined, accent: boolean, voices: number) {
  return ((ghost ? 0.35 : 1) * (accent ? 1 : 0.8)) / voices;
}

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
  instrument?: PreparedPlaybackInstrument,
  voiceCount = noteTones(note).length,
  tailLimitSeconds = Infinity,
) {
  if (note.rest || note.blank) return;
  if (note.guitarTone && note.guitarTone !== 'clean') {
    destination = createGuitarToneRoute(
      context,
      destination,
      [{ beat: 0, tone: note.guitarTone }],
      start,
      0,
      Math.max(note.graceBeats ?? note.beats, remainingBeats),
      bpm,
    );
    note = { ...note, guitarTone: undefined };
  }
  if (note.graceBeats !== undefined) {
    const previewBeats = Math.min(note.graceBeats, (0.12 * bpm) / 60);
    note = { ...note, beats: previewBeats, graceBeats: undefined };
    remainingBeats = previewBeats;
  }
  if (
    (note.slideOut || note.slideIn || note.graceSlide) &&
    !note.staccato &&
    !noteTones(note).some((tone) => tone.dead)
  ) {
    scheduleScorePassage(
      context,
      destination,
      { title: '', bpm, parts: [note.part], notes: [note], sync: {} },
      note.part,
      start,
      note.beats - remainingBeats,
      note.beats,
      instrument,
    );
    return;
  }
  const tones = noteTones(note);
  const soundBeats = Math.max(
    0,
    note.beats * (note.staccato ? 0.45 : 1) - (note.beats - remainingBeats),
  );
  if (!tones.length || !soundBeats) return;
  const duration = (soundBeats * 60) / bpm;
  for (const tone of tones) {
    const sample = instrument ? playbackSample(instrument, tone.pitch) : undefined;
    if (
      sample?.percussion &&
      ['double', 'buzz', 'flam', 'drag', 'roll2', 'roll3'].includes(tone.drumTechnique ?? '')
    ) {
      const elapsed = note.beats - remainingBeats;
      for (const strike of drumStrikes(tone.drumTechnique, note.beats, bpm)) {
        const delay = ((strike.offset - elapsed) * 60) / bpm;
        if (delay < -1e-6 || delay >= tailLimitSeconds) continue;
        scheduleScoreNote(
          context,
          destination,
          {
            ...note,
            beats: strike.beats,
            playbackGain: (note.playbackGain ?? 1) * strike.gain,
            tones: [{ ...tone, drumTechnique: undefined }],
          },
          start + Math.max(0, delay),
          bpm,
          strike.beats,
          instrument,
          voiceCount,
          tailLimitSeconds - Math.max(0, delay),
        );
      }
      continue;
    }
    if (sample?.percussion && tone.drumTechnique === 'rimshot' && remainingBeats === note.beats)
      scheduleScoreNote(
        context,
        destination,
        {
          ...note,
          playbackGain: (note.playbackGain ?? 1) * 0.32,
          tones: [{ ...tone, pitch: 37, drumTechnique: undefined }],
        },
        start,
        bpm,
        remainingBeats,
        instrument,
        voiceCount,
        tailLimitSeconds,
      );
    const expressionGain = (note.playbackGain ?? 1) * (note.marcato ? 1.4 : 1);
    const short = note.staccato || tone.drumTechnique === 'choke';
    const toneDuration =
      tone.drumTechnique === 'choke'
        ? (Math.max(0, note.beats * 0.45 - (note.beats - remainingBeats)) * 60) / bpm
        : duration;
    if (!toneDuration) continue;
    if (tone.dead) {
      // A muted string is a brief, unpitched attack; its rhythmic slot stays unchanged.
      const hitDuration = Math.min(0.065, (note.beats * (note.staccato ? 0.45 : 1) * 60) / bpm);
      const elapsed = ((note.beats - remainingBeats) * 60) / bpm;
      if (elapsed >= hitDuration) continue;
      const buffer = context.createBuffer(
        1,
        Math.max(1, Math.ceil(hitDuration * context.sampleRate)),
        context.sampleRate,
      );
      const samples = buffer.getChannelData(0);
      let seed = 1729 + tone.pitch;
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
      gain.gain.value =
        (0.45 * expressionGain * (note.accent ? 1.25 : 1)) /
        (sample ? voiceCount : Math.sqrt(voiceCount));
      source.connect(filter).connect(gain).connect(destination);
      source.start(start, elapsed, hitDuration - elapsed);
      source.onended = () => {
        source.disconnect();
        filter.disconnect();
        gain.disconnect();
      };
      continue;
    }

    const level =
      (0.12 * expressionGain * (tone.ghost ? 0.35 : 1) * (note.accent ? 1.25 : 1)) /
      Math.sqrt(voiceCount);

    if (sample) {
      const rate = samplePlaybackRate(tone.pitch, sample.rootMidi);
      const offset = sampleOffset(sample, ((note.beats - remainingBeats) * 60 * rate) / bpm);
      if (offset === null) continue;
      const source = createSampleVoice(context, sample);
      const gain = context.createGain();
      source.playbackRate.value = rate;
      let audible = sample.sustain
        ? duration
        : Math.min(
            sample.percussion && !short ? tailLimitSeconds : toneDuration,
            (sample.buffer.duration - offset) / rate,
          );
      if (tone.drumTechnique === 'half-open') audible = Math.min(audible, 0.18);
      const implement =
        sample.percussion && tone.pitch > 36 && tone.pitch !== 44
          ? note.percussionImplement
          : 'sticks';
      const attack = Math.min(
        implement === 'brushes'
          ? 0.012
          : implement === 'mallets'
            ? 0.018
            : sample.percussion
              ? 0.0005
              : 0.004,
        audible / 4,
      );
      const amplitude =
        (sample.percussion
          ? (tone.ghost ? 0.35 : 1) * (note.accent ? 0.78 : 0.62)
          : sampleLevel(tone.ghost, note.accent, voiceCount)) *
        (sample.playbackGain ?? 1) *
        expressionGain *
        (implement === 'brushes' ? 0.65 : implement === 'mallets' ? 0.8 : 1);
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(amplitude, start + attack);
      gain.gain.setValueAtTime(amplitude, start + audible - Math.min(0.025, audible / 4));
      gain.gain.linearRampToValueAtTime(0, start + audible);
      let filter: BiquadFilterNode | undefined;
      if (implement === 'brushes' || implement === 'mallets') {
        filter = context.createBiquadFilter();
        filter.type = implement === 'brushes' ? 'highpass' : 'lowpass';
        filter.frequency.value = implement === 'brushes' ? 700 : 1100;
        source.connect(filter).connect(gain).connect(destination);
      } else source.connect(gain).connect(destination);
      source.start(start, offset);
      source.stop(start + audible);
      source.onended = () => {
        source.disconnect();
        filter?.disconnect();
        gain.disconnect();
      };
      continue;
    }
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = 'triangle';
    oscillator.frequency.value = 440 * Math.pow(2, (tone.pitch - 69) / 12);
    // Keep a clear body through the note instead of fading almost to silence
    // immediately. The old envelope made bass notes especially hard to hear.
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(level, start + Math.min(0.005, duration / 4));
    gain.gain.exponentialRampToValueAtTime(level * 0.6, start + duration * 0.8);
    gain.gain.linearRampToValueAtTime(0, start + duration);
    oscillator.connect(gain).connect(destination);
    oscillator.start(start);
    oscillator.stop(start + duration);
    oscillator.onended = () => {
      oscillator.disconnect();
      gain.disconnect();
    };
  }
}

type PlaybackNote = ScoreNote & { voiceCount: number };

// Build each string's voice independently, so a parenthesized continuation can
// sustain while other notes in the chord are plucked again. Never change notation.
function passageVoices(notes: ScoreNote[], percussion = false) {
  const voices: { start: number; chain: PlaybackNote[] }[] = [];
  let previous: typeof voices = [];
  let at = 0;
  for (const note of notes) {
    const tones = noteTones(note)
      .slice()
      .sort((a, b) => a.pitch - b.pitch);
    const current: typeof voices = [];
    const used = new Set<(typeof voices)[number]>();
    if (!note.rest && !note.blank)
      tones.forEach((tone, index) => {
        const priorNote = previous[index]?.chain.at(-1);
        const linked =
          priorNote?.connection?.targetId === note.id &&
          priorNote.connection.type !== 'glissando' &&
          !note.staccato &&
          !priorNote.staccato &&
          !tone.dead &&
          !noteTones(priorNote).some((t) => t.dead);
        const continuation =
          !percussion &&
          !linked &&
          tone.ghost &&
          !tone.dead &&
          !note.staccato &&
          !note.graceSlide &&
          !note.slideIn
            ? previous.find((voice) => {
                const last = voice.chain.at(-1)!;
                const prior = noteTones(last)[0];
                return (
                  !used.has(voice) &&
                  !last.staccato &&
                  !last.slideOut &&
                  !prior.dead &&
                  !last.connection &&
                  prior.pitch === tone.pitch &&
                  prior.string === tone.string
                );
              })
            : undefined;
        const voice = linked ? previous[index] : continuation;
        const last = voice?.chain.at(-1);
        const sustaining = tone.ghost && last && noteTones(last)[0].pitch === tone.pitch;
        const soundingTone = sustaining ? { ...tone, ghost: noteTones(last)[0].ghost } : tone;
        const sounding: PlaybackNote = {
          ...note,
          tones: [soundingTone],
          ghost: soundingTone.ghost,
          accent: sustaining ? last.accent : note.accent,
          voiceCount: sustaining ? last.voiceCount : tones.length,
        };
        if (voice) {
          voice.chain.push(sounding);
          used.add(voice);
          current.push(voice);
        } else {
          const created = { start: at, chain: [sounding] };
          voices.push(created);
          current.push(created);
        }
      });
    previous = current;
    at += note.beats;
  }
  return voices;
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
  instrument?: PreparedPlaybackInstrument,
) {
  const performance = scorePerformance(score, part);
  destination = createGuitarToneRoute(
    context,
    destination,
    Object.entries(score.guitarToneChanges?.[part] ?? {})
      .map(([beat, tone]) => ({ beat: performance.toPerformed(+beat), tone }))
      .sort((a, b) => a.beat - b.beat),
    start,
    startBeat,
    endBeat,
    score.bpm,
  );
  const notes = scoreGracePerformance(cleanScoreConnections(performance.score), part).notes.filter(
    (n) => n.part === part,
  );
  const seconds = 60 / score.bpm;
  const hz = (pitch: number) => 440 * Math.pow(2, (pitch - 69) / 12);
  for (const { start: chainStart, chain } of passageVoices(
    notes,
    scoreInstrument(score, part).id === 'drums',
  )) {
    const length = chain.reduce((sum, n) => sum + n.beats, 0);
    const at = chainStart + length;
    if (at <= startBeat || chainStart >= endBeat) continue;
    const elapsed = Math.max(0, startBeat - chainStart);
    const when = start + Math.max(0, chainStart - startBeat) * seconds;
    if (
      chain.length === 1 &&
      chain[0].connection?.type !== 'glissando' &&
      !chain[0].slideOut &&
      !chain[0].slideIn &&
      !chain[0].graceSlide
    ) {
      scheduleScoreNote(
        context,
        destination,
        { ...chain[0], beats: Math.min(chain[0].beats, endBeat - chainStart) },
        when,
        score.bpm,
        Math.min(chain[0].beats - elapsed, endBeat - Math.max(startBeat, chainStart)),
        instrument,
        chain[0].voiceCount,
        (endBeat - Math.max(startBeat, chainStart)) * seconds,
      );
      continue;
    }
    const tones = noteTones(chain[0])
      .slice()
      .sort((a, b) => a.pitch - b.pitch);
    const duration = (Math.min(at, endBeat) - Math.max(startBeat, chainStart)) * seconds;
    tones.forEach((_, toneIndex) => {
      const sample = instrument ? playbackSample(instrument, tones[toneIndex].pitch) : undefined;
      const points: { beat: number; frequency: number; ramp: boolean }[] = [];
      let beat = 0;
      chain.forEach((note, index) => {
        const pitch = noteTones(note)
          .slice()
          .sort((a, b) => a.pitch - b.pitch)[toneIndex].pitch;
        if (note.slideIn) {
          points.push({
            beat,
            frequency: hz(Math.max(0, Math.min(127, pitch + (note.slideIn === 'up' ? -7 : 7)))),
            ramp: false,
          });
          points.push({
            beat: beat + Math.min(note.beats / 4, 0.12 / seconds),
            frequency: hz(pitch),
            ramp: true,
          });
        } else if (note.graceSlide) {
          points.push({ beat, frequency: hz(note.graceSlide.pitch), ramp: false });
          points.push({
            beat: beat + Math.min(note.beats / 4, 0.12 / seconds),
            frequency: hz(pitch),
            ramp: true,
          });
        } else
          points.push({
            beat,
            frequency: hz(pitch),
            ramp:
              index > 0 && ['slide', 'glissando'].includes(chain[index - 1].connection?.type ?? ''),
          });
        if (['slide', 'glissando'].includes(note.connection?.type ?? ''))
          points.push({
            beat: beat + note.beats - Math.min(note.beats / 2, 0.15 / seconds),
            frequency: hz(pitch),
            ramp: false,
          });
        // A shift slide reaches the target pitch, then starts a fresh voice there.
        if (note.connection?.type === 'glissando') {
          const target = notes.find((n) => n.id === note.connection!.targetId);
          if (target)
            points.push({ beat: beat + note.beats, frequency: hz(target.pitch), ramp: true });
        }
        if (note.slideOut) {
          // Indeterminate guitar slide-out: glide seven semitones in the final
          // half of the note (at most 200 ms), then end on the written beat.
          points.push({
            beat: beat + note.beats - Math.min(note.beats / 2, 0.2 / seconds),
            frequency: hz(pitch),
            ramp: false,
          });
          points.push({
            beat: beat + note.beats,
            frequency: hz(Math.max(0, Math.min(127, pitch + (note.slideOut === 'up' ? 7 : -7)))),
            ramp: true,
          });
        }
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
        (p) => p.beat > elapsed && p.beat <= elapsed + duration / seconds,
      )) {
        const time = when + (p.beat - elapsed) * seconds;
        if (p.ramp) parameter.linearRampToValueAtTime(convert(p.frequency), time);
        else parameter.setValueAtTime(convert(p.frequency), time);
      }
      const cutoff = elapsed + duration / seconds;
      const afterCutoff = points.findIndex((p) => p.beat > cutoff);
      if (afterCutoff > 0 && points[afterCutoff].ramp) {
        const left = points[afterCutoff - 1],
          right = points[afterCutoff];
        const value =
          left.frequency +
          ((right.frequency - left.frequency) * (cutoff - left.beat)) / (right.beat - left.beat);
        parameter.linearRampToValueAtTime(convert(value), when + duration);
      }
      let offset = 0;
      const active =
        chain.find((n) => {
          offset += n.beats;
          return offset > elapsed;
        }) ?? chain[0];
      const levelFor = (n: PlaybackNote) => {
        const ghost = noteTones(n)
          .slice()
          .sort((a, b) => a.pitch - b.pitch)[toneIndex]?.ghost;
        return (
          (n.playbackGain ?? 1) *
          (n.marcato ? 1.4 : 1) *
          (sample
            ? sampleLevel(ghost, n.accent, n.voiceCount) * (sample.playbackGain ?? 1)
            : (0.12 * (ghost ? 0.35 : 1) * (n.accent ? 1.25 : 1)) / Math.sqrt(n.voiceCount))
        );
      };
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
