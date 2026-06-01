import React from 'react';
import {
  ImageBackground,
  type ImageResizeMode,
  Platform,
  StyleSheet,
  View,
  useWindowDimensions,
  type ImageSourcePropType,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

export const ECS_BANNER_DARK_BACKGROUND = '#020304';
export const ECS_GLOBAL_BANNER_ASPECT_RATIO = 3;

type ECSGlobalBannerProps = {
  source: ImageSourcePropType;
  placement: 'top' | 'bottom';
  resizeMode?: ImageResizeMode;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
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
  if (Platform.OS === 'android') return Math.max(Math.min(bottomInset, 10), 8);
  return bottomInset > 0 ? bottomInset : 10;
}

export function ECSGlobalBanner({
  source,
  placement,
  resizeMode,
  style,
  children,
}: ECSGlobalBannerProps) {
  const resolvedResizeMode = resizeMode ?? (placement === 'top' ? 'contain' : 'cover');

  return (
    <View
      pointerEvents={children ? 'auto' : 'none'}
      style={[
        styles.plate,
        placement === 'top' ? styles.topPlate : styles.bottomPlate,
        style,
      ]}
    >
      <ImageBackground
        source={source}
        resizeMode={resolvedResizeMode}
        style={styles.imageFill}
        imageStyle={styles.image}
      />
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
    backgroundColor: ECS_BANNER_DARK_BACKGROUND,
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
  },
  image: {
    width: '100%',
    height: '100%',
  },
  overlay: {
    position: 'relative',
    zIndex: 1,
  },
});
