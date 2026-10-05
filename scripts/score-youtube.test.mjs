import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { Buffer } from 'node:buffer';
import { URL } from 'node:url';
import ts from 'typescript';
async function source(path) {
  const { outputText } = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  });
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
}
const { parseYouTubeUrl } = await source('../packages/app/src/lib/youtubeUrl.ts');
const { createYouTubeFollower, youtubePlayerError } = await source(
  '../packages/app/src/lib/youtubePlayer.web.ts',
);
const { isBandScore } = await source('../apps/server/src/workspaces/score-policy.ts');
test('YouTube links normalize supported video formats and reject unrelated or malformed URLs', () => {
  for (const url of [
    'https://www.youtube.com/watch?v=M7lc1UVf-VE&t=10',
    'https://youtu.be/M7lc1UVf-VE',
    'music.youtube.com/watch?v=M7lc1UVf-VE',
    'https://m.youtube.com/shorts/M7lc1UVf-VE',
    'https://youtube.com/live/M7lc1UVf-VE',
    'https://youtube.com/embed/M7lc1UVf-VE',
  ])
    assert.equal(parseYouTubeUrl(url).videoId, 'M7lc1UVf-VE');
  for (const url of [
    '',
    'https://youtube.com.evil.test/watch?v=M7lc1UVf-VE',
    'javascript:alert(1)',
    'https://youtube.com/playlist?list=test',
    'https://youtu.be/bad',
  ])
    assert.equal(parseYouTubeUrl(url), null);
});
function fixture() {
  const calls = [];
  let time = 0;
  const player = {
    getDuration: () => 100,
    getCurrentTime: () => time,
    getPlayerState: () => 1,
    seekTo: (target) => {
      time = target;
      calls.push(['seek', target]);
    },
    playVideo: () => calls.push(['play']),
    pauseVideo: () => calls.push(['pause']),
  };
  return {
    calls,
    follow: createYouTubeFollower(player),
    setTime: (next) => {
      time = next;
    },
  };
}
test('video follows selection, negative intro, repeat jumps and score stop without constant seeks', () => {
  const { calls, follow, setTime } = fixture();
  follow.sync(-1, 0, true);
  assert.deepEqual(calls, []);
  follow.sync(0, 1);
  assert.deepEqual(calls, [['seek', 0], ['play']]);
  setTime(0.5);
  follow.sync(0.5, 1.5);
  assert.equal(calls.length, 2);
  follow.sync(0, 1.6); // loop back
  assert.deepEqual(calls.slice(-2), [['seek', 0], ['play']]);
  follow.sync(10, 1.7); // repeat barline / next selection
  assert.deepEqual(calls.slice(-2), [['seek', 10], ['play']]);
  follow.sync(101, 2);
  assert.deepEqual(calls.at(-1), ['pause']);
  follow.sync(0, 2.1);
  assert.deepEqual(calls.slice(-2), [['seek', 0], ['play']]);
  follow.pause();
  assert.equal(follow.active, false);
  assert.deepEqual(calls.at(-1), ['pause']);
});
test('drift correction is throttled and a deliberate pause stops following only after playback starts', () => {
  const { calls, follow, setTime } = fixture();
  follow.sync(5, 0, true);
  assert.equal(follow.onStateChange(2), false, 'seek from paused frame is not a user stop');
  follow.onStateChange(1);
  follow.sync(6, 1);
  assert.equal(calls.length, 2);
  setTime(5);
  follow.sync(7.1, 2.1);
  assert.deepEqual(calls.at(-1), ['seek', 7.1]);
  assert.equal(follow.onStateChange(2), true);
  assert.equal(follow.active, false);
  assert.match(youtubePlayerError(150), /외부 사이트 재생/);
  assert.match(youtubePlayerError(100), /비공개/);
});
test('band score API accepts the video reference and rejects arbitrary embeds and unknown source types', () => {
  const score = {
    title: '',
    bpm: 120,
    parts: ['Bass'],
    notes: [],
    sync: {},
    referenceAudioSource: 'youtube',
    referenceYoutubeId: 'M7lc1UVf-VE',
  };
  assert.equal(isBandScore(score), true);
  assert.equal(isBandScore({ ...score, referenceYoutubeId: '<iframe>' }), false);
  assert.equal(isBandScore({ ...score, referenceAudioSource: 'other' }), false);
});
