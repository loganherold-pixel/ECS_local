import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { SafeIcon as Ionicons } from '../SafeIcon';
import { ReadinessDecisionBadge } from '../readiness';
import { readinessStatusLabel, readinessToneColor } from '../readiness/readinessUi';
import {
  useCurrentExpeditionReadiness,
  useExpeditionReadinessState,
  useReadinessBriefPayload,
  useReadinessConcerns,
  useReadinessDecision,
} from '../../lib/readiness';
import type { ExpeditionReadinessAssessment } from '../../lib/readiness/expeditionReadinessTypes';
import { TACTICAL, GOLD_RAIL } from '../../lib/theme';

type ECSIntelligenceReadoutProps = {
  hasRouteContext: boolean;
  isActiveExpedition: boolean;
  onOpenCommandBrief?: () => void;
};

type ReadoutModel = {
  statusLabel: string;
  score: number | null;
  title: string;
  message: string;
  toneColor: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  confidenceLine: string | null;
};

function cleanReadinessCopy(value: string | null | undefined, maxLength = 138): string {
  const normalized = String(value ?? '')
    .replace(/\blegal campsite\b/gi, 'Camp Legality Confidence')
    .replace(/\bsafe route\b/gi, 'route confidence')
    .replace(/\bsafe\b/gi, 'confidence-supported')
    .replace(/\bAI\b/g, 'ECS Intelligence')
    .replace(/\s+/g, ' ')
    .trim();

  if (!normalized) return '';
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, Math.max(36, maxLength - 1)).trimEnd()}…`;
}

function firstFreshnessConcern(assessment: ExpeditionReadinessAssessment): string | null {
  const records = Object.values(assessment.sourceFreshness);
  const stale = records.find((record) => record.isStale);
  if (stale) return `${stale.label} is stale`;
  const missing = records.find((record) => record.isMissing);
  if (missing) return `${missing.label} is missing`;
  const inferred = records.find((record) => record.isInferred);
  if (inferred) return `${inferred.label} is ECS-inferred`;
  return null;
}

function buildReadoutMessage(args: {
  assessment: ExpeditionReadinessAssessment | null;
  hasRouteContext: boolean;
  isActiveExpedition: boolean;
  readinessStateHasRoute: boolean;
  decisionLabel: string | null;
  topReason: string | null;
  freshnessConcern: string | null;
}): string {
  const {
    assessment,
    hasRouteContext,
    isActiveExpedition,
    readinessStateHasRoute,
    decisionLabel,
    topReason,
    freshnessConcern,
  } = args;
  const hasAnyRoute = hasRouteContext || readinessStateHasRoute || (assessment ? !assessment.sourceFreshness.route.isMissing : false);

  if (!hasAnyRoute) {
    return 'No active expedition. Select a route in Explore or Navigate to generate a Command Brief.';
  }

  if (!assessment || !decisionLabel) {
    return 'Readiness confidence is limited. Readiness assessment is not available yet. Open Command Brief to review.';
  }

  if (assessment.confidence === 'low' || freshnessConcern) {
    const reason = cleanReadinessCopy(freshnessConcern ?? topReason ?? 'One or more readiness inputs need review.');
    return `Readiness confidence is limited. ${reason}. Open Command Brief to review.`;
  }

  const reason = cleanReadinessCopy(topReason ?? assessment.explanation ?? 'No hard blockers are present.');
  if (isActiveExpedition) {
    return `Active Readiness is ${decisionLabel}. ${reason}`;
  }
  return `Planning Readiness is ${decisionLabel}. ${reason}. Open Command Brief before departure.`;
}

export default function ECSIntelligenceReadout({
  hasRouteContext,
  isActiveExpedition,
  onOpenCommandBrief,
}: ECSIntelligenceReadoutProps) {
  const assessment = useCurrentExpeditionReadiness();
  const readinessState = useExpeditionReadinessState();
  const decision = useReadinessDecision();
  const concerns = useReadinessConcerns(3);
  const briefPayload = useReadinessBriefPayload(3);

  const model = useMemo<ReadoutModel>(() => {
    const topIssue =
      briefPayload?.blockers[0]?.detail ??
      briefPayload?.warnings[0]?.detail ??
      concerns[0]?.summary ??
      briefPayload?.recommendations[0] ??
      assessment?.explanation ??
      null;
    const freshnessConcern = assessment ? firstFreshnessConcern(assessment) : null;
    const statusLabel = decision?.label ?? 'Awaiting';
    const toneColor = assessment ? readinessToneColor(assessment.status) : TACTICAL.textMuted;
    const message = buildReadoutMessage({
      assessment,
      hasRouteContext,
      isActiveExpedition: isActiveExpedition || readinessState.readinessMode === 'active',
      readinessStateHasRoute: Boolean(readinessState.activeRouteId || readinessState.activeTripId),
      decisionLabel: decision?.label ?? null,
      topReason: topIssue,
      freshnessConcern,
    });

    return {
      statusLabel,
      score: decision?.score ?? null,
      title: 'ECS Intelligence',
      message,
      toneColor,
      icon: assessment?.status === 'hold'
        ? 'hand-left-outline'
        : assessment?.status === 'caution'
          ? 'alert-circle-outline'
          : 'sparkles-outline',
      confidenceLine: assessment
        ? `Confidence ${assessment.confidence}${briefPayload?.isUsingDemoData ? ' / demo data marked' : ''}`
        : null,
    };
  }, [
    assessment,
    briefPayload?.blockers,
    briefPayload?.isUsingDemoData,
    briefPayload?.recommendations,
    briefPayload?.warnings,
    concerns,
    decision?.label,
    decision?.score,
    hasRouteContext,
    isActiveExpedition,
    readinessState.activeRouteId,
    readinessState.activeTripId,
    readinessState.readinessMode,
  ]);

  return (
    <Pressable
      style={styles.surface}
      onPress={onOpenCommandBrief}
      disabled={!onOpenCommandBrief}
      accessibilityRole={onOpenCommandBrief ? 'button' : undefined}
      accessibilityLabel={`${model.title}. ${model.message}`}
    >
      <View style={[styles.accentRail, { backgroundColor: model.toneColor }]} />
      <View style={styles.copyStack}>
        <View style={styles.headerRow}>
          <View style={styles.titleRow}>
            <Ionicons name={model.icon} size={14} color={model.toneColor} />
            <Text style={styles.title} numberOfLines={1}>
              {model.title}
            </Text>
          </View>
          {assessment ? (
            <ReadinessDecisionBadge status={assessment.status} score={model.score} compact />
          ) : (
            <View style={styles.awaitingBadge}>
              <Text style={styles.awaitingBadgeText}>AWAITING</Text>
            </View>
          )}
        </View>

        <Text style={styles.message} numberOfLines={3}>
          {model.message}
        </Text>

        <View style={styles.footerRow}>
          {model.confidenceLine ? (
            <Text style={styles.confidence} numberOfLines={1}>
              {model.confidenceLine}
            </Text>
          ) : (
            <Text style={styles.confidence} numberOfLines={1}>
              Readiness assessment pending
            </Text>
          )}
          <View style={styles.cta}>
            <Text style={styles.ctaText} numberOfLines={1}>
              Open Command Brief
            </Text>
            <Ionicons name="chevron-forward-outline" size={12} color={TACTICAL.amber} />
          </View>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  surface: {
    width: '100%',
    minHeight: 78,
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: GOLD_RAIL.section,
    borderRadius: 8,
    backgroundColor: TACTICAL.panel,
  },
  accentRail: {
    width: 3,
    borderRadius: 999,
  },
  copyStack: {
    flex: 1,
    minWidth: 0,
    gap: 7,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 0,
    flex: 1,
    gap: 6,
  },
  title: {
    flex: 1,
    minWidth: 0,
    color: TACTICAL.text,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.9,
    textTransform: 'uppercase',
  },
  message: {
    color: TACTICAL.text,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  confidence: {
    flex: 1,
    minWidth: 0,
    color: TACTICAL.textMuted,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.35,
    textTransform: 'uppercase',
  },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 0,
    gap: 4,
  },
  ctaText: {
    color: TACTICAL.amber,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  awaitingBadge: {
    borderWidth: 1,
    borderColor: GOLD_RAIL.subsection,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  awaitingBadgeText: {
    color: TACTICAL.textMuted,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.7,
  },
});
