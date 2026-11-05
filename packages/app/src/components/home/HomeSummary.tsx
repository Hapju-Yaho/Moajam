import styledNative from '@emotion/native';
import { View } from 'react-native';
import { Heading, Meta, Surface } from '@component/shared/ui/ProductUI';
import { AppIcon, type AppIconName } from '@component/shared/icons';

export function HomeSummary({
  stats,
  mobile,
}: {
  stats: { icon: AppIconName; label: string; value: string }[];
  mobile: boolean;
}) {
  return (
    <PersonalHomeSummary nativeID="personal-home-summary">
      {stats.map((stat, index) => (
        <HomeSummaryContainer key={stat.label} $mobile={mobile} $index={index}>
          <HomeSummaryContainer2>
            <HomeSummaryContainer3 $mobile={mobile}>
              <AppIcon name={stat.icon} size={mobile ? 17 : 20} color="#2563eb" />
            </HomeSummaryContainer3>
            {mobile && <HomeSummaryHeading>{stat.value}</HomeSummaryHeading>}
          </HomeSummaryContainer2>
          <HomeSummaryContainer4>
            <HomeSummaryMeta $mobile={mobile}>{stat.label}</HomeSummaryMeta>
            {!mobile && <HomeSummaryHeading2>{stat.value}</HomeSummaryHeading2>}
          </HomeSummaryContainer4>
        </HomeSummaryContainer>
      ))}
    </PersonalHomeSummary>
  );
}

const PersonalHomeSummary = styledNative(Surface)({
  flexDirection: 'row',
  paddingTop: 0,
  paddingRight: 0,
  paddingBottom: 0,
  paddingLeft: 0,
  rowGap: 0,
  columnGap: 0,
});

const HomeSummaryContainer = styledNative(View, {
  shouldForwardProp: (prop) => !prop.startsWith('$') && prop !== 'theme',
})<{ $mobile: boolean; $index: number }>(({ $mobile, $index }) => ({
  flex: 1,
  minWidth: 0,
  flexDirection: $mobile ? 'column' : 'row',
  alignItems: 'center',
  justifyContent: $mobile ? 'center' : 'flex-start',
  rowGap: $mobile ? 6 : 12,
  columnGap: $mobile ? 6 : 12,
  paddingLeft: $mobile ? 8 : 18,
  paddingRight: $mobile ? 8 : 18,
  paddingTop: 14,
  paddingBottom: 14,
  borderLeftWidth: $index ? 1 : 0,
  borderLeftColor: '#e8edf5',
}));

const HomeSummaryContainer2 = styledNative(View)({
  flexDirection: 'row',
  alignItems: 'center',
  rowGap: 6,
  columnGap: 6,
});

const HomeSummaryContainer3 = styledNative(View, {
  shouldForwardProp: (prop) => !prop.startsWith('$') && prop !== 'theme',
})<{ $mobile: boolean }>(({ $mobile }) => ({
  paddingTop: $mobile ? 0 : 8,
  paddingRight: $mobile ? 0 : 8,
  paddingBottom: $mobile ? 0 : 8,
  paddingLeft: $mobile ? 0 : 8,
  borderTopLeftRadius: 10,
  borderTopRightRadius: 10,
  borderBottomRightRadius: 10,
  borderBottomLeftRadius: 10,
  backgroundColor: $mobile ? 'transparent' : '#edf3ff',
}));

const HomeSummaryHeading = styledNative(Heading)({ fontSize: 20 });

const HomeSummaryContainer4 = styledNative(View)({
  minWidth: 0,
  flexShrink: 1,
  rowGap: 2,
  columnGap: 2,
});

const HomeSummaryMeta = styledNative(Meta, {
  shouldForwardProp: (prop) => !prop.startsWith('$') && prop !== 'theme',
})<{ $mobile: boolean }>(({ $mobile }) => ({
  textAlign: $mobile ? 'center' : 'left',
  fontSize: $mobile ? 11 : 12,
}));

const HomeSummaryHeading2 = styledNative(Heading)({ fontSize: 21 });
