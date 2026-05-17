const ECOFLOW_UNAUTHORIZED_DEVICE_PATTERNS = [
  'current device is not allowed to get device info',
  'not allowed to get device info',
  'device is not allowed',
  'not allowed',
  'permission denied',
  'forbidden',
  'unauthorized device',
  'device unauthorized',
];

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

export function isEcoFlowUnauthorizedDeviceError(value: unknown): boolean {
  const parts: string[] = [];
  collectStrings(value, parts);
  const haystack = parts.join(' ').toLowerCase();
  return ECOFLOW_UNAUTHORIZED_DEVICE_PATTERNS.some((pattern) =>
    haystack.includes(pattern),
  );
}
