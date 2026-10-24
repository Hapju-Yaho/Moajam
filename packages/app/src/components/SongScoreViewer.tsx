import { ActionButton, Heading, Meta, Surface } from './ProductUI';
import { useMockAppState } from '../state/MockAppState';
import type { ScreenProps } from '../navigation';
export function SongScoreViewer({
  songId,
  navigate,
}: {
  songId: string;
  navigate: ScreenProps['navigate'];
}) {
  const { workspaceId } = useMockAppState();
  return (
    <Surface>
      <Heading>제작 악보</Heading>
      <Meta>제작 악보의 오선·타브 보기는 웹에서 지원해요.</Meta>
      <ActionButton
        secondary
        onPress={() => navigate('band-score-editor', { id: songId, workspaceId })}
      >
        악보 편집
      </ActionButton>
    </Surface>
  );
}
