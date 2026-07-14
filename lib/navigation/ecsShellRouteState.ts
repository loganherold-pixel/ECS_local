import { createPersistedKeyValueCache } from '../keyValuePersistence';
import {
  getRestorableShellRouteForPath,
  isECSDeepLinkPathAllowed,
  normalizeECSRoutePath,
} from '../routeManifest';

const SHELL_ROUTE_KEY = 'last_shell_route_v1';
const INTENDED_ROUTE_KEY = 'pending_intended_route_v1';
const INTENDED_ROUTE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const shellRouteCache = createPersistedKeyValueCache('ecs_shell_state');

type PersistedIntendedRoute = {
  path: string;
  createdAtMs: number;
};

export function waitForECSShellRouteStateHydration(): Promise<void> {
  return shellRouteCache.waitForHydration();
}

export function loadLastECSShellRoute(): string | null {
  const raw = shellRouteCache.get(SHELL_ROUTE_KEY);
  const normalized = getRestorableShellRouteForPath(raw);
  if (!normalized) {
    if (raw) clearLastECSShellRoute();
    return null;
  }
  if (raw !== normalized) {
    shellRouteCache.set(SHELL_ROUTE_KEY, normalized);
    void shellRouteCache.flush();
  }
  return normalized;
}

export function saveLastECSShellRoute(path: string): string | null {
  const normalized = getRestorableShellRouteForPath(path);
  if (!normalized) return null;
  shellRouteCache.set(SHELL_ROUTE_KEY, normalized);
  void shellRouteCache.flush();
  return normalized;
}

export function clearLastECSShellRoute(): void {
  shellRouteCache.delete(SHELL_ROUTE_KEY);
  void shellRouteCache.flush();
}

export function saveECSIntendedRoute(path: string, nowMs = Date.now()): string | null {
  const normalized = normalizeECSRoutePath(path);
  if (!isECSDeepLinkPathAllowed(normalized)) return null;
  const raw = String(path).trim().split('#', 1)[0].slice(0, 1_000);
  const target = raw.startsWith('/') ? raw : normalized;
  const value: PersistedIntendedRoute = { path: target, createdAtMs: nowMs };
  shellRouteCache.set(INTENDED_ROUTE_KEY, JSON.stringify(value));
  void shellRouteCache.flush();
  return target;
}

export function loadECSIntendedRoute(nowMs = Date.now()): string | null {
  const raw = shellRouteCache.get(INTENDED_ROUTE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as PersistedIntendedRoute;
    if (
      !parsed ||
      !Number.isFinite(parsed.createdAtMs) ||
      parsed.createdAtMs > nowMs + 60_000 ||
      nowMs - parsed.createdAtMs > INTENDED_ROUTE_MAX_AGE_MS ||
      !isECSDeepLinkPathAllowed(parsed.path)
    ) {
      clearECSIntendedRoute();
      return null;
    }
    return parsed.path;
  } catch {
    clearECSIntendedRoute();
    return null;
  }
}

export function clearECSIntendedRoute(): void {
  shellRouteCache.delete(INTENDED_ROUTE_KEY);
  void shellRouteCache.flush();
}

export function settleECSIntendedRoute(path: string): void {
  const intended = loadECSIntendedRoute();
  if (intended && normalizeECSRoutePath(path) === normalizeECSRoutePath(intended)) clearECSIntendedRoute();
}
