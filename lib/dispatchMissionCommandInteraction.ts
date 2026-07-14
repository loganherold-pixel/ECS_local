export interface MissionCommandActionFlightGuard {
  tryAcquire: (actionKey: string) => boolean;
  release: (actionKey: string) => boolean;
  reset: () => void;
  getActiveKey: () => string | null;
}

/**
 * Owns the one in-flight Command Board mutation. The UI controls the bounded
 * hold window; this guard only guarantees deterministic acquire/release rules.
 */
export function createMissionCommandActionFlightGuard(): MissionCommandActionFlightGuard {
  let activeKey: string | null = null;
  return {
    tryAcquire(actionKey) {
      const normalized = normalizeActionKey(actionKey);
      if (!normalized || activeKey !== null) return false;
      activeKey = normalized;
      return true;
    },
    release(actionKey) {
      if (activeKey !== normalizeActionKey(actionKey)) return false;
      activeKey = null;
      return true;
    },
    reset() {
      activeKey = null;
    },
    getActiveKey() {
      return activeKey;
    },
  };
}

function normalizeActionKey(value: string): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, 360);
}
