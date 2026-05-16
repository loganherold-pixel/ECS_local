import React from 'react';
import {
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import ECSActionRow from '../ECSActionRow';
import { ECSButton } from '../ECSButton';
import { SafeIcon as Ionicons } from '../SafeIcon';
import type {
  CampIntelAssessmentRow,
  CampIntelComparisonResult,
  CampIntelSite,
  CampIntelTone,
} from '../../lib/campIntel/campIntelTypes';
import { TACTICAL, TYPO } from '../../lib/theme';

type Props = {
  visible: boolean;
  site: CampIntelSite | null;
  comparison: CampIntelComparisonResult | null;
  topOffset: number;
  bottomOffset: number;
  rightInset: number;
  maxWidth?: number;
  rank?: number | null;
  searchContext?: 'route' | 'draw_area' | null;
  comparisonVisible?: boolean;
  onNavigateHere: () => void;
  onSaveCamp: () => void;
  onCompareNearby: () => void;
  onMarkUsed: () => void;
  onReportUnusable: () => void;
  onDismiss: () => void;
};

type CampsiteRatingLetter = 'A' | 'B' | 'C' | 'D';

type CampsiteRatingFactor = {
  label: string;
  value?: string | number;
  impact?: 'positive' | 'neutral' | 'negative';
  description?: string;
};

const RATING_FALLBACK_EXPLANATION =
  "This rating is based on the campsite's combined remoteness, access, terrain, and camping suitability score.";
const WEB_SCROLL_CONTAINMENT_STYLE =
  Platform.OS === 'web'
    ? ({
        overscrollBehavior: 'contain',
        touchAction: 'pan-y',
      } as any)
    : null;

function toneColor(tone: CampIntelTone | undefined): string {
  switch (tone) {
    case 'positive':
      return '#66BB6A';
    case 'caution':
      return '#FFB300';
    case 'warning':
      return '#EF5350';
    case 'info':
      return '#6EA8FF';
    case 'neutral':
    default:
      return TACTICAL.textMuted;
  }
}

function confidenceTone(site: CampIntelSite): string {
  switch (site.confidence) {
    case 'high':
      return '#66BB6A';
    case 'medium':
      return '#FFB300';
    default:
      return '#EF5350';
  }
}

function formatConfidenceSignal(site: CampIntelSite): string | null {
  const strongSignals: string[] = [];
  const weakSignals: string[] = [];

  if (site.confidenceBreakdown.terrainConfidence.label === 'high') strongSignals.push('Terrain high');
  if (site.confidenceBreakdown.accessConfidence.label === 'high') strongSignals.push('Access high');
  if (site.confidenceBreakdown.vehicleFitConfidence.label === 'high') strongSignals.push('Approach fit high');
  if (site.confidenceBreakdown.routeConfidence.label === 'high') strongSignals.push('Route high');

  if (site.offlineAssessment?.weatherStale || site.confidenceBreakdown.weatherConfidence.label === 'low') {
    weakSignals.push('Weather stale');
  } else if (site.confidenceBreakdown.weatherConfidence.label === 'medium') {
    weakSignals.push('Weather medium');
  }

  if (site.offlineAssessment?.complianceConfidenceReduced || site.confidenceBreakdown.complianceConfidence.label === 'low') {
    weakSignals.push('Restriction signal limited');
  } else if (site.confidenceBreakdown.complianceConfidence.label === 'medium') {
    weakSignals.push('Restriction signal medium');
  }

  if (site.confidenceBreakdown.vehicleFitConfidence.label === 'low') {
    weakSignals.push('Approach fit limited');
  } else if (site.confidenceBreakdown.vehicleFitConfidence.label === 'medium') {
    weakSignals.push('Approach fit medium');
  }

  if (site.confidenceBreakdown.routeConfidence.label === 'low') {
    weakSignals.push('Route confidence low');
  } else if (site.confidenceBreakdown.routeConfidence.label === 'medium') {
    weakSignals.push('Route confidence medium');
  }

  const parts = [...strongSignals.slice(0, 1), ...weakSignals.slice(0, 1)];
  if (parts.length === 0) {
    if (site.confidenceBreakdown.accessConfidence.label === 'medium') return 'Access medium';
    if (site.confidenceBreakdown.terrainConfidence.label === 'medium') return 'Terrain medium';
    return null;
  }
  return parts.join(', ');
}

function formatCampSourceBasis(site: CampIntelSite): string {
  if (site.evidenceSummary?.sourceLabel) return site.evidenceSummary.sourceLabel;

  switch (site.sourceType) {
    case 'verified':
      return 'Field-Confirmed';
    case 'saved':
    case 'historical':
      return 'User-Supported';
    case 'route_candidate':
    case 'fallback':
    case 'inferred':
      return 'ECS-Inferred';
    default:
      return 'Limited';
  }
}

function formatCampMode(site: CampIntelSite): string {
  switch (site.offlineStatus) {
    case 'online':
      return 'Online';
    case 'offline_estimated':
      return 'Offline support';
    default:
      return 'Limited';
  }
}

function formatCampEvidenceTrustLine(site: CampIntelSite): string {
  const latestEvidence = site.evidenceSummary?.latestEvidence;
  const evidenceLabel = latestEvidence && latestEvidence !== 'None' ? latestEvidence : formatCampMode(site);
  return [
    `Intel Confidence: ${site.evidenceSummary?.intelConfidence ?? site.confidenceLabel}`,
    formatCampSourceBasis(site),
    evidenceLabel,
  ].join(' - ');
}

function ratingFromScore(score: number | null | undefined): CampsiteRatingLetter {
  if (typeof score !== 'number' || !Number.isFinite(score)) return 'D';
  if (score >= 85) return 'A';
  if (score >= 70) return 'B';
  if (score >= 55) return 'C';
  return 'D';
}

function formatScore(score: number | null | undefined): string | null {
  if (typeof score !== 'number' || !Number.isFinite(score)) return null;
  return `${Math.round(score)}/100`;
}

function formatEvidenceLabel(value: string | null | undefined): string | null {
  if (!value) return null;
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
}

function formatCoordinate(value: number | null | undefined): string | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return value.toFixed(5);
}

function impactFromScore(score: number | null | undefined, inverse = false): CampsiteRatingFactor['impact'] {
  if (typeof score !== 'number' || !Number.isFinite(score)) return 'neutral';
  const normalized = inverse ? 100 - score : score;
  if (normalized >= 72) return 'positive';
  if (normalized >= 50) return 'neutral';
  return 'negative';
}

function impactColor(impact: CampsiteRatingFactor['impact']): string {
  switch (impact) {
    case 'positive':
      return '#66BB6A';
    case 'negative':
      return '#EF5350';
    case 'neutral':
    default:
      return TACTICAL.amber;
  }
}

function buildRatingFactors(site: CampIntelSite): CampsiteRatingFactor[] {
  const factors: CampsiteRatingFactor[] = [];
  const pushFactor = (factor: CampsiteRatingFactor) => {
    if (!factors.some((item) => item.label === factor.label)) {
      factors.push(factor);
    }
  };

  pushFactor({
    label: 'Overall camp score',
    value: formatScore(site.overallScore) ?? undefined,
    impact: impactFromScore(site.overallScore),
    description: 'Combined access, terrain, safety, restriction signal, and desirability score.',
  });

  pushFactor({
    label: 'Camping suitability',
    value: formatScore(site.overnightSuitabilityScore) ?? undefined,
    impact: impactFromScore(site.overnightSuitabilityScore),
    description: site.overnightAssessment.label,
  });

  pushFactor({
    label: 'Terrain suitability',
    value: formatScore(site.scoreBreakdown.campability) ?? undefined,
    impact: impactFromScore(site.scoreBreakdown.campability),
    description: `Terrain confidence ${site.confidenceBreakdown.terrainConfidence.label}.`,
  });

  pushFactor({
    label: 'Access confidence',
    value: formatEvidenceLabel(site.confidenceBreakdown.accessConfidence.label) ?? undefined,
    impact: impactFromScore(site.confidenceBreakdown.accessConfidence.score),
    description: site.arrivalAssessment.label,
  });

  if (site.detourDistanceMiles != null && Number.isFinite(site.detourDistanceMiles)) {
    const detour = site.detourDistanceMiles;
    pushFactor({
      label: 'Route proximity',
      value: detour <= 0.05 ? 'On corridor' : `${detour.toFixed(1)} mi detour`,
      impact: detour <= 1.2 ? 'positive' : detour <= 3 ? 'neutral' : 'negative',
      description: 'Shorter detours keep the campsite easier to inspect from the active route.',
    });
  }

  pushFactor({
    label: 'Final approach fit',
    value: ratingFromScore(site.scoreBreakdown.vehicleFit),
    impact: impactFromScore(site.scoreBreakdown.vehicleFit),
    description: site.vehicleSummary?.accessLabel ?? site.vehicleAssessment[0]?.value,
  });

  const comms = site.resourceImplications.find((row) => row.id === 'comms');
  if (comms) {
    pushFactor({
      label: 'Cell coverage',
      value: comms.value,
      impact:
        comms.tone === 'positive'
          ? 'positive'
          : comms.tone === 'warning'
            ? 'negative'
            : 'neutral',
      description: 'Estimated communication confidence near the campsite.',
    });
  }

  return factors.filter((factor) => factor.value != null || factor.description).slice(0, 5);
}

function buildDefaultReasons(site: CampIntelSite): string[] {
  const reasons: string[] = [];

  for (const reason of site.explanationReasons) {
    if (!reasons.includes(reason)) reasons.push(reason);
    if (reasons.length >= 2) break;
  }

  for (const reason of site.topPositiveReasons) {
    if (!reasons.includes(reason)) reasons.push(reason);
    if (reasons.length >= 2) break;
  }

  const shouldIncludeCaution =
    site.confidence !== 'high' ||
    site.offlineAssessment != null ||
    site.arrivalAssessment.tone !== 'positive' ||
    site.departureAssessment.tone !== 'positive';

  if (shouldIncludeCaution) {
    const caution = site.topCautionReasons[0];
    if (caution && !reasons.includes(caution)) reasons.push(caution);
  }

  for (const reason of site.topPositiveReasons.slice(2)) {
    if (!reasons.includes(reason)) reasons.push(reason);
    if (reasons.length >= 3) break;
  }

  if (reasons.length === 0) {
    reasons.push(site.recommendationSummary || site.quickVerdict);
  }

  return reasons.slice(0, 3);
}

function buildLocationRows(
  site: CampIntelSite,
  searchContext: Props['searchContext'],
): CampIntelAssessmentRow[] {
  const latitude = formatCoordinate(site.coordinate.latitude);
  const longitude = formatCoordinate(site.coordinate.longitude);
  const rows: CampIntelAssessmentRow[] = [];

  if (latitude && longitude) {
    rows.push({
      id: 'coordinates',
      label: 'Coordinates',
      value: `${latitude}, ${longitude}`,
      tone: 'info',
    });
  }

  rows.push({
    id: 'source',
    label: 'Source',
    value: formatCampSourceBasis(site),
    tone:
      site.evidenceSummary?.sourceLabel === 'Avoid / Restricted' || site.evidenceSummary?.sourceLabel === 'Disputed'
        ? 'warning'
        : site.evidenceSummary?.sourceLabel === 'Field-Confirmed'
          ? 'positive'
          : 'neutral',
  });

  if (site.sourceRouteName) {
    rows.push({
      id: 'source-route',
      label: 'Route context',
      value: site.sourceRouteName,
      tone: 'neutral',
    });
  }

  if (site.segmentLabel) {
    rows.push({
      id: 'segment',
      label: 'Area / segment',
      value: site.segmentLabel,
      tone: 'neutral',
    });
  }

  if (site.detourDistanceMiles != null) {
    rows.push({
      id: 'detour',
      label: 'Route distance',
      value:
        site.detourDistanceMiles <= 0.05
          ? 'On route corridor'
          : `${site.detourDistanceMiles.toFixed(1)} mi detour`,
      tone: site.detourDistanceMiles <= 1.2 ? 'positive' : 'caution',
    });
  }

  if (searchContext === 'draw_area') {
    rows.push({
      id: 'draw-area-context',
      label: 'Draw Area',
      value: 'Inside finalized drawn area',
      tone: 'positive',
    });
  } else if (searchContext === 'route') {
    rows.push({
      id: 'route-corridor-context',
      label: 'Route Relationship',
      value: site.detourDistanceMiles != null ? 'Inside route campsite corridor' : 'Route campsite suggestion',
      tone: 'positive',
    });
  }

  const roadsideSignals = [
    ...site.explanationReasons,
    ...site.topPositiveReasons,
    ...site.reasonChips.map((chip) => chip.label),
  ].join(' ').toLowerCase();
  if (
    roadsideSignals.includes('major road') ||
    roadsideSignals.includes('roadway') ||
    roadsideSignals.includes('trail') ||
    roadsideSignals.includes('off-road') ||
    roadsideSignals.includes('backcountry')
  ) {
    rows.push({
      id: 'roadside-screen',
      label: 'Roadside Screen',
      value: 'Not classified as a main-road roadside suggestion',
      tone: 'positive',
    });
  }

  return rows;
}

function buildEvidenceRows(site: CampIntelSite): CampIntelAssessmentRow[] {
  const evidence = site.evidenceSummary;
  if (!evidence) {
    return [
      { id: 'source', label: 'Source', value: formatCampSourceBasis(site), tone: 'neutral' },
      {
        id: 'confidence',
        label: 'Intel Confidence',
        value: site.confidenceLabel,
        tone: site.confidence === 'high' ? 'positive' : site.confidence === 'medium' ? 'caution' : 'warning',
      },
      { id: 'latest', label: 'Latest Evidence', value: 'None', tone: 'neutral' },
    ];
  }

  const sourceTone: CampIntelTone =
    evidence.sourceLabel === 'Field-Confirmed'
      ? 'positive'
      : evidence.sourceLabel === 'Avoid / Restricted' || evidence.sourceLabel === 'Disputed'
        ? 'warning'
        : evidence.sourceLabel === 'User-Supported'
          ? 'info'
          : 'neutral';
  const confidenceToneValue: CampIntelTone =
    evidence.intelConfidence === 'High'
      ? 'positive'
      : evidence.intelConfidence === 'Medium'
        ? 'caution'
        : 'warning';
  const latestEvidenceLabel =
    evidence.sourceLabel === 'Field-Confirmed' ? 'Last Field Report' : 'Latest Evidence';
  const rows: CampIntelAssessmentRow[] = [
    { id: 'source-label', label: 'Source', value: evidence.sourceLabel, tone: sourceTone },
    { id: 'intel-confidence', label: 'Intel Confidence', value: evidence.intelConfidence, tone: confidenceToneValue },
    {
      id: 'latest-evidence',
      label: latestEvidenceLabel,
      value: evidence.latestEvidence,
      tone: evidence.latestEvidence === 'None' ? 'neutral' : 'info',
    },
    {
      id: 'access',
      label: 'Access',
      value: evidence.access,
      tone: evidence.access === 'Clear' || evidence.access === 'Likely reachable' ? 'positive' : evidence.access === 'Blocked' ? 'warning' : 'caution',
    },
    {
      id: 'restriction-signal',
      label: 'Restriction Signal',
      value: evidence.restrictionSignal,
      tone: evidence.restrictionSignal === 'None known' ? 'positive' : evidence.restrictionSignal === 'Unknown' ? 'neutral' : 'warning',
    },
    {
      id: 'land-use-confidence',
      label: 'Land-Use Confidence',
      value: evidence.landUseConfidence,
      tone: evidence.landUseConfidence === 'High' ? 'positive' : evidence.landUseConfidence === 'Medium' ? 'caution' : 'warning',
    },
    {
      id: 'use-pressure',
      label: 'Use Pressure',
      value: evidence.usePressure,
      tone: evidence.usePressure === 'Light' ? 'positive' : evidence.usePressure === 'High' ? 'caution' : 'neutral',
    },
  ];

  if (evidence.evidenceTypes.length > 0) {
    rows.splice(3, 0, {
      id: 'evidence-types',
      label: 'Evidence',
      value: evidence.evidenceTypes.join(' - '),
      tone: 'info',
    });
  }

  if (evidence.photoEvidenceCount != null && evidence.photoEvidenceCount > 0) {
    rows.push({
      id: 'photo-evidence',
      label: 'Photos',
      value: evidence.newestPhotoAgeLabel
        ? `${evidence.photoEvidenceCount} photos - newest ${evidence.newestPhotoAgeLabel}`
        : `${evidence.photoEvidenceCount} photos`,
      tone: 'info',
    });
  }

  if (evidence.concern) {
    rows.push({
      id: 'concern',
      label: 'Concern',
      value: evidence.concern,
      tone: 'warning',
    });
  }

  return rows;
}

function compactCompareCue(site: CampIntelSite, comparison: CampIntelComparisonResult | null): string | null {
  const compareLine = comparison?.compareHighlights?.[0]?.summary ?? comparison?.comparisonSummary?.[0] ?? null;
  if (compareLine) return compareLine;
  return site.whyNotTopRanked[0] ?? null;
}

function SectionRows({ rows }: { rows: CampIntelAssessmentRow[] }) {
  return (
    <View style={styles.sectionRows}>
      {rows.map((row) => (
        <View key={row.id} style={styles.sectionRow}>
          <Text style={styles.sectionRowLabel}>{row.label}</Text>
          <Text
            style={[
              styles.sectionRowValue,
              { color: toneColor(row.tone) },
            ]}
            numberOfLines={2}
          >
            {row.value}
          </Text>
        </View>
      ))}
    </View>
  );
}

function RatingFactorRows({ factors }: { factors: CampsiteRatingFactor[] }) {
  if (factors.length === 0) {
    return <Text style={styles.ratingFallbackText}>{RATING_FALLBACK_EXPLANATION}</Text>;
  }

  return (
    <View style={styles.ratingFactorList}>
      {factors.map((factor) => (
        <View key={factor.label} style={styles.ratingFactorRow}>
          <View style={[styles.ratingFactorDot, { backgroundColor: impactColor(factor.impact) }]} />
          <View style={styles.ratingFactorBody}>
            <View style={styles.ratingFactorHeader}>
              <Text style={styles.ratingFactorLabel}>{factor.label}</Text>
              {factor.value != null ? (
                <Text style={[styles.ratingFactorValue, { color: impactColor(factor.impact) }]}>
                  {factor.value}
                </Text>
              ) : null}
            </View>
            {factor.description ? (
              <Text style={styles.ratingFactorDescription} numberOfLines={2}>
                {factor.description}
              </Text>
            ) : null}
          </View>
        </View>
      ))}
    </View>
  );
}

export default function CampIntelDetailCard({
  visible,
  site,
  comparison,
  topOffset,
  bottomOffset,
  rightInset,
  maxWidth,
  rank,
  searchContext = null,
  comparisonVisible = false,
  onNavigateHere,
  onSaveCamp,
  onCompareNearby,
  onMarkUsed,
  onReportUnusable,
  onDismiss,
}: Props) {
  if (!visible || !site) return null;

  const confidenceColor = confidenceTone(site);
  const compactConfidence = formatConfidenceSignal(site);
  const trustLine = formatCampEvidenceTrustLine(site);
  const defaultReasons = buildDefaultReasons(site);
  const compareCue = compactCompareCue(site, comparison) ?? site.trustNotes[0] ?? null;
  const ratingImpact = impactFromScore(site.overallScore);
  const ratingColor = impactColor(ratingImpact);
  const ratingLetter = site.rating ?? ratingFromScore(site.overallScore);
  const ratingScore = formatScore(site.overallScore);
  const ratingFactors = site.ratingFactors?.length ? site.ratingFactors : buildRatingFactors(site);
  const evidenceRows = buildEvidenceRows(site);
  const locationRows = buildLocationRows(site, searchContext);
  const rankLabel = typeof rank === 'number' && Number.isFinite(rank) ? `#${rank}` : null;

  return (
    <View
      pointerEvents="box-none"
      style={styles.layer}
    >
      <View
        style={[
          styles.shell,
          {
            top: topOffset,
            bottom: bottomOffset,
            left: 12,
            right: rightInset + 12,
            maxWidth: maxWidth ?? undefined,
          },
        ]}
        pointerEvents="auto"
      >
        <View style={styles.card} pointerEvents="auto">
          <View style={styles.header}>
            <View style={styles.headerTextWrap}>
              <Text style={styles.eyebrow}>Camp Intel</Text>
              <Text style={styles.title} numberOfLines={2}>
                {site.label}
              </Text>
              <View style={styles.headerMetaRow}>
                <View
                  style={[
                    styles.ratingBadge,
                    {
                      borderColor: `${ratingColor}55`,
                      backgroundColor: `${ratingColor}1F`,
                    },
                  ]}
                >
                  <Text style={[styles.ratingBadgeText, { color: ratingColor }]}>
                    {ratingLetter}
                  </Text>
                </View>
                <View
                  style={[
                    styles.categoryBadge,
                    {
                      borderColor: `${confidenceColor}44`,
                      backgroundColor: `${confidenceColor}18`,
                    },
                  ]}
                >
                  <Text style={[styles.categoryBadgeText, { color: confidenceColor }]}>
                    {site.categoryLabel}
                  </Text>
                </View>
                <Text style={[styles.confidenceText, { color: confidenceColor }]}>
                  {site.confidenceLabel}
                </Text>
                {rankLabel ? (
                  <Text style={[styles.confidenceText, { color: TACTICAL.amber }]}>
                    Rank {rankLabel}
                  </Text>
                ) : null}
              </View>
            </View>

            <TouchableOpacity
              style={styles.closeButton}
              onPress={onDismiss}
              activeOpacity={0.82}
            >
              <Ionicons name="close" size={17} color={TACTICAL.textMuted} />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={[styles.scroll, WEB_SCROLL_CONTAINMENT_STYLE]}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            nestedScrollEnabled
            keyboardShouldPersistTaps="handled"
            overScrollMode="always"
            bounces
            alwaysBounceVertical={false}
            scrollEventThrottle={16}
          >
            <View style={styles.verdictCard}>
              <Text style={styles.verdictLabel}>Camp Verdict</Text>
              <Text style={styles.verdictText}>{site.quickVerdict}</Text>
              <View style={styles.ratingSummaryRow}>
                {rankLabel ? (
                  <Text style={[styles.ratingSummaryGrade, { color: TACTICAL.amber }]}>
                    Ranked {rankLabel}
                  </Text>
                ) : null}
                <Text style={[styles.ratingSummaryGrade, { color: ratingColor }]}>
                  Rating {ratingLetter}
                </Text>
                {ratingScore ? <Text style={styles.ratingSummaryScore}>{ratingScore}</Text> : null}
              </View>
              <View style={styles.compactConfidenceRow}>
                <Text style={[styles.compactConfidencePrimary, { color: confidenceColor }]}>
                  {site.confidenceLabel}
                </Text>
                {compactConfidence ? (
                  <Text style={styles.compactConfidenceSecondary}>{compactConfidence}</Text>
                ) : null}
              </View>
              <Text style={styles.compactTrustLine}>{trustLine}</Text>
              {compareCue ? (
                <Text style={styles.verdictMeta}>{compareCue}</Text>
              ) : null}
            </View>

            <View style={styles.ratingExplanationCard}>
              <Text style={styles.sectionTitle}>Rating factors</Text>
              <RatingFactorRows factors={ratingFactors} />
            </View>

            {site.offlineAssessment ? (
              <View style={styles.offlineAssessmentCard}>
                <Text style={styles.sectionTitle}>{site.offlineAssessment.title}</Text>
                <View style={styles.explanationList}>
                  {site.offlineAssessment.notes.slice(0, 2).map((note, index) => (
                    <View key={`${site.id}-offline-${index}`} style={styles.explanationRow}>
                      <View style={[styles.explanationBullet, styles.offlineBullet]} />
                      <Text style={styles.explanationText}>{note}</Text>
                    </View>
                  ))}
                </View>
              </View>
            ) : null}

            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>Why this camp</Text>
              <View style={styles.explanationList}>
                {defaultReasons.map((reason, index) => (
                  <View key={`${site.id}-default-reason-${index}`} style={styles.explanationRow}>
                    <View style={styles.explanationBullet} />
                    <Text style={styles.explanationText}>{reason}</Text>
                  </View>
                ))}
              </View>
            </View>

            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>Evidence quality</Text>
              <SectionRows rows={evidenceRows} />
            </View>

            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>Location / Latest Evidence</Text>
              <SectionRows rows={locationRows} />
            </View>

            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>Arrival / Overnight / Departure</Text>
              <SectionRows
                rows={[
                  { id: 'arrival', label: 'Arrival Risk', value: site.arrivalAssessment.label, tone: site.arrivalAssessment.tone },
                  { id: 'overnight', label: 'Overnight Suitability', value: site.overnightAssessment.label, tone: site.overnightAssessment.tone },
                  { id: 'departure', label: 'Departure Risk', value: site.departureAssessment.label, tone: site.departureAssessment.tone },
                ]}
              />
            </View>

            {comparisonVisible && comparison && comparison.entries.length >= 2 ? (
              <View style={styles.comparisonCard}>
                <Text style={styles.sectionTitle}>Nearby comparison</Text>
                <View style={styles.explanationList}>
                  {comparison.comparisonSummary.slice(0, 3).map((line, index) => (
                    <View key={`${site.id}-compare-summary-${index}`} style={styles.explanationRow}>
                      <View style={[styles.explanationBullet, styles.compareBullet]} />
                      <Text style={styles.explanationText}>{line}</Text>
                    </View>
                  ))}
                </View>
                <View style={styles.compareEntryList}>
                  {comparison.entries.slice(0, 3).map((entry) => (
                    <View
                      key={entry.siteId}
                      style={[
                        styles.compareEntry,
                        entry.siteId === site.id && styles.compareEntrySelected,
                      ]}
                    >
                      <View style={styles.compareEntryHeader}>
                        <Text style={styles.compareEntryTitle} numberOfLines={1}>
                          {entry.label}
                        </Text>
                        <Text style={styles.compareEntryScore}>{Math.round(entry.overallScore)}</Text>
                      </View>
                      <Text style={styles.compareEntryMeta} numberOfLines={2}>
                        {entry.categoryLabel} - {entry.quickVerdict}
                      </Text>
                      <View style={styles.compareMetricRow}>
                        <Text style={styles.compareMetric}>Night {Math.round(entry.overnightSuitabilityScore)}</Text>
                        <Text style={styles.compareMetric}>Access {ratingFromScore(entry.vehicleFitScore)}</Text>
                        <Text style={styles.compareMetric}>
                          {entry.routeDetourMiles != null
                            ? `${entry.routeDetourMiles.toFixed(1)} mi`
                            : 'On route'}
                        </Text>
                      </View>
                    </View>
                  ))}
                </View>
              </View>
            ) : null}

            <View style={styles.actionsFooter}>
              <ECSActionRow compact wrap>
                <ECSButton
                  label="Navigate Here"
                  onPress={onNavigateHere}
                  icon="navigate"
                  variant="primary"
                  size="compact"
                />
                <ECSButton
                  label={site.isSaved ? 'Saved Camp' : 'Save Camp'}
                  onPress={onSaveCamp}
                  icon="bookmark"
                  variant={site.isSaved ? 'active' : 'secondary'}
                  size="compact"
                />
                <ECSButton
                  label={comparisonVisible ? 'Comparing Nearby' : 'Compare Nearby'}
                  onPress={onCompareNearby}
                  icon="swap-horizontal"
                  variant={comparisonVisible ? 'active' : 'secondary'}
                  size="compact"
                />
                <ECSButton
                  label={site.wasUsedBefore ? 'Marked Used' : 'Mark Used'}
                  onPress={onMarkUsed}
                  icon="checkmark-circle"
                  variant={site.wasUsedBefore ? 'active' : 'tertiary'}
                  size="compact"
                />
                <ECSButton
                  label="Report Unusable"
                  onPress={onReportUnusable}
                  icon="warning"
                  variant="destructive"
                  size="compact"
                />
                <ECSButton
                  label="Dismiss"
                  onPress={onDismiss}
                  icon="close"
                  variant="tertiary"
                  size="compact"
                />
              </ECSActionRow>
            </View>
          </ScrollView>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  layer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 172,
    elevation: 172,
  },
  shell: {
    position: 'absolute',
    minHeight: 0,
    zIndex: 172,
    elevation: 172,
  },
  card: {
    flex: 1,
    minHeight: 0,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(196,138,44,0.32)',
    backgroundColor: 'rgba(8, 11, 14, 0.96)',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.22,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 12 },
    elevation: 14,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  headerTextWrap: {
    flex: 1,
    paddingRight: 12,
  },
  eyebrow: {
    ...TYPO.U2,
    color: TACTICAL.amber,
    fontSize: 10,
    letterSpacing: 1.8,
    marginBottom: 6,
  },
  title: {
    color: TACTICAL.text,
    fontSize: 21,
    fontWeight: '800',
    lineHeight: 24,
  },
  headerMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
  },
  ratingBadge: {
    minWidth: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  ratingBadgeText: {
    ...TYPO.U2,
    fontSize: 15,
    letterSpacing: 0,
    fontWeight: '900',
  },
  categoryBadge: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  categoryBadgeText: {
    ...TYPO.U2,
    fontSize: 9,
    letterSpacing: 1.3,
    fontWeight: '900',
  },
  confidenceText: {
    ...TYPO.U2,
    fontSize: 9,
    letterSpacing: 1.2,
    fontWeight: '800',
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  scroll: {
    flex: 1,
    minHeight: 0,
  },
  scrollContent: {
    padding: 16,
    gap: 12,
    paddingBottom: 28,
    flexGrow: 1,
  },
  verdictCard: {
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: 'rgba(196,138,44,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(196,138,44,0.24)',
  },
  verdictLabel: {
    ...TYPO.U2,
    color: TACTICAL.amber,
    fontSize: 9,
    letterSpacing: 1.5,
    marginBottom: 6,
  },
  verdictText: {
    color: TACTICAL.text,
    fontSize: 17,
    fontWeight: '800',
    lineHeight: 21,
  },
  ratingSummaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 9,
  },
  ratingSummaryGrade: {
    ...TYPO.U2,
    fontSize: 11,
    letterSpacing: 1.1,
    fontWeight: '900',
  },
  ratingSummaryScore: {
    color: TACTICAL.textMuted,
    fontSize: 11,
    lineHeight: 15,
  },
  compactConfidenceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  compactConfidencePrimary: {
    ...TYPO.U2,
    fontSize: 10,
    letterSpacing: 1.3,
    fontWeight: '900',
  },
  compactConfidenceSecondary: {
    color: TACTICAL.textMuted,
    fontSize: 11,
    lineHeight: 15,
  },
  compactTrustLine: {
    marginTop: 6,
    color: TACTICAL.textMuted,
    fontSize: 10,
    lineHeight: 14,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  verdictMeta: {
    marginTop: 6,
    color: TACTICAL.textMuted,
    fontSize: 11,
    lineHeight: 16,
  },
  ratingExplanationCard: {
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: 'rgba(102,187,106,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(102,187,106,0.18)',
  },
  offlineAssessmentCard: {
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: 'rgba(255,179,0,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,179,0,0.24)',
  },
  sectionCard: {
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  sectionTitle: {
    ...TYPO.U2,
    color: TACTICAL.text,
    fontSize: 10,
    letterSpacing: 1.5,
    marginBottom: 10,
  },
  sectionRows: {
    gap: 8,
  },
  ratingFactorList: {
    gap: 10,
  },
  ratingFactorRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  ratingFactorDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    marginTop: 6,
  },
  ratingFactorBody: {
    flex: 1,
    minWidth: 0,
  },
  ratingFactorHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
  },
  ratingFactorLabel: {
    flex: 1,
    color: TACTICAL.text,
    fontSize: 12,
    fontWeight: '800',
    lineHeight: 16,
  },
  ratingFactorValue: {
    fontSize: 11,
    fontWeight: '900',
    lineHeight: 16,
    textAlign: 'right',
  },
  ratingFactorDescription: {
    marginTop: 2,
    color: TACTICAL.textMuted,
    fontSize: 11,
    lineHeight: 15,
  },
  ratingFallbackText: {
    color: TACTICAL.text,
    fontSize: 12,
    lineHeight: 17,
  },
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  sectionRowLabel: {
    color: TACTICAL.textMuted,
    fontSize: 11,
    lineHeight: 15,
    flex: 0.92,
  },
  sectionRowValue: {
    color: TACTICAL.text,
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 15,
    textAlign: 'right',
    flex: 1.08,
  },
  explanationList: {
    gap: 9,
  },
  explanationRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  explanationBullet: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginTop: 6,
    backgroundColor: TACTICAL.amber,
  },
  offlineBullet: {
    backgroundColor: '#FFB300',
  },
  compareBullet: {
    backgroundColor: '#6EA8FF',
  },
  explanationText: {
    flex: 1,
    color: TACTICAL.text,
    fontSize: 12,
    lineHeight: 17,
  },
  comparisonCard: {
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: 'rgba(110,168,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(110,168,255,0.18)',
  },
  compareEntryList: {
    gap: 8,
    marginTop: 12,
  },
  compareEntry: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.04)',
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  compareEntrySelected: {
    borderColor: 'rgba(196,138,44,0.36)',
    backgroundColor: 'rgba(196,138,44,0.10)',
  },
  compareEntryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  compareEntryTitle: {
    flex: 1,
    color: TACTICAL.text,
    fontSize: 12,
    fontWeight: '800',
    lineHeight: 16,
  },
  compareEntryScore: {
    color: '#9FC1FF',
    fontSize: 12,
    fontWeight: '900',
    lineHeight: 16,
  },
  compareEntryMeta: {
    marginTop: 3,
    color: TACTICAL.textMuted,
    fontSize: 11,
    lineHeight: 15,
  },
  compareMetricRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 8,
  },
  compareMetric: {
    color: TACTICAL.text,
    fontSize: 10,
    lineHeight: 14,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  actionsFooter: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(8, 11, 14, 0.88)',
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
});
