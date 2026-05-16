import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import ECSModalShell, { ECSOverlayFooter } from '../ECSModalShell';
import { SafeIcon as Ionicons } from '../SafeIcon';
import {
  getDispatchContextActions,
  getDispatchContextTypeLabel,
} from '../../lib/dispatchContextAdapter';
import {
  getPriorityWeight,
  type DispatchLinkedContext,
  type DispatchPingType,
  type DispatchPriority,
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

export interface DispatchPingComposerSeed {
  recipientMode?: DispatchRecipientMode;
  recipientId?: string;
  role?: DispatchRoutingRole;
  pingType?: DispatchPingType;
  priority?: DispatchPriority;
  linkedContext?: DispatchLinkedContext;
  message?: string;
}

export interface DispatchPingComposerSubmit {
  recipientMode: DispatchRecipientMode;
  recipientId?: string;
  role?: DispatchRoutingRole;
  pingType: DispatchPingType;
  priority: DispatchPriority;
  message: string;
  linkedContext?: DispatchLinkedContext;
  requireAcknowledgment: boolean;
  escalationTimer: EscalationTimer;
}

interface DispatchTeamPingComposerProps {
  visible: boolean;
  members: DispatchTeamMember[];
  contexts: DispatchLinkedContext[];
  seed?: DispatchPingComposerSeed | null;
  permissions?: DispatchComposerPermissionSet;
  onClose: () => void;
  onSubmit: (payload: DispatchPingComposerSubmit) => void;
}

const PING_TYPES: { value: DispatchPingType; label: string }[] = [
  { value: 'check_in', label: 'Check-In' },
  { value: 'rally', label: 'Rally' },
  { value: 'assist', label: 'Assist' },
  { value: 'route', label: 'Route' },
  { value: 'resource', label: 'Resource' },
  { value: 'hazard', label: 'Hazard' },
  { value: 'emergency', label: 'Emergency' },
  { value: 'general', label: 'General' },
];

const PRIORITIES: DispatchPriority[] = ['low', 'normal', 'high', 'critical'];
const ESCALATION_TIMERS: { value: EscalationTimer; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: '5', label: '5 min' },
  { value: '10', label: '10 min' },
  { value: '15', label: '15 min' },
  { value: '30', label: '30 min' },
];

const PING_TEMPLATES: Record<DispatchPingType, string> = {
  check_in: 'Confirm your current status.',
  rally: 'Proceed to the rally point and acknowledge when en route.',
  assist: 'Support needed. Confirm availability.',
  route: 'Confirm route condition and report any blockage or hazard.',
  resource: 'Report fuel, water, and power status.',
  hazard: 'Confirm hazard status and update Dispatch.',
  emergency: 'Immediate attention required. Acknowledge now.',
  general: 'Dispatch update. Please acknowledge.',
};

export default function DispatchTeamPingComposer({
  visible,
  members,
  contexts,
  seed,
  permissions,
  onClose,
  onSubmit,
}: DispatchTeamPingComposerProps) {
  const [recipientMode, setRecipientMode] = useState<DispatchRecipientMode>('all');
  const [recipientId, setRecipientId] = useState<string | undefined>();
  const [role, setRole] = useState<DispatchRoutingRole | undefined>();
  const [pingType, setPingType] = useState<DispatchPingType>('check_in');
  const [priority, setPriority] = useState<DispatchPriority>('normal');
  const [message, setMessage] = useState(PING_TEMPLATES.check_in);
  const [linkedContextId, setLinkedContextId] = useState<string>('none');
  const [requireAcknowledgment, setRequireAcknowledgment] = useState(true);
  const [escalationTimer, setEscalationTimer] = useState<EscalationTimer>('none');
  const [validationError, setValidationError] = useState<string | null>(null);

  const roleOptions = useMemo(() => {
    return getDispatchRoutingOptions(members);
  }, [members]);

  useEffect(() => {
    if (!visible) return;

    const nextPingType = seed?.pingType ?? 'check_in';
    const nextRecipientMode = resolveAllowedRecipientMode(
      seed?.recipientMode ?? (seed?.recipientId ? 'member' : 'all'),
      permissions,
    );
    setRecipientMode(nextRecipientMode);
    setRecipientId(seed?.recipientId);
    setRole(nextRecipientMode === 'role' ? seed?.role : undefined);
    const effectivePingType =
      nextPingType === 'emergency' && permissions?.canSendEmergency === false
        ? 'check_in'
        : nextPingType;
    setPingType(effectivePingType);
    setPriority(
      seed?.priority === 'critical' && permissions?.canSendEmergency === false
        ? 'normal'
        : seed?.priority ?? (effectivePingType === 'emergency' ? 'critical' : 'normal'),
    );
    setMessage(seed?.message ?? PING_TEMPLATES[effectivePingType]);
    setLinkedContextId(seed?.linkedContext?.id ?? 'none');
    setRequireAcknowledgment(true);
    setEscalationTimer(nextPingType === 'emergency' ? '5' : 'none');
    setValidationError(null);
  }, [permissions, seed, visible]);

  const selectedContext = useMemo(
    () => contexts.find((context) => context.id === linkedContextId),
    [contexts, linkedContextId],
  );

  const handlePingTypePress = (nextType: DispatchPingType) => {
    if (nextType === 'emergency' && permissions?.canSendEmergency === false) {
      setValidationError(permissions.disabledReason);
      return;
    }

    setPingType(nextType);
    setPriority((current) => nextType === 'emergency' ? 'critical' : current);
    if (nextType === 'emergency') {
      setRequireAcknowledgment(true);
      setEscalationTimer((current) => current === 'none' ? '5' : current);
    }
    setMessage(PING_TEMPLATES[nextType]);
  };

  const handlePriorityPress = (nextPriority: DispatchPriority) => {
    if (nextPriority === 'critical' && permissions?.canSendEmergency === false) {
      setValidationError(permissions.disabledReason);
      return;
    }

    setPriority(nextPriority);
  };

  const handleSubmit = () => {
    if (!recipientMode) {
      setValidationError('Select a recipient.');
      return;
    }
    if (recipientMode === 'member' && !recipientId) {
      setValidationError('Select a team member.');
      return;
    }
    if (recipientMode === 'member' && permissions?.canSendIndividual === false) {
      setValidationError(permissions.disabledReason);
      return;
    }
    if (recipientMode === 'role' && !role) {
      setValidationError('Select a role group.');
      return;
    }
    const resolution = resolveDispatchRecipients({
      selection: { recipientMode, recipientId, role },
      members,
      excludeSender: false,
      includeUnavailable: priority === 'critical' || pingType === 'emergency',
      priority,
      pingType,
    });
    if (resolution.warning) {
      setValidationError(resolution.warning);
      return;
    }
    if (recipientMode === 'all' && permissions?.canSendTeamWide === false) {
      setValidationError(permissions.disabledReason);
      return;
    }
    if (recipientMode === 'role' && permissions?.canTargetRoles === false) {
      setValidationError(permissions.disabledReason);
      return;
    }
    if ((pingType === 'emergency' || priority === 'critical') && permissions?.canSendEmergency === false) {
      setValidationError(permissions.disabledReason);
      return;
    }
    if (!pingType) {
      setValidationError('Select a ping type.');
      return;
    }
    if (!priority) {
      setValidationError('Select a priority.');
      return;
    }
    if (!message.trim()) {
      setValidationError('Enter a Dispatch message.');
      return;
    }

    onSubmit({
      recipientMode,
      recipientId,
      role,
      pingType,
      priority,
      message: message.trim(),
      linkedContext: selectedContext,
      requireAcknowledgment,
      escalationTimer,
    });
  };

  return (
    <ECSModalShell
      visible={visible}
      onClose={onClose}
      title="Team Ping"
      subtitle="Stage a structured Expedition Channel ping. No external message is sent."
      eyebrow="DISPATCH"
      icon="radio-outline"
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
            <Text style={styles.primaryButtonText}>Create Ping</Text>
          </TouchableOpacity>
        </ECSOverlayFooter>
      }
    >
      <View style={styles.form}>
        <FieldBlock label="Recipient">
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

        <FieldBlock label="Ping Type">
          <View style={styles.optionGrid}>
            {PING_TYPES.map((item) => (
              <ChoicePill
                key={item.value}
                label={item.label}
                selected={pingType === item.value}
                danger={item.value === 'emergency'}
                disabled={item.value === 'emergency' && permissions?.canSendEmergency === false}
                disabledReason={permissions?.disabledReason}
                onPress={() => handlePingTypePress(item.value)}
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

        <FieldBlock label="Message">
          <TextInput
            style={[styles.messageInput, priority === 'critical' ? styles.messageInputCritical : null]}
            value={message}
            onChangeText={(text) => {
              setMessage(text);
              setValidationError(null);
            }}
            multiline
            placeholder="Dispatch update..."
            placeholderTextColor={TACTICAL.textMuted}
          />
        </FieldBlock>

        <FieldBlock label="Linked Context">
          <View style={styles.optionGrid}>
            <ChoicePill
              label="None"
              selected={linkedContextId === 'none'}
              onPress={() => setLinkedContextId('none')}
            />
            {contexts.map((context) => (
              <ChoicePill
                key={context.id}
                label={`${getDispatchContextTypeLabel(context.type)} / ${context.title}`}
                selected={linkedContextId === context.id}
                onPress={() => setLinkedContextId(context.id)}
              />
            ))}
          </View>
          {selectedContext ? (
            <View style={styles.contextPreviewCard}>
              <View style={styles.contextPreviewHeader}>
                <Ionicons name={getContextIcon(selectedContext.type)} size={14} color={TACTICAL.amber} />
                <View style={styles.contextPreviewCopy}>
                  <Text style={styles.contextPreviewType}>
                    {getDispatchContextTypeLabel(selectedContext.type)}
                  </Text>
                  <Text style={styles.contextPreviewTitle}>{selectedContext.title}</Text>
                  {selectedContext.subtitle ? (
                    <Text style={styles.contextPreviewSubtitle}>{selectedContext.subtitle}</Text>
                  ) : null}
                </View>
              </View>
              <View style={styles.contextActionRow}>
                {getDispatchContextActions(selectedContext).slice(0, 3).map((action) => (
                  <TouchableOpacity
                    key={action.id}
                    style={styles.contextActionPill}
                    onPress={() => {
                      if (action.pingType) {
                        setPingType(action.pingType);
                      }
                      if (action.priority) {
                        setPriority(action.priority);
                      }
                      if (action.message) {
                        setMessage(action.message);
                      }
                    }}
                    activeOpacity={0.76}
                  >
                    <Text style={styles.contextActionText}>{action.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          ) : null}
        </FieldBlock>

        <View style={styles.inlineSettingRow}>
          <View style={styles.settingCopy}>
            <Text style={styles.settingLabel}>Require Acknowledgment</Text>
            <Text style={styles.settingDetail}>
              {pingType === 'emergency'
                ? 'Emergency pings always require acknowledgment.'
                : 'Track response state inside Dispatch.'}
            </Text>
          </View>
          <TouchableOpacity
            style={[styles.toggle, requireAcknowledgment ? styles.toggleOn : null]}
            onPress={() => {
              if (pingType !== 'emergency') {
                setRequireAcknowledgment((current) => !current);
              }
            }}
            activeOpacity={pingType === 'emergency' ? 1 : 0.76}
            accessibilityRole="switch"
            accessibilityState={{ checked: requireAcknowledgment, disabled: pingType === 'emergency' }}
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

function resolveAllowedRecipientMode(
  requested: DispatchRecipientMode,
  permissions?: DispatchComposerPermissionSet,
): DispatchRecipientMode {
  if (requested === 'all' && permissions?.canSendTeamWide === false) return 'member';
  if (requested === 'role' && permissions?.canTargetRoles === false) return 'member';
  if (requested === 'member' && permissions?.canSendIndividual === false) return 'all';
  return requested;
}

function getContextIcon(type: DispatchLinkedContext['type']): React.ComponentProps<typeof Ionicons>['name'] {
  switch (type) {
    case 'pin':
      return 'location-outline';
    case 'waypoint':
      return 'flag-outline';
    case 'route_segment':
      return 'git-branch-outline';
    case 'resource':
      return 'cube-outline';
    case 'vehicle':
      return 'car-outline';
    case 'power':
      return 'battery-charging-outline';
    case 'manual':
      return 'create-outline';
    default:
      return 'compass-outline';
  }
}

const styles = StyleSheet.create({
  form: {
    gap: 14,
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
  contextPreviewCard: {
    borderWidth: 1,
    borderColor: GOLD_RAIL.subsection,
    borderRadius: 10,
    padding: 10,
    gap: 9,
    backgroundColor: 'rgba(12,16,20,0.58)',
  },
  contextPreviewHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 9,
  },
  contextPreviewCopy: {
    flex: 1,
    minWidth: 0,
  },
  contextPreviewType: {
    fontSize: 8,
    fontWeight: '900',
    color: TACTICAL.textMuted,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  contextPreviewTitle: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: '900',
    color: TACTICAL.text,
  },
  contextPreviewSubtitle: {
    marginTop: 2,
    fontSize: 10,
    color: TACTICAL.textMuted,
  },
  contextActionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  contextActionPill: {
    minHeight: 36,
    borderWidth: 1,
    borderColor: GOLD_RAIL.subsection,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
    backgroundColor: 'rgba(212,160,23,0.08)',
  },
  contextActionText: {
    fontSize: 8,
    fontWeight: '900',
    color: TACTICAL.text,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
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
