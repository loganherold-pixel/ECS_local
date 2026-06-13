import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

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
} from '../../lib/fleet/loadoutConsequencePreview';
import { emitFleetTelemetryEvent } from '../../lib/fleet/fleetTelemetryEvents';

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
  name: 'suggestion_viewed' | 'suggestion_acknowledged' | 'suggestion_editor_opened',
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

  const sourceWarnings = preview.sourceWarnings.slice(0, compact ? 2 : 4);
  const suggestions = preview.suggestions.slice(0, compact ? 2 : 3);

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
        <View style={styles.metricTile}>
          <Text style={styles.metricLabel}>TOP-HEAVY</Text>
          <ECSBadge label={preview.topHeavyRisk.level.toUpperCase()} tone={riskTone(preview.topHeavyRisk.level)} compact />
        </View>
        <View style={styles.metricTile}>
          <Text style={styles.metricLabel}>RECOVERY</Text>
          <ECSBadge label={preview.recoveryDifficultyImpact.level.toUpperCase()} tone={riskTone(preview.recoveryDifficultyImpact.level)} compact />
        </View>
        <View style={styles.metricTile}>
          <Text style={styles.metricLabel}>ROUTE FIT</Text>
          <ECSBadge label={preview.routeSuitabilityImpact.level.toUpperCase()} tone={riskTone(preview.routeSuitabilityImpact.level)} compact />
        </View>
      </View>

      <Text style={styles.mainRisk} numberOfLines={compact ? 2 : 3}>
        Main risk: {preview.mainRisk}
      </Text>

      {sourceWarnings.length > 0 ? (
        <View style={styles.warningStack}>
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
            onPress={() => emitFleetTelemetryEvent('warning_acknowledged', { vehicleId: preview.vehicleId, meta: { warningCount: preview.sourceWarnings.length } })}
          />
        </View>
      ) : null}

      {suggestions.length > 0 ? (
        <View style={styles.suggestionStack}>
          <Text style={styles.sectionLabel}>Remove or relocate</Text>
          {suggestions.map((suggestion) => (
            <View key={suggestion.id} style={styles.suggestionRow}>
              <View style={styles.suggestionCopy}>
                <Text style={styles.suggestionTitle} numberOfLines={1}>{suggestion.itemName}</Text>
                <Text style={styles.suggestionReason} numberOfLines={2}>{suggestion.reason}</Text>
                <Text style={styles.traceHint} numberOfLines={1}>
                  Trace: {suggestion.actions.map((action) => action.actionKind).join(' / ')}
                </Text>
              </View>
              <View style={styles.suggestionActions}>
                <ECSButton
                  label="View"
                  variant="tertiary"
                  size="compact"
                  onPress={() => emitSuggestionEvent('suggestion_viewed', preview, suggestion)}
                />
                {suggestion.actions.slice(0, 1).map((action) => (
                  <ECSButton
                    key={action.actionId}
                    label={action.label}
                    variant={action.canApplyAutomatically ? 'secondary' : 'tertiary'}
                    size="compact"
                    onPress={() => {
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
                    }}
                  />
                ))}
              </View>
            </View>
          ))}
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
  mainRisk: {
    ...ECS_TEXT.body,
    color: TACTICAL.text,
    lineHeight: 18,
  },
  warningStack: {
    gap: 7,
  },
  warningRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 7,
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
});
