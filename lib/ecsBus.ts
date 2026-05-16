/**
 * ═══════════════════════════════════════════════════════════
 * ECS CENTRAL EVENT BUS — Integration Pass 1
 * ═══════════════════════════════════════════════════════════
 *
 * Lightweight publish/subscribe bus for cross-system data flow.
 *
 * Design Principles:
 *   - Single source of truth for inter-system communication
 *   - Built-in debounce per channel (prevents update storms)
 *   - Circular dependency prevention via propagation locks
 *   - Timestamp-aware update handling (stale data rejected)
 *   - Source-aware subscriptions (prevent self-triggering)
 *   - Ordered cascade support (Tier 1 → Tier 2 → Tier 3)
 *   - Partial failure isolation (one subscriber crash ≠ bus crash)
 *   - Performance-safe logging (suppressed during normal operation)
 *
 * Update Order Enforcement:
 *   Tier 1 (priority 1): Raw provider data
 *     power, vehicle_health, connectivity, remoteness,
 *     route, loadout, vehicle_profile, offline_readiness
 *   Tier 2 (priority 2): Computed aggregates
 *     risk
 *   Tier 3 (priority 3): AI/advisory layer
 *     assistant
 *
 * Anti-Patterns Prevented:
 *   - Risk Engine → Assistant → Risk Engine (circular)
 *   - Multiple stores updating → N² recalculations
 *   - Stale data from slow system overwriting fresh data
 *   - Widget directly reading raw provider (bypassing service layer)
 */

import type {
  EcsChannel,
  EcsBusEvent,
  EcsSummaryBase,
  EcsSummaryMap,
  EcsFreshness,
} from './ecsSyncTypes';
import { ECS_CHANNEL_PRIORITY } from './ecsSyncTypes';
import { ecsLog } from './ecsLogger';

const TAG = '[ECS-BUS]';

function debugBus(message: string, details?: Record<string, unknown>): void {
  ecsLog.debug('SYSTEM', message, details);
}


// ── Configuration ────────────────────────────────────────

/** Default debounce window per channel (ms) */
const DEFAULT_DEBOUNCE_MS = 500;

/** Per-channel debounce overrides */
const CHANNEL_DEBOUNCE_MS: Partial<Record<EcsChannel, number>> = {
  // Tier 1: Faster propagation for raw data
  power: 300,
  vehicle_health: 300,
  connectivity: 400,
  remoteness: 500,
  route: 200,
  loadout: 200,
  vehicle_profile: 200,
  offline_readiness: 400,
  // Tier 2: Slightly slower to batch Tier 1 updates
  risk: 800,
  // Tier 3: Slowest — batches all upstream changes
  assistant: 1500,
};

/** Maximum age (ms) before a summary is considered stale */
const STALE_THRESHOLD_MS = 120_000; // 2 minutes

/** Maximum propagation depth to prevent runaway cascades */
const MAX_PROPAGATION_DEPTH = 5;

/** Minimum interval between verbose log entries (ms) */
const LOG_THROTTLE_MS = 10_000;


// ── Internal State ───────────────────────────────────────

interface Subscription {
  id: string;
  channel: EcsChannel;
  callback: (event: EcsBusEvent) => void;
  exclude_source?: string;
}

let _subscriptions: Subscription[] = [];
let _subIdCounter = 0;

/** Per-channel debounce timers */
const _debounceTimers: Partial<Record<EcsChannel, ReturnType<typeof setTimeout>>> = {};

/** Per-channel last publish timestamp (for staleness detection) */
const _lastPublishTimestamp: Partial<Record<EcsChannel, number>> = {};

/** Per-channel last summary cache */
const _summaryCache: Partial<EcsSummaryMap> = {};

/** Propagation lock — prevents circular cascades */
let _propagating = false;
let _propagationDepth = 0;
let _propagationSource: string | null = null;

/** Active propagation ID — used to detect re-entrant calls */
let _activePropagationId: string | null = null;

/** Logging throttle */
let _lastVerboseLog = 0;

/** Metrics */
let _publishCount = 0;
let _suppressedCount = 0;
let _debounceCount = 0;
let _circularPreventionCount = 0;
let _staleRejectionCount = 0;


// ── ID Generation ────────────────────────────────────────

function _genId(): string {
  return `prop_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function _genSubId(): string {
  return `sub_${++_subIdCounter}`;
}


// ── Freshness Helpers ────────────────────────────────────

function _computeFreshness(updatedAt: string): EcsFreshness {
  const age = Date.now() - new Date(updatedAt).getTime();
  if (age < 10_000) return 'live';
  if (age < 60_000) return 'recent';
  if (age < STALE_THRESHOLD_MS) return 'stale';
  return 'unavailable';
}


// ── Logging ──────────────────────────────────────────────

function _shouldLogVerbose(): boolean {
  const now = Date.now();
  if (now - _lastVerboseLog > LOG_THROTTLE_MS) {
    _lastVerboseLog = now;
    return true;
  }
  return false;
}


// ══════════════════════════════════════════════════════════
// PUBLISH — Core Bus Operation
// ══════════════════════════════════════════════════════════

/**
 * Publish an update to a channel.
 *
 * This is the primary mechanism for cross-system data flow.
 * The publish is debounced per-channel to batch rapid updates.
 *
 * @param channel - The ECS channel to publish to
 * @param source - Identifier of the publishing system (for circular prevention)
 * @param summary - Optional summary data to cache
 */
function _publishImmediate(channel: EcsChannel, source: string, summary?: EcsSummaryBase): void {
  const now = Date.now();

  // ── Circular dependency prevention ─────────────────────
  if (_propagating && _propagationSource === source) {
    _circularPreventionCount++;
    if (_shouldLogVerbose()) {
      debugBus('Bus circular propagation prevented', {
        channel,
        depth: _propagationDepth,
        source,
      });
    }
    return;
  }

  if (_propagationDepth >= MAX_PROPAGATION_DEPTH) {
    _circularPreventionCount++;
    console.warn(TAG, `Max propagation depth reached (${MAX_PROPAGATION_DEPTH}), dropping: ${source} → ${channel}`);
    return;
  }

  // ── Timestamp-aware staleness check ────────────────────
  if (summary) {
    const lastTs = _lastPublishTimestamp[channel];
    if (lastTs && summary.updated_at) {
      const summaryTs = new Date(summary.updated_at).getTime();
      if (summaryTs < lastTs) {
        _staleRejectionCount++;
        if (_shouldLogVerbose()) {
          debugBus('Bus stale data rejected', {
            channel,
            lastTimestamp: lastTs,
            summaryTimestamp: summaryTs,
          });
        }
        return;
      }
    }
    // Cache the summary
    (_summaryCache as any)[channel] = summary;
  }

  _lastPublishTimestamp[channel] = now;
  _publishCount++;

  // ── Build event ────────────────────────────────────────
  const propagationId = _activePropagationId || _genId();
  const event: EcsBusEvent = {
    channel,
    timestamp: new Date().toISOString(),
    source,
    propagation_id: propagationId,
  };

  // ── Propagation lock ───────────────────────────────────
  const wasPropagating = _propagating;
  const prevSource = _propagationSource;
  const prevPropId = _activePropagationId;
  const prevDepth = _propagationDepth;

  _propagating = true;
  _propagationSource = source;
  _activePropagationId = propagationId;
  _propagationDepth++;

  // ── Notify subscribers ─────────────────────────────────
  const channelSubs = _subscriptions.filter(s => s.channel === channel);
  let notified = 0;

  for (const sub of channelSubs) {
    // Skip if subscriber excludes this source
    if (sub.exclude_source && sub.exclude_source === source) {
      _suppressedCount++;
      continue;
    }

    try {
      sub.callback(event);
      notified++;
    } catch (e) {
      // Partial failure isolation — one subscriber crash doesn't break the bus
      console.warn(TAG, `Subscriber error on ${channel}:`, e);
    }
  }

  // ── Restore propagation state ──────────────────────────
  _propagating = wasPropagating;
  _propagationSource = prevSource;
  _activePropagationId = prevPropId;
  _propagationDepth = prevDepth;

  // Verbose logging (throttled)
  if (_shouldLogVerbose() && notified > 0) {
    debugBus('Bus published event', {
      channel,
      depth: _propagationDepth + 1,
      notifiedSubscribers: notified,
      source,
    });
  }
}


// ══════════════════════════════════════════════════════════
// PUBLIC API
// ══════════════════════════════════════════════════════════

export const ecsBus = {

  /**
   * Publish an update to a channel with debounce.
   *
   * Multiple rapid publishes to the same channel are batched
   * into a single notification after the debounce window.
   *
   * @param channel - Target channel
   * @param source - Publishing system identifier
   * @param summary - Optional summary data to cache
   */
  publish(channel: EcsChannel, source: string, summary?: EcsSummaryBase): void {
    const debounceMs = CHANNEL_DEBOUNCE_MS[channel] ?? DEFAULT_DEBOUNCE_MS;

    // Clear existing debounce timer for this channel
    if (_debounceTimers[channel]) {
      clearTimeout(_debounceTimers[channel]!);
      _debounceCount++;
    }

    // Cache summary immediately (even before debounce fires)
    if (summary) {
      (_summaryCache as any)[channel] = summary;
      _lastPublishTimestamp[channel] = Date.now();
    }

    _debounceTimers[channel] = setTimeout(() => {
      delete _debounceTimers[channel];
      _publishImmediate(channel, source, summary);
    }, debounceMs);
  },

  /**
   * Publish immediately without debounce.
   * Use sparingly — only for critical state changes that
   * must propagate without delay.
   */
  publishImmediate(channel: EcsChannel, source: string, summary?: EcsSummaryBase): void {
    // Cancel any pending debounced publish
    if (_debounceTimers[channel]) {
      clearTimeout(_debounceTimers[channel]!);
      delete _debounceTimers[channel];
    }
    _publishImmediate(channel, source, summary);
  },

  /**
   * Subscribe to updates on a channel.
   *
   * @param channel - Channel to subscribe to
   * @param callback - Called when the channel receives an update
   * @param excludeSource - Optional: skip notifications from this source
   * @returns Unsubscribe function
   */
  subscribe(
    channel: EcsChannel,
    callback: (event: EcsBusEvent) => void,
    excludeSource?: string,
  ): () => void {
    const sub: Subscription = {
      id: _genSubId(),
      channel,
      callback,
      exclude_source: excludeSource,
    };
    _subscriptions.push(sub);

    return () => {
      _subscriptions = _subscriptions.filter(s => s.id !== sub.id);
    };
  },

  /**
   * Subscribe to multiple channels at once.
   *
   * @param channels - Channels to subscribe to
   * @param callback - Called when any subscribed channel updates
   * @param excludeSource - Optional: skip notifications from this source
   * @returns Unsubscribe function (removes all subscriptions)
   */
  subscribeMany(
    channels: EcsChannel[],
    callback: (event: EcsBusEvent) => void,
    excludeSource?: string,
  ): () => void {
    const unsubs = channels.map(ch => ecsBus.subscribe(ch, callback, excludeSource));
    return () => unsubs.forEach(u => u());
  },


  // ── Summary Cache Access ───────────────────────────────

  /**
   * Get the cached summary for a channel.
   * Returns null if no summary has been published.
   */
  getSummary<K extends keyof EcsSummaryMap>(channel: K): EcsSummaryMap[K] | null {
    return (_summaryCache as any)[channel] ?? null;
  },

  /**
   * Get all cached summaries.
   */
  getAllSummaries(): Partial<EcsSummaryMap> {
    return { ..._summaryCache };
  },

  /**
   * Get the freshness of a channel's cached summary.
   */
  getChannelFreshness(channel: EcsChannel): EcsFreshness {
    const ts = _lastPublishTimestamp[channel];
    if (!ts) return 'unavailable';
    const age = Date.now() - ts;
    if (age < 10_000) return 'live';
    if (age < 60_000) return 'recent';
    if (age < STALE_THRESHOLD_MS) return 'stale';
    return 'unavailable';
  },

  /**
   * Check if a channel has fresh data.
   */
  isChannelFresh(channel: EcsChannel): boolean {
    const f = ecsBus.getChannelFreshness(channel);
    return f === 'live' || f === 'recent';
  },

  /**
   * Get the timestamp of the last publish for a channel.
   */
  getLastPublishTimestamp(channel: EcsChannel): number {
    return _lastPublishTimestamp[channel] ?? 0;
  },


  // ── Propagation State ──────────────────────────────────

  /**
   * Whether the bus is currently propagating an update.
   * Useful for systems that need to know if they're being
   * called as part of a cascade.
   */
  isPropagating(): boolean {
    return _propagating;
  },

  /**
   * Get the current propagation depth.
   */
  getPropagationDepth(): number {
    return _propagationDepth;
  },

  /**
   * Get the source of the current propagation.
   */
  getPropagationSource(): string | null {
    return _propagationSource;
  },


  // ── Diagnostics ────────────────────────────────────────

  /**
   * Get bus metrics for diagnostics.
   */
  getMetrics(): {
    publish_count: number;
    suppressed_count: number;
    debounce_count: number;
    circular_prevention_count: number;
    stale_rejection_count: number;
    subscription_count: number;
    pending_debounce_count: number;
    channels_with_data: string[];
  } {
    return {
      publish_count: _publishCount,
      suppressed_count: _suppressedCount,
      debounce_count: _debounceCount,
      circular_prevention_count: _circularPreventionCount,
      stale_rejection_count: _staleRejectionCount,
      subscription_count: _subscriptions.length,
      pending_debounce_count: Object.keys(_debounceTimers).length,
      channels_with_data: Object.keys(_lastPublishTimestamp),
    };
  },

  /**
   * Get subscription count for a specific channel.
   */
  getChannelSubscriptionCount(channel: EcsChannel): number {
    return _subscriptions.filter(s => s.channel === channel).length;
  },


  // ── Lifecycle ──────────────────────────────────────────

  /**
   * Flush all pending debounced publishes immediately.
   * Useful during app backgrounding to ensure state is current.
   */
  flush(): void {
    const pendingChannels = Object.keys(_debounceTimers) as EcsChannel[];
    for (const channel of pendingChannels) {
      if (_debounceTimers[channel]) {
        clearTimeout(_debounceTimers[channel]!);
        delete _debounceTimers[channel];
        // Publish cached summary if available
        const cached = (_summaryCache as any)[channel];
        if (cached) {
          _publishImmediate(channel, 'flush', cached);
        }
      }
    }
    if (pendingChannels.length > 0) {
  debugBus('Bus flushed pending channels', { pendingChannels: pendingChannels.length });
    }
  },

  /**
   * Reset the bus — clear all subscriptions, timers, and caches.
   * Use during testing or full app reset.
   */
  reset(): void {
    // Clear all debounce timers
    for (const channel of Object.keys(_debounceTimers) as EcsChannel[]) {
      if (_debounceTimers[channel]) {
        clearTimeout(_debounceTimers[channel]!);
        delete _debounceTimers[channel];
      }
    }

    _subscriptions = [];
    _subIdCounter = 0;
    Object.keys(_lastPublishTimestamp).forEach(k => delete (_lastPublishTimestamp as any)[k]);
    Object.keys(_summaryCache).forEach(k => delete (_summaryCache as any)[k]);
    _propagating = false;
    _propagationDepth = 0;
    _propagationSource = null;
    _activePropagationId = null;
    _publishCount = 0;
    _suppressedCount = 0;
    _debounceCount = 0;
    _circularPreventionCount = 0;
    _staleRejectionCount = 0;

  debugBus('Bus reset');
  },
};

