import { PersonalScreen } from '@screens/personal/PersonalScreen';
import type { ScreenProps } from '@app/navigation';
export function PersonalPracticeScreen(props: ScreenProps) {
  return <PersonalScreen {...props} route="personal-practice" />;
}
