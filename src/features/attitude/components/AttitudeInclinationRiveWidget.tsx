'use client';

import React, { useEffect, useMemo } from 'react';
import {
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { TACTICAL } from '../../../../lib/theme';
import {
  ATTITUDE_INCLINATION_ARTBOARD,
  ATTITUDE_INCLINATION_DEFAULT_MAX_DEG,
  ATTITUDE_INCLINATION_DEFAULT_MIN_DEG,
  ATTITUDE_INCLINATION_NUMBER_INPUT,
  ATTITUDE_INCLINATION_RIVE_FOCUS_SCALE,
  ATTITUDE_INCLINATION_RIVE_FOCUS_TRANSLATE_X,
  ATTITUDE_INCLINATION_RIVE_FOCUS_TRANSLATE_Y,
  ATTITUDE_INCLINATION_STATE_MACHINE,
  formatInclinationDegrees,
  resolveAttitudeInclinationRuntime,
  type AttitudeInclinationAxis,
  type AttitudeInclinationRuntimeValues,
} from '../attitudeInclinationRive';

const RIVE_SRC = '/rive/inclination_widget.riv';
const riveCanvasStyle: React.CSSProperties = {
  width: '100%',
  height: '100%',
  display: 'block',
  pointerEvents: 'none',
};

type AttitudeInclinationRiveWidgetProps = {
  axis: AttitudeInclinationAxis;
  valueDeg: number;
  label?: string;
  minDeg?: number;
  maxDeg?: number;
  showLabel?: boolean;
  showValue?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

type StateMachineNumberInputLike = {
  value: number | boolean;
};

type OptionalWebRiveRuntime = {
  Alignment: { Center: unknown };
  Fit: { Contain: unknown };
  Layout: new (params: { fit: unknown; alignment: unknown }) => unknown;
  useRive: (params: Record<string, unknown>) => {
    rive: { play?: () => void } | null;
    RiveComponent: React.ComponentType<{ style?: React.CSSProperties }>;
  };
  useStateMachineInput: (
    rive: unknown,
    stateMachineName?: string,
    inputName?: string,
    initialValue?: number | boolean,
  ) => StateMachineNumberInputLike | null;
};

let cachedRiveRuntime: OptionalWebRiveRuntime | null | undefined;

function getOptionalWebRiveRuntime(): OptionalWebRiveRuntime | null {
  if (typeof document === 'undefined') {
    return null;
  }
  if (cachedRiveRuntime !== undefined) {
    return cachedRiveRuntime;
  }

  try {
    // Keep this lazy so Node-based contract tests can render the fallback without
    // pulling in the browser/wasm Rive runtime.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    cachedRiveRuntime = require('@rive-app/react-webgl2') as OptionalWebRiveRuntime;
  } catch {
    cachedRiveRuntime = null;
  }

  return cachedRiveRuntime;
}

export default function AttitudeInclinationRiveWidget(props: AttitudeInclinationRiveWidgetProps) {
  const riveRuntime = useMemo(() => getOptionalWebRiveRuntime(), []);

  if (!riveRuntime) {
    return <AttitudeInclinationFallback {...props} />;
  }

  return <AttitudeInclinationWebRuntime {...props} riveRuntime={riveRuntime} />;
}

function AttitudeInclinationWebRuntime({
  riveRuntime,
  axis,
  valueDeg,
  label,
  minDeg = ATTITUDE_INCLINATION_DEFAULT_MIN_DEG,
  maxDeg = ATTITUDE_INCLINATION_DEFAULT_MAX_DEG,
  showLabel = true,
  showValue = true,
  style,
  testID,
}: AttitudeInclinationRiveWidgetProps & { riveRuntime: OptionalWebRiveRuntime }) {
  const { Alignment, Fit, Layout, useRive, useStateMachineInput } = riveRuntime;
  const runtime = useMemo(
    () => resolveAttitudeInclinationRuntime({ axis, valueDeg, minDeg, maxDeg }),
    [axis, maxDeg, minDeg, valueDeg],
  );
  const layout = useMemo(
    () => new Layout({ fit: Fit.Contain, alignment: Alignment.Center }),
    [Alignment.Center, Fit.Contain, Layout],
  );
  const { rive, RiveComponent } = useRive({
    src: RIVE_SRC,
    artboard: ATTITUDE_INCLINATION_ARTBOARD,
    stateMachines: ATTITUDE_INCLINATION_STATE_MACHINE,
    autoplay: true,
    layout,
  });
  const angleInput = useStateMachineInput(
    rive,
    ATTITUDE_INCLINATION_STATE_MACHINE,
    ATTITUDE_INCLINATION_NUMBER_INPUT,
    runtime.inputValue,
  );

  useEffect(() => {
    if (!angleInput) return;
    angleInput.value = runtime.inputValue;
    rive?.play?.();
  }, [angleInput, rive, runtime.inputValue]);

  return (
    <AttitudeInclinationRingFrame
      axis={axis}
      label={label}
      runtime={runtime}
      showLabel={showLabel}
      showValue={showValue}
      style={style}
      testID={testID}
    >
      <View pointerEvents="none" style={styles.riveFocusLayer}>
        <RiveComponent style={riveCanvasStyle} />
      </View>
    </AttitudeInclinationRingFrame>
  );
}

function AttitudeInclinationFallback({
  axis,
  valueDeg,
  label,
  minDeg = ATTITUDE_INCLINATION_DEFAULT_MIN_DEG,
  maxDeg = ATTITUDE_INCLINATION_DEFAULT_MAX_DEG,
  showLabel = true,
  showValue = true,
  style,
  testID,
}: AttitudeInclinationRiveWidgetProps) {
  const runtime = resolveAttitudeInclinationRuntime({ axis, valueDeg, minDeg, maxDeg });
  return (
    <AttitudeInclinationRingFrame
      axis={axis}
      label={label}
      runtime={runtime}
      showLabel={showLabel}
      showValue={showValue}
      style={style}
      testID={testID}
    >
      <View pointerEvents="none" style={styles.transparentRiveFallback} />
    </AttitudeInclinationRingFrame>
  );
}

function AttitudeInclinationRingFrame({
  axis,
  label,
  runtime,
  showLabel,
  showValue,
  style,
  testID,
  children,
}: {
  axis: AttitudeInclinationAxis;
  label?: string;
  runtime: AttitudeInclinationRuntimeValues;
  showLabel: boolean;
  showValue: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  children: React.ReactNode;
}) {
  const displayLabel = label ?? axis.toUpperCase();

  return (
    <View pointerEvents="none" testID={testID} style={[styles.shell, style]}>
      {showLabel ? (
        <Text style={styles.axisLabel} numberOfLines={1}>
          {displayLabel}
        </Text>
      ) : null}
      <View style={styles.ringSlot}>
        {children}
        {showValue ? (
          <Text
            testID={testID ? `${testID}-degree-readout` : undefined}
            style={styles.degreeValue}
            adjustsFontSizeToFit
            minimumFontScale={0.76}
            numberOfLines={1}
          >
            {formatInclinationDegrees(runtime.valueDeg)}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    width: '100%',
    height: '100%',
    minWidth: 76,
    minHeight: 58,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
  },
  axisLabel: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: -18,
    zIndex: 4,
    color: TACTICAL.amber,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '900',
    letterSpacing: 1.6,
    textAlign: 'center',
    textTransform: 'uppercase',
    textShadowColor: 'rgba(0, 0, 0, 0.78)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 7,
  },
  ringSlot: {
    ...StyleSheet.absoluteFillObject,
    minHeight: 0,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    overflow: 'visible',
    backgroundColor: 'transparent',
  },
  // Transparent Rive artboard: no old crop mask. Keep this layer neutral by
  // default so ECS does not draw or clip an extra exterior circle.
  riveFocusLayer: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
    transform: [
      { scale: ATTITUDE_INCLINATION_RIVE_FOCUS_SCALE },
      { translateX: ATTITUDE_INCLINATION_RIVE_FOCUS_TRANSLATE_X },
      { translateY: ATTITUDE_INCLINATION_RIVE_FOCUS_TRANSLATE_Y },
    ],
  },
  degreeValue: {
    position: 'absolute',
    zIndex: 3,
    alignSelf: 'center',
    color: TACTICAL.text,
    fontSize: 17,
    lineHeight: 21,
    fontWeight: '900',
    letterSpacing: 0.4,
    textAlign: 'center',
    textShadowColor: 'rgba(0, 0, 0, 0.86)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 8,
    paddingHorizontal: 6,
  },
  transparentRiveFallback: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'transparent',
  },
});

export type { AttitudeInclinationRiveWidgetProps };
