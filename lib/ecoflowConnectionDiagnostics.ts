export type EcoFlowConnectionPhase =
  | 'discovered'
  | 'connecting'
  | 'connected'
  | 'handshaking'
  | 'awaitingTelemetry'
  | 'streaming'
  | 'cloudPolling'
  | 'timeout'
  | 'failed'
  | 'disconnected';

export type EcoFlowTimeoutKind =
  | 'scanTimeout'
  | 'connectTimeout'
  | 'handshakeTimeout'
  | 'firstTelemetryTimeout'
  | 'streamStaleTimeout'
  | 'cloudPollTimeout';

export type EcoFlowTelemetrySource =
  | 'local-ble'
  | 'ecoflow-cloud'
  | 'hybrid'
  | 'unavailable';

export type EcoFlowCloudClientState =
  | 'authRequired'
  | 'deviceUnauthorized'
  | 'cloudUnavailable'
  | 'deviceOffline'
  | 'cloudPolling'
  | 'cloudStale';

export interface EcoFlowDiagnosticReason {
  phase: EcoFlowConnectionPhase;
  reason: string;
  canRetry: boolean;
  requiresCloudAuth: boolean;
  requiresNativeBle: boolean;
  cloudState?: EcoFlowCloudClientState | null;
}

export interface EcoFlowDeviceConnectionState {
  deviceId: string;
  deviceName?: string | null;
  productType?: string | null;
  phase: EcoFlowConnectionPhase;
  source: EcoFlowTelemetrySource;
  timeoutKind?: EcoFlowTimeoutKind | null;
  diagnosticReason?: EcoFlowDiagnosticReason | null;
  lastSuccessfulPhase?: EcoFlowConnectionPhase | null;
  lastPacketAt?: number | null;
  cloudState?: EcoFlowCloudClientState | null;
  updatedAt: number;
}

interface EcoFlowConnectionPhaseInput {
  deviceId: string;
  deviceName?: string | null;
  productType?: string | null;
  phase: EcoFlowConnectionPhase;
  source: EcoFlowTelemetrySource;
  diagnosticReason?: EcoFlowDiagnosticReason | null;
  lastSuccessfulPhase?: EcoFlowConnectionPhase | null;
  lastPacketAt?: number | null;
  cloudState?: EcoFlowCloudClientState | null;
  now?: number;
}

interface EcoFlowTimeoutInput extends Omit<EcoFlowConnectionPhaseInput, 'phase'> {
  timeoutKind: EcoFlowTimeoutKind;
  reason: string;
  canRetry: boolean;
  requiresCloudAuth: boolean;
  requiresNativeBle: boolean;
  lastSuccessfulPhase?: EcoFlowConnectionPhase | null;
}

interface EcoFlowFailureInput extends Omit<EcoFlowConnectionPhaseInput, 'phase'> {
  reason: string;
  canRetry: boolean;
  requiresCloudAuth: boolean;
  requiresNativeBle: boolean;
  lastSuccessfulPhase?: EcoFlowConnectionPhase | null;
}

const ecoFlowConnectionStates = new Map<string, EcoFlowDeviceConnectionState>();

function normalizeDeviceId(deviceId: string): string {
  return String(deviceId ?? '').trim();
}

function isSuccessfulPhase(phase: EcoFlowConnectionPhase): boolean {
  return (
    phase === 'discovered' ||
    phase === 'connecting' ||
    phase === 'connected' ||
    phase === 'handshaking' ||
    phase === 'awaitingTelemetry' ||
    phase === 'streaming' ||
    phase === 'cloudPolling'
  );
}

export function recordEcoFlowConnectionPhase(
  input: EcoFlowConnectionPhaseInput,
): EcoFlowDeviceConnectionState | null {
  const deviceId = normalizeDeviceId(input.deviceId);
  if (!deviceId) return null;

  const previous = ecoFlowConnectionStates.get(deviceId) ?? null;
  const updatedAt = input.now ?? Date.now();
  const lastSuccessfulPhase =
    input.lastSuccessfulPhase ??
    (isSuccessfulPhase(input.phase) ? input.phase : previous?.lastSuccessfulPhase ?? null);

  const next: EcoFlowDeviceConnectionState = {
    deviceId,
    deviceName: input.deviceName ?? previous?.deviceName ?? null,
    productType: input.productType ?? previous?.productType ?? null,
    phase: input.phase,
    source: input.source,
    timeoutKind: input.phase === 'timeout' ? previous?.timeoutKind ?? null : null,
    diagnosticReason: input.diagnosticReason ?? null,
    lastSuccessfulPhase,
    lastPacketAt: input.lastPacketAt ?? previous?.lastPacketAt ?? null,
    cloudState:
      input.diagnosticReason?.cloudState ??
      previous?.cloudState ??
      (input.phase === 'cloudPolling' ? 'cloudPolling' : null),
    updatedAt,
  };

  ecoFlowConnectionStates.set(deviceId, next);
  return next;
}

export function recordEcoFlowTimeout(input: EcoFlowTimeoutInput): EcoFlowDeviceConnectionState | null {
  const state = recordEcoFlowConnectionPhase({
    deviceId: input.deviceId,
    deviceName: input.deviceName,
    productType: input.productType,
    phase: 'timeout',
    source: input.source,
    diagnosticReason: {
      phase: 'timeout',
      reason: input.reason,
      canRetry: input.canRetry,
      requiresCloudAuth: input.requiresCloudAuth,
      requiresNativeBle: input.requiresNativeBle,
      cloudState: input.cloudState ?? null,
    },
    lastSuccessfulPhase: input.lastSuccessfulPhase,
    lastPacketAt: input.lastPacketAt,
    now: input.now,
  });
  if (!state) return null;
  const next = { ...state, timeoutKind: input.timeoutKind };
  ecoFlowConnectionStates.set(state.deviceId, next);
  return next;
}

export function recordEcoFlowFailure(input: EcoFlowFailureInput): EcoFlowDeviceConnectionState | null {
  return recordEcoFlowConnectionPhase({
    deviceId: input.deviceId,
    deviceName: input.deviceName,
    productType: input.productType,
    phase: 'failed',
    source: input.source,
    diagnosticReason: {
      phase: 'failed',
      reason: input.reason,
      canRetry: input.canRetry,
      requiresCloudAuth: input.requiresCloudAuth,
      requiresNativeBle: input.requiresNativeBle,
      cloudState: input.cloudState ?? null,
    },
    lastSuccessfulPhase: input.lastSuccessfulPhase,
    lastPacketAt: input.lastPacketAt,
    now: input.now,
  });
}

export function getEcoFlowConnectionState(deviceId: string): EcoFlowDeviceConnectionState | null {
  return ecoFlowConnectionStates.get(normalizeDeviceId(deviceId)) ?? null;
}

export function getAllEcoFlowConnectionStates(): EcoFlowDeviceConnectionState[] {
  return Array.from(ecoFlowConnectionStates.values());
}

export function clearEcoFlowConnectionState(deviceId?: string | null): void {
  const normalized = normalizeDeviceId(deviceId ?? '');
  if (normalized) {
    ecoFlowConnectionStates.delete(normalized);
    return;
  }
  ecoFlowConnectionStates.clear();
}
