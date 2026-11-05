import styledNative from '@emotion/native';
import { Image, View } from 'react-native';
import { AppIcon } from '@component/shared/icons';
import { Avatar, AvatarText } from '@styles/layout';
import { Profile, SidebarText } from './MainLayout.styles';
import type { ShellProfile as ProfileData, ShellRouteProps } from './mainLayout.types';
export function ShellProfile({
  profile,
  onNavigate,
}: {
  profile: ProfileData;
  onNavigate: ShellRouteProps['onNavigate'];
}) {
  return (
    <ShellProfileProfile
      accessibilityRole="button"
      accessibilityLabel="내 프로필과 설정"
      onPress={() => onNavigate('settings')}
    >
      <Avatar color="#ffd8c8">
        <>
          {profile.photo ? (
            <ShellProfileImage source={{ uri: profile.photo }} />
          ) : (
            <AvatarText>{profile.name.slice(-2)}</AvatarText>
          )}
        </>
      </Avatar>
      <ShellProfileContainer>
        <SidebarText>{profile.name}</SidebarText>
        <SidebarText small>{'나의 음악,\n우리의 합주'}</SidebarText>
      </ShellProfileContainer>
      <AppIcon name="settings" size={19} color="#72819a" />
    </ShellProfileProfile>
  );
}

const ShellProfileProfile = styledNative(Profile)({ rowGap: 10, columnGap: 10 });

const ShellProfileImage = styledNative(Image)({
  width: 36,
  height: 36,
  borderTopLeftRadius: 18,
  borderTopRightRadius: 18,
  borderBottomRightRadius: 18,
  borderBottomLeftRadius: 18,
});

const ShellProfileContainer = styledNative(View)({ flex: 1 });
