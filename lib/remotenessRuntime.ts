export interface RemotenessRuntimeSnapshot {
  isRunning: boolean;
  score: number;
  tier: string | null;
  lastComputedAt: number | null;
}

const DEFAULT_REMOTENESS_RUNTIME_SNAPSHOT: RemotenessRuntimeSnapshot = {
  isRunning: false,
  score: 0,
  tier: null,
  lastComputedAt: null,
};

let remotenessRuntimeSnapshot: RemotenessRuntimeSnapshot = {
  ...DEFAULT_REMOTENESS_RUNTIME_SNAPSHOT,
};

export function getRemotenessRuntimeSnapshot(): RemotenessRuntimeSnapshot {
  return { ...remotenessRuntimeSnapshot };
}

export function setRemotenessRuntimeSnapshot(
  next: Partial<RemotenessRuntimeSnapshot>,
): void {
  remotenessRuntimeSnapshot = {
    ...remotenessRuntimeSnapshot,
    ...next,
  };
}

export function resetRemotenessRuntimeSnapshot(): void {
  remotenessRuntimeSnapshot = {
    ...DEFAULT_REMOTENESS_RUNTIME_SNAPSHOT,
  };
}
