import {
  EDGE_FUNCTION_UNAVAILABLE_CODE,
  SUPABASE_CONFIG_UNAVAILABLE_CODE,
  isDeployedEdgeFunction,
  isSupabaseConfigured,
  supabase,
} from './supabase';
import {
  ROUTE_GEOMETRY_VIEWPORT_DEFAULT_LIMIT,
  ROUTE_GEOMETRY_VIEWPORT_UNAVAILABLE_MESSAGE,
  normalizeRouteGeometrySourceProviderPrefix,
  normalizeRouteGeometryViewportLimit,
  normalizeRouteGeometryViewportResponse,
  type RouteGeometryViewportBbox,
  type RouteGeometryViewportResult,
} from './routeGeometryViewport';

function createAbortError(): Error {
  const error = new Error('Request canceled');
  error.name = 'AbortError';
  return error;
}

export const ROUTE_GEOMETRY_VIEWPORT_REQUEST_TIMEOUT_MS = 12_000;

export class RouteGeometryViewportTimeoutError extends Error {
  readonly timeoutMs: number;

  constructor(timeoutMs: number) {
    super('ECS trail segment request timed out. Retry or pan the map to refresh.');
    this.name = 'RouteGeometryViewportTimeoutError';
    this.timeoutMs = timeoutMs;
  }
}

export type RouteGeometryViewportProviderAvailability = {
  available: boolean;
  safeErrorCode: typeof SUPABASE_CONFIG_UNAVAILABLE_CODE | typeof EDGE_FUNCTION_UNAVAILABLE_CODE | null;
  reason: 'active' | 'supabase_not_configured' | 'edge_function_unavailable';
};

export class RouteGeometryViewportProviderUnavailableError extends Error {
  readonly safeErrorCode: Exclude<RouteGeometryViewportProviderAvailability['safeErrorCode'], null>;
  readonly reason: Exclude<RouteGeometryViewportProviderAvailability['reason'], 'active'>;

  constructor(availability: RouteGeometryViewportProviderAvailability) {
    super(ROUTE_GEOMETRY_VIEWPORT_UNAVAILABLE_MESSAGE);
    this.name = 'RouteGeometryViewportProviderUnavailableError';
    this.safeErrorCode = availability.safeErrorCode ?? SUPABASE_CONFIG_UNAVAILABLE_CODE;
    this.reason = availability.reason === 'active' ? 'supabase_not_configured' : availability.reason;
  }
}

export function getRouteGeometryViewportProviderAvailability(): RouteGeometryViewportProviderAvailability {
  if (!isSupabaseConfigured) {
    return {
      available: false,
      safeErrorCode: SUPABASE_CONFIG_UNAVAILABLE_CODE,
      reason: 'supabase_not_configured',
    };
  }
  if (!isDeployedEdgeFunction('route-geometry-segments')) {
    return {
      available: false,
      safeErrorCode: EDGE_FUNCTION_UNAVAILABLE_CODE,
      reason: 'edge_function_unavailable',
    };
  }
  return { available: true, safeErrorCode: null, reason: 'active' };
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

export function isRouteGeometryViewportOverlayFeatureEnabled(): boolean {
  const value =
    typeof process !== 'undefined'
      ? process.env.EXPO_PUBLIC_ECS_ROUTE_GEOMETRY_VIEWPORT_OVERLAY
      : undefined;
  const normalized = String(value ?? '').trim().toLowerCase();
  return normalized !== '0' && normalized !== 'false' && normalized !== 'off';
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return value != null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function cleanText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const text = value.replace(/\s+/g, ' ').trim();
  return text || null;
}

function routeGeometryViewportErrorText(value: unknown): string | null {
  const record = readRecord(value);
  return cleanText(record?.userMessage ?? record?.message ?? record?.error) ?? cleanText(value);
}

export function friendlyRouteGeometryViewportError(message?: string | null): string {
  const text = String(message ?? '').trim();
  if (!text) return ROUTE_GEOMETRY_VIEWPORT_UNAVAILABLE_MESSAGE;
  const lower = text.toLowerCase();
  if (
    lower.includes('non-2xx') ||
    lower.includes('edge function') ||
    lower.includes('functionsfetcherror') ||
    lower.includes('failed to fetch') ||
    lower.includes('supabase not configured')
  ) {
    return ROUTE_GEOMETRY_VIEWPORT_UNAVAILABLE_MESSAGE;
  }
  return text;
}

async function readRouteGeometryViewportErrorBody(error: unknown, response?: unknown): Promise<unknown> {
  const explicitResponse = response as Response | undefined;
  const errorContext = (error as { context?: Response } | null)?.context;
  const source = explicitResponse ?? errorContext;
  if (!source || typeof source !== 'object' || typeof (source as Response).clone !== 'function') {
    return null;
  }

  try {
    return await (source as Response).clone().json();
  } catch {
    try {
      const text = await (source as Response).clone().text();
      return text ? JSON.parse(text) : null;
    } catch {
      return null;
    }
  }
}

export async function fetchRouteGeometryViewportSegments(args: {
  bbox: RouteGeometryViewportBbox;
  zoom: number;
  limit?: number;
  vehicleClass?: string | null;
  includeReferenceGeometry?: boolean;
  sourceProviderPrefix?: string | null;
  signal?: AbortSignal;
  timeoutMs?: number;
}): Promise<RouteGeometryViewportResult> {
  if (args.signal?.aborted) throw createAbortError();
  const providerAvailability = getRouteGeometryViewportProviderAvailability();
  if (!providerAvailability.available) {
    throw new RouteGeometryViewportProviderUnavailableError(providerAvailability);
  }
  const sourceProviderPrefix = normalizeRouteGeometrySourceProviderPrefix(args.sourceProviderPrefix);
  const resultLimit = normalizeRouteGeometryViewportLimit(
    args.limit ?? ROUTE_GEOMETRY_VIEWPORT_DEFAULT_LIMIT,
  );
  const requestedTimeoutMs = args.timeoutMs ?? ROUTE_GEOMETRY_VIEWPORT_REQUEST_TIMEOUT_MS;
  const timeoutMs = Number.isFinite(requestedTimeoutMs)
    ? Math.max(1, Math.trunc(requestedTimeoutMs))
    : ROUTE_GEOMETRY_VIEWPORT_REQUEST_TIMEOUT_MS;
  const requestController = new AbortController();
  let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
  let rejectLifecycle: ((reason: Error) => void) | null = null;
  const lifecyclePromise = new Promise<never>((_resolve, reject) => {
    rejectLifecycle = reject;
  });
  const abortFromCaller = () => {
    rejectLifecycle?.(createAbortError());
    requestController.abort();
  };
  args.signal?.addEventListener('abort', abortFromCaller, { once: true });
  timeoutHandle = setTimeout(() => {
    rejectLifecycle?.(new RouteGeometryViewportTimeoutError(timeoutMs));
    requestController.abort();
  }, timeoutMs);

  let result;
  try {
    result = await Promise.race([
      supabase.functions.invoke('route-geometry-segments', {
        body: {
          bbox: args.bbox,
          zoom: args.zoom,
          limit: resultLimit,
          vehicleClass: args.vehicleClass ?? null,
          includeReferenceGeometry: args.includeReferenceGeometry !== false,
          sourceProviderPrefix,
        },
        signal: requestController.signal,
      }),
      lifecyclePromise,
    ]);
    if (args.signal?.aborted) throw createAbortError();
  } catch (invokeError) {
    if (invokeError instanceof RouteGeometryViewportTimeoutError || isAbortError(invokeError)) {
      throw invokeError;
    }
    throw new Error(
      friendlyRouteGeometryViewportError(
        invokeError instanceof Error ? invokeError.message : String(invokeError),
      ),
    );
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle);
    args.signal?.removeEventListener('abort', abortFromCaller);
    rejectLifecycle = null;
  }

  const { data, error, response } = result as {
    data: unknown;
    error: { message?: string } | null;
    response?: Response;
  };

  if (error) {
    const errorBody = data ?? await readRouteGeometryViewportErrorBody(error, response);
    const normalized = normalizeRouteGeometryViewportResponse(errorBody, sourceProviderPrefix);
    if (normalized.degraded || normalized.userMessage || normalized.unavailableReason) {
      return normalized;
    }
    throw new Error(friendlyRouteGeometryViewportError(routeGeometryViewportErrorText(errorBody) ?? error.message));
  }

  return normalizeRouteGeometryViewportResponse(data, sourceProviderPrefix);
}
