import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Platform,
  StyleProp,
  StyleSheet,
  TouchableOpacity,
  View,
  ViewStyle,
  findNodeHandle,
} from 'react-native';

import { ECSButton } from '../ECSButton';
import ECSModalShell, { ECSOverlayFooter } from '../ECSModalShell';
import { ECSBadge, ECSIcon } from '../ECSStatus';
import {
  ECSListRow,
  ECSPanel,
  ECSSectionHeader,
} from '../ECSSurface';
import { ECSHelperText, ECSText } from '../ECSText';
import { ECS, TACTICAL } from '../../lib/theme';
import { ECS_SURFACE } from '../../lib/ecsSurfaceTokens';
import {
  buildSourceTruthInspectorModel,
  type BuildSourceTruthInspectorModelInput,
  type SourceTruthInspectorModel,
  type SourceTruthInspectorRow,
} from '../../lib/sourceTruthPresentation';
import {
  sanitizeSourceTruthDisplayText,
  type FreshnessPolicyOverride,
  type SourceTruthPolicyKey,
  type SourceTruthRef,
} from '../../lib/sourceTruth';

export type SourceTruthInspectorActionKind = 'refresh' | 'verify' | 'manual_update';

export type SourceTruthInspectorAction = {
  kind: SourceTruthInspectorActionKind;
  onPress: () => void;
  disabled?: boolean;
  unavailableReason?: string | null;
};

export type SourceTruthInspectorProps = {
  visible: boolean;
  source?: SourceTruthRef | null;
  policyKey?: SourceTruthPolicyKey | null;
  policyOverride?: FreshnessPolicyOverride | null;
  dependencies?: readonly string[] | null;
  action?: SourceTruthInspectorAction | null;
  now?: BuildSourceTruthInspectorModelInput['now'];
  onClose: () => void;
};

export type SourceTruthInspectorTriggerProps = Omit<
  SourceTruthInspectorProps,
  'visible' | 'onClose'
> & {
  label?: string | null;
  badgeTone?: React.ComponentProps<typeof ECSBadge>['tone'];
  badgeIcon?: React.ComponentProps<typeof ECSBadge>['icon'];
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

const ACTION_COPY: Record<SourceTruthInspectorActionKind, {
  label: string;
  icon: React.ComponentProps<typeof ECSButton>['icon'];
}> = {
  refresh: { label: 'Refresh Source', icon: 'refresh-outline' },
  verify: { label: 'Verify Source', icon: 'shield-checkmark-outline' },
  manual_update: { label: 'Update Manually', icon: 'create-outline' },
};

export function SourceTruthInspector({
  visible,
  source,
  policyKey,
  policyOverride,
  dependencies,
  action,
  now,
  onClose,
}: SourceTruthInspectorProps) {
  const summaryRef = useRef<View>(null);
  const model = useMemo(
    () => buildSourceTruthInspectorModel({
      source,
      policyKey,
      policyOverride,
      dependencies,
      now,
    }),
    [dependencies, now, policyKey, policyOverride, source],
  );
  const actionCopy = action ? ACTION_COPY[action.kind] : null;
  const unavailableReason = sanitizeSourceTruthDisplayText(action?.unavailableReason, 160);

  useEffect(() => {
    if (!visible) return undefined;
    const timer = setTimeout(() => {
      const node = findNodeHandle(summaryRef.current);
      if (Platform.OS !== 'web' && node != null) {
        AccessibilityInfo.setAccessibilityFocus(node);
        return;
      }
      AccessibilityInfo.announceForAccessibility(model.accessibilityLabel);
    }, 260);
    return () => clearTimeout(timer);
  }, [model.accessibilityLabel, visible]);

  const handleAction = useCallback(() => {
    if (!action || action.disabled) return;
    action.onPress();
    AccessibilityInfo.announceForAccessibility(`${ACTION_COPY[action.kind].label} requested.`);
  }, [action]);

  return (
    <ECSModalShell
      visible={visible}
      onClose={onClose}
      title="Source Details"
      subtitle={model.sourceName}
      eyebrow="ECS SOURCE TRUTH"
      icon="document-text-outline"
      overlayClass="editor"
      stackBehavior="allow-stack"
      maxWidth={760}
      maxHeightFraction={0.84}
      minHeightFraction={0.58}
      scrollable
      dismissOnBackdrop
      allowSwipeDismiss
      showHandle
      contentContainerStyle={styles.content}
      footer={(
        <ECSOverlayFooter>
          <ECSButton
            label="Close"
            icon="close-outline"
            variant="tertiary"
            size="medium"
            onPress={onClose}
            grow
          />
          {actionCopy ? (
            <ECSButton
              label={actionCopy.label}
              icon={actionCopy.icon}
              variant="primary"
              size="medium"
              onPress={handleAction}
              disabled={action?.disabled}
              grow
            />
          ) : null}
        </ECSOverlayFooter>
      )}
    >
      <View style={styles.root} accessibilityViewIsModal>
        <View
          ref={summaryRef}
          accessible
          accessibilityLabel={model.accessibilityLabel}
        >
          <ECSPanel
            variant={model.conflict || model.triggerTone === 'unavailable' ? 'warning' : 'secondary'}
            style={styles.summaryPanel}
          >
            <View style={styles.badgeRow}>
              <ECSBadge
                label={model.freshnessLabel}
                tone={model.triggerTone}
                icon={model.triggerIcon}
                compact
              />
              <ECSBadge label={model.originLabel} tone="category" compact />
              <ECSBadge
                label={`${model.confidenceLabel} confidence`}
                tone={model.confidenceLabel === 'High'
                  ? 'ready'
                  : model.confidenceLabel === 'Unknown'
                    ? 'info'
                    : 'warning'}
                compact
              />
            </View>
            <ECSText variant="body" style={styles.summaryText}>
              {model.summary}
            </ECSText>
          </ECSPanel>
        </View>

        <InspectorSection title="Source" icon="finger-print-outline" rows={model.sourceRows} />
        <InspectorSection title="Freshness And Quality" icon="time-outline" rows={[
          ...model.timingRows,
          ...model.qualityRows,
        ]} />

        <ECSPanel variant="quiet" style={styles.sectionPanel}>
          <ECSSectionHeader
            title="Decision Impact"
            icon="git-network-outline"
            subtitle="What uses this source"
          />
          <View style={styles.list}>
            {model.dependencies.map((dependency) => (
              <View key={dependency} style={styles.bulletRow}>
                <ECSIcon name="link-outline" tier="compact" tone="info" />
                <ECSText variant="body" style={styles.bulletText}>
                  {dependency}
                </ECSText>
              </View>
            ))}
          </View>
        </ECSPanel>

        {model.warnings.length > 0 ? (
          <ECSPanel variant="warning" style={styles.sectionPanel}>
            <ECSSectionHeader
              title={model.conflict ? 'Conflicts And Warnings' : 'Source Warnings'}
              icon="warning-outline"
              subtitle="Limitations remain visible"
            />
            <View style={styles.list}>
              {model.warnings.map((warning, index) => (
                <View key={`${warning.code ?? 'restricted'}-${index}`} style={styles.warningRow}>
                  <ECSIcon
                    name={warning.severity === 'critical' ? 'alert-circle-outline' : 'information-circle-outline'}
                    tier="compact"
                    tone={warning.severity === 'critical' ? 'unavailable' : 'warning'}
                  />
                  <View style={styles.warningCopy}>
                    <ECSText variant="body" style={styles.warningText}>
                      {warning.message}
                    </ECSText>
                    {warning.code ? (
                      <ECSText variant="chip" style={styles.warningCode}>
                        {warning.code}
                      </ECSText>
                    ) : null}
                  </View>
                </View>
              ))}
            </View>
          </ECSPanel>
        ) : null}

        {action?.disabled && unavailableReason ? (
          <ECSHelperText style={styles.actionReason}>
            {unavailableReason === '[redacted]'
              ? 'The action is unavailable for a restricted reason.'
              : unavailableReason}
          </ECSHelperText>
        ) : null}
      </View>
    </ECSModalShell>
  );
}

export function SourceTruthInspectorTrigger({
  source,
  policyKey,
  policyOverride,
  dependencies,
  action,
  now,
  label,
  badgeTone,
  badgeIcon,
  compact = true,
  style,
  testID,
}: SourceTruthInspectorTriggerProps) {
  const [visible, setVisible] = useState(false);
  const [inspectorMounted, setInspectorMounted] = useState(false);
  const triggerRef = useRef<React.ElementRef<typeof TouchableOpacity>>(null);
  const restoreFocusTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const model = useMemo(
    () => buildSourceTruthInspectorModel({
      source,
      policyKey,
      policyOverride,
      dependencies,
      now,
    }),
    [dependencies, now, policyKey, policyOverride, source],
  );
  const safeLabel = sanitizeSourceTruthDisplayText(label, 48);
  const triggerLabel = safeLabel && safeLabel !== '[redacted]'
    ? safeLabel
    : model.triggerLabel;

  useEffect(() => () => {
    if (restoreFocusTimer.current) clearTimeout(restoreFocusTimer.current);
  }, []);

  const open = useCallback((event?: { stopPropagation?: () => void }) => {
    event?.stopPropagation?.();
    if (restoreFocusTimer.current) clearTimeout(restoreFocusTimer.current);
    setInspectorMounted(true);
    setVisible(true);
  }, []);

  const close = useCallback(() => {
    setVisible(false);
    if (restoreFocusTimer.current) clearTimeout(restoreFocusTimer.current);
    restoreFocusTimer.current = setTimeout(() => {
      setInspectorMounted(false);
      const node = findNodeHandle(triggerRef.current);
      if (Platform.OS !== 'web' && node != null) {
        AccessibilityInfo.setAccessibilityFocus(node);
      }
    }, 260);
  }, []);

  return (
    <>
      <TouchableOpacity
        ref={triggerRef}
        testID={testID}
        style={[styles.trigger, style]}
        onPress={open}
        activeOpacity={0.78}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        accessibilityRole="button"
        accessibilityLabel={`Open source details for ${model.sourceName}. ${model.freshnessLabel} freshness. ${model.confidenceLabel} confidence.`}
        accessibilityHint="Opens source origin, timing, quality, warnings, and decision impact."
      >
        <ECSBadge
          label={triggerLabel}
          tone={badgeTone ?? model.triggerTone}
          icon={badgeIcon ?? model.triggerIcon}
          compact={compact}
        />
      </TouchableOpacity>
      {inspectorMounted ? (
        <SourceTruthInspector
          visible={visible}
          source={source}
          policyKey={policyKey}
          policyOverride={policyOverride}
          dependencies={dependencies}
          action={action}
          now={now}
          onClose={close}
        />
      ) : null}
    </>
  );
}

function InspectorSection({
  title,
  icon,
  rows,
}: {
  title: string;
  icon: React.ComponentProps<typeof ECSIcon>['name'];
  rows: SourceTruthInspectorRow[];
}) {
  return (
    <ECSPanel variant="quiet" style={styles.sectionPanel}>
      <ECSSectionHeader title={title} icon={icon} />
      <View>
        {rows.map((row, index) => (
          <ECSListRow
            key={row.id}
            label={row.label}
            noDivider={index === rows.length - 1}
          >
            <ECSText variant="body" style={styles.rowValue}>
              {row.value}
            </ECSText>
          </ECSListRow>
        ))}
      </View>
    </ECSPanel>
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
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: ECS_SURFACE.gap.group,
  },
  summaryText: {
    color: ECS.text,
    lineHeight: 17,
  },
  sectionPanel: {
    gap: ECS_SURFACE.gap.group,
  },
  rowValue: {
    flex: 1,
    maxWidth: '62%',
    color: ECS.text,
    textAlign: 'right',
    lineHeight: 16,
  },
  list: {
    gap: ECS_SURFACE.gap.group,
  },
  bulletRow: {
    minHeight: 34,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: ECS_SURFACE.gap.group,
    paddingVertical: 4,
  },
  bulletText: {
    flex: 1,
    color: ECS.text,
    lineHeight: 16,
  },
  warningRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: ECS_SURFACE.gap.group,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: ECS.strokeMuted,
    paddingTop: 8,
  },
  warningCopy: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  warningText: {
    color: ECS.text,
    lineHeight: 16,
  },
  warningCode: {
    alignSelf: 'flex-start',
    color: TACTICAL.textMuted,
    textTransform: 'uppercase',
  },
  actionReason: {
    color: TACTICAL.textMuted,
    textAlign: 'center',
  },
  trigger: {
    minWidth: 32,
    minHeight: 32,
    alignSelf: 'flex-start',
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default SourceTruthInspector;
