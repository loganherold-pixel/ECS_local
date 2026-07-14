// ============================================================
// DISCOVER TAB — Expedition Opportunity Explorer
// ============================================================
// Phase 16: Discovery Tab Expansion & Trip Categories
// Phase 17: AI Route Suggestions Integration
// Phase 18: Discovery Intelligence Engine Integration
//   - Route labels (Known Route, Hidden Gem, Remote Option, etc.)
//   - Pre-trip risk preview on every route card
//   - Vehicle capability match indicators
//   - Hidden gem scoring and badges
//   - Enriched route cards with discovery intelligence
//   - Mixed feed with interleaved AI suggestions
//   - Diversity rotation for feed freshness
//   - Saved routes management
// ============================================================

import React, { useState, useEffect, useCallback, useRef, useMemo, Component, type ReactNode } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  FlatList,
  ActivityIndicator,
  useWindowDimensions,
  Image,
  Alert,
  Platform,
  type ListRenderItemInfo,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useIsFocused } from '@react-navigation/native';
import { SafeIcon as Ionicons } from '../../components/SafeIcon';
import { TACTICAL, GOLD_RAIL, ECS, TYPO } from '../../lib/theme';
import { ECS_SURFACE } from '../../lib/ecsSurfaceTokens';
import TopoBackground from '../../components/TopoBackground';
import Header from '../../components/Header';
import { ECSSegmentedControl } from '../../components/ECSChip';
import { ECSSection, ECSSectionBadge, ECSSectionHeader } from '../../components/ECSSurface';
import {
  ECSResultsEmptyState,
} from '../../components/ECSResults';
import { ECSSkeletonBlock, ECSLoadingSection, ECSTransientNotice } from '../../components/ECSLoading';
import TacticalPopupShell from '../../components/TacticalPopupShell';
import EnrichedRouteCard from '../../components/discover/EnrichedRouteCard';
import ExpeditionAnalysisModal from '../../components/discover/ExpeditionAnalysisModal';
import MissionCommandProposalAction from '../../components/mission-command/MissionCommandProposalAction';
import DistanceRadiusFilter from '../../components/discover/DistanceRadiusFilter';
import AIRouteCard from '../../components/discover/AIRouteCard';
import AIRoutePreviewModal from '../../components/discover/AIRoutePreviewModal';
import RouteCatalogSummaryCard from '../../components/discover/RouteCatalogSummaryCard';
import TrailPackPreviewModal from '../../components/trailPacks/TrailPackPreviewModal';
import ExploreTripBuilderWizardRouteCard from '../../components/discover/ExploreTripBuilderWizardRouteCard';
import { getExploreRouteThumbnailAssignments } from '../../lib/exploreTrailThumbnails';
import {
  loadOpportunitiesWithCompatibility,
  loadExpeditionOpportunities,
  computeDistancesFromUser,
  filterByRadius,
  DEFAULT_DISTANCE_RADIUS,
  DISTANCE_RADIUS_OPTIONS,
  DEFAULT_USER_LOCATION,
  MIN_DISCOVERY_ROUTE_MILES,
  type ExpeditionOpportunity,
  type DistanceRadius,
} from '../../lib/discoverEngine';
import { useThrottledGPS } from '../../lib/useThrottledGPS';
import { haversineDistanceMiles } from '../../lib/useGPSLocation';
import { offlineDiscoveryBridge } from '../../lib/offlineDiscoveryBridge';
import {
  type CompatibilityResult,
  type VehicleProfile,
} from '../../lib/rigCompatibilityEngine';
import {
  categorizeRoutesExpanded,
  dedupeExploreRoutes,
  getHiddenGemRecommendations,
  getPopularTrailRecommendations,
  type DiscoveryTabId,
  type CategorizedRoute,
  type ExploreRouteSourceMetadata,
  type HiddenGemPipelineDiagnostics,
  type HiddenGemResult,
} from '../../lib/discoverCategoryEngine';
import { HIDDEN_GEMS_MAX_RESULTS_RENDERED } from '../../lib/explore/hiddenGemsThresholds';
import { vehicleSetupStore } from '../../lib/vehicleSetupStore';
import { vehicleStore } from '../../lib/vehicleStore';
import { subscribeActiveVehicleState } from '../../lib/activeVehicleContext';
import { hapticMicro } from '../../lib/haptics';
import {
  clearTripBuilderRouteHandoff,
  saveTripBuilderRouteHandoff,
} from '../../lib/tripBuilder/tripBuilderRouteHandoffStore';
import {
  clearOfflinePrepPackHandoff,
  saveOfflinePrepPackHandoff,
} from '../../lib/offlinePrepPack';
import { explorationProgressStore } from '../../lib/explorationProgressStore';
import { aiRouteStore } from '../../lib/aiRouteStore';
import type { AIGeneratedRoute, AIRouteRequestParams } from '../../lib/aiRouteTypes';
import {
  enrichKnownRoutes,
  enrichAIRoutes,
  getRouteLabelConfig,
  recordShownRoutes,
  type EnrichedDiscoveryRoute,
} from '../../lib/discoveryIntelligenceEngine';
import {
  buildExploreNavigationPayload,
  canStageNavigationHandoffRoute,
  clearNavigationHandoffPayload,
  getNavigationHandoffRouteUnavailableReason,
  saveNavigationHandoffPayload,
  type NavigationHandoffPayload,
} from '../../lib/navigationHandoffStore';
import {
  getActiveGuidanceSnapshot,
  isNavigationHandoffForActiveGuidance,
  markNavigationHandoffActiveGuidanceReplacementConfirmed,
} from '../../lib/navigationActiveGuidanceGuard';
import { extractExploreRouteCampMarkers } from '../../lib/exploreRouteCampHandoff';
import { stageNavigationFlow } from '../../lib/ecsNavigationFlow';
import { useECSAI } from '../../lib/ai/useECSAI';
import {
  addFavoriteTrail,
  getExploreFavoritesSnapshot,
  hydrateExploreFavoritesStore,
  removeFavoriteTrailBySourceId,
  removeFavoriteTrailPlan,
  subscribeExploreFavorites,
  toggleFavoriteTrail,
  type FavoriteTrailPlan,
  type FavoriteTrailRecord,
  upsertFavoriteTrailPlan,
} from '../../lib/exploreFavoritesStore';
import { orchestrateExploreSectionRoutes } from '../../lib/explore/exploreOrchestratorAdapter';
import {
  canStartTrailPackGuidance,
  distanceMilesBetween,
  getTrailPackGeometryCoordinates,
  isPublicSuggestedTrailheadRoute,
  isPublicSuggestedTrailheadTrailPack,
  trailPackToExpeditionOpportunity,
  type ECSTrailPackSource,
  type ECSTrailPackDiscoveryItem,
} from '../../lib/explore/trailPacks';
import { trailPackToOfflinePrepCatalogInput } from '../../lib/explore/trailPackOfflineCache';
import {
  createLiveTrailPackCatalogRefreshKey,
  fetchRouteCatalogTrailPackDetail,
  liveTrailPackCatalogStore,
  refreshLiveTrailPackCatalog,
} from '../../lib/explore/liveTrailPackCatalog';
import {
  ROUTE_CATALOG_COVERAGE_AREAS,
  ROUTE_CATALOG_PRESET_SEARCH_AREAS,
  type RouteCatalogPresetSearchAreaKey,
} from '../../lib/explore/routeCatalogSearchArea';
import {
  buildTrailPackConfidenceInputsFromFeedback,
  getTrailPackFeedbackSnapshot,
  submitTrailPackFeedback,
  subscribeTrailPackFeedback,
  type ECSTrailPackFeedbackType,
} from '../../lib/explore/trailPackFeedback';
import { buildTrailPackReviewStatesFromFeedback } from '../../lib/explore/trailPackReviewQueue';
import TrailPackSubmissionModal from '../../components/trailPacks/TrailPackSubmissionModal';
import {
  trailPackRouteInputFromNavigationPayload,
  trailPackSubmissionStore,
  type ECSTrailPackSubmission,
  type ECSTrailPackSubmissionRouteInput,
} from '../../lib/explore/trailPackSubmissions';
import {
  applyExploreRefinementFilter,
  EXPLORE_REFINEMENT_OPTIONS,
  type ExploreRefinementFilter,
} from '../../lib/explore/exploreRefinementFilter';
import {
  buildExploreGuidanceReadyInventory,
  defaultExploreReadyRouteEligibility,
} from '../../lib/explore/exploreGuidanceReadyInventory';
import {
  normalizeExploreDiscoveryItems,
  routeWithExploreDiscoveryProvenance,
} from '../../lib/explore/exploreDiscoveryItem';
import {
  getVisibleExploreFeatures,
  type ExploreFeatureId,
} from '../../lib/explore/exploreFeatureRegistry';
import {
  buildExplorePerformanceSummary,
  createExplorePerformanceRun,
  getExplorePerformanceNow,
  logExplorePerformanceDiagnostic,
  markExplorePerformanceEvent,
  recordExplorePerformanceCount,
  recordExplorePerformancePhase,
  type ExplorePerformanceRun,
} from '../../lib/explore/explorePerformanceDiagnostics';
import {
  saveExplorePlanningRouteContext,
} from '../../lib/explore/explorePlanningRouteContextStore';
import {
  createExploreNavigateSeparationRun,
  recordExploreInitialRender,
  recordExploreRouteDetailFetch,
} from '../../lib/performance/exploreNavigateSeparationInstrumentation';
import {
  incrementECSPerformanceCounter,
  recordECSPerformanceRender,
  startECSPerformanceSpan,
  type ECSPerformanceSpanHandle,
} from '../../lib/performance/ecsPerformanceDiagnostics';
import { useECSNavigation } from '../../lib/navigation/useECSNavigation';
import {
  buildExploreRouteOverlaySegmentsFromRoutes,
  type ExploreRouteOverlayCategory,
} from '../../lib/navigateExploreRoutesOverlay';
import type { RouteCatalogSummary, RouteDetail } from '../../lib/routeDataContracts';
import { paginateRouteCatalogSummaries } from '../../lib/explore/routeCatalogSummaryCache';
import { saveExploreRoutesMapHandoff } from '../../lib/exploreRoutesMapHandoff';
import { createExploreMissionCommandProposal } from '../../lib/dispatchMissionCommandSourceAdapters';
import {
  getExploreFilterStateSnapshot,
  loadExploreFilterStateSnapshot,
  saveExploreFilterStateSnapshot,
  type ExplorerCategoryPanelKey,
} from '../../lib/exploreFilterStateStore';
import {
  buildRouteDiscoveryIndex,
  normalizeRouteDiscoveryCoordinateBucket,
  queryTrailPackDiscoveryIndexCached,
  revalidateTrailPackDiscoveryIndexCache,
  routeDiscoveryCache,
} from '../../lib/explore/routeDiscoveryIndex';
import { getShellBottomClearance } from '../../lib/shellLayout';
import { reportDegradedState, reportRecoverableFailure } from '../../lib/ecsIssueIntelligence';
import { ECS_CTA_LABELS, ECS_READINESS_COPY, ECS_STATE_COPY } from '../../lib/ecsStateCopy';
import { useAdaptiveLayout } from '../../lib/useAdaptiveLayout';
import { ecsLog } from '../../lib/ecsLogger';
import {
  buildExploreRouteReadinessStorePatch,
  expeditionReadinessStore,
} from '../../lib/readiness';
import {
  getExploreWizardSourceLabel,
  importedRouteToExploreWizardRoute,
  runToExploreWizardRoute,
  type ExploreWizardRouteCandidate,
  type ExploreWizardRouteSourceKind,
} from '../../lib/explore/exploreTripBuilderWizard';
import { saveExploreRouteForPlanning } from '../../lib/explore/exploreRoutePlanningSave';
import { routeStore } from '../../lib/routeStore';
import { runStore } from '../../lib/runStore';
import {
  cancelShellInteractionTask,
  runAfterShellInteractions,
  type ShellInteractionTask,
} from '../../lib/shellInteractionScheduler';

const TAG = '[EXPLORE]';
void ROUTE_CATALOG_COVERAGE_AREAS;
// Preserve the legacy categorization binding during Metro/HMR transitions while
// the unified drivable-trail pipeline fully replaces the old category tabs.
void categorizeRoutesExpanded;
const EXPLORE_ALL_TRAILS_AI_CATEGORY = 'all-drivable-trails';
const UNIFIED_TRAIL_FILTER_META = {
  label: 'ALL DRIVABLE TRAILS',
  icon: 'trail-sign-outline',
  accentColor: TACTICAL.amber,
  description: 'Radius-first drivable trail discovery for off-road routes within your current search range.',
} as const;

const EXPLORE_WIZARD_SOURCE_FILTERS: { key: ExploreWizardRouteSourceKind | 'all'; label: string }[] = [
  { key: 'all', label: 'All Ready' },
  { key: 'trail_pack', label: 'Trail Packs' },
  { key: 'hidden_gem', label: 'Hidden Gems' },
  { key: 'ecs_idea', label: 'ECS Ideas' },
  { key: 'saved_built', label: 'Saved/Built' },
  { key: 'imported_stitched', label: 'Imported/Stitched' },
];

type PopularTrailRouteWithMetadata = CategorizedRoute & {
  sourceMetadata?: ExploreRouteSourceMetadata;
};

type PopularTrailEnrichedRoute = EnrichedDiscoveryRoute & {
  categoryScore?: number;
  discoveryScore?: number;
  sourceMetadata?: ExploreRouteSourceMetadata;
};

type ExplorePrimaryTab = Extract<ExploreFeatureId, 'suggested_routes' | 'trip_builder' | 'offline_prep_pack'>;

export const FALLBACK_DISCOVERY_TABS: { id: DiscoveryTabId; label: string; icon: string; accentColor: string; description: string }[] = [
  { id: 'day-trips', label: 'DAY TRIPS', icon: 'sunny-outline', accentColor: '#66BB6A', description: 'Short routes under 6 hours — perfect for a day out' },
  { id: 'weekend-trips', label: 'WEEKEND TRIPS', icon: 'moon-outline', accentColor: 'rgba(140, 120, 210, 0.85)', description: '1–2 day routes for overnight exploration' },
  { id: 'expeditions', label: 'EXPEDITIONS', icon: 'compass-outline', accentColor: 'rgba(200, 150, 60, 0.85)', description: 'Multi-day backcountry routes for extended travel' },
  { id: 'remote-routes', label: 'REMOTE ROUTES', icon: 'radio-outline', accentColor: '#E67E22', description: 'High-remoteness routes with limited services' },
];

const FAVORITES_VISIBLE_LIMIT = 5;
const EXPLORE_CATEGORY_PAGE_SIZE = 10;
const EXPLORE_GUIDANCE_READY_FAST_PAINT_COUNT = 12;
const EXPLORE_ROUTE_DISCOVERY_FIRST_BATCH_SIZE = 12;
const EXPLORE_ROUTE_DISCOVERY_BATCH_SIZE = 24;
const EXPLORE_ROUTE_DISCOVERY_BATCH_DELAY_MS = 32;
const EXPLORE_ROUTE_CARD_INITIAL_RENDER_COUNT = 8;
const EXPLORE_ROUTE_CARD_BATCH_SIZE = 8;
const EXPLORE_ROUTE_CARD_WINDOW_SIZE = 7;
const EXPLORE_ROUTE_CARD_BATCHING_PERIOD_MS = 32;
const EXPLORE_ROUTE_CARD_DEFERRED_THUMBNAIL_INDEX = 4;
const HIDDEN_GEM_PAGE_SIZE = EXPLORE_CATEGORY_PAGE_SIZE;
const TRAIL_PACK_PAGE_SIZE = EXPLORE_CATEGORY_PAGE_SIZE;
const AI_ROUTE_IDEA_PAGE_SIZE = EXPLORE_CATEGORY_PAGE_SIZE;
const EXPLORE_MAP_HANDOFF_MAX_ROUTES = 60;
const EXPLORE_SECTION_CARD_VIEWPORT_HEIGHT = 368;
const ANDROID_DRAW_OPTIMIZED_SURFACE = Platform.OS === 'android';
const HIDDEN_GEM_AI_TIMEOUT_MS = 4500;
const EXPLORE_ENTRY_CHROME_DELAY_MS = 160;
const EXPLORE_ENTRY_CHROME_MAX_WAIT_MS = 420;
const EXPLORE_ENTRY_HEAVY_CHROME_DELAY_MS = 520;
const EXPLORE_ENTRY_HEAVY_CHROME_MAX_WAIT_MS = 960;
const EMPTY_POPULAR_TRAILS_STATE = {
  routes: [] as PopularTrailEnrichedRoute[],
  rankedRoutes: [] as PopularTrailRouteWithMetadata[],
  routeMetadataById: new Map<string, PopularTrailRouteWithMetadata>(),
  error: null as string | null,
};
const EMPTY_HIDDEN_GEM_PIPELINE_DIAGNOSTICS = {
  rawCandidateCount: 0,
  dedupedCandidateCount: 0,
  radiusMatchedCount: 0,
  tripTypeMatchedCount: 0,
  hiddenGemEligibilityCount: 0,
  popularTrailSuppressedCount: 0,
  qualityThresholdRejectedCount: 0,
  validationRejectedCount: 0,
  recoveryCandidateCount: 0,
  fallbackCandidateCount: 0,
  finalBaselineEligibleCount: 0,
  unknownPopularityCount: 0,
  healthyThreshold: 0,
  minimumAcceptableThreshold: 0,
  fallbackStage: 0,
  fallbackMode: 'strict',
  effectiveRadiusMiles: 0,
  criteriaExpanded: false,
  uiNotice: null,
} satisfies HiddenGemPipelineDiagnostics;
const EMPTY_HIDDEN_GEM_BASELINE_STATE = {
  eligibleItems: [] as HiddenGemResult[],
  evaluatedCandidates: [] as HiddenGemResult[],
  pipelineDiagnostics: EMPTY_HIDDEN_GEM_PIPELINE_DIAGNOSTICS,
  error: null as string | null,
};
const EMPTY_EXPLORE_MAP_PREVIEW_ROUTE_SETS = {
  hiddenGemRoutes: [] as ExpeditionOpportunity[],
  trailPackRoutes: [] as ExpeditionOpportunity[],
  favoriteRoutes: [] as ExpeditionOpportunity[],
  ecsRouteIdeaRoutes: [] as ExpeditionOpportunity[],
  counts: {
    hiddenGems: 0,
    trailPacks: 0,
    favorites: 0,
    ecsIdeas: 0,
    total: 0,
  },
};

const DISCOVER_LOCATION_REFRESH_THRESHOLD_MI = 5;
const TOKEN_STOP_WORDS = new Set([
  'trail',
  'trails',
  'route',
  'routes',
  'road',
  'roads',
  'track',
  'tracks',
  'loop',
  'pass',
  'camp',
  'camping',
  'ridge',
  'valley',
  'basin',
]);

function routePassesExploreMapLength(route: ExpeditionOpportunity | null | undefined): route is ExpeditionOpportunity {
  return Number.isFinite(Number(route?.distanceMiles)) && Number(route?.distanceMiles) >= MIN_DISCOVERY_ROUTE_MILES;
}

function routeCatalogSummarySource(summary: RouteCatalogSummary): ECSTrailPackSource {
  if (summary.sourceType === 'community') return 'community_reviewed';
  if (summary.sourceType === 'imported') return 'imported_gpx';
  if (summary.sourceType === 'preview') return 'needs_review';
  return 'ecs_validated';
}

function routeCatalogSummaryDifficulty(summary: RouteCatalogSummary): ECSTrailPackDiscoveryItem['difficulty'] {
  const normalized = String(summary.difficulty ?? '').trim().toLowerCase();
  if (
    normalized === 'easy' ||
    normalized === 'moderate' ||
    normalized === 'technical' ||
    normalized === 'extreme' ||
    normalized === 'unknown'
  ) {
    return normalized;
  }
  return 'unknown';
}

function routeCatalogSummaryCoordinate(summary: RouteCatalogSummary) {
  if (summary.trailheadCoordinate) return summary.trailheadCoordinate;
  if (summary.bbox) {
    return {
      latitude: (summary.bbox.minLat + summary.bbox.maxLat) / 2,
      longitude: (summary.bbox.minLng + summary.bbox.maxLng) / 2,
    };
  }
  return DEFAULT_USER_LOCATION;
}

function routeCatalogSummaryConfidence(summary: RouteCatalogSummary): number {
  if (summary.sourceType === 'official') return 88;
  if (summary.sourceType === 'community') return 68;
  if (summary.sourceType === 'imported') return 62;
  return 45;
}

function routeCatalogSummaryToTrailPackPreview(summary: RouteCatalogSummary): ECSTrailPackDiscoveryItem {
  const confidenceScore = routeCatalogSummaryConfidence(summary);
  const updatedAt = summary.updatedAt ?? new Date(0).toISOString();
  return {
    id: summary.routeId,
    name: summary.title,
    description: 'Route summary loaded. Open detail to fetch verified geometry and guidance data.',
    source: routeCatalogSummarySource(summary),
    routeType: 'unknown',
    centerCoordinate: routeCatalogSummaryCoordinate(summary),
    routeGeometryMode: 'omitted',
    distanceMiles: summary.distanceMeters != null ? summary.distanceMeters / 1609.344 : undefined,
    estimatedDurationMinutes:
      summary.estimatedDurationSeconds != null ? summary.estimatedDurationSeconds / 60 : undefined,
    difficulty: routeCatalogSummaryDifficulty(summary),
    confidenceScore,
    confidenceReasons: ['Route catalog summary. Detail fetch required for geometry and guidance.'],
    dataState: 'live',
    lastVerifiedAt: summary.updatedAt ?? undefined,
    positiveFeedbackCount:
      summary.communityRating != null ? Math.max(0, Math.round(summary.communityRating * 10)) : undefined,
    completionCount: summary.popularityScore != null ? Math.round(summary.popularityScore) : undefined,
    reviewStatus: summary.sourceType === 'preview' ? 'pending_review' : 'approved',
    tags: summary.tags,
    createdAt: updatedAt,
    updatedAt,
    distanceFromUserMiles: 0,
    evaluatedConfidence: {
      score: confidenceScore,
      band: confidenceScore >= 80 ? 'high' : confidenceScore >= 60 ? 'moderate' : 'low',
      reasons: ['Summary-only catalog card.'],
      warnings: ['Route geometry loads only after opening detail or starting navigation.'],
      blockers: [],
      lastEvaluatedAt: updatedAt,
    },
  };
}

function detailTrailPackToDiscoveryItem(
  detail: ECSTrailPackDiscoveryItem | Omit<ECSTrailPackDiscoveryItem, 'distanceFromUserMiles' | 'evaluatedConfidence'>,
  summary: RouteCatalogSummary | null,
): ECSTrailPackDiscoveryItem {
  const existing = detail as ECSTrailPackDiscoveryItem;
  if (existing.evaluatedConfidence && Number.isFinite(existing.distanceFromUserMiles)) return existing;
  const fallback = summary ? routeCatalogSummaryToTrailPackPreview(summary) : null;
  const confidenceScore = Number.isFinite(detail.confidenceScore)
    ? detail.confidenceScore
    : fallback?.confidenceScore ?? 0;
  return {
    ...detail,
    distanceFromUserMiles: existing.distanceFromUserMiles ?? fallback?.distanceFromUserMiles ?? 0,
    evaluatedConfidence: existing.evaluatedConfidence ?? {
      score: confidenceScore,
      band: confidenceScore >= 80 ? 'high' : confidenceScore >= 60 ? 'moderate' : 'low',
      reasons: detail.confidenceReasons?.length ? detail.confidenceReasons : ['Route detail loaded.'],
      warnings: [],
      blockers: [],
      lastEvaluatedAt: detail.updatedAt ?? new Date(0).toISOString(),
    },
  } as ECSTrailPackDiscoveryItem;
}

type ExploreWizardRouteCardListItemProps = {
  candidate: ExploreWizardRouteCandidate;
  routeCardWidth?: number;
  isSaved: boolean;
  deferThumbnail: boolean;
  deferEnrichment: boolean;
  onPreviewCandidate: (candidate: ExploreWizardRouteCandidate) => void;
  onStartCandidate: (candidate: ExploreWizardRouteCandidate) => void;
  onSaveCandidate: (candidate: ExploreWizardRouteCandidate) => void;
  onBuildTripCandidate: (candidate: ExploreWizardRouteCandidate) => void;
  onThumbnailLoadDuration: (durationMs: number, metadata: Record<string, unknown>) => void;
};

const ExploreWizardRouteCardListItem = React.memo(function ExploreWizardRouteCardListItem({
  candidate,
  routeCardWidth,
  isSaved,
  deferThumbnail,
  deferEnrichment,
  onPreviewCandidate,
  onStartCandidate,
  onSaveCandidate,
  onBuildTripCandidate,
  onThumbnailLoadDuration,
}: ExploreWizardRouteCardListItemProps) {
  return (
    <View style={[s.exploreWizardCardWrap, routeCardWidth ? { width: routeCardWidth } : null]}>
      <ExploreTripBuilderWizardRouteCard
        candidate={candidate}
        sourceLabel={getExploreWizardSourceLabel(candidate.sourceKind)}
        isSaved={isSaved}
        deferThumbnail={deferThumbnail}
        deferEnrichment={deferEnrichment}
        onPreview={() => onPreviewCandidate(candidate)}
        onStart={() => onStartCandidate(candidate)}
        onSave={() => onSaveCandidate(candidate)}
        onBuildTrip={() => onBuildTripCandidate(candidate)}
        onThumbnailLoadDuration={onThumbnailLoadDuration}
      />
    </View>
  );
}, (previous, next) =>
  previous.candidate === next.candidate &&
  previous.routeCardWidth === next.routeCardWidth &&
  previous.isSaved === next.isSaved &&
  previous.deferThumbnail === next.deferThumbnail &&
  previous.deferEnrichment === next.deferEnrichment &&
  previous.onThumbnailLoadDuration === next.onThumbnailLoadDuration);

function ExploreWizardRouteListSkeletonFooter({ columns }: { columns: number }) {
  const rows = Array.from({ length: Math.max(1, Math.min(columns, 2)) });
  return (
    <View style={s.exploreWizardRouteListFooter}>
      {rows.map((_, index) => (
        <View key={`explore-route-skeleton-${index}`} style={s.exploreWizardSkeletonRow}>
          <ECSSkeletonBlock width={72} height={48} />
          <View style={s.exploreWizardSkeletonCopy}>
            <ECSSkeletonBlock width="64%" height={12} />
            <ECSSkeletonBlock width="82%" height={10} />
            <ECSSkeletonBlock width="46%" height={10} />
          </View>
        </View>
      ))}
    </View>
  );
}

function isExploreGuidanceReadyRoute(
  route: ExpeditionOpportunity | null | undefined,
): route is ExpeditionOpportunity {
  return !!route && defaultExploreReadyRouteEligibility(route).eligible;
}

type HiddenGemOrchestrationStatus =
  | 'baseline_candidates_ready'
  | 'ai_requested'
  | 'ai_applied'
  | 'ai_unavailable_fallback_used'
  | 'ai_timeout_fallback_used'
  | 'ai_noop_baseline_retained'
  | 'final_hidden_gems_ready';

interface HiddenGemOrchestrationDiagnostics {
  status: HiddenGemOrchestrationStatus;
  finalSource: 'ai_assisted' | 'validated_baseline';
  aiEnabled: boolean;
  aiRequested: boolean;
  aiResponded: boolean;
  aiUsed: boolean;
  fallbackUsed: boolean;
  candidateCount: number;
  baselineEligibleCount: number;
  aiCandidateCount: number;
  finalEligibleCount: number;
  boostedCount: number;
  suppressedCount: number;
  matchedCandidateCount: number;
  strongMatchCount: number;
  rawCandidateCount: number;
  dedupedCandidateCount: number;
  radiusMatchedCount: number;
  tripTypeMatchedCount: number;
  hiddenGemEligibilityCount: number;
  popularTrailSuppressedCount: number;
  qualityThresholdRejectedCount: number;
  validationRejectedCount: number;
  recoveryCandidateCount: number;
  fallbackCandidateCount: number;
  finalBaselineEligibleCount: number;
  unknownPopularityCount: number;
  healthyThreshold: number;
  minimumAcceptableThreshold: number;
  fallbackStage: number;
  fallbackMode: 'strict' | 'balanced' | 'relaxed';
  effectiveRadiusMiles: number;
  criteriaExpanded: boolean;
  uiNotice: string | null;
  routeCatalogCount: number;
  radiusFilteredCatalogCount: number;
  activeTabCandidateCount: number;
  routeSourceMode: string;
  routeSourceHydrated: boolean;
  routeSourceLoaded: boolean;
  routeSourceFailureReason: string | null;
  locationSourceMode: string;
  offlineModeActive: boolean;
  vehicleGateApplied: boolean;
  setupGateApplied: boolean;
  authGateApplied: boolean;
}

interface HiddenGemOrchestratedItem {
  item: HiddenGemResult;
  aiAlignmentScore: number;
  aiBoost: number;
  aiPenalty: number;
  matchedAIRouteIds: string[];
}

interface HiddenGemOrchestrationState {
  items: HiddenGemResult[];
  diagnostics: HiddenGemOrchestrationDiagnostics;
}

function normalizeExploreToken(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenizeExploreValue(value: string): string[] {
  return normalizeExploreToken(value)
    .split(' ')
    .filter((token) => token.length >= 3 && !TOKEN_STOP_WORDS.has(token));
}

function inferTerrainFamily(route: ExpeditionOpportunity): string {
  const searchable = normalizeExploreToken([
    route.terrainType,
    route.region,
    route.description,
    route.imageTag,
    ...(route.highlights ?? []),
  ].join(' '));

  if (/(desert|arid|canyon|mesa|dune|wash|scrub)/.test(searchable)) return 'desert';
  if (/(forest|pine|wooded|timber|logging)/.test(searchable)) return 'forest';
  if (/(alpine|granite|ridge|summit|mountain|high country|high-country|glacier)/.test(searchable)) return 'alpine';
  if (/(coast|coastal|beach|marine)/.test(searchable)) return 'coastal';
  if (/(rock|slickrock|boulder|canyonlands)/.test(searchable)) return 'rock';
  return 'mixed';
}

function computeTokenOverlapScore(left: string[], right: string[]): number {
  if (left.length === 0 || right.length === 0) return 0;
  const rightSet = new Set(right);
  const overlapCount = left.filter((token) => rightSet.has(token)).length;
  if (overlapCount === 0) return 0;
  const overlapRatio = overlapCount / Math.max(Math.min(left.length, right.length), 1);
  return Math.round(Math.min(24, overlapCount * 6 + overlapRatio * 8));
}

function getAIRouteConfidenceWeight(route: AIGeneratedRoute): number {
  switch (route.confidence) {
    case 'high':
      return 8;
    case 'good':
      return 5;
    case 'explore':
      return 2;
    default:
      return 0;
  }
}

function computeAIRouteAlignment(
  candidate: HiddenGemResult,
  aiCandidates: AIGeneratedRoute[],
): { score: number; matchedRouteIds: string[] } {
  const candidateRoute = candidate.route;
  const candidateTokens = tokenizeExploreValue([
    candidateRoute.name,
    candidateRoute.region,
    candidateRoute.terrainType,
    candidateRoute.description,
    ...(candidateRoute.highlights ?? []),
  ].join(' '));
  const candidateTerrainFamily = inferTerrainFamily(candidateRoute);
  const candidateRegionGroup = String(candidateRoute.regionGroup ?? '').toLowerCase();

  let bestScore = 0;
  const matchedRouteIds = new Set<string>();

  aiCandidates.forEach((aiRoute) => {
    let score = 0;
    const aiTokens = tokenizeExploreValue([
      aiRoute.name,
      aiRoute.region,
      aiRoute.terrainType,
      aiRoute.description,
      aiRoute.expeditionSummary,
      ...(aiRoute.highlights ?? []),
    ].join(' '));
    const tokenScore = computeTokenOverlapScore(candidateTokens, aiTokens);
    if (tokenScore > 0) score += tokenScore;

    const aiTerrainFamily = inferTerrainFamily(aiRoute);
    if (candidateTerrainFamily === aiTerrainFamily) score += 18;
    else if (candidateTerrainFamily === 'mixed' || aiTerrainFamily === 'mixed') score += 6;

    if (candidateRegionGroup && candidateRegionGroup === String(aiRoute.regionGroup ?? '').toLowerCase()) {
      score += 18;
    } else {
      const candidateRegionTokens = tokenizeExploreValue(candidateRoute.region);
      const aiRegionTokens = tokenizeExploreValue(aiRoute.region);
      score += Math.min(12, computeTokenOverlapScore(candidateRegionTokens, aiRegionTokens));
    }

    if (Math.abs((candidateRoute.distanceFromUserMiles ?? 0) - (aiRoute.distanceFromUserMiles ?? 0)) <= 35) {
      score += 8;
    }
    if (Math.abs((candidateRoute.estimatedDays ?? 1) - (aiRoute.estimatedDays ?? 1)) <= 1) {
      score += 5;
    }
    if (Math.abs((candidateRoute.remotenessScore ?? 0) - (aiRoute.remotenessScore ?? 0)) <= 2) {
      score += 5;
    }

    score += getAIRouteConfidenceWeight(aiRoute);

    if (score >= 30) {
      matchedRouteIds.add(aiRoute.id);
    }
    if (score > bestScore) {
      bestScore = score;
    }
  });

  return {
    score: Math.min(bestScore, 100),
    matchedRouteIds: Array.from(matchedRouteIds),
  };
}


// ============================================================
// ERROR BOUNDARY
// ============================================================
interface EBProps { children: ReactNode }
interface EBState { hasError: boolean; error: Error | null }

class DiscoverErrorBoundary extends Component<EBProps, EBState> {
  state: EBState = { hasError: false, error: null };
  static getDerivedStateFromError(error: Error) { return { hasError: true, error }; }
  componentDidCatch(error: Error, info: any) { console.error(TAG, 'Error:', error, info?.componentStack); }
  render() {
    if (this.state.hasError) {
      return (
        <TopoBackground>
          <View style={s.center}>
            <Ionicons name="alert-circle-outline" size={48} color={TACTICAL.danger} />
            <Text style={s.errorTitle}>{ECS_STATE_COPY.recovery.exploreLoadFailure.title}</Text>
            <Text style={s.errorSub}>{ECS_STATE_COPY.recovery.exploreLoadFailure.message}</Text>
            <Text style={s.errorSub}>{ECS_STATE_COPY.recovery.exploreLoadFailure.helper}</Text>
            <TouchableOpacity style={s.retryBtn} onPress={() => this.setState({ hasError: false, error: null })}>
              <Text style={s.retryBtnText}>{ECS_STATE_COPY.recovery.exploreLoadFailure.ctaLabel.toUpperCase()}</Text>
            </TouchableOpacity>
          </View>
        </TopoBackground>
      );
    }
    return this.props.children;
  }
}

function ExplorerStateCard({
  icon,
  title,
  message,
  accentColor = TACTICAL.textMuted,
  action,
}: {
  icon: string;
  title: string;
  message: string;
  accentColor?: string;
  action?: ReactNode;
}) {
  return (
    <View style={s.emptyRouteCard}>
      <ECSResultsEmptyState
        title={title}
        message={message}
        icon={icon as any}
        variant={accentColor === TACTICAL.danger ? 'warning' : 'compact'}
      />
      {action}
    </View>
  );
}

function DiscoverySectionSkeleton({
  title,
  icon,
  badge,
  description,
  accentColor = TACTICAL.amber,
}: {
  title: string;
  icon: string;
  badge: string;
  description: string;
  accentColor?: string;
}) {
  return (
    <ECSLoadingSection
      title={title}
      icon={icon as any}
      badge={badge}
      description={description}
      accentColor={accentColor}
      style={s.discoverySection}
    />
  );
}

function SectionCardSkeletonList() {
  return (
    <>
      {[0, 1].map((index) => (
        <View key={`section-card-skeleton-${index}`} style={s.sectionSkeletonCard}>
          <ECSSkeletonBlock width={4} height={112} style={s.sectionSkeletonAccent} />
          <View style={s.sectionSkeletonBody}>
            <View style={s.sectionSkeletonBadgeRow}>
              <ECSSkeletonBlock width={92} height={18} style={[s.sectionSkeletonPill, s.sectionSkeletonPillWide]} />
              <ECSSkeletonBlock width={54} height={18} style={s.sectionSkeletonPill} />
            </View>
            <ECSSkeletonBlock width="74%" height={16} style={[s.sectionSkeletonLine, s.sectionSkeletonTitleLine]} />
            <ECSSkeletonBlock width="58%" height={12} style={[s.sectionSkeletonLine, s.sectionSkeletonSubtitleLine]} />
            <View style={s.sectionSkeletonStatsRow}>
              <ECSSkeletonBlock width={52} height={26} style={s.sectionSkeletonStat} />
              <ECSSkeletonBlock width={52} height={26} style={s.sectionSkeletonStat} />
              <ECSSkeletonBlock width={52} height={26} style={s.sectionSkeletonStat} />
            </View>
            <ECSSkeletonBlock width="100%" height={11} style={[s.sectionSkeletonLine, s.sectionSkeletonBodyLine]} />
            <ECSSkeletonBlock width="62%" height={11} style={[s.sectionSkeletonLine, s.sectionSkeletonBodyLineShort]} />
          </View>
        </View>
      ))}
    </>
  );
}

function buildValidatedExploreNavigationPayload(
  route: ExpeditionOpportunity | null | undefined,
  options: { approachOriginCoordinate?: { lat: number; lng: number } | null } = {},
): {
  payload: NavigationHandoffPayload | null;
  unavailableReason: string | null;
} {
  if (!route) {
    return { payload: null, unavailableReason: 'Route path unavailable.' };
  }
  const payload = buildExploreNavigationPayload(route, {
    approachOriginCoordinate: options.approachOriginCoordinate ?? null,
  });
  const unavailableReason = getNavigationHandoffRouteUnavailableReason(payload);
  return { payload, unavailableReason };
}

function formatStackedPlanLabel(plan: FavoriteTrailPlan): string {
  if (plan.items.length === 0) return 'Empty plan';
  if (plan.items.length === 1) return plan.items[0].title;
  const preview = plan.items.slice(0, 2).map((item) => item.title).join(' -> ');
  if (plan.items.length === 2) return preview;
  return `${preview} + ${plan.items.length - 2}`;
}

function favoriteTrailToExpeditionRoute(favorite: FavoriteTrailRecord): ExpeditionOpportunity {
  const payload = favorite.navigationPayload;
  const payloadRecord = payload as NavigationHandoffPayload & { region?: unknown };
  const region =
    typeof payloadRecord.region === 'string' && payloadRecord.region.trim()
      ? payloadRecord.region
      : favorite.subtitle ?? 'Saved Explorer route';
  return ({
    id: favorite.sourceTrailId,
    name: favorite.title,
    region,
    distanceMiles: favorite.trailLengthMiles ?? payload.trailLengthMiles ?? 0,
    estimatedDays: 1,
    difficulty: 'moderate',
    terrainType: favorite.trailCategory ?? 'trail',
    bestSeason: 'Unknown',
    highlights: [],
    requirements: [],
    coordinate: payload.coordinate ?? favorite.coordinate ?? null,
    destinationCoordinate: payload.roadDestinationCoordinate ?? favorite.roadDestinationCoordinate ?? null,
    trailGeometry: favorite.trailGeometry ?? payload.trailGeometry ?? [],
    routeGeometry: payload.trailGeometry ?? favorite.trailGeometry ?? [],
    routeMetadata: {
      ...(payload.routeMetadata ?? {}),
      identityKey: favorite.sourceTrailId,
      source: 'favorite',
    },
  } as unknown) as ExpeditionOpportunity;
}

// ============================================================
// MAIN SCREEN
// ============================================================
function DiscoverScreenInner() {
  recordECSPerformanceRender('explore_results', 'explore_screen');
  const [exploreFirstResultPerformance] = useState(() => startECSPerformanceSpan(
    'explore_results',
    'initial_first_visible_result',
    { trackOutstanding: true },
  ));
  const [exploreFullListPerformance] = useState(() => startECSPerformanceSpan(
    'explore_results',
    'initial_full_result_list',
    { trackOutstanding: true },
  ));
  const explorePaginationPerformanceRef = useRef<ECSPerformanceSpanHandle | null>(null);
  const exploreScrollPerformanceRef = useRef<ECSPerformanceSpanHandle | null>(null);
  const insets = useSafeAreaInsets();
  const dockClearance = useMemo(() => getShellBottomClearance(insets.bottom, 8), [insets.bottom]);
  const { push: pushSingleFlight } = useECSNavigation();
  const isFocused = useIsFocused();
  const { width: windowWidth } = useWindowDimensions();
  const adaptive = useAdaptiveLayout();
  const [opportunities, setOpportunities] = useState<ExpeditionOpportunity[]>([]);
  const [compatResults, setCompatResults] = useState<Map<string, CompatibilityResult>>(new Map());
  const [vehicleProfile, setVehicleProfile] = useState<VehicleProfile | null>(null);
  const [activeVehicleId, setActiveVehicleId] = useState<string | null>(vehicleSetupStore.getActiveVehicleId());
  const [rigContextRevision, setRigContextRevision] = useState(0);
  const activeVehicleIdRef = useRef<string | null>(vehicleSetupStore.getActiveVehicleId());

  // Analysis modal state
  const [selectedOpportunity, setSelectedOpportunity] = useState<ExpeditionOpportunity | null>(null);
  const [analysisVisible, setAnalysisVisible] = useState(false);

  // ── Loading state ─────────────────────────────────────────
  const [isLoading, setIsLoading] = useState(true);
  const initialExploreFilterStateRef = useRef(getExploreFilterStateSnapshot());

  // ── Distance radius filter state ──────────────────────────
  const [distanceRadius, setDistanceRadius] = useState<DistanceRadius | null>(
    initialExploreFilterStateRef.current.radiusMiles,
  );
  const [exploreRefinement, setExploreRefinement] = useState<ExploreRefinementFilter | null>(null);
  const [routeCatalogPreviewGeometryRequested, setRouteCatalogPreviewGeometryRequested] = useState(false);
  const [activeExplorePrimaryTab, setActiveExplorePrimaryTab] = useState<ExplorePrimaryTab>('suggested_routes');
  const [explorePlanningSelectedRouteId, setExplorePlanningSelectedRouteId] = useState<string | null>(null);
  const [exploreWizardSourceFilter, setExploreWizardSourceFilter] = useState<ExploreWizardRouteSourceKind | 'all'>('all');
  const [exploreWizardSaveNotice, setExploreWizardSaveNotice] = useState<string | null>(null);
  const [exploreEntryChromeReady, setExploreEntryChromeReady] = useState(false);
  const [exploreEntryHeavyChromeReady, setExploreEntryHeavyChromeReady] = useState(false);
  const [localRouteAssetRevision, setLocalRouteAssetRevision] = useState(0);

  // ── User location state ───────────────────────────────────
  const [userLat, setUserLat] = useState<number>(DEFAULT_USER_LOCATION.latitude);
  const [userLng, setUserLng] = useState<number>(DEFAULT_USER_LOCATION.longitude);
  const [hasGPSFix, setHasGPSFix] = useState(false);
  const routeCatalogSearchAreaKey: RouteCatalogPresetSearchAreaKey | null = null;
  const [discoverRouteSourceMode, setDiscoverRouteSourceMode] = useState('seed_catalog_default_location');
  const [discoverSourceHydrated, setDiscoverSourceHydrated] = useState(false);
  const [discoverRouteSourceFailureReason, setDiscoverRouteSourceFailureReason] = useState<string | null>(null);
  const gps = useThrottledGPS({ enabled: isFocused, highAccuracy: false });
  const tripBuilderHandoffUserLocation = useMemo(
    () => hasGPSFix
      ? {
          latitude: userLat,
          longitude: userLng,
          accuracyMeters: gps.position?.accuracyM ?? undefined,
          elevationFeet: gps.position?.altitudeFt ?? undefined,
          source: 'explore_live_gps',
        }
      : null,
    [gps.position?.accuracyM, gps.position?.altitudeFt, hasGPSFix, userLat, userLng],
  );

  const [hiddenGemPageIndex, setHiddenGemPageIndex] = useState(0);
  const [trailPackPageIndex, setTrailPackPageIndex] = useState(0);
  const [aiRouteIdeaPageIndex, setAiRouteIdeaPageIndex] = useState(0);
  const [favoritesPageIndex, setFavoritesPageIndex] = useState(0);
  const [exploreGuidanceReadyVisibleLimit, setExploreGuidanceReadyVisibleLimit] =
    useState(EXPLORE_GUIDANCE_READY_FAST_PAINT_COUNT);
  const [routeDiscoveryVisibleCount, setRouteDiscoveryVisibleCount] =
    useState(EXPLORE_ROUTE_DISCOVERY_FIRST_BATCH_SIZE);
  const [routeDiscoveryRefreshRevision, setRouteDiscoveryRefreshRevision] = useState(0);
  const [activeExplorerCategoryPanel, setActiveExplorerCategoryPanel] = useState<ExplorerCategoryPanelKey | null>(null);
  const [hasLoadedExplorer, setHasLoadedExplorer] = useState(false);
  const [exploreFilterHydrated, setExploreFilterHydrated] = useState(false);
  const [hiddenGemCycleNotice, setHiddenGemCycleNotice] = useState<string | null>(null);
  const [exploreMapHandoffNotice, setExploreMapHandoffNotice] = useState<string | null>(null);

  // ── Phase 17: AI Route state ──────────────────────────────
  const [aiRoutes, setAiRoutes] = useState<AIGeneratedRoute[]>([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiPreviewRoute, setAiPreviewRoute] = useState<AIGeneratedRoute | null>(null);
  const [aiPreviewVisible, setAiPreviewVisible] = useState(false);
  const [trailPackPreview, setTrailPackPreview] = useState<ECSTrailPackDiscoveryItem | null>(null);
  const [trailPackPreviewDetailStatus, setTrailPackPreviewDetailStatus] =
    useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [trailPackPreviewDetailError, setTrailPackPreviewDetailError] = useState<string | null>(null);
  const [trailPackFeedbackEvents, setTrailPackFeedbackEvents] = useState(() => getTrailPackFeedbackSnapshot());
  const [trailPackSubmissionSnapshot, setTrailPackSubmissionSnapshot] = useState(() =>
    trailPackSubmissionStore.getSnapshot(),
  );
  const [liveTrailPackCatalogSnapshot, setLiveTrailPackCatalogSnapshot] = useState(() =>
    liveTrailPackCatalogStore.getSnapshot(),
  );
  const [trailPackSubmissionRoute, setTrailPackSubmissionRoute] =
    useState<ECSTrailPackSubmissionRouteInput | null>(null);
  const [aiEnabled, setAiEnabled] = useState(true);
  const [hiddenGemAITimedOut, setHiddenGemAITimedOut] = useState(false);
  const [favoritesSnapshot, setFavoritesSnapshot] = useState(() => getExploreFavoritesSnapshot());
  const [favoritesExpanded, setFavoritesExpanded] = useState(false);
  const [favoritesView, setFavoritesView] = useState<'trails' | 'plans'>('trails');
  const [favoritesPlanMode, setFavoritesPlanMode] = useState(false);
  const [planBuilderVisible, setPlanBuilderVisible] = useState(false);
  const [editingPlanId, setEditingPlanId] = useState<string | null>(null);
  const [selectedPlanFavoriteIds, setSelectedPlanFavoriteIds] = useState<string[]>([]);
  const {
    aiState,
    exploreView,
    liveStatus,
  } = useECSAI({
    enabled: true,
    options: {
      enableWhenIdle: true,
      emitBriefWhenNoSignals: true,
    },
  });

  useEffect(() => {
    let cancelled = false;
    void loadExploreFilterStateSnapshot().then((snapshot) => {
      if (cancelled) return;
      setDistanceRadius(snapshot.radiusMiles);
      setExploreRefinement(snapshot.refinement);
      setActiveExplorerCategoryPanel(snapshot.activeCategoryPanel);
      if (snapshot.refinement != null) {
        setRouteCatalogPreviewGeometryRequested(true);
      }
      setExploreFilterHydrated(true);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  // ── Phase 13: Exploration Progress state ───────────────────
  const [completedIds, setCompletedIds] = useState<Set<string>>(
    () => explorationProgressStore.getCompletedIds(),
  );

  const mountedRef = useRef(true);
  const trailPackPreviewRequestRef = useRef(0);
  const lastHiddenGemDiagnosticsSignatureRef = useRef<string | null>(null);
  const lastExploreSourceDiagnosticsSignatureRef = useRef<string | null>(null);
  const explorePerformanceFirstVisibleLoggedRef = useRef<string | null>(null);
  const explorePerformanceFullListLoggedRef = useRef<string | null>(null);
  const explorePerformanceImageFetchCacheRef = useRef<{
    runId: string;
    startedAtMs: number;
    endedAtMs: number;
    count: number;
    failures: number;
    slowestMs: number;
    routeIds: string[];
    lastStatus: string | null;
    lastSource: string | null;
  } | null>(null);
  useEffect(() => { return () => { mountedRef.current = false; }; }, []);
  useEffect(() => {
    activeVehicleIdRef.current = activeVehicleId;
  }, [activeVehicleId]);

  useEffect(() => {
    const unsubscribe = subscribeTrailPackFeedback(() => {
      setTrailPackFeedbackEvents(getTrailPackFeedbackSnapshot());
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    const unsubscribe = trailPackSubmissionStore.subscribe(() => {
      setTrailPackSubmissionSnapshot(trailPackSubmissionStore.getSnapshot());
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    const unsubscribe = liveTrailPackCatalogStore.subscribe(() => {
      setLiveTrailPackCatalogSnapshot(liveTrailPackCatalogStore.getSnapshot());
    });
    return unsubscribe;
  }, []);

  const refreshRigContext = useCallback(() => {
    if (!mountedRef.current) return;
    setHiddenGemPageIndex(0);
    setTrailPackPageIndex(0);
    setAiRouteIdeaPageIndex(0);
    setFavoritesPageIndex(0);
    setHiddenGemCycleNotice(null);
    aiRouteStore.clearAll();
    setRigContextRevision((current) => current + 1);
  }, []);

  // ── Phase 13: Subscribe to exploration progress changes ────
  useEffect(() => {
    const unsub = explorationProgressStore.subscribe(() => {
      if (mountedRef.current) {
        setCompletedIds(explorationProgressStore.getCompletedIds());
      }
    });
    return unsub;
  }, []);

  // ── Phase 17: Subscribe to AI route store changes ──────────
  useEffect(() => {
    void hydrateExploreFavoritesStore();
    const unsub = subscribeExploreFavorites(() => {
      if (mountedRef.current) {
        setFavoritesSnapshot(getExploreFavoritesSnapshot());
      }
    });
    return unsub;
  }, []);

  useEffect(() => {
    const unsub = aiRouteStore.subscribe(() => {
      if (mountedRef.current) {
        setAiRoutes(aiRouteStore.getRoutes(EXPLORE_ALL_TRAILS_AI_CATEGORY));
        setAiLoading(aiRouteStore.isLoading(EXPLORE_ALL_TRAILS_AI_CATEGORY));
        setAiError(aiRouteStore.getError(EXPLORE_ALL_TRAILS_AI_CATEGORY));
        setAiEnabled(aiRouteStore.isEnabled());
      }
    });
    return unsub;
  }, []);

  useEffect(() => {
    return routeStore.subscribe(() => {
      if (mountedRef.current) {
        setLocalRouteAssetRevision((current) => current + 1);
      }
    });
  }, []);

  // ── Phase 17: Sync AI routes for the unified trail feed ───
  useEffect(() => {
    setAiRoutes(aiRouteStore.getRoutes(EXPLORE_ALL_TRAILS_AI_CATEGORY));
    setAiLoading(aiRouteStore.isLoading(EXPLORE_ALL_TRAILS_AI_CATEGORY));
    setAiError(aiRouteStore.getError(EXPLORE_ALL_TRAILS_AI_CATEGORY));
  }, []);

  useEffect(() => {
    if (!aiEnabled || !aiLoading) {
      setHiddenGemAITimedOut(false);
      return;
    }

    setHiddenGemAITimedOut(false);
    const timeoutId = setTimeout(() => {
      if (mountedRef.current) {
        setHiddenGemAITimedOut(true);
      }
    }, HIDDEN_GEM_AI_TIMEOUT_MS);

    return () => clearTimeout(timeoutId);
  }, [aiEnabled, aiLoading]);

  useEffect(() => {
    setExploreEntryChromeReady(false);
    setExploreEntryHeavyChromeReady(false);
    if (!isFocused) return undefined;

    const exploreEntryChromeTask = runAfterShellInteractions(() => {
      if (mountedRef.current) {
        setExploreEntryChromeReady(true);
      }
    }, {
      delayMs: EXPLORE_ENTRY_CHROME_DELAY_MS,
      maxWaitMs: EXPLORE_ENTRY_CHROME_MAX_WAIT_MS,
    });
    const exploreEntryHeavyChromeTask = runAfterShellInteractions(() => {
      if (mountedRef.current) {
        setExploreEntryHeavyChromeReady(true);
      }
    }, {
      delayMs: EXPLORE_ENTRY_HEAVY_CHROME_DELAY_MS,
      maxWaitMs: EXPLORE_ENTRY_HEAVY_CHROME_MAX_WAIT_MS,
    });

    return () => {
      exploreEntryChromeTask.cancel();
      exploreEntryHeavyChromeTask.cancel();
    };
  }, [isFocused]);

  // ── Phase 13: Continue Exploring recommendations ───────────
  const applyExplorerLocationFix = useCallback((latitude: number, longitude: number) => {
    if (
      hasGPSFix &&
      haversineDistanceMiles(userLat, userLng, latitude, longitude) < DISCOVER_LOCATION_REFRESH_THRESHOLD_MI
    ) {
      return;
    }

    setUserLat((current) => (current === latitude ? current : latitude));
    setUserLng((current) => (current === longitude ? current : longitude));
    setHasGPSFix((current) => (current ? current : true));
  }, [hasGPSFix, userLat, userLng]);

  // ── Acquire user location (one-shot) ──────────────────────
  useEffect(() => {
    if (!gps.hasFix || !gps.position) return;
    applyExplorerLocationFix(gps.position.latitude, gps.position.longitude);
  }, [applyExplorerLocationFix, gps.hasFix, gps.position]);

  useEffect(() => {
    const unsubscribeActiveVehicle = subscribeActiveVehicleState(() => {
      const nextVehicleId = vehicleSetupStore.getActiveVehicleId();
      if (activeVehicleIdRef.current !== nextVehicleId) {
        activeVehicleIdRef.current = nextVehicleId;
        setActiveVehicleId(nextVehicleId);
      }
      refreshRigContext();
    });

    return () => {
      unsubscribeActiveVehicle();
    };
  }, [refreshRigContext]);

  // Load opportunities with compatibility after the shell tab switch settles.
  useEffect(() => {
    let cancelled = false;

    let opportunityLoadTask: ShellInteractionTask | null = runAfterShellInteractions(() => {
      void (async () => {
        if (mountedRef.current && !cancelled) {
          setIsLoading((current) => (current ? current : true));
          setDiscoverRouteSourceFailureReason(null);
        }

        try {
          let vehicleRecord: any = null;
          const vid = activeVehicleId;
          if (vid) {
            try {
              const result = await vehicleStore.getAll();
              const vehicles = Array.isArray(result?.vehicles) ? result.vehicles : [];
              vehicleRecord = vehicles.find((v: any) => v.id === vid) || null;
            } catch {}
          }

          const { opportunities: ops, results, profile } = loadOpportunitiesWithCompatibility(
            vehicleRecord, userLat, userLng,
          );

          if (mountedRef.current && !cancelled) {
            setOpportunities(ops);
            setCompatResults(results);
            setVehicleProfile(profile);
            setDiscoverRouteSourceMode(hasGPSFix ? 'seed_catalog_live_gps' : 'seed_catalog_default_location');
            setDiscoverSourceHydrated(true);
            setDiscoverRouteSourceFailureReason(null);
            setIsLoading((current) => (current ? false : current));
          }
        } catch (err) {
          console.warn(TAG, 'Failed to load with compatibility, falling back:', err);
          const ops = computeDistancesFromUser(
            loadExpeditionOpportunities(),
            userLat,
            userLng,
            hasGPSFix ? 'live_gps' : 'default_location',
          );
          if (mountedRef.current && !cancelled) {
            setOpportunities(ops);
            setCompatResults(new Map());
            setVehicleProfile(null);
            setDiscoverRouteSourceMode(
              hasGPSFix ? 'seed_catalog_fallback_live_gps' : 'seed_catalog_fallback_default_location',
            );
            setDiscoverSourceHydrated(true);
            setDiscoverRouteSourceFailureReason(
              err instanceof Error ? err.message : 'compatibility_pipeline_failed',
            );
            setIsLoading((current) => (current ? false : current));
          }
        }
      })();
    }, {
      delayMs: EXPLORE_ROUTE_DISCOVERY_BATCH_DELAY_MS,
      maxWaitMs: 180,
    });

    return () => {
      cancelled = true;
      cancelShellInteractionTask(opportunityLoadTask);
      opportunityLoadTask = null;
    };
  }, [userLat, userLng, activeVehicleId, rigContextRevision, hasGPSFix]);

  // ── Filter opportunities by distance radius ───────────────
  const radiusFilteredOpportunities = useMemo(() => {
    return filterByRadius(
      opportunities,
      distanceRadius ?? DISTANCE_RADIUS_OPTIONS[DISTANCE_RADIUS_OPTIONS.length - 1],
    );
  }, [opportunities, distanceRadius]);
  const activeDistanceRadius =
    distanceRadius ?? DISTANCE_RADIUS_OPTIONS[DISTANCE_RADIUS_OPTIONS.length - 1];
  const routeCatalogSelectedSearchArea = useMemo(
    () => ROUTE_CATALOG_PRESET_SEARCH_AREAS.find((area) => area.key === routeCatalogSearchAreaKey) ?? null,
    [routeCatalogSearchAreaKey],
  );
  const routeCatalogEffectiveSearchArea = useMemo(
    () => {
      if (routeCatalogSelectedSearchArea) return routeCatalogSelectedSearchArea;
      if (!hasGPSFix) return null;
      return {
        key: 'live_gps' as const,
        label: 'Current GPS location',
        shortLabel: 'GPS',
        latitude: userLat,
        longitude: userLng,
        source: 'live_gps' as const,
      };
    },
    [hasGPSFix, routeCatalogSelectedSearchArea, userLat, userLng],
  );
  const routeCatalogHasSearchArea = !!routeCatalogEffectiveSearchArea;
  const routeCatalogCurationCoverageNotice = useMemo(() => {
    const curationCount = liveTrailPackCatalogSnapshot.searchMeta?.curationCandidateCount ?? 0;
    if (liveTrailPackCatalogSnapshot.coverageState.state !== 'lower_confidence_nearby' || curationCount <= 0) {
      return null;
    }
    return `${curationCount} source-backed route record${curationCount === 1 ? '' : 's'} found nearby are under ECS review and not public Suggested Trailheads yet.`;
  }, [
    liveTrailPackCatalogSnapshot.coverageState.state,
    liveTrailPackCatalogSnapshot.searchMeta?.curationCandidateCount,
  ]);
  const routeCatalogSearchCoordinate = useMemo(
    () => routeCatalogEffectiveSearchArea
      ? {
          latitude: routeCatalogEffectiveSearchArea.latitude,
          longitude: routeCatalogEffectiveSearchArea.longitude,
        }
      : { latitude: userLat, longitude: userLng },
    [routeCatalogEffectiveSearchArea, userLat, userLng],
  );
  const routeCatalogSearchBucket = normalizeRouteDiscoveryCoordinateBucket(routeCatalogSearchCoordinate);
  const routeCatalogSearchBucketKey = routeCatalogSearchBucket.bucketKey;
  const stableRouteCatalogSearchLatitude = routeCatalogSearchBucket.coordinate.latitude;
  const stableRouteCatalogSearchLongitude = routeCatalogSearchBucket.coordinate.longitude;
  const stableRouteCatalogSearchCoordinate = useMemo(
    () => ({
      latitude: stableRouteCatalogSearchLatitude,
      longitude: stableRouteCatalogSearchLongitude,
    }),
    [stableRouteCatalogSearchLatitude, stableRouteCatalogSearchLongitude],
  );
  const routeCatalogSearchCriteria = useMemo(
    () => {
      const routeCatalogLocationCriteria = routeCatalogHasSearchArea
        ? {
            latitude: stableRouteCatalogSearchCoordinate.latitude,
            longitude: stableRouteCatalogSearchCoordinate.longitude,
            radiusMiles: activeDistanceRadius,
          }
        : {};
      return {
        ...routeCatalogLocationCriteria,
        // Keep entry summary-only. The first trip refinement opts into the
        // server-bounded preview geometry needed to populate route cards.
        includePreviewGeometry: routeCatalogPreviewGeometryRequested,
        vehicleClass: vehicleProfile?.vehicleType ?? null,
        availableFuelRangeMiles: vehicleProfile?.fuel_range_miles,
        availableWaterCapacityGallons: vehicleProfile?.water_capacity_gal,
        locationSource: routeCatalogEffectiveSearchArea?.source ?? 'search_area_required',
        regionId: routeCatalogEffectiveSearchArea?.key ?? null,
      };
    },
    [
      activeDistanceRadius,
      routeCatalogEffectiveSearchArea?.key,
      routeCatalogEffectiveSearchArea?.source,
      routeCatalogHasSearchArea,
      routeCatalogPreviewGeometryRequested,
      stableRouteCatalogSearchCoordinate.latitude,
      stableRouteCatalogSearchCoordinate.longitude,
      vehicleProfile?.fuel_range_miles,
      vehicleProfile?.water_capacity_gal,
      vehicleProfile?.vehicleType,
    ],
  );
  const routeCatalogSearchRefreshKey = useMemo(
    () => createLiveTrailPackCatalogRefreshKey(routeCatalogSearchCriteria),
    [routeCatalogSearchCriteria],
  );
  const explorePerformanceSearchKey = useMemo(
    () => [
      routeCatalogEffectiveSearchArea?.source ?? 'fallback_location',
      routeCatalogSearchBucketKey,
      activeDistanceRadius,
      exploreRefinement ?? 'all_refinements',
      vehicleProfile?.vehicleType ?? 'no_vehicle',
    ].join('|'),
    [
      activeDistanceRadius,
      exploreRefinement,
      routeCatalogEffectiveSearchArea?.source,
      routeCatalogSearchBucketKey,
      vehicleProfile?.vehicleType,
    ],
  );
  const explorePerformanceRun = useMemo<ExplorePerformanceRun>(() => {
    const startedAtMs = getExplorePerformanceNow();
    const [
      locationSource = 'fallback_location',
      bucketKey = '',
      radiusText = '',
      refinementText = 'all_refinements',
      vehicleType = 'no_vehicle',
    ] = explorePerformanceSearchKey.split('|');
    const radiusMiles = Number(radiusText);
    const run = createExplorePerformanceRun({
      flow: 'nearby_route_discovery',
      searchKey: explorePerformanceSearchKey,
      startedAtMs,
      metadata: {
        radiusMiles: Number.isFinite(radiusMiles) ? radiusMiles : null,
        refinement: refinementText === 'all_refinements' ? null : refinementText,
        hasGPSFix: locationSource === 'live_gps',
        locationSource,
        coordinateBucket: bucketKey,
        vehicleType,
      },
    });
    recordExplorePerformancePhase(run, 'user_location_resolution', {
      startedAtMs,
      endedAtMs: startedAtMs,
      metadata: {
        hasGPSFix: locationSource === 'live_gps',
      },
    });
    recordExplorePerformancePhase(run, 'radius_query', {
      startedAtMs,
      endedAtMs: startedAtMs,
      metadata: {
        radiusMiles: Number.isFinite(radiusMiles) ? radiusMiles : null,
        coordinateBucket: bucketKey,
      },
    });
    return run;
  }, [explorePerformanceSearchKey]);
  const explorePerformanceRunRef = useRef(explorePerformanceRun);
  const exploreNavigateSeparationRunRef = useRef(
    createExploreNavigateSeparationRun({
      runId: 'discover-route-catalog-summary',
      startedAtMs: getExplorePerformanceNow(),
    }),
  );

  useEffect(() => {
    explorePerformanceRunRef.current = explorePerformanceRun;
  }, [explorePerformanceRun]);

  useEffect(() => {
    explorePerformanceFirstVisibleLoggedRef.current = null;
    explorePerformanceFullListLoggedRef.current = null;
    explorePerformanceImageFetchCacheRef.current = null;
  }, [explorePerformanceRun.runId]);

  useEffect(() => {
    if (!routeCatalogHasSearchArea) return;
    let routeCatalogRefreshTask: ShellInteractionTask | null = runAfterShellInteractions(() => {
      const routeCatalogPerformanceRun = explorePerformanceRunRef.current;
      const startedAtMs = getExplorePerformanceNow();
      void refreshLiveTrailPackCatalog(routeCatalogSearchCriteria).then((nextSnapshot) => {
        const endedAtMs = getExplorePerformanceNow();
        recordExplorePerformancePhase(routeCatalogPerformanceRun, 'route_catalog_query', {
          startedAtMs,
          endedAtMs,
          metadata: {
            status: nextSnapshot.status,
            source: nextSnapshot.source,
            searchMeta: nextSnapshot.searchMeta,
            error: nextSnapshot.error,
          },
        });
        recordExplorePerformanceCount(routeCatalogPerformanceRun, {
          routesEvaluated: nextSnapshot.searchMeta?.candidateCount ?? nextSnapshot.trailPacks.length,
        });
      });
    }, {
      delayMs: EXPLORE_ROUTE_DISCOVERY_BATCH_DELAY_MS,
      maxWaitMs: 480,
    });
    return () => {
      cancelShellInteractionTask(routeCatalogRefreshTask);
      routeCatalogRefreshTask = null;
    };
  }, [routeCatalogHasSearchArea, routeCatalogSearchCriteria]);

  // ── Unified drivable trail feed ───────────────────────────
  const activeTabRoutes = useMemo<ExpeditionOpportunity[]>(
    () => radiusFilteredOpportunities,
    [radiusFilteredOpportunities],
  );

  const canonicalActiveTabRoutes = useMemo<ExpeditionOpportunity[]>(
    () =>
      dedupeExploreRoutes(
        activeTabRoutes,
        compatResults,
        activeDistanceRadius,
      ),
    [activeTabRoutes, compatResults, activeDistanceRadius],
  );
  const canonicalRadiusFilteredRoutes = useMemo<ExpeditionOpportunity[]>(
    () =>
      dedupeExploreRoutes(
        radiusFilteredOpportunities,
        compatResults,
        activeDistanceRadius,
      ),
    [radiusFilteredOpportunities, compatResults, activeDistanceRadius],
  );
  const refinedCanonicalRoutes = useMemo<ExpeditionOpportunity[]>(
    () => applyExploreRefinementFilter(canonicalRadiusFilteredRoutes, exploreRefinement),
    [canonicalRadiusFilteredRoutes, exploreRefinement],
  );
  const ownerTrailPackIds = useMemo(
    () => trailPackSubmissionSnapshot.submissions.map((submission) => submission.trailPack.id),
    [trailPackSubmissionSnapshot.submissions],
  );
  const trailPackCatalog = useMemo(
    () => {
      const localSubmissions = trailPackSubmissionSnapshot.submissions.map((submission) => submission.trailPack);
      const liveCatalogPacks = liveTrailPackCatalogSnapshot.trailPacks;
      const localIds = new Set(localSubmissions.map((pack) => pack.id));
      return [...localSubmissions, ...liveCatalogPacks.filter((pack) => !localIds.has(pack.id))];
    },
    [liveTrailPackCatalogSnapshot.trailPacks, trailPackSubmissionSnapshot.submissions],
  );
  const trailPackDiscoveryRadius = activeDistanceRadius;
  const trailPackFeedbackConfidenceInputs = useMemo(
    () => buildTrailPackConfidenceInputsFromFeedback(trailPackFeedbackEvents),
    [trailPackFeedbackEvents],
  );
  const trailPackFeedbackReviewStates = useMemo(
    () => buildTrailPackReviewStatesFromFeedback(trailPackCatalog, trailPackFeedbackEvents),
    [trailPackCatalog, trailPackFeedbackEvents],
  );
  const routeDiscoveryIndex = useMemo(
    () =>
      buildRouteDiscoveryIndex(trailPackCatalog, {
        catalogVersionHash: [
          liveTrailPackCatalogSnapshot.source,
          ...trailPackCatalog
            .map((pack) => `${pack.id}:${pack.updatedAt ?? ''}:${pack.reviewStatus ?? ''}:${pack.confidenceScore ?? ''}`)
            .sort(),
          liveTrailPackCatalogSnapshot.trailPacks.length,
          trailPackSubmissionSnapshot.submissions.length,
        ].join('|'),
      }),
    [
      trailPackCatalog,
      liveTrailPackCatalogSnapshot.source,
      liveTrailPackCatalogSnapshot.trailPacks.length,
      trailPackSubmissionSnapshot.submissions.length,
    ],
  );
  const indexedTrailPackDiscovery = useMemo(
    () => {
      void routeDiscoveryRefreshRevision;
      const startedAtMs = getExplorePerformanceNow();
      const result = queryTrailPackDiscoveryIndexCached(routeDiscoveryIndex, {
        coordinate: stableRouteCatalogSearchCoordinate,
        radiusMiles: trailPackDiscoveryRadius,
        refinement: exploreRefinement,
        firstBatchSize: EXPLORE_ROUTE_DISCOVERY_FIRST_BATCH_SIZE,
        batchSize: EXPLORE_ROUTE_DISCOVERY_BATCH_SIZE,
      }, {
        cache: routeDiscoveryCache,
        includeOwnDrafts: ownerTrailPackIds.length > 0,
        ownTrailPackIds: ownerTrailPackIds,
        confidenceInputsByTrailPackId: trailPackFeedbackConfidenceInputs,
        reviewStatesByTrailPackId: trailPackFeedbackReviewStates,
      });
      recordExplorePerformancePhase(explorePerformanceRun, 'filter_sort', {
        startedAtMs,
        endedAtMs: getExplorePerformanceNow(),
        metadata: {
          inputRoutes: routeDiscoveryIndex.entries.length,
          outputRoutes: result.totalEligibleCount,
          firstBatchRoutes: result.trailPacks.length,
          radiusMiles: trailPackDiscoveryRadius,
          cacheStatus: result.cacheStatus,
          indexed: true,
        },
      });
      recordExplorePerformanceCount(explorePerformanceRun, {
        routesEvaluated: routeDiscoveryIndex.entries.length,
      });
      return result;
    },
    [
      explorePerformanceRun,
      exploreRefinement,
      routeDiscoveryIndex,
      routeDiscoveryRefreshRevision,
      trailPackDiscoveryRadius,
      trailPackFeedbackConfidenceInputs,
      trailPackFeedbackReviewStates,
      ownerTrailPackIds,
      stableRouteCatalogSearchCoordinate,
    ],
  );
  const broaderTrailPackDiscovery = useMemo(
    () =>
      queryTrailPackDiscoveryIndexCached(routeDiscoveryIndex, {
        coordinate: stableRouteCatalogSearchCoordinate,
        radiusMiles: trailPackDiscoveryRadius,
        refinement: exploreRefinement,
        firstBatchSize: EXPLORE_ROUTE_DISCOVERY_FIRST_BATCH_SIZE,
        batchSize: EXPLORE_ROUTE_DISCOVERY_BATCH_SIZE,
      }, {
        includeBroaderResults: true,
        includeOwnDrafts: ownerTrailPackIds.length > 0,
        ownTrailPackIds: ownerTrailPackIds,
        confidenceInputsByTrailPackId: trailPackFeedbackConfidenceInputs,
        reviewStatesByTrailPackId: trailPackFeedbackReviewStates,
      }),
    [
      exploreRefinement,
      routeDiscoveryIndex,
      stableRouteCatalogSearchCoordinate,
      trailPackDiscoveryRadius,
      ownerTrailPackIds,
      trailPackFeedbackConfidenceInputs,
      trailPackFeedbackReviewStates,
    ],
  );
  const discoverableTrailPacks = useMemo(
    () => indexedTrailPackDiscovery.allTrailPacks.slice(0, routeDiscoveryVisibleCount),
    [indexedTrailPackDiscovery.allTrailPacks, routeDiscoveryVisibleCount],
  );
  const broaderTrailPackResults = broaderTrailPackDiscovery.allTrailPacks;

  useEffect(() => {
    setRouteDiscoveryVisibleCount(EXPLORE_ROUTE_DISCOVERY_FIRST_BATCH_SIZE);
  }, [indexedTrailPackDiscovery.cacheKey]);

  useEffect(() => {
    if (routeDiscoveryVisibleCount >= indexedTrailPackDiscovery.allTrailPacks.length) return;
    const timer = setTimeout(() => {
      if (!mountedRef.current) return;
      setRouteDiscoveryVisibleCount((current) =>
        Math.min(current + EXPLORE_ROUTE_DISCOVERY_BATCH_SIZE, indexedTrailPackDiscovery.allTrailPacks.length),
      );
    }, EXPLORE_ROUTE_DISCOVERY_BATCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [
    indexedTrailPackDiscovery.allTrailPacks.length,
    routeDiscoveryVisibleCount,
  ]);

  useEffect(() => {
    if (!indexedTrailPackDiscovery.shouldRevalidate) return;
    const timer = setTimeout(() => {
      if (!mountedRef.current) return;
      const refreshed = revalidateTrailPackDiscoveryIndexCache(routeDiscoveryIndex, {
        coordinate: stableRouteCatalogSearchCoordinate,
        radiusMiles: trailPackDiscoveryRadius,
        refinement: exploreRefinement,
        firstBatchSize: EXPLORE_ROUTE_DISCOVERY_FIRST_BATCH_SIZE,
        batchSize: EXPLORE_ROUTE_DISCOVERY_BATCH_SIZE,
      }, {
        cache: routeDiscoveryCache,
        includeOwnDrafts: ownerTrailPackIds.length > 0,
        ownTrailPackIds: ownerTrailPackIds,
        confidenceInputsByTrailPackId: trailPackFeedbackConfidenceInputs,
        reviewStatesByTrailPackId: trailPackFeedbackReviewStates,
      });
      if (refreshed.updated && mountedRef.current) {
        setRouteDiscoveryRefreshRevision((current) => current + 1);
      }
    }, 0);
    return () => clearTimeout(timer);
  }, [
    exploreRefinement,
    indexedTrailPackDiscovery.shouldRevalidate,
    ownerTrailPackIds,
    stableRouteCatalogSearchCoordinate,
    routeDiscoveryIndex,
    trailPackDiscoveryRadius,
    trailPackFeedbackConfidenceInputs,
    trailPackFeedbackReviewStates,
  ]);
  const publicDiscoverableTrailPacks = useMemo(
    () => routeCatalogHasSearchArea ? discoverableTrailPacks.filter(isPublicSuggestedTrailheadTrailPack) : [],
    [discoverableTrailPacks, routeCatalogHasSearchArea],
  );
  const publicDiscoverableTrailPackRoutes = useMemo(
    () => publicDiscoverableTrailPacks.map((trailPack) => trailPackToExpeditionOpportunity(trailPack)),
    [publicDiscoverableTrailPacks],
  );
  const publicRefinedTrailPackIds = useMemo(() => {
    const refinedRoutes = applyExploreRefinementFilter(publicDiscoverableTrailPackRoutes, exploreRefinement);
    return new Set(
      refinedRoutes.map((route) => {
        const metadata = route.routeMetadata && typeof route.routeMetadata === 'object'
          ? route.routeMetadata as Record<string, unknown>
          : {};
        const trailPackId = typeof metadata.trailPackId === 'string' ? metadata.trailPackId.trim() : '';
        return trailPackId || String(route.id).replace(/^trail-pack:/, '');
      }),
    );
  }, [exploreRefinement, publicDiscoverableTrailPackRoutes]);
  const publicRefinedTrailPacks = useMemo(
    () =>
      exploreRefinement == null
        ? publicDiscoverableTrailPacks
        : publicDiscoverableTrailPacks.filter((trailPack) => publicRefinedTrailPackIds.has(trailPack.id)),
    [exploreRefinement, publicDiscoverableTrailPacks, publicRefinedTrailPackIds],
  );
  const routeCatalogRuntimeContract = useMemo<{
    summaries: RouteCatalogSummary[];
    selectedDetail: RouteDetail | null;
  }>(
    () => ({
      summaries: liveTrailPackCatalogSnapshot.routeCatalogSummaries,
      selectedDetail: null,
    }),
    [liveTrailPackCatalogSnapshot.routeCatalogSummaries],
  );
  const routeCatalogSummaryById = useMemo(
    () => new Map(routeCatalogRuntimeContract.summaries.map((summary) => [summary.routeId, summary])),
    [routeCatalogRuntimeContract.summaries],
  );

  const activeTabMeta = UNIFIED_TRAIL_FILTER_META;
  const exploreSourceDiagnostics = useMemo(() => {
    const offlineModeActive = offlineDiscoveryBridge.isOffline();
    return {
      routeCatalogCount: opportunities.length,
      radiusFilteredCatalogCount: radiusFilteredOpportunities.length,
      activeTabCandidateCount: refinedCanonicalRoutes.length,
      routeSourceMode: discoverRouteSourceMode,
      routeSourceHydrated: discoverSourceHydrated,
      routeSourceLoaded: discoverSourceHydrated && opportunities.length > 0,
      routeSourceFailureReason: discoverSourceHydrated
        ? discoverRouteSourceFailureReason
        : 'pending_initial_load',
      trailPackLiveCatalogStatus: liveTrailPackCatalogSnapshot.status,
      trailPackLiveCatalogCount: liveTrailPackCatalogSnapshot.trailPacks.length,
      trailPackLiveCatalogSummaryCount: routeCatalogRuntimeContract.summaries.length,
      trailPackLiveCatalogError: liveTrailPackCatalogSnapshot.error,
      trailPackLiveCatalogLastLoadedAt: liveTrailPackCatalogSnapshot.lastLoadedAt,
      trailPackLiveCatalogSource: liveTrailPackCatalogSnapshot.source,
      trailPackCoverageState: liveTrailPackCatalogSnapshot.coverageState.state,
      locationSourceMode: routeCatalogEffectiveSearchArea
        ? routeCatalogEffectiveSearchArea.source
        : 'search_area_required',
      offlineModeActive,
      vehicleGateApplied: false,
      setupGateApplied: false,
      authGateApplied: false,
    };
  }, [
    opportunities.length,
    radiusFilteredOpportunities.length,
    refinedCanonicalRoutes.length,
    discoverRouteSourceMode,
    discoverSourceHydrated,
    discoverRouteSourceFailureReason,
    liveTrailPackCatalogSnapshot.error,
    liveTrailPackCatalogSnapshot.lastLoadedAt,
    liveTrailPackCatalogSnapshot.source,
    liveTrailPackCatalogSnapshot.status,
    liveTrailPackCatalogSnapshot.trailPacks.length,
    routeCatalogRuntimeContract.summaries.length,
    liveTrailPackCatalogSnapshot.coverageState.state,
    routeCatalogEffectiveSearchArea,
  ]);
  const contentFrameStyle = useMemo(
    () => ({
      width: '100%' as const,
      alignSelf: 'center' as const,
      maxWidth: adaptive.contentMaxWidth,
      paddingHorizontal: adaptive.horizontalPadding,
    }),
    [adaptive.contentMaxWidth, adaptive.horizontalPadding],
  );
  const exploreRouteGridColumns = adaptive.explore.routeColumns > 1 || (adaptive.isLandscape && windowWidth >= 640)
    ? 2
    : 1;
  const showExploreRouteGrid = exploreRouteGridColumns > 1;
  const routeCardWidth = useMemo(() => {
    if (!showExploreRouteGrid) return undefined;
    const panelChromeWidth = adaptive.isLandscape ? 48 : 0;
    const usableWidth =
      Math.min(adaptive.contentMaxWidth ?? windowWidth, windowWidth) -
      adaptive.horizontalPadding * 2 -
      panelChromeWidth;
    return Math.max(
      300,
      Math.min(
        Math.floor((usableWidth - adaptive.panelGap * (exploreRouteGridColumns - 1)) / exploreRouteGridColumns),
        adaptive.explore.routeCardMaxWidth,
      ),
    );
  }, [
    adaptive.contentMaxWidth,
    adaptive.explore.routeCardMaxWidth,
    adaptive.horizontalPadding,
    adaptive.isLandscape,
    adaptive.panelGap,
    exploreRouteGridColumns,
    showExploreRouteGrid,
    windowWidth,
  ]);

  const aiRouteRequestParams = useMemo<AIRouteRequestParams>(() => {
    const vehicleType = vehicleProfile
      ? `${vehicleProfile.vehicleName || 'Unknown Vehicle'}`
      : 'stock SUV';
    return {
      latitude: userLat,
      longitude: userLng,
      category: EXPLORE_ALL_TRAILS_AI_CATEGORY,
      radiusMiles: activeDistanceRadius,
      vehicleType,
      vehicleBuild: vehicleProfile ? `${vehicleProfile.vehicleName || ''}` : '',
      count: 6,
      existingRouteNames: canonicalRadiusFilteredRoutes.map((route) => route.name),
    };
  }, [activeDistanceRadius, canonicalRadiusFilteredRoutes, userLat, userLng, vehicleProfile]);

  // ── Phase 17: Fetch AI routes handler ─────────────────────
  const handleFetchAIRoutes = useCallback(async () => {
    if (!aiEnabled) return;
    await aiRouteStore.fetchRoutes(aiRouteRequestParams);
  }, [aiEnabled, aiRouteRequestParams]);

  // ── Phase 17: Auto-fetch AI routes on tab/radius change ───
  useEffect(() => {
    if (
      !isLoading &&
      aiEnabled &&
      !aiRouteStore.isCacheValid(EXPLORE_ALL_TRAILS_AI_CATEGORY, aiRouteRequestParams)
    ) {
      // Delay slightly to avoid blocking UI
      const timer = setTimeout(() => {
        if (mountedRef.current) {
          handleFetchAIRoutes();
        }
      }, 800);
      return () => clearTimeout(timer);
    }
  }, [aiEnabled, aiRouteRequestParams, handleFetchAIRoutes, isLoading]);

  const stageExploreReadinessPreview = useCallback((op: ExpeditionOpportunity) => {
    expeditionReadinessStore.setReadinessInputPatch(
      buildExploreRouteReadinessStorePatch(op, { hasVehicle: !!activeVehicleId }),
    );
  }, [activeVehicleId]);

  const stageTripBuilderItineraryHandoff = useCallback((route: ExpeditionOpportunity) => {
    saveTripBuilderRouteHandoff(route as any, {
      userLocation: tripBuilderHandoffUserLocation,
    });
  }, [tripBuilderHandoffUserLocation]);

  const hydrateRouteCatalogOpportunityForHandoff = useCallback(
    async (
      route: ExpeditionOpportunity,
      options: { requireFullCatalogDetail?: boolean } = {},
    ): Promise<ExpeditionOpportunity> => {
      const routeRecord = route as ExpeditionOpportunity & { routeMetadata?: Record<string, unknown> };
      const routeMetadata = routeRecord.routeMetadata ?? {};
      const trailPackId = typeof routeMetadata.trailPackId === 'string'
        ? routeMetadata.trailPackId
        : null;
      const catalogVerification =
        routeMetadata.catalogVerification && typeof routeMetadata.catalogVerification === 'object'
          ? routeMetadata.catalogVerification as Record<string, unknown>
          : null;

      if (routeMetadata.source !== 'trail_pack' || !trailPackId) return route;
      if (catalogVerification?.detailFetchedAt && routeRecord.routeGeometry) return route;

      try {
        const detailTrailPack = await fetchRouteCatalogTrailPackDetail(trailPackId);
        const hydratedRoute = trailPackToExpeditionOpportunity(detailTrailPack);
        return {
          ...route,
          ...hydratedRoute,
          id: route.id,
          distanceFromUserMiles: route.distanceFromUserMiles ?? hydratedRoute.distanceFromUserMiles,
          routeMetadata: {
            ...(routeMetadata ?? {}),
            ...(hydratedRoute.routeMetadata ?? {}),
            routeCatalogHydratedForHandoff: true,
            routeCatalogHydratedAt: new Date().toISOString(),
          },
        } as ExpeditionOpportunity;
      } catch (error) {
        const detailError = error instanceof Error
          ? error
          : new Error('Verified route detail unavailable.');
        reportRecoverableFailure({
          severity: 'low',
          issueTitle: 'Route catalog detail hydration unavailable',
          ecsArea: 'explore',
          message: detailError.message,
          signature: `route_catalog_detail_handoff_hydration_unavailable:${trailPackId}`,
          metadata: {
            trailPackId,
            routeId: route.id,
            routeName: route.name,
            source: 'route_catalog',
          },
        });
        if (options.requireFullCatalogDetail) throw detailError;
        return route;
      }
    },
    [],
  );

  const guardPublicSuggestedTrailheadHandoff = useCallback(
    (route: ExpeditionOpportunity, intent: string): boolean => {
      if (isPublicSuggestedTrailheadRoute(route)) return true;
      reportRecoverableFailure({
        severity: 'low',
        issueTitle: 'Example route blocked from Suggested Trailheads',
        ecsArea: 'explore',
        message: 'Demo or example trails are not available for public Suggested Trailheads.',
        signature: `suggested_trailhead_fixture_blocked:${String(route.id ?? 'unknown')}:${intent}`,
        metadata: {
          routeId: route.id,
          routeName: route.name,
          intent,
          routeMetadata: route.routeMetadata ?? null,
        },
      });
      Alert.alert(
        'Verified route required',
        'Demo or example trails are not available for public Suggested Trailheads. Use a verified catalog route or import a GPX as a private pending suggestion.',
      );
      return false;
    },
    [],
  );

  const handleSelectOpportunity = useCallback((op: ExpeditionOpportunity) => {
    hapticMicro();
    if (!guardPublicSuggestedTrailheadHandoff(op, 'analysis_preview')) return;
    stageExploreReadinessPreview(op);
    stageTripBuilderItineraryHandoff(op);
    setSelectedOpportunity(op);
    setAnalysisVisible(true);
  }, [guardPublicSuggestedTrailheadHandoff, stageExploreReadinessPreview, stageTripBuilderItineraryHandoff]);

  const handleCloseAnalysis = useCallback(() => {
    setAnalysisVisible(false);
    setTimeout(() => setSelectedOpportunity(null), 300);
  }, []);

  const handleRadiusChange = useCallback((radius: DistanceRadius | null) => {
    hapticMicro();
    setDistanceRadius(radius);
    setHiddenGemPageIndex(0);
    setTrailPackPageIndex(0);
    setAiRouteIdeaPageIndex(0);
    setFavoritesPageIndex(0);
    setHiddenGemCycleNotice(null);
    // Clear AI cache when radius changes
    aiRouteStore.clearAll();
  }, []);

  const handleExploreRefinementChange = useCallback((refinement: ExploreRefinementFilter | null) => {
    hapticMicro();
    if (refinement != null) {
      setRouteCatalogPreviewGeometryRequested(true);
    }
    setExploreRefinement(refinement);
    setHiddenGemPageIndex(0);
    setTrailPackPageIndex(0);
    setAiRouteIdeaPageIndex(0);
    setFavoritesPageIndex(0);
    setHiddenGemCycleNotice(null);
  }, []);

  const handleResetDiscoveryFilters = useCallback(() => {
    hapticMicro();
    setDistanceRadius(DEFAULT_DISTANCE_RADIUS);
    setExploreRefinement(null);
    setHiddenGemPageIndex(0);
    setTrailPackPageIndex(0);
    setAiRouteIdeaPageIndex(0);
    setFavoritesPageIndex(0);
    setHiddenGemCycleNotice(null);
    aiRouteStore.clearAll();
  }, []);


  // ── Phase 17: AI Route Preview handlers ───────────────────
  const handleToggleFavoritesExpanded = useCallback(() => {
    hapticMicro();
    setFavoritesExpanded((prev) => {
      const next = !prev;
      if (!next && favoritesPlanMode) {
        setFavoritesPlanMode(false);
        setSelectedPlanFavoriteIds([]);
      }
      return next;
    });
  }, [favoritesPlanMode]);

  const handleAIPreview = useCallback((route: AIGeneratedRoute) => {
    hapticMicro();
    if (!guardPublicSuggestedTrailheadHandoff(route, 'ai_preview')) return;
    stageExploreReadinessPreview(route);
    stageTripBuilderItineraryHandoff(route);
    setAiPreviewRoute(route);
    setAiPreviewVisible(true);
  }, [guardPublicSuggestedTrailheadHandoff, stageExploreReadinessPreview, stageTripBuilderItineraryHandoff]);

  const confirmRouteHandoffAgainstActiveGuidance = useCallback(
    async (payload: NavigationHandoffPayload): Promise<NavigationHandoffPayload | null> => {
      const activeGuidance = await getActiveGuidanceSnapshot();
      if (!activeGuidance) return payload;

      if (isNavigationHandoffForActiveGuidance(payload, activeGuidance)) {
        pushSingleFlight('/navigate');
        return null;
      }

      return new Promise((resolve) => {
        let settled = false;
        const finish = (value: NavigationHandoffPayload | null) => {
          if (settled) return;
          settled = true;
          resolve(value);
        };

        Alert.alert(
          'Active guidance is running',
          `Previewing "${payload.title}" will end the current guidance${
            activeGuidance.routeTitle ? ` for "${activeGuidance.routeTitle}"` : ''
          }. Current turn-by-turn directions will be cleared. Continue?`,
          [
            {
              text: 'Keep Current',
              style: 'cancel',
              onPress: () => finish(null),
            },
            {
              text: 'Preview New Route',
              style: 'destructive',
              onPress: () =>
                finish(
                  markNavigationHandoffActiveGuidanceReplacementConfirmed(
                    payload,
                    activeGuidance,
                  ),
                ),
            },
          ],
          {
            cancelable: true,
            onDismiss: () => finish(null),
          },
        );
      });
    },
    [pushSingleFlight],
  );

  const handleNavigateToRoute = useCallback(
    async (
      route: ExpeditionOpportunity,
      options: {
        flowLabel?: string;
        flowMessage?: string;
        flowContext?: Record<string, unknown>;
        autoStartNavigation?: boolean;
      } = {},
    ) => {
      hapticMicro();
      if (!guardPublicSuggestedTrailheadHandoff(route, 'navigate')) return;
      const routeForHandoff = await hydrateRouteCatalogOpportunityForHandoff(route);
      stageExploreReadinessPreview(routeForHandoff);
      const approachOriginCoordinate = hasGPSFix ? { lat: userLat, lng: userLng } : null;
      const { payload, unavailableReason } = buildValidatedExploreNavigationPayload(routeForHandoff, {
        approachOriginCoordinate,
      });
      if (!payload || unavailableReason || !canStageNavigationHandoffRoute(payload)) {
        reportRecoverableFailure({
          severity: 'low',
          issueTitle: 'Explore route handoff unavailable',
          ecsArea: 'explore',
          message: unavailableReason ?? 'Route path unavailable.',
          signature: `explore_route_handoff_unavailable:${routeForHandoff.id}`,
          metadata: {
            routeId: routeForHandoff.id,
            routeName: routeForHandoff.name,
            source: 'explore',
          },
        });
        return;
      }

      const confirmedPayload = await confirmRouteHandoffAgainstActiveGuidance(payload);
      if (!confirmedPayload) return;

      setAnalysisVisible(false);
      setSelectedOpportunity(null);
      setAiPreviewVisible(false);
      setAiPreviewRoute(null);
      setTrailPackPreview(null);
      await saveNavigationHandoffPayload(confirmedPayload);
      await stageNavigationFlow({
        source: 'explore',
        target: 'navigate',
        intent: 'route_preview',
        label: options.flowLabel ?? (options.autoStartNavigation ? 'Starting Guidance' : 'Route Ready'),
        message: options.flowMessage ?? (options.autoStartNavigation
          ? 'Route preview accepted. Starting guidance in Navigate.'
            : 'Route is staged in Navigate. Review Active Guidance, then start when ready.'),
        context: {
          routeId: confirmedPayload.id,
          tripMode: confirmedPayload.tripMode,
          autoStartNavigation: options.autoStartNavigation === true,
          ...options.flowContext,
        },
      });
        pushSingleFlight('/navigate');
    },
    [confirmRouteHandoffAgainstActiveGuidance, guardPublicSuggestedTrailheadHandoff, hasGPSFix, hydrateRouteCatalogOpportunityForHandoff, pushSingleFlight, stageExploreReadinessPreview, userLat, userLng],
  );

  const handleBuildTripFromRoute = useCallback(
    async (route: ExpeditionOpportunity) => {
      hapticMicro();
      if (!guardPublicSuggestedTrailheadHandoff(route, 'trip_builder')) return;
      const routeForHandoff = await hydrateRouteCatalogOpportunityForHandoff(route);
      stageExploreReadinessPreview(routeForHandoff);
      stageTripBuilderItineraryHandoff(routeForHandoff);
      setAnalysisVisible(false);
      setSelectedOpportunity(null);
      setAiPreviewVisible(false);
      setAiPreviewRoute(null);
      setTrailPackPreview(null);
      pushSingleFlight({
        pathname: '/explore-trip-builder',
        params: { routeId: routeForHandoff.id, setup: '1' },
      } as any);
    },
    [guardPublicSuggestedTrailheadHandoff, hydrateRouteCatalogOpportunityForHandoff, pushSingleFlight, stageExploreReadinessPreview, stageTripBuilderItineraryHandoff],
  );

  const handlePrepareOfflineFromRoute = useCallback(
    async (route: ExpeditionOpportunity) => {
      hapticMicro();
      if (!guardPublicSuggestedTrailheadHandoff(route, 'offline_prep')) return;
      const routeForHandoff = await hydrateRouteCatalogOpportunityForHandoff(route);
      stageExploreReadinessPreview(routeForHandoff);
      saveOfflinePrepPackHandoff({
        route: routeForHandoff as any,
        campsiteCandidates: extractExploreRouteCampMarkers(routeForHandoff).map((marker) => ({
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
      setAnalysisVisible(false);
      setSelectedOpportunity(null);
      setAiPreviewVisible(false);
      setAiPreviewRoute(null);
      setTrailPackPreview(null);
      pushSingleFlight({
        pathname: '/explore-offline-prep-pack',
        params: { routeId: routeForHandoff.id },
      } as any);
    },
    [guardPublicSuggestedTrailheadHandoff, hydrateRouteCatalogOpportunityForHandoff, pushSingleFlight, stageExploreReadinessPreview],
  );

  const handleViewRouteCamps = useCallback(
    async (route: ExpeditionOpportunity) => {
      hapticMicro();
      if (!guardPublicSuggestedTrailheadHandoff(route, 'camp_preview')) return;
      const routeForHandoff = await hydrateRouteCatalogOpportunityForHandoff(route);
      const campMarkers = extractExploreRouteCampMarkers(routeForHandoff);
      if (campMarkers.length === 0) return;

      stageExploreReadinessPreview(routeForHandoff);
      const { payload, unavailableReason } = buildValidatedExploreNavigationPayload(routeForHandoff);
      if (!payload || unavailableReason || !canStageNavigationHandoffRoute(payload)) {
        reportRecoverableFailure({
          severity: 'low',
          issueTitle: 'Explore route camp handoff unavailable',
          ecsArea: 'explore',
          message: unavailableReason ?? 'Route camp pins unavailable.',
          signature: `explore_route_camp_handoff_unavailable:${routeForHandoff.id}`,
          metadata: {
            routeId: routeForHandoff.id,
            routeName: routeForHandoff.name,
            source: 'explore',
          },
        });
        return;
      }

      const campPayload: NavigationHandoffPayload = {
        ...payload,
        campMarkers,
        routeMetadata: {
          ...(payload.routeMetadata ?? {}),
          exploreAction: 'view_camps',
          routeCampMarkerCount: campMarkers.length,
        },
      };
      const confirmedPayload = await confirmRouteHandoffAgainstActiveGuidance(campPayload);
      if (!confirmedPayload) return;

      setAnalysisVisible(false);
      setSelectedOpportunity(null);
      setAiPreviewVisible(false);
      setAiPreviewRoute(null);
      setTrailPackPreview(null);
      await saveNavigationHandoffPayload(confirmedPayload);
      await stageNavigationFlow({
        source: 'explore',
        target: 'navigate',
        intent: 'route_preview',
        label: 'Route Camps',
        message: 'Route camp pins are staged in Navigate.',
        context: {
          routeId: confirmedPayload.id,
          tripMode: confirmedPayload.tripMode,
          exploreAction: 'view_camps',
          routeCampMarkerCount: confirmedPayload.campMarkers?.length ?? campMarkers.length,
        },
      });
        pushSingleFlight('/navigate');
    },
    [confirmRouteHandoffAgainstActiveGuidance, guardPublicSuggestedTrailheadHandoff, hydrateRouteCatalogOpportunityForHandoff, pushSingleFlight, stageExploreReadinessPreview],
  );

  const handlePreviewTrailPack = useCallback((trailPack: ECSTrailPackDiscoveryItem) => {
    hapticMicro();
    const requestId = trailPackPreviewRequestRef.current + 1;
    trailPackPreviewRequestRef.current = requestId;
    setTrailPackPreview(trailPack);

    if (!trailPack.catalogVerification?.publicRecommendation && trailPack.source !== 'ecs_validated') {
      setTrailPackPreviewDetailStatus('idle');
      setTrailPackPreviewDetailError(null);
      return;
    }

    setTrailPackPreviewDetailStatus('loading');
    setTrailPackPreviewDetailError(null);
    void fetchRouteCatalogTrailPackDetail(trailPack)
      .then((detail) => {
        if (!mountedRef.current || trailPackPreviewRequestRef.current !== requestId) return;
        setTrailPackPreview((current) => {
          if (!current || current.id !== trailPack.id) return current;
          return {
            ...current,
            ...detail,
            distanceFromUserMiles: current.distanceFromUserMiles,
            confidenceScore: current.confidenceScore,
            confidenceReasons: current.confidenceReasons,
            evaluatedConfidence: current.evaluatedConfidence,
          };
        });
        setTrailPackPreviewDetailStatus('ready');
      })
      .catch((error) => {
        if (!mountedRef.current || trailPackPreviewRequestRef.current !== requestId) return;
        setTrailPackPreviewDetailStatus('error');
        setTrailPackPreviewDetailError(
          error instanceof Error ? error.message : 'Verified route detail unavailable.',
        );
      });
  }, []);

  const handleCloseTrailPackPreview = useCallback(() => {
    trailPackPreviewRequestRef.current += 1;
    setTrailPackPreviewDetailStatus('idle');
    setTrailPackPreviewDetailError(null);
    setTrailPackPreview(null);
  }, []);

  const handleCacheTrailPackOffline = useCallback(
    (trailPack: ECSTrailPackDiscoveryItem) => {
      const offlinePrepInput = trailPackToOfflinePrepCatalogInput(trailPack);
      const offlineCache = trailPack.catalogVerification?.offlineCache;
      if (!offlineCache?.cacheable) {
        reportRecoverableFailure({
          severity: 'low',
          issueTitle: 'Trail Pack offline cache unavailable',
          ecsArea: 'explore',
          message: 'Offline cache metadata is unavailable for this Trail Pack.',
          signature: `trail_pack_offline_cache_unavailable:${trailPack.id}`,
          metadata: {
            trailPackId: trailPack.id,
            trailPackName: trailPack.name,
            source: trailPack.source,
          },
        });
        return;
      }

      saveOfflinePrepPackHandoff(offlinePrepInput, 'route_details');
      setAnalysisVisible(false);
      setSelectedOpportunity(null);
      setAiPreviewVisible(false);
      setAiPreviewRoute(null);
      setTrailPackPreview(null);
      pushSingleFlight({
        pathname: '/explore-offline-prep-pack',
        params: { routeId: offlinePrepInput.route.id ?? trailPack.id },
      } as any);
    },
    [pushSingleFlight],
  );

  const handleTrailPackFeedback = useCallback(
    (trailPackId: string, type: ECSTrailPackFeedbackType, note?: string) =>
      submitTrailPackFeedback({
        trailPackId,
        type,
        note,
        vehicleProfileId: activeVehicleId ?? undefined,
      }),
    [activeVehicleId],
  );

  const handleSubmitFavoriteTrailPack = useCallback((favorite: FavoriteTrailRecord) => {
    hapticMicro();
    const routeInput = trailPackRouteInputFromNavigationPayload(
      favorite.navigationPayload,
      'explore_saved_route',
    );
    setTrailPackSubmissionRoute(routeInput);
  }, []);

  const handleTrailPackSubmitted = useCallback((_submission: ECSTrailPackSubmission) => {
    setTrailPackSubmissionRoute(null);
  }, []);

  const handleStartTrailPackGuidance = useCallback(
    async (trailPack: ECSTrailPackDiscoveryItem) => {
      if (!canStartTrailPackGuidance(trailPack)) {
        reportRecoverableFailure({
          severity: 'low',
          issueTitle: 'Trail Pack guidance unavailable',
          ecsArea: 'explore',
          message: 'Route geometry is unavailable for this Trail Pack.',
          signature: `trail_pack_guidance_unavailable:${trailPack.id}`,
          metadata: {
            trailPackId: trailPack.id,
            trailPackName: trailPack.name,
            source: trailPack.source,
          },
        });
        return;
      }

      const geometry = getTrailPackGeometryCoordinates(trailPack);
      const startPoint = geometry[0] ?? trailPack.centerCoordinate;
      const distanceToStartMiles = distanceMilesBetween(
        { latitude: userLat, longitude: userLng },
        startPoint,
      );
      const isAwayFromStart = distanceToStartMiles > 1;
      await handleNavigateToRoute(trailPackToExpeditionOpportunity(trailPack), {
        flowLabel: 'Trail Pack Staged',
        flowMessage: isAwayFromStart
          ? 'Trail Pack staged. Navigate to the route start before beginning guidance.'
          : 'Trail Pack staged in Navigate. Review Active Guidance, then start when ready.',
        flowContext: {
          trailPackId: trailPack.id,
          routeStartDistanceMiles: Math.round(distanceToStartMiles * 10) / 10,
          routeStartRequired: isAwayFromStart,
        },
      });
    },
    [handleNavigateToRoute, userLat, userLng],
  );

  const handlePreviewExploreWizardCandidate = useCallback(
    (candidate: ExploreWizardRouteCandidate) => {
      const trailPackId = String(
        candidate.route.routeMetadata?.trailPackId ??
          candidate.route.id ??
          '',
      );
      const trailPack = publicDiscoverableTrailPacks.find((item) => item.id === trailPackId) ?? null;
      if (trailPack) {
        handlePreviewTrailPack(trailPack);
        return;
      }
      if (candidate.sourceKind === 'ecs_idea') {
        handleAIPreview(candidate.route as AIGeneratedRoute);
        return;
      }
      handleSelectOpportunity(candidate.route);
    },
    [handleAIPreview, handlePreviewTrailPack, handleSelectOpportunity, publicDiscoverableTrailPacks],
  );

  const hydrateExploreWizardCandidateForPlanning = useCallback(
    async (candidate: ExploreWizardRouteCandidate): Promise<ExploreWizardRouteCandidate> => {
      const routeForPlanning = await hydrateRouteCatalogOpportunityForHandoff(candidate.route, {
        requireFullCatalogDetail: true,
      });
      const { payload, unavailableReason } = buildValidatedExploreNavigationPayload(routeForPlanning);
      if (!payload || unavailableReason) {
        throw new Error(unavailableReason ?? 'Verified route detail is not ready for planning.');
      }
      return {
        ...candidate,
        route: routeForPlanning,
        navigationPayload: payload,
        title: payload.title || candidate.title,
        subtitle: payload.subtitle ?? candidate.subtitle,
        guidanceReady: true,
        unavailableReason: null,
      };
    },
    [hydrateRouteCatalogOpportunityForHandoff],
  );

  const handleSaveExploreWizardCandidate = useCallback(
    async (candidate: ExploreWizardRouteCandidate) => {
      hapticMicro();
      setExploreWizardSaveNotice(null);
      try {
        const hydratedCandidate = await hydrateExploreWizardCandidateForPlanning(candidate);
        const result = await saveExploreRouteForPlanning(hydratedCandidate);
        setFavoritesSnapshot(getExploreFavoritesSnapshot());
        setLocalRouteAssetRevision((current) => current + 1);
        setExploreWizardSaveNotice(
          result.createdRoute
            ? `${hydratedCandidate.title} saved as a favorite and stitch-ready route asset.`
            : `${hydratedCandidate.title} is already saved and stitch-ready.`,
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Explore route could not be saved.';
        reportRecoverableFailure({
          severity: 'low',
          issueTitle: 'Explore TripBuilder save unavailable',
          ecsArea: 'explore',
          message,
          signature: `explore_tripbuilder_save_unavailable:${candidate.id}`,
          metadata: {
            routeId: candidate.route.id,
            routeName: candidate.route.name,
            sourceKind: candidate.sourceKind,
          },
        });
        Alert.alert('Save unavailable', message);
      }
    },
    [hydrateExploreWizardCandidateForPlanning],
  );

  const handleBuildTripFromExploreWizardCandidate = useCallback(
    async (candidate: ExploreWizardRouteCandidate) => {
      try {
        const hydratedCandidate = await hydrateExploreWizardCandidateForPlanning(candidate);
        await saveExploreRouteForPlanning(hydratedCandidate);
        setFavoritesSnapshot(getExploreFavoritesSnapshot());
        setLocalRouteAssetRevision((current) => current + 1);
        await handleBuildTripFromRoute(hydratedCandidate.route);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Explore route could not be saved before TripBuilder.';
        reportRecoverableFailure({
          severity: 'low',
          issueTitle: 'Explore TripBuilder route save before build unavailable',
          ecsArea: 'explore',
          message,
          signature: `explore_tripbuilder_build_save_unavailable:${candidate.id}`,
          metadata: {
            routeId: candidate.route.id,
            routeName: candidate.route.name,
            sourceKind: candidate.sourceKind,
          },
        });
        Alert.alert('Build unavailable', message);
      }
    },
    [handleBuildTripFromRoute, hydrateExploreWizardCandidateForPlanning],
  );

  const handleStartExploreWizardCandidate = useCallback(
    async (candidate: ExploreWizardRouteCandidate) => {
      await handleNavigateToRoute(candidate.route, {
        autoStartNavigation: true,
        flowLabel: 'Starting Guidance',
        flowMessage: 'Explore route accepted. ECS is opening Navigate and starting the active-guidance confirmation flow.',
        flowContext: {
          exploreAction: 'tripbuilder_start',
          sourceKind: candidate.sourceKind,
        },
      });
    },
    [handleNavigateToRoute],
  );

  const handleCloseAIPreview = useCallback(() => {
    setAiPreviewVisible(false);
    setTimeout(() => setAiPreviewRoute(null), 300);
  }, []);

  // ── Phase 18: Enriched routes with discovery intelligence ──
  const selectedOpportunityCampMarkers = useMemo(
    () => extractExploreRouteCampMarkers(selectedOpportunity),
    [selectedOpportunity],
  );
  const selectedOpportunityBuildUnavailableReason = useMemo(
    () => buildValidatedExploreNavigationPayload(selectedOpportunity).unavailableReason,
    [selectedOpportunity],
  );

  const enrichedKnown = useMemo<EnrichedDiscoveryRoute[]>(() => {
    if (!exploreRefinement) return [] as EnrichedDiscoveryRoute[];
    if (refinedCanonicalRoutes.length === 0) return [];
    return enrichKnownRoutes(refinedCanonicalRoutes, vehicleProfile, compatResults);
  }, [exploreRefinement, refinedCanonicalRoutes, vehicleProfile, compatResults]);

  const enrichedKnownMap = useMemo(
    () => new Map(enrichedKnown.map((route) => [route.id, route])),
    [enrichedKnown],
  );
  const enrichedHiddenGemSourceRoutes = useMemo<EnrichedDiscoveryRoute[]>(() => {
    if (!exploreRefinement) return [] as EnrichedDiscoveryRoute[];
    if (refinedCanonicalRoutes.length === 0) return [];
    return enrichKnownRoutes(refinedCanonicalRoutes, vehicleProfile, compatResults);
  }, [exploreRefinement, refinedCanonicalRoutes, vehicleProfile, compatResults]);

  const enrichedHiddenGemSourceMap = useMemo(
    () => new Map(enrichedHiddenGemSourceRoutes.map((route) => [route.id, route])),
    [enrichedHiddenGemSourceRoutes],
  );

  const popularTrailsState = useMemo(() => {
    try {
      if (!exploreRefinement) return EMPTY_POPULAR_TRAILS_STATE;
      if (refinedCanonicalRoutes.length === 0) {
        return EMPTY_POPULAR_TRAILS_STATE;
      }

      const rankedRoutes = getPopularTrailRecommendations(
        refinedCanonicalRoutes,
        compatResults,
        {
          radiusMiles: distanceRadius ?? DISTANCE_RADIUS_OPTIONS[DISTANCE_RADIUS_OPTIONS.length - 1],
          vehicleProfile,
          expeditionPhase: aiState?.expeditionPhase ?? null,
          operationalState: aiState?.operationalState ?? null,
          recommendationStatus: liveStatus?.recommendations ?? null,
        },
      ) as PopularTrailRouteWithMetadata[];
      const routeMetadataById = new Map<string, PopularTrailRouteWithMetadata>(
        rankedRoutes.map((route) => [route.id, route]),
      );
      const routes = rankedRoutes
        .map<PopularTrailEnrichedRoute | null>((route) => {
          const enrichedRoute = enrichedKnownMap.get(route.id) ?? null;
          if (!enrichedRoute) return null;

          return {
            ...enrichedRoute,
            categoryScore: route.categoryScore,
            discoveryScore: route.discoveryScore,
            sourceMetadata: route.sourceMetadata,
          } as PopularTrailEnrichedRoute;
        })
        .filter((route): route is PopularTrailEnrichedRoute => !!route);

      return {
        routes,
        rankedRoutes,
        routeMetadataById,
        error: null as string | null,
      };
    } catch (error) {
      console.warn(TAG, 'Popular trail rendering failed:', error);
      return {
        routes: [] as PopularTrailEnrichedRoute[],
        rankedRoutes: [] as PopularTrailRouteWithMetadata[],
        routeMetadataById: new Map<string, PopularTrailRouteWithMetadata>(),
        error: 'Popular trail discovery is temporarily unavailable.',
      };
    }
  }, [
    exploreRefinement,
    refinedCanonicalRoutes,
    compatResults,
    distanceRadius,
    vehicleProfile,
    aiState?.expeditionPhase,
    aiState?.operationalState,
    liveStatus?.recommendations,
    enrichedKnownMap,
  ]);

  const popularTrailRouteIds = useMemo(
    () => new Set(popularTrailsState.routes.map((route) => route.id)),
    [popularTrailsState.routes],
  );

  const hiddenGemBaselineState = useMemo(() => {
    try {
      if (!exploreRefinement) {
        return EMPTY_HIDDEN_GEM_BASELINE_STATE;
      }
      const recommendationSet = getHiddenGemRecommendations(
        refinedCanonicalRoutes,
        compatResults,
        {
          radiusMiles: distanceRadius ?? DISTANCE_RADIUS_OPTIONS[DISTANCE_RADIUS_OPTIONS.length - 1],
          pageIndex: 0,
          pageSize: HIDDEN_GEMS_MAX_RESULTS_RENDERED,
          vehicleProfile,
          expeditionPhase: aiState?.expeditionPhase ?? null,
          operationalState: aiState?.operationalState ?? null,
          recommendationStatus: liveStatus?.recommendations ?? null,
        },
      );
      return {
        eligibleItems: recommendationSet.items,
        evaluatedCandidates: recommendationSet.evaluatedCandidates,
        pipelineDiagnostics: recommendationSet.pipelineDiagnostics,
        error: null as string | null,
      };
    } catch (error) {
      console.warn(TAG, 'Hidden gem recommendation failed:', error);
      return {
        eligibleItems: [] as HiddenGemResult[],
        evaluatedCandidates: [] as HiddenGemResult[],
        pipelineDiagnostics: {
          rawCandidateCount: 0,
          dedupedCandidateCount: 0,
          radiusMatchedCount: 0,
          tripTypeMatchedCount: 0,
          hiddenGemEligibilityCount: 0,
          popularTrailSuppressedCount: 0,
          qualityThresholdRejectedCount: 0,
          validationRejectedCount: 0,
          recoveryCandidateCount: 0,
          fallbackCandidateCount: 0,
          finalBaselineEligibleCount: 0,
          unknownPopularityCount: 0,
          healthyThreshold: 0,
          minimumAcceptableThreshold: 0,
          fallbackStage: 0,
          fallbackMode: 'strict',
          effectiveRadiusMiles: 0,
          criteriaExpanded: false,
          uiNotice: null,
        } satisfies HiddenGemPipelineDiagnostics,
        error: 'Hidden gem recommendations are temporarily unavailable.',
      };
    }
  }, [
    exploreRefinement,
    refinedCanonicalRoutes,
    compatResults,
    distanceRadius,
    vehicleProfile,
    aiState?.expeditionPhase,
    aiState?.operationalState,
    liveStatus?.recommendations,
  ]);

  const hiddenGemOrchestration = useMemo<HiddenGemOrchestrationState>(() => {
    const baselineItems = hiddenGemBaselineState.eligibleItems;
    const baselineDiagnostics = {
      candidateCount: hiddenGemBaselineState.evaluatedCandidates.length,
      baselineEligibleCount: baselineItems.length,
      aiCandidateCount: aiRoutes.length,
      ...hiddenGemBaselineState.pipelineDiagnostics,
    };

    if (baselineItems.length === 0) {
      return {
        items: [],
        diagnostics: {
          status: 'final_hidden_gems_ready',
          finalSource: 'validated_baseline',
          aiEnabled,
          aiRequested: aiEnabled && aiLoading,
          aiResponded: aiRoutes.length > 0,
          aiUsed: false,
          fallbackUsed: !aiEnabled || !!aiError || hiddenGemAITimedOut,
          finalEligibleCount: 0,
          boostedCount: 0,
          suppressedCount: 0,
          matchedCandidateCount: 0,
          strongMatchCount: 0,
          ...exploreSourceDiagnostics,
          ...baselineDiagnostics,
        },
      };
    }

    const aiUnavailable = !aiEnabled || !!aiError;
    const timeoutFallback = hiddenGemAITimedOut && aiRoutes.length === 0;
    const aiRequested = aiEnabled && aiLoading && aiRoutes.length === 0;

    if (aiUnavailable || timeoutFallback || aiRequested || aiRoutes.length === 0) {
      let status: HiddenGemOrchestrationStatus = 'baseline_candidates_ready';
      if (timeoutFallback) status = 'ai_timeout_fallback_used';
      else if (aiUnavailable) status = 'ai_unavailable_fallback_used';
      else if (aiRequested) status = 'ai_requested';
      else if (aiEnabled) status = 'ai_noop_baseline_retained';

      return {
        items: baselineItems,
        diagnostics: {
          status,
          finalSource: 'validated_baseline',
          aiEnabled,
          aiRequested,
          aiResponded: aiRoutes.length > 0,
          aiUsed: false,
          fallbackUsed: status !== 'baseline_candidates_ready',
          finalEligibleCount: baselineItems.length,
          boostedCount: 0,
          suppressedCount: 0,
          matchedCandidateCount: 0,
          strongMatchCount: 0,
          ...exploreSourceDiagnostics,
          ...baselineDiagnostics,
        },
      };
    }

    const scoredItems: HiddenGemOrchestratedItem[] = baselineItems.map((item) => {
      const alignment = computeAIRouteAlignment(item, aiRoutes);
      let aiBoost = 0;
      if (alignment.score >= 60) aiBoost = 18;
      else if (alignment.score >= 46) aiBoost = 12;
      else if (alignment.score >= 32) aiBoost = 7;
      else if (alignment.score >= 20) aiBoost = 3;

      const baseConfidence = item.sourceMetadata?.confidenceScore ?? 0;
      const aiPenalty = alignment.score < 14 && baseConfidence < 78 && baselineItems.length > HIDDEN_GEM_PAGE_SIZE ? 4 : 0;

      return {
        item,
        aiAlignmentScore: alignment.score,
        aiBoost,
        aiPenalty,
        matchedAIRouteIds: alignment.matchedRouteIds,
      };
    });

    const boostedCount = scoredItems.filter((entry) => entry.aiBoost > 0).length;
    const suppressedCount = scoredItems.filter((entry) => entry.aiPenalty > 0).length;
    const matchedCandidateCount = scoredItems.filter((entry) => entry.matchedAIRouteIds.length > 0).length;
    const strongMatchCount = scoredItems.filter((entry) => entry.aiAlignmentScore >= 46).length;
    const aiUsed = boostedCount > 0 || suppressedCount > 0;

    const items = scoredItems
      .slice()
      .sort((left, right) => {
        const adjustedDiff =
          (right.item.hiddenGemScore + right.aiBoost - right.aiPenalty) -
          (left.item.hiddenGemScore + left.aiBoost - left.aiPenalty);
        if (adjustedDiff !== 0) return adjustedDiff;

        const alignmentDiff = right.aiAlignmentScore - left.aiAlignmentScore;
        if (alignmentDiff !== 0) return alignmentDiff;

        const suitabilityDiff = right.item.suitabilityScore - left.item.suitabilityScore;
        if (suitabilityDiff !== 0) return suitabilityDiff;

        return left.item.id.localeCompare(right.item.id);
      })
      .map((entry) => entry.item);

    return {
      items,
      diagnostics: {
        status: aiUsed ? 'ai_applied' : 'ai_noop_baseline_retained',
        finalSource: aiUsed ? 'ai_assisted' : 'validated_baseline',
        aiEnabled,
        aiRequested: false,
        aiResponded: true,
        aiUsed,
        fallbackUsed: !aiUsed,
        finalEligibleCount: items.length,
        boostedCount,
        suppressedCount,
        matchedCandidateCount,
        strongMatchCount,
        ...exploreSourceDiagnostics,
        ...baselineDiagnostics,
      },
    };
  }, [
    hiddenGemBaselineState,
    aiEnabled,
    aiError,
    aiLoading,
    aiRoutes,
    hiddenGemAITimedOut,
    exploreSourceDiagnostics,
  ]);

  const hiddenGemExploreOrchestration = useMemo(() => {
    const routes: EnrichedDiscoveryRoute[] = [];
    hiddenGemOrchestration.items.forEach((item) => {
      const route = enrichedHiddenGemSourceMap.get(item.id);
      if (!route) return;
      routes.push({
        ...route,
        routeLabel: 'Hidden Gem' as const,
        routeLabelConfig: getRouteLabelConfig('Hidden Gem'),
      });
    });
    const result = orchestrateExploreSectionRoutes({
      section: 'hidden_gem',
      routes,
      expeditionPhase: aiState?.expeditionPhase ?? null,
      operationalState: aiState?.operationalState ?? null,
      recommendationStatus: liveStatus?.recommendations ?? null,
      primaryCandidate: exploreView.primary,
      hasGPSFix,
    });
    const displayRoutes = [...result.surfaced, ...result.softened, ...result.suppressed]
      .filter((route) => !popularTrailRouteIds.has(route.id));
    const baselineById = new Map(hiddenGemOrchestration.items.map((item) => [item.id, item]));
    const routeMap = new Map(
      displayRoutes.map((route) => {
        const baseline = baselineById.get(route.id);
        const rationaleText = baseline?.sourceMetadata?.rationaleText ?? null;

        return [
          route.id,
          rationaleText
            ? {
                ...route,
                explanation: {
                  ...(route.explanation ?? {}),
                  text: rationaleText,
                  shortText: rationaleText,
                },
              }
            : route,
        ] as const;
      }),
    );
    const items = hiddenGemOrchestration.items
      .filter((item) => !popularTrailRouteIds.has(item.id))
      .filter((item) => isPublicSuggestedTrailheadRoute(routeMap.get(item.id) ?? null));

    return {
      ...result,
      summaryNote: null,
      items,
      routeMap,
    };
  }, [
    hiddenGemOrchestration.items,
    popularTrailRouteIds,
    enrichedHiddenGemSourceMap,
    aiState?.expeditionPhase,
    aiState?.operationalState,
    exploreView.primary,
    hasGPSFix,
    liveStatus?.recommendations,
  ]);

  const hiddenGemState = useMemo(() => {
    const pageSize = HIDDEN_GEM_PAGE_SIZE;
    const eligibleCount = hiddenGemExploreOrchestration.items.length;
    const totalPages = Math.max(1, Math.ceil(eligibleCount / pageSize));
    const normalizedPageIndex = eligibleCount === 0
      ? 0
      : ((hiddenGemPageIndex % totalPages) + totalPages) % totalPages;
    const offset = normalizedPageIndex * pageSize;
    const items = hiddenGemExploreOrchestration.items.slice(offset, offset + pageSize);

    return {
      page: {
        items,
        evaluatedCandidates: hiddenGemBaselineState.evaluatedCandidates,
        totalCandidates: hiddenGemBaselineState.evaluatedCandidates.length,
        eligibleCount,
        pageIndex: normalizedPageIndex,
        pageSize,
        totalPages,
        offset,
        hasNextPage: eligibleCount > pageSize,
        nextPageIndex: items.length === 0 ? 0 : (normalizedPageIndex + 1) % totalPages,
      },
      error: hiddenGemBaselineState.error,
    };
  }, [hiddenGemBaselineState, hiddenGemExploreOrchestration.items, hiddenGemPageIndex]);

  const hiddenGemPage = hiddenGemState.page;
  const hiddenGemDiagnostics = hiddenGemOrchestration.diagnostics;
  const lastHiddenGemIssueSignatureRef = useRef<string | null>(null);
  useEffect(() => {
    const signature = `${hiddenGemDiagnostics.status}:${hiddenGemDiagnostics.finalSource}:${hiddenGemDiagnostics.finalEligibleCount}:${hiddenGemDiagnostics.aiCandidateCount}`;
    if (lastHiddenGemIssueSignatureRef.current === signature) return;
    lastHiddenGemIssueSignatureRef.current = signature;
    const diagnosticsMetadata = JSON.parse(JSON.stringify(hiddenGemDiagnostics)) as Record<string, unknown>;

    if (hiddenGemDiagnostics.status === 'ai_unavailable_fallback_used') {
      reportRecoverableFailure({
        severity: 'medium',
        issueTitle: 'Hidden Gems ECS intelligence unavailable',
        ecsArea: 'explore',
        message: aiError || 'Hidden Gems fell back to the validated baseline because ECS intelligence was unavailable',
        signature: `hidden_gems_ai_unavailable:${aiError || 'unavailable'}`,
        metadata: diagnosticsMetadata,
        fallbackUsed: true,
      });
      return;
    }

    if (hiddenGemDiagnostics.status === 'ai_timeout_fallback_used') {
      reportRecoverableFailure({
        severity: 'medium',
        issueTitle: 'Hidden Gems ECS intelligence timeout',
        ecsArea: 'explore',
        message: 'Hidden Gems ECS intelligence refinement timed out and the validated baseline was retained',
        signature: 'hidden_gems_ai_timeout',
        metadata: diagnosticsMetadata,
        fallbackUsed: true,
      });
      return;
    }

    if (hiddenGemDiagnostics.status === 'ai_noop_baseline_retained' && hiddenGemDiagnostics.aiEnabled) {
      reportDegradedState({
        severity: 'low',
        issueTitle: 'Hidden Gems ECS intelligence returned no refinement',
        ecsArea: 'explore',
        message: 'ECS intelligence orchestration completed without refining the validated baseline list',
        signature: 'hidden_gems_ai_noop',
        metadata: diagnosticsMetadata,
        fallbackUsed: hiddenGemDiagnostics.finalSource === 'validated_baseline',
      });
    }
  }, [aiError, hiddenGemDiagnostics]);
  const enrichedHiddenGemRoutes = useMemo<EnrichedDiscoveryRoute[]>(() => {
    if (hiddenGemPage.items.length === 0) return [];
    return hiddenGemPage.items
      .map((item) => hiddenGemExploreOrchestration.routeMap.get(item.id) ?? null)
      .filter((route): route is EnrichedDiscoveryRoute => !!route);
  }, [hiddenGemPage.items, hiddenGemExploreOrchestration.routeMap]);

  const distanceRadiusMetaLabel = distanceRadius == null ? 'All Range' : `${distanceRadius} mi`;
  const distanceRadiusNarrative = distanceRadius == null ? 'the current range' : `${distanceRadius} miles`;
  const distanceRadiusFooterLabel = distanceRadius == null ? 'ALL RANGE' : `${distanceRadius} MI`;
  const selectedExploreRefinementLabel =
    EXPLORE_REFINEMENT_OPTIONS.find((option) => option.key === exploreRefinement)?.label ?? null;
  const exploreFilterNarrative = selectedExploreRefinementLabel
    ? `${distanceRadiusNarrative} with ${selectedExploreRefinementLabel.toLowerCase()} selected`
    : distanceRadiusNarrative;

  const radiusFilteredAIRoutes = useMemo<AIGeneratedRoute[]>(
    () => filterByRadius(aiRoutes, activeDistanceRadius) as AIGeneratedRoute[],
    [activeDistanceRadius, aiRoutes],
  );
  const refinedAIRoutes = useMemo(
    () => applyExploreRefinementFilter(radiusFilteredAIRoutes, exploreRefinement),
    [radiusFilteredAIRoutes, exploreRefinement],
  );
  const publicRefinedAIRoutes = useMemo(
    () => refinedAIRoutes.filter(isPublicSuggestedTrailheadRoute),
    [refinedAIRoutes],
  );

  const exploreMapPreviewRouteSets = useMemo(() => {
    if (!exploreRefinement) return EMPTY_EXPLORE_MAP_PREVIEW_ROUTE_SETS;
    const startedAtMs = getExplorePerformanceNow();
    const hiddenGemRoutes = hiddenGemExploreOrchestration.items
      .map((item) => hiddenGemExploreOrchestration.routeMap.get(item.id) ?? item.route)
      .filter(routePassesExploreMapLength)
      .filter(isExploreGuidanceReadyRoute);
    const trailPackRoutes = publicRefinedTrailPacks
      .map((pack) => trailPackToExpeditionOpportunity(pack))
      .filter(routePassesExploreMapLength)
      .filter(isExploreGuidanceReadyRoute)
      .filter(isPublicSuggestedTrailheadRoute);
    const ecsRouteIdeaRoutes = publicRefinedAIRoutes
      .filter(routePassesExploreMapLength)
      .filter(isExploreGuidanceReadyRoute);
    const currentSuggestedRouteIds = new Set(
      [...hiddenGemRoutes, ...trailPackRoutes, ...ecsRouteIdeaRoutes].map((route) =>
        String(route.id ?? '').trim(),
      ),
    );
    const favoriteRoutes = favoritesSnapshot.favorites
      .filter((favorite) => currentSuggestedRouteIds.has(String(favorite.sourceTrailId).trim()))
      .map((favorite) => favoriteTrailToExpeditionRoute(favorite))
      .filter(routePassesExploreMapLength)
      .filter(isExploreGuidanceReadyRoute);
    const total =
      hiddenGemRoutes.length +
      trailPackRoutes.length +
      favoriteRoutes.length +
      ecsRouteIdeaRoutes.length;
    recordExplorePerformancePhase(explorePerformanceRun, 'route_preview_render', {
      startedAtMs,
      endedAtMs: getExplorePerformanceNow(),
      metadata: {
        hiddenGems: hiddenGemRoutes.length,
        trailPacks: trailPackRoutes.length,
        favorites: favoriteRoutes.length,
        ecsIdeas: ecsRouteIdeaRoutes.length,
        total,
      },
    });

    return {
      hiddenGemRoutes,
      trailPackRoutes,
      favoriteRoutes,
      ecsRouteIdeaRoutes,
      counts: {
        hiddenGems: hiddenGemRoutes.length,
        trailPacks: trailPackRoutes.length,
        favorites: favoriteRoutes.length,
        ecsIdeas: ecsRouteIdeaRoutes.length,
        total,
      },
    };
  }, [
    exploreRefinement,
    explorePerformanceRun,
    favoritesSnapshot.favorites,
    hiddenGemExploreOrchestration.items,
    hiddenGemExploreOrchestration.routeMap,
    publicRefinedTrailPacks,
    publicRefinedAIRoutes,
  ]);

  const exploreMapPreviewRouteCounts = exploreMapPreviewRouteSets.counts;
  const exploreMapPreviewCategoryBadges = useMemo(
    () => [
      { key: 'hidden-gems', label: 'Hidden Gems', count: exploreMapPreviewRouteCounts.hiddenGems, color: TACTICAL.amber },
      { key: 'trail-packs', label: 'Trail Packs', count: exploreMapPreviewRouteCounts.trailPacks, color: TACTICAL.amber },
      { key: 'ecs-ideas', label: 'ECS Ideas', count: exploreMapPreviewRouteCounts.ecsIdeas, color: TACTICAL.amber },
      ...(exploreMapPreviewRouteCounts.favorites > 0
        ? [{ key: 'favorites', label: 'Favorites', count: exploreMapPreviewRouteCounts.favorites, color: TACTICAL.amber }]
        : []),
    ],
    [exploreMapPreviewRouteCounts],
  );

  const guidanceReadyRouteOptions = useMemo<ExpeditionOpportunity[]>(() => {
    return normalizeExploreDiscoveryItems([
      ...exploreMapPreviewRouteSets.trailPackRoutes.map((route) => ({ route, sourceKind: 'trail_pack' as const })),
      ...exploreMapPreviewRouteSets.hiddenGemRoutes.map((route) => ({ route, sourceKind: 'hidden_gem' as const })),
      ...exploreMapPreviewRouteSets.ecsRouteIdeaRoutes.map((route) => ({ route, sourceKind: 'ecs_idea' as const })),
      ...exploreMapPreviewRouteSets.favoriteRoutes.map((route) => ({ route, sourceKind: 'saved_built' as const })),
    ])
      .map(routeWithExploreDiscoveryProvenance)
      .filter((route) => (
        routePassesExploreMapLength(route) &&
        isExploreGuidanceReadyRoute(route) &&
        isPublicSuggestedTrailheadRoute(route)
      ));
  }, [exploreMapPreviewRouteSets]);
  const exploreSuggestedRouteOptions = guidanceReadyRouteOptions;
  const publicSuggestedTrailheadRoutes = exploreSuggestedRouteOptions;

  const exploreMapHandoffBuild = useMemo(() => {
    const startedAtMs = getExplorePerformanceNow();
    const result = buildExploreRouteOverlaySegmentsFromRoutes({
      hiddenGemRoutes: exploreMapPreviewRouteSets.hiddenGemRoutes,
      trailPackRoutes: exploreMapPreviewRouteSets.trailPackRoutes,
      favoriteRoutes: exploreMapPreviewRouteSets.favoriteRoutes,
      ecsRouteIdeaRoutes: exploreMapPreviewRouteSets.ecsRouteIdeaRoutes,
      compatibilityResults: compatResults,
      maxRenderedRoutes: Math.max(EXPLORE_MAP_HANDOFF_MAX_ROUTES, exploreMapPreviewRouteCounts.total),
    });
    recordExplorePerformancePhase(explorePerformanceRun, 'map_render', {
      startedAtMs,
      endedAtMs: getExplorePerformanceNow(),
      metadata: {
        candidateCount: result.candidateCount,
        renderedSegments: result.segments.length,
        skippedMissingGeometryCount: result.skippedMissingGeometryCount,
        cappedCount: result.cappedCount,
      },
    });
    recordExplorePerformanceCount(explorePerformanceRun, {
      mapFeaturesRendered: result.segments.length,
      previewRoutesRendered: exploreMapPreviewRouteCounts.total,
    });
    return result;
  }, [compatResults, exploreMapPreviewRouteCounts.total, exploreMapPreviewRouteSets, explorePerformanceRun]);

  const exploreMapHandoffCategories = useMemo<ExploreRouteOverlayCategory[]>(() => {
    const categories = new Set<ExploreRouteOverlayCategory>();
    exploreMapHandoffBuild.segments.forEach((segment) => categories.add(segment.category));
    return Array.from(categories);
  }, [exploreMapHandoffBuild.segments]);

  useEffect(() => {
    if (!exploreFilterHydrated) return;
    void saveExploreFilterStateSnapshot({
      radiusMiles: distanceRadius,
      refinement: exploreRefinement,
      activeCategoryPanel: activeExplorerCategoryPanel,
      resultSetSummary: {
        displayedRouteCount: exploreMapHandoffBuild.segments.length,
        candidateCount: exploreMapHandoffBuild.candidateCount,
        skippedMissingGeometryCount: exploreMapHandoffBuild.skippedMissingGeometryCount,
        cappedCount: exploreMapHandoffBuild.cappedCount,
      },
    });
  }, [
    activeExplorerCategoryPanel,
    distanceRadius,
    exploreFilterHydrated,
    exploreMapHandoffBuild.candidateCount,
    exploreMapHandoffBuild.cappedCount,
    exploreMapHandoffBuild.segments.length,
    exploreMapHandoffBuild.skippedMissingGeometryCount,
    exploreRefinement,
  ]);

  useEffect(() => {
    if (!exploreFilterHydrated) return;
    saveExplorePlanningRouteContext({
      routes: publicSuggestedTrailheadRoutes as any,
      radiusMiles: activeDistanceRadius,
      refinementLabel: selectedExploreRefinementLabel,
      source: 'suggested_routes',
    });
  }, [
    activeDistanceRadius,
    exploreFilterHydrated,
    publicSuggestedTrailheadRoutes,
    selectedExploreRefinementLabel,
  ]);

  const handleShowFilteredRoutesOnMap = useCallback(async () => {
    hapticMicro();
    setExploreMapHandoffNotice(null);

    if (exploreMapHandoffBuild.segments.length === 0) {
      setExploreMapHandoffNotice(
        exploreMapHandoffBuild.candidateCount > 0
          ? `${exploreMapHandoffBuild.candidateCount} filtered route${exploreMapHandoffBuild.candidateCount === 1 ? '' : 's'} matched, but none include enough coordinates for a map preview yet.`
          : 'No Suggested Trailheads match the current filters yet.',
      );
      return;
    }

    const label = selectedExploreRefinementLabel
      ? `Filtered routes - ${distanceRadiusFooterLabel} / ${selectedExploreRefinementLabel}`
      : `Filtered routes - ${distanceRadiusFooterLabel}`;

    await clearNavigationHandoffPayload();
    await saveExploreFilterStateSnapshot({
      radiusMiles: distanceRadius,
      refinement: exploreRefinement,
      activeCategoryPanel: activeExplorerCategoryPanel,
      resultSetSummary: {
        displayedRouteCount: exploreMapHandoffBuild.segments.length,
        candidateCount: exploreMapHandoffBuild.candidateCount,
        skippedMissingGeometryCount: exploreMapHandoffBuild.skippedMissingGeometryCount,
        cappedCount: exploreMapHandoffBuild.cappedCount,
      },
    });
    await saveExploreRoutesMapHandoff({
      label,
      radiusMiles: activeDistanceRadius,
      refinementLabel: selectedExploreRefinementLabel,
      categories: exploreMapHandoffCategories,
      segments: exploreMapHandoffBuild.segments,
      candidateCount: exploreMapHandoffBuild.candidateCount,
      skippedMissingGeometryCount: exploreMapHandoffBuild.skippedMissingGeometryCount,
      cappedCount: exploreMapHandoffBuild.cappedCount,
    });
    await stageNavigationFlow({
      source: 'explore',
      target: 'navigate',
      intent: 'route_preview',
      label: 'Filtered Route Map',
      message: 'Filtered Suggested Trailhead routes are displayed on the Navigate map.',
      context: {
        exploreAction: 'show_filtered_routes_on_map',
        radiusMiles: activeDistanceRadius,
        refinementLabel: selectedExploreRefinementLabel,
        displayedRouteCount: exploreMapHandoffBuild.segments.length,
        candidateCount: exploreMapHandoffBuild.candidateCount,
        skippedMissingGeometryCount: exploreMapHandoffBuild.skippedMissingGeometryCount,
        cappedCount: exploreMapHandoffBuild.cappedCount,
      },
    });
        pushSingleFlight('/navigate');
  }, [
    activeDistanceRadius,
    activeExplorerCategoryPanel,
    distanceRadiusFooterLabel,
    distanceRadius,
    exploreMapHandoffBuild.candidateCount,
    exploreMapHandoffBuild.cappedCount,
    exploreMapHandoffBuild.segments,
    exploreMapHandoffBuild.skippedMissingGeometryCount,
    exploreMapHandoffCategories,
    exploreRefinement,
    pushSingleFlight,
    selectedExploreRefinementLabel,
  ]);

  const hiddenGemSummary = useMemo(() => {
    const orchestrationNote = hiddenGemExploreOrchestration.summaryNote;
    const fallbackNotice = hiddenGemDiagnostics.criteriaExpanded ? hiddenGemDiagnostics.uiNotice : null;
    if (hiddenGemPage.eligibleCount === 0) {
      const base =
        hiddenGemDiagnostics.rawCandidateCount === 0
          ? `No routes were available to evaluate as Hidden Gems inside ${exploreFilterNarrative}.`
          : `Routes were loaded inside ${exploreFilterNarrative}, but none qualified as exploratory off-road candidates after the radius, refinement, drivable-access, popularity, entry validation, length, seasonal fit, and rig checks.`;
      const withFallback = fallbackNotice ? `${base} ${fallbackNotice}` : base;
      return orchestrationNote ? `${withFallback} ${orchestrationNote}` : withFallback;
    }
    const filteredCount = Math.max(hiddenGemPage.totalCandidates - hiddenGemPage.eligibleCount, 0);
    if (filteredCount > 0) {
      const base = `${hiddenGemPage.eligibleCount} exploratory off-road routes qualified inside ${exploreFilterNarrative}. ${filteredCount} routes were held back for popularity, trail type, entry validation, length, seasonal fit, or rig mismatch.`;
      const withFallback = fallbackNotice ? `${base} ${fallbackNotice}` : base;
      return orchestrationNote ? `${withFallback} ${orchestrationNote}` : withFallback;
    }
    const base = `${hiddenGemPage.eligibleCount} exploratory off-road routes qualified inside ${exploreFilterNarrative}.`;
    const withFallback = fallbackNotice ? `${base} ${fallbackNotice}` : base;
    return orchestrationNote ? `${withFallback} ${orchestrationNote}` : withFallback;
  }, [
    hiddenGemPage.eligibleCount,
    hiddenGemPage.totalCandidates,
    exploreFilterNarrative,
    hiddenGemDiagnostics.rawCandidateCount,
    hiddenGemDiagnostics.criteriaExpanded,
    hiddenGemDiagnostics.uiNotice,
    hiddenGemExploreOrchestration.summaryNote,
  ]);

  const aiRouteIdeaPage = useMemo(() => {
    const pageSize = AI_ROUTE_IDEA_PAGE_SIZE;
    const eligibleCount = publicRefinedAIRoutes.length;
    const totalPages = Math.max(1, Math.ceil(eligibleCount / pageSize));
    const normalizedPageIndex = eligibleCount === 0
      ? 0
      : ((aiRouteIdeaPageIndex % totalPages) + totalPages) % totalPages;
    const offset = normalizedPageIndex * pageSize;
    const items = publicRefinedAIRoutes.slice(offset, offset + pageSize);

    return {
      items,
      eligibleCount,
      pageIndex: normalizedPageIndex,
      pageSize,
      totalPages,
      offset,
      nextPageIndex: items.length === 0 ? 0 : (normalizedPageIndex + 1) % totalPages,
    };
  }, [aiRouteIdeaPageIndex, publicRefinedAIRoutes]);
  const visibleAIRoutes = aiRouteIdeaPage.items;
  const routeCatalogSummaryPage = useMemo(
    () =>
      paginateRouteCatalogSummaries(routeCatalogRuntimeContract.summaries, {
        pageIndex: trailPackPageIndex,
        pageSize: TRAIL_PACK_PAGE_SIZE,
      }),
    [routeCatalogRuntimeContract.summaries, trailPackPageIndex],
  );
  const visibleRouteCatalogSummaries = routeCatalogSummaryPage.items;
  useEffect(() => {
    recordExploreInitialRender(exploreNavigateSeparationRunRef.current, {
      startedAtMs: exploreNavigateSeparationRunRef.current.startedAtMs,
      endedAtMs: getExplorePerformanceNow(),
      summaryCount: routeCatalogRuntimeContract.summaries.length,
      catalogFilesFetched: routeCatalogHasSearchArea ? 1 : 0,
      fullGeometryFetches: 0,
      fullGeometryParsed: false,
      mvumModulesMounted: false,
    });
  }, [
    routeCatalogHasSearchArea,
    routeCatalogRuntimeContract.summaries.length,
    visibleRouteCatalogSummaries.length,
  ]);
  const trailPackPage = useMemo(
    () => ({
      items: visibleRouteCatalogSummaries,
      eligibleCount: routeCatalogSummaryPage.totalItems,
      pageIndex: routeCatalogSummaryPage.pageIndex,
      pageSize: routeCatalogSummaryPage.pageSize,
      totalPages: routeCatalogSummaryPage.totalPages,
      offset: routeCatalogSummaryPage.pageIndex * routeCatalogSummaryPage.pageSize,
    }),
    [routeCatalogSummaryPage, visibleRouteCatalogSummaries],
  );
  const hiddenGemPageCount = hiddenGemPage.totalPages;
  const trailPackPageCount = trailPackPage.totalPages;
  const aiRouteIdeaPageCount = aiRouteIdeaPage.totalPages;
  const visibleHiddenGemRoutes = enrichedHiddenGemRoutes;
  const hiddenGemThumbnailAssignments = useMemo(
    () => getExploreRouteThumbnailAssignments(visibleHiddenGemRoutes, 'hiddenGems'),
    [visibleHiddenGemRoutes],
  );
  const knownRouteThumbnailAssignments = useMemo(
    () => getExploreRouteThumbnailAssignments(enrichedKnown, 'knownRoutes'),
    [enrichedKnown],
  );
  const aiRouteThumbnailAssignments = useMemo(
    () => getExploreRouteThumbnailAssignments(visibleAIRoutes, 'ecsRouteIdeas'),
    [visibleAIRoutes],
  );
  const hiddenGemWindowStart = hiddenGemPage.eligibleCount === 0 ? 0 : hiddenGemPage.offset + 1;
  const hiddenGemWindowEnd = Math.min(hiddenGemPage.offset + hiddenGemPage.items.length, hiddenGemPage.eligibleCount);
  const trailPackWindowStart = trailPackPage.eligibleCount === 0 ? 0 : trailPackPage.offset + 1;
  const trailPackWindowEnd = Math.min(
    trailPackPage.offset + trailPackPage.items.length,
    trailPackPage.eligibleCount,
  );
  const aiRouteIdeaWindowStart = aiRouteIdeaPage.eligibleCount === 0 ? 0 : aiRouteIdeaPage.offset + 1;
  const aiRouteIdeaWindowEnd = Math.min(
    aiRouteIdeaPage.offset + aiRouteIdeaPage.items.length,
    aiRouteIdeaPage.eligibleCount,
  );
  const vehicleProfileSignature = useMemo(
    () =>
      vehicleProfile
        ? [
            vehicleProfile.vehicleId,
            vehicleProfile.vehicleType,
            vehicleProfile.tireSizeInches,
            vehicleProfile.suspensionLiftInches,
            vehicleProfile.fuel_range_miles,
          ].join('|')
        : 'no-vehicle',
    [vehicleProfile],
  );
  const activeTabRouteSignature = useMemo(
    () => refinedCanonicalRoutes.map((route) => route.id).join('|'),
    [refinedCanonicalRoutes],
  );

  useEffect(() => {
    setHiddenGemPageIndex(0);
    setTrailPackPageIndex(0);
    setAiRouteIdeaPageIndex(0);
    setFavoritesPageIndex(0);
    setExploreGuidanceReadyVisibleLimit(EXPLORE_GUIDANCE_READY_FAST_PAINT_COUNT);
    setHiddenGemCycleNotice(null);
    setExploreMapHandoffNotice(null);
  }, [distanceRadius, exploreRefinement, vehicleProfileSignature, activeTabRouteSignature]);

  useEffect(() => {
    if (!__DEV__) return;
    const nextSignature = JSON.stringify(hiddenGemDiagnostics);
    if (lastHiddenGemDiagnosticsSignatureRef.current === nextSignature) return;
    lastHiddenGemDiagnosticsSignatureRef.current = nextSignature;
    ecsLog.debug('DISCOVERY', `${TAG} Hidden Gems orchestration`, hiddenGemDiagnostics);
  }, [hiddenGemDiagnostics]);

  useEffect(() => {
    if (!__DEV__) return;
    const nextSignature = JSON.stringify(exploreSourceDiagnostics);
    if (lastExploreSourceDiagnosticsSignatureRef.current === nextSignature) return;
    lastExploreSourceDiagnosticsSignatureRef.current = nextSignature;
    ecsLog.debug('DISCOVERY', `${TAG} Explore source diagnostics`, exploreSourceDiagnostics);
  }, [exploreSourceDiagnostics]);

  useEffect(() => {
    if (!isLoading) {
      setHasLoadedExplorer(true);
    }
  }, [isLoading]);

  const handleAdvanceHiddenGems = useCallback(() => {
    hapticMicro();
    if (hiddenGemPage.totalPages <= 1) {
      setHiddenGemCycleNotice('All qualifying gems in this radius are already on screen.');
      return;
    }
    if (hiddenGemPage.pageIndex + 1 >= hiddenGemPage.totalPages) {
      setHiddenGemCycleNotice('All qualifying gems in this radius have been viewed. Cycling back through the ranked set.');
    } else {
      setHiddenGemCycleNotice(null);
    }
    setHiddenGemPageIndex(hiddenGemPage.nextPageIndex);
  }, [hiddenGemPage.nextPageIndex, hiddenGemPage.pageIndex, hiddenGemPage.totalPages]);

  const handleAdvanceAIRouteIdeas = useCallback(() => {
    hapticMicro();
    if (aiRouteIdeaPage.totalPages <= 1) return;
    setAiRouteIdeaPageIndex(aiRouteIdeaPage.nextPageIndex);
  }, [aiRouteIdeaPage.nextPageIndex, aiRouteIdeaPage.totalPages]);

  const enrichedAI = useMemo<EnrichedDiscoveryRoute[]>(() => {
    if (refinedAIRoutes.length === 0) return [];
    return enrichAIRoutes(refinedAIRoutes, vehicleProfile);
  }, [refinedAIRoutes, vehicleProfile]);

  // Record shown routes for diversity rotation
  useEffect(() => {
    const ids = [...enrichedKnown.map(r => r.id), ...enrichedAI.map(r => r.id)];
    if (ids.length > 0) recordShownRoutes(ids);
  }, [enrichedKnown, enrichedAI]);

  // Build enriched AI route map for quick lookup
  const enrichedAIMap = useMemo(() => {
    const map = new Map<string, EnrichedDiscoveryRoute>();
    enrichedAI.forEach(r => map.set(r.id, r));
    return map;
  }, [enrichedAI]);

  const totalRouteCount = refinedCanonicalRoutes.length + refinedAIRoutes.length;
  const hasDiscoveryOverrides = distanceRadius !== DEFAULT_DISTANCE_RADIUS || exploreRefinement != null;
  const favoriteTrails = favoritesSnapshot.favorites;
  const favoritePlans = favoritesSnapshot.plans;
  const filteredExploreRouteIds = useMemo(() => {
    const ids = new Set<string>();
    refinedCanonicalRoutes.forEach((route) => ids.add(String(route.id)));
    refinedAIRoutes.forEach((route) => ids.add(String(route.id)));
    return ids;
  }, [refinedAIRoutes, refinedCanonicalRoutes]);
  const filteredFavoriteTrails = useMemo(() => {
    if (filteredExploreRouteIds.size === 0) return [] as FavoriteTrailRecord[];
    return favoriteTrails.filter((favorite) => filteredExploreRouteIds.has(favorite.sourceTrailId));
  }, [favoriteTrails, filteredExploreRouteIds]);
  const filteredFavoritePlans = useMemo(() => {
    if (filteredExploreRouteIds.size === 0) return [] as FavoriteTrailPlan[];
    return favoritePlans.filter((plan) =>
      plan.items.some((item) => filteredExploreRouteIds.has(item.sourceTrailId)),
    );
  }, [favoritePlans, filteredExploreRouteIds]);
  const favoritesTotal = filteredFavoriteTrails.length + filteredFavoritePlans.length;
  const latestFavoriteTrail = favoriteTrails[0] ?? null;
  const latestFavoritePlan = favoritePlans[0] ?? null;
  const favoritesSummaryText = latestFavoriteTrail
    ? latestFavoriteTrail.subtitle ?? 'Most recently saved trail'
    : latestFavoritePlan
      ? `${latestFavoritePlan.items.length} stop${latestFavoritePlan.items.length !== 1 ? 's' : ''} saved for review`
      : 'Save trails from Hidden Gems, Trail Packs, or ECS Route Ideas to reopen them later.';
  const favoriteTrailViewportHeight = useMemo(() => {
    if (favoriteTrails.length <= FAVORITES_VISIBLE_LIMIT) return undefined;
    return 412;
  }, [favoriteTrails.length]);
  const favoritePlanViewportHeight = useMemo(() => {
    if (favoritePlans.length <= FAVORITES_VISIBLE_LIMIT) return undefined;
    return 404;
  }, [favoritePlans.length]);
  const favoriteTrailIds = useMemo(
    () => new Set(favoriteTrails.map((favorite) => favorite.sourceTrailId)),
    [favoriteTrails],
  );
  const exploreWizardLocalRouteAssets = useMemo(() => {
    void localRouteAssetRevision;
    const routes = routeStore.getAll();
    const linkedRunIds = new Set(
      routes
        .map((route) => route.linked_run_id)
        .filter((runId): runId is string => typeof runId === 'string' && runId.length > 0),
    );
    const savedBuiltRoutes: ExpeditionOpportunity[] = [];
    const importedStitchedRoutes: ExpeditionOpportunity[] = [];

    routes.forEach((route) => {
      const opportunity = importedRouteToExploreWizardRoute(route);
      if (!opportunity) return;
      if (route.source_app === 'ecs_explore_save' || route.source_format === 'custom') {
        savedBuiltRoutes.push(opportunity);
      } else {
        importedStitchedRoutes.push(opportunity);
      }
    });

    runStore.getAll().forEach((run) => {
      if (linkedRunIds.has(run.id)) return;
      const opportunity = runToExploreWizardRoute(run);
      if (opportunity) importedStitchedRoutes.push(opportunity);
    });

    return {
      savedBuiltRoutes,
      importedStitchedRoutes,
    };
  }, [localRouteAssetRevision]);
  const radiusFilteredExploreWizardSavedBuiltRoutes = useMemo<ExpeditionOpportunity[]>(
    () =>
      filterByRadius(
        computeDistancesFromUser(exploreWizardLocalRouteAssets.savedBuiltRoutes, userLat, userLng),
        activeDistanceRadius,
      ),
    [
      activeDistanceRadius,
      exploreWizardLocalRouteAssets.savedBuiltRoutes,
      userLat,
      userLng,
    ],
  );
  const radiusFilteredExploreWizardImportedStitchedRoutes = useMemo<ExpeditionOpportunity[]>(
    () =>
      filterByRadius(
        computeDistancesFromUser(exploreWizardLocalRouteAssets.importedStitchedRoutes, userLat, userLng),
        activeDistanceRadius,
      ),
    [
      activeDistanceRadius,
      exploreWizardLocalRouteAssets.importedStitchedRoutes,
      userLat,
      userLng,
    ],
  );
  const exploreWizardTrailPackSourceRoutes = useMemo(
    () => publicDiscoverableTrailPacks.map((trailPack) => trailPackToExpeditionOpportunity(trailPack)),
    [publicDiscoverableTrailPacks],
  );
  const exploreWizardRangeOnlyHiddenGemSourceRoutes = useMemo<ExpeditionOpportunity[]>(
    () => {
      if (canonicalRadiusFilteredRoutes.length === 0) return [];
      try {
        return getHiddenGemRecommendations(
          canonicalRadiusFilteredRoutes,
          compatResults,
          {
            radiusMiles: distanceRadius ?? DISTANCE_RADIUS_OPTIONS[DISTANCE_RADIUS_OPTIONS.length - 1],
            pageIndex: 0,
            pageSize: HIDDEN_GEMS_MAX_RESULTS_RENDERED,
            vehicleProfile,
            expeditionPhase: aiState?.expeditionPhase ?? null,
            operationalState: aiState?.operationalState ?? null,
            recommendationStatus: liveStatus?.recommendations ?? null,
          },
        ).items.map((item) => item.route as ExpeditionOpportunity);
      } catch (error) {
        if (__DEV__) {
          ecsLog.debug('DISCOVERY', `${TAG} Range-only Hidden Gem inventory unavailable`, {
            error: error instanceof Error ? error.message : String(error),
          });
        }
        return [];
      }
    },
    [
      canonicalRadiusFilteredRoutes,
      compatResults,
      distanceRadius,
      vehicleProfile,
      aiState?.expeditionPhase,
      aiState?.operationalState,
      liveStatus?.recommendations,
    ],
  );
  const exploreWizardEcsIdeaSourceRoutes = useMemo(
    () => radiusFilteredAIRoutes.filter(isPublicSuggestedTrailheadRoute),
    [radiusFilteredAIRoutes],
  );
  const radiusFilteredExploreWizardFavoriteRoutes = useMemo<ExpeditionOpportunity[]>(
    () =>
      filterByRadius(
        computeDistancesFromUser(
          favoriteTrails.map((favorite) => favoriteTrailToExpeditionRoute(favorite)),
          userLat,
          userLng,
        ),
        activeDistanceRadius,
      ),
    [
      activeDistanceRadius,
      favoriteTrails,
      userLat,
      userLng,
    ],
  );
  const exploreGuidanceReadyInventory = useMemo(
    () => {
      const startedAtMs = getExplorePerformanceNow();
      const inventory = buildExploreGuidanceReadyInventory({
        trailPacks: exploreWizardTrailPackSourceRoutes,
        hiddenGemRoutes: exploreWizardRangeOnlyHiddenGemSourceRoutes,
        ecsRouteIdeas: exploreWizardEcsIdeaSourceRoutes,
        favoriteRoutes: [
          ...radiusFilteredExploreWizardFavoriteRoutes,
          ...radiusFilteredExploreWizardSavedBuiltRoutes,
        ],
        savedRouteAssets: radiusFilteredExploreWizardImportedStitchedRoutes,
        selectedRefinement: exploreRefinement,
      });
      recordExplorePerformancePhase(explorePerformanceRun, 'geometry_normalization', {
        startedAtMs,
        endedAtMs: getExplorePerformanceNow(),
        metadata: {
          totalReadyCount: inventory.totalReadyCount,
          readyCount: inventory.readyCount,
          hiddenTotal: inventory.hiddenTotal,
          candidateCount: inventory.candidateSet.candidates.length,
        },
      });
      return inventory;
    },
    [
      explorePerformanceRun,
      radiusFilteredExploreWizardFavoriteRoutes,
      exploreWizardRangeOnlyHiddenGemSourceRoutes,
      exploreWizardEcsIdeaSourceRoutes,
      radiusFilteredExploreWizardImportedStitchedRoutes,
      radiusFilteredExploreWizardSavedBuiltRoutes,
      exploreWizardTrailPackSourceRoutes,
      exploreRefinement,
    ],
  );
  const exploreWizardCandidateSet = exploreGuidanceReadyInventory.candidateSet;
  const exploreWizardSourceCounts = exploreGuidanceReadyInventory.sourceCounts;
  const hasSelectedExploreRefinement = exploreRefinement != null;
  const routeCatalogPreviewGeometryReady =
    routeCatalogPreviewGeometryRequested &&
    liveTrailPackCatalogSnapshot.status === 'ready' &&
    liveTrailPackCatalogSnapshot.refreshKey === routeCatalogSearchRefreshKey;
  const showGuidanceReadyGeometryLoading =
    hasSelectedExploreRefinement &&
    routeCatalogHasSearchArea &&
    routeCatalogPreviewGeometryRequested &&
    !routeCatalogPreviewGeometryReady &&
    liveTrailPackCatalogSnapshot.status !== 'error';
  const showRefinementEmptyState =
    hasSelectedExploreRefinement &&
    !showGuidanceReadyGeometryLoading &&
    exploreGuidanceReadyInventory.totalReadyCount > 0 &&
    exploreGuidanceReadyInventory.readyCount === 0;
  const showGuidanceReadyRefinementPrompt =
    !hasSelectedExploreRefinement && exploreGuidanceReadyInventory.totalReadyCount > 0;
  const visibleExploreWizardCandidates = useMemo(
    () => {
      if (!hasSelectedExploreRefinement) return [];
      return exploreWizardSourceFilter === 'all'
        ? exploreWizardCandidateSet.candidates
        : exploreWizardCandidateSet.candidates.filter((candidate) => candidate.sourceKind === exploreWizardSourceFilter);
    },
    [exploreWizardCandidateSet.candidates, exploreWizardSourceFilter, hasSelectedExploreRefinement],
  );
  const visibleExploreWizardCardCandidates = useMemo(
    () => visibleExploreWizardCandidates.slice(0, exploreGuidanceReadyVisibleLimit),
    [exploreGuidanceReadyVisibleLimit, visibleExploreWizardCandidates],
  );
  const handleExploreWizardThumbnailLoadDuration = useCallback((
    durationMs: number,
    metadata: Record<string, unknown>,
  ) => {
    const run = explorePerformanceRunRef.current;
    const nowMs = getExplorePerformanceNow();
    const safeDurationMs = Math.max(0, Number.isFinite(durationMs) ? durationMs : 0);
    const routeId = typeof metadata.routeId === 'string' ? metadata.routeId : null;
    const status = typeof metadata.status === 'string' ? metadata.status : null;
    const source = typeof metadata.uriState === 'string' ? metadata.uriState : null;
    const aggregate =
      explorePerformanceImageFetchCacheRef.current?.runId === run.runId
        ? explorePerformanceImageFetchCacheRef.current
        : {
            runId: run.runId,
            startedAtMs: Math.max(run.startedAtMs, nowMs - safeDurationMs),
            endedAtMs: nowMs,
            count: 0,
            failures: 0,
            slowestMs: 0,
            routeIds: [],
            lastStatus: null,
            lastSource: null,
          };

    aggregate.startedAtMs = Math.min(aggregate.startedAtMs, Math.max(run.startedAtMs, nowMs - safeDurationMs));
    aggregate.endedAtMs = Math.max(aggregate.endedAtMs, nowMs);
    aggregate.count += 1;
    aggregate.failures += status === 'error' ? 1 : 0;
    aggregate.slowestMs = Math.max(aggregate.slowestMs, safeDurationMs);
    aggregate.lastStatus = status;
    aggregate.lastSource = source;
    if (routeId && !aggregate.routeIds.includes(routeId)) {
      aggregate.routeIds = aggregate.routeIds.length >= 8
        ? [...aggregate.routeIds.slice(1), routeId]
        : [...aggregate.routeIds, routeId];
    }
    explorePerformanceImageFetchCacheRef.current = aggregate;

    recordExplorePerformancePhase(run, 'image_fetch_cache', {
      startedAtMs: aggregate.startedAtMs,
      endedAtMs: aggregate.endedAtMs,
      metadata: {
        imagesRequested: aggregate.count,
        failures: aggregate.failures,
        slowestImageMs: Math.round(aggregate.slowestMs),
        lastStatus: aggregate.lastStatus,
        lastSource: aggregate.lastSource,
        sampledRouteIds: aggregate.routeIds,
        visibleRoutes: visibleExploreWizardCardCandidates.length,
      },
    });
    recordExplorePerformanceCount(run, {
      imagesRequested: aggregate.count,
      routesRendered: visibleExploreWizardCardCandidates.length,
    });
  }, [visibleExploreWizardCardCandidates.length]);
  const hasMoreExploreWizardCandidates =
    visibleExploreWizardCardCandidates.length < visibleExploreWizardCandidates.length;
  const exploreWizardCandidateKeyExtractor = useCallback(
    (candidate: ExploreWizardRouteCandidate) => `${candidate.sourceKind}:${candidate.id}`,
    [],
  );
  const renderExploreWizardCandidateCard = useCallback(
    ({ item, index }: ListRenderItemInfo<ExploreWizardRouteCandidate>) => (
      <ExploreWizardRouteCardListItem
        candidate={item}
        routeCardWidth={routeCardWidth}
        isSaved={favoriteTrailIds.has(String(item.route.id)) || favoriteTrailIds.has(item.id)}
        deferThumbnail={index >= EXPLORE_ROUTE_CARD_DEFERRED_THUMBNAIL_INDEX}
        deferEnrichment={index >= EXPLORE_ROUTE_CARD_DEFERRED_THUMBNAIL_INDEX}
        onPreviewCandidate={handlePreviewExploreWizardCandidate}
        onStartCandidate={handleStartExploreWizardCandidate}
        onSaveCandidate={handleSaveExploreWizardCandidate}
        onBuildTripCandidate={handleBuildTripFromExploreWizardCandidate}
        onThumbnailLoadDuration={handleExploreWizardThumbnailLoadDuration}
      />
    ),
    [
      favoriteTrailIds,
      handleBuildTripFromExploreWizardCandidate,
      handleExploreWizardThumbnailLoadDuration,
      handlePreviewExploreWizardCandidate,
      handleSaveExploreWizardCandidate,
      handleStartExploreWizardCandidate,
      routeCardWidth,
    ],
  );
  const exploreWizardRouteListFooter = useMemo(
    () => (hasMoreExploreWizardCandidates ? (
      <ExploreWizardRouteListSkeletonFooter columns={exploreRouteGridColumns} />
    ) : null),
    [exploreRouteGridColumns, hasMoreExploreWizardCandidates],
  );
  const favoriteTrailMap = useMemo(() => {
    const map = new Map<string, FavoriteTrailRecord>();
    favoriteTrails.forEach((favorite) => {
      map.set(favorite.favoriteId, favorite);
    });
    return map;
  }, [favoriteTrails]);
  const selectedPlanFavorites = useMemo(
    () =>
      selectedPlanFavoriteIds
        .map((favoriteId) => favoriteTrailMap.get(favoriteId) ?? null)
        .filter((favorite): favorite is FavoriteTrailRecord => !!favorite),
    [favoriteTrailMap, selectedPlanFavoriteIds],
  );

  useEffect(() => {
    setSelectedPlanFavoriteIds((current) => {
      const validIds = current.filter((favoriteId) => favoriteTrailMap.has(favoriteId));
      return validIds.length === current.length ? current : validIds;
    });
  }, [favoriteTrailMap]);

  useEffect(() => {
    setFavoritesPageIndex(0);
  }, [favoritesView, filteredFavoriteTrails.length, filteredFavoritePlans.length]);

  const handleToggleFavorite = useCallback((route: ExpeditionOpportunity) => {
    void toggleFavoriteTrail(route);
  }, []);

  const handlePreviewRouteCatalogSummary = useCallback((routeId: string) => {
    const summary = routeCatalogSummaryById.get(routeId) ?? null;
    if (!summary) return;
    hapticMicro();
    const requestId = trailPackPreviewRequestRef.current + 1;
    trailPackPreviewRequestRef.current = requestId;
    setTrailPackPreview(routeCatalogSummaryToTrailPackPreview(summary));
    setTrailPackPreviewDetailStatus('loading');
    setTrailPackPreviewDetailError(null);

    const detailStartedAtMs = getExplorePerformanceNow();
    void fetchRouteCatalogTrailPackDetail(routeId)
      .then((detail) => {
        recordExploreRouteDetailFetch(exploreNavigateSeparationRunRef.current, {
          startedAtMs: detailStartedAtMs,
          endedAtMs: getExplorePerformanceNow(),
          routeId,
          detailFetches: 1,
          requestedRouteIds: [routeId],
        });
        if (!mountedRef.current || trailPackPreviewRequestRef.current !== requestId) return;
        setTrailPackPreview(detailTrailPackToDiscoveryItem(detail, summary));
        setTrailPackPreviewDetailStatus('ready');
      })
      .catch((error) => {
        recordExploreRouteDetailFetch(exploreNavigateSeparationRunRef.current, {
          startedAtMs: detailStartedAtMs,
          endedAtMs: getExplorePerformanceNow(),
          routeId,
          detailFetches: 1,
          requestedRouteIds: [routeId],
        });
        if (!mountedRef.current || trailPackPreviewRequestRef.current !== requestId) return;
        setTrailPackPreviewDetailStatus('error');
        setTrailPackPreviewDetailError(
          error instanceof Error ? error.message : 'Verified route detail unavailable.',
        );
        reportRecoverableFailure({
          severity: 'low',
          issueTitle: 'Route detail unavailable',
          ecsArea: 'explore',
          message: 'Route detail could not be loaded from the selected summary card.',
          signature: `route_catalog_summary_detail_unavailable:${routeId}`,
          metadata: { routeId: summary.routeId },
        });
      });
  }, [routeCatalogSummaryById]);

  const handleStartRouteCatalogSummaryGuidance = useCallback(async (routeId: string) => {
    const summary = routeCatalogSummaryById.get(routeId) ?? null;
    if (!summary) return;
    hapticMicro();
    try {
      const detail = await fetchRouteCatalogTrailPackDetail(routeId);
      await handleStartTrailPackGuidance(detailTrailPackToDiscoveryItem(detail, summary));
    } catch (error) {
      reportRecoverableFailure({
        severity: 'low',
        issueTitle: 'Route detail unavailable',
        ecsArea: 'explore',
        message: error instanceof Error ? error.message : 'Verified route detail unavailable.',
        signature: `route_catalog_summary_navigation_unavailable:${routeId}`,
        metadata: { routeId: summary.routeId },
      });
    }
  }, [handleStartTrailPackGuidance, routeCatalogSummaryById]);

  const handleSaveRouteCatalogSummary = useCallback(async (routeId: string) => {
    const summary = routeCatalogSummaryById.get(routeId) ?? null;
    if (!summary) return;
    hapticMicro();
    try {
      const detail = await fetchRouteCatalogTrailPackDetail(routeId);
      const discoveryItem = detailTrailPackToDiscoveryItem(detail, summary);
      addFavoriteTrail(trailPackToExpeditionOpportunity(discoveryItem));
      handleTrailPackFeedback(routeId, 'saved');
    } catch (error) {
      reportRecoverableFailure({
        severity: 'low',
        issueTitle: 'Route save unavailable',
        ecsArea: 'explore',
        message: error instanceof Error ? error.message : 'Verified route detail unavailable.',
        signature: `route_catalog_summary_save_unavailable:${routeId}`,
        metadata: { routeId: summary.routeId },
      });
    }
  }, [handleTrailPackFeedback, routeCatalogSummaryById]);

  const handleNavigateToFavorite = useCallback(
    async (favorite: FavoriteTrailRecord) => {
      hapticMicro();
      const confirmedPayload = await confirmRouteHandoffAgainstActiveGuidance(
        favorite.navigationPayload,
      );
      if (!confirmedPayload) return;

      await saveNavigationHandoffPayload(confirmedPayload);
      await stageNavigationFlow({
        source: 'explore',
        target: 'navigate',
        intent: 'route_preview',
        label: 'Trail Preview Ready',
        message: 'Saved trail is ready in Navigate for review and guidance.',
        context: {
          routeId: confirmedPayload.id,
          tripMode: confirmedPayload.tripMode,
        },
      });
        pushSingleFlight('/navigate');
    },
    [confirmRouteHandoffAgainstActiveGuidance, pushSingleFlight],
  );

  const handleOpenFavorite = useCallback(
    (favorite: FavoriteTrailRecord) => {
      const raw = favorite.navigationPayload.raw;
      if (raw && typeof raw === 'object') {
        handleSelectOpportunity(raw as ExpeditionOpportunity);
        return;
      }
      void handleNavigateToFavorite(favorite);
    },
    [handleNavigateToFavorite, handleSelectOpportunity],
  );

  const closePlanBuilder = useCallback(() => {
    setPlanBuilderVisible(false);
    setEditingPlanId(null);
    setSelectedPlanFavoriteIds([]);
    setFavoritesPlanMode(false);
  }, []);

  const exitFavoritesPlanMode = useCallback(() => {
    setFavoritesPlanMode(false);
    setSelectedPlanFavoriteIds([]);
  }, []);

  const handleOpenPlanBuilder = useCallback(
    (plan?: FavoriteTrailPlan) => {
      hapticMicro();
      setEditingPlanId(plan?.planId ?? null);
      if (plan) {
        const availableFavoriteIds = plan.orderedFavoriteIds.filter((favoriteId) =>
          favoriteTrailMap.has(favoriteId),
        );
        setSelectedPlanFavoriteIds(availableFavoriteIds);
        setFavoritesView('plans');
      } else {
        if (selectedPlanFavoriteIds.length < 2) return;
        setFavoritesView('trails');
      }
      setPlanBuilderVisible(true);
    },
    [favoriteTrailMap, selectedPlanFavoriteIds.length],
  );

  const handleTogglePlanFavorite = useCallback((favoriteId: string) => {
    hapticMicro();
    setSelectedPlanFavoriteIds((current) => {
      if (current.includes(favoriteId)) {
        return current.filter((entry) => entry !== favoriteId);
      }
      return [...current, favoriteId];
    });
  }, []);

  const handleMoveSelectedFavorite = useCallback((favoriteId: string, direction: -1 | 1) => {
    hapticMicro();
    setSelectedPlanFavoriteIds((current) => {
      const index = current.indexOf(favoriteId);
      const nextIndex = index + direction;
      if (index < 0 || nextIndex < 0 || nextIndex >= current.length) return current;
      const next = [...current];
      [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
      return next;
    });
  }, []);

  const handleSavePlan = useCallback(async () => {
    const plan = await upsertFavoriteTrailPlan({
      planId: editingPlanId,
      favoriteIds: selectedPlanFavoriteIds,
    });
    if (!plan) return;
    hapticMicro();
    setPlanBuilderVisible(false);
    setEditingPlanId(null);
    setSelectedPlanFavoriteIds([]);
    setFavoritesPlanMode(false);
  }, [editingPlanId, selectedPlanFavoriteIds]);

  const handleDeletePlan = useCallback((planId: string) => {
    const plan = favoritePlans.find((entry) => entry.planId === planId) ?? null;
    Alert.alert(
      'Delete saved route stack?',
      plan
        ? `Delete ${plan.title}? The saved routes remain available individually.`
        : 'Delete this route stack? The saved routes remain available individually.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            hapticMicro();
            void removeFavoriteTrailPlan(planId);
          },
        },
      ],
    );
  }, [favoritePlans]);

  const handleBeginCreatePlan = useCallback(() => {
    if (selectedPlanFavoriteIds.length < 2) return;
    handleOpenPlanBuilder();
  }, [handleOpenPlanBuilder, selectedPlanFavoriteIds.length]);

  const handleToggleFavoritesPlanMode = useCallback(() => {
    hapticMicro();
    setFavoritesView('trails');
    setFavoritesPlanMode((current) => {
      const next = !current;
      if (!next) {
        setSelectedPlanFavoriteIds([]);
      }
      return next;
    });
  }, []);

  const handleRemoveFavorite = useCallback((routeId: string) => {
    const favorite = favoriteTrails.find((entry) => entry.sourceTrailId === routeId) ?? null;
    Alert.alert(
      'Remove saved route?',
      favorite ? `Remove ${favorite.title} from saved routes?` : 'Remove this route from saved routes?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => {
            hapticMicro();
            void removeFavoriteTrailBySourceId(routeId);
            if (favorite) {
              setSelectedPlanFavoriteIds((current) =>
                current.filter((favoriteId) => favoriteId !== favorite.favoriteId),
              );
            }
          },
        },
      ],
    );
  }, [favoriteTrails]);

  const handleRemovePlanDraftItem = useCallback((favoriteId: string) => {
    hapticMicro();
    setSelectedPlanFavoriteIds((current) => current.filter((entry) => entry !== favoriteId));
  }, []);

  const showInitialLoading = isLoading && !hasLoadedExplorer && opportunities.length === 0;
  const showSectionLoading = isLoading && (hasLoadedExplorer || opportunities.length > 0);
  const showTrailPackSectionLoading =
    showSectionLoading ||
    (routeCatalogHasSearchArea && (
      liveTrailPackCatalogSnapshot.status === 'idle' ||
      liveTrailPackCatalogSnapshot.status === 'loading'
    ));
  const showTrailPackBlockingLoading = showTrailPackSectionLoading && visibleRouteCatalogSummaries.length === 0;
  const hasExploreRangeRouteData =
    radiusFilteredOpportunities.length > 0 ||
    liveTrailPackCatalogSnapshot.trailPacks.length > 0 ||
    routeCatalogRuntimeContract.summaries.length > 0;
  const exploreGuidanceReadyBlockedReasons = useMemo(
    () =>
      Array.from(
        new Set(
          exploreGuidanceReadyInventory.rangeHiddenReasons
            .map((entry) => String(entry.reason ?? '').trim())
            .filter(Boolean),
        ),
      ).slice(0, 2),
    [exploreGuidanceReadyInventory.rangeHiddenReasons],
  );
  const exploreGuidanceReadyBlockedReasonText =
    exploreGuidanceReadyBlockedReasons.length > 0
      ? `Primary blocker: ${exploreGuidanceReadyBlockedReasons.join(' / ')}`
      : 'Primary blocker: guidance geometry or production data is missing.';
  const showGuidanceReadyBlockedNotice =
    !showInitialLoading &&
    !showSectionLoading &&
    routeCatalogPreviewGeometryRequested &&
    !showGuidanceReadyGeometryLoading &&
    hasExploreRangeRouteData &&
    exploreGuidanceReadyInventory.totalReadyCount === 0;

  useEffect(() => {
    if (__DEV__ !== true) return;
    const renderedRouteCards =
      visibleExploreWizardCardCandidates.length +
      visibleRouteCatalogSummaries.length +
      visibleAIRoutes.length;
    const resultCount = Math.max(
      visibleExploreWizardCandidates.length ||
      0,
      publicSuggestedTrailheadRoutes.length,
      publicRefinedTrailPacks.length,
      publicRefinedAIRoutes.length,
    );
    if (renderedRouteCards <= 0 && resultCount <= 0) {
      if (
        !showInitialLoading &&
        !showSectionLoading &&
        !showTrailPackSectionLoading &&
        liveTrailPackCatalogSnapshot.status !== 'loading'
      ) {
        exploreFirstResultPerformance.end('completed', { resultCount: 0, resultState: 'empty_or_degraded' });
        exploreFullListPerformance.end('completed', { resultCount: 0, resultState: 'empty_or_degraded' });
      }
      return;
    }

    const nowMs = getExplorePerformanceNow();
    if (explorePerformanceFirstVisibleLoggedRef.current !== explorePerformanceRun.runId) {
      explorePerformanceFirstVisibleLoggedRef.current = explorePerformanceRun.runId;
      recordExplorePerformancePhase(explorePerformanceRun, 'card_render', {
        startedAtMs: nowMs,
        endedAtMs: nowMs,
        metadata: {
          renderedRouteCards,
          visibleGuidanceCards: visibleExploreWizardCardCandidates.length,
          visibleRouteCatalogSummaries: visibleRouteCatalogSummaries.length,
          visibleAIRoutes: visibleAIRoutes.length,
        },
      });
      markExplorePerformanceEvent(explorePerformanceRun, 'first_visible_result', nowMs, {
        renderedRouteCards,
        resultCount,
      });
      recordExplorePerformanceCount(explorePerformanceRun, {
        routesRendered: renderedRouteCards || resultCount,
      });
      exploreFirstResultPerformance.end('completed', { renderedRouteCards, resultCount });
      logExplorePerformanceDiagnostic(
        buildExplorePerformanceSummary(explorePerformanceRun, { completedAtMs: nowMs }),
        { logger: ecsLog },
      );
    }

    if (
      !showInitialLoading &&
      !showSectionLoading &&
      !showTrailPackSectionLoading &&
      liveTrailPackCatalogSnapshot.status !== 'loading' &&
      explorePerformanceFullListLoggedRef.current !== explorePerformanceRun.runId
    ) {
      explorePerformanceFullListLoggedRef.current = explorePerformanceRun.runId;
      markExplorePerformanceEvent(explorePerformanceRun, 'full_nearby_result_list', nowMs, {
        resultCount,
        renderedRouteCards,
        totalReadyCount: exploreGuidanceReadyInventory.totalReadyCount,
      });
      exploreFullListPerformance.end('completed', { renderedRouteCards, resultCount });
      logExplorePerformanceDiagnostic(
        buildExplorePerformanceSummary(explorePerformanceRun, { completedAtMs: nowMs }),
        { logger: ecsLog },
      );
    }
  }, [
    exploreGuidanceReadyInventory.totalReadyCount,
    exploreFirstResultPerformance,
    exploreFullListPerformance,
    explorePerformanceRun,
    liveTrailPackCatalogSnapshot.status,
    publicRefinedAIRoutes.length,
    publicRefinedTrailPacks.length,
    publicSuggestedTrailheadRoutes.length,
    showInitialLoading,
    showSectionLoading,
    showTrailPackSectionLoading,
    visibleAIRoutes.length,
    visibleExploreWizardCandidates.length,
    visibleExploreWizardCardCandidates.length,
    visibleRouteCatalogSummaries.length,
  ]);

  const favoriteTrailListScrollable = favoriteTrails.length > FAVORITES_VISIBLE_LIMIT;
  const favoritePlanListScrollable = favoritePlans.length > FAVORITES_VISIBLE_LIMIT;
  const activeFavoritePanelItems = favoritesView === 'trails' ? filteredFavoriteTrails : filteredFavoritePlans;
  const favoritePanelTotalPages = Math.max(
    1,
    Math.ceil(activeFavoritePanelItems.length / EXPLORE_CATEGORY_PAGE_SIZE),
  );
  const normalizedFavoritesPageIndex = activeFavoritePanelItems.length === 0
    ? 0
    : Math.min(favoritesPageIndex, favoritePanelTotalPages - 1);
  const favoritePanelOffset = normalizedFavoritesPageIndex * EXPLORE_CATEGORY_PAGE_SIZE;
  const pagedFavoriteTrails = useMemo(
    () =>
      favoritesView === 'trails'
        ? filteredFavoriteTrails.slice(favoritePanelOffset, favoritePanelOffset + EXPLORE_CATEGORY_PAGE_SIZE)
        : [],
    [favoritePanelOffset, favoritesView, filteredFavoriteTrails],
  );
  const pagedFavoritePlans = useMemo(
    () =>
      favoritesView === 'plans'
        ? filteredFavoritePlans.slice(favoritePanelOffset, favoritePanelOffset + EXPLORE_CATEGORY_PAGE_SIZE)
        : [],
    [favoritePanelOffset, favoritesView, filteredFavoritePlans],
  );
  const favoriteTrailThumbnailAssignments = useMemo(
    () =>
      getExploreRouteThumbnailAssignments(
        pagedFavoriteTrails.map((favorite) => ({
          id: favorite.sourceTrailId,
          name: favorite.title,
          region: favorite.subtitle ?? undefined,
          imageTag: favorite.imageTag ?? undefined,
          terrainType: favorite.trailCategory ?? undefined,
          description: favorite.summary ?? undefined,
          category: favorite.trailCategory ?? undefined,
        })),
        'favorites',
      ),
    [pagedFavoriteTrails],
  );
  const favoriteTrailCards = pagedFavoriteTrails.map((favorite) => {
    const isSelected = selectedPlanFavoriteIds.includes(favorite.favoriteId);
    const favoriteThumbnail = favoriteTrailThumbnailAssignments.get(String(favorite.sourceTrailId)) ?? null;
    return (
      <TouchableOpacity
        key={favorite.favoriteId}
        style={[
          s.favoriteCard,
          favoritesPlanMode && s.favoriteCardSelectable,
          isSelected && s.favoriteCardSelected,
        ]}
        activeOpacity={0.84}
        accessible={false}
        onPress={() =>
          favoritesPlanMode
            ? handleTogglePlanFavorite(favorite.favoriteId)
            : handleOpenFavorite(favorite)
        }
      >
        <View style={s.favoriteCardTopRow}>
          <TouchableOpacity
            style={s.favoriteCardCopy}
            activeOpacity={0.84}
            accessibilityRole="button"
            accessibilityLabel={favoritesPlanMode
              ? `${isSelected ? 'Remove' : 'Add'} saved route ${favorite.title} ${isSelected ? 'from' : 'to'} stack draft`
              : `Open saved route ${favorite.title}`}
            accessibilityHint={favoritesPlanMode
              ? 'Changes whether this route is included in the route stack draft'
              : 'Opens the saved route preview'}
            accessibilityState={{ selected: favoritesPlanMode ? isSelected : undefined }}
            onPress={(event) => {
              event.stopPropagation?.();
              if (favoritesPlanMode) {
                handleTogglePlanFavorite(favorite.favoriteId);
              } else {
                handleOpenFavorite(favorite);
              }
            }}
          >
            <Text style={s.favoriteCardTitle} numberOfLines={2} maxFontSizeMultiplier={1.6}>{favorite.title}</Text>
            <Text style={s.favoriteCardSubtitle} numberOfLines={2} maxFontSizeMultiplier={1.6}>
              {favorite.subtitle ?? 'Saved from Explore'}
            </Text>
          </TouchableOpacity>

          {favoritesPlanMode ? (
            <View style={s.favoriteSelectIndicator}>
              <Ionicons
                name={isSelected ? 'checkmark-circle' : 'ellipse-outline'}
                size={16}
                color={isSelected ? TACTICAL.amber : TACTICAL.textMuted}
              />
            </View>
          ) : (
            <TouchableOpacity
              style={s.favoriteRemoveBtn}
              activeOpacity={0.75}
              accessibilityRole="button"
              accessibilityLabel={`Remove ${favorite.title} from saved routes`}
              accessibilityHint="Opens a confirmation before removing this saved route"
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              onPress={(event) => {
                event.stopPropagation?.();
                handleRemoveFavorite(favorite.sourceTrailId);
              }}
            >
              <Ionicons name="star" size={12} color={TACTICAL.amber} />
            </TouchableOpacity>
          )}
        </View>

        {favoriteThumbnail?.uri ? (
          <View style={s.favoriteThumbnailFrame}>
            <Image
              source={{ uri: favoriteThumbnail.uri }}
              style={s.favoriteThumbnailImage}
              resizeMode="contain"
              accessibilityLabel={`${favorite.title} saved trail thumbnail`}
            />
            <View style={s.favoriteThumbnailScrim} />
            <View style={s.favoriteThumbnailBadge}>
              <Ionicons name="image-outline" size={9} color={TACTICAL.amber} />
              <Text style={s.favoriteThumbnailBadgeText}>SAVED TRAIL</Text>
            </View>
          </View>
        ) : null}

        <View style={s.favoriteMetaRow}>
          {favorite.tripMode ? (
            <View style={s.favoriteMetaBadge}>
              <Text style={s.favoriteMetaBadgeText}>{favorite.tripMode.toUpperCase()}</Text>
            </View>
          ) : null}
          {favorite.trailLengthMiles != null ? (
            <View style={s.favoriteMetaBadge}>
              <Text style={s.favoriteMetaBadgeText}>{favorite.trailLengthMiles} MI</Text>
            </View>
          ) : null}
          {favorite.trailCategory ? (
            <View style={s.favoriteMetaBadge}>
              <Text style={s.favoriteMetaBadgeText}>{favorite.trailCategory.toUpperCase()}</Text>
            </View>
          ) : null}
        </View>

        {!favoritesPlanMode ? (
          <View style={s.favoriteQuickRow}>
            <Text style={s.favoriteQuickHint}>Review saved route</Text>
            <View style={s.favoriteToolbarActions}>
              <TouchableOpacity
                style={s.favoriteQuickNavigateBtn}
                activeOpacity={0.75}
                accessibilityRole="button"
                accessibilityLabel={`Submit ${favorite.title} to ECS Trail Packs`}
                accessibilityHint="Opens the route submission workflow; it does not publish automatically"
                hitSlop={{ top: 5, bottom: 5, left: 5, right: 5 }}
                onPress={(event) => {
                  event.stopPropagation?.();
                  handleSubmitFavoriteTrailPack(favorite);
                }}
              >
                <Ionicons name="trail-sign-outline" size={11} color={TACTICAL.amber} />
                <Text style={s.favoriteQuickNavigateText}>SUBMIT</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={s.favoriteQuickNavigateBtn}
                activeOpacity={0.75}
                accessibilityRole="button"
                accessibilityLabel={`Navigate ${favorite.title}`}
                accessibilityHint="Stages this saved route for Navigate"
                hitSlop={{ top: 5, bottom: 5, left: 5, right: 5 }}
                onPress={(event) => {
                  event.stopPropagation?.();
                  void handleNavigateToFavorite(favorite);
                }}
              >
                <Ionicons name="navigate-outline" size={11} color={TACTICAL.amber} />
                <Text style={s.favoriteQuickNavigateText}>NAVIGATE</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <View style={s.favoritePlanModeHintRow}>
            <Ionicons name="albums-outline" size={11} color={TACTICAL.textMuted} />
            <Text style={s.favoritePlanModeHintText}>
              {isSelected ? 'Included in stack draft' : 'Tap to add to stack draft'}
            </Text>
          </View>
        )}
      </TouchableOpacity>
    );
  });
  const favoritePlanCards = pagedFavoritePlans.map((plan) => (
    <TouchableOpacity
      key={plan.planId}
      style={s.favoritePlanCard}
      activeOpacity={0.84}
      accessible={false}
      onPress={() => handleOpenPlanBuilder(plan)}
    >
      <View style={s.favoritePlanTopRow}>
        <TouchableOpacity
          style={s.favoriteCardCopy}
          activeOpacity={0.84}
          accessibilityRole="button"
          accessibilityLabel={`Open saved route stack ${plan.title}`}
          accessibilityHint="Opens this route stack in the builder"
          onPress={(event) => {
            event.stopPropagation?.();
            handleOpenPlanBuilder(plan);
          }}
        >
          <Text style={s.favoritePlanTitle} numberOfLines={2} maxFontSizeMultiplier={1.6}>{plan.title}</Text>
          <Text style={s.favoritePlanSubtitle} numberOfLines={3} maxFontSizeMultiplier={1.6}>
            {formatStackedPlanLabel(plan)}
          </Text>
        </TouchableOpacity>
        <View style={s.favoritePlanCountBadge}>
          <Text style={s.favoritePlanCountText}>{plan.items.length}</Text>
        </View>
      </View>

      <View style={s.favoritePlanMetaRow}>
        <View style={s.favoriteMetaBadge}>
          <Text style={s.favoriteMetaBadgeText}>
            UPDATED {new Date(plan.updatedAt).toLocaleDateString()}
          </Text>
        </View>
      </View>

      <View style={s.favoriteQuickRow}>
        <Text style={s.favoriteQuickHint}>Review saved stack</Text>
        <View style={s.favoriteToolbarActions}>
          <TouchableOpacity
            style={s.favoriteActionBtn}
            activeOpacity={0.75}
            accessibilityRole="button"
            accessibilityLabel={`Edit order for ${plan.title}`}
            accessibilityHint="Opens this route stack in the builder"
            hitSlop={{ top: 7, bottom: 7, left: 7, right: 7 }}
            onPress={(event) => {
              event.stopPropagation?.();
              handleOpenPlanBuilder(plan);
            }}
          >
            <Ionicons name="reorder-three-outline" size={11} color={TACTICAL.textMuted} />
            <Text style={s.favoriteActionText}>EDIT ORDER</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={s.favoriteActionBtn}
            activeOpacity={0.75}
            accessibilityRole="button"
            accessibilityLabel={`Delete route stack ${plan.title}`}
            accessibilityHint="Opens a confirmation before deleting this route stack"
            hitSlop={{ top: 7, bottom: 7, left: 7, right: 7 }}
            onPress={(event) => {
              event.stopPropagation?.();
              handleDeletePlan(plan.planId);
            }}
          >
            <Ionicons name="trash-outline" size={11} color={TACTICAL.textMuted} />
            <Text style={s.favoriteActionText}>DELETE</Text>
          </TouchableOpacity>
        </View>
      </View>
    </TouchableOpacity>
  ));

  const explorerCategoryTiles = useMemo(
    () => [
      {
        key: 'hiddenGems' as const,
        label: 'Hidden Gems',
        icon: 'diamond-outline',
        count: hiddenGemPage.eligibleCount,
        accentColor: TACTICAL.amber,
        description: 'Lower-profile routes matched to the active filters.',
      },
      {
        key: 'trailPacks' as const,
        label: 'Trail Packs',
        icon: 'albums-outline',
        count: trailPackPage.eligibleCount,
        accentColor: TACTICAL.amber,
        description: 'ECS-native route packs submitted, reviewed, or validated by ECS.',
      },
      {
        key: 'ecsRouteIdeas' as const,
        label: 'ECS Route Ideas',
        icon: 'navigate-outline',
        count: aiRouteIdeaPage.eligibleCount,
        accentColor: TACTICAL.amber,
        description: 'Generated route ideas filtered to this context.',
      },
      {
        key: 'favorites' as const,
        label: 'Favorites',
        icon: 'star-outline',
        count: favoritesTotal,
        accentColor: TACTICAL.amber,
        description: 'Saved routes that still match the active Explore context.',
      },
    ],
    [
      aiRouteIdeaPage.eligibleCount,
      favoritesTotal,
      hiddenGemPage.eligibleCount,
      trailPackPage.eligibleCount,
    ],
  );

  const activeExplorerCategoryConfig = explorerCategoryTiles.find(
    (category) => category.key === activeExplorerCategoryPanel,
  ) ?? null;
  const activeExplorerPanelItemLabel = activeExplorerCategoryPanel === 'favorites' ? 'ITEM' : 'TRAILHEAD';
  const exploreTopLevelFeatures = useMemo(() => getVisibleExploreFeatures(), []);
  const exploreFeatureBadges = useMemo<Record<ExploreFeatureId, string | number | null>>(
    () => ({
      suggested_routes: publicSuggestedTrailheadRoutes.length,
      route_filters: selectedExploreRefinementLabel ?? `${activeDistanceRadius} mi`,
      trip_builder: 'LIVE',
      offline_prep_pack: 'LIVE',
    }),
    [
      activeDistanceRadius,
      publicSuggestedTrailheadRoutes.length,
      selectedExploreRefinementLabel,
    ],
  );

  const handleOpenExploreFeature = useCallback(
    (featureId: ExplorePrimaryTab) => {
      const feature = exploreTopLevelFeatures.find((item) => item.id === featureId);
      if (!feature?.enabled) return;

      hapticMicro();
      saveExplorePlanningRouteContext({
        routes: publicSuggestedTrailheadRoutes as any,
        radiusMiles: activeDistanceRadius,
        refinementLabel: selectedExploreRefinementLabel,
        source: featureId === 'trip_builder' ? 'trip_builder_tab' : featureId === 'offline_prep_pack' ? 'offline_prep_tab' : 'suggested_routes',
      });
      ecsLog.info('DISCOVERY', '[EXPLORE_FEATURE] selected', {
        featureId,
        featureTitle: feature.title,
        featureStatus: feature.status,
        featureCategory: feature.category,
        event: 'explore_feature_selected',
      });

      switch (featureId) {
        case 'suggested_routes':
          setActiveExplorePrimaryTab('suggested_routes');
          setActiveExplorerCategoryPanel(null);
          return;
        case 'trip_builder':
          setActiveExplorerCategoryPanel(null);
          clearTripBuilderRouteHandoff();
          pushSingleFlight('/explore-trip-builder');
          return;
        case 'offline_prep_pack':
          setActiveExplorePrimaryTab('offline_prep_pack');
          setActiveExplorerCategoryPanel(null);
          clearOfflinePrepPackHandoff();
          return;
        default:
          return;
      }
    },
    [
      activeDistanceRadius,
      publicSuggestedTrailheadRoutes,
      exploreTopLevelFeatures,
      pushSingleFlight,
      selectedExploreRefinementLabel,
    ],
  );

  const handleOpenExploreTripBuilderFromHero = useCallback(() => {
    hapticMicro();
    saveExplorePlanningRouteContext({
      routes: publicSuggestedTrailheadRoutes as any,
      radiusMiles: activeDistanceRadius,
      refinementLabel: selectedExploreRefinementLabel,
      source: 'trip_builder_tab',
    });
    clearTripBuilderRouteHandoff();
    pushSingleFlight('/explore-trip-builder');
  }, [
    activeDistanceRadius,
    publicSuggestedTrailheadRoutes,
    pushSingleFlight,
    selectedExploreRefinementLabel,
  ]);

  useEffect(() => {
    if (activeExplorePrimaryTab === 'suggested_routes') return;
    if (publicSuggestedTrailheadRoutes.length === 0) {
      setExplorePlanningSelectedRouteId(null);
      return;
    }
    if (!publicSuggestedTrailheadRoutes.some((route) => String(route.id) === explorePlanningSelectedRouteId)) {
      setExplorePlanningSelectedRouteId(String(publicSuggestedTrailheadRoutes[0].id));
    }
  }, [activeExplorePrimaryTab, explorePlanningSelectedRouteId, publicSuggestedTrailheadRoutes]);

  const selectedExplorePlanningRoute = useMemo(
    () =>
      publicSuggestedTrailheadRoutes.find((route) => String(route.id) === explorePlanningSelectedRouteId) ??
      publicSuggestedTrailheadRoutes[0] ??
      null,
    [explorePlanningSelectedRouteId, publicSuggestedTrailheadRoutes],
  );

  const handleOpenActivePlanningFlow = useCallback(() => {
    if (activeExplorePrimaryTab !== 'offline_prep_pack') return;
    hapticMicro();
    saveExplorePlanningRouteContext({
      routes: publicSuggestedTrailheadRoutes as any,
      radiusMiles: activeDistanceRadius,
      refinementLabel: selectedExploreRefinementLabel,
      source: 'offline_prep_tab',
    });
    if (selectedExplorePlanningRoute) {
      saveOfflinePrepPackHandoff({
        route: selectedExplorePlanningRoute as any,
        campsiteCandidates: extractExploreRouteCampMarkers(selectedExplorePlanningRoute).map((marker) => ({
          id: marker.id,
          name: marker.title,
          location: { latitude: marker.latitude, longitude: marker.longitude },
          score: marker.score,
          legalConfidence: marker.confidence,
          accessConfidence: marker.confidence,
          source: marker.source ?? 'explore_route_camp_marker',
          notes: [marker.subtitle],
        })),
      }, 'explore');
    }
      pushSingleFlight({
      pathname: '/explore-offline-prep-pack',
      params: selectedExplorePlanningRoute ? { routeId: selectedExplorePlanningRoute.id } : undefined,
    } as any);
  }, [
    activeDistanceRadius,
    activeExplorePrimaryTab,
    publicSuggestedTrailheadRoutes,
    pushSingleFlight,
    selectedExplorePlanningRoute,
    selectedExploreRefinementLabel,
  ]);

  const explorePrimaryTabOptions = useMemo(
    () =>
      exploreTopLevelFeatures.map((feature) => ({
        key: feature.id,
        label: feature.title,
        icon: feature.icon as any,
        badge: exploreFeatureBadges[feature.id],
      })),
    [exploreFeatureBadges, exploreTopLevelFeatures],
  );

  const activeExplorerPanelPage = useMemo(() => {
    switch (activeExplorerCategoryPanel) {
      case 'hiddenGems':
        return {
          pageIndex: hiddenGemPage.pageIndex,
          totalPages: hiddenGemPage.totalPages,
          totalItems: hiddenGemPage.eligibleCount,
          windowStart: hiddenGemWindowStart,
          windowEnd: hiddenGemWindowEnd,
        };
      case 'trailPacks':
        return {
          pageIndex: trailPackPage.pageIndex,
          totalPages: trailPackPage.totalPages,
          totalItems: trailPackPage.eligibleCount,
          windowStart: trailPackWindowStart,
          windowEnd: trailPackWindowEnd,
        };
      case 'ecsRouteIdeas':
        return {
          pageIndex: aiRouteIdeaPage.pageIndex,
          totalPages: aiRouteIdeaPage.totalPages,
          totalItems: aiRouteIdeaPage.eligibleCount,
          windowStart: aiRouteIdeaWindowStart,
          windowEnd: aiRouteIdeaWindowEnd,
        };
      case 'favorites':
        return {
          pageIndex: normalizedFavoritesPageIndex,
          totalPages: favoritePanelTotalPages,
          totalItems: activeFavoritePanelItems.length,
          windowStart: activeFavoritePanelItems.length === 0 ? 0 : favoritePanelOffset + 1,
            windowEnd: Math.min(
            favoritePanelOffset + EXPLORE_CATEGORY_PAGE_SIZE,
            activeFavoritePanelItems.length,
          ),
        };
      default:
        return {
          pageIndex: 0,
          totalPages: 1,
          totalItems: 0,
          windowStart: 0,
          windowEnd: 0,
        };
    }
  }, [
    activeExplorerCategoryPanel,
    activeFavoritePanelItems.length,
    aiRouteIdeaPage.eligibleCount,
    aiRouteIdeaPage.pageIndex,
    aiRouteIdeaPage.totalPages,
    aiRouteIdeaWindowEnd,
    aiRouteIdeaWindowStart,
    favoritePanelOffset,
    favoritePanelTotalPages,
    hiddenGemPage.eligibleCount,
    hiddenGemPage.pageIndex,
    hiddenGemPage.totalPages,
    hiddenGemWindowEnd,
    hiddenGemWindowStart,
    normalizedFavoritesPageIndex,
    trailPackPage.eligibleCount,
    trailPackPage.pageIndex,
    trailPackPage.totalPages,
    trailPackWindowEnd,
    trailPackWindowStart,
  ]);

  const handleOpenExplorerCategoryPanel = useCallback((category: ExplorerCategoryPanelKey) => {
    hapticMicro();
    setActiveExplorerCategoryPanel(category);
  }, []);

  const handleCloseExplorerCategoryPanel = useCallback(() => {
    hapticMicro();
    setActiveExplorerCategoryPanel(null);
  }, []);

  const handleChangeExplorerCategoryPage = useCallback(
    (direction: -1 | 1) => {
      if (!activeExplorerCategoryPanel) return;
      explorePaginationPerformanceRef.current?.cancel({ superseded: true });
      explorePaginationPerformanceRef.current = startECSPerformanceSpan(
        'explore_results',
        'category_pagination_commit',
        { trackOutstanding: true, metadata: { category: activeExplorerCategoryPanel, direction } },
      );
      incrementECSPerformanceCounter('explore_results', 'pagination_actions');
      hapticMicro();
      const clampPage = (nextIndex: number, totalPages: number) =>
        Math.max(0, Math.min(nextIndex, Math.max(totalPages - 1, 0)));

      switch (activeExplorerCategoryPanel) {
        case 'hiddenGems':
          setHiddenGemPageIndex((current) => clampPage(current + direction, hiddenGemPage.totalPages));
          setHiddenGemCycleNotice(null);
          break;
        case 'trailPacks':
          setTrailPackPageIndex((current) => clampPage(current + direction, trailPackPage.totalPages));
          break;
        case 'ecsRouteIdeas':
          setAiRouteIdeaPageIndex((current) => clampPage(current + direction, aiRouteIdeaPage.totalPages));
          break;
        case 'favorites':
          setFavoritesPageIndex((current) => clampPage(current + direction, favoritePanelTotalPages));
          break;
      }
    },
    [
      activeExplorerCategoryPanel,
      aiRouteIdeaPage.totalPages,
      favoritePanelTotalPages,
      hiddenGemPage.totalPages,
      trailPackPage.totalPages,
    ],
  );

  useEffect(() => {
    explorePaginationPerformanceRef.current?.end('completed');
    explorePaginationPerformanceRef.current = null;
  }, [aiRouteIdeaPageIndex, favoritesPageIndex, hiddenGemPageIndex, trailPackPageIndex]);

  const handleExploreScrollBegin = useCallback(() => {
    exploreScrollPerformanceRef.current?.cancel({ superseded: true });
    exploreScrollPerformanceRef.current = startECSPerformanceSpan(
      'explore_results',
      'sustained_scroll_interaction',
      { trackOutstanding: true },
    );
  }, []);

  const handleExploreScrollEnd = useCallback(() => {
    exploreScrollPerformanceRef.current?.end('completed');
    exploreScrollPerformanceRef.current = null;
    incrementECSPerformanceCounter('explore_results', 'scroll_interactions');
  }, []);

  useEffect(() => () => {
    exploreFirstResultPerformance.cancel({ unmounted: true });
    exploreFullListPerformance.cancel({ unmounted: true });
    explorePaginationPerformanceRef.current?.cancel({ unmounted: true });
    exploreScrollPerformanceRef.current?.cancel({ unmounted: true });
  }, [exploreFirstResultPerformance, exploreFullListPerformance]);

  const renderExplorerCategoryPanelContent = () => {
    switch (activeExplorerCategoryPanel) {
      case 'hiddenGems':
        if (showSectionLoading) return <SectionCardSkeletonList />;
        if (hiddenGemState.error) {
          return (
            <ExplorerStateCard
              icon="cloud-offline-outline"
              title={ECS_READINESS_COPY.explore.hiddenGemsLimitedTitle}
              message={ECS_READINESS_COPY.explore.hiddenGemsLimitedMessage}
            />
          );
        }
        if (visibleHiddenGemRoutes.length === 0) {
          return (
            <ExplorerStateCard
              icon="diamond-outline"
              title="No Hidden Gems in Range"
              message={
                hiddenGemDiagnostics.rawCandidateCount === 0
                  ? `No routes were available to evaluate as Hidden Gems inside ${exploreFilterNarrative}.`
                  : `Routes were evaluated inside ${exploreFilterNarrative}, but none qualified as exploratory off-road candidates after the active filters were applied.`
              }
            />
          );
        }
        return (
          <View style={[s.routeCardGrid, showExploreRouteGrid && s.routeCardGridExpanded]}>
            {visibleHiddenGemRoutes.map((route) => (
              <View key={route.id} style={[s.hiddenGemCardWrap, routeCardWidth ? { width: routeCardWidth } : null]}>
                <EnrichedRouteCard
                  route={route}
                  hasVehicle={!!activeVehicleId}
                  isFavorited={favoriteTrailIds.has(String(route.id))}
                  presentationVariant="hidden-gem"
                  collectionLabel="Hidden Gems"
                  thumbnailOverride={hiddenGemThumbnailAssignments.get(String(route.id)) ?? null}
                  onSelect={() => handleSelectOpportunity(route)}
                  onNavigate={() => {
                    void handleNavigateToRoute(route);
                  }}
                  onToggleFavorite={() => handleToggleFavorite(route)}
                  isCompleted={completedIds?.has(route.id) ?? false}
                  compactPreview
                />
              </View>
            ))}
          </View>
        );
      case 'trailPacks':
        if (!routeCatalogHasSearchArea) {
          return (
            <ExplorerStateCard
              icon="location-outline"
              title="Search Area Needed"
              message="Trail Packs need GPS or an internal search area to filter verified routes by radius."
            />
          );
        }
        if (showTrailPackBlockingLoading) {
          return (
            <ExplorerStateCard
              icon="hourglass-outline"
              title="Loading Trail Packs"
              message="Scanning approved ECS Trail Packs within selected radius…"
            />
          );
        }
        if (visibleRouteCatalogSummaries.length === 0) {
          if (liveTrailPackCatalogSnapshot.status === 'error') {
            return (
              <ExplorerStateCard
                icon="cloud-offline-outline"
                title="Live Trail Packs Unavailable"
                message="Live Trail Packs are not available from reviewed sources yet. No seed or mock Trail Packs are shown here."
              />
            );
          }
          if (broaderTrailPackResults.length > 0) {
            return (
              <ExplorerStateCard
                icon="shield-half-outline"
                title="Lower Confidence Nearby"
                message="Only lower-confidence Trail Packs were found nearby. Expand your radius or enable broader results."
              />
            );
          }
          if (routeCatalogCurationCoverageNotice) {
            return (
              <ExplorerStateCard
                icon="shield-half-outline"
                title={liveTrailPackCatalogSnapshot.coverageState.title || 'Source-backed routes in curation'}
                message={routeCatalogCurationCoverageNotice}
              />
            );
          }
          return (
            <ExplorerStateCard
              icon="albums-outline"
              title={liveTrailPackCatalogSnapshot.coverageState.title || 'No verified routes yet in this area'}
              message={liveTrailPackCatalogSnapshot.coverageState.message || 'No live reviewed Trail Packs found within this radius. No verified routes yet in this area. Try expanding your radius or import a GPX as a private pending suggestion.'}
            />
          );
        }
        return (
          <View style={s.trailPackPanelStack}>
            {routeCatalogEffectiveSearchArea ? (
              <View style={s.inlineSectionNotice}>
                <Ionicons name="map-outline" size={12} color={TACTICAL.info} />
                <Text style={s.inlineSectionNoticeText}>
                  Showing verified routes within {activeDistanceRadius} mi of {routeCatalogEffectiveSearchArea.shortLabel}.
                </Text>
              </View>
            ) : null}
            {showTrailPackSectionLoading ? (
              <View style={s.inlineSectionNotice}>
                <Ionicons name="refresh-outline" size={12} color={TACTICAL.amber} />
                <Text style={s.inlineSectionNoticeText}>
                  Refreshing nearby Trail Packs. Current results stay visible while ECS updates this list.
                </Text>
              </View>
            ) : null}
            {visibleRouteCatalogSummaries.some((summary) => summary.sourceType === 'preview') ? (
              <View style={s.inlineSectionNotice}>
                <Ionicons name="shield-checkmark-outline" size={12} color={TACTICAL.amber} />
                <Text style={s.inlineSectionNoticeText}>
                  Preview summaries are not shown as verified public Trail Packs until ECS review is complete.
                </Text>
              </View>
            ) : null}
            <View style={[s.routeCardGrid, showExploreRouteGrid && s.routeCardGridExpanded]}>
              {visibleRouteCatalogSummaries.map((summary) => {
                const isSaved =
                  favoriteTrailIds.has(summary.routeId) ||
                  favoriteTrailIds.has(`trail-pack:${summary.routeId}`);
                return (
                  <View
                    key={summary.routeId}
                    style={[s.hiddenGemCardWrap, routeCardWidth ? { width: routeCardWidth } : null]}
                  >
                    <RouteCatalogSummaryCard
                      summary={summary}
                      isSaved={isSaved}
                      onPreview={handlePreviewRouteCatalogSummary}
                      onStartGuidance={handleStartRouteCatalogSummaryGuidance}
                      onSave={handleSaveRouteCatalogSummary}
                      compactPreview
                    />
                  </View>
                );
              })}
            </View>
          </View>
        );
      case 'ecsRouteIdeas':
        if (aiLoading && visibleAIRoutes.length === 0) {
          return (
            <View style={s.aiLoadingContainer}>
              <ActivityIndicator size="small" color="#5AC8FA" />
              <Text style={s.aiLoadingText}>REFINING ECS ROUTE IDEAS...</Text>
              <Text style={s.aiLoadingSubText}>Keeping the current Explore results visible while suggestions refresh.</Text>
            </View>
          );
        }
        if (aiError && visibleAIRoutes.length === 0) {
          return (
            <View style={s.aiErrorContainer}>
              <Ionicons name="cloud-offline-outline" size={16} color={TACTICAL.textMuted} />
              <Text style={s.aiErrorText}>{ECS_STATE_COPY.recovery.exploreIdeasLimited.message}</Text>
              <TouchableOpacity style={s.aiRetryBtn} onPress={handleFetchAIRoutes} activeOpacity={0.7}>
                <Ionicons name="refresh-outline" size={10} color={TACTICAL.amber} />
                <Text style={s.aiRetryBtnText}>{ECS_STATE_COPY.recovery.exploreIdeasLimited.ctaLabel.toUpperCase()}</Text>
              </TouchableOpacity>
            </View>
          );
        }
        if (visibleAIRoutes.length === 0) {
          return (
            <ExplorerStateCard
              icon="navigate-outline"
              title="No ECS Route Ideas Yet"
              message={`ECS route ideas appear automatically when matching suggestions are available inside ${exploreFilterNarrative}.`}
            />
          );
        }
        return (
          <View style={s.routeCardGrid}>
            {visibleAIRoutes.map((route) => (
              <AIRouteCard
                key={route.id}
                route={route}
                enrichedRoute={enrichedAIMap.get(route.id) ?? null}
                hasVehicle={!!activeVehicleId}
                isFavorited={favoriteTrailIds.has(String(route.id))}
                thumbnailOverride={aiRouteThumbnailAssignments.get(String(route.id)) ?? null}
                onPreview={() => handleAIPreview(route)}
                onNavigate={() => {
                  void handleNavigateToRoute(route);
                }}
                onToggleFavorite={() => handleToggleFavorite(route)}
                onBuildRoute={() => {
                  handleBuildTripFromRoute(route);
                }}
                compactPreview
              />
            ))}
          </View>
        );
      case 'favorites':
        return (
          <View style={s.explorerPanelFavoritesWrap}>
            <View style={s.favoriteSegmentWrap}>
              <ECSSegmentedControl
                options={[
                  { key: 'trails', label: 'TRAILS', badge: filteredFavoriteTrails.length > 0 ? filteredFavoriteTrails.length : null },
                  { key: 'plans', label: 'PLANS', badge: filteredFavoritePlans.length > 0 ? filteredFavoritePlans.length : null },
                ]}
                value={favoritesView}
                onChange={(next) => {
                  hapticMicro();
                  setFavoritesPageIndex(0);
                  setFavoritesView(next as 'trails' | 'plans');
                  if (next === 'plans') {
                    exitFavoritesPlanMode();
                  }
                }}
              />
            </View>

            {favoritesView === 'trails' ? (
              <>
                <View style={s.favoriteToolbar}>
                  {favoritesPlanMode ? (
                    <>
                      <Text style={s.favoriteToolbarText}>
                        {selectedPlanFavoriteIds.length} selected for stacking
                      </Text>
                      <View style={s.favoriteToolbarActions}>
                        <TouchableOpacity
                          style={s.favoriteToolbarBtn}
                          activeOpacity={0.78}
                          onPress={exitFavoritesPlanMode}
                        >
                          <Text style={s.favoriteToolbarBtnText}>CANCEL</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[
                            s.favoriteToolbarPrimaryBtn,
                            selectedPlanFavoriteIds.length < 2 && s.favoriteToolbarPrimaryBtnDisabled,
                          ]}
                          activeOpacity={selectedPlanFavoriteIds.length < 2 ? 1 : 0.82}
                          disabled={selectedPlanFavoriteIds.length < 2}
                          onPress={handleBeginCreatePlan}
                        >
                          <Text style={s.favoriteToolbarPrimaryText}>CREATE STACK</Text>
                        </TouchableOpacity>
                      </View>
                    </>
                  ) : (
                    <>
                      <Text style={s.favoriteToolbarText}>
                        Favorites are filtered to the current Explore route context.
                      </Text>
                      <TouchableOpacity
                        style={s.favoritePlannerBtn}
                        activeOpacity={0.8}
                        onPress={handleToggleFavoritesPlanMode}
                      >
                        <Ionicons name="checkmark-circle-outline" size={11} color={TACTICAL.amber} />
                        <Text style={s.favoritePlannerBtnText}>SELECT</Text>
                      </TouchableOpacity>
                    </>
                  )}
                </View>

                {filteredFavoriteTrails.length === 0 ? (
                  <ECSResultsEmptyState
                    style={s.favoriteEmptyState}
                    title={ECS_STATE_COPY.explore.noFavoritesSaved.title}
                    message="No saved trails match the current Explore filters."
                    icon="star-outline"
                    variant="compact"
                  />
                ) : (
                  <View style={s.favoriteList}>{favoriteTrailCards}</View>
                )}
              </>
            ) : (
              filteredFavoritePlans.length > 0 ? (
                <View style={s.favoritePlanList}>{favoritePlanCards}</View>
              ) : (
                <ECSResultsEmptyState
                  style={s.favoriteEmptyState}
                  title="No Stacked Plans in Context"
                  message="Saved trail stacks appear here when at least one stop matches the current Explore filters."
                  icon="git-merge-outline"
                  variant="compact"
                />
              )
            )}
          </View>
        );
      default:
        return null;
    }
  };


  return (
    <TopoBackground>
      <View style={[s.safeContainer, { paddingBottom: dockClearance }]}>
        <Header title="Explore" deferBannerImage={!exploreEntryHeavyChromeReady} />

        <View style={s.explorerBody}>
        <ScrollView
          style={s.scrollArea}
          contentContainerStyle={[s.scrollContent, contentFrameStyle]}
          showsVerticalScrollIndicator={false}
          onScrollBeginDrag={handleExploreScrollBegin}
          onScrollEndDrag={handleExploreScrollEnd}
          onMomentumScrollEnd={handleExploreScrollEnd}
          scrollEventThrottle={32}
        >

          <TouchableOpacity
            style={s.exploreWizardHero}
            testID="explore-tripbuilder-wizard-surface"
            activeOpacity={0.84}
            onPress={handleOpenExploreTripBuilderFromHero}
            accessibilityRole="button"
            accessibilityLabel="Open Explore Trip Builder"
            accessibilityHint="Open Trip Builder to choose a guidance-ready route."
          >
            <View style={s.exploreWizardHeroIcon}>
              <Ionicons name="trail-sign-outline" size={18} color={TACTICAL.amber} />
            </View>
            <View style={s.exploreWizardHeroCopy}>
              <Text style={s.exploreWizardEyebrow}>EXPLORE TRIP BUILDER</Text>
              <Text style={s.exploreWizardTitle}>Pick a guidance-ready route</Text>
              <Text style={s.exploreWizardText}>
                Preview, save, build a trip, or start navigation from verified route geometry only.
              </Text>
            </View>
          </TouchableOpacity>

          {activeExplorePrimaryTab === 'suggested_routes' ? (
            <>
          {(!showInitialLoading && (hasExploreRangeRouteData || showSectionLoading || showTrailPackSectionLoading)) && (
            <View style={s.discoveryControlsWrap}>
              <DistanceRadiusFilter
                selectedRadius={distanceRadius}
                onChangeRadius={handleRadiusChange}
                hasGPSFix={hasGPSFix}
                totalCount={exploreGuidanceReadyInventory.totalReadyCount}
                filteredCount={exploreGuidanceReadyInventory.totalReadyCount}
                refinedCount={exploreGuidanceReadyInventory.readyCount}
                selectedRefinement={exploreRefinement}
                refinementCounts={exploreGuidanceReadyInventory.refinementCounts}
                onChangeRefinement={handleExploreRefinementChange}
                deferControls={!exploreEntryHeavyChromeReady}
                isLoading={isLoading}
              />

              <View style={s.exploreWizardStatusCard}>
                <View style={s.exploreWizardStatusCopy}>
                  <Text style={s.exploreWizardStatusTitle}>Guidance Ready Routes</Text>
                  <Text style={s.exploreWizardStatusText}>
                    {showGuidanceReadyGeometryLoading
                      ? `Loading bounded route preview geometry for ${exploreFilterNarrative}. Full route detail remains deferred until you preview, save, build, or start a route.`
                      : hasSelectedExploreRefinement
                      ? `Guidance Ready Routes are source-backed routes with usable stitched geometry, visible confidence, and data state labels. ${exploreGuidanceReadyInventory.readyCount} routes match ${exploreFilterNarrative} and are available to preview, save, build, or start.`
                      : `Select a refinement bucket to populate Guidance Ready route cards. The counts above show guidance-ready routes inside ${distanceRadiusNarrative}, without changing the range results when you switch buckets.`}
                  </Text>
                  {showGuidanceReadyRefinementPrompt ? (
                    <Text style={s.exploreWizardNotice} numberOfLines={2}>
                      Choose Remoteness, Day Trip, Weekend Trip, or Expedition to load only that route set.
                    </Text>
                  ) : null}
                  {exploreWizardSaveNotice ? (
                    <Text style={s.exploreWizardNotice} numberOfLines={2}>{exploreWizardSaveNotice}</Text>
                  ) : null}
                </View>
                <View style={s.exploreWizardCountPlate}>
                  {showGuidanceReadyGeometryLoading ? (
                    <ActivityIndicator size="small" color={TACTICAL.amber} />
                  ) : (
                    <Text style={s.exploreWizardCountValue}>
                      {hasSelectedExploreRefinement ? exploreGuidanceReadyInventory.readyCount : exploreGuidanceReadyInventory.totalReadyCount}
                    </Text>
                  )}
                  <Text style={s.exploreWizardCountLabel}>
                    {showGuidanceReadyGeometryLoading ? 'LOADING' : hasSelectedExploreRefinement ? 'READY' : 'IN RANGE'}
                  </Text>
                </View>
              </View>

              {showGuidanceReadyBlockedNotice ? (
                <View style={s.inlineSectionNotice} testID="explore-guidance-ready-blocked-notice">
                  <Ionicons name="alert-circle-outline" size={15} color={TACTICAL.amber} />
                  <Text style={s.inlineSectionNoticeText}>
                    <Text style={s.inlineSectionNoticeStrong}>Routes Need Guidance Geometry. </Text>
                    ECS found routes in this radius, but none are ready for active guidance yet. No routes were converted into guidance, saved, or navigated from this lane. {exploreGuidanceReadyBlockedReasonText}
                  </Text>
                </View>
              ) : null}

            </View>
          )}

          {/* ── Phase 16: Category Tabs ────────────────────────── */}

          {/* ── Phase 13: Exploration Progress Panel ──────────── */}

          {showInitialLoading && (
            <>
              <ECSTransientNotice
                kind="loading"
                label="Loading Route Data..."
                message="Building trail intelligence for the current radius."
                style={s.loadingNotice}
              />
              <DiscoverySectionSkeleton
                title="HIDDEN GEMS"
                icon="diamond-outline"
                badge="RANKING"
                description="Filtering lower-profile drivable trails for the current radius."
              />
            </>
          )}

          {!showInitialLoading && !showSectionLoading && !showTrailPackSectionLoading && !hasExploreRangeRouteData && (
            <ECSResultsEmptyState
              style={s.emptyRadius}
              title={ECS_STATE_COPY.explore.noRoutesInRadius.title}
              message={
                distanceRadius == null
                  ? 'No trails match the current Explore scan.'
                  : `No trails fall inside the current ${distanceRadius}-mile scan.`
              }
              helper="Widen the radius or reset Explore to the default radius to continue exploring."
              actionLabel={distanceRadius != null && distanceRadius < 500 ? ECS_CTA_LABELS.expandRadius : hasDiscoveryOverrides ? ECS_CTA_LABELS.resetFilters : undefined}
              onAction={
                distanceRadius != null && distanceRadius < 500
                  ? () => {
                      hapticMicro();
                      setDistanceRadius(500);
                    }
                  : hasDiscoveryOverrides
                    ? handleResetDiscoveryFilters
                    : undefined
              }
              icon="locate-outline"
            />
          )}

          {!showInitialLoading && !showSectionLoading && showRefinementEmptyState && (
            <ECSResultsEmptyState
              style={s.emptyRadius}
              title="No Trails Match This Filter"
              message={`${selectedExploreRefinementLabel ?? 'This refinement'} has no matches inside ${distanceRadiusNarrative}.`}
              helper="Clear the refinement or choose a different range to keep exploring the current trail list."
              actionLabel="Clear Refinement"
              onAction={() => handleExploreRefinementChange(null)}
              icon="options-outline"
            />
          )}

          {/* ── Phase 16: Active Tab Route Feed ──────────────── */}
          {false && !isLoading && (activeTabRoutes.length > 0 || aiRoutes.length > 0) && (
            <>
              <View style={s.sectionHeader}>
                <View style={s.sectionHeaderLeft}>
                  <Ionicons name={activeTabMeta.icon as any} size={12} color={activeTabMeta.accentColor} />
                  <Text style={[s.sectionTitle, { color: activeTabMeta.accentColor }]}>{activeTabMeta.label}</Text>
                </View>
                <View style={s.sectionHeaderRight}>
                  <View style={[s.categoryBadge, { borderColor: activeTabMeta.accentColor + '30' }]}>
                    <Text style={[s.categoryBadgeText, { color: activeTabMeta.accentColor }]}>
                      {totalRouteCount} ROUTE{totalRouteCount !== 1 ? 'S' : ''}
                    </Text>
                  </View>
                  {aiRoutes.length > 0 && (
                    <View style={s.aiBadge}>
                      <Ionicons name="sparkles-outline" size={8} color="#5AC8FA" />
                      <Text style={s.aiBadgeText}>{aiRoutes.length} ECS</Text>
                    </View>
                  )}
                </View>
              </View>

              <Text style={s.tabDescription}>{activeTabMeta.description}</Text>

              {/* Phase 18: Known Routes with Enriched Cards */}
              {enrichedKnown.map((route) => (
                <EnrichedRouteCard
                  key={route.id}
                  route={route}
                  hasVehicle={!!activeVehicleId}
                  isFavorited={favoriteTrailIds.has(String(route.id))}
                  thumbnailOverride={knownRouteThumbnailAssignments.get(String(route.id)) ?? null}
                  onSelect={() => handleSelectOpportunity(route)}
                  onNavigate={() => {
                    void handleNavigateToRoute(route);
                  }}
                  onToggleFavorite={() => handleToggleFavorite(route)}
                  isCompleted={completedIds?.has(route.id) ?? false}
                  compactPreview
                />
              ))}

              {/* ── Phase 17+18: AI Route Section with Enrichment ── */}
              {aiEnabled && aiRoutes.length > 0 && (
                <>
                  <View style={s.aiSectionDivider}>
                    <View style={s.aiDividerLine} />
                    <View style={s.aiDividerBadge}>
                      <Ionicons name="sparkles-outline" size={10} color="#5AC8FA" />
                      <Text style={s.aiDividerText}>ECS ROUTE IDEAS</Text>
                    </View>
                    <View style={s.aiDividerLine} />
                  </View>

                  {aiRoutes.map((route) => (
                    <AIRouteCard
                      key={route.id}
                      route={route}
                      enrichedRoute={enrichedAIMap.get(route.id) ?? null}
                      hasVehicle={!!activeVehicleId}
                      isFavorited={favoriteTrailIds.has(String(route.id))}
                      onPreview={() => handleAIPreview(route)}
                      onNavigate={() => {
                        void handleNavigateToRoute(route);
                      }}
                      onToggleFavorite={() => handleToggleFavorite(route)}
                      onBuildRoute={() => {
                        handleBuildTripFromRoute(route);
                      }}
                      compactPreview
                    />
                  ))}
                </>
              )}

            </>
          )}

          {/* ── Phase 17: AI Loading Indicator ────────────────── */}
          {false && !isLoading && aiEnabled && aiLoading && (
            <View style={s.aiLoadingContainer}>
              <ActivityIndicator size="small" color="#5AC8FA" />
              <Text style={s.aiLoadingText}>GENERATING ECS ROUTE IDEAS...</Text>
              <Text style={s.aiLoadingSubText}>Analyzing terrain and geography near you</Text>
            </View>
          )}

          {/* ── Phase 17: AI Error State ──────────────────────── */}
          {false && !isLoading && aiEnabled && aiError && !aiLoading && aiRoutes.length === 0 && (
            <View style={s.aiErrorContainer}>
              <Ionicons name="cloud-offline-outline" size={16} color={TACTICAL.textMuted} />
              <Text style={s.aiErrorText}>{ECS_STATE_COPY.recovery.exploreIdeasLimited.title}</Text>
              <TouchableOpacity style={s.aiRetryBtn} onPress={handleFetchAIRoutes} activeOpacity={0.7}>
                <Ionicons name="refresh-outline" size={10} color={TACTICAL.amber} />
                <Text style={s.aiRetryBtnText}>{ECS_STATE_COPY.recovery.exploreIdeasLimited.ctaLabel.toUpperCase()}</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* ── Phase 17: Generate AI Routes Button ───────────── */}
          {false && !isLoading && aiEnabled && !aiLoading && !aiError && aiRoutes.length === 0 && activeTabRoutes.length > 0 && (
            <TouchableOpacity
              style={s.generateAIBtn}
              activeOpacity={0.8}
              onPress={handleFetchAIRoutes}
            >
              <View style={s.generateAIBtnInner}>
                <Ionicons name="sparkles-outline" size={14} color="#5AC8FA" />
                <View style={s.generateAIBtnContent}>
                  <Text style={s.generateAIBtnTitle}>EXPLORE ECS ROUTE IDEAS</Text>
                  <Text style={s.generateAIBtnDesc}>
                    Generate expedition suggestions based on your location and {activeTabMeta.label.toLowerCase()} preferences
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={14} color={TACTICAL.textMuted} />
              </View>
            </TouchableOpacity>
          )}

          {false && !isLoading && activeTabRoutes.length === 0 && aiRoutes.length === 0 && radiusFilteredOpportunities.length > 0 && (
            <View style={s.emptyRadius}>
              <Ionicons name={activeTabMeta.icon as any} size={28} color={TACTICAL.textMuted} />
              <Text style={s.emptyRadiusTitle}>NO {activeTabMeta.label} IN RANGE</Text>
              <Text style={s.emptyRadiusDesc}>
                No routes matching this category found within {distanceRadius} miles.{'\n'}Try expanding your distance filter or selecting a different category.
              </Text>
              {aiEnabled && !aiLoading && (
                <TouchableOpacity style={s.emptyRadiusBtn} onPress={handleFetchAIRoutes} activeOpacity={0.8}>
                  <Ionicons name="sparkles-outline" size={12} color="#5AC8FA" />
                  <Text style={[s.emptyRadiusBtnText, { color: '#5AC8FA' }]}>Get ECS Suggestions</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {(!showInitialLoading && hasSelectedExploreRefinement && !showRefinementEmptyState && (hasExploreRangeRouteData || showGuidanceReadyGeometryLoading || showSectionLoading)) && (
            <View style={s.exploreWizardRouteSurface}>
              <View style={s.exploreWizardFilterRow}>
                {EXPLORE_WIZARD_SOURCE_FILTERS.map((filter) => {
                  const selected = exploreWizardSourceFilter === filter.key;
                  const count = exploreWizardSourceCounts[filter.key] ?? 0;
                  return (
                    <TouchableOpacity
                      key={filter.key}
                      style={[s.exploreWizardFilterChip, selected && s.exploreWizardFilterChipActive]}
                      activeOpacity={0.82}
                      onPress={() => {
                        hapticMicro();
                        setExploreWizardSourceFilter(filter.key);
                      }}
                      accessibilityRole="button"
                      accessibilityLabel={`Filter Explore routes by ${filter.label}`}
                      accessibilityState={{ selected }}
                    >
                      <Text style={[s.exploreWizardFilterText, selected && s.exploreWizardFilterTextActive]}>
                        {filter.label}
                      </Text>
                      <Text style={[s.exploreWizardFilterCount, selected && s.exploreWizardFilterCountActive]}>
                        {count}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {showGuidanceReadyGeometryLoading ? (
                <ECSTransientNotice
                  kind="loading"
                  label="Loading Verified Route Previews..."
                  message="ECS is fetching simplified source geometry for the current range."
                  compact
                  style={s.exploreWizardEmpty}
                />
              ) : visibleExploreWizardCandidates.length === 0 ? (
                <ECSResultsEmptyState
                  style={s.exploreWizardEmpty}
                  title="No Guidance-Ready Routes"
                  message="No routes from the current Explore sources are ready for active guidance inside these filters."
                  helper="Adjust the radius or source chip, import a verified route file, or try again when route catalog geometry is available."
                  icon="navigate-outline"
                  variant="compact"
                />
              ) : (
                <FlatList<ExploreWizardRouteCandidate>
                  key={showExploreRouteGrid ? 'explore-guidance-grid' : 'explore-guidance-list'}
                  data={visibleExploreWizardCardCandidates}
                  keyExtractor={exploreWizardCandidateKeyExtractor}
                  renderItem={renderExploreWizardCandidateCard}
                  numColumns={exploreRouteGridColumns}
                  style={[
                    s.exploreWizardRouteList,
                    visibleExploreWizardCardCandidates.length > EXPLORE_ROUTE_CARD_INITIAL_RENDER_COUNT
                      ? s.exploreWizardRouteListScrollable
                      : null,
                  ]}
                  contentContainerStyle={s.exploreWizardRouteListContent}
                  columnWrapperStyle={showExploreRouteGrid ? s.exploreWizardRouteListColumn : undefined}
                  initialNumToRender={EXPLORE_ROUTE_CARD_INITIAL_RENDER_COUNT}
                  maxToRenderPerBatch={EXPLORE_ROUTE_CARD_BATCH_SIZE}
                  windowSize={EXPLORE_ROUTE_CARD_WINDOW_SIZE}
                  updateCellsBatchingPeriod={EXPLORE_ROUTE_CARD_BATCHING_PERIOD_MS}
                  removeClippedSubviews
                  nestedScrollEnabled
                  scrollEnabled={visibleExploreWizardCardCandidates.length > EXPLORE_ROUTE_CARD_INITIAL_RENDER_COUNT}
                  keyboardShouldPersistTaps="handled"
                  ListFooterComponent={exploreWizardRouteListFooter}
                />
              )}

              {hasMoreExploreWizardCandidates ? (
                <TouchableOpacity
                  style={s.hiddenGemPagerBtn}
                  activeOpacity={0.82}
                  onPress={() => {
                    hapticMicro();
                    setExploreGuidanceReadyVisibleLimit((current) =>
                      Math.min(current + EXPLORE_GUIDANCE_READY_FAST_PAINT_COUNT, visibleExploreWizardCandidates.length),
                    );
                  }}
                >
                  <Ionicons name="chevron-down-outline" size={14} color={TACTICAL.amber} />
                  <Text style={s.hiddenGemPagerText}>SHOW MORE ROUTES</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          )}

          {false && (!showInitialLoading && !showRefinementEmptyState && (radiusFilteredOpportunities.length > 0 || showSectionLoading)) && (
            <>
              <ECSSection style={[s.discoverySection, s.hiddenGemSection]}>
                <ECSSectionHeader
                  title="HIDDEN GEMS"
                  icon="diamond-outline"
                  badge={
                    <ECSSectionBadge
                      label={
                        showSectionLoading
                          ? 'UPDATING'
                          : hiddenGemState.error
                          ? ECS_READINESS_COPY.labels.limited
                          : hiddenGemPage.eligibleCount === 0
                          ? 'NO PICKS'
                          : `${hiddenGemWindowStart}-${hiddenGemWindowEnd} OF ${hiddenGemPage.eligibleCount}`
                      }
                    />
                  }
                />
                <Text style={s.discoverySectionDescription}>
                  {hiddenGemState.error
                    ? ECS_READINESS_COPY.explore.hiddenGemsLimitedDetail
                    : hiddenGemSummary}
                </Text>

                {hiddenGemCycleNotice ? (
                  <View style={s.inlineSectionNotice}>
                    <Ionicons name="information-circle-outline" size={12} color={TACTICAL.amber} />
                    <Text style={s.inlineSectionNoticeText}>{hiddenGemCycleNotice}</Text>
                  </View>
                ) : null}

                {showSectionLoading ? (
                  <SectionCardSkeletonList />
                ) : hiddenGemState.error ? (
                  <ExplorerStateCard
                    icon="cloud-offline-outline"
                    title={ECS_READINESS_COPY.explore.hiddenGemsLimitedTitle}
                    message={ECS_READINESS_COPY.explore.hiddenGemsLimitedMessage}
                    action={(
                      <TouchableOpacity
                        style={s.sectionStateAction}
                        activeOpacity={0.78}
                        onPress={refreshRigContext}
                      >
                        <Ionicons name="refresh-outline" size={11} color={TACTICAL.amber} />
                        <Text style={s.sectionStateActionText}>REFRESH EXPLORE</Text>
                      </TouchableOpacity>
                    )}
                  />
                ) : !exploreSourceDiagnostics.routeSourceHydrated ? (
                  <ExplorerStateCard
                    icon="hourglass-outline"
                    title="Loading Trail Source"
                    message="Explore is still hydrating its route source for this session. Hidden Gems will populate once the trail-source load completes."
                  />
                ) : exploreSourceDiagnostics.routeCatalogCount === 0 ? (
                  <ExplorerStateCard
                    icon="map-outline"
                    title="Trail Source Unavailable"
                    message={
                      exploreSourceDiagnostics.offlineModeActive
                        ? 'Explore is offline and no local trail source is available yet.'
                        : 'Explore did not load reviewed trail sources for this session. Refresh Explore once shell state settles.'
                    }
                  />
                ) : visibleHiddenGemRoutes.length === 0 ? (
                  <ExplorerStateCard
                    icon="diamond-outline"
                    title="No Hidden Gems in Range"
                    message={
                      hiddenGemDiagnostics.rawCandidateCount === 0
                        ? `The trail source is loaded, but no drivable routes fell inside ${exploreFilterNarrative} for Hidden Gems review.`
                        : hasGPSFix
                        ? `Routes were evaluated inside ${exploreFilterNarrative}, but none qualified as exploratory off-road candidates for your current rig after the active trail filters were applied.`
                        : `Explore is still using the default search location until live GPS becomes available. Routes were evaluated inside ${exploreFilterNarrative}, but none qualified as exploratory off-road candidates after the active trail filters were applied.`
                    }
                  />
                ) : (
                  <>
                    <ScrollView
                      style={s.sectionCardViewport}
                      contentContainerStyle={[
                        s.routeCardGrid,
                        s.sectionCardViewportContent,
                        showExploreRouteGrid && s.routeCardGridExpanded,
                      ]}
                      nestedScrollEnabled
                      showsVerticalScrollIndicator={visibleHiddenGemRoutes.length > 3}
                    >
                      {visibleHiddenGemRoutes.map((route) => (
                          <View key={route.id} style={[s.hiddenGemCardWrap, routeCardWidth ? { width: routeCardWidth } : null]}>
                            <EnrichedRouteCard
                              route={route}
                              hasVehicle={!!activeVehicleId}
                              isFavorited={favoriteTrailIds.has(String(route.id))}
                              presentationVariant="hidden-gem"
                              collectionLabel="Hidden Gems"
                              thumbnailOverride={hiddenGemThumbnailAssignments.get(String(route.id)) ?? null}
                              onSelect={() => handleSelectOpportunity(route)}
                              onNavigate={() => {
                                void handleNavigateToRoute(route);
                              }}
                              onToggleFavorite={() => handleToggleFavorite(route)}
                              isCompleted={completedIds?.has(route.id) ?? false}
                              compactPreview
                            />
                          </View>
                        ))}
                    </ScrollView>

                    {hiddenGemPage.eligibleCount > hiddenGemPage.pageSize && (
                      <TouchableOpacity
                        style={s.hiddenGemPagerBtn}
                        activeOpacity={0.82}
                        onPress={handleAdvanceHiddenGems}
                      >
                        <Ionicons
                          name="chevron-forward-outline"
                          size={14}
                          color={TACTICAL.amber}
                        />
                        <Text style={s.hiddenGemPagerText}>
                          {`${hiddenGemPage.pageIndex + 1 >= hiddenGemPageCount ? 'RESTART' : 'NEXT'} ${hiddenGemPage.pageSize}`}
                        </Text>
                      </TouchableOpacity>
                    )}
                  </>
                )}
              </ECSSection>

              <ECSSection style={s.discoverySection}>
                <ECSSectionHeader
                  title="ECS ROUTE IDEAS"
                  icon="sparkles-outline"
                  accentColor="#5AC8FA"
                  badge={
                    <ECSSectionBadge
                      label={
                        aiRouteIdeaPage.eligibleCount === 0
                          ? 'NO IDEAS'
                          : `${aiRouteIdeaWindowStart}-${aiRouteIdeaWindowEnd} OF ${aiRouteIdeaPage.eligibleCount}`
                      }
                    />
                  }
                />
                <Text style={s.discoverySectionDescription}>
                  Optional ECS route ideas for drivable off-road trails inside {exploreFilterNarrative}.
                </Text>

                <View style={s.routeCardMetaRow}>
                  {aiEnabled && (
                    <View style={s.lesserKnownBadge}>
                      <Ionicons name="sparkles-outline" size={8} color="#5AC8FA" />
                      <Text style={[s.lesserKnownText, { color: '#5AC8FA' }]}>ECS AVAILABLE</Text>
                    </View>
                  )}
                  <View style={[s.categoryBadge, { borderColor: '#5AC8FA30' }]}>
                    <Text style={[s.categoryBadgeText, { color: '#5AC8FA' }]}>{distanceRadiusMetaLabel.toUpperCase()}</Text>
                  </View>
                </View>

                {visibleAIRoutes.length === 0 && !aiLoading && !aiError && (
                  <View style={s.emptyRouteCard}>
                    <Ionicons name="sparkles-outline" size={20} color={TACTICAL.textMuted} />
                    <Text style={s.emptyRouteCardTitle}>NO ECS ROUTE IDEAS YET</Text>
                    <Text style={s.emptyRouteCardText}>
                      ECS route ideas appear automatically when matching suggestions are available inside the active range.
                    </Text>
                  </View>
                )}

                {!aiLoading && aiError && visibleAIRoutes.length === 0 && (
                  <View style={s.aiErrorContainer}>
                    <Ionicons name="cloud-offline-outline" size={16} color={TACTICAL.textMuted} />
                    <Text style={s.aiErrorText}>{ECS_STATE_COPY.recovery.exploreIdeasLimited.message}</Text>
                    <TouchableOpacity style={s.aiRetryBtn} onPress={handleFetchAIRoutes} activeOpacity={0.7}>
                      <Ionicons name="refresh-outline" size={10} color={TACTICAL.amber} />
                      <Text style={s.aiRetryBtnText}>{ECS_STATE_COPY.recovery.exploreIdeasLimited.ctaLabel.toUpperCase()}</Text>
                    </TouchableOpacity>
                  </View>
                )}

                {aiLoading && visibleAIRoutes.length === 0 && (
                  <View style={s.aiLoadingContainer}>
                    <ActivityIndicator size="small" color="#5AC8FA" />
                    <Text style={s.aiLoadingText}>REFINING ECS ROUTE IDEAS...</Text>
                    <Text style={s.aiLoadingSubText}>Keeping the current Explore results visible while suggestions refresh.</Text>
                  </View>
                )}

                {visibleAIRoutes.length > 0 && (
                  <>
                    <ScrollView
                      style={s.sectionCardViewport}
                      contentContainerStyle={s.sectionCardViewportContent}
                      nestedScrollEnabled
                      showsVerticalScrollIndicator={visibleAIRoutes.length > 3}
                    >
                      {visibleAIRoutes.map((route) => (
                        <AIRouteCard
                          key={route.id}
                          route={route}
                          enrichedRoute={enrichedAIMap.get(route.id) ?? null}
                          hasVehicle={!!activeVehicleId}
                          isFavorited={favoriteTrailIds.has(String(route.id))}
                          thumbnailOverride={aiRouteThumbnailAssignments.get(String(route.id)) ?? null}
                          onPreview={() => handleAIPreview(route)}
                          onNavigate={() => {
                            void handleNavigateToRoute(route);
                          }}
                          onToggleFavorite={() => handleToggleFavorite(route)}
                          onBuildRoute={() => {
                            handleBuildTripFromRoute(route);
                          }}
                          compactPreview
                        />
                      ))}
                    </ScrollView>

                    {aiRouteIdeaPage.eligibleCount > aiRouteIdeaPage.pageSize && (
                      <TouchableOpacity
                        style={[s.hiddenGemPagerBtn, s.aiRouteIdeaPagerBtn]}
                        activeOpacity={0.82}
                        onPress={handleAdvanceAIRouteIdeas}
                      >
                        <Ionicons
                          name="chevron-forward-outline"
                          size={14}
                          color="#5AC8FA"
                        />
                        <Text style={[s.hiddenGemPagerText, s.aiRouteIdeaPagerText]}>
                          {`${aiRouteIdeaPage.pageIndex + 1 >= aiRouteIdeaPageCount ? 'RESTART' : 'NEXT'} ${aiRouteIdeaPage.pageSize}`}
                        </Text>
                      </TouchableOpacity>
                    )}
                  </>
                )}
              </ECSSection>

              <ECSSection style={s.discoverySection}>
                <ECSSectionHeader
                  title="FAVORITES"
                  icon="star-outline"
                  accentColor={TACTICAL.amber}
                  badge={<ECSSectionBadge label={favoritesTotal > 0 ? `${favoritesTotal} SAVED` : 'EMPTY'} />}
                />

                {favoritesTotal === 0 ? (
                  <View style={s.favoriteEmptyCompact}>
                    <Ionicons name="star-outline" size={14} color={TACTICAL.amber} />
                    <Text style={s.favoriteEmptyCompactText}>
                      Save trails from Hidden Gems, Trail Packs, or ECS Route Ideas to reopen them later.
                    </Text>
                  </View>
                ) : (
                  <>
                    <View style={s.favoriteUtilitySummary}>
                      <View style={s.favoriteUtilityBadges}>
                        <View style={s.gemMetaBadge}>
                          <Text style={s.gemMetaBadgeText}>{favoriteTrails.length} TRAILS</Text>
                        </View>
                        <View style={s.gemMetaBadge}>
                          <Text style={s.gemMetaBadgeText}>{favoritePlans.length} STACKS</Text>
                        </View>
                      </View>
                      <Text style={s.favoriteUtilitySummaryText} numberOfLines={2}>
                        {favoritesSummaryText}
                      </Text>
                    </View>

                    <View style={s.favoriteSectionToggleRow}>
                      <TouchableOpacity
                        style={[
                          s.favoriteUtilityToggle,
                          favoritesExpanded && s.favoriteUtilityToggleActive,
                        ]}
                        activeOpacity={0.82}
                        onPress={handleToggleFavoritesExpanded}
                      >
                        <Text
                          style={[
                            s.favoriteUtilityToggleText,
                            favoritesExpanded && s.favoriteUtilityToggleTextActive,
                          ]}
                        >
                          {favoritesExpanded ? 'COLLAPSE' : 'VIEW ALL'}
                        </Text>
                        <Ionicons
                          name={favoritesExpanded ? 'chevron-up-outline' : 'chevron-down-outline'}
                          size={12}
                          color={favoritesExpanded ? TACTICAL.amber : TACTICAL.textMuted}
                        />
                      </TouchableOpacity>
                    </View>

                    {favoritesExpanded && (
                      <>
                        <View style={s.favoriteSegmentWrap}>
                          <ECSSegmentedControl
                            options={[
                              { key: 'trails', label: 'TRAILS', badge: favoriteTrails.length > 0 ? favoriteTrails.length : null },
                              { key: 'plans', label: 'PLANS', badge: favoritePlans.length > 0 ? favoritePlans.length : null },
                            ]}
                            value={favoritesView}
                            onChange={(next) => {
                              hapticMicro();
                              setFavoritesView(next as 'trails' | 'plans');
                              if (next === 'plans') {
                                exitFavoritesPlanMode();
                              }
                            }}
                          />
                        </View>

                        {favoritesView === 'trails' ? (
                          <>
                            <View style={s.favoriteToolbar}>
                              {favoritesPlanMode ? (
                                <>
                                  <Text style={s.favoriteToolbarText}>
                                    {selectedPlanFavoriteIds.length} selected for stacking
                                  </Text>
                                  <View style={s.favoriteToolbarActions}>
                                    <TouchableOpacity
                                      style={s.favoriteToolbarBtn}
                                      activeOpacity={0.78}
                                      onPress={exitFavoritesPlanMode}
                                    >
                                      <Text style={s.favoriteToolbarBtnText}>CANCEL</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                      style={[
                                        s.favoriteToolbarPrimaryBtn,
                                        selectedPlanFavoriteIds.length < 2 && s.favoriteToolbarPrimaryBtnDisabled,
                                      ]}
                                      activeOpacity={selectedPlanFavoriteIds.length < 2 ? 1 : 0.82}
                                      disabled={selectedPlanFavoriteIds.length < 2}
                                      onPress={handleBeginCreatePlan}
                                    >
                                      <Text style={s.favoriteToolbarPrimaryText}>CREATE STACK</Text>
                                    </TouchableOpacity>
                                  </View>
                                </>
                              ) : (
                                <>
                                  <Text style={s.favoriteToolbarText}>
                                    Tap a saved trail to reopen it. Navigate stays one tap away.
                                  </Text>
                                  <TouchableOpacity
                                    style={s.favoritePlannerBtn}
                                    activeOpacity={0.8}
                                    onPress={handleToggleFavoritesPlanMode}
                                  >
                                    <Ionicons name="checkmark-circle-outline" size={11} color={TACTICAL.amber} />
                                    <Text style={s.favoritePlannerBtnText}>SELECT</Text>
                                  </TouchableOpacity>
                                </>
                              )}
                            </View>

                            {favoriteTrails.length === 0 ? (
                              <ECSResultsEmptyState
                                style={s.favoriteEmptyState}
                                title={ECS_STATE_COPY.explore.noFavoritesSaved.title}
                                message="Save a trail in Hidden Gems, Trail Packs, or ECS Route Ideas to keep it here."
                                icon="star-outline"
                                variant="compact"
                              />
                            ) : (
                              favoriteTrailListScrollable ? (
                                <ScrollView
                                  style={
                                    favoriteTrailViewportHeight
                                      ? [s.favoriteScrollViewport, { maxHeight: favoriteTrailViewportHeight }]
                                      : undefined
                                  }
                                  contentContainerStyle={s.favoriteList}
                                  showsVerticalScrollIndicator
                                  nestedScrollEnabled
                                >
                                  {favoriteTrailCards}
                                </ScrollView>
                              ) : (
                                <View style={s.favoriteList}>{favoriteTrailCards}</View>
                              )
                            )}
                          </>
                        ) : (
                          favoritePlans.length > 0 ? (
                            favoritePlanListScrollable ? (
                              <ScrollView
                                style={
                                  favoritePlanViewportHeight
                                    ? [s.favoriteScrollViewport, { maxHeight: favoritePlanViewportHeight }]
                                    : undefined
                                }
                                contentContainerStyle={s.favoritePlanList}
                                showsVerticalScrollIndicator
                                nestedScrollEnabled
                              >
                                {favoritePlanCards}
                              </ScrollView>
                            ) : (
                              <View style={s.favoritePlanList}>{favoritePlanCards}</View>
                            )
                          ) : (
                            <ECSResultsEmptyState
                              style={s.favoriteEmptyState}
                              title="No Stacked Plans Yet"
                              message="Switch to Trails, select multiple favorites, then create a stack for later review."
                              icon="git-merge-outline"
                              variant="compact"
                            />
                          )
                        )}
                      </>
                    )}
                  </>
                )}
              </ECSSection>
            </>
          )}

            </>
          ) : activeExplorePrimaryTab === 'offline_prep_pack' ? (
            <View style={s.explorePlanningPanel} testID="explore-offline_prep_pack-tab-panel">
              <View style={s.explorePlanningHero}>
                <View
                  style={[
                    s.explorePlanningHeroIcon,
                    {
                      borderColor: '#5AC8FA38',
                      backgroundColor: '#5AC8FA10',
                    },
                  ]}
                >
                  <Ionicons
                    name="download-outline"
                    size={18}
                    color="#5AC8FA"
                  />
                </View>
                <View style={s.explorePlanningHeroCopy}>
                  <Text style={s.explorePlanningEyebrow}>EXPLORER PLANNING</Text>
                  <Text style={s.explorePlanningTitle}>Offline Prep Pack</Text>
                  <Text style={s.explorePlanningText}>
                    Choose from the active Guidance Ready filter, then save route essentials for low-service travel.
                  </Text>
                </View>
              </View>

              <View style={s.explorePlanningContextRow}>
                <View style={s.explorePlanningContextPill}>
                  <Ionicons name="locate-outline" size={10} color={TACTICAL.textMuted} />
                  <Text style={s.explorePlanningContextText}>{distanceRadiusFooterLabel}</Text>
                </View>
                {selectedExploreRefinementLabel ? (
                  <View style={s.explorePlanningContextPill}>
                    <Ionicons name="options-outline" size={10} color={TACTICAL.textMuted} />
                    <Text style={s.explorePlanningContextText}>{selectedExploreRefinementLabel}</Text>
                  </View>
                ) : null}
                <View style={s.explorePlanningContextPill}>
                  <Ionicons name="trail-sign-outline" size={10} color={TACTICAL.textMuted} />
                  <Text style={s.explorePlanningContextText}>
                    {publicSuggestedTrailheadRoutes.length} READY ROUTE{publicSuggestedTrailheadRoutes.length === 1 ? '' : 'S'}
                  </Text>
                </View>
              </View>

              {publicSuggestedTrailheadRoutes.length === 0 ? (
                <ECSResultsEmptyState
                  style={s.explorePlanningEmpty}
                  title={liveTrailPackCatalogSnapshot.coverageState.title || 'No verified routes yet in this area'}
                  message={liveTrailPackCatalogSnapshot.coverageState.message || 'No live reviewed Trail Packs found within this radius. No verified routes yet in this area. Try expanding your radius or import a GPX as a private pending suggestion.'}
                  icon="map-outline"
                  variant="compact"
                />
              ) : (
                <>
                  <View style={s.explorePlanningRouteList}>
                    <TouchableOpacity
                      style={s.explorePlanningRouteOption}
                      activeOpacity={0.82}
                      onPress={() => {
                        hapticMicro();
                        saveExplorePlanningRouteContext({
                          routes: publicSuggestedTrailheadRoutes as any,
                          radiusMiles: activeDistanceRadius,
                          refinementLabel: selectedExploreRefinementLabel,
                          source: 'offline_prep_tab',
                        });
                        clearOfflinePrepPackHandoff();
                        pushSingleFlight({
                          pathname: '/explore-offline-prep-pack',
                          params: { action: 'import' },
                        } as any);
                      }}
                      accessibilityRole="button"
                      accessibilityLabel="Import GPX or route file for Offline Prep"
                      testID="explore-offline-prep-import-route-file"
                    >
                      <Ionicons
                        name="document-attach-outline"
                        size={14}
                        color={TACTICAL.amber}
                      />
                      <View style={s.explorePlanningRouteCopy}>
                        <Text style={s.explorePlanningRouteTitle} numberOfLines={1}>Import GPX / Route File</Text>
                        <Text style={s.explorePlanningRouteMeta} numberOfLines={1}>
                          Use a route file from this device
                        </Text>
                      </View>
                    </TouchableOpacity>
                    {publicSuggestedTrailheadRoutes.slice(0, 7).map((route) => {
                      const selected = String(route.id) === String(selectedExplorePlanningRoute?.id);
                      return (
                        <TouchableOpacity
                          key={route.id}
                          style={[s.explorePlanningRouteOption, selected && s.explorePlanningRouteOptionSelected]}
                          activeOpacity={0.82}
                          onPress={() => {
                            hapticMicro();
                            setExplorePlanningSelectedRouteId(String(route.id));
                          }}
                          accessibilityRole="button"
                          accessibilityLabel={`Select ${route.name}`}
                          accessibilityState={{ selected }}
                          testID={`explore-planning-route-option-${route.id}`}
                        >
                          <Ionicons
                            name={selected ? 'checkmark-circle' : 'map-outline'}
                            size={14}
                            color={selected ? TACTICAL.amber : TACTICAL.textMuted}
                          />
                          <View style={s.explorePlanningRouteCopy}>
                            <Text style={s.explorePlanningRouteTitle} numberOfLines={1}>{route.name}</Text>
                            <Text style={s.explorePlanningRouteMeta} numberOfLines={1}>
                              {route.region} | {Number.isFinite(Number(route.distanceMiles)) ? `${Math.round(Number(route.distanceMiles))} mi` : 'Distance unknown'}
                            </Text>
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  <TouchableOpacity
                    style={s.explorePlanningPrimaryButton}
                    activeOpacity={0.84}
                    onPress={handleOpenActivePlanningFlow}
                    accessibilityRole="button"
                    accessibilityLabel="Open Offline Prep Pack"
                    testID="explore-open-offline-prep-pack"
                  >
                    <Ionicons
                      name="download-outline"
                      size={14}
                      color="#081014"
                    />
                    <Text style={s.explorePlanningPrimaryText}>Open Offline Prep Pack</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          ) : null}

          <View style={{ height: 20 }} />
        </ScrollView>

        {activeExplorerCategoryConfig && (
          <View style={s.explorerPanelLayer} pointerEvents="box-none">
            <View style={[s.explorerPanelShell, contentFrameStyle]} pointerEvents="auto">
              <View style={s.explorerPanelHeader}>
                <View style={s.explorerPanelTitleWrap}>
                  <View
                    style={[
                      s.explorerPanelIconWrap,
                      {
                        borderColor: `${activeExplorerCategoryConfig.accentColor}42`,
                        backgroundColor: `${activeExplorerCategoryConfig.accentColor}12`,
                      },
                    ]}
                  >
                    <Ionicons
                      name={activeExplorerCategoryConfig.icon as any}
                      size={16}
                      color={activeExplorerCategoryConfig.accentColor}
                    />
                  </View>
                  <View style={s.explorerPanelTitleCopy}>
                    <Text style={s.explorerPanelEyebrow}>EXPLORE CATEGORY</Text>
                    <Text style={s.explorerPanelTitle}>{activeExplorerCategoryConfig.label}</Text>
                    <Text style={s.explorerPanelSubtitle} numberOfLines={2}>
                      {activeExplorerCategoryConfig.description}
                    </Text>
                  </View>
                </View>

                <TouchableOpacity
                  style={s.explorerPanelClose}
                  activeOpacity={0.78}
                  onPress={handleCloseExplorerCategoryPanel}
                  accessibilityRole="button"
                  accessibilityLabel="Close Explore category panel"
                >
                  <Ionicons name="close" size={18} color={TACTICAL.text} />
                </TouchableOpacity>
              </View>

              <View style={s.explorerPanelMetaRow}>
                <View style={s.explorerPanelCountBadge}>
                  <Text style={s.explorerPanelCountText}>
                    {activeExplorerPanelPage.totalItems} {activeExplorerPanelItemLabel}{activeExplorerPanelPage.totalItems === 1 ? '' : 'S'}
                  </Text>
                </View>
                <View style={s.explorerPanelCountBadge}>
                  <Text style={s.explorerPanelCountText}>
                    {activeExplorerPanelPage.totalItems === 0
                      ? '0 OF 0'
                      : `${activeExplorerPanelPage.windowStart}-${activeExplorerPanelPage.windowEnd} OF ${activeExplorerPanelPage.totalItems}`}
                  </Text>
                </View>
              </View>

              <ScrollView
                style={s.explorerPanelScroll}
                contentContainerStyle={s.explorerPanelScrollContent}
                nestedScrollEnabled
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator
              >
                {renderExplorerCategoryPanelContent()}
              </ScrollView>

              {activeExplorerPanelPage.totalPages > 1 && (
                <View style={s.explorerPanelPager}>
                  {activeExplorerPanelPage.pageIndex > 0 ? (
                    <TouchableOpacity
                      style={s.explorerPanelPagerBtn}
                      activeOpacity={0.78}
                      onPress={() => handleChangeExplorerCategoryPage(-1)}
                    >
                      <Ionicons name="chevron-back-outline" size={13} color={TACTICAL.amber} />
                      <Text style={s.explorerPanelPagerText}>PREVIOUS</Text>
                    </TouchableOpacity>
                  ) : (
                    <View style={s.explorerPanelPagerSlot} />
                  )}

                  <Text style={s.explorerPanelPageLabel}>
                    PAGE {activeExplorerPanelPage.pageIndex + 1} / {activeExplorerPanelPage.totalPages}
                  </Text>

                  {activeExplorerPanelPage.pageIndex + 1 < activeExplorerPanelPage.totalPages ? (
                    <TouchableOpacity
                      style={s.explorerPanelPagerBtn}
                      activeOpacity={0.78}
                      onPress={() => handleChangeExplorerCategoryPage(1)}
                    >
                      <Text style={s.explorerPanelPagerText}>NEXT</Text>
                      <Ionicons name="chevron-forward-outline" size={13} color={TACTICAL.amber} />
                    </TouchableOpacity>
                  ) : (
                    <View style={s.explorerPanelPagerSlot} />
                  )}
                </View>
              )}
            </View>
          </View>
        )}
        </View>

          {exploreEntryChromeReady ? (
            <View style={[s.footer, contentFrameStyle]}>
              <Text style={s.footerText}>
              {`EXPEDITION COMMAND SYSTEM | ${totalRouteCount} ROUTE${totalRouteCount !== 1 ? 'S' : ''} | ${distanceRadiusFooterLabel}${selectedExploreRefinementLabel ? ` | ${selectedExploreRefinementLabel.toUpperCase()}` : ''} | ${hiddenGemPage.eligibleCount} PICKS | ${trailPackPage.eligibleCount} TRAIL PACK${trailPackPage.eligibleCount === 1 ? '' : 'S'} | ALL DRIVABLE TRAILS${refinedAIRoutes.length > 0 ? ` | ${refinedAIRoutes.length} ECS` : ''}`}
              </Text>
            </View>
          ) : (
            <View style={[s.footerDeferredPlaceholder, contentFrameStyle]} />
          )}

        <ExpeditionAnalysisModal
          visible={analysisVisible}
          opportunity={selectedOpportunity}
          compatResult={selectedOpportunity ? (compatResults.get(selectedOpportunity.id) || null) : null}
          vehicleProfile={vehicleProfile}
          hasVehicle={!!activeVehicleId}
          onClose={handleCloseAnalysis}
          onBuildRoute={selectedOpportunity ? () => { void handleNavigateToRoute(selectedOpportunity); } : undefined}
          buildRouteDisabled={!!selectedOpportunityBuildUnavailableReason}
          buildRouteDisabledReason={selectedOpportunityBuildUnavailableReason}
          campsActionAvailable={selectedOpportunityCampMarkers.length > 0}
          onViewCamps={
            selectedOpportunity && selectedOpportunityCampMarkers.length > 0
              ? () => { void handleViewRouteCamps(selectedOpportunity); }
              : undefined
          }
          footerExtra={
            selectedOpportunity ? (
              <>
                <TouchableOpacity
                  style={s.offlinePrepFooterBtn}
                  activeOpacity={0.84}
                  onPress={() => { handleBuildTripFromRoute(selectedOpportunity); }}
                  accessibilityRole="button"
                  accessibilityLabel="Build Trip"
                  testID="selected-route-build-trip"
                >
                  <Ionicons name="git-merge-outline" size={14} color={TACTICAL.amber} />
                  <Text style={s.offlinePrepFooterText} numberOfLines={2}>BUILD{'\n'}TRIP</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={s.offlinePrepFooterBtn}
                  activeOpacity={0.84}
                  onPress={() => { handlePrepareOfflineFromRoute(selectedOpportunity); }}
                  accessibilityRole="button"
                  accessibilityLabel="Prepare Offline Pack"
                  testID="selected-route-prepare-offline-pack"
                >
                  <Ionicons name="download-outline" size={14} color={TACTICAL.amber} />
                  <Text style={s.offlinePrepFooterText} numberOfLines={2}>PREP{'\n'}OFFLINE</Text>
                </TouchableOpacity>
                <MissionCommandProposalAction
                  label="Coordinate Route"
                  accessibilityLabel={`Coordinate a route review for ${selectedOpportunity.name} in Mission Command`}
                  buildProposal={() => {
                    const sourceTruth = {
                      id: `explore-route:${selectedOpportunity.id}`,
                      origin: 'cached' as const,
                      role: 'primary' as const,
                      policyKey: 'route_legal_access_evidence' as const,
                      authority: selectedOpportunity.routeAuthorityLabel ?? 'Explore route catalog',
                      authorityKind: 'mixed' as const,
                      provider: selectedOpportunity.routeAuthoritySource ?? null,
                      observedAt: null,
                      fetchedAt: null,
                      expiresAt: null,
                      confidence: selectedOpportunity.hasTrueTrailGeometry ? 'medium' as const : 'low' as const,
                      coverage: selectedOpportunity.hasTrueTrailGeometry ? 'complete' as const : 'partial' as const,
                      availability: selectedOpportunity.hasTrueTrailGeometry ? 'usable' as const : 'degraded' as const,
                      conflictState: 'none' as const,
                      conflict: false,
                      warningCodes: selectedOpportunity.hasTrueTrailGeometry ? [] : ['explore_route_geometry_missing'],
                    };
                    return createExploreMissionCommandProposal({
                      sourceEntityId: selectedOpportunity.id,
                      sourceSurface: 'explore',
                      planningAction: 'route_review',
                      title: `Coordinate route review: ${selectedOpportunity.name}`,
                      summary: selectedOpportunity.routeAuthorityNotice ?? selectedOpportunity.description,
                      sourceTruth: [sourceTruth],
                      linkedContext: {
                        id: selectedOpportunity.id,
                        type: 'route',
                        title: selectedOpportunity.name,
                        subtitle: `${selectedOpportunity.region} / ${selectedOpportunity.distanceMiles.toFixed(1)} mi`,
                        sourceTruth,
                        sourceTruthPolicyKey: 'route_legal_access_evidence',
                        metadata: {
                          routeTypeStatus: selectedOpportunity.routeTypeStatus ?? null,
                          hasTrueTrailGeometry: selectedOpportunity.hasTrueTrailGeometry === true,
                        },
                      },
                      action: 'create_command',
                      command: {
                        type: 'route',
                        priority: selectedOpportunity.hasTrueTrailGeometry ? 'normal' : 'high',
                        title: `Review ${selectedOpportunity.name}`,
                        instructions: selectedOpportunity.hasTrueTrailGeometry
                          ? 'Review the route source, access evidence, preparation milestones, and team coordination before activation.'
                          : 'Route geometry is incomplete. Resolve the missing route data before using this plan for guidance.',
                      },
                      facts: [
                        { key: 'region', label: 'Region', value: selectedOpportunity.region },
                        { key: 'route_authority', label: 'Route authority', value: selectedOpportunity.routeAuthorityLabel ?? 'Unknown' },
                      ],
                      operatorRequested: true,
                      returnRoute: '/discover',
                    });
                  }}
                  grow
                />
              </>
            ) : null
          }
        />

        <TrailPackPreviewModal
          visible={!!trailPackPreview}
          trailPack={trailPackPreview}
          isSaved={
            trailPackPreview
              ? favoriteTrailIds.has(String(trailPackToExpeditionOpportunity(trailPackPreview).id))
              : false
          }
          onClose={handleCloseTrailPackPreview}
          onRoutePreview={
            trailPackPreview
              ? () => {
                  void handleNavigateToRoute(trailPackToExpeditionOpportunity(trailPackPreview), {
                    flowLabel: 'Route Preview',
                    flowMessage: 'Trail Pack is staged in Navigate. Review the map overview, then start when ready.',
                  });
                }
              : undefined
          }
          onBuildTrip={() => {
            if (trailPackPreview) handleBuildTripFromRoute(trailPackToExpeditionOpportunity(trailPackPreview));
          }}
          onStartGuidance={() => {
            if (trailPackPreview) void handleStartTrailPackGuidance(trailPackPreview);
          }}
          onSave={() => {
            if (!trailPackPreview) return;
            const trailPackRoute = trailPackToExpeditionOpportunity(trailPackPreview);
            handleToggleFavorite(trailPackRoute);
            handleTrailPackFeedback(trailPackPreview.id, 'saved');
          }}
          onFeedback={(type, note) =>
            trailPackPreview
              ? handleTrailPackFeedback(trailPackPreview.id, type, note)
              : { ok: false, reason: 'Trail Pack preview unavailable.' }
          }
          offlineCacheAvailable={Boolean(trailPackPreview?.catalogVerification?.offlineCache?.cacheable)}
          onCacheOffline={() => {
            if (trailPackPreview) handleCacheTrailPackOffline(trailPackPreview);
          }}
          detailLoading={trailPackPreviewDetailStatus === 'loading'}
          detailError={trailPackPreviewDetailError}
        />

        <TrailPackSubmissionModal
          visible={!!trailPackSubmissionRoute}
          routeInput={trailPackSubmissionRoute}
          currentLocation={hasGPSFix ? { latitude: userLat, longitude: userLng } : null}
          onClose={() => setTrailPackSubmissionRoute(null)}
          onSubmitted={handleTrailPackSubmitted}
        />

        {/* ── Phase 18: AI Route Preview Modal with enrichment ── */}
        <TacticalPopupShell
          visible={planBuilderVisible}
          onClose={closePlanBuilder}
          title={editingPlanId ? 'EDIT STACKED PLAN' : 'STACK FAVORITE TRAILS'}
          icon="reorder-three-outline"
          eyebrow="EXPLORE FAVORITES"
          subtitle="Review the saved trail order below and keep the stack ready for later Navigate handoff."
          overlayClass="editor"
          maxWidth={760}
          footer={
            <View style={s.planModalFooter}>
              <TouchableOpacity
                style={s.planModalSecondaryBtn}
                activeOpacity={0.8}
                onPress={closePlanBuilder}
              >
                <Text style={s.planModalSecondaryText}>CANCEL</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  s.planModalPrimaryBtn,
                  selectedPlanFavoriteIds.length < 2 && s.planModalPrimaryBtnDisabled,
                ]}
                activeOpacity={selectedPlanFavoriteIds.length < 2 ? 1 : 0.85}
                onPress={handleSavePlan}
                disabled={selectedPlanFavoriteIds.length < 2}
              >
                <Text style={s.planModalPrimaryText}>
                  {editingPlanId ? 'SAVE PLAN' : 'CREATE STACK'}
                </Text>
              </TouchableOpacity>
            </View>
          }
        >
          <View style={s.planModalSection}>
            <Text style={s.planModalTitle}>Order your saved trail stack</Text>
            <Text style={s.planModalBody}>
              Arrange this sequence the way you want to run or evaluate it later. ECS will preserve the saved order for future Navigate or Expedition planning.
            </Text>
          </View>

          <View style={s.planModalSelectedHeader}>
            <Text style={s.planModalSectionLabel}>TRAIL ORDER</Text>
            <Text style={s.planModalSectionMeta}>{selectedPlanFavoriteIds.length} trails in stack</Text>
          </View>

          {selectedPlanFavorites.length === 0 ? (
            <View style={s.planModalEmptyState}>
              <Ionicons name="reorder-three-outline" size={18} color={TACTICAL.textMuted} />
              <Text style={s.planModalEmptyTitle}>NOT ENOUGH TRAILS SELECTED</Text>
              <Text style={s.planModalEmptyText}>
                Select at least two saved favorites before creating or editing a stack.
              </Text>
            </View>
          ) : (
            <View style={s.planSelectionList}>
              {selectedPlanFavorites.map((favorite, index) => (
                <View key={favorite.favoriteId} style={s.planSelectionCard}>
                  <View style={s.planDragHandle}>
                    <Ionicons name="reorder-three-outline" size={16} color={TACTICAL.textMuted} />
                  </View>
                  <View style={s.planSelectionIndex}>
                    <Text style={s.planSelectionIndexText}>{index + 1}</Text>
                  </View>
                  <View style={s.planSelectionCopy}>
                    <Text style={s.planSelectionTitle} numberOfLines={1}>{favorite.title}</Text>
                    <Text style={s.planSelectionSubtitle} numberOfLines={1}>
                      {favorite.subtitle ?? 'Saved from Explore'}
                    </Text>
                  </View>
                  <View style={s.planSelectionActions}>
                    <TouchableOpacity
                      style={s.planOrderBtn}
                      activeOpacity={0.75}
                      onPress={() => handleRemovePlanDraftItem(favorite.favoriteId)}
                    >
                      <Ionicons name="close-outline" size={12} color={TACTICAL.textMuted} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={s.planOrderBtn}
                      activeOpacity={0.75}
                      onPress={() => handleMoveSelectedFavorite(favorite.favoriteId, -1)}
                      disabled={index === 0}
                    >
                      <Ionicons name="chevron-up-outline" size={12} color={index === 0 ? TACTICAL.textMuted : TACTICAL.amber} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={s.planOrderBtn}
                      activeOpacity={0.75}
                      onPress={() => handleMoveSelectedFavorite(favorite.favoriteId, 1)}
                      disabled={index === selectedPlanFavorites.length - 1}
                    >
                      <Ionicons
                        name="chevron-down-outline"
                        size={12}
                        color={index === selectedPlanFavorites.length - 1 ? TACTICAL.textMuted : TACTICAL.amber}
                      />
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </View>
          )}
        </TacticalPopupShell>

        <AIRoutePreviewModal
          visible={aiPreviewVisible}
          route={aiPreviewRoute}
          enrichedRoute={aiPreviewRoute ? (enrichedAIMap.get(aiPreviewRoute.id) ?? null) : null}
          hasVehicle={!!activeVehicleId}
          onClose={handleCloseAIPreview}
          onRoutePreview={
            aiPreviewRoute
              ? () => {
                  void handleNavigateToRoute(aiPreviewRoute, {
                    flowLabel: 'Route Preview',
                    flowMessage: 'ECS route idea is staged in Navigate. Review the map overview, then start when ready.',
                  });
                }
              : undefined
          }
          onNavigate={
            aiPreviewRoute
              ? () => {
                  void handleNavigateToRoute(aiPreviewRoute);
                }
              : undefined
          }
          onBuildRoute={
            aiPreviewRoute
              ? () => {
                  handleBuildTripFromRoute(aiPreviewRoute);
                }
              : undefined
          }
          buildRouteDisabled={false}
          buildRouteDisabledReason={null}
        />

      </View>
    </TopoBackground>
  );
}



// ============================================================
// EXPORTED SCREEN
// ============================================================
export default function DiscoverScreen() {
  return (
    <DiscoverErrorBoundary>
      <DiscoverScreenInner />
    </DiscoverErrorBoundary>
  );
}

// ============================================================
// STYLES
// ============================================================
const s = StyleSheet.create({
  safeContainer: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  offlinePrepFooterBtn: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 11,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: TACTICAL.amber + '35',
    backgroundColor: TACTICAL.amber + '0D',
  },
  offlinePrepFooterText: {
    fontSize: 9,
    lineHeight: 11,
    fontWeight: '900',
    color: TACTICAL.amber,
    letterSpacing: 1.8,
    textAlign: 'center',
    textAlignVertical: 'center',
    includeFontPadding: false,
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },

  // ── Header ────────────────────────────────────────────
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  headerBrand: {
    fontSize: 9,
    fontWeight: '600',
    color: TACTICAL.textMuted,
    letterSpacing: 2,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: TACTICAL.amber,
    letterSpacing: 1.5,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    backgroundColor: 'rgba(11,15,18,0.6)',
  },
  statusDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  statusText: {
    fontSize: 7,
    fontWeight: '900',
    letterSpacing: 1,
  },

  goldRail: {
    height: GOLD_RAIL.sectionWidth,
    backgroundColor: GOLD_RAIL.section,
  },

  // ── Scroll ────────────────────────────────────────────
  explorerBody: {
    flex: 1,
    position: 'relative',
  },
  scrollArea: { flex: 1 },
  scrollContent: {
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 14,
    flexGrow: 1,
  },
  explorePrimaryTabs: {
    marginBottom: 8,
  },
  exploreWizardHero: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    borderRadius: ECS.radius,
    borderWidth: 1,
    borderColor: ANDROID_DRAW_OPTIMIZED_SURFACE ? ECS.strokeSoft : TACTICAL.amber + '28',
    backgroundColor: ANDROID_DRAW_OPTIMIZED_SURFACE ? ECS.bgPanel : 'rgba(10,14,17,0.78)',
    padding: 11,
    marginBottom: 8,
  },
  exploreWizardHeroIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: ANDROID_DRAW_OPTIMIZED_SURFACE ? ECS.strokeSoft : TACTICAL.amber + '35',
    backgroundColor: ANDROID_DRAW_OPTIMIZED_SURFACE ? ECS.bgElev : TACTICAL.amber + '0D',
    alignItems: 'center',
    justifyContent: 'center',
  },
  exploreWizardHeroCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  exploreWizardEyebrow: {
    color: TACTICAL.textMuted,
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 1.4,
  },
  exploreWizardTitle: {
    color: TACTICAL.text,
    fontSize: 16,
    lineHeight: 19,
    fontWeight: '900',
  },
  exploreWizardText: {
    color: TACTICAL.textMuted,
    fontSize: 10,
    lineHeight: 14,
    fontWeight: '700',
  },
  exploreWizardStatusCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: ECS.radius,
    borderWidth: 1,
    borderColor: ANDROID_DRAW_OPTIMIZED_SURFACE ? ECS.strokeSoft : TACTICAL.amber + '22',
    backgroundColor: ANDROID_DRAW_OPTIMIZED_SURFACE ? ECS.bgPanel : 'rgba(10,14,17,0.74)',
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  exploreWizardStatusCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  exploreWizardStatusTitle: {
    color: TACTICAL.text,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  exploreWizardStatusText: {
    color: TACTICAL.textMuted,
    fontSize: 9,
    lineHeight: 13,
    fontWeight: '700',
  },
  exploreWizardNotice: {
    color: TACTICAL.amber,
    fontSize: 8,
    lineHeight: 11,
    fontWeight: '900',
    letterSpacing: 0.3,
    marginTop: 2,
  },
  exploreWizardCountPlate: {
    minWidth: 54,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: ANDROID_DRAW_OPTIMIZED_SURFACE ? ECS.strokeSoft : TACTICAL.amber + '35',
    backgroundColor: ANDROID_DRAW_OPTIMIZED_SURFACE ? ECS.bgElev : TACTICAL.amber + '0D',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 7,
  },
  exploreWizardCountValue: {
    color: TACTICAL.amber,
    fontSize: 18,
    lineHeight: 20,
    fontWeight: '900',
  },
  exploreWizardCountLabel: {
    color: TACTICAL.textMuted,
    fontSize: 7,
    lineHeight: 9,
    fontWeight: '900',
    letterSpacing: 1,
  },
  explorePlanningPanel: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: ECS.strokeMuted,
    backgroundColor: ECS.bgPanel,
    padding: 12,
    gap: 10,
  },
  explorePlanningHero: {
    flexDirection: 'row',
    gap: 11,
    alignItems: 'flex-start',
  },
  explorePlanningHeroIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  explorePlanningHeroCopy: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  explorePlanningEyebrow: {
    color: TACTICAL.textMuted,
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 1.4,
  },
  explorePlanningTitle: {
    color: TACTICAL.text,
    fontSize: 16,
    lineHeight: 19,
    fontWeight: '900',
  },
  explorePlanningText: {
    color: TACTICAL.textMuted,
    fontSize: 10,
    lineHeight: 14,
    fontWeight: '700',
  },
  explorePlanningContextRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  explorePlanningContextPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: ECS.stroke,
    backgroundColor: ANDROID_DRAW_OPTIMIZED_SURFACE ? ECS.bgElev : 'rgba(255,255,255,0.025)',
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  explorePlanningContextText: {
    color: TACTICAL.textMuted,
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  explorePlanningEmpty: {
    marginTop: 4,
  },
  explorePlanningRouteList: {
    gap: 7,
  },
  explorePlanningRouteOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: ECS.stroke,
    backgroundColor: ANDROID_DRAW_OPTIMIZED_SURFACE ? ECS.bgElev : 'rgba(255,255,255,0.025)',
    padding: 9,
  },
  explorePlanningRouteOptionSelected: {
    borderColor: `${TACTICAL.amber}50`,
    backgroundColor: ANDROID_DRAW_OPTIMIZED_SURFACE ? ECS.bgPanel : `${TACTICAL.amber}0E`,
  },
  explorePlanningRouteCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  explorePlanningRouteTitle: {
    color: TACTICAL.text,
    fontSize: 11,
    fontWeight: '900',
  },
  explorePlanningRouteMeta: {
    color: TACTICAL.textMuted,
    fontSize: 9,
    fontWeight: '700',
  },
  explorePlanningPrimaryButton: {
    minHeight: 40,
    borderRadius: 12,
    backgroundColor: TACTICAL.amber,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 14,
  },
  explorePlanningPrimaryText: {
    color: '#081014',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  exploreFeatureGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 8,
  },
  exploreFeatureTile: {
    width: '48.7%',
    minHeight: 88,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 10,
    gap: 7,
  },
  exploreFeatureIconWrap: {
    width: 30,
    height: 30,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  exploreFeatureCopy: {
    gap: 2,
    flex: 1,
  },
  exploreFeatureTitle: {
    fontSize: 11,
    lineHeight: 13,
    fontWeight: '900',
    letterSpacing: 0.45,
  },
  exploreFeatureDescription: {
    color: TACTICAL.textMuted,
    fontSize: 8,
    lineHeight: 11,
    fontWeight: '700',
  },
  exploreFeatureBadge: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  exploreFeatureBadgeText: {
    fontSize: 7,
    lineHeight: 9,
    fontWeight: '900',
    letterSpacing: 0.9,
    textTransform: 'uppercase',
  },
  discoveryControlsWrap: {
    marginTop: 3,
    marginBottom: 7,
    gap: 5,
  },
  discoveryRefreshNotice: {
    marginTop: 2,
  },
  exploreMapHandoffCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: ECS.radius,
    borderWidth: 1,
    borderColor: 'rgba(196,138,44,0.22)',
    backgroundColor: 'rgba(10,14,17,0.74)',
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  exploreMapHandoffCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  exploreMapHandoffTitle: {
    color: TACTICAL.text,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  exploreMapHandoffSubtitle: {
    color: TACTICAL.textMuted,
    fontSize: 9,
    lineHeight: 13,
    fontWeight: '700',
  },
  exploreMapHandoffStatsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
    marginTop: 3,
  },
  exploreMapHandoffStatPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 999,
    borderWidth: 1,
    backgroundColor: 'rgba(255,255,255,0.035)',
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  exploreMapHandoffStatValue: {
    fontSize: 9,
    lineHeight: 11,
    fontWeight: '900',
    letterSpacing: 0.4,
  },
  exploreMapHandoffStatLabel: {
    color: TACTICAL.textMuted,
    fontSize: 7,
    lineHeight: 9,
    fontWeight: '900',
    letterSpacing: 0.55,
    textTransform: 'uppercase',
  },
  exploreMapHandoffFlowText: {
    color: TACTICAL.textMuted,
    fontSize: 8,
    lineHeight: 11,
    fontWeight: '700',
    marginTop: 2,
  },
  exploreMapHandoffNotice: {
    color: TACTICAL.amber,
    fontSize: 8,
    lineHeight: 12,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  exploreMapHandoffButton: {
    minHeight: 34,
    borderRadius: 10,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    backgroundColor: TACTICAL.amber,
    borderWidth: 1,
    borderColor: 'rgba(255,220,140,0.5)',
  },
  exploreMapHandoffButtonText: {
    color: '#091014',
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  explorerCategoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 10,
    marginTop: 4,
    marginBottom: 10,
  },
  explorerCategoryTile: {
    width: '48.5%',
    minHeight: 124,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 12,
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.22,
    shadowRadius: 14,
    elevation: 6,
  },
  exploreWizardRouteSurface: {
    gap: 10,
    marginTop: 4,
    marginBottom: 10,
  },
  exploreWizardFilterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
  },
  exploreWizardFilterChip: {
    minHeight: 32,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: ECS.stroke,
    backgroundColor: ECS.bgElev,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  exploreWizardFilterChipActive: {
    borderColor: TACTICAL.amber + '45',
    backgroundColor: TACTICAL.amber + '10',
  },
  exploreWizardFilterText: {
    color: TACTICAL.textMuted,
    fontSize: 8,
    lineHeight: 10,
    fontWeight: '900',
    letterSpacing: 0.9,
    textTransform: 'uppercase',
  },
  exploreWizardFilterTextActive: {
    color: TACTICAL.amber,
  },
  exploreWizardFilterCount: {
    color: TACTICAL.text,
    fontSize: 10,
    lineHeight: 12,
    fontWeight: '900',
  },
  exploreWizardFilterCountActive: {
    color: TACTICAL.amber,
  },
  exploreWizardCardGrid: {
    gap: 10,
  },
  exploreWizardCardGridExpanded: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'stretch',
  },
  exploreWizardRouteList: {
    width: '100%',
  },
  exploreWizardRouteListScrollable: {
    maxHeight: 740,
  },
  exploreWizardRouteListContent: {
    gap: 10,
    paddingBottom: 2,
  },
  exploreWizardRouteListColumn: {
    gap: 10,
    alignItems: 'stretch',
  },
  exploreWizardRouteListFooter: {
    gap: 8,
    paddingTop: 8,
    paddingBottom: 2,
  },
  exploreWizardSkeletonRow: {
    minHeight: 68,
    borderWidth: 1,
    borderColor: ECS.stroke,
    backgroundColor: ECS.bgElev,
    padding: 10,
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
  },
  exploreWizardSkeletonCopy: {
    flex: 1,
    minWidth: 0,
    gap: 7,
  },
  exploreWizardCardWrap: {
    width: '100%',
  },
  exploreWizardEmpty: {
    marginTop: 2,
  },
  explorerCategoryTileGold: {
    borderColor: ECS_SURFACE.border.selected,
    backgroundColor: ECS_SURFACE.background.selected,
  },
  explorerCategoryTileEmpty: {
    opacity: 0.72,
  },
  explorerCategoryIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  explorerCategoryCopy: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 8,
  },
  explorerCategoryTitle: {
    flex: 1,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  explorerCategoryCount: {
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: 0.6,
  },
  explorerCategoryHint: {
    fontSize: 9,
    lineHeight: 13,
    fontWeight: '700',
    color: TACTICAL.textMuted,
  },
  explorerPanelLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 40,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: 'rgba(3,6,9,0.56)',
  },
  explorerPanelShell: {
    flex: 1,
    alignSelf: 'center',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: TACTICAL.amber + '32',
    backgroundColor: 'rgba(8,12,15,0.98)',
    padding: 12,
    gap: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.32,
    shadowRadius: 22,
    elevation: 12,
  },
  explorerPanelHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  explorerPanelTitleWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  explorerPanelIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 13,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  explorerPanelTitleCopy: {
    flex: 1,
    gap: 2,
  },
  explorerPanelEyebrow: {
    fontSize: 7,
    fontWeight: '900',
    letterSpacing: 1.8,
    color: TACTICAL.textMuted,
  },
  explorerPanelTitle: {
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 0.6,
    color: TACTICAL.text,
  },
  explorerPanelSubtitle: {
    fontSize: 10,
    fontWeight: '600',
    lineHeight: 14,
    color: TACTICAL.textMuted,
  },
  explorerPanelClose: {
    width: 34,
    height: 34,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: ECS.stroke,
    backgroundColor: ECS.bgElev,
    alignItems: 'center',
    justifyContent: 'center',
  },
  explorerPanelMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  explorerPanelCountBadge: {
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: TACTICAL.amber + '24',
    backgroundColor: TACTICAL.amber + '0C',
  },
  explorerPanelCountText: {
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 1.2,
    color: TACTICAL.amber,
  },
  explorerPanelScroll: {
    flex: 1,
  },
  explorerPanelScrollContent: {
    paddingBottom: 8,
    gap: 8,
  },
  explorerPanelFavoritesWrap: {
    gap: 10,
  },
  explorerPanelPager: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: ECS.stroke,
  },
  explorerPanelPagerBtn: {
    minWidth: 104,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 9,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: TACTICAL.goldSoft,
    backgroundColor: TACTICAL.goldWash,
  },
  explorerPanelPagerSlot: {
    minWidth: 104,
  },
  explorerPanelPagerBtnDisabled: {
    borderColor: ECS.stroke,
    backgroundColor: ECS.bgElev,
    opacity: 0.56,
  },
  explorerPanelPagerText: {
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 1.2,
    color: TACTICAL.amber,
  },
  explorerPanelPagerTextDisabled: {
    color: TACTICAL.textMuted,
  },
  explorerPanelPageLabel: {
    flex: 1,
    textAlign: 'center',
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 1.2,
    color: TACTICAL.textMuted,
  },
  discoveryFilterSummary: {
    marginTop: 8,
  },
  discoverySummaryBadge: {
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: ECS.stroke,
    backgroundColor: ECS.bgElev,
  },
  discoverySummaryBadgeText: {
    fontSize: 7,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    letterSpacing: 1,
  },
  discoverySection: {
    marginBottom: 12,
    gap: 7,
  },
  hiddenGemSection: {
    borderColor: ECS.strokeMuted,
    backgroundColor: 'rgba(20,16,11,0.96)',
  },
  discoverySectionBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: ECS.stroke,
    backgroundColor: ECS.bgElev,
  },
  discoverySectionBadgeText: {
    fontSize: 8,
    fontWeight: '800',
    color: TACTICAL.amber,
    letterSpacing: 1.1,
  },
  discoverySectionDescription: {
    fontSize: 10,
    fontWeight: '600',
    color: TACTICAL.textMuted,
    lineHeight: 15,
    letterSpacing: 0.2,
    marginBottom: 4,
  },
  hiddenGemCardWrap: {
    marginBottom: 2,
  },
  sectionCardViewport: {
    maxHeight: EXPLORE_SECTION_CARD_VIEWPORT_HEIGHT,
    flexGrow: 0,
  },
  sectionCardViewportContent: {
    paddingBottom: 2,
  },
  sectionStateAction: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: TACTICAL.amber + '35',
    backgroundColor: TACTICAL.amber + '0C',
  },
  sectionStateActionText: {
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 1.4,
    color: TACTICAL.amber,
  },
  routeCardGrid: {
    gap: 4,
  },
  trailPackPanelStack: {
    gap: 10,
  },
  routeCardGridExpanded: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    rowGap: 6,
  },
  inlineSectionNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: ANDROID_DRAW_OPTIMIZED_SURFACE ? ECS.strokeSoft : TACTICAL.amber + '25',
    backgroundColor: ANDROID_DRAW_OPTIMIZED_SURFACE ? ECS.bgPanel : TACTICAL.amber + '0D',
    marginBottom: 4,
  },
  inlineSectionNoticeText: {
    flex: 1,
    fontSize: 10,
    fontWeight: '600',
    color: TACTICAL.textMuted,
    lineHeight: 14,
  },
  inlineSectionNoticeStrong: {
    color: TACTICAL.text,
    fontWeight: '900',
  },
  hiddenGemPagerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'stretch',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: ECS.stroke,
    backgroundColor: ECS.bgElev,
    marginTop: 6,
  },
  hiddenGemPagerText: {
    fontSize: 9,
    fontWeight: '800',
    color: TACTICAL.amber,
    letterSpacing: 1.3,
  },
  aiRouteIdeaPagerBtn: {
    borderColor: '#5AC8FA30',
    backgroundColor: '#5AC8FA0D',
  },
  aiRouteIdeaPagerText: {
    color: '#5AC8FA',
  },
  favoriteUtilityHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  favoriteUtilityTitleWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  favoriteUtilityIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: TACTICAL.amber + '34',
    backgroundColor: TACTICAL.amber + '10',
    alignItems: 'center',
    justifyContent: 'center',
  },
  favoriteUtilityCopy: {
    flex: 1,
    gap: 2,
  },
  favoriteUtilityEyebrow: {
    fontSize: 7,
    fontWeight: '900',
    letterSpacing: 2,
    color: TACTICAL.amber,
  },
  favoriteUtilityTitle: {
    fontSize: 11,
    fontWeight: '800',
    lineHeight: 16,
    color: TACTICAL.text,
  },
  favoriteUtilityToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: ECS.stroke,
    backgroundColor: ECS.bgElev,
  },
  favoriteUtilityToggleActive: {
    borderColor: TACTICAL.amber + '35',
    backgroundColor: TACTICAL.amber + '10',
  },
  favoriteUtilityToggleText: {
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 1.4,
    color: TACTICAL.textMuted,
  },
  favoriteUtilityToggleTextActive: {
    color: TACTICAL.amber,
  },
  favoriteUtilitySummary: {
    gap: 8,
  },
  favoriteUtilityBadges: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  favoriteUtilitySummaryText: {
    fontSize: 10,
    lineHeight: 15,
    color: TACTICAL.textMuted,
  },
  favoriteSectionToggleRow: {
    alignItems: 'flex-start',
  },
  favoriteEmptyCompact: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: TACTICAL.amber + '22',
    backgroundColor: TACTICAL.amber + '08',
  },
  favoriteEmptyCompactText: {
    flex: 1,
    fontSize: 11,
    lineHeight: 16,
    color: TACTICAL.textMuted,
  },
  carouselIntro: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 8,
  },
  carouselIntroCopy: {
    flex: 1,
    gap: 4,
  },
  carouselEyebrow: {
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 2.5,
    color: TACTICAL.textMuted,
  },
  carouselTitle: {
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
    color: TACTICAL.text,
  },
  carouselBadge: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: TACTICAL.amber + '30',
    backgroundColor: TACTICAL.amber + '10',
  },
  carouselBadgeText: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.4,
    color: TACTICAL.amber,
  },
  carouselTrack: {
    paddingRight: 14,
    gap: 14,
  },
  carouselTrackExpanded: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: 14,
    justifyContent: 'space-between',
    paddingRight: 0,
  },
  carouselCard: {
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.24,
    shadowRadius: 18,
    elevation: 8,
  },
  carouselCardProminent: {
    borderColor: 'rgba(196,138,44,0.28)',
    backgroundColor: 'rgba(12,16,20,0.98)',
  },
  carouselCardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  carouselCardTitleWrap: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    flex: 1,
  },
  carouselCardIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  carouselCardCopy: {
    flex: 1,
    gap: 4,
  },
  carouselCardTitle: {
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 2.2,
  },
  carouselCardSubtitle: {
    fontSize: 11,
    lineHeight: 16,
    color: TACTICAL.textMuted,
  },
  gemMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  gemMetaBadge: {
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: TACTICAL.amber + '24',
    backgroundColor: TACTICAL.amber + '0C',
  },
  gemMetaBadgeText: {
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 1.2,
    color: TACTICAL.amber,
  },
  hiddenGemList: {
    gap: 8,
  },
  hiddenGemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(196,138,44,0.12)',
    backgroundColor: 'rgba(255,255,255,0.02)',
  },
  hiddenGemRank: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: TACTICAL.amber + '14',
    borderWidth: 1,
    borderColor: TACTICAL.amber + '28',
  },
  hiddenGemRankText: {
    fontSize: 10,
    fontWeight: '900',
    color: TACTICAL.amber,
  },
  hiddenGemCopy: {
    flex: 1,
    gap: 2,
  },
  hiddenGemName: {
    fontSize: 12,
    fontWeight: '700',
    color: TACTICAL.text,
  },
  hiddenGemRegion: {
    fontSize: 10,
    color: TACTICAL.textMuted,
  },
  hiddenGemStats: {
    alignItems: 'flex-end',
    gap: 2,
  },
  hiddenGemScore: {
    fontSize: 14,
    fontFamily: 'Courier',
    fontWeight: '800',
    color: TACTICAL.text,
  },
  hiddenGemTag: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.2,
  },
  hiddenGemFavoriteBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: ECS.stroke,
    backgroundColor: ECS.bgElev,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hiddenGemFavoriteBtnActive: {
    borderColor: TACTICAL.amber + '35',
    backgroundColor: TACTICAL.amber + '0C',
  },
  favoriteHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  favoriteSegmentWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: ECS.stroke,
    backgroundColor: ECS.bgElev,
    gap: 6,
  },
  favoriteSegmentBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 8,
  },
  favoriteSegmentBtnActive: {
    backgroundColor: TACTICAL.amber + '10',
    borderWidth: 1,
    borderColor: TACTICAL.amber + '24',
  },
  favoriteSegmentText: {
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 1.6,
    color: TACTICAL.textMuted,
  },
  favoriteSegmentTextActive: {
    color: TACTICAL.amber,
  },
  favoriteToolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    justifyContent: 'space-between',
  },
  favoriteToolbarText: {
    flex: 1,
    fontSize: 10,
    lineHeight: 15,
    color: TACTICAL.textMuted,
  },
  favoriteToolbarActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  favoriteToolbarBtn: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: ECS.stroke,
    backgroundColor: ECS.bgElev,
  },
  favoriteToolbarBtnText: {
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 1.4,
    color: TACTICAL.textMuted,
  },
  favoriteToolbarPrimaryBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: TACTICAL.amber + '35',
    backgroundColor: TACTICAL.amber + '12',
  },
  favoriteToolbarPrimaryBtnDisabled: {
    borderColor: ECS.stroke,
    backgroundColor: ECS.bgElev,
  },
  favoriteToolbarPrimaryText: {
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 1.4,
    color: TACTICAL.amber,
  },
  favoritePlannerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: TACTICAL.amber + '35',
    backgroundColor: TACTICAL.amber + '0C',
  },
  favoritePlannerBtnText: {
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 1.4,
    color: TACTICAL.amber,
  },
  favoriteEmptyState: {
    alignItems: 'center',
    gap: 6,
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: ECS.stroke,
    backgroundColor: ECS.bgElev,
  },
  favoriteEmptyTitle: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 2,
    color: TACTICAL.textMuted,
    textAlign: 'center',
  },
  favoriteEmptyText: {
    fontSize: 10,
    lineHeight: 15,
    color: TACTICAL.textMuted,
    textAlign: 'center',
  },
  favoriteList: {
    gap: 8,
  },
  favoriteScrollViewport: {
    flexGrow: 0,
  },
  favoriteCard: {
    gap: 8,
    padding: 11,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(196,138,44,0.12)',
    backgroundColor: 'rgba(255,255,255,0.02)',
  },
  favoriteCardSelectable: {
    borderColor: ECS.stroke,
  },
  favoriteCardSelected: {
    borderColor: TACTICAL.amber + '35',
    backgroundColor: TACTICAL.amber + '0C',
  },
  favoriteCardTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  favoriteCardCopy: {
    flex: 1,
    gap: 2,
  },
  favoriteCardTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: TACTICAL.text,
  },
  favoriteCardSubtitle: {
    fontSize: 10,
    lineHeight: 14,
    color: TACTICAL.textMuted,
  },
  favoriteRemoveBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: TACTICAL.amber + '35',
    backgroundColor: TACTICAL.amber + '0C',
    alignItems: 'center',
    justifyContent: 'center',
  },
  favoriteSelectIndicator: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  favoriteThumbnailFrame: {
    height: 76,
    maxHeight: 82,
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: TACTICAL.amber + '24',
    backgroundColor: 'rgba(5,7,9,0.92)',
  },
  favoriteThumbnailImage: {
    width: '100%',
    height: '100%',
  },
  favoriteThumbnailScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.08)',
  },
  favoriteThumbnailBadge: {
    position: 'absolute',
    left: 8,
    bottom: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: TACTICAL.amber + '30',
    backgroundColor: 'rgba(10,12,14,0.72)',
  },
  favoriteThumbnailBadgeText: {
    color: TACTICAL.amber,
    fontSize: 7,
    fontWeight: '900',
    letterSpacing: 0,
  },
  favoriteMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  favoriteMetaBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: ECS.stroke,
    backgroundColor: ECS.bgElev,
  },
  favoriteMetaBadgeText: {
    fontSize: 7,
    fontWeight: '800',
    letterSpacing: 1.1,
    color: TACTICAL.textMuted,
  },
  favoriteQuickRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  favoriteQuickHint: {
    flex: 1,
    fontSize: 10,
    color: TACTICAL.textMuted,
  },
  favoriteQuickNavigateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: TACTICAL.amber + '35',
    backgroundColor: TACTICAL.amber + '0C',
  },
  favoriteQuickNavigateText: {
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 1.3,
    color: TACTICAL.amber,
  },
  favoritePlanModeHintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  favoritePlanModeHintText: {
    fontSize: 10,
    color: TACTICAL.textMuted,
  },
  favoriteActionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
  },
  favoriteActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: ECS.stroke,
    backgroundColor: ECS.bgElev,
  },
  favoriteActionText: {
    fontSize: 7,
    fontWeight: '900',
    letterSpacing: 1.3,
    color: TACTICAL.textMuted,
  },
  favoritePlanSection: {
    gap: 8,
    paddingTop: 4,
    borderTopWidth: GOLD_RAIL.subsectionWidth,
    borderTopColor: GOLD_RAIL.internal,
  },
  favoritePlanSectionTitle: {
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 2,
    color: TACTICAL.amber,
  },
  favoritePlanList: {
    gap: 8,
  },
  favoritePlanCard: {
    gap: 8,
    padding: 11,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: ECS.stroke,
    backgroundColor: ECS.bgElev,
  },
  favoritePlanTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  favoritePlanTitle: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
    color: TACTICAL.text,
  },
  favoritePlanSubtitle: {
    fontSize: 10,
    lineHeight: 15,
    color: TACTICAL.textMuted,
  },
  favoritePlanMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  favoritePlanCountBadge: {
    minWidth: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: TACTICAL.amber + '30',
    backgroundColor: TACTICAL.amber + '0C',
    alignItems: 'center',
    justifyContent: 'center',
  },
  favoritePlanCountText: {
    fontSize: 10,
    fontWeight: '900',
    color: TACTICAL.amber,
  },
  planModalSection: {
    gap: 6,
  },
  planModalTitle: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.4,
    color: TACTICAL.text,
  },
  planModalBody: {
    fontSize: 10,
    lineHeight: 16,
    color: TACTICAL.textMuted,
  },
  planModalSelectedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginTop: 8,
  },
  planModalSectionLabel: {
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 2,
    color: TACTICAL.amber,
  },
  planModalSectionMeta: {
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: 1.2,
    color: TACTICAL.textMuted,
  },
  planModalEmptyState: {
    alignItems: 'center',
    gap: 8,
    paddingVertical: 16,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: ECS.stroke,
    backgroundColor: ECS.bgElev,
  },
  planModalEmptyTitle: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.8,
    color: TACTICAL.textMuted,
    textAlign: 'center',
  },
  planModalEmptyText: {
    fontSize: 10,
    lineHeight: 15,
    color: TACTICAL.textMuted,
    textAlign: 'center',
  },
  planSelectionList: {
    gap: 8,
  },
  planSelectionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: TACTICAL.amber + '25',
    backgroundColor: TACTICAL.amber + '08',
  },
  planDragHandle: {
    width: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  planSelectionIndex: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: TACTICAL.amber + '35',
    backgroundColor: 'rgba(0,0,0,0.18)',
  },
  planSelectionIndexText: {
    fontSize: 9,
    fontWeight: '900',
    color: TACTICAL.amber,
  },
  planSelectionCopy: {
    flex: 1,
    gap: 2,
  },
  planSelectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: TACTICAL.text,
  },
  planSelectionSubtitle: {
    fontSize: 10,
    color: TACTICAL.textMuted,
  },
  planSelectionActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  planOrderBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: ECS.stroke,
    backgroundColor: ECS.bgElev,
    alignItems: 'center',
    justifyContent: 'center',
  },
  planFavoriteList: {
    gap: 8,
  },
  planFavoriteCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: ECS.stroke,
    backgroundColor: ECS.bgElev,
  },
  planFavoriteCardSelected: {
    borderColor: TACTICAL.amber + '35',
    backgroundColor: TACTICAL.amber + '0C',
  },
  planFavoriteToggle: {
    width: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  planFavoriteCopy: {
    flex: 1,
    gap: 2,
  },
  planFavoriteTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: TACTICAL.text,
  },
  planFavoriteSubtitle: {
    fontSize: 10,
    color: TACTICAL.textMuted,
  },
  planFavoriteMeta: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: ECS.stroke,
    backgroundColor: 'rgba(0,0,0,0.18)',
  },
  planFavoriteMetaText: {
    fontSize: 7,
    fontWeight: '800',
    letterSpacing: 1,
    color: TACTICAL.textMuted,
  },
  planModalFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 10,
  },
  planModalSecondaryBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: ECS.stroke,
    backgroundColor: ECS.bgElev,
  },
  planModalSecondaryText: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.4,
    color: TACTICAL.textMuted,
  },
  planModalPrimaryBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: TACTICAL.amber + '35',
    backgroundColor: TACTICAL.amber + '12',
  },
  planModalPrimaryBtnDisabled: {
    borderColor: ECS.stroke,
    backgroundColor: ECS.bgElev,
  },
  planModalPrimaryText: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.4,
    color: TACTICAL.amber,
  },
  routeCardMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
    marginTop: -2,
  },
  emptyRouteCard: {
    alignItems: 'center',
    gap: 8,
  },
  emptyRouteCardTitle: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.8,
    color: TACTICAL.textMuted,
    textAlign: 'center',
  },
  emptyRouteCardText: {
    fontSize: 10,
    lineHeight: 15,
    color: TACTICAL.textMuted,
    textAlign: 'center',
  },
  sectionSkeletonCard: {
    flexDirection: 'row',
    backgroundColor: ECS.bgPanel,
    borderRadius: ECS.radius,
    borderWidth: 1,
    borderColor: ECS.stroke,
    marginBottom: 10,
    overflow: 'hidden',
  },
  sectionSkeletonAccent: {
    width: 4,
    backgroundColor: TACTICAL.amber + '35',
  },
  sectionSkeletonBody: {
    flex: 1,
    padding: 14,
    gap: 8,
  },
  sectionSkeletonBadgeRow: {
    flexDirection: 'row',
    gap: 8,
  },
  sectionSkeletonPill: {
    height: 16,
    width: 58,
    borderRadius: 999,
    backgroundColor: ECS.bgElev,
    borderWidth: 1,
    borderColor: ECS.stroke,
  },
  sectionSkeletonPillWide: {
    width: 90,
  },
  sectionSkeletonLine: {
    height: 10,
    borderRadius: 999,
    backgroundColor: ECS.bgElev,
  },
  sectionSkeletonTitleLine: {
    width: '58%',
    height: 14,
  },
  sectionSkeletonSubtitleLine: {
    width: '42%',
  },
  sectionSkeletonStatsRow: {
    flexDirection: 'row',
    gap: 10,
    paddingVertical: 2,
  },
  sectionSkeletonStat: {
    width: 56,
    height: 16,
    borderRadius: 999,
    backgroundColor: ECS.bgElev,
  },
  sectionSkeletonBodyLine: {
    width: '96%',
  },
  sectionSkeletonBodyLineShort: {
    width: '78%',
  },

  // ── Loading State ─────────────────────────────────────
  loadingContainer: {
    alignItems: 'center',
    paddingVertical: 40,
    gap: 12,
  },
  loadingNotice: {
    marginTop: 4,
    marginBottom: 14,
  },
  loadingText: {
    fontSize: 11,
    fontWeight: '800',
    color: TACTICAL.amber,
    letterSpacing: 3,
  },
  loadingSubText: {
    fontSize: 10,
    fontWeight: '500',
    color: TACTICAL.textMuted,
    letterSpacing: 0.5,
  },

  // ── Section Header ────────────────────────────────────
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
    paddingHorizontal: 2,
  },
  sectionHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  sectionHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  sectionTitle: {
    fontSize: 9,
    fontWeight: '800',
    color: TACTICAL.amber,
    letterSpacing: 2.5,
  },

  // ── Tab Description ───────────────────────────────────
  tabDescription: {
    fontSize: 10,
    fontWeight: '500',
    color: TACTICAL.textMuted,
    letterSpacing: 0.3,
    marginBottom: 12,
    paddingHorizontal: 2,
  },

  // ── Category Badge ────────────────────────────────────
  categoryBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    backgroundColor: ECS.bgElev,
  },
  categoryBadgeText: {
    fontSize: 7,
    fontWeight: '800',
    letterSpacing: 1.5,
  },

  // ── AI Badge ──────────────────────────────────────────
  aiBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#5AC8FA30',
    backgroundColor: '#5AC8FA0A',
  },
  aiBadgeText: {
    fontSize: 6,
    fontWeight: '800',
    color: '#5AC8FA',
    letterSpacing: 1,
  },

  // ── Lesser Known Badge ────────────────────────────────
  lesserKnownBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: TACTICAL.amber + '30',
    backgroundColor: TACTICAL.amber + '0A',
  },
  lesserKnownText: {
    fontSize: 6,
    fontWeight: '800',
    color: TACTICAL.amber,
    letterSpacing: 1,
  },

  // ── AI Section Divider ────────────────────────────────
  aiSectionDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginVertical: 14,
    paddingHorizontal: 2,
  },
  aiDividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#5AC8FA18',
  },
  aiDividerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#5AC8FA25',
    backgroundColor: '#5AC8FA08',
  },
  aiDividerText: {
    fontSize: 7,
    fontWeight: '900',
    color: '#5AC8FA',
    letterSpacing: 2,
  },

  // ── AI Loading ────────────────────────────────────────
  aiLoadingContainer: {
    alignItems: 'center',
    paddingVertical: 24,
    gap: 8,
    marginVertical: 8,
    backgroundColor: ECS.bgPanel,
    borderRadius: ECS.radius,
    borderWidth: 1,
    borderColor: '#5AC8FA15',
  },
  aiLoadingText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#5AC8FA',
    letterSpacing: 2.5,
  },
  aiLoadingSubText: {
    fontSize: 10,
    fontWeight: '500',
    color: TACTICAL.textMuted,
    letterSpacing: 0.3,
  },

  // ── AI Error ──────────────────────────────────────────
  aiErrorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: ECS.bgPanel,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: ECS.stroke,
    marginVertical: 8,
  },
  aiErrorText: {
    fontSize: 10,
    fontWeight: '600',
    color: TACTICAL.textMuted,
    flex: 1,
  },
  aiRetryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: TACTICAL.amber + '40',
    backgroundColor: TACTICAL.amber + '0C',
  },
  aiRetryBtnText: {
    fontSize: 7,
    fontWeight: '800',
    color: TACTICAL.amber,
    letterSpacing: 1.5,
  },

  // ── Generate AI Button ────────────────────────────────
  generateAIBtn: {
    marginVertical: 10,
    backgroundColor: ECS.bgPanel,
    borderRadius: ECS.radius,
    borderWidth: 1,
    borderColor: '#5AC8FA20',
    overflow: 'hidden',
  },
  generateAIBtnInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
  },
  generateAIBtnContent: {
    flex: 1,
    gap: 3,
  },
  generateAIBtnTitle: {
    fontSize: 10,
    fontWeight: '800',
    color: '#5AC8FA',
    letterSpacing: 2,
  },
  generateAIBtnDesc: {
    fontSize: 10,
    fontWeight: '500',
    color: TACTICAL.textMuted,
    lineHeight: 15,
  },

  // ── Empty Radius State ────────────────────────────────
  emptyRadius: {
    alignItems: 'center',
    paddingVertical: 28,
    paddingHorizontal: 20,
    backgroundColor: ECS.bgPanel,
    borderRadius: ECS.radius,
    borderWidth: 1,
    borderColor: TACTICAL.amber + '20',
    marginBottom: 16,
    gap: 8,
  },
  emptyRadiusIconWrap: {
    width: 60,
    height: 60,
    borderRadius: 16,
    backgroundColor: TACTICAL.amber + '0A',
    borderWidth: 1,
    borderColor: TACTICAL.amber + '20',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  emptyRadiusTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    letterSpacing: 3,
    textAlign: 'center',
  },
  emptyRadiusDesc: {
    fontSize: 11,
    fontWeight: '500',
    color: TACTICAL.textMuted,
    textAlign: 'center',
    lineHeight: 18,
    paddingHorizontal: 10,
  },
  emptyRadiusBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: TACTICAL.amber + '40',
    backgroundColor: TACTICAL.amber + '10',
    marginTop: 6,
  },
  emptyRadiusBtnText: {
    fontSize: 10,
    fontWeight: '800',
    color: TACTICAL.amber,
    letterSpacing: 2,
  },

  // ── Footer ────────────────────────────────────────────
  footer: {
    alignItems: 'center',
    paddingVertical: 6,
    borderTopWidth: GOLD_RAIL.subsectionWidth,
    borderTopColor: GOLD_RAIL.subsection,
    backgroundColor: 'rgba(11, 15, 18, 0.98)',
  },
  footerDeferredPlaceholder: {
    minHeight: 38,
    backgroundColor: 'transparent',
  },
  footerText: {
    fontSize: 9,
    fontWeight: '600',
    color: TACTICAL.textMuted,
    letterSpacing: 1.5,
    textAlign: 'center',
  },

  // ── Error ─────────────────────────────────────────────
  errorTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: TACTICAL.danger,
    letterSpacing: 1.5,
    textAlign: 'center',
  },
  errorSub: {
    fontSize: 12,
    color: TACTICAL.textMuted,
    textAlign: 'center',
    lineHeight: 18,
  },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: TACTICAL.accent,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10,
    marginTop: 8,
  },
  retryBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: TACTICAL.text,
    letterSpacing: 1,
  },
});




