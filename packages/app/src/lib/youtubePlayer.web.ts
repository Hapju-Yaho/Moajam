export interface YouTubePlayer {
  playVideo(): void;
  pauseVideo(): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  setVolume(volume: number): void;
  getCurrentTime(): number;
  getDuration(): number;
  getPlayerState(): number;
  destroy(): void;
}
type PlayerEvent = { target: YouTubePlayer; data: number };
type YouTubeApi = {
  Player: new (
    element: HTMLIFrameElement,
    options: {
      events: {
        onReady: (event: PlayerEvent) => void;
        onStateChange: (event: PlayerEvent) => void;
        onError: (event: PlayerEvent) => void;
        onAutoplayBlocked: () => void;
      };
    },
  ) => YouTubePlayer;
};
let apiPromise: Promise<YouTubeApi> | null = null;
export function loadYouTubePlayerApi(): Promise<YouTubeApi> {
  const host = window as typeof window & { YT?: YouTubeApi; onYouTubeIframeAPIReady?: () => void };
  if (host.YT?.Player) return Promise.resolve(host.YT);
  if (apiPromise) return apiPromise;
  apiPromise = new Promise<YouTubeApi>((resolve, reject) => {
    const previous = host.onYouTubeIframeAPIReady;
    const script = document.createElement('script');
    const finish = (error?: Error) => {
      clearTimeout(timeout);
      host.onYouTubeIframeAPIReady = previous;
      if (error) {
        script.remove();
        reject(error);
      } else resolve(host.YT!);
    };
    const timeout = setTimeout(
      () => finish(new Error('유튜브 연결 시간이 초과됐어요. 다시 시도해주세요.')),
      15000,
    );
    host.onYouTubeIframeAPIReady = () => {
      try {
        previous?.();
      } finally {
        finish();
      }
    };
    script.src = 'https://www.youtube.com/iframe_api';
    script.async = true;
    script.onerror = () =>
      finish(new Error('유튜브에 연결하지 못했어요. 인터넷 연결을 확인해주세요.'));
    document.head.appendChild(script);
  }).catch((error) => {
    apiPromise = null;
    throw error;
  });
  return apiPromise;
}

// Score audio remains the clock. Seek only at jumps or substantial drift, never
// every animation frame (which would keep the embedded video buffering).
export function createYouTubeFollower(player: YouTubePlayer) {
  let previous: { target: number; now: number } | null = null;
  let active = false;
  let started = false;
  let lastSeek = -Infinity;
  return {
    get active() {
      return active;
    },
    pause() {
      active = false;
      started = false;
      previous = null;
      player.pauseVideo();
    },
    onStateChange(state: number) {
      if (state === 1 && active) started = true;
      // A seek from a paused frame can emit PAUSED before PLAYING. Only a pause
      // after playback actually started should stop the score.
      if (state === 2 && active && started) {
        this.pause();
        return true;
      }
      return false;
    },
    sync(target: number, now: number, force = false) {
      const duration = player.getDuration();
      if (target < 0 || (duration > 0 && target >= duration)) {
        if (active) {
          active = false;
          player.pauseVideo();
        }
        previous = { target, now };
        return;
      }
      const jump = !previous || Math.abs(target - previous.target - (now - previous.now)) > 0.15;
      const drift =
        player.getPlayerState() === 1 &&
        Math.abs(player.getCurrentTime() - target) > 0.8 &&
        now - lastSeek > 2;
      if (force || !active || jump || drift) {
        player.seekTo(target, true);
        lastSeek = now;
      }
      if (force || !active || jump) {
        active = true;
        started = false;
        player.playVideo();
      }
      previous = { target, now };
    },
  };
}

export function youtubePlayerError(code: number) {
  if (code === 100) return '영상이 삭제됐거나 비공개 상태예요. 다른 영상을 연결해주세요.';
  if (code === 101 || code === 150)
    return '이 영상은 외부 사이트 재생이 제한돼 있어요. 다른 영상을 연결해주세요.';
  if (code === 153)
    return '유튜브가 사이트 정보를 확인하지 못했어요. 브라우저의 차단 설정을 확인해주세요.';
  return '유튜브 영상을 재생하지 못했어요. 다른 영상이나 브라우저로 다시 시도해주세요.';
}
