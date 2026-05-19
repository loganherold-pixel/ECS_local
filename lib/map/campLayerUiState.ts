import type { CampLayerFetchBbox } from './campLayerFetchScheduler';
import type { CampLayerFetchFailureDiagnostic } from './campLayerFetchDiagnostics';

export type CampLayerUiStatus = 'idle' | 'loading' | 'ready' | 'empty' | 'error' | 'zoom';

export type CampLayerUiState = {
  enabled: boolean;
  status: CampLayerUiStatus;
  errorMessage?: string;
  diagnostic?: CampLayerFetchFailureDiagnostic;
  featureCount: number;
  lastAttemptedBbox?: CampLayerFetchBbox;
  lastAttemptedCacheKey?: string;
  lastSuccessfulBbox?: CampLayerFetchBbox;
  lastSuccessfulCacheKey?: string;
};

export function createCampLayerUiState(enabled = false): CampLayerUiState {
  return {
    enabled,
    status: 'idle',
    featureCount: 0,
  };
}

export function setCampLayerEnabled(state: CampLayerUiState, enabled: boolean): CampLayerUiState {
  if (!enabled) {
    return {
      ...state,
      enabled: false,
      status: 'idle',
      errorMessage: undefined,
      diagnostic: undefined,
    };
  }

  return {
    ...state,
    enabled: true,
    status:
      state.featureCount > 0
        ? 'ready'
        : state.lastSuccessfulCacheKey
          ? 'empty'
          : 'loading',
    errorMessage: undefined,
    diagnostic: undefined,
  };
}

export function setCampLayerLoading(
  state: CampLayerUiState,
  attempt?: {
    bbox: CampLayerFetchBbox;
    cacheKey: string;
  },
): CampLayerUiState {
  return {
    ...state,
    status: 'loading',
    errorMessage: undefined,
    diagnostic: undefined,
    lastAttemptedBbox: attempt?.bbox ?? state.lastAttemptedBbox,
    lastAttemptedCacheKey: attempt?.cacheKey ?? state.lastAttemptedCacheKey,
  };
}

export function setCampLayerFetchSkipped(state: CampLayerUiState): CampLayerUiState {
  if (state.status !== 'loading') return state;
  return {
    ...state,
    status:
      state.featureCount > 0
        ? 'ready'
        : state.lastSuccessfulCacheKey
          ? 'empty'
          : 'idle',
  };
}

export function setCampLayerZoomDeferred(state: CampLayerUiState): CampLayerUiState {
  return {
    ...state,
    status: 'zoom',
    errorMessage: undefined,
    diagnostic: undefined,
    featureCount: 0,
  };
}

export function setCampLayerFetchSucceeded(
  state: CampLayerUiState,
  result: {
    bbox: CampLayerFetchBbox;
    cacheKey: string;
    featureCount: number;
  },
): CampLayerUiState {
  const featureCount = Number.isFinite(result.featureCount)
    ? Math.max(0, Math.floor(result.featureCount))
    : 0;
  return {
    ...state,
    status: featureCount > 0 ? 'ready' : 'empty',
    errorMessage: undefined,
    diagnostic: undefined,
    featureCount,
    lastAttemptedBbox: result.bbox,
    lastAttemptedCacheKey: result.cacheKey,
    lastSuccessfulBbox: result.bbox,
    lastSuccessfulCacheKey: result.cacheKey,
  };
}

export function setCampLayerFetchFailed(
  state: CampLayerUiState,
  errorMessage: string,
  options: {
    bbox?: CampLayerFetchBbox;
    cacheKey?: string;
    diagnostic?: CampLayerFetchFailureDiagnostic;
  } = {},
): CampLayerUiState {
  return {
    ...state,
    status: 'error',
    errorMessage,
    diagnostic: options.diagnostic,
    lastAttemptedBbox: options.bbox ?? state.lastAttemptedBbox,
    lastAttemptedCacheKey: options.cacheKey ?? state.lastAttemptedCacheKey,
  };
}
