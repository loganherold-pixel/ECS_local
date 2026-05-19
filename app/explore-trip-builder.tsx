import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import Header from '../components/Header';
import { SafeIcon as Ionicons } from '../components/SafeIcon';
import TopoBackground from '../components/TopoBackground';
import { ECS, TACTICAL } from '../lib/theme';
import { loadOpportunitiesWithCompatibility, type ExpeditionOpportunity } from '../lib/discoverEngine';
import { buildProfileFromSpecs } from '../lib/rigCompatibilityEngine';
import { extractExploreRouteCampMarkers } from '../lib/exploreRouteCampHandoff';
import {
  buildExploreRouteReadinessAssessment,
  getExploreRouteReadinessSummary,
} from '../lib/readiness/exploreRouteReadiness';
import { getShellBottomClearance } from '../lib/shellLayout';
import { hapticMicro } from '../lib/haptics';
import {
  buildTripPlan,
  clearTripBuilderRouteHandoff,
  loadTripBuilderRouteHandoff,
  type CampCandidate,
  type GroupType,
  type TimeWindow,
  type TripBuilderInput,
  type TripPlan,
  type TripBuilderRouteInput,
  type TripPlanStop,
  type TripPriority,
  type TripType,
  type ResupplyCategoryPlan,
  type SmartResupplyPlan,
} from '../lib/tripBuilder';
import { saveOfflinePrepPackHandoff } from '../lib/offlinePrepPack';
import { loadExplorePlanningRouteContext } from '../lib/explore/explorePlanningRouteContextStore';

const TRIP_TYPE_OPTIONS: { value: TripType; label: string; detail: string }[] = [
  { value: 'day_trip', label: 'Day Trip', detail: 'Simple same-day plan' },
  { value: 'overnight_camping', label: 'Overnight', detail: 'Camp-focused route plan' },
  { value: 'weekend_overland', label: 'Weekend', detail: 'Two-day overland plan' },
  { value: 'multi_day_expedition', label: 'Multi-Day', detail: 'More complete segmentation' },
  { value: 'scenic_exploration', label: 'Scenic', detail: 'Stops and overlooks' },
  { value: 'technical_trail_run', label: 'Technical', detail: 'Trail run focus' },
];

const TIME_WINDOW_OPTIONS: { value: TimeWindow; label: string }[] = [
  { value: 'morning', label: 'Morning' },
  { value: 'afternoon', label: 'Afternoon' },
  { value: 'full_day', label: 'Full Day' },
  { value: 'overnight', label: 'Overnight' },
  { value: 'weekend', label: 'Weekend' },
];

const GROUP_OPTIONS: { value: GroupType; label: string }[] = [
  { value: 'solo', label: 'Solo' },
  { value: 'two_vehicle', label: '2 Vehicle' },
  { value: 'small_group', label: 'Small Group' },
  { value: 'convoy', label: 'Convoy' },
];

const PRIORITY_OPTIONS: { value: TripPriority; label: string; icon: string }[] = [
  { value: 'camping', label: 'Camping', icon: 'bonfire-outline' },
  { value: 'scenic_stops', label: 'Scenic', icon: 'camera-outline' },
  { value: 'technical_terrain', label: 'Technical', icon: 'trail-sign-outline' },
  { value: 'low_risk', label: 'Low Risk', icon: 'shield-checkmark-outline' },
  { value: 'remote_travel', label: 'Remote', icon: 'radio-outline' },
  { value: 'fuel_efficiency', label: 'Fuel', icon: 'speedometer-outline' },
  { value: 'family_friendly', label: 'Family', icon: 'people-outline' },
  { value: 'photography_overlooks', label: 'Photos', icon: 'aperture-outline' },
];

function campingImplied(tripType: TripType): boolean {
  return tripType === 'overnight_camping' || tripType === 'weekend_overland' || tripType === 'multi_day_expedition';
}

function formatMiles(value: number | null | undefined): string {
  return typeof value === 'number' && Number.isFinite(value) ? `${value.toFixed(value >= 10 ? 0 : 1)} mi` : 'Unknown';
}

function formatHours(value: number | null | undefined): string {
  return typeof value === 'number' && Number.isFinite(value) ? `${value.toFixed(value >= 10 ? 0 : 1)} hr` : 'Unknown';
}

function tripTypeLabel(value: TripType): string {
  return TRIP_TYPE_OPTIONS.find((option) => option.value === value)?.label ?? value;
}

function statusColor(status: string): string {
  if (status === 'good') return '#66BB6A';
  if (status === 'medium') return TACTICAL.amber;
  if (status === 'low') return '#EF5350';
  return TACTICAL.textMuted;
}

function statusLabel(status: string): string {
  return status === 'unknown' ? 'DATA UNAVAILABLE' : status.toUpperCase();
}

function formatDistance(value: number | null | undefined): string | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return `${value.toFixed(value >= 10 ? 0 : 1)} mi`;
}

function resupplyRows(plan: SmartResupplyPlan): ResupplyCategoryPlan[] {
  return [
    plan.fuel,
    plan.water,
    plan.supplies,
    plan.repair,
    plan.medical,
    plan.exitAccess,
  ];
}

function resupplyLabel(category: ResupplyCategoryPlan['category']): string {
  switch (category) {
    case 'fuel':
      return 'Fuel';
    case 'water':
      return 'Water';
    case 'food_supplies':
      return 'Food/Supplies';
    case 'repair':
      return 'Repair';
    case 'medical':
      return 'Medical';
    case 'exit_access':
      return 'Exit Access';
    default:
      return 'Support';
  }
}

function resupplyIcon(category: ResupplyCategoryPlan['category']): string {
  switch (category) {
    case 'fuel':
      return 'speedometer-outline';
    case 'water':
      return 'water-outline';
    case 'food_supplies':
      return 'bag-outline';
    case 'repair':
      return 'construct-outline';
    case 'medical':
      return 'medkit-outline';
    case 'exit_access':
      return 'exit-outline';
    default:
      return 'help-circle-outline';
  }
}

function routeToCampCandidates(route: ExpeditionOpportunity | null): CampCandidate[] {
  return extractExploreRouteCampMarkers(route).map((marker) => ({
    id: marker.id,
    name: marker.title,
    location: { latitude: marker.latitude, longitude: marker.longitude },
    score: marker.score,
    legalConfidence: marker.confidence,
    accessConfidence: marker.confidence,
    source: marker.source ?? 'explore_route_camp_marker',
    notes: [marker.subtitle],
  }));
}

function RouteSelectionCard({
  route,
  selected,
  onPress,
}: {
  route: ExpeditionOpportunity;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.routeOption, selected && styles.routeOptionSelected]}
      activeOpacity={0.82}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Select ${route.name}`}
      testID={`trip-builder-route-option-${route.id}`}
    >
      <View style={styles.routeOptionIcon}>
        <Ionicons name={selected ? 'checkmark-circle' : 'map-outline'} size={15} color={selected ? TACTICAL.amber : TACTICAL.textMuted} />
      </View>
      <View style={styles.routeOptionCopy}>
        <Text style={styles.routeOptionTitle} numberOfLines={1}>{route.name}</Text>
        <Text style={styles.routeOptionMeta} numberOfLines={1}>
          {route.region} | {formatMiles(route.distanceMiles)} | {route.estimatedDays} day{route.estimatedDays === 1 ? '' : 's'}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

function OptionChip({
  label,
  selected,
  onPress,
  icon,
  testID,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  icon?: string;
  testID?: string;
}) {
  return (
    <TouchableOpacity
      style={[styles.chip, selected && styles.chipSelected]}
      activeOpacity={0.8}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      testID={testID}
    >
      {icon ? (
        <Ionicons name={icon as any} size={11} color={selected ? '#081014' : TACTICAL.textMuted} />
      ) : null}
      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{label}</Text>
    </TouchableOpacity>
  );
}

function StopRow({ stop }: { stop: TripPlanStop }) {
  const note = stop.notes?.[0] ?? null;
  return (
    <View style={styles.stopRow}>
      <View style={styles.stopIndex}>
        <Text style={styles.stopIndexText}>{stop.sequence}</Text>
      </View>
      <View style={styles.stopCopy}>
        <Text style={styles.stopTitle}>{stop.title}</Text>
        <Text style={styles.stopMeta}>
          {stop.type.replace('_', ' ').toUpperCase()} | Day {stop.plannedDay}
          {stop.routeMileMarker != null ? ` | mile ${Math.round(stop.routeMileMarker)}` : ''}
        </Text>
        {note ? <Text style={styles.stopNote}>{note}</Text> : null}
      </View>
    </View>
  );
}

function ResupplyRow({ plan }: { plan: ResupplyCategoryPlan }) {
  const color = statusColor(plan.status);
  const distance = formatDistance(plan.keyDistanceMiles);
  const detail = [
    plan.keyPoint?.name,
    distance,
  ].filter(Boolean).join(' | ');
  return (
    <View style={styles.resupplyRow} accessibilityLabel={`${resupplyLabel(plan.category)} status ${plan.status}`}>
      <View style={[styles.resupplyIcon, { borderColor: color + '45', backgroundColor: color + '10' }]}>
        <Ionicons name={resupplyIcon(plan.category) as any} size={13} color={color} />
      </View>
      <View style={styles.resupplyCopy}>
        <View style={styles.resupplyTitleRow}>
          <Text style={styles.resupplyTitle}>{resupplyLabel(plan.category)}</Text>
          <Text style={[styles.resupplyStatus, { color }]}>{statusLabel(plan.status)}</Text>
        </View>
        <Text style={styles.resupplyRecommendation}>{plan.primaryRecommendation}</Text>
        {detail ? <Text style={styles.resupplyMeta}>{detail}</Text> : null}
        {plan.warnings[0] ? <Text style={styles.resupplyWarning}>{plan.warnings[0].message}</Text> : null}
      </View>
    </View>
  );
}

export default function ExploreTripBuilderScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ routeId?: string }>();
  const insets = useSafeAreaInsets();
  const bottomClearance = getShellBottomClearance(insets.bottom, 8);
  const [routes, setRoutes] = useState<ExpeditionOpportunity[]>([]);
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [tripType, setTripType] = useState<TripType>('day_trip');
  const [timeWindow, setTimeWindow] = useState<TimeWindow>('full_day');
  const [groupType, setGroupType] = useState<GroupType>('two_vehicle');
  const [priorities, setPriorities] = useState<TripPriority[]>(['low_risk']);
  const [plan, setPlan] = useState<TripPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const handoff = loadTripBuilderRouteHandoff();
      const exploreContext = loadExplorePlanningRouteContext();
      const suggestedRoutes = (exploreContext?.routes?.length
        ? exploreContext.routes
        : loadOpportunitiesWithCompatibility(null).opportunities
      ).slice(0, 8) as ExpeditionOpportunity[];
      const handoffRoute = handoff?.route as ExpeditionOpportunity | undefined;
      const routeMap = new Map<string, ExpeditionOpportunity>();
      if (handoffRoute?.id) routeMap.set(String(handoffRoute.id), handoffRoute);
      suggestedRoutes.forEach((route) => routeMap.set(String(route.id), route));
      const nextRoutes = Array.from(routeMap.values());
      setRoutes(nextRoutes);
      const requestedRouteId = params.routeId ? String(params.routeId) : null;
      setSelectedRouteId(requestedRouteId ?? (handoffRoute?.id ? String(handoffRoute.id) : null));
      setError(null);
    } catch {
      setError('Trip Builder could not load route options.');
    } finally {
      setLoading(false);
    }
  }, [params.routeId]);

  const selectedRoute = useMemo(
    () => routes.find((route) => String(route.id) === selectedRouteId) ?? null,
    [routes, selectedRouteId],
  );

  const readinessReference = useMemo(() => {
    if (!selectedRoute) return null;
    try {
      const assessment = buildExploreRouteReadinessAssessment(selectedRoute, { hasVehicle: false });
      const summary = getExploreRouteReadinessSummary(assessment, selectedRoute, { hasVehicle: false });
      return {
        status: assessment.status,
        score: assessment.overallScore,
        summary,
        topConcern: summary.concern,
        source: 'explore_route_readiness',
        updatedAt: assessment.updatedAt,
      };
    } catch {
      return null;
    }
  }, [selectedRoute]);

  const vehicleProfile = useMemo(() => {
    const profile = buildProfileFromSpecs();
    if (!profile) return null;
    return {
      id: profile.vehicleId,
      label: profile.vehicleName,
      vehicleType: profile.vehicleType,
      rangeMiles: profile.fuel_range_miles,
      clearanceInches: null,
      tireSizeInches: profile.tireSizeInches,
      confidence: 'medium' as const,
      source: 'fleet_profile',
    };
  }, []);

  const togglePriority = (priority: TripPriority) => {
    setPriorities((current) => {
      if (current.includes(priority)) return current.filter((item) => item !== priority);
      if (current.length >= 2) return [current[1], priority];
      return [...current, priority];
    });
  };

  const setCampingNeeded = (needed: boolean) => {
    setPriorities((current) => {
      if (needed) {
        if (current.includes('camping')) return current;
        if (current.length >= 2) return ['camping', current[1]];
        return ['camping', ...current];
      }
      return current.filter((item) => item !== 'camping');
    });
  };

  const setTripTypeAndDefaults = (next: TripType) => {
    hapticMicro();
    setTripType(next);
    if (campingImplied(next)) {
      setPriorities((current) => current.filter((item) => item !== 'camping').slice(0, 2));
    }
    if (next === 'overnight_camping') setTimeWindow('overnight');
    if (next === 'weekend_overland') setTimeWindow('weekend');
    if (next === 'multi_day_expedition') setTimeWindow('custom');
  };

  const handleGenerate = () => {
    if (!selectedRoute) {
      setError('Select a route before generating a trip plan.');
      return;
    }
    try {
      setGenerating(true);
      setError(null);
      const input: TripBuilderInput = {
        tripType,
        timeWindow,
        groupType,
        priorities,
      };
      const nextPlan = buildTripPlan({
        route: selectedRoute as unknown as TripBuilderRouteInput,
        input,
        vehicleProfile,
        readiness: readinessReference,
        campsiteCandidates: routeToCampCandidates(selectedRoute),
        exitPoints: null,
      });
      setPlan(nextPlan);
    } catch {
      setError('Trip Builder could not build a plan from the selected route.');
    } finally {
      setGenerating(false);
    }
  };

  const handlePrepareOfflinePack = () => {
    if (selectedRoute && plan) {
      saveOfflinePrepPackHandoff({
        route: selectedRoute as unknown as TripBuilderRouteInput,
        tripPlan: plan,
        smartResupplyPlan: plan.smartResupplyPlan,
        vehicleProfile,
        readiness: readinessReference,
        campsiteCandidates: routeToCampCandidates(selectedRoute),
      }, 'trip_builder');
    }
    hapticMicro();
    router.push('/explore-offline-prep-pack');
  };

  const handleBackToSuggestedRoutes = () => {
    clearTripBuilderRouteHandoff();
    router.push('/discover');
  };

  return (
    <TopoBackground>
      <View style={[styles.safeContainer, { paddingBottom: bottomClearance }]}>
        <Header title="Explore" />
        <ScrollView
          style={styles.scrollArea}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          testID="trip-builder-screen"
        >
          <View style={styles.heroCard}>
            <View style={styles.heroIcon}>
              <Ionicons name="git-merge-outline" size={18} color={TACTICAL.amber} />
            </View>
            <View style={styles.heroCopy}>
              <Text style={styles.eyebrow}>EXPLORE PLANNING</Text>
              <Text style={styles.heroTitle}>Trip Builder</Text>
              <Text style={styles.heroText}>
                Turn a selected route into a day trip, overnight route, or expedition-style plan.
              </Text>
            </View>
          </View>

          {loading ? (
            <View style={styles.stateCard}>
              <ActivityIndicator color={TACTICAL.amber} />
              <Text style={styles.stateText}>Loading route options...</Text>
            </View>
          ) : routes.length === 0 ? (
            <View style={styles.stateCard} testID="trip-builder-empty-state">
              <Ionicons name="map-outline" size={20} color={TACTICAL.textMuted} />
              <Text style={styles.stateTitle}>No routes ready for planning</Text>
              <Text style={styles.stateText}>Open Suggested Routes, then select a route to build a trip plan.</Text>
              <TouchableOpacity style={styles.primaryButton} onPress={handleBackToSuggestedRoutes} accessibilityRole="button">
                <Text style={styles.primaryButtonText}>Suggested Routes</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <View style={styles.sectionCard}>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>Selected Route</Text>
                  <Text style={styles.sectionMeta}>{selectedRoute ? 'READY' : 'SELECT'}</Text>
                </View>
                {selectedRoute ? (
                  <View style={styles.selectedRouteSummary} testID="trip-builder-selected-route">
                    <Text style={styles.selectedRouteTitle}>{selectedRoute.name}</Text>
                    <Text style={styles.selectedRouteMeta}>
                      {selectedRoute.region} | {formatMiles(selectedRoute.distanceMiles)} | {selectedRoute.terrainType}
                    </Text>
                  </View>
                ) : null}
                <View style={styles.routeList}>
                  {routes.slice(0, 6).map((route) => (
                    <RouteSelectionCard
                      key={route.id}
                      route={route}
                      selected={String(route.id) === selectedRouteId}
                      onPress={() => {
                        hapticMicro();
                        setSelectedRouteId(String(route.id));
                        setPlan(null);
                      }}
                    />
                  ))}
                </View>
              </View>

              <View style={styles.sectionCard}>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>Trip Setup</Text>
                  <Text style={styles.sectionMeta}>PLAN INPUTS</Text>
                </View>

                <Text style={styles.groupLabel}>Trip Type</Text>
                <View style={styles.optionGrid}>
                  {TRIP_TYPE_OPTIONS.map((option) => (
                    <TouchableOpacity
                      key={option.value}
                      style={[styles.tripTypeCard, tripType === option.value && styles.tripTypeCardSelected]}
                      activeOpacity={0.82}
                      onPress={() => setTripTypeAndDefaults(option.value)}
                      accessibilityRole="button"
                      accessibilityLabel={`Trip type ${option.label}`}
                      accessibilityState={{ selected: tripType === option.value }}
                      testID={`trip-builder-trip-type-${option.value}`}
                    >
                      <Text style={[styles.tripTypeLabel, tripType === option.value && styles.tripTypeLabelSelected]}>{option.label}</Text>
                      <Text style={styles.tripTypeDetail}>{option.detail}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={styles.groupLabel}>Time Window</Text>
                <View style={styles.chipRow}>
                  {TIME_WINDOW_OPTIONS.map((option) => (
                    <OptionChip
                      key={option.value}
                      label={option.label}
                      selected={timeWindow === option.value}
                      onPress={() => {
                        hapticMicro();
                        setTimeWindow(option.value);
                      }}
                      testID={`trip-builder-time-${option.value}`}
                    />
                  ))}
                </View>

                <Text style={styles.groupLabel}>Group Type</Text>
                <View style={styles.chipRow}>
                  {GROUP_OPTIONS.map((option) => (
                    <OptionChip
                      key={option.value}
                      label={option.label}
                      selected={groupType === option.value}
                      onPress={() => {
                        hapticMicro();
                        setGroupType(option.value);
                      }}
                      testID={`trip-builder-group-${option.value}`}
                    />
                  ))}
                </View>

                <View
                  style={styles.campingToggleRow}
                  accessibilityLabel={campingImplied(tripType) ? 'Camping included for this trip type' : 'Camping needed'}
                  testID="trip-builder-camping-needed"
                >
                  <View style={styles.campingToggleCopy}>
                    <Text style={styles.groupLabel}>Include Camping</Text>
                    <Text style={styles.campingToggleHint}>
                      {campingImplied(tripType)
                        ? 'Included for this trip type.'
                        : 'Adds camp checks and camp candidate priority.'}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={[
                      styles.togglePill,
                      (campingImplied(tripType) || priorities.includes('camping')) && styles.togglePillOn,
                      campingImplied(tripType) && styles.togglePillLocked,
                    ]}
                    activeOpacity={campingImplied(tripType) ? 1 : 0.82}
                    disabled={campingImplied(tripType)}
                    onPress={() => setCampingNeeded(!priorities.includes('camping'))}
                    accessibilityRole="switch"
                    accessibilityState={{
                      checked: campingImplied(tripType) || priorities.includes('camping'),
                      disabled: campingImplied(tripType),
                    }}
                    testID="trip-builder-camping-needed-toggle"
                  >
                    <Ionicons
                      name={(campingImplied(tripType) || priorities.includes('camping')) ? 'checkmark' : 'remove'}
                      size={13}
                      color={(campingImplied(tripType) || priorities.includes('camping')) ? '#081014' : TACTICAL.textMuted}
                    />
                  </TouchableOpacity>
                </View>

                <View style={styles.priorityHeader}>
                  <Text style={styles.groupLabel}>Priorities</Text>
                  <Text style={styles.priorityLimit}>Choose up to 2</Text>
                </View>
                <View style={styles.chipRow}>
                  {PRIORITY_OPTIONS.filter((option) => !campingImplied(tripType) || option.value !== 'camping').map((option) => (
                    <OptionChip
                      key={option.value}
                      label={option.label}
                      icon={option.icon}
                      selected={priorities.includes(option.value)}
                      onPress={() => togglePriority(option.value)}
                      testID={`trip-builder-priority-${option.value}`}
                    />
                  ))}
                </View>

                <TouchableOpacity
                  style={[styles.primaryButton, (!selectedRoute || generating) && styles.primaryButtonDisabled]}
                  activeOpacity={!selectedRoute || generating ? 1 : 0.84}
                  disabled={!selectedRoute || generating}
                  onPress={handleGenerate}
                  accessibilityRole="button"
                  accessibilityLabel="Build Trip Plan"
                  testID="trip-builder-generate"
                >
                  {generating ? <ActivityIndicator size="small" color="#081014" /> : null}
                  <Text style={styles.primaryButtonText}>Build Trip Plan</Text>
                </TouchableOpacity>
              </View>

              {error ? (
                <View style={styles.errorCard}>
                  <Ionicons name="warning-outline" size={14} color="#EF5350" />
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              ) : null}

              {plan ? (
                <View style={styles.sectionCard} testID="trip-builder-results">
                  <View style={styles.sectionHeader}>
                    <Text style={styles.sectionTitle}>{plan.route.name}</Text>
                    <Text style={styles.sectionMeta}>PLAN</Text>
                  </View>
                  <View style={styles.metricGrid}>
                    <Metric label="Distance" value={formatMiles(plan.estimate.totalDistanceMiles)} />
                    <Metric label="Drive Time" value={formatHours(plan.estimate.driveTimeHours)} />
                    <Metric label="Trip Type" value={tripTypeLabel(plan.tripType)} />
                    <Metric label="Readiness" value={plan.readinessReference?.status?.toUpperCase() ?? 'Data unavailable'} />
                  </View>

                  <ResultBlock title="Camp Check">
                    <Text style={styles.resultText}>
                      {plan.primaryCampCandidate
                        ? `${plan.primaryCampCandidate.name} (${String(plan.primaryCampCandidate.legalConfidence ?? 'unknown')} confidence)`
                        : 'No known camp source detected. Verify before departure.'}
                    </Text>
                  </ResultBlock>

                  <ResultBlock title="Suggested Itinerary">
                    {plan.suggestedStops.map((stop) => <StopRow key={stop.id} stop={stop} />)}
                  </ResultBlock>

                  <ResultBlock title="Camp Candidates">
                    <Text style={styles.resultText}>Primary: {plan.primaryCampCandidate?.name ?? 'Data unavailable'}</Text>
                    <Text style={styles.resultText}>Backup: {plan.backupCampCandidate?.name ?? 'Data unavailable'}</Text>
                  </ResultBlock>

                  <ResultBlock title="Exit Access">
                    <Text style={styles.resultText}>{plan.primaryExitPoint?.name ?? 'Exit data unavailable. Verify before departure.'}</Text>
                  </ResultBlock>

                  {plan.smartResupplyPlan ? (
                    <ResultBlock title="Smart Resupply Plan">
                      <View testID="trip-builder-smart-resupply-plan" style={styles.resupplyList}>
                        <Text style={styles.resultText}>
                          Check fuel, water, supply, repair, medical, and exit access before departure.
                        </Text>
                        <View style={styles.resupplySummaryRow}>
                          <Text style={styles.resupplySummaryText}>
                            Overall: {statusLabel(plan.smartResupplyPlan.overallStatus)}
                          </Text>
                          <Text style={styles.resupplySourceText} numberOfLines={1}>
                            {plan.smartResupplyPlan.sourceSummary.join(' | ')}
                          </Text>
                        </View>
                        {resupplyRows(plan.smartResupplyPlan).map((item) => (
                          <ResupplyRow key={item.category} plan={item} />
                        ))}
                      </View>
                    </ResultBlock>
                  ) : null}

                  <ResultBlock title="ECS Notes">
                    {plan.notes.length === 0 ? (
                      <Text style={styles.resultText}>No additional notes.</Text>
                    ) : (
                      plan.notes.map((note) => <Text key={note.id} style={styles.resultText}>- {note.message}</Text>)
                    )}
                  </ResultBlock>

                  <ResultBlock title="Items to Verify">
                    {plan.warnings.length === 0 ? (
                      <Text style={styles.resultText}>No additional verification items from available data.</Text>
                    ) : (
                      plan.warnings.map((warning) => (
                        <Text key={warning.id} style={styles.warningText}>- {warning.message}</Text>
                      ))
                    )}
                  </ResultBlock>

                  <TouchableOpacity
                    style={styles.offlineButton}
                    activeOpacity={0.84}
                    onPress={handlePrepareOfflinePack}
                    accessibilityRole="button"
                    accessibilityLabel="Prepare Offline Pack"
                    testID="trip-builder-prepare-offline-pack"
                  >
                    <Ionicons name="download-outline" size={14} color="#081014" />
                    <Text style={styles.offlineButtonText}>Prepare Offline Pack</Text>
                  </TouchableOpacity>
                </View>
              ) : null}
            </>
          )}
        </ScrollView>
      </View>
    </TopoBackground>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metricTile}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue} numberOfLines={1}>{value}</Text>
    </View>
  );
}

function ResultBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.resultBlock}>
      <Text style={styles.resultTitle}>{title}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  safeContainer: { flex: 1 },
  scrollArea: { flex: 1 },
  scrollContent: {
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 22,
    gap: 10,
  },
  heroCard: {
    flexDirection: 'row',
    gap: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: TACTICAL.amber + '28',
    backgroundColor: ECS.bgPanel,
    padding: 14,
  },
  heroIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: TACTICAL.amber + '32',
    backgroundColor: TACTICAL.amber + '10',
  },
  heroCopy: { flex: 1, gap: 4 },
  eyebrow: {
    color: TACTICAL.textMuted,
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 1.5,
  },
  heroTitle: {
    color: TACTICAL.text,
    fontSize: 21,
    lineHeight: 25,
    fontWeight: '900',
  },
  heroText: {
    color: TACTICAL.textMuted,
    fontSize: 11,
    lineHeight: 16,
    fontWeight: '700',
  },
  sectionCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: ECS.stroke,
    backgroundColor: ECS.bgPanel,
    padding: 12,
    gap: 10,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  sectionTitle: {
    color: TACTICAL.text,
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  sectionMeta: {
    color: TACTICAL.amber,
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 1.2,
  },
  selectedRouteSummary: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: TACTICAL.amber + '22',
    backgroundColor: TACTICAL.amber + '08',
    padding: 10,
    gap: 3,
  },
  selectedRouteTitle: { color: TACTICAL.text, fontSize: 13, fontWeight: '900' },
  selectedRouteMeta: { color: TACTICAL.textMuted, fontSize: 10, fontWeight: '700' },
  routeList: { gap: 7 },
  routeOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: ECS.stroke,
    backgroundColor: 'rgba(255,255,255,0.025)',
    padding: 9,
  },
  routeOptionSelected: {
    borderColor: TACTICAL.amber + '42',
    backgroundColor: TACTICAL.amber + '0B',
  },
  routeOptionIcon: { width: 22, alignItems: 'center' },
  routeOptionCopy: { flex: 1, minWidth: 0 },
  routeOptionTitle: { color: TACTICAL.text, fontSize: 11, fontWeight: '900' },
  routeOptionMeta: { color: TACTICAL.textMuted, fontSize: 9, fontWeight: '700' },
  groupLabel: {
    color: TACTICAL.text,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  optionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  tripTypeCard: {
    width: '48%',
    minHeight: 54,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: ECS.stroke,
    backgroundColor: 'rgba(255,255,255,0.025)',
    padding: 9,
    gap: 3,
  },
  tripTypeCardSelected: {
    borderColor: TACTICAL.amber + '50',
    backgroundColor: TACTICAL.amber + '10',
  },
  tripTypeLabel: { color: TACTICAL.text, fontSize: 11, fontWeight: '900' },
  tripTypeLabelSelected: { color: TACTICAL.amber },
  tripTypeDetail: { color: TACTICAL.textMuted, fontSize: 8, lineHeight: 11, fontWeight: '700' },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
  },
  chip: {
    minHeight: 30,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: ECS.stroke,
    backgroundColor: 'rgba(255,255,255,0.025)',
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  chipSelected: {
    borderColor: TACTICAL.amber + '60',
    backgroundColor: TACTICAL.amber,
  },
  chipText: {
    color: TACTICAL.textMuted,
    fontSize: 9,
    fontWeight: '900',
  },
  chipTextSelected: { color: '#081014' },
  priorityHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  priorityLimit: {
    color: TACTICAL.textMuted,
    fontSize: 8,
    fontWeight: '800',
  },
  campingToggleRow: {
    marginTop: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(230,184,76,0.2)',
    backgroundColor: 'rgba(4,10,12,0.42)',
    padding: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  campingToggleCopy: { flex: 1 },
  campingToggleHint: {
    marginTop: 3,
    color: TACTICAL.textMuted,
    fontSize: 10,
    lineHeight: 14,
    fontWeight: '700',
  },
  togglePill: {
    width: 42,
    height: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(230,184,76,0.25)',
    backgroundColor: 'rgba(255,255,255,0.04)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  togglePillOn: {
    backgroundColor: TACTICAL.amber,
    borderColor: TACTICAL.amber,
  },
  togglePillLocked: {
    opacity: 0.72,
  },
  primaryButton: {
    minHeight: 40,
    borderRadius: 12,
    backgroundColor: TACTICAL.amber,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 14,
  },
  primaryButtonDisabled: { opacity: 0.45 },
  primaryButtonText: {
    color: '#081014',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  offlineButton: {
    minHeight: 42,
    borderRadius: 12,
    backgroundColor: TACTICAL.amber,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  offlineButtonText: {
    color: '#081014',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  stateCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: ECS.stroke,
    backgroundColor: ECS.bgPanel,
    padding: 18,
    alignItems: 'center',
    gap: 9,
  },
  stateTitle: { color: TACTICAL.text, fontSize: 14, fontWeight: '900' },
  stateText: { color: TACTICAL.textMuted, fontSize: 11, lineHeight: 16, fontWeight: '700', textAlign: 'center' },
  errorCard: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#EF535040',
    backgroundColor: '#EF53500D',
    padding: 10,
  },
  errorText: { flex: 1, color: '#EF9A9A', fontSize: 10, lineHeight: 14, fontWeight: '800' },
  metricGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  metricTile: {
    width: '48%',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: ECS.stroke,
    backgroundColor: 'rgba(255,255,255,0.025)',
    padding: 9,
    gap: 3,
  },
  metricLabel: { color: TACTICAL.textMuted, fontSize: 8, fontWeight: '900', letterSpacing: 1 },
  metricValue: { color: TACTICAL.text, fontSize: 12, fontWeight: '900' },
  resultBlock: {
    borderTopWidth: 1,
    borderTopColor: ECS.stroke,
    paddingTop: 10,
    gap: 7,
  },
  resultTitle: {
    color: TACTICAL.amber,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  resultText: { color: TACTICAL.textMuted, fontSize: 10, lineHeight: 15, fontWeight: '700' },
  warningText: { color: '#FFCC80', fontSize: 10, lineHeight: 15, fontWeight: '800' },
  resupplyList: { gap: 8 },
  resupplySummaryRow: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: TACTICAL.amber + '24',
    backgroundColor: TACTICAL.amber + '08',
    padding: 8,
    gap: 3,
  },
  resupplySummaryText: {
    color: TACTICAL.amber,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  resupplySourceText: {
    color: TACTICAL.textMuted,
    fontSize: 8,
    lineHeight: 11,
    fontWeight: '700',
  },
  resupplyRow: {
    flexDirection: 'row',
    gap: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: ECS.stroke,
    backgroundColor: 'rgba(255,255,255,0.022)',
    padding: 8,
  },
  resupplyIcon: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resupplyCopy: { flex: 1, minWidth: 0, gap: 3 },
  resupplyTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  resupplyTitle: {
    color: TACTICAL.text,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.7,
    textTransform: 'uppercase',
  },
  resupplyStatus: {
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 0.9,
  },
  resupplyRecommendation: {
    color: TACTICAL.textMuted,
    fontSize: 9,
    lineHeight: 13,
    fontWeight: '700',
  },
  resupplyMeta: {
    color: TACTICAL.text,
    fontSize: 8,
    lineHeight: 11,
    fontWeight: '800',
  },
  resupplyWarning: {
    color: '#FFCC80',
    fontSize: 8,
    lineHeight: 11,
    fontWeight: '800',
  },
  stopRow: {
    flexDirection: 'row',
    gap: 9,
    alignItems: 'center',
  },
  stopIndex: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: TACTICAL.amber + '18',
    borderWidth: 1,
    borderColor: TACTICAL.amber + '34',
  },
  stopIndexText: { color: TACTICAL.amber, fontSize: 9, fontWeight: '900' },
  stopCopy: { flex: 1, minWidth: 0 },
  stopTitle: { color: TACTICAL.text, fontSize: 11, fontWeight: '900' },
  stopMeta: { color: TACTICAL.textMuted, fontSize: 8, fontWeight: '800' },
  stopNote: { color: TACTICAL.textMuted, fontSize: 9, lineHeight: 13, marginTop: 2 },
});
