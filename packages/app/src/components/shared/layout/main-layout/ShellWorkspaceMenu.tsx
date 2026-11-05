import styledNative from '@emotion/native';
import { Image, Pressable, View } from 'react-native';
import { Stack } from '@moajam/ui';
import { AppIcon } from '@component/shared/icons';
import { Meta } from '@component/shared/ui/ProductUI';
import { BandListReveal } from '@component/shared/layout/BandListReveal';
import {
  WorkspaceCard,
  WorkspaceSwitcher,
  WorkspaceThumb,
  SidebarText,
  NavItem,
  NavLabel,
} from './MainLayout.styles';
import { BandActions } from './BandActions';
import { EmptyBandState } from './EmptyBandState';
import type { ShellWorkspace, ShellBandActionsProps } from './mainLayout.types';
export function ShellWorkspaceMenu({
  workspace,
  workspaces,
  switcherOpen,
  onToggle,
  onChoose,
  onCreate,
  onJoin,
}: ShellBandActionsProps & {
  workspace?: ShellWorkspace;
  workspaces: ShellWorkspace[];
  switcherOpen: boolean;
  onToggle: () => void;
  onChoose: (id: string) => void;
}) {
  const switcher = (
    <ShellWorkspaceMenuContainer>
      <ShellWorkspaceMenuWorkspaceSwitcher
        accessibilityRole="button"
        accessibilityLabel={`${workspace?.name ?? '밴드'} 홈으로 이동`}
        onPress={() => {
          if (workspace) onChoose(workspace.id);
        }}
      >
        {workspace?.photo ? (
          <ShellWorkspaceMenuImage source={{ uri: workspace.photo }} />
        ) : (
          <ShellWorkspaceMenuWorkspaceThumb $backgroundColor={workspace?.color ?? '#43896b'}>
            <AppIcon name="guitar" color="white" size={20} />
          </ShellWorkspaceMenuWorkspaceThumb>
        )}
        <ShellWorkspaceMenuContainer2>
          <SidebarText numberOfLines={1}>{workspace?.name ?? '밴드 선택'}</SidebarText>
          <SidebarText small>{workspace?.members.length ?? 0}명의 멤버</SidebarText>
        </ShellWorkspaceMenuContainer2>
      </ShellWorkspaceMenuWorkspaceSwitcher>
      <ShellWorkspaceMenuButton
        accessibilityRole="button"
        accessibilityLabel="밴드 목록 펼치기"
        accessibilityState={{ expanded: switcherOpen }}
        onPress={onToggle}
      >
        <ShellWorkspaceMenuContainer3 $switcherOpen={switcherOpen}>
          <AppIcon name="chevron-down" color="#7b879f" size={16} />
        </ShellWorkspaceMenuContainer3>
      </ShellWorkspaceMenuButton>
    </ShellWorkspaceMenuContainer>
  );
  return (
    <WorkspaceCard nativeID="tour-band-switcher">
      {workspaces.length ? switcher : <EmptyBandState onCreate={onCreate} onJoin={onJoin} />}
      {workspaces.length > 0 && switcherOpen && (
        <BandListReveal>
          <ShellWorkspaceMenuStack gap={4}>
            {workspaces.map((band) => (
              <NavItem
                key={band.id}
                active={workspace?.id === band.id}
                accessibilityRole="button"
                accessibilityLabel={`${band.name} 선택`}
                accessibilityState={{ selected: workspace?.id === band.id }}
                onPress={() => onChoose(band.id)}
              >
                <ShellWorkspaceMenuContainer4 $bandColor={band.color} />
                <ShellWorkspaceMenuNavLabel numberOfLines={1} active={workspace?.id === band.id}>
                  {band.name}
                </ShellWorkspaceMenuNavLabel>
                {workspace?.id === band.id && <Meta>✓</Meta>}
              </NavItem>
            ))}
            <BandActions onCreate={onCreate} onJoin={onJoin} />
          </ShellWorkspaceMenuStack>
        </BandListReveal>
      )}
    </WorkspaceCard>
  );
}

const ShellWorkspaceMenuContainer = styledNative(View)({
  flexDirection: 'row',
  alignItems: 'center',
});

const ShellWorkspaceMenuWorkspaceSwitcher = styledNative(WorkspaceSwitcher)({
  rowGap: 10,
  columnGap: 10,
  flex: 1,
  minWidth: 0,
});

const ShellWorkspaceMenuImage = styledNative(Image)({
  width: 36,
  height: 36,
  borderTopLeftRadius: 18,
  borderTopRightRadius: 18,
  borderBottomRightRadius: 18,
  borderBottomLeftRadius: 18,
});

const ShellWorkspaceMenuWorkspaceThumb = styledNative(WorkspaceThumb, {
  shouldForwardProp: (prop) => !prop.startsWith('$') && prop !== 'theme',
})<{ $backgroundColor: string }>(({ $backgroundColor }) => ({ backgroundColor: $backgroundColor }));

const ShellWorkspaceMenuContainer2 = styledNative(View)({ flex: 1 });

const ShellWorkspaceMenuButton = styledNative(Pressable)({
  width: 32,
  height: 40,
  marginRight: 6,
  alignItems: 'center',
  justifyContent: 'center',
});

const ShellWorkspaceMenuContainer3 = styledNative(View, {
  shouldForwardProp: (prop) => !prop.startsWith('$') && prop !== 'theme',
})<{ $switcherOpen: boolean }>(({ $switcherOpen }) => ({
  transform: [{ rotate: $switcherOpen ? '180deg' : '0deg' }],
}));

const ShellWorkspaceMenuStack = styledNative(Stack)({
  paddingTop: 6,
  paddingRight: 6,
  paddingBottom: 6,
  paddingLeft: 6,
  borderTopWidth: 1,
  borderTopColor: '#e1e7f0',
});

const ShellWorkspaceMenuContainer4 = styledNative(View, {
  shouldForwardProp: (prop) => !prop.startsWith('$') && prop !== 'theme',
})<{ $bandColor: string }>(({ $bandColor }) => ({
  width: 8,
  height: 8,
  borderTopLeftRadius: 4,
  borderTopRightRadius: 4,
  borderBottomRightRadius: 4,
  borderBottomLeftRadius: 4,
  backgroundColor: $bandColor,
}));

const ShellWorkspaceMenuNavLabel = styledNative(NavLabel)({ flex: 1 });
