import styledNative from '@emotion/native';
import moajamLogo from '@assets/logo.png';
import { BrandButton, BrandMark, BrandName } from './MainLayout.styles';
const brandLogoSource = typeof moajamLogo === 'string' ? { uri: moajamLogo } : moajamLogo;
export function ShellBrand({
  compact = false,
  onPress,
}: {
  compact?: boolean;
  onPress: () => void;
}) {
  return (
    <ShellBrandBrandButton
      accessibilityRole="button"
      accessibilityLabel="개인 홈으로 이동"
      onPress={onPress}
      $compact={compact}
    >
      <ShellBrandBrandMark source={brandLogoSource} resizeMode="contain" $compact={compact} />
      {!compact && <BrandName>moajam</BrandName>}
    </ShellBrandBrandButton>
  );
}

const ShellBrandBrandButton = styledNative(BrandButton, {
  shouldForwardProp: (prop) => !prop.startsWith('$') && prop !== 'theme',
})<{ $compact: boolean }>(({ $compact }) =>
  $compact ? undefined : { rowGap: 10, columnGap: 10, paddingLeft: 4, paddingRight: 4 },
);

const ShellBrandBrandMark = styledNative(BrandMark, {
  shouldForwardProp: (prop) => !prop.startsWith('$') && prop !== 'theme',
})<{ $compact: boolean }>(({ $compact }) => ($compact ? { width: 32, height: 32 } : undefined));
