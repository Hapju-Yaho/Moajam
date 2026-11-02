import { useRef, useState } from 'react';
import { api, serverConfigured, uploadRemoteFile } from '../lib/remote';
import { writeMedia } from '../lib/mediaStore';
import { clientId } from '../lib/clientId';
import { songAudioBlob, type SongAudio } from '../lib/songAudio';
import { PdfAudioSettings } from './PdfAudioSettings.web';
import './PerformanceReader.web.css';
import { useMockAppState } from '../state/MockAppState';
import { theme } from '@moajam/ui';
import { ActionButton } from './ProductUI';
import { AppIcon } from './icons';

export function SongAudioField({ songId, value, onChange, onBusy }: {
  songId: string; value: SongAudio | null; onChange: (value: SongAudio | null) => void; onBusy: (busy: boolean) => void;
}) {
  const { workspaceId, currentUserId } = useMockAppState();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [settingsFile, setSettingsFile] = useState<File | null>(null);
  const openSettings = async () => {
    if (!value || busy) return;
    setBusy(true); onBusy(true); setError('');
    try {
      const blob = await songAudioBlob(value);
      setSettingsFile(new File([blob], value.name, { type: blob.type }));
    } catch (e) { setError(e instanceof Error ? e.message : '음원을 불러오지 못했어요.'); }
    finally { setBusy(false); onBusy(false); }
  };
  const choose = async (file?: File) => {
    if (!file || busy) return;
    if (!file.size || file.size > 104857600 || (!file.type.startsWith('audio/') && !/\.(mp3|wav|webm|ogg|m4a|aac|flac|opus)$/i.test(file.name))) {
      setError('100MB 이하의 음원 파일을 선택해주세요.'); return;
    }
    setBusy(true); onBusy(true); setError('');
    try {
      let id: string;
      if (serverConfigured) {
        id = await uploadRemoteFile(file, file.name, `song/${workspaceId}/${songId}/audio`, workspaceId, currentUserId);
        await api(`/assets/${id}/visibility`, 'PATCH', { visibility: 'WORKSPACE' });
      } else {
        id = clientId(); await writeMedia('song-audio/' + id, file);
      }
      onChange({ id, name: file.name });
    } catch (e) { setError(e instanceof Error ? e.message : '음원을 업로드하지 못했어요.'); }
    finally { setBusy(false); onBusy(false); }
  };
  return <div style={{ border: `1px solid ${theme.colors.border}`, borderRadius: 10, padding: '10px 13px', background: 'white' }}
    onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); void choose(e.dataTransfer.files[0]); }}>
    {value ? <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0,
        border: `1px solid ${theme.colors.border}`, borderRadius: 8, padding: '16px 28px 16px 12px', background: '#f6f8f7' }}>
        <AppIcon name="logo" size={20} color={theme.colors.primary} />
        <span style={{ color: theme.colors.text, fontSize: 13, overflowWrap: 'anywhere', minWidth: 0 }}>{value.name}</span>
        <button type="button" aria-label="곡 음원 연결 해제" disabled={busy} onClick={() => { onChange(null); setError(''); }}
          style={{ position: 'absolute', top: 3, right: 5, padding: 2, border: 0, background: 'transparent', color: theme.colors.textMuted, fontSize: 18, cursor: 'pointer', lineHeight: 1 }}>×</button>
      </div>
      <ActionButton secondary compact disabled={busy} onPress={() => void openSettings()}>{busy ? '불러오는 중…' : '음원 설정'}</ActionButton>
    </div> : <>
      <div style={{ color: '#526556', fontSize: 13, overflowWrap: 'anywhere', marginBottom: 8 }}>{busy ? '업로드 중…' : '음원 파일을 끌어놓거나 선택해주세요.'}</div>
      <ActionButton secondary compact disabled={busy} onPress={() => input.current?.click()}>파일에서 가져오기</ActionButton>
    </>}
    <input ref={input} type="file" accept="audio/*,.webm" hidden onChange={(e) => { void choose(e.target.files?.[0]); e.target.value = ''; }} />
    {error && <p role="alert" style={{ color: '#b23e3e' }}>{error}</p>}
    {settingsFile && <PdfAudioSettings fixedFile file={settingsFile} start={value?.start ?? 0}
      onClose={() => setSettingsFile(null)} onApply={(_file, start) => {
        if (value) onChange({ ...value, start });
        setSettingsFile(null);
      }} />}
  </div>;
}
