import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { SafeIcon as Ionicons } from '../../SafeIcon';
import { GOLD_RAIL, TACTICAL, TYPO } from '../../../lib/theme';
import type {
  ConvoyCommandDataState,
  ConvoyMember,
  ConvoyMemberRole,
  ConvoyMemberStatus,
} from '../../../lib/navigation/convoyCommandData';
import { CommandCenterFrame } from './CommandCenterFrame';
import type { CommandCenterMode } from './commandCenterTypes';
import { useConvoyCommandData } from './useConvoyCommandData';

type ConvoyCommandProps = {
  mode?: CommandCenterMode;
  availableModes?: CommandCenterMode[];
  onModeChange?: (mode: CommandCenterMode) => void;
  testID?: string;
};

const STATE_LABEL: Record<ConvoyCommandDataState, string> = {
  live: 'LIVE',
  checkIn: 'CHECK-IN',
  planned: 'PLANNED',
  partial: 'PARTIAL',
  offline: 'OFFLINE',
  setupNeeded: 'SETUP NEEDED',
};

const STATUS_ACCENT: Record<ConvoyMemberStatus, string> = {
  online: '#49D17A',
  checkedIn: '#5AC8FA',
  delayed: TACTICAL.amber,
  stopped: TACTICAL.amber,
  offline: TACTICAL.textMuted,
  emergency: TACTICAL.danger,
  unknown: TACTICAL.textMuted,
};

function stateAccent(state: ConvoyCommandDataState): string {
  switch (state) {
    case 'live':
      return '#49D17A';
    case 'checkIn':
      return '#5AC8FA';
    case 'planned':
      return TACTICAL.amber;
    case 'offline':
      return TACTICAL.textMuted;
    case 'partial':
    case 'setupNeeded':
    default:
      return TACTICAL.amber;
  }
}

function roleIcon(role: ConvoyMemberRole): React.ComponentProps<typeof Ionicons>['name'] {
  switch (role) {
    case 'lead':
      return 'flag-outline';
    case 'sweep':
      return 'shield-outline';
    case 'medic':
      return 'medkit-outline';
    case 'recovery':
      return 'construct-outline';
    case 'member':
      return 'ellipse-outline';
    case 'unknown':
    default:
      return 'person-outline';
  }
}

function formatAge(updatedAt: Date | null): string {
  if (!updatedAt) return 'No check-in yet';
  const elapsedMs = Date.now() - updatedAt.getTime();
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0) return 'Updated just now';
  const seconds = Math.round(elapsedMs / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function statusLabel(status: ConvoyMemberStatus): string {
  switch (status) {
    case 'online':
      return 'Online';
    case 'checkedIn':
      return 'Checked in';
    case 'delayed':
      return 'Delayed';
    case 'stopped':
      return 'Stopped';
    case 'offline':
      return 'Offline';
    case 'emergency':
      return 'Assist';
    case 'unknown':
    default:
      return 'Unknown';
  }
}

function MetricTile({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <View style={styles.metricTile}>
      <Text style={styles.metricLabel} numberOfLines={1}>
        {label}
      </Text>
      <Text style={[styles.metricValue, accent ? { color: accent } : null]} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

function MemberRow({ member }: { member: ConvoyMember }) {
  const accent = STATUS_ACCENT[member.status];
  const updateText = member.lastCheckInAt
    ? `Check-in ${formatAge(member.lastCheckInAt)}`
    : member.lastPingAt
      ? `Last known ${formatAge(member.lastPingAt)}`
      : member.note ?? 'No recent check-in';

  return (
    <View style={styles.memberRow}>
      <View style={[styles.memberIcon, { borderColor: `${accent}55`, backgroundColor: `${accent}13` }]}>
        <Ionicons name={roleIcon(member.role)} size={11} color={accent} />
      </View>
      <View style={styles.memberCopy}>
        <View style={styles.memberTopLine}>
          <Text style={styles.memberName} numberOfLines={1}>
            {member.displayName}
          </Text>
          <Text style={[styles.memberStatus, { color: accent }]} numberOfLines={1}>
            {statusLabel(member.status)}
          </Text>
        </View>
        <Text style={styles.memberMeta} numberOfLines={1}>
          {member.role.toUpperCase()} · {member.vehicleName} · {updateText}
        </Text>
      </View>
    </View>
  );
}

function ConvoySchematic({
  members,
  state,
}: {
  members: ConvoyMember[];
  state: ConvoyCommandDataState;
}) {
  const accent = stateAccent(state);
  const visibleMembers = members.slice(0, 5);

  return (
    <View style={styles.schematic}>
      <View style={styles.schematicHeader}>
        <Text style={styles.schematicTitle} numberOfLines={1}>
          CONVOY FORMATION
        </Text>
        <Text style={[styles.schematicMode, { color: accent }]} numberOfLines={1}>
          {STATE_LABEL[state]}
        </Text>
      </View>
      <View style={styles.routeLine}>
        <View style={[styles.routePulse, { backgroundColor: accent }]} />
      </View>
      <View style={styles.memberTrack}>
        {visibleMembers.length > 0 ? (
          visibleMembers.map((member, index) => {
            const memberAccent = STATUS_ACCENT[member.status];
            return (
              <View key={member.id} style={styles.trackNodeWrap}>
                <View style={[styles.trackNode, { borderColor: memberAccent, backgroundColor: `${memberAccent}24` }]}>
                  <Text style={[styles.trackNodeText, { color: memberAccent }]} numberOfLines={1}>
                    {index === 0 ? 'L' : member.role === 'sweep' ? 'S' : `${index + 1}`}
                  </Text>
                </View>
                <Text style={styles.trackNodeRole} numberOfLines={1}>
                  {member.role.toUpperCase()}
                </Text>
              </View>
            );
          })
        ) : (
          <View style={styles.emptyTrack}>
            <Ionicons name="people-outline" size={18} color={TACTICAL.textMuted} />
            <Text style={styles.emptyTrackText} numberOfLines={2}>
              Add members and roles to stage convoy coordination.
            </Text>
          </View>
        )}
      </View>
      <Text style={styles.liveCaveat} numberOfLines={1}>
        {state === 'live' ? 'Live member sharing active' : 'No continuous live tracking in this mode'}
      </Text>
    </View>
  );
}

function SetupNeededState({ missingInputs }: { missingInputs: string[] }) {
  const missing = missingInputs.length > 0 ? missingInputs.slice(0, 4).join(' · ') : 'Convoy plan';
  return (
    <View style={styles.setupState}>
      <View style={styles.setupIcon}>
        <Ionicons name="people-outline" size={25} color={TACTICAL.amber} />
      </View>
      <Text style={styles.setupTitle} numberOfLines={1}>
        Convoy setup needed
      </Text>
      <Text style={styles.setupText} numberOfLines={2}>
        Create a convoy plan with members, roles, rally point, and comms before ECS can coordinate group movement.
      </Text>
      <Text style={styles.setupMissing} numberOfLines={1}>
        Missing: {missing}
      </Text>
    </View>
  );
}

export function ConvoyCommand({
  mode = 'convoyCommand',
  availableModes,
  onModeChange,
  testID = 'convoy-command',
}: ConvoyCommandProps) {
  const data = useConvoyCommandData();
  const accent = stateAccent(data.dataState);
  const visibleMembers = useMemo(() => data.members.slice(0, 4), [data.members]);
  const footerItems = [
    data.confidenceLabel,
    data.sourceLabel,
    data.activeRouteId ? 'Route linked' : 'No route link',
    formatAge(data.lastUpdatedAt),
  ];

  return (
    <CommandCenterFrame
      title="CONVOY COMMAND"
      subtitle="Group Expedition Coordination"
      state={data.dataState}
      stateLabel={STATE_LABEL[data.dataState]}
      mode={mode}
      availableModes={availableModes}
      onModeChange={onModeChange}
      footer={
        <View style={styles.footerWrap}>
          {footerItems.map((item) => (
            <Text key={item} style={styles.footerText} numberOfLines={1}>
              {item}
            </Text>
          ))}
        </View>
      }
      testID={testID}
    >
      <View style={[styles.body, data.dataState === 'offline' ? styles.bodyOffline : null]}>
        {data.dataState === 'setupNeeded' ? (
          <SetupNeededState missingInputs={data.missingInputs} />
        ) : (
          <>
            <View style={styles.mainContent}>
              <View style={styles.leftColumn}>
                <ConvoySchematic members={data.members} state={data.dataState} />
                <View style={styles.metricGrid}>
                  <MetricTile label="SIZE" value={data.convoySize > 0 ? String(data.convoySize) : '--'} accent={accent} />
                  <MetricTile label="DELAYED" value={String(data.delayedCount)} accent={data.delayedCount > 0 ? TACTICAL.amber : undefined} />
                  <MetricTile label="OFFLINE" value={String(data.offlineCount)} accent={data.offlineCount > 0 ? TACTICAL.textMuted : undefined} />
                  <MetricTile label="ASSIST" value={String(data.emergencyCount)} accent={data.emergencyCount > 0 ? TACTICAL.danger : undefined} />
                </View>
              </View>

              <View style={styles.rightColumn}>
                <View style={styles.contextStrip}>
                  <View style={styles.contextItem}>
                    <Text style={styles.contextLabel} numberOfLines={1}>
                      Rally
                    </Text>
                    <Text style={styles.contextValue} numberOfLines={1}>
                      {data.rallyPoint ?? 'Not set'}
                    </Text>
                  </View>
                  <View style={styles.contextItem}>
                    <Text style={styles.contextLabel} numberOfLines={1}>
                      Comms
                    </Text>
                    <Text style={styles.contextValue} numberOfLines={1}>
                      {data.channelLabel}
                    </Text>
                  </View>
                  <View style={styles.contextItem}>
                    <Text style={styles.contextLabel} numberOfLines={1}>
                      Regroup
                    </Text>
                    <Text style={styles.contextValue} numberOfLines={1}>
                      {data.regroupDistance ?? 'Set manually'}
                    </Text>
                  </View>
                </View>

                <View style={styles.memberList}>
                  {visibleMembers.length > 0 ? (
                    visibleMembers.map((member) => <MemberRow key={member.id} member={member} />)
                  ) : (
                    <View style={styles.noMembers}>
                      <Text style={styles.noMembersTitle} numberOfLines={1}>
                        Member roster unavailable
                      </Text>
                      <Text style={styles.noMembersText} numberOfLines={2}>
                        ECS can stage rally and comms, but member-level status needs a roster or check-in.
                      </Text>
                    </View>
                  )}
                </View>
              </View>
            </View>

            <View
              style={[
                styles.actionStrip,
                {
                  borderColor: `${accent}55`,
                  backgroundColor:
                    data.emergencyCount > 0
                      ? 'rgba(192, 57, 43, 0.15)'
                      : data.delayedCount > 0 || data.offlineCount > 0
                        ? 'rgba(212, 160, 23, 0.14)'
                        : 'rgba(255,255,255,0.04)',
                },
              ]}
            >
              <View style={[styles.actionIcon, { borderColor: `${accent}66` }]}>
                <Ionicons name="radio-outline" size={13} color={accent} />
              </View>
              <View style={styles.actionCopy}>
                <Text style={[styles.actionLabel, { color: accent }]} numberOfLines={1}>
                  {data.recommendationLabel}
                </Text>
                <Text style={styles.actionDetail} numberOfLines={1}>
                  {data.recommendationReason}
                </Text>
              </View>
            </View>
          </>
        )}
      </View>
    </CommandCenterFrame>
  );
}

export default ConvoyCommand;

const styles = StyleSheet.create({
  body: {
    flex: 1,
    minHeight: 0,
    gap: 7,
    padding: 7,
    backgroundColor: 'rgba(2, 5, 8, 0.48)',
  },
  bodyOffline: {
    opacity: 0.78,
  },
  mainContent: {
    flex: 1,
    minHeight: 0,
    flexDirection: 'row',
    gap: 8,
  },
  leftColumn: {
    width: '43%',
    minWidth: 120,
    minHeight: 0,
    gap: 7,
  },
  rightColumn: {
    flex: 1,
    minWidth: 0,
    gap: 6,
  },
  schematic: {
    flex: 1,
    minHeight: 0,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(212, 160, 23, 0.24)',
    backgroundColor: 'rgba(7, 12, 17, 0.86)',
    padding: 8,
    justifyContent: 'space-between',
  },
  schematicHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
  },
  schematicTitle: {
    ...TYPO.U2,
    flex: 1,
    color: TACTICAL.amber,
    fontSize: 7,
    letterSpacing: 0.7,
  },
  schematicMode: {
    fontSize: 7,
    lineHeight: 9,
    fontWeight: '900',
    letterSpacing: 0.7,
    includeFontPadding: false,
  },
  routeLine: {
    height: 3,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
  },
  routePulse: {
    width: '44%',
    height: '100%',
    borderRadius: 999,
    opacity: 0.78,
  },
  memberTrack: {
    minHeight: 62,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 5,
  },
  trackNodeWrap: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    gap: 4,
  },
  trackNode: {
    width: 28,
    height: 28,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  trackNodeText: {
    fontSize: 9,
    lineHeight: 11,
    fontWeight: '900',
    includeFontPadding: false,
  },
  trackNodeRole: {
    color: TACTICAL.textMuted,
    fontSize: 6,
    lineHeight: 8,
    fontWeight: '900',
    letterSpacing: 0.45,
    includeFontPadding: false,
  },
  emptyTrack: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  },
  emptyTrackText: {
    color: 'rgba(230, 237, 243, 0.72)',
    fontSize: 8,
    lineHeight: 10,
    fontWeight: '800',
    textAlign: 'center',
    includeFontPadding: false,
  },
  liveCaveat: {
    color: TACTICAL.textMuted,
    fontSize: 7,
    lineHeight: 9,
    fontWeight: '800',
    includeFontPadding: false,
  },
  metricGrid: {
    minHeight: 40,
    flexDirection: 'row',
    gap: 4,
  },
  metricTile: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 2,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: 'rgba(212, 160, 23, 0.14)',
    backgroundColor: 'rgba(255,255,255,0.035)',
    paddingHorizontal: 4,
  },
  metricLabel: {
    color: TACTICAL.textMuted,
    fontSize: 6,
    lineHeight: 8,
    fontWeight: '900',
    letterSpacing: 0.5,
    includeFontPadding: false,
  },
  metricValue: {
    color: TACTICAL.text,
    fontSize: 12,
    lineHeight: 14,
    fontWeight: '900',
    includeFontPadding: false,
  },
  contextStrip: {
    minHeight: 38,
    flexDirection: 'row',
    gap: 5,
  },
  contextItem: {
    flex: 1,
    minWidth: 0,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: 'rgba(212, 160, 23, 0.13)',
    backgroundColor: 'rgba(255,255,255,0.035)',
    paddingHorizontal: 6,
    justifyContent: 'center',
    gap: 2,
  },
  contextLabel: {
    color: TACTICAL.textMuted,
    fontSize: 6,
    lineHeight: 8,
    fontWeight: '900',
    letterSpacing: 0.45,
    includeFontPadding: false,
    textTransform: 'uppercase',
  },
  contextValue: {
    color: 'rgba(230, 237, 243, 0.8)',
    fontSize: 8,
    lineHeight: 10,
    fontWeight: '800',
    includeFontPadding: false,
  },
  memberList: {
    flex: 1,
    minHeight: 0,
    justifyContent: 'center',
    gap: 4,
  },
  memberRow: {
    minHeight: 30,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: 'rgba(212, 160, 23, 0.13)',
    backgroundColor: 'rgba(255,255,255,0.035)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 7,
    paddingVertical: 4,
  },
  memberIcon: {
    width: 22,
    height: 22,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  memberCopy: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  memberTopLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  memberName: {
    flex: 1,
    color: TACTICAL.amber,
    fontSize: 8,
    lineHeight: 10,
    fontWeight: '900',
    letterSpacing: 0.4,
    includeFontPadding: false,
  },
  memberStatus: {
    fontSize: 7,
    lineHeight: 9,
    fontWeight: '900',
    includeFontPadding: false,
  },
  memberMeta: {
    color: 'rgba(230, 237, 243, 0.62)',
    fontSize: 7,
    lineHeight: 9,
    fontWeight: '800',
    includeFontPadding: false,
  },
  noMembers: {
    flex: 1,
    justifyContent: 'center',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(212, 160, 23, 0.14)',
    backgroundColor: 'rgba(255,255,255,0.035)',
    paddingHorizontal: 10,
    gap: 5,
  },
  noMembersTitle: {
    color: TACTICAL.amber,
    fontSize: 10,
    lineHeight: 12,
    fontWeight: '900',
    letterSpacing: 0.5,
    includeFontPadding: false,
    textTransform: 'uppercase',
  },
  noMembersText: {
    color: 'rgba(230, 237, 243, 0.74)',
    fontSize: 8,
    lineHeight: 10,
    fontWeight: '800',
    includeFontPadding: false,
  },
  actionStrip: {
    minHeight: 36,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 11,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  actionIcon: {
    width: 25,
    height: 25,
    borderRadius: 999,
    borderWidth: 1,
    backgroundColor: 'rgba(0,0,0,0.26)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  actionLabel: {
    fontSize: 10,
    lineHeight: 12,
    fontWeight: '900',
    letterSpacing: 0.8,
    includeFontPadding: false,
  },
  actionDetail: {
    color: 'rgba(230, 237, 243, 0.72)',
    fontSize: 8,
    lineHeight: 10,
    fontWeight: '800',
    includeFontPadding: false,
  },
  footerWrap: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
  },
  footerText: {
    flexShrink: 1,
    color: 'rgba(230, 237, 243, 0.74)',
    fontSize: 8,
    lineHeight: 10,
    fontWeight: '800',
    letterSpacing: 0.25,
    includeFontPadding: false,
  },
  setupState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 14,
  },
  setupIcon: {
    width: 42,
    height: 42,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: GOLD_RAIL.instrument,
    backgroundColor: 'rgba(212, 160, 23, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  setupTitle: {
    color: TACTICAL.amber,
    fontSize: 12,
    lineHeight: 14,
    fontWeight: '900',
    letterSpacing: 0.8,
    includeFontPadding: false,
    textAlign: 'center',
    textTransform: 'uppercase',
  },
  setupText: {
    color: 'rgba(230, 237, 243, 0.76)',
    fontSize: 10,
    lineHeight: 13,
    fontWeight: '800',
    includeFontPadding: false,
    textAlign: 'center',
  },
  setupMissing: {
    color: TACTICAL.textMuted,
    fontSize: 8,
    lineHeight: 10,
    fontWeight: '800',
    letterSpacing: 0.4,
    includeFontPadding: false,
    textAlign: 'center',
  },
});
