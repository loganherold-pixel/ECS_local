import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, Platform } from 'react-native';
import { SafeIcon as Ionicons } from '../SafeIcon';

import { TACTICAL } from '../../lib/theme';
import type { Loadout, OperatingProfile } from '../../lib/types';
import {
  OPERATING_PROFILE_LABELS,
  OPERATING_PROFILE_COLORS,
} from '../../lib/types';

interface Props {
  loadout: Loadout;
  onOpen: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}

export default function LoadoutCard({ loadout, onOpen, onDuplicate, onDelete }: Props) {
  const itemCount = loadout._item_count ?? 0;
  const criticalCount = loadout._critical_count ?? 0;
  const packedCount = loadout._packed_count ?? 0;
  const readiness = loadout._readiness_pct ?? 0;
  const profileColor = loadout.operating_profile
    ? OPERATING_PROFILE_COLORS[loadout.operating_profile as OperatingProfile]
    : TACTICAL.textMuted;

  const getReadinessColor = (pct: number) => {
    if (pct >= 100) return '#4CAF50';
    if (pct >= 70) return TACTICAL.amber;
    if (pct >= 40) return '#FF9800';
    return TACTICAL.danger;
  };

  const handleDelete = () => {
    if (Platform.OS === 'web') {
      if (confirm('DELETE THIS LOADOUT? ALL ITEMS WILL BE REMOVED.')) onDelete();
    } else {
      Alert.alert('DELETE LOADOUT', 'All items will be permanently removed.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: onDelete },
      ]);
    }
  };

  return (
    <TouchableOpacity style={styles.card} onPress={onOpen} activeOpacity={0.7}>
      {/* Top Row: Name + Profile Badge */}
      <View style={styles.topRow}>
        <View style={styles.nameCol}>
          <Text style={styles.name} numberOfLines={1}>{loadout.name}</Text>
          {loadout.operating_profile && (
            <View style={[styles.profileBadge, { backgroundColor: `${profileColor}18`, borderColor: `${profileColor}40` }]}>
              <View style={[styles.profileDot, { backgroundColor: profileColor }]} />
              <Text style={[styles.profileText, { color: profileColor }]}>
                {OPERATING_PROFILE_LABELS[loadout.operating_profile as OperatingProfile]}
              </Text>
            </View>
          )}
        </View>
        <View style={styles.readinessCircle}>
          <Text style={[styles.readinessPct, { color: getReadinessColor(readiness) }]}>
            {readiness}%
          </Text>
          <Text style={styles.readinessLabel}>READY</Text>
        </View>
      </View>

      {/* Stats Row */}
      <View style={styles.statsRow}>
        <View style={styles.stat}>
          <Ionicons name="cube-outline" size={13} color={TACTICAL.textMuted} />
          <Text style={styles.statValue}>{itemCount}</Text>
          <Text style={styles.statLabel}>ITEMS</Text>
        </View>
        <View style={styles.stat}>
          <Ionicons name="alert-circle-outline" size={13} color={TACTICAL.danger} />
          <Text style={[styles.statValue, { color: criticalCount > 0 ? TACTICAL.danger : TACTICAL.textMuted }]}>
            {criticalCount}
          </Text>
          <Text style={styles.statLabel}>CRITICAL</Text>
        </View>
        <View style={styles.stat}>
          <Ionicons name="checkmark-circle-outline" size={13} color={TACTICAL.successText} />
          <Text style={[styles.statValue, { color: TACTICAL.successText }]}>{packedCount}</Text>
          <Text style={styles.statLabel}>PACKED</Text>
        </View>
      </View>

      {/* Readiness Bar */}
      {itemCount > 0 && (
        <View style={styles.readinessBarTrack}>
          <View
            style={[
              styles.readinessBarFill,
              {
                width: `${Math.min(100, readiness)}%`,
                backgroundColor: getReadinessColor(readiness),
              },
            ]}
          />
        </View>
      )}

      {/* Actions */}
      <View style={styles.actionsRow}>
        <TouchableOpacity style={styles.actionBtn} onPress={onOpen}>
          <Ionicons name="open-outline" size={14} color={TACTICAL.amber} />
          <Text style={[styles.actionText, { color: TACTICAL.amber }]}>OPEN</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionBtn} onPress={onDuplicate}>
          <Ionicons name="copy-outline" size={14} color={TACTICAL.textMuted} />
          <Text style={styles.actionText}>DUPLICATE</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionBtn} onPress={handleDelete}>
          <Ionicons name="trash-outline" size={14} color={TACTICAL.danger} />
          <Text style={[styles.actionText, { color: TACTICAL.danger }]}>DELETE</Text>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: TACTICAL.panel,
    borderRadius: TACTICAL.radius,
    borderWidth: 1,
    borderColor: TACTICAL.border,
    padding: 16,
    marginBottom: 12,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  nameCol: {
    flex: 1,
    marginRight: 12,
  },
  name: {
    fontSize: 16,
    fontWeight: '900',
    color: TACTICAL.text,
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  profileBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
  },
  profileDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  profileText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  readinessCircle: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: TACTICAL.bg,
    borderWidth: 2,
    borderColor: TACTICAL.border,
  },
  readinessPct: {
    fontSize: 16,
    fontWeight: '900',
    fontFamily: 'Courier',
  },
  readinessLabel: {
    fontSize: 7,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    letterSpacing: 1,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 10,
  },
  stat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statValue: {
    fontSize: 14,
    fontWeight: '900',
    color: TACTICAL.text,
    fontFamily: 'Courier',
  },
  statLabel: {
    fontSize: 8,
    fontWeight: '700',
    color: TACTICAL.textMuted,
    letterSpacing: 0.8,
  },
  readinessBarTrack: {
    height: 4,
    backgroundColor: TACTICAL.bg,
    borderRadius: 2,
    overflow: 'hidden',
    marginBottom: 12,
  },
  readinessBarFill: {
    height: '100%',
    borderRadius: 2,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: TACTICAL.border,
    paddingTop: 10,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: TACTICAL.bg,
    borderWidth: 1,
    borderColor: TACTICAL.border,
  },
  actionText: {
    fontSize: 10,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    letterSpacing: 1,
  },
});



