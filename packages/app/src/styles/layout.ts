import styled from '@emotion/native';
import { theme } from '@moajam/ui';
import { createElement } from 'react';
import { View, useWindowDimensions, type ViewProps } from 'react-native';

export const Shell = styled.SafeAreaView`
  flex: 1;
  flex-direction: row;
  background-color: ${theme.colors.background};
`;

export const Main = styled.View`
  flex: 1;
  min-width: 0;
  min-height: 0;
`;

export const PageScroll = styled.ScrollView`
  flex: 1;
  min-width: 0;
`;

export const PageHeader = styled.View`
  gap: 6px;
`;

export const PageTitle = styled.Text`
  color: ${theme.colors.text};
  font-size: 26px;
  font-weight: 600;
`;

export const SectionTitle = styled.Text`
  color: ${theme.colors.text};
  font-size: 18px;
  font-weight: 500;
`;

export const Label = styled.Text`
  color: ${theme.colors.text};
  font-size: 14px;
  font-weight: 500;
`;

export const Caption = styled.Text`
  font-weight: 400;
  color: ${theme.colors.textMuted};
  font-size: 13px;
  line-height: 19px;
`;

export function Grid({ stacked, style, ...props }: ViewProps & { stacked?: boolean }) {
  return createElement(GridBase, { ...props, $stacked: stacked, style });
}

const GridBase = styled(View, { shouldForwardProp: (prop) => !prop.startsWith('$') })<{
  $stacked?: boolean;
}>(({ $stacked }) => ({
  minWidth: 0,
  rowGap: 20,
  columnGap: 20,
  flexDirection: $stacked ? 'column' : 'row',
  alignItems: 'stretch',
}));

export function Column({ style, ...props }: ViewProps) {
  return createElement(ColumnBase, { ...props, style });
}

const ColumnBase = styled.View({ width: '100%', minWidth: 0, rowGap: 20, columnGap: 20 });

export function Between({ style, ...props }: ViewProps) {
  return createElement(BetweenBase, { ...props, style });
}

const BetweenBase = styled.View({
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'space-between',
  flexWrap: 'wrap',
  minWidth: 0,
  maxWidth: '100%',
  rowGap: 12,
  columnGap: 12,
});

export function Inline({
  wrap,
  gap = 8,
  style,
  ...props
}: ViewProps & { wrap?: boolean; gap?: number }) {
  const { width } = useWindowDimensions();
  return createElement(InlineBase, {
    ...props,
    $wrap: wrap ?? width < 480,
    $gap: gap,
    style,
  });
}

const InlineBase = styled(View, { shouldForwardProp: (prop) => !prop.startsWith('$') })<{
  $wrap: boolean;
  $gap: number;
}>(({ $wrap, $gap }) => ({
  minWidth: 0,
  maxWidth: '100%',
  flexDirection: 'row',
  alignItems: 'center',
  flexWrap: $wrap ? 'wrap' : 'nowrap',
  rowGap: $gap,
  columnGap: $gap,
}));

export const Divider = styled.View`
  height: 1px;
  background-color: ${theme.colors.border};
`;

export const Input = styled.TextInput`
  min-width: 0;
  max-width: 100%;
  font-size: 16px;
  font-weight: 400;
  min-height: 44px;
  padding: 10px 13px;
  color: ${theme.colors.text};
  border: 1px solid ${theme.colors.border};
  border-radius: 10px;
  background-color: white;
`;

export const SearchInput = styled.TextInput`
  min-width: 0;
  font-size: 16px;
  font-weight: 400;
  flex: 1;
  min-height: 42px;
  padding: 10px 14px;
  color: ${theme.colors.text};
  border: 1px solid ${theme.colors.border};
  border-radius: 999px;
  background-color: white;
`;

export const Chip = styled.Pressable<{ active?: boolean }>`
  max-width: 100%;
  padding: 7px 12px;
  border-radius: 999px;
  background-color: ${({ active }) => (active ? theme.colors.primary : '#eef3fb')};
`;

export const ChipText = styled.Text<{ active?: boolean }>`
  flex-shrink: 1;
  color: ${({ active }) => (active ? 'white' : theme.colors.textMuted)};
  font-size: 13px;
  font-weight: 500;
`;

export const LinkText = styled.Text`
  color: ${theme.colors.primary};
  font-size: 13px;
  font-weight: 500;
`;

const ArtworkBase = styled(View, { shouldForwardProp: (prop) => !prop.startsWith('$') })<{
  $size: number;
  $tint: string;
}>(({ $size, $tint }) => ({
  flexShrink: 0,
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: 10,
  width: $size,
  height: $size,
  backgroundColor: $tint,
}));

export function Artwork({
  tint = '#e86545',
  size = 58,
  style,
  ...props
}: ViewProps & { tint?: string; size?: number }) {
  return createElement(ArtworkBase, {
    ...props,
    $size: size,
    $tint: tint,
    style,
  });
}

export const ArtworkText = styled.Text`
  color: white;
  font-size: 25px;
  font-weight: 600;
`;

export const ArtworkImage = styled.Image`
  width: 58px;
  height: 58px;
  flex-shrink: 0;
  border-radius: 10px;
`;

export const ProgressTrack = styled.View`
  height: 8px;
  overflow: hidden;
  border-radius: 999px;
  background-color: #edf1f6;
`;

export const ProgressFill = styled.View<{ value: number }>`
  width: ${({ value }) => Math.max(0, Math.min(100, value))}%;
  height: 100%;
  border-radius: 999px;
  background-color: ${theme.colors.primary};
`;

const AvatarBase = styled(View, { shouldForwardProp: (prop) => !prop.startsWith('$') })<{
  $size: number;
  $color: string;
}>(({ $size, $color }) => ({
  flexShrink: 0,
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: 999,
  width: $size,
  height: $size,
  backgroundColor: $color,
}));

export function Avatar({
  color = '#d7e8ff',
  size = 34,
  style,
  ...props
}: ViewProps & { color?: string; size?: number }) {
  return createElement(AvatarBase, {
    ...props,
    $size: size,
    $color: color,
    style,
  });
}

export const AvatarText = styled.Text`
  color: #23324d;
  font-size: 11px;
  font-weight: 500;
`;

export const EmptyState = styled.View`
  padding: 42px 20px;
  gap: 8px;
  align-items: center;
  border: 1px dashed #cad4e3;
  border-radius: 14px;
  background-color: #f8faff;
`;

export const PressableRow = styled.Pressable`
  padding: 13px 0;
  gap: 12px;
  flex-direction: row;
  align-items: center;
  border-bottom-width: 1px;
  border-bottom-color: ${theme.colors.border};
`;
