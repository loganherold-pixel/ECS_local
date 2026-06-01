import { InteractionManager } from 'react-native';

export type ShellInteractionTask = {
  cancel: () => void;
};

type ShellInteractionOptions = {
  delayMs?: number;
};

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
  let delayTimer: ReturnType<typeof setTimeout> | null = null;
  let frameTask: ShellInteractionTask | null = null;

  const runAfterDelay = () => {
    if (cancelled) return;
    const delayMs = Math.max(0, options.delayMs ?? 0);
    if (delayMs > 0) {
      delayTimer = setTimeout(() => {
        delayTimer = null;
        if (cancelled) return;
        frameTask = scheduleFrame(callback);
      }, delayMs);
      return;
    }

    frameTask = scheduleFrame(callback);
  };

  const interactionTask = InteractionManager.runAfterInteractions(runAfterDelay);

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
      frameTask?.cancel();
      frameTask = null;
    },
  };
}

export function deferShellRouteNavigation(callback: () => void): ShellInteractionTask {
  return scheduleFrame(callback);
}
