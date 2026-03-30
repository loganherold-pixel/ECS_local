/**
 * WidgetLibrary — Sliding Up Panel
 *
 * Lists available widgets (built-in + custom) with name + description.
 * Tap a widget to assign it to the target slot.
 * Includes "Create Custom Widget" button at top.
 *
 * GOVERNANCE RULES:
 * - Filters by tab_scope (dashboard_only, global only for dashboard)
 * - Hides emergency_only widgets from dashboard
 * - Hides widgets requiring advanced mode when disabled
 * - Shows redundancy warnings when data overlap detected
 * - Prevents duplicate widget placement (same widget_id)
 * - Shows WIDE, SENSOR, ADVANCED badges
 *
 * Categories: VEHICLE, MISSION, SAFETY, SUSTAINMENT, LOADOUT, CUSTOM
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
  Alert,
} from 'react-native';
import { SafeIcon as Ionicons } from '../SafeIcon';

import { TACTICAL, TYPO, DENSITY } from '../../lib/theme';

import { getFullWidgetCatalog, isCustomWidget, type WidgetType } from '../../lib/dashboardStore';
import { customWidgetStore } from '../../lib/customWidgetStore';
import {
  getDashboardLibraryWidgets,
  checkRedundancy,
  isDuplicate,
  getLibraryCategoryOrder,
  CATEGORY_LABELS,
  type WidgetRegistryEntry,
  type WidgetCategory,
} from '../../lib/widgetRegistry';

interface WidgetLibraryProps {
  visible: boolean;
  assignedWidgets: (string | null)[];
  onSelect: (type: string) => void;
  onClose: () => void;
  onCreateCustom: () => void;
  /** Whether Advanced Modeling mode is enabled */
  advancedModeEnabled?: boolean;
}

const SCREEN_H = Dimensions.get('window').height;

export default function WidgetLibrary({
  visible,
  assignedWidgets,
  onSelect,
  onClose,
  onCreateCustom,
  advancedModeEnabled = false,
}: WidgetLibraryProps) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(SCREEN_H)).current;
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (visible) {
      setRefreshKey(k => k + 1);
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

  if (!visible) return null;

  // Get governance-filtered widgets from registry
  const registryWidgets = getDashboardLibraryWidgets(advancedModeEnabled);
  const assignedIds = assignedWidgets.filter(Boolean) as string[];

  // Custom widgets from custom store
  const fullCatalog = getFullWidgetCatalog();
  const customWidgets = fullCatalog.filter(w => w.isCustom);

  // Group registry widgets by category
  const categoryOrder = getLibraryCategoryOrder();

  const handleDeleteCustom = (widgetId: string, widgetName: string) => {
    Alert.alert(
      'Delete Custom Widget',
      `Remove "${widgetName}" from the library? It will also be removed from any dashboard slots.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            customWidgetStore.delete(widgetId);
            setRefreshKey(k => k + 1);
          },
        },
      ]
    );
  };

  const handleWidgetSelect = (widgetId: string) => {
    // Check for duplicate
    if (isDuplicate(widgetId, assignedWidgets)) {
      Alert.alert(
        'Duplicate Widget',
        'This widget is already on your dashboard. Each widget can only be placed once.',
        [{ text: 'OK' }]
      );
      return;
    }

    // Check for redundancy
    const warnings = checkRedundancy(widgetId, assignedIds);
    if (warnings.length > 0) {
      Alert.alert(
        'Data Overlap Detected',
        warnings[0].message + '\n\nAdd anyway?',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Add Anyway', onPress: () => onSelect(widgetId) },
        ]
      );
      return;
    }

    onSelect(widgetId);
  };

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <Animated.View style={[styles.backdrop, { opacity: fadeAnim }]}>
        <TouchableOpacity style={StyleSheet.absoluteFill} onPress={onClose} activeOpacity={1} />
      </Animated.View>

      <Animated.View style={[styles.panel, { transform: [{ translateY: slideAnim }] }]}>
        <View style={styles.handleRow}>
          <View style={styles.handle} />
        </View>

        <View style={styles.titleRow}>
          <Ionicons name="apps-outline" size={18} color={TACTICAL.amber} />
          <Text style={styles.title}>WIDGET LIBRARY</Text>
          {advancedModeEnabled && (
            <View style={styles.advBadgeHeader}>
              <Text style={styles.advBadgeHeaderText}>ADV</Text>
            </View>
          )}
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <Ionicons name="close" size={20} color={TACTICAL.textMuted} />
          </TouchableOpacity>
        </View>

        <Text style={styles.subtitle}>Select a widget to assign to this slot</Text>

        <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
          {/* Create Custom Widget Button */}
          <TouchableOpacity style={styles.createBtn} onPress={onCreateCustom} activeOpacity={0.7}>
            <View style={styles.createIcon}>
              <Ionicons name="create-outline" size={20} color={TACTICAL.amber} />
            </View>
            <View style={styles.createInfo}>
              <Text style={styles.createTitle}>Create Custom Widget</Text>
              <Text style={styles.createDesc}>Define your own dashboard metric with custom data fields and thresholds</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={TACTICAL.amber} />
          </TouchableOpacity>

          {/* Custom Widgets Category */}
          {customWidgets.length > 0 && (
            <View>
              <Text style={styles.categoryLabel}>CUSTOM</Text>
              {customWidgets.map(widget => {
                const isAssigned = isDuplicate(widget.type, assignedWidgets);
                return (
                  <View key={widget.type} style={styles.customWidgetRow}>
                    <TouchableOpacity
                      style={[styles.widgetTile, isAssigned && styles.widgetTileAssigned, { flex: 1 }]}
                      onPress={() => handleWidgetSelect(widget.type)}
                      activeOpacity={0.6}
                    >
                      <View style={[styles.widgetIcon, { backgroundColor: 'rgba(196,138,44,0.12)' }]}>
                        <Ionicons name={widget.icon as any} size={20} color={TACTICAL.amber} />
                      </View>
                      <View style={styles.widgetInfo}>
                        <Text style={styles.widgetName}>{widget.name}</Text>
                        <Text style={styles.widgetDesc}>{widget.description}</Text>
                      </View>
                      {isAssigned ? (
                        <View style={styles.assignedBadge}>
                          <Text style={styles.assignedText}>PLACED</Text>
                        </View>
                      ) : (
                        <Ionicons name="add-circle-outline" size={20} color={TACTICAL.accent} />
                      )}
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.deleteBtn}
                      onPress={() => handleDeleteCustom(widget.type, widget.name)}
                      activeOpacity={0.6}
                    >
                      <Ionicons name="trash-outline" size={14} color={TACTICAL.danger} />
                    </TouchableOpacity>
                  </View>
                );
              })}
            </View>
          )}

          {/* Registry-based Categories */}
          {categoryOrder.map(catKey => {
            const catWidgets = registryWidgets.filter(w => w.category === catKey);
            if (catWidgets.length === 0) return null;

            const catLabel = CATEGORY_LABELS[catKey] || catKey.toUpperCase();

            return (
              <View key={catKey}>
                <Text style={styles.categoryLabel}>{catLabel}</Text>
                {catWidgets.map(entry => {
                  const isAssigned = isDuplicate(entry.widget_id, assignedWidgets);
                  const isWide = entry.default_size === '1x2';
                  const needsSensor = entry.requires_sensor !== 'none';
                  const isAdvanced = entry.requires_advanced_mode;

                  // Check redundancy warnings
                  const warnings = checkRedundancy(entry.widget_id, assignedIds);
                  const hasRedundancy = warnings.length > 0;

                  return (
                    <TouchableOpacity
                      key={entry.widget_id}
                      style={[
                        styles.widgetTile,
                        isAssigned && styles.widgetTileAssigned,
                      ]}
                      onPress={() => handleWidgetSelect(entry.widget_id)}
                      activeOpacity={0.6}
                    >
                      <View style={[
                        styles.widgetIcon,
                        catKey === 'safety' && { backgroundColor: 'rgba(192,57,43,0.08)' },
                        catKey === 'vehicle' && { backgroundColor: 'rgba(79,195,247,0.08)' },
                        catKey === 'sustainment' && { backgroundColor: 'rgba(196,138,44,0.12)' },
                        catKey === 'mission' && { backgroundColor: 'rgba(76,175,80,0.08)' },
                        catKey === 'loadout' && { backgroundColor: 'rgba(156,136,255,0.08)' },
                      ]}>
                        <Ionicons
                          name={entry.icon as any}
                          size={20}
                          color={
                            catKey === 'safety' ? TACTICAL.danger :
                            catKey === 'vehicle' ? '#4FC3F7' :
                            catKey === 'sustainment' ? TACTICAL.amber :
                            catKey === 'mission' ? '#4CAF50' :
                            catKey === 'loadout' ? '#9C88FF' :
                            TACTICAL.text
                          }
                        />
                      </View>
                      <View style={styles.widgetInfo}>
                        <View style={styles.widgetNameRow}>
                          <Text style={styles.widgetName}>{entry.display_name}</Text>
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
                          {isAdvanced && (
                            <View style={[styles.sizeBadge, { backgroundColor: 'rgba(156,136,255,0.12)' }]}>
                              <Text style={[styles.sizeBadgeText, { color: '#9C88FF' }]}>ADV</Text>
                            </View>
                          )}
                        </View>
                        <Text style={styles.widgetDesc}>{entry.description}</Text>
                        {/* Redundancy warning */}
                        {hasRedundancy && !isAssigned && (
                          <View style={styles.redundancyWarn}>
                            <Ionicons name="information-circle-outline" size={10} color="#E67E22" />
                            <Text style={styles.redundancyText}>{warnings[0].message}</Text>
                          </View>
                        )}
                      </View>
                      {isAssigned ? (
                        <View style={styles.assignedBadge}>
                          <Text style={styles.assignedText}>PLACED</Text>
                        </View>
                      ) : (
                        <Ionicons name="add-circle-outline" size={20} color={TACTICAL.accent} />
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            );
          })}
          <View style={{ height: 140 }} />
        </ScrollView>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.7)' },
  panel: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    height: SCREEN_H * 0.75,
    backgroundColor: TACTICAL.panel,
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    borderTopWidth: DENSITY.borderDefault, borderColor: TACTICAL.border,
  },
  handleRow: { alignItems: 'center', paddingTop: 10, paddingBottom: 6 },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.15)' },
  titleRow: {
    flexDirection: 'row', alignItems: 'center',
    gap: DENSITY.internalRowGap,
    paddingHorizontal: DENSITY.modalPad + 4,
    marginBottom: DENSITY.kpiLabelGap,
  },
  // T2 Widget Title
  title: {
    ...TYPO.T2,
    color: TACTICAL.text,
    flex: 1,
  },
  closeBtn: { padding: 4, width: DENSITY.iconBtnTap, height: DENSITY.iconBtnTap, alignItems: 'center', justifyContent: 'center' },
  // B2 Secondary
  subtitle: {
    ...TYPO.B2,
    color: TACTICAL.textMuted,
    paddingHorizontal: DENSITY.modalPad + 4,
    marginBottom: DENSITY.cardGap,
  },
  scroll: { flex: 1, paddingHorizontal: DENSITY.screenPad },

  // Advanced mode header badge
  advBadgeHeader: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: 'rgba(156,136,255,0.12)',
    borderWidth: DENSITY.borderDefault,
    borderColor: 'rgba(156,136,255,0.25)',
    height: DENSITY.chipHeight,
    justifyContent: 'center',
  },
  advBadgeHeaderText: {
    ...TYPO.U2,
    fontSize: 7,
    color: '#9C88FF',
  },

  // Create button
  createBtn: {
    flexDirection: 'row', alignItems: 'center',
    gap: DENSITY.iconTextGap,
    backgroundColor: 'rgba(196,138,44,0.06)', borderRadius: 12,
    borderWidth: DENSITY.borderActive, borderColor: 'rgba(196,138,44,0.25)',
    borderStyle: 'dashed',
    padding: DENSITY.cardPad,
    marginBottom: DENSITY.cardGap,
    minHeight: DENSITY.listRowHeight,
  },
  createIcon: {
    width: DENSITY.iconBtnTap, height: DENSITY.iconBtnTap, borderRadius: 10,
    backgroundColor: 'rgba(196,138,44,0.12)',
    alignItems: 'center', justifyContent: 'center',
  },
  createInfo: { flex: 1 },
  // T3 Card Title
  createTitle: {
    ...TYPO.T3,
    color: TACTICAL.amber,
    marginBottom: DENSITY.kpiLabelGap - 3,
  },
  // B2 Secondary
  createDesc: {
    ...TYPO.B2,
    fontSize: 10,
    color: TACTICAL.textMuted,
    lineHeight: 15,
  },

  // T4 Label for categories
  categoryLabel: {
    ...TYPO.T4,
    color: TACTICAL.amber,
    marginTop: DENSITY.sectionGap,
    marginBottom: DENSITY.internalRowGap,
    paddingBottom: 4,
    borderBottomWidth: DENSITY.borderDefault,
    borderBottomColor: 'rgba(196,138,44,0.15)',
  },

  // Widget tiles — Comfortable density list rows
  widgetTile: {
    flexDirection: 'row', alignItems: 'center',
    gap: DENSITY.iconTextGap,
    backgroundColor: TACTICAL.bg, borderRadius: 12,
    borderWidth: DENSITY.borderDefault, borderColor: TACTICAL.border,
    padding: DENSITY.cardPad,
    marginBottom: DENSITY.internalRowGap,
    minHeight: DENSITY.listRowHeight,
  },
  widgetTileAssigned: {
    opacity: 0.5,
    borderColor: 'rgba(255,255,255,0.04)',
  },
  widgetIcon: {
    width: DENSITY.iconBtnTap, height: DENSITY.iconBtnTap, borderRadius: 10,
    backgroundColor: 'rgba(62,79,60,0.2)',
    alignItems: 'center', justifyContent: 'center',
  },
  widgetInfo: { flex: 1 },
  widgetNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: DENSITY.kpiLabelGap - 3,
    flexWrap: 'wrap',
  },
  // T3 Card Title
  widgetName: {
    ...TYPO.T3,
    color: TACTICAL.text,
  },
  // B2 Secondary
  widgetDesc: {
    ...TYPO.B2,
    fontSize: 10,
    color: TACTICAL.textMuted,
    lineHeight: 15,
  },
  assignedBadge: {
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  // U2 Chip/Badge
  assignedText: {
    ...TYPO.U2,
    fontSize: 7,
    color: TACTICAL.textMuted,
  },

  // Size badge
  sizeBadge: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 3,
    backgroundColor: 'rgba(196,138,44,0.12)',
    height: 18,
    justifyContent: 'center',
  },
  sizeBadgeText: {
    ...TYPO.U2,
    fontSize: 7,
    color: TACTICAL.amber,
  },

  // Redundancy warning
  redundancyWarn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 3,
    backgroundColor: 'rgba(230,126,34,0.08)',
    alignSelf: 'flex-start',
  },
  redundancyText: {
    fontSize: 8,
    fontWeight: '600',
    color: '#E67E22',
    lineHeight: 12,
  },

  // Custom widget row with delete
  customWidgetRow: {
    flexDirection: 'row', alignItems: 'center',
    gap: 6,
    marginBottom: DENSITY.internalRowGap,
  },
  deleteBtn: {
    width: 32, height: 32, borderRadius: 8,
    backgroundColor: 'rgba(192,57,43,0.08)',
    borderWidth: DENSITY.borderDefault,
    borderColor: 'rgba(192,57,43,0.2)',
    alignItems: 'center', justifyContent: 'center',
  },
});



