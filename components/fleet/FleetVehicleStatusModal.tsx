import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import ECSModalShell from '../ECSModalShell';
import { SafeIcon as Ionicons } from '../SafeIcon';
import { ECSBadge } from '../ECSStatus';
import type { FleetConfidenceNotice } from '../../lib/fleet/fleetOverviewStatus';
import { ECS_STATUS } from '../../lib/ecsStatusTokens';
import { ECS_TEXT } from '../../lib/ecsTypographyTokens';
import { TACTICAL } from '../../lib/theme';

export type FleetVehicleStatusKind = 'readiness' | 'confidence';

export type FleetVehicleStatusModalProps = {
  kind: FleetVehicleStatusKind;
  visible: boolean;
  notice: FleetConfidenceNotice;
  vehicleName: string;
  maxWidth: number;
  topClearance: number;
  bottomClearance: number;
  onClose: () => void;
};

const MAX_VISIBLE_STATUS_ITEMS = 4;

const STATUS_COPY: Record<FleetVehicleStatusKind, {
  title: string;
  scoreEyebrow: string;
  improvementTitle: string;
}> = {
  readiness: {
    title: 'Vehicle Readiness',
    scoreEyebrow: 'VEHICLE READINESS',
    improvementTitle: 'To Improve Readiness',
  },
  confidence: {
    title: 'Vehicle Confidence',
    scoreEyebrow: 'VEHICLE CONFIDENCE',
    improvementTitle: 'To Improve Confidence',
  },
};

export function FleetVehicleStatusModal({
  kind,
  visible,
  notice,
  vehicleName,
  maxWidth,
  topClearance,
  bottomClearance,
  onClose,
}: FleetVehicleStatusModalProps) {
  const copy = STATUS_COPY[kind];
  const visibleReasons = (notice.priorityReasons?.length ? notice.priorityReasons : notice.reasons)
    .slice(0, MAX_VISIBLE_STATUS_ITEMS);
  const visibleImprovements = notice.improvements.slice(0, MAX_VISIBLE_STATUS_ITEMS);

  return (
    <ECSModalShell
      visible={visible}
      onClose={onClose}
      title={copy.title}
      subtitle={vehicleName}
      eyebrow="VEHICLE COMMAND CENTER"
      icon="shield-checkmark-outline"
      overlayClass="info"
      maxWidth={maxWidth}
      maxHeightFraction={0.94}
      topClearanceOverride={topClearance}
      bottomClearanceOverride={bottomClearance}
      scrollable
      showHandle={false}
      bodyStyle={styles.modalBody}
      contentContainerStyle={styles.modalContent}
    >
      <View style={styles.stack} testID={`fleet-vehicle-${kind}-detail`}>
        <View
          style={styles.scoreBand}
          accessible
          accessibilityLabel={`${copy.scoreEyebrow.toLowerCase()} is ${notice.scoreLabel}`}
        >
          <View>
            <Text style={styles.eyebrow}>{copy.scoreEyebrow}</Text>
            <Text style={styles.score}>{notice.scoreLabel}</Text>
          </View>
          <ECSBadge
            label={notice.score == null ? 'WAITING' : notice.score >= 88 ? 'STRONG' : 'ESTIMATED'}
            tone={notice.score != null && notice.score >= 88 ? 'ready' : 'warning'}
            compact
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.title}>{notice.title}</Text>
          <Text style={styles.copy}>{notice.summary}</Text>
        </View>

        {notice.intelligenceSummary || notice.intelligenceDetail ? (
          <View style={styles.intelligenceBand}>
            <View style={styles.intelligenceHeader}>
              <Text style={styles.sectionTitle}>ECS Intelligence</Text>
              {notice.intelligenceConfidenceLabel ? (
                <ECSBadge label={notice.intelligenceConfidenceLabel} tone="ready" compact />
              ) : null}
            </View>
            {notice.intelligenceSummary ? <Text style={styles.copy}>{notice.intelligenceSummary}</Text> : null}
            {notice.intelligenceDetail ? <Text style={styles.copy}>{notice.intelligenceDetail}</Text> : null}
          </View>
        ) : null}

        <View style={styles.columns}>
          <View
            style={[styles.section, styles.column]}
            testID={`fleet-vehicle-${kind}-reasons`}
          >
            <Text style={styles.sectionTitle}>Key Score Drivers</Text>
            {visibleReasons.map((reason, index) => (
              <View
                key={reason}
                style={styles.row}
                testID={`fleet-vehicle-${kind}-reason-${index}`}
              >
                <Ionicons name="ellipse" size={6} color={TACTICAL.amber} />
                <Text style={styles.copy}>{reason}</Text>
              </View>
            ))}
          </View>

          <View
            style={[styles.section, styles.column]}
            testID={`fleet-vehicle-${kind}-improvements`}
          >
            <Text style={styles.sectionTitle}>{copy.improvementTitle}</Text>
            {visibleImprovements.map((action, index) => (
              <View
                key={action}
                style={styles.row}
                testID={`fleet-vehicle-${kind}-improvement-${index}`}
              >
                <Ionicons name="arrow-up-circle-outline" size={14} color={ECS_STATUS.tone.ready.text} />
                <Text style={styles.copy}>{action}</Text>
              </View>
            ))}
          </View>
        </View>
      </View>
    </ECSModalShell>
  );
}

const styles = StyleSheet.create({
  modalBody: {
    flexGrow: 0,
    flexShrink: 1,
    flexBasis: 'auto',
    minHeight: 0,
  },
  modalContent: {
    flexGrow: 0,
    paddingBottom: 0,
  },
  stack: {
    gap: 12,
    minHeight: 0,
  },
  scoreBand: {
    minHeight: 72,
    borderWidth: 1,
    borderColor: 'rgba(212, 175, 55, 0.34)',
    borderRadius: 8,
    backgroundColor: 'rgba(212, 175, 55, 0.08)',
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  eyebrow: {
    ...ECS_TEXT.sectionTitle,
    color: TACTICAL.goldMedium,
    marginBottom: 4,
  },
  score: {
    ...ECS_TEXT.screenTitle,
    color: TACTICAL.text,
  },
  section: {
    minWidth: 0,
    gap: 8,
  },
  column: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 260,
  },
  intelligenceBand: {
    borderWidth: 1,
    borderColor: 'rgba(212, 175, 55, 0.24)',
    borderRadius: 8,
    backgroundColor: 'rgba(5, 10, 12, 0.58)',
    padding: 12,
    gap: 8,
  },
  intelligenceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  columns: {
    minHeight: 0,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
    gap: 14,
  },
  title: {
    ...ECS_TEXT.cardTitle,
    color: TACTICAL.text,
  },
  sectionTitle: {
    ...ECS_TEXT.sectionTitle,
    color: TACTICAL.goldMedium,
  },
  copy: {
    ...ECS_TEXT.body,
    color: TACTICAL.textMuted,
    fontSize: 12,
    lineHeight: 16,
    flexShrink: 1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
});
