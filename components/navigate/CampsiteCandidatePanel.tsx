/**
 * ECS CAMPSITE CANDIDATE PANEL — Predictive Campsite Intelligence
 * ================================================================
 *
 * Displays scored and ranked campsite candidates on the Navigate tab.
 * Shows suitability level, confidence, estimated arrival time, and
 * candidate reasoning for each suggested campsite.
 *
 * DISPLAY:
 *   - Collapsed: compact badge with suggested count + best level + confidence
 *   - Expanded: ranked suggested campsites with detail
 */


import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { SafeIcon as Ionicons } from '../SafeIcon';
import { TACTICAL, TYPO, GOLD_RAIL } from '../../lib/theme';
import type {
  CampsiteCandidateResult,
  CampsiteCandidate,
  SuitabilityLevel,
  ConfidenceLevel,
} from '../../lib/campsiteCandidateEngine';
import { campsiteCandidateEngine } from '../../lib/campsiteCandidateEngine';
import type {
  CampCandidate as CampOpsCandidate,
  CampCandidateEnrichment,
  CampOpsImpact,
  CampRecommendationSet,
  CampSuitabilityScores,
} from '../../lib/campops/campOpsTypes';
import {
  CAMP_OPS_ENDPOINT_RECOMMENDATION_LABEL,
  CAMP_OPS_LEGACY_SEARCH_RESULTS_LABEL,
  getCampOpsLegacyCandidateStatus,
  getCampOpsLegacyListNotice,
  type CampOpsLegacyCandidateStatus,
} from '../../lib/campops/campOpsLegacyCoexistence';

// ── Props ────────────────────────────────────────────────────

interface CampsiteCandidatePanelProps {
  /** Campsite candidate analysis result */
  result: CampsiteCandidateResult | null;
  /** Whether the panel is visible */
  visible: boolean;
  /** Close/dismiss handler */
  onClose: () => void;
  /** When true, shows a loading indicator instead of empty state */
  loading?: boolean;
  /** Optional navigation action supplied by the host screen */
  onNavigateToCamp?: (camp: CampOpsCandidate) => void;
  /** Optional share action supplied by the host screen */
  onShareCamp?: (camp: CampOpsCandidate) => void;
}


// ── Suitability Colors ───────────────────────────────────────

function getSuitabilityColor(level: SuitabilityLevel): string {
  switch (level) {
    case 'HIGH': return '#66BB6A';
    case 'MEDIUM': return '#FFB74D';
    case 'LOW': return '#8A8A85';
    default: return '#8A8A85';
  }
}

function getSuitabilityIcon(level: SuitabilityLevel): string {
  switch (level) {
    case 'HIGH': return 'star';
    case 'MEDIUM': return 'star-half';
    case 'LOW': return 'star-outline';
    default: return 'star-outline';
  }
}

// ── Confidence Colors (Phase 3) ──────────────────────────────

function getConfidenceColor(level: ConfidenceLevel): string {
  switch (level) {
    case 'HIGH': return '#66BB6A';
    case 'MEDIUM': return '#FFB74D';
    case 'LOW': return '#8A8A85';
    default: return '#8A8A85';
  }
}

function getConfidenceIcon(level: ConfidenceLevel): string {
  switch (level) {
    case 'HIGH': return 'shield-checkmark';
    case 'MEDIUM': return 'shield-half';
    case 'LOW': return 'shield-outline';
    default: return 'shield-outline';
  }
}

function getCandidateConfidenceLabel(candidate: CampsiteCandidate): string {
  if (candidate.viabilityConfidenceLabel === 'Limited confidence') return 'Limited';
  return candidate.viabilityConfidenceLabel ?? candidate.confidence;
}

// ── Difficulty Colors ────────────────────────────────────────

function getDifficultyColor(difficulty: string): string {
  switch (difficulty) {
    case 'easy': return '#66BB6A';
    case 'moderate': return '#FFB74D';
    case 'challenging': return '#FF9800';
    case 'difficult': return '#EF5350';
    default: return '#8A8A85';
  }
}

type CampOpsCardRole = 'recommended' | 'backup' | 'emergency';

type CampOpsCardSpec = {
  role: CampOpsCardRole;
  title: string;
  emptyName: string;
  status: string;
  icon: string;
  color: string;
  camp: CampOpsCandidate | null;
};

type CampOpsDetailRow = {
  label: string;
  value: string;
};

function formatCampOpsUnknown(value: string | number | null | undefined): string {
  if (value == null || value === '') return 'Unknown';
  return String(value);
}

function formatCampOpsScore(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(Number(value))) return 'Unknown';
  return `${Math.round(Number(value))}`;
}

function formatCampOpsDateTime(iso: string | null | undefined): string {
  if (!iso) return 'Unknown';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'Unknown';
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function formatCampOpsMinutes(minutes: number | null | undefined): string {
  if (minutes == null || !Number.isFinite(Number(minutes))) return 'Unknown';
  const rounded = Math.round(Number(minutes));
  const abs = Math.abs(rounded);
  const hours = Math.floor(abs / 60);
  const remainder = abs % 60;
  const formatted = hours > 0 ? `${hours}h ${remainder}m` : `${remainder}m`;
  return rounded < 0 ? `${formatted} after sunset` : formatted;
}

function formatCampOpsMiles(miles: number | null | undefined): string {
  if (miles == null || !Number.isFinite(Number(miles))) return 'Unknown';
  return `${Math.round(Number(miles) * 10) / 10} mi`;
}

function formatCampOpsLabel(value: string | null | undefined): string {
  if (!value) return 'Unknown';
  return value
    .replace(/_/g, ' ')
    .replace(/\b\w/g, char => char.toUpperCase());
}

function formatCampOpsDebtStatus(value: string | null | undefined): string {
  if (value === 'safe') return 'Adequate';
  return formatCampOpsLabel(value);
}

function formatCampOpsImpact(impact: CampOpsImpact | null | undefined): string {
  if (!impact || impact.value == null || !Number.isFinite(Number(impact.value))) {
    return 'Unknown';
  }

  const value = Math.round(Number(impact.value) * 10) / 10;
  const unitLabel =
    impact.unit === 'percent' ? '%' :
    impact.unit === 'miles' ? ' mi' :
    impact.unit === 'gallons' ? ' gal' :
    impact.unit === 'minutes' ? ' min' :
    impact.unit === 'score' ? ' score' :
    '';
  const impactLabel = impact.impact === 'unknown' ? '' : ` (${formatCampOpsLabel(impact.impact)})`;
  return `${value}${unitLabel}${impactLabel}`;
}

function formatCampOpsConfidence(value: string | null | undefined): string {
  if (!value || value === 'unknown') return 'Unknown confidence';
  return `${formatCampOpsLabel(value)} confidence`;
}

function formatCampOpsFireStatus(enrichment: CampCandidateEnrichment | null | undefined): string {
  if (!enrichment) return 'Unknown';
  if (enrichment.campfireAllowed === 'no') return 'Campfire prohibited';
  if (enrichment.campfireAllowed === 'restricted') return 'Campfire restricted';
  if (enrichment.fireRestrictionStatus && enrichment.fireRestrictionStatus !== 'unknown') {
    return formatCampOpsLabel(enrichment.fireRestrictionStatus);
  }
  return 'Unknown';
}

function formatCampOpsWeatherStatus(enrichment: CampCandidateEnrichment | null | undefined): string {
  if (!enrichment) return 'Unknown';
  if (enrichment.weatherExposureLevel && enrichment.weatherExposureLevel !== 'unknown') {
    return `${formatCampOpsLabel(enrichment.weatherExposureLevel)} exposure`;
  }
  if (enrichment.weatherExposure && enrichment.weatherExposure !== 'unknown') {
    return formatCampOpsLabel(enrichment.weatherExposure);
  }
  return 'Unknown';
}

function summarizeCampOpsFreshness(
  signals: NonNullable<CampCandidateEnrichment['sourceSignals']>,
): string {
  if (signals.length === 0) return 'Unknown';
  if (signals.some(signal => signal.freshnessStatus === 'expired')) return 'Source data is expired';
  if (signals.some(signal => signal.freshnessStatus === 'stale' || signal.isStale)) return 'Source data is stale';
  if (signals.some(signal => signal.freshnessStatus === 'unknown')) return 'Unknown';
  return 'Fresh';
}

function getCampOpsWeatherFreshness(enrichment: CampCandidateEnrichment | null | undefined): string {
  const weatherSignals = (enrichment?.sourceSignals ?? []).filter(signal =>
    signal.fields.some(field =>
      [
        'weatherExposure',
        'weatherExposureLevel',
        'forecastTimeWindow',
        'windSpeedMph',
        'windGustMph',
        'precipitationRisk',
        'stormRisk',
        'heatRisk',
        'coldRisk',
        'smokeOrAirQualityRisk',
      ].includes(field),
    ),
  );
  return summarizeCampOpsFreshness(weatherSignals);
}

function formatCampOpsService(service: CampCandidateEnrichment['nearestFuel'] | null | undefined): string {
  if (!service) return 'Unknown';
  const distance = service.routeAwareDistanceMiles ?? service.distanceFromRouteMiles ?? service.distanceFromCampMiles;
  const distanceLabel = distance == null ? null : formatCampOpsMiles(distance);
  const status = service.status && service.status !== 'unknown' ? formatCampOpsLabel(service.status) : 'Unknown status';
  return `${service.name}${distanceLabel ? `, ${distanceLabel}` : ''} (${status})`;
}

function getCampOpsServiceSummary(enrichment: CampCandidateEnrichment | null | undefined): string {
  if (!enrichment) return 'Unknown';
  const summaries = [
    enrichment.nearestFuel ? `Fuel: ${formatCampOpsService(enrichment.nearestFuel)}` : null,
    enrichment.nearestWater ? `Water: ${formatCampOpsService(enrichment.nearestWater)}` : null,
    enrichment.nearestTownOrExit ? `Exit: ${formatCampOpsService(enrichment.nearestTownOrExit)}` : null,
  ].filter((summary): summary is string => Boolean(summary));
  return summaries[0] ?? 'Unknown';
}

function getCampOpsCards(recommendationSet: CampRecommendationSet): CampOpsCardSpec[] {
  return [
    {
      role: 'recommended',
      title: 'Recommended Camp',
      emptyName: 'No recommended camp',
      status: recommendationSet.recommendedCamp ? 'Recommended' : 'Not recommended',
      icon: 'checkmark-circle-outline',
      color: '#8BC34A',
      camp: recommendationSet.recommendedCamp,
    },
    {
      role: 'backup',
      title: 'Backup Camp',
      emptyName: 'No backup camp',
      status: recommendationSet.backupCamp ? 'Backup' : 'Unknown confidence',
      icon: 'git-branch-outline',
      color: '#FFB74D',
      camp: recommendationSet.backupCamp,
    },
    {
      role: 'emergency',
      title: 'Emergency Camp',
      emptyName: 'No emergency endpoint',
      status: recommendationSet.emergencyCamp ? 'Fallback only' : 'Unknown confidence',
      icon: 'warning-outline',
      color: '#EF5350',
      camp: recommendationSet.emergencyCamp,
    },
  ];
}

function getCampOpsRoleLabel(role: CampOpsCardRole): string {
  switch (role) {
    case 'recommended': return 'Recommended';
    case 'backup': return 'Backup';
    case 'emergency': return 'Emergency stop';
    default: return 'Unknown confidence';
  }
}

function getCampOpsExplanation(role: CampOpsCardRole, recommendationSet: CampRecommendationSet): string | null | undefined {
  switch (role) {
    case 'recommended': return recommendationSet.explanations?.whyRecommended;
    case 'backup': return recommendationSet.explanations?.whyBackup;
    case 'emergency': return recommendationSet.explanations?.whyEmergency;
    default: return null;
  }
}

function getCampOpsReasons(
  role: CampOpsCardRole,
  camp: CampOpsCandidate | null,
  scores: CampSuitabilityScores | null | undefined,
  recommendationSet: CampRecommendationSet,
): string[] {
  const explanation = getCampOpsExplanation(role, recommendationSet);
  const reasons = [
    explanation || null,
    scores?.overall != null ? `Overall suitability ${formatCampOpsScore(scores.overall)}` : null,
    scores?.legal != null ? `Legal score ${formatCampOpsScore(scores.legal)}` : null,
    scores?.resources != null ? `Resource score ${formatCampOpsScore(scores.resources)}` : null,
    camp?.sourceConfidence ? `Source ${formatCampOpsConfidence(camp.sourceConfidence)}` : null,
  ].filter((reason): reason is string => Boolean(reason));

  return reasons.length > 0 ? reasons.slice(0, 3) : ['CampOps is waiting on more camp data.'];
}

function getCampOpsWarnings(
  enrichment: CampCandidateEnrichment | null | undefined,
  recommendationSet: CampRecommendationSet,
): string[] {
  const warnings = [
    ...recommendationSet.warnings,
    ...(enrichment?.dataLimitations ?? []),
    ...recommendationSet.confidenceSummary.missingDataFields.map(field => `Missing ${field}`),
    ...(enrichment?.sourceSignals ?? [])
      .filter(signal => signal.freshnessStatus === 'stale' || signal.freshnessStatus === 'expired' || signal.isStale)
      .map(signal => signal.freshnessStatus === 'expired' ? 'Source data is expired' : 'Source data is stale'),
    ...(enrichment?.sourceResolutions ?? [])
      .filter(resolution => resolution.conflictDetected)
      .map(resolution => resolution.conflictSummary || `Source conflict for ${formatCampOpsLabel(resolution.field)}`),
  ];
  const uniqueWarnings = Array.from(new Set(warnings.filter(Boolean)));
  return uniqueWarnings.slice(0, 3);
}

function getCampOpsSourceTransparency(
  camp: CampOpsCandidate | null,
  enrichment: CampCandidateEnrichment | null | undefined,
  recommendationSet: CampRecommendationSet,
): CampOpsDetailRow[] {
  const missingCritical = recommendationSet.confidenceSummary.missingDataFields.length > 0
    ? recommendationSet.confidenceSummary.missingDataFields.slice(0, 2).map(formatCampOpsLabel).join(', ')
    : 'None listed';

  return [
    { label: 'Legal confidence', value: formatCampOpsConfidence(enrichment?.legalConfidence ?? camp?.legalConfidence) },
    { label: 'Closure status', value: enrichment?.closureStatus ? formatCampOpsLabel(enrichment.closureStatus) : 'Closure status unknown' },
    { label: 'Fire restrictions', value: formatCampOpsFireStatus(enrichment) === 'Unknown' ? 'Fire restrictions unknown' : formatCampOpsFireStatus(enrichment) },
    { label: 'Weather freshness', value: getCampOpsWeatherFreshness(enrichment) },
    { label: 'Service/resupply', value: getCampOpsServiceSummary(enrichment) },
    { label: 'Missing critical data', value: missingCritical },
  ];
}

function getCampOpsSourceDetails(enrichment: CampCandidateEnrichment | null | undefined): string[] {
  const resolutions = enrichment?.sourceResolutions ?? [];
  const conflicts = resolutions
    .filter(resolution => resolution.conflictDetected)
    .map(resolution => `Source conflict: ${resolution.conflictSummary || formatCampOpsLabel(resolution.field)}`);
  const staleSources = resolutions.flatMap(resolution =>
    resolution.staleSources.map(source => `Stale source: ${source}`),
  );
  const missingSources = resolutions.flatMap(resolution =>
    resolution.missingSources.map(source => `Missing source: ${source}`),
  );
  const summaries = resolutions.flatMap(resolution =>
    resolution.sourceSummaries.map(summary => `Source detail: ${summary}`),
  );
  const signalLimitations = (enrichment?.sourceSignals ?? [])
    .filter(signal => signal.limitation)
    .map(signal => `Source detail: ${signal.limitation}`);

  return Array.from(new Set([
    ...conflicts,
    ...staleSources,
    ...missingSources,
    ...summaries,
    ...signalLimitations,
  ].filter(Boolean))).slice(0, 6);
}

function getCampOpsResourceDebtDetails(enrichment: CampCandidateEnrichment | null | undefined): string[] {
  const debt = enrichment?.resourceDebt;
  if (!debt) return [];
  const details: string[] = [];
  const debtItems = [
    ['Fuel debt', debt.fuel],
    ['Water debt', debt.water],
    ['Daylight debt', debt.daylight],
    ['Camp uncertainty debt', debt.campUncertainty],
  ] as const;

  for (const [label, item] of debtItems) {
    details.push(`${label}: ${formatCampOpsDebtStatus(item.status)} - ${item.reason}`);
  }

  return details.slice(0, 4);
}

function getCampOpsGateDetails(
  camp: CampOpsCandidate | null,
  recommendationSet: CampRecommendationSet,
): string[] {
  if (!camp) return [];
  const rejected = recommendationSet.rejectedCandidates.find(candidate => candidate.candidate.id === camp.id);
  if (!rejected) return [];
  const gateReasons = rejected.gates.map(gate => `${formatCampOpsLabel(gate.severity)} gate: ${gate.reason}`);
  return Array.from(new Set([...rejected.reasons, ...gateReasons])).slice(0, 3);
}

function getCampOpsDecisionPointDetails(recommendationSet: CampRecommendationSet): string[] {
  const decisionPoint = recommendationSet.decisionPoint;
  if (!decisionPoint) return [];
  const turnoff = decisionPoint.latestRecommendedTurnoff;
  const turnoffLabel = turnoff?.label
    ? `${turnoff.label}${turnoff.distanceMiles != null ? `, ${formatCampOpsMiles(turnoff.distanceMiles)}` : ''}`
    : null;
  return [
    `Decision point: ${formatCampOpsLabel(decisionPoint.kind)}${decisionPoint.decisionDeadlineIso ? ` by ${formatCampOpsDateTime(decisionPoint.decisionDeadlineIso)}` : ''}`,
    `Recommended action: ${decisionPoint.recommendedAction}`,
    `Continue risk: ${decisionPoint.riskIfContinues}`,
    turnoffLabel ? `Latest turnoff: ${turnoffLabel}` : null,
  ].filter((detail): detail is string => Boolean(detail));
}

function getCampOpsCardFields(
  camp: CampOpsCandidate | null,
  enrichment: CampCandidateEnrichment | null | undefined,
  scores: CampSuitabilityScores | null | undefined,
): { label: string; value: string }[] {
  return [
    { label: 'Score', value: formatCampOpsScore(scores?.overall) },
    { label: 'Legal', value: formatCampOpsConfidence(enrichment?.legalConfidence ?? camp?.legalConfidence) },
    { label: 'ETA', value: formatCampOpsDateTime(enrichment?.etaIso) },
    { label: 'Sunset', value: formatCampOpsMinutes(enrichment?.sunsetMarginMinutes) },
    { label: 'Fuel', value: formatCampOpsImpact(enrichment?.fuelImpact) },
    { label: 'Water', value: formatCampOpsImpact(enrichment?.waterImpact) },
    { label: 'Fire', value: formatCampOpsFireStatus(enrichment) },
    { label: 'Weather', value: formatCampOpsWeatherStatus(enrichment) },
    { label: 'Late risk', value: formatCampOpsLabel(enrichment?.lateArrivalRisk) },
    { label: 'Trailer', value: formatCampOpsLabel(enrichment?.trailerSuitability) },
    { label: 'Group fit', value: formatCampOpsScore(scores?.groupFit) },
    { label: 'Data', value: formatCampOpsConfidence(enrichment?.dataConfidence) },
  ];
}

// ── Component ────────────────────────────────────────────────

export default function CampsiteCandidatePanel({
  result,
  visible,
  onClose,
  loading,
  onNavigateToCamp,
  onShareCamp,
}: CampsiteCandidatePanelProps) {
  const [expanded, setExpanded] = useState(false);
  const [showAllCandidates, setShowAllCandidates] = useState(false);

  const toggleExpanded = useCallback(() => {
    setExpanded(prev => !prev);
  }, []);

  if (!visible) return null;

  // ── Loading state ──
  if (loading && !result) {
    return (
      <View style={styles.expandedPanel}>
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Ionicons name="bonfire-outline" size={14} color={TACTICAL.textMuted} />
            <Text style={styles.headerTitle}>SUGGESTED CAMPSITES</Text>
          </View>
          <View style={styles.headerRight}>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close" size={14} color={TACTICAL.textMuted} />
            </TouchableOpacity>
          </View>
        </View>
        <View style={{ paddingHorizontal: 16, paddingVertical: 24, alignItems: 'center' }}>
          <Ionicons name="hourglass-outline" size={24} color={TACTICAL.textMuted} />
          <Text style={{ fontFamily: 'monospace', fontSize: 11, fontWeight: '600', color: TACTICAL.textMuted, marginTop: 8, textAlign: 'center', letterSpacing: 0.5 }}>
            Analyzing campsite candidates...
          </Text>
        </View>
      </View>
    );
  }

  // ── Empty state ──
  if (!result) {
    return (
      <View style={styles.expandedPanel}>
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Ionicons name="bonfire-outline" size={14} color={TACTICAL.textMuted} />
            <Text style={styles.headerTitle}>SUGGESTED CAMPSITES</Text>
          </View>
          <View style={styles.headerRight}>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close" size={14} color={TACTICAL.textMuted} />
            </TouchableOpacity>
          </View>
        </View>
        <View style={{ paddingHorizontal: 16, paddingVertical: 24, alignItems: 'center' }}>
          <Ionicons name="bonfire-outline" size={24} color={TACTICAL.textMuted} />
          <Text style={{ fontFamily: 'monospace', fontSize: 11, fontWeight: '600', color: TACTICAL.textMuted, marginTop: 8, textAlign: 'center', letterSpacing: 0.5 }}>
            No campsite suggestions available for this route.
          </Text>
        </View>
      </View>
    );
  }



  const {
    candidates,
    suggestedCampsites,
    candidateCount,
    totalSegments,
    excludedSegments,
    routeName,
    totalDistanceMiles,
    estimatedDriveTimeHours,
    scoringApplied,
    isShortRoute,
    overnightUnlikely,
    hasHighConfidence,
    bestConfidence,
  } = result;

  const hasSuggested = suggestedCampsites.length > 0;
  const bestLevel = hasSuggested ? suggestedCampsites[0].suitabilityLevel : null;
  const campOpsRecommendationSet = result.campOps?.enabled ? result.campOps.recommendationSet : null;
  const campOpsLegacyNotice = getCampOpsLegacyListNotice(result, campOpsRecommendationSet);
  const campOpsRecommendationsVisible = Boolean(campOpsRecommendationSet);


  // ── Collapsed Badge ────────────────────────────────────────

  if (!expanded) {
    return (
      <TouchableOpacity
        style={styles.collapsedBadge}
        onPress={toggleExpanded}
        activeOpacity={0.85}
      >
        <Ionicons name="bonfire-outline" size={12} color="#8BC34A" />
        <Text style={styles.collapsedLabel}>CAMPSITE</Text>
        {hasSuggested && bestLevel && (
          <View style={[styles.collapsedLevelBadge, { borderColor: getSuitabilityColor(bestLevel) + '50' }]}>
            <Ionicons name={getSuitabilityIcon(bestLevel) as any} size={8} color={getSuitabilityColor(bestLevel)} />
            <Text style={[styles.collapsedLevelText, { color: getSuitabilityColor(bestLevel) }]}>
              {bestLevel}
            </Text>
          </View>
        )}
        {/* Phase 3: Confidence badge in collapsed view */}
        {hasSuggested && bestConfidence && (
          <View style={[styles.collapsedConfBadge, { borderColor: getConfidenceColor(bestConfidence) + '40' }]}>
            <Ionicons name={getConfidenceIcon(bestConfidence) as any} size={7} color={getConfidenceColor(bestConfidence)} />
            <Text style={[styles.collapsedConfText, { color: getConfidenceColor(bestConfidence) }]}>
              {bestConfidence}
            </Text>
          </View>
        )}
        <View style={styles.collapsedCountBadge}>
          <Text style={styles.collapsedCountText}>{suggestedCampsites.length}</Text>
        </View>
        {hasSuggested && (
          <Text style={styles.collapsedDetail}>
            Mile {suggestedCampsites[0].distanceMiles.toFixed(0)}
          </Text>
        )}
        <Ionicons name="chevron-down-outline" size={10} color={TACTICAL.textMuted} />
      </TouchableOpacity>
    );
  }

  // ── Expanded Panel ─────────────────────────────────────────

  // Candidates to show beyond suggested
  const additionalCandidates = showAllCandidates
    ? candidates.filter(c => !suggestedCampsites.some(s => s.segmentIndex === c.segmentIndex))
    : [];

  return (
    <View style={styles.expandedPanel}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Ionicons name="bonfire-outline" size={14} color="#8BC34A" />
          <Text style={styles.headerTitle}>
            {campOpsRecommendationsVisible ? 'CAMPSITE RESULTS' : 'SUGGESTED CAMPSITES'}
          </Text>

        </View>
        <View style={styles.headerRight}>
          <TouchableOpacity onPress={toggleExpanded} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="chevron-up-outline" size={14} color={TACTICAL.textMuted} />
          </TouchableOpacity>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="close" size={14} color={TACTICAL.textMuted} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Route context */}
      {routeName && (
        <View style={styles.routeContext}>
          <Ionicons name="navigate-outline" size={10} color={TACTICAL.textMuted} />
          <Text style={styles.routeContextText} numberOfLines={1}>
            {routeName} — {totalDistanceMiles.toFixed(0)} mi — ~{campsiteCandidateEngine.formatArrivalTime(estimatedDriveTimeHours)} drive
          </Text>
        </View>
      )}

      {/* Phase 3: Route context warnings */}
      {(isShortRoute || overnightUnlikely) && (
        <View style={styles.contextWarning}>
          {isShortRoute && (
            <View style={styles.contextWarningRow}>
              <Ionicons name="information-circle" size={10} color="#FFB74D" />
              <Text style={styles.contextWarningText}>
                Short route ({totalDistanceMiles.toFixed(0)} mi) — camp suggestions may not apply
              </Text>
            </View>
          )}
          {overnightUnlikely && (
            <View style={styles.contextWarningRow}>
              <Ionicons name="time-outline" size={10} color="#FFB74D" />
              <Text style={styles.contextWarningText}>
                Quick trip (~{campsiteCandidateEngine.formatArrivalTime(estimatedDriveTimeHours)}) — overnight stop unlikely
              </Text>
            </View>
          )}
        </View>
      )}

      {/* Summary stats row */}
      <View style={styles.statsRow}>
        <View style={styles.statChip}>
          <Text style={styles.statValue}>{suggestedCampsites.length}</Text>
          <Text style={styles.statLabel}>SUGGESTED</Text>
        </View>
        <View style={styles.statChip}>
          <Text style={styles.statValue}>{candidateCount}</Text>
          <Text style={styles.statLabel}>CANDIDATES</Text>
        </View>
        <View style={styles.statChip}>
          <Text style={[styles.statValue, bestLevel ? { color: getSuitabilityColor(bestLevel) } : {}]}>
            {bestLevel || '—'}
          </Text>
          <Text style={styles.statLabel}>
            {campOpsRecommendationsVisible ? 'TOP RESULT' : 'BEST'}
          </Text>
        </View>
        <View style={styles.statChip}>
          <Text style={[styles.statValue, bestConfidence ? { color: getConfidenceColor(bestConfidence) } : {}]}>
            {bestConfidence || '—'}
          </Text>
          <Text style={styles.statLabel}>CONFIDENCE</Text>
        </View>
      </View>

      {/* Candidate list */}
      <ScrollView
        style={styles.candidateList}
        contentContainerStyle={styles.candidateListContent}
        nestedScrollEnabled
        showsVerticalScrollIndicator={false}
      >
        {campOpsRecommendationSet && (
          <CampOpsRecommendationCards
            recommendationSet={campOpsRecommendationSet}
            onNavigateToCamp={onNavigateToCamp}
            onShareCamp={onShareCamp}
          />
        )}

        {candidateCount === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="alert-circle-outline" size={16} color={TACTICAL.textMuted} />
            <Text style={styles.emptyText}>No campsite candidates detected for this route.</Text>
            <Text style={styles.emptySubText}>
              {result?.emptyStateMessage ??
                'Route may be too short, too steep, or lack suitable flat segments.'}
            </Text>
          </View>
        ) : (
          <>
            {campOpsRecommendationSet && (
              <View style={styles.legacyCoexistencePanel}>
                <View style={styles.legacyCoexistenceHeader}>
                  <Text style={styles.legacyCoexistenceTitle}>{CAMP_OPS_LEGACY_SEARCH_RESULTS_LABEL}</Text>
                  <Text style={styles.legacyCoexistencePill}>{CAMP_OPS_ENDPOINT_RECOMMENDATION_LABEL}</Text>
                </View>
                <Text style={styles.legacyCoexistenceText}>
                  CampOps cards are operational recommendations. Legacy entries remain available camps/results and do not override the endpoint recommendation.
                </Text>
                {campOpsLegacyNotice && (
                  <Text style={styles.legacyCoexistenceWarning}>{campOpsLegacyNotice}</Text>
                )}
              </View>
            )}

            {/* Suggested Campsites (Top 3) */}
            {suggestedCampsites.map((candidate, idx) => (
              <SuggestedCampsiteCard
                key={`suggested-${candidate.segmentIndex}`}
                candidate={candidate}
                rank={idx + 1}
                isTop={idx === 0}
                campOpsStatus={getCampOpsLegacyCandidateStatus(candidate, result, campOpsRecommendationSet)}
              />
            ))}

            {/* Toggle for additional candidates */}
            {candidates.length > suggestedCampsites.length && (
              <TouchableOpacity
                style={styles.showMoreBtn}
                onPress={() => setShowAllCandidates(prev => !prev)}
                activeOpacity={0.8}
              >
                <Ionicons
                  name={showAllCandidates ? 'chevron-up-outline' : 'chevron-down-outline'}
                  size={10}
                  color={TACTICAL.textMuted}
                />
                <Text style={styles.showMoreText}>
                  {showAllCandidates
                    ? 'HIDE ADDITIONAL CANDIDATES'
                    : `SHOW ${candidates.length - suggestedCampsites.length} MORE CANDIDATES`}
                </Text>
              </TouchableOpacity>
            )}

            {/* Additional Candidates (below top 3) */}
            {additionalCandidates.map((candidate, idx) => (
              <AdditionalCandidateCard
                key={`additional-${candidate.segmentIndex}`}
                candidate={candidate}
                rank={suggestedCampsites.length + idx + 1}
                campOpsStatus={getCampOpsLegacyCandidateStatus(candidate, result, campOpsRecommendationSet)}
              />
            ))}
          </>
        )}
      </ScrollView>

      {/* Footer */}
      <View style={styles.footer}>
        <Ionicons name="information-circle-outline" size={9} color={TACTICAL.textMuted} />
        <Text style={styles.footerText}>
          ECS CAMPSITE INTELLIGENCE
        </Text>

      </View>
    </View>
  );
}

function CampOpsRecommendationCards({
  recommendationSet,
  onNavigateToCamp,
  onShareCamp,
}: {
  recommendationSet: CampRecommendationSet;
  onNavigateToCamp?: (camp: CampOpsCandidate) => void;
  onShareCamp?: (camp: CampOpsCandidate) => void;
}) {
  const [expandedRole, setExpandedRole] = useState<CampOpsCardRole | null>('recommended');
  const cards = getCampOpsCards(recommendationSet);

  return (
    <View style={styles.campOpsSection}>
      <View style={styles.campOpsSectionHeader}>
        <View style={styles.campOpsSectionTitleRow}>
          <Ionicons name="trail-sign-outline" size={11} color="#8BC34A" />
          <Text style={styles.campOpsSectionTitle}>CAMPOPS RECOMMENDATIONS</Text>
        </View>
        <View style={styles.campOpsConfidencePill}>
          <Text style={styles.campOpsConfidenceText}>
            {formatCampOpsConfidence(recommendationSet.confidenceSummary.level)}
          </Text>
        </View>
      </View>

      {cards.map(card => {
        const enrichment = card.camp
          ? recommendationSet.enrichmentsByCandidateId?.[card.camp.id]
          : null;
        const scores = card.camp
          ? recommendationSet.scoresByCandidateId?.[card.camp.id]
          : null;
        const fields = getCampOpsCardFields(card.camp, enrichment, scores);
        const reasons = getCampOpsReasons(card.role, card.camp, scores, recommendationSet);
        const warnings = getCampOpsWarnings(enrichment, recommendationSet);
        const sourceTransparency = getCampOpsSourceTransparency(card.camp, enrichment, recommendationSet);
        const sourceDetails = getCampOpsSourceDetails(enrichment);
        const resourceDebtDetails = getCampOpsResourceDebtDetails(enrichment);
        const gateDetails = getCampOpsGateDetails(card.camp, recommendationSet);
        const decisionPointDetails = getCampOpsDecisionPointDetails(recommendationSet);
        const detailRows = [
          ...decisionPointDetails,
          ...reasons.map(reason => `Positive factor: ${reason}`),
          ...gateDetails.map(detail => `Gate/caution reason: ${detail}`),
          ...resourceDebtDetails.map(detail => `Resource debt: ${detail}`),
          ...sourceTransparency.map(row => `${row.label}: ${row.value}`),
          ...sourceDetails,
          ...(recommendationSet.explanations?.plannedCampDowngrade
            ? [`Downgrade reason: ${recommendationSet.explanations.plannedCampDowngrade}`]
            : []),
          ...recommendationSet.assumptions.slice(0, 3).map(assumption => `Assumption: ${assumption}`),
        ];
        const expanded = expandedRole === card.role;
        const hasExpandableDetails = detailRows.length > 0;

        return (
          <View
            key={`campops-${card.role}`}
            style={[styles.campOpsCard, { borderColor: card.color + '38' }]}
          >
            <View style={styles.campOpsCardHeader}>
              <View style={styles.campOpsTitleGroup}>
                <View style={[styles.campOpsRoleIcon, { borderColor: card.color + '50', backgroundColor: card.color + '12' }]}>
                  <Ionicons name={card.icon as any} size={12} color={card.color} />
                </View>
                <View style={styles.campOpsTitleTextGroup}>
                  <Text style={styles.campOpsRoleLabel}>{card.title}</Text>
                  <Text style={styles.campOpsCampName} numberOfLines={1}>
                    {card.camp ? formatCampOpsUnknown(card.camp.name) : card.emptyName}
                  </Text>
                </View>
              </View>
              <View style={[styles.campOpsStatusBadge, { borderColor: card.color + '45' }]}>
                <Text style={[styles.campOpsStatusText, { color: card.color }]}>
                  {card.status}
                </Text>
              </View>
            </View>

            <View style={styles.campOpsMetaRow}>
              <Text style={styles.campOpsMetaText}>
                Role: {getCampOpsRoleLabel(card.role)}
              </Text>
              <Text style={styles.campOpsMetaText}>
                Source: {formatCampOpsConfidence(card.camp?.sourceConfidence)}
              </Text>
            </View>

            <View style={styles.campOpsFieldGrid}>
              {fields.map(field => (
                <View key={`${card.role}-${field.label}`} style={styles.campOpsField}>
                  <Text style={styles.campOpsFieldLabel}>{field.label}</Text>
                  <Text style={styles.campOpsFieldValue} numberOfLines={1}>
                    {field.value}
                  </Text>
                </View>
              ))}
            </View>

            <View style={styles.campOpsTransparencyStrip}>
              {sourceTransparency.slice(0, 3).map(row => (
                <View key={`${card.role}-source-${row.label}`} style={styles.campOpsTransparencyChip}>
                  <Text style={styles.campOpsTransparencyLabel}>{row.label}</Text>
                  <Text style={styles.campOpsTransparencyValue} numberOfLines={1}>{row.value}</Text>
                </View>
              ))}
            </View>

            <View style={styles.campOpsReasons}>
              {reasons.map((reason, idx) => (
                <View key={`${card.role}-reason-${idx}`} style={styles.campOpsReasonRow}>
                  <Ionicons name="checkmark-circle-outline" size={9} color="#8BC34A" />
                  <Text style={styles.campOpsReasonText} numberOfLines={2}>{reason}</Text>
                </View>
              ))}
            </View>

            {warnings.length > 0 && (
              <View style={styles.campOpsWarnings}>
                {warnings.map((warning, idx) => (
                  <View key={`${card.role}-warning-${idx}`} style={styles.campOpsWarningRow}>
                    <Ionicons name="alert-circle-outline" size={9} color="#FFB74D" />
                    <Text style={styles.campOpsWarningText} numberOfLines={2}>{warning}</Text>
                  </View>
                ))}
              </View>
            )}

            {hasExpandableDetails && (
              <View>
                <TouchableOpacity
                  style={styles.campOpsWhyButton}
                  onPress={() => setExpandedRole(expanded ? null : card.role)}
                  activeOpacity={0.8}
                >
                  <Ionicons
                    name={expanded ? 'chevron-up-outline' : 'chevron-down-outline'}
                    size={10}
                    color={TACTICAL.textMuted}
                  />
                  <Text style={styles.campOpsWhyText}>Why this recommendation?</Text>
                </TouchableOpacity>
                {expanded && (
                  <View style={styles.campOpsWhyPanel}>
                    {detailRows.map((detail, idx) => (
                      <Text key={`${card.role}-detail-${idx}`} style={styles.campOpsWhyDetail}>
                        {detail}
                      </Text>
                    ))}
                  </View>
                )}
              </View>
            )}

            {card.camp && (onNavigateToCamp || onShareCamp) && (
              <View style={styles.campOpsActions}>
                {onNavigateToCamp && (
                  <TouchableOpacity
                    style={styles.campOpsActionButton}
                    onPress={() => onNavigateToCamp(card.camp!)}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="navigate-outline" size={10} color="#8BC34A" />
                    <Text style={styles.campOpsActionText}>Route</Text>
                  </TouchableOpacity>
                )}
                {onShareCamp && (
                  <TouchableOpacity
                    style={styles.campOpsActionButton}
                    onPress={() => onShareCamp(card.camp!)}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="share-outline" size={10} color="#8BC34A" />
                    <Text style={styles.campOpsActionText}>Share</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}

// ── Suggested Campsite Card (Phase 2+3 — Top 3) ─────────────

function SuggestedCampsiteCard({
  candidate,
  rank,
  isTop,
  campOpsStatus,
}: {
  candidate: CampsiteCandidate;
  rank: number;
  isTop: boolean;
  campOpsStatus?: CampOpsLegacyCandidateStatus | null;
}) {
  const suitColor = getSuitabilityColor(candidate.suitabilityLevel);
  const suitIcon = getSuitabilityIcon(candidate.suitabilityLevel);
  const confColor = getConfidenceColor(candidate.confidence);
  const confIcon = getConfidenceIcon(candidate.confidence);
  const difficultyColor = getDifficultyColor(candidate.difficulty);
  const arrivalStr = campsiteCandidateEngine.formatArrivalTime(candidate.estimatedArrivalHour);
  const confidenceLabel = getCandidateConfidenceLabel(candidate);

  return (
    <View style={[styles.suggestedCard, isTop && styles.suggestedCardTop]}>
      {/* Rank + Mile header */}
      <View style={styles.suggestedHeader}>
        <View style={styles.suggestedRankRow}>
          <View style={[styles.rankBadge, { backgroundColor: suitColor + '18', borderColor: suitColor + '40' }]}>
            <Text style={[styles.rankText, { color: suitColor }]}>#{rank}</Text>
          </View>
          <View style={styles.suggestedMileInfo}>
            <Text style={styles.suggestedMile}>Mile {candidate.distanceMiles.toFixed(0)}</Text>
            <Text style={styles.suggestedRange}>{candidate.segmentRange}</Text>
          </View>
        </View>

        {/* Suitability + Confidence badges */}
          <View style={styles.badgeStack}>
          {campOpsStatus && campOpsStatus.kind !== 'available_result' && (
            <View style={styles.legacyCampOpsStatusBadge}>
              <Text style={styles.legacyCampOpsStatusText}>{campOpsStatus.label}</Text>
            </View>
          )}
            <View style={[styles.suitabilityBadge, { borderColor: suitColor + '50', backgroundColor: suitColor + '10' }]}>
              <Ionicons name={suitIcon as any} size={10} color={suitColor} />
              <Text style={[styles.suitabilityLabel, { color: suitColor }]}>{candidate.suitabilityLevel}</Text>
          </View>
          <View style={[styles.confidenceBadge, { borderColor: confColor + '40', backgroundColor: confColor + '08' }]}>
            <Ionicons name={confIcon as any} size={8} color={confColor} />
            <Text style={[styles.confidenceLabel, { color: confColor }]}>{confidenceLabel}</Text>
          </View>
        </View>
      </View>

      {/* Metrics row */}
      <View style={styles.metricsRow}>
        <View style={styles.metric}>
          <Ionicons name="time-outline" size={9} color={TACTICAL.textMuted} />
          <Text style={styles.metricText}>
            ~{arrivalStr} from start
          </Text>
        </View>
        <View style={styles.metric}>
          <Ionicons name="trending-up-outline" size={9} color={TACTICAL.textMuted} />
          <Text style={styles.metricText}>
            {candidate.elevationGain.toLocaleString()} ft gain
          </Text>
        </View>
        <View style={styles.metric}>
          <Ionicons name="arrow-up-circle-outline" size={9} color={TACTICAL.textMuted} />
          <Text style={styles.metricText}>
            {candidate.avgElevation.toLocaleString()} ft
          </Text>
        </View>
      </View>



      {/* Phase 3: Confidence reasons */}
      {candidate.confidenceReasons.length > 0 && (
        <View style={styles.confidenceReasonsContainer}>
          {candidate.confidenceReasons.map((reason, rIdx) => (
            <View key={rIdx} style={styles.confidenceReasonRow}>
              <Ionicons name="information-circle" size={8} color={confColor} />
              <Text style={[styles.confidenceReasonText, { color: confColor }]}>{reason}</Text>
            </View>
          ))}
        </View>
      )}

      {campOpsStatus && campOpsStatus.kind !== 'available_result' && (
        <View style={styles.legacyCampOpsStatusRow}>
          <Ionicons name="git-compare-outline" size={9} color="#FFB74D" />
          <Text style={styles.legacyCampOpsStatusDetail}>{campOpsStatus.detail}</Text>
        </View>
      )}

      {/* Candidate reasons */}
      <View style={styles.reasonsContainer}>
        {candidate.candidateReason.slice(0, 3).map((reason, rIdx) => (
          <View key={rIdx} style={styles.reasonRow}>
            <Ionicons name="checkmark-circle" size={9} color="#8BC34A" />
            <Text style={styles.reasonText}>{reason}</Text>
          </View>
        ))}
      </View>

      {/* Difficulty + coordinates */}
      <View style={styles.suggestedFooter}>
        <View style={[styles.difficultyBadge, { borderColor: difficultyColor + '40' }]}>
          <Text style={[styles.difficultyText, { color: difficultyColor }]}>
            {candidate.difficulty.toUpperCase()}
          </Text>
        </View>
        <Text style={styles.coordsText}>
          {candidate.coordinates[0].toFixed(4)}, {candidate.coordinates[1].toFixed(4)}
        </Text>
      </View>
    </View>
  );
}

// ── Additional Candidate Card (compact) ──────────────────────

function AdditionalCandidateCard({
  candidate,
  rank,
  campOpsStatus,
}: {
  candidate: CampsiteCandidate;
  rank: number;
  campOpsStatus?: CampOpsLegacyCandidateStatus | null;
}) {
  const suitColor = getSuitabilityColor(candidate.suitabilityLevel);
  const confColor = getConfidenceColor(candidate.confidence);
  const arrivalStr = campsiteCandidateEngine.formatArrivalTime(candidate.estimatedArrivalHour);
  const confidenceLabel = getCandidateConfidenceLabel(candidate);

  return (
    <View style={styles.additionalCard}>
      <View style={styles.additionalHeader}>
        <Text style={styles.additionalRank}>#{rank}</Text>
        <Text style={styles.additionalMile}>Mile {candidate.distanceMiles.toFixed(0)}</Text>
        <Text style={styles.additionalRange}>{candidate.segmentRange}</Text>
        <View style={{ flex: 1 }} />
        <Text style={[styles.additionalScore, { color: suitColor }]}>
          {candidate.suitabilityScore}
        </Text>
        <Text style={[styles.additionalLevel, { color: suitColor }]}>
          {candidate.suitabilityLevel}
        </Text>
        {/* Phase 3: Confidence in compact view */}
          <View style={[styles.additionalConfBadge, { borderColor: confColor + '30' }]}>
            <Text style={[styles.additionalConfText, { color: confColor }]}>{confidenceLabel}</Text>
          </View>
          {campOpsStatus && campOpsStatus.kind !== 'available_result' && (
            <View style={styles.additionalCampOpsStatusBadge}>
              <Text style={styles.additionalCampOpsStatusText}>{campOpsStatus.label}</Text>
            </View>
          )}
        </View>
      <View style={styles.additionalMeta}>
        <Text style={styles.additionalMetaText}>
          ~{arrivalStr} from start
        </Text>
        <Text style={styles.additionalMetaText}>
          {candidate.elevationGain.toLocaleString()} ft gain
        </Text>
        <Text style={styles.additionalMetaText}>
          {candidate.avgElevation.toLocaleString()} ft avg
        </Text>
      </View>
      {/* Phase 3: Show confidence reasons if any */}
      {candidate.confidenceReasons.length > 0 && (
        <View style={styles.additionalConfReasons}>
          {candidate.confidenceReasons.slice(0, 1).map((reason, rIdx) => (
            <Text key={rIdx} style={[styles.additionalConfReasonText, { color: confColor }]}>
              {reason}
            </Text>
          ))}
        </View>
      )}
    </View>
  );
}

// ── Styles ───────────────────────────────────────────────────

const styles = StyleSheet.create({
  // ── Collapsed Badge ──
  collapsedBadge: {
    position: 'absolute',
    bottom: 140,
    left: 10,
    zIndex: 28,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(11,15,18,0.92)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(139,195,74,0.25)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 4,
    elevation: 6,
  },
  collapsedLabel: {
    fontFamily: 'monospace',
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: 2,
    color: '#8BC34A',
  },
  collapsedLevelBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
    borderWidth: 1,
    backgroundColor: 'rgba(0,0,0,0.2)',
  },
  collapsedLevelText: {
    fontFamily: 'monospace',
    fontSize: 7,
    fontWeight: '700',
    letterSpacing: 1,
  },
  collapsedConfBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 3,
    borderWidth: 1,
    backgroundColor: 'rgba(0,0,0,0.15)',
  },
  collapsedConfText: {
    fontFamily: 'monospace',
    fontSize: 6,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  collapsedCountBadge: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
    backgroundColor: 'rgba(139,195,74,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(139,195,74,0.3)',
  },
  collapsedCountText: {
    fontFamily: 'Courier',
    fontSize: 9,
    fontWeight: '800',
    color: '#8BC34A',
  },
  collapsedDetail: {
    fontFamily: 'Courier',
    fontSize: 9,
    color: TACTICAL.textMuted,
    marginLeft: 2,
  },

  // ── Expanded Panel ──
  expandedPanel: {
    position: 'absolute',
    bottom: 56,
    left: 8,
    right: 8,
    zIndex: 28,
    backgroundColor: '#111418',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1E232B',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.6,
    shadowRadius: 10,
    elevation: 10,
    maxHeight: 440,
    overflow: 'hidden',
  },

  // ── Header ──
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#1E232B',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  headerTitle: {
    fontFamily: 'monospace',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 2,
    color: '#8BC34A',
  },
  phaseBadge: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 3,
    backgroundColor: 'rgba(139,195,74,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(139,195,74,0.25)',
  },
  phaseBadgeText: {
    fontFamily: 'monospace',
    fontSize: 7,
    fontWeight: '700',
    letterSpacing: 1.5,
    color: '#8BC34A',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },

  // ── Route Context ──
  routeContext: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 4,
    backgroundColor: 'rgba(30,35,43,0.4)',
  },
  routeContextText: {
    fontFamily: 'monospace',
    fontSize: 9,
    color: TACTICAL.textMuted,
    flex: 1,
  },

  // ── Phase 3: Context Warnings ──
  contextWarning: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    gap: 3,
    backgroundColor: 'rgba(255,183,77,0.06)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,183,77,0.12)',
  },
  contextWarningRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  contextWarningText: {
    fontFamily: 'monospace',
    fontSize: 8,
    color: '#FFB74D',
    flex: 1,
  },

  // ── Stats Row ──
  statsRow: {
    flexDirection: 'row',
    paddingHorizontal: 10,
    paddingVertical: 6,
    gap: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#1E232B',
  },
  statChip: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: 'rgba(30,35,43,0.5)',
    borderWidth: 1,
    borderColor: 'rgba(30,35,43,0.8)',
  },
  statValue: {
    fontFamily: 'Courier',
    fontSize: 11,
    fontWeight: '800',
    color: TACTICAL.text,
  },
  statLabel: {
    fontFamily: 'monospace',
    fontSize: 6,
    fontWeight: '600',
    letterSpacing: 1.2,
    color: TACTICAL.textMuted,
    marginTop: 1,
  },

  // ── Candidate List ──
  candidateList: {
    maxHeight: 280,
  },
  candidateListContent: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    gap: 6,
  },
  legacyCoexistencePanel: {
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 7,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: 'rgba(255,183,77,0.18)',
    backgroundColor: 'rgba(255,183,77,0.05)',
  },
  legacyCoexistenceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
  },
  legacyCoexistenceTitle: {
    fontFamily: 'monospace',
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 1.2,
    color: '#FFB74D',
    textTransform: 'uppercase',
  },
  legacyCoexistencePill: {
    fontFamily: 'monospace',
    fontSize: 7,
    fontWeight: '800',
    letterSpacing: 0.8,
    color: '#8BC34A',
    textTransform: 'uppercase',
  },
  legacyCoexistenceText: {
    fontFamily: 'monospace',
    fontSize: 8,
    color: 'rgba(230,230,225,0.72)',
  },
  legacyCoexistenceWarning: {
    fontFamily: 'monospace',
    fontSize: 8,
    color: '#FFB74D',
  },

  // CampOps recommendation cards
  campOpsSection: {
    gap: 6,
    marginBottom: 2,
  },
  campOpsSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 2,
    paddingVertical: 2,
  },
  campOpsSectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  campOpsSectionTitle: {
    fontFamily: 'monospace',
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 1.4,
    color: '#8BC34A',
  },
  campOpsConfidencePill: {
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(139,195,74,0.25)',
    backgroundColor: 'rgba(139,195,74,0.07)',
  },
  campOpsConfidenceText: {
    fontFamily: 'monospace',
    fontSize: 7,
    fontWeight: '700',
    color: '#8BC34A',
  },
  campOpsCard: {
    backgroundColor: 'rgba(20,25,30,0.78)',
    borderRadius: 8,
    borderWidth: 1,
    padding: 8,
    gap: 6,
  },
  campOpsCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  campOpsTitleGroup: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    minWidth: 0,
  },
  campOpsRoleIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  campOpsTitleTextGroup: {
    flex: 1,
    gap: 1,
    minWidth: 0,
  },
  campOpsRoleLabel: {
    fontFamily: 'monospace',
    fontSize: 7,
    fontWeight: '800',
    letterSpacing: 1.2,
    color: TACTICAL.textMuted,
  },
  campOpsCampName: {
    fontFamily: 'Courier',
    fontSize: 12,
    fontWeight: '800',
    color: TACTICAL.text,
  },
  campOpsStatusBadge: {
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 5,
    borderWidth: 1,
    backgroundColor: 'rgba(0,0,0,0.18)',
  },
  campOpsStatusText: {
    fontFamily: 'monospace',
    fontSize: 7,
    fontWeight: '800',
    letterSpacing: 0.7,
    textTransform: 'uppercase',
  },
  campOpsMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  campOpsMetaText: {
    fontFamily: 'monospace',
    fontSize: 8,
    color: TACTICAL.textMuted,
  },
  campOpsFieldGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
  },
  campOpsField: {
    width: '31.5%',
    minHeight: 36,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: 'rgba(30,35,43,0.85)',
    backgroundColor: 'rgba(30,35,43,0.38)',
    paddingHorizontal: 5,
    paddingVertical: 4,
    justifyContent: 'center',
  },
  campOpsFieldLabel: {
    fontFamily: 'monospace',
    fontSize: 6,
    fontWeight: '800',
    letterSpacing: 0.8,
    color: TACTICAL.textMuted,
    textTransform: 'uppercase',
  },
  campOpsFieldValue: {
    fontFamily: 'Courier',
    fontSize: 9,
    fontWeight: '700',
    color: TACTICAL.text,
    marginTop: 2,
  },
  campOpsTransparencyStrip: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
  },
  campOpsTransparencyChip: {
    width: '31.5%',
    minHeight: 34,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: 'rgba(138,138,133,0.2)',
    backgroundColor: 'rgba(0,0,0,0.16)',
    paddingHorizontal: 5,
    paddingVertical: 4,
    justifyContent: 'center',
  },
  campOpsTransparencyLabel: {
    fontFamily: 'monospace',
    fontSize: 6,
    fontWeight: '800',
    letterSpacing: 0.6,
    color: TACTICAL.textMuted,
    textTransform: 'uppercase',
  },
  campOpsTransparencyValue: {
    fontFamily: 'Courier',
    fontSize: 8,
    fontWeight: '700',
    color: 'rgba(230,230,225,0.78)',
    marginTop: 2,
  },
  campOpsReasons: {
    gap: 3,
  },
  campOpsReasonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  campOpsReasonText: {
    flex: 1,
    fontFamily: 'monospace',
    fontSize: 8,
    color: 'rgba(230,230,225,0.74)',
  },
  campOpsWarnings: {
    gap: 3,
    paddingTop: 2,
  },
  campOpsWarningRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  campOpsWarningText: {
    flex: 1,
    fontFamily: 'monospace',
    fontSize: 8,
    color: '#FFB74D',
  },
  campOpsWhyButton: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: 'rgba(138,138,133,0.22)',
    backgroundColor: 'rgba(30,35,43,0.28)',
  },
  campOpsWhyText: {
    fontFamily: 'monospace',
    fontSize: 7,
    fontWeight: '800',
    letterSpacing: 1,
    color: TACTICAL.textMuted,
  },
  campOpsWhyPanel: {
    gap: 3,
    marginTop: 5,
    paddingLeft: 8,
    borderLeftWidth: 2,
    borderLeftColor: 'rgba(139,195,74,0.24)',
  },
  campOpsWhyDetail: {
    fontFamily: 'monospace',
    fontSize: 8,
    color: 'rgba(230,230,225,0.7)',
  },
  campOpsActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  campOpsActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: 'rgba(139,195,74,0.3)',
    backgroundColor: 'rgba(139,195,74,0.08)',
  },
  campOpsActionText: {
    fontFamily: 'monospace',
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 0.8,
    color: '#8BC34A',
  },

  // ── Empty State ──
  emptyState: {
    alignItems: 'center',
    paddingVertical: 20,
    gap: 6,
  },
  emptyText: {
    fontFamily: 'monospace',
    fontSize: 10,
    color: TACTICAL.textMuted,
    textAlign: 'center',
  },
  emptySubText: {
    fontFamily: 'monospace',
    fontSize: 9,
    color: TACTICAL.textMuted,
    textAlign: 'center',
    opacity: 0.7,
    paddingHorizontal: 20,
  },

  // ── Suggested Campsite Card ──
  suggestedCard: {
    backgroundColor: 'rgba(30,35,43,0.4)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(30,35,43,0.8)',
    padding: 8,
    gap: 5,
  },
  suggestedCardTop: {
    borderColor: 'rgba(139,195,74,0.3)',
    backgroundColor: 'rgba(139,195,74,0.04)',
  },

  // ── Suggested Header ──
  suggestedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  suggestedRankRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  rankBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankText: {
    fontFamily: 'Courier',
    fontSize: 9,
    fontWeight: '800',
  },
  suggestedMileInfo: {
    gap: 1,
  },
  suggestedMile: {
    fontFamily: 'Courier',
    fontSize: 12,
    fontWeight: '800',
    color: TACTICAL.text,
  },
  suggestedRange: {
    fontFamily: 'monospace',
    fontSize: 8,
    color: TACTICAL.textMuted,
  },

  // ── Badge Stack (Suitability + Confidence) ──
  badgeStack: {
    alignItems: 'flex-end',
    gap: 3,
  },

  // ── Suitability Badge ──
  suitabilityBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
  },
  suitabilityScore: {
    fontFamily: 'Courier',
    fontSize: 13,
    fontWeight: '900',
  },
  suitabilityLabel: {
    fontFamily: 'monospace',
    fontSize: 7,
    fontWeight: '700',
    letterSpacing: 1,
  },

  // ── Confidence Badge (Phase 3) ──
  confidenceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
  },
  confidenceLabel: {
    fontFamily: 'monospace',
    fontSize: 7,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  legacyCampOpsStatusBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(255,183,77,0.35)',
    backgroundColor: 'rgba(255,183,77,0.08)',
  },
  legacyCampOpsStatusText: {
    fontFamily: 'monospace',
    fontSize: 7,
    fontWeight: '800',
    letterSpacing: 0.7,
    color: '#FFB74D',
    textTransform: 'uppercase',
  },
  legacyCampOpsStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 2,
  },
  legacyCampOpsStatusDetail: {
    flex: 1,
    fontFamily: 'monospace',
    fontSize: 8,
    color: '#FFB74D',
  },

  // ── Metrics Row ──
  metricsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  metric: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  metricText: {
    fontFamily: 'Courier',
    fontSize: 9,
    color: TACTICAL.textMuted,
  },

  // ── Scoring Breakdown ──
  scoringContainer: {
    gap: 2,
    paddingVertical: 2,
    borderLeftWidth: 2,
    borderLeftColor: 'rgba(139,195,74,0.2)',
    marginLeft: 2,
    paddingLeft: 8,
  },
  scoringRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  scoringDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  scoringText: {
    fontFamily: 'monospace',
    fontSize: 8,
    color: 'rgba(230,230,225,0.65)',
  },

  // ── Phase 3: Confidence Reasons ──
  confidenceReasonsContainer: {
    gap: 2,
    paddingVertical: 2,
    borderLeftWidth: 2,
    borderLeftColor: 'rgba(255,183,77,0.2)',
    marginLeft: 2,
    paddingLeft: 8,
  },
  confidenceReasonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  confidenceReasonText: {
    fontFamily: 'monospace',
    fontSize: 8,
  },

  // ── Reasons ──
  reasonsContainer: {
    gap: 2,
    paddingLeft: 2,
  },
  reasonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  reasonText: {
    fontFamily: 'monospace',
    fontSize: 9,
    color: 'rgba(230,230,225,0.7)',
  },

  // ── Suggested Footer ──
  suggestedFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  difficultyBadge: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 3,
    borderWidth: 1,
  },
  difficultyText: {
    fontFamily: 'monospace',
    fontSize: 7,
    fontWeight: '700',
    letterSpacing: 1,
  },
  coordsText: {
    fontFamily: 'Courier',
    fontSize: 8,
    color: 'rgba(138,138,133,0.4)',
    textAlign: 'right',
  },

  // ── Show More Button ──
  showMoreBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(30,35,43,0.8)',
    backgroundColor: 'rgba(30,35,43,0.3)',
  },
  showMoreText: {
    fontFamily: 'monospace',
    fontSize: 8,
    fontWeight: '600',
    letterSpacing: 1.5,
    color: TACTICAL.textMuted,
  },

  // ── Additional Candidate Card (compact) ──
  additionalCard: {
    backgroundColor: 'rgba(30,35,43,0.25)',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(30,35,43,0.6)',
    padding: 6,
    gap: 3,
  },
  additionalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  additionalRank: {
    fontFamily: 'Courier',
    fontSize: 9,
    fontWeight: '700',
    color: TACTICAL.textMuted,
    width: 20,
  },
  additionalMile: {
    fontFamily: 'Courier',
    fontSize: 10,
    fontWeight: '700',
    color: TACTICAL.text,
  },
  additionalRange: {
    fontFamily: 'monospace',
    fontSize: 8,
    color: TACTICAL.textMuted,
  },
  additionalScore: {
    fontFamily: 'Courier',
    fontSize: 10,
    fontWeight: '800',
  },
  additionalLevel: {
    fontFamily: 'monospace',
    fontSize: 7,
    fontWeight: '700',
    letterSpacing: 1,
  },
  additionalConfBadge: {
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 3,
    borderWidth: 1,
    marginLeft: 3,
  },
  additionalConfText: {
    fontFamily: 'monospace',
    fontSize: 6,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  additionalCampOpsStatusBadge: {
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 3,
    borderWidth: 1,
    borderColor: 'rgba(255,183,77,0.28)',
    backgroundColor: 'rgba(255,183,77,0.07)',
    marginLeft: 3,
  },
  additionalCampOpsStatusText: {
    fontFamily: 'monospace',
    fontSize: 6,
    fontWeight: '800',
    color: '#FFB74D',
  },
  additionalMeta: {
    flexDirection: 'row',
    gap: 8,
    paddingLeft: 20,
  },
  additionalMetaText: {
    fontFamily: 'Courier',
    fontSize: 8,
    color: 'rgba(138,138,133,0.6)',
  },
  additionalConfReasons: {
    paddingLeft: 20,
    gap: 1,
  },
  additionalConfReasonText: {
    fontFamily: 'monospace',
    fontSize: 7,
    opacity: 0.8,
  },

  // ── Footer ──
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 5,
    borderTopWidth: 1,
    borderTopColor: '#1E232B',
    backgroundColor: 'rgba(30,35,43,0.3)',
  },
  footerText: {
    fontFamily: 'monospace',
    fontSize: 7,
    fontWeight: '600',
    letterSpacing: 1.5,
    color: TACTICAL.textMuted,
    opacity: 0.6,
  },
});



