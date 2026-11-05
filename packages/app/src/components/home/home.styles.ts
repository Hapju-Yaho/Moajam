import { css } from '@emotion/native';
// 홈 화면의 공통 간격과 반응형 기준. 카드별 세부 스타일은 각 컴포넌트에서 수정합니다.
export const homeLayout = {
  mobileBreakpoint: 768,
  sectionGap: 20,
  cardGap: 16,
  mobilePadding: 12,
  desktopPadding: 16,
  contentGap: 12,
  cardRadius: 16,
} as const;

export const homeCardStyle = (mobile: boolean) =>
  css({
    paddingTop: mobile ? homeLayout.mobilePadding : homeLayout.desktopPadding,
    paddingRight: mobile ? homeLayout.mobilePadding : homeLayout.desktopPadding,
    paddingBottom: mobile ? homeLayout.mobilePadding : homeLayout.desktopPadding,
    paddingLeft: mobile ? homeLayout.mobilePadding : homeLayout.desktopPadding,
    rowGap: homeLayout.contentGap,
    columnGap: homeLayout.contentGap,
    borderTopLeftRadius: homeLayout.cardRadius,
    borderTopRightRadius: homeLayout.cardRadius,
    borderBottomRightRadius: homeLayout.cardRadius,
    borderBottomLeftRadius: homeLayout.cardRadius,
  });
