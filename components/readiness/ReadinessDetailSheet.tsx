import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, TextStyle, View, ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import TacticalPopupShell from '../TacticalPopupShell';
import { ECSText } from '../ECSText';
import { ECSBadge, ECSIcon } from '../ECSStatus';
import type {
  ExpeditionReadinessAssessment,
  ExpeditionReadinessCategory,
  ExpeditionReadinessCategoryId,
  ExpeditionReadinessFreshnessRecord,
} from '../../lib/readiness/expeditionReadinessTypes';
import { useExpeditionReadinessState } from '../../lib/readiness';
import { getTripIntentLabel } from '../../lib/readiness/expeditionReadinessCalibration';
import { getShellBottomClearance, getShellHeaderTopPadding } from '../../lib/shellLayout';
import { ECS } from '../../lib/theme';
import { ReadinessConcernList } from './ReadinessConcernList';
import { ReadinessDecisionBadge } from './ReadinessDecisionBadge';
import { ReadinessScoreRing } from './ReadinessScoreRing';
import { ReadinessCategoryDetail } from './ReadinessCategoryDetail';
import {
  readinessDivider,
  readinessInnerSurfaceStyle,
  readinessStatusLabel,
  readinessSurfaceStyle,
  readinessToneColor,
} from './readinessUi';

export type ReadinessDetailSheetProps = {
  visible: boolean;
  assessment: ExpeditionReadinessAssessment | null;
  previousAssessment?: ExpeditionReadinessAssessment | null;
  initialCategoryId?: ExpeditionReadinessCategoryId | null;
  onClose: () => void;
};

function cleanReadinessCopy(value: string): string {
  return value
    .replace(/\blegal campsite\b/gi, 'Camp Legality Confidence')
    .replace(/\bguaranteed safe\b/gi, 'confidence-supported')
    .replace(/\bsafe route\b/gi, 'route confidence')
    .replace(/\bAI\b/g, 'ECS Intelligence')
    .replace(/\s+/g, ' ')
    .trim();
}

function freshnessRows(assessment: ExpeditionReadinessAssessment): [string, ExpeditionReadinessFreshnessRecord][] {
  return Object.entries(assessment.sourceFreshness)
    .filter(([, record]) => record.isMissing || record.isStale || record.isMock || record.isDemo || record.isInferred)
    .sort(([, a], [, b]) => {
      const rank = (record: ExpeditionReadinessFreshnessRecord) => (
        record.isMissing ? 0 : record.isStale ? 1 : record.isMock || record.isDemo ? 2 : record.isInferred ? 3 : 4
      );
      return rank(a) - rank(b);
    }) as [string, ExpeditionReadinessFreshnessRecord][];
}

function allMissingInputs(assessment: ExpeditionReadinessAssessment): string[] {
  const values = assessment.categories.flatMap((category) => (
    category.missingInputs.map((input) => `${category.label}: ${input}`)
  ));
  return Array.from(new Set(values));
}

function categoryDelta(
  category: ExpeditionReadinessCategory,
  previousAssessment: ExpeditionReadinessAssessment | null | undefined,
): number | null {
  const previous = previousAssessment?.categories.find((item) => item.id === category.id);
  if (!previous) return null;
  return Math.round(category.score - previous.score);
}

function formatDelta(value: number | null): string {
  if (value == null) return 'new';
  if (value === 0) return '0';
  return value > 0 ? `+${value}` : `${value}`;
}

function scoreChangeCopy(
  assessment: ExpeditionReadinessAssessment,
  previousAssessment: ExpeditionReadinessAssessment | null | undefined,
): string {
  if (!previousAssessment) {
    return 'No previous readiness assessment is available in this session yet.';
  }
  const delta = Math.round(assessment.overallScore - previousAssessment.overallScore);
  if (delta === 0 && assessment.status === previousAssessment.status) {
    return 'Overall score and decision state are unchanged from the previous assessment.';
  }
  const statusCopy = assessment.status === previousAssessment.status
    ? `Decision remains ${readinessStatusLabel(assessment.status)}.`
    : `Decision changed from ${readinessStatusLabel(previousAssessment.status)} to ${readinessStatusLabel(assessment.status)}.`;
  return `Overall score ${delta > 0 ? 'increased' : 'decreased'} by ${Math.abs(delta)} points. ${statusCopy}`;
}

function sourceRecordCopy(record: ExpeditionReadinessFreshnessRecord): string {
  if (record.isMissing) return 'missing';
  if (record.isStale) return 'stale';
  if (record.isDemo) return 'demo';
  if (record.isMock) return 'mock';
  if (record.isInferred) return 'ECS-inferred';
  return record.state;
}

export function ReadinessDetailSheet({
  visible,
  assessment,
  previousAssessment,
  initialCategoryId,
  onClose,
}: ReadinessDetailSheetProps) {
  const insets = useSafeAreaInsets();
  const readinessState = useExpeditionReadinessState();
  const fallbackPrevious = previousAssessment ?? readinessState.assessmentHistory[0] ?? null;
  const [selectedCategoryId, setSelectedCategoryId] = useState<ExpeditionReadinessCategoryId | null>(
    initialCategoryId ?? null,
  );

  const model = useMemo(() => {
    if (!assessment) return null;
    const selected = assessment.categories.find((category) => category.id === (selectedCategoryId ?? initialCategoryId))
      ?? assessment.categories.find((category) => category.status === 'hold')
      ?? assessment.categories.find((category) => category.status === 'caution')
      ?? assessment.categories[0];
    return {
      selected,
      missingInputs: allMissingInputs(assessment),
      freshness: freshnessRows(assessment),
      scoreChange: scoreChangeCopy(assessment, fallbackPrevious),
    };
  }, [assessment, fallbackPrevious, initialCategoryId, selectedCategoryId]);

  if (!assessment || !model) return null;

  return (
    <TacticalPopupShell
      visible={visible}
      onClose={onClose}
      title="Readiness Detail"
      eyebrow="ECS EXPEDITION READINESS"
      subtitle="Deterministic score explanation"
      icon={assessment.status === 'ready' ? 'shield-checkmark-outline' : assessment.status === 'caution' ? 'alert-circle-outline' : 'hand-left-outline'}
      overlayClass="editor"
      stackBehavior="allow-stack"
      maxWidth={760}
      maxHeightFraction={0.84}
      minHeightFraction={0.62}
      topClearanceOverride={getShellHeaderTopPadding(insets.top) + 48}
      bottomClearanceOverride={getShellBottomClearance(insets.bottom, 2) + 10}
      contentContainerStyle={styles.content}
    >
      <View style={styles.root}>
        <View style={[styles.summaryPanel, readinessSurfaceStyle]}>
          <ReadinessScoreRing score={assessment.overallScore} status={assessment.status} size={88} compact />
          <View style={styles.summaryCopy}>
            <ReadinessDecisionBadge status={assessment.status} score={assessment.overallScore} compact />
            <ECSText variant="body" style={styles.explanation} numberOfLines={5}>
              {cleanReadinessCopy(assessment.explanation)}
            </ECSText>
            <View style={styles.badgeRow}>
              <ECSBadge label={`Confidence ${assessment.confidence}`} tone={assessment.confidence === 'high' ? 'ready' : assessment.confidence === 'medium' ? 'warning' : 'unavailable'} compact />
              <ECSBadge label={`Intent ${getTripIntentLabel(assessment.tripIntent)}`} tone={assessment.tripIntentSource === 'selected' ? 'ready' : assessment.tripIntentSource === 'ecs_inferred' ? 'warning' : 'info'} compact />
              {assessment.tripIntentSource === 'ecs_inferred' ? (
                <ECSBadge label="ECS-inferred" tone="warning" compact />
              ) : null}
            </View>
          </View>
        </View>

        <View style={[styles.changePanel, readinessInnerSurfaceStyle]}>
          <ECSText variant="chip" style={styles.panelTitle} numberOfLines={1}>
            Why It Changed
          </ECSText>
          <ECSText variant="helper" style={styles.panelCopy} numberOfLines={3}>
            {model.scoreChange}
          </ECSText>
        </View>

        <View style={styles.section}>
          <ECSText variant="cardTitle" style={styles.sectionTitle} numberOfLines={1}>
            Score Breakdown
          </ECSText>
          <View style={styles.categoryGrid}>
            {assessment.categories.map((category) => {
              const isSelected = category.id === model.selected.id;
              const delta = categoryDelta(category, fallbackPrevious);
              return (
                <Pressable
                  key={category.id}
                  onPress={() => setSelectedCategoryId(category.id)}
                  accessibilityRole="button"
                  accessibilityLabel={`${category.label}, ${readinessStatusLabel(category.status)}, score ${category.score}`}
                  style={({ pressed }) => [
                    styles.categoryChip,
                    readinessInnerSurfaceStyle,
                    isSelected && styles.categoryChipSelected,
                    pressed && styles.pressed,
                  ]}
                >
                  <View style={styles.categoryChipHeader}>
                    <ECSText variant="helper" style={styles.categoryChipLabel} numberOfLines={1}>
                      {category.label}
                    </ECSText>
                    <ECSText variant="chip" style={[styles.categoryChipScore, { color: readinessToneColor(category.status) }]} numberOfLines={1}>
                      {Math.round(category.score)}
                    </ECSText>
                  </View>
                  <View style={styles.categoryChipFooter}>
                    <ECSBadge label={readinessStatusLabel(category.status)} tone={category.status === 'ready' ? 'ready' : category.status === 'caution' ? 'warning' : 'unavailable'} compact />
                    <ECSText variant="helper" style={styles.delta} numberOfLines={1}>
                      {formatDelta(delta)}
                    </ECSText>
                  </View>
                </Pressable>
              );
            })}
          </View>
        </View>

        <ReadinessCategoryDetail category={model.selected} />

        <View style={styles.section}>
          <ECSText variant="cardTitle" style={styles.sectionTitle} numberOfLines={1}>
            Blockers, Warnings, Actions
          </ECSText>
          <ReadinessConcernList
            assessment={assessment}
            limit={Math.max(assessment.blockers.length + assessment.warnings.length + assessment.recommendations.length, 1)}
            showRecommendations
          />
        </View>

        <View style={styles.section}>
          <ECSText variant="cardTitle" style={styles.sectionTitle} numberOfLines={1}>
            Missing And Stale Inputs
          </ECSText>
          {model.missingInputs.length > 0 ? (
            <View style={styles.bulletPanel}>
              {model.missingInputs.map((input) => (
                <View key={input} style={styles.bulletRow}>
                  <ECSIcon name="help-circle-outline" tier="compact" tone="warning" />
                  <ECSText variant="helper" style={styles.bulletText} numberOfLines={2}>
                    {input}
                  </ECSText>
                </View>
              ))}
            </View>
          ) : (
            <ECSText variant="helper" style={styles.panelCopy}>
              No category-level missing inputs were reported.
            </ECSText>
          )}

          {model.freshness.length > 0 ? (
            <View style={styles.freshnessList}>
              {model.freshness.map(([key, record]) => (
                <View key={key} style={[styles.freshnessRow, readinessInnerSurfaceStyle]}>
                  <View style={styles.freshnessCopy}>
                    <ECSText variant="body" style={styles.freshnessLabel} numberOfLines={1}>
                      {record.label}
                    </ECSText>
                    <ECSText variant="helper" style={styles.freshnessDetail} numberOfLines={2}>
                      {record.detail ?? record.updatedAt ?? 'No source detail available.'}
                    </ECSText>
                  </View>
                  <ECSBadge label={sourceRecordCopy(record)} tone={record.isMissing || record.isStale ? 'warning' : record.isDemo || record.isMock ? 'unavailable' : 'info'} compact />
                </View>
              ))}
            </View>
          ) : (
            <ECSText variant="helper" style={styles.panelCopy}>
              No stale, missing, mock, demo, or ECS-inferred source freshness flags are currently present.
            </ECSText>
          )}
        </View>
      </View>
    </TacticalPopupShell>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingBottom: 22,
  } as ViewStyle,
  root: {
    gap: 14,
  },
  summaryPanel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    padding: 13,
  },
  summaryCopy: {
    flex: 1,
    gap: 8,
    minWidth: 0,
  },
  explanation: {
    color: ECS.text,
    fontSize: 13,
    lineHeight: 18,
    includeFontPadding: false,
  } as TextStyle,
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
  },
  changePanel: {
    padding: 12,
    gap: 6,
  },
  panelTitle: {
    color: ECS.text,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    includeFontPadding: false,
  } as TextStyle,
  panelCopy: {
    color: ECS.muted,
    lineHeight: 16,
  } as TextStyle,
  section: {
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: readinessDivider,
    paddingTop: 12,
  },
  sectionTitle: {
    color: ECS.text,
    includeFontPadding: false,
  } as TextStyle,
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  categoryChip: {
    width: '48%',
    minWidth: 150,
    padding: 10,
    gap: 8,
  },
  categoryChipSelected: {
    borderColor: ECS.accent,
  },
  pressed: {
    opacity: 0.78,
  },
  categoryChipHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    minWidth: 0,
  },
  categoryChipLabel: {
    flex: 1,
    color: ECS.text,
    lineHeight: 15,
  } as TextStyle,
  categoryChipScore: {
    fontSize: 12,
    includeFontPadding: false,
  } as TextStyle,
  categoryChipFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  delta: {
    color: ECS.muted,
    fontSize: 10,
    lineHeight: 13,
  } as TextStyle,
  bulletPanel: {
    gap: 7,
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    minWidth: 0,
  },
  bulletText: {
    flex: 1,
    color: ECS.muted,
    lineHeight: 15,
  } as TextStyle,
  freshnessList: {
    gap: 8,
  },
  freshnessRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    padding: 10,
  },
  freshnessCopy: {
    flex: 1,
    gap: 4,
    minWidth: 0,
  },
  freshnessLabel: {
    color: ECS.text,
    fontSize: 12,
    lineHeight: 16,
    includeFontPadding: false,
  } as TextStyle,
  freshnessDetail: {
    color: ECS.muted,
    lineHeight: 15,
  } as TextStyle,
});

export default ReadinessDetailSheet;
