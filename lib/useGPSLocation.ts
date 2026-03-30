/**
 * useGPSLocation — Real-time GPS position hook
 *
 * Provides live device position using expo-location (native) or
 * navigator.geolocation (web). Designed for tactical dashboard
 * integration where continuous position updates drive distance
 * calculations and waypoint proximity.
 *
 * Features:
 *   - Auto-selects best location provider (expo-location → browser geolocation)
 *   - Configurable update interval and distance filter
 *   - Speed (mph), heading (degrees), altitude (ft)
 *   - Fix quality indicator (accuracy in meters)
 *   - Graceful fallback when GPS unavailable
 *   - Automatic cleanup on unmount
 *   - Haversine distance helper for waypoint calculations
 *   - Silent retry when GPS is temporarily unavailable
 *   - Configurable retry count and interval
 */
import { useEffect, useRef, useState, useCallback } from 'react';
import { Platform } from 'react-native';

export interface GPSPosition {
  latitude: number;
  longitude: number;
  altitudeFt: number | null;
  speedMph: number | null;
  headingDeg: number | null;
  accuracyM: number | null;
  timestamp: number;
}

export interface GPSLocationOutput {
  position: GPSPosition | null;
  isAvailable: boolean;
  hasFix: boolean;
  isWatching: boolean;
  fixQuality: 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE';
  gpsStatus: 'TRACKING' | 'ACQUIRING' | 'OFFLINE' | 'DENIED' | 'UNAVAILABLE' | 'RETRYING';
  error: string | null;
  refresh: () => void;
  retryCount: number;
  permissionDenied: boolean;
}

export interface GPSLocationOptions {
  enabled?: boolean;
  maxRetries?: number;
  retryIntervalMs?: number;
  highAccuracy?: boolean;
}

const M_TO_FT = 3.28084;
const MPS_TO_MPH = 2.23694;

// Expedition-grade live tracking defaults
const DISTANCE_INTERVAL_M = 1;
const TIME_INTERVAL_MS = 1000;

export function haversineDistanceMiles(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 3958.8;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function useGPSLocation(options: GPSLocationOptions = {}): GPSLocationOutput {
  const {
    enabled = true,
    maxRetries = 5,
    retryIntervalMs = 3000,
    highAccuracy = true,
  } = options;

  const [position, setPosition] = useState<GPSPosition | null>(null);
  const [isAvailable, setIsAvailable] = useState(false);
  const [isWatching, setIsWatching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [permissionStatus, setPermissionStatus] = useState<'granted' | 'denied' | 'unknown'>(
    'unknown'
  );
  const [retryCount, setRetryCount] = useState(0);
  const [isRetrying, setIsRetrying] = useState(false);

  const subscriptionRef = useRef<any>(null);
  const watchIdRef = useRef<number | null>(null);
  const mountedRef = useRef(true);
  const retryTimerRef = useRef<any>(null);
  const retryCountRef = useRef(0);

  const parseCoords = useCallback((coords: any, timestamp?: number): GPSPosition => {
    return {
      latitude: coords.latitude,
      longitude: coords.longitude,
      altitudeFt: coords.altitude != null ? coords.altitude * M_TO_FT : null,
      speedMph: coords.speed != null && coords.speed >= 0 ? coords.speed * MPS_TO_MPH : null,
      headingDeg: coords.heading != null && coords.heading >= 0 ? coords.heading : null,
      accuracyM: coords.accuracy != null ? coords.accuracy : null,
      timestamp: timestamp || Date.now(),
    };
  }, []);

  const clearRetryTimer = useCallback(() => {
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const refresh = useCallback(() => {
    if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          if (!mountedRef.current) return;

          setPosition(parseCoords(pos.coords, pos.timestamp));
          setError(null);
          setIsRetrying(false);
          retryCountRef.current = 0;
          setRetryCount(0);
        },
        (err) => {
          if (!mountedRef.current) return;
          setError(err?.message || 'GPS refresh failed');
        },
        { enableHighAccuracy: highAccuracy, timeout: 8000, maximumAge: 0 }
      );
      return;
    }

    if (Platform.OS !== 'web') {
      (async () => {
        try {
          const Location = await import('expo-location');
          if (!mountedRef.current) return;

          const servicesEnabled = await Location.hasServicesEnabledAsync();
          if (!mountedRef.current) return;

          if (!servicesEnabled) {
            setIsAvailable(false);
            setError('Location services are disabled');
            return;
          }

          const { status } = await Location.requestForegroundPermissionsAsync();
          if (!mountedRef.current) return;

          if (status !== 'granted') {
            setPermissionStatus('denied');
            setError('Location permission denied');
            return;
          }

          const loc = await Location.getCurrentPositionAsync({
            accuracy: highAccuracy
              ? Location.Accuracy.BestForNavigation
              : Location.Accuracy.Balanced,
          });

          if (!mountedRef.current) return;

          setPermissionStatus('granted');
          setIsAvailable(true);
          setPosition(parseCoords(loc.coords, loc.timestamp));
          setError(null);
          setIsRetrying(false);
          retryCountRef.current = 0;
          setRetryCount(0);
        } catch (e: any) {
          if (!mountedRef.current) return;
          setError(e?.message || 'GPS refresh failed');
        }
      })();
    }
  }, [parseCoords, highAccuracy]);

  useEffect(() => {
    retryCountRef.current = 0;

    if (!enabled) {
      if (subscriptionRef.current) {
        console.log('[GPS HOOK] Removing watchPositionAsync subscription (disabled)');
        subscriptionRef.current.remove();
        subscriptionRef.current = null;
      }

      if (watchIdRef.current != null && typeof navigator !== 'undefined' && navigator.geolocation) {
        try {
          navigator.geolocation.clearWatch(watchIdRef.current);
        } catch {}
        watchIdRef.current = null;
      }

      clearRetryTimer();
      setIsWatching(false);
      return;
    }

    let cancelled = false;

    function scheduleRetry(attemptFn: () => void) {
      if (cancelled || !mountedRef.current) return;

      if (retryCountRef.current >= maxRetries) {
        setIsRetrying(false);
        setError(`GPS temporarily unavailable after ${maxRetries} attempts`);
        return;
      }

      retryCountRef.current += 1;
      setRetryCount(retryCountRef.current);
      setIsRetrying(true);

      retryTimerRef.current = setTimeout(() => {
        if (!cancelled && mountedRef.current) {
          attemptFn();
        }
      }, retryIntervalMs);
    }

    async function startNativeTracking() {
      try {
        console.log('[GPS HOOK] startNativeTracking');

        const Location = await import('expo-location');
        if (cancelled || !mountedRef.current) return;

        const servicesEnabled = await Location.hasServicesEnabledAsync();
        if (cancelled || !mountedRef.current) return;

        if (!servicesEnabled) {
          setIsAvailable(false);
          setError('Location services are disabled');
          return;
        }

        setIsAvailable(true);

        const { status } = await Location.requestForegroundPermissionsAsync();
        if (cancelled || !mountedRef.current) return;

        if (status !== 'granted') {
          setPermissionStatus('denied');
          setError('Location permission denied');
          return;
        }

        setPermissionStatus('granted');

        async function getInitialNative() {
          try {
            const initial = await Location.getCurrentPositionAsync({
              accuracy: highAccuracy
                ? Location.Accuracy.BestForNavigation
                : Location.Accuracy.Balanced,
            });

            if (!cancelled && mountedRef.current) {
              console.log('[GPS HOOK] Initial native fix', {
                lat: initial.coords.latitude,
                lon: initial.coords.longitude,
                accuracy: initial.coords.accuracy,
                heading: initial.coords.heading,
                speed: initial.coords.speed,
                timestamp: initial.timestamp,
              });

              setPosition(parseCoords(initial.coords, initial.timestamp));
              setError(null);
              setIsRetrying(false);
              retryCountRef.current = 0;
              setRetryCount(0);
            }
          } catch {
            if (!cancelled && mountedRef.current) {
              setError('GPS temporarily unavailable');
              scheduleRetry(getInitialNative);
            }
          }
        }

        await getInitialNative();

        if (cancelled || !mountedRef.current) return;

        if (subscriptionRef.current) {
          console.log('[GPS HOOK] Removing previous watchPositionAsync subscription');
          subscriptionRef.current.remove();
          subscriptionRef.current = null;
        }

        console.log('[GPS HOOK] Starting watchPositionAsync');

        subscriptionRef.current = await Location.watchPositionAsync(
          {
            accuracy: highAccuracy
              ? Location.Accuracy.BestForNavigation
              : Location.Accuracy.Balanced,
            distanceInterval: DISTANCE_INTERVAL_M,
            timeInterval: TIME_INTERVAL_MS,
            mayShowUserSettingsDialog: true,
          },
          (loc) => {
            if (cancelled || !mountedRef.current) return;

            console.log('[GPS HOOK] Position update', {
              lat: loc.coords.latitude,
              lon: loc.coords.longitude,
              accuracy: loc.coords.accuracy,
              heading: loc.coords.heading,
              speed: loc.coords.speed,
              timestamp: loc.timestamp,
            });

            setPosition(parseCoords(loc.coords, loc.timestamp));
            setError(null);
            setIsRetrying(false);
            retryCountRef.current = 0;
            setRetryCount(0);
          }
        );

        if (!cancelled && mountedRef.current) {
          setIsWatching(true);
        }
      } catch (e: any) {
        if (!cancelled && mountedRef.current) {
          console.log('[GPS HOOK] Native tracking failed', e?.message || e);
          setIsAvailable(false);
          setError('Native GPS unavailable');
        }
      }
    }

    function startWebTracking() {
      if (!(typeof navigator !== 'undefined' && navigator.geolocation)) {
        setIsAvailable(false);
        setError('GPS not available on this device');
        return;
      }

      setIsAvailable(true);

      function getInitialWeb() {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            if (cancelled || !mountedRef.current) return;

            setPosition(parseCoords(pos.coords, pos.timestamp));
            setPermissionStatus('granted');
            setError(null);
            setIsRetrying(false);
            retryCountRef.current = 0;
            setRetryCount(0);
          },
          (err) => {
            if (cancelled || !mountedRef.current) return;

            if (err.code === 1) {
              setPermissionStatus('denied');
              setError('Location permission denied');
            } else {
              setError(err.message || 'GPS temporarily unavailable');
              scheduleRetry(getInitialWeb);
            }
          },
          {
            enableHighAccuracy: highAccuracy,
            timeout: 10000,
            maximumAge: 2000,
          }
        );
      }

      getInitialWeb();

      watchIdRef.current = navigator.geolocation.watchPosition(
        (pos) => {
          if (cancelled || !mountedRef.current) return;

          setPosition(parseCoords(pos.coords, pos.timestamp));
          setPermissionStatus('granted');
          setError(null);
          setIsRetrying(false);
          retryCountRef.current = 0;
          setRetryCount(0);
        },
        (err) => {
          if (cancelled || !mountedRef.current) return;

          if (err.code === 1) {
            setPermissionStatus('denied');
            setError('Location permission denied');
          }
        },
        {
          enableHighAccuracy: highAccuracy,
          timeout: 15000,
          maximumAge: 2000,
        }
      );

      setIsWatching(true);
    }

    if (Platform.OS === 'web') {
      startWebTracking();
    } else {
      startNativeTracking();
    }

    return () => {
      cancelled = true;

      console.log('[GPS HOOK] Cleaning up GPS watcher');

      if (subscriptionRef.current) {
        console.log('[GPS HOOK] Removing watchPositionAsync subscription');
        subscriptionRef.current.remove();
        subscriptionRef.current = null;
      }

      if (watchIdRef.current != null && typeof navigator !== 'undefined' && navigator.geolocation) {
        try {
          navigator.geolocation.clearWatch(watchIdRef.current);
        } catch {}
        watchIdRef.current = null;
      }

      clearRetryTimer();
      setIsWatching(false);
    };
  }, [enabled, parseCoords, highAccuracy, maxRetries, retryIntervalMs, clearRetryTimer]);

  const hasFix = position != null;

  const fixQuality: GPSLocationOutput['fixQuality'] = !hasFix
    ? 'NONE'
    : position.accuracyM != null
      ? position.accuracyM <= 10
        ? 'HIGH'
        : position.accuracyM <= 30
          ? 'MEDIUM'
          : 'LOW'
      : 'MEDIUM';

  const permissionDenied = permissionStatus === 'denied';

  const gpsStatus: GPSLocationOutput['gpsStatus'] = permissionDenied
    ? 'DENIED'
    : !isAvailable
      ? 'UNAVAILABLE'
      : isRetrying
        ? 'RETRYING'
        : !hasFix
          ? 'ACQUIRING'
          : isWatching
            ? 'TRACKING'
            : 'OFFLINE';

  return {
    position,
    isAvailable,
    hasFix,
    isWatching,
    fixQuality,
    gpsStatus,
    error,
    refresh,
    retryCount,
    permissionDenied,
  };
}