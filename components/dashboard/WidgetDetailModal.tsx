/**
 * WidgetDetailModal — Sliding up lower panel
 *
 * Shows expanded metrics + quick actions for a widget.
 * Includes a small gear icon to expand settings section.
 * Disabled during layout mode.
 *
 * GOVERNANCE:
 * - Respects widget removable flag from registry
 * - Shows per-widget auto-collapse toggle
 * - Shows advanced mode indicator
 * - Shows widget category and scope metadata
 *
 * Passes render options (accelerometer data, dashboard mode, advancedMode) to detail renderers.
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Dimensions,
  ScrollView,
  Switch,
  Platform,
} from 'react-native';
import { SafeIcon as Ionicons } from '../SafeIcon';


import { TACTICAL } from '../../lib/theme';
import { getFullWidgetCatalog, dashboardStore, type WidgetSlot } from '../../lib/dashboardStore';
import { getWidgetEntry, CATEGORY_LABELS } from '../../lib/widgetRegistry';

import { renderWidgetDetail, type WidgetRenderOptions } from './WidgetRenderers';
import type { Trip, LoadItem, RiskScore, Waypoint, UserSettings } from '../../lib/types';

interface WidgetDetailModalProps {
  visible: boolean;
  slot: WidgetSlot | null;
  widgetData: {
    activeTrip: Trip | null;
    loadItems: LoadItem[];
    riskScore: RiskScore | null;
    waypoints: Waypoint[];
    userSettings: UserSettings | null;
    syncStatus: string;
  };
  renderOptions?: WidgetRenderOptions;
  onClose: () => void;
  onRemove: () => void;
}
// Safe area fallback for bottom inset (home indicator / nav bar)
const SAFE_BOTTOM = Platform.select({ ios: 34, android: 48, default: 0 }) ?? 0;

// Static screen height for animation initial values (always off-screen)
const SCREEN_H = Dimensions.get('window').height;


export default function WidgetDetailModal({ visible, slot, widgetData, renderOptions, onClose, onRemove }: WidgetDetailModalProps) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(SCREEN_H)).current;
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    if (visible) {
      setShowSettings(false);
      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
        Animated.spring(slideAnim, { toValue: 0, friction: 12, tension: 65, useNativeDriver: true }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 0, duration: 150, useNativeDriver: true }),
        Animated.timing(slideAnim, { toValue: SCREEN_H, duration: 150, useNativeDriver: true }),
      ]).start();
    }
  }, [visible]);

  if (!visible || !slot || !slot.widgetType) return null;

  const widgetDef = getFullWidgetCatalog().find(w => w.type === slot.widgetType);
  if (!widgetDef) return null;

  // Registry metadata
  const registryEntry = getWidgetEntry(slot.widgetType);
  const canRemove = true; // All widgets are now user-manageable — no locked state

  const isAdvanced = registryEntry?.requires_advanced_mode;
  const supportsCompact = registryEntry?.supports_compact !== false;
  const category = registryEntry?.category;
  const categoryLabel = category ? CATEGORY_LABELS[category] : 'UNKNOWN';

  // Per-widget auto-collapse
  const widgetAutoCollapse = slot.widgetType
    ? dashboardStore.getWidgetAutoCollapse(slot.widgetType)
    : true;

  const handleWidgetAutoCollapseToggle = (val: boolean) => {
    if (slot.widgetType) {
      dashboardStore.setWidgetAutoCollapse(slot.widgetType, val);
    }
  };

  // Dynamic maxHeight accounting for safe areas
  const dynamicMaxH = Dimensions.get('window').height * 0.70 - SAFE_BOTTOM;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {/* Backdrop */}
      <Animated.View style={[styles.backdrop, { opacity: fadeAnim }]}>
        <TouchableOpacity style={StyleSheet.absoluteFill} onPress={onClose} activeOpacity={1} />
      </Animated.View>

      {/* Panel */}
      <Animated.View style={[styles.panel, { maxHeight: dynamicMaxH, transform: [{ translateY: slideAnim }] }]}>

        {/* Handle */}
        <View style={styles.handleRow}>
          <View style={styles.handle} />
        </View>

        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerIcon}>
            <Ionicons name={widgetDef.icon as any} size={20} color={TACTICAL.amber} />
          </View>
          <View style={styles.headerInfo}>
            <View style={styles.headerTitleRow}>
              <Text style={styles.headerTitle}>{widgetDef.name}</Text>
              {isAdvanced && (
                <View style={styles.advBadge}>
                  <Text style={styles.advBadgeText}>ADV</Text>
                </View>
              )}
            </View>
            <Text style={styles.headerDesc}>{widgetDef.description}</Text>
          </View>
          <View style={styles.headerActions}>
            <TouchableOpacity
              style={styles.gearBtn}
              onPress={() => setShowSettings(!showSettings)}
              activeOpacity={0.7}
            >
              <Ionicons name="settings-outline" size={16} color={showSettings ? TACTICAL.amber : TACTICAL.textMuted} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
              <Ionicons name="close" size={20} color={TACTICAL.textMuted} />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.divider} />

        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          {/* Expanded Widget Content */}
          {renderWidgetDetail(slot.widgetType, widgetData, renderOptions)}

          {/* Settings Section */}
          {showSettings && (
            <View style={styles.settingsSection}>
              <View style={styles.divider} />
              <Text style={styles.settingsTitle}>WIDGET SETTINGS</Text>

              {/* Widget metadata */}
              <View style={styles.metaRow}>
                <Text style={styles.metaLabel}>CATEGORY</Text>
                <Text style={styles.metaValue}>{categoryLabel}</Text>
              </View>
              <View style={styles.metaRow}>
                <Text style={styles.metaLabel}>SIZE</Text>
                <Text style={styles.metaValue}>{registryEntry?.default_size === '1x2' ? 'WIDE (1x2)' : 'STANDARD (1x1)'}</Text>
              </View>
              {registryEntry?.requires_sensor !== 'none' && (
                <View style={styles.metaRow}>
                  <Text style={styles.metaLabel}>SENSOR</Text>
                  <Text style={styles.metaValue}>{registryEntry?.requires_sensor?.toUpperCase()}</Text>
                </View>
              )}

              {/* Per-widget auto-collapse toggle */}
              {supportsCompact && (
                <View style={styles.settingRow}>
                  <Ionicons name="contract-outline" size={14} color={TACTICAL.textMuted} />
                  <Text style={styles.settingLabel}>Auto-collapse when stopped</Text>
                  <Switch
                    value={widgetAutoCollapse}
                    onValueChange={handleWidgetAutoCollapseToggle}
                    trackColor={{ false: 'rgba(255,255,255,0.08)', true: 'rgba(196,138,44,0.3)' }}
                    thumbColor={widgetAutoCollapse ? TACTICAL.amber : TACTICAL.textMuted}
                    style={{ transform: [{ scaleX: 0.7 }, { scaleY: 0.7 }] }}
                  />
                </View>
              )}

              {/* Remove button — only if removable */}
              {canRemove ? (
                <TouchableOpacity style={styles.removeBtn} onPress={onRemove} activeOpacity={0.7}>
                  <Ionicons name="trash-outline" size={14} color={TACTICAL.danger} />
                  <Text style={styles.removeText}>REMOVE FROM DASHBOARD</Text>
                </TouchableOpacity>
              ) : (
                <View style={styles.lockedRow}>
                  <Ionicons name="lock-closed-outline" size={12} color={TACTICAL.textMuted} />
                  <Text style={styles.lockedText}>This widget cannot be removed</Text>
                </View>
              )}
            </View>
          )}

          <View style={{ height: 20 + SAFE_BOTTOM }} />

        </ScrollView>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  panel: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    maxHeight: SCREEN_H * 0.65,
    backgroundColor: TACTICAL.panel,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 1,
    borderColor: TACTICAL.border,
  },
  handleRow: {
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 4,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 20,
    paddingVertical: 8,
  },
  headerIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(196,138,44,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerInfo: {
    flex: 1,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  headerTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: TACTICAL.text,
    letterSpacing: 0.5,
  },
  headerDesc: {
    fontSize: 10,
    color: TACTICAL.textMuted,
    marginTop: 1,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  gearBtn: {
    padding: 4,
  },
  closeBtn: {
    padding: 4,
  },
  divider: {
    height: 1,
    backgroundColor: TACTICAL.border,
    marginHorizontal: 20,
    marginVertical: 4,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  settingsSection: {
    marginTop: 12,
  },
  settingsTitle: {
    fontSize: 10,
    fontWeight: '800',
    color: TACTICAL.amber,
    letterSpacing: 2,
    marginTop: 8,
    marginBottom: 8,
  },

  // Widget metadata
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 3,
  },
  metaLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: TACTICAL.textMuted,
    letterSpacing: 1,
  },
  metaValue: {
    fontSize: 9,
    fontWeight: '800',
    color: TACTICAL.text,
    letterSpacing: 0.5,
  },

  // Per-widget setting row
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
    marginBottom: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.02)',
  },
  settingLabel: {
    flex: 1,
    fontSize: 10,
    fontWeight: '600',
    color: TACTICAL.text,
  },

  // Advanced badge
  advBadge: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 3,
    backgroundColor: 'rgba(156,136,255,0.12)',
  },
  advBadgeText: {
    fontSize: 7,
    fontWeight: '900',
    color: '#9C88FF',
    letterSpacing: 1,
  },

  removeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
    marginTop: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(192,57,43,0.25)',
    backgroundColor: 'rgba(192,57,43,0.06)',
  },
  removeText: {
    fontSize: 10,
    fontWeight: '800',
    color: TACTICAL.danger,
    letterSpacing: 1.5,
  },

  // Locked (non-removable)
  lockedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 8,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.02)',
  },
  lockedText: {
    fontSize: 10,
    fontWeight: '600',
    color: TACTICAL.textMuted,
    fontStyle: 'italic',
  },
});



