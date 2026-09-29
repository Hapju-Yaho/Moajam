import { useEffect, useState } from 'react';
import { Linking } from 'react-native';
import { getDocumentAsync } from 'expo-document-picker';
import { AppShell } from '../components/AppShell';
import { ActionButton, Heading, Meta, Surface, FlexRow } from '../components/ProductUI';
import { MediaLibrary } from '../components/MediaLibrary';
import { api, serverConfigured } from '../lib/remote';
import { uploadNativeFile } from '../lib/native-upload';
import type { ScreenProps } from '../navigation';
type Job = {
  id: string;
  sourceId: string;
  instrument: string;
  status: string;
  error: string | null;
  outputs: string[];
};
const labels: Record<string, string> = {
  QUEUED: '대기 중',
  RUNNING: '분리 중',
  SUCCEEDED: '완료',
  FAILED: '실패',
  CANCELLED: '취소됨',
};
export function InstrumentExtractorScreen({ navigate }: ScreenProps) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [target, setTarget] = useState('guitar');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!serverConfigured) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const rows = await api<Job[]>('/separation-jobs');
        if (active) setJobs(rows);
      } catch (error) {
        if (active)
          setError(error instanceof Error ? error.message : '목록을 불러오지 못했습니다.');
      } finally {
        if (active) timer = setTimeout(() => void poll(), 5000);
      }
    };
    void poll();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, []);
  async function action(work: () => Promise<unknown>) {
    setBusy(true);
    setError('');
    try {
      await work();
      setJobs(await api<Job[]>('/separation-jobs'));
    } catch (error) {
      setError(error instanceof Error ? error.message : '요청에 실패했습니다.');
    } finally {
      setBusy(false);
    }
  }
  async function start(sourceId?: string, instrument = target) {
    if (!sourceId) {
      const result = await getDocumentAsync({ type: 'audio/*', copyToCacheDirectory: true });
      if (result.canceled) return;
      const file = result.assets[0];
      sourceId = await uploadNativeFile(
        file.uri,
        file.name,
        'extraction',
        undefined,
        file.mimeType,
      );
    }
    await api('/separation-jobs', 'POST', { sourceId, instrument });
  }
  return (
    <AppShell activeRoute="instrument" onNavigate={navigate}>
      <Heading>내 악기 추출</Heading>
      <Surface>
        <Meta>음원을 업로드해 악기와 나머지 소리를 분리합니다.</Meta>
        <FlexRow wrap>
          {[
            ['guitar', '기타'],
            ['vocals', '보컬'],
            ['drums', '드럼'],
            ['bass', '베이스'],
            ['piano', '피아노'],
            ['other', '기타 반주'],
          ].map(([id, label]) => (
            <ActionButton
              key={id}
              secondary={target !== id}
              disabled={busy}
              onPress={() => setTarget(id)}
            >
              {label}
            </ActionButton>
          ))}
        </FlexRow>
        <ActionButton
          disabled={busy || !serverConfigured}
          onPress={() => void action(() => start())}
        >
          {busy ? '처리 중…' : '음원 선택하고 분리 요청'}
        </ActionButton>
        {error ? <Meta accessibilityRole="alert">{error}</Meta> : null}
        {!serverConfigured && <Meta>음원 분리는 서버 연결 모드에서 사용할 수 있습니다.</Meta>}
      </Surface>
      {jobs.map((job) => (
        <Surface key={job.id}>
          <Heading>
            {job.instrument} · {labels[job.status] ?? job.status}
          </Heading>
          {job.error ? <Meta>{job.error}</Meta> : null}
          <FlexRow wrap>
            {['QUEUED', 'RUNNING'].includes(job.status) ? (
              <ActionButton
                disabled={busy}
                secondary
                onPress={() =>
                  void action(() => api('/separation-jobs/' + job.id + '/cancel', 'POST'))
                }
              >
                취소
              </ActionButton>
            ) : (
              <ActionButton
                disabled={busy}
                secondary
                onPress={() => void action(() => start(job.sourceId, job.instrument))}
              >
                다시 요청
              </ActionButton>
            )}
            {job.outputs.map((id, index) => (
              <ActionButton
                key={id}
                secondary
                disabled={busy}
                onPress={() =>
                  void action(async () => {
                    const { url } = await api<{ url: string }>('/assets/' + id + '/download');
                    await Linking.openURL(url);
                  })
                }
              >
                {index === 0 ? '악기 결과 듣기' : '나머지 소리 듣기'}
              </ActionButton>
            ))}
          </FlexRow>
        </Surface>
      ))}
      <MediaLibrary scopeKey="extraction" />
    </AppShell>
  );
}
