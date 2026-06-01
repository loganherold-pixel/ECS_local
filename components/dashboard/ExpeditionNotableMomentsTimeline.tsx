import React, { useMemo } from 'react';
import {
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { SafeIcon as Ionicons } from '../SafeIcon';
import { GOLD_RAIL, TACTICAL } from '../../lib/theme';
import type {
  ExpeditionRecap,
  ExpeditionRecapNotableMoment,
  ExpeditionTripCoordinate,
} from '../../lib/expedition';

type TimelineCategory =
  | 'elevation'
  | 'weather'
  | 'route deviation'
  | 'reroute'
  | 'terrain risk'
  | 'recovery'
  | 'milestone'
  | 'campsite'
  | 'resupply';

type NormalizedNotableMoment = {
  id: string;
  tripId: string;
  type: string;
  title: string;
  description: string;
  timestamp: string | null;
  elapsedSeconds: number | null;
  coordinate: ExpeditionTripCoordinate | null;
  severity: 'info' | 'watch' | 'caution' | 'critical';
  source: 'expedition_recap';
  createdAt: string | null;
  category: TimelineCategory;
};

type ExpeditionNotableMomentsTimelineProps = {
  recap: ExpeditionRecap | null;
  tripStartedAt: string;
};

function timestampMs(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

function categoryForMoment(type: ExpeditionRecapNotableMoment['type'] | string): TimelineCategory {
  switch (type) {
    case 'highest_elevation':
      return 'elevation';
    case 'weather_change':
      return 'weather';
    case 'route_deviation':
      return 'route deviation';
    case 'reroute_accepted':
      return 'reroute';
    case 'terrain_risk_warning':
      return 'terrain risk';
    case 'recovery_tools_opened':
      return 'recovery';
    default:
      return 'milestone';
  }
}

function severityForCategory(category: TimelineCategory): NormalizedNotableMoment['severity'] {
  if (category === 'terrain risk') return 'caution';
  if (category === 'route deviation' || category === 'reroute' || category === 'recovery') return 'watch';
  return 'info';
}

function iconForCategory(category: TimelineCategory): React.ComponentProps<typeof Ionicons>['name'] {
  switch (category) {
    case 'elevation':
      return 'trending-up-outline';
    case 'weather':
      return 'partly-sunny-outline';
    case 'route deviation':
      return 'git-branch-outline';
    case 'reroute':
      return 'return-up-forward-outline';
    case 'terrain risk':
      return 'warning-outline';
    case 'recovery':
      return 'construct-outline';
    case 'campsite':
      return 'bonfire-outline';
    case 'resupply':
      return 'cube-outline';
    default:
      return 'flag-outline';
  }
}

function descriptionForMoment(moment: ExpeditionRecapNotableMoment, category: TimelineCategory): string {
  const detail = moment.detail?.trim();
  if (detail) {
    if (category === 'elevation') return `Highest elevation recorded: ${detail}.`;
    if (category === 'weather') return `Weather change recorded: ${detail}.`;
    if (category === 'route deviation') return `Route deviation recorded: ${detail}.`;
    if (category === 'reroute') return `Reroute recorded: ${detail}.`;
    if (category === 'terrain risk') return `Terrain risk recorded: ${detail}.`;
    if (category === 'recovery') return `Recovery usage recorded: ${detail}.`;
    return detail.endsWith('.') ? detail : `${detail}.`;
  }

  if (category === 'elevation') return 'Highest elevation event captured from trip data.';
  if (category === 'weather') return 'Weather event captured from trip data.';
  if (category === 'route deviation') return 'Route deviation captured from trip data.';
  if (category === 'reroute') return 'Reroute event captured from trip data.';
  if (category === 'terrain risk') return 'Terrain risk event captured from trip data.';
  if (category === 'recovery') return 'Recovery tool usage captured from trip data.';
  return 'Milestone captured from completed trip data.';
}

function normalizeMoments(
  recap: ExpeditionRecap | null,
  tripStartedAt: string,
): NormalizedNotableMoment[] {
  const startedMs = timestampMs(tripStartedAt);
  return (recap?.expeditionEvents.notableMoments ?? [])
    .map((moment, index) => {
      const capturedMs = timestampMs(moment.capturedAt);
      const category = categoryForMoment(moment.type);
      return {
        id: moment.id || `moment-${index}`,
        tripId: recap?.tripId ?? 'unknown-trip',
        type: moment.type,
        title: moment.title.trim() || 'Trip moment',
        description: descriptionForMoment(moment, category),
        timestamp: moment.capturedAt || null,
        elapsedSeconds:
          startedMs != null && capturedMs != null && capturedMs >= startedMs
            ? Math.round((capturedMs - startedMs) / 1000)
            : null,
        coordinate: moment.coordinate ?? null,
        severity: severityForCategory(category),
        source: 'expedition_recap' as const,
        createdAt: moment.capturedAt || null,
        category,
      };
    })
    .sort((left, right) => {
      const leftMs = timestampMs(left.timestamp) ?? Number.MAX_SAFE_INTEGER;
      const rightMs = timestampMs(right.timestamp) ?? Number.MAX_SAFE_INTEGER;
      if (leftMs !== rightMs) return leftMs - rightMs;
      return left.id.localeCompare(right.id);
    });
}

function formatElapsed(seconds: number | null): string | null {
  if (seconds == null || !Number.isFinite(seconds)) return null;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours <= 0) return `T+${minutes}m`;
  if (minutes <= 0) return `T+${hours}h`;
  return `T+${hours}h ${minutes}m`;
}

function formatTimestamp(value: string | null): string {
  const parsedMs = timestampMs(value);
  if (parsedMs == null) return 'Time unavailable';
  return new Date(parsedMs).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
}

function severityStyle(severity: NormalizedNotableMoment['severity']) {
  if (severity === 'critical') return styles.markerCritical;
  if (severity === 'caution') return styles.markerCaution;
  if (severity === 'watch') return styles.markerWatch;
  return styles.markerInfo;
}

function TimelineMomentRow({
  moment,
  isLast,
}: {
  moment: NormalizedNotableMoment;
  isLast: boolean;
}) {
  const timeLabel = formatElapsed(moment.elapsedSeconds) ?? formatTimestamp(moment.timestamp);

  return (
    <View style={styles.momentRow}>
      <View style={styles.timelineRail}>
        <View style={[styles.momentMarker, severityStyle(moment.severity)]}>
          <Ionicons name={iconForCategory(moment.category)} size={12} color={TACTICAL.text} />
        </View>
        {!isLast ? <View style={styles.timelineLine} /> : null}
      </View>
      <View style={styles.momentBody}>
        <View style={styles.momentTopLine}>
          <Text style={styles.momentTitle} numberOfLines={1}>{moment.title}</Text>
          <Text style={styles.momentTime}>{timeLabel}</Text>
        </View>
        <Text style={styles.momentDescription} numberOfLines={2}>{moment.description}</Text>
        <Text style={styles.momentCategory}>{moment.category.toUpperCase()}</Text>
      </View>
    </View>
  );
}

export default function ExpeditionNotableMomentsTimeline({
  recap,
  tripStartedAt,
}: ExpeditionNotableMomentsTimelineProps) {
  const moments = useMemo(() => normalizeMoments(recap, tripStartedAt), [recap, tripStartedAt]);

  return (
    <View style={styles.section}>
      <View style={styles.headerRow}>
        <View style={styles.headerLeft}>
          <Ionicons name="time-outline" size={14} color={TACTICAL.amber} />
          <Text style={styles.sectionTitle}>Notable Moments</Text>
        </View>
        <Text style={styles.countText}>{moments.length}</Text>
      </View>

      {moments.length > 0 ? (
        <View style={styles.timelineList}>
          {moments.map((moment, index) => (
            <TimelineMomentRow
              key={moment.id}
              moment={moment}
              isLast={index === moments.length - 1}
            />
          ))}
        </View>
      ) : (
        <View style={styles.emptyState}>
          <Ionicons name="flag-outline" size={22} color={TACTICAL.textMuted} />
          <Text style={styles.emptyTitle}>No notable moments captured.</Text>
          <Text style={styles.emptySubtext}>
            Future expeditions will record key route, terrain, and condition events.
          </Text>
        </View>
      )}

      {/* TODO Expedition Timeline: link timeline rows to recap map callouts. */}
      {/* TODO Expedition Timeline: support exploded route annotations for selected moments. */}
      {/* TODO Expedition Timeline: expose badge triggers after badge evaluation exists. */}
      {/* TODO Expedition Timeline: add PDF timeline export after export behavior is built. */}
      {/* TODO Expedition Timeline: coordinate weather/terrain overlays with recap map layers. */}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: GOLD_RAIL.subsection,
    backgroundColor: 'rgba(17,20,24,0.72)',
    padding: 10,
    gap: 9,
  },
  headerRow: {
    minHeight: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  sectionTitle: {
    color: TACTICAL.text,
    fontSize: 13,
    fontWeight: '900',
  },
  countText: {
    color: TACTICAL.textMuted,
    fontSize: 10,
    fontWeight: '900',
  },
  timelineList: {
    gap: 0,
  },
  momentRow: {
    flexDirection: 'row',
    gap: 9,
    minHeight: 54,
  },
  timelineRail: {
    width: 22,
    alignItems: 'center',
  },
  momentMarker: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: GOLD_RAIL.internal,
    backgroundColor: 'rgba(139,148,158,0.16)',
  },
  markerInfo: {
    backgroundColor: 'rgba(139,148,158,0.16)',
  },
  markerWatch: {
    borderColor: 'rgba(242,194,77,0.36)',
    backgroundColor: 'rgba(242,194,77,0.14)',
  },
  markerCaution: {
    borderColor: 'rgba(230,126,34,0.38)',
    backgroundColor: 'rgba(230,126,34,0.14)',
  },
  markerCritical: {
    borderColor: 'rgba(192,57,43,0.42)',
    backgroundColor: 'rgba(192,57,43,0.16)',
  },
  timelineLine: {
    flex: 1,
    width: 1,
    marginVertical: 3,
    backgroundColor: GOLD_RAIL.internal,
  },
  momentBody: {
    flex: 1,
    minWidth: 0,
    borderBottomWidth: 1,
    borderBottomColor: GOLD_RAIL.internal,
    paddingBottom: 9,
    marginBottom: 9,
    gap: 4,
  },
  momentTopLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  momentTitle: {
    flex: 1,
    minWidth: 0,
    color: TACTICAL.text,
    fontSize: 12,
    fontWeight: '900',
  },
  momentTime: {
    color: TACTICAL.amber,
    fontSize: 9,
    fontWeight: '900',
  },
  momentDescription: {
    color: TACTICAL.textMuted,
    fontSize: 10,
    fontWeight: '600',
    lineHeight: 14,
  },
  momentCategory: {
    color: TACTICAL.textMuted,
    fontSize: 7,
    fontWeight: '900',
  },
  emptyState: {
    minHeight: 118,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingHorizontal: 16,
  },
  emptyTitle: {
    color: TACTICAL.text,
    fontSize: 13,
    fontWeight: '900',
    textAlign: 'center',
  },
  emptySubtext: {
    color: TACTICAL.textMuted,
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'center',
  },
});
