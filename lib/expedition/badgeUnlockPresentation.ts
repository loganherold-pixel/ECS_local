import { ECS_BADGE_RARITY } from './badgeUnlockTheme';
import { getBadgeDefinition } from './expeditionBadgeRegistry';
import type {
  ExpeditionBadge,
  ExpeditionBadgeRarity,
} from './expeditionTripRecordTypes';

export const BADGE_UNLOCK_EVENT_SCHEMA_VERSION = 1 as const;
export const BADGE_UNLOCK_PRESENTATION_SCHEMA_VERSION = 1 as const;

export type BadgeUnlockPresentationMode = 'full' | 'short' | 'record';

export type BadgeUnlockEvent = {
  schemaVersion: typeof BADGE_UNLOCK_EVENT_SCHEMA_VERSION;
  achievementEventId: string;
  badgeId: string;
  earnedAt: string;
  firstUnlock: boolean;
  previousValue?: number;
  currentValue?: number;
};

type BadgeUnlockPresentationBase = {
  schemaVersion: typeof BADGE_UNLOCK_PRESENTATION_SCHEMA_VERSION;
  id: string;
  batchId: string;
  events: BadgeUnlockEvent[];
  sequenceIndex: number;
  sequenceCount: number;
};

export type BadgeUnlockBadgePresentation = BadgeUnlockPresentationBase & {
  kind: 'badge';
  badgeId: string;
  mode: BadgeUnlockPresentationMode;
};

export type BadgeUnlockSummaryPresentation = BadgeUnlockPresentationBase & {
  kind: 'summary';
  additionalCount: number;
};

export type BadgeUnlockPresentationItem =
  | BadgeUnlockBadgePresentation
  | BadgeUnlockSummaryPresentation;

export type BadgeUnlockAnimationPolicy = {
  durationMs: number;
  revealAtMs: number;
  tapDismissAtMs: number;
  animateScale: boolean;
  scaleOvershoot: boolean;
  animateRotation: boolean;
  animateParticleMotion: boolean;
  animateSweep: boolean;
};

export type BadgeUnlockPresentationModel = {
  itemId: string;
  kind: BadgeUnlockPresentationItem['kind'];
  badgeId: string | null;
  title: string;
  headline: string;
  rarity: ExpeditionBadgeRarity | null;
  rarityLabel: string | null;
  isHidden: boolean;
  previousValue: number | null;
  currentValue: number | null;
  additionalCount: number;
  theme: (typeof ECS_BADGE_RARITY)[ExpeditionBadgeRarity] | null;
  animation: BadgeUnlockAnimationPolicy;
};

const RARITY_PRIORITY: Record<ExpeditionBadgeRarity, number> = {
  common: 1,
  uncommon: 2,
  rare: 3,
  epic: 4,
  legendary: 5,
  hidden: 6,
};

function finiteOptionalNumber(value: unknown): number | undefined {
  if (value == null) return undefined;
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function safeEventToken(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const token = value.trim();
  if (!token || token.length > 240 || /[\r\n\0]/.test(token)) return null;
  return token;
}

function validIsoTimestamp(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const timestamp = value.trim();
  return Number.isFinite(Date.parse(timestamp)) ? timestamp : null;
}

export function normalizeBadgeUnlockEvent(raw: unknown): BadgeUnlockEvent | null {
  const input = raw as Partial<BadgeUnlockEvent> | null | undefined;
  const achievementEventId = safeEventToken(input?.achievementEventId);
  const badgeId = safeEventToken(input?.badgeId);
  const earnedAt = validIsoTimestamp(input?.earnedAt);
  if (
    input?.schemaVersion !== BADGE_UNLOCK_EVENT_SCHEMA_VERSION ||
    !achievementEventId ||
    !badgeId ||
    !earnedAt ||
    typeof input.firstUnlock !== 'boolean' ||
    !getBadgeDefinition(badgeId)
  ) {
    return null;
  }

  const previousValue = finiteOptionalNumber(input.previousValue);
  const currentValue = finiteOptionalNumber(input.currentValue);
  return {
    schemaVersion: BADGE_UNLOCK_EVENT_SCHEMA_VERSION,
    achievementEventId,
    badgeId,
    earnedAt,
    firstUnlock: input.firstUnlock,
    ...(previousValue == null ? {} : { previousValue }),
    ...(currentValue == null ? {} : { currentValue }),
  };
}

function latestBadgeById(badges: readonly ExpeditionBadge[]): Map<string, ExpeditionBadge> {
  const latest = new Map<string, ExpeditionBadge>();
  for (const badge of badges) {
    if (!badge.unlockedAt) continue;
    const current = latest.get(badge.id);
    if (!current || Date.parse(badge.unlockedAt) > Date.parse(current.unlockedAt ?? current.updatedAt)) {
      latest.set(badge.id, badge);
    }
  }
  return latest;
}

function achievementEventIdForBadge(badge: ExpeditionBadge): string {
  const source = badge.unlockedTripId
    ? `trip:${badge.unlockedTripId}`
    : `earned:${badge.unlockedAt}`;
  return `badge:${badge.id}:${source}`;
}

/** Adapts newly persisted earned records into presentation-only events. */
export function buildBadgeUnlockEvents(
  newlyEarned: readonly ExpeditionBadge[],
  previouslyEarned: readonly ExpeditionBadge[],
): BadgeUnlockEvent[] {
  const previousById = latestBadgeById(previouslyEarned);
  const seen = new Set<string>();

  return newlyEarned.flatMap((badge) => {
    const definition = getBadgeDefinition(badge.id);
    if (!definition || !badge.unlockedAt) return [];
    const achievementEventId = achievementEventIdForBadge(badge);
    if (seen.has(achievementEventId)) return [];
    seen.add(achievementEventId);

    const prior = previousById.get(badge.id);
    const previousValue = definition.isRepeatable
      ? finiteOptionalNumber(prior?.progressCurrent)
      : undefined;
    const currentValue = definition.isRepeatable
      ? finiteOptionalNumber(badge.progressCurrent)
      : undefined;

    return [{
      schemaVersion: BADGE_UNLOCK_EVENT_SCHEMA_VERSION,
      achievementEventId,
      badgeId: definition.id,
      earnedAt: badge.unlockedAt,
      firstUnlock: !prior,
      ...(previousValue == null ? {} : { previousValue }),
      ...(currentValue == null ? {} : { currentValue }),
    }];
  });
}

function stableHash(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function sortEventsByRarity(events: BadgeUnlockEvent[]): BadgeUnlockEvent[] {
  return [...events].sort((left, right) => {
    const leftRarity = getBadgeDefinition(left.badgeId)?.rarity ?? 'common';
    const rightRarity = getBadgeDefinition(right.badgeId)?.rarity ?? 'common';
    return RARITY_PRIORITY[rightRarity] - RARITY_PRIORITY[leftRarity];
  });
}

function modeForEvent(event: BadgeUnlockEvent, sequenceIndex: number): BadgeUnlockPresentationMode {
  const definition = getBadgeDefinition(event.badgeId);
  if (definition?.isRepeatable && !event.firstUnlock) return 'record';
  return sequenceIndex === 0 ? 'full' : 'short';
}

export function planBadgeUnlockPresentations(
  rawEvents: readonly BadgeUnlockEvent[],
): BadgeUnlockPresentationItem[] {
  const eventById = new Map<string, BadgeUnlockEvent>();
  for (const rawEvent of rawEvents) {
    const event = normalizeBadgeUnlockEvent(rawEvent);
    if (event) eventById.set(event.achievementEventId, event);
  }
  const events = sortEventsByRarity(Array.from(eventById.values()));
  if (events.length === 0) return [];

  const batchId = `badge-unlock-${stableHash(events.map((event) => event.achievementEventId).sort().join('|'))}`;
  if (events.length >= 4) {
    const [primary, ...additional] = events;
    return [
      {
        schemaVersion: BADGE_UNLOCK_PRESENTATION_SCHEMA_VERSION,
        id: `${batchId}:badge`,
        batchId,
        kind: 'badge',
        events: [primary],
        badgeId: primary.badgeId,
        mode: modeForEvent(primary, 0),
        sequenceIndex: 0,
        sequenceCount: 2,
      },
      {
        schemaVersion: BADGE_UNLOCK_PRESENTATION_SCHEMA_VERSION,
        id: `${batchId}:summary`,
        batchId,
        kind: 'summary',
        events: additional,
        additionalCount: additional.length,
        sequenceIndex: 1,
        sequenceCount: 2,
      },
    ];
  }

  return events.map((event, index) => ({
    schemaVersion: BADGE_UNLOCK_PRESENTATION_SCHEMA_VERSION,
    id: `${batchId}:${index}`,
    batchId,
    kind: 'badge' as const,
    events: [event],
    badgeId: event.badgeId,
    mode: modeForEvent(event, index),
    sequenceIndex: index,
    sequenceCount: events.length,
  }));
}

function animationPolicy(
  item: BadgeUnlockPresentationItem,
  reduceMotion: boolean,
): BadgeUnlockAnimationPolicy {
  const durationMs = item.kind === 'summary'
    ? 1300
    : item.mode === 'record'
      ? 900
      : item.mode === 'short'
        ? 1200
        : 2100;
  const revealAtMs = item.kind === 'summary'
    ? 180
    : item.mode === 'record'
      ? 240
      : item.mode === 'short'
        ? 360
        : 600;

  return {
    durationMs,
    revealAtMs,
    tapDismissAtMs: revealAtMs,
    animateScale: !reduceMotion && item.kind === 'badge',
    scaleOvershoot: !reduceMotion && item.kind === 'badge' && item.mode === 'full',
    animateRotation: !reduceMotion && item.kind === 'badge' && item.mode === 'full',
    animateParticleMotion: !reduceMotion && item.kind === 'badge',
    animateSweep: !reduceMotion && item.kind === 'badge',
  };
}

function rarityLabel(rarity: ExpeditionBadgeRarity): string {
  return rarity === 'hidden' ? 'HIDDEN' : rarity.toUpperCase();
}

export function getBadgeUnlockPresentationModel(
  item: BadgeUnlockPresentationItem,
  reduceMotion: boolean,
): BadgeUnlockPresentationModel | null {
  const animation = animationPolicy(item, reduceMotion);
  if (item.kind === 'summary') {
    return {
      itemId: item.id,
      kind: item.kind,
      badgeId: null,
      title: `${item.additionalCount} additional ${item.additionalCount === 1 ? 'badge' : 'badges'} earned`,
      headline: 'EXPEDITION ACHIEVEMENTS UPDATED',
      rarity: null,
      rarityLabel: null,
      isHidden: false,
      previousValue: null,
      currentValue: null,
      additionalCount: item.additionalCount,
      theme: null,
      animation,
    };
  }

  const definition = getBadgeDefinition(item.badgeId);
  const event = item.events[0];
  if (!definition || !event) return null;
  const isRecordImprovement = definition.isRepeatable && !event.firstUnlock;
  return {
    itemId: item.id,
    kind: item.kind,
    badgeId: definition.id,
    title: definition.title,
    headline: definition.isHidden
      ? 'SECRET BADGE DISCOVERED'
      : isRecordImprovement
        ? 'PERSONAL RECORD IMPROVED'
        : 'BADGE ACHIEVED',
    rarity: definition.rarity,
    rarityLabel: rarityLabel(definition.rarity),
    isHidden: definition.isHidden,
    previousValue: finiteOptionalNumber(event.previousValue) ?? null,
    currentValue: finiteOptionalNumber(event.currentValue) ?? null,
    additionalCount: 0,
    theme: ECS_BADGE_RARITY[definition.rarity],
    animation,
  };
}

export function getBadgeUnlockItemEventIds(item: BadgeUnlockPresentationItem): string[] {
  return item.events.map((event) => event.achievementEventId);
}
