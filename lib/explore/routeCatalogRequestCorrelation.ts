export const ECS_ROUTE_CATALOG_REQUEST_ID_HEADER = 'x-ecs-request-id';
export const ECS_ROUTE_CATALOG_CORRELATION_LOG_TAG = '[ECS:ROUTE_CATALOG_CORRELATION]';

const ECS_REQUEST_ID_MAX_LENGTH = 64;
const ECS_UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SAFE_LABEL_PATTERN = /^[a-z0-9_.:-]{1,64}$/i;

type RandomCrypto = {
  randomUUID?: () => string;
  getRandomValues?: (values: Uint8Array) => Uint8Array;
};

export type RouteCatalogClientCorrelationEvent =
  | 'client_request_start'
  | 'client_normalization_complete'
  | 'explorer_surface_render';

export type RouteCatalogClientCorrelationInput = {
  event: RouteCatalogClientCorrelationEvent;
  requestId: string;
  responseRequestId?: string | null;
  responseIdSource?: 'response_header' | 'response_meta' | 'client_generated';
  revalidationRequestId?: string | null;
  status?: string | null;
  surfaceKind?: string | null;
  candidateCount?: number | null;
  returnedCount?: number | null;
  blockedCount?: number | null;
  normalizedCount?: number | null;
  discoverableCount?: number | null;
  guidanceReadyCount?: number | null;
  visibleCount?: number | null;
  rpcUsed?: boolean | null;
  durationMs?: number | null;
};

export type RouteCatalogClientCorrelationDiagnostic = {
  component: 'ecs_explorer_route_catalog';
  event: RouteCatalogClientCorrelationEvent;
  requestId: string;
  responseRequestId?: string;
  responseIdSource?: 'response_header' | 'response_meta' | 'client_generated';
  revalidationRequestId?: string;
  status?: string;
  surfaceKind?: string;
  candidateCount?: number;
  returnedCount?: number;
  blockedCount?: number;
  normalizedCount?: number;
  discoverableCount?: number;
  guidanceReadyCount?: number;
  visibleCount?: number;
  rpcUsed?: boolean;
  durationMs?: number;
};

function hasControlCharacters(value: string): boolean {
  return /[\u0000-\u001f\u007f]/.test(value);
}

export function normalizeECSRouteCatalogRequestId(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  if (value.length === 0 || value.length > ECS_REQUEST_ID_MAX_LENGTH) return null;
  if (value !== value.trim() || hasControlCharacters(value)) return null;
  return ECS_UUID_PATTERN.test(value) ? value : null;
}

function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  const cryptoRef = (globalThis as unknown as { crypto?: RandomCrypto }).crypto;
  if (cryptoRef?.getRandomValues) return cryptoRef.getRandomValues(bytes);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Math.floor(Math.random() * 256);
  }
  return bytes;
}

export function createECSRouteCatalogRequestId(): string {
  const cryptoRef = (globalThis as unknown as { crypto?: RandomCrypto }).crypto;
  const nativeUuid = cryptoRef?.randomUUID?.();
  if (normalizeECSRouteCatalogRequestId(nativeUuid)) return nativeUuid as string;

  const bytes = randomBytes(16);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join('-');
}

export function resolveECSRouteCatalogResponseRequestId(args: {
  sentRequestId: string;
  responseHeaderRequestId?: unknown;
  responseMetaRequestId?: unknown;
}): string {
  return resolveECSRouteCatalogResponseRequestCorrelation(args).requestId;
}

export function resolveECSRouteCatalogResponseRequestCorrelation(args: {
  sentRequestId: string;
  responseHeaderRequestId?: unknown;
  responseMetaRequestId?: unknown;
}): {
  requestId: string;
  source: 'response_header' | 'response_meta' | 'client_generated';
} {
  const headerRequestId = normalizeECSRouteCatalogRequestId(args.responseHeaderRequestId);
  if (headerRequestId) return { requestId: headerRequestId, source: 'response_header' };
  const metaRequestId = normalizeECSRouteCatalogRequestId(args.responseMetaRequestId);
  if (metaRequestId) return { requestId: metaRequestId, source: 'response_meta' };
  return {
    requestId: normalizeECSRouteCatalogRequestId(args.sentRequestId)
      ?? createECSRouteCatalogRequestId(),
    source: 'client_generated',
  };
}

function safeLabel(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim();
  return SAFE_LABEL_PATTERN.test(normalized) ? normalized : undefined;
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

export function buildRouteCatalogClientCorrelationDiagnostic(
  input: RouteCatalogClientCorrelationInput,
): RouteCatalogClientCorrelationDiagnostic | null {
  const requestId = normalizeECSRouteCatalogRequestId(input.requestId);
  if (!requestId) return null;

  const diagnostic: RouteCatalogClientCorrelationDiagnostic = {
    component: 'ecs_explorer_route_catalog',
    event: input.event,
    requestId,
  };
  const responseRequestId = normalizeECSRouteCatalogRequestId(input.responseRequestId);
  const revalidationRequestId = normalizeECSRouteCatalogRequestId(input.revalidationRequestId);
  const status = safeLabel(input.status);
  const surfaceKind = safeLabel(input.surfaceKind);
  const candidateCount = safeCount(input.candidateCount);
  const returnedCount = safeCount(input.returnedCount);
  const blockedCount = safeCount(input.blockedCount);
  const normalizedCount = safeCount(input.normalizedCount);
  const discoverableCount = safeCount(input.discoverableCount);
  const guidanceReadyCount = safeCount(input.guidanceReadyCount);
  const visibleCount = safeCount(input.visibleCount);
  const durationMs = safeDuration(input.durationMs);

  if (responseRequestId) diagnostic.responseRequestId = responseRequestId;
  if (input.responseIdSource) diagnostic.responseIdSource = input.responseIdSource;
  if (revalidationRequestId) diagnostic.revalidationRequestId = revalidationRequestId;
  if (status) diagnostic.status = status;
  if (surfaceKind) diagnostic.surfaceKind = surfaceKind;
  if (candidateCount != null) diagnostic.candidateCount = candidateCount;
  if (returnedCount != null) diagnostic.returnedCount = returnedCount;
  if (blockedCount != null) diagnostic.blockedCount = blockedCount;
  if (normalizedCount != null) diagnostic.normalizedCount = normalizedCount;
  if (discoverableCount != null) diagnostic.discoverableCount = discoverableCount;
  if (guidanceReadyCount != null) diagnostic.guidanceReadyCount = guidanceReadyCount;
  if (visibleCount != null) diagnostic.visibleCount = visibleCount;
  if (typeof input.rpcUsed === 'boolean') diagnostic.rpcUsed = input.rpcUsed;
  if (durationMs != null) diagnostic.durationMs = durationMs;
  return diagnostic;
}

export function logRouteCatalogClientCorrelationDiagnostic(
  input: RouteCatalogClientCorrelationInput,
  options: {
    enabled?: boolean;
    logger?: (tag: string, payload: RouteCatalogClientCorrelationDiagnostic) => void;
  } = {},
): boolean {
  const enabled = options.enabled ?? (
    (typeof __DEV__ !== 'undefined' && __DEV__ === true) ||
    (typeof process !== 'undefined' && process.env?.NODE_ENV === 'development')
  );
  if (!enabled) return false;
  const diagnostic = buildRouteCatalogClientCorrelationDiagnostic(input);
  if (!diagnostic) return false;
  const logger = options.logger ?? ((tag, payload) => console.info(tag, JSON.stringify(payload)));
  logger(ECS_ROUTE_CATALOG_CORRELATION_LOG_TAG, diagnostic);
  return true;
}
