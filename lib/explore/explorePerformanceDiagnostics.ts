export const ECS_EXPLORE_PERF_DEBUG_FLAG = 'EXPO_PUBLIC_ECS_EXPLORE_PERF_DEBUG';
export const ECS_EXPLORE_PERF_DEBUG_FALLBACK_FLAG = 'ECS_EXPLORE_PERF_DEBUG';

export type ExplorePerformanceFlow =
  | 'nearby_route_discovery'
  | 'route_catalog_refresh'
  | 'map_preview_render'
  | 'card_image_load';

export type ExplorePerformancePhase =
  | 'user_location_resolution'
  | 'radius_query'
  | 'route_catalog_query'
  | 'filter_sort'
  | 'geometry_normalization'
  | 'image_fetch_cache'
  | 'card_render'
  | 'map_render'
  | 'route_preview_render'
  | 'first_visible_result'
  | 'full_nearby_result_list';

export type ExplorePerformanceCounts = {
  routesEvaluated: number;
  routesRendered: number;
  imagesRequested: number;
  mapFeaturesRendered: number;
  previewRoutesRendered: number;
};

export type ExplorePerformancePhaseTiming = {
  phase: ExplorePerformancePhase;
  startedAtMs: number;
  endedAtMs: number;
  durationMs: number;
  metadata?: Record<string, unknown>;
};

export type ExplorePerformanceEventTiming = {
  phase: ExplorePerformancePhase;
  atMs: number;
  elapsedMs: number;
  metadata?: Record<string, unknown>;
};

export type ExplorePerformanceRun = {
  runId: string;
  flow: ExplorePerformanceFlow;
  searchKey: string;
  startedAtMs: number;
  metadata: Record<string, unknown>;
  phases: Partial<Record<ExplorePerformancePhase, ExplorePerformancePhaseTiming>>;
  events: Partial<Record<ExplorePerformancePhase, ExplorePerformanceEventTiming>>;
  counts: ExplorePerformanceCounts;
};

export type ExplorePerformanceSummary = {
  runId: string;
  flow: ExplorePerformanceFlow;
  searchKey: string;
  startedAtMs: number;
  completedAtMs: number;
  totalElapsedMs: number;
  timeToFirstVisibleResultMs: number | null;
  timeToFullNearbyResultListMs: number | null;
  phases: Partial<Record<ExplorePerformancePhase, ExplorePerformancePhaseTiming>>;
  events: Partial<Record<ExplorePerformancePhase, ExplorePerformanceEventTiming>>;
  counts: ExplorePerformanceCounts;
  slowestPhase: Pick<ExplorePerformancePhaseTiming, 'phase' | 'durationMs'>;
  bottleneckHints: string[];
  targets: {
    cachedFirstVisibleResultMs: number;
    freshSearchSkeletonImmediate: boolean;
    incrementalFullPopulation: boolean;
    imagesDoNotBlockMetadata: boolean;
    geometryDoesNotBlockMainUi: boolean;
  };
  metadata: Record<string, unknown>;
};

type Logger = {
  debug?: (scope: any, message: string, payload?: Record<string, unknown>) => void;
  log?: (scope: any, message: string, payload?: Record<string, unknown>) => void;
};

const EMPTY_COUNTS: ExplorePerformanceCounts = {
  routesEvaluated: 0,
  routesRendered: 0,
  imagesRequested: 0,
  mapFeaturesRendered: 0,
  previewRoutesRendered: 0,
};

function safeNumber(value: unknown, fallback = 0): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function elapsed(startedAtMs: number, endedAtMs: number): number {
  return Math.max(0, Math.round((safeNumber(endedAtMs) - safeNumber(startedAtMs)) * 10) / 10);
}

function compactMetadata(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? { ...(value as Record<string, unknown>) }
    : {};
}

function truthyFlag(value: unknown): boolean {
  if (value === true) return true;
  if (typeof value !== 'string') return false;
  return /^(1|true|yes|on)$/i.test(value.trim());
}

function count(value: unknown): number {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.round(number) : 0;
}

export function isExplorePerformanceDebugEnabled(
  env: Record<string, unknown> = typeof process !== 'undefined' ? process.env : {},
): boolean {
  return truthyFlag(env[ECS_EXPLORE_PERF_DEBUG_FLAG]) || truthyFlag(env[ECS_EXPLORE_PERF_DEBUG_FALLBACK_FLAG]);
}

export function getExplorePerformanceNow(): number {
  const perfNow = typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : null;
  return Number.isFinite(perfNow) ? perfNow as number : Date.now();
}

export function createExplorePerformanceRun(input: {
  flow: ExplorePerformanceFlow;
  searchKey: string;
  startedAtMs?: number;
  metadata?: Record<string, unknown>;
}): ExplorePerformanceRun {
  const startedAtMs = safeNumber(input.startedAtMs, getExplorePerformanceNow());
  return {
    runId: `${input.flow}:${input.searchKey}:${Math.round(startedAtMs)}`,
    flow: input.flow,
    searchKey: input.searchKey,
    startedAtMs,
    metadata: compactMetadata(input.metadata),
    phases: {},
    events: {},
    counts: { ...EMPTY_COUNTS },
  };
}

export function recordExplorePerformancePhase(
  run: ExplorePerformanceRun | null | undefined,
  phase: ExplorePerformancePhase,
  timing: {
    startedAtMs: number;
    endedAtMs: number;
    metadata?: Record<string, unknown>;
  },
): ExplorePerformanceRun | null | undefined {
  if (!run) return run;
  const startedAtMs = safeNumber(timing.startedAtMs, run.startedAtMs);
  const endedAtMs = safeNumber(timing.endedAtMs, startedAtMs);
  run.phases[phase] = {
    phase,
    startedAtMs,
    endedAtMs,
    durationMs: elapsed(startedAtMs, endedAtMs),
    ...(timing.metadata ? { metadata: compactMetadata(timing.metadata) } : {}),
  };
  return run;
}

export function markExplorePerformanceEvent(
  run: ExplorePerformanceRun | null | undefined,
  phase: ExplorePerformancePhase,
  atMs: number,
  metadata?: Record<string, unknown>,
): ExplorePerformanceRun | null | undefined {
  if (!run) return run;
  const eventAtMs = safeNumber(atMs, getExplorePerformanceNow());
  run.events[phase] = {
    phase,
    atMs: eventAtMs,
    elapsedMs: elapsed(run.startedAtMs, eventAtMs),
    ...(metadata ? { metadata: compactMetadata(metadata) } : {}),
  };
  return run;
}

export function recordExplorePerformanceCount(
  run: ExplorePerformanceRun | null | undefined,
  counts: Partial<ExplorePerformanceCounts>,
): ExplorePerformanceRun | null | undefined {
  if (!run) return run;
  run.counts = {
    routesEvaluated: count(counts.routesEvaluated ?? run.counts.routesEvaluated),
    routesRendered: count(counts.routesRendered ?? run.counts.routesRendered),
    imagesRequested: count(counts.imagesRequested ?? run.counts.imagesRequested),
    mapFeaturesRendered: count(counts.mapFeaturesRendered ?? run.counts.mapFeaturesRendered),
    previewRoutesRendered: count(counts.previewRoutesRendered ?? run.counts.previewRoutesRendered),
  };
  return run;
}

function getSlowestPhase(
  phases: Partial<Record<ExplorePerformancePhase, ExplorePerformancePhaseTiming>>,
): Pick<ExplorePerformancePhaseTiming, 'phase' | 'durationMs'> {
  const timings = Object.values(phases).filter((phase): phase is ExplorePerformancePhaseTiming => !!phase);
  if (timings.length === 0) return { phase: 'route_catalog_query', durationMs: 0 };
  const slowest = timings.reduce((current, next) =>
    next.durationMs > current.durationMs ? next : current,
  );
  return { phase: slowest.phase, durationMs: slowest.durationMs };
}

function buildBottleneckHints(summary: {
  phases: Partial<Record<ExplorePerformancePhase, ExplorePerformancePhaseTiming>>;
  counts: ExplorePerformanceCounts;
  slowestPhase: Pick<ExplorePerformancePhaseTiming, 'phase' | 'durationMs'>;
  timeToFirstVisibleResultMs: number | null;
}): string[] {
  const hints: string[] = [];
  const phase = summary.slowestPhase.phase;
  const durationMs = summary.slowestPhase.durationMs;

  if (phase === 'route_catalog_query' && durationMs >= 250) {
    hints.push('Slowest step is the route catalog query; check network latency, cache hit rate, and server-side candidate filtering.');
  }
  if (phase === 'filter_sort' && durationMs >= 80) {
    hints.push('Slowest step is Explore filter/sort; check route eligibility, refinement, confidence scoring, and repeated synchronous calculations.');
  }
  if (phase === 'geometry_normalization' && durationMs >= 60) {
    hints.push('Slowest step is geometry normalization; large route geometries may be blocking the Explore UI thread.');
  }
  if (phase === 'image_fetch_cache' && durationMs >= 100) {
    hints.push('Slowest step is image fetch/cache; confirm card text renders independently from thumbnail loading.');
  }
  if (phase === 'map_render' && durationMs >= 80) {
    hints.push('Slowest step is map render; check Mapbox shape/marker counts and duplicate Explore/Navigate route overlays.');
  }
  if (summary.counts.routesEvaluated > 250) {
    hints.push('Explore evaluated a large route set; verify catalog paging/cache behavior before doing expensive per-route work.');
  }
  if (summary.counts.imagesRequested > summary.counts.routesRendered) {
    hints.push('More images were requested than visible routes; defer thumbnails to rendered cards only.');
  }
  if ((summary.timeToFirstVisibleResultMs ?? 0) > 500) {
    hints.push('First visible result missed the 500ms cached target; keep skeletons immediate and emit the first result batch before full geometry/image work.');
  }
  return hints.length > 0 ? hints : ['No dominant Explore performance bottleneck identified in this sample.'];
}

export function buildExplorePerformanceSummary(
  run: ExplorePerformanceRun,
  options: { completedAtMs?: number } = {},
): ExplorePerformanceSummary {
  const completedAtMs = safeNumber(options.completedAtMs, getExplorePerformanceNow());
  const timeToFirstVisibleResultMs = run.events.first_visible_result?.elapsedMs ?? null;
  const timeToFullNearbyResultListMs = run.events.full_nearby_result_list?.elapsedMs ?? null;
  const slowestPhase = getSlowestPhase(run.phases);
  const base = {
    runId: run.runId,
    flow: run.flow,
    searchKey: run.searchKey,
    startedAtMs: run.startedAtMs,
    completedAtMs,
    totalElapsedMs: elapsed(run.startedAtMs, completedAtMs),
    timeToFirstVisibleResultMs,
    timeToFullNearbyResultListMs,
    phases: { ...run.phases },
    events: { ...run.events },
    counts: { ...run.counts },
    slowestPhase,
    targets: {
      cachedFirstVisibleResultMs: 500,
      freshSearchSkeletonImmediate: true,
      incrementalFullPopulation: true,
      imagesDoNotBlockMetadata: true,
      geometryDoesNotBlockMainUi: true,
    },
    metadata: { ...run.metadata },
  };
  return {
    ...base,
    bottleneckHints: buildBottleneckHints(base),
  };
}

export function logExplorePerformanceDiagnostic(
  summary: ExplorePerformanceSummary,
  options: {
    env?: Record<string, unknown>;
    logger?: Logger;
  } = {},
): boolean {
  if (!isExplorePerformanceDebugEnabled(options.env)) return false;
  const logger = options.logger;
  const message = `[EXPLORE PERF] ${summary.flow}`;
  const payload = summary as unknown as Record<string, unknown>;
  if (logger?.debug) {
    logger.debug('DISCOVERY', message, payload);
  } else if (logger?.log) {
    logger.log('DISCOVERY', message, payload);
  } else if (typeof console !== 'undefined' && typeof console.debug === 'function') {
    console.debug(message, payload);
  }
  return true;
}
