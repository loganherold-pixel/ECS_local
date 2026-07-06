import { InteractionManager } from 'react-native';

export type ShellInteractionTask = {
  cancel: () => void;
};

type ShellInteractionOptions = {
  delayMs?: number;
  maxWaitMs?: number;
};

const DEFAULT_SHELL_INTERACTION_MAX_WAIT_MS = 120;

function scheduleFrame(callback: () => void): ShellInteractionTask {
  if (typeof requestAnimationFrame === 'function') {
    const frame = requestAnimationFrame(callback);
    return {
      cancel: () => cancelAnimationFrame(frame),
    };
  }

  const timer = setTimeout(callback, 0);
  return {
    cancel: () => clearTimeout(timer),
  };
}

export function cancelShellInteractionTask(task: ShellInteractionTask | null | undefined): void {
  task?.cancel();
}

export function runAfterShellInteractions(
  callback: () => void,
  options: ShellInteractionOptions = {},
): ShellInteractionTask {
  let cancelled = false;
  let completed = false;
  let delayTimer: ReturnType<typeof setTimeout> | null = null;
  let fallbackTimer: ReturnType<typeof setTimeout> | null = null;
  let frameTask: ShellInteractionTask | null = null;

  const runOnce = () => {
    if (cancelled || completed) return;
    completed = true;
    if (fallbackTimer) {
      clearTimeout(fallbackTimer);
      fallbackTimer = null;
    }
    if (delayTimer) {
      clearTimeout(delayTimer);
      delayTimer = null;
    }
    frameTask = scheduleFrame(callback);
  };

  const runAfterDelay = () => {
    if (cancelled || completed) return;
    if (fallbackTimer) {
      clearTimeout(fallbackTimer);
      fallbackTimer = null;
    }
    if (delayTimer) return;
    const delayMs = Math.max(0, options.delayMs ?? 0);
    if (delayMs > 0) {
      delayTimer = setTimeout(runOnce, delayMs);
      return;
    }

    runOnce();
  };

  const interactionTask = InteractionManager.runAfterInteractions(runAfterDelay);
  const maxWaitMs = Math.max(0, options.maxWaitMs ?? DEFAULT_SHELL_INTERACTION_MAX_WAIT_MS);
  fallbackTimer = setTimeout(runAfterDelay, maxWaitMs);

  return {
    cancel: () => {
      cancelled = true;
      if (typeof interactionTask.cancel === 'function') {
        interactionTask.cancel();
      }
      if (delayTimer) {
        clearTimeout(delayTimer);
        delayTimer = null;
      }
      if (fallbackTimer) {
        clearTimeout(fallbackTimer);
        fallbackTimer = null;
      }
      frameTask?.cancel();
      frameTask = null;
    },
  };
}

export function deferShellRouteNavigation(callback: () => void): ShellInteractionTask {
  return scheduleFrame(callback);
}
