import type {
  BluConnectionStatus,
  BluStreamHealth,
  BluStreamPhase,
  BluTelemetryEnvelopeError,
  BluTelemetryEnvelopeSource,
  BluTelemetryHealth,
} from './BluTypes';
import {
  bluLog,
  bluLogThrottled,
  buildBluTelemetryLogDetails,
  buildBluTimeoutLogDetails,
} from './bluDiagnosticsLog';

export const DEFAULT_STALE_AFTER_MS = 10_000;
export const DEFAULT_FIRST_PACKET_TIMEOUT_MS = 15_000;
export const DEFAULT_RECONNECT_BACKOFF_MS = [1000, 3000, 8000, 15_000] as const;

type TimerHandle = ReturnType<typeof setTimeout>;

export interface BluStreamLifecycleOptions {
  deviceId: string;
  vendor: string;
  deviceType?: string;
  source?: BluTelemetryEnvelopeSource;
  streamMode: string;
  staleAfterMs?: number;
  firstPacketTimeoutMs?: number;
  reconnectBackoffMs?: readonly number[];
  maxReconnectAttempts?: number;
  onPhaseChange?: (health: BluStreamHealth) => void;
  onRecover?: (health: BluStreamHealth) => void | Promise<void>;
  onFailed?: (health: BluStreamHealth) => void;
}

export type BluStreamHealthSnapshotInput = {
  deviceId: string;
  vendor: string;
  phase: BluStreamPhase;
  source?: BluTelemetryEnvelopeSource;
  streamMode?: string;
  staleAfterMs?: number;
  firstPacketAt?: number;
  lastPacketAt?: number;
  packetCount?: number;
  reconnectAttempts?: number;
  error?: BluTelemetryEnvelopeError;
};

export type BluStreamHealthSnapshot = BluStreamHealthSnapshotInput & {
  connectionStatus: BluConnectionStatus;
  health: BluTelemetryHealth;
  updatedAt: number;
  streamHealth: BluStreamHealth;
};

const streamHealthSnapshots = new Map<string, BluStreamHealthSnapshot>();

function makeSnapshotKey(vendor: string, deviceId: string): string {
  return `${vendor}:${deviceId}`;
}

function unrefTimer(timer: TimerHandle | null): void {
  const maybeTimer = timer as unknown as { unref?: () => void } | null;
  if (typeof maybeTimer?.unref === 'function') {
    maybeTimer.unref();
  }
}

export function mapBluStreamPhaseToConnectionStatus(phase: BluStreamPhase): BluConnectionStatus {
  switch (phase) {
    case 'idle':
      return 'idle';
    case 'starting':
    case 'awaitingFirstPacket':
      return 'connected';
    case 'streaming':
      return 'streaming';
    case 'stale':
      return 'stale';
    case 'recovering':
      return 'recovering';
    case 'failed':
      return 'failed';
    case 'stopped':
      return 'disconnected';
    default:
      return 'idle';
  }
}

export function mapBluStreamPhaseToTelemetryHealth(
  phase: BluStreamPhase,
  input: { lastPacketAt?: number | null; staleAfterMs?: number; now?: number; source?: BluTelemetryEnvelopeSource } = {},
): BluTelemetryHealth {
  if (input.source === 'mock') return 'mock';
  const lastPacketAt = Number(input.lastPacketAt ?? 0);
  if (phase === 'idle' || phase === 'starting' || phase === 'awaitingFirstPacket' || phase === 'stopped') {
    return 'unavailable';
  }
  if (!Number.isFinite(lastPacketAt) || lastPacketAt <= 0) return 'unavailable';

  const now = input.now ?? Date.now();
  const staleAfterMs = input.staleAfterMs ?? DEFAULT_STALE_AFTER_MS;
  const packetAgeMs = Math.max(0, now - lastPacketAt);
  if (phase === 'failed') return 'unavailable';
  if (phase === 'stale' || packetAgeMs > staleAfterMs) return 'stale';
  if (phase === 'recovering') return 'recent';
  return 'live';
}

function buildStreamHealth(input: {
  phase: BluStreamPhase;
  staleAfterMs: number;
  firstPacketAt?: number;
  lastPacketAt?: number;
  packetCount?: number;
  reconnectAttempts?: number;
  error?: BluTelemetryEnvelopeError;
}): BluStreamHealth {
  return {
    phase: input.phase,
    firstPacketAt: input.firstPacketAt,
    lastPacketAt: input.lastPacketAt,
    packetCount: input.packetCount ?? 0,
    staleAfterMs: input.staleAfterMs,
    reconnectAttempts: input.reconnectAttempts ?? 0,
    lastError: input.error?.message
      ? {
          phase: input.error.phase,
          code: input.error.code,
          message: input.error.message,
        }
      : undefined,
  };
}

export function recordBluStreamHealthSnapshot(input: BluStreamHealthSnapshotInput): BluStreamHealthSnapshot {
  const staleAfterMs = input.staleAfterMs ?? DEFAULT_STALE_AFTER_MS;
  const now = Date.now();
  const streamHealth = buildStreamHealth({
    phase: input.phase,
    staleAfterMs,
    firstPacketAt: input.firstPacketAt,
    lastPacketAt: input.lastPacketAt,
    packetCount: input.packetCount,
    reconnectAttempts: input.reconnectAttempts,
    error: input.error,
  });
  const snapshot: BluStreamHealthSnapshot = {
    ...input,
    staleAfterMs,
    connectionStatus: mapBluStreamPhaseToConnectionStatus(input.phase),
    health: mapBluStreamPhaseToTelemetryHealth(input.phase, {
      lastPacketAt: input.lastPacketAt,
      staleAfterMs,
      now,
      source: input.source,
    }),
    updatedAt: now,
    streamHealth,
  };
  streamHealthSnapshots.set(makeSnapshotKey(input.vendor, input.deviceId), snapshot);
  return snapshot;
}

export function getBluStreamHealthSnapshot(
  deviceId: string,
  vendor: string = 'unknown',
): BluStreamHealthSnapshot | null {
  return streamHealthSnapshots.get(makeSnapshotKey(vendor, deviceId)) ?? null;
}

export function clearBluStreamHealthSnapshot(deviceId?: string | null, vendor?: string | null): void {
  if (deviceId && vendor) {
    streamHealthSnapshots.delete(makeSnapshotKey(vendor, deviceId));
    return;
  }
  if (vendor) {
    for (const key of streamHealthSnapshots.keys()) {
      if (key.startsWith(`${vendor}:`)) {
        streamHealthSnapshots.delete(key);
      }
    }
    return;
  }
  streamHealthSnapshots.clear();
}

export class BluStreamLifecycle {
  private readonly options: Required<Pick<BluStreamLifecycleOptions, 'staleAfterMs' | 'firstPacketTimeoutMs'>>;
  private readonly reconnectBackoffMs: readonly number[];
  private readonly maxReconnectAttempts: number;
  private phase: BluStreamPhase = 'idle';
  private firstPacketTimer: TimerHandle | null = null;
  private staleTimer: TimerHandle | null = null;
  private recoveryTimer: TimerHandle | null = null;
  private firstPacketAt: number | undefined;
  private lastPacketAt: number | undefined;
  private packetCount = 0;
  private reconnectAttempts = 0;
  private lastError: BluTelemetryEnvelopeError | undefined;
  private stopped = false;

  constructor(private readonly config: BluStreamLifecycleOptions) {
    const reconnectBackoffMs = config.reconnectBackoffMs ?? DEFAULT_RECONNECT_BACKOFF_MS;
    this.reconnectBackoffMs = reconnectBackoffMs.length > 0 ? reconnectBackoffMs : DEFAULT_RECONNECT_BACKOFF_MS;
    this.maxReconnectAttempts = config.maxReconnectAttempts ?? this.reconnectBackoffMs.length;
    this.options = {
      staleAfterMs: config.staleAfterMs ?? DEFAULT_STALE_AFTER_MS,
      firstPacketTimeoutMs: config.firstPacketTimeoutMs ?? DEFAULT_FIRST_PACKET_TIMEOUT_MS,
    };
  }

  start(): void {
    if (
      !this.stopped &&
      (this.phase === 'starting' ||
        this.phase === 'awaitingFirstPacket' ||
        this.phase === 'streaming' ||
        this.phase === 'stale' ||
        this.phase === 'recovering')
    ) {
      return;
    }

    this.clearTimers();
    this.stopped = false;
    this.firstPacketAt = undefined;
    this.lastPacketAt = undefined;
    this.packetCount = 0;
    this.reconnectAttempts = 0;
    this.lastError = undefined;
    this.setPhase('starting');
    this.setPhase('awaitingFirstPacket');
    this.firstPacketTimer = setTimeout(() => {
      this.handleFirstPacketTimeout();
    }, this.options.firstPacketTimeoutMs);
    unrefTimer(this.firstPacketTimer);
    bluLog('[BLU_STREAM]', 'blu_stream_awaiting_first_packet', {
      deviceId: this.config.deviceId,
      vendor: this.config.vendor,
      deviceType: this.config.deviceType ?? 'unknown',
      streamMode: this.config.streamMode,
      timeoutMs: this.options.firstPacketTimeoutMs,
    });
  }

  recordPacket(packetAt: number = Date.now()): BluStreamHealth {
    if (this.stopped) {
      this.stopped = false;
    }
    const timestamp = Number.isFinite(packetAt) && packetAt > 0 ? packetAt : Date.now();
    if (!this.firstPacketAt) {
      this.firstPacketAt = timestamp;
      this.clearFirstPacketTimer();
    }

    this.clearRecoveryTimer();
    this.lastPacketAt = timestamp;
    this.packetCount += 1;
    this.reconnectAttempts = 0;
    this.lastError = undefined;
    this.setPhase('streaming');
    this.scheduleStaleTimer();
    bluLogThrottled('[BLU_STREAM]', `stream-packet:${this.config.vendor}:${this.config.deviceId}`, 'blu_stream_packet', buildBluTelemetryLogDetails({
      deviceId: this.config.deviceId,
      vendor: this.config.vendor,
      telemetryKeys: ['packet'],
      streamMode: this.config.streamMode,
      lastPacketAt: timestamp,
    }), 10_000);
    return this.getHealth();
  }

  recordError(
    phase: string,
    message: string,
    code?: string,
    options: { canRecover?: boolean; timeoutMs?: number } = {},
  ): BluStreamHealth {
    this.lastError = { phase, code, message };
    this.clearFirstPacketTimer();
    this.clearStaleTimer();

    const canRecover = options.canRecover !== false && typeof this.config.onRecover === 'function';
    bluLog(
      '[BLU_TIMEOUT]',
      canRecover && this.reconnectAttempts < this.maxReconnectAttempts
        ? 'blu_stream_recoverable_error'
        : 'blu_stream_failed',
      buildBluTimeoutLogDetails({
        deviceId: this.config.deviceId,
        vendor: this.config.vendor,
        phase,
        timeoutMs: options.timeoutMs ?? this.options.staleAfterMs,
        lastSuccessfulPhase: this.lastPacketAt ? 'streaming' : 'awaitingFirstPacket',
        lastPacketAt: this.lastPacketAt ?? null,
        errorCode: code ?? null,
        message,
        streamMode: this.config.streamMode,
      }),
    );

    if (canRecover && this.reconnectAttempts < this.maxReconnectAttempts) {
      this.scheduleRecovery(phase, message, code);
    } else {
      this.setPhase('failed');
      this.config.onFailed?.(this.getHealth());
    }
    this.publishSnapshot();
    return this.getHealth();
  }

  stop(reason: string = 'stopped'): BluStreamHealth {
    this.clearTimers();
    this.stopped = true;
    this.setPhase('stopped');
    bluLog('[BLU_DISCONNECT]', 'blu_stream_stopped', {
      deviceId: this.config.deviceId,
      vendor: this.config.vendor,
      streamMode: this.config.streamMode,
      reason,
    });
    return this.getHealth();
  }

  getHealth(): BluStreamHealth {
    return buildStreamHealth({
      phase: this.phase,
      staleAfterMs: this.options.staleAfterMs,
      firstPacketAt: this.firstPacketAt,
      lastPacketAt: this.lastPacketAt,
      packetCount: this.packetCount,
      reconnectAttempts: this.reconnectAttempts,
      error: this.lastError,
    });
  }

  private handleFirstPacketTimeout(): void {
    if (this.stopped || this.packetCount > 0) return;
    this.recordError(
      'awaitingFirstPacket',
      'No telemetry packet arrived before the first-packet timeout.',
      'FIRST_PACKET_TIMEOUT',
      { canRecover: true, timeoutMs: this.options.firstPacketTimeoutMs },
    );
  }

  private scheduleStaleTimer(): void {
    this.clearStaleTimer();
    this.staleTimer = setTimeout(() => {
      if (this.stopped) return;
      this.lastError = {
        phase: 'stream_stale',
        code: 'STREAM_STALE',
        message: 'Telemetry stream stopped producing fresh packets.',
      };
      this.setPhase('stale');
      bluLog('[BLU_TIMEOUT]', 'blu_stream_stale', buildBluTimeoutLogDetails({
        deviceId: this.config.deviceId,
        vendor: this.config.vendor,
        phase: 'stream_stale',
        timeoutMs: this.options.staleAfterMs,
        lastSuccessfulPhase: 'streaming',
        lastPacketAt: this.lastPacketAt ?? null,
        errorCode: 'STREAM_STALE',
        message: 'Telemetry stream stopped producing fresh packets.',
        streamMode: this.config.streamMode,
      }));
      if (typeof this.config.onRecover === 'function' && this.reconnectAttempts < this.maxReconnectAttempts) {
        this.scheduleRecovery('stream_stale', 'Telemetry stream stopped producing fresh packets.', 'STREAM_STALE');
      } else if (this.reconnectAttempts >= this.maxReconnectAttempts) {
        this.setPhase('failed');
        this.config.onFailed?.(this.getHealth());
      }
    }, this.options.staleAfterMs);
    unrefTimer(this.staleTimer);
  }

  private scheduleRecovery(phase: string, message: string, code?: string): void {
    this.clearRecoveryTimer();
    this.reconnectAttempts += 1;
    this.setPhase('recovering');
    const delayMs = this.reconnectBackoffMs[
      Math.min(this.reconnectAttempts - 1, this.reconnectBackoffMs.length - 1)
    ] ?? DEFAULT_RECONNECT_BACKOFF_MS[DEFAULT_RECONNECT_BACKOFF_MS.length - 1];
    bluLog('[BLU_RECONNECT]', 'blu_stream_recovery_scheduled', {
      deviceId: this.config.deviceId,
      vendor: this.config.vendor,
      streamMode: this.config.streamMode,
      phase,
      attempt: this.reconnectAttempts,
      maxAttempts: this.maxReconnectAttempts,
      delayMs,
      errorCode: code ?? null,
      message,
    });
    this.recoveryTimer = setTimeout(() => {
      void this.runRecovery();
    }, delayMs);
    unrefTimer(this.recoveryTimer);
  }

  private async runRecovery(): Promise<void> {
    if (this.stopped || typeof this.config.onRecover !== 'function') return;
    const beforePacketCount = this.packetCount;
    try {
      await this.config.onRecover(this.getHealth());
      if (!this.stopped && this.packetCount === beforePacketCount && this.reconnectAttempts >= this.maxReconnectAttempts) {
        this.recordError(
          this.lastError?.phase ?? 'recovery',
          this.lastError?.message ?? 'Telemetry recovery did not produce a packet.',
          this.lastError?.code ?? 'RECOVERY_EXHAUSTED',
          { canRecover: false },
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error ?? 'Telemetry recovery failed.');
      this.recordError('recovery', message, 'RECOVERY_FAILED', { canRecover: true });
    }
  }

  private setPhase(phase: BluStreamPhase): void {
    if (this.phase === phase) {
      this.publishSnapshot();
      return;
    }
    this.phase = phase;
    this.publishSnapshot();
    this.config.onPhaseChange?.(this.getHealth());
    bluLog('[BLU_STREAM]', 'blu_stream_phase_change', {
      deviceId: this.config.deviceId,
      vendor: this.config.vendor,
      deviceType: this.config.deviceType ?? 'unknown',
      streamMode: this.config.streamMode,
      phase,
      packetCount: this.packetCount,
      lastPacketAt: this.lastPacketAt ?? null,
      reconnectAttempts: this.reconnectAttempts,
    });
  }

  private publishSnapshot(): void {
    recordBluStreamHealthSnapshot({
      deviceId: this.config.deviceId,
      vendor: this.config.vendor,
      phase: this.phase,
      source: this.config.source,
      streamMode: this.config.streamMode,
      staleAfterMs: this.options.staleAfterMs,
      firstPacketAt: this.firstPacketAt,
      lastPacketAt: this.lastPacketAt,
      packetCount: this.packetCount,
      reconnectAttempts: this.reconnectAttempts,
      error: this.lastError,
    });
  }

  private clearTimers(): void {
    this.clearFirstPacketTimer();
    this.clearStaleTimer();
    this.clearRecoveryTimer();
  }

  private clearFirstPacketTimer(): void {
    if (this.firstPacketTimer) {
      clearTimeout(this.firstPacketTimer);
      this.firstPacketTimer = null;
    }
  }

  private clearStaleTimer(): void {
    if (this.staleTimer) {
      clearTimeout(this.staleTimer);
      this.staleTimer = null;
    }
  }

  private clearRecoveryTimer(): void {
    if (this.recoveryTimer) {
      clearTimeout(this.recoveryTimer);
      this.recoveryTimer = null;
    }
  }
}
