import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Blob, Buffer } from 'node:buffer';
import { URL } from 'node:url';
import test from 'node:test';
import ts from 'typescript';

function moduleUrl(path) {
  const { outputText } = ts.transpileModule(readFileSync(path, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  });
  const linked = outputText.replace(
    /from ['"](.+?)['"]/g,
    (_, relative) => `from '${moduleUrl(new URL(relative + '.ts', path))}'`,
  );
  return `data:text/javascript;base64,${Buffer.from(linked).toString('base64')}`;
}
const { detectSamplePitch, samplePlaybackRate } = await import(
  moduleUrl(new URL('../packages/app/src/lib/samplePitch.ts', import.meta.url))
);
const {
  prepareSampleBuffer,
  importInstrumentSample,
  prepareInstrumentSample,
  inspectInstrumentSample,
  instrumentSampleGain,
} = await import(
  moduleUrl(new URL('../packages/app/src/lib/instrumentSample.web.ts', import.meta.url))
);
const { scheduleScoreNote, scheduleScorePassage, createScoreOutput } = await import(
  moduleUrl(new URL('../packages/app/src/lib/scoreAudio.web.ts', import.meta.url))
);
const { prepareSoundfontInstrument, soundfontMidi, normalizeSoundfontVolume } = await import(
  moduleUrl(new URL('../packages/app/src/lib/soundfont.web.ts', import.meta.url))
);
const { renameScorePart, removeScorePart } = await import(
  moduleUrl(new URL('../packages/app/src/lib/score.ts', import.meta.url))
);

function wave(frequency, rate = 44100, duration = 1, harmonics = false) {
  return Float32Array.from({ length: rate * duration }, (_, i) => {
    const angle = (2 * Math.PI * frequency * i) / rate;
    return (
      0.25 * Math.sin(angle) +
      (harmonics ? 0.45 * Math.sin(2 * angle) + 0.15 * Math.sin(3 * angle) : 0)
    );
  });
}
test('detects bass, guitar and treble roots across sample rates, including louder harmonics', () => {
  for (const rate of [22050, 44100, 48000]) {
    for (const midi of [28, 40, 57.18, 69, 84]) {
      const found = detectSamplePitch(wave(440 * 2 ** ((midi - 69) / 12), rate, 1, true), rate);
      assert.notEqual(found, null, `missing ${midi} at ${rate}`);
      assert.ok(Math.abs(found - midi) < 0.08, `${found} != ${midi}`);
    }
  }
});
test('silence, noise, very short recordings and unstable pitch require manual selection', () => {
  assert.equal(detectSamplePitch(new Float32Array(44100), 44100), null);
  assert.equal(detectSamplePitch(wave(440, 44100, 0.03), 44100), null);
  let seed = 71;
  const noise = Float32Array.from({ length: 44100 }, () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 0x80000000 - 1;
  });
  assert.equal(detectSamplePitch(noise, 44100), null);
  const sweep = Float32Array.from(
    { length: 44100 },
    (_, i) => 0.5 * Math.sin(2 * Math.PI * ((150 * i) / 44100 + 150 * (i / 44100) ** 2)),
  );
  assert.equal(detectSamplePitch(sweep, 44100), null);
});

test('short selected regions still detect guitar notes instead of leaving an unusable root', () => {
  for (const rate of [22050, 44100, 48000]) {
    for (const duration of [0.05, 0.1, 0.153]) {
      for (const midi of [40, 57, 69, 84]) {
        const found = detectSamplePitch(wave(440 * 2 ** ((midi - 69) / 12), rate, duration), rate);
        assert.notEqual(found, null, `${rate}Hz, ${duration}s, MIDI ${midi}`);
        assert.ok(Math.abs(found - midi) < 0.15, `${found} != ${midi}`);
      }
    }
  }
});
test('playback ratios transpose exact octaves and account for tuning', () => {
  assert.equal(samplePlaybackRate(72, 60), 2);
  assert.equal(samplePlaybackRate(48, 60), 0.5);
  assert.equal(samplePlaybackRate(60.2, 60.2), 1);
});

test('quiet plucked bass with silence and changing harmonic balance still detects its root', () => {
  for (const rate of [22050, 44100, 48000]) {
    const frequency = 440 * 2 ** ((28 - 69) / 12);
    const quiet = new Float32Array(rate * 6);
    quiet.set(
      wave(frequency, rate, 0.8).map((value) => value * 0.016),
      Math.round(rate * 1.2),
    );
    assert.ok(Math.abs(detectSamplePitch(quiet, rate) - 28) < 0.1);
    const pluck = Float32Array.from({ length: rate * 5 }, (_, i) => {
      const time = i / rate;
      const angle = 2 * Math.PI * frequency * time;
      return (
        0.15 * Math.exp(-3 * time) * Math.sin(4 * angle) +
        0.012 * Math.exp(-0.8 * time) * Math.sin(angle)
      );
    });
    const root = detectSamplePitch(pluck, rate);
    assert.notEqual(root, null);
    assert.ok(Math.abs(root - 28) < 0.2, `bass root ${root} at ${rate}`);
  }
});

function buffer(data, rate = 44100, opposite = false) {
  return {
    duration: data.length / rate,
    length: data.length,
    sampleRate: rate,
    numberOfChannels: opposite ? 2 : 1,
    getChannelData: (channel) => (channel === 1 ? data.map((v) => -v) : data),
  };
}
function fixture() {
  const voices = [],
    gains = [],
    oscillators = [],
    compressors = [];
  const parameter = () => ({
    value: 0,
    events: [],
    setValueAtTime(...values) {
      this.events.push(['set', ...values]);
    },
    linearRampToValueAtTime(...values) {
      this.events.push(['ramp', ...values]);
    },
    exponentialRampToValueAtTime(...values) {
      this.events.push(['exponential', ...values]);
    },
    cancelScheduledValues(...values) {
      this.events.push(['cancel', ...values]);
    },
    setTargetAtTime(...values) {
      this.events.push(['target', ...values]);
    },
  });
  const node = () => ({
    connect(destination) {
      this.destination = destination;
      return destination;
    },
    disconnect() {
      this.disconnected = true;
    },
  });
  const voice = () => ({
    ...node(),
    start(...args) {
      this.started = args;
    },
    stop(time) {
      this.stopped = time;
    },
  });
  const context = {
    currentTime: 2,
    destination: {},
    sampleRate: 44100,
    createBuffer: (channels, length, rate) => {
      const data = Array.from({ length: channels }, () => new Float32Array(length));
      return {
        ...buffer(data[0], rate),
        numberOfChannels: channels,
        getChannelData: (channel) => data[channel],
      };
    },
    createBufferSource() {
      const source = { ...voice(), playbackRate: parameter() };
      voices.push(source);
      return source;
    },
    createOscillator() {
      const source = { ...voice(), frequency: parameter() };
      oscillators.push(source);
      return source;
    },
    createGain() {
      const gain = { ...node(), gain: parameter() };
      gains.push(gain);
      return gain;
    },
    createBiquadFilter: () => ({ ...node(), frequency: parameter(), Q: parameter() }),
    createWaveShaper: () => node(),
    createDynamicsCompressor() {
      const compressor = {
        ...node(),
        threshold: parameter(),
        knee: parameter(),
        ratio: parameter(),
        attack: parameter(),
        release: parameter(),
      };
      compressors.push(compressor);
      return compressor;
    },
  };
  const sample = {
    buffer: buffer(wave(261.626)),
    rootMidi: 60,
    sustain: false,
    loopStart: 0.3,
    loopEnd: 0.8,
  };
  return { context, voices, gains, oscillators, compressors, sample };
}

test('score and backing apply only independent volume and mute without output amplification', () => {
  const f = fixture();
  const scoreOutput = createScoreOutput(f.context, 0.8);
  const backingOutput = createScoreOutput(f.context, 0.4);
  assert.equal(scoreOutput.input.gain.value, 0.8);
  assert.equal(backingOutput.input.gain.value, 0.4);
  assert.equal(scoreOutput.input.destination, backingOutput.input.destination);
  assert.equal(f.compressors.length, 0);
  assert.equal(scoreOutput.input.destination, f.context.destination);
  assert.equal(f.gains.length, 2, 'no hidden boost after the two volume controls');
  scoreOutput.setVolume(0);
  assert.equal(scoreOutput.input.gain.events.at(-1)[1], 0);
  assert.equal(backingOutput.input.gain.value, 0.4);
  scoreOutput.setVolume(8);
  assert.equal(scoreOutput.input.gain.events.at(-1)[1], 1);
  const other = fixture();
  assert.notEqual(
    createScoreOutput(other.context, 1).input.destination,
    scoreOutput.input.destination,
  );
});
const note = (changes = {}) => ({
  id: 'a',
  part: 'Guitar',
  pitch: 60,
  beats: 1,
  rest: false,
  accent: false,
  chord: '',
  lyric: '',
  ...changes,
});
const score = (notes) => ({ title: '', bpm: 120, notes, parts: ['Guitar'], sync: {} });

test('basic bass and guitar keep an audible body and release to silence at the note end', () => {
  for (const pitch of [28, 64]) {
    const f = fixture();
    scheduleScoreNote(f.context, {}, note({ pitch }), 0, 120);
    const events = f.gains[0].gain.events;
    const attack = events.find(([kind, value]) => kind === 'ramp' && value > 0);
    const body = events.find(([kind]) => kind === 'exponential');
    assert.ok(attack[2] > 0 && attack[2] <= 0.01);
    assert.ok(body[1] >= attack[1] * 0.5, 'the body must not immediately fade almost to silence');
    assert.ok(body[2] >= 0.35);
    assert.deepEqual(events.at(-1), ['ramp', 0, 0.5]);
    assert.equal(f.oscillators[0].stopped, 0.5);
  }
});

test('preparation trims silence while preserving original levels and stereo channels', () => {
  const { context } = fixture();
  const data = new Float32Array(88200);
  data.set(wave(220), 22050);
  const prepared = prepareSampleBuffer(context, buffer(data, 44100, true));
  assert.ok(prepared.duration > 0.99 && prepared.duration < 1.02);
  const values = prepared.getChannelData(0);
  assert.equal(Math.abs(values[0]), 0);
  assert.equal(Math.abs(values.at(-1)), 0);
  assert.equal(prepared.numberOfChannels, 2);
  assert.ok(values.some((v) => Math.abs(v) > 0.24));
  assert.ok(values.every((v) => Math.abs(v) <= 0.25));
  const right = prepared.getChannelData(1);
  for (let i = 0; i < values.length; i++) assert.equal(Math.abs(values[i] + right[i]), 0);
  assert.ok(Math.abs(detectSamplePitch(values, 44100) - 57) < 0.03);
  assert.throws(() => prepareSampleBuffer(context, buffer(new Float32Array(44100))), /소리를 찾지/);
  assert.throws(() => prepareSampleBuffer(context, buffer(new Float32Array(44100 * 16))), /15초/);
});

test('quiet and loud recordings retain their level ratio and unmodified interior samples', () => {
  const { context } = fixture();
  for (const scale of [0.04, 1, 3.8]) {
    const data = wave(110).map((value) => value * scale);
    const prepared = prepareSampleBuffer(context, buffer(data), { trimStart: 0.2, trimEnd: 0.8 });
    const output = prepared.getChannelData(0);
    for (let i = 200; i < output.length - 200; i++) assert.equal(output[i], data[8820 + i]);
  }
});

test('recording gain doubles quiet audio and respects the loudest stereo channel without changing PCM', () => {
  const { context } = fixture();
  const audio = context.createBuffer(2, 4, 44100);
  audio.getChannelData(0).set([0, 0.1, -0.2, 0.05]);
  audio.getChannelData(1).set([0, -0.05, 0.1, -0.025]);
  const originals = [0, 1].map((channel) => audio.getChannelData(channel).slice());
  assert.equal(instrumentSampleGain(audio), 2);
  for (const channel of [0, 1]) assert.deepEqual(audio.getChannelData(channel), originals[channel]);
  audio.getChannelData(1)[2] = 0.95;
  const gain = instrumentSampleGain(audio);
  assert.ok(gain < 1);
  assert.ok(Math.abs(audio.getChannelData(1)[2] * gain - 0.85) < 1e-8);
  assert.equal(instrumentSampleGain(buffer(new Float32Array(10))), 1);
});

test('recording boost reaches single notes and tied chords while preserving articulation and peak headroom', () => {
  for (const count of [1, 6]) {
    for (const tied of [false, true]) {
      for (const accent of [false, true]) {
        const f = fixture();
        const prepared = { ...f.sample, playbackGain: instrumentSampleGain(f.sample.buffer) };
        const tones = Array.from({ length: count }, (_, index) => ({
          pitch: 60 + index,
          string: index + 1,
          ghost: index === 1,
        }));
        const first = note({ tones, accent });
        if (tied) {
          first.connection = { type: 'tie', targetId: 'b' };
          scheduleScorePassage(
            f.context,
            {},
            score([first, note({ id: 'b', tones, accent })]),
            'Guitar',
            0,
            0,
            2,
            prepared,
          );
        } else scheduleScoreNote(f.context, {}, first, 0, 120, 1, prepared);
        assert.equal(f.voices.length, count);
        let combinedPeak = 0;
        f.gains.forEach((gain, index) => {
          const expected = (2 * (accent ? 1 : 0.8) * (index === 1 ? 0.35 : 1)) / count;
          const positive = gain.gain.events.filter((event) => event[1] > 0);
          assert.ok(positive.length > 0);
          assert.ok(positive.every((event) => Math.abs(event[1] - expected) < 1e-10));
          assert.equal(gain.gain.events.at(-1)[1], 0);
          combinedPeak += expected * 0.25;
        });
        assert.ok(combinedPeak <= 0.85);
      }
    }
  }
});

test('sample chords and tied chords keep combined voice gains within original full scale', () => {
  for (const count of [1, 2, 6]) {
    for (const accent of [false, true]) {
      for (const tied of [false, true]) {
        const f = fixture();
        const tones = Array.from({ length: count }, (_, index) => ({
          pitch: 60 + index,
          string: index + 1,
        }));
        const first = note({ tones, accent });
        if (tied) {
          first.connection = { type: 'tie', targetId: 'b' };
          scheduleScorePassage(
            f.context,
            {},
            score([first, note({ id: 'b', tones, accent })]),
            'Guitar',
            0,
            0,
            2,
            f.sample,
          );
        } else scheduleScoreNote(f.context, {}, first, 0, 120, 1, f.sample);
        assert.equal(f.voices.length, count);
        const combined = f.gains.reduce(
          (sum, gain) => sum + Math.max(...gain.gain.events.map((event) => event[1])),
          0,
        );
        assert.ok(combined > 0 && combined <= 1 + 1e-10, `combined gain ${combined}`);
      }
    }
  }
});
test('invalid file type, empty and oversized recordings fail before audio decoding', async () => {
  await assert.rejects(importInstrumentSample({ name: 'note.wav', size: 0 }), /비어/);
  await assert.rejects(
    importInstrumentSample({ name: 'note.wav', size: 11 * 1024 * 1024 }),
    /10MB/,
  );
  await assert.rejects(importInstrumentSample({ name: 'image.png', size: 10 }), /오디오/);
});
test('manual boundaries use original recording times and never include audio outside the region', () => {
  const { context } = fixture();
  const data = new Float32Array(44100 * 3);
  data.set(wave(220), 44100 / 2);
  data.set(wave(440), 44100 * 2);
  const original = buffer(data);
  const selected = prepareSampleBuffer(context, original, { trimStart: 2, trimEnd: 2.5 });
  assert.equal(selected.duration, 0.5);
  assert.ok(Math.abs(detectSamplePitch(selected.getChannelData(0), 44100) - 69) < 0.03);
  assert.equal(Math.abs(selected.getChannelData(0)[0]), 0);
  assert.equal(Math.abs(selected.getChannelData(0).at(-1)), 0);
  for (const [trimStart, trimEnd] of [
    [-1, 1],
    [1, 1],
    [1, 0.5],
    [0, 4],
    [0, 0.049],
    [NaN, 1],
  ])
    assert.throws(
      () => prepareSampleBuffer(context, original, { trimStart, trimEnd }),
      /재생 구간/,
    );
  assert.throws(
    () => prepareSampleBuffer(context, original, { trimStart: 0, trimEnd: 0.2 }),
    /악기 소리가 없/,
  );
  assert.ok(
    Math.abs(
      prepareSampleBuffer(context, original, { trimStart: 2, trimEnd: 2.05 }).duration - 0.05,
    ) <
      1 / 44100,
  );
});

test('changing sample regions reuses the original audio and keeps sustain loops inside the selection', async (t) => {
  let original = buffer(wave(220, 44100, 2));
  let decodes = 0;
  const previous = globalThis.OfflineAudioContext;
  globalThis.OfflineAudioContext = class {
    async decodeAudioData() {
      decodes++;
      return original;
    }
    createBuffer(_, length, rate) {
      return buffer(new Float32Array(length), rate);
    }
  };
  t.after(() => {
    if (previous === undefined) delete globalThis.OfflineAudioContext;
    else globalThis.OfflineAudioContext = previous;
  });
  const sample = { file: new Blob(['audio']), rootMidi: 57, sustain: false };
  const details = await inspectInstrumentSample(sample.file);
  assert.equal(details.duration, 2);
  assert.equal(details.peaks.length, 240);
  assert.ok((await prepareInstrumentSample(sample)).buffer.duration > 1.99);
  const cropped = await prepareInstrumentSample({ ...sample, trimStart: 0.4, trimEnd: 0.7 });
  assert.equal(cropped.buffer.duration, 0.3);
  assert.equal(cropped.playbackGain, 2);
  const longer = await prepareInstrumentSample({
    ...sample,
    trimStart: 1,
    trimEnd: 1.5,
    sustain: true,
  });
  assert.equal(longer.buffer.duration, 0.5);
  assert.ok(longer.loopStart >= 0 && longer.loopEnd <= 0.5 && longer.loopEnd > longer.loopStart);
  assert.equal(decodes, 1);
  const repaired = await prepareInstrumentSample({
    ...sample,
    rootMidi: 0.01,
    trimStart: 0.036,
    trimEnd: 0.189,
  });
  assert.ok(Math.abs(repaired.rootMidi - 57) < 0.03);
  const repairedPlayback = fixture();
  scheduleScoreNote(repairedPlayback.context, {}, note({ pitch: 64 }), 0, 120, 1, repaired);
  assert.ok(
    repairedPlayback.voices[0].stopped > 0.09,
    'selected audio must not shrink into a millisecond click',
  );
  const manual = await prepareInstrumentSample({ ...sample, rootMidi: 57.15, autoRoot: false });
  assert.equal(manual.rootMidi, 57.15, 'manual tuning is preserved');
  const automatic = await prepareInstrumentSample({ ...sample, rootMidi: 70, autoRoot: true });
  assert.ok(Math.abs(automatic.rootMidi - 57) < 0.03);
  const f = fixture();
  scheduleScoreNote(f.context, {}, note({ pitch: 57, beats: 8 }), 0, 120, 8, cropped);
  assert.ok(f.voices[0].stopped <= 0.33);
  await assert.rejects(prepareInstrumentSample({ ...sample, trimStart: 0 }), /모두/);
  original = buffer(wave(35, 44100, 2));
  const lowShort = await prepareInstrumentSample({
    ...sample,
    file: new Blob(['low']),
    trimStart: 0.014,
    trimEnd: 0.064,
    sustain: true,
  });
  assert.ok(lowShort.loopEnd > lowShort.loopStart, 'short bass loops cannot have zero length');
  original = buffer(
    Float32Array.from(
      { length: 44100 },
      (_, i) => 0.5 * Math.sin(2 * Math.PI * ((150 * i) / 44100 + 150 * (i / 44100) ** 2)),
    ),
  );
  await assert.rejects(
    prepareInstrumentSample({ ...sample, file: new Blob(['unstable']), autoRoot: true }),
    /기준 음을 찾지/,
  );
});
test('sample chords preserve note timing, articulation and release; rests stay silent', () => {
  const f = fixture();
  scheduleScoreNote(
    f.context,
    {},
    note({ tones: [{ pitch: 60 }, { pitch: 72 }], staccato: true }),
    2,
    120,
    1,
    f.sample,
  );
  assert.equal(f.oscillators.length, 0);
  assert.equal(f.voices.length, 2);
  assert.deepEqual(
    f.voices.map((v) => v.playbackRate.value),
    [1, 2],
  );
  assert.deepEqual(
    f.voices.map((v) => v.stopped),
    [2.225, 2.225],
  );
  assert.equal(f.gains[0].gain.events.at(-1)[1], 0);
  f.voices[0].onended();
  assert.ok(f.voices[0].disconnected && f.gains[0].disconnected);
  scheduleScoreNote(f.context, {}, note({ rest: true }), 4, 120, 1, f.sample);
  scheduleScoreNote(f.context, {}, note({ blank: true }), 4, 120, 1, f.sample);
  assert.equal(f.voices.length, 2);
});
test('natural decay stops at the sample end while sustain holds the full note', () => {
  const f = fixture();
  scheduleScoreNote(f.context, {}, note({ pitch: 72, beats: 8 }), 0, 120, 8, f.sample);
  assert.equal(f.voices[0].stopped, 0.5);
  scheduleScoreNote(f.context, {}, note({ pitch: 72, beats: 8 }), 0, 120, 8, {
    ...f.sample,
    sustain: true,
  });
  assert.equal(f.voices[1].stopped, 4);
  assert.equal(f.voices[1].loop, true);
  assert.equal(f.voices[1].loopStart, 0.3);
});
test('seeking skips exhausted natural samples and resumes inside the sustain loop', () => {
  const f = fixture();
  scheduleScoreNote(f.context, {}, note({ beats: 8 }), 0, 120, 1, f.sample);
  assert.equal(f.voices.length, 0);
  scheduleScoreNote(f.context, {}, note({ beats: 8 }), 0, 120, 1, { ...f.sample, sustain: true });
  assert.ok(Math.abs(f.voices[0].started[1] - 0.5) < 1e-10);
  assert.equal(f.voices[0].stopped, 0.5);
});
test('ties use one sample voice; slides automate playback rate without retriggering', () => {
  const f = fixture();
  const tied = score([note({ connection: { type: 'tie', targetId: 'b' } }), note({ id: 'b' })]);
  scheduleScorePassage(f.context, {}, tied, 'Guitar', 0, 0, 2, { ...f.sample, sustain: true });
  assert.equal(f.voices.length, 1);
  assert.equal(f.voices[0].stopped, 1);
  const sliding = score([
    note({ tones: [{ pitch: 60, string: 1 }], connection: { type: 'slide', targetId: 'b' } }),
    note({ id: 'b', pitch: 72, tones: [{ pitch: 72, string: 1 }] }),
  ]);
  scheduleScorePassage(f.context, {}, sliding, 'Guitar', 0, 0, 2, { ...f.sample, sustain: true });
  assert.equal(f.voices.length, 2);
  assert.ok(
    f.voices[1].playbackRate.events.some(
      ([type, rate, time]) => type === 'ramp' && rate === 2 && time === 0.5,
    ),
  );
  scheduleScorePassage(f.context, {}, sliding, 'Guitar', 0, 1, 2, { ...f.sample, sustain: true });
  assert.equal(f.voices[2].playbackRate.events[0][1], 2);
  assert.ok(Math.abs(f.voices[2].started[1] - 0.575) < 1e-9);
});
test('basic tone fallback and dead-note percussion remain available', () => {
  const f = fixture();
  scheduleScoreNote(f.context, {}, note(), 0, 120);
  assert.equal(f.oscillators.length, 1);
  scheduleScoreNote(f.context, {}, note({ dead: true }), 0, 120, 1, f.sample);
  assert.equal(f.voices.length, 1);
  assert.notEqual(f.voices[0].buffer, f.sample.buffer);
});

test('same-pitch ghost notes sustain one voice at the original level, including seeking', () => {
  for (const sampled of [false, true]) {
    const f = fixture();
    const instrument = sampled ? { ...f.sample, sustain: true } : undefined;
    const source = score([note(), note({ id: 'b', ghost: true }), note({ id: 'c', ghost: true })]);
    const original = JSON.parse(JSON.stringify(source));
    scheduleScorePassage(f.context, {}, source, 'Guitar', 0, 0, 3, instrument);
    const voices = sampled ? f.voices : f.oscillators;
    assert.equal(voices.length, 1, 'no new attack at either parenthesized note');
    assert.equal(voices[0].stopped, 1.5);
    const levels = f.gains[0].gain.events.filter((event) => event[1] > 0).map((event) => event[1]);
    assert.ok(levels.every((level) => Math.abs(level - (sampled ? 0.8 : 0.12)) < 1e-10));
    scheduleScorePassage(f.context, {}, source, 'Guitar', 0, 1.5, 2.5, instrument);
    assert.equal(voices[1].stopped, 0.5, 'range playback respects the selected end');
    if (sampled) assert.equal(voices[1].started[1], 0.75, 'seek continues the existing sample');
    assert.deepEqual(source, original, 'playback must not alter the score');
  }
});

test('ghost continuation is per string while the other chord voices retrigger', () => {
  const f = fixture();
  const source = score([
    note({
      tones: [
        { pitch: 60, string: 2 },
        { pitch: 64, string: 1 },
      ],
    }),
    note({
      id: 'b',
      tones: [
        { pitch: 60, string: 2, ghost: true },
        { pitch: 65, string: 1 },
      ],
    }),
  ]);
  scheduleScorePassage(f.context, {}, source, 'Guitar', 0, 0, 2, { ...f.sample, sustain: true });
  assert.equal(f.voices.length, 3);
  assert.deepEqual(
    f.voices.map((voice) => [voice.started[0], voice.stopped]),
    [
      [0, 1],
      [0, 0.5],
      [0.5, 1],
    ],
  );
  const levels = f.gains[0].gain.events.filter((event) => event[1] > 0).map((event) => event[1]);
  assert.ok(
    levels.every((level) => level === 0.4),
    'sustained chord tone retains its level',
  );
});

test('ghost drum hits retrigger instead of sustaining like ghost guitar notes', () => {
  const f = fixture();
  const source = score([note({ pitch: 38 }), note({ id: 'b', pitch: 38, ghost: true })]);
  source.instruments = { Guitar: 'drums' };
  scheduleScorePassage(f.context, {}, source, 'Guitar', 0, 0, 2, { ...f.sample, sustain: true });
  assert.equal(f.voices.length, 2);
  assert.ok(f.voices[1].started[0] > f.voices[0].started[0]);
});

test('different pitches or strings, rests, blanks and staccato do not create ghost continuations', () => {
  for (const variant of ['pitch', 'string', 'rest', 'blank', 'staccato', 'normal']) {
    const f = fixture();
    const first = note({ tones: [{ pitch: 60, string: 2 }], staccato: variant === 'staccato' });
    const next = note({
      id: 'b',
      tones: [
        {
          pitch: variant === 'pitch' ? 62 : 60,
          string: variant === 'string' ? 1 : 2,
          ghost: variant !== 'normal',
        },
      ],
    });
    const notes = [first];
    if (variant === 'rest' || variant === 'blank') notes.push(note({ id: 'gap', [variant]: true }));
    notes.push(next);
    scheduleScorePassage(f.context, {}, score(notes), 'Guitar', 0, 0, 4, {
      ...f.sample,
      sustain: true,
    });
    assert.equal(f.voices.length, 2, variant);
    assert.equal(f.voices[1].started[0], notes.length === 3 ? 1 : 0.5, variant);
  }
});

test('ghost chains retain soundfont selection and follow a preceding explicit slide', () => {
  const f = fixture();
  const source = score([
    note({ tones: [{ pitch: 60, string: 1 }], connection: { type: 'slide', targetId: 'b' } }),
    note({ id: 'b', tones: [{ pitch: 72, string: 1 }] }),
    note({ id: 'c', tones: [{ pitch: 72, string: 1, ghost: true }] }),
  ]);
  const bank = { kind: 'soundfont', samples: new Map([[60, { ...f.sample, sustain: true }]]) };
  scheduleScorePassage(f.context, {}, source, 'Guitar', 0, 0, 3, bank);
  assert.equal(f.voices.length, 1);
  assert.equal(f.voices[0].buffer, f.sample.buffer);
  assert.equal(f.voices[0].stopped, 1.5);
  assert.ok(f.voices[0].playbackRate.events.some(([kind, rate]) => kind === 'ramp' && rate === 2));
});

test('mixed chords keep normal, ghost and dead voices independent with and without samples', () => {
  for (const sampled of [false, true]) {
    const f = fixture();
    scheduleScoreNote(
      f.context,
      {},
      note({
        staccato: true,
        tones: [{ pitch: 60 }, { pitch: 64, ghost: true }, { pitch: 67, dead: true }],
      }),
      0,
      120,
      1,
      sampled ? f.sample : undefined,
    );
    const pitched = sampled ? f.voices.filter((v) => v.buffer === f.sample.buffer) : f.oscillators;
    const muted = f.voices.filter((v) => v.buffer !== f.sample.buffer);
    assert.equal(pitched.length, 2);
    assert.equal(muted.length, 1);
    assert.equal(pitched[0].stopped, 0.225);
    assert.equal(pitched[1].stopped, 0.225);
    const level = (gain) =>
      gain.gain.events.find(([kind, value]) => kind !== 'exponential' && value > 0)[1];
    assert.ok(Math.abs(level(f.gains[1]) / level(f.gains[0]) - 0.35) < 1e-10);
  }
});

test('soundfont selection follows part renames and removal', () => {
  const source = {
    ...score([]),
    parts: ['Guitar', 'Bass'],
    playbackInstruments: { Guitar: 'acoustic_guitar_steel', Bass: 'electric_bass_finger' },
  };
  const renamed = renameScorePart(source, 'Bass', '저음');
  assert.equal(renamed.playbackInstruments['저음'], 'electric_bass_finger');
  assert.equal(renamed.playbackInstruments.Bass, undefined);
  assert.deepEqual(removeScorePart(renamed, '저음').playbackInstruments, {
    Guitar: 'acoustic_guitar_steel',
  });
});

test('soundfont volume increases with one stereo-linked gain and keeps peak headroom', () => {
  const { context } = fixture();
  const audio = context.createBuffer(2, 4, 44100);
  audio.getChannelData(0).set([0, 0.1, -0.2, 0.05]);
  audio.getChannelData(1).set([0, -0.05, 0.1, -0.025]);
  normalizeSoundfontVolume(audio);
  assert.ok(Math.abs(audio.getChannelData(0)[2] + 0.85) < 1e-6);
  assert.ok(Math.abs(audio.getChannelData(0)[1] - 0.425) < 1e-6);
  assert.ok(Math.abs(audio.getChannelData(1)[2] - 0.425) < 1e-6);
  for (const channel of [0, 1])
    assert.ok(audio.getChannelData(channel).every((value) => Math.abs(value) < 0.851));
  const quiet = buffer(Float32Array.of(0, 0.001, -0.001));
  normalizeSoundfontVolume(quiet);
  assert.ok(Math.abs(quiet.getChannelData(0)[1] - 0.016) < 1e-6);
  const silence = buffer(new Float32Array(10));
  normalizeSoundfontVolume(silence);
  assert.ok(silence.getChannelData(0).every((value) => value === 0));
});

test('soundfont loader decodes only requested pitches, caches them and retries failed downloads', async (t) => {
  assert.equal(soundfontMidi('A0'), 21);
  assert.equal(soundfontMidi('Db4'), 61);
  const priorFetch = globalThis.fetch,
    priorContext = globalThis.OfflineAudioContext;
  let requests = 0,
    decodes = 0,
    fail = true;
  globalThis.fetch = async () => {
    requests++;
    if (fail) {
      fail = false;
      return { ok: false };
    }
    return {
      ok: true,
      json: async () => ({ C4: 'data:audio/mp3;base64,YQ==', C5: 'data:audio/mp3;base64,Yg==' }),
    };
  };
  globalThis.OfflineAudioContext = class {
    async decodeAudioData() {
      decodes++;
      return buffer(wave(220));
    }
  };
  t.after(() => {
    globalThis.fetch = priorFetch;
    if (priorContext === undefined) delete globalThis.OfflineAudioContext;
    else globalThis.OfflineAudioContext = priorContext;
  });
  await assert.rejects(prepareSoundfontInstrument('acoustic_guitar_steel', [60]), /불러오지/);
  const first = await prepareSoundfontInstrument('acoustic_guitar_steel', [60, 60]);
  assert.equal(first.samples.size, 1);
  const bank = await prepareSoundfontInstrument('acoustic_guitar_steel', [60, 72]);
  assert.equal(requests, 2);
  assert.equal(decodes, 2);
  const f = fixture();
  scheduleScoreNote(
    f.context,
    {},
    note({ tones: [{ pitch: 60 }, { pitch: 72 }] }),
    0,
    120,
    1,
    bank,
  );
  assert.deepEqual(
    f.voices.map((voice) => voice.playbackRate.value),
    [1, 1],
  );
  assert.notEqual(f.voices[0].buffer, f.voices[1].buffer);
  assert.equal(f.oscillators.length, 0);
  const tied = score([note({ connection: { type: 'tie', targetId: 'b' } }), note({ id: 'b' })]);
  scheduleScorePassage(f.context, {}, tied, 'Guitar', 0, 0, 2, bank);
  assert.equal(f.voices.length, 3);
  await assert.rejects(prepareSoundfontInstrument('../unknown', [60]), /악기를 다시/);
  assert.equal(requests, 2);
});

test('drum kit keeps kick level in chords and lets short hits decay, bounded by the passage', () => {
  const solo = fixture(),
    chord = fixture();
  const sample = { ...solo.sample, rootMidi: 36, percussion: true };
  scheduleScoreNote(solo.context, {}, note({ pitch: 36, beats: 0.25 }), 0, 120, 0.25, sample);
  scheduleScoreNote(
    chord.context,
    {},
    note({ pitch: 36, beats: 0.25, tones: [{ pitch: 36 }, { pitch: 42 }] }),
    0,
    120,
    0.25,
    sample,
  );
  assert.equal(solo.voices[0].stopped, sample.buffer.duration);
  assert.equal(solo.gains[0].gain.events[1][1], chord.gains[0].gain.events[1][1]);
  const bounded = fixture();
  scheduleScorePassage(
    bounded.context,
    {},
    {
      title: '',
      bpm: 120,
      parts: ['Drums'],
      sync: {},
      notes: [note({ part: 'Drums', pitch: 36, beats: 0.25 })],
    },
    'Drums',
    0,
    0,
    0.5,
    sample,
  );
  assert.equal(bounded.voices[0].stopped, 0.25);
  const unchanged = fixture();
  scheduleScoreNote(unchanged.context, {}, note({ pitch: 36, beats: 0.25 }), 0, 120, 0.25, {
    ...sample,
    percussion: undefined,
  });
  assert.equal(
    unchanged.voices[0].stopped,
    0.125,
    'ordinary samples and synth drum keep their envelope',
  );
});

test('acoustic-style kit has audible kick harmonics, balanced hats and smooth finite tails', async () => {
  const { synthesizeDrum } = await import(
    moduleUrl(new URL('../packages/app/src/lib/drumKit.web.ts', import.meta.url))
  );
  const rms = (values) =>
    Math.sqrt(values.reduce((sum, value) => sum + value * value, 0) / values.length);
  const kick = synthesizeDrum(36),
    hat = synthesizeDrum(42);
  assert.ok(rms(kick.subarray(0, 8820)) > rms(hat.subarray(0, 8820)) * 3);
  let filtered = 0,
    energy = 0;
  for (let i = 0; i < 8820; i++) {
    filtered += 0.014 * (kick[i] - filtered);
    energy += (kick[i] - filtered) ** 2;
  }
  assert.ok(Math.sqrt(energy / 8820) > 0.05, 'kick retains body above the deep-bass range');
  for (const pitch of [35, 36, 37, 38, 42, 44, 46, 49, 50, 51, 52, 53, 55, 56, 57]) {
    const data = synthesizeDrum(pitch);
    assert.ok(data.every((value) => Number.isFinite(value) && Math.abs(value) < 0.95));
    assert.equal(data[0], 0);
    assert.equal(Math.abs(data.at(-1)), 0);
    assert.ok(rms(data.subarray(data.length - 1000)) < 0.001);
  }
});

test('choke uses staccato length on its cymbal only; snare double and buzz retrigger', () => {
  const f = fixture();
  const sample = { ...f.sample, rootMidi: 49, percussion: true };
  const kick = { ...sample, rootMidi: 36 };
  const kit = {
    kind: 'soundfont',
    samples: new Map([
      [49, sample],
      [36, kick],
    ]),
  };
  scheduleScoreNote(
    f.context,
    {},
    note({ beats: 1, tones: [{ pitch: 49, drumTechnique: 'choke' }, { pitch: 36 }] }),
    0,
    120,
    1,
    kit,
  );
  assert.equal(f.voices[0].stopped, 0.225);
  assert.equal(f.voices[1].stopped, kick.buffer.duration);
  for (const [technique, count] of [
    ['double', 2],
    ['buzz', 4],
  ]) {
    const roll = fixture();
    scheduleScoreNote(
      roll.context,
      {},
      note({ beats: 1, tones: [{ pitch: 38, drumTechnique: technique }] }),
      0,
      120,
      1,
      { ...sample, rootMidi: 38 },
    );
    assert.equal(roll.voices.length, count);
    assert.deepEqual(
      roll.voices.map((v) => v.started[0]),
      Array.from({ length: count }, (_, i) => (i * 0.5) / count),
    );
  }
});
