import React from 'react';
import {
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
  onNavigateHere: () => void;
  onSaveCamp: () => void;
  onCompareNearby: () => void;
  onMarkUsed: () => void;
  onReportUnusable: () => void;
  onDismiss: () => void;
};

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
  if (site.confidenceBreakdown.vehicleFitConfidence.label === 'high') strongSignals.push('Vehicle fit high');
  if (site.confidenceBreakdown.routeConfidence.label === 'high') strongSignals.push('Route high');

  if (site.offlineAssessment?.weatherStale || site.confidenceBreakdown.weatherConfidence.label === 'low') {
    weakSignals.push('Weather stale');
  } else if (site.confidenceBreakdown.weatherConfidence.label === 'medium') {
    weakSignals.push('Weather medium');
  }

  if (site.offlineAssessment?.complianceConfidenceReduced || site.confidenceBreakdown.complianceConfidence.label === 'low') {
    weakSignals.push('Compliance uncertain');
  } else if (site.confidenceBreakdown.complianceConfidence.label === 'medium') {
    weakSignals.push('Compliance medium');
  }

  if (site.confidenceBreakdown.vehicleFitConfidence.label === 'low') {
    weakSignals.push('Vehicle fit limited');
  } else if (site.confidenceBreakdown.vehicleFitConfidence.label === 'medium') {
    weakSignals.push('Vehicle fit medium');
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
  switch (site.sourceType) {
    case 'verified':
      return 'Verified';
    case 'saved':
    case 'historical':
      return 'Cached';
    case 'route_candidate':
      return 'Route context';
    case 'fallback':
    case 'inferred':
      return 'Inferred';
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
      return 'Unavailable';
  }
}

function formatCampTrustLine(site: CampIntelSite): string {
  return [site.confidenceLabel, formatCampSourceBasis(site), formatCampMode(site)].join(' • ');
}

function buildDefaultReasons(site: CampIntelSite): string[] {
  const reasons: string[] = [];

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

export default function CampIntelDetailCard({
  visible,
  site,
  comparison,
  topOffset,
  bottomOffset,
  rightInset,
  maxWidth,
  onNavigateHere,
  onSaveCamp,
  onCompareNearby,
  onMarkUsed,
  onReportUnusable,
  onDismiss,
}: Props) {
  const [detailsExpanded, setDetailsExpanded] = React.useState(false);

  React.useEffect(() => {
    if (site?.id) {
      setDetailsExpanded(false);
    }
  }, [site?.id]);

  if (!visible || !site) return null;

  const confidenceColor = confidenceTone(site);
  const compactConfidence = formatConfidenceSignal(site);
  const trustLine = formatCampTrustLine(site);
  const defaultReasons = buildDefaultReasons(site);
  const compareCue = compactCompareCue(site, comparison) ?? site.trustNotes[0] ?? null;

  return (
    <View pointerEvents="box-none" style={styles.layer}>
      <View
        style={[
          styles.shell,
          {
            top: topOffset,
            bottom: bottomOffset,
            left: 10,
            right: rightInset,
            maxWidth: maxWidth ?? undefined,
          },
        ]}
      >
        <View style={styles.card}>
          <View style={styles.header}>
            <View style={styles.headerTextWrap}>
              <Text style={styles.eyebrow}>Camp Intel</Text>
              <Text style={styles.title} numberOfLines={2}>
                {site.label}
              </Text>
              <View style={styles.headerMetaRow}>
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
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.verdictCard}>
              <Text style={styles.verdictLabel}>Camp Verdict</Text>
              <Text style={styles.verdictText}>{site.quickVerdict}</Text>
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
              <Text style={styles.sectionTitle}>Arrival / Overnight / Departure</Text>
              <SectionRows
                rows={[
                  { id: 'arrival', label: 'Arrival Risk', value: site.arrivalAssessment.label, tone: site.arrivalAssessment.tone },
                  { id: 'overnight', label: 'Overnight Suitability', value: site.overnightAssessment.label, tone: site.overnightAssessment.tone },
                  { id: 'departure', label: 'Departure Risk', value: site.departureAssessment.label, tone: site.departureAssessment.tone },
                ]}
              />
            </View>

            <View style={styles.actionsCard}>
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
                  label="Compare Nearby"
                  onPress={onCompareNearby}
                  icon="swap-horizontal"
                  variant="secondary"
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

            <TouchableOpacity
              style={styles.expandToggle}
              onPress={() => setDetailsExpanded((value) => !value)}
              activeOpacity={0.82}
            >
              <Text style={styles.expandToggleText}>
                {detailsExpanded ? 'Hide detailed assessment' : 'Show detailed assessment'}
              </Text>
              <Ionicons
                name={detailsExpanded ? 'chevron-up' : 'chevron-down'}
                size={16}
                color={TACTICAL.amber}
              />
            </TouchableOpacity>

            {detailsExpanded ? (
              <>
                <View style={styles.sectionCard}>
                  <Text style={styles.sectionTitle}>Confidence breakdown</Text>
                  <SectionRows
                    rows={[
                      { id: 'overall_confidence', label: 'Overall confidence', value: site.confidenceLabel, tone: site.confidence === 'high' ? 'positive' : site.confidence === 'medium' ? 'caution' : 'warning' },
                      { id: 'terrain_confidence', label: 'Terrain confidence', value: `${site.confidenceBreakdown.terrainConfidence.label} (${site.confidenceBreakdown.terrainConfidence.score})`, tone: site.confidenceBreakdown.terrainConfidence.label === 'high' ? 'positive' : site.confidenceBreakdown.terrainConfidence.label === 'medium' ? 'caution' : 'warning' },
                      { id: 'access_confidence', label: 'Access confidence', value: `${site.confidenceBreakdown.accessConfidence.label} (${site.confidenceBreakdown.accessConfidence.score})`, tone: site.confidenceBreakdown.accessConfidence.label === 'high' ? 'positive' : site.confidenceBreakdown.accessConfidence.label === 'medium' ? 'caution' : 'warning' },
                      { id: 'compliance_confidence', label: 'Compliance confidence', value: `${site.confidenceBreakdown.complianceConfidence.label} (${site.confidenceBreakdown.complianceConfidence.score})`, tone: site.confidenceBreakdown.complianceConfidence.label === 'high' ? 'positive' : site.confidenceBreakdown.complianceConfidence.label === 'medium' ? 'caution' : 'warning' },
                      { id: 'weather_confidence', label: 'Weather freshness', value: `${site.confidenceBreakdown.weatherConfidence.label} (${site.confidenceBreakdown.weatherConfidence.score})`, tone: site.confidenceBreakdown.weatherConfidence.label === 'high' ? 'positive' : site.confidenceBreakdown.weatherConfidence.label === 'medium' ? 'caution' : 'warning' },
                      { id: 'vehicle_confidence', label: 'Vehicle-fit confidence', value: `${site.confidenceBreakdown.vehicleFitConfidence.label} (${site.confidenceBreakdown.vehicleFitConfidence.score})`, tone: site.confidenceBreakdown.vehicleFitConfidence.label === 'high' ? 'positive' : site.confidenceBreakdown.vehicleFitConfidence.label === 'medium' ? 'caution' : 'warning' },
                    ]}
                  />
                  {site.confidenceBreakdown.summaryNotes.length > 0 ? (
                    <View style={styles.noteList}>
                      {site.confidenceBreakdown.summaryNotes.slice(0, 3).map((note, index) => (
                        <View key={`${site.id}-confidence-note-${index}`} style={styles.explanationRow}>
                          <View style={styles.explanationBullet} />
                          <Text style={styles.explanationText}>{note}</Text>
                        </View>
                      ))}
                    </View>
                  ) : null}
                </View>

                <View style={styles.sectionCard}>
                  <Text style={styles.sectionTitle}>Vehicle-specific assessment</Text>
                  <SectionRows rows={site.vehicleAssessment} />
                </View>

                <View style={styles.sectionCard}>
                  <Text style={styles.sectionTitle}>Overnight outlook</Text>
                  <SectionRows rows={site.overnightOutlook} />
                </View>

                <View style={styles.sectionCard}>
                  <Text style={styles.sectionTitle}>Resource implications</Text>
                  <SectionRows rows={site.resourceImplications} />
                </View>

                <View style={styles.sectionCard}>
                  <Text style={styles.sectionTitle}>Why ECS suggested this</Text>
                  <View style={styles.explanationList}>
                    {site.explanationReasons.slice(0, 4).map((reason, index) => (
                      <View key={`${site.id}-reason-${index}`} style={styles.explanationRow}>
                        <View style={styles.explanationBullet} />
                        <Text style={styles.explanationText}>{reason}</Text>
                      </View>
                    ))}
                  </View>
                </View>

                {site.trustNotes.length > 0 ? (
                  <View style={styles.sectionCard}>
                    <Text style={styles.sectionTitle}>Trust notes</Text>
                    <View style={styles.explanationList}>
                      {site.trustNotes.slice(0, 3).map((note, index) => (
                        <View key={`${site.id}-trust-${index}`} style={styles.explanationRow}>
                          <View style={styles.explanationBullet} />
                          <Text style={styles.explanationText}>{note}</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                ) : null}

                {comparison && comparison.entries.length >= 2 ? (
                  <View style={styles.sectionCard}>
                    <Text style={styles.sectionTitle}>Compare camps</Text>
                    <View style={styles.explanationList}>
                      {comparison.comparisonSummary.slice(0, 2).map((line, index) => (
                        <View key={`${site.id}-compare-summary-${index}`} style={styles.explanationRow}>
                          <View style={[styles.explanationBullet, styles.compareBullet]} />
                          <Text style={styles.explanationText}>{line}</Text>
                        </View>
                      ))}
                    </View>
                    <View style={styles.compareHighlightsWrap}>
                      {comparison.compareHighlights.slice(0, 2).map((highlight) => (
                        <View key={highlight.id} style={styles.compareHighlightCard}>
                          <Text style={styles.compareHighlightLabel}>{highlight.label}</Text>
                          <Text style={styles.compareHighlightSummary}>{highlight.summary}</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                ) : null}
              </>
            ) : null}
          </ScrollView>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  layer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 132,
  },
  shell: {
    position: 'absolute',
  },
  card: {
    flex: 1,
    minHeight: 0,
    borderRadius: 18,
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
  },
  scrollContent: {
    padding: 16,
    gap: 12,
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
  noteList: {
    gap: 9,
    marginTop: 10,
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
  actionsCard: {
    paddingTop: 2,
    paddingBottom: 4,
  },
  expandToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(196,138,44,0.20)',
    backgroundColor: 'rgba(196,138,44,0.08)',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  expandToggleText: {
    color: TACTICAL.text,
    fontSize: 12,
    fontWeight: '700',
  },
  compareHighlightsWrap: {
    gap: 8,
    marginTop: 12,
  },
  compareHighlightCard: {
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: 'rgba(110,168,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(110,168,255,0.18)',
  },
  compareHighlightLabel: {
    ...TYPO.U2,
    color: '#9FC1FF',
    fontSize: 9,
    letterSpacing: 1.1,
    marginBottom: 4,
  },
  compareHighlightSummary: {
    color: TACTICAL.text,
    fontSize: 11,
    lineHeight: 16,
  },
});
