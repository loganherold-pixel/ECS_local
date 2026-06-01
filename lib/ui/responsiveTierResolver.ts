import type { EdgeInsets } from 'react-native-safe-area-context';
import type { ECSResponsiveTier, ECSViewportMetrics } from './layoutDensityTypes';

export function getViewportMetrics(
  width: number,
  height: number,
  insets?: Partial<EdgeInsets> | null,
): ECSViewportMetrics {
  const safeWidth = Math.max(
    0,
    width - (insets?.left ?? 0) - (insets?.right ?? 0),
  );
  const safeHeight = Math.max(
    0,
    height - (insets?.top ?? 0) - (insets?.bottom ?? 0),
  );
  const shortestSide = Math.min(safeWidth || width, safeHeight || height);
  const longestSide = Math.max(safeWidth || width, safeHeight || height);
  const orientation = width >= height ? 'landscape' : 'portrait';
  const aspectRatio = longestSide / Math.max(shortestSide, 1);
  const isTabletScale = shortestSide >= 720 || (safeWidth >= 960 && safeHeight >= 700);

  return {
    width,
    height,
    safeWidth,
    safeHeight,
    shortestSide,
    longestSide,
    aspectRatio,
    orientation,
    isLandscape: orientation === 'landscape',
    isTabletScale,
  };
}

export function resolveResponsiveTier(
  metrics: ECSViewportMetrics,
): ECSResponsiveTier {
  if (
    metrics.safeWidth >= 1280 ||
    (metrics.safeWidth >= 1180 && metrics.aspectRatio >= 1.35) ||
    (metrics.shortestSide >= 900 && metrics.isLandscape)
  ) {
    return 'wide_tablet';
  }

  if (
    metrics.shortestSide >= 820 ||
    metrics.safeWidth >= 980 ||
    (metrics.safeWidth >= 900 && metrics.safeHeight >= 700)
  ) {
    return 'standard_tablet';
  }

  if (
    metrics.safeWidth >= 760 ||
    metrics.shortestSide >= 700
  ) {
    return 'large_phone';
  }

  return 'compact_phone';
}
