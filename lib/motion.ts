/**
 * ECS Global Motion System
 * 
 * Unified motion behavior across entire application.
 * Cubic ease-out only. No spring physics.
 * Feels: Precise, Mechanical, Deliberate, Instrument-grade.
 *
 * Phase 9 Additions:
 *   - Tab transition timing refined (150–200ms)
 *   - Widget expand/collapse timing (180ms / 150ms)
 *   - Quick Actions panel timing (200ms in / 150ms out)
 *   - Edit mode highlight timing (200ms in / 120ms out)
 *   - Button press response timing (60ms in / 100ms out)
 */
import { Easing } from 'react-native';

// ── Motion Timing Constants ──────────────────────────────────
export const MOTION = {
  /** Tap press down duration */
  tapPress: 60,                    // Phase 9: reduced from 90ms for snappier feel
  /** Primary state transition (color, opacity) */
  stateTransition: 140,
  /** Glow fade in/out */
  glowFade: 180,
  /** Screen transition total duration */
  screenTransition: 200,           // Phase 9: reduced from 220ms
  /** Modal slide in/out */
  modalSlide: 200,
  /** Modal dismiss */
  modalDismiss: 150,               // Phase 9: reduced from 180ms for snappier dismiss
  /** Long press detection threshold */
  longPress: 400,
  /** Navigation underline slide */
  navUnderlineSlide: 120,
  /** Press release return */
  pressRelease: 100,               // Phase 9: reduced from 120ms
  /** Screen fade out */
  screenFadeOut: 100,              // Phase 9: reduced from 120ms
  /** Screen fade in */
  screenFadeIn: 150,               // Phase 9: reduced from 160ms
  /** Screen vertical shift (px) */
  screenShiftPx: 4,                // Phase 9: reduced from 6px for subtler shift
  /** Modal slide offset (px) */
  modalOffsetPx: 24,               // Phase 9: reduced from 30px
  /** Background dim opacity */
  modalDimOpacity: 0.4,

  // ── Phase 9: New Motion Constants ──────────────────────────
  /** Tab content fade out */
  tabFadeOut: 100,
  /** Tab content fade in */
  tabFadeIn: 150,
  /** Widget expand animation */
  widgetExpand: 180,
  /** Widget collapse animation */
  widgetCollapse: 150,
  /** Quick Actions slide up */
  quickActionsIn: 200,
  /** Quick Actions slide down */
  quickActionsOut: 150,
  /** Edit mode highlight fade in */
  editHighlightIn: 200,
  /** Edit mode highlight fade out */
  editHighlightOut: 120,
  /** Button press in (scale down) */
  buttonPressIn: 60,
  /** Button press out (scale up) */
  buttonPressOut: 100,
} as const;

// ── Easing ───────────────────────────────────────────────────
// Cubic ease-out only. No spring physics.
export const EASING = {
  /** Standard cubic ease-out for all transitions */
  standard: Easing.out(Easing.cubic),
  /** Same easing for consistency */
  press: Easing.out(Easing.cubic),
  /** Phase 9: Decelerate — for elements entering the screen */
  decelerate: Easing.out(Easing.quad),
  /** Phase 9: Accelerate — for elements leaving the screen */
  accelerate: Easing.in(Easing.quad),
  /** Phase 9: Sharp — for quick snaps and highlights */
  sharp: Easing.out(Easing.exp),
} as const;

// ── Press Scale Values ───────────────────────────────────────
export const PRESS = {
  /** Scale on tap-down (96-97%) */
  scaleDown: 0.97,
  /** Scale on release */
  scaleUp: 1.0,
  /** Shield/center button scale */
  shieldScaleDown: 0.96,
} as const;

// ── Nav Transition Config ────────────────────────────────────
export const NAV_TRANSITION = {
  /** Icon/label color transition from gray → gold */
  activateDuration: 140,
  /** Previous item fade to gray */
  deactivateDuration: 140,
  /** Underline slide to new position */
  underlineSlideDuration: 120,
} as const;


