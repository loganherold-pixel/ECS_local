import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { SafeIcon as Ionicons } from '../SafeIcon';
import {
  campsiteRecommendationService,
  type CampSitePhotoResponse,
  type CampSiteReportResponse,
  type PublicCampSite,
} from '../../lib/campsites/campsiteRecommendationService';
import { formatCommunityCampsiteValue } from '../../lib/campsites/communityCampsiteMapLayer';
import {
  DEFAULT_COMMUNITY_CAMPSITES_ROLLOUT_CONFIG,
  isCommunityCampsitesFeatureEnabled,
} from '../../lib/communityCampsitesRolloutConfig';

type Colors = {
  bgCard: string;
  border: string;
  gold: string;
  goldBorder: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  warning: string;
  success: string;
  error?: string;
};

type Props = {
  colors: Colors;
  onToast?: (message: string) => void;
};

function formatDate(value: string | null | undefined): string {
  if (!value) return 'Unknown';
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return value;
  return new Date(parsed).toLocaleString();
}

function formatBool(value: boolean): string {
  return value ? 'Yes' : 'No';
}

function formatVehicleFit(values: string[]): string {
  return values.length > 0 ? values.map(formatCommunityCampsiteValue).join(', ') : 'Unknown';
}

function nearbyBounds(report: CampSiteReportResponse) {
  const delta = 0.08;
  return {
    minLat: report.latitude - delta,
    maxLat: report.latitude + delta,
    minLng: report.longitude - delta,
    maxLng: report.longitude + delta,
    limit: 12,
  };
}

export default function CampsiteRecommendationsReview({ colors, onToast }: Props) {
  const moderationEnabled = isCommunityCampsitesFeatureEnabled(
    DEFAULT_COMMUNITY_CAMPSITES_ROLLOUT_CONFIG,
    'campsiteModerationEnabled',
  );
  const [reports, setReports] = useState<CampSiteReportResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyReportId, setBusyReportId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rejectReasonByReportId, setRejectReasonByReportId] = useState<Record<string, string>>({});
  const [mergeOptionsByReportId, setMergeOptionsByReportId] = useState<Record<string, PublicCampSite[]>>({});
  const [mergeOpenByReportId, setMergeOpenByReportId] = useState<Record<string, boolean>>({});
  const [photosByReportId, setPhotosByReportId] = useState<Record<string, CampSitePhotoResponse[]>>({});

  const pendingCount = reports.length;
  const title = useMemo(
    () => `Campsite Recommendations Review${pendingCount > 0 ? ` (${pendingCount})` : ''}`,
    [pendingCount],
  );

  const loadQueue = useCallback(async () => {
    setLoading(true);
    setError(null);
    const result = await campsiteRecommendationService.listPendingReports(50);
    setLoading(false);
    if (!result.ok) {
      setReports([]);
      setError(result.error);
      return;
    }
    setReports(result.data);
  }, []);

  useEffect(() => {
    if (!moderationEnabled) return;
    void loadQueue();
  }, [loadQueue, moderationEnabled]);

  useEffect(() => {
    if (!moderationEnabled) return;
    if (reports.length === 0) {
      setPhotosByReportId({});
      return;
    }

    let cancelled = false;
    void Promise.all(
      reports.map(async (report) => {
        const result = await campsiteRecommendationService.listPhotosForReport(report.id);
        return [report.id, result.ok ? result.data : []] as const;
      }),
    ).then((entries) => {
      if (cancelled) return;
      setPhotosByReportId(Object.fromEntries(entries));
    });

    return () => {
      cancelled = true;
    };
  }, [moderationEnabled, reports]);

  const runAction = useCallback(
    async (reportId: string, action: () => Promise<{ ok: boolean; error?: string }>, success: string) => {
      setBusyReportId(reportId);
      const result = await action();
      setBusyReportId(null);
      if (!result.ok) {
        onToast?.(result.error ?? 'Campsite moderation action failed.');
        return;
      }
      onToast?.(success);
      await loadQueue();
    },
    [loadQueue, onToast],
  );

  const approveNew = useCallback(
    (reportId: string) =>
      runAction(
        reportId,
        () => campsiteRecommendationService.approveReport({ reportId }),
        'This campsite is now visible on the ECS Community Campsites layer.',
      ),
    [runAction],
  );

  const reject = useCallback(
    (reportId: string) =>
      runAction(
        reportId,
        () =>
          campsiteRecommendationService.rejectReport(
            reportId,
            rejectReasonByReportId[reportId] ?? null,
          ),
        'Campsite recommendation rejected.',
      ),
    [rejectReasonByReportId, runAction],
  );

  const needsInfo = useCallback(
    (reportId: string) =>
      runAction(
        reportId,
        () => campsiteRecommendationService.markReportNeedsInfo(reportId),
        'Marked needs more info.',
      ),
    [runAction],
  );

  const rejectSensitive = useCallback(
    (reportId: string) =>
      runAction(
        reportId,
        () => campsiteRecommendationService.rejectReport(reportId, 'Sensitive or non-public campsite.'),
        'Sensitive campsite kept unpublished.',
      ),
    [runAction],
  );

  const openMerge = useCallback(
    async (report: CampSiteReportResponse) => {
      setMergeOpenByReportId((prev) => ({ ...prev, [report.id]: !prev[report.id] }));
      if (mergeOptionsByReportId[report.id]) return;
      setBusyReportId(report.id);
      const result = await campsiteRecommendationService.listApprovedCommunityCampsitesByBounds(
        nearbyBounds(report),
      );
      setBusyReportId(null);
      if (!result.ok) {
        onToast?.(result.error);
        return;
      }
      setMergeOptionsByReportId((prev) => ({ ...prev, [report.id]: result.data }));
    },
    [mergeOptionsByReportId, onToast],
  );

  const mergeWithSite = useCallback(
    (reportId: string, campSiteId: string) =>
      runAction(
        reportId,
        () => campsiteRecommendationService.mergeReportIntoCampSite(reportId, campSiteId),
        'Campsite recommendation merged.',
      ),
    [runAction],
  );

  const moderatePhoto = useCallback(
    async (
      reportId: string,
      photoId: string,
      moderation_status: 'approved' | 'rejected',
    ) => {
      setBusyReportId(reportId);
      const result = await campsiteRecommendationService.moderatePhoto({
        photoId,
        moderation_status,
      });
      setBusyReportId(null);
      if (!result.ok) {
        onToast?.(result.error);
        return;
      }
      onToast?.(
        moderation_status === 'approved'
          ? 'Campsite photo approved.'
          : 'Campsite photo rejected.',
      );
      const photos = await campsiteRecommendationService.listPhotosForReport(reportId);
      if (photos.ok) {
        setPhotosByReportId((prev) => ({ ...prev, [reportId]: photos.data }));
      }
    },
    [onToast],
  );

  if (!moderationEnabled) {
    return (
      <View style={styles.wrap}>
        <Text style={[styles.title, { color: colors.textPrimary }]}>
          Campsite Recommendations Review
        </Text>
        <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
          Campsite moderation is paused for this rollout.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <View style={[styles.hero, { backgroundColor: colors.bgCard, borderColor: colors.goldBorder }]}>
        <View style={styles.heroIcon}>
          <Ionicons name="trail-sign-outline" size={20} color={colors.gold} />
        </View>
        <View style={styles.heroText}>
          <Text style={[styles.title, { color: colors.textPrimary }]}>Campsite Recommendations Review</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            Review pending community campsite submissions before they appear on the ECS community map.
          </Text>
        </View>
        <TouchableOpacity style={[styles.refreshButton, { borderColor: colors.goldBorder }]} onPress={loadQueue}>
          <Ionicons name="refresh-outline" size={16} color={colors.gold} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={[styles.emptyCard, { borderColor: colors.border, backgroundColor: colors.bgCard }]}>
          <ActivityIndicator size="small" color={colors.gold} />
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>Loading review queue...</Text>
        </View>
      ) : error ? (
        <View style={[styles.emptyCard, { borderColor: colors.border, backgroundColor: colors.bgCard }]}>
          <Ionicons name="lock-closed-outline" size={24} color={colors.warning} />
          <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>Admin access required</Text>
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>{error}</Text>
        </View>
      ) : reports.length === 0 ? (
        <View style={[styles.emptyCard, { borderColor: colors.border, backgroundColor: colors.bgCard }]}>
          <Ionicons name="checkmark-circle-outline" size={24} color={colors.success} />
          <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>No pending recommendations</Text>
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
            New community campsite submissions will appear here for review.
          </Text>
        </View>
      ) : (
        reports.map((report) => (
          <View key={report.id} style={[styles.reportCard, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
            <View style={styles.reportHeader}>
              <View style={styles.reportTitleWrap}>
                <Text style={[styles.reportTitle, { color: colors.textPrimary }]}>
                  {formatCommunityCampsiteValue(report.site_type)}
                </Text>
                <Text style={[styles.reportMeta, { color: colors.textMuted }]}>
                  Submitted {formatDate(report.created_at)}
                </Text>
              </View>
              <View style={[styles.statusPill, { borderColor: colors.goldBorder }]}>
                <Text style={[styles.statusText, { color: colors.gold }]}>PENDING</Text>
              </View>
            </View>

            <View style={styles.detailGrid}>
              <Detail label="Coordinates" value={`${report.latitude.toFixed(5)}, ${report.longitude.toFixed(5)}`} colors={colors} />
              <Detail label="Source" value={formatCommunityCampsiteValue(report.source_type)} colors={colors} />
              <Detail label="Visited" value={formatDate(report.visited_at)} colors={colors} />
              <Detail label="Stayed Here" value={formatBool(report.user_stayed_here)} colors={colors} />
              <Detail label="Verified In Person" value={formatBool(report.verified_in_person)} colors={colors} />
              <Detail label="Access" value={formatCommunityCampsiteValue(report.access_difficulty)} colors={colors} />
              <Detail label="Vehicle Fit" value={formatVehicleFit(report.vehicle_fit)} colors={colors} wide />
              <Detail label="Stewardship Ack" value={formatBool(report.stewardship_acknowledged)} colors={colors} />
              <Detail label="Sensitive Area Ack" value={formatBool(report.sensitive_area_acknowledged)} colors={colors} />
            </View>

            <View style={[styles.mapPreview, { borderColor: colors.goldBorder }]}>
              <Ionicons name="map-outline" size={16} color={colors.gold} />
              <Text style={[styles.mapPreviewText, { color: colors.textSecondary }]}>
                Map preview: {report.latitude.toFixed(4)}, {report.longitude.toFixed(4)}
              </Text>
            </View>

            {report.notes ? (
              <View style={[styles.notesBox, { borderColor: colors.border }]}>
                <Text style={[styles.detailLabel, { color: colors.textMuted }]}>Notes</Text>
                <Text style={[styles.notesText, { color: colors.textPrimary }]}>{report.notes}</Text>
              </View>
            ) : null}

            {(photosByReportId[report.id] ?? []).length > 0 ? (
              <View style={[styles.notesBox, { borderColor: colors.border }]}>
                <Text style={[styles.detailLabel, { color: colors.textMuted }]}>Photo Preview</Text>
                <View style={styles.photoPreviewRow}>
                  {(photosByReportId[report.id] ?? []).map((photo) => (
                    <View key={photo.id} style={[styles.photoPreviewTile, { borderColor: colors.border }]}>
                      <Image
                        source={{ uri: photo.thumbnail_url ?? photo.storage_url }}
                        style={styles.photoPreviewImage}
                        resizeMode="cover"
                      />
                      <Text style={[styles.photoPreviewText, { color: colors.textSecondary }]}>
                        {photo.moderation_status.toUpperCase()}
                      </Text>
                      <Text style={[styles.photoPreviewMeta, { color: colors.textMuted }]}>
                        EXIF stripped: {photo.exif_stripped ? 'Yes' : 'No'}
                      </Text>
                      {photo.moderation_status === 'pending' ? (
                        <View style={styles.photoActionRow}>
                          <TouchableOpacity
                            style={[styles.photoActionButton, { borderColor: colors.goldBorder }]}
                            onPress={() => moderatePhoto(report.id, photo.id, 'approved')}
                            disabled={busyReportId === report.id}
                            activeOpacity={0.84}
                          >
                            <Text style={[styles.photoActionText, { color: colors.gold }]}>APPROVE</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[styles.photoActionButton, styles.photoActionButtonDanger]}
                            onPress={() => moderatePhoto(report.id, photo.id, 'rejected')}
                            disabled={busyReportId === report.id}
                            activeOpacity={0.84}
                          >
                            <Text style={[styles.photoActionText, styles.photoActionTextDanger]}>REJECT</Text>
                          </TouchableOpacity>
                        </View>
                      ) : null}
                    </View>
                  ))}
                </View>
              </View>
            ) : null}

            <TextInput
              style={[styles.reasonInput, { borderColor: colors.border, color: colors.textPrimary }]}
              value={rejectReasonByReportId[report.id] ?? ''}
              onChangeText={(text) =>
                setRejectReasonByReportId((prev) => ({ ...prev, [report.id]: text }))
              }
              placeholder="Optional internal rejection / needs-info note"
              placeholderTextColor={colors.textMuted}
            />

            <View style={styles.actions}>
              <Action label="Approve as new campsite" icon="checkmark-circle-outline" colors={colors} busy={busyReportId === report.id} onPress={() => approveNew(report.id)} />
              <Action label="Merge with existing campsite" icon="git-merge-outline" colors={colors} busy={busyReportId === report.id} onPress={() => openMerge(report)} />
              <Action label="Needs more info" icon="help-circle-outline" colors={colors} busy={busyReportId === report.id} onPress={() => needsInfo(report.id)} />
              <Action label="Reject" icon="close-circle-outline" colors={colors} danger busy={busyReportId === report.id} onPress={() => reject(report.id)} />
              <Action label="Hide / mark sensitive" icon="eye-off-outline" colors={colors} danger busy={busyReportId === report.id} onPress={() => rejectSensitive(report.id)} />
            </View>

            {mergeOpenByReportId[report.id] ? (
              <View style={[styles.mergePanel, { borderColor: colors.goldBorder }]}>
                <Text style={[styles.mergeTitle, { color: colors.gold }]}>Nearby reviewed campsites</Text>
                {(mergeOptionsByReportId[report.id] ?? []).length === 0 ? (
                  <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                    No reviewed campsite candidates found near this report.
                  </Text>
                ) : (
                  mergeOptionsByReportId[report.id].map((site) => (
                    <TouchableOpacity
                      key={site.id}
                      style={[styles.mergeOption, { borderColor: colors.border }]}
                      onPress={() => mergeWithSite(report.id, site.id)}
                      activeOpacity={0.86}
                    >
                      <View style={styles.mergeOptionText}>
                        <Text style={[styles.mergeOptionTitle, { color: colors.textPrimary }]}>
                          {site.canonical_name ?? 'Reviewed campsite'}
                        </Text>
                        <Text style={[styles.reportMeta, { color: colors.textMuted }]}>
                          {site.latitude.toFixed(5)}, {site.longitude.toFixed(5)} - Trust {Math.round(site.trust_score)}/100
                        </Text>
                      </View>
                      <Ionicons name="git-merge-outline" size={16} color={colors.gold} />
                    </TouchableOpacity>
                  ))
                )}
              </View>
            ) : null}
          </View>
        ))
      )}
    </View>
  );
}

function Detail({
  label,
  value,
  colors,
  wide = false,
}: {
  label: string;
  value: string;
  colors: Colors;
  wide?: boolean;
}) {
  return (
    <View style={[styles.detailTile, wide && styles.detailTileWide, { borderColor: colors.border }]}>
      <Text style={[styles.detailLabel, { color: colors.textMuted }]}>{label}</Text>
      <Text style={[styles.detailValue, { color: colors.textPrimary }]}>{value}</Text>
    </View>
  );
}

function Action({
  label,
  icon,
  colors,
  onPress,
  busy = false,
  danger = false,
}: {
  label: string;
  icon: string;
  colors: Colors;
  onPress: () => void;
  busy?: boolean;
  danger?: boolean;
}) {
  const dangerColor = colors.error ?? colors.warning;
  return (
    <TouchableOpacity
      style={[
        styles.actionButton,
        {
          borderColor: danger ? `${dangerColor}55` : colors.goldBorder,
          backgroundColor: danger ? `${dangerColor}12` : `${colors.gold}14`,
          opacity: busy ? 0.56 : 1,
        },
      ]}
      disabled={busy}
      onPress={onPress}
      activeOpacity={0.86}
    >
      <Ionicons name={icon as any} size={14} color={danger ? dangerColor : colors.gold} />
      <Text style={[styles.actionText, { color: danger ? dangerColor : colors.gold }]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 12,
  },
  hero: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  heroIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(196,138,44,0.10)',
  },
  heroText: {
    flex: 1,
    gap: 3,
  },
  title: {
    fontSize: 18,
    fontWeight: '900',
  },
  subtitle: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '600',
  },
  refreshButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 18,
    alignItems: 'center',
    gap: 8,
  },
  emptyTitle: {
    fontSize: 14,
    fontWeight: '900',
  },
  emptyText: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '600',
    textAlign: 'center',
  },
  reportCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 12,
    gap: 10,
  },
  reportHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  reportTitleWrap: {
    flex: 1,
    gap: 3,
  },
  reportTitle: {
    fontSize: 15,
    fontWeight: '900',
  },
  reportMeta: {
    fontSize: 10.5,
    lineHeight: 15,
    fontWeight: '700',
  },
  statusPill: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  statusText: {
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 1,
  },
  detailGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  detailTile: {
    flexBasis: '48%',
    flexGrow: 1,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 9,
    paddingVertical: 7,
    backgroundColor: 'rgba(255,255,255,0.035)',
    gap: 3,
  },
  detailTileWide: {
    flexBasis: '100%',
  },
  detailLabel: {
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  detailValue: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '700',
  },
  mapPreview: {
    minHeight: 42,
    borderRadius: 12,
    borderWidth: 1,
    backgroundColor: 'rgba(196,138,44,0.07)',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    gap: 8,
  },
  mapPreviewText: {
    flex: 1,
    fontSize: 11,
    fontWeight: '700',
  },
  notesBox: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 10,
    backgroundColor: 'rgba(255,255,255,0.03)',
    gap: 4,
  },
  notesText: {
    fontSize: 11,
    lineHeight: 16,
    fontWeight: '600',
  },
  photoPreviewRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  photoPreviewTile: {
    width: 118,
    minHeight: 112,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    padding: 8,
    backgroundColor: 'rgba(0,0,0,0.12)',
  },
  photoPreviewImage: {
    width: 96,
    height: 58,
    borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.18)',
  },
  photoPreviewText: {
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  photoPreviewMeta: {
    fontSize: 9,
    fontWeight: '700',
    textAlign: 'center',
  },
  photoActionRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 4,
  },
  photoActionButton: {
    minHeight: 24,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 7,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(196,138,44,0.08)',
  },
  photoActionButtonDanger: {
    borderColor: 'rgba(239,83,80,0.32)',
    backgroundColor: 'rgba(239,83,80,0.09)',
  },
  photoActionText: {
    fontSize: 7,
    fontWeight: '900',
    letterSpacing: 0.7,
  },
  photoActionTextDanger: {
    color: '#FF9A8A',
  },
  reasonInput: {
    minHeight: 42,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 10,
    fontSize: 12,
    backgroundColor: 'rgba(255,255,255,0.035)',
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  actionButton: {
    minHeight: 34,
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 10,
    flexGrow: 1,
  },
  actionText: {
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  mergePanel: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 10,
    gap: 8,
    backgroundColor: 'rgba(196,138,44,0.06)',
  },
  mergeTitle: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  mergeOption: {
    minHeight: 46,
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: 'rgba(255,255,255,0.035)',
  },
  mergeOptionText: {
    flex: 1,
    gap: 2,
  },
  mergeOptionTitle: {
    fontSize: 12,
    fontWeight: '900',
  },
});
