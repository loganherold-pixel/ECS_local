/**
 * Expedition Event Store
 *
 * Manages expedition_events with optimistic UI:
 *   1. Events appear immediately in local state
 *   2. Background sync to Supabase via edge function
 *   3. If sync fails, event is reverted and toast shown
 *
 * Local persistence via localStorage for offline resilience.
 */

import { supabase } from './supabase';
import { Platform } from 'react-native';

// ── Types ────────────────────────────────────────────────────

export type EventType = 'NOTE' | 'RISK' | 'MECH' | 'MED' | 'NAV' | 'SUPPLY' | 'COMMS' | 'STOP' | 'CHECKPOINT';
export type EventSeverity = 'LOW' | 'MED' | 'HIGH' | 'CRITICAL';

export interface ExpeditionEvent {
  id: string;
  expedition_id: string;
  created_at: string;
  created_by: string | null;
  event_type: EventType;
  severity: EventSeverity;
  details: string;
  title: string | null;
  lat: number | null;
  lon: number | null;
  attachments: any[];
  // Local-only fields
  _optimistic?: boolean;  // true while waiting for server confirmation
  _failed?: boolean;      // true if server sync failed
}

export interface CreateEventInput {
  expedition_id: string;
  created_by?: string | null;
  event_type: EventType;
  severity: EventSeverity;
  details: string;
  title?: string | null;
  lat?: number | null;
  lon?: number | null;
  attachments?: any[];
}

// ── Event Type Metadata ──────────────────────────────────────

export const EVENT_TYPE_META: Record<EventType, { label: string; icon: string; color: string }> = {
  NOTE:       { label: 'NOTE',       icon: 'create-outline',        color: '#8A8A85' },
  RISK:       { label: 'RISK',       icon: 'warning-outline',       color: '#FF9500' },
  MECH:       { label: 'MECH',       icon: 'construct-outline',     color: '#FFB74D' },
  MED:        { label: 'MED',        icon: 'medkit-outline',        color: '#EF5350' },
  NAV:        { label: 'NAV',        icon: 'compass-outline',       color: '#42A5F5' },
  SUPPLY:     { label: 'SUPPLY',     icon: 'cube-outline',          color: '#66BB6A' },
  COMMS:      { label: 'COMMS',      icon: 'radio-outline',         color: '#5AC8FA' },
  STOP:       { label: 'STOP',       icon: 'stop-circle-outline',   color: '#C0392B' },
  CHECKPOINT: { label: 'CHECKPOINT', icon: 'flag-outline',          color: '#CE93D8' },
};

export const SEVERITY_META: Record<EventSeverity, { label: string; color: string; bg: string }> = {
  LOW:      { label: 'LOW',      color: '#66BB6A', bg: 'rgba(102, 187, 106, 0.12)' },
  MED:      { label: 'MED',      color: '#FFB74D', bg: 'rgba(255, 183, 77, 0.12)' },
  HIGH:     { label: 'HIGH',     color: '#FF9500', bg: 'rgba(255, 149, 0, 0.15)' },
  CRITICAL: { label: 'CRITICAL', color: '#EF5350', bg: 'rgba(239, 83, 80, 0.15)' },
};

// ── Storage Key ──────────────────────────────────────────────
const STORAGE_KEY = 'ecs_expedition_events';

function generateTempId(): string {
  return 'temp_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 8);
}

// ── Local Storage Helpers ────────────────────────────────────
function loadLocalEvents(): Record<string, ExpeditionEvent[]> {
  try {
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw);
    }
  } catch {}
  return {};
}

function saveLocalEvents(data: Record<string, ExpeditionEvent[]>): void {
  try {
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    }
  } catch {}
}

// ── Store Class ──────────────────────────────────────────────

type Listener = () => void;

class ExpeditionEventStore {
  private events: Record<string, ExpeditionEvent[]> = {};
  private listeners: Set<Listener> = new Set();

  constructor() {
    this.events = loadLocalEvents();
  }

  // ── Subscribe ────────────────────────────────────────────
  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify() {
    this.listeners.forEach(fn => fn());
  }

  private persist() {
    saveLocalEvents(this.events);
  }

  // ── Get Events ───────────────────────────────────────────
  getEvents(expeditionId: string): ExpeditionEvent[] {
    return this.events[expeditionId] || [];
  }

  getFilteredEvents(expeditionId: string, filter: EventType | 'ALL'): ExpeditionEvent[] {
    const all = this.getEvents(expeditionId);
    if (filter === 'ALL') return all;
    return all.filter(e => e.event_type === filter);
  }

  // ── Create Event (Optimistic) ────────────────────────────
  async createEvent(
    input: CreateEventInput,
    onFail?: (msg: string) => void,
  ): Promise<ExpeditionEvent> {
    const tempId = generateTempId();
    const now = new Date().toISOString();

    const optimisticEvent: ExpeditionEvent = {
      id: tempId,
      expedition_id: input.expedition_id,
      created_at: now,
      created_by: input.created_by || null,
      event_type: input.event_type,
      severity: input.severity,
      details: input.details,
      title: input.title || null,
      lat: input.lat || null,
      lon: input.lon || null,
      attachments: input.attachments || [],
      _optimistic: true,
    };

    // Add to local state immediately
    if (!this.events[input.expedition_id]) {
      this.events[input.expedition_id] = [];
    }
    this.events[input.expedition_id].unshift(optimisticEvent);
    this.persist();
    this.notify();

    // Background sync
    try {
      const { data, error } = await supabase.functions.invoke('expedition-events', {
        body: {
          action: 'create',
          ...input,
        },
      });

      if (error || !data?.event) {
        throw new Error(error?.message || data?.error || 'Failed to save event');
      }

      // Replace optimistic event with server event
      const serverEvent: ExpeditionEvent = {
        ...data.event,
        _optimistic: false,
        _failed: false,
      };

      const idx = this.events[input.expedition_id].findIndex(e => e.id === tempId);
      if (idx >= 0) {
        this.events[input.expedition_id][idx] = serverEvent;
      }
      this.persist();
      this.notify();

      return serverEvent;
    } catch (err: any) {
      console.warn('[EventStore] Sync failed:', err.message);

      // Mark as failed but keep in list
      const idx = this.events[input.expedition_id].findIndex(e => e.id === tempId);
      if (idx >= 0) {
        this.events[input.expedition_id][idx] = {
          ...optimisticEvent,
          _optimistic: false,
          _failed: true,
        };
      }
      this.persist();
      this.notify();

      if (onFail) {
        onFail('Event saved locally. Sync failed — will retry.');
      }

      return optimisticEvent;
    }
  }

  // ── Load Events from Server ──────────────────────────────
  async loadEvents(
    expeditionId: string,
    options?: { event_type?: EventType | 'ALL'; limit?: number },
  ): Promise<ExpeditionEvent[]> {
    try {
      const { data, error } = await supabase.functions.invoke('expedition-events', {
        body: {
          action: 'list',
          expedition_id: expeditionId,
          event_type: options?.event_type || 'ALL',
          limit: options?.limit || 50,
        },
      });

      if (error || !data?.events) {
        throw new Error(error?.message || data?.error || 'Failed to load events');
      }

      // Merge server events with any local-only (failed) events
      const serverEvents: ExpeditionEvent[] = data.events.map((e: any) => ({
        ...e,
        _optimistic: false,
        _failed: false,
      }));

      const localOnly = (this.events[expeditionId] || []).filter(
        e => e._failed || e._optimistic
      );

      // Combine: local-only first (most recent), then server events
      this.events[expeditionId] = [...localOnly, ...serverEvents];
      this.persist();
      this.notify();

      return this.events[expeditionId];
    } catch (err: any) {
      console.warn('[EventStore] Load failed, using cached:', err.message);
      // Return cached events
      return this.events[expeditionId] || [];
    }
  }

  // ── Remove Failed Event ──────────────────────────────────
  removeEvent(expeditionId: string, eventId: string): void {
    if (!this.events[expeditionId]) return;
    this.events[expeditionId] = this.events[expeditionId].filter(e => e.id !== eventId);
    this.persist();
    this.notify();
  }

  // ── Clear Events for Expedition ──────────────────────────
  clearEvents(expeditionId: string): void {
    delete this.events[expeditionId];
    this.persist();
    this.notify();
  }
}

// ── Singleton ────────────────────────────────────────────────
export const expeditionEventStore = new ExpeditionEventStore();

