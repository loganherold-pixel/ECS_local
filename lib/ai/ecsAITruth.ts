import type { ECSAIInput, ECSAISourceTruth } from './ecsAITypes';

export const ECS_AI_TRUTH_ORDER: ECSAISourceTruth[] = [
  'live',
  'cached',
  'estimated',
  'manual',
  'simulated',
  'unavailable',
];

export function clampECSAIConfidence(value: number | null | undefined, fallback = 0): number {
  const numeric = typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  return Math.max(0, Math.min(100, Math.round(numeric)));
}

export function normalizeECSAISourceTruth(value: unknown): ECSAISourceTruth {
  const text = String(value ?? '').trim().toLowerCase();
  if (text === 'live' || text === 'live_provider' || text === 'live_ble' || text === 'obd_live' || text === 'ble_live') {
    return 'live';
  }
  if (text === 'cache' || text === 'cached' || text === 'last_known' || text === 'recent' || text === 'stale') {
    return 'cached';
  }
  if (text === 'estimate' || text === 'estimated' || text === 'ecs_estimate' || text === 'catalog_estimate' || text === 'class_estimate') {
    return 'estimated';
  }
  if (text === 'manual' || text === 'manual_profile' || text === 'manual_estimate') {
    return 'manual';
  }
  if (text === 'simulated' || text === 'simulation' || text === 'demo') {
    return 'simulated';
  }
  return 'unavailable';
}

export function truthIsLive(truth: ECSAISourceTruth | ECSAISourceTruth[]): boolean {
  const values = Array.isArray(truth) ? truth : [truth];
  return values.length > 0 && values.every((item) => item === 'live');
}

export function truthRequiresLimitedCopy(truth: ECSAISourceTruth | ECSAISourceTruth[]): boolean {
  const values = Array.isArray(truth) ? truth : [truth];
  return values.some((item) => item !== 'live');
}

export function makeECSAIInput<T>(
  value: T | null | undefined,
  truth: ECSAISourceTruth,
  options: {
    confidence?: number | null;
    updatedAt?: string | number | null;
    sourceName?: string | null;
  } = {},
): ECSAIInput<T> {
  const updatedAt =
    typeof options.updatedAt === 'number'
      ? new Date(options.updatedAt).toISOString()
      : typeof options.updatedAt === 'string'
        ? options.updatedAt
        : undefined;

  return {
    value: value ?? null,
    truth: value == null ? 'unavailable' : truth,
    confidence: clampECSAIConfidence(options.confidence, value == null ? 0 : 50),
    updatedAt,
    sourceName: options.sourceName?.trim() || undefined,
  };
}

export function combineECSAITruth(values: Array<ECSAISourceTruth | null | undefined>): ECSAISourceTruth[] {
  const seen = new Set<ECSAISourceTruth>();
  for (const value of values) {
    if (!value) continue;
    seen.add(value);
  }
  return ECS_AI_TRUTH_ORDER.filter((value) => seen.has(value));
}
