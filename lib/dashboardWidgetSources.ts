export type DashboardValueSource =
  | 'live'
  | 'bluetooth'
  | 'ai-derived'
  | 'manual'
  | 'unavailable';

export interface DashboardSourceCandidate<T> {
  source: DashboardValueSource;
  value: T | null | undefined;
  available?: boolean;
  updatedAt?: number | null;
  detail?: string | null;
}

export interface DashboardResolvedValue<T> {
  source: DashboardValueSource;
  value: T;
  updatedAt?: number | null;
  detail?: string | null;
}

const SOURCE_PRIORITY: Record<DashboardValueSource, number> = {
  live: 4,
  bluetooth: 3,
  'ai-derived': 2,
  manual: 1,
  unavailable: 0,
};

function hasCandidateValue<T>(value: T | null | undefined): value is T {
  if (value == null) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  return true;
}

export function resolveDashboardValue<T>(
  candidates: Array<DashboardSourceCandidate<T>>,
): DashboardResolvedValue<T> | null {
  const viable = candidates
    .filter((candidate) => candidate.available !== false)
    .filter((candidate) => hasCandidateValue(candidate.value))
    .sort((a, b) => SOURCE_PRIORITY[b.source] - SOURCE_PRIORITY[a.source]);

  if (viable.length === 0) return null;

  const selected = viable[0];
  return {
    source: selected.source,
    value: selected.value as T,
    updatedAt: selected.updatedAt ?? null,
    detail: selected.detail ?? null,
  };
}

export function getDashboardSourceLabel(
  source: DashboardValueSource,
  format: 'short' | 'long' = 'long',
): string {
  const labels: Record<DashboardValueSource, { short: string; long: string }> = {
    live: { short: 'LIVE', long: 'Live telemetry' },
    bluetooth: { short: 'BLUETOOTH', long: 'Bluetooth live' },
    'ai-derived': { short: 'ECS', long: 'ECS-derived / route-derived' },
    manual: { short: 'MANUAL', long: 'Manual entry / fallback' },
    unavailable: { short: 'UNAVAILABLE', long: 'Unavailable' },
  };

  return labels[source][format];
}

export function getDashboardSourceTone(source: DashboardValueSource) {
  switch (source) {
    case 'live':
      return 'live' as const;
    case 'bluetooth':
      return 'good' as const;
    case 'ai-derived':
      return 'warning' as const;
    case 'manual':
      return 'neutral' as const;
    case 'unavailable':
    default:
      return 'unavailable' as const;
  }
}

export function isDashboardLiveSource(source: DashboardValueSource): boolean {
  return source === 'live' || source === 'bluetooth';
}
