import { useSyncExternalStore } from 'react';
import type { ECSRuntimeContradiction, ECSRuntimeSmokeSnapshot, ECSRuntimeSmokeState } from './runtimeContradictionTypes';
import { runtimeSmokeStore } from './runtimeSmokeStore';

export function selectRuntimeSmokeState(): ECSRuntimeSmokeState {
  return runtimeSmokeStore.getSnapshot();
}

export function selectRuntimeSmokeSnapshot(): ECSRuntimeSmokeSnapshot {
  const snapshot = runtimeSmokeStore.getSnapshot();
  return {
    capturedAt: snapshot.capturedAt,
    enabled: snapshot.enabled,
    shell: snapshot.shell,
    command: snapshot.command,
    markers: snapshot.markers,
    contradictions: snapshot.contradictions,
  };
}

export function selectRuntimeSmokeContradictions(): ECSRuntimeContradiction[] {
  return runtimeSmokeStore.getSnapshot().contradictions;
}

export function useRuntimeSmokeState(): ECSRuntimeSmokeState {
  return useSyncExternalStore(
    runtimeSmokeStore.subscribe,
    runtimeSmokeStore.getSnapshot,
    runtimeSmokeStore.getSnapshot,
  );
}
