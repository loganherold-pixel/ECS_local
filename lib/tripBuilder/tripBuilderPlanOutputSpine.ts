import type { RoadNavRoute } from '../mapboxRoadNavigation';
import {
  buildTripBuilderCanonicalRouteSpine,
  type TripBuilderCanonicalRouteSpine,
} from './tripBuilderCanonicalRouteSpine';
import type { TripBuilderRouteInput } from './tripBuilderTypes';

export type TripBuilderPlanOutputSpineSource =
  | 'prepared_road_route'
  | 'fallback_approach'
  | 'canonical_trail';

export type TripBuilderPlanOutputSpine = TripBuilderCanonicalRouteSpine & {
  source: TripBuilderPlanOutputSpineSource;
  approachSafeCode: TripBuilderCanonicalRouteSpine['safeCode'] | null;
};

export type BuildTripBuilderPlanOutputSpineInput = {
  route: TripBuilderRouteInput | Record<string, unknown>;
  origin?: unknown;
  trailhead?: unknown;
  trailEnd?: unknown;
  preparedRoadRoute?: RoadNavRoute | null;
  fallbackApproachGeometry?: unknown;
};

/**
 * Builds the one route spine shared by Trip Builder's Offline, Save, and
 * Navigate outputs. Provider road geometry is preferred because it retains
 * the selected resupply order. A disconnected approach is never bridged by a
 * fabricated straight line; the canonical trail remains available with the
 * rejected approach safe code attached for truthful degraded presentation.
 */
export function buildTripBuilderPlanOutputSpine(
  input: BuildTripBuilderPlanOutputSpineInput,
): TripBuilderPlanOutputSpine {
  const preparedApproach = input.preparedRoadRoute?.geometry;
  const hasPreparedApproach = Array.isArray(preparedApproach) && preparedApproach.length >= 2;
  const fallbackApproach = hasPreparedApproach ? null : input.fallbackApproachGeometry;
  const hasFallbackApproach = Array.isArray(fallbackApproach) && fallbackApproach.length >= 2;
  const approachGeometry = hasPreparedApproach ? preparedApproach : fallbackApproach;

  const composed = buildTripBuilderCanonicalRouteSpine({
    route: input.route,
    origin: input.origin,
    approachGeometry,
    trailhead: input.trailhead,
    trailEnd: input.trailEnd,
    includeApproach: true,
  });
  if (composed.lineString) {
    return {
      ...composed,
      source: hasPreparedApproach
        ? 'prepared_road_route'
        : hasFallbackApproach
          ? 'fallback_approach'
          : 'canonical_trail',
      approachSafeCode: null,
    };
  }

  const trailOnly = buildTripBuilderCanonicalRouteSpine({
    route: input.route,
    trailhead: input.trailhead,
    trailEnd: input.trailEnd,
    includeApproach: false,
  });
  return {
    ...trailOnly,
    source: 'canonical_trail',
    approachSafeCode: approachGeometry ? composed.safeCode : null,
  };
}
