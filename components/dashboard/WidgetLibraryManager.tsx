/**
 * WidgetLibraryManager — Centralized Widget Management Panel
 *
 * Full-screen modal overlay for managing widgets across both
 * Highway and Expedition dashboard modes.
 *
 * Features:
 * - Two categories: Highway Widgets / Expedition Widgets
 * - Shows installed/available status per widget
 * - Add widgets to next available slot
 * - Reset Dashboard Layout with confirmation
 * - Duplicate prevention
 * - Maintains ECS dark command interface design language
 */
import React, { useEffect, useRef, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Dimensions,
  ScrollView,
  Alert,
} from 'react-native';
import { SafeIcon as Ionicons } from '../SafeIcon';
import { TACTICAL, TYPO, DENSITY } from '../../lib/theme';
import {
  WIDGET_REGISTRY,
  getDashboardLibraryWidgets,
  isDuplicate,
  CATEGORY_LABELS,
  type WidgetRegistryEntry,
  type DashboardMode,
} from '../../lib/widgetRegistry';
import {
  dashboardStore,
  GRID_LAYOUT_CONFIG,
  type DashboardProfile,
  type WidgetSlot,
} from '../../lib/dashboardStore';

// ── Constants ────────────────────────────────────────────
const SCREEN_H = Dimensions.get('window').height;

// ── Gold accent palette (matches ECS design language) ────
const GOLD = {
  primary: '#C48A2C',
  soft: 'rgba(196,138,44,0.12)',
  border: 'rgba(196,138,44,0.25)',
  text: '#C48A2C',
  muted: 'rgba(196,138,44,0.5)',
};

interface WidgetLibraryManagerProps {
  visible: boolean;
  onClose: () => void;
  /** Current active tab: 'expedition' | 'highway' */
  activeTab: 'expedition' | 'highway';
  /** Currently assigned widget IDs across both profiles */
  expeditionWidgets: (string | null)[];
  highwayWidgets: (string | null)[];
  /** Called when a widget is added — parent should refresh slots */
  onWidgetAdded: (profile: DashboardProfile, widgetType: string) => void;
  /** Called when layout is reset — parent should refresh slots */
  onLayoutReset: (profile: DashboardProfile) => void;
  /** Whether Advanced Modeling mode is enabled */
  advancedModeEnabled?: boolean;
}

export default function WidgetLibraryManager({
  visible,
  onClose,
  activeTab,
  expeditionWidgets,
  highwayWidgets,
  onWidgetAdded,
  onLayoutReset,
  advancedModeEnabled = false,
}: WidgetLibraryManagerProps) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(SCREEN_H)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 1, duration: 250, useNativeDriver: true }),
        Animated.spring(slideAnim, { toValue: 0, friction: 12, tension: 65, useNativeDriver: true }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
        Animated.timing(slideAnim, { toValue: SCREEN_H, duration: 200, useNativeDriver: true }),
      ]).start();
    }
  }, [visible]);

  // ── Get widgets filtered by mode ──────────────────────────
  const registryWidgets = useMemo(() => getDashboardLibraryWidgets(advancedModeEnabled), [advancedModeEnabled]);

  // Highway widgets: category === 'highway' OR supports_modes includes 'highway'
  const highwayLibraryWidgets = useMemo(() =>
    registryWidgets.filter(w => w.category === 'highway'),
    [registryWidgets]
  );

  // Expedition widgets: core instruments + addable widgets that support expedition mode
  const expeditionLibraryWidgets = useMemo(() =>
    registryWidgets.filter(w =>
      w.category !== 'highway' &&
      w.supports_modes.includes('expedition')
    ),
    [registryWidgets]
  );

  // ── Handle adding a widget ────────────────────────────────
  const handleAddWidget = useCallback((widgetId: string, targetMode: 'expedition' | 'highway') => {
    const profile: DashboardProfile = targetMode === 'expedition' ? 'expedition' : 'vehicle';
    const currentWidgets = targetMode === 'expedition' ? expeditionWidgets : highwayWidgets;

    // Check for duplicate
    if (isDuplicate(widgetId, currentWidgets)) {
      Alert.alert(
        'Already Installed',
        'This widget is already on your dashboard.',
        [{ text: 'OK' }]
      );
      return;
    }

    // Find next available slot
    const slots = dashboardStore.getProfileSlots(profile);
    const layout = dashboardStore.getGridLayout(profile);
    const maxSlots = GRID_LAYOUT_CONFIG[layout]?.total || 6;

    // Find first empty slot
    let targetSlotIndex = -1;
    for (let i = 0; i < slots.length; i++) {
      if (!slots[i].widgetType) {
        targetSlotIndex = i;
        break;
      }
    }

    // If no empty slot, try to expand
    if (targetSlotIndex === -1) {
      // All slots are full — notify user
      Alert.alert(
        'Dashboard Full',
        'All widget slots are occupied. Remove a widget first, or change your grid layout to add more slots.',
        [{ text: 'OK' }]
      );
      return;
    }

    // Assign the widget
    dashboardStore.assignWidget(profile, targetSlotIndex, widgetId);
    onWidgetAdded(profile, widgetId);
  }, [expeditionWidgets, highwayWidgets, onWidgetAdded]);

  // ── Handle reset layout ───────────────────────────────────
  const handleResetLayout = useCallback(() => {
    Alert.alert(
      'Reset Dashboard Layout?',
      'This will restore default widgets for both Highway and Expedition modes.\n\nHighway: Forward Weather, Daylight Remaining, Cell Coverage\n\nExpedition: Core instrument cluster',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Restore Defaults',
          style: 'destructive',
          onPress: () => {
            dashboardStore.restoreDefaults('expedition');
            dashboardStore.restoreDefaults('vehicle');
            onLayoutReset('expedition');
            onLayoutReset('vehicle');
            onClose();
          },
        },
      ]
    );
  }, [onLayoutReset, onClose]);

  if (!visible) return null;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {/* Backdrop */}
      <Animated.View style={[styles.backdrop, { opacity: fadeAnim }]}>
        <TouchableOpacity style={StyleSheet.absoluteFill} onPress={onClose} activeOpacity={1} />
      </Animated.View>

      {/* Panel */}
      <Animated.View style={[styles.panel, { transform: [{ translateY: slideAnim }] }]}>
        {/* Handle */}
        <View style={styles.handleRow}>
          <View style={styles.handle} />
        </View>

        {/* Title Row */}
        <View style={styles.titleRow}>
          <View style={styles.titleLeft}>
            <Ionicons name="apps-outline" size={18} color={GOLD.primary} />
            <Text style={styles.title}>WIDGET LIBRARY</Text>
          </View>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn} activeOpacity={0.7}>
            <Ionicons name="close" size={20} color={TACTICAL.textMuted} />
          </TouchableOpacity>
        </View>

        <Text style={styles.subtitle}>
          Manage widgets for Highway and Expedition dashboards
        </Text>

        {/* Scrollable Content */}
        <ScrollView
          style={styles.scroll}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          {/* ═══ HIGHWAY WIDGETS ═══ */}
          <View style={styles.sectionHeader}>
            <View style={styles.sectionIconWrap}>
              <Ionicons name="car-outline" size={14} color="#4FC3F7" />
            </View>
            <Text style={[styles.sectionTitle, { color: '#4FC3F7' }]}>HIGHWAY WIDGETS</Text>
            <View style={styles.sectionCount}>
              <Text style={styles.sectionCountText}>
                {highwayLibraryWidgets.length}
              </Text>
            </View>
          </View>

          {highwayLibraryWidgets.map(entry => (
            <WidgetRow
              key={entry.widget_id}
              entry={entry}
              isInstalled={isDuplicate(entry.widget_id, highwayWidgets)}
              accentColor="#4FC3F7"
              onAdd={() => handleAddWidget(entry.widget_id, 'highway')}
            />
          ))}

          {/* ═══ EXPEDITION WIDGETS ═══ */}
          <View style={[styles.sectionHeader, { marginTop: 20 }]}>
            <View style={[styles.sectionIconWrap, { backgroundColor: 'rgba(196,138,44,0.12)' }]}>
              <Ionicons name="compass-outline" size={14} color={GOLD.primary} />
            </View>
            <Text style={[styles.sectionTitle, { color: GOLD.primary }]}>EXPEDITION WIDGETS</Text>
            <View style={[styles.sectionCount, { backgroundColor: GOLD.soft }]}>
              <Text style={[styles.sectionCountText, { color: GOLD.primary }]}>
                {expeditionLibraryWidgets.length}
              </Text>
            </View>
          </View>

          {expeditionLibraryWidgets.map(entry => (
            <WidgetRow
              key={entry.widget_id}
              entry={entry}
              isInstalled={isDuplicate(entry.widget_id, expeditionWidgets)}
              accentColor={GOLD.primary}
              onAdd={() => handleAddWidget(entry.widget_id, 'expedition')}
            />
          ))}

          {/* ═══ RESET LAYOUT ═══ */}
          <View style={styles.resetSection}>
            <View style={styles.resetDivider} />
            <TouchableOpacity
              style={styles.resetBtn}
              onPress={handleResetLayout}
              activeOpacity={0.7}
            >
              <Ionicons name="refresh-outline" size={16} color={TACTICAL.textMuted} />
              <Text style={styles.resetBtnText}>Reset Dashboard Layout</Text>
            </TouchableOpacity>
            <Text style={styles.resetHint}>
              Restores default widgets for both Highway and Expedition modes
            </Text>
          </View>

          {/* Bottom padding */}
          <View style={{ height: 120 }} />
        </ScrollView>
      </Animated.View>
    </View>
  );
}

// ── Widget Row Component ────────────────────────────────────
function WidgetRow({
  entry,
  isInstalled,
  accentColor,
  onAdd,
}: {
  entry: WidgetRegistryEntry;
  isInstalled: boolean;
  accentColor: string;
  onAdd: () => void;
}) {
  const isWide = entry.default_size === '1x2';
  const needsSensor = entry.requires_sensor !== 'none';
  const isCore = entry.core_instrument === true;

  return (
    <TouchableOpacity
      style={[
        styles.widgetTile,
        isInstalled && styles.widgetTileInstalled,
      ]}
      onPress={isInstalled ? undefined : onAdd}
      activeOpacity={isInstalled ? 1 : 0.6}
    >
      {/* Icon */}
      <View style={[styles.widgetIcon, { backgroundColor: `${accentColor}15` }]}>
        <Ionicons
          name={entry.icon as any}
          size={18}
          color={isInstalled ? TACTICAL.textMuted : accentColor}
        />
      </View>

      {/* Info */}
      <View style={styles.widgetInfo}>
        <View style={styles.widgetNameRow}>
          <Text style={[
            styles.widgetName,
            isInstalled && { color: TACTICAL.textMuted },
          ]}>
            {entry.display_name}
          </Text>
          {isCore && (
            <View style={styles.coreBadge}>
              <Text style={styles.coreBadgeText}>CORE</Text>
            </View>
          )}
          {isWide && (
            <View style={styles.sizeBadge}>
              <Text style={styles.sizeBadgeText}>WIDE</Text>
            </View>
          )}
          {needsSensor && (
            <View style={[styles.sizeBadge, { backgroundColor: 'rgba(76,175,80,0.12)' }]}>
              <Text style={[styles.sizeBadgeText, { color: '#4CAF50' }]}>SENSOR</Text>
            </View>
          )}
        </View>
        <Text style={styles.widgetDesc} numberOfLines={2}>
          {entry.description}
        </Text>
      </View>

      {/* Status */}
      {isInstalled ? (
        <View style={styles.installedBadge}>
          <Ionicons name="checkmark-circle" size={12} color="#4CAF50" />
          <Text style={styles.installedText}>Installed</Text>
        </View>
      ) : (
        <View style={[styles.addBadge, { borderColor: `${accentColor}40` }]}>
          <Ionicons name="add" size={14} color={accentColor} />
          <Text style={[styles.addText, { color: accentColor }]}>Add</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

// ── Styles ──────────────────────────────────────────────────
const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.75)',
  },
  panel: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: SCREEN_H * 0.82,
    backgroundColor: '#141618',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 1,
    borderColor: 'rgba(196,138,44,0.15)',
  },
  handleRow: {
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 6,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },

  // ── Title ──
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    marginBottom: 4,
  },
  titleLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    fontSize: 13,
    fontWeight: '900',
    color: TACTICAL.text,
    letterSpacing: 3,
  },
  closeBtn: {
    padding: 4,
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  subtitle: {
    fontSize: 11,
    fontWeight: '500',
    color: TACTICAL.textMuted,
    paddingHorizontal: 20,
    marginBottom: 16,
  },

  // ── Scroll ──
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
  },

  // ── Section Headers ──
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  sectionIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: 'rgba(79,195,247,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 2.5,
    flex: 1,
  },
  sectionCount: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    backgroundColor: 'rgba(79,195,247,0.12)',
  },
  sectionCountText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#4FC3F7',
    fontFamily: 'Courier',
  },

  // ── Widget Tiles ──
  widgetTile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(255,255,255,0.02)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    padding: 12,
    marginBottom: 8,
  },
  widgetTileInstalled: {
    borderColor: 'rgba(76,175,80,0.12)',
    backgroundColor: 'rgba(76,175,80,0.03)',
  },
  widgetIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  widgetInfo: {
    flex: 1,
  },
  widgetNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 3,
    flexWrap: 'wrap',
  },
  widgetName: {
    fontSize: 12,
    fontWeight: '700',
    color: TACTICAL.text,
    letterSpacing: 0.3,
  },
  widgetDesc: {
    fontSize: 10,
    fontWeight: '500',
    color: TACTICAL.textMuted,
    lineHeight: 14,
  },

  // ── Badges ──
  coreBadge: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 3,
    backgroundColor: 'rgba(196,138,44,0.12)',
    borderWidth: 0.75,
    borderColor: 'rgba(196,138,44,0.25)',
  },
  coreBadgeText: {
    fontSize: 7,
    fontWeight: '800',
    color: GOLD.primary,
    letterSpacing: 1,
  },
  sizeBadge: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 3,
    backgroundColor: 'rgba(196,138,44,0.12)',
  },
  sizeBadgeText: {
    fontSize: 7,
    fontWeight: '800',
    color: GOLD.primary,
    letterSpacing: 0.8,
  },

  // ── Installed Badge ──
  installedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 6,
    backgroundColor: 'rgba(76,175,80,0.08)',
    borderWidth: 0.75,
    borderColor: 'rgba(76,175,80,0.2)',
  },
  installedText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#4CAF50',
    letterSpacing: 0.5,
  },

  // ── Add Badge ──
  addBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
    backgroundColor: 'rgba(255,255,255,0.02)',
  },
  addText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },

  // ── Reset Section ──
  resetSection: {
    marginTop: 24,
    alignItems: 'center',
  },
  resetDivider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.06)',
    width: '100%',
    marginBottom: 20,
  },
  resetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  resetBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: TACTICAL.textMuted,
    letterSpacing: 0.5,
  },
  resetHint: {
    fontSize: 9,
    fontWeight: '500',
    color: TACTICAL.textMuted,
    marginTop: 8,
    textAlign: 'center',
    opacity: 0.7,
  },
});



