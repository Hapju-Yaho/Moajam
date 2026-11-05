import styledNative from '@emotion/native';
import { View } from 'react-native';
import { Stack, theme } from '@moajam/ui';
import { AppIcon } from '@component/shared/icons';
import { ActionButton, Meta } from '@component/shared/ui/ProductUI';
import { WorkspaceThumb, SidebarText } from './MainLayout.styles';
import type { ShellBandActionsProps } from './mainLayout.types';
export function EmptyBandState({ onCreate, onJoin }: ShellBandActionsProps) {
  return (
    <EmptyBandStateContainer>
      <EmptyBandStateWorkspaceThumb>
        <AppIcon name="guitar" color={theme.colors.primary} size={20} />
      </EmptyBandStateWorkspaceThumb>
      <EmptyBandStateContainer2>
        <EmptyBandStateSidebarText>밴드와 함께 시작해요</EmptyBandStateSidebarText>
        <Meta>새 밴드를 만들거나 초대받은 밴드에 참여해보세요.</Meta>
      </EmptyBandStateContainer2>
      <Stack gap={8}>
        <ActionButton onPress={onCreate}>밴드 만들기</ActionButton>
        <ActionButton secondary onPress={onJoin}>
          밴드 참여하기
        </ActionButton>
      </Stack>
    </EmptyBandStateContainer>
  );
}

const EmptyBandStateContainer = styledNative(View)({
  paddingTop: 14,
  paddingRight: 14,
  paddingBottom: 14,
  paddingLeft: 14,
  rowGap: 14,
  columnGap: 14,
});

const EmptyBandStateWorkspaceThumb = styledNative(WorkspaceThumb)({ backgroundColor: '#eaf0fc' });

const EmptyBandStateContainer2 = styledNative(View)({ rowGap: 6, columnGap: 6 });

const EmptyBandStateSidebarText = styledNative(SidebarText)({ fontWeight: '600' });
