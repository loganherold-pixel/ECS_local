import type { RoadNavRoute } from './mapboxRoadNavigation';
import type {
  FullRouteGuidanceStartSource,
  FullRouteGuidanceStatus,
} from './fullRouteGuidance';

const HYBRID_ROAD_APPROACH_STUB_DISTANCE_M = 75;

function isArrivalLikeStep(step: RoadNavRoute['steps'][number]): boolean {
  const maneuverType = String(step.maneuverType ?? '').toLowerCase();
  const instruction = String(step.instruction ?? '').toLowerCase();
  return (
    maneuverType === 'arrive' ||
    maneuverType === 'notification' ||
    instruction.includes('arrive') ||
    instruction.includes('destination')
  );
}

function isManeuverStep(step: RoadNavRoute['steps'][number]): boolean {
  if (isArrivalLikeStep(step)) return false;
  const maneuverType = String(step.maneuverType ?? '').toLowerCase();
  if (maneuverType === 'turn' || maneuverType === 'fork' || maneuverType === 'roundabout') {
    return true;
  }
  if (step.modifier && maneuverType !== 'depart') return true;
  const instruction = String(step.instruction ?? '').toLowerCase();
  return /\b(turn|merge|exit|bear|keep|fork|roundabout|u-turn)\b/.test(instruction);
}

export function hybridRoadRouteHasPendingManeuver(route: RoadNavRoute | null | undefined): boolean {
  if (!route || !Array.isArray(route.steps) || route.steps.length === 0) return false;
  const distanceM = Number(route.distanceM);
  if (Number.isFinite(distanceM) && distanceM <= HYBRID_ROAD_APPROACH_STUB_DISTANCE_M) {
    return false;
  }
  return route.steps.some((step) => isManeuverStep(step));
}

export function shouldHybridStartWithTrail(input: {
  fullRouteStatus: FullRouteGuidanceStatus;
  startSource: FullRouteGuidanceStartSource;
  trailStartIndex?: number | null;
  roadRoute: RoadNavRoute | null | undefined;
}): boolean {
  if (input.fullRouteStatus !== 'ready') return false;
  if (input.startSource !== 'gps_on_trail') return false;
  const trailStartIndex = Number(input.trailStartIndex);
  if (Number.isFinite(trailStartIndex) && trailStartIndex > 0) return true;
  return !hybridRoadRouteHasPendingManeuver(input.roadRoute);
}
