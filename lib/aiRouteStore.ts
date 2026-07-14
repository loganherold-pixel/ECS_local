// ============================================================
// AI ROUTE STORE — State management for AI route suggestions
// ============================================================
// Manages fetching, caching, and state for AI-generated
// expedition route suggestions in the ECS Discovery tab.
//
// Features:
//   - Per-category caching with TTL
//   - Loading/error state per category
//   - Global enable/disable toggle
//   - Subscription pattern for reactive UI updates
//   - Deduplication against existing known routes
// ============================================================

import {
  supabase,
  isDeployedEdgeFunction,
  isEdgeFunctionUnavailableError,
} from './supabase';
import { ecsLog } from './ecsLogger';
import { buildECSAIRouteIdeaPolicyMetadata } from './ai/aiPolicyBoundary';
import type {
  AIGeneratedRoute,
  AIRouteState,
  AIRouteRequestParams,
  AIRouteResponse,
} from './aiRouteTypes';
import type { DiscoveryTabId } from './discoverCategoryEngine';

const TAG = '[AIRouteStore]';

// ── Cache TTL: 5 minutes ─────────────────────────────────────
const CACHE_TTL_MS = 5 * 60 * 1000;
const FAILURE_COOLDOWN_MS = 90 * 1000;
const UNIFIED_DRIVABLE_TRAILS_CATEGORY = 'all-drivable-trails';

// ── Max routes per category ──────────────────────────────────
const MAX_ROUTES_PER_CATEGORY = 6;

export type AIRouteRequestDiagnostics = {
  providerRequests: number;
  deduplicatedRequests: number;
  supersededRequests: number;
  staleResponsesIgnored: number;
};

function stableTextHash(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

export function createAIRouteRequestFingerprint(params: AIRouteRequestParams): string {
  const existingRouteNames = Array.from(new Set(
    params.existingRouteNames
      .map((name) => String(name ?? '').trim().toLowerCase())
      .filter(Boolean),
  )).sort();
  return [
    params.category,
    Number(params.latitude).toFixed(3),
    Number(params.longitude).toFixed(3),
    Math.round(Number(params.radiusMiles)),
    String(params.vehicleType ?? '').trim().toLowerCase(),
    String(params.vehicleBuild ?? '').trim().toLowerCase(),
    Math.max(1, Math.round(Number(params.count))),
    stableTextHash(existingRouteNames.join('|')),
  ].join('|');
}

function debugAIRoutes(message: string, details?: Record<string, unknown>): void {
  ecsLog.debug('DISCOVERY', message, details);
}

function resolveBackendCategory(
  category: string,
  radiusMiles: number,
): DiscoveryTabId {
  if (category === 'day-trips' || category === 'weekend-trips' || category === 'expeditions' || category === 'remote-routes') {
    return category;
  }

  if (category === UNIFIED_DRIVABLE_TRAILS_CATEGORY) {
    if (radiusMiles <= 50) return 'day-trips';
    if (radiusMiles <= 150) return 'weekend-trips';
    if (radiusMiles <= 300) return 'expeditions';
    return 'remote-routes';
  }

  return 'expeditions';
}

// ── Default state ────────────────────────────────────────────
const DEFAULT_STATE: AIRouteState = {
  routesByCategory: {},
  loadingByCategory: {},
  errorByCategory: {},
  lastFetchByCategory: {},
  enabled: true,
};

type Listener = () => void;

function isRouteRecord(value: unknown): value is AIGeneratedRoute {
  if (!value || typeof value !== 'object') return false;
  const route = value as Partial<AIGeneratedRoute>;
  return (
    typeof route.id === 'string' &&
    typeof route.name === 'string' &&
    typeof route.region === 'string' &&
    typeof route.startLat === 'number' &&
    typeof route.startLng === 'number'
  );
}

function isValidRouteResponse(value: unknown): value is AIRouteResponse {
  if (!value || typeof value !== 'object') return false;
  const response = value as Partial<AIRouteResponse>;
  if (!Array.isArray(response.routes)) return false;
  return response.routes.every(isRouteRecord);
}

function classifyInvokeFailure(error: unknown): {
  kind:
    | 'function_unavailable'
    | 'http_error'
    | 'request_error'
    | 'invalid_response'
    | 'unknown';
  message: string;
  code?: string | null;
  status?: number | null;
} {
  const fallback = {
    kind: 'unknown' as const,
    message: 'Unknown ECS route engine failure',
    code: null,
    status: null,
  };

  if (!error) return fallback;
  if (isEdgeFunctionUnavailableError(error)) {
    const maybeError = error as { message?: string; context?: { code?: string; status?: number } };
    return {
      kind: 'function_unavailable',
      message: maybeError.message || 'ECS route engine is not deployed in the current backend',
      code: maybeError.context?.code ?? null,
      status: maybeError.context?.status ?? 404,
    };
  }

  if (error instanceof Error) {
    const isInvalidResponse = error.message.toLowerCase().includes('invalid response shape');
    return {
      kind: isInvalidResponse ? 'invalid_response' : 'request_error',
      message: error.message || fallback.message,
      code: null,
      status: null,
    };
  }

  if (typeof error === 'object') {
    const maybeError = error as {
      message?: string;
      name?: string;
      context?: { status?: number; code?: string };
      status?: number;
    };
    const status = maybeError.context?.status ?? maybeError.status ?? null;
    const code = maybeError.context?.code ?? null;
    return {
      kind: status && status >= 400 ? 'http_error' : 'request_error',
      message: maybeError.message || maybeError.name || fallback.message,
      code,
      status,
    };
  }

  return {
    kind: 'request_error',
    message: String(error),
    code: null,
    status: null,
  };
}

class AIRouteStoreClass {
  private state: AIRouteState = { ...DEFAULT_STATE };
  private listeners: Set<Listener> = new Set();
  private abortControllers: Map<string, AbortController> = new Map();
  private inFlightRequests: Map<string, {
    fingerprint: string;
    controller: AbortController;
    promise: Promise<AIGeneratedRoute[]>;
  }> = new Map();
  private lastFetchFingerprintByCategory: Record<string, string> = {};
  private failureCooldownUntilByCategory: Record<string, number> = {};
  private lastFailureSignatureByCategory: Record<string, string> = {};
  private requestDiagnostics: AIRouteRequestDiagnostics = {
    providerRequests: 0,
    deduplicatedRequests: 0,
    supersededRequests: 0,
    staleResponsesIgnored: 0,
  };

  private pruneFailureCooldowns(nowMs = Date.now()): void {
    const keys = Object.keys(this.failureCooldownUntilByCategory);
    keys.forEach((key) => {
      if ((this.failureCooldownUntilByCategory[key] ?? 0) <= nowMs) {
        delete this.failureCooldownUntilByCategory[key];
        delete this.lastFailureSignatureByCategory[key];
      }
    });
    const retained = Object.keys(this.failureCooldownUntilByCategory)
      .sort((a, b) =>
        (this.failureCooldownUntilByCategory[a] ?? 0) -
        (this.failureCooldownUntilByCategory[b] ?? 0),
      );
    retained.slice(0, Math.max(0, retained.length - 24)).forEach((key) => {
      delete this.failureCooldownUntilByCategory[key];
      delete this.lastFailureSignatureByCategory[key];
    });
  }

  // ── Subscription ─────────────────────────────────────────
  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  private notify() {
    this.listeners.forEach(fn => {
      try { fn(); } catch (e) { console.warn(TAG, 'Listener error:', e); }
    });
  }

  // ── Getters ──────────────────────────────────────────────
  getRoutes(category: string): AIGeneratedRoute[] {
    return this.state.routesByCategory[category] || [];
  }

  isLoading(category: string): boolean {
    return this.state.loadingByCategory[category] || false;
  }

  getError(category: string): string | null {
    return this.state.errorByCategory[category] || null;
  }

  isEnabled(): boolean {
    return this.state.enabled;
  }

  hasRoutes(category: string): boolean {
    return (this.state.routesByCategory[category]?.length || 0) > 0;
  }

  isCacheValid(category: string, params?: AIRouteRequestParams): boolean {
    const lastFetch = this.state.lastFetchByCategory[category];
    if (!lastFetch) return false;
    if (
      params &&
      this.lastFetchFingerprintByCategory[category] !== createAIRouteRequestFingerprint(params)
    ) {
      return false;
    }
    return Date.now() - lastFetch < CACHE_TTL_MS;
  }

  getRequestDiagnostics(): AIRouteRequestDiagnostics {
    return { ...this.requestDiagnostics };
  }

  resetRequestDiagnosticsForTests(): void {
    this.requestDiagnostics = {
      providerRequests: 0,
      deduplicatedRequests: 0,
      supersededRequests: 0,
      staleResponsesIgnored: 0,
    };
  }

  // ── Toggle ───────────────────────────────────────────────
  setEnabled(enabled: boolean) {
    this.state.enabled = enabled;
    this.notify();
  }

  // ── Fetch AI Routes ──────────────────────────────────────
  async fetchRoutes(params: AIRouteRequestParams): Promise<AIGeneratedRoute[]> {
    const { category } = params;
    const backendCategory = resolveBackendCategory(category, params.radiusMiles);
    const requestFingerprint = createAIRouteRequestFingerprint(params);

    // Check cache
    if (this.isCacheValid(category, params) && this.hasRoutes(category)) {
      debugAIRoutes('Using cached AI routes', { category });
      return this.getRoutes(category);
    }

    const activeRequest = this.inFlightRequests.get(category);
    if (activeRequest?.fingerprint === requestFingerprint) {
      this.requestDiagnostics.deduplicatedRequests += 1;
      return activeRequest.promise;
    }
    if (activeRequest) {
      this.requestDiagnostics.supersededRequests += 1;
      activeRequest.controller.abort();
    }

    this.pruneFailureCooldowns();
    const cooldownUntil = this.failureCooldownUntilByCategory[requestFingerprint] ?? 0;
    if (cooldownUntil > Date.now()) {
      const remainingSeconds = Math.max(1, Math.ceil((cooldownUntil - Date.now()) / 1000));
      const signature = this.lastFailureSignatureByCategory[requestFingerprint] || 'cooldown';
      debugAIRoutes('Skipping AI route fetch during cooldown', {
        category,
        remainingSeconds,
        signature,
      });
      return this.getRoutes(category);
    }

    if (!isDeployedEdgeFunction('ai-route-suggestions')) {
      const errorMsg = 'ECS route engine is not deployed in the current backend';
      this.state.errorByCategory[category] = errorMsg;
      this.failureCooldownUntilByCategory[requestFingerprint] = Date.now() + FAILURE_COOLDOWN_MS;
      this.lastFailureSignatureByCategory[requestFingerprint] = 'missing_function';
      this.pruneFailureCooldowns();
      this.notify();
      return [];
    }

    // Abort any existing request for this category
    const existingController = this.abortControllers.get(category);
    if (existingController) {
      existingController.abort();
    }

    const controller = new AbortController();
    this.abortControllers.set(category, controller);

    // Set loading state
    this.state.loadingByCategory[category] = true;
    this.state.errorByCategory[category] = null;
    this.notify();

    const requestPromise = (async () => {
      this.requestDiagnostics.providerRequests += 1;
      debugAIRoutes('Fetching AI routes', {
        category,
        backendCategory,
        radiusMiles: params.radiusMiles,
      });

      const { data, error } = await supabase.functions.invoke('ai-route-suggestions', {
        body: {
          latitude: params.latitude,
          longitude: params.longitude,
          category: backendCategory,
          radiusMiles: params.radiusMiles,
          vehicleType: params.vehicleType,
          vehicleBuild: params.vehicleBuild,
          count: Math.min(params.count, MAX_ROUTES_PER_CATEGORY),
          existingRouteNames: params.existingRouteNames,
        },
      });

      if (controller.signal.aborted || this.abortControllers.get(category) !== controller) {
        this.requestDiagnostics.staleResponsesIgnored += 1;
        debugAIRoutes('AI route request aborted', { category });
        return [];
      }

      if (error) {
        throw error;
      }

      if (!isValidRouteResponse(data)) {
        throw new Error('Invalid response shape from ECS route engine');
      }

      const response = data as AIRouteResponse;
      if (response.error) {
        throw new Error(response.error);
      }

      const routes = (response.routes || []).slice(0, MAX_ROUTES_PER_CATEGORY);

      const responseMeta = response.meta ?? {};
      debugAIRoutes('AI route response received', {
        category,
        backendCategory,
        routeCount: routes.length,
        mode: responseMeta.mode ?? 'unknown',
        reason: responseMeta.reason ?? null,
        requestId: responseMeta.requestId ?? null,
      });

      // Enrich routes with computed fields while preserving server-provided ECS routing metadata.
      const enrichedRoutes: AIGeneratedRoute[] = routes.map(route => ({
        ...route,
        regionGroup: route.regionGroup,
        imageTag: route.imageTag || 'ecs-suggested',
        isAIGenerated: true as const,
        aiPolicy: buildECSAIRouteIdeaPolicyMetadata(),
        distanceFromUserMiles:
          typeof route.distanceFromUserMiles === 'number'
            ? route.distanceFromUserMiles
            : Math.round(
                haversineDistanceMiles(
                  params.latitude,
                  params.longitude,
                  route.startLat,
                  route.startLng
                )
              ),
      }));

      // Update state
      this.state.routesByCategory[category] = enrichedRoutes;
      this.state.loadingByCategory[category] = false;
      this.state.lastFetchByCategory[category] = Date.now();
      this.lastFetchFingerprintByCategory[category] = requestFingerprint;
      this.failureCooldownUntilByCategory[requestFingerprint] = 0;
      this.lastFailureSignatureByCategory[requestFingerprint] = '';
      this.notify();

      debugAIRoutes('AI routes loaded', {
        category,
        routeCount: enrichedRoutes.length,
      });
      return enrichedRoutes;
    })().catch((err: any) => {
      if (controller.signal.aborted || this.abortControllers.get(category) !== controller) {
        this.requestDiagnostics.staleResponsesIgnored += 1;
        return [];
      }

      const classified = classifyInvokeFailure(err);
      const errorMsg =
        classified.kind === 'function_unavailable'
          ? 'ECS route engine unavailable'
          : classified.kind === 'invalid_response'
            ? 'ECS route engine returned invalid data'
            : classified.message || 'Unknown ECS route engine error';

      const signature = `${classified.kind}:${classified.code ?? 'none'}:${classified.status ?? 'none'}:${classified.message}`;
      this.failureCooldownUntilByCategory[requestFingerprint] = Date.now() + FAILURE_COOLDOWN_MS;
      this.lastFailureSignatureByCategory[requestFingerprint] = signature;
      this.pruneFailureCooldowns();

      console.warn(TAG, `Error fetching AI routes for ${category}:`, {
        kind: classified.kind,
        status: classified.status,
        code: classified.code,
        message: classified.message,
      });

      this.state.loadingByCategory[category] = false;
      this.state.errorByCategory[category] = errorMsg;
      this.notify();

      return [];
    }).finally(() => {
      if (this.abortControllers.get(category) === controller) {
        this.abortControllers.delete(category);
      }
      if (this.inFlightRequests.get(category)?.controller === controller) {
        this.inFlightRequests.delete(category);
      }
    });

    this.inFlightRequests.set(category, {
      fingerprint: requestFingerprint,
      controller,
      promise: requestPromise,
    });
    return requestPromise;
  }

  // ── Clear cache for a category ───────────────────────────
  clearCategory(category: string) {
    this.abortControllers.get(category)?.abort();
    this.abortControllers.delete(category);
    this.inFlightRequests.delete(category);
    delete this.state.routesByCategory[category];
    delete this.state.lastFetchByCategory[category];
    delete this.lastFetchFingerprintByCategory[category];
    delete this.state.errorByCategory[category];
    delete this.state.loadingByCategory[category];
    this.notify();
  }

  // ── Clear all caches ─────────────────────────────────────
  clearAll() {
    this.abortControllers.forEach((controller) => controller.abort());
    this.abortControllers.clear();
    this.inFlightRequests.clear();
    this.state.routesByCategory = {};
    this.state.lastFetchByCategory = {};
    this.state.errorByCategory = {};
    this.state.loadingByCategory = {};
    this.lastFetchFingerprintByCategory = {};
    this.failureCooldownUntilByCategory = {};
    this.lastFailureSignatureByCategory = {};
    this.notify();
  }

  // ── Get a single route by ID ─────────────────────────────
  getRouteById(id: string): AIGeneratedRoute | null {
    for (const routes of Object.values(this.state.routesByCategory)) {
      const found = routes.find(r => r.id === id);
      if (found) return found;
    }
    return null;
  }
}

// ── Haversine Distance (duplicated to avoid circular deps) ──
function haversineDistanceMiles(
  lat1: number, lon1: number,
  lat2: number, lon2: number,
): number {
  const R = 3958.8;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) *
    Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── Singleton export ─────────────────────────────────────────
export const aiRouteStore = new AIRouteStoreClass();

