/**
 * Expedition Live Log Screen
 *
 * Phase 1 implementation — no-scroll layout with three fixed sections:
 *
 * TOP:    Expedition title + status pill + stat chips (Fuel/Water/Power)
 * MIDDLE: Event capture panel (type buttons, severity, input, add)
 * BOTTOM: Timeline list with filter chips (scrollable within container)
 *
 * Data Sources:
 * - DS_ExpeditionEvents_Latest10: unfiltered, limit 10
 * - DS_ExpeditionEvents_Filtered10: filtered by event_type, limit 10
 * - ACT_InsertExpeditionEvent: insert via expeditionEventStore
 *
 * Guardrails:
 * - Refresh only on successful insert or tab focus (not on keystroke)
 * - No optimistic UI issues — insert then refresh
 * - List limited to 10 items via SQL/store limit
 */
import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Platform,
  ActivityIndicator,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { SafeIcon as Ionicons } from '../components/SafeIcon';

import { TACTICAL } from '../lib/theme';
import { useApp } from '../context/AppContext';
import TopoBackground from '../components/TopoBackground';
import { expeditionStore } from '../lib/expeditionCommandStore';
import type { EcsExpedition } from '../lib/expeditionTypes';
import {
  expeditionEventStore,
  type EventType,
  type EventSeverity,
  type ExpeditionEvent,
} from '../lib/expeditionEventStore';

import EventCapturePanel from '../components/livelog/EventCapturePanel';
import EventTimeline from '../components/livelog/EventTimeline';

// ── Constants ────────────────────────────────────────────────
const EVENT_LIMIT = 10;

type FilterType = EventType | 'ALL';

// ── Stat chip data (placeholder for Phase 1) ────────────────
interface StatChip {
  label: string;
  value: string;
  icon: string;
  color: string;
}

export default function ExpeditionLiveLogScreen() {
  const mountedRef = useRef(true);
  useEffect(() => { return () => { mountedRef.current = false; }; }, []);

  const router = useRouter();
  const { user, isOnline, showToast } = useApp();
  const params = useLocalSearchParams<{ id?: string }>();
  const expeditionId = params.id || '';

  // ── Expedition data ────────────────────────────────────────
  const [loading, setLoading] = useState(true);
  const [expedition, setExpedition] = useState<EcsExpedition | null>(null);

  // ── UI State (per spec) ────────────────────────────────────
  const [filterType, setFilterType] = useState<FilterType>('ALL');
  const [selectedEventType, setSelectedEventType] = useState<EventType>('NOTE');
  const [selectedSeverity, setSelectedSeverity] = useState<EventSeverity>('LOW');
  const [detailsText, setDetailsText] = useState('');

  // ── Event data ─────────────────────────────────────────────
  const [events, setEvents] = useState<ExpeditionEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // ── Subscribe to store changes ─────────────────────────────
  useEffect(() => {
    const unsub = expeditionEventStore.subscribe(() => {
      if (!mountedRef.current || !expeditionId) return;
      // Re-read events from store when it changes
      const all = expeditionEventStore.getFilteredEvents(expeditionId, filterType);
      setEvents(all.slice(0, EVENT_LIMIT));
    });
    return unsub;
  }, [expeditionId, filterType]);

  // ── Fetch expedition ───────────────────────────────────────
  const fetchExpedition = useCallback(async () => {
    if (!expeditionId) return;
    try {
      const exp = await expeditionStore.getById(expeditionId);
      if (mountedRef.current) setExpedition(exp);
    } catch (err) {
      console.warn('[LiveLog] fetchExpedition error:', err);
    }
  }, [expeditionId]);

  // ── Load events from server (DS_ExpeditionEvents) ──────────
  const loadEvents = useCallback(async () => {
    if (!expeditionId) return;
    if (mountedRef.current) setEventsLoading(true);
    try {
      const loaded = await expeditionEventStore.loadEvents(expeditionId, {
        event_type: filterType === 'ALL' ? 'ALL' : filterType,
        limit: EVENT_LIMIT,
      });
      if (mountedRef.current) {
        // Apply local filter just in case
        const filtered = filterType === 'ALL'
          ? loaded
          : loaded.filter(e => e.event_type === filterType);
        setEvents(filtered.slice(0, EVENT_LIMIT));
      }
    } catch (err) {
      console.warn('[LiveLog] loadEvents error:', err);
      // Fall back to cached events
      if (mountedRef.current) {
        const cached = expeditionEventStore.getFilteredEvents(expeditionId, filterType);
        setEvents(cached.slice(0, EVENT_LIMIT));
      }
    }
    if (mountedRef.current) setEventsLoading(false);
  }, [expeditionId, filterType]);

  // ── Initial load ───────────────────────────────────────────
  const initialLoad = useCallback(async () => {
    if (mountedRef.current) setLoading(true);
    await fetchExpedition();
    await loadEvents();
    if (mountedRef.current) setLoading(false);
  }, [fetchExpedition, loadEvents]);

  // Refresh on tab focus
  useFocusEffect(useCallback(() => {
    initialLoad();
  }, [initialLoad]));

  // Re-load events when filter changes
  useEffect(() => {
    if (!loading && expeditionId) {
      loadEvents();
    }
  }, [filterType]);

  // ── ACT_InsertExpeditionEvent ──────────────────────────────
  const handleAddEvent = useCallback(async () => {
    if (!expeditionId || !user || isSaving) return;
    if (!detailsText.trim()) return;

    setIsSaving(true);
    try {
      await expeditionEventStore.createEvent(
        {
          expedition_id: expeditionId,
          created_by: user.id,
          event_type: selectedEventType,
          severity: selectedSeverity,
          details: detailsText.trim(),
          title: null,
          lat: null,
          lon: null,
          attachments: [],
        },
        (failMsg) => {
          // onFail callback — event saved locally but sync failed
          if (mountedRef.current) {
            showToast(failMsg || "Couldn't save event");
          }
        },
      );

      // Success: clear input and refresh
      if (mountedRef.current) {
        setDetailsText('');
        showToast('Saved');
        // Refresh events list
        await loadEvents();
      }
    } catch (err: any) {
      console.warn('[LiveLog] handleAddEvent error:', err);
      if (mountedRef.current) {
        showToast("Couldn't save event");
        // Do NOT clear input on failure
      }
    }
    if (mountedRef.current) setIsSaving(false);
  }, [expeditionId, user, selectedEventType, selectedSeverity, detailsText, isSaving, showToast, loadEvents]);

  // ── Stat chips (placeholder for Phase 1) ───────────────────
  const statChips: StatChip[] = useMemo(() => [
    { label: 'FUEL', value: '--', icon: 'flame-outline', color: '#FF9500' },
    { label: 'WATER', value: '--', icon: 'water-outline', color: '#42A5F5' },
    { label: 'POWER', value: '--', icon: 'flash-outline', color: '#66BB6A' },
  ], []);

  // ── Total event count ──────────────────────────────────────
  const totalCount = useMemo(() => {
    return expeditionEventStore.getEvents(expeditionId).length;
  }, [expeditionId, events]);

  // ── Derived state ──────────────────────────────────────────
  const isClosed = expedition?.status === 'completed' || expedition?.status === 'archived';
  const isActive = expedition?.status === 'active';

  // ── Loading state ──────────────────────────────────────────
  if (loading) {
    return (
      <TopoBackground>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={TACTICAL.accent} />
          <Text style={styles.loadingText}>LOADING LIVE LOG...</Text>
        </View>
      </TopoBackground>
    );
  }

  if (!expedition) {
    return (
      <TopoBackground>
        <View style={styles.center}>
          <Ionicons name="alert-circle-outline" size={48} color={TACTICAL.danger} />
          <Text style={styles.errorText}>EXPEDITION NOT FOUND</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={() => router.back()}>
            <Text style={styles.retryBtnText}>GO BACK</Text>
          </TouchableOpacity>
        </View>
      </TopoBackground>
    );
  }

  return (
    <TopoBackground>
      <View style={styles.container}>
        {/* ═══════════════════════════════════════════════════
            TOP SECTION: Header + Status + Stat Chips
            ═══════════════════════════════════════════════════ */}
        <View style={styles.topSection}>
          {/* Header row */}
          <View style={styles.header}>
            <TouchableOpacity
              onPress={() => router.back()}
              style={styles.backBtn}
              activeOpacity={0.7}
            >
              <Ionicons name="arrow-back" size={20} color={TACTICAL.text} />
            </TouchableOpacity>

            <View style={styles.headerCenter}>
              <Text style={styles.headerBrand}>LIVE LOG</Text>
              <Text style={styles.headerTitle} numberOfLines={1}>
                {expedition.title || 'Expedition'}
              </Text>
            </View>

            <View style={styles.headerRight}>
              <View
                style={[
                  styles.statusPill,
                  {
                    borderColor: isActive ? '#4CAF50' : isClosed ? TACTICAL.textMuted : TACTICAL.amber,
                    backgroundColor: isActive
                      ? 'rgba(76,175,80,0.10)'
                      : isClosed
                        ? 'rgba(138,138,133,0.08)'
                        : 'rgba(196,138,44,0.10)',
                  },
                ]}
              >
                <View
                  style={[
                    styles.statusDot,
                    {
                      backgroundColor: isActive ? '#4CAF50' : isClosed ? TACTICAL.textMuted : TACTICAL.amber,
                    },
                  ]}
                />
                <Text
                  style={[
                    styles.statusText,
                    {
                      color: isActive ? '#4CAF50' : isClosed ? TACTICAL.textMuted : TACTICAL.amber,
                    },
                  ]}
                >
                  {expedition.status.toUpperCase()}
                </Text>
              </View>
            </View>
          </View>

          {/* Stat chips */}
          <View style={styles.statRow}>
            {statChips.map((chip) => (
              <View key={chip.label} style={styles.statChip}>
                <Ionicons name={chip.icon as any} size={12} color={chip.color} />
                <Text style={[styles.statValue, { color: chip.color }]}>{chip.value}</Text>
                <Text style={styles.statLabel}>{chip.label}</Text>
              </View>
            ))}

            {/* Online/Offline indicator */}
            <View style={styles.statChip}>
              <View
                style={[
                  styles.onlineDot,
                  { backgroundColor: isOnline ? '#4CAF50' : '#E53935' },
                ]}
              />
              <Text
                style={[
                  styles.statValue,
                  { color: isOnline ? '#4CAF50' : '#E53935', fontSize: 10 },
                ]}
              >
                {isOnline ? 'ONLINE' : 'OFFLINE'}
              </Text>
            </View>
          </View>
        </View>

        {/* ═══════════════════════════════════════════════════
            MIDDLE SECTION: Event Capture Panel
            ═══════════════════════════════════════════════════ */}
        {!isClosed && (
          <EventCapturePanel
            selectedEventType={selectedEventType}
            selectedSeverity={selectedSeverity}
            detailsText={detailsText}
            isSaving={isSaving}
            isDisabled={isClosed || false}
            onTypeChange={setSelectedEventType}
            onSeverityChange={setSelectedSeverity}
            onDetailsChange={setDetailsText}
            onSubmit={handleAddEvent}
          />
        )}

        {/* Closed banner */}
        {isClosed && (
          <View style={styles.closedBanner}>
            <Ionicons name="lock-closed-outline" size={13} color={TACTICAL.textMuted} />
            <Text style={styles.closedBannerText}>
              EXPEDITION {expedition.status.toUpperCase()} — READ ONLY
            </Text>
          </View>
        )}

        {/* ═══════════════════════════════════════════════════
            BOTTOM SECTION: Event Timeline
            ═══════════════════════════════════════════════════ */}
        <EventTimeline
          events={events}
          filterType={filterType}
          onFilterChange={setFilterType}
          loading={eventsLoading}
          totalCount={totalCount}
        />
      </View>
    </TopoBackground>
  );
}

// ── Styles ───────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1,
  },

  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    padding: 24,
  },
  loadingText: {
    fontSize: 11,
    fontWeight: '700',
    color: TACTICAL.textMuted,
    letterSpacing: 2,
  },
  errorText: {
    fontSize: 14,
    fontWeight: '800',
    color: TACTICAL.danger,
    letterSpacing: 0.5,
  },
  retryBtn: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: TACTICAL.accent,
    borderRadius: 10,
    marginTop: 8,
  },
  retryBtnText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#0B0F12',
    letterSpacing: 1,
  },

  // ── Top Section ────────────────────────────────────────────
  topSection: {
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(62, 79, 60, 0.15)',
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'web' ? 16 : 54,
    paddingBottom: 8,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.18)',
    borderWidth: 1,
    borderColor: TACTICAL.border,
  },
  headerCenter: { flex: 1 },
  headerBrand: {
    fontSize: 9,
    fontWeight: '600',
    color: TACTICAL.amber,
    letterSpacing: 2.5,
  },
  headerTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: TACTICAL.text,
    letterSpacing: 0.3,
    marginTop: 1,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  // Status pill
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusText: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1,
  },

  // Stat chips
  statRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 4,
  },
  statChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 7,
    backgroundColor: 'rgba(0,0,0,0.12)',
    borderWidth: 1,
    borderColor: TACTICAL.border,
  },
  statValue: {
    fontSize: 11,
    fontWeight: '800',
    fontFamily: 'Courier',
    letterSpacing: 0.5,
  },
  statLabel: {
    fontSize: 8,
    fontWeight: '700',
    color: TACTICAL.textMuted,
    letterSpacing: 1,
  },
  onlineDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },

  // Closed banner
  closedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginHorizontal: 16,
    marginVertical: 8,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: 'rgba(138, 138, 133, 0.06)',
    borderWidth: 1,
    borderColor: 'rgba(138, 138, 133, 0.15)',
  },
  closedBannerText: {
    fontSize: 10,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    letterSpacing: 2,
  },
});




