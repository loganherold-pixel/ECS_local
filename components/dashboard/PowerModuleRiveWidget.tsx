'use client';

import React, { useEffect, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
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
import type { PowerModuleRiveWidgetProps } from './BluPowerModuleFallback';

const RIVE_SRC = '/rive/blu_power_module.riv';
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
  const { rive, RiveComponent } = useRive({
    src: RIVE_SRC,
    artboard: BLU_POWER_MODULE_ARTBOARD,
    stateMachines: BLU_POWER_MODULE_STATE_MACHINE,
    autoplay: true,
    autoBind: true,
    layout,
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

  return (
    <View testID={testID} style={[styles.riveWrap, style]}>
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
});

export type { PowerModuleRiveWidgetProps } from './BluPowerModuleFallback';
