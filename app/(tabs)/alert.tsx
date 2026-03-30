/**
 * Alert Tab — Unified Safety + Intel Command Center
 *
 * ══════════════════════════════════════════════════════════════
 * Merges the Safety and Intel tabs into a single unified
 * operational information center with a clean segment control.
 *
 * Structure:
 *   • Compact segment control at top (Safety | Intel)
 *   • Default view: Safety
 *   • Each subview renders its full existing content
 *   • ECS visual language maintained throughout
 *
 * Navigation slot freed for Discover tab.
 * ══════════════════════════════════════════════════════════════
 */
import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Animated,
  Dimensions,
} from 'react-native';
import { SafeIcon as Ionicons } from '../../components/SafeIcon';
import TabErrorBoundary from '../../components/TabErrorBoundary';
import TopoBackground from '../../components/TopoBackground';
import { TACTICAL, GOLD_RAIL, ECS } from '../../lib/theme';

// ── Import inner screen components ───────────────────────────
import { SafetyScreenInner } from './safety';
import { IntelScreenInner } from './intel';

const { width: SCREEN_W } = Dimensions.get('window');

type AlertSubView = 'safety' | 'intel';

// ── Segment Control Component ────────────────────────────────
function SegmentControl({
  activeView,
  onSwitch,
}: {
  activeView: AlertSubView;
  onSwitch: (view: AlertSubView) => void;
}) {
  const slideAnim = useRef(new Animated.Value(activeView === 'safety' ? 0 : 1)).current;

  useEffect(() => {
    Animated.timing(slideAnim, {
      toValue: activeView === 'safety' ? 0 : 1,
      duration: 280,
      useNativeDriver: false,
    }).start();
  }, [activeView, slideAnim]);

  const indicatorLeft = slideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '50%'],
  });

  return (
    <View style={segStyles.container}>
      {/* Sliding indicator */}
      <Animated.View
        style={[
          segStyles.indicator,
          { left: indicatorLeft },
        ]}
      />

      {/* Safety button */}
      <TouchableOpacity
        style={segStyles.button}
        onPress={() => onSwitch('safety')}
        activeOpacity={0.7}
      >
        <Ionicons
          name="shield-checkmark-outline"
          size={13}
          color={activeView === 'safety' ? TACTICAL.amber : TACTICAL.textMuted}
        />
        <Text
          style={[
            segStyles.label,
            activeView === 'safety' && segStyles.labelActive,
          ]}
        >
          SAFETY
        </Text>
      </TouchableOpacity>

      {/* Intel button */}
      <TouchableOpacity
        style={segStyles.button}
        onPress={() => onSwitch('intel')}
        activeOpacity={0.7}
      >
        <Ionicons
          name="radio-outline"
          size={13}
          color={activeView === 'intel' ? TACTICAL.amber : TACTICAL.textMuted}
        />
        <Text
          style={[
            segStyles.label,
            activeView === 'intel' && segStyles.labelActive,
          ]}
        >
          INTEL
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const segStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginBottom: 2,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderWidth: 1,
    borderColor: 'rgba(212,160,23,0.15)',
    overflow: 'hidden',
    position: 'relative',
    height: 38,
  },
  indicator: {
    position: 'absolute',
    top: 2,
    bottom: 2,
    width: '50%',
    backgroundColor: 'rgba(212,160,23,0.10)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(212,160,23,0.30)',
  },
  button: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    zIndex: 1,
  },
  label: {
    fontSize: 9,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    letterSpacing: 2,
  },
  labelActive: {
    color: TACTICAL.amber,
  },
});

// ── Alert Tab Inner ──────────────────────────────────────────
function AlertScreenInner() {
  const [activeView, setActiveView] = useState<AlertSubView>('safety');

  // Fade animation for smooth content transitions
  const fadeAnim = useRef(new Animated.Value(1)).current;

  const handleSwitch = useCallback((view: AlertSubView) => {
    if (view === activeView) return;

    // Fade out → switch → fade in
    Animated.timing(fadeAnim, {
      toValue: 0,
      duration: 120,
      useNativeDriver: true,
    }).start(() => {
      setActiveView(view);
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }).start();
    });
  }, [activeView, fadeAnim]);

  return (
    <View style={styles.root}>
      <TopoBackground>
        <View style={styles.container}>
          {/* ══════════════════════════════════════════════════
              UNIFIED HEADER
              ══════════════════════════════════════════════════ */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <View style={styles.headerIconWrap}>
                <Ionicons name="shield-checkmark" size={15} color={TACTICAL.amber} />
              </View>
              <View>
                <Text style={styles.headerMode}>OPERATIONAL CENTER</Text>
                <Text style={styles.headerTitle}>ALERT</Text>
              </View>
            </View>
            <View style={styles.headerRight}>
              <View style={styles.offlineBadge}>
                <View style={styles.offlineDot} />
                <Text style={styles.offlineText}>OFFLINE READY</Text>
              </View>
            </View>
          </View>

          {/* ══════════════════════════════════════════════════
              SEGMENT CONTROL — Safety | Intel
              ══════════════════════════════════════════════════ */}
          <SegmentControl activeView={activeView} onSwitch={handleSwitch} />

          {/* ══════════════════════════════════════════════════
              CONTENT AREA — Renders active subview
              ══════════════════════════════════════════════════ */}
          <Animated.View style={[styles.contentArea, { opacity: fadeAnim }]}>
            {activeView === 'safety' && <SafetyContent />}
            {activeView === 'intel' && <IntelContent />}
          </Animated.View>
        </View>
      </TopoBackground>
    </View>
  );
}

// ── Safety Content (embedded, no duplicate header/background) ─
function SafetyContent() {
  return (
    <View style={styles.subviewContainer}>
      <SafetyScreenInner embedded />
    </View>
  );
}

// ── Intel Content (embedded, no duplicate header/background) ──
function IntelContent() {
  return (
    <View style={styles.subviewContainer}>
      <IntelScreenInner embedded />
    </View>
  );
}


// ── Default Export ────────────────────────────────────────────
export default function AlertScreen() {
  return (
    <TabErrorBoundary tabName="ALERT">
      <AlertScreenInner />
    </TabErrorBoundary>
  );
}

// ── Styles ───────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: ECS.bgPrimary,
  },
  container: {
    flex: 1,
  },

  // ── Header ────────────────────────────────────────────────
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'web' ? 12 : 52,
    paddingBottom: 10,
    borderBottomWidth: GOLD_RAIL.sectionWidth,
    borderBottomColor: GOLD_RAIL.section,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerIconWrap: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: 'rgba(212,160,23,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(212,160,23,0.20)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerMode: {
    fontSize: 7,
    fontWeight: '700',
    color: TACTICAL.textMuted,
    letterSpacing: 2,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: TACTICAL.amber,
    letterSpacing: 2,
  },
  headerRight: {
    alignItems: 'flex-end',
  },
  offlineBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: 'rgba(76, 175, 80, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(76, 175, 80, 0.25)',
  },
  offlineDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#4CAF50',
  },
  offlineText: {
    fontSize: 7,
    fontWeight: '800',
    color: '#4CAF50',
    letterSpacing: 1,
  },

  // ── Content Area ──────────────────────────────────────────
  contentArea: {
    flex: 1,
  },
  subviewContainer: {
    flex: 1,
  },
});




