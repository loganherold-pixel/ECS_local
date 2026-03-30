/**
 * EventTimeline — Scrollable event timeline with filter chips
 *
 * Displays filter chips (ALL, RISK, MECH, MED, NAV) and a
 * fixed-height scrollable list of EventTimelineCards.
 * Limited to 10 events via the data source.
 */
import React from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  ActivityIndicator,
} from 'react-native';
import { SafeIcon as Ionicons } from '../SafeIcon';
import { TACTICAL } from '../../lib/theme';
import {
  EVENT_TYPE_META,
  type ExpeditionEvent,
  type EventType,
} from '../../lib/expeditionEventStore';
import EventTimelineCard from './EventTimelineCard';

// Filter chip options
type FilterType = EventType | 'ALL';

const FILTER_CHIPS: { value: FilterType; label: string; icon: string; color: string }[] = [
  { value: 'ALL',  label: 'ALL',  icon: 'list-outline',      color: TACTICAL.textMuted },
  { value: 'RISK', label: 'RISK', icon: 'warning-outline',   color: '#FF9500' },
  { value: 'MECH', label: 'MECH', icon: 'construct-outline', color: '#FFB74D' },
  { value: 'MED',  label: 'MED',  icon: 'medkit-outline',    color: '#EF5350' },
  { value: 'NAV',  label: 'NAV',  icon: 'compass-outline',   color: '#42A5F5' },
];

interface Props {
  events: ExpeditionEvent[];
  filterType: FilterType;
  onFilterChange: (filter: FilterType) => void;
  loading: boolean;
  totalCount: number;
}

export default function EventTimeline({
  events,
  filterType,
  onFilterChange,
  loading,
  totalCount,
}: Props) {
  return (
    <View style={styles.container}>
      {/* Filter chips row */}
      <View style={styles.filterRow}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterChips}
        >
          {FILTER_CHIPS.map((chip) => {
            const isActive = filterType === chip.value;
            return (
              <TouchableOpacity
                key={chip.value}
                style={[
                  styles.filterChip,
                  isActive && {
                    borderColor: chip.color,
                    backgroundColor: `${chip.color}12`,
                  },
                ]}
                onPress={() => onFilterChange(chip.value)}
                activeOpacity={0.7}
              >
                <Ionicons
                  name={chip.icon}
                  size={11}
                  color={isActive ? chip.color : TACTICAL.textMuted}
                />
                <Text
                  style={[
                    styles.filterChipText,
                    isActive && { color: chip.color },
                  ]}
                >
                  {chip.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Event count */}
        <Text style={styles.countLabel}>
          {totalCount} EVENT{totalCount !== 1 ? 'S' : ''}
        </Text>
      </View>

      {/* Timeline list */}
      <View style={styles.listContainer}>
        {loading ? (
          <View style={styles.loadingState}>
            <ActivityIndicator size="small" color={TACTICAL.amber} />
            <Text style={styles.loadingText}>LOADING EVENTS...</Text>
          </View>
        ) : events.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="document-text-outline" size={32} color={TACTICAL.textMuted} />
            <Text style={styles.emptyTitle}>
              {filterType === 'ALL' ? 'NO EVENTS YET' : `NO ${filterType} EVENTS`}
            </Text>
            <Text style={styles.emptySubtitle}>
              {filterType === 'ALL'
                ? 'Log your first event using the panel above.'
                : 'Try a different filter or log a new event.'}
            </Text>
          </View>
        ) : (
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.listContent}
          >
            {events.map((event) => (
              <EventTimelineCard key={event.id} event={event} />
            ))}
          </ScrollView>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },

  // Filter row
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 6,
  },
  filterChips: {
    gap: 6,
    flex: 1,
    paddingRight: 8,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: TACTICAL.border,
    backgroundColor: 'rgba(0,0,0,0.08)',
  },
  filterChipText: {
    fontSize: 8,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    letterSpacing: 1,
  },

  countLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    letterSpacing: 1.5,
    fontFamily: 'Courier',
    marginLeft: 4,
  },

  // List container (fixed height, internal scroll)
  listContainer: {
    flex: 1,
  },
  listContent: {
    paddingBottom: 16,
  },

  // Loading state
  loadingState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 40,
  },
  loadingText: {
    fontSize: 10,
    fontWeight: '700',
    color: TACTICAL.textMuted,
    letterSpacing: 2,
  },

  // Empty state
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 40,
  },
  emptyTitle: {
    fontSize: 12,
    fontWeight: '900',
    color: TACTICAL.textMuted,
    letterSpacing: 2,
  },
  emptySubtitle: {
    fontSize: 11,
    color: TACTICAL.textMuted,
    textAlign: 'center',
    lineHeight: 17,
    maxWidth: 240,
  },
});



