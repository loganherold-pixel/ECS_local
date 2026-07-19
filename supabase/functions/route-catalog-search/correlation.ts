export const ECS_ROUTE_CATALOG_REQUEST_ID_HEADER = 'x-ecs-request-id';

const ECS_REQUEST_ID_MAX_LENGTH = 64;
const ECS_UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type RouteCatalogEdgeCorrelationEvent =
  | 'request_start'
  | 'nearby_rpc_start'
  | 'nearby_rpc_complete'
  | 'response_complete';

export type RouteCatalogEdgeCorrelationPayload = {
  component: 'route-catalog-search';
  event: RouteCatalogEdgeCorrelationEvent;
  requestId: string;
  candidateCount?: number;
  returnedCount?: number;
  blockedCount?: number;
  rpcUsed?: boolean;
  durationMs?: number;
};

export type RouteCatalogEdgeTrace = {
  requestId: string;
  startedAtMs: number;
  nearbyRpcStarted: boolean;
  now: () => number;
  emit: (
    event: RouteCatalogEdgeCorrelationEvent,
    aggregates?: Omit<RouteCatalogEdgeCorrelationPayload, 'component' | 'event' | 'requestId'>,
  ) => RouteCatalogEdgeCorrelationPayload;
};

function hasControlCharacters(value: string): boolean {
  return /[\u0000-\u001f\u007f]/.test(value);
}

export function isValidRouteCatalogRequestId(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= ECS_REQUEST_ID_MAX_LENGTH &&
    value === value.trim() &&
    !hasControlCharacters(value) &&
    ECS_UUID_PATTERN.test(value)
  );
}

export function resolveRouteCatalogRequestId(
  value: unknown,
  generate: () => string = () => crypto.randomUUID(),
): string {
  if (isValidRouteCatalogRequestId(value)) return value;
  const generated = generate();
  if (!isValidRouteCatalogRequestId(generated)) {
    throw new Error('Unable to create a valid ECS route-catalog request identifier.');
  }
  return generated;
}

function safeCount(value: unknown): number | undefined {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 0 ? Math.floor(numeric) : undefined;
}

function safeDuration(value: unknown): number | undefined {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 0
    ? Math.round(numeric * 100) / 100
    : undefined;
}

export function createRouteCatalogEdgeTrace(args: {
  requestId: string;
  startedAtMs?: number;
  now?: () => number;
  logger?: (line: string) => void;
}): RouteCatalogEdgeTrace {
  const requestId = resolveRouteCatalogRequestId(args.requestId);
  const now = args.now ?? (() => performance.now());
  const startedAtMs = args.startedAtMs ?? now();
  const logger = args.logger ?? ((line: string) => console.info(line));

  return {
    requestId,
    startedAtMs,
    nearbyRpcStarted: false,
    now,
    emit(event, aggregates = {}) {
      const payload: RouteCatalogEdgeCorrelationPayload = {
        component: 'route-catalog-search',
        event,
        requestId,
      };
      const candidateCount = safeCount(aggregates.candidateCount);
      const returnedCount = safeCount(aggregates.returnedCount);
      const blockedCount = safeCount(aggregates.blockedCount);
      const durationMs = safeDuration(aggregates.durationMs);
      if (candidateCount != null) payload.candidateCount = candidateCount;
      if (returnedCount != null) payload.returnedCount = returnedCount;
      if (blockedCount != null) payload.blockedCount = blockedCount;
      if (typeof aggregates.rpcUsed === 'boolean') payload.rpcUsed = aggregates.rpcUsed;
      if (durationMs != null) payload.durationMs = durationMs;
      logger(JSON.stringify(payload));
      return payload;
    },
  };
}

export async function traceNearbyRouteCatalogRpc<
  T extends { data?: unknown; error?: unknown },
>(
  trace: RouteCatalogEdgeTrace | null | undefined,
  invoke: () => PromiseLike<T>,
): Promise<T> {
  if (!trace) return Promise.resolve(invoke());
  const rpcStartedAtMs = trace.now();
  trace.nearbyRpcStarted = true;
  trace.emit('nearby_rpc_start', {
    candidateCount: 0,
    returnedCount: 0,
    blockedCount: 0,
    rpcUsed: true,
    durationMs: 0,
  });
  try {
    const result = await Promise.resolve(invoke());
    const rowCount = Array.isArray(result.data) ? result.data.length : 0;
    trace.emit('nearby_rpc_complete', {
      candidateCount: rowCount,
      returnedCount: rowCount,
      blockedCount: 0,
      rpcUsed: true,
      durationMs: trace.now() - rpcStartedAtMs,
    });
    return result;
  } catch (error) {
    trace.emit('nearby_rpc_complete', {
      candidateCount: 0,
      returnedCount: 0,
      blockedCount: 0,
      rpcUsed: true,
      durationMs: trace.now() - rpcStartedAtMs,
    });
    throw error;
  }
}

export function routeCatalogCorrelationResponseHeaders(
  baseHeaders: Record<string, string>,
  requestId: string,
): Record<string, string> {
  return {
    ...baseHeaders,
    [ECS_ROUTE_CATALOG_REQUEST_ID_HEADER]: resolveRouteCatalogRequestId(requestId),
  };
}

export function routeCatalogResponseMetadata(
  body: Record<string, unknown>,
  requestId: string,
): Record<string, unknown> {
  const meta = body.meta && typeof body.meta === 'object'
    ? body.meta as Record<string, unknown>
    : {};
  return {
    ...body,
    meta: {
      ...meta,
      ecsRequestId: resolveRouteCatalogRequestId(requestId),
    },
  };
}
