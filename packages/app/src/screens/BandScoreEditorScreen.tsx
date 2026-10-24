import type { ScreenProps } from '../navigation';
import { AppShell } from '../components/AppShell';
import { ActionButton, Heading, Meta, Surface } from '../components/ProductUI';

export function BandScoreEditorScreen({ navigate, entityId }: ScreenProps) {
  return (
    <AppShell activeRoute="band-score-editor" onNavigate={navigate} entityId={entityId}>
      <Surface>
        <Heading>밴드 공용 악보</Heading>
        <Meta>밴드 악보 편집과 재생은 웹 합주 도구에서 이용할 수 있어요.</Meta>
        <ActionButton onPress={() => navigate('song', { id: entityId, songTab: 'scores' })}>
          돌아가기
        </ActionButton>
      </Surface>
    </AppShell>
  );
}
