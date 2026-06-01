import React, { useMemo } from 'react';
import { View } from 'react-native';

import { buildExpeditionCompactStatusSummary } from '../../lib/expedition/compactStatusSummary';
import { useExpeditionAssessmentStore } from '../../stores/expeditionAssessmentStore';
import {
  WidgetCardShell,
  WidgetCompactRow,
  WidgetEmptyState,
  WidgetMetaLine,
  WidgetPrimaryValue,
  WidgetMicroStrip,
  type WidgetTone,
} from './WidgetChrome';

type ExpeditionStatusSummaryWidgetProps = {
  compact?: boolean;
};

function toneForSummary(tone: string): WidgetTone {
  switch (tone) {
    case 'good':
    case 'attention':
    case 'critical':
    case 'stale':
    case 'unavailable':
      return tone;
    default:
      return 'neutral';
  }
}

export function ExpeditionStatusSummaryWidget({
  compact: _compact,
}: ExpeditionStatusSummaryWidgetProps) {
  const assessmentStore = useExpeditionAssessmentStore();

  const summary = useMemo(
    () =>
      buildExpeditionCompactStatusSummary({
        contextSnapshot: assessmentStore.contextSnapshot,
        assessments: assessmentStore.assessments,
        usingMockData: assessmentStore.usingMockData,
        offline: assessmentStore.offline,
        stale: assessmentStore.stale,
      }),
    [
      assessmentStore.assessments,
      assessmentStore.contextSnapshot,
      assessmentStore.offline,
      assessmentStore.stale,
      assessmentStore.usingMockData,
    ],
  );

  if (!summary.available) {
    return (
      <WidgetCardShell
        badge={{ label: 'NO EXPEDITION', tone: 'unavailable' }}
        footer={<WidgetMetaLine text={summary.dataQualityLabel} tone="unavailable" />}
      >
        <WidgetEmptyState
          primary="No active expedition"
          secondary="Start navigation to load ECS expedition status."
        />
      </WidgetCardShell>
    );
  }

  const statusTone = toneForSummary(summary.statusTone);
  const qualityTone = toneForSummary(summary.dataQualityTone);
  const showReason = summary.status !== 'normal' && Boolean(summary.topReason);

  return (
    <WidgetCardShell
      badge={{ label: summary.statusLabel.toUpperCase(), tone: statusTone }}
      footer={<WidgetMetaLine text={summary.dataQualityLabel} tone={qualityTone} />}
    >
      <View style={{ flex: 1, minHeight: 0 }}>
        <WidgetPrimaryValue
          label="ECS EXPEDITION STATUS"
          value={summary.statusLabel}
          tone={statusTone}
        />
        <WidgetCompactRow
          title="TOP"
          summary={summary.topConcern}
          tone={showReason ? statusTone : 'neutral'}
        />
        {showReason ? (
          <WidgetCompactRow
            title="ACTION"
            summary={summary.nextRecommendedAction}
            tone="attention"
          />
        ) : (
          <WidgetCompactRow
            title="ACTION"
            summary={summary.nextRecommendedAction}
            tone="neutral"
          />
        )}
        <WidgetCompactRow
          title="NEXT"
          summary={summary.nextCheckpointOrCampEta}
          tone="neutral"
        />
        <WidgetMicroStrip
          items={[
            { label: 'Convoy', value: summary.convoyAccounted, tone: 'neutral' },
            { label: 'Resource', value: summary.limitingResource, tone: summary.limitingResource === 'No limiting resource' ? 'good' : 'attention' },
            { label: 'Vehicle', value: summary.limitingVehicle, tone: summary.limitingVehicle.includes('ready') || summary.limitingVehicle === 'No limiting vehicle' ? 'good' : 'attention' },
          ]}
        />
      </View>
    </WidgetCardShell>
  );
}

export default ExpeditionStatusSummaryWidget;
