import { useEffect, useRef, useState, type CSSProperties, type RefObject } from 'react';

function audioTime(seconds: number) {
  const hundredths = Math.round(Math.max(0, Number.isFinite(seconds) ? seconds : 0) * 100);
  return `${Math.floor(hundredths / 6000)
    .toString()
    .padStart(2, '0')}:${((hundredths % 6000) / 100).toFixed(2).padStart(5, '0')}`;
}

export function ScoreAudioFile({
  audioRef,
  src,
  name,
  position,
  volume,
  disabled,
  loading,
  scorePlaying,
  onFile,
  onPositionChange,
  onError,
}: {
  audioRef: RefObject<HTMLAudioElement | null>;
  src: string;
  name: string;
  position: number;
  volume: number;
  disabled: boolean;
  loading: boolean;
  scorePlaying: boolean;
  onFile: (file: File) => void;
  onPositionChange: (seconds: number) => void;
  onError: (message: string) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);
  const [dragging, setDragging] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [duration, setDuration] = useState(0);
  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume;
  }, [audioRef, volume]);
  useEffect(() => {
    if (disabled) audioRef.current?.pause();
  }, [audioRef, disabled]);
  const readDuration = (audio: HTMLAudioElement) => {
    setDuration(Number.isFinite(audio.duration) ? audio.duration : 0);
  };
  const current = Math.min(duration, Math.max(0, position));
  const activeDrop = dragging && !disabled;
  return (
    <section
      className="score-audio-file"
      aria-label="반주 음원 파일"
      aria-busy={loading}
      data-dragging={activeDrop}
      onDragEnter={(event) => {
        if (!event.dataTransfer.types.includes('Files')) return;
        event.preventDefault();
        dragDepth.current++;
        if (!disabled) setDragging(true);
      }}
      onDragOver={(event) => {
        if (!event.dataTransfer.types.includes('Files')) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = disabled ? 'none' : 'copy';
      }}
      onDragLeave={(event) => {
        event.preventDefault();
        dragDepth.current = Math.max(0, dragDepth.current - 1);
        if (!dragDepth.current) setDragging(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        dragDepth.current = 0;
        setDragging(false);
        if (disabled) return;
        const files = event.dataTransfer.files;
        if (files.length > 1) {
          onError('음원 파일을 한 개씩 추가해주세요.');
          return;
        }
        if (files[0]) onFile(files[0]);
      }}
    >
      <input
        ref={input}
        type="file"
        hidden
        accept="audio/*,.mp3,.wav,.m4a,.flac,.ogg,.aac,.webm,.aif,.aiff,.opus"
        aria-label="함께 재생할 음원 파일"
        disabled={disabled}
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (file) onFile(file);
        }}
      />
      {!src ? (
        <button
          type="button"
          className="score-audio-upload"
          disabled={disabled}
          onClick={() => input.current?.click()}
        >
          <span className="score-audio-upload-icon" aria-hidden="true">
            <svg
              width="28"
              height="28"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 16V3m-5 5 5-5 5 5M4 15v5a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-5" />
            </svg>
          </span>
          <strong>
            {loading ? '음원 준비 중…' : activeDrop ? '여기에 놓아 추가' : '음원 추가'}
          </strong>
          <span>클릭하거나 파일을 끌어다 놓으세요</span>
          <small>MP3, WAV, M4A 등 · 최대 100MB</small>
        </button>
      ) : (
        <>
          <audio
            ref={audioRef}
            src={src}
            preload="metadata"
            hidden
            onLoadedMetadata={(event) => {
              event.currentTarget.volume = volume;
              readDuration(event.currentTarget);
            }}
            onDurationChange={(event) => readDuration(event.currentTarget)}
            onPlay={(event) => {
              if (disabled) event.currentTarget.pause();
              else setPreviewing(true);
            }}
            onPause={() => setPreviewing(false)}
            onEnded={() => setPreviewing(false)}
            onTimeUpdate={(event) => {
              if (!scorePlaying) onPositionChange(event.currentTarget.currentTime);
            }}
            onError={() => {
              setPreviewing(false);
              setDuration(0);
              onError('음원을 재생할 수 없어요. 다른 파일로 변경해주세요.');
            }}
          />
          <div className="score-audio-player-header">
            <span className="score-audio-file-icon" aria-hidden="true">
              ♫
            </span>
            <div>
              <span>기준 음원</span>
              <strong title={name}>{name}</strong>
            </div>
            <button type="button" disabled={disabled} onClick={() => input.current?.click()}>
              {loading ? '준비 중…' : '음원 변경'}
            </button>
          </div>
          <div className="score-audio-transport">
            <button
              type="button"
              className="score-audio-play"
              aria-label={previewing ? '반주 미리듣기 일시정지' : '반주 미리듣기 재생'}
              disabled={disabled || !duration}
              onClick={() => {
                const audio = audioRef.current;
                if (!audio) return;
                if (!audio.paused) audio.pause();
                else {
                  if (audio.ended) audio.currentTime = 0;
                  void audio.play().catch((error: unknown) => {
                    if (error instanceof Error && error.name === 'AbortError') return;
                    onError('음원을 재생하지 못했어요. 재생 버튼을 다시 눌러주세요.');
                  });
                }
              }}
            >
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="currentColor"
                aria-hidden="true"
              >
                {previewing ? <path d="M6 4h4v16H6zm8 0h4v16h-4z" /> : <path d="m8 4 13 8-13 8z" />}
              </svg>
            </button>
            <div className="score-audio-timeline">
              <div className="score-audio-times">
                <strong>{audioTime(current)}</strong>
                <span>/ {audioTime(duration)}</span>
              </div>
              <input
                type="range"
                className="score-audio-seek"
                aria-label="반주 음원 재생 위치"
                min="0"
                max={duration || 1}
                step="0.01"
                value={current}
                aria-valuetext={`${audioTime(current)} / ${audioTime(duration)}`}
                style={
                  {
                    '--audio-progress': `${duration ? (current / duration) * 100 : 0}%`,
                  } as CSSProperties
                }
                disabled={disabled || !duration}
                onChange={(event) => {
                  if (!audioRef.current) return;
                  const time = event.currentTarget.valueAsNumber;
                  audioRef.current.currentTime = time;
                  onPositionChange(time);
                }}
              />
            </div>
          </div>
          <p className="score-audio-hint">
            {activeDrop
              ? '놓으면 새 음원으로 변경합니다'
              : scorePlaying
                ? '악보 재생 중에는 미리듣기를 잠시 멈춥니다'
                : '막대를 움직여 위치 조정 · 파일을 놓아 음원 변경'}
          </p>
        </>
      )}
    </section>
  );
}
