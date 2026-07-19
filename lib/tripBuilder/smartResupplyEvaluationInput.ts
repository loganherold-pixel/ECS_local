import { MAPBOX_ROAD_NAVIGATION_DIRECTIONS_PROFILE } from '../mapboxRoadNavigationPolicy';
import { buildApproachResupplyRouteFingerprint } from './approachResupplyPlanner';
import type { GeoPoint } from './tripBuilderTypes';

export type SmartResupplyEvaluationCategory = 'fuel' | 'food_supplies';

export type SmartResupplyEvaluationInputStatus =
  | 'missing_origin'
  | 'missing_prepared_entry'
  | 'awaiting_approach'
  | 'ready';

export const SMART_RESUPPLY_QUERY_VARIANTS = Object.freeze({
  fuel: ['gas station', 'fuel station', 'truck stop'] as const,
  food_supplies: ['grocery store', 'supermarket', 'convenience store', 'general store'] as const,
});

export const SMART_RESUPPLY_PROVIDER_POLICY = Object.freeze({
  optionLimit: 3,
  searchBoxLimit: 10,
  searchRadiusMiles: 10,
  maxApproachWindows: 12,
  lookupTimeoutMs: 20_000,
  retrieveTimeoutMs: 2_200,
  suggestRequestBudget: 48,
  retrieveRequestBudget: 32,
  accessValidationConcurrency: 4,
  directionsProfile: MAPBOX_ROAD_NAVIGATION_DIRECTIONS_PROFILE,
});

export type PrepareSmartResupplyEvaluationInputArgs = {
  routeId: string | null | undefined;
  category: SmartResupplyEvaluationCategory;
  itineraryOrigin?: GeoPoint | null;
  handoffOrigin?: GeoPoint | null;
  currentGpsOrigin?: GeoPoint | null;
  preparedTrailheadStart?: GeoPoint | null;
  approachGeometry?: readonly GeoPoint[] | null;
};

export type PreparedSmartResupplyEvaluationInput = {
  status: SmartResupplyEvaluationInputStatus;
  routeId: string;
  category: SmartResupplyEvaluationCategory;
  origin: GeoPoint | null;
  trailheadStart: GeoPoint | null;
  approachGeometry: GeoPoint[];
  endpointFingerprint: string | null;
  approachGeometryFingerprint: string;
  queryVariants: readonly string[];
  policy: typeof SMART_RESUPPLY_PROVIDER_POLICY;
};

export type SmartResupplySelectionRequirementArgs = {
  preference: 'fuel_only' | 'fuel_supplies' | 'no';
  pending: boolean;
  missingCategories: readonly SmartResupplyEvaluationCategory[];
};

function finiteCoordinate(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function normalizeSmartResupplyCoordinate(value: GeoPoint | null | undefined): GeoPoint | null {
  if (!value) return null;
  const latitude = finiteCoordinate(value.latitude);
  const longitude = finiteCoordinate(value.longitude);
  if (
    latitude == null ||
    longitude == null ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) return null;
  return {
    ...value,
    latitude,
    longitude,
  };
}

export function resolveSmartResupplyEvaluationOrigin(
  args: Pick<
    PrepareSmartResupplyEvaluationInputArgs,
    'itineraryOrigin' | 'handoffOrigin' | 'currentGpsOrigin'
  >,
): GeoPoint | null {
  return normalizeSmartResupplyCoordinate(args.itineraryOrigin) ??
    normalizeSmartResupplyCoordinate(args.handoffOrigin) ??
    normalizeSmartResupplyCoordinate(args.currentGpsOrigin);
}

function endpointCoordinateFingerprint(point: GeoPoint): string {
  return `${point.latitude.toFixed(3)},${point.longitude.toFixed(3)}`;
}

export function prepareSmartResupplyEvaluationInput(
  args: PrepareSmartResupplyEvaluationInputArgs,
): PreparedSmartResupplyEvaluationInput {
  const routeId = String(args.routeId ?? 'selected-route').trim() || 'selected-route';
  const origin = resolveSmartResupplyEvaluationOrigin(args);
  const trailheadStart = normalizeSmartResupplyCoordinate(args.preparedTrailheadStart);
  const approachGeometry = (args.approachGeometry ?? [])
    .map(normalizeSmartResupplyCoordinate)
    .filter((point): point is GeoPoint => point != null);
  const endpointFingerprint = origin && trailheadStart
    ? [
        routeId,
        endpointCoordinateFingerprint(origin),
        endpointCoordinateFingerprint(trailheadStart),
      ].join(':')
    : null;
  const approachGeometryFingerprint = buildApproachResupplyRouteFingerprint(approachGeometry);
  const status: SmartResupplyEvaluationInputStatus = !origin
    ? 'missing_origin'
    : !trailheadStart
      ? 'missing_prepared_entry'
      : approachGeometry.length < 2
        ? 'awaiting_approach'
        : 'ready';

  return {
    status,
    routeId,
    category: args.category,
    origin,
    trailheadStart,
    approachGeometry,
    endpointFingerprint,
    approachGeometryFingerprint,
    queryVariants: SMART_RESUPPLY_QUERY_VARIANTS[args.category],
    policy: SMART_RESUPPLY_PROVIDER_POLICY,
  };
}

export function smartResupplySelectionDisabledReason(
  args: SmartResupplySelectionRequirementArgs,
): string | null {
  if (args.pending) return 'Smart Resupply is still refreshing route evidence.';
  if (args.preference === 'no' || args.missingCategories.length === 0) return null;
  if (args.missingCategories.includes('fuel')) return 'Select a fuel stop or choose No for Smart Resupply.';
  return 'Select a grocery or supply stop, change the category, or choose No for Smart Resupply.';
}
