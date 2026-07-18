import React, { useMemo } from 'react';
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { SafeIcon as Ionicons } from '../SafeIcon';
import { GOLD_RAIL, TACTICAL } from '../../lib/theme';
import {
  formatNotableMomentLocalTime,
  normalizeExpeditionNotableMoments,
  type NormalizedNotableMoment,
  type TimelineCategory,
} from '../../lib/expedition/expeditionNotableMomentTimelineModel';
import type {
  ExpeditionRecap,
} from '../../lib/expedition';

type ExpeditionNotableMomentsTimelineProps = {
  recap: ExpeditionRecap | null;
  tripStartedAt: string;
  moments?: NormalizedNotableMoment[];
  selectedMomentId?: string | null;
  onSelectMoment?: (momentId: string) => void;
};

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

function severityStyle(severity: NormalizedNotableMoment['severity']) {
  if (severity === 'critical') return styles.markerCritical;
  if (severity === 'caution') return styles.markerCaution;
  if (severity === 'watch') return styles.markerWatch;
  return styles.markerInfo;
}

function TimelineMomentRow({
  moment,
  isLast,
  selected,
  onPress,
}: {
  moment: NormalizedNotableMoment;
  isLast: boolean;
  selected: boolean;
  onPress?: () => void;
}) {
  const routePointIndex = 'routePointIndex' in moment && typeof moment.routePointIndex === 'number'
    ? moment.routePointIndex
    : null;
  const timeLabel = moment.timestamp
    ? formatNotableMomentLocalTime(moment.timestamp)
    : routePointIndex != null
      ? `Route point ${routePointIndex + 1}`
      : 'Time unavailable';

  return (
    <TouchableOpacity
      style={[styles.momentRow, selected && styles.momentRowSelected]}
      onPress={onPress}
      activeOpacity={onPress ? 0.78 : 1}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={`${moment.title}. ${moment.description}`}
      accessibilityState={{ selected }}
    >
      <View style={styles.timelineRail}>
        <View style={[styles.momentMarker, severityStyle(moment.severity), selected && styles.momentMarkerSelected]}>
          <Ionicons name={iconForCategory(moment.category)} size={12} color={TACTICAL.text} />
        </View>
        {!isLast ? <View style={styles.timelineLine} /> : null}
      </View>
      <View style={styles.momentBody}>
        <View style={styles.momentTopLine}>
          <Text style={styles.momentTitle} numberOfLines={1}>{moment.title}</Text>
          <Text style={styles.momentTime} numberOfLines={2}>{timeLabel}</Text>
        </View>
        <Text style={styles.momentDescription} numberOfLines={2}>{moment.description}</Text>
        <Text style={styles.momentCategory}>{moment.category.toUpperCase()}</Text>
      </View>
    </TouchableOpacity>
  );
}

export default function ExpeditionNotableMomentsTimeline({
  recap,
  tripStartedAt,
  moments: suppliedMoments,
  selectedMomentId = null,
  onSelectMoment,
}: ExpeditionNotableMomentsTimelineProps) {
  const normalizedMoments = useMemo(
    () => normalizeExpeditionNotableMoments(recap, tripStartedAt),
    [recap, tripStartedAt],
  );
  const moments = suppliedMoments ?? normalizedMoments;

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
              selected={selectedMomentId === moment.id}
              onPress={onSelectMoment ? () => onSelectMoment(moment.id) : undefined}
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
    borderRadius: 7,
  },
  momentRowSelected: {
    backgroundColor: 'rgba(242,194,77,0.07)',
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
    lineHeight: 11,
    maxWidth: 112,
    textAlign: 'right',
  },
  momentMarkerSelected: {
    borderColor: TACTICAL.amber,
    borderWidth: 2,
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
