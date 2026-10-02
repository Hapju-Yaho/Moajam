import type { ScreenProps } from '../navigation';
import { AppShell } from '../components/AppShell';
import { ActionButton, Heading, Meta, Surface } from '../components/ProductUI';

export function BandScoreEditorScreen({ navigate, entityId }: ScreenProps) {
  return (
    <AppShell activeRoute="band-score-editor" onNavigate={navigate}>
      <Surface>
        <Heading>밴드 공용 악보</Heading>
        <Meta>밴드 악보 편집과 재생은 웹 연습실에서 이용할 수 있어요.</Meta>
        <ActionButton onPress={() => navigate('practice', { id: entityId })}>
          연습실로 돌아가기
        </ActionButton>
      </Surface>
    </AppShell>
  );
}
