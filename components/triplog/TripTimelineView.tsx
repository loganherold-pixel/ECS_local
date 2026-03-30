/**
 * TripTimelineView — Chronological trip event timeline
 *
 * Displays trip events in a vertical timeline with:
 *   - Color-coded event dots
 *   - Event type badges
 *   - Timestamps and distances
 *   - GPS coordinates when available
 *   - Connecting timeline line
 */

import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { SafeIcon as Ionicons } from '../../components/SafeIcon';
import { TACTICAL } from '../../lib/theme';
import { formatDuration, formatDistance } from '../../lib/tripRecorderEngine';
import type { TripEvent } from '../../lib/tripRecorderTypes';
import { TRIP_EVENT_META } from '../../lib/tripRecorderTypes';

interface Props {
  events: TripEvent[];
  tripStartTime?: string;
}

export default function TripTimelineView({ events, tripStartTime }: Props) {
  if (events.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Ionicons name="time-outline" size={36} color={TACTICAL.textMuted} />
        <Text style={styles.emptyTitle}>NO EVENTS</Text>
        <Text style={styles.emptySub}>Events will appear here as they are recorded.</Text>
      </View>
    );
  }

  // Group events by date
  const grouped: Record<string, TripEvent[]> = {};
  for (const event of events) {
    const date = new Date(event.timestamp).toLocaleDateString('en-US', {
      weekday: 'short', month: 'short', day: 'numeric',
    });
    if (!grouped[date]) grouped[date] = [];
    grouped[date].push(event);
  }

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {Object.entries(grouped).map(([date, dateEvents]) => (
        <View key={date}>
          {/* Date header */}
          <View style={styles.dateHeader}>
            <View style={styles.dateLine} />
            <Text style={styles.dateText}>{date.toUpperCase()}</Text>
            <View style={styles.dateLine} />
          </View>

          {/* Events */}
          {dateEvents.map((event, idx) => {
            const meta = TRIP_EVENT_META[event.type] || TRIP_EVENT_META.user_note;
            const time = new Date(event.timestamp).toLocaleTimeString('en-US', {
              hour: '2-digit', minute: '2-digit',
            });
            const isLast = idx === dateEvents.length - 1;

            // Calculate elapsed from trip start
            let elapsedStr = '';
            if (tripStartTime) {
              const elapsed = (new Date(event.timestamp).getTime() - new Date(tripStartTime).getTime()) / 1000;
              if (elapsed > 0) elapsedStr = `+${formatDuration(elapsed)}`;
            }

            return (
              <View key={event.id} style={styles.eventRow}>
                {/* Timeline connector */}
                <View style={styles.timelineCol}>
                  <View style={[styles.eventDot, { backgroundColor: meta.color }]} />
                  {!isLast && <View style={styles.connectorLine} />}
                </View>

                {/* Event content */}
                <View style={styles.eventContent}>
                  <View style={styles.eventHeader}>
                    <View style={[styles.typeBadge, { borderColor: `${meta.color}40` }]}>
                      <Ionicons name={meta.icon as any} size={10} color={meta.color} />
                      <Text style={[styles.typeBadgeText, { color: meta.color }]}>{meta.label}</Text>
                    </View>
                    <Text style={styles.eventTime}>{time}</Text>
                  </View>

                  <Text style={styles.eventDescription}>{event.description}</Text>

                  <View style={styles.eventMeta}>
                    {event.distanceAtEventMi > 0 && (
                      <View style={styles.metaChip}>
                        <Ionicons name="map-outline" size={8} color={TACTICAL.textMuted} />
                        <Text style={styles.metaText}>{formatDistance(event.distanceAtEventMi)}</Text>
                      </View>
                    )}
                    {elapsedStr ? (
                      <View style={styles.metaChip}>
                        <Ionicons name="time-outline" size={8} color={TACTICAL.textMuted} />
                        <Text style={styles.metaText}>{elapsedStr}</Text>
                      </View>
                    ) : null}
                    {event.altitudeFt != null && (
                      <View style={styles.metaChip}>
                        <Ionicons name="trending-up-outline" size={8} color={TACTICAL.textMuted} />
                        <Text style={styles.metaText}>{event.altitudeFt.toLocaleString()} ft</Text>
                      </View>
                    )}
                    {event.lat != null && event.lng != null && (
                      <Text style={styles.coordsText}>
                        {event.lat.toFixed(4)}, {event.lng.toFixed(4)}
                      </Text>
                    )}
                  </View>

                  {/* Extra meta data */}
                  {Object.keys(event.meta).length > 0 && (
                    <View style={styles.extraMeta}>
                      {Object.entries(event.meta).map(([k, v]) => {
                        if (k === 'vehicleName' || k === 'expeditionId') return null;
                        return (
                          <Text key={k} style={styles.extraMetaText}>
                            {k}: {typeof v === 'number' ? v.toLocaleString() : String(v)}
                          </Text>
                        );
                      })}
                    </View>
                  )}
                </View>
              </View>
            );
          })}
        </View>
      ))}
      <View style={{ height: 60 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 16,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 40,
  },
  emptyTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: TACTICAL.text,
    letterSpacing: 1,
  },
  emptySub: {
    fontSize: 11,
    color: TACTICAL.textMuted,
    textAlign: 'center',
  },

  // Date header
  dateHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginVertical: 12,
  },
  dateLine: {
    flex: 1,
    height: 1,
    backgroundColor: 'rgba(62, 79, 60, 0.2)',
  },
  dateText: {
    fontSize: 10,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    letterSpacing: 1.5,
  },

  // Event row
  eventRow: {
    flexDirection: 'row',
    marginBottom: 2,
  },
  timelineCol: {
    width: 24,
    alignItems: 'center',
  },
  eventDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginTop: 6,
  },
  connectorLine: {
    flex: 1,
    width: 1.5,
    backgroundColor: 'rgba(62, 79, 60, 0.2)',
    marginTop: 4,
  },

  // Event content
  eventContent: {
    flex: 1,
    marginLeft: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(62, 79, 60, 0.15)',
    marginBottom: 6,
  },
  eventHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  typeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 5,
    borderWidth: 1,
  },
  typeBadgeText: {
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  eventTime: {
    fontSize: 10,
    color: TACTICAL.textMuted,
    fontFamily: 'Courier',
  },
  eventDescription: {
    fontSize: 12,
    color: TACTICAL.text,
    lineHeight: 17,
    marginBottom: 4,
  },
  eventMeta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 6,
  },
  metaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  metaText: {
    fontSize: 9,
    color: TACTICAL.textMuted,
    fontFamily: 'Courier',
  },
  coordsText: {
    fontSize: 9,
    color: TACTICAL.textMuted,
    fontFamily: 'Courier',
    opacity: 0.7,
  },
  extraMeta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: 'rgba(30,35,43,0.3)',
  },
  extraMetaText: {
    fontSize: 9,
    color: TACTICAL.amber,
    fontFamily: 'Courier',
  },
});



