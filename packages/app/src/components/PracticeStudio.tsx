import { useEffect, useRef, useState } from 'react';
import {
  useAudioPlayer,
  useAudioPlayerStatus,
  useAudioRecorder,
  useAudioRecorderState,
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
} from 'expo-audio';
import { getDocumentAsync } from 'expo-document-picker';
import { ActionButton, Heading, Meta, Surface, FlexRow } from './ProductUI';
import { Input } from '../styles/layout';
import { readMedia, writeMedia } from '../lib/mediaStore';
import { keepNativeFile } from '../lib/nativeStorage';
import { usePreferences } from '../state/preferences';
type Track = { id: string; name: string; uri: string };
function NativeTrack({ track, onDelete }: { track: Track; onDelete: () => void }) {
  const player = useAudioPlayer(track.uri);
  const status = useAudioPlayerStatus(player);
  const preferences = usePreferences();
  useEffect(() => {
    player.volume = preferences.volume;
  }, [player, preferences.volume]);
  return (
    <Surface>
      <Heading>{track.name}</Heading>
      <Meta>
        {Math.floor(status.currentTime)}초 / {Math.floor(status.duration)}초
      </Meta>
      <FlexRow wrap>
        <ActionButton
          onPress={() => {
            if (status.playing) player.pause();
            else {
              if (status.didJustFinish) void player.seekTo(0).then(() => player.play());
              else player.play();
            }
          }}
        >
          {status.playing ? '일시 정지' : '재생'}
        </ActionButton>
        <ActionButton secondary onPress={() => void player.seekTo(0)}>
          처음으로
        </ActionButton>
        <ActionButton secondary onPress={onDelete}>
          목록에서 삭제
        </ActionButton>
      </FlexRow>
    </Surface>
  );
}
export function PracticeStudio({ scopeKey }: { scopeKey: string; bpm?: number }) {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [memo, setMemo] = useState('');
  const [ready, setReady] = useState(false);
  const loadedScope = useRef('');
  const extras = useRef<Record<string, unknown>>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recording = useAudioRecorderState(recorder);
  useEffect(() => {
    let alive = true;
    setReady(false);
    loadedScope.current = '';
    void readMedia<{ tracks: Track[]; memo: string }>(`practice/${scopeKey}`)
      .then((saved) => {
        if (alive) {
          setTracks(saved?.tracks ?? []);
          setMemo(saved?.memo ?? '');
          extras.current = saved ?? {};
          loadedScope.current = scopeKey;
          setReady(true);
        }
      })
      .catch(() => {
        if (alive) setError('연습 기록을 불러오지 못했습니다.');
      });
    return () => {
      alive = false;
    };
  }, [scopeKey]);
  useEffect(() => {
    if (ready && loadedScope.current === scopeKey)
      void writeMedia(`practice/${scopeKey}`, { ...extras.current, tracks, memo }).catch(
        (failure: unknown) =>
          setError(failure instanceof Error ? failure.message : '기록 저장에 실패했습니다.'),
      );
  }, [tracks, memo, scopeKey, ready]);
  async function record() {
    setBusy(true);
    setError('');
    try {
      if (recording.isRecording) {
        await recorder.stop();
        await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
        if (recorder.uri) {
          const name = `녹음 ${new Date().toLocaleString('ko-KR')}`;
          const uri = keepNativeFile(recorder.uri, 'recording.m4a');
          setTracks((all) => [...all, { id: uri, uri, name }]);
        }
      } else {
        const permission = await requestRecordingPermissionsAsync();
        if (!permission.granted) throw new Error('설정에서 마이크 접근을 허용해주세요.');
        await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
        await recorder.prepareToRecordAsync();
        recorder.record();
      }
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : '녹음하지 못했습니다.');
    } finally {
      setBusy(false);
    }
  }
  async function upload() {
    setBusy(true);
    try {
      const result = await getDocumentAsync({ type: 'audio/*', copyToCacheDirectory: true });
      if (result.canceled) return;
      const file = result.assets[0];
      if ((file.size ?? 0) > 104857600) throw new Error('100MB 이하 음원을 선택해주세요.');
      const uri = keepNativeFile(file.uri, file.name);
      setTracks((all) => [...all, { id: uri, uri, name: file.name }]);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : '파일을 가져오지 못했습니다.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <Surface>
      <Heading>연습 녹음과 음원</Heading>
      <Meta>음원과 메모를 이 기기에 보관합니다. 녹음을 중지한 후 화면을 이동해주세요.</Meta>
      <FlexRow wrap>
        <ActionButton
          disabled={!ready || busy || recording.isRecording}
          onPress={() => void upload()}
        >
          음원 추가
        </ActionButton>
        <ActionButton disabled={!ready || busy} onPress={() => void record()}>
          {recording.isRecording
            ? `녹음 중지 · ${Math.floor(recording.durationMillis / 1000)}초`
            : '녹음 시작'}
        </ActionButton>
      </FlexRow>
      {error ? <Meta accessibilityRole="alert">{error}</Meta> : null}
      {tracks.map((track) => (
        <NativeTrack
          key={track.id}
          track={track}
          onDelete={() => setTracks((all) => all.filter((item) => item.id !== track.id))}
        />
      ))}
      <Input
        multiline
        placeholder="연습 메모"
        value={memo}
        onChangeText={setMemo}
        editable={ready}
      />
    </Surface>
  );
}
