import { evaluateECSConfidence } from '../ai/confidenceEngine';
import type { ECSConfidenceResult } from '../ai/confidenceTypes';
import type { ECSOperationalState } from '../ai/degradedOperationsTypes';
import type { ECSExpeditionPhase } from '../ai/expeditionPhaseTypes';
import { explainRecommendation } from '../ai/recommendationExplanationEngine';
import type { ECSOrchestratorTargetView } from '../ai/orchestratorSelectors';
import type { ECSOrchestratorCandidate } from '../ai/orchestratorTypes';
import type { ECSLiveStatusMap } from '../status/liveStatusTypes';

export type FleetReadinessStatus =
  | 'not_configured'
  | 'partially_configured'
  | 'ready_for_staging'
  | 'vehicle_ready'
  | 'ready_with_limitations';

export type FleetCommandBadgeTone = 'primary' | 'warning' | 'muted';

export type FleetCommandBadge = {
  id: string;
  label: string;
  tone: FleetCommandBadgeTone;
};

export type FleetCommandState = {
  readiness: FleetReadinessStatus;
  title: string;
  summary: string;
  detail: string | null;
  confidence: ECSConfidenceResult;
  phaseLabel: string | null;
  operationalLabel: string | null;
  primary: ECSOrchestratorCandidate | null;
  secondary: ECSOrchestratorCandidate[];
  badges: FleetCommandBadge[];
  missingCritical: string[];
  limitations: string[];
  helperText: string;
  subhelperText: string | null;
  selectionRequired: boolean;
  canConfirmVehicleReady: boolean;
};

type SelectFleetCommandStateArgs = {
  fleetView: ECSOrchestratorTargetView;
  expeditionPhase: ECSExpeditionPhase | null | undefined;
  expeditionPhaseLabel: string | null | undefined;
  operationalState: ECSOperationalState | null | undefined;
  operationalSummary: string | null | undefined;
  liveStatus: ECSLiveStatusMap | null | undefined;
  isOnline: boolean;
  vehicleCount: number;
  hasActiveVehicle: boolean;
  hasSelectedVehicle: boolean;
  hasVehicleProfile: boolean;
  hasConfiguredIdentity: boolean;
  hasFuelCapacity: boolean;
  hasWaterCapacity: boolean;
  hasPowerStorage: boolean;
  hasTireSize: boolean;
  hasLiftProfile: boolean;
  hasAccessoriesConfigured: boolean;
  hasLoadout: boolean;
  hasLiveTelemetry: boolean;
};

function cleanText(value: string | null | undefined): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}

function toTitle(value: string): string {
  return value
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function buildMissingCritical(args: SelectFleetCommandStateArgs): string[] {
  const items: string[] = [];
  if (!args.hasSelectedVehicle || !args.hasVehicleProfile) items.push('vehicle profile');
  if (!args.hasConfiguredIdentity) items.push('configured vehicle identity');
  if (!args.hasFuelCapacity) items.push('fuel capacity');
  if (!args.hasTireSize) items.push('tire size');
  return items;
}

function buildLimitations(args: SelectFleetCommandStateArgs): string[] {
  const items: string[] = [];
  if (!args.hasWaterCapacity) items.push('water capacity is still estimated');
  if (!args.hasPowerStorage) items.push('power storage baseline is still estimated');
  if (!args.hasLiftProfile) items.push('lift profile is still estimated');
  if (!args.hasAccessoriesConfigured) items.push('accessory systems are not configured');
  if (!args.hasLoadout) items.push('loadout readiness is still incomplete');
  return items;
}

function buildReadinessStatus(args: {
  vehicleCount: number;
  missingCritical: string[];
  limitations: string[];
  expeditionPhase: ECSExpeditionPhase | null | undefined;
}): FleetReadinessStatus {
  if (args.vehicleCount === 0 || args.missingCritical.length >= 3) return 'not_configured';
  if (args.missingCritical.length > 0) return 'partially_configured';
  if (
    args.expeditionPhase === 'vehicle_setup' ||
    args.expeditionPhase === 'staging'
  ) {
    return args.limitations.length > 0 ? 'ready_with_limitations' : 'ready_for_staging';
  }
  return args.limitations.length > 0 ? 'ready_with_limitations' : 'vehicle_ready';
}

function badgeToneForReadiness(status: FleetReadinessStatus): FleetCommandBadgeTone {
  switch (status) {
    case 'vehicle_ready':
    case 'ready_for_staging':
      return 'primary';
    case 'ready_with_limitations':
    case 'partially_configured':
      return 'warning';
    default:
      return 'muted';
  }
}

function labelForReadiness(status: FleetReadinessStatus): string {
  switch (status) {
    case 'not_configured':
      return 'Not configured';
    case 'partially_configured':
      return 'Partially configured';
    case 'ready_for_staging':
      return 'Ready for staging';
    case 'ready_with_limitations':
      return 'Ready with limitations';
    case 'vehicle_ready':
    default:
      return 'Vehicle ready';
  }
}

function buildReadinessSummary(status: FleetReadinessStatus, missingCritical: string[], limitations: string[]): string {
  if (status === 'not_configured') {
    return 'Complete the baseline vehicle profile before ECS can trust readiness decisions.';
  }
  if (status === 'partially_configured') {
    return `Readiness is reduced because ${missingCritical.slice(0, 2).join(' and ')} ${
      missingCritical.length > 1 ? 'are' : 'is'
    } still missing.`;
  }
  if (status === 'ready_with_limitations') {
    const limitation = limitations[0] ?? 'resource data is still estimated';
    return `Vehicle ready with limitations due to ${limitation}.`;
  }
  if (status === 'ready_for_staging') {
    return 'Ready for staging with complete vehicle and resource baseline.';
  }
  return 'Vehicle ready with confirmed baseline data for staging and downstream assessment.';
}

export function selectFleetCommandState(
  args: SelectFleetCommandStateArgs,
): FleetCommandState {
  const missingCritical = buildMissingCritical(args);
  const limitations = buildLimitations(args);
  const readiness = buildReadinessStatus({
    vehicleCount: args.vehicleCount,
    missingCritical,
    limitations,
    expeditionPhase: args.expeditionPhase,
  });

  const confidence = evaluateECSConfidence({
    domain: 'vehicle_assessment',
    offline: !args.isOnline,
    degraded:
      args.operationalState === 'degraded' ||
      args.operationalState === 'limited' ||
      args.operationalState === 'unavailable',
    capLevel: args.hasLiveTelemetry ? undefined : 'moderate',
    sources: [
      {
        id: 'vehicle_profile',
        origin: 'manual',
        available: args.hasVehicleProfile,
        required: true,
        freshness: 'fresh',
        priority: 'critical',
      },
      {
        id: 'vehicle_identity',
        origin: 'manual',
        available: args.hasConfiguredIdentity,
        required: true,
        freshness: 'fresh',
        priority: 'high',
      },
      {
        id: 'fuel_capacity',
        origin: 'manual',
        available: args.hasFuelCapacity,
        required: true,
        freshness: 'fresh',
        priority: 'critical',
      },
      {
        id: 'tire_size',
        origin: 'manual',
        available: args.hasTireSize,
        required: true,
        freshness: 'fresh',
        priority: 'high',
      },
      {
        id: 'lift_profile',
        origin: 'manual',
        available: args.hasLiftProfile,
        required: false,
        freshness: 'fresh',
        priority: 'normal',
      },
      {
        id: 'water_capacity',
        origin: 'manual',
        available: args.hasWaterCapacity,
        required: false,
        freshness: 'fresh',
        priority: 'normal',
      },
      {
        id: 'power_storage',
        origin: 'manual',
        available: args.hasPowerStorage,
        required: false,
        freshness: 'fresh',
        priority: 'normal',
      },
      {
        id: 'accessories',
        origin: 'manual',
        available: args.hasAccessoriesConfigured,
        required: false,
        freshness: 'fresh',
        priority: 'low',
      },
      {
        id: 'loadout',
        origin: 'manual',
        available: args.hasLoadout,
        required: false,
        freshness: 'fresh',
        priority: 'low',
      },
      {
        id: 'live_telemetry',
        origin: 'live',
        available: args.hasLiveTelemetry,
        required: false,
        freshness: args.hasLiveTelemetry ? 'fresh' : 'unknown',
        priority: 'high',
      },
    ],
  });

  const explanationDrivers =
    missingCritical.length > 0
      ? missingCritical.map((item) =>
          item === 'fuel capacity'
            ? 'missing fuel specs'
            : item === 'tire size'
              ? 'tire size is estimated'
              : `${item} incomplete`,
        )
      : limitations.length > 0
        ? limitations
        : [
            'complete vehicle profile',
            'confirmed fuel capacity',
            args.hasLoadout ? 'loadout readiness' : 'resource baseline',
          ];

  const explanation = explainRecommendation({
    type: 'vehicle_assessment',
    drivers: explanationDrivers,
    confidenceLevel: confidence.level,
    priorityLevel: args.fleetView.primary?.priority?.level,
    degradedState: args.operationalState ?? undefined,
  });

  const phaseLabel =
    cleanText(args.expeditionPhaseLabel) ||
    (args.expeditionPhase ? toTitle(args.expeditionPhase) : null);
  const operationalLabel =
    args.operationalState && args.operationalState !== 'fully_operational'
      ? toTitle(args.operationalState)
      : null;

  const primary = args.fleetView.primary ?? null;
  const secondary = args.fleetView.secondary ?? [];
  const readinessStatus = args.liveStatus?.readiness ?? null;
  const telemetryStatus = args.liveStatus?.telemetry ?? null;
  const title = labelForReadiness(readiness);
  const summary = buildReadinessSummary(readiness, missingCritical, limitations);
  const selectionRequired = args.vehicleCount > 1 && !args.hasActiveVehicle;
  const canConfirmVehicleReady =
    args.vehicleCount > 0 &&
    args.hasSelectedVehicle &&
    !selectionRequired &&
    (readiness === 'ready_for_staging' ||
      readiness === 'vehicle_ready' ||
      readiness === 'ready_with_limitations');

  const helperText = selectionRequired
    ? 'Select an active rig before confirming readiness.'
    : readinessStatus?.shortReason ?? summary;
  const subhelperText = missingCritical.length > 0
    ? `Next fix: ${missingCritical.slice(0, 2).join(' and ')}.`
    : limitations.length > 0
      ? limitations[0] ?? null
      : telemetryStatus?.shortReason || cleanText(primary?.summary) || cleanText(args.operationalSummary) || null;

  const badges: FleetCommandBadge[] = [
    {
      id: 'readiness',
      label: title,
      tone: badgeToneForReadiness(readiness),
    },
    {
      id: 'confidence',
      label: confidence.label,
      tone:
        confidence.level === 'high'
          ? 'primary'
          : confidence.level === 'moderate'
            ? 'muted'
            : 'warning',
    },
  ];
  if (readinessStatus?.label) {
    badges.push({
      id: 'readiness_status',
      label: readinessStatus.label,
      tone:
        readinessStatus.status === 'live'
          ? 'primary'
          : readinessStatus.status === 'degraded' || readinessStatus.status === 'unavailable'
            ? 'warning'
            : 'muted',
    });
  }
  if (telemetryStatus?.label) {
    badges.push({
      id: 'telemetry_status',
      label: telemetryStatus.label,
      tone:
        telemetryStatus.status === 'live'
          ? 'primary'
          : telemetryStatus.status === 'degraded' || telemetryStatus.status === 'unavailable'
            ? 'warning'
            : 'muted',
    });
  }

  if (operationalLabel) {
    badges.push({
      id: 'operations',
      label: operationalLabel,
      tone:
        args.operationalState === 'offline_capable'
          ? 'muted'
          : args.operationalState === 'degraded' || args.operationalState === 'limited'
            ? 'warning'
            : 'muted',
    });
  }

  if (primary?.priority?.title) {
    badges.push({
      id: 'priority',
      label: cleanText(primary.priority.title),
      tone:
        primary.priority.level === 'warning' || primary.priority.level === 'critical'
          ? 'warning'
          : 'muted',
    });
  }

  return {
    readiness,
    title,
    summary,
    detail: explanation?.text ?? (cleanText(primary?.summary) || null),
    confidence,
    phaseLabel,
    operationalLabel,
    primary,
    secondary,
    badges,
    missingCritical,
    limitations,
    helperText,
    subhelperText,
    selectionRequired,
    canConfirmVehicleReady,
  };
}

export default selectFleetCommandState;
