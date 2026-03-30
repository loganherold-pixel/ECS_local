/**
 * ContainerCard — Loadout 2.0 Container Tile
 *
 * Mirrors the Accessory Framework tile style:
 *   - Dark card with subtle gold border (when active)
 *   - Category-specific icon in a colored rounded square
 *   - Label text
 *   - Weight total at bottom (e.g., "42.8 lb")
 *   - Item count badge
 *   - Status chip: "ACTIVE" (green) when items present
 *   - Green checkmark when container has items
 *
 * Tapping the card opens the container detail (Part 2).
 */
import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { SafeIcon as Ionicons } from '../SafeIcon';
import { AccessoryIcon } from '../vehicle-wizard/AccessoryIcons';
import { TACTICAL } from '../../lib/theme';

// ── Props ───────────────────────────────────────────────────
export interface ContainerCardProps {
  /** Container key (snake_case, e.g., 'cab_rack') */
  containerKey: string;
  /** Human-readable label */
  label: string;
  /** Ionicons icon name */
  iconKey: string;
  /** Accent color */
  color: string;
  /** Whether this container is enabled */
  isEnabled: boolean;
  /** Total weight in lbs for this container */
  weightLbs: number;
  /** Number of items in this container */
  itemCount: number;
  /** Called when the card is tapped */
  onPress: () => void;
}

export default function ContainerCard({
  containerKey,
  label,
  iconKey,
  color,
  isEnabled,
  weightLbs,
  itemCount,
  onPress,
}: ContainerCardProps) {
  const hasItems = itemCount > 0;
  const hasWeight = weightLbs > 0;

  // Format weight display
  const formatWeight = (w: number): string => {
    if (w === 0) return '0 lb';
    if (w >= 100) return `${Math.round(w)} lb`;
    if (w >= 10) return `${w.toFixed(1)} lb`;
    return `${w.toFixed(1)} lb`;
  };

  return (
    <TouchableOpacity
      style={[
        styles.card,
        isEnabled && styles.cardEnabled,
        hasItems && { borderColor: `${color}50` },
      ]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      {/* ── Icon ──────────────────────────────────────────── */}
      <View
        style={[
          styles.iconWrap,
          isEnabled && {
            backgroundColor: `${color}18`,
            borderColor: `${color}40`,
          },
        ]}
      >
        <AccessoryIcon
          categoryId={containerKey}
          size={14}
          color={isEnabled ? color : TACTICAL.textMuted}
        />
      </View>

      {/* ── Label ─────────────────────────────────────────── */}
      <Text
        style={[
          styles.label,
          isEnabled && styles.labelEnabled,
        ]}
        numberOfLines={1}
      >
        {label}
      </Text>

      {/* ── Weight Display ────────────────────────────────── */}
      <View style={styles.weightRow}>
        <Text
          style={[
            styles.weightText,
            hasWeight && { color: TACTICAL.text },
          ]}
        >
          {formatWeight(weightLbs)}
        </Text>
        {itemCount > 0 && (
          <View style={[styles.itemCountBadge, { backgroundColor: `${color}20`, borderColor: `${color}40` }]}>
            <Text style={[styles.itemCountText, { color }]}>{itemCount}</Text>
          </View>
        )}
      </View>

      {/* ── Status Row (checkmark + ACTIVE chip) ──────────── */}
      <View style={styles.statusRow}>
        <Ionicons
          name={hasItems ? 'checkmark-circle' : 'ellipse-outline'}
          size={12}
          color={hasItems ? '#66BB6A' : 'rgba(138,138,133,0.25)'}
        />
        {isEnabled && (
          <View
            style={[
              styles.statusChip,
              hasItems && styles.statusChipActive,
            ]}
          >
            <Text
              style={[
                styles.statusText,
                hasItems && styles.statusTextActive,
              ]}
            >
              {hasItems ? 'ACTIVE' : 'EMPTY'}
            </Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}


// ═══════════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════════
const styles = StyleSheet.create({
  card: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: 'rgba(62, 79, 60, 0.25)',
    backgroundColor: TACTICAL.panel,
    gap: 3,
  },
  cardEnabled: {
    borderColor: 'rgba(196, 138, 44, 0.35)',
    backgroundColor: 'rgba(18, 24, 29, 0.98)',
  },

  // ── Icon ──────────────────────────────────────────────────
  iconWrap: {
    width: 26,
    height: 26,
    borderRadius: 7,
    backgroundColor: 'rgba(62, 79, 60, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(62, 79, 60, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── Label ─────────────────────────────────────────────────
  label: {
    fontSize: 10,
    fontWeight: '700',
    color: TACTICAL.textMuted,
    letterSpacing: 0.4,
    marginTop: 1,
  },
  labelEnabled: {
    color: TACTICAL.text,
  },

  // ── Weight ────────────────────────────────────────────────
  weightRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  weightText: {
    fontSize: 13,
    fontWeight: '900',
    fontFamily: 'Courier',
    color: 'rgba(138,138,133,0.4)',
    letterSpacing: 0.5,
  },
  itemCountBadge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  itemCountText: {
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 0.5,
  },

  // ── Status Row ────────────────────────────────────────────
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 14,
    marginTop: 1,
  },
  statusChip: {
    paddingHorizontal: 5,
    paddingVertical: 1.5,
    borderRadius: 3,
    backgroundColor: 'rgba(138,138,133,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(138,138,133,0.2)',
  },
  statusChipActive: {
    backgroundColor: 'rgba(102, 187, 106, 0.12)',
    borderColor: 'rgba(102, 187, 106, 0.3)',
  },
  statusText: {
    fontSize: 6,
    fontWeight: '900',
    color: 'rgba(138,138,133,0.5)',
    letterSpacing: 0.8,
  },
  statusTextActive: {
    color: '#66BB6A',
  },
});



