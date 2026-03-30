import { supabase } from './supabase';
import { unpackZonesRpcResult } from './supabase';
import type { VehicleZoneTreeNode, VehicleZone } from './types';

export async function fetchVehicleZones(vehicleId: string): Promise<{
  tree: VehicleZoneTreeNode[];
  flat: VehicleZone[];
}> {
  const { data, error } = await supabase.functions.invoke(
    'get-vehicle-zones',
    {
      body: { vehicle_id: vehicleId },
    }
  );

  if (error) {
    console.error('Edge function error:', error);
    throw error;
  }

  const result = unpackZonesRpcResult(data);
  if (!result) {
    throw new Error('Unexpected zones response shape');
  }

  return {
    tree: result.tree_json,
    flat: result.zones_flat,
  };
}

