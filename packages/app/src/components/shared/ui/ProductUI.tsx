import { css as nativeCss } from '@emotion/native';

import { parseVideoUrl } from '@lib/video';
import styled from '@emotion/native';
import { theme } from '@moajam/ui';
import type { PropsWithChildren, ReactNode } from 'react';
import {
  Pressable,
  ScrollView,
  Text,
  View,
  useWindowDimensions,
  type ViewProps,
  type AccessibilityState,
} from 'react-native';
import { getSongThumbnail } from '@lib/songMedia';
import { AppIcon, type AppIconName } from '@component/shared/icons';

const SurfaceBase = styled.View<{ tint?: string; danger?: boolean }>`
  padding: 18px;
  border: 1px solid ${({ danger }) => (danger ? '#fecaca' : theme.colors.border)};
  border-radius: 16px;
  background-color: ${({ tint }) => tint ?? 'white'};
  elevation: 1;
`;

export function Surface({
  tint,
  danger,
  style,
  scrollable = false,
  children,
  ...props
}: ViewProps & { tint?: string; danger?: boolean; scrollable?: boolean }) {
  const { width, height } = useWindowDimensions();
  return (
    <SurfaceSurfaceBase
      {...props}
      tint={tint}
      danger={danger}
      $width={width}
      $scrollable={scrollable}
      $viewportHeight={height}
      style={style}
    >
      {scrollable ? (
        <SurfaceScroll
          keyboardShouldPersistTaps="handled"

          contentContainerStyle={SurfaceSurfaceScrollContentStyle}
        >
          {children}
        </SurfaceScroll>
      ) : (
        children
      )}
    </SurfaceSurfaceBase>
  );
}

export function PageTop({ style, ...props }: ViewProps) {
  return <PageTopContainer {...props} style={style} />;
}

export const PageHeading = styled.Text`
  flex-shrink: 1;
  color: ${theme.colors.text};
  font-size: 30px;
  font-weight: 600;
  letter-spacing: -0.6px;
`;

export const PageDescription = styled.Text`
  font-weight: 400;
  color: ${theme.colors.textMuted};
  font-size: 15px;
  line-height: 22px;
`;

export const Heading = styled.Text`
  flex-shrink: 1;
  color: ${theme.colors.text};
  font-size: 18px;
  font-weight: 600;
`;

export const SmallHeading = styled.Text`
  color: ${theme.colors.text};
  font-size: 14px;
  font-weight: 500;
`;

export const Meta = styled.Text`
  font-weight: 400;
  color: ${theme.colors.textMuted};
  font-size: 12px;
  line-height: 18px;
`;

export const Copy = styled.Text`
  font-weight: 400;
  color: ${theme.colors.text};
  font-size: 14px;
  line-height: 21px;
`;

export function FlexBetween({ style, ...props }: ViewProps) {
  return <FlexBetweenContainer {...props} style={style} />;
}

export function FlexRow({
  wrap,
  gap = 8,
  style,
  ...props
}: ViewProps & { wrap?: boolean; gap?: number }) {
  const { width } = useWindowDimensions();
  return <FlexRowContainer {...props} $wrap={wrap} $width={width} $gap={gap} style={style} />;
}

export function ResponsiveGrid({
  stacked,
  gap = 16,
  style,
  ...props
}: ViewProps & { stacked?: boolean; gap?: number }) {
  return <ResponsiveGridContainer {...props} $stacked={stacked} $gap={gap} style={style} />;
}

export function Stack({ gap = 10, style, ...props }: ViewProps & { gap?: number }) {
  return <StackContainer {...props} $gap={gap} style={style} />;
}

export const Divider = styled.View`
  height: 1px;
  background-color: ${theme.colors.border};
`;

export const OutlineButton = styled.Pressable<{ danger?: boolean; compact?: boolean }>`
  max-width: 100%;
  min-height: ${({ compact }) => (compact ? 34 : 40)}px;
  padding: ${({ compact }) => (compact ? '7px 11px' : '9px 14px')};
  flex-direction: row;
  align-items: center;
  justify-content: center;
  gap: 7px;
  border: 1px solid ${({ danger }) => (danger ? theme.colors.danger : '#b9cdfc')};
  border-radius: 9px;
  background-color: white;
`;

export const OutlineButtonText = styled.Text<{ danger?: boolean }>`
  flex-shrink: 1;
  text-align: center;
  color: ${({ danger }) => (danger ? theme.colors.danger : theme.colors.primary)};
  font-size: 13px;
  font-weight: 500;
`;

export const PrimaryButton = styled.Pressable<{ danger?: boolean; compact?: boolean }>`
  max-width: 100%;
  min-height: ${({ compact }) => (compact ? 34 : 40)}px;
  padding: ${({ compact }) => (compact ? '7px 11px' : '9px 15px')};
  flex-direction: row;
  align-items: center;
  justify-content: center;
  gap: 7px;
  border-radius: 9px;
  background-color: ${({ danger }) => (danger ? theme.colors.danger : theme.colors.primary)};
  opacity: ${({ disabled }) => (disabled ? 0.45 : 1)};
`;

export const PrimaryButtonText = styled.Text`
  flex-shrink: 1;
  text-align: center;
  color: white;
  font-size: 13px;
  font-weight: 500;
`;

export const Pill = styled.Pressable<{ active?: boolean; tone?: 'green' | 'amber' | 'red' }>`
  max-width: 100%;
  padding: 6px 10px;
  border-radius: 999px;
  background-color: ${({ active, tone }) =>
    active
      ? theme.colors.primary
      : tone === 'green'
        ? '#dcf8e9'
        : tone === 'amber'
          ? '#fff3d6'
          : tone === 'red'
            ? '#fee7e7'
            : '#f0f4fa'};
`;

export const PillText = styled.Text<{ active?: boolean; tone?: 'green' | 'amber' | 'red' }>`
  flex-shrink: 1;
  color: ${({ active, tone }) =>
    active
      ? 'white'
      : tone === 'green'
        ? '#0a8c55'
        : tone === 'amber'
          ? '#c47700'
          : tone === 'red'
            ? '#d93d4b'
            : '#50617d'};
  font-size: 12px;
  font-weight: 500;
`;

export const Progress = styled.View`
  height: 8px;
  overflow: hidden;
  border-radius: 999px;
  background-color: #e8edf5;
`;

const ProgressValueBase = styled.View`
  height: 100%;
  border-radius: 999px;
`;

export function ProgressValue({
  value,
  color = theme.colors.primary,
  style,
  ...props
}: ViewProps & { value: number; color?: string }) {
  return (
    <ProgressValueProgressValueBase
      {...props}
      $max={Math.max(0, Math.min(100, value))}
      $color={color}
      style={style}
    />
  );
}

const SoftIconBase = styled.View`
  align-items: center;
  justify-content: center;
  border-radius: 11px;
`;

export function SoftIcon({
  color = '#edf3ff',
  size = 42,
  style,
  ...props
}: ViewProps & { color?: string; size?: number }) {
  return <SoftIconSoftIconBase {...props} $size={size} $color={color} style={style} />;
}

export const ToggleTrack = styled.Pressable<{ on?: boolean }>`
  flex-shrink: 0;
  width: 42px;
  height: 24px;
  padding: 3px;
  align-items: ${({ on }) => (on ? 'flex-end' : 'flex-start')};
  border-radius: 999px;
  background-color: ${({ on }) => (on ? theme.colors.primary : '#cdd6e5')};
`;

export const ToggleKnob = styled.View`
  width: 18px;
  height: 18px;
  border-radius: 999px;
  background-color: white;
`;

const StatSurface = styled.View`
  flex: 1;
  min-width: 170px;
  padding: 16px;
  gap: 12px;
  flex-direction: row;
  align-items: center;
  border: 1px solid ${theme.colors.border};
  border-radius: 14px;
  background-color: white;
`;

export function StatTile({
  icon,
  label,
  value,
  color = theme.colors.primary,
}: {
  icon: AppIconName;
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <StatTileStatSurface>
      <SoftIcon color={`${color}16`}>
        <AppIcon name={icon} color={color} size={21} />
      </SoftIcon>
      <StatTileContainer>
        <Meta>{label}</Meta>
        <StatTileText>{value}</StatTileText>
      </StatTileContainer>
    </StatTileStatSurface>
  );
}

export const CoverImage = styled.Image<{ size?: number }>`
  width: ${({ size = 72 }) => size}px;
  height: ${({ size = 72 }) => size}px;
  flex-shrink: 0;
  border-radius: 10px;
`;

export function SongCover({
  id,
  size = 72,
  thumbnailUrl,
  referenceUrl,
}: {
  id: string;
  size?: number;
  thumbnailUrl?: string;
  referenceUrl?: string;
}) {
  const source = thumbnailUrl || parseVideoUrl(referenceUrl)?.thumbnail || getSongThumbnail(id);
  if (!source)
    return (
      <SongCoverContainer $size={size}>
        <SongCoverText $size={size}>♪</SongCoverText>
      </SongCoverContainer>
    );
  return (
    <SongCoverCoverImage source={{ uri: source }} resizeMode="cover" size={size} $size={size} />
  );
}

const WaveSurface = styled.View<{ color: string; height: number }>`
  height: ${({ height }) => height}px;
  flex: 1;
  overflow: hidden;
  flex-direction: row;
  align-items: center;
  gap: 2px;
  border-radius: 6px;
  background-color: ${({ color }) => `${color}12`};
`;

export function Waveform({ color = '#2563eb', height = 34 }: { color?: string; height?: number }) {
  const bars = [
    8, 16, 12, 24, 18, 30, 13, 22, 34, 17, 28, 20, 10, 25, 31, 14, 22, 18, 29, 11, 26, 15, 32, 19,
    24, 12, 27, 17, 30, 13, 21, 9,
  ];
  return (
    <WaveformWaveSurface color={color} height={height} $height={height}>
      {bars.map((bar, index) => (
        <WaveformContainer
          key={`${bar}-${index}`}
          $min={Math.min(height - 4, bar)}
          $color={color}
        />
      ))}
    </WaveformWaveSurface>
  );
}

export function Toggle({ on, onPress }: { on: boolean; onPress: () => void }) {
  return (
    <ToggleTrack
      on={on}
      onPress={onPress}
      accessibilityRole="switch"
      accessibilityState={{ checked: on }}
    >
      <ToggleKnob />
    </ToggleTrack>
  );
}

export function ActionButton({
  children,
  nativeID,
  onPress,
  secondary,
  danger,
  compact,
  disabled,
  accessibilityState,
  accessibilityLabel,
}: PropsWithChildren<{
  nativeID?: string;
  onPress?: () => void;
  secondary?: boolean;
  danger?: boolean;
  compact?: boolean;
  disabled?: boolean;
  accessibilityState?: AccessibilityState;
  accessibilityLabel?: string;
}>) {
  if (secondary) {
    return (
      <ActionButtonOutlineButton
        nativeID={nativeID}
        danger={danger}
        compact={compact}
        onPress={onPress}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityState={{ ...accessibilityState, disabled }}
        $compact={compact}
      >
        <OutlineButtonText danger={danger}>{children}</OutlineButtonText>
      </ActionButtonOutlineButton>
    );
  }
  return (
    <ActionButtonPrimaryButton
      nativeID={nativeID}
      danger={danger}
      compact={compact}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ ...accessibilityState, disabled }}
      $compact={compact}
    >
      <PrimaryButtonText>{children}</PrimaryButtonText>
    </ActionButtonPrimaryButton>
  );
}

export function IconAction({
  icon,
  label,
  onPress,
  secondary,
}: {
  icon: AppIconName;
  label: string;
  onPress?: () => void;
  secondary?: boolean;
}) {
  const SurfaceComponent = secondary ? IconActionOutline : IconActionPrimary;
  return (
    <SurfaceComponent onPress={onPress}>
      <AppIcon name={icon} color={secondary ? theme.colors.primary : 'white'} size={16} />
      {secondary ? (
        <OutlineButtonText>{label}</OutlineButtonText>
      ) : (
        <PrimaryButtonText>{label}</PrimaryButtonText>
      )}
    </SurfaceComponent>
  );
}

export function CheckItem({
  checked,
  label,
  onPress,
  meta,
}: {
  checked: boolean;
  label: string;
  onPress?: () => void;
  meta?: ReactNode;
}) {
  return (
    <CheckItemButton onPress={onPress}>
      <CheckItemContainer $checked={checked}>
        {checked ? <CheckItemText>✓</CheckItemText> : null}
      </CheckItemContainer>
      <CheckItemCopy>{label}</CheckItemCopy>
      {meta}
    </CheckItemButton>
  );
}

export function Slider({ value, color = theme.colors.primary }: { value: number; color?: string }) {
  return (
    <SliderContainer>
      <SliderContainer2 $max={Math.max(0, Math.min(100, value))} $color={color} />
    </SliderContainer>
  );
}

const SurfaceScroll = styled(ScrollView)({ flexShrink: 1, minHeight: 0 });

const StatTileStatSurface = styled(StatSurface)({ rowGap: 12, columnGap: 12 });

const StatTileContainer = styled(View)({ rowGap: 2, columnGap: 2, flex: 1, minWidth: 0 });

const StatTileText = styled(Text)({ color: theme.colors.text, fontSize: 22, fontWeight: '600' });

const SongCoverContainer = styled(View, {
  shouldForwardProp: (prop) => !prop.startsWith('$') && prop !== 'theme',
})<{ $size: number }>(({ $size }) => ({
  width: $size,
  height: $size,
  flexShrink: 0,
  marginRight: 6,
  borderTopLeftRadius: 10,
  borderTopRightRadius: 10,
  borderBottomRightRadius: 10,
  borderBottomLeftRadius: 10,
  backgroundColor: '#edf3ff',
  alignItems: 'center',
  justifyContent: 'center',
}));

const SongCoverText = styled(Text, {
  shouldForwardProp: (prop) => !prop.startsWith('$') && prop !== 'theme',
})<{ $size: number }>(({ $size }) => ({
  color: theme.colors.primary,
  fontSize: $size / 3,
  fontWeight: '400',
}));

const SongCoverCoverImage = styled(CoverImage, {
  shouldForwardProp: (prop) => !prop.startsWith('$') && prop !== 'theme',
})<{ $size: number }>(({ $size }) => ({
  width: $size,
  height: $size,
  flexShrink: 0,
  marginRight: 6,
}));

const WaveformWaveSurface = styled(WaveSurface, {
  shouldForwardProp: (prop) => !prop.startsWith('$') && prop !== 'theme',
})<{ $height: number }>(({ $height }) => ({ height: $height, rowGap: 2, columnGap: 2 }));

const WaveformContainer = styled(View, {
  shouldForwardProp: (prop) => !prop.startsWith('$') && prop !== 'theme',
})<{ $min: number; $color: string }>(({ $min, $color }) => ({
  flex: 1,
  maxWidth: 5,
  height: $min,
  borderTopLeftRadius: 2,
  borderTopRightRadius: 2,
  borderBottomRightRadius: 2,
  borderBottomLeftRadius: 2,
  backgroundColor: $color,
  opacity: 0.72,
}));

const ActionButtonOutlineButton = styled(OutlineButton, {
  shouldForwardProp: (prop) => !prop.startsWith('$') && prop !== 'theme',
})<{ $compact: boolean | undefined }>(({ $compact }) => ({
  rowGap: 7,
  columnGap: 7,
  minHeight: $compact ? 34 : 40,
  paddingTop: $compact ? 7 : 9,
  paddingBottom: $compact ? 7 : 9,
  paddingLeft: $compact ? 11 : 14,
  paddingRight: $compact ? 11 : 14,
}));

const ActionButtonPrimaryButton = styled(PrimaryButton, {
  shouldForwardProp: (prop) => !prop.startsWith('$') && prop !== 'theme',
})<{ $compact: boolean | undefined }>(({ $compact }) => ({
  rowGap: 7,
  columnGap: 7,
  minHeight: $compact ? 34 : 40,
  paddingTop: $compact ? 7 : 9,
  paddingBottom: $compact ? 7 : 9,
  paddingLeft: $compact ? 11 : 15,
  paddingRight: $compact ? 11 : 15,
}));

const CheckItemButton = styled(Pressable)({
  flexDirection: 'row',
  alignItems: 'center',
  rowGap: 10,
  columnGap: 10,
  paddingTop: 5,
  paddingBottom: 5,
});

const CheckItemContainer = styled(View, {
  shouldForwardProp: (prop) => !prop.startsWith('$') && prop !== 'theme',
})<{ $checked: boolean }>(({ $checked }) => ({
  width: 20,
  height: 20,
  alignItems: 'center',
  justifyContent: 'center',
  borderTopLeftRadius: 5,
  borderTopRightRadius: 5,
  borderBottomRightRadius: 5,
  borderBottomLeftRadius: 5,
  borderTopWidth: 1,
  borderRightWidth: 1,
  borderBottomWidth: 1,
  borderLeftWidth: 1,
  borderTopColor: $checked ? theme.colors.primary : '#b8c3d5',
  borderRightColor: $checked ? theme.colors.primary : '#b8c3d5',
  borderBottomColor: $checked ? theme.colors.primary : '#b8c3d5',
  borderLeftColor: $checked ? theme.colors.primary : '#b8c3d5',
  backgroundColor: $checked ? theme.colors.primary : 'white',
}));

const CheckItemText = styled(Text)({ color: 'white', fontWeight: '600' });

const CheckItemCopy = styled(Copy)({ flex: 1 });

const SliderContainer = styled(View)({
  flex: 1,
  height: 6,
  borderTopLeftRadius: 999,
  borderTopRightRadius: 999,
  borderBottomRightRadius: 999,
  borderBottomLeftRadius: 999,
  backgroundColor: '#e4eaf3',
});

const SliderContainer2 = styled(View, {
  shouldForwardProp: (prop) => !prop.startsWith('$') && prop !== 'theme',
})<{ $max: number; $color: string }>(({ $max, $color }) => ({
  width: `${$max}%`,
  height: 6,
  borderTopLeftRadius: 999,
  borderTopRightRadius: 999,
  borderBottomRightRadius: 999,
  borderBottomLeftRadius: 999,
  backgroundColor: $color,
}));

const SurfaceSurfaceBase = styled(SurfaceBase, {
  shouldForwardProp: (prop) => !prop.startsWith('$') && prop !== 'theme',
})<{ $width: number; $scrollable: boolean; $viewportHeight: number }>(
  ({ $width, $scrollable, $viewportHeight }) => [
    {
      minWidth: 0,
      maxWidth: '100%',
      paddingTop: $width < 480 ? 12 : 18,
      paddingRight: $width < 480 ? 12 : 18,
      paddingBottom: $width < 480 ? 12 : 18,
      paddingLeft: $width < 480 ? 12 : 18,
      rowGap: $scrollable ? 0 : 14,
      columnGap: $scrollable ? 0 : 14,
    },
    $scrollable && { maxHeight: Math.max(120, $viewportHeight - 48) },
  ],
);

const SurfaceSurfaceScrollContentStyle = nativeCss({ gap: 14 });

const PageTopContainer = styled(View)([{ minWidth: 0, maxWidth: '100%', rowGap: 5, columnGap: 5 }]);

const FlexBetweenContainer = styled(View)([
  {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    minWidth: 0,
    maxWidth: '100%',
    rowGap: 12,
    columnGap: 12,
  },
]);

const FlexRowContainer = styled(View, {
  shouldForwardProp: (prop) => !prop.startsWith('$') && prop !== 'theme',
})<{ $wrap: boolean | undefined; $width: number; $gap: number }>(({ $wrap, $width, $gap }) => [
  {
    minWidth: 0,
    maxWidth: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: ($wrap ?? $width < 480) ? 'wrap' : 'nowrap',
    rowGap: $gap,
    columnGap: $gap,
  },
]);

const ResponsiveGridContainer = styled(View, {
  shouldForwardProp: (prop) => !prop.startsWith('$') && prop !== 'theme',
})<{ $stacked: boolean | undefined; $gap: number }>(({ $stacked, $gap }) => [
  {
    minWidth: 0,
    flexDirection: $stacked ? 'column' : 'row',
    alignItems: 'stretch',
    rowGap: $gap,
    columnGap: $gap,
  },
]);

const StackContainer = styled(View, {
  shouldForwardProp: (prop) => !prop.startsWith('$') && prop !== 'theme',
})<{ $gap: number }>(({ $gap }) => [
  { minWidth: 0, maxWidth: '100%', rowGap: $gap, columnGap: $gap },
]);

const ProgressValueProgressValueBase = styled(ProgressValueBase, {
  shouldForwardProp: (prop) => !prop.startsWith('$') && prop !== 'theme',
})<{ $max: number; $color: string }>(({ $max, $color }) => [
  { width: `${$max}%`, backgroundColor: $color },
]);

const SoftIconSoftIconBase = styled(SoftIconBase, {
  shouldForwardProp: (prop) => !prop.startsWith('$') && prop !== 'theme',
})<{ $size: number; $color: string }>(({ $size, $color }) => [
  { width: $size, height: $size, flexShrink: 0, backgroundColor: $color },
]);

const IconActionOutline = styled(OutlineButton)({ columnGap: 7, rowGap: 7 });
const IconActionPrimary = styled(PrimaryButton)({ columnGap: 7, rowGap: 7 });
