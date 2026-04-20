/**
 * Cockpit Dashboard — /dashboard
 *
 * Tactical, clean, infrastructure-focused dashboard with Expedition/Highway tabs.
 *
 * Features:
 * - Expedition / Highway tab toggle with smooth micro-animation
 * - Expedition default: 2x2 grid — Attitude Monitor (2x1 top) + Vehicle Systems + Remoteness (1x1 bottom row)
 * - Highway default: 2x2 grid — 4 equal awareness widgets (Forward Weather, Daylight, Cell Coverage, Wind)
 * - Fill-height 2x2 grid with no dead space

 * - Smart re-expand: only on verified sustained vehicle movement
 * - "Vehicle Movement Detected" banner on re-expand
 * - Accelerometer integration for stability + attitude widgets
 * - All widgets user-replaceable and reorderable
 * - Advanced Modeling toggle (exposes advanced widgets + enhanced data)
 * - Widget Governance: tab isolation, redundancy prevention, restore defaults
 * - Grid config hidden behind long-press Customize Mode
 * - Per-tab empty state with Customize CTA
 * - Theme-aware: uses palette from ThemeContext
 * - Adaptive brightness affects all widgets, text, icons, indicators
 * - Rotation / resize aware: useWindowDimensions listener re-measures
 *   container dimensions and recalculates widget placements automatically
 * - Expedition state integration: subscribes to expeditionStateStore,
 *   shows ExpeditionSummarySheet on completion, End Expedition in header
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
  Pressable,
  StyleSheet,
  Animated,
  Switch,
  Alert,
  Platform,
  LayoutChangeEvent,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';


import { useFocusEffect, useIsFocused } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import { SafeIcon as Ionicons } from '../../components/SafeIcon';
import TabErrorBoundary from '../../components/TabErrorBoundary';

import { TACTICAL, GOLD_RAIL } from '../../lib/theme';

import { useApp } from '../../context/AppContext';
import { useTheme } from '../../context/ThemeContext';
import {
  dashboardStore,
  isDashboardHydrated,
  waitForDashboardHydration,
  GRID_LAYOUT_CONFIG,
  EXPEDITION_TACTICAL_PRESET_ID,
  isExpeditionTacticalActive,
  WIDGET_SIZE_CONFIG,
  detectResizeCollision,
  getFullWidgetCatalog,
  getSlotSize,
  getPresetsForLayout,
  customPresetStore,
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
import CreateCustomWidgetModal from '../../components/dashboard/CreateCustomWidgetModal';
import GridLayoutPicker from '../../components/dashboard/GridLayoutPicker';
import AuthModal from '../../components/AuthModal';
import Toast from '../../components/Toast';
import { ECSStateMessage } from '../../components/ECSStateMessage';
import CollisionWarningModal from '../../components/dashboard/CollisionWarningModal';
import LayoutPresetsModal from '../../components/dashboard/LayoutPresetsModal';
import ExpeditionControlPanel from '../../components/dashboard/ExpeditionControlPanel';
import DashboardManagerOverlay from '../../components/dashboard/DashboardManagerOverlay';
import ExpeditionSummarySheet from '../../components/expedition/ExpeditionSummarySheet';
import ExpeditionTimelinePanel from '../../components/expedition/ExpeditionTimelinePanel';
import WidgetLibraryManager from '../../components/dashboard/WidgetLibraryManager';
import ModeSwitchBanner from '../../components/dashboard/ModeSwitchBanner';
import ExpeditionIntelligenceBar from '../../components/dashboard/ExpeditionIntelligenceBar';
import ModeActivationBanner from '../../components/dashboard/ModeActivationBanner';
import AutoModeToggle from '../../components/dashboard/AutoModeToggle';
import OfflineStateBanner from '../../components/offline/OfflineStateBanner';
import MissionBriefCard from '../../components/dashboard/MissionBriefCard';
import { ECSTransientNotice, ECSWidgetSkeleton } from '../../components/ECSLoading';
import type { MissionBrief } from '../../lib/missionBriefEngine';



import { offlineExpeditionModeEngine } from '../../lib/offlineExpeditionModeEngine';
import { dashboardModeEngine, type ModeEngineOutput } from '../../lib/dashboardModeEngine';
import { tripRecorderEngine } from '../../lib/tripRecorderEngine';

import { advisoryStore } from '../../lib/advisoryStore';
import { useECSAI } from '../../lib/ai/useECSAI';
import {
  selectBriefCommandState,
  type BriefCommandState,
} from '../../lib/ai/briefSelectors';
import { resetIntelligence } from '../../lib/assistantIntelligenceEngine';
import { bluPowerAuthority } from '../../lib/BluPowerAuthority';
import {
  selectDashboardCommandState,
  type DashboardCommandBadge,
  type DashboardCommandState,
} from '../../lib/dashboardCommandSelectors';
import { remotenessStore } from '../../lib/remotenessStore';
import { routeStore } from '../../lib/routeStore';
import { loadRoadNavigationSession } from '../../lib/roadNavigationStore';
import { loadTrailNavigationSession } from '../../lib/trailNavigationStore';
import { resolveTopBannerPresentation } from '../../lib/ui/topBannerStatusResolver';
import { useThrottledGPS } from '../../lib/useThrottledGPS';
import { useOperationalWeather } from '../../lib/useOperationalWeather';
import { useVehicleTelemetry } from '../../src/vehicle-telemetry/useVehicleTelemetry';
import { useOBD2Scanner } from '../../src/vehicle-telemetry/useOBD2Scanner';



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
import { getShellBottomClearance } from '../../lib/shellLayout';
import { ECS_CTA_LABELS, ECS_STATE_COPY } from '../../lib/ecsStateCopy';
import { AUTH_COPY } from '../../lib/auth/authCopy';
import { consumeNavigationFlow, stageNavigationFlow } from '../../lib/ecsNavigationFlow';
import { saveNavigationHandoffPayload } from '../../lib/navigationHandoffStore';
import {
  buildRemotenessNavigationPayload,
  getRemotenessNavigationLabel,
  getRemotenessNavigationUnavailableMessage,
  resolveRemotenessNavigationTarget,
  type RemotenessNavigationTargetType,
} from '../../lib/remotenessEmergencyRouting';
import {
  setDashboardExpanded,
} from '../../lib/dashboardChromeStore';
import { useAdaptiveLayout } from '../../lib/useAdaptiveLayout';
import { EASING, MOTION } from '../../lib/motion';






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

// ── Mode Color Cues ────────────────────────────────────
// Expedition = ECS gold accent (existing palette.amber / #D4A017)
// Highway = muted navigation blue (complements ECS dark palette)
const HIGHWAY_BLUE = '#5B8DEF';
const DASHBOARD_STARTUP_SETTLE_MS = 900;

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

function pickDashboardLaneDetail(...values: Array<string | null | undefined>): string | null {
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

function buildDashboardAdvisoryId(...parts: Array<string | null | undefined>): string {
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

type DashboardTab = 'expedition' | 'highway' | 'brief';
type OperationalDashboardTab = 'expedition' | 'highway';

type PersistedDashboardViewState = {
  compact: boolean;
  expanded: boolean;
  dashboardTab: DashboardTab;
};

const readPersistedDashboardViewState = (
  profile: DashboardProfile,
  operationalTab: OperationalDashboardTab,
): PersistedDashboardViewState => {
  const uiState = dashboardStore.getUIState(profile);
  const persistedDashboardTab =
    uiState.dashboardTab === 'brief' || uiState.dashboardTab === operationalTab
      ? uiState.dashboardTab
      : operationalTab;

  return {
    compact: uiState.compact === true,
    expanded: uiState.expanded === true,
    dashboardTab: persistedDashboardTab,
  };
};


type DashboardTabBarProps = {
  activeTab: DashboardTab;
  palette: any;
  expeditionAccent: string;
  highwayAccent: string;
  underlineLeft: any;
  underlineColor: any;
  autoModeEnabled: boolean;
  autoModeInCooldown: boolean;
  autoModeManualOverride: boolean;
  autoModeSustaining: boolean;
  isDashboardExpanded: boolean;
  onSelectTab: (tab: DashboardTab) => void;
  onToggleAutoMode: () => void;
  onOpenLibraryManager: () => void;
  onToggleDashboardExpanded: () => void;
};

function DashboardTabBar({
  activeTab,
  palette,
  expeditionAccent,
  highwayAccent,
  underlineLeft,
  underlineColor,
  autoModeEnabled,
  autoModeInCooldown,
  autoModeManualOverride,
  autoModeSustaining,
  isDashboardExpanded,
  onSelectTab,
  onToggleAutoMode,
  onOpenLibraryManager,
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

  const tabs: Array<{ key: DashboardTab; label: string; accent: string }> = [
    { key: 'expedition', label: 'EXPEDITION', accent: expeditionAccent },
    { key: 'highway', label: 'HIGHWAY', accent: highwayAccent },
    { key: 'brief', label: 'ECS BRIEF', accent: palette.amber },
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
            backgroundColor: 'rgba(255,255,255,0.025)',
            borderColor: palette.border,
            height: tabRailHeight,
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

        <Animated.View
          style={[
            styles.tabUnderline,
            {
              left: underlineLeft,
              backgroundColor: underlineColor,
            },
          ]}
        />
      </View>

      <View style={styles.tabControlsSection}>
        {activeTab !== 'brief' ? (
          <TouchableOpacity
            style={styles.libraryManagerBtn}
            onPress={onOpenLibraryManager}
            activeOpacity={0.7}
            hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
          >
            <Ionicons name="add-circle-outline" size={18} color={palette.amber} />
          </TouchableOpacity>
        ) : <View style={styles.libraryManagerPlaceholder} />}

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

type DashboardCommandSurfaceProps = {
  activeTab: DashboardTab;
  compact: boolean;
  commandState: DashboardCommandState;
  palette: any;
};

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

type DashboardStartupNotice = {
  kind: 'loading' | 'syncing' | 'offline' | 'cached';
  label: string;
  message: string;
};

type DashboardLaneState = {
  override: NonNullable<React.ComponentProps<typeof ExpeditionIntelligenceBar>['override']>;
  source: string;
  reason: string;
  priority: number;
  suppressedSources: string[];
};

function mapDashboardPageSupportTone(
  tone: DashboardPageSupportState['tone'],
): NonNullable<React.ComponentProps<typeof ExpeditionIntelligenceBar>['override']>['tone'] {
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

function DashboardCommandSurface({
  activeTab,
  compact,
  commandState,
  palette,
}: DashboardCommandSurfaceProps) {
  const adaptive = useAdaptiveLayout();

  if (activeTab === 'brief' || !commandState.surface.visible) {
    return null;
  }

  const surfaceEdgePadding = adaptive.dashboard.gridPadding;
  const surfaceTopPadding = compact
    ? adaptive.shortHeight ? 2 : 3
    : adaptive.shortHeight ? 3 : 4;
  const surfaceBottomPadding = adaptive.shortHeight ? 3 : 4;

  const tone = commandState.banner?.tone ?? 'ready';
  const toneAccent =
    tone === 'warning'
      ? '#E85B4D'
      : tone === 'active'
        ? palette.amber
        : tone === 'unavailable'
          ? palette.textMuted
          : '#89ABF6';

  const badgeStyleFor = (badge: DashboardCommandBadge) => ({
    backgroundColor:
      badge.tone === 'warning'
        ? 'rgba(232, 91, 77, 0.10)'
        : badge.tone === 'primary'
          ? `${palette.amber}16`
          : 'rgba(137,171,246,0.10)',
    borderColor:
      badge.tone === 'warning'
        ? 'rgba(232, 91, 77, 0.28)'
        : badge.tone === 'primary'
          ? `${palette.amber}30`
          : 'rgba(137,171,246,0.24)',
    color:
      badge.tone === 'warning'
        ? '#F3B8B0'
        : badge.tone === 'primary'
          ? palette.amber
          : palette.textMuted,
  });

  return (
    <View
      style={[
        styles.dashboardSurfaceWrap,
        compact && styles.dashboardSurfaceWrapShort,
        {
          paddingHorizontal: surfaceEdgePadding,
          paddingTop: surfaceTopPadding,
          paddingBottom: surfaceBottomPadding,
        },
      ]}
    >
      <View
        style={[
          styles.dashboardSurfacePanel,
          {
            backgroundColor: palette.panel,
            borderColor: tone === 'warning' ? 'rgba(232, 91, 77, 0.22)' : palette.border,
            borderRadius: 14,
            borderWidth: 1,
          },
        ]}
      >
        <View style={styles.dashboardSurfaceHeader}>
          <View style={styles.dashboardSurfaceCopy}>
            {commandState.surface.eyebrow ? (
              <Text
                style={[
                  styles.dashboardSurfaceEyebrow,
                  { color: toneAccent },
                ]}
                numberOfLines={1}
              >
                {commandState.surface.eyebrow}
              </Text>
            ) : null}
            <Text
              style={[
                styles.dashboardSurfaceTitle,
                { color: palette.text },
              ]}
              numberOfLines={compact ? 1 : 2}
            >
              {commandState.surface.title}
            </Text>
            {commandState.surface.detail ? (
              <Text
                style={[
                  styles.dashboardSurfaceSubtitle,
                  { color: palette.textMuted },
                ]}
                numberOfLines={compact ? 1 : 2}
              >
                {commandState.surface.detail}
              </Text>
            ) : null}
          </View>

          {commandState.surface.badges.length ? (
            <View style={styles.dashboardSurfaceBadges}>
              {commandState.surface.badges.slice(0, compact ? 1 : 2).map((badge) => {
                const badgeStyle = badgeStyleFor(badge);
                return (
                  <View
                    key={badge.id}
                    style={[
                      styles.dashboardSurfaceBadge,
                      {
                        backgroundColor: badgeStyle.backgroundColor,
                        borderColor: badgeStyle.borderColor,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.dashboardSurfaceBadgeText,
                        { color: badgeStyle.color },
                      ]}
                      numberOfLines={1}
                    >
                      {badge.label}
                    </Text>
                  </View>
                );
              })}
            </View>
          ) : null}
        </View>

        {commandState.surface.secondary.length ? (
          <View style={styles.dashboardSurfaceSecondaryRow}>
            {commandState.surface.secondary.map((item) => (
              <View
                key={item}
                style={[
                  styles.dashboardSurfaceSecondaryPill,
                  {
                    backgroundColor: 'rgba(255,255,255,0.03)',
                    borderColor: palette.border,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.dashboardSurfaceSecondaryText,
                    { color: palette.textMuted },
                  ]}
                  numberOfLines={1}
                >
                  {item}
                </Text>
              </View>
            ))}
          </View>
        ) : null}
      </View>
    </View>
  );
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
  showAdvancedPanel: boolean;
  showCollapseSettings: boolean;
  gridLayout: GridLayout;
  palette: any;
  lastUsedPresetId?: string;
  advancedModeEnabled: boolean;
  autoCollapseEnabled: boolean;
  isCompact: boolean;
  onSelectLayout: (layout: GridLayout) => void;
  onOpenPresets: () => void;
  onToggleAdvancedPanel: () => void;
  onToggleCollapsePanel: () => void;
  onRestoreDefaults: () => void;
  onAdvancedModeToggle: (value: boolean) => void;
  onAutoCollapseToggle: (value: boolean) => void;
  onExpandNow: () => void;
};

function DashboardCustomizeStack({
  visible,
  showAdvancedPanel,
  showCollapseSettings,
  gridLayout,
  palette,
  lastUsedPresetId,
  advancedModeEnabled,
  autoCollapseEnabled,
  isCompact,
  onSelectLayout,
  onOpenPresets,
  onToggleAdvancedPanel,
  onToggleCollapsePanel,
  onRestoreDefaults,
  onAdvancedModeToggle,
  onAutoCollapseToggle,
  onExpandNow,
}: DashboardCustomizeStackProps) {
  if (!visible) return null;

  return (
    <>
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
            styles.presetsBtn,
            {
              backgroundColor: palette.panel,
              borderColor: lastUsedPresetId ? `${palette.amber}40` : palette.border,
            },
          ]}
          onPress={onOpenPresets}
          activeOpacity={0.7}
        >
          <Ionicons
            name="copy-outline"
            size={12}
            color={lastUsedPresetId ? palette.amber : palette.textMuted}
          />
          <Text
            style={[
              styles.presetsBtnText,
              { color: lastUsedPresetId ? palette.amber : palette.textMuted },
            ]}
          >
            Presets
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.advToggle,
            {
              backgroundColor: palette.panel,
              borderColor: advancedModeEnabled ? 'rgba(156,136,255,0.25)' : palette.border,
            },
          ]}
          onPress={onToggleAdvancedPanel}
          activeOpacity={0.7}
        >
          <Ionicons
            name="flask-outline"
            size={12}
            color={advancedModeEnabled ? '#9C88FF' : palette.textMuted}
          />
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.collapseToggle,
            { backgroundColor: palette.panel, borderColor: palette.border },
          ]}
          onPress={onToggleCollapsePanel}
          activeOpacity={0.7}
        >
          <Ionicons
            name={isCompact ? 'contract-outline' : 'expand-outline'}
            size={12}
            color={isCompact ? palette.amber : palette.textMuted}
          />
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.restoreToggle,
            { backgroundColor: palette.panel, borderColor: palette.border },
          ]}
          onPress={onRestoreDefaults}
          activeOpacity={0.7}
        >
          <Ionicons name="refresh-outline" size={12} color={palette.textMuted} />
        </TouchableOpacity>
      </View>

      {showAdvancedPanel && (
        <View
          style={[
            styles.advPanel,
            {
              backgroundColor: 'rgba(156,136,255,0.04)',
              borderColor: 'rgba(156,136,255,0.15)',
            },
          ]}
        >
          <View style={styles.advPanelRow}>
            <Ionicons name="flask-outline" size={14} color="#9C88FF" />
            <Text style={[styles.advPanelLabel, { color: palette.text }]}>
              Advanced Modeling
            </Text>
            <Switch
              value={advancedModeEnabled}
              onValueChange={onAdvancedModeToggle}
              trackColor={{
                false: 'rgba(255,255,255,0.08)',
                true: 'rgba(156,136,255,0.3)',
              }}
              thumbColor={advancedModeEnabled ? '#9C88FF' : palette.textMuted}
              style={{ transform: [{ scaleX: 0.7 }, { scaleY: 0.7 }] }}
            />
          </View>

          <Text style={[styles.advPanelHint, { color: palette.textMuted }]}>
            {advancedModeEnabled
              ? 'Advanced widgets visible. Dynamic thresholds active. CG modeling enabled.'
              : 'Enable to access Mission Sustainment, CG Visualization, and dynamic stability thresholds.'}
          </Text>

          {advancedModeEnabled && (
            <View style={styles.advBadgeRow}>
              <View style={styles.advBadge}>
                <Text style={styles.advBadgeText}>DYNAMIC THRESHOLDS</Text>
              </View>
              <View style={styles.advBadge}>
                <Text style={styles.advBadgeText}>CG MODEL</Text>
              </View>
              <View style={styles.advBadge}>
                <Text style={styles.advBadgeText}>SUSTAINMENT</Text>
              </View>
            </View>
          )}
        </View>
      )}

      {showCollapseSettings && (
        <View
          style={[
            styles.collapseSettings,
            { backgroundColor: palette.panel, borderColor: palette.border },
          ]}
        >
          <View style={styles.collapseRow}>
            <Ionicons name="pause-circle-outline" size={14} color={palette.textMuted} />
            <Text style={[styles.collapseLabel, { color: palette.text }]}>
              Auto-collapse when stopped
            </Text>
            <Switch
              value={autoCollapseEnabled}
              onValueChange={onAutoCollapseToggle}
              trackColor={{
                false: 'rgba(255,255,255,0.08)',
                true: `${palette.amber}30`,
              }}
              thumbColor={autoCollapseEnabled ? palette.amber : palette.textMuted}
              style={{ transform: [{ scaleX: 0.7 }, { scaleY: 0.7 }] }}
            />
          </View>

          <Text style={[styles.collapseHint, { color: palette.textMuted }]}>
            Widgets collapse after 20s stationary. Re-expands only on sustained vehicle
            movement ({'\u2265'}3s).
          </Text>

          {isCompact && (
            <TouchableOpacity
              style={[
                styles.expandBtn,
                {
                  backgroundColor: `${palette.amber}12`,
                  borderColor: `${palette.amber}30`,
                },
              ]}
              onPress={onExpandNow}
              activeOpacity={0.7}
            >
              <Ionicons name="expand-outline" size={12} color={palette.amber} />
              <Text style={[styles.expandBtnText, { color: palette.amber }]}>
                EXPAND NOW
              </Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </>
  );
}

type DashboardGridZoneProps = {
  layoutMode: boolean;
  palette: any;
  activeTab: DashboardTab;
  latestMissionBrief: MissionBrief | null;
  briefCommandState: BriefCommandState | null;
  startupHydrating: boolean;
  startupNotice: DashboardStartupNotice;
  allEmpty: boolean;
  accel: ReturnType<typeof useAccelerometer>;
  advancedModeEnabled: boolean;
  activeProfile: DashboardProfile;
  gridLayout: GridLayout;
  slots: WidgetSlot[];
  dashboardMode: DashboardMode;
  isCompact: boolean;
  perWidgetAutoCollapse: Record<string, boolean>;
  widgetContainerHeight: number;
  widgetContainerWidth: number;
  tabOpacityAnim: Animated.Value;
  tabSlideAnim: Animated.Value;
  isHighwayPrecision: boolean;
  onOpenDashboardManager: () => void;
  onEnterCustomizeMode: () => void;
  onEnterLayoutMode: () => void;
  onExitLayoutMode: () => void;
  onEmptySlotPress: (slotIndex: number) => void;
  onWidgetPress: (slot: WidgetSlot) => void;
  onRemoveWidget: (slotIndex: number) => void;
  onSwapSlots: (from: number, to: number) => void;
  onResizeWidget: (slotIndex: number, newSize: WidgetSize) => void;
  onRestoreDefaults: () => void;
  onContainerLayout: (e: LayoutChangeEvent) => void;
  widgetData: any;
  gpsLatitude: number | null | undefined;
  gpsLongitude: number | null | undefined;
  gpsSpeedMph: number | null | undefined;
  gpsHasFix: boolean;
  gpsAltitudeFt: number | null | undefined;
  isShortHeight: boolean;
  isVeryShortHeight: boolean;
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
  latestMissionBrief,
  briefCommandState,
  startupHydrating,
  startupNotice,
  allEmpty,
  accel,
  advancedModeEnabled,
  activeProfile,
  gridLayout,
  slots,
  dashboardMode,
  isCompact,
  perWidgetAutoCollapse,
  widgetContainerHeight,
  widgetContainerWidth,
  tabOpacityAnim,
  tabSlideAnim,
  isHighwayPrecision,
  onOpenDashboardManager,
  onEnterCustomizeMode,
  onEnterLayoutMode,
  onExitLayoutMode,
  onEmptySlotPress,
  onWidgetPress,
  onRemoveWidget,
  onSwapSlots,
  onResizeWidget,
  onRestoreDefaults,
  onContainerLayout,
  widgetData,
  gpsLatitude,
  gpsLongitude,
  gpsSpeedMph,
  gpsHasFix,
  gpsAltitudeFt,
  isShortHeight,
  isVeryShortHeight,
}: DashboardGridZoneProps) {
  const adaptive = useAdaptiveLayout();
  const showLayoutHint = layoutMode && !isHighwayPrecision;
  const showManagerHint = !layoutMode && !isCompact && !isHighwayPrecision;
  const showMissionBriefCard = activeTab === 'brief' && (!!latestMissionBrief || !!briefCommandState);
  const showBriefTab = activeTab === 'brief';
  const contentEdgePadding = adaptive.dashboard.gridPadding;
  const hintEdgePadding = Math.max(12, contentEdgePadding);
  const emptyEdgePadding = Math.max(24, contentEdgePadding + 12);
  const briefContentGap = adaptive.shortHeight ? 8 : 10;
  const contentStackGap = adaptive.shortHeight ? 8 : 10;
  const missionTopPadding = adaptive.shortHeight ? 4 : 6;
  const layoutHintTop = adaptive.shortHeight ? 6 : 8;
  const footerTop = adaptive.shortHeight ? 6 : 8;

  return (
    <>
      {layoutMode && <View style={styles.customizeDimOverlay} pointerEvents="none" />}

      <Pressable
        style={{ flex: 1 }}
        onLongPress={onOpenDashboardManager}
        delayLongPress={500}
      >
        <Animated.View
          style={[
            styles.gridContainer,
            isHighwayPrecision && styles.gridContainerHighway,
            isShortHeight && styles.gridContainerShort,
            isVeryShortHeight && styles.gridContainerVeryShort,
            {
              opacity: tabOpacityAnim,
              transform: [{ translateX: tabSlideAnim }],
            },
          ]}
        >
          {startupHydrating ? (
            <View style={styles.missionLayerWrap}>
              <View
                style={[
                  styles.dashboardContentStack,
                  isShortHeight && styles.dashboardContentStackShort,
                  { gap: contentStackGap },
                ]}
              >
                <View
                  style={[
                    styles.dashboardStartupNoticeWrap,
                    {
                      paddingHorizontal: contentEdgePadding,
                      paddingTop: missionTopPadding,
                    },
                  ]}
                >
                  <ECSTransientNotice
                    kind={startupNotice.kind}
                    label={startupNotice.label}
                    message={startupNotice.message}
                  />
                </View>

                <View
                  style={[
                    styles.widgetMeasureWrapper,
                    isShortHeight && styles.widgetMeasureWrapperShort,
                    isVeryShortHeight && styles.widgetMeasureWrapperVeryShort,
                  ]}
                >
                  <View
                    style={[
                      styles.dashboardStartupGrid,
                      {
                        paddingHorizontal: contentEdgePadding,
                      },
                    ]}
                  >
                    <ECSWidgetSkeleton style={styles.dashboardStartupWidget} />
                    <ECSWidgetSkeleton style={styles.dashboardStartupWidget} />
                  </View>
                </View>
              </View>
            </View>
          ) : showBriefTab && !layoutMode ? (
            <View
              style={[
                styles.briefTabContent,
                {
                  paddingHorizontal: contentEdgePadding,
                  gap: briefContentGap,
                },
              ]}
            >
              <View style={styles.briefTabCardWrap}>
                <MissionBriefCard
                  brief={latestMissionBrief as MissionBrief}
                  commandState={briefCommandState}
                />
              </View>
              {!latestMissionBrief && !briefCommandState ? (
                <View style={[styles.briefTabEmptyState, { backgroundColor: palette.panel, borderColor: palette.border }]}> 
                  <Ionicons name="sparkles-outline" size={20} color={palette.amber} />
                  <Text style={[styles.briefTabEmptyTitle, { color: palette.text }]}>ECS brief standing by</Text>
                  <Text style={[styles.briefTabEmptyText, { color: palette.textMuted }]}>Mission context will populate here as route, vehicle, power, and expedition signals come online.</Text>
                </View>
              ) : null}
            </View>
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
                  {showMissionBriefCard ? (
                    <View
                      style={[
                        styles.missionBriefContainer,
                        isShortHeight && styles.missionBriefContainerShort,
                        {
                          paddingHorizontal: contentEdgePadding,
                          paddingTop: missionTopPadding,
                        },
                      ]}
                    >
                      <MissionBriefCard
                        brief={latestMissionBrief as MissionBrief}
                        commandState={briefCommandState}
                        compact
                      />
                    </View>
                  ) : null}

                  <View
                    style={[
                      styles.widgetMeasureWrapper,
                      isShortHeight && styles.widgetMeasureWrapperShort,
                      isVeryShortHeight && styles.widgetMeasureWrapperVeryShort,
                    ]}
                    onLayout={onContainerLayout}
                  >
                  <WidgetGrid
                    slots={slots}
                    profile={activeProfile}
                    gridLayout={gridLayout}
                    layoutMode={layoutMode}
                    onEnterLayoutMode={onEnterLayoutMode}
                    onExitLayoutMode={onExitLayoutMode}
                    onEmptySlotPress={onEmptySlotPress}
                    onWidgetPress={onWidgetPress}
                    onRemoveWidget={onRemoveWidget}
                    onSwapSlots={onSwapSlots}
                    onResizeWidget={onResizeWidget}
                    onRestoreDefaults={onRestoreDefaults}
                    widgetData={widgetData}
                    dashboardMode={dashboardMode}
                    isCompact={isCompact}
                    rollDeg={accel.rollDeg}
                    pitchDeg={accel.pitchDeg}
                    sensorStatus={accel.sensorStatus}
                    sampleTimestampMs={accel.lastSampleAtMs}
                    advancedModeEnabled={advancedModeEnabled}
                    perWidgetAutoCollapse={perWidgetAutoCollapse}
                    containerHeight={widgetContainerHeight}
                    containerWidth={widgetContainerWidth}
                    gpsLatitude={gpsLatitude ?? undefined}
                    gpsLongitude={gpsLongitude ?? undefined}
                    gpsSpeedMph={gpsSpeedMph}
                    gpsHasFix={gpsHasFix}
                    gpsAltitudeFt={gpsAltitudeFt ?? undefined}
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

              {showManagerHint && (
                <View
                  style={[
                    styles.profileFooter,
                    {
                      paddingHorizontal: hintEdgePadding,
                      marginTop: footerTop,
                    },
                  ]}
                >
                  <Text style={[styles.footerText, { color: `${palette.textMuted}30` }]}>
                    Long press to open Dashboard Manager
                  </Text>
                </View>
              )}
            </>
          )}
        </Animated.View>
      </Pressable>
    </>
  );
}

type DashboardModalLayerProps = {
  libraryVisible: boolean;
  assignedWidgets: (string | null | undefined)[];
  libraryIntent: 'add' | 'replace';
  libraryTargetSlot: number;
  libraryTargetWidgetType: string | null;
  advancedModeEnabled: boolean;
  createWidgetVisible: boolean;
  detailVisible: boolean;
  detailSlot: WidgetSlot | null;
  widgetData: any;
  dashboardMode: DashboardMode;
  accel: ReturnType<typeof useAccelerometer>;
  gps: ReturnType<typeof useThrottledGPS>;
  authVisible: boolean;
  collisionModalVisible: boolean;
  pendingCollision: ResizeCollisionInfo | null;
  pendingResizeWidgetName: string;
  pendingResizeSize: WidgetSize;
  presetsModalVisible: boolean;
  gridLayout: GridLayout;
  lastUsedPresetId?: string;
  slots: WidgetSlot[];
  activeProfile: DashboardProfile;
  showExpeditionSummary: boolean;
  completedExpeditionRecord: ExpeditionRecord | null;
  libraryManagerVisible: boolean;
  activeTab: DashboardTab;
  expeditionAssignedWidgets: (string | null | undefined)[];
  highwayAssignedWidgets: (string | null | undefined)[];
  dashboardManagerVisible: boolean;
  onSelectWidget: (type: string) => void;
  onCloseLibrary: () => void;
  onOpenCreateCustom: () => void;
  onSaveCustomWidget: () => void;
  onCloseCreateCustom: () => void;
  onCloseDetail: () => void;
  onReplaceDetailWidget: () => void;
  onRemoveDetailWidget: () => void;
  onOpenPowerConnectionsFromDetail: () => void;
  onOpenTelemetrySetupFromDetail: () => void;
  onOpenNavigateFromDetail: () => void;
  onOpenFleetFromDetail: () => void;
  onRemotenessNavigateFromDetail: (target: RemotenessNavigationTargetType) => void;
  onCloseAuth: () => void;
  onShrinkAndResize: () => void;
  onCancelResize: () => void;
  onSelectPreset: (presetId: string) => void;
  onSelectCustomPreset: (preset: { gridLayout: string; slotSizes: any[]; id: string; name: string; icon: string; createdAt: number }) => void;
  onClosePresets: () => void;
  onDismissExpeditionSummary: () => void;
  onCloseLibraryManager: () => void;
  onWidgetAddedFromManager: (_profile: DashboardProfile, _widgetType: string) => void;
  onLayoutResetFromManager: (_profile: DashboardProfile) => void;
  onCloseDashboardManager: () => void;
  onExpeditionStartedFromManager: () => void;
  onExpeditionEnded: () => void;
  onOpenWidgetLibraryFromManager: () => void;
  onRestoreDefaults: () => void;
  onOpenPresetsFromManager: () => void;
  onOpenPowerConnectionsFromManager: () => void;
};

function DashboardModalLayer({
  libraryVisible,
  assignedWidgets,
  libraryIntent,
  libraryTargetSlot,
  libraryTargetWidgetType,
  advancedModeEnabled,
  createWidgetVisible,
  detailVisible,
  detailSlot,
  widgetData,
  dashboardMode,
  accel,
  gps,
  authVisible,
  collisionModalVisible,
  pendingCollision,
  pendingResizeWidgetName,
  pendingResizeSize,
  presetsModalVisible,
  gridLayout,
  lastUsedPresetId,
  slots,
  activeProfile,
  showExpeditionSummary,
  completedExpeditionRecord,
  libraryManagerVisible,
  activeTab,
  expeditionAssignedWidgets,
  highwayAssignedWidgets,
  dashboardManagerVisible,
  onSelectWidget,
  onCloseLibrary,
  onOpenCreateCustom,
  onSaveCustomWidget,
  onCloseCreateCustom,
  onCloseDetail,
  onReplaceDetailWidget,
  onRemoveDetailWidget,
  onOpenPowerConnectionsFromDetail,
  onOpenTelemetrySetupFromDetail,
  onOpenNavigateFromDetail,
  onOpenFleetFromDetail,
  onRemotenessNavigateFromDetail,
  onCloseAuth,
  onShrinkAndResize,
  onCancelResize,
  onSelectPreset,
  onSelectCustomPreset,
  onClosePresets,
  onDismissExpeditionSummary,
  onCloseLibraryManager,
  onWidgetAddedFromManager,
  onLayoutResetFromManager,
  onCloseDashboardManager,
  onExpeditionStartedFromManager,
  onExpeditionEnded,
  onOpenWidgetLibraryFromManager,
  onRestoreDefaults,
  onOpenPresetsFromManager,
  onOpenPowerConnectionsFromManager,
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
          advancedMode: advancedModeEnabled,
          gpsLatitude: gps.position?.latitude,
          gpsLongitude: gps.position?.longitude,
          gpsSpeedMph: gps.position?.speedMph ?? null,
          gpsAltitudeFt: gps.position?.altitudeFt ?? null,
          gpsHasFix: gps.hasFix,
        }}
        onClose={onCloseDetail}
        onReplace={onReplaceDetailWidget}
        onRemove={onRemoveDetailWidget}
        onOpenPowerConnections={onOpenPowerConnectionsFromDetail}
        onOpenTelemetrySetup={onOpenTelemetrySetupFromDetail}
        onOpenNavigate={onOpenNavigateFromDetail}
        onOpenFleet={onOpenFleetFromDetail}
        onRemotenessNavigateToTarget={onRemotenessNavigateFromDetail}
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

      <LayoutPresetsModal
        visible={presetsModalVisible}
        gridLayout={gridLayout}
        lastUsedPresetId={lastUsedPresetId}
        currentSlots={slots}
        activeProfile={activeProfile}
        onSelectPreset={onSelectPreset}
        onSelectCustomPreset={onSelectCustomPreset}
        onClose={onClosePresets}
      />

      <Toast />

      <ExpeditionSummarySheet
        visible={showExpeditionSummary}
        record={completedExpeditionRecord}
        onDismiss={onDismissExpeditionSummary}
      />

      <WidgetLibraryManager
        visible={libraryManagerVisible}
        onClose={onCloseLibraryManager}
        activeTab={activeTab}
        expeditionWidgets={expeditionAssignedWidgets.map((widget) => widget ?? null)}
        highwayWidgets={highwayAssignedWidgets.map((widget) => widget ?? null)}
        onWidgetAdded={onWidgetAddedFromManager}
        onLayoutReset={onLayoutResetFromManager}
        advancedModeEnabled={advancedModeEnabled}
      />

      <DashboardManagerOverlay
        visible={dashboardManagerVisible}
        onClose={onCloseDashboardManager}
        onExpeditionStarted={onExpeditionStartedFromManager}
        onExpeditionEnded={onExpeditionEnded}
        onOpenWidgetLibrary={onOpenWidgetLibraryFromManager}
        onRestoreDefaults={onRestoreDefaults}
        onOpenPresets={onOpenPresetsFromManager}
        onOpenPowerConnections={onOpenPowerConnectionsFromManager}
        activeTab={activeTab}
      />
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
  const welcomeBannerAnim = useRef(new Animated.Value(0)).current;

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
  const initialOperationalTab: OperationalDashboardTab = initialDashboardHydrated
    ? dashboardStore.getLastSelectedTab()
    : 'expedition';

  const resolveOperationalTab = (
    tab: DashboardTab,
    fallback: OperationalDashboardTab,
  ): OperationalDashboardTab => (tab === 'brief' ? fallback : tab);

  // Map dashboard view to its backing widget profile. Brief preserves the
  // previous operational mode instead of coercing the screen back to Expedition.
  const getProfileForTab = (
    tab: DashboardTab,
    fallback: OperationalDashboardTab,
  ): DashboardProfile =>
    resolveOperationalTab(tab, fallback) === 'expedition' ? 'expedition' : 'vehicle';

  const initialDashboardProfile = getProfileForTab(initialOperationalTab, initialOperationalTab);
  const initialDashboardViewState = readPersistedDashboardViewState(
    initialDashboardProfile,
    initialOperationalTab,
  );
  const initialDashboardTab: DashboardTab = initialDashboardViewState.dashboardTab;
  const initialGridLayout = dashboardStore.getGridLayout(initialDashboardProfile);
  const initialSlots = dashboardStore.getProfileSlots(initialDashboardProfile);
  const initialLastUsedPresetId = dashboardStore.getLastUsedPreset(initialDashboardProfile);

  const [dashboardHydrated, setDashboardHydrated] = useState(initialDashboardHydrated);
  const [dashboardStartupSettling, setDashboardStartupSettling] = useState(true);
  const [activeTab, setActiveTab] = useState<DashboardTab>(initialDashboardTab);
  const [previousOperationalTab, setPreviousOperationalTab] = useState<OperationalDashboardTab>(initialOperationalTab);
  const lastDashboardFocusSyncRef = useRef(0);
  const activeOperationalTab = resolveOperationalTab(activeTab, previousOperationalTab);
  const activeProfile = getProfileForTab(activeTab, previousOperationalTab);

  const [gridLayout, setGridLayout] = useState<GridLayout>(initialGridLayout);
  const [slots, setSlots] = useState<WidgetSlot[]>(initialSlots);
  const [layoutMode, setLayoutMode] = useState(false);
  const [libraryVisible, setLibraryVisible] = useState(false);
  const [libraryTargetSlot, setLibraryTargetSlot] = useState<number>(0);
  const [libraryIntent, setLibraryIntent] = useState<'add' | 'replace'>('add');
  const [libraryTargetWidgetType, setLibraryTargetWidgetType] = useState<string | null>(null);
  const [detailVisible, setDetailVisible] = useState(false);
  const [detailSlot, setDetailSlot] = useState<WidgetSlot | null>(null);
  const [authVisible, setAuthVisible] = useState(false);
  const [createWidgetVisible, setCreateWidgetVisible] = useState(false);
  const [libraryManagerVisible, setLibraryManagerVisible] = useState(false);
  const [dashboardManagerVisible, setDashboardManagerVisible] = useState(false);


  // ── Collision Detection State ─────────────────────────
  const [collisionModalVisible, setCollisionModalVisible] = useState(false);
  const [pendingCollision, setPendingCollision] = useState<ResizeCollisionInfo | null>(null);
  const [pendingResizeSlot, setPendingResizeSlot] = useState<number>(0);
  const [pendingResizeSize, setPendingResizeSize] = useState<WidgetSize>('1x1');
  const [pendingResizeWidgetName, setPendingResizeWidgetName] = useState('');

  // ── Layout Presets State ───────────────────────────────
  const [presetsModalVisible, setPresetsModalVisible] = useState(false);
  const [lastUsedPresetId, setLastUsedPresetId] = useState<string | undefined>(initialLastUsedPresetId);




  // ── Dashboard Mode ──────────────────────────────────
  const dashboardMode: DashboardMode = activeOperationalTab === 'highway' ? 'highway' : 'expedition';
  const isHighwayPrecision = dashboardMode === 'highway' && gridLayout === '2x3';

  // ── Expedition Tactical Mode ──────────────────────────


  // ── Auto-Collapse ─────────────────────────────────────
  const [autoCollapseEnabled, setAutoCollapseEnabled] = useState(dashboardStore.getAutoCollapseEnabled());
  const [isCompact, setIsCompact] = useState(initialDashboardViewState.compact);
  const [isDashboardExpanded, setIsDashboardExpanded] = useState(initialDashboardViewState.expanded);
  const [showCollapseSettings, setShowCollapseSettings] = useState(false);

  useLayoutEffect(() => {
    setDashboardExpanded(isDashboardExpanded);
  }, [isDashboardExpanded]);

  // ── Advanced Mode ─────────────────────────────────────
  const [advancedModeEnabled, setAdvancedModeEnabled] = useState(dashboardStore.getAdvancedModeEnabled());
  const [showAdvancedPanel, setShowAdvancedPanel] = useState(false);

  // ── Per-Widget Auto-Collapse ──────────────────────────
  const [perWidgetAutoCollapse, setPerWidgetAutoCollapse] = useState<Record<string, boolean>>({});

  // ── Auto-Collapse Motion Tracking Refs ─────────────────
  const lastMotionRef = useRef({ roll: 0, pitch: 0, time: Date.now() });
  const stationaryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isStationaryRef = useRef(false);
  const sustainedMotionStartRef = useRef<number | null>(null);


  // ── Context-Aware Dashboard Mode Engine ────────────────
  // Evaluates road type, speed, and remoteness to recommend
  // switching between Highway and Expedition modes.
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

  // Handle auto-mode switch: when engine switches, trigger tab animation
  const prevAutoModeRef = useRef<'highway' | 'expedition'>(modeEngineState.currentMode);
  useEffect(() => {
    if (activeTab === 'brief') return;
    const engineMode = modeEngineState.currentMode;
    if (engineMode !== prevAutoModeRef.current) {
      prevAutoModeRef.current = engineMode;
      if (modeEngineState.autoModeEnabled && !modeEngineState.switchRecommended) {
        const newTab: DashboardTab = engineMode;
        if (newTab !== activeTab) {
          handleTabSwitchRef.current(newTab);
        }
      }
    }
  }, [modeEngineState.currentMode, modeEngineState.autoModeEnabled, modeEngineState.switchRecommended, activeTab]);

  // Accept mode switch recommendation
  const handleAcceptModeSwitch = useCallback(() => {
    const recommended = modeEngineState.recommendedMode;
    dashboardModeEngine.acceptSwitch();
    if (recommended) {
      const newTab: DashboardTab = recommended;
      setPreviousOperationalTab(newTab);
      if (newTab !== activeTab) {
        handleTabSwitchRef.current(newTab);
      }
    }
  }, [modeEngineState.recommendedMode, activeTab]);

  // Dismiss mode switch recommendation
  const handleDismissModeSwitch = useCallback(() => {
    dashboardModeEngine.dismissSwitch();
  }, []);

  // Toggle auto mode
  const handleToggleAutoMode = useCallback(() => {
    const newEnabled = !modeEngineState.autoModeEnabled;
    dashboardModeEngine.setAutoMode(newEnabled);
    showToast(newEnabled ? 'Auto mode enabled' : 'Auto mode disabled');
  }, [modeEngineState.autoModeEnabled, showToast]);

  // Sync manual tab switches with mode engine (defined after handleTabSwitch)
  const handleTabSwitchWithModeSync = useCallback((newTab: DashboardTab) => {
    if (newTab !== 'brief') {
      setPreviousOperationalTab(newTab);
      dashboardModeEngine.setMode(newTab);
    }
    handleTabSwitchRef.current(newTab);
  }, []);




  // ── Expedition State Integration ────────────────────────

  // Subscribe to expeditionStateStore for real-time state changes.
  // When expedition ends (state → 'complete'), show ExpeditionSummarySheet.
  // GATING: Only show the modal once per expedition ID. Track the last
  // expedition ID that was acknowledged (dismissed) to prevent re-triggers
  // from duplicate _notify() calls or re-renders while state === 'complete'.
  const [showExpeditionSummary, setShowExpeditionSummary] = useState(false);
  const [completedExpeditionRecord, setCompletedExpeditionRecord] = useState<ExpeditionRecord | null>(null);

  // Track which expedition IDs have already been shown/acknowledged
  // to prevent duplicate modals from re-renders or multiple _notify() calls.
  const acknowledgedExpeditionIdsRef = useRef<Set<string>>(new Set());
  // Track the previous expedition state to detect transitions (not just current state)
  const prevExpStateRef = useRef<string>(expeditionStateStore.getState());
  // ── Modal State Guards ──────────────────────────────────
  // Prevents duplicate summary sheets from concurrent _notify() calls.
  const summaryShowingRef = useRef(false);
  // Cooldown after dismiss prevents immediate re-trigger from stale notifications.
  const summaryCooldownRef = useRef(false);
  const summaryCooldownTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // isDismissing prevents double-dismiss from backdrop + button tap simultaneously.
  const summaryDismissingRef = useRef(false);

  useEffect(() => {
    const unsubscribe = expeditionStateStore.subscribe((state, record) => {
      const prevState = prevExpStateRef.current;
      prevExpStateRef.current = state;

      // Only trigger the modal on a TRANSITION into 'complete',
      // not on every notification where state happens to be 'complete'.
      if (state === 'complete' && record && prevState !== 'complete') {
        // Guard: Don't show if already showing, in cooldown, or already acknowledged
        if (summaryShowingRef.current) return;
        if (summaryCooldownRef.current) return;
        if (acknowledgedExpeditionIdsRef.current.has(record.id)) return;

        summaryShowingRef.current = true;
        summaryDismissingRef.current = false;
        setCompletedExpeditionRecord(record);
        setShowExpeditionSummary(true);
      }
    });
    return unsubscribe;
  }, []);

  // Cleanup cooldown timer on unmount
  useEffect(() => {
    return () => {
      if (summaryCooldownTimerRef.current) clearTimeout(summaryCooldownTimerRef.current);
    };
  }, []);

  // Called by DashboardHeader when user confirms "End Expedition"
  const handleExpeditionEnded = useCallback(() => {
    // The subscription above will handle showing the summary sheet
    // when the state transitions to 'complete'
  }, []);

  // Dismiss expedition summary sheet — marks this expedition as acknowledged
  // so it won't re-appear on subsequent renders or _notify() calls.
  const handleDismissExpeditionSummary = useCallback(() => {
    // Guard: prevent double-dismiss (backdrop tap + button tap simultaneously)
    if (summaryDismissingRef.current) return;
    summaryDismissingRef.current = true;

    // Mark this expedition ID as acknowledged BEFORE closing
    if (completedExpeditionRecord?.id) {
      acknowledgedExpeditionIdsRef.current.add(completedExpeditionRecord.id);
    }
    setShowExpeditionSummary(false);
    setCompletedExpeditionRecord(null);
    summaryShowingRef.current = false;
    expeditionStateStore.dismissExpedition();

    // Start cooldown to prevent immediate re-trigger from stale notifications
    summaryCooldownRef.current = true;
    if (summaryCooldownTimerRef.current) clearTimeout(summaryCooldownTimerRef.current);
    summaryCooldownTimerRef.current = setTimeout(() => {
      summaryCooldownRef.current = false;
      summaryCooldownTimerRef.current = null;
    }, 500);
  }, [completedExpeditionRecord]);




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

  const activeVehicleContext = getActiveVehicleContext();

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
    const toastTimer = geofenceToastTimerRef.current;
    return () => {
      if (toastTimer) clearTimeout(toastTimer);
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
      // The expeditionStateStore subscription above will handle
      // showing the ExpeditionSummarySheet when state → 'complete'
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



  // ── Movement Detection Banner ─────────────────────────
  const [showMovementBanner, setShowMovementBanner] = useState(false);
  const movementBannerAnim = useRef(new Animated.Value(0)).current;
  const movementBannerTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Tab Animation ─────────────────────────────────────
  const tabSlideAnim = useRef(new Animated.Value(0)).current;
  const tabOpacityAnim = useRef(new Animated.Value(1)).current;
  const tabIndexFor = (tab: DashboardTab): number => tab === 'expedition' ? 0 : tab === 'highway' ? 1 : 2;
  const underlineAnim = useRef(new Animated.Value(tabIndexFor(activeTab))).current;
  const tabTransitionCycleRef = useRef(0);

  // ── Widget Container Dimensions ────────────────────────
  const [widgetContainerHeight, setWidgetContainerHeight] = useState(0);
  const [widgetContainerWidth, setWidgetContainerWidth] = useState(0);

  // ── Window Dimensions (reactive — updates on rotation / resize) ──
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const adaptive = useAdaptiveLayout();
  const insets = useSafeAreaInsets();
  const isLandscape = windowWidth > windowHeight;
  const isShortHeight = windowHeight < 780;
  const isVeryShortHeight = windowHeight < 700;
  const dashboardFrameStyle = useMemo(
    () => ({
      flex: 1,
      minHeight: 0,
      width: '100%' as const,
      alignSelf: 'center' as const,
      maxWidth: adaptive.dashboard.frameMaxWidth,
      paddingHorizontal: adaptive.horizontalPadding,
    }),
    [adaptive.dashboard.frameMaxWidth, adaptive.horizontalPadding],
  );
  const dashboardPageRhythm = useMemo(
    () => ({
      edgePadding: adaptive.dashboard.gridPadding,
      loadingTop: adaptive.shortHeight ? 10 : 12,
      loadingGap: adaptive.shortHeight ? 8 : 10,
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
      // Invalidate stale container measurements — onLayout will re-fire
      // with the new layout dimensions after React re-renders the tree
      setWidgetContainerWidth(0);
      setWidgetContainerHeight(0);
      prevWindowDimsRef.current = { width: windowWidth, height: windowHeight };
    }
  }, [windowWidth, windowHeight]);

  // ── Adaptive dock padding ─────────────────────────────
  // In landscape the CommandDock bar is shorter (less bottom safe area),
  // so we can reduce the padding to give widgets more vertical space.
  // Portrait: 70px (standard dock + safe area)
  // Landscape: 50px (dock is more compact, less safe area needed)
  const dockPadding = useMemo(() => {
    if (isDashboardExpanded) {
      return Math.max(insets.bottom, isLandscape ? 4 : 8);
    }
    return getShellBottomClearance(insets.bottom, isLandscape ? 0 : 4);
  }, [insets.bottom, isDashboardExpanded, isLandscape]);


  // ── Accelerometer ─────────────────────────────────────
  const isFocused = useIsFocused();
  const accel = useAccelerometer(isFocused);

  // ── ECS AI Orchestrator Feed ───────────────────────────
  // The dashboard now consumes the dedicated AI hook instead of
  // locally building context + mission brief on an interval.
  // This keeps signal memory stable across renders and lets the
  // orchestrator drive the brief, compact label, and activation state.
  const gps = useThrottledGPS({
    enabled: isFocused && activeTab !== 'brief',
    highAccuracy: isFocused && activeTab === 'highway',
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
    const currentWater = toFiniteNumber(activeVehicleContext.consumables?.water_gal_current);
    const waterPercent =
      waterCapacity && waterCapacity > 0 && currentWater != null
        ? Math.max(0, Math.min(100, Math.round((currentWater / waterCapacity) * 100)))
        : null;

    return {
      ...resolvedVehicleConfig,
      fuelPercent: toFiniteNumber(activeVehicleContext.consumables?.fuel_percent_current),
      waterPercent,
      fuelTankCapacityGal: activeVehicleContext.resourceProfile.fuelTankCapacityGal,
      waterCapacityGal: activeVehicleContext.resourceProfile.waterCapacityGal,
      batteryCapacityWh: activeVehicleContext.resourceProfile.batteryUsableWh,
      tireSizeInches: activeVehicleContext.tiresLift?.tireSizeInches ?? null,
      suspensionLiftInches: activeVehicleContext.tiresLift?.suspensionLiftInches ?? null,
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

  const dashboardWeather = useOperationalWeather({
    enabled: activeTab !== 'brief',
    gps: {
      lat: gps.position?.latitude ?? null,
      lng: gps.position?.longitude ?? null,
      hasFix: gps.hasFix,
    },
  });
  const dashboardTelemetry = useVehicleTelemetry();
  const telemetryScanner = useOBD2Scanner();

  const aiWeatherCorridor = useMemo(() => {
    const snapshot = dashboardWeather.snapshot;
    const alertCount = snapshot.alerts.length;
    const severeAlert = snapshot.alerts.find(alert => alert.severity === 'extreme' || alert.severity === 'warning');
    const weatherSeverity =
      severeAlert?.severity === 'extreme' ? 3 :
      severeAlert?.severity === 'warning' ? 2 :
      alertCount > 0 ? 1 :
      snapshot.current.windSpeed != null && snapshot.current.windSpeed >= 40 ? 2 :
      snapshot.current.windSpeed != null && snapshot.current.windSpeed >= 25 ? 1 :
      snapshot.current.precipChance != null && snapshot.current.precipChance >= 75 ? 1 :
      0;

    const visibilityMiles = snapshot.current.visibility != null
      ? Number((snapshot.current.visibility / 1609.34).toFixed(1))
      : null;

    return {
      weatherSeverity,
      windMph: snapshot.current.windSpeed,
      visibilityMiles,
      precipitationIntensity: snapshot.current.precipChance,
      temperatureF: snapshot.current.temp,
      alertsCount: alertCount,
    };
  }, [dashboardWeather.snapshot]);

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
      isCompact,
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
    isCompact,
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
    const advisoryText = condenseDashboardLaneCopy(dashboardCommandState.banner?.title || summaryLineLabel, 88);
    if (!aiState || !advisoryText) return;

    const advisoryKey = [
      aiState.readiness,
      dashboardCommandState.primary?.id ?? aiState.topSignal?.title ?? '',
      dashboardCommandState.compactSummary,
      advisoryText,
    ].join('|');

    if (lastAdvisoryKeyRef.current === advisoryKey) return;
    lastAdvisoryKeyRef.current = advisoryKey;

    const icon = aiState.readiness === 'critical'
      ? 'warning-outline'
      : aiState.readiness === 'elevated'
        ? 'alert-circle-outline'
        : 'sparkles-outline';
    const advisoryId = buildDashboardAdvisoryId(
      dashboardCommandState.primary?.source,
      dashboardCommandState.primary?.priority?.level,
      dashboardCommandState.primary?.title,
      advisoryText,
    );
    const advisoryMode =
      dashboardCommandState.primary?.priority?.rank != null &&
      dashboardCommandState.primary.priority.rank >= 4
        ? 'alert'
        : 'advisory';

    advisoryStore.pushContextBatch([
      {
        id: advisoryId,
        text: advisoryText,
        mode: advisoryMode,
        priority:
          dashboardCommandState.primary?.priority?.rank ??
          (aiState.topSignal?.severity === 3 ? 5 : aiState.topSignal?.severity === 2 ? 3 : 2),
        icon,
        displayDuration:
          dashboardCommandState.primary?.priority?.rank != null &&
          dashboardCommandState.primary.priority.rank >= 4
            ? 6200
            : 7000,
        interruptible: true,
      },
    ]);
  }, [aiState, dashboardCommandState, summaryLineLabel]);

  // ── Auto-collapse logic with smart re-expand ──────────

  useEffect(() => {
    if (!autoCollapseEnabled) {
      if (isCompact) setIsCompact(false);
      return;
    }

    if (!accel.isActive) {
      return;
    }

    const now = Date.now();
    const rollDelta = Math.abs(accel.rollDeg - lastMotionRef.current.roll);
    const pitchDelta = Math.abs(accel.pitchDeg - lastMotionRef.current.pitch);
    const isMoving = rollDelta > MOTION_THRESHOLD_DEG || pitchDelta > MOTION_THRESHOLD_DEG;
    const isSustainedMotion = rollDelta > SUSTAINED_MOTION_THRESHOLD_DEG || pitchDelta > SUSTAINED_MOTION_THRESHOLD_DEG;

    if (isMoving) {
      lastMotionRef.current = { roll: accel.rollDeg, pitch: accel.pitchDeg, time: now };

      if (stationaryTimerRef.current) {
        clearTimeout(stationaryTimerRef.current);
        stationaryTimerRef.current = null;
      }

      if (isStationaryRef.current && isCompact) {
        if (isSustainedMotion) {
          if (!sustainedMotionStartRef.current) {
            sustainedMotionStartRef.current = now;
          } else if (now - sustainedMotionStartRef.current >= SUSTAINED_MOTION_DURATION_MS) {
            isStationaryRef.current = false;
            sustainedMotionStartRef.current = null;
            setIsCompact(false);

            if (!drivingOverrides.disableAnimations) {
              setShowMovementBanner(true);
              movementBannerAnim.stopAnimation();
              Animated.timing(movementBannerAnim, {
                toValue: 1, duration: MOTION.screenFadeIn, easing: EASING.decelerate, useNativeDriver: true,
              }).start();

              if (movementBannerTimer.current) clearTimeout(movementBannerTimer.current);
              movementBannerTimer.current = setTimeout(() => {
                Animated.timing(movementBannerAnim, {
                  toValue: 0, duration: MOTION.screenFadeOut, easing: EASING.accelerate, useNativeDriver: true,
                }).start(() => setShowMovementBanner(false));
              }, MOVEMENT_BANNER_DURATION_MS);
            }
          }
        } else {
          sustainedMotionStartRef.current = null;
        }
      } else {
        isStationaryRef.current = false;
        sustainedMotionStartRef.current = null;
      }
    } else {
      sustainedMotionStartRef.current = null;

      if (!isStationaryRef.current && !stationaryTimerRef.current) {
        stationaryTimerRef.current = setTimeout(() => {
          isStationaryRef.current = true;
          setIsCompact(true);
          stationaryTimerRef.current = null;
        }, STATIONARY_THRESHOLD_MS);
      }
    }
  }, [accel.rollDeg, accel.pitchDeg, accel.isActive, autoCollapseEnabled, isCompact, drivingOverrides.disableAnimations, movementBannerAnim]);

  // Cleanup timers
  useEffect(() => {
    return () => {
      if (stationaryTimerRef.current) clearTimeout(stationaryTimerRef.current);
      if (movementBannerTimer.current) clearTimeout(movementBannerTimer.current);
    };
  }, []);

  const closeDashboardTransientOverlays = useCallback(() => {
    setLibraryVisible(false);
    setLibraryIntent('add');
    setLibraryTargetWidgetType(null);
    setDetailVisible(false);
    setDetailSlot(null);
    setCreateWidgetVisible(false);
    setLibraryManagerVisible(false);
    setDashboardManagerVisible(false);
    setCollisionModalVisible(false);
    setPendingCollision(null);
    setPresetsModalVisible(false);
  }, []);

  const restoreDashboardViewState = useCallback((
    operationalTab: OperationalDashboardTab,
  ): PersistedDashboardViewState => {
    const profile: DashboardProfile = operationalTab === 'expedition' ? 'expedition' : 'vehicle';
    const nextViewState = readPersistedDashboardViewState(profile, operationalTab);

    setIsCompact((current) => (current === nextViewState.compact ? current : nextViewState.compact));
    setIsDashboardExpanded((current) => (
      current === nextViewState.expanded ? current : nextViewState.expanded
    ));

    return nextViewState;
  }, []);

  const syncDashboardStoreState = useCallback((
    tab: DashboardTab,
    operationalFallback: OperationalDashboardTab = previousOperationalTab,
  ) => {
    const operationalTab = tab === 'brief' ? operationalFallback : tab;
    const profile: DashboardProfile = operationalTab === 'expedition' ? 'expedition' : 'vehicle';
    const nextGridLayout = dashboardStore.getGridLayout(profile);
    const nextSlots = dashboardStore.getProfileSlots(profile);
    const nextLastUsedPresetId = dashboardStore.getLastUsedPreset(profile);
    const nextAutoCollapseEnabled = dashboardStore.getAutoCollapseEnabled();
    const nextAdvancedModeEnabled = dashboardStore.getAdvancedModeEnabled();

    setGridLayout((current) => (current === nextGridLayout ? current : nextGridLayout));
    setSlots((current) => (areDashboardSlotsEquivalent(current, nextSlots) ? current : [...nextSlots]));
    setLastUsedPresetId((current) => (current === nextLastUsedPresetId ? current : nextLastUsedPresetId));
    setAutoCollapseEnabled((current) => (current === nextAutoCollapseEnabled ? current : nextAutoCollapseEnabled));
    setAdvancedModeEnabled((current) => (current === nextAdvancedModeEnabled ? current : nextAdvancedModeEnabled));
  }, [previousOperationalTab]);

  useEffect(() => {
    let cancelled = false;

    const finalizeHydration = () => {
      if (cancelled) return;
      const restoredOperationalTab = dashboardStore.getLastSelectedTab();
      const restoredViewState = restoreDashboardViewState(restoredOperationalTab);
      closeDashboardTransientOverlays();
      setPreviousOperationalTab(restoredOperationalTab);
      setActiveTab(restoredViewState.dashboardTab);
      syncDashboardStoreState(restoredViewState.dashboardTab, restoredOperationalTab);
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
    if (!dashboardHydrated) {
      setDashboardStartupSettling(true);
      return;
    }

    if (!isFocused) {
      return;
    }

    const timer = setTimeout(() => {
      setDashboardStartupSettling(false);
    }, DASHBOARD_STARTUP_SETTLE_MS);

    return () => clearTimeout(timer);
  }, [dashboardHydrated, isFocused]);

  useEffect(() => {
    if (!dashboardHydrated) return;

    const nextDashboardTab: DashboardTab = activeTab === 'brief' ? 'brief' : activeOperationalTab;
    const nextPersistedState = {
      ...dashboardStore.getUIState(activeProfile),
      compact: isCompact,
      expanded: isDashboardExpanded,
      dashboardTab: nextDashboardTab,
    };

    dashboardStore.saveUIState(activeProfile, nextPersistedState);
  }, [
    activeOperationalTab,
    activeProfile,
    activeTab,
    dashboardHydrated,
    isCompact,
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
      syncDashboardStoreState(activeTab, previousOperationalTab);
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
        syncDashboardStoreState(activeTab, previousOperationalTab);
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
    previousOperationalTab,
    closeDashboardTransientOverlays,
    showToast,
  ]));

  // ── Tab Switch Handler ────────────────────────────────
  useFocusEffect(
    useCallback(() => {
      return () => {
        closeDashboardTransientOverlays();
        setLayoutMode(false);
        setShowCollapseSettings(false);
        setShowAdvancedPanel(false);
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
      setShowCollapseSettings(false);
      setShowAdvancedPanel(false);
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
      const nextOperationalTab = resolveOperationalTab(
        newTab,
        activeTab === 'brief' ? previousOperationalTab : activeOperationalTab,
      );
      const nextViewState = readPersistedDashboardViewState(
        getProfileForTab(newTab, nextOperationalTab),
        nextOperationalTab,
      );

      if (newTab !== 'brief') {
        setPreviousOperationalTab(nextOperationalTab);
        dashboardStore.setLastSelectedTab(nextOperationalTab);
      }

      setActiveTab(newTab);
      syncDashboardStoreState(newTab, nextOperationalTab);
      setIsCompact((current) => (current === nextViewState.compact ? current : nextViewState.compact));
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

  }, [activeOperationalTab, activeTab, layoutMode, previousOperationalTab, tabOpacityAnim, tabSlideAnim, underlineAnim, syncDashboardStoreState, closeDashboardTransientOverlays]);

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
    setGridLayout(layout);
    setSlots(dashboardStore.getProfileSlots(activeProfile));
  }, [activeProfile]);

  const handleWidgetAssign = useCallback((type: string) => {
    dashboardStore.assignWidget(activeProfile, libraryTargetSlot, type);
    setSlots(dashboardStore.getProfileSlots(activeProfile));
    setLibraryVisible(false);
    setLibraryIntent('add');
    setLibraryTargetWidgetType(null);
  }, [activeProfile, libraryTargetSlot]);

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
  const handleApplyPreset = useCallback((presetId: string) => {
    // Apply the preset to the store (changes grid layout + slot sizes + persists)
    const newLayout = dashboardStore.applyPreset(activeProfile, presetId);

    // Force-read the new grid layout from the store (always authoritative)
    const freshLayout = dashboardStore.getGridLayout(activeProfile);
    setGridLayout(freshLayout);

    // Force-read the new slots from the store (always authoritative)
    const freshSlots = dashboardStore.getProfileSlots(activeProfile);
    setSlots([...freshSlots]);

    // Update preset tracking
    setLastUsedPresetId(presetId);

    // Reset container measurements to force re-layout with new grid structure
    setWidgetContainerHeight(0);
    setWidgetContainerWidth(0);

    // Close the modal
    setPresetsModalVisible(false);
  }, [activeProfile]);


  // ── Apply Custom Preset (user-saved) ──────────────────
  const handleApplyCustomPreset = useCallback((preset: { gridLayout: string; slotSizes: any[]; id: string; name: string; icon: string; createdAt: number }) => {
    // Apply the custom preset using the store method that handles grid layout + sizes
    const newLayout = dashboardStore.applyCustomPreset(activeProfile, preset as any);

    // Force-read the new grid layout from the store
    const freshLayout = dashboardStore.getGridLayout(activeProfile);
    setGridLayout(freshLayout);

    // Force-read the new slots from the store
    const freshSlots = dashboardStore.getProfileSlots(activeProfile);
    setSlots([...freshSlots]);

    // Update preset tracking
    setLastUsedPresetId(preset.id);

    // Reset container measurements to force re-layout with new grid structure
    setWidgetContainerHeight(0);
    setWidgetContainerWidth(0);

    // Close the modal
    setPresetsModalVisible(false);
  }, [activeProfile]);





  const handleAutoCollapseToggle = useCallback((val: boolean) => {
    setAutoCollapseEnabled(val);
    dashboardStore.setAutoCollapseEnabled(val);
    if (!val && isCompact) setIsCompact(false);
  }, [isCompact]);

  const handleAdvancedModeToggle = useCallback((val: boolean) => {
    setAdvancedModeEnabled(val);
    dashboardStore.setAdvancedModeEnabled(val);
  }, []);

  const handleRestoreDefaults = useCallback(() => {
    Alert.alert(
      'Restore Default Layout?',
      'This will reset the dashboard to the default 2-widget stack (Vehicle Systems + Attitude Monitor).',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Restore',
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
    setShowCollapseSettings(false);
    setShowAdvancedPanel(false);
  }, []);

  const handleEnterCustomizeMode = useCallback(() => {
    setLayoutMode(true);
  }, []);

  const handleContainerLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (height > 0) setWidgetContainerHeight(height);
    if (width > 0) setWidgetContainerWidth(width);
  }, []);



  // Check if current tab is empty
  const allEmpty = slots.every(s => !s.widgetType);
  const assignedWidgets = slots.map(s => s.widgetType);

  // ── Widget lists for Library Manager ──────────────────
  const expeditionAssignedWidgets = dashboardStore.getProfileSlots('expedition').map(s => s.widgetType);
  const highwayAssignedWidgets = dashboardStore.getProfileSlots('vehicle').map(s => s.widgetType);

  // ── Library Manager Handlers ──────────────────────────
  const handleLibraryManagerWidgetAdded = useCallback((_profile: DashboardProfile, _widgetType: string) => {
    // Refresh slots for the active tab
    const profile: DashboardProfile = activeOperationalTab === 'expedition' ? 'expedition' : 'vehicle';
    setSlots([...dashboardStore.getProfileSlots(profile)]);
  }, [activeOperationalTab]);

  const handleLibraryManagerLayoutReset = useCallback((_profile: DashboardProfile) => {
    // Refresh slots and grid layout for the active tab
    const profile: DashboardProfile = activeOperationalTab === 'expedition' ? 'expedition' : 'vehicle';
    setGridLayout(dashboardStore.getGridLayout(profile));
    setSlots([...dashboardStore.getProfileSlots(profile)]);
  }, [activeOperationalTab]);

  // ── Underline interpolation ───────────────────────────
  const underlineLeft = underlineAnim.interpolate({
    inputRange: [0, 1, 2],
    outputRange: ['0%', '33.333%', '66.666%'],
  });

  // ── Mode Color Cue: Animated underline color ──────────
  // Expedition (0) = ECS gold accent
  // Highway (1) = muted navigation blue
  // Smooth 250ms transition between colors when switching tabs
  const underlineColor = underlineAnim.interpolate({
    inputRange: [0, 1, 2],
    outputRange: [palette.amber, HIGHWAY_BLUE, palette.amber],
  });

  // ── Mode Color Cue: Active tab accent color (non-animated) ──
  const expeditionAccent = palette.amber;
  const highwayAccent = HIGHWAY_BLUE;

  const showEcsBriefMeta =
    activeTab === 'brief' &&
    !!latestMissionBriefLabel &&
    (isAIActive || dashboardCommandState.surface.visible);
  const startupHydrating = !dashboardHydrated || dashboardStartupSettling;
  const dashboardStartupNotice = useMemo<DashboardStartupNotice>(() => {
    if (syncStatus === 'syncing') {
      return {
        kind: 'syncing',
        label: AUTH_COPY.session.preparing,
        message: 'Restoring the dashboard layout and holding expedition context steady while live inputs reconnect.',
      };
    }

    if (!isOnline) {
      return {
        kind: 'offline',
        label: AUTH_COPY.session.loadingSystems,
        message: 'Building the dashboard from saved vehicle, route, and expedition context while live links remain offline.',
      };
    }

    return {
      kind: 'loading',
      label: AUTH_COPY.session.loadingSystems,
      message: 'Restoring the dashboard layout and operational context before live inputs settle.',
    };
  }, [isOnline, syncStatus]);

  const handleExpandFromCompact = useCallback(() => {
    setIsCompact(false);
    isStationaryRef.current = false;
  }, []);

  const handleToggleDashboardExpanded = useCallback(() => {
    setIsDashboardExpanded((current) => !current);
  }, []);

  const handleOpenDashboardManager = useCallback(() => {
    if (!layoutMode) {
      closeDashboardTransientOverlays();
      setDashboardManagerVisible(true);
    }
  }, [layoutMode, closeDashboardTransientOverlays]);

  const handleOpenLibraryManager = useCallback(() => {
    closeDashboardTransientOverlays();
    setLibraryManagerVisible(true);
  }, [closeDashboardTransientOverlays]);

  const handleOpenPowerConnections = useCallback(() => {
      setDashboardManagerVisible(false);

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

  const handleRemotenessNavigateFromDetail = useCallback(
    async (target: RemotenessNavigationTargetType) => {
      const latitude = gps.position?.latitude ?? null;
      const longitude = gps.position?.longitude ?? null;

      if (!gps.hasFix || latitude == null || longitude == null) {
        showToast('Current location unavailable');
        return;
      }

      const resolvedTarget = resolveRemotenessNavigationTarget({
        type: target,
        latitude,
        longitude,
      });

      if (!resolvedTarget) {
        showToast(getRemotenessNavigationUnavailableMessage(target));
        return;
      }

      try {
        const payload = buildRemotenessNavigationPayload(resolvedTarget);
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
        router.push('/(tabs)/navigate');
        showToast(`Routing to ${resolvedTarget.title}`);
      } catch {
        console.warn('[dashboard] Failed remoteness navigation handoff');
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

  const handleWidgetPress = useCallback((slot: WidgetSlot) => {
    if (layoutMode) return;

    if (slot.widgetType === 'vehicle-twin') {
      router.push('/vehicle-twin');
      return;
    }

    setDetailSlot(slot);
    setDetailVisible(true);
  }, [layoutMode, router]);

  const handleEmptySlotPress = useCallback((slotIndex: number) => {
    closeDashboardTransientOverlays();
    setLibraryIntent('add');
    setLibraryTargetSlot(slotIndex);
    setLibraryTargetWidgetType(null);
    setLibraryVisible(true);
  }, [closeDashboardTransientOverlays]);

  const handleOpenWidgetLibraryFromManager = useCallback(() => {
    const emptySlot = slots.find((slot) => !slot.widgetType) ?? null;
    const fallbackSlot = slots.find((slot) => !!slot.widgetType) ?? slots[0] ?? null;
    const targetSlot = emptySlot?.slotIndex ?? fallbackSlot?.slotIndex ?? 0;
    closeDashboardTransientOverlays();
    setLibraryIntent(emptySlot ? 'add' : 'replace');
    setLibraryTargetSlot(targetSlot);
    setLibraryTargetWidgetType(emptySlot ? null : fallbackSlot?.widgetType ?? null);
    setLibraryVisible(true);
  }, [slots, closeDashboardTransientOverlays]);

  const dashboardPageSupportState = useMemo<DashboardPageSupportState | null>(() => {
    if (!dashboardHydrated || dashboardStartupSettling || activeTab === 'brief' || allEmpty || layoutMode) {
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
    const weatherUnavailable = weatherKind === 'error';

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
    if (weatherRecovering) pushChip('Refreshing weather');
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
        title: 'Refreshing dashboard inputs',
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
        modeLabel: 'PROFILE FALLBACK',
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
    dashboardStartupSettling,
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
          title: gps.gpsStatus === 'RETRYING' ? 'Refreshing Location Fix' : 'Waiting for Location',
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

    console.log('[DashboardAdvisoryLane]', {
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
      cloudEnhancementAvailable: !['error', 'offline', 'stale'].includes(dashboardWeather.snapshot.status.kind),
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
    <View style={[styles.container, { backgroundColor: palette.bg, paddingBottom: dockPadding }]}>
      <View style={dashboardFrameStyle}>
        <DashboardHeader
          layoutMode={layoutMode}
          onDone={handleExitLayoutMode}
          onAuthPress={() => setAuthVisible(true)}
          onExpeditionEnded={handleExpeditionEnded}
          collapsed={isDashboardExpanded}
          commandContext={{
            expeditionPhase: aiState?.expeditionPhase ?? null,
            operationalState: aiState?.operationalState ?? null,
            liveStatus: liveStatus ?? null,
          }}
        />

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

      {!startupHydrating ? <ExpeditionIntelligenceBar override={dashboardTopLaneAdvisory.override} /> : null}

      {!startupHydrating && showEcsBriefMeta ? (
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

      {!startupHydrating ? <OfflineStateBanner expanded /> : null}

      <DashboardTabBar
        activeTab={activeTab}
        palette={palette}
        expeditionAccent={expeditionAccent}
        highwayAccent={highwayAccent}
        underlineLeft={underlineLeft}
        underlineColor={underlineColor}
        autoModeEnabled={modeEngineState.autoModeEnabled}
        autoModeInCooldown={modeEngineState.inCooldown}
        autoModeManualOverride={modeEngineState.isManualOverride}
        autoModeSustaining={modeEngineState.sustainedCondition?.isSustaining ?? false}
        isDashboardExpanded={isDashboardExpanded}
        onSelectTab={handleTabSwitchWithModeSync}
        onToggleAutoMode={handleToggleAutoMode}
        onOpenLibraryManager={handleOpenLibraryManager}
        onToggleDashboardExpanded={handleToggleDashboardExpanded}
      />

      {!startupHydrating ? (
        <>
          <ModeSwitchBanner
            visible={modeEngineState.switchRecommended}
            recommendedMode={modeEngineState.recommendedMode}
            reason={modeEngineState.recommendationReason}
            countdown={modeEngineState.bannerCountdown}
            onAccept={handleAcceptModeSwitch}
            onDismiss={handleDismissModeSwitch}
          />

          <DashboardCustomizeStack
            visible={layoutMode}
            showAdvancedPanel={showAdvancedPanel}
            showCollapseSettings={showCollapseSettings}
            gridLayout={gridLayout}
            palette={palette}
            lastUsedPresetId={lastUsedPresetId}
            advancedModeEnabled={advancedModeEnabled}
            autoCollapseEnabled={autoCollapseEnabled}
            isCompact={isCompact}
            onSelectLayout={handleGridLayoutChange}
            onOpenPresets={() => setPresetsModalVisible(true)}
            onToggleAdvancedPanel={() => setShowAdvancedPanel(!showAdvancedPanel)}
            onToggleCollapsePanel={() => setShowCollapseSettings(!showCollapseSettings)}
            onRestoreDefaults={handleRestoreDefaults}
            onAdvancedModeToggle={handleAdvancedModeToggle}
            onAutoCollapseToggle={handleAutoCollapseToggle}
            onExpandNow={handleExpandFromCompact}
          />

          {showMovementBanner && (
            <Animated.View style={[styles.movementBanner, { opacity: movementBannerAnim }]}>
              <View style={styles.movementBannerDot} />
              <Text style={styles.movementBannerText}>Vehicle Movement Detected</Text>
            </Animated.View>
          )}

          {isCompact && !showCollapseSettings && (
            <TouchableOpacity
              style={[styles.compactIndicator, { backgroundColor: `${palette.amber}08` }]}
              onPress={handleExpandFromCompact}
              activeOpacity={0.7}
            >
              <Ionicons name="contract-outline" size={10} color={palette.amber} />
              <Text style={[styles.compactIndicatorText, { color: palette.amber }]}>
                COMPACT MODE {'\u2014'} TAP TO EXPAND
              </Text>
            </TouchableOpacity>
          )}
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
        latestMissionBrief={latestMissionBrief}
        briefCommandState={briefCommandState}
        startupHydrating={startupHydrating}
        startupNotice={dashboardStartupNotice}
        allEmpty={allEmpty}
        accel={accel}
        advancedModeEnabled={advancedModeEnabled}
        activeProfile={activeProfile}
        gridLayout={gridLayout}
        slots={slots}
        dashboardMode={dashboardMode}
        isCompact={isCompact}
        perWidgetAutoCollapse={perWidgetAutoCollapse}
        widgetContainerHeight={widgetContainerHeight}
        widgetContainerWidth={widgetContainerWidth}
        tabOpacityAnim={tabOpacityAnim}
        tabSlideAnim={tabSlideAnim}
        isHighwayPrecision={isHighwayPrecision}
        onOpenDashboardManager={handleOpenDashboardManager}
        onEnterCustomizeMode={handleEnterCustomizeMode}
        onEnterLayoutMode={() => setLayoutMode(true)}
        onExitLayoutMode={handleExitLayoutMode}
        onEmptySlotPress={handleEmptySlotPress}
        onWidgetPress={handleWidgetPress}
        onRemoveWidget={handleWidgetRemove}
        onSwapSlots={handleSwapSlots}
        onResizeWidget={handleResizeWidget}
        onRestoreDefaults={handleRestoreDefaults}
        onContainerLayout={handleContainerLayout}
        widgetData={widgetData}
        gpsLatitude={gps.position?.latitude}
        gpsLongitude={gps.position?.longitude}
        gpsSpeedMph={gps.position?.speedMph ?? null}
        gpsHasFix={gps.hasFix}
        gpsAltitudeFt={gps.position?.altitudeFt ?? null}
        isShortHeight={isShortHeight}
        isVeryShortHeight={isVeryShortHeight}
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
        advancedModeEnabled={advancedModeEnabled}
        createWidgetVisible={createWidgetVisible}
        detailVisible={detailVisible}
        detailSlot={detailSlot}
        widgetData={widgetData}
        dashboardMode={dashboardMode}
        accel={accel}
        gps={gps}
        authVisible={authVisible}
        collisionModalVisible={collisionModalVisible}
        pendingCollision={pendingCollision}
        pendingResizeWidgetName={pendingResizeWidgetName}
        pendingResizeSize={pendingResizeSize}
        presetsModalVisible={presetsModalVisible}
        gridLayout={gridLayout}
        lastUsedPresetId={lastUsedPresetId}
        slots={slots}
        activeProfile={activeProfile}
        showExpeditionSummary={showExpeditionSummary}
        completedExpeditionRecord={completedExpeditionRecord}
        libraryManagerVisible={libraryManagerVisible}
        activeTab={activeTab}
        expeditionAssignedWidgets={expeditionAssignedWidgets}
        highwayAssignedWidgets={highwayAssignedWidgets}
        dashboardManagerVisible={dashboardManagerVisible}
        onSelectWidget={handleWidgetAssign}
        onCloseLibrary={handleCloseLibrary}
        onOpenCreateCustom={handleOpenCreateCustomWidget}
        onSaveCustomWidget={handleCustomWidgetSaved}
        onCloseCreateCustom={() => setCreateWidgetVisible(false)}
        onCloseDetail={handleCloseWidgetDetail}
        onReplaceDetailWidget={handleDetailReplace}
        onRemoveDetailWidget={handleDetailRemove}
        onOpenPowerConnectionsFromDetail={handleOpenPowerConnections}
        onOpenTelemetrySetupFromDetail={handleOpenTelemetrySetup}
        onOpenNavigateFromDetail={handleOpenNavigate}
        onOpenFleetFromDetail={handleOpenFleet}
        onRemotenessNavigateFromDetail={handleRemotenessNavigateFromDetail}
        onCloseAuth={() => setAuthVisible(false)}
        onShrinkAndResize={handleShrinkAndResize}
        onCancelResize={handleCancelResize}
        onSelectPreset={handleApplyPreset}
        onSelectCustomPreset={handleApplyCustomPreset}
        onClosePresets={() => setPresetsModalVisible(false)}
        onDismissExpeditionSummary={handleDismissExpeditionSummary}
        onCloseLibraryManager={() => setLibraryManagerVisible(false)}
        onWidgetAddedFromManager={handleLibraryManagerWidgetAdded}
        onLayoutResetFromManager={handleLibraryManagerLayoutReset}
        onCloseDashboardManager={() => setDashboardManagerVisible(false)}
        onExpeditionStartedFromManager={() => {
          showToast('Expedition started');
        }}
        onExpeditionEnded={handleExpeditionEnded}
        onOpenWidgetLibraryFromManager={handleOpenWidgetLibraryFromManager}
        onRestoreDefaults={handleRestoreDefaults}
        onOpenPresetsFromManager={() => setPresetsModalVisible(true)}
        onOpenPowerConnectionsFromManager={handleOpenPowerConnections}
      />
    </View>
  );

}





// ── Exported with Error Boundary ────────────────────────
export default function DashboardScreen() {
  return (
    <TabErrorBoundary tabName="DASHBOARD">
      <DashboardScreenInner />
    </TabErrorBoundary>
  );
}

const styles = StyleSheet.create({

  container: { flex: 1, paddingTop: 0, paddingBottom: 70, overflow: 'visible' },
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

  // ── Tabs Section — holds EXPEDITION + HIGHWAY labels + underline ──
  tabsSection: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    height: 34,
    position: 'relative',
    borderWidth: 1,
    borderRadius: 11,
    paddingHorizontal: 2,
    overflow: 'hidden',
    zIndex: 1,
  },

  tabBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    height: 28,
    marginVertical: 2,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: 'transparent',
    paddingHorizontal: 6,
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

  // ── Underline — positioned absolutely within tabsSection ──
  tabUnderline: {
    position: 'absolute',
    bottom: 1,
    width: '33.333%',
    height: 2,
    borderRadius: 999,
  },

  // ── Controls Section — AUTO toggle + "+" button, right-aligned ──
  tabControlsSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingLeft: 4,
    paddingRight: 2,
    height: 34,
    width: 70,
    justifyContent: 'flex-end',
  },

  // ── Widget Library Manager "+" Button (inside controls section) ──
  libraryManagerBtn: {
    justifyContent: 'center',
    alignItems: 'center',
    width: 28,
    height: 28,
  },
  libraryManagerPlaceholder: {
    width: 28,
    height: 28,
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

  // gridContainer: full-width, flex fill, no width constraints
  // that could cause child grids to left-lock
  gridContainer: {
    flex: 1,
    width: '100%',
    alignSelf: 'stretch',
    paddingTop: 6,
  },
  gridContainerHighway: {
    paddingTop: 4,
    overflow: 'hidden',
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
  advToggle: {
    width: 28,
    height: 28,
    borderRadius: 7,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── Advanced Mode panel ────────────────────────────
  advPanel: {
    marginHorizontal: 12,
    marginBottom: 4,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
  },
  advPanelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  advPanelLabel: {
    flex: 1,
    fontSize: 11,
    fontWeight: '600',
  },
  advPanelHint: {
    fontSize: 9,
    marginTop: 4,
    lineHeight: 13,
  },
  advBadgeRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 8,
    flexWrap: 'wrap',
  },
  advBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: 'rgba(156,136,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(156,136,255,0.2)',
  },
  advBadgeText: {
    fontSize: 7,
    fontWeight: '800',
    color: '#9C88FF',
    letterSpacing: 1,
  },

  collapseToggle: {
    width: 28,
    height: 28,
    borderRadius: 7,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  restoreToggle: {
    width: 28,
    height: 28,
    borderRadius: 7,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── Presets Button ─────────────────────────────────
  presetsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 7,
    borderWidth: 1,
  },
  presetsBtnText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },


  // ── Auto-collapse settings ─────────────────────────
  collapseSettings: {
    marginHorizontal: 12,
    marginBottom: 4,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
  },
  collapseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  collapseLabel: {
    flex: 1,
    fontSize: 11,
    fontWeight: '600',
  },
  collapseHint: {
    fontSize: 9,
    marginTop: 4,
    lineHeight: 13,
  },
  expandBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    marginTop: 8,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
  },
  expandBtnText: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1,
  },

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
  compactIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    marginHorizontal: 12,
    marginBottom: 2,
    paddingVertical: 3,
    borderRadius: 4,
  },
  compactIndicatorText: {
    fontSize: 7,
    fontWeight: '800',
    letterSpacing: 1.5,
  },

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

  briefTabContent: {
    flex: 1,
    paddingHorizontal: 12,
    paddingTop: 4,
    paddingBottom: 4,
    gap: 10,
  },
  briefTabCardWrap: {
    flexShrink: 0,
  },
  briefTabEmptyState: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 18,
    alignItems: 'center',
    gap: 8,
  },
  briefTabEmptyTitle: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  briefTabEmptyText: {
    fontSize: 11,
    lineHeight: 17,
    textAlign: 'center',
    fontWeight: '500',
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
  minHeight: 0,
},
dashboardTopCluster: {
  flexShrink: 0,
},
dashboardGridRegion: {
  flex: 1,
  minHeight: 0,
},

missionBriefContainer: {
  paddingHorizontal: 14,
  paddingTop: 6,
  paddingBottom: 0,
  flexShrink: 0,
  zIndex: 20,
},
missionBriefContainerShort: {
  paddingHorizontal: 12,
  paddingTop: 2,
},

dashboardSurfaceWrap: {
  paddingHorizontal: 14,
  paddingTop: 4,
  paddingBottom: 4,
  flexShrink: 0,
},
dashboardSurfaceWrapShort: {
  paddingHorizontal: 12,
  paddingTop: 2,
  paddingBottom: 4,
},
dashboardSurfacePanel: {
  paddingHorizontal: 14,
  paddingVertical: 9,
},
dashboardSurfaceEyebrow: {
  marginBottom: 4,
  fontSize: 9,
  fontWeight: '800',
  letterSpacing: 1.2,
  textTransform: 'uppercase',
},
dashboardSurfaceHeader: {
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 12,
},
dashboardSurfaceCopy: {
  flex: 1,
  minWidth: 0,
},
dashboardSurfaceTitle: {
  fontSize: 13,
  fontWeight: '700',
  letterSpacing: 0.3,
},
dashboardSurfaceSubtitle: {
  marginTop: 4,
  fontSize: 11,
  lineHeight: 15,
  fontWeight: '500',
},
dashboardSurfaceBadges: {
  flexDirection: 'row',
  alignItems: 'center',
  gap: 6,
  flexShrink: 0,
},
dashboardSurfaceBadge: {
  paddingHorizontal: 8,
  paddingVertical: 5,
  borderRadius: 999,
  borderWidth: 1,
  maxWidth: 132,
},
dashboardSurfaceBadgeText: {
  fontSize: 9,
  fontWeight: '800',
  letterSpacing: 0.6,
  textTransform: 'uppercase',
},
dashboardSurfaceSecondaryRow: {
  marginTop: 8,
  flexDirection: 'row',
  flexWrap: 'wrap',
  gap: 8,
},
dashboardSurfaceSecondaryPill: {
  paddingHorizontal: 10,
  paddingVertical: 6,
  borderRadius: 999,
  borderWidth: 1,
  maxWidth: '100%',
},
dashboardSurfaceSecondaryText: {
  fontSize: 10,
  fontWeight: '600',
},
dashboardStartupNoticeWrap: {
  flexShrink: 0,
},
dashboardStartupGrid: {
  flex: 1,
  minHeight: 0,
  flexDirection: 'row',
  gap: 10,
},
dashboardStartupWidget: {
  minHeight: 168,
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






