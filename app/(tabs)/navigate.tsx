/**
 * Navigate Tab - ECS Tactical Navigation Center (Redesigned)
 *
 * Zero-scroll, map-primary layout.
 * Compact shell header with map-primary controls routed through Tools.
 * All configuration opens as modal sheets.
 *
 * Layout: Header -> Map (fills remaining space)
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
  Easing,
} from 'react-native';
import { SafeIcon as Ionicons } from '../../components/SafeIcon';
import { hapticMicro, hapticCommand } from '../../lib/haptics';
import { runtimeSmokeStore } from '../../lib/ai/runtimeSmokeStore';

import TabErrorBoundary from '../../components/TabErrorBoundary';
import ExpeditionAnalysisModal from '../../components/discover/ExpeditionAnalysisModal';

// -- Phase 15: Stability Guards ------------------------------
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
  createDefaultBuildSnapshot,
  type ECSRun,
  type BuildSnapshot,
} from '../../lib/runStore';

import { routeStore } from '../../lib/routeStore';
import {
  calculateSavedRouteAssetCounts,
  filterSavedRouteAssets,
  getSavedRouteAssetEmptyState,
  getSavedRouteAssets,
  type SavedRouteAsset,
  type SavedRouteAssetFilter,
} from '../../lib/savedRouteAssets';
import {
  buildExpeditionPreflightRoutePacket,
  type ExpeditionPreflightRoutePacket,
} from '../../lib/expeditionPreflightRoutePacket';
import { expeditionLaunchHandoffStore } from '../../lib/expeditionLaunchHandoffStore';
import { expeditionStateStore } from '../../lib/expeditionStateStore';
import { recordBriefCadEntry } from '../../lib/briefCadLogStore';
import {
  getExploreFavoritesSnapshot,
  hydrateExploreFavoritesStore,
  removeFavoriteTrailBySourceId,
  removeFavoriteTrailPlan,
  subscribeExploreFavorites,
  upsertFavoriteTrailPlan,
} from '../../lib/exploreFavoritesStore';
import { vehicleSessionState } from '../../lib/vehicleSessionState';
import {
  getMapboxToken,
  getMapboxTokenSync,
  clearTokenCache,
  setMapboxToken,
  setMapboxTokenAsync,
  DEFAULT_MAP_STYLE,
  type MapStyleKey,
} from '../../lib/mapConfig';
import {
  isDispersedCampingEligibilityLayerAvailable,
  type DispersedCampingRegion,
  type DispersedCampingRegionSelectionPayload,
} from '../../lib/map/dispersedCampingTypes';
import { toDispersedCampingFeatureCollection } from '../../lib/map/dispersedCampingGeojsonAdapter';
import {
  DISPERSED_CAMPING_EDGE_FUNCTION,
  DISPERSED_CAMPING_CACHE_TTL_MS,
} from '../../lib/map/dispersedCampingMobile';
import { fetchDispersedCampingEligibilityForMap } from '../../lib/map/dispersedCampingSearchClient';
import { CampLayerFetchCoordinator } from '../../lib/map/campLayerFetchScheduler';
import {
  getCampLayerZoomPrompt,
  isCampLayerZoomEligible,
} from '../../lib/map/campLayerZoom';
import {
  createCampLayerUiState,
  setCampLayerEnabled,
  setCampLayerFetchFailed,
  setCampLayerFetchSkipped,
  setCampLayerFetchSucceeded,
  setCampLayerLoading,
  setCampLayerZoomDeferred,
  type CampLayerUiState,
} from '../../lib/map/campLayerUiState';
import {
  isEstablishedCampsitesLayerAvailable,
  type EstablishedCampsite,
} from '../../lib/map/establishedCampsiteTypes';
import { toEstablishedCampsiteFeatureCollection } from '../../lib/map/establishedCampsiteGeojsonAdapter';
import {
  ESTABLISHED_CAMPGROUNDS_EDGE_FUNCTION,
  ESTABLISHED_CAMPGROUNDS_CACHE_TTL_MS,
  mapCampgroundSearchRecordsToEstablishedCampsites,
} from '../../lib/map/establishedCampgroundMobile';
import {
  fetchEstablishedCampgroundDetail,
  fetchEstablishedCampgroundsForMap,
} from '../../lib/map/establishedCampgroundSearchClient';
import {
  readDispersedCampingOfflineCache,
  readEstablishedCampgroundsOfflineCache,
  resolveCampLayerOfflineCacheLookup,
  writeDispersedCampingOfflineCache,
  writeEstablishedCampgroundsOfflineCache,
} from '../../lib/map/campLayerOfflineCache';
import {
  DEFAULT_ESTABLISHED_CAMPSITE_ROUTE_CORRIDOR_MILES,
  findEstablishedCampsitesNearRoute,
  hasRouteGeometryForEstablishedCampsiteSearch,
  type RouteNearbyEstablishedCampsite,
} from '../../lib/map/establishedCampsiteRouteSearch';
import {
  DEFAULT_DISPERSED_CAMPING_ROUTE_CORRIDOR_MILES,
  findDispersedCampingRegionsNearRoute,
  getDispersedCampingRouteDistanceByRegionId,
  getDispersedCampingRouteNearbyIdSet,
  hasRouteGeometryForDispersedCampingSearch,
  type RouteNearbyDispersedCampingRegion,
} from '../../lib/map/dispersedCampingRouteSearch';
import {
  buildRoadRouteFromCachedGeometry,
  type RoadNavCoordinate,
  type RoadNavDestination,
  type RoadNavRoute,
  type RoadNavSearchSuggestion,
} from '../../lib/mapboxRoadNavigation';
import {
  DEFAULT_DISTANCE_RADIUS,
  loadOpportunitiesWithCompatibility,
  type ExpeditionOpportunity,
} from '../../lib/discoverEngine';
import { aiRouteStore } from '../../lib/aiRouteStore';
import {
  buildExploreRouteOverlaySegments,
  buildExploreRouteOverlaySignature,
  EXPLORE_ROUTES_AI_CATEGORY,
  type ExploreRouteOverlaySegment,
} from '../../lib/navigateExploreRoutesOverlay';
import {
  clearExploreRoutesMapHandoff,
  consumeExploreRoutesMapHandoff,
  type ExploreRoutesMapHandoff,
} from '../../lib/exploreRoutesMapHandoff';
import {
  loadRecentRoadSearches,
  rememberRecentRoadSearch,
} from '../../lib/navigateRecentSearchStore';
import { navigateRouteSessionStore } from '../../lib/navigateRouteSessionStore';
import { logRouteGeometryLifecycle, validateRouteGeometry } from '../../lib/routeGeometryLifecycle';
import { normalizeRouteLifecycle } from '../../lib/routeLifecycleState';
import { createMigratingNonSecureStorage } from '../../lib/nonSecureStorage';
import {
  hideDashboardDockReveal,
  revealDashboardDock,
  setDashboardExpanded,
} from '../../lib/dashboardChromeStore';



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
  CampScoutMapMarkerPayload,
  PinMarker,
  RouteBuilderSegmentData,
  RouteBuilderUpdatePayload,
  SegmentSelectionPayload,
  TrailSegmentData,
  SpeedSegmentData,
} from '../../components/navigate/MapRenderer';

// -- Remoteness Store import for campsite scoring (Phase 2) --
import { remotenessStore } from '../../lib/remotenessStore';

// -- Tilt Alert Zones imports --------------------------------
import {
  useTiltAlertMarkers,
  TiltAlertDetailModal,
  type TiltAlertMarker,
} from '../../components/navigate/TiltAlertZonesLayer';

import {
  loadAlertHistory,
  type TiltAlertEvent,
} from '../../lib/tiltAlertStore';

// -- Weather Alert Layer imports -----------------------------
import {
  useWeatherAlerts,
  WeatherAlertMapOverlay,
  WeatherAlertDetailModal,
} from '../../components/navigate/WeatherAlertLayer';
import WeatherIntelPanel from '../../components/weather/WeatherIntelPanel';

// -- Route Corridor Weather imports --------------------------
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
import CommunityCampsiteDetailCard from '../../components/navigate/CommunityCampsiteDetailCard';
import CampsiteVisibilityDetailCard from '../../components/navigate/CampsiteVisibilityDetailCard';
import GroupCampsiteMarkerDetailCard from '../../components/navigate/GroupCampsiteMarkerDetailCard';
import PinDetailsModal from '../../components/navigate/PinDetailsModal';
import PinDrawer from '../../components/navigate/PinDrawer';
import RecommendCampsiteForm from '../../components/navigate/RecommendCampsiteForm';
import RecommendCampsiteGpxImportReview from '../../components/navigate/RecommendCampsiteGpxImportReview';
import ReplayBar, { type ReplaySpeed } from '../../components/navigate/ReplayBar';
import TrailStatusModal from '../../components/navigate/TrailStatusModal';
import TrailPackSubmissionModal from '../../components/trailPacks/TrailPackSubmissionModal';
import CompassRose from '../../components/navigate/CompassRose';
import OfflineCacheModal, {
  type DownloadedSyncOpenTarget,
} from '../../components/navigate/OfflineCacheModal';
import StorageWarningBanner from '../../components/navigate/StorageWarningBanner';
import StorageDashboardModal from '../../components/offline-maps/StorageDashboardModal';
import RoadNavigationOverlay from '../../components/navigate/RoadNavigationOverlay';
import NavigateReadinessStrip from '../../components/navigate/NavigateReadinessStrip';
import StartExpeditionDecisionSheet from '../../components/readiness/StartExpeditionDecisionSheet';
import { ECSTransientNotice } from '../../components/ECSLoading';

import { trailHistoryStore } from '../../lib/trailHistoryStore';
import {
  trailPackRouteInputFromNavigationPayload,
  trailPackRouteInputFromSavedTrail,
  type ECSTrailPackSubmission,
  type ECSTrailPackSubmissionRouteInput,
} from '../../lib/explore/trailPackSubmissions';
import { routeAnalysisEngine, type RouteIntelligence } from '../../lib/routeAnalysisEngine';
import {
  buildExploreRoutePreviewCameraCommand,
  getExploreRoutePreviewRoutePoints,
} from '../../lib/exploreRoutePreview';

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
import {
  MAX_CAMPSITE_MARKERS,
  ROUTE_CAMPSITE_BUFFER_MILES,
  distancePointToRoutePolyline,
  locateCampsiteResultForPolygon,
  locateCampsiteResultForRoute,
  pointInPolygon,
} from '../../lib/campsites/campsiteLocatorService';
import {
  buildRouteCampsiteLocatorInput,
  buildRouteCampsiteLocatorSignature,
  normalizeRouteCampsiteCoordinates,
  type RouteCampsiteContext,
} from '../../lib/campsites/routeCampsiteLocatorAdapter';
import type { CampSiteReportSourceType } from '../../lib/campsites/campsiteRecommendationTypes';
import {
  buildPrivateSaveInputFromCommunityCampsite,
  createCommunityCampsiteBoundsQuery,
  fetchApprovedCommunityCampsitesForViewport,
  toCommunityCampsiteMarkerPayload,
  type CommunityCampsiteMarkerPayload,
} from '../../lib/campsites/communityCampsiteMapLayer';
import {
  fetchGroupCampsitesForViewport,
  getGroupCampsiteTarget,
  toGroupCampsiteMarkerPayload,
  type GroupCampsiteMarkerPayload,
} from '../../lib/campsites/groupCampsiteMapLayer';
import {
  CAMPSITE_VISIBILITY_LAYER_TOGGLES,
  DEFAULT_CAMPSITE_LAYER_VISIBILITY,
  fetchPendingCommunitySubmissionsForViewport,
  fetchPrivateCampsitesForViewport,
  fetchReviewerPendingCampsitesForViewport,
  toPendingCampsiteMarkerPayload,
  toPrivateCampsiteMarkerPayload,
  toReviewerPendingCampsiteMarkerPayload,
  type CampsiteVisibilityLayerScope,
  type ScopedCampsiteMarkerPayload,
} from '../../lib/campsites/campsiteVisibilityMapLayers';
import {
  gpxCampsiteImportService,
  gpxUploadResultToCampsiteImportResult,
  validateGpxCampsiteImportFile,
  type GpxCampsiteImportResult,
} from '../../lib/campsites/gpxCampsiteImport';
import {
  submitGpxImportOfflineSafe,
} from '../../lib/campsites/gpxCampsiteOfflineQueue';
import {
  campsiteRecommendationService,
  type CampSiteReportResponse,
  type CampSitePhotoResponse,
  type PublicCampSite,
} from '../../lib/campsites/campsiteRecommendationService';
import {
  campSiteGroupSharingService,
  type CampSiteGroupListItem,
  type GroupCampSiteItem,
} from '../../lib/campsites/campsiteGroupSharingService';
import {
  campsiteReviewService,
  type CampSiteReviewQueueItem,
} from '../../lib/campsites/campsiteReviewService';
import {
  DEFAULT_COMMUNITY_CAMPSITES_ROLLOUT_CONFIG,
  isCommunityCampsitesFeatureEnabled,
} from '../../lib/communityCampsitesRolloutConfig';
import type { RemotenessIndexOutput } from '../../lib/remotenessTypes';
import { buildRemoteMapOverlay } from '../../lib/remote/mapOverlay';
import { getRemoteCacheFallbackScore } from '../../lib/remote/offlineRemoteCache';
import { buildNavigateRouteConfidenceSummary } from '../../lib/remote/routeConfidenceSummary';
import {
  useCampIntel,
  type CampIntelRouteWeatherSnapshot,
} from '../../lib/campIntel/useCampIntel';
import type { CampIntelMarkerPayload } from '../../lib/campIntel/campIntelTypes';
import { useCampIntelMarkerLayer } from '../../components/navigate/CampIntelMarkerLayer';
import CampIntelDetailCard from '../../components/navigate/CampIntelDetailCard';
import CampScoutIntelCard from '../../components/navigate/CampScoutIntelCard';
import DispersedCampingRouteSummary from '../../components/navigate/DispersedCampingRouteSummary';
import DispersedCampingRegionSheet from '../../components/navigate/DispersedCampingRegionSheet';
import DroppedPinDetailSheet from '../../components/navigate/DroppedPinDetailSheet';
import EstablishedCampsitesRouteSummary from '../../components/navigate/EstablishedCampsitesRouteSummary';
import EstablishedCampsiteSheet from '../../components/navigate/EstablishedCampsiteSheet';
import {
  CAMP_SCOUT_MAX_ESTIMATED_CANDIDATES,
  CAMP_SCOUT_MAX_VIABLE_SLOPE_ESTIMATE,
  CAMP_SCOUT_MIN_ACCESS_CONFIDENCE,
  CAMP_SCOUT_MIN_DISPLAY_SCORE,
  CAMP_SCOUT_MIN_LEGALITY_CONFIDENCE,
  CAMP_SCOUT_MIN_REMOTENESS_SCORE,
  CAMP_SCOUT_MIN_TERRAIN_CONFIDENCE,
  getCampScoutConfidenceGrade,
  rankCampScoutCandidates,
  validateCampScoutArea,
  type CampScoutCandidate,
  type CampScoutAreaSelectionMode,
  type CampScoutFilterMode,
  type CampScoutFilterOptions,
  type CampScoutLegalityStatus,
} from '../../lib/campScout';
import { buildDispersedCampingCampScoutCandidates } from '../../lib/campops/campCandidateScoring';
import {
  buildCampOpsCampScoutMapPins,
  isCampOpsMapPinPayload,
} from '../../lib/campops/campOpsMapPins';
import { buildCampOpsCampIntelViewModel } from '../../lib/campops/campOpsCampIntelViewModel';
import {
  CAMPOPS_NO_ROUTE_CANDIDATES_MESSAGE,
  CAMPOPS_ROUTE_SCAN_ERROR_MESSAGE,
  CAMPOPS_ROUTE_SCAN_LOADING_MESSAGE,
  IDLE_CAMPOPS_LIFECYCLE_STATE,
  buildCampOpsLifecycleKey,
  campOpsLifecycleStateFromResult,
  createCampOpsLifecycleCache,
  type CampOpsLifecycleState,
} from '../../lib/campops/campOpsLifecycle';
import {
  getCampOpsRoutePinsRolloutConfig,
  isCampOpsRoutePinsFeatureEnabled,
} from '../../lib/campops/campOpsRecommendationConfig';

// -- VCD Adaptive Panel State Engine -------------------------
import { useVCDPanelStates } from '../../lib/vcdPanelStateEngine';
import VCDAdaptivePanel from '../../components/navigate/VCDAdaptivePanel';

// -- Intelligence Panels -------------------------------------
import RouteAnalysisPanel from '../../components/navigate/RouteAnalysisPanel';
import ResourceForecastPanel from '../../components/navigate/ResourceForecastPanel';
import TerrainAnalysisPanel from '../../components/navigate/TerrainAnalysisPanel';
import ExpeditionForecastPanel from '../../components/dashboard/ExpeditionForecastPanel';

import useECSAIHook from '../../lib/ai/useECSAI';
import { buildAIContextFromLiveState } from '../../lib/aiContextBuilder';
import { generateMissionBrief, type MissionBrief, type AssistSurface, type AutonomousAssistRule } from '../../lib/missionBriefEngine';
import {
  buildNavigateMissionBriefFallback,
  buildNavigateMissionBriefLiveState,
} from '../../lib/navigateMissionBriefContext';
import { selectNavigateCommandState } from '../../lib/navigateCommandSelectors';
import MissionBriefCard from '../../components/dashboard/MissionBriefCard';

import {
  tileCacheStore,
  type TileBounds,
  type TileCacheStats,
} from '../../lib/tileCacheStore';
import {
  cacheOfflineRoute,
  listOfflineCachedRoutes,
  offlineCachedRouteToRunCacheManifest,
  type OfflineCachedRoute,
  type OfflineRouteIntentMetadata,
} from '../../lib/offlineRouteCacheService';
import { fsReadFileFromPickerUri } from '../../lib/fsCompat';
import {
  connectivity,
  type ConnectivityDetailedState,
} from '../../lib/connectivity';
import {
  offlineTileSyncCoordinator,
  type OfflineTileSyncJob,
} from '../../lib/offlineTileSyncCoordinator';

import { useThrottledGPS, type ThrottledGPSOutput } from '../../lib/useThrottledGPS';
import { useOperationalWeather } from '../../lib/useOperationalWeather';
import { buildUnifiedWeatherCorridor } from '../../lib/weatherSurfaceSelectors';
import type { WeatherCoordinate } from '../../lib/weatherTypes';
import { useRemoteWeatherRouteWatcher } from '../../lib/remote/useRemoteWeatherRouteWatcher';
import { useVehicleHeading, type CompassMode } from '../../lib/useVehicleHeading';
import { useRoadNavigation } from '../../lib/useRoadNavigation';
import { useTrailNavigation } from '../../lib/useTrailNavigation';
import { analyzeRoute, type RouteAnalysis } from '../../lib/routeTileCacheEngine';
import { evaluateCacheReadiness } from '../../lib/offlineCacheAwarenessEngine';
import { deriveOfflineReadiness } from '../../lib/offlineReadinessPresentation';
import { deriveRouteConfidence } from '../../lib/routeConfidencePresentation';
import {
  buildRouteGuidanceReadinessViewModel,
  type RouteGuidanceReadinessViewModel,
  type RouteGuidanceVehicleFitInput,
} from '../../lib/routeGuidanceReadinessPresentation';
import {
  buildExploreNavigationPayload,
  canStageNavigationHandoffRoute,
  classifyNavigationHandoff,
  clearNavigationHandoffPayload,
  computeTrailLengthMiles,
  getNavigationHandoffRouteUnavailableReason,
  getRoadDestinationCoordinate,
  loadNavigationHandoffPayload,
  saveNavigationHandoffPayload,
  toRoadDestinationFromHandoff,
  type NavigationHandoffPayload,
  type NavigationTripMode,
} from '../../lib/navigationHandoffStore';
import {
  hasActiveGuidanceReplacementConfirmation,
  isActiveGuidanceSnapshot,
  isNavigationHandoffForActiveGuidance,
  shouldProtectActiveGuidanceFromHandoff,
} from '../../lib/navigationActiveGuidanceGuard';
import {
  extractExploreRouteCampMarkers,
  type ExploreRouteCampMarker,
} from '../../lib/exploreRouteCampHandoff';
import { consumeNavigationFlow, type ECSNavigationFlow } from '../../lib/ecsNavigationFlow';
import { saveTripBuilderRouteHandoff } from '../../lib/tripBuilder/tripBuilderRouteHandoffStore';
import { saveOfflinePrepPackHandoff } from '../../lib/offlinePrepPack';
import type {
  CompatibilityResult,
  VehicleProfile,
} from '../../lib/rigCompatibilityEngine';

import GPSStatusOverlay from '../../components/navigate/GPSStatusOverlay';
import { getCommandDockHeight } from '../../lib/shellLayout';
import { ECS_STATE_COPY } from '../../lib/ecsStateCopy';
import { reportDegradedState } from '../../lib/ecsIssueIntelligence';
import { useAdaptiveLayout } from '../../lib/useAdaptiveLayout';
import { dashboardStore } from '../../lib/dashboardStore';
import {
  buildReadinessCampCandidatesFromCampOps,
  buildReadinessCampCandidatesFromCampScout,
  buildReadinessCampCandidatesFromMapPins,
  buildStartExpeditionAcknowledgement,
  expeditionReadinessStore,
  mergeReadinessCampCandidateSets,
  recordStartExpeditionReadinessAcknowledgement,
  shouldShowStartExpeditionReadinessReview,
  type StartExpeditionReviewReason,
  useCurrentExpeditionReadiness,
} from '../../lib/readiness';

import {
  runStartupCleanup,
  analyzeCache,
  type CleanupReport,
  type CleanupResult,
} from '../../lib/tileAutoCleanup';

import { runAutoCleanupCheck } from '../../lib/storageCleanupEngine';

// -- Road Classification Bridge -> Dashboard Mode Engine ------
import { roadClassificationBridge } from '../../lib/roadClassificationBridge';
import { dashboardModeEngine } from '../../lib/dashboardModeEngine';




// -- Tilt Alert Zones localStorage key -----------------------
const TILT_ZONES_VISIBLE_KEY = 'ecs_tilt_alert_zones_visible';
const MAP_STYLE_MODE_STORAGE_KEY = 'ecs_map_style_mode';
const CAMPSITE_LAYER_VISIBILITY_STORAGE_KEY = 'ecs_campsite_layer_visibility_v1';
const CAMPSITE_DRAWINGS_STORAGE_KEY = 'ecs_campsite_search_drawings_v1';
const OFFLINE_SYNC_COMPLETION_NOTICE_DISMISSED_STORAGE_KEY =
  'ecs_offline_sync_completion_notice_dismissed_v1';
const navigatePreferenceStorage = createMigratingNonSecureStorage('ecs_navigate_preferences', {
  logTag: 'NavigatePreferences',
});
const CAMPOPS_ROUTE_PINS_ENABLED = isCampOpsRoutePinsFeatureEnabled();
const CAMPOPS_ROUTE_PINS_ROLLOUT_CONFIG = getCampOpsRoutePinsRolloutConfig();
const CAMPOPS_ROUTE_RESULT_CACHE_LIMIT = 6;
const NAV_AI_ASSIST_FADE_IN_MS = 180;
const NAV_AI_ASSIST_FADE_OUT_MS = 220;
const NAV_AI_ASSIST_VISIBLE_MS = 7000;

function logNavigateDev(...args: unknown[]) {
  const globalStore = globalThis as typeof globalThis & { __ECS_NAVIGATE_DEBUG__?: boolean };
  if (
    typeof __DEV__ !== 'undefined' &&
    __DEV__ &&
    (globalStore.__ECS_NAVIGATE_DEBUG__ === true ||
      (typeof process !== 'undefined' && process.env.EXPO_PUBLIC_ECS_NAVIGATE_DEBUG === '1'))
  ) {
    console.log(...args);
  }
}

function isCampScoutDebugEnabled(): boolean {
  return (
    typeof __DEV__ !== 'undefined' &&
    __DEV__ &&
    ((globalThis as typeof globalThis & { __ECS_CAMP_DEBUG__?: boolean }).__ECS_CAMP_DEBUG__ === true ||
      (typeof process !== 'undefined' && process.env.EXPO_PUBLIC_ECS_CAMP_DEBUG === '1'))
  );
}

function logCampScoutDebug(stage: string, payload: Record<string, unknown>) {
  if (isCampScoutDebugEnabled()) {
    console.log('[CAMP_SCOUT_DEBUG]', stage, payload);
  }
}

function isCampLayerVerboseDebugEnabled(): boolean {
  return (
    typeof __DEV__ !== 'undefined' &&
    __DEV__ &&
    (((globalThis as typeof globalThis & { __ECS_CAMP_LAYER_DEBUG__?: boolean }).__ECS_CAMP_LAYER_DEBUG__ === true) ||
      ((globalThis as typeof globalThis & { __ECS_CAMP_DEBUG__?: boolean }).__ECS_CAMP_DEBUG__ === true) ||
      (typeof process !== 'undefined' &&
        (process.env.EXPO_PUBLIC_ECS_CAMP_LAYER_DEBUG === '1' ||
          process.env.EXPO_PUBLIC_ECS_CAMP_DEBUG === '1')))
  );
}

function isCampLayerFailureDebugStage(stage: string): boolean {
  return stage.includes('error') || stage.includes('exception');
}

function roundCampLayerCoord(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return Number(value.toFixed(2));
}

function sanitizeCampLayerBbox(
  bbox:
    | {
        minLng: number;
        minLat: number;
        maxLng: number;
        maxLat: number;
      }
    | null
    | undefined,
) {
  if (!bbox) return null;
  return {
    minLng: roundCampLayerCoord(bbox.minLng),
    minLat: roundCampLayerCoord(bbox.minLat),
    maxLng: roundCampLayerCoord(bbox.maxLng),
    maxLat: roundCampLayerCoord(bbox.maxLat),
  };
}

function countGeoJsonFeatures(value: unknown): number {
  if (!value || typeof value !== 'object') return 0;
  const features = (value as { features?: unknown }).features;
  return Array.isArray(features) ? features.length : 0;
}

function logCampLayerDebug(stage: string, payload: Record<string, unknown> = {}) {
  const verbose = isCampLayerVerboseDebugEnabled();
  const failure = isCampLayerFailureDebugStage(stage);
  if (!verbose && !failure) return;

  if (failure) {
    console.warn('[CAMP_LAYER_DEBUG]', stage, payload);
  } else {
    console.log('[CAMP_LAYER_DEBUG]', stage, payload);
  }
}

function isCampLayerDiagnosticsVisible(): boolean {
  return (
    typeof __DEV__ !== 'undefined' &&
    __DEV__
  ) || isCampScoutDebugEnabled();
}

function formatCampLayerErrorDiagnostic(diagnostic?: CampLayerUiState['diagnostic']): string | null {
  if (!diagnostic) return null;
  const status = diagnostic.status != null ? `status ${diagnostic.status}` : 'status n/a';
  const code = diagnostic.errorCode || diagnostic.errorName || 'code n/a';
  return `${diagnostic.layer} - ${status} - ${code} - ${diagnostic.endpoint}`;
}

function normalizeCampScoutLegalityStatus(value: unknown): CampScoutLegalityStatus | undefined {
  return value === 'verified_allowed' ||
    value === 'likely_allowed_needs_verification' ||
    value === 'unknown_needs_verification' ||
    value === 'restricted_or_not_allowed'
    ? value
    : undefined;
}

type NavigateMapStyleMode = 'day' | 'tac' | 'sat' | '3d';
let cachedMapStyleModePreference: NavigateMapStyleMode | null = null;

type CampsiteSearchPolygonPoint = { latitude: number; longitude: number };
type PolygonCampsiteSuggestion = CampsiteCandidateResult['suggestedCampsites'][number];
type SavedCampsiteSearchDrawing = {
  id: string;
  name: string;
  coordinates: CampsiteSearchPolygonPoint[];
  polygonCoordinates?: CampsiteSearchPolygonPoint[];
  centerCoordinate?: CampsiteSearchPolygonPoint | null;
  campsiteCandidateIds?: string[];
  campsiteCandidates?: PolygonCampsiteSuggestion[];
  source?: 'user_polygon';
  createdAt?: string;
  savedAt: string;
};
type PolygonRouteDesignContext = {
  source: 'polygon';
  polygonId: string;
  polygonCoordinates: CampsiteSearchPolygonPoint[];
  campsiteCandidates: PolygonCampsiteSuggestion[];
};
type CampsiteBounds = { minLat: number; minLng: number; maxLat: number; maxLng: number };
type CampMapMarker = CampIntelMarkerPayload & {
  markerKind?: string;
  communityCampSiteId?: string;
  groupShareId?: string;
  reportId?: string | null;
};

const CAMP_SCOUT_DEFAULT_VISIBLE_PIN_LIMIT = 5;
const CAMP_SCOUT_EXPANDED_VISIBLE_PIN_LIMIT = 10;
const CAMP_SCOUT_DRAW_AREA_FALLBACK_MIN_SCORE = 50;
const CAMP_SCOUT_DRAW_AREA_FALLBACK_MIN_ACCESS = 45;
const CAMP_SCOUT_DRAW_AREA_FALLBACK_MIN_LEGALITY = 45;
const CAMP_SCOUT_DRAW_AREA_FALLBACK_MAX_SLOPE = 12;
const CAMP_SCOUT_FILTER_MODE_OPTIONS: { key: CampScoutFilterMode; label: string }[] = [
  { key: 'remote', label: 'REMOTE' },
  { key: 'balanced', label: 'BALANCED' },
  { key: 'easier_access', label: 'EASIER ACCESS' },
  { key: 'official_only', label: 'OFFICIAL ONLY' },
];
type CampScoutLocateState =
  | 'idle'
  | 'no_area'
  | 'locating'
  | 'ready'
  | 'empty'
  | 'partial'
  | 'limited'
  | 'too_large'
  | 'error';

type CampScoutZeroResultReason =
  | 'no_raw_candidates'
  | 'official_only_no_official'
  | 'official_only_hiding_inferred'
  | 'only_restricted_private_closed'
  | 'filters_removed_candidates'
  | 'fallback_hidden_by_strict_settings'
  | 'map_rendering_empty'
  | 'unknown';

type CampScoutZeroResultSummary = {
  reason: CampScoutZeroResultReason;
  title: string;
  message: string;
};

function describeCampScoutZeroResult(input: {
  activeFilterPreset: CampScoutFilterMode;
  rawCandidateCount: number;
  visibleCandidateCount: number;
  renderedFeatureCount: number;
  officialCandidateCount: number;
  nonOfficialCandidateCount: number;
  restrictedKnownCount: number;
  fallbackCandidateCount: number;
}): CampScoutZeroResultSummary {
  if (input.visibleCandidateCount > 0 && input.renderedFeatureCount === 0) {
    return {
      reason: 'map_rendering_empty',
      title: 'PIN RENDER CHECK',
      message:
        'Candidate campsites were found, but the map pin layer is empty. Refresh the map or reopen Camp Scout.',
    };
  }

  if (input.activeFilterPreset === 'official_only') {
    if (input.officialCandidateCount === 0 && input.nonOfficialCandidateCount > 0) {
      return {
        reason: 'official_only_hiding_inferred',
        title: 'OFFICIAL ONLY',
        message:
          'No official campsite records found in this area. Potential inferred locations are hidden because Official Only is enabled. Try expanding the area or switching from Official Only to Balanced.',
      };
    }
    return {
      reason: 'official_only_no_official',
      title: 'OFFICIAL ONLY',
      message:
        'No official campsite records found in this area. Try expanding the area or switching from Official Only to Balanced.',
    };
  }

  if (input.restrictedKnownCount > 0 && input.rawCandidateCount <= input.restrictedKnownCount) {
    return {
      reason: 'only_restricted_private_closed',
      title: 'AREA RESTRICTED',
      message:
        'Only restricted/private/closed areas were found. Try expanding the area or switching from Official Only to Balanced.',
    };
  }

  if (input.fallbackCandidateCount > 0) {
    return {
      reason: 'fallback_hidden_by_strict_settings',
      title: 'LOWER CONFIDENCE AVAILABLE',
      message:
        'No candidate campsites passed the current filters. Lower-confidence inferred campsite options are available, but they require rule verification.',
    };
  }

  if (input.rawCandidateCount === 0) {
    return {
      reason: 'no_raw_candidates',
      title: 'NO SOURCE RECORDS',
      message:
        'No raw campsite candidates were found in this area. Try expanding the area or switching from Official Only to Balanced.',
    };
  }

  return {
    reason: 'filters_removed_candidates',
    title: 'NO CANDIDATES SHOWN',
    message:
      'No candidate campsites passed the current filters. Try expanding the area or switching from Official Only to Balanced.',
  };
}

function campScoutLocateStateTitle(state: CampScoutLocateState): string {
  switch (state) {
    case 'no_area':
      return 'NO AREA SELECTED';
    case 'too_large':
      return 'AREA TOO LARGE';
    case 'locating':
      return 'SCANNING';
    case 'empty':
      return 'NO CANDIDATES SHOWN';
    case 'ready':
      return 'RESULTS FOUND';
    case 'partial':
      return 'PARTIAL RESULTS';
    case 'limited':
      return 'OFFLINE / LIMITED DATA';
    case 'error':
      return 'SCAN CHECK';
    default:
      return 'SCAN AREA';
  }
}

const emptyCampScoutBreakdown = (total: number): CampScoutCandidate['scoreBreakdown'] => ({
  flatnessTerrain: total,
  accessConfidence: total,
  remotenessValue: total,
  legalAccessConfidence: total,
  safetyEnvironmentalRisk: total,
  sourceSignal: total,
  sourceQuality: total,
  remoteness: total,
  access: total,
  legality: total,
  terrain: total,
  proximity: total,
  confidence: total,
  total,
});

function toCampScoutCandidate(
  candidate: PolygonCampsiteSuggestion,
  index: number,
): CampScoutCandidate {
  const metadata = candidate as PolygonCampsiteSuggestion & {
    legalityStatus?: unknown;
    warnings?: unknown;
    source?: unknown;
    accessNotes?: unknown;
    nearestRoadwayMiles?: unknown;
    distanceFromRoadwayMiles?: unknown;
    slope?: unknown;
    slopeEstimate?: unknown;
    terrainType?: unknown;
    surfaceType?: unknown;
    landUse?: unknown;
    isPrivateLand?: unknown;
    isWaterBody?: unknown;
    nearBuildings?: unknown;
    nearHighway?: unknown;
  };
  const latitude = Number(candidate.coordinates?.[0]);
  const longitude = Number(candidate.coordinates?.[1]);
  const score =
    typeof candidate.score === 'number'
      ? Math.round(candidate.score)
      : Math.max(0, Math.min(100, Math.round((candidate.suitabilityScore ?? 0) * 8)));
  const confidenceGrade =
    candidate.rating && /^[ABCD]$/.test(candidate.rating)
      ? candidate.rating
      : getCampScoutConfidenceGrade(score);
  const accessConfidence =
    typeof candidate.legalAccessScore === 'number'
      ? Math.round(candidate.legalAccessScore)
      : candidate.confidence === 'HIGH'
        ? 82
        : candidate.confidence === 'MEDIUM'
          ? 68
          : 48;
  const remotenessScore =
    typeof candidate.remotenessScore === 'number'
      ? Math.round(candidate.remotenessScore)
      : Math.max(45, Math.min(92, score));
  const reasons = [
    ...(Array.isArray(candidate.candidateReason) ? candidate.candidateReason : []),
    ...(Array.isArray(candidate.confidenceReasons) ? candidate.confidenceReasons : []),
  ]
    .filter((reason, reasonIndex, list): reason is string => {
      return typeof reason === 'string' && reason.trim().length > 0 && list.indexOf(reason) === reasonIndex;
    })
    .slice(0, 4);
  const cautions = [
    accessConfidence < 65 ? 'Access confidence is limited; inspect the approach before relying on this pin.' : null,
    candidate.confidence === 'LOW' ? 'Camp Scout confidence is low; treat this as a scouting lead only.' : null,
    'Potential campsite: verify local rules, permits, closures, and land ownership.',
  ].filter((caution): caution is string => !!caution);
  const metadataWarnings = Array.isArray(metadata.warnings)
    ? metadata.warnings.filter((warning): warning is string => typeof warning === 'string' && warning.trim().length > 0)
    : [];
  const legalityStatus =
    normalizeCampScoutLegalityStatus(metadata.legalityStatus) ??
    (accessConfidence >= 82 ? 'likely_allowed_needs_verification' : 'unknown_needs_verification');
  const roadDistance = Number(metadata.nearestRoadwayMiles ?? metadata.distanceFromRoadwayMiles);
  const slope = Number(metadata.slope ?? metadata.slopeEstimate);

  return {
    id: `camp-scout-${candidate.segmentRange ?? candidate.segmentIndex ?? index}`,
    coordinate: { latitude, longitude },
    title: 'Camp Scout Area Potential',
    sourceType: 'ecs_inferred',
    confidenceScore: score,
    confidenceGrade,
    scoreBreakdown: emptyCampScoutBreakdown(score),
    reasons: reasons.length > 0 ? reasons : ['Candidate ranked highly within the selected Camp Scout area.'],
    cautions: [...cautions, ...metadataWarnings].filter((warning, warningIndex, list) => list.indexOf(warning) === warningIndex),
    distanceFromUserMiles: candidate.distanceMiles,
    slopeEstimate: Number.isFinite(slope) ? slope : undefined,
    terrainType: typeof metadata.terrainType === 'string' ? metadata.terrainType : undefined,
    surfaceType: typeof metadata.surfaceType === 'string' ? metadata.surfaceType : undefined,
    landUse: typeof metadata.landUse === 'string' ? metadata.landUse : undefined,
    terrainConfidence:
      typeof candidate.terrainScore === 'number' ? Math.round(candidate.terrainScore) : score,
    accessConfidence,
    legalityConfidence: accessConfidence,
    legalityStatus,
    warnings: metadataWarnings.length > 0
      ? metadataWarnings
      : ['Potential campsite: verify local rules, permits, closures, and land ownership.'],
    distanceFromRoadOrTrail: Number.isFinite(roadDistance) ? roadDistance : undefined,
    accessNotes: typeof metadata.accessNotes === 'string' ? metadata.accessNotes : undefined,
    remotenessScore,
    safetyRiskScore: Math.max(0, 100 - score),
    environmentalRiskScore: 0,
    knownConflictRiskScore: 0,
    mapDataCompleteness: 70,
    sourceLabel: 'ECS inferred area scan',
    isPrivateLand: metadata.isPrivateLand === true,
    isWaterBody: metadata.isWaterBody === true,
    nearBuildings: metadata.nearBuildings === true,
    nearHighway: metadata.nearHighway === true,
  };
}

function clampCampScoutMetric(value: number | null | undefined, fallback: number): number {
  if (typeof value !== 'number' || Number.isNaN(value)) return fallback;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function campScoutAccessScoreFromDifficulty(accessDifficulty?: string | null): number {
  switch (accessDifficulty) {
    case 'easy_2wd':
      return 92;
    case 'awd':
      return 82;
    case 'high_clearance':
      return 72;
    case 'four_by_four':
      return 62;
    case 'technical':
      return 42;
    default:
      return 64;
  }
}

function campScoutLegalScoreFromConfidence(legalConfidence?: string | null): number {
  switch (legalConfidence) {
    case 'high':
      return 90;
    case 'medium':
      return 72;
    case 'low':
      return 45;
    default:
      return 58;
  }
}

function campScoutRemotenessFromSiteType(siteType?: string | null): number {
  switch (siteType) {
    case 'established_dispersed':
      return 74;
    case 'trailhead':
      return 58;
    case 'developed':
      return 48;
    case 'paid':
      return 42;
    default:
      return 66;
  }
}

function toMappedCampScoutCandidate(site: PublicCampSite, index: number): CampScoutCandidate {
  const officialMapped = isEstablishedCommunityCampsite(site);
  const accessConfidence = campScoutAccessScoreFromDifficulty(site.access_difficulty);
  const legalityConfidence = campScoutLegalScoreFromConfidence(site.legal_confidence);
  const trustScore = clampCampScoutMetric(site.trust_score, officialMapped ? 84 : 76);
  const sourceType: CampScoutCandidate['sourceType'] = officialMapped ? 'official_mapped' : 'community_suggested';
  const legalityStatus: CampScoutLegalityStatus =
    site.legal_confidence === 'high'
      ? 'likely_allowed_needs_verification'
      : site.legal_confidence === 'low'
        ? 'unknown_needs_verification'
        : 'unknown_needs_verification';
  const title =
    site.canonical_name ??
    (officialMapped ? `Mapped camp ${index + 1}` : `Community camp ${index + 1}`);

  return {
    id: `camp-scout-${sourceType}-${site.id}`,
    coordinate: {
      latitude: Number(site.latitude),
      longitude: Number(site.longitude),
    },
    title,
    sourceType,
    confidenceScore: trustScore,
    confidenceGrade: getCampScoutConfidenceGrade(trustScore),
    scoreBreakdown: emptyCampScoutBreakdown(trustScore),
    reasons: [
      officialMapped
        ? 'Mapped campsite source is inside the selected Camp Scout area.'
        : 'Community-suggested campsite is inside the selected Camp Scout area.',
      `${site.confirmation_count} confirmation${site.confirmation_count === 1 ? '' : 's'} and ${site.flag_count} flag${site.flag_count === 1 ? '' : 's'} are attached.`,
    ],
    cautions: site.flag_count > 0 ? ['Review community flags before relying on this pin.'] : [],
    terrainConfidence: 68,
    accessConfidence,
    legalityConfidence,
    legalityStatus,
    warnings: ['Verify local rules, permits, closures, and land ownership before occupying.'],
    accessNotes: `Access: ${site.access_difficulty.replace(/_/g, ' ')}`,
    distanceFromRoadOrTrail: undefined,
    remotenessScore: campScoutRemotenessFromSiteType(site.site_type),
    safetyRiskScore: Math.min(70, site.flag_count * 18),
    environmentalRiskScore: 8,
    knownConflictRiskScore: Math.min(70, site.flag_count * 18),
    crowdingScore: site.site_type === 'developed' || site.site_type === 'paid' ? 70 : 35,
    communitySignalScore: officialMapped ? 72 : Math.max(78, trustScore),
    officialSignalScore: officialMapped ? Math.max(88, trustScore) : 0,
    mapDataCompleteness: officialMapped ? 90 : 78,
    createdAt: site.created_at,
    sourceTimestamp: site.last_confirmed_at ?? site.updated_at ?? site.created_at,
    sourceLabel: officialMapped ? 'Mapped campsite' : 'Community campsite',
    sourceNotes: [
      site.site_type.replace(/_/g, ' '),
      `Access: ${site.access_difficulty.replace(/_/g, ' ')}`,
    ],
  };
}

const CAMPSITE_DRAW_CLOSE_THRESHOLD_MILES = 0.08;
const NAVIGATE_IMPORT_SELECTABLE_EXTENSIONS = ['gpx', 'xml', 'kml', 'kmz', 'geojson', 'json'];
const NAVIGATE_IMPORT_SUPPORTED_COPY = '.gpx, .kml, .geojson, .json, or .xml';
const NAVIGATE_IMPORT_RECENT_FILE_WINDOW_MS = 10_000;

function createNavigateImportFileKey(fileName: string, content: string): string {
  const normalizedName = (fileName || 'imported-route').trim().toLowerCase();
  let hash = 2166136261;

  for (let idx = 0; idx < content.length; idx += 1) {
    hash ^= content.charCodeAt(idx);
    hash = Math.imul(hash, 16777619);
  }

  return `${normalizedName}|${content.length}|${(hash >>> 0).toString(16)}`;
}

async function readPersistedMapStyleMode(): Promise<NavigateMapStyleMode | null> {
  if (cachedMapStyleModePreference) return cachedMapStyleModePreference;

  try {
    const stored = await navigatePreferenceStorage.read(MAP_STYLE_MODE_STORAGE_KEY);
    if (stored === 'day' || stored === 'tac' || stored === 'sat' || stored === '3d') {
      cachedMapStyleModePreference = stored;
      return stored;
    }
  } catch {}
  return null;
}

async function persistMapStyleMode(nextMode: NavigateMapStyleMode): Promise<void> {
  cachedMapStyleModePreference = nextMode;

  try {
    await navigatePreferenceStorage.write(MAP_STYLE_MODE_STORAGE_KEY, nextMode);
  } catch {}
}

function normalizeCampsiteLayerVisibilityPreference(
  value: unknown,
): Record<CampsiteVisibilityLayerScope, boolean> | null {
  if (!value || typeof value !== 'object') return null;

  const saved = value as Partial<Record<CampsiteVisibilityLayerScope, unknown>>;
  const next = { ...DEFAULT_CAMPSITE_LAYER_VISIBILITY };
  let hasSavedLayer = false;

  for (const key of Object.keys(DEFAULT_CAMPSITE_LAYER_VISIBILITY) as CampsiteVisibilityLayerScope[]) {
    if (typeof saved[key] === 'boolean') {
      next[key] = saved[key] as boolean;
      hasSavedLayer = true;
    }
  }

  return hasSavedLayer ? next : null;
}

async function readPersistedCampsiteLayerVisibility(): Promise<
  Record<CampsiteVisibilityLayerScope, boolean> | null
> {
  try {
    const stored = await navigatePreferenceStorage.read(CAMPSITE_LAYER_VISIBILITY_STORAGE_KEY);
    if (!stored) return null;
    return normalizeCampsiteLayerVisibilityPreference(JSON.parse(stored));
  } catch {
    return null;
  }
}

async function persistCampsiteLayerVisibility(
  nextVisibility: Record<CampsiteVisibilityLayerScope, boolean>,
): Promise<void> {
  try {
    await navigatePreferenceStorage.write(
      CAMPSITE_LAYER_VISIBILITY_STORAGE_KEY,
      JSON.stringify(nextVisibility),
    );
  } catch {}
}

type OfflineSyncCompletionNotice = {
  id: string;
  title: string;
  message: string;
};

function getOfflineSyncCompletionNoticeId(job: OfflineTileSyncJob): string {
  return job.jobId || `${job.regionId}:${job.completedAt ?? job.updatedAt}`;
}

function buildOfflineSyncCompletionNotice(job: OfflineTileSyncJob): OfflineSyncCompletionNotice {
  const syncLabel = job.syncType === 'route' ? 'route sync' : 'map sync';
  return {
    id: getOfflineSyncCompletionNoticeId(job),
    title: 'Offline cache complete',
    message: `${job.regionName || 'Offline cache'} ${syncLabel} is ready in Downloaded Syncs.`,
  };
}

async function readDismissedOfflineSyncCompletionNotices(): Promise<Set<string>> {
  try {
    const stored = await navigatePreferenceStorage.read(
      OFFLINE_SYNC_COMPLETION_NOTICE_DISMISSED_STORAGE_KEY,
    );
    if (!stored) return new Set();
    const parsed = JSON.parse(stored);
    return new Set(
      Array.isArray(parsed)
        ? parsed.filter((value): value is string => typeof value === 'string' && value.length > 0)
        : [],
    );
  } catch {
    return new Set();
  }
}

async function persistDismissedOfflineSyncCompletionNotices(ids: Set<string>): Promise<void> {
  try {
    await navigatePreferenceStorage.write(
      OFFLINE_SYNC_COMPLETION_NOTICE_DISMISSED_STORAGE_KEY,
      JSON.stringify(Array.from(ids).slice(-100)),
    );
  } catch {}
}

function createCampsiteDrawingId(points: CampsiteSearchPolygonPoint[]): string {
  return `camp-draw-${points
    .map((point) => `${point.latitude.toFixed(4)}_${point.longitude.toFixed(4)}`)
    .join('-')}`;
}

function getCampsiteDrawingCenter(
  points: CampsiteSearchPolygonPoint[],
): CampsiteSearchPolygonPoint | null {
  const validPoints = points.filter(
    (point) => Number.isFinite(point.latitude) && Number.isFinite(point.longitude),
  );
  if (validPoints.length === 0) return null;
  const totals = validPoints.reduce(
    (acc, point) => ({
      latitude: acc.latitude + point.latitude,
      longitude: acc.longitude + point.longitude,
    }),
    { latitude: 0, longitude: 0 },
  );
  return {
    latitude: totals.latitude / validPoints.length,
    longitude: totals.longitude / validPoints.length,
  };
}

function getCampsitePolygonBounds(points: CampsiteSearchPolygonPoint[]): CampsiteBounds | null {
  const validPoints = points.filter(
    (point) => Number.isFinite(point.latitude) && Number.isFinite(point.longitude),
  );
  if (validPoints.length < 3) return null;
  return validPoints.reduce<CampsiteBounds>(
    (bounds, point) => ({
      minLat: Math.min(bounds.minLat, point.latitude),
      minLng: Math.min(bounds.minLng, point.longitude),
      maxLat: Math.max(bounds.maxLat, point.latitude),
      maxLng: Math.max(bounds.maxLng, point.longitude),
    }),
    {
      minLat: validPoints[0].latitude,
      minLng: validPoints[0].longitude,
      maxLat: validPoints[0].latitude,
      maxLng: validPoints[0].longitude,
    },
  );
}

function getRouteCampsiteSourceBounds(
  routePoints: readonly { lat: number; lng: number }[],
  bufferMiles = ROUTE_CAMPSITE_BUFFER_MILES,
): CampsiteBounds | null {
  const validPoints = routePoints.filter(
    (point) => Number.isFinite(point.lat) && Number.isFinite(point.lng),
  );
  if (validPoints.length < 2) return null;

  const latitudePadding = bufferMiles / 69;
  const averageLatitude =
    validPoints.reduce((sum, point) => sum + point.lat, 0) / validPoints.length;
  const longitudeMilesPerDegree = Math.max(
    1,
    Math.cos((averageLatitude * Math.PI) / 180) * 69,
  );
  const longitudePadding = bufferMiles / longitudeMilesPerDegree;

  const bounds = validPoints.reduce<CampsiteBounds>(
    (acc, point) => ({
      minLat: Math.min(acc.minLat, point.lat),
      minLng: Math.min(acc.minLng, point.lng),
      maxLat: Math.max(acc.maxLat, point.lat),
      maxLng: Math.max(acc.maxLng, point.lng),
    }),
    {
      minLat: validPoints[0].lat,
      minLng: validPoints[0].lng,
      maxLat: validPoints[0].lat,
      maxLng: validPoints[0].lng,
    },
  );

  return {
    minLat: bounds.minLat - latitudePadding,
    minLng: bounds.minLng - longitudePadding,
    maxLat: bounds.maxLat + latitudePadding,
    maxLng: bounds.maxLng + longitudePadding,
  };
}

function campsitePointInsidePolygon(
  point: { latitude?: number | null; longitude?: number | null },
  polygon: CampsiteSearchPolygonPoint[],
): boolean {
  const latitude = Number(point.latitude);
  const longitude = Number(point.longitude);
  return (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    pointInPolygon({ latitude, longitude }, polygon)
  );
}

function campsitePointNearRoute(
  point: { latitude?: number | null; longitude?: number | null },
  routePoints: readonly { lat: number; lng: number }[],
  bufferMiles = ROUTE_CAMPSITE_BUFFER_MILES,
): boolean {
  const latitude = Number(point.latitude);
  const longitude = Number(point.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || routePoints.length < 2) {
    return false;
  }
  return distancePointToRoutePolyline({ latitude, longitude }, [...routePoints]) <= bufferMiles;
}

function isEstablishedCommunityCampsite(site: PublicCampSite): boolean {
  return site.site_type === 'established_dispersed' || site.site_type === 'developed' || site.site_type === 'paid';
}

function toDrawAreaCommunityCampsiteMarkerPayload(
  site: PublicCampSite,
  selected = false,
): CommunityCampsiteMarkerPayload {
  const marker = toCommunityCampsiteMarkerPayload(site, selected);
  if (!isEstablishedCommunityCampsite(site)) return marker;
  return {
    ...marker,
    id: `established-campsite:${site.id}`,
    title: marker.title || 'Established Campground',
    category: 'established',
    rankLabel: 'ES',
    badges: [
      { label: 'ESTABLISHED', tone: 'info' },
      ...(marker.badges ?? []).filter((badge) => badge.label !== 'COMMUNITY'),
    ],
  };
}

function withCampsiteContextBadge<T extends CampMapMarker>(
  marker: T,
  label: string,
): T {
  const badges = marker.badges ?? [];
  return {
    ...marker,
    badges: badges.some((badge) => badge.label === label)
      ? badges
      : [{ label, tone: 'info' }, ...badges],
  };
}

function getCampMarkerCoordinateKey(marker: CampMapMarker): string | null {
  const latitude = Number(marker.latitude);
  const longitude = Number(marker.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return `${latitude.toFixed(4)}:${longitude.toFixed(4)}`;
}

function getCampMarkerDedupeKey(marker: CampMapMarker): string {
  if (marker.communityCampSiteId) {
    return `community:${marker.communityCampSiteId}`;
  }
  if (marker.groupShareId) {
    return `group:${marker.groupShareId}`;
  }
  if (marker.reportId) {
    return `${marker.markerKind}:${marker.reportId}`;
  }
  return `${marker.markerKind ?? 'camp'}:${marker.id}`;
}

function mergeUniqueCampMarkers<T extends CampMapMarker>(
  markerGroups: readonly (readonly T[])[],
): T[] {
  const seen = new Set<string>();
  const seenCoordinates = new Set<string>();
  const merged: T[] = [];
  for (const group of markerGroups) {
    for (const marker of group) {
      const key = getCampMarkerDedupeKey(marker);
      const coordinateKey = getCampMarkerCoordinateKey(marker);
      if (seen.has(key) || (coordinateKey && seenCoordinates.has(coordinateKey))) continue;
      seen.add(key);
      if (coordinateKey) seenCoordinates.add(coordinateKey);
      merged.push(marker);
    }
  }
  return merged;
}

function toExploreRouteCampMapMarker(marker: ExploreRouteCampMarker): CampMapMarker {
  return {
    id: marker.id,
    latitude: marker.latitude,
    longitude: marker.longitude,
    title: marker.title,
    subtitle: marker.subtitle,
    category: marker.category,
    confidence: marker.confidence,
    confidenceScore: marker.confidenceScore,
    rating: marker.rating,
    score: marker.score,
    rank: marker.rank,
    rankLabel: marker.rankLabel,
    ratingFactors: [],
    selected: false,
    badges: [
      { label: 'EXPLORER ROUTE', tone: 'info' },
      ...(marker.source ? [{ label: marker.source.toUpperCase(), tone: 'neutral' as const }] : []),
    ],
    markerKind: 'explore_route_camp',
  };
}

function getExplorePayloadAction(payload: NavigationHandoffPayload | null): string | null {
  const metadata = payload?.routeMetadata;
  if (!metadata || typeof metadata !== 'object') return null;
  const action = (metadata as Record<string, unknown>).exploreAction;
  return typeof action === 'string' ? action : null;
}

function getCampsiteSuggestionId(candidate: PolygonCampsiteSuggestion, index: number): string {
  const [latitude, longitude] = candidate.coordinates ?? [];
  const latPart = Number.isFinite(latitude) ? latitude.toFixed(5) : 'na';
  const lonPart = Number.isFinite(longitude) ? longitude.toFixed(5) : 'na';
  return `camp-${candidate.segmentIndex ?? index}-${latPart}-${lonPart}`;
}

function getCampsiteDrawingDistanceMiles(
  a: CampsiteSearchPolygonPoint,
  b: CampsiteSearchPolygonPoint,
): number {
  const radiusMiles = 3958.8;
  const dLat = ((b.latitude - a.latitude) * Math.PI) / 180;
  const dLon = ((b.longitude - a.longitude) * Math.PI) / 180;
  const lat1 = (a.latitude * Math.PI) / 180;
  const lat2 = (b.latitude * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return radiusMiles * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function getCampsiteRemotenessSnapshot() {
  try {
    const remoteness = remotenessStore.get();
    if (remoteness) {
      return {
        tier: remoteness.tier ?? null,
        score: remoteness.score ?? null,
      };
    }
  } catch {}
  return null;
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
const ACTIVE_GUIDANCE_AUTO_MINIMIZE_MS = 2500;
const CAMP_LAYER_ROUTE_MAP_RESULT_LIMIT = 64;
const NAVIGATION_HANDOFF_RESTORE_DELAY_MS = 220;
const NAVIGATION_HANDOFF_RESTORE_MAX_AGE_MS = 4 * 60 * 60 * 1000;
const EDGE_CONTROL_HIT_SLOP = { top: 10, bottom: 10, left: 10, right: 10 } as const;
const CLOSE_CONTROL_HIT_SLOP = { top: 12, bottom: 12, left: 12, right: 12 } as const;
const MAP_STYLE_MODE_OPTIONS = [
  { key: 'day', label: 'DAY' },
  { key: 'tac', label: 'TAC' },
  { key: 'sat', label: 'SAT' },
  { key: '3d', label: '3D' },
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

const toSafeMapLocation = (coord: any): { lat: number; lng: number } | null => {
  const safe = toSafeCoordinate(coord);
  if (!safe) return null;
  if (safe.latitude < -90 || safe.latitude > 90) return null;
  if (safe.longitude < -180 || safe.longitude > 180) return null;
  return { lat: safe.latitude, lng: safe.longitude };
};

function toNavigateWeatherCoordinate(
  coord: unknown,
  label?: string | null,
): WeatherCoordinate | null {
  const safe = toSafeMapLocation(coord);
  if (!safe) return null;
  return {
    lat: safe.lat,
    lng: safe.lng,
    label: typeof label === 'string' && label.trim() ? label.trim() : undefined,
  };
}

function firstNavigateWeatherCoordinate(
  candidates: { coord: unknown; label?: string | null }[],
): WeatherCoordinate | null {
  for (const candidate of candidates) {
    const coordinate = toNavigateWeatherCoordinate(candidate.coord, candidate.label);
    if (coordinate) return coordinate;
  }
  return null;
}

function dedupeWeatherCoordinates(coordinates: WeatherCoordinate[]): WeatherCoordinate[] {
  const seen = new Set<string>();
  return coordinates.filter((coordinate) => {
    if (!Number.isFinite(coordinate.lat) || !Number.isFinite(coordinate.lng)) return false;
    const key = `${coordinate.lat.toFixed(4)}:${coordinate.lng.toFixed(4)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function getRouteWeatherRiskPoint(
  points: readonly { lat: number; lng: number; hazardLevel?: string | null }[],
): { lat: number; lng: number } | null {
  const priority = ['hazardous', 'warning', 'caution'];
  for (const level of priority) {
    const point = points.find((candidate) => candidate.hazardLevel === level);
    if (point && toSafeMapLocation(point)) return point;
  }
  return null;
}

function buildNavigateRouteWeatherCoordinates(
  routePoints: readonly { lat: number; lng: number }[],
  riskPoint?: { lat: number; lng: number } | null,
): WeatherCoordinate[] {
  const validPoints = routePoints
    .map((point) => toNavigateWeatherCoordinate(point))
    .filter((point): point is WeatherCoordinate => !!point);
  if (validPoints.length < 2) return [];

  const start = validPoints[0];
  const end = validPoints[validPoints.length - 1];
  const middle = validPoints[Math.floor((validPoints.length - 1) / 2)];
  const riskCoordinate = riskPoint ? toNavigateWeatherCoordinate(riskPoint) : null;

  return dedupeWeatherCoordinates([
    { ...start, label: 'Route start' },
    { ...(riskCoordinate ?? middle), label: riskCoordinate ? 'Highest-risk route segment' : 'Route midpoint' },
    { ...end, label: 'Route destination' },
  ]);
}

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

function isRoadNavCoordinate(value: unknown): value is RoadNavCoordinate {
  const coord = value as Partial<RoadNavCoordinate> | null | undefined;
  const lat = Number(coord?.lat);
  const lng = Number(coord?.lng);
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

function getOfflineRouteDestination(route: OfflineCachedRoute): {
  destination: RoadNavDestination;
  usedMetadata: boolean;
} | null {
  const metadata = route.finalDestination;
  const metadataCoordinate = metadata
    ? { lat: Number(metadata.latitude), lng: Number(metadata.longitude) }
    : null;
  if (metadataCoordinate && isRoadNavCoordinate(metadataCoordinate)) {
    return {
      destination: {
        id: `offline-sync-destination:${route.id}`,
        title: metadata?.label || route.name || 'Offline route destination',
        subtitle: metadata?.subtitle ?? route.name ?? 'Saved offline route',
        coordinate: metadataCoordinate,
        sourceType: 'offline_sync_open',
        raw: { routeId: route.id, stableRouteKey: route.stableRouteKey },
      },
      usedMetadata: true,
    };
  }

  const lastPoint = route.routeGeometry?.[route.routeGeometry.length - 1];
  const fallbackCoordinate = lastPoint
    ? { lat: Number(lastPoint.latitude), lng: Number(lastPoint.longitude) }
    : null;
  if (!fallbackCoordinate || !isRoadNavCoordinate(fallbackCoordinate)) {
    return null;
  }

  return {
    destination: {
      id: `offline-sync-destination:${route.id}`,
      title: route.name || 'Offline route destination',
      subtitle: 'Recovered from saved route geometry',
      coordinate: fallbackCoordinate,
      sourceType: 'offline_sync_open',
      raw: { routeId: route.id, stableRouteKey: route.stableRouteKey, destinationMetadataMissing: true },
    },
    usedMetadata: false,
  };
}

function buildOfflineCachedRoadPreviewRoute(
  route: OfflineCachedRoute,
  origin: RoadNavCoordinate,
  destination: RoadNavDestination,
): RoadNavRoute | null {
  const geometry = (route.routeGeometry ?? [])
    .map((point) => ({ lat: Number(point.latitude), lng: Number(point.longitude) }))
    .filter(isRoadNavCoordinate);
  if (geometry.length < 1) return null;

  return buildRoadRouteFromCachedGeometry({
    id: `offline-sync-preview:${route.id}:${Date.now().toString(36)}`,
    origin,
    destination,
    geometry,
    distanceM:
      typeof route.routeDistanceMiles === 'number' && Number.isFinite(route.routeDistanceMiles)
        ? route.routeDistanceMiles * 1609.344
        : null,
    durationS: null,
    createdAt: new Date().toISOString(),
  });
}

function createRoadPreviewRunFromRoute(
  route: RoadNavRoute,
  fallbackBuildSnapshot?: Partial<BuildSnapshot> | null,
): ECSRun {
  const now = new Date().toISOString();
  const points = route.geometry.map((point, index) => ({
    idx: index,
    lat: point.lat,
    lng: point.lng,
    ele_m: null,
    time: null,
    type: 'route' as const,
  }));
  const first = points[0] ?? null;
  const last = points[points.length - 1] ?? null;
  const distanceM = Number.isFinite(route.distanceM) ? Math.max(0, route.distanceM) : 0;
  const buildSnapshot = {
    ...createDefaultBuildSnapshot(),
    ...(fallbackBuildSnapshot ?? {}),
    captured_at: now,
  };

  return {
    id: `road-preview-${route.id}`,
    user_id: null,
    title: route.destination.title || 'Road preview route',
    source: 'route',
    created_at: route.createdAt || now,
    updated_at: now,
    vehicle_id: buildSnapshot.vehicle_id,
    build_snapshot: buildSnapshot,
    stats: {
      distance_m: Math.round(distanceM),
      distance_miles: distanceM / 1609.344,
      distance_km: distanceM / 1000,
      point_count: points.length,
      start_lat: first?.lat ?? null,
      start_lng: first?.lng ?? null,
      end_lat: last?.lat ?? route.destination.coordinate.lat ?? null,
      end_lng: last?.lng ?? route.destination.coordinate.lng ?? null,
      elevation_gain_ft: null,
      elevation_loss_ft: null,
      min_ele_ft: null,
      max_ele_ft: null,
    },
    points,
    waypoints: [
      {
        lat: route.destination.coordinate.lat,
        lon: route.destination.coordinate.lng,
        ele: null,
        name: route.destination.title,
        time: null,
        waypointType: null,
      },
    ],
    is_active: false,
  };
}

function buildRouteIntentForRoadPreview(input: {
  route: RoadNavRoute;
  analysis: RouteAnalysis;
  mapStyle: string;
  readinessSnapshot?: unknown | null;
}): OfflineRouteIntentMetadata {
  const primaryRoadName =
    input.route.steps.find((step) => typeof step.roadName === 'string' && step.roadName.trim().length > 0)
      ?.roadName ?? input.route.destination.title;

  return {
    syncType: 'route',
    origin: {
      mode: 'gps',
      latitude: input.route.origin.lat,
      longitude: input.route.origin.lng,
      label: 'Current GPS location',
    },
    destination: {
      latitude: input.route.destination.coordinate.lat,
      longitude: input.route.destination.coordinate.lng,
      label: input.route.destination.title || 'Route destination',
      subtitle: input.route.destination.subtitle,
      source: 'route_geometry',
    },
    routeGeometryPointCount: input.route.geometry.length,
    encodedPolyline: null,
    routeSummary: {
      distanceMeters: input.route.distanceM,
      distanceMiles: input.route.distanceM / 1609.344,
      durationSeconds: input.route.durationS,
      primaryName: primaryRoadName,
    },
    mapContext: {
      styleKey: input.mapStyle,
      // Campsite visibility layers are marker/data overlays, not tile-cache layers.
      layerContext: ['route-corridor', 'road-preview'],
      zoomMin: input.analysis.zoomMin,
      zoomMax: input.analysis.zoomMax,
      corridorMiles: input.analysis.bufferMiles,
    },
    routeAnalysisSnapshot: input.analysis,
    readinessSnapshot: input.readinessSnapshot ?? null,
    preparedAt: new Date().toISOString(),
  };
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
    a.analysisSource === b.analysisSource &&
    a.source === b.source &&
    a.polygonId === b.polygonId &&
    a.candidateCount === b.candidateCount &&
    a.bestConfidence === b.bestConfidence &&
    a.analyzedAt === b.analyzedAt
  );
}

function sameRemotenessProximityEstimate(
  a: { distanceMi: number | null; confidence: string; source: string },
  b: { distanceMi: number | null; confidence: string; source: string },
): boolean {
  return a.distanceMi === b.distanceMi && a.confidence === b.confidence && a.source === b.source;
}

function sameRemotenessIndex(
  a: RemotenessIndexOutput | null,
  b: RemotenessIndexOutput | null,
): boolean {
  if (a === b) return true;
  if (!a || !b) return !a && !b;
  return (
    a.score === b.score &&
    a.rawScore === b.rawScore &&
    a.level === b.level &&
    a.levelColor === b.levelColor &&
    a.reason === b.reason &&
    a.description === b.description &&
    a.connectivity.signal === b.connectivity.signal &&
    a.connectivity.qualityScore === b.connectivity.qualityScore &&
    a.forecast.available === b.forecast.available &&
    a.forecast.peakScore === b.forecast.peakScore &&
    a.forecast.isIncreasing === b.forecast.isIncreasing &&
    a.advisories.length === b.advisories.length &&
    a.advisories[0]?.id === b.advisories[0]?.id &&
    a.advisories[0]?.message === b.advisories[0]?.message &&
    sameRemotenessProximityEstimate(a.proximity.nearestPavedRoad, b.proximity.nearestPavedRoad) &&
    sameRemotenessProximityEstimate(a.proximity.nearestTown, b.proximity.nearestTown) &&
    sameRemotenessProximityEstimate(a.proximity.nearestFuelStation, b.proximity.nearestFuelStation)
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
    campMarkerCount: safeArray(payload.campMarkers).length,
    exploreAction:
      payload.routeMetadata && typeof payload.routeMetadata === 'object'
        ? (payload.routeMetadata as Record<string, unknown>).exploreAction ?? null
        : null,
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

function sameRouteBuilderSegments(
  a: RouteBuilderSegmentData[],
  b: RouteBuilderSegmentData[],
): boolean {
  const normalizeCoord = (coord: any) => {
    const lng = Array.isArray(coord) ? coord[0] : coord?.longitude;
    const lat = Array.isArray(coord) ? coord[1] : coord?.latitude;
    return { lng: Number(lng ?? 0), lat: Number(lat ?? 0) };
  };
  const sameCoordinateList = (leftInput: any, rightInput: any) => {
    const left = Array.isArray(leftInput) ? leftInput : [];
    const right = Array.isArray(rightInput) ? rightInput : [];
    if (left.length !== right.length) return false;
    for (let pointIndex = 0; pointIndex < left.length; pointIndex += 1) {
      const leftCoord = normalizeCoord(left[pointIndex]);
      const rightCoord = normalizeCoord(right[pointIndex]);
      if (
        Math.abs(leftCoord.lng - rightCoord.lng) > 0.000001 ||
        Math.abs(leftCoord.lat - rightCoord.lat) > 0.000001
      ) {
        return false;
      }
    }
    return true;
  };
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let index = 0; index < a.length; index += 1) {
    const left = a[index];
    const right = b[index];
    if (
      left.id !== right.id ||
      !sameCoordinateList(left.coordinates, right.coordinates) ||
      !sameCoordinateList(left.rawSegment, right.rawSegment) ||
      !sameCoordinateList(left.snappedSegment, right.snappedSegment)
    ) {
      return false;
    }
    if (
      left.snapConfidence !== right.snapConfidence ||
      left.snapSource !== right.snapSource ||
      left.snapStatus !== right.snapStatus ||
      left.snapMessage !== right.snapMessage
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
  return `${normalizedBase} | ${normalizedOperational}`;
}


function replaceVisibleAIWithECS(input: string): string {
  return input
    .replace(/\bAI\b/g, 'ECS')
    .replace(/\bA\.I\.\b/g, 'ECS')
    .replace(/\bai\b/g, 'ecs');
}

function sanitizeVisibleLanguage<T>(value: T, seen: WeakMap<object, unknown> = new WeakMap()): T {
  if (typeof value === 'string') {
    return replaceVisibleAIWithECS(value) as T;
  }
  if (Array.isArray(value)) {
    if (seen.has(value)) return seen.get(value) as T;
    const next: unknown[] = [];
    seen.set(value, next);
    value.forEach((item) => {
      next.push(sanitizeVisibleLanguage(item, seen));
    });
    return next as T;
  }
  if (value && typeof value === 'object') {
    if (seen.has(value)) return seen.get(value) as T;
    const next: Record<string, unknown> = {};
    seen.set(value, next);
    Object.entries(value as Record<string, unknown>).forEach(([key, child]) => {
      next[key] = sanitizeVisibleLanguage(child, seen);
    });
    return next as T;
  }
  return value;
}

type NavigateTopPopup =
  | 'tools'
  | 'importRoute'
  | 'intel'
  | 'pinDrawer'
  | 'trail'
  | 'savedRoutes'
  | 'preflightPacket'
  | 'stitch'
  | 'offlineCache'
  | 'storageDashboard'
  | 'pinEditor'
  | 'campScout'
  | 'recommendCampsite'
  | null;

type NavigateToolsChildPopup =
  | 'importRoute'
  | 'intel'
  | 'trail'
  | 'savedRoutes'
  | 'preflightPacket'
  | 'stitch'
  | 'offlineCache'
  | 'campScout'
  | 'recommendCampsite';

function isToolsChildPopup(popup: NavigateTopPopup): popup is NavigateToolsChildPopup {
  return (
    popup === 'importRoute' ||
    popup === 'intel' ||
    popup === 'trail' ||
    popup === 'savedRoutes' ||
    popup === 'preflightPacket' ||
    popup === 'stitch' ||
    popup === 'offlineCache' ||
    popup === 'campScout' ||
    popup === 'recommendCampsite'
  );
}

type RecommendCampsiteSelectedLocation = {
  latitude: number;
  longitude: number;
  source_type: Extract<
    CampSiteReportSourceType,
    'current_location' | 'pin_drop' | 'gpx_route' | 'gpx_waypoint' | 'gpx_track_selected_point'
  >;
  location_accuracy_m: number | null;
};

type RecommendCampsiteGpxMapSelection = {
  importId: string;
  candidateType: 'route_selected_point' | 'track_selected_point';
  sourceRouteName?: string | null;
  sourceTrackName?: string | null;
  sourceSegmentIndex?: number | null;
};

const SAVED_ROUTE_FILTER_OPTIONS: { key: SavedRouteAssetFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'imported', label: 'Imported' },
  { key: 'custom', label: 'Custom' },
  { key: 'stitched', label: 'Stitched' },
  { key: 'bookmarked', label: 'Saved' },
];

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
const [pendingOfflineRoutePackageFlowId, setPendingOfflineRoutePackageFlowId] = useState<string | null>(null);
const [trailPackSubmissionRoute, setTrailPackSubmissionRoute] =
  useState<ECSTrailPackSubmissionRouteInput | null>(null);
const [toolsMenuOpen, setToolsMenuOpen] = useState(false);
const [campLayerMenuOpen, setCampLayerMenuOpen] = useState(false);
const [activeGuidanceMinimized, setActiveGuidanceMinimized] = useState(false);
const [activeGuidanceMeasuredHeight, setActiveGuidanceMeasuredHeight] = useState(0);
const [activeGuidanceManualOverride, setActiveGuidanceManualOverride] = useState(false);
const activeGuidanceAutoMinimizeSinceRef = useRef<number | null>(null);
const activeGuidanceAutoMinimizeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
const activeGuidanceSessionKeyRef = useRef<string | null>(null);
const [selectedExploreRouteSegmentId, setSelectedExploreRouteSegmentId] = useState<string | null>(null);
const [activeVehicleId, setActiveVehicleId] = useState<string | null>(() => vehicleSetupStore.getActiveVehicleId());
const [activeVehicleRevision, setActiveVehicleRevision] = useState(0);
const [stitchSegmentIds, setStitchSegmentIds] = useState<string[]>([]);
const [stitchName, setStitchName] = useState('Stitched Expedition');
const [savedRoutesRefreshKey, setSavedRoutesRefreshKey] = useState(0);
const [savedRoutesQuery, setSavedRoutesQuery] = useState('');
const [savedRoutesFilter, setSavedRoutesFilter] = useState<SavedRouteAssetFilter>('all');
const [renamingSavedRouteAssetId, setRenamingSavedRouteAssetId] = useState<string | null>(null);
const [savedRouteRenameValue, setSavedRouteRenameValue] = useState('');
const [preflightRouteAssetId, setPreflightRouteAssetId] = useState<string | null>(null);
const [preflightRunId, setPreflightRunId] = useState<string | null>(null);
const [preflightPayload, setPreflightPayload] = useState<NavigationHandoffPayload | null>(null);
const [preflightLaunchConfirmVisible, setPreflightLaunchConfirmVisible] = useState(false);
const [expeditionSessionRevision, setExpeditionSessionRevision] = useState(0);

// -- ECS UI State -----------------------------
const [mapStyleMode, setMapStyleMode] = useState<NavigateMapStyleMode>(() => cachedMapStyleModePreference ?? 'day');
const [mapExpanded, setMapExpanded] = useState(false);
const collapseMap = useCallback(() => {
  if (mapExpanded) { hapticMicro(); setMapExpanded(false); }
}, [mapExpanded]);
const navigateLandscapeExpanded = adaptive.isLandscape;
const effectiveMapExpanded = mapExpanded || navigateLandscapeExpanded;

// -- Top layout measurement --------------------------------
const [headerHeight, setHeaderHeight] = useState(0);
const [storageBannerHeight, setStorageBannerHeight] = useState(0);
const actionBarHeight = 0;

// -- Layout offsets ----------------------------------------
const commandDockHeight = navigateLandscapeExpanded ? 0 : getCommandDockHeight(insets.bottom);

const OVERLAY_EDGE = adaptive.navigate.overlayEdge;
const OVERLAY_GAP = adaptive.navigate.overlayGap;
const OVERLAY_GROUP_GAP = adaptive.navigate.overlayGroupGap;
const LOWER_DOCK_EXCLUSION = commandDockHeight + adaptive.navigate.overlayGroupGap;

// map overlays render inside the map container, so 0 is the map's top edge
const MAP_TOP_EDGE = 0;

// shared top anchor for the upper map controls
const FLOATING_CONTROLS_TOP_LEFT = MAP_TOP_EDGE + TOP_MAP_CONTROLS_OFFSET;
const PAGE_FRAME_TOP_GAP = adaptive.isExpanded ? 8 : 6;
const PAGE_FRAME_BOTTOM_GAP = adaptive.isExpanded ? 8 : 6;
const ACTIVE_GUIDANCE_TOP = effectiveMapExpanded
  ? Math.max(insets.top + 12, 42)
  : MAP_TOP_EDGE + PAGE_FRAME_TOP_GAP;

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

const MAP_TOP_CONTROL_ROW = effectiveMapExpanded
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
const TOOLS_TRIGGER_SIZE = 40;
const TOOLS_TRIGGER_BOTTOM = COMPASS_BOTTOM + COMPASS_SIZE + 20;
const TOOLS_TRIGGER_RIGHT = COMPASS_RIGHT + Math.max(0, (COMPASS_SIZE - TOOLS_TRIGGER_SIZE) / 2);
const communityCampsitesEnabled = isCommunityCampsitesFeatureEnabled(
  DEFAULT_COMMUNITY_CAMPSITES_ROLLOUT_CONFIG,
  'communityCampsitesEnabled',
);
const gpxCampsiteImportEnabled = isCommunityCampsitesFeatureEnabled(
  DEFAULT_COMMUNITY_CAMPSITES_ROLLOUT_CONFIG,
  'gpxCampsiteImportEnabled',
);
const TOP_LEFT_STATUS_MAX_WIDTH = Math.max(
  adaptive.isExpanded ? 260 : 220,
  adaptive.windowWidth - TOP_RIGHT_UTILITY_WIDTH - OVERLAY_EDGE * 2 - OVERLAY_GAP * 2,
);

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
    fullBody?: boolean;
    showBackdrop?: boolean;
  },
) => {
  if (!visible) return null;

  const fullBody = options?.fullBody !== false;
  const centeredLeft = Math.max(
    OVERLAY_EDGE,
    Math.round((adaptive.windowWidth - popupWidth) / 2),
  );
  const activeGuidancePopupTopOffset =
    navigationOverlayMode === 'active' ? activeGuidanceToastTopOffset : null;
  const popupTop = fullBody
    ? activeGuidancePopupTopOffset ?? PAGE_FRAME_TOP_GAP
    : activeGuidancePopupTopOffset ?? MAP_POPUP_TOP;
  const popupBottom = MAP_POPUP_BOTTOM;

  return (
    <View style={styles.mapPopupLayer} pointerEvents="box-none">
      {options?.showBackdrop === false ? null : (
        <TouchableOpacity
          style={[
            styles.mapPopupBackdrop,
            {
              top: popupTop,
              bottom: popupBottom,
              backgroundColor: options?.backdropTint ?? 'rgba(0,0,0,0.30)',
            },
          ]}
          activeOpacity={1}
          onPress={onClose}
        />
      )}

      <View
        style={[
          styles.mapPopupShell,
          fullBody
            ? {
                top: popupTop,
                bottom: popupBottom,
                left: OVERLAY_EDGE,
                right: OVERLAY_EDGE,
                width: undefined,
              }
            : {
                top: popupTop,
                bottom: popupBottom,
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
      return {
        lat: point.lat,
        lng: point.lng,
        ...(Number.isFinite(point.ele_m) ? { ele: point.ele_m, ele_m: point.ele_m } : null),
      };
    })
    .filter((point): point is { lat: number; lng: number; ele?: number | null; ele_m?: number | null } => !!point);

  if (trailGeometry.length < 2) return null;

  const sourceKind = String(run.source ?? '').toLowerCase();
  const isCustomRoute = sourceKind === 'custom';
  const routeSource =
    run.offline_cache && (sourceKind === 'gpx' || sourceKind === 'import' || sourceKind === 'imported')
      ? 'cached_gpx'
      : sourceKind === 'gpx' || sourceKind === 'fit' || sourceKind === 'import' || sourceKind === 'imported'
        ? 'gpx'
        : isCustomRoute
          ? 'built'
          : 'saved';
  const usesStoredRouteGeometry = routeSource === 'gpx' || routeSource === 'cached_gpx';
  const waypointCount = Array.isArray(run.waypoints) ? run.waypoints.length : 0;
  const segmentCount = Math.max(options?.segmentCount ?? 1, 1);
  const transitionLegCount = Math.max(options?.transitionLegCount ?? 0, 0);
  const trailheadCoordinate = trailGeometry[0] ?? null;
  const destinationCoordinate = trailGeometry[trailGeometry.length - 1] ?? null;
  const subtitleParts = [
    `${run.stats.distance_miles.toFixed(1)} mi`,
    waypointCount > 0 ? `${waypointCount} waypoints` : null,
    segmentCount > 1 ? `${segmentCount} segments` : null,
  ].filter(Boolean);

  return {
    id: run.id,
    source: isCustomRoute ? 'saved' : 'import',
    type: isCustomRoute ? 'hybrid_route' : 'trail',
    title: run.title,
    subtitle: subtitleParts.join(' | ') || null,
    coordinate: destinationCoordinate,
    trailheadCoordinate,
    roadDestinationCoordinate: isCustomRoute ? trailheadCoordinate : null,
    trailGeometry,
    trailLengthMiles:
      Number.isFinite(run.stats.distance_miles) && run.stats.distance_miles > 0
        ? run.stats.distance_miles
        : computeTrailLengthMiles(trailGeometry),
    trailCategory: isCustomRoute
      ? 'Custom Route'
      : segmentCount > 1
        ? 'Stitched Expedition'
        : 'Imported Trail',
    tripMode: isCustomRoute ? 'hybrid' : 'trail',
    routeSource,
    requiresOnlineRouting: usesStoredRouteGeometry ? false : isCustomRoute,
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
      routeOrigin: isCustomRoute ? 'custom_built' : 'run_store',
      routeSource,
      requiresOnlineRouting: usesStoredRouteGeometry ? false : isCustomRoute,
      geometrySource: usesStoredRouteGeometry ? 'stored_gpx_geometry' : 'stored_run_geometry',
      offlineCacheStatus: run.offline_cache?.cache_status ?? null,
      offlineTileCacheStatus: run.offline_cache?.tile_cache_status ?? null,
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

function buildNavigationPayloadFromRoadRoute(route: RoadNavRoute | null | undefined): NavigationHandoffPayload | null {
  if (!route?.destination?.coordinate) return null;
  const trailGeometry = Array.isArray(route.geometry)
    ? route.geometry
        .map((point) => {
          if (!Number.isFinite(point?.lat) || !Number.isFinite(point?.lng)) return null;
          return { lat: Number(point.lat), lng: Number(point.lng) };
        })
        .filter((point): point is RoadNavCoordinate => !!point)
    : [];
  const geometry = trailGeometry.length > 1
    ? trailGeometry
    : [
        route.origin,
        route.destination.coordinate,
      ].filter((point): point is RoadNavCoordinate => {
        return !!point && Number.isFinite(point.lat) && Number.isFinite(point.lng);
      });
  const distanceMiles =
    Number.isFinite(route.distanceM) && route.distanceM > 0
      ? route.distanceM / 1609.344
      : geometry.length > 1
        ? computeTrailLengthMiles(geometry)
        : null;
  const estimatedTravelHours =
    Number.isFinite(route.durationS) && route.durationS > 0
      ? route.durationS / 3600
      : null;

  return {
    id: route.destination.id || route.id,
    source: 'search',
    type: 'place',
    title: route.destination.title || 'Generated Route',
    subtitle: route.destination.subtitle ?? null,
    coordinate: route.destination.coordinate,
    trailheadCoordinate: geometry[0] ?? route.origin ?? null,
    roadDestinationCoordinate: route.destination.coordinate,
    trailGeometry: geometry,
    trailLengthMiles: distanceMiles,
    trailCategory: 'Road Route',
    tripMode: 'road',
    routeSource: 'search',
    requiresOnlineRouting: false,
    trailWaypoints: [],
    trailDecisionPoints: [],
    routeMetadata: {
      previewSource: 'road_navigation',
      routeId: route.id,
      routeSource: 'search',
      routeType: 'road',
      distanceMiles,
      estimatedTravelHours,
      confidenceLabel: 'Generated route',
      geometrySource: trailGeometry.length > 1 ? 'road_navigation_geometry' : 'estimated_endpoint_line',
      sourceType: route.destination.sourceType,
      stepCount: route.steps.length,
    },
    landmarkMetadata: null,
    raw: {
      routeId: route.id,
      destinationId: route.destination.id,
      geometryPointCount: geometry.length,
    },
    createdAt: route.createdAt || route.id,
  };
}

function readObject(value: unknown): Record<string, any> | null {
  return value && typeof value === 'object' ? (value as Record<string, any>) : null;
}

const isRecoveryAssistNavigationPayload = useCallback((
  payload: NavigationHandoffPayload | null | undefined,
): payload is NavigationHandoffPayload => {
  const metadata = readObject(payload?.routeMetadata);
  return (
    payload?.source === 'dispatch' &&
    payload.routeSource === 'dispatch_recovery' &&
    metadata?.navigationMode === 'recovery_assist' &&
    !!metadata?.recoveryAssistEventId
  );
}, []);

const shouldAutoStartNavigationPayload = useCallback((
  payload: NavigationHandoffPayload | null | undefined,
  flow: ECSNavigationFlow | null | undefined,
): boolean => {
  const payloadMetadata = readObject(payload?.routeMetadata);
  const flowContext = readObject(flow?.context);
  const explicitRoutePreviewStart =
    flow?.target === 'navigate' &&
    flowContext?.autoStartNavigation === true &&
    (flowContext?.routePreviewStartGuidance === true ||
      payloadMetadata?.routePreviewStartGuidance === true);
  return (
    explicitRoutePreviewStart ||
    (isRecoveryAssistNavigationPayload(payload) &&
    (
      payloadMetadata?.autoStartNavigation === true ||
      flowContext?.autoStartNavigation === true
    ))
  );
}, [isRecoveryAssistNavigationPayload]);

function extractStartGuidanceVehicleFit(
  payload: NavigationHandoffPayload | null,
): RouteGuidanceVehicleFitInput | null {
  const raw = readObject(payload?.raw);
  const metadata = readObject(payload?.routeMetadata);
  const vehicleMatch = readObject(raw?.vehicleMatch) ?? readObject(raw?.vehicle_fit) ?? readObject(metadata?.vehicleMatch);
  const vehicleFit = readObject(raw?.vehicleFit) ?? readObject(raw?.vehicle_fit_result) ?? readObject(metadata?.vehicleFit);
  const source = vehicleMatch ?? vehicleFit;
  if (!source) return null;

  return {
    label: safeString(source.label ?? source.level, null as any),
    level: safeString(source.level ?? source.fitLevel, null as any),
    note: safeString(source.note ?? source.summary ?? source.shortReason, null as any),
  };
}

function getRouteGuidanceStartReviewReasons(
  readinessStack: RouteGuidanceReadinessViewModel | null | undefined,
): StartExpeditionReviewReason[] {
  if (!readinessStack) return [];

  const reasons: StartExpeditionReviewReason[] = [];
  const hasLowConfidence =
    readinessStack.routeConfidenceSummary?.status === 'red' ||
    readinessStack.routeConfidenceDisplay.tone === 'warning';
  const hasWarnings =
    readinessStack.recommendedActions.length > 0 ||
    readinessStack.rows.some((row) => row.tone === 'warning' || row.tone === 'caution');

  if (hasLowConfidence) {
    reasons.push({ id: 'low_confidence', label: 'Low confidence' });
  }
  if (hasWarnings) {
    reasons.push({ id: 'readiness_warnings', label: 'Readiness warnings' });
  }

  return reasons;
}

function getAssistSurfaceActionLabel(surface: AssistSurface): string | null {
  switch (surface) {
    case 'intel':
      return 'Open Intel';
    case 'weather_detail':
    case 'route_weather':
      return 'Review Weather';
    case 'pin_drawer':
      return 'Open Pins';
    case 'storage_dashboard':
      return 'Open Storage';
    case 'offline_cache':
      return 'Open Offline';
    case 'recenter':
      return 'Recenter';
    case 'route_overview':
      return 'Route Overview';
    case 'telemetry':
      return 'Open Telemetry';
    case 'none':
    default:
      return null;
  }
}

function isCustomNavigationPreview(
  payload: NavigationHandoffPayload | null,
  activeRun: ECSRun | null,
): boolean {
  const metadata = readObject(payload?.routeMetadata);
  const routeSource = safeString(payload?.routeSource ?? metadata?.routeSource ?? metadata?.source, '').toLowerCase();
  const routeOrigin = safeString(metadata?.routeOrigin, '').toLowerCase();
  return (
    activeRun?.source === 'custom' ||
    routeSource === 'built' ||
    routeSource === 'drawn' ||
    routeOrigin.includes('custom')
  );
}

function buildRouteConfidenceInputFromPreview(args: {
  payload: NavigationHandoffPayload | null;
  activeRun: ECSRun | null;
  routeHasGeometry: boolean;
}) {
  const { payload, activeRun, routeHasGeometry } = args;
  const metadata = readObject(payload?.routeMetadata);
  const raw = readObject(payload?.raw);
  const trust = readObject(raw?.trust ?? raw?.routeTrust ?? raw?.metadataTrust) as any;
  const routeSource = safeString(
    activeRun?.source ?? payload?.routeSource ?? metadata?.routeSource ?? metadata?.source ?? payload?.source,
    '',
  );
  const custom = isCustomNavigationPreview(payload, activeRun);
  const imported =
    !custom &&
    ['gpx', 'cached_gpx', 'import', 'imported', 'kml', 'kmz', 'fit', 'geojson'].includes(routeSource.toLowerCase());

  return {
    routeSource,
    routeLabel: safeString(metadata?.routeOrigin ?? metadata?.previewSource ?? payload?.source, null as any),
    isCustomRoute: custom,
    isImportedRoute: imported,
    isGeneratedRoute: payload?.source === 'explore' && !custom && !imported,
    isCurated: safeString(raw?.routeLabel ?? raw?.sourceLabel, '').toLowerCase().includes('curated'),
    isUserSupported: safeString(raw?.sourceLabel ?? raw?.evidenceLabel, '').toLowerCase().includes('user'),
    hasCompleteGeometry: routeHasGeometry,
    hasMissingSegments: metadata?.missingSegments === true,
    hasStaleRouteIntel: metadata?.routeIntelFreshness === 'stale' || metadata?.freshness === 'stale',
    cachedOnlyContext: metadata?.offlineCacheStatus === 'cached' && metadata?.requiresOnlineRouting !== false,
    accessStatus: safeString(metadata?.accessStatus ?? raw?.accessStatus, null as any),
    conflictingSignals: Array.isArray(metadata?.conflictingSignals) ? metadata.conflictingSignals : null,
    recommendationConfidence: readObject(raw?.recommendationConfidence) as any,
    trust,
    legacyGeneratedConfidence: safeString(raw?.aiConfidence ?? raw?.confidence, null as any),
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
          name: `Segment ${index + 1} complete | ${run.title}`,
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

  // -- Mounted ref for memory leak prevention ----------------
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

  useEffect(() => expeditionStateStore.subscribe(() => {
    setExpeditionSessionRevision((revision) => revision + 1);
  }), []);



  const [authVisible, setAuthVisible] = useState(false);
const [runs, setRuns] = useState<ECSRun[]>([]);
const [activeRun, setActiveRun] = useState<ECSRun | null>(null);
const [snapshotModalVisible, setSnapshotModalVisible] = useState(false);

// Map state
const initialMapTokenRef = useRef(getMapboxTokenSync());
const [mapToken, setMapToken] = useState<string | null>(initialMapTokenRef.current || null);
const [mapLoading, setMapLoading] = useState(initialMapTokenRef.current.length === 0);
const [mapSurfaceReady, setMapSurfaceReady] = useState(false);
const [mapOverlayStartupReady, setMapOverlayStartupReady] = useState(false);
const [mapSurfaceRevision, setMapSurfaceRevision] = useState(0);

const hasToken = !!mapToken;
const isMapUIReady = hasToken && !mapLoading && mapSurfaceReady;

const handleMapStyleModeChange = useCallback((nextMode: NavigateMapStyleMode) => {
  setMapStyleMode((prev) => {
    if (prev === nextMode) return prev;
    void persistMapStyleMode(nextMode);
    return nextMode;
  });
}, []);

const mapStyle: MapStyleKey = useMemo(() => {
  if (mapStyleMode === 'tac') return 'tactical';
  if (mapStyleMode === 'sat') return 'satellite';
  if (mapStyleMode === '3d') return '3d';
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
const [userHasManuallyMovedMap, setUserHasManuallyMovedMap] = useState(false);
const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
const [recentSearches, setRecentSearches] = useState<RoadNavSearchSuggestion[]>([]);
const [recentSearchesVisible, setRecentSearchesVisible] = useState(false);

const latestGpsMapLocation = useMemo(() => {
  const position = gps.rawGPS.position ?? gps.position;
  const hasFix = gps.rawGPS.hasFix || gps.hasFix;
  if (!hasFix || !position) return null;
  return toSafeMapLocation(position);
}, [gps.hasFix, gps.position, gps.rawGPS.hasFix, gps.rawGPS.position]);

useEffect(() => {
  if (!latestGpsMapLocation) {
    if (gps.permissionDenied) {
      setUserLocation(null);
    }
    return;
  }

  setUserLocation((prev) => {
    if (
      prev &&
      Math.abs(prev.lat - latestGpsMapLocation.lat) < 0.000001 &&
      Math.abs(prev.lng - latestGpsMapLocation.lng) < 0.000001
    ) {
      return prev;
    }
    return latestGpsMapLocation;
  });
}, [gps.permissionDenied, latestGpsMapLocation]);
const weatherLocation = useMemo(
  () => {
    const latitude = gps.position?.latitude;
    const longitude = gps.position?.longitude;
    return gps.hasFix && latitude != null && longitude != null
      ? {
          lat: latitude,
          lng: longitude,
        }
      : null;
  },
  [gps.hasFix, gps.position?.latitude, gps.position?.longitude],
);
const operationalWeather = useOperationalWeather({
  enabled: true,
  gps: {
    lat: gps.position?.latitude ?? null,
    lng: gps.position?.longitude ?? null,
    hasFix: gps.hasFix,
    permissionDenied: gps.permissionDenied,
    accuracyM: gps.position?.accuracyM ?? null,
  },
});
useRemoteWeatherRouteWatcher({ enabled: true });


const tokenRetryCountRef = useRef(0);
const tokenRetryTimerRef = useRef<any>(null);

// NEW - prevents the 20s guard timeout from firing after the token already resolved
const tokenResolvedRef = useRef(false);
const tokenGuardTimeoutRef = useRef<any>(null);

useEffect(() => {
  if (mapToken) {
    tokenResolvedRef.current = true;
    setMapLoading(false);
    return undefined;
  }

  let cancelled = false;
  tokenResolvedRef.current = false;
  setMapLoading(true);

  void getMapboxToken()
    .then((token) => {
      if (cancelled || !mountedRef.current) return;
      tokenResolvedRef.current = token.length > 0;
      setMapToken(token || '');
    })
    .catch(() => {
      if (cancelled || !mountedRef.current) return;
      tokenResolvedRef.current = false;
      setMapToken('');
    })
    .finally(() => {
      if (!cancelled && mountedRef.current) {
        setMapLoading(false);
      }
    });

  return () => {
    cancelled = true;
  };
}, [mapToken]);

useEffect(() => {
  let cancelled = false;

  void loadRecentRoadSearches().then((stored) => {
    if (!cancelled) {
      setRecentSearches(stored);
    }
  });

  return () => {
    cancelled = true;
  };
}, []);


  const handleMapRetry = useCallback(async () => {
    setMapLoading(true);
    setMapSurfaceReady(false);
    tokenResolvedRef.current = false;
    clearTokenCache();

    try {
      const token = await getMapboxToken();
      tokenResolvedRef.current = token.length > 0;
      setMapToken(token || '');
    } catch {
      tokenResolvedRef.current = false;
      setMapToken('');
    }

    setMapLoading(false);
    setMapSurfaceRevision((revision) => revision + 1);
  }, []);



  // -- Phase 2.8: Pin state ----------------------------------
const [allPins, setAllPins] = useState<ECSPin[]>([]);
const [editingPin, setEditingPin] = useState<ECSPin | null>(null);
const [dropCoords, setDropCoords] = useState<{ lat: number; lng: number } | null>(null);
const [selectedDroppedPinId, setSelectedDroppedPinId] = useState<string | null>(null);
const [recommendCampsiteLocation, setRecommendCampsiteLocation] =
  useState<RecommendCampsiteSelectedLocation | null>(null);
const [recommendCampsiteGpxImport, setRecommendCampsiteGpxImport] =
  useState<GpxCampsiteImportResult | null>(null);
const [recommendCampsiteGpxUploadMode, setRecommendCampsiteGpxUploadMode] = useState(false);
const [recommendCampsiteImportError, setRecommendCampsiteImportError] = useState<string | null>(null);
const [recommendCampsiteImporting, setRecommendCampsiteImporting] = useState(false);
const [recommendCampsiteGpxMapSelection, setRecommendCampsiteGpxMapSelection] =
  useState<RecommendCampsiteGpxMapSelection | null>(null);

// Direct-tap pin mode
const [pinDropMode, setPinDropMode] = useState(false);
const [recommendCampsiteDropMode, setRecommendCampsiteDropMode] = useState(false);
const [recommendCampsiteDropSource, setRecommendCampsiteDropSource] =
  useState<RecommendCampsiteSelectedLocation['source_type']>('pin_drop');

const pinModePulse = useRef(new Animated.Value(1)).current;
const pinModePulseLoopRef = useRef<Animated.CompositeAnimation | null>(null);
const mapPlacementModeActive = pinDropMode || recommendCampsiteDropMode;

useEffect(() => {
  if (mapPlacementModeActive) {
    if (pinModePulseLoopRef.current) {
      return undefined;
    }
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
    pinModePulseLoopRef.current = loop;
    loop.start();
    return () => {
      loop.stop();
      if (pinModePulseLoopRef.current === loop) {
        pinModePulseLoopRef.current = null;
      }
    };
  }

  pinModePulseLoopRef.current?.stop();
  pinModePulseLoopRef.current = null;
  pinModePulse.stopAnimation();
  pinModePulse.setValue(1);
}, [mapPlacementModeActive, pinModePulse]);

// Keep crosshair available only if you still want it for other workflows
const [showCrosshair, setShowCrosshair] = useState(false);

// -- Phase 3: Explicit map camera command state -----------------
const [mapCameraCommand, setMapCameraCommand] = useState<MapSurfaceCameraCommand | null>(null);
const [mapCameraCommandTrigger, setMapCameraCommandTrigger] = useState(0);
const lastMapCameraCommandSignatureRef = useRef(buildMapCameraCommandSignature(null));

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


  // -- Phase 3.0: Pin category filter state ------------------
  const [activePinTypeFilters, setActivePinTypeFilters] = useState<PinType[]>([]);

  const handlePinTypeFilterToggle = useCallback((type: PinType) => {
    setActivePinTypeFilters(prev =>
      prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type]
    );
  }, []);

  const handlePinTypeFilterReset = useCallback(() => {
    setActivePinTypeFilters([]);
  }, []);

  // -- Offline map caching state -----------------------------
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
  const [offlineRouteReadinessState, setOfflineRouteReadinessState] = useState<{
    hydrated: boolean;
    routes: OfflineCachedRoute[];
  }>({ hydrated: false, routes: [] });
  const [offlineTileSyncSnapshot, setOfflineTileSyncSnapshot] = useState(() =>
    offlineTileSyncCoordinator.getSnapshot(),
  );
  const [dismissedOfflineSyncCompletionNoticeIds, setDismissedOfflineSyncCompletionNoticeIds] =
    useState<Set<string>>(() => new Set());
  const [offlineSyncCompletionNotice, setOfflineSyncCompletionNotice] =
    useState<OfflineSyncCompletionNotice | null>(null);
  const offlineSyncCompletionNoticePrefsHydratedRef = useRef(false);
  const initialCompletedOfflineSyncNoticeIdsRef = useRef<Set<string> | null>(null);
  const previousOfflineSyncJobStatusRef = useRef<Map<string, string>>(new Map());

  // -- Phase 2.8.1: Trail recording state --------------------
  // -- Phase 2.8.1: Trail recording state --------------------
  const [trailStatus, setTrailStatus] = useState<TrailRecordingStatus>('idle');
  const [trailStats, setTrailStats] = useState<TrailStats | null>(null);
  const [trailSegments, setTrailSegments] = useState<TrailSegmentData[]>([]);
  const [routeBuilderActive, setRouteBuilderActive] = useState(false);
  const [routeBuilderDrawing, setRouteBuilderDrawing] = useState(false);
  const [routeBuilderSegments, setRouteBuilderSegments] = useState<RouteBuilderSegmentData[]>([]);
  const [routeBuilderSnapSource, setRouteBuilderSnapSource] = useState<string | null>(null);
  const [routeBuilderSnapStatus, setRouteBuilderSnapStatus] = useState<RouteBuilderSegmentData['snapStatus']>(null);
  const [routeBuilderSnapMessage, setRouteBuilderSnapMessage] = useState<string | null>(null);
  const [campsiteDrawMode, setCampsiteDrawMode] = useState(false);
  const [campsiteDrawingPoints, setCampsiteDrawingPoints] = useState<CampsiteSearchPolygonPoint[]>([]);
  const [campsiteDrawingClosed, setCampsiteDrawingClosed] = useState(false);
  const [campScoutAreaMode, setCampScoutAreaMode] =
    useState<CampScoutAreaSelectionMode>('idle');
  const [campScoutFilterMode, setCampScoutFilterMode] =
    useState<CampScoutFilterMode>('balanced');
  const [campScoutIncludeCommunity, setCampScoutIncludeCommunity] = useState(true);
  const [topToolboxHeights, setTopToolboxHeights] = useState({
    routeBuilder: 0,
    campsiteArea: 0,
    polygonCamp: 0,
  });
  const [campsitePolygonLocateState, setCampsitePolygonLocateState] = useState<
    CampScoutLocateState
  >('idle');
  const [campsitePolygonLocateMessage, setCampsitePolygonLocateMessage] = useState<string | null>(null);
  const campsitePolygonLocateRequestRef = useRef<string | null>(null);
  const [savedCampsiteDrawings, setSavedCampsiteDrawings] = useState<SavedCampsiteSearchDrawing[]>([]);
  const [routeDesignContext, setRouteDesignContext] = useState<PolygonRouteDesignContext | null>(null);
  const [customRouteRefreshKey, setCustomRouteRefreshKey] = useState(0);
  const routeBuilderStagedRunIdRef = useRef<string | null>(null);
  const routeBuilderStagedRouteIdRef = useRef<string | null>(null);
  const [trailExportVisible, setTrailExportVisible] = useState(false);
  const [trailStyle, setTrailStyle] = useState<'normal' | 'speed'>('normal');
  const trailUpdateTimer = useRef<any>(null);
  const lastTrailGpsTimestampRef = useRef<number | null>(null);
  const autoStoppedTrailRecordingRef = useRef<string | null>(null);

  // -- Phase 2.8.2: Trail replay state -----------------------
  const [isReplayActive, setIsReplayActive] = useState(false);
  const [replayPlaying, setReplayPlaying] = useState(false);
  const [replaySpeed, setReplaySpeed] = useState<ReplaySpeed>(1);
  const [replayCurrentSeconds, setReplayCurrentSeconds] = useState(0);
  const [replayAnalytics, setReplayAnalytics] = useState<TrailAnalytics | null>(null);
  const [replayMarkerPos, setReplayMarkerPos] = useState<{ lat: number; lng: number } | null>(null);
  const replayTimerRef = useRef<any>(null);

  // -- Phase 2.8.3: Trail history state ----------------------
  const [trailHistoryRefreshKey, setTrailHistoryRefreshKey] = useState(0);
  const [replayFromHistory, setReplayFromHistory] = useState(false);
  const [replayHistoryTrailSegments, setReplayHistoryTrailSegments] = useState<TrailSegmentData[]>([]);

   // -- Modal visibility state --------------------------------
  const pinModalVisible = mapOverlayStartupReady && activeTopPopup === 'pinEditor';
  const trailModalVisible = mapOverlayStartupReady && activeTopPopup === 'trail';
  const importRouteModalVisible = mapOverlayStartupReady && activeTopPopup === 'importRoute';
  const savedRoutesModalVisible = mapOverlayStartupReady && activeTopPopup === 'savedRoutes';
  const preflightPacketModalVisible = mapOverlayStartupReady && activeTopPopup === 'preflightPacket';
  const stitchModalVisible = mapOverlayStartupReady && activeTopPopup === 'stitch';
  const pinDrawerVisible = mapOverlayStartupReady && activeTopPopup === 'pinDrawer';
  const offlineCacheModalVisible = mapOverlayStartupReady && activeTopPopup === 'offlineCache';
  const storageDashboardVisible = mapOverlayStartupReady && activeTopPopup === 'storageDashboard';
  const campScoutIntroVisible = mapOverlayStartupReady && activeTopPopup === 'campScout';
  const intelOpen = mapOverlayStartupReady && activeTopPopup === 'intel';
  const recommendCampsiteModalVisible =
    mapOverlayStartupReady && activeTopPopup === 'recommendCampsite';
const [isOnline, setIsOnline] = useState(() => navigateConnectivity.status === 'online');
  const prevOnlineRef = useRef(isOnline);
  const prevConnectivityStatusRef = useRef<ConnectivityDetailedState['status']>(
    navigateConnectivity.status,
  );

  const activeExpedition = useMemo(() => missionExpeditionStore.getActive(), []);
  const activeExpeditionId = activeExpedition?.id || null;
  const activeExpeditionName = activeExpedition?.name || null;

  const [exportPins, setExportPins] = useState<ECSPin[]>([]);
  const [exportModalVisible, setExportModalVisible] = useState(false);
  const [pendingGpxContent, setPendingGpxContent] = useState<string | null>(null);
  const [pendingGpxName, setPendingGpxName] = useState('');
  const [importFeedback, setImportFeedback] = useState<{
    tone: 'info' | 'success' | 'error';
    title: string;
    detail?: string;
  } | null>(null);
  const [isImportPending, setIsImportPending] = useState(false);
  const isImportPendingRef = useRef(false);
  const activeImportFileKeyRef = useRef<string | null>(null);
  const recentImportFileKeysRef = useRef<Map<string, number>>(new Map());
  const [bsVehicleName, setBsVehicleName] = useState('');
  const [bsRange, setBsRange] = useState('');
  const [bsTotalWeight, setBsTotalWeight] = useState('');
  const [bsRoofWeight, setBsRoofWeight] = useState('');
  const [bsHitchWeight, setBsHitchWeight] = useState('');
  const [bsRoofLimit, setBsRoofLimit] = useState('');
  const [bsHitchLimit, setBsHitchLimit] = useState('');
  const [missionBrief, setMissionBrief] = useState<MissionBrief | null>(null);
  type NavigateAiAssistBanner = {
    title: string;
    message: string;
    surface: AssistSurface;
    rule?: AutonomousAssistRule | null;
  };
  const [aiAssistBanner, setAiAssistBanner] = useState<NavigateAiAssistBanner | null>(null);
  const [renderedAiAssistBanner, setRenderedAiAssistBanner] = useState<NavigateAiAssistBanner | null>(null);
  const renderedAiAssistBannerRef = useRef<NavigateAiAssistBanner | null>(null);
  const aiAssistBannerOpacity = useRef(new Animated.Value(0)).current;
  const aiAssistBannerDismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const aiAssistBannerDismissingRef = useRef(false);
  const assistCooldownRef = useRef<{ eventKey: string | null; firedAt: number }>({
    eventKey: null,
    firedAt: 0,
  });

  useEffect(() => {
    return () => {
      if (aiAssistBannerDismissTimerRef.current) {
        clearTimeout(aiAssistBannerDismissTimerRef.current);
        aiAssistBannerDismissTimerRef.current = null;
      }
      aiAssistBannerOpacity.stopAnimation();
    };
  }, [aiAssistBannerOpacity]);

  const [cleanupReport, setCleanupReport] = useState<CleanupReport | null>(null);
  const [tiltAlertDetailVisible, setTiltAlertDetailVisible] = useState(false);
  const [tiltAlertDetailEvent, setTiltAlertDetailEvent] = useState<TiltAlertEvent | null>(null);
  const [tiltAlertDetailCluster, setTiltAlertDetailCluster] = useState<any>(null);
  const [weatherAlertDetailVisible, setWeatherAlertDetailVisible] = useState(false);
  const [routeWeatherDetailVisible, setRouteWeatherDetailVisible] = useState(false);
  const [compassPowerSaveActive, setCompassPowerSaveActive] = useState(false);
  const lastKnownHeadingRef = useRef<number | null>(null);
  const [showTiltAlertZones, setShowTiltAlertZones] = useState(false);
  const [showRemotenessOverlay, setShowRemotenessOverlay] = useState(false);
  const [remotenessLegendMounted, setRemotenessLegendMounted] = useState(false);
  const [remotenessLegendDisclosure, setRemotenessLegendDisclosure] = useState<'on' | 'off' | null>(null);
  const remotenessLegendOpacity = useRef(new Animated.Value(0)).current;
  const remotenessLegendDisclosureOpacity = useRef(new Animated.Value(0)).current;
  const remotenessLegendDisclosureTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [exploreRoutesEnabled, setExploreRoutesEnabled] = useState(false);
  const [exploreRoutesHandoff, setExploreRoutesHandoff] = useState<ExploreRoutesMapHandoff | null>(null);
  const [aiRouteSnapshotVersion, setAiRouteSnapshotVersion] = useState(0);
  const lastExploreRoutesFitSignatureRef = useRef<string | null>(null);
  const {
    markers: tiltAlertMarkers,
    clusters: tiltAlertClusters,
    reload: reloadTiltAlertMarkers,
  } = useTiltAlertMarkers(showTiltAlertZones);

  const loadRuns = useCallback(() => {
    const nextRuns = runStore.getAll();
    setRuns(nextRuns);
    setActiveRun(runStore.getActive() ?? null);
  }, []);

  const loadPins = useCallback(() => {
    const nextPins = activeExpeditionId ? pinStore.getByExpedition(activeExpeditionId) : pinStore.getAll();
    setAllPins(nextPins);
  }, [activeExpeditionId]);

  const clearActiveRunSelection = useCallback(() => {
    if (!runStore.getActive()) return;
    runStore.deactivateAll();
    loadRuns();
    loadPins();
  }, [loadPins, loadRuns]);

  useEffect(() => {
    return aiRouteStore.subscribe(() => {
      setAiRouteSnapshotVersion((version) => version + 1);
    });
  }, []);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      void (async () => {
        const handoff = await consumeExploreRoutesMapHandoff();
        if (cancelled || !handoff) return;
        setExploreRoutesHandoff(handoff);
        setExploreRoutesEnabled(true);
        setToolsMenuOpen(false);
      })();

      return () => {
        cancelled = true;
      };
    }, []),
  );

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
  const roadSession = roadNavigation.session;
  const roadStepListExpanded = roadNavigation.stepListExpanded;
  const setRoadStepListExpanded = roadNavigation.setStepListExpanded;
  const selectRoadSuggestion = roadNavigation.selectSuggestion;

  const [exploreNavigationPayload, setExploreNavigationPayload] =
    useState<NavigationHandoffPayload | null>(null);
  const appliedNavigationPayloadRef = useRef<string | null>(null);
  const lastPersistedNavigationPayloadRef = useRef<string | null>(null);
  const pendingAutoStartRouteIdRef = useRef<string | null>(null);
  const [startDecisionVisible, setStartDecisionVisible] = useState(false);
  const [pendingStartMode, setPendingStartMode] = useState<'road' | 'trail' | null>(null);
  const [pendingStartReviewReasons, setPendingStartReviewReasons] = useState<StartExpeditionReviewReason[]>([]);
  const startGuidanceReviewReasonsRef = useRef<StartExpeditionReviewReason[]>([]);
  const currentExpeditionReadiness = useCurrentExpeditionReadiness();
  const [activeReadinessMinimized, setActiveReadinessMinimized] = useState(true);
  const appliedRunNavigationStartRef = useRef<string | null>(null);
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

  const fitMapToExploreRouteCamps = useCallback(
    (payload: NavigationHandoffPayload) => {
      const campPoints = (payload.campMarkers ?? []).map((marker) => ({
        lat: Number(marker.latitude),
        lng: Number(marker.longitude),
      }));
      const routePoints = safeArray(payload.trailGeometry)
        .map((point) => ({
          lat: Number((point as RoadNavCoordinate).lat),
          lng: Number((point as RoadNavCoordinate).lng),
        }));
      const anchorPoints = [
        payload.trailheadCoordinate,
        payload.roadDestinationCoordinate,
        payload.coordinate,
      ]
        .filter(Boolean)
        .map((point) => ({
          lat: Number((point as RoadNavCoordinate).lat),
          lng: Number((point as RoadNavCoordinate).lng),
        }));
      const points = [...campPoints, ...routePoints, ...anchorPoints].filter(
        (point) => Number.isFinite(point.lat) && Number.isFinite(point.lng),
      );
      if (points.length === 0) return false;

      const bounds = points.reduce(
        (acc, point) => ({
          north: Math.max(acc.north, point.lat),
          south: Math.min(acc.south, point.lat),
          east: Math.max(acc.east, point.lng),
          west: Math.min(acc.west, point.lng),
        }),
        {
          north: points[0].lat,
          south: points[0].lat,
          east: points[0].lng,
          west: points[0].lng,
        },
      );
      const latSpan = Math.max(bounds.north - bounds.south, 0.025);
      const lngSpan = Math.max(bounds.east - bounds.west, 0.035);
      queueMapCameraCommand({
        mode: 'route_overview',
        fitBounds: {
          north: bounds.north + latSpan * 0.18,
          south: bounds.south - latSpan * 0.18,
          east: bounds.east + lngSpan * 0.18,
          west: bounds.west - lngSpan * 0.18,
          padding: 86,
          maxZoom: 14,
        },
        durationMs: 650,
        animate: true,
        reason: 'explore_route_camps',
      });
      setFollowUser(false);
      return true;
    },
    [queueMapCameraCommand],
  );

  const fitMapToExploreRouteSegments = useCallback(
    (segments: ExploreRouteOverlaySegment[]) => {
      const points = segments
        .flatMap((segment) => segment.coordinates)
        .map((point) => ({
          lat: Number(point.latitude),
          lng: Number(point.longitude),
        }))
        .filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lng));
      if (points.length === 0) return false;

      const bounds = points.reduce(
        (acc, point) => ({
          north: Math.max(acc.north, point.lat),
          south: Math.min(acc.south, point.lat),
          east: Math.max(acc.east, point.lng),
          west: Math.min(acc.west, point.lng),
        }),
        {
          north: points[0].lat,
          south: points[0].lat,
          east: points[0].lng,
          west: points[0].lng,
        },
      );
      const latSpan = Math.max(bounds.north - bounds.south, 0.05);
      const lngSpan = Math.max(bounds.east - bounds.west, 0.07);
      queueMapCameraCommand({
        mode: 'route_overview',
        fitBounds: {
          north: bounds.north + latSpan * 0.16,
          south: bounds.south - latSpan * 0.16,
          east: bounds.east + lngSpan * 0.16,
          west: bounds.west - lngSpan * 0.16,
          padding: 82,
          maxZoom: 13,
        },
        durationMs: 700,
        animate: true,
        reason: 'explore_routes_overlay',
      }, { force: true });
      setFollowUser(false);
      return true;
    },
    [queueMapCameraCommand],
  );

  const rawTrailPositionLat = gps.rawGPS.position?.latitude ?? null;
  const rawTrailPositionLng = gps.rawGPS.position?.longitude ?? null;
  const rawTrailAccuracyM = gps.rawGPS.position?.accuracyM ?? null;
  const trailGuidanceLocation = useMemo(
    () =>
      rawTrailPositionLat != null && rawTrailPositionLng != null
        ? {
            lat: rawTrailPositionLat,
            lng: rawTrailPositionLng,
            latitude: rawTrailPositionLat,
            longitude: rawTrailPositionLng,
            accuracyM: rawTrailAccuracyM,
            speedMph: gps.position?.speedMph ?? null,
            headingDeg: gps.position?.headingDeg ?? null,
            timestamp: Date.now(),
          }
        : null,
    [
      gps.position?.headingDeg,
      gps.position?.speedMph,
      rawTrailAccuracyM,
      rawTrailPositionLat,
      rawTrailPositionLng,
    ],
  );
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
  const lastTrailStateSignatureRef = useRef<string | null>(null);

  const currentGpsHeadingDeg = gps.position?.headingDeg ?? null;
  const vehicleHeadingHook = useVehicleHeading({
    enabled: !compassPowerSaveActive,
    gpsHeadingDeg: currentGpsHeadingDeg,
    initialMode: 'auto',
    speedMph: gps.position?.speedMph ?? null,
  });
  useEffect(() => {
    if (vehicleHeadingHook.heading != null) {
      lastKnownHeadingRef.current = vehicleHeadingHook.heading;
      return;
    }
    if (currentGpsHeadingDeg != null && currentGpsHeadingDeg >= 0) {
      lastKnownHeadingRef.current = currentGpsHeadingDeg;
    }
  }, [currentGpsHeadingDeg, vehicleHeadingHook.heading]);
  const compassDisplayHeading = useMemo(() => {
    if (vehicleHeadingHook.heading != null) return vehicleHeadingHook.heading;
    if (currentGpsHeadingDeg != null && currentGpsHeadingDeg >= 0) return currentGpsHeadingDeg;
    return lastKnownHeadingRef.current;
  }, [currentGpsHeadingDeg, vehicleHeadingHook.heading]);

  const campsiteDrawingId = useMemo(
    () => (campsiteDrawingPoints.length >= 3 ? createCampsiteDrawingId(campsiteDrawingPoints) : null),
    [campsiteDrawingPoints],
  );

  const [routeIntelligence, setRouteIntelligence] = useState<RouteIntelligence | null>(
    () => routeAnalysisEngine.getCurrent()
  );
  const [resourceForecast, setResourceForecast] = useState<ResourceForecast | null>(
    () => resourceForecastEngine.getCurrent()
  );
  const [terrainIntelligence, setTerrainIntelligence] = useState<TerrainIntelligence | null>(
    () => terrainAnalysisEngine.getCurrent()
  );
  const [expeditionForecast, setExpeditionForecast] = useState<ExpeditionForecast | null>(
    () => expeditionForecastEngine.getCurrent()
  );

  // Campsite intel state is populated only by route overview and completed polygon flows.
  const [campsiteCandidates, setCampsiteCandidates] = useState<CampsiteCandidateResult | null>(
    () => campsiteCandidateEngine.getCurrent()
  );
  const [remotenessIndex, setRemotenessIndex] = useState<RemotenessIndexOutput | null>(
    () => remotenessStore.getIndex()
  );
  const [campIntelVisible, setCampIntelVisible] = useState(true);
  const [campsiteLayerVisibility, setCampsiteLayerVisibility] = useState<
    Record<CampsiteVisibilityLayerScope, boolean>
  >(() => ({ ...DEFAULT_CAMPSITE_LAYER_VISIBILITY }));
  const dispersedCampingEligibilityLayerAvailable = useMemo(
    () => isDispersedCampingEligibilityLayerAvailable(),
    [],
  );
  const establishedCampsitesLayerAvailable = useMemo(
    () => isEstablishedCampsitesLayerAvailable(),
    [],
  );
  const [
    dispersedCampingRegions,
    setDispersedCampingRegions,
  ] = useState<DispersedCampingRegion[]>([]);
  const [
    dispersedCampingUiState,
    setDispersedCampingUiState,
  ] = useState<CampLayerUiState>(() => createCampLayerUiState(false));
  const dispersedCampingEligibilityEnabled = dispersedCampingUiState.enabled;
  const dispersedCampingStatus = dispersedCampingUiState.status;
  const dispersedCampingError = dispersedCampingUiState.errorMessage ?? null;
  const dispersedCampingEligibilityZoomReady = isCampLayerZoomEligible('dispersed_camping', mapZoom);
  const dispersedCampingZoomPrompt = getCampLayerZoomPrompt('dispersed_camping');
  const dispersedCampingCacheRef = useRef<
    Map<string, { expiresAt: number; regions: DispersedCampingRegion[] }>
  >(new Map());
  const dispersedCampingFetchCoordinatorRef = useRef(new CampLayerFetchCoordinator());
  const dispersedCampingFetchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dispersedCampingFailedCacheKeysRef = useRef<Set<string>>(new Set());
  const dispersedCampingRetryBboxRef = useRef<TileBounds | null>(null);
  const [dispersedCampingRetryNonce, setDispersedCampingRetryNonce] = useState(0);
  const [
    establishedCampgrounds,
    setEstablishedCampgrounds,
  ] = useState<EstablishedCampsite[]>([]);
  const [
    establishedCampgroundsUiState,
    setEstablishedCampgroundsUiState,
  ] = useState<CampLayerUiState>(() => createCampLayerUiState(false));
  const establishedCampsitesEnabled = establishedCampgroundsUiState.enabled;
  const establishedCampgroundsStatus = establishedCampgroundsUiState.status;
  const establishedCampgroundsError = establishedCampgroundsUiState.errorMessage ?? null;
  const establishedCampsitesZoomReady = isCampLayerZoomEligible('established_campgrounds', mapZoom);
  const establishedCampsitesZoomPrompt = getCampLayerZoomPrompt('established_campgrounds');
  const establishedCampgroundsCacheRef = useRef<
    Map<string, { expiresAt: number; campsites: EstablishedCampsite[] }>
  >(new Map());
  const establishedCampgroundsFetchCoordinatorRef = useRef(new CampLayerFetchCoordinator());
  const establishedCampgroundsFetchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const establishedCampgroundsFailedCacheKeysRef = useRef<Set<string>>(new Set());
  const establishedCampgroundsRetryBboxRef = useRef<TileBounds | null>(null);
  const [establishedCampgroundsRetryNonce, setEstablishedCampgroundsRetryNonce] = useState(0);
  const campsiteLayerVisibilityTouchedRef = useRef(false);
  useEffect(() => {
    let cancelled = false;

    (async () => {
      const persisted = await readPersistedCampsiteLayerVisibility();
      if (cancelled || !persisted || campsiteLayerVisibilityTouchedRef.current) return;
      setCampsiteLayerVisibility(persisted);
    })();

    return () => {
      cancelled = true;
    };
  }, []);
  const [selectedCampIntelId, setSelectedCampIntelId] = useState<string | null>(null);
  const [selectedCampScoutCandidateId, setSelectedCampScoutCandidateId] = useState<string | null>(null);
  const [selectedCampOpsEndpointId, setSelectedCampOpsEndpointId] = useState<string | null>(null);
  const [
    selectedDispersedCampingRegion,
    setSelectedDispersedCampingRegion,
  ] = useState<DispersedCampingRegionSelectionPayload | null>(null);
  const [
    selectedEstablishedCampsite,
    setSelectedEstablishedCampsite,
  ] = useState<EstablishedCampsite | null>(null);
  const establishedCampgroundDetailCacheRef = useRef<Map<string, EstablishedCampsite>>(new Map());
  const campLayerFetchOnline =
    isOnline &&
    (!navigateConnectivity.initialized ||
      (navigateConnectivity.status === 'online' && navigateConnectivity.isInternetReachable));

  useEffect(() => {
    if (!selectedEstablishedCampsite) return;
    if (!campLayerFetchOnline) return;
    if (selectedEstablishedCampsite.liveDetailFetchedAt) return;

    const selectedId = selectedEstablishedCampsite.id;
    const cached = establishedCampgroundDetailCacheRef.current.get(selectedId);
    if (cached) {
      setSelectedEstablishedCampsite((current) =>
        current?.id === selectedId
          ? {
              ...current,
              ...cached,
              nearbyCampgroundCount: current.nearbyCampgroundCount ?? cached.nearbyCampgroundCount,
              nearbyCampgroundIds: current.nearbyCampgroundIds ?? cached.nearbyCampgroundIds,
              nearbyCampgroundNames: current.nearbyCampgroundNames ?? cached.nearbyCampgroundNames,
            }
          : current,
      );
      return;
    }

    let cancelled = false;
    void fetchEstablishedCampgroundDetail({ id: selectedId }).then((response) => {
      if (cancelled || !response.ok || !response.campsite) return;
      establishedCampgroundDetailCacheRef.current.set(selectedId, response.campsite);
      setSelectedEstablishedCampsite((current) =>
        current?.id === selectedId
          ? {
              ...current,
              ...response.campsite,
              nearbyCampgroundCount: current.nearbyCampgroundCount ?? response.campsite?.nearbyCampgroundCount,
              nearbyCampgroundIds: current.nearbyCampgroundIds ?? response.campsite?.nearbyCampgroundIds,
              nearbyCampgroundNames: current.nearbyCampgroundNames ?? response.campsite?.nearbyCampgroundNames,
            }
          : current,
      );
    });

    return () => {
      cancelled = true;
    };
  }, [campLayerFetchOnline, selectedEstablishedCampsite]);

  useEffect(() => () => {
    if (dispersedCampingFetchTimerRef.current) {
      clearTimeout(dispersedCampingFetchTimerRef.current);
      dispersedCampingFetchTimerRef.current = null;
    }
    if (establishedCampgroundsFetchTimerRef.current) {
      clearTimeout(establishedCampgroundsFetchTimerRef.current);
      establishedCampgroundsFetchTimerRef.current = null;
    }
    dispersedCampingFetchCoordinatorRef.current.cancel();
    establishedCampgroundsFetchCoordinatorRef.current.cancel();
  }, []);

  useEffect(() => {
    if (
      !dispersedCampingEligibilityEnabled ||
      !dispersedCampingEligibilityLayerAvailable ||
      !dispersedCampingEligibilityZoomReady
    ) {
      return;
    }
    if (!mapBounds) {
      logCampLayerDebug('bounds_request', {
        layer: 'dispersed_camping',
        reason: 'enabled_without_viewport',
      });
      setDispersedCampingUiState(setCampLayerLoading);
      setRequestBoundsTrigger((prev) => prev + 1);
    }
  }, [
    dispersedCampingEligibilityEnabled,
    dispersedCampingEligibilityLayerAvailable,
    dispersedCampingEligibilityZoomReady,
    mapBounds,
  ]);

  useEffect(() => {
    const layerAvailable = dispersedCampingEligibilityEnabled && dispersedCampingEligibilityLayerAvailable;
    if (!layerAvailable) {
      dispersedCampingFetchCoordinatorRef.current.cancel();
      if (dispersedCampingFetchTimerRef.current) {
        clearTimeout(dispersedCampingFetchTimerRef.current);
        dispersedCampingFetchTimerRef.current = null;
      }
      setDispersedCampingRegions([]);
      setSelectedDispersedCampingRegion(null);
      setDispersedCampingUiState((current) =>
        current.enabled ? setCampLayerEnabled(current, false) : current,
      );
      return;
    }
    if (!dispersedCampingEligibilityZoomReady) {
      dispersedCampingFetchCoordinatorRef.current.cancel();
      if (dispersedCampingFetchTimerRef.current) {
        clearTimeout(dispersedCampingFetchTimerRef.current);
        dispersedCampingFetchTimerRef.current = null;
      }
      logCampLayerDebug('frontend_fetch_skipped', {
        layer: 'dispersed_camping',
        bbox: sanitizeCampLayerBbox(mapBounds),
        reason: 'zoom_too_low',
        zoom: mapZoom,
        message: dispersedCampingZoomPrompt,
      });
      setDispersedCampingUiState(setCampLayerZoomDeferred);
      return;
    }

    const planBbox = dispersedCampingRetryBboxRef.current ?? mapBounds;
    dispersedCampingRetryBboxRef.current = null;
    const plan = dispersedCampingFetchCoordinatorRef.current.plan({
      layer: 'dispersed_camping',
      bbox: planBbox,
      enabled: layerAvailable,
      online: campLayerFetchOnline,
      now: Date.now(),
    });
    if (plan.type === 'skip') {
      if (plan.reason === 'offline' || plan.reason === 'invalid_bbox' || plan.reason === 'bbox_too_small') {
        logCampLayerDebug('frontend_fetch_skipped', {
          layer: 'dispersed_camping',
          bbox: sanitizeCampLayerBbox(planBbox),
          reason: plan.reason,
          cacheKey: plan.cacheKey ?? null,
        });
        if (plan.reason === 'offline') {
          const lookup = resolveCampLayerOfflineCacheLookup('dispersed_camping', planBbox);
          if (lookup) {
            let cancelled = false;
            void readDispersedCampingOfflineCache(lookup.cacheKey).then((cached) => {
              if (cancelled) return;
              if (!cached) {
                setDispersedCampingUiState(setCampLayerFetchSkipped);
                return;
              }
              logCampLayerDebug('frontend_offline_cache_hit', {
                layer: 'dispersed_camping',
                bbox: sanitizeCampLayerBbox(lookup.bbox),
                cacheKey: lookup.cacheKey,
                regionCount: cached.regions.length,
                cachedAt: cached.cachedAt,
              });
              dispersedCampingCacheRef.current.set(lookup.cacheKey, {
                expiresAt: Date.now() + DISPERSED_CAMPING_CACHE_TTL_MS,
                regions: cached.regions,
              });
              setDispersedCampingRegions(cached.regions);
              setDispersedCampingUiState((current) =>
                setCampLayerFetchSucceeded(current, {
                  bbox: lookup.bbox,
                  cacheKey: lookup.cacheKey,
                  featureCount: cached.regions.length,
                }),
              );
            });
            return () => {
              cancelled = true;
            };
          }
        }
        setDispersedCampingUiState(setCampLayerFetchSkipped);
      }
      return;
    }

    const cached = dispersedCampingCacheRef.current.get(plan.cacheKey);
    const retryingFailedCacheKey = dispersedCampingFailedCacheKeysRef.current.has(plan.cacheKey);
    const now = Date.now();
    if (cached && cached.expiresAt > now && !retryingFailedCacheKey) {
      dispersedCampingFetchCoordinatorRef.current.cancel();
      logCampLayerDebug('frontend_cache_hit', {
        layer: 'dispersed_camping',
        bbox: sanitizeCampLayerBbox(plan.bbox),
        cacheKey: plan.cacheKey,
        regionCount: cached.regions.length,
      });
      setDispersedCampingRegions(cached.regions);
      setDispersedCampingUiState((current) =>
        setCampLayerFetchSucceeded(current, {
          bbox: plan.bbox,
          cacheKey: plan.cacheKey,
          featureCount: cached.regions.length,
        }),
      );
      return;
    }

    if (dispersedCampingFetchTimerRef.current) {
      clearTimeout(dispersedCampingFetchTimerRef.current);
      dispersedCampingFetchTimerRef.current = null;
    }
    setDispersedCampingUiState((current) =>
      setCampLayerLoading(current, {
        bbox: plan.bbox,
        cacheKey: plan.cacheKey,
      }),
    );
    logCampLayerDebug('frontend_fetch_scheduled', {
      layer: 'dispersed_camping',
      bbox: sanitizeCampLayerBbox(plan.bbox),
      cacheKey: plan.cacheKey,
      debounceMs: Math.max(0, plan.dueAt - now),
    });

    dispersedCampingFetchTimerRef.current = setTimeout(() => {
      dispersedCampingFetchTimerRef.current = null;
      const request = dispersedCampingFetchCoordinatorRef.current.consumeDue('dispersed_camping', Date.now());
      if (!request) return;

      const freshCached = dispersedCampingCacheRef.current.get(request.cacheKey);
      if (
        freshCached &&
        freshCached.expiresAt > Date.now() &&
        !dispersedCampingFailedCacheKeysRef.current.has(request.cacheKey)
      ) {
        dispersedCampingFetchCoordinatorRef.current.complete(request);
        setDispersedCampingRegions(freshCached.regions);
        setDispersedCampingUiState((current) =>
          setCampLayerFetchSucceeded(current, {
            bbox: request.bbox,
            cacheKey: request.cacheKey,
            featureCount: freshCached.regions.length,
          }),
        );
        return;
      }

      logCampLayerDebug('frontend_fetch_start', {
        layer: 'dispersed_camping',
        bbox: sanitizeCampLayerBbox(request.bbox),
        cacheKey: request.cacheKey,
        requestId: request.requestId,
      });

      fetchDispersedCampingEligibilityForMap({ bbox: request.bbox })
      .then((response) => {
        if (!dispersedCampingFetchCoordinatorRef.current.isCurrent(request)) {
          logCampLayerDebug('frontend_fetch_stale_ignored', {
            layer: 'dispersed_camping',
            bbox: sanitizeCampLayerBbox(request.bbox),
            cacheKey: request.cacheKey,
            requestId: request.requestId,
          });
          return;
        }
        if (!response.ok) {
          if (!dispersedCampingFetchCoordinatorRef.current.complete(request)) return;
          logCampLayerDebug('frontend_fetch_error', {
            layer: 'dispersed_camping',
            bbox: sanitizeCampLayerBbox(request.bbox),
            cacheKey: request.cacheKey,
            requestId: request.requestId,
            error: response.error || 'unknown_error',
          });
          dispersedCampingFailedCacheKeysRef.current.add(request.cacheKey);
          setDispersedCampingUiState((current) =>
            setCampLayerFetchFailed(
              current,
              response.error || 'Dispersed camping eligibility unavailable.',
              {
                bbox: request.bbox,
                cacheKey: request.cacheKey,
                diagnostic: response.diagnostic,
              },
            ),
          );
          return;
        }

        const regions = Array.isArray(response.regions) ? response.regions : [];
        const geojsonFeatureCount = countGeoJsonFeatures(response.geojson);
        if (!dispersedCampingFetchCoordinatorRef.current.complete(request)) return;
        logCampLayerDebug(regions.length > 0 || geojsonFeatureCount > 0 ? 'frontend_fetch_success' : 'frontend_fetch_empty', {
          layer: 'dispersed_camping',
          bbox: sanitizeCampLayerBbox(request.bbox),
          cacheKey: request.cacheKey,
          requestId: request.requestId,
          regionCount: regions.length,
          geojsonFeatureCount,
          responseCount: response.count ?? null,
          source: response.meta?.source ?? null,
          truncated: response.meta?.truncated ?? null,
          emptyReason: regions.length > 0 || geojsonFeatureCount > 0
            ? null
            : 'backend_returned_no_eligible_regions_or_parser_filtered_all_features',
        });
        dispersedCampingCacheRef.current.set(request.cacheKey, {
          expiresAt: Date.now() + DISPERSED_CAMPING_CACHE_TTL_MS,
          regions,
        });
        writeDispersedCampingOfflineCache({
          lookup: {
            layer: 'dispersed_camping',
            bbox: request.bbox,
            cacheKey: request.cacheKey,
          },
          regions,
        });
        dispersedCampingFailedCacheKeysRef.current.delete(request.cacheKey);
        setDispersedCampingRegions(regions);
        setDispersedCampingUiState((current) =>
          setCampLayerFetchSucceeded(current, {
            bbox: request.bbox,
            cacheKey: request.cacheKey,
            featureCount: regions.length,
          }),
        );
      })
      .catch((error) => {
        if (!dispersedCampingFetchCoordinatorRef.current.complete(request)) {
          logCampLayerDebug('frontend_fetch_stale_ignored', {
            layer: 'dispersed_camping',
            bbox: sanitizeCampLayerBbox(request.bbox),
            cacheKey: request.cacheKey,
            requestId: request.requestId,
            error: error instanceof Error ? error.message : String(error),
          });
          return;
        }
        logCampLayerDebug('frontend_fetch_exception', {
          layer: 'dispersed_camping',
          bbox: sanitizeCampLayerBbox(request.bbox),
          cacheKey: request.cacheKey,
          requestId: request.requestId,
          error: error instanceof Error ? error.message : String(error),
        });
        dispersedCampingFailedCacheKeysRef.current.add(request.cacheKey);
        setDispersedCampingUiState((current) =>
          setCampLayerFetchFailed(
            current,
            error instanceof Error ? error.message : 'Dispersed camping eligibility unavailable.',
            {
              bbox: request.bbox,
              cacheKey: request.cacheKey,
              diagnostic: {
                layer: 'dispersed_camping',
                endpoint: DISPERSED_CAMPING_EDGE_FUNCTION,
                method: 'POST',
                status: null,
                statusText: null,
                errorName: error instanceof Error ? error.name : null,
                errorCode: null,
                errorMessage: error instanceof Error ? error.message : String(error),
              },
            },
          ),
        );
      });
    }, Math.max(0, plan.dueAt - now));

  }, [
    campLayerFetchOnline,
    dispersedCampingEligibilityEnabled,
    dispersedCampingEligibilityLayerAvailable,
    dispersedCampingEligibilityZoomReady,
    dispersedCampingRetryNonce,
    dispersedCampingZoomPrompt,
    mapBounds,
    mapZoom,
  ]);

  useEffect(() => {
    if (
      !establishedCampsitesEnabled ||
      !establishedCampsitesLayerAvailable ||
      !establishedCampsitesZoomReady
    ) {
      return;
    }
    if (!mapBounds) {
      logCampLayerDebug('bounds_request', {
        layer: 'established_campgrounds',
        reason: 'enabled_without_viewport',
      });
      setEstablishedCampgroundsUiState(setCampLayerLoading);
      setRequestBoundsTrigger((prev) => prev + 1);
    }
  }, [
    establishedCampsitesEnabled,
    establishedCampsitesLayerAvailable,
    establishedCampsitesZoomReady,
    mapBounds,
  ]);

  useEffect(() => {
    const layerAvailable = establishedCampsitesEnabled && establishedCampsitesLayerAvailable;
    if (!layerAvailable) {
      establishedCampgroundsFetchCoordinatorRef.current.cancel();
      if (establishedCampgroundsFetchTimerRef.current) {
        clearTimeout(establishedCampgroundsFetchTimerRef.current);
        establishedCampgroundsFetchTimerRef.current = null;
      }
      setEstablishedCampgroundsUiState((current) =>
        current.enabled ? setCampLayerEnabled(current, false) : current,
      );
      return;
    }
    if (!establishedCampsitesZoomReady) {
      establishedCampgroundsFetchCoordinatorRef.current.cancel();
      if (establishedCampgroundsFetchTimerRef.current) {
        clearTimeout(establishedCampgroundsFetchTimerRef.current);
        establishedCampgroundsFetchTimerRef.current = null;
      }
      logCampLayerDebug('frontend_fetch_skipped', {
        layer: 'established_campgrounds',
        bbox: sanitizeCampLayerBbox(mapBounds),
        reason: 'zoom_too_low',
        zoom: mapZoom,
        message: establishedCampsitesZoomPrompt,
      });
      setEstablishedCampgroundsUiState(setCampLayerZoomDeferred);
      return;
    }

    const planBbox = establishedCampgroundsRetryBboxRef.current ?? mapBounds;
    establishedCampgroundsRetryBboxRef.current = null;
    const plan = establishedCampgroundsFetchCoordinatorRef.current.plan({
      layer: 'established_campgrounds',
      bbox: planBbox,
      enabled: layerAvailable,
      online: campLayerFetchOnline,
      now: Date.now(),
    });
    if (plan.type === 'skip') {
      if (plan.reason === 'offline' || plan.reason === 'invalid_bbox' || plan.reason === 'bbox_too_small') {
        logCampLayerDebug('frontend_fetch_skipped', {
          layer: 'established_campgrounds',
          bbox: sanitizeCampLayerBbox(planBbox),
          reason: plan.reason,
          cacheKey: plan.cacheKey ?? null,
        });
        if (plan.reason === 'offline') {
          const lookup = resolveCampLayerOfflineCacheLookup('established_campgrounds', planBbox);
          if (lookup) {
            let cancelled = false;
            void readEstablishedCampgroundsOfflineCache(lookup.cacheKey).then((cached) => {
              if (cancelled) return;
              if (!cached) {
                setEstablishedCampgroundsUiState(setCampLayerFetchSkipped);
                return;
              }
              logCampLayerDebug('frontend_offline_cache_hit', {
                layer: 'established_campgrounds',
                bbox: sanitizeCampLayerBbox(lookup.bbox),
                cacheKey: lookup.cacheKey,
                campsiteCount: cached.campsites.length,
                cachedAt: cached.cachedAt,
              });
              establishedCampgroundsCacheRef.current.set(lookup.cacheKey, {
                expiresAt: Date.now() + ESTABLISHED_CAMPGROUNDS_CACHE_TTL_MS,
                campsites: cached.campsites,
              });
              setEstablishedCampgrounds(cached.campsites);
              setEstablishedCampgroundsUiState((current) =>
                setCampLayerFetchSucceeded(current, {
                  bbox: lookup.bbox,
                  cacheKey: lookup.cacheKey,
                  featureCount: cached.campsites.length,
                }),
              );
            });
            return () => {
              cancelled = true;
            };
          }
        }
        setEstablishedCampgroundsUiState(setCampLayerFetchSkipped);
      }
      return;
    }

    const cached = establishedCampgroundsCacheRef.current.get(plan.cacheKey);
    const retryingFailedCacheKey = establishedCampgroundsFailedCacheKeysRef.current.has(plan.cacheKey);
    const now = Date.now();
    if (cached && cached.expiresAt > now && !retryingFailedCacheKey) {
      establishedCampgroundsFetchCoordinatorRef.current.cancel();
      logCampLayerDebug('frontend_cache_hit', {
        layer: 'established_campgrounds',
        bbox: sanitizeCampLayerBbox(plan.bbox),
        cacheKey: plan.cacheKey,
        campsiteCount: cached.campsites.length,
      });
      setEstablishedCampgrounds(cached.campsites);
      setEstablishedCampgroundsUiState((current) =>
        setCampLayerFetchSucceeded(current, {
          bbox: plan.bbox,
          cacheKey: plan.cacheKey,
          featureCount: cached.campsites.length,
        }),
      );
      return;
    }

    if (establishedCampgroundsFetchTimerRef.current) {
      clearTimeout(establishedCampgroundsFetchTimerRef.current);
      establishedCampgroundsFetchTimerRef.current = null;
    }
    setEstablishedCampgroundsUiState((current) =>
      setCampLayerLoading(current, {
        bbox: plan.bbox,
        cacheKey: plan.cacheKey,
      }),
    );
    logCampLayerDebug('frontend_fetch_scheduled', {
      layer: 'established_campgrounds',
      bbox: sanitizeCampLayerBbox(plan.bbox),
      cacheKey: plan.cacheKey,
      debounceMs: Math.max(0, plan.dueAt - now),
    });

    establishedCampgroundsFetchTimerRef.current = setTimeout(() => {
      establishedCampgroundsFetchTimerRef.current = null;
      const request = establishedCampgroundsFetchCoordinatorRef.current.consumeDue('established_campgrounds', Date.now());
      if (!request) return;

      const freshCached = establishedCampgroundsCacheRef.current.get(request.cacheKey);
      if (
        freshCached &&
        freshCached.expiresAt > Date.now() &&
        !establishedCampgroundsFailedCacheKeysRef.current.has(request.cacheKey)
      ) {
        establishedCampgroundsFetchCoordinatorRef.current.complete(request);
        setEstablishedCampgrounds(freshCached.campsites);
        setEstablishedCampgroundsUiState((current) =>
          setCampLayerFetchSucceeded(current, {
            bbox: request.bbox,
            cacheKey: request.cacheKey,
            featureCount: freshCached.campsites.length,
          }),
        );
        return;
      }

      logCampLayerDebug('frontend_fetch_start', {
        layer: 'established_campgrounds',
        bbox: sanitizeCampLayerBbox(request.bbox),
        cacheKey: request.cacheKey,
        requestId: request.requestId,
      });

      fetchEstablishedCampgroundsForMap({ bbox: request.bbox, logFailures: false })
      .then(async (response) => {
        if (!establishedCampgroundsFetchCoordinatorRef.current.isCurrent(request)) {
          logCampLayerDebug('frontend_fetch_stale_ignored', {
            layer: 'established_campgrounds',
            bbox: sanitizeCampLayerBbox(request.bbox),
            cacheKey: request.cacheKey,
            requestId: request.requestId,
          });
          return;
        }
        if (!response.ok) {
          const cachedFallback = await readEstablishedCampgroundsOfflineCache(request.cacheKey).catch(() => null);
          if (
            cachedFallback &&
            establishedCampgroundsFetchCoordinatorRef.current.isCurrent(request)
          ) {
            if (!establishedCampgroundsFetchCoordinatorRef.current.complete(request)) return;
            logCampLayerDebug('frontend_online_failure_cache_hit', {
              layer: 'established_campgrounds',
              bbox: sanitizeCampLayerBbox(request.bbox),
              cacheKey: request.cacheKey,
              requestId: request.requestId,
              campsiteCount: cachedFallback.campsites.length,
              cachedAt: cachedFallback.cachedAt,
              error: response.error || 'unknown_error',
              status: response.diagnostic?.status ?? null,
            });
            establishedCampgroundsCacheRef.current.set(request.cacheKey, {
              expiresAt: Date.now() + ESTABLISHED_CAMPGROUNDS_CACHE_TTL_MS,
              campsites: cachedFallback.campsites,
            });
            establishedCampgroundsFailedCacheKeysRef.current.delete(request.cacheKey);
            setEstablishedCampgrounds(cachedFallback.campsites);
            setEstablishedCampgroundsUiState((current) =>
              setCampLayerFetchSucceeded(current, {
                bbox: request.bbox,
                cacheKey: request.cacheKey,
                featureCount: cachedFallback.campsites.length,
              }),
            );
            return;
          }

          if (!establishedCampgroundsFetchCoordinatorRef.current.complete(request)) return;
          logCampLayerDebug('frontend_fetch_error', {
            layer: 'established_campgrounds',
            bbox: sanitizeCampLayerBbox(request.bbox),
            cacheKey: request.cacheKey,
            requestId: request.requestId,
            error: response.error || 'unknown_error',
          });
          establishedCampgroundsFailedCacheKeysRef.current.add(request.cacheKey);
          setEstablishedCampgroundsUiState((current) =>
            setCampLayerFetchFailed(
              current,
              response.error || 'Established campground search unavailable.',
              {
                bbox: request.bbox,
                cacheKey: request.cacheKey,
                diagnostic: response.diagnostic,
              },
            ),
          );
          return;
        }

        const campsites = mapCampgroundSearchRecordsToEstablishedCampsites(response.records);
        const geojsonFeatureCount = countGeoJsonFeatures(response.geojson);
        if (!establishedCampgroundsFetchCoordinatorRef.current.complete(request)) return;
        logCampLayerDebug(campsites.length > 0 || geojsonFeatureCount > 0 ? 'frontend_fetch_success' : 'frontend_fetch_empty', {
          layer: 'established_campgrounds',
          bbox: sanitizeCampLayerBbox(request.bbox),
          cacheKey: request.cacheKey,
          requestId: request.requestId,
          campsiteCount: campsites.length,
          geojsonFeatureCount,
          responseCount: response.count ?? null,
          source: response.meta?.source ?? null,
          fallbackReason: response.meta?.fallbackReason ?? null,
          emptyReason: campsites.length > 0 || geojsonFeatureCount > 0
            ? null
            : 'backend_returned_no_campgrounds_or_parser_filtered_all_records',
        });
        establishedCampgroundsCacheRef.current.set(request.cacheKey, {
          expiresAt: Date.now() + ESTABLISHED_CAMPGROUNDS_CACHE_TTL_MS,
          campsites,
        });
        writeEstablishedCampgroundsOfflineCache({
          lookup: {
            layer: 'established_campgrounds',
            bbox: request.bbox,
            cacheKey: request.cacheKey,
          },
          campsites,
        });
        establishedCampgroundsFailedCacheKeysRef.current.delete(request.cacheKey);
        setEstablishedCampgrounds(campsites);
        setEstablishedCampgroundsUiState((current) =>
          setCampLayerFetchSucceeded(current, {
            bbox: request.bbox,
            cacheKey: request.cacheKey,
            featureCount: campsites.length,
          }),
        );
      })
      .catch((error) => {
        if (!establishedCampgroundsFetchCoordinatorRef.current.complete(request)) {
          logCampLayerDebug('frontend_fetch_stale_ignored', {
            layer: 'established_campgrounds',
            bbox: sanitizeCampLayerBbox(request.bbox),
            cacheKey: request.cacheKey,
            requestId: request.requestId,
            error: error instanceof Error ? error.message : String(error),
          });
          return;
        }
        logCampLayerDebug('frontend_fetch_exception', {
          layer: 'established_campgrounds',
          bbox: sanitizeCampLayerBbox(request.bbox),
          cacheKey: request.cacheKey,
          requestId: request.requestId,
          error: error instanceof Error ? error.message : String(error),
        });
        establishedCampgroundsFailedCacheKeysRef.current.add(request.cacheKey);
        setEstablishedCampgroundsUiState((current) =>
          setCampLayerFetchFailed(
            current,
            error instanceof Error ? error.message : 'Established campground search unavailable.',
            {
              bbox: request.bbox,
              cacheKey: request.cacheKey,
              diagnostic: {
                layer: 'established_campgrounds',
                endpoint: ESTABLISHED_CAMPGROUNDS_EDGE_FUNCTION,
                method: 'POST',
                status: null,
                statusText: null,
                errorName: error instanceof Error ? error.name : null,
                errorCode: null,
                errorMessage: error instanceof Error ? error.message : String(error),
              },
            },
          ),
        );
      });
    }, Math.max(0, plan.dueAt - now));

  }, [
    campLayerFetchOnline,
    establishedCampsitesEnabled,
    establishedCampsitesLayerAvailable,
    establishedCampsitesZoomPrompt,
    establishedCampsitesZoomReady,
    establishedCampgroundsRetryNonce,
    mapBounds,
    mapZoom,
  ]);

  const [
    dispersedCampingCampScoutCandidates,
    setDispersedCampingCampScoutCandidates,
  ] = useState<CampScoutCandidate[]>([]);
  const [
    dispersedCampingCampScoutStatus,
    setDispersedCampingCampScoutStatus,
  ] = useState<string | null>(null);
  const campOpsLocalReportsRef = useRef<Record<string, {
    id: string;
    candidateId: string;
    createdAt: string;
    reportType: 'unusable';
    source: 'local_placeholder';
  }>>({});
  const campOpsLocalUsedRef = useRef<Set<string>>(new Set());
  const [communityCampSites, setCommunityCampSites] = useState<PublicCampSite[]>([]);
  const [drawAreaCommunityCampSites, setDrawAreaCommunityCampSites] = useState<PublicCampSite[]>([]);
  const [routeCommunityCampSites, setRouteCommunityCampSites] = useState<PublicCampSite[]>([]);
  const [selectedCommunityCampSiteId, setSelectedCommunityCampSiteId] = useState<string | null>(null);
  const [privateCampsiteReports, setPrivateCampsiteReports] = useState<CampSiteReportResponse[]>([]);
  const [drawAreaPrivateCampsiteReports, setDrawAreaPrivateCampsiteReports] = useState<CampSiteReportResponse[]>([]);
  const [routePrivateCampsiteReports, setRoutePrivateCampsiteReports] = useState<CampSiteReportResponse[]>([]);
  const [pendingCampsiteReports, setPendingCampsiteReports] = useState<CampSiteReportResponse[]>([]);
  const [drawAreaPendingCampsiteReports, setDrawAreaPendingCampsiteReports] = useState<CampSiteReportResponse[]>([]);
  const [routePendingCampsiteReports, setRoutePendingCampsiteReports] = useState<CampSiteReportResponse[]>([]);
  const [reviewerPendingCampsiteReports, setReviewerPendingCampsiteReports] = useState<CampSiteReviewQueueItem[]>([]);
  const [drawAreaReviewerPendingCampsiteReports, setDrawAreaReviewerPendingCampsiteReports] = useState<CampSiteReviewQueueItem[]>([]);
  const [routeReviewerPendingCampsiteReports, setRouteReviewerPendingCampsiteReports] = useState<CampSiteReviewQueueItem[]>([]);
  const [groupCampsiteGroups, setGroupCampsiteGroups] = useState<CampSiteGroupListItem[]>([]);
  const [drawAreaGroupCampsiteGroups, setDrawAreaGroupCampsiteGroups] = useState<CampSiteGroupListItem[]>([]);
  const [routeGroupCampsiteGroups, setRouteGroupCampsiteGroups] = useState<CampSiteGroupListItem[]>([]);
  const [selectedGroupCampsiteGroupId, setSelectedGroupCampsiteGroupId] = useState<string | null>(null);
  const [groupCampsiteItems, setGroupCampsiteItems] = useState<GroupCampSiteItem[]>([]);
  const [drawAreaGroupCampsiteItems, setDrawAreaGroupCampsiteItems] = useState<GroupCampSiteItem[]>([]);
  const [routeGroupCampsiteItems, setRouteGroupCampsiteItems] = useState<GroupCampSiteItem[]>([]);
  const [selectedGroupCampsiteShareId, setSelectedGroupCampsiteShareId] = useState<string | null>(null);
  const [selectedScopedCampsite, setSelectedScopedCampsite] = useState<{
    scope: Extract<CampsiteVisibilityLayerScope, 'private' | 'pending' | 'reviewer_pending'>;
    reportId: string;
  } | null>(null);
  const [communityCampSitePhotosById, setCommunityCampSitePhotosById] = useState<
    Record<string, CampSitePhotoResponse[]>
  >({});
  const [campIntelComparisonVisible, setCampIntelComparisonVisible] = useState(false);
  const campIntelActionLocksRef = useRef<Set<string>>(new Set());
  const communityCampsiteBoundsSignatureRef = useRef<string | null>(null);
  const privateCampsiteBoundsSignatureRef = useRef<string | null>(null);
  const pendingCampsiteBoundsSignatureRef = useRef<string | null>(null);
  const reviewerPendingCampsiteBoundsSignatureRef = useRef<string | null>(null);
  const groupCampsiteBoundsSignatureRef = useRef<string | null>(null);
  const drawAreaCampsiteSourcesRequestRef = useRef<string | null>(null);
  const routeCampsiteSourcesRequestRef = useRef<string | null>(null);
  const communityCampsiteInitialBoundsRequestedRef = useRef(false);
  const previousCampIntelRouteContextRef = useRef<string | null>(null);
  const lastCampsiteInputRef = useRef<string>('');
  const campOpsRouteResultCacheRef = useRef(
    createCampOpsLifecycleCache<CampsiteCandidateResult>(CAMPOPS_ROUTE_RESULT_CACHE_LIMIT),
  );
  const campOpsRouteRequestRef = useRef<{ requestKey: string; requestToken: string } | null>(null);
  const [campOpsRouteLifecycle, setCampOpsRouteLifecycle] = useState<CampOpsLifecycleState>(
    IDLE_CAMPOPS_LIFECYCLE_STATE,
  );
  const lastRoutePolygonClearSignatureRef = useRef<string | null>(null);
  const pendingRouteCampsiteClearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastResourceForecastInputKeyRef = useRef<string | null>(null);

  const applyCampsiteCandidates = useCallback((next: CampsiteCandidateResult | null) => {
    logNavigateDev('[CAMPSITE_CANDIDATE] render count=', next?.suggestedCampsites.length ?? 0, {
      generationId: next?.viabilitySummary?.generationId ?? next?.id ?? null,
      source: next?.source ?? next?.analysisSource ?? 'none',
      routeIntelligenceId: next?.routeIntelligenceId ?? null,
      polygonId: next?.polygonId ?? null,
    });
    setCampsiteCandidates((prev) => (sameCampsiteCandidates(prev, next) ? prev : next));
  }, []);

  const clearOwnedCampsiteCandidates = useCallback((reason: string, options?: {
    activeRouteIntelligenceId?: string | null;
    activePolygonId?: string | null;
    clearRoute?: boolean;
    clearPolygon?: boolean;
  }) => {
    const current = campsiteCandidateEngine.getCurrent();
    if (!current) {
      if (options?.clearRoute) {
        campsiteCandidateEngine.clear(reason, {
          source: 'route',
          routeIntelligenceId: options.activeRouteIntelligenceId ?? null,
          polygonId: null,
        });
      } else if (options?.clearPolygon) {
        campsiteCandidateEngine.clear(reason, {
          source: 'polygon',
          routeIntelligenceId: options.activePolygonId ?? null,
          polygonId: options.activePolygonId ?? null,
        });
      }
      return;
    }

    const source = current.source ?? current.analysisSource ?? 'route';
    const routeOwnerMismatch =
      source === 'route' &&
      (
        options?.clearRoute === true ||
        (
          options?.activeRouteIntelligenceId != null &&
          current.routeIntelligenceId !== options.activeRouteIntelligenceId
        )
      );
    const polygonOwnerMismatch =
      source === 'polygon' &&
      (
        options?.clearPolygon === true ||
        (
          options?.activePolygonId != null &&
          current.polygonId !== options.activePolygonId
        )
      );

    if (routeOwnerMismatch || polygonOwnerMismatch) {
      campsiteCandidateEngine.clear(reason, {
        source,
        routeIntelligenceId: current.routeIntelligenceId,
        polygonId: current.polygonId,
      });
      setSelectedCampIntelId(null);
      setSelectedCampOpsEndpointId(null);
      applyCampsiteCandidates(null);
    }
  }, [applyCampsiteCandidates]);

  const cancelPendingRouteCampsiteClear = useCallback(() => {
    if (pendingRouteCampsiteClearTimerRef.current) {
      clearTimeout(pendingRouteCampsiteClearTimerRef.current);
      pendingRouteCampsiteClearTimerRef.current = null;
    }
  }, []);

  const scheduleRouteCampsiteClear = useCallback((reason: string, options?: {
    activeRouteIntelligenceId?: string | null;
    activePolygonId?: string | null;
  }) => {
    cancelPendingRouteCampsiteClear();
    pendingRouteCampsiteClearTimerRef.current = setTimeout(() => {
      pendingRouteCampsiteClearTimerRef.current = null;
      clearOwnedCampsiteCandidates(reason, {
        ...options,
        clearRoute: true,
        clearPolygon: false,
      });
    }, 900);
  }, [cancelPendingRouteCampsiteClear, clearOwnedCampsiteCandidates]);

  const applyRemotenessIndex = useCallback((next: RemotenessIndexOutput | null) => {
    setRemotenessIndex((prev) => (sameRemotenessIndex(prev, next) ? prev : next));
  }, []);

  const weatherAlerts = useWeatherAlerts(userLocation, showToast);
  const routeCorridorWeather = useRouteCorridorWeather(activeRun, userLocation, showToast);
  const campIntelWeatherSnapshot = useMemo<CampIntelRouteWeatherSnapshot | null>(() => {
    const activePoint = routeCorridorWeather.summary.activePoint;
    const current = activePoint?.weather?.current;
    const precipChance = activePoint?.weather?.forecast?.[0]?.pop;
    const precipType = (current?.snow_1h ?? current?.snow_3h ?? 0) > 0 ? 'Snow' : 'Rain';

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
  const selectedCampIntelSearchContext = useMemo<'route' | 'draw_area' | null>(() => {
    if (!selectedCampIntel || !campsiteCandidates) return null;
    if (
      campsiteCandidates.analysisSource === 'polygon' &&
      campScoutAreaMode === 'results' &&
      (selectedCampIntel.sourceRouteId === campsiteCandidates.routeIntelligenceId ||
        selectedCampIntel.sourceRouteId === campsiteCandidates.polygonId)
    ) {
      return 'draw_area';
    }
    if ((campsiteCandidates.source ?? campsiteCandidates.analysisSource) === 'route') {
      return 'route';
    }
    return selectedCampIntel.sourceRouteId ? 'route' : null;
  }, [campScoutAreaMode, campsiteCandidates, selectedCampIntel]);
  const campIntelRouteContextSignature = `${routeIntelligence?.id ?? campsiteCandidates?.routeIntelligenceId ?? 'none'}:${campIntel.summary.missionMode ?? 'auto'}`;
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
  const displayedCampIntelMarkers = useMemo(() => {
    if (
      (campsiteCandidates?.source ?? campsiteCandidates?.analysisSource) === 'polygon' &&
      campScoutAreaMode !== 'results'
    ) {
      return [];
    }

    return campIntelMarkers;
  }, [campIntelMarkers, campScoutAreaMode, campsiteCandidates]);
  const selectedCampIntelRank = useMemo(
    () => campIntelMarkers.find((marker) => marker.id === selectedCampIntelId)?.rank ?? null,
    [campIntelMarkers, selectedCampIntelId],
  );
  const selectedDroppedPin = useMemo(
    () => allPins.find((pin) => pin.id === selectedDroppedPinId) ?? null,
    [allPins, selectedDroppedPinId],
  );
  const selectedCommunityCampSite = useMemo(
    () =>
      communityCampSites.find((site) => site.id === selectedCommunityCampSiteId) ??
      drawAreaCommunityCampSites.find((site) => site.id === selectedCommunityCampSiteId) ??
      routeCommunityCampSites.find((site) => site.id === selectedCommunityCampSiteId) ??
      null,
    [communityCampSites, drawAreaCommunityCampSites, routeCommunityCampSites, selectedCommunityCampSiteId],
  );
  const selectedScopedCampsiteReport = useMemo(() => {
    if (!selectedScopedCampsite) return null;
    if (selectedScopedCampsite.scope === 'private') {
      return (
        privateCampsiteReports.find((report) => report.id === selectedScopedCampsite.reportId) ??
        drawAreaPrivateCampsiteReports.find((report) => report.id === selectedScopedCampsite.reportId) ??
        routePrivateCampsiteReports.find((report) => report.id === selectedScopedCampsite.reportId) ??
        null
      );
    }
    if (selectedScopedCampsite.scope === 'pending') {
      return (
        pendingCampsiteReports.find((report) => report.id === selectedScopedCampsite.reportId) ??
        drawAreaPendingCampsiteReports.find((report) => report.id === selectedScopedCampsite.reportId) ??
        routePendingCampsiteReports.find((report) => report.id === selectedScopedCampsite.reportId) ??
        null
      );
    }
    return (
      reviewerPendingCampsiteReports.find((report) => report.id === selectedScopedCampsite.reportId) ??
      drawAreaReviewerPendingCampsiteReports.find((report) => report.id === selectedScopedCampsite.reportId) ??
      routeReviewerPendingCampsiteReports.find((report) => report.id === selectedScopedCampsite.reportId) ??
      null
    );
  }, [
    drawAreaPendingCampsiteReports,
    drawAreaPrivateCampsiteReports,
    drawAreaReviewerPendingCampsiteReports,
    pendingCampsiteReports,
    privateCampsiteReports,
    routePendingCampsiteReports,
    routePrivateCampsiteReports,
    routeReviewerPendingCampsiteReports,
    reviewerPendingCampsiteReports,
    selectedScopedCampsite,
  ]);
  const selectedGroupCampsiteItem = useMemo(
    () =>
      groupCampsiteItems.find((item) => item.share.id === selectedGroupCampsiteShareId) ??
      drawAreaGroupCampsiteItems.find((item) => item.share.id === selectedGroupCampsiteShareId) ??
      routeGroupCampsiteItems.find((item) => item.share.id === selectedGroupCampsiteShareId) ??
      null,
    [drawAreaGroupCampsiteItems, groupCampsiteItems, routeGroupCampsiteItems, selectedGroupCampsiteShareId],
  );
  const selectedGroupCampsiteGroup = useMemo(
    () =>
      [...groupCampsiteGroups, ...drawAreaGroupCampsiteGroups, ...routeGroupCampsiteGroups].find(
        (item) => item.group.id === (selectedGroupCampsiteItem?.share.group_id ?? selectedGroupCampsiteGroupId),
      ) ?? null,
    [
      drawAreaGroupCampsiteGroups,
      groupCampsiteGroups,
      routeGroupCampsiteGroups,
      selectedGroupCampsiteGroupId,
      selectedGroupCampsiteItem,
    ],
  );
  const communityCampsiteMarkers = useMemo<CommunityCampsiteMarkerPayload[]>(
    () =>
      !campsiteLayerVisibility.community
        ? []
        :
      communityCampSites.map((site) =>
        toCommunityCampsiteMarkerPayload(site, selectedCommunityCampSiteId === site.id),
      ),
    [campsiteLayerVisibility.community, communityCampSites, selectedCommunityCampSiteId],
  );
  const privateCampsiteMarkers = useMemo<ScopedCampsiteMarkerPayload[]>(
    () =>
      !campsiteLayerVisibility.private
        ? []
        : privateCampsiteReports.map((report) =>
            toPrivateCampsiteMarkerPayload(
              report,
              selectedScopedCampsite?.scope === 'private' && selectedScopedCampsite.reportId === report.id,
            ),
          ),
    [campsiteLayerVisibility.private, privateCampsiteReports, selectedScopedCampsite],
  );
  const pendingCampsiteMarkers = useMemo<ScopedCampsiteMarkerPayload[]>(
    () =>
      !campsiteLayerVisibility.pending
        ? []
        : pendingCampsiteReports.map((report) =>
            toPendingCampsiteMarkerPayload(
              report,
              selectedScopedCampsite?.scope === 'pending' && selectedScopedCampsite.reportId === report.id,
            ),
          ),
    [campsiteLayerVisibility.pending, pendingCampsiteReports, selectedScopedCampsite],
  );
  const reviewerPendingCampsiteMarkers = useMemo<ScopedCampsiteMarkerPayload[]>(
    () =>
      !campsiteLayerVisibility.reviewer_pending
        ? []
        : reviewerPendingCampsiteReports.map((report) =>
            toReviewerPendingCampsiteMarkerPayload(
              report,
              selectedScopedCampsite?.scope === 'reviewer_pending' && selectedScopedCampsite.reportId === report.id,
            ),
          ),
    [campsiteLayerVisibility.reviewer_pending, reviewerPendingCampsiteReports, selectedScopedCampsite],
  );
  const groupCampsiteMarkers = useMemo<GroupCampsiteMarkerPayload[]>(
    () =>
      !campsiteLayerVisibility.group
        ? []
        : groupCampsiteItems.map((item) =>
            toGroupCampsiteMarkerPayload(item, selectedGroupCampsiteShareId === item.share.id),
          ),
    [campsiteLayerVisibility.group, groupCampsiteItems, selectedGroupCampsiteShareId],
  );
  const routeKnownCampsiteMarkers = useMemo<CampMapMarker[]>(() => {
    const communityMarkers = campsiteLayerVisibility.community
      ? routeCommunityCampSites.map((site) =>
          withCampsiteContextBadge(
            toDrawAreaCommunityCampsiteMarkerPayload(site, selectedCommunityCampSiteId === site.id),
            'ROUTE BUFFER',
          ),
        )
      : [];
    const privateMarkers = campsiteLayerVisibility.private
      ? routePrivateCampsiteReports.map((report) =>
          withCampsiteContextBadge(
            toPrivateCampsiteMarkerPayload(
              report,
              selectedScopedCampsite?.scope === 'private' && selectedScopedCampsite.reportId === report.id,
            ),
            'ROUTE BUFFER',
          ),
        )
      : [];
    const pendingMarkers = campsiteLayerVisibility.pending
      ? routePendingCampsiteReports.map((report) =>
          withCampsiteContextBadge(
            toPendingCampsiteMarkerPayload(
              report,
              selectedScopedCampsite?.scope === 'pending' && selectedScopedCampsite.reportId === report.id,
            ),
            'ROUTE BUFFER',
          ),
        )
      : [];
    const reviewerPendingMarkers = campsiteLayerVisibility.reviewer_pending
      ? routeReviewerPendingCampsiteReports.map((report) =>
          withCampsiteContextBadge(
            toReviewerPendingCampsiteMarkerPayload(
              report,
              selectedScopedCampsite?.scope === 'reviewer_pending' && selectedScopedCampsite.reportId === report.id,
            ),
            'ROUTE BUFFER',
          ),
        )
      : [];
    const groupMarkers = campsiteLayerVisibility.group
      ? routeGroupCampsiteItems.map((item) =>
          withCampsiteContextBadge(
            toGroupCampsiteMarkerPayload(item, selectedGroupCampsiteShareId === item.share.id),
            'ROUTE BUFFER',
          ),
        )
      : [];

    return mergeUniqueCampMarkers<CampMapMarker>([
      communityMarkers,
      privateMarkers,
      groupMarkers,
      pendingMarkers,
      reviewerPendingMarkers,
    ]);
  }, [
    campsiteLayerVisibility.community,
    campsiteLayerVisibility.group,
    campsiteLayerVisibility.pending,
    campsiteLayerVisibility.private,
    campsiteLayerVisibility.reviewer_pending,
    routeCommunityCampSites,
    routeGroupCampsiteItems,
    routePendingCampsiteReports,
    routePrivateCampsiteReports,
    routeReviewerPendingCampsiteReports,
    selectedCommunityCampSiteId,
    selectedGroupCampsiteShareId,
    selectedScopedCampsite,
  ]);
  const drawAreaKnownCampsiteMarkers = useMemo<CampMapMarker[]>(() => {
    // Camp Scout absorbs mapped/community sources into ranked candidate pins.
    return [];
  }, []);
  const exploreRouteCampMarkers = useMemo<CampMapMarker[]>(
    () => (exploreNavigationPayload?.campMarkers ?? []).map(toExploreRouteCampMapMarker),
    [exploreNavigationPayload?.campMarkers],
  );
  const combinedCampMarkers = useMemo(
    () =>
      mergeUniqueCampMarkers<CampMapMarker>([
        exploreRouteCampMarkers,
        campIntelVisible ? displayedCampIntelMarkers : [],
        routeKnownCampsiteMarkers,
        drawAreaKnownCampsiteMarkers,
        communityCampsiteMarkers,
        privateCampsiteMarkers,
        groupCampsiteMarkers,
        pendingCampsiteMarkers,
        reviewerPendingCampsiteMarkers,
      ]),
    [
      campIntelVisible,
      communityCampsiteMarkers,
      displayedCampIntelMarkers,
      drawAreaKnownCampsiteMarkers,
      exploreRouteCampMarkers,
      groupCampsiteMarkers,
      pendingCampsiteMarkers,
      privateCampsiteMarkers,
      reviewerPendingCampsiteMarkers,
      routeKnownCampsiteMarkers,
    ],
  );

  const activePolygonCampsiteSuggestions = useMemo<PolygonCampsiteSuggestion[]>(() => {
    if (
      campScoutAreaMode !== 'results' ||
      !campsiteDrawingId ||
      campsiteCandidates?.analysisSource !== 'polygon' ||
      campsiteCandidates.polygonId !== campsiteDrawingId
    ) {
      return [];
    }
    return campsiteCandidates.suggestedCampsites.slice(0, MAX_CAMPSITE_MARKERS);
  }, [campScoutAreaMode, campsiteCandidates, campsiteDrawingId]);

  const campScoutFilterOptions = useMemo<CampScoutFilterOptions>(() => {
    const officialOnly = campScoutFilterMode === 'official_only';
    return {
      filterMode: campScoutFilterMode,
      includeCommunitySuggestions: officialOnly ? false : campScoutIncludeCommunity,
      maximumCandidates: CAMP_SCOUT_DEFAULT_VISIBLE_PIN_LIMIT,
      minimumConfidenceScore: CAMP_SCOUT_MIN_DISPLAY_SCORE,
      minimumAccessConfidence: CAMP_SCOUT_MIN_ACCESS_CONFIDENCE,
      minimumLegalityConfidence: CAMP_SCOUT_MIN_LEGALITY_CONFIDENCE,
      minimumRemotenessScore: officialOnly ? undefined : CAMP_SCOUT_MIN_REMOTENESS_SCORE,
      maximumSlopeEstimate: CAMP_SCOUT_MAX_VIABLE_SLOPE_ESTIMATE,
      sourceTypes: officialOnly
        ? ['official_mapped']
        : campScoutIncludeCommunity
          ? ['ecs_inferred', 'official_mapped', 'community_suggested']
          : ['ecs_inferred', 'official_mapped'],
      includeUnknownSource: false,
    };
  }, [campScoutFilterMode, campScoutIncludeCommunity]);
  const campScoutLimitedDataMode = !isOnline;

  const campScoutCandidatePool = useMemo<CampScoutCandidate[]>(() => {
    if (campScoutAreaMode !== 'results') return [];

    const ecsInferredCandidates = activePolygonCampsiteSuggestions
      .map(toCampScoutCandidate)
      .filter((candidate) =>
        Number.isFinite(candidate.coordinate.latitude) &&
        Number.isFinite(candidate.coordinate.longitude),
      );
    const mappedCandidates = drawAreaCommunityCampSites
      .filter((site) => campsitePointInsidePolygon(site, campsiteDrawingPoints))
      .map(toMappedCampScoutCandidate)
      .filter((candidate) =>
        Number.isFinite(candidate.coordinate.latitude) &&
        Number.isFinite(candidate.coordinate.longitude),
      );

    return [...ecsInferredCandidates, ...mappedCandidates].map((candidate) => ({
      ...candidate,
      offlineEstimate: campScoutLimitedDataMode || candidate.offlineEstimate,
      mapDataCompleteness: campScoutLimitedDataMode
        ? Math.min(candidate.mapDataCompleteness ?? 70, 62)
        : candidate.mapDataCompleteness,
    }));
  }, [
    activePolygonCampsiteSuggestions,
    campScoutAreaMode,
    campScoutLimitedDataMode,
    campsiteDrawingPoints,
    drawAreaCommunityCampSites,
  ]);
  const campScoutPartialDataMode =
    !campScoutLimitedDataMode &&
    campScoutCandidatePool.some(
      (candidate) =>
        candidate.isMapDataStale ||
        (candidate.mapDataCompleteness ?? 100) < 70 ||
        candidate.sourceType === 'ecs_inferred',
    );

  const campScoutCandidatesShown = useMemo<CampScoutCandidate[]>(() => {
    if (campScoutAreaMode !== 'results') return [];
    const rankingContext = {
      preferredMinimumRoadDistanceMiles:
        campScoutFilterMode === 'remote' ? 0.35 : 0.05,
      preferredMaximumRoadDistanceMiles:
        campScoutFilterMode === 'easier_access' ? 1.4 : 2.5,
    };
    const strictRanked = rankCampScoutCandidates(campScoutCandidatePool, {
      ...campScoutFilterOptions,
      context: rankingContext,
    }).slice(0, CAMP_SCOUT_DEFAULT_VISIBLE_PIN_LIMIT);

    if (strictRanked.length > 0 || campScoutFilterMode === 'official_only') {
      return strictRanked;
    }

    const fallbackRanked = rankCampScoutCandidates(campScoutCandidatePool, {
      ...campScoutFilterOptions,
      expandedResults: true,
      expandedLimit: CAMP_SCOUT_DEFAULT_VISIBLE_PIN_LIMIT,
      allowLowConfidenceFallback: true,
      minimumConfidenceScore: CAMP_SCOUT_DRAW_AREA_FALLBACK_MIN_SCORE,
      minimumConfidenceGrade: undefined,
      minimumLegalityConfidence: CAMP_SCOUT_DRAW_AREA_FALLBACK_MIN_LEGALITY,
      minimumAccessConfidence: CAMP_SCOUT_DRAW_AREA_FALLBACK_MIN_ACCESS,
      minimumRemotenessScore: undefined,
      maximumSlopeEstimate: CAMP_SCOUT_DRAW_AREA_FALLBACK_MAX_SLOPE,
      context: rankingContext,
    }).slice(0, CAMP_SCOUT_DEFAULT_VISIBLE_PIN_LIMIT);

    if (fallbackRanked.length > 0) {
      logCampScoutDebug('soft_filter_fallback_used', {
        rawCandidateCount: campScoutCandidatePool.length,
        strictCandidateCount: strictRanked.length,
        fallbackCandidateCount: fallbackRanked.length,
        filterMode: campScoutFilterMode,
      });
    }

    return fallbackRanked;
  }, [campScoutAreaMode, campScoutCandidatePool, campScoutFilterMode, campScoutFilterOptions]);

  const campScoutRelaxedFallbackCandidates = useMemo<CampScoutCandidate[]>(() => {
    if (campScoutAreaMode !== 'results' || campScoutCandidatePool.length === 0) return [];
    const rankingContext = {
      preferredMinimumRoadDistanceMiles: 0.05,
      preferredMaximumRoadDistanceMiles: 2.5,
    };
    return rankCampScoutCandidates(campScoutCandidatePool, {
      filterMode: 'balanced',
      includeCommunitySuggestions: true,
      maximumCandidates: CAMP_SCOUT_DEFAULT_VISIBLE_PIN_LIMIT,
      sourceTypes: ['ecs_inferred', 'official_mapped', 'community_suggested'],
      includeUnknownSource: false,
      expandedResults: true,
      expandedLimit: CAMP_SCOUT_DEFAULT_VISIBLE_PIN_LIMIT,
      allowLowConfidenceFallback: true,
      minimumConfidenceScore: CAMP_SCOUT_DRAW_AREA_FALLBACK_MIN_SCORE,
      minimumConfidenceGrade: undefined,
      minimumLegalityConfidence: CAMP_SCOUT_DRAW_AREA_FALLBACK_MIN_LEGALITY,
      minimumAccessConfidence: CAMP_SCOUT_DRAW_AREA_FALLBACK_MIN_ACCESS,
      minimumRemotenessScore: undefined,
      maximumSlopeEstimate: CAMP_SCOUT_DRAW_AREA_FALLBACK_MAX_SLOPE,
      context: rankingContext,
    }).slice(0, CAMP_SCOUT_DEFAULT_VISIBLE_PIN_LIMIT);
  }, [campScoutAreaMode, campScoutCandidatePool]);

  const campScoutZeroResultSummary = useMemo<CampScoutZeroResultSummary>(() => {
    const officialCandidateCount = campScoutCandidatePool.filter(
      (candidate) => candidate.sourceType === 'official_mapped',
    ).length;
    const restrictedCandidateCount = campScoutCandidatePool.filter(
      (candidate) =>
        candidate.legalityStatus === 'restricted_or_not_allowed' ||
        candidate.isPrivateLand ||
        candidate.isProtectedArea ||
        candidate.isClosed ||
        candidate.noCamping,
    ).length;
    const rawCandidateCount =
      activePolygonCampsiteSuggestions.length +
      drawAreaCommunityCampSites.length +
      drawAreaPrivateCampsiteReports.length;

    return describeCampScoutZeroResult({
      activeFilterPreset: campScoutFilterMode,
      rawCandidateCount,
      visibleCandidateCount: campScoutCandidatesShown.length,
      renderedFeatureCount: campScoutCandidatesShown.length,
      officialCandidateCount,
      nonOfficialCandidateCount: Math.max(0, campScoutCandidatePool.length - officialCandidateCount),
      restrictedKnownCount: restrictedCandidateCount + drawAreaPrivateCampsiteReports.length,
      fallbackCandidateCount: campScoutRelaxedFallbackCandidates.length,
    });
  }, [
    activePolygonCampsiteSuggestions.length,
    campScoutCandidatePool,
    campScoutCandidatesShown.length,
    campScoutFilterMode,
    campScoutRelaxedFallbackCandidates.length,
    drawAreaCommunityCampSites.length,
    drawAreaPrivateCampsiteReports.length,
  ]);

  const selectedCampScoutCandidate = useMemo(
    () =>
      campScoutCandidatesShown.find((candidate) => candidate.id === selectedCampScoutCandidateId) ??
      dispersedCampingCampScoutCandidates.find((candidate) => candidate.id === selectedCampScoutCandidateId) ??
      null,
    [campScoutCandidatesShown, dispersedCampingCampScoutCandidates, selectedCampScoutCandidateId],
  );
  const campOpsRecommendationSet = campsiteCandidates?.campOps?.enabled
    ? campsiteCandidates.campOps.recommendationSet
    : null;

  useEffect(() => {
    if (campScoutAreaMode !== 'results') return;

    if (campScoutCandidatesShown.length === 0) {
      setCampsitePolygonLocateState('empty');
      setCampsitePolygonLocateMessage(campScoutZeroResultSummary.message);
      return;
    }

    const filterLabel =
      campScoutFilterMode === 'easier_access'
        ? 'Easier Access'
        : campScoutFilterMode === 'official_only'
          ? 'Official Only'
          : campScoutFilterMode.charAt(0).toUpperCase() + campScoutFilterMode.slice(1);
    if (campScoutLimitedDataMode) {
      setCampsitePolygonLocateState('limited');
      setCampsitePolygonLocateMessage(
        `Offline/limited data mode: ${campScoutCandidatesShown.length} Camp Scout pin${campScoutCandidatesShown.length === 1 ? '' : 's'} ranked from cached/local signals. Verify rules, access, and conditions.`,
      );
      return;
    }
    if (campScoutPartialDataMode) {
      setCampsitePolygonLocateState('partial');
      setCampsitePolygonLocateMessage(
        `Partial results: ${campScoutCandidatesShown.length} Camp Scout pin${campScoutCandidatesShown.length === 1 ? '' : 's'} shown in or near the drawn area from available signals. Verify rules and access.`,
      );
      return;
    }

    setCampsitePolygonLocateState('ready');
    setCampsitePolygonLocateMessage(
      `${campScoutCandidatesShown.length} Camp Scout pin${campScoutCandidatesShown.length === 1 ? '' : 's'} shown in or near the drawn area for ${filterLabel}.`,
    );
  }, [
    campScoutAreaMode,
    campScoutCandidatesShown.length,
    campScoutZeroResultSummary.message,
    campScoutLimitedDataMode,
    campScoutPartialDataMode,
    campScoutFilterMode,
  ]);
  const campScoutIntroStatusMessage =
    campsitePolygonLocateMessage ??
    'No area selected. Draw an area or use current map view to start a focused Camp Scout scan.';
  const campScoutIntroStatusTitle = campsitePolygonLocateMessage
    ? campsitePolygonLocateState === 'empty'
      ? campScoutZeroResultSummary.title
      : campScoutLocateStateTitle(campsitePolygonLocateState)
    : campScoutLocateStateTitle('no_area');

  const campScoutMapMarkers = useMemo<CampScoutMapMarkerPayload[]>(() => {
    return campScoutCandidatesShown.map((candidate, index) => {
      return {
        id: candidate.id,
        latitude: candidate.coordinate.latitude,
        longitude: candidate.coordinate.longitude,
        title: candidate.title,
        sourceType: candidate.sourceType,
        confidenceGrade: candidate.confidenceGrade,
        confidenceScore: candidate.confidenceScore,
        rank: index + 1,
        selected: candidate.id === selectedCampScoutCandidateId,
        legalityStatus: candidate.legalityStatus ?? 'unknown_needs_verification',
        confidenceLabel:
          candidate.confidenceGrade === 'A'
            ? 'higher confidence'
            : candidate.confidenceGrade === 'B'
              ? 'moderate confidence'
              : 'lower confidence',
        warnings: candidate.warnings ?? candidate.cautions ?? [],
        reasons: candidate.reasons ?? [],
        distanceFromRoadOrTrail: candidate.distanceFromRoadOrTrail ?? candidate.distanceFromNearestRoadMiles,
        slope: candidate.slope ?? candidate.slopeEstimate,
        accessNotes: candidate.accessNotes ?? candidate.sourceNotes?.join('; '),
      };
    });
  }, [campScoutCandidatesShown, selectedCampScoutCandidateId]);
  const dispersedCampingCampScoutMapMarkers = useMemo<CampScoutMapMarkerPayload[]>(() => {
    return dispersedCampingCampScoutCandidates.map((candidate, index) => ({
      id: candidate.id,
      latitude: candidate.coordinate.latitude,
      longitude: candidate.coordinate.longitude,
      title: candidate.title,
      sourceType: candidate.sourceType,
      confidenceGrade: candidate.confidenceGrade,
      confidenceScore: candidate.confidenceScore,
      rank: index + 1,
      selected: candidate.id === selectedCampScoutCandidateId,
      legalityStatus: candidate.legalityStatus ?? 'unknown_needs_verification',
      confidenceLabel: 'ECS-Inferred',
      warnings: candidate.warnings ?? candidate.cautions ?? [],
      reasons: candidate.reasons ?? [],
      distanceFromRoadOrTrail: candidate.distanceFromRoadOrTrail ?? candidate.distanceFromNearestRoadMiles,
      slope: candidate.slope ?? candidate.slopeEstimate,
      accessNotes: candidate.accessNotes ?? candidate.sourceNotes?.join('; '),
      accessibilityLabel: `ECS-Inferred Camp Candidate. Candidate scouting location. Verify locally before camping.`,
    }));
  }, [dispersedCampingCampScoutCandidates, selectedCampScoutCandidateId]);
  const campOpsMapMarkers = useMemo<CampScoutMapMarkerPayload[]>(
    () =>
      buildCampOpsCampScoutMapPins(campOpsRecommendationSet, {
        selectedCampOpsCandidateId: selectedCampOpsEndpointId,
      }),
    [campOpsRecommendationSet, selectedCampOpsEndpointId],
  );
  const selectedCampOpsIntel = useMemo(
    () => buildCampOpsCampIntelViewModel(campOpsRecommendationSet, selectedCampOpsEndpointId),
    [campOpsRecommendationSet, selectedCampOpsEndpointId],
  );
  const sharedCampPinMapMarkers = useMemo<CampScoutMapMarkerPayload[]>(
    () => [...campScoutMapMarkers, ...campOpsMapMarkers, ...dispersedCampingCampScoutMapMarkers],
    [campOpsMapMarkers, campScoutMapMarkers, dispersedCampingCampScoutMapMarkers],
  );

  const campScoutEmptyDiagnostics = useMemo(() => {
    const officialCandidateCount = campScoutCandidatePool.filter(
      (candidate) => candidate.sourceType === 'official_mapped',
    ).length;
    const restrictedCandidateCount = campScoutCandidatePool.filter(
      (candidate) =>
        candidate.legalityStatus === 'restricted_or_not_allowed' ||
        candidate.isPrivateLand ||
        candidate.isProtectedArea ||
        candidate.isClosed ||
        candidate.noCamping,
    ).length;
    const rawCandidateCount =
      activePolygonCampsiteSuggestions.length +
      drawAreaCommunityCampSites.length +
      drawAreaPrivateCampsiteReports.length;
    const finalCandidateCount = campScoutCandidatesShown.length;
    const mapboxFeatureCount = campScoutMapMarkers.length;
    const zeroResult = describeCampScoutZeroResult({
      activeFilterPreset: campScoutFilterMode,
      rawCandidateCount,
      visibleCandidateCount: finalCandidateCount,
      renderedFeatureCount: mapboxFeatureCount,
      officialCandidateCount,
      nonOfficialCandidateCount: Math.max(0, campScoutCandidatePool.length - officialCandidateCount),
      restrictedKnownCount: restrictedCandidateCount + drawAreaPrivateCampsiteReports.length,
      fallbackCandidateCount: campScoutRelaxedFallbackCandidates.length,
    });
    return {
      rawCandidateCount,
      finalCandidateCount,
      activeFilterPreset: campScoutFilterMode,
      zeroResultReason: zeroResult.reason,
      mapboxFeatureCount,
      mapboxSourceContainsFeatures: sharedCampPinMapMarkers.length > 0,
      mapboxLayerContainsFeatures: sharedCampPinMapMarkers.length > 0,
    };
  }, [
    activePolygonCampsiteSuggestions.length,
    campScoutCandidatePool,
    campScoutCandidatesShown.length,
    campScoutFilterMode,
    campScoutMapMarkers.length,
    campScoutRelaxedFallbackCandidates.length,
    drawAreaCommunityCampSites.length,
    drawAreaPrivateCampsiteReports.length,
    sharedCampPinMapMarkers.length,
  ]);

  const campScoutDebugDiagnosticsText = useMemo(() => {
    if (campScoutAreaMode !== 'results' || !isCampScoutDebugEnabled()) return null;
    return [
      `raw=${campScoutEmptyDiagnostics.rawCandidateCount} final=${campScoutEmptyDiagnostics.finalCandidateCount}`,
      `filter=${campScoutEmptyDiagnostics.activeFilterPreset} reason=${campScoutEmptyDiagnostics.zeroResultReason}`,
      `mapboxFeatures=${campScoutEmptyDiagnostics.mapboxFeatureCount} sourceHasFeatures=${campScoutEmptyDiagnostics.mapboxSourceContainsFeatures ? 'yes' : 'no'} layerHasFeatures=${campScoutEmptyDiagnostics.mapboxLayerContainsFeatures ? 'yes' : 'no'}`,
    ].join('\n');
  }, [campScoutAreaMode, campScoutEmptyDiagnostics]);

  useEffect(() => {
    if (campScoutAreaMode !== 'results' || !isCampScoutDebugEnabled()) return;
    if (
      campScoutEmptyDiagnostics.finalCandidateCount > 0 &&
      campScoutEmptyDiagnostics.mapboxFeatureCount > 0
    ) {
      return;
    }
    logCampScoutDebug('draw_area_empty_state', campScoutEmptyDiagnostics);
  }, [campScoutAreaMode, campScoutEmptyDiagnostics]);

  useEffect(() => {
    if (
      campScoutAreaMode !== 'results' ||
      campScoutCandidatesShown.length === 0 ||
      campScoutMapMarkers.length > 0
    ) {
      return;
    }
    const renderEmptyState = describeCampScoutZeroResult({
      activeFilterPreset: campScoutFilterMode,
      rawCandidateCount: campScoutEmptyDiagnostics.rawCandidateCount,
      visibleCandidateCount: campScoutCandidatesShown.length,
      renderedFeatureCount: campScoutMapMarkers.length,
      officialCandidateCount: campScoutCandidatePool.filter(
        (candidate) => candidate.sourceType === 'official_mapped',
      ).length,
      nonOfficialCandidateCount: campScoutCandidatePool.filter(
        (candidate) => candidate.sourceType !== 'official_mapped',
      ).length,
      restrictedKnownCount: drawAreaPrivateCampsiteReports.length,
      fallbackCandidateCount: campScoutRelaxedFallbackCandidates.length,
    });
    setCampsitePolygonLocateState('empty');
    setCampsitePolygonLocateMessage(renderEmptyState.message);
  }, [
    campScoutAreaMode,
    campScoutCandidatePool,
    campScoutCandidatesShown.length,
    campScoutEmptyDiagnostics.rawCandidateCount,
    campScoutFilterMode,
    campScoutMapMarkers.length,
    campScoutRelaxedFallbackCandidates.length,
    drawAreaPrivateCampsiteReports.length,
  ]);

  useEffect(() => {
    if (campScoutAreaMode !== 'results' || !isCampScoutDebugEnabled()) return;
    const bounds = getCampsitePolygonBounds(campsiteDrawingPoints);
    const restrictedCount = campScoutCandidatePool.filter(
      (candidate) =>
        candidate.legalityStatus === 'restricted_or_not_allowed' ||
        candidate.isPrivateLand ||
        candidate.isProtectedArea ||
        candidate.isClosed ||
        candidate.noCamping,
    ).length;
    const unknownLegalityCount = campScoutCandidatePool.filter(
      (candidate) => candidate.legalityStatus === 'unknown_needs_verification' || candidate.legalityConfidence < 50,
    ).length;
    const slopeRemovedCount =
      typeof campScoutFilterOptions.maximumSlopeEstimate === 'number'
        ? campScoutCandidatePool.filter(
            (candidate) =>
              typeof candidate.slopeEstimate === 'number' &&
              candidate.slopeEstimate > campScoutFilterOptions.maximumSlopeEstimate!,
          ).length
        : 0;
    const accessRemovedCount =
      typeof campScoutFilterOptions.minimumAccessConfidence === 'number'
        ? campScoutCandidatePool.filter(
            (candidate) => candidate.accessConfidence < campScoutFilterOptions.minimumAccessConfidence!,
          ).length
        : 0;
    logCampScoutDebug('draw_area_pin_pipeline', {
      drawGeometryExists: campsiteDrawingPoints.length >= 3,
      polygonPointCount: campsiteDrawingPoints.length,
      polygonBounds: bounds,
      rawCandidates: activePolygonCampsiteSuggestions.length + drawAreaCommunityCampSites.length,
      insideDrawnPolygon: campScoutCandidatePool.length,
      validCoordinates: campScoutCandidatePool.filter(
        (candidate) =>
          Number.isFinite(candidate.coordinate.latitude) &&
          Number.isFinite(candidate.coordinate.longitude),
      ).length,
      officialCampsitePoiMatches: campScoutCandidatePool.filter(
        (candidate) => candidate.sourceType === 'official_mapped',
      ).length,
      landOwnershipJurisdictionPass: Math.max(0, campScoutCandidatePool.length - restrictedCount),
      privateLandRemoved: campScoutCandidatePool.filter((candidate) => candidate.isPrivateLand).length,
      protectedRestrictedClosedRemoved: campScoutCandidatePool.filter(
        (candidate) => candidate.isProtectedArea || candidate.isClosed || candidate.noCamping,
      ).length,
      slopeTerrainRemoved: slopeRemovedCount,
      accessRemotenessRemoved: accessRemovedCount,
      legalStatusRemoved: campScoutCandidatePool.filter(
        (candidate) => candidate.legalityStatus === 'restricted_or_not_allowed',
      ).length,
      unknownLegalityWarningCount: unknownLegalityCount,
      removedByUnknownLegalityCount: 0,
      finalCandidates: campScoutCandidatesShown.length,
      renderedMarkerCount: campScoutMapMarkers.length,
      sharedRenderedMarkerCount: sharedCampPinMapMarkers.length,
      mapboxRenderMode: 'geojson_source_plus_dom_markers',
      mapboxSourceExists: 'ecs-camp-scout-pins-source',
      mapboxLayerExists: 'ecs-camp-scout-pins-layer',
      mapboxSourceContainsFeatures: sharedCampPinMapMarkers.length > 0,
      mapboxLayerContainsFeatures: sharedCampPinMapMarkers.length > 0,
      mapboxLayerVisibility: campScoutMapMarkers.length > 0 ? 'visible' : 'empty',
    });
  }, [
    activePolygonCampsiteSuggestions.length,
    campScoutAreaMode,
    campScoutCandidatePool,
    campScoutCandidatesShown.length,
    campScoutFilterOptions.maximumSlopeEstimate,
    campScoutFilterOptions.minimumAccessConfidence,
    campScoutMapMarkers.length,
    campsiteDrawingPoints,
    drawAreaCommunityCampSites.length,
    sharedCampPinMapMarkers.length,
  ]);

  const resetDrawAreaKnownCampsiteSources = useCallback(() => {
    drawAreaCampsiteSourcesRequestRef.current = null;
    setDrawAreaCommunityCampSites([]);
    setDrawAreaPrivateCampsiteReports([]);
    setDrawAreaPendingCampsiteReports([]);
    setDrawAreaReviewerPendingCampsiteReports([]);
    setDrawAreaGroupCampsiteGroups([]);
    setDrawAreaGroupCampsiteItems([]);
  }, []);

  const resetRouteKnownCampsiteSources = useCallback(() => {
    routeCampsiteSourcesRequestRef.current = null;
    setRouteCommunityCampSites([]);
    setRoutePrivateCampsiteReports([]);
    setRoutePendingCampsiteReports([]);
    setRouteReviewerPendingCampsiteReports([]);
    setRouteGroupCampsiteGroups([]);
    setRouteGroupCampsiteItems([]);
  }, []);

  const loadDrawAreaKnownCampsiteSources = useCallback(
    (polygonId: string, points: CampsiteSearchPolygonPoint[]) => {
      const bounds = getCampsitePolygonBounds(points);
      if (!communityCampsitesEnabled || !bounds) {
        resetDrawAreaKnownCampsiteSources();
        return;
      }

      const signature = JSON.stringify({
        polygonId,
        minLat: Number(bounds.minLat.toFixed(4)),
        minLng: Number(bounds.minLng.toFixed(4)),
        maxLat: Number(bounds.maxLat.toFixed(4)),
        maxLng: Number(bounds.maxLng.toFixed(4)),
      });
      if (drawAreaCampsiteSourcesRequestRef.current === signature) return;
      drawAreaCampsiteSourcesRequestRef.current = signature;

      const filterInsidePolygon = <T extends { latitude: number; longitude: number }>(items: T[]): T[] =>
        items.filter((item) => campsitePointInsidePolygon(item, points));

      void Promise.all([
        fetchApprovedCommunityCampsitesForViewport(campsiteRecommendationService, bounds)
          .then((result) => (result.ok ? filterInsidePolygon(result.data) : []))
          .catch(() => [] as PublicCampSite[]),
        fetchPrivateCampsitesForViewport(campsiteRecommendationService, bounds)
          .then((result) => (result.ok ? filterInsidePolygon(result.data) : []))
          .catch(() => [] as CampSiteReportResponse[]),
        fetchPendingCommunitySubmissionsForViewport(campsiteRecommendationService, bounds)
          .then((result) => (result.ok ? filterInsidePolygon(result.data) : []))
          .catch(() => [] as CampSiteReportResponse[]),
        fetchReviewerPendingCampsitesForViewport(campsiteReviewService, bounds)
          .then((result) => (result.ok ? filterInsidePolygon(result.data) : []))
          .catch(() => [] as CampSiteReviewQueueItem[]),
        campSiteGroupSharingService
          .listMyCampSiteGroups()
          .then(async (result) => {
            const groups = result.ok ? result.data : [];
            if (groups.length === 0) {
              return { groups, items: [] as GroupCampSiteItem[] };
            }
            const groupResults = await Promise.all(
              groups.map((item) =>
                fetchGroupCampsitesForViewport(campSiteGroupSharingService, item.group.id, bounds)
                  .then((groupResult) => (groupResult.ok ? groupResult.data : []))
                  .catch(() => [] as GroupCampSiteItem[]),
              ),
            );
            const items = groupResults
              .flat()
              .filter((item) => {
                const target = item.camp_site ?? item.report;
                return !!target && campsitePointInsidePolygon(target, points);
              });
            return { groups, items };
          })
          .catch(() => ({ groups: [] as CampSiteGroupListItem[], items: [] as GroupCampSiteItem[] })),
      ]).then(([communitySites, privateReports, pendingReports, reviewerPendingReports, groupResult]) => {
        if (drawAreaCampsiteSourcesRequestRef.current !== signature) return;
        setDrawAreaCommunityCampSites(communitySites);
        setDrawAreaPrivateCampsiteReports(privateReports);
        setDrawAreaPendingCampsiteReports(pendingReports);
        setDrawAreaReviewerPendingCampsiteReports(reviewerPendingReports);
        setDrawAreaGroupCampsiteGroups(groupResult.groups);
        setDrawAreaGroupCampsiteItems(groupResult.items);
        const reviewVisibleCount =
          (campsiteLayerVisibility.pending ? pendingReports.length : 0) +
          (campsiteLayerVisibility.reviewer_pending ? reviewerPendingReports.length : 0);
        const knownCount =
          communitySites.length +
          (campsiteLayerVisibility.private ? privateReports.length : 0) +
          (campsiteLayerVisibility.group ? groupResult.items.length : 0) +
          reviewVisibleCount;
        if (knownCount > 0) {
          setCampsitePolygonLocateState((current) =>
            current === 'empty' || current === 'locating' ? 'ready' : current,
          );
          setCampsitePolygonLocateMessage((current) =>
            current && !current.startsWith('No viable')
              ? current
              : `${knownCount} known campsite option${knownCount === 1 ? '' : 's'} found in area.`,
          );
        }
      });
    },
    [communityCampsitesEnabled, campsiteLayerVisibility, resetDrawAreaKnownCampsiteSources],
  );

  const loadRouteKnownCampsiteSources = useCallback(
    (routeSignature: string | null, context: RouteCampsiteContext | null) => {
      if (!communityCampsitesEnabled || !routeSignature || !context) {
        resetRouteKnownCampsiteSources();
        return;
      }

      const routePoints = normalizeRouteCampsiteCoordinates(context.routeCoordinates as unknown[]);
      const bounds = getRouteCampsiteSourceBounds(routePoints, context.routeBufferMiles ?? ROUTE_CAMPSITE_BUFFER_MILES);
      if (!bounds) {
        resetRouteKnownCampsiteSources();
        return;
      }

      const bufferMiles = context.routeBufferMiles ?? ROUTE_CAMPSITE_BUFFER_MILES;
      const signature = JSON.stringify({
        routeSignature,
        community: campsiteLayerVisibility.community,
        private: campsiteLayerVisibility.private,
        group: campsiteLayerVisibility.group,
        pending: campsiteLayerVisibility.pending,
        reviewerPending: campsiteLayerVisibility.reviewer_pending,
        bufferMiles: Number(bufferMiles.toFixed(2)),
        minLat: Number(bounds.minLat.toFixed(4)),
        minLng: Number(bounds.minLng.toFixed(4)),
        maxLat: Number(bounds.maxLat.toFixed(4)),
        maxLng: Number(bounds.maxLng.toFixed(4)),
      });
      if (routeCampsiteSourcesRequestRef.current === signature) return;
      routeCampsiteSourcesRequestRef.current = signature;

      const filterNearRoute = <T extends { latitude: number; longitude: number }>(items: T[]): T[] =>
        items.filter((item) => campsitePointNearRoute(item, routePoints, bufferMiles));

      void Promise.all([
        campsiteLayerVisibility.community
          ? fetchApprovedCommunityCampsitesForViewport(campsiteRecommendationService, bounds)
              .then((result) => (result.ok ? filterNearRoute(result.data) : []))
              .catch(() => [] as PublicCampSite[])
          : Promise.resolve([] as PublicCampSite[]),
        campsiteLayerVisibility.private
          ? fetchPrivateCampsitesForViewport(campsiteRecommendationService, bounds)
              .then((result) => (result.ok ? filterNearRoute(result.data) : []))
              .catch(() => [] as CampSiteReportResponse[])
          : Promise.resolve([] as CampSiteReportResponse[]),
        campsiteLayerVisibility.pending
          ? fetchPendingCommunitySubmissionsForViewport(campsiteRecommendationService, bounds)
              .then((result) => (result.ok ? filterNearRoute(result.data) : []))
              .catch(() => [] as CampSiteReportResponse[])
          : Promise.resolve([] as CampSiteReportResponse[]),
        campsiteLayerVisibility.reviewer_pending
          ? fetchReviewerPendingCampsitesForViewport(campsiteReviewService, bounds)
              .then((result) => (result.ok ? filterNearRoute(result.data) : []))
              .catch(() => [] as CampSiteReviewQueueItem[])
          : Promise.resolve([] as CampSiteReviewQueueItem[]),
        campsiteLayerVisibility.group
          ? campSiteGroupSharingService
              .listMyCampSiteGroups()
              .then(async (result) => {
                const groups = result.ok ? result.data : [];
                if (groups.length === 0) {
                  return { groups, items: [] as GroupCampSiteItem[] };
                }
                const groupResults = await Promise.all(
                  groups.map((item) =>
                    fetchGroupCampsitesForViewport(campSiteGroupSharingService, item.group.id, bounds)
                      .then((groupResult) => (groupResult.ok ? groupResult.data : []))
                      .catch(() => [] as GroupCampSiteItem[]),
                  ),
                );
                const items = groupResults
                  .flat()
                  .filter((item) => {
                    const target = item.camp_site ?? item.report;
                    return !!target && campsitePointNearRoute(target, routePoints, bufferMiles);
                  });
                return { groups, items };
              })
              .catch(() => ({ groups: [] as CampSiteGroupListItem[], items: [] as GroupCampSiteItem[] }))
          : Promise.resolve({ groups: [] as CampSiteGroupListItem[], items: [] as GroupCampSiteItem[] }),
      ]).then(([communitySites, privateReports, pendingReports, reviewerPendingReports, groupResult]) => {
        if (routeCampsiteSourcesRequestRef.current !== signature) return;
        setRouteCommunityCampSites(communitySites);
        setRoutePrivateCampsiteReports(privateReports);
        setRoutePendingCampsiteReports(pendingReports);
        setRouteReviewerPendingCampsiteReports(reviewerPendingReports);
        setRouteGroupCampsiteGroups(groupResult.groups);
        setRouteGroupCampsiteItems(groupResult.items);
      });
    },
    [communityCampsitesEnabled, campsiteLayerVisibility, resetRouteKnownCampsiteSources],
  );

  useEffect(() => {
    if (!communityCampsitesEnabled || !mapSurfaceReady || communityCampsiteInitialBoundsRequestedRef.current) {
      return;
    }
    communityCampsiteInitialBoundsRequestedRef.current = true;
    setRequestBoundsTrigger((prev) => prev + 1);
  }, [mapSurfaceReady, communityCampsitesEnabled]);

  useEffect(() => {
    if (!communityCampsitesEnabled || !campsiteLayerVisibility.community) {
      communityCampsiteBoundsSignatureRef.current = null;
      setCommunityCampSites([]);
      setSelectedCommunityCampSiteId(null);
      return;
    }
    if (!mapBounds) return;

    const query = createCommunityCampsiteBoundsQuery(mapBounds);
    const signature = JSON.stringify({
      minLat: Number(query.minLat.toFixed(4)),
      minLng: Number(query.minLng.toFixed(4)),
      maxLat: Number(query.maxLat.toFixed(4)),
      maxLng: Number(query.maxLng.toFixed(4)),
      limit: query.limit,
    });
    if (communityCampsiteBoundsSignatureRef.current === signature) return;
    communityCampsiteBoundsSignatureRef.current = signature;

    let cancelled = false;
    fetchApprovedCommunityCampsitesForViewport(campsiteRecommendationService, mapBounds)
      .then((result) => {
        if (cancelled) return;
        if (!result.ok) {
          setCommunityCampSites([]);
          return;
        }
        setCommunityCampSites(result.data);
      })
      .catch(() => {
        if (cancelled) return;
        setCommunityCampSites([]);
      });

    return () => {
      cancelled = true;
    };
  }, [campsiteLayerVisibility.community, mapBounds, communityCampsitesEnabled]);

  useEffect(() => {
    if (!communityCampsitesEnabled || !campsiteLayerVisibility.private) {
      privateCampsiteBoundsSignatureRef.current = null;
      setPrivateCampsiteReports([]);
      return;
    }
    if (!mapBounds) return;
    const signature = JSON.stringify({
      minLat: Number(mapBounds.minLat.toFixed(4)),
      minLng: Number(mapBounds.minLng.toFixed(4)),
      maxLat: Number(mapBounds.maxLat.toFixed(4)),
      maxLng: Number(mapBounds.maxLng.toFixed(4)),
    });
    if (privateCampsiteBoundsSignatureRef.current === signature) return;
    privateCampsiteBoundsSignatureRef.current = signature;

    let cancelled = false;
    fetchPrivateCampsitesForViewport(campsiteRecommendationService, mapBounds)
      .then((result) => {
        if (cancelled) return;
        setPrivateCampsiteReports(result.ok ? result.data : []);
      })
      .catch(() => {
        if (!cancelled) setPrivateCampsiteReports([]);
      });
    return () => {
      cancelled = true;
    };
  }, [campsiteLayerVisibility.private, communityCampsitesEnabled, mapBounds]);

  useEffect(() => {
    if (!communityCampsitesEnabled || !campsiteLayerVisibility.pending) {
      pendingCampsiteBoundsSignatureRef.current = null;
      setPendingCampsiteReports([]);
      return;
    }
    if (!mapBounds) return;
    const signature = JSON.stringify({
      minLat: Number(mapBounds.minLat.toFixed(4)),
      minLng: Number(mapBounds.minLng.toFixed(4)),
      maxLat: Number(mapBounds.maxLat.toFixed(4)),
      maxLng: Number(mapBounds.maxLng.toFixed(4)),
    });
    if (pendingCampsiteBoundsSignatureRef.current === signature) return;
    pendingCampsiteBoundsSignatureRef.current = signature;

    let cancelled = false;
    fetchPendingCommunitySubmissionsForViewport(campsiteRecommendationService, mapBounds)
      .then((result) => {
        if (cancelled) return;
        setPendingCampsiteReports(result.ok ? result.data : []);
      })
      .catch(() => {
        if (!cancelled) setPendingCampsiteReports([]);
      });
    return () => {
      cancelled = true;
    };
  }, [campsiteLayerVisibility.pending, communityCampsitesEnabled, mapBounds]);

  useEffect(() => {
    if (!communityCampsitesEnabled || !campsiteLayerVisibility.reviewer_pending) {
      reviewerPendingCampsiteBoundsSignatureRef.current = null;
      setReviewerPendingCampsiteReports([]);
      return;
    }
    if (!mapBounds) return;
    const signature = JSON.stringify({
      minLat: Number(mapBounds.minLat.toFixed(4)),
      minLng: Number(mapBounds.minLng.toFixed(4)),
      maxLat: Number(mapBounds.maxLat.toFixed(4)),
      maxLng: Number(mapBounds.maxLng.toFixed(4)),
    });
    if (reviewerPendingCampsiteBoundsSignatureRef.current === signature) return;
    reviewerPendingCampsiteBoundsSignatureRef.current = signature;

    let cancelled = false;
    fetchReviewerPendingCampsitesForViewport(campsiteReviewService, mapBounds)
      .then((result) => {
        if (cancelled) return;
        setReviewerPendingCampsiteReports(result.ok ? result.data : []);
      })
      .catch(() => {
        if (!cancelled) setReviewerPendingCampsiteReports([]);
      });
    return () => {
      cancelled = true;
    };
  }, [campsiteLayerVisibility.reviewer_pending, communityCampsitesEnabled, mapBounds]);

  useEffect(() => {
    if (!communityCampsitesEnabled || !campsiteLayerVisibility.group) {
      groupCampsiteBoundsSignatureRef.current = null;
      setGroupCampsiteGroups([]);
      setGroupCampsiteItems([]);
      setSelectedGroupCampsiteGroupId(null);
      return;
    }

    let cancelled = false;
    campSiteGroupSharingService
      .listMyCampSiteGroups()
      .then((result) => {
        if (cancelled) return;
        const groups = result.ok ? result.data : [];
        setGroupCampsiteGroups(groups);
        setSelectedGroupCampsiteGroupId((current) => current ?? groups[0]?.group.id ?? null);
      })
      .catch(() => {
        if (!cancelled) {
          setGroupCampsiteGroups([]);
          setSelectedGroupCampsiteGroupId(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [campsiteLayerVisibility.group, communityCampsitesEnabled]);

  useEffect(() => {
    if (!communityCampsitesEnabled || !campsiteLayerVisibility.group || !selectedGroupCampsiteGroupId) {
      setGroupCampsiteItems([]);
      return;
    }
    if (!mapBounds) return;
    const signature = JSON.stringify({
      groupId: selectedGroupCampsiteGroupId,
      minLat: Number(mapBounds.minLat.toFixed(4)),
      minLng: Number(mapBounds.minLng.toFixed(4)),
      maxLat: Number(mapBounds.maxLat.toFixed(4)),
      maxLng: Number(mapBounds.maxLng.toFixed(4)),
    });
    if (groupCampsiteBoundsSignatureRef.current === signature) return;
    groupCampsiteBoundsSignatureRef.current = signature;

    let cancelled = false;
    fetchGroupCampsitesForViewport(campSiteGroupSharingService, selectedGroupCampsiteGroupId, mapBounds)
      .then((result) => {
        if (cancelled) return;
        setGroupCampsiteItems(result.ok ? result.data : []);
      })
      .catch(() => {
        if (!cancelled) setGroupCampsiteItems([]);
      });
    return () => {
      cancelled = true;
    };
  }, [campsiteLayerVisibility.group, communityCampsitesEnabled, mapBounds, selectedGroupCampsiteGroupId]);

  useEffect(() => {
    if (!selectedCommunityCampSiteId) return;
    if (
      !communityCampSites.some((site) => site.id === selectedCommunityCampSiteId) &&
      !drawAreaCommunityCampSites.some((site) => site.id === selectedCommunityCampSiteId)
    ) {
      setSelectedCommunityCampSiteId(null);
    }
  }, [communityCampSites, drawAreaCommunityCampSites, selectedCommunityCampSiteId]);

  useEffect(() => {
    if (!selectedCommunityCampSiteId || communityCampSitePhotosById[selectedCommunityCampSiteId]) {
      return;
    }

    let cancelled = false;
    void campsiteRecommendationService
      .listApprovedPhotosForCampSite(selectedCommunityCampSiteId)
      .then((result) => {
        if (cancelled || !result.ok) return;
        setCommunityCampSitePhotosById((prev) => ({
          ...prev,
          [selectedCommunityCampSiteId]: result.data,
        }));
      });

    return () => {
      cancelled = true;
    };
  }, [communityCampSitePhotosById, selectedCommunityCampSiteId]);

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
        ? ` - ${approachingHazard.distanceAheadMi.toFixed(1)} MI`
        : '';
      return { level: 'extreme' as const, label: `WX EXTREME${suffix}`, color: '#EF5350', score: 3 };
    }
    if (highest === 2) {
      const suffix = approachingHazard?.active && approachingHazard.distanceAheadMi != null
        ? ` - ${approachingHazard.distanceAheadMi.toFixed(1)} MI`
        : '';
      return { level: 'warning' as const, label: `WX WARNING${suffix}`, color: '#FF7043', score: 2 };
    }
    if (highest === 1) {
      const activeLabel = routeCorridorWeather?.summary?.activePoint?.label;
      const suffix = activeLabel ? ` - ${activeLabel}` : '';
      return { level: 'advisory' as const, label: `WX ADVISORY${suffix}`, color: '#FFB300', score: 1 };
    }
    return null;
  }, [routeCorridorWeather]);

  const routeHazardIntel = useMemo(() => {
    if (!weatherSeveritySummary) return null;
    const approaching = routeCorridorWeather.approachingHazard;
    const point = approaching?.point ?? routeCorridorWeather.summary.activePoint;
    const detailLines = [
      routeCorridorWeather.summary.detail,
      ...(point?.hazardReasons ?? []),
    ].filter((line): line is string => typeof line === 'string' && line.trim().length > 0);

    return {
      signature: `${weatherSeveritySummary.level}:${point?.idx ?? 'route'}:${routeCorridorWeather.lastFetchAt ?? 'none'}`,
      color: weatherSeveritySummary.color,
      headline: routeCorridorWeather.summary.headline ?? weatherSeveritySummary.label,
      summaryLine: routeCorridorWeather.summary.detail ?? 'Weather may affect this route.',
      approachingLine:
        approaching?.active && approaching.distanceAheadMi != null
          ? `${approaching.distanceAheadMi.toFixed(1)} MI AHEAD`
          : null,
      detailLines: detailLines.length > 0 ? detailLines : ['Review route weather before departure.'],
    };
  }, [
    routeCorridorWeather.approachingHazard,
    routeCorridorWeather.lastFetchAt,
    routeCorridorWeather.summary,
    weatherSeveritySummary,
  ]);

  const surfacedMissionBrief = missionBrief;
  const visibleMissionBrief = useMemo(
    () => sanitizeVisibleLanguage(surfacedMissionBrief),
    [surfacedMissionBrief],
  );
  const navigateVehicleContext = useMemo(
    () => {
      const snapshotVehicleId = activeRun?.build_snapshot?.vehicle_id;
      if (snapshotVehicleId) {
        return getVehicleContext(snapshotVehicleId);
      }

      void activeVehicleRevision;
      return getActiveVehicleContext();
    },
    [activeRun?.build_snapshot?.vehicle_id, activeVehicleRevision],
  );
  const aiTelemetry = useMemo(
    () => ({
      gps: gps.position ?? null,
      connectivityLevel: navigateConnectivity.level,
      roadStatus: roadNavigation.session.status,
      trailStatus: trailNavigation.session.status,
    }),
    [
      gps.position,
      navigateConnectivity.level,
      roadNavigation.session.status,
      trailNavigation.session.status,
    ],
  );
  const aiWeatherCorridor = useMemo(
    () => ({
      severity: weatherSeveritySummary?.score ?? 0,
      source: routeCorridorWeather.source,
      headline: routeCorridorWeather.summary.headline,
      detail: routeCorridorWeather.summary.detail,
      lastFetchAt: routeCorridorWeather.lastFetchAt,
    }),
    [
      routeCorridorWeather.lastFetchAt,
      routeCorridorWeather.source,
      routeCorridorWeather.summary.detail,
      routeCorridorWeather.summary.headline,
      weatherSeveritySummary?.score,
    ],
  );
  const aiResources = useMemo(
    () => ({
      fuelTankCapacityGal: navigateVehicleContext.resourceProfile.fuelTankCapacityGal,
      fuelPercent: navigateVehicleContext.resourceProfile.currentFuelPercent,
      fuelGallons: navigateVehicleContext.resourceProfile.currentFuelGallons,
      fuelWeightLb: navigateVehicleContext.resourceProfile.currentFuelWeightLb,
      waterCapacityGal: navigateVehicleContext.resourceProfile.waterCapacityGal,
      waterGallons: navigateVehicleContext.resourceProfile.currentWaterGallons,
      waterWeightLb: navigateVehicleContext.resourceProfile.currentWaterWeightLb,
      batteryCapacityWh: navigateVehicleContext.resourceProfile.batteryUsableWh,
      tireSizeInches: navigateVehicleContext.resourceProfile.tireSizeInches,
      suspensionLiftInches: navigateVehicleContext.resourceProfile.suspensionLiftInches,
      isLeveled: navigateVehicleContext.resourceProfile.isLeveled,
      frontLevelInches: navigateVehicleContext.resourceProfile.frontLevelInches,
      forecastLevel: resourceForecast?.sufficiencyLevel ?? null,
    }),
    [
      navigateVehicleContext.resourceProfile.batteryUsableWh,
      navigateVehicleContext.resourceProfile.currentFuelGallons,
      navigateVehicleContext.resourceProfile.currentFuelPercent,
      navigateVehicleContext.resourceProfile.currentFuelWeightLb,
      navigateVehicleContext.resourceProfile.currentWaterGallons,
      navigateVehicleContext.resourceProfile.currentWaterWeightLb,
      navigateVehicleContext.resourceProfile.frontLevelInches,
      navigateVehicleContext.resourceProfile.fuelTankCapacityGal,
      navigateVehicleContext.resourceProfile.isLeveled,
      navigateVehicleContext.resourceProfile.suspensionLiftInches,
      navigateVehicleContext.resourceProfile.tireSizeInches,
      navigateVehicleContext.resourceProfile.waterCapacityGal,
      resourceForecast?.sufficiencyLevel,
    ],
  );
  const {
    aiState,
    navigateView,
    liveStatus,
  } = useECSAIHook({
    activeRun,
    vehicleConfig: navigateVehicleContext.vehicle,
    telemetry: aiTelemetry,
    weatherCorridor: aiWeatherCorridor,
    routeIntelligence,
    remoteness: remotenessIndex,
    resources: aiResources,
    enabled: isFocused,
  });
  const powerTelemetryHash = JSON.stringify({
    level: resourceForecast?.sufficiencyLevel ?? null,
    vehicleId: navigateVehicleContext.activeVehicleId ?? null,
  });

  const stitchSourceRuns = useMemo(() => runs, [runs]);
  const stitchedRuns = useMemo(
    () =>
      stitchSegmentIds
        .map((runId) => stitchSourceRuns.find((run) => run.id === runId))
        .filter((run): run is ECSRun => !!run),
    [stitchSegmentIds, stitchSourceRuns],
  );

  const clearRoadDestination = roadNavigation.clearDestination;
  const previewRoadDestination = roadNavigation.previewDestination;
  const previewRoadRoute = roadNavigation.previewRoute;
  const startRoadNavigation = roadNavigation.startNavigation;
  const endRoadNavigation = roadNavigation.endNavigation;
  const rerouteRoadNavigation = roadNavigation.reroute;
  const enableFollowLock = useCallback((_: string, options?: { force?: boolean; zoom?: number }) => {
    setFollowUser(true);
    setUserHasManuallyMovedMap(false);
    if (userLocation) {
      queueMapCameraCommand({
        mode: 'follow_user',
        center: { latitude: userLocation.lat, longitude: userLocation.lng },
        zoom: options?.zoom ?? mapZoom,
        durationMs: 450,
        animate: true,
        reason: 'follow_lock',
      }, { force: options?.force });
    }
  }, [mapZoom, queueMapCameraCommand, userLocation]);
  const handleRecenter = useCallback(() => {
    enableFollowLock('recenter', { force: true });
  }, [enableFollowLock]);
  const handleUserDrag = useCallback(() => {
    setFollowUser(false);
    setUserHasManuallyMovedMap(true);
  }, []);
  const handleRoadClassification = useCallback((classification: any) => {
    roadClassificationBridge.feed({
      roadClass: String(classification?.classification ?? classification?.roadClass ?? 'unknown'),
      hasRoad: classification?.classification !== 'unknown',
      featureCount: 1,
      timestamp: Date.now(),
    });
  }, []);
  const handleCleanupComplete = useCallback((report?: any) => {
    setCleanupReport(report ?? null);
  }, []);

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
    setCampLayerMenuOpen(false);
    if (popup !== 'tools') {
      setToolsMenuOpen(false);
    }
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
          stabilityLog('Navigation', 'info', 'Connectivity restored - live services available');
        } else if (
          prevConnectivityStatusRef.current !== nextSnapshot.status &&
          nextSnapshot.status === 'offline'
        ) {
          stabilityLog('Navigation', 'warn', 'Connectivity lost - shifting to limited offline mode');
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

  useEffect(() => {
    let cancelled = false;
    const refreshOfflineRouteSyncs = () => {
      void listOfflineCachedRoutes()
        .then((routes) => {
          if (cancelled || !mountedRef.current) return;
          setOfflineRouteReadinessState({ hydrated: true, routes });
        })
        .catch(() => {
          if (cancelled || !mountedRef.current) return;
          setOfflineRouteReadinessState((prev) => ({ ...prev, hydrated: true }));
        });
    };

    refreshOfflineRouteSyncs();
    const unsubscribeSync = offlineTileSyncCoordinator.subscribe(() => {
      if (!mountedRef.current) return;
      setOfflineTileSyncSnapshot(offlineTileSyncCoordinator.getSnapshot());
      refreshOfflineRouteSyncs();
    });
    const unsubscribeTiles = tileCacheStore.subscribe(refreshOfflineRouteSyncs);

    return () => {
      cancelled = true;
      unsubscribeSync();
      unsubscribeTiles();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void readDismissedOfflineSyncCompletionNotices().then((ids) => {
      if (cancelled || !mountedRef.current) return;
      setDismissedOfflineSyncCompletionNoticeIds(ids);
      offlineSyncCompletionNoticePrefsHydratedRef.current = true;
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const nextStatusMap = new Map(
      offlineTileSyncSnapshot.jobs.map((job) => [job.jobId, job.status]),
    );

    if (initialCompletedOfflineSyncNoticeIdsRef.current === null) {
      initialCompletedOfflineSyncNoticeIdsRef.current = new Set(
        offlineTileSyncSnapshot.jobs
          .filter((job) => job.status === 'complete')
          .map(getOfflineSyncCompletionNoticeId),
      );
      previousOfflineSyncJobStatusRef.current = nextStatusMap;
      return;
    }

    if (!offlineSyncCompletionNoticePrefsHydratedRef.current) {
      previousOfflineSyncJobStatusRef.current = nextStatusMap;
      return;
    }

    const initialCompletedIds = initialCompletedOfflineSyncNoticeIdsRef.current;
    const previousStatusMap = previousOfflineSyncJobStatusRef.current;
    const justCompleted = offlineTileSyncSnapshot.jobs.find((job) => {
      if (job.status !== 'complete') return false;
      const noticeId = getOfflineSyncCompletionNoticeId(job);
      if (initialCompletedIds.has(noticeId)) return false;
      if (dismissedOfflineSyncCompletionNoticeIds.has(noticeId)) return false;
      const previousStatus = previousStatusMap.get(job.jobId);
      return previousStatus === 'pending' || previousStatus === 'running';
    });

    previousOfflineSyncJobStatusRef.current = nextStatusMap;

    if (justCompleted) {
      setOfflineSyncCompletionNotice(buildOfflineSyncCompletionNotice(justCompleted));
    }
  }, [dismissedOfflineSyncCompletionNoticeIds, offlineTileSyncSnapshot]);

  const handleDismissOfflineSyncCompletionNotice = useCallback(() => {
    setOfflineSyncCompletionNotice((current) => {
      if (!current) return null;
      setDismissedOfflineSyncCompletionNoticeIds((prev) => {
        const next = new Set(prev);
        next.add(current.id);
        void persistDismissedOfflineSyncCompletionNotices(next);
        return next;
      });
      return null;
    });
  }, []);

  const toggleTopPopup = useCallback((popup: Exclude<NavigateTopPopup, null>) => {
    closeNavigateDetailSurfaces();
    if (popup !== 'tools') {
      setToolsMenuOpen(false);
    }
    setActiveTopPopup((prev) => (prev === popup ? null : popup));
  }, [closeNavigateDetailSurfaces]);

  const closeTopPopup = useCallback((popup?: Exclude<NavigateTopPopup, null>) => {
    if (!popup) {
      closeNavigateDetailSurfaces();
      setToolsMenuOpen(false);
      setActiveTopPopup(null);
      return;
    }
    setActiveTopPopup((prev) => {
      return prev === popup ? null : prev;
    });
  }, [closeNavigateDetailSurfaces]);

  const closeTiltAlertDetail = useCallback(() => {
    setTiltAlertDetailVisible(false);
    setTiltAlertDetailEvent(null);
    setTiltAlertDetailCluster(null);
  }, []);

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

  const handleGpsRetry = useCallback(() => {
    gps.refresh();
  }, [gps]);

  const focusOfflineCacheBounds = useCallback((bounds: TileBounds | null | undefined, message: string) => {
    closeTopPopup('offlineCache');
    setToolsMenuOpen(false);
    if (bounds) {
      queueMapCameraCommand({
        mode: 'route_overview',
        fitBounds: {
          north: bounds.maxLat,
          south: bounds.minLat,
          east: bounds.maxLng,
          west: bounds.minLng,
          padding: 48,
          maxZoom: 13,
        },
        durationMs: 520,
        animate: true,
        reason: 'offline_sync_open_fallback',
      }, { force: true });
    }
    showToast(message);
  }, [closeTopPopup, queueMapCameraCommand, showToast]);

  const handleOpenDownloadedSync = useCallback(async (target: DownloadedSyncOpenTarget) => {
    hapticCommand();

    if (target.kind === 'region') {
      focusOfflineCacheBounds(
        target.region.bounds,
        'OFFLINE MAP AREA OPENED - ROUTE DESTINATION NOT AVAILABLE',
      );
      return;
    }

    const route = target.route;
    const destinationResult = getOfflineRouteDestination(route);
    if (!destinationResult) {
      focusOfflineCacheBounds(
        route.routeBounds,
        'OLDER OFFLINE ROUTE OPENED - DESTINATION METADATA UNAVAILABLE',
      );
      return;
    }

    closeTopPopup('offlineCache');
    setToolsMenuOpen(false);
    await clearExploreNavigationPayload();
    await endTrailNavigation();

    const { destination, usedMetadata } = destinationResult;
    const origin = roadNavigationCurrentLocation;

    if (!origin) {
      await previewRoadDestination(destination, 'offline_sync_open');
      handleGpsRetry();
      showToast('WAITING FOR GPS TO PREVIEW OFFLINE ROUTE');
      return;
    }

    if (liveNavigateServicesEnabled) {
      await previewRoadDestination(destination, 'offline_sync_open');
      showToast(usedMetadata ? 'ROUTE PREVIEW RESTORED FROM OFFLINE SYNC' : 'ROUTE PREVIEW RESTORED FROM SAVED GEOMETRY');
      return;
    }

    const cachedRoadRoute = buildOfflineCachedRoadPreviewRoute(route, origin, destination);
    if (!cachedRoadRoute) {
      focusOfflineCacheBounds(
        route.routeBounds,
        'OFFLINE LIMITATION: ROUTE GEOMETRY UNAVAILABLE FOR PREVIEW',
      );
      return;
    }

    await previewRoadRoute(cachedRoadRoute, 'offline_sync_open');
    showToast('OFFLINE ROUTE PREVIEW LOADED FROM CACHE');
  }, [
    clearExploreNavigationPayload,
    closeTopPopup,
    focusOfflineCacheBounds,
    handleGpsRetry,
    liveNavigateServicesEnabled,
    roadNavigationCurrentLocation,
    previewRoadDestination,
    previewRoadRoute,
    showToast,
    endTrailNavigation,
  ]);

  const handleTiltAlertTap = useCallback((markerId: string) => {
    hapticMicro();
    const cluster = tiltAlertClusters.find((item: any) =>
      Array.isArray(item?.events) && item.events.some((event: TiltAlertEvent) => event.id === markerId),
    );
    if (cluster) {
      setTiltAlertDetailCluster(cluster);
      setTiltAlertDetailEvent(null);
      setTiltAlertDetailVisible(true);
      return;
    }
    const marker = tiltAlertMarkers.find((item) => item.id === markerId);
    if (!marker) return;
    setTiltAlertDetailCluster(null);
    setTiltAlertDetailEvent({
      id: marker.id,
      severity: marker.severity,
      axis: marker.axis as any,
      angleDeg: marker.angleDeg,
      thresholdDeg: marker.thresholdDeg,
      timestamp: marker.timestamp,
      latitude: marker.lat,
      longitude: marker.lng,
    } as TiltAlertEvent);
    setTiltAlertDetailVisible(true);
  }, [tiltAlertClusters, tiltAlertMarkers]);

  const applyExploreNavigationPayload = useCallback(
    async (payload: NavigationHandoffPayload) => {
      const activeRouteSnapshot = navigateRouteSessionStore.getSnapshot();
      if (isNavigationHandoffForActiveGuidance(payload, activeRouteSnapshot)) {
        return;
      }
      if (shouldProtectActiveGuidanceFromHandoff(payload, activeRouteSnapshot)) {
        showToast('ACTIVE GUIDANCE PROTECTED - END NAVIGATION BEFORE PREVIEWING A NEW ROUTE');
        lastPersistedNavigationPayloadRef.current = null;
        await clearNavigationHandoffPayload();
        return;
      }
      if (hasActiveGuidanceReplacementConfirmation(payload) && activeRouteSnapshot.lifecycle === 'active') {
        clearActiveRunSelection();
        await endTrailNavigation();
        await endRoadNavigation();
        navigateRouteSessionStore.clear();
      }

      clearOwnedCampsiteCandidates('route_handoff_applied', { clearRoute: true });
      const tripMode = classifyNavigationHandoff(payload);
      const stampedPayload: NavigationHandoffPayload = {
        ...payload,
        createdAt: payload.createdAt ?? new Date().toISOString(),
      };
      const payloadKey = `${stampedPayload.id}:${stampedPayload.createdAt}`;
      appliedNavigationPayloadRef.current = payloadKey;
      setExploreNavigationPayloadIfChanged(stampedPayload);
      if (lastPersistedNavigationPayloadRef.current !== payloadKey) {
        lastPersistedNavigationPayloadRef.current = payloadKey;
        await saveNavigationHandoffPayload(stampedPayload);
      }

      const usesStoredRouteGeometry =
        stampedPayload.requiresOnlineRouting === false &&
          stampedPayload.trailGeometry.length > 1;
      const roadDestination = toRoadDestinationFromHandoff(stampedPayload);
      const shouldFocusExploreRouteCamps =
        getExplorePayloadAction(stampedPayload) === 'view_camps' &&
        (stampedPayload.campMarkers?.length ?? 0) > 0;
      if (isRecoveryAssistNavigationPayload(stampedPayload)) {
        void endTrailNavigation();
      }
      if (shouldFocusExploreRouteCamps && fitMapToExploreRouteCamps(stampedPayload)) {
        if (usesStoredRouteGeometry || !roadDestination || tripMode === 'trail') {
          await clearRoadDestination();
        }
        return;
      }
      if (usesStoredRouteGeometry || !roadDestination || tripMode === 'trail') {
        await clearRoadDestination();
        const fallbackCoordinate =
          stampedPayload.coordinate ??
          stampedPayload.trailheadCoordinate ??
          (stampedPayload.trailGeometry.length > 0
            ? stampedPayload.trailGeometry[stampedPayload.trailGeometry.length - 1]
            : null);
        fitMapToCoordinatePreview(fallbackCoordinate, 84, 'trail_preview');
        return;
      }

      await previewRoadDestination(roadDestination, 'explore_handoff');
    },
    [
      clearActiveRunSelection,
      clearOwnedCampsiteCandidates,
      clearRoadDestination,
      endRoadNavigation,
      fitMapToCoordinatePreview,
      fitMapToExploreRouteCamps,
      endTrailNavigation,
      isRecoveryAssistNavigationPayload,
      previewRoadDestination,
      setExploreNavigationPayloadIfChanged,
      showToast,
    ],
  );

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      const restoreTimer = setTimeout(() => {
        void (async () => {
          const flow = await consumeNavigationFlow('navigate');
          if (flow?.intent === 'prepare_offline_route_package') {
            setPendingOfflineRoutePackageFlowId(flow.id);
            showToast(flow.message ?? 'OPENING ROUTE OFFLINE PACKAGE');
            return;
          }

          const payload = await loadNavigationHandoffPayload();
          if (cancelled || !isRestorableNavigationHandoffPayload(payload)) return;

          const payloadKey = `${payload.id}:${payload.createdAt ?? 'pending'}`;
          if (appliedNavigationPayloadRef.current === payloadKey) return;

          await applyExploreNavigationPayload(payload);
          if (cancelled) return;

          if (shouldAutoStartNavigationPayload(payload, flow)) {
            pendingAutoStartRouteIdRef.current = payload.id;
            setFollowUser(true);
            showToast(
              isRecoveryAssistNavigationPayload(payload)
                ? 'RECOVERY ASSIST ROUTE STARTING'
                : 'ROUTE GUIDANCE STARTING',
            );
            return;
          }

          if (!flow || flow.target === 'navigate') return;
        })();
      }, NAVIGATION_HANDOFF_RESTORE_DELAY_MS);

      return () => {
        cancelled = true;
        clearTimeout(restoreTimer);
      };
    }, [applyExploreNavigationPayload, isRecoveryAssistNavigationPayload, shouldAutoStartNavigationPayload, showToast]),
  );

  useEffect(() => {
    const snapshot = navigateRouteSessionStore.getSnapshot();
    if (
      !activeRun ||
      snapshot.lifecycle !== 'active' ||
      snapshot.source !== 'run' ||
      snapshot.routeId !== activeRun.id
    ) {
      return;
    }

    const startKey = `${activeRun.id}:${snapshot.updatedAt ?? 'pending'}`;
    if (appliedRunNavigationStartRef.current === startKey) return;

    const payload = buildNavigationPayloadFromRun(activeRun);
    if (!payload) return;

    appliedRunNavigationStartRef.current = startKey;
    pendingAutoStartRouteIdRef.current = payload.id;
    setFollowUser(true);
    void applyExploreNavigationPayload(payload);
  }, [activeRun, applyExploreNavigationPayload]);

  useEffect(() => {
    let mounted = true;
    void (async () => {
      try {
        const raw = await navigatePreferenceStorage.read(CAMPSITE_DRAWINGS_STORAGE_KEY);
        if (!raw || !mounted) return;
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return;
        setSavedCampsiteDrawings(
          parsed
            .filter((drawing: any) => {
              const coordinates = Array.isArray(drawing?.coordinates)
                ? drawing.coordinates
                : drawing?.polygonCoordinates;
              return Array.isArray(coordinates) && coordinates.length >= 3;
            })
            .map((drawing: any) => {
              const rawCoordinates = Array.isArray(drawing.coordinates)
                ? drawing.coordinates
                : drawing.polygonCoordinates;
              const coordinates = rawCoordinates
                .map((point: any) => ({
                  latitude: Number(point.latitude),
                  longitude: Number(point.longitude),
                }))
                .filter((point: CampsiteSearchPolygonPoint) =>
                  Number.isFinite(point.latitude) && Number.isFinite(point.longitude),
                );
              const createdAt = String(drawing.createdAt ?? drawing.savedAt ?? new Date().toISOString());
              const savedAt = String(drawing.savedAt ?? createdAt);
              const center =
                drawing.centerCoordinate &&
                Number.isFinite(Number(drawing.centerCoordinate.latitude)) &&
                Number.isFinite(Number(drawing.centerCoordinate.longitude))
                  ? {
                      latitude: Number(drawing.centerCoordinate.latitude),
                      longitude: Number(drawing.centerCoordinate.longitude),
                    }
                  : getCampsiteDrawingCenter(coordinates);
              const normalizedDrawing: SavedCampsiteSearchDrawing = {
                id: String(drawing.id ?? createCampsiteDrawingId(coordinates)),
                name: String(drawing.name ?? 'Saved Campsite Area'),
                coordinates,
                polygonCoordinates: coordinates,
                centerCoordinate: center,
                campsiteCandidateIds: Array.isArray(drawing.campsiteCandidateIds)
                  ? drawing.campsiteCandidateIds.map((id: any) => String(id))
                  : [],
                campsiteCandidates: Array.isArray(drawing.campsiteCandidates)
                  ? drawing.campsiteCandidates
                  : [],
                source: 'user_polygon',
                createdAt,
                savedAt,
              };
              return normalizedDrawing;
            })
            .filter((drawing: SavedCampsiteSearchDrawing) => drawing.coordinates.length >= 3),
        );
      } catch {}
    })();
    return () => {
      mounted = false;
    };
  }, []);

  // Route overview and completed polygon drawing are the only intentional campsite
  // marker population paths. This subscription mirrors centralized locator
  // publications without starting analysis from passive route/map state changes.
  useEffect(() => {
    const unsub = campsiteCandidateEngine.subscribe((result) => {
      applyCampsiteCandidates(result);
    });
    return unsub;
  }, [applyCampsiteCandidates]);

  useEffect(() => {
    return () => {
      cancelPendingRouteCampsiteClear();
    };
  }, [cancelPendingRouteCampsiteClear]);

  useEffect(() => {
    const sync = () => {
      applyRemotenessIndex(remotenessStore.getIndex());
    };
    sync();
    const unsubscribe = remotenessStore.subscribe(sync);
    return unsubscribe;
  }, [applyRemotenessIndex]);





  // -- Pin markers for map --------------------------------
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

  // -- Category-filtered pins + markers -----------
  const categoryFilteredPins = useMemo(() => {
    if (activePinTypeFilters.length === 0) return safeArray(allPins);
    return allPins.filter(pin => activePinTypeFilters.includes(pin.type));
  }, [allPins, activePinTypeFilters]);

  const filteredPinMarkers = useMemo(() => {
    if (activePinTypeFilters.length === 0) return safeArray(pinMarkers);
    return pinMarkers.filter(pm => activePinTypeFilters.includes(pm.type as PinType));
  }, [pinMarkers, activePinTypeFilters]);

  // -- Pin CRUD handlers -------------------------
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

const openRecommendCampsiteChooser = useCallback(() => {
  hapticCommand();
  setRecommendCampsiteDropMode(false);
  setPinDropMode(false);
  setShowCrosshair(false);
  setRecommendCampsiteLocation(null);
  setRecommendCampsiteGpxImport(null);
  setRecommendCampsiteGpxUploadMode(false);
  setRecommendCampsiteGpxMapSelection(null);
  setRecommendCampsiteImportError(null);
  openTopPopup('recommendCampsite');
  setToolsMenuOpen(true);
}, [openTopPopup]);

const handleRecommendCampsiteUseCurrentLocation = useCallback(() => {
  hapticCommand();
  const currentLocation = latestGpsMapLocation ?? userLocation;
  if (!currentLocation) {
    handleGpsRetry();
    setRecommendCampsiteDropMode(false);
    setPinDropMode(false);
    openTopPopup('recommendCampsite');
    showToast(
      gps.permissionDenied
        ? 'LOCATION UNAVAILABLE: USE DROP A PIN'
        : 'WAITING FOR GPS: USE DROP A PIN IF NEEDED',
    );
    return;
  }

  setRecommendCampsiteDropMode(false);
  setPinDropMode(false);
  setShowCrosshair(false);
  setRecommendCampsiteGpxImport(null);
  setRecommendCampsiteGpxUploadMode(false);
  setRecommendCampsiteGpxMapSelection(null);
  setRecommendCampsiteImportError(null);
  setRecommendCampsiteLocation({
    latitude: currentLocation.lat,
    longitude: currentLocation.lng,
    source_type: 'current_location',
    location_accuracy_m:
      gps.rawGPS.position?.accuracyM ??
      gps.position?.accuracyM ??
      roadNavLocationMeta.accuracyM ??
      null,
  });
  openTopPopup('recommendCampsite');
}, [
  gps.permissionDenied,
  gps.position?.accuracyM,
  gps.rawGPS.position?.accuracyM,
  handleGpsRetry,
  latestGpsMapLocation,
  openTopPopup,
  roadNavLocationMeta.accuracyM,
  showToast,
  userLocation,
]);

const handleRecommendCampsiteDropPin = useCallback(() => {
  hapticCommand();
  closeTopPopup();
  setRecommendCampsiteLocation(null);
  setRecommendCampsiteGpxImport(null);
  setRecommendCampsiteGpxUploadMode(false);
  setRecommendCampsiteGpxMapSelection(null);
  setRecommendCampsiteImportError(null);
  setRecommendCampsiteDropMode(true);
  setRecommendCampsiteDropSource('pin_drop');
  setPinDropMode(false);
  setShowCrosshair(false);
  showToast('TAP MAP TO RECOMMEND CAMPSITE');
}, [closeTopPopup, showToast]);

const handleRecommendCampsiteDropRoutePoint = useCallback((input: {
  candidateType: 'route_selected_point' | 'track_selected_point';
  sourceRouteName?: string | null;
  sourceTrackName?: string | null;
  sourceSegmentIndex?: number | null;
}) => {
  hapticCommand();
  const importId = recommendCampsiteGpxImport?.importId;
  if (!importId) {
    setRecommendCampsiteImportError('GPX import record is unavailable. Choose the GPX file again before selecting a route or track point.');
    showToast('GPX IMPORT RECORD UNAVAILABLE');
    return;
  }
  closeTopPopup();
  setRecommendCampsiteLocation(null);
  setRecommendCampsiteGpxUploadMode(false);
  setRecommendCampsiteImportError(null);
  setRecommendCampsiteGpxMapSelection({
    importId,
    candidateType: input.candidateType,
    sourceRouteName: input.sourceRouteName ?? null,
    sourceTrackName: input.sourceTrackName ?? null,
    sourceSegmentIndex: input.sourceSegmentIndex ?? null,
  });
  setRecommendCampsiteDropMode(true);
  setRecommendCampsiteDropSource(
    input.candidateType === 'track_selected_point' ? 'gpx_track_selected_point' : 'gpx_route',
  );
  setPinDropMode(false);
  setShowCrosshair(false);
  showToast('TAP MAP TO CREATE PRIVATE GPX CAMPSITE CANDIDATE');
}, [closeTopPopup, recommendCampsiteGpxImport?.importId, showToast]);

const handleRecommendCampsiteImportRoute = useCallback(() => {
  hapticMicro();
  if (!gpxCampsiteImportEnabled) {
    setRecommendCampsiteImportError('GPX campsite import is coming soon.');
    openTopPopup('recommendCampsite');
    showToast('GPX CAMPSITE IMPORT COMING SOON');
    return;
  }

  setRecommendCampsiteGpxUploadMode(true);
  setRecommendCampsiteGpxImport(null);
  setRecommendCampsiteGpxMapSelection(null);
  setRecommendCampsiteLocation(null);
  setRecommendCampsiteImportError(null);
  openTopPopup('recommendCampsite');
}, [gpxCampsiteImportEnabled, openTopPopup, showToast]);

const handleRecommendCampsiteChooseGpxFile = useCallback(async () => {
  hapticMicro();
  if (!gpxCampsiteImportEnabled) {
    setRecommendCampsiteImportError('GPX campsite import is coming soon.');
    showToast('GPX CAMPSITE IMPORT COMING SOON');
    return;
  }

  setRecommendCampsiteImporting(true);
  setRecommendCampsiteImportError(null);
  setRecommendCampsiteLocation(null);

  const handleContent = async (
    content: string,
    fileName: string,
    sizeBytes?: number | null,
    contentType?: string | null,
  ) => {
    const validation = validateGpxCampsiteImportFile(fileName, sizeBytes, contentType);
    if (!validation.ok) {
      setRecommendCampsiteImportError(validation.error);
      showToast('GPX IMPORT FAILED');
      return;
    }

    const result = await submitGpxImportOfflineSafe({
      name: fileName,
      size: sizeBytes,
      type: contentType,
      content,
    });
    if (!result.ok) {
      setRecommendCampsiteImportError(result.error);
      showToast('GPX IMPORT FAILED');
      return;
    }

    if (result.mode === 'queued') {
      if (result.importItem.parsed_import) {
        setRecommendCampsiteGpxImport(result.importItem.parsed_import);
        setRecommendCampsiteGpxUploadMode(false);
        openTopPopup('recommendCampsite');
        showToast('GPX PARSED LOCALLY: WAITING TO SYNC');
        return;
      }
      setRecommendCampsiteImportError('GPX saved locally. It will upload for parsing when connection returns.');
      showToast('GPX SAVED LOCALLY');
      return;
    }

    const imported = gpxUploadResultToCampsiteImportResult(result.result);
    setRecommendCampsiteGpxImport(imported);
    setRecommendCampsiteGpxUploadMode(false);
    openTopPopup('recommendCampsite');
    showToast(
      imported.candidates.length > 0
        ? `GPX WAYPOINTS READY: ${imported.candidates.length}`
        : 'GPX IMPORTED: NO WAYPOINT CANDIDATES',
    );
  };

  try {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.gpx,application/gpx+xml,text/xml,application/xml';

      input.onchange = async (event: any) => {
        const file = event.target?.files?.[0];
        if (!file) {
          setRecommendCampsiteImporting(false);
          return;
        }
        try {
          const text = await file.text();
          await handleContent(text, file.name || 'imported.gpx', file.size, file.type);
        } catch (error: any) {
          setRecommendCampsiteImportError(error?.message ?? 'Could not read GPX file.');
          showToast('GPX IMPORT FAILED');
        } finally {
          setRecommendCampsiteImporting(false);
        }
      };

      (input as any).oncancel = () => {
        setRecommendCampsiteImporting(false);
      };

      input.click();
      return;
    }

    const DocumentPicker = await import('expo-document-picker');
    const result = await DocumentPicker.getDocumentAsync({
      type: ['application/gpx+xml', 'text/xml', 'application/xml', 'text/plain', '*/*'],
      copyToCacheDirectory: true,
      multiple: false,
    });

    if (result.canceled || !result.assets || result.assets.length === 0) {
      setRecommendCampsiteImporting(false);
      return;
    }

    const asset = result.assets[0];
    const fileName = asset.name || 'imported.gpx';
    const assetContentType = (asset as any).mimeType ?? null;
    const validation = validateGpxCampsiteImportFile(fileName, asset.size ?? null, assetContentType);
    if (!validation.ok) {
      setRecommendCampsiteImportError(validation.error);
      setRecommendCampsiteImporting(false);
      showToast('GPX IMPORT FAILED');
      return;
    }

    const fileUri = asset.uri;
    if (!fileUri) {
      setRecommendCampsiteImportError('Could not read GPX file location.');
      setRecommendCampsiteImporting(false);
      showToast('GPX IMPORT FAILED');
      return;
    }

    const content = await fsReadFileFromPickerUri(fileUri);
    if (!content) {
      setRecommendCampsiteImportError('Could not read GPX file content.');
      setRecommendCampsiteImporting(false);
      showToast('GPX IMPORT FAILED');
      return;
    }

    await handleContent(content, fileName, asset.size ?? null, assetContentType);
    setRecommendCampsiteImporting(false);
  } catch (error: any) {
    setRecommendCampsiteImportError(error?.message ?? 'File picker unavailable.');
    setRecommendCampsiteImporting(false);
    showToast('GPX IMPORT FAILED');
  }
}, [gpxCampsiteImportEnabled, openTopPopup, showToast]);

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
    if (roadStepListExpanded) {
      setRoadStepListExpanded(false);
    }
    closeTopPopup();
    setSelectedDroppedPinId(null);
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
    setCampIntelComparisonVisible(false);
    setSelectedCampIntelId(null);
    setSelectedCampScoutCandidateId(null);
    setSelectedCampOpsEndpointId(null);
    setSelectedCommunityCampSiteId(null);
    setSelectedScopedCampsite(null);
    setSelectedGroupCampsiteShareId(null);
    setSelectedDispersedCampingRegion(null);
    setSelectedEstablishedCampsite(null);
    setEditingPin(null);
    setDropCoords(null);
    setSelectedDroppedPinId(pin.id);
  }
}, [closeTopPopup, roadStepListExpanded, setRoadStepListExpanded]);

  const handleCampIntelTap = useCallback((payload: any) => {
    hapticMicro();
    if (roadStepListExpanded) {
      setRoadStepListExpanded(false);
    }
    closeTopPopup();
    setSelectedDroppedPinId(null);
    if (payload?.markerKind === 'community_campsite' || payload?.communityCampSiteId) {
      setCampIntelComparisonVisible(false);
      setSelectedCampIntelId(null);
      setSelectedScopedCampsite(null);
      setSelectedGroupCampsiteShareId(null);
      setSelectedCommunityCampSiteId(
        typeof payload?.communityCampSiteId === 'string'
          ? payload.communityCampSiteId
          : null,
      );
      return;
    }
    if (
      payload?.markerKind === 'private_campsite' ||
      payload?.markerKind === 'pending_campsite' ||
      payload?.markerKind === 'reviewer_pending_campsite'
    ) {
      setCampIntelComparisonVisible(false);
      setSelectedCampIntelId(null);
      setSelectedCommunityCampSiteId(null);
      setSelectedGroupCampsiteShareId(null);
      setSelectedScopedCampsite(
        typeof payload?.reportId === 'string'
          ? {
              reportId: payload.reportId,
              scope:
                payload.markerKind === 'private_campsite'
                  ? 'private'
                  : payload.markerKind === 'reviewer_pending_campsite'
                    ? 'reviewer_pending'
                    : 'pending',
            }
          : null,
      );
      return;
    }
    if (payload?.markerKind === 'group_campsite') {
      setCampIntelComparisonVisible(false);
      setSelectedCampIntelId(null);
      setSelectedCommunityCampSiteId(null);
      setSelectedScopedCampsite(null);
      setSelectedGroupCampsiteShareId(typeof payload?.groupShareId === 'string' ? payload.groupShareId : null);
      return;
    }
    setSelectedCommunityCampSiteId(null);
    setSelectedScopedCampsite(null);
    setSelectedGroupCampsiteShareId(null);
    setCampIntelComparisonVisible(false);
    setSelectedCampIntelId(typeof payload?.id === 'string' ? payload.id : null);
  }, [closeTopPopup, roadStepListExpanded, setRoadStepListExpanded, setSelectedCampIntelId]);

  const handleCampScoutTap = useCallback((payload: any) => {
    hapticMicro();
    if (roadStepListExpanded) {
      setRoadStepListExpanded(false);
    }
    closeTopPopup();
    setCampIntelComparisonVisible(false);
    setSelectedCampIntelId(null);
    setSelectedCommunityCampSiteId(null);
    setSelectedScopedCampsite(null);
    setSelectedGroupCampsiteShareId(null);
    setSelectedDispersedCampingRegion(null);
    setSelectedEstablishedCampsite(null);
    if (isCampOpsMapPinPayload(payload)) {
      const endpointId = payload.campOpsCandidateId;
      setSelectedCampScoutCandidateId(null);
      setSelectedCampOpsEndpointId(endpointId);
      showToast(`${payload.campOpsRoleLabel.toUpperCase()}: ${String(payload.title).toUpperCase()}`);
      return;
    }
    setSelectedCampOpsEndpointId(null);
    setSelectedCampScoutCandidateId(typeof payload?.id === 'string' ? payload.id : null);
  }, [closeTopPopup, roadStepListExpanded, setRoadStepListExpanded, showToast]);

  const handleCampIntelDismiss = useCallback(() => {
    hapticMicro();
    setCampIntelComparisonVisible(false);
    setSelectedCampIntelId(null);
  }, []);

  const previewCampsiteDestination = useCallback(async (input: {
    actionId: string;
    title: string;
    subtitle: string;
    latitude: number;
    longitude: number;
    raw: Record<string, unknown>;
    restoreSelection?: () => void;
  }) => {
    const activeRoadSession =
      roadSession.status === 'navigation_active' ||
      roadSession.status === 'rerouting' ||
      roadSession.status === 'arrived';
    const activeTrailSession =
      trailNavigationUiMode === 'active' || trailNavigationUiMode === 'arrived';
    if (activeRoadSession || activeTrailSession) {
      showToast('END ACTIVE NAVIGATION TO ROUTE TO CAMPSITE');
      return;
    }

    const actionKey = `navigate:${input.actionId}`;
    if (campIntelActionLocksRef.current.has(actionKey)) {
      showToast('ROUTE PREVIEW ALREADY STARTING');
      return;
    }
    campIntelActionLocksRef.current.add(actionKey);

    hapticCommand();
    setCampIntelComparisonVisible(false);
    try {
      clearActiveRunSelection();
      void clearExploreNavigationPayload();
      if (trailNavigationUiMode !== 'idle') {
        void endTrailNavigation();
      }
      closeTopPopup();
      setSelectedCampIntelId(null);
      setSelectedCommunityCampSiteId(null);
      setSelectedScopedCampsite(null);
      setSelectedGroupCampsiteShareId(null);

      const campCoordinate = {
        lat: input.latitude,
        lng: input.longitude,
      };

      fitMapToCoordinatePreview(campCoordinate, 92, 'camp_intel_focus');

      await previewRoadDestination(
        {
          id: input.actionId,
          title: input.title,
          subtitle: input.subtitle,
          coordinate: campCoordinate,
          sourceType: 'manual_selection',
          raw: input.raw,
        },
        'manual_selection',
      );

      showToast(`ROUTE PREVIEW STARTED: ${input.title.toUpperCase()}`);
    } catch (error) {
      input.restoreSelection?.();
      showToast('ROUTE PREVIEW UNAVAILABLE');
    } finally {
      campIntelActionLocksRef.current.delete(actionKey);
    }
  }, [
    clearActiveRunSelection,
    clearExploreNavigationPayload,
    closeTopPopup,
    endTrailNavigation,
    fitMapToCoordinatePreview,
    previewRoadDestination,
    roadSession.status,
    showToast,
    trailNavigationUiMode,
  ]);

  const handleCampIntelNavigateHere = useCallback(async () => {
    if (!selectedCampIntel) return;
    const activeRoadSession =
      roadSession.status === 'navigation_active' ||
      roadSession.status === 'rerouting' ||
      roadSession.status === 'arrived';
    const activeTrailSession =
      trailNavigationUiMode === 'active' || trailNavigationUiMode === 'arrived';
    if (activeRoadSession || activeTrailSession) {
      showToast('END ACTIVE NAVIGATION TO ROUTE TO CAMPSITE');
      return;
    }
    const actionKey = `navigate:${selectedCampIntel.id}`;
    if (campIntelActionLocksRef.current.has(actionKey)) {
      showToast('ROUTE PREVIEW ALREADY STARTING');
      return;
    }
    campIntelActionLocksRef.current.add(actionKey);

    hapticCommand();
    setCampIntelComparisonVisible(false);
    try {
      clearActiveRunSelection();
      void clearExploreNavigationPayload();
      void endTrailNavigation();
      closeTopPopup();
      setSelectedCampIntelId(null);

      const campCoordinate = {
        lat: selectedCampIntel.coordinate.latitude,
        lng: selectedCampIntel.coordinate.longitude,
      };

      fitMapToCoordinatePreview(campCoordinate, 92, 'camp_intel_focus');

      await previewRoadDestination(
        {
          id: `camp-intel-${selectedCampIntel.id}`,
          title: selectedCampIntel.label,
        subtitle: `${selectedCampIntel.categoryLabel} | ${selectedCampIntel.quickVerdict}`,
          coordinate: campCoordinate,
          sourceType: 'manual_selection',
          raw: { campIntelId: selectedCampIntel.id, sourceRouteId: selectedCampIntel.sourceRouteId },
        },
        'manual_selection',
      );

      showToast(`ROUTE PREVIEW STARTED: ${selectedCampIntel.label.toUpperCase()}`);
    } catch (error) {
      setSelectedCampIntelId(selectedCampIntel.id);
      showToast('ROUTE PREVIEW UNAVAILABLE');
    } finally {
      campIntelActionLocksRef.current.delete(actionKey);
    }
  }, [
    clearActiveRunSelection,
    clearExploreNavigationPayload,
    closeTopPopup,
    endTrailNavigation,
    fitMapToCoordinatePreview,
    previewRoadDestination,
    roadSession.status,
    selectedCampIntel,
    showToast,
    trailNavigationUiMode,
  ]);

  const handleCampIntelSave = useCallback(() => {
    if (!selectedCampIntel) return;
    hapticMicro();
    const savedNow = campIntel.saveCamp(selectedCampIntel.id);
    showToast(savedNow ? 'CAMP SAVED' : 'CAMP ALREADY SAVED');
  }, [campIntel, selectedCampIntel, showToast]);

  const handleCampIntelMarkUsed = useCallback(() => {
    if (!selectedCampIntel) return;
    hapticMicro();
    const markedNow = campIntel.markCampUsed(selectedCampIntel.id);
    showToast(markedNow ? 'CAMP LOGGED AS USED' : 'CAMP ALREADY LOGGED');
  }, [campIntel, selectedCampIntel, showToast]);

  const handleCampIntelReportUnusable = useCallback(() => {
    if (!selectedCampIntel) return;
    hapticCommand();
    const reportedNow = campIntel.reportCampUnusable(selectedCampIntel.id);
    setCampIntelComparisonVisible(false);
    setSelectedCampIntelId(null);
    showToast(reportedNow ? 'CAMP REPORTED UNUSABLE' : 'CAMP ALREADY REPORTED');
  }, [campIntel, selectedCampIntel, showToast]);

  const handleCampScoutDismiss = useCallback(() => {
    hapticMicro();
    setSelectedCampScoutCandidateId(null);
  }, []);

  const campScoutNavigateSafe =
    !!selectedCampScoutCandidate &&
    selectedCampScoutCandidate.accessConfidence >= 65 &&
    selectedCampScoutCandidate.legalityConfidence >= 65;

  const handleCampScoutNavigateHere = useCallback(async () => {
    if (!selectedCampScoutCandidate || !campScoutNavigateSafe) return;
    const activeRoadSession =
      roadSession.status === 'navigation_active' ||
      roadSession.status === 'rerouting' ||
      roadSession.status === 'arrived';
    if (activeRoadSession) {
      showToast('END ACTIVE NAVIGATION BEFORE PREVIEW');
      return;
    }

    try {
      const coordinate = {
        lat: selectedCampScoutCandidate.coordinate.latitude,
        lng: selectedCampScoutCandidate.coordinate.longitude,
      };
      fitMapToCoordinatePreview(coordinate, 92, 'camp_scout_focus');
      await previewRoadDestination(
        {
          id: `camp-scout-${selectedCampScoutCandidate.id}`,
          title: selectedCampScoutCandidate.title,
          subtitle: `Camp Scout ${selectedCampScoutCandidate.confidenceGrade} - ${selectedCampScoutCandidate.confidenceScore}/100`,
          coordinate,
          sourceType: 'manual_selection',
          raw: { campScoutCandidateId: selectedCampScoutCandidate.id },
        },
        'manual_selection',
      );
      showToast(`ROUTE PREVIEW STARTED: ${selectedCampScoutCandidate.title.toUpperCase()}`);
    } catch {
      showToast('ROUTE PREVIEW UNAVAILABLE');
    }
  }, [
    campScoutNavigateSafe,
    fitMapToCoordinatePreview,
    previewRoadDestination,
    roadSession.status,
    selectedCampScoutCandidate,
    showToast,
  ]);

  const handleCampScoutSaveCandidate = useCallback(() => {
    if (!selectedCampScoutCandidate) return;
    hapticMicro();
    const savedPin = pinStore.create({
      type: 'camp',
      lat: selectedCampScoutCandidate.coordinate.latitude,
      lng: selectedCampScoutCandidate.coordinate.longitude,
      title: selectedCampScoutCandidate.title,
      notes: [
        `Camp Scout ${selectedCampScoutCandidate.confidenceGrade} candidate`,
        `Source: ${selectedCampScoutCandidate.sourceType}`,
        `Access: ${selectedCampScoutCandidate.accessConfidence}/100`,
        `Remoteness: ${selectedCampScoutCandidate.remotenessScore}/100`,
      ].join('\n'),
      expedition_id: activeExpeditionId,
      created_by: user?.email || 'local',
    });
    loadPins();
    showToast(`CAMP SCOUT CANDIDATE SAVED: ${savedPin.title}`);
  }, [activeExpeditionId, loadPins, selectedCampScoutCandidate, showToast, user]);

  const handleCampScoutReportNotViable = useCallback(() => {
    if (!selectedCampScoutCandidate) return;
    hapticCommand();
    setSelectedCampScoutCandidateId(null);
    showToast('CAMP SCOUT FEEDBACK RECORDED');
  }, [selectedCampScoutCandidate, showToast]);

  const handleCampOpsDismiss = useCallback(() => {
    hapticMicro();
    setCampIntelComparisonVisible(false);
    setSelectedCampOpsEndpointId(null);
    setSelectedCampIntelId(null);
  }, []);

  const handleCampOpsNavigateHere = useCallback(async () => {
    if (!selectedCampOpsIntel) return;
    await previewCampsiteDestination({
      actionId: `campops-${selectedCampOpsIntel.candidateId}`,
      title: selectedCampOpsIntel.campName,
      subtitle: `${selectedCampOpsIntel.statusLabel} - ${selectedCampOpsIntel.overallScore}`,
      latitude: selectedCampOpsIntel.latitude,
      longitude: selectedCampOpsIntel.longitude,
      raw: {
        campOpsCandidateId: selectedCampOpsIntel.candidateId,
        source: 'campops_route_candidate',
        sourceConfidence: selectedCampOpsIntel.sourceConfidence,
      },
      restoreSelection: () => setSelectedCampOpsEndpointId(selectedCampOpsIntel.candidateId),
    });
  }, [previewCampsiteDestination, selectedCampOpsIntel]);

  const handleCampOpsSaveCandidate = useCallback(() => {
    if (!selectedCampOpsIntel) return;
    hapticMicro();
    const savedPin = pinStore.create({
      type: 'camp',
      lat: selectedCampOpsIntel.latitude,
      lng: selectedCampOpsIntel.longitude,
      title: selectedCampOpsIntel.campName,
      notes: [
        `${selectedCampOpsIntel.title} - ${selectedCampOpsIntel.statusLabel}`,
        `Overall suitability: ${selectedCampOpsIntel.overallScore}`,
        selectedCampOpsIntel.sourceConfidence,
        'Access and legal/source status need field verification before committing.',
      ].join('\n'),
      expedition_id: activeExpeditionId,
      created_by: user?.email || 'local',
    });
    loadPins();
    showToast(`CAMP SAVED: ${savedPin.title}`);
  }, [activeExpeditionId, loadPins, selectedCampOpsIntel, showToast, user]);

  const handleCampOpsCompareNearby = useCallback(() => {
    if (!selectedCampOpsIntel || !campOpsRecommendationSet) return;
    const nearbyCount = (campOpsRecommendationSet.rankedCandidates ?? []).filter(
      (candidate) => candidate.id !== selectedCampOpsIntel.candidateId,
    ).length;
    if (nearbyCount === 0) {
      showToast('NO NEARBY CAMPOPS CANDIDATES TO COMPARE');
      return;
    }
    hapticMicro();
    showToast(`COMPARE NEARBY READY: ${Math.min(nearbyCount, 4)} OTHER CAMPS`);
  }, [campOpsRecommendationSet, selectedCampOpsIntel, showToast]);

  const handleCampOpsMarkUsed = useCallback(() => {
    if (!selectedCampOpsIntel) return;
    hapticMicro();
    const alreadyUsed = campOpsLocalUsedRef.current.has(selectedCampOpsIntel.candidateId);
    campOpsLocalUsedRef.current.add(selectedCampOpsIntel.candidateId);
    showToast(alreadyUsed ? 'CAMPOPS CAMP ALREADY MARKED USED' : 'CAMPOPS CAMP MARKED USED');
  }, [selectedCampOpsIntel, showToast]);

  const handleCampOpsReportUnusable = useCallback(() => {
    if (!selectedCampOpsIntel) return;
    hapticCommand();
    const report = {
      id: `campops-report-${selectedCampOpsIntel.candidateId}`,
      candidateId: selectedCampOpsIntel.candidateId,
      createdAt: new Date().toISOString(),
      reportType: 'unusable' as const,
      source: 'local_placeholder' as const,
    };
    const alreadyReported = !!campOpsLocalReportsRef.current[selectedCampOpsIntel.candidateId];
    campOpsLocalReportsRef.current[selectedCampOpsIntel.candidateId] = report;
    setCampIntelComparisonVisible(false);
    setSelectedCampOpsEndpointId(null);
    setSelectedCampIntelId(null);
    showToast(alreadyReported ? 'CAMPOPS REPORT ALREADY RECORDED' : 'CAMPOPS UNUSABLE REPORT RECORDED');
  }, [selectedCampOpsIntel, showToast]);

  const handleCommunityCampsiteDismiss = useCallback(() => {
    hapticMicro();
    setSelectedCommunityCampSiteId(null);
  }, []);

  const handleScopedCampsiteDismiss = useCallback(() => {
    hapticMicro();
    setSelectedScopedCampsite(null);
  }, []);

  const handleScopedCampsiteEdit = useCallback(() => {
    showToast('Campsite edit opens from your saved campsite list.');
  }, [showToast]);

  const handleScopedCampsiteDelete = useCallback(() => {
    showToast('Delete is available from your private campsite list.');
  }, [showToast]);

  const handleScopedCampsiteShare = useCallback(() => {
    showToast('Group sharing is available from the campsite detail workflow.');
  }, [showToast]);

  const handleScopedCampsiteSubmitToCommunity = useCallback(() => {
    showToast('Community submission requires stewardship review from the campsite form.');
  }, [showToast]);

  const handleScopedCampsiteWithdraw = useCallback(() => {
    showToast('Withdraw is available from your pending campsite submission.');
  }, [showToast]);

  const handleScopedCampsiteOpenReview = useCallback(() => {
    showToast('Opening Community Campsite Review from reviewer tools.');
  }, [showToast]);

  const handleGroupCampsiteDismiss = useCallback(() => {
    hapticMicro();
    setSelectedGroupCampsiteShareId(null);
  }, []);

  const handleGroupCampsiteOpenGroup = useCallback(() => {
    showToast('Open group campsites from the group detail screen.');
  }, [showToast]);

  const handleGroupCampsiteRemoveShare = useCallback(() => {
    showToast('Group admins can remove shares from the group detail screen.');
  }, [showToast]);

  const handleCommunityCampsiteNavigateHere = useCallback(async () => {
    if (!selectedCommunityCampSite) return;
    await previewCampsiteDestination({
      actionId: `community-campsite-${selectedCommunityCampSite.id}`,
      title: selectedCommunityCampSite.canonical_name ?? 'Community Campsite',
      subtitle: `Community campsite - ${selectedCommunityCampSite.site_type}`,
      latitude: selectedCommunityCampSite.latitude,
      longitude: selectedCommunityCampSite.longitude,
      raw: {
        communityCampSiteId: selectedCommunityCampSite.id,
        source: 'community_campsite',
      },
      restoreSelection: () => setSelectedCommunityCampSiteId(selectedCommunityCampSite.id),
    });
  }, [previewCampsiteDestination, selectedCommunityCampSite]);

  const handleScopedCampsiteNavigateHere = useCallback(async () => {
    if (!selectedScopedCampsiteReport || !selectedScopedCampsite) return;
    const title =
      selectedScopedCampsiteReport.notes?.split(/[.!?]/)[0]?.slice(0, 44) ||
      (selectedScopedCampsite.scope === 'private'
        ? 'Personal Campsite'
        : selectedScopedCampsite.scope === 'reviewer_pending'
          ? 'Campsite Review Location'
          : 'Pending Campsite');
    await previewCampsiteDestination({
      actionId: `${selectedScopedCampsite.scope}-campsite-${selectedScopedCampsiteReport.id}`,
      title,
      subtitle:
        selectedScopedCampsite.scope === 'private'
          ? 'Personal saved campsite'
          : selectedScopedCampsite.scope === 'reviewer_pending'
            ? 'Campsite review queue'
            : 'Pending community campsite',
      latitude: selectedScopedCampsiteReport.latitude,
      longitude: selectedScopedCampsiteReport.longitude,
      raw: {
        reportId: selectedScopedCampsiteReport.id,
        scope: selectedScopedCampsite.scope,
        source: 'campsite_visibility_layer',
      },
      restoreSelection: () => setSelectedScopedCampsite(selectedScopedCampsite),
    });
  }, [previewCampsiteDestination, selectedScopedCampsite, selectedScopedCampsiteReport]);

  const handleGroupCampsiteNavigateHere = useCallback(async () => {
    if (!selectedGroupCampsiteItem) return;
    const target = getGroupCampsiteTarget(selectedGroupCampsiteItem);
    if (!target) return;
    const title =
      selectedGroupCampsiteItem.camp_site?.canonical_name ??
      selectedGroupCampsiteItem.report?.notes?.split(/[.!?]/)[0]?.slice(0, 44) ??
      'Group Campsite';
    await previewCampsiteDestination({
      actionId: `group-campsite-${selectedGroupCampsiteItem.share.id}`,
      title,
      subtitle: selectedGroupCampsiteGroup?.group.name
        ? `Shared in ${selectedGroupCampsiteGroup.group.name}`
        : 'Shared group campsite',
      latitude: target.latitude,
      longitude: target.longitude,
      raw: {
        groupShareId: selectedGroupCampsiteItem.share.id,
        groupId: selectedGroupCampsiteItem.share.group_id,
        source: 'group_campsite',
      },
      restoreSelection: () => setSelectedGroupCampsiteShareId(selectedGroupCampsiteItem.share.id),
    });
  }, [
    previewCampsiteDestination,
    selectedGroupCampsiteGroup?.group.name,
    selectedGroupCampsiteItem,
  ]);

  const handleCampsiteLayerToggle = useCallback((scope: CampsiteVisibilityLayerScope) => {
    hapticMicro();
    const willHideLayer = campsiteLayerVisibility[scope];
    campsiteLayerVisibilityTouchedRef.current = true;
    setCampsiteLayerVisibility((prev) => {
      const next = { ...prev, [scope]: !prev[scope] };
      void persistCampsiteLayerVisibility(next);
      return next;
    });
    if (willHideLayer) {
      if (scope === 'community') setSelectedCommunityCampSiteId(null);
      if (scope === 'private' || scope === 'pending' || scope === 'reviewer_pending') {
        setSelectedScopedCampsite((current) => (current?.scope === scope ? null : current));
      }
    }
    setRequestBoundsTrigger((prev) => prev + 1);
  }, [campsiteLayerVisibility]);

  const handleCommunityCampsiteSave = useCallback(async () => {
    if (!selectedCommunityCampSite) return;
    hapticMicro();
    const result = await campsiteRecommendationService.createCampsiteReport(
      buildPrivateSaveInputFromCommunityCampsite(selectedCommunityCampSite),
    );
    showToast(result.ok ? 'Campsite saved privately.' : result.error);
  }, [selectedCommunityCampSite, showToast]);

  const handleCommunityCampsiteConfirm = useCallback(async () => {
    if (!selectedCommunityCampSite) return;
    hapticCommand();
    const result = await campsiteRecommendationService.confirmCampsite({
      camp_site_id: selectedCommunityCampSite.id,
      source_type: 'manual',
    });
    if (!result.ok) {
      showToast(result.error);
      return;
    }
    setCommunityCampSites((prev) =>
      prev.map((site) => (site.id === result.data.camp_site.id ? result.data.camp_site : site)),
    );
    showToast('Campsite confirmed.');
  }, [selectedCommunityCampSite, showToast]);

  const handleCommunityCampsiteFlag = useCallback(async () => {
    if (!selectedCommunityCampSite) return;
    hapticCommand();
    const result = await campsiteRecommendationService.flagCampsite({
      camp_site_id: selectedCommunityCampSite.id,
      reason: 'other',
      details: 'Flagged from ECS community campsite map.',
    });
    if (!result.ok) {
      showToast(result.error);
      return;
    }
    setCommunityCampSites((prev) =>
      prev.map((site) =>
        site.id === selectedCommunityCampSite.id
          ? { ...site, flag_count: result.data.flag_count }
          : site,
      ),
    );
    showToast('Campsite flag submitted.');
  }, [selectedCommunityCampSite, showToast]);

  const handleCampIntelCompareNearby = useCallback(() => {
    if (!selectedCampIntel) return;
    const nearby = campIntel.getNearbySites(selectedCampIntel.id, 3);
    if (nearby.length === 0) {
      showToast('NO NEARBY CAMPS TO COMPARE');
      return;
    }

    hapticMicro();
    setCampIntelComparisonVisible(true);
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
  setSelectedDroppedPinId(null);
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
      setSelectedDroppedPinId(null);
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

  const handleDroppedPinClose = useCallback(() => {
    setSelectedDroppedPinId(null);
  }, []);

  const handleDroppedPinEdit = useCallback(() => {
    if (!selectedDroppedPin) return;
    hapticMicro();
    setSelectedDroppedPinId(null);
    setEditingPin(selectedDroppedPin);
    setDropCoords({ lat: selectedDroppedPin.lat, lng: selectedDroppedPin.lng });
    openTopPopup('pinEditor');
  }, [openTopPopup, selectedDroppedPin]);

  const handleDroppedPinDelete = useCallback(() => {
    if (!selectedDroppedPin) return;
    const pin = selectedDroppedPin;
    const doDelete = () => {
      pinStore.delete(pin.id);
      setSelectedDroppedPinId(null);
      setEditingPin(null);
      setDropCoords(null);
      loadPins();
      showToast('PIN DELETED');
    };
    if (Platform.OS === 'web') {
      if (confirm(`Delete "${pin.title}"?`)) doDelete();
      return;
    }
    Alert.alert(
      'Delete Pin',
      `Remove "${pin.title}" from the map?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: doDelete },
      ],
    );
  }, [loadPins, selectedDroppedPin, showToast]);

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
    setSelectedDroppedPinId(_pin.id);
    showToast(`CENTERED ON: ${_pin.title}`);
  }, [showToast]);

  const handleEditPin = useCallback((pin: ECSPin) => {
    setSelectedDroppedPinId(null);
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

  const handleClearAllPins = useCallback(() => {
    const deletedCount = activeExpeditionId
      ? pinStore.deleteMany(allPins.map((pin) => pin.id))
      : pinStore.deleteAll();
    if (deletedCount === 0) return;
    setSelectedDroppedPinId(null);
    setEditingPin(null);
    setDropCoords(null);
    handlePinTypeFilterReset();
    loadPins();
    showToast(`CLEARED ${deletedCount} PIN${deletedCount === 1 ? '' : 'S'}`);
  }, [activeExpeditionId, allPins, handlePinTypeFilterReset, loadPins, showToast]);

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

const locateCampsitesForCompletedPolygon = useCallback(
  (points: CampsiteSearchPolygonPoint[]) => {
    const validation = validateCampScoutArea(points);
    if (!validation.ok) {
      setCampScoutAreaMode('error');
      setCampsitePolygonLocateState(validation.status === 'too_large' ? 'too_large' : 'error');
      setCampsitePolygonLocateMessage(
        validation.status === 'too_large'
          ? 'Area too large for a focused Camp Scout scan. Tighten the area and scan again.'
          : validation.message,
      );
      showToast(validation.status === 'too_large' ? 'TIGHTEN CAMP SCOUT AREA' : 'ADJUST CAMP SCOUT AREA');
      return;
    }

    const polygonId = createCampsiteDrawingId(points);
    const requestToken = campsiteCandidateEngine.beginRefresh({
      source: 'polygon',
      polygonId,
      routeIntelligenceId: polygonId,
      reason: 'polygon_scan_refresh_started',
    });
    campsitePolygonLocateRequestRef.current = requestToken;
    setCampScoutAreaMode('scanning');
    setCampsitePolygonLocateState('locating');
    setCampsitePolygonLocateMessage('Scanning: Camp Scout is ranking terrain, access, source, and confidence signals.');
    setSelectedCampIntelId(null);
    setSelectedCampScoutCandidateId(null);
    setSelectedCampOpsEndpointId(null);

    setTimeout(() => {
      if (campsitePolygonLocateRequestRef.current !== requestToken) return;
      try {
        const result = locateCampsiteResultForPolygon({
          polygonCoordinates: points,
          terrainIntelligence,
          remotenessSnapshot: getCampsiteRemotenessSnapshot(),
          vehicleProfile: navigateVehicleContext,
          polygonId,
          routeName: 'Camp Scout Area',
          campopsRecommendationsEnabled: CAMPOPS_ROUTE_PINS_ENABLED,
          campOps: CAMPOPS_ROUTE_PINS_ENABLED
            ? {
                rolloutConfig: CAMPOPS_ROUTE_PINS_ROLLOUT_CONFIG,
              }
            : null,
        }, { publish: false });

        const campsiteCount = result.suggestedCampsites.length || result.candidateCount;
        const countValidation = validateCampScoutArea(points, {
          estimatedCandidateCount: campsiteCount,
          maxEstimatedCandidates: CAMP_SCOUT_MAX_ESTIMATED_CANDIDATES,
        });
        if (!countValidation.ok) {
          setCampScoutAreaMode('error');
          setCampsitePolygonLocateState(countValidation.status === 'too_large' ? 'too_large' : 'error');
          setCampsitePolygonLocateMessage(
            countValidation.status === 'too_large'
              ? 'Area too large for a focused Camp Scout scan. Tighten the area to reduce candidate volume.'
              : countValidation.message,
          );
          showToast('TIGHTEN CAMP SCOUT AREA');
          return;
        }

        if (campsiteCount <= 0) {
          setCampScoutAreaMode('results');
          setCampsitePolygonLocateState('empty');
          setCampsitePolygonLocateMessage('No high-confidence candidates found. Try widening the area, reducing remoteness strictness, or enabling official mapped camps.');
          return;
        }

        campsiteCandidateEngine.publishResult(result, { requestToken });
        if (
          CAMPOPS_ROUTE_PINS_ENABLED &&
          result.campOps?.enabled &&
          Array.isArray(result.campOps.recommendationSet?.rankedCandidates) &&
          result.campOps.recommendationSet.rankedCandidates.length === 0
        ) {
          setSelectedCampOpsEndpointId(null);
        }
        loadDrawAreaKnownCampsiteSources(polygonId, points);
        const cappedCount = Math.min(campsiteCount, 5);
        const fallbackTier = result.viabilitySummary?.fallbackTier;
        const confidenceLabel =
          fallbackTier === 'preferred'
            ? 'preferred'
            : fallbackTier === 'good'
              ? 'good'
              : fallbackTier === 'possible'
                ? 'possible'
                : fallbackTier === 'limited_confidence'
                  ? 'limited-confidence'
                  : 'viable';
        setCampScoutAreaMode('results');
        setCampsitePolygonLocateState('ready');
        setCampsitePolygonLocateMessage(`${cappedCount} ${confidenceLabel} Camp Scout pin${cappedCount === 1 ? '' : 's'} shown in or near the drawn area.`);
      } catch (error) {
        console.warn('[Navigate] Polygon campsite locating failed:', error);
        setCampScoutAreaMode('error');
        setCampsitePolygonLocateState('error');
        setCampsitePolygonLocateMessage('Camp Scout scan failed. Area kept for retry.');
        showToast('CAMP SCOUT UNAVAILABLE');
      }
    }, 0);
  },
  [loadDrawAreaKnownCampsiteSources, navigateVehicleContext, showToast, terrainIntelligence],
);

const handleDirectMapTapForPin = useCallback(
  async ({ latitude, longitude }: { latitude: number; longitude: number }) => {
    if (campsiteDrawMode) {
      hapticMicro();
      const nextPoint = { latitude, longitude };
      const firstPoint = campsiteDrawingPoints[0] ?? null;
      if (
        firstPoint &&
        !campsiteDrawingClosed &&
        campsiteDrawingPoints.length >= 3 &&
        getCampsiteDrawingDistanceMiles(firstPoint, nextPoint) <= CAMPSITE_DRAW_CLOSE_THRESHOLD_MILES
      ) {
        showToast('PRESS FINISH, THEN SCAN');
        return;
      }
      setCampsiteDrawingPoints((current) => [...current, nextPoint]);
      setCampScoutAreaMode('drawing');
      campsitePolygonLocateRequestRef.current = null;
      setCampsitePolygonLocateState('idle');
      setCampsitePolygonLocateMessage(null);
      resetDrawAreaKnownCampsiteSources();
      return;
    }

    if (recommendCampsiteDropMode) {
      hapticCommand();
      closeTopPopup();
      if (recommendCampsiteGpxMapSelection) {
        const result = await gpxCampsiteImportService.createGpxCandidateFromMapSelection(
          recommendCampsiteGpxMapSelection.importId,
          {
            latitude,
            longitude,
            candidate_type: recommendCampsiteGpxMapSelection.candidateType,
            name:
              recommendCampsiteGpxMapSelection.candidateType === 'track_selected_point'
                ? 'Selected GPX track campsite candidate'
                : 'Selected GPX route campsite candidate',
            description:
              'This creates a campsite candidate only. It will not be public unless submitted and approved.',
            source_route_name: recommendCampsiteGpxMapSelection.sourceRouteName,
            source_track_name: recommendCampsiteGpxMapSelection.sourceTrackName,
            source_segment_index: recommendCampsiteGpxMapSelection.sourceSegmentIndex,
          },
        );
        if (!result.ok) {
          setRecommendCampsiteImportError(result.error);
          setRecommendCampsiteDropMode(false);
          setRecommendCampsiteDropSource('pin_drop');
          setRecommendCampsiteGpxMapSelection(null);
          setPinDropMode(false);
          setShowCrosshair(false);
          openTopPopup('recommendCampsite');
          showToast('GPX CANDIDATE NOT CREATED');
          return;
        }
        showToast('GPX CANDIDATE CREATED: REVIEW BEFORE SUBMITTING');
      }
      setRecommendCampsiteLocation({
        latitude,
        longitude,
        source_type: recommendCampsiteDropSource,
        location_accuracy_m: null,
      });
      setRecommendCampsiteDropSource('pin_drop');
      setRecommendCampsiteGpxMapSelection(null);
      setRecommendCampsiteDropMode(false);
      setPinDropMode(false);
      setShowCrosshair(false);
      openTopPopup('recommendCampsite');
      return;
    }

    if (!pinDropMode) {
      setSelectedDroppedPinId(null);
      if (selectedCampIntelId) {
        setSelectedCampIntelId(null);
      }
      if (selectedCampScoutCandidateId) {
        setSelectedCampScoutCandidateId(null);
      }
      return;
    }

    hapticCommand();
    closeTopPopup();
    setSelectedDroppedPinId(null);
    setDropCoords({ lat: latitude, lng: longitude });
    setEditingPin(null);
    setPinDropMode(false);
    setShowCrosshair(false);
    openTopPopup('pinEditor');
  },
  [
    campsiteDrawMode,
    campsiteDrawingClosed,
    campsiteDrawingPoints,
    resetDrawAreaKnownCampsiteSources,
    pinDropMode,
    recommendCampsiteDropMode,
    recommendCampsiteDropSource,
    recommendCampsiteGpxMapSelection,
    closeTopPopup,
    openTopPopup,
    showToast,
    selectedCampIntelId,
    selectedCampScoutCandidateId,
  ],
);

  // -- Phase 15: Route geometry validation before MapRenderer --
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
        `Route geometry invalid for run "${activeRun?.id}" - fewer than 2 valid coordinates after filtering (${pts.length} raw, ${filtered.length} valid)`
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
        `Route geometry invalid for run "${activeRun?.id}" - all coordinates collapse to the same point (${filtered.length} valid points)`
      );
      return [];
    }

    return filtered;
  } catch (e) {
    stabilityLog('Navigation', 'error', 'Route geometry validation failed', e);
    return [];
  }
}, [activeRun?.id, activeRun?.points]);


// -- Segment risk for active run ----------------
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


    // -- Bailouts + Remoteness for active run -------
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
      throw new Error('IMPORT FAILED - Route needs at least 2 valid points');
    }

    return {
      parsed,
      primaryCoords,
    };
  },
  [simplifyRouteCoords]
);

const beginRouteImportPending = useCallback((reason: string) => {
  if (isImportPendingRef.current) {
    logNavigateDev('[NAVIGATE_IMPORT] import_button_ignored_pending', { reason });
    return false;
  }

  isImportPendingRef.current = true;
  setIsImportPending(true);
  return true;
}, []);

const releaseRouteImportPending = useCallback(() => {
  isImportPendingRef.current = false;
  activeImportFileKeyRef.current = null;
  setIsImportPending(false);
}, []);

const wasRouteFileRecentlyImported = useCallback((fileKey: string) => {
  const now = Date.now();
  const recentKeys = recentImportFileKeysRef.current;

  for (const [key, importedAt] of recentKeys) {
    if (now - importedAt > NAVIGATE_IMPORT_RECENT_FILE_WINDOW_MS) {
      recentKeys.delete(key);
    }
  }

  const importedAt = recentKeys.get(fileKey);
  return typeof importedAt === 'number' && now - importedAt <= NAVIGATE_IMPORT_RECENT_FILE_WINDOW_MS;
}, []);

const markRouteFileImported = useCallback((fileKey: string) => {
  recentImportFileKeysRef.current.set(fileKey, Date.now());
}, []);

const handleImmediateImport = useCallback(
  (content: string, fileName: string, importFileKey?: string) => {
    const fileKey = importFileKey ?? createNavigateImportFileKey(fileName, content);

    if (wasRouteFileRecentlyImported(fileKey)) {
      logNavigateDev('[NAVIGATE_IMPORT] import_button_ignored_pending', { reason: 'duplicate_file' });
      setImportFeedback({
        tone: 'info',
        title: 'Route already imported',
        detail: fileName,
      });
      return false;
    }

    const ext = fileName.split('.').pop()?.toLowerCase() || '';
    setImportFeedback({
      tone: 'info',
      title: 'Importing route file',
      detail: fileName,
    });

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
        throw new Error('IMPORT FAILED - Parsed route could not be converted into run points');
      }

      runStore.setActive(run.id);
      loadRuns();
      resetSnapshotForm();
      logNavigateDev('[NAVIGATE_IMPORT] import_success', { routeId: run.id });
      setImportFeedback({
        tone: 'success',
        title: 'Route imported',
        detail: `${run.title} (${run.stats.distance_miles.toFixed(1)} mi)`,
      });
      closeTopPopup('importRoute');

      showToast(`RUN CREATED: ${run.title} (${run.stats.distance_miles.toFixed(1)} mi)`);
      markRouteFileImported(fileKey);
      return true;
    } catch (err: any) {
      console.error('[Navigate] Immediate import failed:', err);
      const reason = err?.message || 'FAILED TO IMPORT ROUTE';
      logNavigateDev('[NAVIGATE_IMPORT] import_failure', { reason });
      setImportFeedback({
        tone: 'error',
        title: 'Import failed',
        detail: reason,
      });
      showToast(err?.message || 'FAILED TO IMPORT ROUTE');
      return false;
    }
  },
  [
    closeTopPopup,
    loadRuns,
    markRouteFileImported,
    resetSnapshotForm,
    showToast,
    validateImportedRouteContent,
    wasRouteFileRecentlyImported,
  ]
);

// -- GPX/KML/GeoJSON Import - immediate route creation -----
const handleImportGPX = useCallback(async () => {
  if (!beginRouteImportPending('picker_active')) return;

  hapticCommand();
  logNavigateDev('[NAVIGATE_IMPORT] import_button_pressed');
  const setImportInfo = (title: string, detail?: string) => {
    setImportFeedback({ tone: 'info', title, detail });
  };
  const setImportError = (title: string, detail: string) => {
    logNavigateDev('[NAVIGATE_IMPORT] import_failure', { reason: detail });
    setImportFeedback({ tone: 'error', title, detail });
  };
  const setImportCancelled = () => {
    logNavigateDev('[NAVIGATE_IMPORT] import_cancelled');
    setImportInfo('Import canceled', 'No file was selected.');
    showToast('IMPORT CANCELED');
  };
  const importSelectedContent = (content: string, fileName: string) => {
    const fileKey = createNavigateImportFileKey(fileName, content);

    if (activeImportFileKeyRef.current === fileKey || wasRouteFileRecentlyImported(fileKey)) {
      logNavigateDev('[NAVIGATE_IMPORT] import_button_ignored_pending', { reason: 'duplicate_file' });
      setImportInfo('Route already imported', fileName);
      return false;
    }

    activeImportFileKeyRef.current = fileKey;
    return handleImmediateImport(content, fileName, fileKey);
  };

  // -- Web: Use DOM file input --
  if (Platform.OS === 'web' && typeof document !== 'undefined') {
    logNavigateDev('[NAVIGATE_IMPORT] picker_opened');
    setImportInfo('Choose a route file', `Supported files: ${NAVIGATE_IMPORT_SUPPORTED_COPY}.`);
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.gpx,.xml,.kml,.kmz,.geojson,.json';

    input.onchange = async (e: any) => {
      const file = e.target?.files?.[0];
      if (!file) {
        setImportCancelled();
        releaseRouteImportPending();
        return;
      }

      const fileName = file.name || 'imported.gpx';
      const ext = fileName.split('.').pop()?.toLowerCase() || '';

      if (!NAVIGATE_IMPORT_SELECTABLE_EXTENSIONS.includes(ext)) {
        const reason = `Unsupported file type .${ext || 'unknown'}. Use ${NAVIGATE_IMPORT_SUPPORTED_COPY}.`;
        setImportError('Unsupported file', reason);
        releaseRouteImportPending();
        showToast('UNSUPPORTED FORMAT - Use .gpx, .kml, or .geojson');
        return;
      }

      try {
        const text = await file.text();

        if (!text || text.length === 0) {
          setImportError('Import failed', 'File appears to be empty');
          releaseRouteImportPending();
          showToast('IMPORT FAILED - File appears to be empty');
          return;
        }

        showToast(`FILE SELECTED: ${fileName}`);
        importSelectedContent(text, fileName);
        releaseRouteImportPending();
      } catch (readErr) {
        console.error('[Navigate] Failed to read file:', readErr);
        setImportError('Import failed', 'Could not read file');
        releaseRouteImportPending();
        showToast('IMPORT FAILED - Could not read file');
      }
    };

    (input as any).oncancel = () => {
      setImportCancelled();
      releaseRouteImportPending();
    };

    input.click();
    return;
  }

  // -- Native (Android/iOS): Use expo-document-picker --
try {
  const DocumentPicker = await import('expo-document-picker');
  logNavigateDev('[NAVIGATE_IMPORT] picker_opened');
  setImportInfo(
    'Choose a route file',
    `Supported files: ${NAVIGATE_IMPORT_SUPPORTED_COPY}. KMZ files require extracting the KML first.`,
  );

  const result = await DocumentPicker.getDocumentAsync({
    type: [
      'application/gpx+xml',
      'application/vnd.google-earth.kml+xml',
      'application/vnd.google-earth.kmz',
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
    setImportCancelled();
    return;
  }

  const asset = result.assets[0];
  const fileName = asset.name || 'imported.gpx';
  const ext = fileName.split('.').pop()?.toLowerCase() || '';

  if (!NAVIGATE_IMPORT_SELECTABLE_EXTENSIONS.includes(ext)) {
    const reason = `Unsupported file type .${ext || 'unknown'}. Use ${NAVIGATE_IMPORT_SUPPORTED_COPY}.`;
    setImportError('Unsupported file', reason);
    showToast(`UNSUPPORTED FORMAT: .${ext} - Use .gpx, .kml, or .geojson`);
    return;
  }

  showToast(`FILE SELECTED: ${fileName}`);

  try {
    const fileUri = asset.uri;
    const content = await fsReadFileFromPickerUri(fileUri);

    if (!content || content.length === 0) {
      setImportError('Import failed', 'File appears to be empty');
      showToast('IMPORT FAILED - File appears to be empty');
      return;
    }

    importSelectedContent(content, fileName);
  } catch (readErr: any) {
    console.error('[Navigate] Failed to read file content:', readErr);
    setImportError('Import failed', 'Could not read file content');
    showToast('IMPORT FAILED - Could not read file content');
  }
} catch (pickerErr) {
  console.error('[Navigate] Document picker failed:', pickerErr);
  const reason =
    Platform.OS === 'android'
      ? 'File picker unavailable. Check that expo-document-picker is included in this build.'
      : 'File picker unavailable. Check build configuration.';
  setImportError('Import unavailable', reason);
  if (Platform.OS === 'android') {
    showToast('FILE IMPORT UNAVAILABLE - expo-document-picker may need to be installed');
  } else {
    showToast('FILE IMPORT UNAVAILABLE - Check build configuration');
  }
} finally {
  releaseRouteImportPending();
}
}, [
  beginRouteImportPending,
  handleImmediateImport,
  releaseRouteImportPending,
  showToast,
  wasRouteFileRecentlyImported,
]);

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

  const ensureCustomRouteRunLinks = useCallback(() => {
    let linkedAny = false;
    for (const route of routeStore.getCustomRoutes()) {
      const linkedRun = route.linked_run_id ? runStore.getById(route.linked_run_id) : null;
      if (linkedRun) continue;

      const run = runStore.createFromRoute(route, activeRun?.build_snapshot);
      routeStore.attachRun(route.id, run.id);
      linkedAny = true;
    }

    if (linkedAny) {
      setCustomRouteRefreshKey((key) => key + 1);
      loadRuns();
    }

    return linkedAny;
  }, [activeRun?.build_snapshot, loadRuns]);

  const seedStitchDraft = useCallback(() => {
    setStitchName('Stitched Expedition');
    setStitchSegmentIds((prev) => {
      if (prev.length > 0) return prev;
      return activeRun ? [activeRun.id] : [];
    });
  }, [activeRun]);

  const handleOpenStitch = useCallback(() => {
    ensureCustomRouteRunLinks();
    seedStitchDraft();
    openTopPopup('stitch');
  }, [ensureCustomRouteRunLinks, openTopPopup, seedStitchDraft]);

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

    void endTrailNavigation();
    void clearRoadDestination();

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
        ? `STITCHED EXPEDITION READY: ${nextTitle} | ${stitched.transitionLegCount} TRANSITION LEGS`
        : `STITCHED EXPEDITION READY: ${nextTitle}`,
    );
  }, [
    clearRoadDestination,
    closeTopPopup,
    endTrailNavigation,
    loadRuns,
    showToast,
    stitchName,
    stitchedRuns,
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
    const freshestLocation = latestGpsMapLocation ?? userLocation;
    if (!freshestLocation) return null;
    const coordinate = toSafeCoordinate(freshestLocation);
    return coordinate
      ? { lat: coordinate.latitude, lng: coordinate.longitude }
      : null;
  }, [latestGpsMapLocation, userLocation]);

  const roadRoutePoints = useMemo(
    () =>
      safeArray(roadNavigation.session.route?.geometry).map((point) => ({
        lat: point.lat,
        lng: point.lng,
        ele: point.ele ?? point.ele_m ?? null,
        ele_m: point.ele_m ?? point.ele ?? null,
        elevationFeet: point.elevationFeet ?? null,
      })),
    [roadNavigation.session.route?.geometry],
  );

  const roadRouteProgressPoints = useMemo(
    () =>
      safeArray(roadNavigation.session.progressGeometry).map((point) => ({
        lat: point.lat,
        lng: point.lng,
        ele: point.ele ?? point.ele_m ?? null,
        ele_m: point.ele_m ?? point.ele ?? null,
        elevationFeet: point.elevationFeet ?? null,
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

  const handleOpenCommandBriefFromNavigate = useCallback(() => {
    hapticMicro();
    const existingState = dashboardStore.getUIState('expedition');
    dashboardStore.saveUIState('expedition', {
      ...existingState,
      dashboardTab: 'brief',
    });
    router.push('/dashboard' as any);
  }, [router]);

  const getPendingStartRouteId = useCallback(() => {
    const routeSnapshot = navigateRouteSessionStore.getSnapshot();
    return (
      routeSnapshot.routeId ??
      trailNavigation.session.payload?.id ??
      roadNavigation.session.destination?.id ??
      exploreNavigationPayload?.id ??
      activeRun?.id ??
      null
    );
  }, [
    activeRun?.id,
    exploreNavigationPayload?.id,
    roadNavigation.session.destination?.id,
    trailNavigation.session.payload?.id,
  ]);

  const executeStartExpeditionNow = useCallback((mode: 'road' | 'trail', acknowledgedOverride: boolean) => {
    const assessment = expeditionReadinessStore.recomputeReadiness({
      immediate: true,
      reason: acknowledgedOverride ? 'start_expedition_override' : 'start_expedition',
    });
    const routeId = getPendingStartRouteId();
    const tripId = routeId ? `trip:${routeId}:${Date.now()}` : `trip:${Date.now()}`;

    if (acknowledgedOverride && assessment) {
      void recordStartExpeditionReadinessAcknowledgement(
        buildStartExpeditionAcknowledgement(assessment, {
          routeId,
          tripId,
          reason: 'Operator continued after ECS readiness review.',
        }),
      );
    }

    expeditionReadinessStore.beginActiveExpedition({
      activeRouteId: routeId,
      activeTripId: tripId,
    });

    setStartDecisionVisible(false);
    setPendingStartMode(null);
    setFollowUser(true);

    if (mode === 'trail') {
      enableFollowLock('trail_navigation_started', { force: true });
      void startTrailNavigation();
      return;
    }

    startRoadNavigation();
    enableFollowLock('road_navigation_started', { force: true });
  }, [
    enableFollowLock,
    getPendingStartRouteId,
    startRoadNavigation,
    startTrailNavigation,
  ]);

  const requestStartExpedition = useCallback((mode: 'road' | 'trail') => {
    const assessment = expeditionReadinessStore.recomputeReadiness({
      immediate: true,
      reason: 'start_expedition_decision',
    });
    const routeReviewReasons = startGuidanceReviewReasonsRef.current;
    const shouldReview =
      shouldShowStartExpeditionReadinessReview(assessment) ||
      routeReviewReasons.length > 0;

    if (!assessment || !shouldReview) {
      executeStartExpeditionNow(mode, false);
      return;
    }
    setPendingStartReviewReasons(routeReviewReasons);
    setPendingStartMode(mode);
    setStartDecisionVisible(true);
  }, [executeStartExpeditionNow]);

  useEffect(() => {
    const pendingRouteId = pendingAutoStartRouteIdRef.current;
    if (!pendingRouteId) return;
    if (trailSession.payload?.id !== pendingRouteId) return;
    if (
      trailSession.status !== 'route_preview_trail' &&
      trailSession.status !== 'route_preview_hybrid'
    ) {
      return;
    }

    pendingAutoStartRouteIdRef.current = null;
    setFollowUser(true);
    requestStartExpedition('trail');
  }, [
    requestStartExpedition,
    trailSession.payload?.id,
    trailSession.status,
  ]);

  useEffect(() => {
    const pendingRouteId = pendingAutoStartRouteIdRef.current;
    if (!pendingRouteId) return;
    if (explorePreviewMode !== 'road') return;
    if (exploreNavigationPayload?.id !== pendingRouteId) return;
    if (roadNavigation.session.destination?.id !== pendingRouteId) return;
    if (roadNavigation.session.status === 'error') {
      pendingAutoStartRouteIdRef.current = null;
      showToast(
        isRecoveryAssistNavigationPayload(exploreNavigationPayload)
          ? 'RECOVERY ASSIST ROUTE UNAVAILABLE'
          : 'ROUTE PREVIEW UNAVAILABLE',
      );
      return;
    }
    if (roadNavigation.session.status !== 'route_preview' || !roadNavigation.session.route) {
      return;
    }

    pendingAutoStartRouteIdRef.current = null;
    setFollowUser(true);
    requestStartExpedition('road');
  }, [
    exploreNavigationPayload,
    exploreNavigationPayload?.id,
    explorePreviewMode,
    roadNavigation.session.destination?.id,
    roadNavigation.session.route,
    roadNavigation.session.status,
    isRecoveryAssistNavigationPayload,
    requestStartExpedition,
    showToast,
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

  const trailTripMode: 'trail' | 'hybrid' =
    trailNavigation.session.payload?.tripMode === 'hybrid' ||
    explorePreviewMode === 'hybrid' ||
    pendingHybridTrailTransition
      ? 'hybrid'
      : 'trail';
  const trailRejoinPoint = trailNavigation.session.rejoinPoint;

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
  const navigateTrailAssessmentActive = navigationOverlayMode === 'active';
  const roadRouteGeometryValidation = useMemo(
    () => validateRouteGeometry(roadSession.route),
    [roadSession.route],
  );
  const roadRouteGeometryValid = roadRouteGeometryValidation.valid;

  useEffect(() => {
    if (roadSession.route) {
      logRouteGeometryLifecycle(
        roadRouteGeometryValidation.valid
          ? 'geometry_successfully_loaded'
          : roadRouteGeometryValidation.reason,
        {
          routeId: roadSession.route.id,
          phase: 'navigate_surface',
          source: 'road',
          status: roadSession.status,
          pointCount: roadRouteGeometryValidation.pointCount,
          fingerprint: roadRouteGeometryValidation.fingerprint,
        },
      );
      return;
    }

    if (roadSession.destination && !roadNavigation.previewLoading) {
      logRouteGeometryLifecycle('route_selected_geometry_missing', {
        routeId: roadSession.destination.id,
        phase: 'navigate_surface',
        source: 'road',
        status: roadSession.status,
        message: 'Road destination is selected but drawable route geometry is not available yet.',
      });
      return;
    }

    if (
      !roadSession.destination &&
      !activeRun &&
      validatedRunPoints.length <= 1 &&
      routeBuilderSegments.length === 0 &&
      !trailNavigation.session.payload
    ) {
      logRouteGeometryLifecycle('no_route_selected', {
        phase: 'navigate_surface',
        source: 'none',
        status: roadSession.status,
      });
    }
  }, [
    activeRun,
    roadNavigation.previewLoading,
    roadRouteGeometryValidation,
    roadSession.destination,
    roadSession.route,
    roadSession.status,
    routeBuilderSegments.length,
    trailNavigation.session.payload,
    validatedRunPoints.length,
  ]);

  const routeLifecycleState = useMemo(
    () =>
      normalizeRouteLifecycle({
        routeBuilderActive,
        routeBuilderDrawing,
        routeBuilderHasGeometry: routeBuilderSegments.length > 0,
        roadStatus: roadSession.status,
        roadPreviewLoading: roadNavigation.previewLoading,
        roadHasRoute: !!roadSession.route,
        roadHasValidGeometry: roadRouteGeometryValid,
        roadHasDestination: !!roadSession.destination,
        roadError: roadSession.error,
        roadCreatedFrom: roadSession.createdFrom,
        trailUiMode: trailNavigation.uiMode,
        trailStatus: trailNavigation.session.status,
        trailHasPayload: !!trailNavigation.session.payload,
        explorePreviewMode,
        pendingHybridTrailTransition,
        hasActiveRun: !!activeRun,
        hasDisplayedRouteGeometry: validatedRunPoints.length > 1,
      }),
    [
      activeRun,
      explorePreviewMode,
      pendingHybridTrailTransition,
      roadNavigation.previewLoading,
      roadRouteGeometryValid,
      roadSession.createdFrom,
      roadSession.destination,
      roadSession.error,
      roadSession.route,
      roadSession.status,
      routeBuilderActive,
      routeBuilderDrawing,
      routeBuilderSegments.length,
      trailNavigation.session.payload,
      trailNavigation.session.status,
      trailNavigation.uiMode,
      validatedRunPoints.length,
    ],
  );

  const roadNavigationActive =
    (roadNavigation.session.status !== 'idle' &&
      roadNavigation.session.status !== 'cancelled') ||
    trailNavigation.uiMode !== 'idle' ||
    trailOnlyPreviewActive;
  const [previewRouteHazardVisible, setPreviewRouteHazardVisible] = useState(false);
  const lastPreviewRouteHazardSignatureRef = useRef<string | null>(null);

  useEffect(() => {
    if (navigationOverlayMode !== 'preview' || !routeHazardIntel) {
      setPreviewRouteHazardVisible(false);
      return;
    }

    if (lastPreviewRouteHazardSignatureRef.current === routeHazardIntel.signature) {
      return;
    }

    lastPreviewRouteHazardSignatureRef.current = routeHazardIntel.signature;
    setPreviewRouteHazardVisible(true);

    const timeout = setTimeout(() => {
      setPreviewRouteHazardVisible(false);
    }, 6500);

    return () => clearTimeout(timeout);
  }, [navigationOverlayMode, routeHazardIntel]);

  const previewRouteHazardAccessory = useMemo(() => {
    if (
      navigationOverlayMode !== 'preview' ||
      !previewRouteHazardVisible ||
      !routeHazardIntel
    ) {
      return null;
    }

    return (
      <TouchableOpacity
        style={[
          styles.routePreviewHazardBanner,
          {
            borderColor: `${routeHazardIntel.color}55`,
            backgroundColor: `${routeHazardIntel.color}16`,
          },
        ]}
        activeOpacity={0.86}
        onPress={() => openTopPopup('intel')}
      >
        <View
          style={[
            styles.routePreviewHazardBannerIcon,
            { backgroundColor: `${routeHazardIntel.color}20` },
          ]}
        >
          <Ionicons name="warning-outline" size={14} color={routeHazardIntel.color} />
        </View>
        <View style={styles.routePreviewHazardBannerTextWrap}>
          <Text style={[styles.routePreviewHazardBannerTitle, { color: routeHazardIntel.color }]}>
            ROUTE WEATHER WARNING
          </Text>
          <Text style={styles.routePreviewHazardBannerText} numberOfLines={2}>
            {routeHazardIntel.summaryLine}
          </Text>
          <Text style={styles.routePreviewHazardBannerHint} numberOfLines={1}>
            {routeHazardIntel.headline}
            {routeHazardIntel.approachingLine ? ` - ${routeHazardIntel.approachingLine}` : ''}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={14} color={TACTICAL.textMuted} />
      </TouchableOpacity>
    );
  }, [
    navigationOverlayMode,
    openTopPopup,
    previewRouteHazardVisible,
    routeHazardIntel,
  ]);

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
    if (roadRoutePoints.length > 1) {
      return explorePreviewWaypoints;
    }
    return explorePreviewWaypoints.length > 0
      ? explorePreviewWaypoints
      : activeRunWaypointList;
  }, [
    activeRunWaypointList,
    explorePreviewWaypoints,
    roadRoutePoints.length,
    trailNavigationMarkers,
  ]);

  const navigateRouteWeatherRiskPoint = useMemo(
    () =>
      routeCorridorWeather.approachingHazard.point ??
      getRouteWeatherRiskPoint(routeCorridorWeather.points),
    [routeCorridorWeather.approachingHazard.point, routeCorridorWeather.points],
  );

  const navigateRouteWeatherCoordinates = useMemo(
    () => buildNavigateRouteWeatherCoordinates(displayedRoutePoints, navigateRouteWeatherRiskPoint),
    [displayedRoutePoints, navigateRouteWeatherRiskPoint],
  );

  const navigateSelectedWeatherCoordinate = useMemo<WeatherCoordinate | null>(
    () =>
      firstNavigateWeatherCoordinate([
        {
          coord: selectedCampIntel?.coordinate,
          label: selectedCampIntel?.label ?? 'Camp candidate',
        },
        {
          coord: selectedCampScoutCandidate?.coordinate,
          label: selectedCampScoutCandidate?.title ?? 'Camp Scout candidate',
        },
        {
          coord: selectedCampOpsIntel,
          label:
            selectedCampOpsIntel?.title ??
            (selectedCampOpsIntel as any)?.label ??
            'CampOps candidate',
        },
        {
          coord: selectedCommunityCampSite,
          label:
            (selectedCommunityCampSite as any)?.name ??
            (selectedCommunityCampSite as any)?.title ??
            'Community campsite',
        },
        {
          coord: selectedScopedCampsiteReport,
          label:
            (selectedScopedCampsiteReport as any)?.name ??
            (selectedScopedCampsiteReport as any)?.title ??
            'Campsite report',
        },
        {
          coord: selectedGroupCampsiteItem?.share,
          label:
            (selectedGroupCampsiteItem?.share as any)?.name ??
            (selectedGroupCampsiteItem?.share as any)?.title ??
            selectedGroupCampsiteGroup?.group.name ??
            'Group campsite',
        },
        {
          coord: editingPin,
          label: editingPin?.title ?? 'Selected pin',
        },
        {
          coord: dropCoords,
          label: editingPin?.title ?? 'Dropped pin',
        },
      ]),
    [
      dropCoords,
      editingPin,
      selectedCampIntel,
      selectedCampOpsIntel,
      selectedCampScoutCandidate,
      selectedCommunityCampSite,
      selectedGroupCampsiteGroup,
      selectedGroupCampsiteItem,
      selectedScopedCampsiteReport,
    ],
  );

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
    if (navigationOverlayMode === 'preview') return '#65D4FF';
    if (navigationOverlayMode === 'arrived') return '#F2C24D';
    return roadRoutePoints.length > 1 ? '#4F9BFF' : undefined;
  }, [
    navigationOverlayMode,
    pendingHybridTrailTransition,
    roadRoutePoints.length,
    trailNavigationActive,
  ]);

  const displayedRouteRenderMode = useMemo<React.ComponentProps<typeof MapRenderer>['routeRenderMode']>(() => {
    if (navigationOverlayMode === 'active') return 'active';
    if (navigationOverlayMode === 'arrived') return 'completed';
    if (navigationOverlayMode === 'preview') return 'preview';
    if (displayedRoutePoints.length > 1) return 'selected';
    return 'idle';
  }, [displayedRoutePoints.length, navigationOverlayMode]);

  const dispersedCampingEligibilityActive =
    dispersedCampingEligibilityLayerAvailable &&
    dispersedCampingEligibilityEnabled &&
    dispersedCampingEligibilityZoomReady;
  const establishedCampsitesActive =
    establishedCampsitesLayerAvailable &&
    establishedCampsitesEnabled &&
    establishedCampsitesZoomReady;
  const establishedCampsitesRouteHasRoute = useMemo(
    () => hasRouteGeometryForEstablishedCampsiteSearch(displayedRoutePoints),
    [displayedRoutePoints],
  );
  const establishedCampsitesRouteNearbyResults = useMemo(
    () =>
      establishedCampsitesActive && establishedCampsitesRouteHasRoute
        ? findEstablishedCampsitesNearRoute({
            campsites: establishedCampgrounds,
            routeCoordinates: displayedRoutePoints,
            currentLocation: safeUserLocation,
            corridorMiles: DEFAULT_ESTABLISHED_CAMPSITE_ROUTE_CORRIDOR_MILES,
            maxResults: Math.min(
              Math.max(establishedCampgrounds.length, 1),
              CAMP_LAYER_ROUTE_MAP_RESULT_LIMIT,
            ),
          })
        : [],
    [
      establishedCampsitesActive,
      establishedCampsitesRouteHasRoute,
      establishedCampgrounds,
      displayedRoutePoints,
      safeUserLocation,
    ],
  );
  const establishedCampsitesRouteResults = useMemo(
    () => establishedCampsitesRouteNearbyResults.slice(0, 3),
    [establishedCampsitesRouteNearbyResults],
  );
  const establishedCampgroundsForMap = useMemo(
    () =>
      establishedCampsitesActive && establishedCampsitesRouteHasRoute
        ? establishedCampsitesRouteNearbyResults
        : establishedCampgrounds,
    [
      establishedCampgrounds,
      establishedCampsitesActive,
      establishedCampsitesRouteHasRoute,
      establishedCampsitesRouteNearbyResults,
    ],
  );
  const dispersedCampingRouteHasRoute = useMemo(
    () => hasRouteGeometryForDispersedCampingSearch(displayedRoutePoints),
    [displayedRoutePoints],
  );
  const dispersedCampingRouteNearbyResults = useMemo(
    () =>
      dispersedCampingEligibilityActive && dispersedCampingRouteHasRoute
        ? findDispersedCampingRegionsNearRoute({
            regions: dispersedCampingRegions,
            routeCoordinates: displayedRoutePoints,
            currentLocation: safeUserLocation,
            corridorMiles: DEFAULT_DISPERSED_CAMPING_ROUTE_CORRIDOR_MILES,
            maxResults: Math.min(
              Math.max(dispersedCampingRegions.length, 1),
              CAMP_LAYER_ROUTE_MAP_RESULT_LIMIT,
            ),
          })
        : [],
    [
      dispersedCampingEligibilityActive,
      dispersedCampingRouteHasRoute,
      dispersedCampingRegions,
      displayedRoutePoints,
      safeUserLocation,
    ],
  );
  const dispersedCampingRouteResults = useMemo(
    () => dispersedCampingRouteNearbyResults.slice(0, 3),
    [dispersedCampingRouteNearbyResults],
  );
  const dispersedCampingRouteNearbyIds = useMemo(
    () => getDispersedCampingRouteNearbyIdSet(dispersedCampingRouteNearbyResults),
    [dispersedCampingRouteNearbyResults],
  );
  const dispersedCampingRouteDistanceByRegionId = useMemo(
    () => getDispersedCampingRouteDistanceByRegionId(dispersedCampingRouteNearbyResults),
    [dispersedCampingRouteNearbyResults],
  );
  const dispersedCampingRegionsForMap = useMemo(
    () =>
      dispersedCampingEligibilityActive && dispersedCampingRouteHasRoute
        ? dispersedCampingRegions.filter((region) => dispersedCampingRouteNearbyIds.has(region.id))
        : dispersedCampingRegions,
    [
      dispersedCampingEligibilityActive,
      dispersedCampingRegions,
      dispersedCampingRouteHasRoute,
      dispersedCampingRouteNearbyIds,
    ],
  );
  const dispersedCampingEligibilityRenderKey = useMemo(() => {
    if (!dispersedCampingEligibilityActive) return 'disabled';
    const regionIds = dispersedCampingRegionsForMap.map((region) => region.id).join(',');
    const routeDistances = dispersedCampingRouteNearbyResults
      .map((result) => `${result.regionId}:${result.distanceFromRouteMiles ?? 'na'}`)
      .join(',');
    return [
      'dispersed_camping',
      dispersedCampingStatus,
      dispersedCampingUiState.featureCount,
      dispersedCampingUiState.lastSuccessfulCacheKey ?? 'no-success',
      dispersedCampingUiState.lastAttemptedCacheKey ?? 'no-attempt',
      dispersedCampingRouteHasRoute ? 'route' : 'map',
      dispersedCampingRegionsForMap.length,
      regionIds,
      routeDistances,
    ].join('|');
  }, [
    dispersedCampingEligibilityActive,
    dispersedCampingRegionsForMap,
    dispersedCampingRouteHasRoute,
    dispersedCampingRouteNearbyResults,
    dispersedCampingStatus,
    dispersedCampingUiState.featureCount,
    dispersedCampingUiState.lastAttemptedCacheKey,
    dispersedCampingUiState.lastSuccessfulCacheKey,
  ]);
  const selectedDispersedCampingRegionLive = useMemo<DispersedCampingRegionSelectionPayload | null>(() => {
    if (!selectedDispersedCampingRegion) return null;
    const liveRegion = dispersedCampingRegions.find((region) => region.id === selectedDispersedCampingRegion.regionId);
    if (!liveRegion) return selectedDispersedCampingRegion;
    const routeResult = dispersedCampingRouteNearbyResults.find((result) => result.regionId === liveRegion.id);
    return {
      regionId: liveRegion.id,
      name: liveRegion.name,
      landManager: liveRegion.landManager,
      confidence: liveRegion.confidence,
      eligibilityLabel: liveRegion.eligibilityLabel,
      basis: liveRegion.basis,
      restrictions: liveRegion.restrictions,
      sourceNames: liveRegion.sourceNames,
      source: liveRegion.source,
      sourceProvider: liveRegion.sourceProvider,
      sourceUpdatedAt: liveRegion.sourceUpdatedAt,
      requiresVerification: liveRegion.requiresVerification,
      routeNearby: !!routeResult,
      distanceFromRouteMiles: routeResult?.distanceFromRouteMiles,
      routeCorridorMiles: routeResult ? DEFAULT_DISPERSED_CAMPING_ROUTE_CORRIDOR_MILES : undefined,
      latitude: selectedDispersedCampingRegion.latitude,
      longitude: selectedDispersedCampingRegion.longitude,
    };
  }, [dispersedCampingRegions, dispersedCampingRouteNearbyResults, selectedDispersedCampingRegion]);
  const dispersedCampingEligibilityLayer = useMemo(
    () => ({
      enabled: dispersedCampingEligibilityActive,
      status: dispersedCampingStatus,
      errorMessage: dispersedCampingError ?? undefined,
      diagnostic: dispersedCampingUiState.diagnostic,
      renderKey: dispersedCampingEligibilityRenderKey,
      featureCount: dispersedCampingEligibilityActive && dispersedCampingRouteHasRoute
        ? dispersedCampingRegionsForMap.length
        : dispersedCampingUiState.featureCount,
      lastAttemptedBbox: dispersedCampingUiState.lastAttemptedBbox,
      lastAttemptedCacheKey: dispersedCampingUiState.lastAttemptedCacheKey,
      lastSuccessfulBbox: dispersedCampingUiState.lastSuccessfulBbox,
      lastSuccessfulCacheKey: dispersedCampingUiState.lastSuccessfulCacheKey,
      geojson: dispersedCampingEligibilityActive
        ? toDispersedCampingFeatureCollection(dispersedCampingRegionsForMap, {
            routeNearbyRegionIds: dispersedCampingRouteNearbyIds,
            routeDistanceByRegionId: dispersedCampingRouteDistanceByRegionId,
            routeCorridorMiles: DEFAULT_DISPERSED_CAMPING_ROUTE_CORRIDOR_MILES,
          })
        : undefined,
    }),
    [
      dispersedCampingEligibilityActive,
      dispersedCampingEligibilityRenderKey,
      dispersedCampingError,
      dispersedCampingRegionsForMap,
      dispersedCampingRouteHasRoute,
      dispersedCampingRouteDistanceByRegionId,
      dispersedCampingRouteNearbyIds,
      dispersedCampingStatus,
      dispersedCampingUiState.diagnostic,
      dispersedCampingUiState.featureCount,
      dispersedCampingUiState.lastAttemptedBbox,
      dispersedCampingUiState.lastAttemptedCacheKey,
      dispersedCampingUiState.lastSuccessfulBbox,
      dispersedCampingUiState.lastSuccessfulCacheKey,
    ],
  );
  const establishedCampsitesLayer = useMemo(
    () => ({
      enabled: establishedCampsitesActive,
      status: establishedCampgroundsStatus,
      errorMessage: establishedCampgroundsError ?? undefined,
      diagnostic: establishedCampgroundsUiState.diagnostic,
      featureCount: establishedCampgroundsUiState.featureCount,
      lastAttemptedBbox: establishedCampgroundsUiState.lastAttemptedBbox,
      lastAttemptedCacheKey: establishedCampgroundsUiState.lastAttemptedCacheKey,
      lastSuccessfulBbox: establishedCampgroundsUiState.lastSuccessfulBbox,
      lastSuccessfulCacheKey: establishedCampgroundsUiState.lastSuccessfulCacheKey,
      geojson: establishedCampsitesActive
        ? toEstablishedCampsiteFeatureCollection(establishedCampgroundsForMap)
        : undefined,
    }),
    [
      establishedCampsitesActive,
      establishedCampgroundsForMap,
      establishedCampgroundsError,
      establishedCampgroundsStatus,
      establishedCampgroundsUiState.diagnostic,
      establishedCampgroundsUiState.featureCount,
      establishedCampgroundsUiState.lastAttemptedBbox,
      establishedCampgroundsUiState.lastAttemptedCacheKey,
      establishedCampgroundsUiState.lastSuccessfulBbox,
      establishedCampgroundsUiState.lastSuccessfulCacheKey,
    ],
  );
  const dispersedCampingDiagnostic = isCampLayerDiagnosticsVisible()
    ? formatCampLayerErrorDiagnostic(dispersedCampingUiState.diagnostic)
    : null;
  const establishedCampgroundsDiagnostic = isCampLayerDiagnosticsVisible()
    ? formatCampLayerErrorDiagnostic(establishedCampgroundsUiState.diagnostic)
    : null;
  useEffect(() => {
    if (!establishedCampsitesLayer.enabled) {
      setSelectedEstablishedCampsite(null);
    }
  }, [establishedCampsitesLayer.enabled]);
  useEffect(() => {
    const featureCount = dispersedCampingEligibilityLayer.geojson?.features.length ?? 0;
    const sourceLoaded = dispersedCampingEligibilityLayer.enabled && featureCount > 0;
    runtimeSmokeStore.updateDispersedCamping({
      featureAvailable: dispersedCampingEligibilityLayerAvailable,
      betaFlagEnabled: dispersedCampingEligibilityLayerAvailable,
      toggleVisible: dispersedCampingEligibilityLayerAvailable,
      layerEnabled: dispersedCampingEligibilityLayer.enabled,
      sourceLoaded,
      fillLayerPresent: sourceLoaded,
      outlineLayerPresent: sourceLoaded,
      unavailableStateVisible: dispersedCampingEligibilityLayer.enabled && !sourceLoaded,
      selectedRegionSheetVisible: !!selectedDispersedCampingRegion && dispersedCampingEligibilityLayer.enabled,
      selectedRegionId: selectedDispersedCampingRegion?.regionId ?? null,
      routeExists: dispersedCampingRouteHasRoute,
      routeAwareSummaryVisible: dispersedCampingEligibilityLayer.enabled && dispersedCampingRouteHasRoute,
      candidatePinCount: dispersedCampingCampScoutCandidates.length,
      candidatePins: dispersedCampingCampScoutCandidates.map((candidate) => ({
        id: candidate.id,
        regionId: candidate.dispersedCampingRegionId ?? null,
        landManager: candidate.landManager ?? null,
        confidence: candidate.eligibilityConfidence ?? null,
        sourceType: candidate.sourceType,
        isRestricted: candidate.isPrivateLand || candidate.isClosed || candidate.noCamping || candidate.isProtectedArea,
        verificationWarning: candidate.verificationWarning ?? null,
      })),
      candidateGenerationTrigger:
        dispersedCampingCampScoutCandidates.length > 0
          ? 'explicit_user_action'
          : null,
      dataFreshnessState: dispersedCampingEligibilityLayer.enabled ? 'cached' : 'unavailable',
      dataFreshnessLabel: dispersedCampingEligibilityLayer.enabled
        ? 'Cached/live PAD-US public-land eligibility data'
        : 'Eligibility layer unavailable',
      offlineMode: !isOnline,
      createdEligibilityClaimsWithoutData: false,
    });
  }, [
    dispersedCampingCampScoutCandidates,
    dispersedCampingEligibilityLayer.enabled,
    dispersedCampingEligibilityLayer.geojson,
    dispersedCampingEligibilityLayerAvailable,
    dispersedCampingRouteHasRoute,
    isOnline,
    selectedDispersedCampingRegion,
  ]);

  const displayedRouteProgressColor = useMemo(() => {
    if (trailNavigation.session.progressGeometry.length > 1) return '#F2C24D';
    return roadRouteProgressPoints.length > 1 ? '#F2C24D' : undefined;
  }, [roadRouteProgressPoints.length, trailNavigation.session.progressGeometry.length]);

  const routeOverviewRemotenessSnapshot = useMemo(
    () => {
      void remotenessIndex;
      return getCampsiteRemotenessSnapshot();
    },
    [remotenessIndex],
  );

  const routeOverviewCampsiteContext = useMemo<RouteCampsiteContext | null>(() => {
    const remotenessSnapshot = routeOverviewRemotenessSnapshot;
    const payload = trailNavigation.session.payload ?? exploreNavigationPayload;
    const payloadTrailGeometry =
      payload?.trailGeometry && payload.trailGeometry.length > 1 ? payload.trailGeometry : [];

    if (
      (trailNavigationActive || pendingHybridTrailTransition) &&
      payloadTrailGeometry.length > 1
    ) {
      return {
        routeId: payload?.id ?? activeRun?.id ?? 'trail-route',
        routeName: payload?.title ?? activeRun?.title ?? 'Trail Route',
        sourceType: pendingHybridTrailTransition ? 'hybrid' : 'trail',
        routeCoordinates: payloadTrailGeometry,
        routeIntelligence,
        terrainIntelligence,
        remotenessSnapshot,
        routeMetadata: payload?.routeMetadata ?? null,
      };
    }

    if (exploreNavigationPayload && explorePreviewMode === 'hybrid') {
      const trailGeometry = exploreNavigationPayload.trailGeometry ?? [];
      if (trailGeometry.length > 1) {
        return {
          routeId: exploreNavigationPayload.id,
          routeName: exploreNavigationPayload.title,
          sourceType: 'hybrid',
          routeCoordinates: trailGeometry,
          routeIntelligence,
          terrainIntelligence,
          remotenessSnapshot,
          routeMetadata: exploreNavigationPayload.routeMetadata ?? null,
        };
      }
    }

    if (
      exploreNavigationPayload &&
      explorePreviewMode === 'trail' &&
      exploreNavigationPayload.trailGeometry.length > 1
    ) {
      return {
        routeId: exploreNavigationPayload.id,
        routeName: exploreNavigationPayload.title,
        sourceType: 'explore',
        routeCoordinates: exploreNavigationPayload.trailGeometry,
        routeIntelligence,
        terrainIntelligence,
        remotenessSnapshot,
        routeMetadata: exploreNavigationPayload.routeMetadata ?? null,
      };
    }

    if (
      roadRoutePoints.length > 1 &&
      (navigationOverlayMode === 'preview' ||
        navigationOverlayMode === 'active' ||
        navigationOverlayMode === 'arrived')
    ) {
      return {
        routeId:
          roadNavigation.session.route?.id ??
          roadNavigation.session.destination?.id ??
          exploreNavigationPayload?.id ??
          'road-route',
        routeName:
          roadNavigation.session.destination?.title ??
          exploreNavigationPayload?.title ??
          'Road Route',
        sourceType: explorePreviewMode === 'road' || !exploreNavigationPayload ? 'road' : 'explore',
        routeCoordinates: roadRoutePoints,
        routeIntelligence,
        terrainIntelligence,
        remotenessSnapshot,
        routeMetadata: exploreNavigationPayload?.routeMetadata ?? null,
      };
    }

    if (activeRun && validatedRunPoints.length > 1 && !explorePreviewMode) {
      const source = String(activeRun.source ?? '').toLowerCase();
      return {
        routeId: activeRun.id,
        routeName: activeRun.title,
        sourceType:
          source === 'custom'
            ? 'custom'
            : source === 'gpx' || source === 'import'
              ? 'imported'
              : 'run',
        routeCoordinates: validatedRunPoints,
        routeIntelligence,
        terrainIntelligence,
        remotenessSnapshot,
      };
    }

    return null;
  }, [
    activeRun,
    exploreNavigationPayload,
    explorePreviewMode,
    navigationOverlayMode,
    pendingHybridTrailTransition,
    routeOverviewRemotenessSnapshot,
    roadNavigation.session.destination?.id,
    roadNavigation.session.destination?.title,
    roadNavigation.session.route?.id,
    roadRoutePoints,
    routeIntelligence,
    terrainIntelligence,
    trailNavigation.session.payload,
    trailNavigationActive,
    validatedRunPoints,
  ]);

  const routeOverviewCampsiteSignature = useMemo(
    () => buildRouteCampsiteLocatorSignature(routeOverviewCampsiteContext),
    [routeOverviewCampsiteContext],
  );
  const campOpsRouteRequestKey = useMemo(
    () =>
      CAMPOPS_ROUTE_PINS_ENABLED
        ? buildCampOpsLifecycleKey('route', routeOverviewCampsiteSignature)
        : null,
    [routeOverviewCampsiteSignature],
  );

  useEffect(() => {
    loadRouteKnownCampsiteSources(routeOverviewCampsiteSignature, routeOverviewCampsiteContext);
  }, [loadRouteKnownCampsiteSources, routeOverviewCampsiteContext, routeOverviewCampsiteSignature]);

  useEffect(() => {
    if (!routeOverviewCampsiteSignature) {
      lastRoutePolygonClearSignatureRef.current = null;
      return;
    }
    if (lastRoutePolygonClearSignatureRef.current === routeOverviewCampsiteSignature) {
      return;
    }

    lastRoutePolygonClearSignatureRef.current = routeOverviewCampsiteSignature;
    clearOwnedCampsiteCandidates('route_context_changed', {
      clearRoute: true,
      activeRouteIntelligenceId: routeOverviewCampsiteContext?.routeIntelligence?.id ?? null,
      activePolygonId: campsiteDrawingId,
    });
  }, [
    campsiteDrawingId,
    clearOwnedCampsiteCandidates,
    routeOverviewCampsiteContext?.routeIntelligence?.id,
    routeOverviewCampsiteSignature,
  ]);

  useEffect(() => {
    if (!routeOverviewCampsiteContext || !routeOverviewCampsiteSignature) {
      lastCampsiteInputRef.current = '';
      campOpsRouteRequestRef.current = null;
      setCampOpsRouteLifecycle(IDLE_CAMPOPS_LIFECYCLE_STATE);
      scheduleRouteCampsiteClear('route_context_unavailable', {
        activePolygonId: campsiteDrawingId,
      });
      return;
    }
    cancelPendingRouteCampsiteClear();

    if (lastCampsiteInputRef.current === routeOverviewCampsiteSignature) {
      if (campOpsRouteRequestKey) {
        const cached = campOpsRouteResultCacheRef.current.get(campOpsRouteRequestKey);
        if (cached) {
          applyCampsiteCandidates(cached);
          setCampOpsRouteLifecycle(
            campOpsLifecycleStateFromResult('route', campOpsRouteRequestKey, cached),
          );
          return;
        }
      }
      const current = campsiteCandidateEngine.getCurrent();
      if (
        current &&
        (current?.source ?? current?.analysisSource) === 'route' &&
        current?.routeIntelligenceId === routeOverviewCampsiteContext.routeIntelligence?.id
      ) {
        applyCampsiteCandidates(current);
        if (campOpsRouteRequestKey) {
          setCampOpsRouteLifecycle(
            campOpsLifecycleStateFromResult('route', campOpsRouteRequestKey, current),
          );
        }
      } else if ((current?.source ?? current?.analysisSource) === 'route') {
        clearOwnedCampsiteCandidates('route_context_changed', {
          activeRouteIntelligenceId: routeOverviewCampsiteContext.routeIntelligence?.id ?? null,
          activePolygonId: campsiteDrawingId,
        });
      }
      return;
    }

    lastCampsiteInputRef.current = routeOverviewCampsiteSignature;
    if (campOpsRouteRequestKey) {
      const cached = campOpsRouteResultCacheRef.current.get(campOpsRouteRequestKey);
      if (cached) {
        campsiteCandidateEngine.publishResult(cached);
        applyCampsiteCandidates(cached);
        setCampOpsRouteLifecycle(
          campOpsLifecycleStateFromResult('route', campOpsRouteRequestKey, cached),
        );
        return;
      }
    }

    const input = buildRouteCampsiteLocatorInput(routeOverviewCampsiteContext);
    if (!input?.routeIntelligence?.id) {
      if (campOpsRouteRequestKey) {
        campOpsRouteRequestRef.current = null;
        setCampOpsRouteLifecycle({
          source: 'route',
          requestKey: campOpsRouteRequestKey,
          status: 'error',
          message: CAMPOPS_ROUTE_SCAN_ERROR_MESSAGE,
        });
      }
      clearOwnedCampsiteCandidates('route_locator_input_unavailable', {
        clearRoute: true,
        activeRouteIntelligenceId: routeOverviewCampsiteContext.routeIntelligence?.id ?? null,
        activePolygonId: campsiteDrawingId,
      });
      return;
    }

    let cancelled = false;
    const requestToken = campsiteCandidateEngine.beginRefresh({
      source: 'route',
      routeIntelligenceId: input.routeIntelligence.id,
      polygonId: null,
      reason: 'route_scan_refresh_started',
    });
    if (campOpsRouteRequestKey) {
      campOpsRouteRequestRef.current = { requestKey: campOpsRouteRequestKey, requestToken };
      setCampOpsRouteLifecycle({
        source: 'route',
        requestKey: campOpsRouteRequestKey,
        status: 'loading',
        message: CAMPOPS_ROUTE_SCAN_LOADING_MESSAGE,
      });
    } else {
      campOpsRouteRequestRef.current = null;
      setCampOpsRouteLifecycle(IDLE_CAMPOPS_LIFECYCLE_STATE);
    }
    const campsiteTimer = setTimeout(() => {
      if (cancelled) return;
      try {
        const campOpsInput = CAMPOPS_ROUTE_PINS_ENABLED
          ? {
              ...input,
              campopsRecommendationsEnabled: true,
              campOps: {
                ...(input.campOps ?? {}),
                rolloutConfig: {
                  ...(input.campOps?.rolloutConfig ?? {}),
                  ...CAMPOPS_ROUTE_PINS_ROLLOUT_CONFIG,
                },
              },
            }
          : input;
        const result = locateCampsiteResultForRoute(campOpsInput, { publish: false });
        if (
          campOpsRouteRequestKey &&
          campOpsRouteRequestRef.current &&
          (campOpsRouteRequestRef.current.requestKey !== campOpsRouteRequestKey ||
            campOpsRouteRequestRef.current.requestToken !== requestToken)
        ) {
          return;
        }
        const publishedResult = campsiteCandidateEngine.publishResult(result, { requestToken });
        if (campOpsRouteRequestKey) {
          campOpsRouteResultCacheRef.current.set(campOpsRouteRequestKey, publishedResult);
          campOpsRouteRequestRef.current = null;
          setCampOpsRouteLifecycle(
            campOpsLifecycleStateFromResult('route', campOpsRouteRequestKey, publishedResult),
          );
        }
        if (
          CAMPOPS_ROUTE_PINS_ENABLED &&
          publishedResult.campOps?.enabled &&
          Array.isArray(publishedResult.campOps.recommendationSet?.rankedCandidates) &&
          publishedResult.campOps.recommendationSet.rankedCandidates.length === 0
        ) {
          showToast(CAMPOPS_NO_ROUTE_CANDIDATES_MESSAGE);
        }
      } catch (e) {
        console.warn('[Navigate] Route overview campsite locating failed:', e);
        if (campOpsRouteRequestKey && campOpsRouteRequestRef.current?.requestToken === requestToken) {
          campOpsRouteRequestRef.current = null;
          setCampOpsRouteLifecycle({
            source: 'route',
            requestKey: campOpsRouteRequestKey,
            status: 'error',
            message: CAMPOPS_ROUTE_SCAN_ERROR_MESSAGE,
          });
          showToast('CAMPOPS CAMP SCAN UNAVAILABLE');
        }
      }
    }, 0);

    return () => {
      cancelled = true;
      clearTimeout(campsiteTimer);
    };
  }, [
    applyCampsiteCandidates,
    cancelPendingRouteCampsiteClear,
    clearOwnedCampsiteCandidates,
    campsiteDrawingId,
    campOpsRouteRequestKey,
    routeOverviewCampsiteContext,
    routeOverviewCampsiteSignature,
    scheduleRouteCampsiteClear,
    showToast,
  ]);

  const displayedSegmentFeatures = useMemo(
    () =>
      roadRoutePoints.length > 1 || explorePreviewMode || trailNavigation.uiMode !== 'idle'
        ? []
        : segmentFeatures,
    [explorePreviewMode, roadRoutePoints.length, segmentFeatures, trailNavigation.uiMode],
  );

  const exploreCompatibilityContext = useMemo(() => {
    void aiRouteSnapshotVersion;
    return loadOpportunitiesWithCompatibility(
      null,
      userLocation?.lat,
      userLocation?.lng,
    );
  }, [aiRouteSnapshotVersion, userLocation?.lat, userLocation?.lng]);

  const localExploreRouteOverlayBuild = useMemo(() => {
    const { opportunities, results } = exploreCompatibilityContext;
    return buildExploreRouteOverlaySegments({
      opportunities,
      compatibilityResults: results,
      aiRoutes: aiRouteStore.getRoutes(EXPLORE_ROUTES_AI_CATEGORY),
      radiusMiles: DEFAULT_DISTANCE_RADIUS,
    });
  }, [exploreCompatibilityContext]);

  const exploreRouteOverlayBuild = useMemo(
    () =>
      exploreRoutesHandoff
        ? {
            segments: exploreRoutesHandoff.segments,
            candidateCount: exploreRoutesHandoff.candidateCount,
            skippedMissingGeometryCount: exploreRoutesHandoff.skippedMissingGeometryCount,
            cappedCount: exploreRoutesHandoff.cappedCount,
          }
        : localExploreRouteOverlayBuild,
    [exploreRoutesHandoff, localExploreRouteOverlayBuild],
  );

  const exploreRouteOverlaySegments = useMemo(
    () => (exploreRoutesEnabled ? exploreRouteOverlayBuild.segments : []),
    [exploreRouteOverlayBuild.segments, exploreRoutesEnabled],
  );
  const selectedExploreRouteSegment = useMemo(
    () =>
      selectedExploreRouteSegmentId
        ? exploreRouteOverlaySegments.find(
            (segment) => String(segment.id) === selectedExploreRouteSegmentId,
          ) ?? null
        : null,
    [exploreRouteOverlaySegments, selectedExploreRouteSegmentId],
  );
  const selectedExploreRouteOpportunity: ExpeditionOpportunity | null =
    selectedExploreRouteSegment?.route ?? null;
  const selectedExploreRouteNavigationPayload = useMemo(
    () =>
      selectedExploreRouteOpportunity
        ? buildExploreNavigationPayload(selectedExploreRouteOpportunity)
        : null,
    [selectedExploreRouteOpportunity],
  );
  const selectedExploreRouteCompatResult: CompatibilityResult | null =
    selectedExploreRouteSegment?.compatResult ??
    (selectedExploreRouteOpportunity
      ? exploreCompatibilityContext.results.get(selectedExploreRouteOpportunity.id) ?? null
      : null);
  const selectedExploreRouteVehicleProfile: VehicleProfile | null =
    exploreCompatibilityContext.profile ?? null;
  const selectedExploreRouteBuildUnavailableReason = useMemo(
    () =>
      selectedExploreRouteNavigationPayload && !canStageNavigationHandoffRoute(selectedExploreRouteNavigationPayload)
        ? getNavigationHandoffRouteUnavailableReason(selectedExploreRouteNavigationPayload)
        : null,
    [selectedExploreRouteNavigationPayload],
  );
  const exploreRouteOverlaySignature = useMemo(
    () => buildExploreRouteOverlaySignature(exploreRouteOverlaySegments),
    [exploreRouteOverlaySegments],
  );
  const mapSegmentFeatures = useMemo(
    () =>
      exploreRouteOverlaySegments.length > 0
        ? [...(displayedSegmentFeatures ?? []), ...exploreRouteOverlaySegments]
        : displayedSegmentFeatures,
    [displayedSegmentFeatures, exploreRouteOverlaySegments],
  );

  useEffect(() => {
    if (!exploreRoutesEnabled) {
      lastExploreRoutesFitSignatureRef.current = null;
      return;
    }

    if (roadNavigationActive || trailNavigationActive || pendingHybridTrailTransition) return;
    if (exploreRouteOverlaySegments.length === 0) return;
    if (lastExploreRoutesFitSignatureRef.current === exploreRouteOverlaySignature) return;

    lastExploreRoutesFitSignatureRef.current = exploreRouteOverlaySignature;
    fitMapToExploreRouteSegments(exploreRouteOverlaySegments);
  }, [
    exploreRouteOverlaySegments,
    exploreRouteOverlaySignature,
    exploreRoutesEnabled,
    fitMapToExploreRouteSegments,
    pendingHybridTrailTransition,
    roadNavigationActive,
    trailNavigationActive,
  ]);

  useEffect(() => {
    if (!selectedExploreRouteSegmentId) return;
    if (
      !exploreRoutesEnabled ||
      !exploreRouteOverlaySegments.some((segment) => String(segment.id) === selectedExploreRouteSegmentId)
    ) {
      setSelectedExploreRouteSegmentId(null);
    }
  }, [exploreRouteOverlaySegments, exploreRoutesEnabled, selectedExploreRouteSegmentId]);

  const cachedRemoteRemotenessScore = getRemoteCacheFallbackScore(activeRun?.offline_cache?.remote_cache);
  const remotenessOverlayRouteAvailable = displayedRoutePoints.length > 1;
  const remotenessOverlaySegmentDataAvailable = (displayedSegmentFeatures ?? []).some((segment) => {
    const hasCoordinates = (segment.coordinates?.length ?? 0) > 1;
    const hasScore =
      typeof segment.risk_score === 'number' && Number.isFinite(segment.risk_score);
    const hasLevel = Boolean(segment.remoteness_level ?? segment.risk_level);
    return hasCoordinates && (hasScore || hasLevel);
  });
  const remotenessOverlayDataAvailable =
    remotenessOverlayRouteAvailable ||
    remotenessOverlaySegmentDataAvailable ||
    Number.isFinite(remotenessIndex?.score ?? cachedRemoteRemotenessScore);
  const remotenessOverlayCandidate = useMemo(
    () =>
      remotenessOverlayDataAvailable
        ? buildRemoteMapOverlay({
            enabled: true,
            routePoints: displayedRoutePoints,
            progressPoints: displayedRouteProgressPoints,
            segmentFeatures: displayedSegmentFeatures,
            remotenessScore: remotenessIndex?.score ?? cachedRemoteRemotenessScore,
          })
        : { enabled: false, heatmapAreas: [], forecastSegments: [] },
    [
      cachedRemoteRemotenessScore,
      displayedRoutePoints,
      displayedRouteProgressPoints,
      displayedSegmentFeatures,
      remotenessOverlayDataAvailable,
      remotenessIndex?.score,
    ],
  );
  const remotenessOverlayHasVisibleLayer =
    remotenessOverlayCandidate.heatmapAreas.length > 0 ||
    remotenessOverlayCandidate.forecastSegments.length > 0;
  const remotenessMapOverlay = useMemo(
    () =>
      showRemotenessOverlay && remotenessOverlayHasVisibleLayer
        ? remotenessOverlayCandidate
        : { enabled: false, heatmapAreas: [], forecastSegments: [] },
    [remotenessOverlayCandidate, remotenessOverlayHasVisibleLayer, showRemotenessOverlay],
  );
  const remotenessOverlayAvailable = remotenessOverlayHasVisibleLayer;

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
  const navigateRouteConfidenceSummary = useMemo(
    () => {
      const hasRouteForConfidence =
        displayedRoutePoints.length > 1 || (displayedSegmentFeatures?.length ?? 0) > 0;
      if (!hasRouteForConfidence) return null;

      return buildNavigateRouteConfidenceSummary({
        routePoints: displayedRoutePoints,
        segmentFeatures: displayedSegmentFeatures,
        remotenessScore: remotenessIndex?.score ?? cachedRemoteRemotenessScore,
        cacheReady: hasCachedMapCoverage,
        powerHours: resourceForecast?.power.availableHours ?? null,
        weatherRisk: (weatherSeveritySummary?.score ?? 0) / 3,
        teamCount: 1,
      });
    },
    [
      displayedRoutePoints,
      displayedSegmentFeatures,
      cachedRemoteRemotenessScore,
      hasCachedMapCoverage,
      remotenessIndex?.score,
      resourceForecast?.power.availableHours,
      weatherSeveritySummary?.score,
    ],
  );
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

  const roadNavigationTopOffset = 0;
  const roadNavigationSurfaceTopOffset = ACTIVE_GUIDANCE_TOP;

  const routePreviewVisualMode = navigationOverlayMode === 'preview';
  const routeActiveVisualMode = navigationOverlayMode === 'active';
  const routeArrivedVisualMode = navigationOverlayMode === 'arrived';
  const routeSearchVisualMode = navigationOverlayMode === 'error';
  const activeGuidanceLandscapeWidth = navigateLandscapeExpanded
    ? Math.min(300, Math.max(248, Math.round(adaptive.windowWidth * 0.31)))
    : undefined;
  const topRouteSurfaceVisible =
    routePreviewVisualMode || routeActiveVisualMode || routeArrivedVisualMode;
  const routeSurfaceBottomOffset = LOWER_DOCK_EXCLUSION + PAGE_FRAME_BOTTOM_GAP;
  const routeSurfaceHeight =
    routeActiveVisualMode
      ? ROUTE_SURFACE_HEIGHT_ACTIVE
      : routeArrivedVisualMode
        ? ROUTE_SURFACE_HEIGHT_ARRIVED
        : ROUTE_SURFACE_HEIGHT_PREVIEW;
  const activeGuidanceRenderedHeight =
    routeActiveVisualMode
      ? activeGuidanceMinimized
        ? 48
        : Math.max(routeSurfaceHeight, activeGuidanceMeasuredHeight || routeSurfaceHeight)
      : routeSurfaceHeight;
  const routeBuilderControlBottomOffset =
    routeSurfaceBottomOffset + (routePreviewVisualMode ? routeSurfaceHeight + OVERLAY_GAP : 0);
  const mapToastAttachedToGuidance = navigationOverlayMode === 'active';
  const activeGuidanceNotificationGap = OVERLAY_GAP + 6;
  const activeGuidanceToastTopOffset =
    roadNavigationSurfaceTopOffset +
    activeGuidanceRenderedHeight +
    activeGuidanceNotificationGap;
  const mapToastTopOffset = mapToastAttachedToGuidance
    ? activeGuidanceToastTopOffset
    : PAGE_FRAME_TOP_GAP + 6;
  const campsiteDetailTopOffset =
    navigationOverlayMode === 'active' || navigationOverlayMode === 'arrived'
      ? activeGuidanceToastTopOffset
      : 0;
  const mapToastEstimatedHeight = 48;
  const mapToastGuidanceGap = 6;
  const mapToastBottomOffset = Math.max(
    LOWER_DOCK_EXCLUSION + 4,
    routeSurfaceBottomOffset - mapToastEstimatedHeight - mapToastGuidanceGap,
  );
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
    navigationOverlayMode !== 'active' &&
    !activeTopPopup &&
    !pinDropMode &&
    !selectedCampIntelId &&
    !selectedCampScoutCandidateId &&
    !selectedCampOpsEndpointId &&
    !roadStepListExpanded;
  const floatingToolsVisible = mapOverlayStartupReady;
  const campLayerControlsAvailable =
    dispersedCampingEligibilityLayerAvailable || establishedCampsitesLayerAvailable;
  const campLayerControlActive =
    campLayerMenuOpen || dispersedCampingEligibilityEnabled || establishedCampsitesEnabled;
  const compassOverlayVisible =
    mapOverlayStartupReady &&
    !activeTopPopup &&
    !pinDropMode &&
    !selectedCampIntelId &&
    !selectedCampScoutCandidateId &&
    !selectedCampOpsEndpointId;
  const pinModeBannerBottom = COMPASS_BOTTOM + COMPASS_SIZE + OVERLAY_GAP;
  const lowerMapOverlayStackBottom = Math.max(
    routeBuilderControlBottomOffset,
    TOOLS_TRIGGER_BOTTOM + TOOLS_TRIGGER_SIZE + 12,
  );
  const bottomLeftMapOverlayStackBottom = routeBuilderControlBottomOffset;
  const DISPERSED_CAMPING_LEGEND_STACK_HEIGHT = 82;
  const ESTABLISHED_CAMPSITES_ROUTE_SUMMARY_STACK_HEIGHT =
    establishedCampsitesRouteResults.length > 0 ? 198 : 112;
  const DISPERSED_CAMPING_ROUTE_SUMMARY_STACK_HEIGHT =
    dispersedCampingRouteResults.length > 0
      ? dispersedCampingCampScoutStatus
        ? 214
        : 190
      : dispersedCampingCampScoutStatus
        ? 132
        : 116;
  const remotenessLegendVisible =
    remotenessOverlayHasVisibleLayer && (showRemotenessOverlay || remotenessLegendMounted);
  const remotenessLegendTopOffset =
    topRouteSurfaceVisible
      ? roadNavigationSurfaceTopOffset +
        activeGuidanceRenderedHeight +
        OVERLAY_GAP
      : MAP_TOP_CONTROL_ROW;
  const establishedCampsitesRouteSummaryVisible =
    establishedCampsitesLayer.enabled && establishedCampsitesRouteHasRoute;
  const dispersedCampingLegendBottom = bottomLeftMapOverlayStackBottom;
  const campLayerRouteSummaryStackBottom = Math.max(
    lowerMapOverlayStackBottom,
    dispersedCampingEligibilityLayer.enabled
      ? dispersedCampingLegendBottom + DISPERSED_CAMPING_LEGEND_STACK_HEIGHT + OVERLAY_GAP
      : lowerMapOverlayStackBottom,
  );
  const establishedCampsitesRouteSummaryBottom =
    campLayerRouteSummaryStackBottom;
  const dispersedCampingRouteSummaryVisible =
    dispersedCampingEligibilityLayer.enabled && dispersedCampingRouteHasRoute;
  const dispersedCampingRouteSummaryBottom =
    campLayerRouteSummaryStackBottom +
    (establishedCampsitesRouteSummaryVisible
      ? ESTABLISHED_CAMPSITES_ROUTE_SUMMARY_STACK_HEIGHT + OVERLAY_GAP
      : 0);
  const dispersedCampingScoutPinsClearBottom =
    establishedCampsitesRouteSummaryVisible
      ? establishedCampsitesRouteSummaryBottom + ESTABLISHED_CAMPSITES_ROUTE_SUMMARY_STACK_HEIGHT + OVERLAY_GAP
      : campLayerRouteSummaryStackBottom;
  const campLayerDetailBottomOffset = Math.max(
    LOWER_DOCK_EXCLUSION,
    COMPASS_BOTTOM + COMPASS_SIZE + OVERLAY_GROUP_GAP,
    establishedCampsitesRouteSummaryVisible
      ? establishedCampsitesRouteSummaryBottom +
        ESTABLISHED_CAMPSITES_ROUTE_SUMMARY_STACK_HEIGHT +
        OVERLAY_GAP
      : 0,
    dispersedCampingRouteSummaryVisible
      ? dispersedCampingRouteSummaryBottom +
        DISPERSED_CAMPING_ROUTE_SUMMARY_STACK_HEIGHT +
        OVERLAY_GAP
      : 0,
    dispersedCampingEligibilityLayer.enabled
      ? dispersedCampingLegendBottom + DISPERSED_CAMPING_LEGEND_STACK_HEIGHT + OVERLAY_GAP
      : 0,
    exploreRoutesEnabled ? bottomLeftMapOverlayStackBottom + 42 + OVERLAY_GAP : 0,
  );
  const campOpsRouteLifecycleNotice =
    CAMPOPS_ROUTE_PINS_ENABLED &&
    campOpsRouteLifecycle.message &&
    (campOpsRouteLifecycle.status === 'loading' ||
      campOpsRouteLifecycle.status === 'empty' ||
      campOpsRouteLifecycle.status === 'error')
      ? campOpsRouteLifecycle.message
      : null;
  const routeBottomRightInset = ACTIVE_GUIDANCE_RIGHT_INSET;
  const routeIndicatorVisible = topStatusOverlaysVisible && navigationOverlayMode !== 'preview';
  const gpsStatusOverlayVisible = mapOverlayStartupReady && !mapLoading && topStatusOverlaysVisible;
  const campsiteDrawControlsVisible =
    !routeBuilderActive &&
    mapOverlayStartupReady &&
    campScoutAreaMode !== 'idle';
  const campsiteAreaTopHeight = 0;
  const polygonCampTopHeight = 0;
  const topToolboxStackHeight = (() => {
    const contextualTopHeight = campsiteAreaTopHeight || polygonCampTopHeight;
    if (!contextualTopHeight) return 0;
    return contextualTopHeight;
  })();
  const routeIndicatorAnchoredToTopToolbox = topToolboxStackHeight > 0;
  const routeIndicatorTopOffset = routeIndicatorAnchoredToTopToolbox
    ? MAP_TOP_CONTROL_ROW + topToolboxStackHeight + OVERLAY_GAP
    : TOP_STATUS_STACK_START;

  const hideWeatherTopOverlays = !topStatusOverlaysVisible || topRouteSurfaceVisible;

  useEffect(() => {
    const activeSessionKey =
      roadSession.sessionId ??
      (roadSession.destination?.id ? `destination:${roadSession.destination.id}` : null);

    if (navigationOverlayMode !== 'active') {
      setActiveGuidanceMinimized(false);
      setActiveGuidanceManualOverride(false);
      activeGuidanceAutoMinimizeSinceRef.current = null;
      activeGuidanceSessionKeyRef.current = activeSessionKey;
      if (activeGuidanceAutoMinimizeTimerRef.current) {
        clearTimeout(activeGuidanceAutoMinimizeTimerRef.current);
        activeGuidanceAutoMinimizeTimerRef.current = null;
      }
      return;
    }

    if (activeGuidanceSessionKeyRef.current !== activeSessionKey) {
      activeGuidanceSessionKeyRef.current = activeSessionKey;
      setActiveGuidanceMinimized(false);
      setActiveGuidanceManualOverride(false);
      activeGuidanceAutoMinimizeSinceRef.current = null;
      if (activeGuidanceAutoMinimizeTimerRef.current) {
        clearTimeout(activeGuidanceAutoMinimizeTimerRef.current);
        activeGuidanceAutoMinimizeTimerRef.current = null;
      }
    }
  }, [navigationOverlayMode, roadSession.destination?.id, roadSession.sessionId]);

const handleTopToolboxLayout = useCallback(
    (key: 'routeBuilder' | 'campsiteArea' | 'polygonCamp', height: number) => {
      setTopToolboxHeights((current) => {
        if (Math.abs(current[key] - height) < 1) return current;
        return { ...current, [key]: height };
      });
    },
    [],
  );

  useEffect(() => {
    setDashboardExpanded(navigateLandscapeExpanded);
    if (!navigateLandscapeExpanded) {
      hideDashboardDockReveal();
    }
  }, [navigateLandscapeExpanded]);

  useEffect(() => () => {
    setDashboardExpanded(false);
    hideDashboardDockReveal();
  }, []);

  const handleRevealNavigateDock = useCallback(() => {
    revealDashboardDock(5000);
  }, []);

  const handleToggleActiveGuidanceMinimized = useCallback(() => {
    setActiveGuidanceMinimized((current) => {
      if (current) {
        setActiveGuidanceManualOverride(true);
        activeGuidanceAutoMinimizeSinceRef.current = null;
        if (activeGuidanceAutoMinimizeTimerRef.current) {
          clearTimeout(activeGuidanceAutoMinimizeTimerRef.current);
          activeGuidanceAutoMinimizeTimerRef.current = null;
        }
        return false;
      }

      return true;
    });
  }, []);

  const shouldAutoMinimizeActiveGuidance =
    navigationOverlayMode === 'active' &&
    !activeGuidanceManualOverride &&
    !activeGuidanceMinimized &&
    (roadSession.status === 'navigation_active' || roadSession.status === 'rerouting') &&
    (
      roadSession.routeConfidenceState === 'temporary_deviation' ||
      roadSession.routeConfidenceState === 'off_route' ||
      roadSession.isOffRoute
    );

  useEffect(() => {
    if (activeGuidanceAutoMinimizeTimerRef.current) {
      clearTimeout(activeGuidanceAutoMinimizeTimerRef.current);
      activeGuidanceAutoMinimizeTimerRef.current = null;
    }

    if (!shouldAutoMinimizeActiveGuidance) {
      activeGuidanceAutoMinimizeSinceRef.current = null;
      return;
    }

    const now = Date.now();
    const candidateSince =
      activeGuidanceAutoMinimizeSinceRef.current ?? now;
    activeGuidanceAutoMinimizeSinceRef.current = candidateSince;
    const remainingMs = ACTIVE_GUIDANCE_AUTO_MINIMIZE_MS - (now - candidateSince);

    if (remainingMs <= 0) {
      setActiveGuidanceMinimized(true);
      return;
    }

    activeGuidanceAutoMinimizeTimerRef.current = setTimeout(() => {
      setActiveGuidanceMinimized(true);
      activeGuidanceAutoMinimizeTimerRef.current = null;
    }, remainingMs);

    return () => {
      if (activeGuidanceAutoMinimizeTimerRef.current) {
        clearTimeout(activeGuidanceAutoMinimizeTimerRef.current);
        activeGuidanceAutoMinimizeTimerRef.current = null;
      }
    };
  }, [
    roadSession.isOffRoute,
    roadSession.routeConfidenceState,
    roadSession.status,
    roadSession.updatedAt,
    shouldAutoMinimizeActiveGuidance,
  ]);

  useEffect(() => {
    if (!selectedCampIntelId && campIntelComparisonVisible) {
      setCampIntelComparisonVisible(false);
    }
  }, [campIntelComparisonVisible, selectedCampIntelId]);

  useEffect(() => {
    if (!selectedCampIntelId) return;
    if (navigateMajorPanelVisible || roadStepListExpanded || !campIntelVisible) {
      setSelectedCampIntelId(null);
    }
  }, [
    campIntelVisible,
    navigateMajorPanelVisible,
    roadStepListExpanded,
    selectedCampIntelId,
  ]);

  useEffect(() => {
    if (!navigateMajorPanelVisible || !roadStepListExpanded) return;
    setRoadStepListExpanded(false);
  }, [
    navigateMajorPanelVisible,
    roadStepListExpanded,
    setRoadStepListExpanded,
  ]);

  useEffect(() => {
    if (!roadStepListExpanded || navigationOverlayMode !== 'preview') return;
    setRoadStepListExpanded(false);
  }, [
    navigationOverlayMode,
    roadStepListExpanded,
    setRoadStepListExpanded,
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
        if (selectedExploreRouteSegmentId) {
          setSelectedExploreRouteSegmentId(null);
          return true;
        }
        if (roadStepListExpanded) {
          setRoadStepListExpanded(false);
          return true;
        }
        if (selectedCampIntelId) {
          setSelectedCampIntelId(null);
          return true;
        }
        if (selectedCampScoutCandidateId) {
          setSelectedCampScoutCandidateId(null);
          return true;
        }
        if (selectedCampOpsEndpointId) {
          setSelectedCampOpsEndpointId(null);
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
      roadStepListExpanded,
      setRoadStepListExpanded,
      selectedCampIntelId,
      selectedCampScoutCandidateId,
      selectedCampOpsEndpointId,
      selectedExploreRouteSegmentId,
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
    if (!selectedCampScoutCandidateId) return;
    if (
      !campScoutCandidatesShown.some((candidate) => candidate.id === selectedCampScoutCandidateId) &&
      !dispersedCampingCampScoutCandidates.some((candidate) => candidate.id === selectedCampScoutCandidateId)
    ) {
      setSelectedCampScoutCandidateId(null);
    }
  }, [campScoutCandidatesShown, dispersedCampingCampScoutCandidates, selectedCampScoutCandidateId]);

  useEffect(() => {
    if (!selectedCampOpsEndpointId) return;
    if (!campOpsMapMarkers.some((marker) => marker.campOpsCandidateId === selectedCampOpsEndpointId)) {
      setSelectedCampOpsEndpointId(null);
      setSelectedCampIntelId(null);
    }
  }, [campOpsMapMarkers, selectedCampOpsEndpointId]);

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

  const navigationStartReadinessStack = (() => {
    const route = roadNavigation.session.route;
    const routeHasGeometry =
      (route?.geometry?.length ?? 0) > 1 ||
      (exploreNavigationPayload?.trailGeometry?.length ?? 0) > 1 ||
      (activeRun?.points?.length ?? 0) > 1;
    const routeConfidence = deriveRouteConfidence(
      buildRouteConfidenceInputFromPreview({
        payload: exploreNavigationPayload,
        activeRun,
        routeHasGeometry,
      }),
    );
    const offlineReadiness = deriveOfflineReadiness({
      cacheSnapshot: evaluateCacheReadiness(),
      runCacheManifest: activeRun?.offline_cache ?? null,
      currentRouteContext: route
        ? {
            routeId: route.id,
            destination: {
              lat: route.destination.coordinate.lat,
              lng: route.destination.coordinate.lng,
              label: route.destination.title,
            },
            geometry: route.geometry,
            mapStyle,
            // Campsite layers stay outside tile readiness until their data is cache-backed.
            requiredLayers: ['route-corridor', 'road-preview'],
          }
        : null,
      downloadedRoutes: offlineRouteReadinessState.routes,
      tileRegions: navigateTileCacheSnapshot.regions,
      tileSyncJobs: offlineTileSyncSnapshot.jobs,
      routeSyncHydrated: offlineRouteReadinessState.hydrated,
    });

    return buildRouteGuidanceReadinessViewModel({
      routeId: exploreNavigationPayload?.id ?? activeRun?.id ?? route?.id ?? roadNavigation.session.destination?.id ?? null,
      routeType: explorePreviewMode ?? exploreNavigationPayload?.tripMode ?? 'road',
      vehicleFit: extractStartGuidanceVehicleFit(exploreNavigationPayload),
      routeConfidence,
      offlineReadiness,
      campIntelSites,
      isCustomRoute: isCustomNavigationPreview(exploreNavigationPayload, activeRun),
      routeConfidenceSummary: navigateRouteConfidenceSummary,
    });
  })();

  useEffect(() => {
    startGuidanceReviewReasonsRef.current =
      getRouteGuidanceStartReviewReasons(navigationStartReadinessStack);
  }, [navigationStartReadinessStack]);

  const handlePrepareOfflineFromRoadPreview = useCallback(async () => {
    hapticCommand();
    const route = roadNavigation.session.route;
    if (!route || route.geometry.length < 2) {
      setRequestBoundsTrigger((prev) => prev + 1);
      openTopPopup('offlineCache');
      showToast('ROUTE PREVIEW NEEDS GPS BEFORE OFFLINE PREP');
      return;
    }

    if (!liveNavigateServicesEnabled) {
      showToast('CANNOT DOWNLOAD ROUTE OFFLINE DATA - LIVE SERVICES UNAVAILABLE');
      return;
    }

    const previewRun = createRoadPreviewRunFromRoute(route, activeRun?.build_snapshot ?? null);
    const analysis = analyzeRoute(previewRun);
    if (!analysis) {
      showToast('ROUTE OFFLINE ANALYSIS UNAVAILABLE');
      return;
    }

    const routeIntent = buildRouteIntentForRoadPreview({
      route,
      analysis,
      mapStyle,
      readinessSnapshot: navigationStartReadinessStack,
    });
    const region = tileCacheStore.createFromBounds(
      `Route: ${route.destination.title}`,
      analysis.corridorBounds,
      analysis.zoomMin,
      analysis.zoomMax,
      mapStyle,
    );
    tileCacheStore.updateRegion(region.id, {
      routeId: previewRun.id,
      sourceType: 'route-corridor',
      syncType: 'route',
      corridorMiles: analysis.bufferMiles,
      routeIntent: routeIntent as unknown as Record<string, unknown>,
    });

    try {
      const cachedRoute = await cacheOfflineRoute({
        run: previewRun,
        health: computeRunHealth(previewRun),
        offlineTileRegionId: region.id,
        tileCacheStatus: 'downloading',
        routeIntent,
        segmentRiskAnalysis: navigationStartReadinessStack,
        includeRemoteConnectivityCache: true,
      });
      runStore.upsert({
        ...previewRun,
        offline_cache: offlineCachedRouteToRunCacheManifest(cachedRoute, previewRun),
      });
      setOfflineRouteReadinessState((prev) => ({
        hydrated: true,
        routes: [cachedRoute, ...prev.routes.filter((route) => route.id !== cachedRoute.id)],
      }));
      loadRuns();
    } catch (error) {
      await tileCacheStore.deleteRegion(region.id).catch(() => {});
      showToast(error instanceof Error ? error.message : 'ROUTE OFFLINE METADATA SAVE FAILED');
      return;
    }

    closeTopPopup('offlineCache');
    setToolsMenuOpen(false);
    showToast('ROUTE OFFLINE SYNC STARTED');

    void offlineTileSyncCoordinator
      .startRegionSync({
        regionId: region.id,
        source: 'route-corridor',
        syncType: 'route',
        regionName: region.name,
        routeIntent: routeIntent as unknown as Record<string, unknown>,
      })
      .then(async (job) => {
        const tileCacheStatus =
          job.status === 'complete'
            ? 'complete'
            : job.status === 'cancelled'
              ? 'not_requested'
              : 'failed';
        const updated = await cacheOfflineRoute({
          run: previewRun,
          health: computeRunHealth(previewRun),
          offlineTileRegionId: region.id,
          tileCacheStatus,
          tileCacheError: job.errorMessage ?? null,
          routeIntent,
          segmentRiskAnalysis: navigationStartReadinessStack,
          includeRemoteConnectivityCache: true,
        });
        runStore.upsert({
          ...previewRun,
          offline_cache: offlineCachedRouteToRunCacheManifest(updated, previewRun),
        });
        setOfflineRouteReadinessState((prev) => ({
          hydrated: true,
          routes: [updated, ...prev.routes.filter((route) => route.id !== updated.id)],
        }));
        loadRuns();
      })
      .catch(async (error: unknown) => {
        const failed = await cacheOfflineRoute({
          run: previewRun,
          health: computeRunHealth(previewRun),
          offlineTileRegionId: region.id,
          tileCacheStatus: 'failed',
          tileCacheError: error instanceof Error ? error.message : 'Route offline sync failed',
          routeIntent,
          segmentRiskAnalysis: navigationStartReadinessStack,
          includeRemoteConnectivityCache: true,
        }).catch(() => null);
        if (failed) {
          setOfflineRouteReadinessState((prev) => ({
            hydrated: true,
            routes: [failed, ...prev.routes.filter((route) => route.id !== failed.id)],
          }));
        }
        loadRuns();
      });
  }, [
    activeRun?.build_snapshot,
    closeTopPopup,
    liveNavigateServicesEnabled,
    loadRuns,
    mapStyle,
    navigationStartReadinessStack,
    openTopPopup,
    roadNavigation.session.route,
    showToast,
  ]);

  useEffect(() => {
    if (!pendingOfflineRoutePackageFlowId) return;
    setPendingOfflineRoutePackageFlowId(null);
    void handlePrepareOfflineFromRoadPreview()
      .then(() => {
        setRequestBoundsTrigger((prev) => prev + 1);
        openTopPopup('offlineCache');
      })
      .catch((error: unknown) => {
        showToast(error instanceof Error ? error.message : 'ROUTE OFFLINE PACKAGE COULD NOT OPEN');
      });
  }, [handlePrepareOfflineFromRoadPreview, openTopPopup, pendingOfflineRoutePackageFlowId, showToast]);

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
            ? 'Ready to start this route? Use overview to confirm the full path, then begin guidance when ready.'
            : 'Destination selected. ECS is preparing the route preview.'),
        primaryActionLabel: 'Start Route',
        primaryActionDisabled: !route || (!navigateOperationalState.liveRoutingAvailable && !navigateOperationalState.hasRouteSupport),
        showSteps: false,
        showOverview: !!route,
        overviewLabel: 'Route Preview',
        dismissLabel: 'Not Yet',
        arrivalMessage: 'Visual guidance complete.',
        readinessStack: navigationStartReadinessStack,
        routeConfidenceSummary: navigateRouteConfidenceSummary,
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
            ? 'Ready to start this trail? Review the highlighted line, then begin guidance when ready.'
            : 'Destination marker loaded. Trail geometry is not available for this route yet.'),
        primaryActionLabel: hasTrailGeometry
          ? importedPreviewSourceLabel
            ? `Start ${importedPreviewSourceLabel}`
            : 'Start Trail'
          : 'Preview Only',
        primaryActionDisabled: !hasTrailGeometry,
        showSteps: false,
        showOverview: hasTrailGeometry,
        overviewLabel: 'Route Preview',
        dismissLabel: 'Not Yet',
        arrivalMessage: 'Expedition route complete.',
        readinessStack: navigationStartReadinessStack,
        routeConfidenceSummary: navigateRouteConfidenceSummary,
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
        noteText: previewOperationalNote ?? 'Ready to start this hybrid route? Preview the road approach and trail transition, then begin when ready.',
        primaryActionLabel: 'Start Hybrid',
        primaryActionDisabled: !route || (!navigateOperationalState.liveRoutingAvailable && !navigateOperationalState.hasRouteSupport),
        showSteps: false,
        showOverview: true,
        overviewLabel: 'Route Preview',
        dismissLabel: 'Not Yet',
        arrivalMessage: 'Road approach complete. Trail preview remains loaded.',
        readinessStack: navigationStartReadinessStack,
        routeConfidenceSummary: navigateRouteConfidenceSummary,
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
          ? 'Ready to start this route? Confirm the overview, then begin navigation when you are ready to move.'
          : 'Preparing route preview.'),
      primaryActionLabel: 'Start Route',
      primaryActionDisabled: !route || (!navigateOperationalState.liveRoutingAvailable && !navigateOperationalState.hasRouteSupport),
      showSteps: false,
      showOverview: !!route,
      overviewLabel: 'Route Preview',
      dismissLabel: 'Not Yet',
      arrivalMessage: 'Visual guidance complete.',
      readinessStack: navigationStartReadinessStack,
      routeConfidenceSummary: navigateRouteConfidenceSummary,
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
    navigationStartReadinessStack,
    navigateRouteConfidenceSummary,
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
          routeApproaching
            ? 'Arriving at destination'
            : routeUpdating
            ? 'Updating route guidance'
            : roadNavigation.session.nextInstruction ?? 'Continue on highlighted route',
        distanceLabel: routeUpdating
          ? 'UPDATING'
          : formatNavMeters(
              routeApproaching
                ? roadNavigation.session.distanceToDestinationM ??
                    roadNavigation.session.nextInstructionDistanceM
                : roadNavigation.session.nextInstructionDistanceM,
            ),
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
    roadNavigation.session.distanceToDestinationM,
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

  useEffect(() => {
    const lifecycle =
      routeLifecycleState.phase === 'navigating'
        ? 'active'
        : routeLifecycleState.phase === 'completed'
          ? 'arrived'
          : routeLifecycleState.shouldRenderPreview
            ? 'preview'
            : 'inactive';

    if (lifecycle === 'inactive') {
      const currentRouteSnapshot = navigateRouteSessionStore.getSnapshot();
      if (
        currentRouteSnapshot.lifecycle === 'active' &&
        currentRouteSnapshot.source === 'run' &&
        (!activeRun || currentRouteSnapshot.routeId === activeRun.id)
      ) {
        return;
      }
      navigateRouteSessionStore.clear();
      return;
    }

    const context = lifecycle === 'preview' ? navigationPreviewContext : navigationActiveContext;
    if (!context) {
      navigateRouteSessionStore.clear();
      return;
    }

    const usingTrailSession =
      pendingHybridTrailTransition ||
      trailNavigation.uiMode === 'active' ||
      trailNavigation.uiMode === 'arrived' ||
      trailNavigation.uiMode === 'preview';
    const source =
      context.tripMode === 'hybrid'
        ? 'hybrid'
        : context.tripMode === 'trail' || usingTrailSession
          ? 'trail'
          : context.tripMode === 'road'
            ? 'road'
            : 'run';
    const routeDistance = roadNavigation.session.route?.distanceM ?? null;
    const roadProgressPercent =
      routeDistance != null &&
      routeDistance > 0 &&
      roadNavigation.session.remainingDistanceM != null
        ? Math.max(0, Math.min(100, (1 - roadNavigation.session.remainingDistanceM / routeDistance) * 100))
        : null;
    const currentLocation =
      userLocation != null
        ? { latitude: userLocation.lat, longitude: userLocation.lng }
        : gps.position
          ? { latitude: gps.position.latitude, longitude: gps.position.longitude }
          : null;
    const routeId =
      trailNavigation.session.payload?.id ??
      roadNavigation.session.destination?.id ??
      activeRun?.id ??
      null;
    const sessionId =
      trailNavigation.session.sessionId ??
      roadNavigation.session.sessionId ??
      activeRun?.id ??
      null;
    const roadRerouting = !usingTrailSession && roadNavigation.session.status === 'rerouting';
    const roadOffRoute = !usingTrailSession && roadNavigation.session.isOffRoute;
    const trailOffRoute = usingTrailSession && trailNavigation.session.status === 'off_trail';
    const routeStatusKind =
      lifecycle === 'arrived'
        ? 'arrived'
        : roadRerouting
          ? 'rerouting'
          : roadOffRoute || trailOffRoute
            ? 'off_route'
            : 'nominal';

    navigateRouteSessionStore.setSnapshot({
      sessionId,
      lifecycle,
      source,
      routeId,
      routeTitle: context.title,
      routeSubtitle: context.subtitle ?? null,
      statusLabel: context.statusText ?? (lifecycle === 'active' ? 'Route active' : 'Route staged'),
      instruction:
        'instruction' in context
          ? context.instruction ?? null
          : context.noteText ?? null,
      routePoints: displayedRoutePoints,
      progressPoints: displayedRouteProgressPoints,
      currentLocation,
      headingDeg: gps.position?.headingDeg ?? null,
      remainingDistanceM: usingTrailSession
        ? trailNavigation.session.remainingDistanceM
        : roadNavigation.session.remainingDistanceM,
      remainingDurationS: usingTrailSession ? null : roadNavigation.session.remainingDurationS,
      etaIso: usingTrailSession ? null : roadNavigation.session.etaIso,
      progressPercent: usingTrailSession
        ? trailNavigation.session.progressPercent
        : roadProgressPercent,
      nextInstructionDistanceM: usingTrailSession
        ? trailNavigation.session.nextInstructionDistanceM
        : roadNavigation.session.nextInstructionDistanceM,
      isRerouting: roadRerouting,
      isOffRoute: roadOffRoute || trailOffRoute,
      offRouteDistanceM: trailOffRoute
        ? trailNavigation.session.rejoinDistanceM
        : roadOffRoute
          ? roadNavigation.session.offRouteDistanceM
          : null,
      routeStatusKind,
      updatedAt:
        trailNavigation.session.updatedAt ??
        roadNavigation.session.updatedAt ??
        new Date().toISOString(),
    });
  }, [
    activeRun,
    displayedRoutePoints,
    displayedRouteProgressPoints,
    gps.position,
    navigationActiveContext,
    navigationPreviewContext,
    pendingHybridTrailTransition,
    routeLifecycleState,
    roadNavigation.session.destination?.id,
    roadNavigation.session.etaIso,
    roadNavigation.session.isOffRoute,
    roadNavigation.session.nextInstructionDistanceM,
    roadNavigation.session.offRouteDistanceM,
    roadNavigation.session.remainingDistanceM,
    roadNavigation.session.remainingDurationS,
    roadNavigation.session.route?.distanceM,
    roadNavigation.session.sessionId,
    roadNavigation.session.status,
    roadNavigation.session.updatedAt,
    trailNavigation.session.nextInstructionDistanceM,
    trailNavigation.session.payload?.id,
    trailNavigation.session.progressPercent,
    trailNavigation.session.rejoinDistanceM,
    trailNavigation.session.remainingDistanceM,
    trailNavigation.session.sessionId,
    trailNavigation.session.status,
    trailNavigation.session.updatedAt,
    trailNavigation.uiMode,
    userLocation,
  ]);

  const commandOverlayMode =
    navigationOverlayMode === 'search' ? 'idle' : navigationOverlayMode;

  const navigateCommandState = useMemo(() => (
    selectNavigateCommandState({
      navigateView,
      overlayMode: commandOverlayMode,
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
    commandOverlayMode,
    navigationOverlayMode,
    navigationPreviewContext,
    weatherSeveritySummary,
  ]);

  const navigateHeaderGuidance = useMemo(() => {
    if (navigateCommandState.headerGuidance) {
      return {
        eyebrow: navigateCommandState.headerGuidance.eyebrow ?? undefined,
        title: navigateCommandState.headerGuidance.title,
        detail: navigateCommandState.headerGuidance.detail,
        tone: navigateCommandState.headerGuidance.tone,
      };
    }

    return null;
  }, [navigateCommandState.headerGuidance]);

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

  const navigateRoutePreviewPayload = useMemo<NavigationHandoffPayload | null>(() => {
    if (trailNavigation.session.payload) return trailNavigation.session.payload;
    if (exploreNavigationPayload) return exploreNavigationPayload;
    const roadPayload = buildNavigationPayloadFromRoadRoute(roadNavigation.session.route);
    if (roadPayload) return roadPayload;
    return activeRun ? buildNavigationPayloadFromRun(activeRun) : null;
  }, [
    activeRun,
    exploreNavigationPayload,
    roadNavigation.session.route,
    trailNavigation.session.payload,
  ]);

  const fitMapToNavigateRoutePreview = useCallback((
    payload: NavigationHandoffPayload | null,
  ): boolean => {
    if (!payload) return false;

    const routePoints = getExploreRoutePreviewRoutePoints(payload);
    const { command } = buildExploreRoutePreviewCameraCommand(routePoints, 84);
    if (!command) return false;

    queueMapCameraCommand({
      ...command,
      durationMs: command.durationMs ?? 650,
      animate: true,
      reason: 'navigate_route_preview_overview',
    }, { force: true });
    setFollowUser(false);
    return true;
  }, [queueMapCameraCommand]);

  const handleRouteOverview = useCallback(() => {
    hapticMicro();

    if (navigationOverlayMode === 'preview') {
      closeNavigateDetailSurfaces();
      setToolsMenuOpen(false);
      setActiveTopPopup(null);
      if (fitMapToNavigateRoutePreview(navigateRoutePreviewPayload)) {
        return;
      }
    }

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
    closeNavigateDetailSurfaces,
    fitMapToNavigateRoutePreview,
    navigateRoutePreviewPayload,
    navigationOverlayMode,
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


    // -- Trail recording integration --------------------------
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

useEffect(() => {
  if (trailNavigation.uiMode !== 'arrived') {
    autoStoppedTrailRecordingRef.current = null;
    return;
  }

  const trailRecordingStatus = trailStore.getStatus();
  if (trailRecordingStatus !== 'recording' && trailRecordingStatus !== 'paused') return;

  const sessionKey =
    trailSession.payload?.id ??
    trailSession.status ??
    'arrived-trail';
  if (autoStoppedTrailRecordingRef.current === sessionKey) return;

  autoStoppedTrailRecordingRef.current = sessionKey;
  const pointsBeforeStop = trailStore.getStats().point_count;
  trailStore.stop(activeExpeditionName || trailSession.payload?.title || null);
  refreshTrailState();
  setTrailHistoryRefreshKey((key) => key + 1);
  showToast(
    pointsBeforeStop > 0
      ? 'Trail complete. ECS saved the recording in Trail Status.'
      : 'Trail complete. Recording ended with no GPS points saved.',
  );
}, [
  activeExpeditionName,
  refreshTrailState,
  showToast,
  trailNavigation.uiMode,
  trailSession.payload?.id,
  trailSession.payload?.title,
  trailSession.status,
]);

// GPS-based trail recording
useEffect(() => {
  const rawPosition = gps.rawGPS.position ?? gps.position;
  const hasFix = gps.rawGPS.hasFix || gps.hasFix;
  const timestamp = rawPosition?.timestamp ?? null;

  if (!hasFix || !rawPosition || timestamp == null) {
    return;
  }

  if (lastTrailGpsTimestampRef.current === timestamp) {
    return;
  }
  lastTrailGpsTimestampRef.current = timestamp;

  if (trailStore.getStatus() !== 'recording') {
    return;
  }

  const recorded = trailStore.recordPoint({
    lat: rawPosition.latitude,
    lng: rawPosition.longitude,
    elevation: rawPosition.altitudeFt != null ? rawPosition.altitudeFt / 3.28084 : null,
    speed: rawPosition.speedMph ?? 0,
    heading: rawPosition.headingDeg ?? null,
  });

  if (recorded) refreshTrailState();
}, [
  gps.hasFix,
  gps.position,
  gps.rawGPS.hasFix,
  gps.rawGPS.position,
  refreshTrailState,
]);

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

  const handleTrailExportAction = useCallback((format: 'gpx' | 'json' | 'coords' | 'pdf') => {
    let content = '';
    const expeditionPins = activeExpeditionId ? pinStore.getByExpedition(activeExpeditionId) : [];
    switch (format) {
      case 'gpx': content = trailStore.exportToGPX(expeditionPins, activeExpeditionName || 'ECS Trail'); break;
      case 'json': content = trailStore.exportToJSON(); break;
      case 'coords': content = trailStore.exportCoordinatesList(); break;
      case 'pdf': {
        const stats = trailStore.getStats();
        const coordinates = trailStore.exportCoordinatesList();
        const waypointLines = expeditionPins.map((pin, index) => {
          const label = pin.title || `Point ${index + 1}`;
          return `- ${label}: ${pin.lat.toFixed(5)}, ${pin.lng.toFixed(5)}`;
        });
        content = [
          'ECS TRAIL PDF EXPORT PACKET',
          `Trail: ${activeExpeditionName || 'Manual recorded trail'}`,
          `Distance: ${stats.distance_miles.toFixed(2)} mi`,
          `Elapsed: ${stats.elapsed_formatted}`,
          `Recorded points: ${stats.point_count}`,
          `Stops/campsites/waypoints/pins: ${expeditionPins.length}`,
          '',
          'Exporter input:',
          '- route/trail path: recorded GPS point stream',
          '- points: coordinate list below',
          '- stops/campsites/waypoints: expedition pins listed below',
          '- navigation details: trail stats, replay points, and saved history metadata',
          '',
          'Waypoints / stops / campsites:',
          waypointLines.length > 0 ? waypointLines.join('\n') : '- none attached',
          '',
          'Trail coordinates:',
          coordinates,
        ].join('\n');
        break;
      }
    }
    if (Platform.OS === 'web' && navigator.clipboard) {
      navigator.clipboard.writeText(content).then(() => {
        showToast(
          format === 'pdf'
            ? 'TRAIL PDF EXPORT PACKET COPIED TO CLIPBOARD'
            : `TRAIL ${format.toUpperCase()} COPIED TO CLIPBOARD`,
        );
      }).catch(() => showToast('COPY FAILED'));
    } else {
      showToast(format === 'pdf' ? 'TRAIL PDF EXPORT READY' : `TRAIL EXPORTED AS ${format.toUpperCase()}`);
    }
    setTrailExportVisible(false);
  }, [activeExpeditionId, activeExpeditionName, showToast]);

  // -- Trail replay handlers ------------------------
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

  // -- Trail history handlers -----------------------
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

  // -- Speed bucket segments for heatmap rendering ----------
  const speedBucketSegments: SpeedSegmentData[] = useMemo(() => {
    if (trailStyle !== 'speed') return [];
    try {
      return trailStore.getSpeedBucketSegments() as SpeedSegmentData[];
    } catch { return []; }
  }, [trailStyle]);

//
// MapRenderer stability layer (prevents re-render storms)
//

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
const toolsChildPanelVisible = toolsMenuOpen && isToolsChildPopup(activeTopPopup);
const toolsPopupVisible = mapOverlayStartupReady && toolsMenuOpen && !toolsChildPanelVisible;
useEffect(() => {
  if (!toolsMenuOpen) {
    setRecentSearchesVisible(false);
  }
}, [toolsMenuOpen]);
const showIntelPopup = intelOpen && isMapUIReady;
const activeImportedRoute = routeStore.getActive();
useEffect(() => {
  let cancelled = false;
  void hydrateExploreFavoritesStore().finally(() => {
    if (!cancelled) {
      setSavedRoutesRefreshKey((key) => key + 1);
    }
  });

  const unsubscribe = subscribeExploreFavorites(() => {
    setSavedRoutesRefreshKey((key) => key + 1);
  });

  return () => {
    cancelled = true;
    unsubscribe();
  };
}, []);

const savedRouteAssets = useMemo(
  () => {
    void customRouteRefreshKey;
    void runs.length;
    void savedRoutesRefreshKey;
    return getSavedRouteAssets();
  },
  [customRouteRefreshKey, runs, savedRoutesRefreshKey],
);
const savedRouteAssetCounts = useMemo(
  () => calculateSavedRouteAssetCounts(savedRouteAssets),
  [savedRouteAssets],
);
const visibleSavedRouteAssets = useMemo(
  () => filterSavedRouteAssets(savedRouteAssets, savedRoutesFilter, savedRoutesQuery),
  [savedRouteAssets, savedRoutesFilter, savedRoutesQuery],
);
const savedRoutesEmptyState = useMemo(
  () => getSavedRouteAssetEmptyState(savedRoutesFilter),
  [savedRoutesFilter],
);
const savedRoutesVisibleEmptyState = useMemo(
  () =>
    savedRoutesQuery.trim()
      ? {
          title: 'No route matches',
          message: 'Clear search or switch filters to widen the route command view.',
        }
      : savedRoutesEmptyState,
  [savedRoutesEmptyState, savedRoutesQuery],
);
const preflightRouteAsset = useMemo(
  () => savedRouteAssets.find((asset) => asset.id === preflightRouteAssetId) ?? null,
  [preflightRouteAssetId, savedRouteAssets],
);
const preflightRun = useMemo(() => {
  void runs.length;
  const runId = preflightRunId ?? preflightRouteAsset?.runId ?? null;
  return runId ? runStore.getById(runId) : null;
}, [preflightRouteAsset?.runId, preflightRunId, runs]);
const preflightPacket = useMemo<ExpeditionPreflightRoutePacket | null>(
  () =>
    buildExpeditionPreflightRoutePacket({
      asset: preflightRouteAsset,
      run: preflightRun,
      payload: preflightPayload,
      weatherSnapshot: operationalWeather.snapshot,
      missionBrief: visibleMissionBrief,
      vehicleContext: navigateVehicleContext,
      routeHazard: routeHazardIntel,
    }),
  [
    navigateVehicleContext,
    operationalWeather.snapshot,
    preflightPayload,
    preflightRouteAsset,
    preflightRun,
    routeHazardIntel,
    visibleMissionBrief,
  ],
);
const launchExpeditionRecord = useMemo(() => {
  void expeditionSessionRevision;
  return expeditionStateStore.getCurrentExpedition();
}, [expeditionSessionRevision]);
const launchExpeditionAlreadyActive = launchExpeditionRecord?.state === 'active';
const preflightLaunchPrerequisites = useMemo(() => {
  const missing: string[] = [];
  const warnings: string[] = [];

  if (!preflightPacket) {
    missing.push('Preflight packet is not available.');
  }
  if (!preflightRouteAsset) {
    missing.push('Route asset is not selected.');
  } else if (!preflightRouteAsset.capabilities.canNavigate) {
    missing.push('Selected route cannot launch navigation.');
  }
  if (!navigateVehicleContext.hasActiveVehicleId || !navigateVehicleContext.activeVehicleId) {
    missing.push('Vehicle profile is not selected.');
  }
  if (preflightPacket?.readiness.status === 'incomplete') {
    missing.push('Vehicle readiness context is incomplete.');
  } else if (preflightPacket?.readiness.status === 'watch') {
    warnings.push('Vehicle readiness has items to verify.');
  }
  if (preflightPacket?.weather.caution) {
    warnings.push(preflightPacket.weather.caution);
  }
  if (launchExpeditionAlreadyActive) {
    warnings.push('An expedition is already active. Confirming will resume it with this route context.');
  }

  return {
    canLaunch: missing.length === 0,
    missing,
    warnings,
  };
}, [
  launchExpeditionAlreadyActive,
  navigateVehicleContext.activeVehicleId,
  navigateVehicleContext.hasActiveVehicleId,
  preflightPacket,
  preflightRouteAsset,
]);

function getImportedSourceLabel(source: string | null | undefined) {
  const normalized = String(source ?? '').toLowerCase();
  if (normalized === 'custom') return 'CUSTOM';
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
      trailTripMode === 'hybrid' ? 'HYBRID' : 'TRAIL';
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
      roadSession.status === 'rerouting' || roadSession.isOffRoute
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
    const isCustomRun = activeRun.source === 'custom';
    const isImportedRun =
      isCustomRun ||
      activeRun.source === 'gpx' ||
      activeRun.source === 'kml' ||
      activeRun.source === 'kmz' ||
      activeRun.source === 'geojson' ||
      activeRun.source === 'fit' ||
      activeRun.source === 'import';
    const currentRouteSnapshot = navigateRouteSessionStore.getSnapshot();
    const activeRunIsNavigating =
      currentRouteSnapshot.lifecycle === 'active' &&
      currentRouteSnapshot.source === 'run' &&
      currentRouteSnapshot.routeId === activeRun.id;
    if (isCustomRun && !activeRunIsNavigating) {
      return null;
    }
    return {
      title: isImportedRun ? importedRunSource : 'TRAIL',
      state: activeRunIsNavigating ? 'ACTIVE' : 'STAGED',
      icon: isCustomRun
        ? ('git-branch-outline' as const)
        : isImportedRun
          ? ('download-outline' as const)
          : ('trail-sign-outline' as const),
      onPress: () =>
        router.push({ pathname: '/navigate-run', params: { runId: activeRun.id } } as any),
    };
  }

  if (activeImportedRoute) {
    if (importedRouteSource === 'CUSTOM') {
      return null;
    }
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
  roadSession.isOffRoute,
  roadSession.status,
  roadNavigationActive,
  router,
  setRequestBoundsTrigger,
  toggleTopPopup,
  trailTripMode,
  trailNavigationActive,
]);
const primaryCampSuggestion = campIntelSites[0] ?? null;
const intelRouteContext = useMemo(() => {
  const activeLike =
    navigationOverlayMode === 'active' ||
    navigationOverlayMode === 'arrived' ||
    roadNavigation.uiMode === 'active' ||
    trailNavigation.uiMode === 'active' ||
    trailNavigation.uiMode === 'arrived';
  const previewLike =
    navigationOverlayMode === 'preview' ||
    roadNavigation.uiMode === 'preview' ||
    !!exploreNavigationPayload;
  const guidanceContext =
    activeLike
      ? navigationActiveContext ?? navigationPreviewContext
      : navigationPreviewContext ?? navigationActiveContext;
  const route = roadNavigation.session.route;
  const payload = trailNavigation.session.payload ?? exploreNavigationPayload;
  const routeName =
    guidanceContext?.title ??
    routeIntelligence?.routeName ??
    payload?.title ??
    roadNavigation.session.destination?.title ??
    activeRun?.title ??
    null;
  const hasRoute =
    !!guidanceContext ||
    !!route ||
    !!payload ||
    !!routeIntelligence ||
    displayedRoutePoints.length > 1 ||
    !!activeRun;

  const routeId =
    payload?.id ??
    route?.id ??
    roadNavigation.session.destination?.id ??
    activeRun?.id ??
    routeIntelligence?.id ??
    null;
  const metricValue = (labels: string[]) => {
    const match = guidanceContext?.metrics?.find((metric) =>
      labels.includes(String(metric.label ?? '').toUpperCase()),
    );
    return typeof match?.value === 'string' && match.value.trim() ? match.value : null;
  };
  const payloadTrailLengthMiles =
    payload?.trailLengthMiles ??
    (payload?.trailGeometry && payload.trailGeometry.length > 1
      ? computeTrailLengthMiles(payload.trailGeometry)
      : null);
  const distanceLabel =
    routeIntelligence?.totalDistanceMiles != null
      ? formatNavMiles(routeIntelligence.totalDistanceMiles)
      : route?.distanceM != null
        ? formatNavMeters(route.distanceM)
        : payloadTrailLengthMiles != null
          ? formatNavMiles(payloadTrailLengthMiles)
          : activeRun?.stats?.distance_miles != null
            ? formatNavMiles(activeRun.stats.distance_miles)
            : metricValue(['DIST', 'LENGTH', 'ROAD', 'TRAIL', 'REMAIN']);
  const durationLabel =
    routeIntelligence?.estimatedDriveTimeHours != null
      ? formatNavDuration(routeIntelligence.estimatedDriveTimeHours * 3600)
      : route?.durationS != null
        ? formatNavDuration(route.durationS)
        : metricValue(['TIME', 'DRIVE']);
  const etaLabel =
    formatNavEta(roadNavigation.session.etaIso) !== '--'
      ? formatNavEta(roadNavigation.session.etaIso)
      : metricValue(['ETA']);
  const lifecycle = activeLike ? 'active' : previewLike ? 'preview' : hasRoute ? 'selected' : 'none';
  const statusLabel =
    guidanceContext?.statusText ??
    roadNavigation.session.routeStatusLabel ??
    (hasRoute ? 'Route context available' : 'Build or select a route first.');
  const startLabel =
    displayedRouteWaypoints[0]?.title ??
    (displayedRoutePoints.length > 0 ? 'Current route start' : null);
  const destinationLabel =
    roadNavigation.session.destination?.title ??
    displayedRouteWaypoints[displayedRouteWaypoints.length - 1]?.title ??
    payload?.title ??
    routeName;

  return {
    hasRoute,
    routeId,
    routeName: routeName ?? 'Build or select a route first.',
    lifecycle,
    sourceLabel: activeLike ? 'Active navigation' : previewLike ? 'Route preview' : routeIntelligence ? 'Route analysis' : 'Navigation',
    distanceLabel: distanceLabel ?? '--',
    durationLabel: durationLabel ?? '--',
    etaLabel: etaLabel ?? '--',
    startLabel,
    destinationLabel,
    waypointCount: displayedRouteWaypoints.length,
    pointCount: displayedRoutePoints.length,
    statusLabel,
    noteText: guidanceContext?.noteText ?? null,
    routeFingerprint: [
      routeId ?? 'no-route-id',
      lifecycle,
      displayedRoutePoints.length,
      routeIntelligence?.id ?? 'no-analysis',
      route?.distanceM ?? 'no-road-distance',
      payloadTrailLengthMiles ?? 'no-trail-distance',
    ].join(':'),
  };
}, [
  activeRun,
  displayedRoutePoints.length,
  displayedRouteWaypoints,
  exploreNavigationPayload,
  navigationActiveContext,
  navigationOverlayMode,
  navigationPreviewContext,
  roadNavigation.session.destination?.id,
  roadNavigation.session.destination?.title,
  roadNavigation.session.etaIso,
  roadNavigation.session.route,
  roadNavigation.session.routeStatusLabel,
  roadNavigation.uiMode,
  routeIntelligence,
  trailNavigation.session.payload,
  trailNavigation.uiMode,
]);
const intelHasRoute = intelRouteContext.hasRoute;
const navigateCampOverlayReadinessCandidates = useMemo(() => {
  const campOverlayVisible =
    campScoutAreaMode === 'results' ||
    Boolean(campOpsRecommendationSet) ||
    campIntelVisible ||
    campsiteLayerVisibility.community ||
    campsiteLayerVisibility.private ||
    campsiteLayerVisibility.pending ||
    campsiteLayerVisibility.reviewer_pending ||
    campsiteLayerVisibility.group;

  if (!campOverlayVisible) return null;
  return mergeReadinessCampCandidateSets(
    buildReadinessCampCandidatesFromCampOps(campOpsRecommendationSet),
    buildReadinessCampCandidatesFromCampScout(campScoutCandidatesShown),
    buildReadinessCampCandidatesFromMapPins(sharedCampPinMapMarkers),
    buildReadinessCampCandidatesFromMapPins(combinedCampMarkers.map((marker) => ({
      id: marker.id,
      latitude: marker.latitude,
      longitude: marker.longitude,
      title: marker.title,
      confidenceScore: marker.score ?? marker.confidenceScore,
      sourceType: marker.markerKind === 'official_mapped' ? 'official_mapped' : 'ecs_inferred',
      distanceFromRoadOrTrail: undefined,
      accessNotes: marker.subtitle,
      reasons: marker.ratingFactors?.map((item) => String(item.label)).filter(Boolean),
    }))),
  );
}, [
  campOpsRecommendationSet,
  campScoutAreaMode,
  campScoutCandidatesShown,
  campIntelVisible,
  campsiteLayerVisibility.community,
  campsiteLayerVisibility.group,
  campsiteLayerVisibility.pending,
  campsiteLayerVisibility.private,
  campsiteLayerVisibility.reviewer_pending,
  combinedCampMarkers,
  sharedCampPinMapMarkers,
]);

useEffect(() => {
  if (!intelHasRoute) return;
  const hasCampCandidates = Boolean(navigateCampOverlayReadinessCandidates && navigateCampOverlayReadinessCandidates.length > 0);
  const readinessSnapshot = expeditionReadinessStore.getSnapshot();
  const shouldInferOvernightCamp =
    hasCampCandidates
    && readinessSnapshot.tripIntentSource !== 'selected'
    && readinessSnapshot.inputPatch.tripIntent !== 'overnightCamp';
  expeditionReadinessStore.setReadinessInputPatch({
    campCandidates: navigateCampOverlayReadinessCandidates && navigateCampOverlayReadinessCandidates.length > 0
      ? navigateCampOverlayReadinessCandidates
      : null,
    tripIntent: shouldInferOvernightCamp ? 'overnightCamp' : readinessSnapshot.inputPatch.tripIntent,
    tripIntentSource: shouldInferOvernightCamp ? 'ecs_inferred' : readinessSnapshot.inputPatch.tripIntentSource,
  });
}, [
  intelHasRoute,
  intelRouteContext.routeFingerprint,
  navigateCampOverlayReadinessCandidates,
]);
const intelReadinessStack =
  ((navigationActiveContext as any)?.readinessStack ?? navigationPreviewContext?.readinessStack ?? navigationStartReadinessStack) ?? null;
const intelReadinessRows = (intelReadinessStack?.rows ?? []) as {
  id: string;
  label: string;
  value: string;
}[];
const intelWeatherSummary = useMemo(() => {
  if (routeHazardIntel) {
    return {
      title: routeHazardIntel.headline,
      body: routeHazardIntel.summaryLine,
      source: routeCorridorWeather.hasRoute ? 'Route corridor weather' : 'Route weather warning',
    };
  }
  if (routeCorridorWeather.hasRoute) {
    return {
      title: routeCorridorWeather.summary.headline ?? 'Route forecast',
      body: routeCorridorWeather.summary.detail ?? 'Route weather corridor is available.',
      source: routeCorridorWeather.source === 'live' ? 'Route corridor weather' : 'Route weather cache',
    };
  }
  const current = operationalWeather.snapshot.current;
  const tempLabel = current.temp != null ? `${Math.round(current.temp)} deg` : null;
  const condition = current.condition ?? current.description ?? operationalWeather.snapshot.status.label;
  if (condition || tempLabel) {
    return {
      title: [condition, tempLabel].filter(Boolean).join(' - ') || 'Current-location weather',
      body:
        operationalWeather.snapshot.status.kind === 'ready'
          ? 'Route-specific weather is not available yet; showing current-location weather.'
          : operationalWeather.snapshot.status.label ?? 'Current-location weather is partially available.',
      source: operationalWeather.snapshot.sourceType === 'route_origin' ? 'Route origin weather' : 'Current-location weather',
    };
  }
  return null;
}, [
  operationalWeather.snapshot,
  routeCorridorWeather.hasRoute,
  routeCorridorWeather.source,
  routeCorridorWeather.summary.detail,
  routeCorridorWeather.summary.headline,
  routeHazardIntel,
]);
const intelStatusMeta =
  expeditionForecast?.status === 'WARNING'
    ? { label: 'WARNING', color: '#EF5350' }
    : expeditionForecast?.status === 'CAUTION'
      ? { label: 'CAUTION', color: '#FFB300' }
      : {
          label: intelHasRoute ? (routeIntelligence ? 'INTEL READY' : 'LIVE ROUTE') : 'ROUTE REQUIRED',
          color: intelHasRoute ? '#66BB6A' : TACTICAL.textMuted,
        };
const intelHeroTitle =
  visibleMissionBrief?.headline ??
  expeditionForecast?.brief ??
  (intelHasRoute
    ? `Intel ready for ${intelRouteContext.routeName}.`
    : 'Build or select a route first.');
const intelHeroBody =
  visibleMissionBrief?.summary ??
  (intelHasRoute
    ? 'Review route, terrain, forecast, camp, staging, and resource readiness from the current navigation context.'
    : 'Intel populates once a route or trail is built, staged, or active.');

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
  const shouldFollow =
    typeof command.followUser === 'boolean'
      ? command.followUser
      : nextMode === 'north' || nextMode === 'heading';

  if (nextMode) {
    setCameraMode(nextMode);
  }

  if (shouldFollow) {
    setFollowUser(true);
    setUserHasManuallyMovedMap(false);
  } else if (nextMode === 'free' || command.mode === 'route_overview') {
    setFollowUser(false);
    setUserHasManuallyMovedMap(true);
  }

  if (command.target && Number.isFinite(command.target.lat) && Number.isFinite(command.target.lng)) {
    queueMapCameraCommand({
      mode: shouldFollow ? 'follow_user' : 'pin_focus',
      center: {
        latitude: command.target.lat,
        longitude: command.target.lng,
      },
      zoom: Number.isFinite(command.zoom) ? Number(command.zoom) : mapZoom,
      durationMs: 450,
      animate: true,
      reason: shouldFollow ? 'camera_command_follow' : 'camera_command_focus',
    }, { force: command.force });
    return;
  }

  if ((nextMode === 'north' || nextMode === 'heading') && userLocation) {
    enableFollowLock('camera_command_follow', {
      force: command.force,
      zoom: Number.isFinite(command.zoom) ? Number(command.zoom) : mapZoom,
    });
  }
}, [enableFollowLock, mapZoom, queueMapCameraCommand, userLocation]);

const handleOpenOfflineCache = useCallback(() => {
  hapticCommand();
  setRequestBoundsTrigger(prev => prev + 1);
  openTopPopup('offlineCache');
}, [openTopPopup]);

const openToolsChildPopup = useCallback((popup: NavigateToolsChildPopup) => {
  closeNavigateDetailSurfaces();
  setCampLayerMenuOpen(false);
  setToolsMenuOpen(true);
  setActiveTopPopup(popup);
}, [closeNavigateDetailSurfaces]);

const handleOpenCampScoutIntro = useCallback(() => {
  setRequestBoundsTrigger((prev) => prev + 1);
  setCampsitePolygonLocateState('no_area');
  setCampsitePolygonLocateMessage(null);
  openToolsChildPopup('campScout');
}, [openToolsChildPopup]);

const handleOpenImportRoute = useCallback(() => {
  if (importRouteModalVisible || isImportPendingRef.current) {
    logNavigateDev('[NAVIGATE_IMPORT] import_button_ignored_pending', {
      reason: importRouteModalVisible ? 'modal_open' : 'picker_active',
    });
    return;
  }

  hapticCommand();
  setImportFeedback(null);
  openToolsChildPopup('importRoute');
}, [importRouteModalVisible, openToolsChildPopup]);

const handleOpenBuildRoutePlan = useCallback(() => {
  hapticCommand();
  setToolsMenuOpen(false);
  setActiveTopPopup(null);
  router.push('/explore-trip-builder' as any);
}, [router]);

const getActiveTrailPackSubmissionRoute = useCallback((
  sourceEntryPoint: ECSTrailPackSubmissionRouteInput['sourceEntryPoint'],
) => {
  const payload =
    trailNavigation.session.payload ??
    exploreNavigationPayload ??
    (activeRun ? buildNavigationPayloadFromRun(activeRun) : null);
  return trailPackRouteInputFromNavigationPayload(payload, sourceEntryPoint);
}, [activeRun, exploreNavigationPayload, trailNavigation.session.payload]);

const handleSubmitActiveRouteAsTrailPack = useCallback(() => {
  hapticCommand();
  const routeInput = getActiveTrailPackSubmissionRoute('navigate_route_preview');
  if (!routeInput) {
    showToast('TRAIL PACK SUBMISSION NEEDS A STAGED ROUTE');
    return;
  }
  setTrailPackSubmissionRoute(routeInput);
  setToolsMenuOpen(false);
}, [getActiveTrailPackSubmissionRoute, showToast]);

const handleSubmitImportedRouteAsTrailPack = useCallback(() => {
  hapticCommand();
  const routeInput = getActiveTrailPackSubmissionRoute('imported_gpx_kml_route');
  if (!routeInput) {
    showToast('IMPORT A ROUTE BEFORE CREATING A TRAIL PACK');
    return;
  }
  setTrailPackSubmissionRoute(routeInput);
  setToolsMenuOpen(false);
}, [getActiveTrailPackSubmissionRoute, showToast]);

const handleRecommendCompletedTrailAsTrailPack = useCallback((trailId: string) => {
  hapticCommand();
  const trail = trailHistoryStore.getById(trailId);
  const routeInput = trailPackRouteInputFromSavedTrail(trail);
  if (!routeInput) {
    showToast('COMPLETED ROUTE GEOMETRY UNAVAILABLE');
    return;
  }
  setTrailPackSubmissionRoute(routeInput);
  setToolsMenuOpen(false);
}, [showToast]);

const handleTrailPackSubmitted = useCallback((_submission: ECSTrailPackSubmission) => {
  setTrailPackSubmissionRoute(null);
  showToast('TRAIL PACK SUBMITTED FOR ECS REVIEW');
}, [showToast]);

const toggleToolsPopup = useCallback(() => {
  hapticMicro();
  if (toolsMenuOpen) {
    setToolsMenuOpen(false);
    setActiveTopPopup((prev) => (isToolsChildPopup(prev) ? null : prev));
    return;
  }
  closeNavigateDetailSurfaces();
  setCampLayerMenuOpen(false);
  setActiveTopPopup(null);
  setToolsMenuOpen(true);
}, [closeNavigateDetailSurfaces, toolsMenuOpen]);

const closeToolsPopup = useCallback(() => {
  setToolsMenuOpen(false);
  setActiveTopPopup((prev) => (isToolsChildPopup(prev) || prev === 'tools' ? null : prev));
}, []);

const toggleCampLayerMenu = useCallback(() => {
  hapticMicro();
  setCampLayerMenuOpen((current) => {
    const next = !current;
    if (next) {
      closeNavigateDetailSurfaces();
      setToolsMenuOpen(false);
      setActiveTopPopup((prev) => (isToolsChildPopup(prev) ? null : prev));
    }
    return next;
  });
}, [closeNavigateDetailSurfaces]);

const routeBuilderPointCount = useMemo(
  () =>
    routeBuilderSegments.reduce(
      (count, segment) => count + (Array.isArray(segment.coordinates) ? segment.coordinates.length : 0),
      0,
    ),
  [routeBuilderSegments],
);

const routeBuilderSavableSegments = useMemo(
  () =>
    routeBuilderSegments.filter(
      (segment) => Array.isArray(segment.coordinates) && segment.coordinates.length > 1,
    ),
  [routeBuilderSegments],
);

const routeBuilderCanSave = routeBuilderSavableSegments.length > 0 && routeBuilderPointCount > 1;
const routeBuilderCanUndo = routeBuilderSegments.some(
  (segment) => Array.isArray(segment.coordinates) && segment.coordinates.length > 1,
);

  const campsiteDrawingCanFinish =
    campScoutAreaMode === 'drawing' && !campsiteDrawingClosed && campsiteDrawingPoints.length >= 3;
  const campsiteDrawingCanUndo =
    campScoutAreaMode !== 'scanning' && campsiteDrawingPoints.length > 0;
  const campsiteDrawingCanScan =
    campScoutAreaMode !== 'scanning' && campsiteDrawingClosed && campsiteDrawingPoints.length >= 3;
  const campScoutDrawingSuppressesDispersedRegionSheet =
    campsiteDrawMode || campScoutAreaMode === 'drawing';

  useEffect(() => {
    if (campScoutDrawingSuppressesDispersedRegionSheet) {
      setSelectedDispersedCampingRegion(null);
    }
  }, [campScoutDrawingSuppressesDispersedRegionSheet]);

  useEffect(() => {
    clearOwnedCampsiteCandidates('polygon_context_unavailable', {
      activeRouteIntelligenceId: routeOverviewCampsiteContext?.routeIntelligence?.id ?? null,
      activePolygonId: campsiteDrawingId,
      clearPolygon: !campsiteDrawingId,
    });
  }, [
    campsiteDrawingId,
    clearOwnedCampsiteCandidates,
    routeOverviewCampsiteContext?.routeIntelligence?.id,
  ]);

const handleRouteBuilderUpdate = useCallback((payload: RouteBuilderUpdatePayload) => {
  setRouteBuilderSegments((prev) =>
    sameRouteBuilderSegments(prev, payload.segments) ? prev : payload.segments,
  );
  setRouteBuilderDrawing((prev) => (prev === payload.isDrawing ? prev : payload.isDrawing));
  setRouteBuilderSnapSource((prev) =>
    prev === (payload.snapSource ?? null) ? prev : payload.snapSource ?? null,
  );
  setRouteBuilderSnapStatus((prev) =>
    prev === (payload.snapStatus ?? null) ? prev : payload.snapStatus ?? null,
  );
  setRouteBuilderSnapMessage((prev) =>
    prev === (payload.snapMessage ?? null) ? prev : payload.snapMessage ?? null,
  );
}, []);

const handleRouteBuilderGestureStateChange = useCallback((payload: {
  isDrawing: boolean;
  snapSource?: string | null;
}) => {
  setRouteBuilderDrawing((prev) => (prev === payload.isDrawing ? prev : payload.isDrawing));
  setRouteBuilderSnapSource((prev) =>
    prev === (payload.snapSource ?? null) ? prev : payload.snapSource ?? null,
  );
  if (payload.snapSource === 'snapping') {
    setRouteBuilderSnapStatus('snapped');
    setRouteBuilderSnapMessage('Snapping segment...');
  }
}, []);

const clearCampsiteDrawing = useCallback(() => {
  hapticCommand();
  setCampsiteDrawMode(false);
  setCampScoutAreaMode('idle');
  setCampsiteDrawingClosed(false);
  setCampsiteDrawingPoints([]);
  setSelectedCampIntelId(null);
  setSelectedCampScoutCandidateId(null);
  setSelectedCommunityCampSiteId(null);
  setSelectedScopedCampsite(null);
  setSelectedGroupCampsiteShareId(null);
  setRouteDesignContext(null);
  campsitePolygonLocateRequestRef.current = null;
  setCampsitePolygonLocateState('idle');
  setCampsitePolygonLocateMessage(null);
  resetDrawAreaKnownCampsiteSources();
  clearOwnedCampsiteCandidates('user_cleared_drawing', { clearPolygon: true });
  showToast('CAMP SCOUT AREA CLEARED');
}, [clearOwnedCampsiteCandidates, resetDrawAreaKnownCampsiteSources, showToast]);

const finishCampsiteDrawing = useCallback(() => {
  hapticCommand();
  if (campsiteDrawingClosed) {
    showToast('CAMP SCOUT AREA ALREADY CLOSED');
    return;
  }
  const validation = validateCampScoutArea(campsiteDrawingPoints);
  if (!validation.ok) {
    setCampScoutAreaMode('error');
    setCampsitePolygonLocateState(validation.status === 'too_large' ? 'too_large' : 'error');
    setCampsitePolygonLocateMessage(
      validation.status === 'too_large'
        ? 'Area too large for a focused Camp Scout scan. Tighten the area and scan again.'
        : validation.message,
    );
    showToast(validation.status === 'too_large' ? 'TIGHTEN CAMP SCOUT AREA' : 'ADJUST CAMP SCOUT AREA');
    return;
  }

  setCampsiteDrawingClosed(true);
  setCampsiteDrawMode(false);
  setSelectedCampScoutCandidateId(null);
  setCampScoutAreaMode('areaReady');
  setCampsitePolygonLocateState('idle');
  setCampsitePolygonLocateMessage(validation.message + ' Tap Scan Area to place pins.');
  clearOwnedCampsiteCandidates('polygon_area_redefined_pending_scan', { clearPolygon: true });
  resetDrawAreaKnownCampsiteSources();
  showToast('CAMP SCOUT AREA READY');
}, [
  clearOwnedCampsiteCandidates,
  campsiteDrawingClosed,
  campsiteDrawingPoints,
  resetDrawAreaKnownCampsiteSources,
  showToast,
]);

const undoCampsiteDrawingPoint = useCallback(() => {
  hapticMicro();
  if (campScoutAreaMode === 'scanning' || campsiteDrawingPoints.length <= 0) {
    return;
  }

  setCampsiteDrawingPoints((current) => current.slice(0, -1));
  setSelectedCampScoutCandidateId(null);
  setCampsiteDrawingClosed(false);
  setCampsiteDrawMode(true);
  setCampScoutAreaMode('drawing');
  campsitePolygonLocateRequestRef.current = null;
  setCampsitePolygonLocateState('idle');
  setCampsitePolygonLocateMessage(null);
  resetDrawAreaKnownCampsiteSources();
  clearOwnedCampsiteCandidates('point_undone', { clearPolygon: true });
}, [
  campScoutAreaMode,
  campsiteDrawingPoints.length,
  clearOwnedCampsiteCandidates,
  resetDrawAreaKnownCampsiteSources,
]);

const scanCampsiteDrawing = useCallback(() => {
  hapticCommand();
  if (campScoutAreaMode === 'scanning') {
    return;
  }

  if (!campsiteDrawingClosed || campsiteDrawingPoints.length < 3) {
    showToast('FINISH CAMP SCOUT AREA FIRST');
    return;
  }

  locateCampsitesForCompletedPolygon(campsiteDrawingPoints);
}, [
  campScoutAreaMode,
  campsiteDrawingClosed,
  campsiteDrawingPoints,
  locateCampsitesForCompletedPolygon,
  showToast,
]);

const startCampScoutDrawing = useCallback(() => {
  hapticCommand();
  if (routeBuilderActive) {
    setRouteBuilderActive(false);
    setRouteBuilderDrawing(false);
    setRouteBuilderSnapSource(null);
    setRouteBuilderSegments([]);
    setRouteBuilderSnapStatus(null);
    setRouteBuilderSnapMessage(null);
    setCustomRouteRefreshKey((key) => key + 1);
  }
  setPinDropMode(false);
  setShowCrosshair(false);
  setCampsiteDrawingClosed(false);
  setCampsiteDrawingPoints([]);
  setSelectedCampScoutCandidateId(null);
  setRouteDesignContext(null);
  campsitePolygonLocateRequestRef.current = null;
  setCampsitePolygonLocateState('idle');
  setCampsitePolygonLocateMessage(null);
  setCampScoutAreaMode('drawing');
  resetDrawAreaKnownCampsiteSources();
  clearOwnedCampsiteCandidates('camp_scout_drawing_started', { clearPolygon: true });
  setCampsiteDrawMode(true);
  setSelectedCampIntelId(null);
  setSelectedCampScoutCandidateId(null);
  closeNavigateDetailSurfaces();
  setToolsMenuOpen(false);
  setActiveTopPopup(null);
  showToast('DRAW CAMP SCOUT AREA');
}, [
  clearOwnedCampsiteCandidates,
  closeNavigateDetailSurfaces,
  resetDrawAreaKnownCampsiteSources,
  routeBuilderActive,
  showToast,
]);

const handleCampScoutUseCurrentMapView = useCallback(() => {
  hapticCommand();
  if (!mapBounds) {
    setRequestBoundsTrigger((prev) => prev + 1);
    setCampsitePolygonLocateState('idle');
    setCampsitePolygonLocateMessage('Map view bounds are updating. Try Use Current Map View again in a moment.');
    showToast('MAP VIEW BOUNDS REQUESTED');
    return;
  }

  const viewportPolygon: CampsiteSearchPolygonPoint[] = [
    { latitude: mapBounds.minLat, longitude: mapBounds.minLng },
    { latitude: mapBounds.minLat, longitude: mapBounds.maxLng },
    { latitude: mapBounds.maxLat, longitude: mapBounds.maxLng },
    { latitude: mapBounds.maxLat, longitude: mapBounds.minLng },
  ];
  const validation = validateCampScoutArea(viewportPolygon);
  if (!validation.ok) {
    setCampsitePolygonLocateState(validation.status === 'too_large' ? 'too_large' : 'error');
    setCampsitePolygonLocateMessage(
      validation.status === 'too_large'
        ? 'Area too large for a focused Camp Scout scan. Zoom in or pan to a smaller map view.'
        : validation.message,
    );
    showToast(validation.status === 'too_large' ? 'TIGHTEN CAMP SCOUT AREA' : 'ADJUST CAMP SCOUT AREA');
    return;
  }

  setCampsiteDrawingPoints(viewportPolygon);
  setCampsiteDrawingClosed(true);
  setCampsiteDrawMode(false);
  setCampScoutAreaMode('areaReady');
  setSelectedCampScoutCandidateId(null);
  setSelectedCampIntelId(null);
  setRouteDesignContext(null);
  campsitePolygonLocateRequestRef.current = null;
  setCampsitePolygonLocateState('idle');
  setCampsitePolygonLocateMessage(validation.message + ' Scanning current map view...');
  resetDrawAreaKnownCampsiteSources();
  closeNavigateDetailSurfaces();
  setToolsMenuOpen(false);
  setActiveTopPopup(null);
  locateCampsitesForCompletedPolygon(viewportPolygon);
}, [
  closeNavigateDetailSurfaces,
  locateCampsitesForCompletedPolygon,
  mapBounds,
  resetDrawAreaKnownCampsiteSources,
  showToast,
]);

const saveCampsiteDrawing = useCallback(() => {
  hapticCommand();
  if (!campsiteDrawingClosed || campsiteDrawingPoints.length < 3) {
    showToast('FINISH DRAWING BEFORE SAVE');
    return;
  }
  const now = new Date().toISOString();
  const drawingId = campsiteDrawingId ?? createCampsiteDrawingId(campsiteDrawingPoints);
  const candidateIds = activePolygonCampsiteSuggestions.map(getCampsiteSuggestionId);
  const nextDrawing: SavedCampsiteSearchDrawing = {
    id: drawingId,
    name: `Drawn Area ${String(savedCampsiteDrawings.length + 1).padStart(2, '0')}`,
    coordinates: campsiteDrawingPoints,
    polygonCoordinates: campsiteDrawingPoints,
    centerCoordinate: getCampsiteDrawingCenter(campsiteDrawingPoints),
    campsiteCandidateIds: candidateIds,
    campsiteCandidates: activePolygonCampsiteSuggestions,
    source: 'user_polygon',
    createdAt: now,
    savedAt: now,
  };
  setSavedCampsiteDrawings((current) => {
    const next = [nextDrawing, ...current.filter((drawing) => drawing.id !== nextDrawing.id)].slice(0, 12);
    void navigatePreferenceStorage.write(CAMPSITE_DRAWINGS_STORAGE_KEY, JSON.stringify(next));
    return next;
  });
  showToast('CAMPSITE DRAWING SAVED');
}, [
  activePolygonCampsiteSuggestions,
  campsiteDrawingClosed,
  campsiteDrawingId,
  campsiteDrawingPoints,
  savedCampsiteDrawings.length,
  showToast,
]);

const buildRouteOverCampsiteDrawing = useCallback(() => {
  hapticCommand();
  if (!campsiteDrawingClosed || campsiteDrawingPoints.length < 3) {
    showToast('FINISH DRAWING BEFORE ROUTE DESIGN');
    return;
  }
  if (roadNavigationActive || trailNavigationActive || pendingHybridTrailTransition) {
    showToast('END ACTIVE NAVIGATION TO BUILD A ROUTE');
    return;
  }

  const polygonId = campsiteDrawingId ?? createCampsiteDrawingId(campsiteDrawingPoints);
  setRouteDesignContext({
    source: 'polygon',
    polygonId,
    polygonCoordinates: campsiteDrawingPoints,
    campsiteCandidates: activePolygonCampsiteSuggestions,
  });
  setCampsiteDrawMode(false);
  setPinDropMode(false);
  setShowCrosshair(false);
  closeNavigateDetailSurfaces();
  setToolsMenuOpen(false);
  setActiveTopPopup(null);
  setFollowUser(false);
  setUserHasManuallyMovedMap(true);
  setRouteBuilderActive(true);
  setRouteBuilderDrawing(false);
  setRouteBuilderSnapSource(null);
  showToast('ROUTE DESIGN USING DRAWN AREA');
}, [
  activePolygonCampsiteSuggestions,
  campsiteDrawingClosed,
  campsiteDrawingId,
  campsiteDrawingPoints,
  closeNavigateDetailSurfaces,
  pendingHybridTrailTransition,
  roadNavigationActive,
  showToast,
  trailNavigationActive,
]);

const toggleCampsiteDrawMode = useCallback(() => {
  if (campScoutAreaMode !== 'idle') {
    hapticCommand();
    setCampsiteDrawMode(false);
    setCampScoutAreaMode('idle');
    setCampsiteDrawingClosed(false);
    setCampsiteDrawingPoints([]);
    setSelectedCampScoutCandidateId(null);
    campsitePolygonLocateRequestRef.current = null;
    setCampsitePolygonLocateState('idle');
    setCampsitePolygonLocateMessage(null);
    resetDrawAreaKnownCampsiteSources();
    clearOwnedCampsiteCandidates('polygon_drawing_exited', { clearPolygon: true });
    showToast('CAMP SCOUT CLOSED');
    return;
  }
  startCampScoutDrawing();
}, [
  campScoutAreaMode,
  clearOwnedCampsiteCandidates,
  resetDrawAreaKnownCampsiteSources,
  showToast,
  startCampScoutDrawing,
]);

const toggleRouteBuilder = useCallback(() => {
  hapticCommand();
  if (!routeBuilderActive && (roadNavigationActive || trailNavigationActive || pendingHybridTrailTransition)) {
    showToast('END ACTIVE NAVIGATION TO BUILD A ROUTE');
    return;
  }
  const nextRouteBuilderActive = !routeBuilderActive;

  closeNavigateDetailSurfaces();
  setToolsMenuOpen(false);
  setActiveTopPopup(null);
  setPinDropMode(false);
  setCampsiteDrawMode(false);
  if (nextRouteBuilderActive && !campsiteDrawingClosed) {
    setCampScoutAreaMode('idle');
    setCampsiteDrawingClosed(false);
    setCampsiteDrawingPoints([]);
    setRouteDesignContext(null);
    campsitePolygonLocateRequestRef.current = null;
    setCampsitePolygonLocateState('idle');
    setCampsitePolygonLocateMessage(null);
    resetDrawAreaKnownCampsiteSources();
  } else if (!campsiteDrawingClosed) {
    setRouteDesignContext(null);
  }
  setShowCrosshair(false);
  setFollowUser(false);
  setUserHasManuallyMovedMap(true);
  setRouteBuilderActive(nextRouteBuilderActive);
  setRouteBuilderDrawing(false);
  setRouteBuilderSnapSource(null);
  setRouteBuilderSnapStatus(null);
  setRouteBuilderSnapMessage(null);
  showToast(routeBuilderActive ? 'BUILD ROUTE PAUSED' : 'TRACE A TRAIL TO BUILD ROUTE');
}, [
  closeNavigateDetailSurfaces,
  campsiteDrawingClosed,
  campsitePolygonLocateRequestRef,
  pendingHybridTrailTransition,
  resetDrawAreaKnownCampsiteSources,
  roadNavigationActive,
  routeBuilderActive,
  showToast,
  trailNavigationActive,
]);

const resetBuildRouteDraft = useCallback((options?: { clearDesignContext?: boolean; keepActive?: boolean }) => {
  if (!options?.keepActive) {
    setRouteBuilderActive(false);
  }
  setRouteBuilderDrawing(false);
  setRouteBuilderSnapSource(null);
  setRouteBuilderSnapStatus(null);
  setRouteBuilderSnapMessage(null);
  setRouteBuilderSegments([]);
  if (options?.clearDesignContext) {
    setRouteDesignContext(null);
  }
  setCustomRouteRefreshKey((key) => key + 1);
}, []);

const clearStagedBuildRoutePreview = useCallback(() => {
  const stagedRunId = routeBuilderStagedRunIdRef.current;
  const stagedRouteId = routeBuilderStagedRouteIdRef.current;

  routeBuilderStagedRunIdRef.current = null;
  routeBuilderStagedRouteIdRef.current = null;

  if (!stagedRunId && !stagedRouteId) {
    return false;
  }

  const currentRouteSnapshot = navigateRouteSessionStore.getSnapshot();
  const stagedRunIsActiveNavigation =
    !!stagedRunId &&
    currentRouteSnapshot.lifecycle === 'active' &&
    currentRouteSnapshot.source === 'run' &&
    currentRouteSnapshot.routeId === stagedRunId;

  if (stagedRunIsActiveNavigation) {
    return false;
  }

  let cleared = false;
  if (stagedRunId && runStore.getActive()?.id === stagedRunId) {
    runStore.deactivateAll();
    cleared = true;
  }
  if (stagedRouteId && routeStore.getActive()?.id === stagedRouteId) {
    routeStore.deactivateAll();
    cleared = true;
  }

  if (cleared) {
    loadRuns();
    void clearExploreNavigationPayload();
    setCustomRouteRefreshKey((key) => key + 1);
    setSavedRoutesRefreshKey((key) => key + 1);
  }

  return cleared;
}, [clearExploreNavigationPayload, loadRuns]);

const finishRouteBuilder = useCallback(async () => {
  hapticCommand();
  if (routeBuilderSavableSegments.length === 0 || routeBuilderPointCount < 2) {
    showToast('TRACE AT LEAST TWO POINTS TO SAVE');
    return;
  }

  try {
    const savedRoute = routeStore.createCustomRoute(routeBuilderSavableSegments);
    const savedRun = runStore.createFromRoute(savedRoute, activeRun?.build_snapshot);
    routeBuilderStagedRouteIdRef.current = savedRoute.id;
    routeBuilderStagedRunIdRef.current = savedRun.id;
    routeStore.attachRun(savedRoute.id, savedRun.id);
    routeStore.setActive(savedRoute.id);
    runStore.setActive(savedRun.id);
    loadRuns();
    setCustomRouteRefreshKey((key) => key + 1);
    await endTrailNavigation();
    await clearRoadDestination();
    const previewPayload = buildNavigationPayloadFromRun(savedRun);
    if (previewPayload) {
      await applyExploreNavigationPayload(previewPayload);
    }
    showToast(`CUSTOM ROUTE SAVED: ${savedRoute.name}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to save custom route.';
    showToast(message.toUpperCase());
    return;
  }

  resetBuildRouteDraft({ clearDesignContext: true });
}, [
  activeRun?.build_snapshot,
  applyExploreNavigationPayload,
  clearRoadDestination,
  endTrailNavigation,
  loadRuns,
  resetBuildRouteDraft,
  routeBuilderPointCount,
  routeBuilderSavableSegments,
  showToast,
]);

const undoLastRouteBuilderSegment = useCallback(() => {
  hapticCommand();
  if (routeBuilderDrawing) {
    showToast('LIFT FINGER TO UNDO');
    return;
  }
  if (!routeBuilderCanUndo) {
    showToast('NO BUILD SEGMENT TO UNDO');
    return;
  }

  const lastDrawableIndex = [...routeBuilderSegments]
    .reverse()
    .findIndex((segment) => Array.isArray(segment.coordinates) && segment.coordinates.length > 1);
  if (lastDrawableIndex === -1) {
    showToast('NO BUILD SEGMENT TO UNDO');
    return;
  }
  const removeIndex = routeBuilderSegments.length - 1 - lastDrawableIndex;
  const nextSegments = routeBuilderSegments.filter((_, index) => index !== removeIndex);
  const previousEndpointSegment = [...nextSegments]
    .reverse()
    .find((segment) => Array.isArray(segment.coordinates) && segment.coordinates.length > 1);

  setRouteBuilderSegments(nextSegments);
  setRouteBuilderSnapSource(previousEndpointSegment?.snapSource ?? null);
  setRouteBuilderSnapStatus(previousEndpointSegment?.snapStatus ?? null);
  setRouteBuilderSnapMessage(previousEndpointSegment?.snapMessage ?? null);
  showToast('LAST BUILD SEGMENT UNDONE');
}, [routeBuilderCanUndo, routeBuilderDrawing, routeBuilderSegments, showToast]);

const clearRouteBuilderDraft = useCallback(() => {
  hapticCommand();
  if (routeBuilderDrawing) {
    showToast('LIFT FINGER TO CLEAR');
    return;
  }
  resetBuildRouteDraft({ keepActive: true });
  showToast('BUILD ROUTE DRAFT CLEARED');
}, [resetBuildRouteDraft, routeBuilderDrawing, showToast]);

const cancelRouteBuilder = useCallback(() => {
  hapticCommand();
  resetBuildRouteDraft({ clearDesignContext: true });
  clearStagedBuildRoutePreview();
  showToast('BUILD ROUTE CANCELLED');
}, [clearStagedBuildRoutePreview, resetBuildRouteDraft, showToast]);

const handleRouteBuilderTriggerPress = useCallback(() => {
  if (routeBuilderActive) {
    cancelRouteBuilder();
    return;
  }
  toggleRouteBuilder();
}, [cancelRouteBuilder, routeBuilderActive, toggleRouteBuilder]);

const ensureSavedRouteAssetRun = useCallback((asset: SavedRouteAsset): ECSRun | null => {
  if (asset.runId) {
    const existingRun = runStore.getById(asset.runId);
    if (existingRun) return existingRun;
  }

  if (!asset.routeId) {
    return null;
  }

  const route = routeStore.getById(asset.routeId);
  if (!route) {
    showToast('SAVED ROUTE UNAVAILABLE');
    return null;
  }

  const linkedRun = route.linked_run_id ? runStore.getById(route.linked_run_id) : null;
  if (linkedRun) return linkedRun;

  const createdRun = runStore.createFromRoute(route, activeRun?.build_snapshot);
  routeStore.attachRun(route.id, createdRun.id);
  loadRuns();
  setCustomRouteRefreshKey((key) => key + 1);
  setSavedRoutesRefreshKey((key) => key + 1);
  return createdRun;
}, [activeRun?.build_snapshot, loadRuns, showToast]);

const confirmLocalRoutePreviewCanReplaceActiveGuidance = useCallback(
  async (targetTitle: string, targetRouteId: string | null | undefined): Promise<boolean> => {
    const activeGuidance = navigateRouteSessionStore.getSnapshot();
    if (!isActiveGuidanceSnapshot(activeGuidance)) return true;

    if (
      targetRouteId &&
      (targetRouteId === activeGuidance.routeId || targetRouteId === activeGuidance.sessionId)
    ) {
      return false;
    }

    return new Promise((resolve) => {
      let settled = false;
      const finish = (value: boolean) => {
        if (settled) return;
        settled = true;
        resolve(value);
      };

      Alert.alert(
        'Active guidance is running',
        `Previewing "${targetTitle}" will end the current guidance${
          activeGuidance.routeTitle ? ` for "${activeGuidance.routeTitle}"` : ''
        }. Current turn-by-turn directions will be cleared. Continue?`,
        [
          { text: 'Keep Current', style: 'cancel', onPress: () => finish(false) },
          { text: 'Preview New Route', style: 'destructive', onPress: () => finish(true) },
        ],
        {
          cancelable: true,
          onDismiss: () => finish(false),
        },
      );
    });
  },
  [],
);

const stageSavedRouteRun = useCallback(async (asset: SavedRouteAsset, actionLabel: string) => {
  const canReplaceActiveGuidance = await confirmLocalRoutePreviewCanReplaceActiveGuidance(
    asset.title,
    asset.runId ?? asset.routeId ?? asset.navigationPayload?.id ?? null,
  );
  if (!canReplaceActiveGuidance) return;

  const run = ensureSavedRouteAssetRun(asset);
  if (!run) {
    showToast('ROUTE PREVIEW UNAVAILABLE');
    return;
  }

  routeBuilderStagedRunIdRef.current = null;
  routeBuilderStagedRouteIdRef.current = null;
  if (asset.routeId) {
    routeStore.setActive(asset.routeId);
  } else {
    routeStore.deactivateAll();
  }
  runStore.setActive(run.id);
  loadRuns();
  resetBuildRouteDraft({ clearDesignContext: true });
  await endTrailNavigation();
  await clearRoadDestination();

  const previewPayload = buildNavigationPayloadFromRun(run);
  if (!previewPayload) {
    showToast('ROUTE PREVIEW UNAVAILABLE');
    return;
  }

  await applyExploreNavigationPayload(previewPayload);
  closeToolsPopup();
  showToast(`${actionLabel}: ${asset.title}`);
}, [
  applyExploreNavigationPayload,
  clearRoadDestination,
  closeToolsPopup,
  confirmLocalRoutePreviewCanReplaceActiveGuidance,
  endTrailNavigation,
  ensureSavedRouteAssetRun,
  loadRuns,
  resetBuildRouteDraft,
  showToast,
]);

const stageSavedTrailAsset = useCallback(async (asset: SavedRouteAsset, actionLabel: string) => {
  if (!asset.navigationPayload) {
    showToast('SAVED TRAIL PREVIEW UNAVAILABLE');
    return;
  }
  const canReplaceActiveGuidance = await confirmLocalRoutePreviewCanReplaceActiveGuidance(
    asset.title,
    asset.navigationPayload.id,
  );
  if (!canReplaceActiveGuidance) return;

  routeStore.deactivateAll();
  runStore.deactivateAll();
  loadRuns();
  routeBuilderStagedRunIdRef.current = null;
  routeBuilderStagedRouteIdRef.current = null;
  resetBuildRouteDraft({ clearDesignContext: true });
  await endTrailNavigation();
  await clearRoadDestination();
  await applyExploreNavigationPayload(asset.navigationPayload);
  closeToolsPopup();
  showToast(`${actionLabel}: ${asset.title}`);
}, [
  applyExploreNavigationPayload,
  clearRoadDestination,
  closeToolsPopup,
  confirmLocalRoutePreviewCanReplaceActiveGuidance,
  endTrailNavigation,
  loadRuns,
  resetBuildRouteDraft,
  showToast,
]);

const handleOpenSavedRouteAsset = useCallback((asset: SavedRouteAsset) => {
  void (async () => {
    if (asset.navigationPayload && !asset.routeId && !asset.runId) {
      await stageSavedTrailAsset(asset, 'SAVED TRAIL STAGED');
      return;
    }
    await stageSavedRouteRun(asset, 'SAVED ROUTE STAGED');
  })();
}, [stageSavedRouteRun, stageSavedTrailAsset]);

const handleNavigateSavedRouteAsset = useCallback((asset: SavedRouteAsset) => {
  void (async () => {
    if (!asset.capabilities.canNavigate) {
      showToast('NAVIGATION NOT AVAILABLE FOR THIS ROUTE');
      return;
    }
    if (asset.navigationPayload && !asset.routeId && !asset.runId) {
      await stageSavedTrailAsset(asset, 'SAVED TRAIL READY');
      return;
    }
    await stageSavedRouteRun(asset, 'SAVED ROUTE READY');
  })();
}, [showToast, stageSavedRouteRun, stageSavedTrailAsset]);

const handleStitchSavedRouteAsset = useCallback((asset: SavedRouteAsset) => {
  if (!asset.capabilities.canStitch) {
    showToast('STITCH NOT AVAILABLE FOR THIS ROUTE');
    return;
  }

  const run = ensureSavedRouteAssetRun(asset);
  if (!run) {
    showToast('STITCH ROUTE UNAVAILABLE');
    return;
  }

  setStitchSegmentIds((prev) => (prev.includes(run.id) ? prev : [...prev, run.id]));
  seedStitchDraft();
  openToolsChildPopup('stitch');
  showToast(`ROUTE ADDED TO STITCH: ${asset.title}`);
}, [ensureSavedRouteAssetRun, openToolsChildPopup, seedStitchDraft, showToast]);

const handleOpenPreflightPacket = useCallback((asset: SavedRouteAsset) => {
  let packetRun: ECSRun | null = null;
  let packetPayload: NavigationHandoffPayload | null = asset.navigationPayload ?? null;

  if (!packetPayload && (asset.routeId || asset.runId)) {
    packetRun = ensureSavedRouteAssetRun(asset);
    if (packetRun) {
      packetPayload = buildNavigationPayloadFromRun(packetRun);
    }
  } else if (asset.runId) {
    packetRun = runStore.getById(asset.runId);
  }

  setPreflightRouteAssetId(asset.id);
  setPreflightRunId(packetRun?.id ?? asset.runId);
  setPreflightPayload(packetPayload);
  setPreflightLaunchConfirmVisible(false);
  operationalWeather.refresh();
  openToolsChildPopup('preflightPacket');
}, [ensureSavedRouteAssetRun, openToolsChildPopup, operationalWeather]);

const beginPreflightLaunchConfirmation = useCallback(() => {
  hapticCommand();
  setPreflightLaunchConfirmVisible(true);
  if (!preflightLaunchPrerequisites.canLaunch) {
    showToast('PREFLIGHT NEEDS ATTENTION');
  }
}, [preflightLaunchPrerequisites.canLaunch, showToast]);

const confirmPreflightLaunch = useCallback(() => {
  void (async () => {
    if (!preflightPacket || !preflightRouteAsset) {
      showToast('PREFLIGHT PACKET UNAVAILABLE');
      return;
    }
    if (!preflightLaunchPrerequisites.canLaunch) {
      showToast(`LAUNCH BLOCKED: ${preflightLaunchPrerequisites.missing[0]}`);
      return;
    }

    const vehicleId = navigateVehicleContext.activeVehicleId;
    if (!vehicleId) {
      showToast('LAUNCH BLOCKED: Vehicle profile is not selected.');
      return;
    }

    hapticCommand();
    const existingRecord = expeditionStateStore.getCurrentExpedition();
    const activeOrResumedRecord =
      existingRecord?.state === 'active'
        ? existingRecord
        : existingRecord?.state === 'paused'
          ? expeditionStateStore.resumeExpedition({ userId: user?.email ?? null }) ?? existingRecord
          : expeditionStateStore.beginExpedition({
              activeVehicleId: vehicleId,
              vehicleName: preflightPacket.readiness.vehicleLabel,
              startFuelLevel: navigateVehicleContext.resourceProfile.currentFuelPercent ?? null,
              startWaterLevel: navigateVehicleContext.resourceProfile.currentWaterGallons ?? null,
              latitude: userLocation?.lat ?? gps.position?.latitude ?? null,
              longitude: userLocation?.lng ?? gps.position?.longitude ?? null,
              userId: user?.email ?? null,
            });

    if (
      !vehicleSessionState.hasActiveExpedition() ||
      vehicleSessionState.getActiveExpeditionId() !== activeOrResumedRecord.id
    ) {
      vehicleSessionState.setExpeditionActive(activeOrResumedRecord.id, preflightPacket.title, 'mobile');
    }
    const launchRouteId = preflightRouteAsset.routeId ?? preflightRun?.id ?? preflightRouteAsset.id;
    if (!vehicleSessionState.hasActiveRoute() || vehicleSessionState.getActiveRouteId() !== launchRouteId) {
      vehicleSessionState.setRouteActive(launchRouteId, preflightPacket.route.title, 'mobile');
    }

    expeditionLaunchHandoffStore.record({
      status: existingRecord?.state === 'active' || existingRecord?.state === 'paused' ? 'resumed' : 'active',
      expeditionRecordId: activeOrResumedRecord.id,
      packetId: preflightPacket.id,
      packetTitle: preflightPacket.title,
      routeAssetId: preflightRouteAsset.id,
      routeTitle: preflightPacket.route.title,
      routeId: preflightRouteAsset.routeId,
      runId: preflightRun?.id ?? preflightRouteAsset.runId,
      vehicleId,
      vehicleName: preflightPacket.readiness.vehicleLabel,
    });

    setPreflightLaunchConfirmVisible(false);
    if (preflightRouteAsset.navigationPayload && !preflightRouteAsset.routeId && !preflightRouteAsset.runId) {
      await stageSavedTrailAsset(preflightRouteAsset, 'EXPEDITION LAUNCHED');
    } else {
      await stageSavedRouteRun(preflightRouteAsset, 'EXPEDITION LAUNCHED');
    }
    showToast(`EXPEDITION ACTIVE: ${preflightPacket.route.title}`);
  })();
}, [
  gps.position?.latitude,
  gps.position?.longitude,
  navigateVehicleContext.activeVehicleId,
  navigateVehicleContext.resourceProfile.currentFuelPercent,
  navigateVehicleContext.resourceProfile.currentWaterGallons,
  preflightLaunchPrerequisites.canLaunch,
  preflightLaunchPrerequisites.missing,
  preflightPacket,
  preflightRouteAsset,
  preflightRun,
  showToast,
  stageSavedRouteRun,
  stageSavedTrailAsset,
  user?.email,
  userLocation?.lat,
  userLocation?.lng,
]);

const refreshSavedRoutesCommandCenter = useCallback(() => {
  loadRuns();
  setCustomRouteRefreshKey((key) => key + 1);
  setSavedRoutesRefreshKey((key) => key + 1);
}, [loadRuns]);

const beginRenameSavedRouteAsset = useCallback((asset: SavedRouteAsset) => {
  if (!asset.capabilities.canRename) {
    showToast('RENAME NOT AVAILABLE FOR THIS ASSET');
    return;
  }
  setRenamingSavedRouteAssetId(asset.id);
  setSavedRouteRenameValue(asset.title);
}, [showToast]);

const cancelRenameSavedRouteAsset = useCallback(() => {
  setRenamingSavedRouteAssetId(null);
  setSavedRouteRenameValue('');
}, []);

const commitRenameSavedRouteAsset = useCallback((asset: SavedRouteAsset) => {
  const nextName = savedRouteRenameValue.trim();
  if (!nextName) {
    showToast('ROUTE NAME REQUIRED');
    return;
  }

  if (asset.routeId) {
    routeStore.update(asset.routeId, { name: nextName });
    if (asset.runId) {
      runStore.updateTitle(asset.runId, nextName);
    }
  } else if (asset.runId) {
    runStore.updateTitle(asset.runId, nextName);
  } else if (asset.planId) {
    const plan = getExploreFavoritesSnapshot().plans.find((entry) => entry.planId === asset.planId);
    if (!plan) {
      showToast('SAVED TRAIL STACK UNAVAILABLE');
      return;
    }
    upsertFavoriteTrailPlan({
      favoriteIds: plan.orderedFavoriteIds,
      planId: plan.planId,
      title: nextName,
    });
  } else {
    showToast('RENAME NOT AVAILABLE FOR THIS ASSET');
    return;
  }

  setRenamingSavedRouteAssetId(null);
  setSavedRouteRenameValue('');
  refreshSavedRoutesCommandCenter();
  showToast(`ROUTE RENAMED: ${nextName}`);
}, [refreshSavedRoutesCommandCenter, savedRouteRenameValue, showToast]);

const removeSavedRouteAssetNow = useCallback((asset: SavedRouteAsset) => {
  if (!asset.capabilities.canRemove) {
    showToast('REMOVE NOT AVAILABLE FOR THIS ASSET');
    return;
  }

  let removed = false;
  if (asset.routeId) {
    const route = routeStore.getById(asset.routeId);
    routeStore.delete(asset.routeId);
    if (route?.linked_run_id) {
      runStore.delete(route.linked_run_id);
    }
    if (activeImportedRoute?.id === asset.routeId || activeRun?.id === route?.linked_run_id) {
      routeStore.deactivateAll();
      runStore.deactivateAll();
      void clearExploreNavigationPayload();
    }
    removed = true;
  } else if (asset.runId) {
    runStore.delete(asset.runId);
    if (activeRun?.id === asset.runId) {
      runStore.deactivateAll();
      void clearExploreNavigationPayload();
    }
    removed = true;
  } else if (asset.sourceTrailId) {
    removeFavoriteTrailBySourceId(asset.sourceTrailId);
    removed = true;
  } else if (asset.planId) {
    removeFavoriteTrailPlan(asset.planId);
    removed = true;
  }

  if (!removed) {
    showToast('ROUTE ASSET COULD NOT BE REMOVED');
    return;
  }

  if (renamingSavedRouteAssetId === asset.id) {
    setRenamingSavedRouteAssetId(null);
    setSavedRouteRenameValue('');
  }
  setStitchSegmentIds((prev) => prev.filter((runId) => runId !== asset.runId));
  refreshSavedRoutesCommandCenter();
  showToast(`${asset.removeLabel === 'Remove' ? 'REMOVED' : 'DELETED'}: ${asset.title}`);
}, [
  activeImportedRoute?.id,
  activeRun?.id,
  clearExploreNavigationPayload,
  refreshSavedRoutesCommandCenter,
  renamingSavedRouteAssetId,
  showToast,
]);

const confirmRemoveSavedRouteAsset = useCallback((asset: SavedRouteAsset) => {
  if (!asset.capabilities.canRemove) {
    showToast('REMOVE NOT AVAILABLE FOR THIS ASSET');
    return;
  }

  const destructiveLabel = asset.removeLabel === 'Remove' ? 'Remove' : 'Delete';
  const message =
    asset.kind === 'bookmarked'
      ? `Remove "${asset.title}" from Saved Routes? The original Explore trail is not deleted.`
      : `Delete "${asset.title}" from this device's saved route library?`;

  Alert.alert(
    `${destructiveLabel} route asset`,
    message,
    [
      { text: 'Cancel', style: 'cancel' },
      {
        text: destructiveLabel,
        style: 'destructive',
        onPress: () => removeSavedRouteAssetNow(asset),
      },
    ],
  );
}, [removeSavedRouteAssetNow, showToast]);

useEffect(() => {
  if (!routeBuilderActive) return;
  if (!roadNavigationActive && !trailNavigationActive && !pendingHybridTrailTransition) return;
  setRouteBuilderActive(false);
  setRouteBuilderDrawing(false);
  setRouteBuilderSnapSource(null);
  setRouteBuilderSegments([]);
}, [pendingHybridTrailTransition, roadNavigationActive, routeBuilderActive, trailNavigationActive]);

useFocusEffect(
  useCallback(() => {
    return () => {
      setSelectedDispersedCampingRegion(null);
      setSelectedEstablishedCampsite(null);
      setRouteBuilderActive(false);
      setRouteBuilderDrawing(false);
      setRouteBuilderSnapSource(null);
      setRouteBuilderSegments([]);
    };
  }, []),
);

const runToolsAction = useCallback((action: () => void) => {
  closeToolsPopup();
  action();
}, [closeToolsPopup]);

const toggleRecentSearches = useCallback(() => {
  hapticMicro();
  setRecentSearchesVisible((prev) => !prev);
}, []);

const presentRemotenessLegendDisclosure = useCallback((mode: 'on' | 'off') => {
  if (remotenessLegendDisclosureTimerRef.current) {
    clearTimeout(remotenessLegendDisclosureTimerRef.current);
    remotenessLegendDisclosureTimerRef.current = null;
  }

  setRemotenessLegendMounted(true);
  setRemotenessLegendDisclosure(mode);
  remotenessLegendDisclosureOpacity.setValue(0);
  Animated.timing(remotenessLegendOpacity, {
    toValue: 1,
    duration: 220,
    easing: Easing.out(Easing.cubic),
    useNativeDriver: true,
  }).start();
  Animated.timing(remotenessLegendDisclosureOpacity, {
    toValue: 1,
    duration: 220,
    easing: Easing.out(Easing.cubic),
    useNativeDriver: true,
  }).start();

  remotenessLegendDisclosureTimerRef.current = setTimeout(() => {
    remotenessLegendDisclosureTimerRef.current = null;
    if (mode === 'off') {
      Animated.timing(remotenessLegendOpacity, {
        toValue: 0,
        duration: 320,
        easing: Easing.inOut(Easing.cubic),
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) {
          setRemotenessLegendDisclosure(null);
          setRemotenessLegendMounted(false);
        }
      });
      return;
    }
    Animated.timing(remotenessLegendDisclosureOpacity, {
      toValue: 0,
      duration: 280,
      easing: Easing.inOut(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) setRemotenessLegendDisclosure(null);
    });
  }, mode === 'on' ? 4200 : 3000);
}, [remotenessLegendDisclosureOpacity, remotenessLegendOpacity]);

const toggleRemotenessOverlay = useCallback(() => {
  hapticMicro();
  if (!showRemotenessOverlay && !remotenessOverlayAvailable) {
    showToast('Remoteness needs an active or selected route before ECS can shade the corridor.');
    return;
  }

  const next = !showRemotenessOverlay;
  setShowRemotenessOverlay(next);
  presentRemotenessLegendDisclosure(next ? 'on' : 'off');
}, [presentRemotenessLegendDisclosure, remotenessOverlayAvailable, showRemotenessOverlay, showToast]);

  const toggleExploreRoutesOverlay = useCallback(() => {
    hapticMicro();
    const next = !exploreRoutesEnabled;
    setExploreRoutesEnabled(next);
    if (!next) {
      setExploreRoutesHandoff(null);
      void clearExploreRoutesMapHandoff();
      return;
    }

    if (exploreRouteOverlayBuild.segments.length > 0) {
      return;
    }

    showToast('NO EXPLORE ROUTES WITH MAP GEOMETRY AVAILABLE');
  }, [exploreRouteOverlayBuild.segments.length, exploreRoutesEnabled, showToast]);

  const closeExploreRouteAnalysis = useCallback(() => {
    setSelectedExploreRouteSegmentId(null);
  }, []);

  const handleExploreRouteSegmentTap = useCallback((segment: SegmentSelectionPayload) => {
    if (segment?.kind !== 'explore_route' || segment.id == null) return;

    const match = exploreRouteOverlaySegments.find(
      (item) => String(item.id) === String(segment.id),
    );
    if (!match?.route) {
      showToast('EXPLORE ROUTE DETAILS UNAVAILABLE');
      return;
    }

    hapticMicro();
    setSelectedExploreRouteSegmentId(String(match.id));
  }, [exploreRouteOverlaySegments, showToast]);

  const handleBuildRouteFromExploreOverlay = useCallback(async () => {
    if (!selectedExploreRouteNavigationPayload) return;
    if (!canStageNavigationHandoffRoute(selectedExploreRouteNavigationPayload)) {
      showToast((selectedExploreRouteBuildUnavailableReason ?? 'Route geometry unavailable.').toUpperCase());
      return;
    }

    const payload = selectedExploreRouteNavigationPayload;
    closeExploreRouteAnalysis();
    await applyExploreNavigationPayload(payload);
  }, [
    applyExploreNavigationPayload,
    closeExploreRouteAnalysis,
    selectedExploreRouteBuildUnavailableReason,
    selectedExploreRouteNavigationPayload,
    showToast,
  ]);

  const handleBuildTripFromExploreOverlay = useCallback(() => {
    if (!selectedExploreRouteOpportunity) return;
    hapticMicro();
    saveTripBuilderRouteHandoff(selectedExploreRouteOpportunity as any);
    closeExploreRouteAnalysis();
    router.push({
      pathname: '/explore-trip-builder',
      params: { routeId: selectedExploreRouteOpportunity.id },
    } as any);
  }, [closeExploreRouteAnalysis, router, selectedExploreRouteOpportunity]);

  const handlePrepareOfflineFromExploreOverlay = useCallback(() => {
    if (!selectedExploreRouteOpportunity) return;
    hapticMicro();
    saveOfflinePrepPackHandoff({
      route: selectedExploreRouteOpportunity as any,
      campsiteCandidates: extractExploreRouteCampMarkers(selectedExploreRouteOpportunity).map((marker) => ({
        id: marker.id,
        name: marker.title,
        location: { latitude: marker.latitude, longitude: marker.longitude },
        score: marker.score,
        legalConfidence: marker.confidence,
        accessConfidence: marker.confidence,
        source: marker.source ?? 'explore_route_camp_marker',
        notes: [marker.subtitle],
      })),
    }, 'route_details');
    closeExploreRouteAnalysis();
    router.push({
      pathname: '/explore-offline-prep-pack',
      params: { routeId: selectedExploreRouteOpportunity.id },
    } as any);
  }, [closeExploreRouteAnalysis, router, selectedExploreRouteOpportunity]);

  const toggleDispersedCampingEligibility = useCallback(() => {
    if (!dispersedCampingEligibilityLayerAvailable) return;
    hapticMicro();
    const next = !dispersedCampingEligibilityEnabled;
    logCampLayerDebug('checkbox_change', {
      layer: 'dispersed_camping',
      enabled: next,
      featureCount: dispersedCampingRegions.length,
      status: dispersedCampingStatus,
    });
    setDispersedCampingUiState((current) => setCampLayerEnabled(current, next));
    if (!next) {
      dispersedCampingFetchCoordinatorRef.current.cancel();
      if (dispersedCampingFetchTimerRef.current) {
        clearTimeout(dispersedCampingFetchTimerRef.current);
        dispersedCampingFetchTimerRef.current = null;
      }
      setSelectedDispersedCampingRegion(null);
      return;
    }
  }, [
    dispersedCampingEligibilityEnabled,
    dispersedCampingEligibilityLayerAvailable,
    dispersedCampingRegions.length,
    dispersedCampingStatus,
  ]);

  const toggleEstablishedCampsites = useCallback(() => {
    if (!establishedCampsitesLayerAvailable) return;
    hapticMicro();
    const next = !establishedCampsitesEnabled;
    logCampLayerDebug('checkbox_change', {
      layer: 'established_campgrounds',
      enabled: next,
      featureCount: establishedCampgrounds.length,
      status: establishedCampgroundsStatus,
    });
    setEstablishedCampgroundsUiState((current) => setCampLayerEnabled(current, next));
    if (!next) {
      establishedCampgroundsFetchCoordinatorRef.current.cancel();
      if (establishedCampgroundsFetchTimerRef.current) {
        clearTimeout(establishedCampgroundsFetchTimerRef.current);
        establishedCampgroundsFetchTimerRef.current = null;
      }
      setSelectedEstablishedCampsite(null);
      return;
    }
    if (next && establishedCampsitesZoomReady) setRequestBoundsTrigger((prev) => prev + 1);
  }, [
    establishedCampgrounds.length,
    establishedCampgroundsStatus,
    establishedCampsitesEnabled,
    establishedCampsitesLayerAvailable,
    establishedCampsitesZoomReady,
  ]);

  const retryDispersedCampingEligibility = useCallback(() => {
    if (!dispersedCampingEligibilityZoomReady) {
      showToast(dispersedCampingZoomPrompt.toUpperCase());
      setDispersedCampingUiState(setCampLayerZoomDeferred);
      return;
    }
    const retryBbox = dispersedCampingUiState.lastAttemptedBbox ?? dispersedCampingUiState.lastSuccessfulBbox ?? mapBounds;
    if (!retryBbox) {
      setRequestBoundsTrigger((prev) => prev + 1);
      showToast('MAP VIEW BOUNDS REQUESTED');
      return;
    }
    const retryCacheKey = dispersedCampingUiState.lastAttemptedCacheKey ?? dispersedCampingUiState.lastSuccessfulCacheKey;
    if (retryCacheKey) {
      dispersedCampingFailedCacheKeysRef.current.add(retryCacheKey);
    }
    dispersedCampingRetryBboxRef.current = retryBbox;
    setDispersedCampingUiState((current) =>
      setCampLayerLoading(
        current.enabled ? current : setCampLayerEnabled(current, true),
        retryCacheKey
          ? {
              bbox: retryBbox,
              cacheKey: retryCacheKey,
            }
          : undefined,
      ),
    );
    setDispersedCampingRetryNonce((value) => value + 1);
  }, [
    dispersedCampingUiState.lastAttemptedBbox,
    dispersedCampingUiState.lastAttemptedCacheKey,
    dispersedCampingUiState.lastSuccessfulBbox,
    dispersedCampingUiState.lastSuccessfulCacheKey,
    dispersedCampingEligibilityZoomReady,
    dispersedCampingZoomPrompt,
    mapBounds,
    showToast,
  ]);

  const retryEstablishedCampgrounds = useCallback(() => {
    if (!establishedCampsitesZoomReady) {
      showToast(establishedCampsitesZoomPrompt.toUpperCase());
      setEstablishedCampgroundsUiState(setCampLayerZoomDeferred);
      return;
    }
    const retryBbox = establishedCampgroundsUiState.lastAttemptedBbox ?? establishedCampgroundsUiState.lastSuccessfulBbox ?? mapBounds;
    if (!retryBbox) {
      setRequestBoundsTrigger((prev) => prev + 1);
      showToast('MAP VIEW BOUNDS REQUESTED');
      return;
    }
    const retryCacheKey = establishedCampgroundsUiState.lastAttemptedCacheKey ?? establishedCampgroundsUiState.lastSuccessfulCacheKey;
    if (retryCacheKey) {
      establishedCampgroundsFailedCacheKeysRef.current.add(retryCacheKey);
    }
    establishedCampgroundsRetryBboxRef.current = retryBbox;
    setEstablishedCampgroundsUiState((current) =>
      setCampLayerLoading(
        current.enabled ? current : setCampLayerEnabled(current, true),
        retryCacheKey
          ? {
              bbox: retryBbox,
              cacheKey: retryCacheKey,
            }
          : undefined,
      ),
    );
    setEstablishedCampgroundsRetryNonce((value) => value + 1);
  }, [
    establishedCampgroundsUiState.lastAttemptedBbox,
    establishedCampgroundsUiState.lastAttemptedCacheKey,
    establishedCampgroundsUiState.lastSuccessfulBbox,
    establishedCampgroundsUiState.lastSuccessfulCacheKey,
    establishedCampsitesZoomPrompt,
    establishedCampsitesZoomReady,
    mapBounds,
    showToast,
  ]);

  const handleDispersedCampingRegionTap = useCallback(
    (payload: DispersedCampingRegionSelectionPayload) => {
      if (campScoutDrawingSuppressesDispersedRegionSheet) {
        return;
      }
      setSelectedDroppedPinId(null);
      setSelectedCampIntelId(null);
      setCampIntelComparisonVisible(false);
      setSelectedEstablishedCampsite(null);
      setSelectedCampScoutCandidateId(null);
      setSelectedCampOpsEndpointId(null);
      setSelectedDispersedCampingRegion(payload);
    },
    [campScoutDrawingSuppressesDispersedRegionSheet],
  );

  const closeDispersedCampingRegionSheet = useCallback(() => {
    setSelectedDispersedCampingRegion(null);
  }, []);

  const handleEstablishedCampsiteTap = useCallback((payload: EstablishedCampsite) => {
    setSelectedDroppedPinId(null);
    setSelectedCampIntelId(null);
    setCampIntelComparisonVisible(false);
    setSelectedDispersedCampingRegion(null);
    setSelectedCampScoutCandidateId(null);
    setSelectedCampOpsEndpointId(null);
    setSelectedEstablishedCampsite(payload);
  }, []);

  const handleActiveGuidanceLayout = useCallback((height: number) => {
    if (!Number.isFinite(height) || height <= 0) return;
    setActiveGuidanceMeasuredHeight((current) => (
      Math.abs(current - height) < 1 ? current : height
    ));
  }, []);

  useEffect(() => {
    if (navigationOverlayMode !== 'active') {
      setActiveGuidanceMeasuredHeight(0);
    }
  }, [navigationOverlayMode]);

  const handleEstablishedCampsiteSummarySelect = useCallback(
    (campsite: RouteNearbyEstablishedCampsite) => {
      hapticMicro();
      setSelectedEstablishedCampsite(campsite);
    },
    [],
  );

  const handleEstablishedCampsiteViewOnMap = useCallback(
    (campsite: RouteNearbyEstablishedCampsite) => {
      hapticMicro();
      setSelectedEstablishedCampsite(campsite);
      queueMapCameraCommand(
        {
          mode: 'pin_focus',
          center: { latitude: campsite.latitude, longitude: campsite.longitude },
          zoom: 13,
          pitch: 35,
          animate: true,
          durationMs: 650,
          reason: 'established_campsite_route_summary',
        },
        { force: true },
      );
    },
    [queueMapCameraCommand],
  );

  const handleEstablishedCampsiteNavigate = useCallback(
    async (campsite: EstablishedCampsite) => {
      if (
        !Number.isFinite(campsite.latitude) ||
        !Number.isFinite(campsite.longitude) ||
        campsite.latitude < -90 ||
        campsite.latitude > 90 ||
        campsite.longitude < -180 ||
        campsite.longitude > 180
      ) {
        showToast('CAMPGROUND LOCATION UNAVAILABLE');
        return;
      }

      hapticMicro();
      setSelectedEstablishedCampsite(null);
      setCampLayerMenuOpen(false);
      await previewRoadDestination(
        {
          id: `established-campsite:${campsite.id}`,
          title: campsite.name,
          subtitle: campsite.managingAgency || campsite.operatorName || 'Established campground',
          coordinate: {
            lat: campsite.latitude,
            lng: campsite.longitude,
          },
          sourceType: 'manual_selection',
          raw: {
            source: 'established_campground',
            campgroundId: campsite.id,
            provider: campsite.primaryProvider ?? campsite.source,
          },
        },
        'manual_selection',
      );
    },
    [previewRoadDestination, showToast],
  );

  const closeEstablishedCampsiteSheet = useCallback(() => {
    setSelectedEstablishedCampsite(null);
  }, []);

  const generateDispersedCampingCampScoutPins = useCallback((input: {
    regions: DispersedCampingRegion[];
    routeNearbyRegions?: RouteNearbyDispersedCampingRegion[];
    scoutCenter?: { latitude: number; longitude: number } | null;
    maxScoutRadiusMiles?: number;
    maxRouteDistanceMiles?: number;
    selectFirstCandidate?: boolean;
    focusGeneratedPins?: boolean;
    scopeLabel?: string;
    maxCandidates?: number;
  }): number => {
    const result = buildDispersedCampingCampScoutCandidates({
      regions: input.regions,
      routeNearbyRegions: input.routeNearbyRegions,
      routeCoordinates: displayedRoutePoints,
      currentLocation: safeUserLocation,
      scoutCenter: input.scoutCenter ?? undefined,
      maxScoutRadiusMiles: input.maxScoutRadiusMiles,
      maxRouteDistanceMiles: input.maxRouteDistanceMiles,
      maxCandidates: input.maxCandidates ?? 5,
      includeVerifyCandidates: true,
    });

    setDispersedCampingCampScoutCandidates(result.candidates);
    setDispersedCampingCampScoutStatus(
      result.candidates.length > 0
        ? `${result.candidates.length} ECS-Inferred ${input.scopeLabel ?? 'candidate'} scouting pin${result.candidates.length === 1 ? '' : 's'} added. Verify locally.`
        : `No eligible candidate scouting locations found for ${input.scopeLabel ?? 'this selection'}.`,
    );
    if (result.candidates.length > 0 && input.selectFirstCandidate !== false) {
      setSelectedCampScoutCandidateId(result.candidates[0].id);
    } else {
      setSelectedCampScoutCandidateId(null);
    }
    if (result.candidates.length > 0 && input.focusGeneratedPins) {
      const firstCandidate = result.candidates[0];
      queueMapCameraCommand(
        {
          mode: 'pin_focus',
          center: {
            latitude: firstCandidate.coordinate.latitude,
            longitude: firstCandidate.coordinate.longitude,
          },
          zoom: result.candidates.length === 1 ? 14.2 : 12.8,
          pitch: 28,
          animate: true,
          durationMs: 650,
          reason: 'dispersed_camping_scout_pin_focus',
        },
        { force: true },
      );
    }
    return result.candidates.length;
  }, [
    displayedRoutePoints,
    queueMapCameraCommand,
    safeUserLocation,
  ]);

  const handleScoutDispersedCampingCandidatePins = useCallback(() => {
    if (!dispersedCampingEligibilityLayer.enabled || !dispersedCampingRouteHasRoute) {
      setDispersedCampingCampScoutStatus('Enable the eligibility layer and select a route before scouting pins.');
      showToast('SELECT A ROUTE AND ENABLE ELIGIBILITY FIRST');
      return;
    }

    hapticMicro();
    generateDispersedCampingCampScoutPins({
      regions: dispersedCampingRegions,
      routeNearbyRegions: dispersedCampingRouteNearbyResults,
      selectFirstCandidate: false,
      focusGeneratedPins: true,
      scopeLabel: 'route-corridor candidate',
      maxRouteDistanceMiles: DEFAULT_DISPERSED_CAMPING_ROUTE_CORRIDOR_MILES,
      maxCandidates: 10,
    });
  }, [
    dispersedCampingEligibilityLayer.enabled,
    dispersedCampingRegions,
    dispersedCampingRouteHasRoute,
    dispersedCampingRouteNearbyResults,
    generateDispersedCampingCampScoutPins,
    showToast,
  ]);

  const handleScoutSelectedDispersedCampingRegionPins = useCallback(() => {
    if (!selectedDispersedCampingRegionLive || !dispersedCampingEligibilityLayer.enabled) {
      setDispersedCampingCampScoutStatus('Select a visible dispersed camping region before scouting pins.');
      showToast('SELECT A DISPERSED CAMPING REGION FIRST');
      return;
    }
    const liveRegion = dispersedCampingRegions.find((region) => region.id === selectedDispersedCampingRegionLive.regionId);
    if (!liveRegion) {
      setDispersedCampingCampScoutStatus('This region is no longer in the live map layer. Refresh eligibility and try again.');
      showToast('REGION NOT IN CURRENT LIVE LAYER');
      return;
    }

    hapticMicro();
    const routeNearby = dispersedCampingRouteNearbyResults.filter((result) => result.regionId === liveRegion.id);
    const selectedDispersedCampingScoutCenter =
      typeof selectedDispersedCampingRegionLive.latitude === 'number' &&
      Number.isFinite(selectedDispersedCampingRegionLive.latitude) &&
      typeof selectedDispersedCampingRegionLive.longitude === 'number' &&
      Number.isFinite(selectedDispersedCampingRegionLive.longitude)
        ? {
            latitude: selectedDispersedCampingRegionLive.latitude,
            longitude: selectedDispersedCampingRegionLive.longitude,
          }
        : null;
    const generatedCount = generateDispersedCampingCampScoutPins({
      regions: [liveRegion],
      routeNearbyRegions: routeNearby,
      scoutCenter: selectedDispersedCampingScoutCenter,
      maxScoutRadiusMiles: 2,
      maxCandidates: 5,
      selectFirstCandidate: false,
      focusGeneratedPins: true,
      scopeLabel: 'selected-region',
    });
    if (generatedCount > 0) {
      setSelectedDispersedCampingRegion(null);
    }
  }, [
    dispersedCampingEligibilityLayer.enabled,
    dispersedCampingRegions,
    dispersedCampingRouteNearbyResults,
    generateDispersedCampingCampScoutPins,
    selectedDispersedCampingRegionLive,
    showToast,
  ]);

  const handleClearDispersedCampingCampScoutPins = useCallback(() => {
    hapticMicro();
    setDispersedCampingCampScoutCandidates([]);
    setDispersedCampingCampScoutStatus('Dispersed camping scout pins cleared.');
    setSelectedCampScoutCandidateId(null);
  }, []);

  useEffect(() => {
    if (!dispersedCampingEligibilityLayer.enabled) {
      setSelectedDispersedCampingRegion(null);
    }
  }, [dispersedCampingEligibilityLayer.enabled]);

  useEffect(() => {
    if (showRemotenessOverlay && !remotenessOverlayAvailable) {
      setShowRemotenessOverlay(false);
      setRemotenessLegendDisclosure(null);
      setRemotenessLegendMounted(false);
    }
}, [remotenessOverlayAvailable, showRemotenessOverlay]);

useEffect(() => {
  return () => {
    if (remotenessLegendDisclosureTimerRef.current) {
      clearTimeout(remotenessLegendDisclosureTimerRef.current);
      remotenessLegendDisclosureTimerRef.current = null;
    }
    remotenessLegendOpacity.stopAnimation();
    remotenessLegendDisclosureOpacity.stopAnimation();
  };
}, [remotenessLegendDisclosureOpacity, remotenessLegendOpacity]);

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
  setRoadStepListExpanded(!roadStepListExpanded);
}, [roadStepListExpanded, setRoadStepListExpanded]);

const handleRoadOverlaySelectSuggestion = useCallback((suggestion: RoadNavSearchSuggestion) => {
  setRecentSearchesVisible(false);
  void rememberRecentRoadSearch(suggestion).then((stored) => {
    setRecentSearches(stored);
  }).catch(() => {});
  clearActiveRunSelection();
  void clearExploreNavigationPayload();
  void endTrailNavigation();
  void selectRoadSuggestion(suggestion);
  closeToolsPopup();
}, [
  clearActiveRunSelection,
  clearExploreNavigationPayload,
  closeToolsPopup,
  endTrailNavigation,
  setRecentSearches,
  selectRoadSuggestion,
]);

const handleRecentSearchSelection = useCallback((suggestion: RoadNavSearchSuggestion) => {
  handleRoadOverlaySelectSuggestion(suggestion);
}, [handleRoadOverlaySelectSuggestion]);

const recentSearchesSectionVisible =
  recentSearchesVisible &&
  roadNavigation.query.trim().length === 0 &&
  !roadNavigation.searchLoading;

const gpsStatusOverlayBottomOffset = LOWER_DOCK_EXCLUSION + PAGE_FRAME_BOTTOM_GAP + 12;

const gpsStatusOverlayMaxWidth = Math.max(
  adaptive.isExpanded ? 232 : 196,
  Math.min(
    adaptive.isExpanded ? 332 : 296,
    TOP_LEFT_STATUS_MAX_WIDTH - (adaptive.isExpanded ? 20 : 18),
  ),
);

const recentSearchCount = recentSearches.length;

const recentSearchesTitle = recentSearchCount > 0
  ? `RECENT SEARCHES - ${recentSearchCount}`
  : 'RECENT SEARCHES';

const recentSearchesEmptyMessage =
  'Search for an address, place, or trail and it will appear here for fast relaunch.';

const handleRoadOverlayStartNavigation = useCallback(() => {
  if (explorePreviewMode === 'trail') {
    requestStartExpedition('trail');
    return;
  }
  requestStartExpedition('road');
}, [
  explorePreviewMode,
  requestStartExpedition,
]);

const previewReadinessAccessory = useMemo(() => {
  return previewRouteHazardAccessory;
}, [
  previewRouteHazardAccessory,
]);

const activeReadinessAccessory = useMemo(() => {
  if (navigationOverlayMode !== 'active') return null;
  return (
    <NavigateReadinessStrip
      mode="active"
      onOpenCommandBrief={handleOpenCommandBriefFromNavigate}
      onMinimize={() => setActiveReadinessMinimized(true)}
    />
  );
}, [
  handleOpenCommandBriefFromNavigate,
  navigationOverlayMode,
  setActiveReadinessMinimized,
]);

const handleRoadOverlayEndNavigation = useCallback(() => {
  closeToolsPopup();
  clearActiveRunSelection();
  void clearExploreNavigationPayload();
  void endTrailNavigation();
  void endRoadNavigation();
  showToast('NAVIGATION ENDED');
}, [
  clearActiveRunSelection,
  clearExploreNavigationPayload,
  closeToolsPopup,
  endRoadNavigation,
  endTrailNavigation,
  showToast,
]);

const handleRoadOverlayClearDestination = useCallback(() => {
  clearActiveRunSelection();
  void clearExploreNavigationPayload();
  void endTrailNavigation();
  void clearRoadDestination();
}, [
  clearActiveRunSelection,
  clearExploreNavigationPayload,
  clearRoadDestination,
  endTrailNavigation,
]);

const handleRoadOverlayReroute = useCallback(() => {
  if (trailNavigationUiMode === 'active' || pendingHybridTrailTransition) {
    if (trailRejoinPoint) {
      fitMapToCoordinatePreview(
        trailRejoinPoint,
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
  void rerouteRoadNavigation('manual');
}, [
  fitMapToCoordinatePreview,
  pendingHybridTrailTransition,
  rerouteRoadNavigation,
  showToast,
  trailNavigationUiMode,
  trailRejoinPoint,
  userLocation,
]);

const mapTiltAlertMarkers = useMemo<React.ComponentProps<typeof MapRenderer>['tiltAlertMarkers']>(
  () => (showTiltAlertZones
    ? (safeArray(tiltAlertMarkers as any) as NonNullable<React.ComponentProps<typeof MapRenderer>['tiltAlertMarkers']>)
    : []),
  [showTiltAlertZones, tiltAlertMarkers],
);

const compassContainerStyle = useMemo(
  () => ({ bottom: COMPASS_BOTTOM, right: COMPASS_RIGHT }),
  [COMPASS_BOTTOM, COMPASS_RIGHT],
);

const mapCameraMode = useMemo<React.ComponentProps<typeof MapRenderer>['cameraMode']>(() => {
  if (isReplayActive && replayPlaying) {
    return 'replay';
  }

  return followUser ? 'follow_user' : 'free_pan';
}, [followUser, isReplayActive, replayPlaying]);



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
        key={`navigate-map-${mapSurfaceRevision}`}
        points={displayedRoutePoints}
        progressPoints={displayedRouteProgressPoints}
        waypoints={displayedRouteWaypoints}
        healthLevel={activeHealth?.overall || 'green'}
        routeColor={displayedRouteColor}
        progressColor={displayedRouteProgressColor}
        routeRenderMode={displayedRouteRenderMode}
        mapStyle={mapStyle}
        mapboxToken={mapToken || ''}
        showUserLocation={!!safeUserLocation}
        followUser={followUser}
        userLocation={safeUserLocation}
        interactive
        segments={mapSegmentFeatures}
        bailoutMarkers={bailoutMarkers}
        pinMarkers={filteredPinMarkers}
        showCrosshair={showCrosshair}
        onLongPress={handleLongPress}
        onPinTap={handlePinTap}
        onSegmentTap={handleExploreRouteSegmentTap}
        onCampIntelTap={handleCampIntelTap}
        onCampScoutTap={handleCampScoutTap}
        onMapTap={handleDirectMapTapForPin}
        onDispersedCampingRegionTap={handleDispersedCampingRegionTap}
        onEstablishedCampsiteTap={handleEstablishedCampsiteTap}
        onMapCenterReply={handleMapCenterReply}
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
        campIntelMarkers={combinedCampMarkers}
        campScoutMarkers={sharedCampPinMapMarkers}
        tiltAlertMarkers={mapTiltAlertMarkers}
        cameraMode={mapCameraMode}
        cameraCommand={mapCameraCommand}
        cameraCommandTrigger={mapCameraCommandTrigger}
        routeBuilderActive={routeBuilderActive}
        routeBuilderSegments={routeBuilderSegments}
        routeBuilderColor="#65F0D4"
        onRouteBuilderUpdate={handleRouteBuilderUpdate}
        onRouteBuilderGestureStateChange={handleRouteBuilderGestureStateChange}
        remoteOverlay={remotenessMapOverlay}
        dispersedCampingEligibility={dispersedCampingEligibilityLayer}
        establishedCampsites={establishedCampsitesLayer}
        campsiteSearchPolygon={{
          coordinates: campsiteDrawingPoints,
          closed: campsiteDrawingClosed,
        }}
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
        topOffset={roadNavigationSurfaceTopOffset}
        bottomOffset={routeSurfaceBottomOffset}
        guidanceRightInset={navigationOverlayMode === 'active' ? 0 : ACTIVE_GUIDANCE_RIGHT_INSET}
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
        activeGuidanceMinimized={activeGuidanceMinimized}
        onToggleActiveGuidanceMinimized={handleToggleActiveGuidanceMinimized}
        activeGuidanceWidth={activeGuidanceLandscapeWidth}
        onActiveGuidanceLayout={handleActiveGuidanceLayout}
        activeAccessoryMinimized={navigateLandscapeExpanded ? true : activeReadinessMinimized}
        onExpandActiveAccessory={() => setActiveReadinessMinimized(false)}
        uiMode={navigationOverlayMode}
        previewContext={mapOverlayStartupReady ? navigationPreviewContext : null}
        activeContext={mapOverlayStartupReady ? navigationActiveContext : null}
        showSearchSurface={false}
        onRouteOverview={handleRouteOverview}
        onOpenCommandBrief={handleOpenCommandBriefFromNavigate}
        onPrimaryPreviewAction={handleRoadOverlayStartNavigation}
        onPrepareOffline={handlePrepareOfflineFromRoadPreview}
        previewAccessory={previewReadinessAccessory}
        activeAccessory={activeReadinessAccessory}
      />

      <StartExpeditionDecisionSheet
        visible={startDecisionVisible}
        assessment={currentExpeditionReadiness}
        reviewReasons={pendingStartReviewReasons}
        presentation="routePreviewMask"
        topOffset={roadNavigationSurfaceTopOffset}
        bottomOffset={routeSurfaceBottomOffset}
        horizontalInset={OVERLAY_EDGE}
        rightInset={routeBottomRightInset}
        onClose={() => {
          setStartDecisionVisible(false);
          setPendingStartMode(null);
          setPendingStartReviewReasons([]);
        }}
        onReviewCommandBrief={() => {
          setStartDecisionVisible(false);
          setPendingStartMode(null);
          setPendingStartReviewReasons([]);
          handleOpenCommandBriefFromNavigate();
        }}
        onConfirmStart={({ acknowledgedOverride }) => {
          executeStartExpeditionNow(pendingStartMode ?? (explorePreviewMode === 'trail' ? 'trail' : 'road'), acknowledgedOverride);
        }}
      />

      <Toast
        placement="top"
        topOffset={mapToastTopOffset}
        bottomOffset={mapToastBottomOffset}
        horizontalInset={adaptive.isExpanded ? Math.max(OVERLAY_EDGE, 120) : OVERLAY_EDGE}
        elevated
        zIndex={mapToastAttachedToGuidance ? 84 : undefined}
      />

      <CampIntelDetailCard
        visible={campIntelVisible && !!selectedCampIntel}
        site={selectedCampIntel}
        comparison={selectedCampIntelComparison}
        comparisonVisible={campIntelComparisonVisible}
        rank={selectedCampIntelRank}
        searchContext={selectedCampIntelSearchContext}
        topOffset={campsiteDetailTopOffset}
        bottomOffset={campLayerDetailBottomOffset}
        rightInset={0}
        onNavigateHere={handleCampIntelNavigateHere}
        onSaveCamp={handleCampIntelSave}
        onCompareNearby={handleCampIntelCompareNearby}
        onMarkUsed={handleCampIntelMarkUsed}
        onReportUnusable={handleCampIntelReportUnusable}
        onDismiss={handleCampIntelDismiss}
      />

      <DroppedPinDetailSheet
        visible={!!selectedDroppedPin}
        pin={selectedDroppedPin}
        topOffset={campsiteDetailTopOffset}
        bottomOffset={campLayerDetailBottomOffset}
        nearestRoadLabel={null}
        onEdit={handleDroppedPinEdit}
        onDelete={handleDroppedPinDelete}
        onClose={handleDroppedPinClose}
      />

      <CampScoutIntelCard
        visible={!!selectedCampScoutCandidate || !!selectedCampOpsIntel}
        candidate={selectedCampScoutCandidate}
        campOpsDetail={selectedCampOpsIntel}
        topOffset={campsiteDetailTopOffset}
        bottomOffset={campLayerDetailBottomOffset}
        maxWidth={420}
        navigateSafe={!!selectedCampOpsIntel || campScoutNavigateSafe}
        saveSupported
        feedbackSupported={!!selectedCampOpsIntel || selectedCampScoutCandidate?.sourceType === 'community_suggested'}
        onNavigateHere={selectedCampOpsIntel ? handleCampOpsNavigateHere : handleCampScoutNavigateHere}
        onSaveCandidate={selectedCampOpsIntel ? handleCampOpsSaveCandidate : handleCampScoutSaveCandidate}
        onReportNotViable={selectedCampOpsIntel ? handleCampOpsReportUnusable : handleCampScoutReportNotViable}
        onCompareNearby={handleCampOpsCompareNearby}
        onMarkUsed={handleCampOpsMarkUsed}
        onDismiss={selectedCampOpsIntel ? handleCampOpsDismiss : handleCampScoutDismiss}
      />

      <CommunityCampsiteDetailCard
        visible={!!selectedCommunityCampSite}
        site={selectedCommunityCampSite}
        photos={
          selectedCommunityCampSite
            ? communityCampSitePhotosById[selectedCommunityCampSite.id] ?? []
            : []
        }
        topOffset={campsiteDetailTopOffset}
        bottomOffset={campLayerDetailBottomOffset}
        rightInset={0}
        onNavigateHere={handleCommunityCampsiteNavigateHere}
        onSave={handleCommunityCampsiteSave}
        onConfirm={handleCommunityCampsiteConfirm}
        onFlag={handleCommunityCampsiteFlag}
        onDismiss={handleCommunityCampsiteDismiss}
      />

      <CampsiteVisibilityDetailCard
        visible={!!selectedScopedCampsiteReport && !!selectedScopedCampsite}
        report={selectedScopedCampsiteReport}
        scope={selectedScopedCampsite?.scope ?? null}
        topOffset={campsiteDetailTopOffset}
        bottomOffset={campLayerDetailBottomOffset}
        rightInset={0}
        onNavigateHere={handleScopedCampsiteNavigateHere}
        onEdit={handleScopedCampsiteEdit}
        onDelete={handleScopedCampsiteDelete}
        onShare={handleScopedCampsiteShare}
        onSubmitToCommunity={handleScopedCampsiteSubmitToCommunity}
        onWithdraw={handleScopedCampsiteWithdraw}
        onOpenReview={handleScopedCampsiteOpenReview}
        onDismiss={handleScopedCampsiteDismiss}
      />

      <GroupCampsiteMarkerDetailCard
        visible={!!selectedGroupCampsiteItem}
        item={selectedGroupCampsiteItem}
        groupName={selectedGroupCampsiteGroup?.group.name ?? null}
        topOffset={campsiteDetailTopOffset}
        bottomOffset={campLayerDetailBottomOffset}
        rightInset={0}
        onNavigateHere={handleGroupCampsiteNavigateHere}
        onOpenGroup={handleGroupCampsiteOpenGroup}
        onRemoveShare={
          selectedGroupCampsiteGroup?.membership.role === 'owner' ||
          selectedGroupCampsiteGroup?.membership.role === 'admin'
            ? handleGroupCampsiteRemoveShare
            : undefined
        }
        onDismiss={handleGroupCampsiteDismiss}
      />

      <DispersedCampingRegionSheet
        visible={!!selectedDispersedCampingRegionLive && dispersedCampingEligibilityLayer.enabled}
        region={selectedDispersedCampingRegionLive}
        topOffset={campsiteDetailTopOffset}
        bottomOffset={campLayerDetailBottomOffset}
        onClose={closeDispersedCampingRegionSheet}
        onScoutNearbyPins={handleScoutSelectedDispersedCampingRegionPins}
        onClearScoutPins={handleClearDispersedCampingCampScoutPins}
        scoutNearbyDisabled={!selectedDispersedCampingRegionLive || !dispersedCampingEligibilityLayer.enabled}
        scoutNearbyStatusText={dispersedCampingCampScoutStatus}
        scoutPinsVisible={dispersedCampingCampScoutCandidates.length > 0}
      />

      <EstablishedCampsiteSheet
        visible={!!selectedEstablishedCampsite && establishedCampsitesLayer.enabled}
        campsite={selectedEstablishedCampsite}
        topOffset={campsiteDetailTopOffset}
        bottomOffset={campLayerDetailBottomOffset}
        onClose={closeEstablishedCampsiteSheet}
        onNavigate={handleEstablishedCampsiteNavigate}
      />

      <ExpeditionAnalysisModal
        visible={!!selectedExploreRouteOpportunity}
        opportunity={selectedExploreRouteOpportunity}
        compatResult={selectedExploreRouteCompatResult}
        vehicleProfile={selectedExploreRouteVehicleProfile}
        hasVehicle={!!navigateVehicleContext.activeVehicleId}
        onClose={closeExploreRouteAnalysis}
        onBuildRoute={handleBuildRouteFromExploreOverlay}
        buildRouteDisabled={!!selectedExploreRouteBuildUnavailableReason}
        buildRouteDisabledReason={selectedExploreRouteBuildUnavailableReason}
        footerExtra={
          selectedExploreRouteOpportunity ? (
            <>
              <TouchableOpacity
                style={styles.exploreRouteModalFooterBtn}
                activeOpacity={0.84}
                onPress={handleBuildTripFromExploreOverlay}
                accessibilityRole="button"
                accessibilityLabel="Build Trip"
                testID="explore-route-overlay-build-trip"
              >
                <Ionicons name="git-merge-outline" size={14} color={TACTICAL.amber} />
                <Text style={styles.exploreRouteModalFooterText} numberOfLines={2}>
                  BUILD{'\n'}TRIP
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.exploreRouteModalFooterBtn}
                activeOpacity={0.84}
                onPress={handlePrepareOfflineFromExploreOverlay}
                accessibilityRole="button"
                accessibilityLabel="Prepare Offline Pack"
                testID="explore-route-overlay-prepare-offline-pack"
              >
                <Ionicons name="download-outline" size={14} color={TACTICAL.amber} />
                <Text style={styles.exploreRouteModalFooterText} numberOfLines={2}>
                  PREP{'\n'}OFFLINE
                </Text>
              </TouchableOpacity>
            </>
          ) : null
        }
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
            latitude={weatherLocation?.lat ?? null}
            longitude={weatherLocation?.lng ?? null}
            autoFetch
            compact
            units="imperial"
            weatherSnapshot={operationalWeather.snapshot}
            onRefreshWeather={operationalWeather.refresh}
            trailAssessmentActive={navigateTrailAssessmentActive}
          />
        </View>
      )}

      <View
        style={[
          styles.mapFloatingControlsLayer,
          selectedCampIntelId && styles.mapFloatingControlsLayerPersistent,
          (selectedCampScoutCandidateId || selectedCampOpsEndpointId) && styles.mapFloatingControlsLayerPersistent,
        ]}
        pointerEvents="box-none"
      >
        {routeIndicatorVisible && mapRouteIndicator ? (
          <TouchableOpacity
            style={[
              styles.routeIndicatorBadge,
              {
                top: routeIndicatorTopOffset,
                left: routeIndicatorAnchoredToTopToolbox ? undefined : OVERLAY_EDGE,
                right: routeIndicatorAnchoredToTopToolbox ? OVERLAY_EDGE : undefined,
              },
            ]}
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
              { bottom: TOOLS_TRIGGER_BOTTOM, right: TOOLS_TRIGGER_RIGHT },
            ]}
            pointerEvents="box-none"
          >
            {campLayerControlsAvailable && campLayerMenuOpen ? (
              <View style={styles.campLayerMenuPanel}>
                <View style={styles.campLayerMenuHeader}>
                  <View style={styles.campLayerMenuTitleRow}>
                    <Ionicons name="bonfire-outline" size={14} color={TACTICAL.amber} />
                    <Text style={styles.campLayerMenuTitle}>Camp Layers</Text>
                  </View>
                  <TouchableOpacity
                    style={styles.campLayerMenuCloseButton}
                    onPress={() => setCampLayerMenuOpen(false)}
                    activeOpacity={0.78}
                    hitSlop={CLOSE_CONTROL_HIT_SLOP}
                    accessibilityRole="button"
                    accessibilityLabel="Close camp layer menu"
                  >
                    <Ionicons name="close" size={14} color={TACTICAL.textMuted} />
                  </TouchableOpacity>
                </View>

                {establishedCampsitesLayerAvailable ? (
                  <TouchableOpacity
                    style={[
                      styles.dispersedCampingToggle,
                      styles.campLayerMenuToggle,
                      establishedCampsitesEnabled && styles.dispersedCampingToggleActive,
                    ]}
                    onPress={toggleEstablishedCampsites}
                    activeOpacity={0.86}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: establishedCampsitesEnabled }}
                    accessibilityLabel="Established Campgrounds"
                  >
                    <View
                      style={[
                        styles.dispersedCampingCheckbox,
                        establishedCampsitesEnabled && styles.dispersedCampingCheckboxActive,
                      ]}
                    >
                      {establishedCampsitesEnabled ? (
                        <Ionicons name="checkmark" size={13} color="#091014" />
                      ) : null}
                    </View>
                    <View style={styles.dispersedCampingToggleCopy}>
                      <Text style={styles.dispersedCampingToggleTitle} numberOfLines={2}>
                        Established Campgrounds
                      </Text>
                      <Text style={styles.dispersedCampingToggleSubtitle} numberOfLines={2}>
                        Shows known fixed campgrounds, RV parks, and pay-per-night camping locations.
                      </Text>
                    </View>
                  </TouchableOpacity>
                ) : null}

                {dispersedCampingEligibilityLayerAvailable ? (
                  <TouchableOpacity
                    style={[
                      styles.dispersedCampingToggle,
                      styles.campLayerMenuToggle,
                      dispersedCampingEligibilityEnabled && styles.dispersedCampingToggleActive,
                    ]}
                    onPress={toggleDispersedCampingEligibility}
                    activeOpacity={0.86}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: dispersedCampingEligibilityEnabled }}
                    accessibilityLabel="Dispersed Camping Eligibility"
                  >
                    <View
                      style={[
                        styles.dispersedCampingCheckbox,
                        dispersedCampingEligibilityEnabled && styles.dispersedCampingCheckboxActive,
                      ]}
                    >
                      {dispersedCampingEligibilityEnabled ? (
                        <Ionicons name="checkmark" size={13} color="#091014" />
                      ) : null}
                    </View>
                    <View style={styles.dispersedCampingToggleCopy}>
                      <Text style={styles.dispersedCampingToggleTitle} numberOfLines={2}>
                        Dispersed Camping Eligibility
                      </Text>
                      <Text style={styles.dispersedCampingToggleSubtitle} numberOfLines={2}>
                        Highlights likely eligible public-land regions. Verify local rules before camping.
                      </Text>
                    </View>
                  </TouchableOpacity>
                ) : null}

                <View style={styles.campLayerMenuNotes}>
                  {establishedCampsitesEnabled ? (
                    <View style={styles.campLayerStatusBlock}>
                      <Text style={styles.dispersedCampingDisclaimer}>
                        {establishedCampgroundsStatus === 'zoom'
                          ? establishedCampsitesZoomPrompt
                          : establishedCampgroundsStatus === 'loading'
                          ? 'Loading established campgrounds from ECS cache.'
                          : establishedCampgroundsStatus === 'empty'
                            ? 'No results in this map area.'
                            : establishedCampgroundsStatus === 'error'
                              ? establishedCampgroundsError || 'Temporarily unavailable.'
                              : establishedCampgroundsStatus === 'ready'
                                ? campLayerFetchOnline
                                  ? `${establishedCampgrounds.length} established campground${establishedCampgrounds.length === 1 ? '' : 's'} loaded.`
                                  : `${establishedCampgrounds.length} cached established campground${establishedCampgrounds.length === 1 ? '' : 's'} loaded for offline reference. Verify status and availability when connected.`
                                : 'Map bounds updating.'}
                      </Text>
                      {establishedCampgroundsStatus === 'error' ? (
                        <View style={styles.campLayerErrorActions}>
                          <TouchableOpacity
                            style={styles.campLayerRetryButton}
                            onPress={retryEstablishedCampgrounds}
                            activeOpacity={0.82}
                            accessibilityRole="button"
                            accessibilityLabel="Retry established campgrounds"
                          >
                            <Text style={styles.campLayerRetryButtonText}>RETRY</Text>
                          </TouchableOpacity>
                          {establishedCampgroundsDiagnostic ? (
                            <Text style={styles.campLayerDiagnosticText} numberOfLines={2}>
                              {establishedCampgroundsDiagnostic}
                            </Text>
                          ) : null}
                        </View>
                      ) : null}
                    </View>
                  ) : null}
                  {dispersedCampingEligibilityLayerAvailable ? (
                    <View style={styles.campLayerStatusBlock}>
                      <Text style={styles.dispersedCampingDisclaimer}>
                        {dispersedCampingEligibilityEnabled
                          ? dispersedCampingStatus === 'zoom'
                            ? dispersedCampingZoomPrompt
                            : dispersedCampingStatus === 'loading'
                            ? 'Loading public-land eligibility polygons for this map view.'
                            : dispersedCampingStatus === 'empty'
                              ? 'No results in this map area.'
                              : dispersedCampingStatus === 'error'
                                ? dispersedCampingError || 'Temporarily unavailable.'
                                : dispersedCampingStatus === 'ready'
                                  ? campLayerFetchOnline
                                    ? `${dispersedCampingRegions.length} public-land eligibility area${dispersedCampingRegions.length === 1 ? '' : 's'} loaded. Verify before camping.`
                                    : `${dispersedCampingRegions.length} cached public-land eligibility area${dispersedCampingRegions.length === 1 ? '' : 's'} loaded for offline reference. Verify before camping.`
                                  : 'Map bounds updating.'
                          : 'ECS shows areas where dispersed camping may be allowed based on available public-land and access data. Always verify current local rules, posted closures, fire restrictions, permits, and agency guidance before camping.'}
                      </Text>
                      {dispersedCampingEligibilityEnabled && dispersedCampingStatus === 'error' ? (
                        <View style={styles.campLayerErrorActions}>
                          <TouchableOpacity
                            style={styles.campLayerRetryButton}
                            onPress={retryDispersedCampingEligibility}
                            activeOpacity={0.82}
                            accessibilityRole="button"
                            accessibilityLabel="Retry dispersed camping eligibility"
                          >
                            <Text style={styles.campLayerRetryButtonText}>RETRY</Text>
                          </TouchableOpacity>
                          {dispersedCampingDiagnostic ? (
                            <Text style={styles.campLayerDiagnosticText} numberOfLines={2}>
                              {dispersedCampingDiagnostic}
                            </Text>
                          ) : null}
                        </View>
                      ) : null}
                    </View>
                  ) : null}
                </View>
              </View>
            ) : null}

            <View style={styles.utilityPrimaryRow} pointerEvents="box-none">
              <TouchableOpacity
                style={[
                  styles.quickActionsTrigger,
                  { width: TOOLS_TRIGGER_SIZE, height: TOOLS_TRIGGER_SIZE },
                  showRemotenessOverlay && styles.quickActionsTriggerActive,
                  !showRemotenessOverlay &&
                    !remotenessOverlayAvailable &&
                    styles.quickActionsTriggerDisabled,
                ]}
                onPress={toggleRemotenessOverlay}
                activeOpacity={0.85}
                hitSlop={EDGE_CONTROL_HIT_SLOP}
                accessibilityRole="switch"
                accessibilityState={{
                  checked: showRemotenessOverlay,
                  disabled: !showRemotenessOverlay && !remotenessOverlayAvailable,
                }}
                accessibilityLabel="Remoteness map overlay"
                accessibilityHint="Toggles cell service and remoteness guidance over the active route corridor."
              >
                <Ionicons
                  name="radio-outline"
                  size={17}
                  color={
                    showRemotenessOverlay
                      ? '#091014'
                      : remotenessOverlayAvailable
                        ? TACTICAL.amber
                        : TACTICAL.textMuted
                  }
                />
              </TouchableOpacity>
            </View>

            {campLayerControlsAvailable ? (
              <View style={styles.utilityPrimaryRow} pointerEvents="box-none">
                <TouchableOpacity
                  style={[
                    styles.quickActionsTrigger,
                    { width: TOOLS_TRIGGER_SIZE, height: TOOLS_TRIGGER_SIZE },
                    campLayerControlActive && styles.quickActionsTriggerActive,
                  ]}
                  onPress={toggleCampLayerMenu}
                  activeOpacity={0.85}
                  hitSlop={EDGE_CONTROL_HIT_SLOP}
                  accessibilityRole="button"
                  accessibilityLabel="Camp map layers"
                  accessibilityState={{ expanded: campLayerMenuOpen }}
                >
                  <Ionicons
                    name="bonfire-outline"
                    size={17}
                    color={campLayerControlActive ? '#091014' : TACTICAL.amber}
                  />
                </TouchableOpacity>
              </View>
            ) : null}

            <View style={styles.utilityPrimaryRow} pointerEvents="box-none">
              <TouchableOpacity
                style={[
                  styles.quickActionsTrigger,
                  { width: TOOLS_TRIGGER_SIZE, height: TOOLS_TRIGGER_SIZE },
                  toolsMenuOpen && styles.quickActionsTriggerActive,
                ]}
                onPress={toggleToolsPopup}
                activeOpacity={0.85}
                hitSlop={EDGE_CONTROL_HIT_SLOP}
              >
                <Ionicons
                  name={toolsMenuOpen ? 'close' : 'options-outline'}
                  size={16}
                  color={toolsMenuOpen ? '#091014' : TACTICAL.amber}
                />
              </TouchableOpacity>
            </View>
          </View>
        ) : null}

        {campsiteDrawControlsVisible ? (
          <View
            style={[
              styles.campsiteAreaControlStack,
              {
                bottom: routeBuilderControlBottomOffset,
                left: OVERLAY_EDGE,
                right: OVERLAY_EDGE,
              },
            ]}
            pointerEvents="box-none"
          >
            <View style={styles.campsiteAreaActionBar}>
              <TouchableOpacity
                style={[styles.routeBuilderStatusAction, styles.campsitePolygonActionButton]}
                onPress={clearCampsiteDrawing}
                activeOpacity={0.82}
                accessibilityRole="button"
                accessibilityLabel="Clear campsite drawing"
              >
                <Text style={[styles.routeBuilderStatusActionText, styles.campsitePolygonActionText]}>
                  CLEAR
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.routeBuilderStatusAction,
                  styles.campsitePolygonActionButton,
                  !campsiteDrawingCanUndo && styles.routeBuilderStatusActionDisabled,
                ]}
                onPress={undoCampsiteDrawingPoint}
                disabled={!campsiteDrawingCanUndo}
                activeOpacity={0.82}
                accessibilityRole="button"
                accessibilityLabel="Undo Camp Scout area point"
              >
                <Text
                  style={[
                    styles.routeBuilderStatusActionText,
                    styles.campsitePolygonActionText,
                    !campsiteDrawingCanUndo && styles.routeBuilderStatusActionTextDisabled,
                  ]}
                >
                  UNDO
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.routeBuilderStatusAction,
                  styles.campsitePolygonActionButton,
                  !campsiteDrawingCanFinish && styles.routeBuilderStatusActionDisabled,
                ]}
                onPress={finishCampsiteDrawing}
                disabled={!campsiteDrawingCanFinish}
                activeOpacity={0.82}
                accessibilityRole="button"
                accessibilityLabel="Finish campsite drawing"
              >
                <Text
                  style={[
                    styles.routeBuilderStatusActionText,
                    styles.campsitePolygonActionText,
                    !campsiteDrawingCanFinish && styles.routeBuilderStatusActionTextDisabled,
                  ]}
                >
                  FINISH
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.routeBuilderStatusAction,
                  styles.campsitePolygonActionButton,
                  !campsiteDrawingCanScan && styles.routeBuilderStatusActionDisabled,
                ]}
                onPress={scanCampsiteDrawing}
                disabled={!campsiteDrawingCanScan}
                activeOpacity={0.82}
                accessibilityRole="button"
                accessibilityLabel="Scan Camp Scout area"
              >
                <Text
                  style={[
                    styles.routeBuilderStatusActionText,
                    styles.campsitePolygonActionText,
                    !campsiteDrawingCanScan && styles.routeBuilderStatusActionTextDisabled,
                  ]}
                >
                  {campScoutAreaMode === 'scanning' ? 'SCAN...' : 'SCAN'}
                </Text>
              </TouchableOpacity>
            </View>
            {campsitePolygonLocateMessage ? (
              <Text
                style={[
                  styles.campsiteAreaStatusText,
                  { maxWidth: Math.min(460, adaptive.windowWidth - OVERLAY_EDGE * 2) },
                ]}
                numberOfLines={4}
              >
                {campsitePolygonLocateMessage}
              </Text>
            ) : null}
          </View>
        ) : null}

        {routeBuilderActive ? (
          <View
            style={[
              styles.routeBuilderStatusPill,
              {
                bottom: routeBuilderControlBottomOffset,
                left: OVERLAY_EDGE,
                maxWidth: Math.min(322, adaptive.windowWidth - OVERLAY_EDGE * 2),
              },
            ]}
            onLayout={(event) =>
              handleTopToolboxLayout('routeBuilder', event.nativeEvent.layout.height)
            }
            pointerEvents="box-none"
          >
            <View style={styles.routeBuilderStatusHeader}>
              <View style={styles.routeBuilderStatusTextWrap}>
                <Text style={styles.routeBuilderStatusTitle}>
                  {routeBuilderDrawing ? 'DRAWING ROUTE' : 'DRAW ROUTE'}
                </Text>
                <Text style={styles.routeBuilderStatusHint} numberOfLines={1}>
                  {routeBuilderSnapSource === 'snapping'
                    ? 'Snapping segment...'
                    : routeBuilderSnapStatus === 'raw_smoothed' || routeBuilderSnapStatus === 'ambiguous'
                      ? routeBuilderSnapMessage ?? 'Raw kept - undo and retry if needed'
                      : routeBuilderSnapStatus === 'too_short'
                        ? routeBuilderSnapMessage ?? 'Segment too short - draw longer'
                        : routeBuilderPointCount > 1
                    ? `${routeBuilderSavableSegments.length} seg${routeBuilderSavableSegments.length === 1 ? '' : 's'} - ${
                        routeBuilderSnapSource && routeBuilderSnapSource !== 'free'
                          ? 'snapped path'
                          : 'visible geometry'
                      }`
                    : routeDesignContext?.source === 'polygon'
                      ? 'Draw through campsite area. Polygon stays visible.'
                      : 'Trace a trail. Pinch zoom stays active.'}
                </Text>
              </View>
            </View>
            <View style={styles.routeBuilderStatusActions}>
              <TouchableOpacity
                style={[
                  styles.routeBuilderStatusAction,
                  !routeBuilderCanUndo && styles.routeBuilderStatusActionDisabled,
                ]}
                onPress={undoLastRouteBuilderSegment}
                disabled={!routeBuilderCanUndo}
                activeOpacity={0.82}
                accessibilityRole="button"
                accessibilityLabel="Undo last Build Route segment"
              >
                <Text
                  style={[
                    styles.routeBuilderStatusActionText,
                    !routeBuilderCanUndo && styles.routeBuilderStatusActionTextDisabled,
                  ]}
                >
                  UNDO
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.routeBuilderStatusAction}
                onPress={clearRouteBuilderDraft}
                activeOpacity={0.82}
                accessibilityRole="button"
                accessibilityLabel="Clear all Build Route segments"
              >
                <Text style={styles.routeBuilderStatusActionText}>CLEAR ALL</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.routeBuilderStatusAction,
                  !routeBuilderCanSave && styles.routeBuilderStatusActionDisabled,
                ]}
                onPress={() => {
                  void finishRouteBuilder();
                }}
                disabled={!routeBuilderCanSave}
                activeOpacity={0.82}
                accessibilityRole="button"
                accessibilityLabel="Save and preview Build Route"
              >
                <Text
                  style={[
                    styles.routeBuilderStatusActionText,
                    !routeBuilderCanSave && styles.routeBuilderStatusActionTextDisabled,
                  ]}
                >
                  PREVIEW
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.routeBuilderStatusAction, styles.routeBuilderStatusCancel]}
                onPress={cancelRouteBuilder}
                activeOpacity={0.82}
                accessibilityRole="button"
                accessibilityLabel="Cancel Build Route"
              >
                <Text style={styles.routeBuilderStatusCancelText}>EXIT</Text>
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
  mapSurfaceRevision,
  displayedRoutePoints,
  displayedRouteProgressPoints,
  displayedRouteWaypoints,
  activeHealth?.overall,
  displayedRouteColor,
  displayedRouteProgressColor,
  displayedRouteRenderMode,
  mapStyle,
  mapToken,
  safeUserLocation,
  followUser,
  mapCameraMode,
  mapSegmentFeatures,
  bailoutMarkers,
  filteredPinMarkers,
  showCrosshair,
  handleLongPress,
  handlePinTap,
  handleExploreRouteSegmentTap,
  handleCampIntelTap,
  handleCampScoutTap,
  handleDirectMapTapForPin,
  handleDispersedCampingRegionTap,
  handleEstablishedCampsiteTap,
  handleMapCenterReply,
  handleMapBoundsReply,
  requestBoundsTrigger,
  activeReadinessMinimized,
  displayedTrailSegments,
  trailStatus,
  navigateTrailAssessmentActive,
  pendingStartReviewReasons,
  replayMarkerPos,
  isReplayActive,
  replayPlaying,
  speedBucketSegments,
  trailStyle,
  handleTiltAlertTap,
  handleUserDrag,
  handleRoadClassification,
  handleRouteBuilderGestureStateChange,
  handleRouteBuilderUpdate,
  remotenessMapOverlay,
  dispersedCampingEligibilityLayer,
  dispersedCampingError,
  dispersedCampingRegions.length,
  establishedCampsitesLayer,
  campsiteDrawingPoints,
  campsiteDrawingClosed,
  campsiteDrawControlsVisible,
  campsitePolygonLocateMessage,
  clearCampsiteDrawing,
  finishCampsiteDrawing,
  scanCampsiteDrawing,
  undoCampsiteDrawingPoint,
  campScoutAreaMode,
  campsiteDrawingCanFinish,
  campsiteDrawingCanScan,
  campsiteDrawingCanUndo,
  compassDisplayHeading,
  mapLoading,
  handleMapRetry,
  combinedCampMarkers,
  sharedCampPinMapMarkers,
  mapTiltAlertMarkers,
  handleRoadOverlayToggleSteps,
  handleRoadOverlaySelectSuggestion,
  activeGuidanceLandscapeWidth,
  navigateLandscapeExpanded,
  handleRoadOverlayStartNavigation,
  handleRoadOverlayEndNavigation,
  handleRoadOverlayClearDestination,
  handleRoadOverlayReroute,
  handlePrepareOfflineFromRoadPreview,
  activeGuidanceMinimized,
  handleToggleActiveGuidanceMinimized,
  handleActiveGuidanceLayout,
  compassContainerStyle,
  campIntelVisible,
  campIntelComparisonVisible,
  selectedCampIntel,
  selectedCampIntelId,
  selectedCampIntelRank,
  selectedCampIntelSearchContext,
  selectedDroppedPin,
  handleDroppedPinEdit,
  handleDroppedPinDelete,
  handleDroppedPinClose,
  selectedCampScoutCandidate,
  selectedCampScoutCandidateId,
  selectedCampOpsEndpointId,
  selectedCampOpsIntel,
  campScoutNavigateSafe,
  handleCampScoutNavigateHere,
  handleCampScoutSaveCandidate,
  handleCampScoutReportNotViable,
  handleCampScoutDismiss,
  handleCampOpsNavigateHere,
  handleCampOpsSaveCandidate,
  handleCampOpsReportUnusable,
  handleCampOpsCompareNearby,
  handleCampOpsMarkUsed,
  handleCampOpsDismiss,
  selectedCommunityCampSite,
  selectedScopedCampsite,
  selectedScopedCampsiteReport,
  selectedGroupCampsiteGroup,
  selectedGroupCampsiteItem,
  selectedDispersedCampingRegionLive,
  selectedEstablishedCampsite,
  dispersedCampingCampScoutStatus,
  dispersedCampingCampScoutCandidates.length,
  communityCampSitePhotosById,
  adaptive.isExpanded,
  OVERLAY_EDGE,
  adaptive.windowWidth,
  campsiteDetailTopOffset,
  campLayerDetailBottomOffset,
  handleCampIntelNavigateHere,
  handleCampIntelSave,
  handleCampIntelCompareNearby,
  handleCampIntelMarkUsed,
  handleCampIntelReportUnusable,
  handleCampIntelDismiss,
  handleCommunityCampsiteNavigateHere,
  handleCommunityCampsiteSave,
  handleCommunityCampsiteConfirm,
  handleCommunityCampsiteFlag,
  handleCommunityCampsiteDismiss,
  handleScopedCampsiteDelete,
  handleScopedCampsiteDismiss,
  handleScopedCampsiteEdit,
  handleScopedCampsiteNavigateHere,
  handleScopedCampsiteOpenReview,
  handleScopedCampsiteShare,
  handleScopedCampsiteSubmitToCommunity,
  handleScopedCampsiteWithdraw,
  handleGroupCampsiteDismiss,
  handleGroupCampsiteOpenGroup,
  handleGroupCampsiteNavigateHere,
  handleGroupCampsiteRemoveShare,
  closeDispersedCampingRegionSheet,
  handleScoutSelectedDispersedCampingRegionPins,
  handleClearDispersedCampingCampScoutPins,
  closeEstablishedCampsiteSheet,
  handleEstablishedCampsiteNavigate,
  closeExploreRouteAnalysis,
  handleBuildRouteFromExploreOverlay,
  handleBuildTripFromExploreOverlay,
  handlePrepareOfflineFromExploreOverlay,
  navigateVehicleContext.activeVehicleId,
  selectedExploreRouteBuildUnavailableReason,
  selectedExploreRouteCompatResult,
  selectedExploreRouteOpportunity,
  selectedExploreRouteVehicleProfile,
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
  startDecisionVisible,
  currentExpeditionReadiness,
  pendingStartMode,
  executeStartExpeditionNow,
  explorePreviewMode,
  handleOpenCommandBriefFromNavigate,
  navigationPreviewContext,
  previewReadinessAccessory,
  activeReadinessAccessory,
  navigationActiveContext,
  trailNavigationActive,
  routeBuilderActive,
  routeBuilderDrawing,
  routeBuilderPointCount,
  routeBuilderSegments,
  routeBuilderSnapSource,
  routeBuilderSnapStatus,
  routeBuilderSnapMessage,
  routeBuilderSavableSegments.length,
  routeDesignContext,
  routeBuilderCanSave,
  routeBuilderCanUndo,
  finishRouteBuilder,
  undoLastRouteBuilderSegment,
  clearRouteBuilderDraft,
  cancelRouteBuilder,
  toolsMenuOpen,
  showRemotenessOverlay,
  remotenessOverlayAvailable,
  toggleRemotenessOverlay,
  campLayerMenuOpen,
  campLayerControlsAvailable,
  campLayerControlActive,
  campLayerFetchOnline,
  mapOverlayStartupReady,
  toggleToolsPopup,
  toggleCampLayerMenu,
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
  mapRouteIndicator,
  routeIndicatorVisible,
  routeIndicatorAnchoredToTopToolbox,
  routeIndicatorTopOffset,
  handleTopToolboxLayout,
  handleRecenter,
  handleRouteOverview,
  floatingToolsVisible,
  compassOverlayVisible,
  vehicleHeadingHook.accuracy,
  vehicleHeadingHook.needsRecalibration,
  vehicleHeadingHook.isStationaryLocked,
  vehicleHeadingHook.source,
  compassPowerSaveActive,
  roadNavigationSurfaceTopOffset,
  routeSurfaceBottomOffset,
  routeBuilderControlBottomOffset,
  mapToastAttachedToGuidance,
  mapToastBottomOffset,
  mapToastTopOffset,
  routeStepDrawerBottomOffset,
  TOOLS_TRIGGER_BOTTOM,
  TOOLS_TRIGGER_RIGHT,
  TOOLS_TRIGGER_SIZE,
  operationalWeather.refresh,
  operationalWeather.snapshot,
  pendingHybridTrailTransition,
  roadNavigation.setQuery,
  weatherLocation?.lat,
  weatherLocation?.lng,
  visibleMissionBrief,
  dispersedCampingEligibilityLayerAvailable,
  dispersedCampingEligibilityEnabled,
  dispersedCampingDiagnostic,
  dispersedCampingStatus,
  dispersedCampingZoomPrompt,
  toggleDispersedCampingEligibility,
  retryDispersedCampingEligibility,
  establishedCampsitesLayerAvailable,
  establishedCampsitesEnabled,
  establishedCampsitesZoomPrompt,
  establishedCampgroundsDiagnostic,
  establishedCampgrounds.length,
  establishedCampgroundsStatus,
  establishedCampgroundsError,
  toggleEstablishedCampsites,
  retryEstablishedCampgrounds,
]);
  const lastMissionBriefSignatureRef = useRef('');
  const lastMissionBriefErrorRef = useRef('');
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
  const operationalWeatherSnapshot = operationalWeather.snapshot;
  const operationalWeatherResultData = operationalWeather.result?.data ?? null;
  const missionBriefWeatherState = useMemo(
    () => ({
      current:
        operationalWeatherSnapshot.status.source === 'fallback'
          ? null
          : operationalWeatherSnapshot.raw,
      response:
        operationalWeatherSnapshot.status.source === 'fallback'
          ? null
          : operationalWeatherResultData,
      source:
        operationalWeatherSnapshot.status.source === 'live'
          ? 'live'
          : operationalWeatherSnapshot.status.source
            ? 'cache'
            : 'none',
      staleness:
        operationalWeatherSnapshot.status.kind === 'stale'
          ? 'stale'
          : operationalWeatherSnapshot.status.kind === 'offline'
            ? 'aging'
            : operationalWeatherSnapshot.status.kind === 'ready' || operationalWeatherSnapshot.status.kind === 'live'
              ? 'fresh'
              : operationalWeatherSnapshot.status.kind === 'cached'
                ? 'aging'
              : 'unknown',
      ageLabel:
        operationalWeatherSnapshot.status.ageMinutes != null
          ? `${operationalWeatherSnapshot.status.ageMinutes} min old`
          : null,
      severity:
        operationalWeatherSnapshot.alerts.some(alert => alert.severity === 'extreme')
          ? 'extreme'
          : operationalWeatherSnapshot.alerts.some(alert => alert.severity === 'warning')
            ? 'warning'
            : operationalWeatherSnapshot.alerts.length > 0
              ? 'advisory'
              : 'none',
      summaryLabel:
        operationalWeatherSnapshot.status.label ??
        operationalWeatherSnapshot.current.condition ??
        null,
    }),
    [
      operationalWeatherResultData,
      operationalWeatherSnapshot,
    ],
  );
  const missionBriefVehicle = navigateVehicleContext.vehicle as any;
  const missionBriefVehicleId = navigateVehicleContext.activeVehicleId;
  const missionBriefVehicleNickname = missionBriefVehicle?.nickname ?? null;
  const missionBriefVehicleName = missionBriefVehicle?.name ?? null;
  const missionBriefVehicleYear = missionBriefVehicle?.year ?? null;
  const missionBriefVehicleMake = missionBriefVehicle?.make ?? null;
  const missionBriefVehicleModel = missionBriefVehicle?.model ?? null;
  const missionBriefVehicleState = useMemo(() => ({
    id: missionBriefVehicleId,
    name: missionBriefVehicleNickname ?? missionBriefVehicleName,
    year: missionBriefVehicleYear,
    make: missionBriefVehicleMake,
    model: missionBriefVehicleModel,
  }), [
    missionBriefVehicleId,
    missionBriefVehicleNickname,
    missionBriefVehicleName,
    missionBriefVehicleYear,
    missionBriefVehicleMake,
    missionBriefVehicleModel,
  ]);
  const missionBriefContext = useMemo(
    () => buildNavigateMissionBriefLiveState({
      activeRun,
      routeIntelligence,
      terrainIntelligence,
      campIntelSummary: campIntel.summary,
      campDecision: campIntel.decision,
      gps: missionBriefGpsState,
      weather: missionBriefWeatherState,
      resourceForecast,
      vehicle: missionBriefVehicleState,
      navigation: {
        cameraMode,
        followUser,
        mapStyleMode: mapStyle,
        replayActive: isReplayActive,
        pinDropMode,
      },
    }),
    [
      activeRun,
      routeIntelligence,
      terrainIntelligence,
      campIntel.summary,
      campIntel.decision,
      missionBriefGpsState,
      missionBriefWeatherState,
      resourceForecast,
      missionBriefVehicleState,
      cameraMode,
      followUser,
      mapStyle,
      isReplayActive,
      pinDropMode,
    ],
  );
  const missionBriefContextRef = useRef(missionBriefContext);
  useEffect(() => {
    missionBriefContextRef.current = missionBriefContext;
  }, [missionBriefContext]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      let stage: 'context' | 'generate' | 'signature' = 'context';
      try {
        const ctx = await buildAIContextFromLiveState(missionBriefContextRef.current.liveState, {
          skipWeatherFetch: true,
          useStoreFallbacks: false,
        });
        if (cancelled || !mountedRef.current) return;
        stage = 'generate';
        const brief = generateMissionBrief(ctx);
        if (cancelled || !mountedRef.current) return;
        stage = 'signature';
        const nextSignature = [
          brief?.headline ?? '',
          brief?.summary ?? '',
          brief?.compactLabel ?? '',
          brief?.priorityMessage ?? '',
          ...(brief?.recommendations ?? []),
          ...(brief?.keyRisks ?? []),
        ].join('::');
        if (lastMissionBriefSignatureRef.current === nextSignature) return;
        lastMissionBriefSignatureRef.current = nextSignature;
        lastMissionBriefErrorRef.current = '';
        setMissionBrief(brief);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const errorKey = `${stage}:${message}`;
        if (lastMissionBriefErrorRef.current !== errorKey) {
          lastMissionBriefErrorRef.current = errorKey;
          console.warn(`[Navigate] Mission brief generation failed during ${stage}:`, err);
        }
        const fallback = buildNavigateMissionBriefFallback(message);
        const fallbackSignature = `fallback::${stage}::${fallback.operatorNote ?? fallback.summary}`;
        if (!cancelled && mountedRef.current && lastMissionBriefSignatureRef.current !== fallbackSignature) {
          lastMissionBriefSignatureRef.current = fallbackSignature;
          setMissionBrief(fallback);
        }
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [
    missionBriefContext.signature,
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
    const shouldFollow =
      typeof command.followUser === 'boolean'
        ? command.followUser
        : nextMode === 'north' || nextMode === 'heading';

    if (nextMode) {
      setCameraMode(nextMode);
    }

    if (shouldFollow) {
      setFollowUser(true);
      setUserHasManuallyMovedMap(false);
    } else if (nextMode === 'free' || command.mode === 'route_overview') {
      setFollowUser(false);
      setUserHasManuallyMovedMap(true);
    }

    if (command.target && Number.isFinite(command.target.lat) && Number.isFinite(command.target.lng)) {
      queueMapCameraCommand({
        mode: shouldFollow ? 'follow_user' : 'pin_focus',
        center: {
          latitude: command.target.lat,
          longitude: command.target.lng,
        },
        zoom: Number.isFinite(command.zoom) ? Number(command.zoom) : mapZoom,
        durationMs: 450,
        animate: true,
        reason: shouldFollow ? 'legacy_camera_command_follow' : 'legacy_camera_command_focus',
      }, { force: command.force });
      return;
    }

    if ((nextMode === 'north' || nextMode === 'heading') && userLocation) {
      enableFollowLock('legacy_camera_command_follow', {
        force: command.force,
        zoom: Number.isFinite(command.zoom) ? Number(command.zoom) : mapZoom,
      });
    }
  }, [enableFollowLock, mapZoom, queueMapCameraCommand, userLocation]);

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
    setAiAssistBanner(null);
    const title = replaceVisibleAIWithECS(rule.title);
    const message = replaceVisibleAIWithECS(rule.message);
    const severity = rule.priority <= 1 ? 'warning' : 'info';
    recordBriefCadEntry({
      id: `navigate-assist:${assist.eventKey}`,
      text: message,
      mode: severity === 'warning' ? 'alert' : 'advisory',
      priority: Number.isFinite(rule.priority) ? rule.priority : 4,
      queuedAt: now,
      title,
      recommendedAction: getAssistSurfaceActionLabel(rule.surface) ?? undefined,
      source: 'navigate-mission-brief',
      severity,
      eventType: `navigate_assist_${rule.surface}`,
    });

    if (rule.mode === 'auto_open' && !rule.requiresConfirmation) {
      executeAssistSurfaceAction(rule.surface, rule);
    }
  }, [executeAssistSurfaceAction, surfacedMissionBrief]);

  useEffect(() => {
    renderedAiAssistBannerRef.current = renderedAiAssistBanner;
  }, [renderedAiAssistBanner]);

  useEffect(() => {
    if (aiAssistBanner) {
      aiAssistBannerDismissingRef.current = false;
      setRenderedAiAssistBanner(aiAssistBanner);
      aiAssistBannerOpacity.stopAnimation();
      aiAssistBannerOpacity.setValue(0);
      Animated.timing(aiAssistBannerOpacity, {
        toValue: 1,
        duration: NAV_AI_ASSIST_FADE_IN_MS,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
      return undefined;
    }

    if (!renderedAiAssistBannerRef.current) return undefined;
    aiAssistBannerOpacity.stopAnimation();
    Animated.timing(aiAssistBannerOpacity, {
      toValue: 0,
      duration: NAV_AI_ASSIST_FADE_OUT_MS,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished && mountedRef.current) {
        setRenderedAiAssistBanner(null);
      }
    });

    return undefined;
  }, [aiAssistBanner, aiAssistBannerOpacity]);

  const dismissAiAssistBannerWithFade = useCallback(() => {
    if (!renderedAiAssistBannerRef.current || aiAssistBannerDismissingRef.current) return;
    aiAssistBannerDismissingRef.current = true;
    if (aiAssistBannerDismissTimerRef.current) {
      clearTimeout(aiAssistBannerDismissTimerRef.current);
      aiAssistBannerDismissTimerRef.current = null;
    }
    aiAssistBannerOpacity.stopAnimation();
    Animated.timing(aiAssistBannerOpacity, {
      toValue: 0,
      duration: NAV_AI_ASSIST_FADE_OUT_MS,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(() => {
      if (!mountedRef.current) return;
      setAiAssistBanner(null);
      setRenderedAiAssistBanner(null);
      aiAssistBannerDismissingRef.current = false;
    });
  }, [aiAssistBannerOpacity]);

  useEffect(() => {
    if (!aiAssistBanner || aiAssistBanner.rule?.requiresConfirmation) return;

    const timer = setTimeout(() => {
      dismissAiAssistBannerWithFade();
    }, Math.max(NAV_AI_ASSIST_VISIBLE_MS - NAV_AI_ASSIST_FADE_OUT_MS, 0));
    aiAssistBannerDismissTimerRef.current = timer;

    return () => {
      clearTimeout(timer);
      if (aiAssistBannerDismissTimerRef.current === timer) {
        aiAssistBannerDismissTimerRef.current = null;
      }
    };
  }, [aiAssistBanner, dismissAiAssistBannerWithFade]);

  const aiAssistBannerActionLabel = useMemo(
    () => renderedAiAssistBanner ? getAssistSurfaceActionLabel(renderedAiAssistBanner.surface) : null,
    [renderedAiAssistBanner],
  );

  const handleAiAssistBannerAction = useCallback(() => {
    if (!renderedAiAssistBanner || !aiAssistBannerActionLabel) return;
    executeAssistSurfaceAction(renderedAiAssistBanner.surface, renderedAiAssistBanner.rule);
    dismissAiAssistBannerWithFade();
  }, [
    aiAssistBannerActionLabel,
    dismissAiAssistBannerWithFade,
    executeAssistSurfaceAction,
    renderedAiAssistBanner,
  ]);

  const handleDismissAiAssistBanner = useCallback(() => {
    dismissAiAssistBannerWithFade();
  }, [dismissAiAssistBannerWithFade]);

  // -- Expand/collapse for true fullscreen -------------------
  const toggleMapExpanded = useCallback(() => {
    hapticMicro();
    setMapExpanded(prev => !prev);
  }, []);

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
  {/* HEADER */}
  {!effectiveMapExpanded && (
      <View onLayout={(e) => setHeaderHeight(e.nativeEvent.layout.height)}>
        <Header
          title="Navigation Control"
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

  {/* STORAGE WARNING BANNER */}
  {!effectiveMapExpanded && (
    <View onLayout={(e) => setStorageBannerHeight(e.nativeEvent.layout.height)}>
      <StorageWarningBanner
        report={cleanupReport}
        onCleanupComplete={handleCleanupComplete}
        onOpenOfflineCache={handleOpenOfflineCache}
        showToast={showToast}
      />
    </View>
  )}

                  {/* MAP CONTAINER (fills remaining space) */}
      <View style={effectiveMapExpanded ? styles.mapFullscreen : styles.mapContainer}>
        {navigateLandscapeExpanded ? (
          <TouchableOpacity
            style={[
              styles.navigateLandscapeDockRevealButton,
              { top: roadNavigationSurfaceTopOffset },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Show Navigate navigation dock"
            activeOpacity={0.82}
            onPress={handleRevealNavigateDock}
          >
            <Ionicons name="apps-outline" size={15} color={TACTICAL.amber} />
          </TouchableOpacity>
        ) : null}
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

        {mapOverlayStartupReady && offlineSyncCompletionNotice ? (
          <View
            pointerEvents="box-none"
            style={[
              styles.offlineSyncCompletionNotice,
              {
                top: MAP_TOP_CONTROL_ROW + 14,
                left: OVERLAY_EDGE,
                right: OVERLAY_EDGE,
              },
            ]}
          >
            <View style={styles.offlineSyncCompletionNoticeCard}>
              <Ionicons name="checkmark-circle" size={16} color="#66BB6A" />
              <View style={styles.offlineSyncCompletionNoticeCopy}>
                <Text style={styles.offlineSyncCompletionNoticeTitle}>
                  {offlineSyncCompletionNotice.title}
                </Text>
                <Text style={styles.offlineSyncCompletionNoticeMessage} numberOfLines={2}>
                  {offlineSyncCompletionNotice.message}
                </Text>
              </View>
              <TouchableOpacity
                style={styles.offlineSyncCompletionDismissButton}
                onPress={handleDismissOfflineSyncCompletionNotice}
                activeOpacity={0.78}
                hitSlop={CLOSE_CONTROL_HIT_SLOP}
                accessibilityRole="button"
                accessibilityLabel="Dismiss offline cache complete notice"
              >
                <Ionicons name="close" size={16} color={TACTICAL.textMuted} />
              </TouchableOpacity>
            </View>
          </View>
        ) : null}

        {/* ECS command brief updates now route through the top ECS Intelligence banner. */}

        {/* GPS Status Overlay - non-blocking, fades when fix acquired */}
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
            bottomOffset={gpsStatusOverlayBottomOffset}
            horizontalInset={OVERLAY_EDGE}
            maxWidth={gpsStatusOverlayMaxWidth}
          />
        )}

        {/* MapRenderer */}
{stableMapSurface}


{/* FLOATING MAP OVERLAYS */}
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

  {mapPlacementModeActive && isMapUIReady && (
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
      <Text style={styles.pinModeBannerText}>Pin Mode Active • Tap Map</Text>
    </Animated.View>
  )}

  {campOpsRouteLifecycleNotice && isMapUIReady && !mapPlacementModeActive ? (
    <Animated.View
      style={[
        styles.pinModeBanner,
        {
          bottom: pinModeBannerBottom,
          left: OVERLAY_EDGE,
          right: undefined,
          maxWidth: adaptive.isExpanded ? 320 : 260,
        },
      ]}
      pointerEvents="none"
    >
      <Ionicons
        name={campOpsRouteLifecycle.status === 'error' ? 'warning-outline' : 'map-outline'}
        size={14}
        color={TACTICAL.amber}
      />
      <Text style={styles.pinModeBannerText} numberOfLines={2}>
        {campOpsRouteLifecycleNotice}
      </Text>
    </Animated.View>
  ) : null}

  <EstablishedCampsitesRouteSummary
    visible={establishedCampsitesRouteSummaryVisible && isMapUIReady}
    results={establishedCampsitesRouteResults}
    dataAvailable={establishedCampgroundsStatus !== 'error'}
    corridorMiles={DEFAULT_ESTABLISHED_CAMPSITE_ROUTE_CORRIDOR_MILES}
    bottom={establishedCampsitesRouteSummaryBottom}
    left={OVERLAY_EDGE}
    onSelectCampsite={handleEstablishedCampsiteSummarySelect}
    onViewOnMap={handleEstablishedCampsiteViewOnMap}
  />

  <DispersedCampingRouteSummary
    visible={dispersedCampingRouteSummaryVisible && isMapUIReady}
    results={dispersedCampingRouteResults}
    dataAvailable={dispersedCampingStatus !== 'error'}
    corridorMiles={DEFAULT_DISPERSED_CAMPING_ROUTE_CORRIDOR_MILES}
    bottom={dispersedCampingRouteSummaryBottom}
    left={OVERLAY_EDGE}
    onScoutCandidatePins={handleScoutDispersedCampingCandidatePins}
    onClearScoutPins={handleClearDispersedCampingCampScoutPins}
    scoutDisabled={dispersedCampingRouteResults.length === 0}
    scoutStatusText={dispersedCampingCampScoutStatus}
    scoutPinsVisible={dispersedCampingCampScoutCandidates.length > 0}
  />

  {dispersedCampingCampScoutCandidates.length > 0 &&
  !dispersedCampingRouteSummaryVisible &&
  isMapUIReady ? (
    <TouchableOpacity
      style={[
        styles.clearScoutPinsFloatingButton,
        {
          bottom: dispersedCampingScoutPinsClearBottom,
          left: OVERLAY_EDGE,
        },
      ]}
      onPress={handleClearDispersedCampingCampScoutPins}
      activeOpacity={0.84}
      accessibilityRole="button"
      accessibilityLabel="Clear dispersed camping scout pins"
    >
      <Ionicons name="close-circle-outline" size={13} color="#F07D71" />
      <Text style={styles.clearScoutPinsFloatingText}>Clear scout pins</Text>
    </TouchableOpacity>
  ) : null}

  {remotenessLegendVisible && isMapUIReady ? (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.remotenessOverlayLegend,
        {
          left: OVERLAY_EDGE,
          top: remotenessLegendTopOffset,
          opacity: remotenessLegendOpacity,
        },
      ]}
    >
      <View style={styles.remotenessOverlayLegendHeader}>
        <Ionicons name="map-outline" size={12} color={TACTICAL.amber} />
        <Text style={styles.remotenessOverlayLegendTitle}>REMOTENESS CORRIDOR</Text>
      </View>
      <View style={styles.remotenessOverlayLegendScale}>
        {[
          { label: 'LOW', color: '#5FD1FF' },
          { label: 'MOD', color: '#65C97A' },
          { label: 'REMOTE', color: '#F2C24D' },
          { label: 'HIGH', color: '#C66A4A' },
        ].map((item) => (
          <View key={item.label} style={styles.remotenessOverlayLegendItem}>
            <View style={[styles.remotenessOverlayLegendSwatch, { backgroundColor: item.color }]} />
            <Text style={styles.remotenessOverlayLegendText}>{item.label}</Text>
          </View>
        ))}
      </View>
      {remotenessLegendDisclosure ? (
        <Animated.View
          style={[
            styles.remotenessOverlayLegendDisclosure,
            { opacity: remotenessLegendDisclosureOpacity },
          ]}
        >
          <Text style={styles.remotenessOverlayLegendDisclosureText}>
            {remotenessLegendDisclosure === 'on'
              ? 'ECS is shading the active route corridor by expected signal confidence and isolation. Use the wider bands to spot areas where offline prep and check-ins matter most.'
              : 'Remoteness corridor is turning off. Route shading and signal confidence bands are being removed from the map.'}
          </Text>
        </Animated.View>
      ) : null}
    </Animated.View>
  ) : null}

  {exploreRoutesEnabled && isMapUIReady ? (
    <TouchableOpacity
      style={[
        styles.exploreRoutesClearControl,
        {
          left: OVERLAY_EDGE,
          bottom: bottomLeftMapOverlayStackBottom,
        },
      ]}
      onPress={toggleExploreRoutesOverlay}
      activeOpacity={0.86}
      accessibilityRole="button"
      accessibilityLabel="Clear mapped Explorer trails"
    >
      <Ionicons name="close-circle-outline" size={13} color="#65D4FF" />
      <Text style={styles.exploreRoutesClearText}>CLEAR EXPLORE ROUTES</Text>
    </TouchableOpacity>
  ) : null}

  {dispersedCampingEligibilityLayer.enabled && isMapUIReady ? (
    <View
      pointerEvents="none"
      style={[
        styles.dispersedCampingLegend,
        {
          left: OVERLAY_EDGE,
          bottom: dispersedCampingLegendBottom,
        },
      ]}
    >
      <View style={styles.dispersedCampingLegendHeader}>
        <Ionicons name="leaf-outline" size={12} color={TACTICAL.amber} />
        <Text style={styles.dispersedCampingLegendTitle}>Dispersed Camping Eligibility</Text>
      </View>
      <View style={styles.dispersedCampingLegendRows}>
        {[
          { label: 'Likely eligible', color: '#A9B85F' },
          { label: 'Verify locally', color: '#F2C24D' },
          { label: 'Restricted / unavailable', color: '#C66A4A' },
        ].map((item) => (
          <View key={item.label} style={styles.dispersedCampingLegendItem}>
            <View style={[styles.dispersedCampingLegendSwatch, { backgroundColor: item.color }]} />
            <Text style={styles.dispersedCampingLegendText}>{item.label}</Text>
          </View>
        ))}
      </View>
    </View>
  ) : null}

  {renderMapPopup(
    toolsPopupVisible,
    'TOOLS',
    'options-outline',
    closeToolsPopup,
    <View style={styles.toolsPopupContent}>
      <View style={styles.toolsSearchWrap}>
        <View style={styles.toolsSearchHeader}>
          <View style={styles.toolsSearchTitleRow}>
            <Ionicons name="search-outline" size={14} color={TACTICAL.amber} />
            <Text style={styles.toolsSearchTitle}>SEARCH ADDRESS OR PLACE</Text>
          </View>
          <Text style={styles.toolsSearchHint} numberOfLines={1}>
            Build custom road navigation from a destination search.
          </Text>
        </View>
        <View style={styles.toolsSearchFieldShell}>
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
                  : 'Enter address, town, trailhead, or place'
            }
            disabled={searchOperationalState.disabled}
            loading={roadNavigation.searchLoading}
            onClear={
              roadNavigation.query.trim().length > 0
                ? () => roadNavigation.setQuery('')
                : undefined
            }
            style={styles.toolsSearchField}
            inputProps={{
              autoCapitalize: 'words',
              autoCorrect: false,
              returnKeyType: 'search',
              accessibilityLabel: 'Search address or place',
              accessibilityHint: 'Search for a destination to build a road navigation route.',
            }}
          />
        </View>
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
        <View style={styles.toolsResultsBlock}>
          <View style={styles.navigateWeatherToolHeader}>
            <View style={styles.navigateWeatherToolTitleRow}>
              <Ionicons name="partly-sunny-outline" size={14} color={TACTICAL.amber} />
            </View>
            <ECSBadge
              label={
                operationalWeather.snapshot.status.kind === 'live' ||
                operationalWeather.snapshot.status.kind === 'ready'
                  ? 'LIVE'
                  : operationalWeather.snapshot.status.kind === 'cached' ||
                      operationalWeather.snapshot.status.kind === 'stale'
                    ? 'LIMITED'
                    : 'UNAVAILABLE'
              }
              tone={
                operationalWeather.snapshot.status.kind === 'live' ||
                operationalWeather.snapshot.status.kind === 'ready'
                  ? 'live'
                  : operationalWeather.snapshot.status.kind === 'cached' ||
                      operationalWeather.snapshot.status.kind === 'stale'
                    ? 'warning'
                    : 'unavailable'
              }
              compact
            />
          </View>

          <View style={styles.navigateWeatherToolStack}>
            <View style={styles.navigateWeatherToolPanel}>
              <Text style={styles.navigateWeatherToolPanelTitle}>CURRENT LOCATION FORECAST</Text>
              <WeatherIntelPanel
                latitude={weatherLocation?.lat ?? null}
                longitude={weatherLocation?.lng ?? null}
                locationLabel="Current location"
                autoFetch
                compact
                units="imperial"
                weatherSnapshot={operationalWeather.snapshot}
                onRefreshWeather={operationalWeather.refresh}
                trailAssessmentActive={navigateTrailAssessmentActive}
                frameless
              />
            </View>

            {navigateRouteWeatherCoordinates.length > 0 ? (
              <View style={styles.navigateWeatherToolPanel}>
                <Text style={styles.navigateWeatherToolPanelTitle}>ROUTE WEATHER</Text>
                <WeatherIntelPanel
                  coordinates={navigateRouteWeatherCoordinates}
                  locationLabel="Route weather"
                  autoFetch
                  compact
                  units="imperial"
                  trailAssessmentActive={navigateTrailAssessmentActive}
                  frameless
                />
              </View>
            ) : null}

            {navigateSelectedWeatherCoordinate ? (
              <View style={styles.navigateWeatherToolPanel}>
                <Text style={styles.navigateWeatherToolPanelTitle}>SELECTED POINT FORECAST</Text>
                <WeatherIntelPanel
                  latitude={navigateSelectedWeatherCoordinate.lat}
                  longitude={navigateSelectedWeatherCoordinate.lng}
                  locationLabel={navigateSelectedWeatherCoordinate.label ?? 'Selected point'}
                  autoFetch
                  compact
                  units="imperial"
                  trailAssessmentActive={navigateTrailAssessmentActive}
                  frameless
                />
              </View>
            ) : null}
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
              RESULTS | {roadNavigation.suggestions.length}
            </Text>
            <View style={styles.toolsSuggestionList}>
              {roadNavigation.suggestions.map((suggestion) => (
                <TouchableOpacity
                  key={suggestion.id}
                  style={styles.toolsSuggestionItem}
                  onPress={() => handleRoadOverlaySelectSuggestion(suggestion)}
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

        {recentSearchesSectionVisible ? (
          <View style={styles.toolsResultsBlock}>
            <Text style={styles.quickActionsSectionTitle}>{recentSearchesTitle}</Text>
            {recentSearches.length > 0 ? (
              <View style={styles.toolsSuggestionList}>
                {recentSearches.map((suggestion) => (
                  <TouchableOpacity
                    key={`recent-${suggestion.id}`}
                    style={styles.toolsSuggestionItem}
                    onPress={() => handleRecentSearchSelection(suggestion)}
                    activeOpacity={0.82}
                  >
                    <View style={styles.toolsSuggestionIconWrap}>
                      <Ionicons name="time-outline" size={14} color={TACTICAL.amber} />
                    </View>
                    <View style={styles.toolsSuggestionTextWrap}>
                      <Text style={styles.toolsSuggestionTitle} numberOfLines={1}>
                        {suggestion.title}
                      </Text>
                      <Text style={styles.toolsSuggestionSubtitle} numberOfLines={2}>
                        {suggestion.subtitle ?? 'Saved destination'}
                      </Text>
                    </View>
                    <Ionicons name="navigate-outline" size={14} color={TACTICAL.textMuted} />
                  </TouchableOpacity>
                ))}
              </View>
            ) : (
              <ECSResultsEmptyState
                title="No recent searches"
                message={recentSearchesEmptyMessage}
                actionLabel="Search Live"
                onAction={() => roadNavigation.setQuery('')}
              />
            )}
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

        {communityCampsitesEnabled ? (
          <View style={styles.toolsResultsBlock}>
            <Text style={styles.quickActionsSectionTitle}>CAMPSITE LAYERS</Text>
            <View style={styles.quickActionsStyleRow}>
              {CAMPSITE_VISIBILITY_LAYER_TOGGLES.map((layer) => {
                const isActive = campsiteLayerVisibility[layer.key];
                return (
                  <TouchableOpacity
                    key={layer.key}
                    style={[
                      styles.quickActionsStyleButton,
                      isActive && styles.quickActionsStyleButtonActive,
                    ]}
                    onPress={() => handleCampsiteLayerToggle(layer.key)}
                    activeOpacity={0.85}
                  >
                    <Text
                      style={[
                        styles.quickActionsStyleText,
                        isActive && styles.quickActionsStyleTextActive,
                      ]}
                    >
                      {layer.key === 'community'
                        ? 'COMMUNITY'
                        : layer.key === 'private'
                          ? 'PRIVATE'
                          : layer.key === 'group'
                            ? 'GROUP'
                            : layer.key === 'pending'
                              ? 'PENDING'
                              : 'REVIEW'}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <Text style={styles.toolsSuggestionSubtitle}>
              ECS Community Campsites are approved public records. Pending review markers are not public.
            </Text>
            {campsiteLayerVisibility.group && groupCampsiteGroups.length > 1 ? (
              <View style={styles.quickActionsStyleRow}>
                {groupCampsiteGroups.map((item) => {
                  const isSelected = selectedGroupCampsiteGroupId === item.group.id;
                  return (
                    <TouchableOpacity
                      key={item.group.id}
                      style={[
                        styles.quickActionsStyleButton,
                        isSelected && styles.quickActionsStyleButtonActive,
                      ]}
                      onPress={() => {
                        hapticMicro();
                        groupCampsiteBoundsSignatureRef.current = null;
                        setSelectedGroupCampsiteGroupId(item.group.id);
                        setRequestBoundsTrigger((prev) => prev + 1);
                      }}
                      activeOpacity={0.85}
                    >
                      <Text
                        style={[
                          styles.quickActionsStyleText,
                          isSelected && styles.quickActionsStyleTextActive,
                        ]}
                        numberOfLines={1}
                      >
                        {item.group.name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            ) : null}
          </View>
        ) : null}

        <View style={styles.toolsResultsBlock}>
          <Text style={styles.quickActionsSectionTitle}>
            SAVED ROUTES - {savedRouteAssetCounts.all}
          </Text>
          <TouchableOpacity
            style={styles.savedRoutesCommandCard}
            onPress={() => {
              hapticCommand();
              openToolsChildPopup('savedRoutes');
            }}
            activeOpacity={0.86}
          >
            <View style={styles.savedRoutesCommandIcon}>
              <Ionicons name="albums-outline" size={17} color={TACTICAL.amber} />
            </View>
            <View style={styles.savedRoutesCommandTextWrap}>
              <Text style={styles.toolsSuggestionTitle} numberOfLines={1}>
                Route Command Center
              </Text>
              <Text style={styles.toolsSuggestionSubtitle} numberOfLines={2}>
                {`${savedRouteAssetCounts.imported} imported - ${savedRouteAssetCounts.custom} custom - ${savedRouteAssetCounts.stitched} stitched - ${savedRouteAssetCounts.bookmarked} saved`}
              </Text>
            </View>
            <View style={styles.customRouteBadge}>
              <Text style={styles.customRouteBadgeText}>OPEN</Text>
            </View>
          </TouchableOpacity>
        </View>

        <View style={styles.toolsResultsBlock}>
          <Text style={styles.quickActionsSectionTitle}>UTILITIES</Text>
          <View style={styles.toolsUtilityStack}>
            <View style={styles.toolsUtilitySection}>
              <Text style={styles.toolsUtilitySectionLabel}>ROUTE</Text>
              <View style={styles.quickActionsGrid}>
                <TouchableOpacity
                  style={styles.quickActionButton}
                  onPress={handleOpenBuildRoutePlan}
                  activeOpacity={0.85}
                  accessibilityRole="button"
                  accessibilityLabel="Build route plan in Trip Builder"
                >
                  <Ionicons
                    name="map-outline"
                    size={15}
                    color={TACTICAL.amber}
                  />
                  <Text style={styles.quickActionButtonText}>BUILD ROUTE PLAN</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.quickActionButton}
                  onPress={handleOpenStitch}
                  activeOpacity={0.85}
                >
                  <Ionicons
                    name="git-merge-outline"
                    size={15}
                    color={TACTICAL.amber}
                  />
                  <Text style={styles.quickActionButtonText}>STITCH ROUTES</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.quickActionButton,
                    routeBuilderActive && styles.quickActionButtonActive,
                  ]}
                  onPress={() => runToolsAction(handleRouteBuilderTriggerPress)}
                  activeOpacity={0.85}
                  accessibilityRole="button"
                  accessibilityLabel={routeBuilderActive ? 'Exit Draw Route mode' : 'Draw a route'}
                >
                  <Ionicons
                    name="git-branch-outline"
                    size={15}
                    color={routeBuilderActive ? '#091014' : TACTICAL.amber}
                  />
                  <Text
                    style={[
                      styles.quickActionButtonText,
                      routeBuilderActive && styles.quickActionButtonTextActive,
                    ]}
                  >
                    {routeBuilderActive ? 'EXIT DRAW' : 'DRAW ROUTE'}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.quickActionButton,
                    isImportPending && styles.quickActionButtonDisabled,
                  ]}
                  onPress={handleOpenImportRoute}
                  disabled={isImportPending}
                  activeOpacity={0.85}
                >
                  <Ionicons
                    name="cloud-upload-outline"
                    size={15}
                    color={isImportPending ? TACTICAL.textMuted : TACTICAL.amber}
                  />
                  <Text style={styles.quickActionButtonText}>
                    {isImportPending ? 'IMPORTING' : 'IMPORT'}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.quickActionButton,
                    recentSearchesVisible && styles.quickActionButtonActive,
                  ]}
                  onPress={toggleRecentSearches}
                  activeOpacity={0.85}
                >
                  <Ionicons
                    name="time-outline"
                    size={15}
                    color={recentSearchesVisible ? '#091014' : TACTICAL.amber}
                  />
                  <Text
                    style={[
                      styles.quickActionButtonText,
                      recentSearchesVisible && styles.quickActionButtonTextActive,
                    ]}
                  >
                    RECENT SEARCHES
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.toolsUtilitySection}>
              <Text style={styles.toolsUtilitySectionLabel}>EXPLORE</Text>
              <View style={styles.quickActionsGrid}>
                {communityCampsitesEnabled ? (
                  <TouchableOpacity
                    style={styles.quickActionButton}
                    onPress={openRecommendCampsiteChooser}
                    activeOpacity={0.85}
                  >
                    <Ionicons name="pin-outline" size={15} color={TACTICAL.amber} />
                    <Text style={styles.quickActionButtonText}>Recommend Campsite</Text>
                  </TouchableOpacity>
                ) : null}

                <TouchableOpacity
                  style={[
                    styles.quickActionButton,
                    campScoutAreaMode !== 'idle' && styles.quickActionButtonActive,
                  ]}
                  onPress={() => runToolsAction(handleOpenCampScoutIntro)}
                  activeOpacity={0.85}
                  accessibilityRole="button"
                  accessibilityLabel="Draw camp potential area"
                >
                  <Ionicons
                    name="shapes-outline"
                    size={15}
                    color={campScoutAreaMode !== 'idle' ? '#091014' : TACTICAL.amber}
                  />
                  <Text
                    style={[
                      styles.quickActionButtonText,
                      campScoutAreaMode !== 'idle' && styles.quickActionButtonTextActive,
                    ]}
                  >
                    DRAW CAMP POTENTIAL AREA
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.toolsUtilitySection}>
              <Text style={styles.toolsUtilitySectionLabel}>FIELD OPS</Text>
              <View style={styles.quickActionsGrid}>
                <TouchableOpacity
                  style={styles.quickActionButton}
                  onPress={() => {
                    hapticCommand();
                    openToolsChildPopup('trail');
                  }}
                  activeOpacity={0.85}
                >
                  <Ionicons name="trail-sign-outline" size={15} color={TACTICAL.amber} />
                  <Text style={styles.quickActionButtonText}>RECORD TRAIL</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.quickActionButton}
                  onPress={() => runToolsAction(handleSubmitActiveRouteAsTrailPack)}
                  activeOpacity={0.85}
                  accessibilityRole="button"
                  accessibilityLabel="Submit staged route as Trail Pack"
                >
                  <Ionicons name="trail-sign-outline" size={15} color={TACTICAL.amber} />
                  <Text style={styles.quickActionButtonText}>SUBMIT AS TRAIL PACK</Text>
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
                  onPress={() => {
                    hapticCommand();
                    setRequestBoundsTrigger((prev) => prev + 1);
                    openToolsChildPopup('offlineCache');
                  }}
                  activeOpacity={0.85}
                >
                  <Ionicons name="cloud-offline-outline" size={15} color={TACTICAL.amber} />
                  <Text style={styles.quickActionButtonText}>OFFLINE</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
          {exploreRoutesEnabled ? (
            <Text style={styles.toolsSuggestionSubtitle}>
              {exploreRoutesHandoff
                ? `${exploreRoutesHandoff.label}: ${exploreRouteOverlayBuild.segments.length} route line${exploreRouteOverlayBuild.segments.length === 1 ? '' : 's'} from Explorer filters${exploreRoutesHandoff.cappedCount > 0 ? `; ${exploreRoutesHandoff.cappedCount} held back for map performance` : ''}.`
                : exploreRouteOverlayBuild.segments.length > 0
                  ? `${exploreRouteOverlayBuild.segments.length} Explore route line${exploreRouteOverlayBuild.segments.length === 1 ? '' : 's'} loaded from Hidden Gems, Popular Trails, and ECS Route Ideas.`
                : exploreRouteOverlayBuild.candidateCount > 0
                  ? 'Explore Routes is on, but the available Explorer results do not include map geometry yet.'
                  : 'No Explore Routes are available for this area yet.'}
            </Text>
          ) : null}
        </View>
      </ScrollView>
    </View>,
    TOOLS_POPUP_WIDTH,
    { placement: 'center', backdropTint: 'transparent', fullBody: true }
  )}

  {renderMapPopup(
    campScoutIntroVisible,
    'CAMP SCOUT',
    'shapes-outline',
    closeToolsPopup,
    <ScrollView
      style={styles.mapPopupScroll}
      contentContainerStyle={styles.mapPopupScrollContent}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.mapPopupSimpleStack}>
        <View style={styles.stitchHeroCard}>
          <Text style={styles.stitchHeroEyebrow}>AREA SCAN</Text>
          <Text style={styles.stitchHeroTitle}>Find high-confidence remote camp candidates</Text>
          <Text style={styles.stitchHeroText}>
            Draw an area and ECS will return a small set of high-confidence camp candidates.
          </Text>
          <Text style={styles.stitchHeroText}>
            Results may include ECS-inferred, official mapped, and community-suggested locations.
          </Text>
          <Text style={styles.stitchHeroText}>
            Always verify local rules and posted restrictions.
          </Text>
        </View>

        <View style={styles.preflightSectionCard}>
          <Text style={styles.quickActionsSectionTitle}>{campScoutIntroStatusTitle}</Text>
          <Text style={styles.preflightMutedText}>{campScoutIntroStatusMessage}</Text>
        </View>

        {campScoutDebugDiagnosticsText ? (
          <View style={styles.preflightSectionCard}>
            <Text style={styles.quickActionsSectionTitle}>DEV DIAGNOSTICS</Text>
            <Text style={styles.preflightMutedText}>{campScoutDebugDiagnosticsText}</Text>
          </View>
        ) : null}

        <View style={styles.preflightSectionCard}>
          <Text style={styles.quickActionsSectionTitle}>FILTER</Text>
          <View style={styles.quickActionsStyleRow}>
            {CAMP_SCOUT_FILTER_MODE_OPTIONS.map((option) => {
              const active = campScoutFilterMode === option.key;
              return (
                <TouchableOpacity
                  key={option.key}
                  style={[
                    styles.quickActionsStyleButton,
                    active && styles.quickActionsStyleButtonActive,
                  ]}
                  onPress={() => {
                    hapticMicro();
                    setCampScoutFilterMode(option.key);
                  }}
                  activeOpacity={0.85}
                  accessibilityRole="button"
                  accessibilityLabel={`Camp Scout ${option.label.toLowerCase()} filter`}
                >
                  <Text
                    style={[
                      styles.quickActionsStyleText,
                      active && styles.quickActionsStyleTextActive,
                    ]}
                  >
                    {option.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <TouchableOpacity
            style={[
              styles.recommendCampsiteChoiceButton,
              campScoutFilterMode === 'official_only' && styles.quickActionButtonDisabled,
            ]}
            onPress={() => {
              hapticMicro();
              setCampScoutIncludeCommunity((current) => !current);
            }}
            disabled={campScoutFilterMode === 'official_only'}
            activeOpacity={0.86}
            accessibilityRole="switch"
            accessibilityState={{
              checked: campScoutFilterMode !== 'official_only' && campScoutIncludeCommunity,
              disabled: campScoutFilterMode === 'official_only',
            }}
            accessibilityLabel="Include Camp Scout community suggestions"
          >
            <Ionicons
              name={
                campScoutFilterMode !== 'official_only' && campScoutIncludeCommunity
                  ? 'checkbox-outline'
                  : 'square-outline'
              }
              size={17}
              color={campScoutFilterMode === 'official_only' ? TACTICAL.textMuted : TACTICAL.amber}
            />
            <View style={styles.savedRoutesCommandTextWrap}>
              <Text style={styles.toolsSuggestionTitle}>Include Community Suggestions</Text>
              <Text style={styles.toolsSuggestionSubtitle}>
                Community pins still need to pass Camp Scout confidence ranking.
              </Text>
            </View>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={styles.recommendCampsiteChoiceButton}
          onPress={startCampScoutDrawing}
          activeOpacity={0.86}
          accessibilityRole="button"
          accessibilityLabel="Draw Camp Scout area"
        >
          <Ionicons name="create-outline" size={17} color={TACTICAL.amber} />
          <View style={styles.savedRoutesCommandTextWrap}>
            <Text style={styles.toolsSuggestionTitle}>Draw Area</Text>
            <Text style={styles.toolsSuggestionSubtitle}>
              Tap points inside the map body, close the shape, then scan.
            </Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.recommendCampsiteChoiceButton}
          onPress={handleCampScoutUseCurrentMapView}
          activeOpacity={0.86}
          accessibilityRole="button"
          accessibilityLabel="Use current map view for Camp Scout scan"
        >
          <Ionicons name="scan-outline" size={17} color={TACTICAL.amber} />
          <View style={styles.savedRoutesCommandTextWrap}>
            <Text style={styles.toolsSuggestionTitle}>Use Current Map View</Text>
            <Text style={styles.toolsSuggestionSubtitle}>
              Scan the visible bounds only when they fit Camp Scout area limits.
            </Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={() => {
            hapticMicro();
            closeToolsPopup();
          }}
          activeOpacity={0.86}
          accessibilityRole="button"
          accessibilityLabel="Cancel Camp Scout"
        >
          <Text style={styles.secondaryButtonText}>CANCEL</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>,
    MAP_POPUP_WIDTH,
    { fullBody: true, showBackdrop: false }
  )}

  {renderMapPopup(
    recommendCampsiteModalVisible,
    'RECOMMEND CAMPSITE',
    'pin-outline',
    () => {
      setRecommendCampsiteDropMode(false);
      setRecommendCampsiteDropSource('pin_drop');
      setRecommendCampsiteGpxImport(null);
      setRecommendCampsiteGpxUploadMode(false);
      setRecommendCampsiteGpxMapSelection(null);
      setRecommendCampsiteImportError(null);
      closeTopPopup('recommendCampsite');
    },
    <ScrollView
      style={styles.mapPopupScroll}
      contentContainerStyle={styles.mapPopupScrollContent}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.mapPopupSimpleStack}>
        <View style={styles.stitchHeroCard}>
          <Text style={styles.stitchHeroEyebrow}>COMMUNITY CAMPSITES</Text>
          <Text style={styles.stitchHeroTitle}>Recommend Campsite</Text>
          <Text style={styles.stitchHeroText}>
            Add a campsite from your current location, a dropped pin, or an imported route.
          </Text>
        </View>

        {recommendCampsiteGpxImport ? (
          <RecommendCampsiteGpxImportReview
            imported={recommendCampsiteGpxImport}
            onBack={() => {
              setRecommendCampsiteGpxImport(null);
              setRecommendCampsiteGpxUploadMode(true);
              setRecommendCampsiteGpxMapSelection(null);
              setRecommendCampsiteImportError(null);
            }}
            onSelectRoutePoint={handleRecommendCampsiteDropRoutePoint}
            onSubmitted={({ visibility }) => {
              showToast(
                visibility === 'community'
                  ? 'Submitted for ECS review.'
                  : 'Campsite saved privately.',
              );
            }}
          />
        ) : recommendCampsiteGpxUploadMode ? (
          <View style={styles.mapPopupSimpleStack}>
            <View style={styles.preflightSectionCard}>
              <Text style={styles.quickActionsSectionTitle}>Import GPX</Text>
              <Text style={styles.preflightMutedText}>
                Imported GPX data stays private unless you choose specific campsite candidates to save or submit.
              </Text>
              <Text style={styles.preflightMutedText}>
                GPX imports may contain complete travel history. ECS keeps the import private unless you choose specific points to share.
              </Text>
            </View>

            {recommendCampsiteImportError ? (
              <View style={styles.preflightSectionCard}>
                <Text style={styles.quickActionsSectionTitle}>GPX IMPORT</Text>
                <Text style={styles.preflightMutedText}>{recommendCampsiteImportError}</Text>
              </View>
            ) : null}

            <TouchableOpacity
              style={[
                styles.recommendCampsiteChoiceButton,
                recommendCampsiteImporting && styles.quickActionButtonDisabled,
              ]}
              onPress={handleRecommendCampsiteChooseGpxFile}
              activeOpacity={0.86}
              disabled={recommendCampsiteImporting}
            >
              <Ionicons
                name="document-attach-outline"
                size={17}
                color={recommendCampsiteImporting ? TACTICAL.textMuted : TACTICAL.amber}
              />
              <View style={styles.savedRoutesCommandTextWrap}>
                <Text style={styles.toolsSuggestionTitle}>
                  {recommendCampsiteImporting ? 'Reading GPX file' : 'Choose GPX File'}
                </Text>
                <Text style={styles.toolsSuggestionSubtitle}>
                  File picker accepts .gpx. Route and track points are counted but not converted to campsites.
                </Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={() => {
                setRecommendCampsiteGpxUploadMode(false);
                setRecommendCampsiteGpxMapSelection(null);
                setRecommendCampsiteImportError(null);
              }}
              activeOpacity={0.86}
            >
              <Text style={styles.secondaryButtonText}>BACK TO SOURCE OPTIONS</Text>
            </TouchableOpacity>
          </View>
        ) : recommendCampsiteLocation ? (
          <RecommendCampsiteForm
            location={recommendCampsiteLocation}
            onAdjustPin={() => {
              setRecommendCampsiteLocation(null);
              setRecommendCampsiteGpxImport(null);
              setRecommendCampsiteGpxUploadMode(false);
              setRecommendCampsiteGpxMapSelection(null);
              setRecommendCampsiteImportError(null);
              setRecommendCampsiteDropMode(true);
              setRecommendCampsiteDropSource('pin_drop');
              setPinDropMode(false);
              setShowCrosshair(false);
              closeTopPopup();
              showToast('Adjust the campsite pin on the map.');
            }}
            onSubmitted={({ visibility }) => {
              showToast(
                visibility === 'community'
                  ? 'Submitted for ECS review.'
                  : 'Campsite saved privately.',
              );
            }}
          />
        ) : (
          <View style={styles.mapPopupSimpleStack}>
            {recommendCampsiteImportError ? (
              <View style={styles.preflightSectionCard}>
                <Text style={styles.quickActionsSectionTitle}>GPX IMPORT</Text>
                <Text style={styles.preflightMutedText}>{recommendCampsiteImportError}</Text>
              </View>
            ) : null}

            <TouchableOpacity
              style={styles.recommendCampsiteChoiceButton}
              onPress={handleRecommendCampsiteUseCurrentLocation}
              activeOpacity={0.86}
            >
              <Ionicons name="locate-outline" size={17} color={TACTICAL.amber} />
              <View style={styles.savedRoutesCommandTextWrap}>
                <Text style={styles.toolsSuggestionTitle}>Use My Current Location</Text>
                <Text style={styles.toolsSuggestionSubtitle}>
                  Use the active GPS fix and accuracy if ECS has one.
                </Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.recommendCampsiteChoiceButton}
              onPress={handleRecommendCampsiteDropPin}
              activeOpacity={0.86}
            >
              <Ionicons name="pin-outline" size={17} color={TACTICAL.amber} />
              <View style={styles.savedRoutesCommandTextWrap}>
                <Text style={styles.toolsSuggestionTitle}>Drop a Pin</Text>
                <Text style={styles.toolsSuggestionSubtitle}>
                  Close this sheet and tap the map to place the campsite.
                </Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.recommendCampsiteChoiceButton,
                (!gpxCampsiteImportEnabled || recommendCampsiteImporting) &&
                  styles.quickActionButtonDisabled,
              ]}
              onPress={handleRecommendCampsiteImportRoute}
              activeOpacity={0.86}
              disabled={!gpxCampsiteImportEnabled || recommendCampsiteImporting}
            >
              <Ionicons
                name="cloud-upload-outline"
                size={17}
                color={
                  !gpxCampsiteImportEnabled || recommendCampsiteImporting
                    ? TACTICAL.textMuted
                    : TACTICAL.amber
                }
              />
              <View style={styles.savedRoutesCommandTextWrap}>
                <Text style={styles.toolsSuggestionTitle}>Import GPX / Route</Text>
                <Text style={styles.toolsSuggestionSubtitle}>
                  {!gpxCampsiteImportEnabled
                    ? 'Coming soon.'
                    : recommendCampsiteImporting
                      ? 'Reading GPX waypoints...'
                      : 'Review waypoints before saving or submitting.'}
                </Text>
              </View>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </ScrollView>,
    MAP_POPUP_WIDTH,
    { fullBody: true }
  )}

  {renderMapPopup(
    importRouteModalVisible,
    'IMPORT ROUTE',
    'cloud-upload-outline',
    () => closeTopPopup('importRoute'),
    <ScrollView
      style={styles.mapPopupScroll}
      contentContainerStyle={styles.mapPopupScrollContent}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.mapPopupSimpleStack}>
        <View style={styles.stitchHeroCard}>
          <Text style={styles.stitchHeroEyebrow}>ROUTE IMPORT</Text>
          <Text style={styles.stitchHeroTitle}>Load a route file into Navigate</Text>
          <Text style={styles.stitchHeroText}>
            Import GPX, KML, GeoJSON, or JSON route files. ECS will parse the file, create a saved run, and stage it on the map when the route contains at least two valid coordinates.
          </Text>
        </View>

        <View style={styles.preflightSectionCard}>
          <Text style={styles.quickActionsSectionTitle}>SUPPORTED FILES</Text>
          <Text style={styles.preflightPrimaryLine}>GPX - KML - GeoJSON - JSON - XML</Text>
          <Text style={styles.preflightMutedText}>
            KMZ files must be extracted first. If Android does not show your file immediately, use the file picker filter set to all files and select the route file manually.
          </Text>
        </View>

        {importFeedback ? (
          <View
            style={[
              styles.preflightSectionCard,
              importFeedback.tone === 'success'
                ? { borderColor: 'rgba(101,240,212,0.24)', backgroundColor: 'rgba(101,240,212,0.06)' }
                : importFeedback.tone === 'error'
                  ? { borderColor: 'rgba(239,83,80,0.24)', backgroundColor: 'rgba(239,83,80,0.07)' }
                  : null,
            ]}
          >
            <Text style={styles.quickActionsSectionTitle}>IMPORT STATUS</Text>
            <Text style={styles.preflightPrimaryLine}>{importFeedback.title}</Text>
            {importFeedback.detail ? (
              <Text style={styles.preflightMutedText}>{importFeedback.detail}</Text>
            ) : null}
          </View>
        ) : null}

        <View style={styles.preflightActionRow}>
          <TouchableOpacity
            style={[
              styles.preflightPrimaryAction,
              isImportPending && styles.preflightActionDisabled,
            ]}
            onPress={() => {
              void handleImportGPX();
            }}
            disabled={isImportPending}
            activeOpacity={0.86}
          >
            <Ionicons name="cloud-upload-outline" size={15} color="#091014" />
            <Text style={styles.preflightPrimaryActionText}>
              {isImportPending ? 'IMPORTING...' : 'CHOOSE ROUTE FILE'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.preflightSecondaryAction}
            onPress={() => openToolsChildPopup('savedRoutes')}
            activeOpacity={0.86}
          >
            <Text style={styles.preflightSecondaryActionText}>VIEW SAVED ROUTES</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.preflightSecondaryAction}
            onPress={handleSubmitImportedRouteAsTrailPack}
            activeOpacity={0.86}
          >
            <Text style={styles.preflightSecondaryActionText}>CREATE TRAIL PACK FROM IMPORT</Text>
          </TouchableOpacity>
        </View>
      </View>
    </ScrollView>,
    MAP_POPUP_WIDTH,
    { fullBody: true, showBackdrop: false }
  )}

  {renderMapPopup(
    savedRoutesModalVisible,
    'SAVED ROUTES',
    'albums-outline',
    () => closeTopPopup('savedRoutes'),
    <ScrollView
      style={styles.mapPopupScroll}
      contentContainerStyle={styles.mapPopupScrollContent}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.mapPopupSimpleStack}>
        <View style={styles.savedRoutesHeroCard}>
          <View style={styles.savedRoutesHeroTitleRow}>
            <View>
              <Text style={styles.stitchHeroEyebrow}>ROUTE COMMAND CENTER</Text>
              <Text style={styles.stitchHeroTitle}>All route assets in one place</Text>
            </View>
            <View style={styles.savedRoutesTotalBadge}>
              <Text style={styles.savedRoutesTotalNumber}>{savedRouteAssetCounts.all}</Text>
              <Text style={styles.savedRoutesTotalLabel}>ASSETS</Text>
            </View>
          </View>
          <Text style={styles.stitchHeroText}>
            Review imported, custom-built, stitched, and bookmarked routes without hunting through separate route silos.
          </Text>
        </View>

        <View style={styles.stitchSection}>
          <Text style={styles.quickActionsSectionTitle}>SEARCH</Text>
          <TextInput
            value={savedRoutesQuery}
            onChangeText={setSavedRoutesQuery}
            placeholder="Search route assets"
            placeholderTextColor={TACTICAL.textMuted}
            style={styles.stitchNameInput}
          />
        </View>

        <View style={styles.stitchSection}>
          <Text style={styles.quickActionsSectionTitle}>FILTER</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.savedRoutesFilterRow}
          >
            {SAVED_ROUTE_FILTER_OPTIONS.map((option) => {
              const active = savedRoutesFilter === option.key;
              return (
                <TouchableOpacity
                  key={option.key}
                  style={[
                    styles.savedRoutesFilterButton,
                    active && styles.savedRoutesFilterButtonActive,
                  ]}
                  onPress={() => setSavedRoutesFilter(option.key)}
                  activeOpacity={0.84}
                >
                  <Text
                    style={[
                      styles.savedRoutesFilterText,
                      active && styles.savedRoutesFilterTextActive,
                    ]}
                  >
                    {option.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        <View style={styles.stitchSection}>
          <Text style={styles.quickActionsSectionTitle}>
            ROUTE ASSETS - {visibleSavedRouteAssets.length} - RECENT FIRST
          </Text>
          {visibleSavedRouteAssets.length > 0 ? (
            <View style={styles.savedRoutesList}>
              {visibleSavedRouteAssets.map((asset) => {
                const isRenaming = renamingSavedRouteAssetId === asset.id;
                return (
                  <View key={asset.id} style={styles.savedRouteAssetCard}>
                    <View style={styles.savedRouteAssetTopRow}>
                      <View style={styles.savedRouteAssetTextWrap}>
                        <View style={styles.savedRouteBadgeRow}>
                          <Text style={styles.savedRouteSourceBadge}>{asset.sourceLabel}</Text>
                          <Text style={styles.savedRouteTinyMeta}>{asset.badgeLabel}</Text>
                          {asset.duplicateCount > 1 ? (
                            <Text style={styles.savedRouteDuplicateBadge}>
                              VERSION {asset.duplicateIndex}/{asset.duplicateCount}
                            </Text>
                          ) : null}
                        </View>
                        {isRenaming ? (
                          <View style={styles.savedRouteRenameWrap}>
                            <TextInput
                              value={savedRouteRenameValue}
                              onChangeText={setSavedRouteRenameValue}
                              placeholder="Route name"
                              placeholderTextColor={TACTICAL.textMuted}
                              style={styles.savedRouteRenameInput}
                              autoFocus
                              selectTextOnFocus
                            />
                            <View style={styles.savedRouteRenameActions}>
                              <TouchableOpacity
                                style={styles.savedRouteRenameButton}
                                onPress={() => commitRenameSavedRouteAsset(asset)}
                                activeOpacity={0.84}
                              >
                                <Text style={styles.savedRouteRenameButtonText}>SAVE</Text>
                              </TouchableOpacity>
                              <TouchableOpacity
                                style={styles.savedRouteRenameButtonSecondary}
                                onPress={cancelRenameSavedRouteAsset}
                                activeOpacity={0.84}
                              >
                                <Text style={styles.savedRouteRenameButtonSecondaryText}>CANCEL</Text>
                              </TouchableOpacity>
                            </View>
                          </View>
                        ) : (
                          <>
                            <Text style={styles.savedRouteAssetTitle} numberOfLines={1}>
                              {asset.title}
                            </Text>
                            {asset.subtitle ? (
                              <Text style={styles.savedRouteAssetSubtitle} numberOfLines={2}>
                                {asset.subtitle}
                              </Text>
                            ) : null}
                          </>
                        )}
                      </View>
                    </View>
                    <Text style={styles.savedRouteAssetMeta} numberOfLines={2}>
                      {[
                        asset.distanceMiles != null ? `${asset.distanceMiles.toFixed(1)} mi` : null,
                        asset.segmentCount != null ? `${asset.segmentCount} segment${asset.segmentCount === 1 ? '' : 's'}` : null,
                        asset.pointCount != null ? `${asset.pointCount} pts` : null,
                      ].filter(Boolean).join(' - ') || 'Route reference ready'}
                    </Text>
                    <View style={styles.savedRouteAssetActions}>
                      <TouchableOpacity
                        style={[
                          styles.savedRouteAssetAction,
                          !asset.capabilities.canOpen && styles.savedRouteAssetActionDisabled,
                        ]}
                        onPress={() => handleOpenSavedRouteAsset(asset)}
                        disabled={!asset.capabilities.canOpen}
                        activeOpacity={0.84}
                      >
                        <Text style={styles.savedRouteAssetActionText}>OPEN</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[
                          styles.savedRouteAssetAction,
                          !asset.capabilities.canNavigate && styles.savedRouteAssetActionDisabled,
                        ]}
                        onPress={() => handleNavigateSavedRouteAsset(asset)}
                        disabled={!asset.capabilities.canNavigate}
                        activeOpacity={0.84}
                      >
                        <Text style={styles.savedRouteAssetActionText}>NAV</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.savedRouteAssetAction}
                        onPress={() => handleOpenPreflightPacket(asset)}
                        activeOpacity={0.84}
                      >
                        <Text style={styles.savedRouteAssetActionText}>PACKET</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[
                          styles.savedRouteAssetAction,
                          !asset.capabilities.canStitch && styles.savedRouteAssetActionDisabled,
                        ]}
                        onPress={() => handleStitchSavedRouteAsset(asset)}
                        disabled={!asset.capabilities.canStitch}
                        activeOpacity={0.84}
                      >
                        <Text style={styles.savedRouteAssetActionText}>STITCH</Text>
                      </TouchableOpacity>
                    </View>
                    <View style={styles.savedRouteManageRow}>
                      <TouchableOpacity
                        style={[
                          styles.savedRouteManageButton,
                          !asset.capabilities.canRename && styles.savedRouteManageButtonDisabled,
                        ]}
                        onPress={() => beginRenameSavedRouteAsset(asset)}
                        disabled={!asset.capabilities.canRename}
                        activeOpacity={0.84}
                      >
                        <Text style={styles.savedRouteManageButtonText}>RENAME</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[
                          styles.savedRouteManageButton,
                          styles.savedRouteManageButtonDanger,
                          !asset.capabilities.canRemove && styles.savedRouteManageButtonDisabled,
                        ]}
                        onPress={() => confirmRemoveSavedRouteAsset(asset)}
                        disabled={!asset.capabilities.canRemove}
                        activeOpacity={0.84}
                      >
                        <Text style={styles.savedRouteManageButtonDangerText}>
                          {asset.removeLabel.toUpperCase()}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })}
            </View>
          ) : (
            <ECSResultsEmptyState
              title={savedRoutesVisibleEmptyState.title}
              message={savedRoutesVisibleEmptyState.message}
              icon="albums-outline"
              variant="compact"
            />
          )}
        </View>
      </View>
    </ScrollView>,
    MAP_POPUP_WIDTH,
    { fullBody: true, showBackdrop: false }
  )}

  {renderMapPopup(
    preflightPacketModalVisible,
    'PREFLIGHT PACKET',
    'clipboard-outline',
    () => closeTopPopup('preflightPacket'),
    <ScrollView
      style={styles.mapPopupScroll}
      contentContainerStyle={styles.mapPopupScrollContent}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      {preflightPacket ? (
        <View style={styles.mapPopupSimpleStack}>
          <View style={styles.preflightHeroCard}>
            <Text style={styles.stitchHeroEyebrow}>EXPEDITION PREFLIGHT</Text>
            <Text style={styles.stitchHeroTitle}>{preflightPacket.route.title}</Text>
            <Text style={styles.stitchHeroText}>{preflightPacket.statusLabel}</Text>
            <View style={styles.savedRoutesCountRow}>
              <Text style={styles.savedRoutesCountText}>{preflightPacket.route.sourceLabel}</Text>
              <Text style={styles.savedRoutesCountText}>{preflightPacket.route.distanceLabel}</Text>
              <Text style={styles.savedRoutesCountText}>{preflightPacket.route.sequenceLabel}</Text>
            </View>
          </View>

          <View style={styles.preflightSectionCard}>
            <Text style={styles.quickActionsSectionTitle}>ROUTE PLAN</Text>
            <Text style={styles.preflightPrimaryLine}>{preflightPacket.route.primaryDetail}</Text>
          </View>

          <View style={styles.preflightSectionCard}>
            <Text style={styles.quickActionsSectionTitle}>KEY POINTS</Text>
            {preflightPacket.waypoints.trailhead ? (
              <View style={styles.preflightPointRow}>
                <Text style={styles.preflightPointLabel}>{preflightPacket.waypoints.trailhead.label}</Text>
                <Text style={styles.preflightPointDetail}>{preflightPacket.waypoints.trailhead.detail}</Text>
              </View>
            ) : null}
            {preflightPacket.waypoints.checkpoints.map((point) => (
              <View key={point.id} style={styles.preflightPointRow}>
                <Text style={styles.preflightPointLabel}>{point.label}</Text>
                <Text style={styles.preflightPointDetail}>{point.detail ?? 'Checkpoint staged'}</Text>
              </View>
            ))}
            {preflightPacket.waypoints.destination ? (
              <View style={styles.preflightPointRow}>
                <Text style={styles.preflightPointLabel}>{preflightPacket.waypoints.destination.label}</Text>
                <Text style={styles.preflightPointDetail}>{preflightPacket.waypoints.destination.detail}</Text>
              </View>
            ) : null}
            {!preflightPacket.waypoints.trailhead &&
            preflightPacket.waypoints.checkpoints.length === 0 &&
            !preflightPacket.waypoints.destination ? (
              <Text style={styles.preflightMutedText}>Waypoint details are not available for this route asset.</Text>
            ) : null}
          </View>

          <View style={styles.preflightSectionCard}>
            <Text style={styles.quickActionsSectionTitle}>WEATHER SNAPSHOT</Text>
            <Text style={styles.preflightPrimaryLine}>{preflightPacket.weather.headline}</Text>
            <Text style={styles.preflightMutedText}>{preflightPacket.weather.detail}</Text>
            {preflightPacket.weather.caution ? (
              <Text style={styles.preflightCautionText}>{preflightPacket.weather.caution}</Text>
            ) : null}
          </View>

          <View style={styles.preflightSectionCard}>
            <Text style={styles.quickActionsSectionTitle}>VEHICLE READINESS</Text>
            <Text style={styles.preflightPrimaryLine}>{preflightPacket.readiness.vehicleLabel}</Text>
            {preflightPacket.readiness.detailLines.map((line) => (
              <Text key={line} style={styles.preflightMutedText}>{line}</Text>
            ))}
          </View>

          <View style={styles.preflightSectionCard}>
            <Text style={styles.quickActionsSectionTitle}>ECS BRIEF</Text>
            <Text style={styles.preflightPrimaryLine}>{preflightPacket.advisory.headline}</Text>
            <Text style={styles.preflightMutedText}>{preflightPacket.advisory.summary}</Text>
            {preflightPacket.advisory.lines.map((line) => (
              <Text key={line} style={styles.preflightCautionText}>{line}</Text>
            ))}
          </View>

          {preflightLaunchConfirmVisible ? (
            <View style={styles.preflightConfirmCard}>
              <View style={styles.preflightConfirmHeaderRow}>
                <Text style={styles.quickActionsSectionTitle}>LAUNCH CONFIRMATION</Text>
                <Text style={[
                  styles.preflightConfirmStatus,
                  preflightLaunchPrerequisites.canLaunch
                    ? styles.preflightConfirmStatusReady
                    : styles.preflightConfirmStatusBlocked,
                ]}>
                  {preflightLaunchPrerequisites.canLaunch ? 'READY' : 'BLOCKED'}
                </Text>
              </View>
              <Text style={styles.preflightPrimaryLine}>{preflightPacket.route.title}</Text>
              <Text style={styles.preflightMutedText}>Vehicle: {preflightPacket.readiness.vehicleLabel}</Text>
              <Text style={styles.preflightMutedText}>Weather: {preflightPacket.weather.headline}</Text>
              {preflightLaunchPrerequisites.missing.map((line) => (
                <Text key={line} style={styles.preflightBlockedText}>{line}</Text>
              ))}
              {preflightLaunchPrerequisites.missing.length === 0 ? (
                <Text style={styles.preflightConfirmReadyText}>Route, vehicle, weather, and advisory context are staged for launch.</Text>
              ) : null}
              {preflightLaunchPrerequisites.warnings.slice(0, 3).map((line) => (
                <Text key={line} style={styles.preflightCautionText}>{line}</Text>
              ))}
              <View style={styles.preflightConfirmActions}>
                <TouchableOpacity
                  style={[
                    styles.preflightPrimaryAction,
                    !preflightLaunchPrerequisites.canLaunch && styles.preflightActionDisabled,
                  ]}
                  onPress={confirmPreflightLaunch}
                  activeOpacity={0.86}
                  disabled={!preflightLaunchPrerequisites.canLaunch}
                >
                  <Ionicons name="rocket-outline" size={15} color="#091014" />
                  <Text style={styles.preflightPrimaryActionText}>CONFIRM LAUNCH</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.preflightSecondaryAction}
                  onPress={() => setPreflightLaunchConfirmVisible(false)}
                  activeOpacity={0.86}
                >
                  <Text style={styles.preflightSecondaryActionText}>CANCEL</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : null}

          <View style={styles.preflightActionRow}>
            <TouchableOpacity
              style={styles.preflightPrimaryAction}
              onPress={beginPreflightLaunchConfirmation}
              activeOpacity={0.86}
              disabled={!preflightRouteAsset}
            >
              <Ionicons name="rocket-outline" size={15} color="#091014" />
              <Text style={styles.preflightPrimaryActionText}>LAUNCH EXPEDITION</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.preflightSecondaryAction}
              onPress={operationalWeather.refresh}
              activeOpacity={0.86}
            >
              <Text style={styles.preflightSecondaryActionText}>REFRESH SNAPSHOT</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <ECSResultsEmptyState
          title="No preflight packet"
          message="Open a saved route asset and choose Packet to assemble a departure briefing."
          icon="clipboard-outline"
          variant="compact"
        />
      )}
    </ScrollView>,
    MAP_POPUP_WIDTH,
    { fullBody: true, showBackdrop: false }
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
            Add imported, recorded, or custom-built routes in order. ECS keeps non-touching gaps as transition legs so you can move trail to road to trail without blocking the chain.
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
            CHAIN ORDER: {stitchedRuns.length}
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
                      {`${run.stats.distance_miles.toFixed(1)} mi - ${run.points.length} pts - ${run.source.toUpperCase()}`}
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
              message="Pick one or more saved routes below to build the expedition chain."
              helper="You can still open Stitch with a single route loaded and add more segments later."
              icon="git-merge-outline"
              variant="compact"
            />
          )}
        </View>

        <View style={styles.stitchSection}>
          <Text style={styles.quickActionsSectionTitle}>
            AVAILABLE ROUTES: {stitchSourceRuns.length}
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
                        {`${run.stats.distance_miles.toFixed(1)} mi - ${run.points.length} pts - ${run.source.toUpperCase()}`}
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
              message="Import a GPX, KML, GeoJSON route or save a custom route first, then return to Stitch."
              helper="Stitch works with imported routes, custom routes, and trail runs."
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
    </ScrollView>,
    MAP_POPUP_WIDTH,
    { fullBody: true, showBackdrop: false }
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
      onClearAllPins={handleClearAllPins}
      activePinTypeFilters={activePinTypeFilters}
      onPinTypeFilterToggle={handlePinTypeFilterToggle}
      onPinTypeFilterReset={handlePinTypeFilterReset}
    />
  </ScrollView>,
  MAP_POPUP_WIDTH,
  { fullBody: true, showBackdrop: false }
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
                {intelRouteContext.distanceLabel}
              </Text>
            </View>
            <View style={styles.intelMetricCard}>
              <Text style={styles.intelMetricLabel}>DRIVE</Text>
              <Text style={styles.intelMetricValue}>
                {intelRouteContext.durationLabel}
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
          <Text style={styles.intelSectionTitle}>Route Snapshot</Text>
          {intelHasRoute ? (
            <>
              <Text style={styles.intelPrimaryLine}>{intelRouteContext.routeName}</Text>
              <Text style={styles.intelSecondaryLine}>
                {intelRouteContext.sourceLabel} - {intelRouteContext.statusLabel}
              </Text>
              <Text style={styles.intelSecondaryLine}>
                {intelRouteContext.distanceLabel} - {intelRouteContext.durationLabel}
                {intelRouteContext.etaLabel !== '--' ? ` - ETA ${intelRouteContext.etaLabel}` : ''}
              </Text>
              <Text style={styles.intelSecondaryLine}>
                {intelRouteContext.waypointCount} waypoints - {intelRouteContext.pointCount} route points
                {routeIntelligence
                  ? ` - ${routeIntelligence.segmentCount} analyzed segments - ${routeIntelligence.overallDifficulty} terrain`
                  : ''}
              </Text>
              {intelRouteContext.destinationLabel ? (
                <Text style={styles.intelCalloutText}>
                  Destination: {intelRouteContext.destinationLabel}
                </Text>
              ) : null}
              {intelRouteContext.noteText ? (
                <Text style={styles.intelCalloutText}>{intelRouteContext.noteText}</Text>
              ) : null}
              {routeIntelligence ? (
                <Text style={styles.intelCalloutText}>
                  High point {Math.round(routeIntelligence.highestElevationFeet).toLocaleString()} ft
                </Text>
              ) : null}
            </>
          ) : (
            <Text style={styles.intelEmptyText}>
              Build or select a route first.
            </Text>
          )}
        </View>

        <View style={styles.intelSectionCard}>
          <Text style={styles.intelSectionTitle}>Staging / Pre-Departure</Text>
          {intelHasRoute ? (
            <>
              <Text style={styles.intelPrimaryLine}>
                {intelReadinessStack?.primaryConcern ?? 'Route prep is available.'}
              </Text>
              <Text style={styles.intelSecondaryLine}>
                {intelRouteContext.lifecycle === 'active'
                  ? 'Navigation is active; staging checks are tracking live route context.'
                  : 'Review vehicle fit, offline readiness, camp options, and route confidence before launch.'}
              </Text>
              {intelReadinessRows.slice(0, 4).map((row) => (
                <Text key={row.id} style={styles.intelCalloutText}>
                  {row.label}: {row.value}
                </Text>
              ))}
            </>
          ) : (
            <Text style={styles.intelEmptyText}>
              Build or select a route first.
            </Text>
          )}
        </View>

        {/*
        <View style={styles.intelSectionCard}>
          <Text style={styles.intelSectionTitle}>Route snapshot</Text>
          {routeIntelligence ? (
            <>
              <Text style={styles.intelPrimaryLine}>{routeIntelligence.routeName}</Text>
              <Text style={styles.intelSecondaryLine}>
                {routeIntelligence.segmentCount} segments | {routeIntelligence.overallDifficulty} terrain | high point{' '}
                {Math.round(routeIntelligence.highestElevationFeet).toLocaleString()} ft
              </Text>
            </>
          ) : (
            <Text style={styles.intelEmptyText}>
              Load a route or trail to unlock route analysis and expedition planning detail.
            </Text>
          )}
        </View>
        */}

        <View style={styles.intelSectionCard}>
          <Text style={styles.intelSectionTitle}>Resource Check</Text>
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
                {resourceForecast.drivers?.slice(0, 2).join(' | ') || 'Margins are based on the current route forecast and live system profile.'}
              </Text>
            </>
          ) : intelHasRoute ? (
            <Text style={styles.intelEmptyText}>
              Route context is available, but vehicle, loadout, or consumable data is not complete enough for a live resource forecast yet.
            </Text>
          ) : (
            <Text style={styles.intelEmptyText}>
              Build or select a route first.
            </Text>
          )}
        </View>

        <View style={styles.intelSectionCard}>
          <Text style={styles.intelSectionTitle}>Terrain Watch</Text>
          {terrainIntelligence ? (
            <>
              <Text style={styles.intelPrimaryLine}>
                {terrainIntelligence.overallRisk} terrain risk
              </Text>
              <Text style={styles.intelSecondaryLine}>
                {terrainIntelligence.steepSegments} steep segments | {terrainIntelligence.highElevationSegments} high-elevation segments
                {terrainIntelligence.mountainPassDetected ? ' | mountain pass detected' : ''}
              </Text>
              {terrainIntelligence.terrainWarnings[0] ? (
                <Text style={styles.intelCalloutText}>
                  {terrainIntelligence.terrainWarnings[0].message}
                </Text>
              ) : null}
            </>
          ) : intelHasRoute ? (
            <Text style={styles.intelEmptyText}>
              Route loaded. Terrain watch is waiting for elevation, trail condition, or segment risk data.
            </Text>
          ) : (
            <Text style={styles.intelEmptyText}>
              Build or select a route first.
            </Text>
          )}
        </View>

        <View style={styles.intelSectionCard}>
          <Text style={styles.intelSectionTitle}>Forecast</Text>
          {intelWeatherSummary ? (
            <>
              <Text style={styles.intelPrimaryLine}>{intelWeatherSummary.title}</Text>
              <Text style={styles.intelSecondaryLine}>{intelWeatherSummary.body}</Text>
              <Text style={styles.intelCalloutText}>{intelWeatherSummary.source}</Text>
            </>
          ) : intelHasRoute ? (
            <Text style={styles.intelEmptyText}>
              Weather is not available for this route yet. Refresh weather or check connectivity.
            </Text>
          ) : (
            <Text style={styles.intelEmptyText}>
              Build or select a route first.
            </Text>
          )}
          {routeHazardIntel ? (
            <>
              <View style={styles.intelSummaryPillRow}>
                <View
                  style={[
                    styles.intelSummaryPill,
                    {
                      borderColor: `${routeHazardIntel.color}44`,
                      backgroundColor: `${routeHazardIntel.color}18`,
                    },
                  ]}
                >
                  <Text style={[styles.intelSummaryPillText, { color: routeHazardIntel.color }]}>
                    {routeHazardIntel.headline}
                  </Text>
                </View>
                {routeHazardIntel.approachingLine ? (
                  <View
                    style={[
                      styles.intelSummaryPill,
                      {
                        borderColor: 'rgba(196,138,44,0.24)',
                        backgroundColor: 'rgba(196,138,44,0.12)',
                      },
                    ]}
                  >
                    <Text style={[styles.intelSummaryPillText, { color: TACTICAL.amber }]}>
                      {routeHazardIntel.approachingLine}
                    </Text>
                  </View>
                ) : null}
              </View>
              {routeHazardIntel.detailLines.map((line) => (
                <Text key={line} style={styles.intelCalloutText}>
                  {line}
                </Text>
              ))}
            </>
          ) : null}
        </View>

        <View style={styles.intelSectionCard}>
          <Text style={styles.intelSectionTitle}>Camp</Text>
          {primaryCampSuggestion ? (
            <>
              <Text style={styles.intelPrimaryLine}>
                {campIntel.decision.headline ?? campIntel.summary.headline ?? `${primaryCampSuggestion.categoryLabel} ready at ${primaryCampSuggestion.segmentLabel ?? primaryCampSuggestion.label}`}
              </Text>
              <Text style={styles.intelSecondaryLine}>
                {campIntel.decision.summaryLine ?? campIntel.summary.routeGuidance[0] ?? `${primaryCampSuggestion.quickVerdict} - ${primaryCampSuggestion.confidenceLabel}`}
              </Text>
              <Text style={styles.intelCalloutText}>
                {campIntelSites.length} route campsite option{campIntelSites.length === 1 ? '' : 's'} available.
              </Text>
            </>
          ) : expeditionForecast ? (
            <>
              <Text style={styles.intelPrimaryLine}>{expeditionForecast.status} expedition outlook</Text>
              <Text style={styles.intelSecondaryLine}>{expeditionForecast.brief}</Text>
            </>
          ) : intelHasRoute ? (
            <Text style={styles.intelEmptyText}>
              Route loaded. No route campsite suggestions are currently available for this route context.
            </Text>
          ) : (
            <Text style={styles.intelEmptyText}>
              Build or select a route first.
            </Text>
          )}
        </View>

        {/*
        <View style={styles.intelSectionCard}>
          <Text style={styles.intelSectionTitle}>Camp + forecast</Text>
          {primaryCampSuggestion ? (
            <>
              <Text style={styles.intelPrimaryLine}>
                {campIntel.decision.headline ?? campIntel.summary.headline ?? `${primaryCampSuggestion.categoryLabel} ready at ${primaryCampSuggestion.segmentLabel ?? primaryCampSuggestion.label}`}
              </Text>
              <Text style={styles.intelSecondaryLine}>
                {campIntel.decision.summaryLine ?? campIntel.summary.routeGuidance[0] ?? `${primaryCampSuggestion.quickVerdict} | ${primaryCampSuggestion.confidenceLabel}`}
              </Text>
            </>
          ) : expeditionForecast ? (
            <>
              <Text style={styles.intelPrimaryLine}>{expeditionForecast.status} expedition outlook</Text>
              <Text style={styles.intelSecondaryLine}>{expeditionForecast.brief}</Text>
            </>
          ) : routeHazardIntel ? (
            <>
              <Text style={styles.intelPrimaryLine}>{routeHazardIntel.headline}</Text>
              <Text style={styles.intelSecondaryLine}>{routeHazardIntel.summaryLine}</Text>
            </>
          ) : (
            <Text style={styles.intelEmptyText}>
              Campsite and expedition outlooks appear here once the active route has enough planning context.
            </Text>
          )}
          {routeHazardIntel ? (
            <>
              <View style={styles.intelSummaryPillRow}>
                <View
                  style={[
                    styles.intelSummaryPill,
                    {
                      borderColor: `${routeHazardIntel.color}44`,
                      backgroundColor: `${routeHazardIntel.color}18`,
                    },
                  ]}
                >
                  <Text style={[styles.intelSummaryPillText, { color: routeHazardIntel.color }]}>
                    {routeHazardIntel.headline}
                  </Text>
                </View>
                {routeHazardIntel.approachingLine ? (
                  <View
                    style={[
                      styles.intelSummaryPill,
                      {
                        borderColor: 'rgba(196,138,44,0.24)',
                        backgroundColor: 'rgba(196,138,44,0.12)',
                      },
                    ]}
                  >
                    <Text style={[styles.intelSummaryPillText, { color: TACTICAL.amber }]}>
                      {routeHazardIntel.approachingLine}
                    </Text>
                  </View>
                ) : null}
              </View>
              {routeHazardIntel.detailLines.map((line) => (
                <Text key={line} style={styles.intelCalloutText}>
                  {line}
                </Text>
              ))}
            </>
          ) : null}
        </View>
        */}
      </View>
    </ScrollView>,
    MAP_POPUP_WIDTH,
    { fullBody: true, showBackdrop: false }
  )}

  {renderMapPopup(
    trailModalVisible,
    trailStatus === 'idle' ? 'RECORD TRAIL' : 'TRAIL STATUS',
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
          onRecommendTrailPack={handleRecommendCompletedTrailAsTrailPack}
          showToast={showToast}
        />
    </ScrollView>,
    MAP_POPUP_WIDTH,
    { fullBody: true, showBackdrop: false }
  )}

  {renderMapPopup(
    trailExportVisible,
    'EXPORT TRAIL',
    'document-text-outline',
    () => setTrailExportVisible(false),
    <View style={styles.mapPopupSimpleStack}>
      <View style={styles.preflightSectionCard}>
        <Text style={styles.quickActionsSectionTitle}>TRAIL EXPORT</Text>
        <Text style={styles.preflightMutedText}>
          Export the recorded trail path, points, stops, campsites, waypoints, and useful navigation detail.
        </Text>
      </View>
      <View style={styles.quickActionsGrid}>
        {[
          { format: 'gpx' as const, label: 'GPX', icon: 'map-outline' as const },
          { format: 'json' as const, label: 'JSON', icon: 'code-slash-outline' as const },
          { format: 'coords' as const, label: 'COORDS', icon: 'locate-outline' as const },
          { format: 'pdf' as const, label: 'PDF PACKET', icon: 'document-text-outline' as const },
        ].map((item) => (
          <TouchableOpacity
            key={item.format}
            style={styles.quickActionButton}
            onPress={() => handleTrailExportAction(item.format)}
            activeOpacity={0.85}
          >
            <Ionicons name={item.icon} size={15} color={TACTICAL.amber} />
            <Text style={styles.quickActionButtonText}>{item.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>,
    MAP_POPUP_WIDTH,
    { fullBody: false, showBackdrop: false }
  )}

  {renderMapPopup(
  offlineCacheModalVisible,
  'OFFLINE CACHE',
  'cloud-download-outline',
  () => closeTopPopup('offlineCache'),
  <View style={styles.mapPopupStaticContent}>
    <OfflineCacheModal
      embedded
      mapBounds={mapBounds}
      mapZoom={mapZoom}
      mapStyle={mapStyle}
      showToast={showToast}
      onRequestMapBounds={handleRequestMapBounds}
      onOpenDownloadedSync={handleOpenDownloadedSync}
    />
  </View>,
  MAP_POPUP_WIDTH,
  { fullBody: true, showBackdrop: false }
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
  </ScrollView>,
  MAP_POPUP_WIDTH,
  { fullBody: true, showBackdrop: false }
)}
</View>

{/* PIN DETAILS POPUP */}
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
  </ScrollView>,
  MAP_POPUP_WIDTH,
  { fullBody: true, showBackdrop: false }
)}

{/* TILT ALERT DETAIL MODAL */}
</View>
<TrailPackSubmissionModal
  visible={!!trailPackSubmissionRoute}
  routeInput={trailPackSubmissionRoute}
  currentLocation={
    userLocation
      ? { latitude: userLocation.lat, longitude: userLocation.lng }
      : gps.position
        ? { latitude: gps.position.latitude, longitude: gps.position.longitude }
        : null
  }
  onClose={() => setTrailPackSubmissionRoute(null)}
  onSubmitted={handleTrailPackSubmitted}
/>
<TiltAlertDetailModal
  visible={tiltAlertDetailVisible}
  onClose={closeTiltAlertDetail}
  event={tiltAlertDetailEvent}
  cluster={tiltAlertDetailCluster}
/>

{/* WEATHER ALERT DETAIL MODAL */}
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

{/* ROUTE CORRIDOR WEATHER DETAIL MODAL */}
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
  container: { flex: 1, backgroundColor: 'transparent' },

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

mapFloatingControlsLayerPersistent: {
  zIndex: NAV_OVERLAY_Z.modal - 4,
  elevation: NAV_OVERLAY_Z.modal - 4,
},

mapModalLayer: {
  ...StyleSheet.absoluteFillObject,
  zIndex: NAV_OVERLAY_Z.modal,
  elevation: NAV_OVERLAY_Z.modal,
  pointerEvents: 'box-none',
},

  // -- Map Container (fills remaining space) -----------------
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
  navigateLandscapeDockRevealButton: {
  position: 'absolute',
  top: 8,
  right: 8,
  zIndex: NAV_OVERLAY_Z.modal + 2,
  elevation: NAV_OVERLAY_Z.modal + 2,
  width: 32,
  height: 32,
  borderRadius: 11,
  alignItems: 'center',
  justifyContent: 'center',
  borderWidth: 1,
  borderColor: 'rgba(196,138,44,0.30)',
  backgroundColor: 'rgba(8,12,15,0.86)',
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 6 },
  shadowOpacity: 0.28,
  shadowRadius: 12,
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
  offlineSyncCompletionNotice: {
    position: 'absolute',
    zIndex: NAV_OVERLAY_Z.topStatus,
    elevation: NAV_OVERLAY_Z.topStatus,
    alignItems: 'center',
  },
  offlineSyncCompletionNoticeCard: {
    width: '100%',
    maxWidth: 420,
    minHeight: 54,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(102,187,106,0.30)',
    backgroundColor: 'rgba(7,13,11,0.94)',
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.28,
    shadowRadius: 12,
    elevation: 12,
  },
  offlineSyncCompletionNoticeCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  offlineSyncCompletionNoticeTitle: {
    ...TYPO.U2,
    color: '#66BB6A',
    fontSize: 9,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  offlineSyncCompletionNoticeMessage: {
    ...TYPO.B2,
    color: TACTICAL.text,
    fontSize: 11,
    lineHeight: 15,
  },
  offlineSyncCompletionDismissButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.035)',
  },
  // -- Floating Map Overlays ---------------------------------
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

campLayerMenuPanel: {
  width: 292,
  maxWidth: SCREEN_W - 28,
  borderRadius: 14,
  borderWidth: 1,
  borderColor: 'rgba(196,138,44,0.28)',
  backgroundColor: 'rgba(8,12,15,0.96)',
  paddingHorizontal: 10,
  paddingVertical: 10,
  gap: 8,
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 8 },
  shadowOpacity: 0.34,
  shadowRadius: 16,
  elevation: 14,
},

campLayerMenuHeader: {
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 10,
},

campLayerMenuTitleRow: {
  flexDirection: 'row',
  alignItems: 'center',
  gap: 7,
  minWidth: 0,
},

campLayerMenuTitle: {
  ...TYPO.U2,
  color: TACTICAL.amber,
  fontSize: 9,
  letterSpacing: 1.2,
},

campLayerMenuCloseButton: {
  width: 28,
  height: 28,
  borderRadius: 14,
  alignItems: 'center',
  justifyContent: 'center',
  borderWidth: 1,
  borderColor: 'rgba(255,255,255,0.08)',
  backgroundColor: 'rgba(255,255,255,0.035)',
},

campLayerMenuToggle: {
  minHeight: 78,
  paddingHorizontal: 10,
  paddingVertical: 9,
},

campLayerMenuNotes: {
  borderTopWidth: 1,
  borderTopColor: 'rgba(196,138,44,0.14)',
  paddingTop: 8,
  gap: 6,
},

campLayerStatusBlock: {
  gap: 5,
},

campLayerErrorActions: {
  flexDirection: 'row',
  alignItems: 'center',
  flexWrap: 'wrap',
  gap: 7,
},

campLayerRetryButton: {
  minHeight: 26,
  borderRadius: 8,
  borderWidth: 1,
  borderColor: 'rgba(101,240,212,0.30)',
  backgroundColor: 'rgba(101,240,212,0.10)',
  alignItems: 'center',
  justifyContent: 'center',
  paddingHorizontal: 10,
},

campLayerRetryButtonText: {
  ...TYPO.U2,
  color: '#65F0D4',
  fontSize: 7.5,
  letterSpacing: 0.9,
},

campLayerDiagnosticText: {
  ...TYPO.B2,
  color: TACTICAL.textMuted,
  fontSize: 8,
  lineHeight: 11,
  flexShrink: 1,
  maxWidth: 210,
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
  minHeight: 0,
  paddingHorizontal: 0,
  paddingVertical: 0,
  borderRadius: 14,
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 0,
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

quickActionsTriggerDisabled: {
  opacity: 0.45,
},

routeBuilderTrigger: {
  borderColor: 'rgba(101,240,212,0.42)',
  backgroundColor: 'rgba(8,18,20,0.94)',
},

campsiteDrawTrigger: {
  borderColor: 'rgba(242,194,77,0.48)',
  backgroundColor: 'rgba(18,14,8,0.94)',
},

campsiteDrawTriggerText: {
  color: TACTICAL.amber,
  fontSize: 8,
  fontWeight: '900',
  letterSpacing: 0.85,
},

routeBuilderTriggerText: {
  color: TACTICAL.amber,
  fontSize: 8,
  fontWeight: '900',
  letterSpacing: 0.85,
},

routeBuilderStatusPill: {
  position: 'absolute',
  minHeight: 70,
  borderRadius: 14,
  borderWidth: 1,
  borderColor: 'rgba(101,240,212,0.36)',
  backgroundColor: 'rgba(8,14,18,0.94)',
  gap: 7,
  paddingHorizontal: 10,
  paddingVertical: 7,
  zIndex: NAV_OVERLAY_Z.contextual,
  elevation: NAV_OVERLAY_Z.contextual,
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.32,
  shadowRadius: 10,
},

exploreRoutesClearControl: {
  position: 'absolute',
  minHeight: 30,
  maxWidth: 220,
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 6,
  paddingHorizontal: 10,
  paddingVertical: 7,
  borderRadius: 999,
  borderWidth: 1,
  borderColor: 'rgba(101,212,255,0.38)',
  backgroundColor: 'rgba(7,12,16,0.88)',
  zIndex: NAV_OVERLAY_Z.contextual,
  elevation: NAV_OVERLAY_Z.contextual,
  shadowColor: '#65D4FF',
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.18,
  shadowRadius: 9,
},

exploreRoutesClearText: {
  color: '#65D4FF',
  fontSize: 8,
  fontWeight: '900',
  letterSpacing: 0.75,
},

exploreRouteModalFooterBtn: {
  minWidth: 72,
  minHeight: 44,
  borderRadius: 8,
  borderWidth: 1,
  borderColor: 'rgba(196,138,44,0.32)',
  backgroundColor: 'rgba(196,138,44,0.10)',
  paddingHorizontal: 10,
  paddingVertical: 7,
  alignItems: 'center',
  justifyContent: 'center',
  flexDirection: 'row',
  gap: 6,
},

exploreRouteModalFooterText: {
  ...TYPO.U2,
  color: TACTICAL.text,
  fontSize: 8,
  lineHeight: 10,
  letterSpacing: 0.7,
  textAlign: 'center',
},

campsiteAreaControlStack: {
  position: 'absolute',
  zIndex: NAV_OVERLAY_Z.contextual,
  elevation: NAV_OVERLAY_Z.contextual,
  gap: 6,
  alignItems: 'center',
},

polygonCampControlStack: {
  position: 'absolute',
  zIndex: NAV_OVERLAY_Z.contextual,
  elevation: NAV_OVERLAY_Z.contextual,
  gap: 6,
  alignItems: 'stretch',
},

campsiteAreaActionBar: {
  alignSelf: 'center',
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'center',
  flexWrap: 'nowrap',
  flexShrink: 0,
  gap: 6,
  borderRadius: 12,
  borderWidth: 1,
  borderColor: 'rgba(242,194,77,0.22)',
  backgroundColor: 'rgba(18,14,8,0.80)',
  paddingHorizontal: 7,
  paddingVertical: 7,
},

campsiteAreaStatusText: {
  maxWidth: 300,
  paddingHorizontal: 10,
  paddingVertical: 6,
  borderRadius: 10,
  borderWidth: 1,
  borderColor: 'rgba(242,194,77,0.18)',
  backgroundColor: 'rgba(8,14,18,0.80)',
  color: TACTICAL.textMuted,
  fontSize: 9,
  lineHeight: 13,
  textAlign: 'center',
  fontWeight: '700',
},

routeBuilderStatusHeader: {
  flexDirection: 'row',
  alignItems: 'center',
},

routeBuilderStatusTextWrap: {
  flex: 1,
  minWidth: 0,
},

routeBuilderStatusTitle: {
  color: '#65F0D4',
  fontSize: 8,
  fontWeight: '900',
  letterSpacing: 1.15,
},

routeBuilderStatusHint: {
  marginTop: 2,
  color: TACTICAL.textMuted,
  fontSize: 8,
  fontWeight: '700',
},

routeBuilderStatusActions: {
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'flex-end',
  flexWrap: 'wrap',
  gap: 6,
},

routeBuilderStatusAction: {
  minHeight: 28,
  minWidth: 54,
  paddingHorizontal: 8,
  borderRadius: 9,
  alignItems: 'center',
  justifyContent: 'center',
  backgroundColor: 'rgba(101,240,212,0.16)',
  borderWidth: 1,
  borderColor: 'rgba(101,240,212,0.32)',
},

campsitePolygonActionButton: {
  width: 58,
  height: 34,
  paddingHorizontal: 4,
  paddingVertical: 3,
},

routeBuilderStatusActionDisabled: {
  opacity: 0.46,
},

routeBuilderStatusActionText: {
  color: '#65F0D4',
  fontSize: 7,
  fontWeight: '900',
  letterSpacing: 0.95,
},

campsitePolygonActionText: {
  textAlign: 'center',
  lineHeight: 9,
  letterSpacing: 0.45,
  includeFontPadding: false,
},

routeBuilderStatusActionTextDisabled: {
  color: TACTICAL.textMuted,
},

routeBuilderStatusCancel: {
  backgroundColor: 'rgba(239,83,80,0.12)',
  borderColor: 'rgba(239,83,80,0.28)',
},

routeBuilderStatusCancelText: {
  color: '#FF9A8A',
  fontSize: 7,
  fontWeight: '900',
  letterSpacing: 0.95,
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
  flexShrink: 0,
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

quickActionButtonDisabled: {
  opacity: 0.5,
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
  paddingHorizontal: 14,
  paddingTop: 11,
  paddingBottom: 10,
  borderBottomWidth: 1,
  borderBottomColor: 'rgba(196,138,44,0.18)',
  backgroundColor: 'rgba(9,12,14,0.44)',
  gap: 9,
},

toolsSearchHeader: {
  gap: 3,
},

toolsSearchTitleRow: {
  flexDirection: 'row',
  alignItems: 'center',
  gap: 7,
},

toolsSearchTitle: {
  ...TYPO.U2,
  color: TACTICAL.text,
  fontSize: 8.5,
  letterSpacing: 1.45,
},

toolsSearchHint: {
  ...TYPO.B2,
  color: TACTICAL.textMuted,
  fontSize: 10,
  lineHeight: 13,
},

toolsSearchFieldShell: {
  borderRadius: 15,
  borderWidth: 1,
  borderColor: 'rgba(196,138,44,0.36)',
  backgroundColor: 'rgba(18,24,29,0.94)',
  padding: 2,
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.24,
  shadowRadius: 8,
  elevation: 5,
},

toolsSearchField: {
  minHeight: 44,
  borderRadius: 12,
  borderColor: 'rgba(255,220,140,0.16)',
  backgroundColor: 'rgba(9,12,14,0.88)',
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
  gap: 15,
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

toolsUtilityStack: {
  gap: 14,
},

toolsUtilitySection: {
  gap: 7,
},

toolsUtilitySectionLabel: {
  ...TYPO.U2,
  color: TACTICAL.goldMedium,
  fontSize: 7.8,
  letterSpacing: 1.55,
},

navigateWeatherToolHeader: {
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 10,
},

navigateWeatherToolTitleRow: {
  flexDirection: 'row',
  alignItems: 'center',
  gap: 7,
  minWidth: 0,
  flexShrink: 1,
},

navigateWeatherToolStack: {
  gap: 10,
},

navigateWeatherToolPanel: {
  borderRadius: 12,
  borderWidth: 1,
  borderColor: 'rgba(196,138,44,0.16)',
  backgroundColor: 'rgba(12,16,20,0.86)',
  padding: 10,
  gap: 8,
},

navigateWeatherToolPanelTitle: {
  ...TYPO.U2,
  color: TACTICAL.textMuted,
  fontSize: 7.6,
  letterSpacing: 1.2,
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

toolsSuggestionIconWrap: {
  width: 24,
  alignItems: 'center',
  justifyContent: 'center',
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

campsiteLayerLegend: {
  marginTop: 8,
  flexDirection: 'row',
  flexWrap: 'wrap',
  gap: 6,
},

campsiteLayerLegendItem: {
  flexDirection: 'row',
  alignItems: 'center',
  gap: 5,
  paddingHorizontal: 7,
  paddingVertical: 4,
  borderRadius: 999,
  borderWidth: 1,
  borderColor: 'rgba(196,138,44,0.16)',
  backgroundColor: 'rgba(18,24,29,0.72)',
},

campsiteLayerLegendDot: {
  width: 7,
  height: 7,
  borderRadius: 4,
},

campsiteLayerLegendText: {
  ...TYPO.U2,
  color: TACTICAL.textMuted,
  fontSize: 8,
  letterSpacing: 0.8,
},

dispersedCampingToggle: {
  minHeight: 68,
  borderRadius: 12,
  borderWidth: 1,
  borderColor: 'rgba(196,138,44,0.16)',
  backgroundColor: 'rgba(12,16,20,0.92)',
  paddingHorizontal: 12,
  paddingVertical: 10,
  flexDirection: 'row',
  alignItems: 'center',
  gap: 10,
},

dispersedCampingToggleActive: {
  borderColor: 'rgba(242,194,77,0.42)',
  backgroundColor: 'rgba(196,138,44,0.14)',
},

dispersedCampingCheckbox: {
  width: 22,
  height: 22,
  borderRadius: 8,
  borderWidth: 1,
  borderColor: 'rgba(242,194,77,0.36)',
  alignItems: 'center',
  justifyContent: 'center',
  backgroundColor: 'rgba(8,14,18,0.82)',
},

dispersedCampingCheckboxActive: {
  borderColor: 'rgba(242,194,77,0.82)',
  backgroundColor: TACTICAL.amber,
},

dispersedCampingToggleCopy: {
  flex: 1,
  minWidth: 0,
  gap: 4,
},

dispersedCampingToggleTitle: {
  ...TYPO.T3,
  color: TACTICAL.text,
  fontSize: 12,
  lineHeight: 17,
},

dispersedCampingToggleSubtitle: {
  ...TYPO.B2,
  color: TACTICAL.textMuted,
  fontSize: 10,
  lineHeight: 14,
},

dispersedCampingDisclaimer: {
  ...TYPO.B2,
  color: TACTICAL.textMuted,
  fontSize: 9,
  lineHeight: 13,
},

dispersedCampingLegend: {
  position: 'absolute',
  zIndex: 23,
  elevation: 23,
  maxWidth: 252,
  borderRadius: 10,
  borderWidth: 1,
  borderColor: 'rgba(242,194,77,0.28)',
  backgroundColor: 'rgba(8,14,18,0.86)',
  paddingHorizontal: 10,
  paddingVertical: 8,
  gap: 7,
},

dispersedCampingLegendHeader: {
  flexDirection: 'row',
  alignItems: 'center',
  gap: 6,
},

dispersedCampingLegendTitle: {
  ...TYPO.U2,
  color: TACTICAL.text,
  fontSize: 9,
  letterSpacing: 0.8,
},

dispersedCampingLegendRows: {
  flexDirection: 'row',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: 7,
},

dispersedCampingLegendItem: {
  flexDirection: 'row',
  alignItems: 'center',
  gap: 4,
},

dispersedCampingLegendSwatch: {
  width: 14,
  height: 7,
  borderRadius: 999,
  borderWidth: 1,
  borderColor: 'rgba(255,255,255,0.18)',
},

dispersedCampingLegendText: {
  ...TYPO.U2,
  color: TACTICAL.textMuted,
  fontSize: 8,
  letterSpacing: 0.5,
},

remotenessOverlayLegend: {
  position: 'absolute',
  zIndex: 28,
  elevation: 28,
  maxWidth: 260,
  borderRadius: 10,
  borderWidth: 1,
  borderColor: 'rgba(242,194,77,0.28)',
  backgroundColor: 'rgba(8,14,18,0.84)',
  paddingHorizontal: 10,
  paddingVertical: 8,
  gap: 7,
},

remotenessOverlayLegendDisclosure: {
  borderTopWidth: 1,
  borderTopColor: 'rgba(242,194,77,0.16)',
  paddingTop: 7,
},

remotenessOverlayLegendDisclosureText: {
  ...TYPO.B2,
  color: TACTICAL.textMuted,
  fontSize: 9,
  lineHeight: 13,
},

remotenessOverlayLegendHeader: {
  flexDirection: 'row',
  alignItems: 'center',
  gap: 6,
},

remotenessOverlayLegendTitle: {
  ...TYPO.U2,
  color: TACTICAL.text,
  fontSize: 9,
  letterSpacing: 1.1,
},

remotenessOverlayLegendScale: {
  flexDirection: 'row',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: 8,
},

remotenessOverlayLegendItem: {
  flexDirection: 'row',
  alignItems: 'center',
  gap: 4,
},

remotenessOverlayLegendSwatch: {
  width: 16,
  height: 6,
  borderRadius: 999,
},

remotenessOverlayLegendText: {
  ...TYPO.U2,
  color: TACTICAL.textMuted,
  fontSize: 8,
  letterSpacing: 0.7,
},

customRouteMainAction: {
  flex: 1,
  minWidth: 0,
  flexDirection: 'row',
  alignItems: 'center',
  gap: 10,
},

customRouteActions: {
  flexDirection: 'row',
  flexWrap: 'wrap',
  justifyContent: 'flex-end',
  gap: 6,
  maxWidth: 122,
},

customRouteBadge: {
  paddingHorizontal: 9,
  paddingVertical: 6,
  borderRadius: 999,
  borderWidth: 1,
  borderColor: 'rgba(101,240,212,0.26)',
  backgroundColor: 'rgba(101,240,212,0.10)',
},

customRouteBadgeText: {
  ...TYPO.U2,
  color: '#65F0D4',
  fontSize: 8,
  letterSpacing: 0.95,
},

savedRoutesCommandCard: {
  minHeight: 66,
  borderRadius: 14,
  borderWidth: 1,
  borderColor: 'rgba(101,240,212,0.22)',
  backgroundColor: 'rgba(12,16,20,0.94)',
  paddingHorizontal: 12,
  paddingVertical: 11,
  flexDirection: 'row',
  alignItems: 'center',
  gap: 10,
},

savedRoutesCommandIcon: {
  width: 30,
  height: 30,
  borderRadius: 11,
  alignItems: 'center',
  justifyContent: 'center',
  borderWidth: 1,
  borderColor: 'rgba(196,138,44,0.22)',
  backgroundColor: 'rgba(196,138,44,0.08)',
},

savedRoutesCommandTextWrap: {
  flex: 1,
  minWidth: 0,
  gap: 4,
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

// -- Active Run Badge --------------------------------------
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

// -- Minimize Button (expanded) ----------------------------
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

// -- Expanded Action Bar (overlay at top of fullscreen map) --
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

// -- Popup Layer -------------------------------------
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

mapPopupStaticContent: {
  flex: 1,
  padding: 14,
},

mapPopupSimpleStack: {
  gap: 12,
},

recommendCampsiteChoiceButton: {
  minHeight: 62,
  borderRadius: 14,
  borderWidth: 1,
  borderColor: 'rgba(196,138,44,0.18)',
  backgroundColor: 'rgba(18,24,29,0.9)',
  paddingHorizontal: 12,
  paddingVertical: 11,
  flexDirection: 'row',
  alignItems: 'center',
  gap: 10,
},

secondaryButton: {
  minHeight: 40,
  borderRadius: 12,
  borderWidth: 1,
  borderColor: 'rgba(196,138,44,0.18)',
  backgroundColor: 'rgba(255,255,255,0.035)',
  alignItems: 'center',
  justifyContent: 'center',
  paddingHorizontal: 12,
},

secondaryButtonText: {
  fontSize: 10,
  fontWeight: '900',
  letterSpacing: 0.8,
  color: TACTICAL.textMuted,
},

recommendCampsiteFormCard: {
  borderRadius: 16,
  borderWidth: 1,
  borderColor: 'rgba(196,138,44,0.18)',
  backgroundColor: 'rgba(18,24,29,0.9)',
  paddingHorizontal: 14,
  paddingVertical: 14,
  gap: 12,
},

recommendCampsiteCoordinateGrid: {
  flexDirection: 'row',
  gap: 8,
},

recommendCampsiteMetaRow: {
  flexDirection: 'row',
  flexWrap: 'wrap',
  gap: 8,
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

savedRoutesHeroCard: {
  borderRadius: 18,
  borderWidth: 1,
  borderColor: 'rgba(101,240,212,0.20)',
  backgroundColor: 'rgba(101,240,212,0.055)',
  paddingHorizontal: 14,
  paddingVertical: 14,
  gap: 8,
},

savedRoutesHeroTitleRow: {
  flexDirection: 'row',
  alignItems: 'flex-start',
  justifyContent: 'space-between',
  gap: 12,
},

savedRoutesTotalBadge: {
  minWidth: 62,
  borderRadius: 14,
  borderWidth: 1,
  borderColor: 'rgba(101,240,212,0.24)',
  backgroundColor: 'rgba(101,240,212,0.10)',
  alignItems: 'center',
  paddingHorizontal: 10,
  paddingVertical: 8,
},

savedRoutesTotalNumber: {
  ...TYPO.T2,
  color: '#65F0D4',
  fontSize: 18,
},

savedRoutesTotalLabel: {
  ...TYPO.U2,
  color: TACTICAL.textMuted,
  fontSize: 7,
  letterSpacing: 1,
},

savedRoutesCountRow: {
  flexDirection: 'row',
  flexWrap: 'wrap',
  gap: 6,
},

savedRoutesCountText: {
  ...TYPO.U2,
  color: TACTICAL.amber,
  fontSize: 8,
  letterSpacing: 0.9,
  borderRadius: 999,
  borderWidth: 1,
  borderColor: 'rgba(196,138,44,0.18)',
  backgroundColor: 'rgba(196,138,44,0.08)',
  paddingHorizontal: 8,
  paddingVertical: 5,
},

savedRoutesFilterRow: {
  gap: 7,
  paddingRight: 8,
},

savedRoutesFilterButton: {
  minHeight: 34,
  borderRadius: 999,
  borderWidth: 1,
  borderColor: 'rgba(196,138,44,0.18)',
  backgroundColor: 'rgba(255,255,255,0.035)',
  alignItems: 'center',
  justifyContent: 'center',
  paddingHorizontal: 12,
},

savedRoutesFilterButtonActive: {
  backgroundColor: 'rgba(196,138,44,0.92)',
  borderColor: 'rgba(255,220,140,0.36)',
},

savedRoutesFilterText: {
  ...TYPO.U2,
  color: TACTICAL.amber,
  fontSize: 8,
  letterSpacing: 1,
},

savedRoutesFilterTextActive: {
  color: '#091014',
},

savedRoutesList: {
  gap: 9,
},

savedRouteAssetCard: {
  borderRadius: 14,
  borderWidth: 1,
  borderColor: 'rgba(196,138,44,0.15)',
  backgroundColor: 'rgba(255,255,255,0.04)',
  paddingHorizontal: 12,
  paddingVertical: 11,
  gap: 8,
},

savedRouteAssetTopRow: {
  flexDirection: 'row',
  alignItems: 'flex-start',
  gap: 10,
},

savedRouteAssetTextWrap: {
  flex: 1,
  minWidth: 0,
  gap: 5,
},

savedRouteBadgeRow: {
  flexDirection: 'row',
  alignItems: 'center',
  flexWrap: 'wrap',
  gap: 6,
},

savedRouteSourceBadge: {
  ...TYPO.U2,
  color: '#65F0D4',
  fontSize: 7.5,
  letterSpacing: 0.9,
  borderRadius: 999,
  borderWidth: 1,
  borderColor: 'rgba(101,240,212,0.22)',
  backgroundColor: 'rgba(101,240,212,0.08)',
  paddingHorizontal: 7,
  paddingVertical: 4,
},

savedRouteTinyMeta: {
  ...TYPO.U2,
  color: TACTICAL.textMuted,
  fontSize: 7.5,
  letterSpacing: 0.8,
},

savedRouteDuplicateBadge: {
  ...TYPO.U2,
  color: TACTICAL.amber,
  fontSize: 7,
  letterSpacing: 0.75,
  borderRadius: 999,
  borderWidth: 1,
  borderColor: 'rgba(196,138,44,0.20)',
  backgroundColor: 'rgba(196,138,44,0.08)',
  paddingHorizontal: 7,
  paddingVertical: 4,
},

savedRouteAssetTitle: {
  ...TYPO.T3,
  color: TACTICAL.text,
  fontSize: 13,
},

savedRouteAssetSubtitle: {
  ...TYPO.B2,
  color: TACTICAL.textMuted,
  fontSize: 10,
  lineHeight: 14,
},

savedRouteAssetMeta: {
  ...TYPO.B2,
  color: TACTICAL.amber,
  fontSize: 10,
  lineHeight: 14,
},

savedRouteAssetActions: {
  flexDirection: 'row',
  flexWrap: 'wrap',
  gap: 7,
},

savedRouteAssetAction: {
  minHeight: 32,
  borderRadius: 999,
  borderWidth: 1,
  borderColor: 'rgba(196,138,44,0.24)',
  backgroundColor: 'rgba(196,138,44,0.08)',
  alignItems: 'center',
  justifyContent: 'center',
  paddingHorizontal: 12,
},

savedRouteAssetActionDisabled: {
  opacity: 0.42,
},

savedRouteAssetActionText: {
  ...TYPO.U2,
  color: TACTICAL.amber,
  fontSize: 8.5,
  letterSpacing: 1,
},

savedRouteRenameWrap: {
  gap: 8,
},

savedRouteRenameInput: {
  minHeight: 42,
  borderRadius: 12,
  borderWidth: 1,
  borderColor: 'rgba(101,240,212,0.24)',
  backgroundColor: 'rgba(101,240,212,0.07)',
  color: TACTICAL.text,
  paddingHorizontal: 12,
  fontSize: 13,
  fontWeight: '800',
},

savedRouteRenameActions: {
  flexDirection: 'row',
  flexWrap: 'wrap',
  gap: 7,
},

savedRouteRenameButton: {
  minHeight: 30,
  borderRadius: 999,
  backgroundColor: '#65F0D4',
  alignItems: 'center',
  justifyContent: 'center',
  paddingHorizontal: 12,
},

savedRouteRenameButtonText: {
  ...TYPO.U2,
  color: '#071014',
  fontSize: 8,
  letterSpacing: 1,
},

savedRouteRenameButtonSecondary: {
  minHeight: 30,
  borderRadius: 999,
  borderWidth: 1,
  borderColor: 'rgba(196,138,44,0.20)',
  backgroundColor: 'rgba(196,138,44,0.07)',
  alignItems: 'center',
  justifyContent: 'center',
  paddingHorizontal: 12,
},

savedRouteRenameButtonSecondaryText: {
  ...TYPO.U2,
  color: TACTICAL.amber,
  fontSize: 8,
  letterSpacing: 1,
},

savedRouteManageRow: {
  flexDirection: 'row',
  justifyContent: 'flex-end',
  flexWrap: 'wrap',
  gap: 7,
  paddingTop: 2,
},

savedRouteManageButton: {
  minHeight: 28,
  borderRadius: 999,
  borderWidth: 1,
  borderColor: 'rgba(255,255,255,0.10)',
  backgroundColor: 'rgba(255,255,255,0.035)',
  alignItems: 'center',
  justifyContent: 'center',
  paddingHorizontal: 10,
},

savedRouteManageButtonDanger: {
  borderColor: 'rgba(239,83,80,0.26)',
  backgroundColor: 'rgba(239,83,80,0.09)',
},

savedRouteManageButtonDisabled: {
  opacity: 0.42,
},

savedRouteManageButtonText: {
  ...TYPO.U2,
  color: TACTICAL.textMuted,
  fontSize: 7.5,
  letterSpacing: 0.9,
},

savedRouteManageButtonDangerText: {
  ...TYPO.U2,
  color: '#FF9A8A',
  fontSize: 7.5,
  letterSpacing: 0.9,
},

preflightHeroCard: {
  borderRadius: 18,
  borderWidth: 1,
  borderColor: 'rgba(196,138,44,0.24)',
  backgroundColor: 'rgba(196,138,44,0.075)',
  paddingHorizontal: 14,
  paddingVertical: 14,
  gap: 8,
},

preflightSectionCard: {
  borderRadius: 14,
  borderWidth: 1,
  borderColor: 'rgba(196,138,44,0.15)',
  backgroundColor: 'rgba(255,255,255,0.04)',
  paddingHorizontal: 12,
  paddingVertical: 11,
  gap: 7,
},

preflightPrimaryLine: {
  ...TYPO.T3,
  color: TACTICAL.text,
  fontSize: 12,
  lineHeight: 17,
},

preflightMutedText: {
  ...TYPO.B2,
  color: TACTICAL.textMuted,
  fontSize: 10.5,
  lineHeight: 15,
},

preflightCautionText: {
  ...TYPO.B2,
  color: TACTICAL.amber,
  fontSize: 10.5,
  lineHeight: 15,
},

preflightBlockedText: {
  ...TYPO.B2,
  color: '#FF9A8A',
  fontSize: 10.5,
  lineHeight: 15,
},

preflightConfirmReadyText: {
  ...TYPO.B2,
  color: '#65F0D4',
  fontSize: 10.5,
  lineHeight: 15,
},

preflightConfirmCard: {
  borderRadius: 14,
  borderWidth: 1,
  borderColor: 'rgba(101,240,212,0.22)',
  backgroundColor: 'rgba(101,240,212,0.06)',
  paddingHorizontal: 12,
  paddingVertical: 11,
  gap: 7,
},

preflightConfirmHeaderRow: {
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 10,
},

preflightConfirmStatus: {
  ...TYPO.U2,
  fontSize: 8,
  letterSpacing: 0.9,
},

preflightConfirmStatusReady: {
  color: '#65F0D4',
},

preflightConfirmStatusBlocked: {
  color: '#FF9A8A',
},

preflightConfirmActions: {
  flexDirection: 'row',
  flexWrap: 'wrap',
  gap: 8,
  paddingTop: 3,
},

preflightPointRow: {
  borderRadius: 11,
  borderWidth: 1,
  borderColor: 'rgba(255,255,255,0.08)',
  backgroundColor: 'rgba(0,0,0,0.18)',
  paddingHorizontal: 10,
  paddingVertical: 8,
  gap: 3,
},

preflightPointLabel: {
  ...TYPO.U2,
  color: '#65F0D4',
  fontSize: 8,
  letterSpacing: 0.9,
},

preflightPointDetail: {
  ...TYPO.B2,
  color: TACTICAL.textMuted,
  fontSize: 10,
},

preflightActionRow: {
  flexDirection: 'row',
  flexWrap: 'wrap',
  gap: 8,
},

preflightPrimaryAction: {
  minHeight: 44,
  flexGrow: 1,
  borderRadius: 14,
  backgroundColor: TACTICAL.amber,
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 7,
  paddingHorizontal: 12,
},

preflightActionDisabled: {
  opacity: 0.46,
},

preflightPrimaryActionText: {
  ...TYPO.U1,
  color: '#091014',
  fontSize: 9,
  letterSpacing: 1,
},

preflightSecondaryAction: {
  minHeight: 44,
  borderRadius: 14,
  borderWidth: 1,
  borderColor: 'rgba(196,138,44,0.22)',
  backgroundColor: 'rgba(196,138,44,0.08)',
  alignItems: 'center',
  justifyContent: 'center',
  paddingHorizontal: 12,
},

preflightSecondaryActionText: {
  ...TYPO.U2,
  color: TACTICAL.amber,
  fontSize: 8.5,
  letterSpacing: 1,
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

// -- Crosshair Reticle -------------------------------------
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

  // -- Drop Pin Here -----------------------------------------
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
  opacity: 0.6, // moved here
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

  // -- Weather -----------------------------------------
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

routePreviewHazardBanner: {
  minHeight: 52,
  borderRadius: 14,
  borderWidth: 1,
  paddingHorizontal: 12,
  paddingVertical: 10,
  flexDirection: 'row',
  alignItems: 'center',
  gap: 10,
},

routePreviewHazardBannerIcon: {
  width: 30,
  height: 30,
  borderRadius: 15,
  alignItems: 'center',
  justifyContent: 'center',
},

routePreviewHazardBannerTextWrap: {
  flex: 1,
  gap: 2,
},

routePreviewHazardBannerTitle: {
  fontSize: 10,
  fontWeight: '900',
  letterSpacing: 1.15,
},

routePreviewHazardBannerText: {
  color: TACTICAL.text,
  fontSize: 12,
  fontWeight: '800',
  lineHeight: 16,
},

routePreviewHazardBannerHint: {
  color: TACTICAL.textMuted,
  fontSize: 10,
  fontWeight: '700',
  letterSpacing: 0.4,
},

aiAssistBannerWrap: {
  position: 'absolute',
  zIndex: NAV_OVERLAY_Z.contextual,
  elevation: NAV_OVERLAY_Z.contextual,
},

aiAssistBanner: {
  flexDirection: 'row',
  alignItems: 'center',
  gap: 10,
  borderRadius: 14,
  borderWidth: 1,
  borderColor: 'rgba(196,138,44,0.28)',
  backgroundColor: 'rgba(10,14,18,0.94)',
  paddingHorizontal: 11,
  paddingVertical: 10,
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 8 },
  shadowOpacity: 0.28,
  shadowRadius: 12,
},

aiAssistBannerIcon: {
  width: 30,
  height: 30,
  borderRadius: 15,
  alignItems: 'center',
  justifyContent: 'center',
  borderWidth: 1,
  borderColor: 'rgba(196,138,44,0.24)',
  backgroundColor: 'rgba(196,138,44,0.10)',
},

aiAssistBannerTextWrap: {
  flex: 1,
  minWidth: 0,
  gap: 2,
},

aiAssistBannerEyebrow: {
  color: TACTICAL.amber,
  fontSize: 8,
  fontWeight: '900',
  letterSpacing: 1.1,
},

aiAssistBannerTitle: {
  color: TACTICAL.text,
  fontSize: 11,
  fontWeight: '900',
  letterSpacing: 0.8,
},

aiAssistBannerText: {
  color: TACTICAL.textMuted,
  fontSize: 10.5,
  lineHeight: 14,
},

aiAssistBannerActions: {
  flexDirection: 'row',
  alignItems: 'center',
  gap: 7,
},

aiAssistBannerActionButton: {
  minHeight: 30,
  maxWidth: 118,
  borderRadius: 999,
  borderWidth: 1,
  borderColor: 'rgba(196,138,44,0.26)',
  backgroundColor: 'rgba(196,138,44,0.10)',
  alignItems: 'center',
  justifyContent: 'center',
  paddingHorizontal: 10,
},

aiAssistBannerActionText: {
  color: TACTICAL.amber,
  fontSize: 8,
  fontWeight: '900',
  letterSpacing: 0.8,
},

aiAssistBannerDismissButton: {
  width: 30,
  height: 30,
  borderRadius: 15,
  alignItems: 'center',
  justifyContent: 'center',
  borderWidth: 1,
  borderColor: 'rgba(255,255,255,0.08)',
  backgroundColor: 'rgba(255,255,255,0.035)',
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

clearScoutPinsFloatingButton: {
  position: 'absolute',
  zIndex: NAV_OVERLAY_Z.utility,
  elevation: NAV_OVERLAY_Z.utility,
  minHeight: 34,
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 7,
  paddingHorizontal: 11,
  paddingVertical: 7,
  borderRadius: 12,
  borderWidth: 1,
  borderColor: 'rgba(240,125,113,0.38)',
  backgroundColor: 'rgba(10,14,18,0.92)',
},

clearScoutPinsFloatingText: {
  color: '#F07D71',
  fontSize: 9,
  fontWeight: '900',
  letterSpacing: 0.9,
  textTransform: 'uppercase',
},

  // -- Export Modal -----------------------------------------
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

  // -- Snapshot Modal ---------------------------------------
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



