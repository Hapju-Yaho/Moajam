import styledNative from '@emotion/native';
import type { ReactNode } from 'react';
import { Image, useWindowDimensions } from 'react-native';
import {
  FlexBetween,
  FlexRow,
  PageDescription,
  PageHeading,
  PageTop,
} from '@component/shared/ui/ProductUI';

export function HomeHeader({
  title,
  description,
  photo,
  actions,
  stackAt = 768,
  smallTitle = true,
}: {
  title: string;
  description?: string;
  photo?: string;
  actions?: ReactNode;
  stackAt?: number;
  smallTitle?: boolean;
}) {
  const { width } = useWindowDimensions();
  return (
    <HomeHeaderHeader $width={width} $stackAt={stackAt}>
      <HomeHeaderPageTop>
        <FlexRow wrap={false}>
          {photo && <HomeHeaderImage source={{ uri: photo }} />}
          <HomeHeaderPageHeading $smallTitle={smallTitle} $width={width}>
            {title}
          </HomeHeaderPageHeading>
        </FlexRow>
        {!!description && <PageDescription>{description}</PageDescription>}
      </HomeHeaderPageTop>
      {actions}
    </HomeHeaderHeader>
  );
}

const HomeHeaderHeader = styledNative(FlexBetween, {
  shouldForwardProp: (prop) => !prop.startsWith('$') && prop !== 'theme',
})<{ $width: number; $stackAt: number }>(({ $width, $stackAt }) =>
  $width < $stackAt ? { flexDirection: 'column', alignItems: 'stretch' } : undefined,
);

const HomeHeaderPageTop = styledNative(PageTop)({ flex: 1 });

const HomeHeaderImage = styledNative(Image)({
  width: 48,
  height: 48,
  borderTopLeftRadius: 24,
  borderTopRightRadius: 24,
  borderBottomRightRadius: 24,
  borderBottomLeftRadius: 24,
  flexShrink: 0,
});

const HomeHeaderPageHeading = styledNative(PageHeading, {
  shouldForwardProp: (prop) => !prop.startsWith('$') && prop !== 'theme',
})<{ $smallTitle: boolean; $width: number }>(({ $smallTitle, $width }) =>
  $smallTitle && $width < 768 ? { fontSize: 24 } : undefined,
);
