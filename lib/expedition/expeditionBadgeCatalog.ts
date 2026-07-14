import type { ImageSourcePropType } from 'react-native';

import { getExpeditionBadgeArtwork } from '../../assets/expedition-badges';
import {
  EXPEDITION_BADGE_DEFINITIONS,
  getBadgeDefinition,
} from './expeditionBadgeRegistry';
import type {
  ExpeditionBadge,
  ExpeditionBadgeDefinition,
} from './expeditionTripRecordTypes';

export type ExpeditionBadgeCatalogEntry = {
  definition: ExpeditionBadgeDefinition;
  isEarned: boolean;
  artwork: ImageSourcePropType | null;
};

export type ExpeditionBadgeCatalogPresentationEntry = ExpeditionBadgeCatalogEntry & {
  badge: ExpeditionBadge;
};

/**
 * Builds the personalized catalog without changing persisted unlock history.
 * Locked hidden definitions are removed before presentation data is created.
 */
export function getExpeditionBadgeCatalogForUser(
  earnedBadgeIds: Iterable<string>,
): ExpeditionBadgeCatalogEntry[] {
  const earnedIds = new Set(earnedBadgeIds);

  return EXPEDITION_BADGE_DEFINITIONS
    .filter((definition) => !definition.isHidden || earnedIds.has(definition.id))
    .map((definition) => {
      const isEarned = earnedIds.has(definition.id);
      return {
        definition,
        isEarned,
        artwork: isEarned ? getExpeditionBadgeArtwork(definition.id) : null,
      };
    });
}

export function getExpeditionBadgeCatalogEntry(
  badgeId: string,
  earnedBadgeIds: ReadonlySet<string>,
): ExpeditionBadgeCatalogEntry | null {
  const definition = getBadgeDefinition(badgeId);
  if (!definition) return null;

  const isEarned = earnedBadgeIds.has(definition.id);
  if (definition.isHidden && !isEarned) return null;

  return {
    definition,
    isEarned,
    artwork: isEarned ? getExpeditionBadgeArtwork(definition.id) : null,
  };
}

export function buildExpeditionBadgeCatalogPresentation(
  earnedBadges: readonly ExpeditionBadge[],
  badgeProgress: readonly ExpeditionBadge[] = [],
): ExpeditionBadgeCatalogPresentationEntry[] {
  const earnedById = latestBadgeById(earnedBadges.filter((badge) => !!badge.unlockedAt));
  const progressById = latestBadgeById(badgeProgress.filter((badge) => !badge.unlockedAt));

  return getExpeditionBadgeCatalogForUser(earnedById.keys()).map((entry) => {
    const earnedBadge = earnedById.get(entry.definition.id);
    const progressBadge = progressById.get(entry.definition.id);

    return {
      ...entry,
      badge: earnedBadge
        ? mergeDefinitionWithEarnedBadge(entry.definition, earnedBadge)
        : badgeFromLockedDefinition(entry.definition, progressBadge),
    };
  });
}

function latestBadgeById(badges: readonly ExpeditionBadge[]): Map<string, ExpeditionBadge> {
  const byId = new Map<string, ExpeditionBadge>();
  for (const badge of badges) {
    const current = byId.get(badge.id);
    if (!current || badgeTimestamp(badge) > badgeTimestamp(current)) {
      byId.set(badge.id, badge);
    }
  }
  return byId;
}

function badgeTimestamp(badge: ExpeditionBadge): number {
  const value = badge.unlockedAt ?? badge.updatedAt;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function mergeDefinitionWithEarnedBadge(
  definition: ExpeditionBadgeDefinition,
  earnedBadge: ExpeditionBadge,
): ExpeditionBadge {
  return {
    ...definition,
    unlockedAt: earnedBadge.unlockedAt,
    unlockedTripId: earnedBadge.unlockedTripId,
    progressCurrent: earnedBadge.progressCurrent,
    progressTarget: definition.progressTarget,
    updatedAt: earnedBadge.updatedAt,
  };
}

function badgeFromLockedDefinition(
  definition: ExpeditionBadgeDefinition,
  progressBadge: ExpeditionBadge | undefined,
): ExpeditionBadge {
  return {
    ...definition,
    unlockedAt: null,
    unlockedTripId: null,
    progressCurrent: progressBadge?.progressCurrent ?? null,
    progressTarget: definition.progressTarget,
    updatedAt: progressBadge?.updatedAt ?? definition.createdAt,
  };
}
