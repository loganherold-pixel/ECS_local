import React from 'react';
import {
  type ImageResizeMode,
  Platform,
  StyleSheet,
  View,
  useWindowDimensions,
  type ImageSourcePropType,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { Image } from 'expo-image';
import { useTheme } from '../context/ThemeContext';
import { resolveEcsPopupSurfaceTheme } from '../lib/theme';

export const ECS_BANNER_DARK_BACKGROUND = '#020304';
export const ECS_BANNER_LIGHT_BACKGROUND = '#F7F1E8';
export const ECS_GLOBAL_BANNER_ASPECT_RATIO = 3;
const ECS_ANDROID_BOTTOM_SAFE_PADDING_MAX = 96;

type ECSGlobalBannerProps = {
  source: ImageSourcePropType;
  placement: 'top' | 'bottom';
  resizeMode?: ImageResizeMode;
  deferImage?: boolean;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function resolveEcsBannerContentFit(
  resizeMode: ImageResizeMode | undefined,
  placement: ECSGlobalBannerProps['placement'],
): 'cover' | 'contain' | 'fill' | 'none' {
  const mode = resizeMode ?? (placement === 'top' ? 'contain' : 'cover');
  if (mode === 'stretch') return 'fill';
  if (mode === 'center') return 'none';
  if (mode === 'contain') return 'contain';
  return 'cover';
}

export function resolveEcsTopBannerHeight(width: number, height: number): number {
  const shortestSide = Math.min(width, height);
  const isTablet = shortestSide >= 768;
  const isLandscape = width > height;
  const proportionalHeight = width / ECS_GLOBAL_BANNER_ASPECT_RATIO;
  const minHeight = isTablet ? 116 : isLandscape ? 96 : 106;
  const maxHeight = isTablet ? (isLandscape ? 148 : 158) : isLandscape ? 112 : 136;

  return Math.round(clamp(proportionalHeight, minHeight, maxHeight));
}

export function resolveEcsBottomBannerHeight(width: number, height: number): number {
  const shortestSide = Math.min(width, height);
  const isTablet = shortestSide >= 768;
  const isLandscape = width > height;

  if (isTablet) return isLandscape ? 104 : 116;
  return isLandscape ? 92 : 104;
}

export function getEcsBottomSafePadding(bottomInset: number): number {
  if (Platform.OS === 'web') return 10;
  if (Platform.OS === 'android') {
    const normalizedInset = Number.isFinite(bottomInset) ? Math.max(0, bottomInset) : 0;
    return Math.max(Math.min(normalizedInset, ECS_ANDROID_BOTTOM_SAFE_PADDING_MAX), 8);
  }
  return bottomInset > 0 ? bottomInset : 10;
}

export function ECSGlobalBanner({
  source,
  placement,
  resizeMode,
  deferImage = false,
  style,
  children,
}: ECSGlobalBannerProps) {
  const { effectiveTheme } = useTheme();
  const contentFit = resolveEcsBannerContentFit(resizeMode, placement);
  const surfaceTheme = resolveEcsPopupSurfaceTheme(effectiveTheme);
  const bannerBackground =
    effectiveTheme === 'light'
      ? ECS_BANNER_LIGHT_BACKGROUND
      : placement === 'top'
        ? surfaceTheme.headerBg
        : surfaceTheme.shellBg;

  return (
    <View
      pointerEvents={children ? 'auto' : 'none'}
      style={[
        styles.plate,
        placement === 'top' ? styles.topPlate : styles.bottomPlate,
        { backgroundColor: bannerBackground },
        style,
      ]}
    >
      {deferImage ? null : (
        <Image
          source={source}
          contentFit={contentFit}
          cachePolicy="memory-disk"
          priority={placement === 'top' ? 'high' : 'normal'}
          transition={0}
          recyclingKey={`ecs-global-banner-${placement}-${String(source)}`}
          style={styles.imageFill}
        />
      )}
      {children ? <View style={styles.overlay}>{children}</View> : null}
    </View>
  );
}

export function useEcsTopBannerHeight() {
  const { width, height } = useWindowDimensions();
  return resolveEcsTopBannerHeight(width, height);
}

export function useEcsBottomBannerHeight() {
  const { width, height } = useWindowDimensions();
  return resolveEcsBottomBannerHeight(width, height);
}

const styles = StyleSheet.create({
  plate: {
    overflow: 'hidden',
  },
  topPlate: {
    justifyContent: 'center',
  },
  bottomPlate: {
    justifyContent: 'flex-end',
  },
  imageFill: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
  overlay: {
    position: 'relative',
    zIndex: 1,
  },
});
