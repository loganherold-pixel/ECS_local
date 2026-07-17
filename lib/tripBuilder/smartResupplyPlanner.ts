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
import { normalizeResupplyPlaceIdentity } from './resupplyPlaceIdentity';
import { APPROACH_RESUPPLY_POLICY } from './approachResupplyPlanner';

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

function isPositive(value: unknown): boolean {
  const numberValue = finiteNumber(value);
  if (numberValue != null) return numberValue > 0;
  return value === true;
}

function sourceLabel(value: unknown, fallback: string): string {
  const text = String(value ?? '').trim();
  return text || fallback;
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
    selectionState: 'route_waypoint',
    notes: Array.isArray(record.notes) ? record.notes.map(String) : null,
  };
}

function collectResupplyPoints(args: BuildSmartResupplyPlanArgs): ResupplyPoint[] {
  const fromRoute = Array.isArray(args.route.waypoints)
    ? args.route.waypoints.map(pointFromWaypoint).filter((point): point is ResupplyPoint => point != null)
    : [];
  const supplied = [...(args.resupplyPoints ?? []), ...(args.availablePoiData ?? [])];
  const merged = new Map<string, ResupplyPoint>();
  [...fromRoute, ...supplied].forEach((point) => {
    const key = normalizeResupplyPlaceIdentity(point.placeIdentity) ?? `${point.category}:${point.id}`;
    const current = merged.get(key);
    if (!current) {
      merged.set(key, point);
      return;
    }
    const preferred = compareOperationalApproachPoints(point, current) < 0 ? point : current;
    merged.set(key, {
      ...preferred,
      accessStatus: [current.accessStatus, point.accessStatus].includes('inaccessible')
        ? 'inaccessible'
        : [current.accessStatus, point.accessStatus].includes('accessible')
          ? 'accessible'
          : 'unknown',
      approachEvidence: mergeApproachEvidenceConservatively(
        preferred.approachEvidence,
        current.approachEvidence,
        point.approachEvidence,
      ),
      categoryCoverage: Array.from(new Set([
        ...(current.categoryCoverage ?? [current.category]).filter((category): category is 'fuel' | 'food_supplies' => category === 'fuel' || category === 'food_supplies'),
        ...(point.categoryCoverage ?? [point.category]).filter((category): category is 'fuel' | 'food_supplies' => category === 'fuel' || category === 'food_supplies'),
      ])),
    });
  });
  return Array.from(merged.values());
}

function mergeApproachEvidenceConservatively(
  preferred: ResupplyPoint['approachEvidence'],
  left: ResupplyPoint['approachEvidence'],
  right: ResupplyPoint['approachEvidence'],
): ResupplyPoint['approachEvidence'] {
  const evidence = [left, right].filter((item): item is NonNullable<ResupplyPoint['approachEvidence']> => !!item);
  const base = preferred ?? evidence[0] ?? null;
  if (!base) return null;
  const trailRejectEvidence = evidence.find((item) => item.beforeTrailhead === false) ?? null;
  const remoteRejectEvidence = evidence.find((item) => item.beforeRemoteEntry === false) ?? null;
  const operatingEvidence = evidence.find((item) => item.operatingStatus === 'closed') ??
    evidence.find((item) => item.operatingStatus === 'temporarily_closed') ??
    base;
  const detourEvidence = evidence.reduce<NonNullable<ResupplyPoint['approachEvidence']> | null>((worst, item) => {
    if (item.detourDistanceMiles == null || !Number.isFinite(item.detourDistanceMiles)) return worst;
    if (worst?.detourDistanceMiles == null || item.detourDistanceMiles > worst.detourDistanceMiles) return item;
    return worst;
  }, null) ?? base;
  const boundaryEvidence = remoteRejectEvidence ?? trailRejectEvidence ?? base;
  const confidenceOrder: Record<TripBuilderConfidence, number> = {
    unknown: 0,
    low: 1,
    medium: 2,
    high: 3,
  };
  const routeAwareConfidence = evidence.reduce<TripBuilderConfidence>(
    (lowest, item) => confidenceOrder[item.routeAwareConfidence] < confidenceOrder[lowest]
      ? item.routeAwareConfidence
      : lowest,
    base.routeAwareConfidence,
  );
  return {
    ...base,
    progressRatio: boundaryEvidence.progressRatio,
    distanceFromOriginMiles: boundaryEvidence.distanceFromOriginMiles,
    distanceBeforeTrailheadMiles: trailRejectEvidence?.distanceBeforeTrailheadMiles ?? base.distanceBeforeTrailheadMiles,
    distanceBeforeRemoteEntryMiles: remoteRejectEvidence?.distanceBeforeRemoteEntryMiles ?? base.distanceBeforeRemoteEntryMiles,
    corridorOffsetMiles: detourEvidence.corridorOffsetMiles,
    detourDistanceMiles: detourEvidence.detourDistanceMiles,
    detourDurationMinutes: detourEvidence.detourDurationMinutes,
    detourSource: detourEvidence.detourSource,
    routeAwareConfidence,
    beforeTrailhead: trailRejectEvidence ? false : base.beforeTrailhead,
    beforeRemoteEntry: remoteRejectEvidence ? false : base.beforeRemoteEntry,
    remoteEntrySource: remoteRejectEvidence?.remoteEntrySource ?? base.remoteEntrySource,
    remoteEntryEstimated: remoteRejectEvidence?.remoteEntryEstimated ?? base.remoteEntryEstimated,
    operatingStatus: operatingEvidence.operatingStatus,
  };
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

function selectionPriority(point: ResupplyPoint): number {
  if (point.selectionState === 'operator_selected') return 0;
  if (point.selectionState === 'route_context_selected') return 1;
  if (point.selectionState === 'route_waypoint') return 2;
  return 3;
}

function compareOperationalApproachPoints(left: ResupplyPoint, right: ResupplyPoint): number {
  const selectionDelta = selectionPriority(left) - selectionPriority(right);
  if (selectionDelta !== 0) return selectionDelta;
  const leftEvidence = left.approachEvidence;
  const rightEvidence = right.approachEvidence;
  if (!!leftEvidence !== !!rightEvidence) return leftEvidence ? -1 : 1;
  if (!leftEvidence || !rightEvidence) return byNearestDistance(left, right);
  const leftViable = left.accessStatus !== 'inaccessible' &&
    leftEvidence.beforeTrailhead !== false && leftEvidence.beforeRemoteEntry !== false ? 0 : 1;
  const rightViable = right.accessStatus !== 'inaccessible' &&
    rightEvidence.beforeTrailhead !== false && rightEvidence.beforeRemoteEntry !== false ? 0 : 1;
  if (leftViable !== rightViable) return leftViable - rightViable;
  const rankDelta = (leftEvidence.rank ?? Number.POSITIVE_INFINITY) - (rightEvidence.rank ?? Number.POSITIVE_INFINITY);
  if (rankDelta !== 0) return rankDelta;
  const detourDelta = (leftEvidence.detourDistanceMiles ?? Number.POSITIVE_INFINITY) -
    (rightEvidence.detourDistanceMiles ?? Number.POSITIVE_INFINITY);
  if (Math.abs(detourDelta) > 0.01) return detourDelta;
  const remoteDelta = (leftEvidence.distanceBeforeRemoteEntryMiles ?? Number.POSITIVE_INFINITY) -
    (rightEvidence.distanceBeforeRemoteEntryMiles ?? Number.POSITIVE_INFINITY);
  if (Math.abs(remoteDelta) > 0.01) return remoteDelta;
  const scoreDelta = (rightEvidence.score ?? Number.NEGATIVE_INFINITY) -
    (leftEvidence.score ?? Number.NEGATIVE_INFINITY);
  if (Math.abs(scoreDelta) > 0.001) return scoreDelta;
  return left.id.localeCompare(right.id);
}

function isKnownOperationallyNonviable(point: ResupplyPoint): boolean {
  if (point.accessStatus === 'inaccessible') return true;
  const evidence = point.approachEvidence;
  if (!evidence) return false;
  return evidence.beforeTrailhead === false ||
    evidence.beforeRemoteEntry === false ||
    (evidence.detourDistanceMiles != null &&
      evidence.detourDistanceMiles > APPROACH_RESUPPLY_POLICY.maximumRouteDetourMiles) ||
    evidence.operatingStatus === 'closed' ||
    evidence.operatingStatus === 'temporarily_closed';
}

function operationalApproachPoint(points: ResupplyPoint[]): ResupplyPoint | null {
  return points.filter((point) => !isKnownOperationallyNonviable(point)).sort(compareOperationalApproachPoints)[0] ?? null;
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
  const fuelSource = sourceLabel(args.vehicleProfile?.rangeSource ?? args.vehicleProfile?.source, 'manual');
  const rangeMarginMiles =
    vehicleRangeMiles != null && estimatedMinimumRangeMiles != null
      ? roundTenths(vehicleRangeMiles - estimatedMinimumRangeMiles)
      : null;

  const routeEnd = routeDistance ?? Number.POSITIVE_INFINITY;
  const approachFuelPoints = fuelPoints.filter((point) => point.approachEvidence);
  const hasRouteAwareFuel = approachFuelPoints.length > 0;
  const viableFuelPoints = hasRouteAwareFuel
    ? approachFuelPoints.filter((point) => !isKnownOperationallyNonviable(point))
    : fuelPoints;
  const routeAwareFuel = hasRouteAwareFuel
    ? operationalApproachPoint(viableFuelPoints)
    : null;
  const nearestFuelBeforeStart = routeAwareFuel ??
    viableFuelPoints
      .filter((point) => (point.routeMileMarker ?? 0) <= 0 || point.distanceFromStartMiles != null)
      .sort(byNearestDistance)[0] ??
    nearestPoint(viableFuelPoints);
  const lastReliableFuelBeforeRemoteSection = routeAwareFuel ??
    viableFuelPoints
      .filter((point) => {
        const mile = finiteNumber(point.routeMileMarker);
        return mile != null && (routeDistance == null || mile <= routeDistance * 0.4);
      })
      .sort((left, right) => (right.routeMileMarker ?? 0) - (left.routeMileMarker ?? 0))[0] ??
    null;
  const nearestFuelAfterExit =
    viableFuelPoints
      .filter((point) => (point.routeMileMarker ?? -1) >= routeEnd || point.distanceFromEndMiles != null)
      .sort(byNearestDistance)[0] ??
    null;

  let status: ResupplyStatus = 'unknown';
  if (vehicleRangeMiles == null || estimatedMinimumRangeMiles == null) {
    addWarning(warnings, 'fuel', 'fuel-range-unknown', 'Vehicle fuel range or route distance data unavailable. Verify before departure.', 'caution');
  } else if (rangeMarginMiles != null && rangeMarginMiles < 0) {
    status = 'low';
    addWarning(
      warnings,
      'fuel',
      'fuel-range-deficit',
      `Estimated route demand appears above the ${fuelSource} vehicle range. Verify fuel before departure.`,
      'critical',
    );
  } else if (rangeMarginMiles != null && rangeMarginMiles < estimatedMinimumRangeMiles * 0.1) {
    status = 'low';
    addWarning(warnings, 'fuel', 'fuel-range-tight', `Fuel range margin appears tight against the ${fuelSource} vehicle range. Verify before departure.`, 'caution');
  } else if (viableFuelPoints.length === 0) {
    status = rangeMarginMiles != null && rangeMarginMiles >= 0 ? 'good' : 'medium';
    if (rangeMarginMiles != null && rangeMarginMiles >= 0) {
      recommendations.push(recommendation(
        'fuel',
        'fuel-manual-range-viable',
        `Manual vehicle range covers estimated route demand with ${rangeMarginMiles.toFixed(rangeMarginMiles >= 10 ? 0 : 1)} mi margin. Verify the entered fuel before departure.`,
      ));
    } else {
      addWarning(warnings, 'fuel', 'fuel-points-unknown', 'No known fuel source detected for this route.', 'watch');
    }
  } else if (rangeMarginMiles != null && rangeMarginMiles >= estimatedMinimumRangeMiles * 0.25) {
    status = 'good';
  } else {
    status = 'medium';
  }

  if (hasRouteAwareFuel && viableFuelPoints.length === 0) {
    addWarning(
      warnings,
      'fuel',
      'fuel-no-viable-approach-stop',
      'No viable fuel stop remains before the trailhead and service-loss boundary; verify an alternative before departure.',
      'caution',
    );
  }

  const point = routeAwareFuel ?? nearestFuelBeforeStart ?? lastReliableFuelBeforeRemoteSection ?? nearestFuelAfterExit;
  if (point) {
    recommendations.push(recommendation(
      'fuel',
      'fuel-primary',
      `${point.name} is the known fuel reference. Verify availability before departure.`,
      point.id,
    ));
  } else if (recommendations.length === 0) {
    recommendations.push(recommendation('fuel', 'fuel-primary', 'No known fuel source detected. Verify before departure.'));
  }

  return {
    category: 'fuel',
    status,
    confidence: vehicleRangeMiles != null ? 'medium' : 'unknown',
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
  manualSupport?: { available: boolean; message: string; source?: string | null },
): ResupplyCategoryPlanFor<TCategory> {
  const warnings: ResupplyWarning[] = [];
  const approachPoints = category === 'food_supplies'
    ? points.filter((candidate) => candidate.approachEvidence)
    : [];
  const hasOperationalApproachEvidence = approachPoints.length > 0;
  const point = hasOperationalApproachEvidence
    ? operationalApproachPoint(approachPoints)
    : nearestPoint(points);
  const missingMessage = hasOperationalApproachEvidence && !point
    ? 'No viable food or supply stop remains before the trailhead and service-loss boundary.'
    : labels.missing;
  const status: ResupplyStatus = !point
    ? manualSupport?.available ? 'good' : 'unknown'
    : statusFromSupportDistance(point?.distanceFromRouteMiles ?? null);
  if (!point && !manualSupport?.available) addWarning(warnings, category, `${category}-unknown`, missingMessage, 'watch');
  const recommendations = [
    recommendation(
      category,
      `${category}-primary`,
      point
        ? `${labels.action}: ${point.name}.`
        : manualSupport?.available
          ? manualSupport.message
          : missingMessage,
      point?.id,
    ),
  ];
  return {
    category,
    status,
    confidence: point ? normalizeReliability(point.reliability) || 'medium' : manualSupport?.available ? 'medium' : 'unknown',
    primaryRecommendation: recommendations[0].message,
    keyPoint: point ?? (manualSupport?.available ? {
      id: `${category}-manual-support`,
      name: manualSupport.source ? `Manual ${manualSupport.source}` : 'Manual loadout support',
      category,
      source: manualSupport.source ?? 'manual_vehicle_loadout',
      notes: [manualSupport.message],
    } as ResupplyPoint : null),
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
  const byCategory = (category: ResupplyCategory) => points.filter((point) => (
    point.category === category ||
    ((category === 'fuel' || category === 'food_supplies') && point.categoryCoverage?.includes(category))
  ));
  const fuel = buildFuelPlan(args, byCategory('fuel'));
  const support = args.vehicleProfile?.supportReadiness ?? null;
  const waterGallons = finiteNumber(args.vehicleProfile?.currentWaterGallons) ?? finiteNumber(args.vehicleProfile?.waterCapacityGal);
  const manualWater = isPositive(waterGallons) || support?.water === true
    ? {
        available: true,
        source: args.vehicleProfile?.waterSource ?? support?.source ?? 'vehicle profile',
        message: waterGallons != null && waterGallons > 0
          ? `Manual vehicle water capacity is set to ${waterGallons.toFixed(waterGallons >= 10 ? 0 : 1)} gal. Verify carried water and refill options before departure.`
          : 'Manual loadout includes water support. Verify quantity and refill options before departure.',
      }
    : undefined;
  const manualSupplies = support?.foodSupplies === true
    ? {
        available: true,
        source: support.source ?? 'active loadout',
        message: 'Active loadout includes food or supply support. Verify quantity for the trip duration before departure.',
      }
    : undefined;
  const manualRepair = support?.repair === true || support?.recovery === true
    ? {
        available: true,
        source: support.source ?? 'active loadout',
        message: 'Active loadout includes repair or recovery support. Verify tire repair, tools, and recovery equipment before departure.',
      }
    : undefined;
  const manualMedical = support?.medical === true
    ? {
        available: true,
        source: support.source ?? 'active loadout',
        message: 'Active loadout includes medical support. Verify first-aid contents and accessibility before departure.',
      }
    : undefined;
  const water = attachKnownPoints(buildPointBackedPlan('water', byCategory('water'), {
    missing: 'No known water source detected.',
    action: 'Known water refill point',
  }, manualWater), byCategory('water'));
  const supplies = attachKnownPoints(buildPointBackedPlan('food_supplies', byCategory('food_supplies'), {
    missing: 'No known food or supply source detected.',
    action: 'Known supply point',
  }, manualSupplies), byCategory('food_supplies'));
  const repair = attachKnownPoints(buildPointBackedPlan('repair', byCategory('repair'), {
    missing: 'No known repair source detected.',
    action: 'Known repair support',
  }, manualRepair), byCategory('repair'));
  const medical = attachKnownPoints(buildPointBackedPlan('medical', byCategory('medical'), {
    missing: 'No known medical source detected.',
    action: 'Known medical support',
  }, manualMedical), byCategory('medical'));
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
      args.vehicleProfile ? `vehicle range profile${support?.source ? ` + ${support.source}` : ''}` : 'vehicle range data unavailable',
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
