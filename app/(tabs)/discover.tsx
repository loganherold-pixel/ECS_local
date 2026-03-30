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
  Platform,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { SafeIcon as Ionicons } from '../../components/SafeIcon';
import { TACTICAL, GOLD_RAIL, ECS, TYPO } from '../../lib/theme';
import TopoBackground from '../../components/TopoBackground';
import RigSummaryPanel from '../../components/discover/RigSummaryPanel';
import FeaturedExpeditionCard from '../../components/discover/FeaturedExpeditionCard';
import EnrichedRouteCard from '../../components/discover/EnrichedRouteCard';
import ExpeditionAnalysisModal from '../../components/discover/ExpeditionAnalysisModal';
import DistanceRadiusFilter from '../../components/discover/DistanceRadiusFilter';
import DiscoveryCategoryTabs from '../../components/discover/DiscoveryCategoryTabs';
import DiscoveryCategorySection from '../../components/discover/DiscoveryCategorySection';
import ExplorationProgressPanel from '../../components/discover/ExplorationProgressPanel';
import AIRouteCard from '../../components/discover/AIRouteCard';
import AIRoutePreviewModal from '../../components/discover/AIRoutePreviewModal';
import {
  loadOpportunitiesWithCompatibility,
  loadExpeditionOpportunities,
  filterByRadius,
  groupOpportunitiesByRegion,
  DEFAULT_DISTANCE_RADIUS,
  DEFAULT_USER_LOCATION,
  type ExpeditionOpportunity,
  type DistanceRadius,
  type RegionGroupResult,
} from '../../lib/discoverEngine';
import {
  getCompatibilityColor,
  type CompatibilityResult,
  type VehicleProfile,
} from '../../lib/rigCompatibilityEngine';
import {
  categorizeRoutesExpanded,
  DISCOVERY_TABS,
  type DiscoveryTabId,
  type CategorizedRoute,
  type ExpandedDiscoverCategories,
} from '../../lib/discoverCategoryEngine';
import { expeditionStateStore, type ExpeditionState } from '../../lib/expeditionStateStore';
import { vehicleSetupStore } from '../../lib/vehicleSetupStore';
import { vehicleStore } from '../../lib/vehicleStore';
import { hapticMicro } from '../../lib/haptics';
import {
  explorationProgressStore,
  type ExplorationStats,
  type ContinueExploringRecommendation,
} from '../../lib/explorationProgressStore';
import { aiRouteStore } from '../../lib/aiRouteStore';
import type { AIGeneratedRoute } from '../../lib/aiRouteTypes';
import {
  enrichKnownRoutes,
  enrichAIRoutes,
  recordShownRoutes,
  type EnrichedDiscoveryRoute,
} from '../../lib/discoveryIntelligenceEngine';

const TAG = '[DISCOVER]';
const TOP_PAD = Platform.OS === 'web' ? 16 : 54;
const DOCK_CLEARANCE = 76;



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
            <Text style={s.errorTitle}>DISCOVER ERROR</Text>
            <Text style={s.errorSub}>{this.state.error?.message || 'Unexpected error'}</Text>
            <TouchableOpacity style={s.retryBtn} onPress={() => this.setState({ hasError: false, error: null })}>
              <Text style={s.retryBtnText}>RETRY</Text>
            </TouchableOpacity>
          </View>
        </TopoBackground>
      );
    }
    return this.props.children;
  }
}

// ============================================================
// MAIN SCREEN
// ============================================================
function DiscoverScreenInner() {
  const router = useRouter();
  const [opportunities, setOpportunities] = useState<ExpeditionOpportunity[]>([]);
  const [compatResults, setCompatResults] = useState<Map<string, CompatibilityResult>>(new Map());
  const [vehicleProfile, setVehicleProfile] = useState<VehicleProfile | null>(null);
  const [expState, setExpState] = useState<ExpeditionState>(expeditionStateStore.getState());
  const [activeVehicleId] = useState<string | null>(vehicleSetupStore.getActiveVehicleId());

  // Analysis modal state
  const [selectedOpportunity, setSelectedOpportunity] = useState<ExpeditionOpportunity | null>(null);
  const [analysisVisible, setAnalysisVisible] = useState(false);

  // ── Loading state ─────────────────────────────────────────
  const [isLoading, setIsLoading] = useState(true);

  // ── Distance radius filter state ──────────────────────────
  const [distanceRadius, setDistanceRadius] = useState<DistanceRadius>(DEFAULT_DISTANCE_RADIUS);

  // ── User location state ───────────────────────────────────
  const [userLat, setUserLat] = useState<number>(DEFAULT_USER_LOCATION.latitude);
  const [userLng, setUserLng] = useState<number>(DEFAULT_USER_LOCATION.longitude);
  const [hasGPSFix, setHasGPSFix] = useState(false);

  // ── Phase 16: Category tab state ──────────────────────────
  const [activeTab, setActiveTab] = useState<DiscoveryTabId>('day-trips');
  const [showLesserKnown, setShowLesserKnown] = useState(false);

  // ── Phase 17: AI Route state ──────────────────────────────
  const [aiRoutes, setAiRoutes] = useState<AIGeneratedRoute[]>([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiPreviewRoute, setAiPreviewRoute] = useState<AIGeneratedRoute | null>(null);
  const [aiPreviewVisible, setAiPreviewVisible] = useState(false);
  const [aiEnabled, setAiEnabled] = useState(true);

  // ── Phase 13: Exploration Progress state ───────────────────
  const [completedIds, setCompletedIds] = useState<Set<string>>(
    () => explorationProgressStore.getCompletedIds(),
  );

  const mountedRef = useRef(true);
  useEffect(() => { return () => { mountedRef.current = false; }; }, []);

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

  // ── Phase 13: Exploration stats (memoized) ─────────────────
  const explorationStats = useMemo<ExplorationStats>(() => {
    return explorationProgressStore.computeStats(opportunities.length || 12);
  }, [completedIds, opportunities.length]);

  // ── Phase 13: Continue Exploring recommendations ───────────
  const continueExploring = useMemo<ContinueExploringRecommendation[]>(() => {
    if (opportunities.length === 0) return [];
    return explorationProgressStore.getContinueExploring(opportunities, 3);
  }, [completedIds, opportunities]);

  // ── Acquire user location (one-shot) ──────────────────────
  useEffect(() => {
    let cancelled = false;

    async function acquireLocation() {
      try {
        const Location = await import('expo-location' as any);
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === 'granted' && !cancelled) {
          const loc = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy?.Balanced || 3,
          });
          if (!cancelled && mountedRef.current) {
            setUserLat(loc.coords.latitude);
            setUserLng(loc.coords.longitude);
            setHasGPSFix(true);
            console.log(TAG, `GPS fix: ${loc.coords.latitude.toFixed(4)}, ${loc.coords.longitude.toFixed(4)}`);
          }
          return;
        }
      } catch {
        // expo-location not available
      }

      if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            if (!cancelled && mountedRef.current) {
              setUserLat(pos.coords.latitude);
              setUserLng(pos.coords.longitude);
              setHasGPSFix(true);
            }
          },
          () => {},
          { enableHighAccuracy: false, timeout: 8000, maximumAge: 60000 }
        );
      }
    }

    acquireLocation();
    return () => { cancelled = true; };
  }, []);

  // Subscribe to expedition state
  useEffect(() => {
    const unsub = expeditionStateStore.subscribe((state) => {
      if (mountedRef.current) setExpState(state);
    });
    return unsub;
  }, []);

  // Load opportunities with compatibility on focus
  useFocusEffect(useCallback(() => {
    (async () => {
      if (mountedRef.current) setIsLoading(true);

      try {
        let vehicleRecord: any = null;
        const vid = vehicleSetupStore.getActiveVehicleId();
        if (vid) {
          try {
            const { vehicles } = await vehicleStore.getAll();
            vehicleRecord = vehicles.find((v: any) => v.id === vid) || null;
          } catch {}
        }

        const { opportunities: ops, results, profile } = loadOpportunitiesWithCompatibility(
          vehicleRecord, userLat, userLng,
        );

        if (mountedRef.current) {
          setOpportunities(ops);
          setCompatResults(results);
          setVehicleProfile(profile);
          setIsLoading(false);
        }
      } catch (err) {
        console.warn(TAG, 'Failed to load with compatibility, falling back:', err);
        const ops = loadExpeditionOpportunities();
        if (mountedRef.current) {
          setOpportunities(ops);
          setCompatResults(new Map());
          setVehicleProfile(null);
          setIsLoading(false);
        }
      }
    })();
  }, [userLat, userLng]));

  // ── Filter opportunities by distance radius ───────────────
  const radiusFilteredOpportunities = useMemo(() => {
    return filterByRadius(opportunities, distanceRadius);
  }, [opportunities, distanceRadius]);

  const featuredExpedition = useMemo<ExpeditionOpportunity | null>(() => {
    if (radiusFilteredOpportunities.length === 0) return null;
    return radiusFilteredOpportunities[0];
  }, [radiusFilteredOpportunities]);

  // ── Phase 16: Expanded categories ─────────────────────────
  const expandedCategories = useMemo<ExpandedDiscoverCategories>(() => {
    return categorizeRoutesExpanded(
      radiusFilteredOpportunities,
      compatResults,
      distanceRadius,
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

  const activeTabMeta = DISCOVERY_TABS.find(t => t.id === activeTab) ?? DISCOVERY_TABS[0];

  // ── Phase 17: Fetch AI routes handler ─────────────────────
  const handleFetchAIRoutes = useCallback(async () => {
    if (!aiEnabled) return;
    hapticMicro();

    const vehicleType = vehicleProfile
      ? `${vehicleProfile.vehicleName || 'Unknown Vehicle'}`
      : 'stock SUV';

    const existingNames = activeTabRoutes.map(r => r.name);

    await aiRouteStore.fetchRoutes({
      latitude: userLat,
      longitude: userLng,
      category: activeTab,
      radiusMiles: distanceRadius,
      vehicleType,
      vehicleBuild: vehicleProfile ? `${vehicleProfile.vehicleName || ''}` : '',
      count: 4,
      existingRouteNames: existingNames,
    });
  }, [aiEnabled, activeTab, distanceRadius, userLat, userLng, vehicleProfile, activeTabRoutes]);

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
  }, [activeTab, distanceRadius, isLoading, aiEnabled]);

  const handleSelectOpportunity = useCallback((op: ExpeditionOpportunity) => {
    hapticMicro();
    setSelectedOpportunity(op);
    setAnalysisVisible(true);
  }, []);

  const handleCloseAnalysis = useCallback(() => {
    setAnalysisVisible(false);
    setTimeout(() => setSelectedOpportunity(null), 300);
  }, []);

  const handleRadiusChange = useCallback((radius: DistanceRadius) => {
    hapticMicro();
    setDistanceRadius(radius);
    // Clear AI cache when radius changes
    aiRouteStore.clearAll();
  }, []);


  // ── Phase 17: AI Route Preview handlers ───────────────────
  const handleAIPreview = useCallback((route: AIGeneratedRoute) => {
    hapticMicro();
    setAiPreviewRoute(route);
    setAiPreviewVisible(true);
  }, []);

  const handleCloseAIPreview = useCallback(() => {
    setAiPreviewVisible(false);
    setTimeout(() => setAiPreviewRoute(null), 300);
  }, []);

  const statusLabel = useMemo(() => {
    if (expState === 'active') return 'EXPEDITION ACTIVE';
    if (expState === 'complete') return 'EXPEDITION COMPLETE';
    return 'STANDBY';
  }, [expState]);

  const statusColor = useMemo(() => {
    if (expState === 'active') return TACTICAL.amber;
    if (expState === 'complete') return TACTICAL.amber;
    return TACTICAL.textMuted;
  }, [expState]);

  const avgCompat = useMemo(() => {
    if (radiusFilteredOpportunities.length === 0 || compatResults.size === 0) return null;
    let sum = 0; let count = 0;
    radiusFilteredOpportunities.forEach(op => {
      const r = compatResults.get(op.id);
      if (r) { sum += r.score; count++; }
    });
    return count > 0 ? Math.round(sum / count) : null;
  }, [radiusFilteredOpportunities, compatResults]);

  // ── Phase 18: Enriched routes with discovery intelligence ──
  const enrichedKnown = useMemo<EnrichedDiscoveryRoute[]>(() => {
    if (activeTabRoutes.length === 0) return [];
    return enrichKnownRoutes(activeTabRoutes, vehicleProfile, compatResults);
  }, [activeTabRoutes, vehicleProfile, compatResults]);

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

  const totalRouteCount = activeTabRoutes.length + aiRoutes.length;


  return (
    <TopoBackground>
      <View style={s.safeContainer}>
        {/* Header */}
        <View style={s.header}>
          <View>
            <Text style={s.headerBrand}>ECS EXPEDITION DISCOVERY</Text>
            <Text style={s.headerTitle}>DISCOVER</Text>
          </View>
          <View style={s.headerRight}>
            <View style={[s.statusBadge, { borderColor: statusColor + '40' }]}>
              <View style={[s.statusDot, { backgroundColor: statusColor }]} />
              <Text style={[s.statusText, { color: statusColor }]}>{statusLabel}</Text>
            </View>
          </View>
        </View>

        <View style={s.goldRail} />

        <ScrollView style={s.scrollArea} contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false}>
          <RigSummaryPanel vehicleProfile={vehicleProfile} avgCompatibility={avgCompat} opportunityCount={radiusFilteredOpportunities.length} />

          <DistanceRadiusFilter selectedRadius={distanceRadius} onChangeRadius={handleRadiusChange} hasGPSFix={hasGPSFix} totalCount={opportunities.length} filteredCount={radiusFilteredOpportunities.length} isLoading={isLoading} />

          {/* ── Phase 16: Category Tabs ────────────────────────── */}
          {!isLoading && (
            <DiscoveryCategoryTabs
              activeTab={activeTab}
              onChangeTab={setActiveTab}
              categories={expandedCategories}
              showLesserKnown={showLesserKnown}
              onToggleLesserKnown={setShowLesserKnown}
            />
          )}

          {/* ── Phase 13: Exploration Progress Panel ──────────── */}
          {!isLoading && (
            <ExplorationProgressPanel
              stats={explorationStats}
              recommendations={continueExploring}
              onSelectRoute={handleSelectOpportunity}
              totalAvailableRoutes={opportunities.length || 12}
            />
          )}

          {isLoading && (
            <View style={s.loadingContainer}>
              <ActivityIndicator size="large" color={TACTICAL.amber} />
              <Text style={s.loadingText}>SCANNING TRAILS...</Text>
              <Text style={s.loadingSubText}>Calculating distances and match scores</Text>
            </View>
          )}

          {!isLoading && featuredExpedition && (
            <FeaturedExpeditionCard opportunity={featuredExpedition} compatResult={compatResults.get(featuredExpedition.id) || null} onViewAnalysis={() => handleSelectOpportunity(featuredExpedition)} />
          )}

          {!isLoading && radiusFilteredOpportunities.length === 0 && (
            <View style={s.emptyRadius}>
              <View style={s.emptyRadiusIconWrap}>
                <Ionicons name="locate-outline" size={32} color={TACTICAL.textMuted} />
              </View>
              <Text style={s.emptyRadiusTitle}>NO TRAILS WITHIN RANGE</Text>
              <Text style={s.emptyRadiusDesc}>
                No trails found within {distanceRadius} miles.{'\n'}Try expanding your search radius.
              </Text>
              {distanceRadius < 500 && (
                <TouchableOpacity style={s.emptyRadiusBtn} onPress={() => { hapticMicro(); setDistanceRadius(500); }} activeOpacity={0.8}>
                  <Ionicons name="expand-outline" size={12} color={TACTICAL.amber} />
                  <Text style={s.emptyRadiusBtnText}>EXPAND TO 500 MI</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {/* ── Phase 16: Active Tab Route Feed ──────────────── */}
          {!isLoading && (activeTabRoutes.length > 0 || aiRoutes.length > 0) && (
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
                      <Text style={s.aiBadgeText}>{aiRoutes.length} AI</Text>
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
                  onSelect={() => handleSelectOpportunity(route)}
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
                      <Text style={s.aiDividerText}>AI SUGGESTED ROUTES</Text>
                    </View>
                    <View style={s.aiDividerLine} />
                  </View>

                  {aiRoutes.map((route) => (
                    <AIRouteCard
                      key={route.id}
                      route={route}
                      enrichedRoute={enrichedAIMap.get(route.id) ?? null}
                      onPreview={() => handleAIPreview(route)}
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
          {!isLoading && aiEnabled && aiLoading && (
            <View style={s.aiLoadingContainer}>
              <ActivityIndicator size="small" color="#5AC8FA" />
              <Text style={s.aiLoadingText}>GENERATING AI ROUTE IDEAS...</Text>
              <Text style={s.aiLoadingSubText}>Analyzing terrain and geography near you</Text>
            </View>
          )}

          {/* ── Phase 17: AI Error State ──────────────────────── */}
          {!isLoading && aiEnabled && aiError && !aiLoading && aiRoutes.length === 0 && (
            <View style={s.aiErrorContainer}>
              <Ionicons name="cloud-offline-outline" size={16} color={TACTICAL.textMuted} />
              <Text style={s.aiErrorText}>AI suggestions unavailable</Text>
              <TouchableOpacity style={s.aiRetryBtn} onPress={handleFetchAIRoutes} activeOpacity={0.7}>
                <Ionicons name="refresh-outline" size={10} color={TACTICAL.amber} />
                <Text style={s.aiRetryBtnText}>RETRY</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* ── Phase 17: Generate AI Routes Button ───────────── */}
          {!isLoading && aiEnabled && !aiLoading && !aiError && aiRoutes.length === 0 && activeTabRoutes.length > 0 && (
            <TouchableOpacity
              style={s.generateAIBtn}
              activeOpacity={0.8}
              onPress={handleFetchAIRoutes}
            >
              <View style={s.generateAIBtnInner}>
                <Ionicons name="sparkles-outline" size={14} color="#5AC8FA" />
                <View style={s.generateAIBtnContent}>
                  <Text style={s.generateAIBtnTitle}>DISCOVER AI ROUTE IDEAS</Text>
                  <Text style={s.generateAIBtnDesc}>
                    Generate expedition suggestions based on your location and {activeTabMeta.label.toLowerCase()} preferences
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={14} color={TACTICAL.textMuted} />
              </View>
            </TouchableOpacity>
          )}

          {!isLoading && activeTabRoutes.length === 0 && aiRoutes.length === 0 && radiusFilteredOpportunities.length > 0 && (
            <View style={s.emptyRadius}>
              <Ionicons name={activeTabMeta.icon as any} size={28} color={TACTICAL.textMuted} />
              <Text style={s.emptyRadiusTitle}>NO {activeTabMeta.label} IN RANGE</Text>
              <Text style={s.emptyRadiusDesc}>
                No routes matching this category found within {distanceRadius} miles.{'\n'}Try expanding your distance filter or selecting a different category.
              </Text>
              {aiEnabled && !aiLoading && (
                <TouchableOpacity style={s.emptyRadiusBtn} onPress={handleFetchAIRoutes} activeOpacity={0.8}>
                  <Ionicons name="sparkles-outline" size={12} color="#5AC8FA" />
                  <Text style={[s.emptyRadiusBtnText, { color: '#5AC8FA' }]}>GENERATE AI SUGGESTIONS</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          <View style={s.footerNote}>
            <Ionicons name="information-circle-outline" size={11} color={TACTICAL.textMuted} />
            <Text style={s.footerNoteText}>
              {vehicleProfile
                ? `Showing ${activeTabRoutes.length} ${activeTabMeta.label.toLowerCase()}${aiRoutes.length > 0 ? ` + ${aiRoutes.length} AI suggested` : ''} of ${radiusFilteredOpportunities.length} trails within ${distanceRadius} mi. ${explorationStats.totalRoutesCompleted} route${explorationStats.totalRoutesCompleted !== 1 ? 's' : ''} explored (${explorationStats.totalMilesExplored} mi). ${hasGPSFix ? 'GPS active.' : 'Enable location for accuracy.'}${showLesserKnown ? ' Lesser-known routes boosted.' : ''}`
                : `Add a vehicle to see personalized match scores and expedition recommendations.${aiRoutes.length > 0 ? ` ${aiRoutes.length} AI route ideas available.` : ''}`}
            </Text>
          </View>

          <View style={{ height: 20 }} />
        </ScrollView>

        <View style={s.footer}>
          <Text style={s.footerText}>
            ECS DISCOVER  //  {totalRouteCount} ROUTE{totalRouteCount !== 1 ? 'S' : ''} · {distanceRadius} MI · {activeTabMeta.label}{aiRoutes.length > 0 ? ` · ${aiRoutes.length} AI` : ''}  //  {explorationStats.totalRoutesCompleted} EXPLORED
          </Text>
        </View>

        <ExpeditionAnalysisModal visible={analysisVisible} opportunity={selectedOpportunity} compatResult={selectedOpportunity ? (compatResults.get(selectedOpportunity.id) || null) : null} vehicleProfile={vehicleProfile} hasVehicle={!!activeVehicleId} onClose={handleCloseAnalysis} />

        {/* ── Phase 18: AI Route Preview Modal with enrichment ── */}
        <AIRoutePreviewModal
          visible={aiPreviewVisible}
          route={aiPreviewRoute}
          enrichedRoute={aiPreviewRoute ? (enrichedAIMap.get(aiPreviewRoute.id) ?? null) : null}
          onClose={handleCloseAIPreview}
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
    paddingBottom: DOCK_CLEARANCE,
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },

  // ── Header ────────────────────────────────────────────
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: TOP_PAD,
    paddingBottom: 12,
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
  scrollContent: { padding: 16, flexGrow: 1 },

  // ── Loading State ─────────────────────────────────────
  loadingContainer: {
    alignItems: 'center',
    paddingVertical: 40,
    gap: 12,
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
    paddingVertical: 36,
    paddingHorizontal: 24,
    backgroundColor: ECS.bgPanel,
    borderRadius: ECS.radius,
    borderWidth: 1,
    borderColor: TACTICAL.amber + '20',
    marginBottom: 18,
    gap: 10,
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




