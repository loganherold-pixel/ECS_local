/**
 * ContainerGrid — 2-Column Container Card Grid
 *
 * Renders the Loadout 2.0 container cards in a 2-column grid
 * matching the Accessory Framework layout.
 *
 * Features:
 *   - 2-column grid with consistent gap spacing
 *   - Handles odd number of containers (last row single card)
 *   - Computes weight + item count per container from LoadoutItems
 *   - Unassigned items summary row at bottom
 *   - Total weight summary bar
 */
import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
} from 'react-native';
import { SafeIcon as Ionicons } from '../SafeIcon';
import { TACTICAL } from '../../lib/theme';
import ContainerCard from './ContainerCard';
import type { ContainerZone } from '../../lib/accessoryFramework';
import type { LoadoutItem } from '../../lib/types';
import {
  getContainerWeight,
  getContainerItemCount,
  getTotalLoadoutWeight,
  getUnassignedItemCount,
  getUnassignedWeight,
} from '../../lib/loadout2Types';

// ── Props ───────────────────────────────────────────────────
export interface ContainerGridProps {
  /** Container zones from the vehicle's accessory framework */
  containerZones: ContainerZone[];
  /** All loadout items for this loadout */
  items: LoadoutItem[];
  /** Called when a container card is tapped */
  onContainerPress: (containerKey: string) => void;
  /** Grid column count for compact overview layouts */
  columns?: number;
}

// ── Grid Constants ──────────────────────────────────────────
const GRID_GAP = 6;

export default function ContainerGrid({
  containerZones,
  items,
  onContainerPress,
  columns = 2,
}: ContainerGridProps) {
  // ── Compute per-container stats ────────────────────────────
  const containerStats = useMemo(() => {
    const stats: Record<string, { weight: number; count: number }> = {};
    for (const zone of containerZones) {
      stats[zone.id] = {
        weight: getContainerWeight(items, containerZones, zone.id),
        count: getContainerItemCount(items, containerZones, zone.id),
      };
    }
    return stats;
  }, [containerZones, items]);

  // ── Compute totals ─────────────────────────────────────────
  const totalWeight = useMemo(() => getTotalLoadoutWeight(items), [items]);
  const unassignedCount = useMemo(() => getUnassignedItemCount(items, containerZones), [items, containerZones]);
  const unassignedWeight = useMemo(() => getUnassignedWeight(items, containerZones), [items, containerZones]);

  // ── Build 2-column grid rows ──────────────────────────────
  const rows: ContainerZone[][] = [];
  for (let i = 0; i < containerZones.length; i += columns) {
    rows.push(containerZones.slice(i, i + columns));
  }

  return (
    <View style={styles.container}>
      {/* ── Container Grid ────────────────────────────────── */}
      {rows.map((row, rowIdx) => (
        <View key={rowIdx} style={styles.gridRow}>
          {row.map((zone) => {
            const stat = containerStats[zone.id] || { weight: 0, count: 0 };
            return (
              <ContainerCard
                key={zone.id}
                containerKey={zone.id}
                label={zone.label}
                iconKey={zone.icon}
                color={zone.color}
                isEnabled={true}
                weightLbs={stat.weight}
                itemCount={stat.count}
                onPress={() => onContainerPress(zone.id)}
                compact={columns >= 3}
              />
            );
          })}
          {Array.from({ length: Math.max(0, columns - row.length) }).map((_, fillerIndex) => (
            <View key={`filler-${rowIdx}-${fillerIndex}`} style={{ flex: 1 }} />
          ))}
        </View>
      ))}

      {/* ── Unassigned Items Row ──────────────────────────── */}
      {unassignedCount > 0 && (
        <View style={styles.unassignedRow}>
          <View style={styles.unassignedLeft}>
            <Ionicons name="help-circle-outline" size={14} color={TACTICAL.textMuted} />
            <Text style={styles.unassignedLabel}>
              UNASSIGNED
            </Text>
          </View>
          <View style={styles.unassignedRight}>
            <Text style={styles.unassignedCount}>{unassignedCount} item{unassignedCount !== 1 ? 's' : ''}</Text>
            {unassignedWeight > 0 && (
              <Text style={styles.unassignedWeight}>{unassignedWeight.toFixed(1)} lb</Text>
            )}
          </View>
        </View>
      )}

      {/* ── Total Weight Summary ──────────────────────────── */}
      <View style={styles.totalBar}>
        <View style={styles.totalLeft}>
          <Ionicons name="scale-outline" size={14} color={TACTICAL.amber} />
          <Text style={styles.totalLabel}>TOTAL LOADOUT</Text>
        </View>
        <View style={styles.totalRight}>
          <Text style={styles.totalItems}>{items.length} item{items.length !== 1 ? 's' : ''}</Text>
          <Text style={styles.totalWeight}>
            {totalWeight > 0 ? `${totalWeight >= 100 ? Math.round(totalWeight) : totalWeight.toFixed(1)} lb` : '0 lb'}
          </Text>
        </View>
      </View>
    </View>
  );
}


// ═══════════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════════
const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 8,
    paddingTop: 2,
    paddingBottom: 2,
    gap: GRID_GAP,
  },
  gridRow: {
    flexDirection: 'row',
    gap: GRID_GAP,
  },

  // ── Unassigned Row ────────────────────────────────────────
  unassignedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(138,138,133,0.15)',
    borderStyle: 'dashed',
    backgroundColor: 'rgba(138,138,133,0.04)',
    marginTop: 2,
  },
  unassignedLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  unassignedLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    letterSpacing: 1,
  },
  unassignedRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  unassignedCount: {
    fontSize: 10,
    fontWeight: '600',
    color: TACTICAL.textMuted,
  },
  unassignedWeight: {
    fontSize: 11,
    fontWeight: '800',
    fontFamily: 'Courier',
    color: TACTICAL.textMuted,
  },

  // ── Total Bar ─────────────────────────────────────────────
  totalBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(196, 138, 44, 0.25)',
    backgroundColor: 'rgba(196, 138, 44, 0.06)',
    marginTop: 4,
  },
  totalLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  totalLabel: {
    fontSize: 10,
    fontWeight: '900',
    color: TACTICAL.amber,
    letterSpacing: 1.5,
  },
  totalRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  totalItems: {
    fontSize: 10,
    fontWeight: '600',
    color: TACTICAL.textMuted,
  },
  totalWeight: {
    fontSize: 14,
    fontWeight: '900',
    fontFamily: 'Courier',
    color: TACTICAL.text,
    letterSpacing: 0.5,
  },
});



