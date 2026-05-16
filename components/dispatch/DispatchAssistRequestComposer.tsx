import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import ECSModalShell, { ECSOverlayFooter } from '../ECSModalShell';
import { SafeIcon as Ionicons } from '../SafeIcon';
import {
  getDispatchContextTypeLabel,
} from '../../lib/dispatchContextAdapter';
import {
  getPriorityWeight,
  type DispatchAssistRequestType,
  type DispatchLinkedContext,
  type DispatchPriority,
  type DispatchQueueItemStatus,
  type DispatchTeamMember,
} from '../../lib/dispatchTypes';
import {
  getDispatchRoutingOptions,
  resolveDispatchRecipients,
  type DispatchRecipientMode,
  type DispatchRoutingRole,
} from '../../lib/dispatchRoutingAdapter';
import type { DispatchComposerPermissionSet } from '../../lib/dispatchPermissionAdapter';
import { ECS, GOLD_RAIL, TACTICAL } from '../../lib/theme';

type EscalationTimer = 'none' | '5' | '10' | '15' | '30';

export interface DispatchAssistRequestSubmit {
  assistType: DispatchAssistRequestType;
  priority: DispatchPriority;
  recipientMode: DispatchRecipientMode;
  recipientId?: string;
  role?: DispatchRoutingRole;
  linkedContext?: DispatchLinkedContext;
  message: string;
  requireAcknowledgment: boolean;
  escalationTimer: EscalationTimer;
  status: DispatchQueueItemStatus;
}

interface DispatchAssistRequestComposerProps {
  visible: boolean;
  members: DispatchTeamMember[];
  contexts: DispatchLinkedContext[];
  permissions?: DispatchComposerPermissionSet;
  onClose: () => void;
  onSubmit: (payload: DispatchAssistRequestSubmit) => void;
}

const ASSIST_TYPES: { value: DispatchAssistRequestType; label: string; template: string }[] = [
  { value: 'vehicle', label: 'Vehicle', template: 'Vehicle support requested. Confirm availability and nearest position.' },
  { value: 'medical', label: 'Medical', template: 'Medical support requested. Confirm status and available responder.' },
  { value: 'navigation', label: 'Navigation', template: 'Navigation assistance requested. Confirm route and nearest waypoint.' },
  { value: 'fuel', label: 'Fuel', template: 'Fuel support requested. Report reserve level and transfer availability.' },
  { value: 'water', label: 'Water', template: 'Water support requested. Report potable reserve and transfer availability.' },
  { value: 'mechanical', label: 'Mechanical', template: 'Mechanical support requested. Confirm tools, parts, and responder availability.' },
  { value: 'comms', label: 'Comms', template: 'Comms support requested. Establish relay and report contact status.' },
  { value: 'recovery', label: 'Recovery', template: 'Recovery support requested. Confirm safe approach and recovery gear availability.' },
  { value: 'general_support', label: 'General Support', template: 'Support requested. Confirm availability and estimated response.' },
];

const PRIORITIES: DispatchPriority[] = ['low', 'normal', 'high', 'critical'];
const ESCALATION_TIMERS: { value: EscalationTimer; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: '5', label: '5 min' },
  { value: '10', label: '10 min' },
  { value: '15', label: '15 min' },
  { value: '30', label: '30 min' },
];

const STATUS_OPTIONS: { value: DispatchQueueItemStatus; label: string }[] = [
  { value: 'new', label: 'New' },
  { value: 'pending_response', label: 'Pending' },
  { value: 'assigned', label: 'Assigned' },
  { value: 'blocked', label: 'Blocked' },
  { value: 'escalated', label: 'Escalated' },
];

export default function DispatchAssistRequestComposer({
  visible,
  members,
  contexts,
  permissions,
  onClose,
  onSubmit,
}: DispatchAssistRequestComposerProps) {
  const [assistType, setAssistType] = useState<DispatchAssistRequestType>('vehicle');
  const [priority, setPriority] = useState<DispatchPriority>('high');
  const [recipientMode, setRecipientMode] = useState<DispatchRecipientMode>('all');
  const [recipientId, setRecipientId] = useState<string | undefined>();
  const [role, setRole] = useState<DispatchRoutingRole | undefined>();
  const [linkedContextId, setLinkedContextId] = useState<string>('none');
  const [message, setMessage] = useState(ASSIST_TYPES[0].template);
  const [requireAcknowledgment, setRequireAcknowledgment] = useState(true);
  const [escalationTimer, setEscalationTimer] = useState<EscalationTimer>('10');
  const [status, setStatus] = useState<DispatchQueueItemStatus>('pending_response');
  const [validationError, setValidationError] = useState<string | null>(null);

  const roleOptions = useMemo(() => {
    return getDispatchRoutingOptions(members);
  }, [members]);

  const selectedContext = useMemo(
    () => contexts.find((context) => context.id === linkedContextId),
    [contexts, linkedContextId],
  );

  useEffect(() => {
    if (!visible) return;

    setAssistType('vehicle');
    setPriority('high');
    setRecipientMode(permissions?.canSendTeamWide === false ? 'member' : 'all');
    setRecipientId(undefined);
    setRole(undefined);
    setLinkedContextId('none');
    setMessage(ASSIST_TYPES[0].template);
    setRequireAcknowledgment(true);
    setEscalationTimer('10');
    setStatus('pending_response');
    setValidationError(null);
  }, [permissions?.canSendTeamWide, visible]);

  const handleAssistTypePress = (nextType: DispatchAssistRequestType) => {
    const next = ASSIST_TYPES.find((item) => item.value === nextType) ?? ASSIST_TYPES[0];
    setAssistType(next.value);
    setMessage(next.template);
    setValidationError(null);
  };

  const handlePriorityPress = (nextPriority: DispatchPriority) => {
    if (nextPriority === 'critical' && permissions?.canSendEmergency === false) {
      setValidationError(permissions.disabledReason);
      return;
    }

    setPriority(nextPriority);
    if (nextPriority === 'critical') {
      setRequireAcknowledgment(true);
      setEscalationTimer((current) => current === 'none' ? '5' : current);
    }
  };

  const handleSubmit = () => {
    if (recipientMode === 'member' && !recipientId) {
      setValidationError('Select a team member.');
      return;
    }
    if (recipientMode === 'role' && !role) {
      setValidationError('Select a role group.');
      return;
    }
    const resolution = resolveDispatchRecipients({
      selection: { recipientMode, recipientId, role },
      members,
      includeUnavailable: priority === 'critical',
      priority,
      pingType: priority === 'critical' ? 'emergency' : 'assist',
    });
    if (resolution.warning) {
      setValidationError(resolution.warning);
      return;
    }
    if (recipientMode === 'all' && permissions?.canSendTeamWide === false) {
      setValidationError(permissions.disabledReason);
      return;
    }
    if (recipientMode === 'member' && permissions?.canSendIndividual === false) {
      setValidationError(permissions.disabledReason);
      return;
    }
    if (recipientMode === 'role' && permissions?.canTargetRoles === false) {
      setValidationError(permissions.disabledReason);
      return;
    }
    if (priority === 'critical' && permissions?.canSendEmergency === false) {
      setValidationError(permissions.disabledReason);
      return;
    }
    if (!message.trim()) {
      setValidationError('Enter an assist request message.');
      return;
    }

    onSubmit({
      assistType,
      priority,
      recipientMode,
      recipientId,
      role,
      linkedContext: selectedContext,
      message: message.trim(),
      requireAcknowledgment,
      escalationTimer,
      status,
    });
  };

  return (
    <ECSModalShell
      visible={visible}
      onClose={onClose}
      title="Assist Request"
      subtitle="Structured team support request. ECS team coordination only."
      eyebrow="DISPATCH"
      icon="medkit-outline"
      overlayClass="editor"
      maxWidth={760}
      footer={
        <ECSOverlayFooter>
          <TouchableOpacity style={styles.secondaryButton} onPress={onClose} activeOpacity={0.76}>
            <Text style={styles.secondaryButtonText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.primaryButton, priority === 'critical' ? styles.criticalButton : null]}
            onPress={handleSubmit}
            activeOpacity={0.76}
          >
            <Text style={styles.primaryButtonText}>Create Assist</Text>
          </TouchableOpacity>
        </ECSOverlayFooter>
      }
    >
      <View style={styles.form}>
        <View style={[styles.disclaimerCard, priority === 'critical' ? styles.disclaimerCritical : null]}>
          <Ionicons
            name={priority === 'critical' ? 'warning-outline' : 'information-circle-outline'}
            size={15}
            color={priority === 'critical' ? TACTICAL.danger : TACTICAL.amber}
          />
          <Text style={styles.disclaimerText}>
            ECS team coordination only. This does not contact emergency services or send external messages.
          </Text>
        </View>

        <FieldBlock label="Assist Type">
          <View style={styles.optionGrid}>
            {ASSIST_TYPES.map((item) => (
              <ChoicePill
                key={item.value}
                label={item.label}
                selected={assistType === item.value}
                danger={item.value === 'medical' || item.value === 'recovery'}
                onPress={() => handleAssistTypePress(item.value)}
              />
            ))}
          </View>
        </FieldBlock>

        <FieldBlock label="Priority">
          <View style={styles.optionGrid}>
            {PRIORITIES.map((item) => (
              <ChoicePill
                key={item}
                label={`${item.toUpperCase()} ${getPriorityWeight(item)}`}
                selected={priority === item}
                danger={item === 'critical'}
                disabled={item === 'critical' && permissions?.canSendEmergency === false}
                disabledReason={permissions?.disabledReason}
                onPress={() => handlePriorityPress(item)}
              />
            ))}
          </View>
        </FieldBlock>

        <FieldBlock label="Target">
          <View style={styles.segmentRow}>
            <ChoicePill
              label="All Team"
              selected={recipientMode === 'all'}
              disabled={permissions?.canSendTeamWide === false}
              disabledReason={permissions?.disabledReason}
              onPress={() => setRecipientMode('all')}
            />
            <ChoicePill
              label="Member"
              selected={recipientMode === 'member'}
              disabled={permissions?.canSendIndividual === false}
              disabledReason={permissions?.disabledReason}
              onPress={() => setRecipientMode('member')}
            />
            <ChoicePill
              label="Role"
              selected={recipientMode === 'role'}
              disabled={permissions?.canTargetRoles === false}
              disabledReason={permissions?.disabledReason}
              onPress={() => setRecipientMode('role')}
            />
          </View>

          {recipientMode === 'member' ? (
            <View style={styles.optionGrid}>
              {members.map((member) => (
                <ChoicePill
                  key={member.id}
                  label={member.callSign}
                  selected={recipientId === member.id}
                  onPress={() => setRecipientId(member.id)}
                />
              ))}
            </View>
          ) : null}

          {recipientMode === 'role' ? (
            <View style={styles.optionGrid}>
              {roleOptions.map((roleOption) => (
                <ChoicePill
                  key={roleOption.id}
                  label={`${roleOption.label} (${roleOption.count})`}
                  selected={role === roleOption.id}
                  onPress={() => setRole(roleOption.id)}
                />
              ))}
            </View>
          ) : null}
        </FieldBlock>

        <FieldBlock label="Location / Context">
          <View style={styles.optionGrid}>
            <ChoicePill label="None" selected={linkedContextId === 'none'} onPress={() => setLinkedContextId('none')} />
            {contexts.map((context) => (
              <ChoicePill
                key={context.id}
                label={`${getDispatchContextTypeLabel(context.type)} / ${context.title}`}
                selected={linkedContextId === context.id}
                onPress={() => setLinkedContextId(context.id)}
              />
            ))}
          </View>
        </FieldBlock>

        <FieldBlock label="Message">
          <TextInput
            style={[styles.messageInput, priority === 'critical' ? styles.messageInputCritical : null]}
            value={message}
            onChangeText={(text) => {
              setMessage(text);
              setValidationError(null);
            }}
            multiline
            placeholder="Assist details..."
            placeholderTextColor={TACTICAL.textMuted}
          />
        </FieldBlock>

        <View style={styles.inlineSettingRow}>
          <View style={styles.settingCopy}>
            <Text style={styles.settingLabel}>Require Acknowledgment</Text>
            <Text style={styles.settingDetail}>Emergency assist requests keep this enabled.</Text>
          </View>
          <TouchableOpacity
            style={[styles.toggle, requireAcknowledgment ? styles.toggleOn : null]}
            onPress={() => {
              if (priority !== 'critical') {
                setRequireAcknowledgment((current) => !current);
              }
            }}
            activeOpacity={priority === 'critical' ? 1 : 0.76}
            accessibilityRole="switch"
            accessibilityState={{ checked: requireAcknowledgment, disabled: priority === 'critical' }}
          >
            <View style={[styles.toggleKnob, requireAcknowledgment ? styles.toggleKnobOn : null]} />
          </TouchableOpacity>
        </View>

        <FieldBlock label="Escalation Timer">
          <View style={styles.optionGrid}>
            {ESCALATION_TIMERS.map((timer) => (
              <ChoicePill
                key={timer.value}
                label={timer.label}
                selected={escalationTimer === timer.value}
                danger={timer.value !== 'none' && priority === 'critical'}
                onPress={() => setEscalationTimer(timer.value)}
              />
            ))}
          </View>
        </FieldBlock>

        <FieldBlock label="Current Status">
          <View style={styles.optionGrid}>
            {STATUS_OPTIONS.map((item) => (
              <ChoicePill
                key={item.value}
                label={item.label}
                selected={status === item.value}
                danger={item.value === 'escalated'}
                onPress={() => setStatus(item.value)}
              />
            ))}
          </View>
        </FieldBlock>

        {validationError ? (
          <View style={styles.validationCard}>
            <Ionicons name="alert-circle-outline" size={14} color={TACTICAL.danger} />
            <Text style={styles.validationText}>{validationError}</Text>
          </View>
        ) : null}
      </View>
    </ECSModalShell>
  );
}

function FieldBlock({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.fieldBlock}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {children}
    </View>
  );
}

function ChoicePill({
  label,
  selected,
  danger,
  disabled,
  disabledReason,
  onPress,
}: {
  label: string;
  selected: boolean;
  danger?: boolean;
  disabled?: boolean;
  disabledReason?: string;
  onPress: () => void;
}) {
  const tone = danger ? TACTICAL.danger : TACTICAL.amber;

  return (
    <TouchableOpacity
      style={[
        styles.choicePill,
        selected ? { borderColor: `${tone}88`, backgroundColor: `${tone}18` } : null,
        disabled ? styles.choicePillDisabled : null,
      ]}
      onPress={onPress}
      activeOpacity={disabled ? 1 : 0.76}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(disabled), selected }}
      accessibilityHint={disabled ? disabledReason : undefined}
    >
      <Text
        style={[
          styles.choicePillText,
          selected ? { color: tone } : null,
          disabled ? styles.choicePillTextDisabled : null,
        ]}
        numberOfLines={1}
      >
        {label}
      </Text>
      {disabled && disabledReason ? (
        <Text style={styles.choicePillReason} numberOfLines={1}>No permission</Text>
      ) : null}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  form: {
    gap: 14,
  },
  disclaimerCard: {
    borderWidth: 1,
    borderColor: GOLD_RAIL.subsection,
    borderRadius: 10,
    padding: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(212,160,23,0.08)',
  },
  disclaimerCritical: {
    borderColor: 'rgba(192,57,43,0.42)',
    backgroundColor: 'rgba(192,57,43,0.08)',
  },
  disclaimerText: {
    flex: 1,
    fontSize: 11,
    lineHeight: 15,
    color: TACTICAL.text,
  },
  fieldBlock: {
    gap: 8,
  },
  fieldLabel: {
    fontSize: 9,
    fontWeight: '900',
    color: TACTICAL.textMuted,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  segmentRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  optionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  choicePill: {
    minHeight: 40,
    maxWidth: '100%',
    borderWidth: 1,
    borderColor: GOLD_RAIL.subsection,
    borderRadius: 9,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: 'rgba(255,255,255,0.025)',
  },
  choicePillDisabled: {
    backgroundColor: 'rgba(255,255,255,0.015)',
    opacity: 0.62,
  },
  choicePillText: {
    fontSize: 10,
    fontWeight: '900',
    color: TACTICAL.textMuted,
    letterSpacing: 0.4,
  },
  choicePillTextDisabled: {
    color: TACTICAL.textMuted,
  },
  choicePillReason: {
    marginTop: 2,
    fontSize: 7,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    textTransform: 'uppercase',
  },
  messageInput: {
    minHeight: 92,
    borderWidth: 1,
    borderColor: GOLD_RAIL.subsection,
    borderRadius: 10,
    paddingHorizontal: 11,
    paddingVertical: 10,
    backgroundColor: 'rgba(0,0,0,0.18)',
    color: TACTICAL.text,
    fontSize: 12,
    lineHeight: 17,
    textAlignVertical: 'top',
  },
  messageInputCritical: {
    borderColor: 'rgba(192,57,43,0.52)',
    backgroundColor: 'rgba(192,57,43,0.08)',
  },
  inlineSettingRow: {
    minHeight: 54,
    borderWidth: 1,
    borderColor: GOLD_RAIL.subsection,
    borderRadius: 10,
    paddingHorizontal: 11,
    paddingVertical: 9,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    backgroundColor: 'rgba(12,16,20,0.58)',
  },
  settingCopy: {
    flex: 1,
    minWidth: 0,
  },
  settingLabel: {
    fontSize: 11,
    fontWeight: '900',
    color: TACTICAL.text,
  },
  settingDetail: {
    marginTop: 2,
    fontSize: 10,
    color: TACTICAL.textMuted,
  },
  toggle: {
    width: 48,
    height: 28,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: GOLD_RAIL.subsection,
    padding: 3,
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.035)',
  },
  toggleOn: {
    borderColor: GOLD_RAIL.section,
    backgroundColor: ECS.accentSoft,
  },
  toggleKnob: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: TACTICAL.textMuted,
  },
  toggleKnobOn: {
    transform: [{ translateX: 18 }],
    backgroundColor: TACTICAL.amber,
  },
  validationCard: {
    borderWidth: 1,
    borderColor: 'rgba(192,57,43,0.42)',
    borderRadius: 10,
    padding: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(192,57,43,0.08)',
  },
  validationText: {
    flex: 1,
    fontSize: 11,
    color: TACTICAL.text,
  },
  primaryButton: {
    flex: 1,
    minHeight: 46,
    borderRadius: 11,
    backgroundColor: TACTICAL.amber,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  criticalButton: {
    backgroundColor: TACTICAL.danger,
  },
  primaryButtonText: {
    fontSize: 12,
    fontWeight: '900',
    color: '#0B0E12',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  secondaryButton: {
    flex: 1,
    minHeight: 46,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: GOLD_RAIL.subsection,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
    backgroundColor: 'rgba(255,255,255,0.035)',
  },
  secondaryButtonText: {
    fontSize: 12,
    fontWeight: '900',
    color: TACTICAL.textMuted,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
});
