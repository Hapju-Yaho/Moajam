import type { TimelineClip } from './practiceClips';

export type PlaybackClip = TimelineClip & { trackId: string };
type Loop = { start: number; end: number };

// The UI only reads the clock. Clip boundaries are scheduled by the audio engine.
export class ClipPlayback {
  private cache = new WeakMap<Blob, Promise<AudioBuffer>>();
  private clips: { clip: PlaybackClip; buffer: AudioBuffer }[] = [];
  private voices = new Set<AudioBufferSourceNode>();
  private gains = new Map<string, GainNode>();
  private timer?: ReturnType<typeof setInterval>;
  private startedAt = 0;
  private startPosition = 0;
  private pausedPosition = 0;
  private active = false;
  private loop?: Loop;
  private end = 0;
  private keepAlive = false;
  private preparation = 0;

  constructor(private context: BaseAudioContext) {}

  async prepare(clips: PlaybackClip[]) {
    const preparation = ++this.preparation;
    const prepared = await Promise.all(
      clips.map(async (clip) => {
        let pending = this.cache.get(clip.blob);
        if (!pending) {
          pending = clip.blob.arrayBuffer().then((bytes) => this.context.decodeAudioData(bytes));
          this.cache.set(clip.blob, pending);
          pending.catch(() => this.cache.delete(clip.blob));
        }
        const buffer = await pending;
        return {
          clip: !clip.trimmed && !clip.duration ? { ...clip, duration: buffer.duration } : clip,
          buffer,
        };
      }),
    );
    if (preparation !== this.preparation) return;
    this.clips = prepared;
    this.end = Math.max(0, ...prepared.map(({ clip }) => clip.offset + clip.duration));
    for (const { clip } of prepared) {
      if (!this.gains.has(clip.trackId)) {
        const gain = this.context.createGain();
        gain.connect(this.context.destination);
        this.gains.set(clip.trackId, gain);
      }
    }
  }

  setMix(
    tracks: { id: string; volume: number; muted: boolean }[],
    solo: string | null,
    master: number,
  ) {
    for (const track of tracks) {
      const gain = this.gains.get(track.id)?.gain;
      if (gain)
        gain.setValueAtTime(
          track.muted || (solo !== null && solo !== track.id) ? 0 : track.volume * master,
          this.context.currentTime,
        );
    }
  }

  private schedule(from: number, to: number, at: number) {
    for (const { clip, buffer } of this.clips) {
      const begin = Math.max(from, clip.offset);
      const end = Math.min(to, clip.offset + clip.duration);
      let length = end - begin;
      if (length <= 0) continue;
      let sourceOffset = clip.sourceStart + (begin - clip.offset);
      let when = at + (begin - from);
      // If a throttled tab wakes late, skip missed audio instead of playing it in a burst.
      const late = Math.max(0, this.context.currentTime - when);
      sourceOffset += late;
      when += late;
      length = Math.min(length - late, buffer.duration - sourceOffset);
      if (length <= 0) continue;
      const voice = this.context.createBufferSource();
      voice.buffer = buffer;
      voice.connect(this.gains.get(clip.trackId)!);
      voice.onended = () => {
        this.voices.delete(voice);
        voice.disconnect();
      };
      this.voices.add(voice);
      voice.start(when, sourceOffset, length);
    }
  }

  start(position: number, options: { loop?: Loop; keepAlive?: boolean; leadIn?: number } = {}) {
    this.stop();
    this.loop =
      options.loop && options.loop.end - options.loop.start >= 0.01 ? options.loop : undefined;
    this.keepAlive = options.keepAlive ?? false;
    this.startPosition = this.loop && position >= this.loop.end ? this.loop.start : position;
    this.startedAt = this.context.currentTime + (options.leadIn ?? 0.04);
    this.active = true;
    this.schedule(this.startPosition, this.loop?.end ?? this.end, this.startedAt);
    if (this.loop) {
      const loop = this.loop;
      const length = loop.end - loop.start;
      let next = this.startedAt + loop.end - this.startPosition;
      const fill = () => {
        if (next < this.context.currentTime - length)
          next += Math.floor((this.context.currentTime - next) / length) * length;
        while (next < this.context.currentTime + 1) {
          this.schedule(loop.start, loop.end, next);
          next += length;
        }
      };
      fill();
      this.timer = setInterval(fill, 25);
    }
  }

  position() {
    if (!this.active) return this.pausedPosition;
    const position = this.startPosition + Math.max(0, this.context.currentTime - this.startedAt);
    if (this.loop && position >= this.loop.end)
      return this.loop.start + ((position - this.loop.end) % (this.loop.end - this.loop.start));
    return this.keepAlive ? position : Math.min(position, this.end);
  }

  clockPosition() {
    if (this.active && this.context.currentTime < this.startedAt)
      return this.startPosition + this.context.currentTime - this.startedAt;
    return this.position();
  }

  finished() {
    return (
      this.active &&
      !this.loop &&
      !this.keepAlive &&
      this.context.currentTime >= this.startedAt + this.end - this.startPosition
    );
  }

  stop() {
    this.pausedPosition = this.position();
    this.active = false;
    clearInterval(this.timer);
    this.timer = undefined;
    for (const voice of this.voices) {
      try {
        voice.stop();
      } catch {
        /* Already ended. */
      }
      voice.disconnect();
    }
    this.voices.clear();
  }

  dispose() {
    this.preparation++;
    this.stop();
    for (const gain of this.gains.values()) gain.disconnect();
    this.gains.clear();
    this.clips = [];
    this.cache = new WeakMap();
  }
}
