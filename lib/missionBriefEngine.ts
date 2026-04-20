// ============================================================
// ECS MISSION BRIEF ENGINE
// ============================================================
// Commander-style synthesis layer for ECS.
// Consumes ECSAIContext from aiContextBuilder and returns a
// deterministic, UI-ready brief packet.
// ============================================================

import type { AdvisoryMode } from './advisoryStore';
import type { ECSAIContext, ECSAILiveStateBridge } from './aiContextBuilder';
import { buildAIContextFromLiveState } from './aiContextBuilder';
import type { RiskLevel } from './terrainRiskEngine';
import type { SufficiencyLevel } from './resourceForecastEngine';
import type { ECSConfidenceResult } from './ai/confidenceTypes';
import { assessBriefConfidence } from './ai/confidenceEngine';
import type { ECSPriorityResult } from './ai/priorityTypes';
import { operatorTrustModeStore } from './ai/operatorTrustMode';
import {
  trustModeBriefLimits,
  trustModeBriefNote,
} from './ai/operatorTrustResolvers';
import type { ECSOperatorTrustMode } from './ai/operatorTrustTypes';
import type { ECSDegradedOperationsResult } from './ai/degradedOperationsTypes';
import type { ECSExpeditionPhaseResult } from './ai/expeditionPhaseTypes';
import { computeMissionScenario } from './ai/missionScenarioEngine';
import type { ECSMissionScenarioResult } from './ai/missionScenarioTypes';
import { explainRecommendation } from './ai/recommendationExplanationEngine';
import type { ECSExplanationResult } from './ai/recommendationExplanationTypes';
import type { ECSTrustMetadata } from './ai/trustTypes';
import { buildTrustMetadata } from './ai/trustContract';
import {
  assessGpsPriority,
  assessOfflinePriority,
  assessRemotenessPriority,
  assessResourcePriority,
  assessTelemetryPriority,
  assessWeatherPriority,
  applyTrustModeToPriorityResult,
  selectPrimaryPriority,
} from './ai/priorityEngine';

// ============================================================
// TYPES
// ============================================================

export type MissionBriefStatus = 'green' | 'yellow' | 'red';
export type AssistMode = 'suggest_only' | 'confirm' | 'auto_open';
export type AssistSurface =
  | 'intel'
  | 'weather_detail'
  | 'route_weather'
  | 'pin_drawer'
  | 'storage_dashboard'
  | 'offline_cache'
  | 'recenter'
  | 'route_overview'
  | 'telemetry'
  | 'none';

export interface AutonomousAssistRule {
  id: string;
  trigger: string;
  mode: AssistMode;
  surface: AssistSurface;
  title: string;
  message: string;
  priority: number;
  cooldownSec: number;
  requiresConfirmation: boolean;
  icon?: string;
}

export interface AutonomousAssistState {
  enabled: boolean;
  summary: string | null;
  mode: AssistMode;
  primaryRule: AutonomousAssistRule | null;
  rules: AutonomousAssistRule[];
  suggestedSurface: AssistSurface;
  requiresConfirmation: boolean;
  eventKey: string | null;
}

export interface MissionBriefLine {
  id: string;
  text: string;
  mode: AdvisoryMode;
  priority: number;
  icon?: string;
}

export interface MissionBriefTask {
  id: string;
  title: string;
  detail?: string | null;
  urgency: 'now' | 'next' | 'monitor';
  category: 'mission' | 'route' | 'environment' | 'resources' | 'systems';
  icon?: string;
  sourceIds?: string[];
}

export interface MissionBriefTaskDelta {
  newTasks: string[];
  clearedTasks: string[];
  unchangedTasks: string[];
}

export interface MissionBriefTaskLane {
  id: 'mission' | 'route' | 'environment' | 'resources' | 'systems';
  label: string;
  highestUrgency: 'now' | 'next' | 'monitor' | null;
  tasks: MissionBriefTask[];
  count: number;
}

export interface MissionBriefTaskLaneDelta {
  activatedLanes: string[];
  clearedLanes: string[];
  persistentLanes: string[];
}

export type MissionBriefSurfaceTarget =
  | 'nav_banner'
  | 'map_warning'
  | 'weather_banner'
  | 'resource_widget'
  | 'system_banner'
  | 'mission_panel'
  | 'dashboard_tile'
  | 'intel_card'
  | 'voice_queue';

export interface MissionBriefSurfaceLaneRoute {
  laneId: MissionBriefTaskLane['id'];
  laneLabel: string;
  surfaces: MissionBriefSurfaceTarget[];
  urgency: MissionBriefTaskLane['highestUrgency'];
  topTaskTitle: string | null;
}

export interface MissionBriefSurfacePromotion {
  surface: MissionBriefSurfaceTarget;
  title: string;
  message: string;
  severity: 'watch' | 'critical';
  eventKey: string;
}

export interface MissionBriefSurfaceRouting {
  primarySurface: MissionBriefSurfaceTarget | null;
  laneRoutes: MissionBriefSurfaceLaneRoute[];
  promotedSurfaces: MissionBriefSurfacePromotion[];
  summary: string | null;
}

export interface MissionBriefSection {
  title: string;
  summary: string;
  status: MissionBriefStatus;
  lines: MissionBriefLine[];
}

export interface MissionBriefPowerMeta {
  provider: string | null;
  deviceLabel: string | null;
  freshness: string | null;
  freshnessText: string | null;
  batteryPercent: number | null;
  inputWatts: number | null;
  outputWatts: number | null;
  solarInputWatts: number | null;
  estimatedRuntimeMinutes: number | null;
}

export interface MissionBrief {
  generatedAt: string;
  status: MissionBriefStatus;
  confidence: ECSConfidenceResult;
  trust?: ECSTrustMetadata | null;
  priority: ECSPriorityResult | null;
  operations?: ECSDegradedOperationsResult | null;
  phase?: ECSExpeditionPhaseResult | null;
  explanation?: ECSExplanationResult | null;
  missionScenario?: ECSMissionScenarioResult | null;
  headline: string;
  summary: string;

  commandIntent: string;
  operatorNote: string | null;

  keyRisks: string[];
  recommendations: string[];
  advisories: string[];

  missionSection: MissionBriefSection;
  routeSection: MissionBriefSection;
  environmentSection: MissionBriefSection;
  resourcesSection: MissionBriefSection;
  systemsSection: MissionBriefSection;

  dashboardBarMessages: MissionBriefLine[];
  compactLabel: string;
  priorityMessage?: string | null;
  compactTone?: 'stable' | 'watch' | 'critical';
  changeSummary?: string | null;
  powerMeta?: MissionBriefPowerMeta | null;
  operatorTasks: MissionBriefTask[];
  operatorTaskLanes: MissionBriefTaskLane[];
  primaryTask?: MissionBriefTask | null;
  primaryLane?: MissionBriefTaskLane | null;
  taskDelta?: MissionBriefTaskDelta | null;
  laneDelta?: MissionBriefTaskLaneDelta | null;
  surfaceRouting?: MissionBriefSurfaceRouting | null;
  autonomousAssist: AutonomousAssistState;
}

// ============================================================
// PUBLIC API
// ============================================================

export async function generateMissionBriefFromLiveState(liveState: ECSAILiveStateBridge | null = null): Promise<MissionBrief> {
  const ctx = await buildAIContextFromLiveState(liveState, {
    skipWeatherFetch: !!liveState?.environment?.weather,
  });
  return generateMissionBrief(ctx);
}

export function generateMissionBrief(
  ctx: ECSAIContext,
  options: { operatorTrustMode?: ECSOperatorTrustMode } = {},
): MissionBrief {
  const operatorTrustMode = options.operatorTrustMode ?? operatorTrustModeStore.mode;
  const briefLimits = trustModeBriefLimits(operatorTrustMode);
  const missionScenario = computeMissionScenario({
    richContext: ctx,
    operatorTrustMode,
  });
  const missionSection = buildMissionSection(ctx, missionScenario);
  const routeSection = buildRouteSection(ctx);
  const environmentSection = buildEnvironmentSection(ctx);
  const resourcesSection = buildResourcesSection(ctx);
  const systemsSection = buildSystemsSection(ctx);

  const keyRisks = dedupe([
    ...linesToRiskTexts(routeSection.lines),
    ...linesToRiskTexts(environmentSection.lines),
    ...linesToRiskTexts(resourcesSection.lines),
    ...linesToRiskTexts(systemsSection.lines),
  ]).slice(0, 5);

  const recommendations = dedupe([
    ...missionScenario.requiredActions,
    ...extractRecommendations(routeSection.lines),
    ...extractRecommendations(environmentSection.lines),
    ...extractRecommendations(resourcesSection.lines),
    ...extractRecommendations(systemsSection.lines),
    ...buildStrategicRecommendations(ctx, missionScenario),
  ]).slice(0, briefLimits.recommendations);

  const advisories = dedupe([
    ...collectAdvisories(missionSection.lines),
    ...collectAdvisories(routeSection.lines),
    ...collectAdvisories(environmentSection.lines),
    ...collectAdvisories(resourcesSection.lines),
    ...collectAdvisories(systemsSection.lines),
  ]).slice(0, briefLimits.advisories);

  const status = deriveOverallStatus(ctx, {
    routeSection,
    environmentSection,
    resourcesSection,
    systemsSection,
  });
  const operations = ctx.operations?.degraded ?? null;
  const phase = ctx.phase?.current ?? null;

  const headline = buildHeadline(ctx, status, phase);
  const summary = buildSummary(ctx, status, operations, phase, missionScenario);
  const commandIntent = buildCommandIntent(ctx, status, phase);
  const operatorNote = trustModeBriefNote(operatorTrustMode, buildOperatorNote(ctx, operations, missionScenario));
  const confidence = assessBriefConfidence({
    hasActiveRoute: ctx.meta.hasActiveRoute || ctx.meta.hasActiveRun,
    hasFreshWeather:
      ctx.environment.weather.staleness === 'fresh' || ctx.environment.weather.staleness === 'aging',
    hasRemoteness: !!ctx.environment.remoteness,
    hasTelemetry: !!ctx.resources.telemetryReadout,
    hasGpsFix: String((ctx.environment.gps as any)?.gpsStatus ?? '').toUpperCase() === 'ACTIVE',
    connectivityOnline: !!ctx.environment.connectivity?.isOnline,
    dataCompleteness: ctx.meta.dataCompleteness,
    warnings: ctx.meta.warnings,
  });
  const priority = applyTrustModeToPriorityResult(
    buildMissionBriefPriority(ctx, confidence),
    operatorTrustMode,
    {
      confidence,
      domain: 'ecs_brief',
    },
  );
  const explanation = explainRecommendation({
    type: 'brief',
    drivers: [
      ...missionScenario.limitations.slice(0, 1),
      ...(keyRisks.slice(0, 2)),
      ...(recommendations.slice(0, 1)),
      ...(phase?.reasons.slice(0, 1) ?? []),
    ],
    confidenceLevel: confidence.level,
    priorityLevel: priority?.level,
    degradedState: operations?.state,
    trustMode: operatorTrustMode,
  });

  const dashboardBarMessages = buildDashboardBarMessages({
    missionSection,
    routeSection,
    environmentSection,
    resourcesSection,
    systemsSection,
    status,
  });
  const operatorTasks = buildOperatorTasks(ctx, recommendations);
  const operatorTaskLanes = buildOperatorTaskLanes(operatorTasks);
  const primaryLane = operatorTaskLanes[0] ?? null;
  const primaryTask = primaryLane?.tasks?.[0] ?? operatorTasks[0] ?? null;
  const priorityMessage =
    priority?.title ??
    primaryTask?.title ??
    primaryLane?.tasks?.[0]?.title ??
    dashboardBarMessages[0]?.text ??
    keyRisks[0] ??
    recommendations[0] ??
    null;

  const autonomousAssist = buildAutonomousAssist(ctx, {
    status,
    priorityMessage: dashboardBarMessages[0] ?? null,
    environmentSection,
    resourcesSection,
    systemsSection,
    routeSection,
  });

  return {
    generatedAt: new Date().toISOString(),
    status,
    confidence,
    trust: buildTrustMetadata({
      confidence,
      liveStatus: ctx.liveStatus.overall,
      operationalState: operations?.state ?? null,
      explanation,
      freshnessClass: 'expedition',
      timestamp: ctx.meta.builtAt,
    }),
    priority,
    operations,
    phase,
    explanation,
    missionScenario,
    headline,
    summary,
    commandIntent,
    operatorNote,
    keyRisks,
    recommendations,
    advisories,
    missionSection,
    routeSection,
    environmentSection,
    resourcesSection,
    systemsSection,
    dashboardBarMessages,
    compactLabel: buildCompactLabel(ctx, status, operations, phase),
    priorityMessage,
    compactTone:
      priority?.level === 'critical'
        ? 'critical'
        : priority?.level === 'warning' || priority?.level === 'caution' || status === 'yellow'
          ? 'watch'
          : 'stable',
    changeSummary: null,
    powerMeta: buildPowerMeta(ctx),
    operatorTasks,
    operatorTaskLanes,
    primaryTask,
    primaryLane,
    taskDelta: null,
    laneDelta: null,
    surfaceRouting: buildMissionBriefSurfaceRouting({
      status,
      operatorTaskLanes,
      primaryLane,
      primaryTask,
      changeSummary: null,
    }),
    autonomousAssist,
  };
}

export function deriveMissionBriefTaskDelta(previous: MissionBrief | null | undefined, next: MissionBrief | null | undefined): MissionBriefTaskDelta | null {
  if (!next) return null;

  const prevIds = new Set((previous?.operatorTasks ?? []).map((task) => task.id));
  const nextIds = new Set((next.operatorTasks ?? []).map((task) => task.id));

  const newTasks = (next.operatorTasks ?? []).filter((task) => !prevIds.has(task.id)).map((task) => task.title);
  const clearedTasks = (previous?.operatorTasks ?? []).filter((task) => !nextIds.has(task.id)).map((task) => task.title);
  const unchangedTasks = (next.operatorTasks ?? []).filter((task) => prevIds.has(task.id)).map((task) => task.title);

  return {
    newTasks,
    clearedTasks,
    unchangedTasks,
  };
}

export function deriveMissionBriefLaneDelta(previous: MissionBrief | null | undefined, next: MissionBrief | null | undefined): MissionBriefTaskLaneDelta | null {
  if (!next) return null;

  const prevIds = new Set((previous?.operatorTaskLanes ?? []).filter((lane) => lane.tasks.length > 0).map((lane) => lane.id));
  const nextIds = new Set((next.operatorTaskLanes ?? []).filter((lane) => lane.tasks.length > 0).map((lane) => lane.id));

  const activatedLanes = (next.operatorTaskLanes ?? []).filter((lane) => lane.tasks.length > 0 && !prevIds.has(lane.id)).map((lane) => lane.label);
  const clearedLanes = (previous?.operatorTaskLanes ?? []).filter((lane) => lane.tasks.length > 0 && !nextIds.has(lane.id)).map((lane) => lane.label);
  const persistentLanes = (next.operatorTaskLanes ?? []).filter((lane) => lane.tasks.length > 0 && prevIds.has(lane.id)).map((lane) => lane.label);

  return {
    activatedLanes,
    clearedLanes,
    persistentLanes,
  };
}

export function applyMissionBriefSurfaceRouting(previous: MissionBrief | null | undefined, next: MissionBrief): MissionBrief {
  const operatorTaskLanes = next.operatorTaskLanes?.length ? next.operatorTaskLanes : buildOperatorTaskLanes(next.operatorTasks ?? []);
  const primaryLane = next.primaryLane ?? operatorTaskLanes?.[0] ?? null;
  const primaryTask = next.primaryTask ?? primaryLane?.tasks?.[0] ?? next.operatorTasks?.[0] ?? null;
  const surfaceRouting = buildMissionBriefSurfaceRouting({
    status: next.status,
    operatorTaskLanes,
    primaryLane,
    primaryTask,
    changeSummary: next.changeSummary ?? null,
  });

  return {
    ...next,
    operatorTaskLanes,
    primaryLane,
    primaryTask,
    surfaceRouting,
  };
}

export function applyMissionBriefTaskDelta(previous: MissionBrief | null | undefined, next: MissionBrief): MissionBrief {
  const taskDelta = deriveMissionBriefTaskDelta(previous, next);
  const laneDelta = deriveMissionBriefLaneDelta(previous, next);
  const operatorTaskLanes = next.operatorTaskLanes?.length ? next.operatorTaskLanes : buildOperatorTaskLanes(next.operatorTasks ?? []);
  const primaryLane = next.primaryLane ?? operatorTaskLanes?.[0] ?? null;
  const primaryTask = next.primaryTask ?? primaryLane?.tasks?.[0] ?? next.operatorTasks?.[0] ?? null;

  return applyMissionBriefSurfaceRouting(previous, {
    ...next,
    operatorTaskLanes,
    primaryLane,
    primaryTask,
    taskDelta,
    laneDelta,
  });
}

// ============================================================
// PRIORITY
// ============================================================

function buildMissionBriefPriority(
  ctx: ECSAIContext,
  confidence: ECSConfidenceResult,
): ECSPriorityResult | null {
  const routeActive = ctx.meta.hasActiveRoute || ctx.meta.hasActiveRun;
  const remotenessScore = nullableNumber((ctx.environment.remoteness as any)?.score) ?? 0;
  const providerTelemetry = (ctx.resources as any)?.providerTelemetry ?? null;
  const telemetryState = String(providerTelemetry?.legacyTelemetryState ?? (ctx.resources.telemetryReadout as any)?.state ?? '').toUpperCase() || null;
  const gpsStatus = String((ctx.environment.gps as any)?.gpsStatus ?? '').toUpperCase() || null;
  const weatherStaleness = ctx.environment.weather.staleness;
  const weatherSeverity = ctx.environment.weather.severity ?? 'none';
  const connectivityLevel = String((ctx.environment.connectivity as any)?.level ?? '').toLowerCase();
  const connectivityOnline = !!ctx.environment.connectivity?.isOnline;
  const resourceForecastLevel = String((ctx.resources.forecast as any)?.sufficiencyLevel ?? '');
  const powerPercent =
    nullableNumber((ctx.resources.powerAuthority as any)?.batteryPercent) ??
    nullableNumber((ctx.resources.telemetryReadout as any)?.powerPercent);
  const fuelPercent = nullableNumber((ctx.resources.forecast as any)?.fuelReservePercent);
  const waterPercent = nullableNumber((ctx.resources.forecast as any)?.waterReservePercent);
  const repeatedDisconnects =
    !!providerTelemetry?.repeatedDisconnects
    || (
      String((ctx.resources.powerAuthority as any)?.freshness ?? '').toLowerCase() === 'reconnecting'
      && !connectivityOnline
    );

  return selectPrimaryPriority([
    (ctx.risk.terrainRisk as any)?.priority ?? null,
    (ctx.environment.remoteness as any)?.priority ?? null,
    assessWeatherPriority({
      severity: weatherSeverity,
      routeActive,
      alertCount: Array.isArray((ctx.environment.weather.current as any)?.alerts)
        ? (ctx.environment.weather.current as any).alerts.length
        : 0,
      stale: weatherStaleness === 'stale' || weatherStaleness === 'very_stale',
      offline: !connectivityOnline,
      confidence,
    }),
    assessResourcePriority({
      kind: 'power',
      percent: powerPercent,
      routeActive,
      remotenessScore,
      confidence,
    }),
    assessResourcePriority({
      kind: 'fuel',
      percent: fuelPercent,
      routeActive,
      remotenessScore,
      confidence,
    }),
    assessResourcePriority({
      kind: 'water',
      percent: waterPercent,
      routeActive,
      remotenessScore,
      confidence,
    }),
    assessTelemetryPriority({
      state: telemetryState,
      routeActive,
      repeatedDisconnects,
      confidence,
    }),
    assessGpsPriority({
      gpsStatus,
      routeActive,
      remotenessScore,
      riskLevel: (ctx.risk.terrainRisk as any)?.riskLevel ?? null,
      confidence,
    }),
    assessOfflinePriority({
      offline: connectivityLevel === 'no_service' || connectivityLevel === 'offline',
      degraded: connectivityLevel === 'limited' || connectivityLevel === 'degraded' || weatherStaleness === 'very_stale',
      routeActive,
      cloudDependent: true,
      confidence,
    }),
    resourceForecastLevel === 'Resources Insufficient'
      ? assessResourcePriority({
          kind: 'power',
          percent: Math.min(powerPercent ?? 100, 10),
          routeActive,
          remotenessScore,
          confidence,
        })
      : null,
    routeActive && remotenessScore > 0
      ? assessRemotenessPriority({
          score: remotenessScore,
          level: String((ctx.environment.remoteness as any)?.tier ?? (ctx.environment.remoteness as any)?.level ?? 'unknown'),
          routeActive,
          noSignal:
            (ctx.environment.remoteness as any)?.connectivity?.isOffline === true ||
            String((ctx.environment.remoteness as any)?.connectivity?.signal ?? '').toLowerCase() === 'no_signal',
          forecastIncreasing: !!(ctx.environment.remoteness as any)?.forecast?.isIncreasing,
          confidence: (ctx.environment.remoteness as any)?.confidence ?? confidence,
        })
      : null,
  ]);
}

// ============================================================
// SECTION BUILDERS
// ============================================================

function buildMissionSection(
  ctx: ECSAIContext,
  missionScenario: ECSMissionScenarioResult | null = null,
): MissionBriefSection {
  const lines: MissionBriefLine[] = [];

  const missionName = ctx.summary.missionName ?? 'Active Expedition';
  const vehicleName = ctx.summary.vehicleName ?? 'Vehicle not identified';
  const criticalMissing = ctx.mission.itemCounts?.criticalMissing ?? 0;
  const packedItems = ctx.mission.itemCounts?.packed ?? 0;
  const totalItems = ctx.mission.itemCounts?.total ?? 0;

  if (!ctx.meta.hasActiveExpedition) {
    lines.push(line('mission-no-exp', 'No active expedition session detected.', 'standby', 6, 'pause-circle-outline'));
  } else {
    lines.push(line('mission-active', `${missionName} active on ${vehicleName}.`, 'standby', 6, 'flag-outline'));
  }

  if (criticalMissing > 0) {
    lines.push(line(
      'mission-critical-missing',
      `${criticalMissing} critical loadout item${criticalMissing === 1 ? '' : 's'} missing.`,
      'alert',
      1,
      'warning-outline',
    ));
  } else if (totalItems > 0) {
    lines.push(line(
      'mission-loadout-ok',
      `${packedItems}/${totalItems} mission items accounted for.`,
      'standby',
      6,
      'checkbox-outline',
    ));
  }

  if (ctx.readiness.available === false && ctx.readiness.reason) {
    lines.push(line(
      'mission-readiness-pending',
      'Mission readiness bridge still pending full vehicle-weight wiring.',
      'advisory',
      5,
      'construct-outline',
    ));
  }

  const planningPhase =
    ctx.phase?.current.phase === 'vehicle_setup'
    || ctx.phase?.current.phase === 'staging'
    || ctx.phase?.current.phase === 'camp_stationary';
  if (planningPhase && missionScenario) {
    lines.push(line(
      'mission-scenario',
      missionScenario.summary,
      missionScenario.level === 'needs_preparation' || missionScenario.level === 'watch_closely'
        ? 'advisory'
        : 'standby',
      missionScenario.level === 'needs_preparation' ? 3 : 5,
      missionScenario.level === 'needs_preparation' || missionScenario.level === 'watch_closely'
        ? 'construct-outline'
        : 'map-outline',
    ));
  }

  const status = statusFromLines(lines);
  const summary = summarizeMissionSection(ctx, status);

  return {
    title: 'MISSION',
    summary,
    status,
    lines,
  };
}

function buildRouteSection(ctx: ECSAIContext): MissionBriefSection {
  const lines: MissionBriefLine[] = [];
  const intel = ctx.route.routeIntelligence;
  const terrain = ctx.route.terrainIntelligence;
  const campIntel = ctx.route.campIntel;
  const campDecision = ctx.route.campDecision;
  const routeContext = ctx.route.routeContext;
  const terrainRisk = ctx.risk.terrainRisk;

  if (!ctx.meta.hasActiveRoute && !ctx.meta.hasActiveRun) {
    lines.push(line('route-none', 'No active route loaded.', 'standby', 6, 'map-outline'));
    return {
      title: 'ROUTE',
      summary: 'No active route intelligence available.',
      status: 'green',
      lines,
    };
  }

  if (intel) {
    lines.push(line(
      'route-distance',
      `${formatMiles((intel as any).totalDistanceMiles)} route with ${formatHours((intel as any).estimatedDriveTimeHours)} estimated drive time.`,
      'standby',
      6,
      'trail-sign-outline',
    ));
  }

  if (campIntel?.available) {
    const bestCandidate = campIntel.bestCandidate;
    lines.push(line(
      'route-camp-intel',
      campIntel.headline ?? `${campIntel.viableCount} viable overnight camp options ahead.`,
      bestCandidate?.confidence === 'low' ? 'advisory' : 'standby',
      bestCandidate?.confidence === 'low' ? 4 : 5,
      'bed-outline',
    ));

    (campIntel.routeGuidance ?? []).slice(0, 2).forEach((message, index) => {
      lines.push(line(
        `route-camp-guidance-${index}`,
        message,
        campIntel.stopBeforeDark || campIntel.lowConfidenceBeyondTop ? 'advisory' : 'standby',
        campIntel.stopBeforeDark ? 3 : 5,
        index === 0 ? 'moon-outline' : 'navigate-outline',
      ));
    });

    if (campIntel.offlineAssessment) {
      lines.push(line(
        'route-camp-offline',
        campIntel.offlineAssessment.notes[0] ?? 'Camp recommendation is operating from cached route context.',
        'advisory',
        4,
        'cloud-offline-outline',
      ));
    }
  }

  if (campDecision?.available) {
    const decisionMode =
      campDecision.campRecommendationType === 'stop_now' ||
      campDecision.campRecommendationType === 'do_not_pass_current_high_confidence_camp' ||
      campDecision.campRecommendationType === 'use_emergency_overnight_option'
        ? 'alert'
        : campDecision.campRecommendationType === 'reassess_soon' || campDecision.campRecommendationType === 'low_confidence_ahead'
          ? 'advisory'
          : 'standby';
    const decisionPriority =
      campDecision.campRecommendationType === 'stop_now' ||
      campDecision.campRecommendationType === 'do_not_pass_current_high_confidence_camp'
        ? 1
        : campDecision.campRecommendationType === 'use_emergency_overnight_option'
          ? 2
          : campDecision.campRecommendationType === 'reassess_soon'
            ? 3
            : 4;

    lines.push(line(
      'route-camp-decision',
      campDecision.headline ?? campDecision.recommendedAction,
      decisionMode,
      decisionPriority,
      campDecision.campRecommendationType === 'continue_to_better_camp' ? 'navigate-outline' : 'bed-outline',
    ));

    lines.push(line(
      'route-camp-action',
      campDecision.recommendedAction,
      decisionMode,
      Math.min(5, decisionPriority + 1),
      campDecision.campRecommendationType === 'stop_now' ? 'moon-outline' : 'trail-sign-outline',
    ));

    campDecision.decisionReasons.slice(0, 2).forEach((reason, index) => {
      lines.push(line(
        `route-camp-reason-${index}`,
        reason,
        decisionMode === 'alert' ? 'advisory' : decisionMode,
        Math.min(5, decisionPriority + 2),
        'chevron-forward-outline',
      ));
    });

    if (campDecision.alternativesSummary[0]?.summary) {
      lines.push(line(
        'route-camp-alt',
        campDecision.alternativesSummary[0].summary,
        'advisory',
        4,
        'swap-horizontal-outline',
      ));
    }

    if (campDecision.offlineLimited || campDecision.conservativeMode) {
      lines.push(line(
        'route-camp-conservative',
        campDecision.offlineLimited
          ? 'Camp decision is operating conservatively on cached or stale forward inputs.'
          : 'Camp decision has shifted conservative because timing, weather, or resource pressure is rising.',
        'advisory',
        4,
        campDecision.offlineLimited ? 'cloud-offline-outline' : 'shield-outline',
      ));
    }
  }

  if (terrainRisk?.riskLevel === 'critical') {
    lines.push(line(
      'route-risk-critical',
      'Terrain risk is critical for the current profile.',
      'alert',
      1,
      'warning-outline',
    ));
  } else if (terrainRisk?.riskLevel === 'high') {
    lines.push(line(
      'route-risk-high',
      'Terrain risk is elevated for the current route and build.',
      'alert',
      2,
      'alert-circle-outline',
    ));
  } else if (terrainRisk?.riskLevel === 'moderate') {
    lines.push(line(
      'route-risk-moderate',
      'Terrain exposure is moderate. Maintain conservative pace and line choice.',
      'advisory',
      4,
      'analytics-outline',
    ));
  }

  const topRiskDrivers = (terrainRisk?.drivers ?? []).slice(0, 2);
  topRiskDrivers.forEach((driver: string, idx: number) => {
    lines.push(line(
      `route-driver-${idx}`,
      driver,
      terrainRisk?.riskLevel === 'critical' || terrainRisk?.riskLevel === 'high' ? 'alert' : 'advisory',
      terrainRisk?.riskLevel === 'critical' ? 1 : 3,
      'chevron-forward-outline',
    ));
  });

  if (routeContext && (routeContext as any).bailoutAvailable === false) {
    const pct = Math.round((routeContext as any).progressPercent ?? 0);
    lines.push(line(
      'route-no-bailout',
      pct > 70
        ? `${pct}% committed with no bailout currently available.`
        : 'No bailout currently available on the active route.',
      'alert',
      pct > 70 ? 1 : 2,
      'exit-outline',
    ));
  } else if ((routeContext as any)?.estimatedTimeToBailoutMin != null && (routeContext as any).estimatedTimeToBailoutMin > 120) {
    lines.push(line(
      'route-bailout-far',
      `Nearest bailout is approximately ${Math.round((routeContext as any).estimatedTimeToBailoutMin / 60)} hours away.`,
      'advisory',
      3,
      'time-outline',
    ));
  }

  if (terrain) {
    if ((terrain as any).mountainPassDetected) {
      lines.push(line(
        'route-pass',
        `Mountain pass exposure detected (${(terrain as any).mountainPassCount} pass zone${(terrain as any).mountainPassCount === 1 ? '' : 's'}).`,
        'advisory',
        3,
        'triangle-outline',
      ));
    }

    if (((terrain as any).highElevationSegments ?? 0) > 0) {
      lines.push(line(
        'route-high-elevation',
        `${(terrain as any).highElevationSegments} high-elevation segment${(terrain as any).highElevationSegments === 1 ? '' : 's'} ahead.`,
        'advisory',
        4,
        'arrow-up-circle-outline',
      ));
    }

    if (((terrain as any).steepSegments ?? 0) > 0) {
      lines.push(line(
        'route-steep',
        `${(terrain as any).steepSegments} steep segment${(terrain as any).steepSegments === 1 ? '' : 's'} identified along the route.`,
        'advisory',
        4,
        'trending-up-outline',
      ));
    }
  }

  const status = statusFromLines(lines);
  const summary = summarizeRouteSection(ctx, status);

  return {
    title: 'ROUTE',
    summary,
    status,
    lines,
  };
}

function buildEnvironmentSection(ctx: ECSAIContext): MissionBriefSection {
  const lines: MissionBriefLine[] = [];
  const remote = ctx.environment.remoteness;
  const gps = ctx.environment.gps;
  const conn = ctx.environment.connectivity;
  const weather = ctx.environment.weather.current;

  if (remote) {
    if (remote.tier === 'EXTREME' || remote.tier === 'DEEP REMOTE') {
      lines.push(line(
        'env-remote-high',
        `Operating in ${remote.tier} conditions (remoteness ${Math.round(remote.score)}).`,
        'alert',
        2,
        'planet-outline',
      ));
    } else if (remote.tier === 'REMOTE') {
      lines.push(line(
        'env-remote',
        `Remoteness elevated: ${remote.tier} (${Math.round(remote.score)}).`,
        'advisory',
        3,
        'planet-outline',
      ));
    } else {
      lines.push(line(
        'env-remote-low',
        `Remoteness ${remote.tier.toLowerCase()} at ${Math.round(remote.score)}.`,
        'standby',
        6,
        'planet-outline',
      ));
    }

    if (remote.reason) {
      lines.push(line(
        'env-remote-reason',
        remote.reason,
        'advisory',
        5,
        'information-circle-outline',
      ));
    }
  }

  if (gps.gpsStatus === 'OFFLINE' || gps.gpsStatus === 'DENIED' || gps.gpsStatus === 'UNAVAILABLE') {
    lines.push(line(
      'env-gps-bad',
      'GPS unavailable or denied. Navigation confidence degraded.',
      'alert',
      1,
      'locate-outline',
    ));
  } else if (gps.gpsStatus === 'ACQUIRING' || gps.gpsStatus === 'RETRYING') {
    lines.push(line(
      'env-gps-acquiring',
      'GPS still acquiring a stable fix.',
      'advisory',
      3,
      'navigate-outline',
    ));
  }

  if (conn?.level === 'no_service') {
    lines.push(line(
      'env-connectivity-none',
      'No verified connectivity service.',
      'alert',
      2,
      'cloud-offline-outline',
    ));
  } else if (conn?.level === 'limited') {
    lines.push(line(
      'env-connectivity-limited',
      'Connectivity degraded. Expect sync and weather lag.',
      'advisory',
      4,
      'cellular-outline',
    ));
  }

  if (weather) {
    const severe = (weather.alerts ?? []).find((a: any) => a.severity === 'extreme' || a.severity === 'warning');
    if (severe) {
      lines.push(line(
        'env-weather-alert',
        severe.title,
        severe.severity === 'extreme' ? 'alert' : 'advisory',
        severe.severity === 'extreme' ? 1 : 2,
        'rainy-outline',
      ));
    }

    const wind = num((weather as any)?.wind_speed);
    const visibility = num((weather as any)?.visibility);
    const main = String((weather as any)?.weather_main ?? '').toLowerCase();

    if (wind >= 40) {
      lines.push(line(
        'env-wind-critical',
        `High winds at ${Math.round(wind)} mph may create hazardous control conditions.`,
        'alert',
        2,
        'flag-outline',
      ));
    } else if (wind >= 25) {
      lines.push(line(
        'env-wind-warning',
        `Winds near ${Math.round(wind)} mph may affect exposed travel and dust.`,
        'advisory',
        4,
        'flag-outline',
      ));
    }

    if (visibility > 0 && visibility <= 1600) {
      lines.push(line(
        'env-visibility-low',
        'Visibility is reduced and may conceal terrain changes or route markers.',
        visibility <= 500 ? 'alert' : 'advisory',
        visibility <= 500 ? 1 : 3,
        'eye-outline',
      ));
    }

    if (main.includes('snow') || main.includes('thunderstorm') || main.includes('fog') || main.includes('mist')) {
      lines.push(line(
        'env-surface',
        `Current weather (${main}) may degrade traction or route reading.`,
        'advisory',
        4,
        'partly-sunny-outline',
      ));
    }
  }

  if (ctx.environment.weather.staleness === 'stale' || ctx.environment.weather.staleness === 'very_stale') {
    lines.push(line(
      'env-weather-stale',
      'Weather data is stale. Visual confirmation recommended.',
      'advisory',
      5,
      'time-outline',
    ));
  }

  const status = statusFromLines(lines);
  const summary = summarizeEnvironmentSection(ctx, status);

  return {
    title: 'ENVIRONMENT',
    summary,
    status,
    lines,
  };
}

function buildResourcesSection(ctx: ECSAIContext): MissionBriefSection {
  const lines: MissionBriefLine[] = [];
  const telemetry = ctx.resources.telemetryReadout;
  const forecast = ctx.resources.forecast;
  const power = (ctx.resources as any).powerAuthority ?? null;
  const providerTelemetry = (ctx.resources as any).providerTelemetry ?? null;

  if (power?.providerLabel || power?.deviceLabel) {
    lines.push(line(
      'res-power-source',
      `Primary power source ${power.deviceLabel || 'device'} on ${power.providerLabel || 'unknown provider'}.`,
      'standby',
      6,
      'battery-charging-outline',
    ));
  }

  if (power?.batteryPercent != null) {
    lines.push(line(
      'res-power-soc',
      `House power reserve at ${Math.round(power.batteryPercent)}%.`,
      power.batteryPercent <= 15 ? 'alert' : power.batteryPercent <= 30 ? 'advisory' : 'standby',
      power.batteryPercent <= 15 ? 1 : power.batteryPercent <= 30 ? 3 : 6,
      'battery-half-outline',
    ));
  }

  if (power?.estimatedRuntimeMinutes != null) {
    lines.push(line(
      'res-power-runtime',
      `Estimated power runtime ${formatRuntimeMinutes(power.estimatedRuntimeMinutes)}.`,
      power.estimatedRuntimeMinutes <= 120 ? 'advisory' : 'standby',
      power.estimatedRuntimeMinutes <= 120 ? 3 : 6,
      'time-outline',
    ));
  }

  if (power?.outputWatts != null || power?.solarInputWatts != null || power?.inputWatts != null) {
    lines.push(line(
      'res-power-flow',
      `Power flow ${formatWatts(power.outputWatts)} out • ${formatWatts(power.solarInputWatts ?? power.inputWatts)} in.`,
      'advisory',
      5,
      'flash-outline',
    ));
  }

  if (
    providerTelemetry?.summary
    && providerTelemetry.state !== 'live_provider_connected'
  ) {
    lines.push(line(
      'res-provider-state',
      providerTelemetry.summary,
      providerTelemetry.state === 'manual_baseline' || providerTelemetry.state === 'cloud_backed'
        ? 'advisory'
        : 'alert',
      providerTelemetry.state === 'manual_baseline' || providerTelemetry.state === 'cloud_backed'
        ? 4
        : 3,
      providerTelemetry.state === 'waiting_for_provider' ? 'sync-outline' : 'pulse-outline',
    ));
  } else if (power?.freshness === 'stale' || power?.freshness === 'last_known') {
    lines.push(line(
      'res-power-stale',
      `Shared power telemetry is ${String(power.freshness).replace('_', ' ')}. Verify reserve before committing deeper.`,
      'advisory',
      3,
      'pulse-outline',
    ));
  } else if (power?.freshness === 'reconnecting') {
    lines.push(line(
      'res-power-reconnecting',
      'Shared power telemetry is reconnecting. Values may be briefly delayed.',
      'advisory',
      4,
      'sync-outline',
    ));
  }

  if (telemetry?.criticals?.length) {
    telemetry.criticals.slice(0, 3).forEach((critical: string, idx: number) => {
      lines.push(line(
        `res-critical-${idx}`,
        critical,
        'alert',
        2,
        'warning-outline',
      ));
    });
  }

  if (forecast) {
    if (forecast.sufficiencyLevel === 'Resources Insufficient') {
      lines.push(line(
        'res-insufficient',
        'Projected resources will fall short of the current route.',
        'alert',
        1,
        'warning-outline',
      ));
    } else if (forecast.sufficiencyLevel === 'Resources Limited') {
      lines.push(line(
        'res-limited',
        'Resource margins are limited for the current route.',
        'alert',
        2,
        'alert-circle-outline',
      ));
    } else if (forecast.sufficiencyLevel === 'Watch Consumption') {
      lines.push(line(
        'res-watch',
        'Resources are adequate but should be monitored closely.',
        'advisory',
        4,
        'eye-outline',
      ));
    } else {
      lines.push(line(
        'res-stable',
        'Resource forecast is stable for the current route.',
        'standby',
        6,
        'checkmark-circle-outline',
      ));
    }

    (forecast.drivers ?? []).slice(0, 3).forEach((driver: string, idx: number) => {
      lines.push(line(
        `res-driver-${idx}`,
        driver,
        forecast.overallStatus === 'LOW' ? 'alert' : 'advisory',
        forecast.overallStatus === 'LOW' ? 2 : 4,
        'chevron-forward-outline',
      ));
    });

    const intel = forecast.intelMessages ?? [];
    intel.slice(0, 2).forEach((msg: any, idx: number) => {
      lines.push(line(
        `res-intel-${idx}`,
        msg.message,
        msg.severity === 'critical' || msg.severity === 'warning' ? 'alert' : 'advisory',
        msg.severity === 'critical' ? 1 : msg.severity === 'warning' ? 2 : 4,
        msg.icon || 'flash-outline',
      ));
    });
  } else if (telemetry) {
    lines.push(line(
      'res-telemetry-only',
      `Telemetry state ${telemetry.state}. Forecast not yet synthesized.`,
      'advisory',
      5,
      'speedometer-outline',
    ));
  } else {
    lines.push(line(
      'res-none',
      'No telemetry or forecast available.',
      'standby',
      6,
      'battery-dead-outline',
    ));
  }

  const status = statusFromLines(lines);
  const summary = summarizeResourcesSection(ctx, status);

  return {
    title: 'RESOURCES',
    summary,
    status,
    lines,
  };
}

function buildSystemsSection(ctx: ECSAIContext): MissionBriefSection {
  const lines: MissionBriefLine[] = [];
  const telemetry = ctx.resources.telemetryReadout;
  const providerTelemetry = (ctx.resources as any)?.providerTelemetry ?? null;
  const gps = ctx.environment.gps;
  const conn = ctx.environment.connectivity;

  const telemetryState = providerTelemetry?.legacyTelemetryState ?? telemetry?.state ?? null;

  if (telemetryState === 'ATTENTION') {
    lines.push(line(
      'sys-telemetry-attention',
      'Telemetry is in attention state. System confidence reduced.',
      'alert',
      2,
      'pulse-outline',
    ));
  } else if (telemetryState === 'PARTIAL') {
    lines.push(line(
      'sys-telemetry-partial',
      'Telemetry is partial. Some values are estimated or missing.',
      'advisory',
      4,
      'pulse-outline',
    ));
  } else if (telemetryState === 'LIVE') {
    lines.push(line(
      'sys-telemetry-live',
      'Telemetry is live.',
      'standby',
      6,
      'pulse-outline',
    ));
  }

  if (gps.fixQuality === 'LOW' || gps.fixQuality === 'NONE') {
    lines.push(line(
      'sys-gps-quality',
      `GPS fix quality ${String(gps.fixQuality).toLowerCase()}.`,
      gps.fixQuality === 'NONE' ? 'alert' : 'advisory',
      gps.fixQuality === 'NONE' ? 2 : 4,
      'locate-outline',
    ));
  }

  if (conn?.latencyMs != null && conn.latencyMs > 1500) {
    lines.push(line(
      'sys-latency',
      `Network latency elevated at ${Math.round(conn.latencyMs)} ms.`,
      'advisory',
      5,
      'swap-horizontal-outline',
    ));
  }

  if ((ctx.navigation as any)?.cameraMode === 'replay') {
    lines.push(line(
      'sys-camera-replay',
      'Replay owns the map camera. Live route follow is temporarily suspended.',
      'advisory',
      4,
      'play-outline',
    ));
  } else if ((ctx.navigation as any)?.cameraMode === 'free_pan') {
    lines.push(line(
      'sys-camera-free-pan',
      'Map camera is in free-pan mode. Confirm position against route before committing forward.',
      'advisory',
      5,
      'hand-left-outline',
    ));
  }

  if ((ctx.storage as any)?.offlineCacheState === 'critical' || (ctx.storage as any)?.offlineCacheState === 'warning') {
    lines.push(line(
      'sys-offline-cache',
      (ctx.storage as any)?.storageUsageLabel
        ? `Offline storage attention required: ${(ctx.storage as any).storageUsageLabel}.`
        : 'Offline storage attention required.',
      (ctx.storage as any)?.offlineCacheState === 'critical' ? 'alert' : 'advisory',
      (ctx.storage as any)?.offlineCacheState === 'critical' ? 2 : 5,
      'server-outline',
    ));
  }

  if (ctx.meta.warnings.length) {
    ctx.meta.warnings.slice(0, 2).forEach((w, idx) => {
      lines.push(line(
        `sys-builder-warning-${idx}`,
        w,
        'advisory',
        5,
        'construct-outline',
      ));
    });
  }

  const status = statusFromLines(lines);
  const summary = summarizeSystemsSection(ctx, status);

  return {
    title: 'SYSTEMS',
    summary,
    status,
    lines,
  };
}

// ============================================================
// BRIEF SYNTHESIS
// ============================================================

function deriveOverallStatus(
  ctx: ECSAIContext,
  sections: {
    routeSection: MissionBriefSection;
    environmentSection: MissionBriefSection;
    resourcesSection: MissionBriefSection;
    systemsSection: MissionBriefSection;
  },
): MissionBriefStatus {
  if (ctx.summary.criticalIssues.length > 0) return 'red';

  const statuses = [
    sections.routeSection.status,
    sections.environmentSection.status,
    sections.resourcesSection.status,
    sections.systemsSection.status,
  ];

  if (statuses.includes('red')) return 'red';
  if (statuses.includes('yellow')) return 'yellow';
  if (ctx.meta.confidence === 'low') return 'yellow';
  return 'green';
}

function buildHeadline(
  ctx: ECSAIContext,
  status: MissionBriefStatus,
  phase: ECSExpeditionPhaseResult | null,
): string {
  const routeName = ctx.summary.routeName ?? 'CURRENT ROUTE';

  if (!ctx.meta.hasActiveExpedition) {
    if (phase?.phase === 'vehicle_setup') return 'SETUP POSTURE — VEHICLE READINESS';
    if (phase?.phase === 'staging') return 'STAGING — PRE-DEPARTURE';
    return 'STANDBY — NO ACTIVE EXPEDITION';
  }
  if (status === 'red') return `CRITICAL POSTURE — ${routeName.toUpperCase()}`;
  if (status === 'yellow') return `ELEVATED WATCH — ${routeName.toUpperCase()}`;
  if (phase?.phase === 'camp_stationary') return `CAMP POSTURE — ${routeName.toUpperCase()}`;
  if (phase?.phase === 'recovery_exit') return `EXIT POSTURE — ${routeName.toUpperCase()}`;
  if (phase?.phase === 'trail_entry') return `TRAIL ENTRY — ${routeName.toUpperCase()}`;
  return `MISSION STABLE — ${routeName.toUpperCase()}`;
}

function buildSummary(
  ctx: ECSAIContext,
  status: MissionBriefStatus,
  operations: ECSDegradedOperationsResult | null,
  phase: ECSExpeditionPhaseResult | null,
  missionScenario: ECSMissionScenarioResult | null = null,
): string {
  const planningPhase =
    phase?.phase === 'vehicle_setup'
    || phase?.phase === 'staging'
    || phase?.phase === 'camp_stationary';
  if (planningPhase && missionScenario) {
    return missionScenario.summary;
  }

  if (!ctx.meta.hasActiveExpedition) {
    if (phase?.phase === 'vehicle_setup') {
      return 'ECS is in vehicle setup posture. Finish vehicle, resources, and loadout before expedition activation.';
    }
    if (phase?.phase === 'staging') {
      return 'ECS is in staging posture. Vehicle readiness is established, but the expedition is not yet underway.';
    }
    return 'ECS is standing by. No active expedition session is currently driving mission synthesis.';
  }

  const mission = ctx.summary.missionName ?? 'Active expedition';
  const route = ctx.summary.routeName ?? 'active route';
  const remote = ctx.summary.remotenessTier ?? 'unknown remoteness';
  const campDecision = ctx.route.campDecision;

  if (status === 'red') {
    if (campDecision?.available) {
      return `${mission} is in a critical command posture on ${route}. ${campDecision.recommendedAction}`;
    }
    if (operations && operations.state !== 'fully_operational') {
      return `${mission} is in a critical command posture on ${route}. ${operations.summary}`;
    }
    return `${mission} is in a critical command posture on ${route}. Remoteness, route, or resource conditions require immediate operator attention.`;
  }

  if (status === 'yellow') {
    if (campDecision?.available) {
      return `${mission} remains active on ${route}. ${campDecision.recommendedAction}`;
    }
    if (operations && operations.state !== 'fully_operational') {
      return `${mission} remains active on ${route}. ${operations.summary}`;
    }
    return `${mission} remains active on ${route} with elevated watch items. Current operating picture indicates ${remote.toLowerCase()} conditions with moderate command attention required.`;
  }

  if (campDecision?.available) {
    if (operations && operations.state !== 'fully_operational') {
      return `${mission} is operating on ${route}. ${campDecision.recommendedAction} ${operations.summary}`;
    }
    return `${mission} is operating on ${route}. ${campDecision.recommendedAction}`;
  }

  if (operations && operations.state !== 'fully_operational') {
    return `${mission} is operating on ${route}. ${operations.summary}`;
  }

  if (phase?.phase === 'transit') {
    return `${mission} is in transit on ${route}. Next direction, ETA, and fuel margin remain the primary command focus.`;
  }
  if (phase?.phase === 'trail_entry') {
    return `${mission} is entering expedition terrain on ${route}. Terrain, remoteness, and bailout posture are becoming more important than paved-transit metrics.`;
  }
  if (phase?.phase === 'active_expedition') {
    return `${mission} is in active expedition posture on ${route}. Terrain risk, remoteness, and resource margin are the primary command concerns.`;
  }
  if (phase?.phase === 'camp_stationary') {
    return `${mission} is stationary on ${route}. Overnight weather, power, comms, and next-day readiness now matter most.`;
  }
  if (phase?.phase === 'recovery_exit') {
    return `${mission} is transitioning toward exit on ${route}. Safer access, bailout margin, and return-routing are now the primary command focus.`;
  }

  return `${mission} is operating within expected margins on ${route}. Systems, route, and environmental picture are currently stable.`;
}

function buildCommandIntent(
  ctx: ECSAIContext,
  status: MissionBriefStatus,
  phase: ECSExpeditionPhaseResult | null,
): string {
  if (!ctx.meta.hasActiveExpedition) {
    if (phase?.phase === 'vehicle_setup') {
      return 'Finish vehicle setup, verify resources, and complete loadout before committing to route guidance.';
    }
    if (phase?.phase === 'staging') {
      return 'Finalize route, readiness, and departure checks before movement begins.';
    }
    return 'Complete expedition setup, verify vehicle state, and load a route before mission activation.';
  }

  const campDecision = ctx.route.campDecision;
  if (campDecision?.available) {
    if (
      campDecision.campRecommendationType === 'stop_now' ||
      campDecision.campRecommendationType === 'do_not_pass_current_high_confidence_camp' ||
      campDecision.campRecommendationType === 'use_emergency_overnight_option'
    ) {
      return `Take ${campDecision.recommendedCampLabel ?? 'the recommended camp'} now, preserve arrival margin, and avoid pressing into lower-confidence terrain.`;
    }
    if (campDecision.campRecommendationType === 'continue_to_better_camp') {
      return `Continue to ${campDecision.recommendedCampLabel ?? 'the stronger camp'} while timing, confidence, and route margin remain acceptable.`;
    }
    if (campDecision.campRecommendationType === 'reassess_soon' || campDecision.campRecommendationType === 'low_confidence_ahead') {
      return 'Maintain conservative route posture and reassess camp guidance before deeper commitment.';
    }
  }

  if (status === 'red') {
    return 'Stabilize the mission picture immediately. Reduce exposure, confirm route posture, and protect resource margin.';
  }

  if (status === 'yellow') {
    return 'Maintain command awareness, tighten monitoring, and correct elevated risks before they compound.';
  }

  if (phase?.phase === 'transit') {
    return 'Prioritize next direction, ETA, fuel margin, and clean route progress until trail entry.';
  }
  if (phase?.phase === 'trail_entry') {
    return 'Slow the transition into trail conditions and confirm terrain, remoteness, and bailout posture.';
  }
  if (phase?.phase === 'active_expedition') {
    return 'Maintain expedition posture and preserve margin across terrain, remoteness, and resources.';
  }
  if (phase?.phase === 'camp_stationary') {
    return 'Shift to overnight readiness: weather, power, comms, and next-day departure margin.';
  }
  if (phase?.phase === 'recovery_exit') {
    return 'Prioritize exit routing, fuel, and safer access until clear of expedition terrain.';
  }

  return 'Continue forward with disciplined monitoring and preserve margin across route, environment, and resources.';
}

function buildOperatorNote(
  ctx: ECSAIContext,
  operations: ECSDegradedOperationsResult | null,
  missionScenario: ECSMissionScenarioResult | null = null,
): string | null {
  if (operations && operations.state !== 'fully_operational') {
    return operations.operatorActions[0] ?? operations.summary;
  }

  const phase = ctx.phase?.current.phase ?? null;
  if (
    missionScenario
    && (phase === 'vehicle_setup' || phase === 'staging' || phase === 'camp_stationary')
    && missionScenario.requiredActions.length > 0
  ) {
    return missionScenario.requiredActions[0];
  }

  if (ctx.meta.warnings.length > 0) {
    return 'Some AI inputs are degraded or partially unavailable. Use visual confirmation where possible.';
  }

  if (ctx.readiness.available === false && ctx.readiness.reason) {
    return ctx.readiness.reason;
  }

  return null;
}

function buildDashboardBarMessages(args: {
  missionSection: MissionBriefSection;
  routeSection: MissionBriefSection;
  environmentSection: MissionBriefSection;
  resourcesSection: MissionBriefSection;
  systemsSection: MissionBriefSection;
  status: MissionBriefStatus;
}): MissionBriefLine[] {
  const all = [
    ...args.missionSection.lines,
    ...args.routeSection.lines,
    ...args.environmentSection.lines,
    ...args.resourcesSection.lines,
    ...args.systemsSection.lines,
  ];

  return dedupeLines([...all])
    .sort((a, b) => a.priority - b.priority || modeWeight(a.mode) - modeWeight(b.mode))
    .slice(0, args.status === 'red' ? 5 : 4);
}

function buildCompactLabel(
  ctx: ECSAIContext,
  status: MissionBriefStatus,
  operations: ECSDegradedOperationsResult | null,
  phase: ECSExpeditionPhaseResult | null,
): string {
  if (!ctx.meta.hasActiveExpedition) {
    if (phase?.phase === 'vehicle_setup') return 'SETUP';
    if (phase?.phase === 'staging') return 'STAGING';
    return 'STANDBY';
  }
  const telemetryState = String(ctx.summary.telemetryState ?? '').toUpperCase();
  const gpsStatus = String(ctx.summary.gpsStatus ?? '').toUpperCase();
  const riskLevel = String(ctx.summary.riskLevel ?? '').toUpperCase();
  const forecastLevel = shortForecastLabel(ctx.resources.forecast?.sufficiencyLevel ?? null);

  if (status === 'red') {
    if (telemetryState.includes('ATTENTION')) return 'POWER ALERT';
    if (gpsStatus === 'OFFLINE' || gpsStatus === 'UNAVAILABLE' || gpsStatus === 'DENIED') return 'GPS LOST';
    if (riskLevel === 'CRITICAL') return 'ROUTE CRITICAL';
    if (forecastLevel === 'INSUFFICIENT') return 'RESOURCES LOW';
    return 'CRITICAL';
  }

  if (status === 'yellow') {
    if (telemetryState.includes('PARTIAL')) return 'TELEM WATCH';
    if (gpsStatus === 'ACQUIRING' || gpsStatus === 'RETRYING') return 'GPS WATCH';
    if (forecastLevel === 'LIMITED' || forecastLevel === 'WATCH') return 'RESOURCE WATCH';
    return 'WATCH';
  }

  if (operations?.state === 'offline_capable') return 'OFFLINE READY';
  if (operations?.state === 'limited') return 'LIMITED';
  if (operations?.state === 'degraded') return 'DEGRADED';
  if (operations?.state === 'unavailable') return 'UNAVAILABLE';

  if (phase?.phase === 'transit') return 'TRANSIT';
  if (phase?.phase === 'trail_entry') return 'TRAIL ENTRY';
  if (phase?.phase === 'active_expedition') return 'EXPEDITION';
  if (phase?.phase === 'camp_stationary') return 'CAMP';
  if (phase?.phase === 'recovery_exit') return 'EXIT';

  return 'STABLE';
}

function dedupeLines(lines: MissionBriefLine[]): MissionBriefLine[] {
  const seen = new Set<string>();
  const out: MissionBriefLine[] = [];
  for (const line of lines) {
    const key = `${line.mode}::${line.text}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(line);
  }
  return out;
}

function modeWeight(mode: AdvisoryMode): number {
  if (mode === 'alert') return 0;
  if (mode === 'advisory') return 1;
  return 2;
}

// ============================================================
// SECTION SUMMARIES
// ============================================================

function summarizeMissionSection(ctx: ECSAIContext, status: MissionBriefStatus): string {
  if (!ctx.meta.hasActiveExpedition) return 'No expedition session is active.';
  if (status === 'red') return 'Mission setup contains critical gaps.';
  if (status === 'yellow') return 'Mission setup is active with minor readiness gaps.';
  return 'Mission setup is stable and accounted for.';
}

function summarizeRouteSection(ctx: ECSAIContext, status: MissionBriefStatus): string {
  if (!ctx.meta.hasActiveRoute && !ctx.meta.hasActiveRun) return 'No active route intelligence available.';
  if (ctx.route.campDecision?.summaryLine) {
    return ctx.route.campDecision.summaryLine;
  }
  if (ctx.route.campIntel?.summaryLine) {
    return ctx.route.campIntel.summaryLine;
  }
  if (status === 'red') return 'Route exposure is critical and requires active control.';
  if (status === 'yellow') return 'Route exposure is elevated and should be managed conservatively.';
  return 'Route picture is stable for the current mission profile.';
}

function summarizeEnvironmentSection(_ctx: ECSAIContext, status: MissionBriefStatus): string {
  if (status === 'red') return 'Environmental conditions are actively degrading mission safety.';
  if (status === 'yellow') return 'Environmental picture is elevated with moderate exposure.';
  return 'Environmental conditions are currently within expected operating bounds.';
}

function summarizeResourcesSection(_ctx: ECSAIContext, status: MissionBriefStatus): string {
  if (status === 'red') return 'Resource margin is insufficient for the present mission posture.';
  if (status === 'yellow') return 'Resource usage should be monitored closely.';
  return 'Resource picture is stable for the current route.';
}

function summarizeSystemsSection(ctx: ECSAIContext, status: MissionBriefStatus): string {
  if (ctx.meta.warnings.length > 0) return 'Some AI input channels are degraded or stale.';
  if (status === 'red') return 'System confidence is degraded and requires correction.';
  if (status === 'yellow') return 'Systems are partially degraded but still usable.';
  return 'Core system confidence is stable.';
}

// ============================================================
// RECOMMENDATION BUILDERS
// ============================================================

function buildStrategicRecommendations(
  ctx: ECSAIContext,
  missionScenario: ECSMissionScenarioResult | null = null,
): string[] {
  const recs: string[] = [];
  const campDecision = ctx.route.campDecision;

  if (missionScenario) {
    recs.push(...missionScenario.requiredActions.slice(0, 2));
    recs.push(...missionScenario.limitations.slice(0, 1));
  }

  if (campDecision?.available) {
    recs.push(campDecision.recommendedAction);
    recs.push(...campDecision.decisionReasons.slice(0, 2));
    if (campDecision.nextReassessmentTrigger) {
      recs.push(campDecision.nextReassessmentTrigger.label);
    }
  }

  const riskLevel = (ctx.risk.terrainRisk?.riskLevel ?? '').toLowerCase();
  if (riskLevel === 'critical' || riskLevel === 'high') {
    recs.push('Reduce pace and reassess the active route against vehicle capability.');
  }

  const remoteTier = String(ctx.summary.remotenessTier ?? '').toUpperCase();
  if (remoteTier === 'DEEP REMOTE' || remoteTier === 'EXTREME') {
    recs.push('Protect resource margin and confirm bailout assumptions before deeper commitment.');
  }

  const forecastLevel = shortForecastLabel(ctx.resources.forecast?.sufficiencyLevel ?? null);
  if (forecastLevel === 'INSUFFICIENT' || forecastLevel === 'LIMITED') {
    recs.push('Shift to conservation posture and verify resupply options.');
  }

  if (ctx.environment.weather.staleness === 'stale' || ctx.environment.weather.staleness === 'very_stale') {
    recs.push('Visually confirm weather and trail surface conditions before committing forward.');
  }

  if ((ctx.navigation as any)?.cameraMode === 'free_pan') {
    recs.push('Recenter or confirm the manual map view before using the brief for route decisions.');
  }

  if ((ctx.summary.weatherLevel ?? '').toLowerCase() === 'extreme') {
    recs.push('Delay deeper commitment until extreme weather exposure is confirmed manageable.');
  }

  if (ctx.meta.warnings.length > 0) {
    recs.push('Cross-check dashboard intelligence against field conditions while data channels recover.');
  }

  if (recs.length === 0) {
    recs.push('Maintain current route posture and continue monitored forward progress.');
  }

  return recs;
}

// ============================================================
// OPERATOR TASKING
// ============================================================

function buildOperatorTaskLanes(tasks: MissionBriefTask[]): MissionBriefTaskLane[] {
  const laneOrder: MissionBriefTaskLane['id'][] = ['mission', 'route', 'environment', 'resources', 'systems'];
  const laneLabels: Record<MissionBriefTaskLane['id'], string> = {
    mission: 'MISSION',
    route: 'ROUTE',
    environment: 'ENVIRONMENT',
    resources: 'RESOURCES',
    systems: 'SYSTEMS',
  };

  const lanes = laneOrder.map((laneId) => {
    const laneTasks = tasks
      .filter((task) => task.category === laneId)
      .sort(compareTasks);

    return {
      id: laneId,
      label: laneLabels[laneId],
      highestUrgency: laneTasks[0]?.urgency ?? null,
      tasks: laneTasks,
      count: laneTasks.length,
    } satisfies MissionBriefTaskLane;
  });

  return lanes
    .filter((lane) => lane.count > 0)
    .sort((a, b) => {
      const urgencyDiff = urgencyWeight(a.highestUrgency) - urgencyWeight(b.highestUrgency);
      if (urgencyDiff !== 0) return urgencyDiff;
      return laneOrder.indexOf(a.id) - laneOrder.indexOf(b.id);
    });
}

function compareTasks(a: MissionBriefTask, b: MissionBriefTask) {
  const urgencyDiff = urgencyWeight(a.urgency) - urgencyWeight(b.urgency);
  if (urgencyDiff !== 0) return urgencyDiff;
  return String(a.title).localeCompare(String(b.title));
}

function urgencyWeight(urgency: MissionBriefTask['urgency'] | MissionBriefTaskLane['highestUrgency']) {
  if (urgency === 'now') return 0;
  if (urgency === 'next') return 1;
  if (urgency === 'monitor') return 2;
  return 9;
}

function buildOperatorTasks(ctx: ECSAIContext, recommendations: string[]): MissionBriefTask[] {
  const tasks: MissionBriefTask[] = [];
  const campDecision = ctx.route.campDecision;

  if (campDecision?.available) {
    tasks.push(task(
      `camp-${campDecision.campRecommendationType}`,
      campDecision.recommendedAction,
      campDecision.decisionReasons[0] ?? campDecision.summaryLine ?? null,
      campDecision.campRecommendationType === 'stop_now' ||
      campDecision.campRecommendationType === 'do_not_pass_current_high_confidence_camp' ||
      campDecision.campRecommendationType === 'use_emergency_overnight_option'
        ? 'now'
        : campDecision.campRecommendationType === 'continue_to_better_camp' || campDecision.campRecommendationType === 'take_backup_camp'
          ? 'next'
          : 'monitor',
      'route',
      campDecision.campRecommendationType === 'continue_to_better_camp' ? 'navigate-outline' : 'bed-outline',
    ));
  }

  const criticalMissing = ctx.mission.itemCounts?.criticalMissing ?? 0;
  if (criticalMissing > 0) {
    tasks.push(task(
      'mission-critical-loadout',
      `Resolve ${criticalMissing} critical loadout item${criticalMissing === 1 ? '' : 's'} before deeper commitment.`,
      'Missing critical kit directly reduces mission readiness.',
      'now',
      'mission',
      'checkbox-outline',
    ));
  }

  if (ctx.risk.terrainRisk?.riskLevel === 'critical') {
    tasks.push(task(
      'route-critical-risk',
      'Reassess the active route and identify the nearest safer exit line.',
      ctx.risk.terrainRiskSummary ?? 'Terrain exposure is beyond comfortable margin.',
      'now',
      'route',
      'warning-outline',
    ));
  } else if (ctx.risk.terrainRisk?.riskLevel === 'high') {
    tasks.push(task(
      'route-high-risk',
      'Reduce pace and validate line choice through the next risk segment.',
      ctx.risk.terrainRiskSummary ?? 'Terrain exposure is elevated.',
      'next',
      'route',
      'trail-sign-outline',
    ));
  }

  const weatherLevel = String(ctx.summary.weatherLevel ?? ctx.environment.weather.severity ?? '').toLowerCase();
  if (weatherLevel === 'extreme') {
    tasks.push(task(
      'env-weather-extreme',
      'Pause forward commitment until extreme weather exposure is confirmed manageable.',
      ctx.environment.weather.current?.alerts?.[0]?.title ?? 'Extreme weather is influencing route safety.',
      'now',
      'environment',
      'rainy-outline',
    ));
  } else if (weatherLevel === 'warning') {
    tasks.push(task(
      'env-weather-warning',
      'Confirm route, visibility, and surface conditions before the next leg.',
      'Weather warning conditions are active along the corridor.',
      'next',
      'environment',
      'cloud-outline',
    ));
  }

  if (ctx.environment.gps.gpsStatus === 'OFFLINE' || ctx.environment.gps.gpsStatus === 'UNAVAILABLE' || ctx.environment.gps.gpsStatus === 'DENIED') {
    tasks.push(task(
      'sys-gps-restore',
      'Restore GPS confidence or switch to manual route verification immediately.',
      'Mission navigation confidence is degraded without GPS.',
      'now',
      'systems',
      'locate-outline',
    ));
  }

  if (ctx.resources.forecast?.sufficiencyLevel === 'Resources Insufficient') {
    tasks.push(task(
      'res-insufficient',
      'Shift to immediate conservation posture and verify resupply or exit options.',
      'Projected resources will not support the current route as planned.',
      'now',
      'resources',
      'battery-dead-outline',
    ));
  } else if (ctx.resources.forecast?.sufficiencyLevel === 'Resources Limited') {
    tasks.push(task(
      'res-limited',
      'Tighten consumption and monitor resource draw through the next route segment.',
      'Resource margin is limited for the current route.',
      'next',
      'resources',
      'speedometer-outline',
    ));
  }

  if (ctx.summary.telemetryState && String(ctx.summary.telemetryState).toUpperCase() === 'ATTENTION') {
    tasks.push(task(
      'sys-telemetry-attention',
      'Validate telemetry trust before using automation-driven resource assumptions.',
      'Telemetry feed is degraded or incomplete.',
      'next',
      'systems',
      'pulse-outline',
    ));
  }

  if ((ctx.navigation as any)?.cameraMode === 'free_pan') {
    tasks.push(task(
      'nav-free-pan',
      'Recenter the map or confirm manual camera posture before making route decisions.',
      'The current map is not locked to forward movement.',
      'monitor',
      'systems',
      'compass-outline',
    ));
  }

  if ((ctx.storage as any)?.offlineCacheState === 'critical' || (ctx.storage as any)?.offlineCacheState === 'warning') {
    tasks.push(task(
      'storage-watch',
      'Review offline storage pressure before adding more route or tile load.',
      (ctx.storage as any)?.storageUsageLabel ?? 'Offline cache usage is elevated.',
      'monitor',
      'systems',
      'server-outline',
    ));
  }

  for (const [idx, rec] of recommendations.slice(0, 3).entries()) {
    tasks.push(task(
      `rec-${idx}`,
      rec,
      null,
      idx === 0 ? 'next' : 'monitor',
      inferTaskCategory(rec),
      'chevron-forward-outline',
    ));
  }

  return rankTasks(tasks).slice(0, 6);
}

function inferTaskCategory(text: string): MissionBriefTask['category'] {
  const lower = String(text).toLowerCase();
  if (lower.includes('route') || lower.includes('bailout') || lower.includes('pace') || lower.includes('line choice')) return 'route';
  if (lower.includes('weather') || lower.includes('surface') || lower.includes('visibility')) return 'environment';
  if (lower.includes('resource') || lower.includes('consumption') || lower.includes('resupply') || lower.includes('power')) return 'resources';
  if (lower.includes('gps') || lower.includes('telemetry') || lower.includes('map') || lower.includes('camera')) return 'systems';
  return 'mission';
}

function rankTasks(tasks: MissionBriefTask[]): MissionBriefTask[] {
  const urgencyScore = { now: 0, next: 1, monitor: 2 } as const;
  const deduped = new Map<string, MissionBriefTask>();

  for (const taskItem of tasks) {
    const existing = deduped.get(taskItem.id);
    if (!existing || urgencyScore[taskItem.urgency] < urgencyScore[existing.urgency]) {
      deduped.set(taskItem.id, taskItem);
    }
  }

  return Array.from(deduped.values()).sort((a, b) => {
    const urgencyDiff = urgencyScore[a.urgency] - urgencyScore[b.urgency];
    if (urgencyDiff !== 0) return urgencyDiff;
    return a.title.localeCompare(b.title);
  });
}

function task(
  id: string,
  title: string,
  detail: string | null,
  urgency: MissionBriefTask['urgency'],
  category: MissionBriefTask['category'],
  icon?: string,
): MissionBriefTask {
  return { id, title, detail, urgency, category, icon };
}

// ============================================================
// EXTRACTION HELPERS
// ============================================================

function linesToRiskTexts(lines: MissionBriefLine[]): string[] {
  return lines
    .filter(l => l.mode === 'alert' || l.priority <= 3)
    .map(l => l.text);
}

function extractRecommendations(lines: MissionBriefLine[]): string[] {
  return lines
    .filter(l => {
      const text = l.text.toLowerCase();
      return text.includes('recommend') || text.includes('monitor') || text.includes('maintain') || text.includes('confirm');
    })
    .map(l => l.text);
}

function collectAdvisories(lines: MissionBriefLine[]): string[] {
  return lines
    .filter(l => l.mode !== 'standby')
    .map(l => l.text);
}

// ============================================================
// STATUS HELPERS
// ============================================================

function statusFromLines(lines: MissionBriefLine[]): MissionBriefStatus {
  const hasPriority12Alert = lines.some(l => l.mode === 'alert' && l.priority <= 2);
  if (hasPriority12Alert) return 'red';

  const hasAlert = lines.some(l => l.mode === 'alert');
  const hasAdvisory = lines.some(l => l.mode === 'advisory');
  if (hasAlert || hasAdvisory) return 'yellow';

  return 'green';
}

// ============================================================
// SMALL HELPERS
// ============================================================

function line(
  id: string,
  text: string,
  mode: AdvisoryMode,
  priority: number,
  icon?: string,
): MissionBriefLine {
  return { id, text, mode, priority, icon };
}

function formatMiles(value?: number | null): string {
  const n = num(value);
  if (!n) return '0 mi';
  return `${Math.round(n * 10) / 10} mi`;
}

function formatHours(value?: number | null): string {
  const n = num(value);
  if (!n) return '0h';
  if (n < 1) return `${Math.round(n * 60)}m`;
  return `${Math.round(n * 10) / 10}h`;
}

function shortForecastLabel(value?: SufficiencyLevel | null): string {
  switch (value) {
    case 'Resources Insufficient': return 'INSUFFICIENT';
    case 'Resources Limited': return 'LIMITED';
    case 'Watch Consumption': return 'WATCH';
    case 'Stable': return 'STABLE';
    default: return 'UNKNOWN';
  }
}


function buildPowerMeta(ctx: ECSAIContext): MissionBriefPowerMeta | null {
  const power = (ctx.resources as any)?.powerAuthority;
  if (!power) return null;
  return {
    provider: power.provider ?? null,
    deviceLabel: power.deviceLabel ?? null,
    freshness: power.freshness ?? null,
    freshnessText: power.freshnessText ?? null,
    batteryPercent: num(power.batteryPercent),
    inputWatts: num(power.inputWatts),
    outputWatts: num(power.outputWatts),
    solarInputWatts: num(power.solarInputWatts),
    estimatedRuntimeMinutes: num(power.estimatedRuntimeMinutes),
  };
}

function formatRuntimeMinutes(value: number | null | undefined): string {
  const mins = num(value);
  if (mins == null) return 'unknown';
  if (mins < 60) return `${Math.round(mins)} min`;
  const hours = mins / 60;
  return hours >= 10 ? `${Math.round(hours)} hr` : `${hours.toFixed(1)} hr`;
}

function formatWatts(value: number | null | undefined): string {
  const watts = num(value);
  return watts == null ? '0 W' : `${Math.round(watts)} W`;
}

function num(value: any): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function nullableNumber(value: any): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function dedupe(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}


function buildMissionBriefSurfaceRouting(params: {
  status: MissionBriefStatus;
  operatorTaskLanes: MissionBriefTaskLane[];
  primaryLane: MissionBriefTaskLane | null;
  primaryTask: MissionBriefTask | null;
  changeSummary: string | null;
}): MissionBriefSurfaceRouting {
  const laneRoutes: MissionBriefSurfaceLaneRoute[] = (params.operatorTaskLanes ?? [])
    .filter((lane) => (lane.tasks?.length ?? 0) > 0)
    .map((lane) => ({
      laneId: lane.id,
      laneLabel: lane.label,
      surfaces: getLaneSurfaceTargets(lane.id, lane.highestUrgency ?? 'monitor'),
      urgency: lane.highestUrgency ?? 'monitor',
      topTaskTitle: lane.tasks?.[0]?.title ?? null,
    }));

  const primaryRoute = laneRoutes[0] ?? null;
  const primarySurface = primaryRoute?.surfaces?.[0] ?? null;
  const promotedSurfaces: MissionBriefSurfacePromotion[] = [];

  if (primaryRoute && primarySurface && params.primaryTask && (params.status === 'red' || primaryRoute.urgency === 'now' || primaryRoute.urgency === 'next')) {
    const severity = params.status === 'red' || primaryRoute.urgency === 'now' ? 'critical' : 'watch';
    promotedSurfaces.push({
      surface: primarySurface,
      title: `${primaryRoute.laneLabel.toUpperCase()} FOCUS`,
      message: params.primaryTask.title,
      severity,
      eventKey: `${primaryRoute.laneId}:${primaryRoute.urgency}:${params.primaryTask.id}:${severity}`,
    });
  }

  return {
    primarySurface,
    laneRoutes,
    promotedSurfaces,
    summary: params.changeSummary
      ? `${params.changeSummary} → ${primaryRoute?.laneLabel ?? 'Command'} routed to ${formatSurfaceLabel(primarySurface)}`
      : primaryRoute
        ? `${primaryRoute.laneLabel} routed to ${primaryRoute.surfaces.map(formatSurfaceLabel).join(' • ')}`
        : null,
  };
}

function getLaneSurfaceTargets(laneId: MissionBriefTaskLane['id'], urgency: MissionBriefTaskLane['highestUrgency']): MissionBriefSurfaceTarget[] {
  switch (laneId) {
    case 'route':
      return urgency === 'now' ? ['nav_banner', 'map_warning', 'intel_card'] : ['map_warning', 'intel_card', 'dashboard_tile'];
    case 'environment':
      return urgency === 'now' ? ['weather_banner', 'map_warning', 'intel_card'] : ['weather_banner', 'intel_card', 'dashboard_tile'];
    case 'resources':
      return urgency === 'now' ? ['resource_widget', 'dashboard_tile', 'intel_card'] : ['resource_widget', 'intel_card', 'dashboard_tile'];
    case 'systems':
      return urgency === 'now' ? ['system_banner', 'dashboard_tile', 'intel_card'] : ['system_banner', 'intel_card', 'dashboard_tile'];
    case 'mission':
    default:
      return ['mission_panel', 'dashboard_tile', 'intel_card'];
  }
}

function formatSurfaceLabel(surface: MissionBriefSurfaceTarget | null | undefined): string {
  switch (surface) {
    case 'nav_banner': return 'Nav Banner';
    case 'map_warning': return 'Map Warning';
    case 'weather_banner': return 'Weather Banner';
    case 'resource_widget': return 'Resource Widget';
    case 'system_banner': return 'System Banner';
    case 'mission_panel': return 'Mission Panel';
    case 'dashboard_tile': return 'Dashboard Tile';
    case 'intel_card': return 'Intel Card';
    case 'voice_queue': return 'Voice Queue';
    default: return 'Surface';
  }
}


// ============================================================
// SURFACE ACTION HANDLERS
// ============================================================

export type SurfaceActionId =
  | 'open_intel_popup'
  | 'open_weather_detail'
  | 'open_route_weather'
  | 'open_pin_drawer'
  | 'open_storage_dashboard'
  | 'open_offline_cache'
  | 'focus_user_location'
  | 'focus_route_overview'
  | 'focus_active_pin'
  | 'open_telemetry_panel'
  | 'dismiss_banner';

export interface MissionBriefSurfaceAction {
  id: SurfaceActionId;
  label: string;
  target: string;
  lane: MissionBriefTask['category'];
  taskId?: string;
  priority: number;
  reason: string;
  eventKey: string;
}

export function applyMissionBriefSurfaceActions<T extends MissionBrief>(brief: T): T & {
  surfaceActions: {
    primaryAction: MissionBriefSurfaceAction | null;
    recommended: MissionBriefSurfaceAction[];
    summary: string | null;
    eventKey: string | null;
  };
} {
  const lanes = (brief as any).operatorTaskLanes ?? [];
  const routes = (brief as any).surfaceRouting?.laneRoutes ?? [];
  const actions: MissionBriefSurfaceAction[] = [];

  for (const lane of lanes) {
    const laneRoute = routes.find((r: any) => r.lane === lane.id || r.lane === lane.lane);
    const task = lane?.tasks?.[0] ?? null;
    if (!laneRoute || !task) continue;

    const action = buildMissionBriefSurfaceAction(
      lane.id ?? lane.lane,
      task,
      laneRoute.surface,
      laneRoute.reason,
    );
    if (action) actions.push(action);
  }

  const recommended = dedupeMissionBriefSurfaceActions(actions)
    .sort((a, b) => a.priority - b.priority)
    .slice(0, 5);

  const primaryAction = recommended[0] ?? null;
  const summary = primaryAction
    ? `${primaryAction.label}${primaryAction.reason ? ` • ${primaryAction.reason}` : ''}`
    : null;

  return {
    ...(brief as any),
    priorityMessage: (brief as any).priorityMessage ?? primaryAction?.label ?? null,
    surfaceActions: {
      primaryAction,
      recommended,
      summary,
      eventKey: primaryAction?.eventKey ?? null,
    },
  };
}

function buildMissionBriefSurfaceAction(
  lane: MissionBriefTask['category'],
  task: MissionBriefTask,
  target: string,
  routeReason: string,
): MissionBriefSurfaceAction | null {
  const lower = `${task.title} ${task.detail ?? ''}`.toLowerCase();

  let id: SurfaceActionId = 'open_intel_popup';
  let label = 'Open Intel';

  if (lane === 'environment') {
    if (lower.includes('weather')) {
      id = 'open_weather_detail';
      label = 'Open Weather Detail';
    } else {
      id = 'open_route_weather';
      label = 'Open Route Weather';
    }
  } else if (lane === 'resources') {
    if (lower.includes('storage') || lower.includes('offline')) {
      id = 'open_storage_dashboard';
      label = 'Open Storage Dashboard';
    } else {
      id = 'open_telemetry_panel';
      label = 'Open Telemetry Panel';
    }
  } else if (lane === 'systems') {
    if (lower.includes('gps') || lower.includes('follow')) {
      id = 'focus_user_location';
      label = 'Recenter Map';
    } else if (lower.includes('storage')) {
      id = 'open_storage_dashboard';
      label = 'Review Storage';
    }
  } else if (lane === 'route') {
    if (lower.includes('pin')) {
      id = 'open_pin_drawer';
      label = 'Open Pins';
    } else {
      id = 'focus_route_overview';
      label = 'Focus Route';
    }
  } else if (lane === 'mission') {
    id = 'open_intel_popup';
    label = 'Open Mission Panel';
  }

  const lanePriority =
    lane === 'route' ? 10 :
    lane === 'environment' ? 20 :
    lane === 'resources' ? 30 :
    lane === 'systems' ? 40 : 50;

  const urgencyScore =
    task.urgency === 'now' ? 0 :
    task.urgency === 'next' ? 10 : 20;

  return {
    id,
    label,
    target,
    lane,
    taskId: task.id,
    priority: lanePriority + urgencyScore,
    reason: task.detail || routeReason || task.title,
    eventKey: `${lane}:${id}:${task.id}`,
  };
}

function dedupeMissionBriefSurfaceActions(actions: MissionBriefSurfaceAction[]): MissionBriefSurfaceAction[] {
  const seen = new Set<string>();
  const out: MissionBriefSurfaceAction[] = [];
  for (const action of actions) {
    const key = `${action.lane}:${action.id}:${action.taskId ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(action);
  }
  return out;
}


// ============================================================
// AUTONOMOUS ASSIST
// ============================================================

function buildAutonomousAssist(
  ctx: ECSAIContext,
  parts: {
    status: MissionBriefStatus;
    priorityMessage: MissionBriefLine | null;
    environmentSection: MissionBriefSection;
    resourcesSection: MissionBriefSection;
    systemsSection: MissionBriefSection;
    routeSection: MissionBriefSection;
  },
): AutonomousAssistState {
  const rules: AutonomousAssistRule[] = [];
  const gps = ctx.environment.gps as any;
  const conn = ctx.environment.connectivity as any;
  const weather = ctx.environment.weather.current as any;
  const forecast = ctx.resources.forecast as any;
  const telemetry = ctx.resources.telemetryReadout as any;
  const routeContext = ctx.route.routeContext as any;
  const campDecision = ctx.route.campDecision;

  const severeAlert = (weather?.alerts ?? []).find((a: any) => a.severity === 'extreme' || a.severity === 'warning');
  const wind = num(weather?.wind_speed);

  if (severeAlert || wind >= 40) {
    rules.push({
      id: 'wx-critical',
      trigger: severeAlert?.title ?? 'Severe weather',
      mode: 'confirm',
      surface: 'route_weather',
      title: 'WEATHER PRIORITY',
      message: severeAlert?.title ?? 'Severe route weather detected. Review corridor hazards now.',
      priority: 1,
      cooldownSec: 180,
      requiresConfirmation: true,
      icon: 'rainy-outline',
    });
  }

  if (gps?.gpsStatus === 'OFFLINE' || gps?.gpsStatus === 'UNAVAILABLE' || gps?.gpsStatus === 'DENIED') {
    rules.push({
      id: 'gps-loss',
      trigger: 'GPS unavailable',
      mode: 'confirm',
      surface: 'recenter',
      title: 'GPS LOST',
      message: 'GPS signal is degraded or unavailable. Retry GPS and verify current position.',
      priority: 1,
      cooldownSec: 120,
      requiresConfirmation: true,
      icon: 'locate-outline',
    });
  }

  if (forecast?.sufficiencyLevel === 'Resources Insufficient') {
    rules.push({
      id: 'resource-shortfall',
      trigger: 'Resource shortfall',
      mode: 'confirm',
      surface: 'telemetry',
      title: 'RESOURCE SHORTFALL',
      message: 'Projected resources fall short of the active route. Open telemetry and conservation guidance.',
      priority: 1,
      cooldownSec: 240,
      requiresConfirmation: true,
      icon: 'battery-dead-outline',
    });
  }

  if (telemetry?.state === 'ATTENTION') {
    rules.push({
      id: 'telemetry-attention',
      trigger: 'Telemetry attention',
      mode: 'suggest_only',
      surface: 'telemetry',
      title: 'TELEMETRY ATTENTION',
      message: 'Telemetry confidence is reduced. Review power or linked device health.',
      priority: 2,
      cooldownSec: 240,
      requiresConfirmation: false,
      icon: 'pulse-outline',
    });
  }

  if (ctx.environment.weather.staleness === 'very_stale') {
    rules.push({
      id: 'weather-stale',
      trigger: 'Weather stale',
      mode: 'suggest_only',
      surface: 'weather_detail',
      title: 'WEATHER STALE',
      message: 'Weather intelligence is stale. Refresh before deeper commitment.',
      priority: 3,
      cooldownSec: 300,
      requiresConfirmation: false,
      icon: 'time-outline',
    });
  }


  if (conn?.level === 'no_service' && (ctx.environment.remoteness as any)?.score >= 70) {
    rules.push({
      id: 'offline-remote',
      trigger: 'No service in remote terrain',
      mode: 'auto_open',
      surface: 'offline_cache',
      title: 'OFFLINE READINESS',
      message: 'No service in remote terrain. Open offline cache and verify local coverage.',
      priority: 2,
      cooldownSec: 300,
      requiresConfirmation: false,
      icon: 'cloud-offline-outline',
    });
  }

  if (routeContext?.bailoutAvailable === false && parts.status !== 'green') {
    rules.push({
      id: 'route-commitment',
      trigger: 'No bailout available',
      mode: 'suggest_only',
      surface: 'intel',
      title: 'ROUTE COMMITMENT',
      message: 'Route commitment is increasing with limited exit options. Review intel before proceeding.',
      priority: 2,
      cooldownSec: 240,
      requiresConfirmation: false,
      icon: 'exit-outline',
    });
  }

  if (campDecision?.available) {
    if (
      campDecision.campRecommendationType === 'stop_now' ||
      campDecision.campRecommendationType === 'do_not_pass_current_high_confidence_camp'
    ) {
      rules.push({
        id: 'camp-stop-now',
        trigger: 'Camp stop recommended',
        mode: 'suggest_only',
        surface: 'intel',
        title: 'OVERNIGHT STOP',
        message: campDecision.recommendedAction,
        priority: 1,
        cooldownSec: 240,
        requiresConfirmation: false,
        icon: 'bed-outline',
      });
    } else if (campDecision.campRecommendationType === 'use_emergency_overnight_option') {
      rules.push({
        id: 'camp-emergency',
        trigger: 'Emergency overnight option',
        mode: 'suggest_only',
        surface: 'intel',
        title: 'EMERGENCY OVERNIGHT',
        message: campDecision.recommendedAction,
        priority: 1,
        cooldownSec: 240,
        requiresConfirmation: false,
        icon: 'moon-outline',
      });
    } else if (campDecision.campRecommendationType === 'reassess_soon' || campDecision.campRecommendationType === 'low_confidence_ahead') {
      rules.push({
        id: 'camp-reassess',
        trigger: 'Camp reassessment',
        mode: 'suggest_only',
        surface: 'intel',
        title: 'CAMP REASSESS',
        message: campDecision.recommendedAction,
        priority: 2,
        cooldownSec: 300,
        requiresConfirmation: false,
        icon: 'time-outline',
      });
    }
  }

  const ordered = [...rules].sort((a, b) => a.priority - b.priority || a.title.localeCompare(b.title));
  const primaryRule = ordered[0] ?? null;

  return {
    enabled: ordered.length > 0,
    summary: primaryRule ? `${primaryRule.title} • ${primaryRule.message}` : null,
    mode: primaryRule?.mode ?? 'suggest_only',
    primaryRule,
    rules: ordered,
    suggestedSurface: primaryRule?.surface ?? 'none',
    requiresConfirmation: primaryRule?.requiresConfirmation ?? false,
    eventKey: primaryRule ? `${primaryRule.id}:${primaryRule.surface}:${primaryRule.mode}` : null,
  };
}
