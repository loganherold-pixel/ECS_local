/**
 * Cockpit Dashboard — /dashboard
 *
 * Tactical, clean, infrastructure-focused dashboard with Widgets/ECS Brief/Expedition tabs.
 *
 * Features:
 * - Widgets / ECS Brief / Expedition tab toggle with smooth micro-animation
 * - Widgets default: existing Expedition profile defaults and user-selected widgets
 * - Former Highway widgets are selectable in the Widgets library
 * - Fill-height 2x2 grid with no dead space

 * - Smart re-expand: only on verified sustained vehicle movement
 * - "Vehicle Movement Detected" banner on re-expand
 * - Accelerometer integration for stability + attitude widgets
 * - All widgets user-replaceable and reorderable
 * - Shared dashboard controls for layout, restore defaults, and widget governance
 * - Widget Governance: tab isolation, redundancy prevention, restore defaults
 * - Per-tab empty state with Customize CTA
 * - Theme-aware: uses palette from ThemeContext
 * - Adaptive brightness affects all widgets, text, icons, indicators
 * - Rotation / resize aware: useWindowDimensions listener re-measures
 *   container dimensions and recalculates widget placements automatically
 * - Expedition state integration: subscribes to expeditionStateStore,
 *   preserves completed expedition state for debrief/PDF flows
 * - Geofence monitor: auto-starts expedition on configurable radius exit
 *   (100m–2000m, default 400m), auto-ends on re-entry
 * - Phase 5: Context-aware auto-activation with 30s sustained conditions,
 *   geofence exit signal, route type signal, mode activation banners,
 *   CarPlay/Android Auto sync, manual override indicator
 */
 
import React, { useState, useCallback, useEffect, useRef, useMemo, useLayoutEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Alert,
  Platform,
  LayoutChangeEvent,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';


import { useFocusEffect, useIsFocused } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import { SafeIcon as Ionicons } from '../../components/SafeIcon';
import { DiscoverIcon } from '../../components/DockIcons';
import TabErrorBoundary from '../../components/TabErrorBoundary';

import { TACTICAL, GOLD_RAIL } from '../../lib/theme';

import { useApp } from '../../context/AppContext';
import { useTheme } from '../../context/ThemeContext';
import {
  dashboardStore,
  isDashboardHydrated,
  waitForDashboardHydration,
  GRID_LAYOUT_CONFIG,
  isExpeditionTacticalActive,
  WIDGET_SIZE_CONFIG,
  detectResizeCollision,
  getFullWidgetCatalog,
  getSlotSize,
  type DashboardProfile,
  type WidgetSlot,
  type WidgetSize,
  type GridLayout,
  type DashboardMode,
  type ResizeCollisionInfo,
} from '../../lib/dashboardStore';




import { useAccelerometer } from '../../lib/useAccelerometer';
import DashboardHeader from '../../components/dashboard/DashboardHeader';
import WidgetGrid from '../../components/dashboard/WidgetGrid';
import WidgetLibrary from '../../components/dashboard/WidgetLibrary';
import WidgetDetailModal from '../../components/dashboard/WidgetDetailModal';
import WidgetManagePopover from '../../components/dashboard/WidgetManagePopover';
import CreateCustomWidgetModal from '../../components/dashboard/CreateCustomWidgetModal';
import GridLayoutPicker from '../../components/dashboard/GridLayoutPicker';
import AuthModal from '../../components/AuthModal';
import Toast from '../../components/Toast';
import { ECSStateMessage } from '../../components/ECSStateMessage';
import CollisionWarningModal from '../../components/dashboard/CollisionWarningModal';
import ExpeditionTimelinePanel from '../../components/expedition/ExpeditionTimelinePanel';
import ModeActivationBanner from '../../components/dashboard/ModeActivationBanner';
import AutoModeToggle from '../../components/dashboard/AutoModeToggle';
import ECSIntelligenceReadout from '../../components/dashboard/ECSIntelligenceReadout';
import OfflineStateBanner from '../../components/offline/OfflineStateBanner';
import { CommandBriefScreen } from '../../components/brief';
import ExpeditionTab from '../../components/dashboard/ExpeditionTab';
import type { MissionBrief } from '../../lib/missionBriefEngine';
import { useEcsTopBannerHeight } from '../../components/ECSGlobalBanner';



import { offlineExpeditionModeEngine } from '../../lib/offlineExpeditionModeEngine';
import { dashboardModeEngine, type ModeEngineOutput } from '../../lib/dashboardModeEngine';
import { tripRecorderEngine } from '../../lib/tripRecorderEngine';

import { advisoryStore } from '../../lib/advisoryStore';
import { isLowValueTelemetryDegradedSummary } from '../../lib/ai/degradedOperationsEngine';
import { useECSAI } from '../../lib/ai/useECSAI';
import {
  selectBriefCommandState,
  type BriefCommandState,
} from '../../lib/ai/briefSelectors';
import { recordBriefCadEntry } from '../../lib/briefCadLogStore';
import { resetIntelligence } from '../../lib/assistantIntelligenceEngine';
import { bluPowerAuthority } from '../../lib/BluPowerAuthority';
import {
  selectDashboardCommandState,
  type DashboardCommandState,
} from '../../lib/dashboardCommandSelectors';
import { remotenessStore } from '../../lib/remotenessStore';
import { routeStore } from '../../lib/routeStore';
import { loadRoadNavigationSession } from '../../lib/roadNavigationStore';
import { loadTrailNavigationSession } from '../../lib/trailNavigationStore';
import { resolveTopBannerPresentation } from '../../lib/ui/topBannerStatusResolver';
import { useThrottledGPS } from '../../lib/useThrottledGPS';
import { useOperationalWeather } from '../../lib/useOperationalWeather';
import { buildUnifiedWeatherCorridor } from '../../lib/weatherSurfaceSelectors';
import { useVehicleTelemetry } from '../../src/vehicle-telemetry/useVehicleTelemetry';
import { useUnifiedOBD2Scanner } from '../../lib/unifiedScanner';
import { useRouteCorridorWeather } from '../../components/navigate/RouteCorridorWeather';



import {
  expeditionStateStore,
  type ExpeditionState,
  type ExpeditionRecord,
} from '../../lib/expeditionStateStore';
import { getActiveVehicleContext } from '../../lib/activeVehicleContext';
import { consumablesStore } from '../../lib/consumablesStore';
import { loadoutItemStore, loadoutStore } from '../../lib/loadoutStore';
import { tiresLiftStore } from '../../lib/tiresLiftStore';
import { vehicleSetupStore } from '../../lib/vehicleSetupStore';
import { vehicleSpecStore } from '../../lib/vehicleSpecStore';
import { vehicleStore } from '../../lib/vehicleStore';
import { useGeofenceMonitor } from '../../lib/useGeofenceMonitor';
import ResourceAlertBanner from '../../components/ResourceAlertBanner';
import type { LoadItem, Vehicle } from '../../lib/types';
import { setupStore } from '../../lib/setupStore';
import { getEcsTopBannerLayoutMetrics, getShellBottomClearance } from '../../lib/shellLayout';
import { ecsCommandModuleStore } from '../../lib/ecsCommandModuleStore';
import { ECS_CTA_LABELS, ECS_STATE_COPY } from '../../lib/ecsStateCopy';
import { consumeNavigationFlow, stageNavigationFlow } from '../../lib/ecsNavigationFlow';
import { saveNavigationHandoffPayload } from '../../lib/navigationHandoffStore';
import {
  buildRemotenessDestinationNavigationPayload,
  getRemotenessNavigationLabel,
  getRemotenessNavigationUnavailableMessage,
  type RemotenessNavigationTargetType,
} from '../../lib/remotenessEmergencyRouting';
import {
  mapRemotenessTargetToDestinationType,
  resolveRemotenessDestination,
} from '../../lib/remotenessDestinations';
import {
  setDashboardExpanded,
} from '../../lib/dashboardChromeStore';
import { useAdaptiveLayout } from '../../lib/useAdaptiveLayout';
import { ecsLog } from '../../lib/ecsLogger';
import { EASING, MOTION } from '../../lib/motion';
import { useStableAnimatedValue } from '../../lib/ecsAnimations';






// ── Auto-collapse constants ────────────────────────────
const STATIONARY_THRESHOLD_MS = 20000; // 20 seconds
const MOTION_THRESHOLD_DEG = 0.5;      // near-zero movement threshold

// ── Smart re-expand constants ──────────────────────────
const SUSTAINED_MOTION_THRESHOLD_DEG = 2.5;
const SUSTAINED_MOTION_DURATION_MS = 3000;
const MOVEMENT_BANNER_DURATION_MS = 3000;

// ── Phase 9: Tab animation constants (refined timing) ──────
const TAB_ANIM_DURATION = MOTION.screenTransition;

const TAB_SLIDE_PX = MOTION.screenShiftPx;
const DASHBOARD_WIDGET_FRAME_EDGE_MARGIN = 2;
const DASHBOARD_EXPANDED_TOP_SAFE_GAP = 8;
const DASHBOARD_CUSTOMIZE_STACK_ESTIMATED_HEIGHT = 38;

// ── Mode Color Cues ────────────────────────────────────
// Dashboard tab accents come from the ECS tactical palette.

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function normalizeVisibleEcsCopy(value: string | null | undefined): string {
  if (!value) return '';
  return value
    .replace(/\bECS\s+AI\b/g, 'ECS')
    .replace(/\bECS\s+ai\b/g, 'ECS')
    .replace(/\bAI\b/g, 'ECS')
    .replace(/\bai\b/g, 'ecs')
    .replace(/\bA\/I\b/g, 'ECS');
}

function condenseDashboardLaneCopy(value: string | null | undefined, maxLength = 96): string {
  const normalized = normalizeVisibleEcsCopy(value)
    .replace(/\s*\|\s*/g, ' | ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!normalized) return '';
  if (normalized.length <= maxLength) return normalized;

  const firstCompleteThought = normalized
    .split(/(?<=[.!?])\s+| • | \| /)
    .map((part) => part.trim())
    .find((part) => part.length >= 24 && part.length <= maxLength);

  if (firstCompleteThought) return firstCompleteThought;

  return `${normalized.slice(0, Math.max(32, maxLength - 1)).trimEnd()}…`;
}

function pickDashboardLaneDetail(...values: (string | null | undefined)[]): string | null {
  const seen = new Set<string>();
  for (const value of values) {
    const condensed = condenseDashboardLaneCopy(value);
    if (!condensed) continue;
    const fingerprint = condensed.toLowerCase();
    if (seen.has(fingerprint)) continue;
    seen.add(fingerprint);
    return condensed;
  }
  return null;
}

function buildDashboardAdvisoryId(...parts: (string | null | undefined)[]): string {
  const slug = parts
    .map((value) =>
      String(value ?? '')
        .toLowerCase()
        .replace(/\becs\b/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, ''),
    )
    .filter(Boolean)
    .join(':');
  return slug ? `ecs-ai:${slug}` : 'ecs-ai:status';
}

function summarizeMissionBriefLogEntry(
  brief: MissionBrief | null,
  commandState: BriefCommandState | null,
): { id: string; message: string } | null {
  const headline = normalizeVisibleEcsCopy(commandState?.headline || brief?.headline).trim();
  const followup = normalizeVisibleEcsCopy(
    commandState?.limitationLine ||
    commandState?.supportLine ||
    commandState?.topSignal ||
    commandState?.nextAction ||
    brief?.priorityMessage ||
    brief?.operatorNote ||
    brief?.summary,
  ).trim();

  if (!headline) return null;

  return {
    id: [
      normalizeVisibleEcsCopy(commandState?.statusLabel || brief?.compactLabel || brief?.status?.toString()),
      headline,
      followup,
    ]
      .filter(Boolean)
      .join('|')
      .toLowerCase(),
    message: [headline, followup].filter(Boolean).join(' — '),
  };
}

function mapFleetLoadoutItemsToDashboardItems(
  items: ReturnType<typeof getActiveVehicleContext>['loadoutItems'],
  loadoutId: string | null | undefined,
  userId: string | null | undefined,
): LoadItem[] {
  return items.map((item) => ({
    id: item.id,
    user_id: userId || 'local',
    trip_id: loadoutId || 'fleet-loadout',
    name: item.name,
    zone: item.storage_location || 'vehicle',
    qty: Math.max(1, item.quantity || 1),
    packed: Boolean(item.is_packed),
    mode: 'fleet',
    weight_lbs: item.weight_lbs ?? null,
    notes: item.notes ?? null,
    sort_order: item.sort_order || 0,
    created_at: item.created_at,
    updated_at: item.updated_at,
    deleted_at: null,
  }));
}

type DashboardTab = 'widgets' | 'brief' | 'expedition';

type PersistedDashboardViewState = {
  expanded: boolean;
  dashboardTab: DashboardTab;
};

type DashboardWidgetContainerLayout = {
  width: number;
  height: number;
  signature: string;
};

type DashboardBodyArea = {
  width: number;
  height: number;
  safeAreaInsets: {
    top: number;
    right: number;
    bottom: number;
    left: number;
  };
  bottomBannerHeight: number;
  topBannerHeight: number;
};

function resolveDashboardBodyArea({
  windowWidth,
  windowHeight,
  safeAreaInsets,
  bottomBannerHeight,
  topBannerHeight,
  framePaddingTop,
  framePaddingLeft,
  framePaddingRight,
}: {
  windowWidth: number;
  windowHeight: number;
  safeAreaInsets: DashboardBodyArea['safeAreaInsets'];
  bottomBannerHeight: number;
  topBannerHeight: number;
  framePaddingTop: number;
  framePaddingLeft: number;
  framePaddingRight: number;
}): DashboardBodyArea {
  return {
    width: Math.max(0, windowWidth - framePaddingLeft - framePaddingRight),
    height: Math.max(0, windowHeight - topBannerHeight - bottomBannerHeight - framePaddingTop),
    safeAreaInsets,
    bottomBannerHeight,
    topBannerHeight,
  };
}

const readPersistedDashboardViewState = (
  profile: DashboardProfile,
): PersistedDashboardViewState => {
  const uiState = dashboardStore.getUIState(profile);
  const persistedDashboardTab: DashboardTab =
    uiState.dashboardTab === 'brief'
      ? 'brief'
      : uiState.dashboardTab === 'expedition'
        ? 'widgets'
        : 'widgets';

  return {
    expanded: uiState.expanded === true,
    dashboardTab: persistedDashboardTab,
  };
};

function dashboardProfileForTab(tab: DashboardTab): DashboardProfile {
  void tab;
  return 'expedition';
}

function dashboardModeForTab(tab: DashboardTab): DashboardMode {
  void tab;
  return 'expedition';
}


type DashboardTabBarProps = {
  activeTab: DashboardTab;
  palette: any;
  expeditionAccent: string;
  autoModeEnabled: boolean;
  autoModeInCooldown: boolean;
  autoModeManualOverride: boolean;
  autoModeSustaining: boolean;
  isDashboardExpanded: boolean;
  onSelectTab: (tab: DashboardTab) => void;
  onToggleAutoMode: () => void;
  onToggleDashboardExpanded: () => void;
};

function DashboardTabBar({
  activeTab,
  palette,
  expeditionAccent,
  autoModeEnabled,
  autoModeInCooldown,
  autoModeManualOverride,
  autoModeSustaining,
  isDashboardExpanded,
  onSelectTab,
  onToggleAutoMode,
  onToggleDashboardExpanded,
}: DashboardTabBarProps) {
  void autoModeEnabled;
  void autoModeInCooldown;
  void autoModeManualOverride;
  void autoModeSustaining;
  void onToggleAutoMode;
  const adaptive = useAdaptiveLayout();
  const tabRowPadding = Math.max(10, adaptive.dashboard.gridPadding - 2);
  const tabRowHeight = adaptive.shortHeight ? 40 : 42;
  const tabRailHeight = adaptive.shortHeight ? 32 : 34;

  const tabs: { key: DashboardTab; label: string; accent: string; icon?: string }[] = [
    { key: 'widgets', label: 'WIDGETS', accent: expeditionAccent, icon: 'apps-outline' },
    { key: 'brief', label: 'ECS BRIEF', accent: palette.amber, icon: 'document-text-outline' },
    { key: 'expedition', label: 'EXPEDITION', accent: palette.amber },
  ];

  return (
    <View
      style={[
        styles.tabBar,
        {
          borderBottomColor: GOLD_RAIL.section,
          paddingHorizontal: tabRowPadding,
          height: tabRowHeight,
          gap: adaptive.isTablet ? 10 : 8,
        },
      ]}
    >
      <View
        style={[
          styles.tabsSection,
          {
            height: tabRailHeight,
            gap: adaptive.isTablet ? 8 : 6,
          },
        ]}
      >
        {tabs.map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <TouchableOpacity
              key={tab.key}
              style={[
                styles.tabBtn,
                isActive && {
                  backgroundColor: `${tab.accent}14`,
                  borderColor: `${tab.accent}30`,
                },
              ]}
              onPress={() => onSelectTab(tab.key)}
              activeOpacity={0.7}
              hitSlop={{ top: 6, bottom: 6, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel={tab.label}
              accessibilityState={{ selected: isActive }}
              testID={`dashboard-tab-${tab.key}`}
            >
              {tab.key === 'expedition' ? (
                <DiscoverIcon color={isActive ? tab.accent : palette.textMuted} size={13} />
              ) : tab.icon ? (
                <Ionicons name={tab.icon as any} size={12} color={isActive ? tab.accent : palette.textMuted} />
              ) : null}
              <Text
                style={[
                  styles.tabLabel,
                  adaptive.isTablet && styles.tabLabelTablet,
                  {
                    color: isActive ? tab.accent : palette.textMuted,
                  },
                ]}
                numberOfLines={1}
              >
                {tab.label}
              </Text>
            </TouchableOpacity>
          );
        })}

      </View>

      <View style={styles.tabControlsSection}>
        <TouchableOpacity
          style={[
            styles.dashboardExpandBtn,
            {
              borderColor: isDashboardExpanded ? `${palette.amber}32` : palette.border,
              backgroundColor: isDashboardExpanded ? `${palette.amber}10` : palette.panel,
            },
          ]}
          onPress={onToggleDashboardExpanded}
          activeOpacity={0.7}
          hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
          accessibilityRole="button"
          accessibilityLabel={isDashboardExpanded ? 'Contract Dashboard widgets' : 'Expand Dashboard widgets'}
          accessibilityHint="Toggles the expanded Dashboard widget surface while respecting device safe areas."
        >
          <Ionicons
            name={isDashboardExpanded ? 'contract-outline' : 'expand-outline'}
            size={14}
            color={isDashboardExpanded ? palette.amber : palette.textMuted}
          />
        </TouchableOpacity>
      </View>
    </View>
  );
}

type DashboardPageSupportState = {
  visible: boolean;
  modeLabel: string;
  title: string;
  detail: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  tone: 'info' | 'warning' | 'neutral';
  chips: string[];
  actionLabel?: string;
  onAction?: () => void;
};

type DashboardLaneState = {
  override: {
    title: string;
    detail?: string | null;
    badge: string;
    icon?: React.ComponentProps<typeof Ionicons>['name'];
    tone?: 'active' | 'ready' | 'warning' | 'unavailable' | 'info';
    live?: boolean;
  };
  source: string;
  reason: string;
  priority: number;
  suppressedSources: string[];
};

function mapDashboardPageSupportTone(
  tone: DashboardPageSupportState['tone'],
): DashboardLaneState['override']['tone'] {
  switch (tone) {
    case 'warning':
      return 'warning';
    case 'neutral':
      return 'unavailable';
    case 'info':
    default:
      return 'info';
  }
}

function DashboardPageSupportCard({
  state,
  palette,
}: {
  state: DashboardPageSupportState | null;
  palette: any;
}) {
  const adaptive = useAdaptiveLayout();

  if (!state?.visible) {
    return null;
  }

  const toneColor =
    state.tone === 'warning'
      ? '#E7A85D'
      : state.tone === 'info'
        ? '#89ABF6'
        : palette.textMuted;

  return (
    <View
      style={[
        styles.dashboardPageSupportWrap,
        {
          paddingHorizontal: adaptive.dashboard.gridPadding,
          paddingTop: adaptive.shortHeight ? 2 : 3,
          paddingBottom: adaptive.shortHeight ? 1 : 2,
        },
      ]}
    >
      <View
        style={[
          styles.dashboardPageSupportCard,
          {
            backgroundColor: palette.panel,
            borderColor: `${toneColor}26`,
          },
        ]}
      >
        <View style={styles.dashboardPageSupportHeader}>
          <View
            style={[
              styles.dashboardPageSupportIconWrap,
              {
                borderColor: `${toneColor}32`,
                backgroundColor: `${toneColor}14`,
              },
            ]}
          >
            <Ionicons name={state.icon} size={13} color={toneColor} />
          </View>

          <View style={styles.dashboardPageSupportCopy}>
            <Text
              style={[
                styles.dashboardPageSupportEyebrow,
                { color: toneColor },
              ]}
              numberOfLines={1}
            >
              {state.modeLabel}
            </Text>
            <Text
              style={[
                styles.dashboardPageSupportTitle,
                { color: palette.text },
              ]}
              numberOfLines={2}
            >
              {state.title}
            </Text>
            <Text
              style={[
                styles.dashboardPageSupportDetail,
                { color: palette.textMuted },
              ]}
              numberOfLines={2}
            >
              {state.detail}
            </Text>
          </View>
        </View>

        <View style={styles.dashboardPageSupportFooter}>
          {state.chips.length ? (
            <View style={styles.dashboardPageSupportChipRow}>
              {state.chips.slice(0, adaptive.isTablet ? 4 : 3).map((chip) => (
                <View
                  key={chip}
                  style={[
                    styles.dashboardPageSupportChip,
                    {
                      borderColor: `${toneColor}22`,
                      backgroundColor: `${toneColor}0C`,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.dashboardPageSupportChipText,
                      { color: toneColor },
                    ]}
                    numberOfLines={1}
                  >
                    {chip}
                  </Text>
                </View>
              ))}
            </View>
          ) : (
            <View style={styles.dashboardPageSupportChipSpacer} />
          )}

          {state.actionLabel && state.onAction ? (
            <TouchableOpacity
              style={[
                styles.dashboardPageSupportAction,
                {
                  borderColor: `${toneColor}2A`,
                  backgroundColor: `${toneColor}10`,
                },
              ]}
              onPress={state.onAction}
              activeOpacity={0.75}
            >
              <Text
                style={[
                  styles.dashboardPageSupportActionText,
                  { color: toneColor },
                ]}
              >
                {state.actionLabel}
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
    </View>
  );
}

type DashboardCustomizeStackProps = {
  visible: boolean;
  gridLayout: GridLayout;
  palette: any;
  onSelectLayout: (layout: GridLayout) => void;
  onRestoreDefaults: () => void;
};

function DashboardCustomizeStack({
  visible,
  gridLayout,
  palette,
  onSelectLayout,
  onRestoreDefaults,
}: DashboardCustomizeStackProps) {
  if (!visible) return null;

  return (
    <View
      style={[
        styles.customizeBar,
        { backgroundColor: palette.panel, borderBottomColor: GOLD_RAIL.section },
      ]}
    >
      <GridLayoutPicker
        currentLayout={gridLayout}
        onSelect={onSelectLayout}
        disabled={false}
      />

      <TouchableOpacity
        style={[
          styles.restoreDefaultsButton,
          { backgroundColor: palette.panel, borderColor: palette.border },
        ]}
        onPress={onRestoreDefaults}
        activeOpacity={0.7}
      >
        <Ionicons name="refresh-outline" size={13} color={palette.amber} />
        <Text style={[styles.restoreDefaultsText, { color: palette.textMuted }]}>
          Restore Defaults
        </Text>
      </TouchableOpacity>
    </View>
  );
}

type DashboardGridZoneProps = {
  layoutMode: boolean;
  palette: any;
  activeTab: DashboardTab;
  allEmpty: boolean;
  accel: ReturnType<typeof useAccelerometer>;
  advancedModeEnabled: boolean;
  activeProfile: DashboardProfile;
  gridLayout: GridLayout;
  slots: WidgetSlot[];
  dashboardMode: DashboardMode;
  perWidgetAutoCollapse: Record<string, boolean>;
  widgetContainerHeight: number;
  widgetContainerWidth: number;
  layoutSignature: string;
  tabOpacityAnim: Animated.Value;
  tabSlideAnim: Animated.Value;
  onEnterCustomizeMode: () => void;
  onExitLayoutMode: () => void;
  onEmptySlotPress: (slotIndex: number) => void;
  onWidgetLongPress: (slot: WidgetSlot) => void;
  onRemoveWidget: (slotIndex: number) => void;
  onSwapSlots: (from: number, to: number) => void;
  onResizeWidget: (slotIndex: number, newSize: WidgetSize) => void;
  onRestoreDefaults: () => void;
  onOpenCommandBrief: () => void;
  onContainerLayout: (e: LayoutChangeEvent) => void;
  widgetData: any;
  gpsLatitude: number | null | undefined;
  gpsLongitude: number | null | undefined;
  gpsSpeedMph: number | null | undefined;
  gpsHasFix: boolean;
  gpsAccuracyM: number | null | undefined;
  gpsAltitudeFt: number | null | undefined;
  gpsTimestampMs: number | null | undefined;
  isShortHeight: boolean;
  isVeryShortHeight: boolean;
  expeditionHasActiveRoute: boolean;
  expeditionTeamMemberCount: number;
  expeditionCampCount: number;
  expeditionRouteCompleted: boolean;
  expeditionId?: string;
  expeditionRouteLabel?: string;
  completedExpeditionRecord?: ExpeditionRecord | null;
  expeditionEcsOnline?: boolean;
};

function areDashboardSlotsEquivalent(a: WidgetSlot[], b: WidgetSlot[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;

  for (let index = 0; index < a.length; index += 1) {
    const left = a[index];
    const right = b[index];
    if (
      left.slotIndex !== right.slotIndex ||
      left.widgetType !== right.widgetType ||
      left.widgetSize !== right.widgetSize ||
      JSON.stringify(left.settings || {}) !== JSON.stringify(right.settings || {})
    ) {
      return false;
    }
  }

  return true;
}

function DashboardGridZone({
  layoutMode,
  palette,
  activeTab,
  allEmpty,
  accel,
  advancedModeEnabled,
  activeProfile,
  gridLayout,
  slots,
  dashboardMode,
  perWidgetAutoCollapse,
  widgetContainerHeight,
  widgetContainerWidth,
  layoutSignature,
  tabOpacityAnim,
  tabSlideAnim,
  onEnterCustomizeMode,
  onExitLayoutMode,
  onEmptySlotPress,
  onWidgetLongPress,
  onRemoveWidget,
  onSwapSlots,
  onResizeWidget,
  onRestoreDefaults,
  onOpenCommandBrief,
  onContainerLayout,
  widgetData,
  gpsLatitude,
  gpsLongitude,
  gpsSpeedMph,
  gpsHasFix,
  gpsAccuracyM,
  gpsAltitudeFt,
  gpsTimestampMs,
  isShortHeight,
  isVeryShortHeight,
  expeditionHasActiveRoute,
  expeditionTeamMemberCount,
  expeditionCampCount,
  expeditionRouteCompleted,
  expeditionId,
  expeditionRouteLabel,
  completedExpeditionRecord,
  expeditionEcsOnline,
}: DashboardGridZoneProps) {
  const adaptive = useAdaptiveLayout();
  const showLayoutHint = layoutMode;
  const showBriefTab = activeTab === 'brief';
  const showExpeditionPlaceholderTab = activeTab === 'expedition';
  const contentEdgePadding = adaptive.dashboard.gridPadding;
  const hintEdgePadding = Math.max(12, contentEdgePadding);
  const emptyEdgePadding = Math.max(24, contentEdgePadding + 12);
  const contentStackGap = adaptive.shortHeight ? 8 : 10;
  const layoutHintTop = adaptive.shortHeight ? 6 : 8;

  return (
    <>
      {layoutMode && <View style={styles.customizeDimOverlay} pointerEvents="none" />}

      <View style={styles.dashboardGridZoneFrame}>
        <Animated.View
          style={[
            styles.gridContainer,
            isShortHeight && styles.gridContainerShort,
            isVeryShortHeight && styles.gridContainerVeryShort,
            {
              opacity: tabOpacityAnim,
              transform: [{ translateX: tabSlideAnim }],
            },
          ]}
        >
          {showBriefTab && !layoutMode ? (
            <View
              style={[
                styles.briefTabSurface,
                {
                  paddingHorizontal: contentEdgePadding,
                },
              ]}
            >
              <View style={styles.briefTabCommandWrap}>
                <CommandBriefScreen embedded />
              </View>
            </View>
          ) : showExpeditionPlaceholderTab && !layoutMode ? (
            <ExpeditionTab
              hasActiveRoute={expeditionHasActiveRoute}
              teamMemberCount={expeditionTeamMemberCount}
              campCount={expeditionCampCount}
              routeCompleted={expeditionRouteCompleted}
              expeditionId={expeditionId}
              routeLabel={expeditionRouteLabel}
              completedExpeditionRecord={completedExpeditionRecord}
              ecsOnline={expeditionEcsOnline}
              gpsLocation={
                gpsHasFix && typeof gpsLatitude === 'number' && typeof gpsLongitude === 'number'
                  ? {
                      latitude: gpsLatitude,
                      longitude: gpsLongitude,
                      accuracyMeters: gpsAccuracyM ?? null,
                      source: 'gps' as const,
                      capturedAt: gpsTimestampMs ? new Date(gpsTimestampMs).toISOString() : undefined,
                    }
                  : null
              }
            />
          ) : allEmpty && !layoutMode ? (
            <View
              style={[
                styles.emptyStateContainer,
                {
                  paddingHorizontal: emptyEdgePadding,
                },
              ]}
            >
              <View
                style={[
                  styles.emptyStateCard,
                  { backgroundColor: palette.panel, borderColor: palette.border },
                ]}
              >
                <ECSStateMessage
                  title={ECS_STATE_COPY.dashboard.noWidgetsAssigned.title}
                  message={ECS_STATE_COPY.dashboard.noWidgetsAssigned.message}
                  actionLabel={ECS_CTA_LABELS.configureWidget}
                  onAction={onEnterCustomizeMode}
                  icon="grid-outline"
                />
              </View>
            </View>
          ) : (
            <>
              <View style={styles.missionLayerWrap}>
                <View
                  style={[
                    styles.dashboardContentStack,
                    isShortHeight && styles.dashboardContentStackShort,
                    { gap: contentStackGap },
                  ]}
                >
                  <View
                    key={layoutSignature}
                    style={[
                      styles.widgetMeasureWrapper,
                      isShortHeight && styles.widgetMeasureWrapperShort,
                      isVeryShortHeight && styles.widgetMeasureWrapperVeryShort,
                    ]}
                    onLayout={onContainerLayout}
                  >
                  <WidgetGrid
                    key={`widget-grid:${layoutSignature}`}
                    slots={slots}
                    profile={activeProfile}
                    gridLayout={gridLayout}
                    layoutMode={layoutMode}
                    onEmptySlotPress={onEmptySlotPress}
                    onWidgetLongPress={onWidgetLongPress}
                    onRemoveWidget={onRemoveWidget}
                    onSwapSlots={onSwapSlots}
                    onResizeWidget={onResizeWidget}
                    onRestoreDefaults={onRestoreDefaults}
                    onOpenCommandBrief={onOpenCommandBrief}
                    widgetData={widgetData}
                    dashboardMode={dashboardMode}
                    rollDeg={accel.rollDeg}
                    pitchDeg={accel.pitchDeg}
                    sensorStatus={accel.sensorStatus}
                    sampleTimestampMs={accel.lastSampleAtMs}
                    isCalibrated={accel.isCalibrated}
                    onCalibrate={accel.calibrate}
                    onResetCalibration={accel.resetCalibration}
                    advancedModeEnabled={advancedModeEnabled}
                    perWidgetAutoCollapse={perWidgetAutoCollapse}
                    containerHeight={widgetContainerHeight}
                    containerWidth={widgetContainerWidth}
                    gpsLatitude={gpsLatitude ?? undefined}
                    gpsLongitude={gpsLongitude ?? undefined}
                    gpsSpeedMph={gpsSpeedMph}
                    gpsHasFix={gpsHasFix}
                    gpsAccuracyM={gpsAccuracyM ?? undefined}
                    gpsAltitudeFt={gpsAltitudeFt ?? undefined}
                    gpsTimestampMs={gpsTimestampMs ?? undefined}
                  />
                  </View>
                </View>
              </View>

              {showLayoutHint && (
                <View
                  style={[
                    styles.layoutHint,
                    {
                      marginHorizontal: hintEdgePadding,
                      marginTop: layoutHintTop,
                    },
                    {
                      backgroundColor: `${palette.amber}0C`,
                      borderColor: `${palette.amber}30`,
                    },
                  ]}
                >
                  <Ionicons name="resize-outline" size={14} color={palette.amber} />
                  <Text style={[styles.layoutHintText, { color: palette.amber }]}>
                    Drag to reorder. Tap size badge to resize. Tap X to remove.
                  </Text>
                </View>
              )}

            </>
          )}
        </Animated.View>
      </View>
    </>
  );
}

type DashboardModalLayerProps = {
  libraryVisible: boolean;
  assignedWidgets: (string | null | undefined)[];
  libraryIntent: 'add' | 'replace';
  libraryTargetSlot: number;
  libraryTargetWidgetType: string | null;
  gridLayout: GridLayout;
  advancedModeEnabled: boolean;
  createWidgetVisible: boolean;
  detailVisible: boolean;
  detailSlot: WidgetSlot | null;
  manageVisible: boolean;
  manageSlot: WidgetSlot | null;
  widgetData: any;
  dashboardMode: DashboardMode;
  accel: ReturnType<typeof useAccelerometer>;
  gps: ReturnType<typeof useThrottledGPS>;
  authVisible: boolean;
  collisionModalVisible: boolean;
  pendingCollision: ResizeCollisionInfo | null;
  pendingResizeWidgetName: string;
  pendingResizeSize: WidgetSize;
  completedExpeditionRecord: ExpeditionRecord | null;
  onSelectWidget: (type: string) => void;
  onCloseLibrary: () => void;
  onOpenCreateCustom: () => void;
  onSaveCustomWidget: () => void;
  onCloseCreateCustom: () => void;
  onCloseDetail: () => void;
  onReplaceDetailWidget: () => void;
  onRemoveDetailWidget: () => void;
  onCloseWidgetManager: () => void;
  onReplaceManagedWidget: () => void;
  onChangeManagedWidgetSurface: () => void;
  onRemoveManagedWidget: () => void;
  onOpenNavigateFromDetail: () => void;
  onOpenFleetFromDetail: () => void;
  onRemotenessNavigateFromDetail: (target: RemotenessNavigationTargetType) => void;
  onOpenCommandBriefFromDetail: () => void;
  onCloseAuth: () => void;
  onShrinkAndResize: () => void;
  onCancelResize: () => void;
};

function DashboardModalLayer({
  libraryVisible,
  assignedWidgets,
  libraryIntent,
  libraryTargetSlot,
  libraryTargetWidgetType,
  gridLayout,
  advancedModeEnabled,
  createWidgetVisible,
  detailVisible,
  detailSlot,
  manageVisible,
  manageSlot,
  widgetData,
  dashboardMode,
  accel,
  gps,
  authVisible,
  collisionModalVisible,
  pendingCollision,
  pendingResizeWidgetName,
  pendingResizeSize,
  completedExpeditionRecord,
  onSelectWidget,
  onCloseLibrary,
  onOpenCreateCustom,
  onSaveCustomWidget,
  onCloseCreateCustom,
  onCloseDetail,
  onReplaceDetailWidget,
  onRemoveDetailWidget,
  onCloseWidgetManager,
  onReplaceManagedWidget,
  onChangeManagedWidgetSurface,
  onRemoveManagedWidget,
  onOpenNavigateFromDetail,
  onOpenFleetFromDetail,
  onRemotenessNavigateFromDetail,
  onOpenCommandBriefFromDetail,
  onCloseAuth,
  onShrinkAndResize,
  onCancelResize,
}: DashboardModalLayerProps) {
  return (
    <>
      <WidgetLibrary
        visible={libraryVisible}
        assignedWidgets={assignedWidgets.map((widget) => widget ?? null)}
        onSelect={onSelectWidget}
        onClose={onCloseLibrary}
        onCreateCustom={onOpenCreateCustom}
        advancedModeEnabled={advancedModeEnabled}
        dashboardMode={dashboardMode}
        currentLayout={gridLayout}
        intent={libraryIntent}
        targetSlotIndex={libraryTargetSlot}
        currentWidgetType={libraryTargetWidgetType}
      />

      <CreateCustomWidgetModal
        visible={createWidgetVisible}
        onSave={onSaveCustomWidget}
        onClose={onCloseCreateCustom}
      />

      <WidgetDetailModal
        visible={detailVisible}
        slot={detailSlot}
        widgetData={widgetData}
        renderOptions={{
          dashboardMode,
          rollDeg: accel.rollDeg,
          pitchDeg: accel.pitchDeg,
          sensorStatus: accel.sensorStatus,
          sampleTimestampMs: accel.lastSampleAtMs,
          isCalibrated: accel.isCalibrated,
          onCalibrate: accel.calibrate,
          onResetCalibration: accel.resetCalibration,
          advancedMode: advancedModeEnabled,
          gpsLatitude: gps.position?.latitude,
          gpsLongitude: gps.position?.longitude,
          gpsSpeedMph: gps.position?.speedMph ?? null,
          gpsAccuracyM: gps.position?.accuracyM ?? null,
          gpsAltitudeFt: gps.position?.altitudeFt ?? null,
          gpsTimestampMs: gps.position?.timestamp ?? null,
          gpsHasFix: gps.hasFix,
          onOpenCommandBrief: onOpenCommandBriefFromDetail,
        }}
        onClose={onCloseDetail}
        onReplace={onReplaceDetailWidget}
        onRemove={onRemoveDetailWidget}
        onOpenNavigate={onOpenNavigateFromDetail}
        onOpenFleet={onOpenFleetFromDetail}
        onOpenCommandBrief={onOpenCommandBriefFromDetail}
        onRemotenessNavigateToTarget={onRemotenessNavigateFromDetail}
      />

      <WidgetManagePopover
        visible={manageVisible}
        slot={manageSlot}
        onClose={onCloseWidgetManager}
        onReplace={onReplaceManagedWidget}
        onChangeSurface={onChangeManagedWidgetSurface}
        onRemove={onRemoveManagedWidget}
      />

      <AuthModal visible={authVisible} onClose={onCloseAuth} />

      <CollisionWarningModal
        visible={collisionModalVisible}
        collision={pendingCollision}
        targetWidgetName={pendingResizeWidgetName}
        targetNewSize={pendingResizeSize}
        onShrinkAndResize={onShrinkAndResize}
        onCancel={onCancelResize}
      />

      <Toast />

    </>
  );
}


function DashboardScreenInner() {

  const router = useRouter();
  const {
    activeTrip, loadItems, riskScore, waypoints, userSettings,
    syncStatus, refreshActiveTrip, user, showToast, isOnline, connectivityStatus, offlineMode,
  } = useApp();
  const { palette, isDriving, drivingOverrides } = useTheme();




  // ── Phase 8: Welcome Banner State ─────────────────────
  // Shows once after setup completion, then auto-dismisses after 4 seconds.
  const [showWelcomeBanner, setShowWelcomeBanner] = useState(false);
  const welcomeBannerAnim = useStableAnimatedValue(0);

  useEffect(() => {
    if (setupStore.shouldShowWelcomeBanner()) {
      setupStore.markWelcomeBannerShown();
      setShowWelcomeBanner(true);
      welcomeBannerAnim.stopAnimation();
      Animated.timing(welcomeBannerAnim, {
        toValue: 1, duration: MOTION.screenFadeIn, easing: EASING.decelerate, useNativeDriver: true,
      }).start();

      const timer = setTimeout(() => {
        Animated.timing(welcomeBannerAnim, {
          toValue: 0, duration: MOTION.screenFadeOut, easing: EASING.accelerate, useNativeDriver: true,
        }).start(() => setShowWelcomeBanner(false));
      }, 4000);

      return () => clearTimeout(timer);
    }
  }, [welcomeBannerAnim]);



  // ── Tab State ─────────────────────────────────────────
  const initialDashboardHydrated = isDashboardHydrated();
  const initialDashboardProfile: DashboardProfile = 'expedition';
  const initialDashboardViewState = readPersistedDashboardViewState(
    initialDashboardProfile,
  );
  const initialDashboardTab: DashboardTab = initialDashboardViewState.dashboardTab;
  const initialActiveProfile = dashboardProfileForTab(initialDashboardTab);
  const initialGridLayout = dashboardStore.getGridLayout(initialActiveProfile);
  const initialSlots = dashboardStore.getProfileSlots(initialActiveProfile);

  const [dashboardHydrated, setDashboardHydrated] = useState(initialDashboardHydrated);
  const [activeTab, setActiveTab] = useState<DashboardTab>(initialDashboardTab);
  const lastDashboardFocusSyncRef = useRef(0);
  const activeProfile: DashboardProfile = dashboardProfileForTab(activeTab);

  const [gridLayout, setGridLayout] = useState<GridLayout>(initialGridLayout);
  const [slots, setSlots] = useState<WidgetSlot[]>(initialSlots);
  const [layoutMode, setLayoutMode] = useState(false);
  const [libraryVisible, setLibraryVisible] = useState(false);
  const [libraryTargetSlot, setLibraryTargetSlot] = useState<number>(0);
  const [libraryIntent, setLibraryIntent] = useState<'add' | 'replace'>('add');
  const [libraryTargetWidgetType, setLibraryTargetWidgetType] = useState<string | null>(null);
  const [detailVisible, setDetailVisible] = useState(false);
  const [detailSlot, setDetailSlot] = useState<WidgetSlot | null>(null);
  const [manageVisible, setManageVisible] = useState(false);
  const [manageSlot, setManageSlot] = useState<WidgetSlot | null>(null);
  const [authVisible, setAuthVisible] = useState(false);
  const [createWidgetVisible, setCreateWidgetVisible] = useState(false);


  // ── Collision Detection State ─────────────────────────
  const [collisionModalVisible, setCollisionModalVisible] = useState(false);
  const [pendingCollision, setPendingCollision] = useState<ResizeCollisionInfo | null>(null);
  const [pendingResizeSlot, setPendingResizeSlot] = useState<number>(0);
  const [pendingResizeSize, setPendingResizeSize] = useState<WidgetSize>('1x1');
  const [pendingResizeWidgetName, setPendingResizeWidgetName] = useState('');

  // ── Dashboard Mode ──────────────────────────────────
  const dashboardMode: DashboardMode = dashboardModeForTab(activeTab);

  // ── Expedition Tactical Mode ──────────────────────────


  // ── Dashboard Expansion ───────────────────────────────
  const [isDashboardExpanded, setIsDashboardExpanded] = useState(initialDashboardViewState.expanded);

  useLayoutEffect(() => {
    setDashboardExpanded(isDashboardExpanded);
  }, [isDashboardExpanded]);

  // ── Advanced Mode ─────────────────────────────────────
  const [advancedModeEnabled, setAdvancedModeEnabled] = useState(dashboardStore.getAdvancedModeEnabled());

  // ── Per-Widget Display Overrides ──────────────────────
  const [perWidgetAutoCollapse, setPerWidgetAutoCollapse] = useState<Record<string, boolean>>({});


  // ── Context-Aware Dashboard Mode Engine ────────────────
  // Evaluates road type, speed, and remoteness for legacy dashboard mode context.
  const [modeEngineState, setModeEngineState] = useState<ModeEngineOutput>(
    dashboardModeEngine.get()
  );

  // Subscribe to mode engine state changes
  useEffect(() => {
    const unsubscribe = dashboardModeEngine.subscribe(() => {
      setModeEngineState(dashboardModeEngine.get());
    });
    return unsubscribe;
  }, []);

  // Start/stop mode engine on mount/unmount
  // Start/stop mode engine + trip recorder on mount/unmount
  useEffect(() => {
    dashboardModeEngine.start();
    offlineExpeditionModeEngine.initialize();
    tripRecorderEngine.init();
    return () => {
      dashboardModeEngine.stop();
      offlineExpeditionModeEngine.stop();
      tripRecorderEngine.destroy();
    };
  }, []);



  // ── Context-Aware Mode Engine Handlers ─────────────────
  // These are defined here but reference handleTabSwitch via a ref
  // to avoid temporal dead zone issues with const declarations.
  const handleTabSwitchRef = useRef<(tab: DashboardTab) => void>(() => {});

  // Keep dashboard mode engine telemetry alive without switching tabs.
  const prevAutoModeRef = useRef<'highway' | 'expedition'>(modeEngineState.currentMode);
  useEffect(() => {
    if (activeTab !== 'widgets') return;
    const engineMode = modeEngineState.currentMode;
    if (engineMode !== prevAutoModeRef.current) {
      prevAutoModeRef.current = engineMode;
    }
  }, [modeEngineState.currentMode, modeEngineState.autoModeEnabled, modeEngineState.switchRecommended, activeTab]);

  // Toggle auto mode
  const handleToggleAutoMode = useCallback(() => {
    const newEnabled = !modeEngineState.autoModeEnabled;
    dashboardModeEngine.setAutoMode(newEnabled);
    showToast(newEnabled ? 'Auto mode enabled' : 'Auto mode disabled');
  }, [modeEngineState.autoModeEnabled, showToast]);

  // Sync manual tab switches with mode engine (defined after handleTabSwitch)
  const handleTabSwitchWithModeSync = useCallback((newTab: DashboardTab) => {
    if (newTab === 'widgets') dashboardModeEngine.setMode('expedition');
    handleTabSwitchRef.current(newTab);
  }, []);




  // ── Expedition State Integration ────────────────────────

  // Subscribe to expeditionStateStore for real-time state changes.
  // Completion data remains available for the modern Expedition Summary /
  // debrief PDF flow; the deprecated completion popup is never opened.
  const [completedExpeditionRecord, setCompletedExpeditionRecord] = useState<ExpeditionRecord | null>(
    () => {
      const record = expeditionStateStore.getCurrentExpedition();
      return record?.state === 'complete' ? record : null;
    },
  );

  // Track which expedition IDs have already been shown/acknowledged
  // to prevent duplicate modals from re-renders or multiple _notify() calls.
  // Track the previous expedition state to detect transitions (not just current state)
  // ── Modal State Guards ──────────────────────────────────
  // Prevents duplicate summary sheets from concurrent _notify() calls.
  // Cooldown after dismiss prevents immediate re-trigger from stale notifications.
  // isDismissing prevents double-dismiss from backdrop + button tap simultaneously.

  useEffect(() => {
    const unsubscribe = expeditionStateStore.subscribe((state, record) => {
      setCompletedExpeditionRecord((current) => {
        if (state === 'complete' && record) {
          return current?.id === record.id && current?.endTime === record.endTime ? current : record;
        }
        return current;
      });
    });
    return unsubscribe;
  }, []);

  // Cleanup cooldown timer on unmount

  // Called by DashboardHeader when user confirms "End Expedition"
  const handleExpeditionEnded = useCallback(() => {
    // The expedition store records completion, timeline events, and
    // completed-route data. No legacy completion popup is opened here.
  }, []);

  // Dismiss expedition summary sheet — marks this expedition as acknowledged
  // so it won't re-appear on subsequent renders or _notify() calls.




  // ── Geofence Monitor — Automatic Expedition Activation ──────
  // Monitors GPS position when expedition is in standby and an
  // active vehicle exists. Auto-starts expedition on configurable
  // geofence radius exit (100m–2000m, default 400m), auto-ends
  // on re-entry. Triggers haptic, toast, and gold underline
  // animation (via DashboardHeader subscription).

  // The geofence monitor is enabled when:
  //   1. expedition.state === 'standby' OR 'active'
  //   2. activeVehicleId exists
  //
  // Vehicle name is resolved from local vehicle store for the
  // expedition record. Falls back to 'Vehicle' if not found.


  const [geofenceVehicleId, setGeofenceVehicleId] = useState<string | null>(
    vehicleSetupStore.getActiveVehicleId()
  );
  const [geofenceVehicleName, setGeofenceVehicleName] = useState('Vehicle');
  const [activeVehicleContextRevision, setActiveVehicleContextRevision] = useState(0);


  // ── Active Vehicle Resource Data (for ResourceAlertBanner) ──
  const [activeVehicleData, setActiveVehicleData] = useState<Vehicle | null>(null);
  const [bluPowerState, setBluPowerState] = useState(() => bluPowerAuthority.getSnapshot());
  const [liveRemoteness, setLiveRemoteness] = useState(() => remotenessStore.get());

  const primaryPowerDeviceSoc = bluPowerState.batteryPercent;
  const primaryPowerProviderLabel = bluPowerState.providerLabel;
  const primaryPowerDeviceLabel = bluPowerState.deviceLabel;
  const primaryPowerFreshness = bluPowerState.freshness;
  const primaryPowerRuntimeMin = bluPowerState.estimatedRuntimeMinutes;
  const primaryPowerOutputWatts = bluPowerState.outputWatts;
  const primaryPowerInputWatts = bluPowerState.inputWatts;
  const primaryPowerSolarWatts = bluPowerState.solarInputWatts;


  // Subscribe to vehicleSetupStore for activeVehicleId changes
  useEffect(() => {
    const unsubscribe = vehicleSetupStore.subscribe(() => {
      setGeofenceVehicleId(vehicleSetupStore.getActiveVehicleId());
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    const syncActiveVehicleContext = () => {
      setGeofenceVehicleId(vehicleSetupStore.getActiveVehicleId());
      setActiveVehicleContextRevision((revision) => revision + 1);
    };

    const bumpIfActiveVehicle = (vehicleId?: string | null) => {
      const currentActiveVehicleId = vehicleSetupStore.getActiveVehicleId();
      if (!currentActiveVehicleId) return;
      if (!vehicleId || vehicleId === currentActiveVehicleId) {
        setActiveVehicleContextRevision((revision) => revision + 1);
      }
    };

    const offVehicleSetup = vehicleSetupStore.subscribe(syncActiveVehicleContext);
    const offVehicleStore = vehicleStore.subscribe((event) => {
      bumpIfActiveVehicle(event.vehicleId ?? null);
    });
    const offVehicleSpec = vehicleSpecStore.subscribe(() => {
      bumpIfActiveVehicle(vehicleSetupStore.getActiveVehicleId());
    });
    const offConsumables = consumablesStore.subscribe(() => {
      bumpIfActiveVehicle(vehicleSetupStore.getActiveVehicleId());
    });
    const offTiresLift = tiresLiftStore.subscribe((vehicleId) => {
      bumpIfActiveVehicle(vehicleId);
    });
    const offLoadouts = loadoutStore.subscribe((_loadoutId, vehicleId) => {
      bumpIfActiveVehicle(vehicleId ?? null);
    });
    const offLoadoutItems = loadoutItemStore.subscribe((loadoutId) => {
      const currentActiveVehicleId = vehicleSetupStore.getActiveVehicleId();
      if (!currentActiveVehicleId) return;
      const activeLoadout = loadoutStore.getLatestLocalByVehicleIdSync(currentActiveVehicleId);
      if (!activeLoadout || activeLoadout.id === loadoutId) {
        setActiveVehicleContextRevision((revision) => revision + 1);
      }
    });

    return () => {
      offVehicleSetup();
      offVehicleStore();
      offVehicleSpec();
      offConsumables();
      offTiresLift();
      offLoadouts();
      offLoadoutItems();
    };
  }, []);

  const refreshActiveVehicleData = useCallback(() => {
    if (!geofenceVehicleId) {
      setGeofenceVehicleName('Vehicle');
      setActiveVehicleData(null);
      return () => {};
    }

    const localMatch = vehicleStore.getById(geofenceVehicleId);
    if (localMatch) {
      setGeofenceVehicleName(localMatch.name || 'Vehicle');
      setActiveVehicleData(localMatch);
    }

    let cancelled = false;
    vehicleStore.getAll(user?.id || null).then(({ vehicles }) => {
      if (cancelled) return;
      const match = vehicles.find(v => v.id === geofenceVehicleId);
      if (match) {
        setGeofenceVehicleName(match.name || 'Vehicle');
        setActiveVehicleData(match);
      } else if (!localMatch) {
        setGeofenceVehicleName('Vehicle');
        setActiveVehicleData(null);
      }
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [geofenceVehicleId, user?.id]);

  // Resolve vehicle name + resource data when activeVehicleId changes
  useEffect(() => refreshActiveVehicleData(), [refreshActiveVehicleData]);

  // Re-fetch vehicle resource data on screen focus (picks up water/fuel changes)
  useFocusEffect(useCallback(() => {
    return refreshActiveVehicleData();
  }, [refreshActiveVehicleData]));

  useEffect(() => {
    const unsubscribe = vehicleStore.subscribe((event) => {
      if (!geofenceVehicleId) return;
      if (!event.vehicleId || event.vehicleId === geofenceVehicleId) {
        refreshActiveVehicleData();
      }
    });
    return unsubscribe;
  }, [geofenceVehicleId, refreshActiveVehicleData]);

  const activeVehicleContext = useMemo(() => {
    void activeVehicleContextRevision;
    return getActiveVehicleContext();
  }, [activeVehicleContextRevision]);

  const baselineFleetLoadItems = useMemo(
    () =>
      mapFleetLoadoutItemsToDashboardItems(
        activeVehicleContext.loadoutItems,
        activeVehicleContext.loadout?.id,
        user?.id ?? null,
      ),
    [activeVehicleContext.loadout?.id, activeVehicleContext.loadoutItems, user?.id],
  );

  const effectiveLoadItems = useMemo(
    () => (activeTrip && loadItems.length > 0 ? loadItems : baselineFleetLoadItems),
    [activeTrip, baselineFleetLoadItems, loadItems],
  );

  // Track shared BLU power authority instead of reading provider-local setup
  // state directly. This gives Dashboard one clean source of truth for
  // power reserve, freshness, provider label, and live watts.
  useEffect(() => {
    setBluPowerState(bluPowerAuthority.getSnapshot());
    const unsubscribe = bluPowerAuthority.subscribe((snapshot) => {
      setBluPowerState(snapshot);
    });
    return unsubscribe;
  }, []);

  // Track remoteness so the dashboard AI gets the live environmental score
  // instead of a null placeholder.
  useEffect(() => {
    const syncRemoteness = () => {
      setLiveRemoteness(remotenessStore.get());
    };

    syncRemoteness();
    const unsubscribe = remotenessStore.subscribe(() => {
      syncRemoteness();
    });
    return unsubscribe;
  }, []);


  // Determine if geofence monitoring should be active
  const geofenceEnabled = useMemo(() => {
    if (!geofenceVehicleId) return false;
    const state = expeditionStateStore.getState();
    return state === 'standby' || state === 'active';
  }, [geofenceVehicleId]);


  // Geofence toast timer ref (for 2-second display)
  const geofenceToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cleanup geofence toast timer
  useEffect(() => {
    return () => {
      if (geofenceToastTimerRef.current) {
        clearTimeout(geofenceToastTimerRef.current);
        geofenceToastTimerRef.current = null;
      }
    };
  }, []);

  // Geofence callbacks — show toast on auto-start/end
  const geofenceCallbacks = useMemo(() => ({
    onExpeditionStarted: () => {
      // Show 2-second toast: "Expedition started."
      showToast('Expedition started.');
    },
    onExpeditionEnded: () => {
      // Show 2-second toast: "Expedition ended."
      showToast('Expedition ended.');
      // Completion is retained for the Expedition Summary flow; no
      // deprecated completion popup is opened.
    },
  }), [showToast]);


  // ── Geofence Monitor Hook ─────────────────────────────────
  // Monitors GPS and auto-triggers expedition start/end based
  // on 400m geofence radius. Haptic feedback is handled inside
  // the hook. Gold underline animation is handled by DashboardHeader
  // subscription to expeditionStateStore.
  const geofenceMonitor = useGeofenceMonitor({
    enabled: useIsFocused() && geofenceEnabled,
    vehicleName: geofenceVehicleName,
    callbacks: geofenceCallbacks,
  });



  // ── Tab Animation ─────────────────────────────────────
  const tabSlideAnim = useStableAnimatedValue(0);
  const tabOpacityAnim = useStableAnimatedValue(1);
  const tabIndexFor = (tab: DashboardTab): number => {
    if (tab === 'widgets') return 0;
    if (tab === 'brief') return 1;
    return 2;
  };
  const underlineAnim = useStableAnimatedValue(tabIndexFor(activeTab));
  const tabTransitionCycleRef = useRef(0);

  // ── Widget Container Dimensions ────────────────────────
  const [widgetContainerLayout, setWidgetContainerLayout] = useState<DashboardWidgetContainerLayout>({
    width: 0,
    height: 0,
    signature: '',
  });

  // ── Window Dimensions (reactive — updates on rotation / resize) ──
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const adaptive = useAdaptiveLayout();
  const insets = useSafeAreaInsets();
  const topBannerHeight = useEcsTopBannerHeight();
  const isLandscape = windowWidth > windowHeight;
  const isShortHeight = windowHeight < 780;
  const isVeryShortHeight = windowHeight < 700;
  const dashboardChromeVisible = !isDashboardExpanded;
  const dashboardFrameInsetLeft = Math.max(
    DASHBOARD_WIDGET_FRAME_EDGE_MARGIN,
    insets.left + DASHBOARD_WIDGET_FRAME_EDGE_MARGIN,
  );
  const dashboardFrameInsetRight = Math.max(
    DASHBOARD_WIDGET_FRAME_EDGE_MARGIN,
    insets.right + DASHBOARD_WIDGET_FRAME_EDGE_MARGIN,
  );
  const dashboardFrameTopPadding = isDashboardExpanded
    ? Math.max(insets.top, 0) + DASHBOARD_EXPANDED_TOP_SAFE_GAP
    : 0;
  const dashboardTopBannerVisibleHeight = dashboardChromeVisible
    ? getEcsTopBannerLayoutMetrics(insets.top, topBannerHeight, {
      isTablet: adaptive.isTablet,
      shortHeight: adaptive.shortHeight,
    }).visibleHeight
    : 0;
  const dashboardLayoutSignature = useMemo(
    () => [
      Math.round(windowWidth),
      Math.round(windowHeight),
      Math.round(insets.top),
      Math.round(insets.right),
      Math.round(insets.bottom),
      Math.round(insets.left),
      Math.round(dashboardTopBannerVisibleHeight),
      isDashboardExpanded ? 'expanded' : 'standard',
      activeTab,
    ].join(':'),
    [
      activeTab,
      insets.bottom,
      insets.left,
      insets.right,
      insets.top,
      dashboardTopBannerVisibleHeight,
      isDashboardExpanded,
      windowHeight,
      windowWidth,
    ],
  );
  const dashboardFrameStyle = useMemo(
    () => ({
      flex: 1,
      flexGrow: 1,
      flexBasis: 0,
      minHeight: 0,
      width: '100%' as const,
      alignSelf: 'center' as const,
      overflow: 'visible' as const,
      paddingTop: dashboardFrameTopPadding,
      paddingLeft: dashboardFrameInsetLeft,
      paddingRight: dashboardFrameInsetRight,
    }),
    [dashboardFrameInsetLeft, dashboardFrameInsetRight, dashboardFrameTopPadding],
  );
  const dashboardPageRhythm = useMemo(
    () => ({
      edgePadding: adaptive.dashboard.gridPadding,
      bodyGap: adaptive.shortHeight ? 6 : Math.max(8, adaptive.panelGap - 4),
      controlGap: adaptive.shortHeight ? 3 : Math.max(5, adaptive.sectionGap - 3),
      gridRegionBottom: adaptive.shortHeight ? 0 : 2,
      dockSeparatorGap: adaptive.shortHeight ? 2 : 3,
    }),
    [
      adaptive.dashboard.gridPadding,
      adaptive.panelGap,
      adaptive.sectionGap,
      adaptive.shortHeight,
    ],
  );

  // Track previous window dimensions to detect rotation/resize
  const prevWindowDimsRef = useRef({ width: windowWidth, height: windowHeight });

  // ── Invalidate container measurements on rotation / resize ──
  // When window dimensions change significantly (rotation, split-screen,
  // external display), reset container measurements to 0 so the next
  // onLayout callback re-measures with correct values. This prevents
  // stale dimensions from producing mis-sized widget placements.
  useEffect(() => {
    const prev = prevWindowDimsRef.current;
    const widthChanged = Math.abs(prev.width - windowWidth) > 2;
    const heightChanged = Math.abs(prev.height - windowHeight) > 2;

    if (widthChanged || heightChanged) {
      // Invalidate stale container measurements — the layout signature
      // keeps portrait and landscape measurements from leaking into one
      // another before the next onLayout callback arrives.
      setWidgetContainerLayout((prevLayout) => (
        prevLayout.width === 0 && prevLayout.height === 0 && prevLayout.signature === ''
          ? prevLayout
          : { width: 0, height: 0, signature: '' }
      ));
      prevWindowDimsRef.current = { width: windowWidth, height: windowHeight };
    }
  }, [windowWidth, windowHeight]);

  // ── Adaptive dock padding ─────────────────────────────
  // In landscape the CommandDock bar is shorter (less bottom safe area),
  // so we can reduce the padding to give widgets more vertical space.
  // Keep Dashboard reserved space aligned to the compact CommandDock
  // layout height so widgets do not disappear behind the bottom chrome.
  const dockPadding = useMemo(() => {
    if (isDashboardExpanded) {
      return Math.max(insets.bottom, isLandscape ? 4 : 8);
    }
    return getShellBottomClearance(insets.bottom, 0);
  }, [insets.bottom, isDashboardExpanded, isLandscape]);

  const dashboardAvailableBodyArea = useMemo(
    () => resolveDashboardBodyArea({
      windowWidth,
      windowHeight,
      safeAreaInsets: {
        top: insets.top,
        right: insets.right,
        bottom: insets.bottom,
        left: insets.left,
      },
      bottomBannerHeight: dockPadding,
      topBannerHeight: dashboardTopBannerVisibleHeight,
      framePaddingTop: dashboardFrameTopPadding,
      framePaddingLeft: dashboardFrameInsetLeft,
      framePaddingRight: dashboardFrameInsetRight,
    }),
    [
      dashboardFrameInsetLeft,
      dashboardFrameInsetRight,
      dashboardFrameTopPadding,
      dashboardTopBannerVisibleHeight,
      dockPadding,
      insets.bottom,
      insets.left,
      insets.right,
      insets.top,
      windowHeight,
      windowWidth,
    ],
  );
  const hasCurrentWidgetMeasurement = widgetContainerLayout.signature === dashboardLayoutSignature;
  const liveWidgetContainerWidth = hasCurrentWidgetMeasurement ? widgetContainerLayout.width : 0;
  const liveWidgetContainerHeight = hasCurrentWidgetMeasurement ? widgetContainerLayout.height : 0;
  const dashboardControlStackEstimatedHeight =
    (adaptive.shortHeight ? 40 : 42) +
    (layoutMode ? Math.round(DASHBOARD_CUSTOMIZE_STACK_ESTIMATED_HEIGHT * adaptive.densityScale) : 0);
  const estimatedExpandedWidgetHeight = Math.max(
    0,
    dashboardAvailableBodyArea.height -
      dashboardPageRhythm.bodyGap -
      dashboardPageRhythm.controlGap -
      dashboardPageRhythm.gridRegionBottom -
      dashboardControlStackEstimatedHeight,
  );
  const estimatedContractedWidgetHeight = Math.max(
    0,
    dashboardAvailableBodyArea.height -
      dashboardPageRhythm.bodyGap -
      dashboardPageRhythm.controlGap -
      dashboardPageRhythm.gridRegionBottom -
      dashboardControlStackEstimatedHeight,
  );
  const effectiveWidgetContainerWidth =
    liveWidgetContainerWidth ||
    dashboardAvailableBodyArea.width;
  const effectiveWidgetContainerHeight =
    isDashboardExpanded
      ? Math.max(liveWidgetContainerHeight, estimatedExpandedWidgetHeight)
      : liveWidgetContainerHeight || estimatedContractedWidgetHeight;


  // ── Accelerometer ─────────────────────────────────────
  const isFocused = useIsFocused();
  const attitudeRecalibrationKey = isLandscape ? 'landscape' : 'portrait';
  const accel = useAccelerometer(isFocused, {
    recalibrationKey: attitudeRecalibrationKey,
  });

  // ── ECS AI Orchestrator Feed ───────────────────────────
  // The dashboard now consumes the dedicated AI hook instead of
  // locally building context + mission brief on an interval.
  // This keeps signal memory stable across renders and lets the
  // orchestrator drive the brief, compact label, and activation state.
  const gps = useThrottledGPS({
    enabled: isFocused && activeTab !== 'brief',
    highAccuracy: false,
  });

  const aiTelemetry = useMemo(() => ({
    ...(activeTrip as any ?? {}),
    fuelPercent:
      toFiniteNumber((activeTrip as any)?.fuelPercent) ??
      toFiniteNumber((activeVehicleData as any)?.current_fuel_percent),
    batteryPercent:
      toFiniteNumber((activeTrip as any)?.batteryPercent) ??
      primaryPowerDeviceSoc,
    payloadMargin:
      toFiniteNumber((activeTrip as any)?.payloadMargin) ??
      toFiniteNumber((activeVehicleData as any)?.payload_margin_lb),
    healthScore: toFiniteNumber((activeTrip as any)?.healthScore),
    coolantTempF: toFiniteNumber((activeTrip as any)?.coolantTempF),
    oilTempF: toFiniteNumber((activeTrip as any)?.oilTempF),
    tirePressureLow: Boolean((activeTrip as any)?.tirePressureLow),
    checkEngine: Boolean((activeTrip as any)?.checkEngine),
    gpsStatus: gps.gpsStatus,
    gpsFixQuality: gps.fixQuality,
    gpsHasFix: gps.hasFix,
    gpsPermissionDenied: gps.permissionDenied,
    latitude: gps.position?.latitude ?? null,
    longitude: gps.position?.longitude ?? null,
    speedMph:
      toFiniteNumber((activeTrip as any)?.speedMph) ??
      gps.position?.speedMph ??
      null,
    altitudeFt:
      toFiniteNumber((activeTrip as any)?.altitudeFt) ??
      gps.position?.altitudeFt ??
      null,
    gpsTimestamp: gps.position?.timestamp ?? null,
  }), [activeTrip, activeVehicleData, gps.fixQuality, gps.gpsStatus, gps.hasFix, gps.permissionDenied, gps.position?.altitudeFt, gps.position?.latitude, gps.position?.longitude, gps.position?.speedMph, gps.position?.timestamp, primaryPowerDeviceSoc]);

  const aiResources = useMemo(() => {
    const resolvedVehicleConfig = (activeVehicleData as any) ?? activeVehicleContext.vehicle ?? {};
    const waterCapacity = toFiniteNumber(activeVehicleContext.resourceProfile.waterCapacityGal);
    const currentWater = toFiniteNumber(activeVehicleContext.resourceProfile.currentWaterGallons);
    const waterPercent =
      waterCapacity && waterCapacity > 0 && currentWater != null
        ? Math.max(0, Math.min(100, Math.round((currentWater / waterCapacity) * 100)))
        : null;

    return {
      ...resolvedVehicleConfig,
      fuelPercent: toFiniteNumber(activeVehicleContext.resourceProfile.currentFuelPercent),
      fuelGallons: activeVehicleContext.resourceProfile.currentFuelGallons,
      fuelWeightLb: activeVehicleContext.resourceProfile.currentFuelWeightLb,
      waterGallons: activeVehicleContext.resourceProfile.currentWaterGallons,
      waterWeightLb: activeVehicleContext.resourceProfile.currentWaterWeightLb,
      waterPercent,
      fuelTankCapacityGal: activeVehicleContext.resourceProfile.fuelTankCapacityGal,
      waterCapacityGal: activeVehicleContext.resourceProfile.waterCapacityGal,
      batteryCapacityWh: activeVehicleContext.resourceProfile.batteryUsableWh,
      tireSizeInches: activeVehicleContext.resourceProfile.tireSizeInches,
      suspensionLiftInches: activeVehicleContext.resourceProfile.suspensionLiftInches,
      isLeveled: activeVehicleContext.resourceProfile.isLeveled,
      frontLevelInches: activeVehicleContext.resourceProfile.frontLevelInches,
      accessoryInstalledCount: activeVehicleContext.accessoryInstalledCount,
      loadoutItemCount: activeVehicleContext.loadoutItemCount,
      loadoutWeightLbs: activeVehicleContext.loadoutTotalWeightLbs,
      powerPercent: primaryPowerDeviceSoc,
      powerFreshness: primaryPowerFreshness,
      powerProviderLabel: primaryPowerProviderLabel,
      powerDeviceLabel: primaryPowerDeviceLabel,
      powerRuntimeMinutes: primaryPowerRuntimeMin,
      powerOutputWatts: primaryPowerOutputWatts,
      powerInputWatts: primaryPowerInputWatts,
      powerSolarWatts: primaryPowerSolarWatts,
      fuelRangeMiles: toFiniteNumber((activeTrip as any)?.fuelRangeMiles),
      connectivityLevel: !isOnline ? 'offline' : gps.hasFix ? 'live' : 'limited',
    };
  }, [
    activeTrip,
    activeVehicleData,
    activeVehicleContext,
    gps.hasFix,
    isOnline,
    primaryPowerDeviceLabel,
    primaryPowerDeviceSoc,
    primaryPowerFreshness,
    primaryPowerInputWatts,
    primaryPowerOutputWatts,
    primaryPowerProviderLabel,
    primaryPowerRuntimeMin,
    primaryPowerSolarWatts,
  ]);

  const routeIntelligence = useMemo(() => ({
    riskScore,
    waypoints,
    distanceRemainingMiles:
      toFiniteNumber((activeTrip as any)?.distanceRemainingMiles) ??
      toFiniteNumber((activeTrip as any)?.stats?.distanceRemainingMiles),
    etaMinutes:
      toFiniteNumber((activeTrip as any)?.etaMinutes) ??
      toFiniteNumber((activeTrip as any)?.estimatedEtaMinutes),
    offRouteMiles: toFiniteNumber((activeTrip as any)?.offRouteMiles),
    bailoutOptions: Array.isArray(waypoints) ? waypoints.length : null,
    hazardAhead: typeof riskScore === 'number' ? riskScore >= 70 : false,
    nextHazardDistanceMiles: null,
  }), [activeTrip, riskScore, waypoints]);
  const dashboardActiveRun = useMemo(
    () => ((activeTrip as any)?.points && Array.isArray((activeTrip as any).points) ? (activeTrip as any) : null),
    [activeTrip],
  );
  const dashboardWeatherLocation = useMemo(
    () => (
      gps.hasFix && gps.position?.latitude != null && gps.position?.longitude != null
        ? {
            lat: gps.position.latitude,
            lng: gps.position.longitude,
          }
        : null
    ),
    [gps.hasFix, gps.position?.latitude, gps.position?.longitude],
  );
  const silentRouteWeatherToast = useCallback((_message: string) => {}, []);

  const dashboardWeather = useOperationalWeather({
    enabled: activeTab !== 'brief',
    gps: {
      lat: gps.position?.latitude ?? null,
      lng: gps.position?.longitude ?? null,
      hasFix: gps.hasFix,
      permissionDenied: gps.permissionDenied,
      accuracyM: gps.position?.accuracyM ?? null,
    },
  });
  const dashboardRouteWeather = useRouteCorridorWeather(
    dashboardActiveRun,
    dashboardWeatherLocation,
    silentRouteWeatherToast,
    {
      forceActive: true,
      persistPreference: false,
      emitToasts: false,
    },
  );
  const dashboardTelemetry = useVehicleTelemetry();
  const telemetryScanner = useUnifiedOBD2Scanner();

  const aiWeatherCorridor = useMemo(() => {
    return buildUnifiedWeatherCorridor({
      snapshot: dashboardWeather.snapshot,
      result: dashboardWeather.result,
      routeWeather: dashboardRouteWeather,
    });
  }, [dashboardRouteWeather, dashboardWeather.result, dashboardWeather.snapshot]);

  const aiRemoteness = useMemo(() => ({
    remotenessScore: toFiniteNumber(liveRemoteness?.score),
    tier: liveRemoteness?.tier ?? null,
    reason: liveRemoteness?.reason ?? null,
    connectivityState: liveRemoteness?.signals?.connectivityState ?? null,
    cacheReady: liveRemoteness?.signals?.cacheReady ?? false,
  }), [liveRemoteness]);

  const {
    aiState,
    isAIActive,
    dashboardView,
    briefView,
    liveStatus,
    orchestrator,
    summaryLine,
    compactLine,
    topSignalTitle,
  } = useECSAI({
    activeRun: activeTrip,
    vehicleConfig: activeVehicleData,
    telemetry: aiTelemetry,
    weatherCorridor: aiWeatherCorridor,
    routeIntelligence,
    remoteness: aiRemoteness,
    resources: aiResources,
    powerAuthority: bluPowerState,
    userPreferences: userSettings,
    enabled: true,
    options: {
      enableWhenIdle: false,
      emitBriefWhenNoSignals: true,
    },
  });

  const latestMissionBrief = (aiState?.brief as MissionBrief | null) ?? null;
  const summaryLineLabel = normalizeVisibleEcsCopy(summaryLine);
  const compactLineLabel = normalizeVisibleEcsCopy(compactLine);
  const topSignalTitleLabel = normalizeVisibleEcsCopy(topSignalTitle);
  const currentExpeditionState = expeditionStateStore.getState();
  const currentExpeditionRecord = expeditionStateStore.getCurrentExpedition();
  const latestCompletedExpeditionLog = expeditionStateStore.getLog()[0] ?? null;
  const gpsAgeMs = gps.position?.timestamp ? Math.max(0, Date.now() - gps.position.timestamp) : null;
  const [hasSharedRouteContext, setHasSharedRouteContext] = useState(false);
  const refreshDashboardRouteContext = useCallback(async () => {
    let hasSelectedRoute = !!routeStore.getActive();
    setHasSharedRouteContext((current) => (current === hasSelectedRoute ? current : hasSelectedRoute));

    try {
      const [roadSession, trailSession] = await Promise.all([
        loadRoadNavigationSession(),
        loadTrailNavigationSession(),
      ]);

      hasSelectedRoute =
        hasSelectedRoute ||
        (!!roadSession &&
          ['destination_selected', 'route_preview', 'navigation_active', 'rerouting'].includes(
            roadSession.status,
          )) ||
        (!!trailSession &&
          [
            'route_preview_trail',
            'route_preview_hybrid',
            'transition_to_trail',
            'navigation_active_trail',
            'off_trail',
            'rejoining_trail',
          ].includes(trailSession.status));
    } catch {}

    setHasSharedRouteContext((current) => (current === hasSelectedRoute ? current : hasSelectedRoute));
  }, []);
  const hasOperationalContext =
    Boolean(activeTrip) ||
    (Array.isArray(waypoints) && waypoints.length > 0) ||
    routeIntelligence.distanceRemainingMiles != null ||
    routeIntelligence.etaMinutes != null;
  const hasDashboardRouteContext = hasOperationalContext || hasSharedRouteContext;
  const dashboardActiveRoute = routeStore.getActive();
  const expeditionId =
    String((activeTrip as any)?.id ?? currentExpeditionRecord?.id ?? '').trim() || undefined;
  const expeditionRouteLabel =
    String((activeTrip as any)?.name ?? dashboardActiveRoute?.name ?? '').trim() || undefined;
  const expeditionTeamMemberCount = Math.max(1, Number((activeTrip as any)?.team_size) || 1);
  const expeditionCampCount = Array.isArray(waypoints)
    ? waypoints.filter((waypoint: any) => {
        const type = String(waypoint?.waypointType ?? waypoint?.type ?? '').toLowerCase();
        const name = String(waypoint?.name ?? waypoint?.title ?? '').toLowerCase();
        return type.includes('camp') || name.includes('camp');
      }).length
    : 0;
  const completedExpeditionSummaryRecord =
    completedExpeditionRecord ??
    (currentExpeditionRecord?.state === 'complete' ? currentExpeditionRecord : null);
  const expeditionRouteCompleted =
    currentExpeditionState === 'complete' ||
    Boolean(completedExpeditionRecord) ||
    (currentExpeditionState === 'standby' && Boolean(latestCompletedExpeditionLog));
  const dashboardShellBannerStatus = useMemo(
    () =>
      resolveTopBannerPresentation({
        syncStatus,
        connectivityStatus,
        isOnline,
        offlineMode,
        userPresent: !!user,
        expeditionState: currentExpeditionState,
        hasActiveExpeditionContext: hasDashboardRouteContext,
        commandContext: {
          expeditionPhase: aiState?.expeditionPhase ?? null,
          operationalState: aiState?.operationalState ?? null,
          liveStatus: liveStatus ?? null,
        },
      }),
    [
      aiState?.expeditionPhase,
      aiState?.operationalState,
      connectivityStatus,
      currentExpeditionState,
      hasDashboardRouteContext,
      isOnline,
      liveStatus,
      offlineMode,
      syncStatus,
      user,
    ],
  );

  useFocusEffect(
    useCallback(() => {
      void refreshDashboardRouteContext();
    }, [refreshDashboardRouteContext]),
  );

  useEffect(() => {
    void refreshDashboardRouteContext();
  }, [refreshDashboardRouteContext]);

  const dashboardCommandState = useMemo(() => (
    selectDashboardCommandState({
      dashboardView,
      missionBrief: latestMissionBrief,
      summaryLine,
      compactLine,
      topSignalTitle,
      expeditionPhase: aiState?.expeditionPhase,
      expeditionPhaseLabel: aiState?.expeditionPhaseLabel,
      operationalState: aiState?.operationalState,
      operationalSummary: aiState?.operationalSummary,
      operations: orchestrator?.operationalState ?? latestMissionBrief?.operations ?? null,
      liveStatus,
      hasLiveGps: gps.hasFix && (gpsAgeMs == null || gpsAgeMs <= 20000),
      isOnline,
    })
  ), [
    aiState?.expeditionPhase,
    aiState?.expeditionPhaseLabel,
    aiState?.operationalState,
    aiState?.operationalSummary,
    compactLine,
    dashboardView,
    gps.hasFix,
    gpsAgeMs,
    isOnline,
    latestMissionBrief,
    liveStatus,
    orchestrator?.operationalState,
    summaryLine,
    topSignalTitle,
  ]);
  const briefCommandState = useMemo(() => (
    selectBriefCommandState({
      briefView,
      missionBrief: latestMissionBrief,
      summaryLine,
      compactLine,
      topSignalTitle,
      expeditionPhase: aiState?.expeditionPhase,
      expeditionPhaseLabel: aiState?.expeditionPhaseLabel,
      operationalState: aiState?.operationalState,
      operationalSummary: aiState?.operationalSummary,
      operations: orchestrator?.operationalState ?? latestMissionBrief?.operations ?? null,
      liveStatus,
    })
  ), [
    aiState?.expeditionPhase,
    aiState?.expeditionPhaseLabel,
    aiState?.operationalState,
    aiState?.operationalSummary,
    briefView,
    compactLine,
    liveStatus,
    latestMissionBrief,
    orchestrator?.operationalState,
    summaryLine,
    topSignalTitle,
  ]);
  const previousMissionBriefLogRef = useRef<{ id: string; message: string } | null>(null);

  useEffect(() => {
    const currentEntry = summarizeMissionBriefLogEntry(latestMissionBrief, briefCommandState);
    const previousEntry = previousMissionBriefLogRef.current;

    if (previousEntry && (!currentEntry || previousEntry.id !== currentEntry.id)) {
      recordBriefCadEntry({
        id: previousEntry.id,
        text: previousEntry.message,
        mode: 'advisory',
        priority: 4,
        queuedAt: Date.now(),
      });
    }

    previousMissionBriefLogRef.current = currentEntry;
  }, [briefCommandState, latestMissionBrief]);
  const latestMissionBriefLabel = activeTab === 'brief'
    ? (dashboardCommandState.metaLabel ?? compactLineLabel)
    : null;
  // Cleanup advisory store and intelligence engine on unmount
  useEffect(() => {
    return () => {
      advisoryStore.clear();
      resetIntelligence();
    };
  }, []);

  // ── ECS AI Advisory Feed ──────────────────────────────
  // Keeps the rotating ExpeditionIntelligenceBar aware of the
  // orchestrator output without rebuilding a second AI pipeline.
  const lastAdvisoryKeyRef = useRef<string | null>(null);

  useEffect(() => {
    const structuredAdvisory = aiState?.advisories?.[0] ?? null;
    const advisoryText = condenseDashboardLaneCopy(
      structuredAdvisory?.message ?? dashboardCommandState.banner?.title ?? summaryLineLabel,
      88,
    );
    if (!aiState || !advisoryText) return;
    if (
      isLowValueTelemetryDegradedSummary(advisoryText) ||
      isLowValueTelemetryDegradedSummary(dashboardCommandState.banner?.detail) ||
      (
        dashboardCommandState.primary == null &&
        isLowValueTelemetryDegradedSummary(summaryLineLabel)
      )
    ) {
      return;
    }

    const advisoryKey = [
      aiState.readiness,
      structuredAdvisory?.suppressKey ?? dashboardCommandState.primary?.id ?? aiState.topSignal?.title ?? '',
      dashboardCommandState.compactSummary,
      advisoryText,
    ].join('|');

    if (lastAdvisoryKeyRef.current === advisoryKey) return;
    lastAdvisoryKeyRef.current = advisoryKey;

    const icon =
      structuredAdvisory?.severity === 'critical' || aiState.readiness === 'critical'
        ? 'warning-outline'
        : structuredAdvisory?.severity === 'high' ||
            structuredAdvisory?.severity === 'moderate' ||
            aiState.readiness === 'elevated'
          ? 'alert-circle-outline'
          : 'sparkles-outline';
    const advisoryId = buildDashboardAdvisoryId(
      structuredAdvisory?.suppressKey ?? dashboardCommandState.primary?.source,
      dashboardCommandState.primary?.priority?.level,
      structuredAdvisory?.title ?? dashboardCommandState.primary?.title,
      advisoryText,
    );
    const structuredPriority =
      structuredAdvisory?.severity === 'critical'
        ? 5
        : structuredAdvisory?.severity === 'high'
          ? 4
          : structuredAdvisory?.severity === 'moderate'
            ? 3
            : structuredAdvisory?.severity === 'low'
              ? 2
              : structuredAdvisory
                ? 1
                : null;
    const advisoryMode =
      structuredPriority != null
        ? structuredPriority >= 4
          ? 'alert'
          : 'advisory'
        : dashboardCommandState.primary?.priority?.rank != null &&
            dashboardCommandState.primary.priority.rank >= 4
        ? 'alert'
        : 'advisory';

    advisoryStore.pushContextBatch([
      {
        id: advisoryId,
        text: advisoryText,
        mode: advisoryMode,
        priority:
          structuredPriority ??
          dashboardCommandState.primary?.priority?.rank ??
          (aiState.topSignal?.severity === 3 ? 5 : aiState.topSignal?.severity === 2 ? 3 : 2),
        icon,
        displayDuration:
          advisoryMode === 'alert'
            ? 6200
            : 7000,
        interruptible: true,
      },
    ]);
  }, [aiState, dashboardCommandState, summaryLineLabel]);

  const closeDashboardTransientOverlays = useCallback(() => {
    setLibraryVisible(false);
    setLibraryIntent('add');
    setLibraryTargetWidgetType(null);
    setDetailVisible(false);
    setDetailSlot(null);
    setManageVisible(false);
    setManageSlot(null);
    setCreateWidgetVisible(false);
    setCollisionModalVisible(false);
    setPendingCollision(null);
  }, []);

  const restoreDashboardViewState = useCallback((): PersistedDashboardViewState => {
    const restoreProfile: DashboardProfile = 'expedition';
    const nextViewState = readPersistedDashboardViewState(restoreProfile);
    setIsDashboardExpanded((current) => (
      current === nextViewState.expanded ? current : nextViewState.expanded
    ));

    return nextViewState;
  }, []);

  const syncDashboardStoreState = useCallback((
    tab: DashboardTab,
  ) => {
    const profile = dashboardProfileForTab(tab);
    const nextGridLayout = dashboardStore.getGridLayout(profile);
    const nextSlots = dashboardStore.getProfileSlots(profile);
    const nextAdvancedModeEnabled = dashboardStore.getAdvancedModeEnabled();

    setGridLayout((current) => (current === nextGridLayout ? current : nextGridLayout));
    setSlots((current) => (areDashboardSlotsEquivalent(current, nextSlots) ? current : [...nextSlots]));
    setAdvancedModeEnabled((current) => (current === nextAdvancedModeEnabled ? current : nextAdvancedModeEnabled));
  }, []);

  useEffect(() => {
    let cancelled = false;

    const finalizeHydration = () => {
      if (cancelled) return;
      const restoredViewState = restoreDashboardViewState();
      closeDashboardTransientOverlays();
      setActiveTab(restoredViewState.dashboardTab);
      syncDashboardStoreState(restoredViewState.dashboardTab);
      setDashboardHydrated(true);
    };

    if (isDashboardHydrated()) {
      finalizeHydration();
      return () => {
        cancelled = true;
      };
    }

    waitForDashboardHydration()
      .then(finalizeHydration)
      .catch(() => {
        if (!cancelled) {
          setDashboardHydrated(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [closeDashboardTransientOverlays, restoreDashboardViewState, syncDashboardStoreState]);

  useEffect(() => {
    if (!dashboardHydrated) return;
    if (activeTab === 'expedition') return;

    const nextDashboardTab =
      activeTab === 'brief' ? 'brief' : 'expedition';
    const nextPersistedState = {
      ...dashboardStore.getUIState(activeProfile),
      expanded: isDashboardExpanded,
      dashboardTab: nextDashboardTab,
    };

    dashboardStore.saveUIState(activeProfile, nextPersistedState);
    if (activeTab === 'widgets') dashboardStore.setLastSelectedTab('expedition');
  }, [
    activeProfile,
    activeTab,
    dashboardHydrated,
    isDashboardExpanded,
  ]);

  useFocusEffect(useCallback(() => {
    if (!dashboardHydrated) return;
    let cancelled = false;
    const now = Date.now();
    const shouldRefreshShell = now - lastDashboardFocusSyncRef.current > 450;
    if (shouldRefreshShell) {
      lastDashboardFocusSyncRef.current = now;
    }
    closeDashboardTransientOverlays();
    if (shouldRefreshShell) {
      refreshActiveTrip();
      refreshActiveVehicleData();
      syncDashboardStoreState(activeTab);
    }

    void (async () => {
      const flow = await consumeNavigationFlow('dashboard');
      if (cancelled || !flow) return;

      closeDashboardTransientOverlays();
      if (
        flow.intent === 'vehicle_context_updated' ||
        flow.intent === 'vehicle_ready_confirmed' ||
        flow.intent === 'navigation_ended'
      ) {
        refreshActiveVehicleData();
        refreshActiveTrip();
        syncDashboardStoreState(activeTab);
      }

      if (flow.message) {
        showToast(flow.message);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    refreshActiveTrip,
    refreshActiveVehicleData,
    activeTab,
    dashboardHydrated,
    syncDashboardStoreState,
    closeDashboardTransientOverlays,
    showToast,
  ]));

  // ── Tab Switch Handler ────────────────────────────────
  useFocusEffect(
    useCallback(() => {
      return () => {
        closeDashboardTransientOverlays();
        setLayoutMode(false);
      };
    }, [closeDashboardTransientOverlays])
  );

  const handleTabSwitch = useCallback((newTab: DashboardTab) => {
    if (newTab === activeTab) return;
    const transitionCycle = ++tabTransitionCycleRef.current;

    const currentIndex = tabIndexFor(activeTab);
    const nextIndex = tabIndexFor(newTab);
    const slideDirection = nextIndex > currentIndex ? -TAB_SLIDE_PX : TAB_SLIDE_PX;

    closeDashboardTransientOverlays();

    // Exit layout mode on tab switch
    if (layoutMode) {
      setLayoutMode(false);
    }

    // ── FIX: Separate native-driven and JS-driven animations ──
    // underlineAnim uses useNativeDriver: false (animates layout position/color).
    // tabOpacityAnim and tabSlideAnim use useNativeDriver: true (opacity/transform).
    // Mixing them in a single Animated.parallel can cause driver conflicts.
    // Run them independently instead.
    underlineAnim.stopAnimation();
    tabOpacityAnim.stopAnimation();
    tabSlideAnim.stopAnimation();

    const applyTabSwitch = () => {
      const persistedViewState = readPersistedDashboardViewState(
        dashboardProfileForTab(newTab),
      );
      const nextViewState: PersistedDashboardViewState =
        newTab === 'brief'
          ? {
              ...persistedViewState,
              dashboardTab: 'brief',
            }
          : newTab === 'expedition'
            ? {
                ...persistedViewState,
                dashboardTab: 'expedition',
              }
          : {
              ...persistedViewState,
              dashboardTab: 'widgets',
            };

      setActiveTab(nextViewState.dashboardTab);
      syncDashboardStoreState(newTab);
      setIsDashboardExpanded((current) => (
        current === nextViewState.expanded ? current : nextViewState.expanded
      ));
    };

    // JS-driven underline animation (runs independently)
    Animated.timing(underlineAnim, {
      toValue: tabIndexFor(newTab),
      duration: TAB_ANIM_DURATION,
      easing: EASING.standard,
      useNativeDriver: false,
    }).start();

    const shouldBypassAnimatedTransition = activeTab === 'brief' || newTab === 'brief';
    if (shouldBypassAnimatedTransition) {
      applyTabSwitch();
      tabOpacityAnim.setValue(1);
      tabSlideAnim.setValue(0);
      return;
    }

    // Native-driven content animations (animate out → switch → animate in)
    Animated.parallel([
      Animated.timing(tabOpacityAnim, {
        toValue: 0, duration: MOTION.tabFadeOut, easing: EASING.accelerate, useNativeDriver: true,
      }),
      Animated.timing(tabSlideAnim, {
        toValue: slideDirection, duration: MOTION.tabFadeOut, easing: EASING.accelerate, useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      if (!finished || transitionCycle !== tabTransitionCycleRef.current) return;
      applyTabSwitch();

      // Reset slide position for entrance
      tabSlideAnim.setValue(-slideDirection);

      // Animate in (native-driven only)
      Animated.parallel([
        Animated.timing(tabOpacityAnim, {
          toValue: 1, duration: MOTION.tabFadeIn, easing: EASING.decelerate, useNativeDriver: true,
        }),
        Animated.timing(tabSlideAnim, {
          toValue: 0, duration: MOTION.tabFadeIn, easing: EASING.decelerate, useNativeDriver: true,
        }),
      ]).start();
    });

  }, [activeTab, layoutMode, tabOpacityAnim, tabSlideAnim, underlineAnim, syncDashboardStoreState, closeDashboardTransientOverlays]);

  // ── Keep handleTabSwitchRef in sync ───────────────────
  // The ref is used by auto-mode engine and mode switch handlers
  // to call handleTabSwitch without temporal dead zone issues.
  useEffect(() => {
    handleTabSwitchRef.current = handleTabSwitch;
  }, [handleTabSwitch]);

  const widgetData = useMemo(() => ({
      activeTrip,
      loadItems: effectiveLoadItems,
      riskScore,
    waypoints,
    userSettings,
    syncStatus,
    latestMissionBrief,
    dashboardCommandState,
    aiState,
    aiOrchestrator: orchestrator,
    aiDashboardView: dashboardView,
    aiSummaryLine: summaryLine,
    aiCompactLine: dashboardCommandState.compactSummary || compactLine,
    aiTopSignalTitle: dashboardCommandState.metaSignal || topSignalTitle,
    aiIsActive: isAIActive,
    aiReadiness: aiState?.readiness ?? 'offline',
    aiTelemetryConfidence: aiState?.telemetryConfidence ?? 0,
    aiWeatherConfidence: aiState?.weatherConfidence ?? 0,
    aiRouteConfidence: aiState?.routeConfidence ?? 0,
    bluPowerState,
      powerAuthority: bluPowerState,
      powerProviderLabel: primaryPowerProviderLabel,
      powerDeviceLabel: primaryPowerDeviceLabel,
      powerFreshness: primaryPowerFreshness,
      telemetry: {
        hasData: dashboardTelemetry.hasData,
        freshnessLabel: dashboardTelemetry.freshnessLabel,
        isWithinGraceWindow: dashboardTelemetry.isWithinGraceWindow,
        engineStatus: dashboardTelemetry.engineStatus,
        lastUpdatedText: dashboardTelemetry.lastUpdatedText,
      },
      telemetryScanner: {
        isConnected: telemetryScanner.isConnected,
        isConnecting: telemetryScanner.isConnecting,
        isReconnecting: telemetryScanner.isReconnecting,
        error: telemetryScanner.error ?? null,
      },
      weatherSnapshot: dashboardWeather.snapshot,
      activeVehicleContext,
      gps: {
        hasFix: gps.hasFix,
      },
    }), [
    activeTrip,
    effectiveLoadItems,
    riskScore,
    waypoints,
    userSettings,
    syncStatus,
    latestMissionBrief,
    dashboardCommandState,
    aiState,
    orchestrator,
    dashboardView,
    summaryLine,
    compactLine,
    topSignalTitle,
    isAIActive,
      bluPowerState,
      primaryPowerProviderLabel,
      primaryPowerDeviceLabel,
      primaryPowerFreshness,
      dashboardTelemetry.hasData,
      dashboardTelemetry.freshnessLabel,
      dashboardTelemetry.isWithinGraceWindow,
      dashboardTelemetry.engineStatus,
      dashboardTelemetry.lastUpdatedText,
      telemetryScanner.isConnected,
      telemetryScanner.isConnecting,
      telemetryScanner.isReconnecting,
      telemetryScanner.error,
      dashboardWeather.snapshot,
      activeVehicleContext,
      gps.hasFix,
    ]);



  const handleGridLayoutChange = useCallback((layout: GridLayout) => {
    dashboardStore.setGridLayout(activeProfile, layout);
    setGridLayout(dashboardStore.getGridLayout(activeProfile));
    setSlots(dashboardStore.getProfileSlots(activeProfile));
    setWidgetContainerLayout({ width: 0, height: 0, signature: '' });
  }, [activeProfile]);

  const handleWidgetAssign = useCallback((type: string) => {
    if (libraryIntent === 'replace' && libraryTargetWidgetType === 'attitude-command') {
      if (type === 'navigate-surface') {
        ecsCommandModuleStore.setSelectedModule('follow3d');
      } else {
        ecsCommandModuleStore.setSelectedModule('attitude');
      }
      setSlots(dashboardStore.getProfileSlots(activeProfile));
      setLibraryVisible(false);
      setLibraryIntent('add');
      setLibraryTargetWidgetType(null);
      setManageVisible(false);
      setManageSlot(null);
      return;
    }

    const assigned = dashboardStore.assignWidget(activeProfile, libraryTargetSlot, type);
    if (!assigned) {
      showToast('Dashboard region full. Use one 2x2 widget or two stacked 2x1 widgets.');
      return;
    }
    setSlots(dashboardStore.getProfileSlots(activeProfile));
    setLibraryVisible(false);
    setLibraryIntent('add');
    setLibraryTargetWidgetType(null);
    setManageVisible(false);
    setManageSlot(null);
  }, [activeProfile, libraryIntent, libraryTargetSlot, libraryTargetWidgetType, showToast]);

  const handleCustomWidgetSaved = useCallback(() => {
    setCreateWidgetVisible(false);
    setSlots(dashboardStore.getProfileSlots(activeProfile));
  }, [activeProfile]);

  const handleWidgetRemove = useCallback((slotIndex: number) => {
    dashboardStore.removeWidget(activeProfile, slotIndex);
    const newSlots = dashboardStore.getProfileSlots(activeProfile);
    setSlots([...newSlots]); // Force new array reference for re-render
  }, [activeProfile]);

  const handleDetailRemove = useCallback(() => {
    if (detailSlot) {
      dashboardStore.removeWidget(activeProfile, detailSlot.slotIndex);
      setSlots([...dashboardStore.getProfileSlots(activeProfile)]);
      setDetailVisible(false);
      setDetailSlot(null);
    }
  }, [activeProfile, detailSlot]);

  const handleDetailReplace = useCallback(() => {
    if (!detailSlot) return;
    setLibraryIntent('replace');
    setLibraryTargetSlot(detailSlot.slotIndex);
    setLibraryTargetWidgetType(detailSlot.widgetType ?? null);
    setDetailVisible(false);
    setLibraryVisible(true);
  }, [detailSlot]);

  const handleCloseWidgetManager = useCallback(() => {
    setManageVisible(false);
    setManageSlot(null);
  }, []);

  const handleManagedWidgetReplace = useCallback(() => {
    if (!manageSlot) return;
    setLibraryIntent('replace');
    setLibraryTargetSlot(manageSlot.slotIndex);
    setLibraryTargetWidgetType(manageSlot.widgetType ?? null);
    setManageVisible(false);
    setLibraryVisible(true);
  }, [manageSlot]);

  const handleManagedWidgetRemove = useCallback(() => {
    if (!manageSlot) return;
    dashboardStore.removeWidget(activeProfile, manageSlot.slotIndex);
    setSlots([...dashboardStore.getProfileSlots(activeProfile)]);
    setManageVisible(false);
    setManageSlot(null);
  }, [activeProfile, manageSlot]);

  const handleSwapSlots = useCallback((from: number, to: number) => {
    dashboardStore.swapSlots(activeProfile, from, to);
    setSlots(dashboardStore.getProfileSlots(activeProfile));
  }, [activeProfile]);

  // ── Resize Widget with Collision Detection ─────────────
  const handleResizeWidget = useCallback((slotIndex: number, newSize: WidgetSize) => {
    // Run collision detection before applying the resize
    const collision = detectResizeCollision(slots, gridLayout, slotIndex, newSize);

    if (collision.hasCollision) {
      // Collision detected — show warning modal
      const targetSlot = slots.find(s => s.slotIndex === slotIndex);
      const catalog = getFullWidgetCatalog();
      const widgetDef = catalog.find(w => w.type === targetSlot?.widgetType);
      const widgetName = widgetDef?.name || targetSlot?.widgetType || 'Widget';

      setPendingCollision(collision);
      setPendingResizeSlot(slotIndex);
      setPendingResizeSize(newSize);
      setPendingResizeWidgetName(widgetName);
      setCollisionModalVisible(true);
    } else {
      // No collision — apply resize immediately
      dashboardStore.setWidgetSize(activeProfile, slotIndex, newSize);
      setSlots([...dashboardStore.getProfileSlots(activeProfile)]);
    }
  }, [activeProfile, slots, gridLayout]);

  // ── Shrink Conflicting Widgets & Apply Resize ─────────
  const handleShrinkAndResize = useCallback(() => {
    if (!pendingCollision) return;

    // Step 1: Shrink all conflicting widgets to 1x1
    for (const conflict of pendingCollision.conflictingSlots) {
      dashboardStore.setWidgetSize(activeProfile, conflict.slotIndex, '1x1');
    }

    // Step 2: Apply the pending resize
    dashboardStore.setWidgetSize(activeProfile, pendingResizeSlot, pendingResizeSize);

    // Step 3: Refresh slots and close modal
    setSlots([...dashboardStore.getProfileSlots(activeProfile)]);
    setCollisionModalVisible(false);
    setPendingCollision(null);
  }, [activeProfile, pendingCollision, pendingResizeSlot, pendingResizeSize]);

  // ── Cancel Resize ─────────────────────────────────────
  const handleCancelResize = useCallback(() => {
    setCollisionModalVisible(false);
    setPendingCollision(null);
  }, []);

  // ── Apply Layout Preset (built-in) ─────────────────────
  // ── Apply Custom Preset (user-saved) ──────────────────
  const handleRestoreDefaults = useCallback(() => {
    Alert.alert(
      'Restore Defaults?',
      'This will reset the dashboard to the default 2-widget stack (Vehicle Systems + Attitude Monitor).',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Restore Defaults',
          onPress: () => {
            dashboardStore.restoreDefaults(activeProfile);
            setGridLayout(dashboardStore.getGridLayout(activeProfile));
            setSlots(dashboardStore.getProfileSlots(activeProfile));
            setLayoutMode(false);
          },
        },
      ]
    );
  }, [activeProfile]);

  const handleExitLayoutMode = useCallback(() => {
    setLayoutMode(false);
  }, []);

  const handleEnterCustomizeMode = useCallback(() => {
    setLayoutMode(true);
  }, []);

  const handleContainerLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (height <= 0 || width <= 0) return;

    setWidgetContainerLayout((prev) => {
      const sameSignature = prev.signature === dashboardLayoutSignature;
      const sameWidth = Math.abs(prev.width - width) < 2;
      const sameHeight = Math.abs(prev.height - height) < 2;
      if (sameSignature && sameWidth && sameHeight) return prev;
      return {
        width,
        height,
        signature: dashboardLayoutSignature,
      };
    });
  }, [dashboardLayoutSignature]);



  // Check if current tab is empty
  const allEmpty = slots.every(s => !s.widgetType);
  const assignedWidgets = slots.map(s => s.widgetType);

  // ── Mode Color Cue: Active tab accent color (non-animated) ──
  const expeditionAccent = palette.amber;

  const showEcsBriefMeta =
    activeTab === 'brief' &&
    !!latestMissionBriefLabel &&
    (isAIActive || dashboardCommandState.surface.visible);
  const startupHydrating = !dashboardHydrated;

  const handleToggleDashboardExpanded = useCallback(() => {
    setIsDashboardExpanded((current) => !current);
  }, []);

  const handleOpenPowerConnections = useCallback(() => {
      try {
        router.push('/power');
    } catch {
      try {
        router.push('/power/blu');
      } catch {
        console.warn('[dashboard] Failed to open power route');
        showToast('Power manager unavailable');
      }
      }
    }, [router, showToast]);

  const handleOpenTelemetrySetup = useCallback(() => {
      try {
        router.push('/vehicle-telemetry-settings');
      } catch {
        try {
          router.push('/obd-setup');
        } catch {
          console.warn('[dashboard] Failed to open telemetry setup route');
          showToast('Telemetry setup unavailable');
        }
      }
    }, [router, showToast]);

  const handleOpenNavigate = useCallback(() => {
      closeDashboardTransientOverlays();
      void stageNavigationFlow({
        source: 'dashboard',
        target: 'navigate',
        intent: 'quick_action',
        label: 'Navigate Ready',
        message: 'Navigate opened from Dashboard quick actions.',
      });
      try {
        router.push('/navigate');
      } catch {
        console.warn('[dashboard] Failed to open navigate route');
        showToast('Navigate unavailable');
      }
    }, [closeDashboardTransientOverlays, router, showToast]);

  const handleOpenFleet = useCallback(() => {
      closeDashboardTransientOverlays();
      void stageNavigationFlow({
        source: 'dashboard',
        target: 'fleet',
        intent: 'quick_action',
        label: 'Fleet Ready',
        message: 'Fleet opened from Dashboard quick actions.',
      });
      try {
        router.push('/fleet');
      } catch {
        console.warn('[dashboard] Failed to open fleet route');
        showToast('Fleet unavailable');
      }
    }, [closeDashboardTransientOverlays, router, showToast]);

  const handleOpenCommandBrief = useCallback(() => {
    closeDashboardTransientOverlays();
    handleTabSwitchWithModeSync('brief');
  }, [closeDashboardTransientOverlays, handleTabSwitchWithModeSync]);

  const handleRemotenessNavigateFromDetail = useCallback(
    async (target: RemotenessNavigationTargetType) => {
      const latitude = gps.position?.latitude ?? null;
      const longitude = gps.position?.longitude ?? null;

      if (!gps.hasFix || latitude == null || longitude == null) {
        console.warn('[REMOTENESS_NAV] failure reason=gps_unavailable');
        showToast('Current location unavailable');
        return;
      }

      const destinationType = mapRemotenessTargetToDestinationType(target);
      const resolvedTarget = resolveRemotenessDestination(
        remotenessStore.getIndex(),
        destinationType,
        { log: true },
      );

      if (!resolvedTarget) {
        console.warn(`[REMOTENESS_NAV] failure reason=destination_unavailable type=${target}`);
        showToast(getRemotenessNavigationUnavailableMessage(target));
        return;
      }

      try {
        ecsLog.debug('MAP', '[REMOTENESS_NAV] start', { target, label: resolvedTarget.label });
        const payload = buildRemotenessDestinationNavigationPayload(resolvedTarget);
        closeDashboardTransientOverlays();
        await saveNavigationHandoffPayload(payload);
        await stageNavigationFlow({
          source: 'dashboard',
          target: 'navigate',
          intent: 'route_preview',
          label: `${getRemotenessNavigationLabel(target)} Ready`,
          message: `${getRemotenessNavigationLabel(target)} loaded in Navigate.`,
          context: {
            routeId: payload.id,
            tripMode: payload.tripMode,
            autoStartNavigation: true,
            remotenessTargetType: target,
            remotenessTargetSource: resolvedTarget.source,
          },
        });
        ecsLog.debug('MAP', '[REMOTENESS_NAV] route_created', { target });
        router.push('/navigate');
        showToast(`Routing to ${resolvedTarget.label}`);
      } catch {
        console.warn('[REMOTENESS_NAV] failure reason=handoff_failed');
        showToast(`${getRemotenessNavigationLabel(target)} unavailable`);
      }
    },
    [
      closeDashboardTransientOverlays,
      gps.hasFix,
      gps.position?.latitude,
      gps.position?.longitude,
      router,
      showToast,
    ],
  );

    const handleOpenCreateCustomWidget = useCallback(() => {
      setLibraryVisible(false);
      setCreateWidgetVisible(true);
  }, []);

  const handleCloseWidgetDetail = useCallback(() => {
    setDetailVisible(false);
    setDetailSlot(null);
  }, []);

  const handleCloseLibrary = useCallback(() => {
    setLibraryVisible(false);
    setLibraryIntent('add');
    setLibraryTargetWidgetType(null);
  }, []);

  const handleWidgetLongPress = useCallback((slot: WidgetSlot) => {
    if (layoutMode || !slot.widgetType) return;
    closeDashboardTransientOverlays();
    setManageSlot(slot);
    setManageVisible(true);
  }, [closeDashboardTransientOverlays, layoutMode]);

  const handleEmptySlotPress = useCallback((slotIndex: number) => {
    closeDashboardTransientOverlays();
    setLibraryIntent('add');
    setLibraryTargetSlot(slotIndex);
    setLibraryTargetWidgetType(null);
    setLibraryVisible(true);
  }, [closeDashboardTransientOverlays]);

  const dashboardPageSupportState = useMemo<DashboardPageSupportState | null>(() => {
    if (!dashboardHydrated || activeTab === 'brief' || allEmpty || layoutMode) {
      return null;
    }

    const hasActiveVehicle = Boolean(activeVehicleData || activeVehicleContext.vehicle);
    const gpsUnavailableHard =
      gps.permissionDenied ||
      !gps.isAvailable ||
      gps.gpsStatus === 'UNAVAILABLE';
    const gpsLiveForMessaging = gps.hasFix || hasDashboardRouteContext;
    const gpsWaiting =
      !gps.permissionDenied &&
      !gpsUnavailableHard &&
      !gpsLiveForMessaging &&
      (gps.gpsStatus === 'ACQUIRING' || gps.gpsStatus === 'RETRYING');
    const routeInactive = !hasDashboardRouteContext;
    const telemetryRecovering =
      dashboardTelemetry.isReconnecting ||
      telemetryScanner.isConnecting ||
      telemetryScanner.isReconnecting ||
      dashboardTelemetry.freshnessLabel === 'reconnecting';
    const telemetryUnavailable = !dashboardTelemetry.hasData && !telemetryRecovering;
    const powerRecovering =
      bluPowerState.isReconnecting || bluPowerState.freshness === 'reconnecting';
    const powerUnavailable = !bluPowerState.hasPowerData && !powerRecovering;
    const weatherKind = dashboardWeather.snapshot.status.kind;
    const weatherRecovering = weatherKind === 'loading';
    const weatherCached = weatherKind === 'offline' || weatherKind === 'stale';
    const weatherUnavailable =
      weatherKind === 'error' ||
      weatherKind === 'permission-blocked' ||
      weatherKind === 'network-blocked';

    const chips: string[] = [];
    const pushChip = (value: string | null | undefined) => {
      if (!value || chips.includes(value)) return;
      chips.push(value);
    };

    if (syncStatus === 'syncing') pushChip('Syncing context');
    if (!isOnline) pushChip('Offline support');
    if (gps.permissionDenied) pushChip('Location needed');
    else if (gpsUnavailableHard) pushChip('GPS unavailable');
    else if (gpsWaiting) pushChip('Waiting for GPS');
    if (routeInactive) pushChip('No route staged');
    if (telemetryRecovering) pushChip('Telemetry reconnecting');
    else if (telemetryUnavailable) pushChip('Vehicle profile only');
    if (powerRecovering) pushChip('Power reconnecting');
    else if (powerUnavailable) pushChip('No live power feed');
    if (weatherRecovering) pushChip('Weather updating');
    else if (weatherCached) pushChip('Cached weather');
    else if (weatherUnavailable) pushChip('Weather limited');

    if (!hasActiveVehicle) {
      return {
        visible: true,
        modeLabel: 'PROFILE REQUIRED',
        title: ECS_STATE_COPY.dashboard.noActiveVehicle.title,
        detail: ECS_STATE_COPY.dashboard.noActiveVehicle.message,
        icon: 'car-sport-outline',
        tone: 'info',
        chips,
        actionLabel: ECS_STATE_COPY.dashboard.noActiveVehicle.ctaLabel,
        onAction: handleOpenFleet,
      };
    }

    if (syncStatus === 'syncing' || (isOnline && (telemetryRecovering || powerRecovering || weatherRecovering))) {
      return {
        visible: true,
        modeLabel: 'SYNCING CONTEXT',
        title: 'Dashboard inputs updating',
        detail: 'Vehicle, route, and weather context are updating. Widgets stay available while ECS catches up.',
        icon: 'sync-outline',
        tone: 'info',
        chips,
      };
    }

    if (!isOnline && !gps.hasFix) {
      return {
        visible: true,
        modeLabel: 'OFFLINE SUPPORT',
        title: 'Running from saved context',
        detail: 'Dashboard is using saved vehicle, route, and expedition context until connectivity and live position return.',
        icon: 'cloud-offline-outline',
        tone: 'warning',
        chips,
      };
    }

    if (!isOnline) {
      return {
        visible: true,
        modeLabel: 'OFFLINE SUPPORT',
        title: 'Remote context is limited',
        detail: 'Live GPS remains available. Weather and remote summaries are using saved context where possible.',
        icon: 'cloud-offline-outline',
        tone: 'warning',
        chips,
      };
    }

    if (gps.permissionDenied) {
      return {
        visible: true,
        modeLabel: 'LIMITED LIVE INPUTS',
        title: 'Location access needed',
        detail: 'Enable location to restore live route-aware summaries and weather targeting across the dashboard.',
        icon: 'locate-outline',
        tone: 'info',
        chips,
      };
    }

    if (gpsUnavailableHard) {
      return {
        visible: true,
        modeLabel: 'LIMITED LIVE INPUTS',
        title: 'Location source unavailable',
        detail: 'Dashboard is holding its layout with saved context until a usable location source returns.',
        icon: 'locate-outline',
        tone: 'info',
        chips,
      };
    }

    if (gpsWaiting) {
      return {
        visible: true,
        modeLabel: 'LIMITED LIVE INPUTS',
        title: 'Waiting for live position',
        detail: 'Widgets stay available while ECS acquires a fresh GPS fix for route-aware context.',
        icon: 'locate-outline',
        tone: 'info',
        chips,
      };
    }

    if (telemetryUnavailable && powerUnavailable && routeInactive) {
      return {
        visible: true,
        modeLabel: 'PROFILE CONTEXT',
        title: 'Dashboard ready with saved vehicle context',
        detail: gps.hasFix
          ? 'Live GPS is available. Vehicle and power widgets are using the active rig profile until live feeds reconnect.'
          : 'Vehicle and power widgets are using the active rig profile and saved expedition context until live feeds reconnect.',
        icon: 'layers-outline',
        tone: 'neutral',
        chips,
        actionLabel: ECS_STATE_COPY.dashboard.noRouteActive.ctaLabel,
        onAction: handleOpenNavigate,
      };
    }

    if (routeInactive) {
      return {
        visible: true,
        modeLabel: 'READY FOR NAVIGATION',
        title: gps.hasFix ? 'Route planning ready' : ECS_STATE_COPY.dashboard.noRouteActive.title,
        detail: gps.hasFix
          ? 'Live GPS and the active rig profile are ready. Start navigation to populate route progress and route-aware widgets.'
          : ECS_STATE_COPY.dashboard.noRouteActive.message,
        icon: 'navigate-outline',
        tone: 'neutral',
        chips,
        actionLabel: ECS_STATE_COPY.dashboard.noRouteActive.ctaLabel,
        onAction: handleOpenNavigate,
      };
    }

    if (telemetryUnavailable) {
      return {
        visible: true,
        modeLabel: 'PROFILE CONTEXT',
        title: ECS_STATE_COPY.dashboard.liveTelemetryUnavailable.title,
        detail: 'Vehicle-aware widgets are using the active rig profile and recent saved context until telemetry returns.',
        icon: 'speedometer-outline',
        tone: 'neutral',
        chips,
        actionLabel: 'Telemetry Setup',
        onAction: handleOpenTelemetrySetup,
      };
    }

    if (powerUnavailable) {
      return {
        visible: true,
        modeLabel: 'MANUAL POWER',
        title: 'Power feed unavailable',
        detail: 'Dashboard power summaries are using configured capacity and saved values until a BLU connection returns.',
        icon: 'flash-outline',
        tone: 'neutral',
        chips,
        actionLabel: 'Power Setup',
        onAction: handleOpenPowerConnections,
      };
    }

    if (weatherCached || weatherUnavailable) {
      return {
        visible: true,
        modeLabel: weatherCached ? 'CACHED WEATHER' : 'WEATHER LIMITED',
        title: weatherCached ? 'Weather is running from saved forecast' : 'Weather context unavailable',
        detail: weatherCached
          ? 'Forecast-aware widgets are holding to cached weather until a fresh refresh completes.'
          : 'Dashboard weather context is temporarily unavailable, but vehicle and route surfaces remain usable.',
        icon: 'rainy-outline',
        tone: 'neutral',
        chips,
      };
    }

    return null;
  }, [
    activeTab,
    activeVehicleContext.vehicle,
    activeVehicleData,
    allEmpty,
    dashboardHydrated,
    bluPowerState.freshness,
    bluPowerState.hasPowerData,
    bluPowerState.isReconnecting,
    dashboardTelemetry.freshnessLabel,
    dashboardTelemetry.hasData,
    dashboardTelemetry.isReconnecting,
    dashboardWeather.snapshot.status.kind,
    gps.gpsStatus,
    gps.hasFix,
    gps.isAvailable,
    gps.permissionDenied,
    handleOpenFleet,
    handleOpenNavigate,
    handleOpenPowerConnections,
    handleOpenTelemetrySetup,
    hasDashboardRouteContext,
    isOnline,
    layoutMode,
    syncStatus,
    telemetryScanner.isConnecting,
    telemetryScanner.isReconnecting,
  ]);

  const dashboardTopLaneAdvisory = useMemo<DashboardLaneState>(() => {
    const routeShellActive =
      hasDashboardRouteContext &&
      (dashboardShellBannerStatus.source.startsWith('route_') ||
        dashboardShellBannerStatus.diagnostics.routeUsable);

    if (routeShellActive) {
      const routeTitle = condenseDashboardLaneCopy(
        dashboardCommandState.banner?.title || 'Active route guidance live',
        74,
      );
      const routeDetail = pickDashboardLaneDetail(
        dashboardShellBannerStatus.statusDetail,
        dashboardCommandState.banner?.detail,
        gpsAgeMs != null && gpsAgeMs > 20000
          ? 'Location is aging. Awaiting a fresher fix.'
          : gps.hasFix
            ? `GPS live | ${gps.fixQuality.toLowerCase()} fix`
            : null,
      );

      return {
        override: {
          title: routeTitle,
          detail: routeDetail,
          badge: dashboardShellBannerStatus.statusLabel,
          icon: (dashboardCommandState.banner?.icon as any) ?? 'navigate-outline',
          tone:
            dashboardShellBannerStatus.tone === 'degraded' ||
            dashboardShellBannerStatus.tone === 'offline'
              ? 'warning'
              : dashboardShellBannerStatus.tone === 'offline_capable'
                ? 'info'
                : 'active',
          live: true,
        },
        source: 'route_context',
        reason: dashboardCommandState.banner?.title ?? dashboardShellBannerStatus.reason,
        priority: 100,
        suppressedSources: [
          ...(dashboardPageSupportState?.visible ? ['page_support'] : []),
          ...(gps.permissionDenied ? ['gps_permission'] : []),
          ...(!gps.isAvailable || gps.gpsStatus === 'UNAVAILABLE' ? ['gps_unavailable'] : []),
          ...(!gps.hasFix || gps.gpsStatus === 'ACQUIRING' || gps.gpsStatus === 'RETRYING' ? ['gps_waiting'] : []),
        ],
      };
    }

    if (dashboardPageSupportState?.visible) {
      const supportTitle = condenseDashboardLaneCopy(dashboardPageSupportState.title, 74);
      const supportDetail = condenseDashboardLaneCopy(dashboardPageSupportState.detail);
      const bannerTitle = condenseDashboardLaneCopy(dashboardCommandState.banner?.title);
      const bannerDetail = condenseDashboardLaneCopy(dashboardCommandState.banner?.detail);
      const gpsDetail =
        gpsAgeMs != null && gpsAgeMs > 20000
          ? 'Location is aging. Awaiting a fresher fix.'
          : gps.hasFix
            ? `GPS live | ${gps.fixQuality.toLowerCase()} fix`
            : null;

      return {
        override: {
          title: supportTitle,
          detail: pickDashboardLaneDetail(
            supportDetail !== supportTitle ? supportDetail : null,
            bannerDetail,
            bannerTitle !== supportTitle ? bannerTitle : null,
            gpsDetail,
          ),
          badge: dashboardPageSupportState.modeLabel,
          icon: dashboardPageSupportState.icon,
          tone: mapDashboardPageSupportTone(dashboardPageSupportState.tone),
          live: gps.hasFix && isOnline,
        },
        source: 'page_support',
        reason: dashboardPageSupportState.title,
        priority: 90,
        suppressedSources: dashboardCommandState.banner ? ['command_banner'] : [],
      };
    }

    if (gps.permissionDenied) {
      return {
        override: {
          title: 'Location Permission Required',
          detail: 'Enable location to restore live route-aware intelligence.',
          badge: 'LOCATION',
          icon: 'locate-outline' as const,
          tone: 'warning' as const,
          live: false,
        },
        source: 'gps_permission',
        reason: 'Location permission is blocked for dashboard context.',
        priority: 82,
        suppressedSources: dashboardCommandState.banner ? ['command_banner'] : [],
      };
    }

    if (!gps.isAvailable || gps.gpsStatus === 'UNAVAILABLE') {
      return {
        override: {
          title: 'Location Unavailable',
          detail: 'Dashboard is using saved context until location returns.',
          badge: 'GPS',
          icon: 'locate-outline' as const,
          tone: 'unavailable' as const,
          live: false,
        },
        source: 'gps_unavailable',
        reason: 'No usable location source is available for dashboard context.',
        priority: 80,
        suppressedSources: dashboardCommandState.banner ? ['command_banner'] : [],
      };
    }

    if (!gps.hasFix || gps.gpsStatus === 'ACQUIRING' || gps.gpsStatus === 'RETRYING') {
      return {
        override: {
          title: gps.gpsStatus === 'RETRYING' ? 'Updating Location Fix' : 'Waiting for Location',
          detail: 'Dashboard detail will deepen as soon as ECS has a fresh position fix.',
          badge: 'GPS',
          icon: 'locate-outline' as const,
          tone: 'info' as const,
          live: false,
        },
        source: 'gps_waiting',
        reason: 'Dashboard is waiting for a first usable live GPS fix.',
        priority: 76,
        suppressedSources: dashboardCommandState.banner ? ['command_banner'] : [],
      };
    }

    if (!isOnline) {
      return {
        override: {
          title: 'ECS Limited to Local Context',
          detail: 'Showing live GPS with offline vehicle and route context only.',
          badge: 'OFFLINE',
          icon: 'cloud-offline-outline' as const,
          tone: 'warning' as const,
          live: true,
        },
        source: 'offline_local',
        reason: 'Dashboard is online-limited and operating from local route and vehicle context.',
        priority: 74,
        suppressedSources: dashboardCommandState.banner ? ['command_banner'] : [],
      };
    }

    if (dashboardCommandState.banner) {
      return {
        override: {
          title: condenseDashboardLaneCopy(dashboardCommandState.banner.title, 74),
          detail: pickDashboardLaneDetail(
            dashboardCommandState.banner.detail,
            gpsAgeMs != null && gpsAgeMs > 20000
              ? 'Location is aging. Awaiting a fresher fix.'
              : `GPS live | ${gps.fixQuality.toLowerCase()} fix`,
          ),
          badge: dashboardCommandState.banner.badge,
          icon: dashboardCommandState.banner.icon as any,
          tone: dashboardCommandState.banner.tone,
          live: dashboardCommandState.banner.live,
        },
        source: 'command_banner',
        reason: dashboardCommandState.banner.title,
        priority: 70,
        suppressedSources: [],
      };
    }

    return {
      override: {
        title: 'ECS Ready - Awaiting Route Context',
        detail: `GPS live | ${gps.fixQuality.toLowerCase()} fix`,
        badge: 'ECS READY',
        icon: 'sparkles-outline' as const,
        tone: 'ready' as const,
        live: true,
      },
      source: 'default_ready',
      reason: 'dashboard_ready',
      priority: 50,
      suppressedSources: [],
    };
  }, [
    dashboardCommandState.banner,
    dashboardPageSupportState,
    dashboardShellBannerStatus,
    gps.fixQuality,
    gps.gpsStatus,
    gps.hasFix,
    gps.isAvailable,
    gps.permissionDenied,
    gpsAgeMs,
    hasDashboardRouteContext,
    isOnline,
  ]);

  const dashboardLaneLogKeyRef = useRef<string | null>(null);

  useEffect(() => {
    const nextKey = [
      dashboardTopLaneAdvisory.source,
      dashboardTopLaneAdvisory.override.badge,
      dashboardTopLaneAdvisory.override.title,
      dashboardTopLaneAdvisory.override.detail ?? '',
      dashboardTopLaneAdvisory.override.tone ?? '',
    ].join('|');

    if (dashboardLaneLogKeyRef.current === nextKey) return;
    dashboardLaneLogKeyRef.current = nextKey;

    ecsLog.debug('SHELL', '[DashboardAdvisoryLane]', {
      shellMessageSource: dashboardTopLaneAdvisory.source,
      shellMessageReason: dashboardTopLaneAdvisory.reason,
      shellMessagePriority: dashboardTopLaneAdvisory.priority,
      suppressedShellSources: dashboardTopLaneAdvisory.suppressedSources,
      dashboardAdvisorySource: dashboardTopLaneAdvisory.source,
      dashboardLaneBadge: dashboardTopLaneAdvisory.override.badge,
      dashboardLaneTitle: dashboardTopLaneAdvisory.override.title,
      dashboardLaneDetail: dashboardTopLaneAdvisory.override.detail,
      gpsLive: gps.hasFix || hasDashboardRouteContext,
      guidanceLive:
        dashboardShellBannerStatus.source === 'route_live' ||
        dashboardShellBannerStatus.source === 'route_live_reduced',
      routeActive: hasDashboardRouteContext,
      connectivityState: isOnline ? 'online' : 'offline',
      hasConfiguredVehicle: Boolean(activeVehicleData || activeVehicleContext.vehicle),
      offlineMode,
      cloudEnhancementAvailable: !['error', 'offline', 'stale', 'permission-blocked', 'network-blocked'].includes(dashboardWeather.snapshot.status.kind),
    });
  }, [
    activeVehicleContext.vehicle,
    activeVehicleData,
    dashboardShellBannerStatus.source,
    dashboardTopLaneAdvisory,
    dashboardWeather.snapshot.status.kind,
    gps.hasFix,
    hasDashboardRouteContext,
    isOnline,
    offlineMode,
  ]);

  return (
    <View style={[styles.container, { backgroundColor: 'transparent', paddingBottom: dockPadding }]}>
      {dashboardChromeVisible ? (
        <DashboardHeader
          title="Expedition Command"
          layoutMode={layoutMode}
          onDone={handleExitLayoutMode}
          onAuthPress={() => setAuthVisible(true)}
          onExpeditionEnded={handleExpeditionEnded}
          commandContext={{
            expeditionPhase: aiState?.expeditionPhase ?? null,
            operationalState: aiState?.operationalState ?? null,
            liveStatus: liveStatus ?? null,
          }}
        />
      ) : null}

      <View style={dashboardFrameStyle}>
        <View
          style={[
            styles.dashboardBody,
            { gap: dashboardPageRhythm.bodyGap },
          ]}
        >
          <View
            style={[
              styles.dashboardTopCluster,
              { gap: dashboardPageRhythm.controlGap },
            ]}
          >
      {!startupHydrating && dashboardChromeVisible ? (
        <ECSIntelligenceReadout
          hasRouteContext={hasDashboardRouteContext}
          isActiveExpedition={currentExpeditionState === 'active' || Boolean(activeTrip)}
          onOpenCommandBrief={handleOpenCommandBrief}
        />
      ) : null}

      {!startupHydrating && dashboardChromeVisible && showEcsBriefMeta ? (
        <View style={styles.ecsBriefMetaRow}>
          <Ionicons name="sparkles-outline" size={12} color={palette.amber} />
          <Text style={[styles.ecsBriefMetaText, { color: palette.textMuted }]}>
            ECS • {latestMissionBriefLabel}
          </Text>
          {dashboardCommandState.metaSignal ? (
            <Text style={[styles.ecsBriefMetaSignal, { color: palette.amber }]}>
              {dashboardCommandState.metaSignal}
            </Text>
          ) : null}
        </View>
      ) : null}

      {!startupHydrating && dashboardChromeVisible ? <OfflineStateBanner expanded /> : null}

      <DashboardTabBar
        activeTab={activeTab}
        palette={palette}
        expeditionAccent={expeditionAccent}
        autoModeEnabled={modeEngineState.autoModeEnabled}
        autoModeInCooldown={modeEngineState.inCooldown}
        autoModeManualOverride={modeEngineState.isManualOverride}
        autoModeSustaining={modeEngineState.sustainedCondition?.isSustaining ?? false}
        isDashboardExpanded={isDashboardExpanded}
        onSelectTab={handleTabSwitchWithModeSync}
        onToggleAutoMode={handleToggleAutoMode}
        onToggleDashboardExpanded={handleToggleDashboardExpanded}
      />

      {!startupHydrating ? (
        <>
          <DashboardCustomizeStack
            visible={layoutMode}
            gridLayout={gridLayout}
            palette={palette}
            onSelectLayout={handleGridLayoutChange}
            onRestoreDefaults={handleRestoreDefaults}
          />
        </>
      ) : null}

          </View>

          <View
            style={[
              styles.dashboardGridRegion,
              { paddingBottom: dashboardPageRhythm.gridRegionBottom },
            ]}
          >

      <DashboardGridZone
        layoutMode={layoutMode}
        palette={palette}
        activeTab={activeTab}
        allEmpty={allEmpty}
        accel={accel}
        advancedModeEnabled={advancedModeEnabled}
        activeProfile={activeProfile}
        gridLayout={gridLayout}
        slots={slots}
        dashboardMode={dashboardMode}
        perWidgetAutoCollapse={perWidgetAutoCollapse}
        widgetContainerHeight={effectiveWidgetContainerHeight}
        widgetContainerWidth={effectiveWidgetContainerWidth}
        layoutSignature={dashboardLayoutSignature}
        tabOpacityAnim={tabOpacityAnim}
        tabSlideAnim={tabSlideAnim}
        onEnterCustomizeMode={handleEnterCustomizeMode}
        onExitLayoutMode={handleExitLayoutMode}
        onEmptySlotPress={handleEmptySlotPress}
        onWidgetLongPress={handleWidgetLongPress}
        onRemoveWidget={handleWidgetRemove}
        onSwapSlots={handleSwapSlots}
        onResizeWidget={handleResizeWidget}
        onRestoreDefaults={handleRestoreDefaults}
        onOpenCommandBrief={handleOpenCommandBrief}
        onContainerLayout={handleContainerLayout}
        widgetData={widgetData}
        gpsLatitude={gps.position?.latitude}
        gpsLongitude={gps.position?.longitude}
        gpsSpeedMph={gps.position?.speedMph ?? null}
        gpsHasFix={gps.hasFix}
        gpsAccuracyM={gps.position?.accuracyM ?? null}
        gpsAltitudeFt={gps.position?.altitudeFt ?? null}
        gpsTimestampMs={gps.position?.timestamp ?? null}
        isShortHeight={isShortHeight}
        isVeryShortHeight={isVeryShortHeight}
        expeditionHasActiveRoute={hasDashboardRouteContext}
        expeditionTeamMemberCount={expeditionTeamMemberCount}
        expeditionCampCount={expeditionCampCount}
        expeditionRouteCompleted={expeditionRouteCompleted}
        expeditionId={expeditionId}
        expeditionRouteLabel={expeditionRouteLabel}
        completedExpeditionRecord={completedExpeditionSummaryRecord}
        expeditionEcsOnline={isOnline}
      />

      {!isDashboardExpanded ? (
        <View
          style={[
            styles.goldDockSeparator,
            { marginTop: dashboardPageRhythm.dockSeparatorGap },
          ]}
          pointerEvents="none"
        />
      ) : null}
          </View>
        </View>
      </View>

      <DashboardModalLayer
        libraryVisible={libraryVisible}
        assignedWidgets={assignedWidgets}
        libraryIntent={libraryIntent}
        libraryTargetSlot={libraryTargetSlot}
        libraryTargetWidgetType={libraryTargetWidgetType}
        gridLayout={gridLayout}
        advancedModeEnabled={advancedModeEnabled}
        createWidgetVisible={createWidgetVisible}
        detailVisible={detailVisible}
        detailSlot={detailSlot}
        manageVisible={manageVisible}
        manageSlot={manageSlot}
        widgetData={widgetData}
        dashboardMode={dashboardMode}
        accel={accel}
        gps={gps}
        authVisible={authVisible}
        collisionModalVisible={collisionModalVisible}
        pendingCollision={pendingCollision}
        pendingResizeWidgetName={pendingResizeWidgetName}
        pendingResizeSize={pendingResizeSize}
        completedExpeditionRecord={completedExpeditionRecord}
        onSelectWidget={handleWidgetAssign}
        onCloseLibrary={handleCloseLibrary}
        onOpenCreateCustom={handleOpenCreateCustomWidget}
        onSaveCustomWidget={handleCustomWidgetSaved}
        onCloseCreateCustom={() => setCreateWidgetVisible(false)}
        onCloseDetail={handleCloseWidgetDetail}
        onReplaceDetailWidget={handleDetailReplace}
        onRemoveDetailWidget={handleDetailRemove}
        onCloseWidgetManager={handleCloseWidgetManager}
        onReplaceManagedWidget={handleManagedWidgetReplace}
        onChangeManagedWidgetSurface={handleManagedWidgetReplace}
        onRemoveManagedWidget={handleManagedWidgetRemove}
        onOpenNavigateFromDetail={handleOpenNavigate}
        onOpenFleetFromDetail={handleOpenFleet}
        onRemotenessNavigateFromDetail={handleRemotenessNavigateFromDetail}
        onOpenCommandBriefFromDetail={handleOpenCommandBrief}
        onCloseAuth={() => setAuthVisible(false)}
        onShrinkAndResize={handleShrinkAndResize}
        onCancelResize={handleCancelResize}
      />
    </View>
  );

}





// ── Exported with Error Boundary ────────────────────────
export default function DashboardScreen() {
  const isFocused = useIsFocused();

  return (
    <TabErrorBoundary tabName="DASHBOARD">
      {isFocused ? <DashboardScreenInner /> : <View style={styles.inactiveDashboardScreen} />}
    </TabErrorBoundary>
  );
}

const styles = StyleSheet.create({

  container: { flex: 1, paddingTop: 0, paddingBottom: 70, overflow: 'visible' },
  inactiveDashboardScreen: { flex: 1, backgroundColor: 'transparent' },
  dashboardLoadingShell: {
    flex: 1,
    paddingHorizontal: 14,
    paddingTop: 14,
    gap: 10,
  },
  dashboardLoadingGrid: {
    flexDirection: 'row',
    gap: 10,
  },
  // ── Tab Bar ────────────────────────────────────────────
  // Structured as: [Tabs Section (flex)] | [Controls Section (auto)]
  // This prevents the AUTO toggle from overlapping tab labels.
  tabBar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    height: 42,
    paddingHorizontal: 12,
    marginTop: 0,
    gap: 8,
    position: 'relative',
    zIndex: 30,
    elevation: 6,
  },

  // ── Tabs Section — holds Widgets, ECS Brief, and Expedition labels ──
  tabsSection: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    height: 34,
    paddingHorizontal: 0,
    zIndex: 1,
  },

  tabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    height: 28,
    marginVertical: 0,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: 'transparent',
    paddingHorizontal: 8,
  },
  tabLabel: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1.6,
    lineHeight: 11,
  },
  tabLabelTablet: {
    fontSize: 9.5,
    letterSpacing: 1.8,
  },

  // ── Controls Section — expand/collapse button, right-aligned ──
  tabControlsSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingLeft: 4,
    paddingRight: 2,
    height: 34,
    width: 34,
    justifyContent: 'flex-end',
  },
  dashboardExpandBtn: {
    width: 28,
    height: 28,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },


  // ── Customize Mode Bar (layout mode only) ──────────
  customizeBar: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingVertical: 5,
    gap: 6,
    borderBottomWidth: 1,
    alignItems: 'center',
  },
  restoreDefaultsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
  },
  restoreDefaultsText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },

  // gridContainer: full-width, flex fill, no width constraints
  // that could cause child grids to left-lock
  gridContainer: {
    flex: 1,
    flexBasis: 0,
    minHeight: 0,
    width: '100%',
    alignSelf: 'stretch',
    paddingTop: 6,
  },
  gridContainerTactical: {
    paddingTop: 0,
    overflow: 'hidden',
  },
  gridContainerShort: {
    paddingTop: 4,
  },
  gridContainerVeryShort: {
    paddingTop: 2,
  },


  // ── Widget Measure Wrapper ─────────────────────────
  // Wraps WidgetGrid to provide accurate height measurement
  // that excludes gridContainer padding and sibling elements
  // (layout hint, profile footer). This ensures fill-height
  // layouts (1x2, 1x1, 2x1) compute correct widget heights.
  widgetMeasureWrapper: {
    flex: 1,
    width: '100%',
    minHeight: 0,
    overflow: 'hidden',
  },
  widgetMeasureWrapperShort: {
    paddingBottom: 4,
  },
  widgetMeasureWrapperVeryShort: {
    paddingBottom: 0,
  },



layoutHint: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 14, marginTop: 8, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, borderWidth: 1 },
  layoutHintText: { fontSize: 11, fontWeight: '600', flex: 1, lineHeight: 16 },
  profileFooter: { alignItems: 'center', marginTop: 8, paddingHorizontal: 14, paddingBottom: 2 },
  footerText: { fontSize: 10, fontWeight: '600', letterSpacing: 0.5 },

  // ── Customize Mode Dim Overlay ─────────────────────
  customizeDimOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.15)',
    zIndex: -1,
  },

  // ── Advanced Mode toggle ───────────────────────────
  // ── Advanced Mode panel ────────────────────────────
  // ── Presets Button ─────────────────────────────────
  // ── Auto-collapse settings ─────────────────────────

  // ── Vehicle Movement Detected Banner ───────────────
  movementBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginHorizontal: 12,
    marginBottom: 4,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
    backgroundColor: 'rgba(76,175,80,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(76,175,80,0.2)',
  },
  movementBannerDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#4CAF50',
  },
  movementBannerText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#4CAF50',
    letterSpacing: 1,
  },

  // ── Compact mode indicator ─────────────────────────
  // ── Empty State ────────────────────────────────────
  emptyStateContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  emptyStateCard: {
    alignItems: 'center',
    paddingHorizontal: 32,
    paddingVertical: 28,
    borderRadius: 14,
    borderWidth: 1,
    gap: 10,
    width: '100%',
    maxWidth: 320,
  },
  emptyStateTitle: {
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 2,
    marginTop: 4,
  },
  emptyStateSubtext: {
    fontSize: 11,
    lineHeight: 17,
    textAlign: 'center',
    fontWeight: '500',
  },
  emptyStateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 6,
  },
  emptyStateBtnText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 2,
  },

  briefTabSurface: {
    flex: 1,
    minHeight: 0,
    paddingTop: 4,
    paddingBottom: 0,
  },
  briefTabCommandWrap: {
    flex: 1,
    minHeight: 0,
  },

  ecsBriefMetaRow: {
    minHeight: 20,
    paddingHorizontal: 14,
    paddingTop: 2,
    paddingBottom: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(196,138,44,0.10)',
  },

  ecsBriefMetaText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.1,
    textTransform: 'uppercase',
  },

  ecsBriefMetaSignal: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginLeft: 8,
  },

dashboardContentStack: {
  flex: 1,
  minHeight: 0,
  gap: 10,
},
dashboardContentStackShort: {
  gap: 6,
},

dashboardBody: {
  flex: 1,
  flexBasis: 0,
  minHeight: 0,
},
dashboardTopCluster: {
  flexShrink: 0,
},
dashboardGridRegion: {
  flex: 1,
  flexBasis: 0,
  minHeight: 0,
  overflow: 'visible',
},
dashboardGridZoneFrame: {
  flex: 1,
  flexBasis: 0,
  minHeight: 0,
  width: '100%',
},

dashboardPageSupportWrap: {
  flexShrink: 0,
},
dashboardPageSupportCard: {
  borderWidth: 1,
  borderRadius: 14,
  paddingHorizontal: 14,
  paddingVertical: 12,
  gap: 10,
},
dashboardPageSupportHeader: {
  flexDirection: 'row',
  alignItems: 'flex-start',
  gap: 10,
},
dashboardPageSupportIconWrap: {
  width: 28,
  height: 28,
  borderRadius: 999,
  borderWidth: 1,
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
},
dashboardPageSupportCopy: {
  flex: 1,
  minWidth: 0,
},
dashboardPageSupportEyebrow: {
  fontSize: 9,
  fontWeight: '800',
  letterSpacing: 1.1,
  textTransform: 'uppercase',
  marginBottom: 4,
},
dashboardPageSupportTitle: {
  fontSize: 12,
  fontWeight: '700',
  letterSpacing: 0.25,
},
dashboardPageSupportDetail: {
  marginTop: 4,
  fontSize: 10.5,
  lineHeight: 15,
  fontWeight: '500',
},
dashboardPageSupportFooter: {
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 10,
},
dashboardPageSupportChipRow: {
  flex: 1,
  flexDirection: 'row',
  flexWrap: 'wrap',
  gap: 6,
},
dashboardPageSupportChipSpacer: {
  flex: 1,
},
dashboardPageSupportChip: {
  paddingHorizontal: 8,
  paddingVertical: 5,
  borderRadius: 999,
  borderWidth: 1,
  maxWidth: '100%',
},
dashboardPageSupportChipText: {
  fontSize: 8.5,
  fontWeight: '700',
  letterSpacing: 0.45,
  textTransform: 'uppercase',
},
dashboardPageSupportAction: {
  paddingHorizontal: 10,
  paddingVertical: 7,
  borderRadius: 999,
  borderWidth: 1,
  flexShrink: 0,
},
dashboardPageSupportActionText: {
  fontSize: 9,
  fontWeight: '800',
  letterSpacing: 0.8,
  textTransform: 'uppercase',
},

missionLayerWrap: {
  flex: 1,
  width: '100%',
  minHeight: 0,
  paddingBottom: 2,
},


  // ── Phase 9: Gold Structural Separator ─────────────
  // Thin gold line between widget area and CommandDock space.
  // Creates a continuous gold structural thread:
  //   Attitude Monitor gold border → separator → CommandDock gold rail
  // Uses GOLD_RAIL.section opacity (35%) at 0.75px — lighter than
  // the major 1.5px rails on header/dock edges, establishing
  // the structural hierarchy: major > section > subsection.
  goldDockSeparator: {
    height: 0.75,
    backgroundColor: 'rgba(160,129,58,0.35)',
    marginHorizontal: 0,
    marginTop: 4,
  },
});






