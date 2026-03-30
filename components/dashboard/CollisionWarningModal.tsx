/**
 * CollisionWarningModal — Resize collision resolution UI
 *
 * Shown when a widget resize would overlap with adjacent widgets.
 * Offers two resolution options:
 * 1. Auto-shrink the conflicting widget(s) to 1×1 and proceed with resize
 * 2. Cancel the resize operation
 *
 * Features:
 * - Animated slide-up entrance with backdrop fade
 * - Visual diagram showing which widgets conflict
 * - Clear action buttons with tactical styling
 * - Handles multiple conflicting widgets
 * - Out-of-bounds warning when widget can't fit at current position
 */
import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Pressable,
  StyleSheet,
  Animated,
  Easing,
  Modal,
  Dimensions,
  Platform,
  ScrollView,
} from 'react-native';

import { SafeIcon as Ionicons } from '../SafeIcon';
import { TACTICAL, TYPO, DENSITY } from '../../lib/theme';
import {
  WIDGET_SIZE_CONFIG,
  type WidgetSize,
  type ResizeCollisionInfo,
} from '../../lib/dashboardStore';

const SCREEN_W = Dimensions.get('window').width;

interface CollisionWarningModalProps {
  visible: boolean;
  collision: ResizeCollisionInfo | null;
  /** The widget being resized */
  targetWidgetName: string;
  /** The size the user is trying to resize to */
  targetNewSize: WidgetSize;
  /** Called when user chooses to shrink conflicting widgets and proceed */
  onShrinkAndResize: () => void;
  /** Called when user cancels the resize */
  onCancel: () => void;
}

export default function CollisionWarningModal({
  visible,
  collision,
  targetWidgetName,
  targetNewSize,
  onShrinkAndResize,
  onCancel,
}: CollisionWarningModalProps) {
  const slideAnim = useRef(new Animated.Value(300)).current;
  const backdropAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      slideAnim.setValue(300);
      backdropAnim.setValue(0);
      Animated.parallel([
        Animated.timing(backdropAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 280,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible]);

  const handleDismiss = () => {
    Animated.parallel([
      Animated.timing(backdropAnim, {
        toValue: 0,
        duration: 180,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 300,
        duration: 200,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start(() => {
      onCancel();
    });
  };

  const handleShrinkAndResize = () => {
    Animated.parallel([
      Animated.timing(backdropAnim, {
        toValue: 0,
        duration: 150,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 300,
        duration: 180,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start(() => {
      onShrinkAndResize();
    });
  };

  if (!visible || !collision) return null;

  const newSizeLabel = WIDGET_SIZE_CONFIG[targetNewSize]?.label || targetNewSize;
  const hasConflicts = collision.conflictingSlots.length > 0;
  const conflictNames = collision.conflictingSlots.map(c => c.widgetName);
  const isOnlyOutOfBounds = collision.outOfBounds && !hasConflicts;

  return (
    <Modal transparent visible={visible} animationType="none" onRequestClose={handleDismiss}>
      {/* Backdrop */}
      <Animated.View style={[styles.backdrop, { opacity: backdropAnim }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={handleDismiss} />
      </Animated.View>

      {/* Modal Content */}
      <Animated.View
        style={[
          styles.container,
          { transform: [{ translateY: slideAnim }] },
        ]}
      >
        <View style={styles.card}>
          {/* Handle bar */}
          <View style={styles.handleBar} />

          {/* Warning Header */}
          <View style={styles.header}>
            <View style={styles.warningIconContainer}>
              <Ionicons name="warning-outline" size={20} color={TACTICAL.amber} />
            </View>
            <View style={styles.headerText}>
              <Text style={styles.title}>RESIZE COLLISION</Text>
              <Text style={styles.subtitle}>
                {isOnlyOutOfBounds
                  ? 'Widget cannot fit at its current position'
                  : 'Resizing would overlap with another widget'}
              </Text>
            </View>
          </View>

          {/* Collision Details */}
          <View style={styles.detailsSection}>
            {/* Target widget info */}
            <View style={styles.detailRow}>
              <View style={styles.detailIcon}>
                <Ionicons name="resize-outline" size={14} color={TACTICAL.amber} />
              </View>
              <View style={styles.detailContent}>
                <Text style={styles.detailLabel}>RESIZING</Text>
                <Text style={styles.detailValue}>
                  {targetWidgetName} <Text style={styles.detailMuted}>to</Text>{' '}
                  <Text style={styles.sizeHighlight}>{newSizeLabel}</Text>
                </Text>
              </View>
            </View>

            {/* Out of bounds warning */}
            {collision.outOfBounds && (
              <View style={styles.detailRow}>
                <View style={[styles.detailIcon, styles.detailIconDanger]}>
                  <Ionicons name="alert-circle-outline" size={14} color={TACTICAL.danger} />
                </View>
                <View style={styles.detailContent}>
                  <Text style={styles.detailLabel}>OUT OF BOUNDS</Text>
                  <Text style={styles.detailValue}>
                    New size exceeds grid boundaries at current position
                  </Text>
                </View>
              </View>
            )}

            {/* Conflicting widgets */}
            {hasConflicts && (
              <View style={styles.conflictSection}>
                <View style={styles.conflictHeader}>
                  <Ionicons name="git-merge-outline" size={12} color={TACTICAL.danger} />
                  <Text style={styles.conflictHeaderText}>
                    WOULD DISPLACE {collision.conflictingSlots.length === 1 ? '1 WIDGET' : `${collision.conflictingSlots.length} WIDGETS`}
                  </Text>
                </View>
                {collision.conflictingSlots.map((conflict, idx) => (
                  <View key={conflict.slotIndex} style={styles.conflictItem}>
                    <View style={styles.conflictDot} />
                    <Text style={styles.conflictName}>{conflict.widgetName}</Text>
                    <Text style={styles.conflictArrow}>
                      <Ionicons name="arrow-forward-outline" size={10} color={TACTICAL.textMuted} />
                    </Text>
                    <Text style={styles.conflictResult}>shrink to 1{'\u00D7'}1</Text>
                  </View>
                ))}
              </View>
            )}
          </View>

          {/* Action Buttons */}
          <View style={styles.actions}>
            {/* Shrink & Resize button (only if there are conflicts, not just out of bounds) */}
            {hasConflicts && !collision.outOfBounds && (
              <TouchableOpacity
                style={styles.shrinkBtn}
                onPress={handleShrinkAndResize}
                activeOpacity={0.7}
              >
                <Ionicons name="contract-outline" size={16} color={TACTICAL.bg} />
                <Text style={styles.shrinkBtnText}>
                  SHRINK {conflictNames.length === 1 ? `"${conflictNames[0]}"` : `${conflictNames.length} WIDGETS`} & RESIZE
                </Text>
              </TouchableOpacity>
            )}

            {/* Shrink & Resize for out-of-bounds + conflicts */}
            {hasConflicts && collision.outOfBounds && (
              <View style={styles.outOfBoundsNote}>
                <Ionicons name="information-circle-outline" size={14} color={TACTICAL.textMuted} />
                <Text style={styles.outOfBoundsNoteText}>
                  The widget will be repositioned to fit the grid after shrinking conflicting widgets.
                </Text>
              </View>
            )}
            {hasConflicts && collision.outOfBounds && (
              <TouchableOpacity
                style={styles.shrinkBtn}
                onPress={handleShrinkAndResize}
                activeOpacity={0.7}
              >
                <Ionicons name="contract-outline" size={16} color={TACTICAL.bg} />
                <Text style={styles.shrinkBtnText}>
                  SHRINK & REFLOW LAYOUT
                </Text>
              </TouchableOpacity>
            )}

            {/* Cancel button */}
            <TouchableOpacity
              style={styles.cancelBtn}
              onPress={handleDismiss}
              activeOpacity={0.7}
            >
              <Text style={styles.cancelBtnText}>CANCEL RESIZE</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  container: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingBottom: Platform.select({ ios: 34, android: 48, default: 20 }) ?? 20,
    maxHeight: Dimensions.get('window').height * 0.85,
  },

  card: {
    marginHorizontal: 12,
    backgroundColor: TACTICAL.panel,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: TACTICAL.amber + '30',       // Phase 8: muted solid edge
    // Phase 8: Dark shadow only — no amber glow
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 20,
    overflow: 'hidden',
  },

  handleBar: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: TACTICAL.textMuted + '40',
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 4,
  },

  // ── Header ──────────────────────────────────────────
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.04)',
  },
  warningIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: TACTICAL.amber + '12',
    borderWidth: 1,
    borderColor: TACTICAL.amber + '25',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: {
    flex: 1,
  },
  title: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 3,
    color: TACTICAL.amber,
  },
  subtitle: {
    fontSize: 11,
    fontWeight: '500',
    color: TACTICAL.textMuted,
    marginTop: 2,
  },

  // ── Details Section ─────────────────────────────────
  detailsSection: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 10,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  detailIcon: {
    width: 28,
    height: 28,
    borderRadius: 7,
    backgroundColor: TACTICAL.amber + '10',
    borderWidth: 1,
    borderColor: TACTICAL.amber + '20',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  detailIconDanger: {
    backgroundColor: TACTICAL.danger + '10',
    borderColor: TACTICAL.danger + '20',
  },
  detailContent: {
    flex: 1,
  },
  detailLabel: {
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 2,
    color: TACTICAL.textMuted,
    marginBottom: 2,
  },
  detailValue: {
    fontSize: 12,
    fontWeight: '600',
    color: TACTICAL.text,
    lineHeight: 17,
  },
  detailMuted: {
    color: TACTICAL.textMuted,
    fontWeight: '400',
  },
  sizeHighlight: {
    color: TACTICAL.amber,
    fontWeight: '800',
    letterSpacing: 1,
  },

  // ── Conflict Section ────────────────────────────────
  conflictSection: {
    backgroundColor: TACTICAL.danger + '08',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: TACTICAL.danger + '15',
    padding: 10,
    marginTop: 2,
  },
  conflictHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  conflictHeaderText: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 2,
    color: TACTICAL.danger,
  },
  conflictItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
    paddingLeft: 4,
  },
  conflictDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: TACTICAL.danger + '80',
  },
  conflictName: {
    fontSize: 11,
    fontWeight: '700',
    color: TACTICAL.text,
    flex: 1,
  },
  conflictArrow: {
    marginHorizontal: 2,
  },
  conflictResult: {
    fontSize: 10,
    fontWeight: '600',
    color: TACTICAL.textMuted,
    fontStyle: 'italic',
  },

  // ── Out of Bounds Note ──────────────────────────────
  outOfBoundsNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 8,
    padding: 10,
    marginBottom: 4,
  },
  outOfBoundsNoteText: {
    fontSize: 10,
    fontWeight: '500',
    color: TACTICAL.textMuted,
    flex: 1,
    lineHeight: 15,
  },

  // ── Actions ─────────────────────────────────────────
  actions: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    paddingTop: 4,
    gap: 8,
  },
  shrinkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 13,
    borderRadius: 10,
    backgroundColor: TACTICAL.amber,
  },
  shrinkBtnText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.5,
    color: TACTICAL.bg,
  },
  cancelBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 11,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  cancelBtnText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 2,
    color: TACTICAL.textMuted,
  },
});



