import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { ECSButton } from '../ECSButton';
import { ECSBadge } from '../ECSStatus';
import { ECSPanel } from '../ECSSurface';
import { TACTICAL } from '../../lib/theme';
import { ECS_TEXT } from '../../lib/ecsTypographyTokens';
import { ECS_SURFACE } from '../../lib/ecsSurfaceTokens';
import {
  type LoadoutConsequencePreview,
  type LoadoutSuggestionAction,
  type LoadoutConsequenceSuggestion,
  type LoadoutConsequenceImpact,
} from '../../lib/fleet/loadoutConsequencePreview';
import { emitFleetTelemetryEvent } from '../../lib/fleet/fleetTelemetryEvents';

type ImpactId = 'topHeavy' | 'recovery' | 'routeFit';

type ImpactDetail = {
  id: ImpactId;
  label: string;
  impact: LoadoutConsequenceImpact;
  reasons: string[];
  clearCopy: string;
  improvementCopy: string;
};

type Props = {
  preview: LoadoutConsequencePreview | null;
  compact?: boolean;
  onSuggestionAccepted?: (suggestion: LoadoutConsequenceSuggestion) => void;
  onSuggestionAction?: (suggestion: LoadoutConsequenceSuggestion, action: LoadoutSuggestionAction) => void;
};

function formatLbs(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '--';
  const sign = value > 0 ? '+' : '';
  return `${sign}${Math.round(value).toLocaleString()} lb`;
}

function formatPlainLbs(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '--';
  return `${Math.round(value).toLocaleString()} lb`;
}

function formatPct(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '--';
  return `${Math.round(value * 10) / 10}%`;
}

function riskTone(level: LoadoutConsequencePreview['topHeavyRisk']['level']): React.ComponentProps<typeof ECSBadge>['tone'] {
  if (level === 'critical') return 'unavailable';
  if (level === 'caution' || level === 'watch') return 'warning';
  if (level === 'clear') return 'ready';
  return 'info';
}

function emitSuggestionEvent(
  name: 'suggestion_viewed' | 'suggestion_acknowledged' | 'suggestion_editor_opened' | 'suggestion_dismissed',
  preview: LoadoutConsequencePreview,
  suggestion: LoadoutConsequenceSuggestion,
  action?: LoadoutSuggestionAction,
) {
  emitFleetTelemetryEvent(name, {
    vehicleId: preview.vehicleId,
    meta: {
      suggestionId: suggestion.id,
      action: suggestion.action,
      actionId: action?.actionId ?? null,
      actionKind: action?.actionKind ?? null,
      canApplyAutomatically: action?.canApplyAutomatically ?? false,
      itemId: suggestion.itemId ?? null,
      itemName: suggestion.itemName,
      fromZone: suggestion.fromZone ?? null,
      targetZone: suggestion.targetZone ?? null,
      estimatedImpactLb: suggestion.estimatedImpactLb,
    },
  });
}

export default function LoadoutConsequencePreviewPanel({
  preview,
  compact = false,
  onSuggestionAccepted,
  onSuggestionAction,
}: Props) {
  const sourceWarnings = preview?.sourceWarnings.slice(0, compact ? 2 : 4) ?? [];
  const warningSignature = sourceWarnings.map((warning) => `${warning.id}:${warning.message}`).join('|');
  const [acknowledgedWarningSignature, setAcknowledgedWarningSignature] = React.useState<string | null>(null);
  const [selectedSuggestionId, setSelectedSuggestionId] = React.useState<string | null>(null);
  const [dismissedSuggestionIds, setDismissedSuggestionIds] = React.useState<Set<string>>(() => new Set());
  const [selectedImpactId, setSelectedImpactId] = React.useState<ImpactId>('topHeavy');
  const suggestionSignature = preview?.suggestions.map((suggestion) => suggestion.id).join('|') ?? 'none';
  React.useEffect(() => {
    setDismissedSuggestionIds(new Set());
    setSelectedSuggestionId(null);
    setSelectedImpactId('topHeavy');
  }, [preview?.vehicleId, preview?.generatedAt, suggestionSignature]);
  const suggestions = (preview?.suggestions ?? [])
    .filter((suggestion) => !dismissedSuggestionIds.has(suggestion.id))
    .slice(0, compact ? 2 : 3);
  const warningsAcknowledged = sourceWarnings.length > 0 && acknowledgedWarningSignature === warningSignature;
  const selectedSuggestion = suggestions.find((suggestion) => suggestion.id === selectedSuggestionId) ?? null;

  const handleViewSuggestion = (suggestion: LoadoutConsequenceSuggestion) => {
    if (!preview) return;
    setSelectedSuggestionId((current) => current === suggestion.id ? null : suggestion.id);
    emitSuggestionEvent('suggestion_viewed', preview, suggestion);
  };

  const handleSuggestionAction = (
    suggestion: LoadoutConsequenceSuggestion,
    action: LoadoutSuggestionAction,
  ) => {
    if (!preview) return;
    if (action.actionKind === 'dismiss') {
      setDismissedSuggestionIds((current) => {
        const next = new Set(current);
        next.add(suggestion.id);
        return next;
      });
      setSelectedSuggestionId((current) => current === suggestion.id ? null : current);
      emitSuggestionEvent('suggestion_dismissed', preview, suggestion, action);
      return;
    }
    if (!action.canApplyAutomatically && !onSuggestionAction) {
      emitSuggestionEvent(
        action.actionKind === 'open_editor' ? 'suggestion_editor_opened' : 'suggestion_acknowledged',
        preview,
        suggestion,
        action,
      );
    }
    onSuggestionAction?.(suggestion, action);
    if (!onSuggestionAction) onSuggestionAccepted?.(suggestion);
  };

  if (!preview) {
    return (
      <ECSPanel variant="compact" style={styles.panel}>
        <View style={styles.headerRow}>
          <Text style={styles.title}>Loadout Consequence Preview</Text>
          <ECSBadge label="CURRENT EXTENSION" tone="info" compact />
        </View>
        <Text style={styles.helper}>Stage a loadout change to preview payload, GVWR, recovery, and route-fit impact.</Text>
      </ECSPanel>
    );
  }

  const impactDetails: ImpactDetail[] = [
    {
      id: 'topHeavy',
      label: 'TOP-HEAVY',
      impact: preview.topHeavyRisk,
      reasons: preview.topHeavyRisk.reasons,
      clearCopy: 'High-mounted weight is not currently driving this staged change.',
      improvementCopy: 'Keep dense gear low, avoid adding roof weight, and move portable high-mounted items to bed-low or cab storage.',
    },
    {
      id: 'recovery',
      label: 'RECOVERY',
      impact: preview.recoveryDifficultyImpact,
      reasons: preview.recoveryDifficultyImpact.reasons,
      clearCopy: 'Recovery difficulty is not increasing from the staged loadout change.',
      improvementCopy: 'Reduce rear or hitch bias, keep recovery gear reachable, and verify trailer tongue weight when attached.',
    },
    {
      id: 'routeFit',
      label: 'ROUTE FIT',
      impact: preview.routeSuitabilityImpact,
      reasons: preview.routeSuitabilityImpact.reasons,
      clearCopy: 'Route fit is clear for the staged loadout signals ECS can see.',
      improvementCopy: 'Match added weight to route difficulty, terrain risk, remoteness, and available recovery posture before committing.',
    },
  ];
  const selectedImpact = impactDetails.find((detail) => detail.id === selectedImpactId) ?? impactDetails[0];
  const impactExplanation =
    selectedImpact.reasons.length > 0
      ? selectedImpact.reasons.slice(0, compact ? 2 : 3)
      : [
          selectedImpact.impact.level === 'unknown'
            ? 'ECS needs more route, source, or weight context before it can explain this status.'
            : selectedImpact.clearCopy,
        ];

  return (
    <ECSPanel variant={preview.availability === 'available' ? 'secondary' : 'warning'} style={styles.panel}>
      <View style={styles.headerRow}>
        <View style={styles.titleBlock}>
          <Text style={styles.eyebrow}>LOADOUT CONSEQUENCE PREVIEW</Text>
          <Text style={styles.title}>Before You Commit</Text>
        </View>
        <ECSBadge label="CURRENT EXTENSION" tone="info" compact />
      </View>

      <View style={styles.metricGrid}>
        <View style={styles.metricTile}>
          <Text style={styles.metricLabel}>PAYLOAD AFTER</Text>
          <Text style={styles.metricValue}>{formatPlainLbs(preview.payloadRemainingAfter)}</Text>
          <Text style={styles.metricDelta}>{formatLbs(preview.payloadDeltaLb)}</Text>
        </View>
        <View style={styles.metricTile}>
          <Text style={styles.metricLabel}>GVWR USE</Text>
          <Text style={styles.metricValue}>{formatPct(preview.gvwrPercentAfter)}</Text>
          <Text style={styles.metricDelta}>{formatPct(preview.gvwrPercentDelta)}</Text>
        </View>
        {impactDetails.map((detail) => {
          const selected = selectedImpact.id === detail.id;
          return (
            <TouchableOpacity
              key={detail.id}
              style={[styles.metricTile, styles.impactTile, selected && styles.metricTileSelected]}
              onPress={() => setSelectedImpactId(detail.id)}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={`${detail.label} status ${detail.impact.level}`}
            >
              <Text style={styles.metricLabel}>{detail.label}</Text>
              <ECSBadge label={detail.impact.level.toUpperCase()} tone={riskTone(detail.impact.level)} compact />
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={styles.impactExplanation}>
        <View style={styles.impactHeaderRow}>
          <ECSBadge label={selectedImpact.impact.level.toUpperCase()} tone={riskTone(selectedImpact.impact.level)} compact />
          <Text style={styles.impactTitle}>{selectedImpact.label}</Text>
        </View>
        {impactExplanation.map((reason) => (
          <Text key={reason} style={styles.impactReason} numberOfLines={compact ? 2 : 3}>
            {reason}
          </Text>
        ))}
        <Text style={styles.impactHelp} numberOfLines={compact ? 2 : 3}>
          What helps: {selectedImpact.improvementCopy}
        </Text>
      </View>

      {sourceWarnings.length > 0 ? (
        <View style={styles.warningStack}>
          {warningsAcknowledged ? (
            <View style={styles.acknowledgedRow}>
              <ECSBadge label="ACKNOWLEDGED" tone="ready" compact />
              <Text style={styles.warningText} numberOfLines={2}>
                Source warnings acknowledged for this staged preview. No loadout changes were made.
              </Text>
            </View>
          ) : (
            <>
              {sourceWarnings.map((warning) => (
                <View key={warning.id} style={styles.warningRow}>
                  <ECSBadge label={(warning.sourceKind ?? warning.severity).toUpperCase()} tone={warning.severity === 'critical' ? 'unavailable' : 'warning'} compact />
                  <Text style={styles.warningText} numberOfLines={2}>{warning.message}</Text>
                </View>
              ))}
              <ECSButton
                label="Acknowledge"
                icon="checkmark-circle-outline"
                variant="tertiary"
                size="compact"
                onPress={() => {
                  setAcknowledgedWarningSignature(warningSignature);
                  emitFleetTelemetryEvent('warning_acknowledged', { vehicleId: preview.vehicleId, meta: { warningCount: preview.sourceWarnings.length } });
                }}
              />
            </>
          )}
        </View>
      ) : null}

      {suggestions.length > 0 ? (
        <View style={styles.suggestionStack}>
          <Text style={styles.sectionLabel}>Remove or relocate</Text>
          {suggestions.map((suggestion) => {
            const hasDirectAction = suggestion.actions.some((action) =>
              action.actionKind === 'relocate_item' || action.actionKind === 'remove_item');
            return (
              <View key={suggestion.id} style={styles.suggestionRow}>
                <View style={styles.suggestionCopy}>
                  <Text style={styles.suggestionTitle} numberOfLines={1}>{suggestion.itemName}</Text>
                  <Text style={styles.suggestionReason} numberOfLines={3}>{suggestion.reason}</Text>
                  <Text style={styles.traceHint} numberOfLines={1}>
                    Trace: {suggestion.actions.map((action) => action.actionKind).join(' / ')}
                  </Text>
                </View>
                <View style={styles.suggestionActions}>
                  {hasDirectAction ? null : (
                    <ECSButton
                      label="View"
                      variant="tertiary"
                      size="compact"
                      onPress={() => handleViewSuggestion(suggestion)}
                    />
                  )}
                  {suggestion.actions.map((action) => (
                  <ECSButton
                    key={action.actionId}
                    label={action.label}
                    variant={action.canApplyAutomatically ? 'secondary' : 'tertiary'}
                    size="compact"
                    onPress={() => handleSuggestionAction(suggestion, action)}
                  />
                  ))}
                </View>
              </View>
            );
          })}
          {selectedSuggestion ? (
            <View style={styles.suggestionDetail}>
              <ECSBadge label="VIEWING" tone="info" compact />
              <View style={styles.suggestionDetailCopy}>
                <Text style={styles.suggestionTitle} numberOfLines={1}>{selectedSuggestion.itemName}</Text>
                <Text style={styles.suggestionReason} numberOfLines={3}>{selectedSuggestion.reason}</Text>
                <Text style={styles.traceHint} numberOfLines={2}>
                  Actions: {selectedSuggestion.actions.map((action) => action.label).join(' / ')}
                </Text>
              </View>
            </View>
          ) : null}
        </View>
      ) : (
        <Text style={styles.helper}>No remove or relocate suggestions from the available staged load.</Text>
      )}
    </ECSPanel>
  );
}

const styles = StyleSheet.create({
  panel: {
    gap: 10,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 10,
  },
  titleBlock: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  eyebrow: {
    ...ECS_TEXT.statLabel,
    color: TACTICAL.amber,
  },
  title: {
    ...ECS_TEXT.cardTitle,
    color: TACTICAL.text,
  },
  helper: {
    ...ECS_TEXT.helper,
    color: TACTICAL.textMuted,
    lineHeight: 16,
  },
  metricGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  metricTile: {
    flexGrow: 1,
    flexBasis: 118,
    minHeight: 58,
    borderWidth: 1,
    borderColor: ECS_SURFACE.border.quiet,
    borderRadius: 8,
    paddingHorizontal: 9,
    paddingVertical: 8,
    gap: 3,
    backgroundColor: ECS_SURFACE.background.compact,
  },
  impactTile: {
    justifyContent: 'space-between',
  },
  metricTileSelected: {
    borderColor: TACTICAL.amber,
  },
  metricLabel: {
    ...ECS_TEXT.statLabel,
  },
  metricValue: {
    ...ECS_TEXT.statValue,
    color: TACTICAL.text,
  },
  metricDelta: {
    ...ECS_TEXT.helper,
    color: TACTICAL.textMuted,
  },
  impactExplanation: {
    gap: 6,
    borderWidth: 1,
    borderColor: ECS_SURFACE.border.quiet,
    borderRadius: 8,
    paddingHorizontal: 9,
    paddingVertical: 8,
    backgroundColor: ECS_SURFACE.background.compact,
  },
  impactHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  impactTitle: {
    ...ECS_TEXT.statLabel,
    color: TACTICAL.text,
  },
  impactReason: {
    ...ECS_TEXT.helper,
    color: TACTICAL.textMuted,
    lineHeight: 16,
  },
  impactHelp: {
    ...ECS_TEXT.helper,
    color: TACTICAL.text,
    lineHeight: 16,
  },
  warningStack: {
    gap: 7,
  },
  warningRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 7,
  },
  acknowledgedRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 7,
    borderWidth: 1,
    borderColor: ECS_SURFACE.border.quiet,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 7,
    backgroundColor: ECS_SURFACE.background.compact,
  },
  warningText: {
    ...ECS_TEXT.helper,
    color: TACTICAL.textMuted,
    flex: 1,
    minWidth: 0,
    lineHeight: 16,
  },
  suggestionStack: {
    gap: 8,
  },
  sectionLabel: {
    ...ECS_TEXT.statLabel,
    color: TACTICAL.textMuted,
  },
  suggestionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: ECS_SURFACE.border.quiet,
    paddingTop: 8,
  },
  suggestionCopy: {
    flex: 1,
    minWidth: 170,
    gap: 2,
  },
  suggestionTitle: {
    ...ECS_TEXT.body,
    color: TACTICAL.text,
    fontWeight: '800',
  },
  suggestionReason: {
    ...ECS_TEXT.helper,
    color: TACTICAL.textMuted,
    lineHeight: 16,
  },
  traceHint: {
    ...ECS_TEXT.helper,
    color: TACTICAL.textMuted,
    fontSize: 10,
  },
  suggestionActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    gap: 6,
  },
  suggestionDetail: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    borderWidth: 1,
    borderColor: ECS_SURFACE.border.quiet,
    borderRadius: 8,
    paddingHorizontal: 9,
    paddingVertical: 8,
    backgroundColor: ECS_SURFACE.background.compact,
  },
  suggestionDetailCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
});
