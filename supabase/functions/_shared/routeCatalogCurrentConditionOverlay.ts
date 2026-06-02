export type RouteCatalogCurrentConditionOverlay = {
  status: 'clear' | 'watch' | 'blocked' | 'not_assessed';
  label: string;
  currentlyOpenStatus: 'no_known_closure' | 'requires_review' | 'closed' | 'unknown';
  passabilityStatus: 'not_assessed' | 'requires_review' | 'unknown';
  activeClosureCount: number;
  seasonalRestrictionCount: number;
  warnings: string[];
  blockers: string[];
  closureSummaries?: string[];
  sourceCheckedAt?: string[];
  staleAt?: string[];
  lastEvaluatedAt: string;
};

function readRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? value as Record<string, unknown> : null;
}

function readString(record: Record<string, unknown> | null, ...keys: string[]): string | null {
  if (!record) return null;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim().length > 0) return value.trim();
  }
  return null;
}

function readNumber(record: Record<string, unknown> | null, ...keys: string[]): number | null {
  if (!record) return null;
  for (const key of keys) {
    const value = Number(record[key]);
    if (Number.isFinite(value)) return value;
  }
  return null;
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item ?? '').trim()).filter(Boolean);
}

function stringArrayFrom(record: Record<string, unknown> | null, ...keys: string[]): string[] {
  if (!record) return [];
  for (const key of keys) {
    const values = readStringArray(record[key]);
    if (values.length > 0) return values;
  }
  return [];
}

function unique(values: string[], limit = 10): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  values.forEach((value) => {
    const trimmed = value.trim();
    const key = trimmed.toLowerCase();
    if (!trimmed || seen.has(key)) return;
    seen.add(key);
    result.push(trimmed);
  });
  return result.slice(0, limit);
}

function hasCurrentConditionCaveat(record: Record<string, unknown>): boolean {
  const warnings = readStringArray(record.warning_reasons ?? record.warningReasons);
  return warnings.some((warning) =>
    /current|closure|fire|weather|seasonal|gate|passability|permit|signage|trip-date/i.test(warning),
  );
}

function normalizeStatus(value: unknown): RouteCatalogCurrentConditionOverlay['status'] | null {
  const status = String(value ?? '').trim();
  if (status === 'clear' || status === 'watch' || status === 'blocked' || status === 'not_assessed') return status;
  return null;
}

function normalizeOpenStatus(value: unknown): RouteCatalogCurrentConditionOverlay['currentlyOpenStatus'] | null {
  const status = String(value ?? '').trim();
  if (status === 'no_known_closure' || status === 'requires_review' || status === 'closed' || status === 'unknown') {
    return status;
  }
  return null;
}

function normalizePassabilityStatus(value: unknown): RouteCatalogCurrentConditionOverlay['passabilityStatus'] | null {
  const status = String(value ?? '').trim();
  if (status === 'not_assessed' || status === 'requires_review' || status === 'unknown') return status;
  return null;
}

export function buildRouteCatalogCurrentConditionOverlay(
  route: Record<string, unknown>,
  lastEvaluatedAt = new Date().toISOString(),
): RouteCatalogCurrentConditionOverlay {
  const explicit = readRecord(route.current_condition ?? route.currentCondition);
  const communitySignal = readRecord(route.community_signal ?? route.communitySignal);
  const signal = readRecord(communitySignal?.currentConditions ?? communitySignal?.current_conditions);
  const sourceCount = Math.max(
    readNumber(explicit, 'sourceCount', 'source_count') ?? 0,
    readNumber(signal, 'sourceCount', 'source_count') ?? 0,
  );
  const activeClosureCount = Math.max(
    readNumber(route, 'active_closure_count', 'activeClosureCount') ?? 0,
    readNumber(explicit, 'activeClosureCount', 'active_closure_count') ?? 0,
    readNumber(signal, 'activeClosureCount', 'active_closure_count') ?? 0,
  );
  const watchClosureCount = Math.max(
    readNumber(explicit, 'watchClosureCount', 'watch_closure_count') ?? 0,
    readNumber(signal, 'watchClosureCount', 'watch_closure_count') ?? 0,
  );
  const seasonalRestrictionCount = readNumber(route, 'seasonal_restriction_count', 'seasonalRestrictionCount') ?? 0;
  const warningReasonsHaveConditionCaveat = hasCurrentConditionCaveat(route);

  const warnings = [];
  const blockers = [];
  if (activeClosureCount > 0) blockers.push('Current-condition overlay reports an active official closure.');
  if (watchClosureCount > 0 || warningReasonsHaveConditionCaveat) {
    warnings.push('Current-condition notice requires trip-date review.');
  }
  if (seasonalRestrictionCount > 0) warnings.push('Seasonal restrictions require trip-date review.');
  if (sourceCount === 0 && !warningReasonsHaveConditionCaveat) {
    warnings.push('No current-condition/closure overlay has verified this route as currently open or passable.');
  }

  const explicitWarnings = [
    ...stringArrayFrom(explicit, 'warnings', 'warningReasons', 'warning_reasons'),
    ...stringArrayFrom(signal, 'warnings', 'warningReasons', 'warning_reasons'),
  ];
  const explicitBlockers = [
    ...stringArrayFrom(explicit, 'blockers', 'blockerReasons', 'blocker_reasons'),
    ...stringArrayFrom(signal, 'blockers', 'blockerReasons', 'blocker_reasons'),
  ];

  let status: RouteCatalogCurrentConditionOverlay['status'] =
    activeClosureCount > 0 || explicitBlockers.length > 0
      ? 'blocked'
      : watchClosureCount > 0 || seasonalRestrictionCount > 0 || warningReasonsHaveConditionCaveat || explicitWarnings.length > 0
        ? 'watch'
        : sourceCount > 0
          ? 'clear'
          : 'not_assessed';
  status = normalizeStatus(explicit?.status ?? signal?.status) ?? status;

  const currentlyOpenStatus = normalizeOpenStatus(explicit?.currentlyOpenStatus ?? explicit?.currently_open_status) ??
    normalizeOpenStatus(signal?.currentlyOpenStatus ?? signal?.currently_open_status) ??
    (status === 'blocked'
      ? 'closed'
      : status === 'clear'
        ? 'no_known_closure'
        : status === 'watch'
          ? 'requires_review'
          : 'unknown');
  const passabilityStatus = normalizePassabilityStatus(explicit?.passabilityStatus ?? explicit?.passability_status) ??
    normalizePassabilityStatus(signal?.passabilityStatus ?? signal?.passability_status) ??
    (status === 'watch' ? 'requires_review' : status === 'clear' ? 'unknown' : 'not_assessed');
  const label = readString(explicit, 'label') ??
    readString(signal, 'label') ??
    (status === 'blocked'
      ? 'Current-condition closure conflict'
      : status === 'watch'
        ? 'Current conditions require trip-date review'
        : status === 'clear'
          ? 'No active current-condition closure known'
          : 'Current conditions not assessed');
  const closureSummaries = unique([
    ...readStringArray(route.closure_summaries ?? route.closureSummaries),
    ...stringArrayFrom(explicit, 'closureSummaries', 'closure_summaries'),
    ...stringArrayFrom(signal, 'closureSummaries', 'closure_summaries'),
  ], 8);
  const sourceCheckedAt = unique([
    ...stringArrayFrom(explicit, 'sourceCheckedAt', 'source_checked_at', 'checkedAt', 'checked_at'),
    ...stringArrayFrom(signal, 'sourceCheckedAt', 'source_checked_at', 'checkedAt', 'checked_at'),
  ], 8);
  const staleAt = unique([
    ...stringArrayFrom(explicit, 'staleAt', 'stale_at'),
    ...stringArrayFrom(signal, 'staleAt', 'stale_at'),
  ], 8);

  return {
    status,
    label,
    currentlyOpenStatus,
    passabilityStatus,
    activeClosureCount,
    seasonalRestrictionCount,
    warnings: unique([...warnings, ...explicitWarnings], 10),
    blockers: unique([...blockers, ...explicitBlockers], 8),
    closureSummaries: closureSummaries.length > 0 ? closureSummaries : undefined,
    sourceCheckedAt: sourceCheckedAt.length > 0 ? sourceCheckedAt : undefined,
    staleAt: staleAt.length > 0 ? staleAt : undefined,
    lastEvaluatedAt,
  };
}

export function attachCurrentConditionOverlays(
  records: Record<string, unknown>[],
  lastEvaluatedAt = new Date().toISOString(),
): Record<string, unknown>[] {
  return records.map((record) => ({
    ...record,
    current_condition: buildRouteCatalogCurrentConditionOverlay(record, lastEvaluatedAt),
  }));
}
