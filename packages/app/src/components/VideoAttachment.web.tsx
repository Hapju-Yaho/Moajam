import { useEffect, useLayoutEffect, useRef, useState, type PropsWithChildren } from 'react';
import { createPortal } from 'react-dom';
import { parseVideoUrl } from '../lib/video';
import { fetchYouTubeMetadata, parseYouTubeUrl } from '../lib/youtube';

function useVideoMetadata(value: string) {
  const video = parseVideoUrl(value);
  const url = video?.url ?? '';
  const [metadata, setMetadata] = useState<{ url: string; title: string; thumbnail?: string }>();
  useEffect(() => {
    if (!url) return;
    const abort = new AbortController();
    const youtube = parseYouTubeUrl(url);
    const request = youtube
      ? fetchYouTubeMetadata(youtube, abort.signal).then((item) => ({
          title: item.title,
          thumbnail: item.thumbnailUrl,
        }))
      : new URL(url).hostname.replace(/^www\./, '') === 'vimeo.com'
        ? fetch(`https://vimeo.com/api/oembed.json?url=${encodeURIComponent(url)}`, {
            signal: abort.signal,
          })
            .then((response) => {
              if (!response.ok) throw Error('metadata');
              return response.json();
            })
            .then((item) => ({
              title: String(item.title || 'Vimeo'),
              thumbnail: typeof item.thumbnail_url === 'string' ? item.thumbnail_url : undefined,
            }))
        : Promise.resolve({
            title: decodeURIComponent(new URL(url).pathname.split('/').at(-1) || '첨부 영상'),
          });
    void request
      .then((item) => {
        if (!abort.signal.aborted) setMetadata({ url, ...item });
      })
      .catch(() => {});
    return () => abort.abort();
  }, [url]);
  return {
    video,
    title: metadata?.url === url ? metadata.title : video ? new URL(url).hostname : '',
    thumbnail:
      metadata?.url === url
        ? metadata.thumbnail
        : video && 'thumbnail' in video
          ? video.thumbnail
          : undefined,
  };
}

export function VideoThumbnail({ value, compact = false }: { value: string; compact?: boolean }) {
  const { video, title, thumbnail } = useVideoMetadata(value);
  if (!video) return null;
  return (
    <a
      href={video.url}
      target="_blank"
      rel="noopener noreferrer"
      title={title}
      style={{
        display: 'flex',
        flexDirection: compact ? 'column' : 'row',
        alignItems: compact ? 'stretch' : 'center',
        gap: compact ? 6 : 8,
        width: compact ? 'clamp(104px, 20vw, 152px)' : undefined,
        maxWidth: compact ? 152 : 240,
        flexShrink: 0,
        color: '#52627a',
        textDecoration: 'none',
        fontSize: 12,
      }}
    >
      <span
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          width: compact ? '100%' : 96,
          height: compact ? undefined : 54,
          aspectRatio: '16 / 9',
          overflow: 'hidden',
          borderRadius: 7,
          background: '#e8eef8',
        }}
      >
        {thumbnail ? (
          <img
            src={thumbnail}
            alt="영상 썸네일"
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : video.kind === 'file' ? (
          <video
            src={`${video.url}#t=0.1`}
            preload="metadata"
            muted
            style={{ width: '100%', height: '100%', objectFit: 'cover', pointerEvents: 'none' }}
          />
        ) : (
          '▶'
        )}
      </span>
      {
        <span
          style={{
            overflow: 'hidden',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            lineHeight: '17px',
          }}
        >
          {title}
        </span>
      }
    </a>
  );
}

const buttonStyle = {
  border: '1px solid #b9cdfc',
  borderRadius: 9,
  background: 'white',
  color: '#2563eb',
  padding: '7px 11px',
  fontSize: 13,
  cursor: 'pointer',
};
export function VideoInput({
  value,
  onChange,
  children,
}: PropsWithChildren<{ value: string; onChange: (value: string) => void }>) {
  const anchor = useRef<HTMLButtonElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  const [position, setPosition] = useState({ left: 0, top: 0, maxHeight: 320 });
  const valid = parseVideoUrl(draft);
  const close = () => {
    setOpen(false);
    anchor.current?.focus({ preventScroll: true });
  };
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const rect = anchor.current?.getBoundingClientRect();
      if (!rect) return;
      const height = popup.current?.offsetHeight ?? 230;
      setPosition({
        left: Math.max(
          12,
          Math.min(rect.left, window.innerWidth - Math.min(420, window.innerWidth - 24) - 12),
        ),
        top: Math.max(12, rect.top - height - 8),
        maxHeight: Math.max(120, rect.top - 20),
      });
    };
    place();
    input.current?.focus({ preventScroll: true });
    const observer = new ResizeObserver(place);
    if (popup.current) observer.observe(popup.current);
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      observer.disconnect();
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (
        !popup.current?.contains(event.target as Node) &&
        !anchor.current?.contains(event.target as Node)
      )
        setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setOpen(false);
        anchor.current?.focus({ preventScroll: true });
      }
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <button
          ref={anchor}
          type="button"
          aria-expanded={open}
          onClick={() => {
            if (open) close();
            else {
              setDraft(value);
              setOpen(true);
            }
          }}
          style={buttonStyle}
        >
          영상 링크 첨부
        </button>
        {children}
      </div>
      {value && <VideoThumbnail value={value} />}
      {open &&
        createPortal(
          <div
            ref={popup}
            role="dialog"
            aria-label="영상 링크 첨부"
            style={{
              position: 'fixed',
              zIndex: 10000,
              left: position.left,
              top: position.top,
              width: 'min(420px, calc(100vw - 24px))',
              maxHeight: position.maxHeight,
              overflowY: 'auto',
              padding: 14,
              boxSizing: 'border-box',
              background: 'white',
              border: '1px solid #dce4ef',
              borderRadius: 12,
              boxShadow: '0 8px 30px #0f172a25',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
                marginBottom: 12,
              }}
            >
              <strong style={{ fontSize: 14 }}>영상 링크 첨부</strong>
              <div style={{ display: 'flex', gap: 6 }}>
                <button type="button" style={buttonStyle} onClick={close}>
                  취소
                </button>
                <button
                  type="button"
                  style={{ ...buttonStyle, opacity: draft.trim() && !valid ? 0.45 : 1 }}
                  disabled={!!draft.trim() && !valid}
                  onClick={() => {
                    onChange(valid?.url ?? '');
                    close();
                  }}
                >
                  적용
                </button>
              </div>
            </div>
            <input
              ref={input}
              aria-label="첨부 영상 링크"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="YouTube, Vimeo, MP4 / WebM / MOV"
              style={{
                width: '100%',
                boxSizing: 'border-box',
                padding: 10,
                border: '1px solid #dce4ef',
                borderRadius: 8,
                marginBottom: 10,
              }}
            />
            {draft.trim() && !valid ? (
              <p role="alert" style={{ fontSize: 12, color: '#b42318' }}>
                지원하는 영상 주소를 입력해주세요.
              </p>
            ) : (
              valid && <VideoThumbnail value={valid.url} />
            )}
          </div>,
          document.body,
        )}
    </>
  );
}
