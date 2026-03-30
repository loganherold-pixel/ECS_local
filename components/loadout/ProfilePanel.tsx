import React, { useRef, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated } from 'react-native';
import { SafeIcon as Ionicons } from '../SafeIcon';

import { TACTICAL } from '../../lib/theme';
import type { OperatingProfile } from '../../lib/types';
import {
  OPERATING_PROFILE_LABELS,
  OPERATING_PROFILE_DESCRIPTIONS,
  OPERATING_PROFILE_COLORS,
} from '../../lib/types';

interface Props {
  profile: OperatingProfile | null;
  peopleCount?: number | null;
  tripLengthDays?: number | null;
  mode?: string;
  // Ready state props
  isReady?: boolean;
  onSetReady?: () => void;
  canSetReady?: boolean;
  readyValidationMessage?: string | null;
}

const PROFILE_ICONS: Record<OperatingProfile, string> = {
  weekend: 'car-sport-outline',
  solo: 'person-outline',
  family: 'people-outline',
  sar: 'shield-checkmark-outline',
};

export default function ProfilePanel({
  profile,
  peopleCount,
  tripLengthDays,
  mode,
  isReady = false,
  onSetReady,
  canSetReady = true,
  readyValidationMessage,
}: Props) {
  const shakeAnim = useRef(new Animated.Value(0)).current;

  // Shake animation for invalid state
  const triggerShake = () => {
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 8, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -8, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 4, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 50, useNativeDriver: true }),
    ]).start();
  };

  if (!profile) {
    // Still show SET TO READY even without profile
    if (onSetReady) {
      return (
        <Animated.View style={[
          styles.container,
          { borderLeftColor: TACTICAL.border, transform: [{ translateX: shakeAnim }] },
          isReady && styles.containerReady,
        ]}>
          <View style={styles.noProfileRow}>
            <Ionicons name="cube-outline" size={18} color={TACTICAL.textMuted} />
            <Text style={styles.noProfileText}>No operating profile set</Text>
          </View>
          {/* Ready state section */}
          <ReadySection
            isReady={isReady}
            canSetReady={canSetReady}
            onSetReady={onSetReady}
            readyValidationMessage={readyValidationMessage}
            triggerShake={triggerShake}
          />
        </Animated.View>
      );
    }
    return null;
  }

  const color = OPERATING_PROFILE_COLORS[profile];
  const label = OPERATING_PROFILE_LABELS[profile];
  const desc = OPERATING_PROFILE_DESCRIPTIONS[profile];
  const icon = PROFILE_ICONS[profile];

  const showFamilyTip = profile === 'family';
  const showCriticalEmphasis = profile === 'solo' || profile === 'sar';

  return (
    <Animated.View style={[
      styles.container,
      { borderLeftColor: isReady ? '#4CAF50' : color, transform: [{ translateX: shakeAnim }] },
      isReady && styles.containerReady,
    ]}>
      <View style={styles.headerRow}>
        <View style={[styles.iconCircle, { backgroundColor: `${color}20` }]}>
          <Ionicons name={icon as any} size={18} color={color} />
        </View>
        <View style={styles.headerText}>
          <View style={styles.profileLabelRow}>
            <Text style={styles.profileLabel}>OPERATING PROFILE</Text>
            {isReady && (
              <View style={styles.readyBadge}>
                <Ionicons name="checkmark-circle" size={10} color="#4CAF50" />
                <Text style={styles.readyBadgeText}>READY</Text>
              </View>
            )}
          </View>
          <Text style={[styles.profileName, { color }]}>{label}</Text>
        </View>
      </View>

      <Text style={styles.description}>{desc}</Text>

      {/* Meta badges */}
      <View style={styles.metaRow}>
        {peopleCount != null && peopleCount > 0 && (
          <View style={styles.metaBadge}>
            <Ionicons name="people-outline" size={12} color={TACTICAL.textMuted} />
            <Text style={styles.metaText}>{peopleCount} {peopleCount === 1 ? 'PERSON' : 'PEOPLE'}</Text>
          </View>
        )}
        {mode === 'trip' && tripLengthDays != null && tripLengthDays > 0 && (
          <View style={styles.metaBadge}>
            <Ionicons name="calendar-outline" size={12} color={TACTICAL.textMuted} />
            <Text style={styles.metaText}>{tripLengthDays} DAYS</Text>
          </View>
        )}
      </View>

      {/* Profile-specific hints */}
      {showCriticalEmphasis && (
        <View style={[styles.hintRow, { borderColor: `${TACTICAL.danger}30`, backgroundColor: `${TACTICAL.danger}08` }]}>
          <Ionicons name="alert-circle-outline" size={13} color={TACTICAL.danger} />
          <Text style={[styles.hintText, { color: TACTICAL.danger }]}>
            Critical items sorted to top. Critical readiness tracked separately.
          </Text>
        </View>
      )}

      {showFamilyTip && (
        <View style={[styles.hintRow, { borderColor: `${TACTICAL.amber}30`, backgroundColor: `${TACTICAL.amber}08` }]}>
          <Ionicons name="information-circle-outline" size={13} color={TACTICAL.amber} />
          <Text style={[styles.hintText, { color: TACTICAL.amber }]}>
            Tip: Increase quantities based on people count and trip length.
          </Text>
        </View>
      )}

      {/* SET TO READY section */}
      {onSetReady && (
        <ReadySection
          isReady={isReady}
          canSetReady={canSetReady}
          onSetReady={onSetReady}
          readyValidationMessage={readyValidationMessage}
          triggerShake={triggerShake}
        />
      )}
    </Animated.View>
  );
}

// ── Ready Section Sub-Component ──────────────────────────────
function ReadySection({
  isReady,
  canSetReady,
  onSetReady,
  readyValidationMessage,
  triggerShake,
}: {
  isReady: boolean;
  canSetReady: boolean;
  onSetReady: () => void;
  readyValidationMessage?: string | null;
  triggerShake: () => void;
}) {
  const handlePress = () => {
    if (isReady) return; // Already ready, button is disabled
    if (!canSetReady) {
      triggerShake();
      return;
    }
    onSetReady();
  };

  return (
    <View style={styles.readySection}>
      {/* Validation message */}
      {!isReady && !canSetReady && readyValidationMessage && (
        <View style={styles.validationRow}>
          <Ionicons name="alert-circle-outline" size={12} color={TACTICAL.danger} />
          <Text style={styles.validationText}>{readyValidationMessage}</Text>
        </View>
      )}

      <View style={styles.readyButtonRow}>
        <View style={{ flex: 1 }} />
        <TouchableOpacity
          style={[
            styles.readyButton,
            isReady && styles.readyButtonActive,
            !isReady && !canSetReady && styles.readyButtonDisabled,
          ]}
          onPress={handlePress}
          activeOpacity={isReady ? 1 : 0.75}
          disabled={isReady}
        >
          <Ionicons
            name={isReady ? 'checkmark-circle' : 'shield-checkmark-outline'}
            size={16}
            color={isReady ? '#4CAF50' : (!canSetReady ? TACTICAL.textMuted : '#fff')}
          />
          <Text style={[
            styles.readyButtonText,
            isReady && styles.readyButtonTextActive,
            !isReady && !canSetReady && styles.readyButtonTextDisabled,
          ]}>
            {isReady ? 'READY' : 'SET TO READY'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: TACTICAL.panel,
    borderRadius: TACTICAL.radius,
    borderWidth: 1,
    borderColor: TACTICAL.border,
    borderLeftWidth: 4,
    padding: 14,
    marginBottom: 14,
  },
  containerReady: {
    borderColor: 'rgba(76, 175, 80, 0.35)',
    borderLeftColor: '#4CAF50',
    borderLeftWidth: 4,
  },
  noProfileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  noProfileText: {
    fontSize: 12,
    color: TACTICAL.textMuted,
    fontWeight: '600',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 8,
  },
  iconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: {
    flex: 1,
  },
  profileLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  profileLabel: {
    fontSize: 8,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    letterSpacing: 1.5,
    marginBottom: 2,
  },
  readyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(76, 175, 80, 0.12)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(76, 175, 80, 0.35)',
    marginBottom: 2,
  },
  readyBadgeText: {
    fontSize: 7,
    fontWeight: '900',
    color: '#4CAF50',
    letterSpacing: 1.5,
  },
  profileName: {
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  description: {
    fontSize: 12,
    color: TACTICAL.textMuted,
    lineHeight: 18,
    marginBottom: 10,
  },
  metaRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  metaBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: TACTICAL.bg,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: TACTICAL.border,
  },
  metaText: {
    fontSize: 9,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    letterSpacing: 0.8,
  },
  hintRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 4,
  },
  hintText: {
    fontSize: 11,
    fontWeight: '600',
    flex: 1,
    lineHeight: 16,
  },

  // ── Ready Section ─────────────────────────────────────────
  readySection: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(138,138,133,0.15)',
  },
  validationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  validationText: {
    fontSize: 10,
    fontWeight: '700',
    color: TACTICAL.danger,
    letterSpacing: 0.5,
    flex: 1,
  },
  readyButtonRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  readyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#4CAF50',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    shadowColor: '#4CAF50',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3,
  },
  readyButtonActive: {
    backgroundColor: 'rgba(76, 175, 80, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(76, 175, 80, 0.4)',
    shadowOpacity: 0,
    elevation: 0,
  },
  readyButtonDisabled: {
    backgroundColor: 'rgba(138,138,133,0.15)',
    shadowOpacity: 0,
    elevation: 0,
  },
  readyButtonText: {
    fontSize: 11,
    fontWeight: '900',
    color: '#fff',
    letterSpacing: 1.5,
  },
  readyButtonTextActive: {
    color: '#4CAF50',
  },
  readyButtonTextDisabled: {
    color: TACTICAL.textMuted,
  },
});



