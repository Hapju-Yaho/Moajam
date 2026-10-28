import type { ScreenProps } from '../navigation';
import { useIdentity } from '../state/Identity';
import { BandScoreProjects } from './BandScoreEditorScreen.web';

export function PersonalScoreEditorScreen(props: ScreenProps) {
  const user = useIdentity();
  return <BandScoreProjects key={user} {...props} personal songId="personal" title="나의 악보" />;
}
