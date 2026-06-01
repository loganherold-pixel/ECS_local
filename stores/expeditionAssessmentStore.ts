import { useSyncExternalStore } from 'react';

import {
  buildExpeditionOperationalAssessmentMap,
  buildExpeditionOperationalAssessments,
} from '../lib/expedition/operationalAssessmentEngine';
import type {
  AssessmentCategory,
  AssessmentConfidence,
  AssessmentStatus,
  ConvoyMemberSnapshot,
  ConvoySnapshot,
  ExpeditionAssessment,
  ExpeditionContextSnapshot,
  ExpeditionDataPoint,
  ExpeditionRouteSnapshot,
  CampSnapshot,
  LogisticsSnapshot,
  VehicleSnapshot,
} from '../lib/expedition/operationalAssessmentTypes';
import {
  buildTemplateExpeditionAssessmentNarrative,
  generateExpeditionAssessmentNarratives,
  type ExpeditionAssessmentNarrative,
  type ExpeditionAssessmentNarrativeProvider,
} from '../lib/ai/expeditionAssessmentNarrative';
import {
  applyManualExpeditionAction,
  MANUAL_EXPEDITION_DATA_STALE_AFTER_MINUTES,
  type ManualExpeditionActionId,
} from '../lib/expedition/manualUpdateActions';
import { applyLiveConvoyTrackingToAssessmentContext } from '../lib/convoy/convoyAssessmentAdapter';

export type ExpeditionAssessmentContextProvider = () =>
  | ExpeditionContextSnapshot
  | null
  | Promise<ExpeditionContextSnapshot | null>;

export type ExpeditionAssessmentStoreState = {
  contextSnapshot: ExpeditionContextSnapshot;
  assessments: Record<AssessmentCategory, ExpeditionAssessment>;
  narratives: Record<AssessmentCategory, ExpeditionAssessmentNarrative>;
  loading: boolean;
  offline: boolean;
  stale: boolean;
  usingMockData: boolean;
  lastRefreshedAt: string | null;
  error: string | null;
};

export type ManualRouteDataInput = Partial<{
  routeName: string;
  currentSegmentLabel: string;
  distanceRemainingMiles: number;
  estimatedArrivalIso: string;
  daylightRemainingAtEtaMinutes: number;
  knownHazards: string[];
  offRoute: boolean;
  alternateRouteAvailable: boolean;
}>;

export type ManualConvoyCheckInInput = Partial<{
  members: ConvoyMemberSnapshot[];
  teamMemberCount: number;
  activeMemberCount: number;
  missingMemberCount: number;
  overdueMemberLabels: string[];
  stoppedUnexpectedlyLabels: string[];
  missedCheckpointMemberLabels: string[];
  assistanceNeededMemberLabels: string[];
  communicationsStatus: 'online' | 'degraded' | 'offline' | 'unknown';
  lastCheckInAt: string;
  trackingEnabled: boolean;
  liveLocationMemberCount: number;
  staleLocationMemberLabels: string[];
  convoySpacingMinutes: number;
  leadSweepSeparationMiles: number;
  recommendedRegroupPoint: string;
}>;

export type ManualCampStatusInput = Partial<{
  hasRouteCamps: boolean;
  plannedCampStatus: 'planned' | 'confirmed' | 'unconfirmed' | 'unsafe' | 'unknown';
  nextCampName: string;
  estimatedArrivalIso: string;
  distanceToNextCampMiles: number;
  campReadinessStatus: AssessmentStatus;
  campSafetyStatus: 'safe' | 'watch' | 'unsafe' | 'unknown';
  daylightRemainingAtArrivalMinutes: number;
  campConfirmed: boolean;
  arrivalBeforeDark: boolean;
  safeSetupBeforeDark: boolean;
  alternateCampAvailable: boolean;
  alternateCampLabel: string;
  alternateCampImprovesDaylightMargin: boolean;
  alternateCampFuelRisk: 'low' | 'moderate' | 'high' | 'unknown';
  weatherExposure: 'low' | 'moderate' | 'high' | 'unknown';
  sunsetIso: string;
  windMph: number;
  temperatureF: number;
  precipitationChancePercent: number;
  routeDifficultyRemaining: 'easy' | 'moderate' | 'hard' | 'technical' | 'unknown';
  convoyArrivalConfidence: AssessmentConfidence;
  overnightFuelReady: boolean;
  overnightWaterReady: boolean;
  overnightPowerReady: boolean;
}>;

export type ManualLogisticsDataInput = Partial<{
  fuelRangeMiles: number;
  distanceRemainingMiles: number;
  nextCheckpointLabel: string;
  distanceToNextCheckpointMiles: number;
  fuelReserveToNextCheckpointMiles: number;
  fuelReserveToCampMiles: number;
  fuelReserveToResupplyMiles: number;
  waterRemainingLiters: number;
  waterEnduranceDays: number;
  foodDaysRemaining: number;
  groupSize: number;
  powerHoursRemaining: number;
  batteryPowerStatus: AssessmentStatus;
  timeToResupplyHours: number;
  distanceToResupplyMiles: number;
  limitingResource: string;
  shelterReady: boolean;
  warmthReady: boolean;
  medicalKitReady: boolean;
  criticalEquipmentReady: boolean;
  criticalEquipmentIssues: string[];
  lastResupplyCompletedAt: string;
  supplyStatus: AssessmentStatus;
  criticalSupplyWarnings: string[];
}>;

export type ManualVehicleStatusInput = Partial<{
  vehicleId: string;
  callsign: string;
  label: string;
  driverName: string;
  readinessStatus: AssessmentStatus;
  engineStatus: 'nominal' | 'warning' | 'fault' | 'unknown';
  engineTemperatureF: number;
  engineFaultCodes: string[];
  disabled: boolean;
  activeMechanicalIssue: string;
  manualIssueReports: string[];
  rangeRemainingMiles: number;
  fuelLevelPercent: number;
  batteryVoltage: number;
  tirePressureStatus: 'normal' | 'watch' | 'low' | 'unknown';
  recoveryEquipmentReady: boolean;
  spareTireReady: boolean;
  payloadRiskStatus: AssessmentStatus;
}>;

const CATEGORY_ORDER: AssessmentCategory[] = [
  'overview',
  'route',
  'convoy',
  'camp',
  'logistics',
  'vehicles',
];

let contextProvider: ExpeditionAssessmentContextProvider | null = null;
let narrativeProvider: ExpeditionAssessmentNarrativeProvider | null = null;
let lastGoodContext: ExpeditionContextSnapshot | null = null;
const listeners = new Set<() => void>();

function cloneContext(context: ExpeditionContextSnapshot): ExpeditionContextSnapshot {
  return JSON.parse(JSON.stringify(context)) as ExpeditionContextSnapshot;
}

function point<T>(
  value: T,
  now: string,
  confidence: AssessmentConfidence = 'medium',
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

function assessmentMap(assessments: ExpeditionAssessment[]): Record<AssessmentCategory, ExpeditionAssessment> {
  return assessments.reduce(
    (map, assessment) => ({
      ...map,
      [assessment.category]: assessment,
    }),
    {} as Record<AssessmentCategory, ExpeditionAssessment>,
  );
}

function narrativeMap(
  narratives: ExpeditionAssessmentNarrative[],
): Record<AssessmentCategory, ExpeditionAssessmentNarrative> {
  return narratives.reduce(
    (map, narrative) => ({
      ...map,
      [narrative.category]: narrative,
    }),
    {} as Record<AssessmentCategory, ExpeditionAssessmentNarrative>,
  );
}

function templateNarratives(
  assessments: Record<AssessmentCategory, ExpeditionAssessment>,
): Record<AssessmentCategory, ExpeditionAssessmentNarrative> {
  return narrativeMap(
    CATEGORY_ORDER.map((category) =>
      buildTemplateExpeditionAssessmentNarrative(assessments[category]),
    ),
  );
}

function createUnavailableContext(): ExpeditionContextSnapshot {
  const now = new Date().toISOString();
  return {
    expeditionId: null,
    capturedAt: now,
    offlineMode: false,
    manualInputAvailable: true,
    route: {},
    convoy: {},
    camp: {},
    logistics: {},
    vehicles: [],
    notes: {
      value: 'Operational assessment unavailable until live or manual expedition data is provided.',
      source: 'unknown',
      updatedAt: now,
      confidence: 'low',
      reliability: 'unknown',
    },
  };
}

async function enrichContextWithLiveConvoyTracking(context: ExpeditionContextSnapshot): Promise<ExpeditionContextSnapshot> {
  let tracking: Awaited<ReturnType<typeof import('./convoyTrackingStore').fetchConvoyTrackingSnapshot>> | null = null;
  try {
    const convoyTracking = await import('./convoyTrackingStore');
    tracking = convoyTracking.fetchConvoyTrackingSnapshot();
  } catch {
    return context;
  }

  if (!tracking.convoyId || tracking.rawMembers.length <= 0) return context;

  return applyLiveConvoyTrackingToAssessmentContext(context, {
    convoyId: tracking.convoyId,
    members: tracking.rawMembers,
    locations: tracking.rawLocations,
    connectionStatus: tracking.connectionStatus,
    recommendedRegroupPoint: context.convoy?.recommendedRegroupPoint?.value ?? null,
  });
}

function createStateFromContext(
  context: ExpeditionContextSnapshot,
  options: { usingMockData: boolean; loading?: boolean; error?: string | null } = { usingMockData: false },
): ExpeditionAssessmentStoreState {
  const assessments = buildExpeditionOperationalAssessmentMap(context);
  return {
    contextSnapshot: context,
    assessments,
    narratives: templateNarratives(assessments),
    loading: options.loading === true,
    offline: context.offlineMode === true,
    stale: Object.values(assessments).some((assessment) => assessment.staleDataWarnings.length > 0),
    usingMockData: options.usingMockData,
    lastRefreshedAt: context.capturedAt,
    error: options.error ?? null,
  };
}

let state: ExpeditionAssessmentStoreState = createStateFromContext(createUnavailableContext(), {
  usingMockData: false,
});

function emit(): void {
  listeners.forEach((listener) => {
    try {
      listener();
    } catch {
      // Store listeners should not interrupt assessment updates.
    }
  });
}

function setState(nextState: ExpeditionAssessmentStoreState): void {
  state = nextState;
  emit();
}

async function resolveContext(): Promise<{ context: ExpeditionContextSnapshot; usingMockData: boolean }> {
  if (!contextProvider) {
    return { context: createUnavailableContext(), usingMockData: false };
  }

  const provided = await contextProvider();
  if (provided) {
    return { context: await enrichContextWithLiveConvoyTracking(cloneContext(provided)), usingMockData: false };
  }

  return { context: createUnavailableContext(), usingMockData: false };
}

async function runPipeline(
  context: ExpeditionContextSnapshot,
  usingMockData: boolean,
): Promise<ExpeditionAssessmentStoreState> {
  const assessmentsArray = buildExpeditionOperationalAssessments(context);
  const assessments = assessmentMap(assessmentsArray);
  let narratives = templateNarratives(assessments);
  let error: string | null = null;

  try {
    narratives = narrativeMap(await generateExpeditionAssessmentNarratives(assessmentsArray, narrativeProvider));
  } catch (candidateError) {
    error = candidateError instanceof Error ? candidateError.message : String(candidateError);
  }

  const nextState: ExpeditionAssessmentStoreState = {
    contextSnapshot: context,
    assessments,
    narratives,
    loading: false,
    offline: context.offlineMode === true,
    stale: Object.values(assessments).some((assessment) => assessment.staleDataWarnings.length > 0),
    usingMockData,
    lastRefreshedAt: context.capturedAt,
    error,
  };
  lastGoodContext = context;
  return nextState;
}

async function recomputeFromContext(context: ExpeditionContextSnapshot, usingMockData = false): Promise<void> {
  setState({
    ...state,
    contextSnapshot: context,
    loading: true,
    error: null,
  });
  setState(await runPipeline(context, usingMockData));
}

function patchCurrentContext(
  patcher: (context: ExpeditionContextSnapshot, now: string) => ExpeditionContextSnapshot,
): Promise<void> {
  const now = new Date().toISOString();
  const base = cloneContext(state.contextSnapshot ?? lastGoodContext ?? createUnavailableContext());
  const nextContext = patcher(
    {
      ...base,
      capturedAt: now,
      offlineMode: base.offlineMode ?? true,
      manualInputAvailable: true,
    },
    now,
  );
  return recomputeFromContext(nextContext, false);
}

export function getExpeditionAssessmentStoreSnapshot(): ExpeditionAssessmentStoreState {
  return state;
}

export function subscribeExpeditionAssessmentStore(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function setExpeditionAssessmentContextProvider(
  provider: ExpeditionAssessmentContextProvider | null,
): void {
  contextProvider = provider;
}

export function setExpeditionAssessmentNarrativeProvider(
  provider: ExpeditionAssessmentNarrativeProvider | null,
): void {
  narrativeProvider = provider;
}

export function getAssessment(category: AssessmentCategory): ExpeditionAssessment {
  return state.assessments[category];
}

export function getAllAssessments(): ExpeditionAssessment[] {
  return CATEGORY_ORDER.map((category) => state.assessments[category]);
}

export async function refreshAssessments(): Promise<ExpeditionAssessmentStoreState> {
  setState({
    ...state,
    loading: true,
    error: null,
  });

  try {
    const { context, usingMockData } = await resolveContext();
    const nextState = await runPipeline(context, usingMockData);
    setState(nextState);
    return nextState;
  } catch (error) {
    const fallbackContext = lastGoodContext ?? state.contextSnapshot ?? createUnavailableContext();
    const nextState = await runPipeline(fallbackContext, state.usingMockData);
    setState({
      ...nextState,
      error: error instanceof Error ? error.message : String(error),
    });
    return getExpeditionAssessmentStoreSnapshot();
  }
}

export async function updateManualRouteData(input: ManualRouteDataInput): Promise<void> {
  await patchCurrentContext((context, now) => {
    const route: ExpeditionRouteSnapshot = { ...(context.route ?? {}) };
    if (input.routeName !== undefined) route.routeName = point(input.routeName, now);
    if (input.currentSegmentLabel !== undefined) route.currentSegmentLabel = point(input.currentSegmentLabel, now);
    if (input.distanceRemainingMiles !== undefined) route.distanceRemainingMiles = point(input.distanceRemainingMiles, now);
    if (input.estimatedArrivalIso !== undefined) route.estimatedArrivalIso = point(input.estimatedArrivalIso, now);
    if (input.daylightRemainingAtEtaMinutes !== undefined) route.daylightRemainingAtEtaMinutes = point(input.daylightRemainingAtEtaMinutes, now);
    if (input.knownHazards !== undefined) route.knownHazards = point(input.knownHazards, now);
    if (input.offRoute !== undefined) route.offRoute = point(input.offRoute, now);
    if (input.alternateRouteAvailable !== undefined) route.alternateRouteAvailable = point(input.alternateRouteAvailable, now);
    return { ...context, route };
  });
}

export async function updateManualConvoyCheckIn(input: ManualConvoyCheckInInput): Promise<void> {
  await patchCurrentContext((context, now) => {
    const convoy: ConvoySnapshot = { ...(context.convoy ?? {}) };
    if (input.members !== undefined) convoy.members = input.members;
    if (input.teamMemberCount !== undefined) convoy.teamMemberCount = point(input.teamMemberCount, now);
    if (input.activeMemberCount !== undefined) convoy.activeMemberCount = point(input.activeMemberCount, now);
    if (input.missingMemberCount !== undefined) convoy.missingMemberCount = point(input.missingMemberCount, now);
    if (input.overdueMemberLabels !== undefined) convoy.overdueMemberLabels = point(input.overdueMemberLabels, now);
    if (input.stoppedUnexpectedlyLabels !== undefined) convoy.stoppedUnexpectedlyLabels = point(input.stoppedUnexpectedlyLabels, now);
    if (input.missedCheckpointMemberLabels !== undefined) convoy.missedCheckpointMemberLabels = point(input.missedCheckpointMemberLabels, now);
    if (input.assistanceNeededMemberLabels !== undefined) convoy.assistanceNeededMemberLabels = point(input.assistanceNeededMemberLabels, now);
    if (input.communicationsStatus !== undefined) convoy.communicationsStatus = point(input.communicationsStatus, now);
    if (input.lastCheckInAt !== undefined) convoy.lastCheckInAt = point(input.lastCheckInAt, now);
    if (input.trackingEnabled !== undefined) convoy.trackingEnabled = point(input.trackingEnabled, now);
    if (input.liveLocationMemberCount !== undefined) convoy.liveLocationMemberCount = point(input.liveLocationMemberCount, now);
    if (input.staleLocationMemberLabels !== undefined) convoy.staleLocationMemberLabels = point(input.staleLocationMemberLabels, now);
    if (input.convoySpacingMinutes !== undefined) convoy.convoySpacingMinutes = point(input.convoySpacingMinutes, now);
    if (input.leadSweepSeparationMiles !== undefined) convoy.leadSweepSeparationMiles = point(input.leadSweepSeparationMiles, now);
    if (input.recommendedRegroupPoint !== undefined) convoy.recommendedRegroupPoint = point(input.recommendedRegroupPoint, now);
    return { ...context, convoy };
  });
}

export async function updateManualCampStatus(input: ManualCampStatusInput): Promise<void> {
  await patchCurrentContext((context, now) => {
    const camp: CampSnapshot = { ...(context.camp ?? {}) };
    if (input.hasRouteCamps !== undefined) camp.hasRouteCamps = point(input.hasRouteCamps, now);
    if (input.plannedCampStatus !== undefined) camp.plannedCampStatus = point(input.plannedCampStatus, now);
    if (input.nextCampName !== undefined) camp.nextCampName = point(input.nextCampName, now);
    if (input.estimatedArrivalIso !== undefined) camp.estimatedArrivalIso = point(input.estimatedArrivalIso, now);
    if (input.distanceToNextCampMiles !== undefined) camp.distanceToNextCampMiles = point(input.distanceToNextCampMiles, now);
    if (input.campReadinessStatus !== undefined) camp.campReadinessStatus = point(input.campReadinessStatus, now);
    if (input.campSafetyStatus !== undefined) camp.campSafetyStatus = point(input.campSafetyStatus, now);
    if (input.daylightRemainingAtArrivalMinutes !== undefined) camp.daylightRemainingAtArrivalMinutes = point(input.daylightRemainingAtArrivalMinutes, now);
    if (input.campConfirmed !== undefined) camp.campConfirmed = point(input.campConfirmed, now);
    if (input.arrivalBeforeDark !== undefined) camp.arrivalBeforeDark = point(input.arrivalBeforeDark, now);
    if (input.safeSetupBeforeDark !== undefined) camp.safeSetupBeforeDark = point(input.safeSetupBeforeDark, now);
    if (input.alternateCampAvailable !== undefined) camp.alternateCampAvailable = point(input.alternateCampAvailable, now);
    if (input.alternateCampLabel !== undefined) camp.alternateCampLabel = point(input.alternateCampLabel, now);
    if (input.alternateCampImprovesDaylightMargin !== undefined) camp.alternateCampImprovesDaylightMargin = point(input.alternateCampImprovesDaylightMargin, now);
    if (input.alternateCampFuelRisk !== undefined) camp.alternateCampFuelRisk = point(input.alternateCampFuelRisk, now);
    if (input.weatherExposure !== undefined) camp.weatherExposure = point(input.weatherExposure, now);
    if (input.sunsetIso !== undefined) camp.sunsetIso = point(input.sunsetIso, now);
    if (input.windMph !== undefined) camp.windMph = point(input.windMph, now);
    if (input.temperatureF !== undefined) camp.temperatureF = point(input.temperatureF, now);
    if (input.precipitationChancePercent !== undefined) camp.precipitationChancePercent = point(input.precipitationChancePercent, now);
    if (input.routeDifficultyRemaining !== undefined) camp.routeDifficultyRemaining = point(input.routeDifficultyRemaining, now);
    if (input.convoyArrivalConfidence !== undefined) camp.convoyArrivalConfidence = point(input.convoyArrivalConfidence, now);
    if (input.overnightFuelReady !== undefined) camp.overnightFuelReady = point(input.overnightFuelReady, now);
    if (input.overnightWaterReady !== undefined) camp.overnightWaterReady = point(input.overnightWaterReady, now);
    if (input.overnightPowerReady !== undefined) camp.overnightPowerReady = point(input.overnightPowerReady, now);
    return { ...context, camp };
  });
}

export async function updateManualLogisticsData(input: ManualLogisticsDataInput): Promise<void> {
  await patchCurrentContext((context, now) => {
    const logistics: LogisticsSnapshot = { ...(context.logistics ?? {}) };
    if (input.fuelRangeMiles !== undefined) logistics.fuelRangeMiles = point(input.fuelRangeMiles, now);
    if (input.distanceRemainingMiles !== undefined) logistics.distanceRemainingMiles = point(input.distanceRemainingMiles, now);
    if (input.nextCheckpointLabel !== undefined) logistics.nextCheckpointLabel = point(input.nextCheckpointLabel, now);
    if (input.distanceToNextCheckpointMiles !== undefined) logistics.distanceToNextCheckpointMiles = point(input.distanceToNextCheckpointMiles, now);
    if (input.fuelReserveToNextCheckpointMiles !== undefined) logistics.fuelReserveToNextCheckpointMiles = point(input.fuelReserveToNextCheckpointMiles, now);
    if (input.fuelReserveToCampMiles !== undefined) logistics.fuelReserveToCampMiles = point(input.fuelReserveToCampMiles, now);
    if (input.fuelReserveToResupplyMiles !== undefined) logistics.fuelReserveToResupplyMiles = point(input.fuelReserveToResupplyMiles, now);
    if (input.waterRemainingLiters !== undefined) logistics.waterRemainingLiters = point(input.waterRemainingLiters, now);
    if (input.waterEnduranceDays !== undefined) logistics.waterEnduranceDays = point(input.waterEnduranceDays, now);
    if (input.foodDaysRemaining !== undefined) logistics.foodDaysRemaining = point(input.foodDaysRemaining, now);
    if (input.groupSize !== undefined) logistics.groupSize = point(input.groupSize, now);
    if (input.powerHoursRemaining !== undefined) logistics.powerHoursRemaining = point(input.powerHoursRemaining, now);
    if (input.batteryPowerStatus !== undefined) logistics.batteryPowerStatus = point(input.batteryPowerStatus, now);
    if (input.timeToResupplyHours !== undefined) logistics.timeToResupplyHours = point(input.timeToResupplyHours, now);
    if (input.distanceToResupplyMiles !== undefined) logistics.distanceToResupplyMiles = point(input.distanceToResupplyMiles, now);
    if (input.limitingResource !== undefined) logistics.limitingResource = point(input.limitingResource, now);
    if (input.shelterReady !== undefined) logistics.shelterReady = point(input.shelterReady, now);
    if (input.warmthReady !== undefined) logistics.warmthReady = point(input.warmthReady, now);
    if (input.medicalKitReady !== undefined) logistics.medicalKitReady = point(input.medicalKitReady, now);
    if (input.criticalEquipmentReady !== undefined) logistics.criticalEquipmentReady = point(input.criticalEquipmentReady, now);
    if (input.criticalEquipmentIssues !== undefined) logistics.criticalEquipmentIssues = point(input.criticalEquipmentIssues, now);
    if (input.lastResupplyCompletedAt !== undefined) logistics.lastResupplyCompletedAt = point(input.lastResupplyCompletedAt, now);
    if (input.supplyStatus !== undefined) logistics.supplyStatus = point(input.supplyStatus, now);
    if (input.criticalSupplyWarnings !== undefined) logistics.criticalSupplyWarnings = point(input.criticalSupplyWarnings, now);
    return { ...context, logistics };
  });
}

export async function updateManualVehicleStatus(input: ManualVehicleStatusInput): Promise<void> {
  await patchCurrentContext((context, now) => {
    const vehicles: VehicleSnapshot[] = [...(context.vehicles ?? [])];
    const targetIndex = vehicles.findIndex((vehicle) => vehicle.vehicleId === input.vehicleId);
    const vehicle: VehicleSnapshot = targetIndex >= 0
      ? { ...vehicles[targetIndex] }
      : { vehicleId: input.vehicleId ?? `manual-vehicle-${vehicles.length + 1}` };
    if (input.callsign !== undefined) vehicle.callsign = point(input.callsign, now);
    if (input.label !== undefined) vehicle.label = point(input.label, now);
    if (input.driverName !== undefined) vehicle.driverName = point(input.driverName, now);
    if (input.readinessStatus !== undefined) vehicle.readinessStatus = point(input.readinessStatus, now);
    if (input.engineStatus !== undefined) vehicle.engineStatus = point(input.engineStatus, now);
    if (input.engineTemperatureF !== undefined) vehicle.engineTemperatureF = point(input.engineTemperatureF, now);
    if (input.engineFaultCodes !== undefined) vehicle.engineFaultCodes = point(input.engineFaultCodes, now);
    if (input.disabled !== undefined) vehicle.disabled = point(input.disabled, now);
    if (input.activeMechanicalIssue !== undefined) vehicle.activeMechanicalIssue = point(input.activeMechanicalIssue, now);
    if (input.manualIssueReports !== undefined) vehicle.manualIssueReports = point(input.manualIssueReports, now);
    if (input.rangeRemainingMiles !== undefined) vehicle.rangeRemainingMiles = point(input.rangeRemainingMiles, now);
    if (input.fuelLevelPercent !== undefined) vehicle.fuelLevelPercent = point(input.fuelLevelPercent, now);
    if (input.batteryVoltage !== undefined) vehicle.batteryVoltage = point(input.batteryVoltage, now);
    if (input.tirePressureStatus !== undefined) vehicle.tirePressureStatus = point(input.tirePressureStatus, now);
    if (input.recoveryEquipmentReady !== undefined) vehicle.recoveryEquipmentReady = point(input.recoveryEquipmentReady, now);
    if (input.spareTireReady !== undefined) vehicle.spareTireReady = point(input.spareTireReady, now);
    if (input.payloadRiskStatus !== undefined) vehicle.payloadRiskStatus = point(input.payloadRiskStatus, now);
    if (targetIndex >= 0) vehicles[targetIndex] = vehicle;
    else vehicles.push(vehicle);
    return { ...context, vehicles };
  });
}

export async function applyManualAssessmentAction(
  actionId: ManualExpeditionActionId,
): Promise<void> {
  await patchCurrentContext((context, now) =>
    applyManualExpeditionAction(context, actionId, now).context,
  );
}

export function resetExpeditionAssessmentStore(): void {
  contextProvider = null;
  narrativeProvider = null;
  lastGoodContext = null;
  setState(createStateFromContext(createUnavailableContext(), { usingMockData: false }));
}

export function useExpeditionAssessmentStore(): ExpeditionAssessmentStoreState & {
  getAssessment: typeof getAssessment;
  getAllAssessments: typeof getAllAssessments;
  refreshAssessments: typeof refreshAssessments;
  updateManualRouteData: typeof updateManualRouteData;
  updateManualConvoyCheckIn: typeof updateManualConvoyCheckIn;
  updateManualCampStatus: typeof updateManualCampStatus;
  updateManualLogisticsData: typeof updateManualLogisticsData;
  updateManualVehicleStatus: typeof updateManualVehicleStatus;
  applyManualAssessmentAction: typeof applyManualAssessmentAction;
} {
  const snapshot = useSyncExternalStore(
    subscribeExpeditionAssessmentStore,
    getExpeditionAssessmentStoreSnapshot,
    getExpeditionAssessmentStoreSnapshot,
  );

  return {
    ...snapshot,
    getAssessment,
    getAllAssessments,
    refreshAssessments,
    updateManualRouteData,
    updateManualConvoyCheckIn,
    updateManualCampStatus,
    updateManualLogisticsData,
    updateManualVehicleStatus,
    applyManualAssessmentAction,
  };
}

export const expeditionAssessmentStore = {
  getSnapshot: getExpeditionAssessmentStoreSnapshot,
  subscribe: subscribeExpeditionAssessmentStore,
  setContextProvider: setExpeditionAssessmentContextProvider,
  setNarrativeProvider: setExpeditionAssessmentNarrativeProvider,
  getAssessment,
  getAllAssessments,
  refreshAssessments,
  updateManualRouteData,
  updateManualConvoyCheckIn,
  updateManualCampStatus,
  updateManualLogisticsData,
  updateManualVehicleStatus,
  applyManualAssessmentAction,
  reset: resetExpeditionAssessmentStore,
};
