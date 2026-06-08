export const ECS_FALLBACK_LABELS = {
  unknown: 'Unknown',
  unavailable: 'Unavailable',
  stale: 'Stale',
  demo: 'Demo',
  mock: 'Mock',
  partial: 'Partial',
  live: 'Live',
  verified: 'Verified',
} as const;

export type ECSFallbackStateKey = keyof typeof ECS_FALLBACK_LABELS;
