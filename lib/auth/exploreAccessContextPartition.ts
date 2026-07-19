import * as CryptoJS from 'crypto-js';

export const EXPLORE_ANONYMOUS_ACCESS_PARTITION = 'anon';
export const EXPLORE_AUTHENTICATED_ACCESS_PARTITION_PREFIX = 'authenticated:';

export type ExploreAccessContextUser = {
  id?: unknown;
  role?: unknown;
  app_metadata?: unknown;
} | null | undefined;

const MATERIAL_APP_METADATA_KEYS = [
  'access_tier',
  'account_id',
  'organization_id',
  'org_id',
  'permissions',
  'role',
  'roles',
  'source_grants',
  'team_id',
  'tier',
] as const;

function cleanText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function stableAuthorizationValue(value: unknown): unknown {
  if (value == null || typeof value === 'boolean' || typeof value === 'string') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (Array.isArray(value)) {
    return value
      .map(stableAuthorizationValue)
      .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
  }
  if (!isRecord(value)) return String(value);
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, entry]) => entry !== undefined && typeof entry !== 'function')
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, stableAuthorizationValue(entry)]),
  );
}

function materialAppMetadata(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) return {};
  return Object.fromEntries(
    MATERIAL_APP_METADATA_KEYS
      .filter((key) => value[key] !== undefined)
      .map((key) => [key, stableAuthorizationValue(value[key])]),
  );
}

export function normalizeExploreAccessContextPartition(value: unknown): string {
  const normalized = cleanText(value);
  if (!normalized) return EXPLORE_ANONYMOUS_ACCESS_PARTITION;
  if (normalized === EXPLORE_ANONYMOUS_ACCESS_PARTITION) return normalized;
  if (/^authenticated:[0-9a-f]{32}$/.test(normalized)) return normalized;
  return EXPLORE_ANONYMOUS_ACCESS_PARTITION;
}

/**
 * Creates a local cache/request partition only. This value is not authorization
 * input and must not be sent to the route-catalog backend.
 */
export function createExploreAccessContextPartition(
  user: ExploreAccessContextUser,
): string {
  const subject = cleanText(user?.id);
  if (!subject) return EXPLORE_ANONYMOUS_ACCESS_PARTITION;

  const basis = JSON.stringify({
    version: 1,
    subject,
    role: cleanText(user?.role) ?? 'authenticated',
    appMetadata: materialAppMetadata(user?.app_metadata),
  });
  const digest = CryptoJS.SHA256(basis).toString(CryptoJS.enc.Hex).slice(0, 32);
  return `${EXPLORE_AUTHENTICATED_ACCESS_PARTITION_PREFIX}${digest}`;
}

export function isAuthenticatedExploreAccessContextPartition(value: unknown): boolean {
  return normalizeExploreAccessContextPartition(value).startsWith(
    EXPLORE_AUTHENTICATED_ACCESS_PARTITION_PREFIX,
  );
}
