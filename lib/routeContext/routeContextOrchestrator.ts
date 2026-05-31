import {
  ROUTE_CONTEXT_FRESHNESS_TTLS_MS,
  isRouteContextEngineEnabled,
  isRouteContextFeatureEnabled,
  type RouteContextFeatureFlagOverrides,
} from './routeContextConfig';
import {
  createRouteContextProviderRegistry,
  type RouteContextProviderRegistry,
  type RouteContextProviderRegistryInput,
} from './routeContextAdapters';
import {
  buildFallbackRouteGeometry,
  buildSupplyPlan,
  createIdleRouteContext,
  generateRouteContext,
} from './routeContextEngine';
import type {
  RouteContextProviderBundle,
  RouteContextTrailInput,
} from './routeContextProviders';
import type {
  RouteContext,
  RouteContextCoordinate,
  RouteContextProviderMetadata,
  RouteContextStatus,
  RouteContextWarning,
  SupplyCandidate,
  SupplyMode,
} from './routeContextTypes';
import { UNKNOWN_CONFIDENCE } from './routeContextTypes';
import { resolveTrailheadAnchor } from './trailheadResolver';
import {
  debugRouteContext,
  emitRouteContextTelemetry,
  routeContextConfidenceBucket,
  routeContextDurationBucket,
  routeContextProviderAvailability,
  routeContextTelemetryFromContext,
  routeContextWarningCodes,
} from './routeContextTelemetry';

export type RouteContextOrchestratorArgs = {
  featureFlags?: RouteContextFeatureFlagOverrides;
  providers?: RouteContextProviderBundle | null;
  providerRegistry?: RouteContextProviderRegistry | RouteContextProviderRegistryInput | null;
  ttlMs?: number | null;
  appVersion?: string | null;
  providerVersion?: string | null;
  dateBucket?: string | null;
  now?: () => string;
};

export type RouteContextSelectionArgs = {
  trail: RouteContextTrailInput;
  tripId?: string | null;
  userId?: string | null;
  origin?: RouteContextCoordinate | null;
  selectedSupplyMode?: SupplyMode | null;
  selectedRefuelCandidateId?: string | null;
  selectedResupplyCandidateId?: string | null;
  selectedSupplyCandidateIds?: string[] | null;
  featureFlags?: RouteContextFeatureFlagOverrides;
  providers?: RouteContextProviderBundle | null;
  providerRegistry?: RouteContextProviderRegistry | RouteContextProviderRegistryInput | null;
  ttlMs?: number | null;
  providerVersion?: string | null;
  dateBucket?: string | null;
};

export type RouteContextLookupArgs = {
  trailId: string;
  tripId?: string | null;
  origin?: RouteContextCoordinate | null;
  selectedSupplyMode?: SupplyMode | null;
  selectedRefuelCandidateId?: string | null;
  selectedResupplyCandidateId?: string | null;
  selectedSupplyCandidateIds?: string[] | null;
  trail?: RouteContextTrailInput | null;
  featureFlags?: RouteContextFeatureFlagOverrides;
  providers?: RouteContextProviderBundle | null;
  providerRegistry?: RouteContextProviderRegistry | RouteContextProviderRegistryInput | null;
  ttlMs?: number | null;
  providerVersion?: string | null;
  dateBucket?: string | null;
};

export type RouteContextCancelArgs = {
  trailId: string;
  tripId?: string | null;
  origin?: RouteContextCoordinate | null;
  selectedSupplyMode?: SupplyMode | null;
  selectedRefuelCandidateId?: string | null;
  selectedResupplyCandidateId?: string | null;
  selectedSupplyCandidateIds?: string[] | null;
  providerVersion?: string | null;
  dateBucket?: string | null;
};

export type RouteContextJobSnapshot = {
  key: string;
  status: RouteContextStatus;
  context: RouteContext;
  updatedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  generation: number;
  inFlight: boolean;
  error: string | null;
};

type RouteContextCacheEntry = RouteContextJobSnapshot & {
  promise: Promise<RouteContext> | null;
  cancelled: boolean;
  lastUsableContext: RouteContext | null;
};

const DEFAULT_APP_VERSION = 'route-context-v1';
const DEFAULT_PROVIDER_VERSION = 'providers-v1';

function routeContextWarning(
  code: RouteContextWarning['code'],
  message: string,
  severity: RouteContextWarning['severity'] = 'watch',
  source?: string | null,
): RouteContextWarning {
  return { code, message, severity, source };
}

function nowIso(now?: () => string): string {
  return now?.() ?? new Date().toISOString();
}

function stableCoordinateKey(coordinate?: RouteContextCoordinate | null): string {
  if (!coordinate) return 'origin:none';
  if (!Number.isFinite(coordinate.lat) || !Number.isFinite(coordinate.lng)) return 'origin:invalid';
  return `origin:${coordinate.lat.toFixed(2)},${coordinate.lng.toFixed(2)}`;
}

function stableTextKey(value?: string | null, fallback = 'none'): string {
  const text = String(value ?? '').trim().toLowerCase();
  return text ? text.replace(/[^a-z0-9_.:-]/g, '_').slice(0, 48) : fallback;
}

function stableSelectedSupplyKey(args: {
  selectedRefuelCandidateId?: string | null;
  selectedResupplyCandidateId?: string | null;
  selectedSupplyCandidateIds?: string[] | null;
}): string {
  const ids = [
    args.selectedRefuelCandidateId ? `gas:${args.selectedRefuelCandidateId}` : null,
    args.selectedResupplyCandidateId ? `grocery:${args.selectedResupplyCandidateId}` : null,
    ...(args.selectedSupplyCandidateIds ?? []),
  ]
    .map((id) => String(id ?? '').trim().toLowerCase())
    .filter(Boolean)
    .sort();
  return ids.length > 0 ? `selected:${ids.map((id) => stableTextKey(id)).join(',')}` : 'selected:none';
}

function contextKey(args: {
  trailId: string;
  tripId?: string | null;
  origin?: RouteContextCoordinate | null;
  selectedSupplyMode?: SupplyMode | null;
  selectedRefuelCandidateId?: string | null;
  selectedResupplyCandidateId?: string | null;
  selectedSupplyCandidateIds?: string[] | null;
  appVersion?: string | null;
  providerVersion?: string | null;
  dateBucket?: string | null;
}): string {
  return [
    'route-context',
    String(args.trailId || 'unknown-trail'),
    args.tripId ? `trip:${args.tripId}` : 'trip:none',
    stableCoordinateKey(args.origin),
    `supply:${args.selectedSupplyMode ?? 'none'}`,
    stableSelectedSupplyKey(args),
    args.appVersion ?? DEFAULT_APP_VERSION,
    `provider:${stableTextKey(args.providerVersion, DEFAULT_PROVIDER_VERSION)}`,
    `date:${stableTextKey(args.dateBucket)}`,
  ].join('|');
}

function mergeTrailSelection(args: RouteContextSelectionArgs): RouteContextTrailInput {
  return {
    ...args.trail,
    tripId: args.tripId ?? args.trail.tripId ?? null,
    userId: args.userId ?? args.trail.userId ?? null,
    origin: args.origin ?? args.trail.origin ?? null,
  };
}

function minimalTrail(args: RouteContextLookupArgs | RouteContextCancelArgs): RouteContextTrailInput {
  return {
    id: args.trailId,
    tripId: args.tripId ?? null,
    origin: args.origin ?? null,
  };
}

function providerBundleFromRegistry(
  providers?: RouteContextProviderBundle | null,
  registry?: RouteContextProviderRegistry | RouteContextProviderRegistryInput | null,
): RouteContextProviderBundle {
  if (providers) return providers;
  if (!registry) return {};
  if ('toProviderBundle' in registry && typeof registry.toProviderBundle === 'function') {
    return registry.toProviderBundle();
  }
  return createRouteContextProviderRegistry(registry).toProviderBundle();
}

function sanitizeProviderMetadata(
  providers: RouteContextProviderBundle,
  metadata?: RouteContextProviderMetadata | null,
): RouteContextProviderMetadata {
  return {
    ...(metadata ?? {}),
    providers: {
      supply: providers.supplyProvider?.id ?? null,
      geometry: providers.geometryProvider?.id ?? null,
      camp: providers.campProvider?.id ?? null,
      bailout: providers.bailoutProvider?.id ?? null,
    },
  };
}

function expiresAt(createdAt: string, ttlMs: number): string | null {
  const parsed = Date.parse(createdAt);
  if (!Number.isFinite(parsed) || ttlMs <= 0) return null;
  return new Date(parsed + ttlMs).toISOString();
}

function appendUniqueWarning(context: RouteContext, warning: RouteContextWarning): RouteContext {
  if (context.warnings.some((item) => item.code === warning.code && item.message === warning.message)) {
    return context;
  }
  return {
    ...context,
    warnings: [...context.warnings, warning],
  };
}

function isUsableContext(context: RouteContext | null | undefined): context is RouteContext {
  return !!context && (context.status === 'ready' || context.status === 'partial' || context.status === 'stale');
}

function contextHasProviderFailure(context: RouteContext): boolean {
  return context.status === 'error' || context.warnings.some((warning) => warning.code === 'provider_unavailable');
}

function resolveContextTtlMs(context: RouteContext, overrideTtlMs?: number | null): number {
  if (overrideTtlMs != null && overrideTtlMs > 0) return overrideTtlMs;
  if (contextHasProviderFailure(context)) return ROUTE_CONTEXT_FRESHNESS_TTLS_MS.providerErrorRetry;
  const ttlCandidates = [ROUTE_CONTEXT_FRESHNESS_TTLS_MS.trailheadAnchor];
  if (context.selectedSupplyMode && context.selectedSupplyMode !== 'none') {
    ttlCandidates.push(ROUTE_CONTEXT_FRESHNESS_TTLS_MS.supplyCandidates);
  }
  if (context.routeGeometry) {
    ttlCandidates.push(
      context.origin || context.selectedSupplyMode !== 'none'
        ? ROUTE_CONTEXT_FRESHNESS_TTLS_MS.routeGeometryWithOrigin
        : ROUTE_CONTEXT_FRESHNESS_TTLS_MS.routeGeometryTrailOnly,
    );
  }
  ttlCandidates.push(ROUTE_CONTEXT_FRESHNESS_TTLS_MS.defaultContext);
  return Math.min(...ttlCandidates);
}

function withFreshnessExpiry(context: RouteContext, ttlMs?: number | null): RouteContext {
  const resolvedTtlMs = resolveContextTtlMs(context, ttlMs);
  return {
    ...context,
    expiresAt: context.expiresAt ?? expiresAt(context.createdAt, resolvedTtlMs),
    providerMetadata: {
      ...(context.providerMetadata ?? {}),
      freshness: {
        ttlMs: resolvedTtlMs,
      },
    },
  };
}

function isExpired(context: RouteContext, now: string): boolean {
  if (!context.expiresAt) return false;
  const expires = Date.parse(context.expiresAt);
  const current = Date.parse(now);
  return Number.isFinite(expires) && Number.isFinite(current) && expires <= current;
}

function durationMsSince(startedAt: string | null | undefined, now: string): number | null {
  if (!startedAt) return null;
  const start = Date.parse(startedAt);
  const end = Date.parse(now);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  return Math.max(0, end - start);
}

function cloneContext(context: RouteContext): RouteContext {
  return {
    ...context,
    trailheadAnchor: {
      ...context.trailheadAnchor,
      warnings: [...context.trailheadAnchor.warnings],
      providerMetadata: context.trailheadAnchor.providerMetadata ? { ...context.trailheadAnchor.providerMetadata } : null,
    },
    supplyCandidates: context.supplyCandidates.map((candidate) => ({
      ...candidate,
      warnings: [...candidate.warnings],
      providerMetadata: candidate.providerMetadata ? { ...candidate.providerMetadata } : null,
    })),
    selectedSupplyPlan: context.selectedSupplyPlan
      ? {
          ...context.selectedSupplyPlan,
          orderedStops: [...context.selectedSupplyPlan.orderedStops],
          warnings: [...context.selectedSupplyPlan.warnings],
        }
      : null,
    routeGeometry: context.routeGeometry
      ? {
          ...context.routeGeometry,
          waypoints: [...context.routeGeometry.waypoints],
          coordinates: context.routeGeometry.coordinates ? [...context.routeGeometry.coordinates] : null,
          segments: [...context.routeGeometry.segments],
          providerMetadata: context.routeGeometry.providerMetadata ? { ...context.routeGeometry.providerMetadata } : null,
        }
      : null,
    campCandidates: context.campCandidates.map((candidate) => ({
      ...candidate,
      warnings: [...candidate.warnings],
      providerMetadata: candidate.providerMetadata ? { ...candidate.providerMetadata } : null,
    })),
    bailoutCandidates: context.bailoutCandidates.map((candidate) => ({
      ...candidate,
      warnings: [...candidate.warnings],
      providerMetadata: candidate.providerMetadata ? { ...candidate.providerMetadata } : null,
    })),
    warnings: [...context.warnings],
    providerMetadata: context.providerMetadata ? { ...context.providerMetadata } : null,
  };
}

export class RouteContextOrchestrator {
  private cache = new Map<string, RouteContextCacheEntry>();

  private generation = 0;

  constructor(private readonly defaults: RouteContextOrchestratorArgs = {}) {}

  buildContextKey(args: RouteContextLookupArgs | RouteContextSelectionArgs | RouteContextCancelArgs): string {
    const trail = 'trail' in args ? args.trail : null;
    const trailId = trail?.id ?? ('trailId' in args ? args.trailId : 'unknown-trail');
    return contextKey({
      trailId,
      tripId: args.tripId ?? trail?.tripId ?? null,
      origin: args.origin ?? trail?.origin ?? null,
      selectedSupplyMode: args.selectedSupplyMode,
      selectedRefuelCandidateId: args.selectedRefuelCandidateId,
      selectedResupplyCandidateId: args.selectedResupplyCandidateId,
      selectedSupplyCandidateIds: args.selectedSupplyCandidateIds,
      appVersion: this.defaults.appVersion,
      providerVersion: args.providerVersion ?? this.defaults.providerVersion,
      dateBucket: args.dateBucket ?? this.defaults.dateBucket,
    });
  }

  prefetchForTrailSelection(args: RouteContextSelectionArgs): Promise<RouteContext> {
    const featureFlags = args.featureFlags ?? this.defaults.featureFlags;
    const trail = mergeTrailSelection(args);
    if (!isRouteContextEngineEnabled(featureFlags)) {
      return Promise.resolve(createIdleRouteContext(trail, nowIso(this.defaults.now)));
    }
    if (!isRouteContextFeatureEnabled('ecs.routeContextEngine.prefetchOnTrailSelect', featureFlags)) {
      return Promise.resolve(this.getCachedOrIdle({
        trailId: trail.id,
        tripId: trail.tripId,
        origin: trail.origin,
        selectedSupplyMode: args.selectedSupplyMode,
        selectedRefuelCandidateId: args.selectedRefuelCandidateId,
        selectedResupplyCandidateId: args.selectedResupplyCandidateId,
        selectedSupplyCandidateIds: args.selectedSupplyCandidateIds,
        featureFlags,
        providers: args.providers,
        providerRegistry: args.providerRegistry,
        ttlMs: args.ttlMs,
        providerVersion: args.providerVersion,
        dateBucket: args.dateBucket,
      }));
    }
    const key = this.buildContextKey({
      trail,
      tripId: trail.tripId,
      origin: trail.origin,
      selectedSupplyMode: args.selectedSupplyMode,
      selectedRefuelCandidateId: args.selectedRefuelCandidateId,
      selectedResupplyCandidateId: args.selectedResupplyCandidateId,
      selectedSupplyCandidateIds: args.selectedSupplyCandidateIds,
      providerVersion: args.providerVersion,
      dateBucket: args.dateBucket,
    });
    this.cancelInFlightJobsExcept(key);
    return this.startJob({
      trail,
      tripId: trail.tripId,
      userId: trail.userId,
      origin: trail.origin,
      selectedSupplyMode: args.selectedSupplyMode,
      selectedRefuelCandidateId: args.selectedRefuelCandidateId,
      selectedResupplyCandidateId: args.selectedResupplyCandidateId,
      selectedSupplyCandidateIds: args.selectedSupplyCandidateIds,
      featureFlags,
      providers: args.providers,
      providerRegistry: args.providerRegistry,
      ttlMs: args.ttlMs,
      providerVersion: args.providerVersion,
      dateBucket: args.dateBucket,
    }, false);
  }

  getContext(args: RouteContextLookupArgs): RouteContext {
    const featureFlags = args.featureFlags ?? this.defaults.featureFlags;
    const trail = args.trail ?? minimalTrail(args);
    if (!isRouteContextEngineEnabled(featureFlags)) {
      return createIdleRouteContext(trail, nowIso(this.defaults.now));
    }

    const key = this.buildContextKey(args);
    const entry = this.cache.get(key) ?? this.findCompatibleEntry(args);
    if (!entry) {
      if (args.trail) {
        void this.startJob({
          trail,
          tripId: args.tripId ?? trail.tripId,
          origin: args.origin ?? trail.origin,
          selectedSupplyMode: args.selectedSupplyMode,
          selectedRefuelCandidateId: args.selectedRefuelCandidateId,
          selectedResupplyCandidateId: args.selectedResupplyCandidateId,
          selectedSupplyCandidateIds: args.selectedSupplyCandidateIds,
          featureFlags,
          providers: args.providers,
          providerRegistry: args.providerRegistry,
          ttlMs: args.ttlMs,
          providerVersion: args.providerVersion,
          dateBucket: args.dateBucket,
        }, false).catch(() => {});
        return cloneContext(this.cache.get(key)?.context ?? this.contextForStatus(trail, args.selectedSupplyMode, 'queued', nowIso(this.defaults.now)));
      }
      return createIdleRouteContext(trail, nowIso(this.defaults.now));
    }

    const now = nowIso(this.defaults.now);
    const expired = isExpired(entry.context, now);
    if (expired) {
      const staleContext = appendUniqueWarning(
        {
          ...entry.context,
          status: 'stale' as const,
          updatedAt: now,
        },
        routeContextWarning('stale_cached_context', 'Route context cache is stale; refresh when providers are available.', 'watch'),
      );
      if (entry.status !== 'stale') {
        this.updateEntry(entry.key, staleContext, 'stale', entry.generation, false, entry.error);
      }
      emitRouteContextTelemetry('route_context_cache_stale', routeContextTelemetryFromContext(staleContext, {
        cacheState: 'stale',
        durationMs: durationMsSince(entry.startedAt, now),
      }));
      debugRouteContext(featureFlags, 'route_context_cache_stale', {
        trailId: staleContext.trailId,
        tripId: staleContext.tripId,
        status: staleContext.status,
        warnings: routeContextWarningCodes(staleContext.warnings),
        cacheState: 'stale',
      });
      if (args.trail && !entry.inFlight) {
        void this.startJob({
          trail,
          tripId: args.tripId ?? trail.tripId,
          origin: args.origin ?? trail.origin,
          selectedSupplyMode: args.selectedSupplyMode,
          selectedRefuelCandidateId: args.selectedRefuelCandidateId,
          selectedResupplyCandidateId: args.selectedResupplyCandidateId,
          selectedSupplyCandidateIds: args.selectedSupplyCandidateIds,
          featureFlags,
          providers: args.providers,
          providerRegistry: args.providerRegistry,
          ttlMs: args.ttlMs,
          providerVersion: args.providerVersion,
          dateBucket: args.dateBucket,
        }, true).catch(() => {});
      }
      return cloneContext(staleContext);
    }

    emitRouteContextTelemetry('route_context_cache_hit', routeContextTelemetryFromContext(entry.context, {
      cacheState: entry.inFlight ? 'refreshing' : 'hit',
      durationMs: durationMsSince(entry.startedAt, now),
    }));
    debugRouteContext(featureFlags, 'route_context_cache_hit', {
      trailId: entry.context.trailId,
      tripId: entry.context.tripId,
      status: entry.context.status,
      cacheState: entry.inFlight ? 'refreshing' : 'hit',
      warnings: routeContextWarningCodes(entry.context.warnings),
    });
    return cloneContext(entry.context);
  }

  refreshContext(args: RouteContextLookupArgs): Promise<RouteContext> {
    const trail = args.trail ?? minimalTrail(args);
    return this.startJob({
      trail,
      tripId: args.tripId ?? trail.tripId,
      origin: args.origin ?? trail.origin,
      selectedSupplyMode: args.selectedSupplyMode,
      selectedRefuelCandidateId: args.selectedRefuelCandidateId,
      selectedResupplyCandidateId: args.selectedResupplyCandidateId,
      selectedSupplyCandidateIds: args.selectedSupplyCandidateIds,
      featureFlags: args.featureFlags,
      providers: args.providers,
      providerRegistry: args.providerRegistry,
      ttlMs: args.ttlMs,
      providerVersion: args.providerVersion,
      dateBucket: args.dateBucket,
    }, true);
  }

  cancelContextJob(args: RouteContextCancelArgs): void {
    const exactKey = this.buildContextKey(args);
    const trailToken = `|${String(args.trailId || 'unknown-trail')}|`;
    const tripToken = args.tripId ? `|trip:${args.tripId}|` : null;
    this.cache.forEach((entry, key) => {
      const matchesExact = key === exactKey;
      const matchesTrail = key.includes(trailToken) && (!tripToken || key.includes(tripToken));
      const shouldCancelBroadly = args.origin == null && args.selectedSupplyMode == null && matchesTrail;
      if (!matchesExact && !shouldCancelBroadly) return;
      this.cache.set(key, { ...entry, cancelled: true, inFlight: false, promise: null });
      emitRouteContextTelemetry('route_context_job_cancelled', routeContextTelemetryFromContext(entry.context, {
        cacheState: 'cancelled',
        durationMs: durationMsSince(entry.startedAt, nowIso(this.defaults.now)),
      }));
      debugRouteContext(this.defaults.featureFlags, 'route_context_job_cancelled', {
        trailId: entry.context.trailId,
        tripId: entry.context.tripId,
        status: entry.context.status,
        cacheState: 'cancelled',
      });
    });
  }

  getJobSnapshot(args: RouteContextLookupArgs): RouteContextJobSnapshot | null {
    const entry = this.cache.get(this.buildContextKey(args)) ?? this.findCompatibleEntry(args);
    if (!entry) return null;
    const { promise: _promise, cancelled: _cancelled, lastUsableContext: _lastUsableContext, ...snapshot } = entry;
    return { ...snapshot, context: cloneContext(snapshot.context) };
  }

  clearMemoryCache(): void {
    this.cache.clear();
  }

  private getCachedOrIdle(args: RouteContextLookupArgs): RouteContext {
    return this.getContext(args);
  }

  private findCompatibleEntry(args: RouteContextLookupArgs): RouteContextCacheEntry | null {
    if (args.origin) return null;
    const trailToken = `|${String(args.trailId || 'unknown-trail')}|`;
    const tripToken = args.tripId ? `|trip:${args.tripId}|` : null;
    const supplyToken = `|supply:${args.selectedSupplyMode ?? 'none'}|`;
    const selectedToken = `|${stableSelectedSupplyKey(args)}|`;
    const providerToken = `|provider:${stableTextKey(args.providerVersion ?? this.defaults.providerVersion, DEFAULT_PROVIDER_VERSION)}|`;
    const dateToken = `|date:${stableTextKey(args.dateBucket ?? this.defaults.dateBucket)}`;
    let newest: RouteContextCacheEntry | null = null;
    this.cache.forEach((entry, key) => {
      if (!key.includes(trailToken)) return;
      if (tripToken && !key.includes(tripToken)) return;
      if (!key.includes(supplyToken)) return;
      if (!key.includes(selectedToken)) return;
      if (!key.includes(providerToken)) return;
      if (!key.includes(dateToken)) return;
      if (!newest || Date.parse(entry.updatedAt) >= Date.parse(newest.updatedAt)) newest = entry;
    });
    return newest;
  }

  private cancelInFlightJobsExcept(activeKey: string): void {
    this.cache.forEach((entry, key) => {
      if (key === activeKey || !entry.inFlight) return;
      this.cache.set(key, { ...entry, cancelled: true, inFlight: false, promise: null });
      emitRouteContextTelemetry('route_context_job_cancelled', routeContextTelemetryFromContext(entry.context, {
        cacheState: 'cancelled',
        durationMs: durationMsSince(entry.startedAt, nowIso(this.defaults.now)),
      }));
      debugRouteContext(this.defaults.featureFlags, 'route_context_job_cancelled', {
        trailId: entry.context.trailId,
        tripId: entry.context.tripId,
        status: entry.context.status,
        cacheState: 'cancelled',
      });
    });
  }

  private startJob(args: RouteContextSelectionArgs, force: boolean): Promise<RouteContext> {
    const featureFlags = args.featureFlags ?? this.defaults.featureFlags;
    const trail = mergeTrailSelection(args);
    if (!isRouteContextEngineEnabled(featureFlags)) {
      return Promise.resolve(createIdleRouteContext(trail, nowIso(this.defaults.now)));
    }

    const key = this.buildContextKey({
      trail,
      tripId: trail.tripId,
      origin: trail.origin,
      selectedSupplyMode: args.selectedSupplyMode,
      selectedRefuelCandidateId: args.selectedRefuelCandidateId,
      selectedResupplyCandidateId: args.selectedResupplyCandidateId,
      selectedSupplyCandidateIds: args.selectedSupplyCandidateIds,
      providerVersion: args.providerVersion,
      dateBucket: args.dateBucket,
    });
    const existing = this.cache.get(key);
    const now = nowIso(this.defaults.now);
    if (!force && existing?.inFlight && existing.promise) return existing.promise;
    if (!force && existing && isUsableContext(existing.context) && !isExpired(existing.context, now)) {
      return Promise.resolve(cloneContext(existing.context));
    }

    if (existing?.inFlight) {
      this.cache.set(key, { ...existing, cancelled: true, inFlight: false, promise: null });
    }

    const lastUsableContext = isUsableContext(existing?.context)
      ? cloneContext(existing.context)
      : existing?.lastUsableContext
        ? cloneContext(existing.lastUsableContext)
        : null;
    const generation = ++this.generation;
    const startedAt = now;
    const queuedContext = lastUsableContext
      ? appendUniqueWarning(
          {
            ...lastUsableContext,
            status: 'stale' as const,
            updatedAt: startedAt,
          },
          routeContextWarning('stale_cached_context', 'Route context refresh is running; last usable context is being retained.', 'info'),
        )
      : this.contextForStatus(trail, args.selectedSupplyMode, 'queued', startedAt);
    const entry: RouteContextCacheEntry = {
      key,
      status: queuedContext.status,
      context: queuedContext,
      updatedAt: startedAt,
      startedAt,
      finishedAt: null,
      generation,
      inFlight: true,
      error: null,
      promise: null,
      cancelled: false,
      lastUsableContext,
    };
    this.cache.set(key, entry);
    const providersForTelemetry = providerBundleFromRegistry(
      args.providers ?? this.defaults.providers,
      args.providerRegistry ?? this.defaults.providerRegistry,
    );
    emitRouteContextTelemetry('route_context_prefetch_started', {
      trailId: trail.id,
      tripId: trail.tripId ?? null,
      supplyMode: args.selectedSupplyMode ?? null,
      status: queuedContext.status,
      confidenceBucket: routeContextConfidenceBucket(queuedContext.confidence),
      supplyCandidateCount: queuedContext.supplyCandidates.length,
      campCandidateCount: queuedContext.campCandidates.length,
      bailoutCandidateCount: queuedContext.bailoutCandidates.length,
      durationBucket: null,
      cacheState: lastUsableContext ? 'refreshing' : 'miss',
      warningCodes: routeContextWarningCodes(queuedContext.warnings),
      providers: routeContextProviderAvailability(providersForTelemetry),
    });
    debugRouteContext(featureFlags, 'route_context_prefetch_started', {
      trailId: trail.id,
      tripId: trail.tripId ?? null,
      supplyMode: args.selectedSupplyMode ?? null,
      status: queuedContext.status,
      cacheState: lastUsableContext ? 'refreshing' : 'miss',
      providers: routeContextProviderAvailability(providersForTelemetry),
    });

    const promise = this.runJob(key, generation, args, trail)
      .catch((error) => {
        const failedAt = nowIso(this.defaults.now);
        const fallbackContext = this.cache.get(key)?.lastUsableContext ?? lastUsableContext;
        const errorContext = appendUniqueWarning({
          ...(fallbackContext ?? this.contextForStatus(trail, args.selectedSupplyMode, 'error', failedAt)),
          status: 'error' as const,
          updatedAt: failedAt,
          providerMetadata: {
            ...(fallbackContext?.providerMetadata ?? {}),
            error: error instanceof Error ? error.message : String(error),
            cacheFallbackUsed: fallbackContext != null,
          },
        }, routeContextWarning('provider_unavailable', 'Route context generation failed and existing Trip Builder flow should continue.', 'watch'));
        this.updateEntry(key, errorContext, 'error', generation, false, errorContext.providerMetadata?.error as string);
        emitRouteContextTelemetry('route_context_error', routeContextTelemetryFromContext(errorContext, {
          cacheState: fallbackContext ? 'fallback' : 'miss',
          durationMs: durationMsSince(startedAt, failedAt),
          providers: routeContextProviderAvailability(providersForTelemetry),
        }));
        debugRouteContext(featureFlags, 'route_context_error', {
          trailId: errorContext.trailId,
          tripId: errorContext.tripId,
          status: errorContext.status,
          cacheFallbackUsed: fallbackContext != null,
          warnings: routeContextWarningCodes(errorContext.warnings),
          providerError: true,
        });
        return cloneContext(errorContext);
      });

    const current = this.cache.get(key);
    this.cache.set(key, { ...(current ?? entry), promise });
    return promise;
  }

  private async runJob(
    key: string,
    generation: number,
    args: RouteContextSelectionArgs,
    trail: RouteContextTrailInput,
  ): Promise<RouteContext> {
    const ttlMs = args.ttlMs ?? this.defaults.ttlMs ?? null;
    const providers = providerBundleFromRegistry(
      args.providers ?? this.defaults.providers,
      args.providerRegistry ?? this.defaults.providerRegistry,
    );
    const featureFlags = args.featureFlags ?? this.defaults.featureFlags;
    const providerAvailability = routeContextProviderAvailability(providers);

    const resolvingAt = nowIso(this.defaults.now);
    const anchor = resolveTrailheadAnchor(trail);
    const resolvingContext = this.contextForStatus(trail, args.selectedSupplyMode, 'resolving_trailhead', resolvingAt);
    resolvingContext.trailheadAnchor = anchor;
    resolvingContext.warnings = [...anchor.warnings];
    resolvingContext.providerMetadata = sanitizeProviderMetadata(providers, { phase: 'resolving_trailhead' });
    if (!this.updateEntry(key, resolvingContext, 'resolving_trailhead', generation, true, null)) return resolvingContext;
    emitRouteContextTelemetry('route_context_trailhead_resolved', routeContextTelemetryFromContext(resolvingContext, {
      cacheState: 'miss',
      durationMs: durationMsSince(this.cache.get(key)?.startedAt, resolvingAt),
      providers: providerAvailability,
    }));
    debugRouteContext(featureFlags, 'route_context_trailhead_resolved', {
      trailId: trail.id,
      tripId: trail.tripId ?? null,
      status: resolvingContext.status,
      trailheadSource: anchor.source,
      trailheadConfidence: routeContextConfidenceBucket(anchor.confidence),
      warnings: routeContextWarningCodes(resolvingContext.warnings),
    });

    const supplyMode = args.selectedSupplyMode ?? 'none';
    const selectedSupplyCandidateIds = Array.from(new Set([
      args.selectedRefuelCandidateId,
      args.selectedResupplyCandidateId,
      ...(args.selectedSupplyCandidateIds ?? []),
    ].map((id) => String(id ?? '').trim()).filter(Boolean)));
    let supplyCandidates: SupplyCandidate[] = [];
    if (supplyMode !== 'none') {
      const supplyAt = nowIso(this.defaults.now);
      const supplyContext = {
        ...resolvingContext,
        status: 'finding_supplies' as const,
        updatedAt: supplyAt,
        providerMetadata: sanitizeProviderMetadata(providers, { phase: 'finding_supplies' }),
      };
      this.updateEntry(key, supplyContext, 'finding_supplies', generation, true, null);
      if (providers.supplyProvider && anchor.source !== 'unknown') {
        try {
          supplyCandidates = await providers.supplyProvider.findSupplyCandidates({
            trailId: trail.id,
            trailheadAnchor: anchor,
            mode: supplyMode,
            origin: trail.origin ?? null,
            trailheadAnchoredSupplyChain: isRouteContextFeatureEnabled(
              'ecs.routeContextEngine.trailheadAnchoredSupplyChain',
              featureFlags,
            ),
            selectedRefuelCandidateId: args.selectedRefuelCandidateId ?? null,
            selectedResupplyCandidateId: args.selectedResupplyCandidateId ?? null,
            selectedSupplyCandidateIds,
          });
        } catch {
          resolvingContext.warnings.push(routeContextWarning('provider_unavailable', 'Supply provider was unavailable.', 'watch', providers.supplyProvider.id));
        }
      } else {
        resolvingContext.warnings.push(routeContextWarning('provider_unavailable', 'No supply provider is configured for route context generation.', 'info'));
      }
      emitRouteContextTelemetry('route_context_supply_candidates_found', {
        trailId: trail.id,
        tripId: trail.tripId ?? null,
        supplyMode,
        status: 'finding_supplies',
        confidenceBucket: routeContextConfidenceBucket(resolvingContext.confidence),
        supplyCandidateCount: supplyCandidates.length,
        campCandidateCount: 0,
        bailoutCandidateCount: 0,
        durationBucket: routeContextDurationBucket(durationMsSince(this.cache.get(key)?.startedAt, nowIso(this.defaults.now))),
        cacheState: 'miss',
        warningCodes: routeContextWarningCodes(resolvingContext.warnings),
        providers: providerAvailability,
      });
      debugRouteContext(featureFlags, 'route_context_supply_candidates_found', {
        trailId: trail.id,
        tripId: trail.tripId ?? null,
        supplyMode,
        supplyCandidateCount: supplyCandidates.length,
        warnings: routeContextWarningCodes(resolvingContext.warnings),
      });
    }

    const geometryAt = nowIso(this.defaults.now);
    const geometryContext = {
      ...resolvingContext,
      status: 'building_geometry' as const,
      selectedSupplyMode: supplyMode,
      supplyCandidates,
      selectedSupplyPlan: buildSupplyPlan(supplyMode, supplyCandidates, selectedSupplyCandidateIds),
      updatedAt: geometryAt,
      providerMetadata: sanitizeProviderMetadata(providers, { phase: 'building_geometry' }),
    };
    if (!this.updateEntry(key, geometryContext, 'building_geometry', generation, true, null)) return geometryContext;

    const finalContext = await generateRouteContext({
      trail,
      selectedSupplyMode: supplyMode,
      providers,
      providerRegistry: args.providerRegistry ?? this.defaults.providerRegistry ?? null,
      featureFlags: args.featureFlags ?? this.defaults.featureFlags,
      selectedRefuelCandidateId: args.selectedRefuelCandidateId ?? null,
      selectedResupplyCandidateId: args.selectedResupplyCandidateId ?? null,
      selectedSupplyCandidateIds,
      now: nowIso(this.defaults.now),
      ttlMs,
    });
    const geometryReadyAt = nowIso(this.defaults.now);
    if (finalContext.routeGeometry) {
      emitRouteContextTelemetry('route_context_geometry_ready', routeContextTelemetryFromContext(finalContext, {
        cacheState: 'miss',
        durationMs: durationMsSince(this.cache.get(key)?.startedAt, geometryReadyAt),
        providers: providerAvailability,
      }));
      debugRouteContext(featureFlags, 'route_context_geometry_ready', {
        trailId: finalContext.trailId,
        tripId: finalContext.tripId,
        status: finalContext.status,
        routeDistanceBucket: finalContext.routeGeometry.distanceMeters == null
          ? 'unknown'
          : finalContext.routeGeometry.distanceMeters < 10_000
            ? 'lt_10km'
            : finalContext.routeGeometry.distanceMeters < 100_000
              ? '10km_100km'
              : 'gte_100km',
        routeDurationBucket: routeContextDurationBucket((finalContext.routeGeometry.durationSeconds ?? 0) * 1000),
        warnings: routeContextWarningCodes(finalContext.warnings),
      });
    }
    const existing = this.cache.get(key);
    const lastUsableContext = existing?.lastUsableContext ?? null;
    if (lastUsableContext && contextHasProviderFailure(finalContext)) {
      const fallbackContext = withFreshnessExpiry(
        appendUniqueWarning(
          {
            ...lastUsableContext,
            status: 'stale' as const,
            updatedAt: nowIso(this.defaults.now),
            providerMetadata: sanitizeProviderMetadata(providers, {
              ...(lastUsableContext.providerMetadata ?? {}),
              phase: 'stale',
              cacheFallbackUsed: true,
            }),
          },
          routeContextWarning('provider_unavailable', 'Route context refresh failed; keeping the last usable context.', 'watch'),
        ),
        ROUTE_CONTEXT_FRESHNESS_TTLS_MS.providerErrorRetry,
      );
      this.updateEntry(key, fallbackContext, 'stale', generation, false, 'provider_unavailable');
      emitRouteContextTelemetry('route_context_error', routeContextTelemetryFromContext(fallbackContext, {
        cacheState: 'fallback',
        durationMs: durationMsSince(existing?.startedAt, nowIso(this.defaults.now)),
        providers: providerAvailability,
      }));
      emitRouteContextTelemetry('route_context_partial', routeContextTelemetryFromContext(fallbackContext, {
        cacheState: 'fallback',
        durationMs: durationMsSince(existing?.startedAt, nowIso(this.defaults.now)),
        providers: providerAvailability,
      }));
      debugRouteContext(featureFlags, 'route_context_provider_failure_fallback', {
        trailId: fallbackContext.trailId,
        tripId: fallbackContext.tripId,
        status: fallbackContext.status,
        cacheFallbackUsed: true,
        warnings: routeContextWarningCodes(fallbackContext.warnings),
      });
      return cloneContext(fallbackContext);
    }
    const nextContext = withFreshnessExpiry({
      ...finalContext,
      providerMetadata: sanitizeProviderMetadata(providers, {
        ...(finalContext.providerMetadata ?? {}),
        phase: finalContext.status,
      }),
    }, ttlMs);
    this.updateEntry(key, nextContext, nextContext.status, generation, false, null);
    if (contextHasProviderFailure(nextContext)) {
      emitRouteContextTelemetry('route_context_error', routeContextTelemetryFromContext(nextContext, {
        cacheState: 'miss',
        durationMs: durationMsSince(existing?.startedAt, nowIso(this.defaults.now)),
        providers: providerAvailability,
      }));
    }
    emitRouteContextTelemetry(
      nextContext.status === 'ready' ? 'route_context_ready' : 'route_context_partial',
      routeContextTelemetryFromContext(nextContext, {
        cacheState: 'miss',
        durationMs: durationMsSince(existing?.startedAt, nowIso(this.defaults.now)),
        providers: providerAvailability,
      }),
    );
    debugRouteContext(featureFlags, nextContext.status === 'ready' ? 'route_context_ready' : 'route_context_partial', {
      trailId: nextContext.trailId,
      tripId: nextContext.tripId,
      status: nextContext.status,
      confidence: routeContextConfidenceBucket(nextContext.confidence),
      supplyCandidateCount: nextContext.supplyCandidates.length,
      campCandidateCount: nextContext.campCandidates.length,
      bailoutCandidateCount: nextContext.bailoutCandidates.length,
      warnings: routeContextWarningCodes(nextContext.warnings),
    });
    return cloneContext(nextContext);
  }

  private contextForStatus(
    trail: RouteContextTrailInput,
    selectedSupplyMode: SupplyMode | null | undefined,
    status: RouteContextStatus,
    now: string,
  ): RouteContext {
    return {
      id: ['route-context', trail.id, trail.tripId].filter(Boolean).join(':'),
      trailId: trail.id,
      tripId: trail.tripId ?? null,
      userId: trail.userId ?? null,
      origin: trail.origin ?? null,
      trailheadAnchor: {
        lat: 0,
        lng: 0,
        label: null,
        source: 'unknown',
        confidence: UNKNOWN_CONFIDENCE,
        warnings: [],
      },
      selectedSupplyMode: selectedSupplyMode ?? null,
      supplyCandidates: [],
      selectedSupplyPlan: null,
      routeGeometry: null,
      campCandidates: [],
      bailoutCandidates: [],
      confidence: UNKNOWN_CONFIDENCE,
      status,
      warnings: [],
      createdAt: now,
      updatedAt: now,
      expiresAt: null,
      providerMetadata: {
        phase: status,
      },
    };
  }

  private updateEntry(
    key: string,
    context: RouteContext,
    status: RouteContextStatus,
    generation: number,
    inFlight: boolean,
    error: string | null,
  ): boolean {
    const current = this.cache.get(key);
    if (!current || current.cancelled || current.generation !== generation) return false;
    const updatedAt = nowIso(this.defaults.now);
    const nextContext = {
      ...context,
      status,
      updatedAt,
    };
    this.cache.set(key, {
      ...current,
      status,
      context: nextContext,
      updatedAt,
      finishedAt: inFlight ? null : updatedAt,
      inFlight,
      error,
      promise: inFlight ? current.promise : null,
      lastUsableContext: isUsableContext(nextContext)
        ? cloneContext(nextContext)
        : current.lastUsableContext,
    });
    return true;
  }
}

export const routeContextOrchestrator = new RouteContextOrchestrator();
