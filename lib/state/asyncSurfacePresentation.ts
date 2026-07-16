import type { ECSStatusTone } from '../ecsStatusTokens';
import {
  formatSourceTruthStateLabel,
} from '../sourceTruthPresentation';
import type {
  ECSAsyncSurfaceState,
  ECSAsyncSurfaceStatus,
} from './asyncSurfaceState';

export type ECSAsyncPresentationKind =
  | 'idle'
  | 'loading'
  | 'ready'
  | 'empty'
  | 'no_results_after_filter'
  | 'provider_unavailable'
  | 'offline_cached'
  | 'stale'
  | 'partial'
  | 'disabled_by_rollout'
  | 'permission_required'
  | 'cancelled'
  | 'recoverable_error'
  | 'nonrecoverable_error';

export type ECSAsyncPresentationCopy = {
  title: string;
  message: string;
  helper?: string | null;
};

export type ECSAsyncPresentationCopyOverrides = Partial<
  Record<ECSAsyncPresentationKind, Partial<ECSAsyncPresentationCopy>>
>;

export type ECSAsyncSurfacePresentationOptions = {
  subject: string;
  emptyReason?: 'empty' | 'filtered';
  offline?: boolean;
  copy?: ECSAsyncPresentationCopyOverrides;
  retryLabel?: string;
};

export type ECSAsyncSurfacePresentation = ECSAsyncPresentationCopy & {
  kind: ECSAsyncPresentationKind;
  status: ECSAsyncSurfaceStatus;
  tone: ECSStatusTone;
  icon:
    | 'archive-outline'
    | 'checkmark-circle-outline'
    | 'cloud-offline-outline'
    | 'filter-outline'
    | 'hourglass-outline'
    | 'information-circle-outline'
    | 'pause-circle-outline'
    | 'radio-outline'
    | 'shield-outline'
    | 'warning-outline';
  sourceLabel: string;
  terminal: boolean;
  renderState: boolean;
  showSpinner: boolean;
  showSkeleton: boolean;
  showLastGoodData: boolean;
  showRetry: boolean;
  retryLabel: string;
  accessibilityLiveRegion: 'polite' | 'assertive';
  accessibilityLabel: string;
  safeErrorCode: string | null;
};

function normalizeSubject(value: string): string {
  const subject = String(value ?? '').replace(/\s+/g, ' ').trim();
  return subject || 'ECS data';
}

function lowerSubject(subject: string): string {
  return subject.charAt(0).toLowerCase() + subject.slice(1);
}

function hasUsableData<T>(state: ECSAsyncSurfaceState<T>): boolean {
  return state.data != null || state.lastGoodData != null;
}

function resolveKind<T>(
  state: ECSAsyncSurfaceState<T>,
  options: ECSAsyncSurfacePresentationOptions,
): ECSAsyncPresentationKind {
  const hasData = hasUsableData(state);

  switch (state.status) {
    case 'idle':
      return 'idle';
    case 'loading':
      return 'loading';
    case 'ready':
      return 'ready';
    case 'empty':
      return options.emptyReason === 'filtered' ? 'no_results_after_filter' : 'empty';
    case 'stale':
      return options.offline && hasData ? 'offline_cached' : 'stale';
    case 'degraded':
      return options.offline && hasData ? 'offline_cached' : 'partial';
    case 'disabled':
      if (
        state.providerStatus === 'permission_denied'
        || state.cancellationReason === 'permission_denied'
      ) {
        return 'permission_required';
      }
      if (
        !state.featureEnabled
        || state.cancellationReason === 'feature_disabled'
      ) {
        return 'disabled_by_rollout';
      }
      if (
        state.providerStatus === 'unavailable'
        || state.providerStatus === 'disabled'
        || state.cancellationReason === 'provider_disabled'
      ) {
        return 'provider_unavailable';
      }
      return 'nonrecoverable_error';
    case 'cancelled':
      return 'cancelled';
    case 'error':
      if (options.offline && hasData) return 'offline_cached';
      if (hasData && state.source === 'cached') return 'stale';
      if (state.providerStatus === 'permission_denied') return 'permission_required';
      if (state.providerStatus === 'unavailable') return 'provider_unavailable';
      return state.retryEligible ? 'recoverable_error' : 'nonrecoverable_error';
    default: {
      const exhaustive: never = state.status;
      return exhaustive;
    }
  }
}

function resolveDefaultCopy(
  kind: ECSAsyncPresentationKind,
  subject: string,
  showLastGoodData: boolean,
): ECSAsyncPresentationCopy {
  const lower = lowerSubject(subject);
  switch (kind) {
    case 'idle':
      return {
        title: `${subject} standing by`,
        message: `ECS has not started the ${lower} request.`,
        helper: 'This surface will report loading or a terminal result after a request begins.',
      };
    case 'loading':
      return {
        title: `Loading ${subject}`,
        message: showLastGoodData
          ? `ECS is refreshing ${lower}. Last-good data remains visible while the request runs.`
          : `ECS is requesting current ${lower}.`,
        helper: 'This request has a terminal timeout and will expose retry if the provider does not complete.',
      };
    case 'ready':
      return {
        title: `${subject} ready`,
        message: `Current ${lower} completed successfully.`,
        helper: null,
      };
    case 'empty':
      return {
        title: `No ${lower} available`,
        message: `The ${lower} request completed successfully with no results.`,
        helper: 'This is a valid empty result, not a provider failure.',
      };
    case 'no_results_after_filter':
      return {
        title: `No ${lower} match these filters`,
        message: `${subject} were found, but the active filters exclude every result.`,
        helper: 'Reset or adjust the filters to reopen the result set.',
      };
    case 'provider_unavailable':
      return {
        title: `${subject} provider unavailable`,
        message: `The ${lower} provider did not return a usable result.`,
        helper: showLastGoodData
          ? 'Last-good data remains visible and is not labeled live.'
          : 'This provider failure is not an empty result.',
      };
    case 'offline_cached':
      return {
        title: `Showing saved ${lower}`,
        message: `Live ${lower} are unavailable offline. ECS is preserving last-good cached data.`,
        helper: 'Saved data remains labeled cached and will refresh after connectivity returns.',
      };
    case 'stale':
      return {
        title: `${subject} is stale`,
        message: `ECS is preserving last-good ${lower} while a current refresh is unavailable.`,
        helper: 'Verify the timestamp and source before relying on this result.',
      };
    case 'partial':
      return {
        title: `${subject} is partial`,
        message: `Some ${lower} completed, but one or more expected inputs are unavailable.`,
        helper: 'Available data remains visible with degraded source labeling.',
      };
    case 'disabled_by_rollout':
      return {
        title: `${subject} unavailable`,
        message: `${subject} is disabled by the current rollout configuration.`,
        helper: 'Saved data is unchanged. Retry is unavailable until the rollout is enabled.',
      };
    case 'permission_required':
      return {
        title: `${subject} needs permission`,
        message: `Required permission is unavailable, so ECS did not request ${lower}.`,
        helper: 'Review device permissions, then return to this surface.',
      };
    case 'cancelled':
      return {
        title: `${subject} update cancelled`,
        message: `The ${lower} request stopped before completion.`,
        helper: showLastGoodData
          ? 'Existing last-good data was not replaced.'
          : 'No partial response was presented as complete.',
      };
    case 'recoverable_error':
      return {
        title: `${subject} needs another try`,
        message: `The ${lower} request failed before it produced a usable result.`,
        helper: showLastGoodData
          ? 'Last-good data remains visible. Retry requests a fresh result.'
          : 'Retry requests a fresh result and does not convert this failure into an empty state.',
      };
    case 'nonrecoverable_error':
      return {
        title: `${subject} unavailable`,
        message: `The ${lower} request failed and cannot be retried from this surface.`,
        helper: 'Review the provider, configuration, or required input before trying again.',
      };
    default: {
      const exhaustive: never = kind;
      return exhaustive;
    }
  }
}

function resolveTone(kind: ECSAsyncPresentationKind): ECSStatusTone {
  switch (kind) {
    case 'ready':
      return 'ready';
    case 'loading':
      return 'selected';
    case 'stale':
    case 'offline_cached':
    case 'partial':
    case 'cancelled':
      return 'warning';
    case 'provider_unavailable':
    case 'permission_required':
    case 'recoverable_error':
    case 'nonrecoverable_error':
      return 'unavailable';
    case 'disabled_by_rollout':
      return 'info';
    case 'idle':
    case 'empty':
    case 'no_results_after_filter':
    default:
      return 'info';
  }
}

function resolveIcon(kind: ECSAsyncPresentationKind): ECSAsyncSurfacePresentation['icon'] {
  switch (kind) {
    case 'loading':
      return 'hourglass-outline';
    case 'ready':
      return 'checkmark-circle-outline';
    case 'empty':
      return 'radio-outline';
    case 'no_results_after_filter':
      return 'filter-outline';
    case 'provider_unavailable':
    case 'offline_cached':
      return 'cloud-offline-outline';
    case 'stale':
      return 'archive-outline';
    case 'partial':
    case 'recoverable_error':
    case 'nonrecoverable_error':
      return 'warning-outline';
    case 'disabled_by_rollout':
    case 'cancelled':
      return 'pause-circle-outline';
    case 'permission_required':
      return 'shield-outline';
    case 'idle':
    default:
      return 'information-circle-outline';
  }
}

export function resolveECSAsyncSurfacePresentation<T>(
  state: ECSAsyncSurfaceState<T>,
  options: ECSAsyncSurfacePresentationOptions,
): ECSAsyncSurfacePresentation {
  const subject = normalizeSubject(options.subject);
  const kind = resolveKind(state, options);
  const showLastGoodData = hasUsableData(state)
    && kind !== 'ready'
    && kind !== 'empty'
    && kind !== 'no_results_after_filter';
  const defaults = resolveDefaultCopy(kind, subject, showLastGoodData);
  const override = options.copy?.[kind];
  const title = override?.title ?? defaults.title;
  const message = override?.message ?? defaults.message;
  const helper = override?.helper === undefined ? defaults.helper : override.helper;
  const terminal = state.status !== 'idle' && state.status !== 'loading';
  const showRetry = Boolean(
    state.retryEligible
    && kind !== 'idle'
    && kind !== 'loading'
    && kind !== 'ready'
    && kind !== 'empty'
    && kind !== 'no_results_after_filter'
    && kind !== 'disabled_by_rollout'
    && kind !== 'permission_required'
    && kind !== 'nonrecoverable_error',
  );
  const assertiveKinds: ECSAsyncPresentationKind[] = [
    'provider_unavailable',
    'recoverable_error',
    'nonrecoverable_error',
  ];
  const sourceLabel = state.source === 'unavailable' && state.freshness === 'unavailable'
    ? 'Unavailable'
    : formatSourceTruthStateLabel(state.source, state.freshness);
  const accessibilityLabel = [title, message, helper, `Source state: ${sourceLabel}.`]
    .filter(Boolean)
    .join(' ');

  return {
    kind,
    status: state.status,
    title,
    message,
    helper,
    tone: resolveTone(kind),
    icon: resolveIcon(kind),
    sourceLabel,
    terminal,
    renderState: kind !== 'idle' && kind !== 'ready',
    showSpinner: kind === 'loading',
    showSkeleton: kind === 'loading' && !showLastGoodData,
    showLastGoodData,
    showRetry,
    retryLabel: options.retryLabel ?? 'Retry',
    accessibilityLiveRegion: assertiveKinds.includes(kind) ? 'assertive' : 'polite',
    accessibilityLabel,
    safeErrorCode: state.safeErrorCode,
  };
}
