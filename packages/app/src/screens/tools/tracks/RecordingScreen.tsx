import { PracticeStudio } from '@component/practice/PracticeStudio';
import { PageHeading, Meta } from '@component/shared/ui/ProductUI';
import type { ScreenProps } from '@app/navigation';

export function RecordingScreen({ projectId }: ScreenProps) {
  return (
    <>
      <PageHeading>녹음실</PageHeading>
      <Meta>자유롭게 녹음하고 편집하세요. 작업 내용은 이 기기에 저장돼요.</Meta>
      <PracticeStudio
        scopeKey="personal-recording"
        mediaKey="local-recording/default"
        requestedProjectId={projectId}
      />
    </>
  );
}
