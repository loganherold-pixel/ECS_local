// ============================================================
// EXPEDITION LOG PANEL — Intel Tab Insert
// ============================================================
// Displays completed expedition log entries in clean card layout.
// Fields: startTime, endTime, duration, distance, vehicleId,
//         fuel delta, water delta, peak remoteness.
// No scoring. No gamification.
// ============================================================

import React, { useState, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView, Platform,
} from 'react-native';
import { SafeIcon as Ionicons } from '../SafeIcon';
import { TACTICAL, GOLD_RAIL } from '../../lib/theme';
import {
  expeditionStateStore,
  formatDuration,
  formatDistance,
  type ExpeditionLogEntry,
} from '../../lib/expeditionStateStore';

interface Props {
  visible: boolean;
  onClose: () => void;
}

export default function ExpeditionLogPanel({ visible, onClose }: Props) {
  const [entries, setEntries] = useState<ExpeditionLogEntry[]>([]);

  // Refresh on open
  React.useEffect(() => {
    if (visible) {
      setEntries(expeditionStateStore.getLog());
    }
  }, [visible]);

  if (!visible) return null;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.headerIconWrap}>
            <Ionicons name="flag-outline" size={14} color={TACTICAL.amber} />
          </View>
          <Text style={styles.headerTitle}>EXPEDITION LOG</Text>
        </View>
        <TouchableOpacity onPress={onClose} style={styles.closeBtn} activeOpacity={0.7}>
          <Ionicons name="close" size={16} color={TACTICAL.textMuted} />
        </TouchableOpacity>
      </View>

      <View style={styles.divider} />

      {/* Content */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {entries.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="document-text-outline" size={32} color={TACTICAL.textMuted} />
            <Text style={styles.emptyTitle}>NO EXPEDITIONS LOGGED</Text>
            <Text style={styles.emptyDesc}>
              Completed expeditions will appear here with duration, distance, and resource usage data.
            </Text>
          </View>
        ) : (
          entries.map((entry, idx) => (
            <ExpeditionLogCard key={entry.id} entry={entry} index={idx} />
          ))
        )}
      </ScrollView>
    </View>
  );
}

function ExpeditionLogCard({ entry, index }: { entry: ExpeditionLogEntry; index: number }) {
  const startDate = new Date(entry.startTime);
  const endDate = new Date(entry.endTime);

  const dateStr = startDate.toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
  const startTimeStr = startDate.toLocaleTimeString('en-US', {
    hour: '2-digit', minute: '2-digit', hour12: true,
  });
  const endTimeStr = endDate.toLocaleTimeString('en-US', {
    hour: '2-digit', minute: '2-digit', hour12: true,
  });

  return (
    <View style={styles.card}>
      {/* Card Header */}
      <View style={styles.cardHeader}>
        <View style={styles.cardHeaderLeft}>
          <Ionicons name="car-outline" size={14} color={TACTICAL.amber} />
          <Text style={styles.cardVehicle} numberOfLines={1}>{entry.vehicleName}</Text>
        </View>
        <Text style={styles.cardDate}>{dateStr}</Text>
      </View>

      <View style={styles.cardDivider} />

      {/* Time Row */}
      <View style={styles.timeRow}>
        <Text style={styles.timeLabel}>START</Text>
        <Text style={styles.timeValue}>{startTimeStr}</Text>
        <View style={styles.timeSep}>
          <Ionicons name="arrow-forward" size={10} color={TACTICAL.textMuted} />
        </View>
        <Text style={styles.timeLabel}>END</Text>
        <Text style={styles.timeValue}>{endTimeStr}</Text>
      </View>

      {/* Stats Row */}
      <View style={styles.statsRow}>
        <StatChip
          icon="time-outline"
          value={formatDuration(entry.duration)}
          label="DURATION"
        />
        <StatChip
          icon="navigate-outline"
          value={formatDistance(entry.distance)}
          label="DISTANCE"
        />
        {entry.fuelDelta != null && (
          <StatChip
            icon="flame-outline"
            value={`${entry.fuelDelta.toFixed(1)} gal`}
            label="FUEL"
          />
        )}
        {entry.waterDelta != null && (
          <StatChip
            icon="water-outline"
            value={`${entry.waterDelta.toFixed(1)} gal`}
            label="WATER"
          />
        )}
        {entry.peakRemoteness != null && (
          <StatChip
            icon="compass-outline"
            value={`${entry.peakRemoteness.toFixed(0)}`}
            label="REMOTENESS"
          />
        )}
      </View>
    </View>
  );
}

function StatChip({ icon, value, label }: { icon: string; value: string; label: string }) {
  return (
    <View style={styles.statChip}>
      <Ionicons name={icon as any} size={10} color={TACTICAL.textMuted} />
      <Text style={styles.statChipValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: TACTICAL.bg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 7,
    backgroundColor: 'rgba(212,160,23,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(212,160,23,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 12,
    fontWeight: '900',
    color: TACTICAL.amber,
    letterSpacing: 2,
  },
  closeBtn: {
    width: 28,
    height: 28,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(62,79,60,0.15)',
  },
  divider: {
    height: GOLD_RAIL.subsectionWidth,
    backgroundColor: GOLD_RAIL.subsection,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 100,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
    gap: 8,
  },
  emptyTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    letterSpacing: 1,
  },
  emptyDesc: {
    fontSize: 11,
    color: TACTICAL.textMuted,
    textAlign: 'center',
    lineHeight: 16,
    maxWidth: 260,
  },
  card: {
    backgroundColor: TACTICAL.panel,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(62,79,60,0.25)',
    padding: 12,
    marginBottom: 10,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  cardVehicle: {
    fontSize: 13,
    fontWeight: '800',
    color: TACTICAL.text,
    letterSpacing: 0.3,
    flex: 1,
  },
  cardDate: {
    fontSize: 10,
    fontWeight: '600',
    color: TACTICAL.textMuted,
    letterSpacing: 0.5,
  },
  cardDivider: {
    height: 1,
    backgroundColor: 'rgba(62,79,60,0.12)',
    marginVertical: 8,
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  timeLabel: {
    fontSize: 7,
    fontWeight: '700',
    color: TACTICAL.textMuted,
    letterSpacing: 1,
  },
  timeValue: {
    fontSize: 11,
    fontWeight: '700',
    color: TACTICAL.text,
    fontFamily: 'Courier',
  },
  timeSep: {
    marginHorizontal: 4,
  },
  statsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  statChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: 'rgba(62,79,60,0.12)',
    borderRadius: 6,
  },
  statChipValue: {
    fontSize: 9,
    fontWeight: '700',
    color: TACTICAL.textMuted,
    letterSpacing: 0.3,
  },
});



