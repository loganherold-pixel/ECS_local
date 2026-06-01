import React from 'react';
import {
  Image,
  StyleSheet,
  View,
  type ImageResizeMode,
  type ImageSourcePropType,
} from 'react-native';

interface AttitudeMonitorBackgroundLayerProps {
  backgroundSource: ImageSourcePropType | null;
  backgroundOpacity: number;
  backgroundScale?: number;
  backgroundOffsetX?: number;
  backgroundOffsetY?: number;
  overlaySource?: ImageSourcePropType | null;
  overlayOpacity?: number;
  overlayScale?: number;
  overlayOffsetY?: number;
  resizeMode?: ImageResizeMode;
  enabled?: boolean;
  overlayEnabled?: boolean;
  width?: number;
  height?: number;
  onBackgroundError?: () => void;
  onOverlayError?: () => void;
}

function AttitudeMonitorBackgroundLayer({
  backgroundSource,
  backgroundOpacity,
  backgroundScale = 1,
  backgroundOffsetX = 0,
  backgroundOffsetY = 0,
  overlaySource = null,
  overlayOpacity = 0,
  overlayScale = 1,
  overlayOffsetY = 0,
  resizeMode = 'cover',
  enabled = true,
  overlayEnabled = true,
  width = 0,
  height = 0,
  onBackgroundError,
  onOverlayError,
}: AttitudeMonitorBackgroundLayerProps) {
  const translateX = width > 0 ? width * backgroundOffsetX : 0;
  const translateY = height > 0 ? height * backgroundOffsetY : 0;
  const overlayTranslateY = height > 0 ? height * overlayOffsetY : 0;

  return (
    <>
      {enabled && backgroundSource ? (
        <Image
          source={backgroundSource}
          resizeMode={resizeMode}
          fadeDuration={0}
          onError={onBackgroundError}
          style={[
            styles.backgroundImage,
            {
              opacity: backgroundOpacity,
              transform: [{ translateX }, { translateY }, { scale: backgroundScale }],
            },
          ]}
        />
      ) : null}
      {overlayEnabled && overlaySource && overlayOpacity > 0 ? (
        <Image
          source={overlaySource}
          resizeMode="cover"
          fadeDuration={0}
          onError={onOverlayError}
          style={[
            styles.backgroundOverlay,
            {
              opacity: overlayOpacity,
              transform: [{ translateY: overlayTranslateY }, { scale: overlayScale }],
            },
          ]}
        />
      ) : null}
    </>
  );
}

export default React.memo(AttitudeMonitorBackgroundLayer);

const styles = StyleSheet.create({
  backgroundImage: {
    ...StyleSheet.absoluteFillObject,
  },
  backgroundOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
});
