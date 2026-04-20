// ============================================================
// EXPEDITION SUMMARY SHEET
// ============================================================
// Shown when expedition.state → complete.
// Displays: duration, distance, vehicle name, fuel delta,
//           water delta, peak remoteness.
// Buttons: View Details, Dismiss
// 200–250ms fade in. No haptic on close.
//
// V2 FIXES:
//   - maxHeight constrained to 80% of viewport height
//   - Stats section wrapped in ScrollView for small screens
//   - Safe area bottom inset applied
//   - Dismiss button always visible (outside scroll area)
//
// V3 MODAL STATE GUARDS:
//   - isDismissing ref prevents double-dismiss
//   - onDismiss fires exactly once per open→close cycle
//   - Animation callbacks check cycle validity
//   - Dismiss guard resets on re-open
// ============================================================

import React, { useEffect, useRef, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Animated, Platform, Modal,
  useWindowDimensions, ScrollView,
} from 'react-native';
import { SafeIcon as Ionicons } from '../SafeIcon';
import { TACTICAL, GOLD_RAIL } from '../../lib/theme';
import {
  type ExpeditionRecord,
  formatDuration,
  formatDistance,
} from '../../lib/expeditionStateStore';

// ── Safe area bottom inset estimate ─────────────────────────
const SAFE_BOTTOM = Platform.OS === 'ios' ? 34 : Platform.OS === 'android' ? 24 : 0;

interface Props {
  visible: boolean;
  record: ExpeditionRecord | null;
  onDismiss: () => void;
  onViewDetails?: () => void;
}

export default function ExpeditionSummarySheet({ visible, record, onDismiss, onViewDetails }: Props) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(60)).current;
  const { height: windowHeight } = useWindowDimensions();

  // ── Modal State Guards ──────────────────────────────────
  // Prevents double-dismiss and ensures onDismiss fires exactly once.
  const isDismissingRef = useRef(false);
  const dismissCycleRef = useRef(0);

  // Max height for the sheet: 80% of viewport, leaves room for status bar
  const sheetMaxHeight = Math.min(windowHeight * 0.80, 520);

  useEffect(() => {
    if (visible) {
      // Reset dismiss guard on re-open
      isDismissingRef.current = false;
      dismissCycleRef.current++;

      fadeAnim.setValue(0);
      slideAnim.setValue(60);
      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 1, duration: 220, useNativeDriver: true }),
        Animated.timing(slideAnim, { toValue: 0, duration: 220, useNativeDriver: true }),
      ]).start();
    }
  }, [visible, fadeAnim, slideAnim]);

  const handleDismiss = useCallback(() => {
    // Guard: prevent double-dismiss (e.g., backdrop tap + button tap simultaneously)
    if (isDismissingRef.current) return;
    isDismissingRef.current = true;

    const cycle = dismissCycleRef.current;

    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 60, duration: 200, useNativeDriver: true }),
    ]).start(() => {
      // Only fire onDismiss if this cycle is still current
      // (prevents stale callbacks from firing after re-open)
      if (cycle === dismissCycleRef.current) {
        onDismiss();
      }
    });
  }, [onDismiss, fadeAnim, slideAnim]);

  if (!visible || !record) return null;

  const duration = record.duration ? formatDuration(record.duration) : '--';
  const distance = record.distance ? formatDistance(record.distance) : '--';

  return (
    <Modal transparent visible={visible} animationType="none" statusBarTranslucent>
      <Animated.View style={[styles.overlay, { opacity: fadeAnim }]}>
        <TouchableOpacity style={styles.overlayTap} activeOpacity={1} onPress={handleDismiss} />
        <Animated.View style={[
          styles.sheet,
          {
            transform: [{ translateY: slideAnim }],
            maxHeight: sheetMaxHeight,
            paddingBottom: SAFE_BOTTOM,
          },
        ]}>
          {/* Header — fixed at top */}
          <View style={styles.header}>
            <View style={styles.headerIconWrap}>
              <Ionicons name="flag-outline" size={20} color={TACTICAL.amber} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.headerLabel}>EXPEDITION COMPLETE</Text>
              <Text style={styles.headerVehicle} numberOfLines={1}>{record.vehicleName}</Text>
            </View>
            <TouchableOpacity onPress={handleDismiss} style={styles.closeBtn}>
              <Ionicons name="close" size={18} color={TACTICAL.textMuted} />
            </TouchableOpacity>
          </View>

          <View style={styles.divider} />

          {/* Scrollable Stats Section — scrolls if content exceeds available height */}
          <ScrollView
            style={styles.scrollArea}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            bounces={false}
          >
            {/* Stats Grid */}
            <View style={styles.statsGrid}>
              <StatItem icon="time-outline" label="DURATION" value={duration} />
              <StatItem icon="navigate-outline" label="DISTANCE" value={distance} />
              <StatItem
                icon="flame-outline"
                label="FUEL DELTA"
                value={record.fuelDelta != null ? `${record.fuelDelta.toFixed(1)} gal` : '--'}
              />
              <StatItem
                icon="water-outline"
                label="WATER DELTA"
                value={record.waterDelta != null ? `${record.waterDelta.toFixed(1)} gal` : '--'}
              />
              <StatItem
                icon="compass-outline"
                label="PEAK REMOTENESS"
                value={record.peakRemoteness != null ? `${record.peakRemoteness.toFixed(0)}` : '--'}
              />
            </View>
          </ScrollView>

          <View style={styles.divider} />

          {/* Actions — fixed at bottom, always visible */}
          <View style={styles.actions}>
            {onViewDetails && (
              <TouchableOpacity style={styles.detailsBtn} onPress={onViewDetails} activeOpacity={0.8}>
                <Ionicons name="document-text-outline" size={14} color={TACTICAL.amber} />
                <Text style={styles.detailsBtnText}>VIEW DETAILS</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.dismissBtn} onPress={handleDismiss} activeOpacity={0.8}>
              <Text style={styles.dismissBtnText}>DISMISS</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

function StatItem({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <View style={styles.statItem}>
      <View style={styles.statIconWrap}>
        <Ionicons name={icon as any} size={14} color={TACTICAL.textMuted} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.statLabel}>{label}</Text>
        <Text style={styles.statValue}>{value}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  overlayTap: {
    flex: 1,
  },
  sheet: {
    backgroundColor: TACTICAL.panel,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderTopWidth: 1.5,
    borderTopColor: 'rgba(212,160,23,0.3)',
    // maxHeight and paddingBottom are set dynamically via inline styles
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    paddingBottom: 12,
  },
  headerIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(212,160,23,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(212,160,23,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: TACTICAL.amber,
    letterSpacing: 2,
  },
  headerVehicle: {
    fontSize: 14,
    fontWeight: '800',
    color: TACTICAL.text,
    letterSpacing: 0.5,
    marginTop: 2,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(62,79,60,0.15)',
  },
  divider: {
    height: GOLD_RAIL.subsectionWidth,
    backgroundColor: GOLD_RAIL.subsection,
    marginHorizontal: 16,
  },

  // ── Scrollable stats area ─────────────────────────────
  scrollArea: {
    flexShrink: 1,
  },
  scrollContent: {
    flexGrow: 0,
  },

  statsGrid: {
    padding: 16,
    gap: 10,
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  statIconWrap: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: 'rgba(62,79,60,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  statLabel: {
    fontSize: 8,
    fontWeight: '700',
    color: TACTICAL.textMuted,
    letterSpacing: 1.5,
  },
  statValue: {
    fontSize: 14,
    fontWeight: '800',
    color: TACTICAL.text,
    letterSpacing: 0.5,
    marginTop: 1,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    padding: 16,
    paddingTop: 12,
  },
  detailsBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: 'rgba(212,160,23,0.4)',
    backgroundColor: 'rgba(212,160,23,0.06)',
  },
  detailsBtnText: {
    fontSize: 10,
    fontWeight: '900',
    color: TACTICAL.amber,
    letterSpacing: 1,
  },
  dismissBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: 'rgba(62,79,60,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(62,79,60,0.3)',
  },
  dismissBtnText: {
    fontSize: 10,
    fontWeight: '900',
    color: TACTICAL.textMuted,
    letterSpacing: 1,
  },
});



