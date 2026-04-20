import type {
  ECSExpeditionPhase,
  ECSExpeditionPhaseInput,
  ECSExpeditionPhaseResult,
} from './expeditionPhaseTypes';

function clampProgress(value: number | null | undefined): number {
  const num = Number(value ?? 0);
  if (!Number.isFinite(num)) return 0;
  return Math.max(0, Math.min(100, num));
}

function normalizeSpeed(value: number | null | undefined): number {
  const num = Number(value ?? 0);
  return Number.isFinite(num) ? Math.max(0, num) : 0;
}

function pushReason(reasons: string[], value: string | null | undefined) {
  if (!value) return;
  if (!reasons.includes(value)) reasons.push(value);
}

function labelForPhase(phase: ECSExpeditionPhase): string {
  switch (phase) {
    case 'vehicle_setup':
      return 'Vehicle setup';
    case 'staging':
      return 'Staging';
    case 'transit':
      return 'Transit';
    case 'trail_entry':
      return 'Trail entry';
    case 'active_expedition':
      return 'Active expedition';
    case 'camp_stationary':
      return 'Camp / stationary';
    case 'recovery_exit':
      return 'Recovery / exit';
    default:
      return 'Unknown phase';
  }
}

function summaryForPhase(phase: ECSExpeditionPhase): string {
  switch (phase) {
    case 'vehicle_setup':
      return 'Vehicle, resources, and loadout are still in setup posture.';
    case 'staging':
      return 'Preparation is active, but expedition travel is not yet underway.';
    case 'transit':
      return 'On-road transit is active ahead of trail commitment.';
    case 'trail_entry':
      return 'The route is transitioning into expedition terrain and higher commitment.';
    case 'active_expedition':
      return 'Sustained expedition travel is active with route, terrain, and remoteness in play.';
    case 'camp_stationary':
      return 'The expedition is stationary; overnight readiness and next-day margin matter most.';
    case 'recovery_exit':
      return 'The route posture is shifting toward exit, bailout, or pavement return.';
    default:
      return 'Phase inference is limited with the current ECS context.';
  }
}

function stabilizePhase(
  inferred: ECSExpeditionPhase,
  input: ECSExpeditionPhaseInput,
): ECSExpeditionPhase {
  const previous = input.previousPhase ?? null;
  if (!previous || previous === inferred) return inferred;

  const progress = clampProgress(input.progressPercent);
  const speed = normalizeSpeed(input.speedMph);
  const remoteness = Number.isFinite(Number(input.remotenessScore))
    ? Number(input.remotenessScore)
    : 0;
  const moving = speed >= 5;
  const clearlyStationary = (input.stationaryMinutes ?? 0) >= 10 || speed < 1.5;

  if (previous === 'transit' && inferred === 'trail_entry' && progress < 22 && remoteness < 45) {
    return 'transit';
  }

  if (previous === 'trail_entry' && inferred === 'active_expedition' && progress < 45 && remoteness < 60) {
    return 'trail_entry';
  }

  if (previous === 'active_expedition' && inferred === 'camp_stationary' && !clearlyStationary) {
    return 'active_expedition';
  }

  if (previous === 'camp_stationary' && inferred === 'active_expedition' && !moving) {
    return 'camp_stationary';
  }

  if (previous === 'recovery_exit' && progress >= 60 && remoteness < 65) {
    return 'recovery_exit';
  }

  return inferred;
}

export function inferExpeditionPhase(
  input: ECSExpeditionPhaseInput,
): ECSExpeditionPhaseResult {
  const reasons: string[] = [];
  const setupComplete = !!input.setupComplete;
  const hasActiveVehicle = !!input.hasActiveVehicle;
  const hasActiveExpedition = !!input.hasActiveExpedition;
  const expeditionState = String(input.expeditionState ?? '').toLowerCase();
  const hasSelectedRoute = !!input.hasSelectedRoute;
  const hasActiveGuidance = !!input.hasActiveGuidance;
  const routeStatus = String(input.routeStatus ?? '').toLowerCase();
  const progress = clampProgress(input.progressPercent);
  const speed = normalizeSpeed(input.speedMph);
  const remoteness = Number.isFinite(Number(input.remotenessScore))
    ? Number(input.remotenessScore)
    : 0;
  const moving = speed >= 5;
  const clearlyStationary = (input.stationaryMinutes ?? 0) >= 10 || speed < 1.5;
  const bailoutAvailable = input.bailoutAvailable;
  const campRecommended = !!input.campRecommended;

  let phase: ECSExpeditionPhase = 'unknown';

  if (!setupComplete || !hasActiveVehicle) {
    phase = 'vehicle_setup';
    pushReason(reasons, !setupComplete ? 'Setup is incomplete' : 'No active vehicle is selected');
  } else if (!hasActiveExpedition && !hasSelectedRoute && !hasActiveGuidance) {
    phase = 'staging';
    pushReason(reasons, 'Vehicle is ready but no expedition route is underway');
  } else if (!hasActiveExpedition && (hasSelectedRoute || hasActiveGuidance)) {
    phase = 'staging';
    pushReason(reasons, 'Route is selected before expedition movement begins');
  } else if (expeditionState === 'complete') {
    phase = 'recovery_exit';
    pushReason(reasons, 'Expedition session is marked complete');
  } else if (routeStatus === 'near_completion' || progress >= 82) {
    phase = 'recovery_exit';
    pushReason(reasons, 'Route progress indicates exit or completion posture');
  } else if (
    hasActiveExpedition
    && (routeStatus === 'paused' || campRecommended || clearlyStationary)
    && progress >= 8
  ) {
    phase = 'camp_stationary';
    pushReason(reasons, routeStatus === 'paused' ? 'Active route is paused' : 'Movement has settled into a stationary posture');
    if (campRecommended) {
      pushReason(reasons, 'Camp guidance indicates a stop posture');
    }
  } else if (
    hasActiveExpedition
    && moving
    && progress < 18
    && remoteness < 35
    && bailoutAvailable !== false
  ) {
    phase = 'transit';
    pushReason(reasons, 'Early route movement remains in lower-commitment access terrain');
  } else if (
    hasActiveExpedition
    && (hasActiveGuidance || hasSelectedRoute)
    && (
      progress < 35
      || (remoteness >= 35 && remoteness < 60)
      || bailoutAvailable === false
    )
  ) {
    phase = 'trail_entry';
    pushReason(reasons, 'Route posture is transitioning into expedition terrain');
    if (bailoutAvailable === false) {
      pushReason(reasons, 'Bailout options are limited');
    }
  } else if (
    hasActiveExpedition
    && (
      moving
      || progress >= 35
      || remoteness >= 50
      || bailoutAvailable === false
    )
  ) {
    phase = 'active_expedition';
    pushReason(reasons, 'Expedition travel is active beyond initial route commitment');
  } else if (hasActiveExpedition) {
    phase = 'staging';
    pushReason(reasons, 'Expedition is active but movement posture is still settling');
  }

  phase = stabilizePhase(phase, input);

  return {
    phase,
    label: labelForPhase(phase),
    summary: summaryForPhase(phase),
    reasons,
  };
}
