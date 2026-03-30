/**
 * Header — Top navigation bar (ECS Command Bar)
 *
 * ──────────────────────────────────────────────────────────────
 * UI Consistency Pass:
 *   • Product title uses TYPO.T2 (17px bold, tracking +3)
 *   • Active trip uses TYPO.B2 (15px regular)
 *   • Brand badge uses TYPO.U2 sizing
 *   • Right-side icons use consistent DENSITY.iconBtnTap tap targets
 *   • Auth button has proper hitSlop from CLOSE_BTN.hitSlop
 *   • Vertical alignment: alignItems: 'center' on right group
 *   • Consistent gap values from DENSITY tokens
 * ──────────────────────────────────────────────────────────────
 */
import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { SafeIcon as Ionicons } from './SafeIcon';
import { SPACING, DENSITY, ECS, TYPO } from '../lib/theme';
import { CLOSE_BTN, SAFE_AREA } from '../lib/uiConstants';

import { useTheme } from '../context/ThemeContext';
import { useApp } from '../context/AppContext';

import SyncStatusIndicator from './SyncStatusIndicator';
import SyncQueueIndicator from './SyncQueueIndicator';
import ThemeToggle from './ThemeToggle';
import AppearanceSettingsModal from './AppearanceSettingsModal';

// ── Bold Gold Structural Palette (matches CommandDock) ────────
const HEADER = {
  bar: '#1E2125',
  goldRail: '#A0813A',
  barBottomEdge: '#262A2E',
  radialCore: 'rgba(161, 129, 58, 0.10)',
  radialMid: 'rgba(161, 129, 58, 0.05)',
  iconMuted: '#8A7A58',
  iconActive: '#C9A24C',
  brandText: '#6B5F42',
  productText: '#C9A24C',
  tripText: '#8A7A58',
  statusOnline: '#3E6B3E',
};

interface HeaderProps {
  onAuthPress?: () => void;
}

// ── Radial Gradient Simulation ───────────────────────────────
function HeaderRadialGradient() {
  return (
    <View style={styles.radialContainer} pointerEvents="none">
      <View style={[styles.radialRing, {
        width: '50%',
        height: '180%',
        backgroundColor: HEADER.radialCore,
        borderRadius: 999,
      }]} />
      <View style={[styles.radialRing, {
        width: '75%',
        height: '240%',
        backgroundColor: HEADER.radialMid,
        borderRadius: 999,
      }]} />
    </View>
  );
}

export default function Header({ onAuthPress }: HeaderProps) {
  const { user, activeTrip, isOnline, offlineMode } = useApp();
  const { palette, colors } = useTheme();
  const [appearanceModalVisible, setAppearanceModalVisible] = useState(false);

  return (
    <View style={styles.container}>
      {/* Radial gradient overlay behind title area */}
      <HeaderRadialGradient />

      {/* Vertical depth shift — lighter strip above gold rail */}
      <View style={styles.barBottomEdge} />

      {/* Structural gold rail — bottom edge of header */}
      <View style={styles.goldRailLine} />

      <View style={styles.left}>
        <View style={styles.brandRow}>
          {offlineMode && !user && (
            <View style={styles.offlineBadge}>
              <Ionicons name="phone-portrait-outline" size={8} color={HEADER.iconActive} />
              <Text style={styles.offlineBadgeText}>LOCAL</Text>
            </View>
          )}
        </View>
        <Text style={styles.product}>Expedition Command System</Text>

        {activeTrip && (
          <Text style={styles.activeTrip}>
            <Ionicons name="navigate" size={13} color={HEADER.iconActive} /> {activeTrip.name}
          </Text>
        )}

      </View>
      <View style={styles.right}>
        {/* Theme Toggle */}
        <ThemeToggle
          size={26}
          compact
          onLongPress={() => setAppearanceModalVisible(true)}
        />
        <SyncStatusIndicator />
        {/* Sync Queue Indicator — shows pending offline actions */}
        <SyncQueueIndicator />

        <TouchableOpacity
          onPress={onAuthPress}
          style={styles.authBtn}
          hitSlop={CLOSE_BTN.hitSlop}
        >
          <Ionicons
            name={user ? 'person-circle' : 'person-circle-outline'}
            size={26}
            color={user ? HEADER.iconActive : HEADER.iconMuted}
          />
          {/* Online indicator dot */}
          <View style={[
            styles.statusDot,
            {
              backgroundColor: isOnline ? HEADER.statusOnline : HEADER.iconMuted,
              borderColor: HEADER.bar,
            },
          ]} />
        </TouchableOpacity>
      </View>

      <AppearanceSettingsModal
        visible={appearanceModalVisible}
        onClose={() => setAppearanceModalVisible(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: DENSITY.screenPad,
    paddingTop: Platform.OS === 'web' ? SPACING.md : SAFE_AREA.top,
    paddingBottom: SPACING.sm + 2,
    backgroundColor: HEADER.bar,
    borderBottomWidth: 0,
    overflow: 'hidden',
  },

  // ── Structural gold rail — bottom edge (1.5px, solid, no glow) ──
  goldRailLine: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 1.5,
    backgroundColor: HEADER.goldRail,
    zIndex: 2,
  },

  // ── Vertical depth shift — lighter strip just above gold rail ──
  barBottomEdge: {
    position: 'absolute',
    bottom: 1.5,
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: HEADER.barBottomEdge,
    zIndex: 1,
  },

  // ── Radial gradient container ──
  radialContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'flex-start',
    justifyContent: 'center',
    paddingLeft: '15%',
    zIndex: 0,
    overflow: 'hidden',
  },

  radialRing: {
    position: 'absolute',
  },

  left: {
    flex: 1,
    zIndex: 3,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  offlineBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(201, 162, 76, 0.10)',
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: 'rgba(201, 162, 76, 0.25)',
  },
  offlineBadgeText: {
    fontSize: 7,
    fontWeight: '800',
    letterSpacing: 0.5,
    color: HEADER.iconActive,
  },
  // T2 Widget Title — used for product name
  product: {
    ...TYPO.T2,
    fontSize: 18,
    letterSpacing: 0.5,
    color: HEADER.productText,
  },
  // B2 Secondary — used for active trip
  activeTrip: {
    ...TYPO.B2,
    fontSize: 14,
    fontWeight: '600',
    marginTop: 3,
    color: HEADER.tripText,
  },

  right: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: DENSITY.internalRowGap,
    zIndex: 3,
  },
  authBtn: {
    // Ensure minimum tap target
    minWidth: DENSITY.iconBtnTap,
    minHeight: DENSITY.iconBtnTap,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  statusDot: {
    position: 'absolute',
    bottom: 6,
    right: 8,
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: 1.5,
  },
});







