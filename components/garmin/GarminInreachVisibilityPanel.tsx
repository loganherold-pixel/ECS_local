import React, { useMemo, useState } from 'react';
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import ECSModalShell, { ECSOverlayFooter } from '../ECSModalShell';
import { SafeIcon as Ionicons } from '../SafeIcon';
import { ECS, GOLD_RAIL, TACTICAL } from '../../lib/theme';
import {
  buildGarminInreachVisibilityModel,
  type GarminInreachUiCommandType,
  type GarminInreachVisibilitySnapshot,
} from '../../lib/garmin/garminInreachVisibilityModel';
import {
  resolveGarminInreachConfigFromEnv,
  type GarminInreachIntegrationConfig,
} from '../../lib/garmin/garminInreachConfig';

type GarminInreachVisibilityPanelProps = {
  config?: GarminInreachIntegrationConfig;
  snapshot?: GarminInreachVisibilitySnapshot | null;
  now?: Date;
  onConfirmCommand?: (commandType: GarminInreachUiCommandType) => void;
};

export default function GarminInreachVisibilityPanel({
  config,
  snapshot,
  now,
  onConfirmCommand,
}: GarminInreachVisibilityPanelProps) {
  const resolvedConfig = useMemo(() => config ?? resolveGarminInreachConfigFromEnv(), [config]);
  const model = useMemo(
    () => buildGarminInreachVisibilityModel({ config: resolvedConfig, snapshot, now }),
    [now, resolvedConfig, snapshot],
  );
  const [pendingCommand, setPendingCommand] = useState<GarminInreachUiCommandType | null>(null);
  const pendingCommandModel = model?.commandControls.find((control) => control.type === pendingCommand) ?? null;

  if (!model) return null;

  const handleConfirmCommand = () => {
    if (!pendingCommand) return;
    onConfirmCommand?.(pendingCommand);
    setPendingCommand(null);
  };

  return (
    <>
      <View
        style={[
          styles.panel,
          model.sosBanner && styles.panelIncident,
          model.stale && styles.panelStale,
        ]}
        testID="garmin-inreach-visibility-panel"
      >
        <View style={styles.header}>
          <View style={styles.titleWrap}>
            <View style={styles.iconWrap}>
              <Ionicons name="radio-outline" size={18} color={TACTICAL.amber} />
            </View>
            <View style={styles.titleCopy}>
              <Text style={styles.title}>Garmin inReach</Text>
              <Text style={styles.subtitle} numberOfLines={1}>
                {model.deviceLabel} / {model.memberLabel}
              </Text>
            </View>
          </View>
          <View style={styles.sourceBadge}>
            <Text style={styles.sourceBadgeText}>{model.demoSynthetic ? 'DEMO / SYNTHETIC' : model.sourceMode}</Text>
          </View>
        </View>

        {model.sosBanner ? (
          <View style={styles.sosBanner} testID="garmin-sos-review-banner">
            <Ionicons name="warning-outline" size={15} color={TACTICAL.danger} />
            <View style={styles.sosCopy}>
              <Text style={styles.sosTitle}>{model.sosBanner.title}</Text>
              <Text style={styles.sosText}>{model.sosBanner.message}</Text>
              {model.sosBanner.humanReviewRequired ? (
                <Text style={styles.reviewRequired}>Human review required</Text>
              ) : null}
            </View>
          </View>
        ) : null}

        <View style={styles.grid}>
          <MetricTile
            icon="location-outline"
            label="Last position"
            value={model.lastPositionLabel}
            detail={model.positionAgeLabel}
            warning={model.stale}
          />
          <MetricTile
            icon="navigate-outline"
            label="Tracking"
            value={model.trackingStatusLabel}
            detail={model.commandPending ? 'Command pending' : 'No pending command'}
            warning={model.commandPending}
          />
          <MetricTile
            icon="battery-half-outline"
            label="Battery"
            value={model.batteryLabel}
            detail={model.lowBattery ? 'Low battery' : 'Battery status'}
            warning={model.lowBattery}
          />
        </View>

        <View style={styles.messageBlock}>
          <InfoRow label="Source" value={`${model.feedNameLabel} / ${model.readOnlyStatusLabel}`} />
          <InfoRow label="Last poll" value={model.lastSuccessfulPollLabel} />
          <InfoRow label="Last inbound" value={model.lastInboundMessageLabel} />
          <InfoRow label="Last command" value={model.lastOutboundCommandLabel} />
        </View>

        {model.canShowCommandControls ? (
          <View style={styles.commandBlock} testID="garmin-command-controls">
            <View style={styles.commandHeader}>
              <Text style={styles.commandTitle}>Operator Commands</Text>
              <Text style={styles.commandMeta}>{model.commandHelperText}</Text>
            </View>
            <Text style={styles.chargeWarning}>{model.chargeWarning}</Text>
            <View style={styles.commandRow}>
              {model.commandControls.map((control) => (
                <TouchableOpacity
                  key={control.type}
                  style={[styles.commandButton, !control.enabled && styles.commandButtonDisabled]}
                  disabled={!control.enabled}
                  activeOpacity={0.78}
                  onPress={() => setPendingCommand(control.type)}
                  accessibilityRole="button"
                  accessibilityLabel={control.label}
                  accessibilityHint="Requires confirmation before ECS queues a Garmin command request."
                  accessibilityState={{ disabled: !control.enabled }}
                >
                  <Ionicons name={iconForCommand(control.type)} size={13} color={control.enabled ? TACTICAL.amber : TACTICAL.textMuted} />
                  <Text style={[styles.commandButtonText, !control.enabled && styles.commandButtonTextDisabled]}>
                    {control.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ) : (
          <View style={styles.readOnlyBlock} testID="garmin-readonly-state">
            <Ionicons name="lock-closed-outline" size={12} color={TACTICAL.textMuted} />
            <Text style={styles.readOnlyText}>Read-only Garmin visibility. Command controls are hidden.</Text>
          </View>
        )}
      </View>

      <ECSModalShell
        visible={!!pendingCommandModel}
        onClose={() => setPendingCommand(null)}
        title={pendingCommandModel?.confirmationTitle ?? 'Confirm Garmin Command'}
        subtitle="ECS will queue a request only after operator confirmation."
        eyebrow="GARMIN INREACH"
        icon="radio-outline"
        overlayClass="dialog"
        footer={(
          <ECSOverlayFooter>
            <TouchableOpacity style={styles.modalSecondary} onPress={() => setPendingCommand(null)}>
              <Text style={styles.modalSecondaryText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.modalPrimary}
              onPress={handleConfirmCommand}
              testID="garmin-command-confirm"
            >
              <Text style={styles.modalPrimaryText}>Confirm</Text>
            </TouchableOpacity>
          </ECSOverlayFooter>
        )}
      >
        <View style={styles.modalBody}>
          <Text style={styles.modalCopy}>{pendingCommandModel?.confirmationBody}</Text>
          <Text style={styles.modalWarning}>May take up to 20 minutes. Charges may apply.</Text>
          <Text style={styles.modalFinePrint}>
            ECS treats Garmin command results as queued or requested unless explicit delivery confirmation is received.
          </Text>
        </View>
      </ECSModalShell>
    </>
  );
}

function MetricTile({
  icon,
  label,
  value,
  detail,
  warning,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  value: string;
  detail: string;
  warning?: boolean;
}) {
  return (
    <View style={[styles.metricTile, warning && styles.metricTileWarning]}>
      <View style={styles.metricHeader}>
        <Ionicons name={icon} size={13} color={warning ? TACTICAL.danger : TACTICAL.amber} />
        <Text style={styles.metricLabel}>{label}</Text>
      </View>
      <Text style={[styles.metricValue, warning && styles.metricValueWarning]} numberOfLines={1}>
        {value}
      </Text>
      <Text style={styles.metricDetail} numberOfLines={1}>{detail}</Text>
    </View>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue} numberOfLines={2}>{value}</Text>
    </View>
  );
}

function iconForCommand(command: GarminInreachUiCommandType): React.ComponentProps<typeof Ionicons>['name'] {
  switch (command) {
    case 'send_message':
      return 'chatbubble-outline';
    case 'request_location':
      return 'locate-outline';
    case 'start_tracking':
      return 'play-outline';
    case 'stop_tracking':
      return 'stop-outline';
    default:
      return 'radio-outline';
  }
}

const styles = StyleSheet.create({
  panel: {
    borderRadius: ECS.radius,
    borderWidth: 1,
    borderColor: GOLD_RAIL.section,
    backgroundColor: 'rgba(17,20,24,0.94)',
    padding: 11,
    gap: 11,
  },
  panelIncident: {
    borderColor: 'rgba(192,57,43,0.42)',
  },
  panelStale: {
    borderColor: 'rgba(212,160,23,0.42)',
  },
  header: {
    minHeight: 38,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  titleWrap: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  iconWrap: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: GOLD_RAIL.subsection,
    backgroundColor: ECS.accentSoft,
  },
  titleCopy: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    color: TACTICAL.text,
    fontSize: 14,
    fontWeight: '900',
  },
  subtitle: {
    marginTop: 2,
    color: TACTICAL.textMuted,
    fontSize: 10,
    fontWeight: '800',
  },
  sourceBadge: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: GOLD_RAIL.subsection,
    backgroundColor: ECS.accentSoft,
    paddingHorizontal: 7,
    paddingVertical: 4,
  },
  sourceBadgeText: {
    color: TACTICAL.amber,
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 0,
  },
  sosBanner: {
    flexDirection: 'row',
    gap: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(192,57,43,0.42)',
    backgroundColor: 'rgba(192,57,43,0.10)',
    padding: 9,
  },
  sosCopy: {
    flex: 1,
    gap: 3,
  },
  sosTitle: {
    color: TACTICAL.danger,
    fontSize: 11,
    fontWeight: '900',
  },
  sosText: {
    color: TACTICAL.text,
    fontSize: 10,
    lineHeight: 14,
  },
  reviewRequired: {
    color: TACTICAL.amber,
    fontSize: 9,
    fontWeight: '900',
  },
  grid: {
    flexDirection: 'row',
    gap: 8,
  },
  metricTile: {
    flex: 1,
    minHeight: 72,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: GOLD_RAIL.internal,
    backgroundColor: 'rgba(11,14,18,0.62)',
    padding: 8,
    gap: 5,
  },
  metricTileWarning: {
    borderColor: 'rgba(192,57,43,0.34)',
    backgroundColor: 'rgba(192,57,43,0.06)',
  },
  metricHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  metricLabel: {
    color: TACTICAL.textMuted,
    fontSize: 8,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  metricValue: {
    color: TACTICAL.text,
    fontSize: 10,
    fontWeight: '900',
  },
  metricValueWarning: {
    color: TACTICAL.danger,
  },
  metricDetail: {
    color: TACTICAL.textMuted,
    fontSize: 9,
    fontWeight: '700',
  },
  messageBlock: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: GOLD_RAIL.internal,
    backgroundColor: 'rgba(11,14,18,0.54)',
    padding: 9,
    gap: 7,
  },
  infoRow: {
    gap: 3,
  },
  infoLabel: {
    color: TACTICAL.textMuted,
    fontSize: 8,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  infoValue: {
    color: TACTICAL.text,
    fontSize: 10,
    lineHeight: 14,
    fontWeight: '700',
  },
  commandBlock: {
    gap: 8,
  },
  commandHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  commandTitle: {
    color: TACTICAL.text,
    fontSize: 11,
    fontWeight: '900',
  },
  commandMeta: {
    color: TACTICAL.textMuted,
    fontSize: 9,
    fontWeight: '800',
  },
  chargeWarning: {
    color: TACTICAL.amber,
    fontSize: 9,
    fontWeight: '900',
  },
  commandRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
  },
  commandButton: {
    minHeight: 38,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: GOLD_RAIL.subsection,
    backgroundColor: ECS.accentSoft,
    paddingHorizontal: 9,
    paddingVertical: 7,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  commandButtonDisabled: {
    opacity: 0.6,
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  commandButtonText: {
    color: TACTICAL.text,
    fontSize: 9,
    fontWeight: '900',
  },
  commandButtonTextDisabled: {
    color: TACTICAL.textMuted,
  },
  readOnlyBlock: {
    minHeight: 34,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: GOLD_RAIL.internal,
    backgroundColor: 'rgba(11,14,18,0.44)',
    paddingHorizontal: 9,
    paddingVertical: 7,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  readOnlyText: {
    color: TACTICAL.textMuted,
    fontSize: 10,
    fontWeight: '800',
  },
  modalBody: {
    gap: 9,
  },
  modalCopy: {
    color: TACTICAL.text,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
  },
  modalWarning: {
    color: TACTICAL.amber,
    fontSize: 12,
    fontWeight: '900',
  },
  modalFinePrint: {
    color: TACTICAL.textMuted,
    fontSize: 11,
    lineHeight: 16,
  },
  modalSecondary: {
    flex: 1,
    minHeight: 42,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: GOLD_RAIL.subsection,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  modalSecondaryText: {
    color: TACTICAL.text,
    fontSize: 12,
    fontWeight: '900',
  },
  modalPrimary: {
    flex: 1,
    minHeight: 42,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: GOLD_RAIL.subsection,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: ECS.accentSoft,
  },
  modalPrimaryText: {
    color: TACTICAL.amber,
    fontSize: 12,
    fontWeight: '900',
  },
});
