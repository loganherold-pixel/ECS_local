import {
  processSignals,
  createInitialProcessorMemory,
  DEFAULT_SIGNAL_PROCESSOR_OPTIONS,
  type AIContext,
  type ProcessorMemory,
  type ProcessSignalResult,
  type Signal,
  type SignalProcessorOptions,
} from './signalProcessor';

import {
  generateMissionBrief,
  type MissionBrief,
  type MissionBriefLine,
  type MissionBriefStatus,
} from '../missionBriefEngine';
import type { ECSPriorityResult } from './priorityTypes';
import {
  assessGpsPriority,
  assessOfflinePriority,
  applyTrustModeToPriorityResult,
  assessResourcePriority,
  assessTelemetryPriority,
  assessVehicleFitPriority,
  assessWeatherPriority,
  priorityFromSignal,
  selectPrimaryPriority,
} from './priorityEngine';
import { assessTelemetryConfidence } from './confidenceEngine';

import {
  buildAIContextFromLiveState,
  type ECSAIContext,
  type ECSAILiveStateBridge,
} from '../aiContextBuilder';
import { applyCandidateDeduplication } from './candidateDeduplicationEngine';
import { buildCommandStateDiagnostics } from './commandStateInvariantChecks';
import { buildFusedWeatherRouteAdvisory } from './fusedWeatherRouteAdvisoryEngine';
import { computeMissionScenario } from './missionScenarioEngine';
import { computeOfflineReadiness } from './offlineReadinessEngine';
import { buildReleaseReadinessDiagnostics } from './releaseReadinessChecks';
import { computeRouteViability } from './routeViabilityEngine';
import { hardenCommandStateCandidates } from './staleCandidateResolver';
import { evaluateVehicleFit } from './vehicleFitEngine';
import type { ECSOperationalState } from './degradedOperationsTypes';
import type { ECSExpeditionPhase } from './expeditionPhaseTypes';
import { operatorTrustModeStore } from './operatorTrustMode';
import {
  trustModeCandidateScoreAdjustment,
  trustModePresentationExplanation,
  trustModeSecondaryLimit,
  trustModeSupportsSecondary,
  trustModeSuppressesPassiveCandidate,
} from './operatorTrustResolvers';
import type { ECSOperatorTrustMode } from './operatorTrustTypes';
import { explainRecommendation } from './recommendationExplanationEngine';
import type { ECSOrchestratorCandidate, ECSOrchestratorOutput } from './orchestratorTypes';
import type { ECSLiveStatusMap } from '../status/liveStatusTypes';
import { selectLiveStatusForSource } from '../status/liveStatusResolver';
import {
  runECSAIAdvisoryEngine,
  type ECSAIAdvisory,
  type ECSAISuppressionState,
} from './index';
import {
  buildTrustMetadata,
  gateCandidateTrust,
  prependTrustWording,
  withTrustDecision,
} from './trustContract';
import type { ECSTrustFreshnessClass } from './trustFreshness';
import { buildVehicleProfile } from '../rigCompatibilityEngine';
import { extractFleetFabricPayload } from '../fleet/fleetFabricService';
import type { ExpeditionReadinessAssessment } from '../readiness/expeditionReadinessTypes';

export type ECSCommandMode =
  | 'standby'
  | 'highway'
  | 'expedition'
  | 'critical';

export type ECSCommandTone =
  | 'calm'
  | 'directive'
  | 'command'
  | 'critical';

export type ECSCommandIdentity = {
  mode: ECSCommandMode;
  tone: ECSCommandTone;
  address: string;
  label: string;
  accentLevel: 0 | 1 | 2 | 3;
};

export type ECSMissionReadiness =
  | 'offline'
  | 'limited'
  | 'ready'
  | 'elevated'
  | 'critical';

export type ECSAIState = {
  now: number;
  active: boolean;
  readiness: ECSMissionReadiness;
  identity: ECSCommandIdentity;
  context: AIContext;
  richContext: ECSAIContext | null;
  signals: Signal[];
  suppressedSignals: Signal[];
  topSignal: Signal | null;
  topPriority: ECSPriorityResult | null;
  brief: MissionBrief | null;
  operationalState: ECSOperationalState | null;
  operationalSummary: string | null;
  expeditionPhase: ECSExpeditionPhase | null;
  expeditionPhaseLabel: string | null;
  liveStatus: ECSLiveStatusMap | null;
  operatorTrustMode: ECSOperatorTrustMode;
  orchestrator: ECSOrchestratorOutput | null;
  advisories: ECSAIAdvisory[];
  suppressedAdvisories: ECSAIAdvisory[];
  summaryLine: string;
  compactLine: string;
  telemetryConfidence: number;
  weatherConfidence: number;
  routeConfidence: number;
  powerConfidence: number;
};

export type ECSAIOrchestratorMemory = {
  processor: ProcessorMemory;
  lastState: ECSAIState | null;
  lastRunAt: number | null;
  advisorySuppressionState: ECSAISuppressionState;
};

export type ECSAIActivationInput = {
  activeRun?: unknown;
  vehicleConfig?: unknown;
  telemetry?: unknown;
  weatherCorridor?: unknown;
  routeIntelligence?: unknown;
  remoteness?: unknown;
  resources?: unknown;
  userPreferences?: unknown;
  powerAuthority?: unknown;
  expeditionReadiness?: ExpeditionReadinessAssessment | null;
  previousAIState?: ECSAIState | null;
};

export type ECSAIOrchestratorOptions = {
  enableWhenIdle: boolean;
  emitBriefWhenNoSignals: boolean;
  forceActive: boolean;
  signalOptions?: Partial<SignalProcessorOptions>;
};

export const DEFAULT_AI_ORCHESTRATOR_OPTIONS: ECSAIOrchestratorOptions = {
  enableWhenIdle: false,
  emitBriefWhenNoSignals: true,
  forceActive: false,
  signalOptions: DEFAULT_SIGNAL_PROCESSOR_OPTIONS,
};

export function createInitialAIOrchestratorMemory(): ECSAIOrchestratorMemory {
  return {
    processor: createInitialProcessorMemory(),
    lastState: null,
    lastRunAt: null,
    advisorySuppressionState: {},
  };
}

export async function runECSAI(
  input: ECSAIActivationInput,
  memory: ECSAIOrchestratorMemory = createInitialAIOrchestratorMemory(),
  options: Partial<ECSAIOrchestratorOptions> = {},
): Promise<{
  state: ECSAIState;
  memory: ECSAIOrchestratorMemory;
  signalResult: ProcessSignalResult;
}> {
  const config: ECSAIOrchestratorOptions = {
    ...DEFAULT_AI_ORCHESTRATOR_OPTIONS,
    ...options,
    signalOptions: {
      ...DEFAULT_SIGNAL_PROCESSOR_OPTIONS,
      ...(options.signalOptions ?? {}),
    },
  };

  const now = Date.now();
  const fallbackContext = buildFallbackContext(input, now, memory.lastState);
  const liveState = buildLiveStateBridge(input, now);
  const richContext = await safelyBuildRichContext(liveState);
  const context = mergeSignalContext(fallbackContext, richContext, now);
  const activation = computeActivation(context, config);
  const confidence = computeConfidence(context);
  const operatorTrustMode = operatorTrustModeStore.mode;

  const signalResult = processSignals(
    context,
    memory.processor,
    config.signalOptions,
  );

  const topSignal = signalResult.signals[0] ?? null;

  const identity = buildCommandIdentity({
    active: activation.active,
    context,
    topSignal,
  });

  const brief = buildMissionBriefSafely({
    richContext,
    context,
    signals: signalResult.signals,
    identity,
    emitWhenNoSignals: config.emitBriefWhenNoSignals,
    operatorTrustMode,
  });
  const preliminaryPriority = selectPrimaryPriority([
    brief?.priority ?? null,
    priorityFromSignal(topSignal),
  ]);
  const orchestrator = buildOrchestratorOutput({
    now,
    richContext,
    brief,
    topSignal,
    fallbackPriority: preliminaryPriority,
    operatorTrustMode,
    expeditionReadiness: input.expeditionReadiness ?? null,
    previousOutput:
      input.previousAIState?.orchestrator
      ?? memory.lastState?.orchestrator
      ?? null,
  });
  const topPriority = selectPrimaryPriority([
    orchestrator?.primary?.priority ?? null,
    brief?.priority ?? null,
    priorityFromSignal(topSignal),
  ]);
  const advisoryResult = runECSAIAdvisoryEngine({
    context: richContext,
    surface: 'dashboard',
    previousSuppressionState: memory.advisorySuppressionState,
    now,
  });

  const readiness = computeReadiness({
    context,
    signals: signalResult.signals,
    active: activation.active,
    confidence,
    topPriority,
  });

  const summaryLine = buildSummaryLine({
    readiness,
    identity,
    brief,
    primaryCandidate: orchestrator?.primary ?? null,
    topSignal,
    topPriority,
    context,
  });

  const compactLine = buildCompactLine({
    primaryCandidate: orchestrator?.primary ?? null,
    topSignal,
    topPriority,
    brief,
    readiness,
    active: activation.active,
  });

  const state: ECSAIState = {
    now,
    active: activation.active,
    readiness,
    identity,
    context,
    richContext,
    signals: signalResult.signals,
    suppressedSignals: signalResult.suppressed,
    topSignal,
    topPriority,
    brief,
    operationalState: richContext?.operations?.degraded.state ?? brief?.operations?.state ?? null,
    operationalSummary: richContext?.operations?.degraded.summary ?? brief?.operations?.summary ?? null,
    expeditionPhase: richContext?.phase?.current.phase ?? brief?.phase?.phase ?? null,
    expeditionPhaseLabel: richContext?.phase?.current.label ?? brief?.phase?.label ?? null,
    liveStatus: richContext?.liveStatus ?? null,
    operatorTrustMode,
    orchestrator,
    advisories: advisoryResult.advisories,
    suppressedAdvisories: advisoryResult.suppressedAdvisories,
    summaryLine,
    compactLine,
    telemetryConfidence: confidence.telemetry,
    weatherConfidence: confidence.weather,
    routeConfidence: confidence.route,
    powerConfidence: confidence.power,
  };

  const nextMemory: ECSAIOrchestratorMemory = {
    processor: signalResult.memory,
    lastState: state,
    lastRunAt: now,
    advisorySuppressionState: advisoryResult.suppressionState,
  };

  return {
    state,
    memory: nextMemory,
    signalResult,
  };
}

async function safelyBuildRichContext(
  liveState: ECSAILiveStateBridge | null,
): Promise<ECSAIContext | null> {
  try {
    return await buildAIContextFromLiveState(liveState, {
      liveState,
    });
  } catch {
    return null;
  }
}

function buildLiveStateBridge(
  input: ECSAIActivationInput,
  now: number,
): ECSAILiveStateBridge | null {
  const activeRun = asRecord(input.activeRun);
  const vehicleConfig = asRecord(input.vehicleConfig);
  const fleetFabric = extractFleetFabricPayload(input.vehicleConfig);
  const telemetry = asRecord(input.telemetry);
  const weatherCorridor = asRecord(input.weatherCorridor);
  const routeIntelligence = asRecord(input.routeIntelligence);
  const remoteness = asRecord(input.remoteness);
  const resources = asRecord(input.resources);
  const powerAuthority = asRecord(input.powerAuthority);

  const weatherSeverity =
    safeNumber(weatherCorridor.weatherSeverity) ??
    safeNumber(weatherCorridor.severity) ??
    null;

  const weatherSource =
    safeString(weatherCorridor.source) === 'cache'
      ? 'cache'
      : safeString(weatherCorridor.source) === 'live'
        ? 'live'
        : 'none';
  const bridgedWeatherCurrent =
    weatherCorridor.current && typeof weatherCorridor.current === 'object'
      ? (weatherCorridor.current as any)
      : null;
  const bridgedWeatherResponse =
    weatherCorridor.response && typeof weatherCorridor.response === 'object'
      ? (weatherCorridor.response as any)
      : null;

  const bridge: ECSAILiveStateBridge = {
    builtAt: new Date(now).toISOString(),
    route: {
      activeRun: Object.keys(activeRun).length ? (input.activeRun as any) : undefined,
      routeIntelligence: Object.keys(routeIntelligence).length ? (input.routeIntelligence as any) : undefined,
    },
    environment: {
      remoteness: Object.keys(remoteness).length ? (input.remoteness as any) : undefined,
      weather: {
        current: bridgedWeatherCurrent,
        response: bridgedWeatherResponse,
        source: weatherSource,
        staleness: normalizeWeatherStaleness(safeString(weatherCorridor.staleness)),
        ageLabel: safeString(weatherCorridor.ageLabel),
        severity: normalizeWeatherSeverityLabel(weatherSeverity),
        summaryLabel:
          safeString(weatherCorridor.summaryLabel) ??
          safeString(weatherCorridor.label) ??
          null,
      },
    },
    resources: {
      telemetryReadout: buildTelemetryReadoutBridge(telemetry, powerAuthority),
      forecast: null,
      vehicleIntelligence: buildFleetFabricVehicleIntelligenceBridge(fleetFabric),
    },
    summary: {
      missionName:
        safeString(activeRun.title) ??
        safeString(activeRun.name) ??
        null,
      vehicleName:
        safeString(fleetFabric?.vehicle.nickname) ??
        safeString(vehicleConfig.name) ??
        safeString(vehicleConfig.vehicle_name) ??
        null,
      vehicleClass: fleetFabric?.vehicleIntelligence.classification.label ?? null,
      vehicleWeightConfidence: fleetFabric?.vehicleIntelligence.weightConfidenceLevel ?? null,
      routeName:
        safeString(routeIntelligence.routeName) ??
        safeString(activeRun.routeName) ??
        null,
      remotenessTier: safeString(remoteness.tier),
      remotenessScore: safeNumber(remoteness.score),
      riskLevel: safeString(routeIntelligence.riskLevel),
      forecastLevel: safeString(resources.forecastLevel),
      telemetryState:
        safeString(powerAuthority.freshness) ??
        safeString(powerAuthority.status) ??
        safeString(telemetry.state) ??
        null,
      gpsStatus: safeString(telemetry.gpsStatus),
      connectivityLevel: safeString(resources.connectivityLevel),
      weatherLevel: normalizeWeatherSeverityLabel(weatherSeverity),
      criticalIssues: buildCriticalIssues({ telemetry, powerAuthority, resources, routeIntelligence, weatherSeverity }),
    },
  };

  const hasPayload =
    !!bridge.route?.activeRun ||
    !!bridge.route?.routeIntelligence ||
    !!bridge.environment?.weather?.current ||
    !!bridge.environment?.weather?.response ||
    !!bridge.environment?.remoteness ||
    !!bridge.resources?.telemetryReadout ||
    !!bridge.environment?.weather?.summaryLabel ||
    (bridge.summary?.criticalIssues?.length ?? 0) > 0 ||
    !!fleetFabric;

  return hasPayload ? bridge : null;
}

function buildFleetFabricVehicleIntelligenceBridge(fleetFabric: ReturnType<typeof extractFleetFabricPayload>): any | null {
  if (!fleetFabric?.vehicleIntelligence) return null;
  const intelligence = fleetFabric.vehicleIntelligence;
  return {
    available: true,
    activeVehicleId: fleetFabric.vehicle.id ?? null,
    vehicleId: fleetFabric.vehicle.id ?? null,
    identityLabel: fleetFabric.vehicle.nickname ?? null,
    knownAttributes: {
      vehicleType: fleetFabric.vehicle.vehicleType ?? null,
      drivetrain: fleetFabric.build.drivetrain ?? null,
      engine: fleetFabric.build.engine ?? null,
      fuelType: fleetFabric.build.resourceProfile?.fuelType ?? null,
      body: fleetFabric.vehicle.vehicleType ?? null,
    },
    classId: intelligence.classification.classId,
    classLabel: intelligence.classification.label,
    classConfidence: intelligence.classification.confidence,
    classReasons: intelligence.classification.reasons,
    classTraits: intelligence.classification.traits,
    weightSnapshot: {
      vehicleId: fleetFabric.vehicle.id ?? null,
      baseWeightLbs: fleetFabric.weight.baseNetWeight?.lbs ?? null,
      gvwrLbs: fleetFabric.weight.gvwr?.lbs ?? null,
      accessoryWeightLbs: fleetFabric.weight.installedAccessoryWeight?.lbs ?? 0,
      cargoLoadoutWeightLbs: fleetFabric.weight.activeLoadoutWeight?.lbs ?? 0,
      consumablesWeightLbs: fleetFabric.weight.consumablesWeight?.lbs ?? 0,
      knownContributionsWeightLbs: fleetFabric.weight.operatingWeight?.lbs ?? 0,
      estimatedOperatingWeightLbs: intelligence.operatingWeightLbs,
      remainingPayloadLbs: intelligence.remainingPayloadLbs,
      payloadCapacityLbs: fleetFabric.weight.payloadCapacity?.lbs ?? null,
      payloadUsedPct: intelligence.payloadUsedPct,
      gvwrOverageRisk: fleetFabric.weight.gvwrOverageRisk,
      weightConfidence: fleetFabric.weight.confidence,
      confidenceLabel: 'medium',
      confidenceLevel: intelligence.weightConfidenceLevel,
      confidenceCopy: fleetFabric.weight.confidenceMetadata?.copy ?? null,
      isEstimate: intelligence.weightConfidenceLevel !== 'verified',
      isPartial: intelligence.weightConfidenceLevel === 'incomplete' || intelligence.weightConfidenceLevel === 'unknown',
      sourceLabels: [],
      partialDataReasons: fleetFabric.weight.confidenceMetadata?.reasons ?? [],
      warnings: fleetFabric.weight.warnings ?? [],
    },
    capabilitySnapshot: {
      vehicleId: fleetFabric.vehicle.id ?? null,
      hasVehicle: true,
      fuelTankCapacityGal: fleetFabric.build.resourceProfile?.fuelTankCapacityGal ?? null,
      fuelType: fleetFabric.build.resourceProfile?.fuelType ?? null,
      currentFuelPercent: fleetFabric.build.resourceProfile?.currentFuelPercent ?? null,
      currentFuelGallons: fleetFabric.build.resourceProfile?.currentFuelGallons ?? 0,
      waterCapacityGal: fleetFabric.build.resourceProfile?.waterCapacityGal ?? null,
      currentWaterGallons: fleetFabric.build.resourceProfile?.currentWaterGallons ?? 0,
      batteryUsableWh: null,
      tireSizeInches: fleetFabric.build.tireSizeInches ?? null,
      suspensionLiftInches: fleetFabric.build.suspensionLiftInches ?? null,
      isLeveled: fleetFabric.build.isLeveled ?? false,
      useCaseChips: fleetFabric.buildMetadata.useCases ?? [],
      confidenceLabel: 'medium',
    },
    modificationSnapshot: {
      accessoryCount: fleetFabric.accessories.length,
      accessoryWeightLbs: fleetFabric.weight.installedAccessoryWeight?.lbs ?? 0,
      containerZoneCount: fleetFabric.compartments.length,
      tireSizeInches: fleetFabric.build.tireSizeInches ?? null,
      suspensionLiftInches: fleetFabric.build.suspensionLiftInches ?? null,
      isLeveled: fleetFabric.build.isLeveled ?? false,
      frontLevelInches: fleetFabric.build.frontLevelInches ?? null,
    },
    loadoutSnapshot: {
      activeLoadoutId: fleetFabric.activeLoadout.id,
      activeLoadoutName: fleetFabric.activeLoadout.name,
      itemCount: fleetFabric.activeLoadout.items.length,
      cargoLoadoutWeightLbs: fleetFabric.weight.activeLoadoutWeight?.lbs ?? 0,
    },
    centerOfGravitySnapshot: {
      riskLevel: fleetFabric.weight.topHeavyRisk,
      topHeavyRisk: fleetFabric.weight.topHeavyRisk,
      frontAxleRisk: fleetFabric.weight.frontAxleRisk,
      rearAxleRisk: fleetFabric.weight.rearAxleRisk,
      x: null,
      y: null,
      z: null,
      totalKnownWeightLbs: null,
      dataQuality: null,
      warnings: fleetFabric.weight.warnings ?? [],
    },
    suggestions: intelligence.suggestions,
    confidence: {
      score: fleetFabric.weight.confidence,
      label: 'medium',
      reasons: fleetFabric.weight.confidenceMetadata?.reasons ?? [],
    },
    status: 'ready',
  };
}

function buildTelemetryReadoutBridge(
  telemetry: Record<string, unknown>,
  powerAuthority: Record<string, unknown>,
): any | null {
  const state =
    normalizeTelemetryState(
      safeString(powerAuthority.freshness) ??
      safeString(powerAuthority.status) ??
      safeString(telemetry.state),
    );

  const provider =
    safeString(powerAuthority.providerLabel) ??
    safeString(powerAuthority.provider) ??
    safeString(powerAuthority.activeProvider) ??
    null;

  const device =
    safeString(powerAuthority.deviceLabel) ??
    safeString(powerAuthority.deviceName) ??
    safeString(powerAuthority.device) ??
    null;

  const batteryPercent =
    safeNumber(powerAuthority.batteryPercent) ??
    safeNumber(powerAuthority.powerPercent) ??
    safeNumber(telemetry.batteryPercent) ??
    null;

  const runtimeHours =
    safeNumber(powerAuthority.runtimeHours) ??
    (() => {
      const minutes = safeNumber(powerAuthority.runtimeMinutes);
      return minutes != null ? minutes / 60 : null;
    })();

  const wattsIn =
    safeNumber(powerAuthority.inputWatts) ??
    safeNumber(powerAuthority.wattsIn) ??
    null;

  const wattsOut =
    safeNumber(powerAuthority.outputWatts) ??
    safeNumber(powerAuthority.wattsOut) ??
    null;

  const solarWatts =
    safeNumber(powerAuthority.solarWatts) ??
    safeNumber(powerAuthority.solarInputWatts) ??
    null;

  const lastUpdatedAt =
    safeString(powerAuthority.lastUpdatedAt) ??
    safeString(powerAuthority.updatedAt) ??
    null;

  if (
    !state &&
    provider == null &&
    device == null &&
    batteryPercent == null &&
    runtimeHours == null &&
    wattsIn == null &&
    wattsOut == null &&
    solarWatts == null
  ) {
    return null;
  }

  return {
    state: state ?? 'PARTIAL',
    battery_percent: batteryPercent,
    batteryPercent,
    batteryHoursRemaining: runtimeHours,
    runtimeHours,
    inputWatts: wattsIn,
    outputWatts: wattsOut,
    solarWatts,
    provider,
    device,
    freshness:
      safeString(powerAuthority.freshness) ??
      safeString(powerAuthority.status) ??
      null,
    lastUpdatedAt,
    source: 'blu_power_authority',
  };
}

function mergeSignalContext(
  fallback: AIContext,
  rich: ECSAIContext | null,
  now: number,
): AIContext {
  if (!rich) {
    return {
      timestamp: now,
      ...fallback,
    };
  }

  const telemetryState = rich.resources.telemetryReadout?.state ?? null;
  const terrainRisk = rich.risk.terrainRisk?.riskLevel ?? null;
  const alertsCount =
    Array.isArray((rich.environment.weather.response as any)?.alerts)
      ? (rich.environment.weather.response as any).alerts.length
      : 0;

  const derivedWeatherSeverity = deriveWeatherSeverity({
    alertsCount,
    weatherSource: rich.environment.weather.source,
    warnings: rich.meta.warnings,
    explicitSeverity: rich.environment.weather.severity,
  });

  const telemetryBattery =
    safeNumber((rich.resources.telemetryReadout as any)?.batteryPercent) ??
    safeNumber((rich.resources.telemetryReadout as any)?.battery_percent) ??
    null;

  const powerPercent =
    fallback.resources?.powerPercent ??
    telemetryBattery ??
    safeNumber((rich.resources.forecast as any)?.powerReservePercent) ??
    null;

  return {
    timestamp: now,
    mission: {
      status:
        fallback.mission?.status ??
        (rich.meta.hasActiveExpedition ? 'active' : 'idle'),
      progress:
        fallback.mission?.progress ??
        clamp01((rich.route.progress.progressPercent ?? 0) / 100),
      checkpointName: fallback.mission?.checkpointName ?? null,
    },
    vehicle: {
      healthScore:
        fallback.vehicle?.healthScore ??
        deriveHealthScore(telemetryState),
      payloadMargin:
        fallback.vehicle?.payloadMargin ??
        rich.resources.vehicleIntelligence?.weightSnapshot.remainingPayloadLbs ??
        null,
      payloadUsedPct:
        fallback.vehicle?.payloadUsedPct ??
        rich.resources.vehicleIntelligence?.weightSnapshot.payloadUsedPct ??
        null,
      operatingWeightLbs:
        fallback.vehicle?.operatingWeightLbs ??
        rich.resources.vehicleIntelligence?.weightSnapshot.estimatedOperatingWeightLbs ??
        null,
      vehicleClass:
        fallback.vehicle?.vehicleClass ??
        rich.resources.vehicleIntelligence?.classId ??
        null,
      vehicleClassLabel:
        fallback.vehicle?.vehicleClassLabel ??
        rich.resources.vehicleIntelligence?.classLabel ??
        null,
      weightConfidence:
        fallback.vehicle?.weightConfidence ??
        rich.resources.vehicleIntelligence?.weightSnapshot.confidenceLevel ??
        null,
      fuelPercent: fallback.vehicle?.fuelPercent ?? null,
      batteryPercent:
        fallback.vehicle?.batteryPercent ??
        telemetryBattery,
      coolantTempF: fallback.vehicle?.coolantTempF ?? null,
      oilTempF: fallback.vehicle?.oilTempF ?? null,
      tirePressureLow: fallback.vehicle?.tirePressureLow ?? null,
      checkEngine: fallback.vehicle?.checkEngine ?? null,
    },
    environment: {
      weatherSeverity:
        fallback.environment?.weatherSeverity ?? derivedWeatherSeverity,
      windMph: fallback.environment?.windMph ?? null,
      visibilityMiles: fallback.environment?.visibilityMiles ?? null,
      precipitationIntensity: fallback.environment?.precipitationIntensity ?? null,
      temperatureF: fallback.environment?.temperatureF ?? null,
      remotenessScore:
        fallback.environment?.remotenessScore ??
        rich.summary.remotenessScore ??
        null,
      alertsCount:
        fallback.environment?.alertsCount ?? alertsCount,
    },
    route: {
      distanceRemainingMiles:
        fallback.route?.distanceRemainingMiles ??
        safeNumber((rich.route.routeIntelligence as any)?.distanceRemainingMiles) ??
        safeNumber((rich.route.routeIntelligence as any)?.remainingDistanceMiles) ??
        safeNumber((rich.route.activeRun as any)?.distanceRemainingMiles) ??
        null,
      etaMinutes:
        fallback.route?.etaMinutes ??
        safeNumber((rich.route.routeIntelligence as any)?.etaMinutes) ??
        safeNumber((rich.route.routeIntelligence as any)?.estimatedMinutesRemaining) ??
        null,
      offRouteMiles: fallback.route?.offRouteMiles ?? null,
      bailoutOptions:
        fallback.route?.bailoutOptions ??
        safeNumber((rich.route.routeContext as any)?.bailoutCount) ??
        null,
      hazardAhead:
        fallback.route?.hazardAhead ??
        (terrainRisk === 'high' || terrainRisk === 'critical'),
      nextHazardDistanceMiles:
        fallback.route?.nextHazardDistanceMiles ?? null,
    },
    resources: {
      fuelRangeMiles: fallback.resources?.fuelRangeMiles ?? null,
      waterPercent: fallback.resources?.waterPercent ?? null,
      foodPercent: fallback.resources?.foodPercent ?? null,
      powerPercent,
    },
  };
}

function deriveHealthScore(state: string | null): number | null {
  switch (state) {
    case 'LIVE':
      return 90;
    case 'PARTIAL':
      return 70;
    case 'ATTENTION':
    case 'STALE':
      return 40;
    default:
      return null;
  }
}

function deriveWeatherSeverity(args: {
  alertsCount: number;
  weatherSource: 'live' | 'cache' | 'none';
  warnings: string[];
  explicitSeverity?: string | null;
}): number | null {
  const { alertsCount, weatherSource, warnings, explicitSeverity } = args;
  if (explicitSeverity === 'extreme') return 3;
  if (explicitSeverity === 'warning') return 2;
  if (explicitSeverity === 'advisory') return 1;
  if (alertsCount >= 2) return 3;
  if (alertsCount === 1) return 2;
  if (weatherSource === 'live' || weatherSource === 'cache') return 1;
  if (warnings.some((warning) => warning.toLowerCase().includes('weather'))) return 1;
  return null;
}

function computeActivation(
  context: AIContext,
  options: ECSAIOrchestratorOptions,
): { active: boolean } {
  const missionStatus = context.mission?.status ?? 'idle';
  const weatherSeverity = safeNumber(context.environment?.weatherSeverity) ?? 0;
  const hasCriticalVehicle =
    context.vehicle?.checkEngine === true ||
    (safeNumber(context.vehicle?.healthScore) ?? 100) <= 40;
  const hasCriticalPower =
    (safeNumber(context.resources?.powerPercent) ?? 100) <= 15;

  const active =
    options.forceActive ||
    missionStatus === 'active' ||
    (options.enableWhenIdle && missionStatus !== 'complete') ||
    weatherSeverity >= 2 ||
    hasCriticalVehicle ||
    hasCriticalPower;

  return { active };
}

function computeConfidence(context: AIContext): {
  telemetry: number;
  weather: number;
  route: number;
  power: number;
} {
  const telemetryFields = [
    context.vehicle?.healthScore,
    context.vehicle?.fuelPercent,
    context.vehicle?.batteryPercent,
    context.vehicle?.coolantTempF,
    context.vehicle?.oilTempF,
  ];

  const weatherFields = [
    context.environment?.weatherSeverity,
    context.environment?.windMph,
    context.environment?.visibilityMiles,
    context.environment?.alertsCount,
  ];

  const routeFields = [
    context.route?.distanceRemainingMiles,
    context.route?.etaMinutes,
    context.route?.offRouteMiles,
    context.route?.bailoutOptions,
    context.environment?.remotenessScore,
  ];

  const powerFields = [
    context.resources?.powerPercent,
    context.vehicle?.batteryPercent,
  ];

  return {
    telemetry: calculateFieldConfidence(telemetryFields),
    weather: calculateFieldConfidence(weatherFields),
    route: calculateFieldConfidence(routeFields),
    power: calculateFieldConfidence(powerFields),
  };
}

function computeReadiness(args: {
  context: AIContext;
  signals: Signal[];
  active: boolean;
  confidence: { telemetry: number; weather: number; route: number; power: number };
  topPriority: ECSPriorityResult | null;
}): ECSMissionReadiness {
  const { context, signals, active, confidence, topPriority } = args;

  if (!active) return 'offline';

  const averageConfidence =
    (confidence.telemetry + confidence.weather + confidence.route + confidence.power) / 4;

  const topSignal = signals[0] ?? null;

  if (topPriority?.level === 'critical' || topSignal?.severity === 3) return 'critical';
  if (topPriority?.level === 'warning' || topSignal?.severity === 2) return 'elevated';
  if (averageConfidence < 0.34) return 'limited';

  const missionStatus = context.mission?.status ?? 'idle';
  if (missionStatus === 'active') return 'ready';

  return 'limited';
}

function buildCommandIdentity(args: {
  active: boolean;
  context: AIContext;
  topSignal: Signal | null;
}): ECSCommandIdentity {
  const { active, context, topSignal } = args;
  const missionStatus = context.mission?.status ?? 'idle';
  const weatherSeverity = safeNumber(context.environment?.weatherSeverity) ?? 0;

  if (!active) {
    return {
      mode: 'standby',
      tone: 'calm',
      address: 'Stand by',
      label: 'STANDBY',
      accentLevel: 0,
    };
  }

  if (topSignal?.severity === 3) {
    return {
      mode: 'critical',
      tone: 'critical',
      address: 'Command',
      label: 'CRITICAL',
      accentLevel: 3,
    };
  }

  if (missionStatus === 'active' || weatherSeverity >= 2) {
    return {
      mode: 'expedition',
      tone: 'command',
      address: 'Command',
      label: 'EXPEDITION',
      accentLevel: 2,
    };
  }

  return {
    mode: 'highway',
    tone: 'directive',
    address: 'Driver',
    label: 'HIGHWAY',
    accentLevel: 1,
  };
}

function buildMissionBriefSafely(args: {
  richContext: ECSAIContext | null;
  context: AIContext;
  signals: Signal[];
  identity: ECSCommandIdentity;
  emitWhenNoSignals: boolean;
  operatorTrustMode: ECSOperatorTrustMode;
}): MissionBrief | null {
  const { richContext, context, signals, identity, emitWhenNoSignals, operatorTrustMode } = args;

  if (!emitWhenNoSignals && signals.length === 0) {
    return null;
  }

  if (richContext) {
    try {
      const built = generateMissionBrief(richContext, {
        operatorTrustMode,
      });
      return applyIdentityToBrief(built, identity);
    } catch {
      // fall through to legacy fallback
    }
  }

  return buildFallbackBrief(context, signals, identity);
}

function buildFallbackBrief(
  context: AIContext,
  signals: Signal[],
  identity: ECSCommandIdentity,
): MissionBrief | null {
  const topSignal = signals[0] ?? null;
  const status = mapSeverityToStatus(topSignal?.severity ?? 1);
  const summary = topSignal?.message ??
    ((context.mission?.status ?? 'idle') === 'active'
      ? 'All core systems are online. No elevated command signals detected.'
      : 'ECS AI is standing by for active mission context.');

  const recommendations = topSignal
    ? buildFallbackRecommendations(context, topSignal)
    : [
        'Maintain dashboard monitoring.',
        'Await next verified command signal.',
      ];

  const environmentLines = buildFallbackLinesFromSignals(signals, 'weather');
  const routeLines = buildFallbackLinesFromSignals(signals, 'route');
  const resourcesLines = buildFallbackLinesFromSignals(signals, 'resources');
  const systemsLines = buildFallbackLinesFromSignals(signals, 'vehicle');

  return {
    generatedAt: new Date().toISOString(),
    status,
    confidence: {
      level: 'unknown',
      score: 0,
      label: 'Confidence unavailable',
      shortReason: 'Awaiting stronger signal',
      reasons: ['awaiting_signal'],
      sourceSummary: { live: 0, manual: 0, inferred: 0, stale: 0, missing: 0 },
    },
    priority: priorityFromSignal(topSignal),
    headline: topSignal
      ? `${identity.label} — ${topSignal.title}`
      : `${identity.label} — MISSION ACTIVE`,
    summary,
    commandIntent: buildFallbackCommandIntent(identity, topSignal?.severity ?? 1),
    operatorNote:
      topSignal?.severity === 3
        ? 'Confirm route posture, bailout options, and vehicle status immediately.'
        : null,
    keyRisks: topSignal ? [topSignal.message] : [],
    recommendations,
    advisories: signals.slice(0, 6).map((signal) => signal.message),
    missionSection: {
      title: 'MISSION',
      summary: (context.mission?.status ?? 'idle') === 'active'
        ? 'Mission session is active.'
        : 'Awaiting mission activation.',
      status,
      lines: [
        fallbackLine(
          'mission-state',
          (context.mission?.status ?? 'idle') === 'active'
            ? 'Active mission context detected.'
            : 'No active mission context detected.',
          (context.mission?.status ?? 'idle') === 'active' ? 'standby' : 'advisory',
          5,
          'flag-outline',
        ),
      ],
    },
    routeSection: {
      title: 'ROUTE',
      summary: routeLines.length ? 'Route-aware signal activity detected.' : 'No elevated route signals.',
      status: routeLines.some((line) => line.mode === 'alert') ? status : 'green',
      lines: routeLines.length ? routeLines : [fallbackLine('route-ok', 'No elevated route issues detected.', 'standby', 6, 'map-outline')],
    },
    environmentSection: {
      title: 'ENVIRONMENT',
      summary: environmentLines.length ? 'Environmental signal activity detected.' : 'No elevated environmental signals.',
      status: environmentLines.some((line) => line.mode === 'alert') ? status : 'green',
      lines: environmentLines.length ? environmentLines : [fallbackLine('env-ok', 'Environment stable.', 'standby', 6, 'cloud-outline')],
    },
    resourcesSection: {
      title: 'RESOURCES',
      summary: resourcesLines.length ? 'Resource-related signal activity detected.' : 'No elevated resource signals.',
      status: resourcesLines.some((line) => line.mode === 'alert') ? status : 'green',
      lines: resourcesLines.length ? resourcesLines : [fallbackLine('res-ok', 'Resources stable.', 'standby', 6, 'battery-charging-outline')],
    },
    systemsSection: {
      title: 'SYSTEMS',
      summary: systemsLines.length ? 'Vehicle/system signal activity detected.' : 'Core systems stable.',
      status: systemsLines.some((line) => line.mode === 'alert') ? status : 'green',
      lines: systemsLines.length ? systemsLines : [fallbackLine('sys-ok', 'Core systems reporting normally.', 'standby', 6, 'shield-checkmark-outline')],
    },
    dashboardBarMessages: signals.slice(0, 6).map((signal, index) => fallbackLine(
      `bar-${index}`,
      signal.message,
      signal.severity >= 3 ? 'alert' : signal.severity === 2 ? 'advisory' : 'standby',
      signal.priority,
      pickSignalIcon(signal),
    )),
    compactLabel: topSignal?.title ?? `${identity.label} READY`,
  } as MissionBrief;
}

function buildFallbackLinesFromSignals(
  signals: Signal[],
  source: Signal['source'],
): MissionBriefLine[] {
  return signals
    .filter((signal) => signal.source === source)
    .slice(0, 3)
    .map((signal, index) => fallbackLine(
      `${source}-${index}`,
      signal.message,
      signal.severity >= 3 ? 'alert' : signal.severity === 2 ? 'advisory' : 'standby',
      signal.priority,
      pickSignalIcon(signal),
    ));
}

function fallbackLine(
  id: string,
  text: string,
  mode: MissionBriefLine['mode'],
  priority: number,
  icon?: string,
): MissionBriefLine {
  return { id, text, mode, priority, icon } as MissionBriefLine;
}

function pickSignalIcon(signal: Signal): string {
  switch (signal.source) {
    case 'weather':
      return 'cloud-outline';
    case 'vehicle':
      return 'construct-outline';
    case 'route':
      return 'map-outline';
    case 'resources':
      return 'battery-charging-outline';
    case 'mission':
      return 'flag-outline';
    default:
      return 'sparkles-outline';
  }
}

function applyIdentityToBrief(
  brief: MissionBrief,
  identity: ECSCommandIdentity,
): MissionBrief {
  const headline =
    identity.mode === 'critical' && !brief.headline.startsWith(`${identity.label} —`)
      ? `${identity.label} — ${brief.headline}`
      : brief.headline;

  return {
    ...brief,
    headline,
  };
}

function buildFallbackRecommendations(
  context: AIContext,
  topSignal: Signal,
): string[] {
  switch (topSignal.type) {
    case 'WEATHER_ESCALATION':
    case 'WEATHER_CHANGE':
      return [
        'Reduce pace and reassess route exposure.',
        'Monitor corridor weather changes over the next segment.',
      ];

    case 'VEHICLE_CRITICAL':
    case 'VEHICLE_STRESS':
      return [
        'Reduce system strain and inspect vehicle status when safe.',
        'Confirm telemetry values against actual vehicle condition.',
      ];

    case 'ROUTE_DEVIATION':
    case 'ROUTE_DELAY':
      return [
        'Reconfirm route lock and course position.',
        'Review alternate segments or bailout options.',
      ];

    case 'REMOTENESS_SPIKE':
      return [
        'Review nearest bailout route.',
        'Conserve fuel, water, and power margins.',
      ];

    case 'RESOURCE_WARNING':
    case 'RESOURCE_CRITICAL':
      return [
        'Shift to conservation posture immediately.',
        'Identify nearest practical resupply point.',
      ];

    default:
      return (context.mission?.status ?? 'idle') === 'active'
        ? [
            'Continue mission progression.',
            'Maintain dashboard monitoring.',
          ]
        : [
            'Maintain standby posture.',
            'Await next mission state transition.',
          ];
  }
}

function buildFallbackCommandIntent(
  identity: ECSCommandIdentity,
  severity: number,
): string {
  if (severity >= 3) {
    return `${identity.address}, stabilize the mission picture and take immediate corrective action.`;
  }
  if (severity === 2) {
    return `${identity.address}, maintain control of the route and adjust posture before conditions worsen.`;
  }
  return `${identity.address}, continue forward with monitored command awareness.`;
}

function mapSeverityToStatus(severity: number): MissionBriefStatus {
  if (severity >= 3) return 'red';
  if (severity === 2) return 'yellow';
  return 'green';
}

type RankedOrchestratorCandidate = ECSOrchestratorCandidate & {
  _score: number;
};

function mapDifficultyToNumeric(value: string | null | undefined): number {
  switch (String(value ?? '').toLowerCase()) {
    case 'difficult':
      return 9;
    case 'challenging':
      return 7;
    case 'moderate':
      return 5;
    case 'easy':
      return 3;
    default:
      return 5;
  }
}

function deriveRecommendedTireSize(difficulty: number): number | undefined {
  if (difficulty >= 8) return 35;
  if (difficulty >= 6) return 33;
  if (difficulty >= 4) return 31;
  return undefined;
}

function deriveRecommendedLift(difficulty: number): number | undefined {
  if (difficulty >= 8) return 4;
  if (difficulty >= 6) return 2;
  return undefined;
}

function buildActiveRouteFitOpportunity(
  richContext: ECSAIContext,
): import('../rigCompatibilityEngine').CompatibilityExpedition | null {
  const routeIntelligence = richContext.route.routeIntelligence as any;
  const routeContext = richContext.route.routeContext as any;
  const activeRoute = richContext.route.activeRoute as any;
  const activeRun = richContext.route.activeRun as any;
  const remotenessScore =
    safeNumber(richContext.summary.remotenessScore)
    ?? safeNumber((richContext.environment.remoteness as any)?.score)
    ?? 5;
  const distanceMiles =
    safeNumber(routeIntelligence?.totalDistanceMiles)
    ?? safeNumber(activeRoute?.distanceMiles)
    ?? safeNumber(activeRun?.distanceMiles)
    ?? safeNumber(activeRun?.distance)
    ?? null;

  if (distanceMiles == null || distanceMiles <= 0) {
    return null;
  }

  const difficulty = mapDifficultyToNumeric(routeIntelligence?.overallDifficulty);
  const terrainType =
    String(routeContext?.terrainType ?? activeRoute?.terrainType ?? routeIntelligence?.overallDifficulty ?? 'mixed');
  const estimatedFuelRequired =
    safeNumber(routeContext?.estimatedFuelRequired)
    ?? Math.max(8, Math.round((distanceMiles / 15) * 10) / 10);

  return {
    id: String(activeRoute?.id ?? activeRun?.id ?? routeIntelligence?.id ?? 'active-route-fit'),
    name: String(
      routeIntelligence?.routeName
      ?? activeRoute?.name
      ?? activeRun?.title
      ?? 'Active route',
    ),
    distanceMiles,
    terrainType,
    remotenessScore,
    estimatedFuelRequired,
    elevationGainFt:
      safeNumber(routeIntelligence?.elevationGainFeet)
      ?? safeNumber(routeIntelligence?.elevationGainFt)
      ?? 0,
    terrainDifficulty: difficulty,
    recommendedTireSize: deriveRecommendedTireSize(difficulty),
    recommendedLift: deriveRecommendedLift(difficulty),
  };
}

function buildOrchestratorOutput(args: {
  now: number;
  richContext: ECSAIContext | null;
  brief: MissionBrief | null;
  topSignal: Signal | null;
  fallbackPriority: ECSPriorityResult | null;
  operatorTrustMode: ECSOperatorTrustMode;
  expeditionReadiness?: ExpeditionReadinessAssessment | null;
  previousOutput?: ECSOrchestratorOutput | null;
}): ECSOrchestratorOutput | null {
  const candidates = collectOrchestratorCandidates(args);
  if (candidates.length === 0) {
    return null;
  }

  const trustAdjustedCandidates = candidates.map((candidate) =>
    applyTrustModeToCandidate(candidate, args.operatorTrustMode),
  );
  const trustContractResult = applyTrustContractToCandidates(
    trustAdjustedCandidates,
    args.richContext,
    args.brief,
  );
  const ranked = rankOrchestratorCandidates(
    trustContractResult.active,
    args.richContext,
    args.operatorTrustMode,
  );
  const { kept, suppressed } = applyCandidateDeduplication({
    ranked,
    richContext: args.richContext,
    previousOutput: args.previousOutput ?? null,
  });
  const ordered = kept
    .map((candidate) => applyTrustModePresentationToCandidate(candidate, args.operatorTrustMode))
    .map(stripCandidateScore);
  const hardenedSuppressed = [
    ...suppressed,
    ...trustContractResult.suppressed,
  ]
    .map((candidate) => applyTrustModePresentationToCandidate(candidate, args.operatorTrustMode))
    .map(stripCandidateScore);
  const activePhase = args.richContext?.phase?.current.phase ?? args.brief?.phase?.phase ?? null;
  const hardened = hardenCommandStateCandidates({
    ordered,
    suppressed: hardenedSuppressed,
    activePhase,
    previousOutput: args.previousOutput ?? null,
  });
  const secondary: ECSOrchestratorCandidate[] = [];
  const passive: ECSOrchestratorCandidate[] = [];
  const secondaryLimit = trustModeSecondaryLimit(args.operatorTrustMode);

  hardened.active.slice(1).forEach((candidate, index) => {
    if (
      secondary.length < secondaryLimit
      && trustModeSupportsSecondary(candidate, args.operatorTrustMode, index)
    ) {
      secondary.push(candidate);
      return;
    }
    if (trustModeSuppressesPassiveCandidate(candidate, args.operatorTrustMode)) {
      return;
    }
    passive.push(candidate);
  });

  const nextPrimary = hardened.active[0] ?? null;
  const qaDiagnostics = buildCommandStateDiagnostics({
    output: {
      primary: nextPrimary,
      secondary,
      passive,
      suppressed: hardened.suppressed,
      activePhase,
      operationalState: args.richContext?.operations?.degraded ?? args.brief?.operations ?? null,
    },
    richContext: args.richContext,
    liveStatus: args.richContext?.liveStatus ?? null,
    operatorTrustMode: args.operatorTrustMode,
    staleSignals: hardened.staleSignals,
  });
  const releaseDiagnostics = buildReleaseReadinessDiagnostics({
    output: {
      primary: nextPrimary,
      secondary,
      passive,
      suppressed: hardened.suppressed,
      activePhase,
      operationalState: args.richContext?.operations?.degraded ?? args.brief?.operations ?? null,
      expeditionReadiness: args.expeditionReadiness ?? null,
      qaDiagnostics,
    },
    richContext: args.richContext,
    liveStatus: args.richContext?.liveStatus ?? null,
    operatorTrustMode: args.operatorTrustMode,
    commandDiagnostics: qaDiagnostics,
    expeditionReadiness: args.expeditionReadiness ?? null,
  });

  return {
    primary: nextPrimary,
    secondary,
    passive,
    suppressed: hardened.suppressed,
    activePhase,
    operationalState: args.richContext?.operations?.degraded ?? args.brief?.operations ?? null,
    expeditionReadiness: args.expeditionReadiness ?? null,
    qaDiagnostics,
    releaseDiagnostics,
  };
}

function collectOrchestratorCandidates(args: {
  now: number;
  richContext: ECSAIContext | null;
  brief: MissionBrief | null;
  topSignal: Signal | null;
  fallbackPriority: ECSPriorityResult | null;
  operatorTrustMode: ECSOperatorTrustMode;
}): ECSOrchestratorCandidate[] {
  const { now, richContext, brief, topSignal, fallbackPriority, operatorTrustMode } = args;
  const candidates: ECSOrchestratorCandidate[] = [];

  if (richContext) {
    const routeActive =
      richContext.meta.hasActiveRoute ||
      richContext.meta.hasActiveRun ||
      !!richContext.route.activeRoute ||
      !!richContext.route.activeRun;
    const phase = richContext.phase?.current.phase ?? brief?.phase?.phase ?? null;
    const degraded = richContext.operations?.degraded ?? brief?.operations ?? null;
    const weather = richContext.environment.weather;
    const remoteness = richContext.environment.remoteness as any;
    const terrainRisk = richContext.risk.terrainRisk as any;
    const routeContext = richContext.route.routeContext as any;
    const telemetryReadout = richContext.resources.telemetryReadout as any;
    const forecast = richContext.resources.forecast as any;
    const authority = richContext.resources.powerAuthority as any;
    const providerTelemetry = richContext.resources.providerTelemetry as any;
    const readiness = richContext.readiness;
    const gpsStatus = String((richContext.environment.gps as any)?.gpsStatus ?? '').trim().toUpperCase() || null;
    const remotenessScore =
      typeof remoteness?.score === 'number'
        ? remoteness.score
        : safeNumber(richContext.summary.remotenessScore) ?? null;
    const remainingDistanceMiles =
      safeNumber(routeContext?.distanceRemainingMiles)
      ?? safeNumber((richContext.route.routeIntelligence as any)?.distanceRemainingMiles)
      ?? safeNumber((richContext.route.routeIntelligence as any)?.remainingDistanceMiles)
      ?? safeNumber((richContext.route.activeRun as any)?.distanceRemainingMiles)
      ?? (() => {
        const routeMiles =
          safeNumber((richContext.resources.forecast as any)?.routeMiles)
          ?? safeNumber((richContext.route.activeRoute as any)?.total_distance_miles)
          ?? safeNumber((richContext.route.routeIntelligence as any)?.totalDistanceMiles)
          ?? null;
        const progressPercent = safeNumber(richContext.route.progress?.progressPercent);
        return routeMiles != null && progressPercent != null
          ? routeMiles * (1 - clamp01(progressPercent / 100))
          : null;
      })();
    const hasWeatherSignal =
      weather.source !== 'none' ||
      weather.severity !== 'none' ||
      !!weather.current ||
      !!weather.response;
    const fusedRouteWeather =
      terrainRisk && hasWeatherSignal
        ? buildFusedWeatherRouteAdvisory({
            weather,
            terrainRisk,
            routeActive,
            phase,
            remotenessScore,
            bailoutAvailable: routeContext?.bailoutAvailable ?? null,
            estimatedTimeToBailoutMin: routeContext?.estimatedTimeToBailoutMin ?? null,
            degradedState: degraded?.state ?? null,
            offline: richContext.environment.connectivity?.isOnline === false,
          })
        : null;
    const routeViabilityRelevantPhase =
      phase === 'vehicle_setup'
      || phase === 'staging'
      || phase === 'transit'
      || phase === 'trail_entry'
      || phase === 'active_expedition'
      || phase === 'camp_stationary'
      || phase === 'recovery_exit';
    const resourceStatus = richContext.liveStatus?.resources ?? richContext.liveStatus?.telemetry ?? null;
    const routeViability =
      routeViabilityRelevantPhase
      && (
        !!forecast
        || !!routeContext
        || remotenessScore != null
        || safeNumber(authority?.batteryPercent) != null
        || safeNumber(telemetryReadout?.batteryPercent) != null
      )
        ? computeRouteViability({
            forecast,
            routeContext: routeContext
              ? {
                  progressPercent: safeNumber(routeContext.progressPercent),
                  bailoutAvailable:
                    typeof routeContext.bailoutAvailable === 'boolean'
                      ? routeContext.bailoutAvailable
                      : null,
                  estimatedTimeToBailoutMin: safeNumber(routeContext.estimatedTimeToBailoutMin),
                }
              : null,
            resources: {
              fuelRangeMiles:
                safeNumber((richContext.route.activeRun as any)?.fuelRangeMiles)
                ?? safeNumber((richContext.route.routeIntelligence as any)?.fuelRangeMiles)
                ?? (
                  forecast?.fuel?.availableGallons != null && forecast?.fuel?.adjustedMpg != null
                    ? forecast.fuel.availableGallons * forecast.fuel.adjustedMpg
                    : null
                )
                ?? null,
              waterPercent: null,
              powerPercent:
                safeNumber((forecast as any)?.powerReservePercent)
                ?? safeNumber(authority?.batteryPercent)
                ?? safeNumber(telemetryReadout?.batteryPercent)
                ?? safeNumber(telemetryReadout?.battery_percent)
                ?? null,
              powerRuntimeHours: (() => {
                const runtimeHours = safeNumber(authority?.estimatedRuntimeHours);
                if (runtimeHours != null) return runtimeHours;
                const runtimeMinutes = safeNumber(authority?.estimatedRuntimeMinutes);
                if (runtimeMinutes != null) return runtimeMinutes / 60;
                return safeNumber(telemetryReadout?.powerEstHours) ?? null;
              })(),
              inputWatts: safeNumber(authority?.inputWatts),
              outputWatts: safeNumber(authority?.outputWatts),
            },
            terrainRisk,
            remotenessScore,
            remainingDistanceMiles,
            status: resourceStatus,
            phase,
            routeActive,
            degradedState: degraded?.state ?? null,
            offline: richContext.environment.connectivity?.isOnline === false,
          })
        : null;
    const offlineReadinessRelevantPhase =
      phase === 'vehicle_setup'
      || phase === 'staging'
      || phase === 'transit'
      || phase === 'trail_entry'
      || phase === 'active_expedition'
      || phase === 'camp_stationary'
      || phase === 'recovery_exit';
    const offlineReadiness =
      offlineReadinessRelevantPhase
        ? computeOfflineReadiness({
            richContext,
          })
        : null;

    if (offlineReadiness) {
      const uiTargets: ECSOrchestratorCandidate['uiTargets'] = ['dashboard', 'brief'];
      const fieldRoutePhase =
        routeActive
        || phase === 'transit'
        || phase === 'trail_entry'
        || phase === 'active_expedition'
        || phase === 'recovery_exit';

      if (fieldRoutePhase) {
        uiTargets.push('navigate');
      }

      if (phase === 'vehicle_setup' || phase === 'staging') {
        uiTargets.push('fleet');
      }

      if (
        offlineReadiness.level === 'limited'
        || offlineReadiness.level === 'not_ready'
      ) {
        if (fieldRoutePhase || phase === 'staging' || phase === 'vehicle_setup') {
          uiTargets.push('alert');
        }
      }

      const rootFamily =
        offlineReadiness.level === 'ready' || offlineReadiness.level === 'ready_with_limitations'
          ? 'offline_capable_operation'
          : 'degraded_operations';

      candidates.push({
        id: 'offline-readiness',
        source: 'offline_readiness',
        title: offlineReadiness.priority?.title ?? offlineReadiness.label,
        summary: offlineReadiness.summary,
        confidence: offlineReadiness.confidence ?? null,
        priority: offlineReadiness.priority ?? null,
        degraded,
        phase,
        explanation: offlineReadiness.explanation ?? null,
        uiTargets: [...new Set(uiTargets)],
        timestamp: now,
        groupKey: 'offline_readiness',
        rootCondition: {
          key: rootFamily,
          family: rootFamily,
          sourceFamily: 'offline_readiness',
          affectedDomain: 'offline',
          scope: 'system',
          suppressionCompatibility: ['offline_readiness', rootFamily, 'degraded_operations'],
        },
        targetPresentation: {
          dashboard: {
            summary:
              offlineReadiness.summary,
            explanation: offlineReadiness.explanation ?? null,
          },
          navigate: {
            title:
              offlineReadiness.level === 'ready' || offlineReadiness.level === 'ready_with_limitations'
                ? 'Offline guidance readiness'
                : 'Offline route readiness limited',
            summary:
              offlineReadiness.level === 'ready' || offlineReadiness.level === 'ready_with_limitations'
                ? offlineReadiness.operatorActions[0]
                  ? `${offlineReadiness.summary} ${offlineReadiness.operatorActions[0]}`
                  : offlineReadiness.summary
                : offlineReadiness.summary,
            explanation: offlineReadiness.explanation ?? null,
          },
          brief: {
            summary:
              offlineReadiness.summary,
            explanation:
              offlineReadiness.operatorActions[0]
                ? {
                    text: offlineReadiness.operatorActions[0],
                    shortText: offlineReadiness.operatorActions[0],
                  }
                : offlineReadiness.explanation ?? null,
          },
        },
      });
    }

    if (routeViability) {
      const uiTargets: ECSOrchestratorCandidate['uiTargets'] = ['dashboard', 'brief'];

      if (
        routeActive ||
        phase === 'transit' ||
        phase === 'trail_entry' ||
        phase === 'active_expedition' ||
        phase === 'recovery_exit'
      ) {
        uiTargets.push('navigate');
      }

      if (
        phase === 'vehicle_setup' ||
        phase === 'staging'
      ) {
        uiTargets.push('fleet');
      }

      if (
        !routeActive &&
        (phase === 'vehicle_setup' || phase === 'staging' || phase === 'transit')
      ) {
        uiTargets.push('explore');
      }

      if (
        (routeViability.priority?.rank ?? 1) >= 4 ||
        (routeActive && routeViability.level === 'exit_recommended')
      ) {
        uiTargets.push('alert');
      }

      candidates.push({
        id: 'route-viability',
        source: 'route_viability',
        title: routeViability.priority?.title ?? routeViability.label,
        summary:
          routeViability.explanation?.text
          ?? routeViability.bailoutSummary
          ?? 'Route viability is being reassessed against current resource margin.',
        confidence: routeViability.confidence ?? null,
        priority: routeViability.priority ?? null,
        degraded,
        phase,
        explanation: routeViability.explanation ?? null,
        uiTargets: [...new Set(uiTargets)],
        timestamp: now,
        groupKey: routeViability.groupKey,
      });
    }

    if (fusedRouteWeather) {
      const uiTargets: ECSOrchestratorCandidate['uiTargets'] = [];
      uiTargets.push('dashboard', 'brief');

      if (
        routeActive ||
        phase === 'transit' ||
        phase === 'trail_entry' ||
        phase === 'active_expedition' ||
        phase === 'recovery_exit'
      ) {
        uiTargets.push('navigate');
      }

      if (
        !routeActive ||
        phase === 'vehicle_setup' ||
        phase === 'staging' ||
        phase === 'camp_stationary'
      ) {
        uiTargets.push('explore');
      }

      if (
        (fusedRouteWeather.priority?.rank ?? 1) >= 4 ||
        (routeActive && (fusedRouteWeather.priority?.rank ?? 1) >= 3)
      ) {
        uiTargets.push('alert');
      }

      candidates.push({
        id: 'route-weather-fused',
        source: 'weather',
        title: fusedRouteWeather.title,
        summary: fusedRouteWeather.summary,
        confidence: fusedRouteWeather.confidence,
        priority: fusedRouteWeather.priority,
        degraded,
        phase,
        explanation: fusedRouteWeather.explanation ?? null,
        uiTargets: [...new Set(uiTargets)],
        timestamp: now,
        groupKey: fusedRouteWeather.groupKey,
      });
    }

    if (terrainRisk && !fusedRouteWeather) {
      const drivers = Array.isArray(terrainRisk.drivers) ? terrainRisk.drivers : [];
      const explanation = terrainRisk.explanation ?? explainRecommendation({
        type: 'route_risk',
        drivers,
        confidenceLevel: terrainRisk.confidence?.level,
        priorityLevel: terrainRisk.priority?.level,
        degradedState: degraded?.state,
      });
      candidates.push({
        id: 'route-risk',
        source: 'route_risk',
        title: terrainRisk.priority?.title ?? `Route Risk ${String(terrainRisk.riskLevel ?? 'watch').toUpperCase()}`,
        summary:
          explanation?.text
          ?? terrainRisk.summary
          ?? drivers[0]
          ?? 'Active route risk is elevated.',
        confidence: terrainRisk.confidence ?? null,
        priority: terrainRisk.priority ?? null,
        degraded,
        phase,
        explanation,
        uiTargets: ['dashboard', 'navigate', 'alert', 'brief'],
        timestamp: now,
        groupKey: hasWeatherDriver(drivers) ? 'route_weather' : null,
      });
    }

    if (hasWeatherSignal && !fusedRouteWeather) {
      const weatherPriority = assessWeatherPriority({
        severity: weather.severity ?? 'none',
        routeActive,
        alertCount: Array.isArray((weather.response as any)?.alerts) ? (weather.response as any).alerts.length : 0,
        stale: weather.staleness === 'stale' || weather.staleness === 'very_stale',
        offline: richContext.environment.connectivity?.isOnline === false,
      });
      const weatherDrivers = buildWeatherDrivers(richContext);
      const explanation = explainRecommendation({
        type: 'weather',
        drivers: weatherDrivers,
        priorityLevel: weatherPriority.level,
        degradedState: degraded?.state,
      });
      candidates.push({
        id: 'weather',
        source: 'weather',
        title: weatherPriority.title,
        summary:
          explanation?.text
          ?? weather.summaryLabel
          ?? weather.ageLabel
          ?? 'Weather conditions remain in play.',
        priority: weatherPriority,
        degraded,
        phase,
        explanation,
        uiTargets: ['dashboard', 'navigate', 'explore', 'alert', 'brief'],
        timestamp: now,
        groupKey:
          routeActive && ((weather.severity ?? 'none') !== 'none' || weather.staleness === 'stale' || weather.staleness === 'very_stale')
            ? 'route_weather'
            : null,
      });
    }

    if (remoteness) {
      candidates.push({
        id: 'remoteness',
        source: 'remoteness',
        title: remoteness.priority?.title ?? `Remoteness ${String(remoteness.level ?? 'watch').toUpperCase()}`,
        summary:
          remoteness.explanation?.text
          ?? remoteness.reason
          ?? 'Remoteness is shaping the current operating margin.',
        confidence: remoteness.confidence ?? null,
        priority: remoteness.priority ?? null,
        degraded,
        phase,
        explanation: remoteness.explanation ?? null,
        uiTargets: ['dashboard', 'navigate', 'explore', 'alert', 'brief'],
        timestamp: now,
        groupKey:
          routeViability && routeViability.bailoutRelevant && routeViability.level !== 'viable'
            ? 'route_viability'
            : null,
      });
    }

    const telemetryState =
      String(
        providerTelemetry?.state
        ?? providerTelemetry?.legacyTelemetryState
        ?? telemetryReadout?.state
        ?? authority?.freshness
        ?? richContext.summary.telemetryState
        ?? '',
      ).trim() || null;
    if (telemetryState || authority?.provider || authority?.deviceLabel || providerTelemetry?.providerLabel) {
      const telemetryConfidence = assessTelemetryConfidence({
        hasLiveTelemetry:
          providerTelemetry?.source === 'live_provider'
          || richContext.liveStatus?.telemetry?.status === 'live',
        hasBluetoothProvider:
          providerTelemetry
            ? providerTelemetry.supportType === 'ble'
              || providerTelemetry.supportType === 'hybrid'
              || providerTelemetry.supportType === 'wifi'
            : !!authority?.provider,
        hasCloudTelemetry: providerTelemetry?.source === 'cloud_sync',
        hasStoredProviderState:
          providerTelemetry?.source === 'stored_provider_state'
          || providerTelemetry?.state === 'temporarily_disconnected'
          || providerTelemetry?.state === 'stale_but_usable',
        hasManualProfile:
          !!richContext.mission.snapshot
          || !!richContext.resources.telemetryConfig
          || !!richContext.summary.vehicleName,
        telemetryFreshness: confidenceFreshnessFromProvider(providerTelemetry, richContext.liveStatus?.telemetry?.freshness),
        providerLimited:
          !!providerTelemetry?.degraded
          || providerTelemetry?.providerVerificationStatus === 'limited',
        offline: richContext.environment.connectivity?.isOnline === false,
      });
      const telemetryPriority = assessTelemetryPriority({
        state: telemetryState,
        routeActive,
        repeatedDisconnects: !!providerTelemetry?.repeatedDisconnects,
        confidence: telemetryConfidence,
      });
      const telemetryDrivers = [
        providerTelemetry?.providerLabel ? `${providerTelemetry.providerLabel} provider` : authority?.provider ? `${authority.provider} provider` : null,
        providerTelemetry?.deviceLabel ? `${providerTelemetry.deviceLabel} device` : authority?.deviceLabel ? `${authority.deviceLabel} device` : null,
        providerTelemetry?.sourceLabel ? providerTelemetry.sourceLabel.toLowerCase() : null,
        telemetryState ? `telemetry ${String(telemetryState).toLowerCase().replace(/_/g, ' ')}` : null,
      ].filter((value): value is string => !!value);
      const explanation = explainRecommendation({
        type: 'brief',
        drivers: telemetryDrivers,
        priorityLevel: telemetryPriority.level,
        degradedState: degraded?.state,
      });
      candidates.push({
        id: 'telemetry',
        source: 'telemetry',
        title: telemetryPriority.title,
        summary:
          providerTelemetry?.summary
          ?? providerTelemetry?.explanation
          ?? explanation?.text
          ?? `Vehicle systems are ${String(telemetryState ?? 'limited').toLowerCase()}.`,
        confidence: telemetryConfidence,
        priority: telemetryPriority,
        degraded,
        phase,
        explanation,
        uiTargets: ['dashboard', 'navigate', 'fleet', 'alert', 'brief'],
        timestamp: now,
        groupKey:
          providerTelemetry?.state === 'temporarily_disconnected'
          || providerTelemetry?.state === 'stale_but_usable'
          || providerTelemetry?.state === 'waiting_for_provider'
          || (telemetryState && /disconnect|stale|manual|offline|limited|unavailable/i.test(telemetryState))
            ? 'telemetry_disconnect'
            : null,
      });
    }

    const resourcePercent =
      safeNumber(forecast?.powerReservePercent)
      ?? safeNumber(authority?.batteryPercent)
      ?? safeNumber(telemetryReadout?.batteryPercent)
      ?? safeNumber(telemetryReadout?.battery_percent)
      ?? null;
    const resourcePriority = assessResourcePriority({
      kind: 'power',
      percent: resourcePercent,
      routeActive,
      remotenessScore,
    });
    if (resourcePriority && !routeViability) {
      const resourceDrivers = [
        typeof resourcePercent === 'number' ? `${Math.round(resourcePercent)}% reserve` : null,
        remotenessScore != null ? `remoteness ${Math.round(remotenessScore)}` : null,
        forecast?.sufficiencyLevel ? `forecast ${String(forecast.sufficiencyLevel).toLowerCase()}` : null,
      ].filter((value): value is string => !!value);
      const explanation = explainRecommendation({
        type: 'brief',
        drivers: resourceDrivers,
        priorityLevel: resourcePriority.level,
        confidenceLevel: forecast?.confidence?.level,
        degradedState: degraded?.state,
      });
      candidates.push({
        id: 'resource-status',
        source: 'resource_status',
        title: resourcePriority.title,
        summary:
          explanation?.text
          ?? forecast?.headline
          ?? 'Resource reserve needs attention.',
        confidence: forecast?.confidence ?? null,
        priority: resourcePriority,
        degraded,
        phase,
        explanation,
        uiTargets: ['dashboard', 'navigate', 'fleet', 'alert', 'brief'],
        timestamp: now,
        groupKey: 'resource_power',
      });
    }

    const gpsPriority = assessGpsPriority({
      gpsStatus,
      routeActive,
      remotenessScore,
      riskLevel: terrainRisk?.riskLevel ?? null,
    });
    if (gpsPriority) {
      const explanation = explainRecommendation({
        type: 'brief',
        drivers: [
          routeActive ? 'active guidance' : 'route context',
          gpsStatus ? `GPS ${gpsStatus.toLowerCase()}` : 'GPS degraded',
          remotenessScore != null ? `remoteness ${Math.round(remotenessScore)}` : null,
        ].filter((value): value is string => !!value),
        priorityLevel: gpsPriority.level,
        degradedState: degraded?.state,
      });
      candidates.push({
        id: 'gps-guidance',
        source: 'safety',
        title: gpsPriority.title,
        summary: explanation?.text ?? 'GPS quality is weakening the current guidance picture.',
        priority: gpsPriority,
        degraded,
        phase,
        explanation,
        uiTargets: ['dashboard', 'navigate', 'alert', 'brief'],
        timestamp: now,
        groupKey: routeActive ? 'navigation_guidance' : null,
      });
    }

    const offlinePriority = assessOfflinePriority({
      offline: richContext.environment.connectivity?.isOnline === false,
      degraded: degraded?.state === 'degraded' || degraded?.state === 'limited',
      routeActive,
      cloudDependent: true,
    });
    if (offlinePriority) {
      const explanation = explainRecommendation({
        type: 'brief',
        drivers: [
          degraded?.shortLabel ?? 'degraded operations',
          ...(degraded?.degradedSystems ?? []).slice(0, 2),
        ],
        priorityLevel: offlinePriority.level,
        degradedState: degraded?.state,
      });
      candidates.push({
        id: 'operations-sync',
        source: 'sync',
        title: offlinePriority.title,
        summary:
          explanation?.text
          ?? degraded?.summary
          ?? 'Some cloud-backed systems are degraded.',
        priority: offlinePriority,
        degraded,
        phase,
        explanation,
        uiTargets: ['dashboard', 'navigate', 'explore', 'alert', 'fleet', 'brief'],
        timestamp: now,
        groupKey: 'degraded_operations',
      });
    }

    if (!routeViability && routeActive && routeContext && (routeContext.bailoutAvailable === false || phase === 'recovery_exit')) {
      const bailoutPriority = selectPrimaryPriority([
        terrainRisk?.priority ?? null,
        remoteness?.priority ?? null,
        fallbackPriority,
      ]);
      const explanation = explainRecommendation({
        type: 'bailout',
        drivers: [
          routeContext.bailoutAvailable === false ? 'no bailout corridor confirmed' : 'exit routing active',
          remotenessScore != null ? `remoteness ${Math.round(remotenessScore)}` : null,
          terrainRisk?.drivers?.[0] ?? null,
        ].filter((value): value is string => !!value),
        priorityLevel: bailoutPriority?.level,
        confidenceLevel: terrainRisk?.confidence?.level ?? remoteness?.confidence?.level,
        degradedState: degraded?.state,
      });
      candidates.push({
        id: 'bailout',
        source: 'bailout',
        title: bailoutPriority?.title ?? 'Bailout Relevance',
        summary:
          explanation?.text
          ?? 'Exit options deserve attention on the current route.',
        confidence: terrainRisk?.confidence ?? remoteness?.confidence ?? null,
        priority: bailoutPriority,
        degraded,
        phase,
        explanation,
        uiTargets: ['dashboard', 'navigate', 'alert', 'brief'],
        timestamp: now,
      });
    }

    const fitOpportunity = buildActiveRouteFitOpportunity(richContext);
    const vehicleProfile = buildVehicleProfile();
    const fitRelevantPhase =
      phase === 'vehicle_setup'
      || phase === 'staging'
      || phase === 'trail_entry'
      || phase === 'active_expedition'
      || phase === 'recovery_exit';
    let vehicleFit: ReturnType<typeof evaluateVehicleFit> | null = null;
    if (fitOpportunity && (routeActive || fitRelevantPhase)) {
      vehicleFit = evaluateVehicleFit(fitOpportunity, vehicleProfile, {
        status:
          richContext.liveStatus?.telemetry?.status === 'live'
            ? richContext.liveStatus.telemetry
            : richContext.liveStatus?.readiness ?? null,
        operationalState: degraded?.state ?? null,
        phase,
        offline: richContext.environment.connectivity?.isOnline === false,
        hasLiveTelemetry: richContext.liveStatus?.telemetry?.status === 'live',
        weatherFreshness: richContext.liveStatus?.weather?.freshness ?? null,
      });
      const fitPriority = assessVehicleFitPriority({
        fitLevel: vehicleFit.level,
        routeActive,
        remotenessScore,
        phase,
        confidence: vehicleFit.confidence ?? null,
      });
      const shouldSurfaceFit =
        vehicleFit.level === 'poor_fit'
        || vehicleFit.level === 'limited_fit'
        || phase === 'staging'
        || phase === 'trail_entry'
        || phase === 'vehicle_setup';

      if (shouldSurfaceFit) {
        candidates.push({
          id: 'vehicle-fit',
          source: 'vehicle_assessment',
          title: fitPriority.title,
          summary:
            vehicleFit.explanation?.text
            ?? vehicleFit.limitingFactors[0]
            ?? vehicleFit.drivers[0]
            ?? `${vehicleFit.label} for the current route.`,
          confidence: vehicleFit.confidence ?? null,
          priority: fitPriority,
          degraded,
          phase,
          explanation: vehicleFit.explanation ?? null,
          uiTargets:
            vehicleFit.level === 'poor_fit' && (routeActive || phase === 'trail_entry' || phase === 'active_expedition')
              ? ['dashboard', 'navigate', 'fleet', 'alert', 'brief']
              : routeActive
                ? ['dashboard', 'navigate', 'fleet', 'brief']
                : ['dashboard', 'fleet', 'brief'],
          timestamp: now,
          groupKey: vehicleFit.level === 'poor_fit' ? 'vehicle_fit' : null,
        });
      }
    }

    if (!readiness.available || phase === 'vehicle_setup' || phase === 'staging') {
      const readinessTitle = phase === 'vehicle_setup'
        ? 'Vehicle Setup Required'
        : phase === 'staging'
          ? 'Staging Checks Recommended'
          : 'Vehicle Readiness Limited';
      const readinessPriority: ECSPriorityResult | null =
        readiness.available
          ? null
          : {
              level: phase === 'vehicle_setup' ? 'caution' : 'advisory',
              rank: phase === 'vehicle_setup' ? 3 : 2,
              title: readinessTitle,
              shortReason: readiness.reason ?? 'Vehicle readiness is incomplete.',
              interruptive: false,
              requiresBanner: false,
              requiresAlertSurface: false,
              hapticPattern: 'none' as const,
            };
      const explanation = explainRecommendation({
        type: 'vehicle_assessment',
        drivers: [readiness.reason ?? 'readiness checks incomplete'],
        priorityLevel: readinessPriority?.level,
        degradedState: degraded?.state,
      });
      candidates.push({
        id: 'vehicle-readiness',
        source: 'vehicle_assessment',
        title: readinessPriority?.title ?? readinessTitle,
        summary:
          explanation?.text
          ?? readiness.reason
          ?? 'Vehicle readiness still needs confirmed inputs.',
        priority: readinessPriority,
        degraded,
        phase,
        explanation,
        uiTargets: ['dashboard', 'fleet', 'brief'],
        timestamp: now,
      });
    }

    const planningRelevantPhase =
      phase === 'vehicle_setup'
      || phase === 'staging'
      || phase === 'camp_stationary';
    const missionScenario =
      planningRelevantPhase
        ? (
            brief?.missionScenario
            ?? computeMissionScenario({
              richContext,
              operatorTrustMode,
              offlineReadiness,
              routeViability,
              vehicleFit,
              fusedWeatherRoute: fusedRouteWeather,
            })
          )
        : null;

    if (missionScenario && planningRelevantPhase) {
      const uiTargets: ECSOrchestratorCandidate['uiTargets'] = ['dashboard', 'brief'];
      if (phase === 'vehicle_setup' || phase === 'staging') {
        uiTargets.push('fleet');
      }
      if (!routeActive && (phase === 'vehicle_setup' || phase === 'staging')) {
        uiTargets.push('explore');
      }

      candidates.push({
        id: 'mission-scenario',
        source: 'mission_scenario',
        title: missionScenario.priority?.title ?? missionScenario.label,
        summary: missionScenario.summary,
        confidence: missionScenario.confidence ?? null,
        priority: missionScenario.priority ?? null,
        degraded,
        phase,
        explanation: missionScenario.explanation ?? null,
        uiTargets: [...new Set(uiTargets)],
        timestamp: now,
        groupKey: 'mission_scenario',
        rootCondition: {
          key: 'mission_planning_readiness',
          family: 'mission_planning_readiness',
          sourceFamily: 'mission_scenario',
          affectedDomain: 'mission_scenario',
          scope: 'planning',
          suppressionCompatibility: ['mission_scenario', 'mission_planning_readiness', 'vehicle_fit', 'offline_readiness'],
        },
        targetPresentation: {
          dashboard: {
            summary: missionScenario.summary,
            explanation: missionScenario.explanation ?? null,
          },
          fleet: {
            summary:
              missionScenario.requiredActions[0]
              ?? missionScenario.limitations[0]
              ?? missionScenario.summary,
            explanation: missionScenario.explanation ?? null,
          },
          brief: {
            summary: missionScenario.summary,
            explanation:
              missionScenario.requiredActions[0]
                ? {
                    text: missionScenario.requiredActions[0],
                    shortText: missionScenario.requiredActions[0],
                  }
                : missionScenario.explanation ?? null,
          },
          explore: {
            summary:
              missionScenario.limitations[0]
              ?? missionScenario.summary,
            explanation: missionScenario.explanation ?? null,
          },
        },
      });
    }
  }

  if (brief) {
    candidates.push({
      id: 'mission-brief',
      source: 'brief',
      title: brief.headline || brief.compactLabel || 'ECS Brief',
      summary: brief.explanation?.text ?? brief.summary,
      confidence: brief.confidence ?? null,
      priority: brief.priority ?? fallbackPriority ?? null,
      degraded: brief.operations ?? null,
      phase: brief.phase?.phase ?? null,
      explanation: brief.explanation ?? null,
      uiTargets: ['dashboard', 'brief', 'fleet', 'navigate', 'explore', 'alert'],
      dismissible: true,
      timestamp: now,
    });
  }

  if (topSignal) {
    candidates.push({
      id: `signal-${topSignal.id ?? topSignal.title ?? 'top'}`,
      source: 'brief',
      title: topSignal.title,
      summary: topSignal.message,
      priority: priorityFromSignal(topSignal),
      timestamp: now,
      uiTargets: ['dashboard', 'brief', 'alert'],
      dismissible: true,
      groupKey: topSignal.severity >= 2 ? 'signal_priority' : null,
    });
  }

  return candidates.filter((candidate) => Boolean(candidate.title && candidate.summary));
}

function rankOrchestratorCandidates(
  candidates: ECSOrchestratorCandidate[],
  richContext: ECSAIContext | null,
  operatorTrustMode: ECSOperatorTrustMode,
): RankedOrchestratorCandidate[] {
  return candidates
    .map((candidate) => ({
      ...candidate,
      _score: computeCandidateScore(candidate, richContext, operatorTrustMode),
    }))
    .sort((left, right) => {
      if (right._score !== left._score) {
        return right._score - left._score;
      }
      return right.timestamp - left.timestamp;
    });
}

function computeCandidateScore(
  candidate: ECSOrchestratorCandidate,
  richContext: ECSAIContext | null,
  operatorTrustMode: ECSOperatorTrustMode,
): number {
  const priorityRank = candidate.priority?.rank ?? 1;
  const phase = candidate.phase ?? richContext?.phase?.current.phase ?? null;
  const routeActive = !!richContext?.meta.hasActiveRoute || !!richContext?.meta.hasActiveRun;
  const operationalState = candidate.degraded?.state ?? richContext?.operations?.degraded.state ?? null;

  let score = priorityRank * 100;
  score += sourceWeight(candidate.source);
  score += phaseBoost(candidate.source, phase);
  score += confidenceAdjustment(candidate.confidence?.level ?? null);

  if (
    routeActive &&
    (
      candidate.source === 'route_risk'
      || candidate.source === 'route_viability'
      || candidate.source === 'weather'
      || candidate.source === 'remoteness'
      || candidate.source === 'bailout'
      || candidate.source === 'safety'
    )
  ) {
    score += 22;
  }

  if (operationalState === 'limited' || operationalState === 'unavailable') {
    if (candidate.source === 'sync' || candidate.source === 'safety' || candidate.source === 'telemetry') {
      score += 18;
    }
    if (candidate.source === 'explore' || candidate.source === 'brief') {
      score -= 14;
    }
  }

  if (candidate.source === 'explore' && routeActive) {
    score -= 35;
  }

  if (candidate.source === 'vehicle_assessment') {
    score += phase === 'vehicle_setup' || phase === 'staging' ? 18 : -8;
  }

  score += trustModeCandidateScoreAdjustment(candidate, operatorTrustMode);

  return score;
}

function sourceWeight(source: ECSOrchestratorCandidate['source']): number {
  switch (source) {
    case 'route_risk':
      return 42;
    case 'route_viability':
      return 40;
    case 'mission_scenario':
      return 24;
    case 'offline_readiness':
      return 26;
    case 'weather':
      return 36;
    case 'remoteness':
      return 32;
    case 'bailout':
      return 34;
    case 'resource_status':
      return 28;
    case 'safety':
      return 30;
    case 'telemetry':
      return 24;
    case 'vehicle_assessment':
      return 18;
    case 'sync':
      return 14;
    case 'explore':
      return 8;
    case 'brief':
      return 6;
    case 'attitude':
      return 30;
    default:
      return 10;
  }
}

function phaseBoost(
  source: ECSOrchestratorCandidate['source'],
  phase: ECSExpeditionPhase | null | undefined,
): number {
  switch (phase) {
    case 'vehicle_setup':
      return source === 'vehicle_assessment' || source === 'resource_status' || source === 'route_viability' || source === 'telemetry' || source === 'offline_readiness' || source === 'mission_scenario'
        ? 26
        : source === 'brief'
          ? 10
          : -6;
    case 'staging':
      return source === 'weather' || source === 'resource_status' || source === 'route_viability' || source === 'vehicle_assessment' || source === 'offline_readiness' || source === 'mission_scenario'
        ? 18
        : source === 'brief'
          ? 8
          : 0;
    case 'transit':
      return source === 'weather' || source === 'resource_status' || source === 'route_viability' || source === 'sync' || source === 'offline_readiness'
        ? 12
        : source === 'route_risk' || source === 'remoteness'
          ? 8
          : 0;
      case 'trail_entry':
        return source === 'route_risk' || source === 'route_viability' || source === 'remoteness' || source === 'weather' || source === 'bailout' || source === 'vehicle_assessment' || source === 'offline_readiness'
          ? 22
          : 0;
      case 'active_expedition':
        return source === 'route_risk' || source === 'route_viability' || source === 'remoteness' || source === 'weather' || source === 'bailout' || source === 'resource_status' || source === 'offline_readiness'
          ? 24
          : source === 'vehicle_assessment'
            ? 10
          : source === 'sync'
            ? -8
            : 0;
    case 'camp_stationary':
      return source === 'weather' || source === 'route_viability' || source === 'resource_status' || source === 'telemetry' || source === 'offline_readiness' || source === 'mission_scenario'
        ? 18
        : source === 'route_risk'
          ? -8
          : 0;
      case 'recovery_exit':
        return source === 'bailout' || source === 'route_viability' || source === 'resource_status' || source === 'weather' || source === 'sync' || source === 'offline_readiness'
          ? 22
          : source === 'vehicle_assessment'
            ? 8
          : 0;
    default:
      return 0;
  }
}

function confidenceAdjustment(level: string | null): number {
  switch (String(level ?? '').toLowerCase()) {
    case 'high':
      return 0;
    case 'moderate':
      return -5;
    case 'limited':
      return -15;
    case 'low':
      return -30;
    case 'unknown':
      return -40;
    default:
      return -10;
  }
}

function buildWeatherDrivers(richContext: ECSAIContext): string[] {
  const weather = richContext.environment.weather;
  return [
    weather.severity && weather.severity !== 'none'
      ? `${weather.severity} weather`
      : null,
    weather.staleness && weather.staleness !== 'fresh' && weather.staleness !== 'unknown'
      ? `${weather.staleness.replace(/_/g, ' ')} weather`
      : null,
    weather.source === 'cache'
      ? 'cached forecast'
      : weather.source === 'live'
        ? 'live weather feed'
        : null,
  ].filter((value): value is string => !!value);
}

function hasWeatherDriver(drivers: unknown[]): boolean {
  return drivers.some((driver) => /weather|wind|storm|rain|snow|precip/i.test(String(driver ?? '')));
}

function stripCandidateScore(
  candidate: RankedOrchestratorCandidate | ECSOrchestratorCandidate,
): ECSOrchestratorCandidate {
  const { _score: _ignored, ...rest } = candidate as RankedOrchestratorCandidate & ECSOrchestratorCandidate;
  return rest;
}

function applyTrustSummaryToCandidate(
  candidate: ECSOrchestratorCandidate,
  wording: string | null,
  trust: ECSOrchestratorCandidate['trust'],
): ECSOrchestratorCandidate {
  const explanation = candidate.explanation
    ? {
        ...candidate.explanation,
        text: prependTrustWording(candidate.explanation.text, wording) ?? candidate.explanation.text,
        shortText:
          prependTrustWording(candidate.explanation.shortText ?? candidate.explanation.text, wording)
          ?? candidate.explanation.shortText
          ?? candidate.explanation.text,
      }
    : wording
      ? { text: wording, shortText: wording }
      : candidate.explanation;

  const targetPresentation = candidate.targetPresentation
    ? Object.fromEntries(
        Object.entries(candidate.targetPresentation).map(([target, presentation]) => {
          if (!presentation) return [target, presentation];
          const nextExplanation = presentation.explanation
            ? {
                ...presentation.explanation,
                text:
                  prependTrustWording(presentation.explanation.text, wording)
                  ?? presentation.explanation.text,
                shortText:
                  prependTrustWording(
                    presentation.explanation.shortText ?? presentation.explanation.text,
                    wording,
                  )
                  ?? presentation.explanation.shortText
                  ?? presentation.explanation.text,
              }
            : wording
              ? { text: wording, shortText: wording }
              : presentation.explanation;
          return [
            target,
            {
              ...presentation,
              summary: prependTrustWording(presentation.summary, wording) ?? presentation.summary,
              explanation: nextExplanation,
            },
          ];
        }),
      ) as ECSOrchestratorCandidate['targetPresentation']
    : candidate.targetPresentation;

  return {
    ...candidate,
    summary: prependTrustWording(candidate.summary, wording) ?? candidate.summary,
    explanation,
    targetPresentation,
    trust,
  };
}

function candidateFreshnessClass(
  source: ECSOrchestratorCandidate['source'],
): ECSTrustFreshnessClass {
  switch (source) {
    case 'weather':
      return 'weather';
    case 'telemetry':
    case 'resource_status':
      return 'telemetry';
    case 'mission_scenario':
    case 'vehicle_assessment':
    case 'brief':
      return 'expedition';
    case 'explore':
      return 'marker_scoring';
    case 'sync':
    case 'offline_readiness':
      return 'provider';
    default:
      return 'route';
  }
}

function candidateTimestamp(
  source: ECSOrchestratorCandidate['source'],
  richContext: ECSAIContext | null,
): number | string | null {
  switch (source) {
    case 'telemetry':
    case 'resource_status':
    case 'offline_readiness':
    case 'sync':
      return richContext?.resources.providerTelemetry?.lastUpdatedAt
        ?? richContext?.resources.powerAuthority?.lastUpdatedAt
        ?? null;
    case 'weather':
      return null;
    case 'route_risk':
    case 'route_viability':
    case 'bailout':
    case 'safety':
    case 'remoteness':
      return richContext?.environment.gps?.lastEmitTs
        ?? richContext?.route.activeRun?.updated_at
        ?? richContext?.route.activeRoute?.updated_at
        ?? null;
    case 'vehicle_assessment':
    case 'mission_scenario':
    case 'brief':
    case 'explore':
    default:
      return richContext?.meta.builtAt ?? null;
  }
}

function applyTrustContractToCandidates(
  candidates: ECSOrchestratorCandidate[],
  richContext: ECSAIContext | null,
  brief: MissionBrief | null,
): {
  active: ECSOrchestratorCandidate[];
  suppressed: ECSOrchestratorCandidate[];
} {
  const active: ECSOrchestratorCandidate[] = [];
  const suppressed: ECSOrchestratorCandidate[] = [];
  const operationalState = richContext?.operations?.degraded.state ?? brief?.operations?.state ?? null;

  candidates.forEach((candidate) => {
    const liveStatus = selectLiveStatusForSource(richContext?.liveStatus ?? null, candidate.source);
    const trust = buildTrustMetadata({
      confidence: candidate.confidence ?? brief?.confidence ?? null,
      liveStatus,
      operationalState,
      explanation: candidate.explanation ?? null,
      freshnessClass: candidateFreshnessClass(candidate.source),
      timestamp: candidateTimestamp(candidate.source, richContext),
    });
    const gate = gateCandidateTrust({
      source: candidate.source,
      candidateTitle: candidate.title,
      trust,
      richContext,
    });
    const trustedCandidate = applyTrustSummaryToCandidate(
      candidate,
      gate.wording,
      withTrustDecision(trust, gate),
    );

    if (gate.decision === 'suppress') {
      suppressed.push(trustedCandidate);
      return;
    }

    active.push(trustedCandidate);
  });

  return { active, suppressed };
}

function candidatePriorityDomain(
  candidate: ECSOrchestratorCandidate,
): ECSPriorityResult['domain'] | undefined {
  if (candidate.priority?.domain) {
    return candidate.priority.domain;
  }

  switch (candidate.source) {
    case 'route_risk':
      return 'route_risk';
    case 'route_viability':
      return 'route_viability';
    case 'weather':
      return 'weather';
    case 'remoteness':
      return 'remoteness';
    case 'vehicle_assessment':
      return 'vehicle_assessment';
    case 'resource_status':
      return 'resource';
    case 'mission_scenario':
      return 'mission_scenario';
    case 'telemetry':
      return 'telemetry';
    case 'offline_readiness':
    case 'sync':
      return 'offline';
    case 'brief':
      return 'ecs_brief';
    default:
      return candidate.priority?.domain;
  }
}

function applyTrustModeToCandidate(
  candidate: ECSOrchestratorCandidate,
  operatorTrustMode: ECSOperatorTrustMode,
): ECSOrchestratorCandidate {
  const nextPriority = applyTrustModeToPriorityResult(candidate.priority ?? null, operatorTrustMode, {
    confidence: candidate.confidence ?? null,
    domain: candidatePriorityDomain(candidate),
  });
  const nextExplanation =
    trustModePresentationExplanation(candidate.explanation, operatorTrustMode)
    ?? candidate.explanation;
  const nextSummary =
    candidate.explanation?.text
    && nextExplanation?.text
    && candidate.summary === candidate.explanation.text
      ? nextExplanation.text
      : candidate.summary;

  return {
    ...candidate,
    priority: nextPriority,
    explanation: nextExplanation ?? null,
    summary: nextSummary,
  };
}

function applyTrustModePresentationToCandidate<T extends ECSOrchestratorCandidate>(
  candidate: T,
  operatorTrustMode: ECSOperatorTrustMode,
): T {
  const targetPresentation = candidate.targetPresentation
    ? Object.fromEntries(
        Object.entries(candidate.targetPresentation).map(([target, presentation]) => {
          if (!presentation) {
            return [target, presentation];
          }
          const nextExplanation =
            trustModePresentationExplanation(presentation.explanation, operatorTrustMode)
            ?? presentation.explanation;
          const nextSummary =
            presentation.explanation?.text
            && nextExplanation?.text
            && presentation.summary === presentation.explanation.text
              ? nextExplanation.text
              : presentation.summary;
          return [
            target,
            {
              ...presentation,
              explanation: nextExplanation,
              summary: nextSummary,
            },
          ];
        }),
      ) as T['targetPresentation']
    : candidate.targetPresentation;

  return {
    ...candidate,
    explanation:
      trustModePresentationExplanation(candidate.explanation, operatorTrustMode)
      ?? candidate.explanation,
    targetPresentation,
  } as T;
}

function buildSummaryLine(args: {
  readiness: ECSMissionReadiness;
  identity: ECSCommandIdentity;
  brief: MissionBrief | null;
  primaryCandidate: ECSOrchestratorCandidate | null;
  topSignal: Signal | null;
  topPriority: ECSPriorityResult | null;
  context: AIContext;
}): string {
  const { readiness, identity, brief, primaryCandidate, topSignal, topPriority, context } = args;

  if (primaryCandidate?.summary) {
    return `${identity.address}, ${primaryCandidate.summary}`;
  }

  if (topSignal) {
    return `${identity.address}, ${topSignal.message}`;
  }

  if (topPriority) {
    return `${identity.address}, ${topPriority.shortReason}`;
  }

  if (brief?.operations?.summary) {
    return `${identity.address}, ${brief.operations.summary}`;
  }

  if (brief?.phase?.summary) {
    return `${identity.address}, ${brief.phase.summary}`;
  }

  if (brief?.summary) {
    return brief.summary;
  }

  const missionStatus = context.mission?.status ?? 'idle';

  if (missionStatus === 'active') {
    return `${identity.address}, mission active. Systems stable. No elevated signals detected.`;
  }

  return `ECS AI ${readiness.toUpperCase()}. Awaiting mission activation.`;
}

function buildCompactLine(args: {
  primaryCandidate: ECSOrchestratorCandidate | null;
  topSignal: Signal | null;
  topPriority: ECSPriorityResult | null;
  brief: MissionBrief | null;
  readiness: ECSMissionReadiness;
  active: boolean;
}): string {
  const { primaryCandidate, topSignal, topPriority, brief, readiness, active } = args;

  if (primaryCandidate?.title) {
    return primaryCandidate.title;
  }

  if (topSignal) {
    return topSignal.title;
  }

  if (topPriority) {
    return topPriority.title.toUpperCase();
  }

  if (brief?.operations?.shortLabel) {
    return brief.operations.shortLabel.toUpperCase();
  }

  if (brief?.phase?.label) {
    return brief.phase.label.toUpperCase();
  }

  if (brief?.compactLabel) {
    return brief.compactLabel;
  }

  if (brief?.headline) {
    return brief.headline;
  }

  if (!active) {
    return 'AI STANDBY';
  }

  return `AI ${readiness.toUpperCase()}`;
}

function buildFallbackContext(
  input: ECSAIActivationInput,
  now: number,
  previousState: ECSAIState | null,
): AIContext {
  const activeRun = asRecord(input.activeRun);
  const fleetFabric = extractFleetFabricPayload(input.vehicleConfig);
  const telemetry = asRecord(input.telemetry);
  const weatherCorridor = asRecord(input.weatherCorridor);
  const routeIntelligence = asRecord(input.routeIntelligence);
  const remoteness = asRecord(input.remoteness);
  const resources = asRecord(input.resources);
  const powerAuthority = asRecord(input.powerAuthority);

  const status = inferMissionStatus(activeRun, previousState);

  return {
    timestamp: now,
    mission: {
      status,
      progress:
        safeNumber(activeRun.progress) ??
        safeNumber(activeRun.progressRatio) ??
        safeNumber(activeRun.completion) ??
        previousState?.context.mission?.progress ??
        0,
      checkpointName:
        safeString(activeRun.checkpointName) ??
        safeString(activeRun.currentCheckpoint) ??
        null,
    },
    vehicle: {
      healthScore:
        safeNumber(fleetFabric?.scoring.overallScore) ??
        safeNumber(telemetry.healthScore) ??
        safeNumber(activeRun.healthScore) ??
        previousState?.context.vehicle?.healthScore ??
        null,
      payloadMargin:
        safeNumber(fleetFabric?.weight.payloadRemaining?.lbs) ??
        safeNumber(activeRun.payloadMargin) ??
        safeNumber(activeRun.remainingPayload) ??
        null,
      payloadUsedPct:
        safeNumber(fleetFabric?.vehicleIntelligence.payloadUsedPct) ??
        safeNumber(fleetFabric?.weight.gvwrUsagePct) ??
        null,
      operatingWeightLbs:
        safeNumber(fleetFabric?.vehicleIntelligence.operatingWeightLbs) ??
        safeNumber(fleetFabric?.weight.operatingWeight?.lbs) ??
        null,
      vehicleClass: safeString(fleetFabric?.vehicleIntelligence.classification.classId),
      vehicleClassLabel: safeString(fleetFabric?.vehicleIntelligence.classification.label),
      weightConfidence: safeString(fleetFabric?.vehicleIntelligence.weightConfidenceLevel),
      fuelPercent:
        safeNumber(telemetry.fuelPercent) ??
        safeNumber(activeRun.fuelPercent) ??
        safeNumber(resources.fuel_level) ??
        null,
      batteryPercent:
        safeNumber(powerAuthority.batteryPercent) ??
        safeNumber(powerAuthority.powerPercent) ??
        safeNumber(telemetry.batteryPercent) ??
        safeNumber(resources.powerPercent) ??
        null,
      coolantTempF: safeNumber(telemetry.coolantTempF),
      oilTempF: safeNumber(telemetry.oilTempF),
      tirePressureLow: safeBoolean(telemetry.tirePressureLow),
      checkEngine: safeBoolean(telemetry.checkEngine),
    },
    environment: {
      weatherSeverity:
        safeNumber(weatherCorridor.weatherSeverity) ??
        safeNumber(weatherCorridor.severity) ??
        null,
      windMph:
        safeNumber(weatherCorridor.windMph) ??
        safeNumber(weatherCorridor.wind_speed) ??
        null,
      visibilityMiles:
        safeNumber(weatherCorridor.visibilityMiles) ??
        safeNumber(weatherCorridor.visibility) ??
        null,
      precipitationIntensity:
        safeNumber(weatherCorridor.precipitationIntensity) ??
        null,
      temperatureF:
        safeNumber(weatherCorridor.temperatureF) ??
        safeNumber(weatherCorridor.tempF) ??
        null,
      remotenessScore:
        safeNumber(remoteness.score) ??
        safeNumber(routeIntelligence.remotenessScore) ??
        safeNumber(activeRun.remotenessScore) ??
        null,
      alertsCount:
        safeNumber(weatherCorridor.alertsCount) ??
        countWeatherAlerts(weatherCorridor),
    },
    route: {
      distanceRemainingMiles:
        safeNumber(activeRun.distanceRemainingMiles) ??
        safeNumber(routeIntelligence.distanceRemainingMiles) ??
        null,
      etaMinutes:
        safeNumber(activeRun.etaMinutes) ??
        safeNumber(routeIntelligence.etaMinutes) ??
        null,
      offRouteMiles:
        safeNumber(routeIntelligence.offRouteMiles) ??
        null,
      bailoutOptions:
        safeNumber(routeIntelligence.bailoutOptions) ??
        null,
      hazardAhead:
        safeBoolean(routeIntelligence.hazardAhead) ??
        false,
      nextHazardDistanceMiles:
        safeNumber(routeIntelligence.nextHazardDistanceMiles) ??
        null,
    },
    resources: {
      fuelRangeMiles:
        safeNumber(resources.fuelRangeMiles) ??
        safeNumber(activeRun.fuelRangeMiles) ??
        null,
      waterPercent:
        safeNumber(resources.waterPercent) ??
        safeNumber(resources.water_level) ??
        null,
      foodPercent:
        safeNumber(resources.foodPercent) ??
        null,
      powerPercent:
        safeNumber(powerAuthority.batteryPercent) ??
        safeNumber(powerAuthority.powerPercent) ??
        safeNumber(resources.powerPercent) ??
        safeNumber(telemetry.batteryPercent) ??
        null,
    },
  };
}

function inferMissionStatus(
  activeRun: Record<string, any>,
  previousState: ECSAIState | null,
): 'idle' | 'active' | 'paused' | 'complete' {
  const direct =
    normalizeMissionStatus(activeRun.status) ??
    normalizeMissionStatus(activeRun.missionStatus) ??
    null;

  if (direct) return direct;
  if (activeRun?.isPaused === true) return 'paused';
  if (activeRun?.isComplete === true) return 'complete';
  if (activeRun?.isActive === true) return 'active';

  return previousState?.context.mission?.status ?? 'idle';
}

function normalizeMissionStatus(
  value: unknown,
): 'idle' | 'active' | 'paused' | 'complete' | undefined {
  const normalized = safeString(value)?.toLowerCase();

  switch (normalized) {
    case 'idle':
    case 'standby':
      return 'idle';
    case 'active':
    case 'running':
    case 'live':
    case 'in_progress':
    case 'in-progress':
      return 'active';
    case 'paused':
    case 'hold':
    case 'on_hold':
    case 'on-hold':
      return 'paused';
    case 'complete':
    case 'completed':
    case 'done':
    case 'finished':
      return 'complete';
    default:
      return undefined;
  }
}

function calculateFieldConfidence(fields: unknown[]): number {
  if (!fields.length) return 0;

  const present = fields.filter((value) => {
    if (typeof value === 'number') return Number.isFinite(value);
    if (typeof value === 'boolean') return true;
    if (typeof value === 'string') return value.trim().length > 0;
    return value != null;
  }).length;

  return present / fields.length;
}

function countWeatherAlerts(weatherCorridor: Record<string, any>): number {
  const directAlerts = Array.isArray(weatherCorridor.alerts)
    ? weatherCorridor.alerts.length
    : 0;

  const pointCollections = [
    weatherCorridor.points,
    weatherCorridor.waypoints,
    weatherCorridor.results,
  ];

  let nestedCount = 0;

  for (const collection of pointCollections) {
    if (!Array.isArray(collection)) continue;

    for (const item of collection) {
      if (Array.isArray(item?.alerts)) {
        nestedCount += item.alerts.length;
      }
    }
  }

  return Math.max(directAlerts, nestedCount);
}

function safeNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function safeString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function safeBoolean(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value;

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true') return true;
    if (normalized === 'false') return false;
  }

  if (typeof value === 'number') {
    if (value === 1) return true;
    if (value === 0) return false;
  }

  return null;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function normalizeTelemetryState(value: string | null): string | null {
  const normalized = value?.trim().toLowerCase() ?? null;
  switch (normalized) {
    case 'live':
      return 'LIVE';
    case 'reconnecting':
      return 'PARTIAL';
    case 'stale':
    case 'last_known':
    case 'last known':
      return 'STALE';
    case 'disconnected':
      return 'ATTENTION';
    case 'partial':
      return 'PARTIAL';
    case 'attention':
      return 'ATTENTION';
    default:
      return value ? value.toUpperCase() : null;
  }
}

function normalizeWeatherStaleness(
  value: string | null,
): 'fresh' | 'aging' | 'stale' | 'very_stale' | 'unknown' {
  switch ((value ?? '').trim().toLowerCase()) {
    case 'fresh':
      return 'fresh';
    case 'aging':
      return 'aging';
    case 'stale':
      return 'stale';
    case 'very_stale':
    case 'very stale':
      return 'very_stale';
    default:
      return 'unknown';
  }
}

function normalizeWeatherSeverityLabel(value: number | null): 'none' | 'advisory' | 'warning' | 'extreme' {
  if (value == null || value <= 0) return 'none';
  if (value >= 3) return 'extreme';
  if (value >= 2) return 'warning';
  return 'advisory';
}

function confidenceFreshnessFromProvider(
  providerTelemetry: { freshness?: string | null } | null | undefined,
  liveFreshness: string | null | undefined,
): 'fresh' | 'aging' | 'stale' | 'unknown' {
  const provider = String(providerTelemetry?.freshness ?? '').trim().toLowerCase();
  if (provider === 'current') return 'fresh';
  if (provider === 'recent') return 'aging';
  if (provider === 'stale') return 'stale';

  switch (String(liveFreshness ?? '').trim().toLowerCase()) {
    case 'current':
      return 'fresh';
    case 'recent':
      return 'aging';
    case 'stale':
      return 'stale';
    default:
      return 'unknown';
  }
}

function buildCriticalIssues(args: {
  telemetry: Record<string, unknown>;
  powerAuthority: Record<string, unknown>;
  resources: Record<string, unknown>;
  routeIntelligence: Record<string, unknown>;
  weatherSeverity: number | null;
}): string[] {
  const issues: string[] = [];
  const powerPercent =
    safeNumber(args.powerAuthority.batteryPercent) ??
    safeNumber(args.powerAuthority.powerPercent) ??
    safeNumber(args.resources.powerPercent);

  if ((safeBoolean(args.telemetry.checkEngine) ?? false) === true) {
    issues.push('Check engine signal active.');
  }
  if (powerPercent != null && powerPercent <= 15) {
    issues.push('House power reserve is critical.');
  }
  if ((args.weatherSeverity ?? 0) >= 2) {
    issues.push('Weather exposure elevated along current corridor.');
  }
  if ((safeBoolean(args.routeIntelligence.hazardAhead) ?? false) === true) {
    issues.push('Route hazard flagged ahead.');
  }

  return issues;
}
