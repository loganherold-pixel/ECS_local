import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { SafeIcon as Ionicons } from '../SafeIcon';
import { ECS, GOLD_RAIL, TACTICAL } from '../../lib/theme';
import {
  buildBadgeIdentityProfileModel,
  type ExpeditionBadge,
} from '../../lib/expedition';

export function ExpeditionIdentityProfileSurface({
  badges,
}: {
  badges?: ExpeditionBadge[] | null;
}) {
  const model = useMemo(
    () => buildBadgeIdentityProfileModel({ badges: badges ?? [] }),
    [badges],
  );

  return (
    <View style={styles.surface} testID="expedition-badge-profile-surface">
      <View style={styles.headerRow}>
        <View style={styles.iconFrame}>
          <Ionicons name="person-circle-outline" size={17} color={TACTICAL.amber} />
        </View>
        <View style={styles.headerCopy}>
          <Text style={styles.eyebrow}>Expedition Identity</Text>
          <Text style={styles.titleLabel}>Current Title</Text>
        </View>
        <View style={styles.countPill}>
          <Text style={styles.countText}>{model.earnedBadgeCount}</Text>
        </View>
      </View>

      <Text style={styles.title}>{model.title}</Text>
      <Text style={styles.description}>
        {model.hasEarnedState ? model.titleDescription : 'No earned badge state yet.'}
      </Text>
      <Text style={styles.basis}>
        {model.hasEarnedState ? model.titleBasis : 'Complete expeditions to build this profile.'}
      </Text>

      {model.excludedBadgeCount > 0 ? (
        <Text style={styles.guardCopy}>Demo/mock badge state ignored.</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  surface: {
    minHeight: 120,
    gap: 7,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: GOLD_RAIL.subsection,
    backgroundColor: 'rgba(17,20,24,0.86)',
    padding: 10,
  },
  headerRow: {
    minHeight: 34,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  iconFrame: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: GOLD_RAIL.subsection,
    backgroundColor: ECS.accentSoft,
  },
  headerCopy: {
    flex: 1,
    minWidth: 0,
  },
  eyebrow: {
    color: TACTICAL.textMuted,
    fontSize: 8,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  titleLabel: {
    marginTop: 2,
    color: TACTICAL.text,
    fontSize: 11,
    fontWeight: '900',
  },
  countPill: {
    minWidth: 34,
    minHeight: 26,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: GOLD_RAIL.internal,
    backgroundColor: 'rgba(0,0,0,0.18)',
    paddingHorizontal: 8,
  },
  countText: {
    color: TACTICAL.amber,
    fontSize: 11,
    fontWeight: '900',
  },
  title: {
    color: TACTICAL.amber,
    fontSize: 18,
    fontWeight: '900',
  },
  description: {
    color: TACTICAL.text,
    fontSize: 10,
    fontWeight: '800',
    lineHeight: 14,
  },
  basis: {
    color: TACTICAL.textMuted,
    fontSize: 9,
    fontWeight: '700',
    lineHeight: 13,
  },
  guardCopy: {
    color: TACTICAL.textMuted,
    fontSize: 9,
    fontWeight: '800',
  },
});
