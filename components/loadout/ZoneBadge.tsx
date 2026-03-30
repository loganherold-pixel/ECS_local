/**
 * ZoneBadge — Small container zone indicator for loadout items.
 *
 * PHASE 3: Displays the assigned container zone under each loadout item
 * with the zone's icon, label, and accent color.
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SafeIcon as Ionicons } from '../SafeIcon';
import { TACTICAL } from '../../lib/theme';
import type { ContainerZone } from '../../lib/accessoryFramework';

interface ZoneBadgeProps {
  zone: ContainerZone | null;
  /** Fallback text when no zone match (shows raw storage_location) */
  fallbackText?: string | null;
  /** Compact mode — smaller badge */
  compact?: boolean;
}

export default function ZoneBadge({ zone, fallbackText, compact = false }: ZoneBadgeProps) {
  if (!zone && !fallbackText) return null;

  if (!zone && fallbackText) {
    // Show fallback with muted styling
    return (
      <View style={[styles.badge, styles.badgeFallback, compact && styles.badgeCompact]}>
        <Ionicons name="location-outline" size={compact ? 8 : 10} color={TACTICAL.textMuted} />
        <Text style={[styles.text, styles.textFallback, compact && styles.textCompact]} numberOfLines={1}>
          {fallbackText}
        </Text>
      </View>
    );
  }

  if (!zone) return null;

  const color = zone.color || TACTICAL.amber;
  const isPlanned = zone.status === 'planned';

  return (
    <View style={[
      styles.badge,
      { borderColor: `${color}40`, backgroundColor: `${color}10` },
      isPlanned && styles.badgePlanned,
      compact && styles.badgeCompact,
    ]}>
      <Ionicons
        name={(zone.icon || 'cube-outline') as any}
        size={compact ? 8 : 10}
        color={color}
      />
      <Text
        style={[
          styles.text,
          { color },
          compact && styles.textCompact,
        ]}
        numberOfLines={1}
      >
        {zone.label}
      </Text>
      {isPlanned && (
        <View style={[styles.plannedDot, { backgroundColor: `${color}60` }]} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: TACTICAL.border,
    backgroundColor: 'rgba(0,0,0,0.15)',
    alignSelf: 'flex-start',
  },
  badgeCompact: {
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 3,
  },
  badgeFallback: {
    borderColor: 'rgba(138,138,138,0.2)',
    backgroundColor: 'rgba(138,138,138,0.06)',
  },
  badgePlanned: {
    borderStyle: 'dashed' as any,
  },
  text: {
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 0.5,
    maxWidth: 100,
  },
  textCompact: {
    fontSize: 7,
    maxWidth: 70,
  },
  textFallback: {
    color: TACTICAL.textMuted,
  },
  plannedDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
  },
});



