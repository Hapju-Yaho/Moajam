import { createPortal } from 'react-dom';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AppShell } from '../components/AppShell';
import { ActionButton, Meta, PageHeading } from '../components/ProductUI';
import { SongPdfLibrary } from '../components/SongPdfLibrary.web';
import { SongLyricsPanel } from '../components/SongLyrics.web';
import { ReferenceVideo } from '../components/ReferenceVideo';
import { PracticeStudio } from '../components/PracticeStudio';
import { AppIcon } from '../components/icons';
import { BandScoreProjects } from './BandScoreEditorScreen.web';
import { useMockAppState, WorkspaceScopeProvider } from '../state/MockAppState';
import { useIdentity } from '../state/Identity';
import { readMedia, writeMedia } from '../lib/mediaStore.web';
import { clientId } from '../lib/clientId';
import type { ScreenProps } from '../navigation';
import './PersonalPracticeScreen.web.css';
import { PracticeSectionHeading } from '../components/PracticeSectionHeading.web';

type PracticeList = { id: string; name: string; songs: string[] };
type Preferences = {
  lists: PracticeList[];
  allOrder?: string[];
  list: string;
  song: string;
  views: Record<string, 'recording' | 'score' | 'lyrics' | 'pdf'>;
};
const empty: Preferences = { lists: [], list: 'all', song: '', views: {} };
const songKey = (song: { workspaceId: string; id: string }) =>
  JSON.stringify([song.workspaceId, song.id]);
const storageKey = 'local-recording/practice-lists';

export function PersonalPracticeScreen(props: ScreenProps) {
  const user = useIdentity();
  return <PersonalPracticeWorkspace key={user} {...props} user={user} />;
}

function PersonalPracticeWorkspace({ navigate, user, entityId }: ScreenProps & { user: string }) {
  const { allSongs, workspaceId, workspaces } = useMockAppState();
  const [preferences, setPreferences] = useState<Preferences>(empty);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [picker, setPicker] = useState(false);
  const [creating, setCreating] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [listMenu, setListMenu] = useState(false);
  const listMenuRef = useRef<HTMLDivElement>(null);
  const [dragOrder, setDragOrder] = useState<string[] | null>(null);
  const [ghost, setGhost] = useState<{ key: string; x: number; y: number; width: number } | null>(
    null,
  );
  const drag = useRef<{
    key: string;
    selectedKey: string;
    x: number;
    y: number;
    left: number;
    top: number;
    width: number;
    order: string[];
    active: boolean;
  } | null>(null);
  const rows = useRef<HTMLElement | null>(null);
  const positions = useRef(new Map<string, number>());
  const [name, setName] = useState('');
  const [renameError, setRenameError] = useState('');
  const [query, setQuery] = useState('');
  const [band, setBand] = useState('all');
  const [checked, setChecked] = useState<string[]>([]);
  const [mobileList, setMobileList] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    let active = true;
    void readMedia<Preferences>(storageKey, user)
      .then((value) => {
        if (!active) return;
        const initialSong =
          entityId &&
          allSongs.find((song) => song.id === entityId && song.workspaceId === workspaceId);
        setPreferences({
          ...(value ?? empty),
          ...(initialSong ? { song: songKey(initialSong), list: 'all' } : {}),
        });
        setReady(true);
      })
      .catch((e) => {
        if (active) setError(e instanceof Error ? e.message : '연습 목록을 불러오지 못했어요.');
      });
    return () => {
      active = false;
    };
    // Read once per signed-in user; workspace updates must not overwrite the working list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);
  const update = (next: Preferences) => {
    setPreferences(next);
    void writeMedia(storageKey, next, user)
      .then(() => setError(''))
      .catch((e) => setError(e instanceof Error ? e.message : '연습 목록을 저장하지 못했어요.'));
  };
  const guarded = (action: () => void) => {
    if (
      window.dispatchEvent(
        new CustomEvent('moajam:before-navigate', { cancelable: true, detail: action }),
      )
    )
      action();
  };
  useEffect(() => {
    if (picker || creating) dialog.current?.showModal();
    else dialog.current?.close();
  }, [picker, creating]);
  const custom = preferences.lists.find((list) => list.id === preferences.list);
  const commitName = () => {
    if (!renaming) return;
    const trimmed = name.trim();
    if (
      !trimmed ||
      preferences.lists.some((list) => list.id !== renaming && list.name === trimmed)
    ) {
      setRenameError(!trimmed ? '목록 이름을 입력해주세요.' : '같은 이름의 연습 목록이 있어요.');
      return;
    }
    update({
      ...preferences,
      lists: preferences.lists.map((list) =>
        list.id === renaming ? { ...list, name: trimmed } : list,
      ),
    });
    setRenaming(null);
    setRenameError('');
  };
  const available = new Map(allSongs.map((song) => [songKey(song), song]));
  const allOrder = [...new Set([...(preferences.allOrder ?? []), ...available.keys()])].filter(
    (key) => available.has(key),
  );
  const order = custom ? custom.songs : allOrder;
  const orderKey = order.join('|');
  const songs = order.flatMap((key) => {
    const song = available.get(key);
    return song ? [song] : [];
  });
  useEffect(() => {
    if (!listMenu) return;
    const dismiss = (event: PointerEvent) => {
      if (event.target instanceof Node && !listMenuRef.current?.contains(event.target))
        setListMenu(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setListMenu(false);
        listMenuRef.current
          ?.querySelector<HTMLButtonElement>('.personal-practice-list-trigger')
          ?.focus();
      }
    };
    document.addEventListener('pointerdown', dismiss);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', dismiss);
      document.removeEventListener('keydown', escape);
    };
  }, [listMenu]);
  useLayoutEffect(() => {
    const next = new Map<string, number>();
    rows.current?.querySelectorAll<HTMLElement>('[data-practice-song]').forEach((row) => {
      const key = row.dataset.practiceSong!;
      const top = row.offsetTop;
      const previous = positions.current.get(key);
      if (
        previous !== undefined &&
        previous !== top &&
        !window.matchMedia('(prefers-reduced-motion: reduce)').matches
      )
        row.animate(
          [{ transform: `translateY(${previous - top}px)` }, { transform: 'translateY(0)' }],
          { duration: 180, easing: 'ease-out' },
        );
      next.set(key, top);
    });
    positions.current = next;
  }, [orderKey]);
  const saveOrder = (next: string[]) =>
    update(
      custom
        ? {
            ...preferences,
            song: drag.current?.selectedKey ?? selectedKey,
            lists: preferences.lists.map((list) =>
              list.id === custom.id ? { ...list, songs: next } : list,
            ),
          }
        : { ...preferences, song: drag.current?.selectedKey ?? selectedKey, allOrder: next },
    );
  const selected =
    songs.find((song) => songKey(song) === (drag.current?.selectedKey ?? preferences.song)) ??
    songs[0];
  const selectedKey = selected ? songKey(selected) : '';
  const index = songs.findIndex((song) => songKey(song) === selectedKey);
  const view = preferences.views[selectedKey] ?? 'recording';
  const choose = (key: string) =>
    guarded(() => {
      update({ ...preferences, song: key });
      setMobileList(false);
    });
  const finishDrag = (commit: boolean) => {
    const current = drag.current;
    if (commit && current?.active) saveOrder(current.order);
    drag.current = null;
    setDragOrder(null);
    setGhost(null);
  };
  const deleteList = (list: PracticeList) => {
    if (!window.confirm(`‘${list.name}’ 연습 목록을 삭제할까요? 밴드의 원본 곡은 유지돼요.`))
      return;
    const action = () =>
      update({
        ...preferences,
        lists: preferences.lists.filter((item) => item.id !== list.id),
        ...(preferences.list === list.id ? { list: 'all', song: '' } : {}),
      });
    if (preferences.list === list.id) guarded(action);
    else action();
  };
  const filtered = allSongs.filter(
    (song) =>
      (band === 'all' || song.workspaceId === band) &&
      `${song.title} ${song.artist} ${song.bandName}`
        .toLowerCase()
        .includes(query.trim().toLowerCase()),
  );
  return (
    <AppShell activeRoute="personal-practice" onNavigate={navigate} hideSyncControls>
      <PageHeading>연습하기</PageHeading>
      <Meta>
        여러 밴드의 곡을 한 목록에 모아 순서대로 연습해요. 연습 목록은 이 기기에 저장돼요.
      </Meta>
      {error && <p role="alert">{error}</p>}
      <div className="personal-practice-layout">
        <div className="personal-practice-sidebar">
          <div className="personal-practice-toolbar">
            <div className="personal-practice-list-chooser" ref={listMenuRef}>
              <button
                className="personal-practice-list-trigger"
                aria-label="연습 목록 선택"
                aria-expanded={listMenu}
                disabled={!ready}
                onClick={() => setListMenu(!listMenu)}
              >
                <strong>{custom?.name ?? '전체 참여곡'}</strong>
                <AppIcon name="chevron-down" size={16} />
              </button>
              {listMenu && (
                <div className="personal-practice-list-menu" aria-label="연습 목록">
                  <div className="personal-practice-list-menu-heading">연습 목록</div>
                  {[{ id: 'all', name: '전체 참여곡', songs: allOrder }, ...preferences.lists].map(
                    (list) => (
                      <div
                        key={list.id}
                        className="personal-practice-list-option"
                        data-active={(custom?.id ?? 'all') === list.id}
                      >
                        <button
                          className="personal-practice-list-option-name"
                          title={list.name}
                          onClick={() => {
                            if (list.id === preferences.list) {
                              setListMenu(false);
                              return;
                            }
                            guarded(() => {
                              update({ ...preferences, list: list.id, song: '' });
                              setListMenu(false);
                            });
                          }}
                        >
                          <span>
                            <strong>{list.name}</strong>
                            <small>
                              {list.songs.filter((key) => available.has(key)).length}곡
                              {list.id === 'all' ? ' · 기본 목록' : ''}
                            </small>
                          </span>
                          {(custom?.id ?? 'all') === list.id && (
                            <span className="personal-practice-list-check">✓</span>
                          )}
                        </button>
                        {list.id !== 'all' && (
                          <button
                            className="personal-practice-list-remove"
                            aria-label={`${list.name} 연습 목록 삭제`}
                            onClick={() => deleteList(list)}
                          >
                            ×
                          </button>
                        )}
                      </div>
                    ),
                  )}
                </div>
              )}
            </div>
            <ActionButton
              nativeID="personal-practice-create-list"
              secondary
              compact
              disabled={!ready}
              onPress={() => {
                setRenaming(null);
                setRenameError('');
                setName('');
                setCreating(true);
              }}
            >
              + 연습 목록 만들기
            </ActionButton>
          </div>
          <button
            className="personal-practice-mobile-toggle"
            onClick={() => setMobileList(!mobileList)}
            aria-expanded={mobileList}
          >
            {selected?.title ?? '연습할 곡 목록'} <AppIcon name="chevron-down" size={16} />
          </button>
          <aside
            className="personal-practice-list"
            data-mobile-open={mobileList}
            ref={rows}
            aria-label="연습할 곡 목록"
          >
            <header>
              <div className="personal-practice-list-title">
                {custom && renaming === custom.id ? (
                  <input
                    autoFocus
                    aria-label="연습 목록 이름"
                    maxLength={80}
                    value={name}
                    onChange={(e) => {
                      setName(e.target.value);
                      setRenameError('');
                    }}
                    onBlur={commitName}
                    onKeyDown={(e) => {
                      if (e.nativeEvent.isComposing) return;
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        commitName();
                      } else if (e.key === 'Escape') {
                        e.preventDefault();
                        setRenaming(null);
                        setRenameError('');
                      }
                    }}
                  />
                ) : (
                  <>
                    <h2>{custom?.name ?? '전체 참여곡'}</h2>
                    {custom && (
                      <button
                        className="personal-practice-rename"
                        aria-label="연습 목록 이름 수정"
                        title="이름 수정"
                        onClick={() => {
                          setName(custom.name);
                          setRenaming(custom.id);
                          setRenameError('');
                        }}
                      >
                        <svg
                          viewBox="0 0 24 24"
                          width="17"
                          height="17"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.7"
                          aria-hidden="true"
                        >
                          <path d="m15 5 4 4M4 20l4-1L20 7a2.8 2.8 0 0 0-4-4L4 15z" />
                        </svg>
                      </button>
                    )}
                  </>
                )}
              </div>
              <span>{songs.length}곡</span>
            </header>
            {renameError && <p role="alert">{renameError}</p>}
            {!ready ? (
              <p>연습 목록을 불러오는 중…</p>
            ) : !songs.length ? (
              <p>
                {custom ? '곡 추가를 눌러 연습할 곡을 담아주세요.' : '현재 참여 중인 곡이 없어요.'}
              </p>
            ) : (
              songs.map((song, i) => {
                const key = songKey(song);
                return (
                  <div
                    className="personal-practice-song"
                    data-selected={key === selectedKey}
                    key={key}
                    data-practice-song={key}
                    data-dragging={ghost?.key === key}
                    style={
                      dragOrder
                        ? {
                            transform: `translateY(${(positions.current.get(order[dragOrder.indexOf(key)]) ?? 0) - (positions.current.get(key) ?? 0)}px)`,
                            transition: 'transform 180ms ease-out',
                          }
                        : undefined
                    }
                  >
                    <button
                      type="button"
                      className="personal-practice-drag"
                      aria-label={`${song.title} 순서 변경`}
                      title="드래그해서 순서 변경"
                      style={{ touchAction: 'none' }}
                      onPointerDown={(e) => {
                        if (e.button !== 0) return;
                        e.preventDefault();
                        const rect = e.currentTarget
                          .closest<HTMLElement>('[data-practice-song]')!
                          .getBoundingClientRect();
                        drag.current = {
                          key,
                          selectedKey,
                          x: e.clientX,
                          y: e.clientY,
                          left: rect.left,
                          top: rect.top,
                          width: rect.width,
                          order: [...order],
                          active: false,
                        };
                        e.currentTarget.setPointerCapture(e.pointerId);
                      }}
                      onPointerMove={(e) => {
                        const current = drag.current;
                        if (!current) return;
                        if (e.buttons && !e.currentTarget.hasPointerCapture(e.pointerId))
                          e.currentTarget.setPointerCapture(e.pointerId);
                        if (
                          !current.active &&
                          Math.hypot(e.clientX - current.x, e.clientY - current.y) < 5
                        )
                          return;
                        current.active = true;
                        setGhost({
                          key: current.key,
                          x: current.left + e.clientX - current.x,
                          y: current.top + e.clientY - current.y,
                          width: current.width,
                        });
                        const bounds = rows.current?.getBoundingClientRect();
                        if (bounds && rows.current) {
                          if (e.clientY < bounds.top + 45) rows.current.scrollTop -= 12;
                          else if (e.clientY > bounds.bottom - 45) rows.current.scrollTop += 12;
                        }
                        const list = rows.current;
                        if (!list) return;
                        const localY =
                          e.clientY - list.getBoundingClientRect().top + list.scrollTop;
                        const items = [
                          ...list.querySelectorAll<HTMLElement>('[data-practice-song]'),
                        ];
                        let targetIndex = items.findIndex(
                          (row) => localY < row.offsetTop + row.offsetHeight / 2,
                        );
                        if (targetIndex === -1) targetIndex = items.length - 1;
                        targetIndex = Math.min(targetIndex, items.length - 1);
                        const next = order.filter((item) => item !== current.key);
                        next.splice(targetIndex, 0, current.key);
                        if (next.join('|') !== current.order.join('|')) {
                          current.order = next;
                          setDragOrder(next);
                        }
                      }}
                      onPointerUp={() => finishDrag(true)}
                      onPointerCancel={() => finishDrag(false)}
                      onLostPointerCapture={(e) => {
                        if (drag.current && !e.buttons) finishDrag(false);
                      }}
                      onKeyDown={(e) => {
                        if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
                        e.preventDefault();
                        const next = [...order];
                        const to = i + (e.key === 'ArrowUp' ? -1 : 1);
                        if (to < 0 || to >= next.length) return;
                        [next[i], next[to]] = [next[to], next[i]];
                        saveOrder(next);
                      }}
                    >
                      ⠿
                    </button>
                    <button
                      className="personal-practice-song-select"
                      aria-current={key === selectedKey ? 'true' : undefined}
                      onClick={() => choose(key)}
                    >
                      <span className="personal-practice-song-number">{i + 1}</span>
                      <span>
                        <strong>{song.title}</strong>
                        <small>
                          {song.bandName} · {song.artist}
                        </small>
                      </span>
                    </button>
                    {custom && (
                      <div className="personal-practice-song-actions">
                        <button
                          aria-label={`${song.title} 목록에서 빼기`}
                          onClick={() =>
                            guarded(() =>
                              update({
                                ...preferences,
                                lists: preferences.lists.map((list) =>
                                  list.id === custom.id
                                    ? { ...list, songs: list.songs.filter((item) => item !== key) }
                                    : list,
                                ),
                              }),
                            )
                          }
                        >
                          ×
                        </button>
                      </div>
                    )}
                  </div>
                );
              })
            )}
            {custom && (
              <button
                className="personal-practice-add"
                onClick={() => {
                  setChecked([]);
                  setQuery('');
                  setBand('all');
                  setPicker(true);
                }}
              >
                + 곡 추가
              </button>
            )}
          </aside>
        </div>
        <section className="personal-practice-content" aria-label="현재 선택한 곡">
          {ready && selected ? (
            <WorkspaceScopeProvider id={selected.workspaceId}>
              <div key={selectedKey}>
                <div className="personal-practice-hero">
                  <div className="personal-practice-current">
                    <div>
                      <small>{selected.bandName}</small>
                      <h2>{selected.title}</h2>
                      <p>{selected.artist}</p>
                    </div>
                    <div className="personal-practice-next">
                      <button
                        disabled={index <= 0}
                        onClick={() => choose(songKey(songs[index - 1]))}
                      >
                        ‹ 이전 곡
                      </button>
                      <button
                        disabled={index >= songs.length - 1}
                        onClick={() => choose(songKey(songs[index + 1]))}
                      >
                        다음 곡 ›
                      </button>
                    </div>
                  </div>
                  <div className="personal-practice-video">
                    {selected.referenceUrl ? (
                      <ReferenceVideo
                        key={selectedKey}
                        referenceUrl={selected.referenceUrl}
                        thumbnailUrl={selected.thumbnailUrl}
                        title={selected.title}
                        showOriginalLink={false}
                        openExternally
                      />
                    ) : (
                      <div className="personal-practice-video-empty">등록된 곡 영상이 없어요.</div>
                    )}
                    <div className="personal-practice-resources">
                      <button
                        aria-pressed={view === 'recording'}
                        onClick={() =>
                          guarded(() =>
                            update({
                              ...preferences,
                              views: { ...preferences.views, [selectedKey]: 'recording' },
                            }),
                          )
                        }
                      >
                        녹음실
                      </button>
                      <button
                        aria-pressed={view === 'score'}
                        onClick={() =>
                          guarded(() =>
                            update({
                              ...preferences,
                              views: { ...preferences.views, [selectedKey]: 'score' },
                            }),
                          )
                        }
                      >
                        악보 프로젝트
                      </button>
                      <button
                        aria-pressed={view === 'pdf'}
                        onClick={() =>
                          guarded(() =>
                            update({
                              ...preferences,
                              views: { ...preferences.views, [selectedKey]: 'pdf' },
                            }),
                          )
                        }
                      >
                        PDF 악보
                      </button>
                      <button
                        aria-pressed={view === 'lyrics'}
                        onClick={() =>
                          guarded(() =>
                            update({
                              ...preferences,
                              views: { ...preferences.views, [selectedKey]: 'lyrics' },
                            }),
                          )
                        }
                      >
                        가사 보기
                      </button>
                    </div>
                  </div>
                </div>
                {view !== 'recording' && (
                  <PracticeSectionHeading
                    title={
                      view === 'score' ? '악보 프로젝트' : view === 'pdf' ? 'PDF 악보' : '가사 보기'
                    }
                  />
                )}
                {view === 'recording' ? (
                  <PracticeStudio scopeKey={`${selected.workspaceId}/${selected.id}`} />
                ) : view === 'lyrics' ? (
                  <SongLyricsPanel songId={selected.id} title={selected.title} />
                ) : view === 'pdf' ? (
                  <SongPdfLibrary embedded songId={selected.id} title={selected.title} />
                ) : (
                  <BandScoreProjects
                    embedded
                    navigate={navigate}
                    entityId={selected.id}
                    songId={selected.id}
                    title={selected.title}
                  />
                )}
              </div>
            </WorkspaceScopeProvider>
          ) : (
            <div className="personal-practice-empty">
              {ready ? '목록에서 연습할 곡을 선택해주세요.' : '연습 화면을 준비하는 중…'}
            </div>
          )}
        </section>
      </div>
      {ghost &&
        createPortal(
          <div
            className="personal-practice-drag-ghost"
            style={{ width: ghost.width, transform: `translate3d(${ghost.x}px,${ghost.y}px,0)` }}
          >
            <span aria-hidden="true">⠿</span>
            <div>
              <strong>{available.get(ghost.key)?.title}</strong>
              <small>
                {available.get(ghost.key)?.bandName} · {available.get(ghost.key)?.artist}
              </small>
            </div>
          </div>,
          document.body,
        )}
      <dialog
        ref={dialog}
        className="personal-practice-dialog"
        onCancel={() => {
          setPicker(false);
          setCreating(false);
          setRenaming(null);
        }}
        onClick={(e) => {
          if (e.target === e.currentTarget) {
            setPicker(false);
            setCreating(false);
            setRenaming(null);
          }
        }}
      >
        {creating ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const trimmed = name.trim();
              if (
                !trimmed ||
                preferences.lists.some((list) => list.id !== renaming && list.name === trimmed)
              )
                return;
              const list = { id: clientId(), name: trimmed, songs: [] };
              guarded(() => {
                update({
                  ...preferences,
                  lists: [...preferences.lists, list],
                  list: list.id,
                  song: '',
                });
                setCreating(false);
                setChecked([]);
                setPicker(true);
              });
            }}
          >
            <h2>{renaming ? '연습 목록 이름 수정' : '연습 목록 만들기'}</h2>
            <label>
              목록 이름
              <input
                autoFocus
                maxLength={80}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="예: 오늘 연습"
              />
            </label>
            {name.trim() &&
              preferences.lists.some(
                (list) => list.id !== renaming && list.name === name.trim(),
              ) && <p role="alert">같은 이름의 연습 목록이 있어요.</p>}
            <footer>
              <button
                type="button"
                onClick={() => {
                  setCreating(false);
                  setRenaming(null);
                }}
              >
                취소
              </button>
              <button
                disabled={
                  !name.trim() ||
                  preferences.lists.some(
                    (list) => list.id !== renaming && list.name === name.trim(),
                  )
                }
              >
                {renaming ? '저장' : '만들기'}
              </button>
            </footer>
          </form>
        ) : (
          <>
            <h2>연습할 곡 추가</h2>
            <div className="personal-practice-picker-filters">
              <input
                aria-label="곡 검색"
                placeholder="곡 제목, 아티스트, 밴드 검색"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <select aria-label="밴드 필터" value={band} onChange={(e) => setBand(e.target.value)}>
                <option value="all">모든 밴드</option>
                {workspaces.map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="personal-practice-picker-songs">
              {filtered.map((song) => {
                const key = songKey(song),
                  added = custom?.songs.includes(key);
                return (
                  <label key={key}>
                    <input
                      type="checkbox"
                      disabled={added}
                      checked={added || checked.includes(key)}
                      onChange={(e) =>
                        setChecked(
                          e.target.checked
                            ? [...checked, key]
                            : checked.filter((item) => item !== key),
                        )
                      }
                    />
                    <span>
                      <strong>{song.title}</strong>
                      <small>
                        {song.bandName} · {song.artist}
                        {added ? ' · 추가됨' : ''}
                      </small>
                    </span>
                  </label>
                );
              })}
              {!filtered.length && <p>검색 결과가 없어요.</p>}
            </div>
            <footer>
              <button onClick={() => setPicker(false)}>취소</button>
              <button
                disabled={!checked.length || !custom}
                onClick={() => {
                  if (!custom) return;
                  update({
                    ...preferences,
                    lists: preferences.lists.map((list) =>
                      list.id === custom.id
                        ? { ...list, songs: [...new Set([...list.songs, ...checked])] }
                        : list,
                    ),
                  });
                  setPicker(false);
                }}
              >
                {checked.length}곡 추가
              </button>
            </footer>
          </>
        )}
      </dialog>
    </AppShell>
  );
}
