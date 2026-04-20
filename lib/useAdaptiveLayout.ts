import { useMemo } from 'react';
import { useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { resolveSurfaceLayoutProfile } from './ui/adaptiveLayoutProfiles';
import { getViewportMetrics, resolveResponsiveTier } from './ui/responsiveTierResolver';
import type { ECSLayoutClass, ECSOrientation } from './ui/layoutDensityTypes';

export type { ECSLayoutClass, ECSOrientation, ECSResponsiveTier } from './ui/layoutDensityTypes';

export function getECSLayoutClass(width: number, height: number): ECSLayoutClass {
  const metrics = getViewportMetrics(width, height);
  const tier = resolveResponsiveTier(metrics);
  if (tier === 'standard_tablet' || tier === 'wide_tablet') return 'expanded';
  if (tier === 'large_phone') return 'medium';
  return 'compact';
}

export function getAdaptiveHorizontalPadding(layoutClass: ECSLayoutClass, width: number): number {
  if (layoutClass === 'expanded') return Math.min(38, Math.max(22, Math.round(width * 0.026)));
  if (layoutClass === 'medium') return 18;
  return 14;
}

export function getAdaptiveContentMaxWidth(layoutClass: ECSLayoutClass, width: number): number | undefined {
  if (layoutClass === 'expanded') return Math.min(1560, Math.max(1180, Math.round(width * 0.94)));
  if (layoutClass === 'medium') return Math.min(1180, Math.max(940, Math.round(width * 0.95)));
  return undefined;
}

export function useAdaptiveLayout() {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  return useMemo(() => {
    const metrics = getViewportMetrics(width, height, insets);
    const responsiveTier = resolveResponsiveTier(metrics);
    const profile = resolveSurfaceLayoutProfile(metrics, responsiveTier);
    const layoutClass: ECSLayoutClass =
      responsiveTier === 'standard_tablet' || responsiveTier === 'wide_tablet'
        ? 'expanded'
        : responsiveTier === 'large_phone'
          ? 'medium'
          : 'compact';
    const orientation: ECSOrientation = metrics.orientation;

    return {
      windowWidth: width,
      windowHeight: height,
      safeWidth: metrics.safeWidth,
      safeHeight: metrics.safeHeight,
      shortestSide: metrics.shortestSide,
      longestSide: metrics.longestSide,
      aspectRatio: metrics.aspectRatio,
      responsiveTier,
      layoutClass,
      orientation,
      isCompact: layoutClass === 'compact',
      isMedium: layoutClass === 'medium',
      isExpanded: layoutClass === 'expanded',
      isLandscape: orientation === 'landscape',
      isTablet: responsiveTier === 'standard_tablet' || responsiveTier === 'wide_tablet',
      isTabletWide: responsiveTier === 'wide_tablet',
      isLargePhone: responsiveTier === 'large_phone',
      isTabletScale: metrics.isTabletScale,
      horizontalPadding: profile.horizontalPadding,
      contentMaxWidth: profile.contentMaxWidth,
      panelGap: profile.panelGap,
      sectionGap: profile.sectionGap,
      headerGap: profile.headerGap,
      typeScale: profile.typeScale,
      densityScale: profile.densityScale,
      maxReadableLineLength: profile.maxReadableLineLength,
      shell: profile.shell,
      overlay: profile.overlay,
      dashboard: profile.dashboard,
      navigate: profile.navigate,
      fleet: profile.fleet,
      setup: profile.setup,
      explore: profile.explore,
      alert: profile.alert,
      denseHeight: metrics.safeHeight < 760,
      shortHeight: metrics.safeHeight < 860,
    };
  }, [height, insets, width]);
}
