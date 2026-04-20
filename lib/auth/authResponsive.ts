import { AUTH_VISUAL_SPEC } from './authVisualSpec';

export type AuthLayoutMetrics = {
  sizeClass:
    | 'phone_compact'
    | 'phone_standard'
    | 'phone_tall'
    | 'phone_landscape'
    | 'tablet_portrait'
    | 'tablet_landscape';
  horizontalPadding: number;
  topPadding: number;
  bottomPadding: number;
  columnMaxWidth: number;
  footerMaxWidth: number;
  brandGap: number;
  footerGap: number;
  centerContent: boolean;
  compact: boolean;
  loadingMaxWidth: number;
  accessGateMaxWidth: number;
};

export function resolveAuthLayoutMetrics(width: number, height: number): AuthLayoutMetrics {
  const isTablet = width >= AUTH_VISUAL_SPEC.breakpoints.tabletMinWidth;
  const isLandscape = width > height;
  const shortHeight = height <= AUTH_VISUAL_SPEC.breakpoints.compactHeightMax;
  const narrowLandscape = isLandscape && height <= AUTH_VISUAL_SPEC.breakpoints.narrowLandscapeHeightMax;
  const tallPhone = !isTablet && !isLandscape && height >= AUTH_VISUAL_SPEC.breakpoints.tallPhoneHeightMin;

  const horizontalPadding = isTablet ? 36 : narrowLandscape ? 20 : 22;
  const topPadding = isTablet
    ? AUTH_VISUAL_SPEC.spacing.topPadding.tablet
    : narrowLandscape
      ? AUTH_VISUAL_SPEC.spacing.topPadding.compactLandscape
      : shortHeight
        ? AUTH_VISUAL_SPEC.spacing.topPadding.compactPortrait
        : AUTH_VISUAL_SPEC.spacing.topPadding.standardPhone;
  const bottomPadding = isTablet
    ? AUTH_VISUAL_SPEC.spacing.bottomPadding.tablet
    : narrowLandscape
      ? AUTH_VISUAL_SPEC.spacing.bottomPadding.compactLandscape
      : shortHeight
        ? AUTH_VISUAL_SPEC.spacing.bottomPadding.compactPortrait
        : AUTH_VISUAL_SPEC.spacing.bottomPadding.standardPhone;
  const columnMaxWidth = isTablet
    ? Math.min(
        Math.max(width * AUTH_VISUAL_SPEC.widths.tabletFactor, AUTH_VISUAL_SPEC.widths.tabletMin),
        AUTH_VISUAL_SPEC.widths.tabletMax,
      )
    : narrowLandscape
      ? Math.min(
          Math.max(
            width * AUTH_VISUAL_SPEC.widths.narrowLandscapeFactor,
            AUTH_VISUAL_SPEC.widths.narrowLandscapeMin,
          ),
          AUTH_VISUAL_SPEC.widths.narrowLandscapeMax,
        )
      : AUTH_VISUAL_SPEC.widths.phoneColumnMax;
  const footerMaxWidth = Math.min(
    columnMaxWidth - 40,
    isTablet ? AUTH_VISUAL_SPEC.widths.footerTabletMax : AUTH_VISUAL_SPEC.widths.footerPhoneMax,
  );
  const brandGap = isTablet
    ? AUTH_VISUAL_SPEC.spacing.brandGap.tablet
    : narrowLandscape
      ? AUTH_VISUAL_SPEC.spacing.brandGap.compactLandscape
      : shortHeight
        ? AUTH_VISUAL_SPEC.spacing.brandGap.compactPortrait
        : AUTH_VISUAL_SPEC.spacing.brandGap.standardPhone;
  const footerGap = isTablet
    ? AUTH_VISUAL_SPEC.spacing.footerGap.tablet
    : narrowLandscape
      ? AUTH_VISUAL_SPEC.spacing.footerGap.compactLandscape
      : AUTH_VISUAL_SPEC.spacing.footerGap.standardPhone;
  const centerContent = !narrowLandscape && height >= 620;
  const loadingMaxWidth = isTablet
    ? AUTH_VISUAL_SPEC.widths.loadingTabletMax
    : narrowLandscape
      ? AUTH_VISUAL_SPEC.widths.loadingLandscapeMax
      : AUTH_VISUAL_SPEC.widths.loadingPhoneMax;
  const accessGateMaxWidth = isTablet
    ? AUTH_VISUAL_SPEC.widths.accessGateTabletMax
    : narrowLandscape
      ? AUTH_VISUAL_SPEC.widths.accessGateLandscapeMax
      : AUTH_VISUAL_SPEC.widths.accessGatePhoneMax;
  const sizeClass = isTablet
    ? isLandscape
      ? 'tablet_landscape'
      : 'tablet_portrait'
    : narrowLandscape
      ? 'phone_landscape'
      : shortHeight
        ? 'phone_compact'
        : tallPhone
          ? 'phone_tall'
          : 'phone_standard';

  return {
    sizeClass,
    horizontalPadding,
    topPadding,
    bottomPadding,
    columnMaxWidth,
    footerMaxWidth,
    brandGap,
    footerGap,
    centerContent,
    compact: narrowLandscape || shortHeight,
    loadingMaxWidth,
    accessGateMaxWidth,
  };
}
