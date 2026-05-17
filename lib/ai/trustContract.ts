import type { ECSAIContext } from '../aiContextBuilder';
import type { ECSLiveStatusResult } from '../status/liveStatusTypes';
import type { ECSConfidenceResult } from './confidenceTypes';
import type { ECSOperationalState } from './degradedOperationsTypes';
import type { ECSExplanationResult } from './recommendationExplanationTypes';
import {
  evaluateTrustFreshnessFromAge,
  formatTrustAgeLabel,
  formatTrustFreshnessLabel,
  mapTrustFreshnessFromLiveFreshness,
  type ECSTrustFreshnessClass,
} from './trustFreshness';
import type {
  ECSTrustFreshnessState,
  ECSTrustMetadata,
  ECSTrustSourceBasis,
} from './trustTypes';

type BuildTrustMetadataArgs = {
  confidence?: ECSConfidenceResult | null;
  liveStatus?: ECSLiveStatusResult | null;
  operationalState?: ECSOperationalState | null;
  explanation?: ECSExplanationResult | null;
  freshnessClass?: ECSTrustFreshnessClass;
  timestamp?: number | string | null;
};

type GateCandidateArgs = {
  source: string;
  candidateTitle: string;
  trust: ECSTrustMetadata;
  richContext: ECSAIContext | null;
};

type TrustGateResult = {
  decision: ECSTrustMetadata['decision'];
  reason: string | null;
  wording: string | null;
};

function mapConfidence(confidence?: ECSConfidenceResult | null): ECSTrustMetadata['confidence'] {
  switch (confidence?.level) {
    case 'high':
      return 'High';
    case 'moderate':
      return 'Medium';
    default:
      return 'Low';
  }
}

function mapSourceBasis(liveStatus?: ECSLiveStatusResult | null): ECSTrustSourceBasis {
  switch (liveStatus?.sourceType) {
    case 'live':
      return 'Live';
    case 'synced':
      return 'Cached';
    case 'manual':
      return 'Profile';
    case 'inferred':
    case 'none':
    default:
      return 'Inferred';
  }
}

function resolveTrustMode(args: {
  liveStatus?: ECSLiveStatusResult | null;
  operationalState?: ECSOperationalState | null;
  sourceBasis: ECSTrustSourceBasis;
}): ECSTrustMetadata['mode'] {
  if (args.liveStatus?.status === 'live') return 'ECS Live';
  if (args.liveStatus?.status === 'waiting') return 'ECS Syncing Context';
  if (args.liveStatus?.status === 'offline_capable' || args.operationalState === 'offline_capable') {
    return 'ECS Offline Support';
  }
  if (
    args.liveStatus?.status === 'estimated' &&
    args.sourceBasis === 'Cached'
  ) {
    return 'ECS Cached';
  }
  if (
    args.liveStatus?.status === 'degraded' &&
    args.sourceBasis === 'Cached'
  ) {
    return 'ECS Cached';
  }
  return 'ECS Limited';
}

function resolveTrustFreshness(args: {
  liveStatus?: ECSLiveStatusResult | null;
  freshnessClass: ECSTrustFreshnessClass;
  timestamp?: number | string | null;
}): ECSTrustFreshnessState {
  if (args.timestamp != null) {
    const millis =
      typeof args.timestamp === 'number'
        ? args.timestamp
        : new Date(args.timestamp).getTime();
    if (Number.isFinite(millis)) {
      return evaluateTrustFreshnessFromAge(args.freshnessClass, Date.now() - millis);
    }
  }

  return mapTrustFreshnessFromLiveFreshness(args.liveStatus?.freshness);
}

function sourceSubject(source: string): string {
  switch (source) {
    case 'weather':
      return 'weather';
    case 'telemetry':
    case 'resource_status':
      return 'systems';
    case 'route_risk':
    case 'route_viability':
    case 'bailout':
    case 'safety':
      return 'route';
    case 'remoteness':
      return 'location';
    case 'vehicle_assessment':
      return 'vehicle';
    case 'explore':
      return 'trail';
    default:
      return 'context';
  }
}

function buildModeWording(source: string, trust: ECSTrustMetadata): string | null {
  const subject = sourceSubject(source);

  switch (trust.mode) {
    case 'ECS Cached':
      return `Using cached ${subject} context.`;
    case 'ECS Offline Support':
      return `Offline support mode using last-known ${subject} context.`;
    case 'ECS Syncing Context':
      return `Syncing live ${subject} context.`;
    case 'ECS Limited':
      if (trust.sourceBasis === 'Profile') {
        return `Limited live inputs; guidance is based on saved ${subject} profile data.`;
      }
      if (trust.freshness === 'stale') {
        return `Limited live inputs; ${subject} context is stale.`;
      }
      return `Limited live inputs; ${subject} guidance is reduced.`;
    default:
      return null;
  }
}

function hasRouteSupport(richContext: ECSAIContext | null): boolean {
  return !!(
    richContext?.meta.hasActiveRoute ||
    richContext?.meta.hasActiveRun ||
    richContext?.route.activeRoute ||
    richContext?.route.activeRun ||
    richContext?.route.routeIntelligence ||
    richContext?.route.routeContext
  );
}

function hasWeatherSupport(richContext: ECSAIContext | null): boolean {
  return !!(
    richContext?.environment.weather.current ||
    richContext?.environment.weather.response ||
    richContext?.environment.weather.source !== 'none'
  );
}

function hasTelemetrySupport(richContext: ECSAIContext | null): boolean {
  return !!(
    richContext?.resources.providerTelemetry?.usable ||
    richContext?.resources.powerAuthority?.available ||
    richContext?.resources.telemetryReadout ||
    richContext?.resources.forecast
  );
}

function gpsIsLive(richContext: ECSAIContext | null): boolean {
  const status = String(richContext?.environment.gps?.gpsStatus ?? '').trim().toUpperCase();
  return status === 'TRACKING';
}

export function buildTrustMetadata(args: BuildTrustMetadataArgs): ECSTrustMetadata {
  const sourceBasis = mapSourceBasis(args.liveStatus);
  const freshness = resolveTrustFreshness({
    liveStatus: args.liveStatus,
    freshnessClass: args.freshnessClass ?? 'route',
    timestamp: args.timestamp,
  });
  const mode = resolveTrustMode({
    liveStatus: args.liveStatus,
    operationalState: args.operationalState,
    sourceBasis,
  });

  return {
    confidence: mapConfidence(args.confidence),
    sourceBasis,
    freshness,
    freshnessLabel: formatTrustFreshnessLabel(freshness),
    mode,
    explanationSummary: args.explanation?.shortText ?? args.explanation?.text ?? null,
    asOfLabel: formatTrustAgeLabel(args.timestamp),
    decision: 'allow',
    suppressionReason: null,
  };
}

export function gateCandidateTrust(args: GateCandidateArgs): TrustGateResult {
  const routeSupport = hasRouteSupport(args.richContext);
  const telemetrySupport = hasTelemetrySupport(args.richContext);
  const weatherSupport = hasWeatherSupport(args.richContext);
  const gpsLive = gpsIsLive(args.richContext);

  switch (args.source) {
    case 'route_risk':
    case 'route_viability':
    case 'bailout':
    case 'safety':
      if (!routeSupport) {
        return {
          decision: 'suppress',
          reason: 'Route context is unavailable.',
          wording: null,
        };
      }
      if (!gpsLive || args.trust.mode !== 'ECS Live') {
        return {
          decision: 'downgrade',
          reason: !gpsLive ? 'Live GPS is unavailable.' : null,
          wording: buildModeWording(args.source, args.trust),
        };
      }
      return { decision: 'allow', reason: null, wording: null };
    case 'weather':
      if (!weatherSupport) {
        return {
          decision: 'suppress',
          reason: 'Weather context is unavailable.',
          wording: null,
        };
      }
      if (args.trust.freshness !== 'fresh' || args.trust.mode !== 'ECS Live') {
        return {
          decision: 'downgrade',
          reason: args.trust.freshness === 'stale' ? 'Weather support is stale.' : null,
          wording: buildModeWording(args.source, args.trust),
        };
      }
      return { decision: 'allow', reason: null, wording: null };
    case 'telemetry':
    case 'resource_status':
      if (!telemetrySupport) {
        return {
          decision: 'suppress',
          reason: 'Provider and telemetry support are unavailable.',
          wording: null,
        };
      }
      if (args.trust.sourceBasis !== 'Live' || args.trust.mode !== 'ECS Live') {
        return {
          decision: 'downgrade',
          reason: args.trust.sourceBasis !== 'Live' ? 'Live provider state is unavailable.' : null,
          wording: buildModeWording(args.source, args.trust),
        };
      }
      return { decision: 'allow', reason: null, wording: null };
    case 'remoteness':
      if (!routeSupport) {
        return {
          decision: 'suppress',
          reason: 'Location context is unavailable.',
          wording: null,
        };
      }
      if (!gpsLive || args.trust.mode !== 'ECS Live') {
        return {
          decision: 'downgrade',
          reason: !gpsLive ? 'Live GPS is unavailable.' : null,
          wording: buildModeWording(args.source, args.trust),
        };
      }
      return { decision: 'allow', reason: null, wording: null };
    default:
      if (args.trust.mode === 'ECS Live') {
        return { decision: 'allow', reason: null, wording: null };
      }
      return {
        decision: 'downgrade',
        reason: null,
        wording: buildModeWording(args.source, args.trust),
      };
  }
}

export function withTrustDecision(
  trust: ECSTrustMetadata,
  gate: TrustGateResult,
): ECSTrustMetadata {
  return {
    ...trust,
    decision: gate.decision,
    suppressionReason: gate.reason,
  };
}

export function prependTrustWording(
  text: string | null | undefined,
  wording: string | null | undefined,
): string | null {
  const base = String(text ?? '').replace(/\s+/g, ' ').trim();
  const prefix = String(wording ?? '').replace(/\s+/g, ' ').trim();

  if (!base && !prefix) return null;
  if (!prefix) return base || null;
  if (!base) return prefix;
  if (base.toLowerCase().startsWith(prefix.toLowerCase())) return base;
  return `${prefix} ${base}`;
}

export function formatTrustCompactLine(
  trust: ECSTrustMetadata | null | undefined,
): string | null {
  if (!trust) return null;
  return `${trust.confidence} • ${trust.sourceBasis} • ${trust.freshnessLabel} • ${trust.mode}`;
}
