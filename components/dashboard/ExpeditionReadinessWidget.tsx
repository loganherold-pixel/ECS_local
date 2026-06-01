import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { SafeIcon as Ionicons } from '../SafeIcon';
import { ReadinessDecisionBadge, ReadinessDetailSheet, ReadinessEducationCard, ReadinessScoreRing } from '../readiness';
import { readinessStatusLabel, readinessToneColor } from '../readiness/readinessUi';
import {
  useCurrentExpeditionReadiness,
  useExpeditionReadinessState,
  useReadinessBriefPayload,
  useReadinessConcerns,
} from '../../lib/readiness';
import type { ExpeditionReadinessAssessment } from '../../lib/readiness/expeditionReadinessTypes';
import { TACTICAL, GOLD_RAIL } from '../../lib/theme';

type ExpeditionReadinessWidgetProps = {
  compact?: boolean;
  width?: number | null;
  height?: number | null;
  onOpenBrief?: () => void;
};

function hasRouteContext(assessment: ExpeditionReadinessAssessment | null, activeRouteId: string | null, activeTripId: string | null): boolean {
  return Boolean(activeRouteId || activeTripId || (assessment && !assessment.sourceFreshness.route.isMissing));
}

function formatUpdatedAt(iso: string | null | undefined): string {
  if (!iso) return 'Not assessed';
  const parsed = Date.parse(iso);
  if (!Number.isFinite(parsed)) return 'Updated';
  const minutes = Math.max(0, Math.round((Date.now() - parsed) / 60000));
  if (minutes < 1) return 'Updated now';
  if (minutes < 60) return `Updated ${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `Updated ${hours}h ago`;
  return 'Updated over 24h ago';
}

function firstFreshnessLine(assessment: ExpeditionReadinessAssessment | null): string {
  if (!assessment) return 'Freshness pending';
  const records = Object.values(assessment.sourceFreshness);
  const stale = records.find((record) => record.isStale);
  if (stale) return `${stale.label} stale`;
  const missing = records.find((record) => record.isMissing);
  if (missing) return `${missing.label} missing`;
  const inferred = records.find((record) => record.isInferred);
  if (inferred) return `${inferred.label} ECS-inferred`;
  return formatUpdatedAt(assessment.updatedAt);
}

function cleanConcern(value: string | null | undefined): string {
  return String(value ?? '')
    .replace(/\blegal campsite\b/gi, 'Camp Legality Confidence')
    .replace(/\bsafe route\b/gi, 'route confidence')
    .replace(/\bsafe\b/gi, 'confidence-supported')
    .replace(/\s+/g, ' ')
    .trim();
}

export default function ExpeditionReadinessWidget({
  compact = false,
  width,
  height,
  onOpenBrief,
}: ExpeditionReadinessWidgetProps) {
  const [detailVisible, setDetailVisible] = useState(false);
  const assessment = useCurrentExpeditionReadiness();
  const readinessState = useExpeditionReadinessState();
  const concerns = useReadinessConcerns(1);
  const briefPayload = useReadinessBriefPayload(1);
  const hasRoute = hasRouteContext(assessment, readinessState.activeRouteId, readinessState.activeTripId);
  const isWide = (width ?? 0) >= 270 && !compact;
  const isShort = (height ?? 0) > 0 && (height ?? 0) < 170;
  const showEducation = !isShort && !compact && ((height ?? 0) === 0 || (height ?? 0) >= 210);

  const model = useMemo(() => {
    if (!hasRoute) {
      return {
        score: null,
        statusLabel: 'No Expedition',
        tone: TACTICAL.textMuted,
        concern: 'Generate a Command Brief from Explore or Navigate.',
        freshness: 'No active expedition',
      };
    }

    if (!assessment) {
      return {
        score: null,
        statusLabel: 'Limited',
        tone: TACTICAL.textMuted,
        concern: 'Readiness assessment is pending.',
        freshness: 'Freshness pending',
      };
    }

    const topConcern =
      briefPayload?.blockers[0]?.detail ??
      briefPayload?.warnings[0]?.detail ??
      concerns[0]?.summary ??
      briefPayload?.recommendations[0] ??
      assessment.explanation;

    return {
      score: assessment.overallScore,
      statusLabel: readinessStatusLabel(assessment.status),
      tone: readinessToneColor(assessment.status),
      concern: cleanConcern(topConcern),
      freshness: firstFreshnessLine(assessment),
    };
  }, [
    assessment,
    briefPayload?.blockers,
    briefPayload?.recommendations,
    briefPayload?.warnings,
    concerns,
    hasRoute,
  ]);

  const handleWidgetPress = () => {
    if (assessment && hasRoute) {
      setDetailVisible(true);
      return;
    }
    onOpenBrief?.();
  };

  return (
    <>
      <TouchableOpacity
        style={[styles.root, isWide && styles.rootWide, isShort && styles.rootShort]}
        activeOpacity={0.86}
        onPress={handleWidgetPress}
        accessibilityRole="button"
        accessibilityLabel={`Expedition Readiness. ${model.statusLabel}. ${model.concern}`}
      >
        <View style={styles.topRow}>
          {assessment && hasRoute ? (
            <ReadinessScoreRing
              score={assessment.overallScore}
              status={assessment.status}
              size={isShort ? 48 : 56}
              strokeWidth={5}
              compact
              onPress={() => setDetailVisible(true)}
            />
          ) : (
            <View style={[styles.emptyIcon, { borderColor: model.tone }]}>
              <Ionicons name="trail-sign-outline" size={20} color={model.tone} />
            </View>
          )}

          <View style={styles.titleStack}>
            <Text style={styles.eyebrow} numberOfLines={1}>
              Expedition Readiness
            </Text>
            {assessment && hasRoute ? (
              <ReadinessDecisionBadge status={assessment.status} score={isWide ? assessment.overallScore : undefined} compact />
            ) : (
              <Text style={[styles.statusText, { color: model.tone }]} numberOfLines={1}>
                {model.statusLabel}
              </Text>
            )}
          </View>
        </View>

        <Text style={[styles.concern, isWide && styles.concernWide]} numberOfLines={isWide ? 2 : 3}>
          {model.concern}
        </Text>

        {showEducation ? (
          <ReadinessEducationCard
            surface="dashboardReadinessWidget"
            compact
            showStatusLegend={false}
            style={styles.education}
          />
        ) : null}

        <View style={styles.footerRow}>
          <Text style={styles.freshness} numberOfLines={1}>
            {model.freshness}
          </Text>
          <Pressable
            style={styles.cta}
            onPress={onOpenBrief}
            disabled={!onOpenBrief}
            accessibilityRole={onOpenBrief ? 'button' : undefined}
          >
            <Text style={styles.ctaText} numberOfLines={1}>
              Open Brief
            </Text>
            <Ionicons name="chevron-forward-outline" size={11} color={TACTICAL.amber} />
          </Pressable>
        </View>
      </TouchableOpacity>
      <ReadinessDetailSheet
        visible={detailVisible}
        assessment={assessment}
        onClose={() => setDetailVisible(false)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    minHeight: 0,
    gap: 8,
    justifyContent: 'space-between',
  },
  rootWide: {
    gap: 9,
  },
  rootShort: {
    gap: 6,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    minWidth: 0,
  },
  titleStack: {
    flex: 1,
    minWidth: 0,
    gap: 5,
  },
  eyebrow: {
    color: TACTICAL.text,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.75,
    textTransform: 'uppercase',
  },
  statusText: {
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0.4,
  },
  concern: {
    color: TACTICAL.text,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600',
  },
  concernWide: {
    fontSize: 13,
    lineHeight: 17,
  },
  education: {
    flexShrink: 1,
  },
  footerRow: {
    minHeight: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: GOLD_RAIL.internal,
    paddingTop: 6,
  },
  freshness: {
    flex: 1,
    minWidth: 0,
    color: TACTICAL.textMuted,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.35,
    textTransform: 'uppercase',
  },
  cta: {
    flexShrink: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  ctaText: {
    color: TACTICAL.amber,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.45,
    textTransform: 'uppercase',
  },
  emptyIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.025)',
  },
});
