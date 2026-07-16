import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppState, Platform, type AppStateStatus } from 'react-native';
import { ecsLog } from './ecsLogger';
import {
  inspectForegroundLocationPermission,
  requestForegroundLocationPermission,
  type ForegroundLocationPermissionSnapshot,
  type ForegroundLocationPermissionState,
} from './locationPermissions';
import type { GPSLocationOptions, GPSLocationOutput, GPSPosition } from './useGPSLocation';

const M_TO_FT = 3.28084;
const MPS_TO_MPH = 2.23694;
const HIGH_ACCURACY_DISTANCE_INTERVAL_M = 3;
const HIGH_ACCURACY_TIME_INTERVAL_MS = 1_500;
const BALANCED_DISTANCE_INTERVAL_M = 20;
const BALANCED_TIME_INTERVAL_MS = 10_000;

type Listener = () => void;

type SubscriberOptions = Required<Pick<GPSLocationOptions, 'enabled' | 'highAccuracy'>> &
  Pick<GPSLocationOptions, 'maxRetries' | 'retryIntervalMs'>;

type SharedGPSState = Omit<GPSLocationOutput, 'refresh' | 'requestPermission'> & {
  permissionState: ForegroundLocationPermissionState;
  canAskAgain: boolean | null;
  permissionRequestPending: boolean;
};

const DEFAULT_OUTPUT: SharedGPSState = {
  position: null,
  isAvailable: false,
  hasFix: false,
  isWatching: false,
  fixQuality: 'NONE',
  gpsStatus: 'UNAVAILABLE',
  error: null,
  retryCount: 0,
  permissionDenied: false,
  permissionState: 'unknown',
  canAskAgain: null,
  permissionRequestPending: false,
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
  private state: SharedGPSState = { ...DEFAULT_OUTPUT };
  private listeners = new Set<Listener>();
  private subscribers = new Map<number, SubscriberOptions>();
  private nextSubscriberId = 1;
  private subscriptionRef: any = null;
  private watchIdRef: number | null = null;
  private retryTimerRef: ReturnType<typeof setTimeout> | null = null;
  private appStateSubscription: { remove: () => void } | null = null;
  private appState: AppStateStatus = AppState.currentState;
  private activeHighAccuracy: boolean | null = null;
  private pendingStartHighAccuracy: boolean | null = null;
  private pendingStartPromise: Promise<void> | null = null;
  private startGeneration = 0;
  private retryCount = 0;
  private permissionRequestPromise: Promise<void> | null = null;

  get(): GPSLocationOutput {
    return {
      ...this.state,
      refresh: () => {
        void this.refresh();
      },
      requestPermission: () => this.requestPermission(),
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
    this.ensureAppStateSubscription();
    this.subscribers.set(id, normalizeOptions(options));
    this.reconcileWatchers();
    return () => {
      this.subscribers.delete(id);
      this.reconcileWatchers();
      if (this.subscribers.size === 0) {
        this.removeAppStateSubscription();
      }
    };
  }

  async refresh(): Promise<void> {
    const options = this.resolveActiveOptions();
    if (!options) return;

    try {
      if (this.state.permissionState !== 'granted') {
        this.activeHighAccuracy = null;
        this.reconcileWatchers();
        return;
      }

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

  requestPermission(): Promise<void> {
    if (this.permissionRequestPromise) return this.permissionRequestPromise;

    const request = this.requestPermissionOnce().finally(() => {
      if (this.permissionRequestPromise === request) {
        this.permissionRequestPromise = null;
        this.setState({ permissionRequestPending: false });
      }
    });
    this.permissionRequestPromise = request;
    this.setState({ permissionRequestPending: true });
    return request;
  }

  private async requestPermissionOnce(): Promise<void> {
    const options = this.resolveActiveOptions();
    if (!options) return;

    if (Platform.OS === 'web') {
      await this.requestWebPermission(options);
      return;
    }

    try {
      const Location = await import('expo-location');
      const servicesEnabled = await Location.hasServicesEnabledAsync();
      if (!servicesEnabled) {
        this.applyLocationUnavailable('Location services are disabled');
        return;
      }

      const current = await inspectForegroundLocationPermission(Location);
      if (
        current.state === 'granted' ||
        current.state === 'blocked' ||
        current.state === 'restricted' ||
        current.state === 'unavailable'
      ) {
        this.applyPermissionSnapshot(current);
        if (current.state === 'granted') {
          this.activeHighAccuracy = null;
          this.reconcileWatchers();
        }
        return;
      }

      const requested = await requestForegroundLocationPermission(Location);
      this.applyPermissionSnapshot(requested);
      if (requested.state === 'granted') {
        this.activeHighAccuracy = null;
        this.reconcileWatchers();
      }
    } catch (error: any) {
      ecsLog.warn('GPS', '[GPS SHARED] Permission request failed', {
        error: error?.message || String(error),
      });
      this.applyLocationUnavailable('Native location permission unavailable');
    }
  }

  private applyPermissionSnapshot(
    snapshot: ForegroundLocationPermissionSnapshot,
  ): void {
    const permissionDenied =
      snapshot.state === 'denied_requestable' ||
      snapshot.state === 'blocked' ||
      snapshot.state === 'restricted';
    const error = snapshot.state === 'granted'
      ? null
      : snapshot.state === 'requestable' || snapshot.state === 'unknown'
        ? 'Location permission is required'
        : snapshot.state === 'denied_requestable'
          ? 'Location permission denied; permission can be requested again'
          : snapshot.state === 'blocked'
            ? 'Location permission is blocked in device settings'
            : snapshot.state === 'restricted'
              ? 'Location permission is restricted on this device'
              : 'Location permission is unavailable';

    this.setState({
      permissionState: snapshot.state,
      canAskAgain: snapshot.canAskAgain,
      permissionDenied,
      isAvailable: snapshot.state === 'unavailable' ? false : true,
      isWatching: snapshot.state === 'granted' ? this.state.isWatching : false,
      position: snapshot.state === 'granted' ? this.state.position : null,
      error,
    });
  }

  private applyLocationUnavailable(message: string): void {
    this.setState({
      permissionState: 'unavailable',
      canAskAgain: null,
      permissionDenied: false,
      isAvailable: false,
      isWatching: false,
      position: null,
      error: message,
    });
  }

  private notify(): void {
    this.listeners.forEach((listener) => {
      try {
        listener();
      } catch {}
    });
  }

  private setState(next: Partial<SharedGPSState>): void {
    this.state = { ...this.state, ...next };
    this.state = {
      ...this.state,
      hasFix:
        this.state.permissionState === 'granted' &&
        this.state.isAvailable &&
        this.state.position != null,
      fixQuality:
        this.state.permissionState === 'granted' && this.state.isAvailable
          ? resolveFixQuality(this.state.position)
          : 'NONE',
      gpsStatus: this.resolveStatus(this.state),
    };
    this.notify();
  }

  private resolveStatus(state: SharedGPSState): GPSLocationOutput['gpsStatus'] {
    if (
      state.permissionState === 'requestable' ||
      state.permissionState === 'denied_requestable' ||
      state.permissionState === 'blocked' ||
      state.permissionState === 'restricted'
    ) {
      return 'DENIED';
    }
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
      permissionState: 'granted',
      canAskAgain: true,
    });
  }

  private applyError(message: string): void {
    this.setState({
      error: message,
      retryCount: this.retryCount,
    });
  }

  private isAppForeground(): boolean {
    return this.appState !== 'background' && this.appState !== 'inactive';
  }

  private ensureAppStateSubscription(): void {
    if (this.appStateSubscription) return;
    this.appState = AppState.currentState;
    this.appStateSubscription = AppState.addEventListener('change', this.handleAppStateChange);
  }

  private removeAppStateSubscription(): void {
    if (!this.appStateSubscription) return;
    this.appStateSubscription.remove();
    this.appStateSubscription = null;
  }

  private handleAppStateChange = (nextState: AppStateStatus): void => {
    if (this.appState === nextState) return;
    this.appState = nextState;
    this.reconcileWatchers();
  };

  private resolveActiveOptions(): SubscriberOptions | null {
    if (!this.isAppForeground()) return null;
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
      this.pendingStartPromise = null;
      this.pendingStartHighAccuracy = null;
      this.setState({
        isWatching: false,
        error: null,
      });
      this.activeHighAccuracy = null;
      return;
    }

    if (
      this.activeHighAccuracy === options.highAccuracy &&
      (this.state.isWatching || this.pendingStartHighAccuracy === options.highAccuracy)
    ) {
      return;
    }

    this.activeHighAccuracy = options.highAccuracy;
    const startPromise = this.startTracking(options);
    this.pendingStartPromise = startPromise;
    this.pendingStartHighAccuracy = options.highAccuracy;
    void startPromise.finally(() => {
      if (this.pendingStartPromise !== startPromise) return;
      this.pendingStartPromise = null;
      this.pendingStartHighAccuracy = null;
    });
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
    if (generation !== this.startGeneration || !this.resolveActiveOptions()) return;
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
        await this.startWebTracking(options, generation);
        return;
      }

      const Location = await import('expo-location');
      if (generation !== this.startGeneration) return;

      const servicesEnabled = await Location.hasServicesEnabledAsync();
      if (generation !== this.startGeneration) return;
      if (!servicesEnabled) {
        this.applyLocationUnavailable('Location services are disabled');
        return;
      }

      this.setState({ isAvailable: true, error: null });

      const permission = await inspectForegroundLocationPermission(Location);
      if (generation !== this.startGeneration) return;
      this.applyPermissionSnapshot(permission);
      if (permission.state !== 'granted') {
        return;
      }

      const accuracy = options.highAccuracy
        ? Location.Accuracy.BestForNavigation
        : Location.Accuracy.Balanced;
      const distanceInterval = options.highAccuracy
        ? HIGH_ACCURACY_DISTANCE_INTERVAL_M
        : BALANCED_DISTANCE_INTERVAL_M;
      const timeInterval = options.highAccuracy
        ? HIGH_ACCURACY_TIME_INTERVAL_MS
        : BALANCED_TIME_INTERVAL_MS;

      try {
        const initial = await Location.getCurrentPositionAsync({ accuracy });
        if (generation === this.startGeneration) {
          this.applyPosition(parseCoords(initial.coords, initial.timestamp));
        }
      } catch {
        this.scheduleRetry(options, generation);
      }

      if (generation !== this.startGeneration) return;

      const subscription = await Location.watchPositionAsync(
        {
          accuracy,
          distanceInterval,
          timeInterval,
          mayShowUserSettingsDialog: true,
        },
        (loc) => {
          if (generation !== this.startGeneration) return;
          this.applyPosition(parseCoords(loc.coords, loc.timestamp));
        },
      );
      const activeOptions = this.resolveActiveOptions();
      if (
        generation !== this.startGeneration ||
        !activeOptions ||
        activeOptions.highAccuracy !== options.highAccuracy
      ) {
        try {
          subscription.remove();
        } catch {}
        return;
      }
      if (this.subscriptionRef && this.subscriptionRef !== subscription) {
        try {
          this.subscriptionRef.remove();
        } catch {}
      }
      this.subscriptionRef = subscription;
      this.setState({ isWatching: true, isAvailable: true, error: null });
    } catch (error: any) {
      ecsLog.warn('GPS', '[GPS SHARED] Tracking failed', {
        error: error?.message || String(error),
      });
      if (generation === this.startGeneration) {
        this.setState({
          permissionState: 'unavailable',
          canAskAgain: null,
          permissionDenied: false,
          isAvailable: false,
          isWatching: false,
          position: null,
          error: 'Native GPS unavailable',
        });
      }
    }
  }

  private async inspectWebPermission(): Promise<ForegroundLocationPermissionSnapshot> {
    if (!(typeof navigator !== 'undefined' && navigator.geolocation)) {
      return {
        state: 'unavailable',
        canAskAgain: null,
        response: { status: 'unavailable', canAskAgain: false },
      };
    }

    try {
      if (navigator.permissions?.query) {
        const permission = await navigator.permissions.query({ name: 'geolocation' });
        if (permission.state === 'granted') {
          return {
            state: 'granted',
            canAskAgain: true,
            response: { status: 'granted', canAskAgain: true },
          };
        }
        if (permission.state === 'denied') {
          return {
            state: 'denied_requestable',
            canAskAgain: true,
            response: { status: 'denied', canAskAgain: true },
          };
        }
      }
    } catch {
      // Browsers without the Permissions API still support an explicit
      // geolocation request from the in-app permission action.
    }

    return {
      state: 'requestable',
      canAskAgain: true,
      response: { status: 'undetermined', canAskAgain: true },
    };
  }

  private async requestWebPermission(options: SubscriberOptions): Promise<void> {
    if (!(typeof navigator !== 'undefined' && navigator.geolocation)) {
      this.applyLocationUnavailable('GPS not available on this device');
      return;
    }

    await new Promise<void>((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          this.applyPermissionSnapshot({
            state: 'granted',
            canAskAgain: true,
            response: { status: 'granted', canAskAgain: true },
          });
          this.applyPosition(parseCoords(position.coords, position.timestamp));
          const activeOptions = this.resolveActiveOptions();
          if (activeOptions) {
            this.startWebWatch(activeOptions, this.startGeneration);
          }
          resolve();
        },
        (error) => {
          if (error.code === 1) {
            this.applyPermissionSnapshot({
              state: 'denied_requestable',
              canAskAgain: true,
              response: { status: 'denied', canAskAgain: true },
            });
          } else {
            this.applyError(error?.message || 'GPS temporarily unavailable');
          }
          resolve();
        },
        { enableHighAccuracy: options.highAccuracy, timeout: 10000, maximumAge: 0 },
      );
    });
  }

  private async startWebTracking(
    options: SubscriberOptions,
    generation: number,
  ): Promise<void> {
    const permission = await this.inspectWebPermission();
    if (generation !== this.startGeneration) return;
    this.applyPermissionSnapshot(permission);
    if (permission.state !== 'granted') return;

    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (generation !== this.startGeneration) return;
        this.applyPosition(parseCoords(position.coords, position.timestamp));
      },
      (error) => {
        if (generation !== this.startGeneration) return;
        if (error.code === 1) {
          this.applyPermissionSnapshot({
            state: 'denied_requestable',
            canAskAgain: true,
            response: { status: 'denied', canAskAgain: true },
          });
        } else {
          this.scheduleRetry(options, generation);
        }
      },
      { enableHighAccuracy: options.highAccuracy, timeout: 10000, maximumAge: 2000 },
    );

    this.startWebWatch(options, generation);
  }

  private startWebWatch(options: SubscriberOptions, generation: number): void {
    if (!(typeof navigator !== 'undefined' && navigator.geolocation)) return;
    if (this.watchIdRef != null) {
      navigator.geolocation.clearWatch(this.watchIdRef);
      this.watchIdRef = null;
    }

    this.watchIdRef = navigator.geolocation.watchPosition(
      (pos) => {
        if (generation !== this.startGeneration) return;
        this.applyPosition(parseCoords(pos.coords, pos.timestamp));
      },
      (error) => {
        if (generation !== this.startGeneration) return;
        if (error.code === 1) {
          this.applyPermissionSnapshot({
            state: 'denied_requestable',
            canAskAgain: true,
            response: { status: 'denied', canAskAgain: true },
          });
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
  const requestPermission = useCallback(
    () => sharedGPSLocationStore.requestPermission(),
    [],
  );

  return {
    ...state,
    refresh,
    requestPermission,
  };
}
