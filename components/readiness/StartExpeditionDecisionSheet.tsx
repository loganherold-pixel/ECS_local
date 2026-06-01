import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ECSOverlayFooter } from '../ECSModalShell';
import { ECSButton } from '../ECSButton';
import { ECSBadge } from '../ECSStatus';
import TacticalPopupShell from '../TacticalPopupShell';
import { ECS, GOLD_RAIL, TACTICAL } from '../../lib/theme';
import { ECS_TEXT } from '../../lib/ecsTypographyTokens';
import {
  DEFAULT_START_EXPEDITION_OVERRIDE_POLICY,
  canOverrideStartExpeditionStatus,
  getStartExpeditionDecisionTitle,
  getStartExpeditionPrimaryActionLabel,
  getStartExpeditionReviewReasons,
  type StartExpeditionReviewReason,
  type StartExpeditionOverridePolicy,
} from '../../lib/readiness/startExpeditionReadiness';
import type { ExpeditionReadinessAssessment } from '../../lib/readiness/expeditionReadinessTypes';
import { getTopReadinessConcerns } from '../../lib/readiness/expeditionReadinessScoring';
import { getShellBottomClearance, getShellHeaderTopPadding } from '../../lib/shellLayout';
import { ReadinessConcernList } from './ReadinessConcernList';
import { ReadinessDecisionBadge } from './ReadinessDecisionBadge';
import { ReadinessScoreRing } from './ReadinessScoreRing';

export type StartExpeditionDecisionSheetProps = {
  visible: boolean;
  assessment: ExpeditionReadinessAssessment | null;
  reviewReasons?: StartExpeditionReviewReason[];
  onClose: () => void;
  onReviewCommandBrief: () => void;
  onConfirmStart: (options: { acknowledgedOverride: boolean }) => void;
  overridePolicy?: StartExpeditionOverridePolicy;
};

function cleanReadinessCopy(value: string): string {
  return value
    .replace(/\blegal campsite\b/gi, 'Camp Legality Confidence')
    .replace(/\bsafe route\b/gi, 'route confidence')
    .replace(/\bsafe\b/gi, 'confidence-supported')
    .replace(/\bAI\b/g, 'ECS Intelligence')
    .replace(/\s+/g, ' ')
    .trim();
}

function topNotes(assessment: ExpeditionReadinessAssessment): string[] {
  const issueNotes = [
    ...assessment.blockers.map((issue) => issue.detail),
    ...assessment.warnings.map((issue) => issue.detail),
  ];
  const categoryNotes = getTopReadinessConcerns(assessment, 2).map((category) => category.summary);
  const recommendationNotes = assessment.recommendations.slice(0, 2);
  return [...issueNotes, ...categoryNotes, ...recommendationNotes]
    .map(cleanReadinessCopy)
    .filter(Boolean)
    .slice(0, assessment.status === 'ready' ? 2 : 4);
}

export default function StartExpeditionDecisionSheet({
  visible,
  assessment,
  reviewReasons = [],
  onClose,
  onReviewCommandBrief,
  onConfirmStart,
  overridePolicy = DEFAULT_START_EXPEDITION_OVERRIDE_POLICY,
}: StartExpeditionDecisionSheetProps) {
  const insets = useSafeAreaInsets();
  const model = useMemo(() => {
    if (!assessment) return null;
    const canOverride = canOverrideStartExpeditionStatus(assessment.status, overridePolicy);
    const allReviewReasons = [...getStartExpeditionReviewReasons(assessment), ...reviewReasons].filter(
      (reason, index, reasons) => reasons.findIndex((candidate) => candidate.id === reason.id) === index,
    );
    return {
      title: getStartExpeditionDecisionTitle(assessment.status),
      primaryActionLabel: getStartExpeditionPrimaryActionLabel(assessment.status, overridePolicy),
      canOverride,
      notes: topNotes(assessment),
      reviewReasons: allReviewReasons,
    };
  }, [assessment, overridePolicy, reviewReasons]);

  if (!assessment || !model) return null;

  const showConcerns = assessment.status !== 'ready';
  const acknowledgedOverride = assessment.status !== 'ready';

  return (
    <TacticalPopupShell
      visible={visible}
      onClose={onClose}
      title="Start Expedition"
      eyebrow="ECS EXPEDITION READINESS"
      subtitle={model.title}
      icon={assessment.status === 'ready' ? 'shield-checkmark-outline' : assessment.status === 'caution' ? 'alert-circle-outline' : 'hand-left-outline'}
      overlayClass="action"
      stackBehavior="allow-stack"
      maxWidth={560}
      maxHeightFraction={0.72}
      minHeightFraction={0.38}
      topClearanceOverride={getShellHeaderTopPadding(insets.top) + 52}
      bottomClearanceOverride={getShellBottomClearance(insets.bottom, 2) + 12}
      footer={(
        <ECSOverlayFooter>
          <ECSButton
            label="Review Command Brief"
            icon="document-text-outline"
            variant="secondary"
            size="medium"
            onPress={onReviewCommandBrief}
            grow
          />
          {model.primaryActionLabel && model.canOverride ? (
            <ECSButton
              label={model.primaryActionLabel}
              icon="play"
              variant={assessment.status === 'ready' ? 'primary' : 'secondary'}
              size="medium"
              onPress={() => onConfirmStart({ acknowledgedOverride })}
              grow
            />
          ) : null}
        </ECSOverlayFooter>
      )}
    >
      <View style={styles.root}>
        <View style={styles.summaryRow}>
          <ReadinessScoreRing
            score={assessment.overallScore}
            status={assessment.status}
            size={82}
            strokeWidth={7}
            compact
          />
          <View style={styles.summaryCopy}>
            <ReadinessDecisionBadge status={assessment.status} score={assessment.overallScore} compact />
            <Text style={styles.explanation} numberOfLines={4}>
              {cleanReadinessCopy(assessment.explanation)}
            </Text>
            <View style={styles.badgeRow}>
              <ECSBadge label={`Confidence ${assessment.confidence}`} tone={assessment.confidence === 'high' ? 'ready' : assessment.confidence === 'medium' ? 'warning' : 'unavailable'} compact />
              {assessment.dataIntegrity.usesDemoData || assessment.dataIntegrity.usesMockData ? (
                <ECSBadge label="ECS-inferred" tone="warning" compact />
              ) : null}
            </View>
          </View>
        </View>

        {model.reviewReasons.length > 0 ? (
          <View style={styles.reviewReasonPanel}>
            <Text style={styles.reviewReasonText}>
              ECS detected readiness items worth reviewing before departure.
            </Text>
            <View style={styles.badgeRow}>
              {model.reviewReasons.map((reason) => (
                <ECSBadge
                  key={reason.id}
                  label={reason.label}
                  tone={reason.id === 'hold_pattern' ? 'unavailable' : 'warning'}
                  compact
                />
              ))}
            </View>
          </View>
        ) : null}

        {model.notes.length > 0 ? (
          <View style={styles.notePanel}>
            <Text style={styles.panelTitle}>
              {assessment.status === 'ready' ? 'Pre-start notes' : assessment.status === 'caution' ? 'Recommended review' : 'Blockers to review'}
            </Text>
            {model.notes.slice(0, assessment.status === 'ready' ? 2 : 3).map((note, index) => (
              <View key={`${note}-${index}`} style={styles.noteRow}>
                <View style={styles.noteDot} />
                <Text style={styles.noteText} numberOfLines={3}>
                  {note}
                </Text>
              </View>
            ))}
          </View>
        ) : null}

        {showConcerns ? (
          <ReadinessConcernList
            assessment={assessment}
            limit={assessment.status === 'hold' ? 5 : 4}
            showRecommendations
            style={styles.concerns}
          />
        ) : null}

        {assessment.status === 'hold' ? (
          <Text style={styles.overrideCopy} numberOfLines={4}>
            ECS recommends review before departure. Continuing keeps live warnings visible and records a local acknowledgement.
          </Text>
        ) : assessment.status === 'caution' ? (
          <Text style={styles.overrideCopy} numberOfLines={3}>
            ECS will continue active assessment updates if you start with caution-level items still open.
          </Text>
        ) : null}
      </View>
    </TacticalPopupShell>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: 12,
  },
  summaryRow: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
  },
  summaryCopy: {
    flex: 1,
    minWidth: 0,
    gap: 7,
  },
  explanation: {
    ...ECS_TEXT.body,
    color: TACTICAL.text,
    lineHeight: 18,
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  notePanel: {
    gap: 8,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: GOLD_RAIL.section,
    backgroundColor: ECS.bgPanel,
  },
  reviewReasonPanel: {
    gap: 8,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(196,138,44,0.22)',
    backgroundColor: 'rgba(196,138,44,0.08)',
  },
  reviewReasonText: {
    ...ECS_TEXT.helper,
    color: TACTICAL.text,
    lineHeight: 15,
  },
  panelTitle: {
    ...ECS_TEXT.statLabel,
    color: TACTICAL.amber,
    letterSpacing: 0,
  },
  noteRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  noteDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    marginTop: 6,
    backgroundColor: TACTICAL.amber,
  },
  noteText: {
    ...ECS_TEXT.helper,
    flex: 1,
    color: TACTICAL.textMuted,
    lineHeight: 15,
  },
  concerns: {
    paddingTop: 2,
  },
  overrideCopy: {
    ...ECS_TEXT.helper,
    color: TACTICAL.textMuted,
    lineHeight: 15,
  },
});
