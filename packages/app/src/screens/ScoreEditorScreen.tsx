import { useEffect, useRef, useState } from 'react';
import { AppShell } from '../components/AppShell';
import { ActionButton, FlexRow, Heading, Meta, Surface } from '../components/ProductUI';
import { Input } from '../styles/layout';
import { readMedia, writeMedia } from '../lib/mediaStore';
import { downloadText } from '../lib/platformActions';
import {
  pitchName,
  scoreToMusicXml,
  renameScorePart,
  removeScorePart,
  removeScoreNotes,
  insertScoreNote,
  moveScoreNote,
  type Score,
  type ScoreNote,
} from '../lib/score';
import { useIdentity } from '../state/Identity';
import { useMockAppState } from '../state/MockAppState';
import type { ScreenProps } from '../navigation';
export function ScoreEditorScreen({ navigate, entityId }: ScreenProps) {
  const userId = useIdentity();
  const { workspaceId, adoptedSongs } = useMockAppState();
  const key = `score/${entityId ? workspaceId + '/' + entityId : 'personal'}`;
  const defaultTitle = useRef('나의 악보');
  defaultTitle.current = adoptedSongs.find((song) => song.id === entityId)?.title ?? '나의 악보';
  const [score, setScore] = useState<Score>({
    title: adoptedSongs.find((song) => song.id === entityId)?.title ?? '나의 악보',
    bpm: 120,
    notes: [],
    parts: ['Guitar', 'Vocal', 'Bass', 'Drums'],
    sync: {},
  });
  const [ready, setReady] = useState(false);
  const loadedKey = useRef('');
  const [message, setMessage] = useState('');
  const [part, setPart] = useState('Guitar');
  const [pitch, setPitch] = useState(60);
  const [beats, setBeats] = useState(1);
  const [rest, setRest] = useState(false);
  const [history, setHistory] = useState<Score[]>([]);
  const [future, setFuture] = useState<Score[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [partName, setPartName] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const note = score.notes.find((item) => item.id === selected && item.part === part);
  const visible = score.notes.filter((item) => item.part === part);
  useEffect(() => {
    let active = true;
    loadedKey.current = '';
    setReady(false);
    setHistory([]);
    setFuture([]);
    void readMedia<Score>(key, userId)
      .then((value) => {
        if (active) {
          if (value) {
            setScore(value);
            setPart(value.parts[0]);
          } else
            setScore({
              title: defaultTitle.current,
              bpm: 120,
              notes: [],
              parts: ['Guitar', 'Vocal', 'Bass', 'Drums'],
              sync: {},
            });
          loadedKey.current = key;
          setReady(true);
        }
      })
      .catch(() => setMessage('악보를 불러오지 못했습니다.'));
    return () => {
      active = false;
    };
  }, [key, userId]);
  useEffect(() => {
    if (!ready || loadedKey.current !== key) return;
    let active = true;
    setMessage('저장 중…');
    void writeMedia(key, score, userId)
      .then(() => {
        if (active) setMessage('저장됨 · 비공개');
      })
      .catch(() => {
        if (active) setMessage('저장에 실패했습니다. 파일로 내보내주세요.');
      });
    return () => {
      active = false;
    };
  }, [key, ready, score, userId]);
  useEffect(() => {
    if (!score.parts.includes(part)) setPart(score.parts[0]);
  }, [score.parts, part]);
  function edit(next: Score) {
    if (!ready) return;
    setHistory((all) => [...all.slice(-49), score]);
    setFuture([]);
    setScore(next);
  }
  function update(changes: Partial<ScoreNote>) {
    edit({
      ...score,
      notes: score.notes.map((item) => (item.id === selected ? { ...item, ...changes } : item)),
    });
  }
  return (
    <AppShell activeRoute="score-editor" onNavigate={navigate}>
      <Heading>악보 편집</Heading>
      {entityId && (
        <ActionButton
          secondary
          onPress={() => navigate('song', { id: entityId, workspaceId, songTab: 'resources' })}
        >
          ← 곡 자료로 돌아가기
        </ActionButton>
      )}
      <Meta>{message}</Meta>
      <Surface>
        <Input
          accessibilityLabel="악보 제목"
          value={score.title}
          editable={ready}
          onChangeText={(title) => edit({ ...score, title })}
        />
        <Meta>
          파트별 음표와 쉼표를 입력하고 MusicXML로 공유하세요. 음원 재생과 가져오기는 웹 편집기에서
          지원합니다.
        </Meta>
        <FlexRow wrap>
          {score.parts.map((name) => (
            <ActionButton
              key={name}
              secondary={part !== name}
              onPress={() => {
                setPart(name);
                setSelected(null);
                setConfirmDelete(false);
              }}
            >
              {name}
            </ActionButton>
          ))}
        </FlexRow>
        <Input
          accessibilityLabel="파트 이름"
          placeholder="새 파트 이름"
          maxLength={40}
          value={partName}
          editable={ready}
          onChangeText={setPartName}
        />
        <FlexRow wrap>
          {(['추가', '이름 변경'] as const).map((action) => (
            <ActionButton
              key={action}
              secondary
              disabled={!ready || !partName.trim()}
              onPress={() => {
                try {
                  edit(renameScorePart(score, action === '추가' ? null : part, partName));
                  setPart(partName.trim());
                  setPartName('');
                } catch (error) {
                  setMessage((error as Error).message);
                }
              }}
            >
              파트 {action}
            </ActionButton>
          ))}
          <ActionButton
            secondary
            danger
            disabled={!ready || score.parts.length <= 1}
            onPress={() => setConfirmDelete(!confirmDelete)}
          >
            파트 삭제
          </ActionButton>
        </FlexRow>
        {confirmDelete && (
          <>
            <Meta>{part}의 음표도 삭제됩니다. 되돌리기로 복원할 수 있어요.</Meta>
            <ActionButton
              danger
              onPress={() => {
                edit(removeScorePart(score, part));
                setSelected(null);
                setConfirmDelete(false);
              }}
            >
              삭제 적용
            </ActionButton>
          </>
        )}
        <FlexRow wrap>
          <ActionButton secondary onPress={() => setPitch(Math.max(24, pitch - 1))}>
            반음 내림
          </ActionButton>
          <Heading>{pitchName(pitch)}</Heading>
          <ActionButton secondary onPress={() => setPitch(Math.min(96, pitch + 1))}>
            반음 올림
          </ActionButton>
        </FlexRow>
        <FlexRow wrap>
          {[0.25, 0.5, 1, 2, 4].map((value) => (
            <ActionButton key={value} secondary={beats !== value} onPress={() => setBeats(value)}>
              {value}박
            </ActionButton>
          ))}
        </FlexRow>
        <ActionButton secondary onPress={() => setRest(!rest)}>
          {rest ? '쉼표 입력' : '음표 입력'}
        </ActionButton>
        <ActionButton
          disabled={!ready || score.notes.length >= 2000}
          onPress={() =>
            edit({
              ...score,
              notes: [
                ...score.notes,
                {
                  id: `note-${Date.now()}-${Math.random()}`,
                  pitch,
                  beats,
                  rest,
                  part,
                  chord: '',
                  lyric: '',
                  accent: false,
                },
              ],
            })
          }
        >
          추가
        </ActionButton>
        {score.notes
          .filter((note) => note.part === part)
          .map((note, index) => (
            <FlexRow key={note.id} wrap>
              <ActionButton secondary={selected !== note.id} onPress={() => setSelected(note.id)}>
                {index + 1}. {note.rest ? '쉼표' : pitchName(note.pitch)} · {note.beats}박
              </ActionButton>
              <ActionButton secondary onPress={() => edit(removeScoreNotes(score, [note.id]))}>
                삭제
              </ActionButton>
            </FlexRow>
          ))}
        {note && (
          <Surface>
            <Heading>선택한 음표</Heading>
            <FlexRow wrap>
              <ActionButton secondary onPress={() => update({ pitch, beats, rest })}>
                입력 음정·길이 적용
              </ActionButton>
              <ActionButton
                secondary
                disabled={score.notes.length >= 2000}
                onPress={() => {
                  const copy = { ...note, id: `note-${Date.now()}-${Math.random()}` };
                  edit(insertScoreNote(score, copy, note.id));
                  setSelected(copy.id);
                }}
              >
                음표 복제
              </ActionButton>
              <ActionButton
                secondary
                disabled={visible[0]?.id === note.id}
                onPress={() => edit(moveScoreNote(score, note.id, -1))}
              >
                앞으로 이동
              </ActionButton>
              <ActionButton
                secondary
                disabled={visible.at(-1)?.id === note.id}
                onPress={() => edit(moveScoreNote(score, note.id, 1))}
              >
                뒤로 이동
              </ActionButton>
            </FlexRow>
            <Input
              accessibilityLabel="선택 음표 코드"
              placeholder="코드"
              value={note.chord}
              onChangeText={(chord) => update({ chord })}
            />
            <Input
              accessibilityLabel="선택 음표 가사"
              placeholder="가사"
              value={note.lyric}
              onChangeText={(lyric) => update({ lyric })}
            />
          </Surface>
        )}
        <FlexRow wrap>
          <ActionButton
            secondary
            disabled={!history.length}
            onPress={() => {
              setFuture([score, ...future]);
              setScore(history[history.length - 1]);
              setHistory(history.slice(0, -1));
            }}
          >
            되돌리기
          </ActionButton>
          <ActionButton
            secondary
            disabled={!future.length}
            onPress={() => {
              setHistory([...history, score]);
              setScore(future[0]);
              setFuture(future.slice(1));
            }}
          >
            다시 실행
          </ActionButton>
          <ActionButton
            disabled={!ready}
            onPress={() => {
              try {
                void downloadText(
                  `${score.title}.musicxml`,
                  scoreToMusicXml(score),
                  'application/vnd.recordare.musicxml+xml',
                );
              } catch {
                setMessage('내보내기에 실패했습니다.');
              }
            }}
          >
            MusicXML 공유
          </ActionButton>
        </FlexRow>
      </Surface>
    </AppShell>
  );
}
