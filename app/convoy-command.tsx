import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import QRCode from 'react-native-qrcode-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import ECSShellTexture from '../components/ECSShellTexture';
import { ECSCopyButton } from '../components/ECSCopyButton';
import { ECSButton } from '../components/ECSButton';
import { SafeIcon as Ionicons } from '../components/SafeIcon';
import { useApp } from '../context/AppContext';
import { formatConvoyBackendUserMessage } from '../lib/convoy/convoyBackendReadiness';
import { formatConvoyInviteCode, normalizeConvoyInviteCodeForSubmit } from '../lib/convoy/convoyInviteCodeFormat';
import {
  convoyMembershipService,
  type ConvoyInviteRecord,
  type ConvoyListItem,
  type ConvoyLocationSummaryRecord,
  type ConvoyMemberRecord,
  type ConvoyRole,
} from '../lib/convoy/convoyMembershipService';
import {
  buildConvoyStalenessLadder,
  type ConvoyStalenessLadder,
  type ConvoyStalenessLadderRow,
  type StalenessPolicy,
} from '../lib/convoy/convoyStalenessLadder';
import { dispatchProfileStore } from '../lib/dispatchProfileStore';
import { TACTICAL, TYPO } from '../lib/theme';
import { ECS_SURFACE } from '../lib/ecsSurfaceTokens';
import type { Vehicle } from '../lib/types';
import { vehicleStore } from '../lib/vehicleStore';
import { getCurrentExpeditionIdentityTitle } from '../lib/expedition/expeditionBadgeStore';

type Mode = 'leader' | 'join' | 'roster';
type ExpirationPreset = '2h' | '24h' | '7d';

const ROLE_OPTIONS: ConvoyRole[] = ['lead', 'sweep', 'member', 'support'];
const ROSTER_RECONCILE_INTERVAL_MS = 15_000;
const EXPIRATION_OPTIONS: { label: string; value: ExpirationPreset; hours: number }[] = [
  { label: '2 hr', value: '2h', hours: 2 },
  { label: '24 hr', value: '24h', hours: 24 },
  { label: '7 days', value: '7d', hours: 24 * 7 },
];

function normalizeError(error: string): string {
  const backendMessage = formatConvoyBackendUserMessage(error);
  if (backendMessage) return backendMessage;
  if (/invalid|not valid/i.test(error)) return 'Invite code is invalid. Check the code and ask the convoy leader for a fresh invite if needed.';
  if (/expired/i.test(error)) return 'Invite expired. Ask the convoy leader for a new code.';
  if (/revoked/i.test(error)) return 'Invite revoked. Ask the convoy leader to reissue access.';
  if (/used|max/i.test(error)) return 'Invite has reached its use limit.';
  if (/sign in|auth/i.test(error)) return 'Sign in before creating or joining a convoy.';
  return error;
}

function addHours(hours: number): string {
  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return 'Not set';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return 'Not set';
  return date.toLocaleString('en-US', {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatLocationAge(summary: ConvoyLocationSummaryRecord | null): string {
  const timestamp = summary?.updated_at ?? summary?.captured_at ?? null;
  if (!timestamp) return 'No location yet';
  const parsed = Date.parse(timestamp);
  if (!Number.isFinite(parsed)) return 'Location age unavailable';
  const ageMinutes = Math.max(0, Math.floor((Date.now() - parsed) / 60_000));
  if (ageMinutes < 1) return 'Just now';
  if (ageMinutes < 60) return `${ageMinutes}m ago`;
  return `${Math.floor(ageMinutes / 60)}h ago`;
}

function convoyStalenessPolicyFromConfig(convoy: ConvoyListItem['convoy'] | null | undefined): StalenessPolicy | null {
  const source = convoy as (ConvoyListItem['convoy'] & {
    staleness_policy?: Partial<StalenessPolicy> | null;
    stalenessPolicy?: Partial<StalenessPolicy> | null;
  }) | null | undefined;
  const policy = source?.staleness_policy ?? source?.stalenessPolicy ?? null;
  const delayedAfter = Number(policy?.delayedAfter);
  const staleAfter = Number(policy?.staleAfter);
  const missingAfter = Number(policy?.missingAfter);
  if (
    !Number.isFinite(delayedAfter) ||
    !Number.isFinite(staleAfter) ||
    !Number.isFinite(missingAfter) ||
    delayedAfter < 0 ||
    staleAfter <= delayedAfter ||
    missingAfter <= staleAfter
  ) {
    return null;
  }
  return { delayedAfter, staleAfter, missingAfter };
}

function convoyStalenessStatusLabel(status: ConvoyStalenessLadderRow['status']): string {
  switch (status) {
    case 'recovery_event_active':
      return 'Recovery event active';
    case 'assistance_requested':
      return 'Assistance requested';
    case 'missing_check_in':
      return 'Missing check-in';
    case 'stale':
      return 'Stale';
    case 'delayed':
      return 'Delayed';
    case 'fresh':
      return 'Fresh';
    case 'unknown_no_permission':
      return 'Unknown - no permission';
    case 'unknown_no_data':
    default:
      return 'Unknown - no data';
  }
}

function formatCheckInAge(row: ConvoyStalenessLadderRow): string {
  if (!row.lastCheckInAt) return 'No accepted check-in source';
  if (row.lastCheckInAgeMinutes == null) return `Last accepted check-in ${formatDateTime(row.lastCheckInAt)}`;
  if (row.lastCheckInAgeMinutes < 1) return 'Last accepted check-in just now';
  if (row.lastCheckInAgeMinutes < 60) return `Last accepted check-in ${row.lastCheckInAgeMinutes}m ago`;
  return `Last accepted check-in ${Math.floor(row.lastCheckInAgeMinutes / 60)}h ago`;
}

function vehicleLabel(vehicle: Vehicle): string {
  return [vehicle.name, vehicle.year, vehicle.make, vehicle.model]
    .filter((part) => part != null && String(part).trim().length > 0)
    .join(' ');
}

function qrReadyPayload(rawCode: string, role: ConvoyRole, expiresAt: string): string {
  return JSON.stringify({
    type: 'ecs_convoy_invite',
    version: 1,
    code: rawCode,
    role,
    expiresAt,
  });
}

export default function ConvoyCommandCredentialsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useApp();
  const [mode, setMode] = useState<Mode>('leader');
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [convoys, setConvoys] = useState<ConvoyListItem[]>([]);
  const [selectedConvoyId, setSelectedConvoyId] = useState<string | null>(null);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [members, setMembers] = useState<ConvoyMemberRecord[]>([]);
  const [locationSummaries, setLocationSummaries] = useState<ConvoyLocationSummaryRecord[]>([]);
  const [invites, setInvites] = useState<ConvoyInviteRecord[]>([]);
  const [expeditionIdentityTitle, setExpeditionIdentityTitle] = useState<string | null>(null);
  const [rosterRefreshing, setRosterRefreshing] = useState(false);
  const [rosterStaleMessage, setRosterStaleMessage] = useState<string | null>(null);
  const selectedConvoyIdRef = useRef<string | null>(null);
  const rosterRefreshInFlightRef = useRef(false);

  const [convoyName, setConvoyName] = useState('Trail Convoy');
  const [leaderCallsign, setLeaderCallsign] = useState('LEAD');
  const [leaderVehicleId, setLeaderVehicleId] = useState<string | null>(null);
  const [inviteRole, setInviteRole] = useState<ConvoyRole>('member');
  const [expiresPreset, setExpiresPreset] = useState<ExpirationPreset>('24h');
  const [maxUses, setMaxUses] = useState('1');
  const [lastInviteCode, setLastInviteCode] = useState<string | null>(null);
  const [lastInvitePayload, setLastInvitePayload] = useState<string | null>(null);

  const [joinCode, setJoinCode] = useState('');
  const [joinCallsign, setJoinCallsign] = useState('V2');
  const [joinVehicleId, setJoinVehicleId] = useState<string | null>(null);

  const selectedConvoy = useMemo(
    () => convoys.find((item) => item.convoy.id === selectedConvoyId) ?? convoys[0] ?? null,
    [convoys, selectedConvoyId],
  );
  const selectedRole = selectedConvoy?.membership.role ?? 'member';
  const isLeader = Boolean(user?.id && selectedConvoy?.convoy.leader_user_id === user.id);
  const locationByMember = useMemo(
    () => new Map(locationSummaries.map((summary) => [summary.member_id, summary])),
    [locationSummaries],
  );
  const convoyStalenessPolicy = useMemo(
    () => convoyStalenessPolicyFromConfig(selectedConvoy?.convoy ?? null),
    [selectedConvoy?.convoy],
  );
  const convoyStalenessLadder = useMemo(
    () => buildConvoyStalenessLadder({
      now: new Date().toISOString(),
      policy: convoyStalenessPolicy,
      roster: members.map((member) => ({
        memberId: member.id,
        displayName: member.callsign,
        role: member.role,
      })),
      permissions: {
        canViewRoster: Boolean(selectedConvoy),
        canViewStatus: Boolean(selectedConvoy),
        canViewCheckInTimestamps: Boolean(selectedConvoy),
        canViewSharedCoordinates: Boolean(selectedConvoy),
        canViewOfflineReplayState: Boolean(selectedConvoy),
      },
      lastAcceptedCheckIns: locationSummaries
        .map((summary) => ({
          memberId: summary.member_id,
          acceptedAt: summary.captured_at ?? summary.updated_at ?? '',
          source: 'convoy_location_summary',
        }))
        .filter((checkIn) => checkIn.acceptedAt),
      channelStates: locationSummaries.map((summary) => ({
        memberId: summary.member_id,
        state: summary.movement_status ?? 'unknown',
        observedAt: summary.updated_at ?? summary.captured_at ?? null,
      })),
      offlineReplay: rosterStaleMessage
        ? members.map((member) => ({
            memberId: member.id,
            state: 'pending',
            capturedAt: null,
            visible: true,
          }))
        : [],
    }),
    [
      convoyStalenessPolicy,
      locationSummaries,
      members,
      rosterStaleMessage,
      selectedConvoy,
    ],
  );

  useEffect(() => {
    selectedConvoyIdRef.current = selectedConvoyId;
  }, [selectedConvoyId]);

  const clearRosterState = useCallback(() => {
    setMembers([]);
    setInvites([]);
    setLocationSummaries([]);
  }, []);

  const refreshConvoys = useCallback(async (preferredConvoyId?: string | null): Promise<ConvoyListItem | null> => {
    const result = await convoyMembershipService.listMyActiveConvoys();
    if (!result.ok) {
      setError(normalizeError(result.error));
      setRosterStaleMessage('Roster refresh unavailable; showing last known roster.');
      return null;
    }
    setConvoys(result.data);
    const targetConvoyId = preferredConvoyId ?? selectedConvoyIdRef.current;
    const nextSelectedConvoy = (
      targetConvoyId
        ? result.data.find((item) => item.convoy.id === targetConvoyId)
        : null
    ) ?? result.data[0] ?? null;
    const nextSelectedId = nextSelectedConvoy?.convoy.id ?? null;
    selectedConvoyIdRef.current = nextSelectedId;
    setSelectedConvoyId(nextSelectedId);
    if (!nextSelectedConvoy) {
      clearRosterState();
      setRosterStaleMessage(null);
    }
    return nextSelectedConvoy;
  }, [clearRosterState]);

  const refreshRoster = useCallback(async (
    convoyId: string | null,
    options?: { canLoadInvites?: boolean },
  ): Promise<boolean> => {
    if (!convoyId) {
      clearRosterState();
      return true;
    }

    const canLoadInvites = options?.canLoadInvites ?? isLeader;
    const [rosterResult, inviteResult] = await Promise.all([
      convoyMembershipService.listConvoyRoster(convoyId),
      canLoadInvites
        ? convoyMembershipService.listConvoyInvites(convoyId)
        : Promise.resolve({ ok: true as const, data: [] as ConvoyInviteRecord[] }),
    ]);
    if (rosterResult.ok) {
      setMembers(rosterResult.data.members);
      setLocationSummaries(rosterResult.data.locationSummaries);
      setRosterStaleMessage(null);
    } else {
      setError(normalizeError(rosterResult.error));
      setRosterStaleMessage('Roster refresh unavailable; showing last known roster.');
    }
    if (inviteResult.ok) {
      setInvites(inviteResult.data);
    } else if (canLoadInvites) {
      setError(normalizeError(inviteResult.error));
    } else {
      setInvites([]);
    }
    return rosterResult.ok;
  }, [clearRosterState, isLeader]);

  const reconcileConvoyState = useCallback(async (
    preferredConvoyId?: string | null,
    options?: { showPending?: boolean },
  ) => {
    if (rosterRefreshInFlightRef.current) return;
    rosterRefreshInFlightRef.current = true;
    if (options?.showPending) setRosterRefreshing(true);
    try {
      const activeConvoy = await refreshConvoys(preferredConvoyId);
      if (!activeConvoy) return;
      if (activeConvoy.syncState === 'local_pending') {
        setMembers([activeConvoy.membership]);
        setInvites([]);
        setLocationSummaries([]);
        setRosterStaleMessage('Local convoy roster pending backend sync.');
        return;
      }
      const activeUserIsLeader = Boolean(user?.id && activeConvoy.convoy.leader_user_id === user.id);
      await refreshRoster(activeConvoy.convoy.id, { canLoadInvites: activeUserIsLeader });
    } finally {
      rosterRefreshInFlightRef.current = false;
      if (options?.showPending) setRosterRefreshing(false);
    }
  }, [refreshConvoys, refreshRoster, user?.id]);

  useEffect(() => dispatchProfileStore.subscribe((profile) => {
    const profileCallsign = profile.callsign?.trim();
    if (!profileCallsign) return;
    setLeaderCallsign((current) => (
      !current.trim() || current === 'LEAD' ? profileCallsign : current
    ));
    setJoinCallsign((current) => (
      !current.trim() || current === 'V2' ? profileCallsign : current
    ));
  }), []);

  useEffect(() => {
    let mounted = true;
    void vehicleStore.waitForHydration().then(async () => {
      const result = await vehicleStore.getAll(user?.id);
      if (!mounted) return;
      setVehicles(result.vehicles);
      const firstVehicleId = result.vehicles[0]?.id ?? null;
      setLeaderVehicleId((current) => current ?? firstVehicleId);
      setJoinVehicleId((current) => current ?? firstVehicleId);
    });
    void reconcileConvoyState(null, { showPending: true });
    return () => {
      mounted = false;
    };
  }, [reconcileConvoyState, user?.id]);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      void reconcileConvoyState(null, { showPending: true });
      const timer = setInterval(() => {
        if (cancelled || !selectedConvoyIdRef.current) return;
        void reconcileConvoyState(null);
      }, ROSTER_RECONCILE_INTERVAL_MS);
      return () => {
        cancelled = true;
        clearInterval(timer);
      };
    }, [reconcileConvoyState]),
  );

  useEffect(() => {
    let mounted = true;
    void getCurrentExpeditionIdentityTitle()
      .then((title) => {
        if (mounted) setExpeditionIdentityTitle(title);
      })
      .catch(() => {
        if (mounted) setExpeditionIdentityTitle(null);
      });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (selectedConvoy?.syncState === 'local_pending') {
      setMembers([selectedConvoy.membership]);
      setInvites([]);
      setLocationSummaries([]);
      return;
    }
    void refreshRoster(selectedConvoy?.convoy.id ?? null, { canLoadInvites: isLeader });
  }, [isLeader, refreshRoster, selectedConvoy]);

  async function handleCreateConvoy() {
    setLoading(true);
    setError(null);
    setNotice(null);
    const result = await convoyMembershipService.createConvoy({
      name: convoyName,
      leaderCallsign,
      leaderVehicleId,
      leaderExpeditionBadgeTitle: expeditionIdentityTitle,
      startsAt: new Date(),
    });
    if (result.ok) {
      setNotice(
        result.data.syncState === 'local_pending'
          ? 'Convoy started locally. Cloud roster sync will resume when convoy backend readiness returns.'
          : 'Convoy created. Generate an invite when you are ready to add members.',
      );
      setSelectedConvoyId(result.data.convoy.id);
      if (result.data.syncState === 'local_pending') {
        setConvoys((current) => [
          result.data,
          ...current.filter((item) => item.convoy.id !== result.data.convoy.id),
        ]);
      } else {
        await reconcileConvoyState(result.data.convoy.id, { showPending: true });
      }
    } else {
      setError(normalizeError(result.error));
    }
    setLoading(false);
  }

  async function handleGenerateInvite() {
    if (!selectedConvoy) {
      setError('Create or select a convoy before generating an invite.');
      return;
    }

    setLoading(true);
    setError(null);
    setNotice(null);
    const preset = EXPIRATION_OPTIONS.find((item) => item.value === expiresPreset) ?? EXPIRATION_OPTIONS[1];
    const expiresAt = addHours(preset.hours);
    const result = await convoyMembershipService.createConvoyInvite({
      convoyId: selectedConvoy.convoy.id,
      role: inviteRole,
      maxUses: Number(maxUses),
      expiresAt,
    });
    if (result.ok) {
      const inviteCode = formatConvoyInviteCode(result.data.rawCode);
      setLastInviteCode(inviteCode);
      setLastInvitePayload(qrReadyPayload(inviteCode, result.data.invite.role, result.data.invite.expires_at));
      setNotice('Invite generated. Raw code is shown once here; ECS stores only the secure hash.');
      await refreshRoster(selectedConvoy.convoy.id);
    } else {
      setError(normalizeError(result.error));
    }
    setLoading(false);
  }

  async function handleJoinConvoy() {
    setLoading(true);
    setError(null);
    setNotice(null);
    const result = await convoyMembershipService.joinConvoyWithInvite({
      rawCode: normalizeConvoyInviteCodeForSubmit(joinCode),
      callsign: joinCallsign,
      vehicleId: joinVehicleId,
      expeditionBadgeTitle: expeditionIdentityTitle,
    });
    if (result.ok) {
      setNotice('Joined convoy. Location sharing is still off until you start it from Convoy Command.');
      setMode('roster');
      setSelectedConvoyId(result.data.convoy.id);
      await reconcileConvoyState(result.data.convoy.id, { showPending: true });
    } else {
      setError(normalizeError(result.error));
    }
    setLoading(false);
  }

  async function handleRevokeInvite(invite: ConvoyInviteRecord) {
    if (!selectedConvoy) return;
    setLoading(true);
    setError(null);
    const result = await convoyMembershipService.revokeConvoyInvite({
      convoyId: selectedConvoy.convoy.id,
      inviteId: invite.id,
    });
    if (result.ok) {
      setNotice('Invite revoked.');
      await refreshRoster(selectedConvoy.convoy.id);
    } else {
      setError(normalizeError(result.error));
    }
    setLoading(false);
  }

  async function handleRevokeMember(member: ConvoyMemberRecord) {
    if (!selectedConvoy) return;
    setLoading(true);
    setError(null);
    const result = await convoyMembershipService.revokeConvoyMember({
      convoyId: selectedConvoy.convoy.id,
      memberId: member.id,
    });
    if (result.ok) {
      setNotice(`${member.callsign} access revoked.`);
      await refreshRoster(selectedConvoy.convoy.id);
    } else {
      setError(normalizeError(result.error));
    }
    setLoading(false);
  }

  async function handleShareInvite() {
    if (!lastInviteCode || !lastInvitePayload) return;
    await Share.share({
      message: `ECS convoy invite: ${lastInviteCode}\nQR payload: ${lastInvitePayload}`,
    });
  }

  return (
      <View style={styles.root}>
      <ECSShellTexture />
      <View style={[styles.header, styles.headerSafeArea, { paddingTop: Math.max(14, insets.top + 8) }]}>
        <View style={styles.headerCopy}>
          <Text style={styles.eyebrow}>CONVOY COMMAND</Text>
          <Text style={styles.title}>Credentials & Roster</Text>
        </View>
        <View style={styles.headerActions}>
          {loading ? <ActivityIndicator color={TACTICAL.amber} /> : null}
          <TouchableOpacity
            style={styles.backButton}
            accessibilityRole="button"
            accessibilityLabel="Back to dispatch"
            onPress={() => router.back()}
            activeOpacity={0.82}
          >
            <Ionicons name="chevron-back-outline" size={15} color={TACTICAL.amber} />
            <Text style={styles.backButtonText}>Back</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.tabs}>
        {(['leader', 'join', 'roster'] as Mode[]).map((item) => (
          <TouchableOpacity
            key={item}
            style={[styles.tab, mode === item ? styles.tabActive : null]}
            accessibilityRole="button"
            accessibilityLabel={`Open ${item} convoy tab`}
            onPress={() => {
              setMode(item);
              if (item === 'roster') void reconcileConvoyState(null, { showPending: true });
            }}
            activeOpacity={0.82}
          >
            <Text style={[styles.tabText, mode === item ? styles.tabTextActive : null]}>
              {item === 'leader' ? 'Leader' : item === 'join' ? 'Join' : 'Roster'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <PrivacyCard />

        {notice ? <Text style={styles.notice}>{notice}</Text> : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}

        {mode === 'leader' ? (
          <View style={styles.section}>
            <SectionTitle title="Create Convoy" subtitle="Start a private convoy and issue short-lived member credentials." />
            <Field label="Convoy name" value={convoyName} onChangeText={setConvoyName} placeholder="Trail Convoy" />
            <Field label="Leader callsign" value={leaderCallsign} onChangeText={setLeaderCallsign} placeholder="LEAD" autoCapitalize="characters" />
            <OptionGroup
              label="Leader vehicle"
              options={vehicles.map((vehicle) => ({ label: vehicleLabel(vehicle), value: vehicle.id }))}
              value={leaderVehicleId}
              onChange={setLeaderVehicleId}
              emptyLabel="No Fleet vehicle available"
            />
            <ECSButton label="Create Convoy" icon="people-outline" variant="primary" size="compact" onPress={handleCreateConvoy} loading={loading} />

            <SectionTitle title="Generate Invite" subtitle="Invite code is returned once. ECS stores only a secure hash." />
            <ConvoySelector convoys={convoys} value={selectedConvoy?.convoy.id ?? null} onChange={setSelectedConvoyId} />
            <OptionGroup label="Invite role" options={ROLE_OPTIONS.map((role) => ({ label: role.toUpperCase(), value: role }))} value={inviteRole} onChange={(value) => setInviteRole(value as ConvoyRole)} />
            <OptionGroup label="Expiration" options={EXPIRATION_OPTIONS.map((item) => ({ label: item.label, value: item.value }))} value={expiresPreset} onChange={(value) => setExpiresPreset(value as ExpirationPreset)} />
            <Field label="Max uses" value={maxUses} onChangeText={setMaxUses} placeholder="1" keyboardType="number-pad" />
            <ECSButton label="Generate Invite Code" icon="key-outline" variant="active" size="compact" disabled={!selectedConvoy || !isLeader} onPress={handleGenerateInvite} loading={loading} />
            {!isLeader && selectedConvoy ? <Text style={styles.helper}>Only the convoy leader can create or revoke invites.</Text> : null}

            {lastInviteCode ? (
              <View style={styles.inviteCard}>
                <Text style={styles.cardLabel}>ONE-TIME INVITE CODE</Text>
                <View style={styles.inviteCodeRow}>
                  <Text style={styles.inviteCode} numberOfLines={1} adjustsFontSizeToFit>
                    {lastInviteCode}
                  </Text>
                  <ECSCopyButton
                    value={lastInviteCode}
                    label="COPY"
                    copiedLabel="COPIED"
                    accessibilityLabel="Copy one-time convoy invite code"
                    onCopied={(success) => setNotice(success ? 'Invite code copied.' : 'Unable to copy invite code on this device.')}
                  />
                </View>
                {lastInvitePayload ? (
                  <View
                    accessible
                    accessibilityRole="image"
                    accessibilityLabel={`Convoy invite QR code for ${lastInviteCode}`}
                    style={styles.qrCard}
                  >
                    <QRCode
                      value={lastInvitePayload}
                      size={144}
                      color="#071014"
                      backgroundColor="#F4E6BD"
                    />
                  </View>
                ) : null}
                <Text style={styles.helper}>Scan Invite QR or share the one-time code. ECS stores only the secure hash.</Text>
                <ECSButton label="Share Invite" icon="share-social-outline" variant="secondary" size="compact" onPress={handleShareInvite} />
              </View>
            ) : null}

            <InviteList invites={invites} canRevoke={isLeader} onRevoke={handleRevokeInvite} />
          </View>
        ) : null}

        {mode === 'join' ? (
          <View style={styles.section}>
            <SectionTitle title="Join Convoy" subtitle="Enter the leader-issued code and choose the callsign shown to the convoy." />
            <Field
              label="Invite code"
              value={joinCode}
              onChangeText={(value) => setJoinCode(formatConvoyInviteCode(value))}
              placeholder="ECS-ABCD-2345"
              autoCapitalize="characters"
              maxLength={24}
            />
            <Field label="Callsign" value={joinCallsign} onChangeText={setJoinCallsign} placeholder="V2" autoCapitalize="characters" />
            <OptionGroup
              label="Vehicle"
              options={vehicles.map((vehicle) => ({ label: vehicleLabel(vehicle), value: vehicle.id }))}
              value={joinVehicleId}
              onChange={setJoinVehicleId}
              emptyLabel="Join without vehicle"
            />
            <Text style={styles.helper}>
              Joining adds you to the roster only. Live location sharing is optional; use Start live sharing separately from Convoy Command.
            </Text>
            <ECSButton label="Join Convoy" icon="log-in-outline" variant="primary" size="compact" onPress={handleJoinConvoy} loading={loading} />
          </View>
        ) : null}

        {mode === 'roster' ? (
          <View style={styles.section}>
            <SectionTitle title="Convoy Roster" subtitle="Active members only. Leaders can revoke access at any time." />
            <ConvoySelector convoys={convoys} value={selectedConvoy?.convoy.id ?? null} onChange={setSelectedConvoyId} />
            <Text style={styles.helper}>
              Your role: {selectedRole.toUpperCase()} / {isLeader ? 'leader controls enabled' : 'member view'}
            </Text>
            {rosterRefreshing ? <Text style={styles.helper}>Roster syncing with convoy backend.</Text> : null}
            {rosterStaleMessage ? <Text style={styles.rosterWarning}>{rosterStaleMessage}</Text> : null}
            <ConvoyStalenessLadderPanel ladder={convoyStalenessLadder} />
            <RosterList
              members={members}
              locationByMember={locationByMember}
              currentUserId={user?.id ?? null}
              canRevoke={isLeader}
              onRevoke={handleRevokeMember}
            />
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

function PrivacyCard() {
  return (
    <View style={styles.privacyCard}>
      <Ionicons name="shield-checkmark-outline" size={17} color={TACTICAL.amber} />
      <View style={styles.privacyCopy}>
        <Text style={styles.privacyTitle}>Private convoy access</Text>
        <Text style={styles.privacyText}>
          Live location is shared only with active convoy members. Tracking can be turned off at any time. Leaders can revoke member or invite access.
        </Text>
      </View>
    </View>
  );
}

function SectionTitle({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <View style={styles.sectionTitle}>
      <Text style={styles.sectionHeading}>{title}</Text>
      <Text style={styles.sectionSubtitle}>{subtitle}</Text>
    </View>
  );
}

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  autoCapitalize = 'none',
  maxLength,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  keyboardType?: 'default' | 'number-pad';
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  maxLength?: number;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={TACTICAL.textMuted}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        maxLength={maxLength}
      />
    </View>
  );
}

function OptionGroup({
  label,
  options,
  value,
  onChange,
  emptyLabel,
}: {
  label: string;
  options: { label: string; value: string }[];
  value: string | null;
  onChange: (value: string | null) => void;
  emptyLabel?: string;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.optionWrap}>
        {options.length > 0 ? options.map((option) => {
          const selected = option.value === value;
          return (
            <TouchableOpacity
              key={option.value}
              style={[styles.optionChip, selected ? styles.optionChipSelected : null]}
              accessibilityRole="button"
              accessibilityLabel={`Select ${option.label}`}
              onPress={() => onChange(option.value)}
              activeOpacity={0.82}
            >
              <Text style={[styles.optionText, selected ? styles.optionTextSelected : null]} numberOfLines={1}>
                {option.label}
              </Text>
            </TouchableOpacity>
          );
        }) : (
          <TouchableOpacity style={styles.optionChip} accessibilityRole="button" onPress={() => onChange(null)} activeOpacity={0.82}>
            <Text style={styles.optionText}>{emptyLabel ?? 'None'}</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

function ConvoySelector({
  convoys,
  value,
  onChange,
}: {
  convoys: ConvoyListItem[];
  value: string | null;
  onChange: (value: string) => void;
}) {
  if (convoys.length === 0) {
    return <Text style={styles.emptyText}>No active convoys yet.</Text>;
  }

  return (
    <OptionGroup
      label="Active convoy"
      options={convoys.map((item) => ({ label: item.convoy.name, value: item.convoy.id }))}
      value={value}
      onChange={(next) => next && onChange(next)}
    />
  );
}

function InviteList({
  invites,
  canRevoke,
  onRevoke,
}: {
  invites: ConvoyInviteRecord[];
  canRevoke: boolean;
  onRevoke: (invite: ConvoyInviteRecord) => void;
}) {
  return (
    <View style={styles.list}>
      <Text style={styles.listTitle}>Active Invite Records</Text>
      {invites.length === 0 ? <Text style={styles.emptyText}>No invite records visible.</Text> : null}
      {invites.map((invite) => {
        const revoked = Boolean(invite.revoked_at);
        const expired = Date.parse(invite.expires_at) <= Date.now();
        return (
          <View key={invite.id} style={styles.rowCard}>
            <View style={styles.rowCopy}>
              <Text style={styles.rowTitle}>{invite.role.toUpperCase()} / {invite.used_count}/{invite.max_uses} used</Text>
              <Text style={styles.rowMeta}>
                {revoked ? 'Revoked' : expired ? 'Expired' : `Expires ${formatDateTime(invite.expires_at)}`}
              </Text>
            </View>
            <ECSButton
              label="Revoke"
              size="compact"
              variant="destructive"
              disabled={!canRevoke || revoked}
              onPress={() => onRevoke(invite)}
            />
          </View>
        );
      })}
    </View>
  );
}

function ConvoyStalenessLadderPanel({ ladder }: { ladder: ConvoyStalenessLadder }) {
  return (
    <View style={styles.stalenessLadderCard}>
      <View style={styles.stalenessLadderHeader}>
        <View style={styles.stalenessLadderTitleBlock}>
          <Text style={styles.listTitle}>Convoy Staleness Ladder</Text>
          <Text style={styles.stalenessLadderBeta}>Current user-facing/internal beta extension</Text>
        </View>
        <Text style={styles.stalenessLadderPolicy}>
          {ladder.policy
            ? `${ladder.policy.delayedAfter}/${ladder.policy.staleAfter}/${ladder.policy.missingAfter}m`
            : 'Policy needed'}
        </Text>
      </View>
      <Text style={styles.helper}>
        Groups show check-in overdue status from accepted sources only. ECS does not infer distress from silence.
      </Text>
      {ladder.groups.length === 0 ? <Text style={styles.emptyText}>No convoy roster data visible.</Text> : null}
      {ladder.groups.map((group) => (
        <View key={group.group} style={styles.stalenessGroup}>
          <Text style={styles.stalenessGroupTitle}>{group.label}</Text>
          {group.rows.map((row) => (
            <View key={row.memberId} style={styles.stalenessRow}>
              <View style={styles.stalenessRowHeader}>
                <Text style={styles.stalenessMember} numberOfLines={1}>
                  {row.displayName}
                </Text>
                <Text style={styles.stalenessStatus} numberOfLines={1}>
                  {convoyStalenessStatusLabel(row.status)}
                </Text>
              </View>
              <Text style={styles.stalenessMeta} numberOfLines={2}>
                {formatCheckInAge(row)}{row.channelState ? ` / channel ${row.channelState}` : ''}
              </Text>
              {row.activeEventSummary ? (
                <Text style={styles.stalenessMeta} numberOfLines={2}>
                  Event: {row.activeEventSummary}
                </Text>
              ) : null}
              <Text style={styles.stalenessMeta} numberOfLines={2}>
                {row.lastSharedCoordinate
                  ? `last shared coordinate: ${row.lastSharedCoordinate.label ?? `${row.lastSharedCoordinate.lat.toFixed(4)}, ${row.lastSharedCoordinate.lng.toFixed(4)}`}`
                  : 'last shared coordinate: not explicitly shared or not permissioned'}
              </Text>
              {[...row.sourceNotes, ...row.privacyNotes].slice(0, 3).map((note, index) => (
                <Text key={`${row.memberId}-note-${index}`} style={styles.stalenessNote} numberOfLines={2}>
                  {note.includes('pending replay') ? note : note}
                </Text>
              ))}
            </View>
          ))}
        </View>
      ))}
      {ladder.sourceNotes.length ? (
        <Text style={styles.stalenessNote} numberOfLines={2}>
          {ladder.sourceNotes.join(' ')}
        </Text>
      ) : null}
    </View>
  );
}

function RosterList({
  members,
  locationByMember,
  currentUserId,
  canRevoke,
  onRevoke,
}: {
  members: ConvoyMemberRecord[];
  locationByMember: Map<string, ConvoyLocationSummaryRecord>;
  currentUserId: string | null;
  canRevoke: boolean;
  onRevoke: (member: ConvoyMemberRecord) => void;
}) {
  if (members.length === 0) {
    return <Text style={styles.emptyText}>No active members yet.</Text>;
  }

  return (
    <View style={styles.list}>
      {members.map((member) => {
        const isSelf = member.user_id === currentUserId;
        const location = locationByMember.get(member.id) ?? null;
        return (
          <View key={member.id} style={styles.rowCard}>
            <View style={styles.rowCopy}>
              <Text style={styles.rowTitle}>{member.callsign}{isSelf ? ' / YOU' : ''}</Text>
              <Text style={styles.rowMeta}>
                {member.role.toUpperCase()} / {formatLocationAge(location)} / {location?.movement_status ?? 'unknown'}
              </Text>
            </View>
            <ECSButton
              label="Revoke"
              size="compact"
              variant="destructive"
              disabled={!canRevoke || isSelf}
              onPress={() => onRevoke(member)}
            />
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  header: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    borderBottomWidth: 1,
    borderBottomColor: TACTICAL.border,
    backgroundColor: ECS_SURFACE.background.primary,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  headerSafeArea: {
    paddingBottom: 8,
  },
  backButton: {
    minWidth: 70,
    height: 34,
    borderWidth: 1,
    borderColor: TACTICAL.border,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 4,
    paddingHorizontal: 10,
    backgroundColor: ECS_SURFACE.background.compact,
  },
  backButtonText: {
    color: TACTICAL.amber,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  headerCopy: {
    flex: 1,
    minWidth: 0,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  eyebrow: {
    ...TYPO.U2,
    color: TACTICAL.amber,
    fontSize: 9,
    letterSpacing: 1.2,
  },
  title: {
    color: TACTICAL.text,
    fontSize: 17,
    fontWeight: '900',
    marginTop: 1,
  },
  tabs: {
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 10,
    paddingTop: 7,
    paddingBottom: 6,
    backgroundColor: ECS_SURFACE.background.secondary,
  },
  tab: {
    flex: 1,
    minHeight: 30,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: TACTICAL.border,
    borderRadius: 8,
    backgroundColor: ECS_SURFACE.background.compact,
  },
  tabActive: {
    borderColor: TACTICAL.amber,
    backgroundColor: ECS_SURFACE.background.selected,
  },
  tabText: {
    color: TACTICAL.textMuted,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.9,
    textTransform: 'uppercase',
  },
  tabTextActive: {
    color: TACTICAL.text,
  },
  content: {
    padding: 10,
    paddingBottom: 92,
    gap: 8,
  },
  privacyCard: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    borderWidth: 1,
    borderColor: ECS_SURFACE.border.selected,
    borderRadius: 10,
    backgroundColor: ECS_SURFACE.background.selected,
    paddingHorizontal: 9,
    paddingVertical: 8,
  },
  privacyCopy: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  privacyTitle: {
    color: TACTICAL.text,
    fontSize: 13,
    fontWeight: '900',
  },
  privacyText: {
    color: TACTICAL.textMuted,
    fontSize: 10,
    lineHeight: 14,
    fontWeight: '700',
  },
  notice: {
    color: TACTICAL.text,
    fontSize: 12,
    fontWeight: '800',
    lineHeight: 17,
  },
  error: {
    color: TACTICAL.danger,
    fontSize: 12,
    fontWeight: '900',
    lineHeight: 17,
  },
  section: {
    gap: 8,
    borderWidth: 1,
    borderColor: TACTICAL.border,
    borderRadius: 10,
    backgroundColor: ECS_SURFACE.background.primary,
    padding: 9,
  },
  sectionTitle: {
    gap: 2,
  },
  sectionHeading: {
    color: TACTICAL.text,
    fontSize: 13,
    fontWeight: '900',
  },
  sectionSubtitle: {
    color: TACTICAL.textMuted,
    fontSize: 10,
    lineHeight: 14,
    fontWeight: '700',
  },
  field: {
    gap: 4,
  },
  fieldLabel: {
    color: TACTICAL.amber,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.9,
    textTransform: 'uppercase',
  },
  input: {
    minHeight: 36,
    borderWidth: 1,
    borderColor: TACTICAL.border,
    borderRadius: 8,
    color: TACTICAL.text,
    backgroundColor: ECS_SURFACE.background.compact,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 12,
    fontWeight: '800',
  },
  optionWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
  },
  optionChip: {
    minHeight: 29,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: TACTICAL.border,
    borderRadius: 8,
    backgroundColor: ECS_SURFACE.background.compact,
    paddingHorizontal: 8,
  },
  optionChipSelected: {
    borderColor: TACTICAL.amber,
    backgroundColor: ECS_SURFACE.background.selected,
  },
  optionText: {
    color: TACTICAL.textMuted,
    fontSize: 10,
    fontWeight: '900',
  },
  optionTextSelected: {
    color: TACTICAL.text,
  },
  helper: {
    color: TACTICAL.textMuted,
    fontSize: 10,
    lineHeight: 14,
    fontWeight: '700',
  },
  rosterWarning: {
    color: TACTICAL.amber,
    fontSize: 10,
    lineHeight: 14,
    fontWeight: '800',
  },
  inviteCard: {
    gap: 6,
    borderWidth: 1,
    borderColor: ECS_SURFACE.border.selected,
    borderRadius: 9,
    backgroundColor: ECS_SURFACE.background.selected,
    padding: 9,
  },
  cardLabel: {
    color: TACTICAL.textMuted,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1,
  },
  inviteCode: {
    flex: 1,
    minWidth: 0,
    color: TACTICAL.amber,
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: 2.4,
    textAlign: 'left',
  },
  inviteCodeRow: {
    minHeight: 34,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  qrCard: {
    alignSelf: 'center',
    padding: 10,
    borderRadius: 10,
    backgroundColor: '#F4E6BD',
    borderWidth: 1,
    borderColor: 'rgba(244, 230, 189, 0.72)',
  },
  list: {
    gap: 5,
  },
  listTitle: {
    color: TACTICAL.text,
    fontSize: 12,
    fontWeight: '900',
  },
  stalenessLadderCard: {
    gap: 8,
    borderWidth: 1,
    borderColor: ECS_SURFACE.border.selected,
    borderRadius: 9,
    backgroundColor: ECS_SURFACE.background.selected,
    padding: 9,
  },
  stalenessLadderHeader: {
    minHeight: 30,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  stalenessLadderTitleBlock: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  stalenessLadderBeta: {
    color: TACTICAL.textMuted,
    fontSize: 9,
    lineHeight: 12,
    fontWeight: '800',
  },
  stalenessLadderPolicy: {
    color: TACTICAL.amber,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.7,
    textTransform: 'uppercase',
  },
  stalenessGroup: {
    gap: 5,
  },
  stalenessGroupTitle: {
    color: TACTICAL.amber,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.7,
    textTransform: 'uppercase',
  },
  stalenessRow: {
    gap: 4,
    borderWidth: 1,
    borderColor: TACTICAL.border,
    borderRadius: 8,
    backgroundColor: ECS_SURFACE.background.compact,
    paddingHorizontal: 8,
    paddingVertical: 7,
  },
  stalenessRowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  stalenessMember: {
    flex: 1,
    minWidth: 0,
    color: TACTICAL.text,
    fontSize: 12,
    fontWeight: '900',
  },
  stalenessStatus: {
    color: TACTICAL.text,
    fontSize: 9,
    fontWeight: '900',
    textTransform: 'uppercase',
    flexShrink: 0,
  },
  stalenessMeta: {
    color: TACTICAL.textMuted,
    fontSize: 10,
    lineHeight: 14,
    fontWeight: '700',
  },
  stalenessNote: {
    color: TACTICAL.textMuted,
    fontSize: 9,
    lineHeight: 13,
    fontWeight: '700',
  },
  rowCard: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    borderWidth: 1,
    borderColor: TACTICAL.border,
    borderRadius: 9,
    backgroundColor: ECS_SURFACE.background.compact,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  rowCopy: {
    flex: 1,
    minWidth: 0,
  },
  rowTitle: {
    color: TACTICAL.text,
    fontSize: 12,
    fontWeight: '900',
  },
  rowMeta: {
    color: TACTICAL.textMuted,
    fontSize: 10,
    fontWeight: '700',
    marginTop: 2,
  },
  emptyText: {
    color: TACTICAL.textMuted,
    fontSize: 12,
    fontWeight: '800',
    lineHeight: 17,
  },
});
