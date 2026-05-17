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
import { TACTICAL, TYPO, DENSITY } from '../../lib/theme';
import {
  dashboardStore,
  GRID_LAYOUT_CONFIG,
  type DashboardMode,
  type DashboardProfile,
  type GridLayout,
} from '../../lib/dashboardStore';
import { useApp } from '../../context/AppContext';
import {
  checkRedundancy,
  filterDashboardWidgetPickerEntriesForReplacement,
  getDashboardLibraryWidgets,
  getDashboardWidgetPickerDisplayName,
  getDashboardSupportedSizes,
  isDuplicate,
} from '../../lib/widgetRegistry';
import { hasPremiumEntitlement, isPremiumWidget } from '../../lib/subscriptionAccess';

interface WidgetLibraryProps {
  visible: boolean;
  assignedWidgets: (string | null)[];
  onSelect: (type: string) => void;
  onClose: () => void;
  onCreateCustom: () => void;
  advancedModeEnabled?: boolean;
  dashboardMode?: DashboardMode;
  currentLayout?: GridLayout;
  intent?: 'add' | 'replace';
  targetSlotIndex?: number;
  currentWidgetType?: string | null;
}

export default function WidgetLibrary({
  visible,
  assignedWidgets,
  onSelect,
  onClose,
  onCreateCustom,
  advancedModeEnabled = false,
  dashboardMode = 'expedition',
  currentLayout = '2x2',
  intent = 'add',
  targetSlotIndex = 0,
  currentWidgetType = null,
}: WidgetLibraryProps) {
  void onCreateCustom;
  const router = useRouter();
  const { operatorInfo, showToast } = useApp();
  const dashboardProfile: DashboardProfile = dashboardMode === 'highway' ? 'vehicle' : 'expedition';

  const canLayoutHostWidget = useCallback((widgetId: string): boolean => {
    const config = GRID_LAYOUT_CONFIG[currentLayout];
    return getDashboardSupportedSizes(widgetId).some((size) => {
      if (size === '2x2') return config.cols >= 2 && config.rows >= 2;
      if (size === '2x1') return config.cols >= 2;
      if (size === '1x2') return config.rows >= 2;
      return true;
    });
  }, [currentLayout]);

  const assignedIds = assignedWidgets.filter(Boolean) as string[];
  const registryWidgets = useMemo(
    () => {
      const compatibleWidgets = getDashboardLibraryWidgets(advancedModeEnabled, dashboardMode)
        .filter((entry) =>
          canLayoutHostWidget(entry.widget_id) &&
          dashboardStore.canAssignWidget(dashboardProfile, targetSlotIndex, entry.widget_id)
        );
      return filterDashboardWidgetPickerEntriesForReplacement(
        compatibleWidgets,
        intent,
        currentWidgetType,
      );
    },
    [
      advancedModeEnabled,
      canLayoutHostWidget,
      currentWidgetType,
      dashboardMode,
      dashboardProfile,
      intent,
      targetSlotIndex,
    ],
  );
  const activeCount = assignedIds.length;
  const currentActionLabel = intent === 'replace' ? 'Replace' : 'Add';
  const currentSlotLabel = `SLOT ${targetSlotIndex + 1}`;
  const isAttitudeCommandCenterReplacement = intent === 'replace' && currentWidgetType === 'attitude-command';

  const handleWidgetSelect = (widgetId: string) => {
    if (isPremiumWidget(widgetId) && !hasPremiumEntitlement(operatorInfo)) {
      onClose();
      showToast('ECS Pro is required for that widget.');
      router.push('/pro' as any);
      return;
    }

    if (!isAttitudeCommandCenterReplacement && widgetId !== currentWidgetType && isDuplicate(widgetId, assignedWidgets)) {
      Alert.alert(
        'Already Active',
        'This widget is already active on the current dashboard.',
        [{ text: 'OK' }],
      );
      return;
    }

    if (!isAttitudeCommandCenterReplacement && !dashboardStore.canAssignWidget(dashboardProfile, targetSlotIndex, widgetId)) {
      Alert.alert(
        'Dashboard Region Full',
        'This dashboard region is full or cannot host that widget size. Remove or replace a widget before adding another.',
        [{ text: 'OK' }],
      );
      return;
    }

    const warnings = checkRedundancy(widgetId, assignedIds);
    if (!isAttitudeCommandCenterReplacement && warnings.length > 0) {
      Alert.alert(
        'Overlapping Data',
        `${warnings[0].message}\n\n${currentActionLabel} it anyway?`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: currentActionLabel, onPress: () => onSelect(widgetId) },
        ],
      );
      return;
    }

    onSelect(widgetId);
  };

  return (
    <TacticalPopupShell
      visible={visible}
      onClose={onClose}
      tier="global"
      icon="apps-outline"
      eyebrow="CURATED DASHBOARD"
      title={intent === 'replace' ? 'Replace Widget' : 'Add Widget'}
      subtitle="Choose a field-ready widget for this slot without changing the rest of the layout."
      overlayClass="workflow"
      maxWidth={900}
      maxHeightFraction={0.94}
      minHeightFraction={0.86}
      contentContainerStyle={styles.content}
      footer={
        <View style={styles.footerRow}>
          <Text style={styles.footerText}>
            {currentSlotLabel} • {activeCount} active • {registryWidgets.length} compatible field-ready widgets
          </Text>
        </View>
      }
    >
      <View style={styles.introCard}>
        <Text style={styles.introEyebrow}>
          WIDGET SET
        </Text>
        <Text style={styles.introTitle}>
          {intent === 'replace' ? `${currentSlotLabel} replacement` : `${currentSlotLabel} ready to fill`}
        </Text>
        <Text style={styles.introText}>
          {intent === 'replace'
            ? 'Choose a replacement for this slot. The new widget stays in this exact position and does not affect the rest of the layout.'
            : 'Choose a widget for this empty slot. Only this slot will be filled and the current layout stays unchanged.'}
        </Text>
      </View>

      {registryWidgets.map((entry) => {
        const isCurrentSlotWidget = !isAttitudeCommandCenterReplacement && currentWidgetType === entry.widget_id;
        const isAssignedElsewhere =
          !isAttitudeCommandCenterReplacement &&
          !isCurrentSlotWidget &&
          isDuplicate(entry.widget_id, assignedWidgets);
        const warnings = checkRedundancy(entry.widget_id, assignedIds);
        const hasRedundancy = warnings.length > 0 && !isAssignedElsewhere;
        const displayName =
          getDashboardWidgetPickerDisplayName(entry.widget_id, intent, currentWidgetType) ??
          entry.display_name;
        const actionLabel = isAttitudeCommandCenterReplacement
          ? 'SELECT'
          : isCurrentSlotWidget
            ? 'CURRENT'
            : isAssignedElsewhere
              ? 'ACTIVE'
              : currentActionLabel.toUpperCase();

        return (
          <TouchableOpacity
            key={entry.widget_id}
            style={[
              styles.widgetTile,
              isAssignedElsewhere && styles.widgetTileAssigned,
              isCurrentSlotWidget && styles.widgetTileCurrent,
            ]}
            onPress={() => handleWidgetSelect(entry.widget_id)}
            activeOpacity={0.75}
            disabled={isAssignedElsewhere || isCurrentSlotWidget}
          >
            <View style={styles.widgetIcon}>
              <Ionicons name={entry.icon as any} size={18} color={TACTICAL.amber} />
            </View>

            <View style={styles.widgetInfo}>
              <View style={styles.widgetNameRow}>
                <Text style={styles.widgetName} numberOfLines={1}>{displayName}</Text>
                {entry.default_size !== '1x1' ? (
                  <View style={styles.sizeBadge}>
                    <Text style={styles.sizeBadgeText} numberOfLines={1}>{entry.default_size.toUpperCase()}</Text>
                  </View>
                ) : null}
              </View>
              <Text style={styles.widgetDesc} numberOfLines={3}>{entry.description}</Text>
              {hasRedundancy ? (
                <Text style={styles.redundancyText} numberOfLines={2}>{warnings[0].message}</Text>
              ) : null}
            </View>

            {isAssignedElsewhere || isCurrentSlotWidget ? (
              <View style={styles.stateBadge}>
                <Text style={styles.stateBadgeText}>{actionLabel}</Text>
              </View>
            ) : (
              <View style={styles.actionBadge}>
                <Ionicons
                  name={intent === 'replace' ? 'swap-horizontal-outline' : 'add-circle-outline'}
                  size={16}
                  color={TACTICAL.amber}
                />
                <Text style={styles.actionBadgeText}>{actionLabel}</Text>
              </View>
            )}
          </TouchableOpacity>
        );
      })}
    </TacticalPopupShell>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: DENSITY.cardGap,
  },
  introCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(196,138,44,0.18)',
    backgroundColor: 'rgba(196,138,44,0.06)',
    padding: 14,
    gap: 6,
    marginBottom: 4,
  },
  introEyebrow: {
    ...TYPO.U2,
    color: TACTICAL.amber,
    letterSpacing: 2,
  },
  introTitle: {
    ...TYPO.T3,
    color: TACTICAL.text,
  },
  introText: {
    ...TYPO.B2,
    color: TACTICAL.textMuted,
    lineHeight: 16,
  },
  widgetTile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: DENSITY.iconTextGap,
    backgroundColor: TACTICAL.bg,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(196,138,44,0.12)',
    padding: DENSITY.cardPad,
    marginBottom: DENSITY.internalRowGap,
    minHeight: DENSITY.listRowHeight,
  },
  widgetTileAssigned: {
    opacity: 0.55,
  },
  widgetTileCurrent: {
    borderColor: 'rgba(196,138,44,0.24)',
    backgroundColor: 'rgba(196,138,44,0.08)',
  },
  widgetIcon: {
    width: DENSITY.iconBtnTap,
    height: DENSITY.iconBtnTap,
    borderRadius: 10,
    backgroundColor: 'rgba(196,138,44,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  widgetInfo: {
    flex: 1,
    gap: 4,
  },
  widgetNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  widgetName: {
    ...TYPO.T3,
    color: TACTICAL.text,
    flexShrink: 1,
  },
  widgetDesc: {
    ...TYPO.B2,
    fontSize: 10,
    color: TACTICAL.textMuted,
    lineHeight: 15,
  },
  sizeBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: 'rgba(196,138,44,0.12)',
  },
  sizeBadgeText: {
    ...TYPO.U2,
    fontSize: 7,
    color: TACTICAL.amber,
  },
  stateBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(196,138,44,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(196,138,44,0.20)',
  },
  stateBadgeText: {
    ...TYPO.U2,
    fontSize: 7,
    color: TACTICAL.textMuted,
  },
  actionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  actionBadgeText: {
    ...TYPO.U2,
    fontSize: 8,
    color: TACTICAL.amber,
  },
  redundancyText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#E67E22',
    lineHeight: 12,
  },
  footerRow: {
    alignItems: 'center',
  },
  footerText: {
    ...TYPO.B2,
    color: TACTICAL.textMuted,
    textAlign: 'center',
  },
});
