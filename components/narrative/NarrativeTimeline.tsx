/**
 * NarrativeTimeline — Cinematic expedition story timeline
 *
 * Displays narrative events in reverse chronological order with
 * date grouping. Designed to feel like reading a story, not
 * scanning telemetry.
 *
 * Layout per event row:
 *   [thin accent bar]  TIME (small)  MESSAGE (primary)
 *
 * Rules:
 *   - No heavy icons, no big containers
 *   - Highlighted events get a subtle left accent bar
 *   - Date groups use relative labels ("Today", "Yesterday", etc.)
 *   - Empty state shows a quiet "No moments recorded" message
 */

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { TACTICAL } from '../../lib/theme';
import {
  narrativeEngine,
  NARRATIVE_EVENT_META,
  type NarrativeEvent,
  type NarrativeEventType,
} from '../../lib/narrativeEngine';

// ── Helpers ──────────────────────────────────────────────────

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  } catch {
    return '--:--';
  }
}

function formatDateGroup(iso: string): string {
  try {
    const d = new Date(iso);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const eventDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const diffDays = Math.round(
      (today.getTime() - eventDay.getTime()) / (1000 * 60 * 60 * 24)
    );

    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return d.toLocaleDateString('en-US', { weekday: 'long' });
    return d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: d.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
    });
  } catch {
    return '';
  }
}

function getAccentColor(eventType: NarrativeEventType): string {
  return NARRATIVE_EVENT_META[eventType]?.color || TACTICAL.textMuted;
}

// ── Group events by date ─────────────────────────────────────

interface DateGroup {
  label: string;
  events: NarrativeEvent[];
}

function groupByDate(events: NarrativeEvent[]): DateGroup[] {
  const groups: DateGroup[] = [];
  let currentLabel = '';
  let currentGroup: NarrativeEvent[] = [];

  // Events are already sorted newest-first from the engine
  for (const event of events) {
    const label = formatDateGroup(event.timestamp);
    if (label !== currentLabel) {
      if (currentGroup.length > 0) {
        groups.push({ label: currentLabel, events: currentGroup });
      }
      currentLabel = label;
      currentGroup = [event];
    } else {
      currentGroup.push(event);
    }
  }

  if (currentGroup.length > 0) {
    groups.push({ label: currentLabel, events: currentGroup });
  }

  return groups;
}

// ── Component ────────────────────────────────────────────────

interface Props {
  expeditionId: string;
  /** If true, loads from server on mount (for past expeditions) */
  loadFromServer?: boolean;
  /** Max events to display (default: all) */
  maxEvents?: number;
}

export default function NarrativeTimeline({
  expeditionId,
  loadFromServer = true,
  maxEvents,
}: Props) {
  const [events, setEvents] = useState<NarrativeEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // Load events
  const loadEvents = useCallback(async () => {
    if (!expeditionId) return;

    // Start with local cache
    const local = narrativeEngine.getEvents(expeditionId);
    if (local.length > 0) {
      setEvents(maxEvents ? local.slice(0, maxEvents) : local);
    }

    // Optionally fetch from server
    if (loadFromServer) {
      setLoading(true);
      try {
        const serverEvents = await narrativeEngine.loadFromServer(expeditionId);
        if (!mountedRef.current) return;
        setEvents(maxEvents ? serverEvents.slice(0, maxEvents) : serverEvents);
      } catch (err) {
        console.warn('[NarrativeTimeline] Load error:', err);
      }
      if (mountedRef.current) setLoading(false);
    }
  }, [expeditionId, loadFromServer, maxEvents]);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  // Subscribe to live updates
  useEffect(() => {
    const unsub = narrativeEngine.subscribe(() => {
      if (!mountedRef.current) return;
      const updated = narrativeEngine.getEvents(expeditionId);
      setEvents(maxEvents ? updated.slice(0, maxEvents) : updated);
    });
    return unsub;
  }, [expeditionId, maxEvents]);

  // ── Render ──────────────────────────────────────────────

  if (loading && events.length === 0) {
    return (
      <View style={styles.container}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>TIMELINE</Text>
        </View>
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="small" color={TACTICAL.textMuted} />
        </View>
      </View>
    );
  }

  if (events.length === 0) {
    return (
      <View style={styles.container}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>TIMELINE</Text>
        </View>
        <Text style={styles.emptyText}>No moments recorded</Text>
      </View>
    );
  }

  const dateGroups = groupByDate(events);

  return (
    <View style={styles.container}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>TIMELINE</Text>
        <Text style={styles.eventCount}>{events.length}</Text>
      </View>

      {dateGroups.map((group, gi) => (
        <View key={`${group.label}-${gi}`} style={styles.dateGroup}>
          {/* Date separator */}
          <View style={styles.dateSeparator}>
            <View style={styles.dateLine} />
            <Text style={styles.dateLabel}>{group.label}</Text>
            <View style={styles.dateLine} />
          </View>

          {/* Events within this date */}
          {group.events.map((event, ei) => {
            const accentColor = getAccentColor(event.eventType);
            const isHighlighted = event.highlight;

            return (
              <View
                key={event.id}
                style={[
                  styles.eventRow,
                  ei === group.events.length - 1 && styles.eventRowLast,
                ]}
              >
                {/* Accent bar */}
                <View
                  style={[
                    styles.accentBar,
                    { backgroundColor: isHighlighted ? accentColor : 'transparent' },
                  ]}
                />

                {/* Time */}
                <Text style={styles.eventTime}>
                  {formatTime(event.timestamp)}
                </Text>

                {/* Message */}
                <Text
                  style={[
                    styles.eventMessage,
                    isHighlighted && { color: TACTICAL.text },
                  ]}
                  numberOfLines={2}
                >
                  {event.message}
                </Text>
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
}

// ── Styles ───────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    marginTop: 20,
    marginBottom: 8,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '900',
    color: TACTICAL.amber,
    letterSpacing: 1.5,
  },
  eventCount: {
    fontSize: 10,
    fontWeight: '700',
    color: TACTICAL.textMuted,
    fontFamily: 'Courier',
  },
  loadingWrap: {
    paddingVertical: 20,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 12,
    color: TACTICAL.textMuted,
    fontStyle: 'italic',
    paddingVertical: 12,
  },

  // Date groups
  dateGroup: {
    marginBottom: 4,
  },
  dateSeparator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
    marginTop: 4,
  },
  dateLine: {
    flex: 1,
    height: 1,
    backgroundColor: 'rgba(62, 79, 60, 0.22)',
  },
  dateLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: TACTICAL.textMuted,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },

  // Event rows
  eventRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(62, 79, 60, 0.10)',
    gap: 10,
  },
  eventRowLast: {
    borderBottomWidth: 0,
  },
  accentBar: {
    width: 2,
    minHeight: 16,
    borderRadius: 1,
    marginTop: 2,
    alignSelf: 'stretch',
  },
  eventTime: {
    fontSize: 10,
    fontWeight: '600',
    color: TACTICAL.textMuted,
    fontFamily: 'Courier',
    width: 68,
    marginTop: 1,
  },
  eventMessage: {
    flex: 1,
    fontSize: 13,
    fontWeight: '500',
    color: 'rgba(230, 230, 225, 0.82)',
    lineHeight: 18,
    letterSpacing: 0.2,
  },
});



