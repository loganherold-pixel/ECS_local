import React from 'react';
import {
  Animated,
  Image,
  StyleSheet,
  View,
  type ImageSourcePropType,
} from 'react-native';

interface AttitudeMonitorHeroLayerProps {
  heroSource: ImageSourcePropType;
  onHeroError?: () => void;
  frameWidth: number;
  frameHeight: number;
  insetTop: number;
  insetRight: number;
  insetBottom: number;
  insetLeft: number;
  shadowWidth: number;
  shadowBottom: number;
  shadowOpacity: number;
  shadowHeight?: number;
  contactGlowWidth: number;
  contactGlowBottom: number;
  contactGlowOpacity: number;
  contactGlowHeight?: number;
  shadowOffset: Animated.AnimatedInterpolation<number | string>;
  pitchVisual: Animated.AnimatedInterpolation<number | string>;
  rollVisual: Animated.AnimatedInterpolation<number | string>;
  offsetX: number;
  offsetY: number;
  scaleBias: number;
}

function AttitudeMonitorHeroLayer({
  heroSource,
  onHeroError,
  frameWidth,
  frameHeight,
  insetTop,
  insetRight,
  insetBottom,
  insetLeft,
  shadowWidth,
  shadowBottom,
  shadowOpacity,
  shadowHeight = 20,
  contactGlowWidth,
  contactGlowBottom,
  contactGlowOpacity,
  contactGlowHeight = 34,
  shadowOffset,
  pitchVisual,
  rollVisual,
  offsetX,
  offsetY,
  scaleBias,
}: AttitudeMonitorHeroLayerProps) {
  return (
    <>
      <View
        style={[
          styles.contactGlow,
          {
            width: contactGlowWidth,
            height: contactGlowHeight,
            bottom: contactGlowBottom,
            opacity: contactGlowOpacity,
          },
        ]}
      />
      <Animated.View
        style={[
          styles.truckShadow,
          {
            width: shadowWidth,
            height: shadowHeight,
            bottom: shadowBottom,
            opacity: shadowOpacity,
            transform: [{ translateY: shadowOffset }],
          },
        ]}
      />
      <Animated.View
        style={[
          styles.truckRig,
          {
            width: frameWidth,
            height: frameHeight,
            transform: [
              { translateX: offsetX },
              { translateY: pitchVisual },
              { translateY: offsetY },
              { rotate: rollVisual },
              { scale: scaleBias },
            ],
          },
        ]}
      >
        <View
          style={[
            styles.truckAssetFrame,
            {
              paddingTop: insetTop,
              paddingRight: insetRight,
              paddingBottom: insetBottom,
              paddingLeft: insetLeft,
            },
          ]}
        >
          <Image
            source={heroSource}
            resizeMode="contain"
            fadeDuration={0}
            onError={onHeroError}
            style={styles.truckImage}
          />
        </View>
      </Animated.View>
    </>
  );
}

export default React.memo(AttitudeMonitorHeroLayer);

const styles = StyleSheet.create({
  truckShadow: {
    position: 'absolute',
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.42)',
  },
  contactGlow: {
    position: 'absolute',
    borderRadius: 999,
    backgroundColor: 'rgba(212,160,23,0.08)',
  },
  truckRig: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  truckAssetFrame: {
    width: '100%',
    height: '100%',
  },
  truckImage: {
    width: '100%',
    height: '100%',
  },
});
