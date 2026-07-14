import type { TripLearningPreferences } from './tripLearningTypes';

export type TripLearningFeatureFlags = {
  tripLearningLocalEnabled?: boolean | null;
};

export const DEFAULT_TRIP_LEARNING_PREFERENCES: TripLearningPreferences = {
  schemaVersion: 'ecs.trip-learning.preferences.v1',
  enabled: false,
  calibrationProposalsEnabled: true,
  inspectionPromptsEnabled: true,
  localOnly: true,
  cloudSyncEnabled: false,
  updatedAt: '1970-01-01T00:00:00.000Z',
};

function booleanFlag(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value;
  const normalized = String(value ?? '').trim().toLowerCase();
  if (['1', 'true', 'yes', 'on', 'enabled'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off', 'disabled'].includes(normalized)) return false;
  return null;
}

/** Restricted local foundation flag. It fails closed in every build. */
export function isTripLearningLocalFeatureEnabled(
  flags?: TripLearningFeatureFlags | null,
): boolean {
  const explicit = booleanFlag(flags?.tripLearningLocalEnabled);
  if (explicit != null) return explicit;

  const globalFlag = booleanFlag(
    (globalThis as { __ECS_TRIP_LEARNING_LOCAL__?: unknown })
      .__ECS_TRIP_LEARNING_LOCAL__,
  );
  if (globalFlag != null) return globalFlag;

  const environment = booleanFlag(
    typeof process !== 'undefined'
      ? process.env?.EXPO_PUBLIC_ECS_TRIP_LEARNING_LOCAL
      : null,
  );
  return environment ?? false;
}

export function isTripLearningEffective(
  preferences: TripLearningPreferences | null | undefined,
  flags?: TripLearningFeatureFlags | null,
): boolean {
  return isTripLearningLocalFeatureEnabled(flags) && preferences?.enabled === true;
}

export function normalizeTripLearningPreferences(
  value: Partial<TripLearningPreferences> | null | undefined,
  now = new Date().toISOString(),
): TripLearningPreferences {
  return {
    schemaVersion: 'ecs.trip-learning.preferences.v1',
    enabled: value?.enabled === true,
    calibrationProposalsEnabled: value?.calibrationProposalsEnabled !== false,
    inspectionPromptsEnabled: value?.inspectionPromptsEnabled !== false,
    localOnly: true,
    cloudSyncEnabled: false,
    updatedAt: Number.isFinite(Date.parse(String(value?.updatedAt ?? '')))
      ? String(value?.updatedAt)
      : now,
  };
}
