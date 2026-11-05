import { Heading, Meta, PageHeading, Surface } from '@component/shared/ui/ProductUI';
import type { ScreenProps } from '@app/navigation';

export const WorkManagementScreen: React.FC<ScreenProps> = () => {
  return (
    <>
      <PageHeading>작업실</PageHeading>
      {['내 악보 프로젝트', '내 녹음 프로젝트', '보관중인 클립'].map((title) => (
        <Surface key={title}>
          <Heading>{title}</Heading>
          <Meta>개인 프로젝트와 클립은 저장한 기기의 웹 브라우저에서 확인해주세요.</Meta>
        </Surface>
      ))}
    </>
  );
};
