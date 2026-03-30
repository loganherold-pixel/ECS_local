/**
 * DashboardHeader — Minimal cockpit header
 *
 * Left: Active Expedition/Trip name (or "NO ACTIVE EXPEDITION") + State Pill
 * Center: Sync/Signal indicator (ONLINE/OFFLINE/SYNCING/SEARCHING)
 * Right: Theme Toggle | Viewer Settings | Options dropdown | Account icon | DONE button in layout mode
 *
 * ──────────────────────────────────────────────────────────────
 * Bold Gold Structural Integration:
 *   • 1.5px structural gold rail along bottom edge (#A0813A)
 *   • Deepened charcoal background (#1E2125) matching CommandDock
 *   • Radial gradient simulation behind left title area
 *   • Subtle vertical depth shift (bottom edge slightly lighter)
 *   • Inactive icons: muted gold-bronze (#8A7A58)
 *   • Active icons: brighter gold (#C9A24C)
 *   • No glow, no blur
 *   • Visual bookending with CommandDock — gold rails frame content
 * ──────────────────────────────────────────────────────────────
 *
 * Expedition State Integration:
 *   • Subscribes to expeditionStateStore for real-time state changes
 *   • Gold underline animation: 150ms fade-in when active, 220ms fade-out on end
 *   • "End Expedition" dropdown option when expedition.state === 'active'
 *   • "Geofence Radius" dropdown option to configure auto-start/end radius
 *   • Confirmation dialog before ending expedition
 *   • Calls onExpeditionEnded callback to trigger summary sheet in parent
 * ──────────────────────────────────────────────────────────────
 *
 * Developer Diagnostics:
 *   • Triple-tap on expedition title opens hidden ECS Diagnostics Panel
 *   • Only available in __DEV__ mode
 *   • Does not interfere with normal UI interactions
 * ──────────────────────────────────────────────────────────────
 *
 * In layout mode: header dims ~15%
 * Connectivity-aware: shows real signal status
 * Theme-aware: uses palette from ThemeContext
 * Viewer Settings: eye icon opens ViewerSettingsPanel
 */
import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Platform,
  Animated, Alert, Pressable, Modal,
} from 'react-native';
import { SafeIcon as Ionicons } from '../SafeIcon';

import { TYPO, DENSITY } from '../../lib/theme';
import { useApp } from '../../context/AppContext';
import { useTheme } from '../../context/ThemeContext';
import { useViewerSettings } from '../../context/ViewerSettingsContext';
import ThemeToggle from '../ThemeToggle';
import AppearanceSettingsModal from '../AppearanceSettingsModal';
import ViewerSettingsPanel from './ViewerSettingsPanel';
import GeofenceRadiusPanel from './GeofenceRadiusPanel';
import EcsDiagnosticsPanel from './EcsDiagnosticsPanel';
import ExpeditionStatePill, { type ExpeditionPhase } from '../ExpeditionStatePill';
import { getCachedExpeditions } from '../../lib/expeditionCache';
import { missionExpeditionStore } from '../../lib/missionStore';
import {
  expeditionStateStore,
  type ExpeditionState,
  type ExpeditionRecord,
} from '../../lib/expeditionStateStore';

// ── Bold Gold Structural Palette (matches Header + CommandDock) ──
const DHDR = {
  // Bar surface — deepened charcoal
  bar: '#1E2125',

  // Structural gold rail — bottom edge
  goldRail: '#A0813A',

  // Vertical depth shift — lighter bottom edge above gold rail
  barBottomEdge: '#262A2E',

  // Radial gradient simulation (burnished gold, centered on left area)
  radialCore: 'rgba(161, 129, 58, 0.10)',
  radialMid: 'rgba(161, 129, 58, 0.05)',

  // Icon colors — gold-bronze family
  iconMuted: '#8A7A58',
  iconActive: '#C9A24C',

  // Sync pill border
  syncPillBg: '#22272C',
  syncPillBorder: '#3A3E44',

  // Expedition gold accent
  expeditionGold: '#D4A017',
  expeditionGoldSoft: 'rgba(212,160,23,0.35)',
};


interface DashboardHeaderProps {
  layoutMode: boolean;
  onDone: () => void;
  onAuthPress: () => void;
  onViewerSettingsApplied?: () => void;
  onExpeditionEnded?: () => void;
}

// ── Radial Gradient Simulation ───────────────────────────────
function DashHeaderRadialGradient() {
  return (
    <View style={styles.radialContainer} pointerEvents="none">
      <View style={[styles.radialRing, {
        width: '50%',
        height: '180%',
        backgroundColor: DHDR.radialCore,
        borderRadius: 999,
      }]} />
      <View style={[styles.radialRing, {
        width: '75%',
        height: '240%',
        backgroundColor: DHDR.radialMid,
        borderRadius: 999,
      }]} />
    </View>
  );
}

export default function DashboardHeader({
  layoutMode, onDone, onAuthPress, onViewerSettingsApplied, onExpeditionEnded,
}: DashboardHeaderProps) {
  const { activeTrip, syncStatus, user, triggerSync, isOnline, connectivityStatus, offlineMode } = useApp();
  const { palette } = useTheme();
  const { settings } = useViewerSettings();
  const [appearanceModalVisible, setAppearanceModalVisible] = useState(false);
  const [viewerSettingsVisible, setViewerSettingsVisible] = useState(false);
  const [dropdownVisible, setDropdownVisible] = useState(false);
  const [geofenceRadiusPanelVisible, setGeofenceRadiusPanelVisible] = useState(false);

  // ── Geofence Radius (for dropdown display) ────────────────
  // Read current radius to display in the dropdown menu item.
  // Re-reads when dropdown opens to show latest value.
  const [geofenceRadius, setGeofenceRadius] = useState(() =>
    expeditionStateStore.getGeofenceRadius()
  );


  // ── ECS Diagnostics Panel (Hidden Developer Mode) ─────────
  // Triple-tap on the expedition title area opens the diagnostics panel.
  // Only available in __DEV__ mode. Does not interfere with normal UI.
  const [diagnosticsPanelVisible, setDiagnosticsPanelVisible] = useState(false);
  const tripleTapCountRef = useRef(0);
  const tripleTapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleTitlePress = useCallback(() => {
    if (!__DEV__) return; // Only in dev mode

    tripleTapCountRef.current += 1;

    if (tripleTapTimerRef.current) {
      clearTimeout(tripleTapTimerRef.current);
    }

    if (tripleTapCountRef.current >= 3) {
      // Triple tap detected — open diagnostics
      tripleTapCountRef.current = 0;
      console.log('[ECS_DIAGNOSTICS] Developer gesture detected — opening diagnostics panel');
      setDiagnosticsPanelVisible(true);
    } else {
      // Reset after 600ms if not enough taps
      tripleTapTimerRef.current = setTimeout(() => {
        tripleTapCountRef.current = 0;
      }, 600);
    }
  }, []);




  // ── Expedition State ──────────────────────────────────────
  const [expeditionState, setExpeditionState] = useState<ExpeditionState>(
    expeditionStateStore.getState()
  );
  const [expeditionRecord, setExpeditionRecord] = useState<ExpeditionRecord | null>(
    expeditionStateStore.getCurrentExpedition()
  );

  // ── Gold Underline Animation ──────────────────────────────
  // 150ms fade-in when expedition becomes active
  // 220ms fade-out when expedition ends
  const goldUnderlineAnim = useRef(
    new Animated.Value(expeditionStateStore.getState() === 'active' ? 1 : 0)
  ).current;

  // Track previous state to detect transitions
  const prevStateRef = useRef<ExpeditionState>(expeditionStateStore.getState());

  // ── Subscribe to expedition state changes ─────────────────
  useEffect(() => {
    const unsubscribe = expeditionStateStore.subscribe((state, record) => {
      const prevState = prevStateRef.current;
      setExpeditionState(state);
      setExpeditionRecord(record);

      // Animate gold underline based on state transitions
      if (state === 'active' && prevState !== 'active') {
        // Fade in: 150ms
        Animated.timing(goldUnderlineAnim, {
          toValue: 1,
          duration: 150,
          useNativeDriver: false,
        }).start();
      } else if (state !== 'active' && prevState === 'active') {
        // Fade out: 220ms
        Animated.timing(goldUnderlineAnim, {
          toValue: 0,
          duration: 220,
          useNativeDriver: false,
        }).start();
      }

      prevStateRef.current = state;
    });

    return unsubscribe;
  }, [goldUnderlineAnim]);

  // Viewer settings indicator: show a colored dot if non-default
  const isNonDefault = settings.viewerMode !== 'standard' || settings.themeMode !== 'night';

  // ── Global State Indicator: determine expedition phase ──
  const expeditionPhase: ExpeditionPhase = useMemo(() => {
    // Use the expedition state store first
    if (expeditionState === 'active') return 'active';

    try {
      const activeMission = missionExpeditionStore.getActive();
      if (activeMission) return 'active';
    } catch {}

    try {
      const cached = getCachedExpeditions();
      const hasActive = cached.some(e => e.status === 'active');
      if (hasActive) return 'active';
    } catch {}

    return 'planning';
  }, [activeTrip, syncStatus, expeditionState]);

  // ── End Expedition Handler ────────────────────────────────
  const handleEndExpedition = useCallback(() => {
    setDropdownVisible(false);

    Alert.alert(
      'End Expedition',
      'Are you sure you want to end the current expedition?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'End Expedition',
          style: 'destructive',
          onPress: () => {
            expeditionStateStore.endExpedition();
            onExpeditionEnded?.();
          },
        },
      ],
      { cancelable: true }
    );
  }, [onExpeditionEnded]);

  // ── Toggle Dropdown ───────────────────────────────────────
  const toggleDropdown = useCallback(() => {
    setDropdownVisible(prev => {
      if (!prev) {
        // Refresh geofence radius when opening dropdown
        setGeofenceRadius(expeditionStateStore.getGeofenceRadius());
      }
      return !prev;
    });
  }, []);

  const closeDropdown = useCallback(() => {
    setDropdownVisible(false);
  }, []);


  const getSyncConfig = () => {
    if (connectivityStatus === 'reconnecting') {
      return { label: 'SEARCHING', color: DHDR.iconActive, icon: 'wifi-outline' as const };
    }

    if (!isOnline) {
      return { label: 'NO SIGNAL', color: DHDR.iconMuted, icon: 'cloud-offline-outline' as const };
    }

    switch (syncStatus) {
      case 'synced':
        return { label: 'ONLINE', color: '#4CAF50', icon: 'radio' as const };
      case 'syncing':
        return { label: 'SYNCING', color: DHDR.iconActive, icon: 'sync' as const };
      case 'error':
        return { label: 'SYNC ERR', color: palette.danger, icon: 'alert-circle' as const };
      default:
        if (offlineMode && !user) {
          return { label: 'LOCAL', color: DHDR.iconActive, icon: 'phone-portrait-outline' as const };
        }
        return { label: 'OFFLINE', color: DHDR.iconMuted, icon: 'cloud-offline-outline' as const };
    }
  };

  const sync = getSyncConfig();

  // Whether to show the "End Expedition" option in dropdown
  const showEndExpedition = expeditionState === 'active';

  // ── Gold underline interpolation ──────────────────────────
  const goldUnderlineOpacity = goldUnderlineAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
  });
  const goldUnderlineHeight = goldUnderlineAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 2],
  });

  return (
    <View style={[styles.container, layoutMode && styles.containerDimmed]}>
      {/* Radial gradient overlay behind title area */}
      <DashHeaderRadialGradient />

      {/* Vertical depth shift — lighter strip above gold rail */}
      <View style={styles.barBottomEdge} />

      {/* Structural gold rail — bottom edge of header */}
      <View style={styles.goldRailLine} />

      {/* ── Expedition Gold Underline ──────────────────────────
           Animated gold accent line that appears above the structural
           gold rail when expedition is active. 150ms fade-in, 220ms
           fade-out. Sits at the very bottom of the header. */}
      <Animated.View
        style={[
          styles.expeditionGoldUnderline,
          {
            opacity: goldUnderlineOpacity,
            height: goldUnderlineHeight,
          },
        ]}
        pointerEvents="none"
      />

      {/* Left: Active Expedition + State Pill
           Triple-tap on this area opens hidden ECS Diagnostics Panel (dev only).
           The Pressable does not interfere with normal interactions — single taps
           are absorbed silently, only triple-tap triggers the diagnostics. */}
      <Pressable style={styles.left} onPress={handleTitlePress}>
        <View style={styles.leftColumn}>
          <View style={styles.leftRow}>
            {expeditionState === 'active' ? (
              <>
                <View style={[styles.activeDot, { backgroundColor: DHDR.expeditionGold }]} />
                <Text style={[styles.tripName, { color: palette.text }]}>
                  {expeditionRecord?.vehicleName || 'Expedition Active'}
                </Text>
              </>
            ) : activeTrip ? (
              <>
                <View style={[styles.activeDot, { backgroundColor: isOnline ? '#4CAF50' : DHDR.iconActive }]} />
                <Text style={[styles.tripName, { color: palette.text }]}>{activeTrip.name}</Text>
              </>
            ) : (
              <Text style={[styles.noTrip, { color: DHDR.iconMuted }]}>NO ACTIVE EXPEDITION</Text>
            )}

          </View>
          <ExpeditionStatePill phase={expeditionPhase} />
        </View>
      </Pressable>


      {/* Center: Sync/Connectivity Indicator */}
      <TouchableOpacity
        style={[styles.center, { backgroundColor: DHDR.syncPillBg, borderColor: DHDR.syncPillBorder }]}
        onPress={triggerSync}
        activeOpacity={0.7}
      >
        <Ionicons name={sync.icon} size={12} color={sync.color} />
        <Text style={[styles.syncLabel, { color: sync.color }]}>{sync.label}</Text>
      </TouchableOpacity>

      {/* Right: Theme Toggle + Viewer Settings + Options + Account or DONE */}
      <View style={styles.right}>
        {layoutMode ? (
          <TouchableOpacity style={[styles.doneBtn, { backgroundColor: palette.accent, borderColor: palette.borderFocus }]} onPress={onDone} activeOpacity={0.7}>
            <Text style={[styles.doneText, { color: palette.text }]}>DONE</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.rightIcons}>
            <ThemeToggle
              size={26}
              compact
              onLongPress={() => setAppearanceModalVisible(true)}
            />
            {/* Viewer Settings Button */}
            <TouchableOpacity
              onPress={() => setViewerSettingsVisible(true)}
              style={styles.viewerBtn}
              activeOpacity={0.7}
            >
              <Ionicons
                name="eye-outline"
                size={20}
                color={isNonDefault ? DHDR.iconActive : DHDR.iconMuted}
              />
              {isNonDefault && (
                <View style={[styles.viewerDot, { backgroundColor: DHDR.iconActive, borderColor: DHDR.bar }]} />
              )}
            </TouchableOpacity>

            {/* Options Dropdown Button (shows End Expedition when active) */}
            <TouchableOpacity
              onPress={toggleDropdown}
              style={styles.optionsBtn}
              activeOpacity={0.7}
            >
              <Ionicons
                name="ellipsis-vertical"
                size={18}
                color={showEndExpedition ? DHDR.expeditionGold : DHDR.iconMuted}
              />
              {/* Active expedition indicator dot */}
              {showEndExpedition && (
                <View style={[styles.optionsDot, { backgroundColor: DHDR.expeditionGold, borderColor: DHDR.bar }]} />
              )}
            </TouchableOpacity>

            <TouchableOpacity onPress={onAuthPress} style={styles.authBtn} activeOpacity={0.7}>
              <Ionicons
                name={user ? 'person-circle' : 'person-circle-outline'}
                size={24}
                color={user ? DHDR.iconActive : DHDR.iconMuted}
              />
              {/* Connectivity dot on avatar */}
              <View style={[
                styles.connDot,
                {
                  backgroundColor: isOnline ? '#4CAF50' : DHDR.iconMuted,
                  borderColor: DHDR.bar,
                },
              ]} />
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* ── Dropdown Menu ──────────────────────────────────────
           Appears below the options button when tapped.
           Shows "End Expedition" when expedition is active. */}
      {dropdownVisible && (
        <Modal
          transparent
          visible={dropdownVisible}
          animationType="none"
          onRequestClose={closeDropdown}
          statusBarTranslucent
        >
          <Pressable style={styles.dropdownOverlay} onPress={closeDropdown}>
            <View style={styles.dropdownContainer}>
              <View style={[styles.dropdown, { backgroundColor: '#1A1E22', borderColor: '#2A2E34' }]}>
                {/* End Expedition option — only when active */}
                {showEndExpedition && (
                  <TouchableOpacity
                    style={styles.dropdownItem}
                    onPress={handleEndExpedition}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="flag-outline" size={14} color={DHDR.expeditionGold} />
                    <Text style={[styles.dropdownItemText, { color: DHDR.expeditionGold }]}>
                      End Expedition
                    </Text>
                  </TouchableOpacity>
                )}

                {/* Divider if both items present */}
                {showEndExpedition && (
                  <View style={styles.dropdownDivider} />
                )}

                {/* Appearance Settings */}
                <TouchableOpacity
                  style={styles.dropdownItem}
                  onPress={() => {
                    closeDropdown();
                    setAppearanceModalVisible(true);
                  }}
                  activeOpacity={0.7}
                >
                  <Ionicons name="color-palette-outline" size={14} color="#8B949E" />
                  <Text style={[styles.dropdownItemText, { color: '#E6EDF3' }]}>
                    Appearance
                  </Text>
                </TouchableOpacity>

                {/* Viewer Settings */}
                <TouchableOpacity
                  style={styles.dropdownItem}
                  onPress={() => {
                    closeDropdown();
                    setViewerSettingsVisible(true);
                  }}
                  activeOpacity={0.7}
                >
                  <Ionicons name="eye-outline" size={14} color="#8B949E" />
                  <Text style={[styles.dropdownItemText, { color: '#E6EDF3' }]}>
                    Viewer Settings
                  </Text>
                </TouchableOpacity>

                {/* Divider before Geofence Radius */}
                <View style={styles.dropdownDivider} />

                {/* Geofence Radius — opens settings panel */}
                <TouchableOpacity
                  style={styles.dropdownItem}
                  onPress={() => {
                    closeDropdown();
                    setGeofenceRadiusPanelVisible(true);
                  }}
                  activeOpacity={0.7}
                >
                  <Ionicons name="locate-outline" size={14} color="#8B949E" />
                  <View style={styles.dropdownItemWithBadge}>
                    <Text style={[styles.dropdownItemText, { color: '#E6EDF3' }]}>
                      Geofence Radius
                    </Text>
                    <View style={styles.radiusBadge}>
                      <Text style={styles.radiusBadgeText}>{geofenceRadius}m</Text>
                    </View>
                  </View>
                </TouchableOpacity>
              </View>
            </View>
          </Pressable>
        </Modal>
      )}

      <AppearanceSettingsModal
        visible={appearanceModalVisible}
        onClose={() => setAppearanceModalVisible(false)}
      />

      <ViewerSettingsPanel
        visible={viewerSettingsVisible}
        onClose={() => setViewerSettingsVisible(false)}
        onSettingsApplied={onViewerSettingsApplied}
      />

      <GeofenceRadiusPanel
        visible={geofenceRadiusPanelVisible}
        onClose={() => {
          setGeofenceRadiusPanelVisible(false);
          // Refresh the cached radius value for next dropdown display
          setGeofenceRadius(expeditionStateStore.getGeofenceRadius());
        }}
      />

      {/* ── ECS Diagnostics Panel (Hidden Developer Mode) ──────
           Full-screen modal accessible only via triple-tap on the
           expedition title area. Only renders in __DEV__ mode.
           Does not affect normal app operation or performance. */}
      <EcsDiagnosticsPanel
        visible={diagnosticsPanelVisible}
        onClose={() => setDiagnosticsPanelVisible(false)}
      />
    </View>
  );
}



const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'web' ? 12 : 52,
    paddingBottom: 12,
    backgroundColor: DHDR.bar,
    borderBottomWidth: 0,
    overflow: 'visible',
  },
  containerDimmed: {
    opacity: 0.85,
  },

  // ── Structural gold rail — bottom edge (1.5px, solid, no glow) ──
  goldRailLine: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 1.5,
    backgroundColor: DHDR.goldRail,
    zIndex: 2,
  },

  // ── Expedition Gold Underline ──────────────────────────────
  // Animated gold accent that appears above the structural rail
  // when expedition is active. Brighter than the structural rail
  // to signal operational state.
  expeditionGoldUnderline: {
    position: 'absolute',
    bottom: 1.5, // sits directly above the structural gold rail
    left: 0,
    right: 0,
    backgroundColor: DHDR.expeditionGold,
    zIndex: 3,
  },

  // ── Vertical depth shift — lighter strip just above gold rail ──
  barBottomEdge: {
    position: 'absolute',
    bottom: 1.5,
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: DHDR.barBottomEdge,
    zIndex: 1,
  },

  // ── Radial gradient container — centered on left title area ──
  radialContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'flex-start',
    justifyContent: 'center',
    paddingLeft: '10%',
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
  leftColumn: {
    gap: 4,
  },
  leftRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  activeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  tripName: {
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.5,
    flex: 1,
    flexWrap: 'wrap',
  },
  noTrip: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 1.5,
  },

  center: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    zIndex: 3,
  },
  syncLabel: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.5,
  },

  right: {
    flex: 1,
    alignItems: 'flex-end',
    zIndex: 3,
  },
  rightIcons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  viewerBtn: {
    padding: 2,
    position: 'relative',
  },
  viewerDot: {
    position: 'absolute',
    top: 0,
    right: -1,
    width: 6,
    height: 6,
    borderRadius: 3,
    borderWidth: 1.5,
  },
  optionsBtn: {
    padding: 2,
    position: 'relative',
  },
  optionsDot: {
    position: 'absolute',
    top: 0,
    right: -1,
    width: 6,
    height: 6,
    borderRadius: 3,
    borderWidth: 1.5,
  },
  authBtn: {
    padding: 2,
    position: 'relative',
  },
  connDot: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 7,
    height: 7,
    borderRadius: 3.5,
    borderWidth: 1.5,
  },
  doneBtn: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
  },
  doneText: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.5,
  },

  // ── Dropdown Menu ─────────────────────────────────────────
  dropdownOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  dropdownContainer: {
    position: 'absolute',
    top: Platform.OS === 'web' ? 56 : 96,
    right: 16,
    zIndex: 100,
  },
  dropdown: {
    minWidth: 200,
    borderRadius: 10,
    borderWidth: 1,
    paddingVertical: 4,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.4,
        shadowRadius: 12,
      },
      android: { elevation: 8 },
      default: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.4,
        shadowRadius: 12,
      },
    }),
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  dropdownItemText: {
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  dropdownDivider: {
    height: 0.75,
    backgroundColor: 'rgba(212,160,23,0.12)',
    marginHorizontal: 12,
  },

  // ── Dropdown item with badge (Geofence Radius) ────────────
  dropdownItemWithBadge: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  radiusBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: 'rgba(212,160,23,0.10)',
    borderWidth: 0.75,
    borderColor: 'rgba(212,160,23,0.25)',
  },
  radiusBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#D4A017',
    letterSpacing: 0.5,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
});






