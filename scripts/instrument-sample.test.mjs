import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Buffer } from 'node:buffer';
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
const { prepareSampleBuffer, importInstrumentSample } = await import(
  moduleUrl(new URL('../packages/app/src/lib/instrumentSample.web.ts', import.meta.url))
);
const { scheduleScoreNote, scheduleScorePassage } = await import(
  moduleUrl(new URL('../packages/app/src/lib/scoreAudio.web.ts', import.meta.url))
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
test('playback ratios transpose exact octaves and account for tuning', () => {
  assert.equal(samplePlaybackRate(72, 60), 2);
  assert.equal(samplePlaybackRate(48, 60), 0.5);
  assert.equal(samplePlaybackRate(60.2, 60.2), 1);
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
    oscillators = [];
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
  });
  const node = () => ({
    connect(destination) {
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
    sampleRate: 44100,
    createBuffer: (_, length, rate) => buffer(new Float32Array(length), rate),
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
  };
  const sample = {
    buffer: buffer(wave(261.626)),
    rootMidi: 60,
    sustain: false,
    loopStart: 0.3,
    loopEnd: 0.8,
  };
  return { context, voices, gains, oscillators, sample };
}
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

test('preparation trims silence, normalizes and preserves opposite-phase stereo', () => {
  const { context } = fixture();
  const data = new Float32Array(88200);
  data.set(wave(220), 22050);
  const prepared = prepareSampleBuffer(context, buffer(data, 44100, true));
  assert.ok(prepared.duration > 0.99 && prepared.duration < 1.02);
  const values = prepared.getChannelData(0);
  assert.equal(Math.abs(values[0]), 0);
  assert.equal(Math.abs(values.at(-1)), 0);
  assert.ok(values.some((v) => Math.abs(v) > 0.79));
  assert.ok(Math.abs(detectSamplePitch(values, 44100) - 57) < 0.03);
  assert.throws(() => prepareSampleBuffer(context, buffer(new Float32Array(44100))), /소리를 찾지/);
  assert.throws(() => prepareSampleBuffer(context, buffer(new Float32Array(44100 * 16))), /15초/);
});
test('invalid file type, empty and oversized recordings fail before audio decoding', async () => {
  await assert.rejects(importInstrumentSample({ name: 'note.wav', size: 0 }), /비어/);
  await assert.rejects(
    importInstrumentSample({ name: 'note.wav', size: 11 * 1024 * 1024 }),
    /10MB/,
  );
  await assert.rejects(importInstrumentSample({ name: 'image.png', size: 10 }), /오디오/);
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
