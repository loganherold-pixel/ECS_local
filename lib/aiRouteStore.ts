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

import { supabase } from './supabase';
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

// ── Max routes per category ──────────────────────────────────
const MAX_ROUTES_PER_CATEGORY = 6;

// ── Default state ────────────────────────────────────────────
const DEFAULT_STATE: AIRouteState = {
  routesByCategory: {},
  loadingByCategory: {},
  errorByCategory: {},
  lastFetchByCategory: {},
  enabled: true,
};

type Listener = () => void;

class AIRouteStoreClass {
  private state: AIRouteState = { ...DEFAULT_STATE };
  private listeners: Set<Listener> = new Set();
  private abortControllers: Map<string, AbortController> = new Map();

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

  isCacheValid(category: string): boolean {
    const lastFetch = this.state.lastFetchByCategory[category];
    if (!lastFetch) return false;
    return Date.now() - lastFetch < CACHE_TTL_MS;
  }

  // ── Toggle ───────────────────────────────────────────────
  setEnabled(enabled: boolean) {
    this.state.enabled = enabled;
    this.notify();
  }

  // ── Fetch AI Routes ──────────────────────────────────────
  async fetchRoutes(params: AIRouteRequestParams): Promise<AIGeneratedRoute[]> {
    const { category } = params;

    // Check cache
    if (this.isCacheValid(category) && this.hasRoutes(category)) {
      console.log(TAG, `Using cached routes for ${category}`);
      return this.getRoutes(category);
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

    try {
      console.log(TAG, `Fetching AI routes for ${category}...`);

      const { data, error } = await supabase.functions.invoke('ai-route-suggestions', {
        body: {
          latitude: params.latitude,
          longitude: params.longitude,
          category: params.category,
          radiusMiles: params.radiusMiles,
          vehicleType: params.vehicleType,
          vehicleBuild: params.vehicleBuild,
          count: Math.min(params.count, MAX_ROUTES_PER_CATEGORY),
          existingRouteNames: params.existingRouteNames,
        },
      });

      if (controller.signal.aborted) {
        console.log(TAG, `Request aborted for ${category}`);
        return [];
      }

      if (error) {
        throw new Error(error.message || 'Failed to fetch AI routes');
      }

      const response = data as AIRouteResponse;
      if (response.error) {
        throw new Error(response.error);
      }

      const routes = (response.routes || []).slice(0, MAX_ROUTES_PER_CATEGORY);

      // Enrich routes with regionGroup and other computed fields
      const enrichedRoutes: AIGeneratedRoute[] = routes.map(route => ({
        ...route,
        regionGroup: 'california-desert' as any, // Will be overridden by actual region mapping
        imageTag: 'ai-suggested',
        isAIGenerated: true as const,
        // Compute distanceFromUserMiles using haversine
        distanceFromUserMiles: Math.round(
          haversineDistanceMiles(
            params.latitude, params.longitude,
            route.startLat, route.startLng
          )
        ),
      }));

      // Update state
      this.state.routesByCategory[category] = enrichedRoutes;
      this.state.loadingByCategory[category] = false;
      this.state.lastFetchByCategory[category] = Date.now();
      this.notify();

      console.log(TAG, `Loaded ${enrichedRoutes.length} AI routes for ${category}`);
      return enrichedRoutes;

    } catch (err: any) {
      if (controller.signal.aborted) return [];

      const errorMsg = err?.message || 'Unknown error';
      console.warn(TAG, `Error fetching AI routes for ${category}:`, errorMsg);

      this.state.loadingByCategory[category] = false;
      this.state.errorByCategory[category] = errorMsg;
      this.notify();

      return [];
    } finally {
      this.abortControllers.delete(category);
    }
  }

  // ── Clear cache for a category ───────────────────────────
  clearCategory(category: string) {
    delete this.state.routesByCategory[category];
    delete this.state.lastFetchByCategory[category];
    delete this.state.errorByCategory[category];
    this.notify();
  }

  // ── Clear all caches ─────────────────────────────────────
  clearAll() {
    this.state.routesByCategory = {};
    this.state.lastFetchByCategory = {};
    this.state.errorByCategory = {};
    this.state.loadingByCategory = {};
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

