const REDACTED_VALUE = '[redacted]';
const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const UUID_PATTERN = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;

function normalizeKey(key: string): string {
  return key.replace(/[_\-\s]/g, '').toLowerCase();
}

function normalizeAuthString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

export function hashAuthIdentifier(value: unknown): string | null {
  const normalized = normalizeAuthString(value);
  if (!normalized) return null;

  let hash = 0x811c9dc5;
  for (let index = 0; index < normalized.length; index += 1) {
    hash ^= normalized.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return `auth_${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

export function maskAuthEmail(value: unknown): string | null {
  const normalized = normalizeAuthString(value)?.toLowerCase();
  if (!normalized) return null;

  const atIndex = normalized.indexOf('@');
  if (atIndex <= 0 || atIndex === normalized.length - 1) {
    return hashAuthIdentifier(normalized);
  }

  const local = normalized.slice(0, atIndex);
  const domain = normalized.slice(atIndex + 1);
  const first = local.charAt(0);

  return `${first}***@${domain}`;
}

export function redactAuthUserId(value: unknown): string | null {
  const hash = hashAuthIdentifier(value);
  return hash ? `user_${hash.slice('auth_'.length)}` : null;
}

function redactAuthStringContent(value: string): string {
  return value
    .replace(EMAIL_PATTERN, (match) => maskAuthEmail(match) ?? REDACTED_VALUE)
    .replace(UUID_PATTERN, (match) => redactAuthUserId(match) ?? REDACTED_VALUE);
}

function isEmailKey(key: string): boolean {
  const normalized = normalizeKey(key);
  return normalized === 'email' || normalized === 'loginemail' || normalized.endsWith('useremail');
}

function isUserIdKey(key: string): boolean {
  const normalized = normalizeKey(key);
  return normalized === 'userid' || normalized === 'authuserid' || normalized.endsWith('userid');
}

function isPasswordKey(key: string): boolean {
  return normalizeKey(key).includes('password');
}

function isTokenKey(key: string): boolean {
  const normalized = normalizeKey(key);
  return normalized === 'token' || normalized.endsWith('token');
}

function isSessionDataKey(key: string): boolean {
  const normalized = normalizeKey(key);
  return normalized === 'session' || normalized === 'sessiondata' || normalized === 'authsession' || normalized === 'supabasesession';
}

function sanitizeByKey(key: string, value: unknown, depth: number): unknown {
  if (isPasswordKey(key) || isTokenKey(key) || isSessionDataKey(key)) {
    return value == null ? value : REDACTED_VALUE;
  }

  if (isEmailKey(key)) {
    return typeof value === 'string' ? maskAuthEmail(value) : value;
  }

  if (isUserIdKey(key)) {
    return typeof value === 'string' ? redactAuthUserId(value) : value;
  }

  return sanitizeAuthLogPayload(value, depth + 1);
}

export function sanitizeAuthLogPayload<T = unknown>(payload: T, depth = 0): T {
  if (payload == null || depth > 8) return payload;

  if (Array.isArray(payload)) {
    return payload.map((item) => sanitizeAuthLogPayload(item, depth + 1)) as T;
  }

  if (typeof payload !== 'object') {
    return (typeof payload === 'string' ? redactAuthStringContent(payload) : payload) as T;
  }

  const sanitized: Record<string, unknown> = {};
  Object.entries(payload as Record<string, unknown>).forEach(([key, value]) => {
    sanitized[key] = sanitizeByKey(key, value, depth);
  });

  return sanitized as T;
}
