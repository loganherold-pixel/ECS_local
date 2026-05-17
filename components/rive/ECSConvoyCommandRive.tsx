import React, { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Constants from 'expo-constants';

import { TACTICAL } from '../../lib/theme';

export type ConvoyCommandVisualState = 'live' | 'estimated' | 'partial' | 'offline' | 'alert';

export type ECSConvoyCommandRiveProps = {
  visualState: ConvoyCommandVisualState;
  lostUnitIndex?: number;
  cautionLevel?: 0 | 1 | 2;
  convoyActive?: boolean;
  reducedMotion?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

const CONVOY_COMMAND_ARTBOARD = 'ConvoyCommand';
const CONVOY_COMMAND_STATE_MACHINE = 'ConvoyCommand';
const CONVOY_COMMAND_VIEW_MODEL = 'ConvoyCommand';
const CONVOY_COMMAND_VIEW_MODEL_INSTANCE = 'Instance';

let CONVOY_COMMAND_ASSET: unknown | null = null;
try {
  // Metro needs a static asset reference so native builds bundle the Rive binary.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  CONVOY_COMMAND_ASSET = require('../../assets/rive/ConvoyCommand.riv');
} catch {
  CONVOY_COMMAND_ASSET = null;
}

type OptionalRiveRuntime = {
  Alignment: { Center: unknown };
  DataBindMode: { Auto: unknown };
  Fit: { Contain: unknown };
  RiveView: React.ComponentType<Record<string, unknown>>;
  useRive: () => {
    riveViewRef: { playIfNeeded?: () => void; pause?: () => Promise<void> } | null;
    setHybridRef: unknown;
  };
  useRiveFile: (input: unknown) => {
    riveFile: unknown;
    error: Error | null;
  };
  useViewModelInstance: (
    file: unknown,
    params: {
      viewModelName: string;
      instanceName?: string;
      onInit: (instance: ViewModelInstanceLike) => void;
    },
  ) => {
    instance: ViewModelInstanceLike | null | undefined;
    error: Error | null;
  };
};

type NumberProperty = { set: (value: number) => void };
type BooleanProperty = { set: (value: boolean) => void };

type ViewModelInstanceLike = {
  numberProperty: (path: string) => NumberProperty | undefined;
  booleanProperty: (path: string) => BooleanProperty | undefined;
};

type ConvoyCommandRuntimeValues = {
  state: number;
  lostUnitIndex: number;
  cautionLevel: 0 | 1 | 2;
  reducedMotion: boolean;
};

const VISUAL_STATE_CODE: Record<ConvoyCommandVisualState, number> = {
  live: 0,
  estimated: 1,
  partial: 2,
  offline: 3,
  alert: 4,
};

const DEFAULT_VISUAL_STATE: ConvoyCommandVisualState = 'offline';

let cachedRiveRuntime: OptionalRiveRuntime | null | undefined;
let warnedRiveUnavailable = false;
let warnedMissingAsset = false;
const warnedMissingProperties = new Set<string>();

function warnConvoyRive(message: string, error?: Error | null) {
  if (typeof __DEV__ === 'undefined' || !__DEV__) return;
  if (message === 'Native Rive runtime unavailable; using Convoy Command fallback.' && warnedRiveUnavailable) return;
  if (message === 'Native Rive runtime unavailable; using Convoy Command fallback.') {
    warnedRiveUnavailable = true;
  }
  console.warn(`[ECSConvoyCommandRive] ${message}`, error?.message ?? '');
}

function warnMissingAsset() {
  if (warnedMissingAsset) return;
  warnedMissingAsset = true;
  warnConvoyRive('ConvoyCommand.riv asset unavailable; using Convoy Command fallback.');
}

function warnMissingProperty(property: string) {
  if (warnedMissingProperties.has(property)) return;
  warnedMissingProperties.add(property);
  warnConvoyRive(`ConvoyCommand view-model property "${property}" is missing; continuing without binding it.`);
}

function getOptionalRiveRuntime(): OptionalRiveRuntime | null {
  if (Constants.appOwnership === 'expo') {
    return null;
  }
  if (cachedRiveRuntime !== undefined) {
    return cachedRiveRuntime;
  }

  try {
    // The Rive React Native runtime depends on native modules Expo Go cannot load.
    // Keep this lazy so the app can render the fallback without crashing.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    cachedRiveRuntime = require('@rive-app/react-native') as OptionalRiveRuntime;
  } catch (error) {
    cachedRiveRuntime = null;
    warnConvoyRive('Native Rive runtime unavailable; using Convoy Command fallback.', error as Error);
  }

  return cachedRiveRuntime;
}

function clampLostUnitIndex(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return -1;
  return Math.max(-1, Math.trunc(value));
}

function clampCautionLevel(value: 0 | 1 | 2 | undefined): 0 | 1 | 2 {
  if (value === 2) return 2;
  if (value === 1) return 1;
  return 0;
}

function resolveVisualState(value: ConvoyCommandVisualState): ConvoyCommandVisualState {
  return VISUAL_STATE_CODE[value] == null ? DEFAULT_VISUAL_STATE : value;
}

function resolveConvoyCommandRuntime({
  visualState,
  lostUnitIndex,
  cautionLevel,
  reducedMotion,
}: ECSConvoyCommandRiveProps): ConvoyCommandRuntimeValues {
  const safeVisualState = resolveVisualState(visualState);
  return {
    state: VISUAL_STATE_CODE[safeVisualState],
    lostUnitIndex: clampLostUnitIndex(lostUnitIndex),
    cautionLevel: clampCautionLevel(cautionLevel),
    reducedMotion: reducedMotion === true,
  };
}

function setNumberProperty(instance: ViewModelInstanceLike, property: keyof Pick<ConvoyCommandRuntimeValues, 'state' | 'lostUnitIndex' | 'cautionLevel'>, value: number) {
  const handle = instance.numberProperty(property);
  if (!handle) {
    warnMissingProperty(property);
    return;
  }
  handle.set(value);
}

function setBooleanProperty(instance: ViewModelInstanceLike, property: keyof Pick<ConvoyCommandRuntimeValues, 'reducedMotion'>, value: boolean) {
  const handle = instance.booleanProperty(property);
  if (!handle) {
    warnMissingProperty(property);
    return;
  }
  handle.set(value);
}

function applyRuntimeValues(instance: ViewModelInstanceLike, runtime: ConvoyCommandRuntimeValues) {
  setNumberProperty(instance, 'state', runtime.state);
  setNumberProperty(instance, 'lostUnitIndex', runtime.lostUnitIndex);
  setNumberProperty(instance, 'cautionLevel', runtime.cautionLevel);
  setBooleanProperty(instance, 'reducedMotion', runtime.reducedMotion);
}

function ConvoyCommandFallback({ style, testID }: Pick<ECSConvoyCommandRiveProps, 'style' | 'testID'>) {
  return (
    <View
      testID={testID}
      accessibilityRole="image"
      accessibilityLabel="Convoy Command visual unavailable"
      style={[styles.fallback, style]}
    >
      <View style={styles.fallbackRail} />
    </View>
  );
}

export default function ECSConvoyCommandRive(props: ECSConvoyCommandRiveProps) {
  const riveRuntime = useMemo(() => getOptionalRiveRuntime(), []);

  if (!CONVOY_COMMAND_ASSET) {
    warnMissingAsset();
    return <ConvoyCommandFallback style={props.style} testID={props.testID} />;
  }

  if (!riveRuntime) {
    return <ConvoyCommandFallback style={props.style} testID={props.testID} />;
  }

  return <ECSConvoyCommandRiveNativeRuntime {...props} riveRuntime={riveRuntime} />;
}

function ECSConvoyCommandRiveNativeRuntime({
  riveRuntime,
  visualState,
  lostUnitIndex,
  cautionLevel,
  convoyActive,
  reducedMotion,
  style,
  testID,
}: ECSConvoyCommandRiveProps & { riveRuntime: OptionalRiveRuntime }) {
  const { Alignment, DataBindMode, Fit, RiveView, useRive, useRiveFile, useViewModelInstance } = riveRuntime;
  const [hasRuntimeError, setHasRuntimeError] = useState(false);
  const { riveViewRef, setHybridRef } = useRive();
  const shouldAutoplay = convoyActive !== false && reducedMotion !== true;
  const runtime = useMemo(
    () => resolveConvoyCommandRuntime({ visualState, lostUnitIndex, cautionLevel, reducedMotion }),
    [cautionLevel, lostUnitIndex, reducedMotion, visualState],
  );
  const initialRuntimeRef = useRef(runtime);
  const { riveFile, error: riveFileError } = useRiveFile(CONVOY_COMMAND_ASSET);
  const { instance: viewModelInstance, error: viewModelError } = useViewModelInstance(riveFile, {
    viewModelName: CONVOY_COMMAND_VIEW_MODEL,
    instanceName: CONVOY_COMMAND_VIEW_MODEL_INSTANCE,
    onInit: (instance) => applyRuntimeValues(instance, initialRuntimeRef.current),
  });

  useEffect(() => {
    if (riveFileError) {
      warnConvoyRive('Convoy Command Rive file failed to load; using fallback.', riveFileError);
      setHasRuntimeError(true);
    }
  }, [riveFileError]);

  useEffect(() => {
    if (viewModelError) {
      warnConvoyRive('ConvoyCommand view model failed to bind; rendering asset without runtime data.', viewModelError);
    }
  }, [viewModelError]);

  useEffect(() => {
    if (!viewModelInstance || hasRuntimeError) return;
    applyRuntimeValues(viewModelInstance, runtime);
    if (shouldAutoplay) {
      riveViewRef?.playIfNeeded?.();
    }
  }, [hasRuntimeError, riveViewRef, runtime, shouldAutoplay, viewModelInstance]);

  useEffect(() => () => {
    void riveViewRef?.pause?.();
  }, [riveViewRef]);

  if (!riveFile || hasRuntimeError) {
    return <ConvoyCommandFallback style={style} testID={testID} />;
  }

  return (
    <View testID={testID} style={[styles.riveWrap, style]}>
      <RiveView
        file={riveFile}
        hybridRef={setHybridRef}
        artboardName={CONVOY_COMMAND_ARTBOARD}
        autoPlay={shouldAutoplay}
        stateMachineName={CONVOY_COMMAND_STATE_MACHINE}
        dataBind={viewModelInstance ?? DataBindMode.Auto}
        fit={Fit.Contain}
        alignment={Alignment.Center}
        style={styles.riveCanvas}
        onError={(error: Error) => {
          warnConvoyRive('Convoy Command Rive view reported an error; using fallback.', error);
          setHasRuntimeError(true);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  riveWrap: {
    width: '100%',
    height: '100%',
    minWidth: 96,
    minHeight: 64,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  riveCanvas: {
    width: '100%',
    height: '100%',
    minWidth: 96,
    minHeight: 64,
  },
  fallback: {
    width: '100%',
    height: '100%',
    minWidth: 96,
    minHeight: 64,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: TACTICAL.border,
    backgroundColor: TACTICAL.panel,
  },
  fallbackRail: {
    width: '72%',
    height: 2,
    borderRadius: 2,
    backgroundColor: TACTICAL.amber,
    opacity: 0.48,
  },
});
