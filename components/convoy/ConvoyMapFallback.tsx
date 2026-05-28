import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useTheme } from '../../context/ThemeContext';
import { ECSButton } from '../ECSButton';
import type {
  ConvoyMapVehicle,
  ConvoyRealtimeConnectionStatus,
} from '../../lib/convoy/convoyRealtimeService';
import {
  buildConvoyMarkerIdentities,
  type ConvoyMarkerIdentity,
} from '../../lib/convoy/convoyMarkerIdentity';

interface ConvoyMapFallbackProps {
  members: ConvoyMapVehicle[];
  connectionStatus: ConvoyRealtimeConnectionStatus;
  reason?: string;
  onSelectMember?: (member: ConvoyMapVehicle) => void;
  selectedMemberId?: string | null;
  markerIdentities?: ConvoyMarkerIdentity[];
}

function formatMemberStatus(identity: ConvoyMarkerIdentity): string {
  if (identity.status === 'needs_assistance') return 'Needs assistance';
  if (identity.status === 'stale') return identity.ageLabel ? `Location stale ${identity.ageLabel}` : 'Location stale';
  if (identity.status === 'offline') return 'Member offline';
  return identity.status === 'unknown' ? 'Location received' : identity.status;
}

export function ConvoyMapFallback({
  members,
  connectionStatus,
  reason = 'Mapbox is not ready for this build.',
  onSelectMember,
  selectedMemberId,
  markerIdentities,
}: ConvoyMapFallbackProps) {
  const { palette } = useTheme();
  const hasMembers = members.length > 0;
  const identities = markerIdentities ?? buildConvoyMarkerIdentities(members);
  const identityByMember = new Map(identities.map((identity) => [identity.memberId, identity]));

  return (
    <View
      style={[styles.container, { backgroundColor: palette.panel, borderColor: palette.border }]}
      accessible
      accessibilityRole="summary"
      accessibilityLabel={`Convoy map fallback. ${reason} ${members.length} live members listed.`}
    >
      <View style={styles.header}>
        <View>
          <Text style={[styles.eyebrow, { color: palette.amber }]}>CONVOY COMMAND</Text>
          <Text style={[styles.title, { color: palette.text }]}>Command surface unavailable</Text>
        </View>
        <View style={[styles.statusPill, { borderColor: palette.borderFocus, backgroundColor: palette.bg }]}>
          <Text style={[styles.statusText, { color: palette.textMuted }]}>{connectionStatus}</Text>
        </View>
      </View>

      <Text style={[styles.reason, { color: palette.textMuted }]}>
        {reason} ECS will use the shared Mapbox runtime token when available; native Mapbox still requires a dev or release build with `@rnmapbox/maps` enabled.
      </Text>

      {!hasMembers ? (
        <View style={[styles.emptyState, { borderColor: palette.border, backgroundColor: palette.bg }]}>
          <Text style={[styles.emptyTitle, { color: palette.text }]}>No live convoy locations yet.</Text>
          <Text style={[styles.emptyBody, { color: palette.textMuted }]}>
            Members will appear after location sharing is enabled and the first update reaches ECS.
          </Text>
        </View>
      ) : (
        <View style={styles.memberList} accessibilityLabel="Convoy member location list">
          {members.map((member) => {
            const identity = identityByMember.get(member.memberId) ?? buildConvoyMarkerIdentities([member])[0];
            const selected = selectedMemberId === member.memberId;
            const alert = identity.status === 'needs_assistance';
            return (
              <ECSButton
                key={member.memberId}
                label={`${identity.label} · ${identity.role} · ${formatMemberStatus(identity)}`}
                size="compact"
                variant={selected ? 'active' : alert ? 'destructive' : 'secondary'}
                onPress={() => onSelectMember?.(member)}
                accessibilityLabel={`${identity.label}, ${identity.role}, ${formatMemberStatus(identity)}`}
                style={styles.memberButton}
                numberOfLines={1}
              />
            );
          })}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderWidth: 1,
    borderRadius: 8,
    minHeight: 280,
    padding: 14,
    gap: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  eyebrow: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.1,
  },
  title: {
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 0,
    marginTop: 2,
  },
  statusPill: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  statusText: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  reason: {
    fontSize: 12,
    lineHeight: 17,
    letterSpacing: 0,
  },
  emptyState: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    gap: 4,
  },
  emptyTitle: {
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 0,
  },
  emptyBody: {
    fontSize: 11,
    lineHeight: 16,
    letterSpacing: 0,
  },
  memberList: {
    gap: 8,
  },
  memberButton: {
    alignSelf: 'stretch',
    justifyContent: 'flex-start',
  },
});

export default ConvoyMapFallback;
