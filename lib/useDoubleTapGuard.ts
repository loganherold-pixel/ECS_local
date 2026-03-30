/**
 * useDoubleTapGuard — Phase 9
 *
 * React hook that prevents double-tap events on buttons and interactive elements.
 * Returns a guard function that wraps callbacks to suppress rapid re-invocations.
 *
 * Usage:
 *   const guard = useDoubleTapGuard(300);
 *   <TouchableOpacity onPress={guard(() => doSomething())} />
 */

import { useRef, useCallback } from 'react';

/**
 * Hook that returns a guard wrapper function.
 * Any callback wrapped with the guard will be suppressed if called
 * within `cooldownMs` of the last invocation.
 *
 * @param cooldownMs - Minimum time between allowed invocations (default: 300ms)
 */
export function useDoubleTapGuard(cooldownMs: number = 300) {
  const lastCallTimeRef = useRef(0);

  const guard = useCallback(
    <T extends (...args: any[]) => any>(callback: T): ((...args: Parameters<T>) => void) => {
      return (...args: Parameters<T>) => {
        const now = Date.now();
        if (now - lastCallTimeRef.current < cooldownMs) {
          return; // Suppress double-tap
        }
        lastCallTimeRef.current = now;
        callback(...args);
      };
    },
    [cooldownMs],
  );

  return guard;
}

/**
 * Simple hook that returns a boolean check function.
 * Call `shouldProcess()` at the start of your handler.
 *
 * Usage:
 *   const shouldProcess = useTapThrottle(300);
 *   const handlePress = () => {
 *     if (!shouldProcess()) return;
 *     doSomething();
 *   };
 */
export function useTapThrottle(cooldownMs: number = 300) {
  const lastCallTimeRef = useRef(0);

  const shouldProcess = useCallback(() => {
    const now = Date.now();
    if (now - lastCallTimeRef.current < cooldownMs) {
      return false;
    }
    lastCallTimeRef.current = now;
    return true;
  }, [cooldownMs]);

  return shouldProcess;
}

