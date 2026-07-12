import type { RouteIntelligence } from './routeAnalysisEngine';
import { isRigCompatibilityV2Enabled } from './rigCompatibilityV2Config';
import type { RunSegment } from './segmentRiskEngine';
import type { ActiveVehicleContext } from './vehicle/activeVehicleTypes';
import type { VehicleRouteConstraintEnvelopeResult } from './vehicleRouteConstraintEnvelope';
import { buildVehicleRouteConstraintEnvelopeFromRouteAnalysis } from './vehicleRouteConstraintEnvelopeAdapter';

export interface SelectVehicleRouteConstraintEnvelopeInput {
  routeIntelligence: RouteIntelligence | null;
  vehicleContext: ActiveVehicleContext;
  routeRiskSegments?: readonly RunSegment[] | null;
}

/**
 * Keeps the default-off V2 rollout boundary outside Navigate. Existing V1
 * compatibility consumers are not selected or replaced by this feature.
 */
export function selectVehicleRouteConstraintEnvelope(
  input: SelectVehicleRouteConstraintEnvelopeInput,
): VehicleRouteConstraintEnvelopeResult | null {
  if (!isRigCompatibilityV2Enabled()) return null;
  return buildVehicleRouteConstraintEnvelopeFromRouteAnalysis(
    input.routeIntelligence,
    input.vehicleContext,
    { routeRiskSegments: input.routeRiskSegments ?? null },
  );
}
