import type { AppRoute, ScreenProps } from '@app/navigation';
import type { Workspace, WorkspaceSong } from '@mocks/workspaces';
export type ShellWorkspace = Pick<Workspace, 'id' | 'name' | 'photo' | 'color' | 'members'>;
export type ShellSong = Pick<WorkspaceSong, 'id' | 'title' | 'archived'>;
export interface ShellProfile {
  name: string;
  photo?: string;
}
export interface ShellRouteProps {
  activeRoute: AppRoute;
  onNavigate: ScreenProps['navigate'];
}
export interface ShellBandActionsProps {
  onCreate: () => void;
  onJoin: () => void;
}
export interface ShellCrumb {
  label: string;
  onPress?: () => void;
}
