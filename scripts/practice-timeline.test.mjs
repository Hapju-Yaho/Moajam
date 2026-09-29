/* global AbortController */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Buffer } from 'node:buffer';
import { URL } from 'node:url';
import test from 'node:test';
import ts from 'typescript';

function moduleUrl(path, imports = {}) {
  let { outputText } = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  });
  for (const [name, url] of Object.entries(imports))
    outputText = outputText.replaceAll(`'${name}'`, `'${url}'`);
  return `data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`;
}
const timelineUrl = moduleUrl('../packages/app/src/lib/practiceTimeline.ts');
const { beatSeconds, musicalPosition, snapOffset, snapClipEdges, waveformPeaks } = await import(
  timelineUrl
);
const { startMetronome, countIn } = await import(
  moduleUrl('../packages/app/src/lib/metronome.web.ts', { './practiceTimeline': timelineUrl })
);
const { trackClips, splitClip, moveClip, clipSourceTime } = await import(
  moduleUrl('../packages/app/src/lib/practiceClips.ts')
);
const originalBlob = { fixture: 'audio' };
const legacyTrack = () => ({
  id: 'bass',
  name: 'bass.wav',
  blob: originalBlob,
  url: 'blob:original',
  offset: 2,
  duration: 8,
  volume: 0.7,
  muted: false,
  part: 'BASS',
});

test('legacy audio migrates to one clip without changing timing or source', () => {
  const [clip] = trackClips(legacyTrack());
  assert.equal(clip.blob, originalBlob);
  assert.equal(clip.offset, 2);
  assert.equal(clip.sourceStart, 0);
  assert.deepEqual(trackClips({ ...legacyTrack(), clips: [] }), []);
});
test('splitting preserves the original bytes and source continuity, including repeated cuts', () => {
  const original = legacyTrack();
  let result = splitClip([original], 'bass', 5, 'right');
  const [left, right] = trackClips(result[0]);
  assert.equal(original.duration, 8);
  assert.equal(left.duration, 3);
  assert.equal(right.offset, 5);
  assert.equal(right.sourceStart, 3);
  assert.equal(right.duration, 5);
  assert.equal(left.blob, right.blob);
  assert.equal(result[0].blob, undefined);
  result = splitClip(result, 'right', 7, 'tail');
  assert.deepEqual(
    trackClips(result[0]).map(({ offset, sourceStart, duration }) => [
      offset,
      sourceStart,
      duration,
    ]),
    [
      [2, 0, 3],
      [5, 3, 2],
      [7, 5, 3],
    ],
  );
  assert.equal(
    trackClips(result[0]).reduce((sum, clip) => sum + clip.duration, 0),
    8,
  );
});
test('cut boundaries and invalid positions do not create empty clips', () => {
  const track = legacyTrack();
  for (const position of [2, 10, 1, 11, NaN])
    assert.equal(splitClip([track], 'bass', position, 'right')[0], track);
});
test('moving into an occupied track preserves its audio and both mixer settings', () => {
  const source = splitClip([legacyTrack()], 'bass', 5, 'right')[0];
  const target = { ...legacyTrack(), id: 'guitar', part: 'GUITAR', volume: 0.4, muted: true };
  const moved = moveClip([target, source], 'right', 'guitar', 4);
  assert.deepEqual(
    trackClips(moved[0]).map((clip) => clip.id),
    ['guitar', 'right'],
  );
  assert.deepEqual(
    trackClips(moved[1]).map((clip) => clip.id),
    ['bass'],
  );
  assert.equal(moved[0].volume, 0.4);
  assert.equal(moved[0].muted, true);
  assert.equal(moved[1].volume, 0.7);
  assert.equal(trackClips(moved[0])[1].sourceStart, 3);
  const again = moveClip(moved, 'right', 'guitar', 9);
  assert.equal(trackClips(again[0]).length, 2);
  assert.equal(moveClip(again, 'right', 'missing', 0), again);
});
test('a moved right-hand clip seeks within its original source segment', () => {
  const right = trackClips(splitClip([legacyTrack()], 'bass', 5, 'right')[0])[1];
  const moved = { ...right, offset: 12 };
  assert.equal(clipSourceTime(moved, 12), 3);
  assert.equal(clipSourceTime(moved, 13), 4);
  assert.equal(clipSourceTime(moved, 50), 8);
  assert.equal(clipSourceTime(moved, 0), 3);
});

test('bar/beat ruler follows the time signature and quarter-note BPM', () => {
  assert.equal(beatSeconds(120, '4/4'), 0.5);
  assert.equal(beatSeconds(120, '6/8'), 0.25);
  assert.deepEqual(musicalPosition(2, 120, '4/4'), { bar: 2, beat: 1 });
  assert.deepEqual(musicalPosition(1.5, 120, '6/8'), { bar: 2, beat: 1 });
  assert.deepEqual(musicalPosition(-2, 120, '3/4'), { bar: 1, beat: 1 });
});
test('clip movement snaps to beats while free movement preserves hundredths and bounds', () => {
  assert.equal(snapOffset(1.36, 120, '4/4', true), 1.5);
  assert.equal(snapOffset(1.36, 120, '4/4', false), 1.36);
  assert.equal(snapOffset(1.36, 120, '6/8', true), 1.25);
  assert.equal(snapOffset(-90, 120, '4/4', false), -60);
  assert.equal(snapOffset(700, 120, '4/4', true), 600);
});

test('magnetic snapping joins either edge of a clip to nearby starts and ends without rounding', () => {
  const target = { id: 'other', offset: 2.137, duration: 3 };
  for (const [offset, expectedOffset, edge, time] of [
    [2.18, 2.137, 'start', 2.137],
    [5.18, 5.137, 'end', 5.137],
    [1.18, 1.137, 'start', 2.137],
    [4.18, 4.137, 'end', 5.137],
  ]) {
    const result = snapClipEdges({ id: 'moving', offset, duration: 1 }, [target], 100);
    assert.ok(Math.abs(result.offset - expectedOffset) < 1e-10);
    assert.equal(result.edge, edge);
    assert.ok(Math.abs(result.time - time) < 1e-10);
  }
});
test('snap range is ten screen pixels at any zoom and releases beyond that range', () => {
  const target = { id: 'other', offset: 10, duration: 2 };
  for (const zoom of [12, 48, 240]) {
    assert.equal(
      snapClipEdges({ id: 'moving', offset: 10 + 9 / zoom, duration: 3 }, [target], zoom)?.offset,
      10,
    );
    assert.equal(
      snapClipEdges({ id: 'moving', offset: 10 + 11 / zoom, duration: 3 }, [target], zoom),
      undefined,
    );
  }
});
test('snapping ignores itself, chooses the nearest edge, and keeps destination order for ties', () => {
  const moving = { id: 'moving', offset: 3.08, duration: 1 };
  const targets = [
    moving,
    { id: 'destination', offset: 3, duration: 2 },
    { id: 'nearer', offset: 3.1, duration: 2 },
  ];
  assert.equal(snapClipEdges(moving, [moving], 100), undefined);
  assert.equal(snapClipEdges(moving, targets, 100)?.targetId, 'nearer');
  assert.equal(
    snapClipEdges(moving, [targets[1], { ...targets[1], id: 'tie' }], 100)?.targetId,
    'destination',
  );
});
test('magnetic snapping does not select an edge that would put a clip outside editing bounds', () => {
  assert.equal(
    snapClipEdges(
      { id: 'moving', offset: 599.99, duration: 1 },
      [{ id: 'target', offset: 601, duration: 2 }],
      100,
    )?.offset,
    600,
  );
  assert.equal(
    snapClipEdges(
      { id: 'moving', offset: -59.99, duration: 1 },
      [{ id: 'target', offset: -62, duration: 1 }],
      100,
    ),
    undefined,
  );
});
test('waveform includes right-channel transients and never invents signal in silence', () => {
  const peaks = waveformPeaks(
    [new Float32Array([0, 0, 0, 0]), new Float32Array([0, -0.75, 0.25, 0])],
    2,
  );
  assert.deepEqual(peaks, [0.75, 0.25]);
  assert.deepEqual(waveformPeaks([new Float32Array(4)], 2), [0, 0]);
  assert.deepEqual(waveformPeaks([], 2), []);
});
function contextFixture() {
  const clicks = [];
  return {
    clicks,
    context: {
      get currentTime() {
        return Date.now() / 1000;
      },
      destination: {},
      createOscillator() {
        const voice = {
          frequency: { value: 0 },
          connect() {
            return { connect() {} };
          },
          start(time) {
            clicks.push({ time, frequency: voice.frequency.value });
          },
          stop() {},
          disconnect() {},
          addEventListener() {},
        };
        return voice;
      },
      createGain() {
        return {
          gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} },
          connect() {},
          disconnect() {},
        };
      },
    },
  };
}
test('metronome schedules stable audio timestamps with an accented first beat, and stops cleanly', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'], now: 0 });
  const { context, clicks } = contextFixture();
  const stop = startMetronome(context, {
    bpm: 120,
    signature: '4/4',
    volume: 0.5,
    position: 0,
    onBeat() {},
  });
  for (let index = 0; index < 82; index++) t.mock.timers.tick(25);
  assert.deepEqual(
    clicks.map((click) => click.frequency),
    [1400, 900, 900, 900, 1400],
  );
  assert.deepEqual(
    clicks.map((click) => Number(click.time.toFixed(3))),
    [0.025, 0.525, 1.025, 1.525, 2.025],
  );
  stop();
  const previous = clicks.length;
  t.mock.timers.tick(1000);
  assert.equal(clicks.length, previous);
});
test('6/8 count-in ends after exactly one bar and can be cancelled before recording', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'], now: 0 });
  const { context, clicks } = contextFixture();
  const controller = new AbortController();
  const result = countIn(context, {
    bpm: 120,
    signature: '6/8',
    volume: 0.5,
    bars: 1,
    signal: controller.signal,
    onBeat() {},
  });
  for (let index = 0; index < 65; index++) t.mock.timers.tick(25);
  assert.equal(await result, true);
  assert.equal(clicks.length, 6);
  const abort = new AbortController();
  const cancelled = countIn(context, {
    bpm: 120,
    signature: '4/4',
    volume: 0.5,
    bars: 2,
    signal: abort.signal,
    onBeat() {},
  });
  abort.abort();
  assert.equal(await cancelled, false);
});
