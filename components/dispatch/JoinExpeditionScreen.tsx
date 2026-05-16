import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SafeIcon as Ionicons } from '../SafeIcon';
import { useApp } from '../../context/AppContext';
import { dispatchProfileStore, type DispatchProfileSnapshot } from '../../lib/dispatchProfileStore';
import { expeditionInviteLocalAdapter, type ExpeditionInviteResolution, type ExpeditionJoinResult } from '../../lib/expeditionInviteLocalAdapter';
import {
  recordExpeditionChannelJoinRequestSubmitted,
  recordExpeditionChannelMemberJoined,
} from '../../lib/expeditionChannelCadAdapter';
import { formatJoinCode, type ExpeditionChannelDefaultRole } from '../../lib/dispatchInviteDomain';
import { ECS, TACTICAL } from '../../lib/theme';

const ROLE_OPTIONS: { label: string; value: ExpeditionChannelDefaultRole; icon: React.ComponentProps<typeof Ionicons>['name'] }[] = [
  { label: 'Member', value: 'member', icon: 'person-outline' },
  { label: 'Viewer', value: 'viewer', icon: 'eye-outline' },
  { label: 'Guest', value: 'guest', icon: 'person-add-outline' },
];

function getParamValue(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? '' : value ?? '';
}

function getEmailDisplayName(email: string | null | undefined): string | null {
  if (!email) return null;
  const local = email.split('@')[0]?.trim();
  if (!local) return null;
  return local
    .replace(/[._-]+/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function normalizeCodeInput(value: string): string {
  return formatJoinCode(value, 3).slice(0, 15);
}

function getSuccessTitle(result: ExpeditionJoinResult | null): string {
  if (!result?.ok) return '';
  if (result.state === 'pending_approval') return 'Waiting for Expedition Lead approval';
  if (result.state === 'already_joined') return 'Already joined';
  return 'Joined Expedition Channel';
}

function getSuccessMessage(result: ExpeditionJoinResult | null): string {
  if (!result?.ok) return '';
  if (result.state === 'pending_approval') {
    return `${result.expeditionName} received your request. You will join after host approval.`;
  }
  if (result.state === 'already_joined') {
    return `You are already connected to ${result.expeditionName}.`;
  }
  return `${result.member.displayName} joined ${result.expeditionName}.`;
}

export default function JoinExpeditionScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ code?: string }>();
  const { user, operatorInfo, showToast } = useApp();
  const [profile, setProfile] = useState<DispatchProfileSnapshot>(() => dispatchProfileStore.getSnapshot());
  const profileName =
    profile.displayName ??
    (typeof operatorInfo?.display_name === 'string' && operatorInfo.display_name.trim()
      ? operatorInfo.display_name.trim()
      : null) ??
    getEmailDisplayName(operatorInfo?.email ?? user?.email ?? null);

  const [joinCode, setJoinCode] = useState(() => normalizeCodeInput(getParamValue(params.code)));
  const [displayName, setDisplayName] = useState(profileName ?? '');
  const [callsign, setCallsign] = useState(profile.callsign ?? '');
  const [requestedRole, setRequestedRole] = useState<ExpeditionChannelDefaultRole>('member');
  const [resolution, setResolution] = useState<ExpeditionInviteResolution | null>(null);
  const [result, setResult] = useState<ExpeditionJoinResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => dispatchProfileStore.subscribe(setProfile), []);

  useEffect(() => {
    if (!profileName || displayName.trim()) return;
    setDisplayName(profileName);
  }, [displayName, profileName]);

  useEffect(() => {
    if (!profile.callsign || callsign.trim()) return;
    setCallsign(profile.callsign);
  }, [callsign, profile.callsign]);

  useEffect(() => {
    const code = getParamValue(params.code);
    if (!code) return;
    setJoinCode(normalizeCodeInput(code));
  }, [params.code]);

  const canConfirm = !!resolution?.ok && !!displayName.trim();
  const helper = useMemo(() => {
    if (result?.ok) return getSuccessMessage(result);
    if (error) return error;
    if (resolution?.ok) {
      return resolution.invite.approvalRequired
        ? 'Host approval is required before this device joins the Expedition Channel.'
        : 'This invite allows immediate Expedition Channel access.';
    }
    return 'Enter a join code from an Expedition Channel invite.';
  }, [error, resolution, result]);

  const resolveInvite = useCallback(() => {
    setResult(null);
    setError(null);
    const nextResolution = expeditionInviteLocalAdapter.resolveInvite(joinCode, user?.id ?? null);
    setResolution(nextResolution);
    if (!nextResolution.ok) {
      setError(nextResolution.reason);
    }
  }, [joinCode, user?.id]);

  useEffect(() => {
    if (!joinCode || joinCode.length < 7) return;
    resolveInvite();
  }, [joinCode, resolveInvite]);

  const confirmJoin = useCallback(() => {
    setError(null);
    setResult(null);

    if (!joinCode.trim()) {
      setError('Join Code is required.');
      return;
    }

    const name = displayName.trim() || profileName?.trim() || '';
    if (!name) {
      setError('Display Name is required.');
      return;
    }

    const joinResult = expeditionInviteLocalAdapter.submitJoin({
      joinCode,
      userId: user?.id ?? `local-user-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
      displayName: name,
      callsign: callsign.trim() || null,
      requestedRole,
    });

    setResult(joinResult);
    if (!joinResult.ok) {
      setError(joinResult.reason);
      return;
    }

    if (joinResult.state === 'pending_approval') {
      recordExpeditionChannelJoinRequestSubmitted(joinResult.joinRequest);
    } else if (joinResult.state === 'joined') {
      recordExpeditionChannelMemberJoined(joinResult.member);
    }
    showToast?.(joinResult.state === 'pending_approval'
      ? 'Join request sent.'
      : joinResult.state === 'already_joined'
        ? 'Already connected to Expedition Channel.'
        : 'Expedition Channel joined.');
  }, [callsign, displayName, joinCode, profileName, requestedRole, showToast, user?.id]);

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: insets.top + 18,
            paddingBottom: insets.bottom + 24,
          },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.panel}>
          <View style={styles.headerRow}>
            <View style={styles.headerIcon}>
              <Ionicons name="people-circle-outline" size={22} color={TACTICAL.amber} />
            </View>
            <View style={styles.headerCopy}>
              <Text style={styles.eyebrow}>EXPEDITION CHANNEL</Text>
              <Text style={styles.title}>Join Expedition</Text>
            </View>
            <TouchableOpacity
              style={styles.closeButton}
              accessibilityRole="button"
              accessibilityLabel="Close Join Expedition"
              onPress={() => router.canGoBack() ? router.back() : router.replace('/login')}
            >
              <Ionicons name="close" size={18} color={TACTICAL.text} />
            </TouchableOpacity>
          </View>

          <Text style={styles.supporting}>
            Connect to an Expedition Channel with a host-provided invite code. No member location is shared from this form.
          </Text>

          <View style={styles.formStack}>
            <Field label="Join Code">
              <TextInput
                value={joinCode}
                onChangeText={(value) => {
                  setJoinCode(normalizeCodeInput(value));
                  setResolution(null);
                  setResult(null);
                  setError(null);
                }}
                placeholder="482-917"
                placeholderTextColor="rgba(139,148,158,0.74)"
                style={styles.input}
                autoCapitalize="characters"
                autoCorrect={false}
                keyboardAppearance="dark"
                selectionColor={TACTICAL.amber}
                cursorColor={TACTICAL.amber}
              />
            </Field>

            <View style={styles.actionRow}>
              <TouchableOpacity style={styles.secondaryButton} onPress={resolveInvite}>
                <Ionicons name="search-outline" size={15} color={TACTICAL.text} />
                <Text style={styles.secondaryButtonText}>Resolve Invite</Text>
              </TouchableOpacity>
            </View>

            {resolution?.ok ? (
              <View style={styles.confirmCard}>
                <Text style={styles.confirmEyebrow}>INVITE CONFIRMED</Text>
                <Text style={styles.confirmTitle}>{resolution.expeditionName}</Text>
                <Text style={styles.confirmMeta}>
                  {[
                    resolution.hostDisplayName ? `Host: ${resolution.hostDisplayName}` : null,
                    resolution.invite.approvalRequired ? 'Approval required' : 'Immediate join',
                  ].filter(Boolean).join(' / ')}
                </Text>
              </View>
            ) : null}

            <Field label="Display Name">
              <TextInput
                value={displayName}
                onChangeText={setDisplayName}
                placeholder={profileName ? profileName : 'Your name'}
                placeholderTextColor="rgba(139,148,158,0.74)"
                style={styles.input}
                autoCapitalize="words"
                autoCorrect={false}
                keyboardAppearance="dark"
                selectionColor={TACTICAL.amber}
                cursorColor={TACTICAL.amber}
              />
            </Field>

            <Field label="Callsign Optional">
              <TextInput
                value={callsign}
                onChangeText={setCallsign}
                placeholder="Trail Lead"
                placeholderTextColor="rgba(139,148,158,0.74)"
                style={styles.input}
                autoCapitalize="words"
                autoCorrect={false}
                keyboardAppearance="dark"
                selectionColor={TACTICAL.amber}
                cursorColor={TACTICAL.amber}
              />
            </Field>

            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Requested Role</Text>
              <View style={styles.roleRow}>
                {ROLE_OPTIONS.map((role) => {
                  const selected = role.value === requestedRole;
                  return (
                    <TouchableOpacity
                      key={role.value}
                      style={[styles.roleChip, selected ? styles.roleChipSelected : null]}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      onPress={() => setRequestedRole(role.value)}
                    >
                      <Ionicons name={role.icon} size={14} color={selected ? TACTICAL.text : TACTICAL.textMuted} />
                      <Text style={[styles.roleChipText, selected ? styles.roleChipTextSelected : null]}>
                        {role.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            <View style={[styles.statusCard, error ? styles.statusCardError : result?.ok ? styles.statusCardSuccess : null]}>
              <Text style={[styles.statusTitle, error ? styles.statusTextError : null]}>
                {result?.ok ? getSuccessTitle(result) : error ? 'Unable to Join' : 'Ready'}
              </Text>
              <Text style={styles.statusText}>{helper}</Text>
            </View>

            <TouchableOpacity
              style={[styles.primaryButton, !canConfirm ? styles.primaryButtonDisabled : null]}
              disabled={!canConfirm}
              onPress={confirmJoin}
              accessibilityRole="button"
              accessibilityState={{ disabled: !canConfirm }}
            >
              <Text style={styles.primaryButtonText}>
                {resolution?.ok && resolution.invite.approvalRequired ? 'Request Access' : 'Join Expedition'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: ECS.bgPrimary,
  },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  panel: {
    width: '100%',
    maxWidth: 520,
    alignSelf: 'center',
    borderWidth: 1,
    borderColor: TACTICAL.border,
    borderRadius: 18,
    backgroundColor: 'rgba(6,9,12,0.92)',
    padding: 14,
    gap: 12,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerIcon: {
    width: 42,
    height: 42,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: 'rgba(196,138,44,0.28)',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(212,160,23,0.08)',
  },
  headerCopy: {
    flex: 1,
    minWidth: 0,
  },
  eyebrow: {
    color: TACTICAL.textMuted,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.2,
  },
  title: {
    color: TACTICAL.text,
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: 0.7,
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: TACTICAL.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  supporting: {
    color: TACTICAL.textMuted,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '700',
  },
  formStack: {
    gap: 10,
  },
  field: {
    gap: 6,
  },
  fieldLabel: {
    color: TACTICAL.amber,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.9,
    textTransform: 'uppercase',
  },
  input: {
    minHeight: 44,
    borderWidth: 1,
    borderColor: TACTICAL.border,
    borderRadius: 10,
    color: TACTICAL.text,
    backgroundColor: 'rgba(12,16,21,0.72)',
    paddingHorizontal: 12,
    fontSize: 15,
    fontWeight: '800',
  },
  actionRow: {
    flexDirection: 'row',
  },
  secondaryButton: {
    flex: 1,
    minHeight: 38,
    borderWidth: 1,
    borderColor: TACTICAL.border,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.04)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  secondaryButtonText: {
    color: TACTICAL.text,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0.7,
    textTransform: 'uppercase',
  },
  confirmCard: {
    borderWidth: 1,
    borderColor: 'rgba(196,138,44,0.24)',
    borderRadius: 11,
    backgroundColor: 'rgba(212,160,23,0.07)',
    padding: 11,
    gap: 3,
  },
  confirmEyebrow: {
    color: TACTICAL.textMuted,
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 1.1,
  },
  confirmTitle: {
    color: TACTICAL.text,
    fontSize: 16,
    fontWeight: '900',
  },
  confirmMeta: {
    color: TACTICAL.textMuted,
    fontSize: 11,
    fontWeight: '800',
  },
  roleRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
  },
  roleChip: {
    minHeight: 34,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: TACTICAL.border,
    borderRadius: 9,
    paddingHorizontal: 10,
    backgroundColor: 'rgba(0,0,0,0.18)',
  },
  roleChipSelected: {
    borderColor: TACTICAL.amber,
    backgroundColor: 'rgba(212,160,23,0.14)',
  },
  roleChipText: {
    color: TACTICAL.textMuted,
    fontSize: 11,
    fontWeight: '900',
  },
  roleChipTextSelected: {
    color: TACTICAL.text,
  },
  statusCard: {
    borderWidth: 1,
    borderColor: TACTICAL.border,
    borderRadius: 11,
    backgroundColor: 'rgba(0,0,0,0.16)',
    padding: 11,
    gap: 4,
  },
  statusCardError: {
    borderColor: 'rgba(192,57,43,0.46)',
    backgroundColor: 'rgba(192,57,43,0.08)',
  },
  statusCardSuccess: {
    borderColor: 'rgba(212,160,23,0.32)',
    backgroundColor: 'rgba(212,160,23,0.08)',
  },
  statusTitle: {
    color: TACTICAL.text,
    fontSize: 13,
    fontWeight: '900',
  },
  statusTextError: {
    color: TACTICAL.danger,
  },
  statusText: {
    color: TACTICAL.textMuted,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 17,
  },
  primaryButton: {
    minHeight: 44,
    borderRadius: 11,
    backgroundColor: TACTICAL.amber,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonDisabled: {
    opacity: 0.46,
  },
  primaryButtonText: {
    color: ECS.bgPrimary,
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 0.7,
    textTransform: 'uppercase',
  },
});
