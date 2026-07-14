import React, { useMemo } from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';

import { ECSBadge, ECSIcon } from '../ECSStatus';
import { ECSText } from '../ECSText';
import { ECS } from '../../lib/theme';
import { ECS_SURFACE } from '../../lib/ecsSurfaceTokens';
import {
  selectSourceTruthStatusPresentation,
  type BuildSourceTruthInspectorModelInput,
} from '../../lib/sourceTruthPresentation';

export type ECSSourceTruthIndicatorProps = BuildSourceTruthInspectorModelInput & {
  style?: StyleProp<ViewStyle>;
};

export function ECSSourceBadge({ style, ...input }: ECSSourceTruthIndicatorProps) {
  const model = useSourceTruthPresentation(input);
  return (
    <View style={style}>
      <ECSBadge
        label={model.originLabel}
        tone={model.triggerTone}
        icon={model.triggerIcon}
        compact
      />
    </View>
  );
}

export function ECSFreshnessBadge({ style, ...input }: ECSSourceTruthIndicatorProps) {
  const model = useSourceTruthPresentation(input);
  const label = model.assessment.facts.usingLastGoodCache
    ? model.triggerLabel
    : model.freshnessLabel;
  return (
    <View style={style}>
      <ECSBadge label={label} tone={model.triggerTone} icon="time-outline" compact />
    </View>
  );
}

export function ECSConfidenceBadge({ style, ...input }: ECSSourceTruthIndicatorProps) {
  const model = useSourceTruthPresentation(input);
  const tone = model.confidenceLabel === 'High'
    ? 'ready'
    : model.confidenceLabel === 'Unknown'
      ? 'info'
      : 'warning';
  return (
    <View style={style}>
      <ECSBadge
        label={`${model.confidenceLabel} confidence`}
        tone={tone}
        icon="shield-checkmark-outline"
        compact
      />
    </View>
  );
}

export function ECSSourceConflictWarning({
  style,
  ...input
}: ECSSourceTruthIndicatorProps) {
  const model = useSourceTruthPresentation(input);
  if (model.assessment.conflictState === 'none') return null;

  const present = model.assessment.conflictState === 'present';
  return (
    <View
      style={[styles.conflict, style]}
      accessible
      accessibilityRole="alert"
      accessibilityLabel={model.conflictLabel}
    >
      <ECSIcon
        name={present ? 'warning-outline' : 'information-circle-outline'}
        tier="compact"
        tone={present ? 'unavailable' : 'warning'}
      />
      <ECSText variant="body" style={styles.conflictText}>
        {model.conflictLabel}
      </ECSText>
    </View>
  );
}

function useSourceTruthPresentation(input: BuildSourceTruthInspectorModelInput) {
  const { now, policyKey, policyOverride, source, sources } = input;
  return useMemo(
    () => selectSourceTruthStatusPresentation({
      now,
      policyKey,
      policyOverride,
      source,
      sources,
    }),
    [now, policyKey, policyOverride, source, sources],
  );
}

const styles = StyleSheet.create({
  conflict: {
    minHeight: 36,
    flexDirection: 'row',
    alignItems: 'center',
    gap: ECS_SURFACE.gap.group,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ECS.warning,
    backgroundColor: ECS.goldWash,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  conflictText: {
    flex: 1,
    color: ECS.text,
    lineHeight: 16,
  },
});
