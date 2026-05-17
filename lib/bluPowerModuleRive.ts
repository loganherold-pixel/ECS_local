export const BLU_POWER_MODULE_ARTBOARD = 'Desktop - 1';
export const BLU_POWER_MODULE_STATE_MACHINE = 'powermanagement_sm';
export const BLU_POWER_MODULE_VIEW_MODEL = 'PowerWidgetVM';
export const BLU_POWER_MODULE_VIEW_MODEL_INSTANCE = 'Instance';

// blu_power_module.riv exposes zero state-machine inputs. Runtime control is
// through PowerWidgetVM / Instance with these numeric view-model properties.
export const BLU_POWER_MODULE_VIEW_MODEL_NUMERIC_PROPERTIES = [
  'offlinestatusopacity',
  'batteryPercent',
  'leftflowopacity',
  'rightflowopacity',
] as const;

export type BluPowerModuleRuntimeInput = {
  hasEcsData: boolean;
  batteryPercent: number | null | undefined;
  inputWatts: number | null | undefined;
  outputWatts: number | null | undefined;
};

export type BluPowerModuleRuntimeValues = {
  offlinestatusopacity: 0 | 100;
  batteryPercent: number;
  leftflowopacity: 0 | 100;
  rightflowopacity: 0 | 100;
};

function clampPercent(value: number | null | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function activeOpacity(isActive: boolean): 0 | 100 {
  return isActive ? 100 : 0;
}

export function resolveBluPowerModuleRuntime(input: BluPowerModuleRuntimeInput): BluPowerModuleRuntimeValues {
  const batteryPercent = clampPercent(input.batteryPercent);
  const inputWatts = typeof input.inputWatts === 'number' && Number.isFinite(input.inputWatts) ? input.inputWatts : 0;
  const outputWatts = typeof input.outputWatts === 'number' && Number.isFinite(input.outputWatts) ? input.outputWatts : 0;

  return {
    offlinestatusopacity: activeOpacity(!input.hasEcsData),
    batteryPercent,
    // TODO: Flip left/right if visual QA shows this asset's flow direction is reversed.
    leftflowopacity: activeOpacity(input.hasEcsData && inputWatts > 1),
    rightflowopacity: activeOpacity(input.hasEcsData && outputWatts > 1),
  };
}
