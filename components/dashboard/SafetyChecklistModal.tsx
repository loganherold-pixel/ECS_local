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
import type {
  IncidentContext,
  IncidentCoordinate,
  IncidentRecoveryContextSnapshot,
} from '../../lib/types/incidentRecovery';
import type {
  SafetyChecklistInput,
  SafetyChecklistItemKey,
  SafetyChecklistItemValue,
} from '../../lib/incidentRecoveryWorkflowStore';

type SafetyChecklistModalProps = {
  visible: boolean;
  onClose: () => void;
  onSubmit: (input: SafetyChecklistInput) => void;
  activeIncident?: IncidentContext | null;
  expeditionId?: string;
  routeLabel?: string;
  gpsLocation?: IncidentCoordinate | null;
  contextSnapshot?: IncidentRecoveryContextSnapshot | null;
};

type SafetyChecklistConfig = {
  key: SafetyChecklistItemKey;
  label: string;
  hint: string;
  escalation?: string;
};

const CHECKLIST_ITEMS: SafetyChecklistConfig[] = [
  {
    key: 'everyoneAccountedFor',
    label: 'Everyone accounted for',
    hint: 'Confirm the full party is present or known.',
    escalation: 'Missing or separated people',
  },
  {
    key: 'injuriesAssessed',
    label: 'Injuries assessed',
    hint: 'Check for immediate medical or safety concerns.',
    escalation: 'Injury status unresolved',
  },
  {
    key: 'activeHazardsIdentified',
    label: 'Active hazards identified',
    hint: 'Fire, floodwater, terrain, traffic, weather, security, or other hazards.',
    escalation: 'Active hazards unresolved',
  },
  {
    key: 'locationCaptured',
    label: 'Location captured',
    hint: 'Use GPS, route segment, landmark, or manual fallback.',
    escalation: 'Location not confirmed',
  },
  {
    key: 'vehicleStabilityAssessed',
    label: 'Vehicle stability assessed',
    hint: 'Confirm the vehicle is stable before any recovery planning.',
    escalation: 'Vehicle stability unknown',
  },
  {
    key: 'communicationsChecked',
    label: 'Communications checked',
    hint: 'Cell, satellite, radio, or no-comms state is known.',
    escalation: 'Communication status unresolved',
  },
  {
    key: 'weatherDaylightReviewed',
    label: 'Weather and daylight reviewed',
    hint: 'Confirm conditions before moving past stabilization.',
  },
  {
    key: 'emergencyEscalationReviewed',
    label: 'Emergency escalation threshold reviewed',
    hint: 'Know when to contact emergency services, dispatch, or trusted support.',
  },
];

const DEFAULT_ITEMS: Record<SafetyChecklistItemKey, SafetyChecklistItemValue> = {
  everyoneAccountedFor: 'unknown',
  injuriesAssessed: 'unknown',
  activeHazardsIdentified: 'unknown',
  locationCaptured: 'unknown',
  vehicleStabilityAssessed: 'unknown',
  communicationsChecked: 'unknown',
  weatherDaylightReviewed: 'unknown',
  emergencyEscalationReviewed: 'unknown',
};

function getInitialItems(activeIncident?: IncidentContext | null): Record<SafetyChecklistItemKey, SafetyChecklistItemValue> {
  if (!activeIncident?.stabilizationChecklist?.items?.length) return DEFAULT_ITEMS;
  return CHECKLIST_ITEMS.reduce((acc, item) => {
    const existing = activeIncident.stabilizationChecklist?.items.find((entry) => entry.id.endsWith(item.key));
    acc[item.key] = existing?.state ?? (existing?.complete ? 'checked' : 'unknown');
    return acc;
  }, { ...DEFAULT_ITEMS });
}

function hasRisk(items: Record<SafetyChecklistItemKey, SafetyChecklistItemValue>): boolean {
  return (
    items.everyoneAccountedFor !== 'checked' ||
    items.injuriesAssessed !== 'checked' ||
    items.activeHazardsIdentified !== 'checked' ||
    items.locationCaptured !== 'checked' ||
    items.vehicleStabilityAssessed !== 'checked' ||
    items.communicationsChecked !== 'checked'
  );
}

function statusLabel(value: SafetyChecklistItemValue): string {
  if (value === 'checked') return 'Checked';
  if (value === 'unchecked') return 'Unchecked';
  return 'Unknown';
}

function ChecklistRow({
  item,
  value,
  onChange,
}: {
  item: SafetyChecklistConfig;
  value: SafetyChecklistItemValue;
  onChange: (value: SafetyChecklistItemValue) => void;
}) {
  return (
    <View style={styles.checkRow}>
      <View style={styles.checkCopy}>
        <Text style={styles.checkLabel}>{item.label}</Text>
        <Text style={styles.checkHint}>{item.hint}</Text>
      </View>
      <View style={styles.choiceRow}>
        {(['checked', 'unchecked', 'unknown'] as SafetyChecklistItemValue[]).map((choice) => {
          const selected = value === choice;
          return (
            <TouchableOpacity
              key={choice}
              style={[styles.choice, selected && styles.choiceSelected]}
              onPress={() => onChange(choice)}
              activeOpacity={0.78}
            >
              <Text style={[styles.choiceText, selected && styles.choiceTextSelected]}>
                {statusLabel(choice)}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

export default function SafetyChecklistModal({
  visible,
  onClose,
  onSubmit,
  activeIncident,
  expeditionId,
  routeLabel,
  gpsLocation,
  contextSnapshot,
}: SafetyChecklistModalProps) {
  const fullBodyPopupProps = useExpeditionFullBodyPopupProps();
  const [items, setItems] = useState<Record<SafetyChecklistItemKey, SafetyChecklistItemValue>>(() =>
    getInitialItems(activeIncident),
  );
  const [notes, setNotes] = useState('');
  const [createIncidentIfRiskFound, setCreateIncidentIfRiskFound] = useState(true);

  const riskFound = hasRisk(items);
  const checklistComplete = Object.values(items).every((value) => value === 'checked');
  const gpsAvailable = !!gpsLocation;
  const unresolvedEscalations = CHECKLIST_ITEMS
    .filter((item) => item.escalation && items[item.key] !== 'checked')
    .map((item) => item.escalation as string);

  const updateItem = (key: SafetyChecklistItemKey, value: SafetyChecklistItemValue) => {
    setItems((current) => ({ ...current, [key]: value }));
  };

  useEffect(() => {
    if (!visible) return;
    setItems(getInitialItems(activeIncident));
  }, [activeIncident, visible]);

  const footer = useMemo(() => (
    <View style={styles.footer}>
      <TouchableOpacity style={[styles.footerButton, styles.secondaryButton]} onPress={onClose} activeOpacity={0.78}>
        <Text style={styles.secondaryButtonText}>Cancel</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.footerButton, styles.primaryButton]}
        onPress={() => {
          onSubmit({
            incidentId: activeIncident?.id ?? null,
            expeditionId,
            routeId: contextSnapshot?.route?.routeId ?? null,
            routeLabel: activeIncident?.routeLabel ?? routeLabel,
            routeSegmentLabel: contextSnapshot?.route?.routeSegmentLabel ?? null,
            location: activeIncident?.location ?? gpsLocation ?? null,
            items,
            notes,
            createIncidentIfRiskFound,
            contextSnapshot,
          });
          onClose();
        }}
        activeOpacity={0.78}
      >
        <Ionicons name="shield-checkmark-outline" size={15} color="#050608" />
        <Text style={styles.primaryButtonText}>
          {!activeIncident && riskFound && createIncidentIfRiskFound ? 'Save + Create Incident' : 'Save Checklist'}
        </Text>
      </TouchableOpacity>
    </View>
  ), [
    activeIncident,
    createIncidentIfRiskFound,
    contextSnapshot,
    expeditionId,
    gpsLocation,
    items,
    notes,
    onClose,
    onSubmit,
    riskFound,
    routeLabel,
  ]);

  return (
    <TacticalPopupShell
      visible={visible}
      onClose={onClose}
      title="Safety Checklist"
      icon="shield-checkmark-outline"
      eyebrow="INCIDENT & RECOVERY"
      subtitle="Stabilize people, location, communication, and hazards before assessment or recovery planning."
      overlayClass="workflow"
      {...fullBodyPopupProps}
      footer={footer}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.section}>
          <View style={styles.contextHeader}>
            <View style={styles.contextCopy}>
              <Text style={styles.sectionTitle}>Stabilization first</Text>
              <Text style={styles.contextText}>
                {activeIncident
                  ? `${activeIncident.title} / ${activeIncident.status}`
                  : 'No active incident. You can still run a safety check before creating one.'}
              </Text>
              <Text style={styles.contextMeta}>
                {gpsAvailable ? 'GPS available for location capture' : 'GPS unavailable; confirm location manually if needed'}
              </Text>
            </View>
            <View style={[styles.checklistStatusPill, checklistComplete ? styles.checklistStatusComplete : styles.checklistStatusAttention]}>
              {checklistComplete ? (
                <Ionicons name="checkmark-circle-outline" size={13} color={TACTICAL.successText} />
              ) : (
                <Ionicons name="alert-circle-outline" size={13} color={TACTICAL.amber} />
              )}
              <Text style={[styles.checklistStatusText, checklistComplete ? styles.checklistStatusTextComplete : styles.checklistStatusTextAttention]}>
                {checklistComplete ? 'Complete' : 'Attention needed'}
              </Text>
            </View>
            {!activeIncident ? (
              <View style={styles.createSwitch}>
                <Text style={styles.switchText}>Create incident if risk found</Text>
                <Switch
                  value={createIncidentIfRiskFound}
                  onValueChange={setCreateIncidentIfRiskFound}
                  trackColor={{ false: 'rgba(255,255,255,0.08)', true: 'rgba(212,160,23,0.36)' }}
                  thumbColor={createIncidentIfRiskFound ? TACTICAL.amber : TACTICAL.textMuted}
                />
              </View>
            ) : null}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Checklist</Text>
          {CHECKLIST_ITEMS.map((item) => (
            <ChecklistRow
              key={item.key}
              item={item}
              value={items[item.key]}
              onChange={(value) => updateItem(item.key, value)}
            />
          ))}
        </View>

        <View style={[styles.section, unresolvedEscalations.length > 0 && styles.escalationSection]}>
          <Text style={styles.sectionTitle}>Escalation triggers</Text>
          {unresolvedEscalations.length > 0 ? (
            unresolvedEscalations.map((trigger) => (
              <View key={trigger} style={styles.triggerRow}>
                <Ionicons name="alert-circle-outline" size={14} color={TACTICAL.amber} />
                <Text style={styles.triggerText}>{trigger}</Text>
              </View>
            ))
          ) : (
            <Text style={styles.contextText}>No escalation triggers from the current checklist state.</Text>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Notes</Text>
          <TextInput
            style={styles.notesInput}
            value={notes}
            onChangeText={setNotes}
            placeholder="Safety notes only. Recovery planning happens after stabilization."
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
  escalationSection: {
    borderColor: 'rgba(212,160,23,0.34)',
    backgroundColor: 'rgba(212,160,23,0.07)',
  },
  sectionTitle: {
    color: TACTICAL.amber,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  contextHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  contextCopy: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  contextText: {
    color: TACTICAL.text,
    fontSize: 11,
    fontWeight: '800',
  },
  contextMeta: {
    color: TACTICAL.textMuted,
    fontSize: 10,
    fontWeight: '700',
  },
  checklistStatusPill: {
    minHeight: 28,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 9,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  },
  checklistStatusComplete: {
    borderColor: 'rgba(76,175,80,0.34)',
    backgroundColor: 'rgba(76,175,80,0.10)',
  },
  checklistStatusAttention: {
    borderColor: 'rgba(212,160,23,0.34)',
    backgroundColor: 'rgba(212,160,23,0.08)',
  },
  checklistStatusText: {
    fontSize: 9,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  checklistStatusTextComplete: {
    color: TACTICAL.successText,
  },
  checklistStatusTextAttention: {
    color: TACTICAL.amber,
  },
  createSwitch: {
    width: 150,
    alignItems: 'flex-end',
    gap: 5,
  },
  switchText: {
    color: TACTICAL.textMuted,
    fontSize: 9,
    fontWeight: '800',
    textAlign: 'right',
  },
  checkRow: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: GOLD_RAIL.internal,
    backgroundColor: 'rgba(17,20,24,0.72)',
    padding: 10,
    gap: 9,
  },
  checkCopy: {
    gap: 3,
  },
  checkLabel: {
    color: TACTICAL.text,
    fontSize: 11,
    fontWeight: '900',
  },
  checkHint: {
    color: TACTICAL.textMuted,
    fontSize: 9,
    lineHeight: 12,
    fontWeight: '700',
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
  triggerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  triggerText: {
    color: TACTICAL.text,
    fontSize: 10,
    fontWeight: '800',
  },
  notesInput: {
    minHeight: 86,
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
