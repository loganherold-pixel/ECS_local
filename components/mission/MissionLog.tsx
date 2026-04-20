// ============================================================
// MISSION LOG — Event timeline + notes + checkpoints
// ============================================================
// Now integrates TelemetryStatChips at the top for live
// fuel/water/power monitoring with color-coded status.
// ============================================================
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ScrollView,
} from 'react-native';
import { SafeIcon as Ionicons } from '../SafeIcon';

import { TACTICAL } from '../../lib/theme';
import type { ExpeditionEvent, ExpeditionNote, ExpeditionCheckpoint } from '../../lib/missionTypes';
import { missionEventStore, missionNoteStore, missionCheckpointStore } from '../../lib/missionStore';
import TelemetryStatChips from './TelemetryStatChips';
import type { LiveTelemetryState } from '../../lib/telemetryPolling';

const EVENT_META: Record<string, { icon: string; color: string }> = {
  EXPEDITION_LAUNCHED: { icon: 'rocket-outline', color: '#4CAF50' },
  ITEM_USED: { icon: 'swap-horizontal-outline', color: TACTICAL.amber },
  ITEM_CONSUMED: { icon: 'flame-outline', color: '#FFB74D' },
  ITEM_LOST: { icon: 'close-circle-outline', color: '#E53935' },
  ITEM_DEPLOYED: { icon: 'arrow-forward-circle-outline', color: '#4FC3F7' },
  NOTE_ADDED: { icon: 'create-outline', color: TACTICAL.amber },
  CHECKPOINT: { icon: 'flag-outline', color: '#4FC3F7' },
  INCIDENT: { icon: 'alert-circle-outline', color: '#E53935' },
  WATER_USED: { icon: 'water-outline', color: '#4FC3F7' },
  FUEL_USED: { icon: 'flame-outline', color: '#FF7043' },
  FUEL_LOGGED: { icon: 'flame-outline', color: '#FF9500' },
  POWER_UPDATED: { icon: 'flash-outline', color: '#7C4DFF' },
  POWER_CONFIGURED: { icon: 'flash-outline', color: '#7C4DFF' },
  STATUS_CHANGED: { icon: 'sync-outline', color: TACTICAL.textMuted },
  MISSION_COMPLETED: { icon: 'checkmark-circle-outline', color: '#4CAF50' },
};

interface Props {
  expeditionId: string;
}

type LogTab = 'timeline' | 'notes' | 'checkpoints';

export default function MissionLog({ expeditionId }: Props) {
  const [tab, setTab] = useState<LogTab>('timeline');
  const [events, setEvents] = useState<ExpeditionEvent[]>([]);
  const [notes, setNotes] = useState<ExpeditionNote[]>([]);
  const [checkpoints, setCheckpoints] = useState<ExpeditionCheckpoint[]>([]);
  const [telemetryState, setTelemetryState] = useState<LiveTelemetryState | null>(null);

  useEffect(() => {
    setEvents(missionEventStore.getByExpeditionId(expeditionId));
    setNotes(missionNoteStore.getByExpeditionId(expeditionId));
    setCheckpoints(missionCheckpointStore.getByExpeditionId(expeditionId));
  }, [expeditionId]);

  const refreshData = useCallback(() => {
    setEvents(missionEventStore.getByExpeditionId(expeditionId));
    setNotes(missionNoteStore.getByExpeditionId(expeditionId));
    setCheckpoints(missionCheckpointStore.getByExpeditionId(expeditionId));
  }, [expeditionId]);

  // Re-fetch events when telemetry polls (new events may have been logged)
  const handleTelemetryPoll = useCallback((state: LiveTelemetryState) => {
    setTelemetryState(state);
    // Refresh events to catch any new telemetry-generated events
    const newEvents = missionEventStore.getByExpeditionId(expeditionId);
    if (newEvents.length !== events.length) {
      setEvents(newEvents);
    }
  }, [expeditionId, events.length]);

  // Group events by date
  const groupedEvents = useMemo(() => {
    const groups: Record<string, ExpeditionEvent[]> = {};
    for (const event of events) {
      const date = new Date(event.createdAt).toLocaleDateString('en-US', {
        weekday: 'short', month: 'short', day: 'numeric',
      });
      if (!groups[date]) groups[date] = [];
      groups[date].push(event);
    }
    return groups;
  }, [events]);

  const formatTime = (iso: string) => {
    return new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  const getEventDescription = (event: ExpeditionEvent): string => {
    const p = event.payload || {};
    switch (event.type) {
      case 'EXPEDITION_LAUNCHED': return `Mission launched with ${p.itemCount || 0} items`;
      case 'ITEM_USED': return `Used ${p.qty || 1}x ${p.name || 'item'}`;
      case 'ITEM_CONSUMED': return `${p.name || 'Item'} fully consumed`;
      case 'ITEM_LOST': return `${p.name || 'Item'} marked lost`;
      case 'ITEM_DEPLOYED': return `${p.name || 'Item'} deployed`;
      case 'NOTE_ADDED': return p.text || 'Note added';
      case 'CHECKPOINT': return `Checkpoint: ${p.label || 'unnamed'}`;
      case 'WATER_USED': return `Logged ${p.liters || 0}L water used${p.remainingL !== undefined ? ` (${p.remainingL.toFixed(1)}L remaining)` : ''}`;
      case 'FUEL_LOGGED': return `Fuel ${p.mode === 'added' ? 'added' : 'used'}: ${p.gallons}gal${p.remainingGal !== undefined ? ` (${p.remainingGal.toFixed(1)}gal remaining)` : ''}`;
      case 'POWER_UPDATED': return `Power logged${p.percentUsed ? `: ${p.percentUsed}% used` : ''}${p.remainingWh !== undefined ? ` (${p.remainingWh.toFixed(0)}Wh remaining)` : ''}`;
      case 'POWER_CONFIGURED': return `Power configured: ${p.capacityWh}Wh / ${p.avgDrawW}W draw`;
      case 'STATUS_CHANGED': return `Status changed to ${p.status || 'unknown'}`;
      default: return event.type.replace(/_/g, ' ');
    }
  };

  // Determine if an event is a telemetry event (for visual distinction)
  const isTelemetryEvent = (type: string): boolean => {
    return ['FUEL_LOGGED', 'FUEL_USED', 'WATER_USED', 'POWER_UPDATED', 'POWER_CONFIGURED'].includes(type);
  };

  return (
    <View style={styles.container}>
      {/* ═══════════════════════════════════════════════════════
          LIVE TELEMETRY STAT CHIPS — Always visible at top
          ═══════════════════════════════════════════════════════ */}
      <TelemetryStatChips
        expeditionId={expeditionId}
        onTelemetryPoll={handleTelemetryPoll}
      />

      {/* Tab Selector */}
      <View style={styles.tabRow}>
        {([
          { key: 'timeline', label: 'TIMELINE', count: events.length },
          { key: 'notes', label: 'NOTES', count: notes.length },
          { key: 'checkpoints', label: 'CHECKPOINTS', count: checkpoints.length },
        ] as const).map(t => {
          const isActive = tab === t.key;
          return (
            <TouchableOpacity
              key={t.key}
              style={[styles.tab, isActive && styles.tabActive]}
              onPress={() => setTab(t.key)}
            >
              <Text style={[styles.tabText, isActive && styles.tabTextActive]}>{t.label}</Text>
              <View style={[styles.tabBadge, isActive && styles.tabBadgeActive]}>
                <Text style={[styles.tabBadgeText, isActive && styles.tabBadgeTextActive]}>{t.count}</Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

      <ScrollView style={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Timeline */}
        {tab === 'timeline' && (
          events.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="time-outline" size={36} color={TACTICAL.textMuted} />
              <Text style={styles.emptyTitle}>NO EVENTS YET</Text>
              <Text style={styles.emptySub}>Mission events will appear here</Text>
            </View>
          ) : (
            Object.entries(groupedEvents).map(([date, dayEvents]) => (
              <View key={date}>
                <View style={styles.dateHeader}>
                  <View style={styles.dateLine} />
                  <Text style={styles.dateText}>{date}</Text>
                  <View style={styles.dateLine} />
                </View>
                {dayEvents.map((event, i) => {
                  const meta = EVENT_META[event.type] || { icon: 'ellipse-outline', color: TACTICAL.textMuted };
                  const isTelem = isTelemetryEvent(event.type);
                  return (
                    <View key={event.id} style={styles.eventRow}>
                      <View style={styles.timelineTrack}>
                        <View style={[styles.eventDot, { backgroundColor: meta.color }]} />
                        {i < dayEvents.length - 1 && <View style={styles.timelineLine} />}
                      </View>
                      <View style={[
                        styles.eventCard,
                        isTelem && styles.eventCardTelemetry,
                      ]}>
                        <View style={styles.eventHeader}>
                          <Ionicons name={meta.icon as any} size={14} color={meta.color} />
                          <Text style={[styles.eventType, { color: meta.color }]}>
                            {event.type.replace(/_/g, ' ')}
                          </Text>
                          {isTelem && (
                            <View style={styles.telemBadge}>
                              <Text style={styles.telemBadgeText}>TELEM</Text>
                            </View>
                          )}
                          <Text style={styles.eventTime}>{formatTime(event.createdAt)}</Text>
                        </View>
                        <Text style={styles.eventDesc}>{getEventDescription(event)}</Text>
                        {/* Show remaining percentage for telemetry events */}
                        {isTelem && event.payload && (
                          <View style={styles.telemMeta}>
                            {event.payload.remainingGal !== undefined && (
                              <View style={styles.telemMetaChip}>
                                <Ionicons name="flame-outline" size={8} color="#FF9500" />
                                <Text style={styles.telemMetaText}>{event.payload.remainingGal.toFixed(1)} gal</Text>
                              </View>
                            )}
                            {event.payload.remainingL !== undefined && (
                              <View style={styles.telemMetaChip}>
                                <Ionicons name="water-outline" size={8} color="#4FC3F7" />
                                <Text style={styles.telemMetaText}>{event.payload.remainingL.toFixed(1)} L</Text>
                              </View>
                            )}
                            {event.payload.remainingWh !== undefined && (
                              <View style={styles.telemMetaChip}>
                                <Ionicons name="flash-outline" size={8} color="#7C4DFF" />
                                <Text style={styles.telemMetaText}>{event.payload.remainingWh.toFixed(0)} Wh</Text>
                              </View>
                            )}
                          </View>
                        )}
                      </View>
                    </View>
                  );
                })}
              </View>
            ))
          )
        )}

        {/* Notes */}
        {tab === 'notes' && (
          notes.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="create-outline" size={36} color={TACTICAL.textMuted} />
              <Text style={styles.emptyTitle}>NO NOTES</Text>
              <Text style={styles.emptySub}>Add notes from the Dashboard quick actions</Text>
            </View>
          ) : (
            notes.map(note => (
              <View key={note.id} style={styles.noteCard}>
                <View style={styles.noteHeader}>
                  <Ionicons name="create-outline" size={14} color={TACTICAL.amber} />
                  <Text style={styles.noteTime}>{formatTime(note.createdAt)}</Text>
                  {note.tag && <Text style={styles.noteTag}>{note.tag}</Text>}
                </View>
                <Text style={styles.noteText}>{note.text}</Text>
              </View>
            ))
          )
        )}

        {/* Checkpoints */}
        {tab === 'checkpoints' && (
          checkpoints.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="flag-outline" size={36} color={TACTICAL.textMuted} />
              <Text style={styles.emptyTitle}>NO CHECKPOINTS</Text>
              <Text style={styles.emptySub}>Add checkpoints from the Dashboard</Text>
            </View>
          ) : (
            checkpoints.map((cp, i) => (
              <View key={cp.id} style={styles.checkpointCard}>
                <View style={styles.cpNumber}>
                  <Text style={styles.cpNumberText}>{checkpoints.length - i}</Text>
                </View>
                <View style={styles.cpContent}>
                  <Text style={styles.cpLabel}>{cp.label}</Text>
                  <Text style={styles.cpTime}>{formatTime(cp.timestamp)}</Text>
                  {(cp.lat != null && cp.lng != null) && (
                    <Text style={styles.cpCoords}>{cp.lat.toFixed(4)}, {cp.lng.toFixed(4)}</Text>
                  )}
                </View>
              </View>
            ))
          )
        )}

        <View style={{ height: 120 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  tabRow: {
    flexDirection: 'row', gap: 6, paddingHorizontal: 16,
    paddingVertical: 12,
  },
  tab: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 5, paddingVertical: 8, borderRadius: 8,
    borderWidth: 1, borderColor: TACTICAL.border, backgroundColor: TACTICAL.panel,
  },
  tabActive: { borderColor: TACTICAL.amber, backgroundColor: 'rgba(196,138,44,0.1)' },
  tabText: { fontSize: 9, fontWeight: '800', color: TACTICAL.textMuted, letterSpacing: 0.8 },
  tabTextActive: { color: TACTICAL.amber },
  tabBadge: {
    backgroundColor: 'rgba(138,138,133,0.15)', borderRadius: 6,
    paddingHorizontal: 5, paddingVertical: 1,
  },
  tabBadgeActive: { backgroundColor: 'rgba(196,138,44,0.2)' },
  tabBadgeText: { fontSize: 9, fontWeight: '800', color: TACTICAL.textMuted, fontFamily: 'Courier' },
  tabBadgeTextActive: { color: TACTICAL.amber },

  scrollContent: { flex: 1, paddingHorizontal: 16 },

  emptyState: { alignItems: 'center', gap: 8, paddingVertical: 40 },
  emptyTitle: { fontSize: 13, fontWeight: '900', color: TACTICAL.text, letterSpacing: 1.5 },
  emptySub: { fontSize: 12, color: TACTICAL.textMuted },

  // Timeline
  dateHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 12 },
  dateLine: { flex: 1, height: 1, backgroundColor: TACTICAL.border },
  dateText: { fontSize: 9, fontWeight: '800', color: TACTICAL.textMuted, letterSpacing: 1.5 },

  eventRow: { flexDirection: 'row', gap: 10, minHeight: 50 },
  timelineTrack: { width: 20, alignItems: 'center' },
  eventDot: { width: 8, height: 8, borderRadius: 4, marginTop: 6 },
  timelineLine: { width: 1, flex: 1, backgroundColor: TACTICAL.border, marginTop: 4 },

  eventCard: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.15)', borderRadius: 10,
    borderWidth: 1, borderColor: TACTICAL.border, padding: 10, marginBottom: 8,
  },
  eventCardTelemetry: {
    borderColor: 'rgba(255,149,0,0.15)',
    backgroundColor: 'rgba(255,149,0,0.03)',
  },
  eventHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  eventType: { flex: 1, fontSize: 9, fontWeight: '800', letterSpacing: 0.8 },
  eventTime: { fontSize: 9, color: TACTICAL.textMuted, fontFamily: 'Courier' },
  eventDesc: { fontSize: 12, color: TACTICAL.text, lineHeight: 18 },

  // Telemetry badge
  telemBadge: {
    backgroundColor: 'rgba(255,149,0,0.12)',
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 3,
    borderWidth: 1,
    borderColor: 'rgba(255,149,0,0.25)',
  },
  telemBadgeText: {
    fontSize: 6,
    fontWeight: '900',
    color: '#FF9500',
    letterSpacing: 1,
  },

  // Telemetry event metadata
  telemMeta: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 6,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: 'rgba(62,79,60,0.15)',
  },
  telemMetaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(0,0,0,0.15)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  telemMetaText: {
    fontSize: 8,
    fontWeight: '700',
    color: TACTICAL.textMuted,
    fontFamily: 'Courier',
  },

  // Notes
  noteCard: {
    backgroundColor: 'rgba(0,0,0,0.15)', borderRadius: 10,
    borderWidth: 1, borderColor: TACTICAL.border, padding: 12, marginBottom: 8,
  },
  noteHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  noteTime: { fontSize: 9, color: TACTICAL.textMuted, fontFamily: 'Courier' },
  noteTag: {
    fontSize: 8, fontWeight: '800', color: TACTICAL.amber, letterSpacing: 1,
    backgroundColor: 'rgba(196,138,44,0.1)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4,
  },
  noteText: { fontSize: 13, color: TACTICAL.text, lineHeight: 20 },

  // Checkpoints
  checkpointCard: {
    flexDirection: 'row', gap: 12, padding: 12,
    backgroundColor: 'rgba(0,0,0,0.15)', borderRadius: 10,
    borderWidth: 1, borderColor: TACTICAL.border, marginBottom: 8,
  },
  cpNumber: {
    width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(79,195,247,0.12)',
    borderWidth: 1, borderColor: 'rgba(79,195,247,0.3)',
    alignItems: 'center', justifyContent: 'center',
  },
  cpNumberText: { fontSize: 13, fontWeight: '900', color: '#4FC3F7', fontFamily: 'Courier' },
  cpContent: { flex: 1, gap: 2 },
  cpLabel: { fontSize: 13, fontWeight: '800', color: TACTICAL.text },
  cpTime: { fontSize: 10, color: TACTICAL.textMuted, fontFamily: 'Courier' },
  cpCoords: { fontSize: 9, color: TACTICAL.textMuted, fontFamily: 'Courier' },
});



