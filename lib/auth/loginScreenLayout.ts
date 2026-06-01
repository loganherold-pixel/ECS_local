import { resolveAuthLayoutMetrics, type AuthLayoutMetrics } from './authResponsive';

export const LOGIN_LOGO_ASPECT_RATIO = 1536 / 1024;
export const LOGIN_LOGO_WIDTH_RATIO = 0.72;
export const LOGIN_LOGO_MAX_WIDTH = 260;
export const LOGIN_LOGO_LANDSCAPE_HEIGHT_RATIO = 0.16;
export const LOGIN_LOGO_COMPACT_PORTRAIT_HEIGHT_RATIO = 0.22;
export const LOGIN_FORM_HORIZONTAL_INSET = 24;
export const LOGIN_STATUS_INDICATOR_HEIGHT = 24;

export type LoginScreenLayoutMode = 'portrait_stack' | 'landscape_split';

export type LoginScreenLayout = {
  layoutMetrics: AuthLayoutMetrics;
  layoutMode: LoginScreenLayoutMode;
  shellTopPadding: number;
  shellBottomPadding: number;
  authViewportHeight: number;
  contentMaxWidth: number;
  contentGap: number;
  formWidth: number;
  formMaxHeight: number | null;
  cardScrollEnabled: boolean;
  compactLayout: boolean;
  statusInline: boolean;
  logoWidth: number;
  headerHeight: number;
};

export function resolveLoginScreenLayout(input: {
  width: number;
  height: number;
  safeAreaTop?: number;
  safeAreaBottom?: number;
}): LoginScreenLayout {
  const { width, height, safeAreaTop = 0, safeAreaBottom = 0 } = input;
  const layoutMetrics = resolveAuthLayoutMetrics(width, height);
  const shellTopPadding = safeAreaTop + layoutMetrics.topPadding;
  const shellBottomPadding = safeAreaBottom + layoutMetrics.bottomPadding;
  const authViewportHeight = Math.max(0, height - shellTopPadding - shellBottomPadding);
  const availableWidth = Math.max(0, width - layoutMetrics.horizontalPadding * 2);
  const isLandscape = width > height;
  const compactPortrait = !isLandscape && authViewportHeight < 620;

  if (isLandscape) {
    const contentGap = authViewportHeight < 360 ? 10 : 16;
    const minimumBrandRailWidth = Math.min(150, Math.max(90, availableWidth * 0.24));
    const minimumFormWidth = Math.min(300, Math.max(220, availableWidth * 0.58));
    const targetFormWidth = Math.min(layoutMetrics.columnMaxWidth, 430, Math.max(minimumFormWidth, availableWidth * 0.64));
    let formWidth = Math.min(
      targetFormWidth,
      Math.max(minimumFormWidth, availableWidth - minimumBrandRailWidth - contentGap),
    );
    let brandRailWidth = Math.max(0, availableWidth - formWidth - contentGap);
    if (brandRailWidth < minimumBrandRailWidth) {
      brandRailWidth = Math.max(0, Math.min(minimumBrandRailWidth, availableWidth - minimumFormWidth - contentGap));
      formWidth = Math.max(220, availableWidth - brandRailWidth - contentGap);
    }
    const logoHeightBudget = Math.max(
      42,
      Math.min(
        Math.floor(authViewportHeight * 0.34),
        Math.floor((brandRailWidth * 0.9) / LOGIN_LOGO_ASPECT_RATIO),
      ),
    );
    const logoWidth = Math.min(
      brandRailWidth,
      LOGIN_LOGO_MAX_WIDTH,
      Math.round(logoHeightBudget * LOGIN_LOGO_ASPECT_RATIO),
    );

    return {
      layoutMetrics,
      layoutMode: 'landscape_split',
      shellTopPadding,
      shellBottomPadding,
      authViewportHeight,
      contentMaxWidth: Math.max(0, brandRailWidth + contentGap + formWidth),
      contentGap,
      formWidth,
      formMaxHeight: Math.max(240, authViewportHeight),
      cardScrollEnabled: authViewportHeight < 520,
      compactLayout: true,
      statusInline: true,
      logoWidth,
      headerHeight: Math.max(0, authViewportHeight),
    };
  }

  const authContentWidth = Math.min(
    layoutMetrics.columnMaxWidth,
    Math.max(0, availableWidth),
  );
  const authFormInnerWidth = Math.max(0, authContentWidth - LOGIN_FORM_HORIZONTAL_INSET);
  const logoHeightBudget = compactPortrait
    ? Math.max(74, Math.floor(authViewportHeight * LOGIN_LOGO_COMPACT_PORTRAIT_HEIGHT_RATIO))
    : Number.POSITIVE_INFINITY;
  const logoWidth = Math.min(
    authFormInnerWidth,
    LOGIN_LOGO_MAX_WIDTH,
    Math.round(authContentWidth * LOGIN_LOGO_WIDTH_RATIO),
    Math.round(logoHeightBudget * LOGIN_LOGO_ASPECT_RATIO),
  );
  const cardTopTarget = height * 0.5;
  const cardOuterMarginTop = 2;
  const logoHeight = logoWidth / LOGIN_LOGO_ASPECT_RATIO;
  const minimumHeaderHeight =
    Math.ceil(logoHeight) + LOGIN_STATUS_INDICATOR_HEIGHT + (layoutMetrics.compact ? 28 : 38);

  return {
    layoutMetrics,
    layoutMode: 'portrait_stack',
    shellTopPadding,
    shellBottomPadding,
    authViewportHeight,
    contentMaxWidth: layoutMetrics.columnMaxWidth,
    contentGap: 0,
    formWidth: authContentWidth,
    formMaxHeight: null,
    cardScrollEnabled: false,
    compactLayout: false,
    statusInline: false,
    logoWidth,
    headerHeight: Math.max(minimumHeaderHeight, Math.round(cardTopTarget - shellTopPadding - cardOuterMarginTop)),
  };
}
