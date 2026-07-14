import { NativeModules, Platform } from 'react-native';
import { androidAutoBridge } from '../androidAutoBridge';
import { carPlayBridge } from '../carPlayBridge';
import { vehicleCompanionManager } from '../vehicleCompanionManager';
import { vehicleDisplayModeEngine } from '../vehicleDisplayModeEngine';
import { vehicleDisplayStore } from '../vehicleDisplayStore';
import {
  shouldStartAutomotiveFeature,
  type ECSAutomotiveFeatureId,
} from './automotiveFeatureAccess';

export type ECSAutomotiveRuntimeOwner = 'shell' | 'vehicle_display_route';

const owners = new Map<ECSAutomotiveRuntimeOwner, number>();
let coreRunning = false;
let bridgeRuntimeRunning = false;
let bridgeUnsubscribers: Array<() => void> = [];

function capabilityInput() {
  return {
    platform: Platform.OS,
    androidAutoNativeAvailable: Boolean(NativeModules.ECSAndroidAuto),
    carPlayNativeAvailable: Boolean(NativeModules.ECSCarPlay),
  };
}

function enabled(featureId: ECSAutomotiveFeatureId): boolean {
  return shouldStartAutomotiveFeature(featureId, capabilityInput());
}

function ownerIsEligible(owner: ECSAutomotiveRuntimeOwner): boolean {
  if (owner === 'vehicle_display_route') return enabled('automotive_vehicle_display');
  return enabled('android_auto_bridge') || enabled('carplay_bridge');
}

function startCore(): void {
  if (coreRunning) return;
  coreRunning = true;
  vehicleDisplayStore.start();
  vehicleDisplayModeEngine.start();
  vehicleCompanionManager.start();
}

function stopCore(): void {
  if (!coreRunning) return;
  coreRunning = false;
  vehicleCompanionManager.stop();
  vehicleDisplayModeEngine.stop();
  vehicleDisplayStore.stop();
}

function shouldRunCore(): boolean {
  return (
    owners.has('vehicle_display_route') ||
    androidAutoBridge.getStatus().isConnected ||
    carPlayBridge.getStatus().isConnected
  );
}

function reconcileCore(): void {
  if (shouldRunCore()) startCore();
  else stopCore();
}

function startBridges(): void {
  if (bridgeRuntimeRunning) return;
  bridgeRuntimeRunning = true;
  bridgeUnsubscribers = [
    androidAutoBridge.subscribe(reconcileCore),
    carPlayBridge.subscribe(reconcileCore),
  ];
  if (enabled('android_auto_bridge')) androidAutoBridge.start();
  if (enabled('carplay_bridge')) carPlayBridge.start();
  reconcileCore();
}

function stopBridges(): void {
  if (!bridgeRuntimeRunning) {
    stopCore();
    return;
  }
  bridgeRuntimeRunning = false;
  bridgeUnsubscribers.forEach((unsubscribe) => unsubscribe());
  bridgeUnsubscribers = [];
  androidAutoBridge.stop();
  carPlayBridge.stop();
  stopCore();
}

export const automotiveRuntimeCoordinator = {
  acquire(owner: ECSAutomotiveRuntimeOwner): () => void {
    if (!ownerIsEligible(owner)) return () => {};
    owners.set(owner, (owners.get(owner) ?? 0) + 1);
    let released = false;
    startBridges();
    reconcileCore();
    return () => {
      if (released) return;
      released = true;
      const remaining = (owners.get(owner) ?? 1) - 1;
      if (remaining > 0) owners.set(owner, remaining);
      else owners.delete(owner);
      if (owners.size === 0) stopBridges();
      else reconcileCore();
    };
  },

  getStatus() {
    return {
      running: coreRunning,
      bridgeRuntimeRunning,
      owners: Array.from(owners.keys()),
      androidAuto: androidAutoBridge.getStatus(),
      carPlay: carPlayBridge.getStatus(),
    };
  },

  async clearNativeState(): Promise<void> {
    await Promise.allSettled([
      androidAutoBridge.clearAll(),
      carPlayBridge.clearAll(),
    ]);
  },

  resetForTests(): void {
    owners.clear();
    stopBridges();
  },
};
