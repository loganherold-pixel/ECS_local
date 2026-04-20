import type {
  ECSSurfaceLayoutProfile,
  ECSResponsiveTier,
  ECSViewportMetrics,
} from './layoutDensityTypes';

function resolveContentMaxWidth(
  tier: ECSResponsiveTier,
  safeWidth: number,
): number | undefined {
  if (tier === 'wide_tablet') {
    return Math.min(1680, Math.max(1400, Math.round(safeWidth * 0.94)));
  }
  if (tier === 'standard_tablet') {
    return Math.min(1440, Math.max(1180, Math.round(safeWidth * 0.95)));
  }
  if (tier === 'large_phone') {
    return Math.min(1180, Math.max(940, Math.round(safeWidth * 0.95)));
  }
  return undefined;
}

export function resolveSurfaceLayoutProfile(
  metrics: ECSViewportMetrics,
  tier: ECSResponsiveTier,
): ECSSurfaceLayoutProfile {
  const safeWidth = metrics.safeWidth || metrics.width;
  const safeHeight = metrics.safeHeight || metrics.height;
  const isShortHeight = safeHeight < 780;

  const horizontalPadding =
    tier === 'wide_tablet'
      ? Math.min(38, Math.max(26, Math.round(safeWidth * 0.026)))
      : tier === 'standard_tablet'
        ? Math.min(32, Math.max(22, Math.round(safeWidth * 0.024)))
        : tier === 'large_phone'
          ? 18
          : 14;

  const panelGap =
    tier === 'wide_tablet' ? 20 : tier === 'standard_tablet' ? 18 : tier === 'large_phone' ? 14 : 10;
  const sectionGap =
    tier === 'wide_tablet' ? 20 : tier === 'standard_tablet' ? 18 : 12;
  const headerGap =
    tier === 'wide_tablet' ? 20 : tier === 'standard_tablet' ? 18 : 12;

  const contentMaxWidth = resolveContentMaxWidth(tier, safeWidth);

  const shellHeaderMaxWidth =
    tier === 'wide_tablet'
      ? Math.min(1560, Math.round(safeWidth * 0.95))
      : tier === 'standard_tablet'
        ? Math.min(1360, Math.round(safeWidth * 0.96))
        : undefined;

  const dockMaxWidth =
    tier === 'wide_tablet'
      ? Math.min(1180, Math.round(safeWidth * 0.82))
      : tier === 'standard_tablet'
        ? Math.min(1020, Math.round(safeWidth * 0.9))
        : undefined;

  const routeCardMaxWidth =
    tier === 'wide_tablet' ? 720 : tier === 'standard_tablet' ? 620 : 460;

  return {
    horizontalPadding,
    contentMaxWidth,
    panelGap,
    sectionGap,
    headerGap,
    typeScale:
      tier === 'wide_tablet' ? 1.08 : tier === 'standard_tablet' ? 1.04 : 1,
    densityScale:
      tier === 'wide_tablet' ? 1.06 : tier === 'standard_tablet' ? 1.03 : 1,
    maxReadableLineLength:
      tier === 'wide_tablet' ? 84 : tier === 'standard_tablet' ? 76 : 64,
    shell: {
      headerMaxWidth: shellHeaderMaxWidth,
      headerHorizontalPadding:
        tier === 'wide_tablet' ? 28 : tier === 'standard_tablet' ? 24 : tier === 'large_phone' ? 18 : 14,
      headerMinHeight:
        tier === 'wide_tablet' ? 70 : tier === 'standard_tablet' ? 66 : tier === 'large_phone' ? 58 : 54,
      dockMaxWidth,
      dockHorizontalPadding:
        tier === 'wide_tablet' ? 38 : tier === 'standard_tablet' ? 32 : tier === 'large_phone' ? 24 : 18,
      dockOuterGutter:
        tier === 'wide_tablet' ? 12 : tier === 'standard_tablet' ? 10 : 0,
      profilePanelWidth:
        tier === 'wide_tablet' ? 392 : tier === 'standard_tablet' ? 352 : 292,
      profilePanelMaxHeight:
        tier === 'wide_tablet' ? 620 : tier === 'standard_tablet' ? 540 : 420,
    },
    overlay: {
      sideClearance:
        tier === 'wide_tablet' ? 34 : tier === 'standard_tablet' ? 28 : tier === 'large_phone' ? 18 : 14,
      expandedWidthBias:
        tier === 'wide_tablet' ? 64 : tier === 'standard_tablet' ? 52 : 0,
      sheetMaxWidth:
        tier === 'wide_tablet'
          ? 1180
          : tier === 'standard_tablet'
            ? 1000
            : tier === 'large_phone'
              ? 820
              : 760,
      dialogMaxWidth:
        tier === 'wide_tablet'
          ? 580
          : tier === 'standard_tablet'
            ? 520
            : tier === 'large_phone'
              ? 450
              : 430,
      headerPaddingHorizontal:
        tier === 'wide_tablet' ? 22 : tier === 'standard_tablet' ? 20 : tier === 'large_phone' ? 16 : 14,
      headerPaddingVertical:
        tier === 'wide_tablet' ? 13 : tier === 'standard_tablet' ? 12 : tier === 'large_phone' ? 11 : 10,
      bodyPadding:
        tier === 'wide_tablet' ? 22 : tier === 'standard_tablet' ? 20 : tier === 'large_phone' ? 16 : 14,
      footerPaddingHorizontal:
        tier === 'wide_tablet' ? 22 : tier === 'standard_tablet' ? 20 : tier === 'large_phone' ? 16 : 14,
      titleSize:
        tier === 'wide_tablet' ? 15 : tier === 'standard_tablet' ? 14 : 12,
      subtitleSize:
        tier === 'wide_tablet' ? 12 : tier === 'standard_tablet' ? 11 : 10,
      eyebrowSize:
        tier === 'wide_tablet' ? 9 : tier === 'standard_tablet' ? 9 : 8,
      controlSize:
        tier === 'wide_tablet' ? 38 : tier === 'standard_tablet' ? 36 : 32,
      iconGlyphSize:
        tier === 'wide_tablet' ? 19 : tier === 'standard_tablet' ? 18 : 16,
      actionGlyphSize:
        tier === 'wide_tablet' ? 21 : tier === 'standard_tablet' ? 20 : 18,
    },
    dashboard: {
      frameMaxWidth:
        tier === 'wide_tablet'
          ? Math.min(1600, Math.round(safeWidth * 0.95))
          : tier === 'standard_tablet'
            ? Math.min(1400, Math.round(safeWidth * 0.96))
            : contentMaxWidth,
      gridPadding:
        tier === 'wide_tablet' ? 20 : tier === 'standard_tablet' ? 18 : tier === 'large_phone' ? 14 : isShortHeight ? 12 : 14,
      gridGap:
        tier === 'wide_tablet' ? 16 : tier === 'standard_tablet' ? 14 : isShortHeight ? 6 : 10,
      highwayGridPadding:
        tier === 'wide_tablet' ? 24 : tier === 'standard_tablet' ? 20 : isShortHeight ? 18 : 16,
      highwayGridGap:
        tier === 'wide_tablet' ? 16 : tier === 'standard_tablet' ? 14 : isShortHeight ? 12 : 10,
      widgetPadding:
        tier === 'wide_tablet' ? 18 : tier === 'standard_tablet' ? 16 : 14,
    },
    navigate: {
      overlayEdge:
        tier === 'wide_tablet' ? 24 : tier === 'standard_tablet' ? 20 : 14,
      overlayGap:
        tier === 'wide_tablet' ? 16 : tier === 'standard_tablet' ? 14 : safeHeight < 760 ? 10 : 12,
      overlayGroupGap:
        tier === 'wide_tablet' ? 22 : tier === 'standard_tablet' ? 20 : safeHeight < 760 ? 14 : 18,
      popupWidth:
        tier === 'wide_tablet'
          ? Math.min(560, Math.max(440, Math.round(safeWidth * 0.31)))
          : tier === 'standard_tablet'
            ? Math.min(500, Math.max(390, Math.round(safeWidth * 0.36)))
            : undefined,
      routeSurfacePreviewHeight:
        tier === 'wide_tablet' ? 244 : tier === 'standard_tablet' ? 234 : safeHeight < 760 ? 208 : 220,
      routeSurfaceActiveHeight:
        tier === 'wide_tablet' ? 154 : tier === 'standard_tablet' ? 146 : safeHeight < 760 ? 128 : 136,
      routeSurfaceArrivedHeight:
        tier === 'wide_tablet' ? 142 : tier === 'standard_tablet' ? 136 : safeHeight < 760 ? 120 : 128,
    },
    fleet: {
      multiPane: tier === 'standard_tablet' || tier === 'wide_tablet',
      previewMinWidth: tier === 'wide_tablet' ? 440 : tier === 'standard_tablet' ? 380 : 340,
      previewMaxWidth: tier === 'wide_tablet' ? 620 : tier === 'standard_tablet' ? 540 : 460,
    },
    setup: {
      fixedStepMaxWidth:
        tier === 'wide_tablet' ? 680 : tier === 'standard_tablet' ? 600 : 480,
      fixedStepHorizontalPadding:
        tier === 'wide_tablet' ? 28 : tier === 'standard_tablet' ? 24 : 16,
    },
    explore: {
      supportColumns: tier === 'standard_tablet' || tier === 'wide_tablet' ? 2 : 1,
      routeColumns: tier === 'standard_tablet' || tier === 'wide_tablet' ? 2 : 1,
      utilityCardWidth:
        tier === 'wide_tablet'
          ? Math.min(560, Math.max(380, Math.round((Math.min(contentMaxWidth ?? safeWidth, safeWidth) - panelGap) / 2)))
          : tier === 'standard_tablet'
            ? Math.min(500, Math.max(360, Math.round((Math.min(contentMaxWidth ?? safeWidth, safeWidth) - panelGap) / 2)))
            : Math.max(296, Math.min(safeWidth - 54, 390)),
      routeCardMaxWidth,
    },
    alert: {
      dualPane: tier === 'standard_tablet' || tier === 'wide_tablet',
    },
  };
}
