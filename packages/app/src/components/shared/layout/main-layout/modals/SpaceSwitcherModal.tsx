import { css as nativeCss } from '@emotion/native';
import styledNative from '@emotion/native';
import { Pressable, ScrollView } from 'react-native';
import { ActionButton, Copy, Meta } from '@component/shared/ui/ProductUI';
import { WorkspaceCard } from '@component/shared/layout/main-layout/MainLayout.styles';
import { BandActions } from '@component/shared/layout/main-layout/BandActions';
import { EmptyBandState } from '@component/shared/layout/main-layout/EmptyBandState';
import type {
  ShellBandActionsProps,
  ShellWorkspace,
  ShellRouteProps,
} from '@component/shared/layout/main-layout/mainLayout.types';
import { ShellModalFrame } from './ShellModalFrame';
export function SpaceSwitcherModal({
  visible,
  onClose,
  onSettings,
  workspaces,
  workspace,
  currentUserId,
  onChoose,
  onCreate,
  onJoin,
  onNavigate,
}: ShellBandActionsProps & {
  visible: boolean;
  onClose: () => void;
  onSettings?: () => void;
  workspaces: ShellWorkspace[];
  workspace?: ShellWorkspace;
  currentUserId: string;
  onChoose: (id: string) => void;
  onNavigate: ShellRouteProps['onNavigate'];
}) {
  return (
    <ShellModalFrame visible={visible} title="공간 선택" onClose={onClose} onSettings={onSettings}>
      {
        <>
          <ActionButton
            secondary
            onPress={() => {
              onClose();
              onNavigate('personal-home');
            }}
          >
            개인 공간 · 모든 밴드 모아보기
          </ActionButton>
          <ActionButton
            secondary
            onPress={() => {
              onClose();
              onNavigate('tools');
            }}
          >
            작업실 · 악보와 사운드 트랙 편집
          </ActionButton>
          {workspaces.length > 0 ? (
            <>
              <Meta>내 밴드</Meta>
              <SpaceSwitcherModalScroll
                contentContainerStyle={SpaceSwitcherModalSpaceSwitcherModalScrollContentStyle}
              >
                {workspaces.map((band) => (
                  <SpaceSwitcherModalButton
                    key={band.id}
                    accessibilityRole="button"
                    accessibilityLabel={`${band.name} 선택`}
                    onPress={() => onChoose(band.id)}
                    $backgroundColor={band.id === workspace?.id ? '#edf3ff' : '#f7f9fc'}
                    $bandColor={band.color}
                  >
                    <SpaceSwitcherModalCopy>
                      {band.name}
                      {band.id === workspace?.id ? ' ✓' : ''}
                    </SpaceSwitcherModalCopy>
                    <Meta>
                      {band.members.find((member) => member.id === currentUserId)?.part} ·{' '}
                      {band.members.find((member) => member.id === currentUserId)?.role === 'OWNER'
                        ? '관리자'
                        : '멤버'}{' '}
                      · {band.members.length}명
                    </Meta>
                  </SpaceSwitcherModalButton>
                ))}
              </SpaceSwitcherModalScroll>
              <BandActions onCreate={onCreate} onJoin={onJoin} />
            </>
          ) : (
            <WorkspaceCard>
              <EmptyBandState onCreate={onCreate} onJoin={onJoin} />
            </WorkspaceCard>
          )}
        </>
      }
    </ShellModalFrame>
  );
}

const SpaceSwitcherModalScroll = styledNative(ScrollView)({ maxHeight: 310 });

const SpaceSwitcherModalButton = styledNative(Pressable, {
  shouldForwardProp: (prop) => !prop.startsWith('$') && prop !== 'theme',
})<{ $backgroundColor: '#f7f9fc' | '#edf3ff'; $bandColor: string }>(
  ({ $backgroundColor, $bandColor }) => ({
    paddingTop: 14,
    paddingRight: 14,
    paddingBottom: 14,
    paddingLeft: 14,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    borderBottomRightRadius: 12,
    borderBottomLeftRadius: 12,
    backgroundColor: $backgroundColor,
    borderLeftWidth: 4,
    borderLeftColor: $bandColor,
  }),
);

const SpaceSwitcherModalCopy = styledNative(Copy)({ fontWeight: '500' });

const SpaceSwitcherModalSpaceSwitcherModalScrollContentStyle = nativeCss({ gap: 8 });
