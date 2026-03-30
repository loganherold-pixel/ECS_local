/**
 * ECSModal — Global Overlay Motion System
 *
 * Drop-in replacement for React Native <Modal> with consistent
 * fade + rise animation across the entire app.
 *
 * Two animation tiers:
 *   Tier A (global)  — Default for all popups/overlays
 *   Tier S (safety)  — Faster timing for emergency/safety content
 *
 * Features:
 * - Backdrop fade (opacity 0 → 0.35 / 0.28)
 * - Panel fade + rise (translateY + opacity)
 * - Reduced motion support (opacity only, shorter durations)
 * - Tap-outside-to-close preserved
 * - No spring/bounce animations
 * - No scaling
 *
 * MODAL STATE GUARDS (prevents duplicate / re-opening popups):
 * - isClosingRef prevents double-close animations
 * - Re-open during close animation cancels close and re-opens
 * - onClose callback fires exactly once per close cycle
 * - Cooldown after dismiss prevents immediate re-trigger
 */
import React, { useEffect, useRef, useCallback, useState } from 'react';
import {
  Modal,
  Animated,
  Easing,
  StyleSheet,
  TouchableWithoutFeedback,
  View,
  AccessibilityInfo,
  Platform,
} from 'react-native';

// ── Motion Tier Configuration ──────────────────────────────
const TIER_A = {
  // OPEN
  backdropOpacity: 0.35,
  backdropDuration: 120,
  panelDuration: 180,
  panelTranslateY: 12,
  // CLOSE
  closeBackdropDuration: 120,
  closePanelDuration: 140,
  closePanelTranslateY: 8,
  // REDUCED MOTION
  reducedOpenDuration: 120,
  reducedCloseDuration: 100,
};

const TIER_S = {
  // OPEN (FAST)
  backdropOpacity: 0.28,
  backdropDuration: 80,
  panelDuration: 120,
  panelTranslateY: 8,
  // CLOSE (FAST)
  closeBackdropDuration: 90,
  closePanelDuration: 100,
  closePanelTranslateY: 6,
  // REDUCED MOTION
  reducedOpenDuration: 90,
  reducedCloseDuration: 80,
};

/** Cooldown after dismiss to prevent immediate re-trigger (ms) */
const DISMISS_COOLDOWN_MS = 200;

export type OverlayTier = 'global' | 'safety';

interface ECSModalProps {
  visible: boolean;
  onClose?: () => void;
  tier?: OverlayTier;
  /** Whether tapping the backdrop closes the modal (default: true) */
  dismissOnBackdrop?: boolean;
  /** Custom backdrop opacity override */
  backdropOpacity?: number;
  /** Pass-through to Modal onRequestClose (Android back button) */
  onRequestClose?: () => void;
  /** Children rendered inside the animated container */
  children: React.ReactNode;
}

export default function ECSModal({
  visible,
  onClose,
  tier = 'global',
  dismissOnBackdrop = true,
  backdropOpacity: customBackdropOpacity,
  onRequestClose,
  children,
}: ECSModalProps) {
  const config = tier === 'safety' ? TIER_S : TIER_A;
  const targetBackdropOpacity = customBackdropOpacity ?? config.backdropOpacity;

  // Animation values
  const backdropAnim = useRef(new Animated.Value(0)).current;
  const panelOpacity = useRef(new Animated.Value(0)).current;
  const panelTranslateY = useRef(new Animated.Value(config.panelTranslateY)).current;

  // Internal visibility state for delayed unmount
  const [modalVisible, setModalVisible] = useState(visible);

  // ── Modal State Guards ──────────────────────────────────
  // Prevents double-close, re-open race conditions, and duplicate onClose calls.
  const isClosingRef = useRef(false);
  const isOpeningRef = useRef(false);
  const onCloseFiredRef = useRef(false);
  const cooldownRef = useRef(false);
  const cooldownTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  // Track the open/close cycle to invalidate stale animation callbacks
  const cycleRef = useRef(0);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (cooldownTimerRef.current) clearTimeout(cooldownTimerRef.current);
    };
  }, []);

  // Reduced motion detection
  const reducedMotion = useRef(false);
  useEffect(() => {
    if (Platform.OS === 'web') {
      try {
        const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)');
        reducedMotion.current = mq?.matches ?? false;
      } catch { reducedMotion.current = false; }
    } else {
      AccessibilityInfo.isReduceMotionEnabled?.()
        .then(val => { reducedMotion.current = val; })
        .catch(() => {});
    }
  }, []);

  // ── OPEN animation ──────────────────────────────────────
  const animateOpen = useCallback(() => {
    const cycle = ++cycleRef.current;
    isOpeningRef.current = true;
    isClosingRef.current = false;
    onCloseFiredRef.current = false;

    const rm = reducedMotion.current;

    // Reset values
    backdropAnim.setValue(0);
    panelOpacity.setValue(0);
    panelTranslateY.setValue(rm ? 0 : config.panelTranslateY);

    Animated.parallel([
      Animated.timing(backdropAnim, {
        toValue: targetBackdropOpacity,
        duration: rm ? config.reducedOpenDuration : config.backdropDuration,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(panelOpacity, {
        toValue: 1,
        duration: rm ? config.reducedOpenDuration : config.panelDuration,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      ...(rm ? [] : [
        Animated.timing(panelTranslateY, {
          toValue: 0,
          duration: config.panelDuration,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]),
    ]).start(() => {
      // Only clear opening flag if this cycle is still current
      if (cycle === cycleRef.current) {
        isOpeningRef.current = false;
      }
    });
  }, [config, targetBackdropOpacity]);

  // ── CLOSE animation ─────────────────────────────────────
  const animateClose = useCallback((callback?: () => void) => {
    // Guard: if already closing, don't start another close animation
    if (isClosingRef.current) return;

    const cycle = ++cycleRef.current;
    isClosingRef.current = true;
    isOpeningRef.current = false;

    const rm = reducedMotion.current;

    Animated.parallel([
      Animated.timing(panelOpacity, {
        toValue: 0,
        duration: rm ? config.reducedCloseDuration : config.closePanelDuration,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
      ...(rm ? [] : [
        Animated.timing(panelTranslateY, {
          toValue: config.closePanelTranslateY,
          duration: config.closePanelDuration,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }),
      ]),
      Animated.timing(backdropAnim, {
        toValue: 0,
        duration: rm ? config.reducedCloseDuration : config.closeBackdropDuration,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start(() => {
      // Only complete if this cycle is still current (not superseded by re-open)
      if (cycle === cycleRef.current && mountedRef.current) {
        isClosingRef.current = false;
        setModalVisible(false);

        // Start cooldown to prevent immediate re-trigger
        cooldownRef.current = true;
        if (cooldownTimerRef.current) clearTimeout(cooldownTimerRef.current);
        cooldownTimerRef.current = setTimeout(() => {
          cooldownRef.current = false;
          cooldownTimerRef.current = null;
        }, DISMISS_COOLDOWN_MS);

        callback?.();
      }
    });
  }, [config]);

  // ── Visibility state management ─────────────────────────
  useEffect(() => {
    if (visible) {
      // If in cooldown after a recent dismiss, skip this open
      // (prevents the same trigger from immediately re-opening)
      if (cooldownRef.current) return;

      // If currently closing, cancel the close and re-open
      if (isClosingRef.current) {
        isClosingRef.current = false;
        // Increment cycle to invalidate the pending close callback
        cycleRef.current++;
      }

      setModalVisible(true);
      // Small delay to ensure Modal is mounted before animating
      requestAnimationFrame(() => {
        if (mountedRef.current) {
          animateOpen();
        }
      });
    } else if (modalVisible) {
      animateClose();
    }
  }, [visible]);

  const handleRequestClose = useCallback(() => {
    // Guard: fire onClose/onRequestClose only once per cycle
    if (onCloseFiredRef.current) return;
    onCloseFiredRef.current = true;

    if (onRequestClose) {
      onRequestClose();
    } else if (onClose) {
      onClose();
    }
  }, [onRequestClose, onClose]);

  const handleBackdropPress = useCallback(() => {
    if (!dismissOnBackdrop || !onClose) return;

    // Guard: fire onClose only once per cycle
    if (onCloseFiredRef.current) return;
    onCloseFiredRef.current = true;

    onClose();
  }, [dismissOnBackdrop, onClose]);

  if (!modalVisible && !visible) return null;

  return (
    <Modal
      visible={modalVisible}
      transparent
      animationType="none"
      onRequestClose={handleRequestClose}
      statusBarTranslucent
    >
      {/* Backdrop */}
      <Animated.View style={[styles.backdrop, { opacity: backdropAnim }]}>
        <TouchableWithoutFeedback onPress={handleBackdropPress}>
          <View style={StyleSheet.absoluteFill} />
        </TouchableWithoutFeedback>
      </Animated.View>

      {/* Animated Content Wrapper */}
      <Animated.View
        style={[
          styles.contentWrapper,
          {
            opacity: panelOpacity,
            transform: [{ translateY: panelTranslateY }],
          },
        ]}
        pointerEvents="box-none"
      >
        {children}
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000',
  },
  contentWrapper: {
    flex: 1,
  },
});

// ═══════════════════════════════════════════════════════════
// useOverlayMotion — Hook for custom overlay implementations
// ═══════════════════════════════════════════════════════════
// For modals that use <View absoluteFill> instead of <Modal>,
// e.g. WidgetDetailModal, CreateCustomWidgetModal
//
// Usage:
//   const { backdropOpacity, panelOpacity, panelTranslateY, startClose } = useOverlayMotion('global', visible);
//
// GUARDS:
// - isClosing prevents double-close
// - onCloseComplete fires exactly once
// - Cycle tracking invalidates stale callbacks
//
export function useOverlayMotion(tier: OverlayTier, visible: boolean, onCloseComplete?: () => void) {
  const config = tier === 'safety' ? TIER_S : TIER_A;

  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const panelOpacity = useRef(new Animated.Value(0)).current;
  const panelTranslateY = useRef(new Animated.Value(config.panelTranslateY)).current;

  // ── Guards ──────────────────────────────────────────────
  const isClosingRef = useRef(false);
  const cycleRef = useRef(0);
  const closeCompleteFiredRef = useRef(false);

  const reducedMotion = useRef(false);
  useEffect(() => {
    if (Platform.OS === 'web') {
      try {
        const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)');
        reducedMotion.current = mq?.matches ?? false;
      } catch { reducedMotion.current = false; }
    } else {
      AccessibilityInfo.isReduceMotionEnabled?.()
        .then(val => { reducedMotion.current = val; })
        .catch(() => {});
    }
  }, []);

  useEffect(() => {
    if (visible) {
      const cycle = ++cycleRef.current;
      isClosingRef.current = false;
      closeCompleteFiredRef.current = false;

      const rm = reducedMotion.current;
      backdropOpacity.setValue(0);
      panelOpacity.setValue(0);
      panelTranslateY.setValue(rm ? 0 : config.panelTranslateY);

      Animated.parallel([
        Animated.timing(backdropOpacity, {
          toValue: config.backdropOpacity,
          duration: rm ? config.reducedOpenDuration : config.backdropDuration,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(panelOpacity, {
          toValue: 1,
          duration: rm ? config.reducedOpenDuration : config.panelDuration,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        ...(rm ? [] : [
          Animated.timing(panelTranslateY, {
            toValue: 0,
            duration: config.panelDuration,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
        ]),
      ]).start();
    }
  }, [visible]);

  const startClose = useCallback((callback?: () => void) => {
    // Guard: prevent double-close
    if (isClosingRef.current) return;
    isClosingRef.current = true;

    const cycle = ++cycleRef.current;
    const rm = reducedMotion.current;

    Animated.parallel([
      Animated.timing(panelOpacity, {
        toValue: 0,
        duration: rm ? config.reducedCloseDuration : config.closePanelDuration,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
      ...(rm ? [] : [
        Animated.timing(panelTranslateY, {
          toValue: config.closePanelTranslateY,
          duration: config.closePanelDuration,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }),
      ]),
      Animated.timing(backdropOpacity, {
        toValue: 0,
        duration: rm ? config.reducedCloseDuration : config.closeBackdropDuration,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start(() => {
      if (cycle === cycleRef.current) {
        isClosingRef.current = false;
        callback?.();

        // Fire onCloseComplete exactly once per open→close cycle
        if (!closeCompleteFiredRef.current) {
          closeCompleteFiredRef.current = true;
          onCloseComplete?.();
        }
      }
    });
  }, [config, onCloseComplete]);

  return {
    backdropOpacity,
    panelOpacity,
    panelTranslateY,
    startClose,
  };
}



