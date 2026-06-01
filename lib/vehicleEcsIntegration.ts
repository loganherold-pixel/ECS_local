import { briefCadLogStore } from './briefCadLogStore';
import {
  getActiveVehicleState,
  type ECSVehicularState,
} from './fleet/activeVehicleState';

export const VEHICLE_ADVISORY_SUPPRESSION_MS = 15 * 60 * 1000;

export type VehicleSuitabilityLevel = 'strong' | 'workable' | 'caution' | 'limited' | 'unknown';

export type VehicleAccessDemand =
  | 'easy'
  | 'moderate'
  | 'high_clearance'
  | 'technical'
  | 'unknown'
  | string
  | null
  | undefined;

export type VehicleSuitabilityInput = {
  activeVehicleState?: ECSVehicularState | null;
  accessDemand?: VehicleAccessDemand;
  routeDistanceMiles?: number | null;
  remotenessScore?: number | null;
};

export type VehicleSuitabilityResult = {
  level: VehicleSuitabilityLevel;
  score: number;
  label: string;
  reasons: string[];
  concerns: string[];
  confidenceLabel: ECSVehicularState['confidence']['label'];
  confidenceCopy: string;
};

export type VehicleSystemAdvisoryKind =
  | 'no_vehicle_profile'
  | 'vehicle_profile_incomplete'
  | 'payload_over_gvwr'
  | 'payload_margin_tight'
  | 'center_of_gravity_watch';

export type VehicleSystemAdvisory = {
  kind: VehicleSystemAdvisoryKind;
  severity: 'info' | 'watch' | 'warning';
  title: string;
  message: string;
  recommendedAction: string;
  sourceLine: string;
  confidence: number;
  vehicleKey: string;
};

const recentVehicleAdvisories = new Map<string, { at: number; severity: VehicleSystemAdvisory['severity'] }>();

function unique(values: Array<string | null | undefined>, max = 4): string[] {
  const seen = new Set<string>();
  const output: string[] = [];
  values.forEach((value) => {
    const clean = String(value ?? '').replace(/\s+/g, ' ').trim();
    if (!clean) return;
    const key = clean.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    output.push(clean);
  });
  return output.slice(0, max);
}

function severityRank(severity: VehicleSystemAdvisory['severity']): number {
  switch (severity) {
    case 'warning':
      return 3;
    case 'watch':
      return 2;
    case 'info':
    default:
      return 1;
  }
}

function confidenceValue(label: ECSVehicularState['confidence']['label']): number {
  switch (label) {
    case 'verified':
      return 0.98;
    case 'high':
      return 0.86;
    case 'medium':
      return 0.68;
    case 'low':
      return 0.42;
    case 'unverified':
    default:
      return 0.2;
  }
}

function normalizeDemand(value: VehicleAccessDemand): 'easy' | 'moderate' | 'high_clearance' | 'technical' | 'unknown' {
  const text = String(value ?? '').toLowerCase().trim();
  if (!text) return 'unknown';
  if (text.includes('technical') || text.includes('difficult')) return 'technical';
  if (text.includes('high') || text.includes('clearance')) return 'high_clearance';
  if (text.includes('moderate')) return 'moderate';
  if (text.includes('easy') || text.includes('paved')) return 'easy';
  return 'unknown';
}

function labelForLevel(level: VehicleSuitabilityLevel): string {
  switch (level) {
    case 'strong':
      return 'Strong vehicle fit';
    case 'workable':
      return 'Workable vehicle fit';
    case 'caution':
      return 'Vehicle fit caution';
    case 'limited':
      return 'Limited vehicle fit';
    case 'unknown':
    default:
      return 'Vehicle fit unknown';
  }
}

export function getActiveVehicleSnapshotForEcs(): ECSVehicularState {
  return getActiveVehicleState();
}

export function scoreVehicleSuitabilityForEcs(input: VehicleSuitabilityInput = {}): VehicleSuitabilityResult {
  const state = input.activeVehicleState ?? getActiveVehicleSnapshotForEcs();
  const demand = normalizeDemand(input.accessDemand);
  const reasons: string[] = [];
  const concerns: string[] = [];

  if (state.status === 'no_active_vehicle' || state.status === 'missing_vehicle') {
    return {
      level: 'unknown',
      score: 52,
      label: labelForLevel('unknown'),
      reasons: ['No active vehicle profile is configured.'],
      concerns: ['Vehicle suitability is not available yet.'],
      confidenceLabel: 'unverified',
      confidenceCopy: 'Add a vehicle profile to improve ECS route, camp, and recovery suitability.',
    };
  }

  let score = 78;
  const classification = state.intelligence.classification;
  reasons.push(`${classification.label} profile active`);

  if (state.weight.payloadUsedPct != null) {
    if (state.weight.payloadUsedPct >= 100) {
      score -= 36;
      concerns.push('Operating weight estimate is above GVWR.');
    } else if (state.weight.payloadUsedPct >= 85) {
      score -= 18;
      concerns.push('Payload margin is tight.');
    } else {
      reasons.push('Payload margin is available.');
    }
  } else {
    score -= 8;
    concerns.push('Payload usage is not available.');
  }

  if (state.centerOfGravity.riskLevel === 'critical') {
    score -= 26;
    concerns.push('Center-of-gravity risk is critical.');
  } else if (state.centerOfGravity.riskLevel === 'caution') {
    score -= 14;
    concerns.push('Center-of-gravity risk needs review.');
  } else if (state.centerOfGravity.riskLevel === 'watch') {
    score -= 6;
    concerns.push('Center-of-gravity risk is estimated.');
  }

  if (demand === 'technical') {
    if (classification.traits.trailManeuverability === 'wide_or_long') {
      score -= 18;
      concerns.push('Long or wide vehicle class may limit technical access.');
    }
    if (classification.traits.clearanceBias === 'low' || classification.traits.clearanceBias === 'unknown') {
      score -= 16;
      concerns.push('Technical access needs verified clearance.');
    }
  } else if (demand === 'high_clearance') {
    if (classification.traits.clearanceBias === 'low' || classification.traits.clearanceBias === 'unknown') {
      score -= 14;
      concerns.push('High-clearance access needs verified clearance.');
    } else {
      reasons.push('Clearance profile supports higher-clearance access.');
    }
  }

  if (classification.classId === 'compact_suv_crossover' && (demand === 'high_clearance' || demand === 'technical')) {
    score -= 14;
    concerns.push('Compact/crossover profile should verify rough-route clearance and tire margin.');
  }

  if (state.confidence.label === 'low' || state.confidence.label === 'unverified' || state.status === 'incomplete') {
    score -= 10;
    concerns.push('Vehicle data is incomplete or low confidence.');
  }

  const routeDistance = typeof input.routeDistanceMiles === 'number' ? input.routeDistanceMiles : null;
  const remoteness = typeof input.remotenessScore === 'number' ? input.remotenessScore : null;
  if (routeDistance != null && routeDistance >= 120 && state.capability.fuelTankCapacityGal == null) {
    score -= 8;
    concerns.push('Longer route lacks verified fuel capacity.');
  }
  if (remoteness != null && remoteness >= 75 && state.confidence.label !== 'verified' && state.confidence.label !== 'high') {
    score -= 8;
    concerns.push('Remote context increases the need to verify vehicle data.');
  }

  const clampedScore = Math.max(0, Math.min(100, Math.round(score)));
  const level: VehicleSuitabilityLevel =
    clampedScore >= 85
      ? 'strong'
      : clampedScore >= 70
        ? 'workable'
        : clampedScore >= 50
          ? 'caution'
          : clampedScore > 0
            ? 'limited'
            : 'unknown';

  return {
    level,
    score: clampedScore,
    label: labelForLevel(level),
    reasons: unique(reasons),
    concerns: unique(concerns),
    confidenceLabel: state.confidence.label,
    confidenceCopy: state.weight.confidenceCopy,
  };
}

export function buildVehicleSystemAdvisories(
  state: ECSVehicularState = getActiveVehicleSnapshotForEcs(),
): VehicleSystemAdvisory[] {
  const vehicleKey = state.identity.vehicleId ?? state.identity.activeVehicleId ?? 'no-active-vehicle';
  const sourceLine = `Source: Fleet · ${state.intelligence.classification.label} · ${state.confidence.label}`;
  const confidence = confidenceValue(state.confidence.label);
  const advisories: VehicleSystemAdvisory[] = [];

  if (state.status === 'no_active_vehicle' || state.status === 'missing_vehicle') {
    advisories.push({
      kind: 'no_vehicle_profile',
      severity: 'info',
      title: 'VEHICLE PROFILE',
      message: 'No active vehicle profile is available for ECS suitability.',
      recommendedAction: 'Select or create a Fleet vehicle when route, camp, or recovery fit matters.',
      sourceLine,
      confidence,
      vehicleKey,
    });
    return advisories;
  }

  if (state.status === 'incomplete' || state.weight.isPartial) {
    advisories.push({
      kind: 'vehicle_profile_incomplete',
      severity: 'info',
      title: 'VEHICLE DATA',
      message: 'Vehicle data is incomplete; ECS is using conservative estimates.',
      recommendedAction: 'Verify GVWR, curb weight, tire size, clearance, and loadout weight.',
      sourceLine,
      confidence,
      vehicleKey,
    });
  }

  if ((state.weight.payloadUsedPct ?? 0) >= 100 || state.weight.gvwrOverageRisk === 'critical') {
    advisories.push({
      kind: 'payload_over_gvwr',
      severity: 'warning',
      title: 'PAYLOAD ADVISORY',
      message: 'Operating weight estimate is at or above GVWR.',
      recommendedAction: 'Reduce load or verify the estimate before relying on vehicle-fit recommendations.',
      sourceLine,
      confidence,
      vehicleKey,
    });
  } else if ((state.weight.payloadUsedPct ?? 0) >= 85) {
    advisories.push({
      kind: 'payload_margin_tight',
      severity: 'watch',
      title: 'PAYLOAD WATCH',
      message: 'Payload margin is tight for the active vehicle.',
      recommendedAction: 'Keep optional cargo low and centered; verify with a scale ticket when possible.',
      sourceLine,
      confidence,
      vehicleKey,
    });
  }

  if (state.centerOfGravity.riskLevel === 'caution' || state.centerOfGravity.riskLevel === 'critical') {
    advisories.push({
      kind: 'center_of_gravity_watch',
      severity: state.centerOfGravity.riskLevel === 'critical' ? 'warning' : 'watch',
      title: 'LOAD BALANCE',
      message: 'Vehicle load balance may affect handling.',
      recommendedAction: 'Review roof, rear, hitch, and front-low load distribution.',
      sourceLine,
      confidence,
      vehicleKey,
    });
  }

  return advisories;
}

function shouldSuppressVehicleAdvisory(advisory: VehicleSystemAdvisory, now: number): boolean {
  const key = `${advisory.kind}:${advisory.vehicleKey}`;
  const previous = recentVehicleAdvisories.get(key);
  if (!previous) return false;
  if (now - previous.at >= VEHICLE_ADVISORY_SUPPRESSION_MS) return false;
  return severityRank(advisory.severity) <= severityRank(previous.severity);
}

function rememberVehicleAdvisory(advisory: VehicleSystemAdvisory, now: number): void {
  recentVehicleAdvisories.set(`${advisory.kind}:${advisory.vehicleKey}`, {
    at: now,
    severity: advisory.severity,
  });
}

export function publishVehicleSystemAdvisories(options?: {
  state?: ECSVehicularState | null;
  now?: number;
}): VehicleSystemAdvisory[] {
  const now = options?.now ?? Date.now();
  const state = options?.state ?? getActiveVehicleSnapshotForEcs();
  const accepted: VehicleSystemAdvisory[] = [];

  for (const advisory of buildVehicleSystemAdvisories(state)) {
    if (shouldSuppressVehicleAdvisory(advisory, now)) continue;
    rememberVehicleAdvisory(advisory, now);
    accepted.push(advisory);
    briefCadLogStore.recordUpdate({
      id: `vehicle:${advisory.kind}:${advisory.vehicleKey}`,
      text: `${advisory.message} ${advisory.sourceLine}`,
      mode: advisory.severity === 'warning' ? 'alert' : 'advisory',
      priority: advisory.severity === 'warning' ? 2 : advisory.severity === 'watch' ? 3 : 4,
      queuedAt: now,
      title: advisory.title,
      recommendedAction: advisory.recommendedAction,
      source: 'ecs-vehicle',
      severity: advisory.severity === 'warning' ? 'warning' : advisory.severity === 'watch' ? 'watch' : 'info',
      eventType: advisory.kind,
      confidence: advisory.confidence,
    });
  }

  return accepted;
}

export function resetVehicleSystemAdvisoriesForTests(): void {
  recentVehicleAdvisories.clear();
}
