export type FreeSessionTransitionState =
  | 'idle'
  | 'activating'
  | 'state_committed'
  | 'navigating'
  | 'destination_mounted'
  | 'failed';

export type FreeSessionTransitionSnapshot = {
  state: FreeSessionTransitionState;
  generation: number;
  correlationId: string | null;
  navigationCount: number;
  navigationTarget: string | null;
};

export type FreeSessionTransitionEvent =
  | 'free_session_press_received'
  | 'free_session_duplicate_press_rejected'
  | 'free_session_activation_started'
  | 'free_session_state_committed'
  | 'free_session_intentional_sign_in_reset'
  | 'auth_hydration_ignored_for_authoritative_free_session'
  | 'navigation_requested'
  | 'navigation_dispatched'
  | 'destination_route_mount_started'
  | 'destination_shell_visible'
  | 'destination_accessibility_ready'
  | 'transition_failed';

export function createFreeSessionTransitionCoordinator(options?: {
  correlationId?: (generation: number) => string;
  onEvent?: (event: FreeSessionTransitionEvent, snapshot: FreeSessionTransitionSnapshot) => void;
}) {
  let snapshot: FreeSessionTransitionSnapshot = {
    state: 'idle', generation: 0, correlationId: null, navigationCount: 0, navigationTarget: null,
  };
  const emit = (event: FreeSessionTransitionEvent) => options?.onEvent?.(event, { ...snapshot });
  const setState = (state: FreeSessionTransitionState) => { snapshot = { ...snapshot, state }; };

  return {
    snapshot: () => ({ ...snapshot }),
    begin() {
      emit('free_session_press_received');
      if (snapshot.state !== 'idle' && snapshot.state !== 'failed') {
        emit('free_session_duplicate_press_rejected');
        return null;
      }
      const generation = snapshot.generation + 1;
      snapshot = {
        state: 'activating', generation,
        correlationId: options?.correlationId?.(generation) ?? `free-${generation}`,
        navigationCount: 0,
        navigationTarget: null,
      };
      emit('free_session_activation_started');
      return generation;
    },
    commit(generation: number) {
      if (generation !== snapshot.generation || snapshot.state !== 'activating') return false;
      setState('state_committed');
      emit('free_session_state_committed');
      return true;
    },
    requestNavigation(generation: number, target: string) {
      emit('navigation_requested');
      const normalizedTarget = target.trim();
      if (
        generation !== snapshot.generation ||
        snapshot.state !== 'state_committed' ||
        snapshot.navigationCount !== 0 ||
        !normalizedTarget.startsWith('/')
      ) return false;
      snapshot = {
        ...snapshot,
        state: 'navigating',
        navigationCount: 1,
        navigationTarget: normalizedTarget,
      };
      emit('navigation_dispatched');
      return true;
    },
    markDestinationMounted(route: string, generation = snapshot.generation) {
      if (
        generation !== snapshot.generation ||
        snapshot.state !== 'navigating' ||
        route !== snapshot.navigationTarget
      ) return false;
      setState('destination_mounted');
      emit('destination_route_mount_started');
      emit('destination_shell_visible');
      emit('destination_accessibility_ready');
      return true;
    },
    fail(generation: number) {
      if (generation !== snapshot.generation) return false;
      setState('failed');
      emit('transition_failed');
      return true;
    },
    isAuthoritative() {
      return snapshot.state === 'state_committed' || snapshot.state === 'navigating' || snapshot.state === 'destination_mounted';
    },
    shouldIgnoreHydration(startedGeneration: number) {
      const ignored = this.isAuthoritative() && startedGeneration < snapshot.generation;
      if (ignored) emit('auth_hydration_ignored_for_authoritative_free_session');
      return ignored;
    },
    resetForIntentionalSignIn() {
      snapshot = {
        state: 'idle',
        generation: snapshot.generation,
        correlationId: null,
        navigationCount: 0,
        navigationTarget: null,
      };
      emit('free_session_intentional_sign_in_reset');
    },
  };
}

export function equalFreeSessionTransitionSnapshot(
  left: FreeSessionTransitionSnapshot,
  right: FreeSessionTransitionSnapshot,
): boolean {
  return (
    left.state === right.state &&
    left.generation === right.generation &&
    left.correlationId === right.correlationId &&
    left.navigationCount === right.navigationCount &&
    left.navigationTarget === right.navigationTarget
  );
}
