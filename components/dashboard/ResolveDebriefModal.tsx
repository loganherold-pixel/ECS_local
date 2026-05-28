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
import { useExpeditionFullBodyPopupProps } from './expeditionPopupLayout';
import type { IncidentContext } from '../../lib/types/incidentRecovery';
import type {
  IncidentDebriefInput,
  ResolveIncidentInput,
} from '../../lib/incidentRecoveryWorkflowStore';

type ResolveDebriefModalProps = {
  visible: boolean;
  onClose: () => void;
  incident?: IncidentContext | null;
  expeditionId?: string;
  onResolveIncident: (input: ResolveIncidentInput) => void;
  onSaveDebrief: (input: IncidentDebriefInput) => void;
};

type BooleanFieldProps = {
  label: string;
  value: boolean | null;
  onChange: (value: boolean | null) => void;
};

function isResolvedIncident(incident?: IncidentContext | null): boolean {
  return incident?.status === 'resolved' || incident?.status === 'closed' || incident?.status === 'cancelled';
}

function statusLabel(value: string | undefined): string {
  if (!value) return 'Unknown';
  return value
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function parseEquipment(value: string): string[] {
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function BooleanField({ label, value, onChange }: BooleanFieldProps) {
  const options: { label: string; value: boolean | null }[] = [
    { label: 'Yes', value: true },
    { label: 'No', value: false },
    { label: 'Unknown', value: null },
  ];
  return (
    <View style={styles.booleanRow}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.choiceRow}>
        {options.map((option) => {
          const selected = value === option.value;
          return (
            <TouchableOpacity
              key={option.label}
              style={[styles.choice, selected && styles.choiceSelected]}
              onPress={() => onChange(option.value)}
              activeOpacity={0.78}
            >
              <Text style={[styles.choiceText, selected && styles.choiceTextSelected]}>
                {option.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

export default function ResolveDebriefModal({
  visible,
  onClose,
  incident,
  expeditionId,
  onResolveIncident,
  onSaveDebrief,
}: ResolveDebriefModalProps) {
  const fullBodyPopupProps = useExpeditionFullBodyPopupProps();
  const [resolvedHow, setResolvedHow] = useState('');
  const [anyoneInjured, setAnyoneInjured] = useState<boolean | null>(null);
  const [vehicleDamaged, setVehicleDamaged] = useState<boolean | null>(null);
  const [outsideAssistanceUsed, setOutsideAssistanceUsed] = useState<boolean | null>(null);
  const [emergencyServicesContacted, setEmergencyServicesContacted] = useState<boolean | null>(null);
  const [finalNotes, setFinalNotes] = useState('');
  const [outcome, setOutcome] = useState('');
  const [injuries, setInjuries] = useState('');
  const [vehicleDamage, setVehicleDamage] = useState('');
  const [equipmentUsed, setEquipmentUsed] = useState('');
  const [whatWorked, setWhatWorked] = useState('');
  const [whatFailed, setWhatFailed] = useState('');
  const [planningGaps, setPlanningGaps] = useState('');
  const [routeHazards, setRouteHazards] = useState('');
  const [communicationIssues, setCommunicationIssues] = useState('');
  const [weatherTerrainMismatch, setWeatherTerrainMismatch] = useState('');
  const [futureRecommendations, setFutureRecommendations] = useState('');
  const [communityHazardReportRequested, setCommunityHazardReportRequested] = useState(false);
  const [routeConfidenceAdjustmentRequested, setRouteConfidenceAdjustmentRequested] = useState(false);
  const incidentDebrief = incident?.debrief;

  useEffect(() => {
    if (!visible || !incidentDebrief) return;
    const debrief = incidentDebrief;
    setResolvedHow(debrief.resolutionSummary ?? '');
    setAnyoneInjured(debrief.anyoneInjured ?? null);
    setVehicleDamaged(debrief.vehicleDamaged ?? null);
    setOutsideAssistanceUsed(debrief.outsideAssistanceUsed ?? null);
    setEmergencyServicesContacted(debrief.emergencyServicesContacted ?? null);
    setFinalNotes(debrief.finalNotes ?? '');
    setOutcome(debrief.outcome ?? '');
    setInjuries(debrief.injuries ?? '');
    setVehicleDamage(debrief.vehicleDamage ?? '');
    setEquipmentUsed((debrief.equipmentUsed ?? []).join(', '));
    setWhatWorked(debrief.whatWorked ?? '');
    setWhatFailed(debrief.whatFailed ?? '');
    setPlanningGaps(debrief.planningGaps ?? '');
    setRouteHazards(debrief.routeHazards ?? '');
    setCommunicationIssues(debrief.communicationIssues ?? '');
    setWeatherTerrainMismatch(debrief.weatherTerrainMismatch ?? '');
    setFutureRecommendations(debrief.futureRecommendations ?? '');
    setCommunityHazardReportRequested(debrief.communityHazardReportRequested === true);
    setRouteConfidenceAdjustmentRequested(debrief.routeConfidenceAdjustmentRequested === true);
  }, [incident?.id, incidentDebrief, visible]);

  const resolved = isResolvedIncident(incident);
  const resolveEnabled = !!incident && resolvedHow.trim().length > 0 && !resolved;
  const debriefEnabled = !!incident && outcome.trim().length > 0;

  const footer = useMemo(() => (
    <View style={styles.footer}>
      <TouchableOpacity style={[styles.footerButton, styles.secondaryButton]} onPress={onClose} activeOpacity={0.78}>
        <Text style={styles.secondaryButtonText}>Close</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.footerButton, styles.primaryButton, !debriefEnabled && styles.buttonDisabled]}
        disabled={!debriefEnabled}
        onPress={() => {
          if (!incident) return;
          onSaveDebrief({
            incidentId: incident.id,
            expeditionId: incident.expeditionId ?? expeditionId,
            outcome,
            injuries,
            vehicleDamage,
            equipmentUsed: parseEquipment(equipmentUsed),
            whatWorked,
            whatFailed,
            planningGaps,
            routeHazards,
            communicationIssues,
            weatherTerrainMismatch,
            futureRecommendations,
            communityHazardReportRequested,
            routeConfidenceAdjustmentRequested,
          });
          onClose();
        }}
        activeOpacity={0.78}
      >
        <Ionicons name="document-text-outline" size={15} color="#050608" />
        <Text style={styles.primaryButtonText}>Save Debrief</Text>
      </TouchableOpacity>
    </View>
  ), [
    communicationIssues,
    communityHazardReportRequested,
    debriefEnabled,
    equipmentUsed,
    expeditionId,
    futureRecommendations,
    incident,
    injuries,
    onClose,
    onSaveDebrief,
    outcome,
    planningGaps,
    routeConfidenceAdjustmentRequested,
    routeHazards,
    vehicleDamage,
    weatherTerrainMismatch,
    whatFailed,
    whatWorked,
  ]);

  return (
    <TacticalPopupShell
      visible={visible}
      onClose={onClose}
      title="Resolve / Debrief"
      icon="checkmark-done-outline"
      eyebrow="INCIDENT & RECOVERY"
      subtitle="Close the incident intentionally, then capture lessons for debrief intelligence review."
      overlayClass="workflow"
      {...fullBodyPopupProps}
      footer={footer}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {!incident ? (
          <View style={styles.section}>
            <Text style={styles.emptyTitle}>No incident selected</Text>
            <Text style={styles.emptyText}>
              Report an incident before resolving or creating an incident debrief. ECS will not close or fabricate an incident from this panel.
            </Text>
          </View>
        ) : (
          <>
            <View style={styles.summary}>
              <View style={styles.summaryCopy}>
                <Text style={styles.summaryTitle}>{incident.title}</Text>
                <Text style={styles.summaryText}>
                  {statusLabel(incident.status)} / {statusLabel(incident.severity)}
                </Text>
                <Text style={styles.summaryMeta} numberOfLines={1}>
                  {incident.locationLabel ?? incident.routeLabel ?? 'Location unknown'}
                </Text>
              </View>
              <View style={[styles.statusPill, resolved && styles.statusPillResolved]}>
                <Text style={[styles.statusPillText, resolved && styles.statusPillTextResolved]}>
                  {resolved ? 'RESOLVED' : 'ACTIVE'}
                </Text>
              </View>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Resolve incident</Text>
              <Text style={styles.contextText}>
                Marking resolved keeps the incident in recent status and prompts debrief capture. It does not close the expedition or publish anything externally.
              </Text>
              <TextInput
                style={styles.input}
                value={resolvedHow}
                onChangeText={setResolvedHow}
                placeholder="How was it resolved?"
                placeholderTextColor={TACTICAL.textMuted}
                multiline
                textAlignVertical="top"
              />
              <BooleanField label="Was anyone injured?" value={anyoneInjured} onChange={setAnyoneInjured} />
              <BooleanField label="Was the vehicle damaged?" value={vehicleDamaged} onChange={setVehicleDamaged} />
              <BooleanField label="Was outside assistance used?" value={outsideAssistanceUsed} onChange={setOutsideAssistanceUsed} />
              <BooleanField label="Were emergency services contacted?" value={emergencyServicesContacted} onChange={setEmergencyServicesContacted} />
              <TextInput
                style={styles.input}
                value={finalNotes}
                onChangeText={setFinalNotes}
                placeholder="Final notes"
                placeholderTextColor={TACTICAL.textMuted}
                multiline
                textAlignVertical="top"
              />
              <TouchableOpacity
                style={[styles.resolveButton, !resolveEnabled && styles.buttonDisabled]}
                disabled={!resolveEnabled}
                onPress={() => {
                  if (!incident) return;
                  onResolveIncident({
                    incidentId: incident.id,
                    expeditionId: incident.expeditionId ?? expeditionId,
                    resolvedHow,
                    anyoneInjured,
                    vehicleDamaged,
                    outsideAssistanceUsed,
                    emergencyServicesContacted,
                    finalNotes,
                  });
                }}
                activeOpacity={0.78}
              >
                <Ionicons name="shield-checkmark-outline" size={15} color="#050608" />
                <Text style={styles.resolveButtonText}>
                  {resolved ? 'Incident Resolved' : 'Resolve Incident'}
                </Text>
              </TouchableOpacity>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Incident debrief</Text>
              <TextInput
                style={styles.input}
                value={outcome}
                onChangeText={setOutcome}
                placeholder="Outcome"
                placeholderTextColor={TACTICAL.textMuted}
                multiline
                textAlignVertical="top"
              />
              <TextInput
                style={styles.input}
                value={injuries}
                onChangeText={setInjuries}
                placeholder="Injuries"
                placeholderTextColor={TACTICAL.textMuted}
              />
              <TextInput
                style={styles.input}
                value={vehicleDamage}
                onChangeText={setVehicleDamage}
                placeholder="Vehicle damage"
                placeholderTextColor={TACTICAL.textMuted}
              />
              <TextInput
                style={styles.input}
                value={equipmentUsed}
                onChangeText={setEquipmentUsed}
                placeholder="Equipment used, comma separated"
                placeholderTextColor={TACTICAL.textMuted}
              />
              <TextInput style={styles.input} value={whatWorked} onChangeText={setWhatWorked} placeholder="What worked" placeholderTextColor={TACTICAL.textMuted} multiline textAlignVertical="top" />
              <TextInput style={styles.input} value={whatFailed} onChangeText={setWhatFailed} placeholder="What failed" placeholderTextColor={TACTICAL.textMuted} multiline textAlignVertical="top" />
              <TextInput style={styles.input} value={planningGaps} onChangeText={setPlanningGaps} placeholder="Planning gaps" placeholderTextColor={TACTICAL.textMuted} multiline textAlignVertical="top" />
              <TextInput style={styles.input} value={routeHazards} onChangeText={setRouteHazards} placeholder="Route hazards" placeholderTextColor={TACTICAL.textMuted} multiline textAlignVertical="top" />
              <TextInput style={styles.input} value={communicationIssues} onChangeText={setCommunicationIssues} placeholder="Communication issues" placeholderTextColor={TACTICAL.textMuted} multiline textAlignVertical="top" />
              <TextInput style={styles.input} value={weatherTerrainMismatch} onChangeText={setWeatherTerrainMismatch} placeholder="Weather or terrain mismatch" placeholderTextColor={TACTICAL.textMuted} multiline textAlignVertical="top" />
              <TextInput style={styles.input} value={futureRecommendations} onChangeText={setFutureRecommendations} placeholder="Recommendations for future trips" placeholderTextColor={TACTICAL.textMuted} multiline textAlignVertical="top" />
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Review requests</Text>
              <View style={styles.switchRow}>
                <View style={styles.switchCopy}>
                  <Text style={styles.switchLabel}>Community hazard report</Text>
                  <Text style={styles.switchHint}>Capture a request only. Nothing is published automatically.</Text>
                </View>
                <Switch
                  value={communityHazardReportRequested}
                  onValueChange={setCommunityHazardReportRequested}
                  trackColor={{ false: 'rgba(255,255,255,0.08)', true: 'rgba(212,160,23,0.36)' }}
                  thumbColor={communityHazardReportRequested ? TACTICAL.amber : TACTICAL.textMuted}
                />
              </View>
              <View style={styles.switchRow}>
                <View style={styles.switchCopy}>
                  <Text style={styles.switchLabel}>Route confidence review</Text>
                  <Text style={styles.switchHint}>Capture a review request only. Route scoring is not changed here.</Text>
                </View>
                <Switch
                  value={routeConfidenceAdjustmentRequested}
                  onValueChange={setRouteConfidenceAdjustmentRequested}
                  trackColor={{ false: 'rgba(255,255,255,0.08)', true: 'rgba(212,160,23,0.36)' }}
                  thumbColor={routeConfidenceAdjustmentRequested ? TACTICAL.amber : TACTICAL.textMuted}
                />
              </View>
            </View>
          </>
        )}
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
  summary: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: GOLD_RAIL.section,
    backgroundColor: 'rgba(17,20,24,0.78)',
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  summaryCopy: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  summaryTitle: {
    color: TACTICAL.text,
    fontSize: 13,
    fontWeight: '900',
  },
  summaryText: {
    color: TACTICAL.textMuted,
    fontSize: 10,
    fontWeight: '800',
  },
  summaryMeta: {
    color: TACTICAL.textMuted,
    fontSize: 9,
    fontWeight: '700',
  },
  statusPill: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(192,57,43,0.34)',
    backgroundColor: 'rgba(192,57,43,0.12)',
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  statusPillResolved: {
    borderColor: 'rgba(76,175,80,0.28)',
    backgroundColor: 'rgba(76,175,80,0.10)',
  },
  statusPillText: {
    color: TACTICAL.danger,
    fontSize: 8,
    fontWeight: '900',
  },
  statusPillTextResolved: {
    color: TACTICAL.successText,
  },
  sectionTitle: {
    color: TACTICAL.amber,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  emptyTitle: {
    color: TACTICAL.text,
    fontSize: 13,
    fontWeight: '900',
  },
  emptyText: {
    color: TACTICAL.textMuted,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '700',
  },
  contextText: {
    color: TACTICAL.textMuted,
    fontSize: 10,
    lineHeight: 14,
    fontWeight: '700',
  },
  input: {
    minHeight: 42,
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
  booleanRow: {
    gap: 7,
  },
  fieldLabel: {
    color: TACTICAL.text,
    fontSize: 10,
    fontWeight: '900',
  },
  choiceRow: {
    flexDirection: 'row',
    gap: 7,
  },
  choice: {
    flex: 1,
    minHeight: 30,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: GOLD_RAIL.internal,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(11,14,18,0.72)',
  },
  choiceSelected: {
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
  resolveButton: {
    minHeight: 38,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 7,
    backgroundColor: TACTICAL.amber,
  },
  resolveButtonText: {
    color: '#050608',
    fontSize: 11,
    fontWeight: '900',
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  switchCopy: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  switchLabel: {
    color: TACTICAL.text,
    fontSize: 11,
    fontWeight: '900',
  },
  switchHint: {
    color: TACTICAL.textMuted,
    fontSize: 9,
    lineHeight: 12,
    fontWeight: '700',
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
  buttonDisabled: {
    opacity: 0.5,
  },
  primaryButtonText: {
    color: '#050608',
    fontSize: 11,
    fontWeight: '900',
  },
});
