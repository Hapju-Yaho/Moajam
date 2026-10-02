import { ScoreEditorScreen } from './ScoreEditorScreen.web';
import type { ScreenProps } from '../navigation';
import { useMockAppState } from '../state/MockAppState';
import { AppShell } from '../components/AppShell';
import { ActionButton, Meta, Surface } from '../components/ProductUI';

export function BandScoreEditorScreen(props: ScreenProps) {
  const { adoptedSongs, workspaceId } = useMockAppState();
  if (!adoptedSongs.some((song) => song.id === props.entityId))
    return (
      <AppShell activeRoute="band-score-editor" onNavigate={props.navigate}>
        <Surface>
          <Meta>이 밴드에서 곡을 찾을 수 없어요.</Meta>
          <ActionButton onPress={() => props.navigate('practice', { workspaceId })}>
            연습실로 돌아가기
          </ActionButton>
        </Surface>
      </AppShell>
    );
  return <ScoreEditorScreen {...props} bandScore />;
}
