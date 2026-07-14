import {
  buildMissionClockSnapshot,
  type MissionClockDeadlineInput,
  type MissionClockSnapshot,
} from './dispatchMissionClock';

const MINUTE_MS = 60_000;

export interface MissionClockSchedulerOptions {
  minRefreshMs?: number;
  maxRefreshMs?: number;
}

export interface MissionClockSchedulerDiagnostics {
  running: boolean;
  foreground: boolean;
  activeTimerCount: 0 | 1;
  scheduledDelayMs: number | null;
  tickCount: number;
}

export interface MissionClockScheduler {
  start: (deadlines: MissionClockDeadlineInput[]) => void;
  update: (deadlines: MissionClockDeadlineInput[]) => void;
  setForeground: (foreground: boolean) => void;
  stop: () => void;
  getSnapshot: () => MissionClockSnapshot;
  getDiagnostics: () => MissionClockSchedulerDiagnostics;
}

export interface CreateMissionClockSchedulerInput extends MissionClockSchedulerOptions {
  onTick: (snapshot: MissionClockSnapshot) => void;
  now?: () => number;
  setTimeoutFn?: (callback: () => void, delayMs: number) => ReturnType<typeof setTimeout>;
  clearTimeoutFn?: (handle: ReturnType<typeof setTimeout>) => void;
  initialForeground?: boolean;
}

export function createMissionClockScheduler(
  input: CreateMissionClockSchedulerInput,
): MissionClockScheduler {
  const now = input.now ?? Date.now;
  const setTimeoutFn = input.setTimeoutFn ?? ((callback, delayMs) => setTimeout(callback, delayMs));
  const clearTimeoutFn = input.clearTimeoutFn ?? ((handle) => clearTimeout(handle));
  const options = normalizeSchedulerOptions(input);
  let deadlines: MissionClockDeadlineInput[] = [];
  let snapshot = buildMissionClockSnapshot(deadlines, now());
  let timer: ReturnType<typeof setTimeout> | null = null;
  let scheduledDelayMs: number | null = null;
  let running = false;
  let foreground = input.initialForeground ?? true;
  let tickCount = 0;

  const clearScheduledTimer = () => {
    if (timer != null) clearTimeoutFn(timer);
    timer = null;
    scheduledDelayMs = null;
  };

  const tick = () => {
    clearScheduledTimer();
    if (!running || !foreground) return;
    snapshot = buildMissionClockSnapshot(deadlines, now());
    tickCount += 1;
    input.onTick(snapshot);
    const delay = selectMissionClockRefreshDelay(snapshot, options);
    if (delay == null) return;
    scheduledDelayMs = delay;
    timer = setTimeoutFn(() => {
      timer = null;
      scheduledDelayMs = null;
      tick();
    }, delay);
  };

  return {
    start(nextDeadlines) {
      running = true;
      deadlines = [...nextDeadlines];
      tick();
    },
    update(nextDeadlines) {
      deadlines = [...nextDeadlines];
      if (running) tick();
      else snapshot = buildMissionClockSnapshot(deadlines, now());
    },
    setForeground(nextForeground) {
      if (foreground === nextForeground) return;
      foreground = nextForeground;
      if (!foreground) clearScheduledTimer();
      else if (running) tick();
    },
    stop() {
      running = false;
      clearScheduledTimer();
    },
    getSnapshot() {
      return snapshot;
    },
    getDiagnostics() {
      return {
        running,
        foreground,
        activeTimerCount: timer == null ? 0 : 1,
        scheduledDelayMs,
        tickCount,
      };
    },
  };
}

export function selectMissionClockRefreshDelay(
  snapshot: MissionClockSnapshot,
  options: Required<MissionClockSchedulerOptions> = {
    minRefreshMs: 1_000,
    maxRefreshMs: MINUTE_MS,
  },
): number | null {
  if (snapshot.active.length === 0) return null;
  const untilTransition = snapshot.nextTransitionAtMs == null
    ? options.maxRefreshMs
    : snapshot.nextTransitionAtMs - snapshot.nowMs;
  return Math.max(
    options.minRefreshMs,
    Math.min(options.maxRefreshMs, Math.max(0, untilTransition)),
  );
}

function normalizeSchedulerOptions(
  input: MissionClockSchedulerOptions,
): Required<MissionClockSchedulerOptions> {
  const minRefreshMs = clampRefresh(input.minRefreshMs, 250, MINUTE_MS, 1_000);
  const maxRefreshMs = clampRefresh(input.maxRefreshMs, minRefreshMs, 5 * MINUTE_MS, MINUTE_MS);
  return { minRefreshMs, maxRefreshMs };
}

function clampRefresh(value: number | undefined, min: number, max: number, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(value)));
}
