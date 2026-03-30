/**
 * TripSummaryPanel — Expedition trip summary display
 *
 * Shows:
 *   - Trip name and dates
 *   - Key stats: distance, duration, speed, elevation
 *   - Resource usage (fuel, water, power deltas)
 *   - Timeline event summary
 *   - Route point count
 */

import React, { useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeIcon as Ionicons } from '../../components/SafeIcon';
import { TACTICAL } from '../../lib/theme';
import { formatDuration, formatDistance, formatSpeed, formatElevation, formatBytes } from '../../lib/tripRecorderEngine';
import type { TripRecord, TripSummary } from '../../lib/tripRecorderTypes';
import { TRIP_EVENT_META } from '../../lib/tripRecorderTypes';

interface Props {
  trip: TripRecord | TripSummary;
  /** Show full detail or compact card */
  mode?: 'full' | 'card';
  /** Called when user taps "View Timeline" */
  onViewTimeline?: () => void;
  /** Called when user taps "View Route" */
  onViewRoute?: () => void;
}

export default function TripSummaryPanel({ trip, mode = 'card', onViewTimeline, onViewRoute }: Props) {
  const isFullTrip = 'routePoints' in trip;

  const startDate = useMemo(() => {
    return new Date(trip.startedAt).toLocaleDateString('en-US', {
      weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
    });
  }, [trip.startedAt]);

  const startTime = useMemo(() => {
    return new Date(trip.startedAt).toLocaleTimeString('en-US', {
      hour: '2-digit', minute: '2-digit',
    });
  }, [trip.startedAt]);

  const endTime = useMemo(() => {
    if (!trip.endedAt) return '--';
    return new Date(trip.endedAt).toLocaleTimeString('en-US', {
      hour: '2-digit', minute: '2-digit',
    });
  }, [trip.endedAt]);

  // Resource deltas (only for full trip records)
  const resourceDeltas = useMemo(() => {
    if (!isFullTrip) return null;
    const full = trip as TripRecord;
    if (!full.startResources || !full.endResources) return null;

    const deltas: { label: string; icon: string; color: string; start: string; end: string; delta: string }[] = [];

    if (full.startResources.fuelPercent != null && full.endResources.fuelPercent != null) {
      const d = full.endResources.fuelPercent - full.startResources.fuelPercent;
      deltas.push({
        label: 'FUEL',
        icon: 'flame-outline',
        color: '#FF9800',
        start: `${full.startResources.fuelPercent}%`,
        end: `${full.endResources.fuelPercent}%`,
        delta: `${d > 0 ? '+' : ''}${d}%`,
      });
    }

    if (full.startResources.waterPercent != null && full.endResources.waterPercent != null) {
      const d = full.endResources.waterPercent - full.startResources.waterPercent;
      deltas.push({
        label: 'WATER',
        icon: 'water-outline',
        color: '#4FC3F7',
        start: `${full.startResources.waterPercent}%`,
        end: `${full.endResources.waterPercent}%`,
        delta: `${d > 0 ? '+' : ''}${d}%`,
      });
    }

    if (full.startResources.batteryPercent != null && full.endResources.batteryPercent != null) {
      const d = full.endResources.batteryPercent - full.startResources.batteryPercent;
      deltas.push({
        label: 'POWER',
        icon: 'battery-charging-outline',
        color: '#66BB6A',
        start: `${full.startResources.batteryPercent}%`,
        end: `${full.endResources.batteryPercent}%`,
        delta: `${d > 0 ? '+' : ''}${d}%`,
      });
    }

    return deltas.length > 0 ? deltas : null;
  }, [trip, isFullTrip]);

  // Event type counts
  const eventCounts = useMemo(() => {
    if (!isFullTrip) return null;
    const full = trip as TripRecord;
    const counts: Record<string, number> = {};
    for (const ev of full.events) {
      counts[ev.type] = (counts[ev.type] || 0) + 1;
    }
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6);
  }, [trip, isFullTrip]);

  // ── Card Mode ──────────────────────────────────────────────
  if (mode === 'card') {
    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={styles.cardHeaderLeft}>
            <Text style={styles.cardName} numberOfLines={1}>{trip.name}</Text>
            <Text style={styles.cardDate}>{startDate}</Text>
          </View>
          {trip.vehicleName && (
            <View style={styles.vehicleBadge}>
              <Ionicons name="car-sport-outline" size={10} color={TACTICAL.amber} />
              <Text style={styles.vehicleText}>{trip.vehicleName}</Text>
            </View>
          )}
        </View>

        <View style={styles.cardStats}>
          <StatChip icon="map-outline" value={formatDistance(trip.distanceMi)} label="DIST" color="#66BB6A" />
          <StatChip icon="time-outline" value={formatDuration(trip.durationSec)} label="TIME" color="#42A5F5" />
          <StatChip icon="speedometer-outline" value={`${trip.avgSpeedMph}`} label="AVG MPH" color="#FFB74D" />
          {trip.elevationGainFt > 0 && (
            <StatChip icon="trending-up-outline" value={formatElevation(trip.elevationGainFt)} label="GAIN" color="#78909C" />
          )}
        </View>

        <View style={styles.cardFooter}>
          <Text style={styles.cardFooterText}>
            {'eventCount' in trip ? trip.eventCount : (trip as TripRecord).events.length} events
            {'routePointCount' in trip
              ? ` — ${trip.routePointCount} pts`
              : ` — ${(trip as TripRecord).routePoints.length} pts`}
          </Text>
          {trip.peakRemoteness != null && (
            <View style={styles.remotenessBadge}>
              <Ionicons name="globe-outline" size={9} color="#FF9800" />
              <Text style={styles.remotenessText}>R{Math.round(trip.peakRemoteness)}</Text>
            </View>
          )}
          {!trip.cloudSynced && (
            <View style={styles.offlineBadge}>
              <Ionicons name="cloud-offline-outline" size={9} color={TACTICAL.textMuted} />
              <Text style={styles.offlineText}>LOCAL</Text>
            </View>
          )}
        </View>
      </View>
    );
  }

  // ── Full Mode ──────────────────────────────────────────────
  return (
    <ScrollView style={styles.fullContainer} showsVerticalScrollIndicator={false}>
      {/* Header */}
      <View style={styles.fullHeader}>
        <Text style={styles.fullName}>{trip.name}</Text>
        <Text style={styles.fullDate}>{startDate} — {startTime} to {endTime}</Text>
        {trip.vehicleName && (
          <View style={[styles.vehicleBadge, { marginTop: 6 }]}>
            <Ionicons name="car-sport-outline" size={11} color={TACTICAL.amber} />
            <Text style={styles.vehicleText}>{trip.vehicleName}</Text>
          </View>
        )}
      </View>

      {/* Primary Stats */}
      <Text style={styles.sectionLabel}>TRIP STATISTICS</Text>
      <View style={styles.statsGrid}>
        <StatBlock icon="map-outline" value={formatDistance(trip.distanceMi)} label="Total Distance" color="#66BB6A" />
        <StatBlock icon="time-outline" value={formatDuration(trip.durationSec)} label="Active Duration" color="#42A5F5" />
        <StatBlock icon="speedometer-outline" value={formatSpeed(trip.avgSpeedMph)} label="Average Speed" color="#FFB74D" />
        <StatBlock icon="flash-outline" value={formatSpeed(trip.maxSpeedMph)} label="Max Speed" color="#FF9800" />
        {trip.maxAltitudeFt != null && (
          <StatBlock icon="arrow-up-outline" value={formatElevation(trip.maxAltitudeFt)} label="Max Elevation" color="#78909C" />
        )}
        {trip.elevationGainFt > 0 && (
          <StatBlock icon="trending-up-outline" value={formatElevation(trip.elevationGainFt)} label="Elevation Gain" color="#66BB6A" />
        )}
        {trip.peakRemoteness != null && (
          <StatBlock icon="globe-outline" value={`${Math.round(trip.peakRemoteness)}`} label="Peak Remoteness" color="#FF9800" />
        )}
        {'routePointCount' in trip ? (
          <StatBlock icon="location-outline" value={`${trip.routePointCount}`} label="Route Points" color="#8B949E" />
        ) : (
          <StatBlock icon="location-outline" value={`${(trip as TripRecord).routePoints.length}`} label="Route Points" color="#8B949E" />
        )}
      </View>

      {/* Resource Changes */}
      {resourceDeltas && (
        <>
          <Text style={styles.sectionLabel}>RESOURCE USAGE</Text>
          <View style={styles.resourceGrid}>
            {resourceDeltas.map(r => (
              <View key={r.label} style={styles.resourceCard}>
                <View style={styles.resourceHeader}>
                  <Ionicons name={r.icon as any} size={14} color={r.color} />
                  <Text style={[styles.resourceLabel, { color: r.color }]}>{r.label}</Text>
                </View>
                <View style={styles.resourceValues}>
                  <Text style={styles.resourceStart}>{r.start}</Text>
                  <Ionicons name="arrow-forward-outline" size={10} color={TACTICAL.textMuted} />
                  <Text style={styles.resourceEnd}>{r.end}</Text>
                </View>
                <Text style={[
                  styles.resourceDelta,
                  { color: r.delta.startsWith('-') ? '#EF5350' : '#66BB6A' },
                ]}>
                  {r.delta}
                </Text>
              </View>
            ))}
          </View>
        </>
      )}

      {/* Event Summary */}
      {eventCounts && eventCounts.length > 0 && (
        <>
          <Text style={styles.sectionLabel}>EVENT SUMMARY</Text>
          <View style={styles.eventGrid}>
            {eventCounts.map(([type, count]) => {
              const meta = TRIP_EVENT_META[type as keyof typeof TRIP_EVENT_META];
              if (!meta) return null;
              return (
                <View key={type} style={styles.eventChip}>
                  <Ionicons name={meta.icon as any} size={12} color={meta.color} />
                  <Text style={styles.eventChipText}>{meta.label}</Text>
                  <Text style={[styles.eventChipCount, { color: meta.color }]}>{count}</Text>
                </View>
              );
            })}
          </View>
        </>
      )}

      {/* Notes */}
      {trip.notes ? (
        <>
          <Text style={styles.sectionLabel}>NOTES</Text>
          <Text style={styles.notesText}>{trip.notes}</Text>
        </>
      ) : null}

      {/* Action Buttons */}
      <View style={styles.actionRow}>
        {onViewTimeline && (
          <TouchableOpacity style={styles.actionBtn} onPress={onViewTimeline} activeOpacity={0.7}>
            <Ionicons name="list-outline" size={14} color={TACTICAL.amber} />
            <Text style={styles.actionBtnText}>VIEW TIMELINE</Text>
          </TouchableOpacity>
        )}
        {onViewRoute && (
          <TouchableOpacity style={styles.actionBtn} onPress={onViewRoute} activeOpacity={0.7}>
            <Ionicons name="map-outline" size={14} color={TACTICAL.amber} />
            <Text style={styles.actionBtnText}>VIEW ROUTE</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Storage info */}
      <Text style={styles.storageText}>
        Storage: {formatBytes(trip.storageBytes)} — {trip.cloudSynced ? 'Synced' : 'Local only'}
      </Text>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

// ── Sub-components ───────────────────────────────────────────

function StatChip({ icon, value, label, color }: { icon: string; value: string; label: string; color: string }) {
  return (
    <View style={styles.statChip}>
      <Ionicons name={icon as any} size={10} color={color} />
      <Text style={[styles.statChipValue, { color }]}>{value}</Text>
      <Text style={styles.statChipLabel}>{label}</Text>
    </View>
  );
}

function StatBlock({ icon, value, label, color }: { icon: string; value: string; label: string; color: string }) {
  return (
    <View style={styles.statBlock}>
      <Ionicons name={icon as any} size={16} color={color} />
      <Text style={styles.statBlockValue}>{value}</Text>
      <Text style={styles.statBlockLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  // Card Mode
  card: {
    backgroundColor: 'rgba(0,0,0,0.15)',
    borderWidth: 1,
    borderColor: TACTICAL.border,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  cardHeaderLeft: { flex: 1 },
  cardName: {
    fontSize: 14,
    fontWeight: '800',
    color: TACTICAL.text,
    letterSpacing: 0.3,
  },
  cardDate: {
    fontSize: 10,
    color: TACTICAL.textMuted,
    marginTop: 2,
  },
  vehicleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: 'rgba(212,160,23,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(212,160,23,0.2)',
  },
  vehicleText: {
    fontSize: 9,
    fontWeight: '700',
    color: TACTICAL.amber,
    letterSpacing: 0.5,
  },
  cardStats: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 8,
  },
  statChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: 'rgba(0,0,0,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(30,35,43,0.5)',
  },
  statChipValue: {
    fontSize: 11,
    fontWeight: '800',
    fontFamily: 'Courier',
    letterSpacing: 0.3,
  },
  statChipLabel: {
    fontSize: 7,
    fontWeight: '700',
    color: TACTICAL.textMuted,
    letterSpacing: 0.5,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cardFooterText: {
    fontSize: 10,
    color: TACTICAL.textMuted,
    flex: 1,
  },
  remotenessBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
    backgroundColor: 'rgba(255,152,0,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,152,0,0.2)',
  },
  remotenessText: {
    fontSize: 8,
    fontWeight: '800',
    color: '#FF9800',
  },
  offlineBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
    backgroundColor: 'rgba(0,0,0,0.15)',
    borderWidth: 1,
    borderColor: TACTICAL.border,
  },
  offlineText: {
    fontSize: 8,
    fontWeight: '700',
    color: TACTICAL.textMuted,
  },

  // Full Mode
  fullContainer: {
    flex: 1,
    padding: 16,
  },
  fullHeader: {
    marginBottom: 16,
  },
  fullName: {
    fontSize: 20,
    fontWeight: '900',
    color: TACTICAL.text,
    letterSpacing: 0.5,
  },
  fullDate: {
    fontSize: 12,
    color: TACTICAL.textMuted,
    marginTop: 4,
    fontFamily: 'Courier',
  },
  sectionLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: TACTICAL.amber,
    letterSpacing: 2.5,
    marginBottom: 10,
    marginTop: 16,
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(212,160,23,0.15)',
  },

  // Stats Grid
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  statBlock: {
    width: '47%',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(30,35,43,0.5)',
    gap: 4,
  },
  statBlockValue: {
    fontSize: 18,
    fontWeight: '900',
    color: TACTICAL.text,
    fontFamily: 'Courier',
    letterSpacing: 0.5,
  },
  statBlockLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: TACTICAL.textMuted,
    letterSpacing: 0.5,
    textAlign: 'center',
  },

  // Resource Grid
  resourceGrid: {
    flexDirection: 'row',
    gap: 8,
  },
  resourceCard: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 6,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(30,35,43,0.5)',
    gap: 4,
  },
  resourceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  resourceLabel: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1,
  },
  resourceValues: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  resourceStart: {
    fontSize: 11,
    fontWeight: '700',
    color: TACTICAL.textMuted,
    fontFamily: 'Courier',
  },
  resourceEnd: {
    fontSize: 11,
    fontWeight: '700',
    color: TACTICAL.text,
    fontFamily: 'Courier',
  },
  resourceDelta: {
    fontSize: 13,
    fontWeight: '900',
    fontFamily: 'Courier',
  },

  // Event Grid
  eventGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  eventChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: 'rgba(0,0,0,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(30,35,43,0.5)',
  },
  eventChipText: {
    fontSize: 9,
    fontWeight: '700',
    color: TACTICAL.textMuted,
    letterSpacing: 0.5,
  },
  eventChipCount: {
    fontSize: 11,
    fontWeight: '900',
    fontFamily: 'Courier',
  },

  // Notes
  notesText: {
    fontSize: 13,
    color: TACTICAL.text,
    lineHeight: 20,
  },

  // Actions
  actionRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 16,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: 'rgba(212,160,23,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(212,160,23,0.25)',
  },
  actionBtnText: {
    fontSize: 10,
    fontWeight: '800',
    color: TACTICAL.amber,
    letterSpacing: 1.5,
  },

  // Storage
  storageText: {
    fontSize: 10,
    color: TACTICAL.textMuted,
    textAlign: 'center',
    marginTop: 12,
  },
});



