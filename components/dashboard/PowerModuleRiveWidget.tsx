'use client';

import React, { useEffect, useMemo } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import {
  Alignment,
  Fit,
  Layout,
  useRive,
  useViewModel,
  useViewModelInstance,
  useViewModelInstanceNumber,
} from '@rive-app/react-webgl2';

import {
  BLU_POWER_MODULE_ARTBOARD,
  BLU_POWER_MODULE_STATE_MACHINE,
  BLU_POWER_MODULE_VIEW_MODEL,
  BLU_POWER_MODULE_VIEW_MODEL_INSTANCE,
} from '../../lib/bluPowerModuleRive';
import BluPowerModuleFallback, { type PowerModuleRiveWidgetProps } from './BluPowerModuleFallback';

// Metro needs a static asset reference so web builds can serve the .riv file
// from the bundled asset graph instead of relying only on public/rive.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const BLU_POWER_MODULE_ASSET = require('../../assets/power/blu_power_module.riv');
const PUBLIC_RIVE_SRC = '/rive/blu_power_module.riv';
const riveCanvasStyle: React.CSSProperties = {
  width: '100%',
  height: '100%',
  display: 'block',
};

function clampPercent(value: unknown): number {
  const n = typeof value === 'number' && Number.isFinite(value) ? value : 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function activeWatts(value: unknown): boolean {
  return typeof value === 'number' && Number.isFinite(value) && value > 1;
}

function getBundledRiveSrc(): string {
  const resolved = Image.resolveAssetSource(BLU_POWER_MODULE_ASSET);
  return typeof resolved?.uri === 'string' && resolved.uri.trim()
    ? resolved.uri
    : PUBLIC_RIVE_SRC;
}

export default function PowerModuleRiveWidget({
  hasEcsData,
  batteryPercent,
  inputWatts,
  outputWatts,
  style,
  testID,
}: PowerModuleRiveWidgetProps) {
  const layout = useMemo(
    () => new Layout({
      fit: Fit.Contain,
      alignment: Alignment.Center,
    }),
    [],
  );
  const riveSrc = useMemo(() => getBundledRiveSrc(), []);
  const [loadFailed, setLoadFailed] = React.useState(false);
  const [loaded, setLoaded] = React.useState(false);
  const { rive, RiveComponent } = useRive({
    src: riveSrc,
    artboard: BLU_POWER_MODULE_ARTBOARD,
    stateMachines: BLU_POWER_MODULE_STATE_MACHINE,
    autoplay: true,
    autoBind: true,
    layout,
    onLoad: () => setLoaded(true),
    onLoadError: () => setLoadFailed(true),
  });
  const viewModel = useViewModel(rive, { name: BLU_POWER_MODULE_VIEW_MODEL });
  const viewModelInstance = useViewModelInstance(viewModel, {
    name: BLU_POWER_MODULE_VIEW_MODEL_INSTANCE,
    rive,
  });
  const offlineStatusOpacity = useViewModelInstanceNumber('offlinestatusopacity', viewModelInstance);
  const boundBatteryPercent = useViewModelInstanceNumber('batteryPercent', viewModelInstance);
  const leftFlowOpacity = useViewModelInstanceNumber('leftflowopacity', viewModelInstance);
  const rightFlowOpacity = useViewModelInstanceNumber('rightflowopacity', viewModelInstance);

  useEffect(() => {
    if (!viewModelInstance) return;

    offlineStatusOpacity.setValue(hasEcsData ? 0 : 100);
    boundBatteryPercent.setValue(clampPercent(batteryPercent));
    // TODO: Flip left/right if visual QA shows this asset's flow direction is reversed.
    leftFlowOpacity.setValue(hasEcsData && activeWatts(inputWatts) ? 100 : 0);
    rightFlowOpacity.setValue(hasEcsData && activeWatts(outputWatts) ? 100 : 0);
  }, [
    batteryPercent,
    boundBatteryPercent,
    hasEcsData,
    inputWatts,
    leftFlowOpacity,
    offlineStatusOpacity,
    outputWatts,
    rightFlowOpacity,
    viewModelInstance,
  ]);

  if (loadFailed) {
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
      {!loaded ? (
        <BluPowerModuleFallback
          hasEcsData={hasEcsData}
          batteryPercent={batteryPercent}
          inputWatts={inputWatts}
          outputWatts={outputWatts}
          style={styles.loadingFallback}
          testID={testID ? `${testID}-loading-fallback` : undefined}
        />
      ) : null}
      <RiveComponent style={riveCanvasStyle} />
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
  loadingFallback: {
    ...StyleSheet.absoluteFillObject,
  },
});

export type { PowerModuleRiveWidgetProps } from './BluPowerModuleFallback';
