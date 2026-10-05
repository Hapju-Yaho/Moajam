import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { parseYouTubeUrl } from '../lib/youtubeUrl';
import {
  createYouTubeFollower,
  loadYouTubePlayerApi,
  youtubePlayerError,
  type YouTubePlayer,
} from '../lib/youtubePlayer.web';

export type ScoreYouTubeHandle = {
  pause(): void;
  sync(seconds: number, now: number, force?: boolean): void;
  currentTime(): number;
};

export const ScoreYouTubeBacking = forwardRef<
  ScoreYouTubeHandle,
  {
    videoId?: string;
    suggestedUrl?: string;
    disabled: boolean;
    volume: number;
    onChange: (videoId?: string) => void;
    onReadyChange: (ready: boolean) => void;
    onFailure: (message: string) => void;
    onAlign: (seconds: number) => void;
  }
>(function ScoreYouTubeBacking(props, ref) {
  const { videoId, suggestedUrl, disabled, volume, onChange } = props;
  const [url, setUrl] = useState('');
  const [message, setMessage] = useState('');
  const [ready, setReady] = useState(false);
  const [retry, setRetry] = useState(0);
  const container = useRef<HTMLDivElement>(null);
  const player = useRef<YouTubePlayer | null>(null);
  const follower = useRef<ReturnType<typeof createYouTubeFollower> | null>(null);
  const latest = useRef(props);
  latest.current = props;
  const suggested = suggestedUrl ? parseYouTubeUrl(suggestedUrl) : null;
  useEffect(() => setUrl(videoId ? `https://www.youtube.com/watch?v=${videoId}` : ''), [videoId]);
  useImperativeHandle(
    ref,
    () => ({
      pause: () => follower.current?.pause(),
      sync: (seconds, now, force) => follower.current?.sync(seconds, now, force),
      currentTime: () => player.current?.getCurrentTime() ?? 0,
    }),
    [],
  );
  useEffect(() => {
    player.current?.setVolume(Math.round(volume * 100));
  }, [volume]);
  useEffect(() => {
    let cancelled = false;
    const host = container.current;
    let instance: YouTubePlayer | null = null;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    setReady(false);
    latest.current.onReadyChange(false);
    setMessage(videoId ? '유튜브 영상 연결 중…' : '');
    const fail = (text: string) => {
      if (cancelled) return;
      clearTimeout(timeout);
      follower.current?.pause();
      setMessage(text);
      setReady(false);
      latest.current.onReadyChange(false);
      latest.current.onFailure(text);
    };
    if (videoId && host) {
      void loadYouTubePlayerApi()
        .then((api) => {
          if (cancelled) return;
          const iframe = document.createElement('iframe');
          iframe.title = '함께 재생할 유튜브 영상';
          iframe.src = `https://www.youtube.com/embed/${videoId}?enablejsapi=1&playsinline=1&rel=0&origin=${encodeURIComponent(location.origin)}`;
          iframe.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
          iframe.allowFullscreen = true;
          iframe.referrerPolicy = 'strict-origin-when-cross-origin';
          host.appendChild(iframe);
          timeout = setTimeout(
            () =>
              fail('유튜브 영상이 준비되지 않았어요. 다시 연결하거나 다른 영상을 선택해주세요.'),
            20000,
          );
          instance = new api.Player(iframe, {
            events: {
              onReady: (event) => {
                if (cancelled) return;
                clearTimeout(timeout);
                player.current = event.target;
                follower.current = createYouTubeFollower(event.target);
                event.target.setVolume(Math.round(latest.current.volume * 100));
                setReady(true);
                setMessage('');
                latest.current.onReadyChange(true);
              },
              onStateChange: (event) => {
                if (cancelled) return;
                if (follower.current?.onStateChange(event.data)) {
                  latest.current.onFailure(
                    '영상이 일시정지되어 악보도 정지했어요. Space로 다시 재생하세요.',
                  );
                }
              },
              onError: (event) => fail(youtubePlayerError(event.data)),
              onAutoplayBlocked: () => {
                if (cancelled) return;
                follower.current?.pause();
                const text =
                  '유튜브 자동 재생이 차단됐어요. 영상의 재생 버튼을 한 번 누른 뒤 악보를 다시 재생해주세요.';
                setMessage(text);
                latest.current.onFailure(text);
              },
            },
          });
        })
        .catch((error: unknown) =>
          fail(error instanceof Error ? error.message : '유튜브에 연결하지 못했어요.'),
        );
    }
    return () => {
      cancelled = true;
      clearTimeout(timeout);
      follower.current = null;
      player.current = null;
      instance?.destroy();
      host?.replaceChildren();
      latest.current.onReadyChange(false);
    };
  }, [videoId, retry]);
  return (
    <div className="score-youtube-backing">
      <div className="score-backing-row">
        <label>
          유튜브 주소{' '}
          <input
            type="url"
            aria-label="함께 재생할 유튜브 주소"
            placeholder="https://www.youtube.com/watch?v=..."
            value={url}
            disabled={disabled}
            onChange={(event) => setUrl(event.target.value)}
          />
        </label>
        <button
          type="button"
          disabled={disabled || !url.trim()}
          onClick={() => {
            const reference = parseYouTubeUrl(url);
            if (!reference) {
              setMessage(
                '올바른 유튜브 영상 주소를 입력해주세요. 일반 영상, Shorts, YouTube Music을 지원해요.',
              );
              return;
            }
            onChange(reference.videoId);
            setRetry((value) => value + 1);
          }}
        >
          영상 불러오기
        </button>
        {suggested && (
          <button type="button" disabled={disabled} onClick={() => onChange(suggested.videoId)}>
            이 곡 영상 불러오기
          </button>
        )}
        {videoId && (
          <button type="button" disabled={disabled} onClick={() => onChange(undefined)}>
            영상 연결 해제
          </button>
        )}
      </div>
      {videoId && (
        <>
          <div className="score-youtube-player" ref={container} />
          <div className="score-backing-row">
            <button
              type="button"
              disabled={disabled || !ready}
              onClick={() => latest.current.onAlign(player.current?.getCurrentTime() ?? 0)}
            >
              현재 영상 위치를 첫 박으로
            </button>
            <button
              type="button"
              disabled={disabled}
              onClick={() => setRetry((value) => value + 1)}
            >
              영상 다시 연결
            </button>
            <a href={`https://www.youtube.com/watch?v=${videoId}`} target="_blank" rel="noreferrer">
              유튜브에서 보기
            </a>
          </div>
          <p>
            영상 로딩·광고·버퍼링에 따라 싱크가 어긋날 수 있어요. 첫 박의 음원 위치와 BPM을 곡에
            맞춰주세요.
          </p>
        </>
      )}
      {message && <p role="status">{message}</p>}
    </div>
  );
});
