import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  LayoutChangeEvent,
  StyleSheet,
  Text,
  View,
  type ImageSourcePropType,
  type ViewStyle,
} from 'react-native';

import {
  createMotionState,
  INSTRUMENT_EASING,
  processAngle,
  resetMotionState,
} from '../../lib/attitudeMotionEngine';
import {
  getAttitudeMonitorHeroSource,
  resolveAttitudeMonitorVehicleVisual,
  type AttitudeMonitorVehicleVisualDescriptor,
} from '../../lib/attitudeMonitorVehicleVisual';
import {
  getAttitudeMonitorBackgroundPresentation,
  getAttitudeMonitorFallbackHeroSource,
} from '../../lib/attitudeMonitorAssets';
import { formatAttitudeDegrees, type AttitudeSurfaceTone } from '../../lib/attitudeMonitorModel';
import { ATTITUDE_MONITOR_TUNING } from '../../lib/attitudeMonitorTuning';
import { TACTICAL } from '../../lib/theme';
import AttitudeMonitorBackgroundLayer from './AttitudeMonitorBackgroundLayer';
import AttitudeMonitorHeroLayer from './AttitudeMonitorHeroLayer';

export type AttitudeSurfaceVariant =
  | 'widgetCompact'
  | 'widget'
  | 'detail'
  | 'vehicle'
  | 'automotive';

interface AttitudeMonitorSurfaceProps {
  rollDeg?: number | null;
  pitchDeg?: number | null;
  live?: boolean;
  tone?: AttitudeSurfaceTone;
  postureLabel: string;
  postureInstruction?: string | null;
  rollColor?: string;
  pitchColor?: string;
  topLabel?: string | null;
  variant?: AttitudeSurfaceVariant;
  heroVehicle?: AttitudeMonitorVehicleVisualDescriptor;
  style?: ViewStyle;
}

function heroVehicleEqual(
  left?: AttitudeMonitorVehicleVisualDescriptor,
  right?: AttitudeMonitorVehicleVisualDescriptor,
): boolean {
  if (left === right) {
    return true;
  }
  if (!left || !right) {
    return !left && !right;
  }

  return (
    left.familyId === right.familyId &&
    left.displayName === right.displayName &&
    left.matchedVehicleId === right.matchedVehicleId &&
    left.usesFallbackAsset === right.usesFallbackAsset &&
    left.usesFallbackFamily === right.usesFallbackFamily &&
    left.assetSource === right.assetSource &&
    left.compactAssetSource === right.compactAssetSource &&
    left.fit === right.fit
  );
}

function areAttitudeSurfacePropsEqual(
  previous: Readonly<AttitudeMonitorSurfaceProps>,
  next: Readonly<AttitudeMonitorSurfaceProps>,
): boolean {
  return (
    previous.rollDeg === next.rollDeg &&
    previous.pitchDeg === next.pitchDeg &&
    previous.live === next.live &&
    previous.tone === next.tone &&
    previous.postureLabel === next.postureLabel &&
    previous.postureInstruction === next.postureInstruction &&
    previous.rollColor === next.rollColor &&
    previous.pitchColor === next.pitchColor &&
    previous.topLabel === next.topLabel &&
    previous.variant === next.variant &&
    previous.style === next.style &&
    heroVehicleEqual(previous.heroVehicle, next.heroVehicle)
  );
}

function AttitudeMonitorSurface({
  rollDeg,
  pitchDeg,
  live = true,
  tone = 'good',
  postureLabel,
  postureInstruction,
  rollColor,
  pitchColor,
  topLabel,
  variant = 'widget',
  heroVehicle,
  style,
}: AttitudeMonitorSurfaceProps) {
  const [bounds, setBounds] = useState({ width: 0, height: 0 });
  const rollAnim = useRef(new Animated.Value(0)).current;
  const pitchAnim = useRef(new Animated.Value(0)).current;
  const rollState = useRef(createMotionState());
  const pitchState = useRef(createMotionState());

  const effectiveWidth =
    bounds.width ||
    (variant === 'automotive'
      ? 960
      : variant === 'vehicle'
        ? 720
        : variant === 'detail'
          ? 540
          : variant === 'widgetCompact'
            ? 280
            : 360);
  const effectiveHeight =
    bounds.height ||
    (variant === 'automotive'
      ? 348
      : variant === 'vehicle'
        ? 360
        : variant === 'detail'
          ? 320
          : variant === 'widgetCompact'
            ? 140
            : 210);
  const ratio = effectiveWidth / Math.max(effectiveHeight, 1);
  const automotive = variant === 'automotive';
  const compactHeight = variant === 'widgetCompact' || effectiveHeight < 152 || effectiveWidth < 250;
  const ultraCompact = effectiveHeight < 118 || effectiveWidth < 220;
  const wide = automotive || variant === 'vehicle' || ratio > 1.58;
  const large = automotive || variant === 'vehicle' || variant === 'detail' || effectiveWidth >= 520;
  const compactVariant = variant === 'widgetCompact';
  const backgroundUsage = automotive
    ? 'automotive'
    : compactVariant
      ? 'compact'
      : variant === 'detail'
        ? 'detail'
        : 'standard';
  const resolvedHeroVehicle = useMemo(
    () => heroVehicle ?? resolveAttitudeMonitorVehicleVisual(null),
    [heroVehicle],
  );
  const heroAssetSource = useMemo(
    () => getAttitudeMonitorHeroSource(resolvedHeroVehicle, { compact: compactVariant, automotive }),
    [automotive, compactVariant, resolvedHeroVehicle],
  );
  const heroFallbackSource = useMemo(
    () => getAttitudeMonitorFallbackHeroSource({ compact: compactVariant, automotive }),
    [automotive, compactVariant],
  );
  const backgroundPresentation = useMemo(
    () => getAttitudeMonitorBackgroundPresentation(backgroundUsage),
    [backgroundUsage],
  );
  const heroFit = resolvedHeroVehicle.fit;
  const [resolvedHeroSource, setResolvedHeroSource] = useState<ImageSourcePropType>(heroAssetSource);
  const [heroFailed, setHeroFailed] = useState(false);
  const [backgroundEnabled, setBackgroundEnabled] = useState(
    Boolean(backgroundPresentation.backgroundSource),
  );
  const [overlayEnabled, setOverlayEnabled] = useState(
    Boolean(backgroundPresentation.overlaySource) && backgroundPresentation.overlayEnabled,
  );

  useEffect(() => {
    setResolvedHeroSource(heroAssetSource);
    setHeroFailed(false);
  }, [heroAssetSource]);

  useEffect(() => {
    setBackgroundEnabled(Boolean(backgroundPresentation.backgroundSource));
    setOverlayEnabled(
      Boolean(backgroundPresentation.overlaySource) && backgroundPresentation.overlayEnabled,
    );
  }, [
    backgroundPresentation.backgroundSource,
    backgroundPresentation.overlayEnabled,
    backgroundPresentation.overlaySource,
  ]);

  const palette = useMemo(() => {
    if (tone === 'critical') {
      return {
        edge: 'rgba(197, 69, 55, 0.5)',
        edgeSoft: 'rgba(197, 69, 55, 0.18)',
        glow: 'rgba(197, 69, 55, 0.18)',
        lift: 'rgba(197, 69, 55, 0.12)',
        postureBg: 'rgba(56, 18, 16, 0.88)',
        postureBorder: 'rgba(197, 69, 55, 0.34)',
        postureText: '#F2C2BA',
      };
    }
    if (tone === 'attention') {
      return {
        edge: 'rgba(212, 160, 23, 0.42)',
        edgeSoft: 'rgba(212, 160, 23, 0.16)',
        glow: 'rgba(212, 160, 23, 0.14)',
        lift: 'rgba(212, 160, 23, 0.1)',
        postureBg: 'rgba(44, 31, 14, 0.88)',
        postureBorder: 'rgba(212, 160, 23, 0.28)',
        postureText: '#F0DB9B',
      };
    }
    if (tone === 'neutral') {
      return {
        edge: 'rgba(139, 148, 158, 0.22)',
        edgeSoft: 'rgba(139, 148, 158, 0.1)',
        glow: 'rgba(212, 160, 23, 0.08)',
        lift: 'rgba(139, 148, 158, 0.06)',
        postureBg: 'rgba(22, 26, 31, 0.9)',
        postureBorder: 'rgba(139, 148, 158, 0.18)',
        postureText: '#C5CED6',
      };
    }
    return {
      edge: 'rgba(212, 160, 23, 0.28)',
      edgeSoft: 'rgba(212, 160, 23, 0.12)',
      glow: 'rgba(212, 160, 23, 0.12)',
      lift: 'rgba(212, 160, 23, 0.08)',
      postureBg: 'rgba(28, 23, 14, 0.88)',
      postureBorder: 'rgba(212, 160, 23, 0.22)',
      postureText: '#F5E1A4',
    };
  }, [tone]);

  useEffect(() => {
    const easing = Easing.bezier(
      INSTRUMENT_EASING.p1x,
      INSTRUMENT_EASING.p1y,
      INSTRUMENT_EASING.p2x,
      INSTRUMENT_EASING.p2y,
    );

    if (!live) {
      resetMotionState(rollState.current);
      resetMotionState(pitchState.current);
      const settle = Animated.parallel([
        Animated.timing(rollAnim, {
          toValue: 0,
          duration: ATTITUDE_MONITOR_TUNING.motion.animation.settleDurationMs,
          easing,
          useNativeDriver: true,
        }),
        Animated.timing(pitchAnim, {
          toValue: 0,
          duration: ATTITUDE_MONITOR_TUNING.motion.animation.settleDurationMs,
          easing,
          useNativeDriver: true,
        }),
      ]);
      settle.start();
      return () => settle.stop();
    }

    const nextRoll = processAngle(rollState.current, rollDeg ?? 0);
    const nextPitch = processAngle(pitchState.current, pitchDeg ?? 0);
    const animations: Animated.CompositeAnimation[] = [];

    if (nextRoll.shouldAnimate) {
      animations.push(
        Animated.timing(rollAnim, {
          toValue: Math.max(
            -ATTITUDE_MONITOR_TUNING.motion.visible.rollOutputClampDeg,
            Math.min(ATTITUDE_MONITOR_TUNING.motion.visible.rollOutputClampDeg, nextRoll.smoothedAngle),
          ),
          duration: nextRoll.durationMs,
          easing,
          useNativeDriver: true,
        }),
      );
    }

    if (nextPitch.shouldAnimate) {
      animations.push(
        Animated.timing(pitchAnim, {
          toValue: Math.max(
            -ATTITUDE_MONITOR_TUNING.motion.visible.pitchOutputClampDeg,
            Math.min(ATTITUDE_MONITOR_TUNING.motion.visible.pitchOutputClampDeg, nextPitch.smoothedAngle),
          ),
          duration: nextPitch.durationMs,
          easing,
          useNativeDriver: true,
        }),
      );
    }

    if (animations.length === 0) return;

    const composite = Animated.parallel(animations);
    composite.start();
    return () => composite.stop();
  }, [live, pitchAnim, pitchDeg, rollAnim, rollDeg]);

  const handleLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setBounds((prev) => {
      if (Math.abs(prev.width - width) < 2 && Math.abs(prev.height - height) < 2) {
        return prev;
      }
      return { width, height };
    });
  };

  const outerPadX = automotive ? 24 : ultraCompact ? 8 : compactHeight ? 10 : large ? 20 : 14;
  const outerPadY = automotive ? 18 : ultraCompact ? 8 : compactHeight ? 10 : large ? 18 : 14;
  const topLabelTop = automotive ? 12 : ultraCompact ? 6 : compactHeight ? 8 : 10;
  const metricWidth = Math.max(
    automotive ? 116 : ultraCompact ? 54 : compactHeight ? 62 : 72,
    Math.min(
      automotive ? 172 : wide ? 136 : 108,
      effectiveWidth * (automotive ? 0.165 : wide ? 0.16 : 0.18),
    ),
  );
  const postureBlockHeight = ultraCompact
    ? 34
    : compactHeight
      ? 44
      : automotive
        ? postureInstruction
          ? 66
          : 52
      : postureInstruction
        ? 60
        : 48;
  const centerGap = automotive ? 22 : ultraCompact ? 10 : compactHeight ? 12 : 16;
  const heroAvailableWidth = Math.max(
    92,
    effectiveWidth - outerPadX * 2 - metricWidth * 2 - centerGap * 2,
  );
  const heroAvailableHeight = Math.max(
    88,
    effectiveHeight - outerPadY * 2 - postureBlockHeight - (compactHeight ? 12 : 18),
  );
  const safeHeroWidth = Math.max(
    88,
    heroAvailableWidth * Math.max(0.68, 1 - heroFit.cropSafeInsets.left - heroFit.cropSafeInsets.right),
  );
  const safeHeroHeight = Math.max(
    74,
    heroAvailableHeight * Math.max(0.62, 1 - heroFit.cropSafeInsets.top - heroFit.cropSafeInsets.bottom),
  );
  const heroWidthTarget = safeHeroWidth * (compactVariant ? heroFit.compactWidthCoverage : heroFit.widthCoverage);
  const heroHeightTarget = safeHeroHeight * heroFit.heightCoverage;
  const heroWidthCap = automotive ? 408 : wide ? 320 : large ? 280 : 220;
  const heroHeightCap = automotive ? 242 : wide ? 218 : large ? 198 : 160;
  const heroFrameWidth = Math.min(heroWidthTarget, heroHeightTarget * heroFit.aspectRatio, heroWidthCap);
  const heroFrameHeight = Math.min(heroFrameWidth / heroFit.aspectRatio, heroHeightTarget, heroHeightCap);
  const heroAnchorBiasX = (heroFit.anchorPoint.x - 0.5) * safeHeroWidth * 0.12;
  const heroAnchorBiasY = (heroFit.anchorPoint.y - 0.5) * safeHeroHeight * 0.16;
  const heroPivotBiasX = (heroFit.motionPivot.x - 0.5) * heroFrameWidth * 0.08;
  const heroPivotBiasY = (heroFit.motionPivot.y - 0.5) * heroFrameHeight * 0.08;
  const automotiveHeroBiasX = automotive ? Math.min(28, effectiveWidth * 0.028) : 0;
  const heroSceneBaseY = automotive ? 8 : compactVariant ? 1 : wide ? 5 : 3;
  const heroOffsetX =
    heroFit.neutralOffset.x * safeHeroWidth + heroAnchorBiasX + heroPivotBiasX + automotiveHeroBiasX;
  const heroOffsetY =
    heroFit.neutralOffset.y * safeHeroHeight + heroAnchorBiasY + heroPivotBiasY + heroSceneBaseY;
  const assetInsetTop = heroFrameHeight * heroFit.cropSafeInsets.top;
  const assetInsetRight = heroFrameWidth * heroFit.cropSafeInsets.right;
  const assetInsetBottom = heroFrameHeight * heroFit.cropSafeInsets.bottom;
  const assetInsetLeft = heroFrameWidth * heroFit.cropSafeInsets.left;
  const pitchTravel = Math.max(
    automotive
      ? ATTITUDE_MONITOR_TUNING.motion.visible.pitchTravel.minPx.automotive
      : ATTITUDE_MONITOR_TUNING.motion.visible.pitchTravel.minPx.standard,
    Math.min(
      automotive
        ? ATTITUDE_MONITOR_TUNING.motion.visible.pitchTravel.maxPx.automotive
        : ATTITUDE_MONITOR_TUNING.motion.visible.pitchTravel.maxPx.standard,
      heroAvailableHeight *
        (automotive
          ? ATTITUDE_MONITOR_TUNING.motion.visible.pitchTravel.ratio.automotive
          : wide
            ? ATTITUDE_MONITOR_TUNING.motion.visible.pitchTravel.ratio.wide
            : ATTITUDE_MONITOR_TUNING.motion.visible.pitchTravel.ratio.standard),
    ),
  );
  const rollVisualRange = automotive
    ? ATTITUDE_MONITOR_TUNING.motion.visible.rollRotationClampDeg.automotive
    : ATTITUDE_MONITOR_TUNING.motion.visible.rollRotationClampDeg.standard;
  const rollVisual = rollAnim.interpolate({
    inputRange: [
      -ATTITUDE_MONITOR_TUNING.motion.visible.rollOutputClampDeg,
      0,
      ATTITUDE_MONITOR_TUNING.motion.visible.rollOutputClampDeg,
    ],
    outputRange: [`-${rollVisualRange}deg`, '0deg', `${rollVisualRange}deg`],
  });
  const pitchVisual = pitchAnim.interpolate({
    inputRange: [
      -ATTITUDE_MONITOR_TUNING.motion.visible.pitchOutputClampDeg,
      0,
      ATTITUDE_MONITOR_TUNING.motion.visible.pitchOutputClampDeg,
    ],
    outputRange: [pitchTravel, 0, -pitchTravel],
  });
  const shadowOffset = pitchAnim.interpolate({
    inputRange: [
      -ATTITUDE_MONITOR_TUNING.motion.visible.pitchOutputClampDeg,
      0,
      ATTITUDE_MONITOR_TUNING.motion.visible.pitchOutputClampDeg,
    ],
    outputRange: [-4, 0, 5],
  });
  const shadowWidth = heroFrameWidth * heroFit.shadowWidthRatio;
  const shadowBottom =
    Math.max(18, heroAvailableHeight * heroFit.shadowBottomRatio) - (automotive ? 2 : 1);
  const shadowHeight = automotive ? 24 : large ? 22 : 19;
  const contactGlowWidth = shadowWidth * (automotive ? 1.34 : 1.24);
  const contactGlowBottom = shadowBottom - (automotive ? 6 : 5);
  const contactGlowOpacity = automotive ? 0.13 : compactVariant ? 0.08 : large ? 0.11 : 0.1;
  const metricValueSize = automotive ? 37 : ultraCompact ? 17 : compactHeight ? 20 : large ? 31 : 25;
  const metricLabelSize = automotive ? 11 : ultraCompact ? 8 : compactHeight ? 9 : large ? 11 : 9;
  const postureValueSize = automotive ? 22 : ultraCompact ? 12 : compactHeight ? 14 : large ? 18 : 16;
  const postureHintSize = compactHeight ? 0 : automotive ? 12 : large ? 11 : 10;
  const topLabelSize = automotive ? 10 : ultraCompact ? 8 : compactHeight ? 9 : 10;
  const metricValueLineHeight = Math.max(metricValueSize + 2, Math.round(metricValueSize * 1.06));
  const showDecor = !ultraCompact;
  const showAutomotiveDecor = automotive && showDecor;
  const showStandardDecor = showDecor && !automotive && !compactVariant;
  const showInstruction = !compactHeight && !!postureInstruction;
  const leftValue = live ? formatAttitudeDegrees(rollDeg) : formatAttitudeDegrees(null);
  const rightValue = live ? formatAttitudeDegrees(pitchDeg) : formatAttitudeDegrees(null);
  const postureBottom = automotive ? 12 : ultraCompact ? 6 : compactHeight ? 8 : 10;

  return (
    <View
      style={[
        styles.surface,
        {
          borderColor: palette.edgeSoft,
          shadowColor: tone === 'critical' ? TACTICAL.danger : TACTICAL.amber,
        },
        style,
      ]}
      onLayout={handleLayout}
    >
      <View style={[styles.backgroundBase, { borderColor: palette.edgeSoft }]} />
      <AttitudeMonitorBackgroundLayer
        backgroundSource={backgroundPresentation.backgroundSource}
        backgroundOpacity={backgroundPresentation.backgroundOpacity}
        backgroundScale={backgroundPresentation.backgroundScale}
        backgroundOffsetX={backgroundPresentation.backgroundOffsetX}
        backgroundOffsetY={backgroundPresentation.backgroundOffsetY}
        overlaySource={backgroundPresentation.overlaySource}
        overlayOpacity={backgroundPresentation.overlayOpacity}
        overlayScale={backgroundPresentation.overlayScale}
        overlayOffsetY={backgroundPresentation.overlayOffsetY}
        resizeMode={backgroundPresentation.resizeMode}
        enabled={backgroundEnabled}
        overlayEnabled={overlayEnabled}
        width={effectiveWidth}
        height={effectiveHeight}
        onBackgroundError={() => setBackgroundEnabled(false)}
        onOverlayError={() => setOverlayEnabled(false)}
      />
      <View style={[styles.backgroundLift, { backgroundColor: palette.lift }]} />
      {showDecor ? (
        <>
          <View
            style={[
              styles.canyonGlow,
              automotive ? styles.automotiveGlow : null,
              { backgroundColor: palette.glow },
            ]}
          />
          <View style={[styles.canyonSkyBand, automotive ? styles.automotiveSkyBand : null]} />
          {showStandardDecor ? <View style={styles.canyonShelfFar} /> : null}
          {showStandardDecor ? <View style={styles.canyonShelfNear} /> : null}
          <View style={[styles.canyonFloor, automotive ? styles.automotiveFloor : null]} />
          {showStandardDecor ? (
            <View style={[styles.scanLine, { borderColor: palette.edgeSoft }]} />
          ) : null}
          {showAutomotiveDecor ? (
            <View style={[styles.automotiveHorizonLine, { borderColor: palette.edgeSoft }]} />
          ) : null}
          <View style={[styles.frameInset, { borderColor: palette.edgeSoft }]} />
        </>
      ) : null}

      {topLabel ? (
        <View style={[styles.topLabel, { top: topLabelTop, borderColor: palette.edgeSoft }]}>
          <Text style={[styles.topLabelText, { fontSize: topLabelSize }]} numberOfLines={1}>
            {topLabel}
          </Text>
        </View>
      ) : null}

      <View
        style={[
          styles.contentRow,
          automotive ? styles.automotiveContentRow : null,
          { paddingHorizontal: outerPadX, paddingVertical: outerPadY },
        ]}
      >
        <View style={[styles.metricColumn, { width: metricWidth, alignItems: 'flex-start' }]}>
          <Text style={[styles.metricLabel, { fontSize: metricLabelSize }]}>ROLL</Text>
          <Text
            style={[
              styles.metricValue,
              {
                fontSize: metricValueSize,
                lineHeight: metricValueLineHeight,
                color: rollColor ?? (tone === 'critical' ? TACTICAL.danger : TACTICAL.text),
              },
            ]}
            numberOfLines={1}
          >
            {leftValue}
          </Text>
          {!compactHeight ? (
            <Text style={styles.metricCaption} numberOfLines={1}>
              Side slope
            </Text>
          ) : null}
        </View>

        <View
          style={[
            styles.heroZone,
            automotive ? styles.automotiveHeroZone : null,
            { marginHorizontal: centerGap, paddingBottom: postureBlockHeight + 10 },
          ]}
        >
          <View style={styles.heroLane}>
            <AttitudeMonitorHeroLayer
              heroSource={resolvedHeroSource}
              onHeroError={() => {
                if (!heroFailed) {
                  setResolvedHeroSource(heroFallbackSource);
                  setHeroFailed(true);
                }
              }}
              frameWidth={heroFrameWidth}
              frameHeight={heroFrameHeight}
              insetTop={assetInsetTop}
              insetRight={assetInsetRight}
              insetBottom={assetInsetBottom}
              insetLeft={assetInsetLeft}
              shadowWidth={shadowWidth}
              shadowBottom={shadowBottom}
              shadowOpacity={heroFit.shadowOpacity}
              shadowHeight={shadowHeight}
              contactGlowWidth={contactGlowWidth}
              contactGlowBottom={contactGlowBottom}
              contactGlowOpacity={contactGlowOpacity}
              shadowOffset={shadowOffset}
              pitchVisual={pitchVisual}
              rollVisual={rollVisual}
              offsetX={heroOffsetX}
              offsetY={heroOffsetY}
              scaleBias={heroFit.scaleBias}
            />
          </View>

          <View
            style={[
              styles.postureBlock,
              {
                bottom: postureBottom,
                backgroundColor: palette.postureBg,
                borderColor: palette.postureBorder,
                paddingHorizontal: automotive ? 16 : ultraCompact ? 10 : compactHeight ? 12 : 14,
                paddingVertical: automotive ? 10 : ultraCompact ? 6 : compactHeight ? 7 : 9,
              },
            ]}
          >
            <Text style={styles.postureLabel}>POSTURE</Text>
            <Text
              style={[
                styles.postureValue,
                {
                  fontSize: postureValueSize,
                  color: palette.postureText,
                },
              ]}
              numberOfLines={1}
            >
              {postureLabel}
            </Text>
            {showInstruction ? (
              <Text style={[styles.postureInstruction, { fontSize: postureHintSize }]} numberOfLines={1}>
                {postureInstruction}
              </Text>
            ) : null}
          </View>
        </View>

        <View style={[styles.metricColumn, { width: metricWidth, alignItems: 'flex-end' }]}>
          <Text style={[styles.metricLabel, { fontSize: metricLabelSize }]}>PITCH</Text>
          <Text
            style={[
              styles.metricValue,
              {
                fontSize: metricValueSize,
                lineHeight: metricValueLineHeight,
                color: pitchColor ?? (tone === 'critical' ? TACTICAL.danger : TACTICAL.text),
              },
            ]}
            numberOfLines={1}
          >
            {rightValue}
          </Text>
          {!compactHeight ? (
            <Text style={styles.metricCaption} numberOfLines={1}>
              Fore / aft
            </Text>
          ) : null}
        </View>
      </View>
    </View>
  );
}

export default React.memo(AttitudeMonitorSurface, areAttitudeSurfacePropsEqual);

const styles = StyleSheet.create({
  surface: {
    flex: 1,
    minHeight: 0,
    overflow: 'hidden',
    borderRadius: 20,
    borderWidth: 1,
    backgroundColor: '#0A0D10',
    shadowOpacity: 0.18,
    shadowOffset: { width: 0, height: 14 },
    shadowRadius: 28,
    elevation: 10,
  },
  backgroundBase: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#0A0D10',
  },
  backgroundLift: {
    ...StyleSheet.absoluteFillObject,
  },
  canyonGlow: {
    position: 'absolute',
    alignSelf: 'center',
    top: '16%',
    width: '64%',
    height: '44%',
    borderRadius: 999,
  },
  canyonSkyBand: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: '48%',
    backgroundColor: 'rgba(9,12,15,0.92)',
  },
  canyonShelfFar: {
    position: 'absolute',
    left: '-12%',
    right: '16%',
    bottom: '26%',
    height: '24%',
    borderRadius: 999,
    backgroundColor: 'rgba(73, 49, 29, 0.26)',
    transform: [{ rotate: '-5deg' }],
  },
  canyonShelfNear: {
    position: 'absolute',
    left: '18%',
    right: '-10%',
    bottom: '18%',
    height: '22%',
    borderRadius: 999,
    backgroundColor: 'rgba(112, 73, 38, 0.16)',
    transform: [{ rotate: '4deg' }],
  },
  canyonFloor: {
    position: 'absolute',
    left: '-15%',
    right: '-15%',
    bottom: '-6%',
    height: '28%',
    borderRadius: 999,
    backgroundColor: 'rgba(46, 30, 18, 0.86)',
  },
  scanLine: {
    position: 'absolute',
    left: '14%',
    right: '14%',
    bottom: '23%',
    borderTopWidth: 1,
  },
  frameInset: {
    position: 'absolute',
    top: 8,
    left: 8,
    right: 8,
    bottom: 8,
    borderRadius: 16,
    borderWidth: 1,
  },
  topLabel: {
    position: 'absolute',
    alignSelf: 'center',
    zIndex: 3,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 6,
    backgroundColor: 'rgba(9, 11, 14, 0.84)',
  },
  topLabelText: {
    color: 'rgba(230, 237, 243, 0.82)',
    fontWeight: '800',
    letterSpacing: 1.1,
  },
  contentRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  automotiveContentRow: {
    alignItems: 'center',
  },
  metricColumn: {
    justifyContent: 'center',
    gap: 3,
    zIndex: 2,
  },
  metricLabel: {
    color: 'rgba(230, 237, 243, 0.78)',
    fontWeight: '800',
    letterSpacing: 1.1,
  },
  metricValue: {
    fontWeight: '900',
    letterSpacing: -0.8,
    textShadowColor: 'rgba(0,0,0,0.46)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 8,
  },
  metricCaption: {
    fontSize: 10,
    lineHeight: 12,
    color: 'rgba(230, 237, 243, 0.76)',
    fontWeight: '600',
  },
  heroZone: {
    flex: 1,
    minWidth: 0,
    minHeight: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  automotiveHeroZone: {
    paddingLeft: 10,
  },
  heroLane: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 0,
  },
  automotiveGlow: {
    top: '19%',
    width: '56%',
    height: '38%',
  },
  automotiveSkyBand: {
    height: '42%',
    backgroundColor: 'rgba(8, 11, 14, 0.95)',
  },
  automotiveFloor: {
    left: '-10%',
    right: '-10%',
    bottom: '-8%',
    height: '24%',
    backgroundColor: 'rgba(39, 28, 18, 0.92)',
  },
  automotiveHorizonLine: {
    position: 'absolute',
    left: '10%',
    right: '10%',
    bottom: '24%',
    borderTopWidth: 1,
  },
  postureBlock: {
    position: 'absolute',
    alignSelf: 'center',
    maxWidth: '82%',
    minWidth: '56%',
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    gap: 2,
  },
  postureLabel: {
    color: 'rgba(230, 237, 243, 0.78)',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1.1,
  },
  postureValue: {
    fontWeight: '800',
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.34)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
  postureInstruction: {
    color: 'rgba(230, 237, 243, 0.8)',
    lineHeight: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
});
