import type { Signal } from './signalProcessor';
import type { ECSConfidenceLevel, ECSConfidenceResult } from './confidenceTypes';
import type { ECSOperatorTrustMode } from './operatorTrustTypes';
import type {
  ECSPriorityConfidenceInput,
  ECSPriorityDomain,
  ECSPriorityHapticPattern,
  ECSPriorityLevel,
  ECSPriorityReason,
  ECSPriorityResult,
} from './priorityTypes';

type PriorityBlueprint = {
  rank: number;
  interruptive: boolean;
  requiresBanner: boolean;
  requiresAlertSurface: boolean;
  hapticPattern: ECSPriorityHapticPattern;
};

const PRIORITY_ORDER: ECSPriorityLevel[] = [
  'informational',
  'advisory',
  'caution',
  'warning',
  'critical',
];

const PRIORITY_BLUEPRINTS: Record<ECSPriorityLevel, PriorityBlueprint> = {
  informational: {
    rank: 1,
    interruptive: false,
    requiresBanner: false,
    requiresAlertSurface: false,
    hapticPattern: 'none',
  },
  advisory: {
    rank: 2,
    interruptive: false,
    requiresBanner: false,
    requiresAlertSurface: false,
    hapticPattern: 'soft',
  },
  caution: {
    rank: 3,
    interruptive: false,
    requiresBanner: false,
    requiresAlertSurface: false,
    hapticPattern: 'soft',
  },
  warning: {
    rank: 4,
    interruptive: true,
    requiresBanner: true,
    requiresAlertSurface: true,
    hapticPattern: 'medium',
  },
  critical: {
    rank: 5,
    interruptive: true,
    requiresBanner: true,
    requiresAlertSurface: true,
    hapticPattern: 'strong',
  },
};

function confidenceLevelOf(
  confidence: ECSPriorityConfidenceInput,
): ECSConfidenceLevel | null {
  if (!confidence) return null;
  if (typeof confidence === 'string') return confidence;
  return confidence.level ?? null;
}

function levelIndex(level: ECSPriorityLevel): number {
  return PRIORITY_ORDER.indexOf(level);
}

function shiftLevel(level: ECSPriorityLevel, steps: number): ECSPriorityLevel {
  const nextIndex = Math.max(0, Math.min(PRIORITY_ORDER.length - 1, levelIndex(level) + steps));
  return PRIORITY_ORDER[nextIndex] ?? level;
}

function disciplineForConfidence(
  level: ECSPriorityLevel,
  confidence: ECSPriorityConfidenceInput,
  allowCriticalWithoutHighConfidence = false,
): ECSPriorityLevel {
  const confidenceLevel = confidenceLevelOf(confidence);
  if (!confidenceLevel) return level;

  if (confidenceLevel === 'high' || confidenceLevel === 'moderate') {
    return level;
  }

  if (confidenceLevel === 'limited') {
    if (level === 'critical' && allowCriticalWithoutHighConfidence) return level;
    return shiftLevel(level, -1);
  }

  if (confidenceLevel === 'low' || confidenceLevel === 'unknown') {
    if (level === 'critical' && allowCriticalWithoutHighConfidence) {
      return 'warning';
    }
    return shiftLevel(level, -1);
  }

  return level;
}

export function createPriorityResult(args: {
  level: ECSPriorityLevel;
  title: string;
  shortReason: string;
  domain?: ECSPriorityDomain;
  reasons?: ECSPriorityReason[];
  sourceKey?: string;
  confidence?: ECSPriorityConfidenceInput;
  allowCriticalWithoutHighConfidence?: boolean;
  bannerOverride?: boolean;
  interruptiveOverride?: boolean;
  alertSurfaceOverride?: boolean;
  hapticOverride?: ECSPriorityHapticPattern;
}): ECSPriorityResult {
  const disciplinedLevel = disciplineForConfidence(
    args.level,
    args.confidence,
    !!args.allowCriticalWithoutHighConfidence,
  );
  const blueprint = PRIORITY_BLUEPRINTS[disciplinedLevel];
  const reasons = [...(args.reasons ?? [])];
  const confidenceLevel = confidenceLevelOf(args.confidence);

  if (confidenceLevel === 'limited' || confidenceLevel === 'low' || confidenceLevel === 'unknown') {
    reasons.push('limited_confidence');
  }

  return {
    level: disciplinedLevel,
    rank: blueprint.rank,
    title: args.title,
    shortReason: args.shortReason,
    interruptive: args.interruptiveOverride ?? blueprint.interruptive,
    requiresBanner: args.bannerOverride ?? blueprint.requiresBanner,
    requiresAlertSurface: args.alertSurfaceOverride ?? blueprint.requiresAlertSurface,
    hapticPattern: args.hapticOverride ?? blueprint.hapticPattern,
    domain: args.domain,
    reasons,
    sourceKey: args.sourceKey,
  };
}

export function applyTrustModeToPriorityResult(
  priority: ECSPriorityResult | null | undefined,
  mode: ECSOperatorTrustMode,
  options: {
    confidence?: ECSPriorityConfidenceInput;
    domain?: ECSPriorityDomain;
  } = {},
): ECSPriorityResult | null {
  if (!priority) return null;
  if (mode === 'balanced_command') return priority;
  if (priority.level === 'warning' || priority.level === 'critical') return priority;

  const domain = options.domain ?? priority.domain;
  const confidenceLevel = confidenceLevelOf(options.confidence);
  let nextLevel: ECSPriorityLevel = priority.level;

  if (mode === 'conservative_guidance') {
    if (
      (priority.level === 'informational' || priority.level === 'advisory')
      && confidenceLevel !== 'low'
      && confidenceLevel !== 'unknown'
      && confidenceLevel !== 'limited'
      && (
        domain === 'route_risk'
        || domain === 'route_viability'
        || domain === 'weather'
        || domain === 'remoteness'
        || domain === 'vehicle_assessment'
        || domain === 'resource'
        || domain === 'offline'
        || domain === 'ecs_brief'
      )
    ) {
      nextLevel = shiftLevel(priority.level, 1);
    }
  }

  if (mode === 'minimal_advisory') {
    if (
      priority.level === 'advisory'
      && (
        confidenceLevel === 'limited'
        || confidenceLevel === 'low'
        || confidenceLevel === 'unknown'
        || domain === 'vehicle_assessment'
        || domain === 'ecs_brief'
        || domain === 'signal'
      )
    ) {
      nextLevel = shiftLevel(priority.level, -1);
    } else if (
      priority.level === 'caution'
      && (
        confidenceLevel === 'low'
        || confidenceLevel === 'unknown'
      )
      && domain !== 'route_risk'
      && domain !== 'route_viability'
      && domain !== 'weather'
      && domain !== 'offline'
    ) {
      nextLevel = shiftLevel(priority.level, -1);
    }
  }

  if (nextLevel === priority.level) {
    return priority;
  }

  const blueprint = PRIORITY_BLUEPRINTS[nextLevel];
  return {
    ...priority,
    level: nextLevel,
    rank: blueprint.rank,
    interruptive: blueprint.interruptive,
    requiresBanner: blueprint.requiresBanner,
    requiresAlertSurface: blueprint.requiresAlertSurface,
    hapticPattern: blueprint.hapticPattern,
  };
}

export function assessRouteRiskPriority(params: {
  riskLevel: 'low' | 'moderate' | 'high' | 'critical';
  riskScore: number;
  routeActive?: boolean;
  remotenessScore?: number | null;
  bailoutAvailable?: boolean;
  confidence?: ECSPriorityConfidenceInput;
  driver?: string | null;
}): ECSPriorityResult {
  const remote = (params.remotenessScore ?? 0) >= 70;
  const noBailout = params.bailoutAvailable === false;

  let level: ECSPriorityLevel;
  switch (params.riskLevel) {
    case 'critical':
      level = params.routeActive ? 'critical' : 'warning';
      break;
    case 'high':
      level = params.routeActive || remote ? 'warning' : 'caution';
      break;
    case 'moderate':
      level = params.routeActive ? 'caution' : 'advisory';
      break;
    case 'low':
    default:
      level = params.routeActive && params.riskScore >= 20 ? 'advisory' : 'informational';
      break;
  }

  if ((remote && noBailout) || (params.routeActive && remote && params.riskScore >= 70)) {
    level = shiftLevel(level, 1);
  }

  return createPriorityResult({
    level,
    domain: 'route_risk',
    title:
      params.riskLevel === 'critical'
        ? 'Critical route risk'
        : params.riskLevel === 'high'
          ? 'Elevated route risk'
          : params.riskLevel === 'moderate'
            ? 'Manageable route caution'
            : 'Route risk stable',
    shortReason:
      params.driver ??
      (noBailout && remote
        ? 'Remote section with limited exit options'
        : params.riskLevel === 'low'
          ? 'Current terrain risk remains controlled'
          : 'Terrain and commitment risk are elevated'),
    confidence: params.confidence,
    reasons: ['route_risk'],
    sourceKey: 'route_risk',
  });
}

export function assessWeatherPriority(params: {
  severity: 'none' | 'advisory' | 'warning' | 'extreme';
  routeActive?: boolean;
  alertCount?: number;
  stale?: boolean;
  offline?: boolean;
  confidence?: ECSPriorityConfidenceInput;
}): ECSPriorityResult {
  let level: ECSPriorityLevel;
  switch (params.severity) {
    case 'extreme':
      level = params.routeActive ? 'warning' : 'caution';
      break;
    case 'warning':
      level = params.routeActive ? 'warning' : 'caution';
      break;
    case 'advisory':
      level = params.routeActive ? 'caution' : 'advisory';
      break;
    case 'none':
    default:
      level = params.offline || params.stale ? 'advisory' : 'informational';
      break;
  }

  if ((params.stale || params.offline) && level === 'warning') {
    level = 'caution';
  }

  return createPriorityResult({
    level,
    domain: 'weather',
    title:
      params.severity === 'extreme'
        ? 'Severe weather exposure'
        : params.severity === 'warning'
          ? 'Weather warning'
          : params.severity === 'advisory'
            ? 'Weather advisory'
            : params.offline || params.stale
              ? 'Weather confidence reduced'
              : 'Weather stable',
    shortReason:
      params.severity === 'none'
        ? params.offline || params.stale
          ? 'Weather is cached or stale'
          : 'No elevated weather signal'
        : params.routeActive
          ? 'Weather is affecting the active route'
          : 'Weather is worth operator attention',
    confidence: params.confidence,
    reasons: params.offline || params.stale ? ['weather_exposure', 'offline_degraded'] : ['weather_exposure'],
    sourceKey: 'weather',
  });
}

export function assessRemotenessPriority(params: {
  score: number;
  level: string;
  routeActive?: boolean;
  noSignal?: boolean;
  forecastIncreasing?: boolean;
  confidence?: ECSPriorityConfidenceInput;
}): ECSPriorityResult {
  let level: ECSPriorityLevel;
  if (params.score >= 86) level = params.routeActive && params.noSignal ? 'warning' : 'caution';
  else if (params.score >= 70) level = 'caution';
  else if (params.score >= 50) level = 'advisory';
  else level = 'informational';

  if (params.forecastIncreasing && params.routeActive && params.score >= 70) {
    level = shiftLevel(level, 1);
  }

  return createPriorityResult({
    level,
    domain: 'remoteness',
    title:
      params.score >= 86
        ? 'Extreme remoteness'
        : params.score >= 70
          ? 'Remoteness rising'
          : params.score >= 50
            ? 'Remote terrain ahead'
            : 'Remoteness stable',
    shortReason:
      params.noSignal && params.routeActive
        ? 'Active route is entering low-support terrain'
        : params.forecastIncreasing
          ? 'Support drops in the next route segment'
          : `Current remoteness profile is ${String(params.level).toLowerCase()}`,
    confidence: params.confidence,
    reasons: ['remoteness_exposure'],
    sourceKey: 'remoteness',
  });
}

export function assessVehicleFitPriority(params: {
  fitLevel: 'strong_fit' | 'good_fit' | 'limited_fit' | 'poor_fit' | 'unknown_fit';
  routeActive?: boolean;
  remotenessScore?: number | null;
  phase?: string | null;
  confidence?: ECSPriorityConfidenceInput;
}): ECSPriorityResult {
  const remote = (params.remotenessScore ?? 0) >= 70;
  const liveRoutePhase =
    params.phase === 'trail_entry' ||
    params.phase === 'active_expedition' ||
    params.phase === 'recovery_exit';
  const stagingPhase = params.phase === 'vehicle_setup' || params.phase === 'staging';

  let level: ECSPriorityLevel;
  switch (params.fitLevel) {
    case 'strong_fit':
      level = stagingPhase ? 'advisory' : 'informational';
      break;
    case 'good_fit':
      level = stagingPhase ? 'advisory' : 'informational';
      break;
    case 'limited_fit':
      level = params.routeActive || liveRoutePhase ? 'caution' : 'advisory';
      break;
    case 'poor_fit':
      level = params.routeActive || liveRoutePhase ? 'warning' : 'caution';
      break;
    case 'unknown_fit':
    default:
      level = stagingPhase ? 'advisory' : 'informational';
      break;
  }

  if (params.fitLevel === 'poor_fit' && remote && (params.routeActive || liveRoutePhase)) {
    level = 'warning';
  }

  return createPriorityResult({
    level,
    domain: 'vehicle_assessment',
    title:
      params.fitLevel === 'strong_fit'
        ? 'Strong vehicle fit'
        : params.fitLevel === 'good_fit'
          ? 'Vehicle fit aligned'
          : params.fitLevel === 'limited_fit'
            ? 'Vehicle fit limited'
            : params.fitLevel === 'poor_fit'
              ? 'Vehicle fit concern'
              : 'Vehicle fit uncertain',
    shortReason:
      params.fitLevel === 'strong_fit'
        ? 'Current vehicle profile supports the route well'
        : params.fitLevel === 'good_fit'
          ? 'Vehicle profile remains compatible with the route'
          : params.fitLevel === 'limited_fit'
            ? 'Vehicle setup narrows route margin'
            : params.fitLevel === 'poor_fit'
              ? 'Current setup may materially limit route flexibility'
              : 'Vehicle fit confidence is limited by missing baseline data',
    confidence: params.confidence,
    reasons: ['vehicle_fit'],
    sourceKey: 'vehicle_fit',
  });
}

export function assessRouteViabilityPriority(params: {
  viabilityLevel: 'viable' | 'watch_closely' | 'limited_margin' | 'exit_recommended' | 'unknown';
  routeActive?: boolean;
  bailoutRelevant?: boolean;
  phase?: string | null;
  confidence?: ECSPriorityConfidenceInput;
}): ECSPriorityResult {
  const liveRoutePhase =
    params.phase === 'trail_entry' ||
    params.phase === 'active_expedition' ||
    params.phase === 'recovery_exit';
  const stagingPhase =
    params.phase === 'vehicle_setup' ||
    params.phase === 'staging';

  let level: ECSPriorityLevel;
  switch (params.viabilityLevel) {
    case 'viable':
      level = stagingPhase ? 'advisory' : 'informational';
      break;
    case 'watch_closely':
      level = params.routeActive || liveRoutePhase ? 'caution' : 'advisory';
      break;
    case 'limited_margin':
      level = params.routeActive || liveRoutePhase ? 'warning' : 'caution';
      break;
    case 'exit_recommended':
      level = 'warning';
      break;
    case 'unknown':
    default:
      level = stagingPhase ? 'advisory' : 'informational';
      break;
  }

  if (
    params.bailoutRelevant &&
    (params.routeActive || liveRoutePhase) &&
    params.viabilityLevel !== 'viable' &&
    params.viabilityLevel !== 'unknown'
  ) {
    level = shiftLevel(level, 1);
  }

  if (params.viabilityLevel === 'exit_recommended') {
    level = 'warning';
  }

  return createPriorityResult({
    level,
    domain: 'route_viability',
    title:
      params.viabilityLevel === 'viable'
        ? 'Route remains viable'
        : params.viabilityLevel === 'watch_closely'
          ? 'Route margin deserves watch'
          : params.viabilityLevel === 'limited_margin'
            ? 'Route margin is limited'
            : params.viabilityLevel === 'exit_recommended'
              ? 'Exit posture recommended'
              : 'Route viability uncertain',
    shortReason:
      params.viabilityLevel === 'viable'
        ? 'Current route posture remains workable'
        : params.viabilityLevel === 'watch_closely'
          ? 'Resource and route margin should be watched'
          : params.viabilityLevel === 'limited_margin'
            ? 'Route flexibility is shrinking'
            : params.viabilityLevel === 'exit_recommended'
              ? 'Exit posture is now the safer option'
              : 'Route viability is limited by incomplete support data',
    confidence: params.confidence,
    reasons: [
      'resource_margin',
      ...(params.bailoutRelevant ? (['bailout_relevance'] as const) : []),
    ],
    sourceKey: 'route_viability',
  });
}

export function assessResourcePriority(params: {
  kind: 'fuel' | 'water' | 'food' | 'power';
  percent: number | null | undefined;
  routeActive?: boolean;
  remotenessScore?: number | null;
  confidence?: ECSPriorityConfidenceInput;
}): ECSPriorityResult | null {
  const percent = typeof params.percent === 'number' && Number.isFinite(params.percent) ? params.percent : null;
  if (percent == null) return null;

  const remote = (params.remotenessScore ?? 0) >= 70;
  let level: ECSPriorityLevel = 'informational';

  if (percent <= 8) level = params.routeActive && remote ? 'critical' : 'warning';
  else if (percent <= 15) level = 'warning';
  else if (percent <= 30) level = 'caution';
  else if (percent <= 45) level = 'advisory';

  return createPriorityResult({
    level,
    domain: 'resource',
    title:
      level === 'critical'
        ? `${capitalize(params.kind)} critically low`
        : level === 'warning'
          ? `${capitalize(params.kind)} warning`
          : level === 'caution'
            ? `${capitalize(params.kind)} trend watch`
            : `${capitalize(params.kind)} update`,
    shortReason:
      level === 'informational'
        ? `${capitalize(params.kind)} remains within normal margin`
        : `${capitalize(params.kind)} margin is ${Math.round(percent)}%`,
    confidence: params.confidence,
    reasons: ['resource_margin'],
    sourceKey: `resource:${params.kind}`,
    allowCriticalWithoutHighConfidence: true,
  });
}

export function assessTelemetryPriority(params: {
  state: string | null | undefined;
  routeActive?: boolean;
  repeatedDisconnects?: boolean;
  confidence?: ECSPriorityConfidenceInput;
}): ECSPriorityResult {
  const state = String(params.state ?? '').trim().toUpperCase();
  let level: ECSPriorityLevel;

  switch (state) {
    case 'UNAVAILABLE':
    case 'UNSUPPORTED':
      level = params.routeActive ? 'warning' : 'caution';
      break;
    case 'TEMPORARILY_DISCONNECTED':
    case 'ATTENTION':
    case 'STALE':
      level = params.routeActive ? 'warning' : 'caution';
      break;
    case 'WAITING_FOR_PROVIDER':
    case 'CLOUD_BACKED':
    case 'ESTIMATED':
    case 'MANUAL':
    case 'PARTIAL':
    case 'RECONNECTING':
      level = params.routeActive ? 'caution' : 'advisory';
      break;
    case 'LIVE_PROVIDER_CONNECTED':
    case 'LIVE':
      level = 'informational';
      break;
    default:
      level = params.routeActive ? 'caution' : 'advisory';
      break;
  }

  if (params.repeatedDisconnects) {
    level = shiftLevel(level, 1);
  }

  return createPriorityResult({
    level,
    domain: 'telemetry',
    title:
      level === 'warning'
        ? 'Telemetry warning'
        : level === 'caution'
          ? 'Telemetry degraded'
          : level === 'advisory'
            ? 'Telemetry partial'
            : 'Telemetry stable',
    shortReason:
      params.repeatedDisconnects
        ? 'Live vehicle monitoring is disconnecting repeatedly'
        : state === 'CLOUD_BACKED' || state === 'ESTIMATED'
          ? 'Provider values are synced but not live'
          : state === 'MANUAL'
            ? 'Using stored baseline without live provider support'
            : state === 'UNAVAILABLE' || state === 'UNSUPPORTED'
              ? 'No trustworthy provider or baseline is available'
        : state === 'LIVE'
          || state === 'LIVE_PROVIDER_CONNECTED'
          ? 'Live telemetry is stable'
          : 'Live vehicle telemetry is reduced',
    confidence: params.confidence,
    reasons: params.repeatedDisconnects ? ['telemetry_degraded', 'provider_disconnect'] : ['telemetry_degraded'],
    sourceKey: 'telemetry',
  });
}

export function assessBleDisconnectPriority(params: {
  disconnectCount: number;
  activeMonitoring?: boolean;
  confidence?: ECSPriorityConfidenceInput;
}): ECSPriorityResult | null {
  if (params.disconnectCount <= 0) return null;

  const level =
    params.disconnectCount >= 3 && params.activeMonitoring
      ? 'warning'
      : params.disconnectCount >= 2
        ? 'caution'
        : 'advisory';

  return createPriorityResult({
    level,
    domain: 'ble',
    title: params.disconnectCount >= 3 ? 'Repeated BLE disconnects' : 'BLE disconnect detected',
    shortReason:
      params.activeMonitoring
        ? 'Live provider monitoring is unstable'
        : 'Provider link dropped and may need reconnection',
    confidence: params.confidence,
    reasons: ['provider_disconnect'],
    sourceKey: 'ble_disconnect',
  });
}

export function assessGpsPriority(params: {
  gpsStatus: string | null | undefined;
  routeActive?: boolean;
  remotenessScore?: number | null;
  riskLevel?: 'low' | 'moderate' | 'high' | 'critical' | null;
  confidence?: ECSPriorityConfidenceInput;
}): ECSPriorityResult | null {
  const status = String(params.gpsStatus ?? '').trim().toUpperCase();
  const lost =
    status === 'OFFLINE' || status === 'UNAVAILABLE' || status === 'DENIED' || status === 'NO_SIGNAL';
  if (!lost && status !== 'WEAK') return null;

  const remote = (params.remotenessScore ?? 0) >= 70;
  const highRisk = params.riskLevel === 'high' || params.riskLevel === 'critical';
  let level: ECSPriorityLevel =
    lost
      ? params.routeActive
        ? 'warning'
        : 'caution'
      : 'caution';

  if (lost && params.routeActive && remote && highRisk) {
    level = 'critical';
  }

  return createPriorityResult({
    level,
    domain: 'gps',
    title: lost ? 'Guidance signal lost' : 'GPS signal degraded',
    shortReason:
      params.routeActive
        ? 'Active guidance has lost a reliable position fix'
        : 'Position signal is weaker than expected',
    confidence: params.confidence,
    reasons: ['guidance_signal_loss'],
    sourceKey: 'gps',
    allowCriticalWithoutHighConfidence: true,
  });
}

export function assessAttitudePriority(params: {
  state: 'normal' | 'elevated' | 'unsafe' | 'critical';
  confidence?: ECSPriorityConfidenceInput;
}): ECSPriorityResult {
  const level =
    params.state === 'critical'
      ? 'critical'
      : params.state === 'unsafe'
        ? 'warning'
        : params.state === 'elevated'
          ? 'caution'
          : 'informational';

  return createPriorityResult({
    level,
    domain: 'attitude',
    title:
      params.state === 'critical'
        ? 'Immediate attitude hazard'
        : params.state === 'unsafe'
          ? 'Attitude threshold unsafe'
          : params.state === 'elevated'
            ? 'Attitude caution'
            : 'Attitude stable',
    shortReason:
      params.state === 'normal'
        ? 'Attitude remains within expected bounds'
        : 'Vehicle attitude has crossed a stability threshold',
    confidence: params.confidence,
    reasons: ['attitude_threshold'],
    sourceKey: 'attitude',
    allowCriticalWithoutHighConfidence: true,
  });
}

export function assessOfflinePriority(params: {
  offline?: boolean;
  degraded?: boolean;
  routeActive?: boolean;
  cloudDependent?: boolean;
  confidence?: ECSPriorityConfidenceInput;
}): ECSPriorityResult | null {
  if (!params.offline && !params.degraded) return null;

  const level =
    params.offline && params.routeActive && params.cloudDependent
      ? 'caution'
      : params.degraded && params.routeActive
        ? 'advisory'
        : 'informational';

  return createPriorityResult({
    level,
    domain: 'offline',
    title: params.offline ? 'Offline operating state' : 'Connectivity degraded',
    shortReason:
      params.cloudDependent
        ? 'Forward intelligence is relying on cached context'
        : 'Local systems remain available with reduced service',
    confidence: params.confidence,
    reasons: ['offline_degraded'],
    sourceKey: 'offline',
  });
}

export function assessMissionScenarioPriority(params: {
  level: 'strong' | 'ready_with_limitations' | 'watch_closely' | 'needs_preparation' | 'unknown';
  phase?: string | null;
  routeSelected?: boolean;
  shortReason: string;
  confidence?: ECSPriorityConfidenceInput;
}): ECSPriorityResult {
  const planningPhase =
    params.phase === 'vehicle_setup' ||
    params.phase === 'staging' ||
    params.phase === 'camp_stationary';

  let level: ECSPriorityLevel;
  let title: string;

  switch (params.level) {
    case 'strong':
      level = planningPhase ? 'advisory' : 'informational';
      title = 'Planning posture aligned';
      break;
    case 'ready_with_limitations':
      level = 'advisory';
      title = 'Planning limits noted';
      break;
    case 'watch_closely':
      level = planningPhase ? 'caution' : 'advisory';
      title = 'Planning margin should be watched';
      break;
    case 'needs_preparation':
      level = planningPhase || params.routeSelected ? 'caution' : 'advisory';
      title = 'Expedition preparation needed';
      break;
    case 'unknown':
    default:
      level = planningPhase ? 'advisory' : 'informational';
      title = 'Planning picture incomplete';
      break;
  }

  return createPriorityResult({
    level,
    domain: 'mission_scenario',
    title,
    shortReason: params.shortReason,
    confidence: params.confidence,
    reasons: ['planning_readiness'],
    sourceKey: 'mission_scenario',
  });
}

export function assessOfflineReadinessPriority(params: {
  readinessLevel: 'ready' | 'ready_with_limitations' | 'partial' | 'limited' | 'not_ready';
  routeActive?: boolean;
  phase?: string | null;
  isOnline?: boolean;
  shortReason: string;
  confidence?: ECSPriorityConfidenceInput;
}): ECSPriorityResult {
  const fieldPhase =
    params.phase === 'transit'
    || params.phase === 'trail_entry'
    || params.phase === 'active_expedition'
    || params.phase === 'recovery_exit';
  const planningPhase =
    params.phase === 'vehicle_setup'
    || params.phase === 'staging';

  let level: ECSPriorityLevel;
  let title: string;

  switch (params.readinessLevel) {
    case 'ready':
      level = 'informational';
      title = 'Offline readiness confirmed';
      break;
    case 'ready_with_limitations':
      level = params.routeActive || fieldPhase ? 'advisory' : 'informational';
      title = 'Ready with offline limits';
      break;
    case 'partial':
      level = params.routeActive || !params.isOnline ? 'caution' : 'advisory';
      title = 'Offline preparation incomplete';
      break;
    case 'limited':
      level = params.routeActive || fieldPhase || !params.isOnline ? 'warning' : 'caution';
      title = 'Offline capability limited';
      break;
    case 'not_ready':
    default:
      level = params.routeActive || fieldPhase || planningPhase || !params.isOnline ? 'warning' : 'caution';
      title = 'Offline field posture not ready';
      break;
  }

  return createPriorityResult({
    level,
    domain: 'offline',
    title,
    shortReason: params.shortReason,
    confidence: params.confidence,
    reasons: ['offline_degraded'],
    sourceKey: 'offline_readiness',
  });
}

export function assessSafetyWorkflowPriority(params: {
  level: 'advisory' | 'caution' | 'warning' | 'critical';
  title: string;
  shortReason: string;
}): ECSPriorityResult {
  return createPriorityResult({
    level: params.level,
    domain: 'safety',
    title: params.title,
    shortReason: params.shortReason,
    reasons: ['safety_workflow'],
    sourceKey: `safety:${params.title.toLowerCase().replace(/\s+/g, '_')}`,
    allowCriticalWithoutHighConfidence: true,
  });
}

export function priorityFromSignal(
  signal: Signal | null | undefined,
  confidence?: ECSPriorityConfidenceInput,
): ECSPriorityResult | null {
  if (!signal) return null;

  const baseLevel: ECSPriorityLevel =
    signal.severity >= 3 ? 'critical' : signal.severity === 2 ? 'warning' : 'advisory';

  return createPriorityResult({
    level: baseLevel,
    domain: 'signal',
    title: signal.title,
    shortReason: signal.message,
    reasons: ['watch_condition'],
    sourceKey: `signal:${signal.type}`,
    confidence,
    allowCriticalWithoutHighConfidence: true,
  });
}

export function selectPrimaryPriority(
  priorities: (ECSPriorityResult | null | undefined)[],
): ECSPriorityResult | null {
  const seen = new Set<string>();
  const filtered = priorities.filter(Boolean).filter((priority) => {
    const key = priority!.sourceKey ?? `${priority!.domain ?? 'priority'}:${priority!.title}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }) as ECSPriorityResult[];

  if (!filtered.length) return null;

  filtered.sort((a, b) => {
    if (b.rank !== a.rank) return b.rank - a.rank;
    if (Number(b.interruptive) !== Number(a.interruptive)) {
      return Number(b.interruptive) - Number(a.interruptive);
    }
    if (Number(b.requiresBanner) !== Number(a.requiresBanner)) {
      return Number(b.requiresBanner) - Number(a.requiresBanner);
    }
    return a.title.localeCompare(b.title);
  });

  return filtered[0] ?? null;
}

function capitalize(value: string): string {
  return value.length ? value.charAt(0).toUpperCase() + value.slice(1) : value;
}
