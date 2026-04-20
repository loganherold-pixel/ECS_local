/**
 * Navigate Tab â€” ECS Tactical Navigation Center (Redesigned)
 *
 * Zero-scroll, map-primary layout.
 * Compact shell header with map-primary controls routed through Tools.
 * All configuration opens as modal sheets.
 *
 * Layout: Header â†’ Map (fills remaining space)
 *
 * Stability + refactor pass: overlay gating cleaned up, duplicate intel rendering removed,
 * replay bar anchored to the map edge, and cleanup refresh path corrected.
 *
 * Tilt Alert Zones layer: plots GPS-located tilt alerts as colored
 * diamond markers on the map (orange=warning, red=critical) with
 * tap-to-view detail modal and toggle in overlay controls.
 */
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { parseGeoFile, getPrimaryRouteCoordinates } from '../../lib/gpxParser';

import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Alert,
  Modal,
  TextInput,
  Dimensions,
  ActivityIndicator,
  Animated,
  BackHandler,
} from 'react-native';
import { SafeIcon as Ionicons } from '../../components/SafeIcon';
import { hapticMicro, hapticCommand } from '../../lib/haptics';

import TabErrorBoundary from '../../components/TabErrorBoundary';

// â”€â”€ Phase 15: Stability Guards â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
import {
  isValidGPS,
  isValidRouteGeometry,
  stabilityLog,
} from '../../lib/ecsStabilityGuards';




import { useFocusEffect, useIsFocused } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import { TACTICAL, TYPO, DENSITY, GOLD_RAIL } from '../../lib/theme';


import { useApp } from '../../context/AppContext';
import { useTheme } from '../../context/ThemeContext';
import {
  runStore,
  computeRunHealth,
  type ECSRun,
  type BuildSnapshot,
} from '../../lib/runStore';

import { routeStore } from '../../lib/routeStore';
import {
  getMapboxToken,
  clearTokenCache,
  setMapboxToken,
  setMapboxTokenAsync,
  DEFAULT_MAP_STYLE,
  type MapStyleKey,
} from '../../lib/mapConfig';
import { createMigratingNonSecureStorage } from '../../lib/nonSecureStorage';



import {
  computeSegmentRisk,
  getSegmentColor,
  type SegmentRiskProfile,
} from '../../lib/segmentRiskEngine';

import {
  bailoutStore,
  getBailoutTypeMeta,
  type BailoutPoint,
  type ExitPlan,
} from '../../lib/bailoutStore';

import { pinStore } from '../../lib/pinStore';
import { missionExpeditionStore } from '../../lib/missionStore';
import {
  trailStore,
  type TrailRecordingStatus,
  type TrailStats,
  type TrailReplayPoint,
  type TrailAnalytics,
  type TrailSpeedSegment,
} from '../../lib/trailStore';

import {
  getPinTypeMeta,
  type ECSPin,
  type PinType,
} from '../../components/navigate/PinTypes';

import type {
  CameraCommand as MapSurfaceCameraCommand,
  PinMarker,
  TrailSegmentData,
  SpeedSegmentData,
} from '../../components/navigate/MapRenderer';

// â”€â”€ Remoteness Store import for campsite scoring (Phase 2) â”€â”€
import { remotenessStore } from '../../lib/remotenessStore';

// â”€â”€ Tilt Alert Zones imports â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
import {
  useTiltAlertMarkers,
  TiltAlertDetailModal,
  type TiltAlertMarker,
} from '../../components/navigate/TiltAlertZonesLayer';

import {
  loadAlertHistory,
  type TiltAlertEvent,
} from '../../lib/tiltAlertStore';

// â”€â”€ Weather Alert Layer imports â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
import {
  useWeatherAlerts,
  WeatherAlertMapOverlay,
  WeatherAlertDetailModal,
} from '../../components/navigate/WeatherAlertLayer';
import WeatherIntelPanel from '../../components/weather/WeatherIntelPanel';

// â”€â”€ Route Corridor Weather imports â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
import {
  useRouteCorridorWeather,
  RouteWeatherTimeline,
  RouteWeatherDetailModal,
} from '../../components/navigate/RouteCorridorWeather';

import Header from '../../components/Header';
import AuthModal from '../../components/AuthModal';
import Toast from '../../components/Toast';
import { ECSSearchField, ECSResultsEmptyState } from '../../components/ECSResults';
import { ECSBadge } from '../../components/ECSStatus';
import MapRenderer from '../../components/navigate/MapRenderer';
import PinDetailsModal from '../../components/navigate/PinDetailsModal';
import PinDrawer from '../../components/navigate/PinDrawer';
import ReplayBar, { type ReplaySpeed } from '../../components/navigate/ReplayBar';
import TrailStatusModal from '../../components/navigate/TrailStatusModal';
import CompassRose from '../../components/navigate/CompassRose';
import OfflineCacheModal from '../../components/navigate/OfflineCacheModal';
import StorageWarningBanner from '../../components/navigate/StorageWarningBanner';
import StorageDashboardModal from '../../components/offline-maps/StorageDashboardModal';
import RoadNavigationOverlay from '../../components/navigate/RoadNavigationOverlay';
import { ECSTransientNotice } from '../../components/ECSLoading';

import { trailHistoryStore } from '../../lib/trailHistoryStore';
import { routeAnalysisEngine, type RouteIntelligence } from '../../lib/routeAnalysisEngine';

import {
  resourceForecastEngine,
  type ResourceForecast,
  type VehicleProfileSnapshot,
  type LoadoutTotalsSnapshot,
  type TelemetrySnapshot,
} from '../../lib/resourceForecastEngine';

import { getActiveVehicleContext, getVehicleContext } from '../../lib/activeVehicleContext';
import { consumablesStore } from '../../lib/consumablesStore';
import { loadoutItemStore, loadoutStore } from '../../lib/loadoutStore';
import { tiresLiftStore } from '../../lib/tiresLiftStore';
import { vehicleSetupStore } from '../../lib/vehicleSetupStore';
import { vehicleStore } from '../../lib/vehicleStore';
import { vehicleSpecStore } from '../../lib/vehicleSpecStore';
import { bluPowerAuthority } from '../../lib/BluPowerAuthority';

import {
  terrainAnalysisEngine,
  type TerrainIntelligence,
} from '../../lib/terrainAnalysisEngine';

import {
  expeditionForecastEngine,
  type ExpeditionForecast,
} from '../../lib/expeditionForecastEngine';

import {
  campsiteCandidateEngine,
  type CampsiteCandidateResult,
} from '../../lib/campsiteCandidateEngine';
import type { RemotenessIndexOutput } from '../../lib/remotenessTypes';
import {
  useCampIntel,
  type CampIntelRouteWeatherSnapshot,
} from '../../lib/campIntel/useCampIntel';
import type { CampIntelSite } from '../../lib/campIntel/campIntelTypes';
import { useCampIntelMarkerLayer } from '../../components/navigate/CampIntelMarkerLayer';
import CampIntelDetailCard from '../../components/navigate/CampIntelDetailCard';

// â”€â”€ VCD Adaptive Panel State Engine â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
import { useVCDPanelStates } from '../../lib/vcdPanelStateEngine';
import VCDAdaptivePanel from '../../components/navigate/VCDAdaptivePanel';

// â”€â”€ Intelligence Panels â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
import RouteAnalysisPanel from '../../components/navigate/RouteAnalysisPanel';
import ResourceForecastPanel from '../../components/navigate/ResourceForecastPanel';
import TerrainAnalysisPanel from '../../components/navigate/TerrainAnalysisPanel';
import ExpeditionForecastPanel from '../../components/dashboard/ExpeditionForecastPanel';

import useECSAIHook from '../../lib/ai/useECSAI';
import { buildAIContextFromLiveState } from '../../lib/aiContextBuilder';
import { generateMissionBrief, type MissionBrief, type AssistSurface, type AutonomousAssistRule } from '../../lib/missionBriefEngine';
import { selectNavigateCommandState } from '../../lib/navigateCommandSelectors';
import MissionBriefCard from '../../components/dashboard/MissionBriefCard';

import {
  tileCacheStore,
  type TileBounds,
  type TileCacheStats,
} from '../../lib/tileCacheStore';
import { fsReadFileFromPickerUri } from '../../lib/fsCompat';
import {
  connectivity,
  type ConnectivityDetailedState,
} from '../../lib/connectivity';

import { useThrottledGPS, type ThrottledGPSOutput } from '../../lib/useThrottledGPS';
import { useVehicleHeading, type CompassMode } from '../../lib/useVehicleHeading';
import { useRoadNavigation } from '../../lib/useRoadNavigation';
import { useTrailNavigation } from '../../lib/useTrailNavigation';
import {
  classifyNavigationHandoff,
  clearNavigationHandoffPayload,
  computeTrailLengthMiles,
  getRoadDestinationCoordinate,
  loadNavigationHandoffPayload,
  saveNavigationHandoffPayload,
  toRoadDestinationFromHandoff,
  type NavigationHandoffPayload,
  type NavigationTripMode,
} from '../../lib/navigationHandoffStore';
import { consumeNavigationFlow } from '../../lib/ecsNavigationFlow';

import GPSStatusOverlay from '../../components/navigate/GPSStatusOverlay';
import { getCommandDockHeight } from '../../lib/shellLayout';
import { ECS_STATE_COPY } from '../../lib/ecsStateCopy';
import { reportDegradedState } from '../../lib/ecsIssueIntelligence';
import { useAdaptiveLayout } from '../../lib/useAdaptiveLayout';

import {
  runStartupCleanup,
  analyzeCache,
  type CleanupReport,
  type CleanupResult,
} from '../../lib/tileAutoCleanup';

import { runAutoCleanupCheck } from '../../lib/storageCleanupEngine';

// â”€â”€ Road Classification Bridge â†’ Dashboard Mode Engine â”€â”€â”€â”€â”€â”€
import { roadClassificationBridge } from '../../lib/roadClassificationBridge';
import { dashboardModeEngine } from '../../lib/dashboardModeEngine';




// â”€â”€ Tilt Alert Zones localStorage key â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const TILT_ZONES_VISIBLE_KEY = 'ecs_tilt_alert_zones_visible';
const MAP_STYLE_MODE_STORAGE_KEY = 'ecs_map_style_mode';
const navigatePreferenceStorage = createMigratingNonSecureStorage('ecs_navigate_preferences', {
  logTag: 'NavigatePreferences',
});

let cachedMapStyleModePreference: 'day' | 'tac' | 'sat' | null = null;

async function readPersistedMapStyleMode(): Promise<'day' | 'tac' | 'sat' | null> {
  if (cachedMapStyleModePreference) return cachedMapStyleModePreference;

  try {
    const stored = await navigatePreferenceStorage.read(MAP_STYLE_MODE_STORAGE_KEY);
    if (stored === 'day' || stored === 'tac' || stored === 'sat') {
      cachedMapStyleModePreference = stored;
      return stored;
    }
  } catch {}
  return null;
}

async function persistMapStyleMode(nextMode: 'day' | 'tac' | 'sat'): Promise<void> {
  cachedMapStyleModePreference = nextMode;

  try {
    await navigatePreferenceStorage.write(MAP_STYLE_MODE_STORAGE_KEY, nextMode);
  } catch {}
}






const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const NAV_OVERLAY_Z = {
  topStatus: 80,
  cornerControls: 100,
  utility: 110,
  contextual: 120,
  modal: 160,
} as const;

const DEFAULT_TRAIL_STATS: TrailStats = {
  distance_miles: 0, distance_km: 0, elapsed_seconds: 0,
  elapsed_formatted: '0:00', avg_speed_mph: 0, max_speed_mph: 0,
  point_count: 0, segment_count: 0,
};


const safeNumber = (value: any, fallback = 0) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
};

const safeArray = <T,>(value: T[] | undefined | null): T[] => {
  return Array.isArray(value) ? value : [];
};

const safeString = (value: any, fallback = '') => {
  return typeof value === 'string' ? value : fallback;
};

const COMPASS_POWER_SAVE_IDLE_MS = 10000;
const COMPASS_MOVEMENT_DISTANCE_M = 4;
const COMPASS_MOVEMENT_SPEED_MPH = 1.5;
const NAVIGATION_HANDOFF_RESTORE_DELAY_MS = 220;
const NAVIGATION_HANDOFF_RESTORE_MAX_AGE_MS = 4 * 60 * 60 * 1000;
const EDGE_CONTROL_HIT_SLOP = { top: 10, bottom: 10, left: 10, right: 10 } as const;
const CLOSE_CONTROL_HIT_SLOP = { top: 12, bottom: 12, left: 12, right: 12 } as const;
const MAP_STYLE_MODE_OPTIONS = [
  { key: 'day', label: 'DAY' },
  { key: 'tac', label: 'TAC' },
  { key: 'sat', label: 'SAT' },
] as const;

const EMPTY_THROTTLED_GPS: ThrottledGPSOutput = {
  position: null,
  isAvailable: false,
  hasFix: false,
  isWatching: false,
  fixQuality: 'NONE',
  gpsStatus: 'UNAVAILABLE',
  error: null,
  refresh: () => {},
  retryCount: 0,
  permissionDenied: false,
  rawGPS: {
    position: null,
    isAvailable: false,
    hasFix: false,
    isWatching: false,
    fixQuality: 'NONE',
    gpsStatus: 'UNAVAILABLE',
    error: null,
    refresh: () => {},
    retryCount: 0,
    permissionDenied: false,
  },
};

function isRecentIsoTimestamp(value: string | null | undefined, maxAgeMs: number): boolean {
  if (!value) return false;
  const parsed = new Date(value).getTime();
  if (!Number.isFinite(parsed)) return false;
  return Date.now() - parsed <= maxAgeMs;
}

function haversineMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const hasValidCoordinate = (coord: any) => {
  if (!coord) return false;
  const lat = Number(coord.latitude ?? coord.lat);
  const lng = Number(coord.longitude ?? coord.lng ?? coord.lon);
  return Number.isFinite(lat) && Number.isFinite(lng);
};

const toSafeCoordinate = (coord: any) => {
  if (!hasValidCoordinate(coord)) return null;
  return {
    latitude: Number(coord.latitude ?? coord.lat),
    longitude: Number(coord.longitude ?? coord.lng ?? coord.lon),
  };
};

function formatNavMiles(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '--';
  if (value < 10) return `${value.toFixed(1)} mi`;
  return `${Math.round(value)} mi`;
}

function formatNavMeters(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '--';
  if (value < 160) {
    return `${Math.max(Math.round(value / 5) * 5, 5)} ft`;
  }
  return formatNavMiles(value / 1609.344);
}

function formatNavDuration(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds)) return '--';
  const rounded = Math.max(Math.round(seconds / 60), 1);
  if (rounded < 60) return `${rounded} min`;
  const hours = Math.floor(rounded / 60);
  const mins = rounded % 60;
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

function formatNavEta(etaIso: string | null | undefined): string {
  if (!etaIso) return '--';
  const date = new Date(etaIso);
  if (Number.isNaN(date.getTime())) return '--';
  return date.toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatNavTimestamp(value: string | null | undefined): string {
  if (!value) return 'Updated just now';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Updated just now';
  return `Updated ${date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
}

function coordinatesEqual(
  a: { lat: number; lng: number } | null | undefined,
  b: { lat: number; lng: number } | null | undefined,
): boolean {
  if (!a || !b) return false;
  return Math.abs(a.lat - b.lat) < 0.00001 && Math.abs(a.lng - b.lng) < 0.00001;
}

function tileBoundsIntersect(a: TileBounds | null | undefined, b: TileBounds | null | undefined): boolean {
  if (!a || !b) return false;
  return !(
    a.maxLat < b.minLat ||
    a.minLat > b.maxLat ||
    a.maxLng < b.minLng ||
    a.minLng > b.maxLng
  );
}

function tileBoundsContain(outer: TileBounds | null | undefined, inner: TileBounds | null | undefined): boolean {
  if (!outer || !inner) return false;
  return (
    outer.minLat <= inner.minLat &&
    outer.maxLat >= inner.maxLat &&
    outer.minLng <= inner.minLng &&
    outer.maxLng >= inner.maxLng
  );
}

function sameConnectivitySnapshot(
  a: ConnectivityDetailedState,
  b: ConnectivityDetailedState,
): boolean {
  return (
    a.status === b.status &&
    a.level === b.level &&
    a.networkType === b.networkType &&
    a.isOnline === b.isOnline &&
    a.isInternetReachable === b.isInternetReachable &&
    a.latencyMs === b.latencyMs &&
    a.lastOnlineAt === b.lastOnlineAt &&
    a.lastOfflineAt === b.lastOfflineAt &&
    a.reconnectCount === b.reconnectCount &&
    a.initialized === b.initialized
  );
}

function sameTileCacheSnapshot(
  a: { regions: { id: string; status: string; downloadedTiles: number; tileCount: number }[]; stats: TileCacheStats },
  b: { regions: { id: string; status: string; downloadedTiles: number; tileCount: number }[]; stats: TileCacheStats },
): boolean {
  if (
    a.stats.totalRegions !== b.stats.totalRegions ||
    a.stats.totalTiles !== b.stats.totalTiles ||
    a.stats.downloadedTiles !== b.stats.downloadedTiles ||
    a.stats.totalSizeMB !== b.stats.totalSizeMB ||
    a.stats.lastDownloadAt !== b.stats.lastDownloadAt ||
    a.stats.storageQuotaMB !== b.stats.storageQuotaMB ||
    a.stats.storageUsedMB !== b.stats.storageUsedMB ||
    a.stats.deviceFreeMB !== b.stats.deviceFreeMB ||
    a.stats.deviceTotalMB !== b.stats.deviceTotalMB
  ) {
    return false;
  }

  if (a.regions.length !== b.regions.length) return false;
  for (let index = 0; index < a.regions.length; index += 1) {
    const left = a.regions[index];
    const right = b.regions[index];
    if (
      left.id !== right.id ||
      left.status !== right.status ||
      left.downloadedTiles !== right.downloadedTiles ||
      left.tileCount !== right.tileCount
    ) {
      return false;
    }
  }

  return true;
}

function sameCenterZoomTarget(
  a: { lat: number; lng: number; zoom: number } | null,
  b: { lat: number; lng: number; zoom: number } | null,
): boolean {
  if (a === b) return true;
  if (!a || !b) return !a && !b;
  return a.lat === b.lat && a.lng === b.lng && a.zoom === b.zoom;
}

function sameRouteIntelligence(
  a: RouteIntelligence | null,
  b: RouteIntelligence | null,
): boolean {
  if (a === b) return true;
  if (!a || !b) return !a && !b;
  return (
    a.id === b.id &&
    a.sourceId === b.sourceId &&
    a.totalDistanceMiles === b.totalDistanceMiles &&
    a.segmentCount === b.segmentCount &&
    a.analyzedAt === b.analyzedAt
  );
}

function sameResourceForecast(
  a: ResourceForecast | null,
  b: ResourceForecast | null,
): boolean {
  if (a === b) return true;
  if (!a || !b) return !a && !b;
  return (
    a.routeIntelligenceId === b.routeIntelligenceId &&
    a.routeMiles === b.routeMiles &&
    a.overallStatus === b.overallStatus &&
    a.sufficiencyLevel === b.sufficiencyLevel &&
    a.computedAt === b.computedAt
  );
}

function sameTerrainIntelligence(
  a: TerrainIntelligence | null,
  b: TerrainIntelligence | null,
): boolean {
  if (a === b) return true;
  if (!a || !b) return !a && !b;
  return (
    a.id === b.id &&
    a.routeIntelligenceId === b.routeIntelligenceId &&
    a.overallRisk === b.overallRisk &&
    a.totalSegments === b.totalSegments &&
    a.analyzedAt === b.analyzedAt
  );
}

function sameExpeditionForecast(
  a: ExpeditionForecast | null,
  b: ExpeditionForecast | null,
): boolean {
  if (a === b) return true;
  if (!a || !b) return !a && !b;
  return (
    a.id === b.id &&
    a.status === b.status &&
    a.computedAt === b.computedAt &&
    a.sourceIds.routeIntelligenceId === b.sourceIds.routeIntelligenceId &&
    a.sourceIds.resourceForecastId === b.sourceIds.resourceForecastId &&
    a.sourceIds.terrainIntelligenceId === b.sourceIds.terrainIntelligenceId
  );
}

function sameCampsiteCandidates(
  a: CampsiteCandidateResult | null,
  b: CampsiteCandidateResult | null,
): boolean {
  if (a === b) return true;
  if (!a || !b) return !a && !b;
  return (
    a.id === b.id &&
    a.routeIntelligenceId === b.routeIntelligenceId &&
    a.candidateCount === b.candidateCount &&
    a.bestConfidence === b.bestConfidence &&
    a.analyzedAt === b.analyzedAt
  );
}

function buildNavigationPayloadSignature(payload: NavigationHandoffPayload | null): string {
  if (!payload) return 'null';
  return JSON.stringify({
    id: payload.id,
    createdAt: payload.createdAt,
    tripMode: payload.tripMode ?? null,
    title: payload.title,
    subtitle: payload.subtitle ?? null,
    coordinate: payload.coordinate
      ? {
          lat: Number(payload.coordinate.lat).toFixed(5),
          lng: Number(payload.coordinate.lng).toFixed(5),
        }
      : null,
    roadDestinationCoordinate: payload.roadDestinationCoordinate
      ? {
          lat: Number(payload.roadDestinationCoordinate.lat).toFixed(5),
          lng: Number(payload.roadDestinationCoordinate.lng).toFixed(5),
        }
      : null,
    trailLengthMiles: payload.trailLengthMiles ?? null,
    trailGeometryCount: safeArray(payload.trailGeometry).length,
    waypointCount: safeArray(payload.trailWaypoints).length,
    decisionPointCount: safeArray(payload.trailDecisionPoints).length,
    previewSource:
      payload.routeMetadata && typeof payload.routeMetadata === 'object'
        ? (payload.routeMetadata as Record<string, unknown>).previewSource ?? null
        : null,
    runId:
      payload.routeMetadata && typeof payload.routeMetadata === 'object'
        ? (payload.routeMetadata as Record<string, unknown>).runId ?? null
        : null,
  });
}

function sameNavigationPayload(
  a: NavigationHandoffPayload | null,
  b: NavigationHandoffPayload | null,
): boolean {
  if (a === b) return true;
  if (!a || !b) return !a && !b;
  return buildNavigationPayloadSignature(a) === buildNavigationPayloadSignature(b);
}

function isRestorableNavigationHandoffPayload(
  payload: NavigationHandoffPayload | null,
): payload is NavigationHandoffPayload {
  if (!payload?.id || !payload.title) return false;
  if (!isRecentIsoTimestamp(payload.createdAt, NAVIGATION_HANDOFF_RESTORE_MAX_AGE_MS)) {
    return false;
  }

  return (
    !!payload.coordinate ||
    !!payload.trailheadCoordinate ||
    !!payload.roadDestinationCoordinate ||
    safeArray(payload.trailGeometry).length > 1
  );
}

function buildCenterZoomSignature(target: { lat: number; lng: number; zoom: number } | null): string {
  if (!target) return 'null';
  return `${target.lat.toFixed(5)}:${target.lng.toFixed(5)}:${target.zoom.toFixed(2)}`;
}

function buildMapCameraCommandSignature(command: MapSurfaceCameraCommand | null): string {
  if (!command) return 'null';
  return JSON.stringify({
    mode: command.mode,
    center: command.center
      ? {
          latitude: Number(command.center.latitude).toFixed(5),
          longitude: Number(command.center.longitude).toFixed(5),
        }
      : null,
    zoom: command.zoom ?? null,
    durationMs: command.durationMs ?? null,
    animate: command.animate ?? null,
    reason: command.reason ?? null,
    fitBounds: command.fitBounds
      ? {
          north: Number(command.fitBounds.north).toFixed(5),
          south: Number(command.fitBounds.south).toFixed(5),
          east: Number(command.fitBounds.east).toFixed(5),
          west: Number(command.fitBounds.west).toFixed(5),
          padding: command.fitBounds.padding ?? null,
          maxZoom: command.fitBounds.maxZoom ?? null,
        }
      : null,
  });
}

function sameRunCollection(a: ECSRun[], b: ECSRun[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let index = 0; index < a.length; index += 1) {
    const left = a[index];
    const right = b[index];
    if (
      left.id !== right.id ||
      left.updated_at !== right.updated_at ||
      left.title !== right.title ||
      safeArray(left.points).length !== safeArray(right.points).length
    ) {
      return false;
    }
  }
  return true;
}

function samePinCollection(a: ECSPin[], b: ECSPin[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let index = 0; index < a.length; index += 1) {
    const left = a[index];
    const right = b[index];
    if (
      left.id !== right.id ||
      left.lat !== right.lat ||
      left.lng !== right.lng ||
      left.resolved !== right.resolved ||
      left.type !== right.type ||
      left.title !== right.title
    ) {
      return false;
    }
  }
  return true;
}

function sameTrailSegments(a: TrailSegmentData[], b: TrailSegmentData[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let index = 0; index < a.length; index += 1) {
    const left = a[index];
    const right = b[index];
    const leftCoordinateCount = Array.isArray(left.coordinates) ? left.coordinates.length : 0;
    const rightCoordinateCount = Array.isArray(right.coordinates) ? right.coordinates.length : 0;
    if (
      left.id !== right.id ||
      leftCoordinateCount !== rightCoordinateCount ||
      left.color !== right.color
    ) {
      return false;
    }
  }
  return true;
}

function toTrailSegmentData(
  segments: { segment_id: string; coordinates: [number, number][] }[],
): TrailSegmentData[] {
  return segments.map((segment, index) => ({
    id: segment.segment_id || `trail-segment-${index}`,
    coordinates: safeArray(segment.coordinates),
    color: '#D4A017',
  }));
}

type NavigateOperationalMode =
  | 'live'
  | 'syncing'
  | 'degraded'
  | 'offline_cached_route'
  | 'offline_partial_map'
  | 'offline_unavailable';

type NavigateOperationalState = {
  mode: NavigateOperationalMode;
  tone: 'live' | 'degraded' | 'offline' | 'unavailable';
  label: string;
  previewStatusLabel: string | null;
  activeStatusLabel: string | null;
  searchLabel: string;
  searchDetail: string | null;
  activeDetail: string;
  previewDetail: string;
  liveSearchAvailable: boolean;
  liveRoutingAvailable: boolean;
  hasRouteSupport: boolean;
  hasMapCoverage: boolean;
};

function joinOperationalStatus(
  base: string | null | undefined,
  operational: string | null | undefined,
): string {
  const normalizedBase = base?.trim();
  const normalizedOperational = operational?.trim();
  if (!normalizedBase) return normalizedOperational ?? '';
  if (!normalizedOperational) return normalizedBase;
  return `${normalizedBase} â€¢ ${normalizedOperational}`;
}


function replaceVisibleAIWithECS(input: string): string {
  return input
    .replace(/AI/g, 'ECS')
    .replace(/A\.I\./g, 'ECS')
    .replace(/ai/g, 'ecs');
}

function sanitizeVisibleLanguage<T>(value: T): T {
  if (typeof value === 'string') {
    return replaceVisibleAIWithECS(value) as T;
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeVisibleLanguage(item)) as T;
  }
  if (value && typeof value === 'object') {
    const next: Record<string, unknown> = {};
    Object.entries(value as Record<string, unknown>).forEach(([key, child]) => {
      next[key] = sanitizeVisibleLanguage(child);
    });
    return next as T;
  }
  return value;
}

type NavigateTopPopup =
  | 'tools'
  | 'intel'
  | 'pinDrawer'
  | 'trail'
  | 'stitch'
  | 'offlineCache'
  | 'storageDashboard'
  | 'pinEditor'
  | null;

type StitchBuildResult = {
  parsed: {
    name: string;
    routePoints: { lat: number; lng: number; ele_m: number | null; time: string | null }[];
    trackPoints: [];
    primaryCoords: { lat: number; lng: number; ele_m: number | null; time: string | null }[];
    waypoints: {
      lat: number;
      lon: number;
      ele: number | null;
      name: string | null;
      time: string | null;
      waypointType?: string | null;
    }[];
  };
  transitionLegCount: number;
  segmentCount: number;
};

function NavigateScreenInner() {
  const [cameraMode, setCameraMode] = useState<'north' | 'heading' | 'free'>('north');
  const { showToast, user } = useApp();
  const { feedSpeed, dismissAutoDriving } = useTheme();
  const router = useRouter();
const adaptive = useAdaptiveLayout();
const insets = useSafeAreaInsets();
const expandedTopOffset = insets.top + 10;
const MAP_TOP_ANCHOR = expandedTopOffset;

// top edge controls should hug the map border, not the safe-area/header stack
const TOP_MAP_CONTROLS_OFFSET = 6;
const [activeTopPopup, setActiveTopPopup] = useState<NavigateTopPopup>(null);
const [activeVehicleId, setActiveVehicleId] = useState<string | null>(() => vehicleSetupStore.getActiveVehicleId());
const [activeVehicleRevision, setActiveVehicleRevision] = useState(0);
const [stitchSegmentIds, setStitchSegmentIds] = useState<string[]>([]);
const [stitchName, setStitchName] = useState('Stitched Expedition');

// â”€â”€ ECS UI State â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const [mapStyleMode, setMapStyleMode] = useState<'day' | 'tac' | 'sat'>(() => cachedMapStyleModePreference ?? 'day');
const [mapExpanded, setMapExpanded] = useState(false);

// â”€â”€ Top layout measurement â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const [headerHeight, setHeaderHeight] = useState(0);
const [storageBannerHeight, setStorageBannerHeight] = useState(0);
const actionBarHeight = 0;

// â”€â”€ Layout offsets â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const commandDockHeight = getCommandDockHeight(insets.bottom);

const OVERLAY_EDGE = adaptive.navigate.overlayEdge;
const OVERLAY_GAP = adaptive.navigate.overlayGap;
const OVERLAY_GROUP_GAP = adaptive.navigate.overlayGroupGap;
const LOWER_DOCK_EXCLUSION = commandDockHeight + adaptive.navigate.overlayGroupGap;

// map overlays render inside the map container, so 0 is the mapâ€™s top edge
const MAP_TOP_EDGE = 0;

// shared top anchor for the upper map controls
const FLOATING_CONTROLS_TOP_LEFT = MAP_TOP_EDGE + TOP_MAP_CONTROLS_OFFSET;
const PAGE_FRAME_TOP_GAP = adaptive.isExpanded ? 8 : 6;
const PAGE_FRAME_BOTTOM_GAP = adaptive.isExpanded ? 8 : 6;

// lower floating controls
const FLOATING_CONTROLS_BOTTOM = commandDockHeight + 4;

const COMPASS_SIZE = 68;
const COMPASS_RIGHT = OVERLAY_EDGE;
const COMPASS_DOCK_CLEARANCE = 6;
const COMPASS_CORNER_GAP = adaptive.isExpanded ? 14 : 12;
const COMPASS_BOTTOM = commandDockHeight + COMPASS_DOCK_CLEARANCE;
const ACTIVE_GUIDANCE_RIGHT_INSET = COMPASS_SIZE + COMPASS_RIGHT + COMPASS_CORNER_GAP;

const FLOATING_PILL_HEIGHT = 34;
const FLOATING_PILL_TOP_LEFT = FLOATING_CONTROLS_TOP_LEFT;
const ROUTE_SURFACE_HEIGHT_PREVIEW = adaptive.navigate.routeSurfacePreviewHeight;
const ROUTE_SURFACE_HEIGHT_ACTIVE = adaptive.navigate.routeSurfaceActiveHeight;
const ROUTE_SURFACE_HEIGHT_ARRIVED = adaptive.navigate.routeSurfaceArrivedHeight;

const MAP_TOP_CONTROL_ROW = mapExpanded
  ? EXPANDED_ACTION_TOP + actionBarHeight + OVERLAY_GAP
  : FLOATING_CONTROLS_TOP_LEFT;

const TOP_STATUS_STACK_START = MAP_TOP_CONTROL_ROW + FLOATING_PILL_HEIGHT + OVERLAY_GAP;
const WEATHER_ALERT_TOP = TOP_STATUS_STACK_START + 42;
const ROUTE_WEATHER_TOP = WEATHER_ALERT_TOP + 58;
const DROP_PIN_BOTTOM = COMPASS_BOTTOM + COMPASS_SIZE + OVERLAY_GROUP_GAP;
const REPLAY_BOTTOM = LOWER_DOCK_EXCLUSION + 24;

// popup sheet bounds inside the map area
const MAP_POPUP_TOP = TOP_STATUS_STACK_START + PAGE_FRAME_TOP_GAP;
const MAP_POPUP_BOTTOM = LOWER_DOCK_EXCLUSION + PAGE_FRAME_BOTTOM_GAP;
const MAP_POPUP_WIDTH = Math.min(
  adaptive.windowWidth - OVERLAY_EDGE * 2,
  adaptive.navigate.popupWidth ?? (adaptive.isExpanded ? 420 : 360),
);
const TOOLS_POPUP_WIDTH = Math.min(MAP_POPUP_WIDTH, adaptive.isExpanded ? 360 : 324);
const TOP_RIGHT_UTILITY_WIDTH = adaptive.isExpanded ? 156 : 140;

const minimizeTopOffset = insets.top + 12;
const collapsedRouteBadgeTop = 10;

const MPH_OVERLAY_TOP = MAP_TOP_CONTROL_ROW;

const PIN_LIST_TOP = MAP_TOP_CONTROL_ROW + FLOATING_PILL_HEIGHT + OVERLAY_GAP;

// Map already sits below header/action/banner in collapsed mode,
// so the route badge only needs a small offset inside the map.
const collapsedTopChromeHeight =
  headerHeight + actionBarHeight + storageBannerHeight;

const renderMapPopup = (
  visible: boolean,
  title: string,
  icon: React.ComponentProps<typeof Ionicons>['name'],
  onClose: () => void,
  children: React.ReactNode,
  popupWidth: number = MAP_POPUP_WIDTH,
  options?: {
    placement?: 'right' | 'center';
    backdropTint?: string;
  },
) => {
  if (!visible) return null;

  const centeredLeft = Math.max(
    OVERLAY_EDGE,
    Math.round((adaptive.windowWidth - popupWidth) / 2),
  );

  return (
    <View style={styles.mapPopupLayer} pointerEvents="box-none">
      <TouchableOpacity
        style={[
          styles.mapPopupBackdrop,
          {
            top: MAP_POPUP_TOP,
            bottom: MAP_POPUP_BOTTOM,
            backgroundColor: options?.backdropTint ?? 'rgba(0,0,0,0.30)',
          },
        ]}
        activeOpacity={1}
        onPress={onClose}
      />

      <View
        style={[
          styles.mapPopupShell,
          {
            top: MAP_POPUP_TOP,
            bottom: MAP_POPUP_BOTTOM,
            right: options?.placement === 'center' ? undefined : OVERLAY_EDGE,
            width: popupWidth,
            left: options?.placement === 'center' ? centeredLeft : undefined,
          },
        ]}
      >
        <View style={styles.mapPopupHeader}>
          <View style={styles.mapPopupTitleRow}>
            <Ionicons name={icon} size={16} color={TACTICAL.amber} />
            <Text style={styles.mapPopupTitle}>{title}</Text>
          </View>

          <TouchableOpacity onPress={onClose} activeOpacity={0.8} hitSlop={CLOSE_CONTROL_HIT_SLOP}>
            <Ionicons name="close" size={18} color={TACTICAL.textMuted} />
          </TouchableOpacity>
        </View>

        <View style={styles.mapPopupBody}>{children}</View>
      </View>
    </View>
  );
};

function buildNavigationPayloadFromRun(
  run: ECSRun,
  options?: { segmentCount?: number; transitionLegCount?: number },
): NavigationHandoffPayload | null {
  if (!run || !Array.isArray(run.points) || run.points.length < 2) return null;

  const trailGeometry = run.points
    .map((point) => {
      if (!Number.isFinite(point.lat) || !Number.isFinite(point.lng)) return null;
      return { lat: point.lat, lng: point.lng };
    })
    .filter((point): point is { lat: number; lng: number } => !!point);

  if (trailGeometry.length < 2) return null;

  const waypointCount = Array.isArray(run.waypoints) ? run.waypoints.length : 0;
  const segmentCount = Math.max(options?.segmentCount ?? 1, 1);
  const transitionLegCount = Math.max(options?.transitionLegCount ?? 0, 0);
  const subtitleParts = [
    `${run.stats.distance_miles.toFixed(1)} mi`,
    waypointCount > 0 ? `${waypointCount} waypoints` : null,
    segmentCount > 1 ? `${segmentCount} segments` : null,
  ].filter(Boolean);

  return {
    id: run.id,
    source: 'import',
    type: 'trail',
    title: run.title,
    subtitle: subtitleParts.join(' â€¢ ') || null,
    coordinate: trailGeometry[trailGeometry.length - 1] ?? null,
    trailheadCoordinate: trailGeometry[0] ?? null,
    roadDestinationCoordinate: null,
    trailGeometry,
    trailLengthMiles:
      Number.isFinite(run.stats.distance_miles) && run.stats.distance_miles > 0
        ? run.stats.distance_miles
        : computeTrailLengthMiles(trailGeometry),
    trailCategory: segmentCount > 1 ? 'Stitched Expedition' : 'Imported Trail',
    tripMode: 'trail',
    trailWaypoints: safeArray(run.waypoints)
      .map((waypoint: any, index: number) => {
        const lat = Number(waypoint?.lat ?? waypoint?.latitude);
        const lng = Number(waypoint?.lon ?? waypoint?.lng ?? waypoint?.longitude);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
        return {
          id: String(waypoint?.id ?? `${run.id}-wp-${index}`),
          coordinate: { lat, lng },
          name:
            typeof waypoint?.name === 'string'
              ? waypoint.name
              : typeof waypoint?.title === 'string'
                ? waypoint.title
                : null,
          type:
            typeof waypoint?.waypointType === 'string'
              ? waypoint.waypointType
              : typeof waypoint?.type === 'string'
                ? waypoint.type
                : null,
          note: null,
          routeIndex: null,
          reachedRadiusM: 35,
        };
      })
      .filter(Boolean) as NavigationHandoffPayload['trailWaypoints'],
    trailDecisionPoints: [],
    routeMetadata: {
      previewSource: 'run_store',
      runId: run.id,
      runTitle: run.title,
      segmentCount,
      transitionLegCount,
      source: run.source,
    },
    landmarkMetadata: null,
    raw: {
      runId: run.id,
      pointCount: run.points.length,
      waypointCount,
      segmentCount,
      transitionLegCount,
    },
    // Preserve a stable identity for run-backed previews so GPX imports
    // do not churn payload sync effects on every render.
    createdAt:
      (typeof run.updated_at === 'string' && run.updated_at) ||
      (typeof run.created_at === 'string' && run.created_at) ||
      run.id,
  };
}

function buildStitchedRunImport(selectedRuns: ECSRun[], title: string): StitchBuildResult {
  const routePoints: StitchBuildResult['parsed']['routePoints'] = [];
  const waypoints: StitchBuildResult['parsed']['waypoints'] = [];
  let transitionLegCount = 0;

  selectedRuns.forEach((run, index) => {
    const validPoints = safeArray(run.points)
      .filter((point) => Number.isFinite(point?.lat) && Number.isFinite(point?.lng))
      .map((point) => ({
        lat: Number(point.lat),
        lng: Number(point.lng),
        ele_m: Number.isFinite(Number(point.ele_m)) ? Number(point.ele_m) : null,
        time: typeof point.time === 'string' ? point.time : null,
      }));

    if (validPoints.length === 0) return;

    if (routePoints.length > 0) {
      const previousPoint = routePoints[routePoints.length - 1];
      const nextStartPoint = validPoints[0];
      const hasGap =
        previousPoint.lat !== nextStartPoint.lat || previousPoint.lng !== nextStartPoint.lng;

      if (hasGap) {
        transitionLegCount += 1;
        routePoints.push({
          lat: previousPoint.lat,
          lng: previousPoint.lng,
          ele_m: previousPoint.ele_m,
          time: previousPoint.time,
        });
        routePoints.push({
          lat: nextStartPoint.lat,
          lng: nextStartPoint.lng,
          ele_m: nextStartPoint.ele_m,
          time: nextStartPoint.time,
        });
        waypoints.push({
          lat: nextStartPoint.lat,
          lon: nextStartPoint.lng,
          ele: nextStartPoint.ele_m,
          name: `Transition to ${run.title}`,
          time: null,
          waypointType: 'transition',
        });
      }
    }

    routePoints.push(...validPoints);

    safeArray(run.waypoints).forEach((waypoint: any) => {
      const lat = Number(waypoint?.lat ?? waypoint?.latitude);
      const lon = Number(waypoint?.lon ?? waypoint?.lng ?? waypoint?.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
      waypoints.push({
        lat,
        lon,
        ele: Number.isFinite(Number(waypoint?.ele)) ? Number(waypoint.ele) : null,
        name:
          typeof waypoint?.name === 'string'
            ? waypoint.name
            : typeof waypoint?.title === 'string'
              ? waypoint.title
              : null,
        time: typeof waypoint?.time === 'string' ? waypoint.time : null,
        waypointType:
          typeof waypoint?.waypointType === 'string' ? waypoint.waypointType : null,
      });
    });

    if (index < selectedRuns.length - 1) {
      const nextRun = selectedRuns[index + 1];
      if (nextRun) {
        const finalPoint = validPoints[validPoints.length - 1];
        waypoints.push({
          lat: finalPoint.lat,
          lon: finalPoint.lng,
          ele: finalPoint.ele_m,
          name: `Segment ${index + 1} complete â€¢ ${run.title}`,
          time: null,
          waypointType: 'checkpoint',
        });
      }
    }
  });

  return {
    parsed: {
      name: title,
      routePoints,
      trackPoints: [],
      primaryCoords: routePoints,
      waypoints,
    },
    transitionLegCount,
    segmentCount: selectedRuns.length,
  };
}

  
  // â”€â”€ Mounted ref for memory leak prevention â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const mountedRef = useRef(true);
  const cleanupRanRef = useRef(false);
  const isFocused = useIsFocused();
  const gpsCenteredRef = useRef(false);
  const gps = useThrottledGPS({
    enabled: isFocused,
    highAccuracy: true,
    maxRetries: 5,
    retryIntervalMs: 3000,
  }) ?? EMPTY_THROTTLED_GPS;

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      roadClassificationBridge.reset();
    };
  }, []);



  const [authVisible, setAuthVisible] = useState(false);
const [runs, setRuns] = useState<ECSRun[]>([]);
const [activeRun, setActiveRun] = useState<ECSRun | null>(null);
const [snapshotModalVisible, setSnapshotModalVisible] = useState(false);

// Map state
const [mapToken, setMapToken] = useState<string | null>(null);
const [mapLoading, setMapLoading] = useState(true);
const [mapSurfaceReady, setMapSurfaceReady] = useState(false);
const [mapOverlayStartupReady, setMapOverlayStartupReady] = useState(false);

const hasToken = !!mapToken;
const isMapUIReady = hasToken && !mapLoading && mapSurfaceReady;

const handleMapStyleModeChange = useCallback((nextMode: 'day' | 'tac' | 'sat') => {
  setMapStyleMode((prev) => {
    if (prev === nextMode) return prev;
    void persistMapStyleMode(nextMode);
    return nextMode;
  });
}, []);

const mapStyle: MapStyleKey = useMemo(() => {
  if (mapStyleMode === 'tac') return 'tactical';
  if (mapStyleMode === 'sat') return 'satellite';
  return 'ecs';
}, [mapStyleMode]);

useEffect(() => {
  let cancelled = false;

  (async () => {
    const persisted = await readPersistedMapStyleMode();
    if (cancelled || !persisted) return;

    setMapStyleMode((prev) => (prev === persisted ? prev : persisted));
  })();

  return () => {
    cancelled = true;
  };
}, []);

useEffect(() => {
  if (!hasToken || mapLoading || !mapSurfaceReady) {
    setMapOverlayStartupReady(false);
    return undefined;
  }

  const timer = setTimeout(() => {
    if (!mountedRef.current) return;
    setMapOverlayStartupReady(true);
  }, isFocused ? 120 : 0);

  return () => clearTimeout(timer);
}, [hasToken, isFocused, mapLoading, mapSurfaceReady]);

const [followUser, setFollowUser] = useState(false);
const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);


const tokenRetryCountRef = useRef(0);
const tokenRetryTimerRef = useRef<any>(null);

// NEW â€” prevents the 20s guard timeout from firing after the token already resolved
const tokenResolvedRef = useRef(false);
const tokenGuardTimeoutRef = useRef<any>(null);


  


  const handleMapRetry = useCallback(async () => {
    setMapLoading(true);
    setMapSurfaceReady(false);
    clearTokenCache();

    try {
      const token = await getMapboxToken();
      setMapToken(token || '');
    } catch {
      setMapToken('');
    }

    setMapLoading(false);
  }, []);



  // â”€â”€ Phase 2.8: Pin state â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const [allPins, setAllPins] = useState<ECSPin[]>([]);
const [editingPin, setEditingPin] = useState<ECSPin | null>(null);
const [dropCoords, setDropCoords] = useState<{ lat: number; lng: number } | null>(null);

// Direct-tap pin mode
const [pinDropMode, setPinDropMode] = useState(false);

const pinModePulse = useRef(new Animated.Value(1)).current;

useEffect(() => {
  if (pinDropMode) {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pinModePulse, {
          toValue: 1.06,
          duration: 700,
          useNativeDriver: true,
        }),
        Animated.timing(pinModePulse, {
          toValue: 1,
          duration: 700,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }

  pinModePulse.stopAnimation();
  pinModePulse.setValue(1);
}, [pinDropMode, pinModePulse]);

// Keep crosshair available only if you still want it for other workflows
const [showCrosshair, setShowCrosshair] = useState(false);

// â”€â”€ Phase 3: Center + Zoom command state â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const [centerZoomTrigger, setCenterZoomTrigger] = useState(0);
const [centerZoomTarget, setCenterZoomTarget] = useState<{ lat: number; lng: number; zoom: number } | null>(null);
const [mapCameraCommand, setMapCameraCommand] = useState<MapSurfaceCameraCommand | null>(null);
const [mapCameraCommandTrigger, setMapCameraCommandTrigger] = useState(0);
const lastCenterZoomSignatureRef = useRef(buildCenterZoomSignature(null));
const lastMapCameraCommandSignatureRef = useRef(buildMapCameraCommandSignature(null));

const queueCenterZoomTarget = useCallback((
  nextTarget: { lat: number; lng: number; zoom: number },
  options?: { force?: boolean },
) => {
  const nextSignature = buildCenterZoomSignature(nextTarget);
  const shouldForce = options?.force === true;
  if (!shouldForce && lastCenterZoomSignatureRef.current === nextSignature) {
    return;
  }
  lastCenterZoomSignatureRef.current = nextSignature;
  setCenterZoomTarget((prev) => (sameCenterZoomTarget(prev, nextTarget) ? prev : nextTarget));
  setCenterZoomTrigger((prev) => prev + 1);
}, []);

const queueMapCameraCommand = useCallback((
  nextCommand: MapSurfaceCameraCommand,
  options?: { force?: boolean },
) => {
  const nextSignature = buildMapCameraCommandSignature(nextCommand);
  const shouldForce = options?.force === true;
  if (!shouldForce && lastMapCameraCommandSignatureRef.current === nextSignature) {
    return;
  }
  lastMapCameraCommandSignatureRef.current = nextSignature;
  setMapCameraCommand((prev) =>
    buildMapCameraCommandSignature(prev) === nextSignature ? prev : nextCommand,
  );
  setMapCameraCommandTrigger((prev) => prev + 1);
}, []);


  // â”€â”€ Phase 3.0: Pin category filter state â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const [activePinTypeFilters, setActivePinTypeFilters] = useState<PinType[]>([]);

  const handlePinTypeFilterToggle = useCallback((type: PinType) => {
    setActivePinTypeFilters(prev =>
      prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type]
    );
  }, []);

  const handlePinTypeFilterReset = useCallback(() => {
    setActivePinTypeFilters([]);
  }, []);

  // â”€â”€ Offline map caching state â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const [mapBounds, setMapBounds] = useState<TileBounds | null>(null);
  const [mapZoom, setMapZoom] = useState(10);
  const [requestBoundsTrigger, setRequestBoundsTrigger] = useState(0);
  const [navigateConnectivity, setNavigateConnectivity] = useState<ConnectivityDetailedState>(
    () => connectivity.getDetailedState(),
  );
  const [roadNavLocationMeta, setRoadNavLocationMeta] = useState<{
    accuracyM: number | null;
    speedMph: number | null;
  }>({ accuracyM: null, speedMph: null });
  const [navigateTileCacheSnapshot, setNavigateTileCacheSnapshot] = useState(() => ({
    regions: tileCacheStore.getRegions(),
    stats: tileCacheStore.getStats(),
  }));

  // â”€â”€ Phase 2.8.1: Trail recording state â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // â”€â”€ Phase 2.8.1: Trail recording state â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const [trailStatus, setTrailStatus] = useState<TrailRecordingStatus>('idle');
  const [trailStats, setTrailStats] = useState<TrailStats | null>(null);
  const [trailSegments, setTrailSegments] = useState<TrailSegmentData[]>([]);
  const [trailExportVisible, setTrailExportVisible] = useState(false);
  const [trailStyle, setTrailStyle] = useState<'normal' | 'speed'>('normal');
  const trailUpdateTimer = useRef<any>(null);

  // â”€â”€ Phase 2.8.2: Trail replay state â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const [isReplayActive, setIsReplayActive] = useState(false);
  const [replayPlaying, setReplayPlaying] = useState(false);
  const [replaySpeed, setReplaySpeed] = useState<ReplaySpeed>(1);
  const [replayCurrentSeconds, setReplayCurrentSeconds] = useState(0);
  const [replayAnalytics, setReplayAnalytics] = useState<TrailAnalytics | null>(null);
  const [replayMarkerPos, setReplayMarkerPos] = useState<{ lat: number; lng: number } | null>(null);
  const replayTimerRef = useRef<any>(null);

  // â”€â”€ Phase 2.8.3: Trail history state â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const [trailHistoryRefreshKey, setTrailHistoryRefreshKey] = useState(0);
  const [replayFromHistory, setReplayFromHistory] = useState(false);
  const [replayHistoryTrailSegments, setReplayHistoryTrailSegments] = useState<TrailSegmentData[]>([]);

   // â”€â”€ Modal visibility state â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const pinModalVisible = mapOverlayStartupReady && activeTopPopup === 'pinEditor';
  const trailModalVisible = mapOverlayStartupReady && activeTopPopup === 'trail';
  const stitchModalVisible = mapOverlayStartupReady && activeTopPopup === 'stitch';
  const pinDrawerVisible = mapOverlayStartupReady && activeTopPopup === 'pinDrawer';
  const offlineCacheModalVisible = mapOverlayStartupReady && activeTopPopup === 'offlineCache';
  const storageDashboardVisible = mapOverlayStartupReady && activeTopPopup === 'storageDashboard';
  const intelOpen = mapOverlayStartupReady && activeTopPopup === 'intel';
  const [isOnline, setIsOnline] = useState(() => navigateConnectivity.status === 'online');
  const prevOnlineRef = useRef(isOnline);
  const prevConnectivityStatusRef = useRef<ConnectivityDetailedState['status']>(
    navigateConnectivity.status,
  );

  const closeNavigateDetailSurfaces = useCallback(() => {
    setTiltAlertDetailVisible(false);
    setTiltAlertDetailEvent(null);
    setTiltAlertDetailCluster(null);
    setWeatherAlertDetailVisible(false);
    setRouteWeatherDetailVisible(false);
    setTrailExportVisible(false);
    setExportModalVisible(false);
    setSnapshotModalVisible(false);
  }, []);

  const openTopPopup = useCallback((popup: Exclude<NavigateTopPopup, null>) => {
    closeNavigateDetailSurfaces();
    setActiveTopPopup(popup);
  }, [closeNavigateDetailSurfaces]);

  useEffect(() => {
    if (!isFocused) return undefined;

    const syncConnectivitySnapshot = () => {
      const nextSnapshot = connectivity.getDetailedState();
      setNavigateConnectivity((prev) => {
        if (sameConnectivitySnapshot(prev, nextSnapshot)) {
          return prev;
        }
        if (
          prevConnectivityStatusRef.current !== nextSnapshot.status &&
          nextSnapshot.status === 'online'
        ) {
          stabilityLog('Navigation', 'info', 'Connectivity restored â€” live services available');
        } else if (
          prevConnectivityStatusRef.current !== nextSnapshot.status &&
          nextSnapshot.status === 'offline'
        ) {
          stabilityLog('Navigation', 'warn', 'Connectivity lost â€” shifting to field fallback');
        }
        prevConnectivityStatusRef.current = nextSnapshot.status;
        return nextSnapshot;
      });
      setIsOnline((prev) => {
        const nextIsOnline = nextSnapshot.status === 'online';
        return prev === nextIsOnline ? prev : nextIsOnline;
      });
      prevOnlineRef.current = nextSnapshot.status === 'online';
    };

    const refreshConnectivity = () => {
      void connectivity.checkNow().finally(syncConnectivitySnapshot);
    };

    syncConnectivitySnapshot();
    const unsubscribe = connectivity.onStatusChange(() => {
      syncConnectivitySnapshot();
    });
    refreshConnectivity();
    const interval = setInterval(refreshConnectivity, 15000);
    return () => {
      clearInterval(interval);
      unsubscribe();
    };
  }, [isFocused]);

  useFocusEffect(
    useCallback(() => {
      const nextSnapshot = connectivity.getDetailedState();
      setNavigateConnectivity((prev) =>
        sameConnectivitySnapshot(prev, nextSnapshot) ? prev : nextSnapshot,
      );
      setIsOnline((prev) => {
        const nextIsOnline = nextSnapshot.status === 'online';
        return prev === nextIsOnline ? prev : nextIsOnline;
      });
      prevOnlineRef.current = nextSnapshot.status === 'online';
      prevConnectivityStatusRef.current = nextSnapshot.status;
    }, []),
  );

  useEffect(() => {
    const unsubscribe = tileCacheStore.subscribe(() => {
      if (!mountedRef.current) return;
      const nextSnapshot = {
        regions: tileCacheStore.getRegions(),
        stats: tileCacheStore.getStats(),
      };
      setNavigateTileCacheSnapshot((prev) =>
        sameTileCacheSnapshot(prev, nextSnapshot) ? prev : nextSnapshot,
      );
    });
    return unsubscribe;
  }, []);

  const toggleTopPopup = useCallback((popup: Exclude<NavigateTopPopup, null>) => {
    closeNavigateDetailSurfaces();
    setActiveTopPopup((prev) => (prev === popup ? null : popup));
  }, [closeNavigateDetailSurfaces]);

  const closeTopPopup = useCallback((popup?: Exclude<NavigateTopPopup, null>) => {
    if (!popup) {
      closeNavigateDetailSurfaces();
      setActiveTopPopup(null);
      return;
    }
    setActiveTopPopup((prev) => {
      return prev === popup ? null : prev;
    });
  }, [closeNavigateDetailSurfaces]);

  // â”€â”€ Route Analysis Intelligence state â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const [routeIntelligence, setRouteIntelligence] = useState<RouteIntelligence | null>(
    () => routeAnalysisEngine.getCurrent()
  );

  // â”€â”€ Resource Forecast Intelligence state (Phase 2) â”€â”€â”€â”€â”€â”€â”€â”€
  const [resourceForecast, setResourceForecast] = useState<ResourceForecast | null>(
    () => resourceForecastEngine.getCurrent()
  );

  // â”€â”€ Terrain Analysis Intelligence state (Phase 3) â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const [terrainIntelligence, setTerrainIntelligence] = useState<TerrainIntelligence | null>(
    () => terrainAnalysisEngine.getCurrent()
  );

  // â”€â”€ Expedition Forecast Intelligence state (Phase 4) â”€â”€â”€â”€â”€â”€
  const [expeditionForecast, setExpeditionForecast] = useState<ExpeditionForecast | null>(
    () => expeditionForecastEngine.getCurrent()
  );

  // â”€â”€ Campsite Candidate Detection state (Predictive Campsite Phase 1) â”€â”€
  const [campsiteCandidates, setCampsiteCandidates] = useState<CampsiteCandidateResult | null>(
    () => campsiteCandidateEngine.getCurrent()
  );
  const [remotenessIndex, setRemotenessIndex] = useState<RemotenessIndexOutput | null>(
    () => remotenessStore.getIndex()
  );
  const [campIntelVisible, setCampIntelVisible] = useState(true);
  const [selectedCampIntelId, setSelectedCampIntelId] = useState<string | null>(null);
  const applyRouteIntelligence = useCallback((next: RouteIntelligence | null) => {
    setRouteIntelligence((prev) => (sameRouteIntelligence(prev, next) ? prev : next));
  }, []);
  const applyResourceForecast = useCallback((next: ResourceForecast | null) => {
    setResourceForecast((prev) => (sameResourceForecast(prev, next) ? prev : next));
  }, []);
  const applyTerrainIntelligence = useCallback((next: TerrainIntelligence | null) => {
    setTerrainIntelligence((prev) => (sameTerrainIntelligence(prev, next) ? prev : next));
  }, []);
  const applyExpeditionForecast = useCallback((next: ExpeditionForecast | null) => {
    setExpeditionForecast((prev) => (sameExpeditionForecast(prev, next) ? prev : next));
  }, []);
  const applyCampsiteCandidates = useCallback((next: CampsiteCandidateResult | null) => {
    setCampsiteCandidates((prev) => (sameCampsiteCandidates(prev, next) ? prev : next));
  }, []);
  const applyRemotenessIndex = useCallback((next: RemotenessIndexOutput | null) => {
    setRemotenessIndex((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
  }, []);
  const lastResourceForecastInputKeyRef = useRef<string | null>(null);

  // â”€â”€ ECS Mission Brief + Autonomous Assist â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const [missionBrief, setMissionBrief] = useState<MissionBrief | null>(null);
  const [aiAssistBanner, setAiAssistBanner] = useState<{
    title: string;
    message: string;
    surface: AssistSurface;
    rule: AutonomousAssistRule | null;
  } | null>(null);
  const assistCooldownRef = useRef<{ eventKey: string | null; firedAt: number }>({
    eventKey: null,
    firedAt: 0,
  });

  const activeVehicleProfileSignature = `${activeVehicleId ?? 'none'}:${activeVehicleRevision}`;
  const activeRunBuildSnapshotKey = useMemo(() => {
    const buildSnapshot = activeRun?.build_snapshot;
    return buildSnapshot ? JSON.stringify(buildSnapshot) : 'none';
  }, [activeRun?.build_snapshot]);
  const activeRunBuildSnapshotRef = useRef<BuildSnapshot | null>(activeRun?.build_snapshot ?? null);

  useEffect(() => {
    activeRunBuildSnapshotRef.current = activeRun?.build_snapshot ?? null;
  }, [activeRun?.build_snapshot]);

  useEffect(() => {
    const syncActiveVehicle = () => {
      setActiveVehicleId(vehicleSetupStore.getActiveVehicleId());
      setActiveVehicleRevision(rev => rev + 1);
    };
    const bumpActiveVehicle = () => {
      if (vehicleSetupStore.getActiveVehicleId()) {
        setActiveVehicleRevision(rev => rev + 1);
      }
    };

    const offVehicleSetup = vehicleSetupStore.subscribe(syncActiveVehicle);
    const offVehicleStore = vehicleStore.subscribe((event) => {
      const currentVehicleId = vehicleSetupStore.getActiveVehicleId();
      if (!currentVehicleId) return;
      if (!event.vehicleId || event.vehicleId === currentVehicleId) {
        setActiveVehicleId(currentVehicleId);
        setActiveVehicleRevision(rev => rev + 1);
      }
    });
    const offVehicleSpec = vehicleSpecStore.subscribe(bumpActiveVehicle);
    const offConsumables = consumablesStore.subscribe(bumpActiveVehicle);
    const offTiresLift = tiresLiftStore.subscribe((vehicleId) => {
      if (vehicleId === vehicleSetupStore.getActiveVehicleId()) {
        setActiveVehicleRevision(rev => rev + 1);
      }
    });
    const offLoadouts = loadoutStore.subscribe((_loadoutId, vehicleId) => {
      const currentVehicleId = vehicleSetupStore.getActiveVehicleId();
      if (!currentVehicleId) return;
      if (!vehicleId || vehicleId === currentVehicleId) {
        setActiveVehicleRevision(rev => rev + 1);
      }
    });
    const offLoadoutItems = loadoutItemStore.subscribe(() => {
      if (vehicleSetupStore.getActiveVehicleId()) {
        setActiveVehicleRevision(rev => rev + 1);
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


  // â”€â”€ Performance: Ref-based dedup to prevent redundant engine computations â”€â”€
  // Tracks the last computed ID for each engine to avoid duplicate work
  // from both useEffect triggers and subscriber notifications firing together.
  const lastRouteIntelIdRef = useRef<string | null>(routeIntelligence?.id ?? null);
  const lastTerrainIntelIdRef = useRef<string | null>(terrainIntelligence?.id ?? null);
  const lastResourceForecastIdRef = useRef<string | null>(resourceForecast?.routeIntelligenceId ?? null);
  const lastExpeditionForecastInputRef = useRef<string>('');
  const lastCampsiteInputRef = useRef<string>('');





  // â”€â”€ Tilt Alert Zones state â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Persisted toggle: show/hide tilt alert markers on map
  const [showTiltAlertZones, setShowTiltAlertZones] = useState<boolean>(() => {
    try {
      if (typeof localStorage !== 'undefined') {
        const stored = localStorage.getItem(TILT_ZONES_VISIBLE_KEY);
        return stored === 'true';
      }
    } catch {}
    return false;
  });

  // Detail modal state for tapped tilt alert markers
  const [tiltAlertDetailVisible, setTiltAlertDetailVisible] = useState(false);
  const [tiltAlertDetailEvent, setTiltAlertDetailEvent] = useState<TiltAlertEvent | null>(null);
  const [tiltAlertDetailCluster, setTiltAlertDetailCluster] = useState<any>(null);

  // Hook: loads tilt alert markers from history when layer is visible
  const {
    markers: tiltAlertMarkers,
    clusters: tiltAlertClusters,
    totalCount: tiltAlertTotalCount,
    gpsCount: tiltAlertGpsCount,
    reload: reloadTiltAlertMarkers,
  } = useTiltAlertMarkers(showTiltAlertZones);

  // Toggle handler with localStorage persistence
  const handleToggleTiltAlertZones = useCallback(() => {
    hapticMicro();
    setShowTiltAlertZones(prev => {
      const next = !prev;
      try {
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem(TILT_ZONES_VISIBLE_KEY, String(next));
        }
      } catch {}
      return next;
    });
  }, []);

  const closeTiltAlertDetail = useCallback(() => {
    setTiltAlertDetailVisible(false);
    setTiltAlertDetailEvent(null);
    setTiltAlertDetailCluster(null);
  }, []);

  // Tap handler: find the event by marker ID and show detail modal
  const handleTiltAlertTap = useCallback((markerId: string) => {
    hapticMicro();
    // Try to find the event in the full alert history
    const history = loadAlertHistory();
    const event = history.find(e => e.id === markerId) || null;

    // Also check if this marker is part of a cluster
    const cluster = tiltAlertClusters.find(c =>
      c.events.some(e => e.id === markerId)
    ) || null;

    closeTopPopup();
    setTiltAlertDetailEvent(event);
    setTiltAlertDetailCluster(cluster && cluster.events.length > 1 ? cluster : null);
    setTiltAlertDetailVisible(true);
  }, [closeTopPopup, tiltAlertClusters]);


  // â”€â”€ Weather Alert Layer â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const [weatherAlertDetailVisible, setWeatherAlertDetailVisible] = useState(false);

  const roadNavigationCurrentLocation = useMemo(
    () =>
      userLocation
        ? {
            lat: userLocation.lat,
            lng: userLocation.lng,
            accuracyM: roadNavLocationMeta.accuracyM,
            speedMph: roadNavLocationMeta.speedMph,
          }
        : null,
    [roadNavLocationMeta.accuracyM, roadNavLocationMeta.speedMph, userLocation],
  );
  const liveNavigateServicesEnabled =
    !!mapToken &&
    (!navigateConnectivity.initialized ||
      (navigateConnectivity.status === 'online' && navigateConnectivity.isInternetReachable));

  const roadNavigation = useRoadNavigation({
    accessToken: mapToken || null,
    currentLocation: roadNavigationCurrentLocation,
    enabled: true,
    liveServicesEnabled: liveNavigateServicesEnabled,
  });
  const [exploreNavigationPayload, setExploreNavigationPayload] =
    useState<NavigationHandoffPayload | null>(null);
  const appliedNavigationPayloadRef = useRef<string | null>(null);
  const lastPersistedNavigationPayloadRef = useRef<string | null>(null);
  const pendingAutoStartRouteIdRef = useRef<string | null>(null);
  const currentExploreNavigationPayloadSignature = useMemo(
    () => buildNavigationPayloadSignature(exploreNavigationPayload),
    [exploreNavigationPayload],
  );
  const setExploreNavigationPayloadIfChanged = useCallback(
    (nextPayload: NavigationHandoffPayload | null) => {
      setExploreNavigationPayload((prev) => (sameNavigationPayload(prev, nextPayload) ? prev : nextPayload));
    },
    [],
  );

  const clearExploreNavigationPayload = useCallback(async () => {
    appliedNavigationPayloadRef.current = null;
    lastPersistedNavigationPayloadRef.current = null;
    setExploreNavigationPayloadIfChanged(null);
    await clearNavigationHandoffPayload();
  }, [setExploreNavigationPayloadIfChanged]);

  const fitMapToCoordinatePreview = useCallback(
    (
      coordinate: { lat: number; lng: number } | null,
      padding = 64,
      reason = 'navigation_preview_marker',
    ) => {
      if (!coordinate) return;
      const latPad = 0.035;
      const lngPad = 0.045;
      queueMapCameraCommand({
        mode: 'route_overview',
        fitBounds: {
          north: coordinate.lat + latPad,
          south: coordinate.lat - latPad,
          east: coordinate.lng + lngPad,
          west: coordinate.lng - lngPad,
          padding,
          maxZoom: 15,
        },
        durationMs: 650,
        animate: true,
        reason,
      });
      setFollowUser(false);
    },
    [queueMapCameraCommand],
  );

  const applyExploreNavigationPayload = useCallback(
    async (payload: NavigationHandoffPayload) => {
      const tripMode = classifyNavigationHandoff(payload);
      const stampedPayload: NavigationHandoffPayload = {
        ...payload,
        tripMode,
      };
      const payloadKey = `${stampedPayload.id}:${stampedPayload.createdAt}`;
      appliedNavigationPayloadRef.current = payloadKey;
      setExploreNavigationPayloadIfChanged(stampedPayload);
      if (lastPersistedNavigationPayloadRef.current !== payloadKey) {
        lastPersistedNavigationPayloadRef.current = payloadKey;
        await saveNavigationHandoffPayload(stampedPayload);
      }

      const roadDestination = toRoadDestinationFromHandoff(stampedPayload);
      if (!roadDestination || tripMode === 'trail') {
        await roadNavigation.clearDestination();
        const fallbackCoordinate =
          stampedPayload.coordinate ??
          stampedPayload.trailheadCoordinate ??
          (stampedPayload.trailGeometry.length > 0
            ? stampedPayload.trailGeometry[stampedPayload.trailGeometry.length - 1]
            : null);
        fitMapToCoordinatePreview(fallbackCoordinate, 84, 'trail_preview');
        return;
      }

      await roadNavigation.previewDestination(roadDestination, 'explore_handoff');
    },
    [fitMapToCoordinatePreview, roadNavigation, setExploreNavigationPayloadIfChanged],
  );

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;

      void (async () => {
        const flow = await consumeNavigationFlow('navigate');
        if (cancelled || !flow) return;

        if (
          flow.intent === 'route_preview' &&
          flow.context &&
          flow.context.autoStartNavigation === true
        ) {
          pendingAutoStartRouteIdRef.current =
            typeof flow.context.routeId === 'string' ? flow.context.routeId : 'pending';
        }

        closeTopPopup();
        if (flow.message) {
          showToast(flow.message);
        }
      })();

      return () => {
        cancelled = true;
      };
    }, [closeTopPopup, showToast]),
  );

  useEffect(() => {
    const pendingRouteId = pendingAutoStartRouteIdRef.current;
    if (!pendingRouteId) return;
    if (roadNavigation.session.status !== 'route_preview') return;
    if (!roadNavigation.session.route || !roadNavigation.session.destination) return;
    if (
      pendingRouteId !== 'pending' &&
      exploreNavigationPayload?.id &&
      exploreNavigationPayload.id !== pendingRouteId
    ) {
      return;
    }

    pendingAutoStartRouteIdRef.current = null;
    roadNavigation.startNavigation();
    showToast('Emergency route active');
  }, [
    exploreNavigationPayload?.id,
    roadNavigation,
    roadNavigation.session.destination,
    roadNavigation.session.route,
    roadNavigation.session.status,
    showToast,
  ]);

  const weatherAlerts = useWeatherAlerts(userLocation, showToast);

  // â”€â”€ Route Corridor Weather â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const [routeWeatherDetailVisible, setRouteWeatherDetailVisible] = useState(false);
  const openWeatherAlertDetail = useCallback(() => {
    closeTopPopup();
    setWeatherAlertDetailVisible(true);
  }, [closeTopPopup]);
  const closeWeatherAlertDetail = useCallback(() => {
    setWeatherAlertDetailVisible(false);
  }, []);
  const openRouteWeatherDetail = useCallback(() => {
    closeTopPopup();
    setRouteWeatherDetailVisible(true);
  }, [closeTopPopup]);
  const closeRouteWeatherDetail = useCallback(() => {
    setRouteWeatherDetailVisible(false);
  }, []);

  const routeCorridorWeather = useRouteCorridorWeather(activeRun, userLocation, showToast);
  const campIntelWeatherSnapshot = useMemo<CampIntelRouteWeatherSnapshot | null>(() => {
    const activePoint = routeCorridorWeather.summary.activePoint;
    const current = activePoint?.weather?.current;
    const precipChance = activePoint?.weather?.forecast?.[0]?.pop;
    const precipType =
      (current?.snow_1h ?? current?.snow_3h ?? 0) > 0 ? 'Snow' : 'Rain';

    return {
      headline: routeCorridorWeather.summary.headline,
      detail: routeCorridorWeather.summary.detail,
      lowTempF:
        current?.temp != null && Number.isFinite(Number(current.temp))
          ? Number(current.temp)
          : null,
      windMph:
        current?.wind_speed != null && Number.isFinite(Number(current.wind_speed))
          ? Number(current.wind_speed)
          : null,
      precipLabel:
        precipChance != null && Number.isFinite(Number(precipChance))
          ? `${precipType} ${Math.round(Number(precipChance) * 100)}%`
          : null,
      source: routeCorridorWeather.source,
    };
  }, [
    routeCorridorWeather.source,
    routeCorridorWeather.summary.activePoint,
    routeCorridorWeather.summary.detail,
    routeCorridorWeather.summary.headline,
  ]);
  const campIntel = useCampIntel({
    candidates: campsiteCandidates,
    routeIntelligence,
    terrainIntelligence,
    expeditionForecast,
    remotenessIndex,
    routeWeather: campIntelWeatherSnapshot,
    isOnline,
    resourceContextOverrides: {
      powerPercent: (() => {
        try {
          const snapshot = bluPowerAuthority.getSnapshot();
          return snapshot?.hasPowerData && Number.isFinite(Number(snapshot?.batteryPercent))
            ? Number(snapshot?.batteryPercent)
            : null;
        } catch {
          return null;
        }
      })(),
    },
  });
  const campIntelSites = campIntel.visibleSites;
  const selectedCampIntel = campIntel.getSiteById(selectedCampIntelId);
  const campIntelRouteContextSignature = `${routeIntelligence?.id ?? campsiteCandidates?.routeIntelligenceId ?? 'none'}:${campIntel.summary.missionMode ?? 'auto'}`;
  const previousCampIntelRouteContextRef = useRef<string | null>(null);
  const selectedCampIntelComparison = useMemo(
    () => (selectedCampIntel ? campIntel.compareSiteWithNearby(selectedCampIntel.id, 3) : null),
    [campIntel, selectedCampIntel],
  );
  const campIntelMarkers = useCampIntelMarkerLayer(
    campIntelSites,
    selectedCampIntelId,
    mapZoom,
    campIntelVisible,
  );

const weatherSeveritySummary = useMemo(() => {
  const candidates = routeCorridorWeather?.points ?? [];
  const approachingHazard = routeCorridorWeather?.approachingHazard;

  let highest = 0;

  for (const point of candidates) {
    const alerts = point.weather?.alerts ?? [];
    for (const alert of alerts) {
      if (alert?.severity === 'extreme') highest = Math.max(highest, 3);
      else if (alert?.severity === 'warning') highest = Math.max(highest, 2);
      else if (alert?.severity === 'advisory') highest = Math.max(highest, 1);
    }

    const current = point.weather?.current;
    if (current) {
      const wind = safeNumber(current?.wind_speed, 0);
      const visibility = safeNumber(current?.visibility, 10000);
      const weatherMain = safeString(current?.weather_main, '').toLowerCase();

      if (wind >= 40) highest = Math.max(highest, 3);
      else if (wind >= 25) highest = Math.max(highest, 2);
      else if (wind >= 15) highest = Math.max(highest, 1);

      if (visibility > 0 && visibility <= 500) highest = Math.max(highest, 3);
      else if (visibility > 0 && visibility <= 1600) highest = Math.max(highest, 2);
      else if (visibility > 0 && visibility <= 5000) highest = Math.max(highest, 1);

      if (weatherMain.includes('snow') || weatherMain.includes('thunderstorm')) {
        highest = Math.max(highest, 2);
      } else if (
        weatherMain.includes('rain') ||
        weatherMain.includes('drizzle') ||
        weatherMain.includes('fog') ||
        weatherMain.includes('mist') ||
        weatherMain.includes('haze')
      ) {
        highest = Math.max(highest, 1);
      }
    }
  }

  if (highest === 3) {
    const suffix = approachingHazard?.active && approachingHazard.distanceAheadMi != null
      ? ` â€¢ ${approachingHazard.distanceAheadMi.toFixed(1)} MI`
      : '';
    return { level: 'extreme', label: `WX EXTREME${suffix}`, color: '#EF5350', score: 3 };
  }
  if (highest === 2) {
    const suffix = approachingHazard?.active && approachingHazard.distanceAheadMi != null
      ? ` â€¢ ${approachingHazard.distanceAheadMi.toFixed(1)} MI`
      : '';
    return { level: 'warning', label: `WX WARNING${suffix}`, color: '#FF7043', score: 2 };
  }
  if (highest === 1) {
    const activeLabel = routeCorridorWeather?.summary?.activePoint?.label;
    const suffix = activeLabel ? ` â€¢ ${activeLabel}` : '';
    return { level: 'advisory', label: `WX ADVISORY${suffix}`, color: '#FFB300', score: 1 };
  }
  return null;
}, [routeCorridorWeather]);

  const navigateVehicleContext = useMemo(
    () => {
      const snapshotVehicleId = activeRun?.build_snapshot?.vehicle_id;
      if (snapshotVehicleId) {
        return getVehicleContext(snapshotVehicleId);
      }

      // Keep manual/local vehicle context fresh when Fleet/setup changes the active profile.
      void activeVehicleRevision;
      return getActiveVehicleContext();
    },
    [activeRun?.build_snapshot?.vehicle_id, activeVehicleRevision],
  );

  const aiTelemetry = useMemo(() => ({
    ...(activeRun as any ?? {}),
    batteryPercent:
      powerTelemetrySnapshot?.batterySocPercent ??
      (Number.isFinite(Number(bluPowerSnapshot?.batteryPercent))
        ? Number(bluPowerSnapshot?.batteryPercent)
        : null),
    gpsStatus: gps.gpsStatus,
    gpsFixQuality: gps.fixQuality,
    gpsHasFix: gps.hasFix,
    gpsPermissionDenied: gps.permissionDenied,
    latitude: userLocation?.lat ?? gps.position?.latitude ?? null,
    longitude: userLocation?.lng ?? gps.position?.longitude ?? null,
    state:
      typeof bluPowerSnapshot?.freshness === 'string'
        ? bluPowerSnapshot.freshness
        : gps.hasFix
          ? 'live'
          : 'degraded',
  }), [
    activeRun,
    bluPowerSnapshot?.batteryPercent,
    bluPowerSnapshot?.freshness,
    gps.fixQuality,
    gps.gpsStatus,
    gps.hasFix,
    gps.permissionDenied,
    gps.position?.latitude,
    gps.position?.longitude,
    powerTelemetrySnapshot?.batterySocPercent,
    userLocation?.lat,
    userLocation?.lng,
  ]);

  const aiResources = useMemo(() => {
    const waterCapacity = safeNumber(navigateVehicleContext.resourceProfile.waterCapacityGal, NaN);
    const currentWater = safeNumber(navigateVehicleContext.consumables?.water_gal_current, NaN);
    const waterPercent =
      Number.isFinite(waterCapacity) &&
      waterCapacity > 0 &&
      Number.isFinite(currentWater)
        ? Math.max(0, Math.min(100, Math.round((currentWater / waterCapacity) * 100)))
        : null;

    return {
      ...(navigateVehicleContext.vehicle as any ?? {}),
      fuelPercent: safeNumber(navigateVehicleContext.consumables?.fuel_percent_current, NaN),
      waterPercent,
      powerPercent:
        powerTelemetrySnapshot?.batterySocPercent ??
        (Number.isFinite(Number(bluPowerSnapshot?.batteryPercent))
          ? Number(bluPowerSnapshot?.batteryPercent)
          : null),
      fuelRangeMiles: safeNumber(resourceForecast?.fuel?.estimatedRangeMiles, NaN),
      fuelTankCapacityGal: navigateVehicleContext.resourceProfile.fuelTankCapacityGal,
      waterCapacityGal: navigateVehicleContext.resourceProfile.waterCapacityGal,
      batteryCapacityWh: navigateVehicleContext.resourceProfile.batteryUsableWh,
      tireSizeInches: navigateVehicleContext.tiresLift?.tireSizeInches ?? null,
      suspensionLiftInches: navigateVehicleContext.tiresLift?.suspensionLiftInches ?? null,
      accessoryInstalledCount: navigateVehicleContext.accessoryInstalledCount,
      loadoutItemCount: navigateVehicleContext.loadoutItemCount,
      loadoutWeightLbs: navigateVehicleContext.loadoutTotalWeightLbs,
      connectivityLevel: navigateConnectivity.level,
      forecastLevel: resourceForecast?.sufficiencyLevel ?? null,
    };
  }, [
    bluPowerSnapshot?.batteryPercent,
    navigateConnectivity.level,
    navigateVehicleContext.accessoryInstalledCount,
    navigateVehicleContext.consumables,
    navigateVehicleContext.loadoutItemCount,
    navigateVehicleContext.loadoutTotalWeightLbs,
    navigateVehicleContext.resourceProfile.batteryUsableWh,
    navigateVehicleContext.resourceProfile.fuelTankCapacityGal,
    navigateVehicleContext.resourceProfile.waterCapacityGal,
    navigateVehicleContext.tiresLift?.suspensionLiftInches,
    navigateVehicleContext.tiresLift?.tireSizeInches,
    navigateVehicleContext.vehicle,
    powerTelemetrySnapshot?.batterySocPercent,
    resourceForecast?.fuel?.estimatedRangeMiles,
    resourceForecast?.sufficiencyLevel,
  ]);

  const aiWeatherCorridor = useMemo(() => {
    const activePoint = routeCorridorWeather.summary.activePoint;
    const current = activePoint?.weather?.current;
    const lastFetchAt = routeCorridorWeather.lastFetchAt;
    const ageMs =
      typeof lastFetchAt === 'string'
        ? Math.max(0, Date.now() - new Date(lastFetchAt).getTime())
        : null;
    const staleness =
      ageMs == null
        ? 'unknown'
        : ageMs > 1000 * 60 * 90
          ? 'stale'
          : ageMs > 1000 * 60 * 30
            ? 'aging'
            : 'fresh';
    const visibilityMiles =
      current?.visibility != null
        ? Number((Number(current.visibility) / 1609.34).toFixed(1))
        : null;

    return {
      weatherSeverity: weatherSeveritySummary?.score ?? 0,
      source: routeCorridorWeather.source,
      staleness,
      ageLabel: ageMs == null ? null : `${Math.round(ageMs / 60000)} min old`,
      summaryLabel:
        routeCorridorWeather.summary.headline ??
        routeCorridorWeather.summary.detail ??
        weatherSeveritySummary?.label ??
        null,
      label: weatherSeveritySummary?.label ?? null,
      windMph: current?.wind_speed ?? null,
      visibilityMiles,
      precipitationIntensity:
        activePoint?.weather?.forecast?.[0]?.pop ??
        current?.rain_1h ??
        current?.rain_3h ??
        null,
      temperatureF: current?.temp ?? null,
      alertsCount:
        safeArray(routeCorridorWeather.allAlerts).length ||
        safeNumber(routeCorridorWeather.hazardousCount, 0) +
          safeNumber(routeCorridorWeather.cautionCount, 0),
    };
  }, [
    routeCorridorWeather.allAlerts,
    routeCorridorWeather.cautionCount,
    routeCorridorWeather.hazardousCount,
    routeCorridorWeather.lastFetchAt,
    routeCorridorWeather.source,
    routeCorridorWeather.summary.activePoint,
    routeCorridorWeather.summary.detail,
    routeCorridorWeather.summary.headline,
    weatherSeveritySummary?.label,
    weatherSeveritySummary?.score,
  ]);

  const aiRemoteness = useMemo(() => ({
    score: remotenessIndex?.score ?? null,
    tier: remotenessIndex?.level ?? null,
    reason: remotenessIndex?.reason ?? null,
    connectivityState: remotenessIndex?.connectivity?.signal ?? null,
    cacheReady: hasCachedMapCoverage,
  }), [
    hasCachedMapCoverage,
    remotenessIndex?.connectivity?.signal,
    remotenessIndex?.level,
    remotenessIndex?.reason,
    remotenessIndex?.score,
  ]);

  const { aiState, navigateView, liveStatus } = useECSAIHook({
    activeRun,
    vehicleConfig: navigateVehicleContext.vehicle,
    telemetry: aiTelemetry,
    weatherCorridor: aiWeatherCorridor,
    routeIntelligence,
    remoteness: aiRemoteness,
    resources: aiResources,
    powerAuthority: bluPowerSnapshot,
    enabled: true,
    options: {
      enableWhenIdle: true,
      emitBriefWhenNoSignals: true,
    },
  });

  const surfacedMissionBrief = (aiState?.brief as MissionBrief | null) ?? missionBrief;
  const visibleMissionBrief = useMemo(
    () => sanitizeVisibleLanguage(surfacedMissionBrief),
    [surfacedMissionBrief],
  );

  

  // â”€â”€ Auto-cleanup state â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const [cleanupReport, setCleanupReport] = useState<CleanupReport | null>(null);



  // Run startup cleanup and intelligent auto-cleanup once on mount
  useEffect(() => {
    if (cleanupRanRef.current) return;
    cleanupRanRef.current = true;

    (async () => {
      try {
        // Legacy startup cleanup
        const { report, cleanupResult } = await runStartupCleanup();
        if (!mountedRef.current) return;
        setCleanupReport(report);

        if (cleanupResult && cleanupResult.regionsDeleted > 0) {
          showToast(`AUTO-CLEANUP: ${cleanupResult.message}`);
        }

        // Intelligent LRU-based auto-cleanup check
        const smartResult = await runAutoCleanupCheck();
        if (!mountedRef.current) return;
        if (smartResult && smartResult.performed) {
          showToast(`SMART CLEANUP: ${smartResult.message}`);
          // Re-analyze after smart cleanup
          try {
            const newReport = analyzeCache();
            setCleanupReport(newReport);
          } catch {}
        }
      } catch (e) {
        console.warn('[Navigate] Startup cleanup failed:', e);
      }
    })();
  }, [showToast]);


  const handleCleanupComplete = useCallback((result: CleanupResult) => {
    // Re-analyze after cleanup to update the banner
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { analyzeCache } = require('../../lib/tileAutoCleanup');
      const newReport = analyzeCache();
      setCleanupReport(newReport);
    } catch {}
  }, []);



  // â”€â”€ Phase 2.8: Expedition context â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const activeExpedition = useMemo(() => missionExpeditionStore.getActive(), []);
  const activeExpeditionId = activeExpedition?.id || null;
  const activeExpeditionName = activeExpedition?.name || null;

  // â”€â”€ Shared BLU Power Authority state â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const [bluPowerSnapshot, setBluPowerSnapshot] = useState(() =>
    bluPowerAuthority.getSnapshot()
  );

  useEffect(() => {
    const sync = () => {
      if (!mountedRef.current) return;
      setBluPowerSnapshot(bluPowerAuthority.getSnapshot());
    };

    sync();
    const unsubscribe = bluPowerAuthority.subscribe(sync);
    return unsubscribe;
  }, []);

  const powerTelemetrySnapshot = useMemo<TelemetrySnapshot | null>(() => {
    if (!bluPowerSnapshot?.hasPowerData) return null;

    const batterySocPercent = safeNumber(bluPowerSnapshot.batteryPercent, NaN);
    const batteryCapacityWh = safeNumber(bluPowerSnapshot.capacityWh, NaN);
    const avgDrawWatts = safeNumber(bluPowerSnapshot.outputWatts, NaN);
    const estimatedRuntimeMinutes = safeNumber(bluPowerSnapshot.estimatedRuntimeMinutes, NaN);

    return {
      batterySocPercent: Number.isFinite(batterySocPercent) ? batterySocPercent : null,
      batteryCapacityWh: Number.isFinite(batteryCapacityWh) ? batteryCapacityWh : null,
      avgDrawWatts: Number.isFinite(avgDrawWatts) ? avgDrawWatts : null,
      estimatedRuntimeHours:
        Number.isFinite(estimatedRuntimeMinutes) ? estimatedRuntimeMinutes / 60 : null,
    };
  }, [
    bluPowerSnapshot?.hasPowerData,
    bluPowerSnapshot?.batteryPercent,
    bluPowerSnapshot?.capacityWh,
    bluPowerSnapshot?.outputWatts,
    bluPowerSnapshot?.estimatedRuntimeMinutes,
  ]);

  const powerTelemetryHash = useMemo(() => ([
    bluPowerSnapshot?.activeProvider ?? 'none',
    bluPowerSnapshot?.deviceLabel ?? 'none',
    bluPowerSnapshot?.freshness ?? 'disconnected',
    bluPowerSnapshot?.batteryPercent ?? 'na',
    bluPowerSnapshot?.inputWatts ?? 'na',
    bluPowerSnapshot?.outputWatts ?? 'na',
    bluPowerSnapshot?.solarInputWatts ?? 'na',
    bluPowerSnapshot?.estimatedRuntimeMinutes ?? 'na',
    bluPowerSnapshot?.lastUpdatedAt ?? 'na',
  ].join('|')), [
    bluPowerSnapshot?.activeProvider,
    bluPowerSnapshot?.deviceLabel,
    bluPowerSnapshot?.freshness,
    bluPowerSnapshot?.batteryPercent,
    bluPowerSnapshot?.inputWatts,
    bluPowerSnapshot?.outputWatts,
    bluPowerSnapshot?.solarInputWatts,
    bluPowerSnapshot?.estimatedRuntimeMinutes,
    bluPowerSnapshot?.lastUpdatedAt,
  ]);

  // â”€â”€ Phase 2.8: Export modal â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const [exportModalVisible, setExportModalVisible] = useState(false);
  const [exportPins, setExportPins] = useState<ECSPin[]>([]);

  // Build snapshot form state
  const [pendingGpxContent, setPendingGpxContent] = useState<string | null>(null);
  const [pendingGpxName, setPendingGpxName] = useState('');
  const [bsVehicleName, setBsVehicleName] = useState('');
  const [bsRange, setBsRange] = useState('');
  const [bsTotalWeight, setBsTotalWeight] = useState('');
  const [bsRoofWeight, setBsRoofWeight] = useState('');
  const [bsHitchWeight, setBsHitchWeight] = useState('');
  const [bsRoofLimit, setBsRoofLimit] = useState('');
  const [bsHitchLimit, setBsHitchLimit] = useState('');

  // â”€â”€ Fetch Mapbox token with auto-retry (up to 3 attempts, exponential backoff) â”€â”€
// The token is pre-configured by the developer via env vars, app.json extra,
// SecureStore, or Supabase edge function. No manual user entry is needed.
useEffect(() => {
  let cancelled = false;
  const MAX_RETRIES = 3;

  tokenResolvedRef.current = false;

  const finishTokenLoad = (token: string) => {
    if (cancelled || !mountedRef.current) return;

    tokenResolvedRef.current = true;

    if (tokenGuardTimeoutRef.current) {
      clearTimeout(tokenGuardTimeoutRef.current);
      tokenGuardTimeoutRef.current = null;
    }

    if (tokenRetryTimerRef.current) {
      clearTimeout(tokenRetryTimerRef.current);
      tokenRetryTimerRef.current = null;
    }

    setMapToken(token);
    setMapLoading(false);
  };

  const attemptFetch = async (attempt: number) => {
    if (cancelled || !mountedRef.current || tokenResolvedRef.current) return;

    
    try {
      if (attempt > 0) clearTokenCache(); // Clear cache on retries to force re-resolution

      const token = await getMapboxToken();

      if (cancelled || !mountedRef.current || tokenResolvedRef.current) return;

      if (token && token.length > 0) {
        
        finishTokenLoad(token);
      } else if (attempt < MAX_RETRIES) {
        const delay = Math.min(2000 * Math.pow(2, attempt), 10000);
        
        tokenRetryTimerRef.current = setTimeout(() => attemptFetch(attempt + 1), delay);
      } else {
        console.warn('[Navigate] All token fetch attempts exhausted');
        finishTokenLoad('');
      }
    } catch {
      if (cancelled || !mountedRef.current || tokenResolvedRef.current) return;

      if (attempt < MAX_RETRIES) {
        const delay = Math.min(2000 * Math.pow(2, attempt), 10000);
        tokenRetryTimerRef.current = setTimeout(() => attemptFetch(attempt + 1), delay);
      } else {
        finishTokenLoad('');
      }
    }
  };

  // Overall timeout guard: if nothing resolves in 20s, stop loading
  tokenGuardTimeoutRef.current = setTimeout(() => {
    if (cancelled || tokenResolvedRef.current) return;

    console.warn('[Navigate] Token fetch guard timeout (20s)');
    finishTokenLoad('');
  }, 20000);

  attemptFetch(0);

  return () => {
    cancelled = true;

    if (tokenGuardTimeoutRef.current) {
      clearTimeout(tokenGuardTimeoutRef.current);
      tokenGuardTimeoutRef.current = null;
    }

    if (tokenRetryTimerRef.current) {
      clearTimeout(tokenRetryTimerRef.current);
      tokenRetryTimerRef.current = null;
    }
  };
}, []);

  const hasGpsPosition = Boolean(gps.position);
  const refreshGps = gps.refresh;
  const currentGpsHeadingDeg = gps.position?.headingDeg ?? null;
  const [compassPowerSaveActive, setCompassPowerSaveActive] = useState(false);
  const lastCompassMovementAtRef = useRef<number>(Date.now());
  const lastCompassMovementPositionRef = useRef<{ lat: number; lng: number } | null>(null);
  const lastKnownHeadingRef = useRef<number | null>(null);

  // â”€â”€ Vehicle Heading (North-Up map, rotating arrow only) â”€â”€â”€â”€â”€â”€
  // Phase 6: Pass GPS speed for stationary drift prevention + adaptive smoothing
  const vehicleHeadingHook = useVehicleHeading({
    enabled: !compassPowerSaveActive,
    gpsHeadingDeg: gps.position?.headingDeg ?? null,
    initialMode: 'auto',
    speedMph: gps.position?.speedMph ?? null,
  });

  // Sync GPS position â†’ userLocation state + auto-center map on first fix
  // â”€â”€ Phase 15: Connectivity state listener â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Gracefully transitions between online/offline without crashing.
  useEffect(() => {
    if (!gps.position) {
      lastCompassMovementPositionRef.current = null;
      lastCompassMovementAtRef.current = Date.now();
      setCompassPowerSaveActive(false);
      return;
    }

    const now = gps.position.timestamp || Date.now();
    const nextPosition = {
      lat: gps.position.latitude,
      lng: gps.position.longitude,
    };
    const previousPosition = lastCompassMovementPositionRef.current;
    const movedMeters = previousPosition
      ? haversineMeters(
          previousPosition.lat,
          previousPosition.lng,
          nextPosition.lat,
          nextPosition.lng,
        )
      : Infinity;
    const speedMph = safeNumber(gps.position.speedMph, 0);
    const hasMeaningfulMovement =
      !previousPosition ||
      speedMph >= COMPASS_MOVEMENT_SPEED_MPH ||
      movedMeters >= COMPASS_MOVEMENT_DISTANCE_M;

    if (hasMeaningfulMovement) {
      lastCompassMovementAtRef.current = now;
      lastCompassMovementPositionRef.current = nextPosition;
      setCompassPowerSaveActive((prev) => (prev ? false : prev));
      return;
    }

    if (!lastCompassMovementPositionRef.current) {
      lastCompassMovementPositionRef.current = nextPosition;
    }
  }, [gps.position]);

  useEffect(() => {
    if (!hasGpsPosition) return;

    const evaluatePowerSave = () => {
      const idleForMs = Date.now() - lastCompassMovementAtRef.current;
      const shouldSleep = idleForMs >= COMPASS_POWER_SAVE_IDLE_MS;
      setCompassPowerSaveActive((prev) => (prev === shouldSleep ? prev : shouldSleep));
    };

    evaluatePowerSave();
    const timer = setInterval(evaluatePowerSave, 1000);
    return () => clearInterval(timer);
  }, [hasGpsPosition]);

  useEffect(() => {
    if (vehicleHeadingHook.heading != null) {
      lastKnownHeadingRef.current = vehicleHeadingHook.heading;
      return;
    }

    if (currentGpsHeadingDeg != null && currentGpsHeadingDeg >= 0) {
      lastKnownHeadingRef.current = currentGpsHeadingDeg;
    }
  }, [vehicleHeadingHook.heading, currentGpsHeadingDeg]);

  const compassDisplayHeading = useMemo(() => {
    if (vehicleHeadingHook.heading != null) return vehicleHeadingHook.heading;
    if (currentGpsHeadingDeg != null && currentGpsHeadingDeg >= 0) {
      return currentGpsHeadingDeg;
    }
    return lastKnownHeadingRef.current;
  }, [vehicleHeadingHook.heading, currentGpsHeadingDeg]);

  const rawTrailPositionLat = gps.rawGPS.position?.latitude ?? null;
  const rawTrailPositionLng = gps.rawGPS.position?.longitude ?? null;
  const rawTrailAccuracyM = gps.rawGPS.position?.accuracyM ?? null;
  const rawTrailHeadingDeg = gps.rawGPS.position?.headingDeg ?? null;
  const rawTrailSpeedMph = gps.rawGPS.position?.speedMph ?? null;
  const rawTrailTimestamp = gps.rawGPS.position?.timestamp ?? 0;
  const trailGuidanceLocation = useMemo(() => {
    if (rawTrailPositionLat == null || rawTrailPositionLng == null) return null;
    return {
      lat: rawTrailPositionLat,
      lng: rawTrailPositionLng,
      accuracyM: rawTrailAccuracyM,
      headingDeg: rawTrailHeadingDeg,
      speedMph: rawTrailSpeedMph,
      timestamp: rawTrailTimestamp,
    };
  }, [
    rawTrailAccuracyM,
    rawTrailHeadingDeg,
    rawTrailPositionLat,
    rawTrailPositionLng,
    rawTrailSpeedMph,
    rawTrailTimestamp,
  ]);

  const trailNavigation = useTrailNavigation({
    location: trailGuidanceLocation,
    enabled: true,
  });
  const trailSession = trailNavigation.session;
  const trailNavigationUiMode = trailNavigation.uiMode;
  const loadTrailPayload = trailNavigation.loadPayload;
  const startTrailNavigation = trailNavigation.startNavigation;
  const transitionTrailFromRoad = trailNavigation.transitionFromRoad;
  const endTrailNavigation = trailNavigation.endNavigation;
  const appliedTrailPayloadRef = useRef<string | null>(null);
  const hybridTrailTransitionRef = useRef<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      const timer = setTimeout(() => {
        void (async () => {
          const payload = await loadNavigationHandoffPayload();
          if (cancelled || !mountedRef.current) return;

          const hasBlockingNavigationContext =
            !!activeRun ||
            roadNavigation.uiMode !== 'idle' ||
            trailNavigationUiMode !== 'idle' ||
            !!roadNavigation.session.destination ||
            !!trailSession.payload;

          if (!payload) return;

          if (!isRestorableNavigationHandoffPayload(payload)) {
            await clearNavigationHandoffPayload();
            if (cancelled || !mountedRef.current) return;
            lastPersistedNavigationPayloadRef.current = null;
            if (!hasBlockingNavigationContext) {
              appliedNavigationPayloadRef.current = null;
              setExploreNavigationPayloadIfChanged(null);
            }
            return;
          }

          if (hasBlockingNavigationContext) {
            return;
          }

          const payloadKey = `${payload.id}:${payload.createdAt}`;
          if (payloadKey === appliedNavigationPayloadRef.current) {
            setExploreNavigationPayloadIfChanged(payload);
            return;
          }

          await applyExploreNavigationPayload(payload);
        })();
      }, NAVIGATION_HANDOFF_RESTORE_DELAY_MS);

      return () => {
        cancelled = true;
        clearTimeout(timer);
      };
    }, [
      activeRun,
      applyExploreNavigationPayload,
      roadNavigation.session.destination,
      roadNavigation.uiMode,
      setExploreNavigationPayloadIfChanged,
      trailNavigationUiMode,
      trailSession.payload,
    ]),
  );

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const handleOnline = () => {
      if (!prevOnlineRef.current) {
        stabilityLog('Navigation', 'info', 'Connectivity restored â€” online');
      }
      prevOnlineRef.current = true;
      if (mountedRef.current) {
        setIsOnline((prev) => (prev ? prev : true));
      }
    };
    const handleOffline = () => {
      if (prevOnlineRef.current) {
        stabilityLog('Navigation', 'warn', 'Connectivity lost â€” switching to offline mode');
      }
      prevOnlineRef.current = false;
      if (mountedRef.current) {
        setIsOnline((prev) => (prev ? false : prev));
      }
    };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    // Set initial state
    setIsOnline((prev) => {
      const nextIsOnline = navigator.onLine !== false;
      return prev === nextIsOnline ? prev : nextIsOnline;
    });
    prevOnlineRef.current = navigator.onLine !== false;
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // â”€â”€ Phase 15: Rerender guard â€” prevent excessive navigation state updates â”€â”€
  // Tracks the last navigation state hash to skip redundant re-renders
  // during long trips where GPS updates fire continuously.
  const lastNavStateHashRef = useRef('');

  // Sync GPS position â†’ userLocation state + auto-center map on first fix
  // Phase 15: Validate GPS coordinates before accepting
  useEffect(() => {
    const latitude = gps.position?.latitude;
    const longitude = gps.position?.longitude;
    if (latitude != null && longitude != null) {

      // Phase 15: GPS validation guard
      if (!isValidGPS(latitude, longitude)) {
        stabilityLog('Navigation', 'warn', `Invalid GPS coordinates rejected: ${latitude}, ${longitude}`);
        return;
      }

      // Phase 15: Rerender guard â€” skip if position hasn't meaningfully changed
      const navHash = `${latitude.toFixed(5)},${longitude.toFixed(5)}`;
      if (navHash === lastNavStateHashRef.current) return;
      lastNavStateHashRef.current = navHash;

      const loc = { lat: latitude, lng: longitude };
      setUserLocation((prev) =>
        prev && prev.lat === loc.lat && prev.lng === loc.lng ? prev : loc,
      );
      if (!gpsCenteredRef.current) {
        gpsCenteredRef.current = true;
        setFollowUser(true);
        queueCenterZoomTarget({ lat: loc.lat, lng: loc.lng, zoom: 13 });
      }
    }
  }, [gps.position?.latitude, gps.position?.longitude, queueCenterZoomTarget]);

  useEffect(() => {
    const nextAccuracy = gps.rawGPS.position?.accuracyM ?? gps.position?.accuracyM ?? null;
    const nextSpeed = gps.rawGPS.position?.speedMph ?? gps.position?.speedMph ?? null;
    if (nextAccuracy == null && nextSpeed == null) {
      setRoadNavLocationMeta((prev) =>
        prev.accuracyM === null && prev.speedMph === null
          ? prev
          : { accuracyM: null, speedMph: null },
      );
      return;
    }

    setRoadNavLocationMeta((prev) =>
      prev.accuracyM === nextAccuracy && prev.speedMph === nextSpeed
        ? prev
        : { accuracyM: nextAccuracy, speedMph: nextSpeed },
    );
  }, [
    gps.rawGPS.position?.accuracyM,
    gps.rawGPS.position?.speedMph,
    gps.position?.accuracyM,
    gps.position?.speedMph,
  ]);


  // Phase 3: Handle user manual pan â†’ disable auto-follow
  const handleUserDrag = useCallback(() => {
    if (followUser) {
      setFollowUser(false);
    }
  }, [followUser]);

  // Phase 3: Recenter on current GPS location
  const handleRecenter = useCallback(() => {
    hapticMicro();
    if (userLocation) {
      setFollowUser(true);
      queueCenterZoomTarget(
        { lat: userLocation.lat, lng: userLocation.lng, zoom: 13 },
        { force: true },
      );
    }
  }, [userLocation, queueCenterZoomTarget]);

  useEffect(() => {
    if (roadNavigation.session.status !== 'navigation_active') return;
    if (!userLocation) return;

    setFollowUser(true);
    queueCenterZoomTarget({ lat: userLocation.lat, lng: userLocation.lng, zoom: 14 });
  }, [roadNavigation.session.status, userLocation, queueCenterZoomTarget]);

  const handleGpsRetry = useCallback(() => { refreshGps(); }, [refreshGps]);

  // â”€â”€ Road Classification Bridge: Feed Mapbox road data â†’ dashboardModeEngine â”€â”€
  // When the MapRenderer WebView detects the road type under the user's GPS
  // position (via queryRenderedFeatures on the Mapbox Streets v8 'road' layer),
  // it sends a 'roadClassification' message back to React Native.
  // This callback feeds that data into the roadClassificationBridge, which
  // maps Mapbox road classes to ECS RoadClassification types and feeds
  // the dashboardModeEngine for context-aware Highway/Expedition switching.
  const handleRoadClassification = useCallback((data: {
    classification: string;
    source?: string;
  }) => {
    roadClassificationBridge.feed({
      roadClass: data.classification,
      roadName: data.source,
      hasRoad: Boolean(data.classification),
      featureCount: data.classification ? 1 : 0,
      timestamp: Date.now(),
    });
  }, []);

  // â”€â”€ GPS Speed â†’ Dashboard Mode Engine â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Feed the current GPS speed in mph to the dashboardModeEngine
  // whenever the throttled GPS position changes. This provides a
  // direct, low-latency speed signal for the multi-signal evaluation
  // (road type + speed + remoteness) used for context-aware
  // Highway/Expedition mode switching.
  useEffect(() => {
    if (gps.position?.speedMph != null) {
      dashboardModeEngine.feedSpeed(gps.position.speedMph);
    }
  }, [gps.position?.speedMph]);


  const lastRunsSignatureRef = useRef('');
  const lastPinsSignatureRef = useRef('');
  const lastTrailStateSignatureRef = useRef('');

  const loadRuns = useCallback(() => {
    const all = runStore.getAll();
    const active = runStore.getActive();
    const nextRunsSignature = JSON.stringify({
      runs: all.map((run) => ({
        id: run.id,
        updatedAt: run.updated_at ?? null,
        pointCount: safeArray(run.points).length,
      })),
      activeRunId: active?.id ?? null,
      activeRunUpdatedAt: active?.updated_at ?? null,
    });

    if (lastRunsSignatureRef.current === nextRunsSignature) {
      return;
    }
    lastRunsSignatureRef.current = nextRunsSignature;

    setRuns((prev) => (sameRunCollection(prev, all) ? prev : all));
    setActiveRun((prev) => {
      if (!prev || !active) return prev === active ? prev : active;
      return prev.id === active.id && prev.updated_at === active.updated_at ? prev : active;
    });
  }, []);

  const clearActiveRunSelection = useCallback(() => {
    if (!runStore.getActive()) return;
    runStore.deactivateAll();
    loadRuns();
  }, [loadRuns]);

  const loadPins = useCallback(() => {
    const nextPins = pinStore.getAll();
    const nextPinsSignature = JSON.stringify(
      nextPins.map((pin) => ({
        id: pin.id,
        lat: pin.lat,
        lng: pin.lng,
        resolved: pin.resolved,
        type: pin.type,
      })),
    );
    if (lastPinsSignatureRef.current === nextPinsSignature) {
      return;
    }
    lastPinsSignatureRef.current = nextPinsSignature;
    setAllPins((prev) => (samePinCollection(prev, nextPins) ? prev : nextPins));
  }, []);

  // Reload runs, pins, and tilt alert markers when tab gains focus
  useFocusEffect(useCallback(() => {
    loadRuns();
    loadPins();
    // Reload tilt alert markers when tab regains focus (new alerts may have been recorded)
    if (showTiltAlertZones) {
      reloadTiltAlertMarkers();
    }
  }, [loadRuns, loadPins, showTiltAlertZones, reloadTiltAlertMarkers]));

  const activeRunPreviewPayload = useMemo(
    () => (activeRun ? buildNavigationPayloadFromRun(activeRun) : null),
    [activeRun],
  );

  const runBackedPreviewMetadata = useMemo(() => {
    const metadata = exploreNavigationPayload?.routeMetadata;
    if (!metadata || typeof metadata !== 'object') return null;
    const record = metadata as Record<string, unknown>;
    return record.previewSource === 'run_store' ? record : null;
  }, [exploreNavigationPayload?.routeMetadata]);

  useEffect(() => {
    if (!activeRunPreviewPayload) {
      if (
        runBackedPreviewMetadata &&
        roadNavigation.uiMode === 'idle' &&
        trailNavigationUiMode === 'idle' &&
        !roadNavigation.session.destination &&
        !trailSession.payload
      ) {
        appliedNavigationPayloadRef.current = null;
        setExploreNavigationPayloadIfChanged(null);
      }
      return;
    }

    if (
      roadNavigation.uiMode !== 'idle' ||
      trailNavigationUiMode !== 'idle' ||
      !!roadNavigation.session.destination ||
      !!trailSession.payload
    ) {
      return;
    }

    if (exploreNavigationPayload && !runBackedPreviewMetadata) {
      return;
    }

    const currentRunId =
      typeof runBackedPreviewMetadata?.runId === 'string'
        ? runBackedPreviewMetadata.runId
        : null;
    if (currentRunId === activeRunPreviewPayload.id) {
      return;
    }

    const nextPayloadSignature = buildNavigationPayloadSignature(activeRunPreviewPayload);
    if (nextPayloadSignature === currentExploreNavigationPayloadSignature) {
      return;
    }

    appliedNavigationPayloadRef.current = `${activeRunPreviewPayload.id}:${activeRunPreviewPayload.createdAt}`;
    setExploreNavigationPayloadIfChanged(activeRunPreviewPayload);
  }, [
    activeRunPreviewPayload,
    currentExploreNavigationPayloadSignature,
    exploreNavigationPayload,
    roadNavigation.session.destination,
    roadNavigation.uiMode,
    runBackedPreviewMetadata,
    setExploreNavigationPayloadIfChanged,
    trailNavigationUiMode,
    trailSession.payload,
  ]);

  const stitchSourceRuns = useMemo(
    () => runs.filter((run) => safeArray(run.points).length > 1),
    [runs],
  );

  const stitchedRuns = useMemo(
    () =>
      stitchSegmentIds
        .map((runId) => stitchSourceRuns.find((run) => run.id === runId))
        .filter((run): run is ECSRun => !!run),
    [stitchSegmentIds, stitchSourceRuns],
  );

  // â”€â”€ Route Analysis Intelligence â€” auto-analyze when active run changes â”€â”€
  useEffect(() => {
    if (!activeRun || activeRun.points.length < 2) {
      // No active run or insufficient points â€” check if we should clear
      const current = routeAnalysisEngine.getCurrent();
      if (current && activeRun && current.sourceId !== activeRun.id) {
        routeAnalysisEngine.clear();
        applyRouteIntelligence(null);
      }
      return;
    }

    // Check if we already have intelligence for this run
    if (routeAnalysisEngine.hasIntelligenceFor(activeRun.id)) {
      applyRouteIntelligence(routeAnalysisEngine.getCurrent());
      return;
    }

    // Analyze the active run's route
    try {
      const intel = routeAnalysisEngine.analyzeFromRunPoints(
        activeRun.points,
        activeRun.id,
        activeRun.title,
      );
      applyRouteIntelligence(intel);
    } catch (e) {
      console.error('[Navigate] Route analysis failed:', e);

    }
  }, [activeRun, applyRouteIntelligence]);

  // Subscribe to route analysis engine changes (from external triggers)
  useEffect(() => {
    const unsub = routeAnalysisEngine.subscribe((intel) => {
      applyRouteIntelligence(intel);
    });
    return unsub;
  }, [applyRouteIntelligence]);


  // â”€â”€ Resource Forecast â€” auto-compute when route intelligence changes â”€â”€
  useEffect(() => {
    if (!routeIntelligence || routeIntelligence.totalDistanceMiles <= 0) {
      // Clear forecast when no route intelligence
      lastResourceForecastInputKeyRef.current = null;
      if (resourceForecastEngine.getCurrent()) {
        resourceForecastEngine.clear();
        applyResourceForecast(null);
      }
      return;
    }

    // Skip if forecast already matches this route intelligence
    if (resourceForecastEngine.isCurrentFor(routeIntelligence.id)) {
      applyResourceForecast(resourceForecastEngine.getCurrent());
      return;
    }

    const nextForecastInputKey = [
      routeIntelligence.id,
      routeIntelligence.totalDistanceMiles,
      activeRunBuildSnapshotKey,
      activeVehicleProfileSignature,
      powerTelemetryHash,
    ].join('|');

    if (
      lastResourceForecastInputKeyRef.current === nextForecastInputKey &&
      resourceForecastEngine.getCurrent()
    ) {
      return;
    }
    lastResourceForecastInputKeyRef.current = nextForecastInputKey;

    // Resolve vehicle profile from the route/session vehicle when present,
    // otherwise fall back to the Fleet-selected active rig.
    let vehicleProfile: VehicleProfileSnapshot | null = null;
    try {
      const bs = activeRunBuildSnapshotRef.current;
      const forecastVehicleContext = bs?.vehicle_id
        ? getVehicleContext(bs.vehicle_id)
        : getActiveVehicleContext();
      const spec = forecastVehicleContext.spec;
      const vehicle = forecastVehicleContext.vehicle;
      const consumables = forecastVehicleContext.consumables;
      const fuelCapacityGallons =
        spec?.fuel_tank_capacity_gal ??
        forecastVehicleContext.resourceProfile.fuelTankCapacityGal ??
        null;
      let avgMpg = vehicle?.avg_mpg ?? null;

      if (!avgMpg && bs?.estimated_range_miles && fuelCapacityGallons) {
        avgMpg = bs.estimated_range_miles / fuelCapacityGallons;
      }

      if (forecastVehicleContext.hasVehicleContext || bs) {
        vehicleProfile = {
          fuelCapacityGallons,
          currentFuelPercent: consumables?.fuel_percent_current ?? null,
          waterCapacityGallons: forecastVehicleContext.resourceProfile.waterCapacityGal ?? null,
          batteryCapacityWh: forecastVehicleContext.resourceProfile.batteryUsableWh ?? null,
          avgMpg,
          totalWeightLbs:
            spec?.base_weight_lb != null && spec?.hardware_additions_lb != null
              ? spec.base_weight_lb +
                spec.hardware_additions_lb +
                (forecastVehicleContext.loadoutTotalWeightLbs || 0)
              : null,
          curbWeightLbs: spec?.base_weight_lb ?? null,
        };
      }
    } catch {}

    // Gather loadout totals from the active vehicle loadout when available.
    let loadoutTotals: LoadoutTotalsSnapshot | null = null;
    if (vehicleProfile) {
      const buildSnapshot = activeRunBuildSnapshotRef.current;
      const forecastVehicleContext = buildSnapshot?.vehicle_id
        ? getVehicleContext(buildSnapshot.vehicle_id)
        : getActiveVehicleContext();
      if (
        forecastVehicleContext.loadout ||
        forecastVehicleContext.loadoutItemCount > 0 ||
        forecastVehicleContext.loadoutTotalWeightLbs > 0
      ) {
        loadoutTotals = {
          totalCargoWeightLbs: forecastVehicleContext.loadoutTotalWeightLbs || null,
          peopleCount: forecastVehicleContext.loadout?.people_count ?? null,
        };
      }
    }

    // Gather telemetry snapshot from shared BLU power authority
    const telemetrySnap: TelemetrySnapshot | null = powerTelemetrySnapshot;

    // Compute forecast
    try {
      const forecast = resourceForecastEngine.compute(
        routeIntelligence,
        vehicleProfile,
        loadoutTotals,
        telemetrySnap,
      );
      applyResourceForecast(forecast);
    } catch (e) {
      console.warn('[Navigate] Resource forecast computation failed:', e);
    }
  }, [
    routeIntelligence,
    activeRunBuildSnapshotKey,
    activeVehicleProfileSignature,
    powerTelemetryHash,
    powerTelemetrySnapshot,
    applyResourceForecast,
  ]);

  // Subscribe to resource forecast engine changes (from external triggers)
  useEffect(() => {
    const unsub = resourceForecastEngine.subscribe((forecast) => {
      applyResourceForecast(forecast);
    });
    return unsub;
  }, [applyResourceForecast]);

  // â”€â”€ Terrain Analysis â€” auto-analyze when route intelligence changes (Phase 3) â”€â”€
  useEffect(() => {
    if (!routeIntelligence) {
      // Clear terrain intelligence when no route intelligence
      if (terrainAnalysisEngine.getCurrent()) {
        terrainAnalysisEngine.clear();
        applyTerrainIntelligence(null);
      }
      return;
    }

    // Skip if terrain analysis already matches this route intelligence
    if (terrainAnalysisEngine.isCurrentFor(routeIntelligence.id)) {
      applyTerrainIntelligence(terrainAnalysisEngine.getCurrent());
      return;
    }

    // Analyze terrain from route intelligence
    try {
      const terrainIntel = terrainAnalysisEngine.analyze(routeIntelligence);
      applyTerrainIntelligence(terrainIntel);

    } catch (e) {
      console.warn('[Navigate] Terrain analysis failed:', e);
    }
  }, [routeIntelligence, applyTerrainIntelligence]);

  // Subscribe to terrain analysis engine changes (from external triggers)
  useEffect(() => {
    const unsub = terrainAnalysisEngine.subscribe((intel) => {
      applyTerrainIntelligence(intel);
    });
    return unsub;
  }, [applyTerrainIntelligence]);

  // â”€â”€ Expedition Forecast â€” auto-generate when any input changes (Phase 4) â”€â”€
  useEffect(() => {
    if (!routeIntelligence) {
      // Clear forecast when no route intelligence
      if (expeditionForecastEngine.getCurrent()) {
        expeditionForecastEngine.clear();
        applyExpeditionForecast(null);
      }
      return;
    }

    // Check if forecast needs recomputation
    const needsRecompute = expeditionForecastEngine.needsRecompute(
      routeIntelligence.id,
      resourceForecast?.routeIntelligenceId ?? null,
      terrainIntelligence?.id ?? null,
    );

    if (!needsRecompute) {
      applyExpeditionForecast(expeditionForecastEngine.getCurrent());
      return;
    }

    // Generate expedition forecast from all three engines
    try {
      const forecast = expeditionForecastEngine.generate(
        routeIntelligence,
        resourceForecast,
        terrainIntelligence,
      );
      applyExpeditionForecast(forecast);

    } catch (e) {
      console.warn('[Navigate] Expedition forecast generation failed:', e);
    }
  }, [routeIntelligence, resourceForecast, terrainIntelligence, applyExpeditionForecast]);

  // Subscribe to expedition forecast engine changes (from external triggers)
  useEffect(() => {
    const unsub = expeditionForecastEngine.subscribe((forecast) => {
      applyExpeditionForecast(forecast);
    });
    return unsub;
  }, [applyExpeditionForecast]);


  // â”€â”€ Campsite Candidate Detection â€” Phase 2: Suitability Scoring â”€â”€
  useEffect(() => {
    if (!routeIntelligence) {
      // Clear campsite candidates when no route intelligence
      if (campsiteCandidateEngine.getCurrent()) {
        campsiteCandidateEngine.clear();
        applyCampsiteCandidates(null);
      }
      return;
    }

    // Skip if analysis already matches this route intelligence
    if (campsiteCandidateEngine.isCurrentFor(routeIntelligence.id)) {
      applyCampsiteCandidates(campsiteCandidateEngine.getCurrent());
      return;
    }

    // Gather remoteness data for Phase 2 scoring
    let remotenessSnapshot = null;
    try {
      const remoteness = remotenessStore.get();
      if (remoteness) {
        remotenessSnapshot = {
          tier: remoteness.tier ?? null,
          score: remoteness.score ?? null,
        };
      }
    } catch {
      // Remoteness data may not be available â€” proceed without it
    }


    // Wait for terrain intelligence before analyzing (optional but preferred)
    // If terrain intel is not yet available, analyze without it
    try {
      const result = campsiteCandidateEngine.analyze(
        routeIntelligence,
        terrainIntelligence,
        remotenessSnapshot,
      );
      applyCampsiteCandidates(result);

    } catch (e) {
      console.warn('[Navigate] Campsite candidate detection failed:', e);
    }
  }, [routeIntelligence, terrainIntelligence, applyCampsiteCandidates]);

  // Subscribe to campsite candidate engine changes (from external triggers)
  useEffect(() => {
    const unsub = campsiteCandidateEngine.subscribe((result) => {
      applyCampsiteCandidates(result);
    });
    return unsub;
  }, [applyCampsiteCandidates]);

  useEffect(() => {
    const sync = () => {
      applyRemotenessIndex(remotenessStore.getIndex());
    };
    sync();
    const unsubscribe = remotenessStore.subscribe(sync);
    return unsubscribe;
  }, [applyRemotenessIndex]);





  // â”€â”€ Pin markers for map â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const pinMarkers: PinMarker[] = useMemo(() => {
    return safeArray(allPins).map(pin => {
      const meta = getPinTypeMeta(pin.type);
      return {
        id: pin.id, lat: pin.lat, lng: pin.lng, title: pin.title,
        type: pin.type, category: pin.category, color: meta.color,
        mapChar: meta.mapChar, resolved: pin.resolved,
      };
    });
  }, [allPins]);

  // â”€â”€ Category-filtered pins + markers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const categoryFilteredPins = useMemo(() => {
    if (activePinTypeFilters.length === 0) return safeArray(allPins);
    return allPins.filter(pin => activePinTypeFilters.includes(pin.type));
  }, [allPins, activePinTypeFilters]);

  const filteredPinMarkers = useMemo(() => {
    if (activePinTypeFilters.length === 0) return safeArray(pinMarkers);
    return pinMarkers.filter(pm => activePinTypeFilters.includes(pm.type as PinType));
  }, [pinMarkers, activePinTypeFilters]);

  // â”€â”€ Pin CRUD handlers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const handleDropPinHere = useCallback(() => {
  hapticCommand();
  closeTopPopup();

  if (followUser && userLocation) {
    setDropCoords({ lat: userLocation.lat, lng: userLocation.lng });
    setEditingPin(null);
    setPinDropMode(false);
    openTopPopup('pinEditor');
    return;
  }

  setEditingPin(null);
  setDropCoords(null);
  setShowCrosshair(false);
  setPinDropMode(prev => !prev);

  showToast(!pinDropMode ? 'TAP MAP TO DROP PIN' : 'PIN DROP CANCELED');
}, [closeTopPopup, followUser, userLocation, openTopPopup, pinDropMode, showToast]);

  const handleMapCenterReply = useCallback(
  (center: { latitude: number; longitude: number; zoom?: number } | null) => {
    if (!center) return;
    // Center replies can still be used for other map utilities if needed.
  },
  [],
);

const handleQuickPinDrop = useCallback(() => {
  hapticCommand();
  closeTopPopup();
  setEditingPin(null);
  setDropCoords(null);
  setShowCrosshair(false);
  setPinDropMode(true);
  showToast('TAP MAP TO DROP PIN');
}, [closeTopPopup, showToast]);

  const handleLongPress = useCallback((coord: { latitude?: number; longitude?: number }) => {
  if (!Number.isFinite(coord.latitude) || !Number.isFinite(coord.longitude)) return;
  const latitude = Number(coord.latitude);
  const longitude = Number(coord.longitude);
  hapticCommand();
  closeTopPopup();
  setPinDropMode(false);
  setShowCrosshair(false);
  setDropCoords({ lat: latitude, lng: longitude });
  setEditingPin(null);
  openTopPopup('pinEditor');
}, [closeTopPopup, openTopPopup]);

  const handlePinTap = useCallback((pinPayload: any) => {
  hapticMicro();

  if (pinPayload?.kind === 'campIntel') {
    if (roadNavigation.stepListExpanded) {
      roadNavigation.setStepListExpanded(false);
    }
    closeTopPopup();
    setSelectedCampIntelId(typeof pinPayload?.id === 'string' ? pinPayload.id : null);
    return;
  }

  const pinId =
    typeof pinPayload === 'string'
      ? pinPayload
      : typeof pinPayload?.id === 'string'
        ? pinPayload.id
        : null;

  if (!pinId) return;

  const pin = pinStore.getById(pinId);
  if (pin) {
    closeTopPopup();
    setEditingPin(pin);
    setDropCoords({ lat: pin.lat, lng: pin.lng });
    openTopPopup('pinEditor');
  }
}, [closeTopPopup, openTopPopup, roadNavigation]);

  const handleCampIntelTap = useCallback((payload: any) => {
    hapticMicro();
    if (roadNavigation.stepListExpanded) {
      roadNavigation.setStepListExpanded(false);
    }
    closeTopPopup();
    setSelectedCampIntelId(typeof payload?.id === 'string' ? payload.id : null);
  }, [closeTopPopup, roadNavigation, setSelectedCampIntelId]);

  const handleCampIntelDismiss = useCallback(() => {
    setSelectedCampIntelId(null);
  }, []);

  const handleCampIntelNavigateHere = useCallback(async () => {
    if (!selectedCampIntel) return;

    hapticCommand();
    clearActiveRunSelection();
    void clearExploreNavigationPayload();
    void trailNavigation.endNavigation();
    closeTopPopup();
    setSelectedCampIntelId(selectedCampIntel.id);

    fitMapToCoordinatePreview(selectedCampIntel.coordinate, 92, 'camp_intel_focus');

    await roadNavigation.previewDestination(
      {
        id: `camp-intel-${selectedCampIntel.id}`,
        title: selectedCampIntel.label,
        subtitle: `${selectedCampIntel.categoryLabel} â€¢ ${selectedCampIntel.quickVerdict}`,
        coordinate: selectedCampIntel.coordinate,
        sourceType: 'manual_selection',
        raw: { campIntelId: selectedCampIntel.id, sourceRouteId: selectedCampIntel.sourceRouteId },
      },
      'manual_selection',
    );

    showToast(`CAMP FOCUS: ${selectedCampIntel.label.toUpperCase()}`);
  }, [
    clearActiveRunSelection,
    clearExploreNavigationPayload,
    closeTopPopup,
    fitMapToCoordinatePreview,
    roadNavigation,
    selectedCampIntel,
    showToast,
    trailNavigation,
  ]);

  const handleCampIntelSave = useCallback(() => {
    if (!selectedCampIntel) return;
    const saved = campIntel.toggleSavedCamp(selectedCampIntel.id);
    showToast(saved ? 'CAMP SAVED' : 'CAMP REMOVED');
  }, [campIntel, selectedCampIntel, showToast]);

  const handleCampIntelMarkUsed = useCallback(() => {
    if (!selectedCampIntel) return;
    const marked = campIntel.markCampUsed(selectedCampIntel.id);
    showToast(marked ? 'CAMP LOGGED AS USED' : 'CAMP ALREADY LOGGED');
  }, [campIntel, selectedCampIntel, showToast]);

  const handleCampIntelReportUnusable = useCallback(() => {
    if (!selectedCampIntel) return;
    campIntel.reportCampUnusable(selectedCampIntel.id);
    setSelectedCampIntelId(null);
    showToast('CAMP FILTERED FROM CURRENT INTEL');
  }, [campIntel, selectedCampIntel, showToast]);

  const handleCampIntelCompareNearby = useCallback(() => {
    if (!selectedCampIntel) return;
    const nearby = campIntel.getNearbySites(selectedCampIntel.id, 3);
    if (nearby.length === 0) {
      showToast('NO NEARBY CAMPS TO COMPARE');
      return;
    }

    const comparisonSites = [selectedCampIntel, ...nearby];
    const bounds = comparisonSites.reduce(
      (acc, site) => ({
        north: Math.max(acc.north, site.coordinate.latitude),
        south: Math.min(acc.south, site.coordinate.latitude),
        east: Math.max(acc.east, site.coordinate.longitude),
        west: Math.min(acc.west, site.coordinate.longitude),
      }),
      {
        north: comparisonSites[0].coordinate.latitude,
        south: comparisonSites[0].coordinate.latitude,
        east: comparisonSites[0].coordinate.longitude,
        west: comparisonSites[0].coordinate.longitude,
      },
    );

    queueMapCameraCommand({
      mode: 'pin_focus',
      fitBounds: {
        north: bounds.north,
        south: bounds.south,
        east: bounds.east,
        west: bounds.west,
        padding: 86,
        maxZoom: 14.5,
      },
      durationMs: 500,
      animate: true,
      reason: 'camp_intel_compare',
    });

    showToast(`COMPARING ${comparisonSites.length} CAMP OPTIONS`);
  }, [campIntel, queueMapCameraCommand, selectedCampIntel, showToast]);

  const handlePinSave = useCallback((data: {
  type: PinType; title: string; notes: string; severity: any;
}) => {
  if (editingPin) {
    pinStore.update(editingPin.id, {
      type: data.type, title: data.title, notes: data.notes, severity: data.severity,
    });
    showToast(`PIN UPDATED: ${data.title}`);
  } else if (dropCoords) {
    pinStore.create({
      type: data.type, lat: dropCoords.lat, lng: dropCoords.lng,
      title: data.title, notes: data.notes, severity: data.severity,
      expedition_id: activeExpeditionId, created_by: user?.email || 'local',
    });
    showToast(`PIN DROPPED: ${data.title}`);
  }

  setPinDropMode(false);
  setShowCrosshair(false);
  closeTopPopup();
  setEditingPin(null);
  setDropCoords(null);
  loadPins();
}, [editingPin, dropCoords, activeExpeditionId, user, showToast, closeTopPopup, loadPins]);

  const handlePinDelete = useCallback(() => {
  if (editingPin) {
    const doDelete = () => {
      pinStore.delete(editingPin.id);
      setPinDropMode(false);
      setShowCrosshair(false);
      closeTopPopup();
      setEditingPin(null);
      setDropCoords(null);
      loadPins();
      showToast('PIN DELETED');
    };
    if (Platform.OS === 'web') { if (confirm('Delete this pin?')) doDelete(); }
    else { Alert.alert('Delete Pin', 'Remove this pin?', [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: doDelete }]); }
  }
}, [editingPin, closeTopPopup, loadPins, showToast]);

  const handlePinResolve = useCallback(() => {
  if (editingPin) {
    pinStore.resolve(editingPin.id);
    setPinDropMode(false);
    setShowCrosshair(false);
    closeTopPopup();
    setEditingPin(null);
    setDropCoords(null);
    loadPins();
    showToast('INCIDENT RESOLVED');
  }
}, [editingPin, closeTopPopup, loadPins, showToast]);

  const handleSelectPin = useCallback((_pin: ECSPin) => {
    hapticMicro();
    showToast(`CENTERED ON: ${_pin.title}`);
  }, [showToast]);

  const handleEditPin = useCallback((pin: ECSPin) => {
    setEditingPin(pin);
    setDropCoords({ lat: pin.lat, lng: pin.lng });
    openTopPopup('pinEditor');
  }, [openTopPopup]);

  const handleResolvePin = useCallback((pin: ECSPin) => {
    if (pin.resolved) {
      pinStore.unresolve(pin.id);
      showToast('INCIDENT REOPENED');
    } else {
      pinStore.resolve(pin.id);
      showToast('INCIDENT RESOLVED');
    }
    loadPins();
  }, [loadPins, showToast]);

  const handleExportPins = useCallback((pins: ECSPin[]) => {
    closeTopPopup();
    setExportPins(pins);
    setExportModalVisible(true);
  }, [closeTopPopup]);

  const handleExportAction = useCallback((format: 'gpx' | 'json' | 'coords') => {
    let content = '';
    switch (format) {
      case 'gpx':
        content = pinStore.exportToGPX(exportPins, activeExpeditionName || 'ECS Pins');
        break;
      case 'json':
        content = pinStore.exportToJSON(exportPins);
        break;
      case 'coords':
        content = pinStore.exportCoordinatesList(exportPins);
        break;
    }
    if (Platform.OS === 'web' && navigator.clipboard) {
      navigator.clipboard.writeText(content).then(() => {
        showToast(`${format.toUpperCase()} COPIED TO CLIPBOARD (${exportPins.length} pins)`);
      }).catch(() => showToast('COPY FAILED'));
    } else {
      showToast(`EXPORT: ${exportPins.length} pins as ${format.toUpperCase()}`);
    }
    setExportModalVisible(false);
  }, [exportPins, activeExpeditionName, showToast]);

const handleDirectMapTapForPin = useCallback(
  ({ latitude, longitude }: { latitude: number; longitude: number }) => {
    if (!pinDropMode) {
      if (selectedCampIntelId) {
        setSelectedCampIntelId(null);
      }
      return;
    }

    hapticCommand();
    closeTopPopup();
    setDropCoords({ lat: latitude, lng: longitude });
    setEditingPin(null);
    setPinDropMode(false);
    setShowCrosshair(false);
    openTopPopup('pinEditor');
  },
  [pinDropMode, closeTopPopup, openTopPopup, selectedCampIntelId],
);

  // â”€â”€ Phase 15: Route geometry validation before MapRenderer â”€â”€
// Validates route points before passing to the map to prevent rendering crashes.
const validatedRunPoints = useMemo(() => {
  try {
    const pts = activeRun?.points || [];
    if (pts.length === 0) return [];

    const filtered = pts.filter((p) => {
      if (!p) return false;
      if (!Number.isFinite(p.lat) || !Number.isFinite(p.lng)) return false;
      if (p.lat < -90 || p.lat > 90) return false;
      if (p.lng < -180 || p.lng > 180) return false;
      return true;
    });

    if (filtered.length < 2) {
      stabilityLog(
        'Navigation',
        'warn',
        `Route geometry invalid for run "${activeRun?.id}" â€” fewer than 2 valid coordinates after filtering (${pts.length} raw, ${filtered.length} valid)`
      );
      return [];
    }

    let hasDistinctPair = false;
    for (let i = 1; i < filtered.length; i += 1) {
      const prev = filtered[i - 1];
      const curr = filtered[i];
      if (prev.lat !== curr.lat || prev.lng !== curr.lng) {
        hasDistinctPair = true;
        break;
      }
    }

    if (!hasDistinctPair) {
      stabilityLog(
        'Navigation',
        'warn',
        `Route geometry invalid for run "${activeRun?.id}" â€” all coordinates collapse to the same point (${filtered.length} valid points)`
      );
      return [];
    }

    
    return filtered;
  } catch (e) {
    stabilityLog('Navigation', 'error', 'Route geometry validation failed', e);
    return [];
  }
}, [activeRun?.id, activeRun?.points]);


// â”€â”€ Segment risk for active run â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const activeSegmentProfile = useMemo<SegmentRiskProfile | null>(() => {
  if (!activeRun || validatedRunPoints.length < 2) return null;

  try {
    return computeSegmentRisk(
      activeRun.id,
      validatedRunPoints,
      activeRun.build_snapshot
    );
  } catch (e) {
    stabilityLog('Navigation', 'error', 'Segment risk computation failed', e);
    return null;
  }
}, [activeRun, validatedRunPoints]);


    // â”€â”€ Bailouts + Remoteness for active run â”€â”€â”€â”€â”€â”€â”€
  const [activeBailouts, setActiveBailouts] = useState<BailoutPoint[]>([]);

  useEffect(() => {
    if (!activeRun) {
      setActiveBailouts([]);
      return;
    }

    const runBailouts = bailoutStore.getRunBailouts(activeRun.id);
    setActiveBailouts(runBailouts.length > 0 ? runBailouts : bailoutStore.getAll());
  }, [activeRun]);

  const enrichedProfile = useMemo(() => {
    if (!activeSegmentProfile || activeBailouts.length === 0) return activeSegmentProfile;
    const result = bailoutStore.computeRemoteness(activeSegmentProfile.segments, activeBailouts);
    return { ...activeSegmentProfile, segments: result.segments };
  }, [activeSegmentProfile, activeBailouts]);

  const activeExitPlan = useMemo<ExitPlan | null>(() => {
    if (!enrichedProfile || activeBailouts.length === 0) return null;
    return bailoutStore.computeExitPlan(enrichedProfile.segments, activeBailouts);
  }, [enrichedProfile, activeBailouts]);

  const weatherRiskModifier =
  weatherSeveritySummary?.level === 'extreme' ? 3 :
  weatherSeveritySummary?.level === 'warning' ? 2 :
  weatherSeveritySummary?.level === 'advisory' ? 1 :
  0;

const segmentFeatures = useMemo(() => {
  if (!enrichedProfile || !activeRun) return undefined;

  return enrichedProfile.segments.map((seg) => {
    const coords: [number, number][] = [];
    for (let i = seg.start_idx; i <= seg.end_idx && i < activeRun.points.length; i++) {
      coords.push([activeRun.points[i].lng, activeRun.points[i].lat]);
    }

    return {
      coordinates: coords,
      color: getSegmentColor(seg),
      risk_level: seg.risk_level,
      seg_index: seg.seg_index,
      risk_score: seg.risk_score + seg.remoteness_score + weatherRiskModifier,
      remoteness_level: seg.remoteness_level,
    };
  });
}, [enrichedProfile, activeRun, weatherRiskModifier]);

  const bailoutMarkers = useMemo(() => {
    return activeBailouts.map((bp) => {
      const meta = getBailoutTypeMeta(bp.type);
      return {
        id: bp.id,
        lat: bp.lat,
        lng: bp.lng,
        title: bp.title,
        type: bp.type,
        color: meta.color,
      };
    });
  }, [activeBailouts]);

  const resetSnapshotForm = useCallback(() => {
    setPendingGpxContent(null);
    setPendingGpxName('');
    setBsVehicleName('');
    setBsRange('');
    setBsTotalWeight('');
    setBsRoofWeight('');
    setBsHitchWeight('');
    setBsRoofLimit('');
    setBsHitchLimit('');
    setSnapshotModalVisible(false);
  }, []);

  const simplifyRouteCoords = useCallback(
    (coords: [number, number][], maxPoints = 1000): [number, number][] => {
      if (!Array.isArray(coords) || coords.length <= maxPoints) return coords;

      const step = Math.ceil(coords.length / maxPoints);
      const simplified = coords.filter(
        (_, i) => i === 0 || i === coords.length - 1 || i % step === 0
      );

      return simplified.length > maxPoints
        ? simplified.slice(0, maxPoints - 1).concat([coords[coords.length - 1]])
        : simplified;
    },
    []
  );

  const validateImportedRouteContent = useCallback(
  (fileName: string, ext: string, content: string) => {
    let primaryCoords: [number, number][] = [];
    let parsed: any = null;

    if (ext === 'geojson' || ext === 'json') {
      const geo = JSON.parse(content);

      if (geo?.type === 'FeatureCollection' && Array.isArray(geo.features)) {
        geo.features.forEach((f: any) => {
          if (f.geometry?.type === 'LineString' && Array.isArray(f.geometry.coordinates)) {
            primaryCoords.push(...f.geometry.coordinates);
          }

          if (
            f.geometry?.type === 'MultiLineString' &&
            Array.isArray(f.geometry.coordinates)
          ) {
            f.geometry.coordinates.forEach((line: any) => {
              if (Array.isArray(line)) primaryCoords.push(...line);
            });
          }
        });
      }

      primaryCoords = simplifyRouteCoords(primaryCoords, 1000);

      
    } else {
      parsed = parseGeoFile(fileName, content);
      primaryCoords = simplifyRouteCoords(getPrimaryRouteCoordinates(parsed), 1000);
    }

    
    if (primaryCoords.length < 2) {
      throw new Error('IMPORT FAILED â€” Route needs at least 2 valid points');
    }

    return {
      parsed,
      primaryCoords,
    };
  },
  [simplifyRouteCoords]
);

const handleImmediateImport = useCallback(
  (content: string, fileName: string) => {
    const ext = fileName.split('.').pop()?.toLowerCase() || '';

    try {
      const { parsed, primaryCoords } = validateImportedRouteContent(fileName, ext, content);

      let run: ECSRun;

      if (ext === 'geojson' || ext === 'json') {
        const geo = JSON.parse(content);

        const geoPoints = (primaryCoords ?? [])
          .map((coord: any, idx: number) => {
            const lng = Array.isArray(coord) ? Number(coord[0]) : null;
            const lat = Array.isArray(coord) ? Number(coord[1]) : null;
            const ele =
              Array.isArray(coord) && coord.length > 2 && Number.isFinite(Number(coord[2]))
                ? Number(coord[2])
                : null;

            if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

            return {
              lat,
              lng,
              ele_m: ele,
              time: null,
              type: 'route' as const,
            };
          })
          .filter(Boolean);

        run = runStore.createFromParsedImport(
          {
            name: fileName.replace(/\.[^.]+$/, ''),
            routePoints: geoPoints,
            trackPoints: [],
            primaryCoords: geoPoints,
            waypoints: [],
            raw: geo,
          },
          undefined,
          'geojson',
          fileName.replace(/\.[^.]+$/, '')
        );
      } else {
        const routePoints =
          parsed?.routes?.flatMap((r: any) =>
            (r.points ?? []).map((pt: any) => ({
              lat: pt?.lat,
              lng: pt?.lon ?? pt?.lng,
              ele_m: pt?.ele ?? null,
              time: pt?.time ?? null,
            }))
          ) ?? [];

        const trackPoints =
          parsed?.tracks?.flatMap((t: any) =>
            (t.segments ?? []).flatMap((s: any) =>
              (s.points ?? []).map((pt: any) => ({
                lat: pt?.lat,
                lng: pt?.lon ?? pt?.lng,
                ele_m: pt?.ele ?? null,
                time: pt?.time ?? null,
              }))
            )
          ) ?? [];

        const fallbackPrimary =
          routePoints.length === 0 && trackPoints.length === 0
            ? (primaryCoords ?? [])
                .map((coord: any) => {
                  const lng = Array.isArray(coord) ? Number(coord[0]) : null;
                  const lat = Array.isArray(coord) ? Number(coord[1]) : null;

                  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

                  return {
                    lat,
                    lng,
                    ele_m: null,
                    time: null,
                  };
                })
                .filter(Boolean)
            : [];

        const normalizedParsed = {
          name: parsed?.name || fileName.replace(/\.[^.]+$/, '') || 'Imported Route',
          routePoints,
          trackPoints,
          primaryCoords: fallbackPrimary,
          waypoints: parsed?.waypoints ?? [],
          routes: parsed?.routes ?? [],
          tracks: parsed?.tracks ?? [],
        };

        
        run = runStore.createFromParsedImport(
          normalizedParsed,
          undefined,
          ext,
          normalizedParsed.name
        );
      }

      
      if (!run || (run.points?.length ?? 0) < 2) {
        throw new Error('IMPORT FAILED â€” Parsed route could not be converted into run points');
      }

      runStore.setActive(run.id);
      loadRuns();
      resetSnapshotForm();

      showToast(`RUN CREATED: ${run.title} (${run.stats.distance_miles.toFixed(1)} mi)`);
    } catch (err: any) {
      console.error('[Navigate] Immediate import failed:', err);
      showToast(err?.message || 'FAILED TO IMPORT ROUTE');
    }
  },
  [loadRuns, resetSnapshotForm, showToast, validateImportedRouteContent]
);

// â”€â”€ GPX/KML/GeoJSON Import â€” immediate route creation â”€â”€â”€â”€â”€
const handleImportGPX = useCallback(async () => {
  
  // â”€â”€ Web: Use DOM file input â”€â”€
  if (Platform.OS === 'web' && typeof document !== 'undefined') {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.gpx,.xml,.kml,.geojson,.json';

    input.onchange = async (e: any) => {
      const file = e.target?.files?.[0];
      if (!file) {
        showToast('IMPORT CANCELED');
        return;
      }

      const fileName = file.name || 'imported.gpx';
      const ext = fileName.split('.').pop()?.toLowerCase() || '';

      if (!['gpx', 'xml', 'kml', 'geojson', 'json'].includes(ext)) {
        showToast('UNSUPPORTED FORMAT â€” Use .gpx, .kml, or .geojson');
        return;
      }

      try {
        const text = await file.text();

        if (!text || text.length === 0) {
          showToast('IMPORT FAILED â€” File appears to be empty');
          return;
        }

        
        showToast(`FILE SELECTED: ${fileName}`);
        handleImmediateImport(text, fileName);
      } catch (readErr) {
        console.error('[Navigate] Failed to read file:', readErr);
        showToast('IMPORT FAILED â€” Could not read file');
      }
    };

    input.click();
    return;
  }

  // â”€â”€ Native (Android/iOS): Use expo-document-picker â”€â”€
try {
  const DocumentPicker = await import('expo-document-picker');

  const result = await DocumentPicker.getDocumentAsync({
    type: [
      'application/gpx+xml',
      'text/xml',
      'application/xml',
      'application/json',
      'application/geo+json',
      'text/plain',
      '*/*',
    ],
    copyToCacheDirectory: true,
  });

  if (result.canceled || !result.assets || result.assets.length === 0) {
    showToast('IMPORT CANCELED');
    return;
  }

  const asset = result.assets[0];
  const fileName = asset.name || 'imported.gpx';
  const ext = fileName.split('.').pop()?.toLowerCase() || '';

  if (!['gpx', 'xml', 'kml', 'geojson', 'json'].includes(ext)) {
    showToast(`UNSUPPORTED FORMAT: .${ext} â€” Use .gpx, .kml, or .geojson`);
    return;
  }

  showToast(`FILE SELECTED: ${fileName}`);

  try {
    const fileUri = asset.uri;
    const content = await fsReadFileFromPickerUri(fileUri);

    if (!content || content.length === 0) {
      showToast('IMPORT FAILED â€” File appears to be empty');
      return;
    }

    handleImmediateImport(content, fileName);
  } catch (readErr: any) {
    console.error('[Navigate] Failed to read file content:', readErr);
    showToast('IMPORT FAILED â€” Could not read file content');
  }
} catch (pickerErr) {
  console.error('[Navigate] Document picker failed:', pickerErr);
  if (Platform.OS === 'android') {
    showToast('FILE IMPORT UNAVAILABLE â€” expo-document-picker may need to be installed');
  } else {
    showToast('FILE IMPORT UNAVAILABLE â€” Check build configuration');
  }
}
}, [handleImmediateImport, showToast]);

// Legacy snapshot-based import retained for optional future use
const handleCreateRun = useCallback(() => {
  if (!pendingGpxContent || !pendingGpxName) return;

  const snapshot: Partial<BuildSnapshot> = {
    vehicle_name: bsVehicleName || 'No Vehicle',
    estimated_range_miles: parseFloat(bsRange) || 0,
    total_weight_lb: parseFloat(bsTotalWeight) || 0,
    roof_weight_lb: parseFloat(bsRoofWeight) || 0,
    hitch_weight_lb: parseFloat(bsHitchWeight) || 0,
    limits: {
      roof_limit_lb: parseFloat(bsRoofLimit) || 0,
      hitch_limit_lb: parseFloat(bsHitchLimit) || 0,
    },
  };

  try {
    const ext = pendingGpxName.split('.').pop()?.toLowerCase() || '';
    const { parsed, primaryCoords } = validateImportedRouteContent(
      pendingGpxName,
      ext,
      pendingGpxContent
    );

    let run: ECSRun;

    if (ext === 'geojson' || ext === 'json') {
      const geoPoints = (primaryCoords ?? [])
        .map((coord: any) => {
          const lng = Array.isArray(coord) ? Number(coord[0]) : null;
          const lat = Array.isArray(coord) ? Number(coord[1]) : null;
          const ele =
            Array.isArray(coord) && coord.length > 2 && Number.isFinite(Number(coord[2]))
              ? Number(coord[2])
              : null;

          if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

          return {
            lat,
            lng,
            ele_m: ele,
            time: null,
            type: 'route' as const,
          };
        })
        .filter(Boolean);

      run = runStore.createFromParsedImport(
        {
          name: pendingGpxName.replace(/\.[^.]+$/, ''),
          routePoints: geoPoints,
          trackPoints: [],
          primaryCoords: geoPoints,
          waypoints: [],
        },
        snapshot,
        'geojson',
        pendingGpxName.replace(/\.[^.]+$/, '')
      );
    } else {
      const routePoints =
        parsed?.routes?.flatMap((r: any) =>
          (r.points ?? []).map((pt: any) => ({
            lat: pt?.lat,
            lng: pt?.lon ?? pt?.lng,
            ele_m: pt?.ele ?? null,
            time: pt?.time ?? null,
          }))
        ) ?? [];

      const trackPoints =
        parsed?.tracks?.flatMap((t: any) =>
          (t.segments ?? []).flatMap((s: any) =>
            (s.points ?? []).map((pt: any) => ({
              lat: pt?.lat,
              lng: pt?.lon ?? pt?.lng,
              ele_m: pt?.ele ?? null,
              time: pt?.time ?? null,
            }))
          )
        ) ?? [];

      const fallbackPrimary =
        routePoints.length === 0 && trackPoints.length === 0
          ? (primaryCoords ?? [])
              .map((coord: any) => {
                const lng = Array.isArray(coord) ? Number(coord[0]) : null;
                const lat = Array.isArray(coord) ? Number(coord[1]) : null;

                if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

                return {
                  lat,
                  lng,
                  ele_m: null,
                  time: null,
                };
              })
              .filter(Boolean)
          : [];

      run = runStore.createFromParsedImport(
        {
          name: parsed?.name || pendingGpxName.replace(/\.[^.]+$/, '') || 'Imported Route',
          routePoints,
          trackPoints,
          primaryCoords: fallbackPrimary,
          waypoints: parsed?.waypoints ?? [],
          routes: parsed?.routes ?? [],
          tracks: parsed?.tracks ?? [],
        },
        snapshot,
        ext,
        parsed?.name || pendingGpxName.replace(/\.[^.]+$/, '') || 'Imported Route'
      );
    }

    if (!run || (run.points?.length ?? 0) < 2) {
      throw new Error('FAILED TO PARSE GPX');
    }

    runStore.setActive(run.id);
    loadRuns();
    resetSnapshotForm();
    showToast(`RUN CREATED: ${run.title} (${run.stats.distance_miles.toFixed(1)} mi)`);
  } catch (err: any) {
    console.error('[Navigate] handleCreateRun failed:', err);
    showToast(err?.message || 'FAILED TO PARSE GPX');
  }
}, [
  pendingGpxContent,
  pendingGpxName,
  bsVehicleName,
  bsRange,
  bsTotalWeight,
  bsRoofWeight,
  bsHitchWeight,
  bsRoofLimit,
  bsHitchLimit,
  loadRuns,
  resetSnapshotForm,
  showToast,
  validateImportedRouteContent,
]);

  const handleQuickImport = useCallback(() => {
    if (!pendingGpxContent || !pendingGpxName) return;
    handleImmediateImport(pendingGpxContent, pendingGpxName);
  }, [handleImmediateImport, pendingGpxContent, pendingGpxName]);

  const handleOpenStitch = useCallback(() => {
    setStitchName('Stitched Expedition');
    setStitchSegmentIds((prev) => {
      if (prev.length > 0) return prev;
      return activeRun ? [activeRun.id] : [];
    });
    openTopPopup('stitch');
  }, [activeRun, openTopPopup]);

  const handleAddStitchSegment = useCallback((runId: string) => {
    setStitchSegmentIds((prev) => (prev.includes(runId) ? prev : [...prev, runId]));
  }, []);

  const handleRemoveStitchSegment = useCallback((runId: string) => {
    setStitchSegmentIds((prev) => prev.filter((id) => id !== runId));
  }, []);

  const handleMoveStitchSegment = useCallback((runId: string, direction: -1 | 1) => {
    setStitchSegmentIds((prev) => {
      const index = prev.indexOf(runId);
      if (index === -1) return prev;
      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= prev.length) return prev;
      const next = [...prev];
      const [moved] = next.splice(index, 1);
      next.splice(nextIndex, 0, moved);
      return next;
    });
  }, []);

  const handleSaveStitch = useCallback(() => {
    if (stitchedRuns.length === 0) {
      showToast('ADD AT LEAST ONE ROUTE TO STITCH');
      return;
    }

    const nextTitle = stitchName.trim() || 'Stitched Expedition';
    const stitched = buildStitchedRunImport(stitchedRuns, nextTitle);
    const stitchedRun = runStore.createFromParsedImport(
      stitched.parsed,
      stitchedRuns[0]?.build_snapshot,
      'stitch',
      nextTitle,
    );
    runStore.setActive(stitchedRun.id);
    loadRuns();

    const previewPayload = buildNavigationPayloadFromRun(stitchedRun, {
      segmentCount: stitched.segmentCount,
      transitionLegCount: stitched.transitionLegCount,
    });

    void trailNavigation.endNavigation();
    void roadNavigation.clearDestination();

    if (previewPayload) {
      appliedNavigationPayloadRef.current = `${previewPayload.id}:${previewPayload.createdAt}`;
      setExploreNavigationPayload(previewPayload);
      void saveNavigationHandoffPayload(previewPayload);
    }

    closeTopPopup('stitch');
    setStitchSegmentIds([]);
    setStitchName('Stitched Expedition');
    showToast(
      stitched.transitionLegCount > 0
        ? `STITCHED EXPEDITION READY: ${nextTitle} â€¢ ${stitched.transitionLegCount} TRANSITION LEGS`
        : `STITCHED EXPEDITION READY: ${nextTitle}`,
    );
  }, [
    closeTopPopup,
    loadRuns,
    roadNavigation,
    showToast,
    stitchName,
    stitchedRuns,
    trailNavigation,
  ]);

  const activeHealth = useMemo(
    () => (activeRun ? computeRunHealth(activeRun) : null),
    [activeRun]
  );

  const safeActiveRunDistanceMiles = safeNumber(activeRun?.stats?.distance_miles, 0);

  const activeRunWaypointList = useMemo(
    () =>
      safeArray(activeRun?.waypoints).map((waypoint: any, index: number) => ({
        id: waypoint?.id ?? `wp_${index}`,
        latitude: Number(waypoint?.latitude ?? waypoint?.lat ?? 0),
        longitude: Number(waypoint?.longitude ?? waypoint?.lng ?? 0),
        title: waypoint?.title ?? waypoint?.name,
        description: waypoint?.description,
      })),
    [activeRun?.waypoints]
  );

  const safeUserLocation = useMemo(() => {
    if (!userLocation) return null;
    const coordinate = toSafeCoordinate(userLocation);
    return coordinate
      ? { lat: coordinate.latitude, lng: coordinate.longitude }
      : null;
  }, [userLocation]);

  const roadRoutePoints = useMemo(
    () =>
      safeArray(roadNavigation.session.route?.geometry).map((point) => ({
        lat: point.lat,
        lng: point.lng,
      })),
    [roadNavigation.session.route?.geometry],
  );

  const roadRouteProgressPoints = useMemo(
    () =>
      safeArray(roadNavigation.session.progressGeometry).map((point) => ({
        lat: point.lat,
        lng: point.lng,
      })),
    [roadNavigation.session.progressGeometry],
  );

  const roadRouteWaypoints = useMemo(() => {
    const destination = roadNavigation.session.destination;
    if (!destination) return [];
    return [
      {
        id: destination.id,
        latitude: destination.coordinate.lat,
        longitude: destination.coordinate.lng,
        title: destination.title,
        description: destination.subtitle ?? undefined,
      },
    ];
  }, [roadNavigation.session.destination]);

  const explorePreviewMode = useMemo<NavigationTripMode | null>(
    () =>
      exploreNavigationPayload
        ? classifyNavigationHandoff(exploreNavigationPayload)
        : null,
    [exploreNavigationPayload],
  );

  const explorePreviewTrailLengthMiles = useMemo(() => {
    if (!exploreNavigationPayload) return null;
    return (
      exploreNavigationPayload.trailLengthMiles ??
      computeTrailLengthMiles(exploreNavigationPayload.trailGeometry)
    );
  }, [exploreNavigationPayload]);

  const explorePreviewTrailSegments = useMemo<TrailSegmentData[]>(() => {
    if (
      !exploreNavigationPayload ||
      exploreNavigationPayload.trailGeometry.length < 2 ||
      (explorePreviewMode !== 'trail' && explorePreviewMode !== 'hybrid')
    ) {
      return [];
    }

    return [
      {
        id: `explore-preview-${exploreNavigationPayload.id}`,
        coordinates: exploreNavigationPayload.trailGeometry.map((point) => [
          point.lng,
          point.lat,
        ]) as [number, number][],
        color: '#D4A017',
      },
    ];
  }, [exploreNavigationPayload, explorePreviewMode]);

  const explorePreviewWaypoints = useMemo<
    { id: string; latitude: number; longitude: number; title: string; description?: string }[]
  >(() => {
    if (!exploreNavigationPayload) return [];

    const markers: { id: string; latitude: number; longitude: number; title: string; description?: string }[] = [];
    const pushMarker = (
      id: string,
      coordinate: { lat: number; lng: number } | null | undefined,
      title: string,
      subtitle?: string,
    ) => {
      if (!coordinate) return;
      if (
        markers.some(
          (marker) =>
            coordinatesEqual(
              { lat: marker.latitude, lng: marker.longitude },
              coordinate,
            ),
        )
      ) {
        return;
      }

      markers.push({
        id,
        latitude: coordinate.lat,
        longitude: coordinate.lng,
        title,
        description: subtitle,
      });
    };

    const roadCoordinate = getRoadDestinationCoordinate(exploreNavigationPayload);
    const finalCoordinate =
      exploreNavigationPayload.coordinate ??
      (exploreNavigationPayload.trailGeometry.length > 0
        ? exploreNavigationPayload.trailGeometry[exploreNavigationPayload.trailGeometry.length - 1]
        : null);

    if (explorePreviewMode === 'hybrid' && roadCoordinate) {
      pushMarker(
        `${exploreNavigationPayload.id}-trailhead`,
        roadCoordinate,
        'Trailhead',
        'Road approach available',
      );
    }

    pushMarker(
      `${exploreNavigationPayload.id}-destination`,
      finalCoordinate ?? roadCoordinate,
      exploreNavigationPayload.title,
      exploreNavigationPayload.subtitle ?? undefined,
    );

    return markers;
  }, [exploreNavigationPayload, explorePreviewMode]);

  const trailOnlyPreviewActive =
    explorePreviewMode === 'trail' && !!exploreNavigationPayload;

  useEffect(() => {
    if (!exploreNavigationPayload || !explorePreviewMode) {
      appliedTrailPayloadRef.current = null;
      hybridTrailTransitionRef.current = null;
      return;
    }

    if (explorePreviewMode === 'road') {
      appliedTrailPayloadRef.current = null;
      hybridTrailTransitionRef.current = null;
      void endTrailNavigation();
      return;
    }

    const payloadKey = `${exploreNavigationPayload.id}:${exploreNavigationPayload.createdAt}:${explorePreviewMode}`;
    if (payloadKey === appliedTrailPayloadRef.current) return;

    appliedTrailPayloadRef.current = payloadKey;
    hybridTrailTransitionRef.current = null;
    void loadTrailPayload(
      exploreNavigationPayload,
      explorePreviewMode === 'hybrid' ? 'route_preview_hybrid' : 'route_preview_trail',
    );
  }, [
    exploreNavigationPayload,
    explorePreviewMode,
    endTrailNavigation,
    loadTrailPayload,
  ]);

  useEffect(() => {
    if (!exploreNavigationPayload || explorePreviewMode !== 'hybrid') return;
    if (roadNavigation.session.status !== 'arrived') return;
    if (trailSession.status !== 'route_preview_hybrid') return;

    const transitionKey = `${exploreNavigationPayload.id}:${exploreNavigationPayload.createdAt}:trail`;
    if (hybridTrailTransitionRef.current === transitionKey) return;
    hybridTrailTransitionRef.current = transitionKey;
    void transitionTrailFromRoad();
  }, [
    exploreNavigationPayload,
    explorePreviewMode,
    roadNavigation.session.status,
    trailSession.status,
    transitionTrailFromRoad,
  ]);

  const pendingHybridTrailTransition =
    explorePreviewMode === 'hybrid' &&
    roadNavigation.session.status === 'arrived' &&
    trailNavigation.session.status === 'route_preview_hybrid';

  const trailNavigationActive =
    trailNavigation.uiMode === 'active' || trailNavigation.uiMode === 'arrived';

  const navigationOverlayMode = useMemo(() => {
    if (pendingHybridTrailTransition) return 'active';
    if (trailNavigation.uiMode === 'active' || trailNavigation.uiMode === 'arrived') {
      return trailNavigation.uiMode;
    }
    if (roadNavigation.uiMode === 'active') return 'active';
    if (roadNavigation.uiMode === 'arrived' && explorePreviewMode !== 'hybrid') return 'arrived';
    if (trailNavigation.uiMode === 'preview' || trailNavigation.uiMode === 'error') {
      return trailNavigation.uiMode;
    }
    return trailOnlyPreviewActive ? 'preview' : roadNavigation.uiMode;
  }, [
    explorePreviewMode,
    pendingHybridTrailTransition,
    roadNavigation.uiMode,
    trailNavigation.uiMode,
    trailOnlyPreviewActive,
  ]);

  const roadNavigationActive =
    (roadNavigation.session.status !== 'idle' &&
      roadNavigation.session.status !== 'cancelled') ||
    trailNavigation.uiMode !== 'idle' ||
    trailOnlyPreviewActive;

  const lastGpsIssueSignatureRef = useRef<string | null>(null);

  useEffect(() => {
    if (!roadNavigationActive) {
      lastGpsIssueSignatureRef.current = null;
      return;
    }
    if (gps.hasFix || gps.gpsStatus === 'TRACKING') {
      lastGpsIssueSignatureRef.current = null;
      return;
    }

    const signature = `gps_nav:${gps.gpsStatus}:${gps.retryCount}:${gps.permissionDenied ? 'denied' : 'allowed'}`;
    if (lastGpsIssueSignatureRef.current === signature) return;
    lastGpsIssueSignatureRef.current = signature;

    reportDegradedState({
      severity: gps.permissionDenied ? 'high' : 'medium',
      issueTitle: 'GPS unavailable during active navigation',
      ecsArea: 'gps',
      message: gps.error || gps.gpsStatus,
      signature,
      metadata: {
        gpsStatus: gps.gpsStatus,
        fixQuality: gps.fixQuality,
        retryCount: gps.retryCount,
        permissionDenied: gps.permissionDenied,
        roadNavigationStatus: roadNavigation.session.status,
        trailNavigationMode: trailNavigation.uiMode,
      },
      fallbackUsed: true,
    });
  }, [
    gps.error,
    gps.fixQuality,
    gps.gpsStatus,
    gps.hasFix,
    gps.permissionDenied,
    gps.retryCount,
    roadNavigation.session.status,
    roadNavigationActive,
    trailNavigation.uiMode,
  ]);

  const trailNavigationMarkers = useMemo<
    { id: string; latitude: number; longitude: number; title: string; description?: string }[]
  >(() => {
    if (!trailNavigation.session.payload) return [];

    const markers: {
      id: string;
      latitude: number;
      longitude: number;
      title: string;
      description?: string;
    }[] = [];

    const pushMarker = (
      id: string,
      coordinate: { lat: number; lng: number } | null | undefined,
      title: string,
      description?: string,
    ) => {
      if (!coordinate) return;
      if (
        markers.some((marker) =>
          coordinatesEqual(
            { lat: marker.latitude, lng: marker.longitude },
            coordinate,
          ),
        )
      ) {
        return;
      }

      markers.push({
        id,
        latitude: coordinate.lat,
        longitude: coordinate.lng,
        title,
        description,
      });
    };

    if (trailNavigation.session.nextDecisionPoint) {
      pushMarker(
        `${trailNavigation.session.nextDecisionPoint.id}-decision`,
        trailNavigation.session.nextDecisionPoint.coordinate,
        trailNavigation.session.nextDecisionPoint.landmarkName ??
          trailNavigation.session.nextDecisionPoint.instructionText ??
          'Decision Point',
        'Next decision',
      );
    }

    if (trailNavigation.session.nextWaypoint) {
      pushMarker(
        `${trailNavigation.session.nextWaypoint.id}-waypoint`,
        trailNavigation.session.nextWaypoint.coordinate,
        trailNavigation.session.nextWaypoint.name ?? 'Waypoint',
        'Waypoint ahead',
      );
    }

    if (trailNavigation.session.rejoinPoint) {
      pushMarker(
        `${trailNavigation.session.sessionId ?? 'trail'}-rejoin`,
        trailNavigation.session.rejoinPoint,
        'Rejoin Route',
        trailNavigation.session.rejoinDistanceM != null
          ? `Rejoin in ${formatNavMeters(trailNavigation.session.rejoinDistanceM)}`
          : 'Rejoin point',
      );
    }

    return markers;
  }, [
    trailNavigation.session.nextDecisionPoint,
    trailNavigation.session.nextWaypoint,
    trailNavigation.session.rejoinDistanceM,
    trailNavigation.session.rejoinPoint,
    trailNavigation.session.payload,
    trailNavigation.session.sessionId,
  ]);

  const displayedRoutePoints = useMemo(() => {
    if (
      (trailNavigationActive || pendingHybridTrailTransition) &&
      trailNavigation.session.payload?.trailGeometry &&
      trailNavigation.session.payload.trailGeometry.length > 1
    ) {
      return trailNavigation.session.payload.trailGeometry;
    }
    return roadRoutePoints.length > 1
      ? roadRoutePoints
      : explorePreviewMode
        ? []
        : validatedRunPoints;
  }, [
    explorePreviewMode,
    pendingHybridTrailTransition,
    roadRoutePoints,
    trailNavigation.session.payload,
    trailNavigationActive,
    validatedRunPoints,
  ]);

  const displayedRouteWaypoints = useMemo(() => {
    if (trailNavigationMarkers.length > 0) {
      return [...explorePreviewWaypoints, ...trailNavigationMarkers];
    }
    return explorePreviewWaypoints.length > 0
      ? explorePreviewWaypoints
      : roadRoutePoints.length > 1
        ? roadRouteWaypoints
        : activeRunWaypointList;
  }, [
    activeRunWaypointList,
    explorePreviewWaypoints,
    roadRoutePoints.length,
    roadRouteWaypoints,
    trailNavigationMarkers,
  ]);

  const displayedRouteProgressPoints = useMemo(() => {
    if (pendingHybridTrailTransition) return [];
    if (trailNavigation.session.progressGeometry.length > 1) {
      return trailNavigation.session.progressGeometry;
    }
    return roadRouteProgressPoints.length > 1 ? roadRouteProgressPoints : [];
  }, [
    pendingHybridTrailTransition,
    roadRouteProgressPoints,
    trailNavigation.session.progressGeometry,
  ]);

  const displayedRouteColor = useMemo(() => {
    if (trailNavigationActive || pendingHybridTrailTransition) return '#C49A2C';
    return roadRoutePoints.length > 1 ? '#4F9BFF' : undefined;
  }, [pendingHybridTrailTransition, roadRoutePoints.length, trailNavigationActive]);

  const displayedRouteProgressColor = useMemo(() => {
    if (trailNavigation.session.progressGeometry.length > 1) return '#F2C24D';
    return roadRouteProgressPoints.length > 1 ? '#F2C24D' : undefined;
  }, [roadRouteProgressPoints.length, trailNavigation.session.progressGeometry.length]);

  const displayedSegmentFeatures = useMemo(
    () =>
      roadRoutePoints.length > 1 || explorePreviewMode || trailNavigation.uiMode !== 'idle'
        ? []
        : segmentFeatures,
    [explorePreviewMode, roadRoutePoints.length, segmentFeatures, trailNavigation.uiMode],
  );

  const displayedTrailSegments = useMemo<TrailSegmentData[]>(
    () =>
      trailNavigationActive || pendingHybridTrailTransition
        ? trailSegments
        : explorePreviewTrailSegments.length > 0
          ? [...trailSegments, ...explorePreviewTrailSegments]
          : trailSegments,
    [
      explorePreviewTrailSegments,
      pendingHybridTrailTransition,
      trailNavigationActive,
      trailSegments,
    ],
  );

  const cachedTileRegions = navigateTileCacheSnapshot.regions;
  const tileCacheStats = navigateTileCacheSnapshot.stats;
  const routeCacheRegions = useMemo(
    () =>
      cachedTileRegions.filter(
        (region) =>
          region.downloadedTiles > 0 &&
          (region.status === 'complete' || region.status === 'partial'),
      ),
    [cachedTileRegions],
  );
  const cachedRegionsForView = useMemo(() => {
    if (!mapBounds) return [];
    return routeCacheRegions.filter((region) => tileBoundsIntersect(region.bounds, mapBounds));
  }, [mapBounds, routeCacheRegions]);
  const hasCompleteMapCoverageForView = useMemo(
    () =>
      !!mapBounds &&
      cachedRegionsForView.some(
        (region) =>
          region.status === 'complete' && tileBoundsContain(region.bounds, mapBounds),
      ),
    [cachedRegionsForView, mapBounds],
  );
  const hasCachedMapCoverage =
    cachedRegionsForView.length > 0 || routeCacheRegions.length > 0 || tileCacheStats.totalRegions > 0;
  const hasLocalRoadRouteData = (roadNavigation.session.route?.geometry?.length ?? 0) > 1;
  const hasLocalTrailRouteData =
    (trailSession.payload?.trailGeometry?.length ?? 0) > 1 ||
    explorePreviewTrailSegments.length > 0;
  const hasLocalRouteSupport =
    hasLocalRoadRouteData ||
    hasLocalTrailRouteData ||
    pendingHybridTrailTransition;

  const navigateOperationalState = useMemo<NavigateOperationalState>(() => {
    const liveSearchAvailable =
      !!mapToken &&
      (navigateConnectivity.status === 'online' || !navigateConnectivity.initialized) &&
      (navigateConnectivity.isInternetReachable || !navigateConnectivity.initialized);
    const liveRoutingAvailable =
      !!mapToken &&
      !!roadNavigationCurrentLocation &&
      (navigateConnectivity.status === 'online' || !navigateConnectivity.initialized);
    const connectivitySyncing = navigateConnectivity.status === 'reconnecting';
    const gpsReady = gps.hasFix || !!roadNavigationCurrentLocation;

    if (liveSearchAvailable && navigateConnectivity.level === 'normal') {
      return {
        mode: 'live',
        tone: 'live',
        label: 'ONLINE',
        previewStatusLabel: null,
        activeStatusLabel: null,
        searchLabel: 'ONLINE',
        searchDetail: null,
        activeDetail: 'Live services are available for search, reroutes, and active guidance.',
        previewDetail: 'Live services are available for route building and guidance.',
        liveSearchAvailable,
        liveRoutingAvailable,
        hasRouteSupport: hasLocalRouteSupport,
        hasMapCoverage: true,
      };
    }

    if (connectivitySyncing) {
      return {
        mode: 'syncing',
        tone: 'degraded',
        label: 'SYNCING',
        previewStatusLabel: 'ROUTING SYNCING',
        activeStatusLabel: 'LOCAL GUIDANCE',
        searchLabel: 'SYNCING',
        searchDetail:
          'Signal is recovering. Saved routes and cached maps remain available while live services reconnect.',
        activeDetail:
          'Guidance stays active from local context while ECS reconnects live services.',
        previewDetail:
          'Route planning is waiting on live services. Saved routes and cached maps remain available in the meantime.',
        liveSearchAvailable,
        liveRoutingAvailable,
        hasRouteSupport: hasLocalRouteSupport,
        hasMapCoverage: hasCachedMapCoverage,
      };
    }

    if (
      navigateConnectivity.level === 'limited' ||
      (navigateConnectivity.status === 'online' && !navigateConnectivity.isInternetReachable)
    ) {
      return {
        mode: 'degraded',
        tone: 'degraded',
        label: gpsReady ? 'LIMITED NET' : 'LIMITED',
        previewStatusLabel: 'NETWORK LIMITED',
        activeStatusLabel: gpsReady ? 'LIVE GPS' : 'NETWORK LIMITED',
        searchLabel: gpsReady ? 'NETWORK LIMITED' : 'LIMITED',
        searchDetail: liveSearchAvailable
          ? 'GPS is live. Network service is limited, so search and fresh routing may respond more slowly.'
          : gpsReady
            ? 'GPS is live, but network service is limited. Saved routes and cached maps remain available while signal improves.'
            : 'Live search is unstable. Saved routes and cached maps remain available while signal improves.',
        activeDetail: gpsReady
          ? 'GPS guidance is live. Network-limited conditions may slow search and reroutes until signal recovers.'
          : 'Guidance stays active while live services remain limited. Search and reroutes may respond more slowly.',
        previewDetail: gpsReady
          ? 'GPS is ready. Network-limited conditions may delay fresh route building and reroutes.'
          : 'Route preview remains available, but live routing may take longer while connectivity remains limited.',
        liveSearchAvailable,
        liveRoutingAvailable,
        hasRouteSupport: hasLocalRouteSupport,
        hasMapCoverage: true,
      };
    }

    if (hasLocalRouteSupport) {
      return {
        mode: 'offline_cached_route',
        tone: 'offline',
        label: 'CACHED ROUTE',
        previewStatusLabel: 'OFFLINE READY',
        activeStatusLabel: 'CACHED GUIDANCE',
        searchLabel: 'OFFLINE',
        searchDetail: hasCompleteMapCoverageForView
          ? 'Live search is unavailable. Saved route guidance and cached map coverage remain ready.'
          : 'Live search is unavailable. Saved route guidance remains available with limited cached map coverage.',
        activeDetail:
          'Guidance is continuing from saved route data. Live search and reroutes remain unavailable until signal returns.',
        previewDetail:
          'This route is staged locally and can start offline. Cached map coverage may still be limited.',
        liveSearchAvailable: false,
        liveRoutingAvailable: false,
        hasRouteSupport: true,
        hasMapCoverage: hasCachedMapCoverage,
      };
    }

    if (hasCachedMapCoverage) {
      return {
        mode: 'offline_partial_map',
        tone: 'offline',
        label: 'CACHED MAPS',
        previewStatusLabel: 'MAPS ONLY',
        activeStatusLabel: 'CACHED MAPS',
        searchLabel: 'OFFLINE',
        searchDetail:
          'Live search is unavailable. Cached map regions remain available where coverage exists.',
        activeDetail:
          'Live routing services are offline. Cached map coverage is still available for field reference.',
        previewDetail:
          'This area has cached map coverage, but the current route is not staged locally for offline guidance.',
        liveSearchAvailable: false,
        liveRoutingAvailable: false,
        hasRouteSupport: false,
        hasMapCoverage: true,
      };
    }

    return {
      mode: 'offline_unavailable',
      tone: 'unavailable',
      label: 'OFFLINE',
      previewStatusLabel: 'OFFLINE',
      activeStatusLabel: 'OFFLINE',
      searchLabel: 'OFFLINE',
      searchDetail:
        'Live search and route building require connectivity. Open saved routes or reconnect to continue.',
      activeDetail:
        'Live services are offline and no local route data is staged for continued guidance.',
      previewDetail:
        'This route is not available locally. Reconnect or stage offline assets before starting guidance.',
      liveSearchAvailable: false,
      liveRoutingAvailable: false,
      hasRouteSupport: false,
      hasMapCoverage: false,
    };
  }, [
    hasCachedMapCoverage,
    hasCompleteMapCoverageForView,
    hasLocalRouteSupport,
    mapToken,
    navigateConnectivity.initialized,
    navigateConnectivity.isInternetReachable,
    navigateConnectivity.level,
    navigateConnectivity.status,
    gps.hasFix,
    roadNavigationCurrentLocation,
  ]);

  const searchOperationalState = useMemo(
    () => ({
      disabled: !navigateOperationalState.liveSearchAvailable,
      label: navigateOperationalState.searchLabel,
      detail: navigateOperationalState.searchDetail,
      tone: navigateOperationalState.tone,
    }),
    [navigateOperationalState],
  );
  const toolsMapStyleLabel = mapStyleMode === 'tac' ? 'TAC' : mapStyleMode === 'sat' ? 'SAT' : 'DAY';
  const toolsMapAvailabilityLabel = hasCompleteMapCoverageForView
    ? 'READY'
    : hasCachedMapCoverage
      ? 'PARTIAL'
      : navigateOperationalState.mode === 'offline_cached_route'
        ? 'ROUTE ONLY'
        : navigateOperationalState.mode === 'live' ||
            navigateOperationalState.mode === 'syncing' ||
            navigateOperationalState.mode === 'degraded'
          ? 'LIVE'
          : 'NONE';
  const toolsSpeedLabel =
    gps.position?.speedMph != null && Number.isFinite(Number(gps.position.speedMph))
      ? `${Math.round(Number(gps.position.speedMph))} MPH`
      : gps.hasFix
        ? '0 MPH'
        : 'GPS SEARCH';
  const toolsTriggerMetaLabel =
    navigateOperationalState.mode === 'live'
      ? `${toolsMapStyleLabel} / ${toolsSpeedLabel}`
      : `${toolsMapStyleLabel} / ${navigateOperationalState.label}`;

  const roadNavigationTopOffset = 0;

  const routePreviewVisualMode = navigationOverlayMode === 'preview';
  const routeActiveVisualMode = navigationOverlayMode === 'active';
  const routeArrivedVisualMode = navigationOverlayMode === 'arrived';
  const routeSearchVisualMode = navigationOverlayMode === 'error';
  const topRouteSurfaceVisible =
    routePreviewVisualMode || routeActiveVisualMode || routeArrivedVisualMode;
  const routeSurfaceBottomOffset = LOWER_DOCK_EXCLUSION + PAGE_FRAME_BOTTOM_GAP;
  const routeSurfaceHeight =
    routeActiveVisualMode
      ? ROUTE_SURFACE_HEIGHT_ACTIVE
      : routeArrivedVisualMode
        ? ROUTE_SURFACE_HEIGHT_ARRIVED
        : ROUTE_SURFACE_HEIGHT_PREVIEW;
  const routeStepDrawerBottomOffset = routeSurfaceBottomOffset + routeSurfaceHeight + OVERLAY_GAP;
  const navigateMajorPanelVisible =
    !!activeTopPopup ||
    tiltAlertDetailVisible ||
    weatherAlertDetailVisible ||
    routeWeatherDetailVisible ||
    trailExportVisible ||
    exportModalVisible ||
    snapshotModalVisible;
  const topStatusOverlaysVisible =
    mapOverlayStartupReady &&
    !activeTopPopup &&
    !pinDropMode &&
    !selectedCampIntelId &&
    !roadNavigation.stepListExpanded;
  const floatingToolsVisible = topStatusOverlaysVisible;
  const compassOverlayVisible =
    mapOverlayStartupReady && !activeTopPopup && !pinDropMode && !selectedCampIntelId;
  const pinModeBannerBottom = COMPASS_BOTTOM + COMPASS_SIZE + OVERLAY_GAP;
  const routeBottomRightInset = ACTIVE_GUIDANCE_RIGHT_INSET;
  const campIntelCardBottomOffset = topRouteSurfaceVisible
    ? routeSurfaceBottomOffset + routeSurfaceHeight + OVERLAY_GAP + PAGE_FRAME_BOTTOM_GAP
    : LOWER_DOCK_EXCLUSION + PAGE_FRAME_BOTTOM_GAP + 6;
  const campIntelCardRightInset = ACTIVE_GUIDANCE_RIGHT_INSET;
  const routeIndicatorVisible = topStatusOverlaysVisible;
  const gpsStatusOverlayVisible = mapOverlayStartupReady && !mapLoading && topStatusOverlaysVisible;

  const hideWeatherTopOverlays = true;

  useEffect(() => {
    if (!selectedCampIntelId) return;
    if (navigateMajorPanelVisible || roadNavigation.stepListExpanded || !campIntelVisible) {
      setSelectedCampIntelId(null);
    }
  }, [
    campIntelVisible,
    navigateMajorPanelVisible,
    roadNavigation.stepListExpanded,
    selectedCampIntelId,
  ]);

  useEffect(() => {
    if (!navigateMajorPanelVisible || !roadNavigation.stepListExpanded) return;
    roadNavigation.setStepListExpanded(false);
  }, [
    navigateMajorPanelVisible,
    roadNavigation.setStepListExpanded,
    roadNavigation.stepListExpanded,
  ]);

  useFocusEffect(
    useCallback(() => {
      const onBackPress = () => {
        if (authVisible) {
          setAuthVisible(false);
          return true;
        }
        if (snapshotModalVisible) {
          setSnapshotModalVisible(false);
          return true;
        }
        if (exportModalVisible) {
          setExportModalVisible(false);
          return true;
        }
        if (trailExportVisible) {
          setTrailExportVisible(false);
          return true;
        }
        if (routeWeatherDetailVisible) {
          closeRouteWeatherDetail();
          return true;
        }
        if (weatherAlertDetailVisible) {
          closeWeatherAlertDetail();
          return true;
        }
        if (tiltAlertDetailVisible) {
          closeTiltAlertDetail();
          return true;
        }
        if (activeTopPopup) {
          closeTopPopup();
          return true;
        }
        if (roadNavigation.stepListExpanded) {
          roadNavigation.setStepListExpanded(false);
          return true;
        }
        if (selectedCampIntelId) {
          setSelectedCampIntelId(null);
          return true;
        }
        if (pinDropMode || showCrosshair) {
          setPinDropMode(false);
          setShowCrosshair(false);
          return true;
        }
        if (mapExpanded) {
          collapseMap();
          return true;
        }
        return false;
      };

      const subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress);
      return () => {
        subscription.remove();
      };
    }, [
      activeTopPopup,
      authVisible,
      closeRouteWeatherDetail,
      closeTiltAlertDetail,
      closeTopPopup,
      closeWeatherAlertDetail,
      collapseMap,
      exportModalVisible,
      mapExpanded,
      pinDropMode,
      roadNavigation.stepListExpanded,
      roadNavigation.setStepListExpanded,
      selectedCampIntelId,
      showCrosshair,
      snapshotModalVisible,
      tiltAlertDetailVisible,
      trailExportVisible,
      routeWeatherDetailVisible,
      weatherAlertDetailVisible,
    ]),
  );

  useEffect(() => {
    if (!selectedCampIntelId) return;
    if (!campIntel.getSiteById(selectedCampIntelId)) {
      setSelectedCampIntelId(null);
    }
  }, [campIntel, selectedCampIntelId]);

  useEffect(() => {
    if (previousCampIntelRouteContextRef.current == null) {
      previousCampIntelRouteContextRef.current = campIntelRouteContextSignature;
      return;
    }
    if (previousCampIntelRouteContextRef.current !== campIntelRouteContextSignature) {
      previousCampIntelRouteContextRef.current = campIntelRouteContextSignature;
      setSelectedCampIntelId(null);
      return;
    }
    previousCampIntelRouteContextRef.current = campIntelRouteContextSignature;
  }, [campIntelRouteContextSignature]);

  const roadPreviewEtaIso = useMemo(
    () =>
      roadNavigation.session.route
        ? new Date(Date.now() + roadNavigation.session.route.durationS * 1000).toISOString()
        : null,
    [roadNavigation.session.route],
  );
  const importedPreviewSourceLabel = useMemo(() => {
    if (!exploreNavigationPayload || !activeRun || activeRun.id !== exploreNavigationPayload.id) {
      return null;
    }
    const sourceLabel = getImportedSourceLabel(activeRun.source);
    return sourceLabel === 'IMPORTED' ? null : sourceLabel;
  }, [activeRun, exploreNavigationPayload]);

  const navigationPreviewContext = useMemo(() => {
    const route = roadNavigation.session.route;
    const previewOperationalStatus =
      navigateOperationalState.previewStatusLabel;
    const previewOperationalNote =
      navigateOperationalState.mode === 'live' ? null : navigateOperationalState.previewDetail;
    if (!exploreNavigationPayload || !explorePreviewMode) {
      if (roadNavigation.uiMode !== 'preview' || !roadNavigation.session.destination) return null;

      return {
        tripMode: 'road' as const,
        eyebrow: route ? 'ROUTE READY' : 'ROUTE PREVIEW',
        title: roadNavigation.session.destination.title,
        subtitle: roadNavigation.session.destination.subtitle,
        phaseLabel: roadNavigation.previewLoading ? 'PREPARING' : route ? 'STAGED' : 'SELECTED',
        metrics: [
          { label: 'DIST', value: formatNavMeters(route?.distanceM ?? null) },
          { label: 'TIME', value: formatNavDuration(route?.durationS ?? null) },
          { label: 'ETA', value: formatNavEta(roadPreviewEtaIso) },
        ],
        statusText: roadNavigation.previewLoading
          ? 'Preparing road route'
          : (previewOperationalStatus ??
            roadNavigation.session.error ??
            roadNavigation.session.routeStatusLabel ??
            (route ? 'Road route staged' : 'Destination selected')),
        noteText: previewOperationalNote ??
          (route
            ? 'Route selected. Use overview to confirm the full path before starting navigation.'
            : 'Destination selected. ECS is preparing the route preview.'),
        primaryActionLabel: 'Begin Route',
        primaryActionDisabled: !route || (!navigateOperationalState.liveRoutingAvailable && !navigateOperationalState.hasRouteSupport),
        showSteps: !!route,
        showOverview: !!route,
        overviewLabel: 'Review Route',
        dismissLabel: 'Dismiss',
        stepListLabel: 'View route steps',
        arrivalMessage: 'Visual guidance complete.',
      };
    }

    const trailLengthText = formatNavMiles(explorePreviewTrailLengthMiles);
    const categoryText = safeString(
      exploreNavigationPayload.trailCategory ?? exploreNavigationPayload.routeMetadata?.terrainType,
      'Trail route',
    ).toUpperCase();

    if (explorePreviewMode === 'trail') {
      const hasTrailGeometry = explorePreviewTrailSegments.length > 0;
      return {
        tripMode: 'trail' as const,
        eyebrow: 'TRAIL PREVIEW',
        title: exploreNavigationPayload.title,
        subtitle: exploreNavigationPayload.subtitle,
        sourceLabel: importedPreviewSourceLabel,
        phaseLabel: hasTrailGeometry ? 'STAGED' : 'SELECTED',
        metrics: [
          { label: 'TRIP', value: 'Trail' },
          { label: 'LENGTH', value: trailLengthText },
          { label: 'TYPE', value: categoryText },
        ],
        statusText:
          previewOperationalStatus ?? (hasTrailGeometry ? 'Trail staged' : 'Trail preview unavailable'),
        noteText:
          previewOperationalNote ??
          (hasTrailGeometry
            ? 'Trail route is staged locally. Start navigation when ready for guidance on the map.'
            : 'Destination marker loaded. Trail geometry is not available for this route yet.'),
        primaryActionLabel: hasTrailGeometry
          ? importedPreviewSourceLabel
            ? `Begin ${importedPreviewSourceLabel}`
            : 'Begin Trail'
          : 'Preview Only',
        primaryActionDisabled: !hasTrailGeometry,
        showSteps: false,
        showOverview: hasTrailGeometry,
        overviewLabel: 'Review Trail',
        dismissLabel: 'Dismiss',
        arrivalMessage: 'Expedition route complete.',
      };
    }

    if (explorePreviewMode === 'hybrid') {
      return {
        tripMode: 'hybrid' as const,
        eyebrow: 'HYBRID PREVIEW',
        title: exploreNavigationPayload.title,
        subtitle: exploreNavigationPayload.subtitle,
        sourceLabel: importedPreviewSourceLabel,
        phaseLabel: roadNavigation.previewLoading ? 'PREPARING' : route ? 'STAGED' : 'SELECTED',
        metrics: [
          { label: 'ROAD', value: formatNavMeters(route?.distanceM ?? null) },
          { label: 'ETA', value: formatNavEta(roadPreviewEtaIso) },
          { label: 'TRAIL', value: trailLengthText },
        ],
        statusText:
          roadNavigation.previewLoading
            ? 'Preparing road approach'
            : (previewOperationalStatus ??
              roadNavigation.session.error ??
            'Hybrid route staged'),
        noteText: previewOperationalNote ?? 'Preview the road approach and trail transition before starting hybrid guidance.',
        primaryActionLabel: 'Begin Hybrid',
        primaryActionDisabled: !route || (!navigateOperationalState.liveRoutingAvailable && !navigateOperationalState.hasRouteSupport),
        showSteps: !!route,
        showOverview: true,
        overviewLabel: 'Review Route',
        dismissLabel: 'Dismiss',
        stepListLabel: 'View road steps',
        arrivalMessage: 'Road approach complete. Trail preview remains loaded.',
      };
    }

    return {
      tripMode: 'road' as const,
      eyebrow: 'ROAD PREVIEW',
      title: exploreNavigationPayload.title,
      subtitle: exploreNavigationPayload.subtitle,
      sourceLabel: importedPreviewSourceLabel,
      phaseLabel: roadNavigation.previewLoading ? 'PREPARING' : route ? 'STAGED' : 'SELECTED',
      metrics: [
        { label: 'DIST', value: formatNavMeters(route?.distanceM ?? null) },
        { label: 'TIME', value: formatNavDuration(route?.durationS ?? null) },
        { label: 'ETA', value: formatNavEta(roadPreviewEtaIso) },
      ],
      statusText:
        roadNavigation.previewLoading
          ? 'Preparing road route'
          : (previewOperationalStatus ??
            roadNavigation.session.error ??
            roadNavigation.session.routeStatusLabel ??
            'Road route staged'),
      noteText: previewOperationalNote ??
        (route
          ? 'Route is staged and ready to start. Confirm the overview, then begin navigation when you are ready to move.'
          : 'Preparing route preview.'),
      primaryActionLabel: importedPreviewSourceLabel ? 'Begin Route' : 'Begin Route',
      primaryActionDisabled: !route || (!navigateOperationalState.liveRoutingAvailable && !navigateOperationalState.hasRouteSupport),
      showSteps: !!route,
      showOverview: !!route,
      overviewLabel: 'Review Route',
      dismissLabel: 'Dismiss',
      stepListLabel: 'View route steps',
      arrivalMessage: 'Visual guidance complete.',
    };
  }, [
    exploreNavigationPayload,
    explorePreviewMode,
    explorePreviewTrailLengthMiles,
    explorePreviewTrailSegments.length,
    importedPreviewSourceLabel,
    roadNavigation.previewLoading,
    roadNavigation.session.destination,
    roadNavigation.session.error,
    roadNavigation.session.route,
    roadNavigation.session.routeStatusLabel,
    roadNavigation.uiMode,
    roadPreviewEtaIso,
    navigateOperationalState.hasRouteSupport,
    navigateOperationalState.liveRoutingAvailable,
    navigateOperationalState.mode,
    navigateOperationalState.previewDetail,
    navigateOperationalState.previewStatusLabel,
  ]);
  const toolsSelectedPreviewSummary = useMemo(() => {
    if (navigationOverlayMode !== 'preview' || !navigationPreviewContext) return null;
    return {
      tripLabel:
        navigationPreviewContext.sourceLabel ??
        navigationPreviewContext.tripMode.toUpperCase(),
      phaseLabel: navigationPreviewContext.phaseLabel ?? 'SELECTED',
      title: navigationPreviewContext.title,
      subtitle: navigationPreviewContext.subtitle ?? null,
      actionLabel: navigationPreviewContext.primaryActionLabel ?? 'Begin Route',
    };
  }, [navigationOverlayMode, navigationPreviewContext]);

  const navigationActiveContext = useMemo(() => {
    const roadRouteActive = roadNavigation.uiMode === 'active';
    const trailRouteActive =
      trailNavigation.uiMode === 'active' || trailNavigation.uiMode === 'arrived';
    const activeOperationalStatus =
      navigateOperationalState.activeStatusLabel;
    const activeOperationalNote =
      navigateOperationalState.mode === 'live' ? null : navigateOperationalState.activeDetail;

    if (!pendingHybridTrailTransition && !trailRouteActive && !roadRouteActive) {
      return null;
    }

    if (!pendingHybridTrailTransition && !trailRouteActive && roadRouteActive) {
      const routeDistance = roadNavigation.session.route?.distanceM ?? null;
      const remainingDistance = roadNavigation.session.remainingDistanceM;
      const roadConfidence = roadNavigation.session.routeConfidenceState;
      const routeUpdating = roadConfidence === 'rerouting';
      const routeDeviation =
        roadConfidence === 'temporary_deviation' || roadConfidence === 'off_route';
      const routeLowConfidence = roadConfidence === 'low_confidence';
      const routeRejoined = roadConfidence === 'rejoined';
      const routeApproaching = roadConfidence === 'approaching';
      const progressRatio =
        routeDistance != null &&
        routeDistance > 0 &&
        remainingDistance != null
          ? Math.max(0, Math.min(1, 1 - remainingDistance / routeDistance))
          : null;

      return {
        tripMode: 'road' as const,
        eyebrow: routeUpdating
          ? 'REROUTING'
          : routeApproaching
            ? 'FINAL APPROACH'
            : routeRejoined
              ? 'ROUTE REJOINED'
              : routeDeviation
                ? 'ROUTE UPDATE'
                : routeLowConfidence
                  ? 'TRACKING'
                  : 'ACTIVE GUIDANCE',
        title: roadNavigation.session.destination?.title ?? 'Route Active',
        subtitle:
          roadNavigation.session.destination?.subtitle ??
          (routeUpdating
            ? 'Refreshing route guidance'
            : routeApproaching
              ? 'Destination close ahead'
              : routeRejoined
                ? 'Confidence restored'
                : routeDeviation
                  ? 'Guiding back toward route'
                  : routeLowConfidence
                    ? 'Holding route confidence'
                    : 'Road route in progress'),
        instruction:
          routeUpdating
            ? 'Updating route guidance'
            : roadNavigation.session.nextInstruction ?? 'Continue on highlighted route',
        distanceLabel: routeUpdating
          ? 'UPDATING'
          : formatNavMeters(roadNavigation.session.nextInstructionDistanceM),
        statusText: joinOperationalStatus(
          roadNavigation.session.routeStatusLabel ?? 'Route active',
          activeOperationalStatus,
        ),
        metrics: [
          {
            label: 'REMAIN',
            value: routeUpdating
              ? 'UPDATING'
              : formatNavMeters(roadNavigation.session.remainingDistanceM),
          },
          {
            label: 'ETA',
            value: routeUpdating ? '--' : formatNavEta(roadNavigation.session.etaIso),
          },
          {
            label: 'TIME',
            value: routeUpdating
              ? '--'
              : formatNavDuration(roadNavigation.session.remainingDurationS),
          },
        ],
        progressLabel:
          routeApproaching
            ? 'FINAL APPROACH'
            : routeRejoined
              ? 'REJOINED'
              : progressRatio != null
                ? `${Math.round(progressRatio * 100)}% COMPLETE`
                : null,
        noteText:
          activeOperationalNote ??
          (routeUpdating
            ? 'ECS is recalculating the road route while guidance stays active on the map.'
            : routeDeviation && !liveNavigateServicesEnabled
              ? 'Live reroute is unavailable. Follow the highlighted route back toward the planned path.'
              : routeDeviation
                ? 'A meaningful deviation was detected. ECS is holding route context while guidance adapts.'
                : routeLowConfidence
                  ? 'GPS confidence is fluctuating. ECS is holding the current route until position stabilizes.'
                  : routeRejoined
                    ? 'Route confidence restored. Normal guidance is back on track.'
                    : routeApproaching
                      ? 'Final approach underway. Follow the highlighted route to completion.'
                      : 'Active road guidance is running. Follow the highlighted route and use overview if you need wider context.'),
        showSteps: true,
        showOverview: true,
        showReroute:
          liveNavigateServicesEnabled && (routeDeviation || routeUpdating),
        overviewLabel: 'Overview',
        rerouteLabel: 'Reroute',
        endLabel: 'End Navigation',
        arrivalMessage: 'Destination reached.',
      };
    }

    const payload = trailNavigation.session.payload ?? exploreNavigationPayload;
    const tripMode: 'trail' | 'hybrid' =
      payload?.tripMode === 'hybrid' || pendingHybridTrailTransition ? 'hybrid' : 'trail';
    const progressValue =
      trailNavigation.session.progressPercent != null
        ? `${Math.round(trailNavigation.session.progressPercent)}%`
        : '--';
    const nextDistanceValue =
      trailNavigation.session.nextInstructionDistanceM != null
        ? formatNavMeters(trailNavigation.session.nextInstructionDistanceM)
        : '--';

    if (pendingHybridTrailTransition) {
      return {
        tripMode,
        eyebrow: 'ENTERING TRAIL GUIDANCE',
        title: payload?.title ?? 'Trail guidance',
        subtitle: payload?.subtitle ?? 'Road segment complete',
        instruction: 'Entering trail guidance',
        distanceLabel: 'NOW',
        statusText: joinOperationalStatus('Road segment complete', activeOperationalStatus),
        metrics: [
          { label: 'TRIP', value: 'Hybrid' },
          { label: 'TRAIL', value: formatNavMiles(explorePreviewTrailLengthMiles) },
          { label: 'STATUS', value: 'Transition' },
        ],
        progressLabel: 'TRANSITION',
        noteText: activeOperationalNote ?? 'Switching from road maneuvers to trail guidance.',
        showSteps: false,
        showOverview: true,
        showReroute: false,
        overviewLabel: 'Overview',
        rerouteLabel: 'Center',
        endLabel: 'End Navigation',
        arrivalMessage: 'Trail guidance ready.',
      };
    }

    const offTrail = trailNavigation.session.status === 'off_trail';
    const rejoining = trailNavigation.session.status === 'rejoining_trail';
    const arrived =
      trailNavigation.session.status === 'arrived_trail_destination' ||
      trailNavigation.session.status === 'arrived_final_destination' ||
      trailNavigation.uiMode === 'arrived';

    return {
      tripMode,
      eyebrow: offTrail
        ? 'OFF TRAIL'
        : rejoining
          ? 'REJOINING'
          : tripMode === 'hybrid'
            ? 'HYBRID GUIDANCE'
            : 'TRAIL GUIDANCE',
      title: payload?.title ?? 'Trail guidance',
      subtitle:
        payload?.subtitle ??
        (tripMode === 'hybrid' ? 'Road approach complete' : 'Trail route active'),
      instruction:
        trailNavigation.session.promptTitle ??
        (arrived ? 'Trail route complete' : 'Stay on highlighted route'),
      distanceLabel: offTrail
        ? formatNavMeters(trailNavigation.session.rejoinDistanceM)
        : nextDistanceValue,
      statusText: joinOperationalStatus(
        trailNavigation.session.routeStatusLabel ??
          (arrived ? 'Arrived' : 'Trail active'),
        activeOperationalStatus,
      ),
      metrics: [
        { label: 'REMAIN', value: formatNavMeters(trailNavigation.session.remainingDistanceM) },
        { label: 'NEXT', value: offTrail ? formatNavMeters(trailNavigation.session.rejoinDistanceM) : nextDistanceValue },
        { label: 'PROGRESS', value: progressValue },
      ],
      progressLabel: progressValue !== '--' ? `${progressValue} COMPLETE` : null,
      noteText:
        activeOperationalNote ??
        trailNavigation.session.promptDetail ??
        (arrived ? 'Trail route complete.' : 'Stay on highlighted route.'),
      showSteps: false,
      showOverview: true,
      showReroute: offTrail || rejoining,
      overviewLabel: 'Overview',
      rerouteLabel: offTrail || rejoining ? 'Rejoin' : 'Center',
      endLabel: 'End Navigation',
      arrivalMessage:
        tripMode === 'hybrid'
          ? 'Hybrid trip complete.'
          : 'Trail route complete.',
    };
  }, [
    exploreNavigationPayload,
    explorePreviewTrailLengthMiles,
    pendingHybridTrailTransition,
    roadNavigation.session.destination?.subtitle,
    roadNavigation.session.destination?.title,
    roadNavigation.session.etaIso,
    roadNavigation.session.nextInstruction,
    roadNavigation.session.nextInstructionDistanceM,
    roadNavigation.session.remainingDistanceM,
    roadNavigation.session.remainingDurationS,
    roadNavigation.session.route?.distanceM,
    roadNavigation.session.routeConfidenceState,
    roadNavigation.session.routeStatusLabel,
    roadNavigation.uiMode,
    liveNavigateServicesEnabled,
    navigateOperationalState.activeDetail,
    navigateOperationalState.activeStatusLabel,
    navigateOperationalState.mode,
    trailNavigation.session.nextInstructionDistanceM,
    trailNavigation.session.payload,
    trailNavigation.session.progressPercent,
    trailNavigation.session.promptDetail,
    trailNavigation.session.promptTitle,
    trailNavigation.session.remainingDistanceM,
    trailNavigation.session.rejoinDistanceM,
    trailNavigation.session.routeStatusLabel,
    trailNavigation.session.status,
    trailNavigation.uiMode,
  ]);

  const navigateCommandState = useMemo(() => (
    selectNavigateCommandState({
      navigateView,
      overlayMode: navigationOverlayMode,
      previewContext: navigationPreviewContext,
      activeContext: navigationActiveContext,
      operationalLabel: navigateOperationalState.label,
      operationalDetail:
        navigationOverlayMode === 'active' || navigationOverlayMode === 'arrived'
          ? navigateOperationalState.activeDetail
          : navigateOperationalState.previewDetail,
      operationalState: aiState?.operationalState,
      phase: aiState?.expeditionPhase,
      liveStatus,
      weatherSeveritySummary,
      gpsHasFix: gps.hasFix,
      gpsPermissionDenied: gps.permissionDenied,
      liveServicesEnabled: liveNavigateServicesEnabled,
    })
  ), [
    aiState?.expeditionPhase,
    aiState?.operationalState,
    gps.hasFix,
    gps.permissionDenied,
    liveStatus,
    liveNavigateServicesEnabled,
    navigateOperationalState.activeDetail,
    navigateOperationalState.label,
    navigateOperationalState.previewDetail,
    navigateView,
    navigationActiveContext,
    navigationOverlayMode,
    navigationPreviewContext,
    weatherSeveritySummary,
  ]);

  const navigateHeaderGuidance = useMemo(() => {
    if (navigateCommandState.headerGuidance) {
      return navigateCommandState.headerGuidance;
    }

    if (aiAssistBanner) {
      return {
        eyebrow: 'ECS UPDATE',
        title: aiAssistBanner.title,
        detail: aiAssistBanner.message,
        tone: 'warning' as const,
      };
    }

    if (false && navigationOverlayMode !== 'active' && navigationPreviewContext) {
      return {
        eyebrow: navigationPreviewContext.eyebrow,
        title: navigationPreviewContext.title,
        detail: navigationPreviewContext.statusText, /*
          .join(' â€¢ '),
        */ tone: 'ready' as const,
      };
    }

    if (false && navigationPreviewContext) {
      return {
        eyebrow: navigationPreviewContext.eyebrow,
        title: navigationPreviewContext.title,
        detail: navigationPreviewContext.statusText,
        tone: 'ready' as const,
      };
    }

    return null;
  }, [aiAssistBanner, navigateCommandState.headerGuidance, navigationOverlayMode, navigationPreviewContext]);

  const fitMapToRoadRoute = useCallback((padding = 52) => {
    const bounds = roadNavigation.session.route?.bounds;
    if (!bounds) return;

    queueMapCameraCommand({
      mode: 'route_overview',
      fitBounds: {
        north: bounds.north,
        south: bounds.south,
        east: bounds.east,
        west: bounds.west,
        padding,
        maxZoom: 15,
      },
      durationMs: 650,
      animate: true,
      reason: 'road_navigation_preview',
    });
    setFollowUser(false);
  }, [queueMapCameraCommand, roadNavigation.session.route?.bounds]);

  const handleRouteOverview = useCallback(() => {
    hapticMicro();

    const roadBounds =
      !trailNavigationActive && !pendingHybridTrailTransition
        ? roadNavigation.session.route?.bounds
        : null;

    if (roadBounds) {
      queueMapCameraCommand({
        mode: 'route_overview',
        fitBounds: {
          north: roadBounds.north,
          south: roadBounds.south,
          east: roadBounds.east,
          west: roadBounds.west,
          padding: routeActiveVisualMode ? 82 : 72,
          maxZoom: 15,
        },
        durationMs: 650,
        animate: true,
        reason: 'active_route_overview',
      }, { force: true });
      setFollowUser(false);
      return;
    }

    if (displayedRoutePoints.length > 0) {
      const bounds = displayedRoutePoints.reduce(
        (acc, point) => ({
          north: Math.max(acc.north, point.lat),
          south: Math.min(acc.south, point.lat),
          east: Math.max(acc.east, point.lng),
          west: Math.min(acc.west, point.lng),
        }),
        {
          north: displayedRoutePoints[0].lat,
          south: displayedRoutePoints[0].lat,
          east: displayedRoutePoints[0].lng,
          west: displayedRoutePoints[0].lng,
        },
      );

      queueMapCameraCommand({
        mode: 'route_overview',
        fitBounds: {
          ...bounds,
          padding: routeActiveVisualMode ? 82 : 72,
          maxZoom: 15,
        },
        durationMs: 700,
        animate: true,
        reason: 'active_route_overview',
      }, { force: true });
      setFollowUser(false);
      return;
    }

    handleRecenter();
  }, [
    displayedRoutePoints,
    handleRecenter,
    pendingHybridTrailTransition,
    queueMapCameraCommand,
    roadNavigation.session.route?.bounds,
    routeActiveVisualMode,
    trailNavigationActive,
  ]);

  useEffect(() => {
    if (roadNavigation.session.status === 'route_preview' && roadNavigation.session.route) {
      fitMapToRoadRoute();
    }
  }, [fitMapToRoadRoute, roadNavigation.session.route, roadNavigation.session.status]);

  useEffect(() => {
    if (!exploreNavigationPayload || explorePreviewMode !== 'road') return;
    if (roadNavigation.session.route) return;

    fitMapToCoordinatePreview(
      getRoadDestinationCoordinate(exploreNavigationPayload),
      84,
      'explore_road_preview',
    );
  }, [
    exploreNavigationPayload,
    explorePreviewMode,
    fitMapToCoordinatePreview,
    roadNavigation.session.route,
  ]);

  useEffect(() => {
    if (!exploreNavigationPayload) return;
    if (
      explorePreviewMode !== 'trail' &&
      !(explorePreviewMode === 'hybrid' && explorePreviewTrailSegments.length > 0)
    ) {
      return;
    }

    const geometryPoints =
      explorePreviewTrailSegments.length > 0
        ? exploreNavigationPayload.trailGeometry
        : [];
    const roadCoordinate = getRoadDestinationCoordinate(exploreNavigationPayload);
    const previewPoints = [
      ...geometryPoints,
      ...(roadCoordinate ? [roadCoordinate] : []),
    ];
    const roadBounds = roadNavigation.session.route?.bounds;
    if (roadBounds && explorePreviewMode === 'hybrid') {
      previewPoints.push(
        { lat: roadBounds.north, lng: roadBounds.east },
        { lat: roadBounds.south, lng: roadBounds.west },
      );
    }

    if (previewPoints.length === 0) {
      fitMapToCoordinatePreview(exploreNavigationPayload.coordinate, 84, 'explore_preview');
      return;
    }

    const bounds = previewPoints.reduce(
      (acc, point) => ({
        north: Math.max(acc.north, point.lat),
        south: Math.min(acc.south, point.lat),
        east: Math.max(acc.east, point.lng),
        west: Math.min(acc.west, point.lng),
      }),
      {
        north: previewPoints[0].lat,
        south: previewPoints[0].lat,
        east: previewPoints[0].lng,
        west: previewPoints[0].lng,
      },
    );

    queueMapCameraCommand({
      mode: 'route_overview',
      fitBounds: {
        ...bounds,
        padding: 72,
        maxZoom: 14,
      },
      durationMs: 700,
      animate: true,
      reason: 'explore_hybrid_preview',
    });
    setFollowUser(false);
  }, [
    exploreNavigationPayload,
    explorePreviewMode,
    explorePreviewTrailSegments.length,
    fitMapToCoordinatePreview,
    queueMapCameraCommand,
    roadNavigation.session.route?.bounds,
  ]);


    // â”€â”€ Trail recording integration â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const refreshTrailState = useCallback(() => {
    const nextStatus = trailStore.getStatus();
    const nextStats = trailStore.getStats();
    const nextSegments = toTrailSegmentData(trailStore.getTrailSegmentCoordinates());
    const nextSignature = JSON.stringify({
      status: nextStatus,
      stats: {
        distance_miles: nextStats.distance_miles,
        elapsed_seconds: nextStats.elapsed_seconds,
        avg_speed_mph: nextStats.avg_speed_mph,
        max_speed_mph: nextStats.max_speed_mph,
      },
      segments: nextSegments.map((segment) => ({
        id: segment.id,
        pointCount: Array.isArray(segment.coordinates) ? segment.coordinates.length : 0,
        color: segment.color,
      })),
    });

    if (lastTrailStateSignatureRef.current === nextSignature) {
      return;
    }
    lastTrailStateSignatureRef.current = nextSignature;

    setTrailStatus((prev) => (prev === nextStatus ? prev : nextStatus));
    setTrailStats((prev) =>
      prev &&
      prev.distance_miles === nextStats.distance_miles &&
      prev.elapsed_seconds === nextStats.elapsed_seconds &&
      prev.avg_speed_mph === nextStats.avg_speed_mph &&
      prev.max_speed_mph === nextStats.max_speed_mph
        ? prev
        : nextStats,
    );
    setTrailSegments((prev) => (sameTrailSegments(prev, nextSegments) ? prev : nextSegments));
    setTrailHistoryRefreshKey((k) => k + 1);
  }, []);

useEffect(() => {
  trailStore.recover();
  refreshTrailState();
  try { trailHistoryStore.autoCleanup(); } catch {}
}, [refreshTrailState]);

// GPS-based trail recording
useEffect(() => {
  if (!followUser || Platform.OS !== 'web') return;
  if (!navigator.geolocation) return;

  const watchId = navigator.geolocation.watchPosition(
    (pos) => {
      const { latitude, longitude, altitude, heading: gpsHeading, speed: gpsSpeed } = pos.coords;
      const speedMph = (gpsSpeed != null && gpsSpeed >= 0) ? gpsSpeed * 2.237 : 0;
      const result = trailStore.checkMovement(speedMph, activeExpeditionId);

      if (result === 'started') showToast('TRAIL RECORDING STARTED');
      else if (result === 'paused') showToast('TRAIL AUTO-PAUSED (STATIONARY)');

      const recorded = trailStore.recordPoint({
        lat: latitude,
        lng: longitude,
        elevation: altitude != null ? altitude : null,
        speed: speedMph,
        heading: gpsHeading != null && gpsHeading >= 0 ? gpsHeading : null,
      });

      if (recorded || result) refreshTrailState();
    },
    () => {},
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 2000 }
  );

  return () => navigator.geolocation.clearWatch(watchId);
}, [followUser, activeExpeditionId, showToast, refreshTrailState]);

  // Periodic stats refresh
  useEffect(() => {
    if (trailStatus === 'recording') {
      trailUpdateTimer.current = setInterval(() => {
        refreshTrailState();
      }, 2000);
      return () => clearInterval(trailUpdateTimer.current);
    } else {
      if (trailUpdateTimer.current) clearInterval(trailUpdateTimer.current);
    }
  }, [trailStatus, refreshTrailState]);

  // Trail export handler
  const handleTrailExport = useCallback(() => {
    closeTopPopup();
    setTrailExportVisible(true);
  }, [closeTopPopup]);

  const handleTrailExportAction = useCallback((format: 'gpx' | 'json' | 'coords') => {
    let content = '';
    const expeditionPins = activeExpeditionId ? pinStore.getByExpedition(activeExpeditionId) : [];
    switch (format) {
      case 'gpx': content = trailStore.exportToGPX(expeditionPins, activeExpeditionName || 'ECS Trail'); break;
      case 'json': content = trailStore.exportToJSON(); break;
      case 'coords': content = trailStore.exportCoordinatesList(); break;
    }
    if (Platform.OS === 'web' && navigator.clipboard) {
      navigator.clipboard.writeText(content).then(() => {
        showToast(`TRAIL ${format.toUpperCase()} COPIED TO CLIPBOARD`);
      }).catch(() => showToast('COPY FAILED'));
    } else {
      showToast(`TRAIL EXPORTED AS ${format.toUpperCase()}`);
    }
    setTrailExportVisible(false);
  }, [activeExpeditionId, activeExpeditionName, showToast]);

  // â”€â”€ Trail replay handlers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const currentReplayPoint = useMemo<TrailReplayPoint | null>(() => {
    if (!isReplayActive || !replayAnalytics) return null;
    if (replayFromHistory) return trailStore.getReplayPointFromAnalytics(replayAnalytics, replayCurrentSeconds);
    return trailStore.getReplayPointAtTime(replayCurrentSeconds);
  }, [isReplayActive, replayAnalytics, replayCurrentSeconds, replayFromHistory]);

  const replayTotalSeconds = useMemo(() => {
    if (!replayAnalytics || replayAnalytics.replay_data.length === 0) return 0;
    return replayAnalytics.replay_data[replayAnalytics.replay_data.length - 1].elapsed_seconds;
  }, [replayAnalytics]);

  const handleReplayStart = useCallback(() => {
    hapticCommand();
    const analytics = trailStore.getAnalytics();
    if (!analytics || analytics.replay_data.length < 2) {
      showToast('NOT ENOUGH TRAIL DATA FOR REPLAY');
      return;
    }
    setReplayFromHistory(false);
    setReplayHistoryTrailSegments([]);
    setReplayAnalytics(analytics);
    setReplayCurrentSeconds(0);
    setReplayPlaying(false);
    setReplaySpeed(1);
    setIsReplayActive(true);
    const firstPoint = analytics.replay_data[0];
    setReplayMarkerPos({ lat: firstPoint.lat, lng: firstPoint.lng });
    showToast('REPLAY MODE ACTIVATED');
  }, [showToast]);

  const handleReplayPlay = useCallback(() => { hapticMicro(); setReplayPlaying(true); }, []);
  const handleReplayPause = useCallback(() => { hapticMicro(); setReplayPlaying(false); }, []);

  const handleReplaySeek = useCallback((seconds: number) => {
    setReplayCurrentSeconds(seconds);
    if (replayFromHistory && replayAnalytics) {
      const point = trailStore.getReplayPointFromAnalytics(replayAnalytics, seconds);
      if (point) setReplayMarkerPos({ lat: point.lat, lng: point.lng });
    } else {
      const point = trailStore.getReplayPointAtTime(seconds);
      if (point) setReplayMarkerPos({ lat: point.lat, lng: point.lng });
    }
  }, [replayFromHistory, replayAnalytics]);

  const handleReplaySpeedChange = useCallback((speed: ReplaySpeed) => { setReplaySpeed(speed); }, []);

  const handleReplayExit = useCallback(() => {
    hapticMicro();
    setIsReplayActive(false);
    setReplayPlaying(false);
    setReplayCurrentSeconds(0);
    setReplayMarkerPos(null);
    setReplayAnalytics(null);
    setReplayFromHistory(false);
    setReplayHistoryTrailSegments([]);
    if (replayTimerRef.current) { clearInterval(replayTimerRef.current); replayTimerRef.current = null; }
    showToast('REPLAY MODE EXITED');
  }, [showToast]);

  // Replay playback timer
  useEffect(() => {
    if (isReplayActive && replayPlaying && replayAnalytics) {
      const totalSec = replayAnalytics.replay_data.length > 0
        ? replayAnalytics.replay_data[replayAnalytics.replay_data.length - 1].elapsed_seconds : 0;
      replayTimerRef.current = setInterval(() => {
        setReplayCurrentSeconds(prev => {
          const next = prev + replaySpeed;
          if (next >= totalSec) { setReplayPlaying(false); return totalSec; }
          return next;
        });
      }, 1000);
      return () => { if (replayTimerRef.current) { clearInterval(replayTimerRef.current); replayTimerRef.current = null; } };
    } else {
      if (replayTimerRef.current) { clearInterval(replayTimerRef.current); replayTimerRef.current = null; }
    }
  }, [isReplayActive, replayPlaying, replaySpeed, replayAnalytics]);

  // Update replay marker
  useEffect(() => {
    if (!isReplayActive || !replayAnalytics) return;
    if (replayFromHistory) {
      const point = trailStore.getReplayPointFromAnalytics(replayAnalytics, replayCurrentSeconds);
      if (point) setReplayMarkerPos({ lat: point.lat, lng: point.lng });
    } else {
      const point = trailStore.getReplayPointAtTime(replayCurrentSeconds);
      if (point) setReplayMarkerPos({ lat: point.lat, lng: point.lng });
    }
  }, [replayCurrentSeconds, isReplayActive, replayAnalytics, replayFromHistory]);

  // â”€â”€ Trail history handlers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const handleReplayFromHistory = useCallback((trailId: string) => {
    hapticCommand();
    const data = trailHistoryStore.getReplayData(trailId);
    if (!data || data.analytics.replay_data.length < 2) {
      showToast('NOT ENOUGH DATA TO REPLAY THIS TRAIL');
      return;
    }
    const segMap = new Map<string, [number, number][]>();
    for (const p of data.points) {
      if (!segMap.has(p.segment_id)) segMap.set(p.segment_id, []);
      segMap.get(p.segment_id)!.push([p.lng, p.lat]);
    }
    const historySegs: TrailSegmentData[] = [];
    for (const [segId, coords] of segMap) {
      historySegs.push({ id: segId, coordinates: coords });
    }
    setReplayHistoryTrailSegments(historySegs);
    setReplayFromHistory(true);
    setReplayAnalytics(data.analytics);
    setReplayCurrentSeconds(0);
    setReplayPlaying(false);
    setReplaySpeed(1);
    setIsReplayActive(true);
    const firstPoint = data.analytics.replay_data[0];
    setReplayMarkerPos({ lat: firstPoint.lat, lng: firstPoint.lng });
    showToast('REPLAYING SAVED TRAIL');
  }, [showToast]);

  const handleExportFromHistory = useCallback((trailId: string, format: 'gpx' | 'json') => {
    let content: string | null = null;
    if (format === 'gpx') content = trailHistoryStore.exportTrailAsGPX(trailId);
    else content = trailHistoryStore.exportTrailAsJSON(trailId);
    if (!content) { showToast('EXPORT FAILED'); return; }
    if (Platform.OS === 'web' && navigator.clipboard) {
      navigator.clipboard.writeText(content).then(() => {
        showToast(`TRAIL ${format.toUpperCase()} COPIED TO CLIPBOARD`);
      }).catch(() => showToast('COPY FAILED'));
    } else {
      showToast(`TRAIL EXPORTED AS ${format.toUpperCase()}`);
    }
  }, [showToast]);

  const effectiveTrailSegments = replayFromHistory ? replayHistoryTrailSegments : trailSegments;

  // â”€â”€ Speed bucket segments for heatmap rendering â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const speedBucketSegments: SpeedSegmentData[] = useMemo(() => {
    if (trailStyle !== 'speed') return [];
    try {
      return trailStore.getSpeedBucketSegments() as SpeedSegmentData[];
    } catch { return []; }
  }, [trailStyle]);

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// MapRenderer stability layer (prevents re-render storms)
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const mapWaypoints = useMemo(
  () => activeRun?.waypoints || [],
  [activeRun?.waypoints]
);

const mapSegments = useMemo(
  () => segmentFeatures || [],
  [segmentFeatures]
);

const mapBailoutMarkers = useMemo(
  () => bailoutMarkers || [],
  [bailoutMarkers]
);

const mapPinMarkers = useMemo(
  () => filteredPinMarkers || [],
  [filteredPinMarkers]
);

const mapTrailSegments = useMemo(
  () => trailSegments || [],
  [trailSegments]
);

const mapSpeedSegments = useMemo(
  () => speedBucketSegments || [],
  [speedBucketSegments]
);

const mapHealthLevel = useMemo(
  () => activeHealth?.overall || 'green',
  [activeHealth?.overall]
);

const mapFollowReplay = useMemo(
  () => isReplayActive && replayPlaying,
  [isReplayActive, replayPlaying]
);

const mapTrailActive = useMemo(
  () => trailStatus === 'recording',
  [trailStatus]
);

const replayOverlayTop = MAP_TOP_CONTROL_ROW + FLOATING_PILL_HEIGHT + OVERLAY_GAP;
const showInlineIntelPanel = false;
const toolsPopupVisible = mapOverlayStartupReady && activeTopPopup === 'tools';
const endNavigationControlVisible =
  floatingToolsVisible &&
  !toolsPopupVisible &&
  navigationOverlayMode === 'active';
const showIntelPopup = intelOpen && isMapUIReady;
const activeImportedRoute = routeStore.getActive();

function getImportedSourceLabel(source: string | null | undefined) {
  const normalized = String(source ?? '').toLowerCase();
  if (normalized === 'gpx') return 'GPX';
  if (normalized === 'kml' || normalized === 'kmz') return 'KML';
  if (normalized === 'geojson' || normalized === 'json') return 'GEOJSON';
  if (normalized === 'fit') return 'FIT';
  return 'IMPORTED';
}

const mapRouteIndicator = useMemo(() => {
  const importedRunSource = getImportedSourceLabel(activeRun?.source);
  const importedRouteSource = getImportedSourceLabel(activeImportedRoute?.source_format);

  if (trailNavigationActive) {
    const trailIndicatorTitle =
      trailNavigation.session.payload?.tripMode === 'hybrid' ? 'HYBRID' : 'TRAIL';
    return {
      title: trailIndicatorTitle,
      state: 'ACTIVE',
      icon: 'trail-sign-outline' as const,
      onPress: () => toggleTopPopup('trail'),
    };
  }

  if (pendingHybridTrailTransition) {
    return {
      title: 'HYBRID',
      state: 'TRANSITION',
      icon: 'trail-sign-outline' as const,
      onPress: () => toggleTopPopup('trail'),
    };
  }

  if (roadNavigationActive) {
    const roadRouteState =
      roadNavigation.session.status === 'rerouting' || roadNavigation.session.isOffRoute
        ? 'UPDATING'
        : 'ACTIVE';
    return {
      title: 'ROUTE',
      state: roadRouteState,
      icon: 'navigate-outline' as const,
      onPress: () => handleRouteOverview(),
    };
  }

  if (navigationOverlayMode === 'preview') {
    const previewTripMode = navigationPreviewContext?.tripMode ?? 'road';
    return {
      title:
        previewTripMode === 'trail'
          ? 'TRAIL'
          : previewTripMode === 'hybrid'
            ? 'HYBRID'
            : 'ROUTE',
      state: navigationPreviewContext?.phaseLabel ?? 'PREVIEW',
      icon:
        previewTripMode === 'trail'
          ? ('trail-sign-outline' as const)
          : ('navigate-outline' as const),
      onPress: () => handleRouteOverview(),
    };
  }

  if (activeRun) {
    const isImportedRun =
      activeRun.source === 'gpx' ||
      activeRun.source === 'kml' ||
      activeRun.source === 'kmz' ||
      activeRun.source === 'geojson' ||
      activeRun.source === 'fit' ||
      activeRun.source === 'import';
    return {
      title: isImportedRun ? importedRunSource : 'TRAIL',
      state: 'STAGED',
      icon: isImportedRun ? ('download-outline' as const) : ('trail-sign-outline' as const),
      onPress: () =>
        router.push({ pathname: '/navigate-run', params: { runId: activeRun.id } } as any),
    };
  }

  if (activeImportedRoute) {
    return {
      title: importedRouteSource,
      state: 'STAGED',
      icon: 'download-outline' as const,
      onPress: () => handleRouteOverview(),
    };
  }

  if (navigateCommandState.indicator) {
    return {
      title: navigateCommandState.indicator.label,
      state: null,
      icon: navigateCommandState.indicator.icon,
      onPress: () => {
        switch (navigateCommandState.indicator?.action) {
          case 'weather':
            openRouteWeatherDetail();
            break;
          case 'gps':
            handleGpsRetry();
            break;
          case 'offline_cache':
            hapticCommand();
            setRequestBoundsTrigger(prev => prev + 1);
            openTopPopup('offlineCache');
            break;
          case 'intel':
            openTopPopup('intel');
            break;
          case 'route_overview':
          default:
            handleRouteOverview();
            break;
        }
      },
    };
  }

  return null;
}, [
  activeImportedRoute,
  activeRun,
  handleGpsRetry,
  handleRouteOverview,
  navigateCommandState.indicator,
  navigationPreviewContext?.phaseLabel,
  navigationPreviewContext?.tripMode,
  navigationOverlayMode,
  openRouteWeatherDetail,
  openTopPopup,
  pendingHybridTrailTransition,
  roadNavigation.session.isOffRoute,
  roadNavigation.session.status,
  roadNavigationActive,
  router,
  setRequestBoundsTrigger,
  toggleTopPopup,
  trailNavigationActive,
]);
const primaryCampSuggestion = campIntelSites[0] ?? null;
const intelStatusMeta =
  expeditionForecast?.status === 'WARNING'
    ? { label: 'WARNING', color: '#EF5350' }
    : expeditionForecast?.status === 'CAUTION'
      ? { label: 'CAUTION', color: '#FFB300' }
      : { label: routeIntelligence ? 'INTEL READY' : 'ROUTE REQUIRED', color: routeIntelligence ? '#66BB6A' : TACTICAL.textMuted };
const intelHeroTitle =
  visibleMissionBrief?.headline ??
  expeditionForecast?.brief ??
  (routeIntelligence
    ? `Route intelligence ready for ${routeIntelligence.routeName}.`
    : ECS_STATE_COPY.navigate.noRouteSelected.message);
const intelHeroBody =
  visibleMissionBrief?.summary ??
  (routeIntelligence
    ? 'Review route, terrain, and resource readiness here before committing to the next leg.'
    : 'Intel populates once a route or trail is active, keeping the summary focused and quick to read.');

const handleMapBoundsReply = useCallback((reply: any) => {
  if (!reply) return;

  const nextBounds: TileBounds = {
    minLat: Number(reply.south ?? 0),
    maxLat: Number(reply.north ?? 0),
    minLng: Number(reply.west ?? 0),
    maxLng: Number(reply.east ?? 0),
  };

  const nextZoom = Number(reply.zoom ?? mapZoom);

  setMapBounds((prev) => {
    if (
      prev &&
      prev.minLat === nextBounds.minLat &&
      prev.maxLat === nextBounds.maxLat &&
      prev.minLng === nextBounds.minLng &&
      prev.maxLng === nextBounds.maxLng
    ) {
      return prev;
    }
    return nextBounds;
  });

  setMapZoom((prev) => (prev === nextZoom ? prev : nextZoom));
}, [mapZoom]);

const handleRequestMapBounds = useCallback(() => {
  setRequestBoundsTrigger(prev => prev + 1);
}, []);

type CameraCommand = {
  mode?: 'north' | 'heading' | 'free' | 'route_overview';
  target?: { lat: number; lng: number } | null;
  zoom?: number;
  followUser?: boolean;
  force?: boolean;
};

const issueCameraCommand = useCallback((command: CameraCommand) => {
  const nextMode = command.mode === 'route_overview' ? 'free' : command.mode;

  if (nextMode) {
    setCameraMode(nextMode);
  }

  if (typeof command.followUser === 'boolean') {
    setFollowUser(command.followUser);
  } else if (nextMode === 'north' || nextMode === 'heading') {
    setFollowUser(true);
  } else if (nextMode === 'free' || command.mode === 'route_overview') {
    setFollowUser(false);
  }

  if (command.target && Number.isFinite(command.target.lat) && Number.isFinite(command.target.lng)) {
    queueCenterZoomTarget({
      lat: command.target.lat,
      lng: command.target.lng,
      zoom: Number.isFinite(command.zoom) ? Number(command.zoom) : mapZoom,
    });
    return;
  }

  if ((nextMode === 'north' || nextMode === 'heading') && userLocation) {
    queueCenterZoomTarget({
      lat: userLocation.lat,
      lng: userLocation.lng,
      zoom: Number.isFinite(command.zoom) ? Number(command.zoom) : mapZoom,
    });
  }
}, [mapZoom, queueCenterZoomTarget, userLocation]);

const handleOpenOfflineCache = useCallback(() => {
  hapticCommand();
  setRequestBoundsTrigger(prev => prev + 1);
  openTopPopup('offlineCache');
}, [openTopPopup]);

const toggleToolsPopup = useCallback(() => {
  hapticMicro();
  toggleTopPopup('tools');
}, [toggleTopPopup]);

const closeToolsPopup = useCallback(() => {
  closeTopPopup('tools');
}, [closeTopPopup]);

const runToolsAction = useCallback((action: () => void) => {
  closeToolsPopup();
  action();
}, [closeToolsPopup]);

const executeAssistSurfaceAction = useCallback((surface: AssistSurface, rule?: AutonomousAssistRule | null) => {
  switch (surface) {
    case 'intel':
      openTopPopup('intel');
      break;
    case 'weather_detail':
      openWeatherAlertDetail();
      break;
    case 'route_weather':
      openRouteWeatherDetail();
      break;
    case 'pin_drawer':
      openTopPopup('pinDrawer');
      break;
    case 'storage_dashboard':
      openTopPopup('storageDashboard');
      break;
    case 'offline_cache':
      handleOpenOfflineCache();
      break;
    case 'recenter':
      handleRecenter();
      break;
    case 'route_overview':
      if (activeRun?.points?.[0]) {
        issueCameraCommand({
          mode: 'route_overview',
          target: { lat: activeRun.points[0].lat, lng: activeRun.points[0].lng },
          zoom: 10,
          followUser: false,
          force: true,
        });
      }
      break;
    case 'telemetry':
      openTopPopup('intel');
      break;
    default:
      break;
  }

  if (rule?.message) {
    showToast(replaceVisibleAIWithECS(rule.message).toUpperCase());
  }
}, [
  activeRun,
  handleOpenOfflineCache,
  handleRecenter,
  issueCameraCommand,
  openRouteWeatherDetail,
  openTopPopup,
  openWeatherAlertDetail,
  showToast,
]);

const handleAssistActionPress = useCallback((surface: unknown, rule?: unknown | null) => {
  if (typeof surface !== 'string') return;
  executeAssistSurfaceAction(surface as AssistSurface, (rule as AutonomousAssistRule | null | undefined) ?? null);
}, [executeAssistSurfaceAction]);

const handleRoadOverlayToggleSteps = useCallback(() => {
  roadNavigation.setStepListExpanded(!roadNavigation.stepListExpanded);
}, [roadNavigation.setStepListExpanded, roadNavigation.stepListExpanded]);

const handleRoadOverlaySelectSuggestion = useCallback((suggestion: RoadNavSearchSuggestion) => {
  clearActiveRunSelection();
  void clearExploreNavigationPayload();
  void trailNavigation.endNavigation();
  void roadNavigation.selectSuggestion(suggestion);
  closeToolsPopup();
}, [
  clearActiveRunSelection,
  clearExploreNavigationPayload,
  closeToolsPopup,
  roadNavigation.selectSuggestion,
  trailNavigation.endNavigation,
]);

const handleRoadOverlayStartNavigation = useCallback(() => {
  if (explorePreviewMode === 'trail') {
    void trailNavigation.startNavigation();
    return;
  }
  roadNavigation.startNavigation();
}, [explorePreviewMode, roadNavigation.startNavigation, trailNavigation.startNavigation]);

const handleRoadOverlayEndNavigation = useCallback(() => {
  closeTopPopup('tools');
  clearActiveRunSelection();
  void clearExploreNavigationPayload();
  void trailNavigation.endNavigation();
  void roadNavigation.endNavigation();
  showToast('NAVIGATION ENDED');
}, [
  clearActiveRunSelection,
  clearExploreNavigationPayload,
  closeTopPopup,
  roadNavigation.endNavigation,
  showToast,
  trailNavigation.endNavigation,
]);

const handleRoadOverlayClearDestination = useCallback(() => {
  clearActiveRunSelection();
  void clearExploreNavigationPayload();
  void trailNavigation.endNavigation();
  void roadNavigation.clearDestination();
}, [
  clearActiveRunSelection,
  clearExploreNavigationPayload,
  roadNavigation.clearDestination,
  trailNavigation.endNavigation,
]);

const handleRoadOverlayReroute = useCallback(() => {
  if (trailNavigation.uiMode === 'active' || pendingHybridTrailTransition) {
    if (trailNavigation.session.rejoinPoint) {
      fitMapToCoordinatePreview(
        trailNavigation.session.rejoinPoint,
        88,
        'trail_rejoin',
      );
    } else if (userLocation) {
      fitMapToCoordinatePreview(userLocation, 72, 'trail_center');
    } else {
      showToast?.('Trail route centered.');
    }
    return;
  }
  void roadNavigation.reroute('manual');
}, [
  fitMapToCoordinatePreview,
  pendingHybridTrailTransition,
  roadNavigation.reroute,
  showToast,
  trailNavigation.session.rejoinPoint,
  trailNavigation.uiMode,
  userLocation,
]);

const mapTiltAlertMarkers = useMemo(
  () => (showTiltAlertZones ? safeArray(tiltAlertMarkers as any) : []),
  [showTiltAlertZones, tiltAlertMarkers],
);

const compassContainerStyle = useMemo(
  () => ({ bottom: COMPASS_BOTTOM, right: COMPASS_RIGHT }),
  [COMPASS_BOTTOM, COMPASS_RIGHT],
);



const stableMapSurface = useMemo(() => {
  if (!hasToken) {
    return (
      <View style={styles.emptyMap}>
        <ActivityIndicator size="large" color={TACTICAL.amber} />
        <Text style={styles.emptyMapTitle}>CONNECTING TO MAP SERVICE</Text>
        <Text style={styles.emptyMapBody}>
          Resolving map configuration. This may take a moment on first launch.
        </Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <MapRenderer
        points={displayedRoutePoints}
        progressPoints={displayedRouteProgressPoints}
        waypoints={displayedRouteWaypoints}
        healthLevel={activeHealth?.overall || 'green'}
        routeColor={displayedRouteColor}
        progressColor={displayedRouteProgressColor}
        mapStyle={mapStyle}
        mapboxToken={mapToken || ''}
        showUserLocation={!!safeUserLocation}
        followUser={followUser}
        userLocation={safeUserLocation}
        interactive
        segments={displayedSegmentFeatures}
        bailoutMarkers={bailoutMarkers}
        pinMarkers={filteredPinMarkers}
        showCrosshair={showCrosshair}
        onLongPress={handleLongPress}
        onPinTap={handlePinTap}
        onCampIntelTap={handleCampIntelTap}
        onMapTap={handleDirectMapTapForPin}
        onMapCenterReply={handleMapCenterReply}
        requestCenterTrigger={centerZoomTrigger}
        onMapBoundsReply={handleMapBoundsReply}
        requestBoundsTrigger={requestBoundsTrigger}
        trailSegments={displayedTrailSegments}
        trailActive={
          trailStatus === 'recording' ||
          displayedTrailSegments.length > 0 ||
          trailNavigationActive ||
          pendingHybridTrailTransition
        }
        replayMarker={replayMarkerPos}
        followReplay={isReplayActive && replayPlaying}
        speedSegments={speedBucketSegments}
        trailStyle={trailStyle}
        onTiltAlertTap={handleTiltAlertTap}
        onUserDrag={handleUserDrag}
        onRoadClassification={handleRoadClassification}
        vehicleHeading={compassDisplayHeading}
        isLoading={mapLoading}
        hasToken={hasToken}
        onReadyStateChange={setMapSurfaceReady}
        onRetry={handleMapRetry}
        campIntelMarkers={campIntelMarkers}
        tiltAlertMarkers={mapTiltAlertMarkers}
        cameraCommand={mapCameraCommand}
        cameraCommandTrigger={mapCameraCommandTrigger}
      />

      {!hideWeatherTopOverlays && (
        <WeatherAlertMapOverlay
          alerts={weatherAlerts.alerts}
          alertCount={weatherAlerts.alertCount}
          severeCount={weatherAlerts.severeCount}
          enabled={weatherAlerts.enabled}
          loading={weatherAlerts.loading}
          source={weatherAlerts.source}
          conditionsSummary={weatherAlerts.conditionsSummary}
          tempString={weatherAlerts.tempString}
          windString={weatherAlerts.windString}
          precipString={weatherAlerts.precipString}
          statusText={weatherAlerts.statusText}
          onDetailPress={openWeatherAlertDetail}
          onRefresh={weatherAlerts.refresh}
          topOffset={WEATHER_ALERT_TOP + roadNavigationTopOffset}
          leftOffset={OVERLAY_EDGE}
        />
      )}

      {!hideWeatherTopOverlays && (
        <RouteWeatherTimeline
          points={routeCorridorWeather.points}
          totalDistanceMi={routeCorridorWeather.totalDistanceMi}
          worstHazard={routeCorridorWeather.worstHazard}
          hazardousCount={routeCorridorWeather.hazardousCount}
          cautionCount={routeCorridorWeather.cautionCount}
          enabled={routeCorridorWeather.enabled}
          loading={routeCorridorWeather.loading}
          source={routeCorridorWeather.source}
          hasRoute={routeCorridorWeather.hasRoute}
          approachingHazard={routeCorridorWeather.approachingHazard}
          summary={routeCorridorWeather.summary}
          onDetailPress={openRouteWeatherDetail}
          onRefresh={routeCorridorWeather.refresh}
          topOffset={
            (weatherAlerts.enabled ? ROUTE_WEATHER_TOP : WEATHER_ALERT_TOP) + roadNavigationTopOffset
          }
          leftOffset={OVERLAY_EDGE}
        />
      )}

      <RoadNavigationOverlay
        topOffset={TOP_STATUS_STACK_START}
        bottomOffset={routeSurfaceBottomOffset}
        guidanceRightInset={ACTIVE_GUIDANCE_RIGHT_INSET}
        horizontalInset={OVERLAY_EDGE}
        bottomCardRightInset={routeBottomRightInset}
        stepListRightInset={routeBottomRightInset}
        stepListBottomOffset={routeStepDrawerBottomOffset}
        query={roadNavigation.query}
        onChangeQuery={roadNavigation.setQuery}
        suggestions={roadNavigation.suggestions}
        searchLoading={roadNavigation.searchLoading}
        searchError={roadNavigation.searchError}
        searchDisabled={searchOperationalState.disabled}
        searchOperationalLabel={searchOperationalState.label}
        searchOperationalDetail={searchOperationalState.detail}
        searchOperationalTone={searchOperationalState.tone}
        session={roadNavigation.session}
        previewLoading={roadNavigation.previewLoading}
        stepListExpanded={roadNavigation.stepListExpanded}
        onToggleSteps={handleRoadOverlayToggleSteps}
        onSelectSuggestion={handleRoadOverlaySelectSuggestion}
        onStartNavigation={handleRoadOverlayStartNavigation}
        onEndNavigation={handleRoadOverlayEndNavigation}
        onClearDestination={handleRoadOverlayClearDestination}
        onReroute={handleRoadOverlayReroute}
        uiMode={navigationOverlayMode}
        previewContext={mapOverlayStartupReady ? navigationPreviewContext : null}
        activeContext={mapOverlayStartupReady ? navigationActiveContext : null}
        showSearchSurface={false}
        showActiveTopCard={false}
        onRouteOverview={handleRouteOverview}
        onPrimaryPreviewAction={handleRoadOverlayStartNavigation}
      />

      <CampIntelDetailCard
        visible={campIntelVisible && !!selectedCampIntel}
        site={selectedCampIntel}
        comparison={selectedCampIntelComparison}
        topOffset={MAP_POPUP_TOP}
        bottomOffset={campIntelCardBottomOffset}
        rightInset={campIntelCardRightInset}
        maxWidth={
          adaptive.isExpanded
            ? Math.min(420, Math.max(360, adaptive.windowWidth * 0.34))
            : undefined
        }
        onNavigateHere={handleCampIntelNavigateHere}
        onSaveCamp={handleCampIntelSave}
        onCompareNearby={handleCampIntelCompareNearby}
        onMarkUsed={handleCampIntelMarkUsed}
        onReportUnusable={handleCampIntelReportUnusable}
        onDismiss={handleCampIntelDismiss}
      />

      {showInlineIntelPanel && (
        <View style={styles.intelPanel}>
          {surfacedMissionBrief && (
            <MissionBriefCard
              brief={visibleMissionBrief}
              compact
              onAssistActionPress={handleAssistActionPress}
            />
          )}

          {weatherSeveritySummary && (
            <TouchableOpacity
              style={[
                styles.weatherWarningPill,
                {
                  borderColor: weatherSeveritySummary.color + '55',
                  backgroundColor: weatherSeveritySummary.color + '18',
                },
              ]}
              onPress={openRouteWeatherDetail}
              activeOpacity={0.85}
            >
              <Ionicons name="warning-outline" size={13} color={weatherSeveritySummary.color} />
              <Text
                style={[
                  styles.weatherWarningPillText,
                  { color: weatherSeveritySummary.color },
                ]}
              >
                {weatherSeveritySummary.label}
              </Text>
            </TouchableOpacity>
          )}

          <RouteAnalysisPanel intelligence={routeIntelligence} visible />
          <ResourceForecastPanel forecast={resourceForecast} visible />
          <TerrainAnalysisPanel intelligence={terrainIntelligence} visible />

          <WeatherIntelPanel
            latitude={userLocation?.lat ?? null}
            longitude={userLocation?.lng ?? null}
            locationLabel="Current Position"
            autoFetch
            compact
            units="imperial"
          />
        </View>
      )}

      <View style={styles.mapFloatingControlsLayer} pointerEvents="box-none">
        {endNavigationControlVisible ? (
          <TouchableOpacity
            style={[styles.mapEndNavTrigger, { top: MAP_TOP_CONTROL_ROW, left: OVERLAY_EDGE }]}
            onPress={handleRoadOverlayEndNavigation}
            activeOpacity={0.85}
            hitSlop={EDGE_CONTROL_HIT_SLOP}
          >
            <Ionicons name="square" size={14} color="#FFD9C7" />
            <Text style={styles.mapEndNavTriggerText}>END NAV</Text>
          </TouchableOpacity>
        ) : routeIndicatorVisible && mapRouteIndicator ? (
          <TouchableOpacity
            style={[styles.routeIndicatorBadge, { top: MAP_TOP_CONTROL_ROW, left: OVERLAY_EDGE }]}
            onPress={mapRouteIndicator.onPress}
            activeOpacity={0.88}
            hitSlop={EDGE_CONTROL_HIT_SLOP}
          >
            <Ionicons name={mapRouteIndicator.icon} size={13} color={TACTICAL.amber} />
            <View style={styles.routeIndicatorTextWrap}>
              <Text style={styles.routeIndicatorBadgeText} numberOfLines={1}>
                {mapRouteIndicator.title}
              </Text>
              {mapRouteIndicator.state ? (
                <View style={styles.routeIndicatorStatePill}>
                  <Text style={styles.routeIndicatorStateText} numberOfLines={1}>
                    {mapRouteIndicator.state}
                  </Text>
                </View>
              ) : null}
            </View>
          </TouchableOpacity>
        ) : null}

        {floatingToolsVisible ? (
        <View
          style={[
            styles.rightFloatingRail,
            { top: MAP_TOP_CONTROL_ROW, right: OVERLAY_EDGE },
          ]}
          pointerEvents="box-none"
        >
          <View style={styles.utilityPrimaryRow} pointerEvents="box-none">
            <TouchableOpacity
              style={[
                styles.quickActionsTrigger,
                { width: TOP_RIGHT_UTILITY_WIDTH },
                toolsPopupVisible && styles.quickActionsTriggerActive,
              ]}
              onPress={toggleToolsPopup}
              activeOpacity={0.85}
              hitSlop={EDGE_CONTROL_HIT_SLOP}
            >
              <Ionicons
                name={toolsPopupVisible ? 'close' : 'options-outline'}
                size={16}
                color={toolsPopupVisible ? '#091014' : TACTICAL.amber}
              />
              <View style={styles.quickActionsTriggerCopy}>
                <Text
                  style={[
                    styles.quickActionsTriggerText,
                    toolsPopupVisible && styles.quickActionsTriggerTextActive,
                  ]}
                >
                  TOOLS
                </Text>
                <Text
                  style={[
                    styles.quickActionsTriggerMeta,
                    toolsPopupVisible && styles.quickActionsTriggerMetaActive,
                  ]}
                  numberOfLines={1}
                >
                  {toolsTriggerMetaLabel}
                </Text>
              </View>
            </TouchableOpacity>

          </View>
        </View>
      ) : null}

        <CompassRose
          heading={compassDisplayHeading != null ? compassDisplayHeading : undefined}
          followUser={followUser}
          visible={compassOverlayVisible}
          onPress={handleRecenter}
          accuracy={compassPowerSaveActive ? 'none' : vehicleHeadingHook.accuracy}
        needsRecalibration={compassPowerSaveActive ? false : vehicleHeadingHook.needsRecalibration}
        isStationaryLocked={compassPowerSaveActive || vehicleHeadingHook.isStationaryLocked}
        source={compassPowerSaveActive ? 'none' : vehicleHeadingHook.source}
        paused={compassPowerSaveActive}
        containerStyle={compassContainerStyle}
      />
      </View>
    </View>
  );
}, [
  hasToken,
  displayedRoutePoints,
  displayedRouteProgressPoints,
  displayedRouteWaypoints,
  activeHealth?.overall,
  displayedRouteColor,
  displayedRouteProgressColor,
  mapStyle,
  mapToken,
  safeUserLocation,
  followUser,
  displayedSegmentFeatures,
  bailoutMarkers,
  filteredPinMarkers,
  showCrosshair,
  handleLongPress,
  handlePinTap,
  handleCampIntelTap,
  handleDirectMapTapForPin,
  handleMapCenterReply,
  centerZoomTrigger,
  handleMapBoundsReply,
  requestBoundsTrigger,
  displayedTrailSegments,
  trailStatus,
  replayMarkerPos,
  isReplayActive,
  replayPlaying,
  speedBucketSegments,
  trailStyle,
  handleTiltAlertTap,
  handleUserDrag,
  handleRoadClassification,
  compassDisplayHeading,
  mapLoading,
  handleMapRetry,
  campIntelMarkers,
  mapTiltAlertMarkers,
  handleRoadOverlayToggleSteps,
  handleRoadOverlaySelectSuggestion,
  handleRoadOverlayStartNavigation,
  handleRoadOverlayEndNavigation,
  handleRoadOverlayClearDestination,
  handleRoadOverlayReroute,
  compassContainerStyle,
  campIntelVisible,
  selectedCampIntel,
  adaptive.isExpanded,
  OVERLAY_EDGE,
  adaptive.windowWidth,
  campIntelCardBottomOffset,
    campIntelCardRightInset,
    handleCampIntelNavigateHere,
    handleCampIntelSave,
    handleCampIntelCompareNearby,
    handleCampIntelMarkUsed,
  handleCampIntelReportUnusable,
  handleCampIntelDismiss,
  MAP_POPUP_TOP,
  showTiltAlertZones,
  tiltAlertMarkers,
    mapCameraCommand,
    mapCameraCommandTrigger,
    selectedCampIntelComparison,
  weatherAlerts,
  routeCorridorWeather,
  roadNavigationTopOffset,
  hideWeatherTopOverlays,
  openRouteWeatherDetail,
  openWeatherAlertDetail,
  roadNavigation.query,
  roadNavigation.suggestions,
  roadNavigation.searchLoading,
  roadNavigation.searchError,
  roadNavigation.session,
  roadNavigation.previewLoading,
  roadNavigation.stepListExpanded,
  searchOperationalState.detail,
  searchOperationalState.disabled,
  searchOperationalState.label,
  searchOperationalState.tone,
  navigationOverlayMode,
  navigationPreviewContext,
  navigationActiveContext,
  trailNavigationActive,
  toolsPopupVisible,
  toolsTriggerMetaLabel,
  toolsMapAvailabilityLabel,
  toolsSelectedPreviewSummary,
  mapStyleMode,
  handleMapStyleModeChange,
  mapOverlayStartupReady,
  closeToolsPopup,
  toggleToolsPopup,
  showInlineIntelPanel,
  surfacedMissionBrief,
  handleAssistActionPress,
  weatherSeveritySummary,
  ACTIVE_GUIDANCE_RIGHT_INSET,
  routeBottomRightInset,
  WEATHER_ALERT_TOP,
  ROUTE_WEATHER_TOP,
  routeIntelligence,
  resourceForecast,
  terrainIntelligence,
  userLocation,
  mapRouteIndicator,
  routeIndicatorVisible,
  handleRecenter,
  handleRouteOverview,
  floatingToolsVisible,
  endNavigationControlVisible,
  compassOverlayVisible,
  gpsStatusOverlayVisible,
  vehicleHeadingHook.accuracy,
  vehicleHeadingHook.needsRecalibration,
  vehicleHeadingHook.isStationaryLocked,
  vehicleHeadingHook.source,
  compassPowerSaveActive,
  COMPASS_BOTTOM,
  MAP_TOP_CONTROL_ROW,
  TOP_STATUS_STACK_START,
  routeSurfaceBottomOffset,
  routeStepDrawerBottomOffset,
  TOP_RIGHT_UTILITY_WIDTH,
  TOOLS_POPUP_WIDTH,
  visibleMissionBrief,
]);
const _replayOverlayTopDeprecated = replayOverlayTop;
const _showInlineIntelPanelDeprecated = showInlineIntelPanel;
const _showIntelPopupDeprecated = showIntelPopup;


  // â”€â”€ Offline map bounds callback â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const _handleMapBoundsReplyDeprecated = useCallback((reply: any) => {
    if (!reply) return;

    const nextBounds: TileBounds = {
      minLat: Number(reply.south ?? 0),
      maxLat: Number(reply.north ?? 0),
      minLng: Number(reply.west ?? 0),
      maxLng: Number(reply.east ?? 0),
    };

    const nextZoom = Number(reply.zoom ?? mapZoom);

    setMapBounds((prev) => {
      if (
        prev &&
        prev.minLat === nextBounds.minLat &&
        prev.maxLat === nextBounds.maxLat &&
        prev.minLng === nextBounds.minLng &&
        prev.maxLng === nextBounds.maxLng
      ) {
        return prev;
      }
      return nextBounds;
    });

    setMapZoom((prev) => (prev === nextZoom ? prev : nextZoom));
  }, [mapZoom]);

  const _handleRequestMapBoundsDeprecated = useCallback(() => {
    setRequestBoundsTrigger(prev => prev + 1);
  }, []);

  const lastMissionBriefSignatureRef = useRef('');
  const missionBriefGpsState = useMemo(
    () => ({
      position: gps.position,
      isAvailable: gps.isAvailable,
      hasFix: gps.hasFix,
      isWatching: gps.isWatching,
      fixQuality: gps.fixQuality,
      gpsStatus: gps.gpsStatus,
      error: gps.error,
      retryCount: gps.retryCount,
      permissionDenied: gps.permissionDenied,
      lastEmitTs: gps.position?.timestamp ?? 0,
    }),
    [
      gps.position,
      gps.isAvailable,
      gps.hasFix,
      gps.isWatching,
      gps.fixQuality,
      gps.gpsStatus,
      gps.error,
      gps.retryCount,
      gps.permissionDenied,
    ],
  );

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        const ctx = await buildAIContextFromLiveState({
          route: {
            activeRun,
            routeIntelligence,
            terrainIntelligence,
            campIntel: campIntel.summary,
            campDecision: campIntel.decision,
          },
          environment: {
            gps: missionBriefGpsState,
          },
          resources: {
            forecast: resourceForecast,
          },
          navigation: {
            cameraMode,
            followUser,
            mapExpanded: null,
            mapStyleMode: mapStyle,
            replayActive: isReplayActive,
            pinDropMode,
          },
          flags: {
            skipWeatherFetch: true,
          },
        });
        if (cancelled || !mountedRef.current) return;
        const brief = generateMissionBrief(ctx);
        if (cancelled || !mountedRef.current) return;
        const nextSignature = JSON.stringify({
          headline: brief?.headline ?? null,
          summary: brief?.summary ?? null,
          compactLabel: brief?.compactLabel ?? null,
          priorityMessage: brief?.priorityMessage ?? null,
          recommendations: brief?.recommendations ?? [],
          risks: brief?.keyRisks ?? [],
        });
        if (lastMissionBriefSignatureRef.current === nextSignature) return;
        lastMissionBriefSignatureRef.current = nextSignature;
        setMissionBrief(brief);
      } catch (err) {
        console.warn('[Navigate] Mission brief generation failed:', err);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [
    activeRun?.id,
    activeRun?.points?.length,
    routeIntelligence?.id,
    terrainIntelligence?.id,
    expeditionForecast?.id,
    resourceForecast?.routeIntelligenceId,
    powerTelemetryHash,
    weatherSeveritySummary?.level,
    weatherAlerts?.lastFetchAt,
    routeCorridorWeather?.lastFetchAt,
    activeRun,
    routeIntelligence,
    terrainIntelligence,
    campIntel.summary,
    campIntel.decision,
    resourceForecast,
    missionBriefGpsState,
    isOnline,
    cameraMode,
    followUser,
    mapStyle,
    pinDropMode,
    isReplayActive,
  ]);


  type LegacyCameraCommand = {
    mode?: 'north' | 'heading' | 'free' | 'route_overview';
    target?: { lat: number; lng: number } | null;
    zoom?: number;
    followUser?: boolean;
    force?: boolean;
  };

  const _issueCameraCommandDeprecated = useCallback((command: LegacyCameraCommand) => {
    const nextMode = command.mode === 'route_overview' ? 'free' : command.mode;

    if (nextMode) {
      setCameraMode(nextMode);
    }

    if (typeof command.followUser === 'boolean') {
      setFollowUser(command.followUser);
    } else if (nextMode === 'north' || nextMode === 'heading') {
      setFollowUser(true);
    } else if (nextMode === 'free' || command.mode === 'route_overview') {
      setFollowUser(false);
    }

    if (command.target && Number.isFinite(command.target.lat) && Number.isFinite(command.target.lng)) {
      queueCenterZoomTarget({
        lat: command.target.lat,
        lng: command.target.lng,
        zoom: Number.isFinite(command.zoom) ? Number(command.zoom) : mapZoom,
      });
      return;
    }

    if ((nextMode === 'north' || nextMode === 'heading') && userLocation) {
      queueCenterZoomTarget({
        lat: userLocation.lat,
        lng: userLocation.lng,
        zoom: Number.isFinite(command.zoom) ? Number(command.zoom) : mapZoom,
      });
    }
  }, [mapZoom, queueCenterZoomTarget, userLocation]);

  const _handleOpenOfflineCacheDeprecated = useCallback(() => {
    hapticCommand();
    setRequestBoundsTrigger(prev => prev + 1);
    openTopPopup('offlineCache');
  }, [openTopPopup]);

  const _executeAssistSurfaceActionDeprecated = useCallback((surface: AssistSurface, rule?: AutonomousAssistRule | null) => {
    switch (surface) {
      case 'intel':
        openTopPopup('intel');
        break;
      case 'weather_detail':
        openWeatherAlertDetail();
        break;
      case 'route_weather':
        openRouteWeatherDetail();
        break;
      case 'pin_drawer':
        openTopPopup('pinDrawer');
        break;
      case 'storage_dashboard':
        openTopPopup('storageDashboard');
        break;
      case 'offline_cache':
        _handleOpenOfflineCacheDeprecated();
        break;
      case 'recenter':
        handleRecenter();
        break;
      case 'route_overview':
        if (activeRun?.points?.[0]) {
          _issueCameraCommandDeprecated({
            mode: 'route_overview',
            target: { lat: activeRun.points[0].lat, lng: activeRun.points[0].lng },
            zoom: 10,
            followUser: false,
            force: true,
          });
        }
        break;
      case 'telemetry':
        openTopPopup('intel');
        break;
      default:
        break;
    }

    if (rule?.message) {
      showToast(replaceVisibleAIWithECS(rule.message).toUpperCase());
    }
  }, [
    activeRun,
    _handleOpenOfflineCacheDeprecated,
    handleRecenter,
    _issueCameraCommandDeprecated,
    openRouteWeatherDetail,
    openTopPopup,
    openWeatherAlertDetail,
    showToast,
  ]);

  useEffect(() => {
    const assist = surfacedMissionBrief?.autonomousAssist;
    const rule = assist?.primaryRule;
    if (!assist?.enabled || !rule || !assist.eventKey) {
      setAiAssistBanner(null);
      return;
    }

    const now = Date.now();
    const cooldownMs = (rule.cooldownSec || 180) * 1000;
    const shouldRefire =
      assistCooldownRef.current.eventKey !== assist.eventKey ||
      now - assistCooldownRef.current.firedAt > cooldownMs;
    if (!shouldRefire) return;

    assistCooldownRef.current = { eventKey: assist.eventKey, firedAt: now };
    setAiAssistBanner({
      title: replaceVisibleAIWithECS(rule.title),
      message: replaceVisibleAIWithECS(rule.message),
      surface: rule.surface,
      rule,
    });

    if (rule.mode === 'auto_open' && !rule.requiresConfirmation) {
      executeAssistSurfaceAction(rule.surface, rule);
    }
  }, [executeAssistSurfaceAction, surfacedMissionBrief]);

  useEffect(() => {
    if (!aiAssistBanner || aiAssistBanner.rule?.requiresConfirmation) return;

    const timer = setTimeout(() => {
      setAiAssistBanner(null);
    }, 7000);

    return () => clearTimeout(timer);
  }, [aiAssistBanner]);

  // â”€â”€ Expand/collapse for true fullscreen â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const toggleMapExpanded = useCallback(() => {
    hapticMicro();
    setMapExpanded(prev => !prev);
  }, []);

  const collapseMap = useCallback(() => {
    if (mapExpanded) { hapticMicro(); setMapExpanded(false); }
  }, [mapExpanded]);

  const closePinEditor = useCallback(() => {
    closeTopPopup('pinEditor');
    setEditingPin(null);
    setDropCoords(null);
    setShowCrosshair(false);
  }, [closeTopPopup]);

  const closeIntelPanels = useCallback(() => {
    closeTopPopup('intel');
  }, [closeTopPopup]);

  return (
  <View style={styles.container}>
  {/* â•â•â•â•â•â•â•â•â•â•â• HEADER â•â•â•â•â•â•â•â•â•â•â• */}
  {!mapExpanded && (
      <View onLayout={(e) => setHeaderHeight(e.nativeEvent.layout.height)}>
        <Header
          onAuthPress={() => {
            closeTopPopup();
            setAuthVisible(true);
          }}
          guidance={navigateHeaderGuidance}
          commandContext={{
            expeditionPhase: aiState?.expeditionPhase ?? null,
            operationalState: aiState?.operationalState ?? null,
            liveStatus: liveStatus ?? null,
          }}
        />
      </View>
  )}

  {/* â•â•â•â•â•â•â•â•â•â•â• STORAGE WARNING BANNER â•â•â•â•â•â•â•â•â•â•â• */}
  {!mapExpanded && (
    <View onLayout={(e) => setStorageBannerHeight(e.nativeEvent.layout.height)}>
      <StorageWarningBanner
        report={cleanupReport}
        onCleanupComplete={handleCleanupComplete}
        onOpenOfflineCache={handleOpenOfflineCache}
        showToast={showToast}
      />
    </View>
  )}

                  {/* â•â•â•â•â•â•â•â•â•â•â• MAP CONTAINER (fills remaining space) â•â•â•â•â•â•â•â•â•â•â• */}
      <View style={mapExpanded ? styles.mapFullscreen : styles.mapContainer}>
        {/* Loading overlay */}
        {!mapOverlayStartupReady && (
          <View
            style={[
              styles.mapLoadingOverlay,
              {
                paddingTop: MAP_TOP_CONTROL_ROW + 24,
                paddingBottom: LOWER_DOCK_EXCLUSION + PAGE_FRAME_BOTTOM_GAP,
                paddingHorizontal: OVERLAY_EDGE,
              },
            ]}
          >
            <ECSTransientNotice
              kind="loading"
              label="Preparing Navigate"
              message="Anchoring the map, saved route context, and field controls."
              compact
            />
          </View>
        )}

        {/* GPS Status Overlay â€” non-blocking, fades when fix acquired */}
        {gpsStatusOverlayVisible && (
          <GPSStatusOverlay
            gpsStatus={gps.gpsStatus}
            fixQuality={gps.fixQuality}
            hasFix={gps.hasFix}
            retryCount={gps.retryCount}
            permissionDenied={gps.permissionDenied}
            error={gps.error}
            onRetry={handleGpsRetry}
            mapReady={mapOverlayStartupReady}
            topOffset={TOP_STATUS_STACK_START}
            horizontalInset={OVERLAY_EDGE}
            maxWidth={adaptive.isExpanded ? 360 : 320}
          />
        )}

        {/* MapRenderer */}
{stableMapSurface}


{/* â•â•â•â•â•â•â•â•â•â•â• FLOATING MAP OVERLAYS â•â•â•â•â•â•â•â•â•â•â• */}
<View pointerEvents="box-none" style={styles.mapOverlayLayer}>
  {isReplayActive && isMapUIReady && (
    <View
      style={[
        styles.replayBarOverlay,
        {
          top: replayOverlayTop,
        },
      ]}
    >
      <ReplayBar
        visible={isReplayActive}
        totalSeconds={replayTotalSeconds}
        totalPoints={replayAnalytics?.replay_data?.length || 0}
        currentSeconds={replayCurrentSeconds}
        currentPoint={currentReplayPoint}
        isPlaying={replayPlaying}
        speed={replaySpeed}
        onPlay={handleReplayPlay}
        onPause={handleReplayPause}
        onSeek={handleReplaySeek}
        onSpeedChange={handleReplaySpeedChange}
        onExit={handleReplayExit}
      />
    </View>
  )}

  {pinDropMode && isMapUIReady && (
    <Animated.View
      style={[
        styles.pinModeBanner,
        {
          bottom: pinModeBannerBottom,
          left: OVERLAY_EDGE,
          right: undefined,
          maxWidth: adaptive.isExpanded ? 260 : 220,
          transform: [{ scale: pinModePulse }],
        },
      ]}
      pointerEvents="none"
    >
      <Ionicons name="location" size={14} color={TACTICAL.amber} />
      <Text style={styles.pinModeBannerText}>PIN MODE ACTIVE â€¢ TAP MAP</Text>
    </Animated.View>
  )}

  {renderMapPopup(
    toolsPopupVisible,
    'TOOLS',
    'options-outline',
    closeToolsPopup,
    <View style={styles.toolsPopupContent}>
      <View style={styles.toolsSearchWrap}>
        <ECSSearchField
          value={roadNavigation.query}
          onChangeText={roadNavigation.setQuery}
          placeholder={
            searchOperationalState.disabled
              ? navigateOperationalState.mode === 'offline_partial_map'
                ? 'Search unavailable with cached maps only'
                : 'Search unavailable offline'
              : toolsSelectedPreviewSummary
                ? 'Search another destination or route'
                : 'Search address or place'
          }
          disabled={searchOperationalState.disabled}
          loading={roadNavigation.searchLoading}
          onClear={
            roadNavigation.query.trim().length > 0
              ? () => roadNavigation.setQuery('')
              : undefined
          }
          inputProps={{
            autoCapitalize: 'words',
            autoCorrect: false,
            returnKeyType: 'search',
          }}
        />
        <View style={styles.toolsOperationalRow}>
          <ECSBadge
            label={searchOperationalState.label ?? 'SEARCH READY'}
            tone={
              searchOperationalState.tone === 'live'
                ? 'live'
                : searchOperationalState.tone === 'unavailable'
                  ? 'unavailable'
                  : 'warning'
            }
            compact
          />
          <Text style={styles.toolsOperationalText} numberOfLines={2}>
            {searchOperationalState.detail ??
              'Search, import, and map utilities stay here so the map remains clear.'}
          </Text>
        </View>
        {toolsSelectedPreviewSummary &&
        roadNavigation.query.trim().length === 0 &&
        roadNavigation.suggestions.length === 0 &&
        !roadNavigation.searchLoading ? (
          <View style={styles.toolsSelectedPreviewCard}>
            <View style={styles.toolsSelectedPreviewHeader}>
              <ECSBadge label={toolsSelectedPreviewSummary.tripLabel} tone="category" compact />
              <ECSBadge label={toolsSelectedPreviewSummary.phaseLabel} tone="selected" compact />
            </View>
            <Text style={styles.toolsSelectedPreviewTitle} numberOfLines={1}>
              {toolsSelectedPreviewSummary.title}
            </Text>
            {toolsSelectedPreviewSummary.subtitle ? (
              <Text style={styles.toolsSelectedPreviewSubtitle} numberOfLines={1}>
                {toolsSelectedPreviewSummary.subtitle}
              </Text>
            ) : null}
            <Text style={styles.toolsSelectedPreviewHint} numberOfLines={2}>
              {toolsSelectedPreviewSummary.actionLabel} from the preview card, or search again to replace this selection.
            </Text>
          </View>
        ) : null}
      </View>

      <ScrollView
        style={styles.mapPopupScroll}
        contentContainerStyle={styles.toolsPopupScrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.toolsMetricRow}>
          <View style={styles.toolsMetricCard}>
            <Text style={styles.toolsMetricLabel}>SPEED</Text>
            <Text style={styles.toolsMetricValue}>
              {gps.position?.speedMph != null ? `${Math.round(gps.position.speedMph)} MPH` : 'â€”'}
            </Text>
          </View>
          <View style={styles.toolsMetricCard}>
            <Text style={styles.toolsMetricLabel}>GPS</Text>
            <Text style={styles.toolsMetricValue}>
              {gps.hasFix ? 'FIXED' : 'SEARCHING'}
            </Text>
          </View>
          <View style={styles.toolsMetricCard}>
            <Text style={styles.toolsMetricLabel}>MAP</Text>
            <Text style={styles.toolsMetricValue}>
              {toolsMapAvailabilityLabel}
            </Text>
          </View>
        </View>

        {roadNavigation.searchError && roadNavigation.suggestions.length === 0 ? (
          <View style={styles.toolsResultsBlock}>
            <Text style={styles.quickActionsSectionTitle}>SEARCH</Text>
            <ECSResultsEmptyState
              title={searchOperationalState.disabled ? 'Search Unavailable Offline' : 'Search Paused'}
              message={searchOperationalState.detail ?? roadNavigation.searchError}
              actionLabel="Clear Search"
              onAction={() => roadNavigation.setQuery('')}
            />
          </View>
        ) : null}

        {roadNavigation.suggestions.length > 0 ? (
          <View style={styles.toolsResultsBlock}>
            <Text style={styles.quickActionsSectionTitle}>
              RESULTS â€¢ {roadNavigation.suggestions.length}
            </Text>
            <View style={styles.toolsSuggestionList}>
              {roadNavigation.suggestions.map((suggestion) => (
                <TouchableOpacity
                  key={suggestion.id}
                  style={styles.toolsSuggestionItem}
                  onPress={() => {
                    clearActiveRunSelection();
                    void clearExploreNavigationPayload();
                    void trailNavigation.endNavigation();
                    void roadNavigation.selectSuggestion(suggestion);
                    closeToolsPopup();
                  }}
                  activeOpacity={0.82}
                >
                  <View style={styles.toolsSuggestionTextWrap}>
                    <Text style={styles.toolsSuggestionTitle} numberOfLines={1}>
                      {suggestion.title}
                    </Text>
                    {suggestion.subtitle ? (
                      <Text style={styles.toolsSuggestionSubtitle} numberOfLines={2}>
                        {suggestion.subtitle}
                      </Text>
                    ) : null}
                  </View>
                  <Ionicons name="chevron-forward" size={14} color={TACTICAL.textMuted} />
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ) : null}

        {roadNavigation.query.trim().length > 0 &&
        !roadNavigation.searchLoading &&
        !roadNavigation.searchError &&
        roadNavigation.suggestions.length === 0 &&
        !searchOperationalState.disabled ? (
          <View style={styles.toolsResultsBlock}>
            <Text style={styles.quickActionsSectionTitle}>SEARCH</Text>
            <ECSResultsEmptyState
              title="No Search Matches"
              message="Try a broader place name or a nearby town."
              actionLabel="Clear Search"
              onAction={() => roadNavigation.setQuery('')}
            />
          </View>
        ) : null}

        <View style={styles.toolsResultsBlock}>
          <Text style={styles.quickActionsSectionTitle}>MAP STYLE</Text>
          <View style={styles.quickActionsStyleRow}>
            {MAP_STYLE_MODE_OPTIONS.map(({ key, label }) => {
              const isActive = mapStyleMode === key;
              return (
                <TouchableOpacity
                  key={key}
                  style={[
                    styles.quickActionsStyleButton,
                    isActive && styles.quickActionsStyleButtonActive,
                  ]}
                  onPress={() => handleMapStyleModeChange(key)}
                  activeOpacity={0.85}
                >
                  <Text
                    style={[
                      styles.quickActionsStyleText,
                      isActive && styles.quickActionsStyleTextActive,
                    ]}
                  >
                    {label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <View style={styles.toolsResultsBlock}>
          <Text style={styles.quickActionsSectionTitle}>UTILITIES</Text>
          <View style={styles.quickActionsGrid}>
            <TouchableOpacity
              style={styles.quickActionButton}
              onPress={() => runToolsAction(handleOpenOfflineCache)}
              activeOpacity={0.85}
            >
              <Ionicons name="cloud-offline-outline" size={15} color={TACTICAL.amber} />
              <Text style={styles.quickActionButtonText}>OFFLINE</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.quickActionButton}
              onPress={() => runToolsAction(() => toggleTopPopup('intel'))}
              activeOpacity={0.85}
            >
              <Ionicons name="analytics-outline" size={15} color={TACTICAL.amber} />
              <Text style={styles.quickActionButtonText}>INTEL</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.quickActionButton,
                campIntelVisible && campIntelSites.length > 0 && styles.quickActionButtonActive,
              ]}
              onPress={() =>
                runToolsAction(() => {
                  setCampIntelVisible((prev) => !prev);
                  if (campIntelVisible) {
                    setSelectedCampIntelId(null);
                    showToast('CAMP INTEL HIDDEN');
                  } else {
                    showToast(
                      campIntelSites.length > 0
                        ? `CAMP INTEL ONLINE: ${campIntelSites.length} SITES`
                        : 'CAMP INTEL READY'
                    );
                  }
                })
              }
              activeOpacity={0.85}
            >
              <Ionicons
                name={campIntelVisible ? 'bed-outline' : 'bed-outline'}
                size={15}
                color={campIntelVisible && campIntelSites.length > 0 ? '#091014' : TACTICAL.amber}
              />
              <Text
                style={[
                  styles.quickActionButtonText,
                  campIntelVisible && campIntelSites.length > 0 && styles.quickActionButtonTextActive,
                ]}
              >
                {campIntelVisible ? 'CAMP INTEL' : 'SHOW CAMP'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.quickActionButton}
              onPress={() => runToolsAction(handleOpenStitch)}
              activeOpacity={0.85}
            >
              <Ionicons name="git-merge-outline" size={15} color={TACTICAL.amber} />
              <Text style={styles.quickActionButtonText}>STITCH</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.quickActionButton}
              onPress={() => runToolsAction(() => toggleTopPopup('trail'))}
              activeOpacity={0.85}
            >
              <Ionicons name="trail-sign-outline" size={15} color={TACTICAL.amber} />
              <Text style={styles.quickActionButtonText}>TRAIL</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.quickActionButton, pinDropMode && styles.quickActionButtonActive]}
              onPress={() => runToolsAction(handleDropPinHere)}
              activeOpacity={0.85}
            >
              <Ionicons
                name={pinDropMode ? 'radio-button-on' : 'pin-outline'}
                size={15}
                color={pinDropMode ? '#091014' : TACTICAL.amber}
              />
              <Text
                style={[
                  styles.quickActionButtonText,
                  pinDropMode && styles.quickActionButtonTextActive,
                ]}
              >
                {pinDropMode ? 'PINNING' : 'DROP PIN'}
              </Text>
            </TouchableOpacity>

            {allPins.length > 0 ? (
              <TouchableOpacity
                style={styles.quickActionButton}
                onPress={() => runToolsAction(() => toggleTopPopup('pinDrawer'))}
                activeOpacity={0.85}
              >
                <Ionicons name="list-outline" size={15} color={TACTICAL.amber} />
                <Text style={styles.quickActionButtonText}>PINS</Text>
              </TouchableOpacity>
            ) : null}

            <TouchableOpacity
              style={styles.quickActionButton}
              onPress={() =>
                runToolsAction(() => {
                  void handleImportGPX();
                })
              }
              activeOpacity={0.85}
            >
              <Ionicons name="cloud-upload-outline" size={15} color={TACTICAL.amber} />
              <Text style={styles.quickActionButtonText}>IMPORT</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </View>,
    TOOLS_POPUP_WIDTH,
    { placement: 'center', backdropTint: 'transparent' }
  )}

  {renderMapPopup(
    stitchModalVisible,
    'STITCH',
    'git-merge-outline',
    () => closeTopPopup('stitch'),
    <ScrollView
      style={styles.mapPopupScroll}
      contentContainerStyle={styles.mapPopupScrollContent}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.mapPopupSimpleStack}>
        <View style={styles.stitchHeroCard}>
          <Text style={styles.stitchHeroEyebrow}>EXPEDITION CHAIN</Text>
          <Text style={styles.stitchHeroTitle}>Build a stitched route plan</Text>
          <Text style={styles.stitchHeroText}>
            Add trail runs in order. ECS keeps non-touching gaps as transition legs so you can move trail to road to trail without blocking the chain.
          </Text>
        </View>

        <View style={styles.stitchSection}>
          <Text style={styles.quickActionsSectionTitle}>STITCH NAME</Text>
          <TextInput
            value={stitchName}
            onChangeText={setStitchName}
            placeholder="Stitched Expedition"
            placeholderTextColor={TACTICAL.textMuted}
            style={styles.stitchNameInput}
          />
        </View>

        <View style={styles.stitchSection}>
          <Text style={styles.quickActionsSectionTitle}>
            CHAIN ORDER â€¢ {stitchedRuns.length}
          </Text>
          {stitchedRuns.length > 0 ? (
            <View style={styles.stitchChainList}>
              {stitchedRuns.map((run, index) => (
                <View key={`stitched-${run.id}`} style={styles.stitchChainCard}>
                  <View style={styles.stitchChainIndex}>
                    <Text style={styles.stitchChainIndexText}>{index + 1}</Text>
                  </View>
                  <View style={styles.stitchChainTextWrap}>
                    <Text style={styles.stitchChainTitle} numberOfLines={1}>
                      {run.title}
                    </Text>
                    <Text style={styles.stitchChainMeta} numberOfLines={2}>
                      {`${run.stats.distance_miles.toFixed(1)} mi â€¢ ${run.points.length} pts â€¢ ${run.source.toUpperCase()}`}
                    </Text>
                  </View>
                  <View style={styles.stitchChainActions}>
                    <TouchableOpacity
                      style={styles.stitchMiniAction}
                      onPress={() => handleMoveStitchSegment(run.id, -1)}
                      disabled={index === 0}
                      activeOpacity={0.82}
                    >
                      <Ionicons
                        name="chevron-up"
                        size={15}
                        color={index === 0 ? TACTICAL.textMuted : TACTICAL.amber}
                      />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.stitchMiniAction}
                      onPress={() => handleMoveStitchSegment(run.id, 1)}
                      disabled={index === stitchedRuns.length - 1}
                      activeOpacity={0.82}
                    >
                      <Ionicons
                        name="chevron-down"
                        size={15}
                        color={index === stitchedRuns.length - 1 ? TACTICAL.textMuted : TACTICAL.amber}
                      />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.stitchMiniAction}
                      onPress={() => handleRemoveStitchSegment(run.id)}
                      activeOpacity={0.82}
                    >
                      <Ionicons name="close" size={15} color="#D96B63" />
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </View>
          ) : (
            <ECSResultsEmptyState
              title="No segments added"
              message="Pick one or more imported routes below to build the expedition chain."
              helper="You can still open Stitch with a single route loaded and add more segments later."
              icon="git-merge-outline"
              variant="compact"
            />
          )}
        </View>

        <View style={styles.stitchSection}>
          <Text style={styles.quickActionsSectionTitle}>
            AVAILABLE ROUTES â€¢ {stitchSourceRuns.length}
          </Text>
          {stitchSourceRuns.length > 0 ? (
            <View style={styles.stitchAvailableList}>
              {stitchSourceRuns.map((run) => {
                const alreadyAdded = stitchSegmentIds.includes(run.id);
                return (
                  <TouchableOpacity
                    key={`available-${run.id}`}
                    style={[
                      styles.stitchAvailableCard,
                      alreadyAdded && styles.stitchAvailableCardAdded,
                    ]}
                    onPress={() => handleAddStitchSegment(run.id)}
                    activeOpacity={0.84}
                    disabled={alreadyAdded}
                  >
                    <View style={styles.stitchAvailableTextWrap}>
                      <Text style={styles.stitchAvailableTitle} numberOfLines={1}>
                        {run.title}
                      </Text>
                      <Text style={styles.stitchAvailableMeta} numberOfLines={2}>
                        {`${run.stats.distance_miles.toFixed(1)} mi â€¢ ${run.points.length} pts â€¢ ${run.source.toUpperCase()}`}
                      </Text>
                    </View>
                    <View style={styles.stitchAddBadge}>
                      <Text style={styles.stitchAddBadgeText}>
                        {alreadyAdded ? 'ADDED' : 'ADD'}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          ) : (
            <ECSResultsEmptyState
              title="No routes available"
              message="Import a GPX, KML, or GeoJSON route first, then return to Stitch."
              helper="Stitch works with your imported Navigate routes and trail runs."
              icon="cloud-upload-outline"
              variant="compact"
            />
          )}
        </View>

        <View style={styles.stitchFooter}>
          <TouchableOpacity
            style={[styles.stitchSaveButton, stitchedRuns.length === 0 && styles.stitchSaveButtonDisabled]}
            onPress={handleSaveStitch}
            activeOpacity={0.88}
            disabled={stitchedRuns.length === 0}
          >
            <Ionicons name="navigate-outline" size={16} color="#091014" />
            <Text style={styles.stitchSaveButtonText}>SAVE STITCHED EXPEDITION</Text>
          </TouchableOpacity>
        </View>
      </View>
    </ScrollView>
  )}

  {renderMapPopup(
  pinDrawerVisible,
  'PINS',
  'pin-outline',
  () => closeTopPopup('pinDrawer'),
  <ScrollView
    style={styles.mapPopupScroll}
    contentContainerStyle={styles.mapPopupScrollContent}
    showsVerticalScrollIndicator={false}
    keyboardShouldPersistTaps="handled"
  >
    <PinDrawer
      pins={categoryFilteredPins}
      allPins={allPins}
      userLocation={userLocation}
      activeExpeditionId={activeExpeditionId}
      onSelectPin={handleSelectPin}
      onEditPin={handleEditPin}
      onResolvePin={handleResolvePin}
      onExport={handleExportPins}
      onRefresh={loadPins}
      activePinTypeFilters={activePinTypeFilters}
      onPinTypeFilterToggle={handlePinTypeFilterToggle}
      onPinTypeFilterReset={handlePinTypeFilterReset}
    />
  </ScrollView>
)}

  {renderMapPopup(
    showIntelPopup,
    'INTEL',
    'analytics-outline',
    closeIntelPanels,
    <ScrollView
      style={styles.mapPopupScroll}
      contentContainerStyle={styles.mapPopupScrollContent}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.mapPopupSimpleStack}>
        <View style={styles.intelHeroCard}>
          <View style={styles.intelHeroHeader}>
            <View
              style={[
                styles.intelStatusBadge,
                {
                  borderColor: `${intelStatusMeta.color}55`,
                  backgroundColor: `${intelStatusMeta.color}18`,
                },
              ]}
            >
              <Text style={[styles.intelStatusBadgeText, { color: intelStatusMeta.color }]}>
                {intelStatusMeta.label}
              </Text>
            </View>
            <Text style={styles.intelUpdatedText}>
              {formatNavTimestamp(
                visibleMissionBrief?.generatedAt ??
                  expeditionForecast?.computedAt ??
                  routeIntelligence?.analyzedAt ??
                  null,
              )}
            </Text>
          </View>

          <Text style={styles.intelHeroTitle}>{intelHeroTitle}</Text>
          <Text style={styles.intelHeroBody}>{intelHeroBody}</Text>

          <View style={styles.intelMetricRow}>
            <View style={styles.intelMetricCard}>
              <Text style={styles.intelMetricLabel}>DIST</Text>
              <Text style={styles.intelMetricValue}>
                {formatNavMiles(routeIntelligence?.totalDistanceMiles ?? null)}
              </Text>
            </View>
            <View style={styles.intelMetricCard}>
              <Text style={styles.intelMetricLabel}>DRIVE</Text>
              <Text style={styles.intelMetricValue}>
                {routeIntelligence
                  ? formatNavDuration(routeIntelligence.estimatedDriveTimeHours * 3600)
                  : '--'}
              </Text>
            </View>
            <View style={styles.intelMetricCard}>
              <Text style={styles.intelMetricLabel}>RISK</Text>
              <Text style={styles.intelMetricValue}>
                {terrainIntelligence?.overallRisk ?? '--'}
              </Text>
            </View>
            <View style={styles.intelMetricCard}>
              <Text style={styles.intelMetricLabel}>SUPPLY</Text>
              <Text style={styles.intelMetricValue}>
                {resourceForecast?.sufficiencyLevel ?? '--'}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.intelSectionCard}>
          <Text style={styles.intelSectionTitle}>Route snapshot</Text>
          {routeIntelligence ? (
            <>
              <Text style={styles.intelPrimaryLine}>{routeIntelligence.routeName}</Text>
              <Text style={styles.intelSecondaryLine}>
                {routeIntelligence.segmentCount} segments â€¢ {routeIntelligence.overallDifficulty} terrain â€¢ high point{' '}
                {Math.round(routeIntelligence.highestElevationFeet).toLocaleString()} ft
              </Text>
            </>
          ) : (
            <Text style={styles.intelEmptyText}>
              Load a route or trail to unlock route analysis and expedition planning detail.
            </Text>
          )}
        </View>

        <View style={styles.intelSectionCard}>
          <Text style={styles.intelSectionTitle}>Resource check</Text>
          {resourceForecast ? (
            <>
              <View style={styles.intelSummaryPillRow}>
                {[
                  { label: `Fuel ${resourceForecast.fuel.status}`, color: resourceForecast.fuel.status === 'OK' ? '#66BB6A' : resourceForecast.fuel.status === 'CAUTION' ? '#FFB300' : '#EF5350' },
                  { label: `Water ${resourceForecast.water.status}`, color: resourceForecast.water.status === 'OK' ? '#66BB6A' : resourceForecast.water.status === 'CAUTION' ? '#FFB300' : '#EF5350' },
                  { label: `Power ${resourceForecast.power.status}`, color: resourceForecast.power.status === 'OK' ? '#66BB6A' : resourceForecast.power.status === 'CAUTION' ? '#FFB300' : '#EF5350' },
                ].map((item) => (
                  <View
                    key={item.label}
                    style={[
                      styles.intelSummaryPill,
                      {
                        borderColor: `${item.color}44`,
                        backgroundColor: `${item.color}18`,
                      },
                    ]}
                  >
                    <Text style={[styles.intelSummaryPillText, { color: item.color }]}>{item.label}</Text>
                  </View>
                ))}
              </View>
              <Text style={styles.intelSecondaryLine}>
                {resourceForecast.drivers?.slice(0, 2).join(' â€¢ ') || 'Margins are based on the current route forecast and live system profile.'}
              </Text>
            </>
          ) : (
            <Text style={styles.intelEmptyText}>
              Resource forecasting appears here once a route and current vehicle/loadout data are available.
            </Text>
          )}
        </View>

        <View style={styles.intelSectionCard}>
          <Text style={styles.intelSectionTitle}>Terrain watch</Text>
          {terrainIntelligence ? (
            <>
              <Text style={styles.intelPrimaryLine}>
                {terrainIntelligence.overallRisk} terrain risk
              </Text>
              <Text style={styles.intelSecondaryLine}>
                {terrainIntelligence.steepSegments} steep segments â€¢ {terrainIntelligence.highElevationSegments} high-elevation segments
                {terrainIntelligence.mountainPassDetected ? ' â€¢ mountain pass detected' : ''}
              </Text>
              {terrainIntelligence.terrainWarnings[0] ? (
                <Text style={styles.intelCalloutText}>
                  {terrainIntelligence.terrainWarnings[0].message}
                </Text>
              ) : null}
            </>
          ) : (
            <Text style={styles.intelEmptyText}>
              Terrain warnings will appear here when the current route has enough elevation data to analyze.
            </Text>
          )}
        </View>

        <View style={styles.intelSectionCard}>
          <Text style={styles.intelSectionTitle}>Camp + forecast</Text>
          {primaryCampSuggestion ? (
            <>
              <Text style={styles.intelPrimaryLine}>
                {campIntel.decision.headline ?? campIntel.summary.headline ?? `${primaryCampSuggestion.categoryLabel} ready at ${primaryCampSuggestion.segmentLabel ?? primaryCampSuggestion.label}`}
              </Text>
              <Text style={styles.intelSecondaryLine}>
                {campIntel.decision.summaryLine ?? campIntel.summary.routeGuidance[0] ?? `${primaryCampSuggestion.quickVerdict} â€¢ ${primaryCampSuggestion.confidenceLabel}`}
              </Text>
            </>
          ) : expeditionForecast ? (
            <>
              <Text style={styles.intelPrimaryLine}>{expeditionForecast.status} expedition outlook</Text>
              <Text style={styles.intelSecondaryLine}>{expeditionForecast.brief}</Text>
            </>
          ) : (
            <Text style={styles.intelEmptyText}>
              Campsite and expedition outlooks appear here once the active route has enough planning context.
            </Text>
          )}
        </View>
      </View>
    </ScrollView>
  )}

  {renderMapPopup(
    trailModalVisible,
    trailStatus === 'idle' ? 'TRAIL' : 'TRAIL STATUS',
    'trail-sign-outline',
    () => closeTopPopup('trail'),
    <ScrollView
      style={styles.mapPopupScroll}
      contentContainerStyle={styles.mapPopupScrollContent}
      showsVerticalScrollIndicator={false}
    >
      <TrailStatusModal
        visible={true}
        onClose={() => closeTopPopup('trail')}
        status={trailStatus}
        stats={trailStats || DEFAULT_TRAIL_STATS}
        activeExpeditionId={activeExpeditionId}
        activeExpeditionName={activeExpeditionName}
        onStatusChange={refreshTrailState}
        onExport={handleTrailExport}
        onReplay={handleReplayStart}
        onReplayFromHistory={handleReplayFromHistory}
        onExportFromHistory={handleExportFromHistory}
        showToast={showToast}
      />
    </ScrollView>
  )}

  {renderMapPopup(
  offlineCacheModalVisible,
  'OFFLINE CACHE',
  'cloud-download-outline',
  () => closeTopPopup('offlineCache'),
  <ScrollView
    style={styles.mapPopupScroll}
    contentContainerStyle={styles.mapPopupScrollContent}
    showsVerticalScrollIndicator={false}
  >
    <OfflineCacheModal
      embedded
      mapBounds={mapBounds}
      mapZoom={mapZoom}
      mapStyle={mapStyle}
      showToast={showToast}
      onRequestMapBounds={handleRequestMapBounds}
    />
  </ScrollView>
)}

  {renderMapPopup(
  storageDashboardVisible,
  'STORAGE',
  'server-outline',
  () => closeTopPopup('storageDashboard'),
  <ScrollView
    style={styles.mapPopupScroll}
    contentContainerStyle={styles.mapPopupScrollContent}
    showsVerticalScrollIndicator={false}
  >
    <StorageDashboardModal
      embedded
      showToast={showToast}
    />
  </ScrollView>
)}
</View>

{/* â•â•â•â•â•â•â•â•â•â•â• PIN DETAILS POPUP â•â•â•â•â•â•â•â•â•â•â• */}
{renderMapPopup(
  pinModalVisible,
  editingPin ? 'EDIT PIN' : 'DROP PIN',
  editingPin ? 'create-outline' : 'pin-outline',
  closePinEditor,
  <ScrollView
    style={styles.mapPopupScroll}
    contentContainerStyle={styles.mapPopupScrollContent}
    showsVerticalScrollIndicator={false}
    keyboardShouldPersistTaps="handled"
  >
    <PinDetailsModal
      embedded
      onClose={closePinEditor}
      onSave={handlePinSave}
      onDelete={handlePinDelete}
      onResolve={handlePinResolve}
      editPin={editingPin}
      coordinates={dropCoords}
      activeExpeditionId={activeExpeditionId}
      activeExpeditionName={activeExpeditionName}
    />
  </ScrollView>
)}

{/* â•â•â•â•â•â•â•â•â•â•â• TILT ALERT DETAIL MODAL â•â•â•â•â•â•â•â•â•â•â• */}
</View>
<TiltAlertDetailModal
  visible={tiltAlertDetailVisible}
  onClose={closeTiltAlertDetail}
  event={tiltAlertDetailEvent}
  cluster={tiltAlertDetailCluster}
/>

{/* â•â•â•â•â•â•â•â•â•â•â• WEATHER ALERT DETAIL MODAL â•â•â•â•â•â•â•â•â•â•â• */}
<WeatherAlertDetailModal
  visible={weatherAlertDetailVisible}
  onClose={closeWeatherAlertDetail}
  alerts={safeArray(weatherAlerts?.alerts)}
  source={weatherAlerts.source}
  lastFetchAt={weatherAlerts.lastFetchAt}
  conditionsSummary={weatherAlerts.conditionsSummary}
  tempString={weatherAlerts.tempString}
  windString={weatherAlerts.windString}
  onRefresh={weatherAlerts.refresh}
  loading={weatherAlerts.loading}
  error={weatherAlerts.error}
/>

{/* â•â•â•â•â•â•â•â•â•â•â• ROUTE CORRIDOR WEATHER DETAIL MODAL â•â•â•â•â•â•â•â•â•â•â• */}
<RouteWeatherDetailModal
  visible={routeWeatherDetailVisible}
  onClose={closeRouteWeatherDetail}
  points={safeArray(routeCorridorWeather?.points)}
  totalDistanceMi={routeCorridorWeather.totalDistanceMi}
  worstHazard={routeCorridorWeather.worstHazard}
  allAlerts={safeArray(routeCorridorWeather?.allAlerts)}
  source={routeCorridorWeather.source}
  lastFetchAt={routeCorridorWeather.lastFetchAt}
  loading={routeCorridorWeather.loading}
  error={routeCorridorWeather.error}
  onRefresh={routeCorridorWeather.refresh}
  approachingHazard={routeCorridorWeather.approachingHazard}
/>

<AuthModal visible={authVisible} onClose={() => setAuthVisible(false)} />
<Toast />
        
      </View>
    );
}

function FormField({ label, value, onChangeText, placeholder, keyboardType }: {
  label: string;
  value: string;
  onChangeText: (t: string) => void;
  placeholder?: string;
  keyboardType?: 'numeric' | 'default';
}) {

  return (
    <View style={styles.formField}>
      <Text style={styles.formLabel}>{label}</Text>
      <TextInput
        style={styles.formInput}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={TACTICAL.textMuted + '60'}
        keyboardType={keyboardType}
        autoCapitalize="none"
        autoCorrect={false}
      />
    </View>
  );
}

const FLOATING_PILL_BOTTOM = 120;

const MAP_EDGE = 16;
const MAP_BOTTOM_CONTROLS = 118;
const MAP_RIGHT_STACK_GAP = 12;
const MAP_STYLE_TOP_OFFSET = 14;
const EXPANDED_ACTION_TOP = 60;

export default function NavigateScreen() {
  return (
    <TabErrorBoundary tabName="NAVIGATE">
      <NavigateScreenInner />
    </TabErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: TACTICAL.bg },

mapOverlayLayer: {
  ...StyleSheet.absoluteFillObject,
  zIndex: NAV_OVERLAY_Z.contextual,
  elevation: NAV_OVERLAY_Z.contextual,
  pointerEvents: 'box-none',
},

mapTopOverlayLayer: {
  position: 'absolute',
  top: 0,
  left: 0,
  right: 0,
  zIndex: NAV_OVERLAY_Z.topStatus,
  elevation: NAV_OVERLAY_Z.topStatus,
  pointerEvents: 'box-none',
},

mapFloatingControlsLayer: {
  ...StyleSheet.absoluteFillObject,
  zIndex: NAV_OVERLAY_Z.utility,
  elevation: NAV_OVERLAY_Z.utility,
  pointerEvents: 'box-none',
},

mapModalLayer: {
  ...StyleSheet.absoluteFillObject,
  zIndex: NAV_OVERLAY_Z.modal,
  elevation: NAV_OVERLAY_Z.modal,
  pointerEvents: 'box-none',
},

  // â”€â”€ Map Container (fills remaining space) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  mapContainer: {
  flex: 1,
  borderTopWidth: GOLD_RAIL.sectionWidth,
  borderTopColor: GOLD_RAIL.section,
  backgroundColor: TACTICAL.panel,
  position: 'relative',
  marginTop: 0,
  overflow: 'hidden',
},
  mapFullscreen: {
  position: 'absolute',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  zIndex: 100,
  backgroundColor: TACTICAL.panel,
},
  phase1Fallback: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 8 },
  emptyMap: {
  flex: 1,
  alignItems: 'center',
  justifyContent: 'center',
  paddingHorizontal: 24,
  backgroundColor: '#0A0D12',
},

emptyMapTitle: {
  marginTop: 12,
  color: TACTICAL.text,
  fontSize: 13,
  fontWeight: '800',
  letterSpacing: 1,
},

emptyMapBody: {
  marginTop: 6,
  color: TACTICAL.textMuted,
  fontSize: 12,
  textAlign: 'center',
  lineHeight: 18,
  maxWidth: 260,
},

  mapLoadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 5,
    backgroundColor: TACTICAL.panel,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  mapLoadingText: { ...TYPO.U2, color: TACTICAL.textMuted, fontSize: 8 },
  // â”€â”€ Floating Map Overlays â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
floatingPill: {
  position: 'absolute',
  zIndex: 30,
  backgroundColor: 'rgba(11,15,18,0.9)',
  borderRadius: 8,
  borderWidth: 1,
  borderColor: 'rgba(62,79,60,0.4)',
  alignItems: 'center',
  justifyContent: 'center',
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.4,
  shadowRadius: 4,
  elevation: 6,
},

expandPill: {
  right: 14,
  width: 34,
  height: 34,
},

pinListPill: {
  left: 14,
  width: 34,
  height: 34,
  zIndex: NAV_OVERLAY_Z.contextual,
  elevation: NAV_OVERLAY_Z.contextual,
},

replayBarOverlay: {
  position: 'absolute',
  left: 8,
  right: 8,
  zIndex: NAV_OVERLAY_Z.contextual,
},

mapStyleSelectorWrap: {
  position: 'absolute',
  right: MAP_EDGE,
  zIndex: NAV_OVERLAY_Z.cornerControls,
  elevation: NAV_OVERLAY_Z.cornerControls,
  alignItems: 'center',
},

quickActionsDismissLayer: {
  ...StyleSheet.absoluteFillObject,
  zIndex: NAV_OVERLAY_Z.cornerControls - 1,
},

leftFloatingRail: {
  position: 'absolute',
  zIndex: NAV_OVERLAY_Z.cornerControls,
  elevation: NAV_OVERLAY_Z.cornerControls,
},

rightFloatingRail: {
  position: 'absolute',
  zIndex: NAV_OVERLAY_Z.cornerControls,
  elevation: NAV_OVERLAY_Z.cornerControls,
  alignItems: 'flex-end',
  gap: 6,
},

utilityPrimaryRow: {
  flexDirection: 'row',
  alignItems: 'stretch',
  justifyContent: 'flex-end',
  gap: 6,
},

quickActionsWrap: {
  position: 'absolute',
  right: MAP_EDGE,
  zIndex: NAV_OVERLAY_Z.cornerControls,
  elevation: NAV_OVERLAY_Z.cornerControls,
  alignItems: 'flex-end',
  gap: 8,
},

quickActionsTrigger: {
  minWidth: 0,
  minHeight: 40,
  paddingHorizontal: 10,
  paddingVertical: 7,
  borderRadius: 12,
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'flex-start',
  gap: 7,
  backgroundColor: 'rgba(10,14,18,0.94)',
  borderWidth: 1,
  borderColor: 'rgba(196,138,44,0.28)',
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.32,
  shadowRadius: 10,
  elevation: 12,
},

quickActionsTriggerActive: {
  backgroundColor: 'rgba(196,138,44,0.95)',
  borderColor: 'rgba(255,220,140,0.35)',
},

quickActionsTriggerText: {
  color: TACTICAL.amber,
  fontSize: 8,
  fontWeight: '900',
  letterSpacing: 1.05,
},

quickActionsTriggerTextActive: {
  color: '#091014',
},

quickActionsTriggerCopy: {
  flex: 1,
  minWidth: 0,
  gap: 2,
},

quickActionsTriggerMeta: {
  color: TACTICAL.textMuted,
  fontSize: 6.8,
  fontWeight: '800',
  letterSpacing: 0.85,
},

quickActionsTriggerMetaActive: {
  color: 'rgba(9,16,20,0.74)',
},

mapEndNavTrigger: {
  position: 'absolute',
  minHeight: 40,
  paddingHorizontal: 12,
  borderRadius: 12,
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 7,
  backgroundColor: 'rgba(82,18,12,0.94)',
  borderWidth: 1,
  borderColor: 'rgba(255,128,92,0.34)',
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.32,
  shadowRadius: 10,
  elevation: 12,
},

mapEndNavTriggerText: {
  color: '#FFD9C7',
  fontSize: 8,
  fontWeight: '900',
  letterSpacing: 1.02,
},

utilityStyleSelectorShell: {
  minWidth: 0,
  padding: 3,
  borderRadius: 12,
  backgroundColor: 'rgba(10,14,18,0.94)',
  borderWidth: 1,
  borderColor: 'rgba(196,138,44,0.22)',
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.24,
  shadowRadius: 10,
  elevation: 10,
},

utilityStyleSelectorRow: {
  flexDirection: 'row',
  alignItems: 'center',
  gap: 4,
},

utilityStyleSegment: {
  flex: 1,
  height: 28,
  borderRadius: 8,
  alignItems: 'center',
  justifyContent: 'center',
  borderWidth: 1,
  borderColor: 'rgba(196,138,44,0.14)',
  backgroundColor: 'rgba(18,24,29,0.9)',
},

utilityStyleSegmentActive: {
  backgroundColor: 'rgba(196,138,44,0.95)',
  borderColor: 'rgba(255,220,140,0.35)',
},

utilityStyleSegmentText: {
  color: TACTICAL.amber,
  fontSize: 8,
  fontWeight: '900',
  letterSpacing: 0.95,
},

utilityStyleSegmentTextActive: {
  color: '#091014',
},

routeIndicatorBadge: {
  position: 'absolute',
  minWidth: 0,
  maxWidth: 172,
  minHeight: 28,
  paddingHorizontal: 8,
  paddingVertical: 5,
  borderRadius: 10,
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'flex-start',
  gap: 5,
  backgroundColor: 'rgba(10,14,18,0.82)',
  borderWidth: 1,
  borderColor: 'rgba(196,138,44,0.22)',
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.24,
  shadowRadius: 8,
  elevation: 10,
},

routeIndicatorTextWrap: {
  flexDirection: 'row',
  alignItems: 'center',
  gap: 6,
  minWidth: 0,
  flexShrink: 1,
},

routeIndicatorBadgeText: {
  color: TACTICAL.text,
  fontSize: 7.6,
  fontWeight: '900',
  letterSpacing: 0.95,
  textAlign: 'left',
  flexShrink: 1,
},

routeIndicatorStatePill: {
  minWidth: 0,
  paddingHorizontal: 6,
  paddingVertical: 3,
  borderRadius: 999,
  borderWidth: 1,
  borderColor: 'rgba(196,138,44,0.18)',
  backgroundColor: 'rgba(196,138,44,0.08)',
  alignItems: 'center',
  justifyContent: 'center',
},

routeIndicatorStateText: {
  color: TACTICAL.amber,
  fontSize: 6.7,
  fontWeight: '900',
  letterSpacing: 0.9,
},

quickActionsMenu: {
  width: 214,
  marginTop: 8,
  padding: 10,
  borderRadius: 16,
  borderWidth: 1,
  borderColor: 'rgba(196,138,44,0.28)',
  backgroundColor: 'rgba(10,14,18,0.98)',
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 8 },
  shadowOpacity: 0.34,
  shadowRadius: 14,
  elevation: 14,
  gap: 8,
},

quickActionsSectionTitle: {
  ...TYPO.U2,
  color: TACTICAL.textMuted,
  fontSize: 8,
  letterSpacing: 1.8,
},

quickActionsStyleRow: {
  flexDirection: 'row',
  gap: 5,
},

quickActionsStyleButton: {
  flex: 1,
  height: 28,
  borderRadius: 9,
  alignItems: 'center',
  justifyContent: 'center',
  borderWidth: 1,
  borderColor: 'rgba(196,138,44,0.18)',
  backgroundColor: 'rgba(18,24,29,0.9)',
},

quickActionsStyleButtonActive: {
  backgroundColor: 'rgba(196,138,44,0.95)',
  borderColor: 'rgba(255,220,140,0.35)',
},

quickActionsStyleText: {
  color: TACTICAL.amber,
  fontSize: 8,
  fontWeight: '900',
  letterSpacing: 1,
},

quickActionsStyleTextActive: {
  color: '#091014',
},

quickActionsGrid: {
  flexDirection: 'row',
  flexWrap: 'wrap',
  gap: 7,
},

quickActionButton: {
  width: '48%',
  minHeight: 54,
  borderRadius: 12,
  borderWidth: 1,
  borderColor: 'rgba(196,138,44,0.18)',
  backgroundColor: 'rgba(18,24,29,0.9)',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 5,
  paddingHorizontal: 8,
  paddingVertical: 9,
},

quickActionButtonActive: {
  backgroundColor: 'rgba(196,138,44,0.95)',
  borderColor: 'rgba(255,220,140,0.35)',
},

quickActionButtonText: {
  ...TYPO.U2,
  color: TACTICAL.text,
  fontSize: 8,
  letterSpacing: 1.1,
  textAlign: 'center',
},

quickActionButtonTextActive: {
  color: '#091014',
},

toolsPopupContent: {
  flex: 1,
},

toolsSearchWrap: {
  paddingHorizontal: 16,
  paddingTop: 14,
  paddingBottom: 10,
  borderBottomWidth: 1,
  borderBottomColor: 'rgba(196,138,44,0.12)',
  gap: 10,
},

toolsOperationalRow: {
  flexDirection: 'row',
  alignItems: 'flex-start',
  gap: 10,
},

toolsOperationalText: {
  ...TYPO.B2,
  color: TACTICAL.textMuted,
  fontSize: 11,
  lineHeight: 16,
  flex: 1,
},

toolsSelectedPreviewCard: {
  borderRadius: 12,
  borderWidth: 1,
  borderColor: 'rgba(196,138,44,0.14)',
  backgroundColor: 'rgba(12,16,20,0.92)',
  paddingHorizontal: 12,
  paddingVertical: 10,
  gap: 6,
},

toolsSelectedPreviewHeader: {
  flexDirection: 'row',
  alignItems: 'center',
  gap: 8,
  flexWrap: 'wrap',
},

toolsSelectedPreviewTitle: {
  ...TYPO.T3,
  color: TACTICAL.text,
  fontSize: 12,
},

toolsSelectedPreviewSubtitle: {
  ...TYPO.B2,
  color: TACTICAL.textMuted,
  fontSize: 10,
  lineHeight: 14,
},

toolsSelectedPreviewHint: {
  ...TYPO.B2,
  color: TACTICAL.textMuted,
  fontSize: 10,
  lineHeight: 14,
},

toolsPopupScrollContent: {
  padding: 16,
  paddingBottom: 32,
  gap: 16,
},

toolsMetricRow: {
  flexDirection: 'row',
  gap: 8,
},

toolsMetricCard: {
  flex: 1,
  minHeight: 58,
  borderRadius: 12,
  borderWidth: 1,
  borderColor: 'rgba(196,138,44,0.14)',
  backgroundColor: 'rgba(12,16,20,0.92)',
  paddingHorizontal: 10,
  paddingVertical: 10,
  justifyContent: 'space-between',
  gap: 6,
},

toolsMetricLabel: {
  ...TYPO.U2,
  color: TACTICAL.textMuted,
  fontSize: 8,
  letterSpacing: 1.4,
},

toolsMetricValue: {
  ...TYPO.T3,
  color: TACTICAL.text,
  fontSize: 12,
},

toolsResultsBlock: {
  gap: 8,
},

toolsSuggestionList: {
  gap: 8,
},

toolsSuggestionItem: {
  minHeight: 58,
  borderRadius: 12,
  borderWidth: 1,
  borderColor: 'rgba(196,138,44,0.14)',
  backgroundColor: 'rgba(12,16,20,0.92)',
  paddingHorizontal: 12,
  paddingVertical: 11,
  flexDirection: 'row',
  alignItems: 'center',
  gap: 10,
},

toolsSuggestionTextWrap: {
  flex: 1,
  gap: 4,
},

toolsSuggestionTitle: {
  ...TYPO.T3,
  color: TACTICAL.text,
  fontSize: 12,
},

toolsSuggestionSubtitle: {
  ...TYPO.B2,
  color: TACTICAL.textMuted,
  fontSize: 10,
  lineHeight: 14,
},

mapStyleSelectorPillHorizontal: {
  flexDirection: 'row',
  alignItems: 'center',
  padding: 3,
  borderRadius: 12,
  backgroundColor: 'rgba(10,14,18,0.94)',
  borderWidth: 1,
  borderColor: 'rgba(196,138,44,0.28)',
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.32,
  shadowRadius: 10,
  elevation: 12,
  gap: 4,
},

actionBarWithIntelRow: {
  flexDirection: 'row',
  alignItems: 'stretch',
  paddingHorizontal: 16,
  gap: 10,
},

actionBarFlex: {
  flex: 1,
},

topIntelTile: {
  width: 84,
  height: 106,
  borderRadius: 18,
  alignItems: 'center',
  justifyContent: 'center',
  gap: 10,
  backgroundColor: 'rgba(10,14,18,0.94)',
  borderWidth: 1,
  borderColor: 'rgba(196,138,44,0.28)',
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.32,
  shadowRadius: 10,
  elevation: 12,
  flexShrink: 0,
},

topIntelTileActive: {
  backgroundColor: 'rgba(196,138,44,0.95)',
  borderColor: 'rgba(255,220,140,0.35)',
},

topIntelTileText: {
  color: TACTICAL.textMuted,
  fontSize: 11,
  fontWeight: '900',
  letterSpacing: 1.8,
},

topIntelTileTextActive: {
  color: '#091014',
},

mapRightRail: {
  position: 'absolute',
  right: 16,
  top: 148,
  alignItems: 'center',
  gap: 12,
  zIndex: 110,
  elevation: 110,
},

mapStyleContainer: {
  position: 'absolute',
  right: 16,
  top: 140,
  padding: 4,
  borderRadius: 16,
  backgroundColor: 'rgba(10,14,18,0.94)',
  borderWidth: 1,
  borderColor: 'rgba(196,138,44,0.28)',
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.32,
  shadowRadius: 10,
  elevation: 12,
  zIndex: 110,
},

mapStyleButtonHorizontal: {
  minWidth: 44,
  height: 24,
  paddingHorizontal: 10,
  borderRadius: 8,
  alignItems: 'center',
  justifyContent: 'center',
},

mapStyleButtonActive: {
  backgroundColor: 'rgba(196,138,44,0.95)',
  borderColor: 'rgba(255,220,140,0.35)',
},

mapStyleButtonText: {
  color: TACTICAL.amber,
  fontSize: 9,
  fontWeight: '900',
  letterSpacing: 1.0,
},

mapStyleButtonTextActive: {
  color: '#091014',
},

mapRailButton: {
  width: 54,
  height: 54,
  borderRadius: 16,
  alignItems: 'center',
  justifyContent: 'center',
  backgroundColor: 'rgba(10,14,18,0.94)',
  borderWidth: 1,
  borderColor: 'rgba(196,138,44,0.28)',
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.32,
  shadowRadius: 10,
  elevation: 12,
},

// â”€â”€ Active Run Badge â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
activeRunBadge: {
  position: 'absolute',
  left: 16,
  right: 16,
  zIndex: NAV_OVERLAY_Z.contextual,
  flexDirection: 'row',
  alignItems: 'center',
  gap: 6,
  backgroundColor: 'rgba(11,15,18,0.92)',
  paddingHorizontal: 10,
  paddingVertical: 7,
  borderRadius: 8,
  borderWidth: 1,
  borderColor: 'rgba(196,138,44,0.25)',
  alignSelf: 'center',
  maxWidth: 360,
},
runHealthDot: {
  width: 7,
  height: 7,
  borderRadius: 4,
},
activeRunBadgeText: {
  ...TYPO.T3,
  color: TACTICAL.text,
  fontSize: 11,
  flex: 1,
  letterSpacing: 1,
},
activeRunBadgeDist: {
  fontFamily: 'Courier',
  fontSize: 11,
  fontWeight: '700',
  color: TACTICAL.amber,
  letterSpacing: 0.5,
},

// â”€â”€ Minimize Button (expanded) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
minimizeBtn: {
  position: 'absolute',
  right: 16,
  zIndex: 110,
  flexDirection: 'row',
  alignItems: 'center',
  gap: 6,
  backgroundColor: 'rgba(11,15,18,0.94)',
  paddingHorizontal: 14,
  paddingVertical: 10,
  borderRadius: 10,
  borderWidth: 1.5,
  borderColor: 'rgba(196,138,44,0.45)',
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.6,
  shadowRadius: 8,
  elevation: 12,
},
minimizeBtnText: {
  ...TYPO.U2,
  fontSize: 9,
  color: TACTICAL.amber,
  letterSpacing: 3,
},

// â”€â”€ Expanded Action Bar (overlay at top of fullscreen map) â”€â”€
expandedActionBar: {
  position: 'absolute',
  top: EXPANDED_ACTION_TOP,
  left: 0,
  right: 0,
  zIndex: 108,
},

topRightControlsRow: {
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'flex-end',
  gap: 10,
},

topRightIntelPill: {
  width: 116,
  height: 104,
  borderRadius: 18,
  paddingHorizontal: 10,
  paddingVertical: 10,
  alignItems: 'center',
  justifyContent: 'center',
},

// â”€â”€ Popup Layer â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
mapPopupLayer: {
  ...StyleSheet.absoluteFillObject,
  zIndex: NAV_OVERLAY_Z.modal,
  elevation: NAV_OVERLAY_Z.modal,
},

mapPopupBackdrop: {
  position: 'absolute',
  left: 0,
  right: 0,
  backgroundColor: 'rgba(0,0,0,0.30)',
},

mapPopupShell: {
  position: 'absolute',
  left: 10,
  right: 10,
  borderRadius: 16,
  borderWidth: 1,
  borderColor: 'rgba(196,138,44,0.28)',
  backgroundColor: 'rgba(8,12,15,0.985)',
  overflow: 'hidden',
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 8 },
  shadowOpacity: 0.35,
  shadowRadius: 16,
  elevation: 18,
},

mapPopupHeader: {
  minHeight: 48,
  paddingHorizontal: 16,
  borderBottomWidth: 1,
  borderBottomColor: 'rgba(196,138,44,0.16)',
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'space-between',
  backgroundColor: 'rgba(12,16,20,0.98)',
},

mapPopupTitleRow: {
  flexDirection: 'row',
  alignItems: 'center',
  gap: 8,
},

mapPopupTitle: {
  color: TACTICAL.amber,
  fontSize: 12,
  fontWeight: '900',
  letterSpacing: 1.4,
},

mapPopupBody: {
  flex: 1,
  backgroundColor: 'rgba(9,13,16,0.98)',
},

mapPopupScroll: {
  flex: 1,
},

mapPopupScrollContent: {
  padding: 16,
  paddingBottom: 30,
},

mapPopupSimpleStack: {
  gap: 12,
},

stitchHeroCard: {
  borderRadius: 18,
  borderWidth: 1,
  borderColor: 'rgba(196,138,44,0.18)',
  backgroundColor: 'rgba(196,138,44,0.06)',
  paddingHorizontal: 14,
  paddingVertical: 14,
  gap: 6,
},

stitchHeroEyebrow: {
  ...TYPO.U2,
  color: TACTICAL.amber,
  fontSize: 10,
  letterSpacing: 1.5,
},

stitchHeroTitle: {
  ...TYPO.T2,
  color: TACTICAL.text,
  fontSize: 16,
},

stitchHeroText: {
  ...TYPO.B2,
  color: TACTICAL.textMuted,
  fontSize: 11,
  lineHeight: 16,
},

stitchSection: {
  gap: 8,
},

stitchNameInput: {
  minHeight: 50,
  borderRadius: 14,
  borderWidth: 1,
  borderColor: 'rgba(196,138,44,0.18)',
  backgroundColor: 'rgba(255,255,255,0.04)',
  color: TACTICAL.text,
  paddingHorizontal: 14,
  fontSize: 13,
  fontWeight: '700',
},

stitchChainList: {
  gap: 8,
},

stitchChainCard: {
  flexDirection: 'row',
  alignItems: 'center',
  gap: 10,
  borderRadius: 14,
  borderWidth: 1,
  borderColor: 'rgba(196,138,44,0.14)',
  backgroundColor: 'rgba(255,255,255,0.04)',
  paddingHorizontal: 12,
  paddingVertical: 10,
},

stitchChainIndex: {
  width: 28,
  height: 28,
  borderRadius: 999,
  backgroundColor: 'rgba(196,138,44,0.14)',
  alignItems: 'center',
  justifyContent: 'center',
},

stitchChainIndexText: {
  ...TYPO.U2,
  color: TACTICAL.amber,
  fontSize: 11,
},

stitchChainTextWrap: {
  flex: 1,
  gap: 3,
},

stitchChainTitle: {
  ...TYPO.T3,
  color: TACTICAL.text,
  fontSize: 12,
},

stitchChainMeta: {
  ...TYPO.B2,
  color: TACTICAL.textMuted,
  fontSize: 10,
},

stitchChainActions: {
  flexDirection: 'row',
  alignItems: 'center',
  gap: 6,
},

stitchMiniAction: {
  width: 28,
  height: 28,
  borderRadius: 10,
  borderWidth: 1,
  borderColor: 'rgba(255,255,255,0.08)',
  backgroundColor: 'rgba(0,0,0,0.22)',
  alignItems: 'center',
  justifyContent: 'center',
},

stitchAvailableList: {
  gap: 8,
},

stitchAvailableCard: {
  flexDirection: 'row',
  alignItems: 'center',
  gap: 10,
  borderRadius: 14,
  borderWidth: 1,
  borderColor: 'rgba(255,255,255,0.08)',
  backgroundColor: 'rgba(255,255,255,0.035)',
  paddingHorizontal: 12,
  paddingVertical: 10,
},

stitchAvailableCardAdded: {
  opacity: 0.6,
  borderColor: 'rgba(196,138,44,0.18)',
},

stitchAvailableTextWrap: {
  flex: 1,
  gap: 3,
},

stitchAvailableTitle: {
  ...TYPO.T3,
  color: TACTICAL.text,
  fontSize: 12,
},

stitchAvailableMeta: {
  ...TYPO.B2,
  color: TACTICAL.textMuted,
  fontSize: 10,
},

stitchAddBadge: {
  paddingHorizontal: 10,
  paddingVertical: 6,
  borderRadius: 999,
  borderWidth: 1,
  borderColor: 'rgba(196,138,44,0.22)',
  backgroundColor: 'rgba(196,138,44,0.08)',
},

stitchAddBadgeText: {
  ...TYPO.U2,
  color: TACTICAL.amber,
  fontSize: 9,
},

stitchFooter: {
  paddingTop: 2,
},

stitchSaveButton: {
  minHeight: 50,
  borderRadius: 14,
  backgroundColor: TACTICAL.amber,
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 8,
  paddingHorizontal: 14,
},

stitchSaveButtonDisabled: {
  opacity: 0.48,
},

stitchSaveButtonText: {
  ...TYPO.U1,
  color: '#091014',
  fontSize: 10,
  letterSpacing: 1.3,
},

intelHeroCard: {
  borderRadius: 18,
  borderWidth: 1,
  borderColor: 'rgba(196,138,44,0.22)',
  backgroundColor: 'rgba(12,16,20,0.96)',
  padding: 16,
  gap: 12,
},

intelHeroHeader: {
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 10,
},

intelStatusBadge: {
  paddingHorizontal: 10,
  paddingVertical: 5,
  borderRadius: 999,
  borderWidth: 1,
},

intelStatusBadgeText: {
  ...TYPO.U2,
  fontSize: 8,
  letterSpacing: 1.4,
},

intelUpdatedText: {
  ...TYPO.B2,
  color: TACTICAL.textMuted,
  fontSize: 10,
},

intelHeroTitle: {
  ...TYPO.T2,
  color: TACTICAL.text,
  fontSize: 17,
  lineHeight: 22,
},

intelHeroBody: {
  ...TYPO.B2,
  color: TACTICAL.textMuted,
  fontSize: 12,
  lineHeight: 18,
},

intelMetricRow: {
  flexDirection: 'row',
  flexWrap: 'wrap',
  gap: 8,
},

intelMetricCard: {
  minWidth: '23%',
  flexGrow: 1,
  borderRadius: 12,
  borderWidth: 1,
  borderColor: 'rgba(196,138,44,0.14)',
  backgroundColor: 'rgba(8,12,15,0.88)',
  paddingHorizontal: 10,
  paddingVertical: 10,
  gap: 4,
},

intelMetricLabel: {
  ...TYPO.U2,
  color: TACTICAL.textMuted,
  fontSize: 8,
  letterSpacing: 1.4,
},

intelMetricValue: {
  ...TYPO.T3,
  color: TACTICAL.text,
  fontSize: 12,
},

intelSectionCard: {
  borderRadius: 16,
  borderWidth: 1,
  borderColor: 'rgba(196,138,44,0.14)',
  backgroundColor: 'rgba(12,16,20,0.9)',
  paddingHorizontal: 14,
  paddingVertical: 14,
  gap: 8,
},

intelSectionTitle: {
  ...TYPO.U2,
  color: TACTICAL.amber,
  fontSize: 9,
  letterSpacing: 2,
},

intelPrimaryLine: {
  ...TYPO.T3,
  color: TACTICAL.text,
  fontSize: 13,
  lineHeight: 18,
},

intelSecondaryLine: {
  ...TYPO.B2,
  color: TACTICAL.textMuted,
  fontSize: 11,
  lineHeight: 16,
},

intelCalloutText: {
  ...TYPO.B2,
  color: '#F3D28A',
  fontSize: 11,
  lineHeight: 16,
},

intelEmptyText: {
  ...TYPO.B2,
  color: TACTICAL.textMuted,
  fontSize: 11,
  lineHeight: 16,
},

intelSummaryPillRow: {
  flexDirection: 'row',
  flexWrap: 'wrap',
  gap: 8,
},

intelSummaryPill: {
  borderRadius: 999,
  borderWidth: 1,
  paddingHorizontal: 10,
  paddingVertical: 6,
},

intelSummaryPillText: {
  ...TYPO.U2,
  fontSize: 8,
  letterSpacing: 1.1,
},

// â”€â”€ Crosshair Reticle â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
crosshairContainer: {
  ...StyleSheet.absoluteFillObject,
  zIndex: 105,
  alignItems: 'center',
  justifyContent: 'center',
},
crosshairRing: {
  position: 'absolute',
  width: 28,
  height: 28,
  borderRadius: 14,
  borderWidth: 1.5,
  borderColor: 'rgba(196,138,44,0.7)',
  backgroundColor: 'transparent',
},
crosshairLineH: {
  position: 'absolute',
  top: '50%',
  width: 18,
  height: 1.5,
  marginTop: -0.75,
  backgroundColor: 'rgba(196,138,44,0.6)',
},
crosshairLineV: {
  position: 'absolute',
  left: '50%',
  width: 1.5,
  height: 18,
  marginLeft: -0.75,
  backgroundColor: 'rgba(196,138,44,0.6)',
},
crosshairDot: {
  position: 'absolute',
  width: 4,
  height: 4,
  borderRadius: 2,
  backgroundColor: 'rgba(196,138,44,0.9)',
},

  // â”€â”€ Drop Pin Here â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  dropPinHereContainer: {
  position: 'absolute',
  left: 0,
  right: 0,
  zIndex: NAV_OVERLAY_Z.utility,
  alignItems: 'center',
  
},
  dropPinHereBtn: {
  flexDirection: 'row',
  alignItems: 'center',
  gap: 8,
  backgroundColor: TACTICAL.amber,
  paddingHorizontal: 22,
  paddingVertical: 12,
  borderRadius: 12,
  opacity: 0.6, // ðŸ‘ˆ moved here
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.5,
  shadowRadius: 10,
  elevation: 10,
},
  dropPinHereBtnActive: {
    opacity: 1,
    transform: [{ scale: 1.02 }],
  },
  dropPinHereBtnText: {
    ...TYPO.U1,
    color: '#0B0F12',
    fontSize: 13,
    letterSpacing: 3,
  },
  dropPinHereHint: {
    ...TYPO.B2,
    color: 'rgba(230,230,225,0.6)',
    fontSize: 10,
    marginTop: 6,
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },

  // â”€â”€ Weather â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
weatherWarningPill: {
  minHeight: 36,
  borderRadius: 12,
  borderWidth: 1,
  paddingHorizontal: 12,
  paddingVertical: 8,
  flexDirection: 'row',
  alignItems: 'center',
  gap: 8,
  marginBottom: 10,
},

weatherWarningPillText: {
  fontSize: 11,
  fontWeight: '900',
  letterSpacing: 1.2,
},

aiAssistBannerWrap: {
  paddingHorizontal: 16,
  paddingTop: 8,
  zIndex: 95,
},

aiAssistBanner: {
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 12,
  borderRadius: 14,
  borderWidth: 1,
  borderColor: 'rgba(196,138,44,0.28)',
  backgroundColor: 'rgba(10,14,18,0.94)',
  paddingHorizontal: 14,
  paddingVertical: 12,
},

aiAssistBannerTextWrap: {
  flex: 1,
  gap: 4,
},

aiAssistBannerTitle: {
  color: TACTICAL.amber,
  fontSize: 11,
  fontWeight: '900',
  letterSpacing: 1.2,
},

aiAssistBannerText: {
  color: TACTICAL.text,
  fontSize: 12,
  lineHeight: 17,
},

pinCountBubble: {
  minWidth: 18,
  height: 18,
  marginLeft: 6,
  paddingHorizontal: 4,
  borderRadius: 9,
  alignItems: 'center',
  justifyContent: 'center',
  backgroundColor: 'rgba(212,160,23,0.18)',
  borderWidth: 1,
  borderColor: 'rgba(212,160,23,0.4)',
},

pinCountText: {
  color: TACTICAL.amber,
  fontSize: 10,
  fontWeight: '900',
},

pinModeBanner: {
  position: 'absolute',
  left: 16,
  right: undefined,
  zIndex: NAV_OVERLAY_Z.utility,
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'flex-start',
  gap: 7,
  paddingHorizontal: 11,
  paddingVertical: 7,
  borderRadius: 12,
  backgroundColor: 'rgba(10,14,18,0.92)',
  borderWidth: 1,
  borderColor: 'rgba(212,160,23,0.28)',
},

pinModeBannerText: {
  color: TACTICAL.amber,
  fontSize: 10,
  fontWeight: '900',
  letterSpacing: 1.05,
},

  // â”€â”€ Export Modal â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  exportOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'center', alignItems: 'center' },
  exportContainer: {
    backgroundColor: TACTICAL.panel, borderRadius: 16, padding: 20,
    width: '85%', maxWidth: 360,
    borderWidth: 1, borderColor: TACTICAL.amber + '30',
  },
  exportHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  exportTitle: { ...TYPO.T2, color: TACTICAL.amber },
  exportSub: { ...TYPO.B2, color: TACTICAL.textMuted, fontSize: 11, marginBottom: 16 },
  exportActions: { flexDirection: 'row', gap: 10 },
  exportBtn: {
    flex: 1, alignItems: 'center', gap: 6,
    paddingVertical: 16, borderRadius: 10,
    borderWidth: 1, borderColor: TACTICAL.border,
    backgroundColor: 'rgba(62,79,60,0.06)',
  },
  exportBtnLabel: { ...TYPO.U2, color: TACTICAL.amber, fontSize: 9, letterSpacing: 3 },
  exportBtnSub: { ...TYPO.B2, color: TACTICAL.textMuted, fontSize: 8 },

  // â”€â”€ Snapshot Modal â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'flex-end' },
  modalContainer: {
    backgroundColor: TACTICAL.panel, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    maxHeight: '90%', borderTopWidth: 2, borderColor: TACTICAL.amber + '40',
    paddingBottom: Platform.OS === 'web' ? 20 : 40,
  },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: DENSITY.modalPad, borderBottomWidth: GOLD_RAIL.sectionWidth, borderBottomColor: GOLD_RAIL.section,
  },


  modalTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  modalTitle: { ...TYPO.T2, color: TACTICAL.amber },
  fileNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: DENSITY.modalPad, paddingTop: 12, paddingBottom: 4 },
  fileName: { ...TYPO.K3, color: TACTICAL.text, fontSize: 11 },
  modalSectionTitle: { ...TYPO.T4, color: TACTICAL.amber, paddingHorizontal: DENSITY.modalPad, marginTop: 14 },
  modalSectionSub: { ...TYPO.B2, fontSize: 10, paddingHorizontal: DENSITY.modalPad, marginTop: 4, marginBottom: 12 },

  formGrid: { paddingHorizontal: DENSITY.modalPad, gap: 10 },
  formField: { gap: 4 },
  formLabel: { ...TYPO.T4, fontSize: 8, letterSpacing: 3 },
  formInput: {
    ...TYPO.B1, color: TACTICAL.text,
    backgroundColor: 'rgba(62,79,60,0.08)',
    borderWidth: 1, borderColor: TACTICAL.border, borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 10,
  },

  modalActions: { flexDirection: 'row', gap: 10, padding: DENSITY.modalPad, paddingTop: 16 },
  quickImportBtn: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingVertical: 13, borderRadius: 10, borderWidth: 1, borderColor: TACTICAL.border,
  },
  quickImportBtnText: { ...TYPO.U2, color: TACTICAL.textMuted, fontSize: 9 },
  createRunBtn: {
    flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 13, borderRadius: 10, backgroundColor: TACTICAL.amber,
  },
  createRunBtnText: { ...TYPO.U1, color: '#0B0F12', letterSpacing: 3 },
  mapOverlayRoot: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 109,
    pointerEvents: 'box-none',
  },

  topRightOverlay: {
  position: 'absolute',
  top: 14,
  right: 14,
  zIndex: 110,
},

  mapStylePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(10,14,18,0.94)',
    borderRadius: 16,
    padding: 4,
    borderWidth: 1,
    borderColor: 'rgba(196,138,44,0.28)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.32,
    shadowRadius: 10,
    elevation: 12,
  },

  mapStyleSegment: {
    minWidth: 58,
    height: 42,
    paddingHorizontal: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },

  mapStyleSegmentActive: {
    backgroundColor: 'rgba(196,138,44,0.95)',
    borderWidth: 1,
    borderColor: 'rgba(255,220,140,0.35)',
  },

  mapStyleSegmentText: {
    color: TACTICAL.textMuted,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
  },

  mapStyleSegmentTextActive: {
    color: '#091014',
    fontWeight: '900',
  },

  bottomLeftOverlay: {
    position: 'absolute',
    left: 14,
    zIndex: 110,
  },

  intelPill: {
    height: 42,
    minWidth: 110,
    paddingHorizontal: 16,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: 'rgba(10,14,18,0.94)',
    borderWidth: 1,
    borderColor: 'rgba(196,138,44,0.28)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.32,
    shadowRadius: 10,
    elevation: 12,
  },

  intelPillActive: {
    backgroundColor: 'rgba(196,138,44,0.95)',
    borderColor: 'rgba(255,220,140,0.35)',
  },

  intelPillText: {
  color: TACTICAL.text,
  fontSize: 11,
  fontWeight: '800',
  letterSpacing: 2.2,
  marginTop: 6,
},

  intelPillTextActive: {
    color: '#091014',
  },

  intelPanelPremium: {
    position: 'absolute',
    left: 14,
    width: 290,
    padding: 14,
    borderRadius: 18,
    backgroundColor: 'rgba(10,14,18,0.97)',
    borderWidth: 1,
    borderColor: 'rgba(196,138,44,0.24)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.36,
    shadowRadius: 14,
    elevation: 16,
    zIndex: 111,
  },

  bottomRouteOverlay: {
  position: 'absolute',
  left: 16,
  right: 16,
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 40,
  elevation: 40,
  pointerEvents: 'box-none',
},

  activeRouteBanner: {
  width: '100%',
  maxWidth: 520,
  minHeight: 58,
  borderRadius: 16,
  paddingHorizontal: 16,
  paddingVertical: 12,
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'space-between',
  backgroundColor: 'rgba(10, 12, 15, 0.92)',
  borderWidth: 1,
  borderColor: 'rgba(255, 184, 0, 0.22)',
},

  activeRouteLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 0,
  },

  activeRouteDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#68D391',
    marginRight: 10,
  },

  activeRouteTitle: {
    flex: 1,
    color: TACTICAL.text,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.8,
  },

  activeRouteRight: {
    marginLeft: 10,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },

  activeRouteDistance: {
    color: TACTICAL.amber,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1,
  },

  legacyMinimizeBtn: {
    position: 'absolute',
    right: 14,
    zIndex: 108,
  },

legacyMapStyleContainer: {
  position: 'absolute',
  right: 16,
  top: 140,
  flexDirection: 'column',
  alignItems: 'stretch',
  padding: 4,
  borderRadius: 16,
  backgroundColor: 'rgba(10,14,18,0.94)',
  borderWidth: 1,
  borderColor: 'rgba(196,138,44,0.28)',
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.32,
  shadowRadius: 10,
  elevation: 12,
  zIndex: 110,
},

legacyMapStyleButton: {
  minWidth: 60,
  height: 34,
  paddingHorizontal: 14,
  borderRadius: 10,
  alignItems: 'center',
  justifyContent: 'center',
},

legacyMapStyleButtonActive: {
  backgroundColor: 'rgba(196,138,44,0.95)',
  borderColor: 'rgba(255,220,140,0.35)',
},

legacyMapStyleButtonText: {
  color: TACTICAL.amber,
  fontSize: 11,
  fontWeight: '900',
  letterSpacing: 1.2,
},

legacyMapStyleButtonTextActive: {
  color: '#091014',
},

intelBtn: {
  position: 'absolute',
  right: 14,
  flexDirection: 'row',
  alignItems: 'center',
  gap: 7,
  paddingHorizontal: 14,
  paddingVertical: 9,
  borderRadius: 14,
  backgroundColor: 'rgba(10,14,18,0.92)',
  borderWidth: 1,
  borderColor: 'rgba(196,138,44,0.24)',
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.28,
  shadowRadius: 10,
  elevation: 10,
  zIndex: 121,
},

intelBtnActive: {
  backgroundColor: 'rgba(196,138,44,0.96)',
  borderColor: 'rgba(255,220,140,0.35)',
},

intelText: {
  fontSize: 11,
  color: TACTICAL.amber,
  fontWeight: '900',
  letterSpacing: 1.2,
},

intelPanel: {
  position: 'absolute',
  left: 14,
  right: 14,
  backgroundColor: 'rgba(10,14,18,0.96)',
  borderRadius: 16,
  padding: 12,
  borderWidth: 1,
  borderColor: 'rgba(196,138,44,0.22)',
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 6 },
  shadowOpacity: 0.32,
  shadowRadius: 12,
  elevation: 14,
  zIndex: 119,
},

intelPanelHeader: {
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'space-between',
  marginBottom: 10,
},

intelPanelTitleWrap: {
  flexDirection: 'row',
  alignItems: 'center',
  gap: 8,
},

intelPanelTitle: {
  color: TACTICAL.amber,
  fontSize: 12,
  fontWeight: '900',
  letterSpacing: 1.3,
},

intelPanelSubtitle: {
  color: TACTICAL.textMuted,
  fontSize: 9,
  fontWeight: '700',
  letterSpacing: 1.0,
  marginTop: 2,
},

intelPanelGrid: {
  flexDirection: 'row',
  gap: 10,
},

intelCard: {
  flex: 1,
  minHeight: 84,
  borderRadius: 12,
  padding: 10,
  backgroundColor: 'rgba(255,255,255,0.025)',
  borderWidth: 1,
  borderColor: 'rgba(196,138,44,0.14)',
  justifyContent: 'space-between',
},

intelCardTop: {
  flexDirection: 'row',
  alignItems: 'center',
  gap: 8,
},

intelCardLabel: {
  color: TACTICAL.amber,
  fontSize: 10,
  fontWeight: '900',
  letterSpacing: 1.2,
},

intelCardTitle: {
  color: TACTICAL.text,
  fontSize: 11,
  fontWeight: '800',
},

intelCardMeta: {
  color: TACTICAL.textMuted,
  fontSize: 9,
  fontWeight: '600',
  letterSpacing: 0.2,
},
});



