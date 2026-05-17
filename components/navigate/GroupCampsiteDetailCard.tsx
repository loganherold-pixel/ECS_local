import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeIcon as Ionicons } from '../SafeIcon';
import { TACTICAL, TYPO } from '../../lib/theme';
import type {
  CampSiteGroupMembershipResponse,
  CampSiteGroupResponse,
  GroupCampSiteItem,
} from '../../lib/campsites/campsiteGroupSharingService';

interface Props {
  group: CampSiteGroupResponse;
  members: CampSiteGroupMembershipResponse[];
  sharedCampsites: GroupCampSiteItem[];
  onRemoveShare?: (shareId: string) => void;
  canManage?: boolean;
}

function labelFromValue(value: string | null | undefined): string {
  if (!value) return 'Unknown';
  return value.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

export default function GroupCampsiteDetailCard({
  group,
  members,
  sharedCampsites,
  onRemoveShare,
  canManage = false,
}: Props) {
  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View>
          <Text style={styles.eyebrow}>MY GROUP CAMPSITES</Text>
          <Text style={styles.title}>{group.name}</Text>
        </View>
        <View style={styles.badge}>
          <Ionicons name="people-outline" size={13} color={TACTICAL.amber} />
          <Text style={styles.badgeText}>{members.length} MEMBERS</Text>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Members</Text>
        {members.length > 0 ? (
          members.map((member) => (
            <View key={member.id} style={styles.row}>
              <Text style={styles.rowText}>{member.user_id}</Text>
              <Text style={styles.rowMeta}>{labelFromValue(member.role)}</Text>
            </View>
          ))
        ) : (
          <Text style={styles.emptyText}>No active members.</Text>
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Shared Campsites</Text>
        {sharedCampsites.length > 0 ? (
          sharedCampsites.map((item) => {
            const target = item.camp_site ?? item.report;
            if (!target) return null;
            return (
              <View key={item.share.id} style={styles.shareRow}>
                <View style={styles.shareTextBlock}>
                  <Text style={styles.rowText}>
                    {item.camp_site?.canonical_name ?? item.report?.notes ?? 'Group campsite'}
                  </Text>
                  <Text style={styles.rowMeta}>
                    {target.latitude.toFixed(5)}, {target.longitude.toFixed(5)} -{' '}
                    {labelFromValue(target.access_difficulty)}
                  </Text>
                </View>
                {canManage && onRemoveShare ? (
                  <TouchableOpacity
                    style={styles.removeButton}
                    onPress={() => onRemoveShare(item.share.id)}
                    activeOpacity={0.84}
                  >
                    <Ionicons name="trash-outline" size={14} color={TACTICAL.danger} />
                    <Text style={styles.removeButtonText}>REMOVE</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            );
          })
        ) : (
          <Text style={styles.emptyText}>No campsites shared with this group yet.</Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: 'rgba(9,16,20,0.94)',
    padding: 12,
    gap: 12,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
  },
  eyebrow: {
    ...TYPO.U2,
    color: TACTICAL.textMuted,
    fontSize: 8,
    letterSpacing: 1,
  },
  title: {
    ...TYPO.T3,
    color: TACTICAL.text,
    fontSize: 16,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(196,138,44,0.28)',
    paddingHorizontal: 8,
    height: 26,
  },
  badgeText: {
    ...TYPO.U2,
    color: TACTICAL.amber,
    fontSize: 8,
  },
  section: {
    gap: 7,
  },
  sectionTitle: {
    ...TYPO.U2,
    color: TACTICAL.textMuted,
    fontSize: 9,
    letterSpacing: 1,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  shareRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  shareTextBlock: {
    flex: 1,
    gap: 2,
  },
  rowText: {
    ...TYPO.B2,
    color: TACTICAL.text,
    fontSize: 11,
  },
  rowMeta: {
    ...TYPO.B2,
    color: TACTICAL.textMuted,
    fontSize: 10,
  },
  emptyText: {
    ...TYPO.B2,
    color: TACTICAL.textMuted,
    fontSize: 11,
  },
  removeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,99,99,0.24)',
    paddingHorizontal: 8,
    height: 28,
  },
  removeButtonText: {
    ...TYPO.U2,
    color: TACTICAL.danger,
    fontSize: 8,
  },
});
