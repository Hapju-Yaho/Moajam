import { useEffect, useState } from 'react';
import { MediaLibrary } from '../components/MediaLibrary';
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
import { api, serverConfigured, uploadRemoteFile } from '../lib/remote';
import type { ScreenProps } from '../navigation';
type Job = {
  id: string;
  sourceId: string;
  instrument: string;
  status: string;
  error: string | null;
  outputs: string[];
  createdAt: string;
};
const labels: Record<string, string> = {
  QUEUED: '대기 중',
  RUNNING: '분리 중',
  SUCCEEDED: '완료',
  FAILED: '실패',
  CANCELLED: '취소됨',
};
export function InstrumentExtractorScreen({ navigate }: ScreenProps) {
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState('');
  const [target, setTarget] = useState('guitar');
  const [jobs, setJobs] = useState<Job[]>([]);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<{ id: string; url: string }[]>([]);
  useEffect(() => {
    if (!file) {
      setUrl('');
      return;
    }
    const link = URL.createObjectURL(file);
    setUrl(link);
    return () => URL.revokeObjectURL(link);
  }, [file]);
  useEffect(() => {
    if (!serverConfigured) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const value = await api<Job[]>('/separation-jobs');
        if (active) {
          setJobs(value);
          timer = setTimeout(
            () => void poll(),
            value.some((job) => ['QUEUED', 'RUNNING'].includes(job.status)) ? 3000 : 15000,
          );
        }
      } catch (error) {
        if (active) {
          setMessage(error instanceof Error ? error.message : '작업을 확인하지 못했습니다.');
          timer = setTimeout(() => void poll(), 15000);
        }
      }
    };
    void poll();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, []);
  const start = async (sourceId?: string) => {
    if (!sourceId && !file) return;
    setBusy(true);
    setMessage('');
    try {
      const source = sourceId ?? (await uploadRemoteFile(file!, file!.name, 'extraction'));
      const job = await api<Job>('/separation-jobs', 'POST', {
        sourceId: source,
        instrument: target,
      });
      setJobs((all) => [job, ...all]);
      setMessage('분리 작업을 요청했습니다. 이 화면을 나가도 서버에서 계속 처리합니다.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '분리 요청을 보내지 못했습니다.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <AppShell activeRoute="instrument" onNavigate={navigate}>
      <PageHeading>내 악기 소리 추출</PageHeading>
      <Meta>원본 녹음과 분리한 악기·나머지 소리를 비교하고 WAV로 보관하세요.</Meta>
      <Surface>
        <Heading>1. 원본 녹음</Heading>
        <input
          aria-label="분리할 오디오 파일"
          type="file"
          accept="audio/*"
          disabled={busy}
          onChange={(event) => {
            const chosen = event.target.files?.[0];
            if (!chosen) return;
            if (chosen.size > 100 * 1024 * 1024) {
              setMessage('100MB 이하의 파일을 선택해주세요.');
              return;
            }
            setFile(chosen);
            setResults([]);
          }}
        />
        {file ? (
          <Copy>
            {file.name} · {(file.size / 1024 / 1024).toFixed(1)}MB
          </Copy>
        ) : null}
        {url ? <audio controls src={url} style={{ width: '100%' }} /> : null}
      </Surface>
      <Surface>
        <Heading>2. 추출할 악기</Heading>
        <FlexRow wrap>
          {[
            ['guitar', '기타'],
            ['vocals', '보컬'],
            ['drums', '드럼'],
            ['bass', '베이스'],
            ['piano', '피아노'],
            ['other', '기타 반주'],
          ].map(([id, label]) => (
            <Pill key={id} active={target === id} onPress={() => setTarget(id)}>
              <PillText active={target === id}>{label}</PillText>
            </Pill>
          ))}
        </FlexRow>
        <Meta>
          분리 결과는 녹음 상태와 악기에 따라 달라집니다. 기타·피아노는 실험적 모델을 사용합니다.
        </Meta>
        <ActionButton disabled={!file || busy || !serverConfigured} onPress={() => void start()}>
          {busy ? '파일 업로드·요청 중…' : '악기 분리 시작'}
        </ActionButton>
        {!serverConfigured ? (
          <Meta>
            원본 미리듣기는 사용할 수 있습니다. 실제 분리는 로그인·파일 저장소·분리 작업 서버 연결이
            필요합니다.
          </Meta>
        ) : null}
        {message ? <Copy accessibilityRole="alert">{message}</Copy> : null}
      </Surface>
      <Surface>
        <Heading>3. 작업과 결과</Heading>
        {!jobs.length ? <Meta>아직 요청한 분리 작업이 없어요.</Meta> : null}
        {jobs.map((job) => (
          <Surface key={job.id} tint="#f7f9ff">
            <Copy>
              {job.instrument} · {labels[job.status] ?? job.status}
            </Copy>
            <Meta>{new Date(job.createdAt).toLocaleString('ko-KR')}</Meta>
            {job.error ? <Meta>{job.error}</Meta> : null}
            <FlexRow wrap>
              {['QUEUED', 'RUNNING'].includes(job.status) ? (
                <ActionButton
                  secondary
                  onPress={() =>
                    void api(`/separation-jobs/${job.id}/cancel`, 'POST')
                      .then(() =>
                        setJobs((all) =>
                          all.map((item) =>
                            item.id === job.id ? { ...item, status: 'CANCELLED' } : item,
                          ),
                        ),
                      )
                      .catch((error: Error) => setMessage(error.message))
                  }
                >
                  작업 취소
                </ActionButton>
              ) : null}
              {['FAILED', 'CANCELLED'].includes(job.status) ? (
                <ActionButton secondary disabled={busy} onPress={() => void start(job.sourceId)}>
                  다시 요청
                </ActionButton>
              ) : null}
              {job.status === 'SUCCEEDED' ? (
                <ActionButton
                  onPress={() =>
                    void Promise.all(
                      [job.sourceId, ...job.outputs].map(async (id) => ({
                        id,
                        ...(await api<{ url: string }>(`/assets/${id}/download`)),
                      })),
                    )
                      .then(setResults)
                      .catch((error: Error) => setMessage(error.message))
                  }
                >
                  원본·결과 비교
                </ActionButton>
              ) : null}
            </FlexRow>
          </Surface>
        ))}
        {results.map((result, index) => (
          <Surface key={result.id}>
            <Heading>{['원본', '추출한 악기', '나머지 소리'][index]}</Heading>
            <audio controls src={result.url} style={{ width: '100%' }} />
            <a href={result.url} target="_blank" rel="noreferrer">
              파일 열기 / 다운로드
            </a>
            {index > 0 ? <Meta>분리 결과는 서버의 개인 자료 보관함에 자동 저장됩니다.</Meta> : null}
          </Surface>
        ))}
      </Surface>
      <MediaLibrary scopeKey="extraction" />
      <ActionButton secondary onPress={() => navigate('track-editor')}>
        사운드 트랙 편집으로 이동
      </ActionButton>
    </AppShell>
  );
}
