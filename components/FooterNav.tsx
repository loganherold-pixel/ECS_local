/**
 * FooterNav — Reusable Fixed Footer Navigation
 *
 * SPEC:
 *   Height:          56px
 *   Padding:         16px horizontal
 *   SafeArea:        bottom spacing respected
 *   Border-top:      subtle ECS gold line (low-opacity)
 *
 * BUTTON RULES:
 *   Back:   Hidden/disabled when canGoBack === false
 *   Next:   Disabled when canGoNext === false
 *           Enabled state: ECS gold accent + subtle glow
 *           Disabled state: reduced opacity, no glow
 *
 * PRIMARY MODES:
 *   "next"     — Standard next step button (default)
 *   "deploy"   — Save Setup (green accent)
 *   "complete"  — Complete / Finish (green accent)
 *
 * USAGE:
 *   <FooterNav
 *     canGoBack={stepIndex > 0}
 *     canGoNext={isStepValid}
 *     onBack={goBack}
 *     onNext={goNext}
 *     primaryMode="next"
 *   />
 */
import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { SafeIcon as Ionicons } from './SafeIcon';
import { TACTICAL } from '../lib/theme';
import { hapticMicro } from '../lib/haptics';

// ── ECS Gold Constants ──────────────────────────────────────
const ECS_GOLD = '#C48A2C';
const DEPLOY_GREEN = '#66BB6A';

// ── Footer Height ───────────────────────────────────────────
export const FOOTER_NAV_HEIGHT = 56;

// ── Props ───────────────────────────────────────────────────
export interface FooterNavProps {
  /** Whether the back button is enabled */
  canGoBack: boolean;
  /** Whether the next/deploy/complete button is enabled */
  canGoNext: boolean;
  /** Label for the back button (default: "BACK") */
  backLabel?: string;
  /** Label for the next button (default: "NEXT") */
  nextLabel?: string;
  /** Called when back is pressed */
  onBack: () => void;
  /** Called when next is pressed */
  onNext: () => void;
  /** Controls styling/label for the primary button */
  primaryMode?: 'next' | 'deploy' | 'complete';
  /** Whether the primary action is loading */
  loading?: boolean;
  /** Icon name for the back button (default: "chevron-back") */
  backIcon?: string;
  /** Icon name for the next button (default: "chevron-forward") */
  nextIcon?: string;
}

export default function FooterNav({
  canGoBack,
  canGoNext,
  backLabel = 'BACK',
  nextLabel,
  onBack,
  onNext,
  primaryMode = 'next',
  loading = false,
  backIcon = 'chevron-back',
  nextIcon,
}: FooterNavProps) {
  // ── Resolve labels and icons based on primaryMode ─────────
  const resolvedNextLabel = nextLabel ?? (
    primaryMode === 'deploy' ? 'SAVE SETUP' :
    primaryMode === 'complete' ? 'COMPLETE' :
    'NEXT'
  );

  const resolvedNextIcon = nextIcon ?? (
    primaryMode === 'deploy' ? 'shield-checkmark-outline' :
    primaryMode === 'complete' ? 'checkmark-circle-outline' :
    'chevron-forward'
  );

  // ── Determine primary button color based on mode ──────────
  const isDeployOrComplete = primaryMode === 'deploy' || primaryMode === 'complete';
  const primaryColor = isDeployOrComplete ? DEPLOY_GREEN : TACTICAL.amber;
  const primaryTextColor = '#0B0F12';

  // ── Handlers with haptic feedback ─────────────────────────
  const handleBack = () => {
    if (canGoBack) {
      hapticMicro();
      onBack();
    }
  };

  const handleNext = () => {
    if (canGoNext && !loading) {
      hapticMicro();
      onNext();
    }
  };

  return (
    <View style={styles.container}>
      {/* ── Back Button ────────────────────────────────────── */}
      <TouchableOpacity
        style={[
          styles.backBtn,
          !canGoBack && styles.backBtnHidden,
        ]}
        onPress={handleBack}
        disabled={!canGoBack}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={backLabel}
        accessibilityState={{ disabled: !canGoBack }}
      >
        <Ionicons
          name={backIcon as any}
          size={18}
          color={canGoBack ? TACTICAL.textMuted : 'rgba(138,138,133,0.15)'}
        />
        <Text style={[
          styles.backText,
          !canGoBack && styles.textHidden,
        ]}>
          {backLabel}
        </Text>
      </TouchableOpacity>

      {/* ── Next / Deploy / Complete Button ────────────────── */}
      <TouchableOpacity
        style={[
          styles.nextBtn,
          { backgroundColor: primaryColor },
          !canGoNext && styles.nextBtnDisabled,
          canGoNext && !loading && [
            styles.nextBtnEnabled,
            { shadowColor: primaryColor },
          ],
        ]}
        onPress={handleNext}
        disabled={!canGoNext || loading}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel={resolvedNextLabel}
        accessibilityState={{ disabled: !canGoNext || loading }}
      >
        {loading ? (
          <ActivityIndicator size="small" color={primaryTextColor} />
        ) : (
          <>
            <Text style={[
              styles.nextText,
              !canGoNext && styles.nextTextDisabled,
            ]}>
              {resolvedNextLabel}
            </Text>
            <Ionicons
              name={resolvedNextIcon as any}
              size={18}
              color={canGoNext ? primaryTextColor : 'rgba(11, 15, 18, 0.4)'}
            />
          </>
        )}
      </TouchableOpacity>
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════════
const styles = StyleSheet.create({
  container: {
    height: FOOTER_NAV_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(196, 138, 44, 0.15)',
    backgroundColor: TACTICAL.bg,
    // SafeArea bottom padding
    paddingBottom: Platform.OS === 'ios' ? 0 : 0,
  },

  // ── Back Button ───────────────────────────────────────────
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingHorizontal: 16,
    height: 40,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(62, 79, 60, 0.4)',
    backgroundColor: 'rgba(62, 79, 60, 0.1)',
  },
  backBtnHidden: {
    borderColor: 'rgba(62, 79, 60, 0.12)',
    backgroundColor: 'rgba(62, 79, 60, 0.03)',
  },
  backText: {
    fontSize: 11,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    letterSpacing: 1,
  },
  textHidden: {
    color: 'rgba(138,138,133,0.15)',
  },

  // ── Next / Deploy / Complete Button ───────────────────────
  nextBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 40,
    borderRadius: 10,
  },
  nextBtnDisabled: {
    opacity: 0.35,
  },
  nextBtnEnabled: {
    opacity: 1,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 3,
  },
  nextText: {
    fontSize: 12,
    fontWeight: '900',
    color: '#0B0F12',
    letterSpacing: 1.2,
  },
  nextTextDisabled: {
    color: 'rgba(11, 15, 18, 0.4)',
  },
});



