import { AppShell } from '../components/AppShell';
import { PracticeStudio } from '../components/PracticeStudio';
import { PageHeading, Meta } from '../components/ProductUI';
import type { ScreenProps } from '../navigation';

export function RecordingScreen({ navigate, projectId }: ScreenProps) {
  return (
    <AppShell activeRoute="track-editor" onNavigate={navigate}>
      <PageHeading>녹음실</PageHeading>
      <Meta>자유롭게 녹음하고 편집하세요. 작업 내용은 이 기기에 저장돼요.</Meta>
      <PracticeStudio
        scopeKey="personal-recording"
        mediaKey="local-recording/default"
        requestedProjectId={projectId}
      />
    </AppShell>
  );
}
