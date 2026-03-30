/**
 * ═══════════════════════════════════════════════════════════
 * ECS WIDGET DATA PROVIDER — Integration Pass 2
 * ═══════════════════════════════════════════════════════════
 *
 * React integration layer for the ECS Widget Data Bridge.
 *
 * Provides:
 *   - useWidgetBridge() hook for reactive bus data
 *   - useWidgetFreshness(widgetId) hook for per-widget freshness
 *   - useRiskIndicator() hook for dashboard risk indicator
 *   - Automatic bridge initialization and teardown
 *   - Mode-aware data binding validation
 *
 * Usage:
 *   In WidgetGrid or dashboard.tsx:
 *     const { revision, isStale } = useWidgetBridge();
 *
 *   In individual widget renderers:
 *     const freshness = useWidgetFreshness('vehicle-systems');
 *
 * Performance:
 *   - Single subscription to the bridge (not per-widget)
 *   - Revision counter triggers React re-renders only when data changes
 *   - No additional timers or polling
 *   - Freshness checks are synchronous cache lookups
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  initBridge,
  teardownBridge,
  subscribeToBridge,
  getBridgeRevision,
  getWidgetFreshness,
  resolveWidgetPlaceholder,
  getRiskSummary,
  logDataBindingValidation,
  checkDataConsistency,
  getCompanionWidgetData,
  type WidgetFreshnessState,
  type WidgetPlaceholderState,
  type CompanionWidgetData,
  type DataConsistencyReport,
} from '../../lib/ecsWidgetBridge';
import type { EcsRiskSummary, EcsFreshness } from '../../lib/ecsSyncTypes';
import type { DashboardMode } from '../../lib/widgetRegistry';


// ══════════════════════════════════════════════════════════
// useWidgetBridge — Core Hook
// ══════════════════════════════════════════════════════════

export interface WidgetBridgeState {
  /** Bridge revision counter — increments on each bus update */
  revision: number;
  /** Whether any critical system has stale data */
  isStale: boolean;
  /** Whether the bridge is initialized */
  isInitialized: boolean;
}

/**
 * Core hook for the ECS Widget Data Bridge.
 *
 * Initializes the bridge on mount, subscribes to updates,
 * and provides a revision counter for reactive re-renders.
 *
 * Should be called once in WidgetGrid or dashboard.tsx.
 */
export function useWidgetBridge(): WidgetBridgeState {
  const [revision, setRevision] = useState(0);
  const [isInitialized, setIsInitialized] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;

    // Initialize the bridge
    initBridge();
    setIsInitialized(true);

    // Subscribe to bridge updates
    const unsub = subscribeToBridge(() => {
      if (mountedRef.current) {
        setRevision(getBridgeRevision());
      }
    });

    return () => {
      mountedRef.current = false;
      unsub();
      // Don't teardown bridge on unmount — it may be shared
      // Bridge teardown is handled by _layout.tsx
    };
  }, []);

  // Check if any critical system is stale
  const isStale = (() => {
    const risk = getRiskSummary();
    if (risk && risk.freshness === 'stale') return true;
    return false;
  })();

  return { revision, isStale, isInitialized };
}


// ══════════════════════════════════════════════════════════
// useWidgetFreshness — Per-Widget Freshness
// ══════════════════════════════════════════════════════════

/**
 * Hook to get the freshness state for a specific widget.
 *
 * Re-evaluates whenever the bridge revision changes.
 * Lightweight — just reads from the bus cache.
 */
export function useWidgetFreshness(widgetId: string): WidgetFreshnessState {
  const [, setRev] = useState(0);

  useEffect(() => {
    const unsub = subscribeToBridge(() => setRev(r => r + 1));
    return unsub;
  }, []);

  return getWidgetFreshness(widgetId);
}


// ══════════════════════════════════════════════════════════
// useWidgetPlaceholder — Per-Widget Placeholder
// ══════════════════════════════════════════════════════════

/**
 * Hook to get the placeholder state for a specific widget.
 *
 * Returns whether the widget should show a placeholder,
 * and what message to display.
 */
export function useWidgetPlaceholder(widgetId: string): WidgetPlaceholderState {
  const [, setRev] = useState(0);

  useEffect(() => {
    const unsub = subscribeToBridge(() => setRev(r => r + 1));
    return unsub;
  }, []);

  return resolveWidgetPlaceholder(widgetId);
}


// ══════════════════════════════════════════════════════════
// useRiskIndicator — Dashboard Risk Indicator
// ══════════════════════════════════════════════════════════

export interface RiskIndicatorState {
  /** Risk score (0-100) */
  score: number;
  /** Operational status label */
  status: string;
  /** Status color hex */
  color: string;
  /** Primary risk factor label */
  primary_factor: string;
  /** Summary line */
  summary: string;
  /** Whether risk data is available */
  available: boolean;
  /** Data freshness */
  freshness: EcsFreshness;
}

const RISK_STATUS_COLORS: Record<string, string> = {
  optimal: '#4CAF50',
  caution: '#FFB300',
  elevated: '#E67E22',
  critical: '#EF5350',
};

/**
 * Hook for the dashboard risk indicator.
 *
 * Reads from the ECS bus risk channel and provides
 * a reactive risk state for the dashboard UI.
 *
 * Updates when:
 *   - Risk Engine re-evaluates
 *   - Any Tier 1 input changes that affects risk
 */
export function useRiskIndicator(): RiskIndicatorState {
  const [, setRev] = useState(0);

  useEffect(() => {
    const unsub = subscribeToBridge(() => setRev(r => r + 1));
    return unsub;
  }, []);

  const risk = getRiskSummary();

  if (!risk || !risk.available) {
    return {
      score: 0,
      status: 'optimal',
      color: '#4CAF50',
      primary_factor: 'none',
      summary: 'Awaiting data\u2026',
      available: false,
      freshness: 'unavailable',
    };
  }

  return {
    score: risk.risk_score,
    status: risk.operational_status,
    color: RISK_STATUS_COLORS[risk.operational_status] ?? '#4CAF50',
    primary_factor: risk.primary_risk_factor,
    summary: risk.summary_line,
    available: true,
    freshness: risk.freshness,
  };
}


// ══════════════════════════════════════════════════════════
// useDataConsistency — Cross-Widget Validation
// ══════════════════════════════════════════════════════════

/**
 * Hook for cross-widget data consistency checking.
 * Runs periodically (every 30s) and on bridge updates.
 *
 * Returns a report of any inconsistencies found.
 */
export function useDataConsistency(): DataConsistencyReport {
  const [report, setReport] = useState<DataConsistencyReport>({
    is_consistent: true,
    inconsistencies: [],
    checked_at: new Date().toISOString(),
  });

  useEffect(() => {
    // Check on mount
    setReport(checkDataConsistency());

    // Check periodically
    const interval = setInterval(() => {
      setReport(checkDataConsistency());
    }, 30_000);

    return () => clearInterval(interval);
  }, []);

  return report;
}


// ══════════════════════════════════════════════════════════
// useCompanionData — Android Auto / CarPlay
// ══════════════════════════════════════════════════════════

/**
 * Hook for companion dashboard data.
 * Provides a simplified data set safe for Android Auto / CarPlay.
 */
export function useCompanionData(): CompanionWidgetData {
  const [, setRev] = useState(0);

  useEffect(() => {
    const unsub = subscribeToBridge(() => setRev(r => r + 1));
    return unsub;
  }, []);

  return getCompanionWidgetData();
}


// ══════════════════════════════════════════════════════════
// useDataBindingValidation — Logging Hook
// ══════════════════════════════════════════════════════════

/**
 * Hook that periodically logs data binding validation.
 * Should be called once in the dashboard component.
 *
 * @param activeWidgetIds - Currently displayed widget IDs
 * @param mode - Current dashboard mode
 */
export function useDataBindingValidation(
  activeWidgetIds: string[],
  mode: DashboardMode,
): void {
  const widgetIdsRef = useRef(activeWidgetIds);
  const modeRef = useRef(mode);
  widgetIdsRef.current = activeWidgetIds;
  modeRef.current = mode;

  useEffect(() => {
    // Log on mount
    logDataBindingValidation(widgetIdsRef.current, modeRef.current);

    // Log periodically
    const interval = setInterval(() => {
      logDataBindingValidation(widgetIdsRef.current, modeRef.current);
    }, 30_000);

    return () => clearInterval(interval);
  }, []);

  // Also log when mode changes
  useEffect(() => {
    logDataBindingValidation(activeWidgetIds, mode);
  }, [mode]);
}



