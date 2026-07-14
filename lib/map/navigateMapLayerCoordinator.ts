export type NavigateMapLayerId =
  | 'mvum'
  | 'route_geometry'
  | 'dispersed_camping'
  | 'established_campgrounds'
  | 'weather'
  | 'hazards'
  | 'convoy'
  | 'dispatch_pings';

export type NavigateMapLayerRenderPriority = 'critical' | 'high' | 'normal' | 'low';
export type NavigateMapLayerSourceState =
  | 'live'
  | 'cached'
  | 'stale'
  | 'offline'
  | 'unavailable'
  | 'unknown';

export type NavigateMapViewportBounds = {
  west: number;
  south: number;
  east: number;
  north: number;
};

export type NavigateMapLayerSkipReason =
  | 'disabled'
  | 'zoom_ineligible'
  | 'offline'
  | 'duplicate_pending'
  | 'duplicate_inflight';

export type NavigateMapLayerPlan =
  | {
      kind: 'scheduled';
      layer: NavigateMapLayerId;
      viewportFingerprint: string;
      dueAt: number;
      renderPriority: NavigateMapLayerRenderPriority;
    }
  | {
      kind: 'skip';
      layer: NavigateMapLayerId;
      viewportFingerprint: string;
      reason: NavigateMapLayerSkipReason;
    };

export type NavigateMapLayerRequest = {
  layer: NavigateMapLayerId;
  requestId: number;
  viewportFingerprint: string;
  bounds: NavigateMapViewportBounds;
  renderPriority: NavigateMapLayerRenderPriority;
  signal: AbortSignal;
};

export type NavigateMapLayerState = {
  layer: NavigateMapLayerId;
  enabled: boolean;
  zoomEligible: boolean;
  loading: boolean;
  viewportFingerprint: string | null;
  sourceState: NavigateMapLayerSourceState;
  renderPriority: NavigateMapLayerRenderPriority;
  itemCount: number;
  error: string | null;
  updatedAt: number | null;
};

export type NavigateMapLayerDiagnostics = {
  requestCount: number;
  completedCount: number;
  failedCount: number;
  cancelledCount: number;
  dedupedCount: number;
  staleResponseCount: number;
  cacheHitCount: number;
  cacheMissCount: number;
  cacheEntryCount: number;
  outstandingRequestCount: number;
  pendingLayerCount: number;
};

type PendingLayerRequest = {
  viewportFingerprint: string;
  bounds: NavigateMapViewportBounds;
  dueAt: number;
  renderPriority: NavigateMapLayerRenderPriority;
};

type ActiveLayerRequest = NavigateMapLayerRequest & { controller: AbortController };

type CacheEntry = {
  key: string;
  layer: NavigateMapLayerId;
  value: unknown;
  storedAt: number;
  expiresAt: number;
  lastAccessedAt: number;
  sourceState: NavigateMapLayerSourceState;
};

type LayerCoordinatorOptions = {
  maxCacheEntries?: number;
  maxCacheEntriesPerLayer?: number;
};

const EMPTY_DIAGNOSTICS: NavigateMapLayerDiagnostics = {
  requestCount: 0,
  completedCount: 0,
  failedCount: 0,
  cancelledCount: 0,
  dedupedCount: 0,
  staleResponseCount: 0,
  cacheHitCount: 0,
  cacheMissCount: 0,
  cacheEntryCount: 0,
  outstandingRequestCount: 0,
  pendingLayerCount: 0,
};

function emptyLayerState(layer: NavigateMapLayerId): NavigateMapLayerState {
  return {
    layer,
    enabled: false,
    zoomEligible: false,
    loading: false,
    viewportFingerprint: null,
    sourceState: 'unknown',
    renderPriority: 'normal',
    itemCount: 0,
    error: null,
    updatedAt: null,
  };
}

function normalizeBound(value: number): number {
  return Math.round(value * 100000) / 100000;
}

export function createNavigateViewportFingerprint(
  bounds: NavigateMapViewportBounds,
  zoom: number,
): string {
  return [
    normalizeBound(bounds.west),
    normalizeBound(bounds.south),
    normalizeBound(bounds.east),
    normalizeBound(bounds.north),
    Math.round(zoom * 10) / 10,
  ].join(':');
}

function cloneDiagnostics(
  diagnostics: NavigateMapLayerDiagnostics,
  coordinator: NavigateMapLayerCoordinator,
): NavigateMapLayerDiagnostics {
  return {
    ...diagnostics,
    cacheEntryCount: coordinator.cacheSize,
    outstandingRequestCount: coordinator.activeRequestCount,
    pendingLayerCount: coordinator.pendingRequestCount,
  };
}

export class NavigateMapLayerCoordinator {
  private readonly maxCacheEntries: number;
  private readonly maxCacheEntriesPerLayer: number;
  private readonly states = new Map<NavigateMapLayerId, NavigateMapLayerState>();
  private readonly pending = new Map<NavigateMapLayerId, PendingLayerRequest>();
  private readonly active = new Map<NavigateMapLayerId, ActiveLayerRequest>();
  private readonly cache = new Map<string, CacheEntry>();
  private diagnostics: NavigateMapLayerDiagnostics = { ...EMPTY_DIAGNOSTICS };
  private nextRequestId = 1;

  constructor(options: LayerCoordinatorOptions = {}) {
    this.maxCacheEntries = Math.max(1, options.maxCacheEntries ?? 24);
    this.maxCacheEntriesPerLayer = Math.max(1, options.maxCacheEntriesPerLayer ?? 8);
  }

  get cacheSize(): number {
    return this.cache.size;
  }

  get activeRequestCount(): number {
    return this.active.size;
  }

  get pendingRequestCount(): number {
    return this.pending.size;
  }

  getState(layer: NavigateMapLayerId): NavigateMapLayerState {
    return this.states.get(layer) ?? emptyLayerState(layer);
  }

  getDiagnostics(): NavigateMapLayerDiagnostics {
    return cloneDiagnostics(this.diagnostics, this);
  }

  plan(input: {
    layer: NavigateMapLayerId;
    enabled: boolean;
    zoomEligible: boolean;
    online: boolean;
    viewportFingerprint: string;
    bounds: NavigateMapViewportBounds;
    debounceMs?: number;
    renderPriority?: NavigateMapLayerRenderPriority;
    now?: number;
  }): NavigateMapLayerPlan {
    const now = input.now ?? Date.now();
    const renderPriority = input.renderPriority ?? 'normal';
    const currentState = this.getState(input.layer);
    const nextState: NavigateMapLayerState = {
      ...currentState,
      enabled: input.enabled,
      zoomEligible: input.zoomEligible,
      renderPriority,
      viewportFingerprint: input.viewportFingerprint,
      error: null,
    };
    this.states.set(input.layer, nextState);

    const skip = (
      reason: NavigateMapLayerSkipReason,
      options: { preservePending?: boolean } = {},
    ): NavigateMapLayerPlan => {
      if (!options.preservePending) this.pending.delete(input.layer);
      if (reason === 'disabled' || reason === 'zoom_ineligible') this.cancel(input.layer, reason);
      if (reason === 'offline') {
        this.states.set(input.layer, {
          ...nextState,
          loading: false,
          sourceState: currentState.itemCount > 0 ? 'offline' : 'unavailable',
        });
      }
      return {
        kind: 'skip',
        layer: input.layer,
        viewportFingerprint: input.viewportFingerprint,
        reason,
      };
    };

    if (!input.enabled) return skip('disabled');
    if (!input.zoomEligible) return skip('zoom_ineligible');
    if (!input.online) return skip('offline');

    const pending = this.pending.get(input.layer);
    if (pending?.viewportFingerprint === input.viewportFingerprint) {
      this.diagnostics.dedupedCount += 1;
      return skip('duplicate_pending', { preservePending: true });
    }
    const active = this.active.get(input.layer);
    if (active?.viewportFingerprint === input.viewportFingerprint) {
      this.diagnostics.dedupedCount += 1;
      return skip('duplicate_inflight');
    }
    if (active) this.cancel(input.layer, 'viewport_changed');

    const dueAt = now + Math.max(0, input.debounceMs ?? 0);
    this.pending.set(input.layer, {
      viewportFingerprint: input.viewportFingerprint,
      bounds: input.bounds,
      dueAt,
      renderPriority,
    });
    this.states.set(input.layer, { ...nextState, loading: true, sourceState: 'unknown' });
    return {
      kind: 'scheduled',
      layer: input.layer,
      viewportFingerprint: input.viewportFingerprint,
      dueAt,
      renderPriority,
    };
  }

  consumeDue(layer: NavigateMapLayerId, now = Date.now()): NavigateMapLayerRequest | null {
    const pending = this.pending.get(layer);
    if (!pending || pending.dueAt > now) return null;
    this.pending.delete(layer);
    const controller = new AbortController();
    const request: ActiveLayerRequest = {
      layer,
      requestId: this.nextRequestId,
      viewportFingerprint: pending.viewportFingerprint,
      bounds: pending.bounds,
      renderPriority: pending.renderPriority,
      signal: controller.signal,
      controller,
    };
    this.nextRequestId += 1;
    this.active.set(layer, request);
    this.diagnostics.requestCount += 1;
    return request;
  }

  isCurrent(request: Pick<NavigateMapLayerRequest, 'layer' | 'requestId' | 'viewportFingerprint'>): boolean {
    const active = this.active.get(request.layer);
    return !!active &&
      active.requestId === request.requestId &&
      active.viewportFingerprint === request.viewportFingerprint &&
      !active.signal.aborted;
  }

  complete(
    request: NavigateMapLayerRequest,
    result: {
      itemCount: number;
      sourceState?: NavigateMapLayerSourceState;
      updatedAt?: number;
    },
  ): boolean {
    if (!this.isCurrent(request)) {
      this.diagnostics.staleResponseCount += 1;
      return false;
    }
    this.active.delete(request.layer);
    this.states.set(request.layer, {
      ...this.getState(request.layer),
      loading: false,
      viewportFingerprint: request.viewportFingerprint,
      sourceState: result.sourceState ?? 'live',
      itemCount: Math.max(0, Math.trunc(result.itemCount)),
      error: null,
      updatedAt: result.updatedAt ?? Date.now(),
    });
    this.diagnostics.completedCount += 1;
    return true;
  }

  fail(
    request: NavigateMapLayerRequest,
    error: unknown,
    options: { sourceState?: NavigateMapLayerSourceState; retainItemCount?: boolean } = {},
  ): boolean {
    if (!this.isCurrent(request)) {
      this.diagnostics.staleResponseCount += 1;
      return false;
    }
    this.active.delete(request.layer);
    const current = this.getState(request.layer);
    this.states.set(request.layer, {
      ...current,
      loading: false,
      sourceState: options.sourceState ?? (current.itemCount > 0 ? 'stale' : 'unavailable'),
      itemCount: options.retainItemCount === false ? 0 : current.itemCount,
      error: error instanceof Error ? error.message : String(error || 'Layer unavailable'),
      updatedAt: Date.now(),
    });
    this.diagnostics.failedCount += 1;
    return true;
  }

  cancel(layer: NavigateMapLayerId, _reason = 'cancelled'): void {
    this.pending.delete(layer);
    const active = this.active.get(layer);
    if (active) {
      active.controller.abort();
      this.active.delete(layer);
      this.diagnostics.cancelledCount += 1;
    }
    const current = this.getState(layer);
    this.states.set(layer, { ...current, loading: false });
  }

  syncLocalLayer(input: {
    layer: NavigateMapLayerId;
    enabled: boolean;
    zoomEligible?: boolean;
    itemCount: number;
    sourceState: NavigateMapLayerSourceState;
    renderPriority?: NavigateMapLayerRenderPriority;
    updatedAt?: number | null;
  }): void {
    this.states.set(input.layer, {
      ...this.getState(input.layer),
      enabled: input.enabled,
      zoomEligible: input.zoomEligible ?? true,
      loading: false,
      sourceState: input.sourceState,
      renderPriority: input.renderPriority ?? 'normal',
      itemCount: Math.max(0, Math.trunc(input.itemCount)),
      error: null,
      updatedAt: input.updatedAt ?? Date.now(),
    });
  }

  readCache<T>(
    layer: NavigateMapLayerId,
    key: string,
    options: { now?: number; allowStale?: boolean } = {},
  ): { value: T; sourceState: NavigateMapLayerSourceState; stale: boolean } | null {
    const cacheKey = `${layer}:${key}`;
    const entry = this.cache.get(cacheKey);
    if (!entry) {
      this.diagnostics.cacheMissCount += 1;
      return null;
    }
    const now = options.now ?? Date.now();
    const stale = entry.expiresAt <= now;
    if (stale && !options.allowStale) {
      this.cache.delete(cacheKey);
      this.diagnostics.cacheMissCount += 1;
      return null;
    }
    entry.lastAccessedAt = now;
    this.diagnostics.cacheHitCount += 1;
    return {
      value: entry.value as T,
      sourceState: stale ? 'stale' : entry.sourceState,
      stale,
    };
  }

  writeCache<T>(input: {
    layer: NavigateMapLayerId;
    key: string;
    value: T;
    ttlMs: number;
    sourceState?: NavigateMapLayerSourceState;
    now?: number;
  }): void {
    const now = input.now ?? Date.now();
    const cacheKey = `${input.layer}:${input.key}`;
    this.cache.set(cacheKey, {
      key: cacheKey,
      layer: input.layer,
      value: input.value,
      storedAt: now,
      expiresAt: now + Math.max(0, input.ttlMs),
      lastAccessedAt: now,
      sourceState: input.sourceState ?? 'cached',
    });
    this.enforceCacheBounds(input.layer);
  }

  dispose(): void {
    for (const layer of this.active.keys()) this.cancel(layer, 'dispose');
    this.pending.clear();
  }

  private enforceCacheBounds(layer: NavigateMapLayerId): void {
    const forLayer = [...this.cache.values()]
      .filter((entry) => entry.layer === layer)
      .sort((a, b) => a.lastAccessedAt - b.lastAccessedAt);
    while (forLayer.length > this.maxCacheEntriesPerLayer) {
      const oldest = forLayer.shift();
      if (oldest) this.cache.delete(oldest.key);
    }

    const allEntries = [...this.cache.values()].sort(
      (a, b) => a.lastAccessedAt - b.lastAccessedAt,
    );
    while (allEntries.length > this.maxCacheEntries) {
      const oldest = allEntries.shift();
      if (oldest) this.cache.delete(oldest.key);
    }
  }
}
