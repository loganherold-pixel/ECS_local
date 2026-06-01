import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { SafeIcon as Ionicons } from '../SafeIcon';
import type { CampSiteReportResponse } from '../../lib/campsites/campsiteRecommendationService';
import type { CampSiteReviewQueueItem } from '../../lib/campsites/campsiteReviewService';
import type { CampsiteVisibilityLayerScope } from '../../lib/campsites/campsiteVisibilityMapLayers';
import { PENDING_REVIEW_PUBLIC_LABEL } from '../../lib/campsites/campsiteVisibilityMapLayers';
import { formatCommunityCampsiteValue } from '../../lib/campsites/communityCampsiteMapLayer';
import { TACTICAL, TYPO } from '../../lib/theme';

type ReportLike = CampSiteReportResponse | CampSiteReviewQueueItem;

type Props = {
  visible: boolean;
  report: ReportLike | null;
  scope: Exclude<CampsiteVisibilityLayerScope, 'community' | 'group'> | null;
  topOffset: number;
  bottomOffset: number;
  rightInset: number;
  maxWidth?: number;
  onNavigateHere?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onShare?: () => void;
  onSubmitToCommunity?: () => void;
  onWithdraw?: () => void;
  onOpenReview?: () => void;
  onDismiss: () => void;
};

function formatDate(value: string | null | undefined): string {
  if (!value) return 'Unknown';
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return value;
  return new Date(parsed).toLocaleDateString();
}

function joinList(values: unknown): string {
  if (!Array.isArray(values) || values.length === 0) return 'Unknown';
  return values.map((value) => formatCommunityCampsiteValue(String(value))).join(', ');
}

function titleForScope(scope: Props['scope']): string {
  if (scope === 'private') return 'PRIVATE CAMPSITE';
  if (scope === 'reviewer_pending') return 'REVIEWER PENDING';
  return 'PENDING COMMUNITY SUBMISSION';
}

function statusForReport(report: ReportLike, scope: Props['scope']): string {
  if (scope === 'private') return 'Private save';
  if (scope === 'reviewer_pending') return 'Community review';
  if (report.review_state === 'needs_submitter_info') return 'Needs info - not public';
  return PENDING_REVIEW_PUBLIC_LABEL;
}

export default function CampsiteVisibilityDetailCard({
  visible,
  report,
  scope,
  topOffset,
  bottomOffset,
  rightInset,
  maxWidth,
  onNavigateHere,
  onEdit,
  onDelete,
  onShare,
  onSubmitToCommunity,
  onWithdraw,
  onOpenReview,
  onDismiss,
}: Props) {
  if (!visible || !report || !scope) return null;

  const status = statusForReport(report, scope);

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
            <Ionicons
              name={scope === 'private' ? 'lock-closed-outline' : 'time-outline'}
              size={17}
              color={TACTICAL.amber}
            />
          </View>
          <View style={styles.headerText}>
            <Text style={styles.eyebrow}>{titleForScope(scope)}</Text>
            <Text style={styles.title}>{status}</Text>
          </View>
          <TouchableOpacity style={styles.closeButton} onPress={onDismiss} activeOpacity={0.84}>
            <Ionicons name="close" size={16} color={TACTICAL.textMuted} />
          </TouchableOpacity>
        </View>

        <ScrollView
          style={styles.body}
          contentContainerStyle={styles.bodyContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.statusCard}>
            <Text style={styles.statusText}>{status}</Text>
          </View>
          <View style={styles.grid}>
            <Info label="Coordinates" value={`${report.latitude.toFixed(5)}, ${report.longitude.toFixed(5)}`} wide />
            <Info label="Site Type" value={formatCommunityCampsiteValue(report.site_type)} />
            <Info label="Access" value={formatCommunityCampsiteValue(report.access_difficulty)} />
            <Info label="Vehicle Fit" value={joinList(report.vehicle_fit)} wide />
            <Info label="Source" value={formatCommunityCampsiteValue(report.source_type)} />
            <Info label="Visited" value={formatDate(report.visited_at)} />
            <Info label="Review State" value={formatCommunityCampsiteValue(report.review_state ?? report.moderation_status)} wide />
          </View>

          {report.notes ? (
            <View style={styles.notesCard}>
              <Text style={styles.infoLabel}>Notes</Text>
              <Text style={styles.notesText}>{report.notes}</Text>
            </View>
          ) : null}
        </ScrollView>

        <View style={styles.actions}>
          <Action icon="navigate-outline" label="Navigate" onPress={onNavigateHere} />
          {scope === 'private' ? (
            <>
              <Action icon="create-outline" label="Edit" onPress={onEdit} />
              <Action icon="people-outline" label="Share" onPress={onShare} />
              <Action icon="trail-sign-outline" label="Submit to community" onPress={onSubmitToCommunity} />
              <Action icon="trash-outline" label="Delete" onPress={onDelete} danger />
            </>
          ) : scope === 'pending' ? (
            <>
              <Action icon="create-outline" label="Edit" onPress={onEdit} />
              <Action icon="close-circle-outline" label="Withdraw" onPress={onWithdraw} danger />
            </>
          ) : (
            <Action icon="clipboard-outline" label="Open review" onPress={onOpenReview} />
          )}
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
    borderColor: 'rgba(196,138,44,0.28)',
    backgroundColor: 'rgba(8,12,15,0.985)',
    overflow: 'hidden',
  },
  header: {
    minHeight: 58,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(196,138,44,0.18)',
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
    color: TACTICAL.amber,
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
  statusCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(196,138,44,0.2)',
    backgroundColor: 'rgba(196,138,44,0.08)',
    padding: 10,
  },
  statusText: {
    ...TYPO.B2,
    color: TACTICAL.text,
    fontSize: 10.5,
    lineHeight: 15,
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
  notesCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(196,138,44,0.18)',
    backgroundColor: 'rgba(196,138,44,0.06)',
    padding: 10,
    gap: 4,
  },
  notesText: {
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
