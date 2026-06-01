/**
 * Sync Skip Alert Banner
 *
 * Displays a persistent, dismissable banner when sync actions are auto-skipped
 * or purged because they contained an invalid user ID ('local' sentinel).
 *
 * Styled to match ResourceAlertBanner — compact amber/warning banner with:
 *   - Count of affected actions
 *   - Human-readable explanation
 *   - "Learn More" link → inline expandable detail
 *   - Dismiss (session) and "Don't show again" (permanent) options
 *
 * Subscribes to syncSkipAlertStore for reactive state updates.
 */
import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  ScrollView,
  Modal,
} from 'react-native';
import { SafeIcon as Ionicons } from './SafeIcon';
import { TACTICAL, ECS } from '../lib/theme';
import {
  syncSkipAlertStore,
  type SyncSkipAlertState,
} from '../lib/syncSkipAlertStore';
import { ACTION_CATEGORY_MAP, type SyncActionType } from '../lib/syncActionQueue';

// ── Colors ────────────────────────────────────────────────────
const BANNER_COLORS = {
  bg: 'rgba(212, 160, 23, 0.06)',
  border: 'rgba(212, 160, 23, 0.28)',
  icon: '#D4A017',
  text: '#D4A017',
  textBody: '#C0A050',
  muted: TACTICAL.textMuted,
  linkText: '#5AC8FA',
};

// ── Learn More Modal ──────────────────────────────────────────

function LearnMoreModal({
  visible,
  onClose,
  skippedCount,
  skippedTypes,
}: {
  visible: boolean;
  onClose: () => void;
  skippedCount: number;
  skippedTypes: string[];
}) {
  // Map action types to category labels for display
  const categories = skippedTypes.reduce<Record<string, number>>((acc, t) => {
    const cat = ACTION_CATEGORY_MAP[t as SyncActionType] || 'General';
    acc[cat] = (acc[cat] || 0) + 1;
    return acc;
  }, {});

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={modalStyles.overlay}>
        <View style={modalStyles.container}>
          {/* Header */}
          <View style={modalStyles.header}>
            <View style={modalStyles.headerIcon}>
              <Ionicons name="cloud-offline-outline" size={20} color={BANNER_COLORS.icon} />
            </View>
            <Text style={modalStyles.headerTitle}>OFFLINE CHANGES</Text>
            <TouchableOpacity
              onPress={onClose}
              style={modalStyles.closeBtn}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="close" size={18} color={TACTICAL.textMuted} />
            </TouchableOpacity>
          </View>

          <View style={modalStyles.divider} />

          <ScrollView style={modalStyles.body} showsVerticalScrollIndicator={false}>
            {/* Summary */}
            <View style={modalStyles.summaryRow}>
              <Text style={modalStyles.summaryCount}>{skippedCount}</Text>
              <Text style={modalStyles.summaryLabel}>
                change{skippedCount !== 1 ? 's' : ''} could not sync to the cloud
              </Text>
            </View>

            {/* Explanation */}
            <Text style={modalStyles.paragraph}>
              These changes were made while you were not signed in. The app saved
              them locally, but could not push them to the cloud because there was
              no authenticated account to associate them with.
            </Text>

            <Text style={modalStyles.paragraph}>
              When you use the app without signing in, all data is stored on this
              device only. This is called <Text style={modalStyles.bold}>local-only mode</Text>.
              Changes made in local-only mode are preserved on your device but
              cannot be synced to the cloud or shared across devices.
            </Text>

            {/* What happened */}
            <Text style={modalStyles.sectionTitle}>WHAT HAPPENED</Text>
            <View style={modalStyles.bulletList}>
              <Text style={modalStyles.bullet}>
                {'\u2022'}  You made changes while signed out or before creating an account
              </Text>
              <Text style={modalStyles.bullet}>
                {'\u2022'}  The sync system detected these changes cannot be attributed to a cloud account
              </Text>
              <Text style={modalStyles.bullet}>
                {'\u2022'}  Rather than retry indefinitely and cause errors, the system automatically skipped them
              </Text>
            </View>

            {/* Affected categories */}
            {Object.keys(categories).length > 0 && (
              <>
                <Text style={modalStyles.sectionTitle}>AFFECTED AREAS</Text>
                <View style={modalStyles.chipRow}>
                  {Object.entries(categories).map(([cat, count]) => (
                    <View key={cat} style={modalStyles.chip}>
                      <Text style={modalStyles.chipText}>
                        {cat}{count > 1 ? ` (${count})` : ''}
                      </Text>
                    </View>
                  ))}
                </View>
              </>
            )}

            {/* What to do */}
            <Text style={modalStyles.sectionTitle}>WHAT YOU CAN DO</Text>
            <View style={modalStyles.bulletList}>
              <Text style={modalStyles.bullet}>
                {'\u2022'}  <Text style={modalStyles.bold}>Sign in</Text> to enable cloud sync for all future changes
              </Text>
              <Text style={modalStyles.bullet}>
                {'\u2022'}  Your local data is still on this device and accessible in the app
              </Text>
              <Text style={modalStyles.bullet}>
                {'\u2022'}  New changes made after signing in will sync normally
              </Text>
            </View>

            <Text style={[modalStyles.paragraph, { marginTop: 12, opacity: 0.6 }]}>
              This is expected behavior and not an error. The app is designed to
              work offline-first — your data is safe on this device.
            </Text>

            <View style={{ height: 20 }} />
          </ScrollView>

          {/* Footer */}
          <View style={modalStyles.footer}>
            <TouchableOpacity
              style={modalStyles.footerBtn}
              onPress={onClose}
              activeOpacity={0.7}
            >
              <Text style={modalStyles.footerBtnText}>GOT IT</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ── Main Banner Component ─────────────────────────────────────

export default function SyncSkipAlertBanner() {
  const [state, setState] = useState<SyncSkipAlertState>(
    syncSkipAlertStore.getState()
  );
  const [showLearnMore, setShowLearnMore] = useState(false);
  const slideAnim = useRef(new Animated.Value(-30)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const hasAnimated = useRef(false);

  // Subscribe to store
  useEffect(() => {
    const unsub = syncSkipAlertStore.subscribe((newState) => {
      setState(newState);
    });
    return unsub;
  }, []);

  // Animate in when visible
  useEffect(() => {
    if (state.isVisible && !hasAnimated.current) {
      hasAnimated.current = true;
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 350,
          useNativeDriver: true,
        }),
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: 350,
          useNativeDriver: true,
        }),
      ]).start();
    } else if (!state.isVisible) {
      hasAnimated.current = false;
      slideAnim.setValue(-30);
      opacityAnim.setValue(0);
    }
  }, [state.isVisible, opacityAnim, slideAnim]);

  const handleDismiss = useCallback(() => {
    Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: -30,
        duration: 250,
        useNativeDriver: true,
      }),
      Animated.timing(opacityAnim, {
        toValue: 0,
        duration: 250,
        useNativeDriver: true,
      }),
    ]).start(() => {
      syncSkipAlertStore.dismiss();
    });
  }, [opacityAnim, slideAnim]);

  const handleDismissForever = useCallback(() => {
    syncSkipAlertStore.dismissPermanently();
  }, []);

  if (!state.isVisible) return null;

  const count = state.skippedCount;
  const message = count === 1
    ? '1 offline change could not sync — you were not signed in when it was made'
    : `${count} offline changes could not sync — you were not signed in when they were made`;

  return (
    <>
      <Animated.View
        style={[
          styles.container,
          {
            transform: [{ translateY: slideAnim }],
            opacity: opacityAnim,
          },
        ]}
      >
        {/* Left severity bar */}
        <View style={styles.severityBar} />

        {/* Icon */}
        <View style={styles.iconWrap}>
          <Ionicons name="cloud-offline-outline" size={16} color={BANNER_COLORS.icon} />
        </View>

        {/* Content */}
        <View style={styles.content}>
          <Text style={styles.label}>SYNC SKIPPED</Text>
          <Text style={styles.message} numberOfLines={2}>
            {message}
          </Text>
          <View style={styles.actions}>
            <TouchableOpacity
              onPress={() => setShowLearnMore(true)}
              activeOpacity={0.7}
              hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
            >
              <Text style={styles.learnMoreLink}>Learn More</Text>
            </TouchableOpacity>
            <Text style={styles.actionDot}> · </Text>
            <TouchableOpacity
              onPress={handleDismissForever}
              activeOpacity={0.7}
              hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
            >
              <Text style={styles.dontShowLink}>Don't show again</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Count badge */}
        <View style={styles.countBadge}>
          <Text style={styles.countText}>{count}</Text>
        </View>

        {/* Dismiss button */}
        <TouchableOpacity
          style={styles.dismissBtn}
          onPress={handleDismiss}
          activeOpacity={0.7}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="close" size={14} color={TACTICAL.textMuted} />
        </TouchableOpacity>
      </Animated.View>

      {/* Learn More Modal */}
      <LearnMoreModal
        visible={showLearnMore}
        onClose={() => setShowLearnMore(false)}
        skippedCount={count}
        skippedTypes={state.skippedTypes}
      />
    </>
  );
}

// ── Banner Styles ─────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 12,
    marginBottom: 4,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: BANNER_COLORS.border,
    backgroundColor: BANNER_COLORS.bg,
    paddingVertical: 10,
    paddingRight: 8,
    paddingLeft: 0,
    gap: 8,
    overflow: 'hidden',
  },

  severityBar: {
    width: 3,
    alignSelf: 'stretch',
    backgroundColor: BANNER_COLORS.icon,
    borderTopLeftRadius: 10,
    borderBottomLeftRadius: 10,
  },

  iconWrap: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.18)',
    borderWidth: 1,
    borderColor: BANNER_COLORS.border,
    marginLeft: 4,
  },

  content: {
    flex: 1,
    gap: 2,
  },

  label: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.2,
    color: BANNER_COLORS.text,
  },

  message: {
    fontSize: 10,
    fontWeight: '600',
    color: TACTICAL.textMuted,
    lineHeight: 14,
  },

  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },

  learnMoreLink: {
    fontSize: 10,
    fontWeight: '700',
    color: BANNER_COLORS.linkText,
  },

  actionDot: {
    fontSize: 10,
    color: TACTICAL.textMuted,
  },

  dontShowLink: {
    fontSize: 10,
    fontWeight: '600',
    color: TACTICAL.textMuted,
  },

  countBadge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(212, 160, 23, 0.18)',
    borderWidth: 1,
    borderColor: BANNER_COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },

  countText: {
    fontSize: 10,
    fontWeight: '800',
    color: BANNER_COLORS.text,
    fontFamily: 'Courier',
  },

  dismissBtn: {
    width: 24,
    height: 24,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.18)',
    borderWidth: 1,
    borderColor: BANNER_COLORS.border,
  },
});

// ── Modal Styles ──────────────────────────────────────────────

const modalStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.82)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },

  container: {
    width: '100%',
    maxWidth: 480,
    maxHeight: '80%',
    backgroundColor: ECS.bgPanel,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: ECS.stroke,
    overflow: 'hidden',
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 10,
  },

  headerIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: 'rgba(212,160,23,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(212,160,23,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  headerTitle: {
    flex: 1,
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 3,
    color: ECS.text,
  },

  closeBtn: {
    width: 28,
    height: 28,
    borderRadius: 7,
    backgroundColor: 'rgba(255,255,255,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  divider: {
    height: 1,
    backgroundColor: 'rgba(212,160,23,0.15)',
  },

  body: {
    paddingHorizontal: 16,
    paddingTop: 14,
  },

  summaryRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
    marginBottom: 14,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: ECS.stroke,
  },

  summaryCount: {
    fontSize: 28,
    fontWeight: '800',
    color: BANNER_COLORS.icon,
    fontFamily: 'Courier',
  },

  summaryLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: TACTICAL.textMuted,
    flex: 1,
  },

  paragraph: {
    fontSize: 12,
    lineHeight: 18,
    color: TACTICAL.textMuted,
    marginBottom: 10,
  },

  bold: {
    fontWeight: '700',
    color: ECS.text,
  },

  sectionTitle: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 3,
    color: BANNER_COLORS.icon,
    marginTop: 14,
    marginBottom: 8,
  },

  bulletList: {
    gap: 6,
    marginBottom: 6,
  },

  bullet: {
    fontSize: 12,
    lineHeight: 17,
    color: TACTICAL.textMuted,
    paddingLeft: 4,
  },

  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 6,
  },

  chip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: 'rgba(212,160,23,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(212,160,23,0.2)',
  },

  chipText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
    color: BANNER_COLORS.textBody,
  },

  footer: {
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: ECS.stroke,
    alignItems: 'center',
  },

  footerBtn: {
    paddingHorizontal: 32,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: 'rgba(212,160,23,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(212,160,23,0.3)',
  },

  footerBtnText: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 3,
    color: BANNER_COLORS.icon,
  },
});



