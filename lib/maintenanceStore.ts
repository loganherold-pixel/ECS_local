/**
 * Maintenance Store
 * 
 * Handles CRUD for maintenance_logs and inspection_checklists
 * with Supabase backend and offline queue fallback.
 */
import { Platform } from 'react-native';
import { supabase } from './supabase';
import { offlineQueue } from './offlineQueue';
import { connectivity } from './connectivity';
import type {
  MaintenanceLog,
  MaintenanceLogInsert,
  InspectionChecklist,
  InspectionItem,
  ServiceReminder,
  MaintenanceEventType,
} from '../components/vehicle-health/MaintenanceTypes';
import { EVENT_TYPE_META } from '../components/vehicle-health/MaintenanceTypes';

const CACHE_KEY_LOGS = 'ecs_maintenance_logs';
const CACHE_KEY_INSPECTIONS = 'ecs_inspections';

// ── Local cache helpers ─────────────────────────────────────

function getCachedLogs(vehicleId: string): MaintenanceLog[] {
  try {
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(`${CACHE_KEY_LOGS}_${vehicleId}`);
      return raw ? JSON.parse(raw) : [];
    }
  } catch {}
  return [];
}

function setCachedLogs(vehicleId: string, logs: MaintenanceLog[]): void {
  try {
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
      localStorage.setItem(`${CACHE_KEY_LOGS}_${vehicleId}`, JSON.stringify(logs));
    }
  } catch {}
}

function getCachedInspections(vehicleId: string): InspectionChecklist[] {
  try {
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(`${CACHE_KEY_INSPECTIONS}_${vehicleId}`);
      return raw ? JSON.parse(raw) : [];
    }
  } catch {}
  return [];
}

function setCachedInspections(vehicleId: string, inspections: InspectionChecklist[]): void {
  try {
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
      localStorage.setItem(`${CACHE_KEY_INSPECTIONS}_${vehicleId}`, JSON.stringify(inspections));
    }
  } catch {}
}

// ── Maintenance Logs ────────────────────────────────────────

export async function fetchMaintenanceLogs(vehicleId: string, userId: string): Promise<MaintenanceLog[]> {
  if (!connectivity.isOnline()) {
    return getCachedLogs(vehicleId);
  }

  try {
    const { data, error } = await supabase
      .from('maintenance_logs')
      .select('*')
      .eq('vehicle_id', vehicleId)
      .eq('owner_user_id', userId)
      .order('event_date', { ascending: false });

    if (error) throw error;
    const logs = (data || []) as MaintenanceLog[];
    setCachedLogs(vehicleId, logs);
    return logs;
  } catch (err) {
    console.warn('[MaintenanceStore] fetch logs failed, using cache:', err);
    return getCachedLogs(vehicleId);
  }
}

export async function createMaintenanceLog(log: MaintenanceLogInsert): Promise<MaintenanceLog | null> {
  if (!connectivity.isOnline()) {
    // Queue for later
    const tempId = `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const tempLog: MaintenanceLog = {
      ...log,
      id: tempId,
      description: log.description || null,
      mileage: log.mileage ?? null,
      cost_cents: log.cost_cents ?? 0,
      shop_name: log.shop_name || null,
      parts_used: log.parts_used || null,
      next_due_mileage: log.next_due_mileage ?? null,
      next_due_date: log.next_due_date || null,
      interval_miles: log.interval_miles ?? null,
      interval_days: log.interval_days ?? null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    // Add to local cache
    const cached = getCachedLogs(log.vehicle_id);
    cached.unshift(tempLog);
    setCachedLogs(log.vehicle_id, cached);

    // Queue for sync
    offlineQueue.enqueue('edge_function', {
      action: 'create_maintenance_log',
      data: log,
    }, 'normal');

    return tempLog;
  }

  try {
    const { data, error } = await supabase
      .from('maintenance_logs')
      .insert(log)
      .select()
      .single();

    if (error) throw error;
    const newLog = data as MaintenanceLog;

    // Update cache
    const cached = getCachedLogs(log.vehicle_id);
    cached.unshift(newLog);
    setCachedLogs(log.vehicle_id, cached);

    return newLog;
  } catch (err) {
    console.error('[MaintenanceStore] create log failed:', err);
    return null;
  }
}

export async function deleteMaintenanceLog(logId: string, vehicleId: string): Promise<boolean> {
  if (!connectivity.isOnline()) {
    // Remove from cache
    const cached = getCachedLogs(vehicleId);
    setCachedLogs(vehicleId, cached.filter(l => l.id !== logId));
    offlineQueue.enqueue('edge_function', { action: 'delete_maintenance_log', logId }, 'normal');
    return true;
  }

  try {
    const { error } = await supabase
      .from('maintenance_logs')
      .delete()
      .eq('id', logId);

    if (error) throw error;

    const cached = getCachedLogs(vehicleId);
    setCachedLogs(vehicleId, cached.filter(l => l.id !== logId));
    return true;
  } catch (err) {
    console.error('[MaintenanceStore] delete log failed:', err);
    return false;
  }
}

// ── Inspection Checklists ───────────────────────────────────

/**
 * Normalize items from the database — they may arrive as a JSON string
 * (if stored via JSON.stringify) or as a parsed array (PostgREST auto-parses jsonb).
 */
function normalizeInspectionItems(items: any): InspectionItem[] {
  if (!items) return [];
  if (typeof items === 'string') {
    try { return JSON.parse(items); } catch { return []; }
  }
  if (Array.isArray(items)) return items;
  return [];
}

function normalizeInspection(raw: any): InspectionChecklist {
  return {
    ...raw,
    items: normalizeInspectionItems(raw.items),
  };
}

export async function fetchInspections(vehicleId: string, userId: string): Promise<InspectionChecklist[]> {
  if (!connectivity.isOnline()) {
    return getCachedInspections(vehicleId).map(normalizeInspection);
  }

  try {
    const { data, error } = await supabase
      .from('inspection_checklists')
      .select('*')
      .eq('vehicle_id', vehicleId)
      .eq('owner_user_id', userId)
      .order('inspection_date', { ascending: false });

    if (error) throw error;
    const inspections = (data || []).map(normalizeInspection);
    setCachedInspections(vehicleId, inspections);
    return inspections;
  } catch (err) {
    console.warn('[MaintenanceStore] fetch inspections failed, using cache:', err);
    return getCachedInspections(vehicleId).map(normalizeInspection);
  }
}

export async function saveInspection(inspection: Partial<InspectionChecklist> & { vehicle_id: string; owner_user_id: string; items: InspectionItem[] }): Promise<InspectionChecklist | null> {
  // Build the DB payload with items stringified for the jsonb column.
  // PostgREST can misinterpret nested arrays of objects; sending a JSON string
  // ensures PostgreSQL parses it correctly into jsonb.
  const dbPayload = {
    vehicle_id: inspection.vehicle_id,
    owner_user_id: inspection.owner_user_id,
    expedition_id: inspection.expedition_id || null,
    inspection_date: inspection.inspection_date || new Date().toISOString(),
    overall_status: inspection.overall_status || 'pending',
    mileage: inspection.mileage ?? null,
    notes: inspection.notes || null,
    items: JSON.stringify(inspection.items),
    completed_at: inspection.completed_at || null,
  };

  if (!connectivity.isOnline()) {
    const tempId = inspection.id || `temp_insp_${Date.now()}`;
    const tempInsp: InspectionChecklist = {
      vehicle_id: inspection.vehicle_id,
      owner_user_id: inspection.owner_user_id,
      expedition_id: inspection.expedition_id || null,
      inspection_date: inspection.inspection_date || new Date().toISOString(),
      overall_status: (inspection.overall_status || 'pending') as any,
      mileage: inspection.mileage ?? null,
      notes: inspection.notes || null,
      items: inspection.items, // keep as array for local use
      completed_at: inspection.completed_at || null,
      id: tempId,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const cached = getCachedInspections(inspection.vehicle_id);
    const idx = cached.findIndex(c => c.id === tempId);
    if (idx >= 0) cached[idx] = tempInsp;
    else cached.unshift(tempInsp);
    setCachedInspections(inspection.vehicle_id, cached);

    offlineQueue.enqueue('edge_function', { action: 'save_inspection', data: dbPayload }, 'normal');
    return tempInsp;
  }

  try {
    if (inspection.id && !inspection.id.startsWith('temp_')) {
      // Update existing
      const { data, error } = await supabase
        .from('inspection_checklists')
        .update({ ...dbPayload, updated_at: new Date().toISOString() })
        .eq('id', inspection.id)
        .select()
        .single();

      if (error) throw error;
      const updated = normalizeInspection(data);

      const cached = getCachedInspections(inspection.vehicle_id);
      const idx = cached.findIndex(c => c.id === updated.id);
      if (idx >= 0) cached[idx] = updated;
      else cached.unshift(updated);
      setCachedInspections(inspection.vehicle_id, cached);

      return updated;
    } else {
      // Insert new
      const { data, error } = await supabase
        .from('inspection_checklists')
        .insert(dbPayload)
        .select()
        .single();

      if (error) throw error;
      const newInsp = normalizeInspection(data);

      const cached = getCachedInspections(inspection.vehicle_id);
      cached.unshift(newInsp);
      setCachedInspections(inspection.vehicle_id, cached);

      return newInsp;
    }
  } catch (err) {
    console.error('[MaintenanceStore] save inspection failed:', err);
    return null;
  }
}


// ── Service Reminders ───────────────────────────────────────

export function computeServiceReminders(logs: MaintenanceLog[], currentMileage: number | null): ServiceReminder[] {
  const now = new Date();
  const reminders: ServiceReminder[] = [];

  // Group logs by event type, get most recent for each
  const latestByType = new Map<MaintenanceEventType, MaintenanceLog>();
  for (const log of logs) {
    const existing = latestByType.get(log.event_type as MaintenanceEventType);
    if (!existing || new Date(log.event_date) > new Date(existing.event_date)) {
      latestByType.set(log.event_type as MaintenanceEventType, log);
    }
  }

  // Check each maintenance type
  const typesToCheck: MaintenanceEventType[] = [
    'oil_change', 'tire_rotation', 'brake_inspection', 'air_filter',
    'transmission_fluid', 'coolant_flush', 'fuel_filter', 'cabin_filter',
    'wiper_blades', 'suspension_check', 'alignment',
  ];

  for (const eventType of typesToCheck) {
    const meta = EVENT_TYPE_META[eventType];
    const lastLog = latestByType.get(eventType);

    const intervalMiles = lastLog?.interval_miles ?? meta.defaultIntervalMiles;
    const intervalDays = lastLog?.interval_days ?? meta.defaultIntervalDays;

    let nextDueMileage: number | null = null;
    let nextDueDate: string | null = null;
    let isOverdue = false;
    let urgency: 'ok' | 'soon' | 'overdue' = 'ok';

    if (lastLog) {
      // Use explicit next-due if set
      if (lastLog.next_due_mileage) {
        nextDueMileage = lastLog.next_due_mileage;
      } else if (lastLog.mileage && intervalMiles) {
        nextDueMileage = lastLog.mileage + intervalMiles;
      }

      if (lastLog.next_due_date) {
        nextDueDate = lastLog.next_due_date;
      } else if (intervalDays) {
        const d = new Date(lastLog.event_date);
        d.setDate(d.getDate() + intervalDays);
        nextDueDate = d.toISOString();
      }
    } else {
      // No service record — mark as needing attention
      urgency = 'soon';
    }

    // Check overdue
    if (nextDueMileage && currentMileage && currentMileage >= nextDueMileage) {
      isOverdue = true;
      urgency = 'overdue';
    } else if (nextDueMileage && currentMileage && (nextDueMileage - currentMileage) < 1000) {
      urgency = 'soon';
    }

    if (nextDueDate && new Date(nextDueDate) <= now) {
      isOverdue = true;
      urgency = 'overdue';
    } else if (nextDueDate) {
      const daysUntil = (new Date(nextDueDate).getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
      if (daysUntil < 30 && urgency !== 'overdue') urgency = 'soon';
    }

    reminders.push({
      eventType,
      title: meta.label,
      lastServiceDate: lastLog?.event_date || null,
      lastServiceMileage: lastLog?.mileage || null,
      nextDueDate,
      nextDueMileage,
      intervalMiles,
      intervalDays,
      isOverdue,
      urgency,
    });
  }

  // Sort: overdue first, then soon, then ok
  const urgencyOrder = { overdue: 0, soon: 1, ok: 2 };
  reminders.sort((a, b) => urgencyOrder[a.urgency] - urgencyOrder[b.urgency]);

  return reminders;
}

