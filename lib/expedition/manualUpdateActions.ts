import type {
  AssessmentConfidence,
  AssessmentStatus,
  ConvoyMemberSnapshot,
  ExpeditionContextSnapshot,
  ExpeditionDataPoint,
  ExpeditionRouteSnapshot,
  CampSnapshot,
  LogisticsSnapshot,
  VehicleSnapshot,
} from './operationalAssessmentTypes';

export const MANUAL_EXPEDITION_DATA_STALE_AFTER_MINUTES = 120;

export type ManualExpeditionActionId =
  | 'report-route-issue'
  | 'mark-obstacle'
  | 'update-checkpoint-status'
  | 'evaluate-alternate-route'
  | 'set-regroup-checkpoint'
  | 'send-check-in-request'
  | 'mark-member-ok'
  | 'mark-member-delayed'
  | 'mark-member-offline'
  | 'mark-member-needs-assistance'
  | 'set-regroup-point'
  | 'confirm-camp-safe'
  | 'mark-camp-unsafe'
  | 'select-alternate-camp'
  | 'evaluate-alternate-camp'
  | 'update-fuel'
  | 'update-water'
  | 'update-food'
  | 'update-battery-power'
  | 'mark-resupply-complete'
  | 'report-mechanical-issue'
  | 'mark-vehicle-ok'
  | 'mark-disabled'
  | 'update-tire-status'
  | string;

export type ManualExpeditionActionResult = {
  context: ExpeditionContextSnapshot;
  handled: boolean;
  message: string;
};

export function createManualExpeditionDataPoint<T>(
  value: T,
  now: string,
  confidence: AssessmentConfidence = 'high',
): ExpeditionDataPoint<T> {
  return {
    value,
    source: 'userManual',
    updatedAt: now,
    confidence,
    reliability: confidence,
    staleAfterMinutes: MANUAL_EXPEDITION_DATA_STALE_AFTER_MINUTES,
  };
}

function appendUnique(values: string[] | null | undefined, next: string): string[] {
  return [...new Set([...(values ?? []), next].filter(Boolean))];
}

function firstVehicle(context: ExpeditionContextSnapshot, now: string): VehicleSnapshot {
  return context.vehicles?.[0] ?? {
    vehicleId: 'manual-vehicle-1',
    callsign: createManualExpeditionDataPoint('Vehicle 1', now),
    label: createManualExpeditionDataPoint('Vehicle 1', now),
  };
}

function firstConvoyMember(context: ExpeditionContextSnapshot, now: string): ConvoyMemberSnapshot {
  return context.convoy?.members?.[0] ?? {
    id: 'manual-member-1',
    callsign: 'Vehicle 1',
    role: 'member',
    lastCheckInAt: createManualExpeditionDataPoint(now, now),
    lastKnownLocationLabel: createManualExpeditionDataPoint('Manual check-in', now),
    movementStatus: createManualExpeditionDataPoint('moving', now),
    missedCheckpoint: createManualExpeditionDataPoint(false, now),
    needsAssistance: createManualExpeditionDataPoint(false, now),
  };
}

function updateFirstMember(
  context: ExpeditionContextSnapshot,
  now: string,
  patcher: (member: ConvoyMemberSnapshot) => ConvoyMemberSnapshot,
): ConvoyMemberSnapshot[] {
  const members = [...(context.convoy?.members ?? [firstConvoyMember(context, now)])];
  members[0] = patcher({ ...members[0] });
  return members;
}

function updateFirstVehicle(
  context: ExpeditionContextSnapshot,
  now: string,
  patcher: (vehicle: VehicleSnapshot) => VehicleSnapshot,
): VehicleSnapshot[] {
  const vehicles = [...(context.vehicles ?? [firstVehicle(context, now)])];
  vehicles[0] = patcher({ ...vehicles[0] });
  return vehicles;
}

function routeAction(
  context: ExpeditionContextSnapshot,
  actionId: ManualExpeditionActionId,
  now: string,
): ManualExpeditionActionResult | null {
  const route: ExpeditionRouteSnapshot = { ...(context.route ?? {}) };
  const existingIssues = context.route?.userReportedRouteIssues?.value ?? [];
  const existingHazards = context.route?.knownHazards?.value ?? [];

  if (actionId === 'report-route-issue') {
    route.userReportedRouteIssues = createManualExpeditionDataPoint(
      appendUnique(existingIssues, 'Manual route issue reported'),
      now,
      'medium',
    );
    return { context: { ...context, route }, handled: true, message: 'Route issue reported manually.' };
  }
  if (actionId === 'mark-obstacle') {
    route.knownHazards = createManualExpeditionDataPoint(
      appendUnique(existingHazards, 'Manual obstacle marked'),
      now,
      'medium',
    );
    route.upcomingDifficultTerrain = createManualExpeditionDataPoint(true, now, 'medium');
    route.upcomingDifficultTerrainLabel = createManualExpeditionDataPoint('Manual obstacle', now, 'medium');
    return { context: { ...context, route }, handled: true, message: 'Obstacle marked manually.' };
  }
  if (actionId === 'update-checkpoint-status') {
    route.currentSegmentLabel = createManualExpeditionDataPoint('Manual checkpoint confirmed', now);
    route.offRoute = createManualExpeditionDataPoint(false, now);
    route.progressPercent = createManualExpeditionDataPoint(
      Math.min((route.progressPercent?.value ?? 0) + 5, 100),
      now,
    );
    return { context: { ...context, route }, handled: true, message: 'Checkpoint status updated manually.' };
  }
  if (actionId === 'evaluate-alternate-route') {
    route.alternateRouteAvailable = createManualExpeditionDataPoint(true, now);
    route.alternateRouteLabel = createManualExpeditionDataPoint('Manual alternate route candidate', now);
    return { context: { ...context, route }, handled: true, message: 'Alternate route marked available manually.' };
  }
  if (actionId === 'set-regroup-checkpoint' || actionId === 'set-regroup-point') {
    route.currentSegmentLabel = createManualExpeditionDataPoint('Manual regroup checkpoint', now);
    return { context: { ...context, route }, handled: true, message: 'Regroup checkpoint updated manually.' };
  }

  return null;
}

function convoyAction(
  context: ExpeditionContextSnapshot,
  actionId: ManualExpeditionActionId,
  now: string,
): ManualExpeditionActionResult | null {
  const convoy = { ...(context.convoy ?? {}) };
  const teamCount = Math.max(convoy.teamMemberCount?.value ?? convoy.members?.length ?? 1, 1);
  const target = firstConvoyMember(context, now).callsign;

  if (actionId === 'send-check-in-request') {
    convoy.recommendedRegroupPoint = createManualExpeditionDataPoint('Manual check-in requested', now);
    return { context: { ...context, convoy }, handled: true, message: 'Check-in request logged manually.' };
  }
  if (actionId === 'mark-member-ok') {
    convoy.members = updateFirstMember(context, now, (member) => ({
      ...member,
      lastCheckInAt: createManualExpeditionDataPoint(now, now),
      lastKnownLocationLabel: createManualExpeditionDataPoint('Manual OK check-in', now),
      movementStatus: createManualExpeditionDataPoint('moving', now),
      missedCheckpoint: createManualExpeditionDataPoint(false, now),
      needsAssistance: createManualExpeditionDataPoint(false, now),
    }));
    convoy.teamMemberCount = createManualExpeditionDataPoint(teamCount, now);
    convoy.activeMemberCount = createManualExpeditionDataPoint(teamCount, now);
    convoy.missingMemberCount = createManualExpeditionDataPoint(0, now);
    convoy.overdueMemberLabels = createManualExpeditionDataPoint([], now);
    convoy.stoppedUnexpectedlyLabels = createManualExpeditionDataPoint([], now);
    convoy.missedCheckpointMemberLabels = createManualExpeditionDataPoint([], now);
    convoy.assistanceNeededMemberLabels = createManualExpeditionDataPoint([], now);
    convoy.lastCheckInAt = createManualExpeditionDataPoint(now, now);
    convoy.communicationsStatus = createManualExpeditionDataPoint('online', now);
    return { context: { ...context, convoy }, handled: true, message: 'Convoy member marked OK manually.' };
  }
  if (actionId === 'mark-member-delayed') {
    convoy.members = updateFirstMember(context, now, (member) => ({
      ...member,
      movementStatus: createManualExpeditionDataPoint('delayed', now, 'medium'),
    }));
    convoy.overdueMemberLabels = createManualExpeditionDataPoint([target], now, 'medium');
    convoy.activeMemberCount = createManualExpeditionDataPoint(teamCount, now, 'medium');
    return { context: { ...context, convoy }, handled: true, message: 'Convoy member marked delayed manually.' };
  }
  if (actionId === 'mark-member-offline') {
    convoy.members = updateFirstMember(context, now, (member) => ({
      ...member,
      movementStatus: createManualExpeditionDataPoint('offline', now, 'medium'),
    }));
    convoy.overdueMemberLabels = createManualExpeditionDataPoint([target], now, 'medium');
    convoy.communicationsStatus = createManualExpeditionDataPoint('degraded', now, 'medium');
    return { context: { ...context, convoy }, handled: true, message: 'Convoy member marked offline manually.' };
  }
  if (actionId === 'mark-member-needs-assistance' || actionId === 'start-assistance-workflow') {
    convoy.members = updateFirstMember(context, now, (member) => ({
      ...member,
      movementStatus: createManualExpeditionDataPoint('needs_assistance', now, 'medium'),
      needsAssistance: createManualExpeditionDataPoint(true, now, 'medium'),
    }));
    convoy.assistanceNeededMemberLabels = createManualExpeditionDataPoint([target], now, 'medium');
    convoy.activeMemberCount = createManualExpeditionDataPoint(Math.max(teamCount - 1, 0), now, 'medium');
    return { context: { ...context, convoy }, handled: true, message: 'Convoy assistance need logged manually.' };
  }

  return null;
}

function campAction(
  context: ExpeditionContextSnapshot,
  actionId: ManualExpeditionActionId,
  now: string,
): ManualExpeditionActionResult | null {
  const camp: CampSnapshot = { ...(context.camp ?? {}) };

  if (actionId === 'confirm-camp-safe') {
    camp.hasRouteCamps = createManualExpeditionDataPoint(true, now);
    camp.plannedCampStatus = createManualExpeditionDataPoint('confirmed', now);
    camp.campReadinessStatus = createManualExpeditionDataPoint('normal', now);
    camp.campSafetyStatus = createManualExpeditionDataPoint('safe', now);
    camp.campConfirmed = createManualExpeditionDataPoint(true, now);
    camp.daylightRemainingAtArrivalMinutes = createManualExpeditionDataPoint(120, now);
    camp.arrivalBeforeDark = createManualExpeditionDataPoint(true, now);
    camp.safeSetupBeforeDark = createManualExpeditionDataPoint(true, now);
    camp.knownCampHazards = createManualExpeditionDataPoint([], now);
    return { context: { ...context, camp }, handled: true, message: 'Camp confirmed safe manually.' };
  }
  if (actionId === 'mark-camp-unsafe') {
    camp.plannedCampStatus = createManualExpeditionDataPoint('unsafe', now, 'medium');
    camp.campReadinessStatus = createManualExpeditionDataPoint('critical', now, 'medium');
    camp.campSafetyStatus = createManualExpeditionDataPoint('unsafe', now, 'medium');
    camp.campConfirmed = createManualExpeditionDataPoint(false, now, 'medium');
    camp.knownCampHazards = createManualExpeditionDataPoint(['Manual camp unsafe report'], now, 'medium');
    return { context: { ...context, camp }, handled: true, message: 'Camp marked unsafe manually.' };
  }
  if (actionId === 'select-alternate-camp' || actionId === 'evaluate-alternate-camp') {
    camp.hasRouteCamps = createManualExpeditionDataPoint(true, now);
    camp.alternateCampAvailable = createManualExpeditionDataPoint(true, now);
    camp.alternateCampLabel = createManualExpeditionDataPoint('Manual alternate camp', now);
    camp.alternateCampImprovesDaylightMargin = createManualExpeditionDataPoint(true, now);
    camp.alternateCampFuelRisk = createManualExpeditionDataPoint('low', now);
    camp.nextCampName = createManualExpeditionDataPoint('Manual alternate camp', now);
    camp.plannedCampStatus = createManualExpeditionDataPoint('planned', now);
    return { context: { ...context, camp }, handled: true, message: 'Alternate camp selected manually.' };
  }

  return null;
}

function logisticsAction(
  context: ExpeditionContextSnapshot,
  actionId: ManualExpeditionActionId,
  now: string,
): ManualExpeditionActionResult | null {
  const logistics: LogisticsSnapshot = { ...(context.logistics ?? {}) };

  if (actionId === 'update-fuel') {
    logistics.fuelRangeMiles = createManualExpeditionDataPoint(260, now);
    logistics.fuelReserveToNextCheckpointMiles = createManualExpeditionDataPoint(60, now);
    logistics.fuelReserveToCampMiles = createManualExpeditionDataPoint(90, now);
    logistics.fuelReserveToResupplyMiles = createManualExpeditionDataPoint(80, now);
    logistics.supplyStatus = createManualExpeditionDataPoint('normal', now);
    return { context: { ...context, logistics }, handled: true, message: 'Fuel updated manually.' };
  }
  if (actionId === 'update-water') {
    logistics.waterRemainingLiters = createManualExpeditionDataPoint(36, now);
    logistics.waterEnduranceDays = createManualExpeditionDataPoint(3, now);
    logistics.limitingResource = createManualExpeditionDataPoint('none', now);
    logistics.supplyStatus = createManualExpeditionDataPoint('normal', now);
    return { context: { ...context, logistics }, handled: true, message: 'Water updated manually.' };
  }
  if (actionId === 'update-food') {
    logistics.foodDaysRemaining = createManualExpeditionDataPoint(4, now);
    logistics.supplyStatus = createManualExpeditionDataPoint('normal', now);
    return { context: { ...context, logistics }, handled: true, message: 'Food updated manually.' };
  }
  if (actionId === 'update-battery-power') {
    logistics.powerHoursRemaining = createManualExpeditionDataPoint(36, now);
    logistics.batteryPowerStatus = createManualExpeditionDataPoint('normal', now);
    return { context: { ...context, logistics }, handled: true, message: 'Power updated manually.' };
  }
  if (actionId === 'mark-resupply-complete') {
    logistics.lastResupplyCompletedAt = createManualExpeditionDataPoint(now, now);
    logistics.criticalSupplyWarnings = createManualExpeditionDataPoint([], now);
    logistics.supplyStatus = createManualExpeditionDataPoint('normal', now);
    return { context: { ...context, logistics }, handled: true, message: 'Resupply marked complete manually.' };
  }

  return null;
}

function vehicleAction(
  context: ExpeditionContextSnapshot,
  actionId: ManualExpeditionActionId,
  now: string,
): ManualExpeditionActionResult | null {
  if (actionId === 'report-mechanical-issue') {
    const vehicles = updateFirstVehicle(context, now, (vehicle) => ({
      ...vehicle,
      readinessStatus: createManualExpeditionDataPoint('caution', now, 'medium'),
      engineStatus: createManualExpeditionDataPoint('warning', now, 'medium'),
      activeMechanicalIssue: createManualExpeditionDataPoint('Manual mechanical issue report', now, 'medium'),
      manualIssueReports: createManualExpeditionDataPoint(
        appendUnique(vehicle.manualIssueReports?.value, 'Manual mechanical issue report'),
        now,
        'medium',
      ),
    }));
    return { context: { ...context, vehicles }, handled: true, message: 'Mechanical issue reported manually.' };
  }
  if (actionId === 'mark-vehicle-ok') {
    const vehicles = updateFirstVehicle(context, now, (vehicle) => ({
      ...vehicle,
      readinessStatus: createManualExpeditionDataPoint('normal', now),
      engineStatus: createManualExpeditionDataPoint('nominal', now),
      disabled: createManualExpeditionDataPoint(false, now),
      activeMechanicalIssue: createManualExpeditionDataPoint('', now),
      manualIssueReports: createManualExpeditionDataPoint([], now),
      tirePressureStatus: createManualExpeditionDataPoint('normal', now),
      recoveryEquipmentReady: createManualExpeditionDataPoint(true, now),
      spareTireReady: createManualExpeditionDataPoint(true, now),
    }));
    return { context: { ...context, vehicles }, handled: true, message: 'Vehicle marked OK manually.' };
  }
  if (actionId === 'mark-disabled' || actionId === 'start-recovery-workflow') {
    const vehicles = updateFirstVehicle(context, now, (vehicle) => ({
      ...vehicle,
      readinessStatus: createManualExpeditionDataPoint('critical', now, 'medium'),
      disabled: createManualExpeditionDataPoint(true, now, 'medium'),
      activeMechanicalIssue: createManualExpeditionDataPoint('Manual disabled vehicle report', now, 'medium'),
    }));
    return { context: { ...context, vehicles }, handled: true, message: 'Vehicle marked disabled manually.' };
  }
  if (actionId === 'update-tire-status') {
    const vehicles = updateFirstVehicle(context, now, (vehicle) => ({
      ...vehicle,
      tirePressureStatus: createManualExpeditionDataPoint('normal', now),
    }));
    return { context: { ...context, vehicles }, handled: true, message: 'Tire status updated manually.' };
  }

  return null;
}

export function applyManualExpeditionAction(
  context: ExpeditionContextSnapshot,
  actionId: ManualExpeditionActionId,
  now: string,
): ManualExpeditionActionResult {
  const preparedContext = {
    ...context,
    capturedAt: now,
    manualInputAvailable: true,
  };
  const handlers = [routeAction, convoyAction, campAction, logisticsAction, vehicleAction];
  for (const handler of handlers) {
    const result = handler(preparedContext, actionId, now);
    if (result) return result;
  }
  return {
    context: preparedContext,
    handled: false,
    message: 'Manual action is not implemented for this assessment yet.',
  };
}
