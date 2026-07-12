import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { ECSButton } from '../ECSButton';
import ECSModalShell, { ECSOverlayFooter } from '../ECSModalShell';
import { ECSBadge, ECSIcon } from '../ECSStatus';
import { ECSPanel, ECSSectionHeader } from '../ECSSurface';
import { ECSHelperText, ECSText } from '../ECSText';
import { SourceTruthInspectorTrigger } from '../source-truth/SourceTruthInspector';
import { ECS_SURFACE } from '../../lib/ecsSurfaceTokens';
import { ECS } from '../../lib/theme';
import type {
  RouteBuilderImpactPreviewModel,
  RouteImpactCategoryResult,
  RouteImpactDirection,
  RouteImpactOutcome,
} from '../../lib/routeImpact';

export interface RouteChangeImpactPreviewProps {
  visible: boolean;
  model: RouteBuilderImpactPreviewModel | null;
  onClose: () => void;
  onContinueToSave: () => void;
}

type BadgeTone = React.ComponentProps<typeof ECSBadge>['tone'];

const OUTCOME_COPY: Record<RouteImpactOutcome, { label: string; tone: BadgeTone; icon: React.ComponentProps<typeof ECSIcon>['name'] }> = {
  improves: { label: 'IMPROVES', tone: 'ready', icon: 'trending-up-outline' },
  mixed: { label: 'MIXED', tone: 'warning', icon: 'swap-horizontal-outline' },
  worsens: { label: 'WORSENS', tone: 'unavailable', icon: 'trending-down-outline' },
  unknown: { label: 'UNKNOWN', tone: 'warning', icon: 'help-circle-outline' },
};

const DIRECTION_COPY: Record<RouteImpactDirection, { label: string; tone: BadgeTone }> = {
  improves: { label: 'IMPROVES', tone: 'ready' },
  unchanged: { label: 'NO MATERIAL CHANGE', tone: 'info' },
  worsens: { label: 'WORSENS', tone: 'unavailable' },
  unknown: { label: 'UNKNOWN', tone: 'warning' },
};

function categoryPriority(item: RouteImpactCategoryResult): number {
  if (item.category === 'source_quality') return 4;
  if (item.materiality === 'material' && item.direction === 'worsens') return 0;
  if (item.materiality === 'material' && item.direction === 'improves') return 1;
  if (item.direction === 'unknown') return 2;
  return 3;
}

function ImpactRow({ item }: { item: RouteImpactCategoryResult }) {
  const direction = DIRECTION_COPY[item.direction];
  const dependencies = useMemo(
    () => [`${item.label}: ${item.reason}`],
    [item.label, item.reason],
  );

  return (
    <View style={styles.impactRow}>
      <View style={styles.impactHeader}>
        <ECSText variant="cardTitle" style={styles.impactTitle}>
          {item.label}
        </ECSText>
        <ECSBadge label={direction.label} tone={direction.tone} compact />
      </View>
      <View
        style={styles.valueGrid}
        accessible
        accessibilityLabel={`${item.label}. Baseline ${item.baselineDisplay}. Candidate ${item.candidateDisplay}. ${direction.label}.`}
      >
        <View style={styles.valueColumn}>
          <ECSText variant="statLabel">BASELINE</ECSText>
          <ECSText variant="statValue" style={styles.valueText} numberOfLines={2}>
            {item.baselineDisplay}
          </ECSText>
        </View>
        <ECSIcon name="arrow-forward-outline" tier="compact" tone="info" />
        <View style={styles.valueColumn}>
          <ECSText variant="statLabel">CANDIDATE</ECSText>
          <ECSText variant="statValue" style={styles.valueText} numberOfLines={2}>
            {item.candidateDisplay}
          </ECSText>
        </View>
      </View>
      <ECSHelperText style={styles.reason}>{item.reason}</ECSHelperText>
      {item.missingInputs.length > 0 ? (
        <View style={styles.missingRow}>
          <ECSIcon name="alert-circle-outline" tier="compact" tone="warning" />
          <ECSHelperText style={styles.missingText}>
            Missing: {item.missingInputs.join('; ')}
          </ECSHelperText>
        </View>
      ) : null}
      <View style={styles.sourceRow}>
        {item.sourceTruth.baseline ? (
          <SourceTruthInspectorTrigger
            source={item.sourceTruth.baseline.ref}
            policyKey={item.sourceTruth.baseline.policy.key}
            dependencies={dependencies}
            label="BASE SOURCE"
            compact
          />
        ) : null}
        {item.sourceTruth.candidate ? (
          <SourceTruthInspectorTrigger
            source={item.sourceTruth.candidate.ref}
            policyKey={item.sourceTruth.candidate.policy.key}
            dependencies={dependencies}
            label="ALT SOURCE"
            compact
          />
        ) : null}
        {item.requiredForSafety ? (
          <ECSBadge label="SAFETY INPUT" tone="category" compact />
        ) : null}
      </View>
    </View>
  );
}

export function RouteChangeImpactPreview({
  visible,
  model,
  onClose,
  onContinueToSave,
}: RouteChangeImpactPreviewProps) {
  const categories = useMemo(
    () => [...(model?.result.categories ?? [])].sort((left, right) =>
      categoryPriority(left) - categoryPriority(right),
    ),
    [model?.result.categories],
  );
  const outcome = OUTCOME_COPY[model?.result.outcome ?? 'unknown'];

  return (
    <ECSModalShell
      visible={visible}
      onClose={onClose}
      title="Route Change Impact"
      subtitle={model
        ? `${model.result.baselineLabel} vs ${model.result.candidateLabel}`
        : 'Comparison unavailable'}
      eyebrow="ECS ROUTE REVIEW"
      icon="git-compare-outline"
      overlayClass="editor"
      stackBehavior="allow-stack"
      maxWidth={820}
      maxHeightFraction={0.9}
      minHeightFraction={0.74}
      scrollable
      dismissOnBackdrop
      allowSwipeDismiss
      showHandle
      contentContainerStyle={styles.content}
      footer={(
        <ECSOverlayFooter>
          <ECSButton
            label="Keep Editing"
            icon="arrow-back-outline"
            variant="tertiary"
            size="medium"
            onPress={onClose}
            grow
          />
          <ECSButton
            label="Continue To Save"
            icon="save-outline"
            variant="primary"
            size="medium"
            onPress={onContinueToSave}
            disabled={!model?.canContinueToSave}
            grow
          />
        </ECSOverlayFooter>
      )}
    >
      <View style={styles.root} accessibilityViewIsModal>
        <ECSPanel
          variant={model?.result.outcome === 'worsens' || model?.result.outcome === 'unknown'
            ? 'warning'
            : 'secondary'}
          style={styles.summaryPanel}
        >
          <View style={styles.summaryHeader}>
            <View style={styles.summaryIcon}>
              <ECSIcon name={outcome.icon} tier="action" tone={outcome.tone} />
            </View>
            <View style={styles.summaryCopy}>
              <ECSText variant="cardTitle" style={styles.summaryTitle}>
                {model?.result.headline ?? 'Impact unavailable'}
              </ECSText>
              <ECSHelperText style={styles.summaryText}>
                {model?.result.summary ?? 'ECS could not build a deterministic comparison.'}
              </ECSHelperText>
            </View>
            <ECSBadge label={outcome.label} tone={outcome.tone} compact />
          </View>
          <View style={styles.noMutationRow}>
            <ECSIcon name="lock-closed-outline" tier="compact" tone="info" />
            <ECSHelperText style={styles.noMutationText}>
              Preview only. No route, camp, expedition, convoy, or guidance state has changed.
            </ECSHelperText>
          </View>
        </ECSPanel>

        {model?.activeGuidanceProtected ? (
          <ECSPanel variant="warning" style={styles.noticePanel}>
            <ECSSectionHeader
              title="Active Guidance Protected"
              icon="shield-checkmark-outline"
              subtitle="Existing replacement confirmation remains in force"
            />
            <ECSHelperText>{model.activeGuidanceMessage}</ECSHelperText>
          </ECSPanel>
        ) : null}

        {model?.routeEndpointsMessage ? (
          <ECSPanel variant="quiet" style={styles.noticePanel}>
            <ECSSectionHeader
              title="Comparison Boundary"
              icon="locate-outline"
              subtitle="Values stay visible; unsupported conclusions stay unknown"
            />
            <ECSHelperText>{model.routeEndpointsMessage}</ECSHelperText>
          </ECSPanel>
        ) : null}

        <ECSPanel variant="quiet" style={styles.categoryPanel}>
          <ECSSectionHeader
            title="Deterministic Consequences"
            icon="options-outline"
            subtitle={`${model?.result.materialCategories.length ?? 0} material, ${model?.result.requiredUnknownCategories.length ?? 0} required unknown`}
          />
          <View>
            {categories.length > 0 ? categories.map((item, index) => (
              <View key={item.category}>
                <ImpactRow item={item} />
                {index < categories.length - 1 ? <View style={styles.divider} /> : null}
              </View>
            )) : (
              <ECSHelperText>
                No comparable route evidence is available.
              </ECSHelperText>
            )}
          </View>
        </ECSPanel>
      </View>
    </ECSModalShell>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingBottom: 18,
  },
  root: {
    gap: ECS_SURFACE.gap.section,
  },
  summaryPanel: {
    gap: ECS_SURFACE.gap.group,
  },
  summaryHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: ECS_SURFACE.gap.row,
  },
  summaryIcon: {
    minWidth: 28,
    minHeight: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryCopy: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  summaryTitle: {
    color: ECS.text,
  },
  summaryText: {
    color: ECS.muted,
    lineHeight: 16,
  },
  noMutationRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: ECS_SURFACE.gap.group,
  },
  noMutationText: {
    flex: 1,
    color: ECS.muted,
  },
  noticePanel: {
    gap: ECS_SURFACE.gap.group,
  },
  categoryPanel: {
    gap: ECS_SURFACE.gap.group,
  },
  impactRow: {
    paddingVertical: ECS_SURFACE.gap.group,
    gap: ECS_SURFACE.gap.group,
  },
  impactHeader: {
    minHeight: 30,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: ECS_SURFACE.gap.group,
  },
  impactTitle: {
    flex: 1,
    minWidth: 150,
    color: ECS.text,
  },
  valueGrid: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: ECS_SURFACE.gap.group,
  },
  valueColumn: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  valueText: {
    color: ECS.text,
  },
  reason: {
    color: ECS.muted,
    lineHeight: 16,
  },
  missingRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: ECS_SURFACE.gap.group,
  },
  missingText: {
    flex: 1,
    color: ECS.muted,
    lineHeight: 16,
  },
  sourceRow: {
    minHeight: 32,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: ECS_SURFACE.gap.group,
  },
  divider: {
    height: 1,
    backgroundColor: ECS.strokeMuted,
  },
});
