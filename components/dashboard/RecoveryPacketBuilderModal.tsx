import React, { useEffect, useMemo, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import TacticalPopupShell from '../TacticalPopupShell';
import { SafeIcon as Ionicons } from '../SafeIcon';
import { GOLD_RAIL, TACTICAL } from '../../lib/theme';
import { useExpeditionFullBodyPopupProps } from './expeditionPopupLayout';
import type { OverlayStackBehavior } from '../../lib/overlayCoordinator';
import type {
  IncidentContext,
  IncidentCoordinate,
  IncidentRecoveryContextSnapshot,
  IncidentType,
} from '../../lib/types/incidentRecovery';
import { copyTextToClipboard } from '../../lib/clipboard';
import {
  buildRecoveryPacketDraft,
  buildRecoveryPacketExport,
  canExportRecoveryPacket,
  confirmRecoveryPacketLocation,
  formatRecoveryPacketCoordinates,
  recoveryPacketExportToText,
  type ConfirmedLocation,
  type PacketFreshnessLabel,
  type RecoveryPacketCoordinateFormat,
  type RecoveryPacketDraft,
  type RecoveryPacketIncidentType,
  type RecoveryPacketSourceField,
  type RecoveryPacketSourceKind,
  type RecoveryPacketSourceLabel,
} from '../../lib/recovery/recoveryPacketBuilder';

type RecoveryPacketBuilderModalProps = {
  visible: boolean;
  onClose: () => void;
  stackBehavior?: OverlayStackBehavior;
  activeIncident?: IncidentContext | null;
  contextSnapshot?: IncidentRecoveryContextSnapshot | null;
  gpsLocation?: IncidentCoordinate | null;
  confirmingUserId?: string;
  confirmingUserDisplayName?: string;
};

type IncidentOption = {
  value: RecoveryPacketIncidentType;
  label: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
};

const INCIDENT_OPTIONS: IncidentOption[] = [
  { value: 'stuck', label: 'Stuck', icon: 'trail-sign-outline' },
  { value: 'disabled_vehicle', label: 'Disabled vehicle', icon: 'construct-outline' },
  { value: 'injury_or_medical', label: 'Injury / medical', icon: 'medkit-outline' },
  { value: 'lost_or_disoriented', label: 'Lost / disoriented', icon: 'compass-outline' },
  { value: 'delayed', label: 'Delayed', icon: 'time-outline' },
  { value: 'weather_or_exposure', label: 'Weather / exposure', icon: 'thunderstorm-outline' },
  { value: 'recovery_assist_needed', label: 'Recovery assist needed', icon: 'radio-outline' },
  { value: 'other', label: 'Other', icon: 'ellipsis-horizontal-outline' },
];

const FORMAT_OPTIONS: { value: RecoveryPacketCoordinateFormat; label: string }[] = [
  { value: 'decimal_degrees', label: 'Decimal' },
  { value: 'degrees_minutes_seconds', label: 'DMS' },
  { value: 'utm', label: 'UTM' },
];

function source(
  sourceKind: RecoveryPacketSourceKind,
  freshness: PacketFreshnessLabel,
  sourceName?: string,
  timestamp?: string | null,
): RecoveryPacketSourceLabel {
  return {
    sourceKind,
    sourceName,
    freshness,
    observedAt: timestamp ?? undefined,
    updatedAt: timestamp ?? undefined,
  };
}

function valueField<T>(
  value: T | undefined | null,
  sourceKind: RecoveryPacketSourceKind,
  freshness: PacketFreshnessLabel,
  sourceName: string,
  timestamp?: string | null,
): RecoveryPacketSourceField<T> | undefined {
  if (value == null) return undefined;
  if (Array.isArray(value) && value.length === 0) return undefined;
  if (typeof value === 'string' && !value.trim()) return undefined;
  return {
    value,
    freshness,
    source: source(sourceKind, freshness, sourceName, timestamp),
  };
}

function mapIncidentType(type: IncidentType | undefined): RecoveryPacketIncidentType | undefined {
  switch (type) {
    case 'vehicle_stuck':
    case 'route_blocked':
      return 'stuck';
    case 'vehicle_breakdown':
      return 'disabled_vehicle';
    case 'medical':
      return 'injury_or_medical';
    case 'lost_or_off_route':
    case 'separated_party':
      return 'lost_or_disoriented';
    case 'weather_hazard':
    case 'environmental_hazard':
      return 'weather_or_exposure';
    case 'communication_failure':
    case 'fuel_water_supply':
    case 'camp_safety':
    case 'wildlife':
    case 'security':
    case 'other':
      return 'other';
    default:
      return undefined;
  }
}

function coordinateFromIncidentOrContext(
  activeIncident?: IncidentContext | null,
  gpsLocation?: IncidentCoordinate | null,
  contextSnapshot?: IncidentRecoveryContextSnapshot | null,
): IncidentCoordinate | null {
  return activeIncident?.location ?? gpsLocation ?? contextSnapshot?.route?.currentLocation ?? null;
}

function buildInitialLocation(
  activeIncident?: IncidentContext | null,
  gpsLocation?: IncidentCoordinate | null,
  contextSnapshot?: IncidentRecoveryContextSnapshot | null,
): ConfirmedLocation {
  const coordinate = coordinateFromIncidentOrContext(activeIncident, gpsLocation, contextSnapshot);
  if (!coordinate) {
    return {
      confirmed: false,
      selectedFormat: 'decimal_degrees',
      source: source('unknown', 'unavailable', 'No coordinate source'),
    };
  }
  return {
    confirmed: false,
    coordinates: {
      latitude: coordinate.latitude,
      longitude: coordinate.longitude,
      accuracyMeters: coordinate.accuracyMeters ?? undefined,
    },
    selectedFormat: 'decimal_degrees',
    formattedCoordinate: formatRecoveryPacketCoordinates({
      latitude: coordinate.latitude,
      longitude: coordinate.longitude,
      accuracyMeters: coordinate.accuracyMeters ?? undefined,
    }, 'decimal_degrees'),
    source: source(
      coordinate.source === 'gps' ? 'device_gps' : coordinate.source === 'dispatch' ? 'last_shared_coordinate' : 'map_selected',
      coordinate.capturedAt ? 'current' : 'stale',
      coordinate.source ?? 'coordinate source',
      coordinate.capturedAt,
    ),
  };
}

function buildDraft(args: {
  activeIncident?: IncidentContext | null;
  contextSnapshot?: IncidentRecoveryContextSnapshot | null;
  incidentType?: RecoveryPacketIncidentType;
  incidentNotes: string;
  confirmedLocation: ConfirmedLocation;
}): RecoveryPacketDraft {
  const snapshot = args.contextSnapshot;
  const incident = args.activeIncident;
  const now = new Date().toISOString();
  return buildRecoveryPacketDraft({
    packetId: incident ? `${incident.id}-recovery-packet` : `recovery-packet-${now}`,
    createdAt: incident?.reportedAt ?? now,
    updatedAt: incident?.updatedAt ?? snapshot?.updatedAt ?? now,
    incidentType: args.incidentType,
    incidentNotes: args.incidentNotes,
    confirmedLocation: args.confirmedLocation,
    activeRoute: valueField(
      snapshot?.summary?.routeLabel ?? incident?.routeLabel ?? snapshot?.route?.routeSegmentLabel,
      'navigate',
      snapshot?.route?.hasActiveRoute ? 'current' : 'unavailable',
      'Navigate Assist',
      snapshot?.updatedAt,
    ),
    vehicleProfile: valueField(
      snapshot?.summary?.vehicleSummary ?? snapshot?.vehicle?.label,
      'fleet',
      snapshot?.vehicle?.hasVehicleContext ? 'current' : 'unavailable',
      'Fleet',
      snapshot?.updatedAt,
    ),
    recoveryGear: valueField(snapshot?.vehicle?.recoveryEquipment, 'field_utilities', 'current', 'Field Utilities', snapshot?.updatedAt),
    teamRoster: valueField(
      snapshot?.convoy?.memberLabels,
      'dispatch_recovery',
      snapshot?.convoy?.hasConvoy ? 'current' : 'unavailable',
      'Dispatch Recovery',
      snapshot?.updatedAt,
    ),
    lastKnownCommsStatus: valueField(
      snapshot?.summary?.connectivitySummary ?? incident?.communicationStatus,
      'dispatch_recovery',
      snapshot?.connectivity?.online === false ? 'stale' : 'current',
      'Comms Status',
      snapshot?.updatedAt,
    ),
    offlineAvailability: valueField('Cached and offline data may be stale; verify before sharing.', 'offline_honesty', 'stale', 'Offline Honesty', snapshot?.updatedAt),
    weatherFreshness: valueField((incident?.metadata as any)?.resources?.weather, 'offline_cached', 'stale', 'Weather cache', incident?.updatedAt),
    nearbyBailoutCandidates: valueField('Bailout candidates are informational context only.', 'navigate', 'stale', 'Navigate Assist', snapshot?.updatedAt),
    garminInreachReviewSignals: [],
    networkShareAvailable: false,
  });
}

function freshnessTone(freshness: PacketFreshnessLabel): string {
  switch (freshness) {
    case 'current':
      return TACTICAL.successText;
    case 'user_entered':
      return TACTICAL.amber;
    case 'stale':
      return '#FFAB91';
    case 'unavailable':
    default:
      return TACTICAL.textMuted;
  }
}

export default function RecoveryPacketBuilderModal({
  visible,
  onClose,
  stackBehavior,
  activeIncident,
  contextSnapshot,
  gpsLocation,
  confirmingUserId = 'local-operator',
  confirmingUserDisplayName,
}: RecoveryPacketBuilderModalProps) {
  const fullBodyPopupProps = useExpeditionFullBodyPopupProps();
  const [incidentType, setIncidentType] = useState<RecoveryPacketIncidentType | undefined>(undefined);
  const [incidentNotes, setIncidentNotes] = useState('');
  const [confirmedLocation, setConfirmedLocation] = useState<ConfirmedLocation>(
    () => buildInitialLocation(activeIncident, gpsLocation, contextSnapshot),
  );
  const [copyMessage, setCopyMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setIncidentType(mapIncidentType(activeIncident?.type));
    setIncidentNotes(activeIncident?.summary ?? '');
    setConfirmedLocation(buildInitialLocation(activeIncident, gpsLocation, contextSnapshot));
    setCopyMessage(null);
  }, [activeIncident, contextSnapshot, gpsLocation, visible]);

  const draft = useMemo(
    () => buildDraft({ activeIncident, contextSnapshot, incidentType, incidentNotes, confirmedLocation }),
    [activeIncident, confirmedLocation, contextSnapshot, incidentNotes, incidentType],
  );
  const exportState = useMemo(() => canExportRecoveryPacket(draft), [draft]);
  const exportText = useMemo(() => {
    if (!exportState.canExport) return '';
    const exported = buildRecoveryPacketExport(draft, {
      exportedAt: new Date().toISOString(),
      exportedByUserId: confirmingUserId,
    });
    return recoveryPacketExportToText(exported);
  }, [confirmingUserId, draft, exportState.canExport]);

  const handleConfirmCoordinates = () => {
    if (!confirmedLocation.coordinates) {
      setCopyMessage('Coordinates unavailable. Enter or restore coordinates before confirming.');
      return;
    }
    try {
      setConfirmedLocation(confirmRecoveryPacketLocation({
        location: confirmedLocation,
        coordinates: confirmedLocation.coordinates,
        selectedFormat: confirmedLocation.selectedFormat,
        confirmedAt: new Date().toISOString(),
        confirmingUserId,
        confirmingUserDisplayName,
        source: {
          ...confirmedLocation.source,
          freshness: 'user_entered',
        },
      }));
      setCopyMessage('Confirmed coordinates recorded for this recovery packet.');
    } catch {
      setCopyMessage('Coordinates could not be confirmed.');
    }
  };

  const handleCopy = async () => {
    if (!exportText) return;
    const copied = await copyTextToClipboard(exportText);
    setCopyMessage(copied ? 'Recovery packet copied.' : 'Copy unavailable in this build.');
  };

  const handleDownloadText = async () => {
    if (!exportText) return;
    const maybeDocument = (globalThis as unknown as { document?: Document }).document;
    if (maybeDocument?.createElement) {
      const blob = new Blob([exportText], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const anchor = maybeDocument.createElement('a');
      anchor.href = url;
      anchor.download = `recovery-packet-${draft.packetId}.txt`;
      anchor.click();
      URL.revokeObjectURL(url);
      setCopyMessage('Recovery packet text download prepared.');
      return;
    }
    const copied = await copyTextToClipboard(exportText);
    setCopyMessage(copied ? 'Recovery packet copied for text export.' : 'Download unavailable in this build.');
  };

  const footer = (
    <View style={styles.footer}>
      <TouchableOpacity style={[styles.footerButton, styles.secondaryButton]} onPress={onClose} activeOpacity={0.78}>
        <Text style={styles.secondaryButtonText}>Close</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.footerButton, styles.secondaryButton, !exportState.canExport && styles.buttonDisabled]}
        disabled={!exportState.canExport}
        onPress={handleDownloadText}
        activeOpacity={0.78}
      >
        <Ionicons name="download-outline" size={15} color={TACTICAL.text} />
        <Text style={styles.secondaryButtonText}>Download Text</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.footerButton, styles.primaryButton, !exportState.canExport && styles.buttonDisabled]}
        disabled={!exportState.canExport}
        onPress={handleCopy}
        activeOpacity={0.78}
      >
        <Ionicons name="copy-outline" size={15} color="#050608" />
        <Text style={styles.primaryButtonText}>Copy Packet</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <TacticalPopupShell
      visible={visible}
      onClose={onClose}
      title="Build Recovery Packet"
      icon="document-text-outline"
      eyebrow="INCIDENT & RECOVERY"
      subtitle="Current user-facing/internal beta. Review facts, confirm coordinates, then export the same visible fields."
      overlayClass="workflow"
      stackBehavior={stackBehavior}
      {...fullBodyPopupProps}
      footer={footer}
    >
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <View style={styles.summary}>
          <Text style={styles.summaryTitle}>Recovery packet draft</Text>
          <Text style={styles.summaryText}>
            {exportState.canExport
              ? 'Export actions are enabled for this user-confirmed packet.'
              : exportState.reasons.join(' / ')}
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Manual Incident Type</Text>
          <View style={styles.optionGrid}>
            {INCIDENT_OPTIONS.map((option) => {
              const selected = incidentType === option.value;
              return (
                <TouchableOpacity
                  key={option.value}
                  style={[styles.typeOption, selected && styles.typeOptionSelected]}
                  onPress={() => setIncidentType(option.value)}
                  activeOpacity={0.78}
                >
                  <Ionicons name={option.icon} size={14} color={selected ? TACTICAL.amber : TACTICAL.textMuted} />
                  <Text style={[styles.typeOptionText, selected && styles.typeOptionTextSelected]} numberOfLines={2}>
                    {option.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <TextInput
            style={styles.input}
            value={incidentNotes}
            onChangeText={setIncidentNotes}
            placeholder="User-entered incident notes"
            placeholderTextColor={TACTICAL.textMuted}
            multiline
            textAlignVertical="top"
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Coordinate Review</Text>
          <Text style={styles.coordinateText}>
            {confirmedLocation.coordinates
              ? formatRecoveryPacketCoordinates(confirmedLocation.coordinates, confirmedLocation.selectedFormat)
              : 'Coordinates unavailable'}
          </Text>
          <View style={styles.choiceWrap}>
            {FORMAT_OPTIONS.map((option) => (
              <TouchableOpacity
                key={option.value}
                style={[styles.choicePill, confirmedLocation.selectedFormat === option.value && styles.choicePillSelected]}
                onPress={() => setConfirmedLocation((current) => ({
                  ...current,
                  selectedFormat: option.value,
                  formattedCoordinate: current.coordinates
                    ? formatRecoveryPacketCoordinates(current.coordinates, option.value)
                    : undefined,
                  confirmed: false,
                  confirmedAt: undefined,
                  confirmingUserId: undefined,
                  confirmingUserDisplayName: undefined,
                }))}
                activeOpacity={0.78}
              >
                <Text style={[styles.choiceText, confirmedLocation.selectedFormat === option.value && styles.choiceTextSelected]}>
                  {option.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity style={styles.confirmButton} onPress={handleConfirmCoordinates} activeOpacity={0.78}>
            <Ionicons name="checkmark-circle-outline" size={15} color="#050608" />
            <Text style={styles.confirmButtonText}>Confirm Coordinates</Text>
          </TouchableOpacity>
        </View>

        {draft.sections.map((section) => (
          <View key={section.sectionId} style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>{section.title}</Text>
              <Text style={styles.sectionMeta}>{draft.maturityLabel}</Text>
            </View>
            {section.fields.map((field) => (
              <View key={field.fieldId} style={styles.fieldRow}>
                <View style={styles.fieldCopy}>
                  <Text style={styles.fieldLabel}>{field.label}</Text>
                  <Text style={styles.fieldValue}>{field.value ?? field.unavailableReason ?? 'Unavailable'}</Text>
                  <Text style={styles.fieldSource}>
                    {field.source.sourceName ?? field.source.sourceKind}
                  </Text>
                </View>
                <Text style={[styles.freshness, { color: freshnessTone(field.freshness) }]}>
                  {field.freshness.replace('_', '-')}
                </Text>
              </View>
            ))}
            {(section.warnings ?? []).map((warning) => (
              <Text key={warning} style={styles.warningText}>{warning}</Text>
            ))}
          </View>
        ))}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Approved Share</Text>
          <Text style={styles.mutedText}>Approved share unavailable in this build.</Text>
        </View>
        {copyMessage ? <Text style={styles.copyMessage}>{copyMessage}</Text> : null}
      </ScrollView>
    </TacticalPopupShell>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: 12,
    paddingHorizontal: 14,
    paddingBottom: 14,
  },
  summary: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: GOLD_RAIL.section,
    backgroundColor: 'rgba(17,20,24,0.78)',
    padding: 12,
    gap: 6,
  },
  summaryTitle: {
    color: TACTICAL.text,
    fontSize: 13,
    fontWeight: '900',
  },
  summaryText: {
    color: TACTICAL.textMuted,
    fontSize: 10,
    lineHeight: 14,
    fontWeight: '700',
  },
  section: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: GOLD_RAIL.internal,
    backgroundColor: 'rgba(11,14,18,0.62)',
    padding: 12,
    gap: 10,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  sectionTitle: {
    color: TACTICAL.amber,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  sectionMeta: {
    color: TACTICAL.textMuted,
    fontSize: 8,
    fontWeight: '900',
  },
  optionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  typeOption: {
    width: '31%',
    minHeight: 54,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: GOLD_RAIL.internal,
    backgroundColor: 'rgba(17,20,24,0.72)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingHorizontal: 6,
  },
  typeOptionSelected: {
    borderColor: GOLD_RAIL.section,
    backgroundColor: 'rgba(212,160,23,0.10)',
  },
  typeOptionText: {
    color: TACTICAL.textMuted,
    fontSize: 8,
    lineHeight: 10,
    fontWeight: '800',
    textAlign: 'center',
  },
  typeOptionTextSelected: {
    color: TACTICAL.amber,
  },
  input: {
    minHeight: 70,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: GOLD_RAIL.internal,
    backgroundColor: 'rgba(17,20,24,0.72)',
    color: TACTICAL.text,
    paddingHorizontal: 10,
    paddingVertical: 9,
    fontSize: 11,
    fontWeight: '700',
  },
  coordinateText: {
    color: TACTICAL.text,
    fontSize: 13,
    fontWeight: '900',
  },
  choiceWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  choicePill: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: GOLD_RAIL.internal,
    backgroundColor: 'rgba(17,20,24,0.72)',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  choicePillSelected: {
    borderColor: GOLD_RAIL.section,
    backgroundColor: 'rgba(212,160,23,0.10)',
  },
  choiceText: {
    color: TACTICAL.textMuted,
    fontSize: 9,
    fontWeight: '800',
  },
  choiceTextSelected: {
    color: TACTICAL.amber,
  },
  confirmButton: {
    minHeight: 38,
    borderRadius: 10,
    backgroundColor: TACTICAL.amber,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 7,
  },
  confirmButtonText: {
    color: '#050608',
    fontSize: 10,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  fieldRow: {
    minHeight: 52,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: GOLD_RAIL.internal,
    backgroundColor: 'rgba(17,20,24,0.72)',
    paddingHorizontal: 10,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  fieldCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  fieldLabel: {
    color: TACTICAL.text,
    fontSize: 10,
    fontWeight: '900',
  },
  fieldValue: {
    color: TACTICAL.textMuted,
    fontSize: 9,
    lineHeight: 12,
    fontWeight: '700',
  },
  fieldSource: {
    color: TACTICAL.textMuted,
    fontSize: 8,
    fontWeight: '700',
  },
  freshness: {
    fontSize: 8,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  warningText: {
    color: '#FFAB91',
    fontSize: 9,
    lineHeight: 13,
    fontWeight: '800',
  },
  mutedText: {
    color: TACTICAL.textMuted,
    fontSize: 10,
    lineHeight: 14,
    fontWeight: '700',
  },
  copyMessage: {
    color: TACTICAL.amber,
    fontSize: 10,
    lineHeight: 14,
    fontWeight: '800',
    textAlign: 'center',
  },
  footer: {
    flexDirection: 'row',
    gap: 10,
  },
  footerButton: {
    flex: 1,
    minHeight: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 7,
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: GOLD_RAIL.internal,
    backgroundColor: 'rgba(17,20,24,0.72)',
  },
  secondaryButtonText: {
    color: TACTICAL.text,
    fontSize: 10,
    fontWeight: '900',
  },
  primaryButton: {
    backgroundColor: TACTICAL.amber,
  },
  primaryButtonText: {
    color: '#050608',
    fontSize: 10,
    fontWeight: '900',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
});
