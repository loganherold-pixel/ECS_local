/**
 * Shared Constants & Utilities
 *
 * Extracted from dashboardStore.ts to break circular dependency chains.
 * Any module that only needs these lightweight helpers can import from
 * here instead of pulling in the full dashboardStore (which transitively
 * imports widgetRegistry, customWidgetStore, syncActionQueue, and
 * dashboardPersistence).
 *
 * This file has ZERO imports from other app modules — it is a leaf node
 * in the dependency graph and can never participate in a cycle.
 */

// ── Widget type helpers ─────────────────────────────────────

/** Check if a widget type string represents a custom (user-created) widget */
export function isCustomWidget(type: string | null): boolean {
  return type != null && type.startsWith('custom-');
}

// ── Dashboard types (duplicated as pure types to avoid importing dashboardStore) ──

export type WidgetType =
  | 'status-overview'
  | 'route-progress'
  | 'loadout-readiness'
  | 'water-projection'
  | 'fuel-range'
  | 'vehicle-health'
  | 'emergency-controls'
  | 'power-systems'
  | 'vehicle-systems'
  | 'stability-index'
  | 'attitude-monitor'
  | 'attitude-command'
  | 'mission-sustainment'
  | 'operational-readiness'
  | 'sustainability'
  | 'progress'
  | 'navigate-surface'
  | 'remoteness'
  | 'expedition-channel'
  | 'trip-demand-analyzer'
  | 'vehicle-twin'
  | 'ecoflow-power'
  | 'ecs-power'
  | 'vehicle-telemetry'
  | 'expedition-readiness'
  | 'expedition-status-summary'
  | 'expedition-risk'
  | 'terrain-risk'
  // Highway widgets
  | 'hwy-forward-weather'
  | 'hwy-daylight-remaining'
  | 'hwy-cell-coverage'
  | 'hwy-wind-monitor'
  | 'hwy-elevation-profile'
  | 'hwy-road-hazards'
  | 'hwy-power-monitor'
  | 'hwy-sun-glare';






export type DashboardMode = 'expedition' | 'highway';

