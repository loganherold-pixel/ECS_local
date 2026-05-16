import React, { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Constants from 'expo-constants';

import {
  ROUTE_GUIDANCE_PROGRESS_STATE_MACHINE,
  ROUTE_GUIDANCE_PROGRESS_VIEW_MODEL,
  resolveRouteGuidanceProgressRiveRuntime,
  type RouteGuidanceProgressRiveRuntimeValues,
} from '../../lib/routeGuidanceProgressRive';
import type { RouteGuidanceProgressRiveProps } from './RouteGuidanceProgressRive';

// Metro needs a static asset reference so the native Rive runtime can load the bundled .riv file.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const ROUTE_GUIDANCE_PROGRESS_ASSET = require('../../assets/route/guide_progress_map.riv');

type OptionalRiveRuntime = {
  Alignment: { Center: unknown };
  Fit: { Cover: unknown; Contain: unknown };
  RiveView: React.ComponentType<Record<string, unknown>>;
  useRive: () => {
    riveViewRef: { playIfNeeded?: () => void } | null;
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
      onInit: (instance: ViewModelInstanceLike) => void;
    },
  ) => {
    instance: ViewModelInstanceLike | null | undefined;
    error: Error | null;
  };
};

type ViewModelInstanceLike = {
  numberProperty: (path: string) => { set: (value: number) => void } | undefined;
  booleanProperty: (path: string) => { set: (value: boolean) => void } | undefined;
};

let cachedRiveRuntime: OptionalRiveRuntime | null | undefined;
let warnedRiveUnavailable = false;

function warnRouteGuidanceRive(message: string, error?: Error | null) {
  if (typeof __DEV__ !== 'undefined' && __DEV__ && !warnedRiveUnavailable) {
    warnedRiveUnavailable = true;
    console.warn(`[RouteGuidanceProgressRive] ${message}`, error?.message ?? '');
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
    // The Rive React Native runtime depends on Nitro native modules, which Expo Go cannot load.
    // Keep this lazy so Expo Go can render the existing route visual instead of crashing.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    cachedRiveRuntime = require('@rive-app/react-native') as OptionalRiveRuntime;
  } catch (error) {
    cachedRiveRuntime = null;
    warnRouteGuidanceRive('Native Rive runtime unavailable; using route guidance fallback.', error as Error);
  }

  return cachedRiveRuntime;
}

function applyRuntimeValues(
  instance: ViewModelInstanceLike,
  runtime: RouteGuidanceProgressRiveRuntimeValues,
) {
  instance.numberProperty('routeProgress')?.set(runtime.routeProgress);
  instance.booleanProperty('isActive')?.set(runtime.isActive);
  instance.booleanProperty('isOffline')?.set(runtime.isOffline);
}

export default function RouteGuidanceProgressRive({
  progressPercent,
  isActive,
  isOffline,
  style,
  testID,
  fallback,
}: RouteGuidanceProgressRiveProps) {
  const riveRuntime = useMemo(() => getOptionalRiveRuntime(), []);

  if (!riveRuntime) {
    return <>{fallback ?? null}</>;
  }

  return (
    <RouteGuidanceProgressRiveNativeRuntime
      riveRuntime={riveRuntime}
      progressPercent={progressPercent}
      isActive={isActive}
      isOffline={isOffline}
      style={style}
      testID={testID}
      fallback={fallback}
    />
  );
}

function RouteGuidanceProgressRiveNativeRuntime({
  riveRuntime,
  progressPercent,
  isActive,
  isOffline,
  style,
  testID,
  fallback,
}: RouteGuidanceProgressRiveProps & { riveRuntime: OptionalRiveRuntime }) {
  const { Alignment, Fit, RiveView, useRive, useRiveFile, useViewModelInstance } = riveRuntime;
  const [hasRuntimeError, setHasRuntimeError] = useState(false);
  const { riveViewRef, setHybridRef } = useRive();
  const runtime = useMemo(
    () => resolveRouteGuidanceProgressRiveRuntime({ progressPercent, isActive, isOffline }),
    [isActive, isOffline, progressPercent],
  );
  const initialRuntimeRef = useRef(runtime);
  const { riveFile, error: riveFileError } = useRiveFile(ROUTE_GUIDANCE_PROGRESS_ASSET);
  const { instance: viewModelInstance, error: viewModelError } = useViewModelInstance(riveFile, {
    viewModelName: ROUTE_GUIDANCE_PROGRESS_VIEW_MODEL,
    onInit: (instance) => applyRuntimeValues(instance, initialRuntimeRef.current),
  });

  useEffect(() => {
    if (riveFileError || viewModelError) {
      warnRouteGuidanceRive('Rive file or view model failed to load; using route guidance fallback.', riveFileError ?? viewModelError);
      setHasRuntimeError(true);
    }
  }, [riveFileError, viewModelError]);

  useEffect(() => {
    if (!viewModelInstance || hasRuntimeError) return;
    applyRuntimeValues(viewModelInstance, runtime);
    riveViewRef?.playIfNeeded?.();
  }, [hasRuntimeError, riveViewRef, runtime, viewModelInstance]);

  if (!riveFile || !viewModelInstance || hasRuntimeError) {
    return <>{fallback ?? null}</>;
  }

  return (
    <View testID={testID} style={[styles.riveWrap, style]}>
      <RiveView
        file={riveFile}
        hybridRef={setHybridRef}
        autoPlay
        stateMachineName={ROUTE_GUIDANCE_PROGRESS_STATE_MACHINE}
        dataBind={viewModelInstance}
        fit={Fit.Cover ?? Fit.Contain}
        alignment={Alignment.Center}
        style={styles.riveCanvas}
        onError={(error: Error) => {
          warnRouteGuidanceRive('Rive view reported an error; using route guidance fallback.', error);
          setHasRuntimeError(true);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  riveWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  riveCanvas: {
    width: '100%',
    height: '100%',
  },
});
