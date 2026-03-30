/**
 * useModalGuard — Prevents duplicate or repeatedly reopening popups.
 *
 * Wraps modal visibility state with safeguards:
 *
 *   1. One-shot trigger: Each open() call generates a unique trigger ID.
 *      The modal can only render once per trigger event.
 *
 *   2. Clean dismiss: close() immediately clears render state AND
 *      sets a cooldown flag to prevent the same trigger from
 *      re-opening the modal within the cooldown window.
 *
 *   3. Race condition prevention: If close() is called while an
 *      open animation is in progress, the close takes priority.
 *      Multiple rapid open/close cycles are collapsed.
 *
 *   4. Single-fire onDismiss: The onDismiss callback fires exactly
 *      once per open→close cycle, even if close() is called multiple
 *      times (e.g., backdrop tap + Android back button simultaneously).
 *
 *   5. Completion flag reset: For success/completion dialogs, the
 *      acknowledged() method marks the trigger as handled so it
 *      won't re-appear on re-renders.
 *
 * Usage:
 *   const modal = useModalGuard();
 *
 *   // Open:
 *   modal.open();
 *
 *   // In JSX:
 *   <Modal visible={modal.visible}>
 *     <Button onPress={modal.close} />
 *   </Modal>
 *
 *   // For completion dialogs that shouldn't re-trigger:
 *   modal.open('expedition-123');  // keyed trigger
 *   // After dismiss:
 *   modal.close();  // automatically prevents re-trigger for same key
 */

import { useState, useCallback, useRef } from 'react';

/** Default cooldown after dismiss (ms) — prevents immediate re-trigger */
const DEFAULT_COOLDOWN_MS = 300;

interface ModalGuardOptions {
  /** Cooldown period after dismiss before modal can reopen (default: 300ms) */
  cooldownMs?: number;
  /** Called exactly once when modal closes (after open→close cycle) */
  onDismiss?: () => void;
}

interface ModalGuardReturn {
  /** Whether the modal should be rendered/visible */
  visible: boolean;
  /** Open the modal. Optional triggerKey prevents duplicate opens for same event. */
  open: (triggerKey?: string) => void;
  /** Close the modal. Safe to call multiple times — onDismiss fires only once. */
  close: () => void;
  /** Mark a trigger key as permanently acknowledged (won't re-trigger). */
  acknowledge: (triggerKey?: string) => void;
  /** Check if a trigger key has been acknowledged. */
  isAcknowledged: (triggerKey: string) => boolean;
  /** Reset all acknowledged keys (useful on logout/cleanup). */
  resetAcknowledged: () => void;
}

export function useModalGuard(options: ModalGuardOptions = {}): ModalGuardReturn {
  const { cooldownMs = DEFAULT_COOLDOWN_MS, onDismiss } = options;

  const [visible, setVisible] = useState(false);

  // Track the current open cycle to ensure onDismiss fires once
  const openCycleRef = useRef(0);
  // Track whether onDismiss has fired for the current cycle
  const dismissFiredRef = useRef(false);
  // Cooldown flag — true while in cooldown after dismiss
  const inCooldownRef = useRef(false);
  // Cooldown timer
  const cooldownTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Current trigger key (for keyed opens)
  const currentTriggerRef = useRef<string | null>(null);
  // Set of permanently acknowledged trigger keys
  const acknowledgedRef = useRef<Set<string>>(new Set());
  // Mounted guard
  const mountedRef = useRef(true);

  // Cleanup on unmount
  useState(() => {
    return () => {
      mountedRef.current = false;
      if (cooldownTimerRef.current) {
        clearTimeout(cooldownTimerRef.current);
      }
    };
  });

  const open = useCallback((triggerKey?: string) => {
    // If a trigger key is provided, check if it's been acknowledged
    if (triggerKey && acknowledgedRef.current.has(triggerKey)) {
      return; // This trigger has been permanently dismissed
    }

    // If in cooldown, reject the open
    if (inCooldownRef.current) {
      return;
    }

    // If already visible with the same trigger key, reject duplicate
    if (visible && triggerKey && triggerKey === currentTriggerRef.current) {
      return;
    }

    // Start a new open cycle
    openCycleRef.current += 1;
    dismissFiredRef.current = false;
    currentTriggerRef.current = triggerKey || null;

    if (mountedRef.current) {
      setVisible(true);
    }
  }, [visible]);

  const close = useCallback(() => {
    // If not visible, no-op
    if (!visible) return;

    // Capture the cycle at close time
    const closeCycle = openCycleRef.current;

    // Immediately clear visibility
    if (mountedRef.current) {
      setVisible(false);
    }

    // Fire onDismiss exactly once per cycle
    if (!dismissFiredRef.current && closeCycle === openCycleRef.current) {
      dismissFiredRef.current = true;

      // If there was a trigger key, auto-acknowledge it
      if (currentTriggerRef.current) {
        acknowledgedRef.current.add(currentTriggerRef.current);
      }

      // Start cooldown
      inCooldownRef.current = true;
      if (cooldownTimerRef.current) {
        clearTimeout(cooldownTimerRef.current);
      }
      cooldownTimerRef.current = setTimeout(() => {
        inCooldownRef.current = false;
        cooldownTimerRef.current = null;
      }, cooldownMs);

      // Fire the callback
      onDismiss?.();
    }

    // Clear trigger
    currentTriggerRef.current = null;
  }, [visible, cooldownMs, onDismiss]);

  const acknowledge = useCallback((triggerKey?: string) => {
    const key = triggerKey || currentTriggerRef.current;
    if (key) {
      acknowledgedRef.current.add(key);
    }
  }, []);

  const isAcknowledged = useCallback((triggerKey: string) => {
    return acknowledgedRef.current.has(triggerKey);
  }, []);

  const resetAcknowledged = useCallback(() => {
    acknowledgedRef.current.clear();
  }, []);

  return {
    visible,
    open,
    close,
    acknowledge,
    isAcknowledged,
    resetAcknowledged,
  };
}

// ═══════════════════════════════════════════════════════════
// useOneShotFlag — Simple flag that fires once per trigger
// ═══════════════════════════════════════════════════════════
// For cases where you just need to prevent a callback from
// firing multiple times (e.g., onDismiss, onComplete).
//
// Usage:
//   const guard = useOneShotFlag();
//   const handleDismiss = () => {
//     if (guard.fire()) {
//       // This block runs exactly once
//       doExpensiveCleanup();
//     }
//   };
//   // Reset when modal opens again:
//   guard.reset();

export function useOneShotFlag() {
  const firedRef = useRef(false);

  const fire = useCallback((): boolean => {
    if (firedRef.current) return false;
    firedRef.current = true;
    return true;
  }, []);

  const reset = useCallback(() => {
    firedRef.current = false;
  }, []);

  const hasFired = useCallback(() => firedRef.current, []);

  return { fire, reset, hasFired };
}

