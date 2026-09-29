import { useEffect, useRef, useState } from 'react';
import { AppShell } from '../components/AppShell';
import { ActionButton, FlexRow, Heading, Meta, Surface } from '../components/ProductUI';
import { Input } from '../styles/layout';
import { readMedia, writeMedia } from '../lib/mediaStore';
import { downloadText } from '../lib/platformActions';
import { pitchName, scoreToMusicXml, type Score } from '../lib/score';
import { useMockAppState } from '../state/MockAppState';
import type { ScreenProps } from '../navigation';
export function ScoreEditorScreen({ navigate, entityId }: ScreenProps) {
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
  useEffect(() => {
    let active = true;
    loadedKey.current = '';
    setReady(false);
    setHistory([]);
    setFuture([]);
    void readMedia<Score>(key)
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
  }, [key]);
  useEffect(() => {
    if (ready && loadedKey.current === key)
      void writeMedia(key, score)
        .then(() => setMessage('저장됨 · 비공개'))
        .catch(() => setMessage('저장에 실패했습니다. 파일로 내보내주세요.'));
  }, [key, ready, score]);
  function edit(next: Score) {
    setHistory((all) => [...all.slice(-49), score]);
    setFuture([]);
    setScore(next);
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
            <ActionButton key={name} secondary={part !== name} onPress={() => setPart(name)}>
              {name}
            </ActionButton>
          ))}
        </FlexRow>
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
          disabled={!ready}
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
              <Meta>
                {index + 1}. {note.rest ? '쉼표' : pitchName(note.pitch)} · {note.beats}박
              </Meta>
              <ActionButton
                secondary
                onPress={() =>
                  edit({ ...score, notes: score.notes.filter((item) => item.id !== note.id) })
                }
              >
                삭제
              </ActionButton>
            </FlexRow>
          ))}
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
