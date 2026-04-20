import { TACTICAL } from './theme';

export type DashboardSummaryTone =
  | 'good'
  | 'attention'
  | 'critical'
  | 'neutral'
  | 'live'
  | 'stale'
  | 'offline'
  | 'unavailable'
  | 'warning'
  | 'degraded'
  | 'misconfigured';

export interface DashboardWidgetSummary {
  badge: {
    label: string;
    tone: DashboardSummaryTone;
  } | null;
  primaryLabel?: string;
  primaryValue: string;
  primaryTone?: DashboardSummaryTone;
  secondary: {
    label: string;
    value: string;
    tone?: DashboardSummaryTone;
  }[];
  footer?: {
    text: string;
    tone?: DashboardSummaryTone;
  } | null;
}

export function summarizeVehicleSystems(params: {
  engineLabel: string;
  hasLiveTelemetry: boolean;
  batteryVoltage: number | null;
  fuelPercent: number | null;
  powerPercent: number | null;
  powerRuntime: string;
  faultReason?: string | null;
  buildWeightLb: number;
}): DashboardWidgetSummary {
  const batteryTone =
    params.batteryVoltage == null ? 'neutral' :
    params.batteryVoltage >= 12.4 ? 'good' :
    params.batteryVoltage >= 11.8 ? 'attention' :
    'critical';
  const fuelTone =
    params.fuelPercent == null ? 'neutral' :
    params.fuelPercent <= 15 ? 'critical' :
    params.fuelPercent <= 30 ? 'attention' :
    'good';
  const overallTone = params.faultReason ? 'critical' : fuelTone === 'critical' || batteryTone === 'critical'
    ? 'critical'
    : fuelTone === 'attention' || batteryTone === 'attention'
      ? 'attention'
      : params.hasLiveTelemetry
        ? 'live'
        : 'neutral';
  const supportingReason =
    params.faultReason
      ?? (fuelTone === 'critical' ? 'Fuel reserve below 15%' : null)
      ?? (batteryTone === 'critical' ? 'Starter battery voltage is low' : null)
      ?? (!params.hasLiveTelemetry ? 'No live vehicle system feed - using configured vehicle context' : null);

  const primaryValue =
    overallTone === 'critical' ? 'CRITICAL' :
    overallTone === 'attention' ? 'ATTENTION' :
    params.hasLiveTelemetry ? 'GOOD' : 'PROFILE';

  return {
    badge: {
      label: params.hasLiveTelemetry ? 'LIVE VEHICLE' : params.buildWeightLb > 0 || params.powerPercent != null ? 'NO LIVE FEED' : 'SETUP REQUIRED',
      tone: params.hasLiveTelemetry ? 'live' : params.buildWeightLb > 0 || params.powerPercent != null ? 'warning' : 'misconfigured',
    },
    primaryLabel: 'SYSTEM STATE',
    primaryValue,
    primaryTone: overallTone,
    secondary: [
      {
        label: 'ENGINE',
        value: params.engineLabel,
        tone: params.engineLabel === 'RUNNING' || params.engineLabel === 'IDLE' ? 'good' : 'neutral',
      },
      {
        label: params.powerPercent != null ? 'POWER' : 'FUEL',
        value: params.powerPercent != null ? `${Math.round(params.powerPercent)}%` : params.fuelPercent != null ? `${Math.round(params.fuelPercent)}%` : '--',
        tone: params.powerPercent != null ? 'neutral' : fuelTone,
      },
    ],
    footer: supportingReason
      ? { text: supportingReason, tone: overallTone === 'critical' ? 'critical' : 'attention' }
      : params.powerPercent != null
      ? { text: params.powerRuntime !== '--' && params.powerRuntime !== '—' ? `Runtime ${params.powerRuntime}` : 'Power telemetry active', tone: 'neutral' }
      : params.buildWeightLb > 0
        ? { text: `Build ${Math.round(params.buildWeightLb).toLocaleString()} lb`, tone: 'neutral' }
        : { text: 'No active faults', tone: 'neutral' },
  };
}

export function summarizeRouteProgress(params: {
  hasRoute: boolean;
  isComplete: boolean;
  remainingMi: number | null;
  totalMi: number;
  etaText: string | null;
  targetName: string | null;
  hasGps: boolean;
}): DashboardWidgetSummary {
  if (!params.hasRoute) {
    return {
      badge: { label: 'NO ROUTE', tone: 'unavailable' },
      primaryLabel: 'ROUTE STATUS',
      primaryValue: 'INACTIVE',
      primaryTone: 'neutral',
      secondary: [
        { label: 'REMAINING', value: '--' },
        { label: 'ETA', value: '--' },
      ],
      footer: { text: 'Open Navigate to load a route', tone: 'neutral' },
    };
  }

  const remainingValue = params.remainingMi != null
    ? `${params.remainingMi.toFixed(params.remainingMi < 10 ? 1 : 0)} mi`
    : params.totalMi > 0
      ? `${params.totalMi.toFixed(0)} mi`
      : '--';

  return {
    badge: {
      label: params.isComplete ? 'ARRIVED' : params.hasGps ? 'ON ROUTE' : 'WAITING FOR GPS',
      tone: params.isComplete ? 'good' : params.hasGps ? 'live' : 'attention',
    },
    primaryLabel: params.isComplete ? 'STATUS' : 'REMAINING',
    primaryValue: params.isComplete ? 'ARRIVED' : remainingValue,
    primaryTone: params.isComplete ? 'good' : params.hasGps ? 'live' : 'neutral',
    secondary: [
      { label: 'ETA', value: params.etaText ?? '--', tone: params.isComplete ? 'good' : 'neutral' },
      { label: 'NEXT', value: params.targetName ?? 'Route active', tone: 'neutral' },
    ],
    footer: {
      text: params.isComplete ? 'Route complete' : params.hasGps ? 'Live route tracking' : 'Route is loaded and waiting for a location fix',
      tone: params.hasGps ? 'live' : 'attention',
    },
  };
}

export function summarizeRemoteness(params: {
  active: boolean;
  hasFix: boolean;
  tier: string;
  reason: string;
  connectivityState: string;
  freshness: string;
}): DashboardWidgetSummary {
  if (!params.active) {
    return {
      badge: { label: 'LOCATION REQUIRED', tone: 'unavailable' },
      primaryLabel: 'REMOTENESS',
      primaryValue: 'STANDBY',
      primaryTone: 'neutral',
      secondary: [
        { label: 'HELP', value: '--' },
        { label: 'SIGNAL', value: '--' },
      ],
      footer: { text: 'Available during active expedition or live location tracking', tone: 'neutral' },
    };
  }

  if (!params.hasFix) {
    return {
      badge: { label: 'WAITING FOR GPS', tone: 'attention' },
      primaryLabel: 'REMOTENESS',
      primaryValue: 'ASSESSING',
      primaryTone: 'attention',
      secondary: [
        { label: 'HELP', value: '--' },
        { label: 'SIGNAL', value: params.connectivityState.toUpperCase(), tone: 'neutral' },
      ],
      footer: { text: 'Waiting for GPS', tone: 'attention' },
    };
  }

  const tone =
    params.tier === 'EXTREME' || params.tier === 'DEEP REMOTE' ? 'critical' :
    params.tier === 'REMOTE' ? 'attention' :
    'good';

  return {
    badge: {
      label: params.freshness === 'offline' || params.freshness === 'stale' ? 'STALE CONTEXT' : 'LIVE INDEX',
      tone: params.freshness === 'offline' ? 'offline' : params.freshness === 'stale' ? 'stale' : 'live',
    },
    primaryLabel: 'REMOTENESS',
    primaryValue: params.tier,
    primaryTone: tone,
    secondary: [
      { label: 'SIGNAL', value: params.connectivityState.toUpperCase(), tone: params.connectivityState === 'online' ? 'good' : params.connectivityState === 'degraded' ? 'attention' : 'critical' },
      { label: 'STATE', value: params.freshness.toUpperCase(), tone: params.freshness === 'live' ? 'live' : params.freshness === 'stale' ? 'stale' : 'offline' },
    ],
    footer: { text: params.reason, tone: 'neutral' },
  };
}

export function summarizeSignal(params: {
  syncStatus: string;
  connectivityState: string;
  remotenessTier: string;
  freshness: string;
}): DashboardWidgetSummary {
  const connected = params.syncStatus === 'synced' || params.connectivityState === 'online';
  const degraded = params.connectivityState === 'degraded';
  const stale = params.freshness === 'stale';
  const hasSignalContext = connected || degraded || stale;
  const primaryValue = connected ? (degraded ? 'LIMITED' : 'CONNECTED') : hasSignalContext ? 'LIMITED' : 'UNAVAILABLE';
  const primaryTone = !hasSignalContext ? 'unavailable' : degraded ? 'degraded' : stale ? 'stale' : 'good';
  const badgeTone = !hasSignalContext ? 'unavailable' : stale ? 'stale' : degraded ? 'degraded' : 'live';
  const networkLabel = connected ? (degraded ? 'LIMITED' : 'AVAILABLE') : hasSignalContext ? 'PARTIAL' : 'NO SOURCE';
  const confidenceLabel = stale ? 'STALE' : degraded ? 'PARTIAL' : connected ? 'STATUS ONLY' : 'UNAVAILABLE';

  return {
    badge: {
      label: hasSignalContext ? (degraded ? 'WEAK SIGNAL' : stale ? 'STALE SIGNAL' : 'CONNECTED') : 'NO SIGNAL DATA',
      tone: badgeTone,
    },
    primaryLabel: 'COMMS',
    primaryValue,
    primaryTone,
    secondary: [
      { label: 'NETWORK', value: networkLabel, tone: primaryTone },
      { label: 'CONF', value: confidenceLabel, tone: stale ? 'stale' : connected ? 'neutral' : 'offline' },
    ],
    footer: {
      text: hasSignalContext
        ? stale
          ? 'Signal data is stale'
          : degraded
            ? `Signal is limited in ${params.remotenessTier.toLowerCase()} terrain`
            : 'High-level connectivity available'
        : 'No radio or network source is currently available',
      tone: !hasSignalContext ? 'unavailable' : stale ? 'stale' : degraded ? 'degraded' : 'neutral',
    },
  };
}

export function summarizeTerrain(params: {
  altitudeFt: number | null;
  gradePercent: number | null;
  routeName: string | null;
  hasFix: boolean;
}): DashboardWidgetSummary {
  if (!params.hasFix && params.altitudeFt == null) {
    return {
      badge: { label: 'UNAVAILABLE', tone: 'unavailable' },
      primaryLabel: 'ELEVATION',
      primaryValue: '--',
      primaryTone: 'neutral',
      secondary: [
        { label: 'GRADE', value: '--' },
        { label: 'TERRAIN', value: '--' },
      ],
      footer: { text: 'No route terrain profile loaded', tone: 'attention' },
    };
  }

  const gradeTone =
    params.gradePercent == null ? 'neutral' :
    Math.abs(params.gradePercent) >= 8 ? 'critical' :
    Math.abs(params.gradePercent) >= 5 ? 'attention' :
    'good';

  return {
    badge: {
      label: params.routeName ? 'ROUTE TERRAIN' : 'LIVE ELEVATION',
      tone: 'live',
    },
    primaryLabel: 'ELEVATION',
    primaryValue: params.altitudeFt != null ? `${Math.round(params.altitudeFt).toLocaleString()} ft` : '--',
    primaryTone: 'live',
    secondary: [
      { label: 'GRADE', value: params.gradePercent != null ? `${params.gradePercent.toFixed(1)}%` : '--', tone: gradeTone },
      { label: 'CONTEXT', value: params.routeName ?? 'Current area', tone: 'neutral' },
    ],
    footer: {
      text: params.routeName
        ? params.gradePercent != null && Math.abs(params.gradePercent) >= 6
          ? 'Steeper terrain ahead'
          : 'Terrain profile loaded'
        : 'No route terrain profile loaded',
      tone: params.gradePercent != null && Math.abs(params.gradePercent) >= 6 ? 'attention' : 'neutral',
    },
  };
}

export function summarizeResourceStatus(params: {
  fuelPercent: number;
  waterGallons: number;
  estRangeMi: number | null;
  powerPercent: number | null;
  runtimeText: string;
  isPlanningMode: boolean;
}): DashboardWidgetSummary {
  const resourceTone =
    params.fuelPercent <= 15 || params.waterGallons <= 0 ? 'critical' :
    params.fuelPercent <= 30 || params.waterGallons < 5 ? 'attention' :
    'good';

  return {
    badge: {
      label: params.isPlanningMode ? 'PLAN STATE' : 'ACTIVE RESERVES',
      tone: params.isPlanningMode ? 'neutral' : 'live',
    },
    primaryLabel: 'RESOURCE STATUS',
    primaryValue: resourceTone === 'critical' ? 'LIMITED' : resourceTone === 'attention' ? 'WATCH' : 'READY',
    primaryTone: resourceTone,
    secondary: [
      { label: 'FUEL', value: `${Math.round(params.fuelPercent)}%`, tone: resourceTone },
      { label: 'POWER', value: params.powerPercent != null ? `${Math.round(params.powerPercent)}%` : params.estRangeMi != null ? `${params.estRangeMi} mi` : '--', tone: params.powerPercent != null ? 'neutral' : resourceTone },
    ],
    footer: {
      text: params.powerPercent != null && params.runtimeText !== '--' && params.runtimeText !== '—'
        ? `Runtime ${params.runtimeText}`
        : params.estRangeMi != null
          ? `Estimated range ${params.estRangeMi} mi`
          : `Water ${params.waterGallons.toFixed(1)} gal`,
      tone: 'neutral',
    },
  };
}

export function summarizeWeatherStatus(kind: string, hasAlert: boolean): { label: string; tone: DashboardSummaryTone } {
  if (hasAlert) return { label: 'ALERT ACTIVE', tone: 'critical' };
  if (kind === 'ready') return { label: 'LIVE WEATHER', tone: 'live' };
  if (kind === 'stale') return { label: 'STALE WEATHER', tone: 'stale' };
  if (kind === 'offline') return { label: 'OFFLINE CACHE', tone: 'offline' };
  if (kind === 'waiting_for_gps') return { label: 'WAITING FOR GPS', tone: 'attention' };
  if (kind === 'loading') return { label: 'LOADING', tone: 'attention' };
  return { label: 'UNAVAILABLE', tone: 'unavailable' };
}

export function summarizeTelemetryState(params: {
  freshnessLabel: string;
  hasData: boolean;
  engineStatus: string;
  lastUpdatedText: string | null;
}): { badge: { label: string; tone: DashboardSummaryTone }; footer: { text: string; tone: DashboardSummaryTone } | null } {
  const tone =
    params.freshnessLabel === 'live' ? 'live' :
    params.freshnessLabel === 'reconnecting' ? 'attention' :
    params.freshnessLabel === 'last_known' || params.freshnessLabel === 'stale' ? 'stale' :
    'offline';

  return {
    badge: {
      label: params.hasData ? `OBD ${params.freshnessLabel === 'live' ? 'LIVE' : params.freshnessLabel.toUpperCase()}` : 'NO OBD',
      tone: params.hasData ? tone : 'unavailable',
    },
    footer: params.lastUpdatedText
      ? {
          text: params.hasData ? `${params.engineStatus.toUpperCase()} • ${params.lastUpdatedText}` : 'Connect OBD adapter',
          tone: params.hasData ? tone : 'unavailable',
        }
      : null,
  };
}

export function toneToColor(tone: DashboardSummaryTone): string {
  switch (tone) {
    case 'good':
    case 'live':
      return '#4CAF50';
    case 'attention':
    case 'warning':
    case 'degraded':
    case 'stale':
    case 'misconfigured':
      return '#FFB300';
    case 'critical':
      return '#EF5350';
    case 'offline':
      return '#90A4AE';
    case 'unavailable':
    case 'neutral':
    default:
      return TACTICAL.textMuted;
  }
}
