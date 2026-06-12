import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SafeIcon } from '../SafeIcon';
import ECSShellTexture from '../ECSShellTexture';
import { convoyMembershipService } from '../../lib/convoy/convoyMembershipService';
import { getConvoyLocationSharingState } from '../../lib/convoy/convoyLocationPublisher';
import {
  buildLocalConvoyQaIdentityDiagnostic,
  getConvoyQaBackendProjectLabelFromUrl,
  type ConvoyQaIdentityDiagnostic,
} from '../../lib/convoy/convoyQaIdentityPreflight';
import {
  buildLocalConvoyQaSetupEligibility,
  type ConvoyQaSetupEligibilityDiagnostic,
} from '../../lib/convoy/convoyQaSetupEligibility';
import { supabase } from '../../lib/supabase';
import { TACTICAL } from '../../lib/theme';

const FIELD_LABELS: [keyof ConvoyQaIdentityDiagnostic, string][] = [
  ['authPresent', 'Auth present'],
  ['userId', 'User id'],
  ['email', 'Email'],
  ['displayName', 'Display label'],
  ['backendProjectLabel', 'Backend/project'],
  ['activeConvoyId', 'Active convoy id'],
  ['participantId', 'Participant id'],
  ['liveSharingActive', 'Live sharing active'],
  ['currentConvoyBaselineState', 'Convoy baseline'],
  ['preflightResult', 'Preflight result'],
  ['preflightCode', 'Preflight code'],
];

const SETUP_FIELD_LABELS: [keyof ConvoyQaSetupEligibilityDiagnostic, string][] = [
  ['status', 'Setup preflight'],
  ['code', 'Setup code'],
  ['setupComplete', 'Setup complete'],
  ['setupCompletionFlag', 'Setup flag'],
  ['hasConfiguredVehicle', 'Configured vehicle'],
  ['fleetProfileCount', 'Fleet profiles'],
  ['activeVehiclePresent', 'Active vehicle'],
  ['setupVehiclePresent', 'Setup vehicle'],
  ['cleanConvoyBaseline', 'Clean Convoy baseline'],
  ['convoyCommandReachable', 'Convoy Command reachable'],
  ['missingRequirement', 'Missing requirement'],
];

function getDisplayName(user: Record<string, any> | null): string | null {
  const metadata = user?.user_metadata ?? {};
  const candidates = [
    metadata.display_name,
    metadata.full_name,
    metadata.name,
    user?.email,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
  }
  return null;
}

function formatDiagnosticValue(value: unknown): string {
  if (Array.isArray(value)) return value.join(' | ') || 'none';
  if (typeof value === 'boolean') return value ? 'yes' : 'no';
  if (value == null || value === '') return 'unknown';
  return String(value);
}

export function ConvoyQaIdentityDiagnosticScreen() {
  const insets = useSafeAreaInsets();
  const [diagnostic, setDiagnostic] = useState<ConvoyQaIdentityDiagnostic | null>(null);
  const [setupEligibility, setSetupEligibility] = useState<ConvoyQaSetupEligibilityDiagnostic | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setError(null);
    let authStateReadable = true;
    let user: Record<string, any> | null = null;

    try {
      const { data, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) {
        authStateReadable = false;
        setError('Auth session diagnostic could not be read.');
      }
      user = (data?.session?.user ?? null) as Record<string, any> | null;
    } catch {
      authStateReadable = false;
      setError('Auth session diagnostic could not be read.');
    }

    const [activeContext, sharingState] = await Promise.all([
      convoyMembershipService.getActiveConvoyContext(),
      getConvoyLocationSharingState(),
    ]);

    const next = buildLocalConvoyQaIdentityDiagnostic({
      deviceLabel: 'This device',
      userId: typeof user?.id === 'string' ? user.id : null,
      email: typeof user?.email === 'string' ? user.email : null,
      displayName: getDisplayName(user),
      backendProjectLabel: getConvoyQaBackendProjectLabelFromUrl(process.env.EXPO_PUBLIC_SUPABASE_URL),
      activeConvoyId: activeContext?.convoyId ?? null,
      participantId: activeContext?.memberId ?? null,
      liveSharingActive: sharingState.enabled,
      pendingInviteOrJoinState: false,
      authStateReadable,
    });

    const nextSetupEligibility = await buildLocalConvoyQaSetupEligibility({
      authenticated: !!user?.id,
      activeConvoyId: activeContext?.convoyId ?? null,
      liveSharingActive: sharingState.enabled,
      pendingInviteOrJoinState: false,
    });

    setDiagnostic(next);
    setSetupEligibility(nextSetupEligibility);
    setUpdatedAt(new Date().toLocaleString());
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <View style={styles.screen}>
      <StatusBar style="light" />
      <ECSShellTexture />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + 18, paddingBottom: insets.bottom + 26 },
        ]}
      >
        <View style={styles.header}>
          <Text style={styles.eyebrow}>DEV / TEST ONLY</Text>
          <Text style={styles.title}>Convoy QA Identity Diagnostic</Text>
          <Text style={styles.subtitle}>
            Redacted identity and baseline state for two-device privacy preflight.
          </Text>
        </View>

        <View style={styles.notice}>
          <SafeIcon name="shield-checkmark-outline" size={16} color={TACTICAL.amber} />
          <Text style={styles.noticeText}>
            Read-only diagnostic. It does not create convoys, join invites, publish location, or write badge state.
          </Text>
        </View>

        {error ? (
          <View style={styles.warning}>
            <Text style={styles.warningText}>{error}</Text>
          </View>
        ) : null}

        <View style={styles.card}>
          <Text style={styles.cardTitle}>{diagnostic?.deviceLabel ?? 'This device'}</Text>
          {FIELD_LABELS.map(([field, label]) => (
            <View key={field} style={styles.row}>
              <Text style={styles.label}>{label}</Text>
              <Text style={styles.value}>{formatDiagnosticValue(diagnostic?.[field])}</Text>
            </View>
          ))}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Setup eligibility</Text>
          {SETUP_FIELD_LABELS.map(([field, label]) => (
            <View key={field} style={styles.row}>
              <Text style={styles.label}>{label}</Text>
              <Text style={styles.value}>{formatDiagnosticValue(setupEligibility?.[field])}</Text>
            </View>
          ))}
          {setupEligibility?.notes.length ? (
            <View style={styles.noteBlock}>
              <Text style={styles.noteText}>{setupEligibility.notes.join(' ')}</Text>
            </View>
          ) : null}
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Refresh Convoy QA identity diagnostic"
          onPress={() => {
            void refresh();
          }}
          style={({ pressed }) => [styles.refreshButton, pressed ? styles.refreshButtonPressed : null]}
        >
          <SafeIcon name="refresh-outline" size={16} color={TACTICAL.amber} />
          <Text style={styles.refreshText}>Refresh</Text>
        </Pressable>

        {updatedAt ? <Text style={styles.updated}>Updated {updatedAt}</Text> : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#05070A',
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 18,
    gap: 14,
  },
  header: {
    gap: 6,
  },
  eyebrow: {
    color: TACTICAL.amber,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '800',
    letterSpacing: 0,
  },
  title: {
    color: TACTICAL.text,
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '900',
    letterSpacing: 0,
  },
  subtitle: {
    color: TACTICAL.textMuted,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
  },
  notice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.24)',
    backgroundColor: 'rgba(245,158,11,0.08)',
    borderRadius: 8,
    padding: 10,
  },
  noticeText: {
    flex: 1,
    color: TACTICAL.text,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '700',
  },
  warning: {
    borderWidth: 1,
    borderColor: 'rgba(248,113,113,0.34)',
    backgroundColor: 'rgba(248,113,113,0.08)',
    borderRadius: 8,
    padding: 10,
  },
  warningText: {
    color: '#FCA5A5',
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '700',
  },
  card: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    backgroundColor: 'rgba(12,18,24,0.86)',
    borderRadius: 8,
    padding: 12,
    gap: 8,
  },
  cardTitle: {
    color: TACTICAL.text,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '900',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
    paddingTop: 8,
  },
  label: {
    flex: 1,
    color: TACTICAL.textMuted,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
  },
  value: {
    flex: 1,
    color: TACTICAL.text,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '800',
    textAlign: 'right',
  },
  noteBlock: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
    paddingTop: 8,
  },
  noteText: {
    color: TACTICAL.textMuted,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '700',
  },
  refreshButton: {
    minHeight: 42,
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.34)',
    backgroundColor: 'rgba(245,158,11,0.08)',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  refreshButtonPressed: {
    opacity: 0.72,
  },
  refreshText: {
    color: TACTICAL.amber,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '900',
  },
  updated: {
    color: TACTICAL.textMuted,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '700',
    textAlign: 'center',
  },
});
