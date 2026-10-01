import { parseVideoUrl } from '../lib/video';
import styled from '@emotion/native';
import { theme } from '@moajam/ui';
import type { PropsWithChildren, ReactNode } from 'react';
import { Pressable, Text, View, type ViewProps } from 'react-native';
import { getSongThumbnail } from '../lib/songMedia';
import { AppIcon, type AppIconName } from './icons';

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
  ...props
}: ViewProps & { tint?: string; danger?: boolean }) {
  return <SurfaceBase {...props} tint={tint} danger={danger} style={[{ gap: 14 }, style]} />;
}

export function PageTop({ style, ...props }: ViewProps) {
  return <View {...props} style={[{ gap: 5 }, style]} />;
}

export const PageHeading = styled.Text`
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
  return (
    <View
      {...props}
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
        },
        style,
      ]}
    />
  );
}

export function FlexRow({
  wrap,
  gap = 8,
  style,
  ...props
}: ViewProps & { wrap?: boolean; gap?: number }) {
  return (
    <View
      {...props}
      style={[
        { flexDirection: 'row', alignItems: 'center', flexWrap: wrap ? 'wrap' : 'nowrap', gap },
        style,
      ]}
    />
  );
}

export function ResponsiveGrid({
  stacked,
  gap = 16,
  style,
  ...props
}: ViewProps & { stacked?: boolean; gap?: number }) {
  return (
    <View
      {...props}
      style={[{ flexDirection: stacked ? 'column' : 'row', alignItems: 'stretch', gap }, style]}
    />
  );
}

export function Stack({ gap = 10, style, ...props }: ViewProps & { gap?: number }) {
  return <View {...props} style={[{ gap }, style]} />;
}

export const Divider = styled.View`
  height: 1px;
  background-color: ${theme.colors.border};
`;

export const OutlineButton = styled.Pressable<{ danger?: boolean; compact?: boolean }>`
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
  color: ${({ danger }) => (danger ? theme.colors.danger : theme.colors.primary)};
  font-size: 13px;
  font-weight: 500;
`;

export const PrimaryButton = styled.Pressable<{ danger?: boolean; compact?: boolean }>`
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
  color: white;
  font-size: 13px;
  font-weight: 500;
`;

export const Pill = styled.Pressable<{ active?: boolean; tone?: 'green' | 'amber' | 'red' }>`
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
    <ProgressValueBase
      {...props}
      style={[{ width: `${Math.max(0, Math.min(100, value))}%`, backgroundColor: color }, style]}
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
  return (
    <SoftIconBase
      {...props}
      style={[{ width: size, height: size, flexShrink: 0, backgroundColor: color }, style]}
    />
  );
}

export const ToggleTrack = styled.Pressable<{ on?: boolean }>`
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
    <StatSurface style={{ gap: 12 }}>
      <SoftIcon color={`${color}16`}>
        <AppIcon name={icon} color={color} size={21} />
      </SoftIcon>
      <View style={{ gap: 2 }}>
        <Meta>{label}</Meta>
        <Text style={{ color: theme.colors.text, fontSize: 22, fontWeight: '600' }}>{value}</Text>
      </View>
    </StatSurface>
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
      <View
        style={{
          width: size,
          height: size,
          flexShrink: 0,
          marginRight: 6,
          borderRadius: 10,
          backgroundColor: '#edf3ff',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text style={{ color: theme.colors.primary, fontSize: size / 3, fontWeight: '400' }}>
          ♪
        </Text>
      </View>
    );
  return (
    <CoverImage
      source={{ uri: source }}
      resizeMode="cover"
      size={size}
      style={{ width: size, height: size, flexShrink: 0, marginRight: 6 }}
    />
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
    <WaveSurface color={color} height={height} style={{ height, gap: 2 }}>
      {bars.map((bar, index) => (
        <View
          key={`${bar}-${index}`}
          style={{
            flex: 1,
            maxWidth: 5,
            height: Math.min(height - 4, bar),
            borderRadius: 2,
            backgroundColor: color,
            opacity: 0.72,
          }}
        />
      ))}
    </WaveSurface>
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
  onPress,
  secondary,
  danger,
  compact,
  disabled,
}: PropsWithChildren<{
  onPress?: () => void;
  secondary?: boolean;
  danger?: boolean;
  compact?: boolean;
  disabled?: boolean;
}>) {
  if (secondary) {
    return (
      <OutlineButton
        danger={danger}
        compact={compact}
        onPress={onPress}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityState={{ disabled }}
        style={{
          gap: 7,
          minHeight: compact ? 34 : 40,
          paddingVertical: compact ? 7 : 9,
          paddingHorizontal: compact ? 11 : 14,
        }}
      >
        <OutlineButtonText danger={danger}>{children}</OutlineButtonText>
      </OutlineButton>
    );
  }
  return (
    <PrimaryButton
      danger={danger}
      compact={compact}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      style={{
        gap: 7,
        minHeight: compact ? 34 : 40,
        paddingVertical: compact ? 7 : 9,
        paddingHorizontal: compact ? 11 : 15,
      }}
    >
      <PrimaryButtonText>{children}</PrimaryButtonText>
    </PrimaryButton>
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
  const SurfaceComponent = secondary ? OutlineButton : PrimaryButton;
  return (
    <SurfaceComponent onPress={onPress} style={{ gap: 7 }}>
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
    <Pressable
      onPress={onPress}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 5 }}
    >
      <View
        style={{
          width: 20,
          height: 20,
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: 5,
          borderWidth: 1,
          borderColor: checked ? theme.colors.primary : '#b8c3d5',
          backgroundColor: checked ? theme.colors.primary : 'white',
        }}
      >
        {checked ? <Text style={{ color: 'white', fontWeight: '600' }}>✓</Text> : null}
      </View>
      <Copy style={{ flex: 1 }}>{label}</Copy>
      {meta}
    </Pressable>
  );
}

export function Slider({ value, color = theme.colors.primary }: { value: number; color?: string }) {
  return (
    <View style={{ flex: 1, height: 6, borderRadius: 999, backgroundColor: '#e4eaf3' }}>
      <View
        style={{
          width: `${Math.max(0, Math.min(100, value))}%`,
          height: 6,
          borderRadius: 999,
          backgroundColor: color,
        }}
      />
    </View>
  );
}
