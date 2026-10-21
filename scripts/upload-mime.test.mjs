import test from 'node:test';
import assert from 'node:assert/strict';
import { moduleUrl } from './load-typescript.mjs';
const { uploadMime } = await import(moduleUrl(new URL('../packages/app/src/lib/uploadMime.ts', import.meta.url)));

test('audio uploads normalize browser MIME aliases and missing types', () => {
  for (const [type, name, expected] of [
    ['audio/mp3', 'song.mp3', 'audio/mpeg'],
    ['audio/x-m4a', 'song.m4a', 'audio/mp4'],
    ['audio/x-wav', 'song.wav', 'audio/wav'],
    ['audio/x-flac', 'song.flac', 'audio/flac'],
    ['', 'song.OGG', 'audio/ogg'],
    ['application/octet-stream', 'song.mid', 'audio/midi'],
    ['', 'song.aiff', 'audio/aiff'],
    ['audio/webm;codecs=opus', 'recording.webm', 'audio/webm'],
    ['video/webm', '내 녹음.webm', 'audio/webm'],
    ['video/webm;codecs=opus', '내 녹음.webm', 'audio/webm'],
    ['application/pdf', 'score.pdf', 'application/pdf'],
    ['application/zip', 'song.mp3', 'application/zip'],
  ]) assert.equal(uploadMime(type, name), expected);
});
