/**
 * VCDAdaptivePanel — Animated wrapper for VCD panel state transitions
 * ====================================================================
 *
 * Wraps any VCD panel content and applies smooth opacity/border/glow
 * transitions based on the panel's current state (PASSIVE/ACTIVE/ALERT).
 *
 * Two modes:
 *   - inline (default): Adds border, glow, and indicator pip around content.
 *   - overlay: Fills parent container with pointerEvents="box-none",
 *     applies only opacity animation. Designed for wrapping panels that
 *     have their own absolute positioning (e.g. RouteAnalysisPanel).
 *
 * Usage (inline):
 *   <VCDAdaptivePanel panelState="ACTIVE">
 *     <SomeInlinePanel />
 *   </VCDAdaptivePanel>
 *
 * Usage (overlay):
 *   <VCDAdaptivePanel panelState={panelStates.ROUTE} overlay>
 *     <RouteAnalysisPanel ... />
 *   </VCDAdaptivePanel>
 *
 * Visual behavior:
 *   PASSIVE — opacity 0.65, neutral border, no glow
 *   ACTIVE  — opacity 1.0, ECS gold border, subtle gold glow
 *   ALERT   — opacity 1.0, red/amber border, subtle red glow
 *
 * Transitions animate over 300ms using native driver (opacity).
 * Border and glow changes are applied immediately (non-animated).
 *
 * Does not alter child layout or behavior.
 */

import React, { useEffect, useRef } from 'react';
import { Animated, View, StyleSheet } from 'react-native';
import type { PanelState } from '../../lib/vcdPanelStateEngine';
import {
  VCD_OPACITY,
  VCD_BORDER_COLOR,
  VCD_ALERT_GLOW,
  VCD_ACTIVE_GLOW,
  VCD_TRANSITION_MS,
} from '../../lib/vcdPanelStateEngine';

// ── Props ────────────────────────────────────────────────────

interface VCDAdaptivePanelProps {
  /** Current panel state from useVCDPanelStates() */
  panelState: PanelState;
  /** Child content (the actual panel component) */
  children: React.ReactNode;
  /** Optional additional style */
  style?: any;
  /** Whether to show the state indicator pip (default: true for inline, false for overlay) */
  showIndicator?: boolean;
  /**
   * Overlay mode: fills parent with pointerEvents="box-none".
   * Use for wrapping panels that have their own absolute positioning.
   * Only applies opacity animation — no border/glow on the wrapper itself.
   */
  overlay?: boolean;
}

// ── State Indicator Colors ───────────────────────────────────

const INDICATOR_COLORS: Record<PanelState, string> = {
  PASSIVE: 'rgba(138,138,133,0.4)',
  ACTIVE:  'rgba(212,160,23,0.8)',
  ALERT:   'rgba(239,83,80,0.9)',
};

// ── Component ────────────────────────────────────────────────

export default function VCDAdaptivePanel({
  panelState,
  children,
  style,
  showIndicator,
  overlay = false,
}: VCDAdaptivePanelProps) {
  const opacityAnim = useRef(new Animated.Value(VCD_OPACITY[panelState])).current;
  const prevStateRef = useRef<PanelState>(panelState);

  // Resolve showIndicator default: true for inline, false for overlay
  const shouldShowIndicator = showIndicator !== undefined ? showIndicator : !overlay;

  // Animate opacity on state change
  useEffect(() => {
    if (prevStateRef.current !== panelState) {
      prevStateRef.current = panelState;

      Animated.timing(opacityAnim, {
        toValue: VCD_OPACITY[panelState],
        duration: VCD_TRANSITION_MS,
        useNativeDriver: true,
      }).start();
    }
  }, [panelState, opacityAnim]);

  // ── Overlay mode ──
  // Fills parent, passes through touches, only applies opacity.
  // Child panels retain their own absolute positioning and styling.
  if (overlay) {
    return (
      <Animated.View
        style={[
          styles.overlayContainer,
          { opacity: opacityAnim },
          style,
        ]}
        pointerEvents="box-none"
      >
        {children}
      </Animated.View>
    );
  }

  // ── Inline mode ──
  // Adds border, glow, and indicator pip around content.
  const glowStyle = panelState === 'ALERT'
    ? VCD_ALERT_GLOW
    : panelState === 'ACTIVE'
      ? VCD_ACTIVE_GLOW
      : null;

  const borderColor = VCD_BORDER_COLOR[panelState];

  return (
    <Animated.View
      style={[
        styles.inlineContainer,
        { opacity: opacityAnim, borderColor },
        glowStyle,
        style,
      ]}
    >
      {/* State indicator pip */}
      {shouldShowIndicator && (
        <View style={styles.indicatorRow}>
          <View
            style={[
              styles.indicatorDot,
              { backgroundColor: INDICATOR_COLORS[panelState] },
            ]}
          />
        </View>
      )}

      {/* Panel content */}
      {children}
    </Animated.View>
  );
}

// ── Styles ───────────────────────────────────────────────────

const styles = StyleSheet.create({
  inlineContainer: {
    borderWidth: 1,
    borderRadius: 12,
    overflow: 'hidden',
  },
  overlayContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  indicatorRow: {
    position: 'absolute',
    top: 6,
    right: 6,
    zIndex: 10,
  },
  indicatorDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
});



