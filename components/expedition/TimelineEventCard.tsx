// ============================================================
// Timeline Event Card — Individual event in the expedition timeline
// ============================================================
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeIcon as Ionicons } from '../SafeIcon';
import { TACTICAL, ECS } from '../../lib/theme';
import {
  TIMELINE_EVENT_META,
  type TimelineEntry,
  type TimelineEventType,
} from '../../lib/timelineIntelligenceEngine';

interface Props {
  entry: TimelineEntry;
  isFirst?: boolean;
  isLast?: boolean;
  onPress?: (entry: TimelineEntry) => void;
}

function formatTime(timestamp: string): string {
  try {
    const d = new Date(timestamp);
    const hours = d.getHours();
    const mins = d.getMinutes();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const h = hours % 12 || 12;
    return `${h}:${String(mins).padStart(2, '0')} ${ampm}`;
  } catch {
    return '--:--';
  }
}

function formatDate(timestamp: string): string {
  try {
    const d = new Date(timestamp);
    const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
    return `${months[d.getMonth()]} ${d.getDate()}`;
  } catch {
    return '';
  }
}

export default function TimelineEventCard({ entry, isFirst, isLast, onPress }: Props) {
  const meta = TIMELINE_EVENT_META[entry.event_type] || TIMELINE_EVENT_META.manual_note;
  const hasLocation = entry.latitude != null && entry.longitude != null;

  return (
    <TouchableOpacity
      style={styles.container}
      onPress={() => onPress?.(entry)}
      activeOpacity={onPress ? 0.7 : 1}
      disabled={!onPress}
    >
      {/* Timeline connector line */}
      <View style={styles.connectorCol}>
        {/* Top line */}
        {!isFirst && <View style={[styles.connectorLine, styles.connectorTop]} />}

        {/* Dot */}
        <View style={[styles.dot, { backgroundColor: meta.dotColor }]}>
          <View style={[styles.dotInner, { backgroundColor: meta.dotColor }]} />
        </View>

        {/* Bottom line */}
        {!isLast && <View style={[styles.connectorLine, styles.connectorBottom]} />}
      </View>

      {/* Content */}
      <View style={styles.content}>
        {/* Header row */}
        <View style={styles.headerRow}>
          <View style={[styles.typeBadge, { borderColor: meta.color + '30', backgroundColor: meta.color + '0C' }]}>
            <Ionicons name={meta.icon as any} size={10} color={meta.color} />
            <Text style={[styles.typeLabel, { color: meta.color }]}>{meta.label}</Text>
          </View>

          <View style={styles.timeCol}>
            <Text style={styles.timeText}>{formatTime(entry.timestamp)}</Text>
            <Text style={styles.dateText}>{formatDate(entry.timestamp)}</Text>
          </View>
        </View>

        {/* Title */}
        <Text style={styles.title} numberOfLines={1}>{entry.title}</Text>

        {/* Description */}
        {entry.description ? (
          <Text style={styles.description} numberOfLines={2}>{entry.description}</Text>
        ) : null}

        {/* Footer: location indicator + sync status */}
        <View style={styles.footerRow}>
          {hasLocation && (
            <View style={styles.locationBadge}>
              <Ionicons name="navigate-outline" size={9} color={TACTICAL.textMuted} />
              <Text style={styles.locationText}>
                {entry.latitude?.toFixed(4)}, {entry.longitude?.toFixed(4)}
              </Text>
            </View>
          )}

          {!entry._synced && (
            <View style={styles.unsyncedBadge}>
              <View style={styles.unsyncedDot} />
              <Text style={styles.unsyncedText}>LOCAL</Text>
            </View>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    paddingRight: 16,
    minHeight: 72,
  },

  // ── Connector Column ───────────────────────────────────
  connectorCol: {
    width: 40,
    alignItems: 'center',
    position: 'relative',
  },
  connectorLine: {
    width: 1.5,
    backgroundColor: ECS.stroke,
    position: 'absolute',
    left: 19.25,
  },
  connectorTop: {
    top: 0,
    height: '50%',
  },
  connectorBottom: {
    bottom: 0,
    height: '50%',
  },
  dot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'absolute',
    top: '50%',
    marginTop: -7,
    zIndex: 2,
  },
  dotInner: {
    width: 6,
    height: 6,
    borderRadius: 3,
    opacity: 0.6,
  },

  // ── Content ────────────────────────────────────────────
  content: {
    flex: 1,
    paddingVertical: 10,
    paddingLeft: 4,
    borderBottomWidth: 0.5,
    borderBottomColor: ECS.stroke,
  },

  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },

  typeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 5,
    borderWidth: 1,
  },
  typeLabel: {
    fontSize: 7,
    fontWeight: '800',
    letterSpacing: 1.5,
  },

  timeCol: {
    alignItems: 'flex-end',
  },
  timeText: {
    fontSize: 11,
    fontWeight: '700',
    color: TACTICAL.text,
    fontFamily: 'Courier',
    letterSpacing: 0.5,
  },
  dateText: {
    fontSize: 8,
    fontWeight: '600',
    color: TACTICAL.textMuted,
    letterSpacing: 1,
    marginTop: 1,
  },

  title: {
    fontSize: 13,
    fontWeight: '700',
    color: TACTICAL.text,
    letterSpacing: 0.3,
    marginBottom: 2,
  },

  description: {
    fontSize: 11,
    fontWeight: '500',
    color: TACTICAL.textMuted,
    lineHeight: 16,
    marginBottom: 4,
  },

  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 2,
  },

  locationBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  locationText: {
    fontSize: 8,
    fontWeight: '600',
    color: TACTICAL.textMuted,
    fontFamily: 'Courier',
    letterSpacing: 0.5,
  },

  unsyncedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  unsyncedDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#FF9500',
  },
  unsyncedText: {
    fontSize: 7,
    fontWeight: '800',
    color: '#FF9500',
    letterSpacing: 1,
  },
});



