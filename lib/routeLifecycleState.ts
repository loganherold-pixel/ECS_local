export type ECSRouteLifecyclePhase =
  | 'idle'
  | 'building'
  | 'preview'
  | 'ready'
  | 'navigating'
  | 'paused'
  | 'completed'
  | 'failed';

export type ECSRouteLifecycleSource =
  | 'none'
  | 'route_builder'
  | 'road'
  | 'trail'
  | 'hybrid'
  | 'run'
  | 'explore_handoff';

export interface ECSRouteLifecycleInput {
  routeBuilderActive?: boolean;
  routeBuilderDrawing?: boolean;
  routeBuilderHasGeometry?: boolean;
  routeBuilderError?: string | null;
  roadStatus?: string | null;
  roadPreviewLoading?: boolean;
  roadHasRoute?: boolean;
  roadHasDestination?: boolean;
  roadError?: string | null;
  roadCreatedFrom?: string | null;
  trailUiMode?: string | null;
  trailStatus?: string | null;
  trailHasPayload?: boolean;
  explorePreviewMode?: string | null;
  pendingHybridTrailTransition?: boolean;
  hasActiveRun?: boolean;
  hasDisplayedRouteGeometry?: boolean;
}

export interface ECSRouteLifecycleState {
  phase: ECSRouteLifecyclePhase;
  source: ECSRouteLifecycleSource;
  isLoading: boolean;
  error: string | null;
  canStartGuidance: boolean;
  canCancel: boolean;
  shouldRenderPreview: boolean;
  shouldRenderGuidance: boolean;
}

function routeSourceFromInput(input: ECSRouteLifecycleInput): ECSRouteLifecycleSource {
  if (input.pendingHybridTrailTransition || input.explorePreviewMode === 'hybrid') return 'hybrid';
  if (input.trailHasPayload || input.trailUiMode === 'preview' || input.trailUiMode === 'active') {
    return 'trail';
  }
  if (input.roadCreatedFrom === 'explore_handoff' || input.explorePreviewMode === 'road') {
    return 'explore_handoff';
  }
  if (input.roadHasDestination || input.roadHasRoute) return 'road';
  if (input.hasActiveRun || input.hasDisplayedRouteGeometry) return 'run';
  if (input.routeBuilderActive) return 'route_builder';
  return 'none';
}

function buildState(
  phase: ECSRouteLifecyclePhase,
  source: ECSRouteLifecycleSource,
  options: Partial<Omit<ECSRouteLifecycleState, 'phase' | 'source'>> = {},
): ECSRouteLifecycleState {
  const shouldRenderGuidance = options.shouldRenderGuidance ?? phase === 'navigating';
  const shouldRenderPreview =
    options.shouldRenderPreview ?? (phase === 'preview' || phase === 'ready');

  return {
    phase,
    source,
    isLoading: options.isLoading ?? phase === 'building',
    error: options.error ?? null,
    canStartGuidance:
      options.canStartGuidance ?? (phase === 'preview' || phase === 'ready'),
    canCancel:
      options.canCancel ??
      !['idle', 'completed'].includes(phase),
    shouldRenderPreview,
    shouldRenderGuidance,
  };
}

export function normalizeRouteLifecycle(
  input: ECSRouteLifecycleInput,
): ECSRouteLifecycleState {
  if (input.routeBuilderError) {
    return buildState('failed', 'route_builder', { error: input.routeBuilderError });
  }

  if (input.roadStatus === 'error' || input.trailUiMode === 'error') {
    return buildState('failed', routeSourceFromInput(input), {
      error: input.roadError ?? 'Route unavailable',
      shouldRenderPreview: false,
      shouldRenderGuidance: false,
    });
  }

  if (input.pendingHybridTrailTransition) {
    return buildState('navigating', 'hybrid', {
      canStartGuidance: false,
      shouldRenderPreview: false,
      shouldRenderGuidance: true,
    });
  }

  if (input.trailUiMode === 'active') {
    return buildState('navigating', routeSourceFromInput(input), {
      canStartGuidance: false,
      shouldRenderPreview: false,
      shouldRenderGuidance: true,
    });
  }

  if (input.trailUiMode === 'arrived' || input.roadStatus === 'arrived') {
    return buildState('completed', routeSourceFromInput(input), {
      canStartGuidance: false,
      shouldRenderPreview: false,
      shouldRenderGuidance: true,
    });
  }

  if (input.roadStatus === 'navigation_active' || input.roadStatus === 'rerouting') {
    return buildState('navigating', routeSourceFromInput(input), {
      isLoading: input.roadStatus === 'rerouting',
      canStartGuidance: false,
      shouldRenderPreview: false,
      shouldRenderGuidance: true,
    });
  }

  if (input.routeBuilderActive) {
    return buildState('building', 'route_builder', {
      isLoading: false,
      canStartGuidance: false,
      shouldRenderPreview: !!input.routeBuilderHasGeometry,
    });
  }

  if (input.roadPreviewLoading) {
    return buildState(input.roadHasRoute ? 'preview' : 'building', routeSourceFromInput(input), {
      isLoading: true,
      canStartGuidance: !!input.roadHasRoute,
      shouldRenderPreview: !!input.roadHasRoute || !!input.roadHasDestination,
    });
  }

  if (input.trailUiMode === 'preview' || input.explorePreviewMode === 'trail') {
    return buildState('preview', routeSourceFromInput(input));
  }

  if (input.roadStatus === 'route_preview') {
    return buildState(input.roadHasRoute ? 'preview' : 'ready', routeSourceFromInput(input), {
      canStartGuidance: !!input.roadHasRoute,
    });
  }

  if (input.roadStatus === 'destination_selected') {
    return buildState('ready', routeSourceFromInput(input), {
      canStartGuidance: false,
      error: input.roadError ?? null,
    });
  }

  if (input.hasActiveRun || input.hasDisplayedRouteGeometry) {
    return buildState('ready', routeSourceFromInput(input));
  }

  return buildState('idle', 'none', {
    canStartGuidance: false,
    canCancel: false,
    shouldRenderPreview: false,
    shouldRenderGuidance: false,
  });
}
