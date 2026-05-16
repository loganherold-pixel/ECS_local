import React, { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Constants from 'expo-constants';

import {
  BLU_POWER_MODULE_ARTBOARD,
  BLU_POWER_MODULE_STATE_MACHINE,
  BLU_POWER_MODULE_VIEW_MODEL,
  BLU_POWER_MODULE_VIEW_MODEL_INSTANCE,
  BLU_POWER_MODULE_VIEW_MODEL_NUMERIC_PROPERTIES,
  resolveBluPowerModuleRuntime,
  type BluPowerModuleRuntimeValues,
} from '../../lib/bluPowerModuleRive';
import BluPowerModuleFallback, { type PowerModuleRiveWidgetProps } from './BluPowerModuleFallback';

// Metro needs a static asset reference so the native Rive runtime can load the bundled .riv file.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const BLU_POWER_MODULE_ASSET = require('../../assets/power/blu_power_module.riv');

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

type ViewModelInstanceLike = {
  numberProperty: (path: string) => { set: (value: number) => void } | undefined;
};

let cachedRiveRuntime: OptionalRiveRuntime | null | undefined;

function getOptionalRiveRuntime(): OptionalRiveRuntime | null {
  if (Constants.appOwnership === 'expo') {
    return null;
  }
  if (cachedRiveRuntime !== undefined) {
    return cachedRiveRuntime;
  }

  try {
    // The Rive React Native runtime depends on Nitro native modules, which Expo Go cannot load.
    // Keep this lazy so Expo Go can render the truthful fallback instead of crashing at import time.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    cachedRiveRuntime = require('@rive-app/react-native') as OptionalRiveRuntime;
  } catch {
    cachedRiveRuntime = null;
  }

  return cachedRiveRuntime;
}

function setNumberProperty(instance: ViewModelInstanceLike, property: keyof BluPowerModuleRuntimeValues, value: number) {
  instance.numberProperty(property)?.set(value);
}

function applyRuntimeValues(instance: ViewModelInstanceLike, runtime: BluPowerModuleRuntimeValues) {
  for (const property of BLU_POWER_MODULE_VIEW_MODEL_NUMERIC_PROPERTIES) {
    setNumberProperty(instance, property, runtime[property]);
  }
}

export default function PowerModuleRiveWidget({
  hasEcsData,
  batteryPercent,
  inputWatts,
  outputWatts,
  style,
  testID,
}: PowerModuleRiveWidgetProps) {
  const riveRuntime = useMemo(() => getOptionalRiveRuntime(), []);

  if (!riveRuntime) {
    return (
      <BluPowerModuleFallback
        hasEcsData={hasEcsData}
        batteryPercent={batteryPercent}
        inputWatts={inputWatts}
        outputWatts={outputWatts}
        style={style}
        testID={testID}
      />
    );
  }

  return (
    <PowerModuleNativeRuntime
      riveRuntime={riveRuntime}
      hasEcsData={hasEcsData}
      batteryPercent={batteryPercent}
      inputWatts={inputWatts}
      outputWatts={outputWatts}
      style={style}
      testID={testID}
    />
  );
}

function PowerModuleNativeRuntime({
  riveRuntime,
  hasEcsData,
  batteryPercent,
  inputWatts,
  outputWatts,
  style,
  testID,
}: PowerModuleRiveWidgetProps & { riveRuntime: OptionalRiveRuntime }) {
  const { Alignment, DataBindMode, Fit, RiveView, useRive, useRiveFile, useViewModelInstance } = riveRuntime;
  const [hasRuntimeError, setHasRuntimeError] = useState(false);
  const { riveViewRef, setHybridRef } = useRive();
  const runtime = useMemo(
    () => resolveBluPowerModuleRuntime({ hasEcsData, batteryPercent, inputWatts, outputWatts }),
    [batteryPercent, hasEcsData, inputWatts, outputWatts],
  );
  const initialRuntimeRef = useRef(runtime);
  const { riveFile, error: riveFileError } = useRiveFile(BLU_POWER_MODULE_ASSET);
  const { instance: viewModelInstance, error: viewModelError } = useViewModelInstance(riveFile, {
    viewModelName: BLU_POWER_MODULE_VIEW_MODEL,
    instanceName: BLU_POWER_MODULE_VIEW_MODEL_INSTANCE,
    onInit: (instance) => applyRuntimeValues(instance, initialRuntimeRef.current),
  });

  useEffect(() => {
    if (riveFileError || viewModelError) {
      setHasRuntimeError(true);
    }
  }, [riveFileError, viewModelError]);

  useEffect(() => {
    if (!viewModelInstance || hasRuntimeError) return;
    applyRuntimeValues(viewModelInstance, runtime);
    riveViewRef?.playIfNeeded?.();
  }, [hasRuntimeError, riveViewRef, runtime, viewModelInstance]);

  useEffect(() => () => {
    void riveViewRef?.pause?.();
  }, [riveViewRef]);

  if (!riveFile || hasRuntimeError) {
    return (
      <BluPowerModuleFallback
        hasEcsData={hasEcsData}
        batteryPercent={batteryPercent}
        inputWatts={inputWatts}
        outputWatts={outputWatts}
        style={style}
        testID={testID}
      />
    );
  }

  return (
    <View testID={testID} style={[styles.riveWrap, style]}>
      <RiveView
        file={riveFile}
        hybridRef={setHybridRef}
        artboardName={BLU_POWER_MODULE_ARTBOARD}
        autoPlay
        stateMachineName={BLU_POWER_MODULE_STATE_MACHINE}
        dataBind={viewModelInstance ?? DataBindMode.Auto}
        fit={Fit.Contain}
        alignment={Alignment.Center}
        style={styles.riveCanvas}
        onError={() => setHasRuntimeError(true)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  riveWrap: {
    width: '100%',
    height: '100%',
    minWidth: 96,
    minHeight: 56,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  riveCanvas: {
    width: '100%',
    height: '100%',
    minWidth: 96,
    minHeight: 56,
  },
});
