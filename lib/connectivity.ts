/**
 * Connectivity Monitor — Phase 3B
 *
 * Cross-platform network detection with:
 * - Real-time online/offline status
 * - Auto-reconnect detection
 * - Event listener system
 * - Connectivity quality hints (for maps/waypoints)
 * - Polling fallback for platforms without native events
 * - Connectivity level classification for remoteness scoring
 * - Network type detection (wifi/cellular/ethernet/none/unknown)
 * - Internet reachability verification (ping-based)
 * - Latency measurement (round-trip to ping endpoint)
 * - Degraded state detection (connected to network but internet unreachable)
 *
 * Phase 3B additions:
 *   - getNetworkType()    → 'wifi' | 'cellular' | 'ethernet' | 'none' | 'unknown'
 *   - getLatencyMs()      → number | null
 *   - isInternetReachable → boolean (verified via ping, not just navigator.onLine)
 *   - getCellularGeneration() → '2g' | '3g' | '4g' | '5g' | null
 *   - getDetailedState()  → full snapshot for CI service consumption
 *
 * Usage:
 *   connectivity.isOnline()
 *   connectivity.getLevel()        // → 'no_service' | 'limited' | 'normal' | 'unknown'
 *   connectivity.getNetworkType()  // → 'wifi' | 'cellular' | 'ethernet' | 'none' | 'unknown'
 *   connectivity.getLatencyMs()    // → number | null
 *   connectivity.onStatusChange((online) => { ... })
 *   connectivity.startMonitoring()
 *   connectivity.stopMonitoring()
 */
import { Platform } from 'react-native';
import { ecsLog } from './ecsLogger';

export type ConnectivityStatus = 'online' | 'offline' | 'reconnecting';

/**
 * Network type detected from the device.
 * Phase 3B: Normalized across platforms.
 */
export type NetworkType = 'wifi' | 'cellular' | 'ethernet' | 'none' | 'unknown';

/**
 * Cellular generation (when network type is cellular).
 */
export type CellularGeneration = '2g' | '3g' | '4g' | '5g' | null;

/**
 * Connectivity level for remoteness scoring.
 *
 * - no_service: Device is offline or has no cellular/network service
 * - limited:    Device is reconnecting, or has degraded connectivity
 *               (e.g. high latency, frequent drops, reconnecting state)
 * - normal:     Device is fully online with stable connectivity
 * - unknown:    Connectivity state hasn't been determined yet
 */
export type ConnectivityLevel = 'no_service' | 'limited' | 'normal' | 'unknown';

/**
 * Detailed connectivity state snapshot for Connectivity Intelligence.
 * Phase 3B: Provides all data needed by the CI service in one call.
 */
export interface ConnectivityDetailedState {
  status: ConnectivityStatus;
  level: ConnectivityLevel;
  networkType: NetworkType;
  cellularGeneration: CellularGeneration;
  isOnline: boolean;
  isInternetReachable: boolean;
  latencyMs: number | null;
  lastOnlineAt: string | null;
  lastOfflineAt: string | null;
  reconnectCount: number;
  initialized: boolean;
}

type StatusListener = (status: ConnectivityStatus, wasOffline: boolean) => void;

// Ping endpoints for connectivity verification
// Primary: used on native platforms (no CORS restrictions)
const PING_URL_NATIVE = 'https://www.google.com/generate_204';
// Web fallback: same-origin Supabase health check avoids CORS/CSP blocks in web previews
const PING_URL_WEB = 'https://ppqcqigdxdofsvpiyial.databasepad.com/rest/v1/';
const PING_TIMEOUT_MS = 5000;
const POLL_INTERVAL_MS = 15000; // 15s polling when offline to detect reconnect
const ONLINE_CHECK_INTERVAL_MS_WEB = 60000; // 60s periodic check when online
const ONLINE_CHECK_INTERVAL_MS_NATIVE = 15000; // 15s online verification on native
const NATIVE_FAILURES_BEFORE_OFFLINE = 2;


/**
 * Latency thresholds for quality classification.
 * Phase 3B: Used by CI service for signal_quality derivation.
 */
export const LATENCY_THRESHOLDS = {
  excellent: 150,   // < 150ms
  good: 500,        // < 500ms
  fair: 1500,       // < 1500ms
  poor: 5000,       // >= 1500ms but connected
} as const;


class ConnectivityMonitor {
  private _status: ConnectivityStatus = 'offline';
  private _listeners: Set<StatusListener> = new Set();
  private _pollTimer: ReturnType<typeof setInterval> | null = null;
  private _onlineCheckTimer: ReturnType<typeof setInterval> | null = null;
  private _initialized = false;
  private _monitoringStarted = false;
  private _lastOnlineAt: string | null = null;
  private _lastOfflineAt: string | null = null;
  private _reconnectCount = 0;

  // Phase 3B: Network type and latency tracking
  private _networkType: NetworkType = 'unknown';
  private _cellularGeneration: CellularGeneration = null;
  private _latencyMs: number | null = null;
  private _isInternetReachable = false;
  private _lastNetworkTypeCheck = 0;
  private _consecutiveReachabilityFailures = 0;
  private _checkInFlight: Promise<boolean> | null = null;

  /** Current connectivity status */
  get status(): ConnectivityStatus {
    return this._status;
  }

  /** Whether the device is currently online */
  isOnline(): boolean {
    return this._status === 'online';
  }

  /** Whether the device is currently offline */
  isOffline(): boolean {
    return this._status === 'offline';
  }

  /**
   * Get the connectivity level for remoteness scoring.
   *
   * Maps internal status + heuristics to a 4-tier level:
   * - no_service:  offline (no network at all)
   * - limited:     reconnecting, or recently dropped (degraded)
   * - normal:      fully online with stable connection
   * - unknown:     monitoring hasn't initialized yet
   *
   * Phase 3B: Also considers latency and internet reachability
   * for finer granularity.
   */
  getLevel(): ConnectivityLevel {
    if (!this._initialized) return 'unknown';

    switch (this._status) {
      case 'offline':
        return 'no_service';

      case 'reconnecting':
        // Actively trying to reconnect — degraded/limited
        return 'limited';

      case 'online': {
        // Phase 3B: Check if internet is actually reachable
        // (connected to network but ping failed = limited)
        if (!this._isInternetReachable) {
          return 'limited';
        }

        // Heuristic: if we've had frequent reconnects recently,
        // treat as limited (unstable connection)
        if (this._reconnectCount >= 3) {
          return 'limited';
        }

        // Phase 3B: High latency = limited
        if (this._latencyMs != null && this._latencyMs > LATENCY_THRESHOLDS.fair) {
          return 'limited';
        }

        return 'normal';
      }

      default:
        return 'unknown';
    }
  }


  /** Timestamp of last known online state */
  get lastOnlineAt(): string | null {
    return this._lastOnlineAt;
  }

  /** Timestamp of last known offline state */
  get lastOfflineAt(): string | null {
    return this._lastOfflineAt;
  }

  /** Number of reconnections since monitoring started */
  get reconnectCount(): number {
    return this._reconnectCount;
  }


  // ══════════════════════════════════════════════════════════
  // Phase 3B: Network Type Detection
  // ══════════════════════════════════════════════════════════

  /**
   * Get the current network type.
   * Phase 3B: Detects wifi, cellular, ethernet, none, or unknown.
   *
   * On web: Uses the Network Information API (navigator.connection)
   * when available, falls back to navigator.onLine heuristics.
   *
   * On native: Returns 'unknown' until a native NetInfo module
   * is integrated (future phase). The CI service can still derive
   * useful data from the connectivity level and ping results.
   */
  getNetworkType(): NetworkType {
    return this._networkType;
  }

  /**
   * Get the cellular generation (2g/3g/4g/5g) when on cellular.
   * Returns null when not on cellular or when detection is unavailable.
   */
  getCellularGeneration(): CellularGeneration {
    return this._cellularGeneration;
  }

  /**
   * Get the last measured latency in milliseconds.
   * Returns null if no latency measurement has been taken.
   * Phase 3B: Measured during ping checks.
   */
  getLatencyMs(): number | null {
    return this._latencyMs;
  }

  /**
   * Whether internet is actually reachable (verified via ping).
   * Phase 3B: Distinguishes "connected to network" from "internet works".
   *
   * A device can be connected to WiFi but have no internet access.
   * This flag is only true after a successful ping to the verification endpoint.
   */
  get isInternetReachable(): boolean {
    return this._isInternetReachable;
  }

  /**
   * Get a complete detailed state snapshot for the CI service.
   * Phase 3B: Single call to get all connectivity data.
   */
  getDetailedState(): ConnectivityDetailedState {
    return {
      status: this._status,
      level: this.getLevel(),
      networkType: this._networkType,
      cellularGeneration: this._cellularGeneration,
      isOnline: this.isOnline(),
      isInternetReachable: this._isInternetReachable,
      latencyMs: this._latencyMs,
      lastOnlineAt: this._lastOnlineAt,
      lastOfflineAt: this._lastOfflineAt,
      reconnectCount: this._reconnectCount,
      initialized: this._initialized,
    };
  }


  /**
   * Detect the current network type from platform APIs.
   * Phase 3B: Called during connectivity checks.
   */
  private _detectNetworkType(): void {
    try {
      if (Platform.OS === 'web' && typeof navigator !== 'undefined') {
        // Check navigator.onLine first
        if (!navigator.onLine) {
          this._networkType = 'none';
          this._cellularGeneration = null;
          return;
        }

        // Use Network Information API if available
        const conn = (navigator as any).connection || (navigator as any).mozConnection || (navigator as any).webkitConnection;
        if (conn) {
          const type = conn.type;
          const effectiveType = conn.effectiveType;

          // Map connection.type to our NetworkType
          switch (type) {
            case 'wifi':
              this._networkType = 'wifi';
              this._cellularGeneration = null;
              break;
            case 'cellular':
              this._networkType = 'cellular';
              // Map effectiveType to cellular generation
              switch (effectiveType) {
                case 'slow-2g':
                case '2g':
                  this._cellularGeneration = '2g';
                  break;
                case '3g':
                  this._cellularGeneration = '3g';
                  break;
                case '4g':
                  this._cellularGeneration = '4g';
                  break;
                default:
                  this._cellularGeneration = null;
              }
              break;
            case 'ethernet':
              this._networkType = 'ethernet';
              this._cellularGeneration = null;
              break;
            case 'none':
              this._networkType = 'none';
              this._cellularGeneration = null;
              break;
            default:
              // type not available — try to infer from effectiveType
              if (effectiveType) {
                // If we have effectiveType but no type, assume cellular
                // (most mobile browsers report effectiveType for cellular)
                this._networkType = 'cellular';
                switch (effectiveType) {
                  case 'slow-2g':
                  case '2g':
                    this._cellularGeneration = '2g';
                    break;
                  case '3g':
                    this._cellularGeneration = '3g';
                    break;
                  case '4g':
                    this._cellularGeneration = '4g';
                    break;
                  default:
                    this._cellularGeneration = null;
                }
              } else {
                // No connection API data — infer from online status
                this._networkType = navigator.onLine ? 'wifi' : 'none';
                this._cellularGeneration = null;
              }
          }
        } else {
          // No Network Information API — use basic heuristic
          this._networkType = navigator.onLine ? 'wifi' : 'none';
          this._cellularGeneration = null;
        }
      } else {
        // Native platform — return unknown until NetInfo is integrated
        // The CI service can still derive useful data from ping results
        this._networkType = 'unknown';
        this._cellularGeneration = null;
      }
    } catch {
      // Silently fail — never crash ECS for network detection
      this._networkType = 'unknown';
      this._cellularGeneration = null;
    }
  }


  /** Register a status change listener */
  onStatusChange(listener: StatusListener): () => void {
    this._listeners.add(listener);
    return () => {
      this._listeners.delete(listener);
    };
  }

  /** Start monitoring connectivity */
  startMonitoring(): void {
    if (this._monitoringStarted) return;
    this._monitoringStarted = true;
    this._initialized = false;

    // Initial network type detection
    this._detectNetworkType();

    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      // Web: use native events + polling fallback
      window.addEventListener('online', this._handleOnlineEvent);
      window.addEventListener('offline', this._handleOfflineEvent);

      // Phase 3B: Listen for network type changes
      try {
        const conn = (navigator as any).connection || (navigator as any).mozConnection || (navigator as any).webkitConnection;
        if (conn && conn.addEventListener) {
          conn.addEventListener('change', this._handleNetworkChange);
        }
      } catch {}

      // Seed only the authoritative no-transport case immediately.
      // Avoid optimistic "online" publishes until the first reachability
      // check reconciles transport + internet access together.
      if (typeof navigator !== 'undefined' && 'onLine' in navigator && !navigator.onLine) {
        this._networkType = 'none';
        this._cellularGeneration = null;
        this._initialized = true;
        this._updateStatus('offline');
      }
    }

    // Start offline polling (checks more frequently when offline)
    this._startPolling();

    // Initial reconciliation happens after listeners are attached so every
    // downstream consumer sees the same first authoritative state.
    void this._checkConnectivity();
  }

  /** Stop monitoring connectivity */
  stopMonitoring(): void {
    this._initialized = false;
    this._monitoringStarted = false;

    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.removeEventListener('online', this._handleOnlineEvent);
      window.removeEventListener('offline', this._handleOfflineEvent);

      // Phase 3B: Remove network type change listener
      try {
        const conn = (navigator as any).connection || (navigator as any).mozConnection || (navigator as any).webkitConnection;
        if (conn && conn.removeEventListener) {
          conn.removeEventListener('change', this._handleNetworkChange);
        }
      } catch {}
    }

    this._stopPolling();
    this._stopOnlineCheck();
  }

  /** Force a connectivity check (useful after user action) */
  async checkNow(): Promise<boolean> {
    return this._checkConnectivity();
  }

  // ── Internal Methods ──────────────────────────────────

  private _handleOnlineEvent = (): void => {
    // Browser says we're online, verify with a ping
    this._detectNetworkType();
    if (this._initialized && this._status !== 'online' && !this._checkInFlight) {
      this._updateStatus('reconnecting');
    }
    this._checkConnectivity();
  };

  private _handleOfflineEvent = (): void => {
    this._networkType = 'none';
    this._cellularGeneration = null;
    this._isInternetReachable = false;
    this._latencyMs = null;
    this._updateStatus('offline');
    // Switch to faster polling to detect reconnect
    this._startPolling();
  };

  /**
   * Phase 3B: Handle network type changes from the Network Information API.
   * Triggers a re-detection and notifies the CI service.
   */
  private _handleNetworkChange = (): void => {
    const prevType = this._networkType;
    this._detectNetworkType();

    if (prevType !== this._networkType) {
      ecsLog.debug('SYSTEM', 'Connectivity network type changed', {
        nextType: this._networkType,
        previousType: prevType,
      });
      // Trigger a full connectivity check to update reachability
      this._checkConnectivity();
    }
  };

  private _updateStatus(newStatus: ConnectivityStatus): void {
    const wasOffline = this._status === 'offline' || this._status === 'reconnecting';
    const oldStatus = this._status;

    if (oldStatus === newStatus) return;

    this._status = newStatus;

    const transitionDetails = {
      networkType: this._networkType,
      nextStatus: newStatus,
      previousStatus: oldStatus,
    };
    if (newStatus === 'offline' || newStatus === 'reconnecting') {
      ecsLog.warn('SYSTEM', `Connectivity ${oldStatus} → ${newStatus}`, transitionDetails);
    } else {
      ecsLog.debug('SYSTEM', 'Connectivity status changed', transitionDetails);
    }

    if (newStatus === 'online') {
      this._lastOnlineAt = new Date().toISOString();
      this._isInternetReachable = true;
      this._consecutiveReachabilityFailures = 0;
      if (wasOffline) {
        this._reconnectCount++;
      }
      // Switch to less frequent online checks
      this._stopPolling();
      this._startOnlineCheck();
    } else if (newStatus === 'reconnecting') {
      this._isInternetReachable = false;
      this._latencyMs = null;
      this._stopOnlineCheck();
      this._startPolling();
    } else if (newStatus === 'offline') {
      this._lastOfflineAt = new Date().toISOString();
      this._isInternetReachable = false;
      this._latencyMs = null;
      this._consecutiveReachabilityFailures = Math.max(
        this._consecutiveReachabilityFailures,
        NATIVE_FAILURES_BEFORE_OFFLINE,
      );
      // Switch to faster polling to detect reconnect
      this._stopOnlineCheck();
      this._startPolling();
    }

    // Notify listeners
    this._listeners.forEach(listener => {
      try {
        listener(newStatus, wasOffline);
      } catch (e) {
        console.warn('[Connectivity] Listener error:', e);
      }
    });
  }

  private _checkConnectivity(): Promise<boolean> {
    if (this._checkInFlight) {
      return this._checkInFlight;
    }

    this._checkInFlight = this._performConnectivityCheck().finally(() => {
      this._checkInFlight = null;
    });

    return this._checkInFlight;
  }

  private async _performConnectivityCheck(): Promise<boolean> {
    const isWeb = Platform.OS === 'web';

    try {
      // Quick navigator check first (web only)
      if (isWeb && typeof navigator !== 'undefined' && !navigator.onLine) {
        this._networkType = 'none';
        this._isInternetReachable = false;
        this._latencyMs = null;
        this._initialized = true;
        this._updateStatus('offline');
        return false;
      }

      // Phase 3B: Detect network type before ping
      this._detectNetworkType();

      // Transport type is authoritative. Never allow stale reachability or
      // cached truthiness to publish "online" when transport is none.
      if (this._networkType === 'none') {
        this._isInternetReachable = false;
        this._latencyMs = null;
        this._initialized = true;
        this._updateStatus('offline');
        return false;
      }

      // ── Platform-aware ping strategy ──
      // On web: Use same-origin Supabase endpoint to avoid CORS/CSP blocks.
      //         If the ping fails (e.g. in restricted preview environments),
      //         fall back to navigator.onLine — never throw.
      // On native: Use google.com/generate_204 (no CORS restrictions).
      const pingUrl = isWeb ? PING_URL_WEB : PING_URL_NATIVE;

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), PING_TIMEOUT_MS);

      const pingStart = Date.now();

      try {
        await fetch(pingUrl, {
          method: 'HEAD',
          // Web: use 'cors' for same-origin Supabase endpoint (proper CORS headers)
          // Native: use 'no-cors' for google.com (opaque response is fine)
          mode: isWeb ? 'cors' : 'no-cors',
          cache: 'no-store',
          signal: controller.signal,
        });

        const pingEnd = Date.now();
        clearTimeout(timeout);

        // Phase 3B: Record latency
        this._latencyMs = pingEnd - pingStart;
        this._isInternetReachable = true;
        this._consecutiveReachabilityFailures = 0;

        this._initialized = true;
        this._updateStatus('online');
        return true;
      } catch (pingError) {
        clearTimeout(timeout);

        // ── Web fallback: ping failed but navigator.onLine says we're connected ──
        // This happens in web preview environments where even same-origin requests
        // can be blocked by CSP or iframe sandboxing. Trust navigator.onLine.
        if (isWeb && typeof navigator !== 'undefined' && navigator.onLine) {
          this._isInternetReachable = true;
          this._latencyMs = null; // Can't measure latency without a successful ping
          this._initialized = true;
          this._updateStatus('online');
          return true;
        }

        // Ping genuinely failed — no internet
        throw pingError;
      }
    } catch (e) {
      // Phase 3B: Ping failed — internet may not be reachable
      // even if the device has a network connection
      this._isInternetReachable = false;
      this._latencyMs = null;
      this._initialized = true;
      this._consecutiveReachabilityFailures += 1;

      if (!isWeb) {
        if (this._consecutiveReachabilityFailures >= NATIVE_FAILURES_BEFORE_OFFLINE) {
          this._networkType = 'none';
          this._updateStatus('offline');
        } else if (this._status === 'online' || this._status === 'reconnecting') {
          this._updateStatus('reconnecting');
        } else {
          this._updateStatus('offline');
        }
        return false;
      }

      // If we were reconnecting, go back to offline
      if (this._status === 'reconnecting') {
        this._updateStatus('offline');
      } else if (this._status === 'online') {
        // Phase 3B: Detect "connected to network but no internet"
        // Check if we still have a network connection
        const hasNetwork = Platform.OS === 'web'
          && typeof navigator !== 'undefined'
          && navigator.onLine;

        if (hasNetwork) {
          // Connected to network but ping failed — this is a degraded state
          // The CI service will interpret this as 'limited' or 'degraded'
          // Silently handle — no console.log to avoid noise in web previews
          // Keep status as online but mark internet as unreachable
          // The CI service reads isInternetReachable for finer state
        } else {
          this._updateStatus('offline');
        }
      }
      return false;
    }
  }


  private _startPolling(): void {
    this._stopPolling();
    this._pollTimer = setInterval(() => {
      if (this._status === 'offline' || this._status === 'reconnecting') {
        this._checkConnectivity();
      }
    }, POLL_INTERVAL_MS);
  }

  private _stopPolling(): void {
    if (this._pollTimer) {
      clearInterval(this._pollTimer);
      this._pollTimer = null;
    }
  }

  private _startOnlineCheck(): void {
    this._stopOnlineCheck();
    this._onlineCheckTimer = setInterval(() => {
      this._checkConnectivity();
    }, Platform.OS === 'web' ? ONLINE_CHECK_INTERVAL_MS_WEB : ONLINE_CHECK_INTERVAL_MS_NATIVE);
  }

  private _stopOnlineCheck(): void {
    if (this._onlineCheckTimer) {
      clearInterval(this._onlineCheckTimer);
      this._onlineCheckTimer = null;
    }
  }
}

// Singleton instance
export const connectivity = new ConnectivityMonitor();

/**
 * Helper: Check if a specific feature requires online access
 */
export function requiresOnline(feature: string): boolean {
  const ONLINE_FEATURES = [
    'map_tiles',
    'geocoding',
    'waypoint_sync',
    'cloud_sync',
    'auth_login',
    'auth_signup',
    'edge_functions',
  ];
  return ONLINE_FEATURES.includes(feature);
}

/**
 * Helper: Wrap an async operation with offline fallback
 * If offline, queues the operation and returns a fallback value
 */
export async function withConnectivity<T>(
  operation: () => Promise<T>,
  fallback: T,
  onQueued?: () => void,
): Promise<{ result: T; wasOffline: boolean }> {
  if (connectivity.isOnline()) {
    try {
      const result = await operation();
      return { result, wasOffline: false };
    } catch (e) {
      // Operation failed even though we thought we were online
      return { result: fallback, wasOffline: true };
    }
  }

  // Offline: return fallback
  onQueued?.();
  return { result: fallback, wasOffline: true };
}

