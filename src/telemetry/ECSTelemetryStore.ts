import type {
  ECSPowerTelemetryDeviceReading,
  ECSUtilitySensorTelemetryReading,
  ECSTelemetryDeviceSnapshot,
  ECSTelemetryEvent,
  ECSTelemetryMetricSnapshot,
  ECSTelemetryQuality,
  ECSTelemetrySnapshot,
  ECSTelemetrySourceType,
} from './ECSTelemetryTypes';
import { recordBluetoothDiagnosticEvent } from '../../lib/bluetoothDiagnostics';

type StoreListener = () => void;

const LIVE_MAX_AGE_MS = 30_000;
const STALE_MAX_AGE_MS = 5 * 60_000;

const metricKey = (event: Pick<ECSTelemetryEvent, 'sourceType' | 'provider' | 'sourceDeviceId' | 'metricKey'>) =>
  `${event.sourceType}:${event.provider}:${event.sourceDeviceId}:${event.metricKey}`;

function sameTelemetryDevice(
  metric: ECSTelemetryMetricSnapshot,
  sourceDeviceId: string,
  sourceType?: ECSTelemetrySourceType,
  provider?: string | null,
): boolean {
  if (metric.sourceDeviceId !== sourceDeviceId) return false;
  if (sourceType && metric.sourceType !== sourceType) return false;
  if (provider && metric.provider !== provider) return false;
  return true;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function numericMetric(
  metrics: Record<string, ECSTelemetryMetricSnapshot>,
  key: string,
): number | null {
  const metric = metrics[key];
  if (!metric || metric.quality === 'unavailable' || metric.quality === 'error') return null;
  return isFiniteNumber(metric.value) ? metric.value : null;
}

function stringMetric(
  metrics: Record<string, ECSTelemetryMetricSnapshot>,
  key: string,
): string | null {
  const metric = metrics[key];
  if (!metric || metric.quality === 'error') return null;
  return typeof metric.value === 'string' && metric.value.trim()
    ? metric.value
    : null;
}

function readMockFlag(): boolean {
  try {
    const envValue = typeof process !== 'undefined'
      ? process.env?.EXPO_PUBLIC_ECS_ENABLE_MOCK_BLUETOOTH
      : undefined;
    if (typeof envValue === 'string') {
      return /^(1|true|yes|on)$/i.test(envValue.trim());
    }
  } catch {}

  try {
    return (globalThis as { __ECS_ENABLE_MOCK_BLUETOOTH__?: boolean }).__ECS_ENABLE_MOCK_BLUETOOTH__ === true;
  } catch {
    return false;
  }
}

function shouldRejectProductionMock(event: ECSTelemetryEvent): boolean {
  if (readMockFlag()) return false;
  return event.transport === 'unknown' && /mock|sim/i.test(event.provider);
}

class ECSTelemetryStore {
  private metrics = new Map<string, ECSTelemetryMetricSnapshot>();
  private listeners = new Set<StoreListener>();
  private updatedAt: number | null = null;
  private staleTimer: ReturnType<typeof setTimeout> | null = null;

  subscribe(listener: StoreListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  ingestEvent(event: ECSTelemetryEvent): void {
    if (!event.sourceDeviceId || !event.metricKey) return;
    if (shouldRejectProductionMock(event)) return;

    const timestamp = Number.isFinite(event.timestamp) && event.timestamp > 0
      ? event.timestamp
      : Date.now();
    const normalized: ECSTelemetryMetricSnapshot = {
      ...event,
      timestamp,
      staleAt: event.quality === 'live' ? timestamp + LIVE_MAX_AGE_MS : null,
    };

    const key = metricKey(normalized);
    if (this.shouldKeepExistingMetric(this.metrics.get(key), normalized)) return;
    this.metrics.set(key, normalized);
    this.updatedAt = Date.now();
    recordBluetoothDiagnosticEvent({
      type: 'widget_telemetry_update',
      source: 'widget_telemetry',
      deviceId: normalized.sourceDeviceId,
      deviceName: normalized.sourceDeviceName ?? undefined,
      providerId: normalized.provider,
      message: 'Normalized telemetry metric ingested.',
      details: {
        sourceType: normalized.sourceType,
        metricKey: normalized.metricKey,
        quality: normalized.quality,
        transport: normalized.transport,
      },
    });
    this.scheduleStaleCheck();
    this.notify();
  }

  ingestEvents(events: ECSTelemetryEvent[]): void {
    let changed = false;
    for (const event of events) {
      if (!event.sourceDeviceId || !event.metricKey) continue;
      if (shouldRejectProductionMock(event)) continue;
      const timestamp = Number.isFinite(event.timestamp) && event.timestamp > 0
        ? event.timestamp
        : Date.now();
      const normalized: ECSTelemetryMetricSnapshot = {
        ...event,
        timestamp,
        staleAt: event.quality === 'live' ? timestamp + LIVE_MAX_AGE_MS : null,
      };
      const key = metricKey(normalized);
      if (this.shouldKeepExistingMetric(this.metrics.get(key), normalized)) continue;
      this.metrics.set(key, normalized);
      recordBluetoothDiagnosticEvent({
        type: 'widget_telemetry_update',
        source: 'widget_telemetry',
        deviceId: normalized.sourceDeviceId,
        deviceName: normalized.sourceDeviceName ?? undefined,
        providerId: normalized.provider,
        message: 'Normalized telemetry metric ingested.',
        details: {
          sourceType: normalized.sourceType,
          metricKey: normalized.metricKey,
          quality: normalized.quality,
          transport: normalized.transport,
        },
      });
      changed = true;
    }
    if (!changed) return;
    this.updatedAt = Date.now();
    this.scheduleStaleCheck();
    this.notify();
  }

  markDeviceUnavailable(
    sourceDeviceId: string,
    sourceType?: ECSTelemetrySourceType,
    reason = 'Device disconnected.',
    provider?: string | null,
  ): void {
    const now = Date.now();
    let changed = false;
    for (const [key, metric] of this.metrics.entries()) {
      if (!sameTelemetryDevice(metric, sourceDeviceId, sourceType, provider)) continue;
      this.metrics.set(key, {
        ...metric,
        value: null,
        timestamp: now,
        quality: 'unavailable',
        staleAt: null,
        errorSource: 'transport',
        errorMessage: reason,
      });
      changed = true;
    }
    if (!changed) return;
    this.updatedAt = now;
    this.notify();
  }

  clearDevice(sourceDeviceId: string, sourceType?: ECSTelemetrySourceType, provider?: string | null): void {
    let changed = false;
    for (const [key, metric] of Array.from(this.metrics.entries())) {
      if (!sameTelemetryDevice(metric, sourceDeviceId, sourceType, provider)) continue;
      this.metrics.delete(key);
      changed = true;
    }
    if (!changed) return;
    this.updatedAt = Date.now();
    this.notify();
  }

  reset(): void {
    this.metrics.clear();
    this.updatedAt = null;
    this.cancelStaleTimer();
    this.notify();
  }

  getSnapshot(): ECSTelemetrySnapshot {
    this.applyStaleTransitions();
    const byDevice = new Map<string, ECSTelemetryDeviceSnapshot>();

    for (const metric of this.metrics.values()) {
      const key = `${metric.sourceType}:${metric.provider}:${metric.sourceDeviceId}`;
      const existing = byDevice.get(key);
      if (!existing) {
        byDevice.set(key, {
          sourceDeviceId: metric.sourceDeviceId,
          sourceDeviceName: metric.sourceDeviceName ?? null,
          sourceType: metric.sourceType,
          provider: metric.provider,
          providerLabel: metric.providerLabel ?? null,
          transport: metric.transport,
          latestTimestamp: metric.timestamp,
          quality: metric.quality,
          metrics: { [metric.metricKey]: metric },
        });
        continue;
      }

      existing.metrics[metric.metricKey] = metric;
      if (!existing.sourceDeviceName && metric.sourceDeviceName) {
        existing.sourceDeviceName = metric.sourceDeviceName;
      }
      if (!existing.providerLabel && metric.providerLabel) {
        existing.providerLabel = metric.providerLabel;
      }
      if (!existing.latestTimestamp || metric.timestamp > existing.latestTimestamp) {
        existing.latestTimestamp = metric.timestamp;
      }
      existing.quality = this.mergeQuality(existing.quality, metric.quality);
    }

    return {
      devices: Array.from(byDevice.values()).sort((a, b) => (b.latestTimestamp ?? 0) - (a.latestTimestamp ?? 0)),
      updatedAt: this.updatedAt,
    };
  }

  getPowerDeviceReadings(): ECSPowerTelemetryDeviceReading[] {
    return this.getSnapshot().devices
      .filter((device) => device.sourceType === 'power_device')
      .map((device) => {
        const metrics = device.metrics;
        const lastUpdated = device.latestTimestamp ?? 0;
        const providerLabel = device.providerLabel ?? formatProviderLabel(device.provider);
        return {
          deviceId: device.sourceDeviceId,
          deviceName: device.sourceDeviceName ?? providerLabel,
          provider: device.provider,
          providerLabel,
          transport: device.transport,
          quality: device.quality,
          lastUpdated,
          batteryPercent: numericMetric(metrics, 'battery_percent'),
          capacityWh: numericMetric(metrics, 'capacity_wh'),
          inputWatts: numericMetric(metrics, 'input_watts'),
          inputVolts: numericMetric(metrics, 'input_volts'),
          inputAmps: numericMetric(metrics, 'input_amps'),
          outputWatts: numericMetric(metrics, 'output_watts'),
          outputVolts: numericMetric(metrics, 'output_volts'),
          outputAmps: numericMetric(metrics, 'output_amps'),
          solarWatts: numericMetric(metrics, 'solar_input_watts'),
          temperatureCelsius: numericMetric(metrics, 'temperature_celsius'),
          estimatedRuntimeMinutes: numericMetric(metrics, 'estimated_runtime_minutes'),
          batteryVolts: numericMetric(metrics, 'battery_volts'),
          batteryAmps: numericMetric(metrics, 'battery_amps'),
          batteryWatts: numericMetric(metrics, 'battery_watts'),
          acOutputWatts: numericMetric(metrics, 'ac_output_watts'),
          dcOutputWatts: numericMetric(metrics, 'dc_output_watts'),
          signalStrength: numericMetric(metrics, 'signal_strength'),
          isLive: device.quality === 'live',
          isStale: device.quality === 'stale',
        };
      })
      .filter((reading) => reading.quality !== 'unavailable' || reading.lastUpdated > 0);
  }

  getUtilitySensorReadings(): ECSUtilitySensorTelemetryReading[] {
    return this.getSnapshot().devices
      .filter((device) => device.sourceType === 'utility_sensor')
      .map((device) => {
        const metrics = device.metrics;
        const lastUpdated = device.latestTimestamp ?? 0;
        const providerLabel = device.providerLabel ?? formatProviderLabel(device.provider);
        return {
          deviceId: device.sourceDeviceId,
          deviceName: device.sourceDeviceName ?? providerLabel,
          provider: device.provider,
          providerLabel,
          transport: device.transport,
          quality: device.quality,
          lastUpdated,
          category: stringMetric(metrics, 'sensor_category'),
          profileId: stringMetric(metrics, 'profile_id'),
          linkState: stringMetric(metrics, 'link_state'),
          levelPercent: numericMetric(metrics, 'level_percent'),
          signalStrength: numericMetric(metrics, 'signal_strength'),
          parserStatus: stringMetric(metrics, 'parser_status'),
          isLive: device.quality === 'live',
          isStale: device.quality === 'stale',
        };
      })
      .filter((reading) => reading.quality !== 'unavailable' || reading.lastUpdated > 0);
  }

  private mergeQuality(current: ECSTelemetryQuality, next: ECSTelemetryQuality): ECSTelemetryQuality {
    if (current === 'live' || next === 'live') return 'live';
    if (current === 'stale' || next === 'stale') return 'stale';
    if (current === 'error' || next === 'error') return 'error';
    return 'unavailable';
  }

  private shouldKeepExistingMetric(
    existing: ECSTelemetryMetricSnapshot | undefined,
    next: ECSTelemetryMetricSnapshot,
  ): boolean {
    return Boolean(
      existing &&
      existing.quality === 'live' &&
      existing.transport === 'ble' &&
      next.transport === 'cloud' &&
      next.quality !== 'live'
    );
  }

  private applyStaleTransitions(): boolean {
    const now = Date.now();
    let changed = false;
    for (const [key, metric] of this.metrics.entries()) {
      if (metric.quality !== 'live') continue;
      if (!metric.staleAt || now < metric.staleAt) continue;
      const staleQuality: ECSTelemetryQuality =
        now - metric.timestamp > STALE_MAX_AGE_MS ? 'unavailable' : 'stale';
      this.metrics.set(key, {
        ...metric,
        quality: staleQuality,
        staleAt: staleQuality === 'stale' ? metric.timestamp + STALE_MAX_AGE_MS : null,
      });
      recordBluetoothDiagnosticEvent({
        type: 'telemetry_stale',
        source: 'widget_telemetry',
        deviceId: metric.sourceDeviceId,
        deviceName: metric.sourceDeviceName ?? undefined,
        providerId: metric.provider,
        message: staleQuality === 'stale' ? 'Telemetry metric aged to stale.' : 'Telemetry metric aged to unavailable.',
        details: {
          sourceType: metric.sourceType,
          metricKey: metric.metricKey,
          quality: staleQuality,
          transport: metric.transport,
        },
      });
      changed = true;
    }
    if (changed) {
      this.updatedAt = now;
      this.scheduleStaleCheck();
    }
    return changed;
  }

  private scheduleStaleCheck(): void {
    this.cancelStaleTimer();
    const now = Date.now();
    let nextAt: number | null = null;
    for (const metric of this.metrics.values()) {
      if (!metric.staleAt || metric.staleAt <= now) continue;
      nextAt = nextAt == null ? metric.staleAt : Math.min(nextAt, metric.staleAt);
    }
    if (nextAt == null) return;
    this.staleTimer = setTimeout(() => {
      const changed = this.applyStaleTransitions();
      if (changed) this.notify();
    }, Math.max(250, nextAt - now + 50));
    const timerWithUnref = this.staleTimer as unknown as { unref?: () => void };
    if (typeof timerWithUnref.unref === 'function') {
      timerWithUnref.unref();
    }
  }

  private cancelStaleTimer(): void {
    if (!this.staleTimer) return;
    clearTimeout(this.staleTimer);
    this.staleTimer = null;
  }

  private notify(): void {
    for (const listener of this.listeners) {
      try {
        listener();
      } catch {}
    }
  }
}

function formatProviderLabel(provider: string): string {
  return provider
    .split(/[_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ') || 'Telemetry';
}

export const ecsTelemetryStore = new ECSTelemetryStore();
