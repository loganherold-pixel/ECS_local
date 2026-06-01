import type { ECSTrailPack, ECSTrailPackReviewStatus } from './trailPacks';
import {
  getTrailPackFeedbackForTrailPack,
  summarizeTrailPackFeedback,
  type ECSTrailPackFeedback,
} from './trailPackFeedback';

export type ECSTrailPackReviewAction =
  | 'approve'
  | 'reject'
  | 'request_more_data'
  | 'flag_private_land'
  | 'flag_closure'
  | 'flag_sensitive_area'
  | 'merge_duplicate'
  | 'archive';

export type ECSTrailPackReviewReason =
  | 'duplicate'
  | 'unsafe'
  | 'restricted_private_land'
  | 'insufficient_geometry'
  | 'insufficient_confidence'
  | 'sensitive_campsite_location'
  | 'spam'
  | 'poor_route_quality'
  | 'seasonal_closure_issue'
  | 'approved_with_caution';

export type ECSTrailPackReviewActionInput = {
  trailPackId: string;
  reviewerId?: string;
  action: ECSTrailPackReviewAction;
  reason: ECSTrailPackReviewReason | string;
  duplicateOfTrailPackId?: string;
  timestamp?: string;
};

export type ECSTrailPackReviewEvent = {
  id: string;
  trailPackId: string;
  reviewerId?: string;
  action: ECSTrailPackReviewAction;
  reason: ECSTrailPackReviewReason | string;
  timestamp: string;
  duplicateOfTrailPackId?: string;
};

export type ECSTrailPackReviewState = {
  trailPackId: string;
  reviewStatus: ECSTrailPackReviewStatus;
  publicSuppressed: boolean;
  archived?: boolean;
  duplicateOfTrailPackId?: string;
  lastAction?: ECSTrailPackReviewEvent;
  actions: ECSTrailPackReviewEvent[];
};

export type ECSTrailPackReviewQueueSnapshot = {
  states: Record<string, ECSTrailPackReviewState>;
  actions: ECSTrailPackReviewEvent[];
};

type Listener = () => void;

const STORAGE_KEY = 'ecs.trailPackReviewQueue.v1';
const listeners = new Set<Listener>();
let memorySnapshot: ECSTrailPackReviewQueueSnapshot = { states: {}, actions: [] };

export const TRAIL_PACK_REVIEW_REASON_LABELS: Record<ECSTrailPackReviewReason, string> = {
  duplicate: 'Duplicate',
  unsafe: 'Unsafe',
  restricted_private_land: 'Restricted/private land',
  insufficient_geometry: 'Insufficient geometry',
  insufficient_confidence: 'Insufficient confidence',
  sensitive_campsite_location: 'Sensitive campsite/location',
  spam: 'Spam',
  poor_route_quality: 'Poor route quality',
  seasonal_closure_issue: 'Seasonal closure issue',
  approved_with_caution: 'Approved with caution',
};

function getStorage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function readSnapshot(): ECSTrailPackReviewQueueSnapshot {
  const storage = getStorage();
  if (!storage) return memorySnapshot;
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return { states: {}, actions: [] };
    const parsed = JSON.parse(raw) as Partial<ECSTrailPackReviewQueueSnapshot>;
    const actions = Array.isArray(parsed.actions)
      ? parsed.actions.filter(isReviewEvent)
      : [];
    const states = parsed.states && typeof parsed.states === 'object'
      ? Object.entries(parsed.states).reduce<Record<string, ECSTrailPackReviewState>>((acc, [id, state]) => {
          if (isReviewState(state)) acc[id] = state;
          return acc;
        }, {})
      : {};
    return { states, actions };
  } catch {
    return { states: {}, actions: [] };
  }
}

function writeSnapshot(snapshot: ECSTrailPackReviewQueueSnapshot): boolean {
  memorySnapshot = snapshot;
  const storage = getStorage();
  if (!storage) return true;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
    return true;
  } catch {
    return false;
  }
}

function notifyListeners(): void {
  listeners.forEach((listener) => listener());
}

function isReviewEvent(value: unknown): value is ECSTrailPackReviewEvent {
  if (!value || typeof value !== 'object') return false;
  const event = value as Partial<ECSTrailPackReviewEvent>;
  return (
    typeof event.id === 'string' &&
    typeof event.trailPackId === 'string' &&
    typeof event.action === 'string' &&
    typeof event.reason === 'string' &&
    typeof event.timestamp === 'string'
  );
}

function isReviewState(value: unknown): value is ECSTrailPackReviewState {
  if (!value || typeof value !== 'object') return false;
  const state = value as Partial<ECSTrailPackReviewState>;
  return (
    typeof state.trailPackId === 'string' &&
    typeof state.reviewStatus === 'string' &&
    typeof state.publicSuppressed === 'boolean' &&
    Array.isArray(state.actions)
  );
}

function eventId(input: ECSTrailPackReviewActionInput, timestamp: string): string {
  const reviewer = input.reviewerId?.replace(/[^a-z0-9_-]/gi, '_') ?? 'internal';
  return `trail-pack-review:${input.trailPackId}:${input.action}:${reviewer}:${Date.parse(timestamp)}`;
}

export function getTrailPackReviewStatusAfterAction(
  currentStatus: ECSTrailPackReviewStatus,
  action: ECSTrailPackReviewAction,
): ECSTrailPackReviewStatus {
  switch (action) {
    case 'approve':
      return 'approved';
    case 'reject':
    case 'archive':
    case 'merge_duplicate':
      return 'rejected';
    case 'request_more_data':
    case 'flag_private_land':
    case 'flag_closure':
    case 'flag_sensitive_area':
      return 'needs_more_data';
    default:
      return currentStatus;
  }
}

export function shouldSuppressTrailPackForReview(
  status: ECSTrailPackReviewStatus,
  action?: ECSTrailPackReviewAction,
): boolean {
  if (status !== 'approved') return true;
  return action === 'archive' || action === 'merge_duplicate';
}

export function createTrailPackReviewEvent(
  input: ECSTrailPackReviewActionInput,
): ECSTrailPackReviewEvent {
  const timestamp = input.timestamp ?? new Date().toISOString();
  return {
    id: eventId(input, timestamp),
    trailPackId: input.trailPackId,
    reviewerId: input.reviewerId,
    action: input.action,
    reason: input.reason,
    timestamp,
    duplicateOfTrailPackId: input.duplicateOfTrailPackId,
  };
}

export function applyTrailPackReviewAction(
  pack: ECSTrailPack,
  input: Omit<ECSTrailPackReviewActionInput, 'trailPackId'> & { trailPackId?: string },
  existingState?: ECSTrailPackReviewState | null,
): { trailPack: ECSTrailPack; state: ECSTrailPackReviewState; event: ECSTrailPackReviewEvent } {
  const event = createTrailPackReviewEvent({
    ...input,
    trailPackId: input.trailPackId ?? pack.id,
  });
  const nextStatus = getTrailPackReviewStatusAfterAction(
    existingState?.reviewStatus ?? pack.reviewStatus,
    event.action,
  );
  const actions = [...(existingState?.actions ?? []), event];
  const state: ECSTrailPackReviewState = {
    trailPackId: pack.id,
    reviewStatus: nextStatus,
    publicSuppressed: shouldSuppressTrailPackForReview(nextStatus, event.action),
    archived: event.action === 'archive' ? true : existingState?.archived,
    duplicateOfTrailPackId:
      event.action === 'merge_duplicate'
        ? event.duplicateOfTrailPackId ?? existingState?.duplicateOfTrailPackId
        : existingState?.duplicateOfTrailPackId,
    lastAction: event,
    actions,
  };

  return {
    trailPack: {
      ...pack,
      reviewStatus: nextStatus,
      updatedAt: event.timestamp,
    },
    state,
    event,
  };
}

export function getTrailPackReviewStateFromFeedback(
  pack: ECSTrailPack,
  feedbackEvents: ECSTrailPackFeedback[],
): ECSTrailPackReviewState | null {
  const feedbackForPack = getTrailPackFeedbackForTrailPack(pack.id, feedbackEvents);
  if (feedbackForPack.length === 0) return null;

  const summary = summarizeTrailPackFeedback(feedbackForPack);
  if (!summary.needsReview && summary.negativeCount === 0) return null;

  const sortedFeedbackTimestamps = feedbackForPack
    .map((event) => event.createdAt)
    .sort();
  const timestamp = sortedFeedbackTimestamps[sortedFeedbackTimestamps.length - 1] ?? new Date().toISOString();
  const reason: ECSTrailPackReviewReason =
    summary.privateLandConcernCount > 0
      ? 'restricted_private_land'
      : summary.closureConcernCount > 0
        ? 'seasonal_closure_issue'
        : 'unsafe';
  const action: ECSTrailPackReviewAction =
    summary.privateLandConcernCount > 0
      ? 'flag_private_land'
      : summary.closureConcernCount > 0
        ? 'flag_closure'
        : 'request_more_data';
  const event = createTrailPackReviewEvent({
    trailPackId: pack.id,
    action,
    reason,
    timestamp,
  });

  return {
    trailPackId: pack.id,
    reviewStatus: 'needs_more_data',
    publicSuppressed: true,
    lastAction: event,
    actions: [event],
  };
}

export function buildTrailPackReviewStatesFromFeedback(
  trailPacks: ECSTrailPack[],
  feedbackEvents: ECSTrailPackFeedback[],
): Record<string, ECSTrailPackReviewState> {
  return trailPacks.reduce<Record<string, ECSTrailPackReviewState>>((acc, pack) => {
    const state = getTrailPackReviewStateFromFeedback(pack, feedbackEvents);
    if (state) acc[pack.id] = state;
    return acc;
  }, {});
}

export function isTrailPackPubliclyDiscoverable(
  pack: Pick<ECSTrailPack, 'reviewStatus' | 'id'>,
  reviewState?: ECSTrailPackReviewState | null,
): boolean {
  const status = reviewState?.reviewStatus ?? pack.reviewStatus;
  return status === 'approved' && reviewState?.publicSuppressed !== true;
}

export const trailPackReviewQueueStore = {
  getSnapshot(): ECSTrailPackReviewQueueSnapshot {
    return readSnapshot();
  },

  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },

  recordAction(
    pack: ECSTrailPack,
    input: Omit<ECSTrailPackReviewActionInput, 'trailPackId'> & { trailPackId?: string },
  ): { trailPack: ECSTrailPack; state: ECSTrailPackReviewState; event: ECSTrailPackReviewEvent } {
    const snapshot = readSnapshot();
    const result = applyTrailPackReviewAction(pack, input, snapshot.states[pack.id]);
    const nextSnapshot: ECSTrailPackReviewQueueSnapshot = {
      actions: [...snapshot.actions, result.event],
      states: {
        ...snapshot.states,
        [pack.id]: result.state,
      },
    };
    writeSnapshot(nextSnapshot);
    notifyListeners();
    return result;
  },

  clearForTests(): void {
    writeSnapshot({ states: {}, actions: [] });
    notifyListeners();
  },
};
