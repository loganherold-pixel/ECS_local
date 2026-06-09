import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Stack } from 'expo-router';

import { ECS_SURFACE } from '../../lib/ecsSurfaceTokens';
import { TACTICAL, TYPO } from '../../lib/theme';
import {
  getConvoyParticipantQaFixtures,
  getConvoyParticipantQaMapVehicles,
  getConvoyParticipantQaParticipants,
} from '../../lib/convoy/convoyParticipantQaFixtures';
import { formatConvoyParticipantLastUpdated, type ConvoyParticipant } from '../../lib/convoy/convoyParticipantModel';
import { ConvoyCommandMap } from './ConvoyCommandMap';

function statusTone(status: ConvoyParticipant['status']): string {
  switch (status) {
    case 'live':
      return TACTICAL.success;
    case 'stale':
      return TACTICAL.amber;
    case 'disconnected':
    case 'unknown':
      return TACTICAL.textMuted;
    case 'demo':
    default:
      return TACTICAL.warning;
  }
}

function ParticipantRow({
  participant,
  selected,
  onSelect,
}: {
  participant: ConvoyParticipant;
  selected: boolean;
  onSelect: () => void;
}) {
  const tone = statusTone(participant.status);
  return (
    <TouchableOpacity
      style={[styles.participantRow, selected ? styles.participantRowSelected : null]}
      accessibilityRole="button"
      accessibilityLabel={`${participant.displayName}, ${participant.roleLabel}, ${participant.statusLabel}`}
      activeOpacity={0.82}
      onPress={onSelect}
    >
      <View style={styles.participantHeader}>
        <Text style={styles.participantName} numberOfLines={1}>
          {participant.displayName}
        </Text>
        <View style={[styles.statusPill, { borderColor: tone }]}>
          <Text style={[styles.statusPillText, { color: tone }]}>{participant.statusLabel}</Text>
        </View>
      </View>
      <Text style={styles.participantMeta} numberOfLines={1}>
        {participant.roleLabel} / {participant.vehicleSummary ?? 'Vehicle unavailable'}
      </Text>
      {participant.badgeIdentity.title ? (
        <Text style={styles.participantIdentityTitle} numberOfLines={1}>
          {participant.badgeIdentity.title}
        </Text>
      ) : null}
      <Text style={styles.participantMeta} numberOfLines={1}>
        Updated {formatConvoyParticipantLastUpdated(participant)} / Marker{' '}
        {participant.shouldRenderMarker ? 'eligible' : 'suppressed'}
      </Text>
      <Text style={styles.participantBoundary} numberOfLines={2}>
        {participant.statusCopy} Read-only title: {participant.badgeIdentity.title ? participant.badgeIdentity.source : 'not shown'}.
      </Text>
    </TouchableOpacity>
  );
}

export function ConvoyParticipantFixtureQaScreen() {
  const nowMs = useMemo(() => Date.now(), []);
  const fixtures = useMemo(() => getConvoyParticipantQaFixtures({}, nowMs), [nowMs]);
  const members = useMemo(() => getConvoyParticipantQaMapVehicles({}, nowMs), [nowMs]);
  const participants = useMemo(() => getConvoyParticipantQaParticipants({}, nowMs), [nowMs]);
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(members[0]?.memberId ?? null);

  const selectedParticipantId = selectedMemberId
    ? members.find((member) => member.memberId === selectedMemberId)?.participantId ?? selectedMemberId
    : null;

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ title: 'Convoy Participant QA' }} />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={styles.kicker}>DEV ONLY - CONVOY PARTICIPANT QA</Text>
          <Text style={styles.title}>Native participant fixture harness</Text>
          <Text style={styles.body}>
            NON-LIVE CONVOY FIXTURE path for Android device checks. Rows are local deterministic
            participants rendered through the Convoy Command display path without creating convoy membership,
            publishing location, changing badge progress, or touching trip and packet state.
          </Text>
        </View>

        <View style={styles.guardrailGrid}>
          {[
            ['Production access', 'Redirected'],
            ['Membership', 'Not created'],
            ['Location publish', 'Not called'],
            ['Badge unlocks', 'Deferred'],
            ['Badge titles', 'Read-only display'],
            ['Fixture status', 'Non-live'],
          ].map(([label, value]) => (
            <View key={label} style={styles.guardrail}>
              <Text style={styles.guardrailLabel}>{label}</Text>
              <Text style={styles.guardrailValue}>{value}</Text>
            </View>
          ))}
        </View>

        <View style={styles.mapShell}>
          <Text style={styles.sectionLabel}>Convoy Command Map Path</Text>
          <ConvoyCommandMap
            convoyId="convoy-participant-qa-dev-only"
            members={members}
            currentUserMemberId="qa-live-leader"
            connectionStatus="connected"
            selectedMemberId={selectedMemberId}
            onSelectMember={(member) => setSelectedMemberId(member.memberId)}
            showStatusSummary
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Participant Rows</Text>
          <Text style={styles.body}>
            Fixture rows cover live, stale, disconnected, unknown, missing-coordinate, demo, and mock states,
            plus Leader, Member, Tail, Scout, Recovery, and Medic role labels.
          </Text>
          {participants.map((participant) => {
            const matchingMember = members.find((member) => {
              const candidate = member.participantId ?? member.memberId;
              if (participant.participantId === 'unknown-participant') {
                return member.callsign === participant.displayName;
              }
              return candidate === participant.participantId;
            });
            return (
              <ParticipantRow
                key={`${participant.participantId}-${participant.displayName}`}
                participant={participant}
                selected={selectedParticipantId === participant.participantId}
                onSelect={() => setSelectedMemberId(matchingMember?.memberId ?? null)}
              />
            );
          })}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Scenario Checklist</Text>
          {fixtures.map((fixture, index) => (
            <View key={fixture.id} style={styles.checkRow}>
              <Text style={styles.checkIndex}>{String(index + 1).padStart(2, '0')}</Text>
              <View style={styles.checkCopy}>
                <Text style={styles.checkTitle}>{fixture.title}</Text>
                <Text style={styles.checkMeta}>
                  Expected {fixture.expectedStatus} / {fixture.expectedRoleLabel} / Marker{' '}
                  {fixture.markerEligible ? 'eligible' : 'suppressed'}
                </Text>
                <Text style={styles.checkDisclosure}>{fixture.disclosure}</Text>
              </View>
            </View>
          ))}
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerTitle}>QA boundary</Text>
          <Text style={styles.footerText}>
            This screen is for native visual verification only. It is not a convoy setup flow, tracking
            simulator, invite surface, or badge system entry point.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: ECS_SURFACE.background.primary,
  },
  content: {
    padding: 12,
    paddingBottom: 36,
    gap: 10,
  },
  header: {
    borderWidth: 1,
    borderColor: ECS_SURFACE.border.selected,
    borderRadius: 8,
    backgroundColor: ECS_SURFACE.background.secondary,
    padding: 12,
  },
  kicker: {
    ...TYPO.U2,
    color: TACTICAL.amber,
    fontSize: 9,
    letterSpacing: 1,
  },
  title: {
    marginTop: 5,
    color: TACTICAL.text,
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: 0,
  },
  body: {
    marginTop: 6,
    color: TACTICAL.textMuted,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '700',
  },
  guardrailGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
  },
  guardrail: {
    flexGrow: 1,
    flexBasis: '31%',
    minHeight: 52,
    borderWidth: 1,
    borderColor: ECS_SURFACE.border.default,
    borderRadius: 8,
    backgroundColor: ECS_SURFACE.background.compact,
    justifyContent: 'center',
    paddingHorizontal: 9,
    paddingVertical: 7,
  },
  guardrailLabel: {
    color: TACTICAL.textMuted,
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 0.7,
    textTransform: 'uppercase',
  },
  guardrailValue: {
    marginTop: 4,
    color: TACTICAL.text,
    fontSize: 12,
    fontWeight: '900',
  },
  mapShell: {
    gap: 7,
  },
  section: {
    gap: 8,
    borderWidth: 1,
    borderColor: ECS_SURFACE.border.default,
    borderRadius: 8,
    backgroundColor: ECS_SURFACE.background.secondary,
    padding: 10,
  },
  sectionLabel: {
    ...TYPO.U2,
    color: TACTICAL.amber,
    fontSize: 9,
    letterSpacing: 1,
  },
  participantRow: {
    borderWidth: 1,
    borderColor: ECS_SURFACE.border.default,
    borderRadius: 8,
    backgroundColor: ECS_SURFACE.background.compact,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 4,
  },
  participantRowSelected: {
    borderColor: ECS_SURFACE.border.selected,
    backgroundColor: ECS_SURFACE.background.selected,
  },
  participantHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  participantName: {
    flex: 1,
    minWidth: 0,
    color: TACTICAL.text,
    fontSize: 13,
    fontWeight: '900',
  },
  statusPill: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  statusPillText: {
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  participantMeta: {
    color: TACTICAL.textMuted,
    fontSize: 10,
    lineHeight: 14,
    fontWeight: '800',
  },
  participantIdentityTitle: {
    color: TACTICAL.amber,
    fontSize: 10,
    lineHeight: 14,
    fontWeight: '800',
  },
  participantBoundary: {
    color: TACTICAL.amber,
    fontSize: 10,
    lineHeight: 14,
    fontWeight: '800',
  },
  checkRow: {
    flexDirection: 'row',
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: ECS_SURFACE.border.quiet,
    paddingTop: 8,
  },
  checkIndex: {
    width: 24,
    color: TACTICAL.amber,
    fontSize: 11,
    fontWeight: '900',
  },
  checkCopy: {
    flex: 1,
    minWidth: 0,
  },
  checkTitle: {
    color: TACTICAL.text,
    fontSize: 12,
    fontWeight: '900',
  },
  checkMeta: {
    marginTop: 2,
    color: TACTICAL.textMuted,
    fontSize: 10,
    lineHeight: 14,
    fontWeight: '800',
  },
  checkDisclosure: {
    marginTop: 2,
    color: TACTICAL.textMuted,
    fontSize: 10,
    lineHeight: 14,
    fontWeight: '700',
  },
  footer: {
    borderWidth: 1,
    borderColor: ECS_SURFACE.border.quiet,
    borderRadius: 8,
    backgroundColor: ECS_SURFACE.background.compact,
    padding: 10,
  },
  footerTitle: {
    color: TACTICAL.text,
    fontSize: 12,
    fontWeight: '900',
  },
  footerText: {
    marginTop: 4,
    color: TACTICAL.textMuted,
    fontSize: 11,
    lineHeight: 16,
    fontWeight: '700',
  },
});

export default ConvoyParticipantFixtureQaScreen;
