import React, { useCallback, useMemo } from 'react';
import {
  Alert,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeIcon as Ionicons } from '../SafeIcon';
import TacticalPopupShell from '../TacticalPopupShell';
import { TACTICAL, TYPO } from '../../lib/theme';
import { useApp } from '../../context/AppContext';
import {
  dashboardStore,
  GRID_LAYOUT_CONFIG,
  type DashboardProfile,
  type GridLayout,
} from '../../lib/dashboardStore';
import {
  getDashboardLibraryWidgets,
  getDashboardSupportedSizes,
  isDuplicate,
  type WidgetRegistryEntry,
} from '../../lib/widgetRegistry';
import { hasPremiumEntitlement, isPremiumWidget } from '../../lib/subscriptionAccess';

interface WidgetLibraryManagerProps {
  visible: boolean;
  onClose: () => void;
  activeTab: 'widgets' | 'brief' | 'expedition';
  expeditionWidgets: (string | null)[];
  onWidgetAdded: (profile: DashboardProfile, widgetType: string) => void;
  onLayoutReset: (profile: DashboardProfile) => void;
  advancedModeEnabled?: boolean;
}

export default function WidgetLibraryManager({
  visible,
  onClose,
  activeTab,
  expeditionWidgets,
  onWidgetAdded,
  onLayoutReset,
  advancedModeEnabled = false,
}: WidgetLibraryManagerProps) {
  const router = useRouter();
  const { operatorInfo, showToast } = useApp();
  const canLayoutHostWidget = useCallback((widgetId: string, layout: GridLayout): boolean => {
    const config = GRID_LAYOUT_CONFIG[layout];
    return getDashboardSupportedSizes(widgetId).some((size) => {
      if (size === '2x2') return config.cols >= 2 && config.rows >= 2;
      if (size === '2x1') return config.cols >= 2;
      if (size === '1x2') return config.rows >= 2;
      return true;
    });
  }, []);
  const expeditionLayout = dashboardStore.getGridLayout('expedition');
  const slots = dashboardStore.getProfileSlots('expedition');
  const targetSlotIndex = slots.findIndex(slot => !slot.widgetType);
  const widgetLibraryItems = useMemo(
    () => getDashboardLibraryWidgets(advancedModeEnabled, 'expedition')
      .filter((entry) =>
        targetSlotIndex >= 0 &&
        canLayoutHostWidget(entry.widget_id, expeditionLayout) &&
        dashboardStore.canAssignWidget('expedition', targetSlotIndex, entry.widget_id)
      ),
    [advancedModeEnabled, canLayoutHostWidget, expeditionLayout, targetSlotIndex],
  );

  const handleAddWidget = useCallback(
    (widgetId: string) => {
      if (isPremiumWidget(widgetId) && !hasPremiumEntitlement(operatorInfo)) {
        onClose();
        showToast('ECS Pro is required for that widget.');
        router.push('/pro' as any);
        return;
      }

      const profile: DashboardProfile = 'expedition';
      const currentWidgets = expeditionWidgets;

      if (isDuplicate(widgetId, currentWidgets)) {
        Alert.alert('Already Installed', 'That widget is already active on this dashboard.', [{ text: 'OK' }]);
        return;
      }

      const slots = dashboardStore.getProfileSlots(profile);
      const layout = dashboardStore.getGridLayout(profile);
      const maxSlots = GRID_LAYOUT_CONFIG[layout]?.total || 6;
      const targetSlotIndex = slots.findIndex(slot => !slot.widgetType);

      if (targetSlotIndex === -1 || targetSlotIndex >= maxSlots) {
        Alert.alert(
          'Dashboard Full',
          'This dashboard region is full or cannot host that widget size. Remove or replace a widget before adding another.',
          [{ text: 'OK' }],
        );
        return;
      }

      if (!dashboardStore.canAssignWidget(profile, targetSlotIndex, widgetId)) {
        Alert.alert(
          'Dashboard Region Full',
          'This dashboard region is full or cannot host that widget size. Remove or replace a widget before adding another.',
          [{ text: 'OK' }],
        );
        return;
      }

      const assigned = dashboardStore.assignWidget(profile, targetSlotIndex, widgetId);
      if (!assigned) {
        Alert.alert(
          'Layout Incompatible',
          'This widget requires an available dashboard region that can host its canonical size.',
          [{ text: 'OK' }],
        );
        return;
      }

      onWidgetAdded(profile, widgetId);
    },
    [expeditionWidgets, onClose, onWidgetAdded, operatorInfo, router, showToast],
  );

  const handleResetLayout = useCallback(() => {
    Alert.alert(
      'Reset Dashboard Layouts?',
      'This restores the curated Widgets defaults and keeps the library limited to the field-ready widget set.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Restore Defaults',
          style: 'destructive',
          onPress: () => {
            dashboardStore.restoreDefaults('expedition');
            onLayoutReset('expedition');
            onClose();
          },
        },
      ],
    );
  }, [onClose, onLayoutReset]);

  return (
    <TacticalPopupShell
      visible={visible}
      onClose={onClose}
      tier="global"
      icon="grid-outline"
      eyebrow="DASHBOARD SYSTEM"
      title="Widget Manager"
      subtitle="Install curated field widgets in one configurable dashboard area."
      overlayClass="workflow"
      maxWidth={980}
      maxHeightFraction={0.94}
      minHeightFraction={0.86}
      contentContainerStyle={styles.content}
      footer={
        <View style={styles.footer}>
          <TouchableOpacity style={styles.resetBtn} onPress={handleResetLayout} activeOpacity={0.8}>
            <Ionicons name="refresh-outline" size={14} color={TACTICAL.textMuted} />
            <Text style={styles.resetBtnText}>Restore curated defaults</Text>
          </TouchableOpacity>
          <Text style={styles.footerHint}>
            Active tab: {activeTab === 'brief' ? 'ECS Brief' : activeTab === 'widgets' ? 'Widgets' : 'Expedition'}
          </Text>
        </View>
      }
    >
      <SectionCard
        title="Widgets"
        subtitle="Trail-ready essentials, travel conditions, and live vehicle awareness"
        icon="apps-outline"
        count={widgetLibraryItems.length}
        widgets={widgetLibraryItems}
        installedWidgets={expeditionWidgets}
        accentColor={TACTICAL.amber}
        onAdd={handleAddWidget}
      />
    </TacticalPopupShell>
  );
}

function SectionCard({
  title,
  subtitle,
  icon,
  count,
  widgets,
  installedWidgets,
  accentColor,
  onAdd,
}: {
  title: string;
  subtitle: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  count: number;
  widgets: WidgetRegistryEntry[];
  installedWidgets: (string | null)[];
  accentColor: string;
  onAdd: (widgetId: string) => void;
}) {
  return (
    <View style={styles.sectionCard}>
      <View style={styles.sectionHeader}>
        <View style={[styles.sectionIconWrap, { backgroundColor: `${accentColor}18` }]}>
          <Ionicons name={icon} size={14} color={accentColor} />
        </View>
        <View style={styles.sectionTitleWrap}>
          <Text style={[styles.sectionTitle, { color: accentColor }]} numberOfLines={1}>{title}</Text>
          <Text style={styles.sectionSubtitle} numberOfLines={2}>{subtitle}</Text>
        </View>
        <View style={styles.sectionCount}>
          <Text style={styles.sectionCountText}>{count}</Text>
        </View>
      </View>

      {widgets.map(entry => {
        const isInstalled = isDuplicate(entry.widget_id, installedWidgets);

        return (
          <TouchableOpacity
            key={entry.widget_id}
            style={[styles.widgetTile, isInstalled && styles.widgetTileInstalled]}
            onPress={() => {
              if (!isInstalled) onAdd(entry.widget_id);
            }}
            activeOpacity={isInstalled ? 1 : 0.75}
          >
            <View style={[styles.widgetIcon, { backgroundColor: `${accentColor}14` }]}>
              <Ionicons
                name={entry.icon as any}
                size={16}
                color={isInstalled ? TACTICAL.textMuted : accentColor}
              />
            </View>

            <View style={styles.widgetInfo}>
              <View style={styles.widgetNameRow}>
                <Text style={[styles.widgetName, isInstalled && styles.widgetNameInstalled]} numberOfLines={1}>
                  {entry.display_name}
                </Text>
                {entry.default_size !== '1x1' ? (
                  <View style={styles.sizeBadge}>
                    <Text style={styles.sizeBadgeText} numberOfLines={1}>{entry.default_size.toUpperCase()}</Text>
                  </View>
                ) : null}
              </View>
              <Text style={styles.widgetDesc} numberOfLines={3}>{entry.description}</Text>
            </View>

            {isInstalled ? (
              <View style={styles.installedBadge}>
                <Ionicons name="checkmark-circle" size={12} color="#4CAF50" />
                <Text style={styles.installedText}>Installed</Text>
              </View>
            ) : (
              <View style={[styles.addBadge, { borderColor: `${accentColor}35` }]}>
                <Ionicons name="add" size={14} color={accentColor} />
                <Text style={[styles.addText, { color: accentColor }]}>Add</Text>
              </View>
            )}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: 14,
  },
  sectionCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(196,138,44,0.12)',
    backgroundColor: 'rgba(255,255,255,0.02)',
    padding: 14,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  sectionIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitleWrap: {
    flex: 1,
    minWidth: 0,
  },
  sectionTitle: {
    ...TYPO.T3,
  },
  sectionSubtitle: {
    ...TYPO.B2,
    color: TACTICAL.textMuted,
    marginTop: 2,
  },
  sectionCount: {
    minWidth: 28,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.05)',
    alignItems: 'center',
  },
  sectionCountText: {
    ...TYPO.U2,
    color: TACTICAL.text,
  },
  widgetTile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: TACTICAL.bg,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    padding: 12,
    marginBottom: 8,
  },
  widgetTileInstalled: {
    borderColor: 'rgba(76,175,80,0.14)',
    backgroundColor: 'rgba(76,175,80,0.04)',
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
    ...TYPO.T3,
    color: TACTICAL.text,
    flexShrink: 1,
  },
  widgetNameInstalled: {
    color: TACTICAL.textMuted,
  },
  widgetDesc: {
    ...TYPO.B2,
    fontSize: 10,
    color: TACTICAL.textMuted,
    lineHeight: 15,
  },
  sizeBadge: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
    backgroundColor: 'rgba(196,138,44,0.12)',
  },
  sizeBadgeText: {
    ...TYPO.U2,
    fontSize: 7,
    color: TACTICAL.amber,
  },
  installedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 6,
    backgroundColor: 'rgba(76,175,80,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(76,175,80,0.2)',
  },
  installedText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#4CAF50',
  },
  addBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
    backgroundColor: 'rgba(255,255,255,0.02)',
  },
  addText: {
    fontSize: 10,
    fontWeight: '700',
  },
  footer: {
    gap: 8,
  },
  resetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  resetBtnText: {
    ...TYPO.B2,
    color: TACTICAL.textMuted,
    fontWeight: '700',
  },
  footerHint: {
    ...TYPO.B2,
    color: TACTICAL.textMuted,
    textAlign: 'center',
  },
});
