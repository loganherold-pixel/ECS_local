const ECOFLOW_UNAUTHORIZED_DEVICE_PATTERNS = [
  'current device is not allowed to get device info',
  'not allowed to get device info',
  'device is not allowed',
  'not allowed',
  'permission denied',
  'forbidden',
  'not authorized',
  'not authorised',
  'unauthorized device',
  'device unauthorized',
];

export const ECOFLOW_PUBLIC_API_AUTH_BLOCKED_MODELS = [
  'DELTA 3 1500',
  'DELTA Mini',
  'Alternator Charger',
];

const ECOFLOW_PUBLIC_API_AUTH_BLOCKED_MODEL_PATTERNS = [
  { model: 'DELTA 3 1500', patterns: ['delta31500', 'ecoflowdelta31500'] },
  { model: 'DELTA Mini', patterns: ['deltamini', 'ecoflowdeltamini'] },
  {
    model: 'Alternator Charger',
    patterns: [
      'alternatorcharger',
      'ecoflowalternatorcharger',
      '800walternatorcharger',
      'alternatorcharger800w',
    ],
  },
];

export const ECOFLOW_PUBLIC_API_AUTHORIZATION_CODE = '1006';

export const ECOFLOW_PUBLIC_API_AUTHORIZATION_PENDING_REASON =
  'EcoFlow public API authorization is pending for this model in the current EcoFlow developer app.';

export const ECOFLOW_UNAUTHORIZED_DEVICE_REASON =
  'EcoFlow cloud access is not authorized for this device.';

function collectStrings(value: unknown, into: string[], depth = 0): void {
  if (value == null || depth > 3) return;

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    into.push(String(value));
    return;
  }

  if (value instanceof Error) {
    into.push(value.message);
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) collectStrings(item, into, depth + 1);
    return;
  }

  if (typeof value === 'object') {
    for (const item of Object.values(value as Record<string, unknown>)) {
      collectStrings(item, into, depth + 1);
    }
  }
}

function normalizeAuthMatchText(value: unknown): string {
  return String(value ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function collectAuthStrings(value: unknown): string[] {
  const parts: string[] = [];
  collectStrings(value, parts);
  return parts;
}

function findEcoFlowPublicApiAuthorizationBlockedModel(value: unknown): string | null {
  const normalizedParts = collectAuthStrings(value).map(normalizeAuthMatchText);
  for (const candidate of ECOFLOW_PUBLIC_API_AUTH_BLOCKED_MODEL_PATTERNS) {
    if (normalizedParts.some((part) => candidate.patterns.some((pattern) => part.includes(pattern)))) {
      return candidate.model;
    }
  }
  return null;
}

export function isEcoFlowPublicApiAuthorizationCode(value: unknown): boolean {
  const parts = collectAuthStrings(value);
  return parts.some((part) =>
    new RegExp(`(^|[^0-9])${ECOFLOW_PUBLIC_API_AUTHORIZATION_CODE}([^0-9]|$)`).test(part),
  );
}

export function isEcoFlowPublicApiAuthorizationBlockedModel(value: unknown): boolean {
  return findEcoFlowPublicApiAuthorizationBlockedModel(value) != null;
}

export function isEcoFlowPublicApiAuthorizationBlockedError(value: unknown): boolean {
  const haystack = collectAuthStrings(value).join(' ').toLowerCase();
  return (
    isEcoFlowPublicApiAuthorizationCode(value) ||
    haystack.includes('public api authorization') ||
    haystack.includes('public_api_authorization_pending') ||
    haystack.includes('unsupported by current app') ||
    haystack.includes('unsupported by the current app') ||
    haystack.includes('current ecoflow developer app')
  );
}

export function describeEcoFlowPublicApiAuthorizationBlock(value?: unknown): string {
  const model = findEcoFlowPublicApiAuthorizationBlockedModel(value);
  const modelText = model ? `${model} ` : '';
  return `${modelText}${ECOFLOW_PUBLIC_API_AUTHORIZATION_PENDING_REASON} EcoFlow support confirmed ${ECOFLOW_PUBLIC_API_AUTH_BLOCKED_MODELS.join(', ')} can return API code ${ECOFLOW_PUBLIC_API_AUTHORIZATION_CODE} until EcoFlow grants public API access for the app/device authorization. ECS keeps the device visible but will not mark telemetry live until decoded data arrives.`;
}

export function isEcoFlowUnauthorizedDeviceError(value: unknown): boolean {
  if (isEcoFlowPublicApiAuthorizationBlockedError(value)) return true;
  const parts: string[] = [];
  collectStrings(value, parts);
  const haystack = parts.join(' ').toLowerCase();
  return ECOFLOW_UNAUTHORIZED_DEVICE_PATTERNS.some((pattern) =>
    haystack.includes(pattern),
  );
}
