import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type ImageSourcePropType,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { SafeIcon as Ionicons } from '../SafeIcon';
import { ECS_SURFACE } from '../../lib/ecsSurfaceTokens';
import { ECS, GOLD_RAIL, TACTICAL } from '../../lib/theme';
import type { ExpeditionBadge as ExpeditionBadgeModel, ExpeditionBadgeRarity } from '../../lib/expedition';
import { ExpeditionBadgeArtwork } from './ExpeditionBadgeArtwork';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

type RarityStyle = {
  borderColor: string;
  backgroundColor: string;
  accentColor: string;
  shadowOpacity: number;
};

type BadgeDetailContext = {
  relatedTripTitle?: string | null;
};

const RARITY_STYLES: Record<ExpeditionBadgeRarity, RarityStyle> = {
  common: {
    borderColor: GOLD_RAIL.internal,
    backgroundColor: 'rgba(17,20,24,0.74)',
    accentColor: TACTICAL.textMuted,
    shadowOpacity: 0,
  },
  uncommon: {
    borderColor: GOLD_RAIL.subsection,
    backgroundColor: 'rgba(20,24,28,0.82)',
    accentColor: TACTICAL.amber,
    shadowOpacity: 0.08,
  },
  rare: {
    borderColor: 'rgba(209,171,91,0.54)',
    backgroundColor: 'rgba(22,22,20,0.9)',
    accentColor: TACTICAL.amber,
    shadowOpacity: 0.14,
  },
  epic: {
    borderColor: 'rgba(238,197,96,0.72)',
    backgroundColor: 'rgba(30,25,16,0.94)',
    accentColor: '#EEC560',
    shadowOpacity: 0.2,
  },
  legendary: {
    borderColor: 'rgba(255,218,128,0.9)',
    backgroundColor: 'rgba(34,27,13,0.98)',
    accentColor: '#FFD978',
    shadowOpacity: 0.26,
  },
  hidden: {
    borderColor: 'rgba(209,171,91,0.64)',
    backgroundColor: 'rgba(20,18,24,0.94)',
    accentColor: '#E6C777',
    shadowOpacity: 0.18,
  },
};

export function BadgeRarityFrame({
  rarity,
  children,
  style,
}: {
  rarity: ExpeditionBadgeRarity;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const rarityStyle = RARITY_STYLES[rarity] ?? RARITY_STYLES.common;
  return (
    <View
      style={[
        styles.rarityFrame,
        {
          borderColor: rarityStyle.borderColor,
          backgroundColor: rarityStyle.backgroundColor,
          shadowColor: rarityStyle.accentColor,
          shadowOpacity: rarityStyle.shadowOpacity,
        },
        style,
      ]}
    >
      <View style={[styles.frameAccent, { backgroundColor: rarityStyle.accentColor }]} />
      {children}
    </View>
  );
}

export function BadgeIcon({
  iconKey,
  rarity,
  size = 18,
}: {
  iconKey: string;
  rarity: ExpeditionBadgeRarity;
  size?: number;
}) {
  const rarityStyle = RARITY_STYLES[rarity] ?? RARITY_STYLES.common;
  return (
    <View style={[styles.badgeIcon, { borderColor: rarityStyle.borderColor }]}>
      <Ionicons name={iconForBadgeKey(iconKey)} size={size} color={rarityStyle.accentColor} />
    </View>
  );
}

export function ExpeditionBadge({
  badge,
  onPress,
}: {
  badge: ExpeditionBadgeModel;
  onPress?: () => void;
}) {
  return (
    <TouchableOpacity
      style={styles.compactBadge}
      onPress={onPress}
      activeOpacity={0.82}
      accessibilityRole="button"
      accessibilityLabel={`Open badge ${badge.title}`}
    >
      {badge.unlockedAt ? (
        <ExpeditionBadgeArtwork badgeId={badge.id} title={badge.title} size={32} />
      ) : (
        <BadgeIcon iconKey={badge.iconKey} rarity={badge.rarity} size={13} />
      )}
      <Text style={styles.compactBadgeText} numberOfLines={1}>{badge.title}</Text>
    </TouchableOpacity>
  );
}

export function ExpeditionBadgeCard({
  badge,
  onPress,
  relatedTripTitle,
}: {
  badge: ExpeditionBadgeModel;
  onPress?: () => void;
  relatedTripTitle?: string | null;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.84}
      accessibilityRole="button"
      accessibilityLabel={`Open badge ${badge.title}`}
    >
      <BadgeRarityFrame rarity={badge.rarity} style={styles.badgeCard}>
        {badge.unlockedAt ? (
          <ExpeditionBadgeArtwork badgeId={badge.id} title={badge.title} size={60} />
        ) : (
          <BadgeIcon iconKey={badge.iconKey} rarity={badge.rarity} />
        )}
        <View style={styles.badgeCardCopy}>
          <View style={styles.badgeCardTopLine}>
            <Text style={styles.badgeTitle} numberOfLines={1}>{badge.title}</Text>
            <Text style={[styles.badgeRarity, { color: RARITY_STYLES[badge.rarity].accentColor }]}>
              {formatRarity(badge.rarity)}
            </Text>
          </View>
          <Text style={styles.badgeDescription} numberOfLines={2}>{badge.description}</Text>
          <Text style={styles.badgeMeta} numberOfLines={1}>
            {formatCategory(badge.category)}{relatedTripTitle ? ` / ${relatedTripTitle}` : ''}
          </Text>
        </View>
      </BadgeRarityFrame>
    </TouchableOpacity>
  );
}

export const ExpeditionBadgeCatalogCard = React.memo(function ExpeditionBadgeCatalogCard({
  badge,
  isEarned,
  artwork,
  onPress,
}: {
  badge: ExpeditionBadgeModel;
  isEarned: boolean;
  artwork: ImageSourcePropType | null;
  onPress: () => void;
}) {
  const hasKnownProgress = !isEarned && badge.progressCurrent != null && badge.progressTarget != null;

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.84}
      accessibilityRole="button"
      accessibilityLabel={`${badge.title}, ${isEarned ? 'achieved' : 'locked'} badge`}
    >
      <BadgeRarityFrame rarity={badge.rarity} style={styles.catalogCard}>
        {isEarned && artwork ? (
          <ExpeditionBadgeArtwork badgeId={badge.id} title={badge.title} size={64} />
        ) : (
          <View style={styles.lockedBadgeIconWrap}>
            <BadgeIcon iconKey={badge.iconKey} rarity={badge.rarity} size={20} />
            <View style={styles.lockedBadgeSeal}>
              <Ionicons name="lock-closed" size={9} color={TACTICAL.textMuted} />
            </View>
          </View>
        )}
        <View style={styles.badgeCardCopy}>
          <View style={styles.badgeCardTopLine}>
            <Text style={styles.badgeTitle} numberOfLines={1}>{badge.title}</Text>
            <Text style={[styles.badgeRarity, { color: RARITY_STYLES[badge.rarity].accentColor }]}>
              {formatRarity(badge.rarity)}
            </Text>
          </View>
          <Text style={styles.badgeDescription} numberOfLines={2}>{badge.description}</Text>
          {hasKnownProgress ? (
            <ProgressMeter
              current={badge.progressCurrent ?? 0}
              target={badge.progressTarget ?? 0}
              accentColor={RARITY_STYLES[badge.rarity].accentColor}
            />
          ) : (
            <Text style={styles.badgeMeta} numberOfLines={1}>
              {formatCategory(badge.category)} / {isEarned ? formatUnlockDate(badge.unlockedAt) : 'Locked'}
            </Text>
          )}
        </View>
      </BadgeRarityFrame>
    </TouchableOpacity>
  );
});

export function BadgeGrid({
  badges,
  emptyTitle,
  emptySubtext,
  relatedTripTitle,
}: {
  badges: ExpeditionBadgeModel[];
  emptyTitle?: string;
  emptySubtext?: string;
  relatedTripTitle?: string | null;
}) {
  const [selectedBadge, setSelectedBadge] = useState<ExpeditionBadgeModel | null>(null);
  const visibleBadges = useMemo(
    () => badges.filter((badge) => !!badge.unlockedAt),
    [badges],
  );

  if (visibleBadges.length === 0) {
    return (
      <View style={styles.badgeEmptyState}>
        <Ionicons name="ribbon-outline" size={22} color={TACTICAL.textMuted} />
        <Text style={styles.emptyTitle}>{emptyTitle ?? 'No badges unlocked yet.'}</Text>
        {emptySubtext ? <Text style={styles.emptySubtext}>{emptySubtext}</Text> : null}
      </View>
    );
  }

  return (
    <View style={styles.badgeGrid}>
      {visibleBadges.map((badge) => (
        <ExpeditionBadgeCard
          key={`${badge.id}:${badge.unlockedTripId ?? badge.unlockedAt ?? badge.updatedAt}`}
          badge={badge}
          relatedTripTitle={relatedTripTitle}
          onPress={() => setSelectedBadge(badge)}
        />
      ))}
      <BadgeDetailModal
        badge={selectedBadge}
        onClose={() => setSelectedBadge(null)}
        relatedTripTitle={relatedTripTitle}
      />
    </View>
  );
}

export function BadgeUnlockSummary({
  badges,
  onOpenCollection,
  limit = 5,
  actionLabel = 'View',
  showAction = true,
}: {
  badges: ExpeditionBadgeModel[];
  onOpenCollection: () => void;
  limit?: number;
  actionLabel?: string;
  showAction?: boolean;
}) {
  const [selectedBadge, setSelectedBadge] = useState<ExpeditionBadgeModel | null>(null);
  const fade = useRef(new Animated.Value(0)).current;
  const unlockedBadges = badges
    .filter((badge) => !!badge.unlockedAt)
    .sort(
      (left, right) =>
        new Date(right.unlockedAt ?? right.updatedAt).getTime() -
        new Date(left.unlockedAt ?? left.updatedAt).getTime(),
    );
  const recentBadges = unlockedBadges.slice(0, limit);

  useEffect(() => {
    if (recentBadges.length === 0) return;
    Animated.timing(fade, {
      toValue: 1,
      duration: 260,
      useNativeDriver: true,
    }).start();
  }, [fade, recentBadges.length]);

  if (recentBadges.length === 0) return null;

  return (
    <View style={styles.summaryWrap}>
      <View style={styles.summaryHeader}>
        <View>
          <Text style={styles.sectionTitle}>Badge Achievements</Text>
          <Text style={styles.summaryCount}>{unlockedBadges.length} earned</Text>
        </View>
        {showAction ? (
          <TouchableOpacity
            style={styles.viewButton}
            onPress={onOpenCollection}
            activeOpacity={0.82}
            accessibilityRole="button"
            accessibilityLabel="Open Unlocked Badges"
          >
            <Ionicons name="ribbon-outline" size={14} color={TACTICAL.amber} />
            <Text style={styles.viewButtonText}>{actionLabel}</Text>
          </TouchableOpacity>
        ) : null}
      </View>
      <Animated.View
        style={[
          styles.badgeAchievementList,
          {
            opacity: fade,
            transform: [{
              translateY: fade.interpolate({
                inputRange: [0, 1],
                outputRange: [4, 0],
              }),
            }],
          },
        ]}
      >
        {recentBadges.map((badge) => (
          <TouchableOpacity
            key={`${badge.id}:${badge.unlockedTripId ?? badge.unlockedAt ?? badge.updatedAt}`}
            style={styles.badgeAchievementRow}
            onPress={() => setSelectedBadge(badge)}
            activeOpacity={0.82}
            accessibilityRole="button"
            accessibilityLabel={`Open badge achievement ${badge.title}`}
          >
            <ExpeditionBadgeArtwork badgeId={badge.id} title={badge.title} size={42} />
            <View style={styles.badgeAchievementCopy}>
              <View style={styles.badgeAchievementTopLine}>
                <Text style={styles.badgeAchievementTitle} numberOfLines={1}>{badge.title}</Text>
                <Text style={[styles.badgeAchievementRarity, { color: RARITY_STYLES[badge.rarity].accentColor }]}>
                  {formatRarity(badge.rarity)}
                </Text>
              </View>
              <Text style={styles.badgeAchievementDescription} numberOfLines={2}>{badge.description}</Text>
              <Text style={styles.badgeAchievementMeta} numberOfLines={1}>
                {formatCategory(badge.category)} / {formatUnlockDate(badge.unlockedAt)}
              </Text>
            </View>
          </TouchableOpacity>
        ))}
      </Animated.View>
      <BadgeDetailModal badge={selectedBadge} onClose={() => setSelectedBadge(null)} />
      {/* TODO Expedition Badges: add a richer badge unlock animation sequence for post-expedition review. */}
      {/* TODO Expedition Badges: stamp earned badges onto PDF expedition reports. */}
      {/* TODO Expedition Badges: link badge location markers to recap maps when unlock coordinates exist. */}
      {/* TODO Expedition Badges: add seasonal badge themes without exposing locked hidden badges. */}
    </View>
  );
}

export function BadgeMilestoneList({
  badges,
}: {
  badges: ExpeditionBadgeModel[];
}) {
  const milestones = badges
    .filter((badge) => !badge.unlockedAt && !badge.isHidden && badge.progressTarget != null)
    .slice(0, 3);
  if (milestones.length === 0) return null;

  return (
    <View style={styles.milestoneSection}>
      <View style={styles.summaryHeader}>
        <View>
          <Text style={styles.sectionTitle}>Next Known Milestones</Text>
          <Text style={styles.summaryCount}>{milestones.length} in progress</Text>
        </View>
      </View>
      <View style={styles.badgeGrid}>
        {milestones.map((badge) => (
          <BadgeRarityFrame
            key={`${badge.id}:${badge.progressCurrent ?? 0}:${badge.progressTarget ?? 0}`}
            rarity={badge.rarity}
            style={styles.milestoneCard}
          >
            <BadgeIcon iconKey={badge.iconKey} rarity={badge.rarity} />
            <View style={styles.badgeCardCopy}>
              <View style={styles.badgeCardTopLine}>
                <Text style={styles.badgeTitle} numberOfLines={1}>{badge.title}</Text>
                <Text style={[styles.badgeRarity, { color: RARITY_STYLES[badge.rarity].accentColor }]}>
                  {formatRarity(badge.rarity)}
                </Text>
              </View>
              <Text style={styles.badgeDescription} numberOfLines={2}>{badge.description}</Text>
              <ProgressMeter
                current={badge.progressCurrent ?? 0}
                target={badge.progressTarget ?? 0}
                accentColor={RARITY_STYLES[badge.rarity].accentColor}
              />
            </View>
          </BadgeRarityFrame>
        ))}
      </View>
    </View>
  );
}

export function BadgeDetailModal({
  badge,
  onClose,
  relatedTripTitle,
}: {
  badge: ExpeditionBadgeModel | null;
  onClose: () => void;
  relatedTripTitle?: string | null;
}) {
  if (!badge) return null;
  const isEarned = !!badge.unlockedAt;
  return (
    <Modal
      visible
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.modalBackdrop} onPress={onClose}>
        <Pressable style={styles.modalSurface}>
          <BadgeRarityFrame rarity={badge.rarity} style={styles.modalBadgeFrame}>
            {isEarned ? (
              <ExpeditionBadgeArtwork badgeId={badge.id} title={badge.title} size={92} />
            ) : (
              <BadgeIcon iconKey={badge.iconKey} rarity={badge.rarity} size={22} />
            )}
            <View style={styles.modalHeaderCopy}>
              <Text style={styles.modalTitle}>{badge.title}</Text>
              <Text style={[styles.modalRarity, { color: RARITY_STYLES[badge.rarity].accentColor }]}>
                {formatRarity(badge.rarity)} / {formatCategory(badge.category)}
              </Text>
            </View>
          </BadgeRarityFrame>
          <View style={styles.modalDetailRows}>
            <DetailRow label="Status" value={isEarned ? 'Achieved' : 'Locked'} />
            {isEarned ? <DetailRow label="Unlocked" value={formatUnlockDate(badge.unlockedAt)} /> : null}
            {isEarned ? (
              <DetailRow label="Expedition" value={relatedTripTitle ?? badge.unlockedTripId ?? 'Expedition unavailable'} />
            ) : null}
            {badge.progressTarget != null && (isEarned || badge.progressCurrent != null) ? (
              <DetailRow
                label="Progress"
                value={`${Math.round(badge.progressCurrent ?? badge.progressTarget).toLocaleString()} / ${badge.progressTarget.toLocaleString()}`}
              />
            ) : null}
          </View>
          <Text style={styles.modalDescription}>{badge.description}</Text>
          <TouchableOpacity
            style={styles.modalCloseButton}
            onPress={onClose}
            activeOpacity={0.82}
            accessibilityRole="button"
            accessibilityLabel="Close Badge Detail"
          >
            <Text style={styles.modalCloseText}>Close</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue} numberOfLines={1}>{value}</Text>
    </View>
  );
}

function ProgressMeter({
  current,
  target,
  accentColor,
}: {
  current: number;
  target: number;
  accentColor: string;
}) {
  const pct = target > 0 ? Math.max(0, Math.min(1, current / target)) : 0;
  return (
    <View style={styles.progressWrap}>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${Math.round(pct * 100)}%`, backgroundColor: accentColor }]} />
      </View>
      <Text style={styles.progressText}>
        {Math.round(current).toLocaleString()} / {Math.round(target).toLocaleString()}
      </Text>
    </View>
  );
}

function iconForBadgeKey(iconKey: string): IconName {
  switch (iconKey) {
    case 'flag':
      return 'flag-outline';
    case 'route':
    case 'reroute':
      return 'git-branch-outline';
    case 'peak':
    case 'mountain':
    case 'climb':
      return 'trending-up-outline';
    case 'storm':
    case 'weather':
      return 'thunderstorm-outline';
    case 'rain':
      return 'rainy-outline';
    case 'snow':
      return 'snow-outline';
    case 'wind':
      return 'flag-outline';
    case 'temperature':
      return 'thermometer-outline';
    case 'moon':
      return 'moon-outline';
    case 'recovery':
      return 'construct-outline';
    case 'satellite':
      return 'radio-outline';
    case 'sun':
      return 'sunny-outline';
    case 'cloud':
      return 'cloud-outline';
    case 'forest':
    case 'leaf':
      return 'leaf-outline';
    case 'odometer':
    case 'speedometer':
      return 'speedometer-outline';
    case 'sunrise':
      return 'partly-sunny-outline';
    case 'sunset':
      return 'cloudy-night-outline';
    case 'terrain':
      return 'layers-outline';
    case 'checkmark':
      return 'checkmark-circle-outline';
    case 'compass':
      return 'compass-outline';
    case 'camp':
      return 'bonfire-outline';
    case 'resupply':
      return 'cube-outline';
    case 'calendar':
      return 'calendar-outline';
    case 'map':
      return 'map-outline';
    case 'time':
      return 'time-outline';
    case 'hidden':
    case 'sparkles':
      return 'sparkles-outline';
    case 'patch':
    default:
      return 'ribbon-outline';
  }
}

function formatRarity(rarity: ExpeditionBadgeRarity): string {
  return rarity.charAt(0).toUpperCase() + rarity.slice(1);
}

function formatCategory(category: string): string {
  return category
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatUnlockDate(value: string | null): string {
  if (!value) return 'Unlock date unavailable';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'Unlock date unavailable';
  return parsed.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

const styles = StyleSheet.create({
  rarityFrame: {
    position: 'relative',
    overflow: 'hidden',
    borderRadius: 8,
    borderWidth: 1,
    shadowRadius: 9,
    shadowOffset: { width: 0, height: 3 },
    elevation: 1,
  },
  frameAccent: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 3,
    opacity: 0.82,
  },
  badgeIcon: {
    width: 34,
    height: 34,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    backgroundColor: ECS.accentSoft,
  },
  compactBadge: {
    maxWidth: '100%',
    minHeight: 34,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: GOLD_RAIL.internal,
    backgroundColor: 'rgba(17,20,24,0.82)',
    paddingLeft: 5,
    paddingRight: 10,
    paddingVertical: 4,
  },
  compactBadgeText: {
    flexShrink: 1,
    color: TACTICAL.text,
    fontSize: 10,
    fontWeight: '900',
  },
  badgeCard: {
    minHeight: 80,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 10,
    paddingLeft: 12,
  },
  catalogCard: {
    minHeight: 88,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 10,
    paddingLeft: 12,
  },
  lockedBadgeIconWrap: {
    width: 64,
    height: 64,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lockedBadgeSeal: {
    position: 'absolute',
    right: 8,
    bottom: 8,
    width: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 9,
    borderWidth: 1,
    borderColor: GOLD_RAIL.internal,
    backgroundColor: ECS_SURFACE.background.secondary,
  },
  badgeCardCopy: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  badgeCardTopLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  badgeTitle: {
    flex: 1,
    minWidth: 0,
    color: TACTICAL.text,
    fontSize: 12,
    fontWeight: '900',
  },
  badgeRarity: {
    fontSize: 8,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  badgeDescription: {
    color: TACTICAL.textMuted,
    fontSize: 9,
    fontWeight: '700',
    lineHeight: 12,
  },
  badgeMeta: {
    color: TACTICAL.amber,
    fontSize: 8,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  badgeGrid: {
    gap: 8,
  },
  badgeAchievementList: {
    gap: 7,
  },
  badgeAchievementRow: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: GOLD_RAIL.internal,
    backgroundColor: 'rgba(17,20,24,0.82)',
    padding: 8,
  },
  badgeAchievementCopy: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  badgeAchievementTopLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  badgeAchievementTitle: {
    flex: 1,
    minWidth: 0,
    color: TACTICAL.text,
    fontSize: 11,
    fontWeight: '900',
  },
  badgeAchievementRarity: {
    fontSize: 8,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  badgeAchievementDescription: {
    color: TACTICAL.textMuted,
    fontSize: 9,
    fontWeight: '700',
    lineHeight: 12,
  },
  badgeAchievementMeta: {
    color: TACTICAL.amber,
    fontSize: 8,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  summaryWrap: {
    borderTopWidth: 1,
    borderTopColor: GOLD_RAIL.internal,
    paddingTop: 10,
    gap: 8,
  },
  milestoneSection: {
    borderTopWidth: 1,
    borderTopColor: GOLD_RAIL.internal,
    paddingTop: 10,
    gap: 8,
  },
  milestoneCard: {
    minHeight: 82,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 10,
    paddingLeft: 12,
  },
  progressWrap: {
    gap: 4,
  },
  progressTrack: {
    height: 5,
    overflow: 'hidden',
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.28)',
  },
  progressFill: {
    height: '100%',
    borderRadius: 999,
  },
  progressText: {
    color: TACTICAL.textMuted,
    fontSize: 8,
    fontWeight: '900',
  },
  summaryHeader: {
    minHeight: 32,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  sectionTitle: {
    color: TACTICAL.text,
    fontSize: 13,
    fontWeight: '900',
  },
  summaryCount: {
    marginTop: 2,
    color: TACTICAL.textMuted,
    fontSize: 9,
    fontWeight: '800',
  },
  viewButton: {
    minHeight: 30,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: GOLD_RAIL.subsection,
    backgroundColor: ECS.accentSoft,
    paddingHorizontal: 10,
  },
  viewButtonText: {
    color: TACTICAL.amber,
    fontSize: 10,
    fontWeight: '900',
  },
  badgeEmptyState: {
    minHeight: 130,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: GOLD_RAIL.internal,
    backgroundColor: 'rgba(17,20,24,0.7)',
    padding: 14,
  },
  emptyTitle: {
    color: TACTICAL.text,
    fontSize: 14,
    fontWeight: '900',
    textAlign: 'center',
  },
  emptySubtext: {
    color: TACTICAL.textMuted,
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'center',
  },
  modalBackdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.64)',
    padding: 18,
  },
  modalSurface: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: GOLD_RAIL.section,
    backgroundColor: 'rgba(11,14,18,0.98)',
    padding: 12,
    gap: 12,
  },
  modalBadgeFrame: {
    minHeight: 116,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    padding: 12,
    paddingLeft: 14,
  },
  modalHeaderCopy: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  modalTitle: {
    color: TACTICAL.text,
    fontSize: 17,
    fontWeight: '900',
  },
  modalRarity: {
    fontSize: 9,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  modalDetailRows: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: GOLD_RAIL.internal,
    backgroundColor: 'rgba(17,20,24,0.72)',
  },
  detailRow: {
    minHeight: 36,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: GOLD_RAIL.internal,
    paddingHorizontal: 10,
  },
  detailLabel: {
    color: TACTICAL.textMuted,
    fontSize: 9,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  detailValue: {
    flex: 1,
    color: TACTICAL.text,
    fontSize: 10,
    fontWeight: '900',
    textAlign: 'right',
  },
  modalDescription: {
    color: TACTICAL.textMuted,
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 15,
  },
  modalCloseButton: {
    alignSelf: 'flex-end',
    minHeight: 34,
    justifyContent: 'center',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: GOLD_RAIL.subsection,
    backgroundColor: ECS.accentSoft,
    paddingHorizontal: 14,
  },
  modalCloseText: {
    color: TACTICAL.amber,
    fontSize: 10,
    fontWeight: '900',
  },
});
