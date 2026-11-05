import { withPressFeedback } from '@component/shared/ui/withPressFeedback';
import styledNative from '@emotion/native';
import { useState } from 'react';
import { Image, Pressable, View } from 'react-native';
import type { HomeBand } from './home.types';
import { ActionButton, FlexBetween, Heading, Meta, Surface } from '@component/shared/ui/ProductUI';
import { AppIcon } from '@component/shared/icons';

export function HomeBandsSection({
  bands,
  onOpenBand,
  onCreateBand,
  mobile,
  cardGap,
  cardPadding,
}: {
  bands: HomeBand[];
  onOpenBand: (id: string) => void;
  onCreateBand: () => void;
  mobile: boolean;
  cardGap: number;
  cardPadding: number;
}) {
  const [contentWidth, setContentWidth] = useState(0);
  return (
    <TourHomeBands
      nativeID="tour-home-bands"

      onLayout={(event) => setContentWidth(event.nativeEvent.layout.width)}
    >
      <HomeBandsSectionHeader>
        <Heading>내 밴드</Heading>
        <ActionButton secondary compact accessibilityLabel="새 밴드 만들기" onPress={onCreateBand}>
          + 새 밴드 만들기
        </ActionButton>
      </HomeBandsSectionHeader>
      <HomeBandsSectionContainer $cardGap={cardGap}>
        {bands.map((band) => (
          <HomeBandsSectionButton
            key={band.id}
            accessibilityRole="button"
            accessibilityLabel={`${band.name} 밴드 홈`}
            onPress={() => onOpenBand(band.id)}
            $mobile={mobile}
            $contentWidth={contentWidth}
            $cardGap={cardGap}
          >
            <HomeBandsSectionPanel $cardPadding={cardPadding}>
              {band.photo ? (
                <HomeBandsSectionImage
                  source={{ uri: band.photo }}
                  accessibilityLabel={`${band.name} 밴드 이미지`}
                  resizeMode="cover"
                />
              ) : (
                <HomeBandsSectionContainer2 $bandColor={band.color}>
                  <AppIcon name="users" size={23} color={band.color} />
                </HomeBandsSectionContainer2>
              )}
              <HomeBandsSectionContainer3>
                <HomeBandsSectionHeading>{band.name}</HomeBandsSectionHeading>
                {!!band.description && <Meta>{band.description}</Meta>}
                <Meta>
                  멤버 {band.memberCount}명 · 내 파트 {band.myPart}
                </Meta>
              </HomeBandsSectionContainer3>
              <AppIcon name="chevron-right" size={16} color="#72819a" />
            </HomeBandsSectionPanel>
          </HomeBandsSectionButton>
        ))}
      </HomeBandsSectionContainer>
      {!bands.length && (
        <Surface>
          <Meta>함께할 밴드를 만들고 음악 활동을 시작해보세요.</Meta>
        </Surface>
      )}
    </TourHomeBands>
  );
}

const TourHomeBands = styledNative(View)({ rowGap: 12, columnGap: 12 });

const HomeBandsSectionHeader = styledNative(FlexBetween)({ minHeight: 34 });

const HomeBandsSectionContainer = styledNative(View, {
  shouldForwardProp: (prop) => !prop.startsWith('$') && prop !== 'theme',
})<{ $cardGap: number }>(({ $cardGap }) => ({
  flexDirection: 'row',
  flexWrap: 'wrap',
  rowGap: $cardGap,
  columnGap: $cardGap,
}));

const HomeBandsSectionPanel = styledNative(Surface, {
  shouldForwardProp: (prop) => !prop.startsWith('$') && prop !== 'theme',
})<{ $cardPadding: number }>(({ $cardPadding }) => ({
  flex: 1,
  flexDirection: 'row',
  alignItems: 'center',
  paddingTop: $cardPadding,
  paddingRight: $cardPadding,
  paddingBottom: $cardPadding,
  paddingLeft: $cardPadding,
  rowGap: 12,
  columnGap: 12,
  borderTopLeftRadius: 16,
  borderTopRightRadius: 16,
  borderBottomRightRadius: 16,
  borderBottomLeftRadius: 16,
}));

const HomeBandsSectionImage = styledNative(Image)({
  width: 44,
  height: 44,
  borderTopLeftRadius: 10,
  borderTopRightRadius: 10,
  borderBottomRightRadius: 10,
  borderBottomLeftRadius: 10,
  flexShrink: 0,
});

const HomeBandsSectionContainer2 = styledNative(View, {
  shouldForwardProp: (prop) => !prop.startsWith('$') && prop !== 'theme',
})<{ $bandColor: string }>(({ $bandColor }) => ({
  width: 44,
  height: 44,
  flexShrink: 0,
  borderTopLeftRadius: 10,
  borderTopRightRadius: 10,
  borderBottomRightRadius: 10,
  borderBottomLeftRadius: 10,
  backgroundColor: `${$bandColor}15`,
  alignItems: 'center',
  justifyContent: 'center',
}));

const HomeBandsSectionContainer3 = styledNative(View)({
  flex: 1,
  minWidth: 0,
  rowGap: 3,
  columnGap: 3,
});

const HomeBandsSectionHeading = styledNative(Heading)({ fontSize: 16 });

const HomeBandsSectionButton = withPressFeedback(
  styledNative(Pressable, {
    shouldForwardProp: (prop) => !prop.startsWith('$') && prop !== 'theme',
  })<{ $mobile: boolean; $contentWidth: number; $cardGap: number; $pressed: boolean }>(
    ({ $mobile, $contentWidth, $cardGap, $pressed }) => ({
      width: $mobile || !$contentWidth ? '100%' : ($contentWidth - $cardGap) / 2,
      borderTopLeftRadius: 16,
      borderTopRightRadius: 16,
      borderBottomRightRadius: 16,
      borderBottomLeftRadius: 16,
      opacity: $pressed ? 0.7 : 1,
    }),
  ),
);
