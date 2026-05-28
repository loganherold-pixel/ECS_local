import { useMemo } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useEcsTopBannerHeight } from '../ECSGlobalBanner';
import { getEcsTopBannerLayoutMetrics, getShellBottomClearance } from '../../lib/shellLayout';
import { useAdaptiveLayout } from '../../lib/useAdaptiveLayout';

export const EXPEDITION_FULL_BODY_POPUP_PROPS = {
  maxWidth: 4096,
  maxHeightFraction: 1,
  minHeightFraction: 1,
  showHandle: false,
} as const;

export function useExpeditionFullBodyPopupProps() {
  const insets = useSafeAreaInsets();
  const adaptive = useAdaptiveLayout();
  const topBannerHeight = useEcsTopBannerHeight();
  const topClearance = getEcsTopBannerLayoutMetrics(insets.top, topBannerHeight, {
    isTablet: adaptive.isTablet,
    shortHeight: adaptive.shortHeight,
  }).visibleHeight;
  const bottomClearance = getShellBottomClearance(insets.bottom, 2);

  return useMemo(
    () => ({
      ...EXPEDITION_FULL_BODY_POPUP_PROPS,
      topClearanceOverride: topClearance,
      bottomClearanceOverride: bottomClearance,
    }),
    [bottomClearance, topClearance],
  );
}
