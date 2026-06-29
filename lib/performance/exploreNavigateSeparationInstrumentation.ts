export type ExploreNavigatePerfPhase =
  | 'explore_initial_render'
  | 'explore_route_detail'
  | 'navigate_initial_render'
  | 'mvum_toggle_load'
  | 'mvum_stitch_route';

export type ExploreNavigatePerfTiming = {
  phase: ExploreNavigatePerfPhase;
  startedAtMs: number;
  endedAtMs: number;
  durationMs: number;
};

export type MapLifecycleSnapshot = {
  sourceCount: number;
  layerCount: number;
  listenerCount: number;
  duplicateSourceCount: number;
  duplicateLayerCount: number;
  duplicateListenerCount: number;
};

export type ExploreNavigateSeparationRun = {
  runId: string;
  startedAtMs: number;
  phases: Partial<Record<ExploreNavigatePerfPhase, ExploreNavigatePerfTiming>>;
  explore: {
    summaryCount: number;
    catalogFilesFetchedOnMount: number;
    fullGeometryFetchesOnInitialRender: number;
    fullGeometryParsedOnInitialRender: boolean;
    mvumMountedOnInitialRender: boolean;
    detailFetches: number;
    detailRequestedRouteIds: string[];
  };
  navigate: {
    initialMvumEnabled: boolean;
    mvumFetchesWithOverlayOff: number;
    mvumInitialPlanStatus: string | null;
    mvumTogglePlanStatus: string | null;
    mvumToggleSourceType: string | null;
    mvumToggleSourceId: string | null;
    mvumToggleLayerIds: string[];
    selectedSegmentUpdateCount: number;
    selectedSegmentIds: string[];
    fullMvumSourceReplacedDuringSelection: boolean;
    canonicalGeometryFetchesForStitch: number;
    canonicalGeometryFetchedSegmentIds: string[];
    stitchedRoutePreviewSourceId: string | null;
    stitchedRoutePreviewLayerId: string | null;
  };
  mapSamples: Array<{
    label: string;
    before: MapLifecycleSnapshot;
    after: MapLifecycleSnapshot;
  }>;
  activeGuidance: {
    routeId: string | null;
    routeVersion: string | null;
    sourceKind: string | null;
    usesExploreStore: boolean;
    usesMvumOverlayStore: boolean;
    hasGeometry: boolean;
    stepCount: number;
  };
  memory: {
    warnings: string[];
    largeAllocationCount: number;
  };
};

export type ExploreNavigateSeparationReport = {
  runId: string;
  totalElapsedMs: number;
  explore: {
    initialRenderMs: number | null;
    catalogFilesFetchedOnMount: number;
    fullGeometryFetchedOnInitialRender: boolean;
    fullGeometryParsedOnInitialRender: boolean;
    mvumMountedOnInitialRender: boolean;
    detailFetches: number;
    detailRequestedRouteIds: string[];
  };
  navigate: {
    initialRenderWithMvumOffMs: number | null;
    mvumFetchesWithOverlayOff: number;
    mvumToggleLoadMs: number | null;
    mvumTogglePlanStatus: string | null;
    mvumToggleSourceType: string | null;
    selectedSegmentUpdateCount: number;
    selectedSegmentIds: string[];
    fullMvumSourceReplacedDuringSelection: boolean;
    canonicalGeometryFetchesForStitch: number;
    canonicalGeometryFetchedSegmentIds: string[];
    stitchedRoutePreviewSourceId: string | null;
    stitchedRoutePreviewLayerId: string | null;
  };
  map: {
    samples: ExploreNavigateSeparationRun['mapSamples'];
    sourceCountDelta: number;
    layerCountDelta: number;
    listenerCountDelta: number;
    duplicateSourceCount: number;
    duplicateLayerCount: number;
    duplicateListenerCount: number;
  };
  activeGuidance: ExploreNavigateSeparationRun['activeGuidance'];
  memory: ExploreNavigateSeparationRun['memory'];
  blockers: string[];
  bottlenecks: string[];
};

function safeNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function duration(startedAtMs: unknown, endedAtMs: unknown): number {
  return Math.max(0, Math.round((safeNumber(endedAtMs) - safeNumber(startedAtMs)) * 10) / 10);
}

function uniqueStrings(values: readonly unknown[] = []): string[] {
  return Array.from(
    new Set(values.map((value) => String(value ?? '').trim()).filter(Boolean)),
  );
}

function emptyMapLifecycleSnapshot(): MapLifecycleSnapshot {
  return {
    sourceCount: 0,
    layerCount: 0,
    listenerCount: 0,
    duplicateSourceCount: 0,
    duplicateLayerCount: 0,
    duplicateListenerCount: 0,
  };
}

export function createExploreNavigateSeparationRun(input: {
  runId?: string;
  startedAtMs?: number;
} = {}): ExploreNavigateSeparationRun {
  const startedAtMs = safeNumber(input.startedAtMs, Date.now());
  return {
    runId: input.runId || `explore-navigate-separation:${Math.round(startedAtMs)}`,
    startedAtMs,
    phases: {},
    explore: {
      summaryCount: 0,
      catalogFilesFetchedOnMount: 0,
      fullGeometryFetchesOnInitialRender: 0,
      fullGeometryParsedOnInitialRender: false,
      mvumMountedOnInitialRender: false,
      detailFetches: 0,
      detailRequestedRouteIds: [],
    },
    navigate: {
      initialMvumEnabled: false,
      mvumFetchesWithOverlayOff: 0,
      mvumInitialPlanStatus: null,
      mvumTogglePlanStatus: null,
      mvumToggleSourceType: null,
      mvumToggleSourceId: null,
      mvumToggleLayerIds: [],
      selectedSegmentUpdateCount: 0,
      selectedSegmentIds: [],
      fullMvumSourceReplacedDuringSelection: false,
      canonicalGeometryFetchesForStitch: 0,
      canonicalGeometryFetchedSegmentIds: [],
      stitchedRoutePreviewSourceId: null,
      stitchedRoutePreviewLayerId: null,
    },
    mapSamples: [],
    activeGuidance: {
      routeId: null,
      routeVersion: null,
      sourceKind: null,
      usesExploreStore: false,
      usesMvumOverlayStore: false,
      hasGeometry: false,
      stepCount: 0,
    },
    memory: {
      warnings: [],
      largeAllocationCount: 0,
    },
  };
}

function recordPhase(
  run: ExploreNavigateSeparationRun | null | undefined,
  phase: ExploreNavigatePerfPhase,
  startedAtMs: number,
  endedAtMs: number,
) {
  if (!run) return;
  run.phases[phase] = {
    phase,
    startedAtMs: safeNumber(startedAtMs, run.startedAtMs),
    endedAtMs: safeNumber(endedAtMs, startedAtMs),
    durationMs: duration(startedAtMs, endedAtMs),
  };
}

export function recordExploreInitialRender(
  run: ExploreNavigateSeparationRun | null | undefined,
  input: {
    startedAtMs: number;
    endedAtMs: number;
    summaryCount?: number;
    catalogFilesFetched?: number;
    fullGeometryFetches?: number;
    fullGeometryParsed?: boolean;
    mvumModulesMounted?: boolean;
  },
) {
  if (!run) return;
  recordPhase(run, 'explore_initial_render', input.startedAtMs, input.endedAtMs);
  run.explore.summaryCount = Math.max(0, Math.round(safeNumber(input.summaryCount, run.explore.summaryCount)));
  run.explore.catalogFilesFetchedOnMount = Math.max(0, Math.round(safeNumber(input.catalogFilesFetched, 0)));
  run.explore.fullGeometryFetchesOnInitialRender = Math.max(0, Math.round(safeNumber(input.fullGeometryFetches, 0)));
  run.explore.fullGeometryParsedOnInitialRender = input.fullGeometryParsed === true;
  run.explore.mvumMountedOnInitialRender = input.mvumModulesMounted === true;
}

export function recordExploreRouteDetailFetch(
  run: ExploreNavigateSeparationRun | null | undefined,
  input: {
    startedAtMs: number;
    endedAtMs: number;
    routeId?: string | null;
    detailFetches?: number;
    requestedRouteIds?: readonly string[];
  },
) {
  if (!run) return;
  recordPhase(run, 'explore_route_detail', input.startedAtMs, input.endedAtMs);
  run.explore.detailFetches += Math.max(0, Math.round(safeNumber(input.detailFetches, 1)));
  run.explore.detailRequestedRouteIds = uniqueStrings([
    ...run.explore.detailRequestedRouteIds,
    ...(input.requestedRouteIds ?? []),
    input.routeId,
  ]);
}

export function recordNavigateInitialRender(
  run: ExploreNavigateSeparationRun | null | undefined,
  input: {
    startedAtMs: number;
    endedAtMs: number;
    mvumEnabled?: boolean;
    mvumFetches?: number;
    mvumPlanStatus?: string | null;
  },
) {
  if (!run) return;
  recordPhase(run, 'navigate_initial_render', input.startedAtMs, input.endedAtMs);
  run.navigate.initialMvumEnabled = input.mvumEnabled === true;
  if (!input.mvumEnabled) {
    run.navigate.mvumFetchesWithOverlayOff += Math.max(0, Math.round(safeNumber(input.mvumFetches, 0)));
  }
  run.navigate.mvumInitialPlanStatus = input.mvumPlanStatus ?? null;
}

export function recordMvumToggleLoad(
  run: ExploreNavigateSeparationRun | null | undefined,
  input: {
    startedAtMs: number;
    endedAtMs: number;
    planStatus?: string | null;
    sourceType?: string | null;
    sourceId?: string | null;
    layerIds?: readonly string[];
  },
) {
  if (!run) return;
  recordPhase(run, 'mvum_toggle_load', input.startedAtMs, input.endedAtMs);
  run.navigate.mvumTogglePlanStatus = input.planStatus ?? null;
  run.navigate.mvumToggleSourceType = input.sourceType ?? null;
  run.navigate.mvumToggleSourceId = input.sourceId ?? null;
  run.navigate.mvumToggleLayerIds = uniqueStrings(input.layerIds ?? []);
}

export function recordMvumSelectionUpdate(
  run: ExploreNavigateSeparationRun | null | undefined,
  input: {
    selectedSegmentIds: readonly string[];
    selectedUpdateCount?: number;
    replacedFullMvumSource?: boolean;
    previousSelectedCount?: number;
  },
) {
  if (!run) return;
  run.navigate.selectedSegmentIds = uniqueStrings(input.selectedSegmentIds);
  run.navigate.selectedSegmentUpdateCount = Math.max(
    run.navigate.selectedSegmentUpdateCount,
    Math.max(0, Math.round(safeNumber(input.selectedUpdateCount, run.navigate.selectedSegmentUpdateCount + 1))),
  );
  run.navigate.fullMvumSourceReplacedDuringSelection =
    run.navigate.fullMvumSourceReplacedDuringSelection || input.replacedFullMvumSource === true;
  if (run.navigate.selectedSegmentIds.length > 200) {
    run.memory.largeAllocationCount += 1;
    run.memory.warnings.push('MVUM selected segment ID set exceeded 200 entries.');
  }
}

export function recordMapLifecycleSample(
  run: ExploreNavigateSeparationRun | null | undefined,
  input: {
    label: string;
    before: MapLifecycleSnapshot;
    after: MapLifecycleSnapshot;
  },
) {
  if (!run) return;
  run.mapSamples.push({
    label: input.label,
    before: { ...input.before },
    after: { ...input.after },
  });
}

export function recordMvumStitchRoute(
  run: ExploreNavigateSeparationRun | null | undefined,
  input: {
    startedAtMs: number;
    endedAtMs: number;
    selectedSegmentIds: readonly string[];
    fetchedCanonicalSegmentIds: readonly string[];
    fullGeometryFetches?: number;
    previewSourceId?: string | null;
    previewLayerId?: string | null;
  },
) {
  if (!run) return;
  recordPhase(run, 'mvum_stitch_route', input.startedAtMs, input.endedAtMs);
  run.navigate.selectedSegmentIds = uniqueStrings(input.selectedSegmentIds);
  run.navigate.canonicalGeometryFetchedSegmentIds = uniqueStrings(input.fetchedCanonicalSegmentIds);
  run.navigate.canonicalGeometryFetchesForStitch += Math.max(0, Math.round(safeNumber(input.fullGeometryFetches, 1)));
  run.navigate.stitchedRoutePreviewSourceId = input.previewSourceId ?? null;
  run.navigate.stitchedRoutePreviewLayerId = input.previewLayerId ?? null;
}

export function recordActiveGuidanceStart(
  run: ExploreNavigateSeparationRun | null | undefined,
  input: {
    routeId?: string | null;
    routeVersion?: string | null;
    sourceKind?: string | null;
    usesExploreStore?: boolean;
    usesMvumOverlayStore?: boolean;
    hasGeometry?: boolean;
    stepCount?: number;
  },
) {
  if (!run) return;
  run.activeGuidance = {
    routeId: input.routeId ?? null,
    routeVersion: input.routeVersion ?? null,
    sourceKind: input.sourceKind ?? null,
    usesExploreStore: input.usesExploreStore === true,
    usesMvumOverlayStore: input.usesMvumOverlayStore === true,
    hasGeometry: input.hasGeometry === true,
    stepCount: Math.max(0, Math.round(safeNumber(input.stepCount, 0))),
  };
}

export function createMapLifecycleCounter() {
  const sources = new Set<string>();
  const layers = new Set<string>();
  const listeners = new Set<string>();
  return {
    ensureSource(sourceId: string) {
      const id = String(sourceId ?? '').trim();
      if (!id) return false;
      if (sources.has(id)) {
        return false;
      }
      sources.add(id);
      return true;
    },
    ensureLayer(layerId: string) {
      const id = String(layerId ?? '').trim();
      if (!id) return false;
      if (layers.has(id)) {
        return false;
      }
      layers.add(id);
      return true;
    },
    attachListener(listenerId: string) {
      const id = String(listenerId ?? '').trim();
      if (!id) return false;
      if (listeners.has(id)) {
        return false;
      }
      listeners.add(id);
      return true;
    },
    snapshot(): MapLifecycleSnapshot {
      return {
        sourceCount: sources.size,
        layerCount: layers.size,
        listenerCount: listeners.size,
        duplicateSourceCount: 0,
        duplicateLayerCount: 0,
        duplicateListenerCount: 0,
      };
    },
  };
}

function aggregateMap(run: ExploreNavigateSeparationRun): ExploreNavigateSeparationReport['map'] {
  if (run.mapSamples.length === 0) {
    return {
      samples: [],
      sourceCountDelta: 0,
      layerCountDelta: 0,
      listenerCountDelta: 0,
      duplicateSourceCount: 0,
      duplicateLayerCount: 0,
      duplicateListenerCount: 0,
    };
  }
  const first = run.mapSamples[0].before ?? emptyMapLifecycleSnapshot();
  const last = run.mapSamples[run.mapSamples.length - 1].after ?? emptyMapLifecycleSnapshot();
  return {
    samples: run.mapSamples.map((sample) => ({
      label: sample.label,
      before: { ...sample.before },
      after: { ...sample.after },
    })),
    sourceCountDelta: Math.max(0, last.sourceCount - first.sourceCount),
    layerCountDelta: Math.max(0, last.layerCount - first.layerCount),
    listenerCountDelta: Math.max(0, last.listenerCount - first.listenerCount),
    duplicateSourceCount: last.duplicateSourceCount,
    duplicateLayerCount: last.duplicateLayerCount,
    duplicateListenerCount: last.duplicateListenerCount,
  };
}

function buildBlockers(report: Omit<ExploreNavigateSeparationReport, 'blockers' | 'bottlenecks'>): string[] {
  const blockers: string[] = [];
  if (report.explore.fullGeometryFetchedOnInitialRender || report.explore.fullGeometryParsedOnInitialRender) {
    blockers.push('Explore initial render fetched or parsed full route geometry.');
  }
  if (report.explore.mvumMountedOnInitialRender) {
    blockers.push('Explore initial render mounted Navigate MVUM logic.');
  }
  if (report.navigate.mvumFetchesWithOverlayOff > 0) {
    blockers.push('Navigate fetched MVUM data while MVUM overlay was off.');
  }
  if (report.navigate.fullMvumSourceReplacedDuringSelection) {
    blockers.push('MVUM selection replaced the full MVUM source.');
  }
  if (
    report.navigate.canonicalGeometryFetchedSegmentIds.length > 0 &&
    report.navigate.selectedSegmentIds.some((id) => !report.navigate.canonicalGeometryFetchedSegmentIds.includes(id))
  ) {
    blockers.push('MVUM stitch did not fetch canonical geometry for every selected segment ID.');
  }
  if (report.map.duplicateSourceCount > 0 || report.map.duplicateLayerCount > 0 || report.map.duplicateListenerCount > 0) {
    blockers.push('Mapbox source/layer/listener lifecycle recorded duplicate operations.');
  }
  if (report.activeGuidance.usesExploreStore || report.activeGuidance.usesMvumOverlayStore) {
    blockers.push('Active guidance directly subscribed to Explore or MVUM overlay runtime stores.');
  }
  if (report.memory.largeAllocationCount > 0) {
    blockers.push('Large object allocation warning recorded during Explore/Navigate separation flow.');
  }
  return blockers;
}

function buildBottlenecks(report: Omit<ExploreNavigateSeparationReport, 'blockers' | 'bottlenecks'>): string[] {
  const bottlenecks: string[] = [];
  if ((report.explore.initialRenderMs ?? 0) > 500) {
    bottlenecks.push('Explore initial render exceeded 500ms cached/skeleton target.');
  }
  if (report.explore.catalogFilesFetchedOnMount > 2) {
    bottlenecks.push('Explore fetched more than two catalog files on mount.');
  }
  if ((report.navigate.initialRenderWithMvumOffMs ?? 0) > 250) {
    bottlenecks.push('Navigate initial render with MVUM off exceeded 250ms target.');
  }
  if ((report.navigate.mvumToggleLoadMs ?? 0) > 750) {
    bottlenecks.push('MVUM toggle load exceeded 750ms target.');
  }
  if (report.map.sourceCountDelta > 8 || report.map.layerCountDelta > 12 || report.map.listenerCountDelta > 8) {
    bottlenecks.push('Map lifecycle count grew unexpectedly across tab cycling.');
  }
  return bottlenecks.length > 0
    ? bottlenecks
    : ['No dominant Explore/Navigate separation bottleneck identified in this instrumentation sample.'];
}

export function buildExploreNavigateSeparationReport(
  run: ExploreNavigateSeparationRun,
  options: { completedAtMs?: number } = {},
): ExploreNavigateSeparationReport {
  const completedAtMs = safeNumber(options.completedAtMs, Date.now());
  const map = aggregateMap(run);
  const base = {
    runId: run.runId,
    totalElapsedMs: duration(run.startedAtMs, completedAtMs),
    explore: {
      initialRenderMs: run.phases.explore_initial_render?.durationMs ?? null,
      catalogFilesFetchedOnMount: run.explore.catalogFilesFetchedOnMount,
      fullGeometryFetchedOnInitialRender: run.explore.fullGeometryFetchesOnInitialRender > 0,
      fullGeometryParsedOnInitialRender: run.explore.fullGeometryParsedOnInitialRender,
      mvumMountedOnInitialRender: run.explore.mvumMountedOnInitialRender,
      detailFetches: run.explore.detailFetches,
      detailRequestedRouteIds: [...run.explore.detailRequestedRouteIds],
    },
    navigate: {
      initialRenderWithMvumOffMs: run.navigate.initialMvumEnabled
        ? null
        : run.phases.navigate_initial_render?.durationMs ?? null,
      mvumFetchesWithOverlayOff: run.navigate.mvumFetchesWithOverlayOff,
      mvumToggleLoadMs: run.phases.mvum_toggle_load?.durationMs ?? null,
      mvumTogglePlanStatus: run.navigate.mvumTogglePlanStatus,
      mvumToggleSourceType: run.navigate.mvumToggleSourceType,
      selectedSegmentUpdateCount: run.navigate.selectedSegmentUpdateCount,
      selectedSegmentIds: [...run.navigate.selectedSegmentIds],
      fullMvumSourceReplacedDuringSelection: run.navigate.fullMvumSourceReplacedDuringSelection,
      canonicalGeometryFetchesForStitch: run.navigate.canonicalGeometryFetchesForStitch,
      canonicalGeometryFetchedSegmentIds: [...run.navigate.canonicalGeometryFetchedSegmentIds],
      stitchedRoutePreviewSourceId: run.navigate.stitchedRoutePreviewSourceId,
      stitchedRoutePreviewLayerId: run.navigate.stitchedRoutePreviewLayerId,
    },
    map,
    activeGuidance: { ...run.activeGuidance },
    memory: {
      warnings: [...run.memory.warnings],
      largeAllocationCount: run.memory.largeAllocationCount,
    },
  };
  return {
    ...base,
    blockers: buildBlockers(base),
    bottlenecks: buildBottlenecks(base),
  };
}

export function formatExploreNavigateSeparationPerfLog(
  label: string,
  report: ExploreNavigateSeparationReport,
): string {
  const payload = {
    label,
    exploreInitialRenderMs: report.explore.initialRenderMs,
    catalogFilesFetchedOnMount: report.explore.catalogFilesFetchedOnMount,
    fullGeometryFetchedOnInitialRender: report.explore.fullGeometryFetchedOnInitialRender,
    navigateInitialRenderWithMvumOffMs: report.navigate.initialRenderWithMvumOffMs,
    mvumToggleLoadMs: report.navigate.mvumToggleLoadMs,
    mapSourceCountDelta: report.map.sourceCountDelta,
    mapLayerCountDelta: report.map.layerCountDelta,
    mapListenerCountDelta: report.map.listenerCountDelta,
    selectedSegmentUpdateCount: report.navigate.selectedSegmentUpdateCount,
    fullMvumSourceReplacedDuringSelection: report.navigate.fullMvumSourceReplacedDuringSelection,
    blockers: report.blockers,
    bottlenecks: report.bottlenecks,
  };
  return `[ECS PERF] Explore/Navigate separation ${JSON.stringify(payload)}`;
}
