import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Buffer } from 'node:buffer';
import { URL } from 'node:url';
import test from 'node:test';
import ts from 'typescript';
const { outputText } = ts.transpileModule(
  readFileSync(new URL('../packages/app/src/lib/clipPlayback.web.ts', import.meta.url), 'utf8'),
  {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  },
);
const { ClipPlayback } = await import(
  `data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`
);
function fixture() {
  const voices = [],
    gains = [];
  const context = {
    currentTime: 0,
    destination: {},
    decoded: 0,
    async decodeAudioData() {
      this.decoded++;
      return { duration: 10 };
    },
    createGain() {
      const gain = {
        gain: {
          values: [],
          setValueAtTime(...args) {
            this.values.push(args);
          },
        },
        connect() {},
        disconnect() {},
      };
      gains.push(gain);
      return gain;
    },
    createBufferSource() {
      const voice = {
        connect() {},
        disconnect() {},
        start(...args) {
          this.args = args;
        },
        stop() {
          this.stopped = true;
        },
      };
      voices.push(voice);
      return voice;
    },
  };
  return { context, voices, gains, player: new ClipPlayback(context) };
}
const blob = {
  async arrayBuffer() {
    return new ArrayBuffer(4);
  },
};
const clip = (id, offset, sourceStart, duration, trackId = 'track') => ({
  id,
  offset,
  sourceStart,
  duration,
  trackId,
  blob,
  name: id,
  url: '',
});
test('adjacent cuts are scheduled on one audio clock without waiting for animation frames', async () => {
  const { player, context, voices } = fixture();
  await player.prepare([clip('left', 0, 0, 0.437), clip('right', 0.437, 0.437, 0.563)]);
  player.start(0);
  assert.equal(context.decoded, 1);
  assert.equal(voices.length, 2);
  assert.deepEqual(voices[0].args, [0.04, 0, 0.437]);
  assert.ok(Math.abs(voices[1].args[0] - (voices[0].args[0] + voices[0].args[2])) < 1e-12);
  assert.equal(voices[1].args[1], 0.437);
  context.currentTime = 0.8;
  assert.equal(player.position(), 0.76);
  assert.equal(voices.length, 2);
  player.dispose();
});
test('seeking inside a moved clip uses its trimmed source offset and cancels old voices', async () => {
  const { player, voices, context } = fixture();
  await player.prepare([clip('right', 3, 0.5, 2)]);
  player.start(3.5);
  assert.deepEqual(voices[0].args, [0.04, 1, 1.5]);
  context.currentTime = 0.54;
  player.stop();
  assert.equal(player.position(), 4);
  assert.equal(voices[0].stopped, true);
  player.start(4);
  assert.ok(Math.abs(voices[1].args[0] - 0.58) < 1e-12);
  assert.deepEqual(voices[1].args.slice(1), [1.5, 1]);
  player.dispose();
});
test('volume, mute and solo change gains without restarting scheduled audio', async () => {
  const { player, voices, gains } = fixture();
  await player.prepare([clip('a', 0, 0, 1, 'a'), clip('b', 0, 0, 1, 'b')]);
  player.start(0);
  player.setMix(
    [
      { id: 'a', volume: 0.8, muted: false },
      { id: 'b', volume: 0.6, muted: false },
    ],
    'a',
    0.5,
  );
  assert.equal(gains[0].gain.values.at(-1)[0], 0.4);
  assert.equal(gains[1].gain.values.at(-1)[0], 0);
  assert.equal(voices.length, 2);
  assert.ok(voices.every((voice) => !voice.stopped));
  player.dispose();
});
test('loop boundary is queued ahead of time and stop cancels future repetitions', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  const { player, voices, context } = fixture();
  await player.prepare([clip('a', 0, 0, 1)]);
  player.start(0.25, { loop: { start: 0.25, end: 0.75 } });
  assert.deepEqual(
    voices.slice(0, 2).map((voice) => voice.args),
    [
      [0.04, 0.25, 0.5],
      [0.54, 0.25, 0.5],
    ],
  );
  context.currentTime = 0.6;
  assert.ok(Math.abs(player.position() - 0.31) < 1e-10);
  t.mock.timers.tick(25);
  assert.ok(voices.some((voice) => voice.args[0] === 1.04));
  player.stop();
  const count = voices.length;
  t.mock.timers.tick(2000);
  assert.equal(voices.length, count);
  assert.ok(voices.every((voice) => voice.stopped));
});
test('recording transport can continue past backing audio and ordinary playback finishes', async () => {
  const { player, context } = fixture();
  await player.prepare([clip('a', 0, 0, 1)]);
  player.start(0);
  context.currentTime = 2;
  assert.equal(player.finished(), true);
  player.start(1, { keepAlive: true, leadIn: 0 });
  context.currentTime = 4;
  assert.equal(player.position(), 3);
  assert.equal(player.finished(), false);
  player.dispose();
});

test('an older slow decode cannot replace a newer prepared arrangement', async () => {
  const { player, context, voices } = fixture();
  let finishOld;
  let calls = 0;
  context.decodeAudioData = () =>
    ++calls === 1
      ? new Promise((resolve) => {
          finishOld = resolve;
        })
      : Promise.resolve({ duration: 10 });
  const old = player.prepare([clip('old', 0, 0, 1)]);
  await Promise.resolve();
  const newBlob = {
    async arrayBuffer() {
      return new ArrayBuffer(8);
    },
  };
  await player.prepare([{ ...clip('new', 0, 3, 2), blob: newBlob }]);
  finishOld({ duration: 10 });
  await old;
  player.start(0);
  assert.deepEqual(voices[0].args, [0.04, 3, 2]);
  player.dispose();
});

test('recording after looped multi-track playback resumes both backing tracks at the captured position', async () => {
  const { player, context, voices } = fixture();
  await player.prepare([clip('a', 0, 0, 2, 'a'), clip('b', 0, 3, 2, 'b')]);
  player.start(0, { loop: { start: 0, end: 1 } });
  context.currentTime = 0.54;
  const recordStart = player.position();
  player.stop();
  const previous = voices.length;
  context.currentTime = 3; // Permission prompt and count-in must not move the start cursor.
  player.start(recordStart, { keepAlive: true, leadIn: 0 });
  assert.equal(recordStart, 0.5);
  assert.deepEqual(voices[previous].args, [3, 0.5, 1.5]);
  assert.deepEqual(voices[previous + 1].args, [3, 3.5, 1.5]);
  context.currentTime = 6;
  assert.equal(player.position(), 3.5);
  assert.equal(player.finished(), false);
  player.dispose();
});

test('MIDI clips use prepared instrument buffers and share the audio transport clock', async () => {
  const { player, context, voices } = fixture();
  const midi = { notes: [], duration: 2 };
  let rendered = 0;
  await player.prepare([{ ...clip('midi', 1, 0.5, 1), midi }], async (item) => {
    assert.equal(item.midi, midi);
    rendered++;
    return { duration: 2 };
  });
  player.start(1.25);
  assert.equal(context.decoded, 0);
  assert.equal(rendered, 1);
  assert.deepEqual(voices[0].args, [0.04, 0.75, 0.75]);
  player.dispose();
});
