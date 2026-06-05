import { useCallback, useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';
import { ecsLog } from './ecsLogger';
import { ensureForegroundLocationPermission } from './locationPermissions';
import type { GPSLocationOptions, GPSLocationOutput, GPSPosition } from './useGPSLocation';

const M_TO_FT = 3.28084;
const MPS_TO_MPH = 2.23694;
const DISTANCE_INTERVAL_M = 1;
const TIME_INTERVAL_MS = 1000;

type Listener = () => void;

type SubscriberOptions = Required<Pick<GPSLocationOptions, 'enabled' | 'highAccuracy'>> &
  Pick<GPSLocationOptions, 'maxRetries' | 'retryIntervalMs'>;

const DEFAULT_OUTPUT: Omit<GPSLocationOutput, 'refresh'> = {
  position: null,
  isAvailable: false,
  hasFix: false,
  isWatching: false,
  fixQuality: 'NONE',
  gpsStatus: 'UNAVAILABLE',
  error: null,
  retryCount: 0,
  permissionDenied: false,
};

function normalizeOptions(options: GPSLocationOptions): SubscriberOptions {
  return {
    enabled: options.enabled !== false,
    highAccuracy: options.highAccuracy !== false,
    maxRetries: options.maxRetries,
    retryIntervalMs: options.retryIntervalMs,
  };
}

function parseCoords(coords: any, timestamp?: number): GPSPosition {
  return {
    latitude: coords.latitude,
    longitude: coords.longitude,
    altitudeFt: coords.altitude != null ? coords.altitude * M_TO_FT : null,
    speedMph: coords.speed != null && coords.speed >= 0 ? coords.speed * MPS_TO_MPH : null,
    headingDeg: coords.heading != null && coords.heading >= 0 ? coords.heading : null,
    accuracyM: coords.accuracy != null ? coords.accuracy : null,
    timestamp: timestamp || Date.now(),
  };
}

function resolveFixQuality(position: GPSPosition | null): GPSLocationOutput['fixQuality'] {
  if (!position) return 'NONE';
  if (position.accuracyM == null) return 'MEDIUM';
  if (position.accuracyM <= 10) return 'HIGH';
  if (position.accuracyM <= 30) return 'MEDIUM';
  return 'LOW';
}

function positionsEquivalent(a: GPSPosition | null, b: GPSPosition | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  const roundNullable = (value: number | null, precision = 1) =>
    value == null ? null : Number(value.toFixed(precision));
  return (
    Number(a.latitude.toFixed(6)) === Number(b.latitude.toFixed(6)) &&
    Number(a.longitude.toFixed(6)) === Number(b.longitude.toFixed(6)) &&
    roundNullable(a.altitudeFt, 1) === roundNullable(b.altitudeFt, 1) &&
    roundNullable(a.speedMph, 1) === roundNullable(b.speedMph, 1) &&
    roundNullable(a.headingDeg, 1) === roundNullable(b.headingDeg, 1) &&
    roundNullable(a.accuracyM, 1) === roundNullable(b.accuracyM, 1) &&
    a.timestamp === b.timestamp
  );
}

class SharedGPSLocationStore {
  private state: Omit<GPSLocationOutput, 'refresh'> = { ...DEFAULT_OUTPUT };
  private listeners = new Set<Listener>();
  private subscribers = new Map<number, SubscriberOptions>();
  private nextSubscriberId = 1;
  private subscriptionRef: any = null;
  private watchIdRef: number | null = null;
  private retryTimerRef: ReturnType<typeof setTimeout> | null = null;
  private activeHighAccuracy: boolean | null = null;
  private startGeneration = 0;
  private retryCount = 0;

  get(): GPSLocationOutput {
    return {
      ...this.state,
      refresh: () => {
        void this.refresh();
      },
    };
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  acquire(options: GPSLocationOptions): () => void {
    const id = this.nextSubscriberId++;
    this.subscribers.set(id, normalizeOptions(options));
    this.reconcileWatchers();
    return () => {
      this.subscribers.delete(id);
      this.reconcileWatchers();
    };
  }

  async refresh(): Promise<void> {
    const options = this.resolveActiveOptions();
    if (!options) return;

    try {
      if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (pos) => this.applyPosition(parseCoords(pos.coords, pos.timestamp)),
          (error) => this.applyError(error?.message || 'GPS refresh failed'),
          { enableHighAccuracy: options.highAccuracy, timeout: 8000, maximumAge: 0 },
        );
        return;
      }

      if (Platform.OS !== 'web') {
        const Location = await import('expo-location');
        const loc = await Location.getCurrentPositionAsync({
          accuracy: options.highAccuracy
            ? Location.Accuracy.BestForNavigation
            : Location.Accuracy.Balanced,
        });
        this.applyPosition(parseCoords(loc.coords, loc.timestamp));
      }
    } catch (error: any) {
      this.applyError(error?.message || 'GPS refresh failed');
    }
  }

  private notify(): void {
    this.listeners.forEach((listener) => {
      try {
        listener();
      } catch {}
    });
  }

  private setState(next: Partial<Omit<GPSLocationOutput, 'refresh'>>): void {
    this.state = { ...this.state, ...next };
    this.state = {
      ...this.state,
      hasFix: this.state.position != null,
      fixQuality: resolveFixQuality(this.state.position),
      gpsStatus: this.resolveStatus(this.state),
    };
    this.notify();
  }

  private resolveStatus(state: Omit<GPSLocationOutput, 'refresh'>): GPSLocationOutput['gpsStatus'] {
    if (state.permissionDenied) return 'DENIED';
    if (!state.isAvailable) return 'UNAVAILABLE';
    if (state.error && state.gpsStatus === 'RETRYING') return 'RETRYING';
    if (!state.position) return 'ACQUIRING';
    return state.isWatching ? 'TRACKING' : 'OFFLINE';
  }

  private applyPosition(position: GPSPosition): void {
    if (positionsEquivalent(this.state.position, position)) return;
    this.retryCount = 0;
    this.setState({
      position,
      isAvailable: true,
      isWatching: true,
      error: null,
      retryCount: 0,
      permissionDenied: false,
    });
  }

  private applyError(message: string, permissionDenied = false): void {
    this.setState({
      error: message,
      permissionDenied,
      isAvailable: permissionDenied ? this.state.isAvailable : this.state.isAvailable,
      retryCount: this.retryCount,
    });
  }

  private resolveActiveOptions(): SubscriberOptions | null {
    const active = Array.from(this.subscribers.values()).filter((options) => options.enabled);
    if (active.length === 0) return null;
    return {
      enabled: true,
      highAccuracy: active.some((options) => options.highAccuracy),
      maxRetries: Math.max(...active.map((options) => options.maxRetries ?? 5)),
      retryIntervalMs: Math.min(...active.map((options) => options.retryIntervalMs ?? 3000)),
    };
  }

  private reconcileWatchers(): void {
    const options = this.resolveActiveOptions();
    if (!options) {
      this.stopTracking();
      this.setState({
        isWatching: false,
        error: null,
      });
      this.activeHighAccuracy = null;
      return;
    }

    if (this.activeHighAccuracy === options.highAccuracy && this.state.isWatching) {
      return;
    }

    this.activeHighAccuracy = options.highAccuracy;
    void this.startTracking(options);
  }

  private clearRetryTimer(): void {
    if (this.retryTimerRef) {
      clearTimeout(this.retryTimerRef);
      this.retryTimerRef = null;
    }
  }

  private stopTracking(): void {
    this.startGeneration += 1;
    this.clearRetryTimer();
    if (this.subscriptionRef) {
      try {
        this.subscriptionRef.remove();
      } catch {}
      this.subscriptionRef = null;
    }
    if (this.watchIdRef != null && typeof navigator !== 'undefined' && navigator.geolocation) {
      try {
        navigator.geolocation.clearWatch(this.watchIdRef);
      } catch {}
      this.watchIdRef = null;
    }
  }

  private scheduleRetry(options: SubscriberOptions, generation: number): void {
    if (this.retryCount >= (options.maxRetries ?? 5)) {
      this.setState({
        isWatching: false,
        error: `GPS temporarily unavailable after ${options.maxRetries ?? 5} attempts`,
      });
      return;
    }

    this.retryCount += 1;
    this.setState({
      error: 'GPS temporarily unavailable',
      retryCount: this.retryCount,
      gpsStatus: 'RETRYING',
    });
    this.clearRetryTimer();
    this.retryTimerRef = setTimeout(() => {
      if (generation !== this.startGeneration) return;
      void this.startTracking(options, generation);
    }, options.retryIntervalMs ?? 3000);
  }

  private async startTracking(options: SubscriberOptions, existingGeneration?: number): Promise<void> {
    const generation = existingGeneration ?? this.startGeneration + 1;
    if (existingGeneration == null) {
      this.stopTracking();
      this.startGeneration = generation;
      this.retryCount = 0;
    }

    try {
      if (Platform.OS === 'web') {
        this.startWebTracking(options, generation);
        return;
      }

      const Location = await import('expo-location');
      if (generation !== this.startGeneration) return;

      const servicesEnabled = await Location.hasServicesEnabledAsync();
      if (generation !== this.startGeneration) return;
      if (!servicesEnabled) {
        this.setState({
          isAvailable: false,
          isWatching: false,
          error: 'Location services are disabled',
        });
        return;
      }

      this.setState({ isAvailable: true, error: null });

      const { status } = await ensureForegroundLocationPermission(Location);
      if (generation !== this.startGeneration) return;
      if (status !== 'granted') {
        this.applyError('Location permission denied', true);
        return;
      }

      const accuracy = options.highAccuracy
        ? Location.Accuracy.BestForNavigation
        : Location.Accuracy.Balanced;

      try {
        const initial = await Location.getCurrentPositionAsync({ accuracy });
        if (generation === this.startGeneration) {
          this.applyPosition(parseCoords(initial.coords, initial.timestamp));
        }
      } catch {
        this.scheduleRetry(options, generation);
      }

      if (generation !== this.startGeneration) return;

      this.subscriptionRef = await Location.watchPositionAsync(
        {
          accuracy,
          distanceInterval: DISTANCE_INTERVAL_M,
          timeInterval: TIME_INTERVAL_MS,
          mayShowUserSettingsDialog: true,
        },
        (loc) => {
          if (generation !== this.startGeneration) return;
          this.applyPosition(parseCoords(loc.coords, loc.timestamp));
        },
      );
      if (generation === this.startGeneration) {
        this.setState({ isWatching: true, isAvailable: true, error: null });
      }
    } catch (error: any) {
      ecsLog.warn('GPS', '[GPS SHARED] Tracking failed', {
        error: error?.message || String(error),
      });
      if (generation === this.startGeneration) {
        this.setState({
          isAvailable: false,
          isWatching: false,
          error: 'Native GPS unavailable',
        });
      }
    }
  }

  private startWebTracking(options: SubscriberOptions, generation: number): void {
    if (!(typeof navigator !== 'undefined' && navigator.geolocation)) {
      this.setState({
        isAvailable: false,
        isWatching: false,
        error: 'GPS not available on this device',
      });
      return;
    }

    this.setState({ isAvailable: true, error: null });

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (generation !== this.startGeneration) return;
        this.applyPosition(parseCoords(pos.coords, pos.timestamp));
      },
      (error) => {
        if (generation !== this.startGeneration) return;
        if (error.code === 1) {
          this.applyError('Location permission denied', true);
        } else {
          this.scheduleRetry(options, generation);
        }
      },
      { enableHighAccuracy: options.highAccuracy, timeout: 10000, maximumAge: 2000 },
    );

    this.watchIdRef = navigator.geolocation.watchPosition(
      (pos) => {
        if (generation !== this.startGeneration) return;
        this.applyPosition(parseCoords(pos.coords, pos.timestamp));
      },
      (error) => {
        if (generation !== this.startGeneration) return;
        if (error.code === 1) {
          this.applyError('Location permission denied', true);
        }
      },
      { enableHighAccuracy: options.highAccuracy, timeout: 15000, maximumAge: 2000 },
    );

    this.setState({ isWatching: true, isAvailable: true, error: null });
  }
}

export const sharedGPSLocationStore = new SharedGPSLocationStore();

export function useSharedGPSLocation(options: GPSLocationOptions = {}): GPSLocationOutput {
  const [state, setState] = useState(() => sharedGPSLocationStore.get());
  const normalized = useMemo(() => normalizeOptions(options), [
    options.enabled,
    options.highAccuracy,
    options.maxRetries,
    options.retryIntervalMs,
  ]);

  useEffect(() => {
    const unsubscribe = sharedGPSLocationStore.subscribe(() => {
      setState(sharedGPSLocationStore.get());
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    const release = sharedGPSLocationStore.acquire(normalized);
    return release;
  }, [
    normalized.enabled,
    normalized.highAccuracy,
    normalized.maxRetries,
    normalized.retryIntervalMs,
  ]);

  const refresh = useCallback(() => {
    void sharedGPSLocationStore.refresh();
  }, []);

  return {
    ...state,
    refresh,
  };
}
