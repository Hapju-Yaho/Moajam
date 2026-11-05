import styledWeb from '@emotion/styled';
import { downloadBlob } from '@lib/platformActions.web';
import { isMidiFile } from '@lib/midi';
import { ClipMenu } from './ClipMenu.web';
import './ClipLibrary.web.css';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  clipLibraryChanged,
  listPersonalClips,
  updatePersonalClip,
  deletePersonalClip,
  type PersonalClip,
} from '@lib/personalClipLibrary.web';
import { useIdentity } from '@state/Identity';
import { Surface, Meta } from '@component/shared/ui/ProductUI';
type Asset = PersonalClip;
function Preview({ asset }: { asset: Asset }) {
  const player = useRef<HTMLAudioElement>(null);
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  useEffect(() => {
    let active = true,
      owned = '';
    setUrl('');
    setError('');
    setTime(0);
    setDuration(0);
    setPlaying(false);
    const load = async () => {
      if (asset.blob) {
        owned = URL.createObjectURL(asset.blob);
        return owned;
      }
      throw new Error('저장된 클립을 찾을 수 없어요.');
    };
    void load()
      .then((value) => {
        if (active) setUrl(value);
      })
      .catch(() => {
        if (active) setError('재생 주소를 불러오지 못했어요.');
      });
    return () => {
      active = false;
      if (owned) URL.revokeObjectURL(owned);
    };
  }, [asset.id, asset.blob, attempt]);
  const label = (value: number) =>
    `${Math.floor(value / 60)}:${String(Math.floor(value % 60)).padStart(2, '0')}`;
  const percent = duration ? Math.min(100, (time / duration) * 100) : 0;
  return (
    <div>
      <audio
        ref={player}
        src={url || undefined}
        preload="metadata"
        onLoadedMetadata={(event) =>
          setDuration(
            Number.isFinite(event.currentTarget.duration) ? event.currentTarget.duration : 0,
          )
        }
        onTimeUpdate={(event) => setTime(event.currentTarget.currentTime)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onError={() => {
          if (url) setError('음원을 재생할 수 없어요.');
        }}
        onPlay={(event) => {
          setPlaying(true);
          const audio = event.currentTarget;
          audio
            .closest('[data-clip-library]')
            ?.querySelectorAll('audio')
            .forEach((other) => {
              if (other !== audio) other.pause();
            });
        }}
      />
      <PreviewContainer>
        <PreviewButton
          aria-label={`${asset.name} ${playing ? '일시정지' : '재생'}`}
          disabled={!url}
          onClick={() => {
            if (playing) player.current?.pause();
            else
              void player.current
                ?.play()
                .catch(() => setError('재생하지 못했어요. 다시 시도해주세요.'));
          }}
        >
          {playing ? 'Ⅱ' : '▶'}
        </PreviewButton>
        <ClipArchiveSeek
          className="clip-archive-seek"
          type="range"
          aria-label={`${asset.name} 재생 위치`}
          min={0}
          max={duration || 1}
          step={0.01}
          value={Math.min(time, duration)}
          disabled={!duration}
          onPointerDown={(event) => {
            if (!duration || !player.current) return;
            const rect = event.currentTarget.getBoundingClientRect();
            const next = Math.max(
              0,
              Math.min(duration, ((event.clientX - rect.left) / rect.width) * duration),
            );
            player.current.currentTime = next;
            setTime(next);
          }}
          onChange={(event) => {
            const next = Number(event.target.value);
            if (player.current) player.current.currentTime = next;
            setTime(next);
          }}
          $percent={percent}
        />
        <PreviewLabel>
          {label(time)} / {label(duration)}
        </PreviewLabel>
      </PreviewContainer>
      {error && (
        <span role="alert">
          {error}{' '}
          <button
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              setAttempt((value) => value + 1);
            }}
          >
            다시 시도
          </button>
        </span>
      )}
    </div>
  );
}
export function ClipLibrary({
  version,
  onChoose,
  kind,
  expanded = false,
}: {
  version: number;
  onChoose?: (blob: Blob, name: string) => void | Promise<void>;
  kind?: 'audio' | 'midi';
  expanded?: boolean;
}) {
  const disclosure = useRef<HTMLDetailsElement>(null);
  const disclosureAnimation = useRef<Animation | null>(null);
  const disclosureTarget = useRef<boolean | null>(null);
  useEffect(() => () => disclosureAnimation.current?.cancel(), []);
  const toggleDisclosure = () => {
    const details = disclosure.current;
    if (!details) return;
    const nextOpen = !(disclosureTarget.current ?? details.open);
    const startHeight = details.getBoundingClientRect().height;
    disclosureAnimation.current?.cancel();
    disclosureAnimation.current = null;
    disclosureTarget.current = nextOpen;
    if (!nextOpen) details.querySelectorAll('audio').forEach((audio) => audio.pause());
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      details.open = nextOpen;
      disclosureTarget.current = null;
      return;
    }
    // Keep the content visible until the closing animation finishes.
    details.open = true;
    const endHeight = nextOpen
      ? details.getBoundingClientRect().height
      : details.querySelector('summary')!.getBoundingClientRect().height;
    const animation = details.animate(
      [{ height: `${startHeight}px` }, { height: `${endHeight}px` }],
      { duration: 220, easing: 'cubic-bezier(0.2, 0, 0, 1)' },
    );
    disclosureAnimation.current = animation;
    animation.onfinish = () => {
      if (disclosureAnimation.current !== animation) return;
      details.open = nextOpen;
      disclosureAnimation.current = null;
      disclosureTarget.current = null;
    };
  };
  const userId = useIdentity();
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [renaming, setRenaming] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [attempt, setAttempt] = useState(0);
  const load = useCallback(() => listPersonalClips(userId), [userId]);
  useEffect(() => {
    const refresh = () => setAttempt((value) => value + 1);
    window.addEventListener(clipLibraryChanged, refresh);
    return () => window.removeEventListener(clipLibraryChanged, refresh);
  }, []);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setAssets([]);
    setError('');
    void load()
      .then((items) => {
        if (active)
          setAssets(
            kind
              ? items.filter(
                  (item) => (item.kind === 'midi' || isMidiFile(item)) === (kind === 'midi'),
                )
              : items,
          );
      })
      .catch((failure: Error) => {
        if (active) setError(failure.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [load, version, attempt, kind]);
  const perform = async (action: () => Promise<void>) => {
    setBusy(true);
    setError('');
    try {
      await action();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : '클립 작업에 실패했어요.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Surface>
      <ClipLibraryDetails
        ref={disclosure}

        open={onChoose || expanded ? true : undefined}
        onToggle={(event) => {
          if (!event.currentTarget.open)
            event.currentTarget.querySelectorAll('audio').forEach((audio) => audio.pause());
        }}
      >
        <ClipLibraryToggle
          className="clip-library-toggle"
          onClick={(event) => {
            event.preventDefault();
            if (!expanded) toggleDisclosure();
          }}
          $expanded={expanded}
        >
          <ClipLibraryLabel>클립 보관함</ClipLibraryLabel>
          <ClipLibraryRefresh
            className="clip-library-refresh"

            disabled={busy || loading}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              setAttempt((value) => value + 1);
            }}
          >
            <span aria-hidden="true">↻</span> 새로고침
          </ClipLibraryRefresh>
        </ClipLibraryToggle>
        <ClipLibraryContainer data-clip-library>
          <Meta>이 브라우저에 개인용으로 보관하며, 모든 밴드의 곡에서 가져올 수 있어요.</Meta>
          {loading && <Meta>클립 불러오는 중…</Meta>}
          {error && <div role="alert">{error}</div>}
          {!loading && !assets.length && (
            <Meta>보관된 클립이 없어요. DAW에서 클립을 선택하고 ‘클립 보관하기’를 눌러주세요.</Meta>
          )}
          {assets.map((asset) => {
            const canDelete = asset.ownerId === userId;
            return (
              <ClipLibraryContainer2 key={asset.id}>
                <PreviewContainer>
                  <ClipLibraryStrong>{asset.name}</ClipLibraryStrong>
                  <ClipLibraryLabel2>{asset.memo}</ClipLibraryLabel2>
                  {onChoose && (
                    <button
                      disabled={busy || loading}
                      onClick={() =>
                        void perform(async () => {
                          const blob = asset.blob;
                          if (!blob || blob.size > 104857600)
                            throw new Error('100MB 이하의 클립만 가져올 수 있어요.');
                          if (alive.current) await onChoose(blob, asset.name);
                        })
                      }
                    >
                      가져오기
                    </button>
                  )}
                  <ClipMenu label={`${asset.name} 메뉴`}>
                    <button
                      disabled={!canDelete || busy}
                      onClick={() => {
                        setRenaming(asset.id);
                        setNewName(asset.name);
                      }}
                    >
                      이름 수정하기
                    </button>
                    <button
                      disabled={busy}
                      onClick={() => {
                        setEditing(asset.id);
                        setDraft(asset.memo ?? '');
                      }}
                    >
                      클립 메모하기
                    </button>
                    <button
                      disabled={busy || !asset.blob?.size}
                      onClick={() => {
                        const midi = asset.kind === 'midi' || isMidiFile(asset);
                        const type = (asset.blob.type || asset.type).split(';')[0];
                        const extension = midi
                          ? 'mid'
                          : (
                              {
                                'audio/wav': 'wav',
                                'audio/x-wav': 'wav',
                                'audio/mpeg': 'mp3',
                                'audio/mp4': 'm4a',
                                'audio/webm': 'webm',
                                'audio/ogg': 'ogg',
                                'audio/flac': 'flac',
                                'audio/aac': 'aac',
                              } as Record<string, string>
                            )[type];
                        const name = asset.name.replace(/[\\/:*?"<>|]/g, '_');
                        downloadBlob(
                          extension &&
                            !/\.(mid|midi|wav|mp3|m4a|mp4|webm|ogg|flac|aac)$/i.test(name)
                            ? name + '.' + extension
                            : name,
                          asset.blob,
                        );
                      }}
                    >
                      클립 다운로드
                    </button>
                    <ClipLibraryButton
                      disabled={!canDelete || busy}
                      title={canDelete ? undefined : '저장한 멤버만 삭제할 수 있어요.'}
                      onClick={() => {
                        void perform(async () => {
                          await deletePersonalClip(userId, asset.id);
                          setAssets((all) => all.filter((item) => item.id !== asset.id));
                        });
                      }}
                    >
                      클립 삭제하기
                    </ClipLibraryButton>
                  </ClipMenu>
                </PreviewContainer>
                {renaming === asset.id && (
                  <ClipLibraryContainer3>
                    <ClipLibraryInput
                      aria-label="보관된 클립 이름"
                      autoFocus
                      maxLength={255}
                      value={newName}
                      onChange={(event) => setNewName(event.target.value)}
                    />
                    <button
                      disabled={busy || !newName.trim()}
                      onClick={() =>
                        void perform(async () => {
                          const name = newName.trim();
                          await updatePersonalClip(userId, asset.id, { name });
                          setAssets((all) =>
                            all.map((item) => (item.id === asset.id ? { ...item, name } : item)),
                          );
                          setRenaming(null);
                        })
                      }
                    >
                      저장
                    </button>
                    <button onClick={() => setRenaming(null)}>취소</button>
                  </ClipLibraryContainer3>
                )}
                {asset.kind === 'midi' || isMidiFile(asset) ? (
                  <Meta>MIDI 파일</Meta>
                ) : (
                  <Preview asset={asset} />
                )}
                {editing === asset.id && (
                  <ClipLibraryContainer3>
                    <ClipLibraryTextarea
                      aria-label={`${asset.name} 메모`}
                      autoFocus
                      maxLength={2000}
                      value={draft}
                      onChange={(event) => setDraft(event.target.value)}
                    />
                    <button
                      disabled={busy}
                      onClick={() =>
                        void perform(async () => {
                          const memo = draft.trim();
                          await updatePersonalClip(userId, asset.id, { memo });
                          setAssets((all) =>
                            all.map((item) => (item.id === asset.id ? { ...item, memo } : item)),
                          );
                          setEditing(null);
                        })
                      }
                    >
                      저장
                    </button>
                    <button onClick={() => setEditing(null)}>취소</button>
                  </ClipLibraryContainer3>
                )}
              </ClipLibraryContainer2>
            );
          })}
        </ClipLibraryContainer>
      </ClipLibraryDetails>
    </Surface>
  );
}

const PreviewContainer = styledWeb('div')({
  '&&&&': { display: 'flex', alignItems: 'center', gap: 10 },
});

const PreviewButton = styledWeb('button')({
  '&&&&': {
    background: '#2563eb',
    color: '#fff',
    border: 0,
    borderRadius: 6,
    padding: '6px 10px',
  },
});

const ClipArchiveSeek = styledWeb('input')<{ $percent: number }>(({ $percent }) => ({
  '&&&&': {
    flex: 1,
    minWidth: 0,
    height: 8,
    borderRadius: 4,
    appearance: 'none',
    accentColor: '#1d4ed8',
    background: `linear-gradient(to right, #1d4ed8 ${$percent}%, #cbd5e1 ${$percent}%)`,
  },
}));

const PreviewLabel = styledWeb('span')({
  '&&&&': { fontSize: 12, color: '#334155', whiteSpace: 'nowrap' },
});

const ClipLibraryDetails = styledWeb('details')({
  '&&&&': { position: 'relative', overflow: 'hidden' },
});

const ClipLibraryToggle = styledWeb('summary')<{ $expanded: boolean }>(({ $expanded }) => ({
  '&&&&': {
    display: $expanded ? 'none' : 'flex',
    alignItems: 'center',
    gap: 16,
    fontWeight: 600,
    padding: '4px 0',
    listStyle: 'none',
    cursor: 'pointer',
  },
}));

const ClipLibraryLabel = styledWeb('span')({ '&&&&': { cursor: 'pointer' } });

const ClipLibraryRefresh = styledWeb('button')({ '&&&&': { position: 'static', flexShrink: 0 } });

const ClipLibraryContainer = styledWeb('div')({
  '&&&&': { display: 'flex', flexDirection: 'column', gap: 10 },
});

const ClipLibraryContainer2 = styledWeb('div')({
  '&&&&': {
    background: '#f1f5fb',
    border: '1px solid #dce4ef',
    borderRadius: 8,
    padding: 10,
    display: 'flex',
    flexDirection: 'column',
    gap: 7,
  },
});

const ClipLibraryStrong = styledWeb('strong')({ '&&&&': { overflowWrap: 'anywhere' } });

const ClipLibraryLabel2 = styledWeb('span')({
  '&&&&': {
    flex: 1,
    minWidth: 0,
    color: '#64748b',
    overflowWrap: 'anywhere',
    whiteSpace: 'pre-wrap',
  },
});

const ClipLibraryButton = styledWeb('button')({
  '&&&&': {
    color: '#be4b55',
    background: '#fff1f2',
    border: '1px solid #fecdd3',
    borderRadius: 4,
  },
});

const ClipLibraryContainer3 = styledWeb('div')({ '&&&&': { display: 'flex', gap: 8 } });

const ClipLibraryInput = styledWeb('input')({ '&&&&': { flex: 1, minWidth: 0 } });

const ClipLibraryTextarea = styledWeb('textarea')({ '&&&&': { flex: 1, minWidth: 0 } });
