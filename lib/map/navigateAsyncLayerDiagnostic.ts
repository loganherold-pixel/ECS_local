import { ecsLog } from '../ecsLogger';
import type {
  ECSAsyncProviderStatus,
  ECSAsyncSurfaceState,
  ECSAsyncSurfaceStatus,
} from '../state/asyncSurfaceState';
import type { SourceTruthOrigin } from '../sourceTruth';

export type NavigateAsyncLayerEligibility =
  | 'disabled'
  | 'provider_unavailable'
  | 'zoom_deferred'
  | 'viewport_pending'
  | 'offline_cache'
  | 'offline_unavailable'
  | 'vector_tiles'
  | 'eligible';

export type NavigateAsyncLayerRenderDiagnostic = {
  status: 'ready' | 'empty' | 'error' | 'disabled';
  requestFingerprint: string | null;
  requestGeneration: number | null;
  featureCount: number;
  invalidFeatureCount: number;
  safeErrorCode: string | null;
  completedAt: number;
};

export type NavigateAsyncLayerDiagnostic = {
  surfaceId: string;
  enabled: boolean;
  eligibility: NavigateAsyncLayerEligibility;
  zoom: number | null;
  requestFingerprint: string | null;
  requestGeneration: number;
  requestStatus: ECSAsyncSurfaceStatus;
  provider: string | null;
  providerStatus: ECSAsyncProviderStatus;
  source: SourceTruthOrigin;
  featureCount: number;
  invalidFeatureCount: number;
  cacheHit: boolean;
  lastErrorSafeCode: string | null;
  lastCompletedTime: number | null;
  renderStatus: NavigateAsyncLayerRenderDiagnostic['status'] | null;
  renderedFeatureCount: number | null;
};

function finiteNonNegativeInteger(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, Math.trunc(value))
    : 0;
}

export function createNavigateAsyncLayerDiagnostic<T>(args: {
  state: ECSAsyncSurfaceState<T>;
  enabled: boolean;
  eligibility: NavigateAsyncLayerEligibility;
  zoom: number | null | undefined;
  featureCount: number;
  invalidFeatureCount: number;
  cacheHit?: boolean;
  render?: NavigateAsyncLayerRenderDiagnostic | null;
}): NavigateAsyncLayerDiagnostic {
  const renderMatchesRequest = Boolean(
    args.render &&
      args.render.requestFingerprint === args.state.requestFingerprint &&
      args.render.requestGeneration === args.state.generation,
  );
  const matchingRender = renderMatchesRequest ? args.render ?? null : null;

  return {
    surfaceId: args.state.surfaceId,
    enabled: args.enabled,
    eligibility: args.eligibility,
    zoom: typeof args.zoom === 'number' && Number.isFinite(args.zoom) ? args.zoom : null,
    requestFingerprint: args.state.requestFingerprint,
    requestGeneration: args.state.generation,
    requestStatus: args.state.status,
    provider: args.state.provider,
    providerStatus: args.state.providerStatus,
    source: args.state.source,
    featureCount: finiteNonNegativeInteger(args.featureCount),
    invalidFeatureCount: finiteNonNegativeInteger(
      matchingRender?.invalidFeatureCount ?? args.invalidFeatureCount,
    ),
    cacheHit: args.cacheHit ?? args.state.source === 'cached',
    lastErrorSafeCode: matchingRender?.safeErrorCode ?? args.state.safeErrorCode,
    lastCompletedTime: args.state.completedAt,
    renderStatus: matchingRender?.status ?? null,
    renderedFeatureCount: matchingRender == null
      ? null
      : finiteNonNegativeInteger(matchingRender.featureCount),
  };
}

export function logNavigateAsyncLayerDiagnostic(
  diagnostic: NavigateAsyncLayerDiagnostic,
): void {
  if (typeof __DEV__ === 'undefined' || !__DEV__) return;
  ecsLog.dev('SYSTEM', 'navigate_async_layer_diagnostic', diagnostic, {
    debugFlag: 'navigate_async_layer_diagnostic',
    fingerprint: [
      diagnostic.surfaceId,
      diagnostic.requestStatus,
      diagnostic.requestFingerprint ?? 'none',
      diagnostic.renderStatus ?? 'render_none',
      diagnostic.lastErrorSafeCode ?? 'ok',
    ].join(':'),
  });
}
