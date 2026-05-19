import React, { useEffect, useMemo, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Constants from 'expo-constants';

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

// Metro needs a static require so the .riv is bundled into native builds.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const ATTITUDE_INCLINATION_ASSET = require('../../../../assets/attitude/inclination_widget.riv');

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

type RiveNativeRefLike = {
  awaitViewReady?: () => Promise<boolean>;
  setNumberInputValue?: (name: string, value: number, path?: string) => void;
  playIfNeeded?: () => void;
  pause?: () => Promise<void>;
};

type OptionalRiveRuntime = {
  Alignment: { Center: unknown };
  DataBindMode: { None: unknown };
  Fit: { Contain: unknown };
  RiveView: React.ComponentType<Record<string, unknown>>;
  useRive: () => {
    riveViewRef: RiveNativeRefLike | null;
    setHybridRef: unknown;
  };
  useRiveFile: (input: unknown) => {
    riveFile: unknown;
    error: Error | null;
  };
};

let cachedRiveRuntime: OptionalRiveRuntime | null | undefined;
let warnedAttitudeRive = false;

function warnAttitudeRive(message: string, error?: unknown) {
  if (typeof __DEV__ !== 'undefined' && __DEV__ && !warnedAttitudeRive) {
    warnedAttitudeRive = true;
    const detail = error instanceof Error ? error.message : '';
    console.warn(`[AttitudeInclinationRiveWidget] ${message}`, detail);
  }
}

function getOptionalRiveRuntime(): OptionalRiveRuntime | null {
  if (Constants.appOwnership === 'expo') {
    return null;
  }
  if (cachedRiveRuntime !== undefined) {
    return cachedRiveRuntime;
  }

  try {
    // The native Rive runtime depends on Nitro native modules, which Expo Go cannot load.
    // Keep this lazy so Expo Go/test runs render the lightweight fallback instead of crashing.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    cachedRiveRuntime = require('@rive-app/react-native') as OptionalRiveRuntime;
  } catch {
    cachedRiveRuntime = null;
  }

  return cachedRiveRuntime;
}

export default function AttitudeInclinationRiveWidget(props: AttitudeInclinationRiveWidgetProps) {
  const riveRuntime = useMemo(() => getOptionalRiveRuntime(), []);

  if (!riveRuntime) {
    return <AttitudeInclinationFallback {...props} />;
  }

  return <AttitudeInclinationNativeRuntime {...props} riveRuntime={riveRuntime} />;
}

function AttitudeInclinationNativeRuntime({
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
}: AttitudeInclinationRiveWidgetProps & { riveRuntime: OptionalRiveRuntime }) {
  const { Alignment, DataBindMode, Fit, RiveView, useRive, useRiveFile } = riveRuntime;
  const { riveViewRef, setHybridRef } = useRive();
  const { riveFile, error: riveFileError } = useRiveFile(ATTITUDE_INCLINATION_ASSET);
  const runtime = useMemo(
    () => resolveAttitudeInclinationRuntime({ axis, valueDeg, minDeg, maxDeg }),
    [axis, maxDeg, minDeg, valueDeg],
  );
  const latestInputValueRef = useRef(runtime.inputValue);

  useEffect(() => {
    latestInputValueRef.current = runtime.inputValue;
  }, [runtime.inputValue]);

  useEffect(() => {
    if (riveFileError) {
      warnAttitudeRive('Rive file failed to load; using transparent fallback.', riveFileError);
    }
  }, [riveFileError]);

  useEffect(() => {
    let cancelled = false;
    let retryHandle: ReturnType<typeof setTimeout> | null = null;
    const refreshHandles: ReturnType<typeof setTimeout>[] = [];
    let attempt = 0;

    async function applyAngle() {
      if (!riveViewRef || !riveFile) return;

      try {
        const ready = await riveViewRef.awaitViewReady?.();
        if (ready === false) {
          throw new Error('Rive view ready check returned false');
        }
        if (cancelled) return;
        riveViewRef.setNumberInputValue?.(
          ATTITUDE_INCLINATION_NUMBER_INPUT,
          latestInputValueRef.current,
        );
        riveViewRef.playIfNeeded?.();
      } catch (error) {
        if (cancelled) return;
        if (attempt < 8) {
          attempt += 1;
          retryHandle = setTimeout(() => {
            void applyAngle();
          }, attempt * 75);
          return;
        }
        warnAttitudeRive('Rive input write failed after retries; keeping the Rive surface mounted.', error);
      }
    }

    void applyAngle();
    for (const delay of [90, 240, 520]) {
      refreshHandles.push(setTimeout(() => {
        void applyAngle();
      }, delay));
    }
    return () => {
      cancelled = true;
      if (retryHandle) {
        clearTimeout(retryHandle);
      }
      for (const handle of refreshHandles) {
        clearTimeout(handle);
      }
    };
  }, [riveFile, riveViewRef, runtime.inputValue]);

  useEffect(() => () => {
    void riveViewRef?.pause?.();
  }, [riveViewRef]);

  if (!riveFile) {
    return (
      <AttitudeInclinationFallback
        axis={axis}
        valueDeg={valueDeg}
        label={label}
        minDeg={minDeg}
        maxDeg={maxDeg}
        showLabel={showLabel}
        showValue={showValue}
        style={style}
        testID={testID}
      />
    );
  }

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
        <RiveView
          file={riveFile}
          hybridRef={setHybridRef}
          artboardName={ATTITUDE_INCLINATION_ARTBOARD}
          pointerEvents="none"
          autoPlay
          stateMachineName={ATTITUDE_INCLINATION_STATE_MACHINE}
          dataBind={DataBindMode.None}
          fit={Fit.Contain}
          alignment={Alignment.Center}
          style={styles.riveCanvas}
          onError={(error: unknown) => {
            warnAttitudeRive('Rive view reported an error; keeping the Rive surface mounted.', error);
            riveViewRef?.playIfNeeded?.();
          }}
        />
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
  riveCanvas: {
    width: '100%',
    height: '100%',
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
