import type { ECSAIAdvisory, ECSAIAdvisoryContext, ECSAISeverity, ECSAISourceTruth } from './ecsAITypes';
import { conciseECSAIMessage, sanitizeECSAICopy } from './ecsAICopy';
import { clampECSAIConfidence, combineECSAITruth } from './ecsAITruth';

function severityRank(severity: ECSAISeverity): number {
  switch (severity) {
    case 'critical':
      return 5;
    case 'high':
      return 4;
    case 'moderate':
      return 3;
    case 'low':
      return 2;
    case 'info':
    default:
      return 1;
  }
}

function advisory(args: {
  id: string;
  title: string;
  message: string;
  detail?: string;
  severity: ECSAISeverity;
  confidence: number;
  sourceTruth: ECSAISourceTruth[];
  sourceTypes: string[];
  suppressKey: string;
  createdAt: string;
  expiresAt?: string;
  actions?: ECSAIAdvisory['actions'];
}): ECSAIAdvisory {
  return {
    id: args.id,
    title: sanitizeECSAICopy(args.title),
    message: conciseECSAIMessage(args.message),
    detail: args.detail ? sanitizeECSAICopy(args.detail) : undefined,
    severity: args.severity,
    confidence: clampECSAIConfidence(args.confidence),
    sourceTruth: Array.from(new Set(args.sourceTruth)),
    sourceTypes: Array.from(new Set(args.sourceTypes.filter(Boolean))),
    suppressKey: args.suppressKey,
    createdAt: args.createdAt,
    expiresAt: args.expiresAt,
    actions: args.actions,
  };
}

function sortAdvisories(items: ECSAIAdvisory[]): ECSAIAdvisory[] {
  return [...items].sort((a, b) => {
    const severityDelta = severityRank(b.severity) - severityRank(a.severity);
    if (severityDelta !== 0) return severityDelta;
    return b.confidence - a.confidence;
  });
}

function isUnavailable(truth: ECSAISourceTruth): boolean {
  return truth === 'unavailable' || truth === 'simulated';
}

export function generateECSAIAdvisoriesFromContext(
  context: ECSAIAdvisoryContext,
  now: number = Date.now(),
): ECSAIAdvisory[] {
  const createdAt = new Date(now).toISOString();
  const items: ECSAIAdvisory[] = [];

  if (context.vehicleProfile.truth === 'unavailable') {
    items.push(advisory({
      id: `ecsai-fleet-profile-unavailable-${createdAt}`,
      title: 'ECS Recommendation',
      message: 'Vehicle profile data unavailable. ECS cannot assess weight, fit, or recovery posture yet.',
      severity: 'low',
      confidence: 70,
      sourceTruth: ['unavailable'],
      sourceTypes: ['fleet'],
      suppressKey: 'fleet.profile.unavailable',
      createdAt,
      actions: [{ label: 'Open Fleet', type: 'open_fleet' }],
    }));
  }

  if (context.vehicleWeight.value != null && context.vehicleWeight.truth !== 'live') {
    items.push(advisory({
      id: `ecsai-fleet-weight-estimated-${createdAt}`,
      title: 'ECS Intel',
      message: `Estimated vehicle weight is ${Math.round(context.vehicleWeight.value).toLocaleString()} lbs based on Fleet profile and loadout.`,
      detail: 'Confirm with verified specs or scale ticket before treating payload margin as source-backed.',
      severity: 'low',
      confidence: context.vehicleWeight.confidence ?? 55,
      sourceTruth: [context.vehicleWeight.truth],
      sourceTypes: ['fleet', 'loadout'],
      suppressKey: 'fleet.weight.estimated',
      createdAt,
      actions: [{ label: 'Open Fleet', type: 'open_fleet' }],
    }));
  }

  if (context.weather.truth === 'cached') {
    items.push(advisory({
      id: `ecsai-weather-cached-${createdAt}`,
      title: 'ECS Weather Intel',
      message: 'Using cached weather. ECS recommends reassessing conditions before route or camp decisions.',
      severity: context.navigation.truth === 'live' ? 'moderate' : 'low',
      confidence: context.weather.confidence ?? 55,
      sourceTruth: ['cached'],
      sourceTypes: ['weather'],
      suppressKey: 'weather.cached.route',
      createdAt,
      actions: [{ label: 'Open Weather', type: 'open_weather' }],
    }));
  } else if (context.weather.truth === 'unavailable' && context.navigation.truth === 'live') {
    items.push(advisory({
      id: `ecsai-weather-unavailable-${createdAt}`,
      title: 'ECS Weather Intel',
      message: 'Route weather unavailable. ECS cannot assess forecast exposure for this route yet.',
      severity: 'low',
      confidence: 68,
      sourceTruth: ['unavailable'],
      sourceTypes: ['weather', 'route'],
      suppressKey: 'weather.route.unavailable',
      createdAt,
      actions: [{ label: 'Open Weather', type: 'open_weather' }],
    }));
  }

  if (context.campCandidates.truth === 'estimated' && context.campCandidates.value != null) {
    items.push(advisory({
      id: `ecsai-campops-inferred-${createdAt}`,
      title: 'ECS-Inferred Camp Candidate',
      message: 'Camp suggestions are based on available route and source data. Confirm access, closure, and local rules before occupying.',
      severity: 'info',
      confidence: context.campCandidates.confidence ?? 55,
      sourceTruth: ['estimated'],
      sourceTypes: ['campops'],
      suppressKey: 'camp.legal.unverified',
      createdAt,
      actions: [{ label: 'Open CampOps', type: 'open_campops' }],
    }));
  }

  if (context.power.truth === 'manual') {
    items.push(advisory({
      id: `ecsai-power-manual-${createdAt}`,
      title: 'ECS Power Intel',
      message: 'Manual power estimate active. Update the power profile or connect a device for better runtime confidence.',
      severity: 'info',
      confidence: context.power.confidence ?? 55,
      sourceTruth: ['manual'],
      sourceTypes: ['power'],
      suppressKey: 'power.source.manual',
      createdAt,
      actions: [{ label: 'Open Power', type: 'open_power' }],
    }));
  } else if (isUnavailable(context.power.truth)) {
    items.push(advisory({
      id: `ecsai-power-unavailable-${createdAt}`,
      title: 'ECS Power Intel',
      message: 'Power telemetry unavailable. ECS will not issue runtime warnings from missing device data.',
      severity: 'info',
      confidence: 72,
      sourceTruth: [context.power.truth],
      sourceTypes: ['power'],
      suppressKey: 'power.telemetry.unavailable',
      createdAt,
      actions: [{ label: 'Open Power', type: 'open_power' }],
    }));
  }

  if (context.telemetry.truth === 'unavailable' && context.navigation.truth === 'live') {
    items.push(advisory({
      id: `ecsai-telemetry-unavailable-${createdAt}`,
      title: 'ECS Telemetry Intel',
      message: 'Vehicle telemetry unavailable during navigation. ECS will not generate mechanical warnings from missing data.',
      severity: 'info',
      confidence: 72,
      sourceTruth: ['unavailable'],
      sourceTypes: ['telemetry'],
      suppressKey: 'telemetry.obd_unavailable',
      createdAt,
      actions: [{ label: 'Open Telemetry', type: 'open_telemetry' }],
    }));
  }

  if (context.offlineCache.value == null && context.navigation.truth === 'live') {
    items.push(advisory({
      id: `ecsai-route-cache-unavailable-${createdAt}`,
      title: 'ECS Route Intel',
      message: 'Offline cache status unavailable for the active route. Verify map availability before low-connectivity travel.',
      severity: 'low',
      confidence: 66,
      sourceTruth: combineECSAITruth([context.offlineCache.truth, context.navigation.truth]),
      sourceTypes: ['route', 'offline_cache'],
      suppressKey: 'route.offline_tiles_missing',
      createdAt,
      actions: [{ label: 'Open Navigate', type: 'open_navigate' }],
    }));
  }

  return sortAdvisories(items);
}
