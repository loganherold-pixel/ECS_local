import { useEffect, useMemo, useState } from 'react';

import {
  getActiveVehicleState,
  getVehicleCapabilitySnapshot,
  getVehicleWeightSnapshot,
  subscribeActiveVehicleState,
  type ECSVehicleCapabilitySnapshot,
  type ECSVehicleIntelligenceSnapshot,
  type ECSVehicleWeightSnapshot,
  type ECSVehicularState,
} from './fleet/activeVehicleState';

export function useActiveVehicleState(vehicleId?: string | null): ECSVehicularState {
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let mounted = true;
    const unsubscribe = subscribeActiveVehicleState(() => {
      if (mounted) {
        setRevision((value) => value + 1);
      }
    });

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  return useMemo(() => {
    void revision;
    return getActiveVehicleState(vehicleId);
  }, [revision, vehicleId]);
}

export function useVehicleWeightSnapshot(vehicleId?: string | null): ECSVehicleWeightSnapshot {
  return useActiveVehicleState(vehicleId).weight;
}

export function useVehicleCapabilitySnapshot(vehicleId?: string | null): ECSVehicleCapabilitySnapshot {
  return useActiveVehicleState(vehicleId).capability;
}

export function useVehicleIntelligenceSnapshot(vehicleId?: string | null): ECSVehicleIntelligenceSnapshot {
  return useActiveVehicleState(vehicleId).intelligence;
}

export {
  getActiveVehicleState,
  getVehicleCapabilitySnapshot,
  getVehicleWeightSnapshot,
  subscribeActiveVehicleState,
} from './fleet/activeVehicleState';
export type {
  ECSVehicleCapabilitySnapshot,
  ECSVehicleCenterOfGravitySnapshot,
  ECSVehicleConfidenceLabel,
  ECSVehicleIdentitySnapshot,
  ECSVehicleIntelligenceSnapshot,
  ECSVehicleLoadoutSnapshot,
  ECSVehicleModificationSnapshot,
  ECSVehicularState,
  ECSVehicularStateStatus,
  ECSVehicleWeightSnapshot,
} from './fleet/activeVehicleState';
