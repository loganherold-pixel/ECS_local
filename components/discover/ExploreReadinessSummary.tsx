import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { ECS, GOLD_RAIL, TACTICAL } from '../../lib/theme';
import type { ExpeditionReadinessAssessment } from '../../lib/readiness/expeditionReadinessTypes';
import type { ExploreRouteReadinessSummary } from '../../lib/readiness/exploreRouteReadiness';
import { ReadinessDecisionBadge } from '../readiness';
import { ECSBadge } from '../ECSStatus';
import { ECS_TEXT } from '../../lib/ecsTypographyTokens';

type ExploreReadinessSummaryProps = {
  assessment: ExpeditionReadinessAssessment;
  summary: ExploreRouteReadinessSummary;
  compact?: boolean;
};

export default function ExploreReadinessSummary({
  assessment,
  summary,
  compact = false,
}: ExploreReadinessSummaryProps) {
  return (
    <View style={[s.container, compact && s.containerCompact]}>
      <View style={s.headerRow}>
        <View style={s.headerCopy}>
          <Text style={s.kicker} numberOfLines={1}>READINESS</Text>
          <ReadinessDecisionBadge status={assessment.status} compact />
        </View>
        {summary.hasLimitedRouteData ? (
          <ECSBadge label="Limited confidence" tone="warning" compact />
        ) : null}
      </View>

      <View style={s.metricGrid}>
        <ReadinessMetric label="Route confidence" value={summary.routeConfidenceLabel} />
        <ReadinessMetric label="Vehicle fit" value={summary.vehicleFitLabel} />
        {summary.campConfidenceLabel ? (
          <ReadinessMetric label="Camp confidence" value={summary.campConfidenceLabel} />
        ) : null}
      </View>

      {summary.concern ? (
        <Text style={s.concernText} numberOfLines={compact ? 1 : 2}>
          Concern: {summary.concern}
        </Text>
      ) : null}
    </View>
  );
}

function ReadinessMetric({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.metricPill}>
      <Text style={s.metricLabel} numberOfLines={1}>{label}</Text>
      <Text style={s.metricValue} numberOfLines={1}>{value}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    gap: 7,
    paddingHorizontal: 9,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: GOLD_RAIL.internal,
    backgroundColor: ECS.bgElev,
  },
  containerCompact: {
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 7,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  headerCopy: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    minWidth: 0,
    flex: 1,
  },
  kicker: {
    ...ECS_TEXT.statLabel,
    color: TACTICAL.amber,
    fontSize: 7,
  },
  metricGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
  },
  metricPill: {
    flexGrow: 1,
    flexBasis: '30%',
    minWidth: 92,
    gap: 1,
    paddingHorizontal: 7,
    paddingVertical: 5,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: ECS.stroke,
    backgroundColor: ECS.bgPanel,
  },
  metricLabel: {
    ...ECS_TEXT.statLabel,
    color: TACTICAL.textMuted,
    fontSize: 7,
    letterSpacing: 0,
  },
  metricValue: {
    ...ECS_TEXT.chip,
    color: ECS.text,
    fontSize: 8,
    letterSpacing: 0,
  },
  concernText: {
    ...ECS_TEXT.helper,
    color: TACTICAL.textMuted,
    lineHeight: 14,
  },
});
