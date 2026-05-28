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

export type FleetCommandConcern = {
  id: string;
  summary: string;
  detail: string | null;
};

export type FleetCommandState = {
  readiness: FleetReadinessStatus;
  title: string;
  summary: string;
  detail: string | null;
  intelligenceItems: FleetCommandConcern[];
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
  hasAcknowledgedHighMountedLoadRisk?: boolean;
};

function cleanText(value: string | null | undefined): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}

function simplifyFleetConcern(value: string | null | undefined): string {
  const text = cleanText(value);
  const lower = text.toLowerCase();
  if (lower.includes('limited live inputs') && lower.includes('vehicle score')) {
    return 'Vehicle guidance is based on saved profile data, so confidence is limited';
  }
  if (lower.includes('vehicle score is estimated')) {
    return 'Vehicle score is estimated from saved Fleet inputs';
  }
  return text;
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

function sentenceCase(value: string): string {
  const clean = cleanText(value).replace(/\.$/, '');
  return clean ? clean.charAt(0).toUpperCase() + clean.slice(1) : '';
}

function isHighMountedLoadConcern(value: string | null | undefined): boolean {
  const normalized = cleanText(value).toLowerCase();
  return (
    normalized.includes('top-heavy') ||
    normalized.includes('top heavy') ||
    normalized.includes('center of gravity') ||
    normalized.includes('high-mounted') ||
    normalized.includes('high mounted')
  );
}

function buildConcernRecommendation(issue: string, options?: { highMountedLoadRiskAcknowledged?: boolean }): string {
  const normalized = issue.toLowerCase();
  if (isHighMountedLoadConcern(normalized)) {
    return 'Move heavy gear lower and closer to the center of the vehicle. Reduce roof or bed-high loads before technical terrain.';
  }
  if (normalized.includes('payload') || normalized.includes('gvwr')) {
    return 'Keep optional cargo low and centered, then verify operating weight against GVWR before departure.';
  }
  if (normalized.includes('accessory') || normalized.includes('cargo') || normalized.includes('loadout')) {
    if (options?.highMountedLoadRiskAcknowledged) {
      return 'Build & Loadout risk review is acknowledged. Verify scale weight for stronger recommendations before remote or technical routes.';
    }
    return 'Review Build & Loadout, remove unnecessary high-mounted weight, and verify scale weight for stronger recommendations.';
  }
  if (normalized.includes('fuel')) {
    return 'Enter fuel capacity or current fuel gallons in Advanced Specs so range and resource guidance can use your actual rig.';
  }
  if (normalized.includes('tire')) {
    return 'Confirm tire diameter in Advanced Specs so clearance, fit, and route-readiness guidance can be more specific.';
  }
  if (normalized.includes('vehicle profile')) {
    return 'Finish the active vehicle profile first; ECS needs a confirmed rig before it can personalize readiness.';
  }
  if (normalized.includes('identity')) {
    return 'Confirm year, make, model, or vehicle class so ECS can apply the right vehicle assumptions.';
  }
  if (normalized.includes('water')) {
    return 'Enter carried water capacity and current gallons if water range matters for this route or camp plan.';
  }
  if (normalized.includes('power')) {
    return 'Add usable battery capacity or connect a power source so ECS can estimate reserve and runtime.';
  }
  if (normalized.includes('lift')) {
    return 'Confirm lift, level, and tire setup in Advanced Specs to improve clearance and stability guidance.';
  }
  if (options?.highMountedLoadRiskAcknowledged) {
    return 'Build & Loadout risk review is acknowledged. Verify scale weight for stronger recommendations before remote or technical routes.';
  }
  return 'Verify the active vehicle setup, keep heavy items low and centered, and update any estimated values before harder routes.';
}

function buildPrimaryConcern(
  primary: ECSOrchestratorCandidate | null,
  options?: { highMountedLoadRiskAcknowledged?: boolean },
): string | null {
  if (!primary) return null;
  const text = simplifyFleetConcern(sentenceCase(primary.summary || primary.title));
  if (!text) return null;
  if (options?.highMountedLoadRiskAcknowledged && isHighMountedLoadConcern(text)) {
    return null;
  }
  const priority = primary.priority?.level;
  const lower = text.toLowerCase();
  const looksFleetRelevant =
    isHighMountedLoadConcern(lower) ||
    lower.includes('payload') ||
    lower.includes('gvwr') ||
    lower.includes('accessory') ||
    lower.includes('cargo') ||
    lower.includes('loadout') ||
    lower.includes('weight') ||
    lower.includes('fuel') ||
    lower.includes('tire') ||
    lower.includes('vehicle');
  if (looksFleetRelevant || priority === 'warning' || priority === 'critical') {
    return text;
  }
  return null;
}

function buildFleetIntelligenceCopy(args: {
  readiness: FleetReadinessStatus;
  missingCritical: string[];
  limitations: string[];
  primary: ECSOrchestratorCandidate | null;
  selectionRequired: boolean;
  highMountedLoadRiskAcknowledged?: boolean;
}): { summary: string; detail: string | null } {
  if (args.selectionRequired) {
    return {
      summary: 'Key concern: ECS needs one active rig selected before it can personalize this readiness command.',
      detail: 'Recommendation: select the vehicle you are staging now, then review profile, fuel, tires, and loadout guidance.',
    };
  }

  const primaryConcern = buildPrimaryConcern(args.primary, {
    highMountedLoadRiskAcknowledged: args.highMountedLoadRiskAcknowledged,
  });
  const issue = simplifyFleetConcern(args.missingCritical[0] ?? args.limitations[0] ?? primaryConcern ?? '');

  if (issue) {
    const isMissingCritical = args.missingCritical.map((item) => simplifyFleetConcern(item)).includes(issue);
    const concern = isMissingCritical
      ? `${sentenceCase(issue)} is still missing from the active vehicle setup`
      : sentenceCase(issue);
    return {
      summary: `Key concern: ${concern}.`,
      detail: `Recommendation: ${buildConcernRecommendation(issue, {
        highMountedLoadRiskAcknowledged: args.highMountedLoadRiskAcknowledged,
      })}`,
    };
  }

  if (args.readiness === 'ready_for_staging' || args.readiness === 'vehicle_ready') {
    if (args.highMountedLoadRiskAcknowledged) {
      return {
        summary: 'Vehicle configuration looks fit for most routine staging checks.',
        detail: 'Recommendation: build and loadout risk review is acknowledged. Verify scale weight before remote or technical routes.',
      };
    }
    return {
      summary: 'Vehicle configuration looks fit for most routine staging checks.',
      detail: 'Recommendation: keep heavy cargo low and centered, and verify scale weight before remote or technical routes.',
    };
  }

  return {
    summary: 'Vehicle setup is usable, but ECS is still relying on some estimated Fleet values.',
    detail: 'Recommendation: confirm fuel, tires, payload, and loadout values to make guidance more specific to this rig.',
  };
}

function concernIdFromIssue(issue: string, index: number): string {
  const id = cleanText(issue)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return id || `concern-${index}`;
}

function buildFleetConcernItem(
  issue: string,
  missingCritical: string[],
  index: number,
  options?: { highMountedLoadRiskAcknowledged?: boolean },
): FleetCommandConcern {
  const simplifiedIssue = simplifyFleetConcern(issue);
  const isMissingCritical = missingCritical.map((item) => simplifyFleetConcern(item)).includes(simplifiedIssue);
  const concern = isMissingCritical
    ? `${sentenceCase(simplifiedIssue)} is still missing from the active vehicle setup`
    : sentenceCase(simplifiedIssue);
  return {
    id: concernIdFromIssue(simplifiedIssue, index),
    summary: `Key concern: ${concern}.`,
    detail: `Recommendation: ${buildConcernRecommendation(simplifiedIssue, {
      highMountedLoadRiskAcknowledged: options?.highMountedLoadRiskAcknowledged,
    })}`,
  };
}

function buildFleetIntelligenceItems(args: {
  readiness: FleetReadinessStatus;
  missingCritical: string[];
  limitations: string[];
  primary: ECSOrchestratorCandidate | null;
  selectionRequired: boolean;
  highMountedLoadRiskAcknowledged?: boolean;
}): FleetCommandConcern[] {
  if (args.selectionRequired) {
    return [{
      id: 'select-active-rig',
      summary: 'Key concern: ECS needs one active rig selected before it can personalize this readiness command.',
      detail: 'Recommendation: select the vehicle you are staging now, then review profile, fuel, tires, and loadout guidance.',
    }];
  }

  const primaryConcern = buildPrimaryConcern(args.primary, {
    highMountedLoadRiskAcknowledged: args.highMountedLoadRiskAcknowledged,
  });
  const seen = new Set<string>();
  const issues = [...args.missingCritical, ...args.limitations, primaryConcern]
    .map((item) => simplifyFleetConcern(item))
    .filter((item) => {
      if (!item) return false;
      const key = item.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

  const concernItems = issues.map((issue, index) =>
    buildFleetConcernItem(issue, args.missingCritical, index, {
      highMountedLoadRiskAcknowledged: args.highMountedLoadRiskAcknowledged,
    }),
  );

  if (concernItems.length > 0) {
    concernItems.push({
      id: 'reviewed-current-concerns',
      summary: 'Current Fleet concerns reviewed. Vehicle setup is ready based on the preferences and values entered so far.',
      detail: 'For additional concerns, see the ECS Brief.',
    });
    return concernItems;
  }

  if (args.readiness === 'ready_for_staging' || args.readiness === 'vehicle_ready') {
    if (args.highMountedLoadRiskAcknowledged) {
      return [{
        id: 'vehicle-ready-baseline',
        summary: 'Vehicle configuration looks fit for most routine staging checks.',
        detail: 'Recommendation: build and loadout risk review is acknowledged. Verify scale weight before remote or technical routes.',
      }];
    }
    return [{
      id: 'vehicle-ready-baseline',
      summary: 'Vehicle configuration looks fit for most routine staging checks.',
      detail: 'Recommendation: keep heavy cargo low and centered, and verify scale weight before remote or technical routes.',
    }];
  }

  return [{
    id: 'estimated-fleet-values',
    summary: 'Vehicle setup is usable, but ECS is still relying on some estimated Fleet values.',
    detail: 'Recommendation: confirm fuel, tires, payload, and loadout values to make guidance more specific to this rig.',
  }];
}

export function selectFleetCommandState(
  args: SelectFleetCommandStateArgs,
): FleetCommandState {
  const missingCritical = buildMissingCritical(args);
  const limitations = buildLimitations(args);
  const highMountedLoadRiskAcknowledged = Boolean(args.hasAcknowledgedHighMountedLoadRisk);
  const rawPrimary = args.fleetView.primary ?? null;
  const primary =
    highMountedLoadRiskAcknowledged && isHighMountedLoadConcern(rawPrimary?.summary || rawPrimary?.title)
      ? null
      : rawPrimary;
  const secondary = highMountedLoadRiskAcknowledged
    ? args.fleetView.secondary.filter((candidate) => !isHighMountedLoadConcern(candidate.summary || candidate.title))
    : args.fleetView.secondary;
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
    priorityLevel: primary?.priority?.level,
    degradedState: args.operationalState ?? undefined,
  });

  const phaseLabel =
    cleanText(args.expeditionPhaseLabel) ||
    (args.expeditionPhase ? toTitle(args.expeditionPhase) : null);
  const operationalLabel =
    args.operationalState && args.operationalState !== 'fully_operational'
      ? toTitle(args.operationalState)
      : null;

  const readinessStatus = args.liveStatus?.readiness ?? null;
  const telemetryStatus = args.liveStatus?.telemetry ?? null;
  const title = labelForReadiness(readiness);
  const selectionRequired = args.vehicleCount > 1 && !args.hasActiveVehicle;
  const intelligenceItems = buildFleetIntelligenceItems({
    readiness,
    missingCritical,
    limitations,
    primary,
    selectionRequired,
    highMountedLoadRiskAcknowledged,
  });
  const intelligenceCopy = intelligenceItems[0] ?? buildFleetIntelligenceCopy({
    readiness,
    missingCritical,
    limitations,
    primary,
    selectionRequired,
    highMountedLoadRiskAcknowledged,
  });
  const summary = intelligenceCopy.summary || buildReadinessSummary(readiness, missingCritical, limitations);
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
    detail: intelligenceCopy.detail ?? explanation?.text ?? (cleanText(primary?.summary) || null),
    intelligenceItems,
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
