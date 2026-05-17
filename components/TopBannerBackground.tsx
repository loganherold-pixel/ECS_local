import React from 'react';
import { StyleSheet } from 'react-native';
import type { ImageResizeMode, ImageSourcePropType, StyleProp, ViewStyle } from 'react-native';
import {
  ECSGlobalBanner,
  useEcsTopBannerHeight,
} from './ECSGlobalBanner';

export type TopBannerVariant =
  | 'dashboard'
  | 'fleet'
  | 'navigate'
  | 'explore'
  | 'dispatch'
  | 'default';

const TOP_BANNER_BACKGROUNDS: Record<TopBannerVariant, ImageSourcePropType> = {
  dashboard: require('../assets/chrome/banners/Expedition-Command_Banner.png'),
  fleet: require('../assets/chrome/banners/Fleet_Banner.png'),
  navigate: require('../assets/chrome/banners/Navigate_Banner.png'),
  explore: require('../assets/chrome/banners/Explore_Banner.png'),
  dispatch: require('../assets/chrome/banners/Dispatch_Banner.png'),
  default: require('../assets/chrome/banners/Expedition-Command_Banner.png'),
};

export function resolveTopBannerVariant(title?: string | null): TopBannerVariant {
  const normalized = (title ?? '').trim().toLowerCase();

  if (normalized.includes('fleet')) return 'fleet';
  if (normalized.includes('navigate') || normalized.includes('navigation')) return 'navigate';
  if (normalized.includes('explore') || normalized.includes('discover')) return 'explore';
  if (normalized.includes('dispatch') || normalized.includes('alert')) return 'dispatch';
  if (normalized.includes('expedition') || normalized.includes('dashboard')) return 'dashboard';

  return 'default';
}

type TopBannerBackgroundProps = {
  variant?: TopBannerVariant;
  resizeMode?: ImageResizeMode;
  verticalOffset?: number;
  overscan?: number;
  style?: StyleProp<ViewStyle>;
};

export default function TopBannerBackground({
  variant = 'default',
  resizeMode,
  verticalOffset = 0,
  overscan = 0,
  style,
}: TopBannerBackgroundProps) {
  const source = TOP_BANNER_BACKGROUNDS[variant] ?? TOP_BANNER_BACKGROUNDS.default;
  const bannerHeight = useEcsTopBannerHeight();

  return (
    <ECSGlobalBanner
      source={source}
      placement="top"
      resizeMode={resizeMode}
      style={[
        styles.background,
        {
          top: verticalOffset,
          minHeight: bannerHeight + overscan,
        },
        style,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  background: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 0,
  },
});
