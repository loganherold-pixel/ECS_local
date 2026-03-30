// ============================================================
// COMPLETION SUMMARY GENERATOR
// ============================================================
// Generates a JSON summary blob for a completed expedition.
// Stored in the expedition's `meta.completion_summary` field.
// ============================================================

import type {
  EcsExpedition,
  EcsChecklistItem,
  EcsFieldLog,
  EcsRoute,
  EcsWaypoint,
  EcsFieldLogType,
} from './expeditionTypes';
import { computeReadiness, FIELD_LOG_TYPE_META } from './expeditionTypes';

// ── Summary shape ───────────────────────────────────────────
export interface CompletionSummary {
  generated_at: string;
  version: number;

  // Duration
  duration: {
    start_at: string | null;
    end_at: string | null;
    total_hours: number | null;
    total_days: number | null;
    display: string;
  };

  // Checklist
  checklist: {
    total_items: number;
    completed_items: number;
    completion_pct: number;
    by_priority: Record<string, { total: number; done: number }>;
    by_category: Record<string, { total: number; done: number }>;
  };

  // Field logs
  field_logs: {
    total_entries: number;
    by_type: Record<string, number>;
    first_entry_at: string | null;
    last_entry_at: string | null;
  };

  // Routes
  routes: {
    total_routes: number;
    total_distance_mi: number | null;
    total_eta_hours: number | null;
    route_names: string[];
  };

  // Waypoints
  waypoints: {
    total_waypoints: number;
    visited_count: number;
    by_kind: Record<string, number>;
  };

  // Readiness
  readiness: {
    final_score: number;
    breakdown: Record<string, number>;
  };

  // Expedition metadata
  expedition: {
    title: string;
    terrain: string | null;
    planned_duration_days: number | null;
    distance_from_services_mi: number | null;
  };
}

// ── Duration formatter ──────────────────────────────────────
function formatDuration(totalHours: number | null): string {
  if (totalHours == null || totalHours < 0) return '--';
  if (totalHours < 1) {
    const mins = Math.round(totalHours * 60);
    return `${mins}m`;
  }
  const days = Math.floor(totalHours / 24);
  const hours = Math.round(totalHours % 24);
  if (days === 0) return `${hours}h`;
  if (hours === 0) return `${days}d`;
  return `${days}d ${hours}h`;
}

// ── Main generator ──────────────────────────────────────────
export function generateCompletionSummary(
  expedition: EcsExpedition,
  checklist: EcsChecklistItem[],
  fieldLogs: EcsFieldLog[],
  routes: EcsRoute[],
  waypoints: EcsWaypoint[],
): CompletionSummary {
  const nowStr = new Date().toISOString();

  // ── Duration ──────────────────────────────────────────────
  const startAt = expedition.start_at;
  const endAt = expedition.end_at || nowStr;
  let totalHours: number | null = null;
  let totalDays: number | null = null;

  if (startAt) {
    const startMs = new Date(startAt).getTime();
    const endMs = new Date(endAt).getTime();
    const diffMs = endMs - startMs;
    if (diffMs >= 0) {
      totalHours = Math.round((diffMs / (1000 * 60 * 60)) * 10) / 10;
      totalDays = Math.round((diffMs / (1000 * 60 * 60 * 24)) * 10) / 10;
    }
  }

  // ── Checklist ─────────────────────────────────────────────
  const totalItems = checklist.length;
  const completedItems = checklist.filter(i => i.is_done).length;
  const completionPct = totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 100;

  const byPriority: Record<string, { total: number; done: number }> = {};
  const byCategory: Record<string, { total: number; done: number }> = {};

  for (const item of checklist) {
    const pri = item.priority || 'normal';
    if (!byPriority[pri]) byPriority[pri] = { total: 0, done: 0 };
    byPriority[pri].total++;
    if (item.is_done) byPriority[pri].done++;

    const cat = item.category || 'general';
    if (!byCategory[cat]) byCategory[cat] = { total: 0, done: 0 };
    byCategory[cat].total++;
    if (item.is_done) byCategory[cat].done++;
  }

  // ── Field logs ────────────────────────────────────────────
  const totalEntries = fieldLogs.length;
  const byType: Record<string, number> = {};
  for (const log of fieldLogs) {
    const t = log.type || 'note';
    byType[t] = (byType[t] || 0) + 1;
  }

  // Sort by occurred_at to find first/last
  const sortedLogs = [...fieldLogs].sort(
    (a, b) => new Date(a.occurred_at).getTime() - new Date(b.occurred_at).getTime()
  );
  const firstEntryAt = sortedLogs.length > 0 ? sortedLogs[0].occurred_at : null;
  const lastEntryAt = sortedLogs.length > 0 ? sortedLogs[sortedLogs.length - 1].occurred_at : null;

  // ── Routes ────────────────────────────────────────────────
  const totalRoutes = routes.length;
  let totalDistanceMi: number | null = null;
  let totalEtaHours: number | null = null;
  const routeNames: string[] = [];

  for (const route of routes) {
    routeNames.push(route.name || 'Unnamed Route');
    if (route.distance_mi != null) {
      totalDistanceMi = (totalDistanceMi || 0) + route.distance_mi;
    }
    if (route.eta_hours != null) {
      totalEtaHours = (totalEtaHours || 0) + route.eta_hours;
    }
  }

  // ── Waypoints ─────────────────────────────────────────────
  const totalWaypoints = waypoints.length;
  // Consider a waypoint "visited" if it has an occurred_at timestamp
  const visitedCount = waypoints.filter(w => w.occurred_at != null).length;
  const byKind: Record<string, number> = {};
  for (const wp of waypoints) {
    const k = wp.kind || 'waypoint';
    byKind[k] = (byKind[k] || 0) + 1;
  }

  // ── Readiness ─────────────────────────────────────────────
  const { score, breakdown } = computeReadiness(checklist);

  return {
    generated_at: nowStr,
    version: 1,

    duration: {
      start_at: startAt,
      end_at: endAt,
      total_hours: totalHours,
      total_days: totalDays,
      display: formatDuration(totalHours),
    },

    checklist: {
      total_items: totalItems,
      completed_items: completedItems,
      completion_pct: completionPct,
      by_priority: byPriority,
      by_category: byCategory,
    },

    field_logs: {
      total_entries: totalEntries,
      by_type: byType,
      first_entry_at: firstEntryAt,
      last_entry_at: lastEntryAt,
    },

    routes: {
      total_routes: totalRoutes,
      total_distance_mi: totalDistanceMi,
      total_eta_hours: totalEtaHours,
      route_names: routeNames,
    },

    waypoints: {
      total_waypoints: totalWaypoints,
      visited_count: visitedCount,
      by_kind: byKind,
    },

    readiness: {
      final_score: score,
      breakdown,
    },

    expedition: {
      title: expedition.title,
      terrain: expedition.terrain,
      planned_duration_days: expedition.duration_days,
      distance_from_services_mi: expedition.distance_from_services_mi,
    },
  };
}

// ── Extract summary from expedition meta ────────────────────
export function getCompletionSummary(expedition: EcsExpedition): CompletionSummary | null {
  if (!expedition.meta) return null;
  const summary = expedition.meta.completion_summary;
  if (!summary || typeof summary !== 'object') return null;
  return summary as CompletionSummary;
}

