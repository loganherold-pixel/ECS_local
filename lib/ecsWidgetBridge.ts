/**
 * ═══════════════════════════════════════════════════════════
 * ECS WIDGET DATA BRIDGE — Integration Pass 2
 * ═══════════════════════════════════════════════════════════
 *
 * Connects the ECS bus (Integration Pass 1) to the dashboard
 * widget rendering system.
 *
 * Responsibilities:
 *   1. Map each widget to its required ECS channels
 *   2. Provide normalized summary data for widget rendering
 *   3. Track per-widget data freshness
 *   4. Resolve placeholder states when data is unavailable
 *   5. Handle mode-aware data (Highway vs Expedition priorities)
 *   6. Prevent widgets from showing stale/contradictory values
 *   7. Provide companion dashboard data for Android Auto / CarPlay
 *   8. Log data binding validation (lightweight)
 *
 * Data Flow:
 *   Store → Sync Coordinator → ECS Bus → Widget Bridge → Widget
 *
 * Widgets continue to read from their existing stores for
 * primary data. The bridge provides:
 *   - Freshness metadata (is this data live, stale, or unavailable?)
 *   - Cross-system validation (does power data agree with risk data?)
 *   - Placeholder resolution (what to show when a system is down?)
 *   - Mode-aware priorities (which widgets matter in Highway vs Expedition?)
 *
 * Performance:
 *   - All reads are synchronous cache lookups (< 1ms)
 *   - No additional timers or polling
 *   - Subscribes to bus events for reactive updates
 *   - Debounce inherited from bus layer
 */

import { ecsBus } from './ecsBus';
import type {
  EcsChannel,
  EcsFreshness,
  EcsSummaryBase,
  EcsSummaryMap,
  EcsPowerSummary,
  EcsVehicleHealthSummary,
  EcsConnectivitySummary,
  EcsRemotenessSummary,
  EcsRiskSummary,
  EcsOfflineReadinessSummary,
  EcsRouteSummary,
  EcsLoadoutSummary,
  EcsVehicleProfileSummary,
  EcsCompanionSummary,
} from './ecsSyncTypes';
import type { DashboardMode } from './widgetRegistry';

const TAG = '[ECS-WIDGET-BRIDGE]';


// ══════════════════════════════════════════════════════════
// WIDGET → CHANNEL MAPPING
// ══════════════════════════════════════════════════════════

/**
 * Maps each widget_id to the ECS channels it depends on.
 * Primary channel is listed first — determines the widget's
 * overall freshness state.
 */
export const WIDGET_CHANNEL_MAP: Record<string, EcsChannel[]> = {
  // ── Core 6 Instruments ─────────────────────────────────
  'vehicle-systems':   ['vehicle_health', 'power', 'loadout', 'vehicle_profile'],
  'attitude-monitor':  [],  // Uses device sensors, not ECS bus
  'remoteness':        ['remoteness', 'connectivity', 'offline_readiness'],
  'progress':          ['route'],
  'sustainability':    ['power', 'vehicle_profile', 'route'],
  'vehicle-twin':      ['vehicle_profile', 'loadout'],

  // ── Addable Widgets ────────────────────────────────────
  'ecoflow-power':     ['power'],

  // ── Highway Widgets ────────────────────────────────────
  'hwy-forward-weather':    ['connectivity'],
  'hwy-daylight-remaining': [],  // Uses GPS coordinate + resolved coordinate timezone
  'hwy-wind-monitor':       ['connectivity'],
  'hwy-elevation-profile':  ['route'],
  'hwy-road-hazards':       ['connectivity', 'route'],
  'hwy-power-monitor':      ['vehicle_health', 'power'],
  'hwy-sun-glare':          [],  // Uses device clock + GPS

  // ── Retired (still mapped for safety) ──────────────────
  'stability-index':        [],
  'status-overview':        ['risk', 'route'],
  'route-progress':         ['route'],
  'operational-readiness':  ['loadout', 'route', 'power'],
  'fuel-range':             ['vehicle_profile'],
  'vehicle-health':         ['vehicle_health'],
  'water-projection':       ['vehicle_profile'],
  'mission-sustainment':    ['power', 'vehicle_profile'],
  'loadout-readiness':      ['loadout'],
  'emergency-controls':     ['connectivity'],
  'expedition-channel':     ['connectivity'],
};


// ══════════════════════════════════════════════════════════
// WIDGET FRESHNESS STATE
// ══════════════════════════════════════════════════════════

/**
 * Per-widget freshness state.
 * Derived from the freshness of its dependent channels.
 */
export interface WidgetFreshnessState {
  /** Overall freshness (worst of all dependent channels) */
  freshness: EcsFreshness;
  /** Whether the widget has any usable data */
  has_data: boolean;
  /** Whether any dependent channel is stale */
  has_stale_data: boolean;
  /** Whether all dependent channels are live */
  all_live: boolean;
  /** Per-channel freshness breakdown */
  channel_freshness: Partial<Record<EcsChannel, EcsFreshness>>;
  /** Human-readable freshness label */
  freshness_label: string;
  /** Seconds since last update (for "Updated Xs ago" display) */
  seconds_since_update: number | null;
}

/**
 * Get the freshness state for a specific widget.
 */
export function getWidgetFreshness(widgetId: string): WidgetFreshnessState {
  const channels = WIDGET_CHANNEL_MAP[widgetId] || [];

  // Widgets with no channel dependencies are always "live"
  if (channels.length === 0) {
    return {
      freshness: 'live',
      has_data: true,
      has_stale_data: false,
      all_live: true,
      channel_freshness: {},
      freshness_label: 'LIVE',
      seconds_since_update: null,
    };
  }

  const channelFreshness: Partial<Record<EcsChannel, EcsFreshness>> = {};
  let worstFreshness: EcsFreshness = 'live';
  let hasAnyData = false;
  let hasStale = false;
  let allLive = true;
  let latestTimestamp = 0;

  const freshnessOrder: Record<EcsFreshness, number> = {
    live: 0,
    recent: 1,
    stale: 2,
    unavailable: 3,
  };

  for (const channel of channels) {
    const f = ecsBus.getChannelFreshness(channel);
    channelFreshness[channel] = f;

    if (f !== 'unavailable') hasAnyData = true;
    if (f === 'stale') hasStale = true;
    if (f !== 'live') allLive = false;

    if (freshnessOrder[f] > freshnessOrder[worstFreshness]) {
      worstFreshness = f;
    }

    const ts = ecsBus.getLastPublishTimestamp(channel);
    if (ts > latestTimestamp) latestTimestamp = ts;
  }

  // Freshness label
  const labelMap: Record<EcsFreshness, string> = {
    live: 'LIVE',
    recent: 'RECENT',
    stale: 'STALE',
    unavailable: 'AWAITING',
  };

  const secondsSinceUpdate = latestTimestamp > 0
    ? Math.round((Date.now() - latestTimestamp) / 1000)
    : null;

  return {
    freshness: worstFreshness,
    has_data: hasAnyData,
    has_stale_data: hasStale,
    all_live: allLive,
    channel_freshness: channelFreshness,
    freshness_label: labelMap[worstFreshness],
    seconds_since_update: secondsSinceUpdate,
  };
}


// ══════════════════════════════════════════════════════════
// WIDGET PLACEHOLDER RESOLUTION
// ══════════════════════════════════════════════════════════

export interface WidgetPlaceholderState {
  /** Whether the widget should show a placeholder */
  show_placeholder: boolean;
  /** Placeholder type */
  type: 'none' | 'awaiting_data' | 'stale_data' | 'system_unavailable';
  /** Primary message for the placeholder */
  message: string;
  /** Secondary message (action hint) */
  hint: string | null;
}

/**
 * Resolve the placeholder state for a widget.
 * Returns 'none' if the widget has valid data to display.
 */
export function resolveWidgetPlaceholder(widgetId: string): WidgetPlaceholderState {
  const channels = WIDGET_CHANNEL_MAP[widgetId] || [];

  // No channel dependencies → never show placeholder
  if (channels.length === 0) {
    return { show_placeholder: false, type: 'none', message: '', hint: null };
  }

  const freshness = getWidgetFreshness(widgetId);

  // All data available → no placeholder
  if (freshness.has_data && freshness.freshness !== 'unavailable') {
    // Stale data → show subtle indicator but not a full placeholder
    if (freshness.has_stale_data) {
      return {
        show_placeholder: false,
        type: 'stale_data',
        message: 'Data may be outdated',
        hint: null,
      };
    }
    return { show_placeholder: false, type: 'none', message: '', hint: null };
  }

  // No data at all → show placeholder
  const primaryChannel = channels[0];
  const summary = ecsBus.getSummary(primaryChannel as keyof EcsSummaryMap);

  if (!summary || !summary.available) {
    return {
      show_placeholder: true,
      type: 'system_unavailable',
      message: 'System unavailable',
      hint: 'Waiting for data source',
    };
  }

  return {
    show_placeholder: true,
    type: 'awaiting_data',
    message: 'Awaiting data',
    hint: 'Connecting to system',
  };
}


// ══════════════════════════════════════════════════════════
// MODE-AWARE WIDGET PRIORITIES
// ══════════════════════════════════════════════════════════

/**
 * Widget priority weights for each dashboard mode.
 * Higher weight = more important in that mode.
 * Used for refresh ordering and data allocation.
 */
export const MODE_WIDGET_PRIORITIES: Record<DashboardMode, Record<string, number>> = {
  expedition: {
    'remoteness': 10,
    'vehicle-systems': 9,
    'sustainability': 9,
    'attitude-monitor': 8,
    'progress': 8,
    'vehicle-twin': 7,
    'ecoflow-power': 6,
    'expedition-channel': 5,
  },
  highway: {
    'vehicle-systems': 10,
    'attitude-monitor': 9,
    'hwy-forward-weather': 8,
    'hwy-daylight-remaining': 7,
    'hwy-road-hazards': 7,
    'hwy-wind-monitor': 6,
    'hwy-elevation-profile': 6,
    'hwy-power-monitor': 5,
    'hwy-sun-glare': 5,
    'sustainability': 5,
    'progress': 4,
    'remoteness': 3,
    'vehicle-twin': 3,
  },
};

/**
 * Get the refresh priority for a widget in the current mode.
 * Returns 0 for unregistered widgets.
 */
export function getWidgetPriority(widgetId: string, mode: DashboardMode): number {
  return MODE_WIDGET_PRIORITIES[mode]?.[widgetId] ?? 0;
}

/**
 * Get widgets sorted by priority for a given mode.
 * Returns widget IDs in descending priority order.
 */
export function getWidgetsByPriority(mode: DashboardMode): string[] {
  const priorities = MODE_WIDGET_PRIORITIES[mode] || {};
  return Object.entries(priorities)
    .sort(([, a], [, b]) => b - a)
    .map(([id]) => id);
}


// ══════════════════════════════════════════════════════════
// CROSS-WIDGET DATA CONSISTENCY
// ══════════════════════════════════════════════════════════

export interface DataConsistencyReport {
  /** Whether all widgets are showing consistent data */
  is_consistent: boolean;
  /** List of inconsistencies found */
  inconsistencies: string[];
  /** Timestamp of the check */
  checked_at: string;
}

/**
 * Check for data consistency across widgets.
 * Detects contradictions between related widgets.
 *
 * Example: Vehicle Systems shows fuel at 80% but Sustainability
 * shows fuel at 30% — this indicates a sync issue.
 */
export function checkDataConsistency(): DataConsistencyReport {
  const inconsistencies: string[] = [];

  try {
    const power = ecsBus.getSummary('power');
    const vehicleHealth = ecsBus.getSummary('vehicle_health');
    const risk = ecsBus.getSummary('risk');
    const connectivity = ecsBus.getSummary('connectivity');
    const remoteness = ecsBus.getSummary('remoteness');

    // Check: If power shows critical battery but risk doesn't flag it
    if (power?.available && power.battery_percent != null && power.battery_percent < 15) {
      if (risk?.available && risk.primary_risk_factor !== 'power_critical') {
        // This is acceptable if other risks are higher priority
        // Only flag if risk score is low (indicating it missed the power issue)
        if (risk.risk_score < 20) {
          inconsistencies.push('Power critical but risk score low');
        }
      }
    }

    // Check: If connectivity shows offline but remoteness doesn't reflect it
    if (connectivity?.available && connectivity.state === 'offline') {
      if (remoteness?.available && remoteness.score != null && remoteness.score < 20) {
        inconsistencies.push('Offline but remoteness score low');
      }
    }

    // Check: Freshness divergence — one system much older than another
    const powerTs = ecsBus.getLastPublishTimestamp('power');
    const vehicleTs = ecsBus.getLastPublishTimestamp('vehicle_health');
    if (powerTs > 0 && vehicleTs > 0) {
      const divergence = Math.abs(powerTs - vehicleTs);
      if (divergence > 60_000) { // > 1 minute divergence
        inconsistencies.push(`Power/Vehicle health timestamp divergence: ${Math.round(divergence / 1000)}s`);
      }
    }
  } catch (e) {
    inconsistencies.push(`Consistency check error: ${e}`);
  }

  return {
    is_consistent: inconsistencies.length === 0,
    inconsistencies,
    checked_at: new Date().toISOString(),
  };
}


// ══════════════════════════════════════════════════════════
// WIDGET SUMMARY ACCESS — Typed Helpers
// ══════════════════════════════════════════════════════════

/**
 * Get the power summary for Sustainability / EcoFlow widgets.
 */
export function getPowerSummary(): EcsPowerSummary | null {
  return ecsBus.getSummary('power');
}

/**
 * Get the vehicle health summary for Vehicle Systems widget.
 */
export function getVehicleHealthSummary(): EcsVehicleHealthSummary | null {
  return ecsBus.getSummary('vehicle_health');
}

/**
 * Get the connectivity summary for Remoteness / Cell Coverage widgets.
 */
export function getConnectivitySummary(): EcsConnectivitySummary | null {
  return ecsBus.getSummary('connectivity');
}

/**
 * Get the remoteness summary for Remoteness widget.
 */
export function getRemotenessSummary(): EcsRemotenessSummary | null {
  return ecsBus.getSummary('remoteness');
}

/**
 * Get the risk summary for Risk Indicator.
 */
export function getRiskSummary(): EcsRiskSummary | null {
  return ecsBus.getSummary('risk');
}

/**
 * Get the route summary for Progress widget.
 */
export function getRouteSummary(): EcsRouteSummary | null {
  return ecsBus.getSummary('route');
}

/**
 * Get the loadout summary for Vehicle Twin / Loadout widgets.
 */
export function getLoadoutSummary(): EcsLoadoutSummary | null {
  return ecsBus.getSummary('loadout');
}

/**
 * Get the vehicle profile summary.
 */
export function getVehicleProfileSummary(): EcsVehicleProfileSummary | null {
  return ecsBus.getSummary('vehicle_profile');
}

/**
 * Get the offline readiness summary.
 */
export function getOfflineReadinessSummary(): EcsOfflineReadinessSummary | null {
  return ecsBus.getSummary('offline_readiness');
}


// ══════════════════════════════════════════════════════════
// COMPANION DASHBOARD DATA
// ══════════════════════════════════════════════════════════

/**
 * Companion widget data for Android Auto / CarPlay.
 * Simplified, safe subset of widget data.
 */
export interface CompanionWidgetData {
  /** Vehicle status summary line */
  vehicle_status: string;
  /** Fuel percentage */
  fuel_pct: number | null;
  /** Power/battery percentage */
  power_pct: number | null;
  /** Risk status label */
  risk_label: string;
  /** Risk color hex */
  risk_color: string;
  /** Remoteness tier label */
  remoteness_label: string | null;
  /** Connectivity state */
  connectivity: string;
  /** Route name (if active) */
  route_name: string | null;
  /** Data freshness */
  freshness: EcsFreshness;
  /** Timestamp */
  updated_at: string;
}

const RISK_COLORS: Record<string, string> = {
  optimal: '#4CAF50',
  caution: '#FFB300',
  elevated: '#E67E22',
  critical: '#EF5350',
};

/**
 * Build companion widget data for Android Auto / CarPlay.
 * Consumes the same normalized ECS bus data as the main dashboard.
 */
export function getCompanionWidgetData(): CompanionWidgetData {
  const vehicleHealth = ecsBus.getSummary('vehicle_health');
  const power = ecsBus.getSummary('power');
  const risk = ecsBus.getSummary('risk');
  const remoteness = ecsBus.getSummary('remoteness');
  const connectivity = ecsBus.getSummary('connectivity');
  const route = ecsBus.getSummary('route');

  // Vehicle status summary
  let vehicleStatus = 'Systems nominal';
  if (vehicleHealth?.has_anomaly) {
    vehicleStatus = `Alert: ${vehicleHealth.anomaly_flags[0]?.replace(/_/g, ' ') || 'anomaly detected'}`;
  } else if (vehicleHealth?.engine_status === 'running') {
    vehicleStatus = 'Engine running';
  } else if (!vehicleHealth?.available) {
    vehicleStatus = 'No telemetry';
  }

  // Overall freshness (worst of critical systems)
  const criticalChannels: EcsChannel[] = ['vehicle_health', 'power', 'risk'];
  let worstFreshness: EcsFreshness = 'live';
  const freshnessOrder: Record<EcsFreshness, number> = { live: 0, recent: 1, stale: 2, unavailable: 3 };

  for (const ch of criticalChannels) {
    const f = ecsBus.getChannelFreshness(ch);
    if (freshnessOrder[f] > freshnessOrder[worstFreshness]) {
      worstFreshness = f;
    }
  }

  return {
    vehicle_status: vehicleStatus,
    fuel_pct: vehicleHealth?.fuel_percent ?? null,
    power_pct: power?.battery_percent ?? null,
    risk_label: risk?.operational_status ?? 'optimal',
    risk_color: RISK_COLORS[risk?.operational_status ?? 'optimal'] ?? '#4CAF50',
    remoteness_label: remoteness?.tier ?? null,
    connectivity: connectivity?.state ?? 'unknown',
    route_name: route?.route_name ?? null,
    freshness: worstFreshness,
    updated_at: new Date().toISOString(),
  };
}


// ══════════════════════════════════════════════════════════
// DATA BINDING VALIDATION LOGGING
// ══════════════════════════════════════════════════════════

let _lastValidationLog = 0;
const VALIDATION_LOG_INTERVAL_MS = 30_000; // Log at most every 30 seconds

/**
 * Log a lightweight data binding validation.
 * Called periodically by the dashboard to verify widgets
 * are receiving data from the correct channels.
 *
 * Throttled to prevent log noise.
 */
export function logDataBindingValidation(activeWidgetIds: string[], mode: DashboardMode): void {
  const now = Date.now();
  if (now - _lastValidationLog < VALIDATION_LOG_INTERVAL_MS) return;
  _lastValidationLog = now;

  const bindings: string[] = [];
  let staleCount = 0;
  let unavailableCount = 0;

  for (const widgetId of activeWidgetIds) {
    const freshness = getWidgetFreshness(widgetId);
    if (freshness.freshness === 'stale') staleCount++;
    if (freshness.freshness === 'unavailable' && (WIDGET_CHANNEL_MAP[widgetId]?.length ?? 0) > 0) {
      unavailableCount++;
    }
    bindings.push(`${widgetId}:${freshness.freshness_label}`);
  }

  console.log(
    TAG,
    `Binding validation [${mode}]: ${activeWidgetIds.length} widgets, ` +
    `${staleCount} stale, ${unavailableCount} unavailable | ${bindings.join(', ')}`
  );
}


// ══════════════════════════════════════════════════════════
// BRIDGE LIFECYCLE
// ══════════════════════════════════════════════════════════

let _bridgeSubscriptions: (() => void)[] = [];
let _bridgeListeners: (() => void)[] = [];
let _bridgeRevision = 0;

/**
 * Subscribe to bridge updates.
 * Called when any ECS bus channel updates, triggering a
 * revision increment that React components can observe.
 *
 * @returns Unsubscribe function
 */
export function subscribeToBridge(callback: () => void): () => void {
  _bridgeListeners.push(callback);
  return () => {
    _bridgeListeners = _bridgeListeners.filter(l => l !== callback);
  };
}

/**
 * Get the current bridge revision.
 * Increments on each bus update. React components can use
 * this as a dependency to trigger re-renders.
 */
export function getBridgeRevision(): number {
  return _bridgeRevision;
}

/**
 * Initialize the bridge.
 * Subscribes to all ECS bus channels and notifies listeners
 * on any update.
 */
export function initBridge(): void {
  // Prevent double-init
  if (_bridgeSubscriptions.length > 0) return;

  const channels: EcsChannel[] = [
    'power', 'vehicle_health', 'connectivity', 'remoteness',
    'risk', 'offline_readiness', 'route', 'loadout', 'vehicle_profile',
  ];

  for (const channel of channels) {
    const unsub = ecsBus.subscribe(channel, () => {
      _bridgeRevision++;
      // Notify all listeners (React components)
      for (const listener of _bridgeListeners) {
        try { listener(); } catch {}
      }
    });
    _bridgeSubscriptions.push(unsub);
  }

  console.log(TAG, `Bridge initialized (${channels.length} channels)`);
}

/**
 * Teardown the bridge.
 */
export function teardownBridge(): void {
  for (const unsub of _bridgeSubscriptions) {
    try { unsub(); } catch {}
  }
  _bridgeSubscriptions = [];
  _bridgeListeners = [];
  console.log(TAG, 'Bridge torn down');
}
