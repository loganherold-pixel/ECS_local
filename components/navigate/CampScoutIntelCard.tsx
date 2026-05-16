import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { SafeIcon as Ionicons } from '../SafeIcon';
import { TACTICAL, TYPO } from '../../lib/theme';
import type { CampScoutCandidate, CampScoutSourceType } from '../../lib/campScout';
import type { CampOpsCampIntelViewModel } from '../../lib/campops/campOpsCampIntelViewModel';

type Props = {
  visible: boolean;
  candidate: CampScoutCandidate | null;
  topOffset: number;
  bottomOffset: number;
  maxWidth?: number;
  navigateSafe: boolean;
  saveSupported?: boolean;
  feedbackSupported?: boolean;
  campOpsDetail?: CampOpsCampIntelViewModel | null;
  onNavigateHere: () => void;
  onSaveCandidate: () => void;
  onReportNotViable: () => void;
  onCompareNearby?: () => void;
  onMarkUsed?: () => void;
  onDismiss: () => void;
};

const WEB_SCROLL_CONTAINMENT_STYLE =
  Platform.OS === 'web'
    ? ({
        overscrollBehavior: 'contain',
        touchAction: 'pan-y',
      } as any)
    : null;

function sourceLabel(sourceType: CampScoutSourceType): string {
  switch (sourceType) {
    case 'official_mapped':
      return 'Official Mapped';
    case 'community_suggested':
      return 'Community Suggested';
    case 'imported_route_context':
      return 'Imported Route Context';
    case 'ecs_inferred':
      return 'ECS-Inferred';
    default:
      return 'Unknown Source';
  }
}

function sourceDescription(sourceType: CampScoutSourceType): string {
  switch (sourceType) {
    case 'ecs_inferred':
      return 'ECS-Inferred candidate scouting location. Dispersed camping may be allowed based on available signals; verify locally before relying on it.';
    case 'official_mapped':
      return 'This location appears in mapped campground/POI data. Verify availability, fees, and access.';
    case 'community_suggested':
      return 'This location was suggested by the community and passed ECS confidence filters. Verify conditions before relying on it.';
    case 'imported_route_context':
      return 'This location came from imported route context and passed Camp Scout confidence filters. Verify current rules and access.';
    default:
      return 'Source coverage is limited for this candidate. Verify local rules, access, and conditions.';
  }
}

const ECS_INFERRED_VERIFICATION_WARNING =
  'This is an ECS-inferred candidate, not a confirmed legal campsite. Verify local rules, closures, fire restrictions, permits, road access, and posted signs before camping.';

function gradeColor(grade: CampScoutCandidate['confidenceGrade']): string {
  switch (grade) {
    case 'A':
      return '#66BB6A';
    case 'B':
      return TACTICAL.amber;
    case 'C':
      return '#FFB300';
    default:
      return '#EF5350';
  }
}

function formatScore(value: number | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'Unknown';
  return `${Math.round(value)}/100`;
}

function cautionBadges(candidate: CampScoutCandidate): string[] {
  const badges = [
    candidate.accessConfidence < 65 ? 'Access uncertain' : null,
    candidate.legalityConfidence < 75 ? 'Legal status uncertain' : null,
    typeof candidate.terrainConfidence === 'number' && candidate.terrainConfidence < 75
      ? 'Terrain confidence moderate'
      : null,
    candidate.seasonalRiskPossible || (candidate.environmentalRiskScore ?? 0) >= 35
      ? 'Seasonal risk possible'
      : null,
    candidate.isMapDataStale || (candidate.mapDataCompleteness ?? 100) < 70
      ? 'Low data coverage'
      : null,
    candidate.offlineEstimate ? 'Offline estimate' : null,
  ].filter((badge): badge is string => !!badge);

  return badges.filter((badge, index) => badges.indexOf(badge) === index);
}

export default function CampScoutIntelCard({
  visible,
  candidate,
  topOffset,
  bottomOffset,
  maxWidth,
  navigateSafe,
  saveSupported = true,
  feedbackSupported = false,
  campOpsDetail = null,
  onNavigateHere,
  onSaveCandidate,
  onReportNotViable,
  onCompareNearby,
  onMarkUsed,
  onDismiss,
}: Props) {
  const hasContent = visible && (!!candidate || !!campOpsDetail);
  const [rendered, setRendered] = useState(hasContent);
  const [renderedCandidate, setRenderedCandidate] = useState(candidate);
  const [renderedCampOpsDetail, setRenderedCampOpsDetail] = useState(campOpsDetail);
  const opacity = useRef(new Animated.Value(hasContent ? 1 : 0)).current;

  useEffect(() => {
    if (candidate) setRenderedCandidate(candidate);
    if (campOpsDetail) setRenderedCampOpsDetail(campOpsDetail);
  }, [campOpsDetail, candidate]);

  useEffect(() => {
    if (hasContent) {
      setRendered(true);
      Animated.timing(opacity, {
        toValue: 1,
        duration: 160,
        useNativeDriver: true,
      }).start();
      return;
    }

    Animated.timing(opacity, {
      toValue: 0,
      duration: 130,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) {
        setRendered(false);
        setRenderedCandidate(null);
        setRenderedCampOpsDetail(null);
      }
    });
  }, [hasContent, opacity]);

  const activeCandidate = candidate ?? renderedCandidate;
  const activeCampOpsDetail = campOpsDetail ?? renderedCampOpsDetail;
  const isCampOps = !!activeCampOpsDetail;
  const isEligibilityCandidate = !!activeCandidate?.isEcsInferredEligibilityCandidate;

  if (!rendered || (!activeCandidate && !activeCampOpsDetail)) return null;

  const color = activeCandidate ? gradeColor(activeCandidate.confidenceGrade) : TACTICAL.amber;
  const reasons = activeCandidate?.reasons.slice(0, 4) ?? [];
  const cautions = activeCandidate?.cautions.slice(0, 4) ?? [];
  const badges = activeCandidate ? cautionBadges(activeCandidate) : [];
  const title = isEligibilityCandidate
    ? 'ECS-Inferred Camp Candidate'
    : activeCampOpsDetail?.title ?? activeCandidate?.title ?? 'Camp candidate';
  const subtitle =
    activeCampOpsDetail?.statusLabel ??
    (activeCandidate ? sourceLabel(activeCandidate.sourceType) : 'ECS-Inferred Camp Candidate');
  const scoreValue =
    activeCampOpsDetail?.overallScore ??
    (activeCandidate ? String(Math.round(activeCandidate.confidenceScore)) : 'Needs verification');

  return (
    <Animated.View pointerEvents="box-none" style={[styles.layer, { opacity }]}>
      <Animated.View
        style={[
          styles.shell,
          {
            top: topOffset,
            bottom: bottomOffset,
            left: 12,
            right: 12,
            maxWidth: maxWidth ?? undefined,
          },
        ]}
        pointerEvents="auto"
      >
        <View style={styles.card}>
          <View style={styles.header}>
            <View style={styles.headerTextWrap}>
              <Text style={styles.eyebrow}>{isCampOps ? 'CAMP INTEL' : 'CAMP SCOUT'}</Text>
              <Text style={styles.title} numberOfLines={1}>
                {title}
              </Text>
              <Text style={styles.subtitle} numberOfLines={1}>
                {subtitle}
              </Text>
              {activeCampOpsDetail?.campName && activeCampOpsDetail.campName !== title ? (
                <Text style={styles.subtitle} numberOfLines={1}>
                  {activeCampOpsDetail.campName}
                </Text>
              ) : null}
            </View>
            <View style={[styles.gradeBadge, { borderColor: color, backgroundColor: `${color}20` }]}>
              <Text style={[styles.gradeText, { color }]}>{isCampOps ? 'ECS' : activeCandidate?.confidenceGrade}</Text>
              <Text style={styles.scoreText}>{scoreValue}</Text>
            </View>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={onDismiss}
              activeOpacity={0.78}
              accessibilityRole="button"
              accessibilityLabel={isCampOps ? 'Dismiss Camp Intel popup' : 'Dismiss Camp Scout candidate'}
            >
              <Ionicons name="close" size={16} color={TACTICAL.textMuted} />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={[styles.scroll, WEB_SCROLL_CONTAINMENT_STYLE]}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            nestedScrollEnabled
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.sourceNotice}>
              <Text style={styles.sourceNoticeText}>
                {activeCampOpsDetail
                  ? `${activeCampOpsDetail.sourceConfidence}. ${activeCampOpsDetail.rationale}`
                  : activeCandidate
                    ? sourceDescription(activeCandidate.sourceType)
                    : 'Needs verification before relying on this camp candidate.'}
              </Text>
              {badges.length > 0 ? (
                <View style={styles.badgeRow}>
                  {badges.map((badge) => (
                    <View key={badge} style={styles.cautionBadge}>
                      <Text style={styles.cautionBadgeText}>{badge}</Text>
                    </View>
                  ))}
                </View>
              ) : null}
            </View>

            {activeCampOpsDetail ? (
              <View style={styles.campOpsMetricGrid}>
                <View style={styles.metricTileWide}>
                  <Text style={styles.metricLabel}>Overall suitability score</Text>
                  <Text style={styles.metricValue}>{activeCampOpsDetail.overallScore}</Text>
                </View>
                {activeCampOpsDetail.metrics.map((metric) => (
                  <View key={metric.label} style={styles.metricTileWide}>
                    <Text style={styles.metricLabel}>{metric.label}</Text>
                    <Text style={styles.metricValue}>{metric.value}</Text>
                    {metric.detail ? <Text style={styles.metricDetail}>{metric.detail}</Text> : null}
                  </View>
                ))}
              </View>
            ) : activeCandidate ? (
              <View style={styles.metricGrid}>
                <View style={styles.metricTile}>
                  <Text style={styles.metricLabel}>Access</Text>
                  <Text style={styles.metricValue}>{formatScore(activeCandidate.accessConfidence)}</Text>
                </View>
                <View style={styles.metricTile}>
                  <Text style={styles.metricLabel}>
                    {isEligibilityCandidate ? 'Eligibility' : 'Remoteness'}
                  </Text>
                  <Text style={styles.metricValue}>{formatScore(activeCandidate.remotenessScore)}</Text>
                </View>
                <View style={styles.metricTile}>
                  <Text style={styles.metricLabel}>
                    {isEligibilityCandidate ? 'Suitability' : 'Legality'}
                  </Text>
                  <Text style={styles.metricValue}>{formatScore(activeCandidate.legalityConfidence)}</Text>
                </View>
              </View>
            ) : null}

            {isEligibilityCandidate && activeCandidate ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Eligibility / access basis</Text>
                <Text style={styles.bodyLine}>
                  Eligibility confidence: {String(activeCandidate.eligibilityConfidence ?? 'verify').toUpperCase()}
                </Text>
                <Text style={styles.bodyLine}>
                  Land manager: {activeCandidate.landManager ?? 'Unknown'}
                </Text>
                {(activeCandidate.accessBasis ?? activeCandidate.sourceNotes ?? []).slice(0, 3).map((basis) => (
                  <Text key={basis} style={styles.bodyLine}>
                    {basis}
                  </Text>
                ))}
              </View>
            ) : null}

            {isEligibilityCandidate && activeCandidate?.terrainBasis?.length ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Terrain basis</Text>
                {activeCandidate.terrainBasis.slice(0, 2).map((basis) => (
                  <Text key={basis} style={styles.bodyLine}>
                    {basis}
                  </Text>
                ))}
              </View>
            ) : null}

            {reasons.length > 0 ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Why selected</Text>
                {reasons.map((reason) => (
                  <Text key={reason} style={styles.bodyLine}>
                    {reason}
                  </Text>
                ))}
              </View>
            ) : null}

            {cautions.length > 0 ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>
                  {isEligibilityCandidate ? 'Restrictions / caveats' : 'Cautions'}
                </Text>
                {cautions.map((caution) => (
                  <Text key={caution} style={styles.cautionLine}>
                    {caution}
                  </Text>
                ))}
              </View>
            ) : null}

            {isEligibilityCandidate ? (
              <View style={styles.verificationWarning}>
                <Ionicons name="warning-outline" size={14} color={TACTICAL.amber} />
                <Text style={styles.verificationWarningText}>
                  {activeCandidate?.verificationWarning ?? ECS_INFERRED_VERIFICATION_WARNING}
                </Text>
              </View>
            ) : null}

            {activeCampOpsDetail?.uncertaintyNotes.length ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Known uncertainty / verification note</Text>
                {activeCampOpsDetail.uncertaintyNotes.map((note) => (
                  <Text key={note} style={styles.cautionLine}>
                    {note}
                  </Text>
                ))}
              </View>
            ) : null}
          </ScrollView>

          <View style={styles.actions}>
            <TouchableOpacity
              style={styles.secondaryAction}
              onPress={onDismiss}
              activeOpacity={0.82}
              accessibilityRole="button"
              accessibilityLabel="Dismiss Camp Intel popup"
            >
              <Text style={styles.secondaryActionText}>DISMISS</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.primaryAction, !navigateSafe && styles.actionDisabled]}
              onPress={onNavigateHere}
              disabled={!navigateSafe}
              activeOpacity={0.82}
              accessibilityRole="button"
              accessibilityLabel={isCampOps ? 'Navigate to CampOps camp candidate' : 'Navigate to Camp Scout candidate'}
            >
              <Text style={styles.primaryActionText}>NAVIGATE HERE</Text>
            </TouchableOpacity>
            {saveSupported ? (
              <TouchableOpacity
                style={styles.secondaryAction}
                onPress={onSaveCandidate}
                activeOpacity={0.82}
                accessibilityRole="button"
                accessibilityLabel={isCampOps ? 'Save CampOps camp candidate' : 'Save Camp Scout candidate'}
              >
                <Text style={styles.secondaryActionText}>SAVE CAMP</Text>
              </TouchableOpacity>
            ) : null}
            {isCampOps ? (
              <>
                <TouchableOpacity
                  style={styles.secondaryAction}
                  onPress={onCompareNearby}
                  activeOpacity={0.82}
                  accessibilityRole="button"
                  accessibilityLabel="Compare nearby CampOps candidates"
                >
                  <Text style={styles.secondaryActionText}>COMPARE NEARBY</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.secondaryAction}
                  onPress={onMarkUsed}
                  activeOpacity={0.82}
                  accessibilityRole="button"
                  accessibilityLabel="Mark CampOps camp candidate used"
                >
                  <Text style={styles.secondaryActionText}>MARK USED</Text>
                </TouchableOpacity>
              </>
            ) : null}
            {feedbackSupported ? (
              <TouchableOpacity
                style={styles.secondaryAction}
                onPress={onReportNotViable}
                activeOpacity={0.82}
                accessibilityRole="button"
                accessibilityLabel={isCampOps ? 'Report CampOps camp candidate unusable' : 'Report Camp Scout candidate issue'}
              >
                <Text style={styles.secondaryActionText}>{isCampOps ? 'REPORT UNUSABLE' : 'NOT VIABLE'}</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  layer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 181,
    elevation: 181,
  },
  shell: {
    position: 'absolute',
    minHeight: 0,
    zIndex: 181,
    elevation: 181,
  },
  card: {
    flex: 1,
    minHeight: 0,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(196,138,44,0.32)',
    backgroundColor: 'rgba(8, 11, 14, 0.96)',
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 10,
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  headerTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  eyebrow: {
    ...TYPO.U2,
    color: TACTICAL.amber,
    fontSize: 9,
    letterSpacing: 1.4,
  },
  title: {
    ...TYPO.T2,
    color: TACTICAL.text,
    fontSize: 15,
    marginTop: 3,
  },
  subtitle: {
    ...TYPO.B2,
    color: TACTICAL.textMuted,
    fontSize: 10,
    marginTop: 2,
  },
  gradeBadge: {
    minWidth: 44,
    minHeight: 40,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gradeText: {
    ...TYPO.U1,
    fontSize: 15,
    letterSpacing: 0,
  },
  scoreText: {
    ...TYPO.U2,
    color: TACTICAL.textMuted,
    fontSize: 8,
    letterSpacing: 0,
  },
  closeButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  scroll: {
    flex: 1,
    minHeight: 0,
  },
  scrollContent: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 12,
  },
  metricGrid: {
    flexDirection: 'row',
    gap: 8,
  },
  campOpsMetricGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  sourceNotice: {
    gap: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(196,138,44,0.22)',
    backgroundColor: 'rgba(196,138,44,0.07)',
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  sourceNoticeText: {
    ...TYPO.B2,
    color: TACTICAL.text,
    fontSize: 11,
    lineHeight: 16,
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  cautionBadge: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,202,90,0.24)',
    backgroundColor: 'rgba(255,202,90,0.08)',
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  cautionBadgeText: {
    ...TYPO.U2,
    color: '#FFCA5A',
    fontSize: 8,
    letterSpacing: 0.5,
  },
  metricTile: {
    flex: 1,
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.04)',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  metricTileWide: {
    width: '48%',
    minWidth: 132,
    flexGrow: 1,
    minHeight: 58,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.04)',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  metricLabel: {
    ...TYPO.U2,
    color: TACTICAL.textMuted,
    fontSize: 8,
    letterSpacing: 0.9,
  },
  metricValue: {
    ...TYPO.T3,
    color: TACTICAL.text,
    fontSize: 13,
    marginTop: 4,
  },
  metricDetail: {
    ...TYPO.B2,
    color: TACTICAL.textMuted,
    fontSize: 9,
    lineHeight: 13,
    marginTop: 3,
  },
  section: {
    gap: 6,
  },
  sectionTitle: {
    ...TYPO.U2,
    color: TACTICAL.amber,
    fontSize: 9,
    letterSpacing: 1.2,
  },
  bodyLine: {
    ...TYPO.B2,
    color: TACTICAL.text,
    fontSize: 11,
    lineHeight: 16,
  },
  cautionLine: {
    ...TYPO.B2,
    color: '#FFCA5A',
    fontSize: 11,
    lineHeight: 16,
  },
  verificationWarning: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(242,194,77,0.32)',
    backgroundColor: 'rgba(242,194,77,0.08)',
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  verificationWarningText: {
    ...TYPO.B2,
    flex: 1,
    minWidth: 0,
    color: TACTICAL.text,
    fontSize: 10,
    lineHeight: 15,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
  },
  primaryAction: {
    minHeight: 38,
    flexGrow: 1,
    borderRadius: 12,
    backgroundColor: TACTICAL.amber,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  primaryActionText: {
    ...TYPO.U2,
    color: '#091014',
    fontSize: 8.5,
    letterSpacing: 1,
  },
  secondaryAction: {
    minHeight: 38,
    flexGrow: 1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(196,138,44,0.24)',
    backgroundColor: 'rgba(196,138,44,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  secondaryActionText: {
    ...TYPO.U2,
    color: TACTICAL.amber,
    fontSize: 8,
    letterSpacing: 0.9,
  },
  actionDisabled: {
    opacity: 0.42,
  },
});
