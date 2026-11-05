import styledWeb from '@emotion/styled';
import { useRef, useState } from 'react';
import { api, serverConfigured, uploadRemoteFile } from '@lib/remote';
import { writeMedia } from '@lib/mediaStore';
import { clientId } from '@lib/clientId';
import { songAudioBlob, type SongAudio } from '@lib/songAudio';
import { PdfAudioSettings } from './PdfAudioSettings.web';
import './PerformanceReader.web.css';
import { useMockAppState } from '@state/MockAppState';
import { theme } from '@moajam/ui';
import { ActionButton } from '@component/shared/ui/ProductUI';
import { AppIcon } from '@component/shared/icons';

export function SongAudioField({
  songId,
  value,
  onChange,
  onBusy,
}: {
  songId: string;
  value: SongAudio | null;
  onChange: (value: SongAudio | null) => void;
  onBusy: (busy: boolean) => void;
}) {
  const { workspaceId, currentUserId } = useMockAppState();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [settingsFile, setSettingsFile] = useState<File | null>(null);
  const openSettings = async () => {
    if (!value || busy) return;
    setBusy(true);
    onBusy(true);
    setError('');
    try {
      const blob = await songAudioBlob(value);
      setSettingsFile(new File([blob], value.name, { type: blob.type }));
    } catch (e) {
      setError(e instanceof Error ? e.message : '음원을 불러오지 못했어요.');
    } finally {
      setBusy(false);
      onBusy(false);
    }
  };
  const choose = async (file?: File) => {
    if (!file || busy) return;
    if (
      !file.size ||
      file.size > 104857600 ||
      (!file.type.startsWith('audio/') &&
        !/\.(mp3|wav|webm|ogg|m4a|aac|flac|opus)$/i.test(file.name))
    ) {
      setError('100MB 이하의 음원 파일을 선택해주세요.');
      return;
    }
    setBusy(true);
    onBusy(true);
    setError('');
    try {
      let id: string;
      if (serverConfigured) {
        id = await uploadRemoteFile(
          file,
          file.name,
          `song/${workspaceId}/${songId}/audio`,
          workspaceId,
          currentUserId,
        );
        await api(`/assets/${id}/visibility`, 'PATCH', { visibility: 'WORKSPACE' });
      } else {
        id = clientId();
        await writeMedia('song-audio/' + id, file);
      }
      onChange({ id, name: file.name });
    } catch (e) {
      setError(e instanceof Error ? e.message : '음원을 업로드하지 못했어요.');
    } finally {
      setBusy(false);
      onBusy(false);
    }
  };
  return (
    <SongAudioFieldContainer
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        void choose(e.dataTransfer.files[0]);
      }}
    >
      {value ? (
        <SongAudioFieldContainer2>
          <SongAudioFieldContainer3>
            <AppIcon name="logo" size={20} color={theme.colors.primary} />
            <SongAudioFieldLabel>{value.name}</SongAudioFieldLabel>
            <SongAudioFieldButton
              type="button"
              aria-label="곡 음원 연결 해제"
              disabled={busy}
              onClick={() => {
                onChange(null);
                setError('');
              }}
            >
              ×
            </SongAudioFieldButton>
          </SongAudioFieldContainer3>
          <ActionButton secondary compact disabled={busy} onPress={() => void openSettings()}>
            {busy ? '불러오는 중…' : '음원 설정'}
          </ActionButton>
        </SongAudioFieldContainer2>
      ) : (
        <>
          <SongAudioFieldContainer4>
            {busy ? '업로드 중…' : '음원 파일을 끌어놓거나 선택해주세요.'}
          </SongAudioFieldContainer4>
          <ActionButton secondary compact disabled={busy} onPress={() => input.current?.click()}>
            파일에서 가져오기
          </ActionButton>
        </>
      )}
      <input
        ref={input}
        type="file"
        accept="audio/*,.webm"
        hidden
        onChange={(e) => {
          void choose(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
      {error && <SongAudioFieldP role="alert">{error}</SongAudioFieldP>}
      {settingsFile && (
        <PdfAudioSettings
          fixedFile
          file={settingsFile}
          start={value?.start ?? 0}
          bpm={value?.bpm ?? 120}
          signature={value?.signature ?? '4/4'}
          onClose={() => setSettingsFile(null)}
          onApply={(_file, start, bpm, signature) => {
            if (value) onChange({ ...value, start, bpm, signature });
            setSettingsFile(null);
          }}
        />
      )}
    </SongAudioFieldContainer>
  );
}

const SongAudioFieldContainer = styledWeb('div')({
  '&&&&': {
    border: `1px solid ${theme.colors.border}`,
    borderRadius: 10,
    padding: '10px 13px',
    background: 'white',
  },
});

const SongAudioFieldContainer2 = styledWeb('div')({
  '&&&&': { display: 'flex', alignItems: 'center', gap: 10 },
});

const SongAudioFieldContainer3 = styledWeb('div')({
  '&&&&': {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    minWidth: 0,
    border: `1px solid ${theme.colors.border}`,
    borderRadius: 8,
    padding: '16px 28px 16px 12px',
    background: '#f6f8f7',
  },
});

const SongAudioFieldLabel = styledWeb('span')({
  '&&&&': { color: theme.colors.text, fontSize: 13, overflowWrap: 'anywhere', minWidth: 0 },
});

const SongAudioFieldButton = styledWeb('button')({
  '&&&&': {
    position: 'absolute',
    top: 3,
    right: 5,
    padding: 2,
    border: 0,
    background: 'transparent',
    color: theme.colors.textMuted,
    fontSize: 18,
    cursor: 'pointer',
    lineHeight: 1,
  },
});

const SongAudioFieldContainer4 = styledWeb('div')({
  '&&&&': { color: '#526556', fontSize: 13, overflowWrap: 'anywhere', marginBottom: 8 },
});

const SongAudioFieldP = styledWeb('p')({ '&&&&': { color: '#b23e3e' } });
