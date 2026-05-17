import type { ECSTrailPackConfidenceInput } from './trailPackConfidence';

export type ECSTrailPackFeedbackType =
  | 'completed'
  | 'saved'
  | 'recommended'
  | 'reported_issue'
  | 'conditions_changed'
  | 'route_blocked'
  | 'private_land_concern'
  | 'closure_concern'
  | 'vehicle_not_suitable'
  | 'positive'
  | 'needs_review';

export type ECSTrailPackIssueReason =
  | 'blocked_route'
  | 'closure'
  | 'private_land'
  | 'unsafe_condition'
  | 'vehicle_mismatch'
  | 'inaccurate_route'
  | 'other';

export type ECSTrailPackFeedbackSource = 'manual' | 'guidance_completion';

export type ECSTrailPackFeedback = {
  id: string;
  trailPackId: string;
  userId?: string;
  type: ECSTrailPackFeedbackType;
  note?: string;
  vehicleProfileId?: string;
  source?: ECSTrailPackFeedbackSource;
  createdAt: string;
};

export type ECSTrailPackFeedbackInput = {
  trailPackId: string;
  userId?: string;
  type: ECSTrailPackFeedbackType;
  note?: string;
  vehicleProfileId?: string;
  source?: ECSTrailPackFeedbackSource;
};

export type ECSTrailPackFeedbackResult =
  | { ok: true; feedback: ECSTrailPackFeedback }
  | { ok: false; reason: string; duplicate?: boolean; offline?: boolean };

export type ECSTrailPackFeedbackSummary = {
  completedCount: number;
  savedCount: number;
  recommendedCount: number;
  positiveCount: number;
  issueCount: number;
  negativeCount: number;
  closureConcernCount: number;
  privateLandConcernCount: number;
  blockedRouteCount: number;
  vehicleMismatchCount: number;
  needsReview: boolean;
  lastCompletedAt?: string;
};

const STORAGE_KEY = 'ecs.trailPackFeedback.v1';
const DUPLICATE_LIMITED_TYPES = new Set<ECSTrailPackFeedbackType>([
  'saved',
  'recommended',
  'positive',
]);
const NEGATIVE_TYPES = new Set<ECSTrailPackFeedbackType>([
  'reported_issue',
  'conditions_changed',
  'route_blocked',
  'private_land_concern',
  'closure_concern',
  'vehicle_not_suitable',
  'needs_review',
]);
const REVIEW_TYPES = new Set<ECSTrailPackFeedbackType>([
  'route_blocked',
  'private_land_concern',
  'closure_concern',
  'needs_review',
]);

let memoryFeedback: ECSTrailPackFeedback[] = [];
const listeners = new Set<() => void>();

function getStorage(): Storage | null {
  try {
    const maybeStorage = globalThis.localStorage;
    if (!maybeStorage) return null;
    return maybeStorage;
  } catch {
    return null;
  }
}

function isOnline(): boolean {
  const nav = globalThis.navigator;
  if (!nav || typeof nav.onLine !== 'boolean') return true;
  return nav.onLine;
}

function readStoredFeedback(): ECSTrailPackFeedback[] {
  const storage = getStorage();
  if (!storage) return memoryFeedback;
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isFeedbackEvent);
  } catch {
    return [];
  }
}

function writeStoredFeedback(events: ECSTrailPackFeedback[]): boolean {
  memoryFeedback = events;
  const storage = getStorage();
  if (!storage) return true;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(events));
    return true;
  } catch {
    return false;
  }
}

function isFeedbackEvent(value: unknown): value is ECSTrailPackFeedback {
  if (!value || typeof value !== 'object') return false;
  const event = value as Partial<ECSTrailPackFeedback>;
  return (
    typeof event.id === 'string' &&
    typeof event.trailPackId === 'string' &&
    typeof event.type === 'string' &&
    typeof event.createdAt === 'string'
  );
}

function userKey(userId: string | undefined): string {
  return userId?.trim() || 'anonymous';
}

function createFeedbackId(input: ECSTrailPackFeedbackInput, timestamp: string): string {
  const safeUser = userKey(input.userId).replace(/[^a-z0-9_-]/gi, '_');
  return `trail-pack-feedback:${input.trailPackId}:${input.type}:${safeUser}:${Date.parse(timestamp)}`;
}

function hasDuplicateLimitedFeedback(
  events: ECSTrailPackFeedback[],
  input: ECSTrailPackFeedbackInput,
): boolean {
  if (!DUPLICATE_LIMITED_TYPES.has(input.type)) return false;
  const submitter = userKey(input.userId);
  return events.some((event) =>
    event.trailPackId === input.trailPackId &&
    event.type === input.type &&
    userKey(event.userId) === submitter,
  );
}

function notifyListeners(): void {
  listeners.forEach((listener) => listener());
}

export function mapTrailPackIssueReasonToFeedbackType(
  reason: ECSTrailPackIssueReason,
): ECSTrailPackFeedbackType {
  switch (reason) {
    case 'blocked_route':
      return 'route_blocked';
    case 'closure':
      return 'closure_concern';
    case 'private_land':
      return 'private_land_concern';
    case 'vehicle_mismatch':
      return 'vehicle_not_suitable';
    case 'unsafe_condition':
      return 'reported_issue';
    case 'inaccurate_route':
      return 'conditions_changed';
    case 'other':
    default:
      return 'needs_review';
  }
}

export function submitTrailPackFeedback(input: ECSTrailPackFeedbackInput): ECSTrailPackFeedbackResult {
  if (!input.trailPackId || !input.type) {
    return { ok: false, reason: 'Trail Pack feedback is missing required fields.' };
  }

  if (!isOnline()) {
    return {
      ok: false,
      reason: 'Feedback is unavailable while offline. Try again once ECS has connectivity.',
      offline: true,
    };
  }

  const events = readStoredFeedback();
  if (hasDuplicateLimitedFeedback(events, input)) {
    return {
      ok: false,
      reason: 'Feedback already recorded for this Trail Pack.',
      duplicate: true,
    };
  }

  const createdAt = new Date().toISOString();
  const feedback: ECSTrailPackFeedback = {
    id: createFeedbackId(input, createdAt),
    trailPackId: input.trailPackId,
    userId: input.userId,
    type: input.type,
    note: input.note?.trim() || undefined,
    vehicleProfileId: input.vehicleProfileId,
    source: input.source ?? 'manual',
    createdAt,
  };

  const nextEvents = [...events, feedback];
  if (!writeStoredFeedback(nextEvents)) {
    return { ok: false, reason: 'Feedback could not be stored on this device.' };
  }

  notifyListeners();
  return { ok: true, feedback };
}

export function getTrailPackFeedbackSnapshot(): ECSTrailPackFeedback[] {
  return readStoredFeedback();
}

export function subscribeTrailPackFeedback(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getTrailPackFeedbackForTrailPack(
  trailPackId: string,
  events: ECSTrailPackFeedback[] = readStoredFeedback(),
): ECSTrailPackFeedback[] {
  return events.filter((event) => event.trailPackId === trailPackId);
}

export function summarizeTrailPackFeedback(
  events: ECSTrailPackFeedback[],
): ECSTrailPackFeedbackSummary {
  const summary: ECSTrailPackFeedbackSummary = {
    completedCount: 0,
    savedCount: 0,
    recommendedCount: 0,
    positiveCount: 0,
    issueCount: 0,
    negativeCount: 0,
    closureConcernCount: 0,
    privateLandConcernCount: 0,
    blockedRouteCount: 0,
    vehicleMismatchCount: 0,
    needsReview: false,
  };

  for (const event of events) {
    if (event.type === 'completed') {
      summary.completedCount += event.source === 'guidance_completion' ? 2 : 1;
      if (!summary.lastCompletedAt || Date.parse(event.createdAt) > Date.parse(summary.lastCompletedAt)) {
        summary.lastCompletedAt = event.createdAt;
      }
    }
    if (event.type === 'saved') summary.savedCount += 1;
    if (event.type === 'recommended') summary.recommendedCount += 1;
    if (event.type === 'positive') summary.positiveCount += 1;
    if (event.type === 'closure_concern') summary.closureConcernCount += 1;
    if (event.type === 'private_land_concern') summary.privateLandConcernCount += 1;
    if (event.type === 'route_blocked') summary.blockedRouteCount += 1;
    if (event.type === 'vehicle_not_suitable') summary.vehicleMismatchCount += 1;
    if (event.type === 'reported_issue' || event.type === 'conditions_changed') summary.issueCount += 1;
    if (NEGATIVE_TYPES.has(event.type)) summary.negativeCount += 1;
    if (REVIEW_TYPES.has(event.type)) summary.needsReview = true;
  }

  return summary;
}

export function buildTrailPackConfidenceInputFromFeedback(
  trailPackId: string,
  events: ECSTrailPackFeedback[] = readStoredFeedback(),
): ECSTrailPackConfidenceInput {
  const summary = summarizeTrailPackFeedback(getTrailPackFeedbackForTrailPack(trailPackId, events));
  const feedbackBlockers: string[] = [];

  if (summary.closureConcernCount > 0) feedbackBlockers.push('Community closure concern requires review');
  if (summary.privateLandConcernCount > 0) feedbackBlockers.push('Community private-land concern requires review');
  if (summary.blockedRouteCount > 0) feedbackBlockers.push('Community route-blocked report requires review');

  return {
    saveCount: summary.savedCount,
    independentConfirmationCount:
      summary.completedCount + summary.recommendedCount + summary.positiveCount,
    lastCompletedAt: summary.lastCompletedAt,
    recentHazardReportsCount:
      summary.issueCount +
      summary.closureConcernCount +
      summary.privateLandConcernCount +
      summary.blockedRouteCount +
      summary.vehicleMismatchCount,
    closureStatus:
      summary.closureConcernCount > 0 ||
      summary.privateLandConcernCount > 0 ||
      summary.blockedRouteCount > 0
        ? 'restricted'
        : undefined,
    feedbackNeedsReview: summary.needsReview || summary.negativeCount > 0,
    feedbackBlockers,
  };
}

export function buildTrailPackConfidenceInputsFromFeedback(
  events: ECSTrailPackFeedback[] = readStoredFeedback(),
): Record<string, ECSTrailPackConfidenceInput> {
  const ids = Array.from(new Set(events.map((event) => event.trailPackId)));
  return ids.reduce<Record<string, ECSTrailPackConfidenceInput>>((acc, trailPackId) => {
    acc[trailPackId] = buildTrailPackConfidenceInputFromFeedback(trailPackId, events);
    return acc;
  }, {});
}

export function clearTrailPackFeedbackForTests(): void {
  memoryFeedback = [];
  const storage = getStorage();
  try {
    storage?.removeItem(STORAGE_KEY);
  } catch {
    // Test utility only.
  }
  notifyListeners();
}
