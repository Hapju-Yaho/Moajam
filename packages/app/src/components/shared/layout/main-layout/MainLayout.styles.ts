import styled from '@emotion/native';
import { theme } from '@moajam/ui';

export const Sidebar = styled.View`
  width: 232px;
  min-height: 100%;
  padding: 16px 12px;
  justify-content: space-between;
  background-color: #f8fafc;
  border-right-width: 1px;
  border-right-color: ${theme.colors.border};
`;

export const BrandMark = styled.Image`
  width: 44px;
  height: 44px;
  border-radius: 12px;
`;

export const BrandButton = styled.Pressable`
  align-self: flex-start;
  gap: 14px;
  flex-direction: row;
  align-items: center;
`;

export const BrandName = styled.Text`
  color: #1d60ee;
  font-size: 27px;
  font-weight: 900;
  letter-spacing: -1.5px;
  font-family: 'Trebuchet MS';
`;

export const WorkspaceCard = styled.View`
  margin: 4px 0 10px;
  overflow: hidden;
  border: 1px solid #e1e7f0;
  border-radius: 12px;
  background-color: white;
`;

export const WorkspaceSwitcher = styled.Pressable`
  padding: 12px;
  gap: 10px;
  flex-direction: row;
  align-items: center;
`;

export const WorkspaceThumb = styled.View`
  width: 34px;
  height: 34px;
  align-items: center;
  justify-content: center;
  border-radius: 9px;
  background-color: #f3a45b;
`;

export const SidebarText = styled.Text<{ small?: boolean }>`
  color: ${({ small }) => (small ? theme.colors.textMuted : theme.colors.text)};
  font-size: ${({ small }) => (small ? 11 : 14)}px;
  font-weight: ${({ small }) => (small ? 400 : 500)};
`;

export const NavItem = styled.Pressable<{ active?: boolean }>`
  padding: 7px 12px;
  gap: 12px;
  flex-direction: row;
  align-items: center;
  border-radius: 10px;
  background-color: ${({ active }) => (active ? '#eaf0fc' : 'transparent')};
`;

export const NavIcon = styled.View`
  width: 20px;
  align-items: center;
  justify-content: center;
`;

export const NavLabel = styled.Text<{ active?: boolean }>`
  color: ${({ active }) => (active ? theme.colors.primary : '#56657c')};
  font-size: 14px;
  font-weight: ${({ active }) => (active ? 500 : 400)};
`;

export const NavGroupLabel = styled.Text`
  margin: 14px 12px 6px;
  color: #72819a;
  font-size: 11px;
  font-weight: 500;
`;

export const Profile = styled.Pressable`
  padding: 12px 8px 0;
  gap: 10px;
  flex-direction: row;
  align-items: center;
  border-top-width: 1px;
  border-top-color: ${theme.colors.border};
`;

export const Topbar = styled.View`
  height: 64px;
  flex-shrink: 0;
  padding: 0 24px;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  border-bottom-width: 1px;
  border-bottom-color: ${theme.colors.border};
  background-color: white;
`;

export const TopbarTitle = styled.Text`
  color: ${theme.colors.text};
  font-size: 14px;
  font-weight: 500;
`;

export const TopbarAction = styled.Pressable`
  width: 34px;
  height: 34px;
  align-items: center;
  justify-content: center;
  border-radius: 9px;
`;

export const BottomNav = styled.View`
  flex-shrink: 0;
  padding: 9px 8px 12px;
  flex-direction: row;
  justify-content: space-around;
  border-top-width: 1px;
  border-top-color: ${theme.colors.border};
  background-color: white;
`;

export const BottomItem = styled.Pressable`
  flex: 1;
  min-width: 0;
  min-height: 44px;
  gap: 3px;
  align-items: center;
`;

export const BottomLabel = styled.Text<{ active?: boolean }>`
  color: ${({ active }) => (active ? theme.colors.primary : theme.colors.textMuted)};
  font-size: 10px;
  font-weight: 500;
`;
