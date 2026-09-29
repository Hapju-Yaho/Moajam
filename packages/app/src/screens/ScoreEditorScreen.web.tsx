import { useEffect, useRef, useState } from 'react';
import { AppShell } from '../components/AppShell';
import {
  ActionButton,
  Copy,
  FlexRow,
  Heading,
  Meta,
  PageHeading,
  Pill,
  PillText,
  Surface,
} from '../components/ProductUI';
import { Input } from '../styles/layout';
import { readMedia, writeMedia } from '../lib/mediaStore';
import { downloadText } from '../lib/platformActions';
import { useMockAppState, useWorkspaceValue } from '../state/MockAppState';
import type { ScreenProps } from '../navigation';
import { scoreToMusicXml, pitchName, type Score, type ScoreNote as Note } from '../lib/score';
export function ScoreEditorScreen({ navigate, entityId }: ScreenProps) {
  const { workspaceId, adoptedSongs } = useMockAppState();
  const song = adoptedSongs.find((item) => item.id === entityId);
  const defaultTitle = useRef('나의 악보');
  defaultTitle.current = song?.title ?? '나의 악보';
  const [arrangement] = useWorkspaceValue(`song/${entityId}/arrangement`, {
    key: '',
    bpm: '',
    structure: '',
  });
  const key = `score/${entityId ? workspaceId + '/' + entityId : 'personal'}`;
  const [score, setScore] = useState<Score>({
    title: song?.title ?? '나의 악보',
    bpm: 120,
    notes: [],
    parts: ['Guitar', 'Vocal', 'Bass', 'Drums'],
    sync: {},
  });
  const [history, setHistory] = useState<Score[]>([]);
  const [future, setFuture] = useState<Score[]>([]);
  const [loaded, setLoaded] = useState(false);
  const loadedKey = useRef('');
  const [status, setStatus] = useState('악보 불러오는 중…');
  const [part, setPart] = useState('Guitar');
  const [selected, setSelected] = useState<string | null>(null);
  const [pitch, setPitch] = useState(60);
  const [beats, setBeats] = useState(1);
  const [rest, setRest] = useState(false);
  const [zoom, setZoom] = useState(100);
  const [playing, setPlaying] = useState(false);
  const [cursor, setCursor] = useState<string | null>(null);
  const context = useRef<AudioContext | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const alive = useRef(true);
  const audio = useRef<HTMLAudioElement | null>(null);
  const [audioUrl, setAudioUrl] = useState('');
  const [referenceAudio, setReferenceAudio] = useState<Blob | null>(null);
  const [audioPosition, setAudioPosition] = useState(0);
  useEffect(() => {
    alive.current = true;
    let active = true;
    loadedKey.current = '';
    setLoaded(false);
    setHistory([]);
    setFuture([]);
    setSelected(null);
    setPlaying(false);
    void readMedia<Score & { referenceAudio?: Blob }>(key)
      .then((value) => {
        if (active) {
          setReferenceAudio(value?.referenceAudio ?? null);
          setAudioUrl(value?.referenceAudio ? URL.createObjectURL(value.referenceAudio) : '');
          setAudioPosition(0);
          if (value) {
            setScore(value);
            setPart(value.parts[0] ?? 'Guitar');
          } else
            setScore({
              title: defaultTitle.current,
              bpm: 120,
              notes: [],
              parts: ['Guitar', 'Vocal', 'Bass', 'Drums'],
              sync: {},
            });
          loadedKey.current = key;
          setLoaded(true);
          setStatus('저장됨');
        }
      })
      .catch(() => setStatus('악보를 불러오지 못했습니다. 새로고침해주세요.'));
    return () => {
      active = false;
      alive.current = false;
      timers.current.forEach(clearTimeout);
      void context.current?.close();
    };
  }, [key]);
  useEffect(() => {
    if (!loaded || loadedKey.current !== key) return;
    setStatus('저장 중…');
    void writeMedia(key, { ...score, referenceAudio })
      .then(() => {
        if (alive.current) setStatus('자동 저장됨');
      })
      .catch(() => {
        if (alive.current) setStatus('저장 실패 · 내보내기로 보관해주세요.');
      });
  }, [key, score, loaded, referenceAudio]);
  useEffect(
    () => () => {
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    },
    [audioUrl],
  );
  const edit = (next: Score) => {
    setHistory((all) => [...all.slice(-49), score]);
    setFuture([]);
    setScore(next);
  };
  const update = (changes: Partial<Note>) => {
    edit({
      ...score,
      notes: score.notes.map((note) => (note.id === selected ? { ...note, ...changes } : note)),
    });
  };
  const visible = score.notes.filter((note) => note.part === part);
  const note = score.notes.find((note) => note.id === selected);
  const stop = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    void context.current?.close();
    context.current = null;
    setPlaying(false);
    setCursor(null);
    audio.current?.pause();
  };
  const play = () => {
    if (playing) {
      stop();
      return;
    }
    if (!visible.length) return;
    const ctx = new AudioContext();
    context.current = ctx;
    setPlaying(true);
    let elapsed = 0;
    for (const item of visible) {
      const duration = (item.beats * 60) / score.bpm;
      timers.current.push(setTimeout(() => setCursor(item.id), elapsed * 1000));
      if (!item.rest) {
        const oscillator = ctx.createOscillator();
        const gain = ctx.createGain();
        oscillator.frequency.value = 440 * Math.pow(2, (item.pitch - 69) / 12);
        gain.gain.setValueAtTime(0.12, ctx.currentTime + elapsed);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + elapsed + duration * 0.95);
        oscillator.connect(gain).connect(ctx.destination);
        oscillator.start(ctx.currentTime + elapsed);
        oscillator.stop(ctx.currentTime + elapsed + duration);
      }
      elapsed += duration;
    }
    timers.current.push(setTimeout(stop, elapsed * 1000 + 50));
  };
  const exportXml = () => {
    try {
      downloadText(
        `${score.title}.musicxml`,
        scoreToMusicXml(score),
        'application/vnd.recordare.musicxml+xml',
      );
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '내보내기에 실패했습니다.');
    }
  };
  return (
    <AppShell activeRoute="score-editor" onNavigate={navigate}>
      <PageHeading>악보 편집</PageHeading>
      {song && (
        <ActionButton
          secondary
          onPress={() => navigate('song', { id: song.id, workspaceId, songTab: 'resources' })}
        >
          ← {song.title} 자료로 돌아가기
        </ActionButton>
      )}
      <Meta>개인 악보 · {status}</Meta>
      <Surface>
        <Input
          accessibilityLabel="악보 제목"
          value={score.title}
          editable={loaded}
          onChangeText={(title) => edit({ ...score, title })}
        />
        <FlexRow wrap>
          <Meta>BPM</Meta>
          <input
            aria-label="악보 BPM"
            type="number"
            min="30"
            max="300"
            value={score.bpm}
            onChange={(event) =>
              edit({ ...score, bpm: Math.min(300, Math.max(30, Number(event.target.value) || 30)) })
            }
          />
          {!!arrangement.bpm && song && (
            <ActionButton
              secondary
              compact
              disabled={!loaded || playing}
              onPress={() =>
                edit({ ...score, bpm: Math.max(30, Math.min(300, Number(arrangement.bpm) || 120)) })
              }
            >
              밴드 기준 {arrangement.bpm} BPM 가져오기
            </ActionButton>
          )}
          <ActionButton
            secondary
            disabled={!history.length || playing}
            onPress={() => {
              setFuture((all) => [score, ...all]);
              setScore(history[history.length - 1]);
              setHistory(history.slice(0, -1));
            }}
          >
            되돌리기
          </ActionButton>
          <ActionButton
            secondary
            disabled={!future.length || playing}
            onPress={() => {
              setHistory((all) => [...all, score]);
              setScore(future[0]);
              setFuture(future.slice(1));
            }}
          >
            다시 실행
          </ActionButton>
          <ActionButton secondary onPress={exportXml}>
            MusicXML 내보내기
          </ActionButton>
          <ActionButton secondary onPress={() => window.print()}>
            인쇄 / PDF
          </ActionButton>
        </FlexRow>
        <label>
          MusicXML 가져오기{' '}
          <input
            type="file"
            accept=".musicxml,.xml"
            aria-label="MusicXML 가져오기"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              if (file.size > 5 * 1024 * 1024) {
                setStatus('5MB 이하 MusicXML 파일을 선택해주세요.');
                return;
              }
              void file.text().then((text) => {
                try {
                  const doc = new DOMParser().parseFromString(text, 'application/xml');
                  if (doc.querySelector('parsererror') || !doc.querySelector('score-partwise'))
                    throw new Error();
                  const names = Array.from(doc.querySelectorAll('score-part')).map(
                    (element) => element.querySelector('part-name')?.textContent || 'Part',
                  );
                  const notes: Note[] = [];
                  if (doc.querySelector('backup,forward,chord,grace,time-modification'))
                    throw new Error();
                  if (new Set(names).size !== names.length) throw new Error();
                  Array.from(doc.querySelectorAll('part')).forEach((element, index) => {
                    let division = 1;
                    element.querySelectorAll('measure').forEach((measure) => {
                      division =
                        Number(measure.querySelector('divisions')?.textContent) || division;
                      measure.querySelectorAll('note').forEach((node) => {
                        const step = node.querySelector('step')?.textContent || 'C';
                        const octave = Number(node.querySelector('octave')?.textContent || 4);
                        const alter = Number(node.querySelector('alter')?.textContent || 0);
                        const pitch =
                          (octave + 1) * 12 +
                          ({ C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[step as 'C'] ?? 0) +
                          alter;
                        notes.push({
                          id: crypto.randomUUID(),
                          part: names[index] || 'Part',
                          pitch,
                          beats:
                            (Number(node.querySelector('duration')?.textContent) || division) /
                            division,
                          rest: !!node.querySelector('rest'),
                          lyric: node.querySelector('lyric text')?.textContent || '',
                          chord:
                            node.previousElementSibling?.querySelector('direction-type words')
                              ?.textContent || '',
                          accent: !!node.querySelector('accent'),
                        });
                      });
                    });
                  });
                  if (!names.length || notes.length > 2000) throw new Error();
                  if (
                    notes.some(
                      (item) =>
                        !Number.isFinite(item.beats) ||
                        item.beats <= 0 ||
                        item.beats > 64 ||
                        !Number.isInteger(item.pitch) ||
                        item.pitch < 0 ||
                        item.pitch > 127,
                    )
                  )
                    throw new Error();
                  edit({
                    title: doc.querySelector('work-title')?.textContent || file.name,
                    bpm: Math.max(
                      30,
                      Math.min(
                        300,
                        Number(doc.querySelector('sound[tempo]')?.getAttribute('tempo')) || 120,
                      ),
                    ),
                    parts: names,
                    notes,
                    sync: {},
                  });
                  setPart(names[0]);
                  setSelected(null);
                } catch {
                  setStatus(
                    '파트별 단선율 MusicXML을 선택해주세요. 최대 2,000개 음표를 지원하며 다성부·꾸밈음·잇단음표는 지원하지 않습니다.',
                  );
                }
              });
            }}
          />
        </label>
      </Surface>
      <Surface>
        <FlexRow wrap>
          {score.parts.map((name) => (
            <Pill
              key={name}
              active={part === name}
              onPress={() => {
                stop();
                setPart(name);
                setSelected(null);
              }}
            >
              <PillText>{name}</PillText>
            </Pill>
          ))}
        </FlexRow>
        <Heading>{part}</Heading>
        <FlexRow wrap>
          <label>
            음정{' '}
            <select
              aria-label="입력 음정"
              value={pitch}
              onChange={(event) => setPitch(Number(event.target.value))}
            >
              {Array.from({ length: 37 }, (_, i) => i + 48).map((value) => (
                <option key={value} value={value}>
                  {pitchName(value)}
                </option>
              ))}
            </select>
          </label>
          <label>
            길이{' '}
            <select
              aria-label="음표 길이"
              value={beats}
              onChange={(event) => setBeats(Number(event.target.value))}
            >
              {[0.25, 0.5, 1, 2, 4].map((value) => (
                <option key={value} value={value}>
                  {value}박
                </option>
              ))}
            </select>
          </label>
          <ActionButton secondary onPress={() => setRest(!rest)}>
            {rest ? '쉼표 입력' : '음표 입력'}
          </ActionButton>
          <ActionButton
            disabled={!loaded || playing}
            onPress={() => {
              const item = {
                id: crypto.randomUUID(),
                part,
                pitch,
                beats,
                rest,
                chord: '',
                lyric: '',
                accent: false,
              };
              edit({ ...score, notes: [...score.notes, item] });
              setSelected(item.id);
            }}
          >
            추가
          </ActionButton>
          <ActionButton secondary disabled={!visible.length} onPress={play}>
            {playing ? '재생 정지' : '파트 재생'}
          </ActionButton>
          <ActionButton secondary onPress={() => setZoom(Math.max(50, zoom - 10))}>
            −
          </ActionButton>
          <Meta>{zoom}%</Meta>
          <ActionButton secondary onPress={() => setZoom(Math.min(180, zoom + 10))}>
            +
          </ActionButton>
        </FlexRow>
        <div style={{ overflowX: 'auto', background: '#fffdfa', borderRadius: 12, padding: 12 }}>
          <svg
            role="img"
            aria-label={`${part} 악보`}
            width={(Math.max(600, visible.length * 64 + 80) * zoom) / 100}
            height={(230 * zoom) / 100}
            viewBox={`0 0 ${Math.max(600, visible.length * 64 + 80)} 230`}
          >
            {[60, 75, 90, 105, 120].map((y) => (
              <line
                key={y}
                x1="20"
                x2={Math.max(580, visible.length * 64 + 60)}
                y1={y}
                y2={y}
                stroke="#9da5b3"
              />
            ))}
            <text x="22" y="111" fontSize="50">
              𝄞
            </text>
            {visible.map((item, index) => {
              const x = 80 + index * 64;
              const y = Math.max(35, Math.min(155, 120 - (item.pitch - 60) * 3.7));
              return (
                <g key={item.id} onClick={() => setSelected(item.id)} style={{ cursor: 'pointer' }}>
                  <rect
                    x={x - 16}
                    y="15"
                    width="56"
                    height="190"
                    fill={
                      cursor === item.id
                        ? '#d4e6ff'
                        : selected === item.id
                          ? '#edf3ff'
                          : 'transparent'
                    }
                  />
                  {item.rest ? (
                    <text x={x} y="95" fontSize="25">
                      𝄽
                    </text>
                  ) : (
                    <>
                      <ellipse
                        cx={x + 8}
                        cy={y}
                        rx="8"
                        ry="5"
                        fill={item.beats >= 2 ? 'white' : '#34415a'}
                        stroke="#34415a"
                      />
                      {item.beats < 4 ? (
                        <line x1={x + 16} x2={x + 16} y1={y} y2={y - 32} stroke="#34415a" />
                      ) : null}
                    </>
                  )}
                  <text x={x - 8} y="30" fontSize="12">
                    {item.chord}
                  </text>
                  <text x={x - 8} y="175" fontSize="11">
                    {item.rest ? '쉼표' : pitchName(item.pitch)}
                  </text>
                  <text x={x - 8} y="192" fontSize="10">
                    {item.beats}박
                  </text>
                  <text x={x - 8} y="220" fontSize="11">
                    {item.lyric.slice(0, 5)}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
        <FlexRow wrap>
          {visible.map((item, index) => (
            <ActionButton key={item.id} secondary compact onPress={() => setSelected(item.id)}>
              {index + 1}: {item.rest ? '쉼표' : pitchName(item.pitch)}
            </ActionButton>
          ))}
        </FlexRow>
        {!visible.length ? <Meta>음정과 길이를 고른 뒤 첫 음표를 추가해보세요.</Meta> : null}
      </Surface>
      {note ? (
        <Surface>
          <Heading>선택한 음표</Heading>
          <Copy>
            {pitchName(note.pitch)} · {note.beats}박
          </Copy>
          <FlexRow wrap>
            <ActionButton secondary onPress={() => update({ pitch: Math.min(96, note.pitch + 1) })}>
              반음 올림
            </ActionButton>
            <ActionButton secondary onPress={() => update({ pitch: Math.max(24, note.pitch - 1) })}>
              반음 내림
            </ActionButton>
            <ActionButton secondary onPress={() => update({ beats, rest })}>
              선택한 길이·종류 적용
            </ActionButton>
            <ActionButton
              secondary
              danger
              onPress={() => {
                edit({ ...score, notes: score.notes.filter((item) => item.id !== selected) });
                setSelected(null);
              }}
            >
              삭제
            </ActionButton>
          </FlexRow>
          <Input
            value={note.chord}
            onChangeText={(chord) => update({ chord })}
            placeholder="코드"
          />
          <Input
            value={note.lyric}
            onChangeText={(lyric) => update({ lyric })}
            placeholder="가사"
          />
        </Surface>
      ) : null}
      <Surface>
        <Heading>기준 음원과 싱크</Heading>
        <input
          aria-label="악보 기준 음원"
          disabled={!loaded}
          type="file"
          accept="audio/*"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) {
              if (file.size > 104857600) {
                setStatus('100MB 이하 음원을 선택해주세요.');
                return;
              }
              setReferenceAudio(file);
              setAudioUrl(URL.createObjectURL(file));
            }
          }}
        />
        {audioUrl ? (
          <audio
            ref={audio}
            controls
            src={audioUrl}
            onTimeUpdate={(event) => {
              const time = event.currentTarget.currentTime;
              setAudioPosition(time);
              const current = Object.entries(score.sync)
                .filter(([, value]) => value <= time)
                .sort((a, b) => b[1] - a[1])[0];
              if (current) setCursor(current[0]);
            }}
            style={{ width: '100%' }}
          />
        ) : null}
        <Meta>
          {audioPosition.toFixed(2)}초 · 음표를 선택해 현재 음원 위치와 연결하세요. 기준 음원도
          비공개로 저장됩니다.
        </Meta>
        <ActionButton
          secondary
          disabled={!selected || !audioUrl}
          onPress={() => {
            if (selected) edit({ ...score, sync: { ...score.sync, [selected]: audioPosition } });
          }}
        >
          선택 음표 싱크 저장
        </ActionButton>
        <ActionButton
          secondary
          onPress={() =>
            navigate('personal-practice', entityId ? { id: entityId, workspaceId } : undefined)
          }
        >
          연습실로 이동
        </ActionButton>
      </Surface>
    </AppShell>
  );
}
