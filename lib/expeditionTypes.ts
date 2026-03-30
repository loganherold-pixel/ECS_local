// ============================================================
// ECS EXPEDITION COMMAND SYSTEM — TYPE DEFINITIONS
// ============================================================

export type EcsExpeditionStatus = 'draft' | 'active' | 'completed' | 'archived';
export type EcsTerrain = 'mountain' | 'desert' | 'forest' | 'snow' | 'mixed' | 'coastal';
export type EcsWaypointKind = 'waypoint' | 'camp' | 'fuel' | 'water' | 'hazard' | 'note' | 'incident';
export type EcsFieldLogType = 'note' | 'marker' | 'incident' | 'resource' | 'maintenance' | 'comms' | 'medical';
export type EcsChecklistPriority = 'low' | 'normal' | 'high' | 'critical';

export interface EcsExpedition {
  id: string;
  user_id: string;
  vehicle_id: string | null;
  loadout_snapshot_id: string | null;
  title: string;
  status: EcsExpeditionStatus;
  terrain: string | null;
  duration_days: number | null;
  distance_from_services_mi: number | null;
  start_at: string | null;
  end_at: string | null;
  readiness_score: number | null;
  readiness_breakdown: Record<string, any> | null;
  meta: Record<string, any> | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  version: number;
}


export interface EcsLoadoutSnapshot {
  id: string;
  user_id: string;
  vehicle_id: string | null;
  expedition_id: string | null;
  label: string | null;
  snapshot: Record<string, any>;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  version: number;
}

export interface EcsRoute {
  id: string;
  user_id: string;
  expedition_id: string | null;
  name: string;
  source: string | null;
  gpx: string | null;
  geojson: Record<string, any> | null;
  distance_mi: number | null;
  eta_hours: number | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  version: number;
}

export interface EcsWaypoint {
  id: string;
  user_id: string;
  expedition_id: string | null;
  route_id: string | null;
  title: string | null;
  kind: EcsWaypointKind;
  lat: number | null;
  lng: number | null;
  occurred_at: string | null;
  meta: Record<string, any> | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  version: number;
}

export interface EcsChecklistTemplate {
  id: string;
  owner_user_id: string | null;
  name: string;
  rules: Record<string, any>;
  items: Array<{ title: string; priority: EcsChecklistPriority; category?: string }>;
  created_at: string;
  updated_at: string;
}

export interface EcsChecklistItem {
  id: string;
  user_id: string;
  expedition_id: string | null;
  category: string | null;
  title: string;
  priority: EcsChecklistPriority;
  is_done: boolean;
  done_at: string | null;
  source_template_id: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  version: number;
}

export interface EcsFieldLog {
  id: string;
  user_id: string;
  expedition_id: string | null;
  type: EcsFieldLogType;
  title: string | null;
  body: string | null;
  lat: number | null;
  lng: number | null;
  occurred_at: string;
  meta: Record<string, any> | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  version: number;
}
// ── Wizard state ────────────────────────────────────────────
export interface ExpeditionWizardState {
  title: string;
  vehicleId: string | null;
  vehicleName: string | null;
  terrain: EcsTerrain | null;
  durationDays: number | null;
  distanceFromServicesMi: number | null;
  notes: string;
  captureSnapshot: boolean;
  /** Phase 6A: Detailed terrain profile for risk-aware scoring */
  terrainProfile?: Record<string, string> | null;
}


// ── Readiness calculation ───────────────────────────────────
export function computeReadiness(items: EcsChecklistItem[]): { score: number; breakdown: Record<string, number> } {
  if (items.length === 0) return { score: 100, breakdown: {} };

  const weights: Record<EcsChecklistPriority, number> = {
    critical: 4,
    high: 2,
    normal: 1,
    low: 0.5,
  };

  let totalWeight = 0;
  let doneWeight = 0;
  const categoryScores: Record<string, { total: number; done: number }> = {};

  for (const item of items) {
    const w = weights[item.priority] || 1;
    totalWeight += w;
    if (item.is_done) doneWeight += w;

    const cat = item.category || 'general';
    if (!categoryScores[cat]) categoryScores[cat] = { total: 0, done: 0 };
    categoryScores[cat].total += w;
    if (item.is_done) categoryScores[cat].done += w;
  }

  const score = totalWeight > 0 ? Math.round((doneWeight / totalWeight) * 100) : 100;
  const breakdown: Record<string, number> = {};
  for (const [cat, data] of Object.entries(categoryScores)) {
    breakdown[cat] = data.total > 0 ? Math.round((data.done / data.total) * 100) : 100;
  }

  return { score, breakdown };
}

// ── Terrain display helpers ─────────────────────────────────
export const TERRAIN_OPTIONS: { value: EcsTerrain; label: string; icon: string; color: string }[] = [
  { value: 'mountain', label: 'MOUNTAIN', icon: 'triangle-outline', color: '#78909C' },
  { value: 'desert', label: 'DESERT', icon: 'sunny-outline', color: '#FFB74D' },
  { value: 'forest', label: 'FOREST', icon: 'leaf-outline', color: '#66BB6A' },
  { value: 'snow', label: 'SNOW', icon: 'snow-outline', color: '#81D4FA' },
  { value: 'mixed', label: 'MIXED', icon: 'layers-outline', color: '#CE93D8' },
  { value: 'coastal', label: 'COASTAL', icon: 'water-outline', color: '#4FC3F7' },
];

export const WAYPOINT_KIND_META: Record<EcsWaypointKind, { label: string; icon: string; color: string }> = {
  waypoint: { label: 'WAYPOINT', icon: 'location-outline', color: '#8A8A85' },
  camp: { label: 'CAMP', icon: 'bonfire-outline', color: '#FFB74D' },
  fuel: { label: 'FUEL', icon: 'flame-outline', color: '#EF5350' },
  water: { label: 'WATER', icon: 'water-outline', color: '#4FC3F7' },
  hazard: { label: 'HAZARD', icon: 'warning-outline', color: '#FF7043' },
  note: { label: 'NOTE', icon: 'document-text-outline', color: '#CE93D8' },
  incident: { label: 'INCIDENT', icon: 'alert-circle-outline', color: '#E53935' },
};

export const FIELD_LOG_TYPE_META: Record<EcsFieldLogType, { label: string; icon: string; color: string }> = {
  note: { label: 'NOTE', icon: 'create-outline', color: '#8A8A85' },
  marker: { label: 'MARKER', icon: 'pin-outline', color: '#4FC3F7' },
  incident: { label: 'INCIDENT', icon: 'alert-circle-outline', color: '#E53935' },
  resource: { label: 'RESOURCE', icon: 'cube-outline', color: '#66BB6A' },
  maintenance: { label: 'MAINTENANCE', icon: 'construct-outline', color: '#FFB74D' },
  comms: { label: 'COMMS', icon: 'radio-outline', color: '#42A5F5' },
  medical: { label: 'MEDICAL', icon: 'medkit-outline', color: '#EF5350' },
};

