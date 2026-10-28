import { AppShell } from '../components/AppShell';
import { Heading, Meta, PageHeading, Surface } from '../components/ProductUI';
import type { ScreenProps } from '../navigation';

export function WorkManagementScreen({ navigate }: ScreenProps) {
  return (
    <AppShell activeRoute="work-management" onNavigate={navigate}>
      <PageHeading>작업실</PageHeading>
      {['내 악보 프로젝트', '내 녹음 프로젝트', '보관중인 클립'].map((title) => (
        <Surface key={title}>
          <Heading>{title}</Heading>
          <Meta>개인 프로젝트와 클립은 저장한 기기의 웹 브라우저에서 확인해주세요.</Meta>
        </Surface>
      ))}
    </AppShell>
  );
}
