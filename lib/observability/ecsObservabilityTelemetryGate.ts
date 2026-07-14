import { createPersistedKeyValueCache } from '../keyValuePersistence';

export const ECS_OBSERVABILITY_TELEMETRY_FLAG = 'EXPO_PUBLIC_ECS_OBSERVABILITY_TELEMETRY_ENABLED';
export const ECS_OBSERVABILITY_PRIVACY_APPROVAL_FLAG = 'EXPO_PUBLIC_ECS_OBSERVABILITY_PRIVACY_APPROVED';
export const ECS_OBSERVABILITY_CONSENT_VERSION = 1;

export type ECSObservabilityTelemetryGateReason =
  | 'enabled'
  | 'manual_submission'
  | 'backend_unavailable'
  | 'transport_disabled'
  | 'privacy_approval_missing'
  | 'user_consent_missing';

export type ECSObservabilityTelemetryGate = {
  enabled: boolean;
  reason: ECSObservabilityTelemetryGateReason;
};

export type ECSObservabilityTelemetryGateInput = {
  backendConfigured: boolean;
  transportEnabled: boolean;
  privacyApproved: boolean;
  userConsented: boolean;
  manualSubmission: boolean;
};

const CONSENT_CACHE = createPersistedKeyValueCache('ecs_observability_consent');
const CONSENT_KEY = `telemetry_consent_v${ECS_OBSERVABILITY_CONSENT_VERSION}`;

function isTruthy(value: unknown): boolean {
  return value === true || (typeof value === 'string' && /^(1|true|yes|on)$/i.test(value.trim()));
}

function readRuntimeValue(key: string): unknown {
  try {
    const globalStore = globalThis as unknown as Record<string, unknown>;
    const env = (globalThis as unknown as { process?: { env?: Record<string, string | undefined> } }).process?.env;
    return globalStore[key] ?? globalStore[`__${key}`] ?? env?.[key];
  } catch {
    return undefined;
  }
}

export function evaluateECSObservabilityTelemetryGate(
  input: ECSObservabilityTelemetryGateInput,
): ECSObservabilityTelemetryGate {
  if (!input.backendConfigured) return { enabled: false, reason: 'backend_unavailable' };
  if (!input.transportEnabled) return { enabled: false, reason: 'transport_disabled' };
  if (!input.privacyApproved) return { enabled: false, reason: 'privacy_approval_missing' };
  if (input.manualSubmission) return { enabled: true, reason: 'manual_submission' };
  if (!input.userConsented) return { enabled: false, reason: 'user_consent_missing' };
  return { enabled: true, reason: 'enabled' };
}

export function getECSObservabilityTelemetryConsent(): boolean {
  return CONSENT_CACHE.get(CONSENT_KEY) === 'true';
}

export async function setECSObservabilityTelemetryConsent(consented: boolean): Promise<void> {
  await CONSENT_CACHE.waitForHydration();
  CONSENT_CACHE.set(CONSENT_KEY, consented ? 'true' : 'false');
  await CONSENT_CACHE.flush();
}

export function getECSObservabilityTelemetryGate(input: {
  backendConfigured: boolean;
  manualSubmission?: boolean;
}): ECSObservabilityTelemetryGate {
  return evaluateECSObservabilityTelemetryGate({
    backendConfigured: input.backendConfigured,
    transportEnabled: isTruthy(readRuntimeValue(ECS_OBSERVABILITY_TELEMETRY_FLAG)),
    privacyApproved: isTruthy(readRuntimeValue(ECS_OBSERVABILITY_PRIVACY_APPROVAL_FLAG)),
    userConsented: getECSObservabilityTelemetryConsent(),
    manualSubmission: input.manualSubmission === true,
  });
}

export async function hydrateECSObservabilityTelemetryConsent(): Promise<void> {
  await CONSENT_CACHE.waitForHydration();
}
