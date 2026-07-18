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
  roadHasValidGeometry?: boolean;
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

export function shouldDeferNavigateRouteSessionClear(input: {
  lifecycle: 'inactive' | 'preview' | 'active' | 'arrived';
  roadRestoreStatus: 'loading' | 'ready' | 'error';
  trailRestoreStatus: 'loading' | 'ready' | 'error';
  currentSnapshot: { lifecycle?: string | null } | null | undefined;
}): boolean {
  const restorePending =
    input.roadRestoreStatus !== 'ready' || input.trailRestoreStatus !== 'ready';
  return restorePending && input.currentSnapshot?.lifecycle !== 'inactive';
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
  const roadRouteHasValidGeometry =
    !!input.roadHasRoute && input.roadHasValidGeometry !== false;
  const roadRouteGeometryBlocked =
    !!input.roadHasRoute && input.roadHasValidGeometry === false;

  if (input.routeBuilderError) {
    return buildState('failed', 'route_builder', { error: input.routeBuilderError });
  }

  if (
    roadRouteGeometryBlocked &&
    ['route_preview', 'navigation_active', 'rerouting', 'arrived'].includes(String(input.roadStatus))
  ) {
    return buildState('failed', routeSourceFromInput(input), {
      error: input.roadError ?? 'Route geometry unavailable',
      canStartGuidance: false,
      shouldRenderPreview: false,
      shouldRenderGuidance: false,
    });
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
    if (!roadRouteHasValidGeometry) {
      return buildState('failed', routeSourceFromInput(input), {
        error: input.roadError ?? 'Route geometry unavailable',
        canStartGuidance: false,
        shouldRenderPreview: false,
        shouldRenderGuidance: false,
      });
    }

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
    return buildState(roadRouteHasValidGeometry ? 'preview' : 'building', routeSourceFromInput(input), {
      isLoading: true,
      canStartGuidance: roadRouteHasValidGeometry,
      shouldRenderPreview: roadRouteHasValidGeometry,
    });
  }

  if (input.trailUiMode === 'preview' || input.explorePreviewMode === 'trail') {
    return buildState('preview', routeSourceFromInput(input));
  }

  if (input.roadStatus === 'route_preview') {
    if (!roadRouteHasValidGeometry) {
      return buildState('failed', routeSourceFromInput(input), {
        error: input.roadError ?? 'Route geometry unavailable',
        canStartGuidance: false,
        shouldRenderPreview: false,
      });
    }

    return buildState('preview', routeSourceFromInput(input), {
      canStartGuidance: true,
    });
  }

  if (input.roadStatus === 'destination_selected') {
    return buildState('building', routeSourceFromInput(input), {
      isLoading: false,
      canStartGuidance: false,
      error: input.roadError ?? null,
      shouldRenderPreview: false,
    });
  }

  if (input.hasActiveRun && !input.hasDisplayedRouteGeometry) {
    return buildState('failed', routeSourceFromInput(input), {
      error: 'Route geometry unavailable',
      canStartGuidance: false,
      shouldRenderPreview: false,
    });
  }

  if (input.hasDisplayedRouteGeometry) {
    return buildState('ready', routeSourceFromInput(input));
  }

  return buildState('idle', 'none', {
    canStartGuidance: false,
    canCancel: false,
    shouldRenderPreview: false,
    shouldRenderGuidance: false,
  });
}

export type ECSRouteOperationPhase =
  | 'idle'
  | 'importing'
  | 'previewing'
  | 'editing'
  | 'staged'
  | 'active'
  | 'paused'
  | 'completed'
  | 'failed';

export type ECSRouteOperationEvent =
  | 'begin_import'
  | 'open_preview'
  | 'begin_edit'
  | 'stage'
  | 'start'
  | 'pause'
  | 'resume'
  | 'complete'
  | 'fail'
  | 'cancel'
  | 'reset';

export interface ECSRouteOperationState {
  phase: ECSRouteOperationPhase;
  routeId: string | null;
  source: ECSRouteLifecycleSource;
  revision: number;
  changedAt: number;
  error: string | null;
}

export interface ECSRouteOperationTransition {
  state: ECSRouteOperationState;
  accepted: boolean;
  reason: 'transitioned' | 'idempotent' | 'invalid_transition';
}

export interface ECSRouteOperationAdapterInput {
  lifecycle: ECSRouteLifecycleState;
  importing?: boolean;
  importError?: string | null;
  hasStagedRoute?: boolean;
  routeId?: string | null;
  now?: number;
}

const ROUTE_OPERATION_TRANSITIONS: Readonly<
  Record<ECSRouteOperationPhase, Readonly<Partial<Record<ECSRouteOperationEvent, ECSRouteOperationPhase>>>>
> = {
  idle: {
    begin_import: 'importing',
    open_preview: 'previewing',
    begin_edit: 'editing',
    stage: 'staged',
    start: 'active',
    fail: 'failed',
    cancel: 'idle',
    reset: 'idle',
  },
  importing: {
    begin_import: 'importing',
    open_preview: 'previewing',
    stage: 'staged',
    fail: 'failed',
    cancel: 'idle',
    reset: 'idle',
  },
  previewing: {
    open_preview: 'previewing',
    begin_edit: 'editing',
    stage: 'staged',
    start: 'active',
    fail: 'failed',
    cancel: 'idle',
    reset: 'idle',
  },
  editing: {
    begin_edit: 'editing',
    open_preview: 'previewing',
    stage: 'staged',
    start: 'active',
    fail: 'failed',
    cancel: 'idle',
    reset: 'idle',
  },
  staged: {
    open_preview: 'previewing',
    begin_edit: 'editing',
    start: 'active',
    stage: 'staged',
    fail: 'failed',
    cancel: 'idle',
    reset: 'idle',
  },
  active: {
    start: 'active',
    resume: 'active',
    pause: 'paused',
    complete: 'completed',
    fail: 'failed',
    cancel: 'idle',
    reset: 'idle',
  },
  paused: {
    pause: 'paused',
    resume: 'active',
    complete: 'completed',
    fail: 'failed',
    cancel: 'idle',
    reset: 'idle',
  },
  completed: {
    begin_import: 'importing',
    open_preview: 'previewing',
    begin_edit: 'editing',
    complete: 'completed',
    reset: 'idle',
  },
  failed: {
    begin_import: 'importing',
    open_preview: 'previewing',
    begin_edit: 'editing',
    fail: 'failed',
    cancel: 'idle',
    reset: 'idle',
  },
};

export function createRouteOperationState(
  overrides: Partial<ECSRouteOperationState> = {},
): ECSRouteOperationState {
  return {
    phase: overrides.phase ?? 'idle',
    routeId: overrides.routeId ?? null,
    source: overrides.source ?? 'none',
    revision: Math.max(0, Math.trunc(overrides.revision ?? 0)),
    changedAt: overrides.changedAt ?? 0,
    error: overrides.error ?? null,
  };
}

export function transitionRouteOperation(
  current: ECSRouteOperationState,
  event: ECSRouteOperationEvent,
  options: {
    routeId?: string | null;
    source?: ECSRouteLifecycleSource;
    error?: string | null;
    now?: number;
  } = {},
): ECSRouteOperationTransition {
  const nextPhase = ROUTE_OPERATION_TRANSITIONS[current.phase][event];
  if (!nextPhase) {
    return { state: current, accepted: false, reason: 'invalid_transition' };
  }

  const nextRouteId = options.routeId === undefined ? current.routeId : options.routeId;
  const nextSource = options.source ?? current.source;
  const nextError = nextPhase === 'failed' ? options.error ?? current.error ?? 'Route operation failed' : null;
  if (
    nextPhase === current.phase &&
    nextRouteId === current.routeId &&
    nextSource === current.source &&
    nextError === current.error
  ) {
    return { state: current, accepted: true, reason: 'idempotent' };
  }

  return {
    accepted: true,
    reason: 'transitioned',
    state: {
      phase: nextPhase,
      routeId: nextRouteId,
      source: nextSource,
      revision: current.revision + 1,
      changedAt: options.now ?? Date.now(),
      error: nextError,
    },
  };
}

export function deriveRouteOperationState(
  input: ECSRouteOperationAdapterInput,
): ECSRouteOperationState {
  let phase: ECSRouteOperationPhase;
  if (input.importing) phase = 'importing';
  else if (input.importError) phase = 'failed';
  else if (input.lifecycle.phase === 'building') phase = 'editing';
  else if (input.lifecycle.phase === 'preview') phase = 'previewing';
  else if (input.lifecycle.phase === 'ready' || input.hasStagedRoute) phase = 'staged';
  else if (input.lifecycle.phase === 'navigating') phase = 'active';
  else if (input.lifecycle.phase === 'paused') phase = 'paused';
  else if (input.lifecycle.phase === 'completed') phase = 'completed';
  else if (input.lifecycle.phase === 'failed') phase = 'failed';
  else phase = 'idle';

  return createRouteOperationState({
    phase,
    routeId: input.routeId ?? null,
    source: input.lifecycle.source,
    changedAt: input.now ?? 0,
    error: input.importError ?? input.lifecycle.error,
  });
}
