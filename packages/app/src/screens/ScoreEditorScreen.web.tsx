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
import {
  scoreToMusicXml,
  pitchName,
  renameScorePart,
  removeScorePart,
  removeScoreNotes,
  insertScoreNote,
  moveScoreNote,
  type Score,
  type ScoreNote as Note,
} from '../lib/score';
import { ScoreStaff } from '../components/ScoreStaff.web';
import { useIdentity } from '../state/Identity';
export function ScoreEditorScreen({ navigate, entityId }: ScreenProps) {
  const userId = useIdentity();
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
  const [partName, setPartName] = useState('');
  const [partMessage, setPartMessage] = useState('');
  const [confirmPartDelete, setConfirmPartDelete] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  useEffect(() => {
    alive.current = true;
    let active = true;
    loadedKey.current = '';
    setLoaded(false);
    setHistory([]);
    setFuture([]);
    setSelected(null);
    setPlaying(false);
    void readMedia<Score & { referenceAudio?: Blob }>(key, userId)
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
      .catch(() => {
        if (active) setStatus('악보를 불러오지 못했습니다. 새로고침해주세요.');
      });
    return () => {
      active = false;
      alive.current = false;
      timers.current.forEach(clearTimeout);
      void context.current?.close();
    };
  }, [key, userId]);
  useEffect(() => {
    if (!loaded || loadedKey.current !== key) return;
    let active = true;
    setSaveFailed(false);
    setStatus('저장 중…');
    void writeMedia(key, { ...score, referenceAudio }, userId)
      .then(() => {
        if (active) setStatus('자동 저장됨');
      })
      .catch((error: unknown) => {
        if (active) {
          setSaveFailed(true);
          setStatus(
            error instanceof Error ? error.message : '저장 실패 · 내보내기로 보관해주세요.',
          );
        }
      });
    return () => {
      active = false;
    };
  }, [key, score, loaded, referenceAudio, userId]);
  useEffect(() => {
    if (!score.parts.includes(part)) setPart(score.parts[0] ?? 'Guitar');
    if (selected && !score.notes.some((note) => note.id === selected && note.part === part))
      setSelected(null);
  }, [score, part, selected]);
  useEffect(
    () => () => {
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    },
    [audioUrl],
  );
  const edit = (next: Score) => {
    if (!loaded || playing) return;
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
      <Meta accessibilityLiveRegion="polite" style={saveFailed ? { color: '#be3b4b' } : undefined}>
        개인 악보 · {status}
      </Meta>
      <Meta>
        4/4박자 · 파트별 단선율 악보. 음표를 선택해 수정하거나 복제하고, MusicXML로 내보낼 수
        있어요.
      </Meta>
      <Surface>
        <Input
          accessibilityLabel="악보 제목"
          value={score.title}
          editable={loaded && !playing}
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
            disabled={!loaded || playing}
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
          <ActionButton secondary disabled={!loaded} onPress={exportXml}>
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
            disabled={!loaded || playing}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              if (file.size > 5 * 1024 * 1024) {
                setStatus('5MB 이하 MusicXML 파일을 선택해주세요.');
                return;
              }
              void file
                .text()
                .then((text) => {
                  if (!alive.current || loadedKey.current !== key) return;
                  try {
                    const doc = new DOMParser().parseFromString(text, 'application/xml');
                    if (doc.querySelector('parsererror') || !doc.querySelector('score-partwise'))
                      throw new Error();
                    const names = Array.from(doc.querySelectorAll('score-part')).map(
                      (element) => element.querySelector('part-name')?.textContent || 'Part',
                    );
                    const partNames = new Map(
                      Array.from(doc.querySelectorAll('score-part')).map((element, index) => [
                        element.getAttribute('id'),
                        names[index],
                      ]),
                    );
                    const notes: Note[] = [];
                    if (doc.querySelector('backup,forward,chord,grace,time-modification'))
                      throw new Error();
                    if (
                      Array.from(doc.querySelectorAll('time')).some(
                        (time) =>
                          time.querySelector('beats')?.textContent !== '4' ||
                          time.querySelector('beat-type')?.textContent !== '4',
                      )
                    )
                      throw new Error();
                    if (
                      Array.from(doc.querySelectorAll('key fifths')).some(
                        (key) => Number(key.textContent) !== 0,
                      )
                    )
                      throw new Error();
                    if (new Set(names).size !== names.length) throw new Error();
                    Array.from(doc.querySelectorAll('part')).forEach((element) => {
                      const partName = partNames.get(element.getAttribute('id'));
                      if (!partName) throw new Error();
                      let tied: Note | undefined;
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
                          const item: Note = {
                            id: crypto.randomUUID(),
                            part: partName,
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
                          };
                          if (node.querySelector('tie[type="stop"]')) {
                            if (!tied || tied.pitch !== item.pitch || item.rest) throw new Error();
                            tied.beats += item.beats;
                          } else {
                            if (tied) throw new Error();
                            notes.push(item);
                          }
                          tied = node.querySelector('tie[type="start"]')
                            ? (tied ?? item)
                            : undefined;
                        });
                      });
                      if (tied) throw new Error();
                    });
                    if (!names.length || names.length > 16 || notes.length > 2000)
                      throw new Error();
                    if (
                      notes.some(
                        (item) =>
                          !Number.isFinite(item.beats) ||
                          item.beats <= 0 ||
                          item.beats > 64 ||
                          !Number.isInteger(item.beats * 4) ||
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
                      '4/4박자·조표 없는 단선율 MusicXML을 선택해주세요. 최대 16파트·2,000개 음표를 지원하며 다성부·꾸밈음·잇단음표는 지원하지 않습니다.',
                    );
                  }
                })
                .catch(() => setStatus('파일을 읽지 못했어요. 다시 선택해주세요.'));
              event.target.value = '';
            }}
          />
        </label>
      </Surface>
      <Surface>
        <FlexRow wrap>
          {score.parts.map((name) => (
            <Pill
              key={name}
              accessibilityRole="button"
              accessibilityState={{ selected: part === name }}
              active={part === name}
              onPress={() => {
                stop();
                setPart(name);
                setSelected(null);
                setConfirmPartDelete(false);
                setPartName('');
              }}
            >
              <PillText active={part === name}>{name}</PillText>
            </Pill>
          ))}
        </FlexRow>
        <FlexRow wrap>
          <Input
            accessibilityLabel="파트 이름"
            placeholder="예: 리드 기타"
            value={partName}
            maxLength={40}
            editable={loaded && !playing}
            onChangeText={setPartName}
            style={{ minWidth: 160, flex: 1 }}
          />
          <ActionButton
            secondary
            disabled={!loaded || playing || !partName.trim()}
            onPress={() => {
              try {
                const next = renameScorePart(score, null, partName);
                edit(next);
                setPart(partName.trim());
                setPartName('');
                setPartMessage('');
                setConfirmPartDelete(false);
              } catch (error) {
                setPartMessage((error as Error).message);
              }
            }}
          >
            파트 추가
          </ActionButton>
          <ActionButton
            secondary
            disabled={!loaded || playing || !partName.trim()}
            onPress={() => {
              try {
                edit(renameScorePart(score, part, partName));
                setPart(partName.trim());
                setPartName('');
                setPartMessage('');
              } catch (error) {
                setPartMessage((error as Error).message);
              }
            }}
          >
            이름 변경
          </ActionButton>
          <ActionButton
            secondary
            danger
            disabled={!loaded || playing || score.parts.length <= 1}
            onPress={() => setConfirmPartDelete(!confirmPartDelete)}
          >
            파트 삭제
          </ActionButton>
        </FlexRow>
        {!!partMessage && <Meta accessibilityRole="alert">{partMessage}</Meta>}
        {confirmPartDelete && (
          <FlexRow wrap>
            <Meta>
              {part}의 음표 {visible.length}개도 삭제됩니다. 되돌리기로 복원할 수 있어요.
            </Meta>
            <ActionButton
              danger
              disabled={!loaded || playing}
              onPress={() => {
                edit(removeScorePart(score, part));
                setConfirmPartDelete(false);
              }}
            >
              삭제 적용
            </ActionButton>
            <ActionButton secondary onPress={() => setConfirmPartDelete(false)}>
              취소
            </ActionButton>
          </FlexRow>
        )}
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
              try {
                edit(insertScoreNote(score, item, selected));
                setSelected(item.id);
              } catch (error) {
                setPartMessage((error as Error).message);
              }
            }}
          >
            {selected ? '선택 뒤에 추가' : '음표 추가'}
          </ActionButton>
          <ActionButton
            secondary
            disabled={!loaded || playing || score.notes.length >= 2000}
            onPress={() => {
              const used = visible.reduce((sum, item) => sum + item.beats, 0) % 4;
              const item: Note = {
                id: crypto.randomUUID(),
                part,
                pitch: 60,
                beats: used ? 4 - used : 4,
                rest: true,
                chord: '',
                lyric: '',
                accent: false,
              };
              edit(insertScoreNote(score, item));
              setSelected(item.id);
            }}
          >
            쉼표로 마디 채우기
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
        <ScoreStaff
          score={score}
          part={part}
          selected={selected}
          cursor={cursor}
          zoom={zoom}
          onSelect={setSelected}
        />
        {/* Accessible note list complements the staff. */}

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
            <ActionButton
              secondary
              disabled={playing}
              onPress={() => update({ pitch: Math.min(127, note.pitch + 1) })}
            >
              반음 올림
            </ActionButton>
            <ActionButton
              secondary
              disabled={playing}
              onPress={() => update({ pitch: Math.max(0, note.pitch - 1) })}
            >
              반음 내림
            </ActionButton>
            <ActionButton secondary onPress={() => update({ beats, rest })}>
              선택한 길이·종류 적용
            </ActionButton>
            <ActionButton
              secondary
              disabled={!loaded || playing || score.notes.length >= 2000}
              onPress={() => {
                const copy = { ...note, id: crypto.randomUUID() };
                edit(insertScoreNote(score, copy, note.id));
                setSelected(copy.id);
              }}
            >
              음표 복제
            </ActionButton>
            <ActionButton
              secondary
              disabled={playing || visible[0]?.id === note.id}
              onPress={() => edit(moveScoreNote(score, note.id, -1))}
            >
              앞으로 이동
            </ActionButton>
            <ActionButton
              secondary
              disabled={playing || visible.at(-1)?.id === note.id}
              onPress={() => edit(moveScoreNote(score, note.id, 1))}
            >
              뒤로 이동
            </ActionButton>
            <ActionButton
              secondary
              disabled={playing}
              onPress={() => update({ accent: !note.accent })}
            >
              {note.accent ? '악센트 해제' : '악센트'}
            </ActionButton>
            <ActionButton
              secondary
              danger
              onPress={() => {
                edit(removeScoreNotes(score, [note.id]));
                setSelected(null);
              }}
            >
              삭제
            </ActionButton>
          </FlexRow>
          <Input
            accessibilityLabel="선택 음표 코드"
            editable={!playing}
            value={note.chord}
            onChangeText={(chord) => update({ chord })}
            placeholder="코드"
          />
          <Input
            accessibilityLabel="선택 음표 가사"
            editable={!playing}
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
