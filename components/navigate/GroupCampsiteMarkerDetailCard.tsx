import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { SafeIcon as Ionicons } from '../SafeIcon';
import type { GroupCampSiteItem } from '../../lib/campsites/campsiteGroupSharingService';
import { getGroupCampsiteTarget } from '../../lib/campsites/groupCampsiteMapLayer';
import { formatCommunityCampsiteValue } from '../../lib/campsites/communityCampsiteMapLayer';
import { TACTICAL, TYPO } from '../../lib/theme';

type Props = {
  visible: boolean;
  item: GroupCampSiteItem | null;
  groupName?: string | null;
  topOffset: number;
  bottomOffset: number;
  rightInset: number;
  maxWidth?: number;
  onNavigateHere?: () => void;
  onOpenGroup: () => void;
  onRemoveShare?: () => void;
  onDismiss: () => void;
};

function titleForItem(item: GroupCampSiteItem): string {
  if (item.camp_site?.canonical_name) return item.camp_site.canonical_name;
  if (item.report?.notes) return item.report.notes.split(/[.!?]/)[0]?.slice(0, 44) || 'Group Campsite';
  return 'Group Campsite';
}

function joinList(values: unknown): string {
  if (!Array.isArray(values) || values.length === 0) return 'Unknown';
  return values.map((value) => formatCommunityCampsiteValue(String(value))).join(', ');
}

export default function GroupCampsiteMarkerDetailCard({
  visible,
  item,
  groupName,
  topOffset,
  bottomOffset,
  rightInset,
  maxWidth,
  onNavigateHere,
  onOpenGroup,
  onRemoveShare,
  onDismiss,
}: Props) {
  if (!visible || !item) return null;
  const target = getGroupCampsiteTarget(item);
  if (!target) return null;

  return (
    <View
      pointerEvents="box-none"
      style={[
        styles.wrap,
        {
          top: topOffset + 12,
          bottom: bottomOffset + 12,
          left: 12,
          right: rightInset + 12,
          maxWidth: maxWidth ?? undefined,
        },
      ]}
    >
      <View style={styles.card}>
        <View style={styles.header}>
          <View style={styles.headerIcon}>
            <Ionicons name="people-outline" size={17} color={TACTICAL.amber} />
          </View>
          <View style={styles.headerText}>
            <Text style={styles.eyebrow}>GROUP CAMPSITE</Text>
            <Text style={styles.title}>{titleForItem(item)}</Text>
          </View>
          <TouchableOpacity style={styles.closeButton} onPress={onDismiss} activeOpacity={0.84}>
            <Ionicons name="close" size={16} color={TACTICAL.textMuted} />
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
          <View style={styles.groupBadge}>
            <Text style={styles.groupBadgeText}>{groupName ?? 'Private group'}</Text>
          </View>
          <View style={styles.grid}>
            <Info label="Coordinates" value={`${target.latitude.toFixed(5)}, ${target.longitude.toFixed(5)}`} wide />
            <Info label="Site Type" value={formatCommunityCampsiteValue(target.site_type)} />
            <Info label="Access" value={formatCommunityCampsiteValue(target.access_difficulty)} />
            <Info label="Vehicle Fit" value={joinList(target.vehicle_fit)} wide />
            <Info
              label="Source"
              value={item.camp_site ? 'Approved community campsite' : formatCommunityCampsiteValue(item.report?.source_type)}
              wide
            />
          </View>
        </ScrollView>

        <View style={styles.actions}>
          <Action icon="navigate-outline" label="Navigate" onPress={onNavigateHere} />
          <Action icon="people-outline" label="Open group" onPress={onOpenGroup} />
          <Action icon="remove-circle-outline" label="Remove share" onPress={onRemoveShare} danger />
        </View>
      </View>
    </View>
  );
}

function Info({ label, value, wide = false }: { label: string; value: string; wide?: boolean }) {
  return (
    <View style={[styles.infoTile, wide && styles.infoTileWide]}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

function Action({
  icon,
  label,
  onPress,
  danger = false,
}: {
  icon: string;
  label: string;
  onPress?: () => void;
  danger?: boolean;
}) {
  return (
    <TouchableOpacity
      style={[styles.actionButton, danger && styles.actionButtonDanger, !onPress && styles.actionButtonDisabled]}
      onPress={onPress}
      disabled={!onPress}
      activeOpacity={0.86}
    >
      <Ionicons
        name={icon as any}
        size={14}
        color={!onPress ? TACTICAL.textMuted : danger ? '#FF9A8A' : TACTICAL.amber}
      />
      <Text style={[styles.actionText, danger && styles.actionTextDanger, !onPress && styles.actionTextDisabled]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    zIndex: 140,
    elevation: 140,
    pointerEvents: 'box-none',
  },
  card: {
    flex: 1,
    minHeight: 0,
    maxHeight: '100%',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(94,161,255,0.28)',
    backgroundColor: 'rgba(8,12,15,0.985)',
    overflow: 'hidden',
  },
  header: {
    minHeight: 58,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(94,161,255,0.18)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: 'rgba(196,138,44,0.28)',
    backgroundColor: 'rgba(196,138,44,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: {
    flex: 1,
    gap: 2,
  },
  eyebrow: {
    ...TYPO.U2,
    color: '#5EA1FF',
    fontSize: 8,
    letterSpacing: 1.1,
  },
  title: {
    ...TYPO.T2,
    color: TACTICAL.text,
    fontSize: 14,
    lineHeight: 18,
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  body: {
    flex: 1,
    minHeight: 0,
  },
  bodyContent: {
    padding: 12,
    gap: 10,
  },
  groupBadge: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(94,161,255,0.24)',
    backgroundColor: 'rgba(94,161,255,0.08)',
    padding: 10,
  },
  groupBadgeText: {
    ...TYPO.U2,
    color: '#5EA1FF',
    fontSize: 8,
    letterSpacing: 0.9,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  infoTile: {
    flexBasis: '48%',
    flexGrow: 1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.035)',
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 3,
  },
  infoTileWide: {
    flexBasis: '100%',
  },
  infoLabel: {
    ...TYPO.U2,
    color: TACTICAL.textMuted,
    fontSize: 7.5,
    letterSpacing: 0.85,
  },
  infoValue: {
    ...TYPO.B2,
    color: TACTICAL.text,
    fontSize: 10.5,
    lineHeight: 15,
  },
  actions: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
    padding: 10,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  actionButton: {
    minHeight: 36,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(196,138,44,0.22)',
    backgroundColor: 'rgba(196,138,44,0.08)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 10,
    flexGrow: 1,
  },
  actionButtonDanger: {
    borderColor: 'rgba(255,154,138,0.24)',
    backgroundColor: 'rgba(255,154,138,0.07)',
  },
  actionButtonDisabled: {
    opacity: 0.52,
  },
  actionText: {
    ...TYPO.U2,
    color: TACTICAL.amber,
    fontSize: 8,
    letterSpacing: 0.75,
  },
  actionTextDanger: {
    color: '#FF9A8A',
  },
  actionTextDisabled: {
    color: TACTICAL.textMuted,
  },
});
