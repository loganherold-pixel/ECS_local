import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from 'react-native';

import { hapticMicro } from '../../../../lib/haptics';
import { TACTICAL } from '../../../../lib/theme';
import AttitudeGauge from '../../../components/attitudeCommand/AttitudeGauge';
import AttitudeReadout from '../../../components/attitudeCommand/AttitudeReadout';
import { formatSignedDegrees } from '../../../components/attitudeCommand/attitudeReadoutUtils';
import {
  getVehicleAttitudeAsset,
  type VehicleAttitudeAsset,
} from '../vehicleAttitudeAssets';
import {
  DEFAULT_MAX_PITCH_DEG,
  DEFAULT_MAX_ROLL_DEG,
  safeDeg,
} from '../vehicleAttitudeTuning';
import {
  mapAttitudeInputForTelemetryFrame,
  useEcsScreenOrientation,
  type AttitudeTelemetryFrame,
  type EcsScreenOrientation,
} from '../attitudeOrientation';
import AttitudeLiveHashOverlay from './AttitudeLiveHashOverlay';

export type VehicleAttitudeStageProps = {
  vehicleId: string;

  pitchDeg: number;
  rollDeg: number;

  mode?: 'monitor' | 'command';

  maxPitchDeg?: number;
  maxRollDeg?: number;

  fitMode?: 'contain' | 'cover';

  showReadouts?: boolean;
  showZeroButton?: boolean;
  showLiveHashIndicators?: boolean;

  onZero?: () => void;

  className?: string;

  children?: React.ReactNode;

  onResetZero?: () => void;
  zeroActive?: boolean;
  telemetryFrame?: AttitudeTelemetryFrame;
  screenOrientation?: EcsScreenOrientation;
};

type AttitudeAxis = 'pitch' | 'roll';
type StageSize = { width: number; height: number };

const READOUT_TEXT_COLOR = TACTICAL.text;
const COMMAND_LEVEL_READOUT_Y = 948;
const DEFAULT_LEVEL_READOUT_Y = 900;

const ATTITUDE_GAUGE_LAYOUT = {
  pitch: {
    centerX: 438.25,
    topY: 214,
  },
  roll: {
    centerX: 1314.75,
    topY: 214,
  },
  gaugeWidth: 650,
  gaugeHeight: 208,
} as const;

function formatStageDegrees(value: number): string {
  return formatSignedDegrees(safeDeg(value));
}

function getAxisColor(value: number, axis: AttitudeAxis): string {
  void value;
  void axis;
  return READOUT_TEXT_COLOR;
}

function getAxisStatusLabel(axis: AttitudeAxis, value: number): string {
  const safeValue = safeDeg(value);
  if (Math.abs(safeValue) < 1.2) {
    return 'LEVEL';
  }
  if (axis === 'pitch') {
    return safeValue > 0 ? 'UPHILL' : 'DOWNHILL';
  }
  return safeValue > 0 ? 'RIGHT LEAN' : 'LEFT LEAN';
}

function toStageScalar(
  asset: VehicleAttitudeAsset,
  stage: StageSize,
  axis: 'x' | 'y',
  value: number,
) {
  return axis === 'x'
    ? (value / asset.viewBox.width) * stage.width
    : (value / asset.viewBox.height) * stage.height;
}

function toStagePoint(
  asset: VehicleAttitudeAsset,
  stage: StageSize,
  point: { x: number; y: number },
) {
  return {
    x: (point.x / asset.viewBox.width) * stage.width,
    y: (point.y / asset.viewBox.height) * stage.height,
  };
}

function fitStageToContainer(
  asset: VehicleAttitudeAsset,
  bounds: StageSize,
  fitMode: 'contain' | 'cover' = 'contain',
): StageSize {
  const fallbackWidth = 420;
  const fallbackHeight = fallbackWidth / asset.aspectRatio;
  const containerWidth = bounds.width > 0 ? bounds.width : fallbackWidth;
  const containerHeight = bounds.height > 0 ? bounds.height : fallbackHeight;
  const imageAspect = asset.aspectRatio;
  const containerAspect = containerWidth / containerHeight;

  if (fitMode === 'cover') {
    if (containerAspect > imageAspect) {
      const fittedWidth = containerWidth;
      return {
        width: fittedWidth,
        height: fittedWidth / imageAspect,
      };
    }

    const fittedHeight = containerHeight;
    return {
      width: fittedHeight * imageAspect,
      height: fittedHeight,
    };
  }

  if (containerAspect > imageAspect) {
    const fittedHeight = containerHeight;
    return {
      width: fittedHeight * imageAspect,
      height: fittedHeight,
    };
  }

  const fittedWidth = containerWidth;
  return {
    width: fittedWidth,
    height: fittedWidth / imageAspect,
  };
}

function VehicleAttitudeStage({
  vehicleId,
  pitchDeg,
  rollDeg,
  mode = 'monitor',
  maxPitchDeg = DEFAULT_MAX_PITCH_DEG,
  maxRollDeg = DEFAULT_MAX_ROLL_DEG,
  fitMode = 'contain',
  showReadouts = true,
  showZeroButton = true,
  showLiveHashIndicators = true,
  onZero,
  className,
  children,
  onResetZero,
  zeroActive = false,
  telemetryFrame = 'vehicle',
  screenOrientation,
}: VehicleAttitudeStageProps) {
  const asset = getVehicleAttitudeAsset(vehicleId);
  const detectedScreenOrientation = useEcsScreenOrientation();
  const effectiveScreenOrientation = screenOrientation ?? detectedScreenOrientation;
  const [bounds, setBounds] = useState({ width: 0, height: 0 });
  const [confirmationLabel, setConfirmationLabel] = useState<string | null>(null);
  const confirmOpacity = useRef(new Animated.Value(0)).current;
  const buttonDrop = useRef(new Animated.Value(0)).current;
  const longPressHandledRef = useRef(false);
  const { width: boundsWidth, height: boundsHeight } = bounds;

  void className;

  useEffect(() => {
    if (!confirmationLabel) {
      return undefined;
    }

    confirmOpacity.setValue(0);
    buttonDrop.setValue(0);
    const pulse = Animated.parallel([
      Animated.sequence([
        Animated.timing(confirmOpacity, {
          toValue: 1,
          duration: 120,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.delay(850),
        Animated.timing(confirmOpacity, {
          toValue: 0,
          duration: 240,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
      Animated.sequence([
        Animated.timing(buttonDrop, {
          toValue: 4,
          duration: 120,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(buttonDrop, {
          toValue: 0,
          duration: 220,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    ]);

    pulse.start(({ finished }) => {
      if (finished) {
        setConfirmationLabel(null);
      }
    });
    return () => pulse.stop();
  }, [buttonDrop, confirmOpacity, confirmationLabel]);

  const vehicleAttitude = useMemo(
    () => mapAttitudeInputForTelemetryFrame(
      { pitchDeg, rollDeg },
      effectiveScreenOrientation,
      telemetryFrame,
    ),
    [effectiveScreenOrientation, pitchDeg, rollDeg, telemetryFrame],
  );
  const safePitch = safeDeg(vehicleAttitude.pitchDeg);
  const safeRoll = safeDeg(vehicleAttitude.rollDeg);
  const pitchLabel = formatStageDegrees(safePitch);
  const rollLabel = formatStageDegrees(safeRoll);
  const pitchStatusLabel = getAxisStatusLabel('pitch', safePitch);
  const rollStatusLabel = getAxisStatusLabel('roll', safeRoll);
  const stageLevelLabel =
    pitchStatusLabel === 'LEVEL' && rollStatusLabel === 'LEVEL'
      ? 'LEVEL'
      : `${pitchStatusLabel} / ${rollStatusLabel}`;
  const accessibilityLabel = `Vehicle attitude. Pitch ${pitchLabel}. Roll ${rollLabel}.`;

  const metrics = useMemo(() => {
    if (!asset) {
      return null;
    }

    const fittedStage = fitStageToContainer(asset, { width: boundsWidth, height: boundsHeight }, fitMode);
    const width = fittedStage.width;
    const height = fittedStage.height;
    const compact = mode === 'monitor'
      ? width < 360 || height < 178
      : width < 520 || height < 220;
    const readoutWidth = Math.max(76, Math.min(compact ? 122 : 162, width * (compact ? 0.2 : 0.16)));
    const readoutHeight = Math.max(34, Math.min(compact ? 46 : 58, height * 0.09));
    const readoutFont = mode === 'command'
      ? Math.max(
        compact ? 13 : 15,
        Math.min(compact ? 18 : 22, readoutWidth * 0.17, readoutHeight * 0.46),
      )
      : Math.max(
        compact ? 17 : 20,
        Math.min(compact ? 26 : 32, readoutWidth * 0.21, readoutHeight * 0.62),
      );
    const commandZeroSize = Math.max(50, Math.min(compact ? 58 : 74, width * 0.095, height * 0.14));
    const zeroButtonWidth = mode === 'command'
      ? commandZeroSize
      : Math.max(54, Math.min(compact ? 70 : 82, width * 0.1));
    const zeroButtonHeight = mode === 'command'
      ? commandZeroSize
      : Math.max(23, Math.min(compact ? 29 : 34, height * 0.045));

    return {
      compact,
      height,
      readoutFont,
      readoutHeight,
      readoutWidth,
      width,
      zeroButtonHeight,
      zeroButtonWidth,
    };
  }, [asset, boundsHeight, boundsWidth, fitMode, mode]);

  const handleLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setBounds((prev) => {
      if (Math.abs(prev.width - width) < 2 && Math.abs(prev.height - height) < 2) {
        return prev;
      }
      return { width, height };
    });
  };

  const handleZero = () => {
    if (longPressHandledRef.current) {
      longPressHandledRef.current = false;
      return;
    }
    if (!onZero) {
      return;
    }
    void hapticMicro();
    onZero();
    setConfirmationLabel('Zeroed');
  };

  const handleResetZero = () => {
    if (!onResetZero) {
      return;
    }
    longPressHandledRef.current = true;
    void hapticMicro();
    onResetZero();
    setConfirmationLabel('Reset');
  };

  if (!asset || !metrics) {
    // Missing assets render an explicit diagnostic state; ECS must not substitute a different vehicle image silently.
    return (
      <View
        testID="vehicle-attitude-stage-missing-asset"
        accessibilityRole="summary"
        accessibilityLabel={`Missing vehicle attitude image for ${vehicleId || 'unresolved vehicle'}.`}
        style={styles.missingAsset}
      >
        <Text style={styles.missingAssetTitle}>Vehicle attitude image missing</Text>
        <Text style={styles.missingAssetBody} numberOfLines={2}>
          {vehicleId ? `Missing vehicleId: ${vehicleId}` : 'Missing vehicleId: unresolved'}
        </Text>
      </View>
    );
  }

  const stage = { width: metrics.width, height: metrics.height };
  const pitchReadoutPoint = toStagePoint(
    asset,
    stage,
    { x: asset.pitchPanel.labelX, y: asset.pitchPanel.labelY + 44 },
  );
  const rollReadoutPoint = toStagePoint(
    asset,
    stage,
    { x: asset.rollPanel.labelX, y: asset.rollPanel.labelY + 44 },
  );
  const zeroPoint = toStagePoint(asset, stage, asset.zeroButtonAnchor);
  const levelPoint = toStagePoint(asset, stage, {
    x: asset.viewBox.width / 2,
    y: mode === 'command' ? COMMAND_LEVEL_READOUT_Y : DEFAULT_LEVEL_READOUT_Y,
  });
  const levelReadoutWidth = metrics.readoutWidth * (mode === 'command' ? 2.1 : 1.16);
  const zeroControlEnabled = Boolean(onZero || onResetZero);

  return (
    <View
      testID="vehicle-attitude-stage"
      accessibilityLabel={accessibilityLabel}
      pointerEvents="box-none"
      style={styles.shell}
      onLayout={handleLayout}
    >
      <View
        testID="vehicle-attitude-stage-viewbox"
        pointerEvents="box-none"
        style={[
          styles.fittedStage,
          {
            width: metrics.width,
            height: metrics.height,
          },
        ]}
      >
        <View
          pointerEvents="none"
          style={styles.vehicleImageLayer}
        >
          {/* The active Fleet vehicle controls this composite artwork; gauge needles are layered separately. */}
          <Image
            testID="vehicle-attitude-stage-image"
            source={asset.attitudeImageSource}
            resizeMode="contain"
            fadeDuration={0}
            style={styles.vehicleImage}
          />
        </View>

        {showReadouts ? (
          <View
            testID="vehicle-attitude-stage-gauge-overlay"
            pointerEvents="none"
            style={styles.gaugeOverlay}
          >
            <VehicleAttitudeGauge
              axis="pitch"
              value={safePitch}
              asset={asset}
              stage={stage}
            />
            <VehicleAttitudeGauge
              axis="roll"
              value={safeRoll}
              asset={asset}
              stage={stage}
            />
          </View>
        ) : null}

        {showLiveHashIndicators ? (
          <View
            testID="vehicle-attitude-stage-hash-overlay"
            pointerEvents="none"
            style={styles.hashOverlay}
          >
            <AttitudeLiveHashOverlay
              pitchDeg={safePitch}
              rollDeg={safeRoll}
              maxPitchDeg={maxPitchDeg}
              maxRollDeg={maxRollDeg}
              orientationCompensated
            />
          </View>
        ) : null}

        {showReadouts ? (
          <View
            testID="vehicle-attitude-stage-readout-overlay"
            pointerEvents="none"
            style={styles.readoutOverlay}
          >
            <DegreeReadout
              axis="pitch"
              valueDeg={safePitch}
              point={pitchReadoutPoint}
              width={metrics.readoutWidth}
              height={metrics.readoutHeight}
              fontSize={metrics.readoutFont}
            />
            <DegreeReadout
              axis="roll"
              valueDeg={safeRoll}
              point={rollReadoutPoint}
              width={metrics.readoutWidth}
              height={metrics.readoutHeight}
              fontSize={metrics.readoutFont}
            />
          </View>
        ) : null}

        {showReadouts ? (
          <View
            testID="vehicle-attitude-stage-level-readout"
            pointerEvents="none"
            style={[
              styles.stageLevelReadout,
              {
                left: levelPoint.x - levelReadoutWidth / 2,
                top: levelPoint.y - metrics.readoutHeight / 2,
                width: levelReadoutWidth,
                height: metrics.readoutHeight,
              },
            ]}
          >
            <Text style={styles.stageLevelText} numberOfLines={1}>
              {stageLevelLabel}
            </Text>
          </View>
        ) : null}

        {showZeroButton ? (
          <Animated.View
            testID="vehicle-attitude-zero-control"
            pointerEvents="box-none"
            style={[
              styles.zeroControl,
              {
                left: zeroPoint.x - metrics.zeroButtonWidth / 2,
                top: zeroPoint.y - metrics.zeroButtonHeight / 2,
                width: metrics.zeroButtonWidth,
                height: metrics.zeroButtonHeight,
                minHeight: metrics.zeroButtonHeight,
                transform: [{ translateY: buttonDrop }],
              },
            ]}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Zero attitude"
              accessibilityHint={onResetZero ? 'Long press to reset zero calibration' : undefined}
              disabled={!zeroControlEnabled}
              pointerEvents="auto"
              onPress={handleZero}
              onLongPress={handleResetZero}
              delayLongPress={420}
              style={({ pressed }) => [
                styles.zeroButton,
                zeroActive ? styles.zeroButtonActive : null,
                !zeroControlEnabled ? styles.zeroButtonDisabled : null,
                pressed ? styles.zeroButtonPressed : null,
              ]}
            />
          </Animated.View>
        ) : null}

      </View>

      {children ? (
        <View pointerEvents="box-none" style={styles.childrenLayer}>
          {children}
        </View>
      ) : null}
    </View>
  );
}

function VehicleAttitudeGauge({
  axis,
  value,
  asset,
  stage,
}: {
  axis: AttitudeAxis;
  value: number;
  asset: VehicleAttitudeAsset;
  stage: StageSize;
}) {
  const layout = ATTITUDE_GAUGE_LAYOUT[axis];
  const gaugeWidth = toStageScalar(asset, stage, 'x', ATTITUDE_GAUGE_LAYOUT.gaugeWidth);
  const gaugeHeight = toStageScalar(asset, stage, 'y', ATTITUDE_GAUGE_LAYOUT.gaugeHeight);
  const gaugeLeft = toStageScalar(asset, stage, 'x', layout.centerX) - gaugeWidth / 2;
  const gaugeTop = toStageScalar(asset, stage, 'y', layout.topY);

  return (
    <AttitudeGauge
      label={axis.toUpperCase()}
      valueDeg={value}
      style={[
        styles.gauge,
        {
          left: gaugeLeft,
          top: gaugeTop,
          width: gaugeWidth,
          height: gaugeHeight,
        },
      ]}
    />
  );
}

function DegreeReadout({
  axis,
  valueDeg,
  point,
  width,
  height,
  fontSize,
}: {
  axis: AttitudeAxis;
  valueDeg: number;
  point: { x: number; y: number };
  width: number;
  height: number;
  fontSize: number;
}) {
  return (
    <AttitudeReadout
      label={axis.toUpperCase()}
      valueDeg={valueDeg}
      style={[
        styles.degreeReadout,
        {
          left: point.x - width / 2,
          top: point.y - height / 2,
          width,
          height,
        },
      ]}
      valueStyle={{
        color: getAxisColor(valueDeg, axis),
        fontSize,
        lineHeight: fontSize + 5,
      }}
    />
  );
}

export default React.memo(VehicleAttitudeStage);

const styles = StyleSheet.create({
  shell: {
    flex: 1,
    alignSelf: 'stretch',
    minWidth: 0,
    minHeight: 0,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fittedStage: {
    position: 'relative',
    flexShrink: 0,
    minHeight: 0,
    minWidth: 0,
    maxWidth: '100%',
    maxHeight: '100%',
    overflow: 'hidden',
  },
  vehicleImageLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 0,
  },
  vehicleImage: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
  hashOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 2,
  },
  readoutOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 3,
  },
  gaugeOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1,
  },
  gauge: {
    position: 'absolute',
    overflow: 'visible',
  },
  zeroControl: {
    position: 'absolute',
    zIndex: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  childrenLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 5,
  },
  degreeReadout: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stageLevelReadout: {
    position: 'absolute',
    zIndex: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stageLevelText: {
    color: 'rgba(218, 255, 228, 0.9)',
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '900',
    letterSpacing: 0.9,
    textAlign: 'center',
    textTransform: 'uppercase',
    textShadowColor: 'rgba(0, 0, 0, 0.78)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 8,
  },
  zeroButton: {
    minHeight: 23,
    minWidth: 54,
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 999,
    borderWidth: 0,
    borderColor: 'transparent',
    backgroundColor: 'transparent',
    paddingHorizontal: 0,
    paddingVertical: 0,
    shadowColor: 'transparent',
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
  },
  zeroButtonActive: {
    borderColor: 'transparent',
    backgroundColor: 'transparent',
  },
  zeroButtonDisabled: {
    borderColor: 'transparent',
  },
  zeroButtonPressed: {
    backgroundColor: 'rgba(79, 231, 255, 0.08)',
  },
  zeroText: {
    color: TACTICAL.amber,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '900',
    letterSpacing: 0.7,
    textTransform: 'uppercase',
  },
  zeroTextDisabled: {
    color: 'rgba(139, 148, 158, 0.68)',
  },
  zeroConfirm: {
    position: 'absolute',
    top: 28,
    color: TACTICAL.amber,
    fontSize: 10,
    lineHeight: 13,
    fontWeight: '800',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 8,
  },
  missingAsset: {
    flex: 1,
    minHeight: 0,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
    paddingVertical: 16,
    gap: 6,
  },
  missingAssetTitle: {
    color: TACTICAL.danger,
    fontSize: 13,
    lineHeight: 17,
    fontWeight: '900',
    letterSpacing: 0.8,
    textAlign: 'center',
    textTransform: 'uppercase',
  },
  missingAssetBody: {
    color: TACTICAL.textMuted,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
    textAlign: 'center',
  },
});
