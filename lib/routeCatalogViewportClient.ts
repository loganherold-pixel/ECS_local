import {
  EDGE_FUNCTION_UNAVAILABLE_CODE,
  SUPABASE_CONFIG_UNAVAILABLE_CODE,
  isDeployedEdgeFunction,
  isSupabaseConfigured,
  supabase,
} from './supabase';
import {
  queryRouteCatalogViewportRecords,
  type RouteCatalogViewportQuery,
  type RouteCatalogViewportResult,
} from './routeCatalogViewport';
import {
  buildNavigateRouteCatalogQueryDiagnostic,
  logRouteCatalogVisibilityDiagnostic,
} from './routeCatalogVisibilityDiagnostics';

type RouteCatalogViewportClient = {
  functions: {
    invoke: (
      name: string,
      options: { body: RouteCatalogViewportSearchBody; signal?: AbortSignal },
    ) => Promise<{ data: unknown; error?: { message?: string } | null }>;
  };
};

function createAbortError(): Error {
  const error = new Error('Request canceled');
  error.name = 'AbortError';
  return error;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

export const ROUTE_CATALOG_VIEWPORT_REQUEST_TIMEOUT_MS = 12_000;

export class RouteCatalogViewportTimeoutError extends Error {
  readonly timeoutMs: number;

  constructor(timeoutMs: number) {
    super('ECS route catalog request timed out. Retry or pan the map to refresh.');
    this.name = 'RouteCatalogViewportTimeoutError';
    this.timeoutMs = timeoutMs;
  }
}

export class RouteCatalogViewportResponseError extends Error {
  readonly safeErrorCode:
    | 'ROUTE_CATALOG_PROVIDER_REJECTED'
    | 'ROUTE_CATALOG_MALFORMED_RESPONSE';

  constructor(
    safeErrorCode:
      | 'ROUTE_CATALOG_PROVIDER_REJECTED'
      | 'ROUTE_CATALOG_MALFORMED_RESPONSE',
  ) {
    super(
      safeErrorCode === 'ROUTE_CATALOG_PROVIDER_REJECTED'
        ? 'ECS route catalog provider rejected the request.'
        : 'ECS route catalog returned an invalid response.',
    );
    this.name = 'RouteCatalogViewportResponseError';
    this.safeErrorCode = safeErrorCode;
  }
}

export type RouteCatalogViewportProviderAvailability = {
  available: boolean;
  safeErrorCode: typeof SUPABASE_CONFIG_UNAVAILABLE_CODE | typeof EDGE_FUNCTION_UNAVAILABLE_CODE | null;
  reason: 'active' | 'supabase_not_configured' | 'edge_function_unavailable';
};

export class RouteCatalogViewportProviderUnavailableError extends Error {
  readonly safeErrorCode: Exclude<RouteCatalogViewportProviderAvailability['safeErrorCode'], null>;
  readonly reason: Exclude<RouteCatalogViewportProviderAvailability['reason'], 'active'>;

  constructor(availability: RouteCatalogViewportProviderAvailability) {
    super('ECS route catalog is unavailable in this build.');
    this.name = 'RouteCatalogViewportProviderUnavailableError';
    this.safeErrorCode = availability.safeErrorCode ?? SUPABASE_CONFIG_UNAVAILABLE_CODE;
    this.reason = availability.reason === 'active' ? 'supabase_not_configured' : availability.reason;
  }
}

export function getRouteCatalogViewportProviderAvailability(): RouteCatalogViewportProviderAvailability {
  if (!isSupabaseConfigured) {
    return {
      available: false,
      safeErrorCode: SUPABASE_CONFIG_UNAVAILABLE_CODE,
      reason: 'supabase_not_configured',
    };
  }
  if (!isDeployedEdgeFunction('route-catalog-search')) {
    return {
      available: false,
      safeErrorCode: EDGE_FUNCTION_UNAVAILABLE_CODE,
      reason: 'edge_function_unavailable',
    };
  }
  return { available: true, safeErrorCode: null, reason: 'active' };
}

export type RouteCatalogViewportSearchBody = {
  latitude: number;
  longitude: number;
  radiusMiles: number;
  limit: number;
  includeGeometry: true;
  includePreviewGeometry: true;
  includeAssessment: true;
  recommendationOnly: false;
  locationSource: 'navigate_ecs_route_geometry_viewport';
};

function readRecord(value: unknown): Record<string, unknown> | null {
  return value != null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function readRecords(value: unknown): unknown[] {
  const record = readRecord(value);
  if (record?.ok === false) {
    throw new RouteCatalogViewportResponseError('ROUTE_CATALOG_PROVIDER_REJECTED');
  }
  if (record?.ok !== true) {
    throw new RouteCatalogViewportResponseError('ROUTE_CATALOG_MALFORMED_RESPONSE');
  }
  if (Array.isArray(record.records)) return record.records;
  if (Array.isArray(record.routes)) return record.routes;
  throw new RouteCatalogViewportResponseError('ROUTE_CATALOG_MALFORMED_RESPONSE');
}

export function buildRouteCatalogViewportSearchBody(
  query: RouteCatalogViewportQuery,
): RouteCatalogViewportSearchBody {
  return {
    latitude: query.center.latitude,
    longitude: query.center.longitude,
    radiusMiles: query.radiusMiles,
    limit: query.limit,
    includeGeometry: true,
    includePreviewGeometry: true,
    includeAssessment: true,
    recommendationOnly: false,
    locationSource: 'navigate_ecs_route_geometry_viewport',
  };
}

export async function fetchRouteCatalogViewportFeatures(
  query: RouteCatalogViewportQuery,
  options: {
    client?: RouteCatalogViewportClient;
    signal?: AbortSignal;
    timeoutMs?: number;
  } = {},
): Promise<RouteCatalogViewportResult> {
  if (options.signal?.aborted) throw createAbortError();
  if (!options.client) {
    const providerAvailability = getRouteCatalogViewportProviderAvailability();
    if (!providerAvailability.available) {
      throw new RouteCatalogViewportProviderUnavailableError(providerAvailability);
    }
  }

  const client = options.client ?? (supabase as unknown as RouteCatalogViewportClient);
  const body = buildRouteCatalogViewportSearchBody(query);
  const requestedTimeoutMs = options.timeoutMs ?? ROUTE_CATALOG_VIEWPORT_REQUEST_TIMEOUT_MS;
  const timeoutMs = Number.isFinite(requestedTimeoutMs)
    ? Math.max(1, Math.trunc(requestedTimeoutMs))
    : ROUTE_CATALOG_VIEWPORT_REQUEST_TIMEOUT_MS;
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
  options.signal?.addEventListener('abort', abortFromCaller, { once: true });
  timeoutHandle = setTimeout(() => {
    rejectLifecycle?.(new RouteCatalogViewportTimeoutError(timeoutMs));
    requestController.abort();
  }, timeoutMs);

  let invocationResult: { data: unknown; error?: { message?: string } | null };
  try {
    invocationResult = await Promise.race([
      client.functions.invoke('route-catalog-search', {
        body,
        signal: requestController.signal,
      }),
      lifecyclePromise,
    ]);
    if (options.signal?.aborted) throw createAbortError();
  } catch (error) {
    if (error instanceof RouteCatalogViewportTimeoutError || isAbortError(error)) throw error;
    throw error instanceof Error ? error : new Error(String(error));
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle);
    options.signal?.removeEventListener('abort', abortFromCaller);
    rejectLifecycle = null;
  }

  const { data, error } = invocationResult;
  if (error) {
    throw new Error(error.message || 'ECS route catalog is unavailable.');
  }
  const records = readRecords(data);
  const result = queryRouteCatalogViewportRecords(records, query);
  logRouteCatalogVisibilityDiagnostic(
    'navigate_viewport',
    buildNavigateRouteCatalogQueryDiagnostic(records, query) as unknown as Record<string, unknown>,
    {
      fingerprint: query.cacheKey,
    },
  );
  return result;
}
