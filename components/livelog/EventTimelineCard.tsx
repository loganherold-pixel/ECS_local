/**
 * EventTimelineCard — Single event row in the Live Log timeline
 *
 * Displays event type icon, severity badge, details text, and timestamp.
 * Compact design optimized for a fixed-height scrollable list.
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SafeIcon as Ionicons } from '../SafeIcon';
import { TACTICAL } from '../../lib/theme';
import {
  EVENT_TYPE_META,
  SEVERITY_META,
  type ExpeditionEvent,
  type EventType,
  type EventSeverity,
} from '../../lib/expeditionEventStore';

interface Props {
  event: ExpeditionEvent;
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export default function EventTimelineCard({ event }: Props) {
  const typeMeta = EVENT_TYPE_META[event.event_type] || EVENT_TYPE_META.NOTE;
  const sevMeta = SEVERITY_META[event.severity] || SEVERITY_META.LOW;

  return (
    <View style={[styles.card, event._optimistic && styles.cardOptimistic, event._failed && styles.cardFailed]}>
      {/* Left: type icon */}
      <View style={[styles.iconWrap, { borderColor: `${typeMeta.color}40` }]}>
        <Ionicons name={typeMeta.icon} size={16} color={typeMeta.color} />
      </View>

      {/* Center: content */}
      <View style={styles.content}>
        <View style={styles.topRow}>
          <Text style={[styles.typeLabel, { color: typeMeta.color }]}>
            {typeMeta.label}
          </Text>
          <View style={[styles.sevBadge, { backgroundColor: sevMeta.bg, borderColor: `${sevMeta.color}30` }]}>
            <Text style={[styles.sevText, { color: sevMeta.color }]}>
              {sevMeta.label}
            </Text>
          </View>
          {event._optimistic && (
            <View style={styles.syncBadge}>
              <Text style={styles.syncText}>SYNCING</Text>
            </View>
          )}
          {event._failed && (
            <View style={[styles.syncBadge, { backgroundColor: 'rgba(239,83,80,0.12)' }]}>
              <Text style={[styles.syncText, { color: '#EF5350' }]}>FAILED</Text>
            </View>
          )}
        </View>

        {event.title ? (
          <Text style={styles.title} numberOfLines={1}>{event.title}</Text>
        ) : null}

        <Text style={styles.details} numberOfLines={2}>
          {event.details || '(no details)'}
        </Text>

        <Text style={styles.timestamp}>
          {formatTime(event.created_at)}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(62, 79, 60, 0.12)',
    backgroundColor: 'transparent',
  },
  cardOptimistic: {
    opacity: 0.7,
  },
  cardFailed: {
    backgroundColor: 'rgba(239, 83, 80, 0.04)',
  },

  iconWrap: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.18)',
    borderWidth: 1,
    marginTop: 2,
  },

  content: {
    flex: 1,
  },

  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 3,
  },

  typeLabel: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1.5,
  },

  sevBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
  },
  sevText: {
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 1,
  },

  syncBadge: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 3,
    backgroundColor: 'rgba(196,138,44,0.12)',
  },
  syncText: {
    fontSize: 7,
    fontWeight: '800',
    color: TACTICAL.amber,
    letterSpacing: 0.8,
  },

  title: {
    fontSize: 12,
    fontWeight: '800',
    color: TACTICAL.text,
    marginBottom: 2,
  },

  details: {
    fontSize: 12,
    fontWeight: '400',
    color: TACTICAL.text,
    lineHeight: 17,
    letterSpacing: 0.2,
  },

  timestamp: {
    fontSize: 10,
    fontWeight: '600',
    color: TACTICAL.textMuted,
    fontFamily: 'Courier',
    marginTop: 4,
    letterSpacing: 0.5,
  },
});



