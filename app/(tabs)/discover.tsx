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
  ActivityIndicator,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useIsFocused } from '@react-navigation/native';
import { SafeIcon as Ionicons } from '../../components/SafeIcon';
import { TACTICAL, GOLD_RAIL, ECS, TYPO } from '../../lib/theme';
import TopoBackground from '../../components/TopoBackground';
import { ECSSegmentedControl } from '../../components/ECSChip';
import { ECSSection, ECSSectionBadge, ECSSectionHeader } from '../../components/ECSSurface';
import {
  ECSResultsEmptyState,
  ECSResultsMetaRow,
} from '../../components/ECSResults';
import { ECSSkeletonBlock, ECSLoadingSection, ECSTransientNotice } from '../../components/ECSLoading';
import TacticalPopupShell from '../../components/TacticalPopupShell';
import EnrichedRouteCard from '../../components/discover/EnrichedRouteCard';
import ExpeditionAnalysisModal from '../../components/discover/ExpeditionAnalysisModal';
import DistanceRadiusFilter from '../../components/discover/DistanceRadiusFilter';
import DiscoveryCategoryTabs from '../../components/discover/DiscoveryCategoryTabs';
import AIRouteCard from '../../components/discover/AIRouteCard';
import AIRoutePreviewModal from '../../components/discover/AIRoutePreviewModal';
import {
  loadOpportunitiesWithCompatibility,
  loadExpeditionOpportunities,
  computeDistancesFromUser,
  filterByRadius,
  DEFAULT_DISTANCE_RADIUS,
  DISTANCE_RADIUS_OPTIONS,
  DEFAULT_USER_LOCATION,
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
  DISCOVERY_TABS,
  getHiddenGemRecommendations,
  getPopularTrailRecommendations,
  type DiscoveryTabId,
  type CategorizedRoute,
  type ExploreRouteSourceMetadata,
  type ExpandedDiscoverCategories,
  type HiddenGemPipelineDiagnostics,
  type HiddenGemRecommendationReason,
  type HiddenGemResult,
} from '../../lib/discoverCategoryEngine';
import { vehicleSetupStore } from '../../lib/vehicleSetupStore';
import { vehicleStore } from '../../lib/vehicleStore';
import { tiresLiftStore } from '../../lib/tiresLiftStore';
import { hapticMicro } from '../../lib/haptics';
import {
  explorationProgressStore,
  type ExplorationStats,
} from '../../lib/explorationProgressStore';
import { aiRouteStore } from '../../lib/aiRouteStore';
import type { AIGeneratedRoute } from '../../lib/aiRouteTypes';
import {
  enrichKnownRoutes,
  enrichAIRoutes,
  getRouteLabelConfig,
  recordShownRoutes,
  type EnrichedDiscoveryRoute,
} from '../../lib/discoveryIntelligenceEngine';
import {
  buildExploreNavigationPayload,
  saveNavigationHandoffPayload,
} from '../../lib/navigationHandoffStore';
import { stageNavigationFlow } from '../../lib/ecsNavigationFlow';
import { useECSAI } from '../../lib/ai/useECSAI';
import {
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
import { getShellBottomClearance, getShellHeaderTopPadding } from '../../lib/shellLayout';
import { reportDegradedState, reportRecoverableFailure } from '../../lib/ecsIssueIntelligence';
import { ECS_CTA_LABELS, ECS_READINESS_COPY, ECS_STATE_COPY } from '../../lib/ecsStateCopy';
import { useAdaptiveLayout } from '../../lib/useAdaptiveLayout';

const TAG = '[DISCOVER]';

type PopularTrailRouteWithMetadata = CategorizedRoute & {
  sourceMetadata?: ExploreRouteSourceMetadata;
};

type PopularTrailEnrichedRoute = EnrichedDiscoveryRoute & {
  categoryScore?: number;
  discoveryScore?: number;
  sourceMetadata?: ExploreRouteSourceMetadata;
};




const FALLBACK_DISCOVERY_TABS: { id: DiscoveryTabId; label: string; icon: string; accentColor: string; description: string }[] = [
  { id: 'day-trips', label: 'DAY TRIPS', icon: 'sunny-outline', accentColor: '#66BB6A', description: 'Short routes under 6 hours — perfect for a day out' },
  { id: 'weekend-trips', label: 'WEEKEND TRIPS', icon: 'moon-outline', accentColor: 'rgba(140, 120, 210, 0.85)', description: '1–2 day routes for overnight exploration' },
  { id: 'expeditions', label: 'EXPEDITIONS', icon: 'compass-outline', accentColor: 'rgba(200, 150, 60, 0.85)', description: 'Multi-day backcountry routes for extended travel' },
  { id: 'remote-routes', label: 'REMOTE ROUTES', icon: 'radio-outline', accentColor: '#E67E22', description: 'High-remoteness routes with limited services' },
];

const FAVORITES_VISIBLE_LIMIT = 5;
const HIDDEN_GEM_PAGE_SIZE = 10;
const HIDDEN_GEM_AI_TIMEOUT_MS = 4500;
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

const HIDDEN_GEM_REASON_LABELS: Record<HiddenGemRecommendationReason, string> = {
  good_full_size_truck_fit: 'GOOD FIT FOR YOUR RIG',
  good_jeep_fit: 'GOOD FIT FOR YOUR RIG',
  good_adventure_van_fit: 'GOOD FIT FOR YOUR RIG',
  good_vehicle_fit: 'GOOD FIT FOR YOUR RIG',
  low_traffic: 'LOWER TRAFFIC',
  seasonally_open: 'OPEN THIS SEASON',
  weather_compatible: 'WEATHER-COMPATIBLE',
  moderate_challenge_match: 'CHALLENGE MATCH',
  useful_expedition_alternative: 'STRONG ALTERNATIVE',
  nearby_option: 'CLOSE ENOUGH TO RUN',
};

function getHiddenGemContextTags(result: HiddenGemResult): string[] {
  return result.recommendationReasons
    .map((reason) => HIDDEN_GEM_REASON_LABELS[reason])
    .filter(Boolean)
    .slice(0, 3);
}

function formatStackedPlanLabel(plan: FavoriteTrailPlan): string {
  if (plan.items.length === 0) return 'Empty plan';
  if (plan.items.length === 1) return plan.items[0].title;
  const preview = plan.items.slice(0, 2).map((item) => item.title).join(' -> ');
  if (plan.items.length === 2) return preview;
  return `${preview} + ${plan.items.length - 2}`;
}

// ============================================================
// MAIN SCREEN
// ============================================================
function DiscoverScreenInner() {
  const insets = useSafeAreaInsets();
  const headerTopPadding = useMemo(() => getShellHeaderTopPadding(insets.top), [insets.top]);
  const dockClearance = useMemo(() => getShellBottomClearance(insets.bottom, 8), [insets.bottom]);
  const router = useRouter();
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

  // ── Distance radius filter state ──────────────────────────
  const [distanceRadius, setDistanceRadius] = useState<DistanceRadius | null>(DEFAULT_DISTANCE_RADIUS);

  // ── User location state ───────────────────────────────────
  const [userLat, setUserLat] = useState<number>(DEFAULT_USER_LOCATION.latitude);
  const [userLng, setUserLng] = useState<number>(DEFAULT_USER_LOCATION.longitude);
  const [hasGPSFix, setHasGPSFix] = useState(false);
  const [discoverRouteSourceMode, setDiscoverRouteSourceMode] = useState('seed_catalog_default_location');
  const [discoverSourceHydrated, setDiscoverSourceHydrated] = useState(false);
  const [discoverRouteSourceFailureReason, setDiscoverRouteSourceFailureReason] = useState<string | null>(null);
  const gps = useThrottledGPS({ enabled: isFocused, highAccuracy: false });

  // ── Phase 16: Category tab state ──────────────────────────
  const [activeTab, setActiveTab] = useState<DiscoveryTabId>('day-trips');
  const [showLesserKnown, setShowLesserKnown] = useState(true);
  const [hiddenGemPageIndex, setHiddenGemPageIndex] = useState(0);
  const [hasLoadedExplorer, setHasLoadedExplorer] = useState(false);
  const [hiddenGemCycleNotice, setHiddenGemCycleNotice] = useState<string | null>(null);

  // ── Phase 17: AI Route state ──────────────────────────────
  const [aiRoutes, setAiRoutes] = useState<AIGeneratedRoute[]>([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiPreviewRoute, setAiPreviewRoute] = useState<AIGeneratedRoute | null>(null);
  const [aiPreviewVisible, setAiPreviewVisible] = useState(false);
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

  // ── Phase 13: Exploration Progress state ───────────────────
  const [completedIds, setCompletedIds] = useState<Set<string>>(
    () => explorationProgressStore.getCompletedIds(),
  );

  const mountedRef = useRef(true);
  const lastHiddenGemDiagnosticsSignatureRef = useRef<string | null>(null);
  const lastExploreSourceDiagnosticsSignatureRef = useRef<string | null>(null);
  useEffect(() => { return () => { mountedRef.current = false; }; }, []);
  useEffect(() => {
    activeVehicleIdRef.current = activeVehicleId;
  }, [activeVehicleId]);

  const refreshRigContext = useCallback(() => {
    if (!mountedRef.current) return;
    setHiddenGemPageIndex(0);
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
        setAiRoutes(aiRouteStore.getRoutes(activeTab));
        setAiLoading(aiRouteStore.isLoading(activeTab));
        setAiError(aiRouteStore.getError(activeTab));
        setAiEnabled(aiRouteStore.isEnabled());
      }
    });
    return unsub;
  }, [activeTab]);

  // ── Phase 17: Sync AI routes when tab changes ──────────────
  useEffect(() => {
    setAiRoutes(aiRouteStore.getRoutes(activeTab));
    setAiLoading(aiRouteStore.isLoading(activeTab));
    setAiError(aiRouteStore.getError(activeTab));
  }, [activeTab]);

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
  }, [aiEnabled, aiLoading, activeTab]);

  // ── Phase 13: Exploration stats (memoized) ─────────────────
  const explorationStats = useMemo<ExplorationStats>(() => {
    return explorationProgressStore.computeStats(opportunities.length || 12);
  }, [opportunities.length]);

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
    const unsubscribeVehicleSetup = vehicleSetupStore.subscribe(() => {
      const nextVehicleId = vehicleSetupStore.getActiveVehicleId();
      if (activeVehicleIdRef.current === nextVehicleId) return;
      activeVehicleIdRef.current = nextVehicleId;
      setActiveVehicleId(nextVehicleId);
      refreshRigContext();
    });

    const unsubscribeTiresLift = tiresLiftStore.subscribe((vehicleId) => {
      const currentVehicleId = vehicleSetupStore.getActiveVehicleId();
      if (vehicleId === currentVehicleId) {
        refreshRigContext();
      }
    });

    const unsubscribeVehicleStore = vehicleStore.subscribe((event) => {
      const currentVehicleId = vehicleSetupStore.getActiveVehicleId();
      if (!currentVehicleId) return;
      if (event.vehicleId == null || event.vehicleId === currentVehicleId) {
        refreshRigContext();
      }
    });

    return () => {
      unsubscribeVehicleSetup();
      unsubscribeTiresLift();
      unsubscribeVehicleStore();
    };
  }, [refreshRigContext]);

  // Load opportunities with compatibility as soon as Discover mounts.
  useEffect(() => {
    let cancelled = false;

    (async () => {
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
        const ops = computeDistancesFromUser(loadExpeditionOpportunities(), userLat, userLng);
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

    return () => {
      cancelled = true;
    };
  }, [userLat, userLng, activeVehicleId, rigContextRevision, hasGPSFix]);

  // ── Filter opportunities by distance radius ───────────────
  const radiusFilteredOpportunities = useMemo(() => {
    return filterByRadius(
      opportunities,
      distanceRadius ?? DISTANCE_RADIUS_OPTIONS[DISTANCE_RADIUS_OPTIONS.length - 1],
    );
  }, [opportunities, distanceRadius]);

  // ── Phase 16: Expanded categories ─────────────────────────
  const expandedCategories = useMemo<ExpandedDiscoverCategories>(() => {
    return categorizeRoutesExpanded(
      radiusFilteredOpportunities,
      compatResults,
      distanceRadius ?? DISTANCE_RADIUS_OPTIONS[DISTANCE_RADIUS_OPTIONS.length - 1],
      showLesserKnown,
    );
  }, [radiusFilteredOpportunities, compatResults, distanceRadius, showLesserKnown]);

  // ── Get active tab routes ─────────────────────────────────
  const activeTabRoutes = useMemo<CategorizedRoute[]>(() => {
    switch (activeTab) {
      case 'day-trips': return expandedCategories.dayTrips;
      case 'weekend-trips': return expandedCategories.weekendTrips;
      case 'expeditions': return expandedCategories.expeditions;
      case 'remote-routes': return expandedCategories.remoteRoutes;
      default: return expandedCategories.all;
    }
  }, [activeTab, expandedCategories]);

  const canonicalActiveTabRoutes = useMemo<ExpeditionOpportunity[]>(
    () =>
      dedupeExploreRoutes(
        activeTabRoutes,
        compatResults,
        distanceRadius ?? DISTANCE_RADIUS_OPTIONS[DISTANCE_RADIUS_OPTIONS.length - 1],
      ),
    [activeTabRoutes, compatResults, distanceRadius],
  );
  const canonicalRadiusFilteredRoutes = useMemo<ExpeditionOpportunity[]>(
    () =>
      dedupeExploreRoutes(
        radiusFilteredOpportunities,
        compatResults,
        distanceRadius ?? DISTANCE_RADIUS_OPTIONS[DISTANCE_RADIUS_OPTIONS.length - 1],
      ),
    [radiusFilteredOpportunities, compatResults, distanceRadius],
  );

  const discoveryTabs = Array.isArray(DISCOVERY_TABS) && DISCOVERY_TABS.length > 0 ? DISCOVERY_TABS : FALLBACK_DISCOVERY_TABS;
  const activeTabMeta = discoveryTabs.find(t => t.id === activeTab) ?? discoveryTabs[0];
  const exploreSourceDiagnostics = useMemo(() => {
    const offlineModeActive = offlineDiscoveryBridge.isOffline();
    return {
      routeCatalogCount: opportunities.length,
      radiusFilteredCatalogCount: radiusFilteredOpportunities.length,
      activeTabCandidateCount: canonicalActiveTabRoutes.length,
      routeSourceMode: discoverRouteSourceMode,
      routeSourceHydrated: discoverSourceHydrated,
      routeSourceLoaded: discoverSourceHydrated && opportunities.length > 0,
      routeSourceFailureReason: discoverSourceHydrated
        ? discoverRouteSourceFailureReason
        : 'pending_initial_load',
      locationSourceMode: gps.hasFix && gps.position ? 'shared_live_gps' : 'default_location_fallback',
      offlineModeActive,
      vehicleGateApplied: false,
      setupGateApplied: false,
      authGateApplied: false,
    };
  }, [
    opportunities.length,
    radiusFilteredOpportunities.length,
    canonicalActiveTabRoutes.length,
    discoverRouteSourceMode,
    discoverSourceHydrated,
    discoverRouteSourceFailureReason,
    gps.hasFix,
    gps.position,
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
  const showExploreRouteGrid = adaptive.explore.routeColumns > 1;
  const routeCardWidth = useMemo(() => {
    if (!showExploreRouteGrid) return undefined;
    const usableWidth =
      Math.min(adaptive.contentMaxWidth ?? windowWidth, windowWidth) - adaptive.horizontalPadding * 2;
    return Math.max(
      320,
      Math.min(
        Math.floor((usableWidth - adaptive.panelGap) / 2),
        adaptive.explore.routeCardMaxWidth,
      ),
    );
  }, [
    adaptive.contentMaxWidth,
    adaptive.explore.routeCardMaxWidth,
    adaptive.horizontalPadding,
    adaptive.panelGap,
    showExploreRouteGrid,
    windowWidth,
  ]);

  // ── Phase 17: Fetch AI routes handler ─────────────────────
  const handleFetchAIRoutes = useCallback(async () => {
    if (!aiEnabled) return;
    hapticMicro();

    const vehicleType = vehicleProfile
      ? `${vehicleProfile.vehicleName || 'Unknown Vehicle'}`
      : 'stock SUV';

    const existingNames = canonicalActiveTabRoutes.map((route) => route.name);

    await aiRouteStore.fetchRoutes({
      latitude: userLat,
      longitude: userLng,
      category: activeTab,
      radiusMiles: distanceRadius ?? DISTANCE_RADIUS_OPTIONS[DISTANCE_RADIUS_OPTIONS.length - 1],
      vehicleType,
      vehicleBuild: vehicleProfile ? `${vehicleProfile.vehicleName || ''}` : '',
      count: 6,
      existingRouteNames: existingNames,
    });
  }, [aiEnabled, activeTab, distanceRadius, userLat, userLng, vehicleProfile, canonicalActiveTabRoutes]);

  // ── Phase 17: Auto-fetch AI routes on tab/radius change ───
  useEffect(() => {
    if (!isLoading && aiEnabled && !aiRouteStore.isCacheValid(activeTab) && !aiRouteStore.isLoading(activeTab)) {
      // Delay slightly to avoid blocking UI
      const timer = setTimeout(() => {
        if (mountedRef.current) {
          handleFetchAIRoutes();
        }
      }, 800);
      return () => clearTimeout(timer);
    }
  }, [activeTab, distanceRadius, isLoading, aiEnabled, handleFetchAIRoutes]);

  const handleSelectOpportunity = useCallback((op: ExpeditionOpportunity) => {
    hapticMicro();
    setSelectedOpportunity(op);
    setAnalysisVisible(true);
  }, []);

  const handleCloseAnalysis = useCallback(() => {
    setAnalysisVisible(false);
    setTimeout(() => setSelectedOpportunity(null), 300);
  }, []);

  const handleRadiusChange = useCallback((radius: DistanceRadius | null) => {
    hapticMicro();
    setDistanceRadius(radius);
    setHiddenGemPageIndex(0);
    setHiddenGemCycleNotice(null);
    // Clear AI cache when radius changes
    aiRouteStore.clearAll();
  }, []);

  const handleChangeDiscoveryTab = useCallback((tab: DiscoveryTabId) => {
    hapticMicro();
    setActiveTab(tab);
    setHiddenGemCycleNotice(null);
  }, []);

  const handleToggleLesserKnown = useCallback((nextValue: boolean) => {
    hapticMicro();
    setShowLesserKnown(nextValue);
    setHiddenGemCycleNotice(null);
  }, []);

  const handleResetDiscoveryFilters = useCallback(() => {
    hapticMicro();
    setActiveTab('day-trips');
    setDistanceRadius(DEFAULT_DISTANCE_RADIUS);
    setShowLesserKnown(true);
    setHiddenGemPageIndex(0);
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
    setAiPreviewRoute(route);
    setAiPreviewVisible(true);
  }, []);

  const handleNavigateToRoute = useCallback(
    async (route: ExpeditionOpportunity) => {
      hapticMicro();
      setAnalysisVisible(false);
      setSelectedOpportunity(null);
      setAiPreviewVisible(false);
      setAiPreviewRoute(null);
      const payload = buildExploreNavigationPayload(route);
      await saveNavigationHandoffPayload(payload);
      await stageNavigationFlow({
        source: 'explore',
        target: 'navigate',
        intent: 'route_preview',
        label: 'Trail Preview Ready',
        message: 'Trail preview is ready in Navigate. Review the line, then start guidance when ready.',
        context: {
          routeId: payload.id,
          tripMode: payload.tripMode,
        },
      });
      router.push('/(tabs)/navigate');
    },
    [router],
  );

  const handleCloseAIPreview = useCallback(() => {
    setAiPreviewVisible(false);
    setTimeout(() => setAiPreviewRoute(null), 300);
  }, []);

  // ── Phase 18: Enriched routes with discovery intelligence ──
  const enrichedKnown = useMemo<EnrichedDiscoveryRoute[]>(() => {
    if (canonicalActiveTabRoutes.length === 0) return [];
    return enrichKnownRoutes(canonicalActiveTabRoutes, vehicleProfile, compatResults);
  }, [canonicalActiveTabRoutes, vehicleProfile, compatResults]);

  const enrichedKnownMap = useMemo(
    () => new Map(enrichedKnown.map((route) => [route.id, route])),
    [enrichedKnown],
  );
  const enrichedHiddenGemSourceRoutes = useMemo<EnrichedDiscoveryRoute[]>(() => {
    if (canonicalRadiusFilteredRoutes.length === 0) return [];
    return enrichKnownRoutes(canonicalRadiusFilteredRoutes, vehicleProfile, compatResults);
  }, [canonicalRadiusFilteredRoutes, vehicleProfile, compatResults]);

  const enrichedHiddenGemSourceMap = useMemo(
    () => new Map(enrichedHiddenGemSourceRoutes.map((route) => [route.id, route])),
    [enrichedHiddenGemSourceRoutes],
  );

  const popularTrailsState = useMemo(() => {
    try {
      if (canonicalActiveTabRoutes.length === 0) {
        return {
          routes: [] as PopularTrailEnrichedRoute[],
          rankedRoutes: [] as PopularTrailRouteWithMetadata[],
          routeMetadataById: new Map<string, PopularTrailRouteWithMetadata>(),
          error: null as string | null,
        };
      }

      const rankedRoutes = getPopularTrailRecommendations(
        canonicalActiveTabRoutes,
        compatResults,
        {
          radiusMiles: distanceRadius ?? DISTANCE_RADIUS_OPTIONS[DISTANCE_RADIUS_OPTIONS.length - 1],
          vehicleProfile,
          discoveryTab: activeTab,
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
    canonicalActiveTabRoutes,
    compatResults,
    distanceRadius,
    vehicleProfile,
    activeTab,
    aiState?.expeditionPhase,
    aiState?.operationalState,
    liveStatus?.recommendations,
    enrichedKnownMap,
  ]);

  const hiddenGemBaselineState = useMemo(() => {
    try {
      const recommendationSet = getHiddenGemRecommendations(
        canonicalRadiusFilteredRoutes,
        compatResults,
        {
          radiusMiles: distanceRadius ?? DISTANCE_RADIUS_OPTIONS[DISTANCE_RADIUS_OPTIONS.length - 1],
          pageIndex: 0,
          pageSize: Math.max(canonicalRadiusFilteredRoutes.length, HIDDEN_GEM_PAGE_SIZE, 1),
          vehicleProfile,
          expeditionPhase: aiState?.expeditionPhase ?? null,
          operationalState: aiState?.operationalState ?? null,
          recommendationStatus: liveStatus?.recommendations ?? null,
          discoveryTab: activeTab,
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
        } satisfies HiddenGemPipelineDiagnostics,
        error: 'Hidden gem recommendations are temporarily unavailable.',
      };
    }
  }, [
    canonicalRadiusFilteredRoutes,
    compatResults,
    distanceRadius,
    vehicleProfile,
    activeTab,
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
    const routes = hiddenGemOrchestration.items
      .map((item) => {
        const route = enrichedHiddenGemSourceMap.get(item.id) ?? null;
        if (!route) return null;
        return {
          ...route,
          routeLabel: 'Hidden Gem' as const,
          routeLabelConfig: getRouteLabelConfig('Hidden Gem'),
        };
      })
      .filter((route): route is EnrichedDiscoveryRoute => !!route);
    const result = orchestrateExploreSectionRoutes({
      section: 'hidden_gem',
      routes,
      expeditionPhase: aiState?.expeditionPhase ?? null,
      operationalState: aiState?.operationalState ?? null,
      recommendationStatus: liveStatus?.recommendations ?? null,
      primaryCandidate: exploreView.primary,
      hasGPSFix,
    });
    const displayRoutes = result.surfaced.length > 0 ? result.surfaced : result.softened;
    const surfacedIds = new Set(displayRoutes.map((route) => route.id));
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
      .filter((item) => surfacedIds.has(item.id));

    return {
      ...result,
      items,
      routeMap,
    };
  }, [
    hiddenGemOrchestration.items,
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
  const hiddenGemRouteIds = useMemo(
    () => new Set(hiddenGemExploreOrchestration.items.map((item) => item.id)),
    [hiddenGemExploreOrchestration.items],
  );

  useEffect(() => {
    const signature = `${hiddenGemDiagnostics.status}:${hiddenGemDiagnostics.finalSource}:${hiddenGemDiagnostics.finalEligibleCount}:${hiddenGemDiagnostics.aiCandidateCount}`;
    if (lastHiddenGemIssueSignatureRef.current === signature) return;
    lastHiddenGemIssueSignatureRef.current = signature;
    const diagnosticsMetadata = JSON.parse(JSON.stringify(hiddenGemDiagnostics)) as Record<string, unknown>;

    if (hiddenGemDiagnostics.status === 'ai_unavailable_fallback_used') {
      reportRecoverableFailure({
        severity: 'medium',
        issueTitle: 'Hidden Gems AI unavailable',
        ecsArea: 'explore',
        message: aiError || 'Hidden Gems fell back to the validated baseline because AI was unavailable',
        signature: `hidden_gems_ai_unavailable:${aiError || 'unavailable'}`,
        metadata: diagnosticsMetadata,
        fallbackUsed: true,
      });
      return;
    }

    if (hiddenGemDiagnostics.status === 'ai_timeout_fallback_used') {
      reportRecoverableFailure({
        severity: 'medium',
        issueTitle: 'Hidden Gems AI timeout',
        ecsArea: 'explore',
        message: 'Hidden Gems AI refinement timed out and the validated baseline was retained',
        signature: 'hidden_gems_ai_timeout',
        metadata: diagnosticsMetadata,
        fallbackUsed: true,
      });
      return;
    }

    if (hiddenGemDiagnostics.status === 'ai_noop_baseline_retained' && hiddenGemDiagnostics.aiEnabled) {
      reportDegradedState({
        severity: 'low',
        issueTitle: 'Hidden Gems AI returned no refinement',
        ecsArea: 'explore',
        message: 'AI orchestration completed without refining the validated baseline list',
        signature: 'hidden_gems_ai_noop',
        metadata: diagnosticsMetadata,
        fallbackUsed: hiddenGemDiagnostics.finalSource === 'validated_baseline',
      });
    }
  }, [aiError, hiddenGemDiagnostics]);
  const popularTrailRoutes = useMemo(
    () => popularTrailsState.routes.filter((route) => !hiddenGemRouteIds.has(route.id)),
    [hiddenGemRouteIds, popularTrailsState.routes],
  );
  const popularTrailExploreOrchestration = useMemo(() => {
    const result = orchestrateExploreSectionRoutes({
      section: 'popular_trail',
      routes: popularTrailRoutes,
      expeditionPhase: aiState?.expeditionPhase ?? null,
      operationalState: aiState?.operationalState ?? null,
      recommendationStatus: liveStatus?.recommendations ?? null,
      primaryCandidate: exploreView.primary,
      hasGPSFix,
    });
    const filteredMetadataById = new Map(
      Array.from(popularTrailsState.routeMetadataById.entries()).filter(
        ([routeId]) => !hiddenGemRouteIds.has(routeId),
      ),
    );
    const routeMap = new Map<string, PopularTrailEnrichedRoute>(
      result.surfaced.map((route) => {
        const baseline = filteredMetadataById.get(route.id);
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

    return {
      ...result,
      routeMap,
    };
  }, [
    popularTrailRoutes,
    popularTrailsState.routeMetadataById,
    hiddenGemRouteIds,
    aiState?.expeditionPhase,
    aiState?.operationalState,
    exploreView.primary,
    hasGPSFix,
    liveStatus?.recommendations,
  ]);

  const enrichedHiddenGemRoutes = useMemo<EnrichedDiscoveryRoute[]>(() => {
    if (hiddenGemPage.items.length === 0) return [];
    return hiddenGemPage.items
      .map((item) => hiddenGemExploreOrchestration.routeMap.get(item.id) ?? null)
      .filter((route): route is EnrichedDiscoveryRoute => !!route);
  }, [hiddenGemPage.items, hiddenGemExploreOrchestration.routeMap]);

  const hiddenGemContextTagMap = useMemo(() => {
    const map = new Map<string, string[]>();
    hiddenGemPage.items.forEach((item) => {
      map.set(item.id, getHiddenGemContextTags(item));
    });
    return map;
  }, [hiddenGemPage.items]);
  const distanceRadiusMetaLabel = distanceRadius == null ? 'All Range' : `${distanceRadius} mi`;
  const distanceRadiusNarrative = distanceRadius == null ? 'the current range' : `${distanceRadius} miles`;
  const distanceRadiusFooterLabel = distanceRadius == null ? 'ALL RANGE' : `${distanceRadius} MI`;

  const hiddenGemSummary = useMemo(() => {
    const orchestrationNote = hiddenGemExploreOrchestration.summaryNote;
    if (hiddenGemPage.eligibleCount === 0) {
      const base =
        hiddenGemDiagnostics.rawCandidateCount === 0
          ? `No routes were available to evaluate as Hidden Gems inside ${distanceRadiusNarrative}.`
          : hiddenGemDiagnostics.tripTypeMatchedCount === 0
          ? `Routes were loaded inside ${distanceRadiusNarrative}, but none matched the current ${activeTabMeta.label.toLowerCase()} filter strongly enough to enter Hidden Gems review.`
          : `Routes were loaded inside ${distanceRadiusNarrative}, but none qualified as lesser-known drivable picks for the current ${activeTabMeta.label.toLowerCase()} filter.`;
      return orchestrationNote ? `${base} ${orchestrationNote}` : base;
    }
    const filteredCount = Math.max(hiddenGemPage.totalCandidates - hiddenGemPage.eligibleCount, 0);
    if (filteredCount > 0) {
      const base = `${hiddenGemPage.eligibleCount} curated lesser-known off-road routes inside ${distanceRadiusNarrative} for the current ${activeTabMeta.label.toLowerCase()} filter. ${filteredCount} routes were held back for popularity, trail type, length, seasonal fit, or rig mismatch.`;
      return orchestrationNote ? `${base} ${orchestrationNote}` : base;
    }
    const base = `${hiddenGemPage.eligibleCount} curated lesser-known off-road routes inside ${distanceRadiusNarrative} for the current ${activeTabMeta.label.toLowerCase()} filter.`;
    return orchestrationNote ? `${base} ${orchestrationNote}` : base;
  }, [
    hiddenGemPage.eligibleCount,
    hiddenGemPage.totalCandidates,
    distanceRadiusNarrative,
    activeTabMeta.label,
    hiddenGemDiagnostics.rawCandidateCount,
    hiddenGemDiagnostics.tripTypeMatchedCount,
    hiddenGemExploreOrchestration.summaryNote,
  ]);

  const topAIRoutes = useMemo(() => aiRoutes.slice(0, 2), [aiRoutes]);
  const visiblePopularTrails = useMemo<PopularTrailEnrichedRoute[]>(
    () =>
      popularTrailExploreOrchestration.surfaced
        .slice(0, 4)
        .map((route) => popularTrailExploreOrchestration.routeMap.get(route.id) ?? route),
    [popularTrailExploreOrchestration.routeMap, popularTrailExploreOrchestration.surfaced],
  );
  const popularTrailSummary = useMemo(() => {
    const base = `Recognized destination-grade routes inside ${distanceRadiusNarrative} for the current ${activeTabMeta.label.toLowerCase()} filter.`;
    return popularTrailExploreOrchestration.summaryNote
      ? `${base} ${popularTrailExploreOrchestration.summaryNote}`
      : base;
  }, [distanceRadiusNarrative, activeTabMeta.label, popularTrailExploreOrchestration.summaryNote]);
  const hiddenGemPageCount = hiddenGemPage.totalPages;
  const visibleHiddenGemRoutes = enrichedHiddenGemRoutes;
  const hiddenGemWindowStart = hiddenGemPage.eligibleCount === 0 ? 0 : hiddenGemPage.offset + 1;
  const hiddenGemWindowEnd = Math.min(hiddenGemPage.offset + hiddenGemPage.items.length, hiddenGemPage.eligibleCount);
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
    () => canonicalActiveTabRoutes.map((route) => route.id).join('|'),
    [canonicalActiveTabRoutes],
  );

  useEffect(() => {
    setHiddenGemPageIndex(0);
    setHiddenGemCycleNotice(null);
  }, [distanceRadius, activeTab, showLesserKnown, vehicleProfileSignature, activeTabRouteSignature]);

  useEffect(() => {
    if (!__DEV__) return;
    const nextSignature = JSON.stringify(hiddenGemDiagnostics);
    if (lastHiddenGemDiagnosticsSignatureRef.current === nextSignature) return;
    lastHiddenGemDiagnosticsSignatureRef.current = nextSignature;
    console.info(TAG, 'Hidden Gems orchestration', hiddenGemDiagnostics);
  }, [hiddenGemDiagnostics]);

  useEffect(() => {
    if (!__DEV__) return;
    const nextSignature = JSON.stringify(exploreSourceDiagnostics);
    if (lastExploreSourceDiagnosticsSignatureRef.current === nextSignature) return;
    lastExploreSourceDiagnosticsSignatureRef.current = nextSignature;
    console.info(TAG, 'Explore source diagnostics', exploreSourceDiagnostics);
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

  const enrichedAI = useMemo<EnrichedDiscoveryRoute[]>(() => {
    if (aiRoutes.length === 0) return [];
    return enrichAIRoutes(aiRoutes, vehicleProfile);
  }, [aiRoutes, vehicleProfile]);

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

  const totalRouteCount = canonicalActiveTabRoutes.length + aiRoutes.length;
  const hasDiscoveryOverrides =
    activeTab !== 'day-trips' ||
    distanceRadius !== DEFAULT_DISTANCE_RADIUS ||
    !showLesserKnown;
  const favoriteTrails = favoritesSnapshot.favorites;
  const favoritePlans = favoritesSnapshot.plans;
  const favoritesTotal = favoriteTrails.length + favoritePlans.length;
  const latestFavoriteTrail = favoriteTrails[0] ?? null;
  const latestFavoritePlan = favoritePlans[0] ?? null;
  const favoritesSummaryText = latestFavoriteTrail
    ? latestFavoriteTrail.subtitle ?? 'Most recently saved trail'
    : latestFavoritePlan
      ? `${latestFavoritePlan.items.length} stop${latestFavoritePlan.items.length !== 1 ? 's' : ''} saved for review`
      : 'Save trails from Hidden Gems or Popular Trails to reopen them later.';
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

  const handleToggleFavorite = useCallback((route: ExpeditionOpportunity) => {
    void toggleFavoriteTrail(route);
  }, []);

  const handleNavigateToFavorite = useCallback(
    async (favorite: FavoriteTrailRecord) => {
      hapticMicro();
      await saveNavigationHandoffPayload(favorite.navigationPayload);
      await stageNavigationFlow({
        source: 'explore',
        target: 'navigate',
        intent: 'route_preview',
        label: 'Trail Preview Ready',
        message: 'Saved trail is ready in Navigate for review and guidance.',
        context: {
          routeId: favorite.navigationPayload.id,
          tripMode: favorite.navigationPayload.tripMode,
        },
      });
      router.push('/(tabs)/navigate');
    },
    [router],
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
    hapticMicro();
    void removeFavoriteTrailPlan(planId);
  }, []);

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
    hapticMicro();
    const favorite = favoriteTrails.find((entry) => entry.sourceTrailId === routeId) ?? null;
    void removeFavoriteTrailBySourceId(routeId);
    if (favorite) {
      setSelectedPlanFavoriteIds((current) =>
        current.filter((favoriteId) => favoriteId !== favorite.favoriteId),
      );
    }
  }, [favoriteTrails]);

  const handleRemovePlanDraftItem = useCallback((favoriteId: string) => {
    hapticMicro();
    setSelectedPlanFavoriteIds((current) => current.filter((entry) => entry !== favoriteId));
  }, []);

  const showInitialLoading = isLoading && !hasLoadedExplorer;
  const showSectionLoading = isLoading && hasLoadedExplorer;
  const favoriteTrailListScrollable = favoriteTrails.length > FAVORITES_VISIBLE_LIMIT;
  const favoritePlanListScrollable = favoritePlans.length > FAVORITES_VISIBLE_LIMIT;
  const favoriteTrailCards = favoriteTrails.map((favorite) => {
    const isSelected = selectedPlanFavoriteIds.includes(favorite.favoriteId);
    return (
      <TouchableOpacity
        key={favorite.favoriteId}
        style={[
          s.favoriteCard,
          favoritesPlanMode && s.favoriteCardSelectable,
          isSelected && s.favoriteCardSelected,
        ]}
        activeOpacity={0.84}
        onPress={() =>
          favoritesPlanMode
            ? handleTogglePlanFavorite(favorite.favoriteId)
            : handleOpenFavorite(favorite)
        }
      >
        <View style={s.favoriteCardTopRow}>
          <View style={s.favoriteCardCopy}>
            <Text style={s.favoriteCardTitle} numberOfLines={1}>{favorite.title}</Text>
            <Text style={s.favoriteCardSubtitle} numberOfLines={1}>
              {favorite.subtitle ?? 'Saved from Explore'}
            </Text>
          </View>

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
              onPress={(event) => {
                event.stopPropagation?.();
                handleRemoveFavorite(favorite.sourceTrailId);
              }}
            >
              <Ionicons name="star" size={12} color={TACTICAL.amber} />
            </TouchableOpacity>
          )}
        </View>

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
            <TouchableOpacity
              style={s.favoriteQuickNavigateBtn}
              activeOpacity={0.75}
              onPress={(event) => {
                event.stopPropagation?.();
                void handleNavigateToFavorite(favorite);
              }}
            >
              <Ionicons name="navigate-outline" size={11} color={TACTICAL.amber} />
              <Text style={s.favoriteQuickNavigateText}>NAVIGATE</Text>
            </TouchableOpacity>
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
  const favoritePlanCards = favoritePlans.map((plan) => (
    <TouchableOpacity
      key={plan.planId}
      style={s.favoritePlanCard}
      activeOpacity={0.84}
      onPress={() => handleOpenPlanBuilder(plan)}
    >
      <View style={s.favoritePlanTopRow}>
        <View style={s.favoriteCardCopy}>
          <Text style={s.favoritePlanTitle}>{plan.title}</Text>
          <Text style={s.favoritePlanSubtitle} numberOfLines={2}>
            {formatStackedPlanLabel(plan)}
          </Text>
        </View>
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


  return (
    <TopoBackground>
      <View style={[s.safeContainer, { paddingBottom: dockClearance }]}>
        {/* Header */}
        <View style={[s.header, contentFrameStyle, { paddingTop: headerTopPadding }]}>
          <View>
            <Text style={s.headerBrand}>Expedition Command System</Text>
            <Text style={s.headerTitle}>Explore</Text>
          </View>
        </View>

        <View style={s.goldRail} />

        <ScrollView style={s.scrollArea} contentContainerStyle={[s.scrollContent, contentFrameStyle]} showsVerticalScrollIndicator={false}>

          {(!showInitialLoading && (opportunities.length > 0 || showSectionLoading)) && (
            <View style={s.discoveryControlsWrap}>
              <DiscoveryCategoryTabs
                activeTab={activeTab}
                onChangeTab={handleChangeDiscoveryTab}
                categories={expandedCategories}
                showLesserKnown={showLesserKnown}
                onToggleLesserKnown={handleToggleLesserKnown}
                hiddenGemBadgeCount={showSectionLoading ? null : hiddenGemPage.eligibleCount}
              />

              <DistanceRadiusFilter selectedRadius={distanceRadius} onChangeRadius={handleRadiusChange} hasGPSFix={hasGPSFix} totalCount={opportunities.length} filteredCount={radiusFilteredOpportunities.length} isLoading={isLoading} />

              {showSectionLoading && (
                <ECSTransientNotice
                  kind="syncing"
                  label="Route Data Refreshing..."
                  message="Showing current Explore results while the next scan completes."
                  compact
                  style={s.discoveryRefreshNotice}
                />
              )}

              <ECSResultsMetaRow
                chips={[
                  { label: activeTabMeta.label, selected: true },
                  { label: showSectionLoading ? 'Refreshing' : distanceRadiusMetaLabel },
                  { label: showSectionLoading ? 'Popular Sync' : `Popular ${popularTrailRoutes.length}` },
                  { label: showSectionLoading ? 'Gems Sync' : `Gems ${hiddenGemPage.eligibleCount}` },
                  ...(hasGPSFix ? [{ label: 'GPS Lock' }] : []),
                ]}
                style={s.discoverySummaryRow}
              />
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
              <DiscoverySectionSkeleton
                title="POPULAR TRAILS"
                icon="flag-outline"
                badge="SCANNING"
                description="Checking iconic destination routes inside the current radius."
                accentColor="#66BB6A"
              />
            </>
          )}

          {!showInitialLoading && !showSectionLoading && radiusFilteredOpportunities.length === 0 && (
            <ECSResultsEmptyState
              style={s.emptyRadius}
              title={ECS_STATE_COPY.explore.noRoutesInRadius.title}
              message={
                distanceRadius == null
                  ? 'No trails match the current Explore scan.'
                  : `No trails fall inside the current ${distanceRadius}-mile scan.`
              }
              helper="Widen the radius or reset the current trail filters to continue exploring."
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
                  {showLesserKnown && (
                    <View style={s.lesserKnownBadge}>
                      <Ionicons name="eye-off-outline" size={8} color={TACTICAL.amber} />
                      <Text style={s.lesserKnownText}>LESSER KNOWN</Text>
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
                  onSelect={() => handleSelectOpportunity(route)}
                  onNavigate={() => {
                    void handleNavigateToRoute(route);
                  }}
                  onToggleFavorite={() => handleToggleFavorite(route)}
                  isCompleted={completedIds?.has(route.id) ?? false}
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
                      isFavorited={favoriteTrailIds.has(String(route.id))}
                      onPreview={() => handleAIPreview(route)}
                      onNavigate={() => {
                        void handleNavigateToRoute(route);
                      }}
                      onToggleFavorite={() => handleToggleFavorite(route)}
                      onBuildExpedition={() => {
                        hapticMicro();
                        // Navigate to expedition builder with route context
                      }}
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

          {(!showInitialLoading && (radiusFilteredOpportunities.length > 0 || showSectionLoading)) && (
            <>
              <ECSSection style={[s.discoverySection, s.hiddenGemSection]}>
                <ECSSectionHeader
                  title="HIDDEN GEMS"
                  icon="diamond-outline"
                  badge={
                    <ECSSectionBadge
                      label={
                        showSectionLoading
                          ? 'REFRESHING'
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
                    title="Loading Route Catalog"
                    message="Explore is still hydrating its route source for this session. Hidden Gems will populate once the catalog load completes."
                  />
                ) : exploreSourceDiagnostics.routeCatalogCount === 0 ? (
                  <ExplorerStateCard
                    icon="map-outline"
                    title="Route Catalog Unavailable"
                    message={
                      exploreSourceDiagnostics.offlineModeActive
                        ? 'Explore is offline and no local trail catalog is available yet.'
                        : 'Explore did not load a route catalog for this session. Refresh Explore once shell state settles.'
                    }
                  />
                ) : visibleHiddenGemRoutes.length === 0 ? (
                  <ExplorerStateCard
                    icon="diamond-outline"
                    title="No Hidden Gems in Range"
                    message={
                      hiddenGemDiagnostics.rawCandidateCount === 0
                        ? `The route catalog is loaded, but no drivable routes fell inside ${distanceRadiusNarrative} for Hidden Gems review.`
                        : hiddenGemDiagnostics.tripTypeMatchedCount === 0
                        ? `Routes were found inside ${distanceRadiusNarrative}, but none matched the current ${activeTabMeta.label.toLowerCase()} filter strongly enough to enter Hidden Gems scoring.`
                        : hasGPSFix
                        ? `Routes were evaluated inside ${distanceRadiusNarrative}, but none qualified as lesser-known drivable picks for your current rig and ${activeTabMeta.label.toLowerCase()} filter.`
                        : `Explore is still using the default search location until live GPS becomes available. Routes were evaluated inside ${distanceRadiusNarrative}, but none qualified as lesser-known drivable picks for the current ${activeTabMeta.label.toLowerCase()} filter.`
                    }
                  />
                ) : (
                  <>
                    <View style={[s.routeCardGrid, showExploreRouteGrid && s.routeCardGridExpanded]}>
                      {visibleHiddenGemRoutes.map((route) => {
                        const contextTags = hiddenGemContextTagMap.get(route.id) ?? [];
                        return (
                          <View key={route.id} style={[s.hiddenGemCardWrap, routeCardWidth ? { width: routeCardWidth } : null]}>
                            <EnrichedRouteCard
                              route={route}
                              hasVehicle={!!activeVehicleId}
                              isFavorited={favoriteTrailIds.has(String(route.id))}
                              presentationVariant="hidden-gem"
                              collectionLabel="Hidden Gems"
                              onSelect={() => handleSelectOpportunity(route)}
                              onNavigate={() => {
                                void handleNavigateToRoute(route);
                              }}
                              onToggleFavorite={() => handleToggleFavorite(route)}
                              isCompleted={completedIds?.has(route.id) ?? false}
                            />
                            {contextTags.length > 0 && (
                              <View style={s.hiddenGemContextRow}>
                                {contextTags.map((tag) => (
                                  <View key={`${route.id}-${tag}`} style={s.hiddenGemContextChip}>
                                    <Text style={s.hiddenGemContextChipText}>{tag}</Text>
                                  </View>
                                ))}
                              </View>
                            )}
                          </View>
                        );
                      })}
                    </View>

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
                          {hiddenGemPage.pageIndex + 1 >= hiddenGemPageCount ? 'RESTART GEMS' : 'NEXT 10'}
                        </Text>
                      </TouchableOpacity>
                    )}
                  </>
                )}
              </ECSSection>

              <ECSSection style={[s.discoverySection, s.popularTrailsSection]}>
                <ECSSectionHeader
                  title="POPULAR TRAILS"
                  icon="flag-outline"
                  accentColor="#66BB6A"
                  badge={
                    <ECSSectionBadge
                      label={showSectionLoading ? 'UPDATING' : popularTrailsState.error ? ECS_READINESS_COPY.labels.limited : `${popularTrailExploreOrchestration.surfaced.length} WITHIN RANGE`}
                      color="#66BB6A"
                    />
                  }
                />
                <Text style={s.discoverySectionDescription}>
                  {popularTrailsState.error
                    ? ECS_READINESS_COPY.explore.popularTrailsLimitedDetail
                    : popularTrailSummary}
                </Text>

                {showSectionLoading ? (
                  <SectionCardSkeletonList />
                ) : popularTrailsState.error ? (
                  <ExplorerStateCard
                    icon="cloud-offline-outline"
                    title={ECS_READINESS_COPY.explore.popularTrailsLimitedTitle}
                    message={ECS_READINESS_COPY.explore.popularTrailsLimitedMessage}
                    action={(
                      <TouchableOpacity
                        style={[s.sectionStateAction, s.sectionStateActionGreen]}
                        activeOpacity={0.78}
                        onPress={refreshRigContext}
                      >
                        <Ionicons name="refresh-outline" size={11} color="#66BB6A" />
                        <Text style={[s.sectionStateActionText, s.sectionStateActionTextGreen]}>REFRESH EXPLORE</Text>
                      </TouchableOpacity>
                    )}
                  />
                ) : visiblePopularTrails.length === 0 ? (
                  <ExplorerStateCard
                    icon="flag-outline"
                    title="No Popular Trails in Range"
                    message={`No marquee routes were found inside ${distanceRadiusNarrative} for the current ${activeTabMeta.label.toLowerCase()} filter.`}
                  />
                ) : (
                  <View style={[s.routeCardGrid, showExploreRouteGrid && s.routeCardGridExpanded]}>
                    {visiblePopularTrails.map((route) => (
                      <View key={route.id} style={[s.hiddenGemCardWrap, routeCardWidth ? { width: routeCardWidth } : null]}>
                        <EnrichedRouteCard
                          route={route}
                          hasVehicle={!!activeVehicleId}
                          isFavorited={favoriteTrailIds.has(String(route.id))}
                          presentationVariant="popular-trail"
                          collectionLabel="Popular Trails"
                          onSelect={() => handleSelectOpportunity(route)}
                          onNavigate={() => {
                            void handleNavigateToRoute(route);
                          }}
                          onToggleFavorite={() => handleToggleFavorite(route)}
                          isCompleted={completedIds?.has(route.id) ?? false}
                        />
                      </View>
                    ))}
                  </View>
                )}
              </ECSSection>

              <ECSSection style={s.discoverySection}>
                <ECSSectionHeader
                  title="ECS ROUTE IDEAS"
                  icon="sparkles-outline"
                  accentColor="#5AC8FA"
                  badge={<ECSSectionBadge label={`${aiRoutes.length} IDEA${aiRoutes.length !== 1 ? 'S' : ''}`} />}
                />
                <Text style={s.discoverySectionDescription}>
                  Optional ECS route ideas for {activeTabMeta.label.toLowerCase()} inside {distanceRadiusNarrative}.
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

                {topAIRoutes.length === 0 && !aiLoading && !aiError && (
                  <View style={s.emptyRouteCard}>
                    <Ionicons name="sparkles-outline" size={20} color={TACTICAL.textMuted} />
                    <Text style={s.emptyRouteCardTitle}>NO ECS ROUTE IDEAS YET</Text>
                    <Text style={s.emptyRouteCardText}>
                      Refresh ECS route ideas when you want a second pass on the current Explore filters.
                    </Text>
                  </View>
                )}

                {!aiLoading && aiError && topAIRoutes.length === 0 && (
                  <View style={s.aiErrorContainer}>
                    <Ionicons name="cloud-offline-outline" size={16} color={TACTICAL.textMuted} />
                    <Text style={s.aiErrorText}>{ECS_STATE_COPY.recovery.exploreIdeasLimited.message}</Text>
                    <TouchableOpacity style={s.aiRetryBtn} onPress={handleFetchAIRoutes} activeOpacity={0.7}>
                      <Ionicons name="refresh-outline" size={10} color={TACTICAL.amber} />
                      <Text style={s.aiRetryBtnText}>{ECS_STATE_COPY.recovery.exploreIdeasLimited.ctaLabel.toUpperCase()}</Text>
                    </TouchableOpacity>
                  </View>
                )}

                {aiLoading && (
                  <View style={s.aiLoadingContainer}>
                    <ActivityIndicator size="small" color="#5AC8FA" />
                    <Text style={s.aiLoadingText}>REFINING ECS ROUTE IDEAS...</Text>
                    <Text style={s.aiLoadingSubText}>Keeping the current Explore results visible while suggestions refresh.</Text>
                  </View>
                )}

                {!aiLoading && topAIRoutes.length === 0 && aiEnabled && activeTabRoutes.length > 0 && !aiError && (
                  <TouchableOpacity
                    style={s.generateAIBtn}
                    activeOpacity={0.8}
                    onPress={handleFetchAIRoutes}
                  >
                    <View style={s.generateAIBtnInner}>
                      <Ionicons name="sparkles-outline" size={14} color="#5AC8FA" />
                      <View style={s.generateAIBtnContent}>
                        <Text style={s.generateAIBtnTitle}>GET ECS ROUTE IDEAS</Text>
                        <Text style={s.generateAIBtnDesc}>
                          Find more {activeTabMeta.label.toLowerCase()} within {distanceRadiusNarrative}.
                        </Text>
                      </View>
                      <Ionicons name="chevron-forward" size={14} color={TACTICAL.textMuted} />
                    </View>
                  </TouchableOpacity>
                )}

                {topAIRoutes.map((route) => (
                  <AIRouteCard
                    key={route.id}
                    route={route}
                    enrichedRoute={enrichedAIMap.get(route.id) ?? null}
                    isFavorited={favoriteTrailIds.has(String(route.id))}
                    onPreview={() => handleAIPreview(route)}
                    onNavigate={() => {
                      void handleNavigateToRoute(route);
                    }}
                    onToggleFavorite={() => handleToggleFavorite(route)}
                    onBuildExpedition={() => {
                      hapticMicro();
                    }}
                  />
                ))}
              </ECSSection>

              <ECSSection style={s.discoverySection}>
                <ECSSectionHeader
                  title="FAVORITES"
                  icon="star-outline"
                  accentColor="#E6B84C"
                  badge={<ECSSectionBadge label={favoritesTotal > 0 ? `${favoritesTotal} SAVED` : 'EMPTY'} />}
                />

                {favoritesTotal === 0 ? (
                  <View style={s.favoriteEmptyCompact}>
                    <Ionicons name="star-outline" size={14} color={TACTICAL.amber} />
                    <Text style={s.favoriteEmptyCompactText}>
                      Save trails from Hidden Gems or Popular Trails to reopen them later.
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
                                message="Save a trail in Popular Trails, Hidden Gems, or ECS route ideas to keep it here."
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

          <View style={s.footerNote}>
            <Ionicons name="information-circle-outline" size={11} color={TACTICAL.textMuted} />
            <Text style={s.footerNoteText}>
              {vehicleProfile
                ? `Showing ${hiddenGemPage.eligibleCount} Explore picks and ${canonicalActiveTabRoutes.length} ${activeTabMeta.label.toLowerCase()}${aiRoutes.length > 0 ? ` + ${aiRoutes.length} ECS route idea${aiRoutes.length !== 1 ? 's' : ''}` : ''} inside ${distanceRadiusFooterLabel.toLowerCase()}. ${explorationStats.totalRoutesCompleted} route${explorationStats.totalRoutesCompleted !== 1 ? 's' : ''} explored (${explorationStats.totalMilesExplored} mi). ${hasGPSFix ? 'GPS active.' : 'Enable location for accuracy.'}${showLesserKnown ? ' Lesser-known routes boosted.' : ''}`
                : `Add a vehicle to see personalized match scores and richer hidden-gem recommendations.${aiRoutes.length > 0 ? ` ${aiRoutes.length} ECS route ideas available.` : ''}`}
            </Text>
          </View>

          <View style={{ height: 20 }} />
        </ScrollView>

          <View style={[s.footer, contentFrameStyle]}>
            <Text style={s.footerText}>
            {`EXPEDITION COMMAND SYSTEM | ${totalRouteCount} ROUTE${totalRouteCount !== 1 ? 'S' : ''} | ${distanceRadiusFooterLabel} | ${hiddenGemPage.eligibleCount} PICKS | ${activeTabMeta.label}${aiRoutes.length > 0 ? ` | ${aiRoutes.length} ECS` : ''}`}
            </Text>
          </View>

        <ExpeditionAnalysisModal visible={analysisVisible} opportunity={selectedOpportunity} compatResult={selectedOpportunity ? (compatResults.get(selectedOpportunity.id) || null) : null} vehicleProfile={vehicleProfile} hasVehicle={!!activeVehicleId} onClose={handleCloseAnalysis} onNavigate={selectedOpportunity ? () => { void handleNavigateToRoute(selectedOpportunity); } : undefined} />

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
          onClose={handleCloseAIPreview}
          onNavigate={
            aiPreviewRoute
              ? () => {
                  void handleNavigateToRoute(aiPreviewRoute);
                }
              : undefined
          }
          onBuildExpedition={() => {
            handleCloseAIPreview();
          }}
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
  scrollArea: { flex: 1 },
  scrollContent: {
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 14,
    flexGrow: 1,
  },
  discoveryControlsWrap: {
    marginTop: 6,
    marginBottom: 10,
    gap: 7,
  },
  discoveryRefreshNotice: {
    marginTop: 2,
  },
  discoverySummaryRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
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
    marginBottom: 16,
    gap: 8,
  },
  hiddenGemSection: {
    borderColor: 'rgba(230,184,76,0.18)',
    backgroundColor: 'rgba(20,16,11,0.96)',
  },
  popularTrailsSection: {
    borderColor: 'rgba(102,187,106,0.18)',
    backgroundColor: 'rgba(11,18,13,0.96)',
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
    gap: 6,
    marginBottom: 10,
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
  sectionStateActionGreen: {
    borderColor: 'rgba(102,187,106,0.30)',
    backgroundColor: 'rgba(102,187,106,0.10)',
  },
  sectionStateActionText: {
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 1.4,
    color: TACTICAL.amber,
  },
  sectionStateActionTextGreen: {
    color: '#66BB6A',
  },
  routeCardGrid: {
    gap: 10,
  },
  routeCardGridExpanded: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    rowGap: 10,
  },
  inlineSectionNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: TACTICAL.amber + '25',
    backgroundColor: TACTICAL.amber + '0D',
    marginBottom: 4,
  },
  inlineSectionNoticeText: {
    flex: 1,
    fontSize: 10,
    fontWeight: '600',
    color: TACTICAL.textMuted,
    lineHeight: 14,
  },
  hiddenGemContextRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    paddingHorizontal: 6,
    paddingBottom: 2,
  },
  hiddenGemContextChip: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: TACTICAL.amber + '30',
    backgroundColor: ECS.bgElev,
  },
  hiddenGemContextChipText: {
    fontSize: 7,
    fontWeight: '800',
    color: TACTICAL.amber,
    letterSpacing: 1,
  },
  hiddenGemPagerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'stretch',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: ECS.stroke,
    backgroundColor: ECS.bgElev,
    marginTop: 8,
  },
  hiddenGemPagerText: {
    fontSize: 9,
    fontWeight: '800',
    color: TACTICAL.amber,
    letterSpacing: 1.3,
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

  // ── Footer Note ───────────────────────────────────────
  footerNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    paddingHorizontal: 4,
    paddingVertical: 10,
    marginTop: 4,
  },
  footerNoteText: {
    fontSize: 10,
    fontWeight: '500',
    color: TACTICAL.textMuted,
    lineHeight: 15,
    flex: 1,
  },

  // ── Footer ────────────────────────────────────────────
  footer: {
    alignItems: 'center',
    paddingVertical: 6,
    borderTopWidth: GOLD_RAIL.subsectionWidth,
    borderTopColor: GOLD_RAIL.subsection,
    backgroundColor: 'rgba(11, 15, 18, 0.98)',
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




