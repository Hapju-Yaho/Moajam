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
import { serverConfigured } from '../lib/remote';
import { TrackPartPicker } from './TrackPartPicker';
import { trackPartLabel, validateAudioFile, type TrackPart } from '../lib/trackParts';
type Track = {
  id: string;
  name: string;
  uri?: string;
  part?: TrackPart;
  sourceStart?: number;
  duration?: number;
  trimmed?: boolean;
  clips?: Track[];
};
function NativeTrack({
  track,
  onDelete,
  onPartChange,
}: {
  track: Track;
  onDelete: () => void;
  onPartChange: (part: TrackPart) => void;
}) {
  const [editingPart, setEditingPart] = useState(false);
  const player = useAudioPlayer(track.uri ?? null);
  const status = useAudioPlayerStatus(player);
  const preferences = usePreferences();
  const start = track.sourceStart ?? 0;
  const end = track.trimmed ? start + (track.duration ?? 0) : status.duration;
  useEffect(() => {
    if (track.trimmed && status.playing && status.currentTime >= end) player.pause();
  }, [track.trimmed, status.playing, status.currentTime, end, player]);
  useEffect(() => {
    player.volume = preferences.volume;
  }, [player, preferences.volume]);
  return (
    <Surface>
      <Heading>{track.name}</Heading>
      <ActionButton secondary compact onPress={() => setEditingPart(!editingPart)}>
        {trackPartLabel(track.part)} · 세션 변경
      </ActionButton>
      {editingPart && (
        <TrackPartPicker
          value={track.part ?? 'UNASSIGNED'}
          onChange={(part) => {
            onPartChange(part);
            setEditingPart(false);
          }}
        />
      )}
      <Meta>
        {track.uri
          ? `${Math.max(0, Math.min(end - start, status.currentTime - start)).toFixed(1)}초 / ${Math.max(0, end - start).toFixed(1)}초`
          : '빈 트랙 · 웹 편집기에서 음원을 추가해주세요.'}
      </Meta>
      <FlexRow wrap>
        <ActionButton
          disabled={!track.uri}
          onPress={() => {
            if (status.playing) player.pause();
            else {
              if (status.didJustFinish || status.currentTime < start || status.currentTime >= end)
                void player.seekTo(start).then(() => player.play());
              else player.play();
            }
          }}
        >
          {status.playing ? '일시 정지' : '재생'}
        </ActionButton>
        <ActionButton secondary disabled={!track.uri} onPress={() => void player.seekTo(start)}>
          처음으로
        </ActionButton>
        <ActionButton secondary onPress={onDelete}>
          목록에서 삭제
        </ActionButton>
      </FlexRow>
    </Surface>
  );
}
export function PracticeStudio({
  scopeKey,
  feedback,
}: {
  scopeKey: string;
  bpm?: number;
  feedback?: boolean;
}) {
  const feedbackInput = useRef<import('react-native').TextInput>(null);
  const [uploadPart, setUploadPart] = useState<TrackPart>('UNASSIGNED');
  const [tracks, setTracks] = useState<Track[]>([]);
  const [memo, setMemo] = useState('');
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (feedback && ready) feedbackInput.current?.focus();
  }, [feedback, ready]);
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
  const [saving, setSaving] = useState(false);
  const [savedMessage, setSavedMessage] = useState('');
  async function saveChanges() {
    if (!ready || saving || recording.isRecording || busy) return;
    setSaving(true);
    setSavedMessage('');
    try {
      await writeMedia(`practice/${scopeKey}`, { ...extras.current, tracks, memo });
      setSavedMessage('변경사항을 저장했어요.');
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : '저장에 실패했어요.');
    } finally {
      setSaving(false);
    }
  }
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
          setTracks((all) => [...all, { id: uri, uri, name, part: uploadPart }]);
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
      validateAudioFile({ name: file.name, size: file.size, type: file.mimeType });
      const uri = keepNativeFile(file.uri, file.name);
      setTracks((all) => [...all, { id: uri, uri, name: file.name, part: uploadPart }]);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : '파일을 가져오지 못했습니다.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <Surface>
      <FlexRow wrap>
        <Heading>세션별 트랙</Heading>
        <ActionButton
          disabled={!ready || saving || busy || recording.isRecording}
          onPress={() => void saveChanges()}
        >
          {saving ? '저장 중…' : '변경사항 공유하기'}
        </ActionButton>
      </FlexRow>
      <Meta>{savedMessage || '변경 후 화면을 이동하기 전에 변경사항 공유하기를 눌러주세요.'}</Meta>
      <Meta>
        악기 파트를 고른 뒤 음원을 추가하세요. {serverConfigured ? '내 계정' : '이 기기'}에 비공개로
        저장합니다. 변경사항 공유하기를 눌렀을 때 저장돼요. 녹음을 중지한 후 화면을 이동해주세요.
      </Meta>
      <TrackPartPicker
        value={uploadPart}
        onChange={setUploadPart}
        disabled={busy || recording.isRecording}
      />
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
      {tracks.flatMap((track) =>
        (track.clips?.length ? track.clips : [track]).map((clip) => (
          <NativeTrack
            key={clip.id}
            track={
              clip === track
                ? track
                : { ...clip, name: `${track.name} · ${clip.name}`, part: track.part }
            }
            onPartChange={(part) =>
              setTracks((all) =>
                all.map((item) => (item.id === track.id ? { ...item, part } : item)),
              )
            }
            onDelete={() =>
              setTracks((all) =>
                clip === track
                  ? all.filter((item) => item.id !== track.id)
                  : all.map((item) =>
                      item.id === track.id
                        ? { ...item, clips: item.clips?.filter((entry) => entry.id !== clip.id) }
                        : item,
                    ),
              )
            }
          />
        )),
      )}
      <Heading>세부 피드백</Heading>
      <Input
        multiline
        ref={feedbackInput}
        accessibilityLabel="세부 피드백"
        placeholder="세부 피드백"
        value={memo}
        onChangeText={setMemo}
        editable={ready}
      />
    </Surface>
  );
}
