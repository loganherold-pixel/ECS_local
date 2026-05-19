import type {
  ExitAccessPlan,
  ExitPoint,
  FuelPlan,
  MedicalAccessPlan,
  RepairAccessPlan,
  ResupplyCategory,
  ResupplyPoint,
  ResupplyRecommendation,
  ResupplyStatus,
  ResupplyWarning,
  SmartResupplyPlan,
  SupplyPlan,
  TripBuilderConfidence,
  TripBuilderCoordinate,
  TripBuilderRouteInput,
  TripBuilderVehicleProfile,
  TripPlan,
  WaterPlan,
} from './tripBuilderTypes';

type BuildSmartResupplyPlanArgs = {
  route: TripBuilderRouteInput;
  tripPlan: TripPlan;
  vehicleProfile?: TripBuilderVehicleProfile | null;
  userLocation?: TripBuilderCoordinate | null;
  resupplyPoints?: ResupplyPoint[] | null;
  availablePoiData?: ResupplyPoint[] | null;
  exitPoints?: ExitPoint[] | null;
  capturedAt?: string;
};

const STATUS_RANK: Record<ResupplyStatus, number> = {
  good: 0,
  medium: 1,
  unknown: 2,
  low: 3,
};

function finiteNumber(value: unknown): number | null {
  const next = typeof value === 'string' ? Number(value) : value;
  return typeof next === 'number' && Number.isFinite(next) ? next : null;
}

function roundTenths(value: number | null): number | null {
  return value == null ? null : Math.round(value * 10) / 10;
}

function normalizeReliability(value: unknown): TripBuilderConfidence {
  if (value === 'high' || value === 'medium' || value === 'low' || value === 'unknown') return value;
  return 'unknown';
}

function statusFromSupportDistance(distanceMiles: number | null): ResupplyStatus {
  if (distanceMiles == null) return 'medium';
  if (distanceMiles <= 5) return 'good';
  if (distanceMiles <= 20) return 'medium';
  return 'low';
}

function toCoordinate(value: Record<string, unknown>): TripBuilderCoordinate | null {
  const latitude = finiteNumber(value.latitude) ?? finiteNumber(value.lat);
  const longitude = finiteNumber(value.longitude) ?? finiteNumber(value.lng) ?? finiteNumber(value.lon);
  if (
    latitude != null &&
    longitude != null &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180
  ) {
    return { latitude, longitude };
  }
  return null;
}

function categoryFromValue(value: unknown): ResupplyCategory | null {
  const normalized = String(value ?? '').toLowerCase().replace(/[\s-]+/g, '_');
  if (normalized === 'fuel' || normalized.includes('gas')) return 'fuel';
  if (normalized === 'water' || normalized.includes('refill')) return 'water';
  if (normalized === 'food_supplies' || normalized === 'supplies' || normalized === 'store' || normalized.includes('grocery')) {
    return 'food_supplies';
  }
  if (normalized === 'repair' || normalized === 'mechanic' || normalized.includes('tire')) return 'repair';
  if (normalized === 'medical' || normalized === 'hospital' || normalized === 'clinic' || normalized.includes('ems')) return 'medical';
  if (normalized === 'exit_access' || normalized === 'exit' || normalized === 'bailout' || normalized.includes('pavement')) return 'exit_access';
  return null;
}

function pointFromWaypoint(waypoint: unknown, index: number): ResupplyPoint | null {
  if (!waypoint || typeof waypoint !== 'object') return null;
  const record = waypoint as Record<string, unknown>;
  const category =
    categoryFromValue(record.category) ??
    categoryFromValue(record.kind) ??
    categoryFromValue(record.waypointType) ??
    categoryFromValue(record.type) ??
    categoryFromValue(record.ecsWaypointType);
  if (!category) return null;

  return {
    id: String(record.id ?? `route-waypoint-resupply-${index + 1}`),
    name: String(record.name ?? record.title ?? `${category.replace(/_/g, ' ')} point`),
    category,
    location: toCoordinate(record),
    routeMileMarker: finiteNumber(record.routeMileMarker) ?? finiteNumber(record.mileMarker),
    distanceFromRouteMiles: finiteNumber(record.distanceFromRouteMiles),
    distanceFromStartMiles: finiteNumber(record.distanceFromStartMiles),
    distanceFromEndMiles: finiteNumber(record.distanceFromEndMiles),
    reliability: normalizeReliability(record.reliability ?? record.confidence),
    source: String(record.source ?? 'route_waypoint'),
    notes: Array.isArray(record.notes) ? record.notes.map(String) : null,
  };
}

function collectResupplyPoints(args: BuildSmartResupplyPlanArgs): ResupplyPoint[] {
  const fromRoute = Array.isArray(args.route.waypoints)
    ? args.route.waypoints.map(pointFromWaypoint).filter((point): point is ResupplyPoint => point != null)
    : [];
  const supplied = [...(args.resupplyPoints ?? []), ...(args.availablePoiData ?? [])];
  const seen = new Set<string>();
  return [...fromRoute, ...supplied].filter((point) => {
    const key = `${point.category}:${point.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function byNearestDistance(left: ResupplyPoint, right: ResupplyPoint): number {
  const leftDistance =
    finiteNumber(left.distanceFromRouteMiles) ??
    finiteNumber(left.distanceFromStartMiles) ??
    finiteNumber(left.distanceFromEndMiles) ??
    finiteNumber(left.routeMileMarker) ??
    Number.POSITIVE_INFINITY;
  const rightDistance =
    finiteNumber(right.distanceFromRouteMiles) ??
    finiteNumber(right.distanceFromStartMiles) ??
    finiteNumber(right.distanceFromEndMiles) ??
    finiteNumber(right.routeMileMarker) ??
    Number.POSITIVE_INFINITY;
  return leftDistance - rightDistance;
}

function nearestPoint(points: ResupplyPoint[]): ResupplyPoint | null {
  return [...points].sort(byNearestDistance)[0] ?? null;
}

function addWarning(
  warnings: ResupplyWarning[],
  category: ResupplyCategory,
  id: string,
  message: string,
  severity: ResupplyWarning['severity'] = 'watch',
): void {
  warnings.push({ id, category, message, severity });
}

function recommendation(category: ResupplyCategory, id: string, message: string, pointId?: string | null): ResupplyRecommendation {
  return { id, category, message, pointId };
}

function buildFuelPlan(args: BuildSmartResupplyPlanArgs, fuelPoints: ResupplyPoint[]): FuelPlan {
  const warnings: ResupplyWarning[] = [];
  const recommendations: ResupplyRecommendation[] = [];
  const routeDistance = args.tripPlan.route.distanceMiles;
  const remoteness = finiteNumber(args.route.remotenessScore) ?? args.tripPlan.route.remotenessScore;
  const remoteMultiplier = remoteness != null && remoteness >= 7 ? 1.3 : 1.15;
  const estimatedMinimumRangeMiles = routeDistance == null ? null : roundTenths(routeDistance * remoteMultiplier);
  const vehicleRangeMiles = finiteNumber(args.vehicleProfile?.rangeMiles);
  const rangeMarginMiles =
    vehicleRangeMiles != null && estimatedMinimumRangeMiles != null
      ? roundTenths(vehicleRangeMiles - estimatedMinimumRangeMiles)
      : null;

  const routeEnd = routeDistance ?? Number.POSITIVE_INFINITY;
  const nearestFuelBeforeStart =
    fuelPoints
      .filter((point) => (point.routeMileMarker ?? 0) <= 0 || point.distanceFromStartMiles != null)
      .sort(byNearestDistance)[0] ??
    nearestPoint(fuelPoints);
  const lastReliableFuelBeforeRemoteSection =
    fuelPoints
      .filter((point) => {
        const mile = finiteNumber(point.routeMileMarker);
        return mile != null && (routeDistance == null || mile <= routeDistance * 0.4);
      })
      .sort((left, right) => (right.routeMileMarker ?? 0) - (left.routeMileMarker ?? 0))[0] ??
    null;
  const nearestFuelAfterExit =
    fuelPoints
      .filter((point) => (point.routeMileMarker ?? -1) >= routeEnd || point.distanceFromEndMiles != null)
      .sort(byNearestDistance)[0] ??
    null;

  let status: ResupplyStatus = 'unknown';
  if (vehicleRangeMiles == null || estimatedMinimumRangeMiles == null) {
    addWarning(warnings, 'fuel', 'fuel-range-unknown', 'Vehicle fuel range or route distance data unavailable. Verify before departure.', 'caution');
  } else if (rangeMarginMiles != null && rangeMarginMiles < 0) {
    status = 'low';
    addWarning(warnings, 'fuel', 'fuel-range-deficit', 'Estimated route demand appears above vehicle range. Verify before departure.', 'critical');
  } else if (rangeMarginMiles != null && rangeMarginMiles < estimatedMinimumRangeMiles * 0.1) {
    status = 'low';
    addWarning(warnings, 'fuel', 'fuel-range-tight', 'Fuel range margin appears tight. Verify before departure.', 'caution');
  } else if (fuelPoints.length === 0) {
    status = 'medium';
    addWarning(warnings, 'fuel', 'fuel-points-unknown', 'No known fuel source detected for this route.', 'watch');
  } else if (rangeMarginMiles != null && rangeMarginMiles >= estimatedMinimumRangeMiles * 0.25) {
    status = 'good';
  } else {
    status = 'medium';
  }

  const point = nearestFuelBeforeStart ?? nearestFuelAfterExit ?? lastReliableFuelBeforeRemoteSection;
  recommendations.push(recommendation(
    'fuel',
    'fuel-primary',
    point
      ? `${point.name} is the known fuel reference. Verify availability before departure.`
      : 'No known fuel source detected. Verify before departure.',
    point?.id,
  ));

  return {
    category: 'fuel',
    status,
    confidence: fuelPoints.length > 0 && vehicleRangeMiles != null ? 'medium' : 'unknown',
    primaryRecommendation: recommendations[0].message,
    keyPoint: point ?? null,
    keyDistanceMiles: roundTenths(point?.distanceFromRouteMiles ?? point?.distanceFromStartMiles ?? point?.distanceFromEndMiles ?? null),
    warnings,
    recommendations,
    estimatedMinimumRangeMiles,
    vehicleRangeMiles,
    rangeMarginMiles,
    nearestFuelBeforeStart: nearestFuelBeforeStart ?? null,
    lastReliableFuelBeforeRemoteSection,
    nearestFuelAfterExit,
  };
}

function buildPointBackedPlan<TCategory extends 'water' | 'food_supplies' | 'repair' | 'medical'>(
  category: TCategory,
  points: ResupplyPoint[],
  labels: { missing: string; action: string },
): ResupplyCategoryPlanFor<TCategory> {
  const warnings: ResupplyWarning[] = [];
  const point = nearestPoint(points);
  const status: ResupplyStatus = points.length === 0 ? 'unknown' : statusFromSupportDistance(point?.distanceFromRouteMiles ?? null);
  if (!point) addWarning(warnings, category, `${category}-unknown`, labels.missing, 'watch');
  const recommendations = [
    recommendation(category, `${category}-primary`, point ? `${labels.action}: ${point.name}.` : labels.missing, point?.id),
  ];
  return {
    category,
    status,
    confidence: point ? normalizeReliability(point.reliability) || 'medium' : 'unknown',
    primaryRecommendation: recommendations[0].message,
    keyPoint: point,
    keyDistanceMiles: roundTenths(point?.distanceFromRouteMiles ?? point?.distanceFromStartMiles ?? point?.distanceFromEndMiles ?? null),
    warnings,
    recommendations,
  } as ResupplyCategoryPlanFor<TCategory>;
}

type ResupplyCategoryPlanFor<TCategory extends 'water' | 'food_supplies' | 'repair' | 'medical'> =
  TCategory extends 'water' ? WaterPlan :
  TCategory extends 'food_supplies' ? SupplyPlan :
  TCategory extends 'repair' ? RepairAccessPlan :
  MedicalAccessPlan;

function buildExitAccessPlan(exitPoints: ExitPoint[] | null | undefined, routeDistanceMiles: number | null): ExitAccessPlan {
  const exits = [...(exitPoints ?? [])];
  const primaryExitPoint = exits.sort((left, right) => {
    const priorityDelta = (finiteNumber(right.priority) ?? 0) - (finiteNumber(left.priority) ?? 0);
    if (priorityDelta !== 0) return priorityDelta;
    return (finiteNumber(left.distanceFromRouteMiles) ?? Number.POSITIVE_INFINITY) -
      (finiteNumber(right.distanceFromRouteMiles) ?? Number.POSITIVE_INFINITY);
  })[0] ?? null;
  const warnings: ResupplyWarning[] = [];
  let status: ResupplyStatus = 'unknown';
  if (exits.length === 0) {
    addWarning(warnings, 'exit_access', 'exit-access-unknown', 'Exit access data unavailable. Verify before departure.', 'caution');
  } else {
    const distance = finiteNumber(primaryExitPoint?.distanceFromRouteMiles);
    status = distance == null ? 'medium' : distance <= 5 ? 'good' : distance <= 20 ? 'medium' : 'low';
    if (status === 'low') {
      addWarning(warnings, 'exit_access', 'exit-access-distant', 'Known exit access appears distant. Verify before departure.', 'caution');
    }
  }
  const recommendations = [
    recommendation(
      'exit_access',
      'exit-access-primary',
      primaryExitPoint
        ? `Primary known exit: ${primaryExitPoint.name}. Verify before departure.`
        : routeDistanceMiles == null
          ? 'Route distance and exit data unavailable. Verify before departure.'
          : 'No known exit source detected. Verify before departure.',
      primaryExitPoint?.id,
    ),
  ];
  return {
    category: 'exit_access',
    status,
    confidence: exits.length > 0 ? 'medium' : 'unknown',
    primaryRecommendation: recommendations[0].message,
    keyPoint: primaryExitPoint
      ? {
          id: primaryExitPoint.id,
          name: primaryExitPoint.name,
          category: 'exit_access',
          location: primaryExitPoint.location ?? null,
          routeMileMarker: primaryExitPoint.routeMileMarker ?? null,
          distanceFromRouteMiles: primaryExitPoint.distanceFromRouteMiles ?? null,
          source: primaryExitPoint.source ?? 'exit_point',
          notes: primaryExitPoint.notes ?? null,
        }
      : null,
    keyDistanceMiles: roundTenths(primaryExitPoint?.distanceFromRouteMiles ?? null),
    warnings,
    recommendations,
    knownExitCount: exits.length,
    primaryExitPoint,
  };
}

function attachKnownPoints<T extends WaterPlan | SupplyPlan | RepairAccessPlan | MedicalAccessPlan>(
  plan: T,
  points: ResupplyPoint[],
): T {
  if (plan.category === 'water') return { ...plan, knownWaterRefillPoints: points } as T;
  if (plan.category === 'food_supplies') return { ...plan, knownSupplyPoints: points } as T;
  if (plan.category === 'repair') return { ...plan, knownRepairPoints: points, nearestPavedExit: null } as T;
  return { ...plan, knownMedicalPoints: points } as T;
}

function worstStatus(plans: { status: ResupplyStatus }[]): ResupplyStatus {
  return plans.reduce<ResupplyStatus>((worst, plan) => (
    STATUS_RANK[plan.status] > STATUS_RANK[worst] ? plan.status : worst
  ), 'good');
}

export function buildSmartResupplyPlan(args: BuildSmartResupplyPlanArgs): SmartResupplyPlan {
  const generatedAt = args.capturedAt ?? args.tripPlan.generatedAt;
  const points = collectResupplyPoints(args);
  const byCategory = (category: ResupplyCategory) => points.filter((point) => point.category === category);
  const fuel = buildFuelPlan(args, byCategory('fuel'));
  const water = attachKnownPoints(buildPointBackedPlan('water', byCategory('water'), {
    missing: 'No known water source detected.',
    action: 'Known water refill point',
  }), byCategory('water'));
  const supplies = attachKnownPoints(buildPointBackedPlan('food_supplies', byCategory('food_supplies'), {
    missing: 'No known food or supply source detected.',
    action: 'Known supply point',
  }), byCategory('food_supplies'));
  const repair = attachKnownPoints(buildPointBackedPlan('repair', byCategory('repair'), {
    missing: 'No known repair source detected.',
    action: 'Known repair support',
  }), byCategory('repair'));
  const medical = attachKnownPoints(buildPointBackedPlan('medical', byCategory('medical'), {
    missing: 'No known medical source detected.',
    action: 'Known medical support',
  }), byCategory('medical'));
  const exitAccess = buildExitAccessPlan(args.exitPoints, args.tripPlan.route.distanceMiles);
  const repairWithExit = {
    ...repair,
    nearestPavedExit: args.exitPoints?.find((point) => String(point.type ?? '').toLowerCase().includes('pav')) ?? exitAccess.primaryExitPoint,
  };

  const plans = [fuel, water, supplies, repairWithExit, medical, exitAccess];
  return {
    generatedAt,
    sourceSummary: [
      points.length > 0 ? `${points.length} route or POI support point${points.length === 1 ? '' : 's'}` : 'No route/POI support points supplied',
      args.vehicleProfile ? 'vehicle range profile' : 'vehicle range data unavailable',
      args.exitPoints && args.exitPoints.length > 0 ? `${args.exitPoints.length} exit point${args.exitPoints.length === 1 ? '' : 's'}` : 'exit access data unavailable',
    ],
    fuel,
    water,
    supplies,
    repair: repairWithExit,
    medical,
    exitAccess,
    overallStatus: worstStatus(plans),
    warnings: plans.flatMap((plan) => plan.warnings),
    recommendations: plans.flatMap((plan) => plan.recommendations),
  };
}
