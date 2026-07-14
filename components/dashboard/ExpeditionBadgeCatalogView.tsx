import React, { useCallback, useMemo, useState } from 'react';
import {
  SectionList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type SectionListData,
} from 'react-native';

import { ECS_SURFACE } from '../../lib/ecsSurfaceTokens';
import {
  buildExpeditionBadgeCatalogPresentation,
  type ExpeditionBadge,
  type ExpeditionBadgeCatalogPresentationEntry,
} from '../../lib/expedition';
import { ECS, GOLD_RAIL, TACTICAL } from '../../lib/theme';
import { SafeIcon as Ionicons } from '../SafeIcon';
import {
  BadgeDetailModal,
  BadgeMilestoneList,
  ExpeditionBadgeCatalogCard,
} from './ExpeditionBadgeVisuals';
import { ExpeditionIdentityProfileSurface } from './ExpeditionIdentityProfileSurface';

type BadgeCollectionMode = 'recent' | 'rarity' | 'category';

type BadgeCatalogSection = {
  title: string;
  data: ExpeditionBadgeCatalogPresentationEntry[];
};

type BadgeCollectionStats = {
  totalBadgesEarned: number;
  rarestBadgeEarned: string;
  mostRecentUnlock: string;
  expeditionsWithBadges: number;
};

type ExpeditionBadgeCatalogViewProps = {
  badges: ExpeditionBadge[];
  badgeProgress: ExpeditionBadge[];
  onBack: () => void;
};

const BADGE_RARITY_RANK: Record<ExpeditionBadge['rarity'], number> = {
  common: 1,
  uncommon: 2,
  rare: 3,
  epic: 4,
  legendary: 5,
  hidden: 6,
};

export function ExpeditionBadgeCatalogView({
  badges,
  badgeProgress,
  onBack,
}: ExpeditionBadgeCatalogViewProps) {
  const [mode, setMode] = useState<BadgeCollectionMode>('recent');
  const [selectedBadge, setSelectedBadge] = useState<ExpeditionBadge | null>(null);
  const catalogEntries = useMemo(
    () => buildExpeditionBadgeCatalogPresentation(badges, badgeProgress),
    [badgeProgress, badges],
  );
  const stats = useMemo(
    () => buildBadgeCollectionStats(catalogEntries, badges),
    [badges, catalogEntries],
  );
  const sections = useMemo(
    () => buildBadgeCollectionSections(catalogEntries, mode),
    [catalogEntries, mode],
  );

  const renderItem = useCallback(
    ({ item: entry }: { item: ExpeditionBadgeCatalogPresentationEntry }) => (
      <View style={styles.catalogItem}>
        <ExpeditionBadgeCatalogCard
          badge={entry.badge}
          isEarned={entry.isEarned}
          artwork={entry.artwork}
          onPress={() => setSelectedBadge(entry.badge)}
        />
      </View>
    ),
    [],
  );

  const renderSectionHeader = useCallback(
    ({ section }: { section: SectionListData<ExpeditionBadgeCatalogPresentationEntry, BadgeCatalogSection> }) => (
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{section.title}</Text>
        <Text style={styles.sectionCount}>{section.data.length}</Text>
      </View>
    ),
    [],
  );

  const header = useMemo(
    () => (
      <View style={styles.headerContent}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={onBack}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel="Back to Expedition Hub"
        >
          <Ionicons name="chevron-back-outline" size={16} color={TACTICAL.amber} />
          <Text style={styles.backButtonText}>Expedition Hub</Text>
        </TouchableOpacity>

        <View style={styles.detailHeader}>
          <Text style={styles.detailTitle}>Badge Catalog</Text>
          <Text style={styles.detailDate}>
            {stats.totalBadgesEarned} earned / {catalogEntries.length} visible
          </Text>
        </View>

        <ExpeditionIdentityProfileSurface badges={badges} />

        <View style={styles.collectionStatsRow}>
          <CollectionStatTile label="Total Badges Earned" value={`${stats.totalBadgesEarned}`} />
          <CollectionStatTile label="Rarest Badge Earned" value={stats.rarestBadgeEarned} />
          <CollectionStatTile label="Most Recent Unlock" value={stats.mostRecentUnlock} />
          <CollectionStatTile label="Expeditions With Badges" value={`${stats.expeditionsWithBadges}`} />
        </View>

        <View style={styles.collectionModeRow}>
          <CollectionModeButton label="Recent" active={mode === 'recent'} onPress={() => setMode('recent')} />
          <CollectionModeButton label="Rarity" active={mode === 'rarity'} onPress={() => setMode('rarity')} />
          <CollectionModeButton label="Category" active={mode === 'category'} onPress={() => setMode('category')} />
        </View>

        <BadgeMilestoneList badges={badgeProgress} />
      </View>
    ),
    [badgeProgress, badges, catalogEntries.length, mode, onBack, stats],
  );

  return (
    <View style={styles.root}>
      <SectionList
        sections={sections}
        renderItem={renderItem}
        renderSectionHeader={renderSectionHeader}
        keyExtractor={(entry) => entry.definition.id}
        ListHeaderComponent={header}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        stickySectionHeadersEnabled={false}
        initialNumToRender={12}
        maxToRenderPerBatch={12}
        windowSize={7}
      />
      <BadgeDetailModal badge={selectedBadge} onClose={() => setSelectedBadge(null)} />
    </View>
  );
}

function CollectionStatTile({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.collectionStatTile}>
      <Text style={styles.collectionStatValue} numberOfLines={1}>{value}</Text>
      <Text style={styles.collectionStatLabel} numberOfLines={2}>{label}</Text>
    </View>
  );
}

function CollectionModeButton({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.collectionModeButton, active && styles.collectionModeButtonActive]}
      onPress={onPress}
      activeOpacity={0.82}
      accessibilityRole="button"
      accessibilityLabel={`Show badges by ${label}`}
      accessibilityState={{ selected: active }}
    >
      <Text style={[styles.collectionModeButtonText, active && styles.collectionModeButtonTextActive]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

function buildBadgeCollectionStats(
  entries: readonly ExpeditionBadgeCatalogPresentationEntry[],
  earnedHistory: readonly ExpeditionBadge[],
): BadgeCollectionStats {
  const earnedBadges = entries.filter((entry) => entry.isEarned).map((entry) => entry.badge);
  const sortedNewest = [...earnedBadges].sort(sortBadgesNewest);
  const rarest = [...earnedBadges].sort((left, right) => {
    const rankDelta = BADGE_RARITY_RANK[right.rarity] - BADGE_RARITY_RANK[left.rarity];
    return rankDelta !== 0 ? rankDelta : sortBadgesNewest(left, right);
  })[0] ?? null;
  const tripIds = new Set(
    earnedHistory
      .map((badge) => badge.unlockedTripId)
      .filter((tripId): tripId is string => typeof tripId === 'string' && tripId.trim().length > 0),
  );

  return {
    totalBadgesEarned: earnedBadges.length,
    rarestBadgeEarned: rarest ? formatRarity(rarest.rarity) : 'None',
    mostRecentUnlock: sortedNewest[0]?.title ?? 'None',
    expeditionsWithBadges: tripIds.size,
  };
}

function buildBadgeCollectionSections(
  entries: readonly ExpeditionBadgeCatalogPresentationEntry[],
  mode: BadgeCollectionMode,
): BadgeCatalogSection[] {
  if (mode === 'recent') {
    return [
      {
        title: 'Earned',
        data: entries.filter((entry) => entry.isEarned).sort((left, right) => sortBadgesNewest(left.badge, right.badge)),
      },
      {
        title: 'Available',
        data: entries.filter((entry) => !entry.isEarned),
      },
    ].filter((section) => section.data.length > 0);
  }

  if (mode === 'rarity') {
    const orderedRarities: ExpeditionBadge['rarity'][] = ['hidden', 'legendary', 'epic', 'rare', 'uncommon', 'common'];
    return orderedRarities
      .map((rarity) => ({
        title: formatRarity(rarity),
        data: entries.filter((entry) => entry.badge.rarity === rarity),
      }))
      .filter((section) => section.data.length > 0);
  }

  const categories = Array.from(new Set(entries.map((entry) => entry.badge.category))).sort((left, right) =>
    formatCategory(left).localeCompare(formatCategory(right)),
  );
  return categories.map((category) => ({
    title: formatCategory(category),
    data: entries.filter((entry) => entry.badge.category === category),
  }));
}

function sortBadgesNewest(left: ExpeditionBadge, right: ExpeditionBadge): number {
  return badgeTimestamp(right) - badgeTimestamp(left);
}

function badgeTimestamp(badge: ExpeditionBadge): number {
  const parsed = new Date(badge.unlockedAt ?? badge.updatedAt).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatRarity(rarity: ExpeditionBadge['rarity']): string {
  return rarity.charAt(0).toUpperCase() + rarity.slice(1);
}

function formatCategory(category: string): string {
  return category
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    minHeight: 0,
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  content: {
    flexGrow: 1,
    borderRadius: ECS_SURFACE.radius.primary,
    borderWidth: 1,
    borderColor: ECS_SURFACE.border.selected,
    backgroundColor: ECS_SURFACE.background.selected,
    padding: 12,
    paddingBottom: 18,
  },
  headerContent: {
    gap: 12,
  },
  backButton: {
    minHeight: 34,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: GOLD_RAIL.internal,
    backgroundColor: ECS.accentSoft,
    paddingHorizontal: 9,
  },
  backButtonText: {
    color: TACTICAL.amber,
    fontSize: 10,
    fontWeight: '900',
  },
  detailHeader: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 10,
  },
  detailTitle: {
    flex: 1,
    color: TACTICAL.text,
    fontSize: 18,
    fontWeight: '900',
  },
  detailDate: {
    color: TACTICAL.textMuted,
    fontSize: 9,
    fontWeight: '800',
  },
  collectionStatsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
  },
  collectionStatTile: {
    flexGrow: 1,
    flexBasis: '46%',
    minHeight: 58,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: GOLD_RAIL.internal,
    backgroundColor: ECS_SURFACE.background.secondary,
    paddingHorizontal: 8,
    paddingVertical: 8,
    justifyContent: 'center',
  },
  collectionStatValue: {
    color: TACTICAL.amber,
    fontSize: 12,
    fontWeight: '900',
  },
  collectionStatLabel: {
    marginTop: 4,
    color: TACTICAL.textMuted,
    fontSize: 8,
    fontWeight: '800',
    lineHeight: 10,
  },
  collectionModeRow: {
    minHeight: 34,
    flexDirection: 'row',
    gap: 7,
  },
  collectionModeButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: GOLD_RAIL.internal,
    backgroundColor: ECS_SURFACE.background.secondary,
    paddingHorizontal: 8,
  },
  collectionModeButtonActive: {
    borderColor: GOLD_RAIL.subsection,
    backgroundColor: ECS.accentSoft,
  },
  collectionModeButtonText: {
    color: TACTICAL.textMuted,
    fontSize: 10,
    fontWeight: '900',
  },
  collectionModeButtonTextActive: {
    color: TACTICAL.amber,
  },
  sectionHeader: {
    minHeight: 34,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
    marginBottom: 7,
    borderBottomWidth: 1,
    borderBottomColor: GOLD_RAIL.internal,
    backgroundColor: ECS_SURFACE.background.selected,
  },
  sectionTitle: {
    color: TACTICAL.text,
    fontSize: 13,
    fontWeight: '900',
  },
  sectionCount: {
    color: TACTICAL.textMuted,
    fontSize: 9,
    fontWeight: '900',
  },
  catalogItem: {
    marginBottom: 8,
  },
});
