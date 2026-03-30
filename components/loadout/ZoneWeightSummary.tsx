// ============================================================
// ZONE WEIGHT SUMMARY — Per-Container Weight Distribution
// ============================================================
// Displays a compact horizontal stacked bar chart + pill row
// showing the total weight of items assigned to each container
// zone. Uses containerZone color coding for each segment.
//
// Placed below the zone filter bar in the Loadout Editor to
// help users understand weight distribution across their
// vehicle's accessory framework before setting the loadout
// to ready.
// ============================================================

import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';

import { SafeIcon as Ionicons } from '../SafeIcon';
import { TACTICAL } from '../../lib/theme';
import type { LoadoutItem } from '../../lib/types';
import type { ContainerZone } from '../../lib/accessoryFramework';
import { matchStorageLocationToZone } from '../../lib/containerZoneLoader';

// ── Types ────────────────────────────────────────────────────

interface ZoneWeightEntry {
  /** Zone ID or '_unassigned' */
  id: string;
  /** Display label */
  label: string;
  /** Zone accent color */
  color: string;
  /** Ionicons icon name */
  icon: string;
  /** Total weight in lbs for this zone */
  weightLbs: number;
  /** Number of items in this zone */
  itemCount: number;
  /** Percentage of total weight */
  pct: number;
}

interface ZoneWeightSummaryProps {
  items: LoadoutItem[];
  containerZones: ContainerZone[];
  /** Optional: callback when a zone pill is tapped (e.g. to filter) */
  onZoneTap?: (zoneId: string) => void;
  /** Currently selected zone filter (highlights matching pill) */
  activeZoneFilter?: string;
}

// ── Component ────────────────────────────────────────────────

export default function ZoneWeightSummary({
  items,
  containerZones,
  onZoneTap,
  activeZoneFilter,
}: ZoneWeightSummaryProps) {
  // ── Compute weight breakdown ─────────────────────────────
  const { entries, totalWeight, hasAnyWeight } = useMemo(() => {
    // Accumulate weight per zone
    const zoneWeights: Record<string, { weightLbs: number; itemCount: number }> = {};

    // Initialize all container zones
    for (const zone of containerZones) {
      zoneWeights[zone.id] = { weightLbs: 0, itemCount: 0 };
    }
    zoneWeights['_unassigned'] = { weightLbs: 0, itemCount: 0 };

    // Assign items to zones
    for (const item of items) {
      const itemWeight = (item.weight_lbs || 0) * (item.quantity || 1);
      const matched = item.storage_location
        ? matchStorageLocationToZone(containerZones, item.storage_location)
        : undefined;

      const zoneId = matched ? matched.id : '_unassigned';

      if (!zoneWeights[zoneId]) {
        zoneWeights[zoneId] = { weightLbs: 0, itemCount: 0 };
      }
      zoneWeights[zoneId].weightLbs += itemWeight;
      zoneWeights[zoneId].itemCount += 1;
    }

    // Calculate total weight
    let total = 0;
    for (const val of Object.values(zoneWeights)) {
      total += val.weightLbs;
    }

    // Build sorted entries (container zones first, then unassigned)
    const result: ZoneWeightEntry[] = [];

    for (const zone of containerZones) {
      const data = zoneWeights[zone.id];
      if (data && (data.weightLbs > 0 || data.itemCount > 0)) {
        result.push({
          id: zone.id,
          label: zone.label,
          color: zone.color || TACTICAL.amber,
          icon: zone.icon || 'cube-outline',
          weightLbs: data.weightLbs,
          itemCount: data.itemCount,
          pct: total > 0 ? (data.weightLbs / total) * 100 : 0,
        });
      }
    }

    // Unassigned
    const unassigned = zoneWeights['_unassigned'];
    if (unassigned && (unassigned.weightLbs > 0 || unassigned.itemCount > 0)) {
      result.push({
        id: '_unassigned',
        label: 'Unassigned',
        color: TACTICAL.textMuted,
        icon: 'help-circle-outline',
        weightLbs: unassigned.weightLbs,
        itemCount: unassigned.itemCount,
        pct: total > 0 ? (unassigned.weightLbs / total) * 100 : 0,
      });
    }

    return {
      entries: result,
      totalWeight: total,
      hasAnyWeight: total > 0,
    };
  }, [items, containerZones]);

  // Don't render if no container zones or no items
  if (containerZones.length === 0 || items.length === 0) return null;

  // ── Format weight ──────────────────────────────────────────
  const fmtWeight = (lbs: number): string => {
    if (lbs === 0) return '0 lbs';
    if (lbs < 1) return `${(lbs * 16).toFixed(0)} oz`;
    if (lbs >= 1000) return `${(lbs / 1000).toFixed(1)}k lbs`;
    return `${lbs % 1 === 0 ? lbs.toFixed(0) : lbs.toFixed(1)} lbs`;
  };

  return (
    <View style={styles.container}>
      {/* ── Header Row ──────────────────────────────────────── */}
      <View style={styles.headerRow}>
        <View style={styles.headerLeft}>
          <Ionicons name="scale-outline" size={12} color={TACTICAL.amber} />
          <Text style={styles.headerLabel}>WEIGHT BY ZONE</Text>
        </View>
        <Text style={styles.totalWeight}>
          {fmtWeight(totalWeight)} TOTAL
        </Text>
      </View>

      {/* ── Stacked Bar Chart ───────────────────────────────── */}
      {hasAnyWeight && (
        <View style={styles.barContainer}>
          <View style={styles.barTrack}>
            {entries.map((entry, idx) => {
              if (entry.pct <= 0) return null;
              // Minimum visible width for very small segments
              const minWidth = entry.pct > 0 && entry.pct < 2 ? 2 : 0;
              return (
                <View
                  key={entry.id}
                  style={[
                    styles.barSegment,
                    {
                      backgroundColor: entry.color,
                      width: `${Math.max(entry.pct, minWidth ? 1.5 : entry.pct)}%`,
                      // Rounded corners on first/last segments
                      borderTopLeftRadius: idx === 0 ? 4 : 0,
                      borderBottomLeftRadius: idx === 0 ? 4 : 0,
                      borderTopRightRadius: idx === entries.length - 1 ? 4 : 0,
                      borderBottomRightRadius: idx === entries.length - 1 ? 4 : 0,
                    },
                  ]}
                />
              );
            })}
          </View>
        </View>
      )}

      {/* ── Zone Weight Pills ───────────────────────────────── */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.pillScroll}
      >
        {entries.map((entry) => {
          const isActive = activeZoneFilter === entry.id;
          const hasWeight = entry.weightLbs > 0;
          return (
            <TouchableOpacity
              key={entry.id}
              style={[
                styles.pill,
                { borderColor: `${entry.color}40` },
                isActive && { borderColor: entry.color, backgroundColor: `${entry.color}14` },
              ]}
              onPress={() => onZoneTap?.(entry.id)}
              activeOpacity={0.7}
              disabled={!onZoneTap}
            >
              {/* Color dot */}
              <View style={[styles.pillDot, { backgroundColor: entry.color }]} />

              {/* Zone label */}
              <Text
                style={[
                  styles.pillLabel,
                  isActive && { color: entry.color },
                ]}
                numberOfLines={1}
              >
                {entry.label}
              </Text>

              {/* Weight value */}
              <Text
                style={[
                  styles.pillWeight,
                  hasWeight && { color: entry.color },
                ]}
              >
                {fmtWeight(entry.weightLbs)}
              </Text>

              {/* Percentage badge (only if has weight) */}
              {hasWeight && totalWeight > 0 && (
                <View style={[styles.pctBadge, { backgroundColor: `${entry.color}18` }]}>
                  <Text style={[styles.pctText, { color: entry.color }]}>
                    {entry.pct < 1 ? '<1' : Math.round(entry.pct)}%
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* ── Items without weight warning ────────────────────── */}
      {(() => {
        const noWeightCount = items.filter(i => !i.weight_lbs || i.weight_lbs <= 0).length;
        if (noWeightCount === 0) return null;
        return (
          <View style={styles.warningRow}>
            <Ionicons name="information-circle-outline" size={11} color={TACTICAL.textMuted} />
            <Text style={styles.warningText}>
              {noWeightCount} item{noWeightCount !== 1 ? 's' : ''} without weight data
            </Text>
          </View>
        );
      })()}
    </View>
  );
}

// ── Styles ───────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    marginBottom: 12,
    backgroundColor: TACTICAL.panel,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: TACTICAL.border,
    padding: 10,
  },

  // ── Header ─────────────────────────────────────────────────
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  headerLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: TACTICAL.amber,
    letterSpacing: 1.5,
  },
  totalWeight: {
    fontSize: 10,
    fontWeight: '900',
    color: TACTICAL.text,
    letterSpacing: 0.5,
    fontFamily: 'Courier',
  },

  // ── Stacked Bar ────────────────────────────────────────────
  barContainer: {
    marginBottom: 8,
  },
  barTrack: {
    flexDirection: 'row',
    height: 8,
    backgroundColor: 'rgba(30,35,43,0.6)',
    borderRadius: 4,
    overflow: 'hidden',
  },
  barSegment: {
    height: '100%',
  },

  // ── Pills ──────────────────────────────────────────────────
  pillScroll: {
    gap: 6,
    paddingRight: 4,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: TACTICAL.border,
    backgroundColor: TACTICAL.bg,
  },
  pillDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  pillLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: TACTICAL.textMuted,
    letterSpacing: 0.3,
    maxWidth: 90,
  },
  pillWeight: {
    fontSize: 10,
    fontWeight: '900',
    color: TACTICAL.textMuted,
    fontFamily: 'Courier',
    letterSpacing: 0.3,
  },
  pctBadge: {
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 3,
  },
  pctText: {
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 0.5,
  },

  // ── Warning ────────────────────────────────────────────────
  warningRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 6,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: 'rgba(30,35,43,0.5)',
  },
  warningText: {
    fontSize: 9,
    fontWeight: '600',
    color: TACTICAL.textMuted,
    letterSpacing: 0.3,
  },
});



