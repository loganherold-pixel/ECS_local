export type OfflinePrepActionKind =
  | 'prepare_pack'
  | 'refresh_manifest'
  | 'export_manifest';

export type OfflinePrepActionAttempt = 'initial' | 'retry' | 'refresh';

export type OfflinePrepActionCancellationReason =
  | 'superseded'
  | 'route_changed'
  | 'user_cancelled'
  | 'unmount'
  | 'feature_disabled'
  | 'timeout';

export type OfflinePrepActionStatus =
  | 'idle'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'cancelled';

export type OfflinePrepActionDecision = 'started' | 'shared' | 'reused' | 'blocked';

export interface OfflinePrepActionRequest {
  action: OfflinePrepActionKind;
  requestId: string;
  fingerprint: string;
  generation: number;
  attempt: OfflinePrepActionAttempt;
  startedAt: string;
}

export interface OfflinePrepActionState {
  status: OfflinePrepActionStatus;
  action: OfflinePrepActionKind | null;
  requestId: string | null;
  fingerprint: string | null;
  generation: number;
  attempt: OfflinePrepActionAttempt | null;
  startedAt: string | null;
  completedAt: string | null;
  safeErrorCode: string | null;
  retryEligible: boolean;
  cancellationReason: OfflinePrepActionCancellationReason | null;
}

export interface OfflinePrepActionContext {
  request: OfflinePrepActionRequest;
  signal: AbortSignal;
  isCurrent(): boolean;
}

export interface OfflinePrepActionOutcome<T> {
  status: Exclude<OfflinePrepActionStatus, 'idle' | 'running'>;
  request: OfflinePrepActionRequest | null;
  accepted: boolean;
  reused: boolean;
  data: T | null;
  safeErrorCode: string | null;
  retryEligible: boolean;
  cancellationReason: OfflinePrepActionCancellationReason | null;
  completedAt: string;
}

export interface OfflinePrepActionExecution<T> {
  decision: OfflinePrepActionDecision;
  request: OfflinePrepActionRequest | null;
  shared: boolean;
  promise: Promise<OfflinePrepActionOutcome<T>>;
}

export interface OfflinePrepActionLifecycle<T> {
  getState(): OfflinePrepActionState;
  subscribe(listener: (state: OfflinePrepActionState) => void): () => void;
  run(input: {
    action: OfflinePrepActionKind;
    fingerprint: string;
    attempt?: OfflinePrepActionAttempt;
    execute(context: OfflinePrepActionContext): Promise<T> | T;
    safeErrorCode?: string | ((error: unknown) => string);
  }): OfflinePrepActionExecution<T>;
  cancel(reason?: OfflinePrepActionCancellationReason): OfflinePrepActionOutcome<T> | null;
  dispose(): OfflinePrepActionOutcome<T> | null;
}

export interface OfflinePrepActionEligibility {
  decision: OfflinePrepActionDecision;
  reason:
    | 'new_request'
    | 'supersede_active_request'
    | 'identical_request_in_flight'
    | 'terminal_result_reused'
    | 'explicit_retry_required'
    | 'lifecycle_disposed';
}

const INITIAL_STATE: OfflinePrepActionState = {
  status: 'idle',
  action: null,
  requestId: null,
  fingerprint: null,
  generation: 0,
  attempt: null,
  startedAt: null,
  completedAt: null,
  safeErrorCode: null,
  retryEligible: false,
  cancellationReason: null,
};

function safeDate(now: () => number): string {
  const value = now();
  return new Date(Number.isFinite(value) ? value : 0).toISOString();
}

function fingerprintPart(value: string | null | undefined, fallback: string): string {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (!normalized) return fallback;
  return normalized.replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || fallback;
}

/** Builds a coordinate-free fingerprint that changes only with relevant pack input. */
export function createOfflinePrepActionFingerprint(input: {
  action: OfflinePrepActionKind;
  routeId: string;
  manifestId?: string | null;
  sourceRevision?: string | number | null;
}): string {
  return [
    input.action,
    fingerprintPart(input.routeId, 'route'),
    fingerprintPart(input.manifestId, 'manifest'),
    fingerprintPart(input.sourceRevision == null ? null : String(input.sourceRevision), 'current'),
  ].join(':');
}

export function evaluateOfflinePrepActionEligibility(input: {
  state: OfflinePrepActionState;
  action: OfflinePrepActionKind;
  fingerprint: string;
  attempt?: OfflinePrepActionAttempt;
  disposed?: boolean;
}): OfflinePrepActionEligibility {
  if (input.disposed) return { decision: 'blocked', reason: 'lifecycle_disposed' };
  const attempt = input.attempt ?? 'initial';
  const sameRequest = input.state.action === input.action && input.state.fingerprint === input.fingerprint;
  if (input.state.status === 'running') {
    return sameRequest
      ? { decision: 'shared', reason: 'identical_request_in_flight' }
      : { decision: 'started', reason: 'supersede_active_request' };
  }
  if (attempt === 'retry' || attempt === 'refresh') {
    return { decision: 'started', reason: 'new_request' };
  }
  if (sameRequest && input.state.status === 'succeeded') {
    return { decision: 'reused', reason: 'terminal_result_reused' };
  }
  if (sameRequest && (input.state.status === 'failed' || input.state.status === 'cancelled')) {
    return { decision: 'blocked', reason: 'explicit_retry_required' };
  }
  return { decision: 'started', reason: 'new_request' };
}

function normalizeSafeErrorCode(error: unknown, configured?: string | ((error: unknown) => string)): string {
  const configuredValue = typeof configured === 'function' ? configured(error) : configured;
  const record = error && typeof error === 'object' ? error as Record<string, unknown> : null;
  const candidate = configuredValue ?? record?.safeCode ?? record?.code ?? 'OFFLINE_PREP_ACTION_FAILED';
  const normalized = String(candidate ?? '').trim().toUpperCase().replace(/[^A-Z0-9_]+/g, '_');
  return normalized || 'OFFLINE_PREP_ACTION_FAILED';
}

function retryEligibleForCancellation(reason: OfflinePrepActionCancellationReason): boolean {
  return reason === 'user_cancelled' || reason === 'timeout';
}

export function isCurrentOfflinePrepActionOutcome<T>(
  state: OfflinePrepActionState,
  outcome: OfflinePrepActionOutcome<T>,
): boolean {
  return outcome.accepted &&
    outcome.request != null &&
    state.requestId === outcome.request.requestId &&
    state.generation === outcome.request.generation &&
    state.fingerprint === outcome.request.fingerprint;
}

export function createOfflinePrepActionLifecycle<T>(options: {
  now?: () => number;
  createRequestId?: (request: Omit<OfflinePrepActionRequest, 'requestId'>) => string;
} = {}): OfflinePrepActionLifecycle<T> {
  const now = options.now ?? Date.now;
  let state: OfflinePrepActionState = { ...INITIAL_STATE };
  let disposed = false;
  let lastOutcome: OfflinePrepActionOutcome<T> | null = null;
  const listeners = new Set<(state: OfflinePrepActionState) => void>();

  type ActiveExecution = {
    request: OfflinePrepActionRequest;
    controller: AbortController;
    promise: Promise<OfflinePrepActionOutcome<T>>;
    resolveCancellation(outcome: OfflinePrepActionOutcome<T>): void;
  };

  let active: ActiveExecution | null = null;

  const publish = (next: OfflinePrepActionState) => {
    state = next;
    listeners.forEach((listener) => listener(state));
  };

  const currentRequestMatches = (request: OfflinePrepActionRequest): boolean => (
    active?.request.requestId === request.requestId &&
    state.requestId === request.requestId &&
    state.generation === request.generation
  );

  const cancelActive = (reason: OfflinePrepActionCancellationReason): OfflinePrepActionOutcome<T> | null => {
    const current = active;
    if (!current) return null;
    current.controller.abort();
    const completedAt = safeDate(now);
    const outcome: OfflinePrepActionOutcome<T> = {
      status: 'cancelled',
      request: current.request,
      accepted: false,
      reused: false,
      data: null,
      safeErrorCode: null,
      retryEligible: retryEligibleForCancellation(reason),
      cancellationReason: reason,
      completedAt,
    };
    active = null;
    lastOutcome = outcome;
    publish({
      ...state,
      status: 'cancelled',
      completedAt,
      safeErrorCode: null,
      retryEligible: outcome.retryEligible,
      cancellationReason: reason,
    });
    current.resolveCancellation(outcome);
    return outcome;
  };

  return {
    getState() {
      return state;
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    run(input) {
      const attempt = input.attempt ?? 'initial';
      const eligibility = evaluateOfflinePrepActionEligibility({
        state,
        action: input.action,
        fingerprint: input.fingerprint,
        attempt,
        disposed,
      });

      if (eligibility.decision === 'shared' && active) {
        return { decision: 'shared', request: active.request, shared: true, promise: active.promise };
      }

      if (eligibility.decision === 'reused' && lastOutcome) {
        const reusedOutcome = { ...lastOutcome, reused: true };
        return {
          decision: 'reused',
          request: reusedOutcome.request,
          shared: false,
          promise: Promise.resolve(reusedOutcome),
        };
      }

      if (eligibility.decision === 'blocked') {
        const completedAt = state.completedAt ?? safeDate(now);
        const blockedOutcome: OfflinePrepActionOutcome<T> = lastOutcome
          ? { ...lastOutcome, reused: true }
          : {
              status: 'cancelled',
              request: null,
              accepted: false,
              reused: true,
              data: null,
              safeErrorCode: null,
              retryEligible: false,
              cancellationReason: disposed ? 'unmount' : 'user_cancelled',
              completedAt,
            };
        return {
          decision: 'blocked',
          request: blockedOutcome.request,
          shared: false,
          promise: Promise.resolve(blockedOutcome),
        };
      }

      if (active) cancelActive('superseded');

      const generation = state.generation + 1;
      const startedAt = safeDate(now);
      const requestWithoutId: Omit<OfflinePrepActionRequest, 'requestId'> = {
        action: input.action,
        fingerprint: input.fingerprint,
        generation,
        attempt,
        startedAt,
      };
      const requestId = options.createRequestId?.(requestWithoutId) ??
        `offline-prep-${input.action}-${generation}-${startedAt}`;
      const request: OfflinePrepActionRequest = { ...requestWithoutId, requestId };
      const controller = new AbortController();
      let resolveCancellation: (outcome: OfflinePrepActionOutcome<T>) => void = () => undefined;
      const cancellationPromise = new Promise<OfflinePrepActionOutcome<T>>((resolve) => {
        resolveCancellation = resolve;
      });

      const providerPromise = Promise.resolve()
        .then(() => input.execute({
          request,
          signal: controller.signal,
          isCurrent: () => currentRequestMatches(request) && !controller.signal.aborted,
        }))
        .then<OfflinePrepActionOutcome<T>, OfflinePrepActionOutcome<T>>(
          (data) => {
            if (!currentRequestMatches(request) || controller.signal.aborted) {
              return {
                status: 'cancelled', request, accepted: false, reused: false, data: null,
                safeErrorCode: null, retryEligible: false, cancellationReason: 'superseded', completedAt: safeDate(now),
              };
            }
            const completedAt = safeDate(now);
            const outcome: OfflinePrepActionOutcome<T> = {
              status: 'succeeded', request, accepted: true, reused: false, data,
              safeErrorCode: null, retryEligible: false, cancellationReason: null, completedAt,
            };
            active = null;
            lastOutcome = outcome;
            publish({
              ...state, status: 'succeeded', completedAt, safeErrorCode: null,
              retryEligible: false, cancellationReason: null,
            });
            return outcome;
          },
          (error) => {
            if (!currentRequestMatches(request) || controller.signal.aborted) {
              return {
                status: 'cancelled', request, accepted: false, reused: false, data: null,
                safeErrorCode: null, retryEligible: false, cancellationReason: 'superseded', completedAt: safeDate(now),
              };
            }
            const completedAt = safeDate(now);
            const safeErrorCode = normalizeSafeErrorCode(error, input.safeErrorCode);
            const outcome: OfflinePrepActionOutcome<T> = {
              status: 'failed', request, accepted: true, reused: false, data: null,
              safeErrorCode, retryEligible: true, cancellationReason: null, completedAt,
            };
            active = null;
            lastOutcome = outcome;
            publish({
              ...state, status: 'failed', completedAt, safeErrorCode,
              retryEligible: true, cancellationReason: null,
            });
            return outcome;
          },
        );

      const promise = Promise.race([providerPromise, cancellationPromise]);
      active = { request, controller, promise, resolveCancellation };
      publish({
        status: 'running', action: input.action, requestId, fingerprint: input.fingerprint,
        generation, attempt, startedAt, completedAt: null, safeErrorCode: null,
        retryEligible: false, cancellationReason: null,
      });

      return { decision: 'started', request, shared: false, promise };
    },

    cancel(reason = 'user_cancelled') {
      return cancelActive(reason);
    },

    dispose() {
      disposed = true;
      return cancelActive('unmount');
    },
  };
}
