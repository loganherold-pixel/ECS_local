import React, { useEffect, useMemo, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import TacticalPopupShell from '../TacticalPopupShell';
import { SafeIcon as Ionicons } from '../SafeIcon';
import { GOLD_RAIL, TACTICAL } from '../../lib/theme';
import { EXPEDITION_FULL_BODY_POPUP_PROPS } from './expeditionPopupLayout';
import type {
  IncidentCommunicationStatus,
  IncidentCoordinate,
  IncidentRecoveryContextSnapshot,
  IncidentType,
} from '../../lib/types/incidentRecovery';
import type {
  ReportIncidentInput,
  ReportIncidentResourceState,
  ReportIncidentSafetyState,
} from '../../lib/incidentRecoveryWorkflowStore';
import {
  deriveIncidentCommunicationStatusFromContext,
  getIncidentRecoveryContextDefaultResources,
} from '../../lib/incidentRecoveryContextAdapter';

type ReportIncidentModalProps = {
  visible: boolean;
  onClose: () => void;
  onSubmit: (input: ReportIncidentInput) => void;
  expeditionId?: string;
  routeLabel?: string;
  gpsLocation?: IncidentCoordinate | null;
  contextSnapshot?: IncidentRecoveryContextSnapshot | null;
  prefill?: ReportIncidentInput | null;
};

type IncidentTypeOption = {
  value: IncidentType;
  label: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
};

type BooleanResourceKey =
  | 'fuelConcern'
  | 'waterConcern'
  | 'foodConcern'
  | 'shelterConcern'
  | 'warmthConcern'
  | 'medicalKitAvailable';

const INCIDENT_TYPE_OPTIONS: IncidentTypeOption[] = [
  { value: 'vehicle_stuck', label: 'Vehicle stuck', icon: 'trail-sign-outline' },
  { value: 'vehicle_breakdown', label: 'Vehicle breakdown', icon: 'construct-outline' },
  { value: 'medical', label: 'Medical / safety concern', icon: 'medkit-outline' },
  { value: 'route_blocked', label: 'Route blocked', icon: 'map-outline' },
  { value: 'lost_or_off_route', label: 'Lost / off-route', icon: 'compass-outline' },
  { value: 'separated_party', label: 'Separated party', icon: 'people-outline' },
  { value: 'weather_hazard', label: 'Weather hazard', icon: 'thunderstorm-outline' },
  { value: 'environmental_hazard', label: 'Environmental hazard', icon: 'warning-outline' },
  { value: 'fuel_water_supply', label: 'Fuel / water / supply issue', icon: 'cube-outline' },
  { value: 'communication_failure', label: 'Communication failure', icon: 'radio-outline' },
  { value: 'camp_safety', label: 'Camp safety', icon: 'bonfire-outline' },
  { value: 'wildlife', label: 'Wildlife', icon: 'paw-outline' },
  { value: 'security', label: 'Security', icon: 'lock-closed-outline' },
  { value: 'other', label: 'Other', icon: 'ellipsis-horizontal-outline' },
];

const COMMUNICATION_OPTIONS: { value: IncidentCommunicationStatus; label: string }[] = [
  { value: 'available', label: 'Cell signal' },
  { value: 'emergency_only', label: 'Satellite messenger' },
  { value: 'degraded', label: 'Radio' },
  { value: 'offline', label: 'No communication' },
  { value: 'unknown', label: 'Unknown' },
];

const RESOURCE_STATUS_OPTIONS: { key: BooleanResourceKey; label: string }[] = [
  { key: 'fuelConcern', label: 'Fuel' },
  { key: 'waterConcern', label: 'Water' },
  { key: 'foodConcern', label: 'Food' },
  { key: 'shelterConcern', label: 'Shelter' },
  { key: 'warmthConcern', label: 'Warmth' },
  { key: 'medicalKitAvailable', label: 'Medical kit' },
];

const DEFAULT_SAFETY: ReportIncidentSafetyState = {
  anyoneInjured: null,
  anyoneMissing: null,
  anyoneTrapped: null,
  activeHazard: null,
  vehicleStable: null,
  groupSafe: null,
};

const DEFAULT_RESOURCES: ReportIncidentResourceState = {
  vehicleDisabled: null,
  terrain: '',
  weather: '',
  daylight: '',
  fuelConcern: null,
  waterConcern: null,
  foodConcern: null,
  shelterConcern: null,
  warmthConcern: null,
  medicalKitAvailable: null,
};

function boolLabel(value: boolean | null): string {
  if (value == null) return 'Unknown';
  return value ? 'Yes' : 'No';
}

function ToggleQuestion({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean | null;
  onChange: (value: boolean | null) => void;
}) {
  return (
    <View style={styles.questionRow}>
      <Text style={styles.questionLabel}>{label}</Text>
      <View style={styles.choiceRow}>
        {[
          { label: 'Unknown', value: null },
          { label: 'Yes', value: true },
          { label: 'No', value: false },
        ].map((choice) => {
          const selected = value === choice.value;
          return (
            <TouchableOpacity
              key={choice.label}
              style={[styles.smallChoice, selected && styles.smallChoiceSelected]}
              onPress={() => onChange(choice.value)}
              activeOpacity={0.78}
            >
              <Text style={[styles.smallChoiceText, selected && styles.smallChoiceTextSelected]}>
                {choice.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

export default function ReportIncidentModal({
  visible,
  onClose,
  onSubmit,
  expeditionId,
  routeLabel,
  gpsLocation,
  contextSnapshot,
  prefill,
}: ReportIncidentModalProps) {
  const [incidentType, setIncidentType] = useState<IncidentType>('vehicle_stuck');
  const [safety, setSafety] = useState<ReportIncidentSafetyState>(DEFAULT_SAFETY);
  const [useGpsLocation, setUseGpsLocation] = useState(true);
  const [manualLocationDescription, setManualLocationDescription] = useState('');
  const [communicationStatus, setCommunicationStatus] = useState<IncidentCommunicationStatus>('unknown');
  const [resources, setResources] = useState<ReportIncidentResourceState>(DEFAULT_RESOURCES);
  const [notes, setNotes] = useState('');

  const gpsAvailable = !!gpsLocation;
  const selectedLocation = useGpsLocation && gpsAvailable ? gpsLocation : null;
  const locationMissing = !selectedLocation && !manualLocationDescription.trim();

  useEffect(() => {
    if (!visible) return;
    setCommunicationStatus(deriveIncidentCommunicationStatusFromContext(contextSnapshot));
    setResources((current) => ({
      ...current,
      ...getIncidentRecoveryContextDefaultResources(contextSnapshot),
    }));
    if (!manualLocationDescription && contextSnapshot?.route?.routeSegmentLabel) {
      setManualLocationDescription(contextSnapshot.route.routeSegmentLabel);
    }
  }, [contextSnapshot, manualLocationDescription, visible]);

  useEffect(() => {
    if (!visible || !prefill) return;
    setIncidentType(prefill.type);
    setSafety(prefill.safety);
    setUseGpsLocation(!!prefill.location);
    setManualLocationDescription(prefill.manualLocationDescription ?? '');
    setCommunicationStatus(prefill.communicationStatus);
    setResources(prefill.resources);
    setNotes(prefill.notes ?? '');
  }, [prefill, visible]);

  const footer = useMemo(() => (
    <View style={styles.footer}>
      <TouchableOpacity style={[styles.footerButton, styles.secondaryButton]} onPress={onClose} activeOpacity={0.78}>
        <Text style={styles.secondaryButtonText}>Cancel</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.footerButton, styles.primaryButton]}
        onPress={() => {
          onSubmit({
            expeditionId,
            routeId: contextSnapshot?.route?.routeId ?? null,
            routeLabel: routeLabel ?? contextSnapshot?.route?.routeLabel ?? undefined,
            routeSegmentLabel: contextSnapshot?.route?.routeSegmentLabel ?? null,
            type: incidentType,
            manualLocationDescription,
            location: selectedLocation,
            communicationStatus,
            safety,
            resources,
            contextSnapshot,
            notes,
            assessmentEscalation: prefill?.assessmentEscalation ?? null,
          });
          onClose();
        }}
        activeOpacity={0.78}
      >
        <Ionicons name="send-outline" size={15} color="#050608" />
        <Text style={styles.primaryButtonText}>Submit Incident</Text>
      </TouchableOpacity>
    </View>
  ), [
    communicationStatus,
    contextSnapshot,
    expeditionId,
    incidentType,
    manualLocationDescription,
    notes,
    onClose,
    onSubmit,
    prefill?.assessmentEscalation,
    resources,
    routeLabel,
    safety,
    selectedLocation,
  ]);

  const updateSafety = <K extends keyof ReportIncidentSafetyState>(
    key: K,
    value: ReportIncidentSafetyState[K],
  ) => setSafety((current) => ({ ...current, [key]: value }));

  const updateResources = <K extends keyof ReportIncidentResourceState>(
    key: K,
    value: ReportIncidentResourceState[K],
  ) => setResources((current) => ({ ...current, [key]: value }));

  return (
    <TacticalPopupShell
      visible={visible}
      onClose={onClose}
      title="Report Incident"
      icon="warning-outline"
      eyebrow="INCIDENT & RECOVERY"
      subtitle="Capture the facts ECS needs before safety checklist and recovery assessment."
      overlayClass="workflow"
      {...EXPEDITION_FULL_BODY_POPUP_PROPS}
      footer={footer}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>What happened?</Text>
          <View style={styles.typeGrid}>
            {INCIDENT_TYPE_OPTIONS.map((option) => {
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
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Immediate safety</Text>
          <ToggleQuestion label="Is anyone injured?" value={safety.anyoneInjured} onChange={(value) => updateSafety('anyoneInjured', value)} />
          <ToggleQuestion label="Is anyone missing?" value={safety.anyoneMissing} onChange={(value) => updateSafety('anyoneMissing', value)} />
          <ToggleQuestion label="Is anyone trapped?" value={safety.anyoneTrapped} onChange={(value) => updateSafety('anyoneTrapped', value)} />
          <ToggleQuestion label="Is there an active hazard?" value={safety.activeHazard} onChange={(value) => updateSafety('activeHazard', value)} />
          <ToggleQuestion label="Is the vehicle stable?" value={safety.vehicleStable} onChange={(value) => updateSafety('vehicleStable', value)} />
          <ToggleQuestion label="Is the group in a safe location?" value={safety.groupSafe} onChange={(value) => updateSafety('groupSafe', value)} />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Location</Text>
          {incidentType === 'separated_party' || incidentType === 'communication_failure' ? (
            <View style={styles.contextHint}>
              <Ionicons name="people-outline" size={14} color={TACTICAL.amber} />
              <Text style={styles.contextHintText}>
                Last known location, last contact time, and communication channel should be captured before recovery planning.
              </Text>
            </View>
          ) : null}
          <View style={styles.locationRow}>
            <View style={styles.locationCopy}>
              <Text style={styles.locationTitle}>Use current GPS</Text>
              <Text style={[styles.locationText, locationMissing && styles.warningText]}>
                {gpsAvailable
                  ? `${gpsLocation?.latitude.toFixed(5)}, ${gpsLocation?.longitude.toFixed(5)}`
                  : 'GPS unavailable. Add a manual location description.'}
              </Text>
            </View>
            <Switch
              value={useGpsLocation && gpsAvailable}
              onValueChange={setUseGpsLocation}
              disabled={!gpsAvailable}
              trackColor={{ false: 'rgba(255,255,255,0.08)', true: 'rgba(212,160,23,0.36)' }}
              thumbColor={useGpsLocation && gpsAvailable ? TACTICAL.amber : TACTICAL.textMuted}
            />
          </View>
          {routeLabel ? (
            <Text style={styles.routeText}>Route context: {routeLabel}</Text>
          ) : null}
          <TextInput
            style={styles.input}
            value={manualLocationDescription}
            onChangeText={setManualLocationDescription}
            placeholder="Manual location description, route segment, mile marker, landmark..."
            placeholderTextColor={TACTICAL.textMuted}
            multiline
            textAlignVertical="top"
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Communications</Text>
          <View style={styles.choiceWrap}>
            {COMMUNICATION_OPTIONS.map((option) => {
              const selected = communicationStatus === option.value;
              return (
                <TouchableOpacity
                  key={option.value}
                  style={[styles.choicePill, selected && styles.choicePillSelected]}
                  onPress={() => setCommunicationStatus(option.value)}
                  activeOpacity={0.78}
                >
                  <Text style={[styles.choicePillText, selected && styles.choicePillTextSelected]}>
                    {option.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Vehicle / environment / logistics</Text>
          <ToggleQuestion label="Vehicle disabled?" value={resources.vehicleDisabled} onChange={(value) => updateResources('vehicleDisabled', value)} />
          <View style={styles.inputGrid}>
            <TextInput
              style={[styles.input, styles.compactInput]}
              value={resources.terrain}
              onChangeText={(value) => updateResources('terrain', value)}
              placeholder="Terrain"
              placeholderTextColor={TACTICAL.textMuted}
            />
            <TextInput
              style={[styles.input, styles.compactInput]}
              value={resources.weather}
              onChangeText={(value) => updateResources('weather', value)}
              placeholder="Weather"
              placeholderTextColor={TACTICAL.textMuted}
            />
            <TextInput
              style={[styles.input, styles.compactInput]}
              value={resources.daylight}
              onChangeText={(value) => updateResources('daylight', value)}
              placeholder="Daylight"
              placeholderTextColor={TACTICAL.textMuted}
            />
          </View>
          <View style={styles.choiceWrap}>
            {RESOURCE_STATUS_OPTIONS.map(({ key, label }) => {
              const value = resources[key];
              return (
                <TouchableOpacity
                  key={key}
                  style={[styles.choicePill, value === true && styles.choicePillSelected]}
                  onPress={() => updateResources(key, value === true ? false : true)}
                  activeOpacity={0.78}
                >
                  <Text style={[styles.choicePillText, value === true && styles.choicePillTextSelected]}>
                    {label}: {boolLabel(value)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Notes</Text>
          <TextInput
            style={[styles.input, styles.notesInput]}
            value={notes}
            onChangeText={setNotes}
            placeholder="Short incident notes. Do not add recovery instructions yet."
            placeholderTextColor={TACTICAL.textMuted}
            multiline
            textAlignVertical="top"
          />
        </View>
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
  section: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: GOLD_RAIL.internal,
    backgroundColor: 'rgba(11,14,18,0.62)',
    padding: 12,
    gap: 10,
  },
  sectionTitle: {
    color: TACTICAL.amber,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  typeGrid: {
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
    backgroundColor: 'rgba(17,20,24,0.76)',
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
    color: TACTICAL.text,
  },
  questionRow: {
    gap: 7,
  },
  questionLabel: {
    color: TACTICAL.text,
    fontSize: 11,
    fontWeight: '800',
  },
  choiceRow: {
    flexDirection: 'row',
    gap: 7,
  },
  smallChoice: {
    flex: 1,
    minHeight: 30,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: GOLD_RAIL.internal,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(17,20,24,0.72)',
  },
  smallChoiceSelected: {
    borderColor: GOLD_RAIL.section,
    backgroundColor: 'rgba(212,160,23,0.10)',
  },
  smallChoiceText: {
    color: TACTICAL.textMuted,
    fontSize: 9,
    fontWeight: '800',
  },
  smallChoiceTextSelected: {
    color: TACTICAL.amber,
  },
  contextHint: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: GOLD_RAIL.internal,
    backgroundColor: 'rgba(212,160,23,0.08)',
    paddingHorizontal: 10,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  contextHintText: {
    flex: 1,
    color: TACTICAL.text,
    fontSize: 10,
    lineHeight: 14,
    fontWeight: '800',
  },
  locationRow: {
    minHeight: 48,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: GOLD_RAIL.internal,
    backgroundColor: 'rgba(17,20,24,0.72)',
    paddingHorizontal: 10,
    paddingVertical: 9,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  locationCopy: {
    flex: 1,
    minWidth: 0,
  },
  locationTitle: {
    color: TACTICAL.text,
    fontSize: 11,
    fontWeight: '900',
  },
  locationText: {
    marginTop: 2,
    color: TACTICAL.textMuted,
    fontSize: 10,
    fontWeight: '700',
  },
  warningText: {
    color: TACTICAL.amber,
  },
  routeText: {
    color: TACTICAL.textMuted,
    fontSize: 10,
    fontWeight: '800',
  },
  input: {
    minHeight: 46,
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
  inputGrid: {
    flexDirection: 'row',
    gap: 8,
  },
  compactInput: {
    flex: 1,
  },
  notesInput: {
    minHeight: 90,
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
  choicePillText: {
    color: TACTICAL.textMuted,
    fontSize: 9,
    fontWeight: '800',
  },
  choicePillTextSelected: {
    color: TACTICAL.amber,
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
    fontSize: 11,
    fontWeight: '900',
  },
  primaryButton: {
    backgroundColor: TACTICAL.amber,
  },
  primaryButtonText: {
    color: '#050608',
    fontSize: 11,
    fontWeight: '900',
  },
});
